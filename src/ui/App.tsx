/** Zwergenplan (Plan 0003): Laden, URL-Zustand, Ansichten, Overlays. Rechenlogik kommt aus src/domain. */
import { useCallback, useEffect, useRef, useState } from "react";
import { loadSiteData } from "../data/site.ts";
import { ageInMonths } from "../domain/age.ts";
import { EMPTY_FILTER, type FilterState } from "../domain/filter.ts";
import type { Place } from "../domain/places.ts";
import { type Tab, tabSection } from "../domain/route.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";
import { CalendarView } from "./CalendarView.tsx";
import { Header, QuickFilters, Stickers, TabBar, ViewToggle } from "./Chrome.tsx";
import { DetailContent } from "./DetailDialog.tsx";
import { Dialog } from "./Dialog.tsx";
import { ageChipLabel, distanceNote, mapStatusParts, plural, reachLimitLabel, standDate } from "./format.ts";
import { KidSheet } from "./KidSheet.tsx";
import { ListView } from "./ListView.tsx";
import { MapPanel } from "./MapPanel.tsx";
import type { CardContext } from "./OfferCard.tsx";
import { PlaceSheet } from "./PlaceSheet.tsx";
import { SavedView } from "./SavedView.tsx";
import { FilterSheet } from "./Sheets.tsx";
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

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: SiteData };

const NO_OFFERS: SiteOffer[] = [];

