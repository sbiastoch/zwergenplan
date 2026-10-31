/**
 * Recherche-Pipeline (Plan 0002). Aufruf: `pnpm pipeline <befehl> …`
 *
 *   fetch-page URL [--links] [--max-chars N]    Programmseite als Text (Katalogpflege)
 *   fetch [--only a,b] [--out DIR] [--compare HASHES_JSON]
 *                                               Abruf aller Eingaben nach Katalog, normalisiert und gehasht (Plan 0032,
 *                                               E3, S1.2): DIR (Standard runs/<heute>/fetch/) bekommt <id>.txt,
 *                                               hashes.json und report.md; --compare = hashes.json der Vornacht.
 *                                               Kein Modell, nichts nach data/. --abruf beide ruft alles zweimal ab
 *                                               (alt, dann neu) und vergleicht (Plan 0048, S3); Hashes aus neu.
 *   --abruf alt|neu                             für jeden Befehl mit Abruf (Plan 0048, E8): neu (Standard seit N1) mit
 *                                               User-Agent zwergenplan und robots.txt, alt (Rückfall) mit Browser-UA.
 *   extract ID [--from DIR]                     Probe der Extraktion eines Anbieters mit dem Modell (Plan 0032, E4):
 *                                               Eingabe aus DIR (Ausgabe von `fetch`), sonst frisch abgerufen;
 *                                               Ergebnis und Aufrufe nach runs/<heute>/extract/<id>.json, nichts nach data/.
 *                                               Eval aller eingefrorenen Fälle: `pnpm eval` (scripts/pipeline/eval.ts, E9).
 *   nightly [--only a,b] [--dry-run] [--umstellen a,b]
 *                                               Nachtlauf (Plan 0032, E5/E6; Plan 0048): Abruf, je Seite refresh (data/raw),
 *                                               build aus data/raw nach data/offers.json, Zeile in data/kosten.csv;
 *                                               Bericht runs/<heute>/nightly.json, Kosten runs/<heute>/kosten.jsonl.
 *                                               --dry-run schreibt raw/, offers.json und kosten.csv nach
 *                                               runs/<heute>/. Zeitbudget RUN_BUDGET_MIN (Standard 50), Bremsen
 *                                               MAX_CALLS (150) und MAX_TOKENS (3 Mio., Opus-Gegenwert) (E8). Rot nur, wenn der
 *                                               Build scheitert; die Ampel rechnet `status`. --umstellen stellt diese
 *                                               Anbieter auch bei Einbruch oder gescheiterter Seite auf V2 um (E7).
 *   nightly --build-only                        Nur Neubau von data/offers.json aus data/raw und Katalog (gleicher
 *                                               Build, Horizont und ID-Abgleich wie der Nachtlauf), ohne Abruf, ohne
 *                                               Modell, ohne Bericht und kosten.csv; entfernt data/raw/<id>.json von
 *                                               Anbietern, die nicht mehr im Katalog stehen. Nach der Rücknahme eines
 *                                               Anbieters vor `pnpm data:validate`. Freie Tage aus dem Cache, sonst Netz.
 *   status [RUN_DIR] [--gates X] [--push X] [--report-only] [--waechter]
 *                                               Bericht des Nachtlaufs (E10) aus RUN_DIR/nightly.json (Standard
 *                                               runs/<heute>): Ampel nach E6, Fehler, Einbrüche, Kosten, Live-Stand.
 *                                               --gates/--push: Ausgang der Workflow-Schritte. Schreibt auch nach
 *                                               $GITHUB_STEP_SUMMARY und `ampel=` nach $GITHUB_OUTPUT. Exit 1 bei
 *                                               rot, außer mit --report-only. --waechter: Befunde des Wächters
 *                                               (Plan 0048, E10) nach RUN_DIR/waechter.md (leer: nichts offen) und
 *                                               in den Bericht; nur mit nightly.json.
 *   discover [--region <id>] [--bootstrap] [--dry-run] [--terms a,b] [--eval] [--run-dir <pfad>]
 *            [--model <name>] [--effort <stufe>]
 *                                               Entdecken neuer Anbieter (Plan 0032, E7) je Region aus REGION_IDS:
 *                                               Sammelkalender, Verzeichnisse, Websuche → Vorfilter → Bewerten →
 *                                               Geocodieren → Ertragsbeweis (refreshProvider) → je Anbieter ein Commit
 *                                               nach G1/G2 (G4), am Ende ein Commit mit data/discover und kosten.csv.
 *                                               --dry-run: alles echt, aber nur nach runs/<heute>/discover/, kein
 *                                               Commit. G3: höchstens 10 neue je Region, mit --bootstrap MAX_NEW
 *                                               (Standard 30). Bremsen MAX_CALLS (1500), MAX_TOKENS (150 Mio.),
 *                                               Zeitbudget RUN_BUDGET_MIN (240). --terms: nur diese Suchbegriffe (Probe).
 *                                               --eval (nur mit --dry-run, ohne --region): Entdecken-Eval (Plan 0050,
 *                                               E6) für Nürnberg und Fürth; die Stichprobe aus evals/discover.json
 *                                               gilt als unbekannt, ohne zurückgestellte, Klärfälle und G3; Bericht
 *                                               mit Kennzahlen je Stufe, Ertrag gegen die Referenz, Urteilen aus
 *                                               evals/discover-urteile.json und der Zeile für evals/results.md.
 *                                               Eigenes Laufverzeichnis (-2, -3 …) oder --run-dir. Modell: Opus high
 *                                               für alle fünf LLM_*-Variablen, soweit nicht gesetzt.
 *                                               --model/--effort: Suche und Bewerten (vor LLM_*_DISCOVER).
 *   discover-publish RUN_DIR                    Commits des Entdeckens nach main (pull --rebase, validate-data,
 *                                               push); schreibt RUN_DIR/issue.md, wenn ein Anbieter neu ist (E7.10).
 *   holidays FROM TO                            freie Tage (Ferien/Feiertage Bayern)
 *   geocode "Adresse" [--region <id>] [--venue <Name>]
 *                                               Koordinaten, Stadtteil, Stufe (Plan 0050, E5); Region Standard
 *                                               nuernberg, höchstens 4 Anfragen pro Minute (15 s Abstand), gecacht.
 *   geocode --faelle [--aufzeichnen]            Prüffälle tests/fixtures/pipeline/geocode-faelle.json live, ohne
 *                                               Katalog und Caches; --aufzeichnen schreibt die Antworten für die
 *                                               Unit-Tests nach geocode-aufnahmen.json. Exit 1 bei Abweichung.
 *   publish RUN_DIR                             Nachtlauf veröffentlichen (E6, aus RUN_DIR/nightly.json): nur auf main,
 *                                               nur data/raw, data/offers.json, data/kosten.csv, Commit-Text mit
 *                                               Kurzbericht, `pull --rebase` vor dem Push.
 *   oepnv [--force]                             Fahrplanauszug data/oepnv/fahrplan.json aus dem VGN-Feed
 *                                               (Cache + bedingter GET; unverändert → nichts tun, Plan 0009)
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { REGION_IDS, type RegionId } from "../../src/domain/regions.ts";
import { berlinDate, berlinIsoDate, formatGermanDate, toBerlinIso } from "../../src/domain/time.ts";
import {
  createDiscoverModel,
  DISCOVER_BUDGET_MIN,
  fetchAggregatorCandidates,
  readDiscoverStates,
  runDiscover,
} from "./io/discover.ts";
import { commitNewProvider, commitRunState, GateError, publishDiscover } from "./io/discover-git.ts";
import {
  type CallRecord,
  createExtractor,
  EXTRACT_KEY_PARTS,
  type ExtractInput,
  type ExtractOutcome,
  type ExtractResult,
  effortOf,
  modelKey,
} from "./io/extract.ts";
import { fetchInputs, fetchPdfText } from "./io/fetch-inputs.ts";
import {
  DISCOVER_EVAL,
  DISCOVER_URTEILE,
  git,
  ROOT,
  readCatalog,
  readIdAcceptanceOrWarn,
  readJson,
  readPreviousOffers,
  readRawDir,
  writeJson,
} from "./io/files.ts";
import { checkFaelle, createGeocoder, GeocodeFaelle, recordingKey } from "./io/geocode.ts";
import { fetchFeed, readCurrentTimetable, TIMETABLE_FILE, unzipFeed, writeTimetable } from "./io/gtfs.ts";
import { loadFreeDays } from "./io/holidays.ts";
import { fetchPage, setAbruf } from "./io/http.ts";
import { createJudge } from "./io/judge.ts";
import { liveStatus } from "./io/live.ts";
import { EFFORTS } from "./io/llm.ts";
import { DEFAULT_BUDGET_MIN, runBuildOnly, runNightly } from "./io/nightly.ts";
import { publishNightly } from "./io/publish.ts";
import type { Candidate } from "./lib/candidate.ts";
import { DISCOVER_BRAKES, parseBrakes } from "./lib/cost.ts";
import { abortOf, MAX_NEW_PER_RUN, newProvidersIssue, renderDiscoverReport } from "./lib/discover.ts";
import { selectTerms } from "./lib/discover-terms.ts";
import { DiscoverEvalSchema, evalRegions, freshRunDir, modelEnv, UrteileSchema } from "./lib/eval-discover.ts";
import { promptHash } from "./lib/eval-score.ts";
import { inputsFromFetch } from "./lib/extract.ts";
import { compareAbruf, compareHashes, HashesFile, renderAbrufVergleich, renderFetchMarkdown } from "./lib/fetch.ts";
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
import { fillPlaceholders } from "./lib/placeholders.ts";
import { acceptanceFor, type ProviderRaw } from "./lib/raw.ts";
import { offerUnits } from "./lib/refresh.ts";
import { assessRun, NightlyReport, nightlyCommitMessage, renderStatus, type StepOutcome } from "./lib/report.ts";
import { planFetch } from "./lib/select.ts";
import { watchFindings, watchIssue } from "./lib/watch.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: "string" },
    only: { type: "string" },
    links: { type: "boolean", default: false },
    "max-chars": { type: "string", default: "60000" },
    force: { type: "boolean", default: false },
    out: { type: "string" },
    compare: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    gates: { type: "string" },
    push: { type: "string" },
    "report-only": { type: "boolean", default: false },
    waechter: { type: "boolean", default: false },
    region: { type: "string" },
    bootstrap: { type: "boolean", default: false },
    terms: { type: "string" },
    eval: { type: "boolean", default: false },
    "run-dir": { type: "string" },
    model: { type: "string" },
    effort: { type: "string" },
    "build-only": { type: "boolean", default: false },
    umstellen: { type: "string" },
    venue: { type: "string" },
    faelle: { type: "boolean", default: false },
    aufzeichnen: { type: "boolean", default: false },
    abruf: { type: "string" },
  },
});
const [command, ...args] = positionals;
// Schalter des Abrufs (Plan 0048, E8), vorübergehend bis N1; `beide` nur für `fetch`
const abrufValue = values.abruf ?? "neu";
if (!(abrufValue === "alt" || abrufValue === "neu" || (abrufValue === "beide" && command === "fetch"))) {
  console.error(`✗ --abruf: alt oder neu erwartet${command === "fetch" ? " (oder beide)" : ""}, nicht ${abrufValue}`);
  process.exit(1);
}
setAbruf(abrufValue === "neu" ? "neu" : "alt");

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
  // bei `beide` zuerst alt; Texte und Hashes sind die des neuen Abrufs (Standard, Cache der Vornacht)
  const alt = abrufValue === "beide" ? await fetchInputs(plan, catalog, date) : undefined;
  if (alt) {
    setAbruf("neu");
    print("Abruf neu (User-Agent zwergenplan, robots.txt) zum Vergleich");
  }
  const result = await fetchInputs(plan, catalog, date);
  const vergleich = alt
    ? renderAbrufVergleich(compareAbruf(alt.providers, result.providers), { alt: alt.adapters, neu: result.adapters })
    : "";
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
  const full = `${report}${vergleich === "" ? "" : `\n${vergleich}`}`;
  writeFileSync(join(out, "report.md"), full);
  print(full);
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
  // frisch abgerufen: Kandidaten und erlaubte URLs direkt aus dem Abruf wie im Nachtlauf (samt Redirect-Zielen)
  let fresh:
    | { candidates: readonly Candidate[]; allowedUrls: readonly string[]; pageUrls: readonly string[] }
    | undefined;
  if (!dir) {
    dir = join(outDir, "input");
    const fetched = await fetchInputs(planFetch(catalog, { today: date, only: [id] }), catalog, date);
    mkdirSync(dir, { recursive: true });
    for (const [pid, text] of Object.entries(fetched.texts)) writeFileSync(join(dir, `${pid}.txt`), `${text}\n`);
    writeJson(join(dir, "hashes.json"), fetched.providers);
    const own = fetched.inputs[id];
    if (own)
      fresh = { candidates: own.candidates, allowedUrls: own.allowedUrls, pageUrls: own.pages.map((p) => p.url) };
  }
  const entry = HashesFile.parse(readJson(join(dir, "hashes.json")))[id];
  const textFile = join(dir, `${id}.txt`);
  if (entry?.status !== "ok" || !existsSync(textFile))
    fail(`${id}: keine Eingabe in ${dir} (${entry?.status ?? "fehlt"}${entry?.reason ? `: ${entry.reason}` : ""})`);
  const text = readFileSync(textFile, "utf8").trimEnd();
  const { candidates, allowedUrls, pageUrls } = fresh ?? {
    ...inputsFromFetch(text, entry),
    pageUrls: entry.pages.flatMap((p) => (p.ok ? [p.url] : [])),
  };
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  const started = performance.now();
  const input: ExtractInput = { provider, text, pageUrls, candidates, allowedUrls, today: date };
  const result: ExtractResult = await createExtractor()(input, controller.signal);
  const hash = promptHash(EXTRACT_KEY_PARTS);
  writeJson(join(outDir, `${id}.json`), { providerId: id, date, chars: text.length, promptHash: hash, ...result });
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

/** Schreibt `name=value` nach $GITHUB_OUTPUT, wenn der Lauf in Actions steckt. */
function actionsOutput(name: string, value: string): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

