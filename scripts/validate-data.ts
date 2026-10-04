/**
 * Prüft den Datenbestand (Schema + Invarianten).
 *   --against-deployed   zusätzlich Plausibilität gegen den LIVE deployten Stand (ADR 0002)
 */
import { SITE_URL } from "../site.config.ts";
import { checkPlausibility, type DatasetSummary } from "../src/domain/dataset.ts";
import { dataSource, loadDataset } from "./lib/load-data.ts";

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
    else console.log(`ℹ Kein deployter Stand gefunden (HTTP ${res.status}) – erster Deploy?`);
  } catch (e) {
    // Netzfehler sollen nicht jeden Deploy blockieren – aber sichtbar sein.
    console.log(`::warning::Deployter Stand nicht abrufbar, Plausibilität nur eingeschränkt: ${(e as Error).message}`);
  }
}

const { errors, warnings } = checkPlausibility(result.summary, deployed, {
  fixture: source === "fixture",
  now: new Date(),
});
for (const w of warnings) console.log(`::warning::${w}`);
if (errors.length > 0) {
  console.error(`✗ Plausibilität:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `✓ Daten (${source}) gültig: ${result.summary.offers} Angebote, ${result.summary.providers} Anbieter` +
    (deployed ? ` (deployt: ${deployed.offers})` : ""),
);
