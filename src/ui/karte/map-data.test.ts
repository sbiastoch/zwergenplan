import { describe, expect, it } from "vitest";
import type { Origin } from "../../domain/reach.ts";
import { mapData } from "./map-data.ts";

const offer = (title: string, lat: number, lon: number) => ({
  title,
  venue: { name: title, address: `${title}weg 1`, geo: { lat, lon } },
});
const nah = offer("Nah", 49.4495, 11.0601);
const nahZwei = offer("Nah zwei", 49.4495, 11.0601);
const fern = offer("Fern", 49.4301, 11.0892);
const standort: Origin = { source: "standort", point: { lat: 49.4495, lon: 11.0601 }, label: "Mein Standort" };
const gostenhof: Origin = {
  source: "stadtteil",
  point: { lat: 49.448, lon: 11.058 },
  label: "Gostenhof",
  districtId: "gostenhof",
};

describe("mapData: Orte und Startausschnitt der Karte (Plan 0005, E6/E9)", () => {
  it("Orte nach Koordinate, ohne Startpunkt nach Name, mit Startpunkt nach Entfernung", () => {
    const keys = (origin?: Origin) =>
      mapData([fern, nah, nahZwei], [fern, nah, nahZwei], origin).places.map((p) => p.names);
    expect(keys()).toEqual([["Fern"], ["Nah", "Nah zwei"]]);
    expect(keys(standort)).toEqual([["Nah", "Nah zwei"], ["Fern"]]);
  });

  it("Startausschnitt aus der Datenbasis ohne Umkreis, nie aus den sichtbaren Orten (Arch-Review B1)", () => {
    const all = mapData([nah, fern], [nah, fern], undefined).start;
    expect(all).toEqual({ bounds: { minLat: 49.4301, minLon: 11.0601, maxLat: 49.4495, maxLon: 11.0892 } });
    // sichtbar nur „nah“ (Umkreis), Datenbasis beide: Ausschnitt wie ohne Startpunkt
    expect(mapData([nah], [nah, fern], standort).start).toEqual(all);
  });

  it("ein Stadtteil ist die Mitte", () => {
    expect(mapData([nah], [nah, fern], gostenhof).start).toEqual({ center: gostenhof.point, zoom: 13 });
  });
});
