import { describe, expect, it } from "vitest";
import { districtById } from "./districts.ts";
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTER,
  type FilterState,
  filterFromSearch,
  filterToSearch,
  matchesFilter,
  toggleIn,
  withReachLimit,
} from "./filter.ts";
import { placeKey } from "./place-key.ts";
import { airlineReach, type Origin, type ReachFn } from "./reach.ts";
import { FIXTURE_NOW, fixtureKey, fixtureSiteOffers } from "./test-fixtures.ts";

const offers = fixtureSiteOffers();
const ids = (state: FilterState) => applyFilters(offers, state, { now: FIXTURE_NOW }).map(fixtureKey);

const gostenhofDistrict = districtById("gostenhof");
if (!gostenhofDistrict) throw new Error("Stadtteil gostenhof fehlt");
const gostenhof: Origin = {
  source: "stadtteil",
  point: gostenhofDistrict.point,
  label: gostenhofDistrict.name,
  districtId: gostenhofDistrict.id,
};

/**
 * Wegzeit ab Gostenhof wie aus der Fixture-Tabelle (`tests/fixtures/oepnv`, nachgerechnet in transit.test.ts):
 * Theater 3,6, Beispielhof 13,6, Bibliothek 15,6, Musikschule 29,6, Gemeinde 32,6 Min.
 */
const MINUTES: Record<string, number> = {
  "theater-beispiel-buehne": 3.6,
  "familientreff-beispiel-haus": 13.6,
  "stadtbibliothek-beispiel-zentrum": 15.6,
  "musikschule-beispiel-sued": 29.6,
  "gemeinde-beispiel-gemeindehaus": 32.6,
};
const byPlace = new Map(offers.map((o) => [placeKey(o.venue.geo), MINUTES[o.venueId] ?? Number.NaN]));
const wegzeitAbGostenhof: ReachFn = ({ geo }) => ({
  kind: "oepnv",
  minutes: byPlace.get(placeKey(geo)) ?? Number.NaN,
  byFoot: false,
});
const within20 = { ...EMPTY_FILTER, reachLimit: { kind: "minuten", value: 20 } } satisfies FilterState;

describe("URL-Zustand", () => {
  it("überlebt den Roundtrip verlustfrei und kanonisch", () => {
    const state: FilterState = {
      categories: ["musik", "babykurse"],
      formats: ["einmalig", "kurs"],
      registration: ["ohne-anmeldung"],
      cost: ["kostenlos"],
    };
    const search = filterToSearch(state);
    expect(search).toBe("kat=babykurse,musik&format=kurs,einmalig&anmeldung=ohne-anmeldung&kosten=kostenlos");
    expect(filterFromSearch(`?${search}`)).toEqual({
      categories: ["babykurse", "musik"],
      formats: ["kurs", "einmalig"],
      registration: ["ohne-anmeldung"],
      cost: ["kostenlos"],
    });
  });

  it("ist leer ohne Filter und verwirft Unbekanntes", () => {
    expect(filterToSearch(EMPTY_FILTER)).toBe("");
    expect(filterFromSearch("?kat=quatsch,musik&format=&geb=2026-01-01")).toEqual({
      ...EMPTY_FILTER,
      categories: ["musik"],
    });
  });

  it("liest die Wegzeit und schreibt sie kanonisch nach den Kosten (Plan 0009, E8)", () => {
    const state: FilterState = { ...EMPTY_FILTER, cost: ["kostenlos"], reachLimit: { kind: "minuten", value: 30 } };
    const search = filterToSearch(state);
    expect(search).toBe("kosten=kostenlos&wegzeit=30");
    expect(filterFromSearch(`?wegzeit=30&kosten=kostenlos`)).toEqual(state);
    for (const value of [20, 45] as const) {
      expect(filterFromSearch(`?wegzeit=${value}`).reachLimit).toEqual({ kind: "minuten", value });
    }
  });

  it.each(["15", "abc", "-20", "", "020", "20.0", "20,30", "60"])("verwirft die Wegzeit „%s“", (raw) => {
    const state = filterFromSearch(`?wegzeit=${raw}`);
    expect(state).toEqual(EMPTY_FILTER);
    expect("reachLimit" in state).toBe(false);
  });

  it.each(["2", "5", "10"])("liest den alten Umkreis umkreis=%s nicht mehr (E8)", (raw) => {
    const state = filterFromSearch(`?umkreis=${raw}&kosten=kostenlos`);
    expect(state).toEqual({ ...EMPTY_FILTER, cost: ["kostenlos"] });
    expect(filterToSearch(state)).toBe("kosten=kostenlos");
  });

  it("hat ohne Grenze keinen Parameter wegzeit", () => {
    expect(filterToSearch({ ...EMPTY_FILTER, formats: ["kurs"] })).toBe("format=kurs");
    expect("reachLimit" in EMPTY_FILTER).toBe(false);
  });
});

