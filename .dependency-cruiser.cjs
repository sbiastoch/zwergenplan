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
      name: "maplibre-only-in-map",
      severity: "error",
      comment:
        "MapLibre (ca. 420 kB gzip) gehört nur in den lazy geladenen Karten-Chunk src/ui/map/ (Plan 0005, E3; ADR 0008).",
      from: { pathNot: "^src/ui/map/" },
      // zweites Muster: falls die Auflösung je scheitert, steht im Graphen nur der Paketname
      to: { path: ["(^|/)node_modules/maplibre-gl/", "^maplibre-gl($|/)"] },
    },
    {
      name: "map-only-lazy",
      severity: "error",
      comment:
        "src/ui/map/ erreicht man von außen nur per import(), auch Typen nicht statisch: sonst landet die Karte im Startbundle. Props-Typen: src/ui/map-types.ts (Plan 0005, E3).",
      from: { path: "^src/", pathNot: "^src/ui/map/" },
      to: { path: "^src/ui/map/", dependencyTypesNot: ["dynamic-import"] },
    },
    {
      name: "karte-ui-only-lazy",
      severity: "error",
      comment:
        "Die Karten-Oberfläche src/ui/karte/ (Orts-Liste, Orts-Sheet, Zustände) ist ein eigener Lazy-Chunk: von außen nur per import(), auch Typen nicht statisch – sonst wächst das Startbundle. Props-Typen: src/ui/map-types.ts (Plan 0005, E3).",
      from: { path: "^src/", pathNot: "^src/ui/karte/" },
      to: { path: "^src/ui/karte/", dependencyTypesNot: ["dynamic-import"] },
    },
    {
      name: "karte-ui-entry-only",
      severity: "error",
      comment:
        "Nur der Lader src/ui/MapPanel.tsx greift auf src/ui/karte/ zu (Plan 0005). Grund: dependency-cruiser fasst statischen und dynamischen Import desselben Moduls zu einer Kante zusammen; den Lader selbst prüft scripts/check-architecture.ts.",
      from: { path: "^src/", pathNot: ["^src/ui/karte/", "^src/ui/MapPanel\\.tsx$"] },
      to: { path: "^src/ui/karte/" },
    },
    {
      name: "map-entry-only",
      severity: "error",
      comment:
        "Nur der Lader src/ui/karte/MapScreen.tsx greift auf src/ui/map/ zu (Plan 0005), aus demselben Grund wie karte-ui-entry-only.",
      from: { path: "^src/", pathNot: ["^src/ui/map/", "^src/ui/karte/MapScreen\\.tsx$"] },
      to: { path: "^src/ui/map/" },
    },
    {
      name: "transit-only-lazy",
      severity: "error",
      comment:
        "Die Rechenlogik der Wegzeit src/domain/transit.ts ist ein Lazy-Chunk (assets/oepnv/, Plan 0009, E10: statisch lag das Start-JS über der Schwelle). Von src/ aus nur per import(), auch Typen nicht statisch; Typen stehen in src/domain/transit-types.ts. Tests ausgenommen.",
      from: { path: "^src/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/domain/transit\\.ts$", dependencyTypesNot: ["dynamic-import"] },
    },
    {
      name: "transit-entry-only",
      severity: "error",
      comment:
        "Nur der Lader src/ui/use-transit.ts greift auf src/domain/transit.ts zu (Plan 0009, E10), aus demselben Grund wie karte-ui-entry-only. Den Lader selbst prüft scripts/check-architecture.ts. Tests ausgenommen.",
      from: { path: "^src/", pathNot: ["^src/ui/use-transit\\.ts$", "^src/domain/transit\\.ts$", "\\.test\\.ts$"] },
      to: { path: "^src/domain/transit\\.ts$" },
    },
    {
      name: "ics-only-lazy",
      severity: "error",
      comment:
        "Der ICS-Code src/domain/ics.ts ist ein Lazy-Chunk (assets/export/, Plan 0010, E8 A: Export der Merkliste ist eine seltene, ausdrückliche Handlung). Von src/ aus nur per import(), auch Typen nicht statisch; Pfade und Termin-Schlüssel stehen in src/domain/ics-paths.ts. Tests ausgenommen.",
      from: { path: "^src/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/domain/ics\\.ts$", dependencyTypesNot: ["dynamic-import"] },
    },
    {
      name: "ics-entry-only",
      severity: "error",
      comment:
        "Nur der Lader src/ui/SavedView.tsx greift auf src/domain/ics.ts zu (Plan 0010, E8 A), wie transit-entry-only. Den Lader selbst prüft scripts/check-architecture.ts. Tests ausgenommen.",
      from: { path: "^src/", pathNot: ["^src/ui/SavedView\\.tsx$", "^src/domain/ics\\.ts$", "\\.test\\.ts$"] },
      to: { path: "^src/domain/ics\\.ts$" },
    },
    {
      name: "anbieter-ui-only-lazy",
      severity: "error",
      comment:
        "Die Anbieterübersicht src/ui/anbieter/ (Liste und Sheet) ist ein eigener Lazy-Chunk (assets/anbieter/, Plan 0010, E7): von außen nur per import(), auch Typen nicht statisch – sonst wächst das Startbundle. Props-Typen: src/ui/provider-types.ts.",
      from: { path: "^src/", pathNot: "^src/ui/anbieter/" },
      to: { path: "^src/ui/anbieter/", dependencyTypesNot: ["dynamic-import"] },
    },
    {
      name: "anbieter-ui-entry-only",
      severity: "error",
      comment:
        "Nur der Lader src/ui/ProviderPanel.tsx greift auf src/ui/anbieter/ zu (Plan 0010, E7), wie karte-ui-entry-only. Den Lader selbst prüft scripts/check-architecture.ts.",
      from: { path: "^src/", pathNot: ["^src/ui/anbieter/", "^src/ui/ProviderPanel\\.tsx$"] },
      to: { path: "^src/ui/anbieter/" },
    },
    {
      name: "directory-only-lazy",
      severity: "error",
      comment:
        "Die Logik der Anbieterliste src/domain/directory.ts gehört in den Lazy-Chunk assets/anbieter/ (Plan 0010, E7, M5): nur src/ui/anbieter/ und ihr Test importieren sie, auch Typen nicht von außen (die stehen in src/ui/provider-types.ts bzw. src/domain/site-data.ts). Die Statuszeile zählt im Start mit src/domain/provider-count.ts.",
      from: { path: "^src/", pathNot: ["^src/ui/anbieter/", "^src/domain/directory\\.(test\\.)?ts$"] },
      to: { path: "^src/domain/directory\\.ts$" },
    },
    {
      name: "lazy-domain-apart",
      severity: "error",
      comment:
        "Anbieter- und Karten-Chunk teilen kein Domänenmodul, das nur sie nutzen (Plan 0010, E7, M5): Rolldown legte es als eigenen Chunk direkt nach assets/, und es zählte ins Startbudget (Chunk-Wächter). Die Anbieterübersicht nutzt deshalb keine Karten-Module (places.ts, camera.ts). Die Gegenrichtung (Karte → directory.ts) verbietet schon directory-only-lazy.",
      from: { path: "^src/(ui/anbieter/|domain/directory\\.ts$)" },
      to: { path: "^src/domain/(places|camera)\\.ts$" },
    },
    {
      name: "sw-isolated",
      severity: "error",
      comment:
        "Der Service Worker src/sw/ (Plan 0011, E5b; ADR 0013) importiert nur sich selbst, reine Domänenhilfen und ab Stufe 2 src/data/device-store.ts: kein React, keine UI, kein anderer Datenzugriff, kein npm-Paket. Tests ausgenommen.",
      from: { path: "^src/sw/", pathNot: "\\.test\\.ts$" },
      to: { pathNot: ["^src/(sw|domain)/", "^src/data/device-store\\.ts$"] },
    },
    {
      name: "sw-not-imported",
      severity: "error",
      comment:
        "Nichts außer dem Build-Plugin scripts/vite-sw.ts (per Pfad, nicht per Import) erreicht src/sw/ (Plan 0011, E5b): Der Service Worker ist eine eigene IIFE-Datei, kein Teil des App-Bundles.",
      from: { pathNot: ["^scripts/vite-sw\\.ts$", "^src/sw/"] },
      to: { path: "^src/sw/" },
    },
    {
      name: "no-zod-in-sw",
      severity: "error",
      comment:
        "Zod gehört nicht in den Service Worker (Budget 8 kB, Plan 0011, E5b): schema/dataset nur als Typ. Transitiv hält no-zod-in-client-transitive jedes andere Domänenmodul zodfrei; `reachable` scheidet aus, weil es Typ-Importe mitzählt (Kanarienvogel in Plan 0011, „Umsetzung“).",
      from: { path: "^src/sw/", pathNot: "\\.test\\.ts$" },
      to: {
        path: ["^src/domain/(schema|dataset)\\.ts$", "(^|/)node_modules/zod/"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "app-extras-ui-only-lazy",
      severity: "error",
      comment:
        "Die App-Extras-Oberfläche src/ui/app-extras/ (Abschnitt „Als App“, Plan 0011, E5) ist ein Lazy-Chunk in assets/app/: von außen nur per import(), auch Typen nicht statisch – sonst wächst das Startbundle.",
      from: { path: "^src/", pathNot: "^src/ui/app-extras/" },
      to: { path: "^src/ui/app-extras/", dependencyTypesNot: ["dynamic-import"] },
    },
    {
      name: "app-extras-ui-entry-only",
      severity: "error",
      comment:
        "Nur der Lader src/ui/AppExtras.tsx greift auf src/ui/app-extras/ zu (Plan 0011, E5), wie karte-ui-entry-only. Den Lader selbst prüft scripts/check-architecture.ts.",
      from: { path: "^src/", pathNot: ["^src/ui/app-extras/", "^src/ui/AppExtras\\.tsx$"] },
      to: { path: "^src/ui/app-extras/" },
    },
    {
      name: "app-data-only-lazy",
      severity: "error",
      comment:
        "PWA-Kern und (ab Stufe 2) Push und Geräte-Speicher in src/data sind Lazy-Chunks in assets/app/ (Plan 0011, E5): aus src/ui und src/data nur per import(), außer aus der App-Extras-Oberfläche und den Lazy-Modulen selbst. Im Start steht nur src/data/pwa-start.ts. Tests ausgenommen.",
      // auch src/main.tsx (Arch-Review Stufe 1, H9): der Einstieg ist genauso Start-Bundle
      from: {
        path: "^src/(ui|data)/|^src/main\\.tsx$",
        pathNot: ["^src/ui/app-extras/", "^src/data/(pwa|push|push-start|device-store)\\.ts$", "\\.test\\.ts$"],
      },
      to: { path: "^src/data/(pwa|push|push-start|device-store)\\.ts$", dependencyTypesNot: ["dynamic-import"] },
    },
    {
      name: "ui-reads-data-only-via-src-data",
      severity: "error",
      comment: "Datenzugriff nur über src/data.",
      from: { path: "^src/ui/" },
      to: { path: ["^data/", "^tests/fixtures/", "^public/"] },
    },
    {
      name: "data-domain-runtime-allowlist",
      severity: "error",
      comment:
        "src/data importiert aus src/domain zur Laufzeit nur reine Hilfen ohne Zod (ADR 0010): geo (Runden, Stadtgrenze). Typ-Importe sind frei.",
      from: { path: "^src/data/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/domain/", pathNot: "^src/domain/geo\\.ts$", dependencyTypesNot: ["type-only"] },
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
    {
      name: "pipeline-lib-pure",
      severity: "error",
      comment:
        "scripts/pipeline/lib ist reine Logik mit Tests (Plan 0002): kein Netz, keine Dateien, kein git – das liegt in io/ und cli.ts.",
      from: { path: "^scripts/pipeline/lib/", pathNot: "\\.test\\.ts$" },
      to: {
        path: ["^scripts/pipeline/(io/|cli\\.ts)", "^scripts/lib/"],
      },
    },
    {
      name: "pipeline-lib-no-node-io",
      severity: "error",
      comment: "Kein Node-I/O in scripts/pipeline/lib (Tests dürfen Snapshots lesen).",
      from: { path: "^scripts/pipeline/lib/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["core"], path: "^(node:)?(fs|net|http|https|child_process|os|dgram|dns|tls)(/|$)" },
    },
    {
      name: "transit-build-pure",
      severity: "error",
      comment:
        "scripts/transit ist reine Build-Logik der Wegzeit (Plan 0009, E6/E10): kein node:*, kein scripts/lib, kein scripts/pipeline/io, kein npm-Paket – nur src/domain und scripts/transit selbst. Dateien liest build-data.ts, Tests dürfen Fixtures lesen.",
      from: { path: "^scripts/transit/", pathNot: "\\.test\\.ts$" },
      to: { pathNot: "^(src/domain|scripts/transit)/" },
    },
    {
      name: "src-not-scripts",
      severity: "error",
      comment: "Die App und die Domäne hängen nie von Build-/Pipeline-Skripten ab.",
      from: { path: "^src/" },
      to: { path: "^scripts/" },
    },
    {
      name: "no-cheerio-in-src",
      severity: "error",
      comment: "HTML-Parsing gehört in die Pipeline, nicht in die App.",
      from: { path: "^src/" },
      to: { path: "(^|/)node_modules/cheerio/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(dist|public|coverage)/" },
    parser: "swc",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
      // maplibre-gl exportiert nur die Bedingung „import“; ohne exports-Auflösung bliebe es unaufgelöst (Plan 0005).
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "default"],
    },
  },
};
