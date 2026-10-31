/**
 * Zeitraum aus ganzen Berliner Kalendertagen, beide Grenzen inklusive (Plan 0023). Rein und ohne Bezug zur
 * Startseite: Der Filter „von / bis“ nutzt ihn, die Merkliste ihre Schnellwahlen „ab …“ (Plan 0025, E7). Dazu die
 * Tageszeit eines Termins und die Kandidaten-Termine aus Zeitraum und Tageszeit (Plan 0057, E7). Die Tageszeit steht
 * hier und nicht in filter.ts, weil filter.ts dieses Modul importiert (kein Zyklus).
 */
import type { Offer, Session } from "./schema.ts";
import { addMonths, berlinIsoDate, berlinKey, isIsoDate } from "./time.ts";

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

/** So viele Schnellwahlen „ab …“ gibt es höchstens; die Daten reichen etwa 4 Monate (Plan 0025, Entscheidung b). */
const QUICK_MONTHS = 3;

/**
 * Schnellwahlen „Beginn ab“ der Merkliste (Plan 0025, E7): die Monatsersten der nächsten drei Monate, je nur mit
 * `from`. Eine Schnellwahl nach dem letzten Tag des Datenstands fehlt, sie zeigte immer nichts; ohne Datenstand keine.
 * `month` ist `YYYY-MM`, die Beschriftung macht die Oberfläche.
 */
export function quickRanges(today: string, dataEnd: string | undefined): Array<{ month: string; range: DateRange }> {
  if (!dataEnd) return [];
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  return Array.from({ length: QUICK_MONTHS }, (_, i) => addMonths(firstOfMonth, i + 1))
    .filter((from) => from <= dataEnd)
    .map((from) => ({ month: from.slice(0, 7), range: { from } }));
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

/** Beginnt der Termin an einem Berliner Tag im Zeitraum? */
function inRangeDay(range: DateRange, session: Session): boolean {
  const day = berlinIsoDate(session.start);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

/** Tageszeit eines Termins nach seinem Beginn in Berliner Zeit (Plan 0057, E7); Reihenfolge kanonisch (URL) */
export const DAYTIMES = ["vormittags", "mittags", "nachmittags"] as const;
export type Daytime = (typeof DAYTIMES)[number];

/** vor 12 Uhr vormittags, 12 bis vor 15 Uhr mittags, ab 15 Uhr nachmittags (Berliner Uhr, nie die des Geräts) */
export function daytimeOf(session: Session): Daytime {
  const hour = Number(berlinKey(session.start).slice(9, 11));
  return hour < 12 ? "vormittags" : hour < 15 ? "mittags" : "nachmittags";
}

/** Liegt der Termin in einer der Tageszeiten? Ohne Auswahl immer. */
function inDaytimes(daytimes: readonly Daytime[] | undefined, session: Session): boolean {
  return !daytimes || daytimes.length === 0 || daytimes.includes(daytimeOf(session));
}

/**
 * Welche Termine eines Angebots zählen (Plan 0057, E7): Zeitraum und Tageszeit. `FilterState` erfüllt den Typ, die
 * Gruppierungen bekommen den Filter deshalb direkt.
 */
export interface SessionRule {
  range?: DateRange | undefined;
  daytimes?: readonly Daytime[] | undefined;
}

/** Wirkt die Regel überhaupt? Ohne Zeitraum und Tageszeit gilt das Verhalten von vor Plan 0057. */
export function ruleActive({ range, daytimes }: SessionRule): boolean {
  return range !== undefined || (daytimes !== undefined && daytimes.length > 0);
}

/**
 * Kandidaten-Termine (Plan 0057, E7; Regel aus Plan 0023, E2): bei Kursen nur der Kursbeginn (auch wenn er schon
 * beendet ist), sonst die noch nicht beendeten Termine; je im Zeitraum (falls gesetzt) und in der Tageszeit (falls
 * gewählt). Ein Angebot passt, wenn es einen Kandidaten hat. Welcher Termin auf der Kachel steht, entscheidet
 * `shownSession` (agenda.ts).
 */
export function candidateSessions(
  offer: Offer,
  now: Date,
  range?: DateRange,
  daytimes?: readonly Daytime[],
): Session[] {
  return offer.sessions.filter(isCandidate(offer, now, range, daytimes));
}

/**
 * Dieselbe Regel als Prädikat über `offer.sessions` (mit Index): `shownSession` sucht damit nur bis zum ersten Treffer,
 * statt alle Termine zu sammeln.
 */
export function isCandidate(
  offer: Offer,
  now: Date,
  range: DateRange | undefined,
  daytimes: readonly Daytime[] | undefined,
): (session: Session, index: number) => boolean {
  const isNotEnded = notEnded(now);
  const course = offer.format === "kurs";
  return (s, index) =>
    (course ? index === 0 : isNotEnded(s)) && (!range || inRangeDay(range, s)) && inDaytimes(daytimes, s);
}

/**
 * Der Termin, für den das Angebot im Zeitraum steht (E2): bei Kursen nur der Kursbeginn (auch wenn er schon
 * beendet ist), sonst der erste noch nicht beendete Termin im Zeitraum. `undefined` heißt: passt nicht.
 */
export function rangeSession(offer: Offer, range: DateRange, now: Date): Session | undefined {
  return candidateSessions(offer, now, range)[0];
}

/** Referenz der Regel aus Plan 0023 für die Tests; die App prüft über `candidateSessions` (Plan 0057, E7). */
export function inDateRange(offer: Offer, range: DateRange, now: Date): boolean {
  return rangeSession(offer, range, now) !== undefined;
}
