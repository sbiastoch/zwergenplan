/** „Meine Merkliste“ (Plan 0003, E12; bis Plan 0022 „Mein Stickerheft“) mit Sammel-ICS aus dem Browser (ADR 0007). */
import { nextSession } from "../domain/agenda.ts";
import { collectionSessions } from "../domain/saved.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { plural } from "./format.ts";
import { Icon } from "./icons.tsx";
import { download, type IcsExport, loadExport } from "./ics-export.ts";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";

interface SavedViewProps {
  offers: SiteOffer[];
  generatedAt: SiteData["generatedAt"];
  ctx: CardContext;
  onDiscover: () => void;
  onExported: (message: string) => void;
}

export function SavedView({ offers, generatedAt, ctx, onDiscover, onExported }: SavedViewProps) {
  const items = offers.map((offer) => ({ offer, sessions: collectionSessions(offer, ctx.now) }));
  const sessionCount = items.reduce((sum, i) => sum + i.sessions.length, 0);
  // Kontext erst im Tipp: Auch `icsContextFor` liegt im Lazy-Chunk (Plan 0010, E8 A).
  const exportAll = async () => {
    let ics: IcsExport;
    try {
      ics = await loadExport();
    } catch {
      // Chromium behält einen gescheiterten import() (auch des Vorladens): Nur ein Neuladen hilft sicher, die
      // Merkliste liegt im localStorage und übersteht es (Arch-Review Paket 0, Befund 1).
      onExported("Export gerade nicht möglich – mit Netz die Seite neu laden und nochmal tippen.");
      return;
    }
    const withCtx = items.map((i) => ({ ...i, ctx: ics.icsContextFor(i.offer, generatedAt) }));
    download(ics.icsForCollection(withCtx, "Zwergenplan – Merkliste"), "zwergenplan-merkliste.ics");
    onExported(`Kalenderdatei mit ${plural(sessionCount, "Termin", "Terminen")} geladen`);
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
          <p className="small">
            {offers.length} gemerkt · {plural(sessionCount, "Termin", "Termine")} in einer .ics-Datei · Kurse immer
            komplett
          </p>
          {offers.map((offer) => {
            const session = nextSession(offer, ctx.now);
            return session && <OfferCard key={offer.id} item={{ offer, session }} ctx={ctx} dated />;
          })}
        </>
      )}
    </>
  );
}
