/**
 * Texte der Oberfläche aus Domänenwerten. Keine Geschäftslogik: Welcher Termin zählt, ob etwas
 * passt oder wöchentlich ist, entscheidet src/domain. Kalendertage sind Berliner Tage (ISO-Strings).
 */
import type { PositionProblem } from "../data/geolocation.ts";
import type { LoadFailure } from "../data/site.ts";
import { courseProgress, rhythm, uniformTimes, upcomingSessions, weekDays } from "../domain/agenda.ts";
import type { CalendarSelection } from "../domain/calendar.ts";
import type { DateRange } from "../domain/date-range.ts";
import { MONTHS, monthShort, timeRange, WD_SHORT, weekdayName } from "../domain/labels.ts";
import {
  type Origin,
  type Reach,
  type ReachLimit,
  roundedDistance,
  roundedMinutes,
  stopMinutes,
} from "../domain/reach.ts";
import { registrationPhase } from "../domain/registration.ts";
import type { ExportSelection } from "../domain/saved.ts";
import type { Session } from "../domain/schema.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { addDays, berlinDate, berlinIsoDate, isoWeekday, parseIsoDate } from "../domain/time.ts";
import type { TransitLineNames, TransitOther, TransitSource } from "../domain/transit-types.ts";
import type { ReachMode } from "./use-transit.ts";

// Texte aus der Domäne (Plan 0026, E3): dieselben Schreibweisen wie auf den Vorschauseiten des Builds
export {
  ageRangeLabel,
  availabilityLabel,
  clock,
  costLabel,
  registrationLabel,
  timeRange,
} from "../domain/labels.ts";

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

