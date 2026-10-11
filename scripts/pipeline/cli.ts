/**
 * Recherche-Pipeline (Plan 0002). Aufruf: `pnpm pipeline <befehl> …`
 *
 *   init [--from YYYY-MM-DD]                    Laufverzeichnis runs/<from>/ mit Horizont (4 Monate)
 *   select RUN_DIR [--batch 7] [--only a,b]     Pakete für die Subagenten
 *   fetch-page URL [--links] [--max-chars N]    Programmseite als Text (für Agenten)
 *   fetch [--only a,b] [--out DIR] [--compare HASHES_JSON]
 *                                               Abruf aller Eingaben nach Katalog, normalisiert und gehasht (Plan 0032,
 *                                               E3, S1.2): DIR (Standard runs/<heute>/fetch/) bekommt <id>.txt,
 *                                               hashes.json und report.md; --compare = hashes.json der Vornacht.
 *                                               Kein Modell, nichts nach data/.
 *   extract ID [--from DIR]                     Probe der Extraktion eines Anbieters mit dem Modell (Plan 0032, E4):
 *                                               Eingabe aus DIR (Ausgabe von `fetch`), sonst frisch abgerufen;
 *                                               Ergebnis und Aufrufe nach runs/<heute>/extract/<id>.json, nichts nach data/.
 *   candidates fetch|list RUN_DIR               Sammelkalender abrufen / Kandidaten mit Zuordnung zeigen
 *   nightly [--only a,b] [--dry-run]            Nachtlauf (Plan 0032, E5/E6): Abruf, je Anbieter refresh (data/raw),
 *                                               build aus data/raw nach data/offers.json; Bericht
 *                                               runs/<heute>/nightly.json. --dry-run schreibt nach runs/<heute>/raw
 *                                               und runs/<heute>/offers.json. Zeitbudget RUN_BUDGET_MIN (Standard 50).
 *   candidates keep RUN_DIR cid,cid=anbieter/ort [--force]   Entwurf raw/aggregatoren.json schreiben
 *   candidates add-provider RUN_DIR cid --id <neue-id>       Veranstalter in den Katalog aufnehmen
 *   validate-raw DATEI                          Rohdatei prüfen (Pflicht-Abschluss der Subagenten)
 *   holidays FROM TO                            freie Tage (Ferien/Feiertage Bayern)
 *   geocode "Adresse"                           Koordinaten, Stadtteil, Ring
 *   build RUN_DIR                               data/offers.json + RUN_DIR/report.json
 *   publish RUN_DIR                             prüfen, committen, pushen (ADR 0002)
 *   oepnv [--force]                             Fahrplanauszug data/oepnv/fahrplan.json aus dem VGN-Feed
 *                                               (Cache + bedingter GET; unverändert → nichts tun, Plan 0009)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { validateDataset } from "../../src/domain/dataset.ts";
import { addMonths, berlinDate, berlinIsoDate, formatGermanDate, toBerlinIso } from "../../src/domain/time.ts";
import {
  type CallRecord,
  createExtractor,
  EXTRACT_KEY_PARTS,
  type ExtractInput,
  type ExtractOutcome,
  type ExtractResult,
} from "./io/extract.ts";
import { fetchInputs } from "./io/fetch-inputs.ts";
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
import { fetchFeed, readCurrentTimetable, TIMETABLE_FILE, unzipFeed, writeTimetable } from "./io/gtfs.ts";
import { loadFreeDays } from "./io/holidays.ts";
import { fetchPage } from "./io/http.ts";
import { DEFAULT_BUDGET_MIN, runNightly } from "./io/nightly.ts";
import { fetchSource } from "./io/sources.ts";
import { buildOffers } from "./lib/build-offers.ts";
import { draftFromCandidate, looksRegular, providerFromCandidate } from "./lib/draft.ts";
import { inputsFromFetch } from "./lib/extract.ts";
import { compareHashes, HashesFile, renderFetchMarkdown } from "./lib/fetch.ts";
import {
  extractTimetable,
  feedModified,
  feedValidity,
  gtfsTables,
  pickServiceDay,
  serializeTimetable,
  vgnSource,
} from "./lib/gtfs.ts";
import { renderFetchReport } from "./lib/html-extract.ts";
import { anbieterVids, matchCandidate } from "./lib/match.ts";
import { fillPlaceholders } from "./lib/placeholders.ts";
import { RawBatch, validateRaw } from "./lib/raw.ts";
import type { SourceStatus } from "./lib/run.ts";
import { nextBatchFiles, planFetch, selectBatches } from "./lib/select.ts";

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
    out: { type: "string" },
    compare: { type: "string" },
    "dry-run": { type: "boolean", default: false },
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
  // Katalog-URLs mit {von}/{bis} direkt abrufbar (Plan 0031, E3)
  const url = fillPlaceholders(need(args[0], "URL"), today());
  try {
    print(renderFetchReport(await fetchPage(url), { maxChars: Number(values["max-chars"]), links: values.links }));
  } catch (e) {
    print(`## META\nFEHLER: ${(e as Error).message}`);
    process.exit(1);
  }
}

/** Abruf und Hashes ohne Modell (Plan 0032, S1.2). Schreibt nur nach --out, nie nach data/. */
async function fetchCmd() {
  const started = performance.now();
  const date = today();
  const out = values.out ?? join(ROOT, "runs", date, "fetch");
  const catalog = readCatalog();
  const only = values.only?.split(",").filter(Boolean);
  const plan = planFetch(catalog, { today: date, ...(only ? { only } : {}) });
  // Eine unlesbare Vornacht (fehlt, altes Format) heißt nur „kein Vergleich“; sonst bliebe der Cache für immer alt.
  const parsed =
    values.compare && existsSync(values.compare) ? HashesFile.safeParse(readJson(values.compare)) : undefined;
  const previous = parsed?.success ? parsed.data : undefined;
  if (values.compare && !previous)
    print(`Hinweis: ${values.compare} fehlt oder passt nicht zum Format – kein Vergleich (erste Nacht?)`);
  print(
    `Abruf: ${plan.providers.length} Anbieter, ${plan.providers.reduce((s, p) => s + p.pages.length, 0)} Seiten, ` +
      `Sammelkalender ${plan.adapters.map((a) => a.adapter).join(", ") || "keine"}`,
  );
  const result = await fetchInputs(plan, catalog, date);
  mkdirSync(out, { recursive: true });
  for (const [id, text] of Object.entries(result.texts)) writeFileSync(join(out, `${id}.txt`), `${text}\n`);
  writeJson(join(out, "hashes.json"), result.providers);
  const report = renderFetchMarkdown({
    date,
    durationMs: performance.now() - started,
    providers: result.providers,
    adapters: result.adapters,
    skipped: plan.skipped,
    comparison: previous ? compareHashes(previous, result.providers) : undefined,
  });
  writeFileSync(join(out, "report.md"), report);
  print(report);
  print(`✓ ${out}`);
}

