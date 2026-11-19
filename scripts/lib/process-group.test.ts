import { describe, expect, it } from "vitest";
import { alive, parseStat } from "./process-group.ts";

describe("process-group", () => {
  it("parseStat liest Zustand und Gruppe, auch mit Klammern und Leerzeichen im Namen", () => {
    expect(parseStat("123 (node) S 1 123 123 0 -1")).toEqual({ state: "S", pgrp: 123 });
    expect(parseStat("77 (a (b) c) Z 1 70 70 0 -1")).toEqual({ state: "Z", pgrp: 70 });
    expect(parseStat("kaputt")).toBeUndefined();
  });

  it("der eigene Prozess und seine Gruppe leben, eine freie PID nicht", () => {
    expect(alive(process.pid)).toBe(true);
    expect(alive(-process.pid) || alive(process.pid)).toBe(true);
    expect(alive(2 ** 22 + 7)).toBe(false);
  });
});
