import { describe, expect, it } from "vitest";
import { initialCamera } from "./camera.ts";
import type { Origin } from "./reach.ts";

describe("Startausschnitt der Karte (Plan 0005, E9; ADR 0008)", () => {
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

  it("umfasst alle Orte (öffentliche Daten)", () => {
    expect(initialCamera([theater, gemeinde, bibliothek], undefined)).toEqual({
      bounds: { minLat: 49.4301, minLon: 11.0601, maxLat: 49.4498, maxLon: 11.0892 },
    });
  });

  it("ohne Orte: Hauptmarkt, Zoom 11", () => {
    expect(initialCamera([], undefined)).toEqual({ center: { lat: 49.454, lon: 11.077 }, zoom: 11 });
  });

  it("Standort und Kartenmitte ändern den Ausschnitt nie", () => {
    const places = [theater, gemeinde];
    const without = initialCamera(places, undefined);
    expect(initialCamera(places, standort)).toEqual(without);
    expect(initialCamera(places, kartenmitte)).toEqual(without);
    expect(initialCamera([], standort)).toEqual(initialCamera([], undefined));
  });

  it("nur ein Stadtteil darf die Mitte sein, Zoom 13", () => {
    expect(initialCamera([theater, gemeinde], gostenhof)).toEqual({ center: gostenhof.point, zoom: 13 });
  });
});
