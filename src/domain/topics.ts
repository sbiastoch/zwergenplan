/**
 * Geschlossenes Themen-Vokabular (aus dem Recherche-Skill übernommen) und die
 * feste Zuordnung zu den 12 Filter-Kategorien der Oberfläche.
 * Kategorien werden nie gespeichert, sondern immer hieraus abgeleitet.
 */

export const CATEGORIES = [
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
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  babykurse: "Babykurse",
  "krabbel-spielgruppen": "Krabbel- & Spielgruppen",
  "treffs-cafes": "Treffs & Cafés",
  bewegung: "Bewegung & Turnen",
  wasser: "Wasser",
  musik: "Musik & Singen",
  kreativ: "Kreativ & Basteln",
  buecher: "Bücher & Vorlesen",
  museum: "Museum & Ausstellung",
  buehne: "Bühne & Konzert",
  natur: "Natur & Draußen",
  beratung: "Beratung & Gesundheit",
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
  waldgruppe: ["natur"],
  "tiere-natur": ["natur"],
  kreativ: ["kreativ"],
  elterncafe: ["treffs-cafes"],
  stillcafe: ["treffs-cafes"],
  elterntreff: ["treffs-cafes"],
  // Gemeinschaft, Singen, kurzer Ablauf. Keine eigene Kategorie „Glaube“ (entschieden in Plan 0003, E10).
  krabbelgottesdienst: ["treffs-cafes"],
  vaeter: [],
  muetter: [],
  mehrsprachig: [],
  beratung: ["beratung"],
  hebamme: ["beratung"],
  "erste-hilfe": ["beratung"],
  beikost: ["beratung"],
  babyschwimmen: ["wasser"],
  kleinkindschwimmen: ["wasser"],
  bibliothek: ["buecher"],
  vorlesen: ["buecher"],
  museum: ["museum"],
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
