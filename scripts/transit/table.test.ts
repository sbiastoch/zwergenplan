import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type GeoPoint, haversineMeters } from "../../src/domain/geo.ts";
import { placeKey } from "../../src/domain/place-key.ts";
import { Timetable } from "../../src/domain/schema.ts";
import { decodeTransitTable, NO_MINUTES, transitReach, walkMinutes } from "../../src/domain/transit.ts";
import { areaId, buildTransitTable, cellValue, encodeMinutes, tableRows, withoutAccess } from "./table.ts";

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

describe("encodeMinutes", () => {
  it("kodiert Bytes als Base64", () => {
    expect(encodeMinutes(Uint8Array.from([0, 120, 255]))).toBe("AHj/");
    expect(atob(encodeMinutes(Uint8Array.from({ length: 70_000 }, (_, i) => i % 256))).length).toBe(70_000);
  });
});

describe("buildTransitTable", () => {
  const built = buildTransitTable(fixture, places);
  const decoded = decodeTransitTable(built, new Set(places.map(placeKey)));
  const rowIds = tableRows(fixture).map((r) => r.id);
  const value = (rowId: string, place: GeoPoint) => {
    const row = rowIds.indexOf(rowId);
    const col = decoded?.columns.get(placeKey(place)) ?? -1;
    return decoded?.minutes[row * (decoded?.places.length ?? 0) + col];
  };

  it("übernimmt Quelle, Stichtag und Fenster", () => {
    expect(built.version).toBe(1);
    const { download: _d, modified: _m, fetchedAt: _f, ...source } = fixture.source;
    expect(built.source).toEqual(source);
    expect(built.serviceDay).toBe("2026-10-13");
    expect(built.window).toEqual({ from: "08:30", to: "10:30" });
  });

  it("nimmt die Orte als placeKey in der Reihenfolge der ersten Nennung, ohne Doppelte", () => {
    const again = buildTransitTable(fixture, [theater, beispielhof, theater, musikschule]);
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
    expect(Number.isInteger(built.lat[1])).toBe(true);
  });

  it("ergibt bei Takt 10 die Fahrzeit plus Median-Wartezeit 4,5 Min. (9001 → Beispielhof)", () => {
    // T1 ab 9001 :x2:00, an 9003 :x8:30 (6,5 Min.), dann zu Fuß zum Beispielhof
    const ride = 6.5 + walkMinutes(haversineMeters(stopPoint("de:09564:9003:1:1"), beispielhof));
    expect(value("de:09564:9001", beispielhof)).toBe(Math.round(ride + 4.5));
    expect(value("de:09564:9001", beispielhof)).toBe(12);
  });

  it("nimmt den direkten Abgang, wenn er schneller ist (9005 → Bibliothek)", () => {
    const walk = walkMinutes(haversineMeters(stopPoint("de:09564:9005:1:1"), bibliothek));
    expect(value("de:09564:9005", bibliothek)).toBe(Math.round(walk));
  });

  it("speichert 255, wenn nichts in 120 Min. ankommt", () => {
    // Aus 9007 fährt nur B2 weiter nach 9008; zum Theater im Westen gibt es keinen Weg.
    expect(value("de:09564:9007", theater)).toBe(NO_MINUTES);
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
    // Punkt 900 m südlich von 9007: zu Fuß ab 9007 nur mit 1 000 m Abgang, sonst über B2 und 9008
    const far: GeoPoint = { lat: 49.4365 - 0.0081, lon: 11.085 };
    const short = buildTransitTable(fixture, [far]);
    const long = buildTransitTable(fixture, [far], { egressMeters: 1000 });
    expect(short.minutes).not.toBe(long.minutes);
  });

  it("ist deterministisch", () => {
    expect(JSON.stringify(buildTransitTable(fixture, places))).toBe(JSON.stringify(built));
  });
});

describe("withoutAccess", () => {
  const table = (() => {
    const file = buildTransitTable(fixture, places);
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
});
