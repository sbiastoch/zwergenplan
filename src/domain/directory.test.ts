import { describe, expect, it } from "vitest";
import {
  findProvider,
  matchesProviderQuery,
  type ProviderRow,
  providerCategories,
  providerOffers,
  providerRows,
} from "./directory.ts";
import { applyFilters, EMPTY_FILTER, type FilterState } from "./filter.ts";
import { airlineReach, type Origin, type Reach } from "./reach.ts";
import { type SiteOffer, type SiteProvider, venueAddress } from "./site-data.ts";
import { FIXTURE_NOW, fixtureSiteOffers, loadFixtures } from "./test-fixtures.ts";

/**
 * Katalog wie in anbieter.json (Plan 0010, E6), aus den Fixtures. Den Turnverein (ohne Angebote) ergänzt Paket A in
 * `tests/fixtures/`; bis dahin kommt er hier dazu, mit denselben Feldern. Danach greift die Bedingung nicht mehr.
 */
const TURNVEREIN: SiteProvider = {
  id: "turnverein-beispiel",
  name: "Turnverein Beispiel (fiktiv)",
  url: "https://example.org/turnverein",
  topics: ["eltern-kind-turnen", "bewegung"],
  venues: [
    { name: "Turnhalle Beispiel", address: "Sportweg 3, 90441 Nürnberg", district: "Schweinau" },
    { name: "Gymnastikraum Beispiel", address: "Am Beispielpark 7, 90480 Nürnberg" },
  ],
};
const fromFixtures: SiteProvider[] = loadFixtures().providers.flatMap((p) =>
  p.role === "anbieter"
    ? [
        {
          id: p.id,
          name: p.name,
          url: p.url,
          topics: p.topics,
          venues: p.venues.map(({ name, address, district }) => ({
            name,
            address: venueAddress(name, address),
            ...(district === undefined ? {} : { district }),
          })),
        },
      ]
    : [],
);
const catalog = fromFixtures.some((p) => p.id === TURNVEREIN.id) ? fromFixtures : [...fromFixtures, TURNVEREIN];

const offers = fixtureSiteOffers();
const upcoming = applyFilters(offers, EMPTY_FILTER, { now: FIXTURE_NOW });
const visibleWith = (state: FilterState) => applyFilters(offers, state, { now: FIXTURE_NOW });
const buecher: FilterState = { ...EMPTY_FILTER, categories: ["buecher"] };

const noReach = () => undefined;
const rows = (overrides: Partial<Parameters<typeof providerRows>[0]> = {}) =>
  providerRows({
    providers: catalog,
    visible: upcoming,
    upcoming,
    reachOf: noReach,
    byReach: false,
    query: "",
    ...overrides,
  });
const ids = (list: readonly ProviderRow[]) => list.map((r) => r.provider.id);

/** dieselbe Definition wie `countProviders` (provider-count.ts, Paket A): verschiedene `providerId` */
const distinctProviders = (list: readonly SiteOffer[]) => new Set(list.map((o) => o.providerId)).size;

const gostenhof: Origin = {
  source: "stadtteil",
  point: { lat: 49.448, lon: 11.058 },
  label: "Gostenhof",
  districtId: "gostenhof",
};

