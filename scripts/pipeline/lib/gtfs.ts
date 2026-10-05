/**
 * Fahrplanauszug aus dem VGN-GTFS-Feed (Plan 0009, E2–E4; ADR 0011): CSV lesen, Referenz-Dienstag wählen,
 * aktive Dienste bestimmen und die Fahrten eines Dienstagvormittags im Großraum herausschneiden.
 * Rein: Laden, Cache und Entpacken liegen in io/gtfs.ts, „heute“ wird hineingegeben.
 */
import { inBounds } from "../../../src/domain/geo.ts";
import { Timetable, type TransitMode } from "../../../src/domain/schema.ts";
import { addDays, berlinIsoDate, formatGermanDate, isoWeekday, toBerlinIso } from "../../../src/domain/time.ts";

export const VGN_FEED_URL = "https://www.vgn.de/opendata/GTFS.zip";

/** Abfahrtsfenster der Wegzeit (E5) */
const WINDOW = { from: "08:30", to: "10:30" } as const;
/** Obergrenze der Wegzeit (E8): Verbindungen bis Fensterende + 120 Min. reichen. */
const HORIZON_SECONDS = 120 * 60;

/** Bedarfsverkehre zählen nicht (E2): Anmeldung nötig, kein Takt. */
const DEMAND_RESPONSIVE = new Set(["Rufbus", "Linienbedarfstaxi", "Anrufsammeltaxi", "Linientaxi"]);

/** GTFS `route_type` → Verkehrsmittel (Plan 0012, E1); andere Typen kommen im VGN-Feed nicht vor. */
const MODES: Readonly<Record<string, TransitMode>> = { "0": "tram", "1": "u-bahn", "2": "bahn", "3": "bus" };

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

export type GtfsTexts = Record<keyof typeof GTFS_FILES, string>;
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

/** Die Texte der Feed-Dateien über eine Lesefunktion (Dateiname wie im ZIP). */
export function gtfsTexts(read: (file: string) => string): GtfsTexts {
  return {
    routes: read(GTFS_FILES.routes),
    trips: read(GTFS_FILES.trips),
    stops: read(GTFS_FILES.stops),
    calendar: read(GTFS_FILES.calendar),
    calendarDates: read(GTFS_FILES.calendarDates),
    stopTimes: read(GTFS_FILES.stopTimes),
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
    stopTimes: parseCsv(splitLines(texts.stopTimes)),
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

/** Namensnennung nach CC BY-SA 3.0 DE, Abschnitt 4a/4c (E3). Titel wie auf der Download-Seite. */
export function vgnSource(opts: {
  /** HTTP-Header Last-Modified des Feeds */
  lastModified: string;
  fetchedAt: Date;
  validFrom: string;
  validTo: string;
}): TimetableSource {
  const modified = feedModified(opts.lastModified);
  return {
    attribution: "VGN – Verkehrsverbund Großraum Nürnberg GmbH",
    title: `VGN-Soll-Daten vom ${formatGermanDate(berlinIsoDate(modified))}`,
    url: "https://www.vgn.de/web-entwickler/open-data/",
    download: VGN_FEED_URL,
    license: "CC BY-SA 3.0 DE",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/",
    modified,
    validFrom: opts.validFrom,
    validTo: opts.validTo,
    fetchedAt: toBerlinIso(opts.fetchedAt),
  };
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
  /** am Stichtag aktive Fahrten von Bedarfsverkehren, weggelassen (E2) */
  demandTrips: number;
}

const clockSeconds = (hhmm: string) => parseGtfsTime(`${hhmm}:00`);
const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** 0 oder leer heißt „regulär“; alles andere (keine Bedienung, Anmeldung, Absprache) sperrt (E2). */
const regular = (value: string) => value === "" || value === "0";

/**
 * Auszug für einen Stichtag (E4, Schritt 3): Fahrten aktiver Dienste ohne Bedarfsverkehr, nur Halte in
 * `NUERNBERG_BBOX`, zugeschnitten auf die Verbindungen mit Abfahrt im Fenster bis 120 Min. nach dessen Ende.
 * Verlässt eine Fahrt die BBOX und kommt zurück, wird der Abschnitt draußen eine Verbindung ohne Zwischenhalt.
 */
export function extractTimetable(
  feed: GtfsTables,
  opts: { serviceDay: string; source: TimetableSource },
): { timetable: Timetable; stats: ExtractStats } {
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
    const demand = DEMAND_RESPONSIVE.has(field(r, "route_desc"));
    routes.set(id, { id, name, type: field(r, "route_type"), demand });
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
    stops.set(field(s, "stop_id"), inBounds({ lat, lon }) ? [lat, lon] : undefined);
  }

  const events = new Map<string, StopEvent[]>();
  for (const st of feed.stopTimes) {
    const tripId = field(st, "trip_id");
    if (!tripRoute.has(tripId)) {
      if (!allTrips.has(tripId)) throw new Error(`GTFS: stop_times nennt unbekannte Fahrt ${tripId}`);
      continue;
    }
    const stop = field(st, "stop_id");
    if (!stops.has(stop)) throw new Error(`GTFS: Fahrt ${tripId} hält an unbekanntem Steig ${stop}`);
    const pos = stops.get(stop);
    if (pos === undefined) continue; // außerhalb der BBOX
    const flags = (regular(field(st, "pickup_type")) ? BOARD : 0) | (regular(field(st, "drop_off_type")) ? ALIGHT : 0);
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
    kept.push({ tripId, ...lineOf(route), events: list.slice(first, last + 2) });
  }
  const firstDep = (k: (typeof kept)[number]) => k.events[0]?.dep ?? 0;
  kept.sort((a, b) => firstDep(a) - firstDep(b) || cmp(a.route, b.route) || cmp(a.tripId, b.tripId));

  const positions = new Map(kept.flatMap((k) => k.events.map((e) => [e.stop, e.pos] as const)));
  const usedStops = [...positions.keys()].sort(cmp);
  const index = new Map(usedStops.map((id, i) => [id, i] as const));
  const timetable = Timetable.parse({
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
function lineOf(route: { id: string; name: string; type: string }): { route: string; mode: TransitMode } {
  if (route.name === "") throw new Error(`GTFS: Route ${route.id} ohne Namen`);
  const mode = MODES[route.type];
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
