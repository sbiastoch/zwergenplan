/**
 * Fahrplanauszug aus dem GTFS-Feed eines Netzes (Plan 0009, E2–E4; ADR 0011; Plan 0039, E4): CSV lesen,
 * Referenz-Dienstag wählen, aktive Dienste bestimmen und die Fahrten eines Dienstagvormittags in der bbox des Netzes
 * herausschneiden. Was je Verbund anders ist (Ort des Feeds, Verkehrsmittel, Bedarfsverkehr, Namensnennung), steht in
 * `FEEDS`. Rein: Laden, Cache und Entpacken liegen in io/gtfs.ts, „heute“ wird hineingegeben.
 */
import { z } from "zod";
import { type BBox, inBounds } from "../../../src/domain/geo.ts";
import { NETWORKS, type NetworkId } from "../../../src/domain/regions.ts";
import { type Timetable, type TransitMode, timetableSchema } from "../../../src/domain/schema.ts";
import { addDays, berlinIsoDate, formatGermanDate, isoWeekday, toBerlinIso } from "../../../src/domain/time.ts";

/** Abfahrtsfenster der Wegzeit (E5) */
const WINDOW = { from: "08:30", to: "10:30" } as const;
/** Obergrenze der Wegzeit (E8): Verbindungen bis Fensterende + 120 Min. reichen. */
const HORIZON_SECONDS = 120 * 60;

/** Bit 1 = Einsteigen erlaubt, Bit 2 = Aussteigen erlaubt (Schema `Timetable`) */
const BOARD = 1;
const ALIGHT = 2;

/** Die Dateien des Feeds, die der Auszug braucht (transfers.txt bleibt ungenutzt, E6). */
export const GTFS_FILES = {
  routes: "routes.txt",
  trips: "trips.txt",
  stops: "stops.txt",
  calendar: "calendar.txt",
  calendarDates: "calendar_dates.txt",
  stopTimes: "stop_times.txt",
} as const;

/**
 * Texte der Feed-Dateien. stop_times.txt kommt als Folge von Blöcken, die je an einem Zeilenende enden: Im VRR-Feed
 * hat sie 665 MB und passt nicht in einen V8-String (Plan 0039, E4). Ein String gilt als ein Block.
 */
export type GtfsTexts = Record<Exclude<keyof typeof GTFS_FILES, "stopTimes">, string> & {
  stopTimes: Iterable<string>;
};
export type CsvRow = Record<string, string>;

export interface GtfsTables {
  routes: readonly CsvRow[];
  trips: readonly CsvRow[];
  stops: readonly CsvRow[];
  calendar: readonly CsvRow[];
  calendarDates: readonly CsvRow[];
  /** 1,7 Mio. Zeilen: nur einmal und zeilenweise gelesen */
  stopTimes: Iterable<CsvRow>;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Bytes → Text in Blöcken von höchstens `blockSize` Bytes, je am letzten Zeilenende davor geschnitten (Plan 0039, E4).
 * Ein Zeilenende (0x0A) liegt nie in einem UTF-8-Mehrbytezeichen; eine Zeile länger als der Block bleibt ganz.
 */
export function* decodeBlocks(bytes: Uint8Array, blockSize = 64 * 1024 * 1024): Generator<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + blockSize, bytes.length);
    if (end < bytes.length) {
      const before = bytes.lastIndexOf(10, end - 1);
      const after = bytes.indexOf(10, end);
      end = before >= start ? before + 1 : after === -1 ? bytes.length : after + 1;
    }
    yield decoder.decode(bytes.subarray(start, end));
    start = end;
  }
}

/** Zeilen aller Blöcke; ein String ist ein Block (nicht eine Folge von Zeichen). */
function* blockLines(blocks: Iterable<string>): Generator<string> {
  if (typeof blocks === "string") {
    yield* splitLines(blocks);
    return;
  }
  for (const block of blocks) yield* splitLines(block);
}

/** Zeilen ohne Zeilenende (LF oder CRLF), ohne die Datei zu kopieren. */
export function* splitLines(text: string): Generator<string> {
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    yield text.charCodeAt(end - 1) === 13 ? text.slice(start, end - 1) : text.slice(start, end);
    start = end + 1;
  }
}

