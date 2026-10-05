import { describe, expect, it } from "vitest";
import { Timetable } from "./schema.ts";

/** Kleinster gültiger Fahrplanauszug (Plan 0009, E4): zwei Steige, eine Fahrt. */
function base() {
  return {
    source: {
      attribution: "VGN – Verkehrsverbund Großraum Nürnberg GmbH",
      title: "VGN-Soll-Daten vom 24.06.2026",
      url: "https://www.vgn.de/web-entwickler/open-data/",
      download: "https://www.vgn.de/opendata/GTFS.zip",
      license: "CC BY-SA 3.0 DE",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/",
      modified: "2026-06-24T16:20:02+02:00",
      validFrom: "2026-06-24",
      validTo: "2026-12-12",
      fetchedAt: "2026-10-05T06:00:00+02:00",
    },
    serviceDay: "2026-10-13",
    window: { from: "08:30", to: "10:30" },
    stops: [
      ["de:09564:1:1:1", 49.45, 11.07],
      ["de:09564:2:1:1", 49.46, 11.08],
    ] as [string, number, number][],
    // an 9:00, ab 9:00, an 9:03, ab 9:03
    trips: [{ route: "U1", mode: "u-bahn", stops: [0, 1], times: [32_400, 0, 180, 0], flags: [3, 3] }],
  };
}

type T = ReturnType<typeof base>;
const issues = (fn: (t: T) => void) => {
  const t = base();
  fn(t);
  const r = Timetable.safeParse(t);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("Timetable", () => {
  it("akzeptiert einen gültigen Auszug", () => {
    expect(issues(() => {})).toEqual([]);
  });

  it.each<[string, (t: T) => void, RegExp]>([
    ["Zeiten passen nicht zu den Halten", (t) => t.trips[0]?.times.pop(), /times/],
    ["Flags passen nicht zu den Halten", (t) => t.trips[0]?.flags.pop(), /flags/],
    ["Flag außerhalb 0–3", (t) => t.trips[0]?.flags.splice(0, 1, 4), /flags/],
    ["Steig-Index ungültig", (t) => t.trips[0]?.stops.splice(1, 1, 2), /stops/],
    [
      "Fahrt mit nur einem Halt",
      (t) => Object.assign(t.trips[0] ?? {}, { stops: [0], times: [0, 0], flags: [3] }),
      /stops/,
    ],
    ["Zeit läuft rückwärts", (t) => t.trips[0]?.times.splice(2, 1, -60), /times/],
    ["Steig außerhalb der BBOX", (t) => t.stops.splice(0, 1, ["x", 48.1, 11.5]), /stops/],
    ["Stichtag kein Dienstag", (t) => Object.assign(t, { serviceDay: "2026-10-14" }), /serviceDay/],
    ["Stichtag vor der Gültigkeit", (t) => Object.assign(t, { serviceDay: "2026-06-23" }), /serviceDay/],
    ["Stichtag nach der Gültigkeit", (t) => Object.assign(t, { serviceDay: "2026-12-15" }), /serviceDay/],
    ["Fenster verdreht", (t) => Object.assign(t, { window: { from: "10:30", to: "08:30" } }), /window/],
    ["Fenster ohne HH:MM", (t) => Object.assign(t, { window: { from: "8:30", to: "10:30" } }), /window/],
    ["Lizenz-URI fehlt", (t) => Object.assign(t.source, { licenseUrl: "keine" }), /licenseUrl/],
    ["Zeit ohne Offset", (t) => Object.assign(t.source, { modified: "2026-06-24T16:20:02" }), /modified/],
    ["unbekanntes Feld", (t) => Object.assign(t, { extra: 1 }), /extra|Unrecognized/],
    // Plan 0012, E1 (G2): Verkehrsmittel ist Pflicht und eines von vier, der Linienname nie leer
    ["Fahrt ohne Verkehrsmittel", (t) => Reflect.deleteProperty(t.trips[0] ?? {}, "mode"), /mode/],
    ["unbekanntes Verkehrsmittel", (t) => Object.assign(t.trips[0] ?? {}, { mode: "faehre" }), /mode/],
    ["leerer Linienname", (t) => Object.assign(t.trips[0] ?? {}, { route: "" }), /route/],
  ])("lehnt ab: %s", (_name, fn, where) => {
    const found = issues(fn);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join("\n")).toMatch(where);
  });

  it("erlaubt Fahrten über Mitternacht (Zeiten > 24 h)", () => {
    expect(issues((t) => t.trips[0]?.times.splice(0, 1, 26 * 3600))).toEqual([]);
  });

  it("erlaubt gleiche Ankunft und Abfahrt an aufeinanderfolgenden Halten", () => {
    expect(issues((t) => t.trips[0]?.times.splice(2, 1, 0))).toEqual([]);
  });
});
