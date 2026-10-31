import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_FLAG } from "../../e2e/onboarding-flag.ts";
import {
  loadOnboardingDone,
  loadOriginDistrict,
  loadOriginPoint,
  loadSavedProviders,
  loadTentative,
  saveOnboardingDone,
  saveOrigin,
  saveSavedProviders,
  saveTentative,
  storageUsable,
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

describe("gemerkte Anbieter: nur die Form (Plan 0025, E1)", () => {
  const PROVIDERS_KEY = "zwergenplan.anbieter-merkliste";
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("kaputtes JSON und kein Array ergeben eine leere Liste", () => {
    storage.data.set(PROVIDERS_KEY, "{kaputt");
    expect(loadSavedProviders()).toEqual([]);
    storage.data.set(PROVIDERS_KEY, JSON.stringify({ id: "a-anbieter" }));
    expect(loadSavedProviders()).toEqual([]);
  });

  it("Einträge, die keine Strings sind, fallen weg", () => {
    storage.data.set(PROVIDERS_KEY, JSON.stringify(["a-anbieter", 3, { id: "b-anbieter" }, null, "Ungeprüft"]));
    expect(loadSavedProviders()).toEqual(["a-anbieter", "Ungeprüft"]);
  });

  it("hin und zurück dieselbe Liste, eine leere Liste entfernt den Schlüssel", () => {
    saveSavedProviders(["b-anbieter", "a-anbieter"]);
    expect(loadSavedProviders()).toEqual(["b-anbieter", "a-anbieter"]);
    saveSavedProviders([]);
    expect(storage.data.has(PROVIDERS_KEY)).toBe(false);
  });
});

describe("vorgemerkte Angebote: nur die Form (Plan 0057, E1)", () => {
  const TENTATIVE_KEY = "zwergenplan.merkliste-vorgemerkt";
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ohne Speicher, mit kaputtem JSON und falschem Typ eine leere Liste", () => {
    expect(loadTentative()).toEqual([]);
    storage.data.set(TENTATIVE_KEY, "{kaputt");
    expect(loadTentative()).toEqual([]);
    storage.data.set(TENTATIVE_KEY, JSON.stringify({ a: 1 }));
    expect(loadTentative()).toEqual([]);
    storage.data.set(TENTATIVE_KEY, JSON.stringify(["a", 3, null, "b"]));
    expect(loadTentative()).toEqual(["a", "b"]);
  });

  it("ohne nutzbaren Speicher (privater Modus) eine leere Liste, Schreiben wirft nicht", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("gesperrt");
      },
      setItem: () => {
        throw new Error("gesperrt");
      },
    });
    expect(loadTentative()).toEqual([]);
    expect(() => saveTentative(["a"])).not.toThrow();
  });

  it("hin und zurück dieselbe Liste, eine leere Liste entfernt den Schlüssel", () => {
    saveTentative(["b", "a"]);
    expect(loadTentative()).toEqual(["b", "a"]);
    saveTentative([]);
    expect(storage.data.has(TENTATIVE_KEY)).toBe(false);
  });
});

describe("Onboarding-Flag (Plan 0033, E2; Plan 0035, E4)", () => {
  const FLAG = ONBOARDING_FLAG.key;
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("speichert genau den Wert aus e2e/onboarding-flag.ts (E2E und Screenshots nutzen ihn)", () => {
    expect(loadOnboardingDone()).toBe(false);
    saveOnboardingDone();
    expect([...storage.data]).toEqual([[ONBOARDING_FLAG.key, ONBOARDING_FLAG.value]]);
    expect(loadOnboardingDone()).toBe(true);
  });

  it("erledigt nur bei Version „2“: „1“ (still gesetzt seit ecfccfb), „3“ und leer zählen nicht", () => {
    storage.data.set(FLAG, "2");
    expect(loadOnboardingDone()).toBe(true);
    for (const value of ["1", "3", ""]) {
      storage.data.set(FLAG, value);
      expect(loadOnboardingDone(), value).toBe(false);
    }
  });

  it("Speicher nutzbar: Probe hinterlässt nichts", () => {
    expect(storageUsable()).toBe(true);
    expect(storage.data.size).toBe(0);
  });

  it("Speicher wirft: nicht erledigt, nicht nutzbar", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("gesperrt", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("gesperrt", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("gesperrt", "SecurityError");
      },
    });
    expect(loadOnboardingDone()).toBe(false);
    expect(storageUsable()).toBe(false);
    expect(() => saveOnboardingDone()).not.toThrow();
  });

  it("Speicher liest, schreibt aber nicht (Kontingent voll): nicht nutzbar", () => {
    vi.stubGlobal("localStorage", {
      ...storage,
      setItem: () => {
        throw new DOMException("voll", "QuotaExceededError");
      },
    });
    expect(storageUsable()).toBe(false);
  });
});