/** Ein CSV-Datensatz nach RFC 4180, ohne Zeilenumbruch im Feld (kommt im Feed nicht vor). */
function splitCsvLine(line: string, lineNo: number): string[] {
  const fields: string[] = [];
  let i = 0;
  for (;;) {
    if (line.charCodeAt(i) === 34) {
      let value = "";
      let from = i + 1;
      for (;;) {
        const quote = line.indexOf('"', from);
        if (quote === -1) throw new Error(`CSV Zeile ${lineNo}: Anführungszeichen nicht geschlossen`);
        value += line.slice(from, quote);
        if (line.charCodeAt(quote + 1) === 34) {
          value += '"';
          from = quote + 2;
        } else {
          i = quote + 1;
          break;
        }
      }
      fields.push(value);
    } else {
      const comma = line.indexOf(",", i);
      fields.push(line.slice(i, comma === -1 ? line.length : comma));
      i = comma === -1 ? line.length : comma;
    }
    if (i >= line.length) return fields;
    i++; // Komma
  }
}

/** Datensätze mit der Kopfzeile als Schlüssel; BOM und Leerzeilen fallen weg. */
export function* parseCsv(lines: Iterable<string>): Generator<CsvRow> {
  let header: string[] | undefined;
  let lineNo = 0;
  for (const raw of lines) {
    lineNo++;
    const line = lineNo === 1 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    if (line === "") continue;
    const fields = splitCsvLine(line, lineNo);
    if (!header) {
      header = fields;
      continue;
    }
    if (fields.length !== header.length) {
      throw new Error(`CSV Zeile ${lineNo}: ${fields.length} Felder, erwartet ${header.length}`);
    }
    const row: CsvRow = {};
    header.forEach((name, k) => {
      row[name] = fields[k] ?? "";
    });
    yield row;
  }
}

/** Feld einer Zeile; eine fehlende Spalte heißt, der Feed hat sich geändert (Risiken: laut abbrechen). */
function field(row: CsvRow, name: string): string {
  const value = row[name];
  if (value === undefined) throw new Error(`GTFS: Spalte ${name} fehlt`);
  return value;
}

/** Die Texte der Feed-Dateien über Lesefunktionen (Dateiname wie im ZIP); stop_times.txt blockweise. */
export function gtfsTexts(
  read: (file: string) => string,
  readBlocks: (file: string) => Iterable<string> = read,
): GtfsTexts {
  return {
    routes: read(GTFS_FILES.routes),
    trips: read(GTFS_FILES.trips),
    stops: read(GTFS_FILES.stops),
    calendar: read(GTFS_FILES.calendar),
    calendarDates: read(GTFS_FILES.calendarDates),
    stopTimes: readBlocks(GTFS_FILES.stopTimes),
  };
}

/** Texte der Feed-Dateien → Tabellen; stop_times bleibt ein Generator. */
export function gtfsTables(texts: GtfsTexts): GtfsTables {
  const all = (text: string) => [...parseCsv(splitLines(text))];
  return {
    routes: all(texts.routes),
    trips: all(texts.trips),
    stops: all(texts.stops),
    calendar: all(texts.calendar),
    calendarDates: all(texts.calendarDates),
    stopTimes: parseCsv(blockLines(texts.stopTimes)),
  };
}

// ── Zeit und Kalender ────────────────────────────────────────────────────────

