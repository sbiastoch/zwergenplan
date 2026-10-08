/**
 * „Meine Merkliste“ (Plan 0003, E12; bis Plan 0022 „Mein Stickerheft“) mit Sammel-ICS aus dem Browser (ADR 0007).
 * Kopf nach Plan 0025, E3a: Umschalter Liste | Karte | Kalender über die ganze Breite, Filterzeile (E6), Statuszeile mit
 * rundem Export-Knopf (nur in der Liste). Karte und Kalender rendert App über `renderMap` bzw. `renderCalendar`.
 */
import { type ReactNode, useRef } from "react";
import type { Occurrence } from "../domain/agenda.ts";
import type { DateRange } from "../domain/date-range.ts";
import { collectionExport, EMPTY_SAVED_FILTER, type SavedFilter, upcomingSessionCount } from "../domain/saved.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { type ViewOption, ViewToggle } from "./Chrome.tsx";
import {
  collectionToast,
  EXPORT_UNAVAILABLE,
  exportLabel,
  savedFilteredEmpty,
  savedFilterStatusParts,
  savedMapStatusParts,
  savedStatusParts,
} from "./format.ts";
import { Icon } from "./icons.tsx";
import { download, type IcsExport, loadExport } from "./ics-export.ts";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";
import { SavedFilters } from "./SavedFilters.tsx";
import { LONG_TOAST_MS, type Say } from "./use-app-state.ts";

/** Darstellungen der Merkliste: Routenwerte (Plan 0025, E4) */
type SavedTab = "merkliste" | "merkliste-karte" | "merkliste-kalender";

const VIEW_OPTIONS: readonly ViewOption<SavedTab>[] = [
  { value: "merkliste", label: "Liste" },
  { value: "merkliste-karte", label: "Karte" },
  { value: "merkliste-kalender", label: "Kalender" },
];

interface SavedViewProps {
  /** gemerkte Angebote mit kommendem Termin, je mit dem angezeigten Termin und danach sortiert (`savedOffers`) */
  items: readonly Occurrence<SiteOffer>[];
  /** dieselben nach dem Merklisten-Filter dieser Darstellung (`views.savedVisible`, E6) */
  visible: readonly Occurrence<SiteOffer>[];
  /** Merklisten-Filter (E6) und ob er in dieser Darstellung wirkt (`views.savedFiltered`) */
  filter: SavedFilter;
  filtered: boolean;
  onFilter: (filter: SavedFilter) => void;
  /** Schnellwahlen „ab …“ (E7) */
  quick: readonly { month: string; range: DateRange }[];
  tab: SavedTab;
  onTab: (tab: SavedTab) => void;
  /** Orte der passenden gemerkten Angebote (`views.map`), nur auf der Karte gebraucht */
  placeCount: number;
  /**
   * Karte mit diesen Angeboten; nur aufgerufen, wenn mindestens eins zum Filter passt (keine Kacheln ohne Gemerktes,
   * E5a)
   */
  renderMap: (offers: readonly SiteOffer[], onResetFilter: () => void) => ReactNode;
  /** Kalender der gemerkten Termine (E5); „Filter zurücksetzen“ nur, wenn Format oder Anmeldung wirkt */
  renderCalendar: (onResetFilter: (() => void) | undefined) => ReactNode;
  generatedAt: SiteData["generatedAt"];
  /**
   * mit Geburtsdatum zählen bei regelmäßigen Angeboten nur die Termine, die zum Alter passen: in der Datei (Plan 0018,
   * E3), in der Statuszeile und am Termin der Karte (Plan 0028)
   */
  birthDate: string | undefined;
  ctx: CardContext;
  onDiscover: () => void;
  /** Toast nach dem Export; `ms` für lange Meldungen (Plan 0018, E4) */
  onExported: Say;
}

