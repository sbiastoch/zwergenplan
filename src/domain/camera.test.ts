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
    expect(initialCamera([theater, gemeinde, bibliothek], undefined, "vgn")).toEqual({
      bounds: { minLat: 49.4301, minLon: 11.0601, maxLat: 49.4498, maxLon: 11.0892 },
    });
  });

  it("ohne Orte: Kartenmitte des Netzes, Zoom 11 (Hauptmarkt bzw. Rathaus Düsseldorf; Plan 0039, E8)", () => {
    expect(initialCamera([], undefined, "vgn")).toEqual({ center: { lat: 49.454, lon: 11.077 }, zoom: 11 });
    expect(initialCamera([], undefined, "vrr")).toEqual({ center: { lat: 51.226, lon: 6.773 }, zoom: 11 });
  });

  it("nur Orte des gewählten Netzes zählen (Plan 0039, E8)", () => {
    const rheinzwerge = { lat: 51.2197, lon: 6.7951 };
    const nuernberg = initialCamera([theater, gemeinde, rheinzwerge], undefined, "vgn");
    expect(nuernberg).toEqual(initialCamera([theater, gemeinde], undefined, "vgn"));
    expect(initialCamera([theater, rheinzwerge], undefined, "vrr")).toEqual({
      bounds: { minLat: 51.2197, minLon: 6.7951, maxLat: 51.2197, maxLon: 6.7951 },
    });
    expect(initialCamera([theater], undefined, "vrr")).toEqual({ center: { lat: 51.226, lon: 6.773 }, zoom: 11 });
  });

  it("Standort und Kartenmitte ändern den Ausschnitt nie", () => {
    const places = [theater, gemeinde];
    const without = initialCamera(places, undefined, "vgn");
    expect(initialCamera(places, standort, "vgn")).toEqual(without);
    expect(initialCamera(places, kartenmitte, "vgn")).toEqual(without);
    expect(initialCamera([], standort, "vgn")).toEqual(initialCamera([], undefined, "vgn"));
  });

  it("nur ein Stadtteil darf die Mitte sein, Zoom 13", () => {
    expect(initialCamera([theater, gemeinde], gostenhof, "vgn")).toEqual({ center: gostenhof.point, zoom: 13 });
  });
});
