import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Timetable } from "../../../src/domain/schema.ts";
import {
  activeServices,
  type CsvRow,
  extractTimetable,
  feedValidity,
  type GtfsTexts,
  gtfsTables,
  gtfsTexts,
  parseCsv,
  parseGtfsTime,
  pickServiceDay,
  serializeTimetable,
  splitLines,
  vgnSource,
} from "./gtfs.ts";

const FIXTURE = new URL("../../../tests/fixtures/pipeline/gtfs/", import.meta.url);

/** Der fiktive Mini-Feed (tests/fixtures/pipeline/gtfs/, BOM, Anführungszeichen, LF). */
function fixtureTexts(transform: (text: string) => string = (t) => t): GtfsTexts {
  return gtfsTexts((file) => transform(readFileSync(new URL(file, FIXTURE), "utf8")));
}

const csv = (text: string): CsvRow[] => [...parseCsv(splitLines(text))];

const source = vgnSource({
  lastModified: "Wed, 24 Jun 2026 14:20:02 GMT",
  fetchedAt: new Date("2026-10-05T04:00:00Z"),
  validFrom: "2026-06-24",
  validTo: "2026-12-12",
});

const extract = (texts = fixtureTexts()) => extractTimetable(gtfsTables(texts), { serviceDay: "2026-10-13", source });

/** Steig-IDs einer Fahrt im Auszug */
const stopIds = (t: Timetable, trip: Timetable["trips"][number]) => trip.stops.map((i) => t.stops[i]?.[0]);

describe("CSV", () => {
  it("entfernt das BOM, liest Anführungszeichen, Komma im Feld und CRLF", () => {
    const rows = csv('﻿stop_id,stop_name\r\n"a:1","Testhof, ""Alte Mühle"""\r\n"b:2",Plärrer\r\n');
    expect(rows).toEqual([
      { stop_id: "a:1", stop_name: 'Testhof, "Alte Mühle"' },
      { stop_id: "b:2", stop_name: "Plärrer" },
    ]);
  });

  it("liest leere Felder und überspringt Leerzeilen", () => {
    expect(csv('a,b,c\n1,,3\n\n"",x,""\n')).toEqual([
      { a: "1", b: "", c: "3" },
      { a: "", b: "x", c: "" },
    ]);
  });

  it("bricht bei offenem Anführungszeichen und falscher Feldzahl laut ab", () => {
    expect(() => csv('a,b\n"offen,1\n')).toThrow(/Zeile 2/);
    expect(() => csv("a,b\n1,2,3\n")).toThrow(/Zeile 2: 3 Felder, erwartet 2/);
  });

  it("splitLines liefert die letzte Zeile auch ohne Zeilenumbruch", () => {
    expect([...splitLines("a\r\nb\nc")]).toEqual(["a", "b", "c"]);
    expect([...splitLines("")]).toEqual([]);
  });
});

describe("parseGtfsTime", () => {
  it("rechnet Sekunden ab Mitternacht, auch über 24:00", () => {
    expect(parseGtfsTime("08:30:00")).toBe(30_600);
    expect(parseGtfsTime("8:30:15")).toBe(30_615);
    expect(parseGtfsTime("25:10:05")).toBe(90_605);
  });

  it("lehnt Unsinn ab", () => {
    expect(() => parseGtfsTime("8:30")).toThrow(/Uhrzeit/);
    expect(() => parseGtfsTime("08:61:00")).toThrow(/Uhrzeit/);
  });
});

describe("Kalender", () => {
  const texts = fixtureTexts();
  const calendar = csv(texts.calendar);
  const dates = csv(texts.calendarDates);

  it("Gültigkeit = frühester Beginn bis spätestes Ende in calendar.txt", () => {
    expect(feedValidity(calendar, dates)).toEqual({ validFrom: "2026-06-24", validTo: "2026-12-12" });
  });

  it("ohne calendar.txt zählen die hinzugefügten Tage aus calendar_dates.txt", () => {
    expect(feedValidity([], dates)).toEqual({ validFrom: "2026-10-13", validTo: "2026-10-13" });
    expect(() => feedValidity([], [])).toThrow(/Gültigkeit/);
  });

  it("bricht bei unlesbarem Datum ab", () => {
    expect(() => feedValidity([{ start_date: "2026-06-24", end_date: "20261212" }], [])).toThrow(/kein Datum/);
  });

  it("aktive Dienste nach Wochentag, Zeitraum und calendar_dates (1 = hinzu, 2 = weg)", () => {
    expect([...activeServices(calendar, dates, "2026-10-13")].sort()).toEqual(["EXTRA", "WT"]);
    expect([...activeServices(calendar, dates, "2026-10-20")].sort()).toEqual(["AUSF"]);
    expect([...activeServices(calendar, dates, "2026-07-14")].sort()).toEqual(["ALT", "AUSF", "WT"]);
    expect([...activeServices(calendar, dates, "2026-10-17")]).toEqual(["SA"]);
    expect([...activeServices(calendar, dates, "2026-12-15")]).toEqual([]);
  });

  it("bricht bei unbekanntem exception_type ab", () => {
    expect(() =>
      activeServices(calendar, [{ service_id: "WT", date: "20261013", exception_type: "3" }], "2026-10-13"),
    ).toThrow(/exception_type/);
  });
});

