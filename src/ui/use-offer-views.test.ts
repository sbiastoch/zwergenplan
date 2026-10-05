import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "../domain/filter.ts";
import { placeKey } from "../domain/place-key.ts";
import { airlineReach, type Origin, type ReachFn } from "../domain/reach.ts";
import type { Route } from "../domain/route.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { fromBerlinLocal } from "../domain/time.ts";
import { type OfferViews, type OfferViewsInput, useOfferViews } from "./use-offer-views.ts";

// Eigene Testangebote statt der Zod-Fixtures: src/ui bleibt zod-frei (no-zod-in-client), auch im Test.
const NOW = new Date("2026-10-05T12:00:00+02:00");

function offer(id: string, day: string, age?: SiteOffer["age"], format: SiteOffer["format"] = "einmalig"): SiteOffer {
  return {
    id: `anbieter--${id}--ort`,
    providerId: "anbieter",
    venueId: "ort",
    title: id,
    summary: "Zusammenfassung",
    topics: ["musik"],
    format,
    ...(age ? { age } : {}),
    sessions: [{ start: fromBerlinLocal(`${day}T10:00`), end: fromBerlinLocal(`${day}T11:00`) }],
    registration: "mit-anmeldung",
    cost: "kostenlos",
    availability: { status: "unbekannt", checkedAt: "2026-10-03T10:00:00+02:00" },
    url: "https://example.org/",
    sourceUrl: "https://example.org/",
    providerName: "Anbieter",
    venue: { name: "Ort", address: "Beispielweg 1", ring: "innen", geo: { lat: 49.45, lon: 11.08 } },
  };
}

const BABY = offer("baby", "2026-10-10", { minMonths: 0, maxMonths: 12 });
const GROSS = offer("gross", "2026-10-12", { minMonths: 24, maxMonths: 36 });
const VORBEI = offer("vorbei", "2026-10-01");
const OFFERS = [BABY, GROSS, VORBEI];
const ENTDECKEN: Route = { tab: "entdecken", filter: EMPTY_FILTER };

/** Rendert den Hook einmal auf dem Server (kein DOM in Unit-Tests) und gibt sein Ergebnis zurück. */
function render(input: Partial<OfferViewsInput>): OfferViews {
  let result: OfferViews | undefined;
  function Probe() {
    result = useOfferViews({
      offers: OFFERS,
      route: ENTDECKEN,
      birthDate: undefined,
      ageOnly: true,
      savedIds: [],
      now: NOW,
      ...input,
    });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!result) throw new Error("Hook nicht gerendert");
  return result;
}

const ids = (offers: readonly SiteOffer[]) => offers.map((o) => o.title);

