/** „Meine Merkliste“ (Plan 0003, E12; bis Plan 0022 „Mein Stickerheft“) mit Sammel-ICS aus dem Browser (ADR 0007). */
import { nextSession } from "../domain/agenda.ts";
import type { CollectionItem, IcsContext, IcsSource } from "../domain/ics-types.ts";
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

/**
 * ICS-Code aus `src/domain/ics.ts`, strukturell beschrieben: Das Modul ist ein Lazy-Chunk (assets/export/, Plan 0010,
 * E8 A), auch Typen kommen nicht statisch von dort (`ics-only-lazy`); sie stehen in `ics-types.ts`.
 */
interface IcsExport {
  // Property-Syntax: Parameter werden streng geprüft, eine Änderung in ics-types.ts fällt hier auf
  icsContextFor: (offer: IcsSource, generatedAt: string) => IcsContext;
  icsForCollection: (items: readonly CollectionItem[], name: string) => string;
}

/** Einziger Lader von `src/domain/ics.ts` (`ics-entry-only`); async mit `await import(…)` wie in Lazy.tsx. */
async function importExport(): Promise<IcsExport> {
  return await import("../domain/ics.ts");
}

let pending: Promise<IcsExport> | undefined;
/** Ein Ladevorgang für Vorladen und Export; nach einem Fehlschlag versucht der nächste Aufruf es neu. */
function loadExport(): Promise<IcsExport> {
  pending ??= importExport().catch((e: unknown) => {
    pending = undefined;
    throw e;
  });
  return pending;
}

/**
 * Lädt den Export-Code nach dem ersten Rendern im Leerlauf vor (App), für alle gleich: Ohne Service Worker wäre der
 * Export offline sonst weg, und das `await` im Tipp löst so praktisch sofort auf (iOS lässt den Download dann noch
 * als Folge des Tipps gelten; prüft der Browser-Review). Gibt das Aufräumen für `useEffect` zurück.
 */
export function preloadExportWhenIdle(): () => void {
  const run = () => void loadExport().catch(() => {});
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(run, 1000);
  return () => clearTimeout(id);
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
    download(ics.icsForCollection(withCtx, "Zwergenplan – Merkliste"));
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
