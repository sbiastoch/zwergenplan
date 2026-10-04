import type { AgeRange, Offer } from "./schema.ts";
import { berlinDate, daysInMonth, parseIsoDate } from "./time.ts";

/** Ohne Altersangabe gilt ein Angebot für die ganze Zielgruppe 0–3 Jahre. */
const DEFAULT_AGE: AgeRange = { minMonths: 0, maxMonths: 36 };

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
 * Regelmäßig: passt, sobald mindestens ein Termin altersgerecht ist.
 */
export function offerFitsAge(offer: Offer, birthDate: string): boolean {
  const [first] = offer.sessions;
  if (!first) return false;
  if (offer.format === "regelmaessig") {
    return offer.sessions.some((s) => fitsAgeAt(offer.age, birthDate, s.start));
  }
  return fitsAgeAt(offer.age, birthDate, first.start);
}
