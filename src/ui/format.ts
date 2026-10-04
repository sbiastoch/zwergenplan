/**
 * Texte der Oberfläche aus Domänenwerten. Keine Geschäftslogik: Welcher Termin zählt, ob etwas
 * passt oder wöchentlich ist, entscheidet src/domain. Kalendertage sind Berliner Tage (ISO-Strings).
 */
import { DEFAULT_AGE } from "../domain/age.ts";
import { courseProgress, rhythm, uniformTimes, upcomingSessions } from "../domain/agenda.ts";
import { type Origin, type Reach, type ReachLimit, roundedDistance } from "../domain/reach.ts";
import { registrationPhase } from "../domain/registration.ts";
import type { AgeRange, Session } from "../domain/schema.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { addDays, berlinIsoDate, berlinKey, isoWeekday, parseIsoDate } from "../domain/time.ts";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const MONTHS = [
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

function weekdayName(isoWeekdayNumber: number): string {
  return WEEKDAYS[isoWeekdayNumber - 1] ?? "";
}

/** „Mo“ für einen Kalendertag */
export function weekdayShort(day: string): string {
  return WD_SHORT[isoWeekday(day) - 1] ?? "";
}

/** „5. Oktober“ */
function dayMonth(day: string): string {
  const { month, day: d } = parseIsoDate(day);
  return `${d}. ${MONTHS[month - 1]}`;
}

/** „Montag, 5. Oktober“ */
export function longDate(day: string): string {
  return `${weekdayName(isoWeekday(day))}, ${dayMonth(day)}`;
}

/** „Mo 5.10.“ */
export function shortDate(day: string): string {
  const { month, day: d } = parseIsoDate(day);
  return `${weekdayShort(day)} ${d}.${month}.`;
}

/** „Oktober 2026“ */
export function monthTitle(day: string): string {
  const { year, month } = parseIsoDate(day);
  return `${MONTHS[month - 1]} ${year}`;
}

