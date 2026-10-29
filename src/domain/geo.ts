/**
 * Geometrie auf der Kugel (Plan 0004, E2): Punkte, Gültigkeitsbereich, Luftlinie, Unschärfe.
 * Rein und ohne Abhängigkeiten – `schema.ts` bezieht die Grenzen von hier.
 */

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Ein Punkt aus nicht geprüften Daten (etwa einem älteren `anbieter.json`): endliche Zahlen `lat` und `lon` (Plan 0055, E1). */
export function isGeoPoint(x: unknown): x is GeoPoint {
  if (typeof x !== "object" || x === null || !("lat" in x) || !("lon" in x)) return false;
  const { lat, lon } = x;
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon);
}

/** Großraum Nürnberg/Fürth/Erlangen – alles außerhalb ist ein Geocoding-Fehler. Region `nuernberg` (regions.ts). */
export const NUERNBERG_BBOX = { minLat: 49.3, maxLat: 49.65, minLon: 10.85, maxLon: 11.3 } as const;

/** Liegt der Punkt in der bbox (Standard: `NUERNBERG_BBOX`, der Großraum, der alle Regionen umfasst; ADR 0029, Punkt 1)? Grenzen inklusiv. */
export function inBounds({ lat, lon }: GeoPoint, bbox: BBox = NUERNBERG_BBOX): boolean {
  const { minLat, maxLat, minLon, maxLon } = bbox;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

/** mittlerer Erdradius (IUGG) */
const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Luftlinie zwischen zwei Punkten in Metern (Haversine). */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** auf 3 Nachkommastellen; `|| 0` macht aus −0 eine 0 */
const round3 = (x: number) => Math.round(x * 1000) / 1000 || 0;

/**
 * Rundet auf 3 Nachkommastellen (≈ 110 m Nord-Süd, ≈ 70 m Ost-West), damit ein Standort nicht
 * zur Wohnadresse wird. Werte genau auf ,xxx5 sind wegen Gleitkomma nicht sicher aufgerundet.
 */
export function coarsen({ lat, lon }: GeoPoint): GeoPoint {
  return { lat: round3(lat), lon: round3(lon) };
}
