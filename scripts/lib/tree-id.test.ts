import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type TempRepo, tempRepo } from "./temp-repo.ts";
import { readStamp, treeExists, treeId, writeJsonAtomic } from "./tree-id.ts";

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const f of cleanup.splice(0)) f();
});

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "zp-tree-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Isoliertes Temp-Repo mit einem ersten Commit (nie das Projekt-Repo, siehe temp-repo.ts). */
function repo(): TempRepo {
  const r = tempRepo("zp-tree-");
  cleanup.push(r.remove);
  writeFileSync(join(r.dir, ".gitignore"), "ignoriert/\n.claude/state/\n");
  writeFileSync(join(r.dir, "a.txt"), "a\n");
  r.git("add", "-A");
  r.git("commit", "-q", "-m", "start");
  return r;
}

describe("treeId: Inhalts-Hash des Arbeitsbaums (Plan 0027, E5.1)", () => {
  it("ist gleich vor und nach einem Commit desselben Inhalts", () => {
    const r = repo();
    writeFileSync(join(r.dir, "b.txt"), "b\n");
    const before = treeId(r.dir);
    r.git("add", "-A");
    r.git("commit", "-q", "-m", "b");
    expect(treeId(r.dir)).toBe(before);
    expect(before).toBe(r.git("rev-parse", "HEAD^{tree}").trim());
  });

  it("ändert sich mit geändertem und mit neuem Inhalt, nicht mit ignoriertem", () => {
    const r = repo();
    const start = treeId(r.dir);
    writeFileSync(join(r.dir, "neu-x"), "x");
    expect(treeId(r.dir)).not.toBe(start);
    rmSync(join(r.dir, "neu-x"));
    mkdirSync(join(r.dir, "ignoriert"));
    writeFileSync(join(r.dir, "ignoriert", "y"), "y");
    expect(treeId(r.dir)).toBe(start);
    writeFileSync(join(r.dir, "a.txt"), "anders\n");
    expect(treeId(r.dir)).not.toBe(start);
  });

  it("lässt den echten Index unberührt und räumt den Wegwerf-Index weg", () => {
    const r = repo();
    writeFileSync(join(r.dir, "neu.txt"), "n\n");
    treeId(r.dir);
    expect(r.git("status", "--porcelain")).toBe("?? neu.txt\n");
    expect(readdirSync(join(r.dir, ".claude", "state")).filter((f) => f.startsWith("idx-"))).toEqual([]);
  });

  it("liefert bei mehreren Aufrufen dieselbe ID (Wegwerf-Index je Aufruf eindeutig)", () => {
    const r = repo();
    writeFileSync(join(r.dir, "c.txt"), "c\n");
    expect(new Set(Array.from({ length: 4 }, () => treeId(r.dir))).size).toBe(1);
  });

  it("treeExists erkennt vorhandene und fehlende Tree-Objekte", () => {
    const r = repo();
    expect(treeExists(r.dir, treeId(r.dir))).toBe(true);
    expect(treeExists(r.dir, "0".repeat(40))).toBe(false);
    expect(treeExists(r.dir, "kein-hash; rm -rf /")).toBe(false);
  });
});

describe("Stempel-Dateien", () => {
  it("schreibt atomar, ohne Reste, und liest zurück", () => {
    const dir = tmp();
    writeJsonAtomic(join(dir, "sub", "s.json"), { tier: "C", at: 1, cAt: 1 });
    expect(JSON.parse(readFileSync(join(dir, "sub", "s.json"), "utf8"))).toEqual({ tier: "C", at: 1, cAt: 1 });
    expect(readdirSync(join(dir, "sub"))).toEqual(["s.json"]);
  });

  it("readStamp liest einen Stempel je Tree-ID und ist bei fehlender Datei leer", () => {
    const dir = tmp();
    const tree = "a".repeat(40);
    expect(readStamp(dir, tree)).toBeUndefined();
    writeJsonAtomic(join(dir, tree), { tier: "0", at: 2, cAt: 1 });
    expect(readStamp(dir, tree)).toEqual({ tier: "0", at: 2, cAt: 1 });
  });
});
