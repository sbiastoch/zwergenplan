import { describe, expect, it } from "vitest";
import { haversineMeters } from "./geo.ts";
import { compareReach, type Origin, RADII_KM, type Reach, reachTo, roundedDistance, withinLimit } from "./reach.ts";

const gostenhof: Origin = {
  source: "stadtteil",
  point: { lat: 49.448, lon: 11.058 },
  label: "Gostenhof",
  districtId: "gostenhof",
};
const theater = { geo: { lat: 49.4495, lon: 11.0601 } };
const luftlinie = (meters: number): Reach => ({ kind: "luftlinie", meters });

describe("reachTo", () => {
  it("liefert die Luftlinie vom Startpunkt zum Ort", () => {
    const reach = reachTo(gostenhof, theater);
    expect(reach).toEqual({ kind: "luftlinie", meters: haversineMeters(gostenhof.point, theater.geo) });
    expect(Math.round(reach.meters)).toBe(226);
  });
});

describe("compareReach", () => {
  it("ist negativ, wenn a näher liegt", () => {
    expect(compareReach(luftlinie(200), luftlinie(1400))).toBeLessThan(0);
    expect(compareReach(luftlinie(1400), luftlinie(200))).toBeGreaterThan(0);
    expect(compareReach(luftlinie(500), luftlinie(500))).toBe(0);
  });

  it("sortiert eine Liste aufsteigend", () => {
    const sorted = [luftlinie(3008), luftlinie(226), luftlinie(1427)].sort(compareReach).map((r) => r.meters);
    expect(sorted).toEqual([226, 1427, 3008]);
  });
});

describe("withinLimit", () => {
  it("kennt genau die Radien 2, 5 und 10 km", () => {
    expect(RADII_KM).toEqual([2, 5, 10]);
  });

  it("schließt die Grenze ein und vergleicht ungerundete Meter", () => {
    expect(withinLimit(luftlinie(5000), { kind: "km", value: 5 })).toBe(true);
    expect(withinLimit(luftlinie(5000.1), { kind: "km", value: 5 })).toBe(false);
    expect(withinLimit(luftlinie(2040), { kind: "km", value: 2 })).toBe(false);
    expect(withinLimit(luftlinie(0), { kind: "km", value: 2 })).toBe(true);
  });
});

describe("roundedDistance", () => {
  it.each([
    [0, { unit: "m", value: 100 }],
    [140, { unit: "m", value: 100 }],
    [150, { unit: "m", value: 200 }],
    [949, { unit: "m", value: 900 }],
    [950, { unit: "km", value: 1 }],
    [2340, { unit: "km", value: 2.3 }],
    [2360, { unit: "km", value: 2.4 }],
    [9940, { unit: "km", value: 9.9 }],
    [9960, { unit: "km", value: 10 }],
    [12_400, { unit: "km", value: 12 }],
    [12_600, { unit: "km", value: 13 }],
  ])("%d m → %o", (meters, expected) => {
    expect(roundedDistance(meters)).toEqual(expected);
  });
});
