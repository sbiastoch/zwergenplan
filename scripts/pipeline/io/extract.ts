/**
 * Extraktion eines Anbieters mit dem Modell (Plan 0032, E4): Prompt `prompt/extract.md`, Antwortschema aus Zod,
 * Aufruf über `io/llm.ts`, Prüfung und Ablauf in `lib/extract.ts`. Die Typen stehen in `lib/extract.ts` (reine Logik
 * darf `io/` nicht importieren) und werden hier für die Aufrufer weitergereicht.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addMonths } from "../../../src/domain/time.ts";
import { type Extractor, extractMessage, extractResponseSchema, runExtractionInParts } from "../lib/extract.ts";
import { PART_MAX_CHARS, splitInput } from "../lib/split.ts";
import { loadFreeDays } from "./holidays.ts";
import { callLlm, EFFORTS, type Effort, type LlmOptions } from "./llm.ts";

export type {
  CallRecord,
  ExtractInput,
  ExtractOutcome,
  Extractor,
  ExtractResult,
} from "../lib/extract.ts";

const PROMPT_FILE = fileURLToPath(new URL("../prompt/extract.md", import.meta.url));
const SCHEMA = extractResponseSchema();

/** Inhalte, die der Cache-Schlüssel (`inputHash`, E4) mitnimmt: Prompt und Antwortschema als Text. */
export const EXTRACT_KEY_PARTS: { prompt: string; schema: string } = {
  prompt: readFileSync(PROMPT_FILE, "utf8"),
  schema: JSON.stringify(SCHEMA),
};

/**
 * Ohne Werkzeuge zählt der Abschluss über StructuredOutput mit (S1.1: mindestens 3). Nicht mehr: Bei abgeschnittener
 * Ausgabe setzt die CLI selbst bis zu dieser Zahl fort, jede Fortsetzung kostet die ganze Eingabe und 32 000
 * Ausgabe-Tokens (fbs-nuernberg mit 4: 128 000 Tokens, $1,03, 8,6 Min., trotzdem abgeschnitten).
 */
const MAX_TURNS = 3;

export interface ExtractorOptions {
  model?: string;
  /** gilt für Haupt- und Fallback-Modell, Standard `LLM_EFFORT_EXTRACT` (Plan 0048, Nachtrag 2) */
  effort?: Effort;
  fallbackModel?: string;
  /** Schwelle für das Aufteilen der Eingabe (`splitInput`), Standard `PART_MAX_CHARS` */
  partMaxChars?: number;
  /** für Tests: Fake-CLI und ihre Umgebung (`callLlm`), Ferien ohne Netz */
  bin?: string;
  env?: NodeJS.ProcessEnv;
  freeDays?: typeof loadFreeDays;
}

/** Fallback-Modell der Extraktion (E4): `LLM_MODEL_FALLBACK`, sonst Sonnet. */
export const fallbackModelOf = (env: NodeJS.ProcessEnv): string => env["LLM_MODEL_FALLBACK"] ?? "sonnet";

/** Effort der Extraktion: `LLM_EFFORT_EXTRACT`, leer oder fehlend heißt Standard der CLI. */
export function effortOf(env: NodeJS.ProcessEnv): Effort | undefined {
  const raw = env["LLM_EFFORT_EXTRACT"];
  if (!raw) return undefined;
  const effort = EFFORTS.find((e) => e === raw);
  if (!effort) throw new Error(`LLM_EFFORT_EXTRACT ungültig: ${raw} (erlaubt: ${EFFORTS.join(", ")})`);
  return effort;
}

/** Modellteil des Cache-Schlüssels: Ohne Effort bleibt er, wie er war; ein Wechsel extrahiert einmal alles neu. */
export const modelKey = (model: string, effort: Effort | undefined): string => (effort ? `${model}/${effort}` : model);

export function createExtractor(opts: ExtractorOptions = {}): Extractor {
  const model = opts.model ?? process.env["LLM_MODEL_EXTRACT"] ?? "haiku";
  const effort = opts.effort ?? effortOf(process.env);
  const fallbackModel = opts.fallbackModel ?? fallbackModelOf(process.env);
  const partMaxChars = opts.partMaxChars ?? PART_MAX_CHARS;
  const loadDays = opts.freeDays ?? loadFreeDays;
  const llmOpts: LlmOptions = { ...(opts.bin ? { bin: opts.bin } : {}), ...(opts.env ? { env: opts.env } : {}) };
  // Ferien je Stichtag einmal laden; weit genug für laufende Kurse mit vergangenen Terminen (wie der Build des Nachtlaufs)
  const freeDaysCache = new Map<string, Promise<Record<string, string>>>();
  const freeDaysFor = (today: string) => {
    const cached = freeDaysCache.get(today);
    if (cached) return cached;
    const loading = loadDays(addMonths(today, -12), addMonths(today, 24));
    freeDaysCache.set(today, loading);
    return loading;
  };

  return async (input, signal) => {
    const ctx = {
      provider: input.provider,
      allowedUrls: input.allowedUrls,
      candidates: input.candidates,
      // Datenhorizont heute + 12 Monate (E5)
      horizon: { from: input.today, to: addMonths(input.today, 12) },
      freeDays: await freeDaysFor(input.today),
    };
    // Große Anbieter in Teilen (lib/split.ts); der Cache-Schlüssel bleibt der des ganzen Anbieters
    const { parts: texts, notes } = splitInput(input.text, partMaxChars, {
      pageUrls: input.pageUrls,
      candidates: input.candidates.length,
    });
    const users = texts.map((text, i) =>
      extractMessage({
        provider: input.provider,
        text,
        ctx,
        ...(texts.length > 1 ? { part: { index: i + 1, count: texts.length } } : {}),
      }),
    );
    const r = await runExtractionInParts({
      providerId: input.provider.id,
      model: input.strong ? fallbackModel : model,
      fallbackModel,
      users,
      splitNotes: notes,
      ctx,
      signal,
      call: (m, user) =>
        callLlm(
          {
            model: m,
            ...(effort ? { effort } : {}),
            systemPromptFile: PROMPT_FILE,
            user,
            tools: "none",
            schema: SCHEMA,
            maxTurns: MAX_TURNS,
            signal,
          },
          llmOpts,
        ),
    });
    return input.strong ? { ...r, calls: r.calls.map((c) => ({ ...c, step: "fallback" as const })) } : r;
  };
}
