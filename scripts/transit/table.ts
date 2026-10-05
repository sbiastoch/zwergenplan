/**
 * Wegzeit-Tabelle Halt → Ort (Plan 0009, E5/E7; ADR 0011): aus dem Fahrplanauszug und den Orten der Angebote
 * entsteht `public/data/wegzeit.json`. Zeilen sind die Haltbereiche im Stadtgebiet Nürnberg mit Einstieg im
 * Fenster, Spalten die Orte (`placeKey`). Jede Zelle ist der Median der Tür-zu-Tür-Zeit über die
 * Abfahrtsminuten des Fensters, mit Warten am ersten Halt; den Fußweg zum Halt rechnet der Browser dazu.
 * Seit Plan 0012 (E4–E7, ADR 0015) mit höchstens einem Umstieg, Umstiegs-Bit und `public/data/linien.json`.
 *
 * Rein: keine Dateien, kein Netz (dependency-cruiser `transit-build-pure`).
 */
import { type GeoPoint, haversineMeters } from "../../src/domain/geo.ts";
import { placeKey } from "../../src/domain/place-key.ts";
import type { Timetable } from "../../src/domain/schema.ts";
import {
  COORD_SCALE,
  INSIDE_METERS,
  MAX_MINUTES,
  NO_MINUTES,
  TRANSFER_BIT,
  TRANSIT_TABLE_VERSION,
  valueAt,
} from "../../src/domain/transit.ts";
import type { TransitLinesFile, TransitTable, TransitTableFile } from "../../src/domain/transit-types.ts";
import { type Combo, cellLines, comboOf, encodeLines, lineLabel } from "./lines.ts";
import {
  buildNetwork,
  EGRESS_METERS,
  egressSeconds,
  f64,
  i32,
  scanProfiles,
  TRANSFER_PENALTY_SECONDS,
} from "./profile-csa.ts";

/** Zeilen nur für Haltbereiche dieser Gemeinde (Nürnberg, E5); das Netz zum Rechnen ist der ganze Auszug. */
const CITY_PREFIX = "de:09564:";
/** Abstand der Abfahrtsminuten */
const STEP_SECONDS = 60;

/** Haltbereich einer DHID: die ersten drei Teile („de:09564:510:11:U1“ → „de:09564:510“) */
export function areaId(dhid: string): string {
  return dhid.split(":").slice(0, 3).join(":");
}

/** „08:30“ → Sekunden ab Mitternacht */
const clockSeconds = (hhmm: string) => Number(hhmm.slice(0, 2)) * 3600 + Number(hhmm.slice(3, 5)) * 60;

export interface TableRow {
  id: string;
  /** Indizes in `timetable.stops` */
  steige: number[];
  /** Mittelpunkt der Steige */
  lat: number;
  lon: number;
}

/**
 * Zeilen der Tabelle: Haltbereiche mit DHID-Präfix `de:09564:` und mindestens einem Einstieg mit Abfahrt im
 * Fenster (Grenzen inklusiv), sortiert nach ID. Ein Bereich mit nur Ausstieg oder nur Endhalt bleibt draußen.
 */
export function tableRows(timetable: Pick<Timetable, "stops" | "trips" | "window">): TableRow[] {
  const from = clockSeconds(timetable.window.from);
  const to = clockSeconds(timetable.window.to);
  const cityArea = timetable.stops.map(([id]) => (id.startsWith(CITY_PREFIX) ? areaId(id) : undefined));
  const departs = new Set<string>();
  for (const trip of timetable.trips) {
    let acc = 0;
    // Abfahrt am Halt k ist times[2k + 1]; der letzte Halt hat keine Abfahrt.
    for (let i = 0; i < trip.times.length; i++) {
      acc += valueAt(trip.times, i);
      const k = (i - 1) / 2;
      if (i % 2 === 0 || k >= trip.stops.length - 1 || acc < from || acc > to) continue;
      if ((valueAt(trip.flags, k) & 1) === 0) continue;
      const area = cityArea[valueAt(trip.stops, k)];
      if (area !== undefined) departs.add(area);
    }
  }
  const byArea = new Map<string, number[]>();
  timetable.stops.forEach(([id], index) => {
    const area = areaId(id);
    if (!departs.has(area)) return;
    const list = byArea.get(area);
    if (list) list.push(index);
    else byArea.set(area, [index]);
  });
  const lats = timetable.stops.map(([, lat]) => lat);
  const lons = timetable.stops.map(([, , lon]) => lon);
  return (
    [...byArea.entries()]
      // Schlüssel einer Map sind eindeutig, Gleichstand gibt es nicht
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, steige]) => {
        const mean = (values: readonly number[]) =>
          steige.reduce((sum, i) => sum + valueAt(values, i), 0) / steige.length;
        return { id, steige, lat: mean(lats), lon: mean(lons) };
      })
  );
}

