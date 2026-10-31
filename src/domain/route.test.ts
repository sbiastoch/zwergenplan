import { describe, expect, it } from "vitest";
import { DISTRICTS } from "./districts.ts";
import { EMPTY_FILTER, type FilterState } from "./filter.ts";
import { LIMIT_MINUTES } from "./reach.ts";
import {
  afterBigClosed,
  hasMap,
  isLegacyView,
  isSavedTab,
  OFFER_PARAM,
  PROVIDER_PARAM,
  parseRoute,
  routeToSearch,
  strayBig,
  tabSection,
} from "./route.ts";

const offerId = "4tpu5qaq";
const TABS = ["entdecken", "karte", "anbieter", "merkliste", "merkliste-karte", "merkliste-kalender"] as const;

describe("URL-Route", () => {
  it("ist ohne Parameter die Startseite", () => {
    expect(parseRoute("")).toEqual({ tab: "entdecken", filter: EMPTY_FILTER });
    expect(routeToSearch({ tab: "entdecken", filter: EMPTY_FILTER })).toBe("");
  });

  it("überlebt den Roundtrip mit Filter, Ansicht und Angebot", () => {
    const route = {
      tab: "merkliste-kalender" as const,
      offerId,
      filter: { ...EMPTY_FILTER, formats: ["kurs" as const], categories: ["musik" as const] },
    };
    const search = routeToSearch(route);
    expect(search).toBe(`kat=musik&format=kurs&ansicht=merkliste-kalender&angebot=${offerId}`);
    expect(parseRoute(`?${search}`)).toEqual(route);
  });

  it("überlebt den Roundtrip mit Zeitraum, Ansicht und Angebot (Plan 0023, E4)", () => {
    const route = {
      tab: "karte" as const,
      offerId,
      filter: { ...EMPTY_FILTER, range: { from: "2026-10-20", to: "2026-10-31" } },
    };
    const search = routeToSearch(route);
    expect(search).toBe(`von=2026-10-20&bis=2026-10-31&ansicht=karte&angebot=${offerId}`);
    expect(parseRoute(`?${search}`)).toEqual(route);
    expect(routeToSearch(parseRoute(`?angebot=${offerId}&bis=2026-10-20&von=2026-10-31&ansicht=karte`))).toBe(search);
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

  it("kennt den Kalender der Merkliste: ansicht=merkliste-kalender überlebt den Roundtrip (Plan 0025, E4)", () => {
    const route = { tab: "merkliste-kalender" as const, filter: { ...EMPTY_FILTER, categories: ["musik" as const] } };
    expect(routeToSearch(route)).toBe("kat=musik&ansicht=merkliste-kalender");
    expect(parseRoute("?kat=musik&ansicht=merkliste-kalender")).toEqual(route);
  });

  it("liest den alten Tab ansicht=kalender als „Entdecken“, Filter, Anbieter und Angebot bleiben (Plan 0025, E8)", () => {
    const providerId = "theater-beispiel";
    const search = `?kat=musik&von=2026-11-06&ansicht=kalender&anbieter=${providerId}&angebot=${offerId}`;
    expect(parseRoute(search)).toEqual({
      tab: "entdecken",
      providerId,
      offerId,
      filter: { ...EMPTY_FILTER, categories: ["musik"], range: { from: "2026-11-06" } },
    });
    expect(routeToSearch(parseRoute(search))).toBe(
      `kat=musik&von=2026-11-06&anbieter=${providerId}&angebot=${offerId}`,
    );
  });

  it("isLegacyView erkennt nur ansicht=kalender (Plan 0025, E8)", () => {
    expect(isLegacyView("?ansicht=kalender")).toBe(true);
    expect(isLegacyView("?kat=musik&ansicht=kalender&wegzeit=20")).toBe(true);
    for (const search of ["", "?ansicht=merkliste-kalender", "?ansicht=karte", "?kat=kalender", "?ansicht=Kalender"]) {
      expect(isLegacyView(search), search).toBe(false);
    }
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
    expect(routeToSearch(parseRoute(`?angebot=${offerId}&anbieter=${providerId}&ansicht=merkliste`))).toBe(
      `ansicht=merkliste&anbieter=${providerId}&angebot=${offerId}`,
    );
  });

  it("nimmt Angebots-IDs in beiden Formen an und gibt sie unverändert weiter (ADR 0022)", () => {
    expect(OFFER_PARAM).toBe("angebot");
    expect(PROVIDER_PARAM).toBe("anbieter");
    const legacy = "familientreff--offener-krabbeltreff--beispielhof";
    expect(parseRoute(`?angebot=${legacy}`).offerId).toBe(legacy);
    expect(parseRoute(`?angebot=${offerId}`).offerId).toBe(offerId);
    expect(parseRoute(`?angebot=a--${"b".repeat(240)}--c`).offerId).toBeUndefined();
    for (const bad of ["4TPU5QAQ", "4tpu5qa", "a--b", "../x"])
      expect(parseRoute(`?angebot=${bad}`).offerId).toBeUndefined();
  });

  it("nimmt Anbieter als publicId und als Katalog-ID an", () => {
    expect(parseRoute("?anbieter=gl1sfqim").providerId).toBe("gl1sfqim");
    expect(parseRoute("?anbieter=babykonzert-nuernberg").providerId).toBe("babykonzert-nuernberg");
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

  it("Sortierung (Plan 0043, E4): sortierung=neu/nah gelesen und nach der Ansicht geschrieben, Unbekanntes entfällt", () => {
    expect(parseRoute("?sortierung=neu").sort).toBe("neu");
    expect(parseRoute("?sortierung=nah").sort).toBe("nah");
    expect(parseRoute("?sortierung=termine")).not.toHaveProperty("sort");
    expect(parseRoute("?sortierung=preis")).not.toHaveProperty("sort");
    expect(routeToSearch(parseRoute(`?sortierung=neu&kat=musik&ansicht=karte&angebot=${offerId}`))).toBe(
      `kat=musik&ansicht=karte&sortierung=neu&angebot=${offerId}`,
    );
    // kein Filter: zählt nicht im Filter
    expect(parseRoute("?sortierung=neu").filter).toEqual(EMPTY_FILTER);
  });

  it("große Karte (Plan 0059, E1): karte=gross nur zu den drei Karten, hinter der Ansicht geschrieben", () => {
    for (const tab of ["karte", "merkliste-karte", "anbieter"] as const) {
      const route = parseRoute(`?ansicht=${tab}&karte=gross`);
      expect(route).toEqual({ tab, big: true, filter: EMPTY_FILTER });
      expect(routeToSearch(route)).toBe(`ansicht=${tab}&karte=gross`);
    }
    for (const tab of ["entdecken", "merkliste", "merkliste-kalender"] as const) {
      expect(parseRoute(`?ansicht=${tab}&karte=gross`).big).toBeUndefined();
      expect(routeToSearch({ tab, big: true, filter: EMPTY_FILTER })).not.toContain("karte=");
    }
    expect(parseRoute("?ansicht=karte&karte=klein").big).toBeUndefined();
    const full = { tab: "karte" as const, big: true as const, sort: "neu" as const, offerId, filter: EMPTY_FILTER };
    expect(routeToSearch(full)).toBe(`ansicht=karte&karte=gross&sortierung=neu&${OFFER_PARAM}=${offerId}`);
    expect(parseRoute(`?${routeToSearch(full)}`)).toEqual(full);
  });

  it("afterBigClosed: Filter und Sortierung aus der großen Karte überstehen „Zurück“ (Plan 0059, Review 2, N1)", () => {
    const music = { ...EMPTY_FILTER, categories: ["musik" as const] };
    const current = { tab: "karte" as const, big: true as const, sort: "neu" as const, filter: music };
    expect(afterBigClosed(current, { tab: "karte", filter: EMPTY_FILTER })).toEqual({
      tab: "karte",
      sort: "neu",
      filter: music,
    });
    expect(
      afterBigClosed({ tab: "karte", big: true, filter: music }, { tab: "karte", sort: "nah", filter: EMPTY_FILTER }),
    ).toEqual({ tab: "karte", filter: music });
    // andere Ansicht, weiter groß (Detail zu) oder vorher nicht groß: der Eintrag gilt
    const other = { tab: "entdecken" as const, filter: EMPTY_FILTER };
    expect(afterBigClosed(current, other)).toBe(other);
    const stillBig = { tab: "karte" as const, big: true as const, filter: EMPTY_FILTER };
    expect(afterBigClosed(current, stillBig)).toBe(stillBig);
    const small = { tab: "karte" as const, filter: music };
    expect(afterBigClosed(small, { tab: "karte", filter: EMPTY_FILTER })).toEqual({
      tab: "karte",
      filter: EMPTY_FILTER,
    });
  });

  it("strayBig: karte= ohne gültige große Karte (Plan 0059, E1)", () => {
    expect(strayBig("?karte=gross", parseRoute("?karte=gross"))).toBe(true);
    expect(strayBig("?ansicht=karte&karte=klein", parseRoute("?ansicht=karte&karte=klein"))).toBe(true);
    expect(strayBig("?ansicht=karte&karte=gross", parseRoute("?ansicht=karte&karte=gross"))).toBe(false);
    expect(strayBig("?ansicht=karte", parseRoute("?ansicht=karte"))).toBe(false);
  });

  it("hasMap: nur Karte, Merklisten-Karte und Tab „Anbieter“ haben eine Karte (Plan 0059, E1)", () => {
    expect(TABS.filter(hasMap)).toEqual(["karte", "anbieter", "merkliste-karte"]);
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
        daytimes: ["vormittags"],
        reachLimit: { kind: "minuten", value },
      },
    ]);
    const names = DISTRICTS.flatMap((d) => [d.id, d.name.toLowerCase()]);
    for (const filter of filters) {
      for (const tab of TABS) {
        const search = routeToSearch({ tab, offerId, providerId: "theater-beispiel", filter });
        expect(search).toContain(`wegzeit=${filter.reachLimit?.value}`);
        expect(search).not.toContain("umkreis");
        expect(search).not.toMatch(/\d{2}\.\d{2,}/);
        for (const name of names) expect(decodeURIComponent(search).toLowerCase()).not.toContain(name);
      }
    }
  });
});

describe("isSavedTab (Plan 0057, E9)", () => {
  it("erkennt die drei Darstellungen der Merkliste", () => {
    expect(isSavedTab("merkliste")).toBe(true);
    expect(isSavedTab("merkliste-karte")).toBe(true);
    expect(isSavedTab("merkliste-kalender")).toBe(true);
    expect(isSavedTab("entdecken")).toBe(false);
    expect(isSavedTab("karte")).toBe(false);
    expect(isSavedTab("anbieter")).toBe(false);
  });
});

describe("tabSection", () => {
  it("ordnet Liste und Karte dem Tab „Entdecken“ zu (Plan 0005, E5)", () => {
    expect(tabSection("entdecken")).toBe("entdecken");
    expect(tabSection("karte")).toBe("entdecken");
    expect(tabSection("anbieter")).toBe("anbieter");
    expect(tabSection("merkliste")).toBe("merkliste");
  });

  it("ordnet Karte und Kalender der Merkliste dem Tab „Merkliste“ zu (Plan 0025, E4)", () => {
    expect(tabSection("merkliste-karte")).toBe("merkliste");
    expect(tabSection("merkliste-kalender")).toBe("merkliste");
  });
});
