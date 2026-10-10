/**
 * Die Wochen-Nachricht auf dem Gerät (Plan 0017, E3, E4): was „neu“ heißt (Angebote, die das Gerät bei der letzten
 * Nachricht noch nicht kannte und die noch einen kommenden Termin haben) und der zugeschnittene Text nach Such-Abos
 * und Alter. Rein, `now` kommt immer von außen. Nur der Service Worker und die CI nutzen es (`push-domain-not-in-start`).
 */
import { ageInMonths, offerFitsAge } from "./age.ts";
import { nextSession } from "./agenda.ts";
import { type FilterState, matchesFilter } from "./filter.ts";
import { resolveOfferId } from "./ids.ts";
import type { ReachFn, ReachTarget } from "./reach.ts";
import type { Offer } from "./schema.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * IDs aus `after`, die nicht in `before` stehen und noch nicht beendet sind (Regel der Liste), in Datenreihenfolge.
 * Alte lange IDs in `before` (gespeicherte `seenIds`, Stand vor 7 Tagen) zählen als ihre Kurz-ID (ADR 0022) – sonst
 * meldete die erste Nachricht nach dem Umstieg alle Angebote als neu.
 */
export function newOfferIds(before: readonly string[], after: readonly Offer[], now: Date): string[] {
  const known = new Set(before.map((id) => resolveOfferId(id) ?? id));
  return after.filter((o) => !known.has(o.id) && nextSession(o, now) !== undefined).map((o) => o.id);
}

/**
 * Angebote mit mindestens einem Termin, der in [now, now + 7 × 24 h) beginnt (E4). Ein laufender Termin zählt nicht;
 * an den Umstellungs-Wochenenden verschiebt sich das Ende bewusst um eine Stunde.
 */
export function offersInWeek<T extends Offer>(offers: readonly T[], now: Date): T[] {
  const from = now.getTime();
  const to = from + WEEK_MS;
  return offers.filter((o) =>
    o.sessions.some((s) => {
      const start = Date.parse(s.start);
      return start >= from && start < to;
    }),
  );
}

export interface WeeklyInput<T extends Offer & { venue: ReachTarget }> {
  /** neue, noch nicht beendete Angebote (aus `newOfferIds`) */
  fresh: readonly T[];
  /** `offersInWeek(site.offers, now)` */
  week: readonly T[];
  /** Such-Abos; leer = keins */
  searches: readonly FilterState[];
  birthDate?: string | undefined;
  /** Wegzeit ab dem gespeicherten Startpunkt (ADR 0017); ohne wirkt die Wegzeit-Grenze nicht (wie in der Liste) */
  reach?: ReachFn | undefined;
  now: Date;
}

export interface WeeklyText {
  title: string;
  body: string;
  /** IDs der passenden neuen Angebote, in Datenreihenfolge */
  hits: string[];
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
 * Der zugeschnittene Text (E4), immer einer. Passt heißt: (keine Abos oder ein Abo passt) und (kein gültiges Alter
 * oder das Angebot passt zum Alter). Vor der Geburt zählt nur das Alter nicht, die Abos wirken weiter.
 */
export function weeklyText<T extends Offer & { venue: ReachTarget }>({
  fresh,
  week,
  searches,
  birthDate,
  reach,
  now,
}: WeeklyInput<T>): WeeklyText {
  const months = birthDate === undefined ? -1 : ageInMonths(birthDate, now);
  const byAge = birthDate !== undefined && months >= 0;
  const bySearch = searches.length > 0;
  const fits = (o: T) =>
    (!bySearch || searches.some((s) => matchesFilter(o, s, reach))) && (!byAge || offerFitsAge(o, birthDate, now));
  const hits = fresh.filter(fits);
  const n = hits.length;
  if (n > 0) {
    const title = bySearch
      ? `${n === 1 ? "1 neues Angebot" : `${n} neue Angebote`} für deine Suchen`
      : byAge
        ? `${n === 1 ? "1 neues Angebot passt" : `${n} neue Angebote passen`} zu ${ageWords(months, "dativ")}`
        : `${n === 1 ? "1 neues Angebot" : `${n} neue Angebote`} im Zwergenplan`;
    return { title, body: titleList(hits), hits: hits.map((o) => o.id) };
  }
  const m = week.filter(fits).length;
  const filtered = bySearch || byAge;
  const title = bySearch
    ? "Diese Woche nichts Neues für deine Suchen"
    : byAge
      ? `Diese Woche nichts Neues für ${ageWords(months, "akkusativ")}`
      : "Diese Woche nichts Neues";
  const body = filtered
    ? m === 0
      ? "In den nächsten 7 Tagen nichts Passendes."
      : `${m === 1 ? "1 passendes Angebot" : `${m} passende Angebote`} in den nächsten 7 Tagen.`
    : m === 0
      ? "In den nächsten 7 Tagen keine Angebote."
      : `${m === 1 ? "1 Angebot" : `${m} Angebote`} in den nächsten 7 Tagen.`;
  return { title, body, hits: [] };
}
