/**
 * Linien je Zelle der Wegzeit-Tabelle (Plan 0012, E1/E4/E7; ADR 0015): Anzeigenamen, die häufigste Folge im
 * Fenster und ihre Kodierung für `public/data/linien.json`.
 *
 * Rein: keine Dateien, kein Netz (dependency-cruiser `transit-build-pure`).
 */
import type { TransitMode } from "../../src/domain/schema.ts";
import { NO_MINUTES, valueAt } from "../../src/domain/transit.ts";

/** Passung (E4, Schritt 5): Abweichung der Folge vom Zellwert höchstens max(3 Min., 25 %), sonst keine Linien */
export const LINES_FIT_MIN_MINUTES = 3;
export const LINES_FIT_SHARE = 0.25;
/** Bytewerte 1–254 je Ebene; 0 = keine Linie, 255 bleibt frei (E7) */
const MAX_LINES = 254;

const NBSP = "\u00a0";

/**
 * Anzeigename (E1): „Tram 4“, „Bus 36“, „U1“, „S2“, „RB 11“. Leerzeichen werden zu U+00A0, damit Art und Nummer
 * nie auf zwei Zeilen landen (Review W4).
 */
export function lineLabel(route: string, mode: TransitMode): string {
  const name = mode === "tram" ? `Tram ${route}` : mode === "bus" ? `Bus ${route}` : route;
  return name.replaceAll(" ", NBSP);
}

/** Code-Unit-Vergleich: unabhängig von der Locale, also deterministisch (eigene Kopie, E4). */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Folge der Linien einer Verbindung */
export interface Combo {
  /** Anzeigenamen, gleiche Nachbarn zusammengefasst („U1 → U1“ → „U1“); leer = zu Fuß vom Halt */
  names: readonly string[];
  /** Zahl der Fahrten (0, 1 oder 2), auch bei zusammengefasstem Namen (Umstiegs-Bit, Review 2, H3) */
  legs: number;
  /** Schlüssel zum Deduplizieren: Namen und Fahrtenzahl */
  key: string;
}

/** Folge aus den Anzeigenamen der Fahrten einer Verbindung (E4, L3) */
export function comboOf(labels: readonly string[]): Combo {
  const names = labels.filter((name, i) => i === 0 || labels[i - 1] !== name);
  return { names, legs: labels.length, key: `${names.join("\u0000")}\u0000${labels.length}` };
}

/** Median wie `cellValue`, aber ungerundet */
function median(values: readonly number[]): number {
  const x = Float64Array.from(values).sort();
  const mid = x.length / 2;
  return x.length % 2 === 0 ? (valueAt(x, mid - 1) + valueAt(x, mid)) / 2 : valueAt(x, Math.floor(mid));
}

export interface CellLines {
  /** gewählte Folge (Index in `combos`), −1 = keine Linien */
  combo: number;
  /** Umstiegs-Bit (E2): Die häufigste Folge hat zwei Fahrten, vor der Passungsprüfung */
  transfer: boolean;
  /** Linien wegen der Passung verworfen (E4, Schritt 5) */
  outlier: boolean;
}

/**
 * Linien einer Zelle (E4): häufigste Folge über die Minuten mit endlicher Zeit; bei Gleichstand weniger Linien,
 * dann kleinerer Median der Zeit, dann der Text, dann weniger Fahrten. Keine Linien bei Wert 255, bei leerer
 * Folge und wenn die Folge nicht zur Angabe passt.
 */
export function cellLines(
  value: number,
  minutes: { combo: ArrayLike<number>; x: ArrayLike<number> },
  combos: readonly Combo[],
): CellLines {
  const none: CellLines = { combo: -1, transfer: false, outlier: false };
  if (value === NO_MINUTES) return none;
  const byCombo = new Map<number, number[]>();
  for (let m = 0; m < minutes.x.length; m++) {
    const x = valueAt(minutes.x, m);
    if (!Number.isFinite(x)) continue;
    const c = valueAt(minutes.combo, m);
    const list = byCombo.get(c);
    if (list) list.push(x);
    else byCombo.set(c, [x]);
  }
  // häufigste Folge; den Median nur bei Gleichstand und für die Passung (Laufzeit, E4)
  let most = 0;
  for (const xs of byCombo.values()) most = Math.max(most, xs.length);
  let best: { combo: Combo; index: number; xs: number[]; median?: number } | undefined;
  for (const [index, xs] of byCombo) {
    if (xs.length !== most) continue;
    const combo = combos[index];
    if (!combo) throw new RangeError(`Folge ${index} unbekannt`);
    const cand: { combo: Combo; index: number; xs: number[]; median?: number } = { combo, index, xs };
    if (best && !before(cand, best)) continue;
    best = cand;
  }
  if (!best || best.combo.names.length === 0) return none;
  const transfer = best.combo.legs === 2;
  const d = Math.abs((best.median ?? median(best.xs)) - value);
  if (d > Math.max(LINES_FIT_MIN_MINUTES, LINES_FIT_SHARE * value)) return { combo: -1, transfer, outlier: true };
  return { combo: best.index, transfer, outlier: false };
}

/** Gleichstand der Häufigkeit (E4): weniger Linien, dann kleinerer Median, dann der Text, dann weniger Fahrten */
function before(
  a: { combo: Combo; xs: number[]; median?: number },
  b: { combo: Combo; xs: number[]; median?: number },
): boolean {
  const lines = a.combo.names.length - b.combo.names.length;
  if (lines !== 0) return lines < 0;
  a.median ??= median(a.xs);
  b.median ??= median(b.xs);
  if (a.median !== b.median) return a.median < b.median;
  const text = cmp(a.combo.names.join(" "), b.combo.names.join(" "));
  if (text !== 0) return text < 0;
  return a.combo.legs < b.combo.legs;
}

/**
 * Zwei Byte-Ebenen für `linien.json` (E7): je Zelle die erste und die zweite Linie als Index + 1 in `lines`
 * (sortiert), 0 = keine. Wirft bei mehr als 254 Namen.
 */
export function encodeLines(
  cells: ArrayLike<number>,
  combos: readonly Combo[],
): { lines: string[]; first: Uint8Array; second: Uint8Array } {
  const used = new Set<string>();
  for (let i = 0; i < cells.length; i++) {
    const c = valueAt(cells, i);
    if (c !== -1) for (const name of combos[c]?.names ?? []) used.add(name);
  }
  const lines = [...used].sort(cmp);
  if (lines.length > MAX_LINES) throw new Error(`Linien-Datei: ${lines.length} Linien, höchstens ${MAX_LINES}`);
  const code = new Map(lines.map((name, i) => [name, i + 1]));
  const first = new Uint8Array(cells.length);
  const second = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = valueAt(cells, i);
    if (c === -1) continue;
    const [a, b] = combos[c]?.names ?? [];
    first[i] = a === undefined ? 0 : (code.get(a) ?? 0);
    second[i] = b === undefined ? 0 : (code.get(b) ?? 0);
  }
  return { lines, first, second };
}
