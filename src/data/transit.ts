/**
 * Wegzeit-Tabelle und Linien laden (Plan 0009, E9; Plan 0012, E9; ADR 0011, ADR 0015): nur `fetch` vom eigenen
 * Origin, für alle gleich. Kein Laufzeit-Import aus src/domain (ADR 0010 bleibt); prüfen und dekodieren machen
 * `decodeTransitTable` und `decodeTransitLines`. Wann geladen wird, entscheidet `useTransit`
 * (src/ui/use-transit.ts), nie die Wahl eines Startpunkts.
 */
import type { TransitLinesFile, TransitTableFile } from "../domain/transit-types.ts";

/** Gemeinsames Zeitlimit für Tabelle (Abruf und Lesen) und Rechenlogik (E9); die Linien haben ein eigenes gleich langes */
export const TRANSIT_TIMEOUT_MS = 8000;

/** Abhängigkeiten von `loadTransit`, wie `SiteEnv`: Im Unit-Test stehen hier Stubs. */
export interface TransitEnv {
  fetch: (
    url: string,
    init: { signal: AbortSignal; cache: RequestCache; priority?: RequestPriority },
  ) => Promise<Response>;
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
  /**
   * Ausgang des Imports: `zeitlimit` ist kein Fehlschlag, der Import läuft weiter und ein neuer Versuch kann ihn
   * noch bekommen (Plan 0009, N1).
   */
  chunk: ChunkOutcome;
  /**
   * Linien (Plan 0012, E9): angefordert erst, wenn Tabelle und Logik da sind, sonst `undefined`. Wirft nie; die
   * Minuten warten nicht darauf.
   */
  lines: Promise<TransitLinesFile | undefined>;
}

export type ChunkOutcome = "ok" | "fehler" | "zeitlimit";

type Settled<L> = { value: L | undefined; chunk: Exclude<ChunkOutcome, "zeitlimit"> };

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
  const expired = new Promise<"zeitlimit">((resolve) => signal.addEventListener("abort", () => resolve("zeitlimit")));
  const logic = loadLogic().then(
    (value): Settled<L> => ({ value, chunk: "ok" }),
    (): Settled<L> => ({ value: undefined, chunk: "fehler" }),
  );
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
    const [settled, file] = await Promise.all([Promise.race([logic, expired]), table().catch(() => undefined)]);
    if (settled === "zeitlimit") return { logic: undefined, file, chunk: settled, lines: Promise.resolve(undefined) };
    // Ohne Logik gibt es keine Wegzeit, ohne Tabelle keine Zellen: dann keine Linien-Anfrage (Review W2, H10)
    const lines =
      settled.value !== undefined && file !== undefined ? loadLines(retry, env) : Promise.resolve(undefined);
    return { logic: settled.value, file, chunk: settled.chunk, lines };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `linien.json` mit niedriger Priorität, eigenem Abbruch und eigenem Zeitlimit ab der Anfrage; das `finally` von
 * `loadTransit` räumt diesen Timer nicht ab (Plan 0012, E9). Wirft nie.
 */
function loadLines(retry: boolean, env: TransitEnv): Promise<TransitLinesFile | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.timeoutMs);
  const request = async (): Promise<TransitLinesFile> => {
    const res = await env.fetch(`${import.meta.env.BASE_URL}data/linien.json`, {
      signal: controller.signal,
      cache: retry ? "reload" : "default",
      priority: "low",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Build-Artefakt ohne Zod: `decodeTransitLines` prüft Version, Kennung und Ebenen (Plan 0012, E8).
    return await res.json();
  };
  return request()
    .catch(() => undefined)
    .finally(() => clearTimeout(timer));
}
