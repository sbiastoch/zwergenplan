import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { callLlm, type LlmCall } from "./llm.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const BIN = join(ROOT, "tests/fixtures/fake-claude.mjs");
const scratch = mkdtempSync(join(tmpdir(), "zp-llm-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const SCHEMA = { type: "object", properties: { events: { type: "array" } }, required: ["events"] };
const call = (user: string, over: Partial<LlmCall> = {}): LlmCall => ({
  model: "haiku",
  systemPromptFile: "/abs/prompt/extract.md",
  user,
  tools: "none",
  schema: SCHEMA,
  maxTurns: 4,
  signal: new AbortController().signal,
  ...over,
});

/** Umgebung des Aufrufers mit allem, was nicht durchgereicht werden darf. */
const CI_ENV = {
  PATH: process.env["PATH"] ?? "",
  HOME: "/home/runner",
  CLAUDE_CODE_OAUTH_TOKEN: "tok",
  GITHUB_TOKEN: "geheim",
  GIT_DIR: "/repo/.git",
  CLAUDE_BIN: "/falsch",
};

let n = 0;
async function run(mode: string, env: NodeJS.ProcessEnv = CI_ENV, over: Partial<LlmCall> = {}) {
  const record = join(scratch, `call-${n++}.json`);
  const result = await callLlm(call(`FAKE ${mode} ${record}\nEingabe`, over), { bin: BIN, env });
  const seen = existsSync(record)
    ? (JSON.parse(readFileSync(record, "utf8")) as {
        args: string[];
        cwd: string;
        cwdFiles: string[];
        env: Record<string, string>;
        stdin: string;
      })
    : undefined;
  return { result, seen };
}

describe("callLlm (Fake-CLI)", () => {
  it("genaue Argumentliste nach E2, Schema als Text, Eingabe über stdin", async () => {
    const { seen } = await run("ok");
    expect(seen?.args).toEqual([
      "-p",
      "--model",
      "haiku",
      "--system-prompt-file",
      "/abs/prompt/extract.md",
      "--tools",
      "",
      "--disallowedTools",
      "mcp__*",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(SCHEMA),
      "--max-turns",
      "4",
      "--no-session-persistence",
      "--permission-mode",
      "dontAsk",
    ]);
    expect(seen?.stdin).toMatch(/\nEingabe$/);
  });

  it("Effort: --effort direkt nach dem Modell, ohne Effort kein Flag", async () => {
    const { seen } = await run("ok", CI_ENV, { effort: "high" });
    expect(seen?.args.slice(1, 5)).toEqual(["--model", "haiku", "--effort", "high"]);
  });

  it("Websuche: --tools und --allowedTools", async () => {
    const { seen } = await run("ok", CI_ENV, { tools: "web" });
    const i = seen?.args.indexOf("--tools") ?? -1;
    expect(seen?.args.slice(i, i + 4)).toEqual([
      "--tools",
      "WebSearch,WebFetch",
      "--allowedTools",
      "WebSearch,WebFetch",
    ]);
  });

  it("frisches, leeres Arbeitsverzeichnis und leeres HOME außerhalb des Checkouts, danach entfernt", async () => {
    const { seen } = await run("ok");
    expect(seen?.cwd.startsWith(ROOT)).toBe(false);
    expect(seen?.cwdFiles).toEqual([]);
    expect(seen?.env["HOME"]).not.toBe("/home/runner");
    expect(seen?.env["HOME"]?.startsWith(ROOT)).toBe(false);
    expect(existsSync(seen?.cwd ?? "")).toBe(false);
    expect(existsSync(seen?.env["HOME"] ?? "")).toBe(false);
  });

  it("Umgebung nur PATH, HOME, Token und Ausgabegrenze", async () => {
    const { seen } = await run("ok");
    expect(Object.keys(seen?.env ?? {}).sort()).toEqual([
      "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "HOME",
      "PATH",
    ]);
    expect(seen?.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("tok");
    expect(seen?.env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe("32000");
  });

  it("ANTHROPIC_API_KEY wird nur durchgereicht, wenn gesetzt (N-H)", async () => {
    const { seen } = await run("ok", { ...CI_ENV, CLAUDE_CODE_OAUTH_TOKEN: undefined, ANTHROPIC_API_KEY: "key" });
    expect(seen?.env["ANTHROPIC_API_KEY"]).toBe("key");
    expect(seen?.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("");
    expect(seen?.env["HOME"]).not.toBe("/home/runner");
  });

  it("lokal ohne Token und Schlüssel bleibt HOME das echte (Login des Entwicklers)", async () => {
    const { seen } = await run("ok", { PATH: CI_ENV.PATH, HOME: "/home/dev" });
    expect(seen?.env["HOME"]).toBe("/home/dev");
    expect(seen?.cwd.startsWith(ROOT)).toBe(false);
  });

  it("in Actions ohne Token nie das echte HOME; die CLI meldet den fehlenden Login → abort auth", async () => {
    const env = { PATH: CI_ENV.PATH, HOME: "/home/runner", GITHUB_ACTIONS: "true" };
    expect((await run("ok", env)).seen?.env["HOME"]).not.toBe("/home/runner");
    expect((await run("nologin", env)).result.abort).toBe("auth");
  });

  it("Erfolg: Ausgabe, Usage als Summe über modelUsage, Kosten, Schritte, Ablehnungen", async () => {
    const { result } = await run("ok");
    expect(result).toEqual({
      output: { events: [] },
      usage: { inputTokens: 110, outputTokens: 22, cacheReadTokens: 5, cacheCreationTokens: 7, webSearchRequests: 1 },
      costUsd: 0.0015,
      turns: 2,
      durationMs: 1234,
      abort: null,
      truncated: false,
      permissionDenials: ["WebSearch"],
      error: null,
    });
  });

  it("401 → abort auth, 429 → abort limit", async () => {
    const auth = (await run("401")).result;
    expect(auth).toMatchObject({ output: null, abort: "auth", truncated: false });
    expect(auth.error).toContain("HTTP 401");
    expect((await run("429")).result).toMatchObject({ output: null, abort: "limit", truncated: false });
  });

  it("Kontextlimit ist ein Fehler des Anbieters, kein Abbruch des Laufs", async () => {
    const { result } = await run("toolong");
    expect(result).toMatchObject({ output: null, abort: null, truncated: false });
    expect(result.error).toContain("HTTP 400");
  });

  it("abgeschnitten → truncated, kein abort", async () => {
    expect((await run("truncated")).result).toMatchObject({ output: null, abort: null, truncated: true });
  });

  it("kaputtes JSON und Exit ≠ 0 → error, ohne Ausgabe", async () => {
    const broken = (await run("broken")).result;
    expect(broken).toMatchObject({ output: null, abort: null, truncated: false, costUsd: null });
    expect(broken.error).toContain("keine JSON-Ausgabe");
    const exit = (await run("exit")).result;
    expect(exit.error).toContain("Exit 1: unbekannte Option --foo");
  });

  it("nicht startbares Programm → error statt Ausnahme", async () => {
    const result = await callLlm(call("x"), { bin: join(scratch, "fehlt"), env: CI_ENV });
    expect(result.output).toBeNull();
    expect(result.error).toContain("nicht ausführbar");
  });
});
