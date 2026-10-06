/**
 * Was „neu“ heißt (Plan 0011, E9): Angebote, die das Gerät beim letzten Öffnen noch nicht kannte und die noch einen
 * kommenden Termin haben. Dazu der persönliche Text, mit dem der Service Worker die allgemeine Nachricht ersetzt.
 * Rein, `now` kommt immer von außen. Nicht im Start-Bundle (`news-not-in-start`): Service Worker, CI und der
 * Lazy-Block „Neu“ nutzen es.
 */
import { ageInMonths, offerFitsAge } from "./age.ts";
import { nextSession } from "./agenda.ts";
import type { Offer } from "./schema.ts";

/** IDs aus `after`, die nicht in `before` stehen und noch nicht beendet sind (Regel der Liste), in Datenreihenfolge. */
export function newOfferIds(before: readonly string[], after: readonly Offer[], now: Date): string[] {
  const known = new Set(before);
  return after.filter((o) => !known.has(o.id) && nextSession(o, now) !== undefined).map((o) => o.id);
}

export interface NewsText {
  title: string;
  body: string;
  /** Zahl der passenden, ohne passende die aller neuen */
  badge: number;
}

/** Alter wie der Kind-Chip: unter 2 Jahren in Monaten, danach in Jahren; „zu“ mit Dativ, „für“ mit Akkusativ. */
function ageWords(months: number, kasus: "dativ" | "akkusativ"): string {
  const n = months >= 24 ? Math.floor(months / 12) : months;
  const unit = months >= 24 ? "Jahr" : "Monat";
  if (n === 1) return `1 ${unit}`;
  return `${n} ${unit}${kasus === "dativ" ? "en" : "e"}`;
}

/** „A“, „A und B“, „A, B und 1 weiteres“, „A, B und 3 weitere“ */
function titleList(offers: readonly Offer[]): string {
  const [first, second] = offers.map((o) => o.title);
  const rest = offers.length - 2;
  if (second === undefined) return first ?? "";
  if (rest <= 0) return `${first} und ${second}`;
  return `${first}, ${second} und ${rest === 1 ? "1 weiteres" : `${rest} weitere`}`;
}

/**
 * Persönlicher Text zu den neuen Angeboten `fresh` oder `undefined` – dann bleibt die allgemeine Nachricht.
 * `undefined` ohne Geburtsdatum, vor der Geburt und ohne neue Angebote. Fehlen die gesehenen IDs (Geräte-Speicher
 * geräumt), ruft der Aufrufer das hier gar nicht erst auf, statt alle Angebote als neu zu melden.
 */
export function newsText({
  fresh,
  birthDate,
  now,
}: {
  fresh: readonly Offer[];
  birthDate?: string | undefined;
  now: Date;
}): NewsText | undefined {
  if (birthDate === undefined || fresh.length === 0) return undefined;
  const months = ageInMonths(birthDate, now);
  if (months < 0) return undefined;
  const zu = `zu ${ageWords(months, "dativ")}`;
  const fitting = fresh.filter((o) => offerFitsAge(o, birthDate, now));
  if (fitting.length > 0) {
    const n = fitting.length;
    return {
      title: n === 1 ? `1 neues Angebot passt ${zu}` : `${n} neue Angebote passen ${zu}`,
      body: titleList(fitting),
      badge: n,
    };
  }
  const n = fresh.length;
  return {
    title:
      n === 1
        ? `1 neues Angebot, passt gerade nicht ${zu}`
        : `${n} neue Angebote, gerade keins für ${ageWords(months, "akkusativ")}`,
    body: titleList(fresh),
    badge: n,
  };
}
