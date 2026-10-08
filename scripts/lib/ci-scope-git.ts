/**
 * Git-Teil des CI-Jobs `scope` (Plan 0027, E10): Vorfahre und geänderte Pfade zwischen zwei Commits, nur lesend.
 * Läuft im Job ohne `pnpm install`, deshalb nur Node-Builtins (Regel `ci-scope-builtins-only`).
 * Gefährlich ist hier nur eine Richtung: Fehlen Pfade, ergäbe das fälschlich `full=false`. Deshalb `-z` (Namen mit
 * Leerzeichen, Umlaut oder Zeilenumbruch kommen unverändert an) und `--no-renames` (alter und neuer Pfad).
 */
import { execFileSync, spawnSync } from "node:child_process";
import type { E2eIo, ScopeIo } from "./ci-scope.ts";
import { withoutGitEnv } from "./git-env.ts";

// Schutz gegen einen hängenden git-Aufruf; der Job hat 3 min, gemessen braucht jeder Aufruf Millisekunden.
const GIT_TIMEOUT_MS = 30_000;

/** git im Checkout `root`, ohne geerbte GIT_*-Variablen (git-env.ts). */
export function scopeGit(root: string): Pick<ScopeIo, "isAncestor" | "changedPaths"> & Pick<E2eIo, "mergeBase"> {
  const options = { cwd: root, env: withoutGitEnv(), encoding: "utf8", timeout: GIT_TIMEOUT_MS } as const;
  return {
    // Basis der E2E-Auswahl auf Branches (Plan 0029, B5); wirft ohne origin/main
    mergeBase(a, b) {
      return execFileSync("git", ["merge-base", a, b], { ...options, stdio: ["ignore", "pipe", "pipe"] }).trim();
    },
    isAncestor(from, to) {
      const r = spawnSync("git", ["merge-base", "--is-ancestor", from, to], options);
      if (r.error) throw r.error;
      if (r.status === 0) return true;
      if (r.status === 1) return false;
      throw new Error(`git merge-base: ${r.stderr.trim() || `Exit ${r.status}`}`);
    },
    changedPaths(from, to) {
      return execFileSync("git", ["diff", "-z", "--name-only", "--no-renames", from, to], {
        ...options,
        maxBuffer: 16 * 1024 * 1024,
      })
        .split("\0")
        .filter((p) => p !== "");
    },
  };
}