/**
 * Nachtlauf (Plan 0032, E6). Rot (Exit 1) nur, wenn der Build scheitert: Abbruch, Zeitbudget und Bremse beenden den
 * Lauf geordnet, Fertiges wird gesichert und darf nach grünen Gates gepusht werden (E6); die Ampel rechnet `status`.
 */
async function nightly() {
  const date = today();
  if (values["build-only"]) return buildOnly(date);
  const runDir = join(ROOT, "runs", date);
  actionsOutput("run_dir", runDir);
  const only = values.only?.split(",").filter(Boolean);
  const budgetMin = Number(process.env["RUN_BUDGET_MIN"] || DEFAULT_BUDGET_MIN);
  if (!(budgetMin > 0)) fail(`RUN_BUDGET_MIN ungültig: ${process.env["RUN_BUDGET_MIN"]}`);
  const brakes = parseBrakes(process.env);
  if (!brakes.ok) fail(brakes.error);
  const dryRun = values["dry-run"];
  // nach Prüfung erzwungene Umstellung einzelner Anbieter (Plan 0048, E7); Daten schreibt nur der Workflow
  const umstellen = values.umstellen?.split(",").filter(Boolean);
  for (const id of umstellen ?? [])
    if (!readCatalog().some((p) => p.id === id)) fail(`--umstellen: unbekannter Anbieter ${id}`);
  // Modell und Effort gehören in den Cache-Schlüssel (N3): ein Wechsel extrahiert einmal alles neu
  const model = process.env["LLM_MODEL_EXTRACT"] ?? "haiku";
  const effort = effortOf(process.env);
  const acceptance = readIdAcceptanceOrWarn(join(ROOT, "data"), (m) =>
    print(`::warning::Hinnehmen-Datei unlesbar, nichts hingenommen: ${m}`),
  );
  const r = await runNightly({
    extractor: createExtractor({ model }),
    keyParts: { ...EXTRACT_KEY_PARTS, model: modelKey(model, effort) },
    // immer, auch bei gleichem Fallback-Modell (Plan 0048, E5)
    strongRetry: true,
    // ID-Gate (ADR 0041): Richter mit LLM_MODEL_JUDGE (Standard opus), Hinnehmen aus data/id-hinnehmen.yaml
    judge: createJudge(),
    accepted: (providerId, heldSince) => acceptanceFor(acceptance, providerId, heldSince, date),
    ...(umstellen ? { forceMigrate: umstellen } : {}),
    budgetMin,
    brakes: brakes.brakes,
    dataDir: join(ROOT, "data"),
    runDir,
    today: date,
    now: () => toBerlinIso(new Date()),
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
  if (r.brake)
    print(`✗ Bremse ${r.brake} erreicht (MAX_CALLS ${brakes.brakes.maxCalls}, MAX_TOKENS ${brakes.brakes.maxTokens})`);
  print(`Angebote: ${r.build.offers}, Termine: ${r.build.sessions}`);
  print(`Bericht: ${join(runDir, "nightly.json")} – Ampel: pnpm pipeline status ${runDir}`);
  if (!r.build.written) fail(`Build abgebrochen, nichts geschrieben:\n  ${r.build.errors.join("\n  ")}`);
  print(`✓ ${r.build.written}`);
}

/** Neubau ohne Modell nach einer Rücknahme (Arch-Review S5, M1); rot, wenn der Build scheitert. */
async function buildOnly(date: string) {
  const r = await runBuildOnly({ dataDir: join(ROOT, "data"), today: date, now: () => toBerlinIso(new Date()) });
  if (r.removed.length > 0) print(`Zustand entfernt (nicht mehr im Katalog): ${r.removed.join(", ")}`);
  print(`Angebote: ${r.build.offers}, Termine: ${r.build.sessions}`);
  if (!r.build.written) fail(`Build abgebrochen, nichts geschrieben:\n  ${r.build.errors.join("\n  ")}`);
  print(`✓ ${r.build.written}`);
}

/** Umgebung der Gates: ohne Modell-Token und ohne Push-Header (das Modell und git brauchen sie, Tests nicht) */
const gateEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith("GIT_CONFIG_") && k !== "CLAUDE_CODE_OAUTH_TOKEN" && k !== "ANTHROPIC_API_KEY",
    ),
  );

