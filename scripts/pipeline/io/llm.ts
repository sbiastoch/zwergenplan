/**
 * Einzige Stelle, die ein Modell aufruft (Plan 0032, E2 mit den Korrekturen aus „Stufe 1 – Ergebnisse“): `claude -p`
 * über das Abo. Ein späterer Umstieg auf API-Nutzung (N-H) geschieht nur hier.
 *
 * Abschottung (Review B1): frisches Arbeitsverzeichnis außerhalb des Checkouts (keine `.claude/settings.json`, keine
 * `CLAUDE.md`, kein `.git`), leeres `HOME`, Umgebung nur mit den nötigen Variablen. Kein `--verbose`; Modellantworten
 * kommen nie ins Log, nur zurück an den Aufrufer.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export interface LlmCall {
  model: string;
  /** ersetzt den Standard-Prompt der CLI (Pflicht, auch wegen der Tokens) */
  systemPromptFile: string;
  /** Eingabe über stdin */
  user: string;
  tools: "none" | "web";
  /** JSON Schema der Antwort; die CLI erzwingt es (`structured_output`) */
  schema: object;
  maxTurns: number;
  signal: AbortSignal;
}

interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  webSearchRequests: number;
}

export interface LlmResult {
  /** `structured_output` bei Erfolg, sonst null */
  output: unknown;
  /** Summe über alle Modelle aus `modelUsage` (`usage` zählt nur die Hauptschleife) */
  usage: LlmUsage;
  /** Schätzung der CLI zum API-Gegenwert, nicht der Abo-Preis (E8) */
  costUsd: number | null;
  turns: number;
  durationMs: number;
  abort: "auth" | "limit" | null;
  /** Ausgabe an `CLAUDE_CODE_MAX_OUTPUT_TOKENS` abgeschnitten (nur am Meldungstext erkennbar) */
  truncated: boolean;
  /** abgelehnte Werkzeuge; unter `dontAsk` meldet die CLI trotzdem Erfolg */
  permissionDenials: string[];
  /** technischer Fehler ohne Ausgabe (CLI-Meldung, nie Modelltext), sonst null */
  error: string | null;
}

/** Feste Obergrenze der Ausgabe je Aufruf (E2); darüber meldet die CLI das Abschneiden. */
const MAX_OUTPUT_TOKENS = "32000";
/** Ein hängender Aufruf darf den Lauf nicht blockieren; der größte Anbieter braucht mit Haiku wenige Minuten. */
const TIMEOUT_MS = 15 * 60_000;

const Num = z.number().catch(0);
const CliOutput = z.looseObject({
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  api_error_status: z.number().nullable().optional(),
  num_turns: z.number().optional(),
  duration_ms: z.number().optional(),
  total_cost_usd: z.number().nullable().optional(),
  structured_output: z.unknown().optional(),
  modelUsage: z
    .record(
      z.string(),
      z.looseObject({
        inputTokens: Num,
        outputTokens: Num,
        cacheReadInputTokens: Num,
        cacheCreationInputTokens: Num,
        webSearchRequests: Num,
        costUSD: z.number().optional(),
      }),
    )
    .optional(),
  permission_denials: z.array(z.looseObject({ tool_name: z.string().catch("?") })).optional(),
});
type CliOutput = z.infer<typeof CliOutput>;

/** Argumentliste nach E2; `--json-schema` nimmt den Text, keinen Pfad (S1.1). */
function llmArgs(call: Omit<LlmCall, "signal" | "user">): string[] {
  const tools =
    call.tools === "web"
      ? // --tools macht verfügbar, erst --allowedTools erlaubt unter dontAsk (S1.1)
        ["--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch,WebFetch"]
      : ["--tools", ""];
  return [
    "-p",
    "--model",
    call.model,
    "--system-prompt-file",
    call.systemPromptFile,
    ...tools,
    "--disallowedTools",
    "mcp__*",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(call.schema),
    "--max-turns",
    String(call.maxTurns),
    "--no-session-persistence",
    "--permission-mode",
    "dontAsk",
  ];
}

/**
 * Umgebung des Aufrufs: nur PATH, HOME, das Token und die Ausgabegrenze; `ANTHROPIC_API_KEY` nur, wenn gesetzt
 * (späterer Umstieg auf API, N-H). Alles andere (GITHUB_TOKEN, GIT_*, …) bleibt draußen.
 *
 * Lokale Ausnahme (Abweichung von E2, nur für Proben und Evals am eigenen Rechner): Ohne Token und ohne API-Schlüssel
 * gibt es nur den Login des Entwicklers in seinem `HOME`. Dann bleibt `HOME` das echte, sonst fehlt der Login. Dabei
 * gelten dessen Nutzer-Einstellungen (Hooks, MCP, Nutzer-`CLAUDE.md`); Messwerte sind also nicht ganz wie in Actions.
 * Wer das vermeiden will, setzt lokal ein Token (`claude setup-token`). In Actions (`GITHUB_ACTIONS`) gilt die
 * Ausnahme nie: Fehlt dort das Secret, bleibt `HOME` leer, die CLI meldet den fehlenden Login und der Lauf endet mit
 * `abort: "auth"`.
 */
function llmEnv(source: NodeJS.ProcessEnv, emptyHome: string): Record<string, string> {
  const token = source["CLAUDE_CODE_OAUTH_TOKEN"] ?? "";
  const apiKey = source["ANTHROPIC_API_KEY"];
  const localLogin = token === "" && !apiKey && source["GITHUB_ACTIONS"] !== "true";
  return {
    PATH: source["PATH"] ?? "",
    HOME: localLogin ? (source["HOME"] ?? emptyHome) : emptyHome,
    CLAUDE_CODE_OAUTH_TOKEN: token,
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: MAX_OUTPUT_TOKENS,
    ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
  };
}

