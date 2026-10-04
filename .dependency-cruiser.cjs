/**
 * Architekturregeln (docs/architecture.md). Parser: swc, weil dependency-cruiser
 * TypeScript 7 nicht als Transpiler unterstützt (Plan 0001, Review B1).
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Zyklen machen Module untrennbar.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-is-pure",
      severity: "error",
      comment: "src/domain ist framework-frei: kein React, keine UI, kein Datenzugriff, kein DOM-Code.",
      from: { path: "^src/domain/" },
      to: { path: ["^src/(ui|data)/", "(^|/)node_modules/(react|react-dom|maplibre-gl|motion)/"] },
    },
    {
      name: "domain-no-node-at-runtime",
      severity: "error",
      comment: "Domänencode läuft auch im Browser – Node-Module nur in Tests/Fixtures.",
      from: { path: "^src/domain/", pathNot: "(\\.test\\.ts|test-fixtures\\.ts)$" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "no-zod-in-client",
      severity: "error",
      comment: "Die UI bekommt geprüfte Daten; Zod (schema/dataset) nur als Typ importieren.",
      from: { path: "^src/(ui|data)/|^src/main\\.tsx$" },
      to: {
        path: ["^src/domain/(schema|dataset|test-fixtures)\\.ts$", "(^|/)node_modules/(zod|yaml)/"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "no-zod-in-client-transitive",
      severity: "error",
      comment:
        "Domänenmodule, die die UI nutzt, dürfen schema/dataset/zod nur als Typ importieren – sonst landet Zod transitiv im Client-Bundle.",
      from: { path: "^src/domain/", pathNot: "^src/domain/(schema|dataset|test-fixtures)\\.ts$|\\.test\\.ts$" },
      to: {
        path: ["^src/domain/(schema|dataset)\\.ts$", "(^|/)node_modules/(zod|yaml)/"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "ui-reads-data-only-via-src-data",
      severity: "error",
      comment: "Datenzugriff nur über src/data.",
      from: { path: "^src/ui/" },
      to: { path: ["^data/", "^tests/fixtures/", "^public/"] },
    },
    {
      name: "scripts-not-ui",
      severity: "error",
      comment: "Pipeline/Skripte nutzen Domänenlogik, nie UI.",
      from: { path: "^scripts/" },
      to: { path: "^src/(ui|data)/" },
    },
    {
      name: "e2e-black-box",
      severity: "error",
      comment: "E2E testet nur über den Browser (Ausnahme: Domain für ICS-Parsing-Hilfen nicht nötig).",
      from: { path: "^e2e/" },
      to: { path: "^src/" },
    },
    {
      name: "no-test-code-in-prod",
      severity: "error",
      comment: "Produktivcode importiert keine Tests/Fixtures.",
      from: { path: "^src/", pathNot: "(\\.test\\.ts|test-fixtures\\.ts)$" },
      to: { path: "(\\.test\\.ts|test-fixtures\\.ts)$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(dist|public|coverage)/" },
    parser: "swc",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"] },
  },
};
