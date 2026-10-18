/**
 * Gates der Wegzeit je Netz (Plan 0039, E5): aus den Zahlen einer Tabelle Fehler (Build rot) und Warnungen
 * (`::warning::`). `build-data` gibt sie aus und bricht bei Fehlern ab.
 *
 * Rein: keine Dateien, kein Netz (dependency-cruiser `transit-build-pure`).
 */
import { DISTRICTS_BY_REGION } from "../../src/domain/districts.ts";
import { type NetworkId, regionsOf } from "../../src/domain/regions.ts";
import type { TransitTable } from "../../src/domain/transit-types.ts";
import { type TransitBuildStats, withoutAccess } from "./table.ts";

/** Ab hier warnt der Build, je Netz: Die Profil-CSA läuft in jedem data:build (Plan 0009, Backpressure). */
export const TRANSIT_WARN_SECONDS = 20;
/**
 * Gate gegen einen stillen Ausfall der Linien (Plan 0012, E7, Review W3): Mit echten Daten darf höchstens dieser
 * Anteil der Zellen mit Wegzeit ohne Linien sein. Gemessen am 2026-10-05 am VGN (Auszug Stichtag 13.10.2026,
 * 556 × 76): 1 514 von 35 226 Zellen = 4,3 %; Schwelle = Messwert + 5 Prozentpunkte. Gilt vorerst für jedes Netz;
 * für `vrr` misst Plan 0039, S11 nach dem Bootstrap nach.
 */
const MAX_WITHOUT_LINES = 0.093;

const pct = (v: number) => `${(v * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;

export interface TransitGateInput {
  network: NetworkId;
  stats: Pick<TransitBuildStats, "cells" | "withoutLines">;
  /** Spalten der Tabelle (Orte der Angebote im Netz) */
  places: number;
  /** Rechenzeit der Tabelle */
  seconds: number;
  /** echter Build (`source === "real"`): nur dann gilt `MAX_WITHOUT_LINES` */
  real: boolean;
}

/**
 * Linien- und Laufzeit-Gates eines Netzes. Ohne Orte (etwa Düsseldorf zwischen Push und Bootstrap) prüft es die
 * Linien nicht und warnt nur; sonst wäre der Deploy-Build rot, bevor das Entdecken Anbieter liefern kann (Review B1).
 */
export function transitGates(input: TransitGateInput): { errors: string[]; warnings: string[] } {
  const { network, stats, places, seconds, real } = input;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (places === 0) {
    warnings.push(`Netz ${network} ohne Orte – Linien-Gates übersprungen`);
  } else if (stats.withoutLines === stats.cells) {
    errors.push(`Netz ${network}: keine Zelle hat Linien (Plan 0012, E7)`);
  } else {
    const share = stats.withoutLines / stats.cells;
    if (real && share > MAX_WITHOUT_LINES) {
      errors.push(
        `Netz ${network}: ${pct(share)} der Zellen ohne Linien, erlaubt ${pct(MAX_WITHOUT_LINES)} (Plan 0012, E7)`,
      );
    }
  }
  if (seconds > TRANSIT_WARN_SECONDS) {
    const took = seconds.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    warnings.push(
      `Netz ${network}: Wegzeit-Berechnung dauerte ${took} s (> ${TRANSIT_WARN_SECONDS} s) – Cache über einen Hash aus Auszug und Orten erwägen (Plan 0009, Backpressure)`,
    );
  }
  return { errors, warnings };
}

/**
 * Namen der Stadtteile in den Regionen des Netzes ohne Zugangshalt im Umkreis von `INSIDE_METERS` (Plan 0009,
 * Schritt 5; je Netz seit Plan 0039, E5). Jeder wählbare Stadtteil braucht einen, sonst hieße es dort „außerhalb“.
 * `undefined` (Tabelle nicht dekodierbar) ⇒ alle.
 */
export function accessIssues(table: Pick<TransitTable, "lat" | "lon"> | undefined, network: NetworkId): string[] {
  const districts = regionsOf(network).flatMap((r) => DISTRICTS_BY_REGION[r]);
  return (table ? withoutAccess(table, districts) : districts).map((d) => d.name);
}
