import { describe, expect, it } from "vitest";
import { type DayHidden, weekDays } from "./agenda.ts";
import { calendarNav, clampDay, selectionRange, weekRows } from "./calendar.ts";

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

describe("selectionRange (Plan 0025, E5)", () => {
  const today = "2026-10-07"; // Mi
  const range = (from: string, to: string) => ({ from, to });

  it("ein Tag reicht von bis zu diesem Tag, nie vor heute", () => {
    expect(selectionRange({ unit: "tag", day: "2026-10-09" }, today)).toEqual(range("2026-10-09", "2026-10-09"));
    expect(selectionRange({ unit: "tag", day: "2026-10-05" }, today)).toEqual(range(today, today));
  });

  it("eine Woche ist Mo–So um den Anker, Beginn nie vor heute", () => {
    expect(selectionRange({ unit: "woche", day: "2026-10-14" }, today)).toEqual(range("2026-10-12", "2026-10-18"));
    expect(selectionRange({ unit: "woche", day: today }, today)).toEqual(range(today, "2026-10-11"));
    expect(selectionRange({ unit: "woche", day: "2026-10-05" }, today)).toEqual(range(today, "2026-10-11"));
  });

  it("ein Monat reicht vom 1. bis zum Letzten, Beginn nie vor heute", () => {
    expect(selectionRange({ unit: "monat", day: "2026-11-20" }, today)).toEqual(range("2026-11-01", "2026-11-30"));
    expect(selectionRange({ unit: "monat", day: "2026-10-20" }, today)).toEqual(range(today, "2026-10-31"));
    expect(selectionRange({ unit: "monat", day: "2027-02-03" }, today)).toEqual(range("2027-02-01", "2027-02-28"));
  });

  it("läuft von Dezember in den Januar", () => {
    expect(selectionRange({ unit: "woche", day: "2026-12-30" }, today)).toEqual(range("2026-12-28", "2027-01-03"));
    expect(selectionRange({ unit: "monat", day: "2026-12-30" }, today)).toEqual(range("2026-12-01", "2026-12-31"));
  });

  it("zählt Kalendertage, auch über die Zeitumstellung am 25.10.2026", () => {
    expect(selectionRange({ unit: "woche", day: "2026-10-25" }, today)).toEqual(range("2026-10-19", "2026-10-25"));
    expect(selectionRange({ unit: "woche", day: "2026-10-26" }, today)).toEqual(range("2026-10-26", "2026-11-01"));
  });
});

