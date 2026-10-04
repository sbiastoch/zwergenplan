/** Relevanzfilter und Themen-Heuristik für Sammelkalender (aus stadt_vk.RELEVANT und candidates.TOPIC_RULES). */
import type { Topic } from "../../../src/domain/topics.ts";

/** Baby-/Kleinkindbezug. Bewusst großzügig: Die Relevanz entscheidet am Ende der Agent. */
const RELEVANT =
  /bab(y|ies)|krabbel|kleinkind|eltern[- ]kind|kinderwagen|still(caf|treff|gruppe)|pekip|zwerge|allerkleinsten|ab\s*(0|1|2)\s*(jahr|j\.|\+)|ab\s*\d+\s*monat|0\s*[-–bis]+\s*3|u3|mutter[- ]kind|vater[- ]kind|papa[- ]kind|miniclub|musikzwerge|säugling|fenkid|babymassage|rückbildung|fingerspiel|wiegenl|mini[- ]?(club|gruppe|konzert)|familiencaf|elterncaf|spielgruppe/i;

export function isRelevant(...texts: Array<string | null | undefined>): boolean {
  return RELEVANT.test(texts.filter(Boolean).join(" "));
}

const TOPIC_RULES: ReadonlyArray<readonly [Topic, RegExp]> = [
  ["pekip", /pekip/],
  ["babymassage", /babymassage/],
  ["krabbelgruppe", /krabbel(?!gottesdienst)/],
  ["eltern-kind-gruppe", /eltern[- ]kind|mutter[- ]kind|miniclub|mini-club/],
  ["musik", /musik|singen|lieder|rhythmik/],
  ["yoga-mit-baby", /yoga/],
  ["fitness-mit-baby", /barre|pilates|fitness|rückbildung/],
  ["tanz", /tanz|dancer/],
  ["museum", /museum/],
  ["theater", /theater|puppen/],
  ["konzert", /konzert/],
  ["vorlesen", /vorles|bücherzwerge|bilderbuch/],
  ["elterncafe", /café|cafe|elterncaf/],
  ["krabbelgottesdienst", /gottesdienst|kinderkirche|minikirche/],
  ["waldgruppe", /wald/],
  ["stillcafe", /still(caf|treff|zeit)|milchzeit/],
  ["vaeter", /väter|vater|papa/],
];

/** Themen aus Titel und Beschreibung, in fester Reihenfolge und ohne Dubletten. */
export function topicsFromText(text: string): Topic[] {
  const lower = text.toLowerCase();
  return TOPIC_RULES.filter(([, rx]) => rx.test(lower)).map(([topic]) => topic);
}

export const FREE_RE = /kostenlos|kostenfrei|eintritt frei|gebührenfrei/i;
export const OPEN_RE = /ohne anmeldung|offene[rs]? (treff|café|cafe)|einfach vorbei/i;
