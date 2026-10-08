/**
 * Deutsche Datumswörter und die Texte der Fakten (Plan 0026, E3): rein, damit App (über src/ui/format.ts) und Build
 * (Vorschauseiten in scripts/lib/share-pages.ts) dieselben Schreibweisen nutzen. Uhrzeiten in Berlin über time.ts.
 */
import { DEFAULT_AGE } from "./age.ts";
import type { AgeRange, Session } from "./schema.ts";
import type { SiteOffer } from "./site-data.ts";
import { berlinKey } from "./time.ts";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;
/** Abkürzungen nach Duden: kurze Namen bleiben ganz, „Sept.“ statt „Sep.“ (Plan 0026, E3, Review m8) */
const MONTHS_SHORT = [
  "Jan.",
  "Feb.",
  "März",
  "Apr.",
  "Mai",
  "Juni",
  "Juli",
  "Aug.",
  "Sept.",
  "Okt.",
  "Nov.",
  "Dez.",
] as const;

/** „Mittwoch“ für ISO-Wochentag 3 */
export function weekdayName(isoWeekdayNumber: number): string {
  return WEEKDAYS[isoWeekdayNumber - 1] ?? "";
}

/** „Okt.“ für Monat 10 (1–12) */
export function monthShort(month: number): string {
  return MONTHS_SHORT[month - 1] ?? "";
}

/** Berliner Uhrzeit „9:30“ */
export function clock(instant: string): string {
  const key = berlinKey(instant);
  return `${Number(key.slice(9, 11))}:${key.slice(11, 13)}`;
}

/** „10:00–11:30“ */
export function timeRange(session: Session): string {
  return `${clock(session.start)}–${clock(session.end)}`;
}

export function costLabel(offer: SiteOffer): string {
  return offer.cost === "kostenlos" ? "Kostenlos" : (offer.price ?? "Kostenpflichtig");
}

export function registrationLabel(offer: SiteOffer): string {
  return offer.registration === "mit-anmeldung" ? "Anmeldung nötig" : "Ohne Anmeldung";
}

const AVAILABILITY: Partial<Record<SiteOffer["availability"]["status"], string>> = {
  frei: "Plätze frei",
  wenige: "Wenige Plätze",
  ausgebucht: "Ausgebucht",
  warteliste: "Warteliste",
};

/** Nur aussagekräftige Status bekommen einen Chip bzw. Stempel. */
export function availabilityLabel(offer: SiteOffer): string | undefined {
  return AVAILABILITY[offer.availability.status];
}

export function ageRangeLabel(age: AgeRange | undefined): string {
  const { minMonths, maxMonths } = age ?? DEFAULT_AGE;
  return `${minMonths}–${maxMonths} Monate`;
}
