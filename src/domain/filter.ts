import { nextSession } from "./agenda.ts";
import type { Cost, Format, Offer, Registration } from "./schema.ts";
import { CATEGORIES, type Category, categoriesOf } from "./topics.ts";

export const FORMATS = ["kurs", "regelmaessig", "einmalig"] as const satisfies readonly Format[];
const REGISTRATIONS = ["mit-anmeldung", "ohne-anmeldung"] as const satisfies readonly Registration[];
const COSTS = ["kostenlos", "kostenpflichtig"] as const satisfies readonly Cost[];

/**
 * Filterzustand. Innerhalb einer Dimension ODER, zwischen Dimensionen UND.
 * Eine leere Liste heißt „egal“. Das Geburtsdatum ist bewusst NICHT Teil der URL
 * (Links werden geteilt – das Geburtsdatum des Kindes gehört nicht hinein).
 */
export interface FilterState {
  categories: Category[];
  formats: Format[];
  registration: Registration[];
  cost: Cost[];
}

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

export function filterFromSearch(search: string): FilterState {
  const p = new URLSearchParams(search);
  return {
    categories: parseList(p.get(PARAMS.categories.key), PARAMS.categories.values),
    formats: parseList(p.get(PARAMS.formats.key), PARAMS.formats.values),
    registration: parseList(p.get(PARAMS.registration.key), PARAMS.registration.values),
    cost: parseList(p.get(PARAMS.cost.key), PARAMS.cost.values),
  };
}

/** Kanonischer Querystring ohne führendes „?“; leer, wenn kein Filter aktiv ist. */
export function filterToSearch(state: FilterState): string {
  const p = new URLSearchParams();
  for (const dim of ["categories", "formats", "registration", "cost"] as const) {
    const { key, values } = PARAMS[dim];
    const selected = new Set<string>(state[dim]);
    const list = values.filter((v) => selected.has(v));
    if (list.length > 0) p.set(key, list.join(","));
  }
  return p.toString().replaceAll("%2C", ",");
}

function matches<T>(selected: readonly T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

export interface FilterContext {
  /** „Jetzt“ – injiziert, damit Tests und E2E deterministisch sind. */
  now: Date;
}

/** Anzahl gewählter Werte über alle Dimensionen (Badge am Filter-Knopf). */
export function activeFilterCount(state: FilterState): number {
  return state.categories.length + state.formats.length + state.registration.length + state.cost.length;
}

type Dimension = keyof FilterState;

/** Schaltet einen Wert einer Dimension um und lässt alles andere unverändert. */
export function toggleIn<D extends Dimension>(state: FilterState, dim: D, value: FilterState[D][number]): FilterState {
  const list: readonly string[] = state[dim];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...state, [dim]: next };
}

/**
 * Angebote, deren letzter Termin vorbei ist, fallen immer heraus.
 * Das Alter filtert hier bewusst nicht: Die Oberfläche zeigt unpassende Angebote auf Wunsch
 * markiert an (`splitByAge` in age.ts).
 */
export function applyFilters<T extends Offer>(offers: readonly T[], state: FilterState, ctx: FilterContext): T[] {
  return offers.filter((o) => {
    if (!nextSession(o, ctx.now)) return false;
    if (!matches(state.formats, o.format)) return false;
    if (!matches(state.registration, o.registration)) return false;
    if (!matches(state.cost, o.cost)) return false;
    if (state.categories.length > 0) {
      const cats = categoriesOf(o.topics);
      if (!cats.some((c) => state.categories.includes(c))) return false;
    }
    return true;
  });
}
