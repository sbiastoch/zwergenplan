/**
 * Wegzeit-Tabelle: Laden und Modus der Anzeige (Plan 0009, E9–E11; ADR 0011). Kern ist ein reiner Reducer
 * (wie origin-state.ts): Geladen wird nur auf `want()` (Kind-Sheet, Karte, „Nochmal laden“) oder beim Start mit
 * gespeichertem Stadtteil, höchstens einmal je Sitzung. Die Wahl eines Startpunkts löst nie einen Request aus:
 * Der Startpunkt geht nur in `resolveReach` ein, nie in den Ladezustand.
 */
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { type ChunkOutcome, loadTransit } from "../data/transit.ts";
import { airlineReach, type Origin, type ReachFn } from "../domain/reach.ts";
import type { TransitSource, TransitTable, TransitTableFile } from "../domain/transit-types.ts";

/**
 * Rechenlogik aus `src/domain/transit.ts`, strukturell beschrieben: Das Modul ist ein Lazy-Chunk (E10), auch Typen
 * kommen nicht statisch von dort (`transit-only-lazy`).
 */
interface TransitLogic {
  decodeTransitTable(file: TransitTableFile, placeKeys: ReadonlySet<string>): TransitTable | undefined;
  transitReach(table: TransitTable, origin: Origin): ReachFn | undefined;
}

/**
 * Einziger Lader von `src/domain/transit.ts` (`transit-entry-only`), Chunk in `assets/oepnv/`. Entschieden am
 * Entscheidungspunkt E10: statisch lag das Start-JS über der Schwelle von 88,6 kB. Als async-Funktion mit
 * `await import(…)` wie die Lader in Lazy.tsx (Vites Preload-Helfer, Plan 0008).
 */
async function loadLogic(): Promise<TransitLogic> {
  return await import("../domain/transit.ts");
}

/** Was die Anzeige je Startpunkt zeigt (E11). Ohne Startpunkt gibt es keinen Modus. */
export type ReachMode =
  | { kind: "oepnv" }
  /** Platzhalter, weder Luftlinie noch Wegzeit (M7) */
  | { kind: "laedt" }
  | { kind: "luftlinie"; reason: "fehler" | "ausserhalb" };

/**
 * `attempt` zählt die Ladeversuche; nur die Antwort des laufenden zählt. `retry`: Der laufende Versuch kommt vom
 * Knopf „Nochmal laden“, nicht vom Öffnen eines Sheets oder der Karte. Nur dann darf die Seite neu laden (N1,
 * Arch-Review zur Nacharbeit 0009, Befund 1).
 */
export type TransitState =
  | { kind: "aus" | "fehler"; attempt: number }
  | { kind: "laedt"; attempt: number; retry: boolean }
  | { kind: "bereit"; file: TransitTableFile; logic: TransitLogic; attempt: number };

export type TransitAction =
  /** `retry`: „Nochmal laden“ (N1) */
  | { type: "want"; retry?: true }
  | { type: "loaded"; attempt: number; file: TransitTableFile; logic: TransitLogic }
  | { type: "failed"; attempt: number }
  /** Tabelle geladen, passt aber nicht zu den Orten der Seite (alte `wegzeit.json`, E8): wie ein Fehlschlag */
  | { type: "stale"; attempt: number };

/** Mit gespeichertem Stadtteil lädt die Tabelle gleich beim Start (E9, Auslöser 1). */
export function initialTransitState(storedDistrict: boolean): TransitState {
  return storedDistrict ? { kind: "laedt", attempt: 1, retry: false } : { kind: "aus", attempt: 0 };
}

export function transitReducer(state: TransitState, action: TransitAction): TransitState {
  const { attempt } = state;
  switch (action.type) {
    case "want":
      // nur aus „aus“ oder „fehler“; laufend oder fertig bleibt es, wie es ist (höchstens einmal je Sitzung)
      return state.kind === "aus" || state.kind === "fehler"
        ? { kind: "laedt", attempt: attempt + 1, retry: action.retry === true }
        : state;
    case "loaded":
      if (state.kind !== "laedt" || action.attempt !== attempt) return state;
      return { kind: "bereit", file: action.file, logic: action.logic, attempt };
    case "failed":
      if (state.kind !== "laedt" || action.attempt !== attempt) return state;
      return { kind: "fehler", attempt };
    case "stale":
      // erst so wirkt „Nochmal laden“ (want() nur aus „fehler“), Arch-Review 0009, Befund 2
      if (state.kind !== "bereit" || action.attempt !== attempt) return state;
      return { kind: "fehler", attempt };
  }
}

/**
 * Gleich die Seite neu laden (Plan 0009, N1; ersetzt den Knopf „Seite neu laden“ aus M8): Beim Wiederholen
 * („Nochmal laden“) scheiterte nur der Import der Rechenlogik, die Tabelle kam, das Netz steht also. Chromium behält
 * einen gescheiterten `import()` in der Module-Map, dort hilft nur noch das Neuladen; WebKit und Firefox holen ihn
 * neu (whatwg/html#10327) und kommen beim Wiederholen meist gar nicht hierher. Nicht beim ersten Versuch (dann erst
 * „Nochmal laden“), nicht ohne Tabelle (wohl ohne Netz: ein Neuladen endete auf der Fehlerseite des Browsers), nicht
 * nach dem Zeitlimit (der Import läuft weiter, der nächste Versuch bekommt ihn). Das Neuladen verliert Standort bzw.
 * Kartenmitte (nur im Speicher); URL-Filter und gespeicherter Stadtteil bleiben.
 */
