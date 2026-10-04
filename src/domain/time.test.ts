import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  berlinIsoDate,
  formatGermanDate,
  fromBerlinLocal,
  isoWeekday,
  parseGermanDate,
  toBerlinIso,
} from "./time.ts";

describe("fromBerlinLocal", () => {
  it("setzt den Offset nach Sommer- bzw. Winterzeit", () => {
    expect(fromBerlinLocal("2026-10-13T09:30")).toBe("2026-10-13T09:30:00+02:00");
    expect(fromBerlinLocal("2026-11-03T09:30")).toBe("2026-11-03T09:30:00+01:00");
    expect(fromBerlinLocal("2027-01-01T00:00")).toBe("2027-01-01T00:00:00+01:00");
  });

  it("wählt in der doppelten Stunde (Oktober) die frühere Variante", () => {
    expect(fromBerlinLocal("2026-10-25T02:30")).toBe("2026-10-25T02:30:00+02:00");
    expect(fromBerlinLocal("2026-10-25T03:00")).toBe("2026-10-25T03:00:00+01:00");
    expect(fromBerlinLocal("2026-10-25T01:59")).toBe("2026-10-25T01:59:00+02:00");
  });

  it("wirft für die fehlende Stunde (März)", () => {
    expect(() => fromBerlinLocal("2027-03-28T02:30")).toThrow("gibt es in Berlin nicht");
    expect(fromBerlinLocal("2027-03-28T03:00")).toBe("2027-03-28T03:00:00+02:00");
  });

  it("lehnt andere Formate ab", () => {
    expect(() => fromBerlinLocal("2026-10-13 09:30")).toThrow("Keine lokale Zeit");
    expect(() => fromBerlinLocal("2026-10-13T09:30:00+02:00")).toThrow("Keine lokale Zeit");
  });
});

describe("toBerlinIso", () => {
  it("schreibt einen Zeitpunkt mit Berliner Offset (sekundengenau)", () => {
    expect(toBerlinIso(new Date("2026-10-05T04:07:09.500Z"))).toBe("2026-10-05T06:07:09+02:00");
    expect(toBerlinIso(new Date("2026-12-24T23:30:00Z"))).toBe("2026-12-25T00:30:00+01:00");
    expect(toBerlinIso(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25T02:30:00+02:00");
    expect(toBerlinIso(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-25T02:30:00+01:00");
  });
});

describe("Kalenderrechnung", () => {
  it("addiert Tage über Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("addiert Monate und kappt am Monatsende", () => {
    expect(addMonths("2026-10-04", 4)).toBe("2027-02-04");
    expect(addMonths("2026-10-31", 4)).toBe("2027-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("liefert den ISO-Wochentag (1 = Montag)", () => {
    expect(isoWeekday("2026-10-05")).toBe(1);
    expect(isoWeekday("2026-10-11")).toBe(7);
  });
});

describe("berlinIsoDate", () => {
  it("liefert den Berliner Kalendertag, auch kurz nach Mitternacht", () => {
    expect(berlinIsoDate(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
    expect(berlinIsoDate("2026-10-05T23:59:00+02:00")).toBe("2026-10-05");
    expect(berlinIsoDate("2026-12-31T23:30:00Z")).toBe("2027-01-01");
  });
});

describe("parseGermanDate", () => {
  const today = "2026-10-05";

  it("liest TT.MM.JJJJ mit und ohne führende Nullen", () => {
    expect(parseGermanDate("02.11.2025", today)).toBe("2025-11-02");
    expect(parseGermanDate("2.1.2026", today)).toBe("2026-01-02");
    expect(parseGermanDate("  05.10.2026 ", today)).toBe("2026-10-05");
  });

  it("akzeptiert die iOS-Zifferntastatur: ohne Trenner oder mit Komma, Schrägstrich, Leerzeichen", () => {
    expect(parseGermanDate("01092026", today)).toBe("2026-09-01");
    expect(parseGermanDate("1,9,2026", today)).toBe("2026-09-01");
    expect(parseGermanDate("1/9/2026", today)).toBe("2026-09-01");
    expect(parseGermanDate("1 9 2026", today)).toBe("2026-09-01");
    expect(parseGermanDate("1092026", today)).toBeUndefined();
  });

  it("lehnt ungültige Tage, Zukunft und andere Formate ab", () => {
    expect(parseGermanDate("31.02.2026", today)).toBeUndefined();
    expect(parseGermanDate("06.10.2026", today)).toBeUndefined();
    expect(parseGermanDate("2026-01-02", today)).toBeUndefined();
    expect(parseGermanDate("1.1.26", today)).toBeUndefined();
    expect(parseGermanDate("", today)).toBeUndefined();
    expect(parseGermanDate("00.01.2026", today)).toBeUndefined();
  });
});

describe("formatGermanDate", () => {
  it("schreibt TT.MM.JJJJ", () => {
    expect(formatGermanDate("2025-11-02")).toBe("02.11.2025");
  });
});
