/**
 * Lader des ICS-Codes `src/domain/ics.ts` (Lazy-Chunk assets/export/, Plan 0010, E8 A) und Download im Browser: für
 * die Sammeldatei der Merkliste (ADR 0007) und für regelmäßige Reihen passend zum Alter (ADR 0018). Bis Plan 0018 lag
 * der Lader in SavedView.tsx; hier teilen ihn Merkliste und Detail (Plan 0018, E5).
 */
import type { CollectionItem, IcsContext, IcsSource } from "../domain/ics-types.ts";

/**
 * ICS-Code aus `src/domain/ics.ts`, strukturell beschrieben: Das Modul ist ein Lazy-Chunk (assets/export/, Plan 0010,
 * E8 A), auch Typen kommen nicht statisch von dort (`ics-only-lazy`); sie stehen in `ics-types.ts`.
 */
export interface IcsExport {
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
export function loadExport(): Promise<IcsExport> {
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

/**
 * Lädt `ics` als Datei `filename` herunter, über einen kurz eingehängten Hilfslink. `container` nimmt ihn auf: Bei
 * offenem modalem `<dialog>` ist `body` inert, das Detail übergibt deshalb ein Element im Dialog (Plan 0018, E2).
 */
export function download(ics: string, filename: string, container: HTMLElement = document.body) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  container.append(a);
  a.click();
  a.remove();
  // Erst später freigeben: Manche Browser lesen die Datei asynchron.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
