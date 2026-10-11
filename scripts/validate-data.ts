/**
 * Prüft den Datenbestand (Schema + Invarianten), den Fahrplanauszug für die Wegzeit (Plan 0009) und den Zustand
 * je Anbieter in data/raw (Plan 0032, E5).
 *   --against-deployed   zusätzlich Plausibilität gegen den LIVE deployten Stand (ADR 0002)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { SITE_URL } from "../site.config.ts";
import { checkPlausibility, type DatasetSummary } from "../src/domain/dataset.ts";
import { dataSource, loadDataset, loadTimetable, ROOT, TIMETABLE_REQUIRED, timetableIssues } from "./lib/load-data.ts";
import { providerRawIssues } from "./pipeline/lib/raw.ts";
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

const now = new Date();
const fixture = source === "fixture";
const plausibility = checkPlausibility(result.summary, deployed, { fixture, now });
const timetable = loadTimetable(source);
const timetableCheck = timetableIssues(timetable, { required: TIMETABLE_REQUIRED });
const errors = [...plausibility.errors, ...timetableCheck.errors, ...rawIssues()];
const warnings = [
  ...plausibility.warnings,
  ...timetableCheck.warnings,
  ...(timetable.kind === "ok" ? timetableWarnings(timetable.timetable.source, now, { fixture }) : []),
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
