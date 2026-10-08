import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decideE2e, decideScope, type E2eIo, type ScopeEvent, type ScopeIo, scopeOutputs } from "./ci-scope.ts";
import type { Selection } from "./e2e-select.ts";

/**
 * Test 6 aus Plan 0027 (E10): Entscheidung des CI-Jobs `scope`, rein. Git und GitHub-API kommen als Eingaben.
 * `full=false` heißt: nur `check`, ohne E2E, Smoke und Deploy. Im Zweifel immer `full=true`.
 */

const LIVE = "3f57669a0e1b2c3d4e5f60718293a4b5c6d7e8f9";
const HEAD = "a666dbe0123456789abcdef0123456789abcdef0";
const BEFORE = "821018d0123456789abcdef0123456789abcdef0";
const DOCS = ["docs/ideas.md", "CLAUDE.md"];

const mainPush: ScopeEvent = { event: "push", ref: "refs/heads/main", sha: HEAD, before: BEFORE };
const branchPush: ScopeEvent = { event: "push", ref: "refs/heads/harness-0027-e7", sha: HEAD, before: BEFORE };

interface Fake {
  /** Antwort je Pfad-Anfang; eine Funktion darf werfen (Netz, 404, Zeitüberschreitung) */
  api?: Record<string, string | (() => string)>;
  ancestor?: boolean | (() => boolean);
  changed?: string[] | (() => string[]);
}

/** Fake für Git und API; zählt die API-Aufrufe (E13: höchstens zwei je Lauf). */
function fake({ api = {}, ancestor = true, changed = DOCS }: Fake) {
  const calls: string[] = [];
  const gitCalls: string[] = [];
  const io: ScopeIo = {
    async api(path) {
      calls.push(path);
      const key = Object.keys(api).find((k) => path.startsWith(k));
      if (key === undefined) throw new Error(`HTTP 404 für ${path}`);
      const answer = api[key];
      return typeof answer === "function" ? answer() : (answer ?? "");
    },
    isAncestor(from, to) {
      gitCalls.push(`ancestor ${from} ${to}`);
      return typeof ancestor === "function" ? ancestor() : ancestor;
    },
    changedPaths(from, to) {
      gitCalls.push(`diff ${from} ${to}`);
      return typeof changed === "function" ? changed() : changed;
    },
  };
  return { io, calls, gitCalls };
}

const deployments = (...list: unknown[]) => JSON.stringify(list);
const statuses = (...states: string[]) => JSON.stringify(states.map((state, i) => ({ id: 100 + i, state })));
/** Live-Stand wie am 2026-10-08 geprüft: neuestes Deployment zuerst, Statusfolge bis success */
const liveApi = (sha: unknown = LIVE, ...states: string[]) => ({
  "deployments?": deployments({ id: 9, sha }, { id: 8, sha: BEFORE }),
  "deployments/9/statuses": statuses(...(states.length > 0 ? states : ["waiting", "queued", "in_progress", "success"])),
});

