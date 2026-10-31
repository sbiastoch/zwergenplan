import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterFromSearch } from "../domain/filter.ts";
import { NO_TOAST, type ToastMessage } from "./Toast.tsx";
import {
  LONG_TOAST_MS,
  type OriginApi,
  type RouteApi,
  useOrigin,
  useRoute,
  useSaved,
  useSavedProviders,
  useToast,
} from "./use-app-state.ts";

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

/** publicId von theater-beispiel in den Fixtures (ADR 0022) */
const THEATER = "fv3fpfp2";

describe("useRoute: Anbieter-Sheet (Plan 0010, E3)", () => {
  const offerId = "lxizt974";

  afterEach(() => {
    vi.unstubAllGlobals();
    preloadProviderUi.mockClear();
  });

  it("openProvider pusht einen eigenen Eintrag und schließt das Detail", () => {
    const win = fakeWindow(`?ansicht=merkliste-kalender&angebot=${offerId}`);
    vi.stubGlobal("window", win);
    renderRoute().openProvider(THEATER);
    expect(win.history.pushState).toHaveBeenCalledWith(
      { zpProvider: true },
      "",
      `/?ansicht=merkliste-kalender&anbieter=${THEATER}`,
    );
  });

  it("openDetail aus dem offenen Sheet behält anbieter", () => {
    const win = fakeWindow(`?anbieter=${THEATER}`);
    vi.stubGlobal("window", win);
    renderRoute().openDetail(offerId);
    expect(win.history.pushState).toHaveBeenCalledWith(
      { zpDetail: true },
      "",
      `/?anbieter=${THEATER}&angebot=${offerId}`,
    );
  });

  it("closeProvider geht zurück, wenn der Eintrag von openProvider kommt", () => {
    const win = fakeWindow("?ansicht=anbieter");
    vi.stubGlobal("window", win);
    const api = renderRoute();
    api.openProvider(THEATER);
    api.closeProvider();
    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it("closeProvider ersetzt den Eintrag nach einem Deep-Link", () => {
    const win = fakeWindow(`?ansicht=merkliste-kalender&anbieter=${THEATER}`);
    vi.stubGlobal("window", win);
    renderRoute().closeProvider();
    expect(win.history.back).not.toHaveBeenCalled();
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/?ansicht=merkliste-kalender");
  });

  it("lädt beim Start mit anbieter= oder ansicht=anbieter Chunk und Katalog vor, genau einmal", () => {
    for (const search of [`?anbieter=${THEATER}`, "?ansicht=anbieter", "?ansicht=anbieter&anbieter=x-y"]) {
      vi.stubGlobal("window", fakeWindow(search));
      renderRoute();
      expect(preloadProviderUi, search).toHaveBeenCalledTimes(1);
      preloadProviderUi.mockClear();
    }
    // `?ansicht=kalender` ist eine Altlast (Plan 0025, E8): Sie landet in „Entdecken“ und lädt nichts vor.
    for (const search of ["", "?ansicht=kalender", "?ansicht=merkliste-kalender", "?anbieter=../x"]) {
      vi.stubGlobal("window", fakeWindow(search));
      renderRoute();
      expect(preloadProviderUi, search).not.toHaveBeenCalled();
    }
  });
});

describe("useRoute: große Karte (Plan 0059, E1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("openBig pusht einen eigenen Eintrag mit karte=gross hinter der Ansicht", () => {
    const win = fakeWindow("?ansicht=karte&sortierung=neu");
    vi.stubGlobal("window", win);
    renderRoute().openBig();
    expect(win.history.pushState).toHaveBeenCalledWith(
      { zpBig: true },
      "",
      "/?ansicht=karte&karte=gross&sortierung=neu",
    );
  });

  it("closeBig geht zurück, wenn der Eintrag von openBig kommt", () => {
    const win = fakeWindow("?ansicht=anbieter");
    vi.stubGlobal("window", win);
    const api = renderRoute();
    api.openBig();
    api.closeBig();
    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it("ein Wechsel der Ansicht per replace lässt karte=gross fallen, ein Filterwechsel nicht", () => {
    const win = fakeWindow("?ansicht=karte&karte=gross");
    vi.stubGlobal("window", win);
    const api = renderRoute();
    api.replace({ ...api.route, filter: filterFromSearch("?kat=musik") });
    expect(win.history.replaceState).toHaveBeenLastCalledWith(null, "", "/?kat=musik&ansicht=karte&karte=gross");
    api.replace({ ...api.route, tab: "anbieter" });
    expect(win.history.replaceState).toHaveBeenLastCalledWith(null, "", "/?ansicht=anbieter");
  });

  it("karte=gross ohne Ansicht mit Karte fällt beim Start aus der Adresse", () => {
    const win = fakeWindow("?ansicht=merkliste&karte=gross");
    vi.stubGlobal("window", win);
    expect(renderRoute().route.big).toBeUndefined();
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/?ansicht=merkliste");
  });

  it("closeBig ersetzt den Eintrag nach einem Deep-Link", () => {
    const win = fakeWindow("?ansicht=merkliste-karte&karte=gross");
    vi.stubGlobal("window", win);
    const api = renderRoute();
    expect(api.route.big).toBe(true);
    api.closeBig();
    expect(win.history.back).not.toHaveBeenCalled();
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/?ansicht=merkliste-karte");
  });
});

describe("useRoute: alter Tab „Kalender“ (Plan 0025, E8)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ersetzt ?ansicht=kalender beim Start einmal durch die kanonische URL, Filter und Sheet bleiben", () => {
    const win = fakeWindow(`?ansicht=kalender&kat=musik&anbieter=${THEATER}`, { zpProvider: true });
    vi.stubGlobal("window", win);
    const { route } = renderRoute();
    expect(route.tab).toBe("entdecken");
    expect(win.history.replaceState).toHaveBeenCalledTimes(1);
    expect(win.history.replaceState).toHaveBeenCalledWith({ zpProvider: true }, "", `/?kat=musik&anbieter=${THEATER}`);
  });

  it("lässt andere URLs unberührt", () => {
    for (const search of ["", "?ansicht=merkliste-kalender", "?kat=musik&ansicht=karte", "?ansicht=landkarte"]) {
      const win = fakeWindow(search);
      vi.stubGlobal("window", win);
      renderRoute();
      expect(win.history.replaceState, search).not.toHaveBeenCalled();
    }
  });
});

