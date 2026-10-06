import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { serviceWorker } from "./scripts/vite-sw.ts";
import { BASE } from "./site.config.ts";

const E2E = process.env["ZWERGENPLAN_DATA"] === "fixture";
/**
 * Notausgang (README; Plan 0011, Arch-Review Stufe 1, H3): `ZWERGENPLAN_SW=aus` baut statt des Service Workers
 * `src/sw/kill.ts`, der sich selbst abmeldet, und die Seite registriert nicht neu (`__SW_OFF__`).
 */
const SW_OFF = process.env["ZWERGENPLAN_SW"] === "aus";

/**
 * Karten-Code (src/ui/map/** samt maplibre-gl), Worker und Karten-CSS landen in assets/karte/
 * (Plan 0005, E2). So zählt das Startbudget `dist/assets/*.js` sie nicht mit, und die eigenen
 * Budget-Zeilen werden rot, wenn die Zuordnung nicht mehr greift (E3).
 */
const KARTE = "assets/karte/[name]-[hash]";

/**
 * Lazy-Chunks der Karte: Karten-Oberfläche (src/ui/karte/, ohne MapLibre) und Karte (src/ui/map/ samt
 * maplibre-gl). Ein Chunk mit einem dieser Module ist nie Teil des Starts (`karte-ui-only-lazy`,
 * `map-only-lazy`); landet doch etwas Gemeinsames im Startordner, zeigt das Startbudget es an.
 */
const isMapModule = (id: string) => /\/src\/ui\/(karte|map)\/|\/node_modules\/.*maplibre-gl\//.test(id);

/**
 * Rechenlogik der Wegzeit (src/domain/transit.ts) als eigener Lazy-Chunk in assets/oepnv/ (Plan 0009, E10): Statisch
 * lag das Start-JS über der Schwelle. Budget `Wegzeit JS (lazy)`; `transit-only-lazy` hält sie aus dem Start.
 */
const OEPNV = "assets/oepnv/[name]-[hash]";
const isTransitModule = (id: string) => /\/src\/domain\/transit\.ts$/.test(id);

/**
 * ICS-Code der Merkliste (src/domain/ics.ts) als Lazy-Chunk in assets/export/ (Plan 0010, E8 A). Budget
 * `Export JS (lazy)`; `ics-only-lazy` hält ihn aus dem Start.
 */
const EXPORT = "assets/export/[name]-[hash]";
const isExportModule = (id: string) => /\/src\/domain\/ics\.ts$/.test(id);

/**
 * Anbieterübersicht (src/ui/anbieter/, Plan 0010, E7) als Lazy-Chunk in assets/anbieter/. Budget `Anbieter JS (lazy)`;
 * `anbieter-ui-only-lazy` hält sie aus dem Start.
 */
const ANBIETER = "assets/anbieter/[name]-[hash]";
const isProviderModule = (id: string) => /\/src\/ui\/anbieter\//.test(id);

/**
 * App-Extras (Plan 0011, E5) als Lazy-Kette in assets/app/: PWA-Kern (Registrierung, Installationszustand, Frische),
 * Push, Geräte-Speicher und Such-Abos (Plan 0017, E9: statisch unter AppSection, ohne eigene Gruppe), dazu die
 * Oberfläche src/ui/app-extras/. Budget `App-Extras JS (lazy)`; `app-extras-ui-only-lazy`, `app-data-only-lazy` und
 * `push-domain-not-in-start` halten sie aus dem Start. `src/domain/news.ts` nutzt nur der Service Worker.
 */
const APP = "assets/app/[name]-[hash]";
const isAppExtrasModule = (id: string) =>
  /\/src\/ui\/app-extras\/|\/src\/data\/(pwa|push|device-store|searches-store)\.ts$|\/src\/domain\/(searches|stored-origin)\.ts$/.test(
    id,
  );

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    // Service Worker als dist/sw.js mit Precache-Liste (Plan 0011, E3; ADR 0013). Vorgehalten werden die Start-Assets,
    // die Latin-Schrift und die Lazy-Chunks, die jeder Start lädt: PWA-Kern und Export-Code (Plan 0011, „Umsetzung“).
    serviceWorker({
      entry: SW_OFF ? "src/sw/kill.ts" : "src/sw/sw.ts",
      fonts: /\/?bricolage-grotesque-latin-opsz-normal-[^/]+\.woff2$/,
      startChunks: [/\/src\/data\/pwa\.ts$/, /\/src\/domain\/ics\.ts$/],
    }),
  ],
  define: {
    // Test-Haken window.__zpMap nur im E2E-Build (Plan 0005, E13); im Deploy-Build entfernt Vite den Zweig.
    __E2E__: JSON.stringify(E2E),
    __SW_OFF__: JSON.stringify(SW_OFF),
  },
  worker: {
    format: "es",
    rolldownOptions: { output: { entryFileNames: `${KARTE}.js`, chunkFileNames: `${KARTE}.js` } },
  },
  // E2E-Build (Fixtures) getrennt vom Deploy-Build, damit nie Testdaten live gehen.
  build: {
    target: "es2023",
    sourcemap: true,
    outDir: E2E ? "dist-e2e" : "dist",
    // Der Karten-Chunk (MapLibre, ca. 1 MB roh) ist absichtlich groß und lazy; das Gate sind die Budgets in .size-limit.json.
    chunkSizeWarningLimit: 1100,
    // Ziel es2023: Ohne natives modulepreload lädt ein Browser die Chunks nur nicht vorab. Spart ca. 0,25 kB Start-JS (Plan 0005).
    modulePreload: { polyfill: false },
    rolldownOptions: {
      output: {
        chunkFileNames: (chunk) =>
          chunk.isEntry
            ? "assets/[name]-[hash].js"
            : chunk.moduleIds.some(isMapModule)
              ? `${KARTE}.js`
              : chunk.moduleIds.some(isTransitModule)
                ? `${OEPNV}.js`
                : chunk.moduleIds.some(isExportModule)
                  ? `${EXPORT}.js`
                  : chunk.moduleIds.some(isProviderModule)
                    ? `${ANBIETER}.js`
                    : chunk.moduleIds.some(isAppExtrasModule)
                      ? `${APP}.js`
                      : "assets/[name]-[hash].js",
        // Alles, was der Einstieg statisch erreicht, bleibt im Einstieg, auch wenn Lazy-Chunks es teilen (ADR 0012).
        // Workaround für rolldown#11026: Ohne die Gruppe spaltet chunkOptimization z. B. jsx-runtime und time.ts als
        // eigene Start-Chunks ab, sobald mehrere Lazy-Chunks geteilte UI-Module nutzen. Auf main ändert die Gruppe
        // nichts (gleicher Hash). Ist der Fehler behoben und der Hash ohne Gruppe gleich, entfällt sie. Gate bleibt
        // der Chunk-Wächter (scripts/check-chunks.ts).
        codeSplitting: { groups: [{ name: "index", tags: ["$initial"] }] },
        assetFileNames: (asset) =>
          asset.names.some((n) => /^Map(View|Screen)\b/.test(n))
            ? `${KARTE}[extname]`
            : "assets/[name]-[hash][extname]",
      },
    },
  },
  preview: { port: 4173 },
});
