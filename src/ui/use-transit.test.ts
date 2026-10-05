import { describe, expect, it, vi } from "vitest";
import type { Origin } from "../domain/reach.ts";
import * as logic from "../domain/transit.ts";
import type { TransitLinesFile, TransitTableFile } from "../domain/transit-types.ts";
import {
  decodeFor,
  decodeLinesFor,
  deliverLoad,
  initialTransitState,
  limitActive,
  reloadAfterRetry,
  resolveReach,
  type TransitAction,
  type TransitState,
  transitReducer,
} from "./use-transit.ts";

const run = (state: TransitState, ...actions: TransitAction[]) => actions.reduce(transitReducer, state);

const FILE: TransitTableFile = {
  version: 2,
  id: "0badc0de",
  source: {
    attribution: "VGN – Verkehrsverbund Großraum Nürnberg GmbH",
    title: "VGN-Soll-Daten vom 24.06.2026",
    url: "https://www.vgn.de/web-entwickler/open-data/",
    license: "CC BY-SA 3.0 DE",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/",
    validFrom: "2026-06-24",
    validTo: "2026-12-12",
  },
  serviceDay: "2026-10-13",
  window: { from: "08:30", to: "10:30" },
  places: ["49.4521,11.0767", "49.4362,11.0851"],
  // Zeilen 49.4485/11.059 und 49.4497/11.064 (Grad × 1e4, ab dem zweiten Wert als Differenz)
  lat: [494485, 12],
  lon: [110590, 50],
  minutes: btoa(String.fromCharCode(12, 30, 10, 255)),
};
const KEYS = new Set(FILE.places);
const GOSTENHOF: Origin = { source: "stadtteil", point: { lat: 49.448, lon: 11.058 }, label: "Gostenhof" };
/** in der BBOX, aber weit weg von jeder Zeile */
const FERN: Origin = { source: "standort", point: { lat: 49.4, lon: 11.2 }, label: "Mein Standort" };
const BEISPIELHOF = { geo: { lat: 49.4521, lon: 11.0767 } };

const ready = (): TransitState => run(initialTransitState(true), { type: "loaded", attempt: 1, file: FILE, logic });
const NB = "\u00a0";
/** Linien zur Tabelle FILE (2 Zeilen × 2 Spalten): Zeile 9001 → Beispielhof „Tram 4“ */
const LINES: TransitLinesFile = {
  version: 1,
  table: FILE.id,
  source: FILE.source,
  lines: [`Tram${NB}4`],
  first: btoa(String.fromCharCode(1, 0, 0, 0)),
  second: btoa(String.fromCharCode(0, 0, 0, 0)),
};

