import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

/** `.github/workflows/nightly.yml` (Plan 0048, E7 und Wächter E10) */
const yml = readFileSync(new URL("../../.github/workflows/nightly.yml", import.meta.url), "utf8");
const workflow: {
  permissions: Record<string, string>;
  env: Record<string, string>;
  on: { workflow_dispatch: { inputs: Record<string, { default: string; options?: string[] }> } };
  jobs: Record<
    string,
    {
      "timeout-minutes": unknown;
      "continue-on-error"?: unknown;
      if?: string;
      needs?: string[];
      permissions?: Record<string, string>;
      steps: Array<{
        name?: string;
        if?: string;
        uses?: string;
        run?: string;
        env?: Record<string, string>;
        with?: Record<string, string>;
        "continue-on-error"?: unknown;
      }>;
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

  it("umstellen und only werden geprüft und weitergegeben, budget_min bleibt 40 Minuten unter timeout", () => {
    expect(step?.env).toMatchObject({ UMSTELLEN: "${{ inputs.umstellen }}", TIMEOUT: "${{ inputs.timeout || '90' }}" });
    expect(step?.run).toContain('[[ "$UMSTELLEN" =~ ^[a-z0-9,-]*$ ]]');
    expect(step?.run).toContain('args+=(--umstellen "$UMSTELLEN")');
    expect(step?.run).toContain("+ 40 > TIMEOUT");
    // budget_min und timeout nur als Zahl in die Arithmetik (Arch-Review m4)
    expect(step?.run).toContain('[[ "${RUN_BUDGET_MIN:-50}" =~ ^[0-9]+$ && "$TIMEOUT" =~ ^[0-9]+$ ]]');
  });

  it("abruf als Auswahl, beim Zeitplan neu (N1), an nightly und fetch weitergegeben (Plan 0048, E8)", () => {
    expect(workflow.on.workflow_dispatch.inputs["abruf"]).toMatchObject({
      options: ["neu", "alt", "beide"],
      default: "neu",
    });
    expect(step?.env).toMatchObject({ ABRUF: "${{ inputs.abruf || 'neu' }}" });
    expect(step?.run).toContain('--abruf "$ABRUF"');
    const fetchStep = workflow.jobs["fetch"]?.steps.find((s) => s.name === "Abruf");
    expect(fetchStep?.env).toMatchObject({ ABRUF: "${{ inputs.abruf || 'neu' }}" });
    expect(fetchStep?.run).toContain('--abruf "$ABRUF"');
    // mit alt keine Vornacht aus dem anderen Abruf (Arch-Review S3, m8)
    const save = workflow.jobs["fetch"]?.steps.filter(
      (s) => s.name === "Hashes für die nächste Nacht" || s.uses?.startsWith("actions/cache/save"),
    );
    expect(save?.map((s) => s.if)).toEqual(["inputs.abruf != 'alt'", "inputs.abruf != 'alt'"]);
  });

  it("Modell und Effort: Nachtlauf Haiku high, Entdecken Opus high (Plan 0048, Nachtrag 4)", () => {
    const discover: { env: Record<string, string> } = parse(
      readFileSync(new URL("../../.github/workflows/discover.yml", import.meta.url), "utf8"),
    );
    expect(workflow.env).toMatchObject({
      LLM_MODEL_EXTRACT: "haiku",
      LLM_MODEL_FALLBACK: "haiku",
      LLM_EFFORT_EXTRACT: "high",
    });
    expect(workflow.env["LLM_MODEL_DISCOVER"]).toBeUndefined();
    expect(discover.env).toMatchObject({
      LLM_MODEL_EXTRACT: "opus",
      LLM_MODEL_FALLBACK: "opus",
      LLM_EFFORT_EXTRACT: "high",
      LLM_MODEL_DISCOVER: "opus",
      LLM_EFFORT_DISCOVER: "high",
    });
  });

  it("Richter des ID-Gates: Opus high (ADR 0041, Punkt 4)", () => {
    expect(workflow.env).toMatchObject({ LLM_MODEL_JUDGE: "opus", LLM_EFFORT_JUDGE: "high" });
  });

  it("der Job mit dem Modell hat kein Schreibrecht", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(nachtlauf?.permissions).toBeUndefined();
  });
});

