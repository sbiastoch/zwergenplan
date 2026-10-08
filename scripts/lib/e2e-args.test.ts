import { describe, expect, it } from "vitest";
import { parseE2eArgs } from "./e2e-args.ts";

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

  it("--all läuft alles und reicht die restlichen Argumente durch (pnpm e2e, Review M1)", () => {
    expect(parseE2eArgs(["--all"])).toEqual({ mode: "all", playwright: [] });
    expect(parseE2eArgs(["--all", "--", "--shard=1/2", "e2e/x.spec.ts"])).toEqual({
      mode: "all",
      playwright: ["--shard=1/2", "e2e/x.spec.ts"],
    });
    expect(parseE2eArgs(["--all", "--project=desktop"])).toEqual({ mode: "all", playwright: ["--project=desktop"] });
  });
});