describe("transitReducer (Plan 0009, E9/E11)", () => {
  it("lädt beim Start nur mit gespeichertem Stadtteil", () => {
    expect(initialTransitState(false)).toEqual({ kind: "aus", attempt: 0 });
    expect(initialTransitState(true)).toEqual({ kind: "laedt", attempt: 1, retry: false });
  });

  it("want() lädt einmal; weitere Auslöser während des Ladens oder danach ändern nichts", () => {
    const loading = transitReducer(initialTransitState(false), { type: "want" });
    expect(loading).toEqual({ kind: "laedt", attempt: 1, retry: false });
    expect(transitReducer(loading, { type: "want" })).toBe(loading);
    const done = transitReducer(loading, { type: "loaded", attempt: 1, file: FILE, logic });
    expect(done.kind).toBe("bereit");
    expect(transitReducer(done, { type: "want" })).toBe(done);
  });

  it("eine Antwort zählt nur für den laufenden Versuch", () => {
    const loading = run(initialTransitState(false), { type: "want" });
    expect(transitReducer(loading, { type: "loaded", attempt: 7, file: FILE, logic })).toBe(loading);
    expect(transitReducer(loading, { type: "failed", attempt: 7 })).toBe(loading);
  });

  it("Fehlschlag → fehler; erst das nächste want() lädt neu", () => {
    const failed = run(initialTransitState(true), { type: "failed", attempt: 1 });
    expect(failed).toEqual({ kind: "fehler", attempt: 1 });
    expect(transitReducer(failed, { type: "want" })).toEqual({ kind: "laedt", attempt: 2, retry: false });
  });

  // Plan 0009, N1 (H1): Chromium behält einen gescheiterten import() in der Module-Map, ein neuer Versuch scheitert
  // dort sofort. WebKit und Firefox holen ihn neu (whatwg/html#10327). Kam die Tabelle, steht das Netz: Dann hilft
  // nur noch das Neuladen der Seite, und zwar gleich, statt erst einen Knopf „Seite neu laden“ anzubieten.
  it("lädt die Seite neu, wenn beim Wiederholen nur der Chunk scheitert (N1)", () => {
    expect(reloadAfterRetry(true, { chunk: "fehler", file: FILE })).toBe(true);
    // erster Versuch: erst „Nochmal laden“ anbieten, WebKit/Firefox schaffen es dann ohne Neuladen
    expect(reloadAfterRetry(false, { chunk: "fehler", file: FILE })).toBe(false);
    // Tabelle auch weg: wohl kein Netz, ein Neuladen endete auf der Fehlerseite des Browsers
    expect(reloadAfterRetry(true, { chunk: "fehler", file: undefined })).toBe(false);
    // Zeitlimit ist kein Fehlschlag: Der Import läuft weiter, der nächste Versuch bekommt ihn
    expect(reloadAfterRetry(true, { chunk: "zeitlimit", file: FILE })).toBe(false);
    expect(reloadAfterRetry(true, { chunk: "ok", file: FILE })).toBe(false);
  });

  // N1, Arch-Review zur Nacharbeit, Befund 1: Öffnet jemand nach einem Fehler das Kind-Sheet oder die Karte, ist das
  // kein „Nochmal laden“; die Seite darf darunter nicht neu laden.
  it("merkt sich, ob der Versuch von „Nochmal laden“ kommt", () => {
    const failed = run(initialTransitState(true), { type: "failed", attempt: 1 });
    expect(transitReducer(failed, { type: "want" })).toEqual({ kind: "laedt", attempt: 2, retry: false });
    expect(transitReducer(failed, { type: "want", retry: true })).toEqual({ kind: "laedt", attempt: 2, retry: true });
    // ein laufender Versuch bleibt, wie er ist, auch beim Tipp auf „Nochmal laden“
    const loading = transitReducer(failed, { type: "want" });
    expect(transitReducer(loading, { type: "want", retry: true })).toBe(loading);
  });

  // Arch-Review 0009, Befund 2: Sonst bliebe der Reducer „bereit“ und want() wirkungslos.
  it("veraltete Tabelle → fehler; „Nochmal laden“ lädt neu", () => {
    const stale = transitReducer(ready(), { type: "stale", attempt: 1 });
    expect(stale).toEqual({ kind: "fehler", attempt: 1 });
    expect(transitReducer(stale, { type: "want" })).toEqual({ kind: "laedt", attempt: 2, retry: false });
  });

  it("„veraltet“ zählt nur für die fertige Tabelle des laufenden Versuchs", () => {
    const loading = initialTransitState(true);
    expect(transitReducer(loading, { type: "stale", attempt: 1 })).toBe(loading);
    const done = ready();
    expect(transitReducer(done, { type: "stale", attempt: 7 })).toBe(done);
  });
});

