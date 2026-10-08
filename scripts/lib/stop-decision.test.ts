import { describe, expect, it } from "vitest";
import { decide, FRESH_MS, isFresh, nextStamp, parseStamp, type Stamp } from "./stop-decision.ts";

describe("parseStamp", () => {
  it("liest einen gültigen Stempel", () => {
    expect(parseStamp('{"tier":"C","at":1,"cAt":1}')).toEqual({ tier: "C", at: 1, cAt: 1 });
  });

  it.each([
    undefined,
    "",
    "kaputt",
    "null",
    "[]",
    '{"tier":"V","at":1,"cAt":1}',
    '{"tier":"0","at":"1","cAt":1}',
    '{"hash":"x"}',
  ])("%s ist kein Stempel", (raw) => {
    expect(parseStamp(raw)).toBeUndefined();
  });
});

const H = 60 * 60 * 1000;
const T0 = Date.parse("2026-10-08T08:00:00+02:00");
const c = (at: number): Stamp => ({ tier: "C", at, cAt: at });

describe("isFresh: Frische nach cAt, nicht nach at (Plan 0027, E5.2, Review 2 M-B)", () => {
  it("gilt bis knapp unter 12 h nach dem letzten Lauf der Stufe C", () => {
    expect(FRESH_MS).toBe(12 * H);
    expect(isFresh(c(T0), T0 + 12 * H - 1)).toBe(true);
    expect(isFresh(c(T0), T0 + 12 * H)).toBe(false);
  });

  it("ein junger Doku-Stempel mit altem cAt ist nicht frisch", () => {
    expect(isFresh({ tier: "0", at: T0 + 11 * H, cAt: T0 - 2 * H }, T0 + 11 * H)).toBe(false);
  });

  it("ein Stempel aus der Zukunft (Uhr verstellt) ist nicht frisch", () => {
    expect(isFresh(c(T0 + H), T0)).toBe(false);
  });
});

describe("decide", () => {
  it("frischer Stempel für den aktuellen Baum → durchlassen, keine Prüfung", () => {
    expect(decide({ now: T0 + H, stamp: c(T0) })).toEqual({ action: "pass" });
  });

  it("Stempel 13 h alt, keine Basis → Stufe C für den ganzen Baum", () => {
    expect(decide({ now: T0 + 13 * H, stamp: c(T0) })).toEqual({ action: "check" });
  });

  it("gültige Basis → Prüfung relativ zur Basis", () => {
    expect(decide({ now: T0 + H, base: { tree: "abc", stamp: c(T0), exists: true } })).toEqual({
      action: "check",
      base: "abc",
    });
  });

  it("Basis 13 h alt oder Tree-Objekt fehlt → keine Basis", () => {
    expect(decide({ now: T0 + 13 * H, base: { tree: "abc", stamp: c(T0), exists: true } })).toEqual({
      action: "check",
    });
    expect(decide({ now: T0 + H, base: { tree: "abc", stamp: c(T0), exists: false } })).toEqual({ action: "check" });
  });
});

describe("nextStamp", () => {
  it("Stufe C setzt cAt auf jetzt", () => {
    expect(nextStamp("C", T0)).toEqual(c(T0));
  });

  it("Stufe 0 erbt cAt der Basis", () => {
    expect(nextStamp("0", T0 + 4 * H, c(T0))).toEqual({ tier: "0", at: T0 + 4 * H, cAt: T0 });
  });

  it("Stufe 0 ohne Basis-Stempel stempelt nicht", () => {
    expect(nextStamp("0", T0)).toBeUndefined();
  });

  it("Doku-Kette über mehr als 12 h führt zu Stufe C (Review 2, M-B)", () => {
    // C-Lauf um 0 h, dann Doku-Turns um 4 h und 8 h, jeder auf dem Stempel des vorigen
    const s0 = nextStamp("C", T0);
    const s4 = nextStamp("0", T0 + 4 * H, s0);
    const s8 = nextStamp("0", T0 + 8 * H, s4);
    expect(decide({ now: T0 + 9 * H, base: { tree: "t8", stamp: s8, exists: true } })).toEqual({
      action: "check",
      base: "t8",
    });
    // um 13 h ist die Basis nicht mehr frisch: kein weiterer Doku-Kurzschluss, sondern Stufe C
    expect(decide({ now: T0 + 13 * H, base: { tree: "t8", stamp: s8, exists: true } })).toEqual({ action: "check" });
  });
});
