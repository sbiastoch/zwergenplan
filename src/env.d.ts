/** Von vite.config.ts per `define` gesetzt: nur im E2E-Build (Fixtures) wahr (Plan 0005, E13). */
declare const __E2E__: boolean;
/** Von vite.config.ts gesetzt: Notausgang `ZWERGENPLAN_SW=aus`, die Seite registriert keinen Service Worker (README). */
declare const __SW_OFF__: boolean;
/**
 * Frühstart von site.json aus index.html (Plan 0008, E4), übernommen von `takeEarlyRequest` in
 * src/data/site.ts. `var`, weil nur so auch `globalThis.__zpSite` typisiert ist (`typeof globalThis`
 * kennt keine Window-Felder); `window.__zpSite` ist dieselbe Eigenschaft.
 */
declare var __zpSite: Promise<Response> | undefined;
/** Chromium: Angebot zur Installation (Plan 0011, E7), fehlt in lib.dom. Gelesen nur in src/data/pwa.ts. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}
interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