describe("useRoute: alte IDs aus alten Links (ADR 0022)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rechnet lange Angebots-ID und Katalog-ID um, mit genau einem replaceState", () => {
    const long = "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus";
    const win = fakeWindow(`?anbieter=theater-beispiel&angebot=${long}`);
    vi.stubGlobal("window", win);
    const { route } = renderRoute();
    expect(route.offerId).toBe("lxizt974");
    expect(route.providerId).toBe(THEATER);
    expect(win.history.replaceState).toHaveBeenCalledTimes(1);
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", `/?anbieter=${THEATER}&angebot=lxizt974`);
  });

  it("lässt Adressen mit Kurz-IDs unberührt", () => {
    const win = fakeWindow(`?anbieter=${THEATER}&angebot=lxizt974`);
    vi.stubGlobal("window", win);
    renderRoute();
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });
});

describe("useSaved und useSavedProviders: Umschreiben nach ADR 0022", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderSaved<T>(hook: () => T): T {
    let result: T | undefined;
    function Probe() {
      result = hook();
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    if (result === undefined) throw new Error("Hook nicht gerendert");
    return result;
  }

  it("schreibt alte Angebots-IDs einmal um, sonst nichts", () => {
    const storage = fakeStorage();
    const long = "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus";
    storage.setItem("zwergenplan.merkliste", JSON.stringify([long, "nle21y1x"]));
    const setItem = vi.spyOn(storage, "setItem");
    vi.stubGlobal("localStorage", storage);
    expect(renderSaved(useSaved).state.ids).toEqual(["lxizt974", "nle21y1x"]);
    expect(JSON.parse(storage.getItem("zwergenplan.merkliste") ?? "")).toEqual(["lxizt974", "nle21y1x"]);
    setItem.mockClear();
    renderSaved(useSaved);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("liest beide Schlüssel, bereinigt Vorgemerktes einmal, schreibt sonst nur bei Änderung (Plan 0057, E1)", () => {
    const storage = fakeStorage();
    const TENTATIVE = "zwergenplan.merkliste-vorgemerkt";
    storage.setItem("zwergenplan.merkliste", JSON.stringify(["a", "b"]));
    // „weg“ hat eine alte App-Version aus der Merkliste entfernt
    storage.setItem(TENTATIVE, JSON.stringify(["b", "weg"]));
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    vi.stubGlobal("localStorage", storage);
    const saved = renderSaved(useSaved);
    expect(saved.state).toEqual({ ids: ["a", "b"], tentative: ["b"] });
    expect(saved.stage("a")).toBe("fest");
    expect(saved.stage("b")).toBe("vorgemerkt");
    expect(JSON.parse(storage.getItem(TENTATIVE) ?? "")).toEqual(["b"]);
    expect(setItem.mock.calls.map(([key]) => key)).toEqual([TENTATIVE]);
    setItem.mockClear();
    const again = renderSaved(useSaved);
    expect(setItem).not.toHaveBeenCalled();
    // Tipp: b wird fest, die leere Vorgemerkt-Liste entfernt den Schlüssel; die Merkliste bleibt gleich
    expect(again.cycle("b")).toBe("fest");
    expect(storage.getItem(TENTATIVE)).toBeNull();
    expect(removeItem).toHaveBeenCalledWith(TENTATIVE);
    expect(setItem).not.toHaveBeenCalled();
    // direkt setzen (Halten, Rückgängig) und weiterschalten
    expect(again.setStage("c", "vorgemerkt")).toBe("vorgemerkt");
    expect(JSON.parse(storage.getItem("zwergenplan.merkliste") ?? "")).toEqual(["a", "b", "c"]);
    expect(JSON.parse(storage.getItem(TENTATIVE) ?? "")).toEqual(["c"]);
    expect(again.cycle("a")).toBe("aus");
    expect(JSON.parse(storage.getItem("zwergenplan.merkliste") ?? "")).toEqual(["b", "c"]);
  });

  it("schreibt Katalog-IDs gemerkter Anbieter einmal auf die publicId um, sonst nichts", () => {
    const storage = fakeStorage();
    storage.setItem("zwergenplan.anbieter-merkliste", JSON.stringify(["theater-beispiel", THEATER]));
    const setItem = vi.spyOn(storage, "setItem");
    vi.stubGlobal("localStorage", storage);
    expect(renderSaved(useSavedProviders)[0]).toEqual([THEATER]);
    expect(JSON.parse(storage.getItem("zwergenplan.anbieter-merkliste") ?? "")).toEqual([THEATER]);
    setItem.mockClear();
    renderSaved(useSavedProviders);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("useToast (Plan 0018, E4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Ruft `say` beim ersten Rendern; liefert die gezeigte Meldung und die Dauer ihres Timers. */
  function sayOnce(...args: Parameters<ReturnType<typeof useToast>[1]>) {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    let shown: ToastMessage = NO_TOAST;
    let done = false;
    function Probe() {
      const [message, say] = useToast();
      shown = message;
      if (!done) {
        done = true;
        say(...args);
      }
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    return { shown, delays: timeout.mock.calls.map((call) => call[1]) };
  }

  it("zeigt eine Meldung standardmäßig 2,8 s", () => {
    expect(sayOnce("Gemerkt – liegt jetzt auf deiner Merkliste")).toEqual({
      shown: { text: "Gemerkt – liegt jetzt auf deiner Merkliste", tone: "ok" },
      delays: [2800],
    });
  });

  it("zeigt lange Meldungen so lange wie verlangt (6 s für Kürzung und „nichts passt“)", () => {
    expect(LONG_TOAST_MS).toBe(6000);
    expect(sayOnce("Keiner der kommenden Termine passt zum Alter.", LONG_TOAST_MS, "hint")).toEqual({
      shown: { text: "Keiner der kommenden Termine passt zum Alter.", tone: "hint" },
      delays: [6000],
    });
  });

  it("kennt neben der Erfolgsmeldung einen Hinweis ohne Häkchen (Browser-Review 0028)", () => {
    expect(sayOnce("Export gerade nicht möglich", undefined, "hint")).toEqual({
      shown: { text: "Export gerade nicht möglich", tone: "hint" },
      delays: [2800],
    });
  });

  it("nimmt Dauer und Art auch als Optionen (Plan 0057, E3)", () => {
    expect(sayOnce("Export gerade nicht möglich", { tone: "hint", ms: 4000 })).toEqual({
      shown: { text: "Export gerade nicht möglich", tone: "hint" },
      delays: [4000],
    });
  });

  it("Toast mit Aktion: 6 s, Pause bei Fokus, Neustart nach Blur, die Aktion schließt ihn (Plan 0057, E3)", () => {
    const run = vi.fn();
    const { shown, delays } = sayOnce("Vorgemerkt.", { action: { label: "Rückgängig", run } });
    expect(delays).toEqual([6000]);
    expect(shown).toMatchObject({ text: "Vorgemerkt.", tone: "ok", action: { label: "Rückgängig" } });
    const timeout = vi.spyOn(globalThis, "setTimeout");
    timeout.mockClear();
    const clear = vi.spyOn(globalThis, "clearTimeout");
    clear.mockClear();
    // Fokus auf dem Knopf: Die Zeit läuft nicht ab
    shown.action?.hold(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(timeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    // nach dem Blur beginnen die 6 s neu
    shown.action?.hold(false);
    expect(timeout.mock.calls.map((call) => call[1])).toEqual([6000]);
    shown.action?.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
