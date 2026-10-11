/**
 * Chunk-Wächter nach dem Build (Plan 0010, E8): genau eine JS- und eine CSS-Datei direkt in dist/assets/ (CSS: Plan
 * 0033, E4). Läuft vor size-limit im Skript `size`, also lokal in `pnpm check` und in CI.
 */
import { readdirSync } from "node:fs";
import { strayStartFiles } from "./lib/chunks.ts";

const DIR = "dist/assets";
const stray = strayStartFiles(readdirSync(DIR));
if (stray.length > 0) {
  for (const name of stray) console.error(`✗ Datei direkt in ${DIR}/: ${name}`);
  console.error(
    "Start ist genau ein index-*.js und ein index-*.css; Lazy-Chunks und ihre CSS gehören per chunkFileNames bzw. " +
      "assetFileNames in einen Unterordner (vite.config.ts).",
  );
  process.exit(1);
}
console.log(`✓ Chunk-Wächter: ein Start-Chunk und eine Start-CSS in ${DIR}/`);