/** G1 (E7.8): `data:validate` und `check:fast` grün; sonst Fehler mit den letzten Zeilen der Ausgabe */
function discoverGates(): void {
  for (const script of ["data:validate", "check:fast"]) {
    try {
      execFileSync("pnpm", [script], { cwd: ROOT, env: gateEnv(), encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      const out = `${(e as { stdout?: string }).stdout ?? ""}\n${(e as { stderr?: string }).stderr ?? ""}`;
      console.error(out);
      const tail = out
        .split("\n")
        .filter((l) => l.trim() !== "")
        .slice(-3)
        .join(" / ");
      throw new Error(`${script} rot: ${tail}`);
    }
  }
}

const regionOf = (value: string | undefined): RegionId =>
  REGION_IDS.find((r) => r === value) ?? fail(`unbekannte Region: ${value}`);

/**
 * Ein Ort (Standard Region nuernberg) oder die Prüffälle (Plan 0050, S1): `--faelle` fragt live, ohne Katalog und
 * ohne Caches (eigenes Temp-Verzeichnis), bei 4 Anfragen pro Minute; `--aufzeichnen` schreibt die Antworten für
 * die Unit-Tests nach tests/fixtures/pipeline/geocode-aufnahmen.json.
 */
async function geocodeCmd() {
  if (!values.faelle) {
    const g = createGeocoder({ today: today() });
    const r = await g.geocode(need(args[0], "Adresse"), {
      region: regionOf(values.region ?? "nuernberg"),
      ...(values.venue ? { venueName: values.venue } : {}),
    });
    print(
      r.kind === "treffer" ? { ...r.geo, stufe: r.stufe } : fail(r.kind === "ausfall" ? r.grund : "nicht gefunden"),
    );
    return;
  }
  const file = GeocodeFaelle.parse(readJson(join(ROOT, "tests/fixtures/pipeline/geocode-faelle.json")));
  const recorded: Record<string, unknown> = {};
  const fetchImpl: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    recorded[recordingKey(String(input))] = await res.clone().json();
    return res;
  };
  const g = createGeocoder({ today: today(), cacheDir: mkdtempSync(join(tmpdir(), "geocode-faelle-")), fetchImpl });
  const results = await checkFaelle(file, g);
  for (const r of results)
    print(`${r.ok ? "✓" : "✗"} ${r.eingabe}: ${r.outcome.kind}${r.abstandM === undefined ? "" : ` ${r.abstandM} m`}`);
  print(`Anfragen ${g.stats().requests}, Wartezeit ${Math.round(g.stats().waitMs / 1000)} s`);
  if (values.aufzeichnen) writeJson(join(ROOT, "tests/fixtures/pipeline/geocode-aufnahmen.json"), recorded);
  if (results.some((r) => !r.ok)) process.exit(1);
}

/** Entdecken (Plan 0032, E7). Exit 1 nur bei G2 oder Programmfehler; Abbruch und Bremse enden geordnet (Ampel rot). */
async function discoverCmd() {
  const date = today();
  const dryRun = values["dry-run"];
  const isEval = values.eval;
  if (isEval && !dryRun) fail("--eval nur mit --dry-run (Entdecken-Eval)");
  // die Stichprobe enthält Fürther Anbieter: --eval läuft immer für Nürnberg und Fürth zusammen (Plan 0050, E6)
  if (isEval && values.region) fail("--eval läuft immer für Nürnberg und Fürth zusammen, ohne --region");
  if (values.effort && !EFFORTS.some((e) => e === values.effort))
    fail(`--effort ungültig: ${values.effort} (erlaubt: ${EFFORTS.join(", ")})`);
  if (values.model && !/^[a-z][a-z0-9.-]*$/.test(values.model)) fail(`--model ungültig: ${values.model}`);
  // vor jedem Lesen der Umgebung: Option vor Umgebung vor Eval-Standard (Plan 0050, E7)
  Object.assign(
    process.env,
    modelEnv(process.env, {
      eval: isEval,
      ...(values.model ? { model: values.model } : {}),
      ...(values.effort ? { effort: values.effort } : {}),
    }),
  );
  const base = join(ROOT, "runs", date, "discover");
  const runDir = values["run-dir"] ? resolve(values["run-dir"]) : isEval ? freshRunDir(base, existsSync) : base;
  actionsOutput("run_dir", runDir);
  const regions: RegionId[] = isEval
    ? evalRegions("nuernberg")
    : values.region
      ? [REGION_IDS.find((r) => r === values.region) ?? fail(`unbekannte Region: ${values.region}`)]
      : [...REGION_IDS];
  const sample = isEval ? DiscoverEvalSchema.parse(readJson(DISCOVER_EVAL)).stichproben["nuernberg"] : undefined;
  if (isEval && !sample) fail(`${DISCOVER_EVAL}: Stichprobe nuernberg fehlt`);
  const brakes = parseBrakes(process.env, DISCOVER_BRAKES);
  if (!brakes.ok) fail(brakes.error);
  const budgetMin = Number(process.env["RUN_BUDGET_MIN"] || DISCOVER_BUDGET_MIN);
  if (!(budgetMin > 0)) fail(`RUN_BUDGET_MIN ungültig: ${process.env["RUN_BUDGET_MIN"]}`);
  // im Eval ohne G3 (runDiscover)
  const maxNew = values.bootstrap ? Number(process.env["MAX_NEW"] || 30) : MAX_NEW_PER_RUN;
  if (!(Number.isInteger(maxNew) && maxNew > 0)) fail(`MAX_NEW ungültig: ${process.env["MAX_NEW"]}`);
  let terms: string[];
  try {
    terms = selectTerms(values.terms?.split(","));
  } catch (e) {
    fail((e as Error).message);
  }
  // live: G1 erst auf dem Ausgangsstand; ist der schon rot, würde jeder Kandidat still verworfen (Arch-Review S4, m1)
  if (!dryRun)
    try {
      discoverGates();
    } catch (e) {
      fail(`G1 schon vor dem Lauf rot, nichts entdeckt: ${(e as Error).message}`);
    }
  // dasselbe Modell und derselbe Schlüssel wie der Nachtlauf: Der Zustand des Ertragsbeweises gilt dort weiter (E1)
  const model = process.env["LLM_MODEL_EXTRACT"] ?? "haiku";
  const effort = effortOf(process.env);
  const step = (m: string | undefined, e: string | undefined) => `${m}/${e || "Standard"}`;
  const modelle =
    `Suche/Bewerten ${step(process.env["LLM_MODEL_DISCOVER"] ?? "haiku", process.env["LLM_EFFORT_DISCOVER"])}, ` +
    `Beweis ${step(model, effort)} (Fallback ${process.env["LLM_MODEL_FALLBACK"] ?? "sonnet"})`;
  const r = await runDiscover({
    regions,
    dataDir: join(ROOT, "data"),
    runDir,
    today: date,
    dryRun,
    maxNew,
    terms,
    modelle,
    ...(sample
      ? {
          eval: {
            ids: sample.map((s) => s.id),
            alt: sample.filter((s) => s.alt).map((s) => s.id),
            urteile: UrteileSchema.parse(readJson(DISCOVER_URTEILE)).urteile,
          },
        }
      : {}),
    brakes: brakes.brakes,
    budgetMin,
    keyParts: { ...EXTRACT_KEY_PARTS, model: modelKey(model, effort) },
    log: print,
    deps: {
      ...createDiscoverModel(),
      fetchPage,
      geocoder: (init) => createGeocoder({ today: date, ...init }),
      extractor: createExtractor({ model }),
      fetchInputs,
      fetchPdfText,
      aggregatorCandidates: fetchAggregatorCandidates,
      freeDays: loadFreeDays,
    },
    ...(dryRun
      ? {}
      : {
          commit: (id: string, message: string) =>
            commitNewProvider({ git, root: ROOT, id, message, gate: discoverGates }),
        }),
  });
  const added = r.regions.reduce((n, x) => n + x.adopted.length, 0);
  const red: string[] = [];
  if (abortOf(r)) red.push(`vorzeitig beendet (${abortOf(r)})`);
  red.push(...(r.gateErrors ?? []));
  // G1 rot bei einem Kandidaten heißt meist: der Stand selbst ist rot (Arch-Review S4, m1)
  const gateRejects = r.regions.flatMap((x) => x.rejected).filter((x) => x.grund.startsWith("G1 rot"));
  if (gateRejects.length > 0) red.push(`G1 rot bei ${gateRejects.length} Kandidaten`);
  if (!dryRun)
    try {
      commitRunState({
        git,
        root: ROOT,
        message: `data: Entdecken ${date} (${regions.join(", ")}: ${added} neu)\n\nPlan 0032, E7 (pnpm pipeline discover)`,
        gate: discoverGates,
      });
    } catch (e) {
      // die geprüften Anbieter-Commits gehen trotzdem ins Bundle (Arch-Review S4, m2)
      if (!(e instanceof GateError)) throw e;
      red.push(`Zustand und Kosten nicht committet: ${e.message}`);
    }
  // G2-Fehler stehen schon im Bericht
  const extraRed = red.filter((x) => !(r.gateErrors ?? []).includes(x));
  const md = `${renderDiscoverReport(r)}${extraRed.map((x) => `\n- **rot:** ${x}`).join("")}\n`;
  print(md);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) appendFileSync(summary, md);
  actionsOutput("ampel", red.length > 0 ? "rot" : "gruen");
  actionsOutput("neu", String(added));
}

