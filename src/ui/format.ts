/**
 * Texte der Oberfläche aus Domänenwerten. Keine Geschäftslogik: Welcher Termin zählt, ob etwas
 * passt oder wöchentlich ist, entscheidet src/domain. Kalendertage sind Berliner Tage (ISO-Strings).
 */
import type { PositionProblem } from "../data/geolocation.ts";
import type { LoadFailure } from "../data/site.ts";
import { DEFAULT_AGE } from "../domain/age.ts";
import { courseProgress, rhythm, uniformTimes, upcomingSessions } from "../domain/agenda.ts";
import { type Origin, type Reach, type ReachLimit, roundedDistance, roundedMinutes } from "../domain/reach.ts";
import { registrationPhase } from "../domain/registration.ts";
import type { AgeRange, Session } from "../domain/schema.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { addDays, berlinIsoDate, berlinKey, isoWeekday, parseIsoDate } from "../domain/time.ts";
import type { TransitSource } from "../domain/transit-types.ts";
import type { ReachMode } from "./use-transit.ts";

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

/** Kachel und Orts-Liste: „25 Min.“, „über 2 Std.“ bzw. „1,4 km“ – gerundet von der Domäne (E8). */
export function reachShort(reach: Reach): string {
  if (reach.kind === "oepnv") {
    const { over, value } = roundedMinutes(reach.minutes);
    return over ? "über 2 Std." : `${value} Min.`;
  }
  const { unit, value } = roundedDistance(reach.meters);
  return `${DISTANCE.format(value)} ${unit}`;
}

const ORIGIN_PHRASES = { standort: "ab deinem Standort", karte: "ab der Kartenmitte" } as const;

/** „ab Gostenhof“ / „ab deinem Standort“ / „ab der Kartenmitte“ */
export function originPhrase(origin: Origin): string {
  return origin.source === "stadtteil" ? `ab ${origin.label}` : ORIGIN_PHRASES[origin.source];
}

const BY_TRANSIT = "mit Bus & Bahn";

/** Detail und Orts-Sheet: sagt immer, was gemeint ist (E1): „mit Bus & Bahn“, „zu Fuß“ oder „Luftlinie“. */
export function reachLong(reach: Reach, origin: Origin): string {
  const short = reachShort(reach);
  const how = reach.kind === "luftlinie" ? "Luftlinie" : reach.byFoot ? "zu Fuß" : BY_TRANSIT;
  return `${short.startsWith("über") ? "" : "ca. "}${short} ${how} ${originPhrase(origin)}`;
}

/** Statuszeile: erklärt die kurze Form auf den Kacheln, einmal mit der Annahme (E1, E11). */
export function reachNote(mode: ReachMode, origin: Origin): string {
  const from = originPhrase(origin);
  if (mode.kind !== "luftlinie") return `Wegzeit ${from} ${BY_TRANSIT} (Di vormittags, inkl. Warten)`;
  return `Entfernung als Luftlinie ${from} – ${mode.reason === "fehler" ? "Wegzeiten gerade nicht verfügbar" : "außerhalb des Stadtgebiets"}.`;
}

/** Hinweise im Kind-Sheet, Abschnitt „Wegzeit ab“ (OriginPicker.tsx; Plan 0004, E5; Plan 0009, N3) */
const UNAVAILABLE = "Standort gerade nicht verfügbar. Wähle stattdessen einen Stadtteil.";
const PROBLEMS: Record<PositionProblem, string> = {
  denied: "Standort nicht freigegeben. Wähle stattdessen einen Stadtteil.",
  unavailable: UNAVAILABLE,
  timeout: UNAVAILABLE,
  // NUERNBERG_BBOX, also der Großraum; nicht zu verwechseln mit dem Stadtgebiet der Wegzeit (N3)
  outside: "Dein Standort liegt außerhalb des Großraums Nürnberg. Wähle einen Stadtteil.",
  // Ohne API erscheint der Knopf gar nicht; der Text ist nur die Rückfallebene.
  unsupported: UNAVAILABLE,
};

/**
 * Hinweis unter der Auswahl: Problem der Standortabfrage, sonst was ab dem Startpunkt gilt. Das Sheet sagt
 * „außerhalb“ selbst, nicht erst die Statuszeile, und verspricht ohne Tabelle keine Wegzeit (N3).
 */
export function originHint(
  problem: PositionProblem | undefined,
  origin: Origin | undefined,
  mode: ReachMode | undefined,
): { cls: string; text: string } | undefined {
  if (problem) return { cls: "hint bad", text: PROBLEMS[problem] };
  if (!origin || origin.source === "stadtteil") return undefined;
  // Standort oder Kartenmitte außerhalb des Stadtgebiets: dieselbe Begründung wie im Filter-Sheet (Text schon im
  // Startbundle, Plan 0009, N3)
  if (mode?.kind === "luftlinie" && mode.reason === "ausserhalb") {
    return { cls: "hint bad", text: `${limitReason(mode)} Wähle einen Stadtteil.` };
  }
  if (origin.source !== "standort") return undefined;
  const what = mode?.kind === "luftlinie" ? "Entfernung" : "Wegzeit";
  return { cls: "hint ok", text: `${what} ab deinem Standort (auf ca. 100 m gerundet).` };
}

/** „bis 30 Min.“ */
export function reachLimitLabel(limit: ReachLimit): string {
  return `bis ${limit.value} Min.`;
}