describe("pickServiceDay", () => {
  const valid = { validFrom: "2026-06-24", validTo: "2026-12-12" };

  it("nimmt den ersten Dienstag ab heute + 7 Tage", () => {
    expect(pickServiceDay({ ...valid, freeDays: {}, today: "2026-10-05" })).toBe("2026-10-13");
    // heute + 7 ist selbst ein Dienstag: zählt mit
    expect(pickServiceDay({ ...valid, freeDays: {}, today: "2026-10-06" })).toBe("2026-10-13");
  });

  it("überspringt Feiertage und Ferien", () => {
    const freeDays = { "2026-10-13": "Feiertag", "2026-11-03": "Herbstferien" };
    expect(pickServiceDay({ ...valid, freeDays, today: "2026-10-05" })).toBe("2026-10-20");
    expect(pickServiceDay({ ...valid, freeDays, today: "2026-10-26" })).toBe("2026-11-10");
  });

  it("nimmt sonst den letzten Kandidaten im Gültigkeitszeitraum", () => {
    expect(pickServiceDay({ ...valid, freeDays: {}, today: "2026-12-07" })).toBe("2026-12-08");
    expect(pickServiceDay({ ...valid, freeDays: { "2026-12-08": "Ferien" }, today: "2026-12-30" })).toBe("2026-12-01");
  });

  it("bricht ohne Kandidaten ab", () => {
    expect(() =>
      pickServiceDay({ validFrom: "2026-10-14", validTo: "2026-10-19", freeDays: {}, today: "2026-10-05" }),
    ).toThrow(/Kein Dienstag/);
    expect(() =>
      pickServiceDay({
        validFrom: "2026-10-13",
        validTo: "2026-10-20",
        freeDays: { "2026-10-13": "x", "2026-10-20": "y" },
        today: "2026-10-05",
      }),
    ).toThrow(/Kein Dienstag/);
  });
});

describe("vgnSource", () => {
  it("Namensnennung nach CC BY-SA 3.0 DE mit Titel aus Last-Modified (Berliner Datum)", () => {
    expect(source).toEqual({
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
    });
  });

  it("bricht ohne lesbares Last-Modified ab", () => {
    expect(() => vgnSource({ lastModified: "gestern", fetchedAt: new Date(), validFrom: "", validTo: "" })).toThrow(
      /Last-Modified/,
    );
  });
});

