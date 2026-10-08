import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // push-worker/: Cloudflare Worker der Push-Abos (Plan 0011, E11; Plan 0017)
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "push-worker/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Absichtlich NICHT Europe/Berlin: Domänencode darf nie von der Geräte-Zeitzone abhängen.
    env: { TZ: "America/Los_Angeles" },
    coverage: {
      provider: "v8",
      // scripts/transit: reine Build-Logik der Wegzeit (Plan 0009, E10)
      // src/sw/routes.ts: reine Regeln des Service Workers (Plan 0011, E4); sw.ts verdrahtet nur Events (E2E)
      include: [
        "src/domain/**/*.ts",
        "scripts/pipeline/lib/**/*.ts",
        "scripts/transit/**/*.ts",
        // Zeitplan der Wochen-Nachricht (Plan 0017, E1)
        "scripts/lib/push-schedule.ts",
        "scripts/lib/push-weekly-core.ts",
        // Vorprüfung der Installation in check:fast (Plan 0027, E6)
        "scripts/lib/install-state.ts",
        // Stufe des Diffs und Doku-Gate (Plan 0027, E1, E11)
        "scripts/lib/change-class.ts",
        "scripts/lib/doc-check.ts",
        // Entscheidung des Stop-Gates über Stempel (Plan 0027, E5)
        "scripts/lib/stop-decision.ts",
        // Doku-Pfad der CI (Plan 0027, E10)
        "scripts/lib/ci-scope.ts",
        // E2E nach Diff: Importgraph, Auswahl, Entscheidung von gates (Plan 0029, B2–B5)
        "scripts/lib/import-graph.ts",
        "scripts/lib/e2e-select.ts",
        "scripts/lib/ci-gates.ts",
        "src/sw/routes.ts",
        "src/sw/retire.ts",
        // Push im Service Worker (Plan 0017, E10)
        "src/sw/push-decision.ts",
        "src/sw/push-tailor.ts",
        "src/sw/resubscribe.ts",
        // Push-Worker: Routen und Prüfung (Arch-Review N12)
        "push-worker/src/**/*.ts",
      ],
      // push-worker/src/index.ts verdrahtet nur die Workers-Laufzeit (curl-Prüfung nach dem Deploy)
      exclude: ["**/*.test.ts", "src/domain/test-fixtures.ts", "push-worker/src/index.ts"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
