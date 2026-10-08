/**
 * Kalender- und Listenlogik der Oberfläche: Welcher Termin eines Angebots zählt, wie Tage
 * gruppiert und Raster gebaut werden. Alle Kalendertage sind Berliner Tage (time.ts).
 */
import { type DateRange, inRangeDay, notEnded, rangeSession } from "./date-range.ts";
import type { Offer, Session } from "./schema.ts";
import { addDays, berlinIsoDate, berlinKey, daysInMonth, isoWeekday, parseIsoDate } from "./time.ts";

export interface Occurrence<T extends Offer = Offer> {
  offer: T;
  session: Session;
}

/**
 * Zählt ein Termin für die Anzeige? Bei Geburtsdatum: regelmäßige Angebote nur, wenn sie an dem Termin zum Alter
 * passen (`sessionFit` in age.ts, Plan 0028). Ohne Prädikat zählt jeder Termin.
 */
export type SessionFit = (offer: Offer, session: Session) => boolean;

export interface DayGroup<I> {
  /** Berliner Kalendertag (ISO) */
  day: string;
  items: I[];
}

/** Alle noch nicht beendeten Termine, in der Reihenfolge der Daten (chronologisch). */
export function upcomingSessions(offer: Offer, now: Date): Session[] {
  return offer.sessions.filter(notEnded(now));
}

/** Nächster noch nicht beendeter Termin. */
export function nextSession(offer: Offer, now: Date): Session | undefined {
  return offer.sessions.find(notEnded(now));
}

/**
 * Der Termin, auf den sich das Detail bezieht: der am gewählten Berliner Kalendertag (aus dem
 * Kalender geöffnet), sonst der nächste nicht beendete.
 */
export function referenceSession(offer: Offer, now: Date, day?: string): Session | undefined {
  return (day ? sessionOnDay(offer, day) : undefined) ?? nextSession(offer, now);
}

/** Erster Termin, der am Berliner Kalendertag `day` beginnt. */
export function sessionOnDay(offer: Offer, day: string): Session | undefined {
  return offer.sessions.find((s) => berlinIsoDate(s.start) === day);
}

/**
 * Der Termin, an dem ein Angebot in Liste und Merkliste steht: der nächste nicht beendete bzw. mit Zeitraum der aus
 * `rangeSession`. Mit `fits` der erste passende davon oder danach (im Zeitraum), sonst wie ohne `fits` (Plan 0028):
 * Ein regelmäßiges Angebot, in das das Kind erst hineinwächst, steht am ersten Termin, an dem es passt.
 */
export function shownSession(offer: Offer, now: Date, range?: DateRange, fits?: SessionFit): Session | undefined {
  const base = range ? rangeSession(offer, range, now) : nextSession(offer, now);
  if (!base || !fits || fits(offer, base)) return base;
  const isNotEnded = notEnded(now);
  return offer.sessions.find((s) => isNotEnded(s) && (!range || inRangeDay(range, s)) && fits(offer, s)) ?? base;
}

function byStartThenTitle(a: Occurrence, b: Occurrence): number {
  return Date.parse(a.session.start) - Date.parse(b.session.start) || a.offer.title.localeCompare(b.offer.title, "de");
}

function groupByDay<T extends Offer>(occurrences: Occurrence<T>[]): DayGroup<Occurrence<T>>[] {
  const groups: DayGroup<Occurrence<T>>[] = [];
  for (const occurrence of occurrences) {
    const day = berlinIsoDate(occurrence.session.start);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(occurrence);
    else groups.push({ day, items: [occurrence] });
  }
  return groups;
}

/**
 * Liste „Entdecken“: jedes Angebot genau einmal, am nächsten nicht beendeten Termin. Mit Zeitraum am Termin, für
 * den es im Zeitraum steht (`rangeSession`: Kurse am Beginn, sonst der erste Termin darin; Plan 0023, E6). Mit
 * `fits` am ersten passenden Termin (`shownSession`, Plan 0028).
 */
export function groupByNextSession<T extends Offer>(
  offers: readonly T[],
  now: Date,
  range?: DateRange,
  fits?: SessionFit,
): DayGroup<Occurrence<T>>[] {
  const occurrences: Occurrence<T>[] = [];
  for (const offer of offers) {
    const session = shownSession(offer, now, range, fits);
    if (session) occurrences.push({ offer, session });
  }
  return groupByDay(occurrences.sort(byStartThenTitle));
}

/**
 * Schrittweises Rendern langer Listen: genau `limit` Einträge, die letzte Tagesgruppe notfalls gekürzt.
 * (Ein Tag kann in echten Daten > 90 Angebote haben.) Der nächste Schritt setzt denselben Tag fort.
 */
export function takeGroups<I>(
  groups: readonly DayGroup<I>[],
  limit: number,
): { groups: DayGroup<I>[]; remaining: number } {
  const taken: DayGroup<I>[] = [];
  let count = 0;
  for (const group of groups) {
    if (count >= limit) break;
    const items = group.items.slice(0, limit - count);
    taken.push(items.length === group.items.length ? group : { ...group, items });
    count += items.length;
  }
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  return { groups: taken, remaining: total - count };
}

/**
 * Alle Termine, nach Berliner Kalendertag indiziert, je Tag nach Beginn sortiert.
 * Einmal je Datenstand/Filter berechnen: Kalender und Monatsraster lesen nur noch nach. Mit `fits` nur die passenden
 * Termine (Plan 0028).
 */
