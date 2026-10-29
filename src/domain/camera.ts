/**
 * Startausschnitt der Karte (Plan 0005, E9; Plan 0056, E6; ADR 0039). Mit Startpunkt (Standort, Stadtteil,
 * gespeicherte Kartenmitte) startet die Karte auf 2 km Radius darum; liegt dort kein Ort, und ohne Startpunkt auf
 * allen kommenden Orten, unabhängig von Filtern und Alter. Seit ADR 0039 sieht OpenFreeMap so die Gegend des
 * Startpunkts (Nutzerentscheid „Usability vor Privatsphäre“). Ohne MapLibre-Typen; die UI übersetzt.
 */
import type { GeoPoint } from "./geo.ts";
import type { Origin } from "./reach.ts";

/** Hauptmarkt, wenn es keine Orte gibt */
const HOME: GeoPoint = { lat: 49.454, lon: 11.077 };
const HOME_ZOOM = 11;
/** Radius um den Startpunkt (Nutzerwunsch 2026-10-29: „etwa 2 Kilometer Radius um den eigenen Standort“) */
export const START_RADIUS_KM = 2;
/** km je Breitengrad (Mittelwert) */
const KM_PER_DEG_LAT = 111.32;
/** Erdumfang am Äquator in Metern; MapLibre rechnet mit 512-px-Kacheln */
const EQUATOR_M = 40_075_016.686;
const TILE_PX = 512;

interface Box {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export type StartCamera =
  | { center: GeoPoint; zoom: number }
  /** Mitte mit Radius: Den Zoom rechnet die Karte aus ihrer Größe (`zoomForRadius`) */
  | { around: GeoPoint; radiusKm: number }
  | { bounds: Box };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Rahmen ±`km` um den Punkt; die Länge mit cos φ */
export function aroundPoint(point: GeoPoint, km: number): Box {
  const dLat = km / KM_PER_DEG_LAT;
  const dLon = km / (KM_PER_DEG_LAT * Math.cos(rad(point.lat)));
  return { minLat: point.lat - dLat, minLon: point.lon - dLon, maxLat: point.lat + dLat, maxLon: point.lon + dLon };
}

/** Zoom, bei dem `edgePx` Pixel genau den Durchmesser 2 · `radiusKm` zeigen */
export function zoomForRadius(lat: number, radiusKm: number, edgePx: number): number {
  return Math.log2((EQUATOR_M * Math.cos(rad(lat)) * edgePx) / (TILE_PX * 2 * radiusKm * 1000));
}

/** Rahmen über alle Orte, ohne Orte der Hauptmarkt; auch das Ziel von „Alle zeigen“ (Review 2, N11) */
export function overviewCamera(points: readonly GeoPoint[]): StartCamera {
  if (points.length === 0) return { center: HOME, zoom: HOME_ZOOM };
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return {
    bounds: {
      minLat: Math.min(...lats),
      minLon: Math.min(...lons),
      maxLat: Math.max(...lats),
      maxLon: Math.max(...lons),
    },
  };
}

/**
 * `points`: Koordinaten aller kommenden Orte, ohne Filter, Alter und Umkreis (`useOfferViews().map`). So hängt der
 * Rückfall „kein Ort im Umkreis“ nicht am Alter (Plan 0056, Review M4).
 */
export function initialCamera(points: readonly GeoPoint[], origin: Origin | undefined): StartCamera {
  if (!origin) return overviewCamera(points);
  const box = aroundPoint(origin.point, START_RADIUS_KM);
  const near = points.some(
    (p) => p.lat >= box.minLat && p.lat <= box.maxLat && p.lon >= box.minLon && p.lon <= box.maxLon,
  );
  return near ? { around: origin.point, radiusKm: START_RADIUS_KM } : overviewCamera(points);
}

/**
 * Gleicher Startpunkt? Gleiche Quelle und gleicher (schon gerundeter) Punkt bzw. gleicher Stadtteil (Review 2, N12).
 * Danach richten sich der gemerkte Ausschnitt und das Fahren bei offener Karte.
 */
export function originKey(origin: Origin | undefined): string | undefined {
  if (!origin) return undefined;
  if (origin.source === "stadtteil" && origin.districtId) return `stadtteil:${origin.districtId}`;
  return `${origin.source}:${origin.point.lat},${origin.point.lon}`;
}