describe("providerRows", () => {
  it("ohne Filter und Startpunkt: aktive alphabetisch, Turnverein ohne Termine am Ende", () => {
    const result = rows();
    expect(ids(result.active)).toEqual([
      "stadtbibliothek-beispiel",
      "gemeinde-beispiel",
      "familientreff-beispiel",
      "theater-beispiel",
      "musikschule-beispiel",
    ]);
    expect(result.active.every((r) => r.state === "aktiv")).toBe(true);
    expect(result.idle.map((r) => [r.provider.id, r.state])).toEqual([["turnverein-beispiel", "ohne-termine"]]);
    expect(result.hiddenCount).toBe(0);
    const treff = result.active.find((r) => r.provider.id === "familientreff-beispiel");
    expect(treff).toMatchObject({ shown: 3, upcoming: 3, places: ["Altstadt"] });
    expect(treff?.nearest).toBeUndefined();
  });

  it("Sticker „Bücher“: nur die Bibliothek aktiv, vier ausgeblendet, Turnverein bleibt", () => {
    const result = rows({ visible: visibleWith(buecher) });
    expect(ids(result.active)).toEqual(["stadtbibliothek-beispiel"]);
    expect(result.hiddenCount).toBe(4);
    expect(ids(result.idle)).toEqual(["turnverein-beispiel"]);
  });

  it("Suche „theater“ bei Sticker „Bücher“: das Theater erscheint blass als ausgeblendet", () => {
    const result = rows({ visible: visibleWith(buecher), query: "theater" });
    expect(result.active).toEqual([]);
    expect(result.idle.map((r) => [r.provider.id, r.state, r.shown, r.upcoming])).toEqual([
      ["theater-beispiel", "ausgeblendet", 0, 2],
    ]);
    expect(result.hiddenCount).toBe(0);
  });

  it("Suche „beispiel“ bei Sticker „Bücher“: erst die vier ausgeblendeten, dann der Turnverein", () => {
    const result = rows({ visible: visibleWith(buecher), query: "beispiel" });
    expect(ids(result.active)).toEqual(["stadtbibliothek-beispiel"]);
    expect(result.idle.map((r) => [r.provider.id, r.state])).toEqual([
      ["gemeinde-beispiel", "ausgeblendet"],
      ["familientreff-beispiel", "ausgeblendet"],
      ["theater-beispiel", "ausgeblendet"],
      ["musikschule-beispiel", "ausgeblendet"],
      ["turnverein-beispiel", "ohne-termine"],
    ]);
  });

  it("Suche filtert auch die Anbieter ohne Termine", () => {
    expect(ids(rows({ query: "turnverein" }).idle)).toEqual(["turnverein-beispiel"]);
    const none = rows({ query: "xyz" });
    expect([none.active, none.idle, none.hiddenCount]).toEqual([[], [], 0]);
  });

  it("Stadtteile: aktiv aus den sichtbaren Angeboten, blass aus dem Katalog (district ?? Name)", () => {
    const result = rows({ visible: visibleWith(buecher), query: "beispiel" });
    expect(result.active[0]?.places).toEqual(["Altstadt"]);
    expect(result.idle.at(-1)?.places).toEqual(["Schweinau", "Gymnastikraum Beispiel"]);
  });

  it("Luftlinie ab Gostenhof: nach dem nächsten Ort sortiert, Turnverein weiter am Ende", () => {
    const reach = airlineReach(gostenhof);
    const result = rows({ reachOf: (o) => reach(o.venue), byReach: true });
    expect(ids(result.active)).toEqual([
      "theater-beispiel",
      "familientreff-beispiel",
      "stadtbibliothek-beispiel",
      "musikschule-beispiel",
      "gemeinde-beispiel",
    ]);
    const meters = result.active.map((r) => (r.nearest?.kind === "luftlinie" ? Math.round(r.nearest.meters) : 0));
    expect(meters).toEqual([226, 1427, 1689, 2358, 3008]);
    expect(ids(result.idle)).toEqual(["turnverein-beispiel"]);
  });

  it("Wegzeit: Gleichstand und Infinity gegen Infinity alphabetisch, Unerreichbare am Ende der aktiven", () => {
    const minutes: Record<string, number> = {
      "gemeinde-beispiel-gemeindehaus": 12,
      "theater-beispiel-buehne": 18,
      "stadtbibliothek-beispiel-zentrum": 18,
      "familientreff-beispiel-haus": Number.POSITIVE_INFINITY,
      "musikschule-beispiel-sued": Number.POSITIVE_INFINITY,
    };
    const reachOf = (o: SiteOffer): Reach => ({
      kind: "oepnv",
      minutes: minutes[o.venueId] ?? Number.NaN,
      byFoot: false,
    });
    const result = rows({ reachOf, byReach: true });
    expect(ids(result.active)).toEqual([
      "gemeinde-beispiel",
      "stadtbibliothek-beispiel",
      "theater-beispiel",
      "familientreff-beispiel",
      "musikschule-beispiel",
    ]);
    expect(ids(result.idle)).toEqual(["turnverein-beispiel"]);
  });

  it("byReach: Anbieter ohne Wert stehen hinter denen mit Wert, untereinander alphabetisch", () => {
    const reach = airlineReach(gostenhof);
    const reachOf = (o: SiteOffer) => (o.providerId === "theater-beispiel" ? reach(o.venue) : undefined);
    expect(ids(rows({ reachOf, byReach: true }).active)).toEqual([
      "theater-beispiel",
      "stadtbibliothek-beispiel",
      "gemeinde-beispiel",
      "familientreff-beispiel",
      "musikschule-beispiel",
    ]);
  });

  it("ohne byReach bleibt es alphabetisch, auch wenn reachOf Werte liefert", () => {
    const reach = airlineReach(gostenhof);
    const result = rows({ reachOf: (o) => reach(o.venue) });
    expect(ids(result.active)[0]).toBe("stadtbibliothek-beispiel");
    expect(result.active[0]?.nearest?.kind).toBe("luftlinie");
  });

  it("„1 von 3“: shown zählt die sichtbaren, upcoming alle kommenden", () => {
    const babykurse: FilterState = { ...EMPTY_FILTER, categories: ["babykurse"] };
    const treff = rows({ visible: visibleWith(babykurse) }).active.find(
      (r) => r.provider.id === "familientreff-beispiel",
    );
    expect(treff).toMatchObject({ shown: 2, upcoming: 3, state: "aktiv" });
  });

  it("Rückfall (M4): fehlt ein Anbieter im Katalog, entsteht seine Zeile aus den Angeboten, ohne Website", () => {
    const result = rows({ providers: catalog.filter((p) => p.id !== "theater-beispiel") });
    const theater = result.active.find((r) => r.provider.id === "theater-beispiel");
    expect(theater?.provider).toEqual({
      id: "theater-beispiel",
      name: "Kleines Theater Beispiel (fiktiv)",
      topics: ["theater", "konzert", "musik"],
      venues: [{ name: "Kleines Theater Beispiel", address: "Bühnenplatz 2, 90429 Nürnberg", district: "Gostenhof" }],
    });
    expect(theater?.provider.url).toBeUndefined();
    expect(theater).toMatchObject({ shown: 2, upcoming: 2, places: ["Gostenhof"] });
  });

  it("Invariante: active.length === Anzahl verschiedener Anbieter in visible", () => {
    const cases: Array<[SiteProvider[], SiteOffer[]]> = [
      [catalog, upcoming],
      [catalog, visibleWith(buecher)],
      [catalog.filter((p) => p.id !== "theater-beispiel"), upcoming],
      [[], visibleWith({ ...EMPTY_FILTER, categories: ["musik"] })],
    ];
    for (const [providers, visible] of cases) {
      expect(rows({ providers, visible }).active).toHaveLength(distinctProviders(visible));
    }
  });

  it("Umlaute sortieren nach deutscher Regel („Ärztehaus“ zwischen A und B)", () => {
    const named = (id: string, name: string): SiteProvider => ({
      id,
      name,
      url: "https://example.org",
      topics: [],
      venues: [],
    });
    const result = providerRows({
      providers: [named("b", "Bücherei"), named("ae", "Ärztehaus Beispiel"), named("a", "Apotheke")],
      visible: [],
      upcoming: [],
      reachOf: noReach,
      byReach: false,
      query: "",
    });
    expect(result.idle.map((r) => r.provider.name)).toEqual(["Apotheke", "Ärztehaus Beispiel", "Bücherei"]);
  });

  it("ein Anbieter steht nur einmal, auch wenn der Katalog ihn doppelt nennt", () => {
    const first = catalog[0];
    if (!first) throw new Error("Katalog leer");
    expect(rows({ providers: [first, first] }).active.filter((r) => r.provider.id === first.id)).toHaveLength(1);
  });
});

