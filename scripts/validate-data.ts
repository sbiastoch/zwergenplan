/**
 * Prüft den Datenbestand (Schema + Invarianten) und den Fahrplanauszug für die Wegzeit (Plan 0009).
 *   --against-deployed   zusätzlich Plausibilität gegen den LIVE deployten Stand (ADR 0002)
 */
import { SITE_URL } from "../site.config.ts";
import { checkPlausibility, type DatasetSummary } from "../src/domain/dataset.ts";
import { dataSource, loadDataset, loadTimetable, TIMETABLE_REQUIRED, timetableIssues } from "./lib/load-data.ts";
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

const now = new Date();
const fixture = source === "fixture";
const plausibility = checkPlausibility(result.summary, deployed, { fixture, now });
const timetable = loadTimetable(source);
const timetableCheck = timetableIssues(timetable, { required: TIMETABLE_REQUIRED });
const errors = [...plausibility.errors, ...timetableCheck.errors];
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
