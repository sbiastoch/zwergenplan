import { describe, expect, it } from "vitest";
import { DISTRICTS, districtById } from "./districts.ts";
import { inBounds } from "./geo.ts";

describe("DISTRICTS", () => {
  it("hat 35 Stadtteile mit eindeutigen kebab-case-IDs", () => {
    expect(DISTRICTS).toHaveLength(35);
    const ids = DISTRICTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(35);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("liegt komplett in NUERNBERG_BBOX, mit höchstens 3 Nachkommastellen", () => {
    for (const { point } of DISTRICTS) {
      expect(inBounds(point)).toBe(true);
      expect(Math.round(point.lat * 1000) / 1000).toBe(point.lat);
      expect(Math.round(point.lon * 1000) / 1000).toBe(point.lon);
    }
  });

  it("ist nach deutschem Alphabet sortiert", () => {
    const names = DISTRICTS.map((d) => d.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "de")));
  });

  it("trägt die OSM-Koordinaten aus Plan 0004", () => {
    expect(districtById("gostenhof")).toEqual({
      id: "gostenhof",
      name: "Gostenhof",
      point: { lat: 49.448, lon: 11.058 },
    });
    expect(districtById("langwasser")?.point).toEqual({ lat: 49.407, lon: 11.13 });
    expect(districtById("st-johannis")).toEqual({
      id: "st-johannis",
      name: "St. Johannis",
      point: { lat: 49.461, lon: 11.062 },
    });
  });

  it("kennt unbekannte IDs nicht", () => {
    expect(districtById("unbekannt")).toBeUndefined();
    expect(districtById("")).toBeUndefined();
  });
});
