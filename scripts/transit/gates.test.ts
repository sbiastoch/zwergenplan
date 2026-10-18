import { describe, expect, it } from "vitest";
import { DISTRICTS_BY_REGION } from "../../src/domain/districts.ts";
import { accessIssues, TRANSIT_WARN_SECONDS, transitGates } from "./gates.ts";

const base = { places: 5, seconds: 1, real: true } as const;

describe("transitGates (Plan 0039, E5, Review B1)", () => {
  it("Netz ohne Orte: Warnung statt Rot, auch wenn keine Zelle Linien hat", () => {
    const r = transitGates({ ...base, network: "vrr", places: 0, stats: { cells: 0, withoutLines: 0 } });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(["Netz vrr ohne Orte – Linien-Gates übersprungen"]);
  });

  it("Netz mit Orten und lauter Zellen ohne Linie bleibt rot, auch im Fixture-Build", () => {
    for (const real of [true, false]) {
      const r = transitGates({ ...base, real, network: "vgn", stats: { cells: 40, withoutLines: 40 } });
      expect(r.errors).toEqual(["Netz vgn: keine Zelle hat Linien (Plan 0012, E7)"]);
    }
  });

  it("Netz mit Orten, aber ohne Zelle mit Wegzeit, bleibt rot", () => {
    const r = transitGates({ ...base, network: "vgn", stats: { cells: 0, withoutLines: 0 } });
    expect(r.errors).toEqual(["Netz vgn: keine Zelle hat Linien (Plan 0012, E7)"]);
  });

  it("Anteil ohne Linien über der Schwelle ist nur im echten Build rot", () => {
    const stats = { cells: 1000, withoutLines: 95 };
    expect(transitGates({ ...base, network: "vgn", stats }).errors).toEqual([
      "Netz vgn: 9,5 % der Zellen ohne Linien, erlaubt 9,3 % (Plan 0012, E7)",
    ]);
    expect(transitGates({ ...base, real: false, network: "vgn", stats }).errors).toEqual([]);
  });

  it("Anteil an der Schwelle ist grün", () => {
    const stats = { cells: 1000, withoutLines: 93 };
    expect(transitGates({ ...base, network: "vgn", stats })).toEqual({ errors: [], warnings: [] });
  });

  it("warnt je Netz bei langer Rechenzeit", () => {
    const r = transitGates({
      ...base,
      network: "vrr",
      seconds: TRANSIT_WARN_SECONDS + 0.5,
      stats: { cells: 10, withoutLines: 0 },
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/^Netz vrr: Wegzeit-Berechnung dauerte 20,5 s \(> 20 s\)/);
  });
});

describe("accessIssues (Plan 0039, E5)", () => {
  it("prüft nur die Stadtteile der Regionen des Netzes", () => {
    // ein Halt am Rathaus Düsseldorf, keiner in Nürnberg oder Fürth
    const table = { lat: Float64Array.of(51.226), lon: Float64Array.of(6.773) };
    const missing = accessIssues(table, "vrr");
    const all = DISTRICTS_BY_REGION.duesseldorf.map((d) => d.name);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThan(all.length);
    expect(missing.every((name) => all.includes(name))).toBe(true);
  });

  it("ohne dekodierte Tabelle fehlen alle Stadtteile des Netzes", () => {
    const expected = [...DISTRICTS_BY_REGION.fuerth, ...DISTRICTS_BY_REGION.nuernberg].map((d) => d.name);
    expect(accessIssues(undefined, "vgn")).toEqual(expected);
  });
});