/** Push der Commits des Entdeckens (E7.9) und Text des Issues (E7.10) nach RUN_DIR/issue.md */
function discoverPublish(runDir: string) {
  try {
    const r = publishDiscover({
      git,
      validate: () =>
        execFileSync("node", ["scripts/validate-data.ts"], { cwd: ROOT, stdio: "inherit", env: gateEnv() }),
    });
    actionsOutput("pushed", String(r.pushed));
    const repoUrl = `${process.env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${process.env["GITHUB_REPOSITORY"] ?? ""}`;
    const issue = newProvidersIssue(r.commits, { repoUrl, date: today() });
    if (issue) {
      const file = join(runDir, "issue.md");
      writeFileSync(file, `${issue.body}\n`);
      actionsOutput("issue_title", issue.title);
      actionsOutput("issue_file", file);
    }
    print(r.pushed ? `✓ ${r.commits.length} Commits nach main` : "Keine Commits – nichts veröffentlicht");
  } catch (e) {
    fail((e as Error).message);
  }
}

const STEP_OUTCOMES = ["success", "failure", "cancelled", "skipped"] as const;
const stepOutcome = (value: string | undefined, what: string): StepOutcome | undefined => {
  if (value === undefined || value === "") return undefined;
  return STEP_OUTCOMES.find((o) => o === value) ?? fail(`${what}: unbekannter Ausgang „${value}“`);
};

