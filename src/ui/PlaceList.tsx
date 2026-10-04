/**
 * Orts-Liste unter der Karte (Plan 0005, E7): die zugängliche Entsprechung der Marker, auch ohne
 * Karte (offline, ohne WebGL, ohne Karten-Chunk). Sortiert kommt sie aus `sortPlaces`.
 */
import type { Place } from "../domain/places.ts";
import type { Reach } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { placeLine } from "./format.ts";

export function PlaceList({
  places,
  reachOf,
  onPlace,
}: {
  places: readonly Place<SiteOffer>[];
  reachOf: (offer: SiteOffer) => Reach | undefined;
  onPlace: (place: Place<SiteOffer>) => void;
}) {
  return (
    <section className="places" aria-labelledby="orte">
      <h2 id="orte">Orte</h2>
      <ul>
        {places.map((place) => (
          <li key={place.key}>
            <button type="button" className="place" onClick={() => onPlace(place)}>
              <b>{place.names.join(" / ")}</b>
              <span>{placeLine(place, place.offers[0] && reachOf(place.offers[0]))}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
