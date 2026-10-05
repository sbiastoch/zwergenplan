/**
 * Einziger PWA-Teil im Start-Bundle (Plan 0011, E5): nach `load` `import("./pwa.ts")` (Lazy-Chunk `assets/app/`),
 * nur im Produktions-Build, damit `pnpm dev` keinen Service Worker registriert. Ab Stufe 2 kommt hier die Prüfung
 * „Push an?“ dazu. Statisch importiert diesen Kern niemand (`app-data-only-lazy`, `lazy-loader-static`).
 */
import { lastSiteLoad } from "./site.ts";

/** Was die App dem PWA-Kern gibt (Texte stehen im Kern); `lastLoad` steuert `site.ts` bei */
export interface AppHooks {
  /** Frische-Anlass ohne neuen Service Worker: Daten neu laden (E4a); löst nach dem Laden auf */
  refresh: () => Promise<unknown>;
  /** Toast der App (ICS offline, E4, Regel 2) */
  say: (text: string) => void;
  /** Zusatzzeile der Statuszeile („Offline – Stand vom …“, E4); leer heißt keine */
  note: (text: string) => void;
}

/** Destrukturiert direkt am `import()`: So sieht knip, welcher Export des Chunks genutzt wird. */
async function run(app: AppHooks) {
  const { start } = await import("./pwa.ts");
  await start({ ...app, lastLoad: lastSiteLoad });
}

/** Startet den PWA-Kern nach `load`, einmal je Seite. Scheitert der Chunk (offline, nicht im Cache), bleibt alles wie ohne. */
export function startPwa(app: AppHooks): void {
  if (!import.meta.env.PROD) return;
  const go = () => void run(app).catch(() => {});
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}
