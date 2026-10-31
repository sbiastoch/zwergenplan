import { describe, expect, it } from "vitest";
import { revealsSelection, shownSelection } from "./use-selection.ts";

describe("shownSelection (Plan 0059, E5)", () => {
  it("markiert das offene Orts-Sheet, auch ohne weiteres Overlay", () => {
    expect(shownSelection("ort", undefined, false)).toBe("ort");
    expect(shownSelection("ort", "anderer", true)).toBe("ort");
  });

  it("markiert den getippten Ort nur, solange Detail oder Anbieter-Sheet offen sind", () => {
    expect(shownSelection(undefined, "ort", true)).toBe("ort");
    expect(shownSelection(undefined, "ort", false)).toBeUndefined();
  });

  it("markiert nichts ohne Tipp, etwa beim Detail aus einem Deep-Link", () => {
    expect(shownSelection(undefined, undefined, true)).toBeUndefined();
  });

  it("markiert den Ort des Details aus der Liste (Nachtrag 1, N2), ein Tipp geht vor", () => {
    expect(shownSelection(undefined, undefined, true, "detail-ort")).toBe("detail-ort");
    expect(shownSelection(undefined, "getippt", true, "detail-ort")).toBe("getippt");
    expect(shownSelection("sheet", undefined, true, "detail-ort")).toBe("sheet");
    expect(shownSelection(undefined, undefined, false, "detail-ort")).toBeUndefined();
  });
});

describe("revealsSelection (Nachtrag 1, Review M1)", () => {
  it("fährt nur für einen Tipp oder ein Orts-Sheet, nie für den Ort eines Details aus der Liste", () => {
    expect(revealsSelection("ort", undefined)).toBe(true);
    expect(revealsSelection(undefined, "getippt")).toBe(true);
    expect(revealsSelection(undefined, undefined)).toBe(false);
  });
});