describe("useOfferViews", () => {
  it("zeigt kommende Angebote, gruppiert nach Tag, ohne Kind alles", () => {
    const v = render({});
    expect(ids(v.visible)).toEqual(["baby", "gross"]);
    expect(v.hiddenCount).toBe(0);
    expect(v.page.groups.map((g) => g.day)).toEqual(["2026-10-10", "2026-10-12"]);
    expect(v.page.remaining).toBe(0);
    expect(v.showUnfit).toBe(false);
  });

  it("blendet mit Geburtsdatum unpassende Angebote aus und markiert sie", () => {
    const v = render({ birthDate: "2026-05-01" });
    expect(ids(v.visible)).toEqual(["baby"]);
    expect(v.hiddenCount).toBe(1);
    expect(v.unfitIds.has(GROSS.id)).toBe(true);
  });

  it("ohne „nur passende“ bleibt alles sichtbar", () => {
    const v = render({ birthDate: "2026-05-01", ageOnly: false });
    expect(ids(v.visible)).toEqual(["baby", "gross"]);
    expect(v.unfitIds.has(GROSS.id)).toBe(true);
  });

  it("baut den Kalender-Index nur in der Kalenderansicht, startet heute", () => {
    expect(render({}).calendar.index.size).toBe(0);
    const v = render({ route: { tab: "kalender", filter: EMPTY_FILTER } });
    expect([...v.calendar.index.keys()]).toEqual(["2026-10-10", "2026-10-12"]);
    expect(v.calendar.lastDay).toBe("2026-10-12");
    expect(v.calendar.day).toBe("2026-10-05");
    expect(v.calendar.monthOpen).toBe(false);
  });

  it("baut den ungefilterten Kalender-Index nur in der Kalenderansicht (Plan 0008, E12)", () => {
    expect(render({}).calendar.allIndex.size).toBe(0);
    const v = render({
      birthDate: "2026-05-01",
      route: { tab: "kalender", filter: { ...EMPTY_FILTER, formats: ["kurs"] } },
    });
    // Filter und Alter blenden beide aus: nur im ungefilterten Index stehen sie
    expect(v.calendar.index.size).toBe(0);
    expect([...v.calendar.allIndex.keys()]).toEqual(["2026-10-10", "2026-10-12"]);
    expect(v.calendar.allIndex.get("2026-10-12")?.map((o) => o.offer.title)).toEqual(["gross"]);
    // Vergangenes fehlt auch dort
    expect(v.calendar.allIndex.has("2026-10-01")).toBe(false);
  });

  it("kennt den Datenhorizont ungefiltert, die Navigationsgrenze gefiltert (B8)", () => {
    const kurs = offer("kurs", "2026-10-20", undefined, "kurs");
    const v = render({
      offers: [...OFFERS, kurs],
      route: { tab: "kalender", filter: { ...EMPTY_FILTER, formats: ["einmalig"] } },
    });
    expect(v.calendar.lastDay).toBe("2026-10-12");
    expect(v.calendar.dataEnd).toBe("2026-10-20");
  });

  it("zählt heute beendete Termine aller filterpassenden Angebote, auch ohne kommenden Termin (B2)", () => {
    const heute = offer("heute", "2026-10-05"); // 10–11 Uhr, um 12 Uhr vorbei
    const kalender: Route = { tab: "kalender", filter: EMPTY_FILTER };
    const v = render({ offers: [...OFFERS, heute], route: kalender });
    expect(ids(v.visible)).not.toContain("heute");
    expect(v.calendar.endedToday).toBe(1);
    const nurKurse = render({
      offers: [...OFFERS, heute],
      route: { tab: "kalender", filter: { ...EMPTY_FILTER, formats: ["kurs"] } },
    });
    expect(nurKurse.calendar.endedToday).toBe(0);
    // Mittags um 10:30 läuft der Termin noch
    expect(
      render({ offers: [heute], route: kalender, now: new Date("2026-10-05T10:30:00+02:00") }).calendar.endedToday,
    ).toBe(0);
  });

  it("klemmt den Kalendertag auf heute, wenn „jetzt“ über Mitternacht springt", () => {
    const before = new Date("2026-10-05T23:59:40+02:00");
    const after = new Date("2026-10-06T00:00:10+02:00");
    let result: OfferViews | undefined;
    function Probe() {
      const [now, setNow] = useState(before);
      result = useOfferViews({
        offers: OFFERS,
        route: { tab: "kalender", filter: EMPTY_FILTER },
        birthDate: undefined,
        ageOnly: true,
        savedIds: [],
        now,
      });
      // Update während des Renderns: React rendert sofort neu, der Kalender-Zustand bleibt erhalten.
      if (now === before) setNow(after);
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(result?.calendar.day).toBe("2026-10-06");
  });

  describe("Entfernung und Wegzeit (Plan 0004, E6/E7; Plan 0009, E8/E11)", () => {
    // Gostenhof; „nah“ liegt beim Theater (226 m), „fern“ bei der Gemeinde (3 008 m)
    const origin: Origin = { source: "stadtteil", point: { lat: 49.448, lon: 11.058 }, label: "Gostenhof" };
    const at = (o: SiteOffer, lat: number, lon: number): SiteOffer => ({
      ...o,
      venue: { ...o.venue, geo: { lat, lon } },
    });
    const nah = at(offer("nah", "2026-10-10"), 49.4495, 11.0601);
    const nahZwei = at(offer("nah-zwei", "2026-10-11"), 49.4495, 11.0601);
    const fern = at(offer("fern", "2026-10-12"), 49.4301, 11.0892);
    /** Wegzeit wie aus der Tabelle: „nah“ 4 Min., „fern“ 33 Min.; zählt die Aufrufe */
    const calls: string[] = [];
    const wegzeit: ReachFn = ({ geo }) => {
      calls.push(placeKey(geo));
      return { kind: "oepnv", minutes: geo.lat === 49.4301 ? 33 : 4, byFoot: false };
    };
    const within20: Route = {
      tab: "entdecken",
      filter: { ...EMPTY_FILTER, reachLimit: { kind: "minuten", value: 20 } },
    };

    it("kennt ohne Startpunkt keine Entfernung", () => {
      expect(render({ offers: [nah] }).reachOf(nah)).toBeUndefined();
    });

    it("reachOf nutzt die Wegzeit-Funktion, je Koordinate einmal", () => {
      calls.length = 0;
      const v = render({ offers: [nah, nahZwei, fern], reach: wegzeit });
      const reach = v.reachOf(nah);
      expect(reach).toEqual({ kind: "oepnv", minutes: 4, byFoot: false });
      // gleicher Ort, gleiches (zwischengespeichertes) Ergebnis
      expect(v.reachOf(nahZwei)).toBe(reach);
      expect(v.reachOf(fern)).toEqual({ kind: "oepnv", minutes: 33, byFoot: false });
      expect(calls.filter((k) => k === placeKey(nah.venue.geo))).toHaveLength(1);
    });

    it("Luftlinie als Rückfall (E11)", () => {
      const v = render({ offers: [nah, fern], reach: airlineReach(origin) });
      const reach = v.reachOf(nah);
      expect(reach?.kind === "luftlinie" && Math.round(reach.meters)).toBe(226);
    });

    it("wendet die Wegzeit-Grenze nur mit Wegzeit an, auch im Kalender", () => {
      expect(ids(render({ offers: [nah, fern], route: within20 }).visible)).toEqual(["nah", "fern"]);
      expect(ids(render({ offers: [nah, fern], route: within20, reach: airlineReach(origin) }).visible)).toEqual([
        "nah",
        "fern",
      ]);
      expect(ids(render({ offers: [nah, fern], route: within20, reach: wegzeit }).visible)).toEqual(["nah"]);
      const kalender = render({ offers: [nah, fern], route: { ...within20, tab: "kalender" }, reach: wegzeit });
      expect([...kalender.calendar.index.keys()]).toEqual(["2026-10-10"]);
      expect(kalender.calendar.lastDay).toBe("2026-10-10");
      // Der Datenhorizont bleibt ungefiltert
      expect(kalender.calendar.dataEnd).toBe("2026-10-12");
    });

    it("Kartenansicht: Zahl der Orte folgt den sichtbaren Angeboten (Plan 0005, E7)", () => {
      const karte: Route = { tab: "karte", filter: EMPTY_FILTER };
      // nur in der Kartenansicht
      expect(render({ offers: [nah, nahZwei, fern] }).map).toBeUndefined();
      // gleicher Ort → ein Ort
      expect(render({ offers: [fern, nah, nahZwei], route: karte }).map?.placeCount).toBe(2);
      // Wegzeit und Alter wirken wie in der Liste
      expect(
        render({ offers: [nah, fern], route: { ...within20, tab: "karte" }, reach: wegzeit }).map?.placeCount,
      ).toBe(1);
      const gross = at(GROSS, 49.4301, 11.0892);
      expect(render({ offers: [nah, gross], route: karte, birthDate: "2026-05-01" }).map?.placeCount).toBe(1);
    });

    it("Datenbasis des Startausschnitts: alle kommenden Angebote, unabhängig von Filtern, Alter, Startpunkt und Tabelle (Arch-Review B1, m1)", () => {
      const standort: Origin = { source: "standort", point: { lat: 49.4495, lon: 11.0601 }, label: "Mein Standort" };
      const gross = at(GROSS, 49.4301, 11.0892);
      const all = [nah, fern, gross, VORBEI];
      const plain = render({ offers: all, route: { tab: "karte", filter: EMPTY_FILTER } }).map?.cameraOffers;
      // nur kommende, sonst alles
      expect(ids(plain ?? [])).toEqual(["nah", "fern", "gross"]);
      const variants: Partial<OfferViewsInput>[] = [
        { route: { ...within20, tab: "karte" }, reach: wegzeit },
        { route: { ...within20, tab: "karte" }, reach: airlineReach(standort) },
        { route: { tab: "karte", filter: { ...EMPTY_FILTER, formats: ["kurs"] } } },
        { route: { tab: "karte", filter: EMPTY_FILTER }, birthDate: "2026-05-01" },
        {
          route: { ...within20, tab: "karte", filter: { ...within20.filter, cost: ["kostenpflichtig"] } },
          reach: wegzeit,
          birthDate: "2026-05-01",
        },
      ];
      for (const variant of variants) {
        const v = render({ offers: all, ...variant });
        expect(v.map?.cameraOffers, JSON.stringify(variant)).toEqual(plain);
      }
      // Die sichtbaren Orte folgen dagegen Wegzeit und Alter.
      expect(render({ offers: all, ...variants[0] }).map?.placeCount).toBe(1);
    });

    it("zählt heute beendete Termine nur bis zur Wegzeit-Grenze (B2)", () => {
      const heuteFern = at(offer("heute-fern", "2026-10-05"), 49.4301, 11.0892);
      const route: Route = { ...within20, tab: "kalender" };
      expect(render({ offers: [nah, heuteFern], route }).calendar.endedToday).toBe(1);
      expect(render({ offers: [nah, heuteFern], route, reach: wegzeit }).calendar.endedToday).toBe(0);
    });
  });

  it("liefert Merkliste und offenes Angebot aus den Daten", () => {
    const v = render({ savedIds: [GROSS.id, "weg--weg--weg"], route: { ...ENTDECKEN, offerId: BABY.id } });
    expect(ids(v.saved)).toEqual(["gross"]);
    expect(v.detailOffer).toBe(BABY);
    expect(render({ route: { ...ENTDECKEN, offerId: "weg--weg--weg" } }).detailOffer).toBeUndefined();
  });
});