/** „25:10:05“ → Sekunden ab Mitternacht des Betriebstags (GTFS erlaubt Stunden ≥ 24). */
export function parseGtfsTime(text: string): number {
  const m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(text.trim());
  if (!m) throw new Error(`GTFS: keine Uhrzeit „${text}“`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** „20261013“ → „2026-10-13“ */
function isoFromGtfs(date: string): string {
  if (!/^\d{8}$/.test(date)) throw new Error(`GTFS: kein Datum „${date}“`);
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

const WEEKDAY_COLUMNS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Gültigkeit des Feeds (kein feed_info.txt): frühester Beginn bis spätestes Ende der Dienste. */
export function feedValidity(
  calendar: readonly CsvRow[],
  calendarDates: readonly CsvRow[],
): { validFrom: string; validTo: string } {
  const days =
    calendar.length > 0
      ? calendar.flatMap((c) => [isoFromGtfs(field(c, "start_date")), isoFromGtfs(field(c, "end_date"))])
      : calendarDates.filter((d) => field(d, "exception_type") === "1").map((d) => isoFromGtfs(field(d, "date")));
  days.sort();
  const [validFrom] = days;
  const validTo = days.at(-1);
  if (validFrom === undefined || validTo === undefined) throw new Error("GTFS: Gültigkeit nicht bestimmbar");
  return { validFrom, validTo };
}

/** service_id, die am Tag fahren: calendar (Wochentag, Zeitraum), dann calendar_dates (1 = hinzu, 2 = weg). */
export function activeServices(
  calendar: readonly CsvRow[],
  calendarDates: readonly CsvRow[],
  day: string,
): Set<string> {
  const weekday = WEEKDAY_COLUMNS[isoWeekday(day) - 1] ?? "";
  const active = new Set<string>();
  for (const c of calendar) {
    const inRange = isoFromGtfs(field(c, "start_date")) <= day && day <= isoFromGtfs(field(c, "end_date"));
    if (inRange && field(c, weekday) === "1") active.add(field(c, "service_id"));
  }
  for (const d of calendarDates) {
    if (isoFromGtfs(field(d, "date")) !== day) continue;
    const type = field(d, "exception_type");
    if (type === "1") active.add(field(d, "service_id"));
    else if (type === "2") active.delete(field(d, "service_id"));
    else throw new Error(`GTFS: unbekannter exception_type „${type}“`);
  }
  return active;
}

/**
 * Referenz-Dienstag (E4): ein Schultag ohne Feiertag, mindestens eine Woche entfernt (meidet kurzfristige
 * Ausnahmen in calendar_dates). Erster Kandidat ab `today` + 7 Tage, sonst der letzte; ohne Kandidat Fehler.
 */
export function pickServiceDay(opts: {
  validFrom: string;
  validTo: string;
  freeDays: Readonly<Record<string, string>>;
  today: string;
}): string {
  const earliest = addDays(opts.today, 7);
  let last: string | undefined;
  const offset = (2 - isoWeekday(opts.validFrom) + 7) % 7;
  for (let day = addDays(opts.validFrom, offset); day <= opts.validTo; day = addDays(day, 7)) {
    if (opts.freeDays[day] !== undefined) continue;
    if (day >= earliest) return day;
    last = day;
  }
  if (last === undefined) {
    throw new Error(`Kein Dienstag ohne Ferien und Feiertag zwischen ${opts.validFrom} und ${opts.validTo}`);
  }
  return last;
}

// ── Quelle ───────────────────────────────────────────────────────────────────

export type TimetableSource = Timetable["source"];

/** HTTP-Header Last-Modified → Zeitpunkt mit Offset, wie `source.modified` */
export function feedModified(lastModified: string): string {
  const modified = new Date(lastModified);
  if (Number.isNaN(modified.getTime())) throw new Error(`Feed ohne lesbares Last-Modified: „${lastModified}“`);
  return toBerlinIso(modified);
}

interface SourceInput {
  /** HTTP-Header Last-Modified des Feeds */
  lastModified: string;
  fetchedAt: Date;
  validFrom: string;
  validTo: string;
  /** tatsächlich geladene URL (beim VRR die Ressource der Ausgabe) */
  download: string;
}

/**
 * Namensnennung aus der Quelle des Netzes (`NETWORKS[…].transitSource`) und dem Stand des Feeds, Titel
 * „<Verbund>-Soll-Daten vom <Last-Modified>“. Den Hinweis „abgewandelt“ setzt die Anzeige (`src/ui/format.ts`).
 */
function sourceOf(network: NetworkId, opts: SourceInput): TimetableSource {
  const modified = feedModified(opts.lastModified);
  const { attribution, url, license, licenseUrl } = NETWORKS[network].transitSource;
  return {
    attribution,
    title: `${network.toUpperCase()}-Soll-Daten vom ${formatGermanDate(berlinIsoDate(modified))}`,
    url,
    download: opts.download,
    license,
    licenseUrl,
    modified,
    validFrom: opts.validFrom,
    validTo: opts.validTo,
    fetchedAt: toBerlinIso(opts.fetchedAt),
  };
}

// ── Feeds je Netz (Plan 0039, E4) ────────────────────────────────────────────

/** Wo das ZIP liegt: feste URL oder CKAN-Datensatz, dessen jüngste Ressource `fileName` io/gtfs.ts sucht */
export type FeedLocation = { kind: "url"; url: string } | { kind: "ckan"; api: string; fileName: string };

export interface Feed {
  network: NetworkId;
  location: FeedLocation;
  /** Zuschnitt des Auszugs: die bbox des Netzes (E3) */
  bbox: BBox;
  /** GTFS `route_type` → Verkehrsmittel (Plan 0012, E1); ein anderer Typ bei einer übernommenen Fahrt bricht ab */
  modes: Readonly<Record<string, TransitMode>>;
  /**
   * Bedarfsverkehr an der Route erkennbar (Plan 0009, E2: Anmeldung nötig, kein Takt). Unabhängig davon fallen in
   * jedem Feed Fahrten weg, die an keinem Halt regulär bedienen (`pickup_type`/`drop_off_type`).
   */
  isDemandRoute: (route: CsvRow) => boolean;
  /** Namensnennung (Plan 0009, E3; Plan 0039, E4) */
  source: (opts: SourceInput) => TimetableSource;
}

/** Im VGN-Feed nennt `route_desc` die Bedarfsverkehre (Plan 0009, E2). */
const VGN_DEMAND_RESPONSIVE = new Set(["Rufbus", "Linienbedarfstaxi", "Anrufsammeltaxi", "Linientaxi"]);

export const FEEDS: Readonly<Record<NetworkId, Feed>> = {
  vgn: {
    network: "vgn",
    location: { kind: "url", url: "https://www.vgn.de/opendata/GTFS.zip" },
    bbox: NETWORKS.vgn.bbox,
    // andere Typen kommen im VGN-Feed nicht vor
    modes: { "0": "tram", "1": "u-bahn", "2": "bahn", "3": "bus" },
    // Pflichtspalte: fehlt sie, hat sich der Feed geändert (Risiken: laut abbrechen)
    isDemandRoute: (route) => VGN_DEMAND_RESPONSIVE.has(field(route, "route_desc")),
    // CC BY-SA 3.0 DE, Abschnitt 4a/4c (Plan 0009, E3); Titel wie auf der Download-Seite
    source: (opts) => sourceOf("vgn", opts),
  },
  vrr: {
    network: "vrr",
    // jede Monatsausgabe ist eine neue Ressource mit eigener URL (OpenVRR, „Beta-Version“)
    location: {
      kind: "ckan",
      api: "https://api.opendata-oepnv.de/api/3/action/package_show?id=soll-fahrplandaten-vrr",
      fileName: "google_transit.zip",
    },
    bbox: NETWORKS.vrr.bbox,
    // 1 = Stadtbahn (U70–U83); 106 RE/RB, 109 S-Bahn; 405 Einschienenbahn (SkyTrain, Schwebebahn) auf eigenem
    // Fahrweg als `bahn`: eine eigene Art wäre eine Schemaänderung ohne sichtbaren Nutzen (gemessen 2026-10-18)
    modes: { "0": "tram", "1": "u-bahn", "3": "bus", "106": "bahn", "109": "bahn", "405": "bahn" },
    // keine Spalte route_desc: TaxiBus, AST, Bürgerbusse kennzeichnet der VRR nur über pickup_type/drop_off_type
    isDemandRoute: () => false,
    // CC BY 4.0; die Datensatzbeschreibung verlangt die „Nennung der VRR AöR“
    source: (opts) => sourceOf("vrr", opts),
  },
};

const CkanPackage = z.object({
  success: z.literal(true),
  result: z.object({
    resources: z.array(z.object({ url: z.string(), format: z.string(), created: z.string() })),
  }),
});

/**
 * Download der jüngsten Ausgabe aus einer CKAN-Antwort `package_show` (Plan 0039, E4): Format ZIP, Dateiname der URL
 * gleich `fileName`, größtes `created`. Nicht nach Namen, denn Monate fehlen oder kommen mehrfach („August 2026 II“).
 */
export function latestCkanResource(body: unknown, fileName: string): { url: string; created: string } {
  const parsed = CkanPackage.safeParse(body);
  if (!parsed.success) throw new Error(`CKAN-Antwort unlesbar: ${parsed.error.issues[0]?.message ?? "?"}`);
  const fileOf = (url: string) => new URL(url).pathname.split("/").at(-1);
  let latest: { url: string; created: string } | undefined;
  for (const r of parsed.data.result.resources) {
    if (r.format.toUpperCase() !== "ZIP" || fileOf(r.url) !== fileName) continue;
    if (latest === undefined || r.created > latest.created) latest = { url: r.url, created: r.created };
  }
  if (latest === undefined) throw new Error(`CKAN: keine ZIP-Ressource ${fileName} im Datensatz`);
  return latest;
}

// ── Auszug ───────────────────────────────────────────────────────────────────

interface StopEvent {
  seq: number;
  stop: string;
  pos: readonly [lat: number, lon: number];
  arr: number;
  dep: number;
  flags: number;
}

interface ExtractStats {
  stops: number;
  trips: number;
  connections: number;
  /**
   * am Stichtag aktive Fahrten von Bedarfsverkehren, weggelassen (E2): nach Route (VGN) oder ohne regulären Halt
   * (mit mindestens einem Halt in der BBOX)
   */
  demandTrips: number;
}

const clockSeconds = (hhmm: string) => parseGtfsTime(`${hhmm}:00`);
const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** 0 oder leer heißt „regulär“; alles andere (keine Bedienung, Anmeldung, Absprache) sperrt (E2). */
const regular = (value: string) => value === "" || value === "0";

/**
 * Auszug für einen Stichtag (E4, Schritt 3): Fahrten aktiver Dienste ohne Bedarfsverkehr, nur Halte in der bbox des
 * Netzes (Plan 0039, E3), zugeschnitten auf die Verbindungen mit Abfahrt im Fenster bis 120 Min. nach dessen Ende.
 * Verlässt eine Fahrt die BBOX und kommt zurück, wird der Abschnitt draußen eine Verbindung ohne Zwischenhalt.
 */
export function extractTimetable(
  feed: GtfsTables,
  opts: { network: NetworkId; serviceDay: string; source: TimetableSource },
): { timetable: Timetable; stats: ExtractStats } {
  const config = FEEDS[opts.network];
  const services = activeServices(feed.calendar, feed.calendarDates, opts.serviceDay);
  const from = clockSeconds(WINDOW.from);
  const to = clockSeconds(WINDOW.to) + HORIZON_SECONDS;

  interface RouteInfo {
    id: string;
    name: string;
    /** GTFS `route_type`, erst für übernommene Fahrten geprüft (Plan 0012, E1, Review W5) */
    type: string;
    demand: boolean;
  }
  const routes = new Map<string, RouteInfo>();
  for (const r of feed.routes) {
    const id = field(r, "route_id");
    const name = field(r, "route_short_name") || field(r, "route_long_name");
    routes.set(id, { id, name, type: field(r, "route_type"), demand: config.isDemandRoute(r) });
  }

  const allTrips = new Set<string>();
  const tripRoute = new Map<string, RouteInfo>();
  let demandTrips = 0;
  for (const t of feed.trips) {
    const id = field(t, "trip_id");
    allTrips.add(id);
    if (!services.has(field(t, "service_id"))) continue;
    const routeId = field(t, "route_id");
    const route = routes.get(routeId);
    if (!route) throw new Error(`GTFS: Fahrt ${id} verweist auf unbekannte Route ${routeId}`);
    if (route.demand) demandTrips++;
    else tripRoute.set(id, route);
  }

  /** Steige (location_type 0 oder leer) → Koordinate, `undefined` außerhalb der BBOX */
  const stops = new Map<string, readonly [number, number] | undefined>();
  for (const s of feed.stops) {
    if (!regular(field(s, "location_type"))) continue;
    const lat = Number(field(s, "stop_lat"));
    const lon = Number(field(s, "stop_lon"));
    stops.set(field(s, "stop_id"), inBounds({ lat, lon }, config.bbox) ? [lat, lon] : undefined);
  }

  const events = new Map<string, StopEvent[]>();
  /** Fahrten mit mindestens einem regulären Halt, auch außerhalb der BBOX */
  const regularTrips = new Set<string>();
  for (const st of feed.stopTimes) {
    const tripId = field(st, "trip_id");
    if (!tripRoute.has(tripId)) {
      if (!allTrips.has(tripId)) throw new Error(`GTFS: stop_times nennt unbekannte Fahrt ${tripId}`);
      continue;
    }
    const stop = field(st, "stop_id");
    if (!stops.has(stop)) throw new Error(`GTFS: Fahrt ${tripId} hält an unbekanntem Steig ${stop}`);
    const flags = (regular(field(st, "pickup_type")) ? BOARD : 0) | (regular(field(st, "drop_off_type")) ? ALIGHT : 0);
    if (flags !== 0) regularTrips.add(tripId);
    const pos = stops.get(stop);
    if (pos === undefined) continue; // außerhalb der BBOX
    const list = events.get(tripId) ?? [];
    if (list.length === 0) events.set(tripId, list);
    list.push({
      seq: Number(field(st, "stop_sequence")),
      stop,
      pos,
      arr: parseGtfsTime(field(st, "arrival_time")),
      dep: parseGtfsTime(field(st, "departure_time")),
      flags,
    });
  }

  const kept: { tripId: string; route: string; mode: TransitMode; events: StopEvent[] }[] = [];
  for (const [tripId, list] of events) {
    // Bedarfsverkehr nach pickup_type/drop_off_type (VRR, Plan 0039, E4): kein Halt mit regulärem Ein- oder Ausstieg
    if (!regularTrips.has(tripId)) {
      demandTrips++;
      continue;
    }
    list.sort((a, b) => a.seq - b.seq);
    list.forEach((e, k) => {
      const prev = list[k - 1];
      if (e.dep < e.arr || (prev && e.arr < prev.dep)) {
        throw new Error(`GTFS: Fahrt ${tripId} läuft bei stop_sequence ${e.seq} rückwärts`);
      }
    });
    // Verbindung k fährt ab list[k].dep; die Abfahrten steigen, also ist der passende Bereich zusammenhängend.
    const first = list.findIndex((e, k) => k < list.length - 1 && e.dep >= from);
    const last = list.findLastIndex((e, k) => k < list.length - 1 && e.dep <= to);
    if (first === -1 || last < first) continue;
    const route = tripRoute.get(tripId);
    if (route === undefined) throw new Error(`GTFS: Fahrt ${tripId} ohne Route`);
    kept.push({ tripId, ...lineOf(route, config.modes), events: list.slice(first, last + 2) });
  }
  const firstDep = (k: (typeof kept)[number]) => k.events[0]?.dep ?? 0;
  kept.sort((a, b) => firstDep(a) - firstDep(b) || cmp(a.route, b.route) || cmp(a.tripId, b.tripId));

  const positions = new Map(kept.flatMap((k) => k.events.map((e) => [e.stop, e.pos] as const)));
  const usedStops = [...positions.keys()].sort(cmp);
  const index = new Map(usedStops.map((id, i) => [id, i] as const));
  const timetable = timetableSchema(opts.network).parse({
    source: opts.source,
    serviceDay: opts.serviceDay,
    window: { ...WINDOW },
    stops: [...positions].sort(([a], [b]) => cmp(a, b)).map(([id, [lat, lon]]) => [id, round5(lat), round5(lon)]),
    trips: kept.map((k) => ({
      route: k.route,
      mode: k.mode,
      stops: k.events.map((e) => index.get(e.stop) ?? -1),
      times: deltas(k.events.flatMap((e) => [e.arr, e.dep])),
      flags: k.events.map((e) => e.flags),
    })),
  });
  const connections = kept.reduce((n, k) => n + k.events.length - 1, 0);
  return { timetable, stats: { stops: usedStops.length, trips: kept.length, connections, demandTrips } };
}

/**
 * Name und Verkehrsmittel einer Linie, deren Fahrt im Auszug bleibt (Plan 0012, E1). Erst hier geprüft, damit
 * eine Bedarfs- oder inaktive Route mit erweitertem Typ (700, 900 …) den Lauf nicht abbricht (Review W5).
 */
function lineOf(
  route: { id: string; name: string; type: string },
  modes: Feed["modes"],
): { route: string; mode: TransitMode } {
  if (route.name === "") throw new Error(`GTFS: Route ${route.id} ohne Namen`);
  const mode = modes[route.type];
  if (mode === undefined) throw new Error(`GTFS: Linie ${route.name} hat unbekannten route_type ${route.type}`);
  return { route: route.name, mode };
}

/** Code-Unit-Vergleich: unabhängig von der Locale, also deterministisch. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** [t0, t1, t2, …] → [t0, t1 − t0, t2 − t1, …] (Schema `Timetable`: ab dem zweiten Wert als Differenz) */
function deltas(values: readonly number[]): number[] {
  let prev = 0;
  return values.map((v) => {
    const d = v - prev;
    prev = v;
    return d;
  });
}

/**
 * Eigenes Zeilenformat (E4, M2): ein Steig bzw. eine Fahrt je Zeile, sonst kompakt. `biome format` machte
 * daraus 3,3 MB mit 272 232 Zeilen; `data/oepnv` ist deshalb in biome.json ausgenommen.
 */
export function serializeTimetable(t: Timetable): string {
  const block = (items: readonly unknown[]) =>
    items.length === 0 ? "[]" : `[\n${items.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]`;
  return [
    "{",
    `  "source": ${JSON.stringify(t.source)},`,
    `  "serviceDay": ${JSON.stringify(t.serviceDay)},`,
    `  "window": ${JSON.stringify(t.window)},`,
    `  "stops": ${block(t.stops)},`,
    `  "trips": ${block(t.trips)}`,
    "}",
    "",
  ].join("\n");
}
