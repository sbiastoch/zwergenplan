import { describe, expect, it } from "vitest";
import { ageCheck, ageInMonths, ageVisibility, DEFAULT_AGE, fitsAgeAt, offerFitsAge, splitByAge } from "./age.ts";
import { applyFilters, EMPTY_FILTER } from "./filter.ts";
import { FIXTURE_NOW, fixtureKey, fixtureOffer, fixtureSiteOffers } from "./test-fixtures.ts";

describe("ageInMonths", () => {
  it("zählt vollendete Monate am Berliner Kalendertag", () => {
    expect(ageInMonths("2026-05-15", "2026-10-14T10:00:00+02:00")).toBe(4);
    expect(ageInMonths("2026-05-15", "2026-10-15T10:00:00+02:00")).toBe(5);
  });

  it("nutzt den Berliner Tag, auch wenn UTC noch am Vortag ist", () => {
    // 00:30 Berlin = 22:30 UTC am Vortag
    expect(ageInMonths("2026-05-15", "2026-10-15T00:30:00+02:00")).toBe(5);
  });

  it("behandelt Geburtstage am Monatsende in kurzen Monaten", () => {
    expect(ageInMonths("2026-01-31", "2026-02-27T12:00:00+01:00")).toBe(0);
    expect(ageInMonths("2026-01-31", "2026-02-28T12:00:00+01:00")).toBe(1);
    expect(ageInMonths("2024-01-31", "2024-02-29T12:00:00+01:00")).toBe(1);
  });

  it("ist vor der Geburt negativ", () => {
    expect(ageInMonths("2026-12-01", "2026-10-15T10:00:00+02:00")).toBe(-2);
  });

  it("lehnt kaputte Daten ab", () => {
    expect(() => ageInMonths("15.05.2026", "2026-10-15T10:00:00+02:00")).toThrow();
  });
});

describe("fitsAgeAt", () => {
  it("ist an beiden Grenzen inklusiv", () => {
    const range = { minMonths: 6, maxMonths: 12 };
    expect(fitsAgeAt(range, "2026-01-10", "2026-07-10T10:00:00+02:00")).toBe(true);
    expect(fitsAgeAt(range, "2026-01-10", "2026-07-09T10:00:00+02:00")).toBe(false);
    expect(fitsAgeAt(range, "2025-07-10", "2026-08-09T10:00:00+02:00")).toBe(true);
    expect(fitsAgeAt(range, "2025-07-10", "2026-08-10T10:00:00+02:00")).toBe(false);
  });

  it("nimmt ohne Angabe 0–36 Monate an", () => {
    expect(fitsAgeAt(undefined, "2024-01-01", "2026-10-15T10:00:00+02:00")).toBe(true);
    expect(fitsAgeAt(undefined, "2023-01-01", "2026-10-15T10:00:00+02:00")).toBe(false);
  });
});

describe("offerFitsAge", () => {
  it("prüft Kurse zum ersten Termin", () => {
    const pekip = fixtureOffer("pekip-herbst"); // 1–5 Monate, Start 13.10.
    expect(offerFitsAge(pekip, "2026-09-10", FIXTURE_NOW)).toBe(true);
    // Am Kursende wäre das Kind zu alt – zählt nicht.
    expect(offerFitsAge(pekip, "2026-05-14", FIXTURE_NOW)).toBe(true);
    expect(offerFitsAge(pekip, "2026-04-13", FIXTURE_NOW)).toBe(false); // am 13.10. schon 6 Monate
  });

  it("lässt regelmäßige Angebote zu, sobald ein Termin passt", () => {
    const treff = fixtureOffer("krabbeltreff"); // 6–24 Monate, bis 4.11.
    expect(offerFitsAge(treff, "2026-05-01", FIXTURE_NOW)).toBe(true); // wird im Oktober 5, im November 6
    expect(offerFitsAge(treff, "2026-06-01", FIXTURE_NOW)).toBe(false);
  });

  it("wertet bei regelmäßigen Angeboten nur kommende Termine", () => {
    const treff = fixtureOffer("krabbeltreff"); // bis 24 Monate; Termine 7.10.–4.11.
    // geb. 15.9.2024: am 7. und 14.10. noch 24 Monate, ab 15.10. zu alt
    expect(offerFitsAge(treff, "2024-09-15", FIXTURE_NOW)).toBe(true);
    expect(offerFitsAge(treff, "2024-09-15", new Date("2026-10-16T12:00:00+02:00"))).toBe(false);
  });

  it("läuft wirklich in einer fremden Zeitzone (sonst wären die Berlin-Tests wertlos)", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles");
  });
});

