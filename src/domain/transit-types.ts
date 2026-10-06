/**
 * Typen der Wegzeit-Tabelle (Plan 0009, E7/E10; ADR 0011). Nur Typen: Dieses Modul darf jeder statisch
 * importieren, auch wenn `transit.ts` lazy geladen wird (wie `src/ui/map-types.ts`, M3).
 */

/**
 * Namensnennung nach CC BY-SA 3.0 DE, Abschnitt 4a/4c (E3); den Abwandlungshinweis setzt der Text
 * (`transitSourceNote` in src/ui/format.ts).
 */
export interface TransitSource {
  attribution: string;
  title: string;
  url: string;
  license: string;
  licenseUrl: string;
  validFrom: string;
  validTo: string;
  /**
   * Erklärung des Modells für den Quellenhinweis (Plan 0012, E10). Steht nie in den Dateien, erst `decodeTransitTable`
   * setzt ihn aus den Konstanten der Rechnung. So liegt der Text im Lazy-Chunk statt im Start-JS (Arch-Review 0012,
   * Befund 2).
   */
  rule?: string;
}

/**
 * `public/data/wegzeit.json`: Build-Artefakt wie `site.json`, ohne Zod im Client. Entsteht nur durch
 * `scripts/transit/table.ts`, geprüft im Round-Trip-Test (E12).
 */
export interface TransitTableFile {
  /** Formatversion 2 seit Plan 0012 (Umstiegs-Bit, `id`) */
  version: 2;
  /** Inhaltskennung über beide Build-Dateien (Plan 0012, E6): 8 Hex-Ziffern, `table` in `linien.json` */
  id: string;
  source: TransitSource;
  /** Referenz-Dienstag, „2026-10-13“ */
  serviceDay: string;
  /** Abfahrtsfenster, „08:30“–„10:30“ */
  window: { from: string; to: string };
  /** `placeKey` je Spalte, in der Reihenfolge der ersten Nennung in `site.json` */
  places: string[];
  /** Zeilen (Haltbereiche): Grad × 1e4, ganzzahlig, ab dem zweiten Wert als Differenz zum vorigen */
  lat: number[];
  lon: number[];
  /**
   * Base64 eines `Uint8Array(Zeilen × Spalten)`, zeilenweise. Bit 0–6: Minuten 0–120; Bit 7: die Verbindung hat
   * einen Umstieg (Plan 0012, E2). 255 = keine Angabe.
   */
  minutes: string;
}

/** `public/data/linien.json` (Plan 0012, E7): Linien je Zelle der Wegzeit-Tabelle */
export interface TransitLinesFile {
  version: 1;
  /** `id` der passenden `wegzeit.json` (E6) */
  table: string;
  /** Namensnennung wie `wegzeit.json` (CC BY-SA 3.0 DE, ADR 0011 Punkt 5) */
  source: TransitSource;
  /** Anzeigenamen, sortiert (Code-Unit), höchstens 254: „Bus 36“, „S2“, „Tram 4“, „U1“ (mit U+00A0) */
  lines: string[];
  /** Base64 eines `Uint8Array(Zeilen × Spalten)`, zeilenweise wie `minutes`: erste Linie, 0 = keine, sonst `lines[v − 1]` */
  first: string;
  /** dasselbe für die zweite Linie (nach dem Umstieg), 0 = keine (Direktverbindung oder keine Linien) */
  second: string;
}

/** Dekodierte Tabelle (`decodeTransitTable`). */
export interface TransitTable {
  /** Inhaltskennung (E6), prüft die Linien-Datei */
  id: string;
  source: TransitSource;
  serviceDay: string;
  window: { from: string; to: string };
  places: readonly string[];
  /** `placeKey` → Spaltenindex */
  columns: ReadonlyMap<string, number>;
  /** Mittelpunkt je Haltbereich in Grad */
  lat: Float64Array;
  lon: Float64Array;
  /** Zeilen × Spalten, zeilenweise; Bit 7 = Umstieg, 255 = keine Angabe */
  minutes: Uint8Array;
}

/** Dekodierte Linien (`decodeTransitLines`, Plan 0012, E8): Ebenen wie `TransitLinesFile`, Werte Index + 1 in `names` */
export interface TransitLines {
  names: readonly string[];
  first: Uint8Array;
  second: Uint8Array;
}

/**
 * Wegzeit mit Bus & Bahn oder zu Fuß (E8). `minutes` ist ungerundet; `Infinity` heißt „über 2 Std.“
 * bzw. unerreichbar. Zweig der Union `Reach` (`src/domain/reach.ts`).
 */
export interface TransitReach {
  kind: "oepnv";
  minutes: number;
  byFoot: boolean;
  /** Linien der Verbindung („Bus 37“, „U1“), nur mit Bus & Bahn bis 120 Min. und wenn Linien vorliegen (Plan 0012) */
  lines?: TransitLineNames;
  /**
   * Fußweg in Minuten (ungerundet) zum Halt der Verbindung. Genau dann, wenn es Linien gibt, also mit Bus & Bahn
   * bis 120 Min. (Plan 0019, E4).
   */
  toStop?: number;
  /** Die Verbindung hat einen Umstieg (Umstiegs-Bit); nur zusammen mit `toStop` */
  transfer?: true;
  /** Andere Wege, höchstens zwei, aufsteigend nach Minuten; fehlt ohne andere Wege, nie leer (Plan 0019, E4) */
  others?: readonly TransitOther[];
}

/** Linien einer Verbindung, die zweite nach dem Umstieg */
export type TransitLineNames = readonly [string] | readonly [string, string];

/** Ein anderer Weg zum selben Ort (Plan 0019, E4): zu Fuß oder mit Bus & Bahn ab einem anderen Halt */
export type TransitOther =
  | { byFoot: true; minutes: number }
  | { byFoot: false; minutes: number; toStop: number; lines: TransitLineNames; transfer?: true };
