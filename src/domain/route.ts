/**
 * Was in der URL steht: Filter, Ansicht, das offene Anbieter-Sheet und das offene Angebot. Links werden geteilt –
 * Geburtsdatum, Merkliste, gemerkte Anbieter und Darstellung (Hell/Dunkel) gehören deshalb nie hierher (docs/architecture.md).
 */
import { type FilterState, filterFromSearch, filterToSearch } from "./filter.ts";
import { KEBAB_ID_PATTERN, MAX_KEBAB_ID, OFFER_ID_PATTERN } from "./ids.ts";

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
  /** offenes Detail; ob es das Angebot gibt, prüft die Oberfläche gegen die Daten */
  offerId?: string;
  /** offenes Anbieter-Sheet über dem Tab (Plan 0010, E3); ob es den Anbieter gibt, prüft das Sheet nach dem Laden */
  providerId?: string;
  filter: FilterState;
}

export function parseRoute(search: string): Route {
  const p = new URLSearchParams(search);
  const tab = TABS.find((t) => t === p.get("ansicht")) ?? "entdecken";
  const offerId = p.get("angebot") ?? "";
  const providerId = p.get("anbieter") ?? "";
  const validProvider = providerId.length <= MAX_KEBAB_ID && KEBAB_ID_PATTERN.test(providerId);
  return {
    tab,
    ...(OFFER_ID_PATTERN.test(offerId) ? { offerId } : {}),
    ...(validProvider ? { providerId } : {}),
    filter: filterFromSearch(search),
  };
}

/** Kanonischer Querystring ohne „?“: Filter, dann Ansicht, dann Anbieter, dann Angebot. */
export function routeToSearch(route: Route): string {
  const parts = [filterToSearch(route.filter)];
  if (route.tab !== "entdecken") parts.push(`ansicht=${route.tab}`);
  if (route.providerId) parts.push(`anbieter=${route.providerId}`);
  if (route.offerId) parts.push(`angebot=${route.offerId}`);
  return parts.filter(Boolean).join("&");
}
