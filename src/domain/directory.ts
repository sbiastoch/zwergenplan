/**
 * Anbieterübersicht (Plan 0010, E4–E6): Zustand, Zahlen, Stadtteile, nächster Ort, Kategorien und Suche je Anbieter.
 * Abgeleitet, nie gespeichert. Nur der Lazy-Chunk `src/ui/anbieter/` importiert dieses Modul (`directory-only-lazy`),
 * und es greift auf nichts zu, was nur die Karte nutzt (`places.ts`, `camera.ts`; `lazy-domain-apart`).
 */
import { nextSession } from "./agenda.ts";
import { compareReach, type Reach } from "./reach.ts";
import type { SiteOffer, SiteProvider } from "./site-data.ts";
import { type Category, categoriesOf, type Topic } from "./topics.ts";

/** aktiv: ≥ 1 sichtbares Angebot; ausgeblendet: kommende, aber keins passt zur Auswahl; ohne-termine: keine kommenden */
type ProviderState = "aktiv" | "ausgeblendet" | "ohne-termine";

/** Katalog-Eintrag (`SiteProvider`) oder Rückfall aus den Angeboten, dann ohne `url` (E6, M4) */
export interface ProviderEntry {
  id: string;
  name: string;
  url?: string;
  topics: Topic[];
  venues: Array<{ name: string; address: string; district?: string }>;
}

export interface ProviderRow {
  provider: ProviderEntry;
  state: ProviderState;
  /** sichtbare kommende Angebote */
  shown: number;
  /** alle kommenden Angebote */
  upcoming: number;
  /** `district ?? name` ohne Dubletten: aktiv aus den sichtbaren Angeboten, sonst aus dem Katalog */
  places: string[];
  /** kleinste Entfernung über die sichtbaren Angebote; ohne Startpunkt `undefined` */
  nearest?: Reach;
}

const byName = (a: { provider: ProviderEntry }, b: { provider: ProviderEntry }) =>
  a.provider.name.localeCompare(b.provider.name, "de");

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const placeName = (venue: { name: string; district?: string | undefined }) => venue.district ?? venue.name;

/**
 * Rückfall-Eintrag aus den Angeboten eines Anbieters, der in `anbieter.json` fehlt (Datenstand weicht trotz Reload
 * ab, M4): Name und Orte aus den Angeboten, Themen aus den Angeboten, keine Website.
 */
function fallbackEntry(own: readonly SiteOffer[]): ProviderEntry | undefined {
  const first = own[0];
  if (!first) return undefined;
  const venues = new Map<string, ProviderEntry["venues"][number]>();
  for (const { venue } of own) {
    const { name, address, district } = venue;
    venues.set(`${name}\n${address}`, { name, address, ...(district === undefined ? {} : { district }) });
  }
  return {
    id: first.providerId,
    name: first.providerName,
    topics: unique(own.flatMap((o) => o.topics)),
    venues: [...venues.values()],
  };
}

function groupByProvider(offers: readonly SiteOffer[]): Map<string, SiteOffer[]> {
  const groups = new Map<string, SiteOffer[]>();
  for (const offer of offers) {
    const list = groups.get(offer.providerId);
    if (list) list.push(offer);
    else groups.set(offer.providerId, [offer]);
  }
  return groups;
}

function nearestOf(offers: readonly SiteOffer[], reachOf: (offer: SiteOffer) => Reach | undefined): Reach | undefined {
  let best: Reach | undefined;
  for (const offer of offers) {
    const reach = reachOf(offer);
    if (reach && (!best || compareReach(reach, best) < 0)) best = reach;
  }
  return best;
}

/**
 * Zeilen der Anbieterliste (E4, E5).
 * - `active`: mit Startpunkt (`byReach`) nach dem nächsten Ort (`compareReach`), sonst und bei Gleichstand nach Name.
 * - `hiddenCount`: ausgeblendete Anbieter ohne eigene Zeile; mit Suchtext stehen die Treffer blass in `idle`, dann 0.
 * - `idle`: erst die ausgeblendeten Treffer der Suche, dann die ohne Termine, jeweils nach Name.
 * - `saved`: gemerkte Anbieter (Plan 0025, E3), vorab herausgenommen und in keiner anderen Liste; nach Name, mit
 *   ihrem Zustand (ein ausgeblendeter steht blass oben, statt in `hiddenCount` zu verschwinden).
 * Jeder Anbieter aus `visible` bekommt eine aktive Zeile, notfalls als Rückfall: ohne Suchtext gilt
 * `active.length` + aktive in `saved` = Zahl der verschiedenen `providerId` in `visible` (Statuszeile, `countProviders`).
 */