/**
 * Probe der Extraktion eines Anbieters (Plan 0032, Stufe 2): Eingabe aus einer Abruf-Ausgabe (`--from DIR`, sonst
 * frisch abgerufen nach runs/<heute>/extract/input/), Ergebnis und Aufrufe nach runs/<heute>/extract/<id>.json.
 * Schreibt nichts nach data/.
 */
async function extractCmd(id: string) {
  const date = today();
  const catalog = readCatalog();
  const provider = catalog.find((p) => p.id === id) ?? fail(`${id}: unbekannter Anbieter`);
  const outDir = join(ROOT, "runs", date, "extract");
  let dir = values.from;
  if (!dir) {
    dir = join(outDir, "input");
    const fetched = await fetchInputs(planFetch(catalog, { today: date, only: [id] }), catalog, date);
    mkdirSync(dir, { recursive: true });
    for (const [pid, text] of Object.entries(fetched.texts)) writeFileSync(join(dir, `${pid}.txt`), `${text}\n`);
    writeJson(join(dir, "hashes.json"), fetched.providers);
  }
  const entry = HashesFile.parse(readJson(join(dir, "hashes.json")))[id];
  const textFile = join(dir, `${id}.txt`);
  if (entry?.status !== "ok" || !existsSync(textFile))
    fail(`${id}: keine Eingabe in ${dir} (${entry?.status ?? "fehlt"}${entry?.reason ? `: ${entry.reason}` : ""})`);
  const text = readFileSync(textFile, "utf8").trimEnd();
  const { candidates, allowedUrls } = inputsFromFetch(text, entry);
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  const started = performance.now();
  const input: ExtractInput = { provider, text, candidates, allowedUrls, today: date };
  const result: ExtractResult = await createExtractor()(input, controller.signal);
  const promptHash = createHash("sha256")
    .update(EXTRACT_KEY_PARTS.prompt)
    .update(EXTRACT_KEY_PARTS.schema)
    .digest("hex")
    .slice(0, 12);
  writeJson(join(outDir, `${id}.json`), { providerId: id, date, chars: text.length, promptHash, ...result });
  const sum = (f: (c: CallRecord) => number) => result.calls.reduce((s, c) => s + f(c), 0);
  const headline = (o: ExtractOutcome) =>
    o.kind === "ok"
      ? `✓ ${o.events.length} Events (${o.model})`
      : o.kind === "fehler"
        ? `✗ fehler: ${o.reason}`
        : `✗ Abbruch: ${o.abort}`;
  print(headline(result.outcome));
  print(
    `Eingabe ${text.length.toLocaleString("de-DE")} Zeichen, ${candidates.length} Kandidaten; ${result.calls.length} Aufrufe ` +
      `(${result.calls.map((c) => `${c.step}/${c.model}: ${c.result}`).join(", ")}); ` +
      `Tokens ein ${sum((c) => c.inputTokens)} + Cache ${sum((c) => c.cacheReadTokens)}/${sum((c) => c.cacheCreationTokens)}, ` +
      `aus ${sum((c) => c.outputTokens)}; Schätzung $${sum((c) => c.costUsd ?? 0).toFixed(4)}; ` +
      `${((performance.now() - started) / 1000).toFixed(1)} s`,
  );
  print(`✓ ${join(outDir, `${id}.json`)}`);
}

