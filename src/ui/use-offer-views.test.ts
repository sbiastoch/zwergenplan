import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "../domain/filter.ts";
import type { Origin } from "../domain/reach.ts";
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

  describe("Entfernung (Plan 0004, E6/E7)", () => {
    // Gostenhof; „nah“ liegt beim Theater (226 m), „fern“ bei der Gemeinde (3 008 m)
    const origin: Origin = { source: "stadtteil", point: { lat: 49.448, lon: 11.058 }, label: "Gostenhof" };
    const at = (o: SiteOffer, lat: number, lon: number): SiteOffer => ({
      ...o,
      venue: { ...o.venue, geo: { lat, lon } },
    });
    const nah = at(offer("nah", "2026-10-10"), 49.4495, 11.0601);
    const nahZwei = at(offer("nah-zwei", "2026-10-11"), 49.4495, 11.0601);
    const fern = at(offer("fern", "2026-10-12"), 49.4301, 11.0892);
    const within2km: Route = { tab: "entdecken", filter: { ...EMPTY_FILTER, reachLimit: { kind: "km", value: 2 } } };

    it("kennt ohne Startpunkt keine Entfernung", () => {
      expect(render({ offers: [nah] }).reachOf(nah)).toBeUndefined();
    });

    it("rechnet je Koordinate einmal", () => {
      const v = render({ offers: [nah, nahZwei, fern], origin });
      const reach = v.reachOf(nah);
      expect(reach?.kind).toBe("luftlinie");
      expect(Math.round(reach?.meters ?? 0)).toBe(226);
      // gleicher Ort, gleiches (zwischengespeichertes) Ergebnis
      expect(v.reachOf(nahZwei)).toBe(reach);
      expect(Math.round(v.reachOf(fern)?.meters ?? 0)).toBe(3008);
    });

    it("wendet den Umkreis nur mit Startpunkt an, auch im Kalender", () => {
      expect(ids(render({ offers: [nah, fern], route: within2km }).visible)).toEqual(["nah", "fern"]);
      expect(ids(render({ offers: [nah, fern], route: within2km, origin }).visible)).toEqual(["nah"]);
      const kalender = render({ offers: [nah, fern], route: { ...within2km, tab: "kalender" }, origin });
      expect([...kalender.calendar.index.keys()]).toEqual(["2026-10-10"]);
      expect(kalender.calendar.lastDay).toBe("2026-10-10");
      // Der Datenhorizont bleibt ungefiltert
      expect(kalender.calendar.dataEnd).toBe("2026-10-12");
    });

    it("Orte für die Karte folgen den sichtbaren Angeboten, mit Startpunkt nach Entfernung (Plan 0005, E6)", () => {
      const karte: Route = { tab: "karte", filter: EMPTY_FILTER };
      const keys = (v: OfferViews) => v.places.map((p) => [p.key, p.offers.map((o) => o.title)]);
      // nur in der Kartenansicht
      expect(render({ offers: [nah, nahZwei, fern] }).places).toEqual([]);
      // gleicher Ort → ein Ort; ohne Startpunkt nach Name (beide „Ort“), also in Reihenfolge des Auftretens
      expect(keys(render({ offers: [fern, nah, nahZwei], route: karte }))).toEqual([
        ["49.4301,11.0892", ["fern"]],
        ["49.4495,11.0601", ["nah", "nah-zwei"]],
      ]);
      // mit Startpunkt nach Entfernung
      expect(keys(render({ offers: [fern, nah, nahZwei], route: karte, origin }))[0]?.[0]).toBe("49.4495,11.0601");
      // Umkreis und Alter wirken wie in der Liste
      expect(keys(render({ offers: [nah, fern], route: { ...within2km, tab: "karte" }, origin }))).toEqual([
        ["49.4495,11.0601", ["nah"]],
      ]);
      const gross = at(GROSS, 49.4301, 11.0892);
      expect(keys(render({ offers: [nah, gross], route: karte, birthDate: "2026-05-01" }))).toEqual([
        ["49.4495,11.0601", ["nah"]],
      ]);
    });

    it("Startausschnitt der Karte hängt nie am Umkreis um einen Standort (Arch-Review B1)", () => {
      const standort: Origin = { source: "standort", point: { lat: 49.4495, lon: 11.0601 }, label: "Mein Standort" };
      const kartenmitte: Origin = { ...standort, source: "karte", label: "Kartenmitte" };
      const karte: Route = { tab: "karte", filter: EMPTY_FILTER };
      const umkreis: Route = { ...within2km, tab: "karte" };
      const plain = render({ offers: [nah, fern], route: karte }).startCamera;
      expect(plain).toEqual({ bounds: { minLat: 49.4301, minLon: 11.0601, maxLat: 49.4495, maxLon: 11.0892 } });
      // Der Umkreis blendet „fern“ aus der Liste aus, der Ausschnitt bleibt trotzdem bei allen Orten.
      const mitStandort = render({ offers: [nah, fern], route: umkreis, origin: standort });
      expect(mitStandort.places.map((p) => p.key)).toEqual(["49.4495,11.0601"]);
      expect(mitStandort.startCamera).toEqual(plain);
      expect(render({ offers: [nah, fern], route: umkreis, origin: kartenmitte }).startCamera).toEqual(plain);
      // Andere Filter wirken wie auf der Karte
      expect(
        render({ offers: [nah, fern], route: { tab: "karte", filter: { ...EMPTY_FILTER, formats: ["kurs"] } } })
          .startCamera,
      ).toEqual({ center: { lat: 49.454, lon: 11.077 }, zoom: 11 });
      expect(render({ offers: [nah, fern] }).startCamera).toBeUndefined();
    });

    it("zählt heute beendete Termine nur im Umkreis (B2)", () => {
      const heuteFern = at(offer("heute-fern", "2026-10-05"), 49.4301, 11.0892);
      const route: Route = { ...within2km, tab: "kalender" };
      expect(render({ offers: [nah, heuteFern], route }).calendar.endedToday).toBe(1);
      expect(render({ offers: [nah, heuteFern], route, origin }).calendar.endedToday).toBe(0);
    });
  });

  it("liefert Merkliste und offenes Angebot aus den Daten", () => {
    const v = render({ savedIds: [GROSS.id, "weg--weg--weg"], route: { ...ENTDECKEN, offerId: BABY.id } });
    expect(ids(v.saved)).toEqual(["gross"]);
    expect(v.detailOffer).toBe(BABY);
    expect(render({ route: { ...ENTDECKEN, offerId: "weg--weg--weg" } }).detailOffer).toBeUndefined();
  });
});
