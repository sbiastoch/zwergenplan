import { describe, expect, it } from "vitest";
import { fillPlaceholders, placeholderWindow } from "./placeholders.ts";

describe("Platzhalter {von}/{bis} (Plan 0031, E3; Plan 0015, E4)", () => {
  it("Fenster: Monatsanfang bis Monatsanfang 13 Monate später", () => {
    expect(placeholderWindow("2026-10-10")).toEqual({ von: "2026-10-01", bis: "2027-11-01" });
    expect(placeholderWindow("2026-12-31")).toEqual({ von: "2026-12-01", bis: "2028-01-01" });
    expect(placeholderWindow("2027-01-01")).toEqual({ von: "2027-01-01", bis: "2028-02-01" });
  });

  it("ersetzt nur {von} und {bis}, jedes Vorkommen", () => {
    expect(fillPlaceholders("a?START={von}&END={bis}&X={von}", "2026-10-10")).toBe(
      "a?START=2026-10-01&END=2027-11-01&X=2026-10-01",
    );
    expect(fillPlaceholders('{"q":"{foo}"}', "2026-10-10")).toBe('{"q":"{foo}"}');
  });
});