export function reloadAfterRetry(retry: boolean, load: { chunk: ChunkOutcome; file: unknown }): boolean {
  return retry && load.chunk === "fehler" && load.file !== undefined;
}

/**
 * Dekodierte Tabelle zu den Orten der Seite: `undefined`, solange Tabelle oder Orte fehlen; `null`, wenn sie
 * nicht passt (alte `wegzeit.json` aus dem HTTP-Cache, E8). `useTransit` meldet `null` dem Reducer als `stale`.
 */
export function decodeFor(
  state: TransitState,
  placeKeys: ReadonlySet<string> | undefined,
): TransitTable | null | undefined {
  if (state.kind !== "bereit" || !placeKeys) return undefined;
  return state.logic.decodeTransitTable(state.file, placeKeys) ?? null;
}

/** Modus und Entfernung je Lage (E11). Je Startpunkt ist alles eine Art: Wegzeit oder Luftlinie. */
export function resolveReach(
  state: TransitState,
  table: TransitTable | null | undefined,
  origin: Origin | undefined,
): { mode: ReachMode | undefined; reach: ReachFn | undefined } {
  if (!origin) return { mode: undefined, reach: undefined };
  if (state.kind === "fehler" || table === null) {
    return { mode: { kind: "luftlinie", reason: "fehler" }, reach: airlineReach(origin) };
  }
  if (state.kind !== "bereit" || !table) return { mode: { kind: "laedt" }, reach: undefined };
  const reach = state.logic.transitReach(table, origin);
  return reach
    ? { mode: { kind: "oepnv" }, reach }
    : { mode: { kind: "luftlinie", reason: "ausserhalb" }, reach: airlineReach(origin) };
}

/**
 * Ob die Grenze „bis … Min.“ zählt (Badge, Zurücksetzen): mit Wegzeit und schon solange sie lädt, damit das
 * Badge nach dem Laden nicht springt (M7). Bei Luftlinie oder ohne Startpunkt wirkt sie nicht.
 */
export function limitActive(mode: ReachMode | undefined): boolean {
  return mode?.kind === "oepnv" || mode?.kind === "laedt";
}

export interface TransitApi {
  /** `undefined`: kein Startpunkt */
  mode: ReachMode | undefined;
  /** `undefined`: kein Startpunkt oder Tabelle lädt */
  reach: ReachFn | undefined;
  /** Namensnennung aus `wegzeit.json` (E3), sobald die Tabelle passt */
  source: TransitSource | undefined;
  /** Auslöser 2 und 3 aus E9: Kind-Sheet, Karte */
  want: () => void;
  /** Auslöser 4 aus E9: „Nochmal laden“; scheitert dabei nur der Chunk, lädt die Seite neu (N1) */
  retry: () => void;
}

/**
 * `origin` beim ersten Aufruf entscheidet über das Laden beim Start (gespeicherter Stadtteil, E9). Danach geht der
 * Startpunkt nur noch in die Rechnung ein. `placeKeys`: Orte der Seite (`undefined`, solange `site.json` lädt).
 */
export function useTransit(origin: Origin | undefined, placeKeys: ReadonlySet<string> | undefined): TransitApi {
  const [state, dispatch] = useReducer(transitReducer, origin?.source === "stadtteil", initialTransitState);
  const attempt = state.kind === "laedt" ? state.attempt : 0;
  const retry = state.kind === "laedt" && state.retry;

  useEffect(() => {
    if (attempt === 0) return;
    let live = true;
    // Rechenlogik und Tabelle parallel, ein Zeitlimit für beide. Ab dem zweiten Versuch ohne HTTP-Cache; scheitert
    // bei „Nochmal laden“ nur der Chunk, lädt die Seite neu (N1).
    void loadTransit(loadLogic, attempt > 1).then((load) => {
      if (!live) return;
      if (reloadAfterRetry(retry, load)) {
        window.location.reload();
        return;
      }
      const { logic, file } = load;
      dispatch(logic && file ? { type: "loaded", attempt, file, logic } : { type: "failed", attempt });
    });
    return () => {
      live = false;
    };
  }, [attempt, retry]);

  const table = useMemo(() => decodeFor(state, placeKeys), [state, placeKeys]);
  // Passt die Tabelle nicht, führt der Reducer das als Fehler; die Anzeige fällt schon jetzt zurück (resolveReach).
  const loadedAttempt = state.attempt;
  useEffect(() => {
    if (table === null) dispatch({ type: "stale", attempt: loadedAttempt });
  }, [table, loadedAttempt]);
  const { mode, reach } = useMemo(() => resolveReach(state, table, origin), [state, table, origin]);
  const want = useCallback(() => dispatch({ type: "want" }), []);
  const retryNow = useCallback(() => dispatch({ type: "want", retry: true }), []);
  return { mode, reach, source: table?.source, want, retry: retryNow };
}
