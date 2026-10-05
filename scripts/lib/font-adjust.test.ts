import { describe, expect, it } from "vitest";
import { type ClassRatio, chooseAdjust } from "./font-adjust.ts";

const cls = (name: string, weight: number, stack: ClassRatio["stack"], fit: boolean, ratio: number): ClassRatio => ({
  name,
  weight,
  stack,
  fit,
  ratio,
});
const RATIOS = [
  cls("Meta", 450, "text", true, 1.04),
  cls("Text", 400, "text", true, 1.02),
  cls("Fakten", 700, "text", true, 1.076),
  cls("Chips", 700, "text", false, 1.2),
  cls("Zeit", 800, "text", true, 0.98),
  cls("Pille", 800, "text", true, 1.096),
  cls("Titel", 800, "display", true, 1.044),
  cls("Etikett", 800, "display", true, 1.065),
  cls("Marke", 800, "display", false, 1.3),
];

describe("chooseAdjust", () => {
  it("nimmt die Mitte zwischen kleinstem und größtem Verhältnis, auf 0,1 % gerundet", () => {
    expect(chooseAdjust(RATIOS, "text", { min: 200, max: 549 }).adjust).toBe(1.03);
    expect(chooseAdjust(RATIOS, "text", { min: 750, max: 800 }).adjust).toBe(1.038);
  });

  it("lässt Klassen ohne Umbruch außen vor, zeigt sie aber", () => {
    const choice = chooseAdjust(RATIOS, "display", { min: 750, max: 800 });
    expect(choice.adjust).toBe(1.055); // (1,044 + 1,065) / 2, ohne Marke 1,3
    expect(choice.basis.map((r) => r.name)).toEqual(["Titel", "Etikett"]);
    expect(choice.shown.map((r) => r.name)).toEqual(["Titel", "Etikett", "Marke"]);
  });

  it("nimmt im Display-Stack ohne eigene Klassen die des Text-Stacks", () => {
    const choice = chooseAdjust(RATIOS, "display", { min: 550, max: 749 });
    expect(choice.adjust).toBe(1.076);
    expect(choice.basis.map((r) => r.name)).toEqual(["Fakten"]);
    expect(choice.shown).toEqual(choice.basis);
  });

  it("wirft ohne umbrechende Klasse im Bereich", () => {
    expect(() => chooseAdjust([cls("Chips", 700, "text", false, 1.2)], "text", { min: 550, max: 749 })).toThrow(
      /nicht bestimmbar/,
    );
    expect(() => chooseAdjust([], "display", { min: 750, max: 800 })).toThrow(/keine umbrechende Klasse/);
  });
});
