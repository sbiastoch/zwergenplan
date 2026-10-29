import { nextSession, referenceSession, type SessionFit, upcomingSessions } from "./agenda.ts";
import { type DateRange, inRangeDay } from "./date-range.ts";
import type { AgeRange, Offer, Session } from "./schema.ts";
import { berlinDate, daysInMonth, parseIsoDate } from "./time.ts";

/** Ohne Altersangabe gilt ein Angebot für die ganze Zielgruppe 0–3 Jahre. */
export const DEFAULT_AGE: AgeRange = { minMonths: 0, maxMonths: 36 };

/**
 * Vollendete Lebensmonate am Datum `at` (Berliner Kalendertag).
 * Ein Monat ist vollendet, sobald der Geburtstag im Monat erreicht ist; Geburtstage am
 * 29.–31. zählen in kürzeren Monaten am Monatsletzten. Vor der Geburt: negativ.
 */
export function ageInMonths(birthDate: string, at: string | Date): number {
  const b = parseIsoDate(birthDate);
  const d = berlinDate(at);
  let months = (d.year - b.year) * 12 + (d.month - b.month);
  const anniversaryDay = Math.min(b.day, daysInMonth(d.year, d.month));
  if (d.day < anniversaryDay) months -= 1;
  return months;
}

export function fitsAgeAt(range: AgeRange | undefined, birthDate: string, at: string | Date): boolean {
  const { minMonths, maxMonths } = range ?? DEFAULT_AGE;
  const months = ageInMonths(birthDate, at);
  return months >= minMonths && months <= maxMonths;
}

/**
 * Prädikat „Termin passt zum Alter“ für Liste, Kalender, Merkliste und Export (Plan 0018, E1; Plan 0028): Regelmäßige
 * Angebote prüft es je Termin, Kurse und Einzeltermine gar nicht (für sie zählt `offerFitsAge`, ein Kurs wird nicht
 * mittendrin abgeschnitten, ADR 0007). Ohne Geburtsdatum gibt es kein Prädikat.
 */
export function sessionFit(birthDate: string | undefined): SessionFit | undefined {
  if (birthDate === undefined) return undefined;
  return (offer, session) => offer.format !== "regelmaessig" || fitsAgeAt(offer.age, birthDate, session.start);
}

/** Kommende Termine, die nach `sessionFit` zählen; dieselbe Auswahl zeigen Merkliste und Export (Plan 0028). */
export function fittingSessions(offer: Offer, now: Date, birthDate: string | undefined): Session[] {
  const upcoming = upcomingSessions(offer, now);
  const fits = sessionFit(birthDate);
  return fits ? upcoming.filter((s) => fits(offer, s)) : upcoming;
}

/**
 * Kurs/einmalig: entscheidend ist das Alter zum (ersten) Termin.
 * Regelmäßig: passt, sobald mindestens ein noch nicht beendeter Termin altersgerecht ist, mit Zeitraum einer darin
 * (Plan 0053, E2: sonst stünde der Termin dieser Woche als passend in der Liste, obwohl erst ein späterer passt) –
 * vergangene Termine bleiben bis zum nächsten Pipeline-Lauf in den Daten und zählen nicht.
 */
export function offerFitsAge(offer: Offer, birthDate: string, now: Date, range?: DateRange): boolean {
  const [first] = offer.sessions;
  if (!first) return false;
  if (offer.format === "regelmaessig") {
    return fittingSessions(offer, now, birthDate).some((s) => !range || inRangeDay(range, s));
  }
  return fitsAgeAt(offer.age, birthDate, first.start);
}

/**
 * „Der Beginn passt“ für die Wochen-Nachricht (Plan 0043, E2): Kurs und Einzeltermin wie `offerFitsAge` (erster
 * Termin), regelmäßig der nächste nicht beendete Termin – ohne Zeitgrenze, aber nicht erst ein späterer, zu dem man
 * das Angebot gar nicht als Ganzes buchen würde. Die Liste bleibt bei `offerFitsAge` (Plan 0028).
 */
export function startFitsAge(offer: Offer, birthDate: string, now: Date): boolean {
  if (offer.format !== "regelmaessig") return offerFitsAge(offer, birthDate, now);
  const next = nextSession(offer, now);
  return next !== undefined && fitsAgeAt(offer.age, birthDate, next.start);
}

