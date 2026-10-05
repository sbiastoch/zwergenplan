/**
 * Orte und Startausschnitt der Karte (Plan 0005, E6/E9), im Karten-Oberflächen-Chunk gerechnet.
 * `cameraOffers` ist die Datenbasis des Ausschnitts: alle kommenden Angebote, unabhängig von Filtern,
 * Alter und Startpunkt (`useOfferViews().map`; ADR 0008, Arch-Review B1 und m1).
 */
import { initialCamera, type StartCamera } from "../../domain/camera.ts";
import type { GeoPoint } from "../../domain/geo.ts";
import { type Place, placesOf, sortPlaces } from "../../domain/places.ts";
import type { Origin, ReachFn } from "../../domain/reach.ts";

interface MapOffer {
  venue: { name: string; address: string; district?: string | undefined; geo: GeoPoint };
}

export function mapData<T extends MapOffer>(
  visible: readonly T[],
  cameraOffers: readonly T[],
  origin: Origin | undefined,
  reach: ReachFn | undefined,
): { places: Place<T>[]; start: StartCamera } {
  return {
    // nach Wegzeit bzw. Luftlinie; solange die Wegzeit lädt, nach Name (Plan 0009, E11)
    places: sortPlaces(placesOf(visible), reach),
    start: initialCamera(
      placesOf(cameraOffers).map((p) => p.geo),
      origin,
    ),
  };
}
