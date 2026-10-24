/**
 * Extraktion eines Anbieters mit dem Modell (Plan 0032, E4): Prompt aus der Vorlage `prompt/extract.md` mit der Region
 * des Anbieters (Plan 0039, E10), Antwortschema aus Zod,
 * Aufruf über `io/llm.ts`, Prüfung und Ablauf in `lib/extract.ts`. Die Typen stehen in `lib/extract.ts` (reine Logik
 * darf `io/` nicht importieren) und werden hier für die Aufrufer weitergereicht.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { networkOf, type RegionId } from "../../../src/domain/regions.ts";
import { addMonths } from "../../../src/domain/time.ts";
import {
  type Extractor,
  extractMessage,
  extractPrompt,
  extractResponseSchema,
  runExtractionInParts,
} from "../lib/extract.ts";
import { subdivisionOf } from "../lib/holidays.ts";
import { PART_MAX_CHARS, splitInput } from "../lib/split.ts";
import { type FreeDaysLoader, loadFreeDays } from "./holidays.ts";
import { callLlmWithPrompt, type LlmOptions } from "./llm.ts";

export type {
  CallRecord,
  ExtractInput,
  ExtractOutcome,
  Extractor,
  ExtractResult,
} from "../lib/extract.ts";

const PROMPT_FILE = fileURLToPath(new URL("../prompt/extract.md", import.meta.url));
const SCHEMA = extractResponseSchema();

/**
 * Inhalte, die der Cache-Schlüssel (`inputHash`, E4) mitnimmt: Prompt-Vorlage und Antwortschema als Text. Die Vorlage
 * füllt `lib/refresh.ts` je Anbieter aus (`extractPrompt`); `promptHash` (Evals) nimmt sie unausgefüllt.
 */
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
  fallbackModel?: string;
  /** Schwelle für das Aufteilen der Eingabe (`splitInput`), Standard `PART_MAX_CHARS` */
  partMaxChars?: number;
  /** für Tests: Fake-CLI und ihre Umgebung (`callLlm`), Ferien ohne Netz */
  bin?: string;
  env?: NodeJS.ProcessEnv;
  freeDays?: FreeDaysLoader;
}

/** Fallback-Modell der Extraktion (E4): `LLM_MODEL_FALLBACK`, sonst Sonnet. */
export const fallbackModelOf = (env: NodeJS.ProcessEnv): string => env["LLM_MODEL_FALLBACK"] ?? "sonnet";

export function createExtractor(opts: ExtractorOptions = {}): Extractor {
  const model = opts.model ?? process.env["LLM_MODEL_EXTRACT"] ?? "haiku";
  const fallbackModel = opts.fallbackModel ?? fallbackModelOf(process.env);
  const partMaxChars = opts.partMaxChars ?? PART_MAX_CHARS;
  const loadDays = opts.freeDays ?? loadFreeDays;
  const llmOpts: LlmOptions = { ...(opts.bin ? { bin: opts.bin } : {}), ...(opts.env ? { env: opts.env } : {}) };
  // Ferien je Land und Stichtag einmal laden; weit genug für laufende Kurse mit vergangenen Terminen (wie der Build
  // des Nachtlaufs). Das Land kommt aus dem Netz des Anbieters (Plan 0039, E6). Die Ferien gehen nicht in den
  // Cache-Schlüssel ein (`extractKey`: Eingabe, Prompt, Schema, Modell, Katalogauszug), nur in die Prüfung der Antwort.
  const freeDaysCache = new Map<string, Promise<Record<string, string>>>();
  const freeDaysFor = (region: RegionId, today: string) => {
    const subdivision = subdivisionOf(networkOf(region));
    const key = `${subdivision} ${today}`;
    const cached = freeDaysCache.get(key);
    if (cached) return cached;
    const loading = loadDays(subdivision, addMonths(today, -12), addMonths(today, 24));
    freeDaysCache.set(key, loading);
    return loading;
  };

  return async (input, signal) => {
    const ctx = {
      provider: input.provider,
      allowedUrls: input.allowedUrls,
      candidates: input.candidates,
      // Datenhorizont heute + 12 Monate (E5)
      horizon: { from: input.today, to: addMonths(input.today, 12) },
      freeDays: await freeDaysFor(input.provider.region, input.today),
    };
    const systemPrompt = extractPrompt(EXTRACT_KEY_PARTS.prompt, input.provider);
    // Große Anbieter in Teilen (lib/split.ts); der Cache-Schlüssel bleibt der des ganzen Anbieters
    // dichte Listen mit eigener, kleinerer Schwelle (`partChars`, Plan 0042, S2)
    const own = input.provider.role === "anbieter" ? input.provider.partChars : undefined;
    const { parts: texts, notes } = splitInput(input.text, Math.min(partMaxChars, own ?? partMaxChars), {
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
        callLlmWithPrompt(
          { model: m, systemPrompt, user, tools: "none", schema: SCHEMA, maxTurns: MAX_TURNS, signal },
          llmOpts,
        ),
    });
    return input.strong ? { ...r, calls: r.calls.map((c) => ({ ...c, step: "fallback" as const })) } : r;
  };
}
