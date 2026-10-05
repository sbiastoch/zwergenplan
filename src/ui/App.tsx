/** Zwergenplan (Plan 0003): Laden, URL-Zustand, Ansichten, Overlays. Rechenlogik kommt aus src/domain. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LoadFailure, loadSiteData, SiteLoadError } from "../data/site.ts";
import { ageInMonths } from "../domain/age.ts";
import { activeFilterCount, EMPTY_FILTER, type FilterState } from "../domain/filter.ts";
import { placeKey } from "../domain/place-key.ts";
import { countProviders } from "../domain/provider-count.ts";
import { type Tab, tabSection } from "../domain/route.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";
import { CalendarView } from "./CalendarView.tsx";
import { Header, QuickFilters, Stickers, TabBar, ViewToggle } from "./Chrome.tsx";
import {
  ageChipLabel,
  limitHint,
  loadErrorText,
  mapStatusParts,
  plural,
  providerStatusParts,
  reachNote,
  standDate,
} from "./format.ts";
import { ListPending, ListView } from "./ListView.tsx";
import { MapPanel } from "./MapPanel.tsx";
import type { CardContext } from "./OfferCard.tsx";
import { Overlays, type SheetKind } from "./Overlays.tsx";
import { ProviderPanel } from "./ProviderPanel.tsx";
import { preloadExportWhenIdle, SavedView } from "./SavedView.tsx";
import { LimitAction, type LimitActionFor } from "./Sheets.tsx";
import { Toast } from "./Toast.tsx";
import {
  useAgeOnly,
  useBirthDate,
  useNow,
  useOrigin,
  useRoute,
  useSaved,
  useTheme,
  useToast,
} from "./use-app-state.ts";
import { useOfferViews } from "./use-offer-views.ts";
import { limitActive, useTransit } from "./use-transit.ts";

type LoadState = { kind: "loading" } | { kind: "error"; reason: LoadFailure } | { kind: "ready"; data: SiteData };

const NO_OFFERS: SiteOffer[] = [];

export function App() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { route, replace, openDetail, closeDetail, openProvider, closeProvider } = useRoute();
  const [birthDate, setBirthDateStored] = useBirthDate();
  const [ageOnly, setAgeOnly] = useAgeOnly();
  const [savedIds, toggleSaved] = useSaved();
  const theme = useTheme();
  const [toast, say] = useToast();
  // erneuert sich im offenen Tab, höchstens einmal pro Minute (Plan 0007, E2)
  const now = useNow();
  const today = berlinIsoDate(now);
  // Startpunkt der Entfernung: Standort nur im Speicher, gespeichert höchstens die Stadtteil-ID (Plan 0004, E3)
  const originApi = useOrigin();
  const { origin } = originApi;

  const [sheet, setSheetState] = useState<SheetKind>(null);
  const [detailDay, setDetailDay] = useState<string>();
  // Orts-Sheet offen (karte/MapScreen.tsx): Der Seiten-Toast schweigt dann wie bei jedem Modal.
  const [placeSheet, setPlaceSheet] = useState(false);
  const [animate, setAnimate] = useState(false);
  // Suchtext der Anbieterliste: übersteht den Tab-Wechsel, nie in der URL (Plan 0010, E5)
  const [providerQuery, setProviderQuery] = useState("");
  // Fokus-Rückweg des Kind-Sheets: „Startpunkt wählen“ im Wegzeit-Hinweis verschwindet mit der Wahl.
  const filterButton = useRef<HTMLButtonElement>(null);
  // Fokus-Rückweg des Details: Die Kachel, die es geöffnet hat, kann beim Schließen fehlen (Plan 0008, E11).
  const activeTab = useRef<HTMLButtonElement>(null);
  /** Fokus-Ziel nach „Nochmal laden“ unter der Statuszeile (Plan 0009, N2) */
  const statusLine = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // `attempt` startet das Laden neu („Nochmal versuchen“)
    void attempt;
    setLoad({ kind: "loading" });
    loadSiteData().then(
      (data) => setLoad({ kind: "ready", data }),
      // Die Fehlerart kennt nur src/data; ein unbekannter Fehler zeigt nie seinen Rohtext (Plan 0008, E5).
      (e: unknown) => setLoad({ kind: "error", reason: e instanceof SiteLoadError ? e.reason : "server" }),
    );
  }, [attempt]);

  // Erst nach dem ersten Rendern mit Daten dürfen Kacheln sich einkleben (LCP, Plan 0003 E6).
  useEffect(() => {
    if (load.kind === "ready") setAnimate(true);
  }, [load.kind]);
  // Export-Code der Merkliste erst nach dem ersten Rendern mit Daten im Leerlauf vorladen (Plan 0010, E8 A)
  const dataReady = load.kind === "ready";
  useEffect(() => (dataReady ? preloadExportWhenIdle() : undefined), [dataReady]);

  const offers = load.kind === "ready" ? load.data.offers : NO_OFFERS;
  // Orte der Seite: Die Wegzeit-Tabelle muss zu ihnen passen (E8). Erst mit site.json bekannt.
  const placeKeys = useMemo(
    () => (load.kind === "ready" ? new Set(load.data.offers.map((o) => placeKey(o.venue.geo))) : undefined),
    [load],
  );
  // Wegzeit (Plan 0009, E9–E11): lädt beim Start nur mit gespeichertem Stadtteil, sonst erst auf Anlass
  const transit = useTransit(origin, placeKeys);
  const { mode: reachMode, want } = transit;
  const views = useOfferViews({ offers, route, birthDate, ageOnly, savedIds, now, reach: transit.reach });
  const { visible, hiddenCount, showUnfit, page, calendar, saved, detailOffer } = views;

  // Die Karte ist eine Startpunkt-Oberfläche („Kartenmitte als Startpunkt“): Öffnen lädt die Tabelle (E9, Auslöser 3).
  useEffect(() => {
    if (route.tab === "karte") want();
  }, [route.tab, want]);
  // Das Kind-Sheet auch (Auslöser 2). Nie die Wahl selbst: Ab da entsteht kein Request.
  const setSheet = useCallback(
    (next: SheetKind) => {
      if (next === "kid" || next === "origin") want();
      setSheetState(next);
    },
    [want],
  );

  // Unbekanntes Angebot in der URL (abgelaufen, Tippfehler): Parameter entfernen.
  useEffect(() => {
    if (load.kind === "ready" && route.offerId && !detailOffer) closeDetail();
  }, [load.kind, route.offerId, detailOffer, closeDetail]);

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
    views.setShowUnfit(false);
  };
  const onTab = (tab: Tab) => {
    replace({ ...route, tab });
    window.scrollTo({ top: 0 });
  };
  const onToggleSave = useCallback(
    (offer: SiteOffer) =>
      say(
        toggleSaved(offer.id)
          ? "Eingeklebt – liegt jetzt in deinem Stickerheft"
          : "Sticker abgelöst – nicht mehr gemerkt",
      ),
    [say, toggleSaved],
  );

  const ctx: CardContext = {
    now,
    animate,
    isSaved: (id) => savedIds.includes(id),
    isUnfit: (id) => views.unfitIds.has(id),
    reachOf: views.reachOf,
    reachPending: reachMode?.kind === "laedt",
    onToggleSave,
    onOpen: (offer, day) => {
      setDetailDay(day);
      openDetail(offer.id);
    },
  };
  const [mapOffers, offersWord, mapPlaces, placesWord] = mapStatusParts(visible.length, views.map?.placeCount ?? 0);
  // „5 Anbieter mit 8 Angeboten“: so viele aktive Zeilen zeigt die Liste im Chunk (Plan 0010, E4)
  const [providerCount, providersWord, providerOffers, providerOffersWord] = providerStatusParts(
    countProviders(visible),
    visible.length,
  );
  const ageLabel = ageChipLabel(birthDate ? ageInMonths(birthDate, now) : undefined);
  // Liste und Karte gehören zu „Entdecken“ (Plan 0005, E5)
  const section = tabSection(route.tab);
  // Liste | Karte steht rechts neben der Statuszeile und bricht bei wenig Platz darunter (Plan 0005, E5).
  const toggle = section === "entdecken" && (
    <ViewToggle map={route.tab === "karte"} onMap={(map) => replace({ ...route, tab: map ? "karte" : "entdecken" })} />
  );
  const dialogOpen = sheet !== null || detailOffer !== undefined || placeSheet || route.providerId !== undefined;
  const limit = route.filter.reachLimit;
  const limitOn = limitActive(reachMode);
  const hint = limit && limitHint(limit, reachMode);
  // gespeicherter Stadtteil + wegzeit=: Platzhalter statt ungefilterter Liste bzw. ungefiltertem Kalender, bis die
  // Wegzeit da ist (M7, Arch-Review 0009, Befund 4). Die Karte zeigt solange alle Orte (bewusste Lücke, E11).
  const listPending = reachMode?.kind === "laedt" && limit !== undefined;
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
      <Header
        ageLabel={ageLabel}
        dark={theme.dark}
        onKid={() => setSheet("kid")}
        onToggleTheme={() => theme.setChoice(theme.dark ? "hell" : "dunkel")}
      />
      {/* Sticker wirken auch in der Anbieterliste (Plan 0010, E2, E4) */}
      {(section === "entdecken" || section === "anbieter") && <Stickers filter={route.filter} onChange={setFilter} />}
      {route.tab !== "merkliste" && (
        <QuickFilters
          filter={route.filter}
          limitActive={limitOn}
          onChange={setFilter}
          onOpenSheet={() => setSheet("filter")}
          sheetButton={filterButton}
        />
      )}
      <main className="body">
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
        {load.kind === "ready" && route.tab !== "merkliste" && (
          <>
            <div className="status-row">
              {/* Lädt die Wegzeit zur Grenze, wäre die Zahl ungefiltert: unsichtbar, keine Ansage (M7). */}
              <p ref={statusLine} className={listPending ? "status pending" : "status"} role="status" tabIndex={-1}>
                {route.tab === "karte" ? (
                  <span>
                    <b>{mapOffers}</b>
                    {offersWord}
                    <b>{mapPlaces}</b>
                    {placesWord}
                  </span>
                ) : route.tab === "anbieter" ? (
                  <span>
                    <b>{providerCount}</b>
                    {providersWord}
                    <b>{providerOffers}</b>
                    {providerOffersWord}
                  </span>
                ) : (
                  <span>
                    <b>{visible.length}</b> {visible.length === 1 ? "Angebot" : "Angebote"} ab heute
                  </span>
                )}
                {origin && reachMode && (
                  // eigene Zeile ohne „·“: Sie brach bei 320–390 px ohnehin um, und der Punkt stand dann verwaist
                  // vorn. Der Punkt nur für Screenreader trennt die beiden Sätze in der Ansage. Beim Laden steht
                  // der endgültige Text unsichtbar: Die Höhe stimmt, die Live-Region sagt nichts (E11).
                  <span className={reachMode.kind === "laedt" ? "status-note pending" : "status-note"}>
                    <span className="sr-only">. </span>
                    {reachNote(reachMode, origin)}
                  </span>
                )}
              </p>
              {toggle}
            </div>
            {hint && (
              // wegzeit= wirkt nicht (ohne Startpunkt, Fehler, außerhalb): Hinweis außerhalb der Status-Region (E11)
              <p className="status">
                {hint}
                {limitAction(statusLine)}
              </p>
            )}
            {hiddenCount > 0 && (
              <p className="status">
                {plural(hiddenCount, "passt", "passen")} nicht zu {ageLabel}
                <button type="button" className="linkbtn" onClick={() => views.setShowUnfit(!showUnfit)}>
                  {showUnfit ? "ausblenden" : "trotzdem zeigen"}
                </button>
              </p>
            )}
          </>
        )}
        {load.kind === "ready" && route.tab === "entdecken" && (
          <>
            {listPending ? (
              <ListPending />
            ) : (
              <ListView
                groups={page.groups}
                remaining={page.remaining}
                onMore={views.showMore}
                today={today}
                ctx={ctx}
                hasData={offers.length > 0}
                onResetFilter={() => setFilter(EMPTY_FILTER)}
              />
            )}
            {/* erst mit der Liste: Sonst rutschte er beim Ersetzen des Platzhalters (CLS) */}
            {!listPending && <p className="stand">Datenstand: {standDate(load.data.generatedAt)}</p>}
          </>
        )}
        {load.kind === "ready" && views.map && (
          <MapPanel
            offers={visible}
            cameraOffers={views.map.cameraOffers}
            origin={origin}
            reach={transit.reach}
            dark={theme.dark}
            hasData={offers.length > 0}
            ctx={ctx}
            toast={toast}
            onSheetOpen={setPlaceSheet}
            onPickOrigin={() => setSheet("origin")}
            onMapCenter={(center) => {
              if (!originApi.setMapCenter(center)) say("Die Kartenmitte liegt außerhalb des Großraums Nürnberg.");
            }}
            onResetFilter={() => setFilter(EMPTY_FILTER)}
          />
        )}
        {load.kind === "ready" && route.tab === "kalender" && listPending && <ListPending />}
        {load.kind === "ready" && route.tab === "kalender" && !listPending && (
          <CalendarView
            index={calendar.index}
            allIndex={calendar.allIndex}
            now={now}
            today={today}
            lastDay={calendar.lastDay}
            dataEnd={calendar.dataEnd}
            endedToday={calendar.endedToday}
            day={calendar.day}
            onDay={calendar.setDay}
            monthOpen={calendar.monthOpen}
            onMonthOpen={calendar.setMonthOpen}
            ctx={ctx}
            // nur mit aktivem Filter: Blendet allein das Alter aus, hilft Zurücksetzen nicht (Plan 0008, E12)
            onResetFilter={
              activeFilterCount(route.filter, { limitActive: limitOn }) > 0 ? () => setFilter(EMPTY_FILTER) : undefined
            }
          />
        )}
        {load.kind === "ready" && route.tab === "anbieter" && (
          <ProviderPanel
            generatedAt={load.data.generatedAt}
            offers={offers}
            visible={visible}
            now={now}
            reachOf={views.reachOf}
            reachMode={reachMode}
            query={providerQuery}
            onQuery={setProviderQuery}
            onOpenProvider={openProvider}
            onResetFilter={
              activeFilterCount(route.filter, { limitActive: limitOn }) > 0 ? () => setFilter(EMPTY_FILTER) : undefined
            }
          />
        )}
        {load.kind === "ready" && route.tab === "merkliste" && (
          <SavedView
            offers={saved}
            generatedAt={load.data.generatedAt}
            ctx={ctx}
            onDiscover={() => onTab("entdecken")}
            onExported={say}
          />
        )}
      </main>
      <TabBar tab={section} savedCount={saved.length} onTab={onTab} currentRef={activeTab} />
      <Toast message={dialogOpen ? "" : toast} />

      <Overlays
        toast={toast}
        sheet={sheet}
        setSheet={setSheet}
        detailOffer={detailOffer}
        detailDay={detailDay}
        closeDetail={closeDetail}
        providerId={route.providerId}
        openProvider={openProvider}
        closeProvider={closeProvider}
        onUnknownProvider={dropProvider}
        generatedAt={load.kind === "ready" ? load.data.generatedAt : undefined}
        offers={offers}
        visible={visible}
        ctx={ctx}
        say={say}
        filter={route.filter}
        setFilter={setFilter}
        resultCount={visible.length}
        birthDate={birthDate}
        setBirthDate={setBirthDate}
        ageOnly={ageOnly}
        setAgeOnly={setAgeOnly}
        theme={theme}
        today={today}
        originApi={originApi}
        transit={transit}
        limitAction={limitAction}
        filterButton={filterButton}
        activeTab={activeTab}
      />
    </div>
  );
}
