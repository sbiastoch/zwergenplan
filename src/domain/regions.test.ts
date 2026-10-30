import { describe, expect, it } from "vitest";
import { type BBox, inBounds, NUERNBERG_BBOX } from "./geo.ts";
import { REGION_IDS, REGIONS, type Region, regionList, territoryStatus } from "./regions.ts";

const corners = ({ minLat, maxLat, minLon, maxLon }: BBox) => [
  { lat: minLat, lon: minLon },
  { lat: minLat, lon: maxLon },
  { lat: maxLat, lon: minLon },
  { lat: maxLat, lon: maxLon },
];
const contains = (outer: BBox, inner: BBox) => corners(inner).every((p) => inBounds(p, outer));

describe("REGIONS (Plan 0031, E1)", () => {
  it("hat für jede ID einen Namen und eine bbox mit min < max", () => {
    expect(REGION_IDS.length).toBeGreaterThan(0);
    for (const id of REGION_IDS) {
      const { bbox, name } = REGIONS[id];
      expect(name.length).toBeGreaterThan(0);
      expect(bbox.minLat).toBeLessThan(bbox.maxLat);
      expect(bbox.minLon).toBeLessThan(bbox.maxLon);
    }
  });

  it("hat für jede ID eine Einwohnerzahl, auf Tausend gerundet (Plan 0033, E5)", () => {
    for (const id of REGION_IDS) {
      const { population } = REGIONS[id];
      expect(population).toBeGreaterThan(0);
      expect(population % 1000).toBe(0);
    }
  });

  it("Nürnberg: Hauptmarkt liegt drin, Düsseldorf nicht", () => {
    const { bbox } = REGIONS.nuernberg;
    expect(inBounds({ lat: 49.4539, lon: 11.0775 }, bbox)).toBe(true);
    expect(inBounds({ lat: 51.2277, lon: 6.7735 }, bbox)).toBe(false);
  });
});

describe("zweite Region (Plan 0036, E1–E3)", () => {
  it("jede Region-bbox liegt in NUERNBERG_BBOX, also gelten Standort- und Fahrplanprüfung für alle (E1)", () => {
    for (const id of REGION_IDS) expect(contains(NUERNBERG_BBOX, REGIONS[id].bbox)).toBe(true);
  });

  it("liegt eine bbox in einer anderen, steht sie in REGION_IDS davor: das Entdecken läuft spezifisch zuerst (E2)", () => {
    REGION_IDS.forEach((a, i) => {
      REGION_IDS.forEach((b, j) => {
        if (a !== b && contains(REGIONS[b].bbox, REGIONS[a].bbox)) expect(i).toBeLessThan(j);
      });
    });
  });

  it("Fürth: Rathaus und die Ecken der Stadtgrenze (OSM, 2026-10-12) liegen drin, der Nürnberger Hauptmarkt nicht", () => {
    const { bbox } = REGIONS.fuerth;
    expect(inBounds({ lat: 49.477, lon: 10.989 }, bbox)).toBe(true);
    expect(contains(bbox, { minLat: 49.436, maxLat: 49.5413, minLon: 10.8932, maxLon: 11.0287 })).toBe(true);
    expect(inBounds({ lat: 49.4539, lon: 11.0775 }, bbox)).toBe(false);
  });

  it("kreis ist ein fünfstelliger Schlüssel, je Region eindeutig (E3)", () => {
    const keys = REGION_IDS.map((id) => REGIONS[id].kreis);
    for (const k of keys) expect(k).toMatch(/^\d{5}$/);
    expect(new Set(keys).size).toBe(keys.length);
    expect(REGIONS.nuernberg.kreis).toBe("09564");
    expect(REGIONS.fuerth.kreis).toBe("09563");
  });

  it("regionList nennt die Namen nach Einwohnern (E8)", () => {
    expect(regionList()).toBe("Nürnberg und Fürth");
    const r = (name: string, population: number): Region => ({ ...REGIONS.fuerth, name, population });
    expect(regionList({ a: r("A", 3000), c: r("C", 1000), b: r("B", 2000) })).toBe("A, B und C");
    expect(regionList({ a: r("A", 3000) })).toBe("A");
  });
});

describe("Gebiet je Region (Plan 0050, S2c)", () => {
  it("jede Region hat ein Label und mindestens eine Gemeinde", () => {
    for (const id of REGION_IDS) {
      expect(REGIONS[id].territory.label).not.toBe("");
      expect(REGIONS[id].territory.municipalities.length).toBeGreaterThan(0);
    }
  });

  it("Nürnberg ist nur die Stadt: Erlangen liegt in der bbox, aber draußen", () => {
    const t = REGIONS.nuernberg.territory;
    expect(territoryStatus(t, { municipality: "Nürnberg" })).toBe("drin");
    expect(territoryStatus(t, { municipality: "Erlangen", county: "Erlangen" })).toBe("draussen");
    expect(territoryStatus(t, { municipality: "Stein", county: "Landkreis Fürth" })).toBe("draussen");
  });

  it("Fürth ist Stadt plus Landkreis, der Kreis zählt auch ohne Gemeinde", () => {
    const t = REGIONS.fuerth.territory;
    expect(territoryStatus(t, { municipality: "Fürth", county: "Fürth" })).toBe("drin");
    expect(territoryStatus(t, { municipality: "Cadolzburg", county: "Landkreis Fürth" })).toBe("drin");
    expect(territoryStatus(t, { municipality: null, county: "Landkreis Fürth" })).toBe("drin");
    expect(territoryStatus(t, { municipality: "Nürnberg" })).toBe("draussen");
  });

  it("ohne Gemeinde und Kreis: unbekannt", () => {
    expect(territoryStatus(REGIONS.nuernberg.territory, {})).toBe("unbekannt");
    expect(territoryStatus(REGIONS.fuerth.territory, { municipality: null })).toBe("unbekannt");
  });
});
