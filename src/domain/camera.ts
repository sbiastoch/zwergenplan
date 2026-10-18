/**
 * Startausschnitt der Karte (Plan 0005, E9; ADR 0008, Kamera-Regel). Die Kachel-Requests verraten,
 * welchen Ausschnitt jemand ansieht. Deshalb hängt der Ausschnitt nur an öffentlichen Daten: an
 * **allen kommenden Orten**, unabhängig von Filtern, Alter und Startpunkt (Umkreis und Alter verrieten
 * Standort bzw. Geburtsdatum), und höchstens an einem Stadtteil. Seit Plan 0039 (E8) hängt er zudem am gewählten
 * Netz: nur dessen Orte, ohne Orte seine Kartenmitte (`Network.home`). Ohne MapLibre-Typen; die UI übersetzt.
 */
import { type GeoPoint, inBounds } from "./geo.ts";
import type { Origin } from "./reach.ts";
import { NETWORKS, type NetworkId } from "./regions.ts";

/** Zoom auf die Kartenmitte des Netzes, wenn es dort keine Orte gibt */
const HOME_ZOOM = 11;
/** Ein Stadtteil ist grob, öffentlich und einer von 35 festen Punkten: Auf ihn darf die Karte fahren. */
export const DISTRICT_ZOOM = 13;

export type StartCamera =
  | { center: GeoPoint; zoom: number }
  | { bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number } };

/**
 * `points`: Koordinaten aller kommenden Orte, ohne Filter, Alter und Umkreis (`useOfferViews().map`); es zählen nur die
 * in der bbox des gewählten Netzes. Vom Startpunkt zählt nur ein Stadtteil.
 */
export function initialCamera(
  allPoints: readonly GeoPoint[],
  origin: Origin | undefined,
  network: NetworkId,
): StartCamera {
  if (origin?.source === "stadtteil") return { center: origin.point, zoom: DISTRICT_ZOOM };
  const { bbox, home } = NETWORKS[network];
  const points = allPoints.filter((p) => inBounds(p, bbox));
  if (points.length === 0) return { center: home, zoom: HOME_ZOOM };
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
