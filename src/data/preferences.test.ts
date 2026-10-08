import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadOriginDistrict,
  loadOriginPoint,
  loadSavedProviders,
  saveOrigin,
  saveSavedProviders,
} from "./preferences.ts";

const KEY = "zwergenplan.entfernung-ab";
const POINT_KEY = "zwergenplan.startpunkt";

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
    saveOrigin("gostenhof");
    expect([...storage.data]).toEqual([[KEY, "gostenhof"]]);
    expect(loadOriginDistrict()).toBe("gostenhof");
  });

  it("löscht den Eintrag ohne ID", () => {
    saveOrigin("gostenhof");
    saveOrigin(undefined);
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
    expect(() => saveOrigin("gostenhof")).not.toThrow();
  });
});

describe("Startpunkt-Punkt (Plan 0016, E1)", () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("speichert Quelle und gerundeten Punkt als JSON unter zwergenplan.startpunkt", () => {
    saveOrigin({ source: "standort", lat: 49.452, lon: 11.077 });
    expect([...storage.data]).toEqual([[POINT_KEY, '{"source":"standort","lat":49.452,"lon":11.077}']]);
    expect(loadOriginPoint()).toEqual({ source: "standort", lat: 49.452, lon: 11.077 });
    saveOrigin({ source: "karte", lat: 49.46, lon: 11.08 });
    expect(loadOriginPoint()).toEqual({ source: "karte", lat: 49.46, lon: 11.08 });
  });

  it("speichert nie Stadtteil und Punkt zugleich (Plan 0016, E2)", () => {
    saveOrigin("gostenhof");
    saveOrigin({ source: "standort", lat: 49.452, lon: 11.077 });
    expect([...storage.data.keys()]).toEqual([POINT_KEY]);
    saveOrigin("gostenhof");
    expect([...storage.data]).toEqual([[KEY, "gostenhof"]]);
  });

  it("speichert keine zusätzlichen Felder", () => {
    const extra = { source: "standort" as const, lat: 49.452, lon: 11.077, label: "Mein Standort", raw: 49.45213 };
    saveOrigin(extra);
    expect(storage.data.get(POINT_KEY)).toBe('{"source":"standort","lat":49.452,"lon":11.077}');
  });

  it("löscht den Eintrag ohne Wert", () => {
    saveOrigin({ source: "karte", lat: 49.46, lon: 11.08 });
    saveOrigin(undefined);
    expect(storage.data.size).toBe(0);
    expect(loadOriginPoint()).toBeUndefined();
  });

  it("wertet beschädigte Einträge als „kein Punkt“ (Runden und Stadtgrenze prüft useOrigin)", () => {
    for (const raw of [
      "",
      "kein json",
      "null",
      "[49.452,11.077]",
      '"standort"',
      '{"source":"stadtteil","lat":49.452,"lon":11.077}',
      '{"source":"standort","lat":"49.452","lon":11.077}',
      '{"source":"standort","lat":null,"lon":11.077}',
      '{"source":"standort","lat":49.452}',
      "0",
      "true",
    ]) {
      storage.data.set(POINT_KEY, raw);
      expect(loadOriginPoint(), raw).toBeUndefined();
    }
  });

  it("übersteht einen gesperrten Speicher (privater Modus)", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail });
    expect(loadOriginPoint()).toBeUndefined();
    expect(() => saveOrigin({ source: "standort", lat: 49.452, lon: 11.077 })).not.toThrow();
    expect(() => saveOrigin(undefined)).not.toThrow();
  });
});

describe("Gemerkte Anbieter (Plan 0025, E1): nur die Form, ID-Regeln prüft cleanSavedProviders", () => {
  const PROVIDERS_KEY = "zwergenplan.anbieter-merkliste";
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("speichert ein JSON-Array aus id und name unter zwergenplan.anbieter-merkliste", () => {
    saveSavedProviders([{ id: "theater-beispiel", name: "Theater" }]);
    expect([...storage.data]).toEqual([[PROVIDERS_KEY, '[{"id":"theater-beispiel","name":"Theater"}]']]);
    expect(loadSavedProviders()).toEqual([{ id: "theater-beispiel", name: "Theater" }]);
  });

  it("kaputtes JSON, kein Eintrag und kein Array ergeben []", () => {
    expect(loadSavedProviders()).toEqual([]);
    for (const raw of ["[{", "kein json", '{"id":"a","name":"A"}', "null", "0", '"a"']) {
      storage.data.set(PROVIDERS_KEY, raw);
      expect(loadSavedProviders(), raw).toEqual([]);
    }
  });

  it("Einträge mit falschen Typen fallen weg, Zusatzfelder auch", () => {
    const raw = [
      { id: "a", name: "A", extra: 1 },
      { id: 2, name: "B" },
      { id: "c" },
      "d",
      null,
      { id: "e", name: "E" },
    ];
    storage.data.set(PROVIDERS_KEY, JSON.stringify(raw));
    expect(loadSavedProviders()).toEqual([
      { id: "a", name: "A" },
      { id: "e", name: "E" },
    ]);
  });

  it("speichert nur id und name; eine leere Liste entfernt den Schlüssel", () => {
    const withExtra = { id: "a", name: "A", secret: "x" };
    saveSavedProviders([withExtra]);
    expect(storage.data.get(PROVIDERS_KEY)).toBe('[{"id":"a","name":"A"}]');
    saveSavedProviders([]);
    expect(storage.data.has(PROVIDERS_KEY)).toBe(false);
  });

  it("übersteht einen gesperrten Speicher (privater Modus)", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail });
    expect(loadSavedProviders()).toEqual([]);
    expect(() => saveSavedProviders([{ id: "a", name: "A" }])).not.toThrow();
  });
});
