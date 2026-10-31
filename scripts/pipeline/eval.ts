/**
 * Eval der Extraktion (Plan 0032, E9). Aufruf: `pnpm eval …`
 *
 *   [--model M] [--fallback M] [--effort E] [--case a,b] [--concurrency N]
 *       Alle Fälle aus evals/cases/ (oder die genannten) mit `createExtractor` wie im Nachtlauf. Details nach
 *       runs/eval-<datum>-<modell>/, eine Zeile an evals/results.md (nur mit allen Fällen, sonst nur Details).
 *       --fallback: Standard = --model, damit das Modell allein gemessen wird; `--fallback sonnet` misst die
 *       Konfiguration des Nachtlaufs. Modell Standard LLM_MODEL_EXTRACT bzw. haiku, Effort Standard
 *       LLM_EFFORT_EXTRACT bzw. der der CLI (Plan 0048, Nachtrag 2).
 *   freeze ID --kind html[,gross] [--trap ab-3-jahren] [--force]
 *       Fall evals/cases/<ID>-<heute>/ aus einem frischen Abruf anlegen; expected.json als Entwurf aus dem Bestand,
 *       danach von Hand gegen input.json prüfen (Korrekturen in NOTES.md).
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import { berlinIsoDate } from "../../src/domain/time.ts";
import { type CaseRun, freezeCase, loadCases, runEval, writeEval } from "./io/eval.ts";
import { createExtractor, EXTRACT_KEY_PARTS, effortOf } from "./io/extract.ts";
import { ROOT } from "./io/files.ts";
import { CASE_KINDS, type EvalInput, promptHash, TRAPS, unusableRun } from "./lib/eval-score.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    fallback: { type: "string" },
    effort: { type: "string" },
    case: { type: "string" },
    concurrency: { type: "string", default: "3" },
    kind: { type: "string" },
    trap: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

const print = (s: string) => process.stdout.write(`${s}\n`);
function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}
const list = <T extends string>(raw: string | undefined, allowed: readonly T[], what: string): T[] => {
  const items = (raw ?? "").split(",").filter(Boolean);
  const known = (i: string): i is T => allowed.some((a) => a === i);
  const bad = items.filter((i) => !known(i));
  if (bad.length > 0) fail(`${what} unbekannt: ${bad.join(", ")} (erlaubt: ${allowed.join(", ")})`);
  return items.filter(known);
};
const today = berlinIsoDate(new Date());

async function freeze(id: string) {
  const kinds: EvalInput["kinds"] = list(values.kind, CASE_KINDS, "--kind");
  if (kinds.length === 0) fail(`--kind fehlt (${CASE_KINDS.join(", ")})`);
  const dir = await freezeCase({
    providerId: id,
    today,
    kinds,
    traps: list(values.trap, TRAPS, "--trap"),
    force: values.force,
  });
  print(`✓ ${dir} – expected.json ist ein Entwurf aus dem Bestand: von Hand gegen input.json prüfen`);
}

function line(r: CaseRun): string {
  const s = r.score.sessions;
  const cost = r.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0);
  const secs = r.calls.reduce((n, c) => n + c.durationMs, 0) / 1000;
  const head = r.outcome === "ok" ? "✓" : `✗ ${r.reason ?? ""}`;
  const misplaced = r.score.misplaced > 0 ? `, ${r.score.misplaced} fehlverortet` : "";
  return `${head} ${r.name}: Termine ${s.matched}/${s.expected} erwartet, ${s.predicted} vorhergesagt${misplaced}; ${r.calls.length} Aufrufe, $${cost.toFixed(3)}, ${secs.toFixed(0)} s`;
}

async function evaluate() {
  const model = values.model ?? process.env["LLM_MODEL_EXTRACT"] ?? "haiku";
  const fallback = values.fallback ?? model;
  let effort: ReturnType<typeof effortOf>;
  try {
    effort = values.effort === undefined ? effortOf(process.env) : effortOf({ LLM_EFFORT_EXTRACT: values.effort });
  } catch (e) {
    fail((e as Error).message);
  }
  // Effort steht im Modell-Etikett der Zeile und im Ordnernamen; ohne Effort bleibt beides wie bisher
  const label = effort ? `${model} (Effort ${effort})` : model;
  const only = values.case?.split(",").filter(Boolean);
  let cases: ReturnType<typeof loadCases>;
  try {
    cases = loadCases(only);
  } catch (e) {
    fail((e as Error).message);
  }
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) fail(`--concurrency ungültig: ${values.concurrency}`);
  const hash = promptHash(EXTRACT_KEY_PARTS);
  print(`Eval ${today}: ${cases.length} Fälle, Modell ${label}, Fallback ${fallback}, Prompt-Hash ${hash}`);
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  const run = await runEval({
    cases,
    extractor: createExtractor({ model, fallbackModel: fallback, ...(effort ? { effort } : {}) }),
    signal: controller.signal,
    concurrency,
    onCase: (r) => print(line(r)),
  });
  if (run.abort) fail(`Abbruch (${run.abort}) – keine Zeile in evals/results.md`);
  if (controller.signal.aborted) fail("abgebrochen – keine Zeile in evals/results.md");
  // Ein Lauf ohne eine einzige gültige Antwort (CLI fehlt, Login abgelaufen) ist kein Messwert und darf die
  // Warnung in data:validate nicht stillen
  const unusable = unusableRun(run.results, cases.length);
  if (unusable) fail(`${unusable} – keine Zeile in evals/results.md (Details: ${run.results.map(line).join("; ")})`);
  const outDir = join(
    ROOT,
    "runs",
    `eval-${today}-${model}${effort ? `-${effort}` : ""}${fallback === model ? "" : `-fb-${fallback}`}`,
  );
  const meta = { date: today, model: label, fallback: fallback === model ? label : fallback, hash, outDir };
  if (only) {
    // Teilmengen sind nicht vergleichbar: nur Details, keine Zeile
    const row = writeEval(run, meta, join(outDir, "results.md"));
    print(row);
    print(`✓ ${outDir} (Teilmenge: keine Zeile in evals/results.md)`);
    return;
  }
  print(writeEval(run, meta));
  print(`✓ ${outDir}, Zeile in evals/results.md`);
}

if (positionals[0] === "freeze") await freeze(positionals[1] ?? fail("Anbieter-ID fehlt"));
else if (positionals.length > 0) fail(`unbekannter Befehl ${positionals[0]} – siehe Kopf von scripts/pipeline/eval.ts`);
else await evaluate();
