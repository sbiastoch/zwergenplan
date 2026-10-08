/** Reine Umwandlungen für die Karte (Plan 0005, E6): Orte und Startpunkt als GeoJSON, Treffer beim Tippen. */
import type { GeoPoint } from "../../domain/geo.ts";
import type { Origin } from "../../domain/reach.ts";
import { CATEGORIES, type Category, categoriesOf, type Topic } from "../../domain/topics.ts";

interface PointFeature<P> {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [lon: number, lat: number] };
  properties: P;
}

export interface PointCollection<P> {
  type: "FeatureCollection";
  features: PointFeature<P>[];
}

/** Was die Karte über einen Ort wissen muss (passt auf `Place`). */
interface MapPlace {
  key: string;
  geo: GeoPoint;
  offers: readonly MapOffer[];
}

/** Was die Karte über ein Angebot wissen muss (passt auf `SiteOffer`). */
interface MapOffer {
  topics: readonly Topic[];
}

/** Properties eines Ort-Punkts in der Quelle „orte“ */
export interface PlaceProperties {
  key: string;
  angebote: number;
  kategorie: Category;
}

/**
 * Kategorie des Markers (Plan 0024, E5): die häufigste unter den Angeboten des Ortes, je Angebot jede seiner
 * Kategorien einmal. Gleichstand: die frühere in `CATEGORIES`, also unabhängig von der Reihenfolge der Angebote.
 * Liegt bewusst hier und nicht in `src/domain/topics.ts`: topics.ts gehört zum Start-Chunk, und nur die Karte
 * braucht die Regel (Plan 0024, E5). Braucht sie später die Merkliste-Karte, kommt sie über denselben Chunk.
 */
export function mainCategory(offers: readonly MapOffer[]): Category {
  const counts = new Map<Category, number>();
  for (const offer of offers) {
    for (const category of categoriesOf(offer.topics)) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  let best: Category | undefined;
  for (const category of CATEGORIES) {
    if ((counts.get(category) ?? 0) > (best ? (counts.get(best) ?? 0) : 0)) best = category;
  }
  // Rückfall nur für den Typ (wie `leadCategory`): Das Schema verbietet Angebote ohne Kategorie.
  return best ?? "treffs-cafes";
}

const point = <P>({ lat, lon }: GeoPoint, properties: P): PointFeature<P> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});

/** Codepunkt-Vergleich: unabhängig von Locale und Engine */
const byKey = (a: MapPlace, b: MapPlace) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * Quelle „orte“: ein Punkt je Ort mit `key`, der Zahl der Angebote (summiert im Cluster) und der Kategorie des
 * Markers (`mainCategory`). Sortiert nach
 * `key`, nicht in der Reihenfolge der Orts-Liste: Supercluster bündelt reihenfolgeabhängig, sonst änderten
 * sich die Cluster mit dem Startpunkt (Plan 0008, E15).
 */
export function placesToFeatures(places: readonly MapPlace[]): PointCollection<PlaceProperties> {
  return {
    type: "FeatureCollection",
    features: places
      .toSorted(byKey)
      .map((p) => point(p.geo, { key: p.key, angebote: p.offers.length, kategorie: mainCategory(p.offers) })),
  };
}

/** Quelle „startpunkt“: nur gezeichnet, nie angefahren (E9). */
export function originToFeatures(origin: Origin | undefined): PointCollection<Record<string, never>> {
  return { type: "FeatureCollection", features: origin ? [point(origin.point, {})] : [] };
}

/** Beim Tippen gewinnt der Treffer, dessen Mittelpunkt (Pixel) am nächsten liegt (E6). */
export function nearestHit<T>(hits: readonly { x: number; y: number; value: T }[], at: { x: number; y: number }) {
  let best: { distance: number; value: T } | undefined;
  for (const { x, y, value } of hits) {
    const distance = Math.hypot(x - at.x, y - at.y);
    if (!best || distance < best.distance) best = { distance, value };
  }
  return best?.value;
}
