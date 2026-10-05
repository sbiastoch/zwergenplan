import { describe, expect, it } from "vitest";
import { type GeoPoint, haversineMeters } from "./geo.ts";
import { placeKey } from "./place-key.ts";
import type { Origin } from "./reach.ts";
import {
  ACCESS_METERS,
  decodeTransitLines,
  decodeTransitTable,
  INSIDE_METERS,
  MAX_MINUTES,
  NO_MINUTES,
  TRANSFER_PENALTY_MINUTES,
  TRANSIT_TABLE_VERSION,
  transitReach,
  valueAt,
  walkMinutes,
} from "./transit.ts";
import type { TransitLines, TransitLinesFile, TransitReach, TransitTable, TransitTableFile } from "./transit-types.ts";

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
    id: "0badc0de",
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
    version: 2,
    id: "0badc0de",
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

  it("nimmt Bytes mit Umstiegs-Bit an: 130 ist 2 Min. mit Umstieg, 248 ist 120 Min. mit Umstieg", () => {
    const t = decodeTransitTable(file({ minutes: base64([130, 248, 10, 255]) }), keys);
    expect(Array.from(t?.minutes ?? [])).toEqual([130, 248, 10, 255]);
    expect(t?.id).toBe("0badc0de");
  });

  it("nimmt mehr Spalten hin, als die Seite Orte hat", () => {
    expect(decodeTransitTable(file(), new Set(["49.4521,11.0767"]))).toBeDefined();
  });

  it("dekodiert eine leere Tabelle", () => {
    expect(decodeTransitTable(file({ lat: [], lon: [], minutes: "" }), keys)?.minutes.length).toBe(0);
  });

  it.each<[string, Partial<TransitTableFile>]>([
    ["Version 1 (vor Plan 0012)", { version: 1 as 2 }],
    ["Kennung fehlt", { id: undefined as unknown as string }],
    ["Byte 121 (Minuten über 120)", { minutes: base64([12, 30, 121, 255]) }],
    ["Byte 249 (Minuten über 120 mit Umstiegs-Bit)", { minutes: base64([12, 30, 249, 255]) }],
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
    expect(transitReach(table([north(start, 900)], [place], [[5]]), origin())).toBeUndefined();
    expect(transitReach(table([], [place], []), origin())).toBeUndefined();
  });

  // D3: beide Grenzen inklusiv (Plan 0012, E2/E8, Review 2, H8)
  it("zählt den nächsten Halt in genau 800 m als innen", () => {
    expect(INSIDE_METERS).toBe(800);
    const edge = north(start, INSIDE_METERS - 1e-6);
    expect(haversineMeters(start, edge)).toBeLessThanOrEqual(INSIDE_METERS);
    expect(transitReach(table([edge], [place], [[5]]), origin())).toBeDefined();
  });

  it("nimmt Halte bis 1 500 m als Zugang, einen in 1 501 m nicht", () => {
    expect(ACCESS_METERS).toBe(1500);
    const away = north(start, 8000);
    const edge = north(start, ACCESS_METERS - 1e-6);
    const beyond = north(start, 1501);
    // Innen über einen Halt in 100 m, der nichts weiß; der ferne Halt allein trägt die Wegzeit
    expectReach(
      transitReach(table([nearRow, edge], [away], [[NO_MINUTES], [10]]), origin())?.({ geo: away }),
      walkMinutes(haversineMeters(start, edge)) + 10,
      false,
    );
    expect(
      transitReach(table([nearRow, beyond], [away], [[NO_MINUTES], [10]]), origin())?.({ geo: away }).minutes,
    ).toBe(Infinity);
  });

  it("nimmt Halte in 700 m und 1 400 m beide, der günstigere gewinnt", () => {
    const away = north(start, 8000);
    const near = north(start, 700);
    const far = north(start, 1400);
    const viaFar = walkMinutes(haversineMeters(start, far)) + 20;
    expectReach(transitReach(table([near, far], [away], [[60], [20]]), origin())?.({ geo: away }), viaFar, false);
    const viaNear = walkMinutes(haversineMeters(start, near)) + 30;
    expectReach(transitReach(table([near, far], [away], [[30], [20]]), origin())?.({ geo: away }), viaNear, false);
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

const NB = "\u00a0";

function linesFile(overrides: Partial<TransitLinesFile> = {}): TransitLinesFile {
  return {
    version: 1,
    table: "0badc0de",
    source,
    lines: [`Bus${NB}37`, `Tram${NB}4`, "U1"],
    // 2 Zeilen × 2 Spalten wie file(): „Bus 37 → U1“, „Tram 4“, keine, keine
    first: base64([1, 2, 0, 0]),
    second: base64([3, 0, 0, 0]),
    ...overrides,
  };
}

describe("decodeTransitLines (D1)", () => {
  const keys = new Set(["49.4521,11.0767", "49.4362,11.0851"]);
  const decoded = decodeTransitTable(file(), keys);
  if (!decoded) throw new Error("Testtabelle ungültig");

  it("dekodiert Namen und beide Ebenen", () => {
    const lines = decodeTransitLines(linesFile(), decoded);
    expect(lines?.names).toEqual([`Bus${NB}37`, `Tram${NB}4`, "U1"]);
    expect(Array.from(lines?.first ?? [])).toEqual([1, 2, 0, 0]);
    expect(Array.from(lines?.second ?? [])).toEqual([3, 0, 0, 0]);
  });

  it.each<[string, Partial<TransitLinesFile>]>([
    ["falsche Version", { version: 2 as 1 }],
    ["andere Tabelle (Kennung)", { table: "deadbeef" }],
    ["Namen kein Array", { lines: "U1" as unknown as string[] }],
    ["Name kein String", { lines: ["U1", 4 as unknown as string] }],
    ["mehr als 254 Namen", { lines: Array.from({ length: 255 }, (_, i) => `Bus${NB}${i}`) }],
    ["erste Ebene kein Base64", { first: "%%%" }],
    ["zweite Ebene kein Base64", { second: "%%%" }],
    ["erste Ebene zu kurz", { first: base64([1, 2, 0]) }],
    ["zweite Ebene zu lang", { second: base64([3, 0, 0, 0, 0]) }],
    ["Wert über der Zahl der Namen", { first: base64([1, 4, 0, 0]) }],
    ["zweite Linie ohne erste", { second: base64([3, 0, 1, 0]) }],
  ])("lehnt ab: %s", (_, overrides) => {
    expect(decodeTransitLines(linesFile(overrides), decoded)).toBeUndefined();
  });

  it("lehnt eine Antwort ab, die gar keine Linien-Datei ist", () => {
    expect(decodeTransitLines(null as unknown as TransitLinesFile, decoded)).toBeUndefined();
  });
});

describe("transitReach mit Umstiegs-Bit und Linien (D2)", () => {
  /** über 2 Std. zu Fuß: Der direkte Fußweg zählt nicht */
  const away = north(start, 8000);
  const T = 0x80;
  const P = TRANSFER_PENALTY_MINUTES;
  /** Linien von Hand: je Zelle [erste, zweite] als Index + 1 in `names` */
  const lines = (names: string[], cells: [number, number][]): TransitLines => ({
    names,
    first: Uint8Array.from(cells.map(([a]) => a)),
    second: Uint8Array.from(cells.map(([, b]) => b)),
  });
  const rowA = north(start, 100);
  const rowB = north(start, 400);
  const wA = walkMinutes(haversineMeters(start, rowA));
  const wB = walkMinutes(haversineMeters(start, rowB));
  /** Minuten (Gleitkomma), zu Fuß und Linien */
  const expectLines = (reach: TransitReach | undefined, minutes: number, byFoot: boolean, names?: string[]) => {
    expectReach(reach, minutes, byFoot);
    expect(reach?.lines).toEqual(names);
  };
  const names = [`Bus${NB}37`, `Tram${NB}4`, "U1"];

  it("ohne drittes Argument keine Linien", () => {
    const reach = transitReach(table([rowA], [away], [[20]]), origin());
    expectLines(reach?.({ geo: away }), wA + 20, false, undefined);
    expect(Object.keys(reach?.({ geo: away }) ?? {})).not.toContain("lines");
  });

  it("nimmt die Linien der Zeile mit der kleinsten Bewertung, bei Gleichstand die erste", () => {
    const t = table([rowA, rowB], [away], [[20], [10]]);
    const l = lines(names, [
      [2, 0],
      [1, 3],
    ]);
    expectLines(transitReach(t, origin(), l)?.({ geo: away }), wB + 10, false, [`Bus${NB}37`, "U1"]);
    const tie = table([rowA, rowA], [away], [[20], [20]]);
    expect(transitReach(tie, origin(), l)?.({ geo: away }).lines).toEqual([`Tram${NB}4`]);
  });

  it("Vorrang der Direktverbindung über Halte (Review 2, W1): 40 Min. direkt schlägt 35 Min. mit Umstieg", () => {
    // Summe A = wA + vA = 40 (direkt), Summe B = wB + vB = 35 (Umstieg) → bewertet 45 → A
    const vA = Math.round(40 - wA);
    const vB = Math.round(35 - wB);
    const l = lines(names, [
      [2, 0],
      [1, 3],
    ]);
    const reach = transitReach(table([rowA, rowB], [away], [[vA], [vB | T]]), origin(), l)?.({ geo: away });
    expectLines(reach, wA + vA, false, [`Tram${NB}4`]);
    // Mit 29 Min. bei B (bewertet 39 < 40) gewinnt der Umstieg, angezeigt die echte Zeit
    const vB2 = Math.round(29 - wB);
    const reach2 = transitReach(table([rowA, rowB], [away], [[vA], [vB2 | T]]), origin(), l)?.({ geo: away });
    expectLines(reach2, wB + vB2, false, [`Bus${NB}37`, "U1"]);
    expect(wB + vB2 + P).toBeLessThan(wA + vA);
  });

  it("Fußweg gegen Umstieg: zu Fuß 42 Min., Umstieg 35 Min. (bewertet 45) → zu Fuß, ohne Linien", () => {
    const place = north(start, (42 * 75) / 1.3);
    const v = Math.round(35 - wA);
    const reach = transitReach(table([rowA], [place], [[v | T]]), origin(), lines(names, [[1, 3]]));
    expectLines(reach?.({ geo: place }), walkMinutes(haversineMeters(start, place)), true, undefined);
    expect(walkMinutes(haversineMeters(start, place))).toBeCloseTo(42, 6);
  });

  it("keine Linien bei erster Linie 0, über 120 Min. und ohne Weg", () => {
    expect(
      transitReach(table([rowA], [away], [[20]]), origin(), lines(names, [[0, 0]]))?.({ geo: away }).lines,
    ).toBeUndefined();
    const far = north(start, 75 * 130);
    const over = transitReach(table([rowA], [far], [[120]]), origin(), lines(names, [[1, 0]]))?.({ geo: far });
    expect(over?.minutes).toBeGreaterThan(MAX_MINUTES);
    expect(over?.lines).toBeUndefined();
    const none = transitReach(table([rowA], [far], [[NO_MINUTES]]), origin(), lines(names, [[0, 0]]))?.({ geo: far });
    expect(none).toEqual({ kind: "oepnv", minutes: Infinity, byFoot: false });
  });

  it("zu Fuß ignoriert die Linien", () => {
    const close = north(start, 300);
    const reach = transitReach(table([rowA], [close], [[30]]), origin(), lines(names, [[2, 0]]));
    expectLines(reach?.({ geo: close }), walkMinutes(haversineMeters(start, close)), true, undefined);
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
  it("passen zu E5/E7 und Plan 0012", () => {
    expect(TRANSIT_TABLE_VERSION).toBe(2);
    expect(TRANSFER_PENALTY_MINUTES).toBe(10);
    expect(MAX_MINUTES).toBe(120);
    expect(NO_MINUTES).toBe(255);
  });
});
