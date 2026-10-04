import { upcomingSessions } from "./agenda.ts";
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
 * Kurs/einmalig: entscheidend ist das Alter zum (ersten) Termin.
 * Regelmäßig: passt, sobald mindestens ein noch nicht beendeter Termin altersgerecht ist –
 * vergangene Termine bleiben bis zum nächsten Pipeline-Lauf in den Daten und zählen nicht.
 */
export function offerFitsAge(offer: Offer, birthDate: string, now: Date): boolean {
  const [first] = offer.sessions;
  if (!first) return false;
  if (offer.format === "regelmaessig") {
    return upcomingSessions(offer, now).some((s) => fitsAgeAt(offer.age, birthDate, s.start));
  }
  return fitsAgeAt(offer.age, birthDate, first.start);
}

/** Teilt nach `offerFitsAge`; die Reihenfolge bleibt erhalten. */
export function splitByAge<T extends Offer>(
  offers: readonly T[],
  birthDate: string,
  now: Date,
): { fitting: T[]; unfit: T[] } {
  const fitting: T[] = [];
  const unfit: T[] = [];
  for (const offer of offers) (offerFitsAge(offer, birthDate, now) ? fitting : unfit).push(offer);
  return { fitting, unfit };
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
  let ref: Session | undefined;
  if (offer.format !== "regelmaessig") ref = offer.sessions[0];
  else if (session) ref = session;
  else {
    const upcoming = upcomingSessions(offer, now);
    ref = upcoming.find(fitsAt) ?? upcoming[0];
  }
  if (!ref) return undefined;
  return { fits: fitsAt(ref), at: ref.start, months: ageInMonths(birthDate, ref.start) };
}

export interface AgeVisibility<T> {
  /** angezeigte Angebote (bei nichts Ausgeblendetem dieselbe Liste wie `filtered`) */
  visible: readonly T[];
  /** gefilterte Angebote, die nicht zum Kind passen („… passen nicht zu 11 Mon.“) */
  hiddenCount: number;
  /** IDs aller kommenden Angebote, die nicht zum Kind passen (Markierung auf der Karte) */
  unfitIds: ReadonlySet<string>;
}

/**
 * Alters-Sichtbarkeit der Liste: `unfitIds` gilt für alle kommenden Angebote (`upcoming`),
 * ausgeblendet wird nur bei „nur passende“ (`ageOnly`) mit Geburtsdatum und ohne „trotzdem zeigen“.
 */
export function ageVisibility<T extends Offer>(
  filtered: readonly T[],
  upcoming: readonly T[],
  birthDate: string | undefined,
  now: Date,
  { ageOnly, showUnfit }: { ageOnly: boolean; showUnfit: boolean },
): AgeVisibility<T> {
  if (birthDate === undefined) return { visible: filtered, hiddenCount: 0, unfitIds: new Set() };
  const unfitIds = new Set(splitByAge(upcoming, birthDate, now).unfit.map((o) => o.id));
  if (!ageOnly) return { visible: filtered, hiddenCount: 0, unfitIds };
  const fitting = filtered.filter((o) => !unfitIds.has(o.id));
  return { visible: showUnfit ? filtered : fitting, hiddenCount: filtered.length - fitting.length, unfitIds };
}
