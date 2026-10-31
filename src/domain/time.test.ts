import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  addMonths,
  berlinIsoDate,
  berlinKey,
  daysBetween,
  formatGermanDate,
  fromBerlinLocal,
  isIsoDate,
  isoWeekday,
  parseGermanDate,
  sameMinute,
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
    // Gegenstück (Plan 0057, E8): ganze Kalendertage, über Monatsende und Zeitumstellung
    expect(daysBetween("2026-10-19", "2026-11-02")).toBe(14);
    expect(daysBetween("2026-10-05", "2026-10-05")).toBe(0);
    expect(daysBetween("2026-10-06", "2026-10-05")).toBe(-1);
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

describe("berlinKey", () => {
  it("liefert den Berliner Schlüssel, auch über Mitternacht und Zeitumstellung", () => {
    expect(berlinKey("2026-10-13T09:30:00+02:00")).toBe("20261013T0930");
    expect(berlinKey("2026-10-05T22:30:00Z")).toBe("20261006T0030");
    expect(berlinKey("2026-10-25T10:00:00+01:00")).toBe("20261025T1000");
  });

  // LCP-Smoke (Nachtlauf 2026-10-12): Ein neues Intl.DateTimeFormat je Aufruf kostete ≈ 0,1 ms, auf der Startseite
  // ≈ 1 800 Aufrufe (Rhythmus der regelmäßigen Kacheln), gedrosselt rund 0,7 s LCP.
  it("baut kein Intl.DateTimeFormat je Aufruf", () => {
    const ctor = vi.spyOn(Intl, "DateTimeFormat");
    try {
      berlinKey("2026-10-13T09:30:00+02:00");
      berlinKey("2026-10-14T09:30:00+02:00");
      expect(ctor).not.toHaveBeenCalled();
    } finally {
      ctor.mockRestore();
    }
  });

  // LCP-Smoke (Plan 0057, Nachtrag LCP): Der Rhythmus fragt je Termin Tag und Uhrzeit von Beginn und Ende ab, bei
  // jedem Rendern erneut. Ein Termin-Zeitpunkt wird nur einmal formatiert.
  it("formatiert denselben Zeitpunkt nur einmal, auch für den Kalendertag", () => {
    const parts = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
    try {
      const instant = "2031-03-30T00:30:00+01:00";
      expect(berlinKey(instant)).toBe("20310330T0030");
      expect(berlinKey(instant)).toBe("20310330T0030");
      expect(berlinIsoDate(instant)).toBe("2031-03-30");
      expect(parts).toHaveBeenCalledTimes(1);
    } finally {
      parts.mockRestore();
    }
  });
});

describe("berlinIsoDate", () => {
  it("liefert den Berliner Kalendertag, auch kurz nach Mitternacht", () => {
    expect(berlinIsoDate(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
    expect(berlinIsoDate("2026-10-05T23:59:00+02:00")).toBe("2026-10-05");
    expect(berlinIsoDate("2026-12-31T23:30:00Z")).toBe("2027-01-01");
    // Mitternacht Berlin: Schlüssel mit Stunde 00, nicht 24
    expect(berlinIsoDate("2026-10-05T22:00:00Z")).toBe("2026-10-06");
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

describe("sameMinute", () => {
  const at = (iso: string) => new Date(iso);

  it("ist wahr innerhalb derselben Minute", () => {
    expect(sameMinute(at("2026-10-07T11:30:10+02:00"), at("2026-10-07T11:30:50+02:00"))).toBe(true);
    expect(sameMinute(at("2026-10-07T11:30:00.000+02:00"), at("2026-10-07T11:30:59.999+02:00"))).toBe(true);
  });

  it("ist falsch bei Minuten-, Stunden- und Tageswechsel", () => {
    expect(sameMinute(at("2026-10-07T11:30:59+02:00"), at("2026-10-07T11:31:00+02:00"))).toBe(false);
    expect(sameMinute(at("2026-10-07T11:59:50+02:00"), at("2026-10-07T12:00:10+02:00"))).toBe(false);
    expect(sameMinute(at("2026-10-07T23:59:40+02:00"), at("2026-10-08T00:00:10+02:00"))).toBe(false);
  });

  it("vergleicht Zeitpunkte, nicht die Ortszeit – auch über die Zeitumstellung", () => {
    // 2:30 Uhr gibt es am 25.10. zweimal (erst +02:00, dann +01:00): eine Stunde Abstand.
    expect(sameMinute(at("2026-10-25T02:30:00+02:00"), at("2026-10-25T02:30:00+01:00"))).toBe(false);
    // derselbe Zeitpunkt in zwei Schreibweisen
    expect(sameMinute(at("2026-10-25T02:59:30+02:00"), at("2026-10-25T00:59:45Z"))).toBe(true);
    expect(sameMinute(at("2026-10-25T02:59:30+02:00"), at("2026-10-25T02:00:30+01:00"))).toBe(false);
  });
});

describe("isIsoDate", () => {
  it("nimmt nur echte Kalendertage als YYYY-MM-DD", () => {
    expect(isIsoDate("2026-10-25")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    for (const raw of ["2026-02-29", "2026-13-01", "2026-10-00", "2026-1-05", "05.10.2026", "2026-10-05T00:00", ""]) {
      expect(isIsoDate(raw)).toBe(false);
    }
  });
});
