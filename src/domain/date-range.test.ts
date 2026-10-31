import { describe, expect, it } from "vitest";
import {
  candidateSessions,
  checkBound,
  type DateRange,
  type Daytime,
  dateRange,
  daytimeOf,
  fieldLimits,
  inDateRange,
  quickRanges,
  rangeSession,
} from "./date-range.ts";
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

describe("fieldLimits und checkBound (Plan 0023, E9, E4)", () => {
  const today = "2026-10-05";

  it("„von“ ab heute bis „bis“, „bis“ ab „von“ oder ab heute", () => {
    expect(fieldLimits(undefined, today)).toEqual({ from: { min: today }, to: { min: today } });
    expect(fieldLimits({ from: "2026-10-20", to: "2026-10-31" }, today)).toEqual({
      from: { min: today, max: "2026-10-31" },
      to: { min: "2026-10-20" },
    });
    expect(fieldLimits({ to: "2026-10-31" }, today)).toEqual({
      from: { min: today, max: "2026-10-31" },
      to: { min: today },
    });
  });

  it("ein alter Wert vor heute bleibt gültig, das Feld beginnt dort", () => {
    expect(fieldLimits({ from: "2026-10-01" }, today)).toEqual({
      from: { min: "2026-10-01" },
      to: { min: "2026-10-01" },
    });
    expect(fieldLimits({ to: "2026-10-01" }, today).to).toEqual({ min: "2026-10-01" });
  });

  it("übernimmt leere Felder und Tage in den Grenzen, nicht halb getippte Jahre", () => {
    const limits = { min: today, max: "2026-10-31" };
    expect(checkBound("", limits)).toBe("ok");
    expect(checkBound(today, limits)).toBe("ok");
    expect(checkBound("2026-10-31", limits)).toBe("ok");
    expect(checkBound("2026-10-04", limits)).toBe("zu-frueh");
    expect(checkBound("0002-10-20", limits)).toBe("zu-frueh");
    expect(checkBound("2026-11-01", limits)).toBe("zu-spaet");
    expect(checkBound("2027-01-31", { min: today })).toBe("ok");
    expect(checkBound("2026-02-30", limits)).toBe("ungueltig");
  });
});

describe("quickRanges (Plan 0025, E7)", () => {
  const months = (today: string, dataEnd: string | undefined) => quickRanges(today, dataEnd).map((q) => q.month);

  it("die Monatsersten der nächsten drei Monate, nur mit `from`", () => {
    expect(quickRanges("2026-10-08", "2027-02-28")).toEqual([
      { month: "2026-11", range: { from: "2026-11-01" } },
      { month: "2026-12", range: { from: "2026-12-01" } },
      { month: "2027-01", range: { from: "2027-01-01" } },
    ]);
  });

  it("am 31.1. ist der Folgemonat der Februar", () => {
    expect(months("2027-01-31", "2027-12-31")).toEqual(["2027-02", "2027-03", "2027-04"]);
  });

  it("ohne Daten ab dem Monatsersten fehlt die Schnellwahl", () => {
    expect(months("2026-10-08", "2026-12-20")).toEqual(["2026-11", "2026-12"]);
    expect(months("2026-10-08", "2026-12-01")).toEqual(["2026-11", "2026-12"]);
    expect(months("2026-10-08", "2026-10-31")).toEqual([]);
  });

  it("ohne Datenstand gibt es keine", () => {
    expect(quickRanges("2026-10-08", undefined)).toEqual([]);
  });
});

describe("DateRange (Plan 0023, Arch-Review m5)", () => {
  it("braucht mindestens eine Grenze", () => {
    // @ts-expect-error – ein Zeitraum ohne Grenze ist kein Zeitraum; der Typ verbietet ihn (Absicht des Tests)
    const empty: DateRange = {};
    expect(dateRange(empty.from, empty.to)).toBeUndefined();
  });
});

