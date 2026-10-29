import { describe, expect, it } from "vitest";
import { inBox, isOutside, viewNarrows } from "./map-view.ts";

describe("Kartenausschnitt (Plan 0055, E2, E4; Plan 0056, E5)", () => {
  const view = { inView: new Set(["a"]), known: new Set(["a", "b"]) };

  it("außerhalb liegt nur, wer einen bekannten Ort hat und nicht im Ausschnitt ist", () => {
    expect(isOutside(view, "a")).toBe(false);
    expect(isOutside(view, "b")).toBe(true);
    expect(isOutside(view, "ohne-ort")).toBe(false);
    expect(isOutside(undefined, "b")).toBe(false);
  });

  it("der Ausschnitt engt ein, sobald ein bekannter Schlüssel fehlt", () => {
    expect(viewNarrows(view)).toBe(true);
    expect(viewNarrows({ inView: new Set(["a", "b"]), known: new Set(["a", "b"]) })).toBe(false);
    expect(viewNarrows(undefined)).toBe(false);
  });

  it("inBox: Ränder zählen mit", () => {
    const box = { west: 11, south: 49, east: 11.1, north: 49.1 };
    expect(inBox({ lat: 49, lon: 11 }, box)).toBe(true);
    expect(inBox({ lat: 49.1, lon: 11.1 }, box)).toBe(true);
    expect(inBox({ lat: 49.05, lon: 11.2 }, box)).toBe(false);
    expect(inBox({ lat: 48.99, lon: 11.05 }, box)).toBe(false);
  });
});
