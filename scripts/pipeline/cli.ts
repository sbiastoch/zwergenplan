/**
 * Recherche-Pipeline (Plan 0002). Aufruf: `pnpm pipeline <befehl> …`
 *
 *   init [--from YYYY-MM-DD]                    Laufverzeichnis runs/<from>/ mit Horizont (4 Monate)
 *   select RUN_DIR [--batch 7] [--only a,b]     Pakete für die Subagenten
 *   fetch-page URL [--links] [--max-chars N]    Programmseite als Text (für Agenten)
 *   candidates fetch|list RUN_DIR               Sammelkalender abrufen / Kandidaten mit Zuordnung zeigen
 *   candidates keep RUN_DIR cid,cid=anbieter/ort [--force]   Entwurf raw/aggregatoren.json schreiben
 *   candidates add-provider RUN_DIR cid --id <neue-id>       Veranstalter in den Katalog aufnehmen
 *   validate-raw DATEI                          Rohdatei prüfen (Pflicht-Abschluss der Subagenten)
 *   holidays FROM TO                            freie Tage (Ferien/Feiertage Bayern)
 *   geocode "Adresse"                           Koordinaten, Stadtteil, Ring
 *   build RUN_DIR                               data/offers.json + RUN_DIR/report.json
 *   publish RUN_DIR                             prüfen, committen, pushen (ADR 0002)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { validateDataset } from "../../src/domain/dataset.ts";
import type { Provider } from "../../src/domain/schema.ts";
import { addMonths, berlinDate, toBerlinIso } from "../../src/domain/time.ts";
import {
  appendToCatalog,
  batchFileFor,
  batchProviders,
  CATALOG,
  candidatesOf,
  checkedAtOf,
  git,
  ROOT,
  readCatalog,
  readJson,
  readMeta,
  readPreviousOffers,
  sourceStatus,
  writeJson,
  writeOffers,
} from "./io/files.ts";
import { geocode } from "./io/geocode.ts";
import { loadFreeDays } from "./io/holidays.ts";
import { fetchPage } from "./io/http.ts";
import { fetchSource } from "./io/sources.ts";
import { buildOffers } from "./lib/build-offers.ts";
import { draftFromCandidate, looksRegular, providerFromCandidate } from "./lib/draft.ts";
import { renderFetchReport } from "./lib/html-extract.ts";
import { matchCandidate, vidOf } from "./lib/match.ts";
import { RawBatch, validateRaw } from "./lib/raw.ts";
import { classifyRing } from "./lib/ring.ts";
import type { SourceStatus } from "./lib/run.ts";
import { nextBatchFiles, selectBatches } from "./lib/select.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: "string" },
    batch: { type: "string", default: "7" },
    only: { type: "string" },
    links: { type: "boolean", default: false },
    "max-chars": { type: "string", default: "60000" },
    force: { type: "boolean", default: false },
    id: { type: "string" },
  },
});
const [command, ...args] = positionals;

const Selection = z.object({
  batches: z.array(z.object({ file: z.string(), raw: z.string(), providers: z.array(z.string()) })),
});

const today = () => {
  const { year, month, day } = berlinDate(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const need = (value: string | undefined, what: string): string => {
  if (!value) fail(`${what} fehlt (siehe Kopf von scripts/pipeline/cli.ts)`);
  return value;
};
function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}
const print = (value: unknown) => console.log(typeof value === "string" ? value : JSON.stringify(value, null, 1));

/** Ferien weit genug für Kurse mit vergangenen und künftigen Terminen (Plan 0002, E6). */
const freeDaysFor = (meta: { from: string; to: string }) =>
  loadFreeDays(addMonths(meta.from, -12), addMonths(meta.to, 24));

const anbieterVids = (catalog: readonly Provider[], aggregatorId: string) =>
  catalog.flatMap((p) => (p.role === "anbieter" && p.coveredBy === aggregatorId ? vidOf(p) : []));

async function init() {
  const from = values.from ?? today();
  const runDir = join(ROOT, "runs", from);
  writeJson(join(runDir, "meta.json"), { from, to: addMonths(from, 4), startedAt: toBerlinIso(new Date()) });
  print(`✓ ${runDir} (Horizont ${from} – ${addMonths(from, 4)})`);
}

