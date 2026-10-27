import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/** `.github/workflows/nightly.yml` (Plan 0048, E7; der Wächter folgt mit S2) */
const yml = readFileSync(new URL("../../.github/workflows/nightly.yml", import.meta.url), "utf8");
const workflow: {
  permissions: Record<string, string>;
  env: Record<string, string>;
  on: { workflow_dispatch: { inputs: Record<string, { default: string }> } };
  jobs: Record<
    string,
    {
      "timeout-minutes": unknown;
      permissions?: Record<string, string>;
      steps: Array<{ name?: string; run?: string; env?: Record<string, string> }>;
    }
  >;
} = parse(yml);
const nachtlauf = workflow.jobs["nachtlauf"];
const step = nachtlauf?.steps.find((s) => s.name === "Nachtlauf");

describe("nightly.yml (Plan 0048, E7)", () => {
  it("timeout-minutes aus der Eingabe, beim Zeitplan (leere Eingabe) 90", () => {
    expect(nachtlauf?.["timeout-minutes"]).toBe("${{ fromJSON(inputs.timeout || '90') }}");
    expect(workflow.on.workflow_dispatch.inputs["timeout"]?.default).toBe("90");
  });

  it("umstellen und only werden geprüft und weitergegeben, budget_min bleibt 20 Minuten unter timeout", () => {
    expect(step?.env).toMatchObject({ UMSTELLEN: "${{ inputs.umstellen }}", TIMEOUT: "${{ inputs.timeout || '90' }}" });
    expect(step?.run).toContain('[[ "$UMSTELLEN" =~ ^[a-z0-9,-]*$ ]]');
    expect(step?.run).toContain('args+=(--umstellen "$UMSTELLEN")');
    expect(step?.run).toContain("+ 20 > TIMEOUT");
    // budget_min und timeout nur als Zahl in die Arithmetik (Arch-Review m4)
    expect(step?.run).toContain('[[ "${RUN_BUDGET_MIN:-50}" =~ ^[0-9]+$ && "$TIMEOUT" =~ ^[0-9]+$ ]]');
  });

  it("Modell und Effort gleich in Nachtlauf und Entdecken (Plan 0048, Nachtrag 2)", () => {
    const model = { LLM_MODEL_EXTRACT: "opus", LLM_MODEL_FALLBACK: "opus", LLM_EFFORT_EXTRACT: "xhigh" };
    const discover: { env: Record<string, string> } = parse(
      readFileSync(new URL("../../.github/workflows/discover.yml", import.meta.url), "utf8"),
    );
    expect(workflow.env).toMatchObject(model);
    expect(discover.env).toMatchObject(model);
  });

  it("der Job mit dem Modell hat kein Schreibrecht", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(nachtlauf?.permissions).toBeUndefined();
  });
});
