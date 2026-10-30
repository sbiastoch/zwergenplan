/**
 * Zustand des Entdeckens je Region, `data/discover/<region>.json` (Plan 0032, E7/E13). Eigenes kleines Modul, damit
 * `scripts/validate-data.ts` nur das Schema importiert, nicht die Logik des Entdeckens.
 */
import { z } from "zod";
import { KEBAB_ID_PATTERN, SHORT_ID_PATTERN } from "../../../src/domain/ids.ts";
import { REGION_IDS, type RegionId } from "../../../src/domain/regions.ts";

const IsoDate = z.iso.date();

/**
 * Lage eines Orts aus dem Geocoder (Plan 0050, E5). `adresse` ist bei jeder Stufe die aus `addressdetails`
 * gebaute Adresse, nicht die Eingabe; `stufe` 1 Freitext, 2 strukturiert, 3 benannter Ort. `gemeinde` und `landkreis`
 * prüfen das Gebiet der Region (Plan 0050, S2c); `gemeinde: null` heißt, Nominatim liefert keine. Ein Eintrag ohne das
 * Feld `gemeinde` stammt von vor S2c und wird neu angefragt (`io/geocode.ts`).
 */
export const Ort = z.strictObject({
  lat: z.number(),
  lon: z.number(),
  adresse: z.string().min(1),
  stufe: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  district: z.string().optional(),
  gemeinde: z.string().min(1).nullable().optional(),
  landkreis: z.string().min(1).optional(),
  datum: IsoDate,
});
export type Ort = z.infer<typeof Ort>;

/**
 * Kandidat, den ein technischer Grund oder eine mögliche Dublette aufhält (Plan 0050, E5). Ohne Wiedervorlage:
 * jeder Lauf prüft ihn erneut, bis Aufnahme, Verwerfung oder ein Mensch ihn beendet. `anzahl` zählt nur Klärfälle,
 * die am Kandidaten liegen; ab drei in Folge setzt `aussetzenBis` einen Monatslauf aus.
 */
const Klaerfall = z.strictObject({
  url: z.url(),
  name: z.string(),
  grund: z.string().min(1),
  seit: IsoDate,
  zuletzt: IsoDate,
  anzahl: z.number().int().min(0),
  aussetzenBis: IsoDate.optional(),
});

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
  /** Geocoder-Treffer der Region je Eingabe (`placeKey`), 12 Monate gültig; „kein Treffer“ steht hier nie */
  orte: z.record(z.string(), Ort).default({}),
  klaerfaelle: z.array(Klaerfall).default([]),
});
export type DiscoverState = z.infer<typeof DiscoverState>;

export const emptyState = (region: RegionId): DiscoverState => ({
  region,
  abgelehnt: [],
  zurueckgestellt: [],
  orte: {},
  klaerfaelle: [],
});

/**
 * Invariante für `data:validate` (Arch-Review S4b, M1): Kein Katalogeintrag trägt eine zurückgenommene Katalog-ID oder
 * `publicId` aus `abgelehnt`, gleich über welchen Weg er entstand (Entdecken oder von Hand).
 */
export function reservedConflicts(
  catalog: ReadonlyArray<{ id: string; publicId?: string }>,
  states: readonly DiscoverState[],
): string[] {
  const out: string[] = [];
  for (const s of states)
    for (const a of s.abgelehnt)
      for (const p of catalog) {
        if (a.id !== undefined && p.id === a.id)
          out.push(
            `data/discover/${s.region}.json: Katalog-ID ${p.id} ist zurückgenommen und darf nicht neu vergeben werden`,
          );
        if (a.publicId !== undefined && p.publicId === a.publicId)
          out.push(
            `data/discover/${s.region}.json: publicId ${a.publicId} (${p.id}) ist zurückgenommen und darf nicht neu vergeben werden`,
          );
      }
  return out;
}
