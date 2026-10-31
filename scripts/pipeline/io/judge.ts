/**
 * Richter des ID-Gates (Plan 0049, Nachtrag 2, B3): Prompt `prompt/judge.md`, Antwortschema aus Zod, Aufruf über
 * `io/llm.ts`; Teilung, Auswertung und Ablauf in `lib/judge.ts`. Die Typen stehen in `lib/judge.ts` (reine Logik darf
 * `io/` nicht importieren) und werden hier für die Aufrufer weitergereicht.
 */
import { fileURLToPath } from "node:url";
import { type Judge, judgeResponseSchema, runJudge } from "../lib/judge.ts";
import { PART_MAX_CHARS } from "../lib/split.ts";
import { effortOf } from "./extract.ts";
import { callLlm, type Effort, type LlmOptions } from "./llm.ts";

export type { Judge, JudgeInput } from "../lib/judge.ts";

const PROMPT_FILE = fileURLToPath(new URL("../prompt/judge.md", import.meta.url));
const SCHEMA = judgeResponseSchema();

/** Wie bei der Extraktion: Der Abschluss über StructuredOutput zählt mit, mehr Runden kosten nur Eingabe. */
const MAX_TURNS = 3;

export interface JudgeOptions {
  /** Standard `LLM_MODEL_JUDGE`, sonst Opus */
  model?: string;
  /** Standard `LLM_EFFORT_JUDGE`; leer heißt Standard der CLI */
  effort?: Effort;
  /** Schwelle für die Teilung (`splitJudgeInput`), Standard `PART_MAX_CHARS` wie bei der Extraktion */
  partMaxChars?: number;
  /** für Tests: Fake-CLI und ihre Umgebung (`callLlm`) */
  bin?: string;
  env?: NodeJS.ProcessEnv;
}

export function createJudge(opts: JudgeOptions = {}): Judge {
  const model = opts.model ?? process.env["LLM_MODEL_JUDGE"] ?? "opus";
  const effort = opts.effort ?? effortOf(process.env, "LLM_EFFORT_JUDGE");
  const maxChars = opts.partMaxChars ?? PART_MAX_CHARS;
  const llmOpts: LlmOptions = { ...(opts.bin ? { bin: opts.bin } : {}), ...(opts.env ? { env: opts.env } : {}) };
  return (input, signal) =>
    runJudge({
      input,
      model,
      maxChars,
      signal,
      call: (user) =>
        callLlm(
          {
            model,
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
}
