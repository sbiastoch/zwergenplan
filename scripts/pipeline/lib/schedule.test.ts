import { describe, expect, it } from "vitest";
import { type ExpandWindow, expandSchedule, Schedule } from "./schedule.ts";

const WINDOW: ExpandWindow = {
  to: "2026-12-31",
  freeDays: { "2026-11-04": "Herbstferien", "2026-11-05": "Herbstferien" },
};
const starts = (s: unknown, w = WINDOW) => expandSchedule(Schedule.parse(s), w).map((o) => o.start);

describe("expandSchedule", () => {
  it("dates: übernimmt die Liste sortiert und ohne Dubletten", () => {
    const out = expandSchedule(
      Schedule.parse({
        kind: "dates",
        dates: [
          { start: "2026-11-02T10:00" },
          { start: "2026-10-05T10:00", end: "2026-10-05T11:00" },
          { start: "2026-11-02T10:00" },
        ],
      }),
      WINDOW,
    );
    expect(out).toEqual([{ start: "2026-10-05T10:00", end: "2026-10-05T11:00" }, { start: "2026-11-02T10:00" }]);
  });

  it("weekly: Wochentage ab from bis zum Fensterende, ohne Ferien und Ausnahmen", () => {
    const s = {
      kind: "weekly",
      weekdays: ["MO", "WE"],
      start: "09:30",
      end: "11:00",
      from: "2026-10-26",
      skipHolidays: true,
      except: ["2026-11-09"],
    };
    expect(starts(s, { ...WINDOW, to: "2026-11-15" })).toEqual([
      "2026-10-26T09:30",
      "2026-10-28T09:30",
      "2026-11-02T09:30",
      // 4.11. Herbstferien
      // 9.11. Ausnahme
      "2026-11-11T09:30",
    ]);
    expect(expandSchedule(Schedule.parse(s), WINDOW)[0]).toEqual({
      start: "2026-10-26T09:30",
      end: "2026-10-26T11:00",
    });
  });

  it("weekly: Ferien bleiben ohne skipHolidays, until begrenzt", () => {
    const s = {
      kind: "weekly",
      weekdays: ["WE"],
      start: "10:00",
      from: "2026-10-28",
      until: "2026-11-11",
      skipHolidays: false,
    };
    expect(starts(s)).toEqual(["2026-10-28T10:00", "2026-11-04T10:00", "2026-11-11T10:00"]);
  });

  it("weekly: count zählt tatsächliche Termine (Ferien verschieben das Ende)", () => {
    const s = { kind: "weekly", weekdays: ["WE"], start: "10:00", from: "2026-10-28", count: 3, skipHolidays: true };
    expect(starts(s)).toEqual(["2026-10-28T10:00", "2026-11-11T10:00", "2026-11-18T10:00"]);
  });

  it("weekly: Intervall von 2 Wochen ab der Woche von from", () => {
    const s = {
      kind: "weekly",
      weekdays: ["TU", "FR"],
      interval: 2,
      start: "15:00",
      from: "2026-10-06",
      skipHolidays: false,
    };
    expect(starts(s, { ...WINDOW, to: "2026-10-31" })).toEqual([
      "2026-10-06T15:00",
      "2026-10-09T15:00",
      "2026-10-20T15:00",
      "2026-10-23T15:00",
    ]);
  });

  it("weekly: from mitten in der Woche überspringt frühere Wochentage", () => {
    const s = { kind: "weekly", weekdays: ["MO", "FR"], start: "09:00", from: "2026-10-07", skipHolidays: false };
    expect(starts(s, { ...WINDOW, to: "2026-10-12" })).toEqual(["2026-10-09T09:00", "2026-10-12T09:00"]);
  });

  it("startet Regeln ohne count am Fensterbeginn, auch wenn from Jahre zurückliegt (Intervall bleibt im Takt)", () => {
    const alt = {
      kind: "weekly",
      weekdays: ["TU"],
      interval: 2,
      start: "15:00",
      from: "2020-01-07",
      skipHolidays: false,
    };
    expect(starts(alt, { ...WINDOW, from: "2026-10-01", to: "2026-10-31" })).toEqual([
      "2026-10-06T15:00", // 352 Wochen nach dem 7.1.2020 – im 14-Tage-Takt
      "2026-10-20T15:00",
    ]);
    const mon = { kind: "monthly", nth: 1, weekday: "WE", start: "10:00", from: "2019-01-01", skipHolidays: false };
    expect(starts(mon, { ...WINDOW, from: "2026-10-01", to: "2026-11-30" })).toEqual([
      "2026-10-07T10:00",
      "2026-11-04T10:00",
    ]);
    const kurs = {
      kind: "weekly",
      weekdays: ["MO"],
      start: "09:00",
      from: "2026-09-28",
      count: 2,
      skipHolidays: false,
    };
    expect(starts(kurs, { ...WINDOW, from: "2026-10-04" })).toEqual(["2026-09-28T09:00", "2026-10-05T09:00"]);
  });

  it("monthly: n-ter und letzter Wochentag", () => {
    const first = { kind: "monthly", nth: 1, weekday: "WE", start: "10:00", from: "2026-10-01", skipHolidays: true };
    expect(starts(first)).toEqual(["2026-10-07T10:00", "2026-12-02T10:00"]); // 4.11. Ferien
    const last = {
      kind: "monthly",
      nth: -1,
      weekday: "FR",
      start: "16:00",
      end: "17:00",
      from: "2026-10-01",
      skipHolidays: false,
    };
    expect(starts(last)).toEqual(["2026-10-30T16:00", "2026-11-27T16:00", "2026-12-25T16:00"]);
  });

  it("monthly: fünfter Wochentag existiert nicht → Monat ohne Termin; count begrenzt", () => {
    const s = {
      kind: "monthly",
      nth: 4,
      weekday: "MO",
      start: "10:00",
      from: "2026-10-27",
      count: 2,
      skipHolidays: false,
    };
    expect(starts(s)).toEqual(["2026-11-23T10:00", "2026-12-28T10:00"]);
  });

  it("lehnt unplausible Regeln ab", () => {
    expect(() =>
      Schedule.parse({ kind: "weekly", weekdays: [], start: "10:00", from: "2026-10-01", skipHolidays: false }),
    ).toThrow();
    expect(() =>
      Schedule.parse({ kind: "weekly", weekdays: ["MO"], start: "25:00", from: "2026-10-01", skipHolidays: false }),
    ).toThrow();
    expect(() =>
      Schedule.parse({
        kind: "weekly",
        weekdays: ["MO"],
        start: "10:00",
        end: "09:00",
        from: "2026-10-01",
        skipHolidays: false,
      }),
    ).toThrow("end");
    expect(() =>
      Schedule.parse({
        kind: "weekly",
        weekdays: ["MO"],
        start: "10:00",
        from: "2026-10-05",
        until: "2026-10-01",
        skipHolidays: false,
      }),
    ).toThrow("until");
  });
});
