import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { E2E_MAP } from "./e2e-map.ts";
import { type E2eMap, localSpecs, type Selection, selectSpecs } from "./e2e-select.ts";
import { buildGraph } from "./import-graph.ts";
import { listFiles, readGraph } from "./import-graph-io.ts";

/** Auswahl der E2E-Specs aus dem Diff (Plan 0029, B4, B7). */

const imp = (...targets: string[]) => targets.map((t) => `import "${t}";`).join("\n");

// Kleiner Fake-Graph: Pfade wie im Repo, Importe relativ zur Datei.
const GRAPH = buildGraph([
  ["src/main.tsx", imp("./ui/App.tsx")],
  ["src/ui/App.tsx", `const m = () => import("./karte/MapScreen.tsx");\n${imp("./DetailDialog.tsx", "./Chrome.tsx")}`],
  ["src/ui/karte/MapScreen.tsx", imp("../../domain/agenda.ts")],
  ["src/ui/DetailDialog.tsx", imp("../domain/agenda.ts")],
  ["src/ui/Chrome.tsx", ""],
  ["src/ui/Orphan.tsx", ""],
  ["src/domain/agenda.ts", imp("./time.ts")],
  ["src/domain/time.ts", ""],
  ["src/domain/agenda.test.ts", imp("./agenda.ts")],
  ["scripts/build-data.ts", imp("../src/domain/agenda.ts", "./lib/share-pages.ts")],
  ["scripts/lib/share-pages.ts", imp("../../src/domain/agenda.ts")],
  ["scripts/lib/og-card.ts", imp("./share-pages.ts")],
  ["scripts/og-images.ts", imp("./lib/og-card.ts")],
  ["vite.config.ts", imp("./scripts/vite-sw.ts")],
  ["scripts/vite-sw.ts", ""],
  ["e2e/fixtures.ts", ""],
  ["e2e/app.spec.ts", imp("./fixtures.ts")],
  ["e2e/karte.spec.ts", imp("./fixtures.ts")],
  ["e2e/detail.spec.ts", imp("./fixtures.ts")],
  ["e2e/teilen.spec.ts", imp("./fixtures.ts")],
  ["e2e/pwa.spec.ts", imp("./fixtures.ts")],
  ["e2e/theme.spec.ts", imp("./fixtures.ts")],
  ["e2e/smoke.spec.ts", imp("./fixtures.ts")],
  ["e2e/font-swap.smoke.spec.ts", imp("./fixtures.ts")],
]);

