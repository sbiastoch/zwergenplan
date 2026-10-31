/**
 * „Meine Merkliste“ (Plan 0003, E12; bis Plan 0022 „Mein Stickerheft“) mit Sammel-ICS aus dem Browser (ADR 0007).
 * Kopf nach Plan 0025, E3a: Umschalter Liste | Karte | Kalender, in der Liste mit Sortier-Knopf daneben (Plan 0057, E6),
 * Filterzeile wie auf der Startseite (Plan 0057, E5), Statuszeile mit rundem Export-Knopf (Liste und Kalender, Plan 0057,
 * E9). Liste, Karte und Kalender rendert App über `renderList`, `renderMap` bzw. `renderCalendar`.
 */
import { type ReactNode, type RefObject, useMemo } from "react";
import type { Occurrence } from "../domain/agenda.ts";
import type { SavedTab } from "../domain/route.ts";
import { collectionExport, type SavedListChip, type SavedState } from "../domain/saved.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { type ViewOption, ViewToggle } from "./Chrome.tsx";
import {
  collectionToast,
  EXPORT_UNAVAILABLE,
  exportLabel,
  inViewStatusParts,
  NO_FIXED_FITS,
  NOTHING_FIXED,
  savedFilteredEmpty,
  savedFilterStatusParts,
  savedMapStatusParts,
  savedStatusParts,
} from "./format.ts";
import { Icon } from "./icons.tsx";
import { download, type IcsExport, loadExport } from "./ics-export.ts";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";
import { LONG_TOAST_MS, type Say } from "./use-app-state.ts";
import { ANNOUNCE_DELAY_MS, useSettled } from "./use-settled.ts";

const VIEW_OPTIONS: readonly ViewOption<SavedTab>[] = [
  { value: "merkliste", label: "Liste" },
  { value: "merkliste-karte", label: "Karte" },
  { value: "merkliste-kalender", label: "Kalender" },
];

