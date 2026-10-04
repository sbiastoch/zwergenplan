/** Gemeinsame Helfer für Claude-Code-Hooks (nur Node-Builtins, kein node_modules nötig). */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PROJECT_DIR = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
const STATE_DIR = join(PROJECT_DIR, ".claude", "state");

export async function readInput<T>(): Promise<T> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw || "{}") as T;
}

export function run(cmd: string, args: string[]): { ok: boolean; output: string } {
  const r = spawnSync(cmd, args, {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    maxBuffer: 16 * 1024 * 1024,
  });
  return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
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

/** Fingerabdruck des Arbeitsstands (HEAD + uncommittete Änderungen inkl. neuer Dateien). */
export function treeHash(): string {
  const head = run("git", ["rev-parse", "HEAD"]).output;
  const status = run("git", ["status", "--porcelain=v1", "-uall"]).output;
  const diff = run("git", ["diff", "HEAD"]).output;
  const untracked = status
    .split("\n")
    .filter((l) => l.startsWith("?? "))
    .map((l) => l.slice(3));
  const content = untracked.map((f) => {
    try {
      return readFileSync(join(PROJECT_DIR, f), "utf8");
    } catch {
      return "";
    }
  });
  return createHash("sha256")
    .update([head, status, diff, ...content].join("\0"))
    .digest("hex");
}
