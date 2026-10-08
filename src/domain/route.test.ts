import { describe, expect, it } from "vitest";
import { DISTRICTS } from "./districts.ts";
import { EMPTY_FILTER, type FilterState } from "./filter.ts";
import { LIMIT_MINUTES } from "./reach.ts";
import { parseRoute, routeToSearch, tabSection } from "./route.ts";

const offerId = "familientreff--offener-krabbeltreff--beispielhof";

describe("URL-Route", () => {
  it("ist ohne Parameter die Startseite", () => {
    expect(parseRoute("")).toEqual({ tab: "entdecken", filter: EMPTY_FILTER });
    expect(routeToSearch({ tab: "entdecken", filter: EMPTY_FILTER })).toBe("");
  });

  it("überlebt den Roundtrip mit Filter, Ansicht und Angebot", () => {
    const route = {
      tab: "kalender" as const,
      offerId,
      filter: { ...EMPTY_FILTER, formats: ["kurs" as const], categories: ["musik" as const] },
    };
    const search = routeToSearch(route);
    expect(search).toBe(`kat=musik&format=kurs&ansicht=kalender&angebot=${offerId}`);
    expect(parseRoute(`?${search}`)).toEqual(route);
  });

  it("überlebt den Roundtrip mit Zeitraum, Ansicht und Angebot (Plan 0023, E4)", () => {
    const route = {
      tab: "kalender" as const,
      offerId,
      filter: { ...EMPTY_FILTER, range: { from: "2026-10-20", to: "2026-10-31" } },
    };
    const search = routeToSearch(route);
    expect(search).toBe(`von=2026-10-20&bis=2026-10-31&ansicht=kalender&angebot=${offerId}`);
    expect(parseRoute(`?${search}`)).toEqual(route);
    expect(routeToSearch(parseRoute(`?angebot=${offerId}&bis=2026-10-20&von=2026-10-31&ansicht=kalender`))).toBe(
      search,
    );
  });

  it("verwirft unbekannte Ansichten und kaputte Angebots-IDs", () => {
    expect(parseRoute("?ansicht=landkarte&angebot=../../etc")).toEqual({ tab: "entdecken", filter: EMPTY_FILTER });
    expect(parseRoute("?ansicht=merkliste").tab).toBe("merkliste");
  });

  it("kennt die Kartenansicht: ansicht=karte überlebt den Roundtrip (Plan 0005, E5)", () => {
    const route = { tab: "karte" as const, filter: { ...EMPTY_FILTER, formats: ["kurs" as const] } };
    expect(routeToSearch(route)).toBe("format=kurs&ansicht=karte");
    expect(parseRoute("?format=kurs&ansicht=karte")).toEqual(route);
    expect(parseRoute(`?ansicht=karte&angebot=${offerId}`)).toEqual({ tab: "karte", offerId, filter: EMPTY_FILTER });
  });

  it("kennt die Karte der Merkliste: ansicht=merkliste-karte überlebt den Roundtrip (Plan 0025, E4)", () => {
    const route = { tab: "merkliste-karte" as const, filter: { ...EMPTY_FILTER, categories: ["musik" as const] } };
    expect(routeToSearch(route)).toBe("kat=musik&ansicht=merkliste-karte");
    expect(parseRoute("?kat=musik&ansicht=merkliste-karte")).toEqual(route);
    expect(parseRoute(`?ansicht=merkliste-karte&angebot=${offerId}`)).toEqual({
      tab: "merkliste-karte",
      offerId,
      filter: EMPTY_FILTER,
    });
  });

  it("kennt den Tab „Anbieter“: ansicht=anbieter überlebt den Roundtrip (Plan 0010, E2)", () => {
    const route = { tab: "anbieter" as const, filter: { ...EMPTY_FILTER, categories: ["musik" as const] } };
    expect(routeToSearch(route)).toBe("kat=musik&ansicht=anbieter");
    expect(parseRoute("?kat=musik&ansicht=anbieter")).toEqual(route);
    expect(parseRoute(`?ansicht=anbieter&angebot=${offerId}`)).toEqual({
      tab: "anbieter",
      offerId,
      filter: EMPTY_FILTER,
    });
  });

  it("kennt das Anbieter-Sheet: anbieter=<id> überlebt den Roundtrip, kanonisch nach der Ansicht (Plan 0010, E2)", () => {
    const providerId = "theater-beispiel";
    expect(parseRoute(`?anbieter=${providerId}`)).toEqual({ tab: "entdecken", providerId, filter: EMPTY_FILTER });
    expect(routeToSearch({ tab: "entdecken", providerId, filter: EMPTY_FILTER })).toBe(`anbieter=${providerId}`);
    const full = {
      tab: "anbieter" as const,
      providerId,
      offerId,
      filter: { ...EMPTY_FILTER, categories: ["musik" as const] },
    };
    const search = routeToSearch(full);
    expect(search).toBe(`kat=musik&ansicht=anbieter&anbieter=${providerId}&angebot=${offerId}`);
    expect(parseRoute(`?${search}`)).toEqual(full);
    // gleiche Bedeutung in anderer Reihenfolge, kanonisch zurück
    expect(routeToSearch(parseRoute(`?angebot=${offerId}&anbieter=${providerId}&ansicht=kalender`))).toBe(
      `ansicht=kalender&anbieter=${providerId}&angebot=${offerId}`,
    );
  });

  it("verwirft kaputte und überlange Anbieter-IDs", () => {
    for (const bad of ["../x", "Theater", "a--b", "-a", "a-", "", "a b", `${"a".repeat(81)}`]) {
      expect(parseRoute(`?anbieter=${encodeURIComponent(bad)}`), JSON.stringify(bad)).toEqual({
        tab: "entdecken",
        filter: EMPTY_FILTER,
      });
    }
    const longest = "a".repeat(80);
    expect(parseRoute(`?anbieter=${longest}`).providerId).toBe(longest);
  });

  it("übernimmt den alten Umkreis nicht, die Wegzeit schon", () => {
    expect(routeToSearch(parseRoute("?umkreis=5&ansicht=karte"))).toBe("ansicht=karte");
    expect(routeToSearch(parseRoute("?ansicht=karte&wegzeit=30"))).toBe("wegzeit=30&ansicht=karte");
  });

  it("kennt kein Geburtsdatum", () => {
    expect(routeToSearch(parseRoute("?geb=2026-01-01&geburtsdatum=2026-01-01"))).toBe("");
  });

  it("kennt keinen Startpunkt: weder Koordinate noch Stadtteil, auch mit wegzeit= (Plan 0004, E7; Plan 0009, E8)", () => {
    const filters: FilterState[] = LIMIT_MINUTES.flatMap((value) => [
      { ...EMPTY_FILTER, reachLimit: { kind: "minuten", value } },
      {
        categories: ["musik", "buecher"],
        formats: ["kurs"],
        registration: ["ohne-anmeldung"],
        cost: ["kostenlos"],
        reachLimit: { kind: "minuten", value },
      },
    ]);
    const names = DISTRICTS.flatMap((d) => [d.id, d.name.toLowerCase()]);
    for (const filter of filters) {
      for (const tab of ["entdecken", "karte", "kalender", "anbieter", "merkliste", "merkliste-karte"] as const) {
        const search = routeToSearch({ tab, offerId, providerId: "theater-beispiel", filter });
        expect(search).toContain(`wegzeit=${filter.reachLimit?.value}`);
        expect(search).not.toContain("umkreis");
        expect(search).not.toMatch(/\d{2}\.\d{2,}/);
        for (const name of names) expect(decodeURIComponent(search).toLowerCase()).not.toContain(name);
      }
    }
  });
});

describe("tabSection", () => {
  it("ordnet Liste und Karte dem Tab „Entdecken“ zu (Plan 0005, E5)", () => {
    expect(tabSection("entdecken")).toBe("entdecken");
    expect(tabSection("karte")).toBe("entdecken");
    expect(tabSection("kalender")).toBe("kalender");
    expect(tabSection("anbieter")).toBe("anbieter");
    expect(tabSection("merkliste")).toBe("merkliste");
  });

  it("ordnet die Karte der Merkliste dem Tab „Merkliste“ zu (Plan 0025, E4)", () => {
    expect(tabSection("merkliste-karte")).toBe("merkliste");
  });
});
