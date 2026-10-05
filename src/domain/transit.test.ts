import { describe, expect, it } from "vitest";
import { type GeoPoint, haversineMeters } from "./geo.ts";
import { placeKey } from "./place-key.ts";
import type { Origin } from "./reach.ts";
import {
  ACCESS_METERS,
  decodeTransitTable,
  MAX_MINUTES,
  NO_MINUTES,
  TRANSIT_TABLE_VERSION,
  transitReach,
  valueAt,
  walkMinutes,
} from "./transit.ts";
import type { TransitReach, TransitTable, TransitTableFile } from "./transit-types.ts";

/** Meter je Grad Breite auf der Kugel aus `geo.ts` (R · π / 180) */
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
const north = (p: GeoPoint, meters: number): GeoPoint => ({ lat: p.lat + meters / M_PER_DEG, lon: p.lon });

const start: GeoPoint = { lat: 49.448, lon: 11.058 };
const origin = (point: GeoPoint = start): Origin => ({ source: "stadtteil", point, label: "Gostenhof" });

const source: TransitTableFile["source"] = {
  attribution: "VGN – Verkehrsverbund Großraum Nürnberg GmbH",
  title: "VGN-Soll-Daten vom 24.06.2026",
  url: "https://www.vgn.de/web-entwickler/open-data/",
  license: "CC BY-SA 3.0 DE",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/",
  validFrom: "2026-06-24",
  validTo: "2026-12-12",
};

/** Dekodierte Tabelle von Hand: Zeilen als Punkte, Werte zeilenweise. */
function table(rows: GeoPoint[], places: GeoPoint[], values: number[][]): TransitTable {
  const keys = places.map(placeKey);
  return {
    source,
    serviceDay: "2026-10-13",
    window: { from: "08:30", to: "10:30" },
    places: keys,
    columns: new Map(keys.map((k, i) => [k, i])),
    lat: Float64Array.from(rows.map((r) => r.lat)),
    lon: Float64Array.from(rows.map((r) => r.lon)),
    minutes: Uint8Array.from(values.flat()),
  };
}

function expectReach(reach: TransitReach | undefined, minutes: number, byFoot: boolean) {
  expect(reach?.kind).toBe("oepnv");
  expect(reach?.byFoot).toBe(byFoot);
  expect(reach?.minutes).toBeCloseTo(minutes, 9);
}

const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

function file(overrides: Partial<TransitTableFile> = {}): TransitTableFile {
  return {
    version: 1,
    source,
    serviceDay: "2026-10-13",
    window: { from: "08:30", to: "10:30" },
    places: ["49.4521,11.0767", "49.4362,11.0851"],
    // Zeilen 49.4485/11.059 und 49.4497/11.064, als Differenz in Grad × 1e4
    lat: [494485, 12],
    lon: [110590, 50],
    minutes: base64([12, 30, 10, 255]),
    ...overrides,
  };
}

describe("walkMinutes", () => {
  it("rechnet Luftlinie × 1,3 bei 4,5 km/h (75 m/Min.)", () => {
    expect(walkMinutes(750)).toBe(13);
    expect(walkMinutes(0)).toBe(0);
    expect(walkMinutes(75)).toBeCloseTo(1.3, 10);
  });
});

describe("decodeTransitTable", () => {
  const keys = new Set(["49.4521,11.0767", "49.4362,11.0851"]);

  it("dekodiert Zeilen, Spalten und Werte", () => {
    const t = decodeTransitTable(file(), keys);
    expect(t).toBeDefined();
    expect(Array.from(t?.lat ?? [])).toEqual([49.4485, 49.4497]);
    expect(Array.from(t?.lon ?? [])).toEqual([11.059, 11.064]);
    expect(Array.from(t?.minutes ?? [])).toEqual([12, 30, 10, 255]);
    expect(t?.columns.get("49.4362,11.0851")).toBe(1);
    expect(t?.places).toEqual([...keys]);
    expect(t?.source).toEqual(source);
    expect(t?.serviceDay).toBe("2026-10-13");
    expect(t?.window).toEqual({ from: "08:30", to: "10:30" });
  });

  it("nimmt mehr Spalten hin, als die Seite Orte hat", () => {
    expect(decodeTransitTable(file(), new Set(["49.4521,11.0767"]))).toBeDefined();
  });

  it("dekodiert eine leere Tabelle", () => {
    expect(decodeTransitTable(file({ lat: [], lon: [], minutes: "" }), keys)?.minutes.length).toBe(0);
  });

  it.each<[string, Partial<TransitTableFile>]>([
    ["falsche Version", { version: 2 as 1 }],
    ["lat und lon verschieden lang", { lon: [110590] }],
    ["zu wenige Werte", { minutes: base64([12, 30, 10]) }],
    ["zu viele Werte", { minutes: base64([12, 30, 10, 255, 7]) }],
    ["kein gültiges Base64", { minutes: "%%%" }],
    ["fehlende Felder", { places: undefined as unknown as string[] }],
    ["Koordinate keine Zahl", { lat: [494485, "12" as unknown as number] }],
  ])("lehnt %s ab", (_, overrides) => {
    expect(decodeTransitTable(file(overrides), keys)).toBeUndefined();
  });

  it("lehnt eine Tabelle ab, der ein Ort der Seite fehlt (alter HTTP-Cache)", () => {
    expect(decodeTransitTable(file(), new Set([...keys, "49.4498,11.0812"]))).toBeUndefined();
  });

  it("lehnt eine Antwort ab, die gar keine Tabelle ist", () => {
    expect(decodeTransitTable(null as unknown as TransitTableFile, keys)).toBeUndefined();
  });
});

