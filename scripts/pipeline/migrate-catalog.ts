/**
 * EINMALIGE Migration des Anbieterkatalogs vom Skill-Format in den Zod-Vertrag (Plan 0002, E1/E2).
 * Wird nach dem Lauf samt Test und Fixture gelöscht; die git-Historie behält sie.
 *
 *   node scripts/pipeline/migrate-catalog.ts   → überschreibt data/providers.yaml
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Document, isMap, isPair, isScalar, isSeq, parse, visit } from "yaml";
import { slug } from "../../src/domain/ids.ts";
import { type Provider, type ProviderAge, ProvidersFile, type Venue } from "../../src/domain/schema.ts";

type Legacy = Record<string, unknown>;
type LegacyVenue = { name?: string; address?: string; district?: string; ring?: string; lat?: number; lon?: number };

export const LEGACY_KEYS = [
  "id",
  "name",
  "role",
  "address",
  "district",
  "ring",
  "lat",
  "lon",
  "venues",
  "age",
  "topics",
  "format",
  "cost",
  "registration",
  "programme",
  "availability",
  "verified",
  "notes",
  "covered_by",
  "fetch",
];

const ADAPTERS: Record<string, "stadt-vk" | "frankenkids" | "evtermine"> = {
  "stadt_vk.py": "stadt-vk",
  "frankenkids.py": "frankenkids",
  "evtermine.py": "evtermine",
};

/** Einzelfälle laut notes (Plan 0002, Review 2): „0-12“ meint dort Jahre; Adresse = Sitz, kein Veranstaltungsort. */
const AGE_IN_YEARS = new Set([
  "eckstein-treff-alleinerziehende",
  "kath-stadtkirche-familiengottesdienste",
  "frankenkids-eventkalender",
]);
const ROLE_OVERRIDE: Record<string, string> = { "kath-stadtkirche-familiengottesdienste": "aggregator" };

/** Alterstext → Monate. Regeln aus select_providers.age_ok; neu: „3“ allein = 36–36 („jüngstes Stück ab 3“). */
export function parseLegacyAge(spec: unknown, opts: { years?: boolean } = {}): ProviderAge | undefined {
  if (spec === undefined || spec === null || spec === "alle") return undefined;
  const text = String(spec).toLowerCase();
  if (/^\d+$/.test(text)) return { minMonths: Number(text) * 12, maxMonths: Number(text) * 12 };
  const norm = text
    .replace(/\s*mon(ate)?\.?/g, "m")
    .replace(/ j\b|jahre/g, "")
    .replace(/\s/g, "");
  const m = /^([\d.,]+m?)[-–]([\d.,]+m?)$/.exec(norm);
  if (!m?.[1] || !m[2]) throw new Error(`Unbekannte Altersangabe: ${String(spec)}`);
  let [lo, hi] = [m[1], m[2]];
  if (!opts.years && !hi.endsWith("m") && Number.parseFloat(hi) > 6) {
    hi += "m";
    if (!lo.endsWith("m")) lo += "m";
  }
  const months = (x: string) =>
    x.endsWith("m") ? Number.parseFloat(x.replace(",", ".")) : Number.parseFloat(x.replace(",", ".")) * 12;
  return { minMonths: Math.round(months(lo)), maxMonths: Math.round(months(hi)) };
}

/** „Name (Zusatz)“ → ["Name", "Zusatz"] */
function splitName(name: string): [string, string | undefined] {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(name);
  return m?.[1] ? [m[1].trim(), m[2]?.trim()] : [name.trim(), undefined];
}

function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (a.lat - b.lat) * 110_540;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

function mainVenueName(p: Legacy): string {
  const parts = String(p["address"])
    .replace(/\([^)]*\)/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length >= 3 && parts[0] && !/\d/.test(parts[0]) ? parts[0] : String(p["name"]);
}

const list = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const unique = <T>(xs: T[]): T[] => [...new Set(xs)];