/**
 * Zellwert aus den Minuten je Abfahrtsminute (E5, m12): aufsteigend sortieren, Median (bei 120 Werten
 * `(x[59] + x[60]) / 2`), `Math.round`; über 120 oder nicht endlich → 255.
 */
export function cellValue(minutes: ArrayLike<number>): number {
  // Kopie als Float64Array: sortiert numerisch und schneller als ein Array mit Vergleichsfunktion
  const x = Float64Array.from(minutes).sort();
  const mid = x.length / 2;
  const median = x.length % 2 === 0 ? (valueAt(x, mid - 1) + valueAt(x, mid)) / 2 : valueAt(x, Math.floor(mid));
  const rounded = Math.round(median);
  return Number.isFinite(rounded) && rounded <= MAX_MINUTES ? rounded : NO_MINUTES;
}

/** Base64 wie im Browser (`atob`), ohne Node-`Buffer`; in Blöcken, damit der Argument-Stack reicht. */
export function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Grad → ganzzahlig × 1e4, ab dem zweiten Wert als Differenz (E7) */
function delta(values: readonly number[]): number[] {
  let prev = 0;
  return values.map((v) => {
    const scaled = Math.round(v * COORD_SCALE);
    const d = scaled - prev;
    prev = scaled;
    return d;
  });
}

/**
 * Inhaltskennung beider Dateien (Plan 0012, E6): FNV-1a 32 Bit über die UTF-8-Bytes des Texts, 8 Hex-Ziffern.
 * Ändert sich Minuten oder Linien, ändert sich die Kennung; der Browser nimmt die Linien nur bei Gleichheit.
 */
export function contentId(parts: readonly unknown[]): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(JSON.stringify(parts))) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Zahlen zur Meldung und zum Gate in `build-data` (E7) */
export interface TransitBuildStats {
  /** verschiedene Anzeigenamen in `linien.json` */
  lines: number;
  /** verschiedene Folgen in Zellen mit Linien */
  combos: number;
  /** Zellen mit Wert ≠ 255 ohne Linien */
  withoutLines: number;
  /** davon wegen der Passung verworfen (E4, Schritt 5) */
  outliers: number;
  /** Zellen mit Wert ≠ 255 */
  cells: number;
}

/**
 * Rechnet Tabelle und Linien (E4–E7). `places` sind die Orte der Angebote in `site.json`-Reihenfolge, Doppelte
 * zählen einmal. `egressMeters` und `penaltySeconds` dienen Tests und Vergleichen.
 *
 * Je Zeile und Abfahrtsminute zählt die kleinste Bewertung über die Steige des Bereichs und den direkten Abgang
 * (bei Gleichstand der Abgang, dann die Reihenfolge der Steige). Die Zelle ist der Median der echten Zeit, die
 * Linien die häufigste Folge (`cellLines`). Der Text einer Folge entsteht je Profil-Eintrag nur einmal.
 */