describe("nightly.yml: Wächter (Plan 0048, E10)", () => {
  const waechter = workflow.jobs["waechter"];
  const run = waechter?.steps.map((s) => s.run ?? "").join("\n") ?? "";

  it("der Bericht schreibt waechter.md, ein eigenes Artefakt trägt sie", () => {
    expect(nachtlauf?.steps.find((s) => s.name === "Bericht")?.run).toContain("--waechter");
    const upload = nachtlauf?.steps.find((s) => s.with?.["name"] === "waechter");
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@/);
    expect(upload?.with?.["path"]).toContain("waechter.md");
    expect(upload?.with?.["if-no-files-found"]).toBe("error");
  });

  it("genau issues: write, kein Checkout, nur live nach erfolgreichem Nachtlauf, auch ohne Veröffentlichen", () => {
    expect(waechter?.permissions).toEqual({ issues: "write" });
    expect(waechter?.steps.some((s) => s.uses?.startsWith("actions/checkout"))).toBe(false);
    expect(waechter?.needs).toEqual(["modus", "nachtlauf", "veroeffentlichen"]);
    expect(waechter?.if).toBe("always() && needs.modus.outputs.modus == 'live' && needs.nachtlauf.result == 'success'");
  });

  it("gh nur mit --repo, Text per --body-file, Issue nur von github-actions", () => {
    expect(run).toContain('repo=(--repo "$GITHUB_REPOSITORY")');
    for (const cmd of run.match(/gh (label|issue) [a-z]+[^\n]*/g) ?? []) expect(cmd).toContain('"${repo[@]}"');
    expect(run).toContain("--app github-actions");
    expect(run).not.toMatch(/--body[ =]/);
    expect(run).toContain("--body-file");
  });

  it("kein continue-on-error: Scheitert der Wächter, wird der Lauf rot", () => {
    expect(waechter?.["continue-on-error"]).toBeUndefined();
    expect(waechter?.steps.every((s) => s["continue-on-error"] === undefined)).toBe(true);
  });

  it("der Marker wird mit demselben Zeichensatz gelesen wie in lib/watch.ts", () => {
    // nur als ganze Zeile, wie `^…$` in WATCH_MARKER: ein Marker im Grund einer Befundzeile zählt nicht (m3)
    expect(run).toContain("grep -oxE '<!-- waechter: [a-z0-9:,#-]* -->'");
  });
});

/**
 * Der Schritt „Issue pflegen“ des Jobs `waechter` gegen ein nachgebautes `gh` auf `PATH` (Arch-Review S2, m2): Es
 * schreibt jeden Aufruf samt Inhalt von `--body-file` ins Protokoll und liefert für `issue list` das vorgegebene Issue.
 */
