/** Relevanzfilter für Sammelkalender und Ertragsbeweis (aus stadt_vk.RELEVANT). */

/** Baby-/Kleinkindbezug. Bewusst großzügig: Die Relevanz entscheiden am Ende Modell und Ertragsbeweis. */
const RELEVANT =
  /bab(y|ies)|krabbel|kleinkind|eltern[- ]kind|kinderwagen|still(caf|treff|gruppe)|pekip|zwerge|allerkleinsten|ab\s*(0|1|2)\s*(jahr|j\.|\+)|ab\s*\d+\s*monat|0\s*[-–bis]+\s*3|u3|mutter[- ]kind|vater[- ]kind|papa[- ]kind|miniclub|musikzwerge|säugling|fenkid|babymassage|rückbildung|fingerspiel|wiegenl|mini[- ]?(club|gruppe|konzert)|familiencaf|elterncaf|spielgruppe/i;

export function isRelevant(...texts: Array<string | null | undefined>): boolean {
  return RELEVANT.test(texts.filter(Boolean).join(" "));
}
