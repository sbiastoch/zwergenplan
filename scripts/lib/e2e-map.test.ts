import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { E2E_MAP, FULL, NO_E2E, SMOKE_SPECS, SPEC_COVERS, TEST_ONLY, UNCOVERED_UI } from "./e2e-map.ts";
import { selectSpecs } from "./e2e-select.ts";
import { listFiles, readGraph } from "./import-graph-io.ts";

/**
 * Wächter der E2E-Zuordnung (Plan 0029, B6): Eine neue Spec ohne Eintrag, ein umbenanntes Modul oder ein neues
 * Ansichtsmodul ohne Spec wird rot. git nur lesend über import-graph-io.ts (withoutGitEnv).
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
// Mit neuen, nicht ignorierten Dateien (Arch-Review m4): Wächter 2 und 3 sehen so lokal denselben Stand wie
// --affected und wie die CI nach dem Commit. Nur getrackte Dateien machten ein neues Modul samt Muster bis zum
// `git add` rot (Stop-Gate prüft den Arbeitsbaum) und übersähen ein neues Modul ohne Spec bis dahin. In der CI ist
// der Checkout sauber, beides ist dort gleich.
const files = listFiles(ROOT, { untracked: true });
const isTest = (p: string) => /\.test\.tsx?$/.test(p) || /^e2e\/[^/]+\.spec\.ts$/.test(p);

describe("e2e-map: Wächter (B6)", () => {
  it("1: jede Spec in e2e/ hat einen Eintrag, jeder Eintrag ist eine Spec", () => {
    const specs = readdirSync(`${ROOT}/e2e`)
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => `e2e/${f}`)
      .sort();
    expect(Object.keys(SPEC_COVERS).sort()).toEqual(specs);
  });

  it("2: jedes Muster in SPEC_COVERS, FULL und NO_E2E trifft eine getrackte Datei", () => {
    const patterns = [
      ...Object.entries(SPEC_COVERS).flatMap(([spec, list]) => list.map((re) => [spec, re] as const)),
      ...FULL.map((re) => ["FULL", re] as const),
      ...NO_E2E.map((re) => ["NO_E2E", re] as const),
    ];
    const dead = patterns.filter(([, re]) => !files.some((f) => re.test(f))).map(([where, re]) => `${where}: ${re}`);
    expect(dead).toEqual([]);
  });

  it("3: jedes Modul unter src/ui/ und src/sw/ steht bei einer Spec außer app.spec (Review 2, m5)", () => {
    const modules = files.filter((f) => /^src\/(ui|sw)\/[^\0]+\.(ts|tsx)$/.test(f) && !isTest(f));
    const others = Object.entries(SPEC_COVERS)
      .filter(([spec]) => spec !== "e2e/app.spec.ts")
      .flatMap(([, list]) => list);
    const uncovered = modules.filter((m) => !others.some((re) => re.test(m)) && !(m in UNCOVERED_UI));
    expect(uncovered).toEqual([]);
    // keine veraltete Ausnahme
    for (const m of Object.keys(UNCOVERED_UI)) expect(files, m).toContain(m);
  });

  it("3: Module aus TEST_ONLY importieren nur Tests", () => {
    const graph = readGraph(ROOT, files);
    for (const module of TEST_ONLY) {
      expect(files, module).toContain(module);
      const importers = [...graph].filter(([, targets]) => targets.includes(module)).map(([from]) => from);
      expect(importers.length, module).toBeGreaterThan(0);
      expect(
        importers.filter((p) => !isTest(p)),
        module,
      ).toEqual([]);
    }
  });

  it("5: jedes Modul, das ein Build-Einstieg erreicht, wählt Specs oder full, nie still nichts (Haupt-Session)", () => {
    // `pnpm build` = build-data.ts, vite build (vite.config.ts mit index.html → src/main.tsx und dem Service Worker
    // aus scripts/vite-sw.ts: src/sw/sw.ts, im Notausgang src/sw/kill.ts), og-images.ts. Ein Modul, das nur einer
    // davon importiert, fiele sonst unter NO_E2E (`^scripts/`) und wählte keine Spec.
    const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["build"], "Build-Einstiege hier nachziehen").toBe(
      "pnpm data:build && vite build && node scripts/og-images.ts",
    );
    expect(pkg.scripts["data:build"]).toBe("node scripts/build-data.ts");
    const entries = [
      "scripts/build-data.ts",
      "vite.config.ts",
      "scripts/og-images.ts",
      "site.config.ts",
      "src/main.tsx",
      "src/sw/sw.ts",
      "src/sw/kill.ts",
    ];
    const graph = readGraph(ROOT, files);
    const reached = new Set<string>();
    const queue = [...entries];
    for (let path = queue.pop(); path !== undefined; path = queue.pop()) {
      if (reached.has(path)) continue;
      reached.add(path);
      queue.push(...(graph.get(path) ?? []));
    }
    const specs = Object.keys(SPEC_COVERS);
    const silent = [...reached]
      .filter((m) => files.includes(m))
      .filter((m) => selectSpecs([m], graph, E2E_MAP, specs).kind === "none")
      .sort();
    expect(silent).toEqual([]);
    expect(reached.size).toBeGreaterThan(100);
  });

  it("4: die Smoke-Specs passen zum testMatch des Smoke-Projekts, keine andere Spec", () => {
    const config = readFileSync(`${ROOT}/playwright.config.ts`, "utf8");
    const block = config.slice(config.indexOf("const smokeProject"));
    const match = /testMatch:\s*\/(.+?)\/,/.exec(block);
    expect(match, "testMatch des Smoke-Projekts").not.toBeNull();
    const testMatch = new RegExp(match?.[1] ?? "^$");
    const specs = Object.keys(SPEC_COVERS);
    expect(specs.filter((s) => testMatch.test(s)).sort()).toEqual([...SMOKE_SPECS].sort());
  });
});
