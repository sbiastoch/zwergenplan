import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type OriginApi, useOrigin } from "./use-app-state.ts";

const KEY = "zwergenplan.entfernung-ab";

/** localStorage gibt es in Node nicht; ein Map-Stub reicht. */
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

/**
 * Rendert den Hook auf dem Server (kein DOM in Unit-Tests). `step` darf beim ersten Rendern eine
 * Aktion auslösen; React rendert dann sofort neu (Update in der Render-Phase), der letzte Stand zählt.
 */
function renderOrigin(step?: (api: OriginApi) => void): OriginApi {
  let result: OriginApi | undefined;
  let done = false;
  function Probe() {
    result = useOrigin();
    if (step && !done) {
      done = true;
      step(result);
    }
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!result) throw new Error("Hook nicht gerendert");
  return result;
}

describe("useOrigin (Plan 0004, E3)", () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("startet ohne gespeicherten Stadtteil ohne Startpunkt", () => {
    const api = renderOrigin();
    expect(api.origin).toBeUndefined();
    expect(api.locating).toBe(false);
    expect(api.problem).toBeUndefined();
  });

  it("stellt einen gespeicherten Stadtteil wieder her", () => {
    storage.data.set(KEY, "gostenhof");
    expect(renderOrigin().origin).toEqual({
      source: "stadtteil",
      point: { lat: 49.448, lon: 11.058 },
      label: "Gostenhof",
      districtId: "gostenhof",
    });
  });

  it("wertet unbekannte oder beschädigte gespeicherte IDs als „kein Startpunkt“", () => {
    for (const raw of ["unbekannt", "", "49.452,11.077", "Gostenhof"]) {
      storage.data.set(KEY, raw);
      expect(renderOrigin().origin).toBeUndefined();
    }
  });

  it("bietet den Standort nur im sicheren Kontext mit Geolocation-API an", () => {
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: () => undefined } });
    vi.stubGlobal("isSecureContext", true);
    expect(renderOrigin().canLocate).toBe(true);
    vi.stubGlobal("isSecureContext", false);
    expect(renderOrigin().canLocate).toBe(false);
  });

  it("speichert beim Stadtteil nur die ID und ignoriert unbekannte IDs", () => {
    const api = renderOrigin((a) => a.setDistrict("st-johannis"));
    expect(api.origin?.label).toBe("St. Johannis");
    expect([...storage.data]).toEqual([[KEY, "st-johannis"]]);
    expect(renderOrigin((a) => a.setDistrict("gibt-es-nicht")).origin?.districtId).toBe("st-johannis");
  });

  it("„Startpunkt entfernen“ löscht auch den gespeicherten Stadtteil", () => {
    storage.data.set(KEY, "gostenhof");
    const api = renderOrigin((a) => a.clear());
    expect(api.origin).toBeUndefined();
    expect(storage.data.size).toBe(0);
  });
});