describe("applyFilters", () => {
  it("blendet Vergangenes aus", () => {
    expect(ids(EMPTY_FILTER)).not.toContain("vergangen");
    expect(ids(EMPTY_FILTER)).toHaveLength(offers.length - 1);
  });

  it("verknüpft innerhalb einer Dimension mit ODER, zwischen Dimensionen mit UND", () => {
    expect(ids({ ...EMPTY_FILTER, formats: ["kurs", "einmalig"], cost: ["kostenlos"] })).toEqual([
      "babykonzert-advent",
    ]);
    expect(ids({ ...EMPTY_FILTER, categories: ["buecher", "buehne"] })).toEqual([
      "krabbelreime",
      "kuckuck-im-nest",
      "babykonzert-advent",
    ]);
  });

  it("filtert nach Anmeldung", () => {
    expect(ids({ ...EMPTY_FILTER, registration: ["ohne-anmeldung"] })).toEqual([
      "krabbeltreff",
      "krabbelreime",
      "babykonzert-advent",
    ]);
  });
});

describe("matchesFilter", () => {
  const matching = (state: FilterState) =>
    offers
      .filter((o) => matchesFilter(o, state))
      .map(fixtureKey)
      .sort();

  it("prüft dieselben Dimensionen wie applyFilters, aber ohne „kommender Termin“", () => {
    // Das Elterncafé ist am Mo 5.10. um 12 Uhr vorbei – es passt trotzdem zu den Filtern.
    expect(matching(EMPTY_FILTER)).toContain("vergangen");
    expect(matching(EMPTY_FILTER)).toHaveLength(offers.length);
    expect(matching({ ...EMPTY_FILTER, registration: ["ohne-anmeldung"] })).toEqual(
      ["krabbeltreff", "krabbelreime", "babykonzert-advent", "vergangen"].sort(),
    );
  });

  it("verknüpft wie applyFilters: ODER in der Dimension, UND dazwischen", () => {
    expect(matching({ ...EMPTY_FILTER, formats: ["kurs", "einmalig"], cost: ["kostenlos"] })).toEqual(
      ["babykonzert-advent", "vergangen"].sort(),
    );
    expect(matching({ ...EMPTY_FILTER, categories: ["buecher", "buehne"] })).toEqual(
      ["krabbelreime", "kuckuck-im-nest", "babykonzert-advent"].sort(),
    );
  });

  it("ist für kommende Angebote genau applyFilters", () => {
    const states: FilterState[] = [
      EMPTY_FILTER,
      { ...EMPTY_FILTER, formats: ["regelmaessig"] },
      { ...EMPTY_FILTER, cost: ["kostenpflichtig"], registration: ["mit-anmeldung"] },
      { ...EMPTY_FILTER, categories: ["musik"] },
    ];
    for (const state of states) {
      expect(matching(state).filter((k) => k !== "vergangen")).toEqual([...ids(state)].sort());
    }
  });

  it("beachtet die Wegzeit nur mit Wegzeit-Funktion", () => {
    const near = offers.filter((o) => matchesFilter(o, within20, wegzeitAbGostenhof)).map((o) => o.venueId);
    expect(near).not.toContain("musikschule-beispiel-sued");
    expect(offers.filter((o) => matchesFilter(o, within20))).toHaveLength(offers.length);
  });
});

