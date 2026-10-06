/**
 * Wegzeit mit Bus & Bahn ab einem beliebigen Startpunkt (Plan 0009, E8/E9; ADR 0011). Der Build rechnet je
 * Haltbereich die Tür-zu-Tür-Zeit zu jedem Ort (`scripts/transit/table.ts`); hier kommt nur noch der Fußweg
 * vom Startpunkt zu den Halten im Umkreis dazu, mit Aufschlag für Umstiege in der Wahl und den Linien der
 * gewählten Zeile (Plan 0012, E8; ADR 0015). Rein, ohne Zod, ohne Uhrzeit: läuft im Browser und im Build.
 */
import { haversineMeters } from "./geo.ts";
import { placeKey } from "./place-key.ts";
import { type Origin, type ReachTarget, roundedMinutes } from "./reach.ts";
import type {
  TransitLineNames,
  TransitLines,
  TransitLinesFile,
  TransitOther,
  TransitReach,
  TransitTable,
  TransitTableFile,
} from "./transit-types.ts";

/** Formatversion von `wegzeit.json` (E7); 2 seit Plan 0012 (Umstiegs-Bit, `id`) */
export const TRANSIT_TABLE_VERSION = 2;
/** Größter gespeicherter Wert; mehr gilt als „über 2 Std.“ (E5) */
export const MAX_MINUTES = 120;
/** Zellwert „keine Angabe“: unerreichbar oder über `MAX_MINUTES` (E5) */
export const NO_MINUTES = 255;
/** Koordinaten der Zeilen in Grad × 1e4 (E7) */
export const COORD_SCALE = 1e4;
/** Zugangshalte: Luftlinie Startpunkt → Haltbereich, Grenze inklusiv (E8; 1 500 m seit Plan 0012, E2) */
export const ACCESS_METERS = 1500;
/**
 * Innen-Test (ADR 0011, Punkt 9; Plan 0012, E2): Ohne Haltbereich in diesem Umkreis liegt der Startpunkt
 * außerhalb des Stadtgebiets. Grenze inklusiv.
 */
export const INSIDE_METERS = 800;
/** Bit 7 eines Zellwerts: Die Verbindung hat einen Umstieg (Plan 0012, E2) */
export const TRANSFER_BIT = 0x80;
/** Formatversion von `linien.json` (Plan 0012, E7) */
const TRANSIT_LINES_VERSION = 1;
/** Bytewerte 1–254 je Ebene (E7) */
const MAX_LINE_NAMES = 254;
/**
 * Aufschlag je Umstieg in der Wahl der Verbindung, nie in der angezeigten Zeit (Plan 0012, E2; ADR 0015):
 * Ein Umstieg zählt nur, wenn er mindestens so viel früher ankommt. Einzige Quelle, der Build leitet davon ab.
 */
export const TRANSFER_PENALTY_MINUTES = 10;
/**
 * Erklärung des Modells im Quellenhinweis des Kind-Sheets (Plan 0012, E10), aus denselben Konstanten wie die
 * Rechnung. Der Abgang im Build (`EGRESS_METERS`) ist gleich `ACCESS_METERS`, das prüft ein Test. Steht hier im
 * Lazy-Chunk statt in `src/ui/format.ts`, um Start-JS zu sparen (Arch-Review 0012, Befund 2).
 */
export const TRANSIT_RULE = `Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß für einen Dienstagvormittag, inklusive Warten. Direktverbindungen gehen vor, ein Umstieg nur, wenn er mindestens ${TRANSFER_PENALTY_MINUTES} Min. spart; mehr als einen Umstieg gibt es nicht, dann lieber zu Fuß (bis ${String(ACCESS_METERS / 1000).replace(".", ",")} km zum und vom Halt). Genannt sind die Linien der häufigsten Verbindung.`;

/** Andere Wege (Plan 0019, E4): höchstens so viele Minuten länger als der Hauptweg, Grenze inklusiv */
export const OTHER_SLACK_MINUTES = 15;
/** Andere Wege: höchstens so viele (Plan 0019, E4) */
export const MAX_OTHERS = 2;

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
    source: { ...file.source, rule: TRANSIT_RULE },
    serviceDay: file.serviceDay,
    window: file.window,
    places,
    columns,
    lat: undelta(lat),
    lon: undelta(lon),
    minutes: bytes,
  };
}

/**
 * Prüft und dekodiert `linien.json` (Plan 0012, E8). `undefined`, wenn Version, Kennung (`table` ≠ `id` der
 * Tabelle), Namen oder Ebenen nicht passen; dann bleibt die Wegzeit ohne Linien. Ohne Zod wie die Tabelle.
 */
