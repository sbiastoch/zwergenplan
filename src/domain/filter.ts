import { nextSession } from "./agenda.ts";
import { type Origin, RADII_KM, type ReachLimit, type ReachTarget, reachTo, withinLimit } from "./reach.ts";
import type { Cost, Format, Offer, Registration } from "./schema.ts";
import { CATEGORIES, type Category, categoriesOf } from "./topics.ts";

export const FORMATS = ["kurs", "regelmaessig", "einmalig"] as const satisfies readonly Format[];
const REGISTRATIONS = ["mit-anmeldung", "ohne-anmeldung"] as const satisfies readonly Registration[];
const COSTS = ["kostenlos", "kostenpflichtig"] as const satisfies readonly Cost[];

/**
 * Filterzustand. Innerhalb einer Dimension ODER, zwischen Dimensionen UND.
 * Eine leere Liste heißt „egal“. Das Geburtsdatum ist bewusst NICHT Teil der URL
 * (Links werden geteilt – das Geburtsdatum des Kindes gehört nicht hinein).
 * Der Umkreis darf in die URL, weil er ohne Startpunkt nichts verrät; der Startpunkt selbst nie
 * (Plan 0004, E7).
 */
export interface FilterState {
  categories: Category[];
  formats: Format[];
  registration: Registration[];
  cost: Cost[];
  /** wirkt nur mit Startpunkt (`FilterContext.origin`) */
  reachLimit?: ReachLimit;
}

/** die Mehrfachwahl-Dimensionen; der Umkreis ist eine Einfachwahl */
const LIST_DIMENSIONS = ["categories", "formats", "registration", "cost"] as const;
type Dimension = (typeof LIST_DIMENSIONS)[number];
const REACH_KEY = "umkreis";

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

/** Nur genau „2“, „5“ oder „10“; alles andere wird verworfen. */
function parseReachLimit(raw: string | null): ReachLimit | undefined {
  const value = RADII_KM.find((r) => String(r) === raw);
  return value === undefined ? undefined : { kind: "km", value };
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
  /** Startpunkt für den Umkreis; ohne ihn wirkt `reachLimit` nicht */
  origin?: Origin;
}

/**
 * Anzahl gewählter Werte über alle Dimensionen (Badge am Filter-Knopf). Der Umkreis zählt nur mit
 * Startpunkt – ohne ihn wirkt er nicht (Plan 0004, E7).
 */
export function activeFilterCount(state: FilterState, { hasOrigin }: { hasOrigin: boolean }): number {
  const lists = state.categories.length + state.formats.length + state.registration.length + state.cost.length;
  return lists + (hasOrigin && state.reachLimit ? 1 : 0);
}

/** Schaltet einen Wert einer Dimension um und lässt alles andere unverändert. */
export function toggleIn<D extends Dimension>(state: FilterState, dim: D, value: FilterState[D][number]): FilterState {
  const list: readonly string[] = state[dim];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...state, [dim]: next };
}

/**
 * Passt ein Angebot zu den Filtern (Kategorie, Format, Anmeldung, Kosten, Umkreis)? Ohne Zeitbezug:
 * Auch ein vorbei-es Angebot kann passen. Gebraucht für „Für heute ist alles vorbei“ (Plan 0007, E2).
 * Der Umkreis wirkt nur mit Startpunkt (Plan 0004, E7).
 */
export function matchesFilter(offer: Offer & { venue: ReachTarget }, state: FilterState, origin?: Origin): boolean {
  if (!matches(state.formats, offer.format)) return false;
  if (!matches(state.registration, offer.registration)) return false;
  if (!matches(state.cost, offer.cost)) return false;
  if (state.categories.length > 0) {
    const cats = categoriesOf(offer.topics);
    if (!cats.some((c) => state.categories.includes(c))) return false;
  }
  const limit = state.reachLimit;
  if (origin && limit && !withinLimit(reachTo(origin, offer.venue), limit)) return false;
  return true;
}

/**
 * Angebote, deren letzter Termin vorbei ist, fallen immer heraus.
 * Das Alter filtert hier bewusst nicht: Die Oberfläche zeigt unpassende Angebote auf Wunsch
 * markiert an (`splitByAge` in age.ts). Der Umkreis wirkt nur mit Startpunkt.
 */
export function applyFilters<T extends Offer & { venue: ReachTarget }>(
  offers: readonly T[],
  state: FilterState,
  ctx: FilterContext,
): T[] {
  return offers.filter((o) => nextSession(o, ctx.now) !== undefined && matchesFilter(o, state, ctx.origin));
}
