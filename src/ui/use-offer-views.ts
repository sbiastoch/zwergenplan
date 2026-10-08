/**
 * Abgeleitete Ansichten der Angebote (Plan 0003, Arch-Review 7): Filter, Alters-Sichtbarkeit,
 * Liste in Schritten, Merkliste mit Kalender, offenes Detail – plus der Ansichts-Zustand dazu.
 * „Jetzt“ kommt von außen (entsteht nur in `useNow`, use-app-state.ts), ebenso der Startpunkt
 * als Entfernungs-Funktion (`useTransit`: Wegzeit oder Luftlinie). Die Entfernung entsteht hier einmal je
 * Koordinate, nicht je Render (Plan 0004, E6; Plan 0009, E8).
 */
import { useCallback, useMemo, useState } from "react";
import { ageVisibility, sessionFit } from "../domain/age.ts";
import {
  type DayGroup,
  endedOnDay,
  groupByNextSession,
  lastSessionDay,
  type Occurrence,
  sessionsByDay,
  takeGroups,
} from "../domain/agenda.ts";
import { type CalendarSelection, clampDay } from "../domain/calendar.ts";
import { quickRanges } from "../domain/date-range.ts";
import { applyFilters, EMPTY_FILTER } from "../domain/filter.ts";
import { countPlaces, placeKey } from "../domain/place-key.ts";
import type { Reach, ReachFn } from "../domain/reach.ts";
import type { Route } from "../domain/route.ts";
import {
  applySavedFilter,
  EMPTY_SAVED_FILTER,
  matchesSavedFilter,
  type SavedFilter,
  savedFilterCount,
  savedOffers,
} from "../domain/saved.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";

/** Angebote je Schritt in der Liste (Plan 0003, E8) */
const PAGE = 40;

export interface OfferViewsInput {
  offers: readonly SiteOffer[];
  route: Route;
  birthDate: string | undefined;
  savedIds: readonly string[];
  /** Filter der Merkliste (Plan 0025, E6), lebt in `App`; ohne Angabe leer */
  savedFilter?: SavedFilter;
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
  /**
   * Kalender der Merkliste (Plan 0025, E5, E8), nur in der Darstellung Kalender gefüllt. Auswahl und Monat leben im
   * Hook: Sie überstehen Tab- und Darstellungswechsel, nicht das Neuladen.
   */
  savedCalendar: SavedCalendarData | undefined;
  /** gemerkte Angebote mit kommendem Termin, je am Termin, an dem sie in der Merkliste stehen (`savedOffers`) */
  saved: Occurrence<SiteOffer>[];
  /**
   * dieselben nach dem Merklisten-Filter (E6): in Liste und Karte mit der Schnellwahl „ab …“ (Termin im Zeitraum), im
   * Kalender ohne sie (E5). Badge und Export nehmen weiter `saved`.
   */
  savedVisible: Occurrence<SiteOffer>[];
  /** Merklisten-Filter wirkt in dieser Darstellung (im Kalender zählt der Zeitraum nicht) */
  savedFiltered: boolean;
  /** Schnellwahlen „ab …“ der Merkliste bis zum Ende des Datenstands (Plan 0025, E7) */
  savedQuick: ReturnType<typeof quickRanges>;
  /** Angebot aus der URL, falls es im Datenstand existiert */
  detailOffer: SiteOffer | undefined;
  /**
   * Nur in den Kartenansichten von „Entdecken“ und Merkliste (Plan 0005; Plan 0025, E4): Zahl der Orte für die
   * Statuszeile und die Datenbasis des Startausschnitts – alle kommenden Angebote, unabhängig von Filtern, Alter,
   * Startpunkt und Merkliste, damit die Kachel-Requests weder Standort, Alter noch Gemerktes verraten (Kamera-Regel,
   * ADR 0008; Arch-Review B1, m1).
   */
  map: { placeCount: number; cameraOffers: readonly SiteOffer[] } | undefined;
  /** Entfernung zum Ort des Angebots; ohne Startpunkt `undefined` */
  reachOf: (offer: SiteOffer) => Reach | undefined;
}

