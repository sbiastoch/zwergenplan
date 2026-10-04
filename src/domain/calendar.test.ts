import { describe, expect, it } from "vitest";
import { calendarNav, clampDay } from "./calendar.ts";

// Reine Kalendertage (ISO-Datum): unabhängig von der Geräte-Zeitzone (Test läuft in America/Los_Angeles).

describe("clampDay", () => {
  it("setzt Tage vor heute auf heute", () => {
    expect(clampDay("2026-10-01", "2026-10-05")).toBe("2026-10-05");
    expect(clampDay("2025-12-31", "2026-01-01")).toBe("2026-01-01");
  });

  it("lässt heute und spätere Tage unverändert", () => {
    expect(clampDay("2026-10-05", "2026-10-05")).toBe("2026-10-05");
    expect(clampDay("2027-02-14", "2026-10-05")).toBe("2027-02-14");
  });
});

describe("calendarNav", () => {
  it("liefert die Woche Mo–So des gewählten Tages", () => {
    expect(calendarNav("2026-10-07", "2026-10-05", "2026-12-20").week).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("sperrt Zurück in der Woche und im Monat von heute", () => {
    const nav = calendarNav("2026-10-07", "2026-10-05", "2026-12-20");
    expect(nav.prevWeek).toBeUndefined();
    expect(nav.prevMonth).toBeUndefined();
    expect(nav.nextWeek).toBe("2026-10-12");
    expect(nav.nextMonth).toBe("2026-11-01");
  });

  it("geht eine Woche zurück, aber nie vor heute", () => {
    expect(calendarNav("2026-10-21", "2026-10-05", "2026-12-20").prevWeek).toBe("2026-10-14");
    // heute Do 8.10.: Mo 12.10. − 7 Tage läge davor
    expect(calendarNav("2026-10-12", "2026-10-08", "2026-12-20").prevWeek).toBe("2026-10-08");
  });

  it("springt vorwärts zum Montag der nächsten Woche", () => {
    expect(calendarNav("2026-10-09", "2026-10-05", "2026-12-20").nextWeek).toBe("2026-10-12");
  });

  it("sperrt Vor hinter dem letzten Tag mit Terminen", () => {
    const nav = calendarNav("2026-12-16", "2026-10-05", "2026-12-20");
    expect(nav.nextWeek).toBeUndefined(); // Mo 21.12. > 20.12.
    expect(nav.nextMonth).toBeUndefined();
    // genau am letzten Tag darf man noch hin
    expect(calendarNav("2026-12-10", "2026-10-05", "2026-12-14").nextWeek).toBe("2026-12-14");
  });

  it("geht einen Monat zurück auf den Ersten, im Monat von heute auf heute", () => {
    expect(calendarNav("2026-12-16", "2026-10-05", "2026-12-20").prevMonth).toBe("2026-11-01");
    expect(calendarNav("2026-11-16", "2026-10-05", "2026-12-20").prevMonth).toBe("2026-10-05");
  });

  it("ohne Termine endet der Kalender heute", () => {
    const nav = calendarNav("2026-10-05", "2026-10-05", undefined);
    expect(nav).toEqual({
      week: expect.any(Array),
      prevWeek: undefined,
      nextWeek: undefined,
      prevMonth: undefined,
      nextMonth: undefined,
    });
  });

  describe("über den Jahreswechsel", () => {
    it("Woche und Monat laufen von Dezember in den Januar", () => {
      const nav = calendarNav("2026-12-30", "2026-12-10", "2027-01-20");
      expect(nav.week[0]).toBe("2026-12-28");
      expect(nav.week[6]).toBe("2027-01-03");
      expect(nav.nextWeek).toBe("2027-01-04");
      expect(nav.nextMonth).toBe("2027-01-01");
      expect(nav.prevMonth).toBeUndefined();
    });

    it("zurück aus dem Januar landet im Dezember, nicht vor heute", () => {
      const nav = calendarNav("2027-01-15", "2026-12-10", "2027-01-20");
      expect(nav.prevMonth).toBe("2026-12-10");
      expect(nav.prevWeek).toBe("2027-01-08");
      expect(nav.nextWeek).toBe("2027-01-18");
      expect(nav.nextMonth).toBeUndefined();
    });

    it("zurück aus dem Januar auf den 1.12., wenn heute davor liegt", () => {
      expect(calendarNav("2027-01-15", "2026-11-20", "2027-01-20").prevMonth).toBe("2026-12-01");
    });
  });
});