describe("transitReach", () => {
  const place: GeoPoint = { lat: 49.4521, lon: 11.0767 };
  const nearRow = north(start, 100);
  const farRow = north(start, 500);

  it("nimmt das Minimum über die Zugangshalte (Fußweg zum Halt + Tabellenwert)", () => {
    const reach = transitReach(table([nearRow, farRow], [place], [[20], [5]]), origin());
    expectReach(reach?.({ geo: place }), walkMinutes(500) + 5, false);
  });

  it("lässt den direkten Fußweg gewinnen, wenn er schneller ist", () => {
    const close = north(start, 300);
    const reach = transitReach(table([nearRow], [close], [[30]]), origin());
    expectReach(reach?.({ geo: close }), walkMinutes(300), true);
  });

  it("liefert undefined ohne Halt im Umkreis von 800 m (außerhalb des Stadtgebiets)", () => {
    expect(transitReach(table([north(start, 801)], [place], [[5]]), origin())).toBeUndefined();
    expect(transitReach(table([], [place], []), origin())).toBeUndefined();
  });

  it("zählt einen Halt genau an der Grenze von 800 m mit", () => {
    expect(ACCESS_METERS).toBe(800);
    const edge = north(start, ACCESS_METERS - 1e-6);
    expect(haversineMeters(start, edge)).toBeLessThanOrEqual(ACCESS_METERS);
    expect(transitReach(table([edge], [place], [[5]]), origin())).toBeDefined();
  });

  it("ignoriert 255 (keine Angabe)", () => {
    // Ort 3 km nördlich: zu Fuß 52 Min., über den fernen Halt 6,7 + 30 Min.
    const away = north(start, 3000);
    const reach = transitReach(table([nearRow, farRow], [away], [[NO_MINUTES], [30]]), origin());
    expectReach(reach?.({ geo: away }), walkMinutes(500) + 30, false);
  });

  it("ergibt Infinity, wenn nichts erreichbar ist und der Fußweg über 2 Std. dauert", () => {
    const away = north(start, 75 * (MAX_MINUTES + 1));
    const reach = transitReach(table([nearRow], [away], [[NO_MINUTES]]), origin());
    expect(reach?.({ geo: away })).toEqual({ kind: "oepnv", minutes: Infinity, byFoot: false });
  });

  it("geht zu Fuß, wenn die Tabelle nichts weiß und der Weg unter 2 Std. bleibt", () => {
    const reach = transitReach(table([nearRow], [place], [[NO_MINUTES]]), origin());
    expectReach(reach?.({ geo: place }), walkMinutes(haversineMeters(start, place)), true);
  });

  it("rechnet für einen Ort ohne Spalte nur den Fußweg", () => {
    const reach = transitReach(table([nearRow], [place], [[5]]), origin());
    const other = north(start, 600);
    expectReach(reach?.({ geo: other }), walkMinutes(600), true);
  });

  it("liefert für denselben Ort dasselbe Objekt (Zwischenspeicher je Startpunkt)", () => {
    const reach = transitReach(table([nearRow], [place], [[5]]), origin());
    expect(reach?.({ geo: place })).toBe(reach?.({ geo: { ...place } }));
  });

  it("rechnet für Standort, Stadtteil und Kartenmitte gleich", () => {
    const t = table([nearRow, farRow], [place], [[20], [5]]);
    const results = (["standort", "stadtteil", "karte"] as const).map((s) =>
      transitReach(t, { source: s, point: start, label: s })?.({ geo: place }),
    );
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("hängt nicht von der Geräte-Zeitzone ab", () => {
    // Unit-Tests laufen absichtlich in America/Los_Angeles; die Rechnung kennt keine Uhrzeit.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles");
    const decoded = decodeTransitTable(file(), new Set(["49.4521,11.0767"]));
    expect(decoded).toBeDefined();
    const reach = decoded && transitReach(decoded, origin());
    const viaFirst = walkMinutes(haversineMeters(start, { lat: 49.4485, lon: 11.059 })) + 12;
    expect(reach?.({ geo: place }).minutes).toBeCloseTo(viaFirst, 10);
  });
});

describe("valueAt", () => {
  it("liest gültige Indizes und wirft bei ungültigen (Programmierfehler)", () => {
    expect(valueAt(Uint8Array.from([7, 255]), 1)).toBe(255);
    expect(valueAt([0.5], 0)).toBe(0.5);
    expect(() => valueAt(new Float64Array(2), 2)).toThrow(RangeError);
    expect(() => valueAt([], -1)).toThrow(/außerhalb/);
  });
});

describe("Format-Konstanten", () => {
  it("passen zu E5/E7", () => {
    expect(TRANSIT_TABLE_VERSION).toBe(1);
    expect(MAX_MINUTES).toBe(120);
    expect(NO_MINUTES).toBe(255);
  });
});
