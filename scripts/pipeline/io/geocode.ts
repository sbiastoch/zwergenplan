/**
 * Nominatim-Geocoding für neue Orte im Katalog (Plan 0050, E5), nach der Usage Policy: höchstens 4 Anfragen pro
 * Minute, Ergebnisse gecacht.
 *
 * Reihenfolge je Eingabe: Katalog des Laufs (`known`), `orte` aus dem Zustand der Region, Lauf-Cache
 * (`geocode-v3.json`), dann Nominatim in drei Stufen, jeweils erster Treffer in der bbox der Region:
 *   1. Freitext, 2. strukturiert (`street`, `city`, `postalcode`, `bounded`), 3. benannter Ort (Name und Stadt) mit
 *   erlaubten OSM-Tags. Stufe 2 und 3 nur nach einem Fehlschlag der vorigen.
 * Drei Ausgänge: Treffer, kein Treffer, Ausfall (Netz, 403/429, 5xx). Ein Ausfall wird nie gespeichert; „kein
 * Treffer“ merkt sich der Lauf und der Lauf-Cache 30 Tage, Treffer gelten 12 Monate.
 */
import { z } from "zod";
import { type BBox, haversineMeters, inBounds } from "../../../src/domain/geo.ts";
import { REGION_IDS, REGIONS, type RegionId, territoryStatus } from "../../../src/domain/regions.ts";
import type { Provider } from "../../../src/domain/schema.ts";
import { addDays } from "../../../src/domain/time.ts";
import { normalizeAddress, placeKey } from "../lib/address.ts";
import { Ort } from "../lib/discover-state.ts";
import { defaultCacheDir, readCache, writeCache } from "./cache.ts";
import { fetchJson, withParams } from "./http.ts";

export interface GeoResult {
  lat: number;
  lon: number;
  district?: string;
  /** Adresse aus `addressdetails` („Straße Nr, PLZ Ort“ bzw. „Name, PLZ Ort“), beim Katalog dessen Adresse */
  display: string;
  /** Gemeinde aus `addressdetails` (Plan 0050, S2c); `null`: keine geliefert oder Koordinaten als Eingabe */
  municipality?: string | null;
  county?: string;
  /** Treffer aus dem Katalog: dessen Region statt Gemeinde und Kreis */
  catalogRegion?: RegionId;
}

export type GeoOutcome =
  | {
      kind: "treffer";
      geo: GeoResult;
      /** 0: ohne Anfrage (Katalog, Koordinaten) */
      stufe: 0 | 1 | 2 | 3;
    }
  | { kind: "kein-treffer" }
  | { kind: "ausfall"; grund: string };

interface GeocodeQuery {
  region: RegionId;
  /** Name des Orts (Turnhalle, Bad) für Stufe 3, falls die Adresse keinen nennt; Teil des Cache-Schlüssels */
  venueName?: string;
}

export interface GeocoderOptions {
  /** YYYY-MM-DD, für Alter der Cache-Einträge und `datum` neuer Orte */
  today: string;
  /** Orte des Katalogs im Lauf je Region, Schlüssel `normalizeAddress(adresse).text` (im Eval nach dem Ausblenden) */
  known?: ReadonlyMap<string, readonly GeoResult[]>;
  /** `orte` aus `data/discover/<region>.json`, auch im Trockenlauf und im Eval gelesen */
  orte?: Partial<Record<RegionId, Readonly<Record<string, Ort>>>>;
  /** Standard `~/.cache/zwergenplan` (`io/cache.ts`) */
  cacheDir?: string;
  fetchImpl?: typeof fetch;
  clock?: { now(): number; sleep(ms: number): Promise<void> };
}

export interface Geocoder {
  geocode(address: string, query: GeocodeQuery): Promise<GeoOutcome>;
  /** Treffer aus Nominatim in diesem Lauf, für `orte` der Region */
  newOrte(region: RegionId): Record<string, Ort>;
  stats(): { requests: number; waitMs: number };
}

/** Policy: regelmäßig laufende Skripte höchstens 4 Anfragen pro Minute */
export const MIN_GAP_MS = 15_000;
const HIT_DAYS = 365;
const MISS_DAYS = 30;
const CACHE_FILE = "geocode-v3.json";
const UA = "zwergenplan-pipeline/1.0 (+https://zwergenplan.app/impressum/)";
const URL_SEARCH = "https://nominatim.openstreetmap.org/search";
const COORD = /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/;

