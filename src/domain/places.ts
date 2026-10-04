/**
 * Orte für Karte und Orts-Liste (Plan 0005, E6). Ein Ort ist eine Koordinate: Zwei Anbieter im
 * selben Haus teilen sich einen Marker. Generisch, damit Domäne und UI dieselbe Logik für ihre
 * Angebotstypen nutzen (`SiteOffer` in der UI, schlanke Objekte im Test).
 */
import type { GeoPoint } from "./geo.ts";
import { placeKey } from "./place-key.ts";
import { compareReach, type Origin, reachTo } from "./reach.ts";

/** Der Teil eines Angebots, den die Orte brauchen (passt auf `SiteOffer`). */
interface PlaceVenue {
  name: string;
  address: string;
  /** `| undefined`: so kommt es aus zod (`SiteOffer`) */
  district?: string | undefined;
  geo: GeoPoint;
}

export interface Place<T> {
  key: string;
  geo: GeoPoint;
  /** Namen der Orte an dieser Koordinate, ohne Dubletten, in Reihenfolge des Auftretens */
  names: [string, ...string[]];
  /** vom ersten Angebot an dieser Koordinate */
  district?: string;
  /** vom ersten Angebot an dieser Koordinate */
  address: string;
  offers: T[];
}

/** Bündelt Angebote nach Koordinate. Orte und Angebote in Reihenfolge des Auftretens. */
export function placesOf<T extends { venue: PlaceVenue }>(offers: readonly T[]): Place<T>[] {
  const byKey = new Map<string, Place<T>>();
  for (const offer of offers) {
    const { name, address, district, geo } = offer.venue;
    const key = placeKey(geo);
    const place = byKey.get(key);
    if (place) {
      if (!place.names.includes(name)) place.names.push(name);
      place.offers.push(offer);
    } else {
      byKey.set(key, {
        key,
        geo,
        names: [name],
        ...(district === undefined ? {} : { district }),
        address,
        offers: [offer],
      });
    }
  }
  return [...byKey.values()];
}

const byName = <T>(a: Place<T>, b: Place<T>) => a.names[0].localeCompare(b.names[0], "de");

/** Mit Startpunkt nach Entfernung, sonst bzw. bei Gleichstand nach Name. Liefert eine neue Liste. */
export function sortPlaces<T>(places: readonly Place<T>[], origin?: Origin): Place<T>[] {
  if (!origin) return [...places].sort(byName);
  return places
    .map((place) => ({ place, reach: reachTo(origin, place) }))
    .sort((a, b) => compareReach(a.reach, b.reach) || byName(a.place, b.place))
    .map(({ place }) => place);
}