/** Teilt nach `offerFitsAge` (mit Zeitraum, falls gegeben); die Reihenfolge bleibt erhalten. */
export function splitByAge<T extends Offer>(
  offers: readonly T[],
  birthDate: string,
  now: Date,
  range?: DateRange,
): { fitting: T[]; unfit: T[] } {
  const fitting: T[] = [];
  const unfit: T[] = [];
  for (const offer of offers) (offerFitsAge(offer, birthDate, now, range) ? fitting : unfit).push(offer);
  return { fitting, unfit };
}

/**
 * Der Termin, auf den sich das Detail bezieht (Terminliste, „Nur …“, Alters-Kachel): der am gewählten Kalendertag,
 * sonst mit Geburtsdatum der erste passende, sonst der nächste (`referenceSession` mit `sessionFit`; Browser-Review
 * Plan 0028). Kurse und Einzeltermine prüft das Prädikat nicht, für sie bleibt es der nächste (ADR 0007).
 */
export function detailSession(
  offer: Offer,
  now: Date,
  day: string | undefined,
  birthDate: string | undefined,
): Session | undefined {
  return referenceSession(offer, now, day, sessionFit(birthDate));
}

export interface AgeCheck {
  fits: boolean;
  /** Stichtag (Beginn des maßgeblichen Termins) */
  at: string;
  /** vollendete Monate am Stichtag */
  months: number;
}

/**
 * Erklärung für das Detail: an welchem Termin wie alt, passt es?
 * Kurs/einmalig: erster Termin. Regelmäßig: der vorgegebene Termin (Kalender), sonst der erste
 * passende kommende Termin, sonst der nächste – konsistent mit `offerFitsAge`.
 */
export function ageCheck(offer: Offer, birthDate: string, now: Date, session?: Session): AgeCheck | undefined {
  const fitsAt = (s: Session) => fitsAgeAt(offer.age, birthDate, s.start);
  const ref =
    offer.format === "regelmaessig" ? (session ?? detailSession(offer, now, undefined, birthDate)) : offer.sessions[0];
  if (!ref) return undefined;
  return { fits: fitsAt(ref), at: ref.start, months: ageInMonths(birthDate, ref.start) };
}

export interface AgeVisibility<T> {
  /** angezeigte Angebote (bei nichts Ausgeblendetem dieselbe Liste wie `filtered`) */
  visible: readonly T[];
  /** gefilterte Angebote, die nicht zum Kind passen: bei `ageOnly` ausgeblendet, sonst markiert sichtbar */
  unfitCount: number;
  /** IDs aller kommenden Angebote, die nicht zum Kind passen, ohne Zeitraum (Markierung auf Merkliste und in Sheets) */
  unfitIds: ReadonlySet<string>;
  /** dasselbe mit dem Zeitraum des Filters (Liste und Karte in „Entdecken“, Plan 0053, E2); ohne Zeitraum `unfitIds` */
  listUnfitIds: ReadonlySet<string>;
}

/**
 * Alters-Sichtbarkeit der Liste: `unfitIds` gilt für alle kommenden Angebote (`upcoming`),
 * ausgeblendet wird nur mit Altersfilter (`ageOnly`, Plan 0021) und Geburtsdatum. Mit Zeitraum zählt bei regelmäßigen
 * Angeboten nur ein passender Termin darin (`listUnfitIds`, Plan 0053, E2); `unfitIds` bleibt ohne Zeitraum, weil der
 * Filter in „Entdecken“ beim Tabwechsel stehen bleibt und Merkliste und Sheets nicht betrifft.
 */
export function ageVisibility<T extends Offer>(
  filtered: readonly T[],
  upcoming: readonly T[],
  birthDate: string | undefined,
  now: Date,
  { ageOnly, range }: { ageOnly: boolean; range?: DateRange | undefined },
): AgeVisibility<T> {
  if (birthDate === undefined) {
    const none = new Set<string>();
    return { visible: filtered, unfitCount: 0, unfitIds: none, listUnfitIds: none };
  }
  const unfitIds = new Set(splitByAge(upcoming, birthDate, now).unfit.map((o) => o.id));
  const listUnfitIds = range ? new Set(splitByAge(upcoming, birthDate, now, range).unfit.map((o) => o.id)) : unfitIds;
  const fitting = filtered.filter((o) => !listUnfitIds.has(o.id));
  return {
    visible: ageOnly ? fitting : filtered,
    unfitCount: filtered.length - fitting.length,
    unfitIds,
    listUnfitIds,
  };
}