/** Stufe 3: benannte Orte ohne Postadresse (OSM `category=type`) */
const NAMED_PLACES = new Set([
  "leisure=sports_centre",
  "leisure=sports_hall",
  "leisure=swimming_pool",
  "amenity=school",
  "amenity=place_of_worship",
  "amenity=community_centre",
  "amenity=kindergarten",
  "amenity=library",
  "building=church",
]);

const Hit = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  name: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  address: z.record(z.string(), z.string()).optional(),
});
type Hit = z.infer<typeof Hit>;

/** Ein Eintrag des Lauf-Caches; ungültige verwirft das Lesen einzeln */
const CacheEntry = z.union([z.strictObject({ treffer: Ort }), z.strictObject({ kein: z.iso.date() })]);
type CacheEntry = z.infer<typeof CacheEntry>;
type RunCache = Partial<Record<string, Record<string, CacheEntry>>>;

function readRunCache(dir: string): RunCache {
  const raw = readCache<unknown>(CACHE_FILE, dir);
  const out: RunCache = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [region, entries] of Object.entries(raw)) {
    if (typeof entries !== "object" || entries === null) continue;
    const valid: Record<string, CacheEntry> = {};
    for (const [key, entry] of Object.entries(entries)) {
      const parsed = CacheEntry.safeParse(entry);
      if (parsed.success) valid[key] = parsed.data;
    }
    out[region] = valid;
  }
  return out;
}

const fresh = (datum: string, today: string, days: number) => addDays(datum, days) > today;
/** vor S2c gespeichert, ohne Gemeinde: neu anfragen (Plan 0050, S2c) */
const usable = (o: Ort, today: string) => o.gemeinde !== undefined && fresh(o.datum, today, HIT_DAYS);

/**
 * Gemeinde vor Ortsteil: `village` nennt auch Ortsteile (Kraftshof in Nürnberg, Wachendorf in Cadolzburg).
 * `municipality` ist im Landkreis oft die Verwaltungsgemeinschaft („Veitsbronn (VGem)“ für Seukendorf), keine Gemeinde.
 */
function municipalityOf(hit: Hit): string | null {
  const a = hit.address ?? {};
  const municipality = a["municipality"]?.endsWith("(VGem)") ? undefined : a["municipality"];
  return a["city"] ?? a["town"] ?? municipality ?? a["village"] ?? null;
}

function addressOf(hit: Hit): string | undefined {
  const a = hit.address ?? {};
  const city = a["city"] ?? a["town"] ?? a["village"] ?? a["municipality"];
  const place = [a["postcode"], city].filter(Boolean).join(" ");
  const road = a["road"] ? [a["road"], a["house_number"]].filter(Boolean).join(" ") : hit.name;
  const text = [road, place].filter(Boolean).join(", ");
  return text || undefined;
}

const toOrt = (hit: Hit, stufe: 1 | 2 | 3, today: string, fallback: string): Ort => {
  const a = hit.address ?? {};
  const district = a["suburb"] ?? a["city_district"] ?? a["quarter"];
  const county = a["county"];
  return {
    lat: hit.lat,
    lon: hit.lon,
    adresse: addressOf(hit) ?? fallback,
    stufe,
    ...(district ? { district } : {}),
    gemeinde: municipalityOf(hit),
    ...(county ? { landkreis: county } : {}),
    datum: today,
  };
};

const toGeo = (o: Ort): GeoResult => ({
  lat: o.lat,
  lon: o.lon,
  display: o.adresse,
  ...(o.district ? { district: o.district } : {}),
  ...(o.gemeinde !== undefined ? { municipality: o.gemeinde } : {}),
  ...(o.landkreis ? { county: o.landkreis } : {}),
});

const viewbox = (b: BBox) => `${b.minLon},${b.maxLat},${b.maxLon},${b.minLat}`;