/** Kalender der Merkliste (Plan 0025, E5): Termine der gemerkten Angebote und der Zustand der Auswahl */
export interface SavedCalendarData {
  /** nicht beendete Termine der gemerkten Angebote je Berliner Tag (`sessionsByDay`) */
  index: Map<string, Occurrence<SiteOffer>[]>;
  /** dieselben ohne Merklisten-Filter: Daraus zählt `rangeAgenda`, was der Filter ausblendet (E5, Fall 1) */
  allIndex: Map<string, Occurrence<SiteOffer>[]>;
  /**
   * nur mit Geburtsdatum: dieselben nach dem Merklisten-Filter, aber ohne Altersprüfung. Daraus zählt `rangeAgenda`,
   * was nur das Alter ausblendet (Browser-Review 0025).
   */
  ageIndex: Map<string, Occurrence<SiteOffer>[]> | undefined;
  /**
   * letzter Tag mit Terminen im ganzen Datenstand (B8), zugleich die Grenze der Pfeile: So kann man auch in Wochen ohne
   * Gemerktes blättern und von dort „Für diese Woche entdecken“ nutzen (E5)
   */
  dataEnd: string | undefined;
  /** heute schon beendete Termine aller gemerkten Angebote nach dem Merklisten-Filter, auch ohne kommenden Termin (M7, B2) */
  endedToday: number;
  /** Auswahl; `day` nie vor heute (auch nach Mitternacht im offenen Tab) */
  selection: CalendarSelection;
  setSelection: (selection: CalendarSelection) => void;
  /** Monatsraster offen; unabhängig von `selection.unit` (offenes Raster mit gewähltem Tag ist erlaubt) */
  monthOpen: boolean;
  setMonthOpen: (open: boolean) => void;
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

export function useOfferViews({
  offers,
  route,
  birthDate,
  savedIds,
  savedFilter = EMPTY_SAVED_FILTER,
  now,
  reach,
}: OfferViewsInput): OfferViews {
  const [ageOnly, setAgeOnlyState] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  // Startwert: die Woche von heute, Monat zu („seine Woche planen“, Plan 0025, E5)
  const [selection, setSelection] = useState<CalendarSelection>(() => ({ unit: "woche", day: berlinIsoDate(now) }));
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
  const range = route.filter.range;
  // Mit „nur altersgerecht“ stehen regelmäßige Angebote am ersten passenden Termin (Plan 0028). Ohne Altersfilter
  // erscheinen sie wie alle anderen, unpassende sind markiert.
  const fits = useMemo(() => (ageOnly ? sessionFit(birthDate) : undefined), [ageOnly, birthDate]);
  const groups = useMemo(() => groupByNextSession(visible, now, range, fits), [visible, now, range, fits]);
  const dataEnd = useMemo(() => lastSessionDay(upcoming), [upcoming]);
  const today = berlinIsoDate(now);
  const savedQuick = useMemo(() => quickRanges(today, dataEnd), [today, dataEnd]);
  const reachOf = useMemo(() => reachCache(reach), [reach]);
  // Startausschnitt nur aus öffentlichen Daten: alle kommenden Angebote, ohne Filter, Alter und Startpunkt
  // (ADR 0008; Arch-Review 0005, B1 und m1). Sonst verriete die Kachelwahl Standort oder Alter des Kindes.
  // Die Karte der Merkliste zählt die Orte der gemerkten Angebote, ihr Startausschnitt ist derselbe (Plan 0025, E4).
  const saved = useMemo(() => savedOffers(offers, savedIds, now, birthDate), [offers, savedIds, now, birthDate]);
  const savedList = useMemo(() => saved.map((o) => o.offer), [saved]);
  const onCalendar = route.tab === "merkliste-kalender";
  // Merklisten-Filter (E6): Im Kalender ist die Auswahl der Zeitraum, die Schnellwahl „ab …“ wirkt dort nicht (E5).
  const useRange = !onCalendar;
  const savedFiltered = savedFilterCount(savedFilter, { useRange }) > 0;
  const savedVisible = useMemo(() => {
    if (!savedFiltered) return saved;
    const shown = applySavedFilter(savedList, savedFilter, now, { useRange });
    // Mit Schnellwahl steht ein Angebot am Termin im Zeitraum und wird danach sortiert (E3a)
    return savedOffers(shown, savedIds, now, birthDate, useRange ? savedFilter.range : undefined);
  }, [savedFiltered, saved, savedList, savedFilter, now, useRange, savedIds, birthDate]);
  const savedVisibleList = useMemo(() => savedVisible.map((o) => o.offer), [savedVisible]);
  // Der Kalender der Merkliste zeigt regelmäßige Angebote nur an Terminen, die zum Alter passen, wie Liste, Statuszeile
  // und Datei (Plan 0028, E3). Unabhängig vom Altersfilter in „Entdecken“: Gemerktes ist bewusst gewählt.
  const savedFits = useMemo(() => sessionFit(birthDate), [birthDate]);
  const allIndex = useMemo(
    () => (onCalendar ? sessionsByDay(savedList, savedFits) : undefined),
    [onCalendar, savedList, savedFits],
  );
  const savedIndex = useMemo(
    () => (onCalendar && savedFiltered ? sessionsByDay(savedVisibleList, savedFits) : allIndex),
    [onCalendar, savedFiltered, savedVisibleList, savedFits, allIndex],
  );
  const ageIndex = useMemo(
    () => (onCalendar && birthDate !== undefined ? sessionsByDay(savedVisibleList) : undefined),
    [onCalendar, birthDate, savedVisibleList],
  );
  // Bewusst nicht über `saved`: Das kennt nur Angebote mit kommendem Termin. Ein gemerktes Angebot, dessen einziger
  // Termin heute schon vorbei ist, zählt sonst nicht (Review M7, B2). Mit demselben Prädikat wie der Index: Ein
  // unpassender Termin steht nie im Kalender, also auch nicht in „heute schon vorbei“ (Arch-Review 0025, M1). Ebenso
  // nur, was zum Merklisten-Filter passt (E5).
  const endedToday = useMemo(
    () =>
      onCalendar
        ? endedOnDay(
            offers.filter((o) => savedIds.includes(o.id) && matchesSavedFilter(o, savedFilter)),
            today,
            now,
            savedFits,
          )
        : 0,
    [onCalendar, offers, savedIds, savedFilter, today, now, savedFits],
  );
  const map = useMemo(() => {
    if (route.tab === "karte") return { placeCount: countPlaces(visible), cameraOffers: upcoming };
    if (route.tab === "merkliste-karte") return { placeCount: countPlaces(savedVisibleList), cameraOffers: upcoming };
    return undefined;
  }, [route.tab, visible, savedVisibleList, upcoming]);
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
    savedCalendar: savedIndex &&
      allIndex && {
        index: savedIndex,
        allIndex,
        ageIndex,
        dataEnd,
        endedToday,
        selection: { ...selection, day: clampDay(selection.day, today) },
        setSelection,
        monthOpen,
        setMonthOpen,
      },
    saved,
    savedVisible,
    savedFiltered,
    savedQuick,
    detailOffer: route.offerId ? offers.find((o) => o.id === route.offerId) : undefined,
    map,
    reachOf,
  };
}