describe("extractTimetable", () => {
  const { timetable: t, stats } = extract();
  const routes = t.trips.map((trip) => trip.route);

  it("liefert einen gültigen Auszug (Timetable.parse) mit Stichtag, Fenster und Quelle", () => {
    expect(Timetable.parse(t)).toEqual(t);
    expect(t.serviceDay).toBe("2026-10-13");
    expect(t.window).toEqual({ from: "08:30", to: "10:30" });
    expect(t.source).toEqual(source);
  });

  it("enthält nur benutzte Steige in der BBOX, sortiert, auf 5 Nachkommastellen", () => {
    expect(t.stops).toEqual([
      ["de:09563:9100:1:1", 49.447, 11.03],
      ["de:09564:9001:1:1", 49.44812, 11.05888],
      ["de:09564:9001:1:2", 49.44795, 11.05912],
      ["de:09564:9002:1:1", 49.4502, 11.065],
      ["de:09564:9002:2:1", 49.45031, 11.06522],
      ["de:09564:9003:1:1", 49.4518, 11.076],
      ["de:09564:9003:1:2", 49.45175, 11.0764],
    ]);
  });

  it("zählt Steige, Fahrten, Verbindungen und weggelassene Bedarfsfahrten", () => {
    expect(stats).toEqual({ stops: 7, trips: 7, connections: 12, demandTrips: 1 });
  });

  it("lässt Rufbus, fremde Dienste und Fahrten über 24:00 weg", () => {
    expect(routes).not.toContain("R9");
    expect(routes).not.toContain("N7");
    // AUSF (Ausnahme 2), ALT (abgelaufen) und SA (Samstag) fahren nicht; EXTRA (Ausnahme 1) fährt um 10:00
    expect(t.trips.filter((trip) => trip.route === "T1").map((trip) => trip.times[0])).toEqual([
      30_570, 32_400, 36_000, 44_910,
    ]);
  });

  it("sortiert die Halte einer Fahrt nach stop_sequence, auch verstreut in stop_times.txt", () => {
    const trip = t.trips.find((x) => x.times[0] === 32_400);
    expect(trip).toEqual({
      route: "T1",
      mode: "tram",
      stops: [1, 3, 5],
      times: [32_400, 0, 120, 0, 120, 0],
      flags: [3, 3, 3],
    });
  });

  it("pickup_type 2 sperrt das Einsteigen, drop_off_type 1 das Aussteigen, leer heißt erlaubt", () => {
    const trip = t.trips.find((x) => x.route === "B2" && x.times[0] === 33_000);
    expect(trip?.flags).toEqual([1, 2, 3]);
    expect(trip?.times).toEqual([33_000, 0, 240, 0, 240, 0]);
  });

  it("behält zwei aufeinanderfolgende Verbindungen mit dep == arr", () => {
    const trip = t.trips.find((x) => x.route === "B2" && x.times[0] === 34_200);
    expect(trip?.times).toEqual([34_200, 0, 0, 0, 0, 0]);
  });

  it("eine Fahrt raus aus der BBOX und wieder hinein bleibt eine Fahrt ohne den Halt draußen", () => {
    const trip = t.trips.find((x) => x.route === "X5");
    expect(trip && stopIds(t, trip)).toEqual(["de:09563:9100:1:1", "de:09564:9003:1:2", "de:09564:9002:2:1"]);
    expect(trip?.times).toEqual([35_100, 0, 2_100, 0, 300, 0]);
    // x5-1100 hat nur einen Halt in der BBOX → keine Verbindung, keine Fahrt
    expect(routes.filter((r) => r === "X5")).toHaveLength(1);
  });

  it("schneidet auf Verbindungen mit Abfahrt 8:30–12:30 zu (Grenzen inklusiv), Sekunden bleiben", () => {
    const first = t.trips[0];
    // t1-0826: A1 8:26 → B1 an 8:29:30 ab 8:30:00 → C1 8:32; die Verbindung ab 8:26 fällt weg
    expect(first && stopIds(t, first)).toEqual(["de:09564:9002:1:1", "de:09564:9003:1:1"]);
    expect(first?.times).toEqual([30_570, 30, 120, 0]);
    const last = t.trips.at(-1);
    // t1-1228: A1 12:28:30 → B1 12:30:45 → C1; ab 12:30:45 fährt nichts mehr in den Auszug
    expect(last && stopIds(t, last)).toEqual(["de:09564:9001:1:1", "de:09564:9002:1:1"]);
    expect(last?.times).toEqual([44_910, 0, 135, 0]);
  });

  it("ordnet die Fahrten nach erster Abfahrt", () => {
    const firstDep = t.trips.map((trip) => (trip.times[0] ?? 0) + (trip.times[1] ?? 0));
    expect(firstDep).toEqual([...firstDep].sort((a, b) => a - b));
    expect(routes).toEqual(["T1", "T1", "B2", "B2", "X5", "T1", "T1"]);
  });

  it("liefert mit CRLF dasselbe wie mit LF und ist deterministisch", () => {
    expect(extract(fixtureTexts((text) => text.replaceAll("\n", "\r\n"))).timetable).toEqual(t);
    expect(serializeTimetable(extract().timetable)).toBe(serializeTimetable(t));
  });
});

