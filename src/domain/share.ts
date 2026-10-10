/**
 * Pfade zum Teilen (Plan 0026, E1; ADR 0020, Pfadvertrag ersetzt durch ADR 0022): Vorschauseiten `a/<id>/` und
 * `p/<publicId>/` mit eigenen `og:`-Tags, dazu das Kachelbild je Angebot. Die Pfade sind ein öffentlicher Vertrag, denn
 * geteilte Links leben in Chats weiter; die alten Ordner `angebot/` und `anbieter/` leiten über `404.html` weiter.
 * Einzige Quelle für Build (scripts/lib/share-pages.ts) und App (Knopf „Teilen“).
 */
import { EMPTY_FILTER } from "./filter.ts";
import { SHORT_ID_PATTERN } from "./ids.ts";
import { routeToSearch } from "./route.ts";

/** Ordner der Vorschauseiten; sie heißen anders als die Query-Namen (`?angebot=`, `?anbieter=`, ADR 0022). */
export const SHARE_DIRS = { offer: "a", provider: "p" } as const;
/** Ordner bis ADR 0022 – nur noch Weiterleitungsregeln in `404.html` */
export const LEGACY_SHARE_DIRS = { offer: "angebot", provider: "anbieter" } as const;

/** Das Schema garantiert die Form (`SHORT_ID_PATTERN`); der Wurf ist die zweite Linie gegen `..` und lange IDs. */
function checkedOfferId(offerId: string): string {
  if (!SHORT_ID_PATTERN.test(offerId)) throw new Error(`Keine Angebots-ID: ${JSON.stringify(offerId)}`);
  return offerId;
}

function checkedProviderId(providerId: string): string {
  if (!SHORT_ID_PATTERN.test(providerId)) throw new Error(`Keine Anbieter-ID: ${JSON.stringify(providerId)}`);
  return providerId;
}

/** relativ zur Basis, z. B. „a/<id>/“ */
export function offerSharePath(offerId: string): string {
  return `${SHARE_DIRS.offer}/${checkedOfferId(offerId)}/`;
}

/** Kachelbild der Vorschau, neben der Seite (Plan 0026, Nachtrag A, E16) */
export function offerImagePath(offerId: string): string {
  return `${offerSharePath(offerId)}vorschau.jpg`;
}

/** relativ zur Basis, „p/<publicId>/“ */
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
