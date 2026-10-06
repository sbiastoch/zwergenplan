import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type OriginApi, type RouteApi, useOrigin, useRoute } from "./use-app-state.ts";

const preloadProviderUi = vi.hoisted(() => vi.fn());
vi.mock("./ProviderPanel.tsx", () => ({ preloadProviderUi }));

const KEY = "zwergenplan.entfernung-ab";
const POINT_KEY = "zwergenplan.startpunkt";

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

  it("Kartenmitte als Startpunkt: gerundet gespeichert statt des Stadtteils, außerhalb Nürnbergs abgelehnt (Plan 0005, E8; Plan 0016)", () => {
    storage.data.set(KEY, "gostenhof");
    let accepted: boolean | undefined;
    const api = renderOrigin((a) => {
      accepted = a.setMapCenter({ lat: 49.45213, lon: 11.07672 });
    });
    expect(accepted).toBe(true);
    expect(api.origin).toEqual({ source: "karte", point: { lat: 49.452, lon: 11.077 }, label: "Kartenmitte" });
    expect([...storage.data]).toEqual([[POINT_KEY, '{"source":"karte","lat":49.452,"lon":11.077}']]);

    storage.data.clear();
    storage.data.set(KEY, "gostenhof");
    const outside = renderOrigin((a) => {
      accepted = a.setMapCenter({ lat: 48.137, lon: 11.575 });
    });
    expect(accepted).toBe(false);
    expect(outside.origin?.source).toBe("stadtteil");
    expect([...storage.data]).toEqual([[KEY, "gostenhof"]]);
  });
});

/** Geolocation, deren Antworten der Test selbst auslöst; `answer(i, …)` beantwortet die i-te Abfrage. */
function controlledGeolocation() {
  const pending: ((coords: { latitude: number; longitude: number }) => void)[] = [];
  const failures: ((error: { code: number }) => void)[] = [];
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (
        ok: (position: { coords: { latitude: number; longitude: number } }) => void,
        fail: (error: { code: number }) => void,
      ) => {
        pending.push((coords) => ok({ coords }));
        failures.push(fail);
      },
    },
  });
  return {
    answer: (i: number, latitude: number, longitude: number) => pending[i]?.({ latitude, longitude }),
    fail: (i: number, code: number) => failures[i]?.({ code }),
  };
}

/** `requestPosition(…).then(…)` in useOrigin zu Ende laufen lassen */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useOrigin: gespeicherter Startpunkt (Plan 0016)", () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stellt einen gespeicherten Standort bzw. eine gespeicherte Kartenmitte wieder her (erneut gerundet)", () => {
    storage.data.set(POINT_KEY, '{"source":"standort","lat":49.45213,"lon":11.07672}');
    expect(renderOrigin().origin).toEqual({
      source: "standort",
      point: { lat: 49.452, lon: 11.077 },
      label: "Mein Standort",
    });
    storage.data.set(POINT_KEY, '{"source":"karte","lat":49.46,"lon":11.08}');
    expect(renderOrigin().origin).toEqual({ source: "karte", point: { lat: 49.46, lon: 11.08 }, label: "Kartenmitte" });
  });

  it("ein gespeicherter Punkt geht vor; ist er ungültig, gilt der Stadtteil", () => {
    storage.data.set(KEY, "gostenhof");
    storage.data.set(POINT_KEY, '{"source":"standort","lat":49.452,"lon":11.077}');
    expect(renderOrigin().origin?.source).toBe("standort");
    for (const raw of ['{"source":"standort","lat":48.137,"lon":11.575}', "kaputt"]) {
      storage.data.set(POINT_KEY, raw);
      expect(renderOrigin().origin?.districtId).toBe("gostenhof");
    }
  });

  it("Stadtteil-Wahl löscht einen gespeicherten Punkt, eine unbekannte ID lässt alles stehen", () => {
    const stored = '{"source":"standort","lat":49.452,"lon":11.077}';
    storage.data.set(POINT_KEY, stored);
    renderOrigin((a) => a.setDistrict("gibt-es-nicht"));
    expect([...storage.data]).toEqual([[POINT_KEY, stored]]);
    renderOrigin((a) => a.setDistrict("gostenhof"));
    expect([...storage.data]).toEqual([[KEY, "gostenhof"]]);
  });

  it("„Startpunkt entfernen“ löscht Punkt und Stadtteil", () => {
    storage.data.set(KEY, "gostenhof");
    storage.data.set(POINT_KEY, '{"source":"karte","lat":49.46,"lon":11.08}');
    expect(renderOrigin((a) => a.clear()).origin).toBeUndefined();
    expect(storage.data.size).toBe(0);
  });

  it("speichert einen gefundenen Standort gerundet und löscht den Stadtteil", async () => {
    storage.data.set(KEY, "gostenhof");
    const geo = controlledGeolocation();
    renderOrigin((a) => a.locateMe());
    geo.answer(0, 49.45213, 11.07672);
    await settle();
    expect([...storage.data]).toEqual([[POINT_KEY, '{"source":"standort","lat":49.452,"lon":11.077}']]);
  });

  it("ein Fehlschlag ändert am Gespeicherten nichts", async () => {
    storage.data.set(KEY, "gostenhof");
    const geo = controlledGeolocation();
    renderOrigin((a) => a.locateMe());
    geo.fail(0, 1);
    await settle();
    expect([...storage.data]).toEqual([[KEY, "gostenhof"]]);
  });

  it.each([
    ["Stadtteil", (a: OriginApi) => a.setDistrict("gostenhof"), [[KEY, "gostenhof"]]],
    [
      "Kartenmitte",
      (a: OriginApi) => a.setMapCenter({ lat: 49.46, lon: 11.08 }),
      [[POINT_KEY, '{"source":"karte","lat":49.46,"lon":11.08}']],
    ],
    ["Entfernen", (a: OriginApi) => a.clear(), []],
  ])("eine späte Standort-Antwort nach „%s“ wird nicht gespeichert", async (_name, then, expected) => {
    const geo = controlledGeolocation();
    renderOrigin((a) => {
      a.locateMe();
      then(a);
    });
    geo.answer(0, 49.45213, 11.07672);
    await settle();
    expect([...storage.data]).toEqual(expected);
  });

  it("von zwei Abfragen speichert nur die neueste", async () => {
    const geo = controlledGeolocation();
    renderOrigin((a) => {
      a.locateMe();
      a.locateMe();
    });
    geo.answer(0, 49.45213, 11.07672);
    await settle();
    expect(storage.data.size).toBe(0);
    geo.answer(1, 49.46, 11.08);
    await settle();
    expect([...storage.data]).toEqual([[POINT_KEY, '{"source":"standort","lat":49.46,"lon":11.08}']]);
  });
});

