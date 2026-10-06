/**
 * Abgeleitete Ansichten der Angebote (Plan 0003, Arch-Review 7): Filter, Alters-Sichtbarkeit,
 * Liste in Schritten, Kalender, Merkliste, offenes Detail – plus der Ansichts-Zustand dazu.
 * „Jetzt“ kommt von außen (entsteht nur in `useNow`, use-app-state.ts), ebenso der Startpunkt
 * als Entfernungs-Funktion (`useTransit`: Wegzeit oder Luftlinie). Die Entfernung entsteht hier einmal je
 * Koordinate, nicht je Render (Plan 0004, E6; Plan 0009, E8).
 */
import { useCallback, useMemo, useState } from "react";
import { ageVisibility } from "../domain/age.ts";
import {
  type DayGroup,
  endedOnDay,
  groupByNextSession,
  lastSessionDay,
  type Occurrence,
  sessionsByDay,
  takeGroups,
} from "../domain/agenda.ts";
import { clampDay } from "../domain/calendar.ts";
import { applyFilters, EMPTY_FILTER, matchesFilter } from "../domain/filter.ts";
import { countPlaces, placeKey } from "../domain/place-key.ts";
import type { Reach, ReachFn } from "../domain/reach.ts";
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
  savedIds: readonly string[];
  now: Date;
  /** Entfernung ab dem Startpunkt (Wegzeit oder Luftlinie); ohne Startpunkt oder solange sie lädt `undefined` */
  reach?: ReachFn | undefined;
}

export interface OfferViews {
  visible: readonly SiteOffer[];
  /** gefilterte Angebote, die nicht zum Kind passen (ausgeblendet oder markiert, Plan 0021) */
  unfitCount: number;
  unfitIds: ReadonlySet<string>;
  /**
   * Altersfilter „Nur passend für …“ (Plan 0021, E1): Standard an, nur im Speicher. Nach dem Neuladen ist er
   * wieder an; ein neues Geburtsdatum schaltet ihn ebenfalls wieder ein (`App.setBirthDate`).
   */
  ageOnly: boolean;
  /** schaltet den Altersfilter und beginnt die Liste wieder mit dem ersten Schritt */
  setAgeOnly: (on: boolean) => void;
  /** aktueller Ausschnitt der Liste „Entdecken“ */
  page: { groups: DayGroup<Occurrence<SiteOffer>>[]; remaining: number };
  showMore: () => void;
  /** nach Filterwechsel wieder mit dem ersten Schritt beginnen */
  resetPage: () => void;
  calendar: {
    /** nur in der Kalenderansicht gefüllt */
    index: Map<string, Occurrence<SiteOffer>[]>;
    /**
     * alle kommenden Angebote ohne Filter, Alter und Wegzeit, nur in der Kalenderansicht gefüllt: Daraus
     * zählt `dayAgenda`, was die Auswahl an einem Tag ausblendet (Plan 0008, E12)
     */
    allIndex: Map<string, Occurrence<SiteOffer>[]>;
    /** letzter Tag mit passenden Terminen (Grenze der Navigation) */
    lastDay: string | undefined;
    /** letzter Tag mit Terminen im ganzen Datenstand, ohne Filter (B8) */
    dataEnd: string | undefined;
    /** heute schon beendete Termine aller filterpassenden Angebote, auch ohne kommenden Termin (B2) */
    endedToday: number;
    /** gewählter Tag, nie vor heute (auch nach Mitternacht im offenen Tab) */
    day: string;
    setDay: (day: string) => void;
    monthOpen: boolean;
    setMonthOpen: (open: boolean) => void;
  };
  saved: SiteOffer[];
  /** Angebot aus der URL, falls es im Datenstand existiert */
  detailOffer: SiteOffer | undefined;
  /**
   * Nur in der Kartenansicht (Plan 0005): Zahl der Orte für die Statuszeile und die Datenbasis des
   * Startausschnitts – alle kommenden Angebote, unabhängig von Filtern, Alter und Startpunkt, damit die
   * Kachel-Requests weder Standort noch Alter verraten (Kamera-Regel, ADR 0008; Arch-Review B1, m1).
   */
  map: { placeCount: number; cameraOffers: readonly SiteOffer[] } | undefined;
  /** Entfernung zum Ort des Angebots; ohne Startpunkt `undefined` */
  reachOf: (offer: SiteOffer) => Reach | undefined;
}

