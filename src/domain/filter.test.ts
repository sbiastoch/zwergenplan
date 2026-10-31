import { describe, expect, it } from "vitest";
import { districtById } from "./districts.ts";
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTER,
  type FilterState,
  filterFromSearch,
  filterToSearch,
  fromProviders,
  inDaytime,
  matchesFilter,
  providerFilter,
  quickRangeOn,
  toggleIn,
  toggleQuickRange,
  withDateRange,
  withReachLimit,
} from "./filter.ts";
import { placeKey } from "./place-key.ts";
import { airlineReach, type Origin, type ReachFn } from "./reach.ts";
import type { SiteOffer } from "./site-data.ts";
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
      daytimes: ["nachmittags", "vormittags"],
    };
    const search = filterToSearch(state);
    expect(search).toBe(
      "kat=babykurse,musik&format=kurs,einmalig&anmeldung=ohne-anmeldung&kosten=kostenlos&tageszeit=vormittags,nachmittags",
    );
    expect(filterFromSearch(`?${search}`)).toEqual({
      categories: ["babykurse", "musik"],
      formats: ["kurs", "einmalig"],
      registration: ["ohne-anmeldung"],
      cost: ["kostenlos"],
      daytimes: ["vormittags", "nachmittags"],
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

  it("filtert die Kategorie nur über die Hauptkategorie category (Plan 0037, E9)", () => {
    expect(ids({ ...EMPTY_FILTER, categories: ["musik"] })).toEqual(["musikgarten-1"]);
    expect(ids({ ...EMPTY_FILTER, categories: ["krabbel-spielgruppen"] })).toEqual(["krabbeltreff"]);
  });

  it("laufende Kurse mit Anmeldung fallen heraus, außer mit runningCourses (Plan 0053, E1)", () => {
    // 20.10.: PEKiP läuft seit 13.10., Musikgarten beginnt am 5.11.
    const at = new Date("2026-10-20T12:00:00+02:00");
    const kurse = { ...EMPTY_FILTER, formats: ["kurs"] } satisfies FilterState;
    expect(applyFilters(offers, kurse, { now: at }).map(fixtureKey)).toEqual(["musikgarten-1"]);
    expect(applyFilters(offers, kurse, { now: at, runningCourses: true }).map(fixtureKey)).toEqual([
      "pekip-herbst",
      "musikgarten-1",
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
    // nur die Hauptkategorie zählt (Plan 0037, E9): Babykonzert ist buehne, Krabbelreime buecher
    expect(matching({ ...EMPTY_FILTER, categories: ["musik"] })).toEqual(["musikgarten-1"]);
    expect(matching({ ...EMPTY_FILTER, categories: ["krabbel-spielgruppen"] })).toEqual(["krabbeltreff"]);
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
        { categories: ["musik", "wasser"], formats: ["kurs"], registration: [], cost: ["kostenlos"], daytimes: [] },
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

describe("Zeitraum (Plan 0023)", () => {
  const autumn = { ...EMPTY_FILTER, range: { from: "2026-10-20", to: "2026-10-31" } } satisfies FilterState;

  it("steht kanonisch als von/bis nach der Wegzeit in der URL", () => {
    const state: FilterState = { ...autumn, reachLimit: { kind: "minuten", value: 30 } };
    expect(filterToSearch(state)).toBe("wegzeit=30&von=2026-10-20&bis=2026-10-31");
    expect(filterFromSearch("?bis=2026-10-31&wegzeit=30&von=2026-10-20")).toEqual(state);
    expect(filterToSearch({ ...EMPTY_FILTER, range: { to: "2026-10-31" } })).toBe("bis=2026-10-31");
  });

  it("tauscht vertauschte Grenzen und verwirft ungültige", () => {
    expect(filterFromSearch("?von=2026-10-31&bis=2026-10-20")).toEqual(autumn);
    expect(filterFromSearch("?von=2026-10-32&bis=2026-10-31").range).toEqual({ to: "2026-10-31" });
    const none = filterFromSearch("?von=heute&bis=");
    expect(none).toEqual(EMPTY_FILTER);
    expect("range" in none).toBe(false);
  });

  it("zählt als ein Filter im Badge", () => {
    expect(activeFilterCount(autumn, { limitActive: false })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_FILTER, range: { from: "2026-10-20" } }, { limitActive: false })).toBe(1);
  });

  it("setzt und entfernt den Zeitraum, vertauscht wird still getauscht", () => {
    expect(withDateRange(EMPTY_FILTER, "2026-10-31", "2026-10-20")).toEqual(autumn);
    const cleared = withDateRange(autumn, undefined, undefined);
    expect(cleared).toEqual(EMPTY_FILTER);
    expect("range" in cleared).toBe(false);
  });

  it("Kurse nur mit Beginn im Zeitraum, regelmäßige mit einem Termin darin", () => {
    // PEKiP beginnt am 13.10. und fällt heraus; Krabbeltreff (21., 28.10.), Krabbelreime (23.10.) und die
    // Bewegungslandschaft (ab 20.10., ohne Testschlüssel) passen, der Workshop am 17.10. nicht.
    expect(ids(autumn).sort()).toEqual(["krabbelreime", "krabbeltreff", undefined]);
    expect(ids({ ...EMPTY_FILTER, range: { from: "2026-11-01" } }).sort()).toEqual([
      "babykonzert-advent",
      "krabbelreime",
      "krabbeltreff",
      "kuckuck-im-nest",
      "musikgarten-1",
      undefined,
    ]);
  });
});

describe("Tageszeit (Plan 0057, E7)", () => {
  const morning = { ...EMPTY_FILTER, daytimes: ["vormittags"] } satisfies FilterState;
  const afternoon = { ...EMPTY_FILTER, daytimes: ["nachmittags"] } satisfies FilterState;

  it("steht kanonisch als tageszeit nach den Kosten in der URL, Unbekanntes fällt weg", () => {
    const state: FilterState = { ...EMPTY_FILTER, cost: ["kostenlos"], daytimes: ["nachmittags", "vormittags"] };
    expect(filterToSearch(state)).toBe("kosten=kostenlos&tageszeit=vormittags,nachmittags");
    expect(filterFromSearch("?tageszeit=nachmittags,abends,vormittags&kosten=kostenlos")).toEqual({
      ...EMPTY_FILTER,
      cost: ["kostenlos"],
      daytimes: ["vormittags", "nachmittags"],
    });
    expect(filterFromSearch("?tageszeit=mittags").daytimes).toEqual(["mittags"]);
    expect(filterFromSearch("?tageszeit=quatsch")).toEqual(EMPTY_FILTER);
    expect(filterToSearch({ ...morning, range: { from: "2026-10-20" } })).toBe("tageszeit=vormittags&von=2026-10-20");
  });

  it("zählt jede gewählte Tageszeit im Badge und lässt sich umschalten", () => {
    expect(activeFilterCount(morning, { limitActive: false })).toBe(1);
    expect(activeFilterCount({ ...morning, daytimes: ["vormittags", "mittags"] }, { limitActive: false })).toBe(2);
    expect(toggleIn(EMPTY_FILTER, "daytimes", "vormittags")).toEqual(morning);
    expect(toggleIn(morning, "daytimes", "vormittags")).toEqual(EMPTY_FILTER);
  });

  it("filtert hart: ein Angebot nur mit Nachmittagsterminen fällt bei „vormittags“ heraus", () => {
    // Musikgarten (Kurs, 16 Uhr) und Bewegungslandschaft (regelmäßig, 15 Uhr, ohne Testschlüssel) sind nachmittags
    expect(ids(afternoon).sort()).toEqual(["musikgarten-1", undefined]);
    expect(ids(morning)).not.toContain("musikgarten-1");
    expect(ids(morning)).toHaveLength(ids(EMPTY_FILTER).length - 2);
    expect(ids({ ...EMPTY_FILTER, daytimes: ["mittags"] })).toEqual([]);
    expect(ids({ ...EMPTY_FILTER, daytimes: ["vormittags", "nachmittags"] })).toEqual(ids(EMPTY_FILTER));
  });

  it("Zeitraum und Tageszeit am selben Termin", () => {
    const treff = offers.find((o) => fixtureKey(o) === "krabbeltreff");
    if (!treff) throw new Error("Fixture fehlt");
    const regular: SiteOffer = {
      ...treff,
      sessions: [
        { start: "2026-10-12T09:00:00+02:00", end: "2026-10-12T10:00:00+02:00" }, // Mo vormittags
        { start: "2026-10-13T16:00:00+02:00", end: "2026-10-13T17:00:00+02:00" }, // Di nachmittags
      ],
    };
    const kept = (state: FilterState) => applyFilters([regular], state, { now: FIXTURE_NOW }).length;
    const tuesday = { from: "2026-10-13", to: "2026-10-13" };
    expect(kept({ ...morning, range: tuesday })).toBe(0);
    expect(kept({ ...afternoon, range: tuesday })).toBe(1);
    expect(kept(morning)).toBe(1);
  });

  it("Kurs: nur der Beginn zählt, für Zeitraum und Tageszeit", () => {
    // Musikgarten beginnt am 5.11. um 16 Uhr; PEKiP am 13.10. um 9:30, dann wöchentlich
    expect(ids({ ...afternoon, range: { from: "2026-11-05" } })).toContain("musikgarten-1");
    expect(ids({ ...morning, range: { from: "2026-11-05" } })).not.toContain("musikgarten-1");
    expect(ids({ ...morning, range: { from: "2026-10-20" } })).not.toContain("pekip-herbst");
    expect(ids({ ...morning, range: { from: "2026-10-13" } })).toContain("pekip-herbst");
  });

  it("inDaytime: Prädikat je Termin für den Kalender der Merkliste, ohne Auswahl keins (Plan 0057, E7)", () => {
    const pekip = offers.find((o) => fixtureKey(o) === "pekip-herbst");
    if (!pekip) throw new Error("Fixture fehlt");
    expect(inDaytime([])).toBeUndefined();
    const morningFit = inDaytime(["vormittags"]);
    const afternoonFit = inDaytime(["nachmittags", "mittags"]);
    // jeder PEKiP-Termin beginnt um 9:30: alle passen, keiner am Nachmittag
    expect(pekip.sessions.every((s) => morningFit?.(pekip, s))).toBe(true);
    expect(pekip.sessions.some((s) => afternoonFit?.(pekip, s))).toBe(false);
  });

  it("matchesFilter kennt die Tageszeit nicht", () => {
    const musikgarten = offers.find((o) => fixtureKey(o) === "musikgarten-1");
    if (!musikgarten) throw new Error("Fixture fehlt");
    expect(matchesFilter(musikgarten, morning)).toBe(true);
  });
});

describe("Schnellwahlen „ab …“ (Plan 0025, E7; Plan 0057, E5)", () => {
  const nov = { from: "2026-11-01" };
  const dez = { from: "2026-12-01" };

  it("Einfachwahl, ein zweiter Tipp hebt sie auf; ohne Zeitraum fehlt der Schlüssel", () => {
    const a = toggleQuickRange(EMPTY_FILTER, nov);
    expect(a.range).toEqual(nov);
    expect(quickRangeOn(a, nov)).toBe(true);
    expect(quickRangeOn(a, dez)).toBe(false);
    expect(toggleQuickRange(a, dez).range).toEqual(dez);
    const off = toggleQuickRange(a, { ...nov });
    expect(off).toEqual(EMPTY_FILTER);
    expect("range" in off).toBe(false);
  });

  it("ein Zeitraum mit Ende ist keine Schnellwahl; die übrigen Werte bleiben", () => {
    const withEnd: FilterState = {
      ...EMPTY_FILTER,
      formats: ["kurs"],
      range: { from: "2026-11-01", to: "2026-11-30" },
    };
    expect(quickRangeOn(withEnd, nov)).toBe(false);
    expect(toggleQuickRange(withEnd, nov)).toEqual({ ...EMPTY_FILTER, formats: ["kurs"], range: nov });
  });
});

describe("fromProviders (Plan 0054, Nachtrag A, N1)", () => {
  it("behält nur Angebote der abonnierten Anbieter, in Datenreihenfolge", () => {
    const [first, ...rest] = [...new Set(offers.map((o) => o.providerId))];
    const kept = fromProviders(offers, [first ?? ""]);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((o) => o.providerId === first)).toBe(true);
    expect(kept).toEqual(offers.filter((o) => o.providerId === first));
    expect(fromProviders(offers, [first ?? "", ...rest])).toEqual(offers);
  });

  it("ein unbekannter Anbieter trifft nichts", () => {
    expect(fromProviders(offers, ["unbekannt"])).toEqual([]);
  });
});

describe("providerFilter (Plan 0055, E3)", () => {
  it("behält im Tab „Anbieter“ nur die Kategorien", () => {
    const full: FilterState = {
      categories: ["musik", "buecher"],
      formats: ["kurs"],
      registration: ["ohne-anmeldung"],
      cost: ["kostenlos"],
      daytimes: ["vormittags"],
      reachLimit: { kind: "minuten", value: 20 },
      range: { from: "2026-10-06", to: "2026-10-12" },
    };
    expect(providerFilter(full)).toEqual({ ...EMPTY_FILTER, categories: ["musik", "buecher"] });
    expect(providerFilter(EMPTY_FILTER)).toEqual(EMPTY_FILTER);
  });
});
