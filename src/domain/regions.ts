/**
 * Regionen des Katalogs (Plan 0031, E1; ADR 0025). Jeder Katalog-Eintrag nennt seine `region`; das Schema prüft die
 * Orte gegen deren bbox. Heute gibt es genau eine Region. Weitere Felder (Ferienland, ÖPNV-Feed, Kamera-Startpunkt)
 * kommen erst mit einer zweiten Region, weil heute nichts sie liest (Plan 0031, Review 2 m9). Ausnahme ist
 * `population`: Die Stadt-Kacheln des Onboardings sortieren danach (Plan 0033, E5; Nachtrag ADR 0025). Rein und ohne
 * Zod.
 */
import { type BBox, NUERNBERG_BBOX } from "./geo.ts";

export interface Region {
  name: string;
  bbox: BBox;
  /** Einwohner, auf Tausend gerundet, mit Quelle und Stichtag im Kommentar; nie geschätzt (Plan 0033, E5) */
  population: number;
}

export const REGION_IDS = ["nuernberg"] as const;
export type RegionId = (typeof REGION_IDS)[number];

export const REGIONS: Record<RegionId, Region> = {
  // 526 606 Einwohner am 31.12.2023, Fortschreibung auf Basis Zensus 2022: Bayerisches Landesamt für Statistik,
  // „Statistik kommunal 2024“, Kreisfreie Stadt Nürnberg (09564), Tabelle 1 (abgerufen 2026-10-11)
  nuernberg: { name: "Nürnberg", bbox: NUERNBERG_BBOX, population: 527_000 },
};
