/**
 * Entfernung bzw. Wegzeit ab einem Startpunkt (Plan 0004, E1/E2; Plan 0009, E8). Je Startpunkt gilt eine Art:
 * die Wegzeit mit Bus & Bahn (`transitReach` in transit.ts) oder als Rückfall die Luftlinie (`airlineReach`).
 * Die UI rechnet nie selbst mit Metern oder Minuten, sie ruft nur eine `ReachFn`, `compareReach`, `withinLimit`
 * und formatiert über `roundedDistance` bzw. `roundedMinutes`.
 */
import { type GeoPoint, haversineMeters } from "./geo.ts";
import type { TransitReach } from "./transit-types.ts";

/**
 * Herkunft des Startpunkts; „karte“ ist die Kartenmitte (Plan 0005, E8), wie der Standort gerundet und nur
 * auf dem Gerät gespeichert (ADR 0017). Export erst, wenn ihn jemand braucht (knip).
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

/** Wie weit ein Ort vom Startpunkt weg ist: Luftlinie oder Wegzeit (`minutes` ungerundet, `Infinity` = über 2 Std.). */
export type Reach = { kind: "luftlinie"; meters: number } | TransitReach;

/** Ziel einer Entfernung. Die Wegzeit (Plan 0009, ADR 0011) braucht nur die Koordinate. */
export interface ReachTarget {
  geo: GeoPoint;
}

/** Entfernung je Ort ab einem festen Startpunkt */
export type ReachFn = (target: ReachTarget) => Reach;

/** Luftlinie ab `origin` (Rückfall, wenn die Wegzeit fehlt, E11). */
export function airlineReach(origin: Origin): ReachFn {
  return (target) => ({ kind: "luftlinie", meters: haversineMeters(origin.point, target.geo) });
}

const amount = (reach: Reach) => (reach.kind === "oepnv" ? reach.minutes : reach.meters);

/**
 * Kleiner 0: a ist näher. Taugt direkt für `Array.prototype.sort`. Vergleicht statt zu subtrahieren, sonst
 * ergäbe `Infinity − Infinity` ein `NaN` (m11). Gemischt steht die Wegzeit vor der Luftlinie (totale Ordnung).
 */
export function compareReach(a: Reach, b: Reach): number {
  if (a.kind !== b.kind) return a.kind === "oepnv" ? -1 : 1;
  const x = amount(a);
  const y = amount(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Stufen des Filters „Wegzeit“ (Plan 0009, E8) */
export const LIMIT_MINUTES = [20, 30, 45] as const;

/** Grenze für den Filter „Wegzeit“ */
export type ReachLimit = { kind: "minuten"; value: (typeof LIMIT_MINUTES)[number] };

/**
 * Vergleicht die ungerundeten Minuten, die Grenze zählt mit. Für die Luftlinie gilt die Minuten-Grenze nicht:
 * `undefined`, der Filter wirkt dann nicht (E11).
 */
export function withinLimit(reach: Reach, limit: ReachLimit): boolean | undefined {
  return reach.kind === "oepnv" ? reach.minutes <= limit.value : undefined;
}

/**
 * Gerundete Wegzeit, weil es eine Schätzung ist (E8): unter 7,5 Min. 5, bis 60 Min. auf 5 Min., bis 120 Min.
 * auf 10 Min., darüber „über 2 Std.“ (`over`).
 */
export function roundedMinutes(minutes: number): { over: boolean; value: number } {
  if (minutes > 120) return { over: true, value: 120 };
  if (minutes < 7.5) return { over: false, value: 5 };
  const step = minutes <= 60 ? 5 : 10;
  return { over: false, value: Math.round(minutes / step) * step };
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
