import { describe, expect, it } from "vitest";
import { DISCOVER_TERMS, searchQuery, selectTerms } from "./discover-terms.ts";

describe("Suchbegriffe (Plan 0032, E7.2)", () => {
  it("feste Liste mit zehn Begriffen", () => {
    expect(DISCOVER_TERMS).toHaveLength(10);
    expect(DISCOVER_TERMS).toContain("PEKiP");
  });

  it("ohne Filter alle, mit Filter die Teilmenge in fester Reihenfolge", () => {
    expect(selectTerms()).toEqual([...DISCOVER_TERMS]);
    expect(selectTerms(["pekip", "krabbel"])).toEqual(["Krabbelgruppe", "PEKiP"]);
  });

  it("unbekannter Filter ist ein Fehler", () => {
    expect(() => selectTerms(["Yoga"])).toThrow(/Yoga|yoga/);
  });

  it("Anfrage mit Regionsname", () => {
    expect(searchQuery("PEKiP", "Nürnberg")).toBe("PEKiP Nürnberg");
  });
});
