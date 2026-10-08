/**
 * Pfade zum Teilen (Plan 0026, E1; ADR 0020): Vorschauseiten `angebot/<id>/` und `anbieter/<id>/` mit eigenen
 * `og:`-Tags, dazu das Kachelbild je Angebot (Nachtrag A, E16). Die Pfade sind ein öffentlicher Vertrag, denn geteilte
 * Links leben in Chats weiter. Einzige Quelle für Build (scripts/lib/share-pages.ts) und App (Knopf „Teilen“).
 */
import { EMPTY_FILTER } from "./filter.ts";
import { KEBAB_ID_PATTERN, MAX_KEBAB_ID, MAX_OFFER_ID, OFFER_ID_PATTERN } from "./ids.ts";
import { routeToSearch } from "./route.ts";

/** Ordnernamen wie die Query-Namen (`?angebot=`, `?anbieter=`) */
export const SHARE_DIRS = { offer: "angebot", provider: "anbieter" } as const;

/** Das Schema garantiert Form und Länge (`MAX_OFFER_ID`, `MAX_KEBAB_ID`); der Wurf ist die zweite Linie gegen `..`. */
function checkedOfferId(offerId: string): string {
  if (offerId.length > MAX_OFFER_ID || !OFFER_ID_PATTERN.test(offerId))
    throw new Error(`Keine Angebots-ID: ${JSON.stringify(offerId)}`);
  return offerId;
}

function checkedProviderId(providerId: string): string {
  if (providerId.length > MAX_KEBAB_ID || !KEBAB_ID_PATTERN.test(providerId)) {
    throw new Error(`Keine Anbieter-ID: ${JSON.stringify(providerId)}`);
  }
  return providerId;
}

/** relativ zur Basis, z. B. „angebot/<id>/“ */
export function offerSharePath(offerId: string): string {
  return `${SHARE_DIRS.offer}/${checkedOfferId(offerId)}/`;
}

/** Kachelbild der Vorschau, neben der Seite (Nachtrag A, E16) */
export function offerImagePath(offerId: string): string {
  return `${offerSharePath(offerId)}vorschau.jpg`;
}

export function providerSharePath(providerId: string): string {
  return `${SHARE_DIRS.provider}/${checkedProviderId(providerId)}/`;
}

/** Ziel in der App, relativ zur Basis: „?angebot=<id>“, kanonisch über routeToSearch */
export function offerAppSearch(offerId: string): string {
  return `?${routeToSearch({ tab: "entdecken", offerId: checkedOfferId(offerId), filter: EMPTY_FILTER })}`;
}

export function providerAppSearch(providerId: string): string {
  return `?${routeToSearch({ tab: "entdecken", providerId: checkedProviderId(providerId), filter: EMPTY_FILTER })}`;
}
