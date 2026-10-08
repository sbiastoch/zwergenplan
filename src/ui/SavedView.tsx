/** „Meine Merkliste“ (Plan 0003, E12; bis Plan 0022 „Mein Stickerheft“) mit Sammel-ICS aus dem Browser (ADR 0007). */
import { nextSession } from "../domain/agenda.ts";
import { collectionExport } from "../domain/saved.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { collectionToast, EXPORT_UNAVAILABLE, savedExportNote } from "./format.ts";
import { Icon } from "./icons.tsx";
import { download, type IcsExport, loadExport } from "./ics-export.ts";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";
import { LONG_TOAST_MS } from "./use-app-state.ts";

interface SavedViewProps {
  offers: SiteOffer[];
  generatedAt: SiteData["generatedAt"];
  /** mit Geburtsdatum kommen regelmäßige Angebote nur passend zum Alter in die Datei (Plan 0018, E3) */
  birthDate: string | undefined;
  ctx: CardContext;
  onDiscover: () => void;
  /** Toast nach dem Export; `ms` für lange Meldungen (Plan 0018, E4) */
  onExported: (message: string, ms?: number) => void;
}

export function SavedView({ offers, generatedAt, birthDate, ctx, onDiscover, onExported }: SavedViewProps) {
  const { items, count, missing } = collectionExport(offers, ctx.now, birthDate);
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
          <button type="button" className="btn primary wide" onClick={() => void exportAll()}>
            <Icon name="calendarPlus" />
            Alle in den Kalender
          </button>
          <p className="small">{savedExportNote(offers.length, count, birthDate !== undefined)}</p>
          {offers.map((offer) => {
            const session = nextSession(offer, ctx.now);
            return session && <OfferCard key={offer.id} item={{ offer, session }} ctx={ctx} dated />;
          })}
        </>
      )}
    </>
  );
}
