/**
 * Prüft den Datenbestand und erzeugt die statischen Daten-Assets der Seite:
 *   public/data/site.json, public/data/meta.json, public/ics/**.ics
 * Ungültige Daten → Exit 1 → kein Build, kein Deploy.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { icsContextFor, icsForSeries, icsForSession, seriesIcsPath, sessionIcsPath } from "../src/domain/ics.ts";
import { type SiteMeta, toSiteData } from "../src/domain/site-data.ts";
import { dataSource, loadDataset, ROOT } from "./lib/load-data.ts";

const source = dataSource();
const result = loadDataset(source);
if (!result.ok) {
  console.error(`✗ Daten ungültig (${source}):\n  ${result.errors.join("\n  ")}`);
  process.exit(1);
}

const publicDir = fileURLToPath(new URL("public/", ROOT));
for (const dir of ["data", "ics"]) rmSync(`${publicDir}${dir}`, { recursive: true, force: true });

function write(relPath: string, content: string) {
  const file = `${publicDir}${relPath}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const site = toSiteData(result.providers, result.offers);
let commit = "unbekannt";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  // außerhalb eines Repos (z. B. Tarball) – unkritisch
}
const meta: SiteMeta = { ...result.summary, commit };
write("data/site.json", JSON.stringify(site));
write("data/meta.json", `${JSON.stringify(meta, null, 2)}\n`);

let files = 0;
for (const offer of site.offers) {
  const ctx = icsContextFor(offer, site.generatedAt);
  write(seriesIcsPath(offer), icsForSeries(offer, ctx));
  files++;
  if (offer.format === "regelmaessig") {
    for (const session of offer.sessions) {
      write(sessionIcsPath(offer, session), icsForSession(offer, session, ctx));
      files++;
    }
  }
}

console.log(`✓ Daten (${source}): ${meta.offers} Angebote, ${meta.providers} Anbieter, ${files} ICS-Dateien`);
