/**
 * Prüft den Datenbestand (Schema + Invarianten), den Fahrplanauszug für die Wegzeit (Plan 0009), den Zustand
 * je Anbieter in data/raw (Plan 0032, E5) und den Zustand des Entdeckens in data/discover (E7).
 *   --against-deployed   zusätzlich Plausibilität gegen den LIVE deployten Stand (ADR 0002)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { SITE_URL } from "../site.config.ts";
import { checkPlausibility, type DatasetSummary } from "../src/domain/dataset.ts";
import { dataSource, loadDataset, loadTimetable, ROOT, TIMETABLE_REQUIRED, timetableIssues } from "./lib/load-data.ts";
import { EXTRACT_KEY_PARTS } from "./pipeline/io/extract.ts";
import { DiscoverState, reservedConflicts } from "./pipeline/lib/discover-state.ts";
import { hasResultFor, promptHash } from "./pipeline/lib/eval-score.ts";
import { idAcceptanceIssues, providerRawIssues } from "./pipeline/lib/raw.ts";
import { duplicateUnitIds } from "./pipeline/lib/units.ts";
import { timetableWarnings } from "./transit/freshness.ts";

const source = dataSource();
const result = loadDataset(source);
if (!result.ok) {
  console.error(`✗ Daten ungültig (${source}):\n  ${result.errors.join("\n  ")}`);
  process.exit(1);
}

let deployed: DatasetSummary | undefined;
if (process.argv.includes("--against-deployed")) {
  try {
    const res = await fetch(`${SITE_URL}data/meta.json`, { cache: "no-store" });
    if (res.ok) deployed = (await res.json()) as DatasetSummary;
    else console.log(`::warning::Kein deployter Stand unter ${SITE_URL} (HTTP ${res.status}), Plausibilität entfällt.`);
  } catch (e) {
    // Netzfehler sollen nicht jeden Deploy blockieren – aber sichtbar sein.
    console.log(`::warning::Deployter Stand nicht abrufbar, Plausibilität nur eingeschränkt: ${(e as Error).message}`);
  }
}

/**
 * Zustand je Anbieter `data/raw/*.json` (Plan 0032, E5/E13): Schema `ProviderRaw`, Dateiname = Katalog-Anbieter,
 * Events nur dieses Anbieters. Import aus scripts/pipeline/lib erlaubt (Plan 0032, E14; docs/architecture.md).
 */
function rawIssues(): string[] {
  const dir = new URL(source === "fixture" ? "tests/fixtures/raw/" : "data/raw/", ROOT);
  if (!existsSync(dir)) return [];
  const anbieter = new Set(result.ok ? result.providers.filter((p) => p.role === "anbieter").map((p) => p.id) : []);
  const issues: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const id = f.slice(0, -".json".length);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    } catch (e) {
      issues.push(`data/raw/${f}: Lesefehler: ${(e as Error).message}`);
      continue;
    }
    issues.push(...providerRawIssues(`data/raw/${f}`, id, raw, anbieter));
  }
  return issues;
}

/**
 * Zustand des Entdeckens `data/discover/<region>.json` (Plan 0032, E7/E13): Schema `DiscoverState`, Dateiname =
 * Region. Biome nimmt den Ordner aus (vom Werkzeug geschrieben), deshalb prüft ihn hier Zod.
 */
function discoverIssues(): string[] {
  const dir = new URL(source === "fixture" ? "tests/fixtures/discover/" : "data/discover/", ROOT);
  if (!existsSync(dir)) return [];
  const issues: string[] = [];
  const states: DiscoverState[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const label = `data/discover/${f}`;
    try {
      const parsed = DiscoverState.safeParse(JSON.parse(readFileSync(new URL(f, dir), "utf8")));
      if (!parsed.success) issues.push(...parsed.error.issues.map((i) => `${label} ${i.path.join(".")}: ${i.message}`));
      else if (`${parsed.data.region}.json` !== f)
        issues.push(`${label}: Region ${parsed.data.region} passt nicht zum Dateinamen`);
      else states.push(parsed.data);
    } catch (e) {
      issues.push(`${label}: Lesefehler: ${(e as Error).message}`);
    }
  }
  // zurückgenommene IDs nie neu vergeben, über jeden Weg (ADR 0022; Arch-Review S4b, M1)
  if (result.ok) issues.push(...reservedConflicts(result.providers, states));
  return issues;
}

/**
 * Hinnehmen-Datei `data/id-hinnehmen.yaml` (ADR 0041, Punkt 7): von Hand gepflegt, deshalb hier geprüft (Schema
 * `IdAcceptance`, Anbieter im Katalog). Fehlt sie, ist nichts hingenommen.
 */
function acceptanceIssues(): string[] {
  const file = new URL(source === "fixture" ? "tests/fixtures/id-hinnehmen.yaml" : "data/id-hinnehmen.yaml", ROOT);
  if (!existsSync(file)) return [];
  const label = "data/id-hinnehmen.yaml";
  let input: unknown;
  try {
    input = parse(readFileSync(file, "utf8")) ?? [];
  } catch (e) {
    return [`${label}: Lesefehler: ${(e as Error).message}`];
  }
  const anbieter = new Set(result.ok ? result.providers.filter((p) => p.role === "anbieter").map((p) => p.id) : []);
  return idAcceptanceIssues(label, input, anbieter);
}

/**
 * Eval zum aktuellen Prompt (Plan 0032, E9): kein Gate, nur ein Hinweis, wenn `evals/results.md` für Prompt und
 * Antwortschema (`EXTRACT_KEY_PARTS`) keine Zeile hat. Nach einem Prompt- oder Schemawechsel `pnpm eval` laufen lassen.
 */
function evalWarnings(): string[] {
  const hash = promptHash(EXTRACT_KEY_PARTS);
  const file = new URL("evals/results.md", ROOT);
  const md = existsSync(file) ? readFileSync(file, "utf8") : "";
  return hasResultFor(md, hash)
    ? []
    : [`Kein Eval für den aktuellen Extraktions-Prompt (Hash ${hash}) in evals/results.md – pnpm eval laufen lassen`];
}

const now = new Date();
const fixture = source === "fixture";
const plausibility = checkPlausibility(result.summary, deployed, { fixture, now });
const timetable = loadTimetable(source);
const timetableCheck = timetableIssues(timetable, { required: TIMETABLE_REQUIRED });
// Kennungen der Einheiten je Anbieter eindeutig (Plan 0048, E1)
const unitIssues = result.providers.flatMap((p) =>
  p.role === "anbieter" ? duplicateUnitIds(p).map((id) => `data/providers.yaml ${p.id}: Seite doppelt (${id})`) : [],
);
const errors = [
  ...plausibility.errors,
  ...timetableCheck.errors,
  ...rawIssues(),
  ...discoverIssues(),
  ...unitIssues,
  ...acceptanceIssues(),
];
const warnings = [
  ...plausibility.warnings,
  ...timetableCheck.warnings,
  ...(timetable.kind === "ok" ? timetableWarnings(timetable.timetable.source, now, { fixture }) : []),
  ...evalWarnings(),
];
for (const w of warnings) console.log(`::warning::${w}`);
if (errors.length > 0) {
  console.error(`✗ Plausibilität:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `✓ Daten (${source}) gültig: ${result.summary.offers} Angebote, ${result.summary.providers} Anbieter` +
    (deployed ? ` (deployt: ${deployed.offers})` : "") +
    (timetable.kind === "ok"
      ? `, Fahrplanauszug ${timetable.timetable.serviceDay} (${timetable.timetable.trips.length} Fahrten)`
      : ""),
);
