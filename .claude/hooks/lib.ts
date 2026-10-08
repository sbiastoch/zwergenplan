/** Gemeinsame Helfer für Claude-Code-Hooks (nur Node-Builtins, kein node_modules nötig). */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PROJECT_DIR = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
const STATE_DIR = join(PROJECT_DIR, ".claude", "state");

/**
 * Ohne installierte Abhängigkeiten (frischer Checkout, anderer Worktree) können die Gates nicht laufen.
 * Dann nicht blockieren, sondern einmal sichtbar darauf hinweisen.
 */
export function exitIfNotInstalled(): void {
  if (existsSync(join(PROJECT_DIR, "node_modules", ".bin", "tsc"))) return;
  process.stdout.write(
    JSON.stringify({ systemMessage: "Zwergenplan-Hooks inaktiv: zuerst `pnpm install` im Projekt ausführen." }),
  );
  process.exit(0);
}

export async function readInput<T>(): Promise<T> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw || "{}") as T;
}

export interface RunResult {
  ok: boolean;
  output: string;
  /** Exit-Code; `null`, wenn der Prozess durch ein Signal oder das Zeitlimit endete */
  status: number | null;
  /** Zeitlimit abgelaufen oder durch ein Signal beendet (Plan 0027, E5.4) */
  timedOut: boolean;
}

/**
 * Startet ein Kommando synchron. Mit `timeoutMs` wird es danach per SIGKILL beendet. Das zählt als Rot
 * (`timedOut`), nie als Durchlassen. Wer Kindprozesse startet, beendet deren Prozessgruppen mit einem eigenen,
 * kürzeren Zeitlimit selbst (verify 150 s, check:fast 140 s). Dieses Limit ist nur die letzte Sicherung unter dem
 * Hook-Timeout.
 */
export function run(cmd: string, args: string[], { timeoutMs }: { timeoutMs?: number } = {}): RunResult {
  const r = spawnSync(cmd, args, {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    maxBuffer: 16 * 1024 * 1024,
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs, killSignal: "SIGKILL" as const }),
  });
  const timedOut = r.signal !== null || (r.error !== undefined && "code" in r.error && r.error.code === "ETIMEDOUT");
  const note = timedOut ? `\nZeitlimit: ${cmd} ${args.join(" ")} wurde beendet (${r.signal ?? "ETIMEDOUT"}).` : "";
  return {
    ok: r.status === 0 && !timedOut,
    output: `${r.stdout ?? ""}${r.stderr ?? ""}${note}`.trim(),
    status: r.status,
    timedOut,
  };
}

export function tail(text: string, lines = 30): string {
  return text.split("\n").slice(-lines).join("\n");
}

/** Hinweis an Claude, ohne zu blockieren. */
export function addContext(event: string, text: string): void {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

export function readState<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(STATE_DIR, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeState(name: string, value: unknown): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, name), JSON.stringify(value));
}

/** Geänderte Zeilen (inkl. uncommittet) gegenüber dem Abzweig von origin/main. */
export function changedLines(): { ref: string; lines: number } {
  const base = run("git", ["merge-base", "HEAD", "origin/main"]);
  const ref = base.ok ? base.output : "main";
  const stat = run("git", ["diff", "--shortstat", ref]).output;
  const lines = [...stat.matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((n, m) => n + Number(m[1]), 0);
  return { ref, lines };
}

/**
 * Fingerabdruck des Arbeitsstands: die Tree-ID des Inhalts (getrackt plus neu, ohne Ignoriertes), unabhängig vom
 * Commit (Plan 0027, E5.1). Kopie von `treeId` aus `scripts/lib/tree-id.ts`, weil Hooks nur Builtins importieren;
 * `scripts/lib/tree-id-hooks.test.ts` hält beide gleich.
 */
export function treeHash(): string {
  mkdirSync(STATE_DIR, { recursive: true });
  const index = join(STATE_DIR, `idx-${process.pid}-${randomBytes(4).toString("hex")}`);
  // Ohne geerbte GIT_*-Variablen, damit nur PROJECT_DIR zählt (Vorfall 2026-10-08, scripts/lib/git-env.ts).
  // Geschrieben werden nur der Wegwerf-Index und Objekte, nie Konfiguration, HEAD oder Refs.
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  try {
    const real = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "index"], {
      cwd: PROJECT_DIR,
      env: clean,
      encoding: "utf8",
    }).stdout.trim();
    copyFileSync(real, index);
  } catch {
    // noch kein Index: leer anfangen
  }
  const env = { ...clean, GIT_INDEX_FILE: index };
  try {
    spawnSync("git", ["add", "-A"], { cwd: PROJECT_DIR, env });
    return spawnSync("git", ["write-tree"], { cwd: PROJECT_DIR, env, encoding: "utf8" }).stdout.trim();
  } finally {
    rmSync(index, { force: true });
  }
}
