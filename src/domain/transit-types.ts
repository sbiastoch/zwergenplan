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
}

/**
 * `public/data/wegzeit.json`: Build-Artefakt wie `site.json`, ohne Zod im Client. Entsteht nur durch
 * `scripts/transit/table.ts`, geprüft im Round-Trip-Test (E12).
 */
export interface TransitTableFile {
  version: 1;
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
  /** Base64 eines `Uint8Array(Zeilen × Spalten)`, zeilenweise; Minuten 0–120, 255 = keine Angabe */
  minutes: string;
}

/** Dekodierte Tabelle (`decodeTransitTable`). */
export interface TransitTable {
  source: TransitSource;
  serviceDay: string;
  window: { from: string; to: string };
  places: readonly string[];
  /** `placeKey` → Spaltenindex */
  columns: ReadonlyMap<string, number>;
  /** Mittelpunkt je Haltbereich in Grad */
  lat: Float64Array;
  lon: Float64Array;
  /** Zeilen × Spalten, zeilenweise */
  minutes: Uint8Array;
}

/**
 * Wegzeit mit Bus & Bahn oder zu Fuß (E8). `minutes` ist ungerundet; `Infinity` heißt „über 2 Std.“
 * bzw. unerreichbar. Zweig der Union `Reach` (`src/domain/reach.ts`).
 */
export interface TransitReach {
  kind: "oepnv";
  minutes: number;
  byFoot: boolean;
}
