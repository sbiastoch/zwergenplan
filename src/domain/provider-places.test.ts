import { describe, expect, it } from "vitest";
import { applyFilters, EMPTY_FILTER, type FilterState } from "./filter.ts";
import { placeKey } from "./place-key.ts";
import {
  mapUpcoming,
  placeProviderLine,
  providerCamera,
  providerGeometry,
  providerPlaces,
  providersInBounds,
  providersWithPlace,
} from "./provider-places.ts";
import { type SiteProvider, toProviderDirectory } from "./site-data.ts";
import { FIXTURE_NOW, fixtureSiteOffers, loadFixtures, fixturePublicId as pid } from "./test-fixtures.ts";

const catalog = toProviderDirectory(loadFixtures().providers, FIXTURE_NOW.toISOString()).providers;
const offers = fixtureSiteOffers();
const upcoming = mapUpcoming(offers, FIXTURE_NOW);
const visibleWith = (state: FilterState) => applyFilters(offers, state, { now: FIXTURE_NOW });
const buecher: FilterState = { ...EMPTY_FILTER, categories: ["buecher"] };

const TREFF_GEO = { lat: 49.4521, lon: 11.0767 };
/** ein zweiter Anbieter am Ort des Familientreffs, ohne Angebote (wie die Route in anbieter-karte.spec.ts) */
const NACHBAR: SiteProvider = {
  id: "nachbar1",
  name: "Nachbarhaus (fiktiv)",
  url: "https://example.org/nachbar",
  venues: [{ name: "Nachbarhaus", address: "Beispielstraße 1, 90402 Nürnberg", district: "Altstadt", geo: TREFF_GEO }],
};

describe("providerGeometry", () => {
  it("nimmt alle Orte aller Katalog-Anbieter, auch ohne Termine", () => {
    const geometry = providerGeometry({ providers: catalog, upcoming });
    expect(geometry.points).toHaveLength(7);
    expect(providersWithPlace(geometry)).toEqual(new Set(catalog.map((p) => p.id)));
  });

  it("überspringt Orte ohne gültiges geo, etwa aus einem älteren anbieter.json (E1)", () => {
    // so, wie ein altes anbieter.json ohne geo ankommt: ungeprüftes JSON
    const old: SiteProvider[] = JSON.parse(JSON.stringify(catalog, (k, v) => (k === "geo" ? undefined : v)));
    const geometry = providerGeometry({ providers: old, upcoming: [] });
    expect(geometry.points).toEqual([]);
    expect(providersWithPlace(geometry).size).toBe(0);
    expect(providerPlaces({ providers: old, upcoming: [], visible: [] })).toEqual([]);
  });

  it("Rückfall-Anbieter ohne Katalog-Eintrag bekommt die Orte seiner Angebote (Review B1)", () => {
    const treff = pid("familientreff-beispiel");
    const providers = catalog.filter((p) => p.id !== treff);
    const geometry = providerGeometry({ providers, upcoming });
    expect(geometry.points.filter((p) => p.id === treff)).toEqual([
      { id: treff, key: placeKey(TREFF_GEO), geo: TREFF_GEO },
    ]);
    const places = providerPlaces({ providers, upcoming, visible: upcoming });
    const place = places.find((p) => p.key === placeKey(TREFF_GEO));
    expect(place?.providers).toEqual([
      { id: treff, name: "Familientreff Beispielhof (fiktiv)", state: "aktiv", shown: 3 },
    ]);
    expect(place?.name).toBe("Familientreff Beispielhof");
    expect(place?.address).toBe("Beispielstraße 1, 90402 Nürnberg");
  });
});

describe("providersInBounds", () => {
  const geometry = providerGeometry({ providers: catalog, upcoming });

  it("zählt Orte auf dem Rand mit", () => {
    const edge = { west: TREFF_GEO.lon, south: TREFF_GEO.lat, east: TREFF_GEO.lon, north: TREFF_GEO.lat };
    expect(providersInBounds(geometry, edge)).toEqual(new Set([pid("familientreff-beispiel")]));
  });

  it("ein Anbieter mit einem von zwei Orten im Ausschnitt ist drin", () => {
    // nur der Gymnastikraum (Osten) des Turnvereins
    const east = { west: 11.12, south: 49.44, east: 11.14, north: 49.46 };
    expect(providersInBounds(geometry, east)).toEqual(new Set([pid("turnverein-beispiel")]));
  });

  it("leerer Ausschnitt: niemand", () => {
    expect(providersInBounds(geometry, { west: 10, south: 48, east: 10.1, north: 48.1 }).size).toBe(0);
  });
});

