/**
 * Isoliertes Temp-Repo für Tests, die git schreibend nutzen (Plan 0027, Etappe 3, Vorfall vom 2026-10-08).
 * - eigener Ordner (`mkdtemp`), explizites `cwd`, `GIT_DIR` und `GIT_WORK_TREE`;
 * - keine geerbten GIT_*-Variablen (`withoutGitEnv`), keine globale oder System-Konfiguration;
 * - die Identität kommt per `-c` und nie per `git config`. So schreibt nichts eine Konfiguration, auch nicht im
 *   Temp-Repo.
 * Nur für Tests. Produktivcode ruft git mit `withoutGitEnv` im echten Projekt auf und schreibt dort nie Konfiguration.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withoutGitEnv } from "./git-env.ts";

export interface TempRepo {
  dir: string;
  git: (...args: string[]) => string;
  remove: () => void;
}

export function tempRepo(prefix = "zp-git-"): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const env = {
    ...withoutGitEnv(),
    GIT_DIR: join(dir, ".git"),
    GIT_WORK_TREE: dir,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=test@example.org", "-c", "user.name=Test", ...args], {
      cwd: dir,
      env,
      encoding: "utf8",
    });
  git("init", "-q");
  return { dir, git, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
