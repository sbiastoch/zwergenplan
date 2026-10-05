/**
 * Wegzeit mit Bus & Bahn ab einem beliebigen Startpunkt (Plan 0009, E8/E9; ADR 0011). Der Build rechnet je
 * Haltbereich die Tür-zu-Tür-Zeit zu jedem Ort (`scripts/transit/table.ts`); hier kommt nur noch der Fußweg
 * vom Startpunkt zu den Halten im Umkreis dazu. Rein, ohne Zod, ohne Uhrzeit: läuft im Browser und im Build.
 */
import { haversineMeters } from "./geo.ts";
import { placeKey } from "./place-key.ts";
import type { Origin, ReachTarget } from "./reach.ts";
import type { TransitReach, TransitTable, TransitTableFile } from "./transit-types.ts";

/** Formatversion von `wegzeit.json` (E7); 2 seit Plan 0012 (Umstiegs-Bit, `id`) */
export const TRANSIT_TABLE_VERSION = 2;
/** Größter gespeicherter Wert; mehr gilt als „über 2 Std.“ (E5) */
export const MAX_MINUTES = 120;
/** Zellwert „keine Angabe“: unerreichbar oder über `MAX_MINUTES` (E5) */
export const NO_MINUTES = 255;
/** Koordinaten der Zeilen in Grad × 1e4 (E7) */
export const COORD_SCALE = 1e4;
/** Zugangshalte: Luftlinie Startpunkt → Haltbereich, Grenze inklusiv (E8) */
export const ACCESS_METERS = 800;
/**
 * Innen-Test (ADR 0011, Punkt 9; Plan 0012, E2): Ohne Haltbereich in diesem Umkreis liegt der Startpunkt
 * außerhalb des Stadtgebiets. Grenze inklusiv.
 */
export const INSIDE_METERS = 800;
/** Bit 7 eines Zellwerts: Die Verbindung hat einen Umstieg (Plan 0012, E2) */
export const TRANSFER_BIT = 0x80;
/**
 * Aufschlag je Umstieg in der Wahl der Verbindung, nie in der angezeigten Zeit (Plan 0012, E2; ADR 0015):
 * Ein Umstieg zählt nur, wenn er mindestens so viel früher ankommt. Einzige Quelle, der Build leitet davon ab.
 */
export const TRANSFER_PENALTY_MINUTES = 10;

/** Umwegfaktor auf die Luftlinie (E6) */
const DETOUR = 1.3;
/** 4,5 km/h, Kinderwagen-Tempo (E6) */
const METERS_PER_MINUTE = 75;

/** Fußweg in Minuten: Luftlinie × 1,3 bei 4,5 km/h. Dieselbe Funktion gilt im Build und im Browser (E6). */
export function walkMinutes(meters: number): number {
  return (meters * DETOUR) / METERS_PER_MINUTE;
}

/**
 * Liest `values[index]` ohne toten `?? 0`-Zweig: Alle Indizes dieser Rechnung ergeben sich aus den
 * Schleifengrenzen. `noUncheckedIndexedAccess` sieht das nicht; ein ungültiger Index ist ein Programmierfehler
 * und wirft. Gilt auch für den Build (`scripts/transit`).
 */
export function valueAt(values: ArrayLike<number>, index: number): number {
  const v = values[index];
  if (v === undefined) throw new RangeError(`Index ${index} außerhalb von 0…${values.length - 1}`);
  return v;
}

const isIntArray = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => Number.isInteger(v));

/** Kumulierte Differenzen (Grad × 1e4) → Grad. Ganzzahlig summiert, damit sich kein Rundungsfehler aufbaut. */
function undelta(values: readonly number[]): Float64Array {
  const out = new Float64Array(values.length);
  let acc = 0;
  values.forEach((v, i) => {
    acc += v;
    out[i] = acc / COORD_SCALE;
  });
  return out;
}