describe("extractTimetable: Feed-Fehler brechen laut ab", () => {
  const texts = fixtureTexts();
  const replace = (key: keyof GtfsTexts, from: string, to: string): GtfsTexts => ({
    ...texts,
    [key]: texts[key].replace(from, to),
  });
  const run = (t: GtfsTexts) => () => extractTimetable(gtfsTables(t), { serviceDay: "2026-10-13", source });

  it("unbekannte Fahrt, Route oder Steig", () => {
    expect(run(replace("stopTimes", '"t1-0900","09:00:00"', '"t1-xxxx","09:00:00"'))).toThrow(/Fahrt t1-xxxx/);
    expect(run(replace("trips", '"t1","WT","t1-0900"', '"t9","WT","t1-0900"'))).toThrow(/Route t9/);
    expect(run(replace("stopTimes", '"09:00:00","de:09564:9001:1:1"', '"09:00:00","de:0:0:0:0"'))).toThrow(
      /Steig de:0:0:0:0/,
    );
  });

  it("rückwärts laufende Zeit", () => {
    expect(run(replace("stopTimes", '"09:02:00","09:02:00"', '"08:59:00","08:59:00"'))).toThrow(/t1-0900.*rückwärts/);
  });

  it("fehlende Spalte", () => {
    expect(run(replace("stopTimes", "pickup_type", "pickup"))).toThrow(/Spalte pickup_type/);
  });

  it("ohne Kurznamen nennt die Fahrt den langen Linienname", () => {
    const { timetable } = run(replace("routes", '"x5","","X5"', '"x5","",""'))();
    expect(timetable.trips.map((t) => t.route)).toContain("Nachbarstadt - Weit draußen - Testhof");
  });

  it("ohne Kurz- und Langnamen bricht eine übernommene Fahrt ab (Plan 0012, E1)", () => {
    const nameless = replace("routes", '"x5","","X5","Nachbarstadt - Weit draußen - Testhof"', '"x5","","",""');
    expect(run(nameless)).toThrow(/Route x5 ohne Namen/);
  });
});

describe("extractTimetable: Verkehrsmittel aus route_type (Plan 0012, E1, G1)", () => {
  const texts = fixtureTexts();
  const withType = (route: string, type: string): GtfsTexts => ({
    ...texts,
    routes: texts.routes.replace(new RegExp(`^("${route}",.*,)"\\d+"$`, "m"), `$1"${type}"`),
  });
  const run = (t: GtfsTexts) => extractTimetable(gtfsTables(t), { serviceDay: "2026-10-13", source }).timetable;
  const modes = (t: Timetable) => new Map(t.trips.map((trip) => [trip.route, trip.mode]));

  it("bildet 0/1/2/3 auf tram/u-bahn/bahn/bus ab", () => {
    expect(modes(run(texts))).toEqual(
      new Map([
        ["T1", "tram"],
        ["B2", "bus"],
        ["X5", "bus"],
      ]),
    );
    expect(modes(run(withType("t1", "1"))).get("T1")).toBe("u-bahn");
    expect(modes(run(withType("t1", "2"))).get("T1")).toBe("bahn");
    expect(modes(run(withType("b2", "0"))).get("B2")).toBe("tram");
  });

  it("wirft bei unbekanntem route_type mit dem Liniennamen, wenn die Fahrt im Auszug bleibt", () => {
    expect(() => run(withType("b2", "7"))).toThrow("GTFS: Linie B2 hat unbekannten route_type 7");
  });

  it("wirft nicht für Bedarfsverkehre und Fahrten außerhalb des Auszugs", () => {
    // R9 ist ein Rufbus (weggelassen), N7 fährt nur um 23:50 (außerhalb des Fensters)
    expect(() => run(withType("r9", "715"))).not.toThrow();
    expect(() => run(withType("n7", "700"))).not.toThrow();
  });
});

describe("serializeTimetable", () => {
  it("schreibt das Zeilenformat der Fixture byte-genau nach (ein Steig bzw. eine Fahrt je Zeile)", () => {
    const text = readFileSync(new URL("../../../tests/fixtures/oepnv/fahrplan.json", import.meta.url), "utf8");
    expect(serializeTimetable(Timetable.parse(JSON.parse(text)))).toBe(text);
  });

  it("ist gültiges JSON, auch mit leeren Listen", () => {
    const { timetable } = extract();
    const empty = { ...timetable, stops: [], trips: [] };
    expect(JSON.parse(serializeTimetable(empty))).toEqual(empty);
    expect(serializeTimetable(empty)).toContain('"stops": [],\n');
    expect(JSON.parse(serializeTimetable(timetable))).toEqual(timetable);
  });
});
