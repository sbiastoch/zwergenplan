/**
 * Extraktion eines Anbieters mit dem Modell (Plan 0032, E4): Prompt `prompt/extract.md`, Antwortschema aus Zod,
 * Aufruf über `io/llm.ts`, Prüfung und Ablauf in `lib/extract.ts`. Die Typen stehen in `lib/extract.ts` (reine Logik
 * darf `io/` nicht importieren) und werden hier für die Aufrufer weitergereicht.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addMonths } from "../../../src/domain/time.ts";
import { type Extractor, extractMessage, extractResponseSchema, runExtraction } from "../lib/extract.ts";
import { loadFreeDays } from "./holidays.ts";
import { callLlm } from "./llm.ts";

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

export function createExtractor(opts: { model?: string; fallbackModel?: string; bin?: string } = {}): Extractor {
  const model = opts.model ?? process.env["LLM_MODEL_EXTRACT"] ?? "haiku";
  const fallbackModel = opts.fallbackModel ?? process.env["LLM_MODEL_FALLBACK"] ?? "sonnet";
  // Ferien je Stichtag einmal laden; weit genug für laufende Kurse mit vergangenen Terminen (wie `pipeline build`)
  const freeDaysCache = new Map<string, Promise<Record<string, string>>>();
  const freeDaysFor = (today: string) => {
    const cached = freeDaysCache.get(today);
    if (cached) return cached;
    const loading = loadFreeDays(addMonths(today, -12), addMonths(today, 24));
    freeDaysCache.set(today, loading);
    return loading;
  };

  return async (input, signal) => {
    const ctx = {
      provider: input.provider,
      allowedUrls: input.allowedUrls,
      // Datenhorizont heute + 12 Monate (E5)
      horizon: { from: input.today, to: addMonths(input.today, 12) },
      freeDays: await freeDaysFor(input.today),
    };
    return runExtraction({
      providerId: input.provider.id,
      model,
      fallbackModel,
      user: extractMessage({ provider: input.provider, text: input.text, ctx }),
      ctx,
      call: (m, user) =>
        callLlm(
          { model: m, systemPromptFile: PROMPT_FILE, user, tools: "none", schema: SCHEMA, maxTurns: MAX_TURNS, signal },
          opts.bin ? { bin: opts.bin } : {},
        ),
    });
  };
}
