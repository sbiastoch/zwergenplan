import { describe, expect, it } from "vitest";
import { sessionFit } from "./age.ts";
import { groupByNextSession, type Occurrence } from "./agenda.ts";
import { groupByListing, isNewlyListed, listingWeek } from "./listing.ts";
import type { SiteOffer } from "./site-data.ts";
import { FIXTURE_NOW, fixtureKey, fixtureSiteOffers } from "./test-fixtures.ts";

/** Sonntag, 25.10.2026: Ende der Sommerzeit um 3:00 */
const SUNDAY = new Date("2026-10-25T12:00:00+01:00");
const at = (listedAt: string) => listingWeek({ listedAt }, SUNDAY);

describe("listingWeek (Plan 0043, E3)", () => {
  it("ohne listedAt: früher eingestellt", () => {
    expect(listingWeek({}, SUNDAY)).toBe("frueher");
  });

  it("Berliner Kalendertage: 0–6 diese Woche, 7–13 vorige Woche, ab 14 früher", () => {
    expect(at("2026-10-25T05:00:00+01:00")).toBe("diese-woche"); // Tag 0
    expect(at("2026-10-19T00:00:00+02:00")).toBe("diese-woche"); // Tag 6, Mitternacht
    expect(at("2026-10-18T23:59:00+02:00")).toBe("vorige-woche"); // Tag 7
    expect(at("2026-10-12T00:00:00+02:00")).toBe("vorige-woche"); // Tag 13
    expect(at("2026-10-11T23:59:00+02:00")).toBe("frueher"); // Tag 14
  });

  it("nimmt den Berliner Tag, auch wenn UTC noch am Vortag ist", () => {
    // 22:30 UTC am 18.10. = 00:30 am 19.10. in Berlin → Tag 6
    expect(at("2026-10-18T22:30:00Z")).toBe("diese-woche");
    // 23:30 UTC am 25.10. ist in Berlin schon Montag, der 26.10.: Tag 14 statt 13
    expect(listingWeek({ listedAt: "2026-10-12T06:00:00+02:00" }, new Date("2026-10-25T23:30:00Z"))).toBe("frueher");
  });

  it("listedAt nach heute zählt zu dieser Woche (Push kam verspätet an, Review 4, M2)", () => {
    expect(at("2026-10-27T05:00:00+01:00")).toBe("diese-woche");
  });
});

describe("groupByListing: Liste „Neu eingestellt“ (Plan 0043, E4)", () => {
  const offers = fixtureSiteOffers();
  const keys = (items: readonly Occurrence<SiteOffer>[]) => items.map((i) => fixtureKey(i.offer));

  it("drei Wochengruppen, darin nach Termin und Titel; ohne listedAt früher eingestellt", () => {
    const groups = groupByListing(offers, FIXTURE_NOW);
    expect(groups.map((g) => [g.kind, g.key, "from" in g ? g.from : undefined, "to" in g ? g.to : undefined])).toEqual([
      ["diese-woche", "diese-woche", "2026-09-29", "2026-10-05"],
      ["vorige-woche", "vorige-woche", "2026-09-22", "2026-09-28"],
      ["frueher", "frueher", undefined, undefined],
    ]);
    // Krabbelreime (9.10.) vor Musikgarten (5.11.); Krabbeltreff (7.10.) vor Kuckuck (15.11.)
    expect(groups.map((g) => keys(g.items))).toEqual([
      ["krabbelreime", "musikgarten-1"],
      ["krabbeltreff", "kuckuck-im-nest"],
      // die Bewegungslandschaft (20.10.) hat keinen Testschlüssel
      ["pekip-herbst", "babymassage-workshop", undefined, "babykonzert-advent"],
    ]);
  });

  it("jedes Angebot am selben Termin wie bei „Nächste Termine“, auch mit Zeitraum und Alter", () => {
    const range = { from: "2026-10-10", to: "2026-11-30" };
    const fits = sessionFit("2025-08-05");
    const byDate = groupByNextSession(offers, FIXTURE_NOW, range, fits).flatMap((g) => g.items);
    const byListing = groupByListing(offers, FIXTURE_NOW, range, fits).flatMap((g) => g.items);
    const at = (list: Occurrence<SiteOffer>[]) => new Map(list.map((i) => [i.offer.id, i.session.start] as const));
    expect(at(byListing)).toEqual(at(byDate));
  });

  it("Grenzen in Berliner Kalendertagen, über die Zeitumstellung am 25.10.", () => {
    const sunday = new Date("2026-10-25T12:00:00+01:00");
    const base = offers.find((o) => fixtureKey(o) === "babykonzert-advent");
    if (!base) throw new Error("Fixture fehlt");
    const at = (day: string) => ({ ...base, id: day, listedAt: `${day}T05:00:00+02:00` });
    const groups = groupByListing(["2026-10-19", "2026-10-18", "2026-10-12", "2026-10-11"].map(at), sunday);
    expect(groups.map((g) => [g.kind, g.items.map((i) => i.offer.id)])).toEqual([
      ["diese-woche", ["2026-10-19"]],
      ["vorige-woche", ["2026-10-18", "2026-10-12"]],
      ["frueher", ["2026-10-11"]],
    ]);
  });

  it("Etikett „Neu“ genau dann, wenn das Angebot in dieser oder voriger Woche steht (Review 4, K5)", () => {
    for (const group of groupByListing(offers, FIXTURE_NOW))
      for (const { offer } of group.items) expect(isNewlyListed(offer, FIXTURE_NOW)).toBe(group.kind !== "frueher");
  });

  it("beendete Angebote fallen heraus, leere Gruppen gibt es nicht", () => {
    const groups = groupByListing(
      offers.filter((o) => fixtureKey(o) === "vergangen" || fixtureKey(o) === "pekip-herbst"),
      FIXTURE_NOW,
    );
    expect(groups.map((g) => [g.kind, keys(g.items)])).toEqual([["frueher", ["pekip-herbst"]]]);
  });
});