function migrateProvider(p: Legacy): Provider {
  const id = String(p["id"]);
  const notes: string[] = p["notes"] ? [String(p["notes"])] : [];
  const venues: Venue[] = [];
  const role = ROLE_OVERRIDE[id] ?? String(p["role"]);
  const ring = p["ring"] as Venue["ring"] | undefined;
  const hasMain =
    role === "anbieter" && typeof p["lat"] === "number" && typeof p["lon"] === "number" && ring !== undefined;
  const legacyVenues = list<LegacyVenue>(p["venues"]);

  if (hasMain) {
    const geo = { lat: p["lat"] as number, lon: p["lon"] as number };
    const twin = legacyVenues.find(
      (v) =>
        typeof v.lat === "number" && typeof v.lon === "number" && distanceMeters(geo, { lat: v.lat, lon: v.lon }) <= 25,
    );
    const [name, extra] = twin?.name ? splitName(twin.name) : [mainVenueName(p), undefined];
    if (extra) notes.push(`Ort ${name}: ${extra}`);
    venues.push({
      id,
      name,
      address: String(p["address"]),
      ...(p["district"] ? { district: String(p["district"]) } : {}),
      ring,
      geo,
    });
  } else if (/\d/.test(String(p["address"] ?? ""))) {
    notes.push(`Sitz: ${String(p["address"])}`);
  }

  for (const v of legacyVenues) {
    const [name, extra] = splitName(v.name ?? "");
    if (typeof v.lat !== "number" || typeof v.lon !== "number" || !v.ring) {
      notes.push(`Wechselnder Treffpunkt: ${v.name ?? "?"}, ${v.address ?? "?"}`);
      continue;
    }
    const main = venues[0];
    if (hasMain && main && distanceMeters(main.geo, { lat: v.lat, lon: v.lon }) <= 25) continue; // = Hauptort
    let venueId = `${id}-${slug(name, 32)}`;
    for (let n = 2; venues.some((x) => x.id === venueId); n++) venueId = `${id}-${slug(name, 32)}-${n}`;
    if (extra) notes.push(`Ort ${name}: ${extra}`);
    venues.push({
      id: venueId,
      name,
      address: v.address ?? "",
      ring: v.ring as Venue["ring"],
      geo: { lat: v.lat, lon: v.lon },
    });
  }

  const programme = list<{ url: string; kind: string }>(p["programme"]);
  const url = (programme.find((g) => g.kind === "html") ?? programme[0])?.url ?? "";
  const age = parseLegacyAge(p["age"], { years: AGE_IN_YEARS.has(id) });
  const costs = unique(
    list<string>(p["cost"]).flatMap((c) => (c === "teils-kostenlos" ? ["kostenpflichtig", "kostenlos"] : [c])),
  );
  const base = {
    id,
    name: String(p["name"]),
    url,
    venues,
    topics: list(p["topics"]),
    ...(age ? { age } : {}),
    formats: unique(list(p["format"])),
    costs,
    registrations: unique(list(p["registration"])),
    programme,
    availability: p["availability"],
    verified: String(p["verified"]),
    ...(notes.length > 0 ? { notes: notes.join(" | ") } : {}),
  };
  const fetchScript = /scripts\/(\w+\.py)/.exec(String(p["fetch"] ?? ""))?.[1];
  const raw =
    role === "anbieter"
      ? { role, ...base, ...(p["covered_by"] ? { coveredBy: String(p["covered_by"]) } : {}) }
      : role === "aggregator"
        ? { role, ...base, ...(fetchScript && ADAPTERS[fetchScript] ? { adapter: ADAPTERS[fetchScript] } : {}) }
        : { role, ...base };
  // Zod ist hier die Prüfung: ein Altfeld, das nicht passt, lässt die Migration laut scheitern.
  const parsed = ProvidersFile.element.safeParse(raw);
  if (!parsed.success)
    throw new Error(`${id}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return parsed.data;
}

export function migrateCatalog(legacy: readonly Legacy[]): Provider[] {
  return legacy.map(migrateProvider);
}

/** YAML mit Geo-Koordinaten und kurzen Listen in einer Zeile – lesbarer für Menschen und Agenten. */
function toYaml(providers: readonly Provider[], header: string): string {
  const doc = new Document(providers);
  visit(doc, {
    Pair(_, pair) {
      if (!isPair(pair) || !isScalar(pair.key)) return;
      if (pair.key.value === "geo" && isMap(pair.value)) pair.value.flow = true;
      if (isSeq(pair.value) && pair.value.items.every(isScalar)) pair.value.flow = true;
    },
  });
  return `${header}${doc.toString({ lineWidth: 0 })}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL("../../data/providers.yaml", import.meta.url);
  const migrated = migrateCatalog(parse(readFileSync(file, "utf8")) as Legacy[]);
  writeFileSync(
    file,
    toYaml(
      migrated,
      "# Anbieterkatalog – Vertrag: src/domain/schema.ts (Provider), JSON Schema: schema/providers.schema.json\n",
    ),
  );
  console.log(`✓ ${migrated.length} Einträge migriert`);
}
