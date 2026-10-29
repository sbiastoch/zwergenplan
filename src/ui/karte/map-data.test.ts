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
  it("Orte nach Koordinate, in Reihenfolge des Auftretens", () => {
    expect(mapData([fern, nah, nahZwei], [fern, nah, nahZwei], standort).places.map((p) => p.names)).toEqual([
      ["Fern"],
      ["Nah", "Nah zwei"],
    ]);
  });

  it("ohne Startpunkt: Rahmen über die öffentliche Datenbasis, nie über die sichtbaren Orte (Arch-Review B1, m1)", () => {
    const all = mapData([nah], [nah, fern], undefined);
    expect(all.start).toEqual({ bounds: { minLat: 49.4301, minLon: 11.0601, maxLat: 49.4495, maxLon: 11.0892 } });
    // „Alle zeigen“ geht immer auf diesen Rahmen (Plan 0056, N11)
    expect(mapData([nah], [nah, fern], standort).overview).toEqual(all.start);
  });

  it("mit Startpunkt: 2 km um ihn, Standort wie Stadtteil (Plan 0056, E6)", () => {
    expect(mapData([nah], [nah, fern], standort).start).toEqual({ around: standort.point, radiusKm: 2 });
    expect(mapData([nah], [nah, fern], gostenhof).start).toEqual({ around: gostenhof.point, radiusKm: 2 });
  });
});
