import { describe, expect, it } from "vitest";
import type { GeoPoint } from "./geo.ts";
import { placeKey } from "./place-key.ts";
import { offersInBounds, placesOf } from "./places.ts";
import { fixtureSiteOffers } from "./test-fixtures.ts";

interface TestOffer {
  id: string;
  venue: { name: string; address: string; district?: string; geo: GeoPoint };
}

const HAUS = { lat: 49.4495, lon: 11.0601 };
const offer = (id: string, name: string, geo: GeoPoint, district?: string): TestOffer => ({
  id,
  venue: { name, address: `${name}, Teststraße 1`, geo, ...(district === undefined ? {} : { district }) },
});

describe("placeKey", () => {
  it("ist die Koordinate als „lat,lon“", () => {
    expect(placeKey({ lat: 49.4495, lon: 11.0601 })).toBe("49.4495,11.0601");
  });
});

describe("placesOf", () => {
  it("bündelt zwei Anbieter mit gleicher Koordinate zu einem Ort mit beiden Namen", () => {
    const a = offer("a", "Familienzentrum", HAUS, "Gostenhof");
    const b = offer("b", "Musikschule im Haus", HAUS);
    const c = offer("c", "Familienzentrum", HAUS);
    const [place, ...rest] = placesOf([a, b, c]);
    expect(rest).toEqual([]);
    expect(place).toEqual({
      key: "49.4495,11.0601",
      geo: HAUS,
      names: ["Familienzentrum", "Musikschule im Haus"],
      district: "Gostenhof",
      address: "Familienzentrum, Teststraße 1",
      offers: [a, b, c],
    });
  });

  it("macht aus gleichem Namen an zwei Koordinaten zwei Orte, in Reihenfolge des Auftretens", () => {
    const places = placesOf([
      offer("a", "Stadtbibliothek", { lat: 49.45, lon: 11.08 }),
      offer("b", "Stadtbibliothek", { lat: 49.41, lon: 11.12 }),
      offer("c", "Stadtbibliothek", { lat: 49.45, lon: 11.08 }),
    ]);
    expect(places.map((p) => [p.key, p.offers.map((o) => o.id)])).toEqual([
      ["49.45,11.08", ["a", "c"]],
      ["49.41,11.12", ["b"]],
    ]);
    expect(places.every((p) => p.district === undefined && !("district" in p))).toBe(true);
  });

  it("ist für keine Angebote leer", () => {
    expect(placesOf([])).toEqual([]);
  });

  it("findet in den Fixtures 5 Orte, Familientreff Beispielhof mit 4 Angeboten", () => {
    const places = placesOf(fixtureSiteOffers());
    expect(places).toHaveLength(5);
    const counts = Object.fromEntries(places.map((p) => [p.names.join(" / "), p.offers.length]));
    expect(counts["Familientreff Beispielhof"]).toBe(4);
    expect(Object.values(counts).sort()).toEqual([1, 1, 1, 2, 4]);
  });
});

describe("offersInBounds (Plan 0056, E5)", () => {
  const at = (id: string, lat: number, lon: number): TestOffer => ({
    id,
    venue: { name: id, address: "", geo: { lat, lon } },
  });
  const offers = [at("innen", 49.45, 11.07), at("rand", 49.5, 11.1), at("aussen", 49.6, 11.07)];

  it("liefert die Schlüssel der Orte im Ausschnitt, Ränder zählen mit", () => {
    const keys = offersInBounds(offers, { west: 11, south: 49.4, east: 11.1, north: 49.5 });
    expect(keys).toEqual(new Set([placeKey({ lat: 49.45, lon: 11.07 }), placeKey({ lat: 49.5, lon: 11.1 })]));
  });

  it("ein leerer Ausschnitt liefert nichts", () => {
    expect(offersInBounds(offers, { west: 10, south: 48, east: 10.1, north: 48.1 }).size).toBe(0);
  });
});
