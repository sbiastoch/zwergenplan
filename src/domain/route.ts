/**
 * Was in der URL steht: Filter, Ansicht und das offene Angebot. Links werden geteilt –
 * Geburtsdatum, Merkliste und Darstellung gehören deshalb nie hierher (docs/architecture.md).
 */
import { type FilterState, filterFromSearch, filterToSearch } from "./filter.ts";
import { OFFER_ID_PATTERN } from "./ids.ts";

const TABS = ["entdecken", "kalender", "merkliste"] as const;
export type Tab = (typeof TABS)[number];

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
