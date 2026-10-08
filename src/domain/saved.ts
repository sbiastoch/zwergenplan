/**
 * Merkliste und Auswahl für den ICS-Export (Merkliste und Reihe im Detail, Plan 0018): reine Logik. Gespeichert wird
 * in src/data/preferences.ts (nur localStorage).
 * IDs, die im aktuellen Datenstand fehlen, werden nur ausgeblendet, nie gelöscht: Ein lückenhafter
 * Pipeline-Lauf soll keine Merkliste leeren.
 */
import { fittingSessions, sessionFit } from "./age.ts";
import { type Occurrence, shownSession, upcomingSessions } from "./agenda.ts";
import type { DateRange } from "./date-range.ts";
import { applyFilters, EMPTY_FILTER, type FilterState, matchesFilter } from "./filter.ts";
import { KEBAB_ID_PATTERN, MAX_KEBAB_ID } from "./ids.ts";
import type { ReachTarget } from "./reach.ts";
import type { Format, Offer, Registration, Session } from "./schema.ts";

export function toggleId<T extends string>(ids: readonly T[], id: T): T[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * Gemerkte Angebote mit kommendem Termin, je mit dem Termin, an dem die Karte steht (`shownSession`), und danach
 * sortiert: mit Geburtsdatum bei regelmäßigen der erste passende (Plan 0028). Passt keiner, bleibt das Angebot am
 * nächsten Termin stehen, denn es ist bewusst gemerkt; der Export lässt es weg und zählt es (`collectionExport`).
 * Die Regel steht nur hier, die Liste der Merkliste zeigt den Termin von hier (Arch-Review 0025, Minor 1).
 */
export function savedOffers<T extends Offer>(
  offers: readonly T[],
  ids: readonly string[],
  now: Date,
  birthDate: string | undefined,
  /** Schnellwahl „ab …“ des Merklisten-Filters: Termin im Zeitraum (`rangeSession`, Plan 0025, E3a) */
  range?: DateRange,
): Occurrence<T>[] {
  const wanted = new Set(ids);
  const fits = sessionFit(birthDate);
  return offers
    .flatMap((offer) => {
      const session = wanted.has(offer.id) ? shownSession(offer, now, range, fits) : undefined;
      return session ? [{ offer, session }] : [];
    })
    .sort(
      (a, b) =>
        Date.parse(a.session.start) - Date.parse(b.session.start) || a.offer.title.localeCompare(b.offer.title, "de"),
    );
}

/**
 * Kommende Termine aller Angebote zusammen, für die Statuszeile der Merkliste (Plan 0025, E3a). Mit Geburtsdatum bei
 * regelmäßigen nur die passenden, wie im Export (`fittingSessions`, Plan 0028).
 */
export function upcomingSessionCount(offers: readonly Offer[], now: Date, birthDate: string | undefined): number {
  return offers.reduce((sum, offer) => sum + fittingSessions(offer, now, birthDate).length, 0);
}

/** Auswahl für den ICS-Export einer Reihe bzw. der Merkliste (Plan 0018). */
export interface ExportSelection {
  sessions: Session[];
  /** Beginn des ersten passenden Termins, wenn davor kommende Termine wegfallen (zu jung) */
  from?: string;
  /** Beginn des letzten passenden Termins, wenn danach Termine wegfallen (zu alt) */
  until?: string;
}

/**
 * Termine für den ICS-Export (Plan 0018, E1): Kurse immer komplett, sonst nur nicht beendete. Regelmäßige Angebote
 * mit Geburtsdatum nur, solange sie zum Alter passen (`fittingSessions`). Weil das Alter nur steigt, fallen dabei
 * nur vorn oder hinten Termine weg; `from`/`until` nennen dann die Grenze.
 */
export function exportSessions(offer: Offer, now: Date, birthDate: string | undefined): ExportSelection {
  if (offer.format === "kurs") return { sessions: offer.sessions };
  const upcoming = upcomingSessions(offer, now);
  if (offer.format !== "regelmaessig" || birthDate === undefined) return { sessions: upcoming };
  const sessions = fittingSessions(offer, now, birthDate);
  const first = sessions[0];
  const last = sessions.at(-1);
  if (!first || !last) return { sessions };
  return {
    sessions,
    ...(first !== upcoming[0] && { from: first.start }),
    ...(last !== upcoming.at(-1) && { until: last.start }),
  };
}

/** Was „Alle Termine“ im Detail tun soll (Plan 0018, E2). */
export type SeriesExport =
  /** statische Datei: kein Geburtsdatum oder nicht regelmäßig */
  | { kind: "static" }
  /** kein kommender Termin passt zum Alter */
  | { kind: "none" }
  /** im Browser erzeugen, gekürzt oder nicht */
  | { kind: "blob"; selection: ExportSelection };

/**
 * Entscheidung für „Alle Termine“ (Plan 0018, E1). Mit Geburtsdatum entsteht bei regelmäßigen Angeboten immer eine
 * Datei im Browser, auch ungekürzt: Sonst verriete der Request auf die statische Datei, ob das Kind über die ganze
 * Reihe passt (Review 3, W2).
 */
export function seriesExport(offer: Offer, now: Date, birthDate: string | undefined): SeriesExport {
  if (offer.format !== "regelmaessig" || birthDate === undefined) return { kind: "static" };
  const selection = exportSessions(offer, now, birthDate);
  return selection.sessions.length === 0 ? { kind: "none" } : { kind: "blob", selection };
}

/** Sammel-Export der Merkliste (Plan 0018, E3) */
export interface CollectionExport<T extends Offer> {
  /** je Angebot mit passendem Termin dessen Auswahl, in der Reihenfolge der Merkliste */
  items: { offer: T; sessions: Session[] }[];
  /** Termine in der Datei */
  count: number;
  /** gemerkte Angebote ohne passenden Termin; sie fehlen in der Datei */
  missing: number;
}

/**
 * Auswahl für „Alle in den Kalender“ (Plan 0018, E3) mit `exportSessions` je gemerktem Angebot. Toast und Datei
 * zählen mit derselben Auswahl, Datei und Zahl stimmen also überein.
 */
export function collectionExport<T extends Offer>(
  offers: readonly T[],
  now: Date,
  birthDate: string | undefined,
): CollectionExport<T> {
  const items = offers.flatMap((offer) => {
    const { sessions } = exportSessions(offer, now, birthDate);
    return sessions.length > 0 ? [{ offer, sessions }] : [];
  });
  const count = items.reduce((sum, item) => sum + item.sessions.length, 0);
  return { items, count, missing: offers.length - items.length };
}

/** Filter der Merkliste (Plan 0025, E6): getrennt vom Startseiten-Filter, nie in der URL. */
export interface SavedFilter {
  formats: Format[];
  registration: Registration[];
  /** eine der Schnellwahlen „ab …“ (E7); wirkt nur in Liste und Karte */
  range?: DateRange;
}

export const EMPTY_SAVED_FILTER: SavedFilter = { formats: [], registration: [] };

/** Derselbe Filter als Startseiten-Zustand: Es gibt keine eigene Format-, Anmelde- oder Zeitraumlogik (E6). */
function asFilterState({ formats, registration, range }: SavedFilter, useRange: boolean): FilterState {
  return { ...EMPTY_FILTER, formats, registration, ...(useRange && range ? { range } : {}) };
}

/**
 * Gemerkte Angebote nach dem Merklisten-Filter (E6): Format und Anmeldung, mit `useRange` auch die Schnellwahl „ab …“
 * (im Kalender nicht, dort ist die Auswahl der Zeitraum, E5). Ohne kommenden Termin fällt ein Angebot heraus.
 */
export function applySavedFilter<T extends Offer & { venue: ReachTarget }>(
  offers: readonly T[],
  filter: SavedFilter,
  now: Date,
  { useRange }: { useRange: boolean },
): T[] {
  return applyFilters(offers, asFilterState(filter, useRange), { now });
}

/** Passt ein Angebot zu Format und Anmeldung, ohne Zeitbezug? Für „heute schon vorbei“ im Kalender (M7). */
export function matchesSavedFilter(offer: Offer & { venue: ReachTarget }, filter: SavedFilter): boolean {
  return matchesFilter(offer, asFilterState(filter, false));
}

/** Ein Chip der Filterzeile (E6, E7) */
export type SavedFilterChip =
  | { kind: "format"; value: Format }
  | { kind: "registration"; value: Registration }
  | { kind: "range"; range: DateRange };

/**
 * Tipp auf einen Chip: Format als Mehrfachwahl, Anmeldung als Einfachwahl wie im Filter-Sheet, die Schnellwahlen
 * „ab …“ als Einfachwahl, die ein zweiter Tipp aufhebt. Ohne Zeitraum fehlt der Schlüssel (kanonisch wie `withDateRange`).
 */
export function toggleSavedFilter(filter: SavedFilter, chip: SavedFilterChip): SavedFilter {
  if (chip.kind === "format") return { ...filter, formats: toggleId(filter.formats, chip.value) };
  if (chip.kind === "registration") {
    return { ...filter, registration: filter.registration.includes(chip.value) ? [] : [chip.value] };
  }
  const { range, ...rest } = filter;
  const same = range?.from === chip.range.from && range?.to === chip.range.to;
  return same ? rest : { ...rest, range: chip.range };
}

/** Gewählte Werte; der Zeitraum zählt als einer und nur mit `useRange` (Statuszeile, „Zurücksetzen“, Export-Name). */
export function savedFilterCount(filter: SavedFilter, { useRange }: { useRange: boolean }): number {
  return filter.formats.length + filter.registration.length + (useRange && filter.range ? 1 : 0);
}

/**
 * Gemerkte Anbieter aus dem Speicher bereinigen (Plan 0025, E1): gültige ID, höchstens MAX_KEBAB_ID, keine
 * Dubletten. Gemerkt und entfernt wird wie bei Angeboten mit `toggleId`.
 */
export function cleanSavedProviders(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  return raw.filter((id) => {
    if (id.length > MAX_KEBAB_ID || !KEBAB_ID_PATTERN.test(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
