import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

/** `.github/workflows/discover.yml` (Plan 0050, E1, E5, E6, E8) */
const workflow: {
  on: { schedule?: unknown; workflow_dispatch: { inputs: Record<string, { default: string | boolean }> } };
  concurrency: { group: string };
  jobs: Record<
    string,
    {
      "timeout-minutes": unknown;
      steps: Array<{
        name?: string;
        uses?: string;
        if?: string;
        run?: string;
        with?: Record<string, string>;
        env?: Record<string, string>;
      }>;
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

describe("discover.yml: Eval per workflow_dispatch (Plan 0050, S2)", () => {
  const inputs = workflow.on.workflow_dispatch.inputs;
  const modus = workflow.jobs["modus"]?.steps[0];
  const tmp = mkdtempSync(join(tmpdir(), "zp-discover-wf-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  /** Skript des Jobs `modus` mit bash, wie in Actions; Exit-Code und Ausgabe */
  const runModus = (env: Record<string, string>) => {
    const out = join(tmp, "out");
    writeFileSync(out, "");
    const r = spawnSync("bash", ["-e", "-c", modus?.run ?? "exit 99"], {
      env: {
        PATH: process.env["PATH"] ?? "",
        GITHUB_OUTPUT: out,
        GITHUB_STEP_SUMMARY: join(tmp, "summary"),
        EVENT: "workflow_dispatch",
        INPUT_MODUS: "trocken",
        INPUT_EVAL: "false",
        INPUT_MODEL: "",
        INPUT_EFFORT: "",
        INPUT_REGION: "",
        REF: "refs/heads/main",
        TIMEOUT_MIN: modus?.env?.["TIMEOUT_MIN"] ?? "",
        ...env,
      },
      encoding: "utf8",
    });
    return { status: r.status, stdout: r.stdout, output: readFileSync(out, "utf8") };
  };

  it("Eingaben eval, model, effort; concurrency-Gruppe aus inputs.eval", () => {
    expect(inputs["eval"]?.default).toBe(false);
    expect(inputs["model"]?.default).toBe("");
    expect(inputs["effort"]?.default).toBe("");
    expect(workflow.concurrency.group).toBe("${{ inputs.eval && 'entdecken-eval' || 'daten' }}");
  });

  it("Timeout im Job modus gleich timeout-minutes des Jobs entdecken", () => {
    expect(Number(modus?.env?.["TIMEOUT_MIN"])).toBe(workflow.jobs["entdecken"]?.["timeout-minutes"]);
  });

  it("Start, dessen Job das Fenster 01:30–04:30 UTC schneiden könnte, wird abgelehnt", () => {
    const at = (jetzt: string) => runModus({ INPUT_EVAL: "true", JETZT_UTC: jetzt }).status;
    expect(at("05:00")).toBe(0);
    // 19:40 + 20 Min. Einrichtung + 330 Min. = 01:30: endet genau am Fenster
    expect(at("19:40")).toBe(0);
    expect(at("19:41")).toBe(1);
    expect(at("02:00")).toBe(1);
    expect(at("04:29")).toBe(1);
    expect(at("04:30")).toBe(0);
    expect(runModus({ INPUT_EVAL: "true", JETZT_UTC: "05:00" }).output).toContain("modus=trocken");
  });

  it("eval nur trocken, model und effort nur mit eval; ohne eval keine Zeitprüfung", () => {
    expect(runModus({ INPUT_EVAL: "true", INPUT_MODUS: "live", JETZT_UTC: "12:00" }).status).toBe(1);
    expect(runModus({ INPUT_MODEL: "sonnet" }).status).toBe(1);
    expect(runModus({ INPUT_EVAL: "true", INPUT_REGION: "fuerth", JETZT_UTC: "12:00" }).status).toBe(1);
    expect(runModus({ INPUT_EVAL: "true", INPUT_EFFORT: "xhigh", JETZT_UTC: "12:00" }).status).toBe(0);
    expect(runModus({ JETZT_UTC: "02:00" }).status).toBe(0);
  });

  it("Lauf gibt --eval, --model und --effort nur bei gesetzter Eingabe weiter", () => {
    const run = steps.find((s) => s.name === "Entdecken")?.run ?? "";
    expect(run).toContain('[[ "$EVAL" == true ]] && args+=(--eval)');
    expect(run).toContain('[[ -n "$MODEL" ]] && args+=(--model "$MODEL")');
    expect(run).toContain('[[ -n "$EFFORT" ]] && args+=(--effort "$EFFORT")');
  });
});