function select() {
  const runDir = need(args[0], "RUN_DIR");
  readMeta(runDir);
  const only = values.only?.split(",").filter(Boolean);
  const existing = readdirSync(runDir).filter((f) => /^batch-\d+\.json$/.test(f));
  if (!only && existing.length > 0 && !values.force)
    fail(`${runDir} hat schon Pakete – Nachprüfen mit --only, Neuaufteilung nur mit --force`);
  const s = selectBatches(readCatalog(), { batchSize: Number(values.batch), ...(only ? { only } : {}) });
  const names = nextBatchFiles(only ? existing : [], s.batches.length);
  const files = s.batches.map((b, i) => {
    const name = names[i] ?? fail("Paketname fehlt");
    writeJson(join(runDir, name), b);
    return { file: name, raw: `raw/${name}`, providers: b.map((p) => p.id) };
  });
  const selectionFile = join(runDir, "selection.json");
  const previous = only && existsSync(selectionFile) ? Selection.parse(readJson(selectionFile)).batches : [];
  writeJson(selectionFile, { batches: [...previous, ...files], adapters: s.adapters, skipped: s.skipped });
  print({ batches: files, adapters: s.adapters, skipped: s.skipped.length });
}

async function fetchPageCmd() {
  const url = need(args[0], "URL");
  try {
    print(renderFetchReport(await fetchPage(url), { maxChars: Number(values["max-chars"]), links: values.links }));
  } catch (e) {
    print(`## META\nFEHLER: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function candidatesFetch(runDir: string) {
  const meta = readMeta(runDir);
  const catalog = readCatalog();
  const status: Record<string, SourceStatus> = {};
  for (const agg of catalog) {
    if (agg.role !== "aggregator" || !agg.adapter) continue;
    const fetchedAt = toBerlinIso(new Date());
    try {
      const r = await fetchSource(agg.adapter, meta.from, meta.to, { vids: anbieterVids(catalog, agg.id) });
      writeJson(join(runDir, "candidates", `${agg.adapter}.json`), r.candidates);
      status[agg.adapter] = {
        status: r.candidates.length > 0 ? "ok" : "keine-termine",
        count: r.candidates.length,
        fetchedAt,
        ...(r.warnings.length > 0 ? { warnings: r.warnings } : {}),
      };
    } catch (e) {
      status[agg.adapter] = { status: "fehler", reason: (e as Error).message.slice(0, 300), fetchedAt };
    }
  }
  writeJson(join(runDir, "candidates", "_status.json"), status);
  print(status);
}

function candidatesList(runDir: string) {
  const catalog = readCatalog();
  for (const c of candidatesOf(runDir)) {
    const m = matchCandidate(c, catalog);
    const target = m.kind === "ok" ? `→ ${m.providerId}/${m.venueId} (${m.via})` : `? ${m.reason}`;
    const flags = [c.cancelled && "ABGESAGT", c.weekly || looksRegular(c.occurrences) ? "Reihe" : ""]
      .filter(Boolean)
      .join(" ");
    const snip = (c.subtitle ?? c.description).replace(/\s+/g, " ").slice(0, 70);
    print(
      `${c.cid.padEnd(6)} | ${c.occurrences[0]?.start} (+${c.occurrences.length - 1}) ${flags} | ${c.title.slice(0, 55)} | ${(c.organizer ?? "").slice(0, 30)} | ${target} | ${snip}`,
    );
  }
}

function candidatesKeep(runDir: string, spec: string) {
  const out = join(runDir, "raw", "aggregatoren.json");
  if (existsSync(out) && !values.force) fail(`${out} existiert (evtl. schon bearbeitet) – mit --force überschreiben`);
  const catalog = readCatalog();
  const byId = new Map(catalog.map((p) => [p.id, p] as const));
  const all = new Map(candidatesOf(runDir).map((c) => [c.cid, c] as const));
  const events: unknown[] = [];
  const problems: string[] = [];
  for (const item of spec.split(",").filter(Boolean)) {
    const [cid = "", override] = item.split("=");
    const c = all.get(cid);
    if (!c) {
      problems.push(`${cid}: unbekannter Kandidat`);
      continue;
    }
    const m = matchCandidate(c, catalog);
    const [providerId, venueId] = override?.split("/") ?? (m.kind === "ok" ? [m.providerId, m.venueId] : []);
    const provider = providerId ? byId.get(providerId) : undefined;
    if (!provider || !venueId) {
      problems.push(
        `${cid}: keine Zuordnung – cid=anbieter/ort angeben oder add-provider (${m.kind === "offen" ? m.reason : ""})`,
      );
      continue;
    }
    const draft = draftFromCandidate(c, { providerId: provider.id, venueId }, provider);
    if (!draft) {
      print(`  ${cid}: abgesagt – übersprungen`);
      continue;
    }
    events.push(draft.event);
    print(`  ${cid} → events.${events.length - 1}: offen ${draft.open.join(", ")}`);
  }
  if (problems.length > 0) fail(`Nichts geschrieben:\n  ${problems.join("\n  ")}`);
  writeJson(out, { providers: {}, events });
  print(`✓ ${events.length} Entwürfe in ${out} – offene Felder füllen, dann \`pnpm pipeline validate-raw ${out}\``);
}

async function addProvider(runDir: string, cid: string) {
  const id = need(values.id, "--id");
  const catalog = readCatalog();
  if (catalog.some((p) => p.id === id)) fail(`${id} gibt es schon`);
  const c = candidatesOf(runDir).find((x) => x.cid === cid) ?? fail(`${cid}: unbekannter Kandidat`);
  const geo =
    c.geo ?? (c.address ? await geocode(c.address) : undefined) ?? fail(`${cid}: keine Koordinaten – Adresse prüfen`);
  const district = "district" in geo && typeof geo.district === "string" ? geo.district : undefined;
  const entry = providerFromCandidate(c, {
    id,
    geo: { lat: geo.lat, lon: geo.lon, district },
    catalog,
    today: today(),
  });
  const check = validateDataset([...catalog, entry], {
    generatedAt: toBerlinIso(new Date()),
    horizon: { from: today(), to: today() },
    offers: [],
  });
  if (!check.ok) fail(`Eintrag ungültig, nichts geschrieben:\n  ${check.errors.join("\n  ")}`);
  appendToCatalog([entry]);
  print(
    `✓ ${id} in ${CATALOG} aufgenommen (Ort ${entry.venues[0]?.id}) – Felder prüfen, dann \`candidates keep … ${cid}\``,
  );
}

async function validateRawCmd(file: string) {
  const runDir = dirname(dirname(file));
  const meta = readMeta(runDir);
  const batchFile = batchFileFor(file);
  const expected = existsSync(batchFile) ? batchProviders(batchFile) : undefined;
  const r = validateRaw(readJson(file), {
    providers: readCatalog(),
    ...(expected ? { expected } : {}),
    horizon: meta,
    freeDays: await freeDaysFor(meta),
  });
  for (const w of r.warnings) console.log(`⚠ ${w}`);
  if (!r.ok) fail(`${file}:\n  ${r.errors.join("\n  ")}`);
  print(`✓ ${file}: ${r.batch.events.length} Events, ${Object.keys(r.batch.providers).length} Anbieter-Status`);
}

async function build(runDir: string) {
  const meta = readMeta(runDir);
  const catalog = readCatalog();
  const freeDays = await freeDaysFor(meta);
  const errors: string[] = [];
  const batchFiles = readdirSync(runDir).filter((f) => /^batch-\d+\.json$/.test(f));
  const rawDir = join(runDir, "raw");
  const rawFiles = existsSync(rawDir) ? readdirSync(rawDir).filter((f) => f.endsWith(".json")) : [];
  for (const f of batchFiles) if (!rawFiles.includes(f)) errors.push(`raw/${f} fehlt (Paket ${f} ohne Ergebnis)`);
  const status = sourceStatus(runDir);
  // Sammelkalender: Stand ist der Abruf (candidates/_status.json), nicht die Bearbeitung des Entwurfs (Plan 0002, E5).
  const fetched = Object.values(status)
    .flatMap((s) => (s ? [s.fetchedAt] : []))
    .sort();
  const checkedAt = (name: string, file: string) =>
    name === "aggregatoren.json" && fetched[0] ? fetched[0] : checkedAtOf(file);
  const batches = [];
  for (const f of rawFiles.sort()) {
    const file = join(rawDir, f);
    const expected = batchFiles.includes(f) ? batchProviders(join(runDir, f)) : undefined;
    const r = validateRaw(readJson(file), {
      providers: catalog,
      ...(expected ? { expected } : {}),
      horizon: meta,
      freeDays,
    });
    if (!r.ok) errors.push(...r.errors.map((e) => `raw/${f} ${e}`));
    else
      batches.push({ name: f.replace(/\.json$/, ""), batch: RawBatch.parse(r.batch), checkedAt: checkedAt(f, file) });
  }
  if (errors.length > 0) fail(`Rohdaten unvollständig oder ungültig:\n  ${errors.join("\n  ")}`);
  const sources = Object.fromEntries(Object.entries(status).map(([k, v]) => [k, v?.status]));
  const { file, report } = buildOffers({
    batches,
    providers: catalog,
    previous: readPreviousOffers(),
    freeDays,
    horizon: { from: meta.from, to: meta.to },
    generatedAt: toBerlinIso(new Date()),
    sources,
  });
  const sourceFailures = Object.entries(status).flatMap(([k, v]) =>
    v?.status === "fehler" ? [{ id: k, reason: v.reason ?? "" }] : [],
  );
  writeJson(join(runDir, "report.json"), { ...report, sources: status });
  print(`Angebote: ${report.offers}, Termine: ${report.sessions}`);
  print(
    `Anbieter: ok ${report.providers.ok.length}, keine Termine ${report.providers["keine-termine"].length}, fehler ${report.providers.fehler.length}`,
  );
  for (const f of [...report.failures, ...sourceFailures]) print(`  ✗ ${f.id}: ${f.reason}`);
  for (const d of report.drift) print(`  ↻ Drift ${d.id}: ${d.drift}`);
  print(`Hinweise: ${report.notes.length} (Details in ${join(runDir, "report.json")})`);
  if (!file) fail(`Build abgebrochen, nichts geschrieben:\n  ${report.errors.join("\n  ")}`);
  writeOffers(file);
  print("✓ data/offers.json geschrieben");
}

function publish(runDir: string) {
  const meta = readMeta(runDir);
  if (git(["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") fail("publish nur auf main (ADR 0002)");
  git(["fetch", "--quiet", "origin", "main"]);
  try {
    git(["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
  } catch {
    fail("main liegt nicht per Fast-Forward auf origin/main – erst integrieren");
  }
  const dirty = git(["status", "--porcelain"])
    .split("\n")
    .filter(Boolean)
    .filter((l) => !l.slice(3).startsWith("data/"));
  if (dirty.length > 0) fail(`Änderungen außerhalb von data/ – erst separat committen:\n  ${dirty.join("\n  ")}`);
  execFileSync("node", ["scripts/validate-data.ts", "--against-deployed"], { cwd: ROOT, stdio: "inherit" });
  const offers = readPreviousOffers();
  const message = `data: Pipeline-Lauf ${meta.from} (${offers?.offers.length ?? 0} Angebote, ${readCatalog().length} Anbieter)`;
  git(["add", "data/"]);
  execFileSync("git", ["commit", "-m", message], { cwd: ROOT, stdio: "inherit" });
  execFileSync("git", ["push", "origin", "main"], { cwd: ROOT, stdio: "inherit" });
  print(`✓ ${message} – jetzt \`gh run watch\` und Live-Seite prüfen`);
}

switch (command) {
  case "init":
    await init();
    break;
  case "select":
    select();
    break;
  case "fetch-page":
    await fetchPageCmd();
    break;
  case "candidates": {
    const [sub, runDir, extra] = args;
    const dir = need(runDir, "RUN_DIR");
    if (sub === "fetch") await candidatesFetch(dir);
    else if (sub === "list") candidatesList(dir);
    else if (sub === "keep") candidatesKeep(dir, need(extra, "Kandidaten-Liste"));
    else if (sub === "add-provider") await addProvider(dir, need(extra, "cid"));
    else fail("candidates fetch|list|keep|add-provider");
    break;
  }
  case "validate-raw":
    await validateRawCmd(need(args[0], "DATEI"));
    break;
  case "holidays":
    print(await loadFreeDays(need(args[0], "FROM"), need(args[1], "TO")));
    break;
  case "geocode": {
    const g = (await geocode(need(args[0], "Adresse"))) ?? fail("nicht gefunden");
    print({ ...g, ...classifyRing(g.lat, g.lon, g.district) });
    break;
  }
  case "build":
    await build(need(args[0], "RUN_DIR"));
    break;
  case "publish":
    publish(need(args[0], "RUN_DIR"));
    break;
  default:
    fail(`Unbekannter Befehl: ${command ?? "(keiner)"} – siehe Kopf von scripts/pipeline/cli.ts`);
}
