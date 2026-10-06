import { describe, expect, it } from "vitest";
import { haversineMeters } from "./geo.ts";
import {
  airlineReach,
  compareReach,
  LIMIT_MINUTES,
  type Origin,
  type Reach,
  roundedDistance,
  roundedMinutes,
  stopMinutes,
  withinLimit,
} from "./reach.ts";

describe("stopMinutes (Plan 0019, E6)", () => {
  it("ganze Minuten, mindestens 1", () => {
    expect(stopMinutes(0)).toBe(1);
    expect(stopMinutes(0.4)).toBe(1);
    expect(stopMinutes(1.58)).toBe(2);
    expect(stopMinutes(3.6)).toBe(4);
    expect(stopMinutes(5.89)).toBe(6);
  });
});

const gostenhof: Origin = {
  source: "stadtteil",
  point: { lat: 49.448, lon: 11.058 },
  label: "Gostenhof",
  districtId: "gostenhof",
};
const theater = { geo: { lat: 49.4495, lon: 11.0601 } };
const luftlinie = (meters: number): Reach => ({ kind: "luftlinie", meters });
const oepnv = (minutes: number, byFoot = false): Reach => ({ kind: "oepnv", minutes, byFoot });

describe("airlineReach", () => {
  it("liefert die Luftlinie vom Startpunkt zum Ort (bisher reachTo)", () => {
    const reach = airlineReach(gostenhof)(theater);
    expect(reach).toEqual({ kind: "luftlinie", meters: haversineMeters(gostenhof.point, theater.geo) });
    expect(reach.kind === "luftlinie" && Math.round(reach.meters)).toBe(226);
  });

  it("rechnet für jede Herkunft gleich, auch für die Kartenmitte (Plan 0005, E8)", () => {
    const kartenmitte: Origin = { source: "karte", point: gostenhof.point, label: "Kartenmitte" };
    const standort: Origin = { source: "standort", point: gostenhof.point, label: "Standort" };
    expect(airlineReach(kartenmitte)(theater)).toEqual(airlineReach(gostenhof)(theater));
    expect(airlineReach(standort)(theater)).toEqual(airlineReach(gostenhof)(theater));
  });
});

describe("compareReach", () => {
  it("ist negativ, wenn a näher liegt", () => {
    expect(compareReach(luftlinie(200), luftlinie(1400))).toBeLessThan(0);
    expect(compareReach(luftlinie(1400), luftlinie(200))).toBeGreaterThan(0);
    expect(compareReach(luftlinie(500), luftlinie(500))).toBe(0);
    expect(compareReach(oepnv(12), oepnv(25))).toBeLessThan(0);
    expect(compareReach(oepnv(25), oepnv(12))).toBeGreaterThan(0);
    expect(compareReach(oepnv(12), oepnv(12, true))).toBe(0);
  });

  it("sortiert eine Liste aufsteigend", () => {
    const sorted = [luftlinie(3008), luftlinie(226), luftlinie(1427)].sort(compareReach);
    expect(sorted).toEqual([luftlinie(226), luftlinie(1427), luftlinie(3008)]);
  });

  it("zwei unerreichbare Orte sind gleich, statt NaN (m11)", () => {
    const inf = Number.POSITIVE_INFINITY;
    expect(compareReach(oepnv(inf), oepnv(inf))).toBe(0);
    expect(compareReach(oepnv(inf), oepnv(130))).toBeGreaterThan(0);
    expect(compareReach(oepnv(130), oepnv(inf))).toBeLessThan(0);
    const sorted = [oepnv(inf), oepnv(40), oepnv(inf), oepnv(5)].sort(compareReach);
    expect(sorted).toEqual([oepnv(5), oepnv(40), oepnv(inf), oepnv(inf)]);
  });

  it("stellt bei gemischter Art die Wegzeit vor die Luftlinie (totale Ordnung)", () => {
    expect(compareReach(oepnv(90), luftlinie(10))).toBeLessThan(0);
    expect(compareReach(luftlinie(10), oepnv(90))).toBeGreaterThan(0);
  });
});

describe("withinLimit", () => {
  it("kennt genau die Stufen 20, 30 und 45 Min.", () => {
    expect(LIMIT_MINUTES).toEqual([20, 30, 45]);
  });

  it("schließt die Grenze ein und vergleicht ungerundete Minuten", () => {
    const at30 = { kind: "minuten", value: 30 } as const;
    expect(withinLimit(oepnv(30), at30)).toBe(true);
    expect(withinLimit(oepnv(30.01), at30)).toBe(false);
    // 31 Min. werden als „30 Min.“ angezeigt, fallen aber aus „bis 30 Min.“
    expect(withinLimit(oepnv(31), at30)).toBe(false);
    expect(withinLimit(oepnv(0, true), { kind: "minuten", value: 20 })).toBe(true);
    expect(withinLimit(oepnv(Number.POSITIVE_INFINITY), { kind: "minuten", value: 45 })).toBe(false);
  });

  it("gilt für die Luftlinie nicht (undefined, E11)", () => {
    expect(withinLimit(luftlinie(100), { kind: "minuten", value: 20 })).toBeUndefined();
  });
});

describe("roundedMinutes (E8)", () => {
  it.each([
    [0, { over: false, value: 5 }],
    [7.4, { over: false, value: 5 }],
    [7.5, { over: false, value: 10 }],
    [13.6, { over: false, value: 15 }],
    [23, { over: false, value: 25 }],
    [57.4, { over: false, value: 55 }],
    [57.5, { over: false, value: 60 }],
    [60, { over: false, value: 60 }],
    [64, { over: false, value: 60 }],
    [65, { over: false, value: 70 }],
    [120, { over: false, value: 120 }],
    [121, { over: true, value: 120 }],
    [Number.POSITIVE_INFINITY, { over: true, value: 120 }],
  ])("%d Min. → %o", (minutes, expected) => {
    expect(roundedMinutes(minutes)).toEqual(expected);
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
