/**
 * Kartenausschnitt für die Liste unter einer Karte (Plan 0055, E2; Plan 0056, E5). Kleines Start-Modul: Liste und
 * Statuszeile filtern danach, ohne den Karten-Chunk zu laden. Die Anbieterkarte meldet Anbieter-IDs, die Angebotskarte
 * `placeKey`s.
 */
import type { GeoPoint } from "./geo.ts";

/** Kartenausschnitt in Grad, wie MapLibre `getBounds()` ihn liefert */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * `inView` hat mindestens einen Ort im Ausschnitt, `known` hat überhaupt einen bekannten Ort. `undefined` heißt
 * „Karte nicht bereit oder gescheitert“: Dann liegt nichts außerhalb.
 */
export interface MapExtent {
  inView: ReadonlySet<string>;
  known: ReadonlySet<string>;
}

/** Ein Schlüssel ohne bekannten Ort gilt nie als außerhalb (Plan 0055, Review B1). */
export function isOutside(view: MapExtent | undefined, key: string): boolean {
  return view !== undefined && view.known.has(key) && !view.inView.has(key);
}

/** Blendet der Ausschnitt mindestens einen Schlüssel aus? Dann sagt die Statuszeile „im Kartenausschnitt“. */
export function viewNarrows(view: MapExtent | undefined): boolean {
  return view !== undefined && [...view.known].some((key) => !view.inView.has(key));
}

/** Liegt der Punkt im Ausschnitt? Ränder zählen mit. */
export function inBox(geo: GeoPoint, { west, south, east, north }: Bounds): boolean {
  return geo.lat >= south && geo.lat <= north && geo.lon >= west && geo.lon <= east;
}
