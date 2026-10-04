/** Reine Umwandlungen für die Karte (Plan 0005, E6): Orte und Startpunkt als GeoJSON, Treffer beim Tippen. */
import type { GeoPoint } from "../../domain/geo.ts";
import type { Origin } from "../../domain/reach.ts";

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
  offers: readonly unknown[];
}

const point = <P>({ lat, lon }: GeoPoint, properties: P): PointFeature<P> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});

/** Quelle „orte“: ein Punkt je Ort mit `key` und der Zahl der Angebote (summiert im Cluster). */
export function placesToFeatures(places: readonly MapPlace[]): PointCollection<{ key: string; angebote: number }> {
  return {
    type: "FeatureCollection",
    features: places.map((p) => point(p.geo, { key: p.key, angebote: p.offers.length })),
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
