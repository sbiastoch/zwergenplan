/**
 * Was in der URL steht: Filter, Ansicht und das offene Angebot. Links werden geteilt –
 * Geburtsdatum, Merkliste und Darstellung gehören deshalb nie hierher (docs/architecture.md).
 */
import { type FilterState, filterFromSearch, filterToSearch } from "./filter.ts";
import { OFFER_ID_PATTERN } from "./ids.ts";

/** „karte“ ist die Kartenansicht von „Entdecken“ (Plan 0005, E5), kein eigener Tab in der Leiste. */
const TABS = ["entdecken", "karte", "kalender", "merkliste"] as const;
export type Tab = (typeof TABS)[number];

/** Welcher Eintrag der Tab-Leiste aktiv ist: Liste und Karte gehören beide zu „Entdecken“. */
export function tabSection(tab: Tab): Exclude<Tab, "karte"> {
  return tab === "karte" ? "entdecken" : tab;
}

export interface Route {
  tab: Tab;
  /** offenes Detail; ob es das Angebot gibt, prüft die Oberfläche gegen die Daten */
  offerId?: string;
  filter: FilterState;
}

export function parseRoute(search: string): Route {
  const p = new URLSearchParams(search);
  const tab = TABS.find((t) => t === p.get("ansicht")) ?? "entdecken";
  const offerId = p.get("angebot") ?? "";
  return { tab, ...(OFFER_ID_PATTERN.test(offerId) ? { offerId } : {}), filter: filterFromSearch(search) };
}

/** Kanonischer Querystring ohne „?“: Filter, dann Ansicht, dann Angebot. */
export function routeToSearch(route: Route): string {
  const parts = [filterToSearch(route.filter)];
  if (route.tab !== "entdecken") parts.push(`ansicht=${route.tab}`);
  if (route.offerId) parts.push(`angebot=${route.offerId}`);
  return parts.filter(Boolean).join("&");
}