export function createGeocoder(o: GeocoderOptions): Geocoder {
  const dir = o.cacheDir ?? defaultCacheDir();
  const clock = o.clock ?? { now: () => Date.now(), sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)) };
  const runCache = readRunCache(dir);
  const misses = new Set<string>();
  const found: Partial<Record<RegionId, Record<string, Ort>>> = {};
  let last = Number.NEGATIVE_INFINITY;
  let requests = 0;
  let waitMs = 0;
  // seriell: parallele Kandidaten warten in einer Schlange, der Abstand gilt über alle (E4.7)
  let queue: Promise<unknown> = Promise.resolve();

  async function request(params: Record<string, string | number>): Promise<Hit[]> {
    const wait = last + MIN_GAP_MS - clock.now();
    if (wait > 0) {
      waitMs += wait;
      await clock.sleep(wait);
    }
    last = clock.now();
    requests++;
    const url = withParams(URL_SEARCH, { format: "jsonv2", addressdetails: 1, countrycodes: "de", ...params });
    // keine Wiederholung: jede wäre eine weitere Anfrage; ein Ausfall macht einen Klärfall (E5)
    const body = await fetchJson(url, {
      headers: { "User-Agent": UA },
      retries: 0,
      ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}),
    });
    if (body === undefined) throw new Error(`HTTP 404 für ${URL_SEARCH}`);
    return z.array(Hit).parse(body);
  }

  async function nominatim(address: string, q: GeocodeQuery): Promise<Ort | undefined> {
    const { bbox, name: regionName, territory } = REGIONS[q.region];
    const a = normalizeAddress(address);
    const city = a.city ?? regionName;
    // „Nürnberg-Eibach“: Nominatim kennt nur die Stadt als `city`
    const structuredCity = city.startsWith(`${regionName}-`) ? regionName : city;
    const inRegion = (h: Hit) => inBounds(h, bbox);
    // Plan 0050, S2c: je Stufe gilt der erste Treffer im Gebiet (unbekannte Gemeinde zählt dazu). Liegt einer nur in der
    // bbox (Erlangen für Nürnberg), läuft die nächste Stufe; gilt erst, wenn keine einen im Gebiet findet
    let outside: Ort | undefined;
    const pick = (hits: Hit[], stufe: 1 | 2 | 3, fallback: string): Ort | undefined => {
      const inBox = hits.filter(inRegion);
      const hit = inBox.find(
        (h) =>
          territoryStatus(territory, { municipality: municipalityOf(h), county: h.address?.["county"] }) !== "draussen",
      );
      if (!hit && inBox[0]) outside ??= toOrt(inBox[0], stufe, o.today, fallback);
      return hit && toOrt(hit, stufe, o.today, fallback);
    };
    const asked = new Set<string>();
    const freeText = async (text: string, accept: (h: Hit) => boolean): Promise<Hit[]> => {
      if (asked.has(text)) return [];
      asked.add(text);
      return (await request({ q: text, limit: 5 })).filter(accept);
    };

    const one = pick(await freeText(a.city ? a.text : `${a.text}, ${regionName}`, () => true), 1, a.text);
    if (one) return one;
    // auch ein Straßenname ohne Hausnummer aus dem Namen (Turnhalle am Fürreuthweg, Prüffall djk-eibach)
    const street = a.street ?? a.streetName;
    if (street) {
      const params = {
        street,
        city: structuredCity,
        ...(a.postcode ? { postalcode: a.postcode } : {}),
        viewbox: viewbox(bbox),
        bounded: 1,
        limit: 5,
      };
      const two = pick(await request(params), 2, a.text);
      if (two) return two;
    }
    // ein Name in der Adresse geht vor; der Ortsname des Modells ist oft allgemein („Kursraum“) und kommt danach
    for (const name of new Set([a.name, q.venueName].filter((n): n is string => Boolean(n)))) {
      const hits = await freeText(`${name}, ${city}`, (h) => NAMED_PLACES.has(`${h.category}=${h.type}`));
      const three = pick(hits, 3, `${name}, ${city}`);
      if (three) return three;
    }
    return outside;
  }

  async function lookup(address: string, q: GeocodeQuery): Promise<GeoOutcome> {
    const m = COORD.exec(address);
    if (m)
      return {
        kind: "treffer",
        stufe: 0,
        geo: { lat: Number(m[1]), lon: Number(m[2]), display: address, municipality: null },
      };
    const known = o.known?.get(normalizeAddress(address).text);
    const atKnown = known?.find((g) => g.catalogRegion === q.region) ?? known?.[0];
    if (atKnown) return { kind: "treffer", stufe: 0, geo: atKnown };
    const key = placeKey(address, q.venueName);
    const inState = found[q.region]?.[key] ?? o.orte?.[q.region]?.[key];
    if (inState && usable(inState, o.today)) return { kind: "treffer", stufe: inState.stufe, geo: toGeo(inState) };
    if (misses.has(`${q.region}|${key}`)) return { kind: "kein-treffer" };
    const cached = runCache[q.region]?.[key];
    if (cached && "treffer" in cached && usable(cached.treffer, o.today)) {
      found[q.region] = { ...found[q.region], [key]: cached.treffer };
      return { kind: "treffer", stufe: cached.treffer.stufe, geo: toGeo(cached.treffer) };
    }
    if (cached && "kein" in cached && fresh(cached.kein, o.today, MISS_DAYS)) return { kind: "kein-treffer" };

    let ort: Ort | undefined;
    try {
      ort = await nominatim(address, q);
    } catch (e) {
      return { kind: "ausfall", grund: e instanceof Error ? e.message : String(e) };
    }
    if (ort) found[q.region] = { ...found[q.region], [key]: ort };
    else misses.add(`${q.region}|${key}`);
    runCache[q.region] = { ...runCache[q.region], [key]: ort ? { treffer: ort } : { kein: o.today } };
    writeCache(CACHE_FILE, runCache, dir);
    return ort ? { kind: "treffer", stufe: ort.stufe, geo: toGeo(ort) } : { kind: "kein-treffer" };
  }

  return {
    geocode(address, q) {
      const next = queue.then(() => lookup(address, q));
      queue = next.catch(() => undefined);
      return next;
    },
    newOrte: (region) => ({ ...found[region] }),
    stats: () => ({ requests, waitMs }),
  };
}