describe("nightly.yml: Wächter-Schritt mit nachgebautem gh", () => {
  const script = workflow.jobs["waechter"]?.steps.find((s) => s.name === "Issue pflegen")?.run ?? "";
  const GH = `#!/usr/bin/env bash
echo "gh $*" >> "$SIM/gh.log"
[[ "$1 $2" == "issue list" ]] && cat "$SIM/issue.json"
prev=""
for a in "$@"; do [[ "$prev" == --body-file ]] && { echo "<<"; cat "$a"; echo ">>"; } >> "$SIM/gh.log"; prev="$a"; done
exit 0
`;
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** Ein Lauf mit vorhandenem Issue (`undefined`: keins) und Text aus dem Artefakt; Rückgabe: Protokoll von gh */
  function run(issue: { state: "OPEN" | "CLOSED"; body: string } | undefined, body: string): string {
    const dir = mkdtempSync(join(tmpdir(), "waechter-"));
    dirs.push(dir);
    mkdirSync(join(dir, "bin"));
    mkdirSync(join(dir, "waechter"));
    writeFileSync(join(dir, "bin", "gh"), GH);
    chmodSync(join(dir, "bin", "gh"), 0o755);
    writeFileSync(join(dir, "issue.json"), JSON.stringify(issue ? [{ number: 7, ...issue }] : []));
    writeFileSync(join(dir, "waechter", "waechter.md"), body);
    writeFileSync(join(dir, "gh.log"), "");
    execFileSync("bash", ["-c", script], {
      cwd: dir,
      env: {
        PATH: `${join(dir, "bin")}:${process.env["PATH"] ?? ""}`,
        SIM: dir,
        GITHUB_REPOSITORY: "o/r",
        GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
      },
      stdio: "pipe",
    });
    expect(existsSync(join(dir, "summary.md"))).toBe(true);
    return readFileSync(join(dir, "gh.log"), "utf8");
  }
  const text = (pairs: string, extra = "") =>
    `Befunde des Wächters …\n\n- \`a\` · leer · \`keine künftigen Angebote\`${extra}\n\n<!-- waechter: ${pairs} -->`;
  const calls = (log: string) =>
    log.split("\n").filter((l) => l.startsWith("gh issue ") && !l.startsWith("gh issue list"));

  it("ohne Issue: anlegen mit Label", () => {
    const log = run(undefined, text("a:leer"));
    expect(calls(log)).toEqual([
      "gh issue create --repo o/r --title Wächter: Befunde des Nachtlaufs --label waechter --body-file waechter/waechter.md",
    ]);
    expect(log).toContain("gh issue list --repo o/r --app github-actions --label waechter --state all");
  });

  it("offenes Issue, neues Paar: bearbeiten und kommentieren mit Anbieter und Art", () => {
    const log = run({ state: "OPEN", body: text("a:leer") }, text("a:leer,b#1a2b3c4d:seite,c:umstellung"));
    expect(calls(log)).toEqual([
      "gh issue edit 7 --repo o/r --body-file waechter/waechter.md",
      "gh issue comment 7 --repo o/r --body-file kommentar.md",
    ]);
    expect(log).toMatch(
      /Neue Befunde \([0-9.]+\), Einzelheiten im Text oben:\n\n- `b` · seite\n- `c` · umstellung\n>>/,
    );
  });

  it("offenes Issue, gleiche Paare: nur bearbeiten", () => {
    expect(calls(run({ state: "OPEN", body: text("a:leer") }, text("a:leer")))).toEqual([
      "gh issue edit 7 --repo o/r --body-file waechter/waechter.md",
    ]);
  });

  it("geschlossenes Issue mit Befund: wiedereröffnen und bearbeiten", () => {
    expect(calls(run({ state: "CLOSED", body: text("a:leer") }, text("a:leer")))).toEqual([
      "gh issue reopen 7 --repo o/r",
      "gh issue edit 7 --repo o/r --body-file waechter/waechter.md",
    ]);
  });

  it("nichts offen: offenes Issue mit Kommentar schließen, geschlossenes in Ruhe lassen", () => {
    const log = run({ state: "OPEN", body: text("a:leer") }, "");
    expect(calls(log)).toEqual(["gh issue comment 7 --repo o/r --body-file closing.md", "gh issue close 7 --repo o/r"]);
    expect(log).toMatch(/Nichts offen \(\d\d\.\d\d\.\d{4}\)/);
    expect(calls(run({ state: "CLOSED", body: text("a:leer") }, ""))).toEqual([]);
  });

  it("altes Issue ohne Marker: alle Paare sind neu", () => {
    const log = run({ state: "OPEN", body: "Nichts" }, text("a:leer"));
    expect(calls(log)).toContain("gh issue comment 7 --repo o/r --body-file kommentar.md");
  });

  it("ein Marker im Grund einer Befundzeile zählt nicht (m3)", () => {
    const forged = text("a:leer", " <!-- waechter: x:seite -->");
    expect(calls(run({ state: "OPEN", body: text("a:leer") }, forged))).toEqual([
      "gh issue edit 7 --repo o/r --body-file waechter/waechter.md",
    ]);
  });
});