describe("providerOffers", () => {
  it("liefert nur die kommenden Angebote des Anbieters", () => {
    const own = providerOffers(offers, "familientreff-beispiel", FIXTURE_NOW);
    expect(own).toHaveLength(3);
    expect(own.every((o) => o.providerId === "familientreff-beispiel")).toBe(true);
    expect(own.map((o) => o.title)).not.toContain("Elterncafé am Montag");
    expect(providerOffers(offers, "turnverein-beispiel", FIXTURE_NOW)).toEqual([]);
  });
});

describe("providerCategories", () => {
  it("vereinigt Katalog-Themen und Themen der Angebote (Theater: Musik & Singen, Bühne & Konzert)", () => {
    const theater = catalog.find((p) => p.id === "theater-beispiel");
    if (!theater) throw new Error("Theater fehlt");
    const own = providerOffers(offers, theater.id, FIXTURE_NOW);
    expect(providerCategories(theater, own)).toEqual(["musik", "buehne"]);
    expect(providerCategories(theater, [])).toEqual(["buehne"]);
  });

  it("zählt nur Angebote dieses Anbieters", () => {
    expect(providerCategories(TURNVEREIN, upcoming)).toEqual(["bewegung"]);
  });
});

describe("findProvider", () => {
  it("findet den Katalog-Eintrag, sonst den Rückfall aus den Angeboten, sonst nichts", () => {
    expect(findProvider(catalog, offers, "turnverein-beispiel")?.url).toBe(TURNVEREIN.url);
    const fallback = findProvider([], offers, "familientreff-beispiel");
    expect(fallback).toMatchObject({ name: "Familientreff Beispielhof (fiktiv)" });
    expect(fallback?.url).toBeUndefined();
    expect(fallback?.venues).toHaveLength(1);
    expect(findProvider(catalog, offers, "gibt-es-nicht")).toBeUndefined();
  });
});

