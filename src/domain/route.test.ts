import { describe, expect, it } from "vitest";
import { DISTRICTS } from "./districts.ts";
import { EMPTY_FILTER, type FilterState } from "./filter.ts";
import { RADII_KM } from "./reach.ts";
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

  it("kennt kein Geburtsdatum", () => {
    expect(routeToSearch(parseRoute("?geb=2026-01-01&geburtsdatum=2026-01-01"))).toBe("");
  });

  it("kennt keinen Startpunkt: weder Koordinate noch Stadtteil (Plan 0004, E7)", () => {
    const filters: FilterState[] = RADII_KM.flatMap((value) => [
      { ...EMPTY_FILTER, reachLimit: { kind: "km", value } },
      {
        categories: ["musik", "buecher"],
        formats: ["kurs"],
        registration: ["ohne-anmeldung"],
        cost: ["kostenlos"],
        reachLimit: { kind: "km", value },
      },
    ]);
    const names = DISTRICTS.flatMap((d) => [d.id, d.name.toLowerCase()]);
    for (const filter of filters) {
      for (const tab of ["entdecken", "karte", "kalender", "merkliste"] as const) {
        const search = routeToSearch({ tab, offerId, filter });
        expect(search).toContain(`umkreis=${filter.reachLimit?.value}`);
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
    expect(tabSection("merkliste")).toBe("merkliste");
  });
});
