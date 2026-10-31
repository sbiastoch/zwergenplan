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
  allFits,
  endedOnDay,
  groupByNextSession,
  lastSessionDay,
  type Occurrence,
  sessionsByDay,
  takeGroups,
} from "../domain/agenda.ts";
import { type CalendarSelection, clampDay } from "../domain/calendar.ts";
import { quickRanges } from "../domain/date-range.ts";
import { applyFilters, EMPTY_FILTER, inDaytime, providerFilter } from "../domain/filter.ts";
import { groupByListing, groupByReach, type ListGroup } from "../domain/listing.ts";
import { isOutside, type MapExtent } from "../domain/map-view.ts";
import { placeKey } from "../domain/place-key.ts";
import type { Reach, ReachFn } from "../domain/reach.ts";
import type { Route } from "../domain/route.ts";
import {
  applySavedFilter,
  EMPTY_SAVED_FILTER,
  matchesListChips,
  matchesSavedFilter,
  recentlySaved,
  type SavedFilter,
  type SavedListChip,
  type SavedSort,
  type SavedState,
  savedFilterCount,
  savedOffers,
  savedRule,
  savedUnfitIds,
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
  /** nur vorgemerkte IDs (Plan 0057, E1) für „Nur fest eingeplant“; ohne Angabe ist alles fest eingeplant */
  tentative?: readonly string[];
  /** Filter der Merkliste (Plan 0025, E6; Plan 0057, E5), lebt in `App`; ohne Angabe leer */
  savedFilter?: SavedFilter;
  /** Sortierung der Liste der Merkliste (Plan 0057, E6), lebt in `App`; ohne Angabe „Nächste Termine“ */
  savedSort?: SavedSort;
  /** Schnellfilter der Liste der Merkliste (Plan 0058, E1), lebt in `App`; wirkt nur auf dem Tab „merkliste“ */
  listChips?: readonly SavedListChip[];
  /**
   * Wegzeit-Grenze der Merkliste zählt (Badge, „gefiltert“): in der Liste wie auf der Startseite schon beim Laden
   * (`limitActive` aus use-transit.ts), in Kalender und Karte erst mit Wegzeit, denn sie warten nicht (Plan 0057, E7a)
   */
  savedLimitActive?: boolean;
  now: Date;
  /** Entfernung ab dem Startpunkt (Wegzeit oder Luftlinie); ohne Startpunkt oder solange sie lädt `undefined` */
  reach?: ReachFn | undefined;
  /**
   * Kartenausschnitt nach `placeKey` (Plan 0056, E5); wirkt nur auf den Karten-Tabs und nur auf die Liste darunter,
   * nie auf `visible` (Marker, Zahl im Filter-Sheet, Onboarding; Review M1). `undefined`: Karte nicht bereit.
   */
  mapView?: MapExtent | undefined;
}

