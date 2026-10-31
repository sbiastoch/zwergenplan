/** Zwergenplan (Plan 0003): Laden, URL-Zustand, Ansichten, Overlays. Rechenlogik kommt aus src/domain. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { iosTab } from "../data/platform.ts";
import { loadOnboardingDone, saveOnboardingDone, storageUsable } from "../data/preferences.ts";
import { startPwa } from "../data/pwa-start.ts";
import { type LoadFailure, loadSiteData, SiteLoadError } from "../data/site.ts";
import { ageInMonths } from "../domain/age.ts";
import { ruleActive } from "../domain/date-range.ts";
import { activeFilterCount, EMPTY_FILTER, type FilterState, providerFilter, withDateRange } from "../domain/filter.ts";
import { type MapExtent, viewNarrows } from "../domain/map-view.ts";
import { onboardingGate } from "../domain/onboarding-gate.ts";
import { placeKey } from "../domain/place-key.ts";
import { countProviders } from "../domain/provider-count.ts";
import { type Sort, type Tab, tabSection } from "../domain/route.ts";
import { EMPTY_SAVED_FILTER, type SavedFilter, type SavedStage } from "../domain/saved.ts";
import { searchOf } from "../domain/searches.ts";
import { IMPRINT_PATH } from "../domain/share.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";
import { type Category, withCategory } from "../domain/topics.ts";
import { bellPush, preloadBell } from "./AppExtras.tsx";
import { Header, QuickFilters, Stickers, TabBar, type ViewOption, ViewToggle } from "./Chrome.tsx";
import {
  aboToast,
  ageChipLabel,
  ageWarnText,
  inViewStatusParts,
  limitHint,
  listStatusParts,
  loadErrorText,
  nearSortSub,
  OFFER_GONE,
  providerStatusParts,
  reachNote,
  STAGE_UNDONE,
  searchLabel,
  stageToast,
  standDate,
} from "./format.ts";
import { Icon } from "./icons.tsx";
import { preloadExportWhenIdle } from "./ics-export.ts";
import { type AgeEscape, EmptyState, ListPending, ListView } from "./ListView.tsx";
import { MapPanel, ProviderMapPanel } from "./MapPanel.tsx";
import type { CardContext, HeartCycle, HeartHold } from "./OfferCard.tsx";
import { Onboarding, preloadOnboarding } from "./Onboarding.tsx";
import { Overlays, type SheetKind } from "./Overlays.tsx";
import type { OnboardingEnd } from "./onboarding-types.ts";
import { ProviderPanel } from "./ProviderPanel.tsx";
import { ProviderSearch } from "./ProviderSearch.tsx";
import { SavedCalendar } from "./SavedCalendar.tsx";
import { SavedView } from "./SavedView.tsx";
import { LimitAction, type LimitActionFor } from "./Sheets.tsx";
import { SortMenu, type SortOption } from "./SortMenu.tsx";
import { NO_TOAST, Toast } from "./Toast.tsx";
import {
  useBirthDate,
  useNow,
  useOrigin,
  useRoute,
  useSaved,
  useSavedProviders,
  useSearchAbos,
  useTheme,
  useToast,
} from "./use-app-state.ts";
import { useOfferViews } from "./use-offer-views.ts";
import { ANNOUNCE_DELAY_MS, useSettled } from "./use-settled.ts";
import { limitActive, useTransit } from "./use-transit.ts";

/** `site.json` im lockeren Format: Angebote ohne `category` aus einem Datencache vor Plan 0037, Stufe A (E13). */
type LooseSiteData = Omit<SiteData, "offers"> & {
  offers: Array<Omit<SiteOffer, "category"> & { category?: Category }>;
};

/**
 * Übernimmt geladene Daten; ein Angebot ohne `category` bekommt den Rückfall aus den Themen. Einzige Stelle in
 * `src/ui` dafür, nicht in `src/data` (ADR 0010, `data-domain-runtime-allowlist`).
 */
// Übergang Plan 0037 (E13): site.json aus einem Cache vor Stufe A hat kein category; Rückfall bleibt bis Stufe C
function adoptSite(data: LooseSiteData): SiteData {
  return { ...data, offers: data.offers.map((offer) => withCategory<SiteOffer>(offer)) };
}

type LoadState = { kind: "loading" } | { kind: "error"; reason: LoadFailure } | { kind: "ready"; data: SiteData };
/** Onboarding (Plan 0033, E9): „auto“ beim ersten Öffnen, „manuell“ über das Kind-Sheet (E12) */
type OnboardingMode = "aus" | "auto" | "manuell";

const NO_OFFERS: SiteOffer[] = [];
const DISCOVER_VIEWS: readonly ViewOption<"entdecken" | "karte">[] = [
  { value: "entdecken", label: "Liste" },
  { value: "karte", label: "Karte" },
];
/** Sortierungen der Liste (Plan 0043, E4); „termine“ steht nie in der URL */
type SortChoice = "termine" | Sort;
const SORT_TITLES: Record<SortChoice, string> = {
  termine: "Nächste Termine",
  neu: "Neu eingestellt",
  nah: "Nächstgelegen",
};

