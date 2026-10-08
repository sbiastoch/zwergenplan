import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scopeGit } from "./ci-scope-git.ts";
import { type TempRepo, tempRepo } from "./temp-repo.ts";

/**
 * Git-Teil des CI-Jobs `scope` gegen ein echtes Temp-Repo (Arch-Review Etappe 7, m5). Gefährlich wäre hier nur
 * eine Richtung: Fehlende Pfade ergäben fälschlich `full=false`.
 */
const repos: TempRepo[] = [];
afterEach(() => {
  for (const r of repos.splice(0)) r.remove();
});

const PLAN = "docs/plans/0001-x.md";
const SPACED = "docs/mit Leerzeichen ä.md";

function setup() {
  const repo = tempRepo("zp-ci-scope-");
  repos.push(repo);
  const write = (path: string, text: string) => {
    mkdirSync(join(repo.dir, path, ".."), { recursive: true });
    writeFileSync(join(repo.dir, path), text);
  };
  const commit = (message: string) => {
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", message);
    return repo.git("rev-parse", "HEAD").trim();
  };
  return { repo, write, commit, git: scopeGit(repo.dir) };
}

describe("scopeGit", () => {
  it("liefert jeden geänderten Pfad, auch mit Leerzeichen und Umlaut, und bei Umbenennung beide", () => {
    const { repo, write, commit, git } = setup();
    write("src/a.ts", "export {};\n");
    write(PLAN, "# Plan\n");
    const a = commit("a");
    write("src/b.ts", "export {};\n");
    write(SPACED, "x\n");
    repo.git("mv", "src/a.ts", "docs/a.md");
    const b = commit("b");
    expect(git.changedPaths(a, b).sort()).toEqual(["docs/a.md", SPACED, "src/a.ts", "src/b.ts"].sort());
    expect(git.changedPaths(b, b)).toEqual([]);
  });

  it("isAncestor: Vorfahre true, sonst false", () => {
    const { write, commit, git } = setup();
    write(PLAN, "1\n");
    const a = commit("a");
    write(PLAN, "2\n");
    const b = commit("b");
    expect(git.isAncestor(a, b)).toBe(true);
    expect(git.isAncestor(b, a)).toBe(false);
  });

  it("unbekanntes Objekt wirft, statt eine leere Liste zu liefern", () => {
    const { write, commit, git } = setup();
    write(PLAN, "1\n");
    const a = commit("a");
    const missing = "1".repeat(40);
    expect(() => git.isAncestor(missing, a)).toThrow(/merge-base/);
    expect(() => git.changedPaths(missing, a)).toThrow();
  });

  it("ohne Repository wirft es", () => {
    const { repo, git } = setup();
    rmSync(join(repo.dir, ".git"), { recursive: true, force: true });
    expect(() => git.changedPaths("HEAD", "HEAD")).toThrow();
    expect(() => git.isAncestor("HEAD", "HEAD")).toThrow();
  });
});