/** „5.–11. Okt.“ bzw. „26. Okt. – 1. Nov.“, „29. Juni – 5. Juli“ (Mockup Plan 0025: auch im selben Monat kurz) */
export function weekTitle(days: readonly string[]): string {
  const first = parseIsoDate(days[0] ?? "");
  const last = parseIsoDate(days.at(-1) ?? "");
  if (first.month === last.month) return `${first.day}.–${last.day}. ${monthShort(last.month)}`;
  return `${first.day}. ${monthShort(first.month)} – ${last.day}. ${monthShort(last.month)}`;
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

/**
 * Überschrift der Liste unter dem Kalender der Merkliste (Plan 0025, E5): „Heute, 5. Oktober“ / „Mittwoch, 7. Oktober“,
 * „Diese Woche“ / „Woche 12.–18. Okt.“, „Oktober 2026“.
 */
export function selectionHeading(sel: CalendarSelection, today: string): string {
  if (sel.unit === "tag") return agendaHeading(sel.day, today);
  if (sel.unit === "monat") return monthTitle(sel.day);
  const week = weekDays(sel.day);
  return week.includes(today) ? "Diese Woche" : `Woche ${weekTitle(week)}`;
}

const UNIT_WORDS: Record<CalendarSelection["unit"], string> = {
  tag: "diesen Tag",
  woche: "diese Woche",
  monat: "diesen Monat",
};

/** Leerzustand „Nichts gemerkt“ im Kalender der Merkliste und sein Knopf nach „Angebote“ (Plan 0025, E5, Fall 4) */
export function rangeEmptyTexts(unit: CalendarSelection["unit"]): { text: string; action: string } {
  return { text: `Für ${UNIT_WORDS[unit]} hast du nichts gemerkt.`, action: `Für ${UNIT_WORDS[unit]} entdecken` };
}

/** „2 gemerkte Termine blendet der Filter aus.“ (Plan 0025, E5, Fall 1) */
export function savedHiddenNote(hidden: number): string {
  return `${plural(hidden, "gemerkter Termin", "gemerkte Termine")} blendet der Filter aus.`;
}

/** „1 Angebot“ / „3 Angebote“ */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const AGE_RULE = "geprüft zum Kursstart";

/** Untertitel des Altersschalters im Filter-Sheet (Plan 0021, E2): an zählt die Ausgeblendeten, aus die Markierten */
export function ageOnlyNote(unfitCount: number, on: boolean): string {
  if (unfitCount === 0) return AGE_RULE;
  const one = unfitCount === 1;
  const count = on
    ? `${unfitCount} ${one ? "weiteres passt" : "weitere passen"} nicht`
    : `${unfitCount} ${one ? "unpassendes ist" : "unpassende sind"} markiert`;
  return `${count} · ${AGE_RULE}`;
}

/** „7 Mon.“ im Fließtext: U+00A0, damit Zahl und Einheit nie getrennt umbrechen (Browser-Review live, 320 px) */
const inlineAge = (ageLabel: string) => ageLabel.replace(" ", "\u00a0");

/** Hinweis bei abgeschaltetem Altersfilter (Plan 0021, E3) */
export function ageWarnText(unfitCount: number, ageLabel: string): string {
  const age = inlineAge(ageLabel);
  return unfitCount === 1
    ? `Zeigt auch 1 Angebot, das nicht zu ${age} passt`
    : `Zeigt auch ${unfitCount} Angebote, die nicht zu ${age} passen`;
}

/** Leerzustand, wenn der Altersfilter alles ausblendet (Plan 0021, E4); „3 J.“ endet schon mit Punkt */
export function ageEmptyText(ageLabel: string, withFilters: boolean): string {
  const age = inlineAge(ageLabel);
  const sentence = withFilters ? `Mit diesen Filtern passt nichts zu ${age}` : `Nichts davon passt zu ${age}`;
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
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

/** „14.10.“, außerhalb des laufenden Berliner Jahres „14.3.2027“ (Plan 0018, E4) */
function dayDotsInYear(instant: string, now: Date): string {
  return berlinDate(instant).year === berlinDate(now).year ? dayDots(instant) : standDate(instant);
}

/** Grundform des Kalender-Toasts: „Kalenderdatei mit 4 Terminen geladen“ */
export function calendarLoaded(count: number): string {
  return `Kalenderdatei mit ${plural(count, "Termin", "Terminen")} geladen`;
}

/** Toast nach „Alle Termine“ im Detail (Plan 0018, E4): nennt die Altersgrenze, wenn die Reihe gekürzt ist. */
export function seriesToast({ sessions, from, until }: ExportSelection, now: Date): string {
  const loaded = calendarLoaded(sessions.length);
  if (from && until) {
    return `${loaded} – vom ${dayDotsInYear(from, now)} bis ${dayDotsInYear(until, now)} passt es zum Alter`;
  }
  if (until) return `${loaded} – bis ${dayDotsInYear(until, now)}, danach passt es nicht mehr zum Alter`;
  if (from) return `${loaded} – ab ${dayDotsInYear(from, now)}, vorher passt es noch nicht zum Alter`;
  return loaded;
}

/** Toast nach dem Export der Merkliste (Plan 0018, E4): `missing` gemerkte Angebote ohne passenden Termin */
export function collectionToast(count: number, missing: number): string {
  const loaded = calendarLoaded(count);
  if (missing === 0) return loaded;
  return `${loaded} – ${plural(missing, "Angebot passt", "Angebote passen")} nicht zum Alter`;
}

/**
 * Name und Tooltip des runden Export-Knopfs der Merkliste (Plan 0025, E9). Der Export nimmt immer alle gemerkten
 * Angebote (ADR 0007, ADR 0018); mit aktivem Merklisten-Filter sagt der Name es, auch dem Screenreader.
 */
export function exportLabel(savedCount: number, filtered: boolean): string {
  return filtered ? `Alle ${savedCount} gemerkten in den Kalender, auch ausgeblendete` : "Alle in den Kalender";
}

/**
 * Toast, wenn der Export-Code nicht lädt (Merkliste und Detail). Chromium behält einen gescheiterten `import()`, auch
 * den des Vorladens: Nur ein Neuladen hilft sicher, die Merkliste liegt im localStorage und übersteht es (Arch-Review
 * Paket 0, Befund 1).
 */
export const EXPORT_UNAVAILABLE = "Export gerade nicht möglich – mit Netz die Seite neu laden und nochmal tippen.";

/**
 * Zusatz der Alterszeile im Detail (Plan 0018, E4): „passt bis 14.10.“, „passt ab 21.10.“, „passt 21.10.–14.3.2027“.
 * Ohne Kürzung keiner. Den Trenner davor setzt die Oberfläche.
 */
export function ageWindowLabel({ from, until }: ExportSelection, now: Date): string | undefined {
  if (from && until) return `passt ${dayDotsInYear(from, now)}–${dayDotsInYear(until, now)}`;
  if (until) return `passt bis ${dayDotsInYear(until, now)}`;
  if (from) return `passt ab ${dayDotsInYear(from, now)}`;
  return undefined;
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

/**
 * Lange Form in Teilen (Plan 0012, E10): Text davor, die Linien (eine oder zwei, gerendert mit Pfeil in
 * `ReachLong.tsx`) und Text danach. Ohne Linien steht alles in `before`.
 */
export interface ReachLongParts {
  before: string;
  lines?: TransitLineNames;
  after: string;
}

/**
 * Detail und Orts-Sheet: sagt immer, was gemeint ist (E1): „mit Bus 37 → U1“ bzw. „mit Bus & Bahn“, „zu Fuß“ oder
 * „Luftlinie“. Über 2 Std. oder ohne Weg neutral „über 2 Std. ab … (mit höchstens 1 Umstieg)“ (Plan 0012, E10).
 */
export function reachLong(reach: Reach, origin: Origin): ReachLongParts {
  const short = reachShort(reach);
  const from = originPhrase(origin);
  if (reach.kind === "luftlinie") return { before: `ca. ${short} Luftlinie ${from}`, after: "" };
  if (reach.byFoot) return { before: `ca. ${short} zu Fuß ${from}`, after: "" };
  if (roundedMinutes(reach.minutes).over) return { before: `${short} ${from} (mit höchstens 1 Umstieg)`, after: "" };
  if (reach.lines) return { before: `ca. ${short} mit `, lines: reach.lines, after: ` ${from}` };
  return { before: `ca. ${short} ${BY_TRANSIT} ${from}`, after: "" };
}

/** Eine Zeile der Karte „Wege ab …“ (Plan 0019, E6): Minuten, Linien (mit Pfeil in `LineChain`), Zusätze */
interface WayRow {
  minutes: string;
  lines?: TransitLineNames;
  /** „zu Fuß“ bzw. „1 Umstieg“, „6 Min. zum Halt“; je ein Segment, das nicht umbricht (Review 3, N6) */
  extra: string[];
  /** der Hauptweg, Marke „Vorschlag“ */
  main: boolean;
}

const about = (minutes: number) => `ca. ${roundedMinutes(minutes).value} Min.`;

function wayRow(way: TransitOther, main: boolean): WayRow {
  if (way.byFoot) return { minutes: about(way.minutes), extra: ["zu Fuß"], main };
  const extra = [`${stopMinutes(way.toStop)} Min. zum Halt`];
  if (way.transfer) extra.unshift("1 Umstieg");
  return { minutes: about(way.minutes), lines: way.lines, extra, main };
}

/**
 * Karte „Wege ab …“ im Detail (Plan 0019, E6): Hauptweg zuerst, dann die anderen Wege aus `transitReach`. Nur mit
 * anderen Wegen. Der Grund steht nur, wenn ein anderer Weg in der Anzeige schneller ist (Review 3, H1).
 */
export function wayParts(
  reach: Reach,
  origin: Origin,
): { title: string; rows: WayRow[]; reason: string | undefined } | undefined {
  if (reach.kind !== "oepnv" || !reach.others) return undefined;
  const { minutes, lines, toStop, transfer } = reach;
  // Bus & Bahn ohne Linien oder Halt: keine Karte, statt den Weg als „zu Fuß“ umzudeuten (Arch-Review 0019, m1)
  if (!reach.byFoot && (!lines || toStop === undefined)) return undefined;
  const main: TransitOther =
    reach.byFoot || !lines || toStop === undefined
      ? { byFoot: true, minutes }
      : { byFoot: false, minutes, lines, toStop, ...(transfer && { transfer }) };
  const shown = roundedMinutes(minutes).value;
  const faster = reach.others.some((other) => roundedMinutes(other.minutes).value < shown);
  return {
    title: `Wege ${originPhrase(origin)}`,
    rows: [wayRow(main, true), ...reach.others.map((other) => wayRow(other, false))],
    reason: faster ? "Vorschlag: direkt vor Umstieg, wenn der Umstieg nur wenig Zeit spart" : undefined,
  };
}

/**
 * Zusatz der Statuszeile hinter der Zahl (Plan 0020, E1; ADR 0019): nur der Startpunkt, die Annahme (Di vormittags,
 * 1 Umstieg, Warten) erklärt das Kind-Sheet. Der seltene Rückfall auf die Luftlinie nennt seinen Grund (ADR 0011, 9).
 */
export function reachNote(mode: ReachMode, origin: Origin): string {
  const from = originPhrase(origin);
  if (mode.kind !== "luftlinie") return `Wegzeit ${from}`;
  return `Luftlinie ${from} (${mode.reason === "fehler" ? "Wegzeiten gerade nicht verfügbar" : "außerhalb des Stadtgebiets"})`;
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
  // Die Erklärung des Modells liefert die geladene Tabelle (`source.rule`, Lazy-Chunk; Arch-Review 0012, Befund 2).
  const lead = `${source?.rule ? `${source.rule} ` : ""}Fahrplan: `;
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

/** Teilen (Plan 0026, E6, E7): Toast nach dem Kopieren, Hinweis im Sheet „Link zum Teilen“, verschwundenes Angebot */
export const SHARE_COPIED = "Link kopiert – zum Einfügen in WhatsApp & Co.";
export const SHARE_MANUAL_HINT = "Halte den Link gedrückt, um ihn zu kopieren.";
export const OFFER_GONE = "Dieses Angebot ist nicht mehr im Zwergenplan.";

/** Statuszeile der Karte „8 Angebote an 5 Orten“; die Zahlen getrennt, damit sie fett stehen. */
export function mapStatusParts(offers: number, places: number): [number, string, number, string] {
  return [offers, offers === 1 ? " Angebot an " : " Angebote an ", places, places === 1 ? " Ort" : " Orten"];
}

/**
 * Statuszeile der Merkliste als Liste (Plan 0025, E3a): „5 Angebote mit insgesamt 28 Terminen gemerkt“. `sessions`
 * zählt die kommenden Termine, wie der Kalender sie zeigt; die Zahlen getrennt, damit sie fett stehen.
 */
export function savedStatusParts(offers: number, sessions: number): [number, string, number, string] {
  return [
    offers,
    offers === 1 ? " Angebot mit insgesamt " : " Angebote mit insgesamt ",
    sessions,
    sessions === 1 ? " Termin gemerkt" : " Terminen gemerkt",
  ];
}

/** Statuszeile der Merklisten-Karte (Plan 0025, E3a): „5 Angebote an 5 Orten gemerkt“, Muster wie `mapStatusParts`. */
export function savedMapStatusParts(offers: number, places: number): [number, string, number, string] {
  const [a, offersWord, b, placesWord] = mapStatusParts(offers, places);
  return [a, offersWord, b, `${placesWord} gemerkt`];
}

/** „17.10.“, mit `year` „17.10.2026“ */
function dayDot(day: string, year = false): string {
  const { year: y, month, day: d } = parseIsoDate(day);
  return year ? `${d}.${month}.${y}` : `${d}.${month}.`;
}

/** „vom 17.–18.10.“, „ab Sa 17.10.“, „bis So 18.10.“, „am Sa 17.10.“ (Plan 0023); ohne Zeitraum „ab heute“ */
function rangePhrase(range: DateRange | undefined): string {
  const { from, to } = range ?? {};
  if (from && to) {
    if (from === to) return `am ${shortDate(from)}`;
    const a = parseIsoDate(from);
    const b = parseIsoDate(to);
    if (a.year !== b.year) return `vom ${dayDot(from, true)}–${dayDot(to, true)}`;
    return a.month === b.month ? `vom ${a.day}.–${dayDot(to)}` : `vom ${dayDot(from)}–${dayDot(to)}`;
  }
  if (from) return `ab ${shortDate(from)}`;
  if (to) return `bis ${shortDate(to)}`;
  return "ab heute";
}

/**
 * Statuszeile der Liste „3 Angebote vom 17.–18.10.“ (Browser-Review 0023, m1): ein ganzer Satz, denn die Zeile ist
 * eine Live-Region. Die Zahl getrennt, damit sie fett steht.
 */
export function listStatusParts(count: number, range: DateRange | undefined): [number, string] {
  return [count, ` ${count === 1 ? "Angebot" : "Angebote"} ${rangePhrase(range)}`];
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

/** Fehlerzustand (Plan 0008, E5): ein deutscher Satz je Fehlerart statt „Failed to fetch“. */
export function loadErrorText(reason: LoadFailure): string {
  return LOAD_ERRORS[reason];
}
