import { describe, expect, it } from "vitest";
import { ageInMonths, fitsAgeAt, offerFitsAge } from "./age.ts";
import { FIXTURE_NOW, fixtureOffer } from "./test-fixtures.ts";

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