interface SavedViewProps {
  /** gemerkte Angebote mit kommendem Termin, je mit dem angezeigten Termin und danach sortiert (`savedOffers`) */
  items: readonly Occurrence<SiteOffer>[];
  /** Stufen der Merkliste: Der Export nimmt nur fest Eingeplantes (Plan 0057, E4) */
  savedState: SavedState;
  /** dieselben nach dem Merklisten-Filter dieser Darstellung (`views.savedVisible`, E6) */
  visible: readonly Occurrence<SiteOffer>[];
  /** dieselben im Kartenausschnitt (`views.savedInView`, Plan 0056, E5): die Liste unter der Karte */
  inView: readonly Occurrence<SiteOffer>[];
  /** Der Kartenausschnitt blendet Gemerktes aus: Statuszeile „im Kartenausschnitt“ mit „Alle zeigen“ */
  narrowed: boolean;
  onShowAll: () => void;
  /** Merklisten-Filter wirkt in dieser Darstellung (`views.savedFiltered`) */
  filtered: boolean;
  /** der einzige wirksame Filter ist dieser Schnellfilter der Liste: Die Statuszeile erklärt ihn (Plan 0058, Nachtrag) */
  statusChip?: SavedListChip | undefined;
  /**
   * ganzen Filter zurücksetzen, auch einen im Kalender ausgeblendeten Zeitraum. Der Knopf verschwindet danach: App
   * setzt den Fokus vorher auf die Statuszeile (`status`), sie meldet die neue Zahl selbst (Muster aus Plan 0021, E3).
   */
  onResetFilter: () => void;
  /** Filterzeile wie auf der Startseite (`QuickFilters`, Plan 0057, E5) */
  filters: ReactNode;
  /** Sortier-Knopf neben dem Umschalter, nur in der Liste (Plan 0057, E6) */
  sortMenu: ReactNode;
  /** Ansage der Sortierung in der Liste ohne sichtbare Änderung, wie auf der Startseite (Plan 0043, E4; Plan 0057, E6) */
  sortNote?: string | undefined;
  /** Statuszeile: Fokus-Ziel von App (Zurücksetzen, Startpunkt, „Alle zeigen“) */
  status: RefObject<HTMLParagraphElement | null>;
  /** Wegzeit lädt zur Grenze: Die Zahl stünde erst mit Tabelle fest, die Statuszeile ist unsichtbar (Plan 0057, E7a) */
  pending: boolean;
  /** Hinweise unter der Statuszeile (Wegzeit-Grenze ohne Wirkung, E7a) */
  notes: ReactNode;
  tab: SavedTab;
  onTab: (tab: SavedTab) => void;
  /**
   * Karte mit diesen Angeboten; nur aufgerufen, wenn mindestens eins zum Filter passt (keine Kacheln ohne Gemerktes,
   * E5a)
   */
  renderMap: (offers: readonly SiteOffer[]) => ReactNode;
  /** Kalender der gemerkten Termine (E5); „Filter zurücksetzen“ nur, wenn der Filter dort wirkt */
  renderCalendar: (onResetFilter: (() => void) | undefined) => ReactNode;
  /** Liste der Merkliste nach der Sortierung (E6, E7a): `ListView`, Platzhalter oder „Wovon aus gerechnet?“ */
  renderList: () => ReactNode;
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
  savedState,
  visible,
  inView,
  narrowed,
  onShowAll,
  filtered,
  statusChip,
  onResetFilter,
  filters,
  sortMenu,
  status,
  sortNote,
  pending,
  notes,
  tab,
  onTab,
  renderMap,
  renderCalendar,
  renderList,
  generatedAt,
  birthDate,
  ctx,
  onDiscover,
  onExported,
}: SavedViewProps) {
  const offers = savedItems.map((item) => item.offer);
  // stabile Identität: Die Karte meldet sonst bei jedem Render einen neuen Ausschnitt (Endlosschleife, Plan 0056, S4)
  const shown = useMemo(() => visible.map((item) => item.offer), [visible]);
  // Statuszeile: gemerkte Angebote ohne passenden Termin, gleich welche Stufe
  const { missing: unfitting } = collectionExport(offers, ctx.now, birthDate);
  const { items, count, missing, tentative } = collectionExport(offers, ctx.now, birthDate, savedState);
  const fixedCount = offers.length - tentative;
  // Export mit allen fest eingeplanten (Plan 0057, E4), auch ausgeblendeten; der Name sagt es mit Filter
  const exportName = exportLabel(fixedCount, filtered);
  // Kontext erst im Tipp: Auch `icsContextFor` liegt im Lazy-Chunk (Plan 0010, E8 A).
  const exportAll = async () => {
    if (count === 0) {
      // Chunk trotzdem anfordern: Sein Request soll weder verraten, ob etwas zum Alter passt (ADR 0018), noch, ob
      // etwas fest eingeplant ist (ADR 0040)
      void loadExport().catch(() => {});
      if (fixedCount === 0) onExported(NOTHING_FIXED, LONG_TOAST_MS, "hint");
      else onExported(NO_FIXED_FITS, LONG_TOAST_MS, "hint");
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
    const long = missing > 0 || tentative > 0;
    onExported(collectionToast(count, missing, tentative), long ? LONG_TOAST_MS : undefined);
  };
  const reset = onResetFilter;
  const calendar = tab === "merkliste-kalender";
  // Ausschnitt der Merklisten-Karte (Plan 0056, E5): Ansage erst, wenn die Karte ruht, wie im Tab „Anbieter“ (N8)
  const mapNarrowed = tab === "merkliste-karte" && narrowed;
  const [, inViewWords] = inViewStatusParts(inView.length, "gemerkte");
  const inViewAnnounce = useSettled(mapNarrowed ? `${inView.length}${inViewWords}` : "", ANNOUNCE_DELAY_MS);
  const showAll = () => {
    status.current?.focus();
    onShowAll();
  };

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
          <div className="saved-tools">
            <ViewToggle options={VIEW_OPTIONS} current={tab} onChange={onTab} legend="Darstellung der Merkliste" full />
            {tab === "merkliste" && sortMenu}
          </div>
          <div className="saved-filters">{filters}</div>
          <div className="status-row">
            <p ref={status} className={pending ? "status pending" : "status"} role="status" tabIndex={-1}>
              {mapNarrowed ? (
                <span>
                  <span aria-hidden="true">
                    <b>{inView.length}</b>
                    {inViewWords}
                  </span>
                  <span className="sr-only">{inViewAnnounce}</span>
                </span>
              ) : (
                <StatusText
                  parts={statusParts({ offers, shown, filtered, tab, missing: unfitting, chip: statusChip })}
                />
              )}
              {tab === "merkliste" && sortNote && <span className="sr-only">. Sortiert nach {sortNote}</span>}
            </p>
            {mapNarrowed && (
              <button type="button" className="linkbtn" onClick={showAll}>
                Alle zeigen
              </button>
            )}
            {/* in Liste und Kalender derselbe Knopf, derselbe Chunk (Plan 0057, E9) */}
            {tab !== "merkliste-karte" && (
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
          {notes}
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
              {tab === "merkliste-karte" && (
                <>
                  {renderMap(shown)}
                  {/* Liste unter der Karte, im Ausschnitt (Plan 0056, E5) */}
                  {inView.length === 0 ? (
                    <EmptyState icon="search" title="Hier ist gerade nichts">
                      Im Kartenausschnitt liegt nichts von deiner Merkliste.
                      <br />
                      <button type="button" className="linkbtn" onClick={showAll}>
                        Alle zeigen
                      </button>
                    </EmptyState>
                  ) : (
                    inView.map((item) => <OfferCard key={item.offer.id} item={item} ctx={ctx} dated numbered />)
                  )}
                </>
              )}
              {calendar && renderCalendar(filtered ? reset : undefined)}
              {tab === "merkliste" && renderList()}
            </>
          )}
        </>
      )}
    </>
  );
}

/**
 * Texte der Statuszeile (E3a; nur die Anzahl, ADR 0039, Punkt 1): ohne Filter „5 Angebote gemerkt“, mit Filter „2 von 5
 * gemerkten Angeboten passen“, auf der Karte „2 von 5 gemerkten Angeboten“.
 */
function statusParts({
  offers,
  shown,
  filtered,
  tab,
  missing,
  chip,
}: {
  offers: readonly SiteOffer[];
  shown: readonly SiteOffer[];
  filtered: boolean;
  tab: SavedTab;
  /** gemerkte Angebote ohne passenden Termin (`collectionExport`), wie im Export-Toast genannt */
  missing: number;
  chip: SavedListChip | undefined;
}): StatusParts {
  const total = filtered ? offers.length : undefined;
  if (tab === "merkliste-karte") return savedMapStatusParts(shown.length, total);
  if (filtered) return savedFilterStatusParts(shown.length, offers.length, chip);
  return savedStatusParts(offers.length, missing);
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
