/**
 * Schlüssel eines Orts (Plan 0005, E6): die Koordinate. Eigenes kleines Modul, damit Statuszeile und
 * Entfernungs-Cache im Startbundle zählen können, ohne `places.ts` (Karten-Oberflächen-Chunk) zu laden.
 * Einzige Quelle für „gleicher Ort“; `placesOf` bündelt nach demselben Schlüssel.
 */
import type { GeoPoint } from "./geo.ts";

/** Bleibt im Speicher, nie in der URL (E5). */
export function placeKey({ lat, lon }: GeoPoint): string {
  return `${lat},${lon}`;
}

/** Zahl der Orte, wie `placesOf(offers).length`, ohne die Orte zu bauen. */
export function countPlaces(offers: readonly { venue: { geo: GeoPoint } }[]): number {
  return new Set(offers.map((o) => placeKey(o.venue.geo))).size;
}
