import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listFiles, localChanges, readGraph, resolveBase } from "./import-graph-io.ts";
import { type TempRepo, tempRepo } from "./temp-repo.ts";

/** Einlesen der E2E-Auswahl gegen ein echtes Temp-Repo (Plan 0029, B1, B2; Arch-Review m1). */
const repos: TempRepo[] = [];
afterEach(() => {
  for (const r of repos.splice(0)) r.remove();
});

function setup() {
  const repo = tempRepo("zp-graph-io-");
  repos.push(repo);
  const write = (path: string, text: string) => {
    mkdirSync(join(repo.dir, path, ".."), { recursive: true });
    writeFileSync(join(repo.dir, path), text);
  };
  write(".gitignore", "runs/\n");
  write("src/a.ts", 'import "./b.ts";\n');
  write("src/b.ts", "export {};\n");
  write("src/c.ts", "export {};\n");
  repo.git("add", "-A");
  repo.git("commit", "-q", "-m", "a");
  const base = repo.git("rev-parse", "HEAD").trim();
  return { repo, write, base };
}

describe("localChanges", () => {
  it("Commits seit der Basis, Arbeitsbaum, gelöschte und neue Dateien; ignorierte nicht", () => {
    const { repo, write, base } = setup();
    write("src/b.ts", "export const b = 1;\n");
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", "b");
    write("src/a.ts", 'import "./b.ts";\nexport {};\n');
    rmSync(join(repo.dir, "src/c.ts"));
    write("src/neu mit Leerzeichen.ts", "export {};\n");
    write("runs/ignoriert.json", "{}\n");
    expect(localChanges(repo.dir, base).sort()).toEqual(
      ["src/a.ts", "src/b.ts", "src/c.ts", "src/neu mit Leerzeichen.ts"].sort(),
    );
  });

  it("ohne Änderung leer; unbekannte Basis wirft", () => {
    const { repo, base } = setup();
    expect(localChanges(repo.dir, base)).toEqual([]);
    expect(() => localChanges(repo.dir, "1".repeat(40))).toThrow();
  });
});

describe("resolveBase (Arch-Review m2)", () => {
  it("ohne origin/main ein Hinweis statt einer Ausnahme", () => {
    const { repo } = setup();
    expect(resolveBase(repo.dir, undefined)).toEqual({
      error: "origin/main fehlt: --base <ref> angeben oder git fetch",
    });
    expect(resolveBase(repo.dir, "gibt-es-nicht")).toEqual({
      error: "gibt-es-nicht fehlt: --base <ref> angeben oder git fetch",
    });
  });

  it("mit origin/main der gemeinsame Vorfahre, mit --base der Commit dazu", () => {
    const { repo, write, base } = setup();
    repo.git("update-ref", "refs/remotes/origin/main", base);
    write("src/b.ts", "export const b = 2;\n");
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", "b");
    expect(resolveBase(repo.dir, undefined)).toEqual({ base });
    expect(resolveBase(repo.dir, "HEAD~1")).toEqual({ base });
  });
});

describe("listFiles und readGraph", () => {
  it("neue Dateien nur mit untracked; der Graph überspringt gelöschte Dateien", () => {
    const { repo, write } = setup();
    write("src/neu.ts", 'import "./a.ts";\n');
    expect(listFiles(repo.dir)).not.toContain("src/neu.ts");
    const files = listFiles(repo.dir, { untracked: true });
    expect(files).toContain("src/neu.ts");
    rmSync(join(repo.dir, "src/c.ts"));
    const graph = readGraph(repo.dir, files);
    expect(graph.get("src/neu.ts")).toEqual(["src/a.ts"]);
    expect(graph.get("src/a.ts")).toEqual(["src/b.ts"]);
    expect(graph.has("src/c.ts")).toBe(false);
    expect(graph.has(".gitignore")).toBe(false);
  });
});
