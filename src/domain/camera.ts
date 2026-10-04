/**
 * Startausschnitt der Karte (Plan 0005, E9; ADR 0008, Kamera-Regel). Die Kachel-Requests verraten,
 * welchen Ausschnitt jemand ansieht. Deshalb hängt der Ausschnitt nur an öffentlichen Daten: an den
 * Orten **ohne Umkreis-Filter** (der Umkreis hängt am Startpunkt) und höchstens an einem Stadtteil.
 * Standort und Kartenmitte gehen nie ein. Ohne MapLibre-Typen; die UI übersetzt.
 */
import type { GeoPoint } from "./geo.ts";
import type { Origin } from "./reach.ts";

/** Hauptmarkt, wenn es keine Orte gibt */
const HOME: GeoPoint = { lat: 49.454, lon: 11.077 };
const HOME_ZOOM = 11;
/** Ein Stadtteil ist grob, öffentlich und einer von 35 festen Punkten: Auf ihn darf die Karte fahren. */
export const DISTRICT_ZOOM = 13;

export type StartCamera =
  | { center: GeoPoint; zoom: number }
  | { bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number } };

/**
 * `points`: Koordinaten der Orte, gefiltert wie die Karte, aber **ohne Umkreis** (der Aufrufer filtert
 * ohne Startpunkt). Vom Startpunkt zählt nur ein Stadtteil.
 */
export function initialCamera(points: readonly GeoPoint[], origin: Origin | undefined): StartCamera {
  if (origin?.source === "stadtteil") return { center: origin.point, zoom: DISTRICT_ZOOM };
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
