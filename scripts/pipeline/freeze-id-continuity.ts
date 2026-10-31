/**
 * Fixture der ID-Kontinuität einfrieren (Plan 0049, Nachtrag 2, B7). Aufruf: `node scripts/pipeline/freeze-id-continuity.ts`
 *
 * Quelle ist der letzte Nachtlauf, also der letzte Commit, der `data/offers.json` änderte (aus git, nicht aus dem
 * Arbeitsbaum, damit Eingabe und Ergebnis zusammenpassen). Nach `scripts/pipeline/fixtures/id-continuity/`:
 * - `raw.json.gz`: `data/raw/*.json` dieses Commits, je Anbieter-ID;
 * - `providers.yaml.gz`: `data/providers.yaml` dieses Commits;
 * - `offers.json.gz`: `data/offers.json` dieses Commits, das Ergebnis des Laufs;
 * - `offers-before.json.gz`: `data/offers.json` davor, der Vorstand des Laufs;
 * - `free-days.json.gz`: die freien Tage des Nachtlaufs (OpenHolidays über den Cache, Spanne wie in `io/nightly.ts`);
 * - `meta.json`: `today` und `generatedAt` des Laufs (`horizon.from`, `generatedAt` aus seinem Ergebnis), der Commit.
 * So baut der Test den Lauf mit demselben Stichtag nach, und ein erneutes Einfrieren ohne neuen Lauf ändert nichts.
 * gzip (Stufe 9, ohne Zeitstempel im Kopf) hält die rund 3,7 MB im Repo bei rund 0,4 MB und die Bytes reproduzierbar.
 *
 * Nicht nach jedem Nachtlauf nötig. Neu einfrieren, wenn eine Änderung am Build-Code IDs gewollt kostet (Begründung
 * im Commit) oder wenn sich das Format von `data/raw` ändert und die Fixture nicht mehr einliest.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { OffersFile } from "../../src/domain/schema.ts";
import { ROOT } from "./io/files.ts";
import { loadFreeDays } from "./io/holidays.ts";
import { nightlyWindow } from "./lib/build-offers.ts";

const OUT = join(ROOT, "scripts/pipeline/fixtures/id-continuity");
// offers.json ist größer als der Standardpuffer von execFileSync (1 MB)
const run = (...args: string[]) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const commit = run("log", "-1", "--format=%h", "--", "data/offers.json").trim();
const show = (rev: string, path: string) => run("show", `${rev}:${path}`);
const offers = show(commit, "data/offers.json");
const after = OffersFile.parse(JSON.parse(offers));
const today = after.horizon.from;
const span = nightlyWindow(today).freeDaysSpan;
const freeDays = await loadFreeDays(span.from, span.to);

const raws: Record<string, unknown> = {};
for (const f of run("ls-tree", "--name-only", `${commit}:data/raw`)
  .split("\n")
  .filter((n) => n.endsWith(".json"))
  .sort())
  raws[f.slice(0, -".json".length)] = JSON.parse(show(commit, `data/raw/${f}`));

const gz = (name: string, text: string) => {
  const bytes = gzipSync(text, { level: 9 });
  writeFileSync(join(OUT, name), bytes);
  return bytes.length;
};
mkdirSync(OUT, { recursive: true });
const sizes = {
  "raw.json.gz": gz("raw.json.gz", JSON.stringify(raws)),
  "providers.yaml.gz": gz("providers.yaml.gz", show(commit, "data/providers.yaml")),
  "offers.json.gz": gz("offers.json.gz", offers),
  "offers-before.json.gz": gz("offers-before.json.gz", show(`${commit}^`, "data/offers.json")),
  "free-days.json.gz": gz("free-days.json.gz", JSON.stringify(freeDays)),
};
const meta = { today, generatedAt: after.generatedAt, commit };
// Einrückung wie Biome, das scripts/ prüft
writeFileSync(join(OUT, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
for (const [name, n] of Object.entries(sizes)) process.stdout.write(`${name}: ${(n / 1024).toFixed(0)} KB\n`);
process.stdout.write(
  `Lauf ${commit}: today ${today}, generatedAt ${after.generatedAt}, ${Object.keys(raws).length} Anbieter\n`,
);
