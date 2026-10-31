/**
 * Kalender-Navigation (Plan 0003, E14): Grenzen heute bzw. letzter Tag mit Terminen. Reine Kalendertage. Seit Plan 0025
 * (E5) der Kalender der Merkliste: Tag, Woche oder Monat sind die Auswahl, die die Liste darunter filtert.
 */
import { type DayGroup, type DayHidden, weekDays } from "./agenda.ts";
import { addDays, addMonths, daysInMonth, isoWeekday, parseIsoDate } from "./time.ts";

/** Was der Kalender der Merkliste auswählt (Plan 0025, E5). `day` ist ein Berliner Tag, nie vor heute. */
export interface CalendarSelection {
  unit: "tag" | "woche" | "monat";
  /** Anker: der gewählte Tag; bei Woche ein Tag darin (Mo–So um ihn), bei Monat ein Tag darin */
  day: string;
}

/** Ziele der Pfeile; `undefined` = Pfeil gesperrt. */
export interface CalendarNav {
  /** Mo–So der Woche des gewählten Tages */
  week: string[];
  prevWeek: string | undefined;
  nextWeek: string | undefined;
  prevMonth: string | undefined;
  nextMonth: string | undefined;
}

const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`;
const mondayOf = (day: string) => addDays(day, 1 - isoWeekday(day));

/** Vergangene Tage sind nicht wählbar: alles vor `today` wird zu `today`. */
export function clampDay(day: string, today: string): string {
  return day < today ? today : day;
}

/**
 * Vor/zurück für Wochenleiste und Monatsraster.
 * Zurück endet in der Woche bzw. im Monat von heute (Ziel nie vor heute), vor endet am
 * letzten Tag mit Terminen (`lastDay`, ohne Termine: heute). Vor springt auf den Montag bzw. Ersten.
 */
export function calendarNav(day: string, today: string, lastDay: string | undefined): CalendarNav {
  const monday = mondayOf(day);
  const end = lastDay ?? today;
  const first = firstOfMonth(day);
  const nextMonday = addDays(monday, 7);
  const nextFirst = addMonths(first, 1);
  return {
    week: weekDays(day),
    prevWeek: monday > mondayOf(today) ? clampDay(addDays(day, -7), today) : undefined,
    nextWeek: nextMonday <= end ? nextMonday : undefined,
    prevMonth: first > firstOfMonth(today) ? clampDay(addMonths(first, -1), today) : undefined,
    nextMonth: nextFirst <= end ? nextFirst : undefined,
  };
}

/** Erster und letzter Berliner Tag der Auswahl, inklusive; nie vor `today` (Plan 0025, E5). */
export function selectionRange(sel: CalendarSelection, today: string): { from: string; to: string } {
  const day = clampDay(sel.day, today);
  if (sel.unit === "tag") return { from: day, to: day };
  if (sel.unit === "woche") {
    const monday = mondayOf(day);
    return { from: clampDay(monday, today), to: addDays(monday, 6) };
  }
  const { year, month } = parseIsoDate(day);
  const first = firstOfMonth(day);
  return { from: clampDay(first, today), to: addDays(first, daysInMonth(year, month) - 1) };
}

/**
 * Eine Zeile der Wochenansicht (Plan 0057, E9): ein Tag mit Terminen, ein Tag, dessen Termine nur der Filter verdeckt,
 * ein freier Tag oder das freie Wochenende. `why` sagt, warum ein Tag frei ist: nichts gemerkt (`leer`), heute schon
 * alles vorbei (`vorbei`) oder Gemerktes passt an dem Tag nicht zum Alter (`alter`).
 */
export type WeekRow<I> =
  | { kind: "termine"; day: string; items: I[] }
  | { kind: "verdeckt"; day: string }
  | FreeDay
  | { kind: "wochenende"; from: string; to: string };

interface FreeDay {
  kind: "frei";
  day: string;
  why: "leer" | "vorbei" | "alter";
}

/**
 * Zeilen der Wochenansicht im Kalender der Merkliste (Plan 0057, E9): alle Tage der Woche `week` ab `today`, auch ohne
 * Termine. `groups` sind die Tage mit Terminen (`rangeAgenda`), `hiddenDays` das je Tag Verdeckte. Sind Samstag und
 * Sonntag beide leer und noch nicht vorbei, stehen sie in einer Zeile; ist heute Sonntag, steht nur er da.
 * `endedToday` > 0 macht einen leeren heutigen Tag zu „vorbei“ (Muster von `RangeEmpty`: Verdecktes geht vor).
 */
export function weekRows<I>(
  groups: readonly DayGroup<I>[],
  hiddenDays: ReadonlyMap<string, DayHidden>,
  week: readonly string[],
  today: string,
  endedToday = 0,
): WeekRow<I>[] {
  const byDay = new Map(groups.map((g) => [g.day, g.items]));
  const rows: WeekRow<I>[] = [];
  for (const day of week) {
    if (day < today) continue;
    const items = byDay.get(day);
    const hidden = hiddenDays.get(day);
    if (items && items.length > 0) rows.push({ kind: "termine", day, items });
    else if (hidden && hidden.filter > 0) rows.push({ kind: "verdeckt", day });
    else if (day === today && endedToday > 0) rows.push({ kind: "frei", day, why: "vorbei" });
    else if (hidden && hidden.age > 0) rows.push({ kind: "frei", day, why: "alter" });
    else rows.push({ kind: "frei", day, why: "leer" });
  }
  const [saturday, sunday] = rows.slice(-2);
  if (isEmptyOn(saturday, SATURDAY) && isEmptyOn(sunday, SUNDAY)) {
    rows.splice(-2, 2, { kind: "wochenende", from: saturday.day, to: sunday.day });
  }
  return rows;
}

const SATURDAY = 6;
const SUNDAY = 7;

/** Tag ohne alles Gemerkte (nicht vorbei, nicht verdeckt) am ISO-Wochentag `weekday` */
function isEmptyOn<I>(row: WeekRow<I> | undefined, weekday: number): row is FreeDay {
  return row?.kind === "frei" && row.why === "leer" && isoWeekday(row.day) === weekday;
}
