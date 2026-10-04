import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadOriginDistrict, saveOriginDistrict } from "./preferences.ts";

const KEY = "zwergenplan.entfernung-ab";

/** localStorage gibt es in Node nicht; ein Map-Stub reicht für die Schlüssel-Logik. */
function fakeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("Startpunkt-Stadtteil", () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("speichert nur die ID unter zwergenplan.entfernung-ab", () => {
    saveOriginDistrict("gostenhof");
    expect([...storage.data]).toEqual([[KEY, "gostenhof"]]);
    expect(loadOriginDistrict()).toBe("gostenhof");
  });

  it("löscht den Eintrag ohne ID", () => {
    saveOriginDistrict("gostenhof");
    saveOriginDistrict(undefined);
    expect(storage.data.size).toBe(0);
    expect(loadOriginDistrict()).toBeUndefined();
  });

  it("liefert den rohen Wert, ein leerer zählt als „kein Startpunkt“ (die ID prüft useOrigin)", () => {
    storage.data.set(KEY, "unbekannt");
    expect(loadOriginDistrict()).toBe("unbekannt");
    storage.data.set(KEY, "");
    expect(loadOriginDistrict()).toBeUndefined();
  });

  it("übersteht einen gesperrten Speicher (privater Modus)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(loadOriginDistrict()).toBeUndefined();
    expect(() => saveOriginDistrict("gostenhof")).not.toThrow();
  });
});