describe("matchesProviderQuery", () => {
  it("ignoriert Groß- und Kleinschreibung", () => {
    expect(matchesProviderQuery("Bibliothek Beispiel", "BIBLIOTHEK")).toBe(true);
  });

  it("faltet Umlaute beidseitig: nurnberg, nuernberg und Nürnberg treffen Nürnberg", () => {
    for (const query of ["nurnberg", "nuernberg", "Nürnberg"]) {
      expect(matchesProviderQuery("Stadtbibliothek Nürnberg", query)).toBe(true);
    }
    expect(matchesProviderQuery("Familienzentrum Nuernberg", "nürnberg")).toBe(true);
  });

  it("faltet ß zu ss", () => {
    expect(matchesProviderQuery("Kinderhaus Straße", "strasse")).toBe(true);
    expect(matchesProviderQuery("Kinderhaus Strasse", "straße")).toBe(true);
  });

  it("ein echtes „ue“ findet sich selbst (Steuer)", () => {
    expect(matchesProviderQuery("Steuer-Beratung", "steuer")).toBe(true);
  });

  it("mehrere Teile in beliebiger Reihenfolge, jeder muss vorkommen", () => {
    expect(matchesProviderQuery("Kleines Theater Beispiel", "beispiel  theater")).toBe(true);
    expect(matchesProviderQuery("Kleines Theater Beispiel", "theater musik")).toBe(false);
  });

  it("Leerstring trifft alles, „xyz“ nichts", () => {
    expect(matchesProviderQuery("Bibliothek", "")).toBe(true);
    expect(matchesProviderQuery("Bibliothek", "   ")).toBe(true);
    expect(matchesProviderQuery("Bibliothek", "xyz")).toBe(false);
  });
});
