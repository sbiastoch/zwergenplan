import { describe, expect, it } from "vitest";
import type { Origin } from "../domain/reach.ts";
import { initialOriginState, type OriginState, originReducer } from "./origin-state.ts";

const GOSTENHOF: Origin = {
  source: "stadtteil",
  point: { lat: 49.448, lon: 11.058 },
  label: "Gostenhof",
  districtId: "gostenhof",
};
const HERE = { lat: 49.452, lon: 11.077 };
const MINE: Origin = { source: "standort", point: HERE, label: "Mein Standort" };

const run = (state: OriginState, ...actions: Parameters<typeof originReducer>[1][]) =>
  actions.reduce(originReducer, state);

describe("originReducer (Plan 0004, E3)", () => {
  it("startet mit dem übergebenen Startpunkt, ohne Abfrage und ohne Fehler", () => {
    expect(initialOriginState(GOSTENHOF)).toEqual({ origin: GOSTENHOF, locating: false });
    expect(initialOriginState(undefined)).toEqual({ origin: undefined, locating: false });
  });

  it("setzt den Standort, wenn die Antwort zur laufenden Abfrage gehört", () => {
    const state = run(
      initialOriginState(GOSTENHOF),
      { type: "locate", request: 1 },
      { type: "located", request: 1, result: { ok: true, point: HERE } },
    );
    expect(state).toEqual({ origin: MINE, locating: false });
  });

  it("leert beim Start einer Abfrage den alten Fehler (die Live-Region sagt ihn neu an)", () => {
    const failed = run(
      initialOriginState(undefined),
      { type: "locate", request: 1 },
      { type: "located", request: 1, result: { ok: false, reason: "denied" } },
    );
    expect(failed).toEqual({ origin: undefined, locating: false, problem: "denied" });
    const again = originReducer(failed, { type: "locate", request: 2 });
    expect(again).toEqual({ origin: undefined, locating: true, pending: 2 });
  });

  it("ein Fehler lässt den bisherigen Startpunkt stehen", () => {
    const state = run(
      initialOriginState(GOSTENHOF),
      { type: "locate", request: 1 },
      { type: "located", request: 1, result: { ok: false, reason: "timeout" } },
    );
    expect(state).toEqual({ origin: GOSTENHOF, locating: false, problem: "timeout" });
  });

  it("eine späte Standort-Antwort überschreibt keinen danach gewählten Stadtteil", () => {
    const state = run(
      initialOriginState(undefined),
      { type: "locate", request: 1 },
      { type: "district", origin: GOSTENHOF },
      { type: "located", request: 1, result: { ok: true, point: HERE } },
    );
    expect(state).toEqual({ origin: GOSTENHOF, locating: false });
  });

  it("eine späte Antwort (auch ein Fehler) wirkt nach „Startpunkt entfernen“ nicht mehr", () => {
    for (const result of [{ ok: true, point: HERE } as const, { ok: false, reason: "denied" } as const]) {
      const state = run(
        initialOriginState(GOSTENHOF),
        { type: "locate", request: 1 },
        { type: "clear" },
        { type: "located", request: 1, result },
      );
      expect(state).toEqual({ origin: undefined, locating: false });
    }
  });

  it("nur die neueste von zwei Abfragen zählt", () => {
    const state = run(
      initialOriginState(undefined),
      { type: "locate", request: 1 },
      { type: "locate", request: 2 },
      { type: "located", request: 1, result: { ok: false, reason: "unavailable" } },
    );
    expect(state).toEqual({ origin: undefined, locating: true, pending: 2 });
    expect(originReducer(state, { type: "located", request: 2, result: { ok: true, point: HERE } })).toEqual({
      origin: MINE,
      locating: false,
    });
  });

  it("Stadtteil und Entfernen löschen einen alten Fehler", () => {
    const failed: OriginState = { origin: undefined, locating: false, problem: "outside" };
    expect(originReducer(failed, { type: "district", origin: GOSTENHOF })).toEqual({
      origin: GOSTENHOF,
      locating: false,
    });
    expect(originReducer(failed, { type: "clear" })).toEqual({ origin: undefined, locating: false });
  });
});