export function providerRows(input: {
  providers: readonly SiteProvider[];
  visible: readonly SiteOffer[];
  upcoming: readonly SiteOffer[];
  reachOf: (offer: SiteOffer) => Reach | undefined;
  /** Startpunkt gesetzt und Modus nicht „laedt“ */
  byReach: boolean;
  query: string;
  /** IDs der gemerkten Anbieter; unbekannte ergeben keine Zeile */
  saved: readonly string[];
}): { saved: ProviderRow[]; active: ProviderRow[]; hiddenCount: number; idle: ProviderRow[] } {
  const { providers, visible, upcoming, reachOf, byReach, query } = input;
  const savedIds = new Set(input.saved);
  const shownBy = groupByProvider(visible);
  const upcomingBy = groupByProvider(upcoming);

  const entries = new Map<string, ProviderEntry>();
  for (const provider of providers) if (!entries.has(provider.id)) entries.set(provider.id, provider);
  for (const [id, own] of [...upcomingBy, ...shownBy]) {
    const fallback = entries.has(id) ? undefined : fallbackEntry(own);
    if (fallback) entries.set(id, fallback);
  }

  const saved: ProviderRow[] = [];
  const active: ProviderRow[] = [];
  const hidden: ProviderRow[] = [];
  const empty: ProviderRow[] = [];
  for (const provider of entries.values()) {
    const shownOffers = shownBy.get(provider.id) ?? [];
    const shown = shownOffers.length;
    const count = Math.max(upcomingBy.get(provider.id)?.length ?? 0, shown);
    const isSaved = savedIds.has(provider.id);
    if (shown > 0) {
      const nearest = nearestOf(shownOffers, reachOf);
      const places = unique(shownOffers.map((o) => placeName(o.venue)));
      const row: ProviderRow = {
        provider,
        state: "aktiv",
        shown,
        upcoming: count,
        places,
        ...(nearest ? { nearest } : {}),
      };
      (isSaved ? saved : active).push(row);
      continue;
    }
    const row: ProviderRow = {
      provider,
      state: count > 0 ? "ausgeblendet" : "ohne-termine",
      shown,
      upcoming: count,
      places: unique(provider.venues.map(placeName)),
    };
    (isSaved ? saved : count > 0 ? hidden : empty).push(row);
  }

  const matches = (row: ProviderRow) => matchesProviderQuery(row.provider.name, query);
  const searching = query.trim() !== "";
  const nearestFirst = (a: ProviderRow, b: ProviderRow) => {
    if (a.nearest && b.nearest) return compareReach(a.nearest, b.nearest);
    return a.nearest ? -1 : b.nearest ? 1 : 0;
  };
  const sortActive = byReach ? (a: ProviderRow, b: ProviderRow) => nearestFirst(a, b) || byName(a, b) : byName;

  return {
    saved: saved.filter(matches).sort(byName),
    active: active.filter(matches).sort(sortActive),
    hiddenCount: searching ? 0 : hidden.length,
    idle: [...(searching ? hidden.filter(matches).sort(byName) : []), ...empty.filter(matches).sort(byName)],
  };
}

/** Alle kommenden Angebote eines Anbieters, unabhängig von Filtern und Alter (Sheet, E4) */
export function providerOffers(offers: readonly SiteOffer[], providerId: string, now: Date): SiteOffer[] {
  return offers.filter((o) => o.providerId === providerId && nextSession(o, now) !== undefined);
}

/** Blendet die Auswahl (Filter, Alter, Wegzeit) Angebote dieses Anbieters aus? Dann sagt das Sheet es dazu (E4). */
export function hasOffersOutside(own: readonly SiteOffer[], visible: readonly SiteOffer[]): boolean {
  const shown = new Set(visible.map((o) => o.id));
  return own.some((o) => !shown.has(o.id));
}

/** Katalog-Eintrag oder Rückfall aus allen Angeboten des Anbieters; `undefined`, wenn es die ID nirgends gibt (E3) */
export function findProvider(
  providers: readonly SiteProvider[],
  offers: readonly SiteOffer[],
  providerId: string,
): ProviderEntry | undefined {
  return providers.find((p) => p.id === providerId) ?? fallbackEntry(offers.filter((o) => o.providerId === providerId));
}

/**
 * Kategorien = Katalog-Themen ∪ Themen der Angebote dieses Anbieters (E6): Bei manchen Anbietern haben die Angebote
 * mehr Kategorien, als der Katalog nennt.
 */
export function providerCategories(provider: ProviderEntry, offers: readonly SiteOffer[]): Category[] {
  const own = offers.filter((o) => o.providerId === provider.id);
  return categoriesOf([...provider.topics, ...own.flatMap((o) => o.topics)]);
}

/**
 * Beide Seiten gleich gefaltet (E5): Kleinbuchstaben, ohne Diakritika, ß → ss, ae/oe/ue → a/o/u. So treffen sich
 * „Nürnberg“, „nurnberg“ und „nuernberg“, und ein echtes „ue“ („Steuer“) findet sich selbst.
 */
function fold(text: string): string {
  return text
    .toLocaleLowerCase("de")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/([aou])e/g, "$1");
}

/** Jeder durch Leerzeichen getrennte Teil des Suchtexts muss im Namen vorkommen; leer trifft alles. */
export function matchesProviderQuery(name: string, query: string): boolean {
  const haystack = fold(name);
  return fold(query)
    .split(/\s+/)
    .every((part) => haystack.includes(part));
}
