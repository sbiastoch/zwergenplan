/**
 * „Neu eingestellt“ (Plan 0043, E3): **eine** Zuordnung für Etikett, Gruppen der Liste, Treffer der Wochen-Nachricht
 * und die Zahl der CI. Gezählt wird in Berliner Kalendertagen zwischen dem Tag von `listedAt` und heute, damit alle
 * dieselbe Grenze haben, auch über die Zeitumstellung. Rein und klein: darf in den Start.
 */
import { byStartThenTitle, type Occurrence, type SessionFit, shownSession } from "./agenda.ts";
import type { DateRange } from "./date-range.ts";
import type { Offer } from "./schema.ts";
import { addDays, berlinIsoDate } from "./time.ts";

/** So lange trägt ein Angebot das Etikett „Neu“; je Gruppe der Liste eine Woche */
export const NEW_DAYS = 14;
const WEEK_DAYS = 7;

export type ListingWeek = "diese-woche" | "vorige-woche" | "frueher";

/** Erster und letzter Kalendertag der beiden Wochen bis heute: die eine Quelle der Grenzen */
function weeks(today: string) {
  return {
    "diese-woche": { from: addDays(today, -(WEEK_DAYS - 1)), to: today },
    "vorige-woche": { from: addDays(today, -(NEW_DAYS - 1)), to: addDays(today, -WEEK_DAYS) },
  };
}

/**
 * Heute und die 6 Tage davor: `diese-woche`; die 7 Tage davor: `vorige-woche`; älter oder ohne `listedAt`: `frueher`.
 * Liegt `listedAt` nach heute (die Nachricht kam verspätet an, `site.json` ist schon neuer), zählt es zu `diese-woche`.
 */
export function listingWeek(offer: Pick<Offer, "listedAt">, now: Date): ListingWeek {
  if (offer.listedAt === undefined) return "frueher";
  const day = berlinIsoDate(offer.listedAt);
  const bounds = weeks(berlinIsoDate(now));
  if (day >= bounds["diese-woche"].from) return "diese-woche";
  if (day >= bounds["vorige-woche"].from) return "vorige-woche";
  return "frueher";
}

/** Etikett „Neu“ (Plan 0043, E5): in dieser oder voriger Woche eingestellt */
export function isNewlyListed(offer: Pick<Offer, "listedAt">, now: Date): boolean {
  return listingWeek(offer, now) !== "frueher";
}

/**
 * Kopf einer Gruppe der Liste „Entdecken“ (Plan 0043, E4): ein Termin-Tag oder eine Wochengruppe von „Neu
 * eingestellt“ mit erstem und letztem Kalendertag (`frueher` ohne).
 */
export type ListGroupHead =
  | { kind: "termin"; day: string }
  | { kind: "diese-woche" | "vorige-woche"; from: string; to: string }
  | { kind: "frueher" };

export type ListGroup<I> = ListGroupHead & { key: string; items: I[] };

/**
 * „Neu eingestellt“ (Plan 0043, E4): drei Wochengruppen, rollierend in Berliner Kalendertagen; darin nach Termin, dann
 * Titel („was Neues kommt als Nächstes“). Jedes Angebot steht am selben Termin wie bei „Nächste Termine“.
 */
export function groupByListing<T extends Offer>(
  offers: readonly T[],
  now: Date,
  range?: DateRange,
  fits?: SessionFit,
): ListGroup<Occurrence<T>>[] {
  const bounds = weeks(berlinIsoDate(now));
  const byWeek: Record<ListingWeek, Occurrence<T>[]> = { "diese-woche": [], "vorige-woche": [], frueher: [] };
  for (const offer of offers) {
    const session = shownSession(offer, now, range, fits);
    if (session) byWeek[listingWeek(offer, now)].push({ offer, session });
  }
  const groups: ListGroup<Occurrence<T>>[] = [];
  for (const kind of ["diese-woche", "vorige-woche"] as const)
    if (byWeek[kind].length > 0)
      groups.push({ kind, key: kind, ...bounds[kind], items: byWeek[kind].sort(byStartThenTitle) });
  if (byWeek.frueher.length > 0)
    groups.push({ kind: "frueher", key: "frueher", items: byWeek.frueher.sort(byStartThenTitle) });
  return groups;
}
