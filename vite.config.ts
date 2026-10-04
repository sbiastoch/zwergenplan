import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { BASE } from "./site.config.ts";

const E2E = process.env["ZWERGENPLAN_DATA"] === "fixture";

/**
 * Karten-Code (src/ui/map/** samt maplibre-gl), Worker und Karten-CSS landen in assets/karte/
 * (Plan 0005, E2). So zählt das Startbudget `dist/assets/*.js` sie nicht mit, und die eigenen
 * Budget-Zeilen werden rot, wenn die Zuordnung nicht mehr greift (E3).
 */
const KARTE = "assets/karte/[name]-[hash]";

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  define: {
    // Test-Haken window.__zpMap nur im E2E-Build (Plan 0005, E13); im Deploy-Build entfernt Vite den Zweig.
    __E2E__: JSON.stringify(E2E),
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
    rolldownOptions: {
      output: {
        chunkFileNames: (chunk) => (chunk.name === "MapView" ? `${KARTE}.js` : "assets/[name]-[hash].js"),
        assetFileNames: (asset) =>
          asset.names.some((n) => n.startsWith("MapView")) ? `${KARTE}[extname]` : "assets/[name]-[hash][extname]",
      },
    },
  },
  preview: { port: 4173 },
});
