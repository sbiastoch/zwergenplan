/**
 * Stichprobe des Entdecken-Evals ziehen (Plan 0050, S0). Aufruf: `node scripts/pipeline/draw-eval-sample.ts`
 *
 * Liest `evals/discover.json` (Seed, Trägerarten, Einträge mit `alt: true`) und füllt je Stichprobe die übrigen
 * Plätze bis 20 geschichtet nach Trägerart mit dem Seed der Datei, ohne Blick auf die Quellen. Nicht gezogen werden
 * Anbieter mit `skipCrawl` (ihr Ertragsbeweis kann nie bestehen) und Anbieter ohne Art. Gezogene Einträge ohne
 * `alt` ersetzt jeder Aufruf; Änderungen danach nur mit `notiz` und neuer Zeile in `evals/results.md`.
 */
import { writeFileSync } from "node:fs";
import { DISCOVER_EVAL, readCatalog, readJson } from "./io/files.ts";
import { DiscoverEvalSchema, drawStratified, SAMPLE_REGIONS, SAMPLE_SIZE } from "./lib/eval-discover.ts";

const file = DiscoverEvalSchema.parse(readJson(DISCOVER_EVAL));
const catalog = readCatalog();

for (const [sample, regions] of Object.entries(SAMPLE_REGIONS)) {
  const alt = (file.stichproben[sample] ?? []).filter((e) => e.alt);
  const taken = new Set(alt.map((e) => e.id));
  const pool = catalog.flatMap((p) => {
    const art = file.arten[p.id];
    const eligible = p.role === "anbieter" && regions.includes(p.region) && !p.skipCrawl && !taken.has(p.id);
    return eligible && art ? [{ id: p.id, art }] : [];
  });
  const drawn = drawStratified(pool, SAMPLE_SIZE - alt.length, file.seed);
  file.stichproben[sample] = [...alt, ...drawn.map((id) => ({ id }))];
  process.stdout.write(`${sample}: ${alt.length} alt, gezogen ${drawn.join(", ")}\n`);
}
// Einrückung wie Biome, das evals/ prüft (writeJson schreibt das Format von data/)
writeFileSync(DISCOVER_EVAL, `${JSON.stringify(file, null, 2)}\n`);