export function SavedView({
  items: savedItems,
  visible,
  filter,
  filtered,
  onFilter,
  quick,
  tab,
  onTab,
  placeCount,
  renderMap,
  renderCalendar,
  generatedAt,
  birthDate,
  ctx,
  onDiscover,
  onExported,
}: SavedViewProps) {
  const status = useRef<HTMLParagraphElement>(null);
  const offers = savedItems.map((item) => item.offer);
  const shown = visible.map((item) => item.offer);
  const { items, count, missing } = collectionExport(offers, ctx.now, birthDate);
  // Export immer mit allen gemerkten (E9); der Name sagt es, wenn der Filter in dieser Darstellung etwas ausblendet
  const exportName = exportLabel(offers.length, filtered);
  // Kontext erst im Tipp: Auch `icsContextFor` liegt im Lazy-Chunk (Plan 0010, E8 A).
  const exportAll = async () => {
    if (count === 0) {
      // Chunk trotzdem anfordern: Sein Request soll nicht verraten, ob etwas zum Alter passt (ADR 0018)
      void loadExport().catch(() => {});
      onExported("Keins der gemerkten Angebote passt zum Alter.", LONG_TOAST_MS, "hint");
      return;
    }
    let ics: IcsExport;
    try {
      ics = await loadExport();
    } catch {
      onExported(EXPORT_UNAVAILABLE, undefined, "hint");
      return;
    }
    const withCtx = items.map((i) => ({ ...i, ctx: ics.icsContextFor(i.offer, generatedAt) }));
    download(ics.icsForCollection(withCtx, "Zwergenplan – Merkliste"), "zwergenplan-merkliste.ics");
    onExported(collectionToast(count, missing), missing > 0 ? LONG_TOAST_MS : undefined);
  };
  /*
   * Ganzen Filter zurücksetzen, auch einen im Kalender ausgeblendeten Zeitraum (E6). Der Knopf verschwindet danach: Der
   * Fokus geht vorher auf die Statuszeile, sie meldet die neue Zahl selbst (Muster aus Plan 0021, E3).
   */
  const reset = () => {
    status.current?.focus();
    onFilter(EMPTY_SAVED_FILTER);
  };
  const calendar = tab === "merkliste-kalender";

  return (
    <>
      <h2 className="ptitle">Meine Merkliste</h2>
      {offers.length === 0 ? (
        <EmptyState icon="heart" title="Noch nichts gemerkt">
          Tipp auf das Herz bei einem Angebot. Hier sammelst du deine Favoriten und holst sie mit einem Tipp in deinen
          Kalender.
          <br />
          <button type="button" className="linkbtn" onClick={onDiscover}>
            Angebote entdecken
          </button>
        </EmptyState>
      ) : (
        <>
          <ViewToggle options={VIEW_OPTIONS} current={tab} onChange={onTab} legend="Darstellung der Merkliste" full />
          <SavedFilters
            filter={filter}
            quick={quick}
            showRange={!calendar}
            onChange={onFilter}
            onReset={filtered ? reset : undefined}
          />
          <div className="status-row">
            <p ref={status} className="status" role="status" tabIndex={-1}>
              <StatusText
                parts={statusParts({ offers, shown, filtered, tab, placeCount, now: ctx.now, birthDate, missing })}
              />
            </p>
            {tab === "merkliste" && (
              <button
                type="button"
                className="iconbtn exportbtn"
                aria-label={exportName}
                title={exportName}
                onClick={() => void exportAll()}
              >
                <Icon name="calendarPlus" />
              </button>
            )}
          </div>
          {!calendar && shown.length === 0 ? (
            // Filter blendet alle aus (E5a): in Liste und Karte derselbe Leerzustand, ohne Karte und damit ohne Kacheln
            <EmptyState icon="search" title="Nichts, was zu deinem Filter passt">
              {savedFilteredEmpty(offers.length)}
              <br />
              <button type="button" className="linkbtn" onClick={reset}>
                Filter zurücksetzen
              </button>
            </EmptyState>
          ) : (
            <>
              {tab === "merkliste-karte" && renderMap(shown, reset)}
              {calendar && renderCalendar(filtered ? reset : undefined)}
              {tab === "merkliste" &&
                visible.map((item) => <OfferCard key={item.offer.id} item={item} ctx={ctx} dated />)}
            </>
          )}
        </>
      )}
    </>
  );
}

/**
 * Texte der Statuszeile (E3a): ohne Filter „5 Angebote mit insgesamt 28 Terminen gemerkt“ bzw. auf der Karte „5 Angebote
 * an 5 Orten gemerkt“; mit Filter „2 von 5 gemerkten Angeboten passen“ bzw. „… an 2 Orten“.
 */
function statusParts({
  offers,
  shown,
  filtered,
  tab,
  placeCount,
  now,
  birthDate,
  missing,
}: {
  offers: readonly SiteOffer[];
  shown: readonly SiteOffer[];
  filtered: boolean;
  tab: SavedTab;
  placeCount: number;
  now: Date;
  birthDate: string | undefined;
  /** gemerkte Angebote ohne passenden Termin (`collectionExport`), wie im Export-Toast genannt */
  missing: number;
}): StatusParts {
  const total = filtered ? offers.length : undefined;
  if (tab === "merkliste-karte") return savedMapStatusParts(shown.length, placeCount, total);
  if (filtered) return savedFilterStatusParts(shown.length, offers.length);
  return savedStatusParts(offers.length, upcomingSessionCount(offers, now, birthDate), missing);
}

type StatusParts = [number, string] | [number, string, number, string];

/** Zahlen fett, Wörter normal */
function StatusText({ parts: [a, aWords, b, bWords] }: { parts: StatusParts }) {
  return (
    <span>
      <b>{a}</b>
      {aWords}
      {b !== undefined && <b>{b}</b>}
      {bWords}
    </span>
  );
}