export interface OfferViews {
  visible: readonly SiteOffer[];
  /** gefilterte Angebote, die nicht zum Kind passen (ausgeblendet oder markiert, Plan 0021) */
  unfitCount: number;
  unfitIds: ReadonlySet<string>;
  /** dasselbe mit dem Zeitraum des Filters: Markierung in Liste und Karte von „Entdecken“ (Plan 0053, E2) */
  listUnfitIds: ReadonlySet<string>;
  /**
   * Im Tab „Anbieter“ (Plan 0055, E3): sichtbar nur nach Kategorie und Alter (`providerFilter`), ohne Wegzeit-Grenze
   * und Zeitraum. Außerhalb des Tabs dieselben Werte wie `visible` und `unfitCount`.
   */
  providerVisible: readonly SiteOffer[];
  providerUnfitCount: number;
  /**
   * Altersfilter „Nur passend für …“ (Plan 0021, E1): Standard an, nur im Speicher. Nach dem Neuladen ist er
   * wieder an; ein neues Geburtsdatum schaltet ihn ebenfalls wieder ein (`App.setBirthDate`).
   */
  ageOnly: boolean;
  /** schaltet den Altersfilter und beginnt die Liste wieder mit dem ersten Schritt */
  setAgeOnly: (on: boolean) => void;
  /**
   * Angebote der Liste: auf der Karte nur die im Ausschnitt (Plan 0056, E5), sonst `visible`. Daraus zählt die
   * Statuszeile „im Kartenausschnitt“.
   */
  inView: readonly SiteOffer[];
  /**
   * aktueller Ausschnitt der Liste „Entdecken“ bzw. der Liste unter der Karte: nach Terminen, „Neu eingestellt“ oder
   * Wegzeit (Plan 0043, E4, E7), auf der Karte aus `inView`
   */
  page: { groups: ListGroup<Occurrence<SiteOffer>>[]; remaining: number };
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
   * dieselben nach dem Merklisten-Filter (Plan 0057, E5): am Termin nach `savedRule`, in Liste und Karte mit Zeitraum,
   * im Kalender ohne ihn, Tageszeit überall. Badge und Export nehmen weiter `saved`.
   */
  savedVisible: Occurrence<SiteOffer>[];
  /** dieselben im Kartenausschnitt der Merklisten-Karte (Plan 0056, E5); sonst `savedVisible` */
  savedInView: Occurrence<SiteOffer>[];
  /** dieselben nach den Schnellfiltern der Liste (Plan 0058, E3); außerhalb der Liste `savedVisible` */
  savedListVisible: Occurrence<SiteOffer>[];
  /**
   * Merklisten-Filter wirkt in dieser Darstellung (im Kalender zählt der Zeitraum nicht); in der Liste auch mit einem
   * Schnellfilter (Plan 0058, E3)
   */
  savedFiltered: boolean;
  /** Zahl im Badge des Filter-Knopfs der Merkliste (E5): Werte wie auf der Startseite plus „Nur fest eingeplant“ */
  savedFilterCount: number;
  /**
   * Liste der Merkliste nach der Sortierung (E6): nach Terminen, nach Wegzeit (ohne Wegzeit nach Terminen, wie auf der
   * Startseite) oder flach nach „Zuletzt gemerkt“
   */
  savedGroups: ListGroup<Occurrence<SiteOffer>>[];
  /** gemerkte Angebote, die nicht zum Kind passen, mit Zeitraum und Tageszeit des Merklisten-Filters (E5, Review 3 M2) */
  savedUnfitIds: ReadonlySet<string>;
  /** Schnellwahlen „ab …“ der Merkliste bis zum Ende des Datenstands (Plan 0025, E7) */
  savedQuick: ReturnType<typeof quickRanges>;
  /** Angebot aus der URL, falls es im Datenstand existiert */
  detailOffer: SiteOffer | undefined;
  /**
   * Nur in den Kartenansichten von „Entdecken“ und Merkliste (Plan 0005; Plan 0025, E4): die Datenbasis des
   * Startausschnitts – alle kommenden Angebote, unabhängig von Filtern, Alter, Startpunkt und Merkliste, damit die
   * Kachel-Requests weder Alter noch Gemerktes verraten (Kamera-Regel, ADR 0008; Arch-Review B1, m1).
   */
  map: { cameraOffers: readonly SiteOffer[] } | undefined;
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
const NO_IDS: readonly string[] = [];
const NO_CHIPS: readonly SavedListChip[] = [];

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
  tentative = NO_IDS,
  savedFilter = EMPTY_SAVED_FILTER,
  savedSort = "termine",
  listChips = NO_CHIPS,
  savedLimitActive = false,
  now,
  reach,
  mapView,
}: OfferViewsInput): OfferViews {
  const [ageOnly, setAgeOnlyState] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  // Startwert: die Woche von heute, Monat zu („seine Woche planen“, Plan 0025, E5)
  const [selection, setSelection] = useState<CalendarSelection>(() => ({ unit: "woche", day: berlinIsoDate(now) }));
  const [monthOpen, setMonthOpen] = useState(false);

  // mit laufenden Kursen (Plan 0053, E1): Markierung gemerkter Kurse, Datenende und Startausschnitt wie bisher
  const upcoming = useMemo(() => applyFilters(offers, EMPTY_FILTER, { now, runningCourses: true }), [offers, now]);
  const filtered = useMemo(
    () => applyFilters(offers, route.filter, { now, reach }),
    [offers, route.filter, now, reach],
  );
  // Zeitraum und Tageszeit bestimmen, welcher Termin zählt (Plan 0057, E7): Markierung und gezeigter Termin
  const { range, daytimes } = route.filter;
  const rule = useMemo(() => ({ range, daytimes }), [range, daytimes]);
  const { visible, unfitCount, unfitIds, listUnfitIds } = useMemo(
    () => ageVisibility(filtered, upcoming, birthDate, now, { ageOnly, ...rule }),
    [filtered, upcoming, birthDate, now, ageOnly, rule],
  );
  const providerTab = route.tab === "anbieter";
  const providerView = useMemo(() => {
    if (!providerTab) return undefined;
    const shown = applyFilters(offers, providerFilter(route.filter), { now });
    return ageVisibility(shown, upcoming, birthDate, now, { ageOnly });
  }, [providerTab, offers, route.filter, now, upcoming, birthDate, ageOnly]);
  // Mit „nur altersgerecht“ stehen regelmäßige Angebote am ersten passenden Termin (Plan 0028). Ohne Altersfilter
  // erscheinen sie wie alle anderen, unpassende sind markiert.
  const fits = useMemo(() => (ageOnly ? sessionFit(birthDate) : undefined), [ageOnly, birthDate]);
  const reachOf = useMemo(() => reachCache(reach), [reach]);
  // „Nächstgelegen“ ohne Wegzeit (kein Startpunkt) zeigt bis dahin die Termine (Plan 0043, E7)
  const sort = route.sort === "nah" && !reach ? undefined : route.sort;
  // Liste unter der Karte: nur im Ausschnitt (Plan 0056, E5); Marker und Zähler nehmen weiter `visible` (Review M1)
  const extent = route.tab === "karte" || route.tab === "merkliste-karte" ? mapView : undefined;
  const inView = useMemo(
    () =>
      route.tab === "karte" && extent ? visible.filter((o) => !isOutside(extent, placeKey(o.venue.geo))) : visible,
    [route.tab, extent, visible],
  );
  const groups = useMemo((): ListGroup<Occurrence<SiteOffer>>[] => {
    if (sort === "neu") return groupByListing(inView, now, rule, fits);
    if (sort === "nah") return groupByReach(inView, now, reachOf, rule, fits);
    return groupByNextSession(inView, now, rule, fits).map(({ day, items }) => ({
      kind: "termin",
      key: day,
      day,
      items,
    }));
  }, [sort, inView, now, rule, fits, reachOf]);
  const dataEnd = useMemo(() => lastSessionDay(upcoming), [upcoming]);
  const today = berlinIsoDate(now);
  const savedQuick = useMemo(() => quickRanges(today, dataEnd), [today, dataEnd]);
  // Startausschnitt nur aus öffentlichen Daten: alle kommenden Angebote, ohne Filter, Alter und Startpunkt
  // (ADR 0008; Arch-Review 0005, B1 und m1). Sonst verriete die Kachelwahl Standort oder Alter des Kindes.
  // Die Karte der Merkliste zählt die Orte der gemerkten Angebote, ihr Startausschnitt ist derselbe (Plan 0025, E4).
  const saved = useMemo(() => savedOffers(offers, savedIds, now, birthDate), [offers, savedIds, now, birthDate]);
  const savedList = useMemo(() => saved.map((o) => o.offer), [saved]);
  const onCalendar = route.tab === "merkliste-kalender";
  // Merklisten-Filter (E5): Im Kalender ist die Auswahl der Zeitraum, der Filter-Zeitraum wirkt dort nicht.
  const useRange = !onCalendar;
  const savedState = useMemo((): SavedState => ({ ids: savedIds, tentative }), [savedIds, tentative]);
  const savedCount = savedFilterCount(savedFilter, { useRange, limitActive: savedLimitActive });
  // Sheet-Filter: entscheidet, ob `savedVisible` neu gerechnet wird (Plan 0058, Review 2 m3)
  const sheetFiltered = savedCount > 0;
  const savedSessionRule = useMemo(() => savedRule(savedFilter, useRange), [savedFilter, useRange]);
  const savedVisible = useMemo(() => {
    if (!sheetFiltered) return saved;
    const shown = applySavedFilter(savedList, savedFilter, savedState, now, { useRange, reach });
    // Mit Zeitraum oder Tageszeit steht ein Angebot am Termin darin und wird danach sortiert (E3a; Plan 0057, E7)
    return savedOffers(shown, savedIds, now, birthDate, savedSessionRule);
  }, [
    sheetFiltered,
    saved,
    savedList,
    savedFilter,
    savedState,
    now,
    useRange,
    reach,
    savedIds,
    birthDate,
    savedSessionRule,
  ]);
  const savedVisibleList = useMemo(() => savedVisible.map((o) => o.offer), [savedVisible]);
  const savedListTab = route.tab === "merkliste";
  // Schnellfilter der Liste (Plan 0058, E1, E3): nur auf dem Tab „merkliste“, am gezeigten Termin
  const listChipsActive = savedListTab && listChips.length > 0;
  const savedListVisible = useMemo(
    () => (listChipsActive ? savedVisible.filter((item) => matchesListChips(item, listChips, now)) : savedVisible),
    [listChipsActive, savedVisible, listChips, now],
  );
  const savedListVisibleList = useMemo(() => savedListVisible.map((o) => o.offer), [savedListVisible]);
  const savedFiltered = sheetFiltered || listChipsActive;
  const savedInView = useMemo(
    () =>
      route.tab === "merkliste-karte" && extent
        ? savedVisible.filter((o) => !isOutside(extent, placeKey(o.offer.venue.geo)))
        : savedVisible,
    [route.tab, extent, savedVisible],
  );
  // Der Kalender der Merkliste zeigt regelmäßige Angebote nur an Terminen, die zum Alter passen, wie Liste, Statuszeile
  // und Datei (Plan 0028, E3). Unabhängig vom Altersfilter in „Entdecken“: Gemerktes ist bewusst gewählt.
  const savedFits = useMemo(() => sessionFit(birthDate), [birthDate]);
  // Liste nach der Sortierung (E6). „Nächstgelegen“ ohne Wegzeit zeigt bis dahin die Termine (wie Plan 0043, E7). Die
  // Gruppierungen wählen denselben Termin wie `savedOffers` (gleiche Regel, gleiche Altersregel).
  const savedGroups = useMemo((): ListGroup<Occurrence<SiteOffer>>[] => {
    if (!savedListTab) return [];
    if (savedSort === "gemerkt") {
      const items = recentlySaved(savedListVisible, savedIds);
      return items.length > 0 ? [{ kind: "flach", key: "gemerkt", items }] : [];
    }
    if (savedSort === "nah" && reach)
      return groupByReach(savedListVisibleList, now, reachOf, savedSessionRule, savedFits);
    return groupByNextSession(savedListVisibleList, now, savedSessionRule, savedFits).map(({ day, items }) => ({
      kind: "termin",
      key: day,
      day,
      items,
    }));
  }, [
    savedListTab,
    savedSort,
    savedListVisible,
    savedIds,
    reach,
    savedListVisibleList,
    now,
    reachOf,
    savedSessionRule,
    savedFits,
  ]);
  const savedUnfit = useMemo(
    () => savedUnfitIds(savedList, birthDate, now, savedSessionRule),
    [savedList, birthDate, now, savedSessionRule],
  );
  // Tageszeit je Termin (E7, Review 3 M1): Ein Kurs steht an allen Terminen in der Tageszeit, nicht nur am Beginn
  const dayFit = useMemo(() => inDaytime(savedFilter.filter.daytimes), [savedFilter.filter.daytimes]);
  const calendarFits = useMemo(() => allFits(savedFits, dayFit), [savedFits, dayFit]);
  const allIndex = useMemo(
    () => (onCalendar ? sessionsByDay(savedList, savedFits) : undefined),
    [onCalendar, savedList, savedFits],
  );
  const savedIndex = useMemo(
    () => (onCalendar && sheetFiltered ? sessionsByDay(savedVisibleList, calendarFits) : allIndex),
    [onCalendar, sheetFiltered, savedVisibleList, calendarFits, allIndex],
  );
  // ohne Altersprüfung, aber mit Tageszeit: Die Differenz zu `index` ist genau, was das Alter verdeckt
  const ageIndex = useMemo(
    () => (onCalendar && birthDate !== undefined ? sessionsByDay(savedVisibleList, dayFit) : undefined),
    [onCalendar, birthDate, savedVisibleList, dayFit],
  );
  // Bewusst nicht über `saved`: Das kennt nur Angebote mit kommendem Termin. Ein gemerktes Angebot, dessen einziger
  // Termin heute schon vorbei ist, zählt sonst nicht (Review M7, B2). Mit demselben Prädikat wie der Index: Ein
  // unpassender Termin steht nie im Kalender, also auch nicht in „heute schon vorbei“ (Arch-Review 0025, M1). Ebenso
  // nur, was zum Merklisten-Filter passt (E5), die Tageszeit je Termin (Plan 0057, E7).
  const endedToday = useMemo(
    () =>
      onCalendar
        ? endedOnDay(
            offers.filter((o) => savedIds.includes(o.id) && matchesSavedFilter(o, savedFilter, savedState, reach)),
            today,
            now,
            calendarFits,
          )
        : 0,
    [onCalendar, offers, savedIds, savedFilter, savedState, reach, today, now, calendarFits],
  );
  const map = useMemo(
    () => (route.tab === "karte" || route.tab === "merkliste-karte" ? { cameraOffers: upcoming } : undefined),
    [route.tab, upcoming],
  );
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
    listUnfitIds,
    providerVisible: providerView?.visible ?? visible,
    providerUnfitCount: providerView?.unfitCount ?? unfitCount,
    ageOnly,
    setAgeOnly,
    inView,
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
    savedListVisible,
    savedInView,
    savedFiltered,
    savedFilterCount: savedCount,
    savedGroups,
    savedUnfitIds: savedUnfit,
    savedQuick,
    detailOffer: route.offerId ? offers.find((o) => o.id === route.offerId) : undefined,
    map,
    reachOf,
  };
}
