/**
 * PostToolUse (Edit|Write): formatiert/lintet die geänderte Datei sofort und prüft Daten.
 * Blockiert nie – Restprobleme gehen als Kontext an Claude (Plan 0001, Review M9).
 */
import { relative } from "node:path";
import { addContext, exitIfNotInstalled, PROJECT_DIR, readInput, run, tail } from "./lib.ts";

exitIfNotInstalled();

const input = await readInput<{ tool_input?: { file_path?: string } }>();
const file = input.tool_input?.file_path;
if (!file) process.exit(0);
const rel = relative(PROJECT_DIR, file);
if (rel.startsWith("..")) process.exit(0);

const notes: string[] = [];

if (/\.(ts|tsx|js|mjs|cjs|json|jsonc|css)$/.test(rel) && !rel.startsWith("schema/")) {
  const lint = run("pnpm", ["exec", "biome", "check", "--write", "--no-errors-on-unmatched", rel]);
  if (!lint.ok) notes.push(`Biome meldet in ${rel}:\n${tail(lint.output, 25)}`);
}

if (rel.startsWith("data/") || rel.startsWith("tests/fixtures/")) {
  const env = rel.startsWith("tests/") ? "fixture" : "real";
  process.env["ZWERGENPLAN_DATA"] = env;
  const data = run("node", ["scripts/validate-data.ts"]);
  if (!data.ok) notes.push(`Datenvalidierung (${env}) fehlgeschlagen:\n${tail(data.output, 25)}`);
}

// Rohdateien der Recherche-Subagenten: sofort gegen Schema und Katalog prüfen (Plan 0002, E5).
if (/^runs\/[^/]+\/raw\/[^/]+\.json$/.test(rel)) {
  const raw = run("node", ["scripts/pipeline/cli.ts", "validate-raw", rel]);
  if (!raw.ok) notes.push(`validate-raw meldet Fehler in ${rel} – korrigieren:\n${tail(raw.output, 40)}`);
}

if (rel === "src/domain/schema.ts" || rel === "src/domain/topics.ts" || rel === "scripts/pipeline/lib/raw.ts") {
  notes.push("Schema geändert: `pnpm schema:export` ausführen und schema/*.json mitcommitten (CI prüft Drift).");
}

if (notes.length > 0) addContext("PostToolUse", notes.join("\n\n"));
