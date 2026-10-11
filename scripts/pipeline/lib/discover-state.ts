/**
 * Zustand des Entdeckens je Region, `data/discover/<region>.json` (Plan 0032, E7/E13). Eigenes kleines Modul, damit
 * `scripts/validate-data.ts` nur das Schema importiert, nicht die Logik des Entdeckens.
 */
import { z } from "zod";
import { KEBAB_ID_PATTERN, SHORT_ID_PATTERN } from "../../../src/domain/ids.ts";
import { REGION_IDS, type RegionId } from "../../../src/domain/regions.ts";

const IsoDate = z.iso.date();

/**
 * Zustand des Entdeckens je Region (`data/discover/<region>.json`, E5/E13), dauerhafter Zustand der Pipeline, kein
 * Vertrag der Website. `abgelehnt` pflegt ein Mensch (Rücknahme per Revert, E7); `zurueckgestellt` schreibt der Lauf
 * für Kandidaten ohne Ertrag oder mit verworfener Bewertung und legt sie nach 8 Wochen wieder vor.
 */
export const DiscoverState = z.strictObject({
  region: z.enum(REGION_IDS),
  abgelehnt: z.array(
    z
      .strictObject({
        url: z.url().optional(),
        /** ganzer Host (ohne `www.`), etwa ein Vermittler */
        host: z.string().min(3).optional(),
        name: z.string().optional(),
        /**
         * Katalog-ID und `publicId` eines zurückgenommenen Anbieters: werden nie neu vergeben, sonst zeigten alte
         * Links und Merklisten auf einen anderen Anbieter (ADR 0022)
         */
        id: z.string().regex(KEBAB_ID_PATTERN).optional(),
        publicId: z.string().regex(SHORT_ID_PATTERN).optional(),
        grund: z.string().min(1),
        datum: IsoDate,
      })
      .refine((a) => a.url !== undefined || a.host !== undefined || a.id !== undefined, "url, host oder id erwartet"),
  ),
  zurueckgestellt: z.array(
    z.strictObject({
      url: z.url(),
      name: z.string(),
      grund: z.string().min(1),
      datum: IsoDate,
      wiedervorlage: IsoDate,
    }),
  ),
});
export type DiscoverState = z.infer<typeof DiscoverState>;

export const emptyState = (region: RegionId): DiscoverState => ({ region, abgelehnt: [], zurueckgestellt: [] });