/** Nachtlauf (Plan 0032, E6). Rot bei Abbruch, erreichtem Zeitbudget oder gescheitertem Build. */
async function nightly() {
  const date = today();
  const runDir = join(ROOT, "runs", date);
  const only = values.only?.split(",").filter(Boolean);
  const budgetMin = Number(process.env["RUN_BUDGET_MIN"] ?? DEFAULT_BUDGET_MIN);
  if (!(budgetMin > 0)) fail(`RUN_BUDGET_MIN ungültig: ${process.env["RUN_BUDGET_MIN"]}`);
  const dryRun = values["dry-run"];
  // Das Modell gehört in den Cache-Schlüssel (N3): ein Wechsel extrahiert einmal alles neu
  const model = process.env["LLM_MODEL_EXTRACT"] ?? "haiku";
  const r = await runNightly({
    extractor: createExtractor({ model }),
    keyParts: { ...EXTRACT_KEY_PARTS, model },
    budgetMin,
    dataDir: join(ROOT, "data"),
    runDir,
    today: date,
    dryRun,
    ...(only ? { only } : {}),
  });
  const counts = new Map<string, number>();
  for (const s of Object.values(r.results)) counts.set(s, (counts.get(s) ?? 0) + 1);
  const summary = [...counts].map(([k, n]) => `${k} ${n}`).join(", ");
  print(`Nachtlauf ${date}${dryRun ? " (Trockenlauf)" : ""}: ${Math.round(r.durationMs / 1000)} s`);
  print(`Anbieter: ${summary}; Modellaufrufe ${r.calls.length}, durch den Cache gespart ${r.cached}`);
  if (r.abort) print(`✗ Abbruch: ${r.abort}`);
  if (r.budgetHit) print(`✗ Zeitbudget ${budgetMin} Min. erreicht`);
  print(`Angebote: ${r.build.offers}, Termine: ${r.build.sessions}`);
  print(`Bericht: ${join(runDir, "nightly.json")}`);
  if (!r.build.written) fail(`Build abgebrochen, nichts geschrieben:\n  ${r.build.errors.join("\n  ")}`);
  print(`✓ ${r.build.written}`);
  if (r.abort || r.budgetHit) process.exit(1);
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
    const draft = draftFromCandidate(c, { providerId: provider.id, venueId });
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

const germanDate = (instantOrDate: string) => formatGermanDate(berlinIsoDate(instantOrDate));
const count = (n: number) => n.toLocaleString("de-DE");
const kB = (bytes: number) => `${(bytes / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kB`;

/** Fahrplanauszug für die Wegzeit (Plan 0009, E4; Skill-Schritt 0). */
async function oepnv() {
  const started = performance.now();
  const feed = await fetchFeed();
  const modified = feedModified(feed.lastModified);
  print(
    `Feed vom ${germanDate(modified)}: ${feed.status === 304 ? "HTTP 304, unverändert (Cache)" : "HTTP 200, neu geladen"}`,
  );
  const current = readCurrentTimetable();
  if (current?.source.modified === modified && !values.force) {
    print(`✓ Fahrplan aktuell (Stand ${germanDate(modified)}, Stichtag ${current.serviceDay}) – nichts geändert`);
    return;
  }
  const tables = gtfsTables(unzipFeed(feed.zip()));
  const { validFrom, validTo } = feedValidity(tables.calendar, tables.calendarDates);
  const serviceDay = pickServiceDay({
    validFrom,
    validTo,
    freeDays: await loadFreeDays(validFrom, validTo),
    today: today(),
  });
  const source = vgnSource({ lastModified: feed.lastModified, fetchedAt: feed.fetchedAt, validFrom, validTo });
  const { timetable, stats } = extractTimetable(tables, { serviceDay, source });
  const text = serializeTimetable(timetable);
  writeTimetable(text);
  const seconds = ((performance.now() - started) / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  print(
    `${source.title}, gültig ${germanDate(validFrom)}–${germanDate(validTo)}, Stichtag Di ${germanDate(serviceDay)}`,
  );
  print(
    `Steige ${count(stats.stops)}, Fahrten ${count(stats.trips)}, Verbindungen ${count(stats.connections)} ` +
      `(Bedarfsverkehr weggelassen: ${count(stats.demandTrips)} Fahrten)`,
  );
  const bytes = Buffer.byteLength(text);
  print(
    `✓ ${TIMETABLE_FILE.slice(ROOT.length)} geschrieben: ${kB(bytes)} roh, ${kB(gzipSync(text).length)} gzip, ` +
      `${count(text.split("\n").length - 1)} Zeilen, Laufzeit ${seconds} s`,
  );
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
  case "fetch":
    await fetchCmd();
    break;
  case "extract":
    await extractCmd(need(args[0], "Anbieter-ID"));
    break;
  case "nightly":
    await nightly();
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
    print(g);
    break;
  }
  case "build":
    await build(need(args[0], "RUN_DIR"));
    break;
  case "publish":
    publish(need(args[0], "RUN_DIR"));
    break;
  case "oepnv":
    await oepnv();
    break;
  default:
    fail(`Unbekannter Befehl: ${command ?? "(keiner)"} – siehe Kopf von scripts/pipeline/cli.ts`);
}
