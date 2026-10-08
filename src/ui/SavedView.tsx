/**
 * „Meine Merkliste“ (Plan 0003, E12; bis Plan 0022 „Mein Stickerheft“) mit Sammel-ICS aus dem Browser (ADR 0007) und
 * dem Abschnitt „Gemerkte Anbieter“ (Plan 0025, E3).
 */
import { useRef } from "react";
import { nextSession } from "../domain/agenda.ts";
import type { CollectionItem, IcsContext, IcsSource } from "../domain/ics-types.ts";
import { collectionSessions, type SavedProvider, type SavedProviderRow } from "../domain/saved.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { plural, savedProviderLine, savedStatusParts } from "./format.ts";
import { Icon } from "./icons.tsx";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, HeartButton, OfferCard } from "./OfferCard.tsx";

interface SavedViewProps {
  /** gemerkte Angebote mit kommendem Termin */
  offers: SiteOffer[];
  /** gemerkte Anbieter als Zeilen (`savedProviderRows`), ungefiltert (Plan 0025, E3) */
  providers: SavedProviderRow[];
  generatedAt: SiteData["generatedAt"];
  ctx: CardContext;
  onDiscover: () => void;
  onExported: (message: string) => void;
  /** öffnet das Anbieter-Sheet (`anbieter=<id>`); erst das lädt Chunk und Katalog (Plan 0025, E3) */
  onOpenProvider: (providerId: string) => void;
  /** Herz in der Anbieterzeile: entfernt den Anbieter (Toast in der App) */
  onToggleProvider: (entry: SavedProvider) => void;
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

export function SavedView(props: SavedViewProps) {
  const { offers, providers, generatedAt, ctx, onDiscover, onExported, onOpenProvider, onToggleProvider } = props;
  const title = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const providersTitle = useRef<HTMLHeadingElement>(null);
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

  /*
   * Erst fokussieren, dann entfernen (Muster aus Plan 0021, E3): Die Zeile mit dem Herz verschwindet. Ziel ist die
   * Überschrift des Abschnitts; geht der letzte Anbieter, die Statuszeile; ist danach gar nichts mehr gemerkt (kein
   * Angebot, Leerzustand ohne Statuszeile), der Seitentitel.
   */
  const removeProvider = (entry: SavedProvider) => {
    const target = providers.length > 1 ? providersTitle : offers.length > 0 ? status : title;
    target.current?.focus();
    onToggleProvider(entry);
  };
  const [count, offersWords, providerCount, providerWord] = savedStatusParts(
    offers.length,
    offers.length,
    providers.length,
  );

  return (
    <>
      <h2 ref={title} className="ptitle" tabIndex={-1}>
        Meine Merkliste
      </h2>
      {offers.length === 0 && providers.length === 0 ? (
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
          <div className="status-row">
            <p ref={status} className="status" role="status" tabIndex={-1}>
              <span>
                <b>{count}</b>
                {offersWords}
                {providerCount !== undefined && (
                  <>
                    <b>{providerCount}</b>
                    {providerWord}
                  </>
                )}
              </span>
            </p>
          </div>
          {offers.length === 0 ? (
            // nur Anbieter gemerkt (Plan 0025, E5a)
            <p className="saved-hint">Noch keine Angebote gemerkt – tipp auf das Herz bei einem Angebot.</p>
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
          {providers.length > 0 && (
            // unter den Angeboten: eine Adressliste zum Weitersuchen, keine Terminliste (E3)
            <>
              <h3 ref={providersTitle} className="saved-providers-title" tabIndex={-1}>
                Gemerkte Anbieter
              </h3>
              <ul className="saved-providers">
                {providers.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={row.upcoming > 0 ? "place" : "place idle"}
                      onClick={() => onOpenProvider(row.id)}
                    >
                      <b className="provider-name" lang="de">
                        {row.name}
                      </b>
                      <span>{savedProviderLine(row)}</span>
                    </button>
                    <HeartButton name={row.name} saved onToggle={() => removeProvider(row)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}
