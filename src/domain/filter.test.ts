import { describe, expect, it } from "vitest";
import {
  applyFilters,
  EMPTY_FILTER,
  type FilterState,
  filterFromSearch,
  filterToSearch,
  nextSession,
} from "./filter.ts";
import { FIXTURE_NOW, fixtureKey, fixtureOffer, loadFixtures } from "./test-fixtures.ts";

const { file } = loadFixtures();
const ids = (state: FilterState, birthDate?: string) =>
  applyFilters(file.offers, state, { now: FIXTURE_NOW, birthDate }).map(fixtureKey);

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

  it("berücksichtigt das Alter zum Termin", () => {
    // Kind geb. 1.9.2026: im Oktober 1 Monat alt
    expect(ids(EMPTY_FILTER, "2026-09-01")).toEqual([
      "pekip-herbst",
      "babymassage-workshop",
      "krabbelreime",
      "babykonzert-advent",
    ]);
  });
});

describe("nextSession", () => {
  it("liefert den nächsten nicht beendeten Termin", () => {
    const treff = fixtureOffer("krabbeltreff");
    expect(nextSession(treff, new Date("2026-10-07T11:00:00+02:00"))?.start).toBe("2026-10-07T10:00:00+02:00");
    expect(nextSession(treff, new Date("2026-10-07T12:00:00+02:00"))?.start).toBe("2026-10-14T10:00:00+02:00");
    expect(nextSession(treff, new Date("2027-01-01T00:00:00+01:00"))).toBeUndefined();
  });
});
