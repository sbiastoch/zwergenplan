import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MISSING_MESSAGE, STALE_MESSAGE, staleInstall } from "./install-state.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Projektordner mit optionalem Lockfile und optional der Kopie, die pnpm beim Installieren ablegt. */
function project(lock?: string, installed?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "zp-install-"));
  dirs.push(dir);
  if (lock !== undefined) writeFileSync(join(dir, "pnpm-lock.yaml"), lock);
  if (installed !== undefined) {
    mkdirSync(join(dir, "node_modules", ".pnpm"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".pnpm", "lock.yaml"), installed);
  }
  return dir;
}

describe("staleInstall (Plan 0027, E6)", () => {
  it("ist still, wenn node_modules zum Lockfile passt", () => {
    expect(staleInstall(project("lockfileVersion: '9.0'\n", "lockfileVersion: '9.0'\n"))).toBeUndefined();
  });

  it("meldet ein Lockfile, das neuer ist als die Installation, mit Abhilfe und Hinweis auf die pnpm-Version", () => {
    const dir = project("lockfileVersion: '9.0'\nweb-push: 3.6.7\n", "lockfileVersion: '9.0'\n");
    expect(staleInstall(dir)).toBe(STALE_MESSAGE);
    expect(STALE_MESSAGE).toContain("pnpm install --frozen-lockfile");
    expect(STALE_MESSAGE).toContain("packageManager");
  });

  it("meldet ein fehlendes node_modules bzw. eine fehlende Kopie eigens", () => {
    expect(staleInstall(project("lockfileVersion: '9.0'\n"))).toBe(MISSING_MESSAGE);
    expect(MISSING_MESSAGE).toContain("pnpm install --frozen-lockfile");
  });

  it("ohne Lockfile ist der Stand ebenfalls nicht prüfbar", () => {
    expect(staleInstall(project(undefined, "lockfileVersion: '9.0'\n"))).toBe(MISSING_MESSAGE);
  });

  it("vergleicht byte-genau, auch ein Zeilenende zählt", () => {
    expect(staleInstall(project("a\n", "a\n\n"))).toBe(STALE_MESSAGE);
  });
});