describe("applyFilters mit Wegzeit (Plan 0009, E8/E11)", () => {
  const venuesOf = (list: readonly { venueId: string }[]) => [...new Set(list.map((o) => o.venueId))].sort();

  it("behält mit Wegzeit nur Orte bis zur Grenze, ungerundet verglichen", () => {
    const kept = applyFilters(offers, within20, { now: FIXTURE_NOW, reach: wegzeitAbGostenhof });
    expect(venuesOf(kept)).toEqual([
      "familientreff-beispiel-haus",
      "stadtbibliothek-beispiel-zentrum",
      "theater-beispiel-buehne",
    ]);
    // 29,6 Min. wird als „30 Min.“ angezeigt und fällt unter „bis 30 Min.“, 32,6 Min. nicht
    const at30 = { ...EMPTY_FILTER, reachLimit: { kind: "minuten", value: 30 } } satisfies FilterState;
    const kept30 = applyFilters(offers, at30, { now: FIXTURE_NOW, reach: wegzeitAbGostenhof });
    expect(venuesOf(kept30)).toContain("musikschule-beispiel-sued");
    expect(venuesOf(kept30)).not.toContain("gemeinde-beispiel-gemeindehaus");
  });

  it("wirkt mit der Luftlinie nicht (Rückfall, E11)", () => {
    expect(
      applyFilters(offers, within20, { now: FIXTURE_NOW, reach: airlineReach(gostenhof) }).map(fixtureKey),
    ).toEqual(ids(EMPTY_FILTER));
  });

  it("wirkt ohne Wegzeit-Funktion nicht", () => {
    expect(ids(within20)).toEqual(ids(EMPTY_FILTER));
  });

  it("verknüpft die Wegzeit mit den anderen Filtern per UND", () => {
    const state: FilterState = { ...within20, categories: ["musik"] };
    const kept = applyFilters(offers, state, { now: FIXTURE_NOW, reach: wegzeitAbGostenhof });
    expect(kept.length).toBeLessThan(ids({ ...EMPTY_FILTER, categories: ["musik"] }).length);
    expect(venuesOf(kept)).not.toContain("musikschule-beispiel-sued");
  });
});

describe("Filter bedienen", () => {
  it("zählt aktive Filterwerte über alle Dimensionen", () => {
    expect(activeFilterCount(EMPTY_FILTER, { limitActive: false })).toBe(0);
    expect(
      activeFilterCount(
        { categories: ["musik", "wasser"], formats: ["kurs"], registration: [], cost: ["kostenlos"] },
        { limitActive: false },
      ),
    ).toBe(4);
  });

  it("zählt die Wegzeit nur, wenn sie wirkt", () => {
    const state: FilterState = { ...EMPTY_FILTER, cost: ["kostenlos"], reachLimit: { kind: "minuten", value: 20 } };
    expect(activeFilterCount(state, { limitActive: true })).toBe(2);
    expect(activeFilterCount(state, { limitActive: false })).toBe(1);
    expect(activeFilterCount(EMPTY_FILTER, { limitActive: true })).toBe(0);
  });

  it("setzt die Wegzeit als Einfachwahl und entfernt ihn mit „Egal“", () => {
    const base: FilterState = { ...EMPTY_FILTER, cost: ["kostenlos"] };
    const at2 = withReachLimit(base, { kind: "minuten", value: 20 });
    expect(at2).toEqual({ ...base, reachLimit: { kind: "minuten", value: 20 } });
    expect(withReachLimit(at2, { kind: "minuten", value: 45 })).toEqual({
      ...base,
      reachLimit: { kind: "minuten", value: 45 },
    });
    const egal = withReachLimit(at2, undefined);
    expect(egal).toEqual(base);
    // kein Schlüssel mit undefined (exactOptionalPropertyTypes, kanonische URL)
    expect("reachLimit" in egal).toBe(false);
    expect(filterToSearch(egal)).toBe("kosten=kostenlos");
    expect(base.reachLimit).toBeUndefined();
  });

  it("schaltet einen Wert an und wieder aus, ohne den Rest anzufassen", () => {
    const on = toggleIn(EMPTY_FILTER, "formats", "kurs");
    expect(on).toEqual({ ...EMPTY_FILTER, formats: ["kurs"] });
    expect(toggleIn(on, "formats", "kurs")).toEqual(EMPTY_FILTER);
    expect(toggleIn(on, "categories", "musik")).toEqual({ ...EMPTY_FILTER, formats: ["kurs"], categories: ["musik"] });
  });
});
