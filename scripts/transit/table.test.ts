import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type GeoPoint, haversineMeters } from "../../src/domain/geo.ts";
import { placeKey } from "../../src/domain/place-key.ts";
import { Timetable } from "../../src/domain/schema.ts";
import { decodeTransitTable, NO_MINUTES, transitReach, walkMinutes } from "../../src/domain/transit.ts";
import { areaId, buildTransitTables, cellValue, contentId, encodeBytes, tableRows, withoutAccess } from "./table.ts";

const fixture = Timetable.parse(
  JSON.parse(readFileSync(new URL("../../tests/fixtures/oepnv/fahrplan.json", import.meta.url), "utf8")),
);

/** die fünf Fixture-Orte in der Reihenfolge von tests/fixtures/providers.yaml */
const beispielhof: GeoPoint = { lat: 49.4521, lon: 11.0767 };
const musikschule: GeoPoint = { lat: 49.4362, lon: 11.0851 };
const bibliothek: GeoPoint = { lat: 49.4498, lon: 11.0812 };
const theater: GeoPoint = { lat: 49.4495, lon: 11.0601 };
const gemeindehaus: GeoPoint = { lat: 49.4301, lon: 11.0892 };
const places = [beispielhof, musikschule, bibliothek, theater, gemeindehaus];

const stopPoint = (id: string): GeoPoint => {
  const s = fixture.stops.find(([sid]) => sid === id);
  if (!s) throw new Error(id);
  return { lat: s[1], lon: s[2] };
};

describe("areaId", () => {
  it("nimmt die ersten drei Teile der DHID als Haltbereich", () => {
    expect(areaId("de:09564:510:11:U1")).toBe("de:09564:510");
    expect(areaId("de:09564:510")).toBe("de:09564:510");
  });
});

describe("tableRows", () => {
  it("macht nur Nürnberger Haltbereiche mit Einstieg im Fenster zu Zeilen", () => {
    expect(tableRows(fixture).map((r) => r.id)).toEqual([
      "de:09564:9001",
      "de:09564:9002",
      "de:09564:9003",
      "de:09564:9004",
      "de:09564:9005",
      "de:09564:9007",
    ]);
    // de:09563:9100 (Nachbarstadt) nur Netz; 9006 nur Ausstieg; 9008 nur Endhalt
  });

  it("legt die Zeile in den Mittelpunkt aller Steige des Bereichs", () => {
    const row = tableRows(fixture).find((r) => r.id === "de:09564:9004");
    expect(row?.steige).toHaveLength(2);
    expect(row?.lat).toBeCloseTo((49.4505 + 49.45) / 2, 10);
    expect(row?.lon).toBeCloseTo((11.08 + 11.0815) / 2, 10);
  });

  it("sortiert die Zeilen nach ID, unabhängig von der Reihenfolge der Steige", () => {
    const n = fixture.stops.length;
    const reversed = {
      ...fixture,
      stops: [...fixture.stops].reverse(),
      trips: fixture.trips.map((t) => ({ ...t, stops: t.stops.map((i) => n - 1 - i) })),
    };
    expect(tableRows(reversed).map((r) => r.id)).toEqual(tableRows(fixture).map((r) => r.id));
  });

  it("zählt eine Abfahrt nur im Fenster", () => {
    // letzte Abfahrt mit Einstieg: B2 an 9007 um 12:30:00 (Grenze inklusiv)
    expect(tableRows({ ...fixture, window: { from: "12:30", to: "13:00" } }).map((r) => r.id)).toEqual([
      "de:09564:9007",
    ]);
    expect(tableRows({ ...fixture, window: { from: "12:31", to: "13:00" } })).toEqual([]);
  });
});

describe("cellValue (E5, m12)", () => {
  const xs = (...parts: [count: number, value: number][]) => parts.flatMap(([n, v]) => Array<number>(n).fill(v));

  it("nimmt den Median (x[59] + x[60]) / 2 über 120 Minuten und rundet", () => {
    expect(cellValue(xs([60, 10], [60, 13]))).toBe(12); // 11,5 → 12
    expect(cellValue(xs([60, 10], [60, 12]))).toBe(11);
    expect(cellValue(xs([61, 7], [59, 90]))).toBe(7);
  });

  it("nimmt bei ungerader Zahl den mittleren Wert", () => {
    expect(cellValue([30, 4, 9])).toBe(9);
  });

  it("sortiert selbst", () => {
    expect(cellValue([...xs([60, 30]), ...xs([60, 4])].reverse())).toBe(17);
  });

  it("speichert 255, wenn ∞ in die obere Hälfte des Medians fällt", () => {
    expect(cellValue(xs([60, 10], [60, Number.POSITIVE_INFINITY]))).toBe(NO_MINUTES);
    expect(cellValue(xs([61, 10], [59, Number.POSITIVE_INFINITY]))).toBe(10);
  });

  it("speichert 0 bis 120 und darüber 255", () => {
    expect(cellValue(xs([120, 0]))).toBe(0);
    expect(cellValue(xs([120, 120.4]))).toBe(120);
    expect(cellValue(xs([120, 120.5]))).toBe(NO_MINUTES);
  });
});

