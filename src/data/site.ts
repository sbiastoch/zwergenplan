/** Einziger Zugriffspunkt der Oberfläche auf Daten (dependency-cruiser erzwingt das). */
import type { SiteData } from "../domain/site-data.ts";

/** Warum die Daten fehlen (Plan 0008, E5). Den Text dazu wählt die Oberfläche (`loadErrorText`). */
export type LoadFailure = "offline" | "netz" | "server";

/** Einziger Fehler von `loadSiteData`. Die rohe Meldung des Browsers steht nur in `cause`, nie in der Anzeige. */
export class SiteLoadError extends Error {
  readonly reason: LoadFailure;
  constructor(reason: LoadFailure, cause: unknown) {
    super(`Daten nicht geladen (${reason})`, { cause });
    this.name = "SiteLoadError";
    this.reason = reason;
  }
}

/** Abhängigkeiten von `loadSiteData`, wie `LocationEnv` in geolocation.ts: Im Unit-Test stehen hier Stubs. */
export interface SiteEnv {
  /** schon laufende Anfrage aus index.html (Frühstart), höchstens einmal übernommen */
  early?: Promise<Response> | undefined;
  fetch: (url: string) => Promise<Response>;
  online: () => boolean;
  /** Zeitpunkt für `lastSiteLoad` (Plan 0011, E4a) */
  now: () => number;
}

/**
 * Letzter erfolgreicher Abruf für den PWA-Kern (Plan 0011, E4, E4a; `src/data/pwa.ts`): Frische-Anlass und
 * Statuszeile „Offline – Stand vom …“. `stale`: aus dem Cache des Service Workers. Die App selbst sieht davon nichts,
 * so bleibt der Offline-Zweig aus dem Start-Bundle (Arch-Review Stufe 1, H12).
 */
let last: { at: number; stale: boolean; generatedAt: string } | undefined;
export const lastSiteLoad = () => last;

/**
 * Übernimmt die Anfrage, die das Inline-Skript in index.html beim Parsen des `<head>` startet
 * (Plan 0008, E4; ersetzt den Preload, den WebKit nicht wiederverwendet). Höchstens einmal: Danach
 * ist sie weg, „Nochmal versuchen“ lädt neu. `globalThis` statt `window`, damit das Modul auch im
 * Unit-Test (Node) läuft; `window.__zpSite` ist dieselbe Eigenschaft.
 */
function takeEarlyRequest(): Promise<Response> | undefined {
  const early = globalThis.__zpSite;
  globalThis.__zpSite = undefined;
  return early;
}

function browserEnv(): SiteEnv {
  return {
    early: takeEarlyRequest(),
    // zur Aufrufzeit lesen und ohne `this` des Env-Objekts rufen (sonst „Illegal invocation“)
    fetch: (url) => globalThis.fetch(url),
    // ohne navigator (Node) gilt das Gerät als online
    online: () => typeof navigator === "undefined" || navigator.onLine !== false,
    now: Date.now,
  };
}

export async function loadSiteData(env: SiteEnv = browserEnv()): Promise<SiteData> {
  let res: Response;
  try {
    // Pfad wie im Frühstart in index.html
    res = await (env.early ?? env.fetch(`${import.meta.env.BASE_URL}data/site.json`));
  } catch (e) {
    // „Failed to fetch“, „Load failed“, Abbruch: Das Netz entscheidet, ob offline oder abgebrochen.
    throw new SiteLoadError(env.online() ? "netz" : "offline", e);
  }
  if (!res.ok) throw new SiteLoadError("server", new Error(`HTTP ${res.status}`));
  let data: SiteData;
  try {
    // Bereits beim Build mit Zod geprüft (scripts/build-data.ts) – hier kein erneutes Parsen.
    data = (await res.json()) as SiteData;
  } catch (e) {
    throw new SiteLoadError("server", e);
  }
  // Header setzt nur der Service Worker, wenn er die Kopie liefert (gleicher Name in src/sw/routes.ts)
  last = { at: env.now(), stale: res.headers.get("X-Zp-Cache") === "offline", generatedAt: data.generatedAt };
  return data;
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
