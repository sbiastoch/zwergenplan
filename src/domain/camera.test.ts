import { describe, expect, it } from "vitest";
import { aroundPoint, initialCamera, originKey, overviewCamera, START_RADIUS_KM, zoomForRadius } from "./camera.ts";
import type { Origin } from "./reach.ts";

describe("Startausschnitt der Karte (Plan 0005, E9; Plan 0056, E6; ADR 0039)", () => {
  const theater = { lat: 49.4495, lon: 11.0601 };
  const gemeinde = { lat: 49.4301, lon: 11.0892 };
  const bibliothek = { lat: 49.4498, lon: 11.0812 };
  const standort: Origin = { source: "standort", point: { lat: 49.452, lon: 11.077 }, label: "Mein Standort" };
  const kartenmitte: Origin = { source: "karte", point: { lat: 49.43, lon: 11.09 }, label: "Kartenmitte" };
  const gostenhof: Origin = {
    source: "stadtteil",
    point: { lat: 49.448, lon: 11.058 },
    label: "Gostenhof",
    districtId: "gostenhof",
  };
  const fuerth: Origin = { source: "standort", point: { lat: 49.4771, lon: 10.9887 }, label: "Mein Standort" };

  it("ohne Startpunkt: alle Orte (öffentliche Daten)", () => {
    expect(initialCamera([theater, gemeinde, bibliothek], undefined)).toEqual({
      bounds: { minLat: 49.4301, minLon: 11.0601, maxLat: 49.4498, maxLon: 11.0892 },
    });
  });

  it("ohne Orte: Hauptmarkt, Zoom 11", () => {
    expect(initialCamera([], undefined)).toEqual({ center: { lat: 49.454, lon: 11.077 }, zoom: 11 });
    expect(overviewCamera([])).toEqual({ center: { lat: 49.454, lon: 11.077 }, zoom: 11 });
  });

  it("jeder Startpunkt ist die Mitte, mit 2 km Radius: Standort, Stadtteil, gespeicherte Kartenmitte", () => {
    const places = [theater, gemeinde, bibliothek];
    expect(initialCamera(places, standort)).toEqual({ around: standort.point, radiusKm: START_RADIUS_KM });
    expect(initialCamera(places, gostenhof)).toEqual({ around: gostenhof.point, radiusKm: 2 });
    expect(initialCamera(places, kartenmitte)).toEqual({ around: kartenmitte.point, radiusKm: 2 });
  });

  it("kein Ort im Umkreis: Rückfall auf alle Orte (Review M4)", () => {
    const places = [theater, gemeinde, bibliothek];
    expect(initialCamera(places, fuerth)).toEqual(overviewCamera(places));
    expect(initialCamera([], standort)).toEqual(overviewCamera([]));
  });

  it("aroundPoint: ±km in Breite und Länge, die Länge mit cos φ", () => {
    const box = aroundPoint({ lat: 49.45, lon: 11.08 }, 2);
    // 1° Breite ≈ 111,32 km
    expect(box.maxLat - box.minLat).toBeCloseTo(4 / 111.32, 5);
    // 1° Länge bei 49,45° ≈ 111,32 km · cos φ ≈ 72,4 km
    expect(box.maxLon - box.minLon).toBeCloseTo(4 / (111.32 * Math.cos((49.45 * Math.PI) / 180)), 5);
    expect((box.minLat + box.maxLat) / 2).toBeCloseTo(49.45, 9);
  });

  it("zoomForRadius: 2 km Radius auf der kürzeren Kante", () => {
    // 512-px-Kacheln (MapLibre): Meter je Pixel = 40 075 016,686 · cos φ / (512 · 2^z)
    const metersPerPx = (z: number, lat: number) => (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);
    for (const edge of [250, 390, 640]) {
      const z = zoomForRadius(49.45, 2, edge);
      expect(metersPerPx(z, 49.45) * edge).toBeCloseTo(4000, 3);
    }
    // höhere Karte → größerer Zoom bei gleichem Radius
    expect(zoomForRadius(49.45, 2, 640)).toBeGreaterThan(zoomForRadius(49.45, 2, 250));
  });

  it("originKey: gleiche Quelle und gleicher Punkt bzw. Stadtteil sind gleich (N12)", () => {
    expect(originKey(undefined)).toBeUndefined();
    expect(originKey(gostenhof)).toBe("stadtteil:gostenhof");
    expect(originKey(standort)).toBe("standort:49.452,11.077");
    expect(originKey({ ...standort })).toBe(originKey(standort));
    expect(originKey(kartenmitte)).not.toBe(originKey({ ...kartenmitte, source: "standort" }));
  });
});
