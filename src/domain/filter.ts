import { nextSession } from "./agenda.ts";
import { LIMIT_MINUTES, type ReachFn, type ReachLimit, type ReachTarget, withinLimit } from "./reach.ts";
import type { Cost, Format, Offer, Registration } from "./schema.ts";
import { CATEGORIES, type Category, categoriesOf } from "./topics.ts";

export const FORMATS = ["kurs", "regelmaessig", "einmalig"] as const satisfies readonly Format[];
const REGISTRATIONS = ["mit-anmeldung", "ohne-anmeldung"] as const satisfies readonly Registration[];
const COSTS = ["kostenlos", "kostenpflichtig"] as const satisfies readonly Cost[];

/**
 * Filterzustand. Innerhalb einer Dimension ODER, zwischen Dimensionen UND.
 * Eine leere Liste heißt „egal“. Das Geburtsdatum ist bewusst NICHT Teil der URL
 * (Links werden geteilt – das Geburtsdatum des Kindes gehört nicht hinein).
 * Die Wegzeit-Grenze darf in die URL, weil sie ohne Startpunkt nichts verrät; der Startpunkt selbst nie
 * (Plan 0004, E7; Plan 0009, E8).
 */
export interface FilterState {
  categories: Category[];
  formats: Format[];
  registration: Registration[];
  cost: Cost[];
  /** wirkt nur mit Wegzeit (`FilterContext.reach`, Art „oepnv“) */
  reachLimit?: ReachLimit;
}

/** die Mehrfachwahl-Dimensionen; die Wegzeit ist eine Einfachwahl */
const LIST_DIMENSIONS = ["categories", "formats", "registration", "cost"] as const;
type Dimension = (typeof LIST_DIMENSIONS)[number];
/** `umkreis=` (km, Plan 0004) wird nicht mehr gelesen (Plan 0009, E8). */
const REACH_KEY = "wegzeit";

export const EMPTY_FILTER: FilterState = { categories: [], formats: [], registration: [], cost: [] };

const PARAMS = {
  categories: { key: "kat", values: CATEGORIES },
  formats: { key: "format", values: FORMATS },
  registration: { key: "anmeldung", values: REGISTRATIONS },
  cost: { key: "kosten", values: COSTS },
} as const;

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const wanted = new Set(raw.split(","));
  // Reihenfolge kanonisch nach `allowed`, Unbekanntes wird verworfen.
  return allowed.filter((v) => wanted.has(v));
}

/** Nur genau „20“, „30“ oder „45“; alles andere wird verworfen. */
function parseReachLimit(raw: string | null): ReachLimit | undefined {
  const value = LIMIT_MINUTES.find((m) => String(m) === raw);
  return value === undefined ? undefined : { kind: "minuten", value };
}

export function filterFromSearch(search: string): FilterState {
  const p = new URLSearchParams(search);
  const reachLimit = parseReachLimit(p.get(REACH_KEY));
  return {
    categories: parseList(p.get(PARAMS.categories.key), PARAMS.categories.values),
    formats: parseList(p.get(PARAMS.formats.key), PARAMS.formats.values),
    registration: parseList(p.get(PARAMS.registration.key), PARAMS.registration.values),
    cost: parseList(p.get(PARAMS.cost.key), PARAMS.cost.values),
    ...(reachLimit ? { reachLimit } : {}),
  };
}

/** Kanonischer Querystring ohne führendes „?“; leer, wenn kein Filter aktiv ist. */
export function filterToSearch(state: FilterState): string {
  const p = new URLSearchParams();
  for (const dim of LIST_DIMENSIONS) {
    const { key, values } = PARAMS[dim];
    const selected = new Set<string>(state[dim]);
    const list = values.filter((v) => selected.has(v));
    if (list.length > 0) p.set(key, list.join(","));
  }
  if (state.reachLimit) p.set(REACH_KEY, String(state.reachLimit.value));
  return p.toString().replaceAll("%2C", ",");
}

function matches<T>(selected: readonly T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

export interface FilterContext {
  /** „Jetzt“ – injiziert, damit Tests und E2E deterministisch sind. */
  now: Date;
  /** Entfernung ab dem Startpunkt; nur mit Wegzeit (Art „oepnv“) wirkt `reachLimit` (E11) */
  reach?: ReachFn | undefined;
}

/**
 * Anzahl gewählter Werte über alle Dimensionen (Badge am Filter-Knopf). Die Wegzeit zählt nur, wenn sie
 * wirkt (`limitActive`, Plan 0009, E8).
 */
export function activeFilterCount(state: FilterState, { limitActive }: { limitActive: boolean }): number {
  const lists = state.categories.length + state.formats.length + state.registration.length + state.cost.length;
  return lists + (limitActive && state.reachLimit ? 1 : 0);
}

/** Schaltet einen Wert einer Dimension um und lässt alles andere unverändert. */
export function toggleIn<D extends Dimension>(state: FilterState, dim: D, value: FilterState[D][number]): FilterState {
  const list: readonly string[] = state[dim];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...state, [dim]: next };
}

/**
 * Setzt die Wegzeit-Grenze (Einfachwahl) oder entfernt sie mit `undefined` („Egal“). Ohne Grenze fehlt der
 * Schlüssel ganz, damit der Zustand gleich `EMPTY_FILTER` bleibt und die URL kanonisch.
 */
export function withReachLimit(state: FilterState, limit: ReachLimit | undefined): FilterState {
  const { reachLimit: _old, ...rest } = state;
  return limit ? { ...rest, reachLimit: limit } : rest;
}

/**
 * Passt ein Angebot zu den Filtern (Kategorie, Format, Anmeldung, Kosten, Wegzeit)? Ohne Zeitbezug:
 * Auch ein vorbei-es Angebot kann passen. Gebraucht für „Für heute ist alles vorbei“ (Plan 0007, E2).
 * Die Wegzeit-Grenze wirkt nur mit Wegzeit; bei Luftlinie oder ohne Startpunkt nicht (E11).
 */
export function matchesFilter(offer: Offer & { venue: ReachTarget }, state: FilterState, reach?: ReachFn): boolean {
  if (!matches(state.formats, offer.format)) return false;
  if (!matches(state.registration, offer.registration)) return false;
  if (!matches(state.cost, offer.cost)) return false;
  if (state.categories.length > 0) {
    const cats = categoriesOf(offer.topics);
    if (!cats.some((c) => state.categories.includes(c))) return false;
  }
  const limit = state.reachLimit;
  if (reach && limit && withinLimit(reach(offer.venue), limit) === false) return false;
  return true;
}

/**
 * Angebote, deren letzter Termin vorbei ist, fallen immer heraus.
 * Das Alter filtert hier bewusst nicht: Die Oberfläche zeigt unpassende Angebote auf Wunsch
 * markiert an (`splitByAge` in age.ts). Die Wegzeit-Grenze wirkt nur mit Wegzeit.
 */
export function applyFilters<T extends Offer & { venue: ReachTarget }>(
  offers: readonly T[],
  state: FilterState,
  ctx: FilterContext,
): T[] {
  return offers.filter((o) => nextSession(o, ctx.now) !== undefined && matchesFilter(o, state, ctx.reach));
}
