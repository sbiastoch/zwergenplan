/**
 * Merkliste und Auswahl für den ICS-Export (Merkliste und Reihe im Detail, Plan 0018): reine Logik. Gespeichert wird
 * in src/data/preferences.ts (nur localStorage).
 * IDs, die im aktuellen Datenstand fehlen, werden nur ausgeblendet, nie gelöscht: Ein lückenhafter
 * Pipeline-Lauf soll keine Merkliste leeren.
 */
import { fittingSessions, sessionFit, splitByAge } from "./age.ts";
import { courseRunning, type Occurrence, shownSession, upcomingSessions } from "./agenda.ts";
import type { SessionRule } from "./date-range.ts";
import { activeFilterCount, applyFilters, EMPTY_FILTER, type FilterState, matchesFilter } from "./filter.ts";
import { resolveOfferId, resolveProviderId } from "./ids.ts";
import type { ReachFn, ReachTarget } from "./reach.ts";
import type { Offer, Session } from "./schema.ts";
import { addDays, berlinIsoDate } from "./time.ts";

export function toggleId<T extends string>(ids: readonly T[], id: T): T[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Stufe eines Angebots auf der Merkliste (Plan 0057, E1; ADR 0040) */
export type SavedStage = "aus" | "vorgemerkt" | "fest";

/**
 * Merkliste mit Stufen (E1): `ids` sind alle gemerkten in Merk-Reihenfolge, `tentative` die nur vorgemerkten (immer eine
 * Teilmenge). Fest eingeplant ist jede gemerkte ID, die nicht vorgemerkt ist; so gilt der Bestand ohne zweite Liste als
 * fest eingeplant.
 */
export interface SavedState {
  ids: readonly string[];
  tentative: readonly string[];
}

export function stageOf(state: SavedState, id: string): SavedStage {
  if (!state.ids.includes(id)) return "aus";
  return state.tentative.includes(id) ? "vorgemerkt" : "fest";
}

const NEXT_STAGE: Record<SavedStage, SavedStage> = { aus: "vorgemerkt", vorgemerkt: "fest", fest: "aus" };

/** Tipp aufs Herz: aus → vorgemerkt → fest → aus */
export function cycleStage(state: SavedState, id: string): SavedState {
  return withStage(state, id, NEXT_STAGE[stageOf(state, id)]);
}

/**
 * Halten oder „Rückgängig“: Stufe direkt setzen; „aus“ entfernt aus beiden Listen. Neu Gemerktes hängt hinten an, ein
 * Wechsel zwischen „vorgemerkt“ und „fest“ hält die Stelle. Bei gleicher Stufe kommt derselbe Zustand zurück.
 */
export function withStage(state: SavedState, id: string, stage: SavedStage): SavedState {
  if (stageOf(state, id) === stage) return state;
  const without = state.tentative.filter((x) => x !== id);
  if (stage === "aus") return { ids: state.ids.filter((x) => x !== id), tentative: without };
  const ids = state.ids.includes(id) ? state.ids : [...state.ids, id];
  return { ids, tentative: stage === "vorgemerkt" ? [...without, id] : without };
}

/**
 * Bereinigung beim Laden (E1; ADR 0022, Punkt 10): beide Listen migriert, Vorgemerktes nur, solange es gemerkt ist.
 * Eine alte App-Version ohne Stufen kann eine ID aus der Merkliste entfernen und die Vorgemerkt-ID stehen lassen.
 */
export function cleanSavedState(state: SavedState): SavedState {
  const ids = migrateSavedIds(state.ids);
  const known = new Set(ids);
  return { ids, tentative: migrateSavedIds(state.tentative).filter((id) => known.has(id)) };
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
  /** Zeitraum und Tageszeit des Merklisten-Filters: Termin darin (Plan 0025, E3a; Plan 0057, E5, `savedRule`) */
  rule?: SessionRule,
): Occurrence<T>[] {
  const wanted = new Set(ids);
  const fits = sessionFit(birthDate);
  return offers
    .flatMap((offer) => {
      const session = wanted.has(offer.id) ? shownSession(offer, now, rule, fits) : undefined;
      return session ? [{ offer, session }] : [];
    })
    .sort(
      (a, b) =>
        Date.parse(a.session.start) - Date.parse(b.session.start) || a.offer.title.localeCompare(b.offer.title, "de"),
    );
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
  /** fest eingeplante Angebote ohne passenden Termin; sie fehlen in der Datei */
  missing: number;
  /** vorgemerkte Angebote; sie fehlen in der Datei (Plan 0057, E4) */
  tentative: number;
}

/**
 * Auswahl für „Fest Eingeplantes in meinen Kalender“ (Plan 0018, E3; Plan 0057, E4) mit `exportSessions` je fest
 * eingeplantem Angebot. Mit `state` fallen die vorgemerkten weg und werden gezählt; ohne zählt alles (Statuszeile).
 * Toast und Datei zählen mit derselben Auswahl, Datei und Zahl stimmen also überein.
 */
export function collectionExport<T extends Offer>(
  offers: readonly T[],
  now: Date,
  birthDate: string | undefined,
  state?: SavedState,
): CollectionExport<T> {
  const fixed = state ? offers.filter((offer) => stageOf(state, offer.id) === "fest") : offers;
  const items = fixed.flatMap((offer) => {
    const { sessions } = exportSessions(offer, now, birthDate);
    return sessions.length > 0 ? [{ offer, sessions }] : [];
  });
  const count = items.reduce((sum, item) => sum + item.sessions.length, 0);
  return { items, count, missing: fixed.length - items.length, tentative: offers.length - fixed.length };
}

/**
 * Filter der Merkliste (Plan 0025, E6; Plan 0057, E5): derselbe Zustand wie auf der Startseite, getrennt von ihm und nie
 * in der URL, dazu „Nur fest eingeplant“. Es gibt keine eigene Filterlogik.
 */
export interface SavedFilter {
  filter: FilterState;
  onlyFixed: boolean;
}

export const EMPTY_SAVED_FILTER: SavedFilter = { filter: EMPTY_FILTER, onlyFixed: false };

/** Der Merklisten-Filter dieser Darstellung: Im Kalender ist die Auswahl der Zeitraum, der Filter-Zeitraum fällt weg (E5). */
function viewFilter(filter: FilterState, useRange: boolean): FilterState {
  if (useRange || !filter.range) return filter;
  const { range: _range, ...rest } = filter;
  return rest;
}

/** Welche Termine zählen (gezeigter Termin, Alters-Markierung): Zeitraum nur außerhalb des Kalenders, Tageszeit immer. */
export function savedRule({ filter }: SavedFilter, useRange: boolean): SessionRule {
  return { range: useRange ? filter.range : undefined, daytimes: filter.daytimes };
}

const fixedOnly = (saved: SavedFilter, state: SavedState) => (offer: Offer) =>
  !saved.onlyFixed || stageOf(state, offer.id) === "fest";

/**
 * Gemerkte Angebote nach dem Merklisten-Filter (E5) über `applyFilters` wie auf der Startseite: Kategorie, Format,
 * Anmeldung, Kosten, Tageszeit, mit `useRange` der Zeitraum (im Kalender nicht), mit `reach` die Wegzeit-Grenze; danach
 * „Nur fest eingeplant“. Ohne kommenden Termin fällt ein Angebot heraus.
 */
export function applySavedFilter<T extends Offer & { venue: ReachTarget }>(
  offers: readonly T[],
  saved: SavedFilter,
  state: SavedState,
  now: Date,
  { useRange, reach }: { useRange: boolean; reach?: ReachFn | undefined },
): T[] {
  // Gemerkte laufende Kurse bleiben: Man nimmt vielleicht teil (Plan 0053, E1)
  return applyFilters(offers, viewFilter(saved.filter, useRange), { now, reach, runningCourses: true }).filter(
    fixedOnly(saved, state),
  );
}

/**
 * Passt ein Angebot zum Merklisten-Filter, ohne Zeitbezug? Für „heute schon vorbei“ im Kalender (Plan 0025, M7). Die
 * Tageszeit prüft der Kalender je Termin (`inDaytime`), nicht hier: Sonst fiele ein Angebot heraus, dessen einziger
 * Termin heute schon vorbei ist (Plan 0057, E7).
 */
export function matchesSavedFilter(
  offer: Offer & { venue: ReachTarget },
  saved: SavedFilter,
  state: SavedState,
  reach?: ReachFn,
): boolean {
  return matchesFilter(offer, saved.filter, reach) && fixedOnly(saved, state)(offer);
}

/**
 * Gewählte Werte wie im Badge der Startseite (`activeFilterCount`), dazu eins für „Nur fest eingeplant“ (E5). Im
 * Kalender zählt der Zeitraum nicht, er wirkt dort nicht.
 */
export function savedFilterCount(
  saved: SavedFilter,
  { useRange, limitActive }: { useRange: boolean; limitActive: boolean },
): number {
  return activeFilterCount(viewFilter(saved.filter, useRange), { limitActive }) + (saved.onlyFixed ? 1 : 0);
}

/**
 * Alters-Markierung der Merkliste (E5, Review 3 M2): wie `unfitIds`, aber mit der Regel des Merklisten-Filters. Ein
 * regelmäßiges Angebot, dessen passende Termine alle außerhalb von Zeitraum bzw. Tageszeit liegen, ist markiert.
 */
export function savedUnfitIds(
  offers: readonly Offer[],
  birthDate: string | undefined,
  now: Date,
  rule: SessionRule,
): ReadonlySet<string> {
  if (birthDate === undefined) return new Set();
  return new Set(splitByAge(offers, birthDate, now, rule).unfit.map((o) => o.id));
}

/**
 * Sortierung der Liste der Merkliste (Plan 0057, E6; Plan 0058, E3): „Nächste Termine“ (Standard), „Nächstgelegen“,
 * „Zuletzt gemerkt“. „Was ist zu tun“ mit Abschnitten ist mit Plan 0058 entfallen, die Abschnitte sind Chips.
 */
export type SavedSort = "termine" | "nah" | "gemerkt";

/** „Demnächst“ reicht bis einschließlich zum 14. Berliner Kalendertag nach heute (Plan 0057, E8) */
export const SOON_DAYS = 14;

/** Schnellfilter der Liste der Merkliste (Plan 0058, E1); nie in der URL, ohne Wirkung in Karte und Kalender */
export type SavedListChip = "demnaechst" | "anmelden" | "spontan" | "laeuft" | "kurse" | "einmalig";

/** Reihenfolge der Chipzeile (Plan 0058, E1) */
export const SAVED_LIST_CHIPS: readonly SavedListChip[] = [
  "demnaechst",
  "anmelden",
  "spontan",
  "laeuft",
  "kurse",
  "einmalig",
];

/**
 * „Demnächst“ (Plan 0058, E1; Regel aus Plan 0057, E8): gezeigter Termin bis einschließlich zum 14. Berliner Kalendertag,
 * ohne laufende Kurse (schon gebucht) und ohne Regelmäßiges ohne Anmeldung (hätte sonst immer einen Termin darin).
 * Dieselbe Regel gilt für Chip und Kachel-Marke.
 */
export function isSoon({ offer, session }: Occurrence, now: Date): boolean {
  if (courseRunning(offer, now)) return false;
  if (offer.format === "regelmaessig" && offer.registration === "ohne-anmeldung") return false;
  return berlinIsoDate(session.start) <= addDays(berlinIsoDate(now), SOON_DAYS);
}

/** Gruppen der Chips (E1): innerhalb einer Gruppe ODER, zwischen Gruppen UND, wie im Filter-Sheet */
const CHIP_GROUPS: readonly (readonly SavedListChip[])[] = [
  ["demnaechst", "laeuft"],
  ["anmelden", "spontan"],
  ["kurse", "einmalig"],
];

function chipMatches(chip: SavedListChip, item: Occurrence, now: Date): boolean {
  const { offer } = item;
  switch (chip) {
    case "demnaechst":
      return isSoon(item, now);
    case "anmelden":
      return offer.registration === "mit-anmeldung" && !courseRunning(offer, now);
    case "spontan":
      // auch ein laufender Kurs ohne Anmeldung: Dort kann man einfach hingehen (Review m1)
      return offer.registration === "ohne-anmeldung";
    case "laeuft":
      return courseRunning(offer, now);
    case "kurse":
      return offer.format === "kurs";
    case "einmalig":
      return offer.format === "einmalig";
  }
}

/** Passt ein gemerktes Angebot am gezeigten Termin zu den gewählten Chips (Plan 0058, E1)? Ohne Chip passt alles. */
export function matchesListChips(item: Occurrence, chips: readonly SavedListChip[], now: Date): boolean {
  return CHIP_GROUPS.every((group) => {
    const chosen = group.filter((chip) => chips.includes(chip));
    return chosen.length === 0 || chosen.some((chip) => chipMatches(chip, item, now));
  });
}

/**
 * „Anschluss suchen“ an einem laufenden Kurs (E8): Kurse derselben Kategorie ab dem Tag nach dem letzten Termin. Ersetzt
 * die übrigen Filter der Startseite, statt sie zu ergänzen.
 */
export function followUpFilter(offer: Offer): FilterState {
  const last = offer.sessions.at(-1);
  const filter: FilterState = { ...EMPTY_FILTER, formats: ["kurs"], categories: [offer.category] };
  return last ? { ...filter, range: { from: addDays(berlinIsoDate(last.start), 1) } } : filter;
}

/** „Zuletzt gemerkt“ (E6): nach der Merk-Reihenfolge rückwärts; ein Stufenwechsel ändert sie nicht (E1). */
export function recentlySaved<T extends Offer>(
  items: readonly Occurrence<T>[],
  ids: readonly string[],
): Occurrence<T>[] {
  const position = new Map(ids.map((id, i) => [id, i]));
  const at = (item: Occurrence<T>) => position.get(item.offer.id) ?? -1;
  return [...items].sort((a, b) => at(b) - at(a));
}

/**
 * Gemerkte Angebote aus dem Speicher nach ADR 0022: IDs der alten Form werden zu Kurz-IDs (`resolveOfferId`),
 * Dubletten fallen weg (die erste Stelle bleibt), die Reihenfolge bleibt. Unbekanntes bleibt stehen wie bisher –
 * ausgeblendet wird erst gegen die Daten.
 */
export function migrateSavedIds(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  return raw.flatMap((id) => {
    const next = resolveOfferId(id) ?? id;
    if (seen.has(next)) return [];
    seen.add(next);
    return [next];
  });
}

/**
 * Gemerkte Anbieter aus dem Speicher bereinigen (Plan 0025, E1; ADR 0022): `publicId` bleibt, eine Katalog-ID aus der
 * Zeit vor ADR 0022 wird zur `publicId` (`resolveProviderId`), Ungültiges fällt weg. Bei Dubletten gilt die erste
 * Stelle. Gemerkt und entfernt wird wie bei Angeboten mit `toggleId`.
 */
export function cleanSavedProviders(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  return raw.flatMap((id) => {
    const next = resolveProviderId(id);
    if (next === undefined || seen.has(next)) return [];
    seen.add(next);
    return [next];
  });
}
