import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildGraph, importsOf, reverseClosure } from "./import-graph.ts";

/** Importgraph der E2E-Auswahl (Plan 0029, B2, B7). */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

describe("importsOf: Import-Formen (B2)", () => {
  it("statisch, Seiteneffekt, Re-Export, dynamisch und import type", () => {
    const source = [
      'import { a } from "./a.ts";',
      'import "./side.css";',
      'export { b } from "./b.ts";',
      'export * from "./star.ts";',
      'import type { T } from "./types.ts";',
      'export type { U } from "./u-types.ts";',
      'import D, { e } from "./d.ts";',
      'const lazy = () => import("./lazy.tsx");',
      "const viaSingle = import('./single.ts');",
    ].join("\n");
    expect(importsOf("src/ui/x.ts", source).sort()).toEqual(
      [
        "src/ui/a.ts",
        "src/ui/side.css",
        "src/ui/b.ts",
        "src/ui/star.ts",
        "src/ui/types.ts",
        "src/ui/u-types.ts",
        "src/ui/d.ts",
        "src/ui/lazy.tsx",
        "src/ui/single.ts",
      ].sort(),
    );
  });

  it("mehrzeilig: Import-Liste und import() über mehrere Zeilen", () => {
    const source = [
      "import {",
      "  alpha,",
      "  type Beta,",
      '} from "../domain/alpha.ts";',
      "const [m] = await Promise.all([",
      "  import(",
      '    "./app-extras/AppSection.tsx"',
      "  ),",
      "]);",
    ].join("\n");
    expect(importsOf("src/ui/AppExtras.tsx", source).sort()).toEqual([
      "src/domain/alpha.ts",
      "src/ui/app-extras/AppSection.tsx",
    ]);
  });

  it("Kommentare und Zeichenketten mit „import“ darin treffen nicht", () => {
    const source = [
      "/**",
      ' * Beispiel: import { x } from "./kommentar-block.ts";',
      ' * und import("./kommentar-dynamisch.ts")',
      " */",
      '// import "./kommentar-zeile.ts";',
      "const text = 'import { y } from \"./in-string.ts\"';",
      'const tpl = `import("./in-template.ts")`;',
      'const url = "https://example.org/x"; // import "./nach-url.ts"',
      'import { echt } from "./echt.ts";',
    ].join("\n");
    expect(importsOf("src/a.ts", source)).toEqual(["src/echt.ts"]);
  });

  it("ein Regex-Literal mit Anführungszeichen verschluckt keinen späteren Import", () => {
    const source = [
      'import { a } from "./a.ts";',
      "const quote = /[\"']/g;",
      "const div = 4 / 2;",
      'const later = () => import("./later.ts");',
    ].join("\n");
    expect(importsOf("src/a.ts", source).sort()).toEqual(["src/a.ts", "src/later.ts"]);
  });

  it("Querystring und Fragment werden abgeschnitten, Paket-Spezifizierer ignoriert", () => {
    const source = [
      'import worker from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";',
      'import { useState } from "react";',
      'import { readFileSync } from "node:fs";',
      'import raw from "./data.txt?raw";',
      'import "./styles.css#x";',
    ].join("\n");
    expect(importsOf("src/main.tsx", source).sort()).toEqual(["src/data.txt", "src/styles.css"]);
  });

  it("../ wird aufgelöst, außerhalb des Repos fällt weg", () => {
    const source = [
      'import { BASE } from "../../site.config.ts";',
      'import { t } from "../domain/time.ts";',
      'import { z } from "../../../outside.ts";',
    ].join("\n");
    expect(importsOf("src/ui/x.ts", source).sort()).toEqual(["site.config.ts", "src/domain/time.ts"]);
  });

  it("CSS: @import relativer Dateien, nicht von Paketen", () => {
    const source = [
      '@import "tailwindcss";',
      '@import "./styles/tokens.css";',
      "@import url('./styles/base.css');",
    ].join("\n");
    expect(importsOf("src/ui/styles.css", source).sort()).toEqual([
      "src/ui/styles/base.css",
      "src/ui/styles/tokens.css",
    ]);
  });

  it("Konfigurationsdateien im Wurzelverzeichnis (depcruise cruist sie nicht, Review m2)", () => {
    const read = (p: string) => readFileSync(`${ROOT}/${p}`, "utf8");
    expect(importsOf("vite.config.ts", read("vite.config.ts")).sort()).toEqual([
      "scripts/vite-sw.ts",
      "site.config.ts",
    ]);
    expect(importsOf("playwright.config.ts", read("playwright.config.ts")).sort()).toEqual([
      "playwright.devices.ts",
      "site.config.ts",
    ]);
    expect(importsOf("vitest.config.ts", read("vitest.config.ts"))).toEqual([]);
  });
});

describe("reverseClosure (B2)", () => {
  const graph = buildGraph([
    ["src/main.tsx", 'import "./ui/App.tsx";'],
    ["src/ui/App.tsx", 'import { L } from "./ListView.tsx";\nimport { d } from "../domain/agenda.ts";'],
    ["src/ui/ListView.tsx", 'import { d } from "../domain/agenda.ts";'],
    ["src/domain/agenda.ts", 'import { t } from "./time.ts";'],
    ["src/domain/time.ts", ""],
    ["e2e/app.spec.ts", 'import { test } from "./fixtures.ts";'],
    ["e2e/fixtures.ts", ""],
    // Zyklus
    ["src/a.ts", 'import "./b.ts";'],
    ["src/b.ts", 'import "./a.ts";'],
  ]);

  it("liefert die geänderte Datei und alle, die sie transitiv importieren", () => {
    expect([...reverseClosure(graph, ["src/domain/time.ts"])].sort()).toEqual([
      "src/domain/agenda.ts",
      "src/domain/time.ts",
      "src/main.tsx",
      "src/ui/App.tsx",
      "src/ui/ListView.tsx",
    ]);
  });

  it("nimmt auch Pfade auf, die der Graph nicht kennt (gelöscht, neu)", () => {
    expect([...reverseClosure(graph, ["gibt/es/nicht.ts"])]).toEqual(["gibt/es/nicht.ts"]);
  });

  it("ein Zyklus terminiert", () => {
    expect([...reverseClosure(graph, ["src/a.ts"])].sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
