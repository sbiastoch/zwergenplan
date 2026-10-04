import { describe, expect, it } from "vitest";
import { districtById } from "./districts.ts";
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTER,
  type FilterState,
  filterFromSearch,
  filterToSearch,
  toggleIn,
} from "./filter.ts";
import { type Origin, reachTo } from "./reach.ts";
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

  it("liest den Umkreis und schreibt ihn kanonisch nach den Kosten", () => {
    const state: FilterState = { ...EMPTY_FILTER, cost: ["kostenlos"], reachLimit: { kind: "km", value: 5 } };
    const search = filterToSearch(state);
    expect(search).toBe("kosten=kostenlos&umkreis=5");
    expect(filterFromSearch(`?umkreis=5&kosten=kostenlos`)).toEqual(state);
    for (const value of [2, 10] as const) {
      expect(filterFromSearch(`?umkreis=${value}`).reachLimit).toEqual({ kind: "km", value });
    }
  });

  it.each(["3", "abc", "-5", "", "02", "2.0", "5,10"])("verwirft den Umkreis „%s“", (raw) => {
    const state = filterFromSearch(`?umkreis=${raw}`);
    expect(state).toEqual(EMPTY_FILTER);
    expect("reachLimit" in state).toBe(false);
  });

  it("hat ohne Umkreis keinen Parameter umkreis", () => {
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

describe("applyFilters mit Umkreis", () => {
  const within2km = { ...EMPTY_FILTER, reachLimit: { kind: "km", value: 2 } } satisfies FilterState;
  const venuesOf = (list: readonly { venueId: string }[]) => [...new Set(list.map((o) => o.venueId))].sort();

  it("rechnet ab Gostenhof die Luftlinie aus Plan 0004", () => {
    const meters = Object.fromEntries(offers.map((o) => [o.venueId, Math.round(reachTo(gostenhof, o.venue).meters)]));
    expect(meters).toEqual({
      "theater-beispiel-buehne": 226,
      "familientreff-beispiel-haus": 1427,
      "stadtbibliothek-beispiel-zentrum": 1689,
      "musikschule-beispiel-sued": 2358,
      "gemeinde-beispiel-gemeindehaus": 3008,
    });
  });

  it("behält mit Startpunkt nur Orte im Umkreis", () => {
    const kept = applyFilters(offers, within2km, { now: FIXTURE_NOW, origin: gostenhof });
    expect(venuesOf(kept)).toEqual([
      "familientreff-beispiel-haus",
      "stadtbibliothek-beispiel-zentrum",
      "theater-beispiel-buehne",
    ]);
  });

  it("zieht die Grenze zwischen 1 689 m und 2 358 m bei 2 km, 5 km behalten alle", () => {
    const at5 = { ...EMPTY_FILTER, reachLimit: { kind: "km", value: 5 } } satisfies FilterState;
    expect(ids({ ...EMPTY_FILTER })).toEqual(
      applyFilters(offers, at5, { now: FIXTURE_NOW, origin: gostenhof }).map(fixtureKey),
    );
    const kept = applyFilters(offers, within2km, { now: FIXTURE_NOW, origin: gostenhof });
    expect(kept.some((o) => o.venueId === "stadtbibliothek-beispiel-zentrum")).toBe(true);
    expect(kept.some((o) => o.venueId === "musikschule-beispiel-sued")).toBe(false);
  });

  it("wirkt ohne Startpunkt nicht", () => {
    expect(ids(within2km)).toEqual(ids(EMPTY_FILTER));
  });

  it("verknüpft den Umkreis mit den anderen Filtern per UND", () => {
    const state: FilterState = { ...within2km, categories: ["musik"] };
    const kept = applyFilters(offers, state, { now: FIXTURE_NOW, origin: gostenhof });
    expect(kept.length).toBeLessThan(ids({ ...EMPTY_FILTER, categories: ["musik"] }).length);
    expect(venuesOf(kept)).not.toContain("musikschule-beispiel-sued");
  });
});

describe("Filter bedienen", () => {
  it("zählt aktive Filterwerte über alle Dimensionen", () => {
    expect(activeFilterCount(EMPTY_FILTER, { hasOrigin: false })).toBe(0);
    expect(
      activeFilterCount(
        { categories: ["musik", "wasser"], formats: ["kurs"], registration: [], cost: ["kostenlos"] },
        { hasOrigin: false },
      ),
    ).toBe(4);
  });

  it("zählt den Umkreis nur mit Startpunkt", () => {
    const state: FilterState = { ...EMPTY_FILTER, cost: ["kostenlos"], reachLimit: { kind: "km", value: 2 } };
    expect(activeFilterCount(state, { hasOrigin: true })).toBe(2);
    expect(activeFilterCount(state, { hasOrigin: false })).toBe(1);
    expect(activeFilterCount(EMPTY_FILTER, { hasOrigin: true })).toBe(0);
  });

  it("schaltet einen Wert an und wieder aus, ohne den Rest anzufassen", () => {
    const on = toggleIn(EMPTY_FILTER, "formats", "kurs");
    expect(on).toEqual({ ...EMPTY_FILTER, formats: ["kurs"] });
    expect(toggleIn(on, "formats", "kurs")).toEqual(EMPTY_FILTER);
    expect(toggleIn(on, "categories", "musik")).toEqual({ ...EMPTY_FILTER, formats: ["kurs"], categories: ["musik"] });
  });
});
