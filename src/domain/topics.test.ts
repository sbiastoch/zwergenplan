import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  EXTRACT_CATEGORIES,
  fallbackCategory,
  foldCategory,
  TOPIC_CATEGORIES,
  withCategory,
} from "./topics.ts";

describe("sieben Kategorien (Plan 0037, Nachtrag A)", () => {
  it("in fester Reihenfolge, IDs aus dem alten Bestand (NA1, NA2)", () => {
    expect(CATEGORIES).toEqual([
      "babykurse",
      "krabbel-spielgruppen",
      "treffs-cafes",
      "bewegung",
      "wasser",
      "musik",
      "buehne",
    ]);
  });

  it("die Extraktion wählt weiter aus den zwölf alten Werten in alter Reihenfolge (Cache-Schlüssel, NA3)", () => {
    expect(EXTRACT_CATEGORIES).toEqual([
      "babykurse",
      "krabbel-spielgruppen",
      "treffs-cafes",
      "bewegung",
      "wasser",
      "musik",
      "kreativ",
      "buecher",
      "museum",
      "buehne",
      "natur",
      "beratung",
    ]);
    for (const c of CATEGORIES) expect(EXTRACT_CATEGORIES).toContain(c);
  });

  it.each([
    ["natur", "bewegung"],
    ["kreativ", "buehne"],
    ["buecher", "buehne"],
    ["museum", "buehne"],
    ["beratung", "babykurse"],
  ] as const)("foldCategory(%s) = %s", (old, folded) => {
    expect(foldCategory(old)).toBe(folded);
  });

  it("lässt die sieben unverändert", () => {
    for (const c of CATEGORIES) expect(foldCategory(c)).toBe(c);
  });

  it("jedes Thema zeigt nur auf die sieben (NA4)", () => {
    for (const cats of Object.values(TOPIC_CATEGORIES)) for (const c of cats) expect(CATEGORIES).toContain(c);
  });
});

describe("fallbackCategory (Plan 0037, E5)", () => {
  it("nimmt die erste Kategorie in fester Reihenfolge", () => {
    expect(fallbackCategory(["konzert", "musik"])).toBe("musik");
  });

  it("übergeht reine Merkmale", () => {
    expect(fallbackCategory(["mehrsprachig", "kreativ"])).toBe("buehne");
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

  it("faltet einen Altwert aus einem gecachten site.json (Nachtrag A, NA6)", () => {
    const cached = { id: "c", category: "kreativ" as const, topics: ["konzert", "musik"] as Item["topics"] };
    expect(withCategory<Item>(cached).category).toBe("buehne");
  });
});