export function decodeTransitLines(file: TransitLinesFile, table: TransitTable): TransitLines | undefined {
  if (typeof file !== "object" || file === null || file.version !== TRANSIT_LINES_VERSION) return undefined;
  if (file.table !== table.id) return undefined;
  const { lines: names } = file;
  if (!Array.isArray(names) || names.length > MAX_LINE_NAMES) return undefined;
  if (!names.every((n) => typeof n === "string")) return undefined;
  const cells = table.lat.length * table.places.length;
  const first = typeof file.first === "string" ? fromBase64(file.first) : undefined;
  const second = typeof file.second === "string" ? fromBase64(file.second) : undefined;
  if (first === undefined || second === undefined || first.length !== cells || second.length !== cells) {
    return undefined;
  }
  for (let i = 0; i < cells; i++) {
    const a = valueAt(first, i);
    const b = valueAt(second, i);
    if (a > names.length || b > names.length || (a === 0 && b !== 0)) return undefined;
  }
  return { names, first, second };
}

/** Wegzeit je Ort ab einem Startpunkt (E8). */
export type TransitReachFn = (target: ReachTarget) => TransitReach;

/**
 * Wegzeit ab `origin` (E8; Plan 0012, E2/E8): je Ort die kleinste Bewertung über die Zugangshalte im Umkreis von
 * `ACCESS_METERS` (Fußweg zum Halt + Tabellenwert, bei Umstiegs-Bit + `TRANSFER_PENALTY_MINUTES`), bei
 * Gleichstand die erste Zeile; angezeigt wird die echte Zeit. Zu Fuß, wenn der direkte Fußweg höchstens so lang
 * ist wie diese Bewertung. `undefined`, wenn kein Halt im Umkreis von `INSIDE_METERS` liegt (Modus „ausserhalb“,
 * E11). Mit `lines` tragen Ergebnisse mit Bus & Bahn bis 120 Min. die Linien der gewählten Zeile.
 * Der Bahnanteil wird einmal je Startpunkt für alle Spalten gerechnet, das Ergebnis je Ort zwischengespeichert.
 */
export function transitReach(table: TransitTable, origin: Origin, lines?: TransitLines): TransitReachFn | undefined {
  const { lat, lon, minutes, columns } = table;
  const cols = table.places.length;
  const byRated = new Float64Array(cols).fill(Number.POSITIVE_INFINITY);
  const byReal = new Float64Array(cols).fill(Number.POSITIVE_INFINITY);
  const bestRow = new Int32Array(cols).fill(-1);
  /** Zugangshalte mit Fußweg, nach Zeile: Grundlage der anderen Wege (Plan 0019, E4) */
  const near: Access[] = [];
  let inside = false;
  for (let row = 0; row < lat.length; row++) {
    const meters = haversineMeters(origin.point, { lat: valueAt(lat, row), lon: valueAt(lon, row) });
    if (meters <= INSIDE_METERS) inside = true;
    if (meters > ACCESS_METERS) continue;
    const walk = walkMinutes(meters);
    near.push({ row, walk });
    for (let col = 0; col < cols; col++) {
      const byte = valueAt(minutes, row * cols + col);
      if (byte === NO_MINUTES) continue;
      const real = walk + (byte & ~TRANSFER_BIT);
      const rated = byte & TRANSFER_BIT ? real + TRANSFER_PENALTY_MINUTES : real;
      if (rated < valueAt(byRated, col)) {
        byRated[col] = rated;
        byReal[col] = real;
        bestRow[col] = row;
      }
    }
  }
  if (!inside) return undefined;

  const cache = new Map<string, TransitReach>();
  return ({ geo }) => {
    const key = placeKey(geo);
    const hit = cache.get(key);
    if (hit) return hit;
    const col = columns.get(key);
    const rated = col === undefined ? Number.POSITIVE_INFINITY : valueAt(byRated, col);
    const real = col === undefined ? Number.POSITIVE_INFINITY : valueAt(byReal, col);
    const walk = walkMinutes(haversineMeters(origin.point, geo));
    const direct = walk <= MAX_MINUTES ? walk : Number.POSITIVE_INFINITY;
    const byFoot = direct <= rated && Number.isFinite(direct);
    const reach: TransitReach = { kind: "oepnv", minutes: byFoot ? direct : real, byFoot };
    const row = col === undefined ? -1 : valueAt(bestRow, col);
    const names = !byFoot && real <= MAX_MINUTES && col !== undefined ? linesAt(lines, row * cols + col) : undefined;
    let main: Way | undefined;
    if (names && col !== undefined) {
      const transfer = (valueAt(minutes, row * cols + col) & TRANSFER_BIT) !== 0;
      const toStop = valueAt(byReal, col) - (valueAt(minutes, row * cols + col) & ~TRANSFER_BIT);
      reach.lines = names;
      reach.toStop = toStop;
      if (transfer) reach.transfer = true;
      main = { byFoot: false, minutes: real, walk: toStop, transfer, lines: names, key: lineKey(names, transfer) };
    } else if (byFoot && lines) {
      main = { byFoot: true, minutes: direct, walk: direct, transfer: false, key: "" };
    }
    const others = main && col !== undefined && lines ? otherWays(main, col, direct) : undefined;
    if (others) reach.others = others;
    cache.set(key, reach);
    return reach;
  };

  /**
   * Andere Wege zu einer Spalte (Plan 0019, E4): je Linienfolge (mit Umstiegs-Bit) der schnellste Zugangshalt, dazu
   * zu Fuß, wenn der Hauptweg mit Bus & Bahn geht. Es bleibt, was höchstens `OTHER_SLACK_MINUTES` länger dauert
   * und auf den angezeigten Werten von keinem anderen Weg dominiert wird (Pareto über Minuten, Fußweg, Umstiege).
   */
  function otherWays(main: Way, col: number, direct: number): TransitOther[] | undefined {
    const best = new Map<string, Way>();
    for (const { row, walk } of near) {
      const cell = row * cols + col;
      const byte = valueAt(minutes, cell);
      const names = byte === NO_MINUTES ? undefined : linesAt(lines, cell);
      const real = walk + (byte & ~TRANSFER_BIT);
      if (!names || real > MAX_MINUTES) continue;
      const transfer = (byte & TRANSFER_BIT) !== 0;
      const key = lineKey(names, transfer);
      const prev = best.get(key);
      // Zeilen aufsteigend: bei Gleichstand bleibt die kleinere Zeilennummer
      if (!prev || real < prev.minutes || (real === prev.minutes && walk < prev.walk)) {
        best.set(key, { byFoot: false, minutes: real, walk, transfer, lines: names, key });
      }
    }
    best.delete(main.key);
    const pool = [...best.values()];
    if (!main.byFoot && direct <= MAX_MINUTES) {
      pool.push({ byFoot: true, minutes: direct, walk: direct, transfer: false, key: "" });
    }
    const inSlack = pool.filter((way) => way.minutes <= main.minutes + OTHER_SLACK_MINUTES);
    const all = [main, ...inSlack];
    const kept = inSlack
      .filter((way) => !all.some((other) => dominates(other, way)))
      .sort(
        (a, b) =>
          a.minutes - b.minutes ||
          Number(a.transfer) - Number(b.transfer) ||
          a.walk - b.walk ||
          codeUnits(a.key, b.key),
      )
      .slice(0, MAX_OTHERS)
      .map(toOther);
    return kept.length > 0 ? kept : undefined;
  }
}

