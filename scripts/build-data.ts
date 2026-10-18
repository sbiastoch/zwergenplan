/**
 * Prüft den Datenbestand und erzeugt die statischen Daten-Assets der Seite:
 *   public/data/site.json, public/data/meta.json, public/ics/**.ics,
 *   public/data/anbieter.json (Anbieterübersicht, lädt erst beim Öffnen; Plan 0010, E6),
 *   public/data/wegzeit/<netz>.json (Wegzeit-Tabelle aus dem Fahrplanauszug je Netz, Plan 0009, E5/E7; Plan 0039, E5),
 *   public/data/linien/<netz>.json (Linien je Zelle der Tabelle, Plan 0012, E7),
 *   übergangsweise public/data/wegzeit.json und linien.json als Kopie von vgn (bis Plan 0039, S6),
 *   public/a/<id>/, public/p/<publicId>/, public/404.html (Vorschauseiten zum Teilen, Plan 0026, ADR 0020/0022),
 *   public/impressum/index.html (Impressum und Datenschutz, Plan 0034)
 * Ungültige Daten, ein ungültiger oder fehlender Auszug → Exit 1 → kein Build, kein Deploy
 * (`TIMETABLE_REQUIRED`, seit Plan 0009, Schritt 5).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DISTRICTS_BY_REGION } from "../src/domain/districts.ts";
import { icsContextFor, icsForSeries, icsForSession } from "../src/domain/ics.ts";
import { seriesIcsPath, sessionIcsPath } from "../src/domain/ics-paths.ts";
import { NETWORK_IDS, networkOf, regionsOf } from "../src/domain/regions.ts";
import { IMPRINT_PATH } from "../src/domain/share.ts";
import { type SiteMeta, toProviderDirectory, toSiteData } from "../src/domain/site-data.ts";
import { decodeTransitTable, INSIDE_METERS } from "../src/domain/transit.ts";
import { dataSource, loadDataset, loadTimetable, ROOT, TIMETABLE_REQUIRED, timetableIssues } from "./lib/load-data.ts";
import { checkSharePages, imprintPage, notFoundPage, offerSharePage, providerSharePage } from "./lib/share-pages.ts";
import { accessIssues, transitGates } from "./transit/gates.ts";
import { buildTransitTables, cityPrefixes } from "./transit/table.ts";

const source = dataSource();
const result = loadDataset(source);
if (!result.ok) {
  console.error(`✗ Daten ungültig (${source}):\n  ${result.errors.join("\n  ")}`);
  process.exit(1);
}

const publicDir = fileURLToPath(new URL("public/", ROOT));
// angebot/ und anbieter/ (vor ADR 0022) bleiben in der Liste: Ein bestehender Checkout behielte sonst veraltete Seiten,
// und vite preview lieferte sie statt 404.html aus.
for (const dir of ["data", "ics", "a", "p", "angebot", "anbieter", "404.html", IMPRINT_PATH]) {
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
write(`${IMPRINT_PATH}index.html`, imprintPage());
const largest = Math.max(...pages.map((p) => new TextEncoder().encode(p.html).length));

console.log(
  `✓ Daten (${source}): ${meta.offers} Angebote, ${meta.providers} Katalog-Einträge (${directory.providers.length} Anbieter), ${files} ICS-Dateien`,
);
console.log(
  `✓ Vorschauseiten: ${site.offers.length} Angebote, ${directory.providers.length} Anbieter, größte ${(largest / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kB`,
);

// Eine Tabelle je Netz (Plan 0039, E5): Auszug des Netzes, Orte der Angebote seiner Regionen, Zeilen aus deren Kreisen
const regionOf = new Map(result.providers.flatMap((p) => (p.role === "anbieter" ? [[p.publicId, p.region]] : [])));
for (const network of NETWORK_IDS) {
  const timetable = loadTimetable(source, network);
  const timetableCheck = timetableIssues(timetable, { required: TIMETABLE_REQUIRED });
  for (const w of timetableCheck.warnings) console.log(`::warning::${w}`);
  if (timetableCheck.errors.length > 0) {
    console.error(`✗ Wegzeit ${network}:\n  ${timetableCheck.errors.join("\n  ")}`);
    process.exit(1);
  }
  if (timetable.kind !== "ok") continue;
  const places = site.offers.flatMap((o) => {
    const region = regionOf.get(o.providerId);
    return region !== undefined && networkOf(region) === network ? [o.venue.geo] : [];
  });
  const started = performance.now();
  const { table, lines, stats } = buildTransitTables(timetable.timetable, places, cityPrefixes(network));
  const seconds = (performance.now() - started) / 1000;
  write(`data/wegzeit/${network}.json`, JSON.stringify(table));
  write(`data/linien/${network}.json`, JSON.stringify(lines));
  if (network === "vgn") {
    // Übergang bis Plan 0039, S6: Browser, Service Worker und E2E lesen noch die alten Pfade; S6 stellt sie um und
    // entfernt diese Kopie.
    write("data/wegzeit.json", JSON.stringify(table));
    write("data/linien.json", JSON.stringify(lines));
  }
  const took = seconds.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  console.log(`✓ Wegzeit ${network}: ${table.lat.length} Halte × ${table.places.length} Orte in ${took} s`);
  console.log(
    `✓ Linien ${network}: ${stats.lines} Linien, ${stats.combos} Folgen, ${stats.withoutLines} Zellen ohne Linien (davon ${stats.outliers} unpassend)`,
  );
  const gates = transitGates({ network, stats, places: table.places.length, seconds, real: source === "real" });
  for (const w of gates.warnings) console.log(`::warning::${w}`);
  if (gates.errors.length > 0) {
    console.error(`✗ Linien:\n  ${gates.errors.join("\n  ")}`);
    process.exit(1);
  }
  // Jeder wählbare Stadtteil der Regionen des Netzes braucht einen Zugangshalt, sonst hieße es dort „außerhalb des
  // Stadtgebiets“ (Plan 0009, Schritt 5; je Netz seit Plan 0039, E5). Nur im echten Build: Die Fixture-Netze decken
  // nur wenige Stadtteile ab, vgn Gostenhof und Fürth-Innenstadt (Halt 9100, Plan 0036), vrr ein Mini-Netz um
  // Stadtmitte (Düsseldorf) (Plan 0039, E14).
  if (source === "real") {
    const missing = accessIssues(decodeTransitTable(table, new Set(table.places)), network);
    if (missing.length > 0) {
      console.error(`✗ Wegzeit ${network}: ohne Zugangshalt (${INSIDE_METERS} m): ${missing.join(", ")}`);
      process.exit(1);
    }
    const districts = regionsOf(network).reduce((n, r) => n + DISTRICTS_BY_REGION[r].length, 0);
    console.log(`✓ Zugangshalt ${network}: alle ${districts} Stadtteile`);
  }
}
