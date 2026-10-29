import { describe, expect, it } from "vitest";
import { mainCategory, nearestHit, originToFeatures, placesToFeatures, providerPlacesToFeatures } from "./geojson.ts";

describe("GeoJSON für die Karte (Plan 0005, E6)", () => {
  const theater = {
    key: "49.4495,11.0601",
    geo: { lat: 49.4495, lon: 11.0601 },
    offers: [{ category: "buehne" as const }, { category: "buehne" as const }],
  };
  const bibliothek = {
    key: "49.4521,11.0767",
    geo: { lat: 49.4521, lon: 11.0767 },
    offers: [{ category: "buecher" as const }],
  };

  it("ein Punkt je Ort, Koordinaten als [lon, lat], Zahl der Angebote", () => {
    expect(placesToFeatures([theater, bibliothek])).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [11.0601, 49.4495] },
          properties: { key: "49.4495,11.0601", angebote: 2, kategorie: "buehne" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [11.0767, 49.4521] },
          properties: { key: "49.4521,11.0767", angebote: 1, kategorie: "buecher" },
        },
      ],
    });
  });

  it("feste Reihenfolge nach key, unabhängig von der Eingabe (Plan 0008, E15: Cluster ohne Einfluss des Startpunkts)", () => {
    const zoo = {
      key: "49.4467,11.1428",
      geo: { lat: 49.4467, lon: 11.1428 },
      offers: [{ category: "natur" as const }],
    };
    const input = [zoo, bibliothek, theater];
    const copy = [...input];
    const sorted = placesToFeatures(input);
    expect(sorted).toEqual(placesToFeatures([theater, zoo, bibliothek]));
    expect(sorted.features.map((f) => f.properties.key)).toEqual([zoo.key, theater.key, bibliothek.key]);
    // Codepunkt-Vergleich, nicht localeCompare: „Z“ vor „a“
    expect(
      placesToFeatures([
        { ...theater, key: "a" },
        { ...theater, key: "Z" },
      ]).features.map((f) => f.properties.key),
    ).toEqual(["Z", "a"]);
    expect(input).toEqual(copy);
  });

  it("leere Liste ergibt eine leere Sammlung", () => {
    expect(placesToFeatures([])).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("Startpunkt als einzelner Punkt, ohne Startpunkt nichts", () => {
    expect(originToFeatures({ source: "karte", point: { lat: 49.452, lon: 11.077 }, label: "Kartenmitte" })).toEqual({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [11.077, 49.452] }, properties: {} }],
    });
    expect(originToFeatures(undefined)).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("beim Tippen gewinnt der nächstgelegene Mittelpunkt", () => {
    const at = { x: 100, y: 100 };
    expect(
      nearestHit(
        [
          { x: 120, y: 100, value: "weit" },
          { x: 95, y: 104, value: "nah" },
          { x: 100, y: 121, value: "mittel" },
        ],
        at,
      ),
    ).toBe("nah");
    expect(nearestHit([], at)).toBeUndefined();
  });
});

describe("Kategorie je Ort (Plan 0024, E5; Plan 0037, E11)", () => {
  it("die häufigste Hauptkategorie unter den Angeboten gewinnt", () => {
    expect(mainCategory([{ category: "wasser" }, { category: "wasser" }, { category: "babykurse" }])).toBe("wasser");
  });

  it("jedes Angebot zählt genau einmal, nur mit seiner Hauptkategorie", () => {
    expect(mainCategory([{ category: "musik" }, { category: "buehne" }, { category: "buehne" }])).toBe("buehne");
  });

  it("Gleichstand: die frühere in CATEGORIES, unabhängig von der Reihenfolge der Angebote", () => {
    const water = { category: "wasser" as const };
    const move = { category: "bewegung" as const };
    expect(mainCategory([water, move])).toBe("bewegung");
    expect(mainCategory([move, water])).toBe("bewegung");
  });

  it("leere Liste: Rückfall treffs-cafes", () => {
    expect(mainCategory([])).toBe("treffs-cafes");
  });
});

describe("GeoJSON der Anbieterkarte (Plan 0055, E5)", () => {
  it("ein Punkt je Ort mit Zahl der Anbieter; blass, wenn keiner dort aktiv ist; nach key sortiert", () => {
    const at = (state: "aktiv" | "ohne-termine", id: string) => ({
      id,
      name: id,
      state,
      shown: state === "aktiv" ? 1 : 0,
    });
    const places = [
      {
        key: "49.5,11.1",
        geo: { lat: 49.5, lon: 11.1 },
        name: "B",
        address: "Weg 2",
        providers: [at("ohne-termine", "x")],
      },
      {
        key: "49.4,11",
        geo: { lat: 49.4, lon: 11 },
        name: "A",
        address: "Weg 1",
        providers: [at("aktiv", "y"), at("ohne-termine", "z")],
      },
    ];
    expect(providerPlacesToFeatures(places).features.map((f) => [f.geometry.coordinates, f.properties])).toEqual([
      [[11, 49.4], { key: "49.4,11", anbieter: 2, blass: false }],
      [[11.1, 49.5], { key: "49.5,11.1", anbieter: 1, blass: true }],
    ]);
  });
});