/**
 * Bericht des Nachtlaufs aus RUN_DIR (nightly.json) samt Zustand nach dem Lauf; `undefined` ohne Bericht. `raws` nur
 * die Anbieter des Laufs, `all` der ganze Zustand (Wächter, Plan 0048, E10).
 */
function readNightly(runDir: string): {
  report: NightlyReport | undefined;
  raws: Record<string, ProviderRaw>;
  all: Record<string, ProviderRaw>;
} {
  const file = join(runDir, "nightly.json");
  const parsed = existsSync(file) ? NightlyReport.safeParse(readJson(file)) : undefined;
  if (parsed && !parsed.success) print(`Hinweis: ${file} passt nicht zum Format – ${parsed.error.message}`);
  const report = parsed?.success ? parsed.data : undefined;
  // Trockenlauf: Zustand dieses Laufs liegt in RUN_DIR/raw und überlagert data/raw
  const all = { ...readRawDir(join(ROOT, "data", "raw")), ...readRawDir(join(runDir, "raw")) };
  const raws = report
    ? Object.fromEntries(Object.entries(all).filter(([id]) => report.results[id] !== undefined))
    : all;
  return { report, raws, all };
}

/** Bericht des Nachtlaufs (E10) mit Ampel nach E6. */
async function status() {
  const runDir = args[0] || join(ROOT, "runs", today());
  const { report, raws, all } = readNightly(runDir);
  const live = await liveStatus();
  const gates = stepOutcome(values.gates, "--gates");
  const push = stepOutcome(values.push, "--push");
  const verdict = assessRun(report, { live, ...(gates ? { gates } : {}), ...(push ? { push } : {}) });
  const offersFile = report?.build.written ?? join(ROOT, "data", "offers.json");
  const offers = existsSync(offersFile) ? (readPreviousOffers(offersFile)?.offers ?? []) : [];
  const stock = Object.fromEntries(Object.keys(raws).map((id) => [id, offerUnits(offers, id)]));
  const fetchFile = join(runDir, "fetch", "report.md");
  let md = renderStatus({
    report,
    verdict,
    live,
    raws,
    stock,
    ...(existsSync(fetchFile) ? { fetchReport: readFileSync(fetchFile, "utf8") } : {}),
  });
  mkdirSync(runDir, { recursive: true });
  // Wächter (Plan 0048, E10): `today` aus dem Bericht; ohne Bericht keine Datei, der Job `waechter` scheitert dann sichtbar
  if (values.waechter && report) {
    // ganzer Zustand, nicht nur die Anbieter des Laufs: ein Lauf mit `only` schlösse das Issue sonst falsch (M1);
    // dazu die Klärfälle des Entdeckens (Plan 0050, S2b)
    const discover = readDiscoverStates(join(ROOT, "data"));
    const findings = watchFindings({ raws: all, catalog: readCatalog(), discover, today: report.date });
    const text = watchIssue(findings, report.date);
    writeFileSync(join(runDir, "waechter.md"), text);
    md += `\n## Wächter (Plan 0048, E10)\n\n${text === "" ? "Nichts offen." : text.replace(/\n*<!-- waechter:.*$/s, "")}\n`;
  }
  writeFileSync(join(runDir, "status.md"), md);
  print(md);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) appendFileSync(summary, md);
  actionsOutput("ampel", verdict.light);
  if (verdict.light === "rot" && !values["report-only"]) process.exit(1);
}

