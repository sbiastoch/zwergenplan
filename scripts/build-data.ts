/**
 * Prüft den Datenbestand und erzeugt die statischen Daten-Assets der Seite:
 *   public/data/site.json, public/data/meta.json, public/ics/**.ics,
 *   public/data/wegzeit.json (Wegzeit-Tabelle aus dem Fahrplanauszug, Plan 0009, E5/E7)
 * Ungültige Daten oder ein ungültiger Auszug → Exit 1 → kein Build, kein Deploy. Fehlt der Auszug, gibt es
 * bis Schritt 5 von Plan 0009 nur eine Warnung und keine wegzeit.json (`TIMETABLE_REQUIRED`).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DISTRICTS } from "../src/domain/districts.ts";
import { icsContextFor, icsForSeries, icsForSession, seriesIcsPath, sessionIcsPath } from "../src/domain/ics.ts";
import { type SiteMeta, toSiteData } from "../src/domain/site-data.ts";
import { ACCESS_METERS, decodeTransitTable } from "../src/domain/transit.ts";
import { dataSource, loadDataset, loadTimetable, ROOT, TIMETABLE_REQUIRED, timetableIssues } from "./lib/load-data.ts";
import { buildTransitTable, withoutAccess } from "./transit/table.ts";

/** Ab hier warnt der Build: Die Profil-CSA läuft in jedem data:build (Plan 0009, Backpressure). */
const TRANSIT_WARN_SECONDS = 20;

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

const timetable = loadTimetable(source);
const timetableCheck = timetableIssues(timetable, { required: TIMETABLE_REQUIRED });
for (const w of timetableCheck.warnings) console.log(`::warning::${w}`);
if (timetableCheck.errors.length > 0) {
  console.error(`✗ Wegzeit:\n  ${timetableCheck.errors.join("\n  ")}`);
  process.exit(1);
}
if (timetable.kind === "ok") {
  const started = performance.now();
  const table = buildTransitTable(
    timetable.timetable,
    site.offers.map((o) => o.venue.geo),
  );
  const seconds = (performance.now() - started) / 1000;
  write("data/wegzeit.json", JSON.stringify(table));
  const took = seconds.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  console.log(`✓ Wegzeit: ${table.lat.length} Halte × ${table.places.length} Orte in ${took} s`);
  // Jeder wählbare Stadtteil braucht einen Zugangshalt, sonst hieße es dort „außerhalb des Stadtgebiets“
  // (Plan 0009, Schritt 5). Das Fixture-Netz deckt nur Gostenhof ab.
  if (source === "real") {
    const decoded = decodeTransitTable(table, new Set(table.places));
    const missing = decoded ? withoutAccess(decoded, DISTRICTS) : DISTRICTS;
    if (missing.length > 0) {
      console.error(`✗ Wegzeit: ohne Zugangshalt (${ACCESS_METERS} m): ${missing.map((d) => d.name).join(", ")}`);
      process.exit(1);
    }
    console.log(`✓ Zugangshalt für alle ${DISTRICTS.length} Stadtteile`);
  }
  if (seconds > TRANSIT_WARN_SECONDS) {
    console.log(
      `::warning::Wegzeit-Berechnung dauerte ${took} s (> ${TRANSIT_WARN_SECONDS} s) – Cache über einen Hash aus Auszug und Orten erwägen (Plan 0009, Backpressure)`,
    );
  }
}
