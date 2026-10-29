/**
 * Die Wochen-Nachricht auf dem Gerät (Plan 0017, E3, E4; Plan 0043, E2, E3): was „neu“ heißt und der zugeschnittene
 * Text nach Such-Abos und Alter. Rein, `now` kommt immer von außen. Nur der Service Worker und die CI nutzen es
 * (`push-domain-not-in-start`).
 */
import { ageInMonths, sessionFit, startFitsAge } from "./age.ts";
import { nextSession, startedCourse } from "./agenda.ts";
import { type FilterState, matchesFilter } from "./filter.ts";
import { resolveOfferId } from "./ids.ts";
import { listingWeek } from "./listing.ts";
import type { ReachFn, ReachTarget } from "./reach.ts";
import type { Offer, Session } from "./schema.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * IDs der neuen Angebote mit kommendem Termin und ohne laufende Kurse (Regel der Liste, `discoverable`, Plan 0053), in Datenreihenfolge (Plan 0043, E3): Mit `listedAt`
 * ist neu, was in dieser Woche eingestellt wurde (`listingWeek`, auch ein neuer Durchgang unter alter ID). Ohne
 * `listedAt` (Bestand vor Plan 0043) ist neu, was in `before` fehlt; ohne `before` keins davon. Alte lange IDs in
 * `before` (gespeicherte `seenIds`, Stand vor 7 Tagen) zählen als ihre Kurz-ID (ADR 0022) – sonst meldete die erste
 * Nachricht nach dem Umstieg alle Angebote als neu.
 */
export function newOfferIds(before: readonly string[] | undefined, after: readonly Offer[], now: Date): string[] {
  const known = before && new Set(before.map((id) => resolveOfferId(id) ?? id));
  const fresh = (o: Offer) =>
    o.listedAt !== undefined ? listingWeek(o, now) === "diese-woche" : known !== undefined && !known.has(o.id);
  // wie `discoverable`, ausgeschrieben: ein Aufruf weniger im Service Worker (Budget 9 kB)
  return after.filter((o) => fresh(o) && !startedCourse(o, now) && nextSession(o, now) !== undefined).map((o) => o.id);
}

/**
 * Angebote mit mindestens einem Termin, der in [now, now + 7 × 24 h) beginnt (E4), ohne laufende Kurse (Plan 0053, E1).
 * Ein laufender Termin zählt nicht;
 * an den Umstellungs-Wochenenden verschiebt sich das Ende bewusst um eine Stunde.
 */
export function offersInWeek<T extends Offer>(offers: readonly T[], now: Date): T[] {
  return offers.filter((o) => !startedCourse(o, now) && o.sessions.some((s) => startsInWeek(s, now)));
}

function startsInWeek(session: Session, now: Date): boolean {
  const start = Date.parse(session.start);
  return start >= now.getTime() && start < now.getTime() + WEEK_MS;
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
 * oder der Beginn passt zum Alter, `startFitsAge`). Die Wochenzahl verlangt bei regelmäßigen Angeboten zusätzlich einen
 * passenden Termin in den 7 Tagen (Plan 0043, E2). Vor der Geburt zählt nur das Alter nicht, die Abos wirken weiter.
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
    (!bySearch || searches.some((s) => matchesFilter(o, s, reach))) && (!byAge || startFitsAge(o, birthDate, now));
  // `sessionFit` ist die eine Quelle der Prüfung je Termin (Kurse und Einzeltermine prüft es nicht, ADR 0007)
  const sessionFits = byAge ? sessionFit(birthDate) : undefined;
  const fitsInWeek = (o: T) => !sessionFits || o.sessions.some((s) => startsInWeek(s, now) && sessionFits(o, s));
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
  const m = week.filter((o) => fits(o) && fitsInWeek(o)).length;
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