/** window mit Location und History, gerade so viel, wie `useRoute` anfasst (kein DOM in Unit-Tests) */
function fakeWindow(search: string, state: unknown = null) {
  const history = {
    state,
    pushState: vi.fn((next: unknown) => {
      history.state = next;
    }),
    replaceState: vi.fn((next: unknown) => {
      history.state = next;
    }),
    back: vi.fn(),
  };
  return {
    location: { pathname: "/", search },
    history,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function renderRoute(): RouteApi {
  let result: RouteApi | undefined;
  function Probe() {
    result = useRoute();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!result) throw new Error("Hook nicht gerendert");
  return result;
}

describe("useRoute: Anbieter-Sheet (Plan 0010, E3)", () => {
  const offerId = "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus";

  afterEach(() => {
    vi.unstubAllGlobals();
    preloadProviderUi.mockClear();
  });

  it("openProvider pusht einen eigenen Eintrag und schließt das Detail", () => {
    const win = fakeWindow(`?ansicht=kalender&angebot=${offerId}`);
    vi.stubGlobal("window", win);
    renderRoute().openProvider("theater-beispiel");
    expect(win.history.pushState).toHaveBeenCalledWith(
      { zpProvider: true },
      "",
      "/?ansicht=kalender&anbieter=theater-beispiel",
    );
  });

  it("openDetail aus dem offenen Sheet behält anbieter", () => {
    const win = fakeWindow("?anbieter=theater-beispiel");
    vi.stubGlobal("window", win);
    renderRoute().openDetail(offerId);
    expect(win.history.pushState).toHaveBeenCalledWith(
      { zpDetail: true },
      "",
      `/?anbieter=theater-beispiel&angebot=${offerId}`,
    );
  });

  it("closeProvider geht zurück, wenn der Eintrag von openProvider kommt", () => {
    const win = fakeWindow("?ansicht=anbieter");
    vi.stubGlobal("window", win);
    const api = renderRoute();
    api.openProvider("theater-beispiel");
    api.closeProvider();
    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it("closeProvider ersetzt den Eintrag nach einem Deep-Link", () => {
    const win = fakeWindow("?ansicht=kalender&anbieter=theater-beispiel");
    vi.stubGlobal("window", win);
    renderRoute().closeProvider();
    expect(win.history.back).not.toHaveBeenCalled();
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/?ansicht=kalender");
  });

  it("lädt beim Start mit anbieter= oder ansicht=anbieter Chunk und Katalog vor, genau einmal", () => {
    for (const search of ["?anbieter=theater-beispiel", "?ansicht=anbieter", "?ansicht=anbieter&anbieter=x-y"]) {
      vi.stubGlobal("window", fakeWindow(search));
      renderRoute();
      expect(preloadProviderUi, search).toHaveBeenCalledTimes(1);
      preloadProviderUi.mockClear();
    }
    for (const search of ["", "?ansicht=kalender", "?anbieter=../x"]) {
      vi.stubGlobal("window", fakeWindow(search));
      renderRoute();
      expect(preloadProviderUi, search).not.toHaveBeenCalled();
    }
  });
});