/** „5.–11. Oktober“ bzw. „26. Okt. – 1. Nov.“ */
export function weekTitle(days: readonly string[]): string {
  const first = parseIsoDate(days[0] ?? "");
  const last = parseIsoDate(days.at(-1) ?? "");
  if (first.month === last.month) return `${first.day}.–${last.day}. ${MONTHS[last.month - 1]}`;
  const abbr = (m: number) => (MONTHS[m - 1] ?? "").slice(0, 3);
  return `${first.day}. ${abbr(first.month)}. – ${last.day}. ${abbr(last.month)}.`;
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

/** Kalendertag eines Termins (Berlin) */
export function sessionDay(session: Session): string {
  return berlinIsoDate(session.start);
}

/** Überschrift einer Tagesgruppe: „Heute“/„Morgen“ mit vollem Datum, sonst Wochentag mit Datum. */
export function dayHeading(day: string, today: string): { title: string; sub: string } {
  if (day === today) return { title: "Heute", sub: longDate(day) };
  if (day === addDays(today, 1)) return { title: "Morgen", sub: longDate(day) };
  return { title: weekdayName(isoWeekday(day)), sub: dayMonth(day) };
}

/** Agenda-Überschrift im Kalender: „Heute, 5. Oktober“ / „Mittwoch, 7. Oktober“ */
export function agendaHeading(day: string, today: string): string {
  const { title } = dayHeading(day, today);
  return title === "Heute" || title === "Morgen" ? `${title}, ${dayMonth(day)}` : longDate(day);
}

/** „1 Angebot“ / „3 Angebote“ */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatFact(offer: SiteOffer, now: Date): string {
  if (offer.format === "einmalig") return "Einmalig";
  if (offer.format === "kurs") {
    const { total, remaining } = courseProgress(offer, now);
    return remaining < total ? `Kurs · noch ${remaining} von ${total}` : `Kurs · ${plural(total, "Termin", "Termine")}`;
  }
  const r = rhythm(offer, now);
  if (!r) return "Regelmäßig";
  return r.weekly ? `Jeden ${weekdayName(r.weekday)}` : `${weekdayName(r.weekday)}s`;
}

/** Hauptzeile eines Kurses im Detail: wie die Kachel, solange er läuft; nie „noch 0 von 8“ (H8). */
function courseLine(offer: SiteOffer, now: Date): string {
  const { total, remaining } = courseProgress(offer, now);
  const all = `Kurs mit ${plural(total, "Termin", "Terminen")}`;
  if (remaining === 0) return `${all} – vorbei`;
  return remaining < total ? `Kurs · noch ${remaining} von ${plural(total, "Termin", "Terminen")}` : all;
}

/**
 * „Wann“ im Detail: Hauptzeile und Zusatz, je nach Format (Rhythmus und Zählung aus der Domäne).
 * Regelmäßige Termine bekommen die Uhrzeit, wenn alle kommenden dieselbe haben (B1). Ohne kommenden
 * Termin keine Uhrzeit: `uniformTimes([])` ist wahr.
 */
export function whenLabels(offer: SiteOffer, now: Date): { main: string; sub: string } {
  const first = offer.sessions[0];
  const last = offer.sessions.at(-1);
  if (!first || !last) return { main: "", sub: "" };
  if (offer.format === "einmalig") return { main: longDate(sessionDay(first)), sub: `${timeRange(first)} Uhr` };
  if (offer.format === "kurs") {
    const range = `${shortDate(sessionDay(first))} bis ${shortDate(sessionDay(last))}`;
    return {
      main: courseLine(offer, now),
      sub: uniformTimes(offer.sessions) ? `${range}, jeweils ${timeRange(first)}` : range,
    };
  }
  const upcoming = upcomingSessions(offer, now);
  const r = rhythm(offer, now);
  const rhythmText = !r ? "Regelmäßig" : r.weekly ? `Jeden ${weekdayName(r.weekday)}` : `${weekdayName(r.weekday)}s`;
  const [next] = upcoming;
  const main = next && uniformTimes(upcoming) ? `${rhythmText}, ${timeRange(next)}` : rhythmText;
  const sub =
    offer.registration === "ohne-anmeldung"
      ? "Einzeln besuchbar"
      : plural(upcoming.length, "kommender Termin", "kommende Termine");
  return { main, sub };
}

/** Zusatz zur Anmeldung: das Fenster als Berliner Tage relativ zu „jetzt“ (B4), sonst ein Hinweis. */
export function registrationNote(offer: SiteOffer, now: Date): string {
  const { opens, deadline } = offer.registrationWindow ?? {};
  const phase = registrationPhase(offer.registrationWindow, now);
  if (phase === "vorbei" && deadline) return `Anmeldeschluss war am ${dayDots(deadline)}`;
  if (phase === "offen" && deadline) return `Anmeldung bis ${dayDots(deadline)}`;
  // „bald“ (mit oder ohne Schluss) und „offen“ ohne Schluss
  if (phase && opens) return `Anmeldung ab ${dayDots(opens)}${deadline ? `, bis ${dayDots(deadline)}` : ""}`;
  return offer.registration === "mit-anmeldung" ? "Beim Anbieter" : "Einfach vorbeikommen";
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

/** Kind-Chip im Kopf: „11 Mon.“, ab 2 Jahren „2 J.“ */
export function ageChipLabel(months: number | undefined): string {
  if (months === undefined || months < 0) return "Alter?";
  return months < 24 ? `${months} Mon.` : `${Math.floor(months / 12)} J.`;
}

/** „3.10.“ für einen Zeitpunkt (Berliner Tag) */
export function dayDots(instant: string): string {
  const { month, day } = parseIsoDate(berlinIsoDate(instant));
  return `${day}.${month}.`;
}

/** „4.10.2026“ */
export function standDate(instant: string): string {
  const { year, month, day } = parseIsoDate(berlinIsoDate(instant));
  return `${day}.${month}.${year}`;
}

const DISTANCE = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** Kachel: „400 m“, „1,4 km“, „12 km“ – gerundet von der Domäne (`roundedDistance`). */
export function distanceShort(reach: Reach): string {
  const { unit, value } = roundedDistance(reach.meters);
  return `${DISTANCE.format(value)} ${unit}`;
}

const ORIGIN_PHRASES = { standort: "ab deinem Standort", karte: "ab der Kartenmitte" } as const;

/** „ab Gostenhof“ / „ab deinem Standort“ / „ab der Kartenmitte“ */
export function originPhrase(origin: Origin): string {
  return origin.source === "stadtteil" ? `ab ${origin.label}` : ORIGIN_PHRASES[origin.source];
}

/** Detail: „ca. 1,4 km Luftlinie ab Gostenhof“ – die lange Form sagt immer „Luftlinie“ (E1). */
export function distanceLong(reach: Reach, origin: Origin): string {
  return `ca. ${distanceShort(reach)} Luftlinie ${originPhrase(origin)}`;
}

/** Statuszeile: erklärt die kurze Form auf den Kacheln. */
export function distanceNote(origin: Origin): string {
  return `Entfernung als Luftlinie ${originPhrase(origin)}`;
}

/** „bis 5 km“ */
export function reachLimitLabel(limit: ReachLimit): string {
  return `bis ${limit.value} km`;
}

/** Statuszeile der Karte „8 Angebote an 5 Orten“; die Zahlen getrennt, damit sie fett stehen. */
export function mapStatusParts(offers: number, places: number): [number, string, number, string] {
  return [offers, offers === 1 ? " Angebot an " : " Angebote an ", places, places === 1 ? " Ort" : " Orten"];
}
