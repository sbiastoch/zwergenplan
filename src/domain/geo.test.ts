import { describe, expect, it } from "vitest";
import { coarsen, haversineMeters, inBounds, NUERNBERG_BBOX } from "./geo.ts";

describe("haversineMeters", () => {
  const a = { lat: 49.45, lon: 11.07 };

  it("misst 0,01° Breite als 1 111,95 m", () => {
    expect(Math.abs(haversineMeters(a, { lat: 49.46, lon: 11.07 }) - 1111.95)).toBeLessThanOrEqual(0.5);
  });

  it("misst 0,01° Länge bei 49,45° als 722,89 m", () => {
    expect(Math.abs(haversineMeters(a, { lat: 49.45, lon: 11.08 }) - 722.89)).toBeLessThanOrEqual(0.5);
  });

  it("ist symmetrisch und für denselben Punkt 0", () => {
    const b = { lat: 49.4301, lon: 11.0892 };
    expect(haversineMeters(a, b)).toBe(haversineMeters(b, a));
    expect(haversineMeters(a, a)).toBe(0);
  });
});

describe("inBounds", () => {
  const { minLat, maxLat, minLon, maxLon } = NUERNBERG_BBOX;

  it("schließt die Grenzen ein", () => {
    expect(inBounds({ lat: minLat, lon: minLon })).toBe(true);
    expect(inBounds({ lat: maxLat, lon: maxLon })).toBe(true);
    expect(inBounds({ lat: 49.45, lon: 11.07 })).toBe(true);
  });

  it("lehnt Punkte knapp außerhalb ab", () => {
    expect(inBounds({ lat: minLat - 0.001, lon: 11.07 })).toBe(false);
    expect(inBounds({ lat: maxLat + 0.001, lon: 11.07 })).toBe(false);
    expect(inBounds({ lat: 49.45, lon: minLon - 0.001 })).toBe(false);
    expect(inBounds({ lat: 49.45, lon: maxLon + 0.001 })).toBe(false);
  });
});

describe("coarsen", () => {
  it("rundet je Komponente auf 3 Nachkommastellen", () => {
    expect(coarsen({ lat: 49.45678, lon: 11.07849 })).toEqual({ lat: 49.457, lon: 11.078 });
    expect(coarsen({ lat: 49.45678, lon: 11.07851 })).toEqual({ lat: 49.457, lon: 11.079 });
  });

  it("macht aus −0 eine 0", () => {
    const { lat, lon } = coarsen({ lat: -0.0001, lon: -0.0001 });
    expect(Object.is(lat, 0)).toBe(true);
    expect(Object.is(lon, 0)).toBe(true);
  });
});
