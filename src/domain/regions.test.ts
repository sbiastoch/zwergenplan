import { describe, expect, it } from "vitest";
import { inBounds } from "./geo.ts";
import { REGION_IDS, REGIONS } from "./regions.ts";

describe("REGIONS (Plan 0031, E1)", () => {
  it("hat für jede ID einen Namen und eine bbox mit min < max", () => {
    expect(REGION_IDS.length).toBeGreaterThan(0);
    for (const id of REGION_IDS) {
      const { bbox, name } = REGIONS[id];
      expect(name.length).toBeGreaterThan(0);
      expect(bbox.minLat).toBeLessThan(bbox.maxLat);
      expect(bbox.minLon).toBeLessThan(bbox.maxLon);
    }
  });

  it("Nürnberg: Hauptmarkt liegt drin, Düsseldorf nicht", () => {
    const { bbox } = REGIONS.nuernberg;
    expect(inBounds({ lat: 49.4539, lon: 11.0775 }, bbox)).toBe(true);
    expect(inBounds({ lat: 51.2277, lon: 6.7735 }, bbox)).toBe(false);
  });
});
