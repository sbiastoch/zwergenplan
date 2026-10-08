/**
 * Zeitraum aus ganzen Berliner Kalendertagen, beide Grenzen inklusive (Plan 0023). Rein und ohne Bezug zur
 * Startseite: Der Filter „von / bis“ nutzt ihn, später auch die Merkliste („Beginn ab“, docs/ideas.md).
 */
import type { Offer, Session } from "./schema.ts";
import { berlinIsoDate, isIsoDate } from "./time.ts";

/** Mindestens eine Grenze ist gesetzt; ISO-Tage, `from` ≤ `to` (siehe `dateRange`). */
export interface DateRange {
  from?: string;
  to?: string;
}

/**
 * Normalisierter Zeitraum: Ungültige Grenzen fallen einzeln weg, vertauschte werden still getauscht (E1, E4).
 * Ohne gültige Grenze `undefined`; eine fehlende Grenze fehlt als Schlüssel (kanonischer Zustand).
 */
export function dateRange(a: string | undefined, b: string | undefined): DateRange | undefined {
  const from = a && isIsoDate(a) ? a : undefined;
  const to = b && isIsoDate(b) ? b : undefined;
  if (from && to) return from <= to ? { from, to } : { from: to, to: from };
  if (from) return { from };
  if (to) return { to };
  return undefined;
}

/**
 * Darf eine Eingabe im Datumsfeld übernommen werden? Leer (Grenze entfernen) oder ein Tag ab heute. So landet ein
 * halb getipptes Jahr („0002-10-20“) nicht im Filter und tauscht keine Grenzen (Plan 0023, E9).
 */
export function usableBound(value: string, today: string): boolean {
  return value === "" || (isIsoDate(value) && value >= today);
}

function contains(range: DateRange, session: Session): boolean {
  const day = berlinIsoDate(session.start);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

/**
 * Der Termin, für den das Angebot im Zeitraum steht (E2): bei Kursen nur der Kursbeginn (auch wenn er schon
 * beendet ist), sonst der erste noch nicht beendete Termin im Zeitraum. `undefined` heißt: passt nicht.
 */
export function rangeSession(offer: Offer, range: DateRange, now: Date): Session | undefined {
  if (offer.format === "kurs") {
    const [first] = offer.sessions;
    return first && contains(range, first) ? first : undefined;
  }
  return offer.sessions.find((s) => Date.parse(s.end) >= now.getTime() && contains(range, s));
}

export function inDateRange(offer: Offer, range: DateRange, now: Date): boolean {
  return rangeSession(offer, range, now) !== undefined;
}
