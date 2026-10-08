import { describe, expect, it } from "vitest";
import { dateRange, inDateRange, rangeSession, usableBound } from "./date-range.ts";
import type { Format, Offer, Session } from "./schema.ts";
import { FIXTURE_NOW, fixtureOffer } from "./test-fixtures.ts";

// Läuft absichtlich in America/Los_Angeles (vitest.config.ts): Berliner Tage dürfen nie vom Gerät abhängen.
const s = (start: string, end: string): Session => ({ start, end });
const offer = (format: Format, sessions: Session[]): Offer => ({
  ...fixtureOffer("krabbeltreff"),
  format,
  sessions,
});

describe("dateRange (Plan 0023, E1, E4)", () => {
  it("nimmt eine oder beide Grenzen, ohne Grenzen gibt es keinen Zeitraum", () => {
    expect(dateRange("2026-10-20", "2026-10-31")).toEqual({ from: "2026-10-20", to: "2026-10-31" });
    expect(dateRange("2026-10-20", undefined)).toEqual({ from: "2026-10-20" });
    expect(dateRange(undefined, "2026-10-31")).toEqual({ to: "2026-10-31" });
    expect(dateRange(undefined, undefined)).toBeUndefined();
  });

  it("tauscht vertauschte Grenzen still", () => {
    expect(dateRange("2026-10-31", "2026-10-20")).toEqual({ from: "2026-10-20", to: "2026-10-31" });
  });

  it("verwirft ungültige Werte einzeln", () => {
    expect(dateRange("2026-02-30", "2026-10-31")).toEqual({ to: "2026-10-31" });
    expect(dateRange("20.10.2026", "")).toBeUndefined();
    expect(dateRange("2026-10-20T00:00", "2026-13-01")).toBeUndefined();
  });
});

describe("rangeSession und inDateRange (Plan 0023, E2)", () => {
  it("Grenzen sind ganze Berliner Tage, beide inklusive – auch um Mitternacht Berlin", () => {
    // 23:30 Berlin am 19.10. ist in Los Angeles noch Nachmittag, 00:30 am 21.10. ist dort der 20.10.
    const late = offer("einmalig", [s("2026-10-19T23:30:00+02:00", "2026-10-19T23:45:00+02:00")]);
    const early = offer("einmalig", [s("2026-10-21T00:30:00+02:00", "2026-10-21T01:00:00+02:00")]);
    const range = { from: "2026-10-20", to: "2026-10-20" };
    expect(inDateRange(late, range, FIXTURE_NOW)).toBe(false);
    expect(inDateRange(early, range, FIXTURE_NOW)).toBe(false);
    expect(inDateRange(late, { from: "2026-10-19", to: "2026-10-19" }, FIXTURE_NOW)).toBe(true);
    expect(inDateRange(early, { from: "2026-10-21", to: "2026-10-21" }, FIXTURE_NOW)).toBe(true);
  });

  it("zählt am Tag der Zeitumstellung (25.10.2026) richtig", () => {
    // 00:30 MESZ und 23:30 MEZ: beide am 25.10. Berliner Zeit
    const first = offer("einmalig", [s("2026-10-25T00:30:00+02:00", "2026-10-25T01:00:00+02:00")]);
    const last = offer("einmalig", [s("2026-10-25T23:30:00+01:00", "2026-10-25T23:50:00+01:00")]);
    const range = { from: "2026-10-25", to: "2026-10-25" };
    expect(inDateRange(first, range, FIXTURE_NOW)).toBe(true);
    expect(inDateRange(last, range, FIXTURE_NOW)).toBe(true);
    expect(inDateRange(last, { to: "2026-10-24" }, FIXTURE_NOW)).toBe(false);
    expect(inDateRange(first, { from: "2026-10-26" }, FIXTURE_NOW)).toBe(false);
  });

  it("nur „von“ heißt ab diesem Tag, nur „bis“ bis zu diesem Tag", () => {
    const once = offer("einmalig", [s("2026-10-17T10:00:00+02:00", "2026-10-17T12:00:00+02:00")]);
    expect(inDateRange(once, { from: "2026-10-17" }, FIXTURE_NOW)).toBe(true);
    expect(inDateRange(once, { from: "2026-10-18" }, FIXTURE_NOW)).toBe(false);
    expect(inDateRange(once, { to: "2026-10-17" }, FIXTURE_NOW)).toBe(true);
    expect(inDateRange(once, { to: "2026-10-16" }, FIXTURE_NOW)).toBe(false);
  });

  it("Kurs: nur der Kursbeginn zählt, ein vorher begonnener Kurs fällt heraus", () => {
    const pekip = fixtureOffer("pekip-herbst"); // Beginn 13.10., dann wöchentlich
    expect(rangeSession(pekip, { from: "2026-10-20", to: "2026-10-31" }, FIXTURE_NOW)).toBeUndefined();
    expect(rangeSession(pekip, { from: "2026-10-13" }, FIXTURE_NOW)).toEqual(pekip.sessions[0]);
  });

  it("Kurs: ein schon beendeter Kursbeginn zählt, solange der Kurs läuft", () => {
    const course = offer("kurs", [
      s("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
      s("2026-10-12T09:00:00+02:00", "2026-10-12T10:00:00+02:00"),
    ]);
    expect(rangeSession(course, { from: "2026-10-05" }, FIXTURE_NOW)).toEqual(course.sessions[0]);
  });

  it("regelmäßig: der erste nicht beendete Termin im Zeitraum", () => {
    const treff = fixtureOffer("krabbeltreff"); // 7.10., 14.10., 21.10., 28.10., 4.11.
    expect(rangeSession(treff, { from: "2026-10-20", to: "2026-10-31" }, FIXTURE_NOW)?.start).toBe(
      "2026-10-21T10:00:00+02:00",
    );
    expect(rangeSession(treff, { from: "2026-10-22", to: "2026-10-27" }, FIXTURE_NOW)).toBeUndefined();
  });

  it("regelmäßig: ein heute schon beendeter Termin zählt nicht", () => {
    const regular = offer("regelmaessig", [
      s("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
      s("2026-10-12T09:00:00+02:00", "2026-10-12T10:00:00+02:00"),
    ]);
    expect(rangeSession(regular, { to: "2026-10-05" }, FIXTURE_NOW)).toBeUndefined();
    expect(rangeSession(regular, { to: "2026-10-12" }, FIXTURE_NOW)?.start).toBe("2026-10-12T09:00:00+02:00");
  });

  it("einmalig: der Termin muss im Zeitraum liegen und darf nicht vorbei sein", () => {
    const past = fixtureOffer("vergangen"); // 5.10., 9:00 – vor „jetzt“ beendet
    expect(inDateRange(past, { from: "2026-10-05", to: "2026-10-05" }, FIXTURE_NOW)).toBe(false);
  });
});

describe("usableBound (Plan 0023, E9)", () => {
  it("übernimmt leere Felder und Tage ab heute, nicht halb getippte Jahre", () => {
    expect(usableBound("", "2026-10-05")).toBe(true);
    expect(usableBound("2026-10-05", "2026-10-05")).toBe(true);
    expect(usableBound("2027-01-31", "2026-10-05")).toBe(true);
    expect(usableBound("2026-10-04", "2026-10-05")).toBe(false);
    expect(usableBound("0002-10-20", "2026-10-05")).toBe(false);
    expect(usableBound("2026-02-30", "2026-01-01")).toBe(false);
  });
});
