/**
 * Schulferien und Feiertage eines Bundeslands aus OpenHolidays-Antworten (aus holidays.py), dazu die Wahl der Map je
 * Netz (Plan 0039, E6). Das Abrufen liegt in io/holidays.ts; hier nur die reine Auswertung.
 */
import { z } from "zod";
import { NETWORKS, type Network, type NetworkId, networkOf, type RegionId } from "../../../src/domain/regions.ts";
import { addDays } from "../../../src/domain/time.ts";

const OpenHoliday = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  name: z.array(z.object({ text: z.string() })).min(1),
  subdivisions: z.array(z.object({ code: z.string() })).optional(),
});
export const OpenHolidaysResponse = z.array(OpenHoliday);
export type OpenHoliday = z.infer<typeof OpenHoliday>;

/** Bundesland eines Netzes (ISO 3166-2) */
export type Subdivision = Network["holidays"];
/** Freie Tage als { "YYYY-MM-DD": "Herbstferien" } */
export type FreeDays = Readonly<Record<string, string>>;
/**
 * Freie Tage je Netz, einmal je Lauf geladen. `Partial`: Ein Lauf lädt nur die Netze, die er braucht; wer die Map
 * eines fehlenden Netzes verlangt, bekommt einen Fehler statt still keine Ferien (`freeDaysOfRegion`).
 */
export type FreeDaysByNetwork = Readonly<Partial<Record<NetworkId, FreeDays>>>;

/**
 * Freie Tage im Zeitraum für `subdivision`. Einträge mit `subdivisions` zählen nur, wenn das Land genau dabei ist; so
 * fallen Feiertage anderer Länder und regionale Feiertage einzelner Städte (Augsburg, `DE-BY-AU`) weg.
 */
export function freeDays(
  entries: readonly OpenHoliday[],
  subdivision: Subdivision,
  from: string,
  to: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of entries) {
    if (h.subdivisions && h.subdivisions.length > 0 && !h.subdivisions.some((s) => s.code === subdivision)) continue;
    const name = h.name[0]?.text ?? "frei";
    for (let d = h.startDate; d <= h.endDate; d = addDays(d, 1)) {
      if (d >= from && d <= to && out[d] === undefined) out[d] = name;
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** Netze, deren Ferien ein Lauf über diese Regionen braucht (sortiert, ohne Doppel). */
export function networksOfRegions(regions: Iterable<RegionId>): NetworkId[] {
  return [...new Set([...regions].map(networkOf))].sort();
}

/** Bundesland eines Netzes */
export const subdivisionOf = (network: NetworkId): Subdivision => NETWORKS[network].holidays;

/** Die Map des Netzes, zu dem die Region gehört; wirft, wenn der Lauf sie nicht geladen hat. */
export function freeDaysOfRegion(byNetwork: FreeDaysByNetwork, region: RegionId): FreeDays {
  const network = networkOf(region);
  const days = byNetwork[network];
  if (days === undefined) throw new Error(`Ferien für Netz ${network} (Region ${region}) nicht geladen`);
  return days;
}
