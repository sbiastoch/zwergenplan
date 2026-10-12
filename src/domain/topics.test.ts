import { describe, expect, it } from "vitest";
import { fallbackCategory, withCategory } from "./topics.ts";

describe("fallbackCategory (Plan 0037, E5)", () => {
  it("nimmt die erste Kategorie in fester Reihenfolge", () => {
    expect(fallbackCategory(["konzert", "musik"])).toBe("musik");
  });

  it("übergeht reine Merkmale", () => {
    expect(fallbackCategory(["mehrsprachig", "kreativ"])).toBe("kreativ");
  });

  it("fällt bei reinen Merkmalen auf treffs-cafes zurück", () => {
    expect(fallbackCategory(["vaeter", "mehrsprachig"])).toBe("treffs-cafes");
  });
});

describe("withCategory (Plan 0037, E13; Übergang bis Stufe C)", () => {
  type Item = { id: string; category: "musik" | "buehne"; topics: Array<"konzert" | "musik"> };

  it("behält eine vorhandene category", () => {
    const item: Item = { id: "a", category: "buehne", topics: ["konzert", "musik"] };
    expect(withCategory<Item>(item)).toEqual(item);
  });

  it("füllt eine fehlende category per Rückfall und ändert sonst nichts", () => {
    const loose = { id: "b", topics: ["konzert", "musik"] as Item["topics"] };
    expect(withCategory<Item>(loose)).toEqual({ id: "b", topics: ["konzert", "musik"], category: "musik" });
  });
});