describe("encodeBytes", () => {
  it("kodiert Bytes als Base64", () => {
    expect(encodeBytes(Uint8Array.from([0, 120, 255]))).toBe("AHj/");
    expect(atob(encodeBytes(Uint8Array.from({ length: 70_000 }, (_, i) => i % 256))).length).toBe(70_000);
  });
});

describe("contentId (Plan 0012, E6)", () => {
  it("ist FNV-1a 32 Bit über die UTF-8-Bytes des JSON-Texts, 8 Hex-Ziffern", () => {
    // Referenzwerte unabhängig nachgerechnet (Python, FNV-1a 32 Bit): "[]" → 741638a5, ["ä"] (UTF-8) → b37e901e
    expect(contentId([])).toBe("741638a5");
    expect(contentId(["ä"])).toBe("b37e901e");
    expect(contentId(["2026-10-13", 600, ["Tram\u00a01"]])).toBe(contentId(["2026-10-13", 600, ["Tram\u00a01"]]));
    expect(contentId(["a"])).not.toBe(contentId(["b"]));
    expect(contentId([1500])).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("buildTransitTables", () => {
  const { table: built, lines, stats } = buildTransitTables(fixture, places);
  const decoded = decodeTransitTable(built, new Set(places.map(placeKey)));
  const rowIds = tableRows(fixture).map((r) => r.id);
  const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const raw = bytes(built.minutes);
  const first = bytes(lines.first);
  const second = bytes(lines.second);
  const cell = (rowId: string, place: GeoPoint) =>
    rowIds.indexOf(rowId) * places.length + (decoded?.columns.get(placeKey(place)) ?? -1);
  const value = (rowId: string, place: GeoPoint) => (raw[cell(rowId, place)] ?? 0) & 0x7f;
  const bit = (rowId: string, place: GeoPoint) => ((raw[cell(rowId, place)] ?? 0) & 0x80) !== 0;
  const names = (rowId: string, place: GeoPoint) =>
    [first[cell(rowId, place)], second[cell(rowId, place)]]
      .filter((v) => v !== undefined && v > 0)
      .map((v) => lines.lines[(v ?? 0) - 1]);
  const walk = (stop: string, place: GeoPoint) => walkMinutes(haversineMeters(stopPoint(stop), place));
  const NB = "\u00a0";

  it("übernimmt Quelle, Stichtag und Fenster, Formatversion 2 mit Kennung", () => {
    expect(built.version).toBe(2);
    const { download: _d, modified: _m, fetchedAt: _f, ...source } = fixture.source;
    expect(built.source).toEqual(source);
    expect(lines.source).toEqual(source);
    expect(built.serviceDay).toBe("2026-10-13");
    expect(built.window).toEqual({ from: "08:30", to: "10:30" });
    expect(built.id).toMatch(/^[0-9a-f]{8}$/);
    expect(lines.table).toBe(built.id);
    expect(lines.version).toBe(1);
  });

  it("nimmt die Orte als placeKey in der Reihenfolge der ersten Nennung, ohne Doppelte", () => {
    const again = buildTransitTables(fixture, [theater, beispielhof, theater, musikschule]).table;
    expect(again.places).toEqual([placeKey(theater), placeKey(beispielhof), placeKey(musikschule)]);
  });

  it("übersteht den Round-Trip durch decodeTransitTable", () => {
    expect(decoded).toBeDefined();
    const rows = tableRows(fixture);
    expect(decoded?.lat.length).toBe(rows.length);
    rows.forEach((r, i) => {
      expect(decoded?.lat[i]).toBeCloseTo(r.lat, 4);
      expect(decoded?.lon[i]).toBeCloseTo(r.lon, 4);
    });
    expect(decoded?.minutes.length).toBe(rows.length * places.length);
    expect(decoded?.id).toBe(built.id);
    expect(first.length).toBe(raw.length);
    expect(second.length).toBe(raw.length);
    expect(Number.isInteger(built.lat[1])).toBe(true);
  });

  // L4: drei Zellen von Hand nachgerechnet (Fixture tests/fixtures/oepnv/fahrplan.json, Plan 0009, E15)
  it("direkt: 9001 → Beispielhof, Takt 10, Fahrzeit plus Median-Wartezeit 4,5 Min., „Tram 1“", () => {
    // Tram 1 ab 9001 um :x2:00 (8:32, 8:42 …), an 9003 :x8:30 (6,5 Min.), dann 61 m zu Fuß zum Beispielhof.
    // Wartezeit je Minute 0–9 Min., jede zwölfmal; Median (x[59] + x[60]) / 2 bei Warten 4 und 5 → 4,5.
    // Andere Wege sind langsamer: an 9004 aussteigen (9,5 Min. + 298 m), von 9001 ganz zu Fuß (1 341 m, 23 Min.).
    const ride = 6.5 + walk("de:09564:9003:1:1", beispielhof);
    expect(value("de:09564:9001", beispielhof)).toBe(Math.round(ride + 4.5));
    expect(value("de:09564:9001", beispielhof)).toBe(12);
    expect(names("de:09564:9001", beispielhof)).toEqual([`Tram${NB}1`]);
    expect(bit("de:09564:9001", beispielhof)).toBe(false);
  });

  it("ein Umstieg: 9001 → Gemeindehaus mit „Tram 1 → Bus 202E“, Umstiegs-Bit gesetzt", () => {
    // Tram 1 ab 9001 um T + 2:00 (T = 8:20, 8:30 …), an 9004:1 um T + 9:30; Umstieg zu 9004:2 (Fußweg + 1 Min.,
    // gut 3 Min.); Bus 202E ab T + 13:00, an 9008 um T + 19:00 (17 Min. ab 9001), dann 47 m zu Fuß.
    // Bus 2 (alle 20 Min., 8 Min. bis 9008) kommt nach jeder Tram später an als der 202E, gleich bewertet,
    // also verliert er in jeder Minute. Direkt (ohne Umstieg) liegt kein Halt der Tram in 1 500 m.
    // Wartezeit wie oben: Median 4,5 Min.
    const transfer = walk("de:09564:9004:1:1", stopPoint("de:09564:9004:2:1")) + 1;
    expect(9.5 + transfer).toBeLessThanOrEqual(13);
    const minutes = 4.5 + 17 + walk("de:09564:9008:1:1", gemeindehaus);
    expect(value("de:09564:9001", gemeindehaus)).toBe(Math.round(minutes));
    expect(value("de:09564:9001", gemeindehaus)).toBe(22);
    expect(names("de:09564:9001", gemeindehaus)).toEqual([`Tram${NB}1`, `Bus${NB}202E`]);
    expect(bit("de:09564:9001", gemeindehaus)).toBe(true);
  });

  it("Abgang zu Fuß: 9003 → Bibliothek, ohne Linien", () => {
    // Zu Fuß 437 m = 7,57 Min. Tram 1 ab 9003 um :x8:30, an 9004:1 eine Minute später, dann 117 m (2,02 Min.):
    // schneller nur bei Wartezeit ≤ 4,5 Min. Wartezeiten 0,5–9,5 Min., also 5 von 10 Minuten mit Tram.
    // Häufigkeit 60 : 60, bei Gleichstand gewinnt die Folge mit weniger Linien, also zu Fuß (E4, Schritt 3).
    // Median (7,52 + 7,57) / 2 = 7,55 → 8.
    const foot = walk("de:09564:9003:1:1", bibliothek);
    expect(1 + walk("de:09564:9004:1:1", bibliothek) + 4.5).toBeLessThan(foot);
    expect(1 + walk("de:09564:9004:1:1", bibliothek) + 5.5).toBeGreaterThan(foot);
    expect(value("de:09564:9003", bibliothek)).toBe(
      Math.round((1 + walk("de:09564:9004:1:1", bibliothek) + 4.5 + foot) / 2),
    );
    expect(names("de:09564:9003", bibliothek)).toEqual([]);
    expect(bit("de:09564:9003", bibliothek)).toBe(false);
  });

  it("nimmt den direkten Abgang, wenn er schneller ist (9005 → Bibliothek)", () => {
    expect(value("de:09564:9005", bibliothek)).toBe(Math.round(walk("de:09564:9005:1:1", bibliothek)));
    expect(names("de:09564:9005", bibliothek)).toEqual([]);
  });

  it("speichert 255, wenn nichts in 120 Min. ankommt, ohne Linien und ohne Bit", () => {
    // Aus 9007 fährt nur Bus 2 weiter nach 9008; zum Theater im Westen gibt es keinen Weg.
    expect(raw[cell("de:09564:9007", theater)]).toBe(NO_MINUTES);
    expect(names("de:09564:9007", theater)).toEqual([]);
  });

  it("setzt das Umstiegs-Bit genau bei zwei Fahrten, nie bei 255; Wert und Bit ≤ 248 (L8)", () => {
    raw.forEach((b, i) => {
      if (b === NO_MINUTES) {
        expect(first[i]).toBe(0);
        return;
      }
      expect(b).toBeLessThanOrEqual(120 | 0x80);
      // in der Fixture gibt es keine zusammengefassten Namen: zwei Fahrten = zwei Linien
      expect((b & 0x80) !== 0).toBe((second[i] ?? 0) !== 0);
      if ((second[i] ?? 0) !== 0) expect(first[i]).not.toBe(0);
    });
  });

  it("nennt Linien, Folgen und Zellen ohne Linien", () => {
    expect(lines.lines).toEqual([`Bus${NB}2`, `Bus${NB}202E`, `Tram${NB}1`]);
    expect(stats).toEqual({ lines: 3, combos: 5, withoutLines: 12, outliers: 0, cells: 26 });
  });

  it("ergibt ab Gostenhof zum Beispielhof gut 13 Min., gerundet „15 Min.“ (E2E-Erwartung, E15)", () => {
    const reach =
      decoded &&
      transitReach(decoded, { source: "stadtteil", point: { lat: 49.448, lon: 11.058 }, label: "Gostenhof" });
    const minutes = reach?.({ geo: beispielhof }).minutes ?? 0;
    expect(minutes).toBeGreaterThanOrEqual(12.5);
    expect(minutes).toBeLessThan(17.5);
    expect(reach?.({ geo: beispielhof }).byFoot).toBe(false);
  });

  it("verlängert den Abgang auf Wunsch (Vergleich 800 gegen 1 000 m, Schritt 5)", () => {
    // Punkt 900 m südlich von 9007: zu Fuß ab 9007 nur mit 1 000 m Abgang, sonst über Bus 2 und 9008
    const far: GeoPoint = { lat: 49.4365 - 0.0081, lon: 11.085 };
    const short = buildTransitTables(fixture, [far], { egressMeters: 800 }).table;
    const long = buildTransitTables(fixture, [far], { egressMeters: 1000 }).table;
    expect(short.minutes).not.toBe(long.minutes);
    expect(short.id).not.toBe(long.id);
  });

  it("ist deterministisch: zweimal bauen ergibt dieselben Bytes (L6)", () => {
    const again = buildTransitTables(fixture, places);
    expect(JSON.stringify(again.table)).toBe(JSON.stringify(built));
    expect(JSON.stringify(again.lines)).toBe(JSON.stringify(lines));
  });

  it("ändert die Kennung, wenn sich nur die Linien ändern (Review 2, H1)", () => {
    const renamed = { ...fixture, trips: fixture.trips.map((t) => (t.route === "202E" ? { ...t, route: "203" } : t)) };
    const other = buildTransitTables(renamed, places);
    expect(other.table.minutes).toBe(built.minutes);
    expect(other.table.id).not.toBe(built.id);
  });
});

describe("withoutAccess", () => {
  const table = (() => {
    const file = buildTransitTables(fixture, places).table;
    const decoded = decodeTransitTable(file, new Set(places.map(placeKey)));
    if (!decoded) throw new Error("Fixture-Tabelle ungültig");
    return decoded;
  })();
  const gostenhof = { id: "gostenhof", name: "Gostenhof", point: { lat: 49.448, lon: 11.058 } };
  const altenfurt = { id: "altenfurt", name: "Altenfurt", point: { lat: 49.408, lon: 11.167 } };

  it("nennt Stadtteile ohne Halt im Zugangsradius (Plan 0009, Schritt 5)", () => {
    expect(withoutAccess(table, [gostenhof, altenfurt])).toEqual([altenfurt]);
  });

  it("ist leer, wenn jeder Startpunkt einen Zugangshalt hat", () => {
    expect(withoutAccess(table, [gostenhof])).toEqual([]);
  });

  it("prüft gegen den Innen-Test 800 m, nicht gegen den Zugang 1 500 m (L7)", () => {
    // Zeile 9001 liegt bei 49,4485 / 11,059; westlich davon kommt kein Nürnberger Haltbereich mehr
    const west = (meters: number) => ({
      id: `w${meters}`,
      name: `${meters} m westlich`,
      point: { lat: 49.4485, lon: 11.059 - meters / (111_195 * Math.cos((49.4485 * Math.PI) / 180)) },
    });
    expect(withoutAccess(table, [west(700), west(900)]).map((o) => o.id)).toEqual(["w900"]);
  });
});
