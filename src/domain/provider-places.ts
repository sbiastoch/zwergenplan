/**
 * Orte der Anbieterkarte (Plan 0055, E2). Zwei getrennte Sichten:
 * - **Geometrie** (`providerGeometry`): alle Orte aller Anbieter, ohne Filter, Alter und Suche. Daran hängen
 *   Startausschnitt (`providerCamera`) und „im Kartenausschnitt“ (`providersInBounds`, `providersWithPlace`). So
 *   verraten die Kachel-Requests weder Alter noch Auswahl (ADR 0008, ADR 0038).
 * - **Darstellung** (`providerPlaces`): Marker nach `placeKey` gebündelt, mit Zustand je Anbieter nach `visible`.
 * Nur der Karten-Chunk (`ui/karte/`) importiert dieses Modul (`lazy-domain-apart`).
 */

import { initialCamera, overviewCamera, type StartCamera } from "./camera.ts";
import { applyFilters, EMPTY_FILTER } from "./filter.ts";
import { type GeoPoint, isGeoPoint } from "./geo.ts";
import { type Bounds, inBox } from "./map-view.ts";
import { placeKey } from "./place-key.ts";
import type { Origin } from "./reach.ts";
import type { SiteOffer, SiteProvider } from "./site-data.ts";

export interface ProviderAtPlace {
  id: string;
  name: string;
  /** wie in der Liste: aktiv, ausgeblendet (kommende Angebote, keins passt zur Auswahl) oder ohne Termine */
  state: "aktiv" | "ausgeblendet" | "ohne-termine";
  /** sichtbare Angebote (nach Kategorie und Alter), für „n Angebote“ im Orts-Sheet */
  shown: number;
}

export interface ProviderPlace {
  key: string;
  geo: GeoPoint;
  name: string;
  /** für „Route in Google Maps“ (Plan 0019) */
  address: string;
  district?: string;
  providers: ProviderAtPlace[];
}

/** Zeile eines Anbieters im Orts-Sheet (E4): „n Angebote“ bzw. „Gerade keine Termine“ */
export function placeProviderLine(provider: ProviderAtPlace): string {
  if (provider.state === "ausgeblendet") return "Passt nicht zur Auswahl";
  if (provider.state !== "aktiv") return "Gerade keine Termine";
  return provider.shown === 1 ? "1 Angebot" : `${provider.shown} Angebote`;
}

export interface ProviderGeometry {
  points: { id: string; key: string; geo: GeoPoint }[];
}

interface PlacedVenue {
  name: string;
  address: string;
  district?: string | undefined;
  geo: GeoPoint;
}

interface PlacedProvider {
  id: string;
  name: string;
  venues: PlacedVenue[];
}

/**
 * Kommende Angebote wie in der Anbieterliste (`ProviderScreen`): ohne Filter, ohne laufende Kurse (Plan 0053, E1).
 * Ein Anbieter mit nur einem laufenden Kurs ist so auf Karte und Liste gleich blass (N3).
 */
export function mapUpcoming(offers: readonly SiteOffer[], now: Date): SiteOffer[] {
  return applyFilters(offers, EMPTY_FILTER, { now });
}

/**
 * Katalog-Anbieter mit ihren Orten (ohne gültiges `geo` übersprungen, E1), dazu Rückfall-Anbieter aus den Angeboten,
 * die im Katalog fehlen (Review B1): mit den Orten ihrer Angebote, wie `fallbackEntry` in `directory.ts`.
 */
function placedProviders(providers: readonly SiteProvider[], offers: readonly SiteOffer[]): PlacedProvider[] {
  const result = new Map<string, PlacedProvider>();
  for (const p of providers) {
    if (result.has(p.id)) continue;
    const venues = p.venues.filter((v) => isGeoPoint(v.geo));
    result.set(p.id, { id: p.id, name: p.name, venues });
  }
  const fallback = new Map<string, PlacedProvider>();
  for (const { providerId, providerName, venue } of offers) {
    if (result.has(providerId) || !isGeoPoint(venue.geo)) continue;
    const entry = fallback.get(providerId) ?? { id: providerId, name: providerName, venues: [] };
    entry.venues.push({ name: venue.name, address: venue.address, district: venue.district, geo: venue.geo });
    fallback.set(providerId, entry);
  }
  return [...result.values(), ...fallback.values()];
}

