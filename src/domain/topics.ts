/**
 * Geschlossenes Themen-Vokabular (aus dem Recherche-Skill übernommen) und die
 * feste Zuordnung zu den 7 Filter-Kategorien der Oberfläche (Plan 0037, Nachtrag A; ADR 0043).
 * Kategorien eines Angebots stehen seit ADR 0030 in `category`; `TOPIC_CATEGORIES` dient Themenregel, Warnung und
 * Rückfall.
 */

/**
 * Die sieben Kategorien der Oberfläche. Die IDs stammen aus dem alten Bestand der zwölf (ADR 0043): `buehne` heißt
 * „Kultur & Kreativ“, `bewegung` „Bewegung & Draußen“, `babykurse` „Baby- & Elternkurse“. So bricht alter Code mit
 * neuen Daten nicht, und alte Links bleiben gültig.
 */
export const CATEGORIES = [
  "babykurse",
  "krabbel-spielgruppen",
  "treffs-cafes",
  "bewegung",
  "wasser",
  "musik",
  "buehne",
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Die zwölf Werte, aus denen das Modell in der Extraktion wählt, in der alten Reihenfolge. Teil des Cache-Schlüssels
 * der Extraktion (Antwortschema): nur zusammen mit einer Neu-Extraktion ändern (Plan 0037, Nachtrag A, NA3).
 */
export const EXTRACT_CATEGORIES = [
  "babykurse",
  "krabbel-spielgruppen",
  "treffs-cafes",
  "bewegung",
  "wasser",
  "musik",
  "kreativ",
  "buecher",
  "museum",
  "buehne",
  "natur",
  "beratung",
] as const;
export type ExtractCategory = (typeof EXTRACT_CATEGORIES)[number];

/** Faltung der zwölf auf die sieben; vollständig, damit `tsc` jeden Wert verlangt. */
const FOLD: Record<ExtractCategory, Category> = {
  babykurse: "babykurse",
  "krabbel-spielgruppen": "krabbel-spielgruppen",
  "treffs-cafes": "treffs-cafes",
  bewegung: "bewegung",
  wasser: "wasser",
  musik: "musik",
  kreativ: "buehne",
  buecher: "buehne",
  museum: "buehne",
  buehne: "buehne",
  natur: "bewegung",
  beratung: "babykurse",
};

/** Alter oder neuer Kategoriewert → eine der sieben (Datenvertrag, Cache im Browser, `kat=` in Links). */
export function foldCategory(c: ExtractCategory): Category {
  return FOLD[c];
}

export const CATEGORY_LABELS: Record<Category, string> = {
  babykurse: "Baby- & Elternkurse",
  "krabbel-spielgruppen": "Krabbel- & Spielgruppen",
  "treffs-cafes": "Treffs & Cafés",
  bewegung: "Bewegung & Draußen",
  wasser: "Wasser",
  musik: "Musik & Singen",
  buehne: "Kultur & Kreativ",
};

/** Themen → Kategorien. Ein leeres Array markiert ein reines Merkmal (z. B. „mehrsprachig“). */
export const TOPIC_CATEGORIES = {
  pekip: ["babykurse"],
  fenkid: ["babykurse"],
  babymassage: ["babykurse"],
  babysignal: ["babykurse"],
  musik: ["musik"],
  singen: ["musik"],
  krabbelgruppe: ["krabbel-spielgruppen"],
  spielgruppe: ["krabbel-spielgruppen"],
  "eltern-kind-gruppe": ["krabbel-spielgruppen"],
  "eltern-kind-turnen": ["bewegung"],
  bewegung: ["bewegung"],
  "fitness-mit-baby": ["bewegung"],
  "yoga-mit-baby": ["bewegung"],
  rueckbildung: ["bewegung"],
  "spielplatz-indoor": ["bewegung"],
  tanz: ["bewegung", "musik"],
  waldgruppe: ["bewegung"],
  "tiere-natur": ["bewegung"],
  kreativ: ["buehne"],
  elterncafe: ["treffs-cafes"],
  stillcafe: ["treffs-cafes"],
  elterntreff: ["treffs-cafes"],
  // Gemeinschaft, Singen, kurzer Ablauf. Keine eigene Kategorie „Glaube“ (entschieden in Plan 0003, E10).
  krabbelgottesdienst: ["treffs-cafes"],
  vaeter: [],
  muetter: [],
  mehrsprachig: [],
  beratung: ["babykurse"],
  hebamme: ["babykurse"],
  "erste-hilfe": ["babykurse"],
  beikost: ["babykurse"],
  babyschwimmen: ["wasser"],
  kleinkindschwimmen: ["wasser"],
  bibliothek: ["buehne"],
  vorlesen: ["buehne"],
  museum: ["buehne"],
  kino: ["buehne"],
  konzert: ["buehne"],
  theater: ["buehne"],
} as const satisfies Record<string, readonly Category[]>;

export type Topic = keyof typeof TOPIC_CATEGORIES;
export const TOPICS = Object.keys(TOPIC_CATEGORIES) as [Topic, ...Topic[]];

export function categoriesOf(topics: readonly Topic[]): Category[] {
  const found = new Set<Category>(topics.flatMap((t) => TOPIC_CATEGORIES[t]));
  return CATEGORIES.filter((c) => found.has(c));
}

/**
 * Rückfall für Stände ohne `category`: die erste Kategorie der Themen in fester Reihenfolge, also das bisherige
 * Etikett ohne Filter (Plan 0037, E5). Entfällt in Stufe C.
 */
export function fallbackCategory(topics: readonly Topic[]): Category {
  return categoriesOf(topics)[0] ?? "treffs-cafes";
}

/**
 * Angebot mit `category`, auch wenn es aus einem älteren Stand kommt: Eine vorhandene `category` wird auf die sieben
 * gefaltet (Plan 0037, Nachtrag A, NA6), eine fehlende kommt aus `fallbackCategory(topics)`. Für `adoptSite` in
 * `App.tsx` (Plan 0037, E13). Der Rückgabetyp ist für ein konkretes `T` (etwa `SiteOffer`) ohne Cast an `T` zuweisbar.
 */
// Übergang Plan 0037 (E13): Der Themen-Rückfall entfällt in Stufe C, das Falten alter Werte bleibt (Nachtrag A)
export function withCategory<T extends { category: Category; topics: readonly Topic[] }>(
  offer: Omit<T, "category"> & { category?: ExtractCategory },
): Omit<T, "category"> & { category: Category } {
  return {
    ...offer,
    category: offer.category === undefined ? fallbackCategory(offer.topics) : foldCategory(offer.category),
  };
}
