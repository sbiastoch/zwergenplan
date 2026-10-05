import { describe, expect, it } from "vitest";
import { NO_MINUTES } from "../../src/domain/transit.ts";
import {
  type Combo,
  cellLines,
  cmp,
  comboOf,
  encodeLines,
  LINES_FIT_MIN_MINUTES,
  LINES_FIT_SHARE,
  lineLabel,
} from "./lines.ts";

const NB = "\u00a0";

describe("lineLabel (L1)", () => {
  it("nennt Tram und Bus mit Art, U-Bahn und Bahn nur mit Namen", () => {
    expect(lineLabel("4", "tram")).toBe(`Tram${NB}4`);
    expect(lineLabel("D", "tram")).toBe(`Tram${NB}D`);
    expect(lineLabel("36", "bus")).toBe(`Bus${NB}36`);
    expect(lineLabel("202E", "bus")).toBe(`Bus${NB}202E`);
    expect(lineLabel("U1", "u-bahn")).toBe("U1");
    expect(lineLabel("S2", "bahn")).toBe("S2");
  });

  it("ersetzt Leerzeichen im Namen durch U+00A0, damit nichts mitten im Namen umbricht", () => {
    expect(lineLabel("RB 11", "bahn")).toBe(`RB${NB}11`);
    expect(lineLabel("N 7", "bus")).toBe(`Bus${NB}N${NB}7`);
  });
});

describe("cmp", () => {
  it("vergleicht Code-Units, unabhängig von der Locale", () => {
    expect(["U1", "Bus 36", "S2", "Tram 4", "Bus 202E"].sort(cmp)).toEqual([
      "Bus 202E",
      "Bus 36",
      "S2",
      "Tram 4",
      "U1",
    ]);
    expect(cmp("a", "a")).toBe(0);
    expect(cmp("Z", "a")).toBe(-1);
  });
});

describe("comboOf (L3)", () => {
  it("fasst gleiche Namen hintereinander zusammen, die Zahl der Fahrten bleibt", () => {
    expect(comboOf(["U1", "U1"])).toEqual({ names: ["U1"], legs: 2, key: "U1\u00002" });
    expect(comboOf(["U1"])).toEqual({ names: ["U1"], legs: 1, key: "U1\u00001" });
    expect(comboOf([`Bus${NB}37`, "U1"])).toEqual({
      names: [`Bus${NB}37`, "U1"],
      legs: 2,
      key: `Bus${NB}37\u0000U1\u00002`,
    });
    expect(comboOf([])).toEqual({ names: [], legs: 0, key: "\u00000" });
  });
});

describe("cellLines (L2, L8)", () => {
  // Folge 0: leer (zu Fuß vom Halt), 1: „Tram 1“, 2: „Bus 2“, 3: „Tram 1 → Bus 2“, 4: „U1 → U1“ (zusammengefasst)
  const combos: Combo[] = [
    comboOf([]),
    comboOf([`Tram${NB}1`]),
    comboOf([`Bus${NB}2`]),
    comboOf([`Tram${NB}1`, `Bus${NB}2`]),
    comboOf(["U1", "U1"]),
  ];
  /** Minuten aus Teilen [Anzahl, Folge, x] */
  const minutes = (...parts: [n: number, combo: number, x: number][]) => ({
    combo: parts.flatMap(([n, c]) => Array<number>(n).fill(c)),
    x: parts.flatMap(([n, , x]) => Array<number>(n).fill(x)),
  });

  it("nimmt die häufigste Folge", () => {
    expect(cellLines(20, minutes([70, 1, 20], [50, 3, 20]), combos)).toMatchObject({ combo: 1, transfer: false });
    expect(cellLines(20, minutes([50, 1, 20], [70, 3, 20]), combos)).toMatchObject({ combo: 3, transfer: true });
  });

  it("bei Gleichstand weniger Linien, dann kleinerer Median, dann der Text", () => {
    expect(cellLines(20, minutes([60, 3, 20], [60, 2, 20]), combos).combo).toBe(2);
    expect(cellLines(20, minutes([60, 1, 21], [60, 2, 20]), combos).combo).toBe(2);
    expect(cellLines(20, minutes([60, 2, 20], [60, 1, 20]), combos).combo).toBe(2); // „Bus 2“ < „Tram 1“
  });

  it("zählt nur Minuten mit endlicher Zeit", () => {
    const m = minutes([50, 1, 20], [70, 2, Number.POSITIVE_INFINITY]);
    expect(cellLines(20, m, combos).combo).toBe(1);
  });

  it("gibt keine Linien bei Wert 255 und bei leerer Folge (zu Fuß vom Halt), dann auch kein Bit", () => {
    expect(cellLines(NO_MINUTES, minutes([120, 3, 20]), combos)).toEqual({
      combo: -1,
      transfer: false,
      outlier: false,
    });
    expect(cellLines(20, minutes([80, 0, 20], [40, 1, 20]), combos)).toEqual({
      combo: -1,
      transfer: false,
      outlier: false,
    });
  });

  it("setzt das Umstiegs-Bit auch bei zusammengefasstem Namen (Review 2, H3)", () => {
    expect(cellLines(20, minutes([120, 4, 20]), combos)).toEqual({ combo: 4, transfer: true, outlier: false });
  });

  it("prüft die Passung: im 3-Min.-Bereich genau auf der Grenze Linien, knapp darüber keine", () => {
    expect(LINES_FIT_MIN_MINUTES).toBe(3);
    // Wert 10, max(3, 2,5) = 3; Median der Folge 13 → d = 3
    expect(cellLines(10, minutes([70, 1, 13], [50, 2, 5]), combos)).toMatchObject({ combo: 1, outlier: false });
    expect(cellLines(10, minutes([70, 1, 13.01], [50, 2, 5]), combos)).toEqual({
      combo: -1,
      transfer: false,
      outlier: true,
    });
  });

  it("prüft die Passung: im 25-%-Bereich genau auf der Grenze Linien, knapp darüber keine", () => {
    expect(LINES_FIT_SHARE).toBe(0.25);
    // Wert 40, max(3, 10) = 10; Median der Folge 30 → d = 10
    expect(cellLines(40, minutes([70, 3, 30], [50, 2, 60]), combos)).toMatchObject({ combo: 3, outlier: false });
    expect(cellLines(40, minutes([70, 3, 29.99], [50, 2, 60]), combos)).toEqual({
      combo: -1,
      transfer: true,
      outlier: true,
    });
  });
});

describe("encodeLines", () => {
  const combos: Combo[] = [comboOf([]), comboOf([`Tram${NB}1`]), comboOf([`Tram${NB}1`, `Bus${NB}202E`])];

  it("sortiert die Namen und schreibt zwei Ebenen, 0 = keine", () => {
    const { lines, first, second } = encodeLines([1, -1, 2, 2], combos);
    expect(lines).toEqual([`Bus${NB}202E`, `Tram${NB}1`]);
    expect([...first]).toEqual([2, 0, 2, 2]);
    expect([...second]).toEqual([0, 0, 1, 1]);
  });

  it("wirft bei mehr als 254 Namen", () => {
    const many = Array.from({ length: 255 }, (_, i) => comboOf([`Bus${NB}${i}`]));
    expect(() =>
      encodeLines(
        many.map((_, i) => i),
        many,
      ),
    ).toThrow("Linien-Datei: 255 Linien, höchstens 254");
  });
});
