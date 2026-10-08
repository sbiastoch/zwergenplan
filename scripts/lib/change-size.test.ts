import { describe, expect, it } from "vitest";
import { type ChangeInput, MAX_LINES, smallChange } from "./change-size.ts";

const base: ChangeInput = { numstat: [], newFiles: [], addedLines: [] };
const stat = (added: number, deleted: number, path: string) => `${added}\t${deleted}\t${path}`;

describe("smallChange: Kleinänderung nach Plan 0029, A1", () => {
  it("leerer Diff ist klein", () => {
    expect(smallChange(base)).toEqual({ small: true });
  });

  it(`${MAX_LINES} Zeilen sind klein, eine mehr nicht`, () => {
    expect(smallChange({ ...base, numstat: [stat(40, 20, "src/ui/App.tsx")] }).small).toBe(true);
    expect(smallChange({ ...base, numstat: [stat(40, 21, "src/ui/App.tsx")] })).toEqual({
      small: false,
      reason: "61 Zeilen > 60",
    });
  });

  it("hinzugefügte Zeilen in Tests und Doku zählen nicht", () => {
    const r = smallChange({
      ...base,
      numstat: [
        stat(30, 0, "src/domain/age.ts"),
        stat(500, 0, "src/domain/age.test.ts"),
        stat(500, 0, "e2e/saved.spec.ts"),
        stat(500, 0, "docs/plans/0029-x.md"),
      ],
    });
    expect(r.small).toBe(true);
  });

  it("gelöschte Testzeilen zählen (Review M3)", () => {
    expect(smallChange({ ...base, numstat: [stat(0, 61, "src/domain/age.test.ts")] })).toEqual({
      small: false,
      reason: "61 Zeilen > 60",
    });
  });

  it("neue Datei außer Test und Doku ist nicht klein", () => {
    expect(smallChange({ ...base, newFiles: ["src/ui/X.tsx"] })).toEqual({
      small: false,
      reason: "neue Datei src/ui/X.tsx",
    });
    expect(smallChange({ ...base, newFiles: ["src/ui/X.test.ts", "e2e/x.spec.ts", "docs/ideas.md"] }).small).toBe(true);
  });

  it.each(["test.skip(", "it.only(", "describe.fixme(", "// biome-ignore lint/x: y"])(
    "hinzugefügtes %s ist nicht klein",
    (line) => {
      expect(smallChange({ ...base, addedLines: [`  ${line}`] }).small).toBe(false);
    },
  );

  it.each([
    "package.json",
    "pnpm-lock.yaml",
    ".nvmrc",
    "src/domain/schema.ts",
    "src/domain/topics.ts",
    "scripts/pipeline/lib/raw.ts",
    ".dependency-cruiser.cjs",
    "biome.json",
    "knip.json",
    "lefthook.yml",
    ".size-limit.json",
    "vitest.config.ts",
    ".claude/settings.json",
    ".claude/hooks/stop-gate.ts",
    ".github/workflows/ci.yml",
    "scripts/check-fast.ts",
    "scripts/verify.ts",
    "vite.config.ts",
    "playwright.config.ts",
    "playwright.devices.ts",
    "tsconfig.json",
    "src/sw/tsconfig.test.json",
    "e2e/fixtures.ts",
    "e2e/mobile-ux.ts",
    "e2e/global-setup.ts",
    "scripts/lib/change-class.ts",
    "scripts/lib/change-size.ts",
    "scripts/lib/ci-scope.ts",
    "scripts/lib/ci-scope-git.ts",
    "scripts/lib/e2e-select.ts",
    "scripts/change-size.ts",
    "scripts/ci-scope.ts",
    "scripts/e2e-local.ts",
    "scripts/lib/e2e-args.ts",
    "docs/adr/0021-verifikation-nach-risiko.md",
  ])("Sperrliste: %s ist nie klein", (path) => {
    expect(smallChange({ ...base, numstat: [stat(1, 0, path)] })).toEqual({
      small: false,
      reason: `Sperrliste: ${path}`,
    });
  });

  it("Binärdatei (unbekannte Größe) ist nicht klein", () => {
    expect(smallChange({ ...base, numstat: ["-\t-\tpublic/icon.png"] })).toEqual({
      small: false,
      reason: "unbekannte Größe: public/icon.png",
    });
  });

  it("Zeilenzahlen mehrerer Dateien werden summiert", () => {
    const r = smallChange({ ...base, numstat: [stat(30, 0, "src/a.ts"), stat(31, 0, "src/b.ts")] });
    expect(r).toEqual({ small: false, reason: "61 Zeilen > 60" });
  });
});