export function buildTransitTables(
  timetable: Timetable,
  places: readonly GeoPoint[],
  opts: { egressMeters?: number; penaltySeconds?: number } = {},
): { table: TransitTableFile; lines: TransitLinesFile; stats: TransitBuildStats } {
  const egressMeters = opts.egressMeters ?? EGRESS_METERS;
  const penaltySeconds = opts.penaltySeconds ?? TRANSFER_PENALTY_SECONDS;
  const columns = new Map<string, GeoPoint>();
  for (const p of places) if (!columns.has(placeKey(p))) columns.set(placeKey(p), p);
  const rows = tableRows(timetable);
  const from = clockSeconds(timetable.window.from);
  const count = (clockSeconds(timetable.window.to) - from) / STEP_SECONDS;
  const net = buildNetwork(timetable, { from });
  const labels = timetable.trips.map((t) => lineLabel(t.route, t.mode));
  const cols = columns.size;
  const bytes = new Uint8Array(rows.length * cols);
  const cellCombo = new Int32Array(rows.length * cols).fill(-1);
  const stats: TransitBuildStats = { lines: 0, combos: 0, withoutLines: 0, outliers: 0, cells: 0 };

  // Folgen global über alle Orte dedupliziert; 0 = leer (zu Fuß vom Halt)
  const combos: Combo[] = [comboOf([])];
  const comboIds = new Map<string, number>([[comboOf([]).key, 0]]);
  /** je Profil-Eintrag die Nummer seiner Folge, −1 = noch nicht bestimmt (E4, Laufzeit) */
  const comboOfEntry = new Int32Array(net.connections);

  const sweptRated = new Float64Array(count);
  const sweptReal = new Float64Array(count);
  const sweptEntry = new Int32Array(count);
  const bestRated = new Float64Array(count);
  const bestReal = new Float64Array(count);
  const minuteCombo = new Int32Array(count);
  const x = new Float64Array(count);

  [...columns.values()].forEach((place, col) => {
    const egress = egressSeconds(net, place, egressMeters);
    const profiles = scanProfiles(net, egress, { penaltySeconds });
    comboOfEntry.fill(-1);
    const comboAt = (entry: number): number => {
      const known = i32(comboOfEntry, entry);
      if (known !== -1) return known;
      const combo = comboOf(profiles.trips(entry).map((trip) => labels[trip] ?? ""));
      let id = comboIds.get(combo.key);
      if (id === undefined) {
        id = combos.length;
        combos.push(combo);
        comboIds.set(combo.key, id);
      }
      comboOfEntry[entry] = id;
      return id;
    };
    rows.forEach((row, r) => {
      // kleinste Bewertung; bei Gleichstand der Abgang vor der Fahrt, dann die Reihenfolge der Steige (E4)
      const walk = row.steige.reduce((w, s) => Math.min(w, f64(egress, s)), Number.POSITIVE_INFINITY);
      for (let m = 0; m < count; m++) {
        bestRated[m] = from + m * STEP_SECONDS + walk;
        bestReal[m] = f64(bestRated, m);
        minuteCombo[m] = 0;
      }
      for (const s of row.steige) {
        profiles.sweep(s, from, STEP_SECONDS, count, sweptRated, sweptReal, sweptEntry);
        for (let m = 0; m < count; m++) {
          if (f64(sweptRated, m) < f64(bestRated, m)) {
            bestRated[m] = f64(sweptRated, m);
            bestReal[m] = f64(sweptReal, m);
            minuteCombo[m] = comboAt(i32(sweptEntry, m));
          }
        }
      }
      for (let m = 0; m < count; m++) x[m] = (f64(bestReal, m) - (from + m * STEP_SECONDS)) / 60;
      const value = cellValue(x);
      const cell = r * cols + col;
      const chosen = cellLines(value, { combo: minuteCombo, x }, combos);
      bytes[cell] = value === NO_MINUTES ? NO_MINUTES : value | (chosen.transfer ? TRANSFER_BIT : 0);
      cellCombo[cell] = chosen.combo;
      if (value === NO_MINUTES) return;
      stats.cells++;
      if (chosen.combo === -1) stats.withoutLines++;
      if (chosen.outlier) stats.outliers++;
    });
  });

  const encoded = encodeLines(cellCombo, combos);
  stats.lines = encoded.lines.length;
  stats.combos = new Set(cellCombo.filter((c) => c !== -1)).size;
  const { attribution, title, url, license, licenseUrl, validFrom, validTo } = timetable.source;
  const source = { attribution, title, url, license, licenseUrl, validFrom, validTo };
  const content = {
    places: [...columns.keys()],
    lat: delta(rows.map((r) => r.lat)),
    lon: delta(rows.map((r) => r.lon)),
    minutes: encodeBytes(bytes),
  };
  const first = encodeBytes(encoded.first);
  const second = encodeBytes(encoded.second);
  const id = contentId([
    timetable.serviceDay,
    timetable.source.modified,
    penaltySeconds,
    egressMeters,
    content.places,
    content.lat,
    content.lon,
    content.minutes,
    encoded.lines,
    first,
    second,
  ]);
  return {
    table: {
      version: TRANSIT_TABLE_VERSION,
      id,
      source,
      serviceDay: timetable.serviceDay,
      window: { from: timetable.window.from, to: timetable.window.to },
      ...content,
    },
    lines: { version: 1, table: id, source, lines: encoded.lines, first, second },
    stats,
  };
}

/**
 * Startpunkte ohne Haltbereich im Umkreis des Innen-Tests (`INSIDE_METERS`, 800 m; Plan 0012, E2). Für die
 * Stadtteile muss die Liste leer sein, sonst bekäme ein wählbarer Stadtteil nur die Luftlinie (Plan 0009,
 * Schritt 5; `build-data` prüft das).
 */
export function withoutAccess<T extends { point: GeoPoint }>(
  table: Pick<TransitTable, "lat" | "lon">,
  origins: readonly T[],
): T[] {
  return origins.filter(({ point }) => {
    for (let row = 0; row < table.lat.length; row++) {
      const stop = { lat: valueAt(table.lat, row), lon: valueAt(table.lon, row) };
      if (haversineMeters(point, stop) <= INSIDE_METERS) return false;
    }
    return true;
  });
}