describe("resolveReach: Modus je Lage (E11)", () => {
  const table = decodeFor(FILE, logic, KEYS);

  it("ohne Startpunkt: kein Modus, keine Entfernung", () => {
    expect(resolveReach(ready(), table, undefined)).toEqual({ mode: undefined, reach: undefined });
    expect(resolveReach(initialTransitState(false), undefined, undefined).mode).toBeUndefined();
  });

  it("laedt, solange nichts da ist, auch beim gespeicherten Stadtteil direkt nach dem Start (M7)", () => {
    for (const state of [initialTransitState(false), initialTransitState(true)]) {
      expect(resolveReach(state, undefined, GOSTENHOF)).toEqual({ mode: { kind: "laedt" }, reach: undefined });
    }
    // Tabelle da, aber site.json noch nicht: noch keine Spalten zum Prüfen
    expect(resolveReach(ready(), undefined, GOSTENHOF).mode).toEqual({ kind: "laedt" });
  });

  it("fehler → Luftlinie", () => {
    const failed = run(initialTransitState(true), { type: "failed", attempt: 1 });
    const { mode, reach } = resolveReach(failed, undefined, GOSTENHOF);
    expect(mode).toEqual({ kind: "luftlinie", reason: "fehler" });
    expect(reach?.(BEISPIELHOF).kind).toBe("luftlinie");
  });

  it("alte Tabelle ohne Spalte für einen Ort der Seite → fehler (E8)", () => {
    const stale = decodeFor(FILE, logic, new Set([...KEYS, "49.5,11.1"]));
    expect(stale).toBeNull();
    expect(resolveReach(ready(), stale, GOSTENHOF).mode).toEqual({ kind: "luftlinie", reason: "fehler" });
  });

  it("kein Halt in 800 m → Luftlinie „außerhalb“", () => {
    const { mode, reach } = resolveReach(ready(), table, FERN);
    expect(mode).toEqual({ kind: "luftlinie", reason: "ausserhalb" });
    expect(reach?.(BEISPIELHOF).kind).toBe("luftlinie");
  });

  it("bereit und im Stadtgebiet → Wegzeit", () => {
    const { mode, reach } = resolveReach(ready(), table, GOSTENHOF);
    expect(mode).toEqual({ kind: "oepnv" });
    const value = reach?.(BEISPIELHOF);
    expect(value?.kind).toBe("oepnv");
    expect(value?.kind === "oepnv" && value.minutes).toBeGreaterThan(12);
  });

  it("dieselbe Tabelle für jeden Startpunkt: Ein Wechsel ändert den Ladezustand nicht", () => {
    const state = ready();
    resolveReach(state, table, GOSTENHOF);
    resolveReach(state, table, FERN);
    expect(state).toEqual(ready());
  });
});