/** Ein Weg in der Auswahl der anderen Wege (Plan 0019, E4); `walk` ist bei zu Fuß die ganze Zeit */
interface Way {
  byFoot: boolean;
  minutes: number;
  walk: number;
  transfer: boolean;
  lines?: TransitLineNames;
  /** Linienfolge mit Umstiegs-Bit; leer bei zu Fuß */
  key: string;
}

/** Zugangshalt im Umkreis: Zeile und Fußweg dorthin in Minuten */
interface Access {
  row: number;
  walk: number;
}

const lineKey = (names: TransitLineNames, transfer: boolean) => `${names.join(" → ")}${transfer ? " +" : ""}`;

/** Code-Unit-Vergleich, unabhängig von der Locale (wie `cmp` in scripts/transit/lines.ts) */
const codeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Werte, wie die Karte „Wege ab …“ sie zeigt (Review 3, H1): gerundete Minuten, Fußweg, Umstiege */
function shown(way: Way): [number, number, number] {
  const walk = way.byFoot ? roundedMinutes(way.walk).value : Math.max(1, Math.round(way.walk));
  return [roundedMinutes(way.minutes).value, walk, Number(way.transfer)];
}

/** `a` ist in allen angezeigten Werten gleich gut oder besser und in mindestens einem besser */
function dominates(a: Way, b: Way): boolean {
  const x = shown(a);
  const y = shown(b);
  return x.every((v, i) => v <= valueAt(y, i)) && x.some((v, i) => v < valueAt(y, i));
}

function toOther(way: Way): TransitOther {
  if (way.byFoot || !way.lines) return { byFoot: true, minutes: way.minutes };
  const other: TransitOther = { byFoot: false, minutes: way.minutes, toStop: way.walk, lines: way.lines };
  if (way.transfer) other.transfer = true;
  return other;
}

/** Linien einer Zelle, `undefined` ohne Linien-Datei, ohne Zeile oder bei erster Linie 0 */
function linesAt(lines: TransitLines | undefined, cell: number): TransitReach["lines"] {
  if (lines === undefined || cell < 0) return undefined;
  const a = lines.names[valueAt(lines.first, cell) - 1];
  if (a === undefined) return undefined;
  const b = lines.names[valueAt(lines.second, cell) - 1];
  return b === undefined ? [a] : [a, b];
}