export function App() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { route, replace, openDetail, closeDetail } = useRoute();
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

  // „origin“: Kind-Sheet, geöffnet über „Startpunkt wählen“ (Fokus auf die Stadtteil-Auswahl)
  const [sheet, setSheet] = useState<"filter" | "kid" | "origin" | null>(null);
  const [detailDay, setDetailDay] = useState<string>();
  // Orts-Sheet: Sitzungszustand, nie in der URL (Plan 0005, E5)
  const [placeKey, setPlaceKey] = useState<string>();
  const [animate, setAnimate] = useState(false);
  // Fokus-Rückweg des Kind-Sheets: „Startpunkt wählen“ im Umkreis-Hinweis verschwindet mit der Wahl.
  const filterButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // `attempt` startet das Laden neu („Nochmal versuchen“)
    void attempt;
    setLoad({ kind: "loading" });
    loadSiteData().then(
      (data) => setLoad({ kind: "ready", data }),
      (e: unknown) => setLoad({ kind: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  }, [attempt]);

  // Erst nach dem ersten Rendern mit Daten dürfen Kacheln sich einkleben (LCP, Plan 0003 E6).
  useEffect(() => {
    if (load.kind === "ready") setAnimate(true);
  }, [load.kind]);

  const offers = load.kind === "ready" ? load.data.offers : NO_OFFERS;
  const views = useOfferViews({ offers, route, birthDate, ageOnly, savedIds, now, origin });
  const { visible, hiddenCount, showUnfit, page, calendar, saved, detailOffer } = views;

  // Unbekanntes Angebot in der URL (abgelaufen, Tippfehler): Parameter entfernen.
  useEffect(() => {
    if (load.kind === "ready" && route.offerId && !detailOffer) closeDetail();
  }, [load.kind, route.offerId, detailOffer, closeDetail]);

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
    onToggleSave,
    onOpen: (offer, day) => {
      setDetailDay(day);
      openDetail(offer.id);
    },
  };
  const place = views.places.find((p) => p.key === placeKey);
  // Ort mit einem Angebot: gleich das Detail (Plan 0005, E6)
  const openPlace = (p: Place<SiteOffer>) => {
    const [only, ...more] = p.offers;
    if (only && more.length === 0) ctx.onOpen(only);
    else setPlaceKey(p.key);
  };
  const [mapOffers, offersWord, mapPlaces, placesWord] = mapStatusParts(visible.length, views.places.length);
  const ageLabel = ageChipLabel(birthDate ? ageInMonths(birthDate, now) : undefined);
  // Liste und Karte gehören zu „Entdecken“ (Plan 0005, E5)
  const section = tabSection(route.tab);
  const dialogOpen = sheet !== null || detailOffer !== undefined || place !== undefined;

  return (
    <div className="app">
      <Header
        ageLabel={ageLabel}
        dark={theme.dark}
        onKid={() => setSheet("kid")}
        onToggleTheme={() => theme.setChoice(theme.dark ? "hell" : "dunkel")}
      />
      {section === "entdecken" && <Stickers filter={route.filter} onChange={setFilter} />}
      {route.tab !== "merkliste" && (
        <QuickFilters
          filter={route.filter}
          hasOrigin={origin !== undefined}
          onChange={setFilter}
          onOpenSheet={() => setSheet("filter")}
          sheetButton={filterButton}
        />
      )}
      {section === "entdecken" && (
        <ViewToggle
          map={route.tab === "karte"}
          onMap={(map) => replace({ ...route, tab: map ? "karte" : "entdecken" })}
        />
      )}
      <main className="body">
        {load.kind === "loading" && (
          <>
            <p className="status" role="status">
              Lade Angebote …
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="card placeholder" aria-hidden="true" />
            ))}
          </>
        )}
        {load.kind === "error" && (
          <div className="empty" role="alert">
            <b>Das hat nicht geklappt</b>
            {load.message}
            <br />
            <button type="button" className="linkbtn" onClick={() => setAttempt((n) => n + 1)}>
              Nochmal versuchen
            </button>
          </div>
        )}
        {load.kind === "ready" && route.tab !== "merkliste" && (
          <>
            <p className="status" role="status">
              {route.tab === "karte" ? (
                <span>
                  <b>{mapOffers}</b>
                  {offersWord}
                  <b>{mapPlaces}</b>
                  {placesWord}
                </span>
              ) : (
                <span>
                  <b>{visible.length}</b> {visible.length === 1 ? "Angebot" : "Angebote"} ab heute
                </span>
              )}
              {origin && (
                // eigene Zeile ohne „·“: Sie brach bei 320–390 px ohnehin um, und der Punkt stand dann verwaist
                // vorn. Der Punkt nur für Screenreader trennt die beiden Sätze in der Ansage.
                <span className="status-note">
                  <span className="sr-only">. </span>
                  {distanceNote(origin)}
                </span>
              )}
            </p>
            {route.filter.reachLimit && !origin && (
              // Geteilter Link mit ?umkreis= ohne Startpunkt: Der Filter wirkt nicht (Plan 0004, E7).
              <p className="status">
                „{reachLimitLabel(route.filter.reachLimit)}“ braucht einen Startpunkt.
                <button type="button" className="linkbtn" onClick={() => setSheet("origin")}>
                  Startpunkt wählen
                </button>
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
            <ListView
              groups={page.groups}
              remaining={page.remaining}
              onMore={views.showMore}
              today={today}
              ctx={ctx}
              hasData={offers.length > 0}
              onResetFilter={() => setFilter(EMPTY_FILTER)}
            />
            <p className="stand">Datenstand: {standDate(load.data.generatedAt)}</p>
          </>
        )}
        {load.kind === "ready" && views.startCamera && (
          <MapPanel
            places={views.places}
            start={views.startCamera}
            origin={origin}
            dark={theme.dark}
            reachOf={views.reachOf}
            hasData={offers.length > 0}
            onPlace={openPlace}
            onPickOrigin={() => setSheet("origin")}
            onMapCenter={(center) => {
              if (!originApi.setMapCenter(center)) say("Die Kartenmitte liegt außerhalb von Nürnberg.");
            }}
            onResetFilter={() => setFilter(EMPTY_FILTER)}
          />
        )}
        {load.kind === "ready" && route.tab === "kalender" && (
          <CalendarView
            index={calendar.index}
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
      <TabBar tab={section} savedCount={saved.length} onTab={onTab} />
      <Toast message={dialogOpen ? "" : toast} />

      <Dialog
        open={detailOffer !== undefined}
        onClose={closeDetail}
        label={detailOffer?.title ?? "Angebot"}
        className="detail"
        toast={toast}
      >
        {detailOffer && (
          <DetailContent
            key={detailOffer.id}
            offer={detailOffer}
            now={now}
            day={detailDay}
            birthDate={birthDate}
            origin={origin}
            reach={views.reachOf(detailOffer)}
            saved={savedIds.includes(detailOffer.id)}
            onToggleSave={onToggleSave}
            onClose={closeDetail}
            onIcs={say}
          />
        )}
      </Dialog>
      <Dialog
        open={place !== undefined}
        onClose={() => setPlaceKey(undefined)}
        label={place?.names.join(" / ") ?? "Ort"}
        className="sheet"
        toast={toast}
      >
        {place && <PlaceSheet place={place} origin={origin} ctx={ctx} onClose={() => setPlaceKey(undefined)} />}
      </Dialog>
      <Dialog open={sheet === "filter"} onClose={() => setSheet(null)} label="Filter" className="sheet" toast={toast}>
        <FilterSheet
          filter={route.filter}
          onChange={setFilter}
          resultCount={visible.length}
          hasOrigin={origin !== undefined}
          onPickOrigin={() => setSheet("origin")}
          onClose={() => setSheet(null)}
        />
      </Dialog>
      <Dialog
        open={sheet === "kid" || sheet === "origin"}
        onClose={() => setSheet(null)}
        label="Kind und Einstellungen"
        className="sheet"
        toast={toast}
        fallbackFocus={filterButton}
      >
        <KidSheet
          birthDate={birthDate}
          onBirthDate={setBirthDate}
          ageOnly={ageOnly}
          onAgeOnly={setAgeOnly}
          theme={theme.choice}
          onTheme={theme.setChoice}
          today={today}
          origin={originApi}
          focusOrigin={sheet === "origin"}
          onClose={() => setSheet(null)}
        />
      </Dialog>
    </div>
  );
}
