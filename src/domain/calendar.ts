/**
 * Kalender-Navigation (Plan 0003, E14): Grenzen heute bzw. letzter Tag mit Terminen. Reine Kalendertage. Seit Plan 0025
 * (E5) der Kalender der Merkliste: Tag, Woche oder Monat sind die Auswahl, die die Liste darunter filtert.
 */
import { weekDays } from "./agenda.ts";
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
