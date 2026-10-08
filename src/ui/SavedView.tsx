/**
 * „Meine Merkliste“ (Plan 0003, E12; bis Plan 0022 „Mein Stickerheft“) mit Sammel-ICS aus dem Browser (ADR 0007).
 * Kopf nach Plan 0025, E3a: Umschalter Liste | Karte über die ganze Breite, Statuszeile mit rundem Export-Knopf (nur
 * in der Liste). Die Karte rendert App über `renderMap`, mit denselben Props wie in „Entdecken“.
 */
import type { ReactNode } from "react";
import { sessionFit } from "../domain/age.ts";
import { shownSession } from "../domain/agenda.ts";
import { collectionExport, upcomingSessionCount } from "../domain/saved.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { type ViewOption, ViewToggle } from "./Chrome.tsx";
import { collectionToast, EXPORT_UNAVAILABLE, exportLabel, savedMapStatusParts, savedStatusParts } from "./format.ts";
import { Icon } from "./icons.tsx";
import { download, type IcsExport, loadExport } from "./ics-export.ts";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";
import { LONG_TOAST_MS } from "./use-app-state.ts";

/** Darstellungen der Merkliste: Routenwerte (Plan 0025, E4) */
type SavedTab = "merkliste" | "merkliste-karte";

const VIEW_OPTIONS: readonly ViewOption<SavedTab>[] = [
  { value: "merkliste", label: "Liste" },
  { value: "merkliste-karte", label: "Karte" },
];

interface SavedViewProps {
  /** gemerkte Angebote mit kommendem Termin, nach dem angezeigten Termin sortiert (`savedOffers`) */
  offers: SiteOffer[];
  tab: SavedTab;
  onTab: (tab: SavedTab) => void;
  /** Orte der gemerkten Angebote (`views.map`), nur auf der Karte gebraucht */
  placeCount: number;
  /** Karte mit diesen Angeboten; nur aufgerufen, wenn mindestens eins da ist (keine Kacheln ohne Gemerktes, E5a) */
  renderMap: (offers: readonly SiteOffer[]) => ReactNode;
  generatedAt: SiteData["generatedAt"];
  /**
   * mit Geburtsdatum zählen bei regelmäßigen Angeboten nur die Termine, die zum Alter passen: in der Datei (Plan 0018,
   * E3), in der Statuszeile und am Termin der Karte (Plan 0028)
   */
  birthDate: string | undefined;
  ctx: CardContext;
  onDiscover: () => void;
  /** Toast nach dem Export; `ms` für lange Meldungen (Plan 0018, E4) */
  onExported: (message: string, ms?: number) => void;
}

export function SavedView({
  offers,
  tab,
  onTab,
  placeCount,
  renderMap,
  generatedAt,
  birthDate,
  ctx,
  onDiscover,
  onExported,
}: SavedViewProps) {
  const { items, count, missing } = collectionExport(offers, ctx.now, birthDate);
  const fits = sessionFit(birthDate);
  // Kontext erst im Tipp: Auch `icsContextFor` liegt im Lazy-Chunk (Plan 0010, E8 A).
  const exportAll = async () => {
    if (count === 0) {
      // Chunk trotzdem anfordern: Sein Request soll nicht verraten, ob etwas zum Alter passt (ADR 0018)
      void loadExport().catch(() => {});
      onExported("Keins der gemerkten Angebote passt zum Alter.", LONG_TOAST_MS);
      return;
    }
    let ics: IcsExport;
    try {
      ics = await loadExport();
    } catch {
      onExported(EXPORT_UNAVAILABLE);
      return;
    }
    const withCtx = items.map((i) => ({ ...i, ctx: ics.icsContextFor(i.offer, generatedAt) }));
    download(ics.icsForCollection(withCtx, "Zwergenplan – Merkliste"), "zwergenplan-merkliste.ics");
    onExported(collectionToast(count, missing), missing > 0 ? LONG_TOAST_MS : undefined);
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
          <ViewToggle options={VIEW_OPTIONS} current={tab} onChange={onTab} legend="Darstellung der Merkliste" full />
          <div className="status-row">
            <p className="status" role="status" tabIndex={-1}>
              <StatusText offers={offers} tab={tab} placeCount={placeCount} now={ctx.now} birthDate={birthDate} />
            </p>
            {tab === "merkliste" && (
              <button
                type="button"
                className="iconbtn exportbtn"
                aria-label={exportLabel(offers.length, false)}
                title={exportLabel(offers.length, false)}
                onClick={() => void exportAll()}
              >
                <Icon name="calendarPlus" />
              </button>
            )}
          </div>
          {tab === "merkliste-karte"
            ? renderMap(offers)
            : offers.map((offer) => {
                const session = shownSession(offer, ctx.now, undefined, fits);
                return session && <OfferCard key={offer.id} item={{ offer, session }} ctx={ctx} dated />;
              })}
        </>
      )}
    </>
  );
}

/** „5 Angebote mit insgesamt 28 Terminen gemerkt“ bzw. auf der Karte „5 Angebote an 5 Orten gemerkt“ (E3a) */
function StatusText({
  offers,
  tab,
  placeCount,
  now,
  birthDate,
}: {
  offers: readonly SiteOffer[];
  tab: SavedTab;
  placeCount: number;
  now: Date;
  birthDate: string | undefined;
}) {
  const [a, aWords, b, bWords] =
    tab === "merkliste-karte"
      ? savedMapStatusParts(offers.length, placeCount)
      : savedStatusParts(offers.length, upcomingSessionCount(offers, now, birthDate));
  return (
    <span>
      <b>{a}</b>
      {aWords}
      <b>{b}</b>
      {bWords}
    </span>
  );
}
