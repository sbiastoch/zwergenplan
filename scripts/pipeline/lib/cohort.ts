/**
 * Geburtszeitraum im Titel („Babys geb. April–Juni 2026“, „Kinder geb. 02-06/2026“) und das Alter, das er am Termin
 * bedeutet (Plan 0053, E3). Der Build ersetzt damit bei Kursen und Einzelterminen die Altersangabe des Modells: Ein
 * Geburtszeitraum ist genauer als jede Spanne der Quelle, und ohne `age` gälte 0–36 Monate.
 */
import { ageInMonths } from "../../../src/domain/age.ts";
import type { AgeRange } from "../../../src/domain/schema.ts";
import { daysInMonth } from "../../../src/domain/time.ts";

/** erster und letzter Geburtsmonat, je `YYYY-MM` */
export interface BirthCohort {
  from: string;
  to: string;
}

/** Monatsnamen nach den ersten drei Buchstaben („Sept.“, „März“, „Maerz“, „Jän.“) */
const MONTHS: Record<string, number> = {
  jan: 1,
  jän: 1,
  feb: 2,
  mär: 3,
  mae: 3,
  mrz: 3,
  apr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  okt: 10,
  nov: 11,
  dez: 12,
};

const NAME = String.raw`([a-zäöü]{3,9})\.?`;
const NUM = String.raw`(\d{1,2})`;
const YEAR = String.raw`(20\d\d)`;
const DASH = String.raw`\s*(?:[-–—]|bis)\s*`;
const LEAD = String.raw`\bgeb(?:\.|oren)\s+(?:im\s+)?`;

/** Monatsname – Monatsname Jahr, das erste Jahr optional; oder ein einzelner Monat */
const BY_NAME = new RegExp(`${LEAD}${NAME}(?:\\s+${YEAR})?(?:${DASH}${NAME})?\\s+${YEAR}`, "i");
/** 02-06/2026, 04/2024-07/2024, 03/2026 */
const BY_NUMBER = new RegExp(`${LEAD}${NUM}(?:\\/${YEAR})?(?:${DASH}${NUM})?\\/${YEAR}`, "i");

const monthOfName = (name: string) => MONTHS[name.toLowerCase().slice(0, 3)];
const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

function cohort(
  m1: number | undefined,
  y1: number | undefined,
  m2: number | undefined,
  y2: number,
): BirthCohort | undefined {
  const last = m2 ?? m1;
  if (m1 === undefined || last === undefined) return undefined;
  if (m1 < 1 || m1 > 12 || last < 1 || last > 12) return undefined;
  const from = ym(y1 ?? (m2 !== undefined && m1 > m2 ? y2 - 1 : y2), m1);
  const to = ym(y2, last);
  return from <= to ? { from, to } : undefined;
}

/** Geburtszeitraum aus einem Titel; ohne Jahr oder unplausibel `undefined` */
export function birthCohort(title: string): BirthCohort | undefined {
  const named = BY_NAME.exec(title);
  if (named) {
    const [, n1 = "", y1, n2, y2 = ""] = named;
    const m1 = monthOfName(n1);
    const m2 = n2 === undefined ? undefined : monthOfName(n2);
    if (m1 === undefined || (n2 !== undefined && m2 === undefined)) return undefined;
    // „Dez.–Feb. 2026“ ohne erstes Jahr hieße Dez. 2025; mit Jahr steht es da
    return cohort(m1, y1 === undefined ? undefined : Number(y1), m2, Number(y2));
  }
  const numbered = BY_NUMBER.exec(title);
  if (numbered) {
    const [, n1 = "", y1, n2, y2 = ""] = numbered;
    return cohort(
      Number(n1),
      y1 === undefined ? undefined : Number(y1),
      n2 === undefined ? undefined : Number(n2),
      Number(y2),
    );
  }
  return undefined;
}

/**
 * Alter am Termin `at` in vollendeten Monaten: `minMonths` für ein Kind vom letzten Tag des letzten Monats (nicht unter
 * 0), `maxMonths` für eines vom 1. des ersten Monats. Liegt der Termin vor dem Geburtszeitraum, `undefined`.
 */
export function cohortAge({ from, to }: BirthCohort, at: string): AgeRange | undefined {
  const [ty = 0, tm = 0] = to.split("-").map(Number);
  const oldest = ageInMonths(`${from}-01`, at);
  if (oldest < 0) return undefined;
  const youngest = ageInMonths(`${to}-${String(daysInMonth(ty, tm)).padStart(2, "0")}`, at);
  return { minMonths: Math.max(0, youngest), maxMonths: oldest };
}
