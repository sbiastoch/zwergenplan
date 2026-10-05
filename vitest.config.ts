import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Absichtlich NICHT Europe/Berlin: Domänencode darf nie von der Geräte-Zeitzone abhängen.
    env: { TZ: "America/Los_Angeles" },
    coverage: {
      provider: "v8",
      // scripts/transit: reine Build-Logik der Wegzeit (Plan 0009, E10)
      include: ["src/domain/**/*.ts", "scripts/pipeline/lib/**/*.ts", "scripts/transit/**/*.ts"],
      exclude: ["**/*.test.ts", "src/domain/test-fixtures.ts"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