export function App() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { route, replace, openDetail, closeDetail, openProvider, closeProvider } = useRoute();
  const [birthDate, setBirthDateStored] = useBirthDate();
  const savedApi = useSaved();
  const savedIds = savedApi.state.ids;
  const [savedProviders, toggleSavedProvider] = useSavedProviders();
  const theme = useTheme();
  const [toast, say] = useToast();
  // erneuert sich im offenen Tab, höchstens einmal pro Minute (Plan 0007, E2)
  const now = useNow();
  const today = berlinIsoDate(now);
  // Startpunkt der Entfernung: der zuletzt gewählte bleibt auf dem Gerät, ein Punkt nur gerundet (ADR 0017)
  const originApi = useOrigin();
  const { origin } = originApi;

  const [sheet, setSheetState] = useState<SheetKind>(null);
  const [detailDay, setDetailDay] = useState<string>();
  // Orts-Sheet offen (karte/MapScreen.tsx): Der Seiten-Toast schweigt dann wie bei jedem Modal.
  const [placeSheet, setPlaceSheet] = useState(false);
  const [animate, setAnimate] = useState(false);
  // Suchtext der Anbieterliste: übersteht den Tab-Wechsel, nie in der URL (Plan 0010, E5)
  const [providerQuery, setProviderQuery] = useState("");
  // Anbieterkarte (Plan 0055, E4): Ausschnitt für Liste und Statuszeile, Zähler für „Alle zeigen“; nur im Speicher
  const [providerView, setProviderView] = useState<MapExtent>();
  const [providerReset, setProviderReset] = useState(0);
  // Ausschnitt der Angebots- bzw. Merklisten-Karte für die Liste darunter, „Alle zeigen“ dort (Plan 0056, E5)
  const [mapView, setMapView] = useState<MapExtent>();
  const [mapReset, setMapReset] = useState(0);
  // Filter der Merkliste: getrennt vom Startseiten-Filter, nie in der URL, übersteht Tab- und Darstellungswechsel,
  // nicht das Neuladen (Plan 0025, E6)
  const [savedFilter, setSavedFilter] = useState<SavedFilter>(EMPTY_SAVED_FILTER);
  // Fokus-Rückweg des Kind-Sheets: „Startpunkt wählen“ im Wegzeit-Hinweis verschwindet mit der Wahl. Aus der
  // Aufforderung „Wovon aus gerechnet?“ geht er stattdessen auf die Statuszeile (`originFromPrompt`, Plan 0043, E7).
  const filterButton = useRef<HTMLButtonElement>(null);
  // Fokus-Rückweg des Details: Die Kachel, die es geöffnet hat, kann beim Schließen fehlen (Plan 0008, E11).
  const activeTab = useRef<HTMLButtonElement>(null);
  /** Fokus-Ziel nach „Nochmal laden“ unter der Statuszeile (Plan 0009, N2) */
  const statusLine = useRef<HTMLParagraphElement>(null);
  /*
   * Onboarding (Plan 0033, E2; Plan 0035, E3): synchron entschieden, ohne Inline-Skript. Bei „zeigen“ laden Chunk und
   * App-Teil sofort, parallel zu site.json. Gespeicherte Angaben zählen nicht, Bestandsnutzer sehen es also auch, und
   * kein Request verrät, ob etwas gespeichert ist (Review H1).
   */
  const [onboarding, setOnboarding] = useState<OnboardingMode>(() => {
    // Mit Flag keine Schreibprobe: Sonst schriebe jeder Start `zwergenplan.probe` (Arch-Review der Umsetzung, m3)
    const done = loadOnboardingDone();
    const gate = onboardingGate({
      storage: done || storageUsable(),
      done,
      deepLink: route.offerId !== undefined || route.providerId !== undefined,
    });
    if (gate === "nichts") return "aus";
    preloadOnboarding();
    return "auto";
  });

  useEffect(() => {
    // `attempt` startet das Laden neu („Nochmal versuchen“)
    void attempt;
    setLoad({ kind: "loading" });
    loadSiteData().then(
      (data) => setLoad({ kind: "ready", data: adoptSite(data) }),
      // Die Fehlerart kennt nur src/data; ein unbekannter Fehler zeigt nie seinen Rohtext (Plan 0008, E5).
      (e: unknown) => setLoad({ kind: "error", reason: e instanceof SiteLoadError ? e.reason : "server" }),
    );
  }, [attempt]);

  // Erst nach dem ersten Rendern mit Daten dürfen Kacheln sich einkleben (LCP, Plan 0003 E6).
  useEffect(() => {
    if (load.kind === "ready") setAnimate(true);
  }, [load.kind]);
  // Export-Code (Merkliste, Reihen im Detail) nach dem ersten Rendern mit Daten im Leerlauf vorladen (Plan 0010, E8 A)
  const dataReady = load.kind === "ready";
  useEffect(() => (dataReady ? preloadExportWhenIdle() : undefined), [dataReady]);

  const offers = load.kind === "ready" ? load.data.offers : NO_OFFERS;
  // Orte der Seite: Die Wegzeit-Tabelle muss zu ihnen passen (E8). Erst mit site.json bekannt.
  const placeKeys = useMemo(
    () => (load.kind === "ready" ? new Set(load.data.offers.map((o) => placeKey(o.venue.geo))) : undefined),
    [load],
  );
  // Wegzeit (Plan 0009, E9–E11): lädt beim Start nur mit gespeichertem Startpunkt, sonst erst auf Anlass
  const transit = useTransit(origin, placeKeys);
  const { mode: reachMode, want } = transit;

  // PWA-Kern nach `load` (Plan 0011, E5): setzt die Zeile „Offline – Stand vom …“ (`pwaNote`) und meldet ICS offline.
  // Frische-Anlass (E4a): Daten ohne Ladezustand tauschen, eine geladene Wegzeit-Tabelle lädt mit. Scheitert das
  // Neuladen, bleibt der bisherige Stand.
  const [pwaNote, setPwaNote] = useState("");
  const refreshTransit = transit.refresh;
  useEffect(
    () =>
      startPwa({
        refresh: () => {
          refreshTransit();
          return loadSiteData().then(
            (data) => setLoad({ kind: "ready", data: adoptSite(data) }),
            () => {},
          );
        },
        say,
        note: setPwaNote,
      }),
    [refreshTransit, say],
  );
  const views = useOfferViews({ offers, route, birthDate, savedIds, savedFilter, now, reach: transit.reach, mapView });
  // Neuer Ausschnitt: Die Liste darunter beginnt wieder mit dem ersten Schritt (Plan 0056, N9)
  const { resetPage } = views;
  const onMapInView = useCallback(
    (view: MapExtent | undefined) => {
      setMapView(view);
      resetPage();
    },
    [resetPage],
  );
  const { visible, unfitCount, ageOnly, page, saved, detailOffer } = views;

  // Öffnen der Karte lädt die Tabelle (E9, Auslöser 3): Die Liste darunter zeigt Minuten an den Kacheln (Plan 0056, N10).
  // Die Karte der Merkliste ebenso (Plan 0025, E4); Liste und Kalender der Merkliste sind kein Anlass. Das gilt auch
  // ohne gemerktes Angebot: Hinge der Request am Inhalt der Merkliste, verriete er, ob etwas gemerkt ist.
  useEffect(() => {
    if (route.tab === "karte" || route.tab === "merkliste-karte") want();
  }, [route.tab, want]);
  // Das Kind-Sheet auch (Auslöser 2). Nie die Wahl selbst: Ab da entsteht kein Request.
  // Aus der Aufforderung „Wovon aus gerechnet?“ geöffnet (Plan 0043, E7): Ihr Knopf verschwindet mit der Wahl, der Fokus
  // geht beim Schließen auf die Statuszeile statt auf den Filter-Knopf
  const [originFromPrompt, setOriginFromPrompt] = useState(false);
  const setSheet = useCallback(
    (next: SheetKind) => {
      if (next === "kid" || next === "origin") want();
      if (next !== null) setOriginFromPrompt(false);
      setSheetState(next);
    },
    [want],
  );

  // Unbekanntes Angebot in der URL (abgelaufen, Tippfehler, alter geteilter Link): Parameter entfernen und sagen,
  // warum nichts aufgeht (Plan 0026, E7).
  useEffect(() => {
    if (load.kind === "ready" && route.offerId && !detailOffer) {
      say(OFFER_GONE, undefined, "hint");
      closeDetail();
    }
  }, [load.kind, route.offerId, detailOffer, closeDetail, say]);

  // Unbekannte Anbieter-ID (Tippfehler, aus dem Katalog verschwunden): Das Sheet meldet es nach dem Laden (E3).
  const dropProvider = useCallback(() => {
    const { providerId: _unknown, ...rest } = route;
    replace(rest);
  }, [route, replace]);

  const setFilter = (filter: FilterState) => {
    replace({ ...route, filter });
    views.resetPage();
  };
  const setBirthDate = (value: string | undefined) => {
    setBirthDateStored(value);
    // neues Alter, neuer Zusammenhang: Altersfilter wieder an (Plan 0021, E1)
    views.setAgeOnly(true);
  };
  const onTab = (tab: Tab) => {
    replace({ ...route, tab });
    window.scrollTo({ top: 0 });
  };
  // „Für diese Woche entdecken“ (Plan 0025, E5): zu „Angebote“ mit der Kalenderauswahl als Zeitraum (von=/bis=), die
  // übrigen Startseiten-Filter bleiben.
  const discoverRange = ({ from, to }: { from: string; to: string }) => {
    replace({ ...route, tab: "entdecken", filter: withDateRange(route.filter, from, to) });
    views.resetPage();
    window.scrollTo({ top: 0 });
  };
  /*
   * Herz mit Stufen (Plan 0057, E2, E3): Der Toast sagt die neue Stufe an, „Rückgängig“ setzt die vorige ohne Animation
   * und gibt den Fokus dem auslösenden Herz zurück. Ist es mit dem Entfernen verschwunden (Liste der Merkliste), das
   * neu gerenderte Herz desselben Angebots.
   */
  const { stage: stageOf, cycle, setStage } = savedApi;
  const heartToast = useCallback(
    (offer: SiteOffer, before: SavedStage, after: SavedStage, button: HTMLButtonElement) =>
      say(stageToast(after), {
        action: {
          label: "Rückgängig",
          run: () => {
            setStage(offer.id, before);
            say(STAGE_UNDONE);
            requestAnimationFrame(() => {
              const target = button.isConnected
                ? button
                : document.querySelector<HTMLButtonElement>(`.heart[data-offer="${offer.id}"]`);
              target?.focus();
            });
          },
        },
      }),
    [say, setStage],
  );
  const onCycle = useCallback<HeartCycle>(
    (offer, button) => {
      const before = stageOf(offer.id);
      const after = cycle(offer.id);
      heartToast(offer, before, after, button);
      return after;
    },
    [stageOf, cycle, heartToast],
  );
  const onHold = useCallback<HeartHold>(
    (offer, button) => {
      const before = stageOf(offer.id);
      heartToast(offer, before, setStage(offer.id, "fest"), button);
    },
    [stageOf, setStage, heartToast],
  );
  // Glocken (Plan 0054, E4, E5): nach dem Umschalten synchron `bellPush` (spiegeln bzw. Push einschalten), der Toast
  // kommt mit dem Ergebnis; Toasts nach dem Muster aus Plan 0022, im Sheet zeigt der Dialog sie. Solange ein Tipp
  // Push einschaltet, nimmt keine Glocke einen weiteren an.
  const [bellBusy, setBellBusy] = useState(false);
  const bellBusyRef = useRef(false);
  const afterBell = useCallback(
    (kind: "anbieter" | "suche", subscribed: boolean, hints: { noOrigin?: boolean; daytime?: boolean } = {}) => {
      bellBusyRef.current = true;
      setBellBusy(true);
      void bellPush(subscribed).then((push) => {
        bellBusyRef.current = false;
        setBellBusy(false);
        const { text, ms, tone } = aboToast(kind, subscribed, push, { ...hints, iosTab: iosTab() });
        say(text, ms, tone);
      });
    },
    [say],
  );
  const onToggleProvider = useCallback(
    (providerId: string) => {
      if (!bellBusyRef.current) afterBell("anbieter", toggleSavedProvider(providerId));
    },
    [afterBell, toggleSavedProvider],
  );
  const searchAbos = useSearchAbos();
  const onToggleSearch = () => {
    if (bellBusyRef.current) return;
    const outcome = searchAbos.toggle(route.filter);
    if (outcome === "voll") say("Höchstens 5 Such-Abos. Erst eins entfernen.", undefined, "hint");
    else if (outcome === "neu" || outcome === "entfernt") {
      afterBell("suche", outcome === "neu", {
        noOrigin: route.filter.reachLimit !== undefined && origin === undefined,
        daytime: route.filter.daytimes.length > 0,
      });
    }
  };

  const ctx: CardContext = {
    now,
    animate,
    stageOf,
    isUnfit: (id) => views.unfitIds.has(id),
    reachOf: views.reachOf,
    reachPending: reachMode?.kind === "laedt",
    onCycle,
    onHold,
    onOpen: (offer, day) => {
      setDetailDay(day);
      openDetail(offer.id);
    },
  };
  // Liste und Karte in „Entdecken“ markieren mit dem Zeitraum des Filters, alles andere ohne (Plan 0053, E2)
  const discoverCtx: CardContext = { ...ctx, isUnfit: (id) => views.listUnfitIds.has(id) };
  // Liste und Karte: nur die Zahl, mit Zeitraum dieser dazu (Plan 0056, E2, N1)
  const [listCount, listWords] = listStatusParts(visible.length, route.filter.range);
  // „5 Anbieter“: so viele aktive Zeilen zeigt die Liste im Chunk (Plan 0010, E4). Im Tab wirken nur Kategorie und
  // Alter (Plan 0055, E3).
  const [providerCount, providersWord] = providerStatusParts(countProviders(views.providerVisible));
  // Blendet der Kartenausschnitt Anbieter aus, zählt die Statuszeile nur die darin (Plan 0055, E4, Review M1)
  // … ebenso die Angebotskarte, nach Orten (Plan 0056, E5)
  const providersNarrowed = route.tab === "anbieter" && viewNarrows(providerView);
  const offersNarrowed = route.tab === "karte" && viewNarrows(mapView);
  const narrowed = providersNarrowed || offersNarrowed;
  const inViewCount = providersNarrowed ? countProviders(views.providerVisible, providerView) : views.inView.length;
  const [, inViewWords] = inViewStatusParts(inViewCount, providersNarrowed ? "anbieter" : "angebote");
  // Ansage erst, wenn die Karte ruht; der sichtbare Text ist dann `aria-hidden` (Review m8, Review 2, m4)
  const inViewAnnounce = useSettled(narrowed ? `${inViewCount}${inViewWords}` : "", ANNOUNCE_DELAY_MS);
  /*
   * Nur der Rückfall auf die Luftlinie steht hinter der Zahl, kurz mit Grund (Plan 0056, E2; ADR 0039). U+00A0 vor dem
   * Punkt, damit er nie verwaist am Zeilenanfang steht; der Ausdruck ist ein Inline-Block (Plan 0020, E1).
   */
  const reachText = origin && reachMode && reachNote(reachMode);
  const reachSuffix = reachText && (
    <span className="status-reach">
      {"\u00a0· "}
      <span className="status-reach-text">{reachText}</span>
    </span>
  );
  const ageLabel = ageChipLabel(birthDate ? ageInMonths(birthDate, now) : undefined);
  // Liste und Karte gehören zu „Entdecken“ (Plan 0005, E5) bzw. zur Merkliste (Plan 0025, E4). Alle Weichen nach
  // Tab-Leisten-Eintrag laufen über `section`, sonst griffen sie auf der Merklisten-Karte falsch (Review M1).
  const section = tabSection(route.tab);
  // Suche ohne Zeitraum (Plan 0023, E12); die Glocke nur im Tab „Angebote“ (Plan 0054, E6)
  const currentSearch = section === "entdecken" ? searchOf(route.filter) : "";
  // Liste | Karte steht rechts neben der Statuszeile und bricht bei wenig Platz darunter (Plan 0005, E5). Kein
  // Scroll nach oben: Das gibt es nur beim Tab-Wechsel (Plan 0025, E4).
  const viewToggle = (
    <ViewToggle
      options={DISCOVER_VIEWS}
      current={route.tab === "karte" ? "karte" : "entdecken"}
      onChange={(tab) => replace({ ...route, tab })}
      legend="Darstellung der Angebote"
    />
  );
  /*
   * Sortierung (Plan 0043, E4): nur in der Liste, rechts neben „Liste | Karte“, auch im Ladezustand (kein Springen).
   * Nach der Wahl beginnt die Liste oben mit dem ersten Schritt; der Fokus bleibt am Knopf (SortMenu).
   */
  const sortOptions: readonly SortOption<SortChoice>[] = [
    { value: "termine", title: SORT_TITLES.termine, sub: "was als Nächstes stattfindet" },
    { value: "neu", title: SORT_TITLES.neu, sub: "neueste zuerst" },
    {
      value: "nah",
      title: SORT_TITLES.nah,
      sub: nearSortSub(reachMode, origin),
    },
  ];
  const onSort = (value: SortChoice) => {
    const { sort: _old, ...rest } = route;
    replace(value === "termine" ? rest : { ...rest, sort: value });
    views.resetPage();
    window.scrollTo({ top: 0 });
  };
  const toggle =
    section === "entdecken" &&
    (route.tab === "entdecken" || route.tab === "karte" ? (
      <div className="view-tools">
        {viewToggle}
        <SortMenu options={sortOptions} current={route.sort ?? "termine"} plain="termine" onChange={onSort} />
      </div>
    ) : (
      viewToggle
    ));
  // Ohne site.json bliebe das Anbieter-Sheet beim Laden stehen, modal über der Fehlerseite (Arch-Review m3). Es öffnet
  // erst mit den Daten; `anbieter=` bleibt in der URL, „Nochmal versuchen“ öffnet es dann.
  const sheetProviderId = load.kind === "error" ? undefined : route.providerId;
  // Sichtbare Glocke: App-Chunk vorladen, damit ein Tipp Push synchron einschalten kann (Plan 0054, E5; ADR 0037)
  const bellVisible = currentSearch !== "" || section === "anbieter" || sheetProviderId !== undefined;
  useEffect(() => {
    if (bellVisible) preloadBell();
  }, [bellVisible]);
  const dialogOpen =
    sheet !== null || detailOffer !== undefined || placeSheet || sheetProviderId !== undefined || onboarding !== "aus";
  const limit = route.filter.reachLimit;
  const limitOn = limitActive(reachMode);
  // Wegzeit-Grenze und Zeitraum gelten nur in „Entdecken“, nicht im Tab „Anbieter“ (Plan 0055, E3, Review M2)
  const inProviders = section === "anbieter";
  const hint = section === "entdecken" && limit && limitHint(limit, reachMode);
  // gespeicherter Startpunkt + wegzeit=: Platzhalter statt ungefilterter Liste, bis die Wegzeit da ist (M7, Arch-Review
  // 0009, Befund 4). Die Karte zeigt solange alle Orte (bewusste Lücke, E11). Die Merkliste kennt keine Wegzeit-Grenze
  // und wartet nie (Plan 0025, E8).
  const listPending = section === "entdecken" && reachMode?.kind === "laedt" && limit !== undefined;
  // „Nächstgelegen“ wartet ebenso auf die Wegzeit, damit die Liste nicht nachträglich umsortiert (Plan 0043, E7). Nur
  // die Liste: Die Zahl der Statuszeile stimmt, und `finish.pending` des Onboardings hängt an `listPending`.
  const listWaits = listPending || (route.sort === "nah" && reachMode?.kind === "laedt");
  const askOrigin = route.sort === "nah" && !origin;
  /** „Zurücksetzen“: URL-Filter leer, Altersfilter wieder an – zurück auf den Standard (Plan 0021, E2) */
  const resetFilters = () => {
    setFilter(EMPTY_FILTER);
    views.setAgeOnly(true);
  };
  // Zurücksetzen nur mit aktiven URL-Filtern; fürs Alter gibt es „Auch unpassende zeigen“ (Plan 0021, E4).
  const resetIfActive = activeFilterCount(route.filter, { limitActive: limitOn }) > 0 ? resetFilters : undefined;
  // Im Tab „Anbieter“ zählen und fallen nur die Kategorien; die übrigen Filter bleiben für „Entdecken“ (Plan 0055, E3)
  const resetProviderFilter =
    activeFilterCount(providerFilter(route.filter), { limitActive: false }) > 0
      ? () => {
          setFilter({ ...route.filter, categories: [] });
          views.setAgeOnly(true);
        }
      : undefined;
  const shownUnfitCount = inProviders ? views.providerUnfitCount : unfitCount;
  // „Alle zeigen“ verschwindet nach dem Tipp: Fokus vorher auf die Statuszeile (Plan 0055, Review 2, m3)
  const showAll = () => {
    statusLine.current?.focus();
    if (route.tab === "anbieter") setProviderReset((n) => n + 1);
    else setMapReset((n) => n + 1);
  };
  /*
   * Beide Altersknöpfe verschwinden nach dem Tipp (Leerzustand bzw. Warnhinweis): Der Fokus geht vorher auf die
   * Statuszeile, sonst fiele er auf <body> (Muster wie LimitAction, Plan 0009, N2). Sie meldet die neue Zahl selbst.
   */
  const setAgeOnlyKeepFocus = (on: boolean) => {
    statusLine.current?.focus();
    views.setAgeOnly(on);
  };
  const ageEscape: AgeEscape | undefined =
    birthDate && ageOnly && shownUnfitCount > 0
      ? { label: ageLabel, onShow: () => setAgeOnlyKeepFocus(false) }
      : undefined;
  /*
   * Karte in „Entdecken“ (sichtbare Angebote) und auf der Merkliste (gemerkte, Plan 0025, E4). In „Entdecken“ startet
   * sie am Startpunkt (`followOrigin`, ADR 0039); Rückfall, „Alle zeigen“ und die Merkliste nutzen alle kommenden
   * Angebote (`views.map.cameraOffers`), nie die Merkliste selbst.
   */
  const mapPanel = (shown: readonly SiteOffer[], cardCtx: CardContext, followOrigin: boolean) =>
    views.map && (
      <MapPanel
        offers={shown}
        cameraOffers={views.map.cameraOffers}
        origin={origin}
        dark={theme.dark}
        ctx={cardCtx}
        toast={toast}
        onSheetOpen={setPlaceSheet}
        onInView={onMapInView}
        resetKey={mapReset}
        followOrigin={followOrigin}
      />
    );
  /*
   * Ende des Onboardings (E3, E9; Review H4): Cover und Dialog verschwinden im selben Commit wie der Tab-Wechsel
   * (`flushSync`), dann geht der Fokus auf die Statuszeile, die die Zahl ansagt (sie fehlt beim Laden und bei Fehler).
   */
  const endOnboarding = (kind: OnboardingEnd) => {
    if (kind !== "spaeter") saveOnboardingDone();
    flushSync(() => {
      setOnboarding("aus");
      if (kind === "fertig") replace({ ...route, tab: "entdecken" });
    });
    if (kind === "fertig") window.scrollTo({ top: 0 });
    (statusLine.current ?? activeTab.current)?.focus({ preventScroll: true });
  };
  const limitAction: LimitActionFor = (focusTarget) => (
    <LimitAction
      mode={reachMode}
      focusTarget={focusTarget}
      onPickOrigin={() => setSheet("origin")}
      onRetry={transit.retry}
    />
  );

  return (
    <div className="app">
      <Header ageLabel={ageLabel} onKid={() => setSheet("kid")} />
      {/* Sticker wirken auch in der Anbieterliste (Plan 0010, E2, E4) */}
      {(section === "entdecken" || section === "anbieter") && <Stickers filter={route.filter} onChange={setFilter} />}
      {/* Kosten, Anmeldung, Format, Wegzeit und Zeitraum beschreiben Termine, nicht Anbieter (Plan 0055, E3) */}
      {section === "entdecken" && (
        <QuickFilters
          filter={route.filter}
          limitActive={limitOn}
          onChange={setFilter}
          onOpenSheet={() => setSheet("filter")}
          sheetButton={filterButton}
          bell={
            currentSearch
              ? {
                  label: searchLabel(currentSearch),
                  subscribed: searchAbos.list.includes(currentSearch),
                  busy: bellBusy,
                  onToggle: onToggleSearch,
                }
              : undefined
          }
        />
      )}
      <main className="body">
        {/* Suche ganz oben, über der Statuszeile (Plan 0025, E3). Nur einmal gerendert, damit die Eingabe beim
            Übergang von „Lade …“ zu den Daten nicht neu eingehängt wird und den Fokus behält. */}
        {route.tab === "anbieter" && load.kind !== "error" && (
          <ProviderSearch query={providerQuery} onQuery={setProviderQuery} />
        )}
        {/* Anbieterkarte unter der Suche, über der Statuszeile (Plan 0055, Mockup C); lädt mit dem Tab (ADR 0038) */}
        {load.kind === "ready" && route.tab === "anbieter" && (
          <ProviderMapPanel
            generatedAt={load.data.generatedAt}
            offers={offers}
            visible={views.providerVisible}
            now={now}
            origin={origin}
            dark={theme.dark}
            saved={savedProviders}
            onToggleSaved={onToggleProvider}
            bellBusy={bellBusy}
            onOpenProvider={openProvider}
            onInView={setProviderView}
            onSheetOpen={setPlaceSheet}
            toast={toast}
            resetKey={providerReset}
          />
        )}
        {load.kind === "loading" && (
          <>
            <div className="status-row">
              <p className="status" role="status">
                Lade Angebote …
              </p>
              {toggle}
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="card placeholder" aria-hidden="true" />
            ))}
          </>
        )}
        {load.kind === "error" && (
          <div className="empty" role="alert">
            <b>Das hat nicht geklappt</b>
            {loadErrorText(load.reason)}
            <br />
            <button type="button" className="linkbtn" onClick={() => setAttempt((n) => n + 1)}>
              Nochmal versuchen
            </button>
          </div>
        )}
        {load.kind === "ready" && section !== "merkliste" && (
          <>
            <div className="status-row">
              {/* Lädt die Wegzeit zur Grenze, wäre die Zahl ungefiltert: unsichtbar, keine Ansage (M7). */}
              <p ref={statusLine} className={listPending ? "status pending" : "status"} role="status" tabIndex={-1}>
                {narrowed ? (
                  <span>
                    <span aria-hidden="true">
                      <b>{inViewCount}</b>
                      {inViewWords}
                    </span>
                    <span className="sr-only">{inViewAnnounce}</span>
                    {reachSuffix}
                  </span>
                ) : route.tab === "anbieter" ? (
                  <span>
                    <b>{providerCount}</b>
                    {providersWord}
                    {reachSuffix}
                  </span>
                ) : (
                  <span>
                    <b>{listCount}</b>
                    {listWords}
                    {reachSuffix}
                    {/* Ansage der Sortierung ohne sichtbare Änderung (Plan 0043, E4; Review 2, K3) */}
                    {route.sort && <span className="sr-only">. Sortiert nach {SORT_TITLES[route.sort]}</span>}
                  </span>
                )}
                {pwaNote && (
                  // eigene Zeile unter Zahl und Startpunkt (Plan 0011, E4; Plan 0020, E1); Text aus dem PWA-Kern
                  <span className="status-note">
                    <span className="sr-only">. </span>
                    {pwaNote}
                  </span>
                )}
              </p>
              {toggle}
              {narrowed && (
                <button type="button" className="linkbtn" onClick={showAll}>
                  Alle zeigen
                </button>
              )}
            </div>
            {hint && (
              // wegzeit= wirkt nicht (ohne Startpunkt, Fehler, außerhalb): Hinweis außerhalb der Status-Region (E11)
              <p className="status">
                {hint}
                {limitAction(statusLine)}
              </p>
            )}
            {birthDate && !ageOnly && shownUnfitCount > 0 && (
              // Altersfilter aus (Plan 0021, E3); ist er an, steht hier nichts zum Alter
              <p className="status age-warn">
                <Icon name="alert" size={18} />
                <span>{ageWarnText(shownUnfitCount, ageLabel)}</span>{" "}
                <button type="button" className="linkbtn" onClick={() => setAgeOnlyKeepFocus(true)}>
                  ausblenden
                </button>
              </p>
            )}
          </>
        )}
        {load.kind === "ready" && route.tab === "karte" && mapPanel(visible, discoverCtx, true)}
        {load.kind === "ready" && (route.tab === "entdecken" || route.tab === "karte") && (
          <>
            {askOrigin && (
              <>
                <div className="empty">
                  <b>Wovon aus gerechnet?</b>
                  Wähle einen Startpunkt, dann stehen die Angebote mit der kürzesten Wegzeit mit Bus & Bahn oben.
                  <span className="empty-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setSheet("origin");
                        setOriginFromPrompt(true);
                      }}
                    >
                      Startpunkt wählen
                    </button>
                  </span>
                </div>
                <p className="status">Bis dahin nach Terminen</p>
              </>
            )}
            {listWaits ? (
              <ListPending />
            ) : offersNarrowed && views.inView.length === 0 ? (
              // Ausschnitt ohne Angebote (Plan 0056, E5): „Alle zeigen“ wie in der Statuszeile
              <EmptyState icon="search" title="Hier ist gerade nichts">
                Im Kartenausschnitt gibt es gerade nichts.
                <br />
                <button type="button" className="linkbtn" onClick={showAll}>
                  Alle zeigen
                </button>
              </EmptyState>
            ) : (
              <ListView
                groups={page.groups}
                remaining={page.remaining}
                onMore={views.showMore}
                today={today}
                ctx={discoverCtx}
                hasData={offers.length > 0}
                onResetFilter={resetIfActive}
                age={ageEscape}
                openOnDay={ruleActive(route.filter)}
                origin={origin}
              />
            )}
            {/* erst mit der Liste: Sonst rutschte er beim Ersetzen des Platzhalters (CLS) */}
            {!listWaits && (
              <p className="stand">
                Datenstand: {standDate(load.data.generatedAt)} ·{" "}
                {/* dezent, Plan 0034, E3; zweiter Weg im Kind-Sheet */}
                <a href={`${import.meta.env.BASE_URL}${IMPRINT_PATH}`}>Impressum</a>
              </p>
            )}
          </>
        )}
        {load.kind === "ready" && route.tab === "anbieter" && (
          <ProviderPanel
            generatedAt={load.data.generatedAt}
            offers={offers}
            visible={views.providerVisible}
            now={now}
            view={providerView}
            onShowAll={showAll}
            reachOf={views.reachOf}
            reachMode={reachMode}
            query={providerQuery}
            onQuery={setProviderQuery}
            onOpenProvider={openProvider}
            onResetFilter={resetProviderFilter}
            age={ageEscape}
            saved={savedProviders}
            onToggleSaved={onToggleProvider}
            bellBusy={bellBusy}
          />
        )}
        {load.kind === "ready" && section === "merkliste" && (
          <SavedView
            items={saved}
            savedState={savedApi.state}
            visible={views.savedVisible}
            inView={views.savedInView}
            narrowed={route.tab === "merkliste-karte" && viewNarrows(mapView)}
            onShowAll={showAll}
            filter={savedFilter}
            filtered={views.savedFiltered}
            onFilter={setSavedFilter}
            quick={views.savedQuick}
            tab={route.tab === "merkliste-karte" || route.tab === "merkliste-kalender" ? route.tab : "merkliste"}
            onTab={(tab) => replace({ ...route, tab })}
            // Startseiten-Filter und Alter wirken auf der Merkliste nicht: Zurücksetzen meint den Merklisten-Filter,
            // einen Altersausweg gibt es nicht
            renderMap={(savedOffers) => mapPanel(savedOffers, ctx, false)}
            renderCalendar={(onResetSaved) =>
              views.savedCalendar && (
                <SavedCalendar
                  calendar={views.savedCalendar}
                  now={now}
                  today={today}
                  ctx={ctx}
                  onDiscover={discoverRange}
                  onResetFilter={onResetSaved}
                />
              )
            }
            generatedAt={load.data.generatedAt}
            birthDate={birthDate}
            ctx={ctx}
            onDiscover={() => onTab("entdecken")}
            onExported={say}
          />
        )}
      </main>
      <TabBar tab={section} savedCount={saved.length} onTab={onTab} currentRef={activeTab} />
      <Toast toast={dialogOpen ? NO_TOAST : toast} />

      <Overlays
        toast={toast}
        abos={{
          searches: searchAbos.list,
          providers: savedProviders,
          providerName: (id) => offers.find((o) => o.providerId === id)?.providerName,
          ready: load.kind === "ready",
          hasOrigin: origin !== undefined,
          removeSearch: searchAbos.remove,
          removeProvider: toggleSavedProvider,
        }}
        sheet={sheet}
        setSheet={setSheet}
        detailOffer={detailOffer}
        detailDay={detailDay}
        closeDetail={closeDetail}
        providerId={sheetProviderId}
        openProvider={openProvider}
        closeProvider={closeProvider}
        isProviderSaved={(id) => savedProviders.includes(id)}
        onToggleProvider={onToggleProvider}
        bellBusy={bellBusy}
        onUnknownProvider={dropProvider}
        generatedAt={load.kind === "ready" ? load.data.generatedAt : undefined}
        offers={offers}
        visible={inProviders ? views.providerVisible : visible}
        ctx={ctx}
        say={say}
        filter={route.filter}
        setFilter={setFilter}
        resultCount={visible.length}
        birthDate={birthDate}
        setBirthDate={setBirthDate}
        filterAge={birthDate ? { label: ageLabel, on: ageOnly, unfitCount, onChange: views.setAgeOnly } : undefined}
        resetFilters={resetFilters}
        theme={theme}
        today={today}
        originApi={originApi}
        transit={transit}
        limitAction={limitAction}
        kidFallback={originFromPrompt ? statusLine : filterButton}
        activeTab={activeTab}
        onIntro={() => {
          setSheet(null);
          setOnboarding("manuell");
        }}
      />
      {/* nach den Overlays: Im Modus „manuell“ schließt das Kind-Sheet im selben Commit (E3, Review 2, M-1) */}
      {onboarding !== "aus" && (
        <Onboarding
          data={load.kind === "ready" ? offers : load.kind}
          now={now}
          today={today}
          birthDate={birthDate}
          onBirthDate={setBirthDate}
          originApi={originApi}
          transit={transit}
          filter={route.filter}
          setFilter={setFilter}
          finish={{ count: visible.length, pending: listPending }}
          onEnd={endOnboarding}
        />
      )}
    </div>
  );
}
