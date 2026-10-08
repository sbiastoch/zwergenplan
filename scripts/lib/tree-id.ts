/**
 * Inhalts-Hash des Arbeitsbaums und grüne Stempel (Plan 0027, E5.1/E5.2). Nur Node-Builtins und git.
 * Die Tree-ID hängt nur am Inhalt (getrackt plus neu, ohne Ignoriertes), nicht am Commit: Derselbe Inhalt ergibt
 * vor und nach einem Commit, nach einem Rebase und in jedem Worktree dieselbe ID.
 * `.claude/hooks/lib.ts` hat eine Kopie von `treeId`, weil Hooks nur Builtins importieren dürfen; ein Test hält
 * beide gleich (tree-id-hooks.test.ts).
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { withoutGitEnv } from "./git-env.ts";
import { parseStamp, type Stamp } from "./stop-decision.ts";

/** git im Projekt `root`, ohne geerbte GIT_*-Variablen (etwa aus einem Hook), damit nur `cwd` zählt. */
function git(root: string, args: string[], extra: NodeJS.ProcessEnv = {}): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...withoutGitEnv(), ...extra } }).trim();
}

/** Tree-ID des Arbeitsbaums über einen Wegwerf-Index, der je Prozess und Aufruf eindeutig ist. */
export function treeId(root: string): string {
  const stateDir = join(root, ".claude", "state");
  mkdirSync(stateDir, { recursive: true });
  const index = join(stateDir, `idx-${process.pid}-${randomBytes(4).toString("hex")}`);
  try {
    // Kopie des echten Index: git muss dann nur geänderte Dateien neu hashen.
    copyFileSync(git(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]), index);
  } catch {
    // noch kein Index (frisches Repo): leer anfangen
  }
  // Geschrieben werden nur der Wegwerf-Index und Objekte, nie Konfiguration, HEAD oder Refs.
  const env = { GIT_INDEX_FILE: index };
  try {
    git(root, ["add", "-A"], env);
    return git(root, ["write-tree"], env);
  } finally {
    rmSync(index, { force: true });
  }
}

/** Existiert das Tree-Objekt noch (git gc kann es entfernt haben)? */
export function treeExists(root: string, tree: string): boolean {
  if (!/^[0-9a-f]{40,64}$/.test(tree)) return false;
  try {
    execFileSync("git", ["cat-file", "-e", `${tree}^{tree}`], { cwd: root, stdio: "ignore", env: withoutGitEnv() });
    return true;
  } catch {
    return false;
  }
}

/** Erst in eine temporäre Datei daneben, dann `rename`: Leser sehen nie eine halbe Datei. */
export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, path);
}

export function readStamp(dir: string, tree: string): Stamp | undefined {
  try {
    return parseStamp(readFileSync(join(dir, tree), "utf8"));
  } catch {
    return undefined;
  }
}
