/**
 * „Neu eingestellt“ (Plan 0043, E3): **eine** Zuordnung für Etikett, Gruppen der Liste, Treffer der Wochen-Nachricht
 * und die Zahl der CI. Gezählt wird in Berliner Kalendertagen zwischen dem Tag von `listedAt` und heute, damit alle
 * dieselbe Grenze haben, auch über die Zeitumstellung. Rein und klein: darf in den Start.
 */
import type { Offer } from "./schema.ts";
import { addDays, berlinIsoDate } from "./time.ts";

/** So lange trägt ein Angebot das Etikett „Neu“ */
const NEW_DAYS = 14;

export type ListingWeek = "diese-woche" | "vorige-woche" | "frueher";

/**
 * Heute und die 6 Tage davor: `diese-woche`; die 7 Tage davor: `vorige-woche`; älter oder ohne `listedAt`: `frueher`.
 * Liegt `listedAt` nach heute (die Nachricht kam verspätet an, `site.json` ist schon neuer), zählt es zu `diese-woche`.
 */
export function listingWeek(offer: Pick<Offer, "listedAt">, now: Date): ListingWeek {
  if (offer.listedAt === undefined) return "frueher";
  const day = berlinIsoDate(offer.listedAt);
  const today = berlinIsoDate(now);
  if (day >= addDays(today, -6)) return "diese-woche";
  if (day >= addDays(today, -(NEW_DAYS - 1))) return "vorige-woche";
  return "frueher";
}
