import { describe, expect, it } from "vitest";
import { strayStartFiles } from "./chunks.ts";

describe("Chunk-Wächter (Plan 0010, E8; CSS: Plan 0033, E4)", () => {
  it("grün: genau ein index-*.js und ein index-*.css direkt in assets/, Maps und andere Endungen zählen nicht", () => {
    expect(
      strayStartFiles([
        "index-AbC123.js",
        "index-AbC123.js.map",
        "index-X.css",
        "bricolage-latin.woff2",
        "karte",
        "onboarding",
      ]),
    ).toEqual([]);
  });

  it("rot: ein abgespaltener Chunk direkt in assets/ (z. B. React aus dem Kalender-Versuch)", () => {
    expect(
      strayStartFiles(["index-AbC123.js", "index-X.css", "jsx-runtime-Q1w2E3.js", "jsx-runtime-Q1w2E3.js.map"]),
    ).toEqual(["jsx-runtime-Q1w2E3.js"]);
  });

  it("rot: kein Einstieg oder zwei Einstiege", () => {
    expect(strayStartFiles(["index-X.css"])).toEqual(["(kein index-*.js)"]);
    expect(strayStartFiles(["index-a.js", "index-b.js", "index-X.css"])).toEqual(["index-b.js"]);
  });

  it("rot: eine Chunk-CSS direkt in assets/ zählte still ins Budget CSS", () => {
    expect(strayStartFiles(["index-a.js", "index-X.css", "OnboardingFlow-Q1.css"])).toEqual(["OnboardingFlow-Q1.css"]);
  });

  it("rot: keine oder zwei Start-CSS", () => {
    expect(strayStartFiles(["index-a.js"])).toEqual(["(kein index-*.css)"]);
    expect(strayStartFiles(["index-a.js", "index-X.css", "index-Y.css"])).toEqual(["index-Y.css"]);
  });
});
