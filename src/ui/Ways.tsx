/**
 * Route in Google Maps (Plan 0019, E5): Link-Attribute und Hinweiszeile für Detail, Anbieter- und Orts-Sheet. Das Ziel
 * ist nur die Adresse (`mapsDirectionsUrl`), nie der Startpunkt; kein Referrer (E3).
 */
import { mapsDirectionsUrl } from "../domain/maps-link.ts";
import { Icon } from "./icons.tsx";

/** Attribute eines Routen-Links: neuer Tab bzw. die Maps-App, ohne Referrer (E3) */
export function routeLink(address: string): { href: string; target: string; rel: string } {
  return { href: mapsDirectionsUrl(address), target: "_blank", rel: "noopener noreferrer" };
}

/** Letzte Zeile jeder Routen-Kachel: zeigt, dass sie ein Link ist und wohin er führt */
export function RouteHint() {
  return (
    <span className="route-hint">
      <Icon name="route" size={18} />
      Route in Google Maps
    </span>
  );
}