describe("splitByAge", () => {
  it("teilt nach der Altersregel, Reihenfolge bleibt", () => {
    const upcoming = applyFilters(fixtureSiteOffers(), EMPTY_FILTER, { now: FIXTURE_NOW });
    // Kind geb. 1.9.2026: im Oktober 1 Monat alt
    const { fitting, unfit } = splitByAge(upcoming, "2026-09-01", FIXTURE_NOW);
    // Reihenfolge der Eingabe, also wie in site.json chronologisch nach erstem Termin
    expect(fitting.map(fixtureKey)).toEqual([
      "krabbelreime",
      "pekip-herbst",
      "babymassage-workshop",
      "babykonzert-advent",
    ]);
    expect(unfit).toHaveLength(upcoming.length - 4);
    expect(unfit.map(fixtureKey)).toContain("krabbeltreff");
  });
});

describe("ageVisibility", () => {
  const upcoming = applyFilters(fixtureSiteOffers(), EMPTY_FILTER, { now: FIXTURE_NOW });
  // Ausschnitt wie nach einem Filter: ein passendes und zwei unpassende Angebote (Kind geb. 1.9.2026)
  const filtered = upcoming.filter((o) =>
    ["pekip-herbst", "krabbeltreff", "musikgarten-1"].includes(fixtureKey(o) ?? ""),
  );
  const unfitKeys = (ids: ReadonlySet<string>) => upcoming.filter((o) => ids.has(o.id)).map(fixtureKey);

  it("blendet unpassende Angebote aus und zählt sie", () => {
    const v = ageVisibility(filtered, upcoming, "2026-09-01", FIXTURE_NOW, { ageOnly: true });
    expect(v.visible.map(fixtureKey)).toEqual(["pekip-herbst"]);
    expect(v.unfitCount).toBe(2);
  });

  it("markiert unpassende Angebote über alle kommenden, nicht nur die gefilterten", () => {
    const v = ageVisibility(filtered, upcoming, "2026-09-01", FIXTURE_NOW, { ageOnly: true });
    expect(v.unfitIds.size).toBe(upcoming.length - 4);
    expect(unfitKeys(v.unfitIds)).toContain("kuckuck-im-nest");
    expect(unfitKeys(v.unfitIds)).not.toContain("pekip-herbst");
  });

  it("Altersfilter aus: nichts ausgeblendet, unpassende gezählt und markiert (Plan 0021, E1)", () => {
    const v = ageVisibility(filtered, upcoming, "2026-09-01", FIXTURE_NOW, { ageOnly: false });
    expect(v.visible).toBe(filtered);
    expect(v.unfitCount).toBe(2);
    expect(v.unfitIds.size).toBe(upcoming.length - 4);
  });

  it("ohne Geburtsdatum passt alles", () => {
    const v = ageVisibility(filtered, upcoming, undefined, FIXTURE_NOW, { ageOnly: true });
    expect(v).toEqual({ visible: filtered, unfitCount: 0, unfitIds: new Set() });
  });
});

describe("DEFAULT_AGE", () => {
  it("ist die ganze Zielgruppe 0–3 Jahre", () => {
    expect(DEFAULT_AGE).toEqual({ minMonths: 0, maxMonths: 36 });
  });
});

describe("ageCheck", () => {
  it("prüft Kurse und Einzeltermine zum ersten Termin", () => {
    const pekip = fixtureOffer("pekip-herbst"); // Start Di 13.10.
    expect(ageCheck(pekip, "2026-09-10", FIXTURE_NOW)).toEqual({
      fits: true,
      at: "2026-10-13T09:30:00+02:00",
      months: 1,
    });
    expect(ageCheck(pekip, "2026-04-13", FIXTURE_NOW)?.fits).toBe(false);
  });

  it("hat ohne kommende Termine nichts zu erklären", () => {
    expect(ageCheck(fixtureOffer("krabbeltreff"), "2026-05-01", new Date("2027-01-01T12:00:00+01:00"))).toBeUndefined();
  });

  it("nimmt bei regelmäßigen Angeboten den ersten passenden kommenden Termin", () => {
    const treff = fixtureOffer("krabbeltreff"); // 6–24 Monate, mittwochs ab 7.10.
    const check = ageCheck(treff, "2026-05-01", FIXTURE_NOW); // wird am 1.11. 6 Monate
    expect(check).toEqual({ fits: true, at: "2026-11-04T10:00:00+01:00", months: 6 });
    expect(ageCheck(treff, "2026-06-01", FIXTURE_NOW)).toMatchObject({ fits: false, at: "2026-10-07T10:00:00+02:00" });
  });

  it("prüft einen vorgegebenen Termin einer regelmäßigen Reihe (aus dem Kalender)", () => {
    const treff = fixtureOffer("krabbeltreff");
    const first = treff.sessions[0];
    expect(first && ageCheck(treff, "2026-05-01", FIXTURE_NOW, first)).toEqual({
      fits: false,
      at: "2026-10-07T10:00:00+02:00",
      months: 5,
    });
  });
});
