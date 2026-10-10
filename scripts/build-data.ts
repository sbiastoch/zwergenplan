/**
 * Prüft den Datenbestand und erzeugt die statischen Daten-Assets der Seite:
 *   public/data/site.json, public/data/meta.json, public/ics/**.ics,
 *   public/data/anbieter.json (Anbieterübersicht, lädt erst beim Öffnen; Plan 0010, E6),
 *   public/data/wegzeit.json (Wegzeit-Tabelle aus dem Fahrplanauszug, Plan 0009, E5/E7),
 *   public/data/linien.json (Linien je Zelle der Tabelle, Plan 0012, E7),
 *   public/angebot/<id>/, public/anbieter/<id>/, public/404.html (Vorschauseiten zum Teilen, Plan 0026, ADR 0020)
 * Ungültige Daten, ein ungültiger oder fehlender Auszug → Exit 1 → kein Build, kein Deploy
 * (`TIMETABLE_REQUIRED`, seit Plan 0009, Schritt 5).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DISTRICTS } from "../src/domain/districts.ts";
import { icsContextFor, icsForSeries, icsForSession } from "../src/domain/ics.ts";
import { seriesIcsPath, sessionIcsPath } from "../src/domain/ics-paths.ts";
import { type SiteMeta, toProviderDirectory, toSiteData } from "../src/domain/site-data.ts";
import { decodeTransitTable, INSIDE_METERS } from "../src/domain/transit.ts";
import { dataSource, loadDataset, loadTimetable, ROOT, TIMETABLE_REQUIRED, timetableIssues } from "./lib/load-data.ts";
import { checkSharePages, notFoundPage, offerSharePage, providerSharePage } from "./lib/share-pages.ts";
import { buildTransitTables, withoutAccess } from "./transit/table.ts";

/** Ab hier warnt der Build: Die Profil-CSA läuft in jedem data:build (Plan 0009, Backpressure). */
const TRANSIT_WARN_SECONDS = 20;
/**
 * Gate gegen einen stillen Ausfall der Linien (Plan 0012, E7, Review W3): Mit echten Daten darf höchstens dieser
 * Anteil der Zellen mit Wegzeit ohne Linien sein. Gemessen am 2026-10-05 (Auszug Stichtag 13.10.2026, 556 × 76):
 * 1 514 von 35 226 Zellen = 4,3 %; Schwelle = Messwert + 5 Prozentpunkte.
 */
const MAX_WITHOUT_LINES = 0.093;

const source = dataSource();
const result = loadDataset(source);
if (!result.ok) {
  console.error(`✗ Daten ungültig (${source}):\n  ${result.errors.join("\n  ")}`);
  process.exit(1);
}

const publicDir = fileURLToPath(new URL("public/", ROOT));
for (const dir of ["data", "ics", "angebot", "anbieter", "404.html"]) {
  rmSync(`${publicDir}${dir}`, { recursive: true, force: true });
}

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
// derselbe Datenstand wie site.json: Weicht er im Browser ab, lädt ensureFresh einmal neu (src/data/providers.ts)
const directory = toProviderDirectory(result.providers, site.generatedAt);
// Übergang (Plan 0030, Review M1): Ein Tab, der seit dem Deploy sichtbar blieb, läuft noch mit altem Code, der
// `[...provider.topics]` rechnet. Erst `watchFreshness` hebt ihn auf neuen Code. Das leere Feld bleibt deshalb bis
// frühestens einen Tag nach dem Deploy stehen (Restpunkt in docs/ideas.md).
const legacyDirectory = { ...directory, providers: directory.providers.map((p) => ({ ...p, topics: [] })) };
write("data/anbieter.json", JSON.stringify(legacyDirectory));

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

// Vorschauseiten zum Teilen (Plan 0026, E2): aus denselben Daten, „jetzt“ = generatedAt
const pages = [
  ...site.offers.map((offer) => offerSharePage(offer, site.generatedAt)),
  ...directory.providers.map((provider) => providerSharePage(provider, site.offers, site.generatedAt)),
];
const pageErrors = checkSharePages(pages);
if (pageErrors.length > 0) {
  console.error(`✗ Vorschauseiten (Fehler im Generator, Plan 0026, E4):\n  ${pageErrors.join("\n  ")}`);
  process.exit(1);
}
for (const page of pages) write(page.path, page.html);
write("404.html", notFoundPage());
const largest = Math.max(...pages.map((p) => new TextEncoder().encode(p.html).length));

console.log(
  `✓ Daten (${source}): ${meta.offers} Angebote, ${meta.providers} Katalog-Einträge (${directory.providers.length} Anbieter), ${files} ICS-Dateien`,
);
console.log(
  `✓ Vorschauseiten: ${site.offers.length} Angebote, ${directory.providers.length} Anbieter, größte ${(largest / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kB`,
);

const timetable = loadTimetable(source);
const timetableCheck = timetableIssues(timetable, { required: TIMETABLE_REQUIRED });
for (const w of timetableCheck.warnings) console.log(`::warning::${w}`);
if (timetableCheck.errors.length > 0) {
  console.error(`✗ Wegzeit:\n  ${timetableCheck.errors.join("\n  ")}`);
  process.exit(1);
}
if (timetable.kind === "ok") {
  const started = performance.now();
  const { table, lines, stats } = buildTransitTables(
    timetable.timetable,
    site.offers.map((o) => o.venue.geo),
  );
  const seconds = (performance.now() - started) / 1000;
  write("data/wegzeit.json", JSON.stringify(table));
  write("data/linien.json", JSON.stringify(lines));
  const took = seconds.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  console.log(`✓ Wegzeit: ${table.lat.length} Halte × ${table.places.length} Orte in ${took} s`);
  console.log(
    `✓ Linien: ${stats.lines} Linien, ${stats.combos} Folgen, ${stats.withoutLines} Zellen ohne Linien (davon ${stats.outliers} unpassend)`,
  );
  const share = stats.cells === 0 ? 1 : stats.withoutLines / stats.cells;
  if (stats.withoutLines === stats.cells) {
    console.error("✗ Linien: keine Zelle hat Linien (Plan 0012, E7)");
    process.exit(1);
  }
  if (source === "real" && share > MAX_WITHOUT_LINES) {
    const pct = (v: number) => `${(v * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
    console.error(`✗ Linien: ${pct(share)} der Zellen ohne Linien, erlaubt ${pct(MAX_WITHOUT_LINES)} (Plan 0012, E7)`);
    process.exit(1);
  }
  // Jeder wählbare Stadtteil braucht einen Zugangshalt, sonst hieße es dort „außerhalb des Stadtgebiets“
  // (Plan 0009, Schritt 5). Das Fixture-Netz deckt nur Gostenhof ab.
  if (source === "real") {
    const decoded = decodeTransitTable(table, new Set(table.places));
    const missing = decoded ? withoutAccess(decoded, DISTRICTS) : DISTRICTS;
    if (missing.length > 0) {
      console.error(`✗ Wegzeit: ohne Zugangshalt (${INSIDE_METERS} m): ${missing.map((d) => d.name).join(", ")}`);
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
