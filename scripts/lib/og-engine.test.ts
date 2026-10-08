import { describe, expect, it } from "vitest";
import { pickEngine } from "./og-engine.ts";

describe("Engine der Vorschaubilder (Plan 0026, Nachtrag A, E17, Review A m4)", () => {
  it("Deploy-Build verlangt Chromium", () => {
    expect(pickEngine("real", true)).toBe("chromium");
    expect(() => pickEngine("real", false)).toThrow(/Chromium/);
  });

  it("Fixture-Build weicht ohne Chromium auf WebKit aus (WebKit-Jobs der CI)", () => {
    expect(pickEngine("fixture", true)).toBe("chromium");
    expect(pickEngine("fixture", false)).toBe("webkit");
  });
});
