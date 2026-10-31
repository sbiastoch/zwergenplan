import { describe, expect, it } from "vitest";
import { REVEAL_LIMIT, REVEAL_TARGET, revealOffset } from "./reveal.ts";

describe("revealOffset (Plan 0059, E5)", () => {
  const height = 800;

  it("bewegt nichts, solange der Punkt über dem Sheet liegt", () => {
    expect(revealOffset(0, height)).toBeUndefined();
    expect(revealOffset(height * REVEAL_LIMIT, height)).toBeUndefined();
  });

  it("schiebt einen verdeckten Punkt auf 25 % der Höhe", () => {
    // `easeTo({ center: punkt, offset })` stellt den Punkt auf Mitte + Versatz: 25 % liegt 200 px über der Mitte
    expect(revealOffset(600, height)).toEqual([0, height * REVEAL_TARGET - height / 2]);
    expect(REVEAL_TARGET).toBe(0.25);
  });

  it("gilt auch für Punkte unter dem Rand der Karte", () => {
    expect(revealOffset(height + 40, height)).toEqual([0, -200]);
  });

  it("ohne Höhe keine Bewegung", () => {
    expect(revealOffset(10, 0)).toBeUndefined();
  });
});
