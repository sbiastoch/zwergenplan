/**
 * Chunk-Wächter nach dem Build (Plan 0010, E8): genau eine JS-Datei direkt in dist/assets/. Läuft vor size-limit im
 * Skript `size`, also lokal in `pnpm check` und in CI.
 */
import { readdirSync } from "node:fs";
import { strayStartChunks } from "./lib/chunks.ts";

const DIR = "dist/assets";
const stray = strayStartChunks(readdirSync(DIR));
if (stray.length > 0) {
  for (const name of stray) console.error(`✗ Chunk direkt in ${DIR}/: ${name}`);
  console.error(
    "Start-JS ist genau ein index-*.js; Lazy-Chunks gehören per chunkFileNames in einen Unterordner (vite.config.ts).",
  );
  process.exit(1);
}
console.log(`✓ Chunk-Wächter: ein Start-Chunk in ${DIR}/`);
