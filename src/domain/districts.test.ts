import { describe, expect, it } from "vitest";
import { DISTRICTS, DISTRICTS_BY_REGION, districtById, nearestDistrictLabel } from "./districts.ts";
import { inBounds } from "./geo.ts";
import { REGION_IDS, REGIONS } from "./regions.ts";

describe("DISTRICTS", () => {
  it("hat 35 Nürnberger und 18 Fürther Stadtteile mit eindeutigen kebab-case-IDs (Plan 0036, E6)", () => {
    expect(DISTRICTS_BY_REGION.nuernberg).toHaveLength(35);
    expect(DISTRICTS_BY_REGION.fuerth).toHaveLength(18);
    expect(DISTRICTS).toHaveLength(53);
    const ids = DISTRICTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(53);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const { id } of DISTRICTS_BY_REGION.fuerth) expect(id).toMatch(/^fuerth-/);
  });

  it("hat über alle Regionen eindeutige Namen; allgemeine tragen in Fürth „(Fürth)“ (E6, Review M4)", () => {
    const names = DISTRICTS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    const fuerth = DISTRICTS_BY_REGION.fuerth.map((d) => d.name);
    for (const general of ["Altstadt", "Innenstadt", "Südstadt", "Westvorstadt"])
      expect(fuerth).toContain(`${general} (Fürth)`);
  });

  it("liegt in der bbox der eigenen Region (damit in NUERNBERG_BBOX), mit höchstens 3 Nachkommastellen", () => {
    for (const region of REGION_IDS)
      for (const { point } of DISTRICTS_BY_REGION[region]) {
        expect(inBounds(point, REGIONS[region].bbox)).toBe(true);
        expect(inBounds(point)).toBe(true);
        expect(Math.round(point.lat * 1000) / 1000).toBe(point.lat);
        expect(Math.round(point.lon * 1000) / 1000).toBe(point.lon);
      }
  });

  it("ist je Region nach deutschem Alphabet sortiert", () => {
    for (const region of REGION_IDS) {
      const names = DISTRICTS_BY_REGION[region].map((d) => d.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "de")));
    }
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

describe("nearestDistrictLabel (Nachtrag Plan 0035, 2026-10-11: ermittelten Standort zeigen, offline)", () => {
  it("nennt den nächsten Stadtteil-Punkt; bis 1,5 km ohne Entfernung", () => {
    expect(nearestDistrictLabel({ lat: 49.452, lon: 11.077 })).toBe("nächster Stadtteil: Altstadt");
    expect(nearestDistrictLabel({ lat: 49.448, lon: 11.058 })).toBe("nächster Stadtteil: Gostenhof");
    // Fürth Rathaus (Plan 0036)
    expect(nearestDistrictLabel({ lat: 49.477, lon: 10.989 })).toBe("nächster Stadtteil: Innenstadt (Fürth)");
  });

  it("weiter weg mit gerundeter Luftlinie, damit ein falscher Standort auffällt", () => {
    // Erlangen Hbf, ≈ 5 km vom nächsten Fürther Stadtteil-Punkt
    expect(nearestDistrictLabel({ lat: 49.596, lon: 11.002 })).toMatch(
      /^nächster Stadtteil: [^,]+, ca\. \d+(,\d)? km$/,
    );
    // Berlin
    expect(nearestDistrictLabel({ lat: 52.52, lon: 13.405 })).toMatch(/^nächster Stadtteil: [^,]+, ca\. \d+ km$/);
  });
});
