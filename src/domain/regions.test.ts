import { describe, expect, it } from "vitest";
import { type BBox, inBounds, NUERNBERG_BBOX } from "./geo.ts";
import {
  NETWORK_IDS,
  NETWORKS,
  networkAt,
  networkOf,
  REGION_IDS,
  REGIONS,
  type Region,
  regionAt,
  regionList,
  regionsOf,
  VRR_BBOX,
} from "./regions.ts";

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
    expect(REGIONS.duesseldorf.kreis).toBe("05111");
  });

  it("regionList nennt die Namen nach Einwohnern (E8)", () => {
    expect(regionList()).toBe("Düsseldorf, Nürnberg und Fürth");
    const r = (name: string, population: number): Region => ({ ...REGIONS.fuerth, name, population });
    expect(regionList({ a: r("A", 3000), c: r("C", 1000), b: r("B", 2000) })).toBe("A, B und C");
    expect(regionList({ a: r("A", 3000) })).toBe("A");
  });
});

const overlaps = (a: BBox, b: BBox) =>
  a.minLat <= b.maxLat && b.minLat <= a.maxLat && a.minLon <= b.maxLon && b.minLon <= a.maxLon;

describe("Netze (Plan 0039, E1/E2)", () => {
  it("jede Region-bbox liegt in der bbox ihres Netzes (ersetzt ADR 0029, Punkt 1)", () => {
    for (const id of REGION_IDS) expect(contains(NETWORKS[networkOf(id)].bbox, REGIONS[id].bbox)).toBe(true);
  });

  it("die Netz-bboxen überlappen nicht", () => {
    NETWORK_IDS.forEach((a, i) => {
      NETWORK_IDS.slice(i + 1).forEach((b) => {
        expect(overlaps(NETWORKS[a].bbox, NETWORKS[b].bbox)).toBe(false);
      });
    });
  });

  it("vgn ist der Großraum Nürnberg mit bayerischen Ferien, vrr Düsseldorf mit denen aus NRW", () => {
    expect(NETWORKS.vgn).toMatchObject({ area: "des Großraums Nürnberg", bbox: NUERNBERG_BBOX, holidays: "DE-BY" });
    expect(NETWORKS.vrr).toMatchObject({ area: "von Düsseldorf", bbox: VRR_BBOX, holidays: "DE-NW" });
    for (const id of NETWORK_IDS) expect(inBounds(NETWORKS[id].home, NETWORKS[id].bbox)).toBe(true);
  });

  it("regionsOf: Regionen eines Netzes in der Reihenfolge von REGION_IDS", () => {
    expect(regionsOf("vgn")).toEqual(["fuerth", "nuernberg"]);
    expect(regionsOf("vrr")).toEqual(["duesseldorf"]);
    expect(NETWORK_IDS.flatMap((n) => regionsOf(n)).sort()).toEqual([...REGION_IDS].sort());
  });

  it("regionList über die Regionen eines Netzes", () => {
    expect(regionList("vgn")).toBe("Nürnberg und Fürth");
    expect(regionList("vrr")).toBe("Düsseldorf");
  });

  it("networkAt: Hauptmarkt Nürnberg → vgn, Rathaus Düsseldorf → vrr, Kölner Dom → keins", () => {
    expect(networkAt({ lat: 49.454, lon: 11.077 })).toBe("vgn");
    expect(networkAt({ lat: 51.226, lon: 6.773 })).toBe("vrr");
    expect(networkAt({ lat: 50.941, lon: 6.958 })).toBeUndefined();
  });

  it("Düsseldorf: Rathaus und die Ecken der Stadtgrenze (OSM-Relation 62539, 2026-10-18) liegen drin, Köln-Chorweiler nicht (E2)", () => {
    const { bbox, network, population, municipality } = REGIONS.duesseldorf;
    expect(network).toBe("vrr");
    expect(population).toBe(619_000);
    expect(municipality).toBe("Düsseldorf");
    expect(inBounds({ lat: 51.226, lon: 6.773 }, bbox)).toBe(true);
    expect(contains(bbox, { minLat: 51.1244, maxLat: 51.3525, minLon: 6.6888, maxLon: 6.9399 })).toBe(true);
    const chorweiler = { lat: 51.02, lon: 6.9 };
    expect(inBounds(chorweiler, bbox)).toBe(false);
    expect(inBounds(chorweiler, VRR_BBOX)).toBe(false);
  });

  it("regionAt: die spezifischste Region am Punkt (Fürth vor Nürnberg), sonst keine (Plan 0039, E8)", () => {
    expect(regionAt({ lat: 49.477, lon: 10.989 })).toBe("fuerth");
    expect(regionAt({ lat: 49.454, lon: 11.077 })).toBe("nuernberg");
    expect(regionAt({ lat: 51.226, lon: 6.773 })).toBe("duesseldorf");
    expect(regionAt({ lat: 50.941, lon: 6.958 })).toBeUndefined();
  });

  it("Nürnberg und Fürth prüfen keine Gemeinde (Stadt plus Nachbarorte, E2)", () => {
    expect(REGIONS.nuernberg.municipality).toBeUndefined();
    expect(REGIONS.fuerth.municipality).toBeUndefined();
  });
});
