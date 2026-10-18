/**
 * Gespeicherter Startpunkt → Origin (Plan 0017, E6, E10; ADR 0017), rein. Für den Service Worker (Wegzeit in der
 * Wochen-Nachricht) und den Push-Teil im Kind-Sheet (Hinweis „Wegzeit wirkt ab einem Startpunkt“), damit beide
 * dasselbe als gültig ansehen. Die App selbst nutzt `storedPointOrigin` in `src/ui/origin-state.ts` (Start-Bundle);
 * die Prüfung ist dieselbe: erneut runden, Stadtgrenze. Nicht im Start-Bundle (`push-domain-not-in-start`).
 */
import { districtById } from "./districts.ts";
import { coarsen, inBounds } from "./geo.ts";
import type { Origin } from "./reach.ts";
import { NETWORKS, type NetworkId, networkOf, REGION_IDS } from "./regions.ts";

/**
 * Netz der gespiegelten Stadt (Plan 0039, E9): roher Wert aus dem Geräte-Speicher, gültig gegen `REGION_IDS`; ohne oder
 * unbekannt `vgn`, wie Nürnberg ohne gespeicherte Stadt in der App.
 */
export function networkFromStored(value: unknown): NetworkId {
  const city = REGION_IDS.find((id) => id === value);
  return city ? networkOf(city) : "vgn";
}

/**
 * Stadtteil-ID (String) oder gerundeter Punkt `{ source, lat, lon }`; ungültig oder außerhalb des Netzes der gewählten
 * Stadt → `undefined` (Plan 0039, E3/E9). Ein Stadtteil liegt in der bbox seines Netzes, also gilt für beide der Punkt.
 */
export function originFromStored(value: unknown, network: NetworkId): Origin | undefined {
  const { bbox } = NETWORKS[network];
  if (typeof value === "string") {
    const district = districtById(value);
    return district && inBounds(district.point, bbox)
      ? { source: "stadtteil", point: district.point, label: district.name, districtId: district.id }
      : undefined;
  }
  const { source, lat, lon } = Object(value) as { source?: unknown; lat?: unknown; lon?: unknown };
  if ((source !== "standort" && source !== "karte") || typeof lat !== "number" || typeof lon !== "number") {
    return undefined;
  }
  const point = coarsen({ lat, lon });
  return inBounds(point, bbox) ? { source, point, label: "" } : undefined;
}
