import { afterEach, describe, expect, it, vi } from "vitest";
import { vibrate } from "./haptics.ts";

describe("vibrate (Plan 0057, E2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ruft die API mit der Dauer", () => {
    const api = { vibrate: vi.fn(() => true) };
    vibrate(25, api);
    expect(api.vibrate).toHaveBeenCalledWith(25);
  });

  it("ohne API passiert nichts (iOS, Desktop)", () => {
    expect(() => vibrate(8, undefined)).not.toThrow();
    vi.stubGlobal("navigator", {});
    expect(() => vibrate(8)).not.toThrow();
  });

  it("nutzt ohne Angabe navigator.vibrate", () => {
    const api = { vibrate: vi.fn(() => true) };
    vi.stubGlobal("navigator", api);
    vibrate(8);
    expect(api.vibrate).toHaveBeenCalledWith(8);
  });

  it("schluckt einen Fehler der API", () => {
    const api = {
      vibrate: () => {
        throw new Error("nicht erlaubt");
      },
    };
    expect(() => vibrate(8, api)).not.toThrow();
  });
});
