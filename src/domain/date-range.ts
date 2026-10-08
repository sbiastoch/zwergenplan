/**
 * Zeitraum aus ganzen Berliner Kalendertagen, beide Grenzen inklusive (Plan 0023). Rein und ohne Bezug zur
 * Startseite: Der Filter „von / bis“ nutzt ihn, später auch die Merkliste („Beginn ab“, docs/ideas.md).
 */
import type { Offer, Session } from "./schema.ts";
import { berlinIsoDate, isIsoDate } from "./time.ts";

/** Mindestens eine Grenze ist gesetzt (der Typ erzwingt es); ISO-Tage, `from` ≤ `to` (siehe `dateRange`). */
export type DateRange = { from: string; to?: string } | { from?: string; to: string };

/** Ein Termin zählt als kommend, bis er beendet ist – ein laufender Termin zählt also mit (auch agenda.ts). */
export const notEnded = (now: Date) => (session: Session) => Date.parse(session.end) >= now.getTime();

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

/** Grenzen eines Datumsfelds: frühester und spätester übernehmbarer Tag */
export interface BoundLimits {
  min: string;
  max?: string;
}

/**
 * Grenzen der beiden Datumsfelder (E9): „von“ ab heute bis „bis“, „bis“ ab „von“ (sonst ab heute). So entsteht
 * beim Tippen nie ein vertauschter Zeitraum. Liegt ein Wert aus einem alten Link vor heute, beginnt das Feld dort,
 * damit es nicht dauerhaft ungültig erscheint (E4).
 */
export function fieldLimits(range: DateRange | undefined, today: string): { from: BoundLimits; to: BoundLimits } {
  const earliest = (value: string | undefined) => (value && value < today ? value : today);
  const to = range?.to;
  return {
    from: { min: earliest(range?.from), ...(to ? { max: to } : {}) },
    to: { min: range?.from ?? earliest(to) },
  };
}

export type BoundCheck = "ok" | "zu-frueh" | "zu-spaet" | "ungueltig";

/**
 * Darf eine Eingabe im Datumsfeld übernommen werden? Leer (Grenze entfernen) oder ein Tag in den Grenzen. So landet
 * ein halb getipptes Jahr („0002-10-20“) nicht im Filter (E9).
 */
export function checkBound(value: string, limits: BoundLimits): BoundCheck {
  if (value === "") return "ok";
  if (!isIsoDate(value)) return "ungueltig";
  if (value < limits.min) return "zu-frueh";
  if (limits.max !== undefined && value > limits.max) return "zu-spaet";
  return "ok";
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
  const isNotEnded = notEnded(now);
  return offer.sessions.find((s) => isNotEnded(s) && contains(range, s));
}

export function inDateRange(offer: Offer, range: DateRange, now: Date): boolean {
  return rangeSession(offer, range, now) !== undefined;
}
