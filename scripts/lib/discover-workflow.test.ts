import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/** `.github/workflows/discover.yml` (Plan 0050, E1, E5, E8) */
const workflow: {
  on: { schedule?: unknown; workflow_dispatch: { inputs: Record<string, { default: string }> } };
  jobs: Record<
    string,
    {
      "timeout-minutes": unknown;
      steps: Array<{ name?: string; uses?: string; if?: string; with?: Record<string, string> }>;
    }
  >;
} = parse(readFileSync(new URL("../../.github/workflows/discover.yml", import.meta.url), "utf8"));
const entdecken = workflow.jobs["entdecken"];
const steps = entdecken?.steps ?? [];

describe("discover.yml (Plan 0050, S1)", () => {
  it("kein Wochen-Cron mehr: bis S6 nur per workflow_dispatch (E1)", () => {
    expect(workflow.on.schedule).toBeUndefined();
  });

  it("timeout-minutes höchstens 330 (GitHub erlaubt 6 Stunden, E8)", () => {
    expect(entdecken?.["timeout-minutes"]).toBe(330);
  });

  it("Bremsen der Eingaben wie DISCOVER_BRAKES", () => {
    expect(workflow.on.workflow_dispatch.inputs["max_calls"]?.default).toBe("1500");
    expect(workflow.on.workflow_dispatch.inputs["max_tokens"]?.default).toBe("150000000");
  });

  it("Lauf-Cache des Geocoders: restore vor dem Lauf, save immer danach (E5)", () => {
    const restore = steps.findIndex((s) => s.uses?.startsWith("actions/cache/restore@"));
    const run = steps.findIndex((s) => s.name === "Entdecken");
    const save = steps.findIndex((s) => s.uses?.startsWith("actions/cache/save@"));
    expect(restore).toBeGreaterThanOrEqual(0);
    expect(restore).toBeLessThan(run);
    expect(save).toBeGreaterThan(run);
    expect(steps[save]?.if).toBe("always()");
    for (const i of [restore, save]) {
      expect(steps[i]?.with).toMatchObject({
        path: "~/.cache/zwergenplan/geocode-v3.json",
        key: "geocode-${{ github.run_id }}",
      });
    }
    expect(steps[restore]?.with?.["restore-keys"]).toBe("geocode-");
  });
});
