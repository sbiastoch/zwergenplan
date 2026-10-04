import { describe, expect, it } from "vitest";
import { keywords, ratio, similarTitle } from "./similar.ts";

describe("similar", () => {
  it("ignoriert Füllwörter", () => {
    expect([...keywords("Offener Krabbeltreff für Babys in Nürnberg")]).toEqual(["krabbeltreff"]);
  });

  it("berechnet die Ähnlichkeit wie difflib", () => {
    expect(ratio("abcd", "abcd")).toBe(1);
    expect(ratio("", "")).toBe(1);
    expect(ratio("abcd", "wxyz")).toBe(0);
    expect(ratio("musikzwerge", "musikzwerg")).toBeCloseTo(0.952, 3);
  });

  it("erkennt gleiche Termine mit abweichenden Titeln", () => {
    expect(similarTitle("Musikzwerge für Eltern mit Baby", "Musikzwerge (3–12 Monate)")).toBe(true);
    expect(similarTitle("Mini-Club", "Miniclub")).toBe(true);
    expect(similarTitle("Krabbelgruppe", "Babymassage")).toBe(false);
  });
});
