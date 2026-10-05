/**
 * Wegzeit-Tabelle laden (Plan 0009, E9; ADR 0011): nur `fetch` vom eigenen Origin, für alle gleich. Kein
 * Laufzeit-Import aus src/domain (ADR 0010 bleibt); prüfen und dekodieren macht `decodeTransitTable`.
 * Wann geladen wird, entscheidet `useTransit` (src/ui/use-transit.ts), nie die Wahl eines Startpunkts.
 */
import type { TransitTableFile } from "../domain/transit-types.ts";

/** Zeitlimit für Abruf und Lesen der Antwort (E9) */
export const TRANSIT_TIMEOUT_MS = 8000;

/** Abhängigkeiten von `loadTransitTable`, wie `SiteEnv`: Im Unit-Test stehen hier Stubs. */
export interface TransitEnv {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  timeoutMs: number;
}

const browserEnv = (): TransitEnv => ({
  // zur Aufrufzeit lesen und ohne `this` des Env-Objekts rufen (sonst „Illegal invocation“)
  fetch: (url, init) => globalThis.fetch(url, init),
  timeoutMs: TRANSIT_TIMEOUT_MS,
});

/** Wirft bei Netzfehler, HTTP-Fehler, kaputtem JSON und nach dem Zeitlimit. */
export async function loadTransitTable(env: TransitEnv = browserEnv()): Promise<TransitTableFile> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Wegzeit-Tabelle: Zeitlimit")), env.timeoutMs);
  try {
    const res = await env.fetch(`${import.meta.env.BASE_URL}data/wegzeit.json`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Wegzeit-Tabelle: HTTP ${res.status}`);
    // Build-Artefakt ohne Zod im Client: `decodeTransitTable` prüft Version, Längen und Spalten (E8).
    const file: TransitTableFile = await res.json();
    return file;
  } finally {
    clearTimeout(timer);
  }
}
