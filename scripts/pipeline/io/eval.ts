/**
 * Eval der Extraktion (Plan 0032, E9): eingefrorene Fälle aus `evals/cases/` mit demselben Extraktor wie der
 * Nachtlauf (`createExtractor`) bewerten, Details nach `runs/eval-<datum>-<modell>/`, eine Zeile in
 * `evals/results.md`. Dazu `freezeCase`: einen Fall aus einem frischen Abruf anlegen. Bewertung: `lib/eval-score.ts`.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addMonths } from "../../../src/domain/time.ts";
import {
  type CaseResult,
  EvalExpected,
  EvalInput,
  predictOffers,
  RESULTS_HEADER,
  resultsRow,
  scoreCase,
  summarize,
  toEvalOffers,
  type Window,
} from "../lib/eval-score.ts";
import type { ExtractOutcome, Extractor } from "../lib/extract.ts";
import { planFetch } from "../lib/select.ts";
import { fetchInputs } from "./fetch-inputs.ts";
import { ROOT, readCatalog, readJson, readPreviousOffers, writeJson } from "./files.ts";
import { loadFreeDays } from "./holidays.ts";

const CASES_DIR = join(ROOT, "evals/cases");
const RESULTS_FILE = join(ROOT, "evals/results.md");

export interface LoadedCase {
  name: string;
  input: EvalInput;
  expected: EvalExpected;
}

/** Alle Fälle (oder die genannten), geprüft per Zod. Ein kaputter Fall bricht ab, statt still zu fehlen. */
export function loadCases(only?: readonly string[], dir: string = CASES_DIR): LoadedCase[] {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const unknown = (only ?? []).filter((n) => !names.includes(n));
  if (unknown.length > 0) throw new Error(`unbekannte Fälle: ${unknown.join(", ")} (vorhanden: ${names.join(", ")})`);
  return names
    .filter((n) => !only || only.includes(n))
    .map((name) => {
      const read = <T>(file: string, schema: { parse: (v: unknown) => T }) => {
        try {
          return schema.parse(readJson(join(dir, name, file)));
        } catch (e) {
          throw new Error(`${name}/${file}: ${(e as Error).message}`);
        }
      };
      return { name, input: read("input.json", EvalInput), expected: read("expected.json", EvalExpected) };
    });
}

/** Freie Tage wie im Extraktor (`io/extract.ts`): ein Jahr zurück, zwei voraus, je Stichtag einmal geladen. */
function freeDaysLoader(): (today: string) => Promise<Record<string, string>> {
  const cache = new Map<string, Promise<Record<string, string>>>();
  return (today) => {
    const hit = cache.get(today);
    if (hit) return hit;
    const loading = loadFreeDays(addMonths(today, -12), addMonths(today, 24));
    cache.set(today, loading);
    return loading;
  };
}

export interface CaseRun extends CaseResult {
  /** Grund bei `fehler`, Meldungen eines gescheiterten Builds */
  reason?: string;
  answer: ExtractOutcome;
  predicted: ReturnType<typeof predictOffers>["offers"];
}

export interface EvalRun {
  results: CaseRun[];
  abort?: "auth" | "limit";
}

/** Fälle nacheinander bzw. mit `concurrency` parallel; ein Abbruch (Auth, Limit) stoppt den Lauf. */
export async function runEval(o: {
  cases: readonly LoadedCase[];
  extractor: Extractor;
  signal: AbortSignal;
  concurrency: number;
  onCase?: (r: CaseRun) => void;
  freeDaysFor?: (today: string) => Promise<Record<string, string>>;
}): Promise<EvalRun> {
  const freeDaysFor = o.freeDaysFor ?? freeDaysLoader();
  const stop = new AbortController();
  const signal = AbortSignal.any([o.signal, stop.signal]);
  let abort: EvalRun["abort"];
  const results: CaseRun[] = [];
  const queue = [...o.cases];
  const worker = async () => {
    for (let c = queue.shift(); c && !signal.aborted; c = queue.shift()) {
      const { input, expected } = c;
      // dieselbe Eingabe wie im Nachtlauf (`io/refresh.ts`), nur der Katalogeintrag aus dem Schnappschuss
      const { outcome: answer, calls } = await o.extractor(
        {
          provider: input.catalog,
          text: input.text,
          candidates: input.candidates,
          allowedUrls: input.allowedUrls,
          today: input.today,
        },
        signal,
      );
      if (answer.kind === "abort") {
        abort = answer.abort;
        stop.abort();
        return;
      }
      const run = scoreRun(c, answer, calls, await freeDaysFor(input.today), expected.window);
      results.push(run);
      o.onCase?.(run);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency) }, worker));
  results.sort((a, b) => a.name.localeCompare(b.name));
  return abort ? { results, abort } : { results };
}