const TRUNCATED = /exceeded the \d+ output token maximum/;

/**
 * Abbruchgrund nach S1.1: 401/403 bzw. Login-Meldung → auth, 429 bzw. Meldung zum Nutzungs- oder Ratenlimit → limit.
 * Nur bei `is_error`. Das Limit-Muster ist eng, weil `limit` den ganzen Lauf beendet (E6): Kontext- oder
 * Größenlimits sind ein Fehler des Anbieters, kein Abbruch.
 */
function abortOf(out: CliOutput): LlmResult["abort"] {
  if (!out.is_error) return null;
  const text = out.result ?? "";
  if (
    out.api_error_status === 401 ||
    out.api_error_status === 403 ||
    /authenticat|oauth|bearer|billing|not logged in|\/login|api key/i.test(text)
  )
    return "auth";
  if (
    (out.api_error_status === 429 || /rate.?limit|usage limit|limit reached|hit your limit/i.test(text)) &&
    !TRUNCATED.test(text)
  )
    return "limit";
  return null;
}

const emptyUsage = (): LlmUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearchRequests: 0,
});

/** Wertet die JSON-Ausgabe der CLI aus (ohne Prozess, daher direkt testbar). */
function parseCliOutput(stdout: string, exit: { code: number | null; stderr: string; wallMs: number }): LlmResult {
  const firstLine = (s: string) => s.trim().split("\n")[0]?.slice(0, 200) ?? "";
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  const parsed = CliOutput.safeParse(json);
  if (!parsed.success)
    return {
      output: null,
      usage: emptyUsage(),
      costUsd: null,
      turns: 0,
      durationMs: exit.wallMs,
      abort: null,
      truncated: false,
      permissionDenials: [],
      error: `keine JSON-Ausgabe der CLI (Exit ${exit.code ?? "Signal"}${exit.stderr.trim() ? `: ${firstLine(exit.stderr)}` : ""})`,
    };
  const out = parsed.data;
  const usage = emptyUsage();
  let modelCost: number | null = null;
  for (const m of Object.values(out.modelUsage ?? {})) {
    usage.inputTokens += m.inputTokens;
    usage.outputTokens += m.outputTokens;
    usage.cacheReadTokens += m.cacheReadInputTokens;
    usage.cacheCreationTokens += m.cacheCreationInputTokens;
    usage.webSearchRequests += m.webSearchRequests;
    if (m.costUSD !== undefined) modelCost = (modelCost ?? 0) + m.costUSD;
  }
  const success = out.is_error === false && out.structured_output !== undefined && out.structured_output !== null;
  const truncated = !success && TRUNCATED.test(out.result ?? "");
  const abort = success ? null : abortOf(out);
  // Bei is_error ist `result` eine Meldung der CLI bzw. API, keine Modellantwort (S1.1); sonst nie ins Ergebnis.
  const error = success
    ? null
    : out.is_error
      ? `CLI meldet Fehler${out.api_error_status ? ` (HTTP ${out.api_error_status})` : ""}: ${firstLine(out.result ?? "")}`
      : "keine strukturierte Ausgabe";
  return {
    output: success ? out.structured_output : null,
    usage,
    costUsd: out.total_cost_usd ?? modelCost,
    turns: out.num_turns ?? 0,
    durationMs: out.duration_ms ?? exit.wallMs,
    abort,
    truncated,
    permissionDenials: (out.permission_denials ?? []).map((d) => d.tool_name),
    error,
  };
}

export interface LlmOptions {
  /** Programm der CLI; Standard `CLAUDE_BIN` oder `claude` */
  bin?: string;
  /** Quelle der Umgebung (Tests); Standard `process.env` */
  env?: NodeJS.ProcessEnv;
}

export async function callLlm(call: LlmCall, opts: LlmOptions = {}): Promise<LlmResult> {
  const source = opts.env ?? process.env;
  const bin = opts.bin ?? source["CLAUDE_BIN"] ?? "claude";
  const work = mkdtempSync(join(tmpdir(), "zp-llm-cwd-"));
  const home = mkdtempSync(join(tmpdir(), "zp-llm-home-"));
  const started = performance.now();
  try {
    const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
      (resolve, reject) => {
        const child = spawn(bin, llmArgs(call), {
          cwd: work,
          env: llmEnv(source, home),
          stdio: ["pipe", "pipe", "pipe"],
          signal: AbortSignal.any([call.signal, AbortSignal.timeout(TIMEOUT_MS)]),
        });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout.on("data", (b: Buffer) => out.push(b));
        child.stderr.on("data", (b: Buffer) => err.push(b));
        // Die CLI kann vor dem Ende der Eingabe aussteigen; EPIPE meldet dann `close`, kein Absturz
        child.stdin.on("error", () => undefined);
        child.on("error", reject);
        child.on("close", (c) =>
          resolve({
            stdout: Buffer.concat(out).toString("utf8"),
            stderr: Buffer.concat(err).toString("utf8"),
            code: c,
          }),
        );
        child.stdin.end(call.user);
      },
    );
    return parseCliOutput(stdout, { code, stderr, wallMs: Math.round(performance.now() - started) });
  } catch (e) {
    if (call.signal.aborted) throw e;
    return {
      ...parseCliOutput("", { code: null, stderr: "", wallMs: Math.round(performance.now() - started) }),
      error: `CLI nicht ausführbar oder Zeitüberschreitung: ${(e as Error).message.split("\n")[0]?.slice(0, 200)}`,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}
