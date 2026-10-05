/**
 * Wegzeit-Tabelle Halt → Ort (Plan 0009, E5/E7; ADR 0011): aus dem Fahrplanauszug und den Orten der Angebote
 * entsteht `public/data/wegzeit.json`. Zeilen sind die Haltbereiche im Stadtgebiet Nürnberg mit Einstieg im
 * Fenster, Spalten die Orte (`placeKey`). Jede Zelle ist der Median der Tür-zu-Tür-Zeit über die
 * Abfahrtsminuten des Fensters, mit Warten am ersten Halt; den Fußweg zum Halt rechnet der Browser dazu.
 *
 * Rein: keine Dateien, kein Netz (dependency-cruiser `transit-build-pure`).
 */
import type { GeoPoint } from "../../src/domain/geo.ts";
import { placeKey } from "../../src/domain/place-key.ts";
import type { Timetable } from "../../src/domain/schema.ts";
import { COORD_SCALE, MAX_MINUTES, NO_MINUTES, TRANSIT_TABLE_VERSION, valueAt } from "../../src/domain/transit.ts";
import type { TransitTableFile } from "../../src/domain/transit-types.ts";
import { buildNetwork, EGRESS_METERS, egressSeconds, scanProfiles } from "./profile-csa.ts";

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
export function cellValue(minutes: readonly number[]): number {
  const x = [...minutes].sort((a, b) => a - b);
  const mid = x.length / 2;
  const median = x.length % 2 === 0 ? (valueAt(x, mid - 1) + valueAt(x, mid)) / 2 : valueAt(x, Math.floor(mid));
  const rounded = Math.round(median);
  return Number.isFinite(rounded) && rounded <= MAX_MINUTES ? rounded : NO_MINUTES;
}

/** Base64 wie im Browser (`atob`), ohne Node-`Buffer`; in Blöcken, damit der Argument-Stack reicht. */
export function encodeMinutes(bytes: Uint8Array): string {
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
 * Rechnet die ganze Tabelle. `places` sind die Orte der Angebote in `site.json`-Reihenfolge, Doppelte zählen
 * einmal. `egressMeters` dient nur dem Vergleich in Schritt 5 (800 gegen 1 000 m).
 */
export function buildTransitTable(
  timetable: Timetable,
  places: readonly GeoPoint[],
  opts: { egressMeters?: number } = {},
): TransitTableFile {
  const columns = new Map<string, GeoPoint>();
  for (const p of places) if (!columns.has(placeKey(p))) columns.set(placeKey(p), p);
  const rows = tableRows(timetable);
  const from = clockSeconds(timetable.window.from);
  const count = (clockSeconds(timetable.window.to) - from) / STEP_SECONDS;
  const net = buildNetwork(timetable, { from });
  const cols = columns.size;
  const bytes = new Uint8Array(rows.length * cols);
  const swept = new Float64Array(count);
  const best = new Float64Array(count);
  const x = new Array<number>(count);

  [...columns.values()].forEach((place, col) => {
    const egress = egressSeconds(net, place, opts.egressMeters ?? EGRESS_METERS);
    const profiles = scanProfiles(net, egress);
    rows.forEach((row, r) => {
      best.fill(Number.POSITIVE_INFINITY);
      for (const s of row.steige) {
        profiles.sweep(s, from, STEP_SECONDS, count, swept);
        const walk = valueAt(egress, s);
        for (let m = 0; m < count; m++) {
          const t = from + m * STEP_SECONDS;
          best[m] = Math.min(valueAt(best, m), valueAt(swept, m), t + walk);
        }
      }
      for (let m = 0; m < count; m++) x[m] = (valueAt(best, m) - (from + m * STEP_SECONDS)) / 60;
      bytes[r * cols + col] = cellValue(x);
    });
  });

  const { attribution, title, url, license, licenseUrl, validFrom, validTo } = timetable.source;
  return {
    version: TRANSIT_TABLE_VERSION,
    source: { attribution, title, url, license, licenseUrl, validFrom, validTo },
    serviceDay: timetable.serviceDay,
    window: { from: timetable.window.from, to: timetable.window.to },
    places: [...columns.keys()],
    lat: delta(rows.map((r) => r.lat)),
    lon: delta(rows.map((r) => r.lon)),
    minutes: encodeMinutes(bytes),
  };
}
