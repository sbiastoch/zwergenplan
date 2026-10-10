/**
 * Regionen des Katalogs (Plan 0031, E1; ADR 0025). Jeder Katalog-Eintrag nennt seine `region`; das Schema prüft die
 * Orte gegen deren bbox. Heute gibt es genau eine Region. Weitere Felder (Ferienland, ÖPNV-Feed, Kamera-Startpunkt)
 * kommen erst mit einer zweiten Region, weil heute nichts sie liest (Plan 0031, Review 2 m9). Rein und ohne Zod.
 */
import { type BBox, NUERNBERG_BBOX } from "./geo.ts";

export interface Region {
  name: string;
  bbox: BBox;
}

export const REGION_IDS = ["nuernberg"] as const;
export type RegionId = (typeof REGION_IDS)[number];

export const REGIONS: Record<RegionId, Region> = {
  nuernberg: { name: "Nürnberg", bbox: NUERNBERG_BBOX },
};
