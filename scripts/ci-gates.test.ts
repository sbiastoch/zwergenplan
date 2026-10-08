import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Das CLI des Jobs gates als Prozess (Plan 0029, B5): Eingaben aus env, Exit 1 bei Rot. Regeln: lib/ci-gates.test.ts. */
const SCRIPT = fileURLToPath(new URL("./ci-gates.ts", import.meta.url));
const GREEN = {
  REF: "refs/heads/main",
  FULL: "true",
  E2E_MODE: "full",
  DEVICES: "true",
  SMOKE_MODE: "true",
  R_SCOPE: "success",
  R_CHECK: "success",
  R_E2E: "success",
  R_SMOKE: "success",
};

function run(env: Record<string, string>) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout };
}

describe("ci-gates.ts als Prozess", () => {
  it("main, voll, alles grün → Exit 0", () => {
    const r = run(GREEN);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("alle Gates grün");
  });

  it("main mit Auswahl → Exit 1 mit ::error::", () => {
    const r = run({ ...GREEN, E2E_MODE: "select" });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("::error::auf main muss die volle Suite laufen");
  });
});
