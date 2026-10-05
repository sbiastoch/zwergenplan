import { describe, expect, it } from "vitest";
import type { Origin } from "../domain/reach.ts";
import * as logic from "../domain/transit.ts";
import type { TransitTableFile } from "../domain/transit-types.ts";
import {
  decodeFor,
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
  const table = decodeFor(ready(), KEYS);

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
    const stale = decodeFor(ready(), new Set([...KEYS, "49.5,11.1"]));
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
