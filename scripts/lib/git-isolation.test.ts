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
let projectConfigPath = "";
let projectConfig = Buffer.alloc(0);
beforeAll(() => {
  projectHead = projectGit("rev-parse", "HEAD");
  // gemeinsame Konfiguration aller Worktrees (Arch-Review m6)
  projectConfigPath = join(projectGit("rev-parse", "--path-format=absolute", "--git-common-dir"), "config");
  projectConfig = readFileSync(projectConfigPath);
});
afterAll(() => {
  // Das echte Projekt: Konfiguration byte-gleich, nicht bare, HEAD unverändert. Ändert eine parallele Session
  // während dieser paar Sekunden die Konfiguration (etwa `git push -u`), wird das hier rot: dann neu laufen lassen.
  expect(projectGit("config", "--bool", "core.bare")).toBe("false");
  expect(readFileSync(projectConfigPath).equals(projectConfig)).toBe(true);
  expect(projectGit("rev-parse", "HEAD")).toBe(projectHead);
});

describe("Tests rufen git nur isoliert auf (Arch-Review M2)", () => {
  it('jede Zeile mit execFileSync/spawnSync("git" in einem Test nutzt withoutGitEnv oder liegt in tempRepo', () => {
    const tests = projectGit("ls-files", "--", "*.test.ts")
      .split("\n")
      .filter((f) => f !== "");
    const offenders: string[] = [];
    for (const file of tests) {
      readFileSync(join(PROJECT, file), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (
            /(?:execFileSync|spawnSync|spawn|execSync|exec)\(\s*["'`]git\b/.test(line) &&
            !line.includes("withoutGitEnv")
          ) {
            offenders.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
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