export function providerGeometry(input: {
  providers: readonly SiteProvider[];
  upcoming: readonly SiteOffer[];
}): ProviderGeometry {
  const points: ProviderGeometry["points"] = [];
  for (const { id, venues } of placedProviders(input.providers, input.upcoming)) {
    const seen = new Set<string>();
    for (const { geo } of venues) {
      const key = placeKey(geo);
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ id, key, geo });
    }
  }
  return { points };
}

/** IDs der Anbieter mit mindestens einem Ort im Ausschnitt; Ränder zählen mit */
export function providersInBounds(geometry: ProviderGeometry, bounds: Bounds): Set<string> {
  return new Set(geometry.points.filter(({ geo }) => inBox(geo, bounds)).map((p) => p.id));
}

/** IDs der Anbieter mit mindestens einem bekannten Ort; nur die können „außerhalb des Ausschnitts“ liegen (E2) */
export function providersWithPlace(geometry: ProviderGeometry): Set<string> {
  return new Set(geometry.points.map((p) => p.id));
}

/** Startausschnitt: Rahmen über alle Orte; nie Startpunkt oder Stadtteil (ADR 0038) */
export function providerCamera(geometry: ProviderGeometry, origin?: Origin): StartCamera {
  return initialCamera(
    geometry.points.map((p) => p.geo),
    origin,
  );
}

/** Rahmen über alle Anbieter-Orte: Ziel von „Alle zeigen“ (Plan 0056, N11) */
export function providerOverview(geometry: ProviderGeometry): StartCamera {
  return overviewCamera(geometry.points.map((p) => p.geo));
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "de");

/** Reihenfolge der Zustände an einem Ort, wie in der Liste (Plan 0056, E1) */
const STATE_RANK: Record<ProviderAtPlace["state"], number> = { aktiv: 0, ausgeblendet: 1, "ohne-termine": 2 };

/**
 * Marker der Anbieterkarte. Ein Anbieter ist `aktiv` mit einem Angebot in `visible`, `ohne-termine` ohne Angebot in
 * `upcoming`, sonst `ausgeblendet` (Kategorie oder Alter); die beiden letzten stehen blass, wie in der Liste. Orte
 * nach `key`, Anbieter je Ort erst aktiv, dann ausgeblendet, dann ohne Termine, jeweils nach Name; Name und Stadtteil
 * vom ersten Ort in Namensreihenfolge.
 */
export function providerPlaces(input: {
  providers: readonly SiteProvider[];
  upcoming: readonly SiteOffer[];
  visible: readonly SiteOffer[];
}): ProviderPlace[] {
  const shown = new Map<string, number>();
  for (const { providerId } of input.visible) shown.set(providerId, (shown.get(providerId) ?? 0) + 1);
  const coming = new Set(input.upcoming.map((o) => o.providerId));
  interface Bucket {
    geo: GeoPoint;
    venues: PlacedVenue[];
    providers: Map<string, ProviderAtPlace>;
  }
  const places = new Map<string, Bucket>();
  for (const provider of placedProviders(input.providers, [...input.upcoming, ...input.visible])) {
    const state = shown.has(provider.id) ? "aktiv" : coming.has(provider.id) ? "ausgeblendet" : "ohne-termine";
    for (const venue of provider.venues) {
      const key = placeKey(venue.geo);
      const place: Bucket = places.get(key) ?? { geo: venue.geo, venues: [], providers: new Map() };
      place.venues.push(venue);
      place.providers.set(provider.id, {
        id: provider.id,
        name: provider.name,
        state,
        shown: shown.get(provider.id) ?? 0,
      });
      places.set(key, place);
    }
  }
  return [...places.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, place]): ProviderPlace => {
      const [first] = [...place.venues].sort(byName);
      const providers = [...place.providers.values()].sort(
        (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || byName(a, b),
      );
      return {
        key,
        geo: place.geo,
        name: first?.name ?? "",
        address: first?.address ?? "",
        ...(first?.district === undefined ? {} : { district: first.district }),
        providers,
      };
    });
}
