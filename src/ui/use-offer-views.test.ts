import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "../domain/filter.ts";
import { placeKey } from "../domain/place-key.ts";
import { airlineReach, type Origin, type ReachFn } from "../domain/reach.ts";
import type { Route } from "../domain/route.ts";
import { EMPTY_SAVED_FILTER, type SavedFilter } from "../domain/saved.ts";
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
    venue: { name: "Ort", address: "Beispielweg 1", geo: { lat: 49.45, lon: 11.08 } },
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
/** Titel der Merkliste; `saved` trägt je Angebot den angezeigten Termin (`savedOffers`) */
const savedTitles = (v: OfferViews) => ids(v.saved.map((o) => o.offer));

describe("useOfferViews", () => {
  it("zeigt kommende Angebote, gruppiert nach Tag, ohne Kind alles", () => {
    const v = render({});
    expect(ids(v.visible)).toEqual(["baby", "gross"]);
    expect(v.unfitCount).toBe(0);
    expect(v.page.groups.map((g) => g.day)).toEqual(["2026-10-10", "2026-10-12"]);
    expect(v.page.remaining).toBe(0);
    expect(v.ageOnly).toBe(true);
  });

  it("filtert nach Zeitraum und stellt Regelmäßiges an den ersten Termin darin (Plan 0023, E6)", () => {
    const weekly: SiteOffer = {
      ...offer("woche", "2026-10-07", undefined, "regelmaessig"),
      sessions: ["2026-10-07", "2026-10-14", "2026-10-21"].map((d) => ({
        start: fromBerlinLocal(`${d}T10:00`),
        end: fromBerlinLocal(`${d}T11:00`),
      })),
    };
    const route: Route = { ...ENTDECKEN, filter: { ...EMPTY_FILTER, range: { from: "2026-10-11", to: "2026-10-20" } } };
    const v = render({ offers: [...OFFERS, weekly], route });
    expect(ids(v.visible)).toEqual(["gross", "woche"]);
    expect(v.page.groups.map((g) => g.day)).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("blendet mit Geburtsdatum unpassende Angebote aus und markiert sie", () => {
    const v = render({ birthDate: "2026-05-01" });
    expect(ids(v.visible)).toEqual(["baby"]);
    expect(v.unfitCount).toBe(1);
    expect(v.unfitIds.has(GROSS.id)).toBe(true);
  });

  it("Altersfilter aus: alles sichtbar, unpassende gezählt und markiert (Plan 0021, E1)", () => {
    let result: OfferViews | undefined;
    function Probe() {
      result = useOfferViews({ offers: OFFERS, route: ENTDECKEN, birthDate: "2026-05-01", savedIds: [], now: NOW });
      // Update während des Renderns: React rendert sofort neu, wie nach einem Tipp auf den Schalter.
      if (result.ageOnly) result.setAgeOnly(false);
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(result?.ageOnly).toBe(false);
    expect(ids(result?.visible ?? [])).toEqual(["baby", "gross"]);
    expect(result?.unfitCount).toBe(1);
    expect(result?.unfitIds.has(GROSS.id)).toBe(true);
  });

  it("Umschalten des Altersfilters beginnt die Liste wieder mit dem ersten Schritt (Plan 0021, E1)", () => {
    // 45 Angebote an verschiedenen Tagen: ein Schritt (40) reicht nicht
    const many = Array.from({ length: 45 }, (_, i) =>
      offer(`o${i}`, `2026-11-${String((i % 28) + 1).padStart(2, "0")}`),
    );
    let result: OfferViews | undefined;
    let step = 0;
    function Probe() {
      result = useOfferViews({ offers: many, route: ENTDECKEN, birthDate: undefined, savedIds: [], now: NOW });
      // Updates während des Renderns: erst „Weitere zeigen“, dann den Schalter umlegen
      if (step === 0) {
        step = 1;
        result.showMore();
      } else if (step === 1) {
        step = 2;
        result.setAgeOnly(false);
      }
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(step).toBe(2);
    expect(result?.page.remaining).toBe(5);
  });

  describe("Kalender der Merkliste (Plan 0025, E5, E8)", () => {
    const kalender: Route = { tab: "merkliste-kalender", filter: EMPTY_FILTER };

    it("ist nur in der Darstellung Kalender der Merkliste gefüllt", () => {
      for (const tab of ["entdecken", "karte", "anbieter", "merkliste", "merkliste-karte"] as const) {
        expect(render({ route: { tab, filter: EMPTY_FILTER }, savedIds: [BABY.id] }).savedCalendar, tab).toBe(
          undefined,
        );
      }
      expect(render({ route: kalender, savedIds: [BABY.id] }).savedCalendar).toBeDefined();
    });

    // Das Alter wirkt nur als Prädikat je Termin (Plan 0028), siehe „regelmäßig, Kind wächst erst hinein“
    it("zeigt nur gemerkte Termine; Startseiten-Filter, Wegzeit und Altersfilter wirken nicht", () => {
      const v = render({
        route: { ...kalender, filter: { ...EMPTY_FILTER, formats: ["kurs"] } },
        birthDate: "2026-05-01",
        savedIds: [GROSS.id, VORBEI.id],
      });
      expect([...(v.savedCalendar?.index.keys() ?? [])]).toEqual(["2026-10-12"]);
      // ohne Merklisten-Filter (Etappe 4) blendet nichts aus
      expect(v.savedCalendar?.allIndex).toEqual(v.savedCalendar?.index);
    });

    it("startet mit der Woche von heute und zugeklapptem Monat", () => {
      const cal = render({ route: kalender, savedIds: [BABY.id] }).savedCalendar;
      expect(cal?.selection).toEqual({ unit: "woche", day: "2026-10-05" });
      expect(cal?.monthOpen).toBe(false);
    });

    it("kennt den Datenhorizont des ganzen Datenstands, nicht nur des Gemerkten (E5, B8)", () => {
      const kurs = offer("kurs", "2026-10-20", undefined, "kurs");
      const v = render({ offers: [...OFFERS, kurs], route: kalender, savedIds: [BABY.id] });
      expect(v.savedCalendar?.dataEnd).toBe("2026-10-20");
    });

    it("zählt ein gemerktes Angebot, dessen einziger Termin heute schon vorbei ist (M7, B2)", () => {
      const heute = offer("heute", "2026-10-05"); // 10–11 Uhr, um 12 Uhr vorbei
      const v = render({ offers: [...OFFERS, heute], route: kalender, savedIds: [heute.id, BABY.id] });
      expect(savedTitles(v)).toEqual(["baby"]);
      expect(v.savedCalendar?.endedToday).toBe(1);
      // nicht gemerkt: zählt nicht
      expect(
        render({ offers: [...OFFERS, heute], route: kalender, savedIds: [BABY.id] }).savedCalendar?.endedToday,
      ).toBe(0);
      // um 10:30 läuft der Termin noch
      const running = render({
        offers: [heute],
        route: kalender,
        savedIds: [heute.id],
        now: new Date("2026-10-05T10:30:00+02:00"),
      });
      expect(running.savedCalendar?.endedToday).toBe(0);
    });

    it("klemmt die Auswahl auf heute, wenn „jetzt“ über Mitternacht springt", () => {
      const before = new Date("2026-10-05T23:59:40+02:00");
      const after = new Date("2026-10-06T00:00:10+02:00");
      let result: OfferViews | undefined;
      function Probe() {
        const [now, setNow] = useState(before);
        result = useOfferViews({ offers: OFFERS, route: kalender, birthDate: undefined, savedIds: [BABY.id], now });
        // Update während des Renderns: React rendert sofort neu, der Kalender-Zustand bleibt erhalten.
        if (now === before) setNow(after);
        return null;
      }
      renderToStaticMarkup(createElement(Probe));
      expect(result?.savedCalendar?.selection).toEqual({ unit: "woche", day: "2026-10-06" });
    });

    it("behält Auswahl und Monat beim Wechsel der Darstellung", () => {
      let result: OfferViews | undefined;
      let step = 0;
      function Probe() {
        const [route, setRoute] = useState<Route>(kalender);
        result = useOfferViews({ offers: OFFERS, route, birthDate: undefined, savedIds: [BABY.id], now: NOW });
        if (step === 0) {
          step = 1;
          result.savedCalendar?.setSelection({ unit: "tag", day: "2026-10-10" });
          result.savedCalendar?.setMonthOpen(true);
          setRoute({ tab: "merkliste", filter: EMPTY_FILTER });
        } else if (step === 1) {
          step = 2;
          setRoute(kalender);
        }
        return null;
      }
      renderToStaticMarkup(createElement(Probe));
      expect(step).toBe(2);
      expect(result?.savedCalendar?.selection).toEqual({ unit: "tag", day: "2026-10-10" });
      expect(result?.savedCalendar?.monthOpen).toBe(true);
    });
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

    it("wendet die Wegzeit-Grenze nur mit Wegzeit an", () => {
      expect(ids(render({ offers: [nah, fern], route: within20 }).visible)).toEqual(["nah", "fern"]);
      expect(ids(render({ offers: [nah, fern], route: within20, reach: airlineReach(origin) }).visible)).toEqual([
        "nah",
        "fern",
      ]);
      expect(ids(render({ offers: [nah, fern], route: within20, reach: wegzeit }).visible)).toEqual(["nah"]);
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

    it("Karte der Merkliste: Orte der gemerkten Angebote, Startausschnitt wie in „Entdecken“ (Plan 0025, E4)", () => {
      const merklisteKarte: Route = { tab: "merkliste-karte", filter: EMPTY_FILTER };
      const gross = at(GROSS, 49.46, 11.1);
      const all = [nah, nahZwei, fern, gross, VORBEI];
      // nur gemerkte mit kommendem Termin; nah und nahZwei teilen sich einen Ort
      const v = render({ offers: all, route: merklisteKarte, savedIds: [nah.id, nahZwei.id, VORBEI.id] });
      expect(v.map?.placeCount).toBe(1);
      // Startseiten-Filter, Wegzeit und Alter wirken auf der Merkliste nicht
      const filtered = render({
        offers: all,
        route: { ...within20, tab: "merkliste-karte", filter: { ...within20.filter, formats: ["kurs"] } },
        reach: wegzeit,
        birthDate: "2026-05-01",
        savedIds: [fern.id, gross.id],
      });
      expect(filtered.map?.placeCount).toBe(2);
      // Kamera-Regel (ADR 0008): dieselbe Datenbasis wie die Karte in „Entdecken“, nie die Merkliste
      const plain = render({ offers: all, route: { tab: "karte", filter: EMPTY_FILTER } }).map?.cameraOffers;
      expect(v.map?.cameraOffers).toEqual(plain);
      expect(filtered.map?.cameraOffers).toEqual(plain);
      // Liste der Merkliste: keine Karte
      expect(render({ offers: all, route: { tab: "merkliste", filter: EMPTY_FILTER }, savedIds: [nah.id] }).map).toBe(
        undefined,
      );
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

    it("der Kalender der Merkliste kennt keine Wegzeit-Grenze (Plan 0025, E8)", () => {
      const heuteFern = at(offer("heute-fern", "2026-10-05"), 49.4301, 11.0892);
      const route: Route = { ...within20, tab: "merkliste-kalender" };
      const v = render({ offers: [nah, fern, heuteFern], route, reach: wegzeit, savedIds: [fern.id, heuteFern.id] });
      expect([...(v.savedCalendar?.index.keys() ?? [])]).toEqual(["2026-10-12"]);
      expect(v.savedCalendar?.endedToday).toBe(1);
    });
  });

  describe("regelmäßig, Kind wächst erst hinein (Plan 0028)", () => {
    // 6–24 Monate; geboren am 20.4.: am 7.10. und 14.10. 5 Monate, am 21.10. 6
    const treff: SiteOffer = {
      ...offer("treff", "2026-10-07", { minMonths: 6, maxMonths: 24 }, "regelmaessig"),
      sessions: ["2026-10-07", "2026-10-14", "2026-10-21"].map((d) => ({
        start: fromBerlinLocal(`${d}T10:00`),
        end: fromBerlinLocal(`${d}T11:00`),
      })),
    };
    const input = { offers: [BABY, treff], birthDate: "2026-04-20" };

    it("steht in der Liste erst am ersten passenden Termin", () => {
      expect(render(input).page.groups.map((g) => g.day)).toEqual(["2026-10-10", "2026-10-21"]);
    });

    it("steht im Kalender der Merkliste nur an Tagen, an denen es zum Alter passt (Plan 0025, E5; Plan 0028, E3)", () => {
      const route: Route = { tab: "merkliste-kalender", filter: EMPTY_FILTER };
      const savedIds = [treff.id, BABY.id];
      const kalender = render({ ...input, route, savedIds }).savedCalendar;
      expect([...(kalender?.index.keys() ?? [])]).toEqual(["2026-10-10", "2026-10-21"]);
      // Unpassende Termine zählen nicht als „blendet der Filter aus“: Das meint erst den Merklisten-Filter (Etappe 4).
      expect([...(kalender?.allIndex.keys() ?? [])]).toEqual(["2026-10-10", "2026-10-21"]);
      // ohne Geburtsdatum alle Termine
      const ohneKind = render({ ...input, birthDate: undefined, route, savedIds }).savedCalendar;
      expect([...(ohneKind?.index.keys() ?? [])].sort()).toEqual([
        "2026-10-07",
        "2026-10-10",
        "2026-10-14",
        "2026-10-21",
      ]);
    });

    it("ein unpassender Termin, der heute vorbei ist, zählt im Kalender der Merkliste nicht (Arch-Review 0025, M1)", () => {
      // Mo 5.10. 10–11 Uhr, um 12 Uhr vorbei; das Kind ist dann 5 Monate alt, der Treff passt ab 6
      const heute: SiteOffer = {
        ...treff,
        sessions: [
          { start: fromBerlinLocal("2026-10-05T10:00"), end: fromBerlinLocal("2026-10-05T11:00") },
          ...treff.sessions,
        ],
      };
      const route: Route = { tab: "merkliste-kalender", filter: EMPTY_FILTER };
      const v = render({ ...input, offers: [BABY, heute], route, savedIds: [heute.id] });
      expect(v.savedCalendar?.endedToday).toBe(0);
      // ohne Geburtsdatum zählt er
      expect(render({ offers: [BABY, heute], route, savedIds: [heute.id] }).savedCalendar?.endedToday).toBe(1);
    });

    it("Altersfilter aus: am nächsten Termin, wie ohne Kind", () => {
      let result: OfferViews | undefined;
      function Probe() {
        result = useOfferViews({ ...input, route: ENTDECKEN, savedIds: [], now: NOW });
        if (result.ageOnly) result.setAgeOnly(false);
        return null;
      }
      renderToStaticMarkup(createElement(Probe));
      expect(result?.page.groups.map((g) => g.day)).toEqual(["2026-10-07", "2026-10-10"]);
    });

    it("sortiert die Merkliste nach dem ersten passenden Termin", () => {
      const savedIds = [treff.id, BABY.id];
      expect(savedTitles(render({ ...input, birthDate: undefined, savedIds }))).toEqual(["treff", "baby"]);
      expect(savedTitles(render({ ...input, savedIds }))).toEqual(["baby", "treff"]);
    });
  });

  describe("Filter der Merkliste (Plan 0025, E6)", () => {
    // Kurs am 12.10., regelmäßig am 7.10. und 4.11., einmalig heute 10–11 Uhr (um 12 Uhr vorbei)
    const kurs = offer("kurs", "2026-10-12", undefined, "kurs");
    const treff: SiteOffer = {
      ...offer("treff", "2026-10-07", undefined, "regelmaessig"),
      sessions: ["2026-10-07", "2026-11-04"].map((d) => ({
        start: fromBerlinLocal(`${d}T10:00`),
        end: fromBerlinLocal(`${d}T11:00`),
      })),
    };
    const heute = offer("heute", "2026-10-05");
    const offers = [kurs, treff, heute];
    const savedIds = [kurs.id, treff.id, heute.id];
    const kurse: SavedFilter = { ...EMPTY_SAVED_FILTER, formats: ["kurs"] };
    const abNov: SavedFilter = { ...EMPTY_SAVED_FILTER, range: { from: "2026-11-01" } };
    const visibleTitles = (v: OfferViews) => ids(v.savedVisible.map((o) => o.offer));

    it("ohne Filter sind alle gemerkten sichtbar, nichts gilt als gefiltert", () => {
      const v = render({ offers, savedIds, route: { tab: "merkliste", filter: EMPTY_FILTER } });
      expect(visibleTitles(v)).toEqual(["treff", "kurs"]);
      expect(v.savedFiltered).toBe(false);
    });

    it("Schnellwahlen bis zum Ende des ganzen Datenstands (E7)", () => {
      const route: Route = { tab: "merkliste", filter: EMPTY_FILTER };
      // letzter Termin im Datenstand am 4.11.: nur „ab Nov.“
      expect(render({ offers, savedIds, route }).savedQuick.map((q) => q.month)).toEqual(["2026-11"]);
      expect(render({ offers: [kurs], savedIds, route }).savedQuick).toEqual([]);
    });

    it("Liste: Format und Zeitraum wirken, der Termin ist der im Zeitraum", () => {
      const route: Route = { tab: "merkliste", filter: EMPTY_FILTER };
      const v = render({ offers, savedIds, route, savedFilter: kurse });
      expect(visibleTitles(v)).toEqual(["kurs"]);
      expect(v.savedFiltered).toBe(true);
      // die Merkliste selbst (Badge, Export) bleibt ungefiltert
      expect(savedTitles(v)).toEqual(["treff", "kurs"]);
      const nov = render({ offers, savedIds, route, savedFilter: abNov });
      expect(visibleTitles(nov)).toEqual(["treff"]);
      expect(nov.savedVisible[0]?.session.start).toBe(fromBerlinLocal("2026-11-04T10:00"));
    });

    it("Karte: Orte nur der passenden", () => {
      const fern: SiteOffer = { ...kurs, venue: { ...kurs.venue, geo: { lat: 49.5, lon: 11.2 } } };
      const route: Route = { tab: "merkliste-karte", filter: EMPTY_FILTER };
      const input = { offers: [fern, treff], savedIds: [fern.id, treff.id], route };
      expect(render(input).map?.placeCount).toBe(2);
      expect(render({ ...input, savedFilter: kurse }).map?.placeCount).toBe(1);
    });

    it("Kalender: Format wirkt, der Zeitraum nicht; `allIndex` bleibt ungefiltert", () => {
      const route: Route = { tab: "merkliste-kalender", filter: EMPTY_FILTER };
      const v = render({ offers, savedIds, route, savedFilter: kurse });
      expect([...(v.savedCalendar?.index.keys() ?? [])]).toEqual(["2026-10-12"]);
      // „heute“ hat keinen kommenden Termin mehr und steht deshalb in keinem Index
      expect([...(v.savedCalendar?.allIndex.keys() ?? [])].sort()).toEqual(["2026-10-07", "2026-10-12", "2026-11-04"]);
      // „heute schon vorbei“ nur, was zum Filter passt (M7 plus Filter)
      expect(v.savedCalendar?.endedToday).toBe(0);
      expect(render({ offers, savedIds, route }).savedCalendar?.endedToday).toBe(1);
      // der Zeitraum gilt im Kalender nicht, also auch nicht als Filter
      const nov = render({ offers, savedIds, route, savedFilter: abNov });
      expect(visibleTitles(nov)).toEqual(["treff", "kurs"]);
      expect(nov.savedFiltered).toBe(false);
      expect(nov.savedCalendar?.index).toEqual(nov.savedCalendar?.allIndex);
    });
  });

  it("liefert Merkliste und offenes Angebot aus den Daten", () => {
    const v = render({ savedIds: [GROSS.id, "weg--weg--weg"], route: { ...ENTDECKEN, offerId: BABY.id } });
    expect(savedTitles(v)).toEqual(["gross"]);
    expect(v.detailOffer).toBe(BABY);
    expect(render({ route: { ...ENTDECKEN, offerId: "weg--weg--weg" } }).detailOffer).toBeUndefined();
  });
});
