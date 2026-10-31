import { describe, expect, it } from "vitest";
import { shownSelection } from "./use-selection.ts";

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
});
