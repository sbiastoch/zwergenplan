import { describe, expect, it } from "vitest";
import { strayStartChunks } from "./chunks.ts";

describe("Chunk-Wächter (Plan 0010, E8)", () => {
  it("grün: genau ein index-*.js direkt in assets/, Maps und andere Endungen zählen nicht", () => {
    expect(
      strayStartChunks(["index-AbC123.js", "index-AbC123.js.map", "index-X.css", "bricolage-latin.woff2", "karte"]),
    ).toEqual([]);
  });

  it("rot: ein abgespaltener Chunk direkt in assets/ (z. B. React aus dem Kalender-Versuch)", () => {
    expect(strayStartChunks(["index-AbC123.js", "jsx-runtime-Q1w2E3.js", "jsx-runtime-Q1w2E3.js.map"])).toEqual([
      "jsx-runtime-Q1w2E3.js",
    ]);
  });

  it("rot: kein Einstieg oder zwei Einstiege", () => {
    expect(strayStartChunks([])).toEqual(["(kein index-*.js)"]);
    expect(strayStartChunks(["index-a.js", "index-b.js"])).toEqual(["index-b.js"]);
  });
});
