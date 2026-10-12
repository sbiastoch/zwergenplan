import { describe, expect, it } from "vitest";
import { fallbackCategory, leadCategory } from "./topics.ts";

describe("leadCategory (Plan 0014, E1)", () => {
  it("nimmt ohne Fokus die erste Kategorie in fester Reihenfolge", () => {
    expect(leadCategory(["konzert", "musik"], [])).toBe("musik");
  });

  it("nimmt eine spätere Kategorie, wenn sie im Fokus liegt", () => {
    expect(leadCategory(["konzert", "musik"], ["buehne"])).toBe("buehne");
  });

  it("bleibt bei der ersten Kategorie, wenn der Fokus nicht trifft", () => {
    expect(leadCategory(["konzert", "musik"], ["wasser"])).toBe("musik");
  });

  it("folgt bei zwei Treffern der festen Reihenfolge, nicht der Auswahl", () => {
    expect(leadCategory(["tanz"], ["musik", "bewegung"])).toBe("bewegung");
  });

  it("übergeht reine Merkmale ohne Kategorie", () => {
    expect(leadCategory(["mehrsprachig", "musik"], [])).toBe("musik");
    expect(leadCategory(["vaeter", "kreativ"], ["kreativ"])).toBe("kreativ");
  });
});

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
