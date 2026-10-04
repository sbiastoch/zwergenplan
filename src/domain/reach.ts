/**
 * Entfernung ab einem Startpunkt (Plan 0004, E1/E2). Heute die Luftlinie; mit ADR 0005 kommt die
 * ÖPNV-Wegzeit hinter derselben Schnittstelle dazu. Die UI rechnet nie selbst mit Metern, sie ruft
 * nur `reachTo`, `compareReach`, `withinLimit` und formatiert über `roundedDistance`.
 */
import { type GeoPoint, haversineMeters } from "./geo.ts";

/**
 * Herkunft des Startpunkts; „karte“ ist die Kartenmitte (Plan 0005, E8), wie der Standort nur im
 * Arbeitsspeicher. Export erst, wenn ihn jemand braucht (knip).
 */
type OriginSource = "standort" | "stadtteil" | "karte";

/** Startpunkt. Steht nie in URL, Logs oder Requests (docs/architecture.md). */
export interface Origin {
  source: OriginSource;
  /** beim Standort schon gerundet (`coarsen`) */
  point: GeoPoint;
  label: string;
  districtId?: string;
}

/** Wie weit ein Ort vom Startpunkt weg ist. Heute Luftlinie; mit ADR 0005 kommt { kind: "oepnv"; minutes; … } dazu. */
export type Reach = { kind: "luftlinie"; meters: number };

/** Ziel einer Entfernung. Mit ADR 0005 kommen `nearestStops` dazu. */
export interface ReachTarget {
  geo: GeoPoint;
}

export function reachTo(origin: Origin, target: ReachTarget): Reach {
  return { kind: "luftlinie", meters: haversineMeters(origin.point, target.geo) };
}

/** Kleiner 0: a ist näher. Taugt direkt für `Array.prototype.sort`. */
export function compareReach(a: Reach, b: Reach): number {
  return a.meters - b.meters;
}

/** Umkreis-Stufen im Filter (Nutzerentscheidung 3) */
export const RADII_KM = [2, 5, 10] as const;
type RadiusKm = (typeof RADII_KM)[number];

/** Grenze für den Filter „Entfernung“. Mit ADR 0005 kommt { kind: "minuten"; value } dazu. */
export type ReachLimit = { kind: "km"; value: RadiusKm };

/** Vergleicht die ungerundeten Meter, die Grenze zählt mit. */
export function withinLimit(reach: Reach, limit: ReachLimit): boolean {
  return reach.meters <= limit.value * 1000;
}

/**
 * Gerundete Anzeige: unter 950 m auf 100 m (mindestens 100 m), sonst auf 0,1 km,
 * ab 10 km auf ganze km. Die Luftlinie ist ohnehin nur eine Näherung.
 */
export function roundedDistance(meters: number): { unit: "m" | "km"; value: number } {
  if (meters < 950) return { unit: "m", value: Math.max(100, Math.round(meters / 100) * 100) };
  const km = Math.round(meters / 100) / 10;
  return { unit: "km", value: km >= 10 ? Math.round(meters / 1000) : km };
}
