import { describe, expect, it } from "vitest";
import { swipeOutcome, swipesFor } from "./sheet-swipe.ts";

describe("swipeOutcome (Plan 0060, E2)", () => {
  const height = 700;
  it("bleibt bei kurzem, langsamem Wisch", () => {
    expect(swipeOutcome({ dy: 40, ms: 400, height })).toBe("stay");
  });
  it("schließt bei weitem, langsamem Wisch über die Schwelle (höchstens 120 px)", () => {
    expect(swipeOutcome({ dy: 121, ms: 1200, height })).toBe("close");
    expect(swipeOutcome({ dy: 119, ms: 1200, height })).toBe("stay");
  });
  it("schließt bei schnellem, kurzem Wisch ab 24 px", () => {
    expect(swipeOutcome({ dy: 30, ms: 40, height })).toBe("close");
  });
  it("bleibt bei schnellem Wisch unter 24 px", () => {
    expect(swipeOutcome({ dy: 20, ms: 10, height })).toBe("stay");
  });
  it("bleibt bei Bewegung nach oben", () => {
    expect(swipeOutcome({ dy: -200, ms: 50, height })).toBe("stay");
  });
  it("nimmt bei kleinen Sheets ein Viertel der Höhe als Schwelle", () => {
    expect(swipeOutcome({ dy: 76, ms: 1000, height: 300 })).toBe("close");
    expect(swipeOutcome({ dy: 74, ms: 1000, height: 300 })).toBe("stay");
  });
});

describe("swipesFor (Plan 0060, E3)", () => {
  it("Sheets und Detail über der Karte ja, Vollbild-Detail und Onboarding nein", () => {
    expect(swipesFor("sheet")).toBe(true);
    expect(swipesFor("sheet over-map")).toBe(true);
    expect(swipesFor("detail over-map voll")).toBe(true);
    expect(swipesFor("detail")).toBe(false);
    expect(swipesFor("onb")).toBe(false);
    expect(swipesFor("sheetfoot")).toBe(false);
  });
});