function scoreRun(
  c: LoadedCase,
  answer: Exclude<ExtractOutcome, { kind: "abort" }>,
  calls: CaseResult["calls"],
  freeDays: Record<string, string>,
  window: Window,
): CaseRun {
  const expected = c.expected.offers;
  if (answer.kind === "fehler")
    return {
      name: c.name,
      outcome: "fehler",
      reason: answer.reason,
      answer,
      predicted: [],
      calls,
      score: scoreCase(expected, []),
    };
  const built = predictOffers({
    events: answer.events,
    provider: c.input.catalog,
    today: c.input.today,
    freeDays,
    window,
  });
  const base = { name: c.name, answer, predicted: built.offers, calls };
  return built.errors.length > 0
    ? { ...base, outcome: "fehler", reason: `Build: ${built.errors.join("; ")}`, score: scoreCase(expected, []) }
    : { ...base, outcome: "ok", score: scoreCase(expected, built.offers) };
}

/** Details nach `outDir`, Zeile an `evals/results.md` (legt die Datei mit Kopf an, falls sie fehlt). */
export function writeEval(
  run: EvalRun,
  meta: { date: string; model: string; fallback: string; hash: string; outDir: string },
  resultsFile: string = RESULTS_FILE,
): string {
  const summary = summarize(run.results);
  for (const r of run.results) writeJson(join(meta.outDir, `${r.name}.json`), r);
  writeJson(join(meta.outDir, "summary.json"), { ...meta, summary });
  const label = meta.fallback === meta.model ? meta.model : `${meta.model} (Fallback ${meta.fallback})`;
  const row = resultsRow(summary, run.results, { date: meta.date, model: label, hash: meta.hash });
  if (!existsSync(resultsFile)) writeFileSync(resultsFile, `# Eval-Ergebnisse\n\n${RESULTS_HEADER}\n`);
  const current = readFileSync(resultsFile, "utf8");
  appendFileSync(resultsFile, `${current.endsWith("\n") ? "" : "\n"}${row}\n`);
  return row;
}

/**
 * Neuer Fall aus einem frischen Abruf (wie der Nachtlauf, `fetchInputs`) und dem Bestand `data/offers.json` als
 * Entwurf für `expected.json`. Das Fenster endet am Horizont des Bestands, höchstens heute + 12 Monate.
 * `expected.json` ist danach von Hand gegen den Text zu prüfen (Korrekturen in NOTES.md).
 */
export async function freezeCase(o: {
  providerId: string;
  today: string;
  kinds: EvalInput["kinds"];
  traps: EvalInput["traps"];
  force?: boolean;
  dir?: string;
}): Promise<string> {
  const name = `${o.providerId}-${o.today}`;
  const caseDir = join(o.dir ?? CASES_DIR, name);
  if (existsSync(caseDir) && !o.force) throw new Error(`${caseDir} gibt es schon (überschreiben mit --force)`);
  const catalog = readCatalog();
  const provider = catalog.find((p) => p.id === o.providerId);
  if (!provider) throw new Error(`${o.providerId}: unbekannter Anbieter`);
  const fetched = await fetchInputs(planFetch(catalog, { today: o.today, only: [o.providerId] }), catalog, o.today);
  const f = fetched.inputs[o.providerId];
  if (f?.status !== "ok")
    throw new Error(`${o.providerId}: Abruf ${f?.status ?? "fehlt"}${f?.reason ? ` (${f.reason})` : ""}`);
  const input: EvalInput = EvalInput.parse({
    kinds: o.kinds,
    traps: o.traps,
    synthetic: false,
    origin: `pnpm eval freeze am ${o.today}`,
    providerId: o.providerId,
    catalog: provider,
    today: o.today,
    text: f.text,
    candidates: f.candidates,
    allowedUrls: f.allowedUrls,
  });
  const previous = readPreviousOffers();
  const max = addMonths(o.today, 12);
  const to = previous && previous.horizon.to < max ? previous.horizon.to : max;
  const window = { from: o.today, to };
  const offers = toEvalOffers(previous?.offers.filter((x) => x.providerId === o.providerId) ?? [], window);
  const expected: EvalExpected = {
    basis: `data/offers.json vom ${previous?.generatedAt ?? "(fehlt)"}, Entwurf – von Hand gegen input.json prüfen`,
    window,
    offers,
  };
  writeJson(join(caseDir, "input.json"), input);
  writeJson(join(caseDir, "expected.json"), expected);
  return caseDir;
}
