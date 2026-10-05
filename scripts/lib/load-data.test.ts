import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { loadTimetable, readTimetable, TIMETABLE_REQUIRED, type TimetableLoad, timetableIssues } from "./load-data.ts";

const tmpFile = (content: string) => {
  const file = join(mkdtempSync(join(tmpdir(), "zp-fahrplan-")), "fahrplan.json");
  writeFileSync(file, content);
  return pathToFileURL(file);
};

describe("Fahrplanauszug laden (Plan 0009, E7/E12)", () => {
  it("die Fixture ist gültig und entspricht dem Plan (Stichtag Dienstag, Fenster 8:30–10:30)", () => {
    const load = loadTimetable("fixture");
    expect(load.kind).toBe("ok");
    if (load.kind !== "ok") return;
    expect(load.timetable.serviceDay).toBe("2026-10-13");
    expect(load.timetable.window).toEqual({ from: "08:30", to: "10:30" });
    expect(load.timetable.stops.some(([id]) => id.startsWith("de:09563:"))).toBe(true);
    // M4: mindestens eine Fahrt mit zwei aufeinanderfolgenden Verbindungen dep == arr
    const zeroRuns = load.timetable.trips.some((t) => t.times.slice(2, 6).every((x) => x === 0));
    expect(zeroRuns).toBe(true);
  });

  it("meldet eine fehlende Datei als „missing“", () => {
    const load = readTimetable(new URL("file:///nicht/da/fahrplan.json"));
    expect(load).toEqual({ kind: "missing", file: "/nicht/da/fahrplan.json" });
  });

  it("meldet kaputtes JSON und Schemafehler als „invalid“", () => {
    expect(readTimetable(tmpFile("{")).kind).toBe("invalid");
    const bad = readTimetable(tmpFile(JSON.stringify({ serviceDay: "2026-10-13" })));
    expect(bad.kind).toBe("invalid");
    expect(bad.kind === "invalid" && bad.errors.join("\n")).toMatch(/source/);
  });
});

describe("timetableIssues", () => {
  const missing: TimetableLoad = { kind: "missing", file: "data/oepnv/fahrplan.json" };

  it("bis Schritt 5 ist der Auszug nicht Pflicht (TIMETABLE_REQUIRED = false)", () => {
    expect(TIMETABLE_REQUIRED).toBe(false);
  });

  it("fehlender Auszug ist ohne Pflicht nur eine Warnung", () => {
    const r = timetableIssues(missing, { required: false });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/Kein Fahrplanauszug.*Wegzeit entfällt/);
  });

  it("fehlender Auszug ist mit Pflicht ein Fehler", () => {
    expect(timetableIssues(missing, { required: true }).errors.join()).toMatch(/Kein Fahrplanauszug/);
  });

  it("ungültiger Auszug ist immer ein Fehler", () => {
    const invalid: TimetableLoad = { kind: "invalid", errors: ["trips.0.times: kaputt"] };
    expect(timetableIssues(invalid, { required: false }).errors).toEqual(["Fahrplanauszug: trips.0.times: kaputt"]);
  });

  it("gültiger Auszug ergibt nichts", () => {
    const ok = loadTimetable("fixture");
    expect(timetableIssues(ok, { required: true })).toEqual({ errors: [], warnings: [] });
  });
});
