/**
 * Wegzeit-Tabelle laden (Plan 0009, E9; ADR 0011): nur `fetch` vom eigenen Origin, für alle gleich. Kein
 * Laufzeit-Import aus src/domain (ADR 0010 bleibt); prüfen und dekodieren macht `decodeTransitTable`.
 * Wann geladen wird, entscheidet `useTransit` (src/ui/use-transit.ts), nie die Wahl eines Startpunkts.
 */
import type { TransitTableFile } from "../domain/transit-types.ts";

/** Gemeinsames Zeitlimit für Tabelle (Abruf und Lesen) und Rechenlogik (E9) */
export const TRANSIT_TIMEOUT_MS = 8000;

/** Abhängigkeiten von `loadTransit`, wie `SiteEnv`: Im Unit-Test stehen hier Stubs. */
export interface TransitEnv {
  fetch: (url: string, init: { signal: AbortSignal; cache: RequestCache }) => Promise<Response>;
  timeoutMs: number;
}

const browserEnv = (): TransitEnv => ({
  // zur Aufrufzeit lesen und ohne `this` des Env-Objekts rufen (sonst „Illegal invocation“)
  fetch: (url, init) => globalThis.fetch(url, init),
  timeoutMs: TRANSIT_TIMEOUT_MS,
});

/** Ergebnis beider Ladewege; `undefined` heißt gescheitert, auch nach dem Zeitlimit. */
export interface TransitLoad<L> {
  logic: L | undefined;
  file: TransitTableFile | undefined;
}

/**
 * Lädt Tabelle und Rechenlogik (`loadLogic`, der Lazy-Chunk aus use-transit.ts) parallel, unter **einem**
 * Zeitlimit: Hängt der Chunk, endet das Laden trotzdem (Arch-Review 0009, Befund 3). `retry` („Nochmal laden“)
 * umgeht den HTTP-Cache, sonst käme eine veraltete `wegzeit.json` wieder aus dem Cache (Befund 2). Wirft nie.
 */
export async function loadTransit<L>(
  loadLogic: () => Promise<L>,
  retry: boolean,
  env: TransitEnv = browserEnv(),
): Promise<TransitLoad<L>> {
  const controller = new AbortController();
  const { signal } = controller;
  const expired = new Promise<undefined>((resolve) => signal.addEventListener("abort", () => resolve(undefined)));
  const timer = setTimeout(() => controller.abort(), env.timeoutMs);
  const table = async (): Promise<TransitTableFile> => {
    const res = await env.fetch(`${import.meta.env.BASE_URL}data/wegzeit.json`, {
      signal,
      cache: retry ? "reload" : "default",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Build-Artefakt ohne Zod im Client: `decodeTransitTable` prüft Version, Längen und Spalten (E8).
    return await res.json();
  };
  try {
    const [logic, file] = await Promise.all([
      Promise.race([loadLogic().catch(() => undefined), expired]),
      table().catch(() => undefined),
    ]);
    return { logic, file };
  } finally {
    clearTimeout(timer);
  }
}
