/**
 * Bayerische Schulferien und Feiertage aus OpenHolidays-Antworten (aus holidays.py).
 * Das Abrufen liegt in io/holidays.ts; hier nur die reine Auswertung.
 */
import { z } from "zod";
import { addDays } from "../../../src/domain/time.ts";

const OpenHoliday = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  name: z.array(z.object({ text: z.string() })).min(1),
  subdivisions: z.array(z.object({ code: z.string() })).optional(),
});
export const OpenHolidaysResponse = z.array(OpenHoliday);
export type OpenHoliday = z.infer<typeof OpenHoliday>;

/** Freie Tage als { "YYYY-MM-DD": "Herbstferien" }. Regionale Feiertage anderer Gebiete (Augsburg) zählen nicht. */
export function freeDays(entries: readonly OpenHoliday[], from: string, to: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of entries) {
    if (h.subdivisions && h.subdivisions.length > 0 && !h.subdivisions.some((s) => s.code === "DE-BY")) continue;
    const name = h.name[0]?.text ?? "frei";
    for (let d = h.startDate; d <= h.endDate; d = addDays(d, 1)) {
      if (d >= from && d <= to && out[d] === undefined) out[d] = name;
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