const NO_REACH = (): undefined => undefined;

/** Entfernung je Koordinate zwischengespeichert: Viele Angebote teilen sich einen Ort. */
function reachCache(reachFn: ReachFn | undefined): (offer: SiteOffer) => Reach | undefined {
  if (!reachFn) return NO_REACH;
  const cache = new Map<string, Reach>();
  return ({ venue }) => {
    const key = placeKey(venue.geo);
    let reach = cache.get(key);
    if (!reach) {
      reach = reachFn(venue);
      cache.set(key, reach);
    }
    return reach;
  };
}

export function useOfferViews({ offers, route, birthDate, savedIds, now, reach }: OfferViewsInput): OfferViews {
  const [ageOnly, setAgeOnlyState] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [calendarDay, setCalendarDay] = useState(() => berlinIsoDate(now));
  const [monthOpen, setMonthOpen] = useState(false);

  const upcoming = useMemo(() => applyFilters(offers, EMPTY_FILTER, { now }), [offers, now]);
  const filtered = useMemo(
    () => applyFilters(offers, route.filter, { now, reach }),
    [offers, route.filter, now, reach],
  );
  const { visible, unfitCount, unfitIds } = useMemo(
    () => ageVisibility(filtered, upcoming, birthDate, now, { ageOnly }),
    [filtered, upcoming, birthDate, now, ageOnly],
  );
  const groups = useMemo(() => groupByNextSession(visible, now), [visible, now]);
  const index = useMemo(() => (route.tab === "kalender" ? sessionsByDay(visible) : NO_INDEX), [visible, route.tab]);
  const allIndex = useMemo(
    () => (route.tab === "kalender" ? sessionsByDay(upcoming) : NO_INDEX),
    [upcoming, route.tab],
  );
  const lastDay = useMemo(() => lastSessionDay(visible), [visible]);
  const dataEnd = useMemo(() => lastSessionDay(upcoming), [upcoming]);
  const today = berlinIsoDate(now);
  const endedToday = useMemo(
    () =>
      route.tab === "kalender"
        ? endedOnDay(
            offers.filter((o) => matchesFilter(o, route.filter, reach)),
            today,
            now,
          )
        : 0,
    [offers, route.filter, route.tab, today, now, reach],
  );
  const reachOf = useMemo(() => reachCache(reach), [reach]);
  // Startausschnitt nur aus öffentlichen Daten: alle kommenden Angebote, ohne Filter, Alter und Startpunkt
  // (ADR 0008; Arch-Review 0005, B1 und m1). Sonst verriete die Kachelwahl Standort oder Alter des Kindes.
  const map = useMemo(
    () => (route.tab === "karte" ? { placeCount: countPlaces(visible), cameraOffers: upcoming } : undefined),
    [route.tab, visible, upcoming],
  );
  const saved = useMemo(() => savedOffers(offers, savedIds, now), [offers, savedIds, now]);
  const showMore = useCallback(() => setLimit((n) => n + PAGE), []);
  const resetPage = useCallback(() => setLimit(PAGE), []);
  const setAgeOnly = useCallback((on: boolean) => {
    setAgeOnlyState(on);
    setLimit(PAGE);
  }, []);

  return {
    visible,
    unfitCount,
    unfitIds,
    ageOnly,
    setAgeOnly,
    page: takeGroups(groups, limit),
    showMore,
    resetPage,
    calendar: {
      index,
      allIndex,
      lastDay,
      dataEnd,
      endedToday,
      day: clampDay(calendarDay, today),
      setDay: setCalendarDay,
      monthOpen,
      setMonthOpen,
    },
    saved,
    detailOffer: route.offerId ? offers.find((o) => o.id === route.offerId) : undefined,
    map,
    reachOf,
  };
}
