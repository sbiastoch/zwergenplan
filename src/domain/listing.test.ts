import { describe, expect, it } from "vitest";
import { sessionFit } from "./age.ts";
import { groupByNextSession, type Occurrence } from "./agenda.ts";
import { groupByListing, groupByReach, isNewlyListed, listingWeek } from "./listing.ts";
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

  it("jedes Angebot am selben Termin wie bei „Nächste Termine“, auch mit Zeitraum, Tageszeit und Alter", () => {
    const rule = { range: { from: "2026-10-10", to: "2026-11-30" }, daytimes: ["vormittags" as const] };
    const fits = sessionFit("2025-08-05");
    const byDate = groupByNextSession(offers, FIXTURE_NOW, rule, fits).flatMap((g) => g.items);
    const byListing = groupByListing(offers, FIXTURE_NOW, rule, fits).flatMap((g) => g.items);
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

describe("groupByReach: Liste „Nächstgelegen“ (Plan 0043, E7)", () => {
  const offers = fixtureSiteOffers();
  const byKey = (key: string) => {
    const offer = offers.find((o) => fixtureKey(o) === key);
    if (!offer) throw new Error(`Fixture ${key} fehlt`);
    return offer;
  };
  const transit = (minutes: Record<string, number>) => (offer: SiteOffer) => {
    const value = minutes[offer.id];
    return value === undefined ? undefined : ({ kind: "oepnv", minutes: value, byFoot: false } as const);
  };
  const heads = (groups: ReturnType<typeof groupByReach>) =>
    groups.map((g) => [g.key, g.items.map((i) => fixtureKey(i.offer))]);

  it("Bänder in 5er-Schritten, auf gerundeten Minuten wie auf der Karte", () => {
    const treff = byKey("krabbeltreff");
    const reime = byKey("krabbelreime");
    const musik = byKey("musikgarten-1");
    const kuckuck = byKey("kuckuck-im-nest");
    const pekip = byKey("pekip-herbst");
    const massage = byKey("babymassage-workshop");
    const konzert = byKey("babykonzert-advent");
    // 22,4 → 20, 22,6 → 25, 32,4 → 30, 32,6 → 35, 47,4 → 45, 47,6 → 50, 200 → über 2 Std.
    const groups = groupByReach(
      [treff, reime, musik, kuckuck, pekip, massage, konzert],
      FIXTURE_NOW,
      transit({
        [treff.id]: 22.4,
        [reime.id]: 22.6,
        [musik.id]: 32.4,
        [massage.id]: 32.6,
        [konzert.id]: 47.4,
        [kuckuck.id]: 47.6,
        [pekip.id]: 200,
      }),
    );
    expect(heads(groups)).toEqual([
      ["w:min:20", ["krabbeltreff"]],
      ["w:min:25", ["krabbelreime"]],
      ["w:min:30", ["musikgarten-1"]],
      ["w:min:35", ["babymassage-workshop"]],
      ["w:min:45", ["babykonzert-advent"]],
      ["w:min:50", ["kuckuck-im-nest"]],
      ["w:min:mehr", ["pekip-herbst"]],
    ]);
    expect(groups.map((g) => ("band" in g ? g.band : undefined))).toEqual([
      { unit: "min", upTo: 20 },
      { unit: "min", upTo: 25 },
      { unit: "min", upTo: 30 },
      { unit: "min", upTo: 35 },
      { unit: "min", upTo: 45 },
      { unit: "min", upTo: 50 },
      { unit: "min" },
    ]);
  });

  it("über einer Stunde gerundet auf 10 Min., bis 2 Std.", () => {
    const treff = byKey("krabbeltreff");
    const reime = byKey("krabbelreime");
    const groups = groupByReach([treff, reime], FIXTURE_NOW, transit({ [treff.id]: 63, [reime.id]: 118 }));
    expect(groups.map((g) => g.key)).toEqual(["w:min:60", "w:min:120"]);
  });

  it("gleiche gerundete Minuten: nach Termin, dann Titel; ohne Ergebnis am Ende", () => {
    const treff = byKey("krabbeltreff"); // 7.10.
    const reime = byKey("krabbelreime"); // 9.10.
    const pekip = byKey("pekip-herbst");
    const groups = groupByReach([reime, treff, pekip], FIXTURE_NOW, transit({ [treff.id]: 14.6, [reime.id]: 15.2 }));
    expect(heads(groups)).toEqual([
      ["w:min:15", ["krabbeltreff", "krabbelreime"]],
      ["ohne-wegzeit", ["pekip-herbst"]],
    ]);
  });

  it("Luftlinie: Bänder nach Metern (1, 3, 10 km)", () => {
    const meters: Record<string, number> = {};
    const list = ["krabbeltreff", "krabbelreime", "musikgarten-1", "kuckuck-im-nest"].map(byKey);
    [940, 2_960, 9_960, 12_000].forEach((m, i) => {
      meters[list[i]?.id ?? ""] = m;
    });
    const groups = groupByReach(list, FIXTURE_NOW, (o) => ({ kind: "luftlinie", meters: meters[o.id] ?? 0 }));
    expect(groups.map((g) => g.key)).toEqual(["w:m:1000", "w:m:3000", "w:m:10000", "w:m:mehr"]);
  });

  it("Zeitraum, Tageszeit und Alter wirken wie bei „Nächste Termine“", () => {
    const rule = { range: { from: "2026-10-10", to: "2026-11-30" }, daytimes: ["vormittags" as const] };
    const fits = sessionFit("2025-08-05");
    const byDate = groupByNextSession(offers, FIXTURE_NOW, rule, fits).flatMap((g) => g.items);
    const byReach = groupByReach(offers, FIXTURE_NOW, () => undefined, rule, fits).flatMap((g) => g.items);
    const at = (list: Occurrence<SiteOffer>[]) => new Map(list.map((i) => [i.offer.id, i.session.start] as const));
    expect(at(byReach)).toEqual(at(byDate));
  });
});