/** Begründung unter den gesperrten Chips „bis … Min.“ (M6); mit Wegzeit keine. */
export function limitReason(mode: ReachMode | undefined): string | undefined {
  if (!mode) return "Erst einen Startpunkt wählen.";
  if (mode.kind === "laedt") return "Wegzeiten werden geladen …";
  if (mode.kind === "luftlinie") {
    return mode.reason === "fehler"
      ? "Wegzeiten gerade nicht verfügbar."
      : "Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg.";
  }
  return undefined;
}

/** Hinweis unter der Statuszeile, wenn `wegzeit=` gesetzt ist, aber nicht wirkt (E11); beim Laden keiner. */
export function limitHint(limit: ReachLimit, mode: ReachMode | undefined): string | undefined {
  const label = `„${reachLimitLabel(limit)}“`;
  if (!mode) return `${label} braucht einen Startpunkt.`;
  if (mode.kind !== "luftlinie") return undefined;
  return mode.reason === "fehler"
    ? `${label} wirkt gerade nicht: Wegzeiten nicht geladen.`
    : `${label} wirkt nicht: Startpunkt außerhalb des Stadtgebiets.`;
}

/** Fließtext mit Links; `nowrap`: kurzer Link, der nie umbricht (N4, H6) */
type NotePart = string | { text: string; href: string; nowrap?: true };

/** längster Link-Text ohne Umbruch: „CC BY-SA 3.0 DE“ hat 15 Zeichen, 20 passen bei 320 px/200 % noch (N4) */
const NOWRAP_MAX = 20;
const VGN = "VGN – Verkehrsverbund Großraum Nürnberg GmbH";
const VGN_URL = "https://www.vgn.de/web-entwickler/open-data/";
const LICENSE: NotePart = {
  text: "CC BY-SA 3.0 DE",
  href: "https://creativecommons.org/licenses/by-sa/3.0/de/",
  nowrap: true,
};

/**
 * Quellenhinweis im Kind-Sheet nach CC BY-SA 3.0 DE, Abschnitt 4a/4c (E3): Rechteinhaber, Titel mit Stand (Link
 * auf die Quelle), „abgewandelt“, Lizenz (Link). Aus `source` in `wegzeit.json`; ohne geladene Tabelle nur VGN und
 * Lizenz.
 */
export function transitSourceNote(source: TransitSource | undefined): NotePart[] {
  const lead =
    "Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß für einen Dienstagvormittag, inklusive Warten. Fahrplan: ";
  if (!source) return [lead, { text: VGN, href: VGN_URL }, ", ", LICENSE, "."];
  return [
    `${lead}${source.attribution}, ‚`,
    { text: source.title, href: source.url },
    "‘, abgewandelt, Lizenz ",
    // nur kurze Bezeichnungen: Eine lange aus den Daten muss bei 320 px/200 % umbrechen dürfen (N4)
    { text: source.license, href: source.licenseUrl, ...(source.license.length <= NOWRAP_MAX ? { nowrap: true } : {}) },
    ".",
  ];
}

/** Statuszeile der Karte „8 Angebote an 5 Orten“; die Zahlen getrennt, damit sie fett stehen. */
export function mapStatusParts(offers: number, places: number): [number, string, number, string] {
  return [offers, offers === 1 ? " Angebot an " : " Angebote an ", places, places === 1 ? " Ort" : " Orten"];
}

/** Statuszeile im Tab „Anbieter“ „5 Anbieter mit 8 Angeboten“ (Plan 0010, E4); die Zahlen getrennt, fett. */
export function providerStatusParts(providers: number, offers: number): [number, string, number, string] {
  return [providers, " Anbieter mit ", offers, offers === 1 ? " Angebot" : " Angeboten"];
}

const LOAD_ERRORS: Record<LoadFailure, string> = {
  // kein automatisches Neuladen, der Text verspricht also keins (Plan-Review 0008, m1)
  offline: "Du bist gerade offline. Sobald das Netz wieder da ist, tippe auf ‚Nochmal versuchen‘.",
  netz: "Die Verbindung ist abgebrochen. Versuch es gleich nochmal.",
  server: "Die Angebote ließen sich gerade nicht laden. Versuch es später nochmal.",
};

/** Statuszeile, wenn site.json aus dem Cache des Service Workers kommt (Plan 0011, E4): „Offline – Stand vom 5.10.“ */
export const offlineNote = (generatedAt: string) => `Offline – Stand vom ${dayDots(generatedAt)}`;

/** Toast: Der Service Worker meldet eine Kalender-Datei, die offline nicht lädt (Plan 0011, E4, Regel 2) */
export const ICS_OFFLINE = "Kalender-Datei braucht Netz";

/** Fehlerzustand (Plan 0008, E5): ein deutscher Satz je Fehlerart statt „Failed to fetch“. */
export function loadErrorText(reason: LoadFailure): string {
  return LOAD_ERRORS[reason];
}

/**
 * Kalender-Leerzustand, wenn die Auswahl Termine des Tages ausblendet (Plan 0008, E12). Ist heute
 * zusätzlich Passendes schon beendet, sagt der zweite Satz das.
 */
export function hiddenNote(hidden: number, ended: number): string {
  const note = `${plural(hidden, "Angebot", "Angebote")} an diesem Tag ${hidden === 1 ? "ist" : "sind"} ausgeblendet – durch Filter, Wegzeit oder Alter.`;
  return ended > 0 ? `${note} Was zu deiner Auswahl passt, ist heute schon vorbei.` : note;
}
