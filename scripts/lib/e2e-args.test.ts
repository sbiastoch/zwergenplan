import { describe, expect, it } from "vitest";
import { affectedArgs, type E2eArgs, parseE2eArgs, runPlan } from "./e2e-args.ts";

describe("runPlan: Suite und Builds (Arch-Review e6, m8)", () => {
  const engines: Record<string, string> = { "pixel-7": "chromium", "iphone-15": "webkit" };
  const engine = (p: string): string | undefined => engines[p];
  const specs = (project: string): E2eArgs & { mode: "specs" } => ({
    mode: "specs",
    specs: ["a.spec.ts"],
    project,
    playwright: [],
  });
  const all: E2eArgs & { mode: "all" } = { mode: "all", playwright: [] };

  it("gezielt: Engine des Projekts, nur build:e2e", () => {
    expect(runPlan(specs("pixel-7"), "smoke", engine)).toEqual({ suite: "chromium", builds: ["build:e2e"] });
    expect(runPlan(specs("iphone-15"), undefined, engine)).toEqual({ suite: "webkit", builds: ["build:e2e"] });
  });

  it("gezielt mit unbekanntem Projekt → Fehler", () => {
    expect(runPlan(specs("gibtsnicht"), undefined, engine)).toHaveProperty("error");
  });

  it("--all: ohne Suite und mit smoke beide Builds, mit chromium/webkit nur build:e2e", () => {
    expect(runPlan(all, undefined, engine)).toEqual({ suite: undefined, builds: ["build:e2e", "build"] });
    expect(runPlan(all, "", engine)).toEqual({ suite: undefined, builds: ["build:e2e", "build"] });
    expect(runPlan(all, "smoke", engine)).toEqual({ suite: "smoke", builds: ["build:e2e", "build"] });
    expect(runPlan(all, "webkit", engine)).toEqual({ suite: "webkit", builds: ["build:e2e"] });
  });
});

describe("parseE2eArgs (Plan 0027, E4; Arch-Review Etappe 4, m5)", () => {
  it("genannte Specs ohne weitere Argumente → pixel-7", () => {
    expect(parseE2eArgs(["e2e/theme.spec.ts"])).toEqual({
      mode: "specs",
      specs: ["e2e/theme.spec.ts"],
      project: "pixel-7",
      playwright: ["e2e/theme.spec.ts", "--project=pixel-7"],
    });
  });

  it("Argumente nach -- gehen an Playwright, das Projekt in beiden Schreibweisen", () => {
    expect(parseE2eArgs(["a.spec.ts", "b.spec.ts", "--", "--project=iphone-15", "-g", "Titel"])).toEqual({
      mode: "specs",
      specs: ["a.spec.ts", "b.spec.ts"],
      project: "iphone-15",
      playwright: ["a.spec.ts", "b.spec.ts", "--project=iphone-15", "-g", "Titel"],
    });
    expect(parseE2eArgs(["a.spec.ts", "--", "--project", "desktop"])).toMatchObject({ project: "desktop" });
  });

  it("ohne Spec oder mit einer Option statt Spec → Fehler mit der Regel", () => {
    for (const argv of [[], ["--"], ["--project=pixel-7"], ["--", "a.spec.ts"]]) {
      const r = parseE2eArgs(argv);
      expect(r.mode).toBe("error");
      if (r.mode === "error") expect(r.message).toContain("Die volle Suite fährt die CI");
    }
  });

  it("--affected: Auswahl aus dem Diff, Standard pixel-7, optional --smoke und --base (Plan 0029, B5)", () => {
    expect(parseE2eArgs(["--affected"])).toEqual({
      mode: "affected",
      project: "pixel-7",
      smoke: false,
      base: undefined,
      extra: [],
    });
    expect(parseE2eArgs(["--affected", "--smoke", "--base", "main~3", "--", "--project=iphone-15", "-g", "x"])).toEqual(
      {
        mode: "affected",
        project: "iphone-15",
        smoke: true,
        base: "main~3",
        extra: ["--project=iphone-15", "-g", "x"],
      },
    );
  });

  it("--affected mit Specs oder unbekannter Option ist ein Fehler", () => {
    for (const argv of [
      ["--affected", "e2e/app.spec.ts"],
      ["e2e/app.spec.ts", "--affected"],
      ["--affected", "--base"],
      ["--affected", "--quatsch"],
    ]) {
      expect(parseE2eArgs(argv).mode, argv.join(" ")).toBe("error");
    }
  });

  it("affectedArgs: gewählte Specs werden zum gezielten Lauf, mit Projekt und Zusatzargumenten", () => {
    expect(affectedArgs(["e2e/app.spec.ts", "e2e/karte.spec.ts"], { project: "pixel-7", extra: [] })).toEqual({
      mode: "specs",
      specs: ["e2e/app.spec.ts", "e2e/karte.spec.ts"],
      project: "pixel-7",
      playwright: ["e2e/app.spec.ts", "e2e/karte.spec.ts", "--project=pixel-7"],
    });
    expect(
      affectedArgs(["e2e/app.spec.ts"], { project: "iphone-15", extra: ["--project=iphone-15", "-g", "x"] }),
    ).toMatchObject({ playwright: ["e2e/app.spec.ts", "--project=iphone-15", "-g", "x"] });
  });

  it("--all läuft alles und reicht die restlichen Argumente durch (pnpm e2e, Review M1)", () => {
    expect(parseE2eArgs(["--all"])).toEqual({ mode: "all", playwright: [] });
    expect(parseE2eArgs(["--all", "--", "--shard=1/2", "e2e/x.spec.ts"])).toEqual({
      mode: "all",
      playwright: ["--shard=1/2", "e2e/x.spec.ts"],
    });
    expect(parseE2eArgs(["--all", "--project=desktop"])).toEqual({ mode: "all", playwright: ["--project=desktop"] });
  });
});
