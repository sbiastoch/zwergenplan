/**
 * Terminregeln der Subagenten → konkrete lokale Termine (Berliner Ortszeit, ohne Offset).
 * Strukturierte Regeln statt RRULE-Strings: Zod prüft sie, der Expander bleibt klein (Plan 0002, E5).
 * Ferien/Feiertage und Ausnahmen werden hier herausgenommen; welche Termine in den Horizont
 * gehören, entscheidet build-offers je nach Format.
 */
import { z } from "zod";
import { addDays, daysInMonth, isoWeekday, parseIsoDate } from "../../../src/domain/time.ts";
import { LocalDateTime, type Occurrence } from "./candidate.ts";

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const Weekday = z.enum(WEEKDAYS);
const LocalDate = z.iso.date();
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM erwartet");

const ruleBase = {
  start: Time,
  end: Time.optional(),
  from: LocalDate,
  until: LocalDate.optional(),
  /** Anzahl tatsächlicher Termine (nach Ferien und Ausnahmen) */
  count: z.int().min(1).max(200).optional(),
  /** true, wenn der Anbieter in Ferien/an Feiertagen pausiert */
  skipHolidays: z.boolean(),
  except: z.array(LocalDate).optional(),
};

type RuleShape = { start: string; end?: string | undefined; from: string; until?: string | undefined };
const endAfterStart = (r: RuleShape) => r.end === undefined || r.end > r.start;
const untilAfterFrom = (r: RuleShape) => r.until === undefined || r.until >= r.from;
const END_MSG = { message: "end muss nach start liegen", path: ["end"] };
const UNTIL_MSG = { message: "until vor from", path: ["until"] };

export const Schedule = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("dates"),
    dates: z.array(z.strictObject({ start: LocalDateTime, end: LocalDateTime.optional() })).min(1),
  }),
  z
    .strictObject({
      kind: z.literal("weekly"),
      weekdays: z.array(Weekday).min(1),
      interval: z.int().min(1).max(4).optional(),
      ...ruleBase,
    })
    .refine(endAfterStart, END_MSG)
    .refine(untilAfterFrom, UNTIL_MSG),
  z
    .strictObject({
      kind: z.literal("monthly"),
      nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
      weekday: Weekday,
      ...ruleBase,
    })
    .refine(endAfterStart, END_MSG)
    .refine(untilAfterFrom, UNTIL_MSG),
]);
export type Schedule = z.infer<typeof Schedule>;

export interface ExpandWindow {
  /** Ende des Horizonts (inklusive) – Regeln ohne until/count enden hier */
  to: string;
  /** freie Tage (Ferien, Feiertage) für skipHolidays */
  freeDays: Readonly<Record<string, string>>;
  /** Frühester gewünschter Termin. Regeln ohne count starten hier statt bei einem lange zurückliegenden from. */
  from?: string;
}

const MAX_DAYS = 3 * 366;

function weekdayNumber(w: (typeof WEEKDAYS)[number]): number {
  return WEEKDAYS.indexOf(w) + 1;
}

/** n-ter (bzw. letzter bei -1) Wochentag eines Monats, oder undefined, wenn es ihn nicht gibt. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): string | undefined {
  const pad = (n: number) => String(n).padStart(2, "0");
  const firstDay = `${year}-${pad(month)}-01`;
  const offset = (weekday - isoWeekday(firstDay) + 7) % 7;
  const days = daysInMonth(year, month);
  const day = nth === -1 ? 1 + offset + 7 * Math.floor((days - 1 - offset) / 7) : 1 + offset + 7 * (nth - 1);
  return day <= days ? `${year}-${pad(month)}-${pad(day)}` : undefined;
}

function* ruleDays(s: Exclude<Schedule, { kind: "dates" }>, to: string, from?: string): Generator<string> {
  const stop = s.until !== undefined && s.until < to ? s.until : to;
  // Mit count zählt jeder Termin ab s.from, sonst darf die Expansion am Fensterbeginn einsetzen.
  const begin = s.count === undefined && from !== undefined && from > s.from ? from : s.from;
  if (s.kind === "weekly") {
    const wanted = new Set(s.weekdays.map(weekdayNumber));
    const interval = s.interval ?? 1;
    const weekStart = addDays(s.from, 1 - isoWeekday(s.from));
    for (let i = 0, day = begin; day <= stop && i < MAX_DAYS; i++, day = addDays(day, 1)) {
      const week = Math.floor((Date.parse(day) - Date.parse(weekStart)) / (7 * 86_400_000));
      if (week % interval === 0 && wanted.has(isoWeekday(day))) yield day;
    }
    return;
  }
  let { year, month } = parseIsoDate(begin);
  for (let i = 0; i < 40; i++) {
    const day = nthWeekday(year, month, weekdayNumber(s.weekday), s.nth);
    if (day !== undefined && day > stop) return;
    if (day !== undefined && day >= begin) yield day;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

export function expandSchedule(schedule: Schedule, window: ExpandWindow): Occurrence[] {
  if (schedule.kind === "dates") {
    const unique = new Map(schedule.dates.map((d) => [d.start, d] as const));
    return [...unique.values()].sort((a, b) => a.start.localeCompare(b.start));
  }
  const except = new Set(schedule.except ?? []);
  const out: Occurrence[] = [];
  for (const day of ruleDays(schedule, window.to, window.from)) {
    if (except.has(day) || (schedule.skipHolidays && window.freeDays[day] !== undefined)) continue;
    out.push({
      start: `${day}T${schedule.start}`,
      ...(schedule.end === undefined ? {} : { end: `${day}T${schedule.end}` }),
    });
    if (schedule.count !== undefined && out.length >= schedule.count) break;
  }
  return out;
}