describe("Linien (Plan 0012, E9, S2)", () => {
  const table = decodeFor(FILE, logic, KEYS);

  it("Reducer „lines“ nur in „bereit“ mit gleichem Versuch", () => {
    const done = ready();
    const withLines = transitReducer(done, { type: "lines", attempt: 1, lines: LINES });
    expect(withLines).toEqual({ ...done, lines: LINES });
    expect(transitReducer(done, { type: "lines", attempt: 2, lines: LINES })).toBe(done);
    const loading = initialTransitState(true);
    expect(transitReducer(loading, { type: "lines", attempt: 1, lines: LINES })).toBe(loading);
    const failed = run(loading, { type: "failed", attempt: 1 });
    expect(transitReducer(failed, { type: "lines", attempt: 1, lines: LINES })).toBe(failed);
  });

  it("resolveReach mit Linien nennt sie, ohne Linien nicht", () => {
    const lines = decodeLinesFor(LINES, table, logic);
    expect(lines?.names).toEqual([`Tram${NB}4`]);
    const withLines = resolveReach(ready(), table, GOSTENHOF, lines).reach?.(BEISPIELHOF);
    expect(withLines?.kind === "oepnv" && withLines.lines).toEqual([`Tram${NB}4`]);
    const without = resolveReach(ready(), table, GOSTENHOF).reach?.(BEISPIELHOF);
    expect(without?.kind === "oepnv" && without.lines).toBeUndefined();
  });

  it("unpassende Linien: keine Linien, aber kein „veraltet“ – die Wegzeit bleibt", () => {
    expect(decodeLinesFor({ ...LINES, table: "deadbeef" }, table, logic)).toBeUndefined();
    expect(decodeLinesFor(undefined, table, logic)).toBeUndefined();
    expect(decodeLinesFor(LINES, undefined, logic)).toBeUndefined();
    expect(decodeLinesFor(LINES, null, logic)).toBeUndefined();
    expect(decodeLinesFor(LINES, table, undefined)).toBeUndefined();
    const { mode } = resolveReach(ready(), table, GOSTENHOF, undefined);
    expect(mode).toEqual({ kind: "oepnv" });
  });

  /** Versprechen, das der Test von außen erfüllt */
  function deferred<T>() {
    let resolve: (v: T) => void = () => {};
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  // Review B1: Der Effekt räumt nach `loaded` auf (attempt wird 0); kämen die Linien danach mit `live`-Prüfung,
  // gingen sie immer verloren.
  it("deliverLoad: erst loaded, dann wird der Effekt abgeräumt, dann kommen die Linien – sie kommen trotzdem an", async () => {
    const lines = deferred<TransitLinesFile | undefined>();
    let live = true;
    let state = initialTransitState(true);
    const dispatch = (a: TransitAction) => {
      state = transitReducer(state, a);
    };
    deliverLoad(
      { logic, file: FILE, chunk: "ok", lines: lines.promise },
      { attempt: 1, retry: false, isLive: () => live, dispatch, reload: () => {} },
    );
    expect(state.kind).toBe("bereit");
    live = false;
    lines.resolve(LINES);
    await lines.promise;
    await Promise.resolve();
    expect(state).toEqual({ kind: "bereit", file: FILE, logic, attempt: 1, lines: LINES });
  });

  it("deliverLoad: Linien eines veralteten Versuchs ändern über den Reducer nichts", async () => {
    const lines = deferred<TransitLinesFile | undefined>();
    let state: TransitState = initialTransitState(true);
    const actions: TransitAction[] = [];
    const dispatch = (a: TransitAction) => {
      actions.push(a);
      state = transitReducer(state, a);
    };
    deliverLoad(
      { logic, file: FILE, chunk: "ok", lines: lines.promise },
      { attempt: 1, retry: false, isLive: () => true, dispatch, reload: () => {} },
    );
    // die Tabelle passt nicht → fehler, „Nochmal laden“ startet Versuch 2
    dispatch({ type: "stale", attempt: 1 });
    dispatch({ type: "want", retry: true });
    const before = state;
    lines.resolve(LINES);
    await lines.promise;
    await Promise.resolve();
    expect(actions.at(-1)).toEqual({ type: "lines", attempt: 1, lines: LINES });
    expect(state).toBe(before);
  });

  it("deliverLoad: nicht mehr aktuell → nichts; Fehlschlag → failed; Chunk scheitert beim Wiederholen → Neuladen", () => {
    const none = Promise.resolve(undefined);
    const dispatch = vi.fn();
    const reload = vi.fn();
    const ctx = { attempt: 2, retry: true, dispatch, reload };
    deliverLoad({ logic, file: FILE, chunk: "ok", lines: none }, { ...ctx, isLive: () => false });
    expect(dispatch).not.toHaveBeenCalled();
    deliverLoad({ logic: undefined, file: undefined, chunk: "fehler", lines: none }, { ...ctx, isLive: () => true });
    expect(dispatch).toHaveBeenCalledWith({ type: "failed", attempt: 2 });
    deliverLoad({ logic: undefined, file: FILE, chunk: "fehler", lines: none }, { ...ctx, isLive: () => true });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("deliverLoad: keine Linien (undefined) → keine Aktion „lines“", async () => {
    const dispatch = vi.fn();
    const none = Promise.resolve(undefined);
    deliverLoad(
      { logic, file: FILE, chunk: "ok", lines: none },
      { attempt: 1, retry: false, isLive: () => true, dispatch, reload: () => {} },
    );
    await none;
    await Promise.resolve();
    expect(dispatch.mock.calls.map(([a]) => a.type)).toEqual(["loaded"]);
  });
});

describe("limitActive", () => {
  it("zählt die Grenze bei Wegzeit und solange sie lädt, sonst nicht", () => {
    expect(limitActive({ kind: "oepnv" })).toBe(true);
    // lädt: Die Grenze wird gleich wirken; das Badge springt nicht (CLS, M7)
    expect(limitActive({ kind: "laedt" })).toBe(true);
    expect(limitActive({ kind: "luftlinie", reason: "fehler" })).toBe(false);
    expect(limitActive({ kind: "luftlinie", reason: "ausserhalb" })).toBe(false);
    expect(limitActive(undefined)).toBe(false);
  });
});