describe("providerCamera", () => {
  it("rahmt alle Orte, auch die ohne Termine, unabhängig von Filtern und Alter (ADR 0008, B1)", () => {
    const camera = providerCamera(providerGeometry({ providers: catalog, upcoming }));
    expect(camera).toEqual({ bounds: { minLat: 49.4301, minLon: 11.0442, maxLat: 49.4521, maxLon: 11.1301 } });
  });

  it("ohne Orte: Hauptmarkt", () => {
    expect(providerCamera({ points: [] })).toEqual({ center: { lat: 49.454, lon: 11.077 }, zoom: 11 });
  });
});

describe("providerPlaces", () => {
  it("ohne Filter: jeder Katalog-Ort ein Marker, nur der Turnverein blass", () => {
    const places = providerPlaces({ providers: catalog, upcoming, visible: upcoming });
    expect(places).toHaveLength(7);
    expect(places.map((p) => p.key)).toEqual([...places.map((p) => p.key)].sort());
    const pale = places.filter((p) => p.providers.every((a) => a.state === "ohne-termine"));
    expect(pale.map((p) => p.name).sort()).toEqual(["Gymnastikraum Beispiel", "Turnhalle Beispiel"]);
    expect(pale.find((p) => p.name === "Turnhalle Beispiel")?.district).toBe("Schweinau");
  });

  it("Sticker „Bücher“: ausgeblendete fehlen, die ohne Termine bleiben blass", () => {
    const places = providerPlaces({ providers: catalog, upcoming, visible: visibleWith(buecher) });
    expect(places.flatMap((p) => p.providers.map((a) => [a.id, a.state]))).toEqual(
      expect.arrayContaining([
        [pid("stadtbibliothek-beispiel"), "aktiv"],
        [pid("turnverein-beispiel"), "ohne-termine"],
      ]),
    );
    expect(places).toHaveLength(3);
  });

  it("bündelt zwei Anbieter an einer Koordinate, erst aktiv, dann ohne Termine", () => {
    const places = providerPlaces({ providers: [...catalog, NACHBAR], upcoming, visible: upcoming });
    const place = places.find((p) => p.key === placeKey(TREFF_GEO));
    expect(place?.providers.map((a) => [a.id, a.state])).toEqual([
      [pid("familientreff-beispiel"), "aktiv"],
      ["nachbar1", "ohne-termine"],
    ]);
    // Name des Orts: der erste Katalog-Ort in Namensreihenfolge
    expect(place?.name).toBe("Familientreff Beispielhof");
    expect(places).toHaveLength(7);
  });

  it("ein Anbieter mit nur einem laufenden Kurs ist blass, wie in der Liste (N3)", () => {
    const treff = pid("familientreff-beispiel");
    const own = offers.filter((o) => o.providerId === treff);
    const first = own[0];
    if (!first) throw new Error("Fixture ohne Familientreff");
    const running = {
      ...first,
      format: "kurs" as const,
      registration: "mit-anmeldung" as const,
      sessions: [
        { ...first.sessions[0], start: "2026-09-01T10:00:00+02:00", end: "2026-09-01T11:00:00+02:00" },
        { ...first.sessions[0], start: "2026-11-01T10:00:00+01:00", end: "2026-11-01T11:00:00+01:00" },
      ],
    };
    const rest = [...offers.filter((o) => o.providerId !== treff), running];
    const mapped = mapUpcoming(rest, FIXTURE_NOW);
    expect(mapped.some((o) => o.providerId === treff)).toBe(false);
    const places = providerPlaces({ providers: catalog, upcoming: mapped, visible: mapped });
    expect(places.find((p) => p.key === placeKey(TREFF_GEO))?.providers).toEqual([
      { id: treff, name: "Familientreff Beispielhof (fiktiv)", state: "ohne-termine", shown: 0 },
    ]);
  });
});

describe("placeProviderLine", () => {
  it("Zahl der sichtbaren Angebote, ohne Termine eigener Text", () => {
    expect(placeProviderLine({ id: "a", name: "A", state: "aktiv", shown: 1 })).toBe("1 Angebot");
    expect(placeProviderLine({ id: "a", name: "A", state: "aktiv", shown: 4 })).toBe("4 Angebote");
    expect(placeProviderLine({ id: "a", name: "A", state: "ohne-termine", shown: 0 })).toBe("Gerade keine Termine");
  });
});
