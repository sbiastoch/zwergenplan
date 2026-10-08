import { describe, expect, it } from "vitest";
import { decideScope, type ScopeEvent, type ScopeIo } from "./ci-scope.ts";

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