export function sessionsByDay<T extends Offer>(offers: readonly T[], fits?: SessionFit): Map<string, Occurrence<T>[]> {
  const index = new Map<string, Occurrence<T>[]>();
  for (const offer of offers) {
    for (const session of offer.sessions) {
      if (fits && !fits(offer, session)) continue;
      const day = berlinIsoDate(session.start);
      const list = index.get(day);
      if (list) list.push({ offer, session });
      else index.set(day, [{ offer, session }]);
    }
  }
  for (const list of index.values()) list.sort(byStartThenTitle);
  return index;
}

/** Agenda eines Kalendertags (Plan 0007, E2): was noch kommt, und warum der Tag sonst leer ist. */
export interface DayAgenda<T extends Offer> {
  /** nicht beendete Termine des Tages, nach Beginn */
  items: Occurrence<T>[];
  /** wie viele passende Termine dieses Tages schon beendet sind (nur heute > 0) */
  ended: number;
  /** Tag liegt nach dem letzten Termin des gesamten Datenstands */
  afterData: boolean;
  /**
   * nicht beendete Termine des Tages, die Filter, Umkreis oder Alter ausblenden (Plan 0008, E12):
   * ungefilterter Index minus `items`, nie negativ
   */
  hidden: number;
}

/**
 * Agenda des Berliner Tages `day` aus dem Index von `sessionsByDay`. Beendete Termine fallen weg
 * (gleiche Regel wie überall: ein Termin zählt, bis er beendet ist).
 * `endedToday` zählt der Aufrufer mit `endedOnDay` über alle filterpassenden Angebote – auch
 * solche ohne kommenden Termin, die gar nicht im Index stehen. `dataEnd` ist der letzte Tag des
 * ungefilterten Datenstands. `allIndex` ist der Index aller kommenden Angebote ohne Filter, Alter und
 * Umkreis; `index` ist eine Teilmenge davon, die Differenz also genau das Ausgeblendete.
 */
export function dayAgenda<T extends Offer>(
  index: ReadonlyMap<string, Occurrence<T>[]>,
  day: string,
  now: Date,
  context: { dataEnd: string | undefined; endedToday: number; allIndex: ReadonlyMap<string, Occurrence<T>[]> },
): DayAgenda<T> {
  const isNotEnded = notEnded(now);
  const items = (index.get(day) ?? []).filter((o) => isNotEnded(o.session));
  // Beendetes zählt nicht: „ausgeblendet“ heißt nur, was man noch besuchen könnte.
  const all = (context.allIndex.get(day) ?? []).filter((o) => isNotEnded(o.session)).length;
  return {
    items,
    ended: day === berlinIsoDate(now) ? context.endedToday : 0,
    afterData: context.dataEnd !== undefined && day > context.dataEnd,
    hidden: Math.max(0, all - items.length),
  };
}

/** Termine, die am Berliner Tag `day` beginnen und vor `now` beendet sind. */
export function endedOnDay(offers: readonly Offer[], day: string, now: Date): number {
  const isNotEnded = notEnded(now);
  let count = 0;
  for (const offer of offers) {
    for (const session of offer.sessions) {
      if (!isNotEnded(session) && berlinIsoDate(session.start) === day) count += 1;
    }
  }
  return count;
}

/** Die 7 Tage (Mo–So) der Woche, in der `day` liegt. */
export function weekDays(day: string): string[] {
  const monday = addDays(day, 1 - isoWeekday(day));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Monatsraster mit Montag als erster Spalte: Leerspalten vor dem 1. (`lead`) und alle Tage. */
export function monthDays(day: string): { lead: number; days: string[] } {
  const { year, month } = parseIsoDate(day);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  return {
    lead: isoWeekday(first) - 1,
    days: Array.from({ length: daysInMonth(year, month) }, (_, i) => addDays(first, i)),
  };
}

/** Letzter Berliner Tag, an dem irgendein Termin beginnt. */
export function lastSessionDay(offers: readonly Offer[]): string | undefined {
  let last: string | undefined;
  for (const offer of offers) {
    const session = offer.sessions.at(-1);
    if (!session) continue;
    const day = berlinIsoDate(session.start);
    if (!last || day > last) last = day;
  }
  return last;
}

/** Kursfortschritt: wie viele Termine noch nicht beendet sind. */
export function courseProgress(offer: Offer, now: Date): { total: number; remaining: number } {
  const remaining = upcomingSessions(offer, now).length;
  return { total: offer.sessions.length, remaining };
}

const clock = (instant: string) => berlinKey(instant).slice(9);

/**
 * Rhythmus der kommenden Termine (mindestens zwei): gemeinsamer ISO-Wochentag (1 = Mo) und ob es
 * „jede Woche“ ist – lückenlos im 7-Tage-Abstand zur selben Uhrzeit. 14-täglich ist nicht `weekly`.
 */
export function rhythm(offer: Offer, now: Date): { weekday: number; weekly: boolean } | undefined {
  const upcoming = upcomingSessions(offer, now);
  if (upcoming.length < 2) return undefined;
  const days = upcoming.map((s) => berlinIsoDate(s.start));
  const weekday = isoWeekday(days[0] ?? "");
  if (days.some((d) => isoWeekday(d) !== weekday)) return undefined;
  const weekly = days.every((d, i) => i === 0 || addDays(days[i - 1] ?? "", 7) === d) && uniformTimes(upcoming);
  return { weekday, weekly };
}

/** Haben alle Termine dieselbe Berliner Uhrzeit (Beginn und Ende)? */
export function uniformTimes(sessions: readonly Session[]): boolean {
  const [first] = sessions;
  if (!first) return true;
  return sessions.every((s) => clock(s.start) === clock(first.start) && clock(s.end) === clock(first.end));
}
