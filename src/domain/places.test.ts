import { describe, expect, it } from "vitest";
import type { GeoPoint } from "./geo.ts";
import { placeKey, placesOf, sortPlaces } from "./places.ts";
import type { Origin } from "./reach.ts";
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

const gostenhof: Origin = {
  source: "stadtteil",
  point: { lat: 49.448, lon: 11.058 },
  label: "Gostenhof",
  districtId: "gostenhof",
};

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

describe("sortPlaces", () => {
  const near = offer("near", "Zwergenhaus", { lat: 49.4495, lon: 11.0601 });
  const middle = offer("middle", "Bärenhöhle", { lat: 49.46, lon: 11.07 });
  const far = offer("far", "Ameisenbau", { lat: 49.407, lon: 11.13 });

  it("sortiert mit Startpunkt nach Entfernung", () => {
    const places = placesOf([far, near, middle]);
    expect(sortPlaces(places, gostenhof).map((p) => p.names[0])).toEqual(["Zwergenhaus", "Bärenhöhle", "Ameisenbau"]);
  });

  it("sortiert ohne Startpunkt nach Name, deutsch: „Ö“ steht bei „O“, nicht hinter „Z“", () => {
    const places = placesOf([
      offer("1", "Zoo", { lat: 49.41, lon: 11.1 }),
      offer("2", "Öhrl", { lat: 49.42, lon: 11.1 }),
      offer("3", "Ozelot", { lat: 49.43, lon: 11.1 }),
      offer("4", "Ohm", { lat: 49.44, lon: 11.1 }),
      offer("5", "Ofen", { lat: 49.45, lon: 11.1 }),
      offer("6", "Öfen", { lat: 49.46, lon: 11.1 }),
    ]);
    expect(sortPlaces(places).map((p) => p.names[0])).toEqual(["Ofen", "Öfen", "Ohm", "Öhrl", "Ozelot", "Zoo"]);
  });

  it("sortiert bei gleicher Entfernung nach Name", () => {
    // gleiche Breite, gleicher Längenabstand nach Ost und West → exakt gleiche Luftlinie
    const origin: Origin = { ...gostenhof, point: { lat: 49.45, lon: 11.07 } };
    const places = placesOf([
      offer("o", "Ost", { lat: 49.45, lon: 11.08 }),
      offer("w", "Ost-West", { lat: 49.45, lon: 11.06 }),
      offer("a", "Am Rand", { lat: 49.5, lon: 11.07 }),
    ]);
    expect(sortPlaces(places, origin).map((p) => p.names[0])).toEqual(["Ost", "Ost-West", "Am Rand"]);
    const reversed = placesOf([
      offer("w", "Ost-West", { lat: 49.45, lon: 11.06 }),
      offer("o", "Ost", { lat: 49.45, lon: 11.08 }),
    ]);
    expect(sortPlaces(reversed, origin).map((p) => p.names[0])).toEqual(["Ost", "Ost-West"]);
  });

  it("verändert die Eingabe nicht", () => {
    const places = placesOf([far, near]);
    const before = places.map((p) => p.key);
    sortPlaces(places, gostenhof);
    sortPlaces(places);
    expect(places.map((p) => p.key)).toEqual(before);
  });
});
