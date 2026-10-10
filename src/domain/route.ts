/**
 * Was in der URL steht: Filter, Ansicht, das offene Anbieter-Sheet und das offene Angebot. Links werden geteilt –
 * Geburtsdatum, Merkliste, gemerkte Anbieter und Darstellung (Hell/Dunkel) gehören deshalb nie hierher (docs/architecture.md).
 */
import { type FilterState, filterFromSearch, filterToSearch } from "./filter.ts";
import {
  KEBAB_ID_PATTERN,
  LEGACY_OFFER_ID_PATTERN,
  MAX_KEBAB_ID,
  MAX_LEGACY_OFFER_ID,
  resolveOfferId,
  resolveProviderId,
  SHORT_ID_PATTERN,
} from "./ids.ts";

/** Query-Namen für Angebot und Anbieter. Seit ADR 0022 heißen die Ordner der Vorschauseiten anders (`a/`, `p/`). */
export const OFFER_PARAM = "angebot";
export const PROVIDER_PARAM = "anbieter";

/**
 * „karte“ ist die Kartenansicht von „Entdecken“ (Plan 0005, E5; Tab „Angebote“ seit Plan 0025, E8), kein eigener Tab
 * in der Leiste. „anbieter“ steht vor der Merkliste (Plan 0010, E2). „merkliste-karte“ und „merkliste-kalender“ sind
 * Karte und Kalender der Merkliste (Plan 0025, E4); die Wahl Liste | Karte | Kalender verrät nichts über das Gemerkte
 * und darf deshalb in die URL. Den Tab „Kalender“ gibt es nicht mehr (Plan 0025, E8): `ansicht=kalender` ist unbekannt
 * und ergibt „entdecken“.
 */
const TABS = ["entdecken", "karte", "anbieter", "merkliste", "merkliste-karte", "merkliste-kalender"] as const;
export type Tab = (typeof TABS)[number];
/** Eintrag der Tab-Leiste */
export type Section = Exclude<Tab, "karte" | "merkliste-karte" | "merkliste-kalender">;

/** Welcher Eintrag der Tab-Leiste aktiv ist: Die Darstellungen gehören zu „Entdecken“ bzw. zur Merkliste. */
export function tabSection(tab: Tab): Section {
  if (tab === "karte") return "entdecken";
  if (tab === "merkliste-karte" || tab === "merkliste-kalender") return "merkliste";
  return tab;
}

/**
 * Alter Link auf den entfallenen Tab „Kalender“ (Plan 0025, E8)? Dann ersetzt `useRoute` die URL beim Start einmal
 * durch die kanonische, sonst bliebe `ansicht=kalender` stehen.
 */
export function isLegacyView(search: string): boolean {
  return new URLSearchParams(search).get("ansicht") === "kalender";
}

export interface Route {
  tab: Tab;
  /**
   * offenes Detail; ob es das Angebot gibt, prüft die Oberfläche gegen die Daten. Kurz-ID oder alte lange ID aus einem
   * alten Link – `useRoute` rechnet sie per `resolveOfferId` um (ADR 0022).
   */
  offerId?: string;
  /**
   * offenes Anbieter-Sheet über dem Tab (Plan 0010, E3); ob es den Anbieter gibt, prüft das Sheet nach dem Laden.
   * `publicId` oder Katalog-ID aus einem alten Link – `useRoute` rechnet sie per `resolveProviderId` um (ADR 0022).
   */
  providerId?: string;
  filter: FilterState;
}

export function parseRoute(search: string): Route {
  const p = new URLSearchParams(search);
  const tab = TABS.find((t) => t === p.get("ansicht")) ?? "entdecken";
  const offerId = p.get(OFFER_PARAM) ?? "";
  const providerId = p.get(PROVIDER_PARAM) ?? "";
  // SHORT_ID_PATTERN ist eine Teilmenge von KEBAB_ID_PATTERN: Anbieter brauchen keinen eigenen Zweig
  const validProvider = providerId.length <= MAX_KEBAB_ID && KEBAB_ID_PATTERN.test(providerId);
  const validOffer =
    SHORT_ID_PATTERN.test(offerId) || (offerId.length <= MAX_LEGACY_OFFER_ID && LEGACY_OFFER_ID_PATTERN.test(offerId));
  return {
    tab,
    ...(validOffer ? { offerId } : {}),
    ...(validProvider ? { providerId } : {}),
    filter: filterFromSearch(search),
  };
}

/**
 * Alte IDs aus alten Links auf Kurz-IDs umrechnen (ADR 0022): lange Angebots-ID → `shortId(alt, 0)`, Katalog-ID →
 * `publicId`. `parseRoute` lässt nur gültige Formen durch, die Umrechnung findet also immer ein Ergebnis.
 */
export function resolveRouteIds(route: Route): Route {
  const offerId = route.offerId === undefined ? undefined : resolveOfferId(route.offerId);
  const providerId = route.providerId === undefined ? undefined : resolveProviderId(route.providerId);
  const { offerId: _o, providerId: _p, ...rest } = route;
  return {
    ...rest,
    ...(providerId === undefined ? {} : { providerId }),
    ...(offerId === undefined ? {} : { offerId }),
  };
}

/** Kanonischer Querystring ohne „?“: Filter, dann Ansicht, dann Anbieter, dann Angebot. */
export function routeToSearch(route: Route): string {
  const parts = [filterToSearch(route.filter)];
  if (route.tab !== "entdecken") parts.push(`ansicht=${route.tab}`);
  if (route.providerId) parts.push(`${PROVIDER_PARAM}=${route.providerId}`);
  if (route.offerId) parts.push(`${OFFER_PARAM}=${route.offerId}`);
  return parts.filter(Boolean).join("&");
}
