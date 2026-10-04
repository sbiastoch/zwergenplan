import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTER,
  type FilterState,
  filterFromSearch,
  filterToSearch,
  toggleIn,
} from "./filter.ts";
import { FIXTURE_NOW, fixtureKey, loadFixtures } from "./test-fixtures.ts";

const { file } = loadFixtures();
const ids = (state: FilterState) => applyFilters(file.offers, state, { now: FIXTURE_NOW }).map(fixtureKey);

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
});

describe("applyFilters", () => {
  it("blendet Vergangenes aus", () => {
    expect(ids(EMPTY_FILTER)).not.toContain("vergangen");
    expect(ids(EMPTY_FILTER)).toHaveLength(file.offers.length - 1);
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

describe("Filter bedienen", () => {
  it("zählt aktive Filterwerte über alle Dimensionen", () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(
      activeFilterCount({ categories: ["musik", "wasser"], formats: ["kurs"], registration: [], cost: ["kostenlos"] }),
    ).toBe(4);
  });

  it("schaltet einen Wert an und wieder aus, ohne den Rest anzufassen", () => {
    const on = toggleIn(EMPTY_FILTER, "formats", "kurs");
    expect(on).toEqual({ ...EMPTY_FILTER, formats: ["kurs"] });
    expect(toggleIn(on, "formats", "kurs")).toEqual(EMPTY_FILTER);
    expect(toggleIn(on, "categories", "musik")).toEqual({ ...EMPTY_FILTER, formats: ["kurs"], categories: ["musik"] });
  });
});