describe("weekRows (Plan 0057, E9)", () => {
  // Woche Mo 5.10. – So 11.10.2026; Termine als Zeichenketten, die Funktion ist generisch
  const WEEK = weekDays("2026-10-05");
  const none = new Map<string, DayHidden>();
  const group = (day: string, ...items: string[]) => ({ day, items });
  const hidden = (entries: [string, Partial<DayHidden>][]) =>
    new Map(entries.map(([day, h]) => [day, { filter: 0, age: 0, ...h }]));

  it("Woche mit Lücken: Tage mit Terminen, dazwischen leere Tage, Wochenende zusammengefasst", () => {
    const rows = weekRows([group("2026-10-06", "PEKiP"), group("2026-10-07", "Treff")], none, WEEK, "2026-10-05");
    expect(rows).toEqual([
      { kind: "frei", day: "2026-10-05", why: "leer" },
      { kind: "termine", day: "2026-10-06", items: ["PEKiP"] },
      { kind: "termine", day: "2026-10-07", items: ["Treff"] },
      { kind: "frei", day: "2026-10-08", why: "leer" },
      { kind: "frei", day: "2026-10-09", why: "leer" },
      { kind: "wochenende", from: "2026-10-10", to: "2026-10-11" },
    ]);
  });

  it("heute leer: eine eigene Zeile für heute; vergangene Tage fehlen", () => {
    const rows = weekRows([group("2026-10-09", "Reime")], none, WEEK, "2026-10-08");
    expect(rows.map((r) => (r.kind === "wochenende" ? "we" : `${r.kind}:${r.day}`))).toEqual([
      "frei:2026-10-08",
      "termine:2026-10-09",
      "we",
    ]);
  });

  it("Wochenende nur zusammen, wenn Samstag und Sonntag beide leer sind", () => {
    const sat = weekRows([group("2026-10-10", "Markt")], none, WEEK, "2026-10-05").slice(-2);
    expect(sat).toEqual([
      { kind: "termine", day: "2026-10-10", items: ["Markt"] },
      { kind: "frei", day: "2026-10-11", why: "leer" },
    ]);
    const sun = weekRows([group("2026-10-11", "Konzert")], none, WEEK, "2026-10-05").slice(-2);
    expect(sun).toEqual([
      { kind: "frei", day: "2026-10-10", why: "leer" },
      { kind: "termine", day: "2026-10-11", items: ["Konzert"] },
    ]);
    // Samstag nur verdeckt: kein „Noch frei“ fürs Wochenende
    const veiled = weekRows([], hidden([["2026-10-10", { filter: 1 }]]), WEEK, "2026-10-05").slice(-2);
    expect(veiled).toEqual([
      { kind: "verdeckt", day: "2026-10-10" },
      { kind: "frei", day: "2026-10-11", why: "leer" },
    ]);
  });

  it("Samstag: das Wochenende steht noch zusammen; Sonntag: nur der Sonntag", () => {
    expect(weekRows([], none, WEEK, "2026-10-10")).toEqual([
      { kind: "wochenende", from: "2026-10-10", to: "2026-10-11" },
    ]);
    expect(weekRows([], none, WEEK, "2026-10-11")).toEqual([{ kind: "frei", day: "2026-10-11", why: "leer" }]);
  });

  it("künftige Woche: alle sieben Tage", () => {
    const rows = weekRows([group("2026-10-13", "PEKiP")], none, weekDays("2026-10-12"), "2026-10-05");
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({ kind: "frei", day: "2026-10-12", why: "leer" });
    expect(rows[1]).toEqual({ kind: "termine", day: "2026-10-13", items: ["PEKiP"] });
    expect(rows.at(-1)).toEqual({ kind: "wochenende", from: "2026-10-17", to: "2026-10-18" });
  });

  it("vom Filter verdeckter Tag ist „verdeckt“, nicht „leer“; nur vom Alter verdeckter heißt „alter“", () => {
    const rows = weekRows(
      [],
      hidden([
        ["2026-10-07", { filter: 1 }],
        ["2026-10-08", { age: 2 }],
        ["2026-10-09", { filter: 1, age: 1 }],
      ]),
      WEEK,
      "2026-10-05",
    );
    expect(rows.slice(2, 5)).toEqual([
      { kind: "verdeckt", day: "2026-10-07" },
      { kind: "frei", day: "2026-10-08", why: "alter" },
      { kind: "verdeckt", day: "2026-10-09" },
    ]);
  });

  it("heute schon Vorbeiges macht nur den heutigen Tag zu „vorbei“", () => {
    const rows = weekRows([], none, WEEK, "2026-10-07", 2);
    expect(rows.slice(0, 2)).toEqual([
      { kind: "frei", day: "2026-10-07", why: "vorbei" },
      { kind: "frei", day: "2026-10-08", why: "leer" },
    ]);
    // Verdecktes geht vor: Es kommt noch etwas, nur der Filter blendet es aus
    expect(weekRows([], hidden([["2026-10-07", { filter: 1 }]]), WEEK, "2026-10-07", 2)[0]).toEqual({
      kind: "verdeckt",
      day: "2026-10-07",
    });
  });

  it("zählt Kalendertage über die Zeitumstellung am 25.10.", () => {
    const rows = weekRows([], none, weekDays("2026-10-25"), "2026-10-19");
    expect(rows.at(-1)).toEqual({ kind: "wochenende", from: "2026-10-24", to: "2026-10-25" });
  });
});
