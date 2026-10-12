import { describe, expect, it } from "vitest";
import { districtGroups } from "./district-groups.ts";
import { DISTRICTS_BY_REGION } from "./districts.ts";

describe("districtGroups (Plan 0036, E6/E7)", () => {
  it("ohne Wahl: nach Einwohnern, Nürnberg zuerst, jede Region einmal mit ihren Stadtteilen", () => {
    const groups = districtGroups();
    expect(groups.map((g) => [g.region, g.name])).toEqual([
      ["nuernberg", "Nürnberg"],
      ["fuerth", "Fürth"],
    ]);
    expect(groups[1]?.districts).toBe(DISTRICTS_BY_REGION.fuerth);
  });

  it("die gewählte Stadt steht zuerst, die übrigen bleiben wählbar", () => {
    expect(districtGroups("fuerth").map((g) => g.region)).toEqual(["fuerth", "nuernberg"]);
    expect(districtGroups("nuernberg").map((g) => g.region)).toEqual(["nuernberg", "fuerth"]);
  });
});
