/**
 * Gespeicherter Startpunkt → Origin (Plan 0017, E6, E10; ADR 0017), rein. Für den Service Worker (Wegzeit in der
 * Wochen-Nachricht) und den Push-Teil im Kind-Sheet (Hinweis „Wegzeit wirkt ab einem Startpunkt“), damit beide
 * dasselbe als gültig ansehen. Die App selbst nutzt `storedPointOrigin` in `src/ui/origin-state.ts` (Start-Bundle);
 * die Prüfung ist dieselbe: erneut runden, Stadtgrenze. Nicht im Start-Bundle (`push-domain-not-in-start`).
 */
import { districtById } from "./districts.ts";
import { coarsen, inBounds } from "./geo.ts";
import type { Origin } from "./reach.ts";

/** Stadtteil-ID (String) oder gerundeter Punkt `{ source, lat, lon }`; ungültig oder außerhalb → `undefined` */
export function originFromStored(value: unknown): Origin | undefined {
  if (typeof value === "string") {
    const district = districtById(value);
    return district && { source: "stadtteil", point: district.point, label: district.name, districtId: district.id };
  }
  const { source, lat, lon } = Object(value) as { source?: unknown; lat?: unknown; lon?: unknown };
  if ((source !== "standort" && source !== "karte") || typeof lat !== "number" || typeof lon !== "number") {
    return undefined;
  }
  const point = coarsen({ lat, lon });
  return inBounds(point) ? { source, point, label: "" } : undefined;
}
