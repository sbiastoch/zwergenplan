/**
 * Abgeleitete Ansichten der Angebote (Plan 0003, Arch-Review 7): Filter, Alters-Sichtbarkeit,
 * Liste in Schritten, Kalender, Merkliste, offenes Detail – plus der Ansichts-Zustand dazu.
 * „Jetzt“ kommt von außen (entsteht nur in App.tsx).
 */
import { useCallback, useMemo, useState } from "react";
import { ageVisibility } from "../domain/age.ts";
import {
  type DayGroup,
  groupByNextSession,
  lastSessionDay,
  type Occurrence,
  sessionsByDay,
  takeGroups,
} from "../domain/agenda.ts";
import { applyFilters, EMPTY_FILTER } from "../domain/filter.ts";
import type { Route } from "../domain/route.ts";
import { savedOffers } from "../domain/saved.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";

/** Angebote je Schritt in der Liste (Plan 0003, E8) */
const PAGE = 40;
const NO_INDEX: Map<string, Occurrence<SiteOffer>[]> = new Map();

export interface OfferViewsInput {
  offers: readonly SiteOffer[];
  route: Route;
  birthDate: string | undefined;
  ageOnly: boolean;
  savedIds: readonly string[];
  now: Date;
}

export interface OfferViews {
  visible: readonly SiteOffer[];
  hiddenCount: number;
  unfitIds: ReadonlySet<string>;
  showUnfit: boolean;
  setShowUnfit: (show: boolean) => void;
  /** aktueller Ausschnitt der Liste „Entdecken“ */
  page: { groups: DayGroup<Occurrence<SiteOffer>>[]; remaining: number };
  showMore: () => void;
  /** nach Filterwechsel wieder mit dem ersten Schritt beginnen */
  resetPage: () => void;
  calendar: {
    /** nur in der Kalenderansicht gefüllt */
    index: Map<string, Occurrence<SiteOffer>[]>;
    lastDay: string | undefined;
    day: string;
    setDay: (day: string) => void;
    monthOpen: boolean;
    setMonthOpen: (open: boolean) => void;
  };
  saved: SiteOffer[];
  /** Angebot aus der URL, falls es im Datenstand existiert */
  detailOffer: SiteOffer | undefined;
}

export function useOfferViews({ offers, route, birthDate, ageOnly, savedIds, now }: OfferViewsInput): OfferViews {
  const [showUnfit, setShowUnfit] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [calendarDay, setCalendarDay] = useState(() => berlinIsoDate(now));
  const [monthOpen, setMonthOpen] = useState(false);

  const upcoming = useMemo(() => applyFilters(offers, EMPTY_FILTER, { now }), [offers, now]);
  const filtered = useMemo(() => applyFilters(offers, route.filter, { now }), [offers, route.filter, now]);
  const { visible, hiddenCount, unfitIds } = useMemo(
    () => ageVisibility(filtered, upcoming, birthDate, now, { ageOnly, showUnfit }),
    [filtered, upcoming, birthDate, now, ageOnly, showUnfit],
  );
  const groups = useMemo(() => groupByNextSession(visible, now), [visible, now]);
  const index = useMemo(() => (route.tab === "kalender" ? sessionsByDay(visible) : NO_INDEX), [visible, route.tab]);
  const lastDay = useMemo(() => lastSessionDay(visible), [visible]);
  const saved = useMemo(() => savedOffers(offers, savedIds, now), [offers, savedIds, now]);
  const showMore = useCallback(() => setLimit((n) => n + PAGE), []);
  const resetPage = useCallback(() => setLimit(PAGE), []);

  return {
    visible,
    hiddenCount,
    unfitIds,
    showUnfit,
    setShowUnfit,
    page: takeGroups(groups, limit),
    showMore,
    resetPage,
    calendar: { index, lastDay, day: calendarDay, setDay: setCalendarDay, monthOpen, setMonthOpen },
    saved,
    detailOffer: route.offerId ? offers.find((o) => o.id === route.offerId) : undefined,
  };
}
