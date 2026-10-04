import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "../domain/filter.ts";
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

  it("liefert Merkliste und offenes Angebot aus den Daten", () => {
    const v = render({ savedIds: [GROSS.id, "weg--weg--weg"], route: { ...ENTDECKEN, offerId: BABY.id } });
    expect(ids(v.saved)).toEqual(["gross"]);
    expect(v.detailOffer).toBe(BABY);
    expect(render({ route: { ...ENTDECKEN, offerId: "weg--weg--weg" } }).detailOffer).toBeUndefined();
  });
});