function fromBase64(text: string): Uint8Array | undefined {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return undefined;
  }
  // `Uint8Array.fromBase64` fehlt noch in einigen Zielbrowsern (E5).
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Prüft und dekodiert `wegzeit.json`. `undefined`, wenn Version oder Längen nicht passen oder ein Ort der
 * Seite keine Spalte hat (z. B. alte `wegzeit.json` aus dem HTTP-Cache zur neuen `site.json`, E8).
 * Die Datei kommt ungeprüft aus dem Netz, daher die Typprüfung ohne Zod.
 */
export function decodeTransitTable(file: TransitTableFile, placeKeys: ReadonlySet<string>): TransitTable | undefined {
  if (typeof file !== "object" || file === null || file.version !== TRANSIT_TABLE_VERSION) return undefined;
  const { id, places, lat, lon, minutes } = file;
  if (typeof id !== "string" || !Array.isArray(places) || !isIntArray(lat) || !isIntArray(lon)) return undefined;
  if (typeof minutes !== "string" || lat.length !== lon.length) return undefined;
  const bytes = fromBase64(minutes);
  if (bytes === undefined || bytes.length !== lat.length * places.length) return undefined;
  // jedes Byte ist „keine Angabe“ oder Minuten ≤ 120, mit oder ohne Umstiegs-Bit (E6)
  for (const b of bytes) if (b !== NO_MINUTES && (b & ~TRANSFER_BIT) > MAX_MINUTES) return undefined;
  const columns = new Map(places.map((key, i) => [key, i]));
  for (const key of placeKeys) if (!columns.has(key)) return undefined;
  return {
    id,
    source: file.source,
    serviceDay: file.serviceDay,
    window: file.window,
    places,
    columns,
    lat: undelta(lat),
    lon: undelta(lon),
    minutes: bytes,
  };
}

/** Wegzeit je Ort ab einem Startpunkt (E8). */
export type TransitReachFn = (target: ReachTarget) => TransitReach;

/**
 * Wegzeit ab `origin`: je Ort das Minimum aus direktem Fußweg und Fußweg zu einem Zugangshalt plus
 * Tabellenwert. `undefined`, wenn kein Halt im Umkreis von `ACCESS_METERS` liegt (Modus „ausserhalb“, E11).
 * Der Bahnanteil wird einmal je Startpunkt für alle Spalten gerechnet, das Ergebnis je Ort zwischengespeichert.
 */
export function transitReach(table: TransitTable, origin: Origin): TransitReachFn | undefined {
  const { lat, lon, minutes, columns } = table;
  const cols = table.places.length;
  const byTransit = new Float64Array(cols).fill(Number.POSITIVE_INFINITY);
  let access = 0;
  for (let row = 0; row < lat.length; row++) {
    const meters = haversineMeters(origin.point, { lat: valueAt(lat, row), lon: valueAt(lon, row) });
    if (meters > ACCESS_METERS) continue;
    access++;
    const walk = walkMinutes(meters);
    for (let col = 0; col < cols; col++) {
      const byte = valueAt(minutes, row * cols + col);
      if (byte !== NO_MINUTES) byTransit[col] = Math.min(valueAt(byTransit, col), walk + (byte & ~TRANSFER_BIT));
    }
  }
  if (access === 0) return undefined;

  const cache = new Map<string, TransitReach>();
  return ({ geo }) => {
    const key = placeKey(geo);
    const hit = cache.get(key);
    if (hit) return hit;
    const col = columns.get(key);
    const transit = col === undefined ? Number.POSITIVE_INFINITY : valueAt(byTransit, col);
    const walk = walkMinutes(haversineMeters(origin.point, geo));
    const direct = walk <= MAX_MINUTES ? walk : Number.POSITIVE_INFINITY;
    const byFoot = direct <= transit && Number.isFinite(direct);
    const reach: TransitReach = { kind: "oepnv", minutes: byFoot ? direct : transit, byFoot };
    cache.set(key, reach);
    return reach;
  };
}
