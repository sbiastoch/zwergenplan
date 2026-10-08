import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Das Skript als Prozess (Plan 0027, Test 6): Exit immer 0, im Zweifel `full=true` in $GITHUB_OUTPUT.
 * Die Fälle brauchen weder Netz noch Git: Sie enden vor dem ersten Abruf. Die Entscheidung selbst prüft
 * lib/ci-scope.test.ts.
 */
const SCRIPT = fileURLToPath(new URL("./ci-scope.ts", import.meta.url));
const HEAD = "a666dbe0123456789abcdef0123456789abcdef0";
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function run(env: Record<string, string>, output = true) {
  const dir = mkdtempSync(join(tmpdir(), "ci-scope-"));
  dirs.push(dir);
  const file = join(dir, "output");
  writeFileSync(file, "");
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GITHUB_")));
  const r = spawnSync(process.execPath, [SCRIPT], {
    env: { ...base, ...(output ? { GITHUB_OUTPUT: file } : {}), ...env },
    encoding: "utf8",
    // unter dem Vitest-Limit von 5 s, damit ein Hänger als eigener Fehler erscheint
    timeout: 4_000,
  });
  return { code: r.status, stdout: r.stdout, output: readFileSync(file, "utf8") };
}

describe("ci-scope.ts als Prozess", () => {
  it("pull_request → full=true, Exit 0", () => {
    const r = run({ GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/1/merge", GITHUB_SHA: HEAD });
    expect(r.code).toBe(0);
    expect(r.output).toBe("full=true\n");
    expect(r.stdout).toContain("::notice title=Umfang::full=true – Ereignis pull_request");
  });

  it("Ausnahme im Skript (Repository und Token fehlen) → full=true, Exit 0", () => {
    const r = run({ GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", GITHUB_SHA: HEAD });
    expect(r.code).toBe(0);
    expect(r.output).toBe("full=true\n");
    expect(r.stdout).toContain("GITHUB_REPOSITORY fehlt");
  });

  it("ohne GITHUB_OUTPUT → Exit 0 mit Hinweis", () => {
    const r = run({ GITHUB_EVENT_NAME: "workflow_dispatch" }, false);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("GITHUB_OUTPUT fehlt");
  });
});
