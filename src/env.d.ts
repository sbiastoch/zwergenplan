/** Von vite.config.ts per `define` gesetzt: nur im E2E-Build (Fixtures) wahr (Plan 0005, E13). */
declare const __E2E__: boolean;
/**
 * Frühstart von site.json aus index.html (Plan 0008, E4), übernommen von `takeEarlyRequest` in
 * src/data/site.ts. `var`, weil nur so auch `globalThis.__zpSite` typisiert ist (`typeof globalThis`
 * kennt keine Window-Felder); `window.__zpSite` ist dieselbe Eigenschaft.
 */
declare var __zpSite: Promise<Response> | undefined;
