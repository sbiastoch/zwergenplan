/**
 * Textähnlichkeit für Deduplizierung und Zuordnung (aus enrich.same_event). Zwei Strengen, bewusst getrennt (ADR 0031):
 * - `similarTitle` ist großzügig (ein gemeinsames Schlüsselwort genügt, auch ein Wochentag). Es dient `mergeParts`
 *   (split.ts), der Eval-Bewertung und der Zuordnung der IDs, wo Termine und Eindeutigkeit den Rest entscheiden.
 * - `sameCoreTitle` ist streng (gleiches erstes Kernwort, keine widersprechende Gruppe, Name oder Zeitraum). Es dient
 *   den Dubletten gleicher Quelle im Build und den Zwillingen des Vorstands (`sameOfferTwice`, stable-ids.ts): Dort
 *   entfällt ein Angebot bzw. eine ID, also müssen echte Parallelgruppen mit gleichen Zeiten getrennt bleiben.
 * - `conflictingLabels` ist der Kennungsteil davon für Stufe 2 der Zuordnung, `compatibleAge` der Altersvergleich.
 */
import type { AgeRange } from "../../../src/domain/schema.ts";

const GENERIC = new Set([
  "kinder",
  "kind",
  "eltern",
  "gruppe",
  "miniclub",
  "mini",
  "club",
  "krabbelgruppe",
  "baby",
  "babys",
  "offene",
  "offener",
  "treff",
  "jahre",
  "jahren",
  "monate",
  "monaten",
  "warteliste",
  "nürnberg",
  "nuernberg",
  "kurs",
  "termin",
  "eltern-kind-gruppe",
  "familien",
  "familie",
]);

/** Bedeutungstragende Wörter (≥ 4 Buchstaben, ohne Füllwörter). */
export function keywords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-zäöüß]{4,}/g) ?? []).filter((w) => !GENERIC.has(w)));
}

/** Ähnlichkeit 0…1 wie difflib.ratio: 2·LCS / (|a| + |b|). */
export function ratio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, row[j - 1] ?? 0);
    }
    prev = row;
  }
  return (2 * (prev[b.length] ?? 0)) / (a.length + b.length);
}

/** Gleicher Termin? Gemeinsame Schlüsselwörter oder Ähnlichkeit ≥ 0,6. */
export function similarTitle(a: string, b: string): boolean {
  const ka = keywords(a);
  for (const w of keywords(b)) if (ka.has(w)) return true;
  return ratio(a.toLowerCase(), b.toLowerCase()) >= 0.6;
}

/** Kalenderwörter: beginnt mit einem Wochentag („dienstags“, „Dienstagvormittag“), Monatsname, Tageszeit. */
const CALENDAR =
  /^((mon|diens|donners|frei|sams|sonn)tag|mittwoch)|^(januar|februar|märz|april|juni|juli|august|september|oktober|november|dezember|sept|febr|vormittags?|nachmittags?|abends?)$/;
/** Füllwörter, die `keywords` mitzählt, die aber kein Angebot unterscheiden (Plan 0038, Review M1). */
const FILLER =
  /^(ohne|monat|monats|lebensjahr|lebensjahres|woche|wochen|herbst|winter|frühjahr|frühling|sommer|ausgebucht|start|beginn|block|einheiten|termine)$/;
/** Rest, der ein Kernwort nur verlängert („rückbildung“ / „rückbildungskurs“). */
const FILL_SUFFIX = /^(s?kurs|s?gruppe|s?treff|zeit)$/;
/** Gruppenkennung: großer Buchstabe A–F, I–III oder Ziffer allein, nicht als Alter, Dauer oder Uhrzeit (Plan 0038, E4). */
const GROUP_LABEL =
  /(?:^|[\s(])([A-F]|I{1,3}|[1-9])(?=$|[\s)]|,(?!\d))(?![-–.:/])(?!\s*(?:[-–]\s*\d|[Mm]onat|[Mm]on\b|[Jj]ahr|J\.|[Ww]ochen|Uhr|bis|[Tt]ermin|[Ee]inheit))/g;
/** Zeitraum: Monatsnamen und Jahreszeiten, verglichen über die ersten drei Buchstaben („jan.“ = „januar“). */
const PERIOD =
  /^(jan|januar|feb|febr|februar|mär|märz|apr|april|mai|jun|juni|jul|juli|aug|august|sep|sept|september|okt|oktober|nov|november|dez|dezember|herbst|winter|frühjahr|frühling|sommer)$/;

const words = (text: string) => text.toLowerCase().match(/[a-zäöüß]+/g) ?? [];
const isCore = (w: string) => w.length >= 4 && !GENERIC.has(w) && !CALENDAR.test(w) && !FILLER.test(w);
const sameSet = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>) => a.size === b.size && [...a].every((x) => b.has(x));
/** Verschieden, wenn beide Seiten welche nennen; fehlt eine Seite, entscheidet die Menge nicht. */
const differ = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>) => a.size > 0 && b.size > 0 && !sameSet(a, b);

/** Kernwörter in Titelreihenfolge: wie `keywords`, aber ohne Kalender- und weitere Füllwörter. */
export function coreWords(title: string): string[] {
  return words(title).filter(isCore);
}

/** Widersprechende Gruppenkennung („Gruppe A“ / „Gruppe B“) oder widersprechender Zeitraum („Juni–Aug.“ / „Mai–Juli“). */
export function conflictingLabels(a: string, b: string): boolean {
  const labels = (t: string) => new Set([...t.matchAll(GROUP_LABEL)].map((m) => m[1]));
  const periods = (t: string) =>
    new Set(
      words(t)
        .filter((w) => PERIOD.test(w))
        .map((w) => w.slice(0, 3)),
    );
  return differ(labels(a), labels(b)) || differ(periods(a), periods(b));
}

/** Gleicher Kerntitel? Strenger als `similarTitle`, für Dubletten gleicher Quelle und Zwillinge (Kopfkommentar). */
export function sameCoreTitle(a: string, b: string): boolean {
  const [x] = coreWords(a);
  const [y] = coreWords(b);
  if (x === undefined || y === undefined) return false;
  // Namensregel: Folgt auf das erste Kernwort beiderseits ein weiteres, verschiedenes, sind es benannte Gruppen
  const name = (t: string) => {
    const ws = words(t);
    const next = ws[ws.findIndex(isCore) + 1];
    return next !== undefined && isCore(next) ? next : undefined;
  };
  const na = name(a);
  const nb = name(b);
  if (na !== undefined && nb !== undefined && na !== nb) return false;
  const prolongs = (long: string, short: string) =>
    long.startsWith(short) && FILL_SUFFIX.test(long.slice(short.length));
  if (x !== y && !prolongs(x, y) && !prolongs(y, x)) return false;
  return !conflictingLabels(a, b);
}

/**
 * Verträgliches Alter: eine Seite ohne Angabe, oder ein Bereich liegt ganz im anderen (`0–12` / `7–10`). Überlappen
 * reicht nicht: `9–15` / `12–36` sind Parallelgruppen (Plan 0038, Review M2).
 */
export function compatibleAge(a?: AgeRange, b?: AgeRange): boolean {
  if (a === undefined || b === undefined) return true;
  const within = (inner: AgeRange, outer: AgeRange) =>
    outer.minMonths <= inner.minMonths && inner.maxMonths <= outer.maxMonths;
  return within(a, b) || within(b, a);
}