describe("Tageszeit und candidateSessions (Plan 0057, E7)", () => {
  const at = (start: string) => s(start, start);

  it("teilt nach dem Beginn in Berliner Zeit: vor 12, 12 bis vor 15, ab 15 Uhr", () => {
    // in Los Angeles ist 11:59 Berlin noch die Nacht davor: die Uhr des Geräts zählt nie
    expect(daytimeOf(at("2026-10-14T11:59:00+02:00"))).toBe("vormittags");
    expect(daytimeOf(at("2026-10-14T12:00:00+02:00"))).toBe("mittags");
    expect(daytimeOf(at("2026-10-14T14:59:00+02:00"))).toBe("mittags");
    expect(daytimeOf(at("2026-10-14T15:00:00+02:00"))).toBe("nachmittags");
    expect(daytimeOf(at("2026-10-14T00:00:00+02:00"))).toBe("vormittags");
    expect(daytimeOf(at("2026-10-14T23:59:00+02:00"))).toBe("nachmittags");
  });

  it("zählt am Tag der Zeitumstellung (25.10.2026) nach Berliner Uhr", () => {
    expect(daytimeOf(at("2026-10-25T11:59:00+01:00"))).toBe("vormittags");
    expect(daytimeOf(at("2026-10-25T12:00:00+01:00"))).toBe("mittags");
    expect(daytimeOf(at("2026-10-25T14:59:00+01:00"))).toBe("mittags");
    expect(daytimeOf(at("2026-10-25T15:00:00+01:00"))).toBe("nachmittags");
    // dieselben Zeitpunkte in UTC geschrieben
    expect(daytimeOf(at("2026-10-25T10:59:00Z"))).toBe("vormittags");
    expect(daytimeOf(at("2026-10-25T11:00:00Z"))).toBe("mittags");
  });

  it("regelmäßig und einmalig: nicht beendete Termine im Zeitraum und in der Tageszeit", () => {
    const regular = offer("regelmaessig", [
      s("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"), // beendet
      s("2026-10-12T09:00:00+02:00", "2026-10-12T10:00:00+02:00"), // Mo vormittags
      s("2026-10-13T16:00:00+02:00", "2026-10-13T17:00:00+02:00"), // Di nachmittags
      s("2026-10-19T09:00:00+02:00", "2026-10-19T10:00:00+02:00"), // Mo vormittags
    ]);
    const starts = (range?: DateRange, daytimes?: Daytime[]) =>
      candidateSessions(regular, FIXTURE_NOW, range, daytimes).map((x) => x.start.slice(0, 13));
    expect(starts()).toEqual(["2026-10-12T09", "2026-10-13T16", "2026-10-19T09"]);
    expect(starts(undefined, ["vormittags"])).toEqual(["2026-10-12T09", "2026-10-19T09"]);
    expect(starts(undefined, [])).toEqual(starts());
    expect(starts({ from: "2026-10-13" }, ["vormittags"])).toEqual(["2026-10-19T09"]);
    // Zeitraum und Tageszeit am selben Termin: Dienstag vormittags gibt es nicht
    expect(starts({ from: "2026-10-13", to: "2026-10-13" }, ["vormittags"])).toEqual([]);
    expect(starts({ from: "2026-10-13", to: "2026-10-13" }, ["nachmittags"])).toEqual(["2026-10-13T16"]);
    // ein beendeter Vormittagstermin ist kein Kandidat
    expect(starts({ to: "2026-10-05" }, ["vormittags"])).toEqual([]);
  });

  it("Kurs: einziger Kandidat ist der Kursbeginn, auch beendet; Zeitraum und Tageszeit gelten für ihn", () => {
    const course = offer("kurs", [
      s("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
      s("2026-10-12T15:00:00+02:00", "2026-10-12T16:00:00+02:00"),
    ]);
    expect(candidateSessions(course, FIXTURE_NOW)).toEqual([course.sessions[0]]);
    expect(candidateSessions(course, FIXTURE_NOW, undefined, ["vormittags"])).toEqual([course.sessions[0]]);
    // spätere Termine zählen nicht, auch nicht mit passender Tageszeit
    expect(candidateSessions(course, FIXTURE_NOW, undefined, ["nachmittags"])).toEqual([]);
    expect(candidateSessions(course, FIXTURE_NOW, { from: "2026-10-12" }, ["nachmittags"])).toEqual([]);
    expect(candidateSessions(course, FIXTURE_NOW, { from: "2026-10-05" }, ["nachmittags"])).toEqual([]);
  });

  it("rangeSession ist der erste Kandidat ohne Tageszeit", () => {
    for (const key of ["krabbeltreff", "pekip-herbst", "babymassage-workshop", "vergangen"] as const) {
      const o = fixtureOffer(key);
      for (const range of [{ from: "2026-10-13" }, { to: "2026-10-20" }, { from: "2026-10-21", to: "2026-10-28" }]) {
        expect(rangeSession(o, range, FIXTURE_NOW)).toEqual(candidateSessions(o, FIXTURE_NOW, range)[0]);
      }
    }
  });
});
