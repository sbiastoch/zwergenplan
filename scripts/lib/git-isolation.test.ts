import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withoutGitEnv } from "./git-env.ts";
import { tempRepo } from "./temp-repo.ts";
import { treeId } from "./tree-id.ts";

/**
 * Kanarienvogel nach dem Vorfall vom 2026-10-08 (Plan 0027, Etappe 3): Ein Test, den der pre-commit-Hook startete,
 * erbte GIT_DIR und GIT_INDEX_FILE. Sein `git init` und `git config` im Temp-Ordner trafen das echte Repo
 * (`core.bare = true`, fremde `user.*`), sein `git commit` den Branch.
 * Hier läuft dieselbe Lage gegen ein Köder-Repo. Danach darf am Köder nichts verändert sein, und am echten Projekt
 * nach allen Tests dieser Datei auch nicht.
 */
const PROJECT = fileURLToPath(new URL("../..", import.meta.url));
const projectGit = (...args: string[]) =>
  execFileSync("git", args, { cwd: PROJECT, env: withoutGitEnv(), encoding: "utf8" }).trim();

let projectHead = "";
beforeAll(() => {
  projectHead = projectGit("rev-parse", "HEAD");
});
afterAll(() => {
  // Das echte Projekt: nicht bare, keine Test-Identität, HEAD unverändert
  expect(projectGit("config", "--bool", "core.bare")).toBe("false");
  expect(() => projectGit("config", "--local", "--get", "user.email")).toThrow();
  expect(projectGit("rev-parse", "HEAD")).toBe(projectHead);
});

describe("git-Aufrufe der Skripte und Tests greifen nicht auf ein fremdes Repo durch", () => {
  it("unter geerbtem GIT_DIR/GIT_INDEX_FILE (wie in einem Hook) bleibt das Köder-Repo unverändert", () => {
    const decoy = tempRepo("zp-koeder-");
    try {
      writeFileSync(join(decoy.dir, "k.txt"), "k\n");
      decoy.git("add", "-A");
      decoy.git("commit", "-q", "-m", "köder");
      const gitDir = join(decoy.dir, ".git");
      const config = readFileSync(join(gitDir, "config"), "utf8");
      const head = decoy.git("rev-parse", "HEAD").trim();
      const index = readFileSync(join(gitDir, "index"));

      const saved = { ...process.env };
      Object.assign(process.env, {
        GIT_DIR: gitDir,
        GIT_INDEX_FILE: join(gitDir, "index"),
        GIT_WORK_TREE: decoy.dir,
      });
      try {
        // was die Tests und verify tun: Temp-Repo anlegen, committen, Tree-ID bestimmen
        const other = tempRepo("zp-anderes-");
        writeFileSync(join(other.dir, "o.txt"), "o\n");
        // wie im Projekt: der Wegwerf-Index liegt in einem ignorierten Ordner
        writeFileSync(join(other.dir, ".gitignore"), ".claude/state/\n");
        other.git("add", "-A");
        other.git("commit", "-q", "-m", "anderes");
        expect(treeId(other.dir)).toBe(other.git("rev-parse", "HEAD^{tree}").trim());
        other.remove();
      } finally {
        for (const key of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"]) {
          if (saved[key] === undefined) delete process.env[key];
          else process.env[key] = saved[key];
        }
      }

      expect(readFileSync(join(gitDir, "config"), "utf8")).toBe(config);
      expect(decoy.git("rev-parse", "HEAD").trim()).toBe(head);
      expect(readFileSync(join(gitDir, "index")).equals(index)).toBe(true);
    } finally {
      decoy.remove();
    }
  });
});