/** Nach dem Nachtlauf (E6): nur dessen Daten, Kurzbericht im Commit-Text, `pull --rebase` vor dem Push. */
function publishAfterNightly(runDir: string) {
  const { report, raws } = readNightly(runDir);
  if (!report) fail(`${join(runDir, "nightly.json")} fehlt oder ist ungültig`);
  if (!report.build.written || report.build.written !== join(ROOT, "data", "offers.json"))
    fail(
      "Der Lauf hat data/offers.json nicht geschrieben (Trockenlauf oder Build abgebrochen) – nichts zu veröffentlichen",
    );
  try {
    const r = publishNightly({
      git,
      message: nightlyCommitMessage(report, raws),
      // Prüfung ohne den Push-Header des Workflows (GIT_CONFIG_*): Schreibrecht nur für git (Arch-Review S3, M1)
      validate: () =>
        execFileSync("node", ["scripts/validate-data.ts", "--against-deployed"], {
          cwd: ROOT,
          stdio: "inherit",
          env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_CONFIG_"))),
        }),
    });
    actionsOutput("pushed", String(r.pushed));
    print(r.pushed ? "✓ Nachtlauf veröffentlicht" : "Keine Änderung – nichts veröffentlicht");
  } catch (e) {
    fail((e as Error).message);
  }
}

function publish(runDir: string) {
  if (!existsSync(join(runDir, "nightly.json")))
    fail(`${join(runDir, "nightly.json")} fehlt – publish veröffentlicht nur einen Nachtlauf (Plan 0032, E6)`);
  publishAfterNightly(runDir);
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
  case "status":
    await status();
    break;
  case "discover":
    await discoverCmd();
    break;
  case "discover-publish":
    discoverPublish(need(args[0], "RUN_DIR"));
    break;
  case "holidays":
    print(await loadFreeDays(need(args[0], "FROM"), need(args[1], "TO")));
    break;
  case "geocode":
    await geocodeCmd();
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