const MAP: E2eMap = {
  covers: {
    "e2e/app.spec.ts": [/^src\/ui\/App\.tsx$/, /^src\/main\.tsx$/],
    "e2e/karte.spec.ts": [/^src\/ui\/karte\//],
    "e2e/detail.spec.ts": [/^src\/ui\/DetailDialog\.tsx$/, /^scripts\/build-data\.ts$/],
    "e2e/teilen.spec.ts": [/^scripts\/lib\/(share-pages|og-card)\.ts$/, /^scripts\/og-images\.ts$/],
    "e2e/pwa.spec.ts": [/^src\/sw\//, /^scripts\/vite-sw\.ts$/],
    "e2e/theme.spec.ts": [/^src\/ui\/Chrome\.tsx$/],
    "e2e/smoke.spec.ts": [
      /^data\//,
      /^scripts\/build-data\.ts$/,
      /^scripts\/(lib\/(share-pages|og-card)|og-images)\.ts$/,
    ],
    "e2e/font-swap.smoke.spec.ts": [/^data\//],
  },
  full: [/^tests\/fixtures\//, /^vite\.config\.ts$/, /^scripts\/build-data\.ts$/],
  noE2e: [/\.test\.tsx?$/, /^data\//, /^push-worker\//],
  smoke: ["e2e/smoke.spec.ts", "e2e/font-swap.smoke.spec.ts"],
};
const SPECS = Object.keys(MAP.covers);
const DEVICE = SPECS.filter((s) => !MAP.smoke.includes(s));

const select = (...changed: string[]) => selectSpecs(changed, GRAPH, MAP, SPECS);
const device = (s: Selection) => (s.kind === "none" ? [] : s.device);
const smoke = (s: Selection) => (s.kind === "none" ? [] : s.smoke);

describe("selectSpecs mit einem Fake-Graphen (B4, B7)", () => {
  it("Ansichtsmodul → seine Spec plus app.spec", () => {
    const s = select("src/ui/karte/MapScreen.tsx");
    expect(s.kind).toBe("specs");
    expect(device(s)).toEqual(["e2e/app.spec.ts", "e2e/karte.spec.ts"]);
    expect(smoke(s)).toEqual([]);
  });

  it("e2e/fixtures.ts → alle Specs, die es importieren", () => {
    const s = select("e2e/fixtures.ts");
    expect(s.kind).toBe("specs");
    expect(device(s)).toEqual([...DEVICE].sort());
    expect(smoke(s)).toEqual([...MAP.smoke].sort());
  });

  it("nur Unit-Test, nur Doku, nur Push-Worker → none", () => {
    expect(select("src/domain/agenda.test.ts").kind).toBe("none");
    expect(select("docs/plans/0001-x.md", "CLAUDE.md").kind).toBe("none");
    expect(select("push-worker/src/x.ts").kind).toBe("none");
  });

  it("tests/fixtures/ → full, der Grund nennt den Pfad", () => {
    const s = select("tests/fixtures/x.json");
    expect(s).toMatchObject({ kind: "full" });
    if (s.kind === "full") expect(s.reason).toContain("tests/fixtures/x.json");
  });

  it("unbekannte Datei oder neues Modul, das niemand importiert → full mit Grund (fail-safe)", () => {
    for (const path of ["foo.unknown", "src/ui/Orphan.tsx"]) {
      const s = select("src/ui/karte/MapScreen.tsx", path);
      expect(s.kind).toBe("full");
      if (s.kind === "full") {
        expect(s.reason).toContain(path);
        // auch bei full ist die Auswahl berechnet (Review M2)
        expect(s.device).toContain("e2e/karte.spec.ts");
      }
    }
  });

  it("data/offers.json → nur Smoke, keine Geräte-Specs", () => {
    const s = select("data/offers.json");
    expect(s.kind).toBe("specs");
    expect(device(s)).toEqual([]);
    expect(smoke(s)).toEqual(["e2e/font-swap.smoke.spec.ts", "e2e/smoke.spec.ts"]);
  });

  it("scripts/lib/og-card.ts → teilen plus Smoke", () => {
    const s = select("scripts/lib/og-card.ts");
    expect(s.kind).toBe("specs");
    expect(device(s)).toEqual(["e2e/teilen.spec.ts"]);
    expect(smoke(s)).toEqual(["e2e/smoke.spec.ts"]);
  });

  it("scripts/lib/share-pages.ts erreicht build-data.ts, wählt aber über die Zuordnung, nicht full (Review 2, M1)", () => {
    const s = select("scripts/lib/share-pages.ts");
    expect(s.kind).toBe("specs");
    expect(device(s)).toContain("e2e/teilen.spec.ts");
    expect(device(s)).toContain("e2e/detail.spec.ts");
    expect(smoke(s)).toEqual(["e2e/smoke.spec.ts"]);
  });

  it("scripts/vite-sw.ts erreicht vite.config.ts, wählt aber pwa.spec, nicht full (Review 2, M1)", () => {
    const s = select("scripts/vite-sw.ts");
    expect(s.kind).toBe("specs");
    expect(device(s)).toContain("e2e/pwa.spec.ts");
  });

  it("FULL gilt für direkt geänderte Pfade; die Auswahl ist trotzdem berechnet", () => {
    const vite = select("vite.config.ts");
    expect(vite.kind).toBe("full");
    const build = select("scripts/build-data.ts");
    expect(build).toMatchObject({ kind: "full", device: ["e2e/detail.spec.ts"], smoke: ["e2e/smoke.spec.ts"] });
  });

  it("geänderte Spec → nur diese", () => {
    const s = select("e2e/karte.spec.ts");
    expect(s).toMatchObject({ kind: "specs", device: ["e2e/karte.spec.ts"], smoke: [] });
  });

  it("src/domain/agenda.ts → nicht full, die Specs der Hülle", () => {
    const s = select("src/domain/agenda.ts");
    expect(s.kind).toBe("specs");
    expect(device(s)).toEqual(
      ["e2e/app.spec.ts", "e2e/detail.spec.ts", "e2e/karte.spec.ts", "e2e/teilen.spec.ts"].sort(),
    );
    expect(smoke(s)).toEqual(["e2e/smoke.spec.ts"]);
  });

  it("nennt je Spec einen Grund", () => {
    const s = select("src/ui/karte/MapScreen.tsx");
    if (s.kind !== "specs") throw new Error(s.kind);
    expect(s.why["e2e/karte.spec.ts"]).toContain("src/ui/karte/MapScreen.tsx");
    expect(s.why["e2e/app.spec.ts"]).toContain("src/ui/App.tsx");
  });
});

describe("localSpecs: lokale Obergrenze (B5, Review 2, M1)", () => {
  const many = Array.from({ length: 10 }, (_, i) => `e2e/s${i}.spec.ts`);
  const map: E2eMap = {
    ...MAP,
    covers: {
      ...Object.fromEntries(many.map((s) => [s, [/^src\/ui\/Other\.tsx$/]])),
      "e2e/s3.spec.ts": [/^src\/x\.ts$/],
    },
  };

  it("bis 8 Geräte-Specs laufen alle", () => {
    const s: Selection = { kind: "specs", device: many.slice(0, 8), smoke: [], why: {} };
    expect(localSpecs(s, ["src/x.ts"], map)).toEqual({ run: many.slice(0, 8), rest: [] });
  });

  it("über 8: nur Specs, deren Muster einen geänderten Pfad selbst treffen, plus app und theme", () => {
    const s: Selection = { kind: "specs", device: many, smoke: [], why: {} };
    const r = localSpecs(s, ["src/x.ts"], map);
    expect(r.run).toEqual(["e2e/app.spec.ts", "e2e/theme.spec.ts", "e2e/s3.spec.ts"]);
    expect(r.rest).toHaveLength(9);
  });

  it("geänderte Spec zählt als direkt getroffen", () => {
    const s: Selection = { kind: "specs", device: many, smoke: [], why: {} };
    expect(localSpecs(s, ["e2e/s7.spec.ts"], map).run).toContain("e2e/s7.spec.ts");
  });

  it("full: Auswahl plus app und theme, höchstens 8", () => {
    const s: Selection = { kind: "full", reason: "x", device: ["e2e/karte.spec.ts"], smoke: [], why: {} };
    expect(localSpecs(s, [], map).run).toEqual(["e2e/app.spec.ts", "e2e/theme.spec.ts", "e2e/karte.spec.ts"]);
    const big: Selection = { kind: "full", reason: "x", device: many, smoke: [], why: {} };
    expect(localSpecs(big, many, map).run).toHaveLength(8);
  });

  it("none: nichts", () => {
    expect(localSpecs({ kind: "none", why: {} }, [], map)).toEqual({ run: [], rest: [] });
  });
});

describe("selectSpecs mit dem echten Graphen des Repos (Review 2, M1)", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const files = listFiles(root);
  const graph = readGraph(root, files);
  const specs = files.filter((f) => /^e2e\/[^/]+\.spec\.ts$/.test(f));
  const real = (...changed: string[]) => selectSpecs(changed, graph, E2E_MAP, specs);

  it.each(["src/domain/agenda.ts", "src/domain/time.ts"])("%s: nicht full, lokal höchstens 8 Specs", (path) => {
    const s = real(path);
    expect(s.kind).toBe("specs");
    expect(localSpecs(s, [path], E2E_MAP).run.length).toBeLessThanOrEqual(8);
  });

  it("src/ui/karte/-Module wählen karte.spec, nicht full", () => {
    for (const path of files.filter((f) => f.startsWith("src/ui/karte/") && !f.endsWith(".test.ts"))) {
      const s = real(path);
      expect(s.kind, path).toBe("specs");
      expect(device(s), path).toContain("e2e/karte.spec.ts");
    }
  });

  it("jedes Modul unter src/ erreicht eine Spec oder ist ausdrücklich ohne E2E (kein stilles full)", () => {
    const full = files
      .filter((f) => /^src\/[^\0]+\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => real(f).kind === "full");
    // nur Pfade aus FULL selbst dürfen hier stehen
    expect(full.filter((f) => !E2E_MAP.full.some((re) => re.test(f)))).toEqual([]);
  });
});