describe("main: Vergleich mit dem live ausgelieferten Commit (Deployments-API)", () => {
  it("Live-Commit ist Vorfahre, Diff nur Doku → full=false, mit zwei API-Abfragen", async () => {
    const { io, calls, gitCalls } = fake({ api: liveApi() });
    const scope = await decideScope(mainPush, io);
    expect(scope.full).toBe(false);
    expect(scope.reason).toContain("nur Doku");
    expect(calls).toEqual(["deployments?environment=github-pages&per_page=10", "deployments/9/statuses?per_page=100"]);
    expect(gitCalls).toEqual([`ancestor ${LIVE} ${HEAD}`, `diff ${LIVE} ${HEAD}`]);
  });

  it("Code-Commit, der nie live war (wartender Lauf abgebrochen), liegt im Diff → full=true", async () => {
    const { io } = fake({ api: liveApi(), changed: ["src/domain/format.ts", ...DOCS] });
    const scope = await decideScope(mainPush, io);
    expect(scope).toEqual({ full: true, reason: expect.stringContaining("src/domain/format.ts") });
  });

  it("gleicher Stand wie live (leerer Diff) → full=false", async () => {
    const { io } = fake({ api: liveApi(HEAD), changed: [] });
    expect((await decideScope({ ...mainPush, sha: HEAD }, io)).full).toBe(false);
  });

  it("Live-Commit ist kein Vorfahre → full=true, ohne Diff", async () => {
    const { io, gitCalls } = fake({ api: liveApi(), ancestor: false });
    expect((await decideScope(mainPush, io)).full).toBe(true);
    expect(gitCalls).toEqual([`ancestor ${LIVE} ${HEAD}`]);
  });

  it.each([
    ["Netzfehler", () => fake({ api: { "deployments?": () => throwing("fetch failed") } })],
    ["404", () => fake({ api: {} })],
    [
      "Zeitüberschreitung",
      () => fake({ api: { "deployments?": () => throwing("The operation was aborted due to timeout") } }),
    ],
    ["Statuses nicht abrufbar", () => fake({ api: { "deployments?": deployments({ id: 9, sha: LIVE }) } })],
  ])("Abruf fehlgeschlagen (%s) → full=true", async (_, make) => {
    const { io, gitCalls } = make();
    expect((await decideScope(mainPush, io)).full).toBe(true);
    expect(gitCalls).toEqual([]);
  });

  it.each([
    ["Antwort kein JSON", { "deployments?": "<html>Bad gateway</html>" }],
    ["Antwort kein Array", { "deployments?": '{"message":"Not Found"}' }],
    ["kein Deployment", { "deployments?": "[]" }],
    ["Deployment ohne id", { "deployments?": deployments({ sha: LIVE }) }],
    ["Statuses kein JSON", { ...liveApi(), "deployments/9/statuses": "kaputt" }],
    ["Deployment ohne Status", { ...liveApi(), "deployments/9/statuses": "[]" }],
    ["letzter Status in_progress", liveApi(LIVE, "queued", "in_progress")],
    ["letzter Status failure", liveApi(LIVE, "in_progress", "failure")],
    ["letzter Status inactive (abgelöst)", liveApi(LIVE, "success", "inactive")],
    ["sha fehlt", { ...liveApi(), "deployments?": deployments({ id: 9 }) }],
    ["sha unbekannt", liveApi("unbekannt")],
    ["Kurz-SHA", liveApi("3f57669")],
    ["sha in Großbuchstaben", liveApi(LIVE.toUpperCase())],
    ["sha keine Zeichenkette", liveApi(42)],
  ])("%s → full=true", async (_, api) => {
    const { io, gitCalls } = fake({ api });
    expect((await decideScope(mainPush, io)).full).toBe(true);
    expect(gitCalls).toEqual([]);
  });

  it("maßgeblich ist das neueste Deployment (höchste id), auch wenn die Liste anders sortiert ist", async () => {
    const { io, calls } = fake({
      api: {
        "deployments?": deployments({ id: 8, sha: BEFORE }, { id: 9, sha: LIVE }),
        "deployments/9/statuses": JSON.stringify([
          { id: 103, state: "success" },
          { id: 100, state: "waiting" },
        ]),
      },
    });
    expect((await decideScope(mainPush, io)).full).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("Live-Commit unbekannt im Checkout (git wirft) → full=true", async () => {
    const { io } = fake({ api: liveApi(), ancestor: () => throwing("fatal: Not a valid commit name") });
    expect((await decideScope(mainPush, io)).full).toBe(true);
  });

  it("Diff nicht bestimmbar (git wirft) → full=true", async () => {
    const { io } = fake({ api: liveApi(), changed: () => throwing("fatal: bad object") });
    expect((await decideScope(mainPush, io)).full).toBe(true);
  });
});

describe("andere Branches: grüner Push-Lauf des Vorgängers auf derselben Ref", () => {
  const runs = (...list: unknown[]) => JSON.stringify({ total_count: list.length, workflow_runs: list });
  const green = { head_sha: BEFORE, head_branch: "harness-0027-e7", event: "push", conclusion: "success" };
  const runsPath = `actions/workflows/ci.yml/runs?event=push&branch=harness-0027-e7&head_sha=${BEFORE}`;

  it("Vorgänger grün, Diff nur Doku → full=false, mit einer API-Abfrage", async () => {
    const { io, calls, gitCalls } = fake({ api: { "actions/workflows/ci.yml/runs?": runs(green) } });
    const scope = await decideScope(branchPush, io);
    expect(scope.full).toBe(false);
    expect(calls).toEqual([`${runsPath}&per_page=20`]);
    expect(gitCalls).toEqual([`ancestor ${BEFORE} ${HEAD}`, `diff ${BEFORE} ${HEAD}`]);
  });

  it("Branchname mit Schrägstrich wird in der Abfrage kodiert", async () => {
    const { io, calls } = fake({
      api: { "actions/workflows/ci.yml/runs?": runs({ ...green, head_branch: "feature/a b" }) },
    });
    expect((await decideScope({ ...branchPush, ref: "refs/heads/feature/a b" }, io)).full).toBe(false);
    expect(calls[0]).toContain("branch=feature%2Fa%20b&");
  });

  it.each([
    ["kein Lauf", runs()],
    ["Lauf rot", runs({ ...green, conclusion: "failure" })],
    ["wartender Lauf abgebrochen", runs({ ...green, conclusion: "cancelled" })],
    ["Lauf noch offen", runs({ ...green, conclusion: null })],
    ["grüner Lauf auf anderer Ref", runs({ ...green, head_branch: "main" })],
    ["grüner Lauf aus pull_request", runs({ ...green, event: "pull_request" })],
    ["grüner Lauf eines anderen Commits", runs({ ...green, head_sha: HEAD })],
    ["Antwort kein JSON", "<html>"],
    ["Antwort ohne workflow_runs", '{"total_count":0}'],
  ])("%s → full=true", async (_, answer) => {
    const { io } = fake({ api: { "actions/workflows/ci.yml/runs?": answer } });
    expect((await decideScope(branchPush, io)).full).toBe(true);
  });

  it("ein grüner unter mehreren Läufen genügt (Wiederholung nach Rot)", async () => {
    const { io } = fake({
      api: { "actions/workflows/ci.yml/runs?": runs({ ...green, conclusion: "failure" }, green) },
    });
    expect((await decideScope(branchPush, io)).full).toBe(false);
  });

  it("Abruf der Läufe fehlgeschlagen → full=true", async () => {
    const { io } = fake({ api: {} });
    expect((await decideScope(branchPush, io)).full).toBe(true);
  });

  it("Doku plus src/ → full=true, ohne API-Abfrage", async () => {
    const { io, calls } = fake({ changed: ["docs/ideas.md", "src/ui/Detail.tsx"] });
    expect(await decideScope(branchPush, io)).toEqual({
      full: true,
      reason: expect.stringContaining("src/ui/Detail.tsx"),
    });
    expect(calls).toEqual([]);
  });

  it("Vorgänger kein Vorfahre (Force-Push) → full=true, ohne Diff und ohne API", async () => {
    const { io, calls, gitCalls } = fake({ ancestor: false });
    expect((await decideScope(branchPush, io)).full).toBe(true);
    expect(gitCalls).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it.each([
    ["neuer Branch (before aus Nullen)", "0".repeat(40)],
    ["before fehlt", ""],
    ["before ungültig", "xyz"],
  ])("%s → full=true, ohne Git und API", async (_, before) => {
    const { io, calls, gitCalls } = fake({});
    expect((await decideScope({ ...branchPush, before }, io)).full).toBe(true);
    expect([...calls, ...gitCalls]).toEqual([]);
  });
});

describe("andere Ereignisse und Eingaben", () => {
  it.each([
    ["pull_request", { ...branchPush, event: "pull_request" }],
    ["workflow_dispatch", { ...mainPush, event: "workflow_dispatch" }],
    ["Tag statt Branch", { ...branchPush, ref: "refs/tags/v1" }],
    ["SHA des Laufs ungültig", { ...mainPush, sha: "HEAD" }],
  ])("%s → full=true, ohne Git und API", async (_, event) => {
    const { io, calls, gitCalls } = fake({ api: liveApi() });
    expect((await decideScope(event, io)).full).toBe(true);
    expect([...calls, ...gitCalls]).toEqual([]);
  });

  it("Ausnahme ohne Error-Objekt → full=true mit Grund", async () => {
    const { io } = fake({
      api: {
        "deployments?": () => {
          throw "kaputt";
        },
      },
    });
    expect(await decideScope(mainPush, io)).toEqual({ full: true, reason: expect.stringContaining("kaputt") });
  });
});

function throwing(message: string): never {
  throw new Error(message);
}

/** E2E nach Diff (Plan 0029, B5, B7): Auswahl nur bei Push auf einen Branch außer main, sonst volle Suite. */
describe("decideE2e (Plan 0029, B5)", () => {
  const BASE = "b0b0b0b0123456789abcdef0123456789abcdef0";
  const FULL_E2E = { e2e: "full", specs: [], devices: true, smoke: true };

  function e2eFake(selection: Selection | (() => Selection), mergeBase: () => string = () => BASE) {
    const calls: string[] = [];
    const io: E2eIo = {
      mergeBase(a, b) {
        calls.push(`merge-base ${a} ${b}`);
        return mergeBase();
      },
      changedPaths(from, to) {
        calls.push(`diff ${from} ${to}`);
        return ["src/ui/karte/MapScreen.tsx"];
      },
      select(changed) {
        calls.push(`select ${changed.join(" ")}`);
        return typeof selection === "function" ? selection() : selection;
      },
    };
    return { io, calls };
  }
  const specs = (device: string[], smoke: string[] = []): Selection => ({ kind: "specs", device, smoke, why: {} });

  it("Branch-Push mit Auswahl → e2e=select, specs, devices=true; Diff über den ganzen Branch", () => {
    const { io, calls } = e2eFake(specs(["e2e/app.spec.ts", "e2e/karte.spec.ts"]));
    expect(decideE2e(branchPush, io)).toMatchObject({
      e2e: "select",
      specs: ["e2e/app.spec.ts", "e2e/karte.spec.ts"],
      devices: true,
      smoke: false,
    });
    expect(calls).toEqual([
      `merge-base origin/main ${HEAD}`,
      `diff ${BASE} ${HEAD}`,
      "select src/ui/karte/MapScreen.tsx",
    ]);
  });

  it("Branch-Push nur mit data/ → e2e=select, devices=false, smoke=true", () => {
    const { io } = e2eFake(specs([], ["e2e/smoke.spec.ts"]));
    expect(decideE2e(branchPush, io)).toMatchObject({ e2e: "select", specs: [], devices: false, smoke: true });
  });

  it("keine Spec → e2e=none, devices=false, smoke=false", () => {
    const { io } = e2eFake({ kind: "none", why: {} });
    expect(decideE2e(branchPush, io)).toMatchObject({ e2e: "none", specs: [], devices: false, smoke: false });
  });

  it("Auswahl ergibt full → e2e=full mit Grund", () => {
    const { io } = e2eFake({
      kind: "full",
      reason: "tests/fixtures/x.json (volle Suite)",
      device: [],
      smoke: [],
      why: {},
    });
    expect(decideE2e(branchPush, io)).toMatchObject({ ...FULL_E2E, reason: expect.stringContaining("tests/fixtures") });
  });

  it.each([
    ["main", mainPush],
    ["pull_request", { ...branchPush, event: "pull_request" }],
    ["workflow_dispatch", { ...branchPush, event: "workflow_dispatch" }],
    ["Tag", { ...branchPush, ref: "refs/tags/v1" }],
    ["SHA ungültig", { ...branchPush, sha: "HEAD" }],
  ])("%s → e2e=full, ohne Git", (_, event) => {
    const { io, calls } = e2eFake(specs(["e2e/app.spec.ts"]));
    expect(decideE2e(event, io)).toMatchObject(FULL_E2E);
    expect(calls).toEqual([]);
  });

  it("fehlendes origin/main (merge-base wirft) → e2e=full, nie Rot", () => {
    const { io } = e2eFake(specs(["e2e/app.spec.ts"]), () => throwing("fatal: Not a valid object name origin/main"));
    expect(decideE2e(branchPush, io)).toMatchObject({ ...FULL_E2E, reason: expect.stringContaining("origin/main") });
  });

  it("Ausnahme in der Auswahl, auch ohne Error-Objekt → e2e=full", () => {
    expect(decideE2e(branchPush, e2eFake(() => throwing("Graph kaputt")).io)).toMatchObject(FULL_E2E);
    const raw = e2eFake(() => {
      throw "kaputt";
    });
    expect(decideE2e(branchPush, raw.io)).toMatchObject({ ...FULL_E2E, reason: expect.stringContaining("kaputt") });
  });

  it.each(["e2e/../x.spec.ts", "e2e/$(rm -rf).spec.ts", "e2e/a b.spec.ts", "src/x.spec.ts", "e2e/X.spec.ts"])(
    "Spec-Name außerhalb des Musters (%s) → e2e=full (Review m3)",
    (name) => {
      const { io } = e2eFake(specs(["e2e/app.spec.ts", name]));
      expect(decideE2e(branchPush, io)).toMatchObject(FULL_E2E);
    },
  );
});

describe("scopeOutputs: alle Ausgaben in einem Schreibvorgang (Review 2, m4)", () => {
  it("ein String mit allen fünf Schlüsseln", () => {
    expect(
      scopeOutputs(
        { full: true, reason: "x" },
        { e2e: "select", specs: ["e2e/app.spec.ts", "e2e/karte.spec.ts"], devices: true, smoke: false, reason: "y" },
      ),
    ).toBe("full=true\ne2e=select\nspecs=e2e/app.spec.ts e2e/karte.spec.ts\ndevices=true\nsmoke=false\n");
  });

  it("scripts/ci-scope.ts schreibt genau einmal nach $GITHUB_OUTPUT", () => {
    const cli = readFileSync(fileURLToPath(new URL("../ci-scope.ts", import.meta.url)), "utf8");
    expect(cli.match(/appendFileSync\(/g)).toHaveLength(1);
    expect(cli).toContain("appendFileSync(output, scopeOutputs(");
  });
});

/**
 * Kanarienvogel der Garantie (ADR 0023, Nr. 7): die Bedingungen in ci.yml als Textabgleich. Auf main ist die
 * Spec-Liste leer, der Job e2e läuft auf main immer, deploy verlangt e2e == full (Review 2, M2).
 */
describe("ci.yml: Bedingungen von scope, e2e, smoke, gates und deploy (Plan 0029, B5)", () => {
  const yml = readFileSync(fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)), "utf8");
  const job = (name: string) => {
    const start = yml.indexOf(`\n  ${name}:\n`);
    expect(start, name).toBeGreaterThan(0);
    const rest = yml.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
    return end === -1 ? rest : rest.slice(0, end + 1);
  };
  const SELECT = "github.ref == 'refs/heads/main' || needs.scope.outputs.e2e == 'full'";
  /** Ausdruck von GitHub Actions, `${{ … }}` */
  const gh = (expression: string) => `\${{ ${expression} }}`;

  it("scope: Rückfallwerte für jede Ausgabe (Review B2)", () => {
    const scope = job("scope");
    expect(scope).toContain(`full: ${gh("steps.scope.outputs.full || 'true'")}`);
    expect(scope).toContain(`e2e: ${gh("steps.scope.outputs.e2e || 'full'")}`);
    expect(scope).toContain(`specs: ${gh("steps.scope.outputs.specs || ''")}`);
    expect(scope).toContain(`devices: ${gh("steps.scope.outputs.devices || 'true'")}`);
    expect(scope).toContain(`smoke: ${gh("steps.scope.outputs.smoke || 'true'")}`);
  });

  it("e2e: auf main immer, auf Branches nur mit Geräte-Specs; SPECS über env, auf main leer", () => {
    const e2e = job("e2e");
    expect(e2e).toContain(
      `if: needs.scope.outputs.full == 'true' && (${SELECT} || needs.scope.outputs.devices == 'true')`,
    );
    expect(e2e).toContain(
      `SPECS: ${gh("needs.scope.outputs.e2e == 'select' && github.ref != 'refs/heads/main' && needs.scope.outputs.specs || ''")}`,
    );
    expect(e2e).toMatch(/run: pnpm exec playwright test \$SPECS --shard=[^\n]*--pass-with-no-tests/);
    // kein Ausdruck mit der Spec-Liste direkt in run (Review m3)
    expect(e2e).not.toMatch(/run:[^\n]*outputs\.specs/);
  });

  it("smoke: Smoke-Schritt nur bei Bedarf, Schrift-Swap mit always() unter derselben Bedingung (Review 2, m1)", () => {
    const smoke = job("smoke");
    expect(smoke).toContain("if: needs.scope.outputs.full == 'true'\n");
    const when = `${SELECT} || needs.scope.outputs.smoke == 'true'`;
    expect(smoke).toContain(`- name: Smoke mit echten Daten\n        if: ${when}\n`);
    expect(smoke).toContain(`if: always() && (${when})`);
  });

  it("gates: Entscheidung über scripts/ci-gates.ts mit allen Eingaben", () => {
    const gates = job("gates");
    expect(gates).toContain("run: node scripts/ci-gates.ts");
    for (const key of ["REF", "FULL", "E2E_MODE", "DEVICES", "SMOKE_MODE", "R_SCOPE", "R_CHECK", "R_E2E", "R_SMOKE"]) {
      expect(gates).toContain(`${key}: `);
    }
  });

  it("deploy: nur auf main, voll geprüft und mit e2e == full", () => {
    expect(job("deploy")).toContain(
      "if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && needs.scope.outputs.full == 'true' && needs.scope.outputs.e2e == 'full'",
    );
  });
});
