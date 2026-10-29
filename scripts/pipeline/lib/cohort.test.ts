import { describe, expect, it } from "vitest";
import { birthCohort, cohortAge } from "./cohort.ts";

describe("birthCohort (Plan 0053, E3)", () => {
  it.each([
    ["PEKiP Babys geb. April–Juni 2026, Di 9:30", "2026-04", "2026-06"],
    ["PEKiP Babys geb. Dez. 2025–Feb. 2026, Di 11:30", "2025-12", "2026-02"],
    ["PEKiP Fr 9:00 Jan.–März 2027 (Babys geb. Sept.–Okt. 2026)", "2026-09", "2026-10"],
    ["PEKiP Do 11:15 Nov. 2026–Feb. 2027 (Babys geb. März–Apr. 2026)", "2026-03", "2026-04"],
    ["PEKiP Babys geb. Sep.–Nov. 2026, Do 09:30", "2026-09", "2026-11"],
    ["PEKiP für Babys geb. Juni–August 2026", "2026-06", "2026-08"],
    ["PEKiP® geb. Juni–Aug. 2026, Do 11:15 (29.10.–10.12.)", "2026-06", "2026-08"],
    ["Miniclub: Kinder geb. 02-06/2026 (Warteliste)", "2026-02", "2026-06"],
    ["Miniclub: Kinder geb. 04/2024-07/2024", "2024-04", "2024-07"],
    ["Miniclub: Kinder geb. 09/2025–01/2026", "2025-09", "2026-01"],
    ["Babymassage (geboren Mai 2026)", "2026-05", "2026-05"],
    ["Gruppe geb. 03/2026", "2026-03", "2026-03"],
    ["Krabbeln, geb. Jan. bis März 2026", "2026-01", "2026-03"],
    // nur ein Jahr am Ende, erster Monat größer: Vorjahr (E3, Jahresregel)
    ["PEKiP geb. Nov.–Feb. 2026", "2025-11", "2026-02"],
  ])("%s", (title, from, to) => {
    expect(birthCohort(title)).toEqual({ from, to });
  });

  it.each([
    "Krabbelgruppe Maxis (ab 13 Monate), Donnerstag",
    "PEKiP (geb. Juli–Aug.)",
    "Rückbildung mit Katrina, 12–13:40 Uhr (Start 9.11.)",
    "geb. 13/2026",
    "Elterncafé für Neugeborene Mai 2026",
    "Krabbelgruppe für Kinder geb. ab Mai 2026",
    "PEKiP geb. 1.1.–30.6.2026",
    "Eltern-Kind-Gruppe Donnerstag (Stephanuskirche Gebersdorf) 2026",
  ])("kein Geburtszeitraum: %s", (title) => {
    expect(birthCohort(title)).toBeUndefined();
  });
});

describe("cohortAge (Plan 0053, E3)", () => {
  it("vollendete Monate am Termin: jüngstes bis ältestes Kind", () => {
    expect(cohortAge({ from: "2026-04", to: "2026-06" }, "2026-09-22T09:30:00+02:00")).toEqual({
      minMonths: 2,
      maxMonths: 5,
    });
  });

  it("noch nicht geborene Kinder zählen als 0 Monate", () => {
    expect(cohortAge({ from: "2026-09", to: "2026-11" }, "2026-10-29T09:30:00+01:00")).toEqual({
      minMonths: 0,
      maxMonths: 1,
    });
  });

  it("Termin vor dem Geburtszeitraum: keine Angabe", () => {
    expect(cohortAge({ from: "2026-12", to: "2027-01" }, "2026-10-29T09:30:00+01:00")).toBeUndefined();
  });
});
