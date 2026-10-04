/** Merkliste „Mein Stickerheft“ (Plan 0003, E12) mit Sammel-ICS aus dem Browser (ADR 0007). */
import { nextSession } from "../domain/agenda.ts";
import { icsContextFor, icsForCollection } from "../domain/ics.ts";
import { collectionSessions } from "../domain/saved.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { plural } from "./format.ts";
import { Icon } from "./icons.tsx";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";

interface SavedViewProps {
  offers: SiteOffer[];
  generatedAt: SiteData["generatedAt"];
  ctx: CardContext;
  onDiscover: () => void;
  onExported: (message: string) => void;
}

function download(ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "zwergenplan-merkliste.ics";
  document.body.append(a);
  a.click();
  a.remove();
  // Erst später freigeben: Manche Browser lesen die Datei asynchron.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function SavedView({ offers, generatedAt, ctx, onDiscover, onExported }: SavedViewProps) {
  const items = offers.map((offer) => ({
    offer,
    sessions: collectionSessions(offer, ctx.now),
    ctx: icsContextFor(offer, generatedAt),
  }));
  const sessionCount = items.reduce((sum, i) => sum + i.sessions.length, 0);

  return (
    <>
      <h2 className="ptitle">Mein Stickerheft</h2>
      {offers.length === 0 ? (
        <EmptyState icon="heart" title="Hier klebt noch nichts">
          Tipp auf das Herz bei einem Angebot. Hier sammelst du deine Favoriten und holst sie mit einem Tipp in deinen
          Kalender.
          <br />
          <button type="button" className="linkbtn" onClick={onDiscover}>
            Angebote entdecken
          </button>
        </EmptyState>
      ) : (
        <>
          <button
            type="button"
            className="btn primary wide"
            onClick={() => {
              download(icsForCollection(items, "Zwergenplan – Merkliste"));
              onExported(`Kalenderdatei mit ${plural(sessionCount, "Termin", "Terminen")} geladen`);
            }}
          >
            <Icon name="calendarPlus" />
            Alle in den Kalender
          </button>
          <p className="small">
            {plural(offers.length, "Sticker", "Sticker")} · {plural(sessionCount, "Termin", "Termine")} in einer
            .ics-Datei · Kurse immer komplett
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
