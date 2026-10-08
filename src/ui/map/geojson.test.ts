import { describe, expect, it } from "vitest";
import { mainCategory, nearestHit, originToFeatures, placesToFeatures } from "./geojson.ts";

describe("GeoJSON für die Karte (Plan 0005, E6)", () => {
  const theater = {
    key: "49.4495,11.0601",
    geo: { lat: 49.4495, lon: 11.0601 },
    offers: [{ topics: ["theater" as const] }, { topics: ["konzert" as const, "musik" as const] }],
  };
  const bibliothek = {
    key: "49.4521,11.0767",
    geo: { lat: 49.4521, lon: 11.0767 },
    offers: [{ topics: ["vorlesen" as const] }],
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
      offers: [{ topics: ["tiere-natur" as const] }],
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

describe("Kategorie je Ort (Plan 0024, E5)", () => {
  it("die häufigste Kategorie unter den Angeboten gewinnt", () => {
    expect(
      mainCategory([{ topics: ["babyschwimmen"] }, { topics: ["kleinkindschwimmen"] }, { topics: ["pekip"] }]),
    ).toBe("wasser");
  });

  it("jede Kategorie eines Angebots zählt, ein Thema mit zwei Kategorien zählt für beide", () => {
    // tanz → bewegung + musik; dazu singen → musik
    expect(mainCategory([{ topics: ["tanz"] }, { topics: ["singen"] }])).toBe("musik");
    // dieselbe Kategorie zweimal in einem Angebot zählt einmal
    expect(mainCategory([{ topics: ["krabbelgruppe", "spielgruppe"] }, { topics: ["bewegung"] }])).toBe(
      "krabbel-spielgruppen",
    );
  });

  it("Gleichstand: die frühere in CATEGORIES, unabhängig von der Reihenfolge der Angebote", () => {
    const water = { topics: ["babyschwimmen" as const] };
    const move = { topics: ["bewegung" as const] };
    expect(mainCategory([water, move])).toBe("bewegung");
    expect(mainCategory([move, water])).toBe("bewegung");
  });

  it("ohne Kategorie (nur Merkmale) der Rückfall wie bei leadCategory", () => {
    expect(mainCategory([{ topics: ["mehrsprachig"] }])).toBe("treffs-cafes");
    expect(mainCategory([])).toBe("treffs-cafes");
  });
});