/**
 * Prüffälle (Plan 0050, S1): Eingaben wie vom Modell geliefert, erwartete Lage aus dem Katalog. Die Unit-Tests
 * spielen die Aufzeichnungen ab; `pipeline geocode --faelle` fragt einmal live, ohne Katalog und Caches.
 */
export const GeocodeFaelle = z.strictObject({
  toleranzM: z.number().positive(),
  faelle: z.array(
    z.strictObject({
      anbieter: z.string(),
      eingabe: z.string().min(1),
      venueName: z.string().optional(),
      region: z.enum(REGION_IDS),
      /** `null`: richtig ist „kein Treffer“ (Ort ohne Namen in OSM) */
      erwartet: z.strictObject({ lat: z.number(), lon: z.number() }).nullable(),
      /** erwarteter Status im Gebiet der Region (Plan 0050, S2c); der Gemeindename ist dafür zu unzuverlässig (VGem) */
      gebiet: z.enum(["drin", "draussen"]).optional(),
      notiz: z.string().optional(),
    }),
  ),
});
export type GeocodeFaelle = z.infer<typeof GeocodeFaelle>;

export interface FallErgebnis {
  eingabe: string;
  outcome: GeoOutcome;
  abstandM?: number;
  ok: boolean;
}

export async function checkFaelle(file: GeocodeFaelle, geocoder: Geocoder): Promise<FallErgebnis[]> {
  const out: FallErgebnis[] = [];
  for (const f of file.faelle) {
    const outcome = await geocoder.geocode(f.eingabe, {
      region: f.region,
      ...(f.venueName ? { venueName: f.venueName } : {}),
    });
    const abstandM =
      outcome.kind === "treffer" && f.erwartet ? Math.round(haversineMeters(outcome.geo, f.erwartet)) : undefined;
    out.push({
      eingabe: f.eingabe,
      outcome,
      ...(abstandM === undefined ? {} : { abstandM }),
      ok:
        (f.erwartet === null
          ? outcome.kind === "kein-treffer"
          : abstandM !== undefined && abstandM <= file.toleranzM) &&
        (f.gebiet === undefined ||
          (outcome.kind === "treffer" && territoryStatus(REGIONS[f.region].territory, outcome.geo) === f.gebiet)),
    });
  }
  return out;
}

/** Schlüssel einer Aufzeichnung: Suchparameter sortiert, ohne Host */
export const recordingKey = (url: string): string =>
  [...new URL(url).searchParams]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

/** Orte des Katalogs als `known` (Schlüssel: normalisierte Adresse) */
export function knownPlaces(catalog: readonly Provider[]): Map<string, GeoResult[]> {
  const out = new Map<string, GeoResult[]>();
  for (const p of catalog)
    for (const v of p.role === "anbieter" ? p.venues : []) {
      const geo = {
        lat: v.geo.lat,
        lon: v.geo.lon,
        display: v.address,
        ...(v.district ? { district: v.district } : {}),
        catalogRegion: p.region,
      };
      const key = normalizeAddress(v.address).text;
      out.set(key, [...(out.get(key) ?? []), geo]);
    }
  return out;
}
