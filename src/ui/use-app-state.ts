/** Zustand, der den Browser berührt: URL/History, Präferenzen (über src/data), Toast, Farbschema, Uhr, Startpunkt. */
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { canLocate, type PositionProblem, requestPosition } from "../data/geolocation.ts";
import {
  loadBirthDate,
  loadOriginDistrict,
  loadOriginPoint,
  loadSaved,
  loadSavedProviders,
  loadTentative,
  loadTheme,
  saveBirthDate,
  saveOrigin,
  saveSaved,
  saveSavedProviders,
  saveTentative,
  saveTheme,
  type ThemeChoice,
} from "../data/preferences.ts";
import { absoluteUrl, shareLink } from "../data/share.ts";
import { districtById } from "../domain/districts.ts";
import type { Origin } from "../domain/reach.ts";
import {
  afterBigClosed,
  hasMap,
  isLegacyView,
  parseRoute,
  type Route,
  resolveRouteIds,
  routeToSearch,
  strayBig,
} from "../domain/route.ts";
import {
  cleanSavedProviders,
  cleanSavedState,
  cycleStage,
  type SavedStage,
  type SavedState,
  stageOf,
  toggleId,
  withStage,
} from "../domain/saved.ts";
import { sameMinute } from "../domain/time.ts";
import { SHARE_COPIED } from "./format.ts";
import { initialOriginState, originReducer, storedPointOrigin } from "./origin-state.ts";
import { preloadProviderUi } from "./ProviderPanel.tsx";
import { NO_TOAST, type ToastMessage, type ToastTone } from "./Toast.tsx";

/** Markiert einen History-Eintrag, den das Öffnen eines Details erzeugt hat (Plan 0003, E4). */
const DETAIL_STATE = { zpDetail: true } as const;
/** Markiert einen History-Eintrag, den das Öffnen des Anbieter-Sheets erzeugt hat (Plan 0010, E3). */
const PROVIDER_STATE = { zpProvider: true } as const;
/** … und das Öffnen der großen Karte (Plan 0059, E1) */
const BIG_STATE = { zpBig: true } as const;

// `history.state` ist `any`: Gelesen werden nur unsere eigenen Marker, fremde Einträge ergeben `undefined`.
const historyState = () => window.history.state as { zpDetail?: boolean; zpProvider?: boolean; zpBig?: boolean } | null;

function urlFor(route: Route): string {
  const search = routeToSearch(route);
  return `${window.location.pathname}${search ? `?${search}` : ""}`;
}

export interface RouteApi {
  route: Route;
  /** Filter/Ansicht ändern: ersetzt den Eintrag (kein Zurück-Schritt je Filter-Tipp) */
  replace: (next: Route) => void;
  /** Detail öffnen; ein offenes Anbieter-Sheet bleibt darunter (Plan 0010, E3) */
  openDetail: (offerId: string) => void;
  closeDetail: () => void;
  /** Anbieter-Sheet über dem aktuellen Tab öffnen; ein offenes Detail schließt (Plan 0010, E3) */
  openProvider: (providerId: string) => void;
  closeProvider: () => void;
  /** Karte groß (Plan 0059, E1): eigener Eintrag, „Zurück“ schließt sie */
  openBig: () => void;
  closeBig: () => void;
}

/**
 * Route aus der Adresse, alte IDs auf Kurz-IDs umgerechnet (ADR 0022). Ändert sich dabei etwas oder ist die Ansicht
 * veraltet, ersetzt genau ein `replaceState` die Adresse durch die kanonische – außerhalb jedes setState-Updaters.
 */
function routeFromLocation(): Route {
  const raw = parseRoute(window.location.search);
  const parsed = resolveRouteIds(raw);
  const renamed = parsed.offerId !== raw.offerId || parsed.providerId !== raw.providerId;
  // Alter Link auf den Tab „Kalender“ (Plan 0025, E8): Er landet in „Entdecken“, die URL wird kanonisch.
  // `karte=gross` ohne Ansicht mit Karte gilt nicht und fällt auch aus der Adresse (Plan 0059, E1)
  if (renamed || strayBig(window.location.search, parsed) || isLegacyView(window.location.search)) {
    window.history.replaceState(window.history.state, "", urlFor(parsed));
  }
  return parsed;
}

export function useRoute(): RouteApi {
  const [route, setRouteState] = useState(() => {
    // Im Initializer statt im Effekt, damit der erste Render schon zur URL passt; zweimal (StrictMode) schadet nicht,
    // denn der zweite Lauf liest schon die umgeschriebene Adresse.
    const parsed = routeFromLocation();
    // Deep-Link: Chunk und Katalog starten, bevor site.json da ist (Plan 0010, E3). Gemerkt im Lader, also auch unter
    // StrictMode (doppelter Initializer) nur ein Request.
    if (parsed.providerId !== undefined || parsed.tab === "anbieter") preloadProviderUi();
    return parsed;
  });
  // Aktueller Stand für Callbacks – History-Aufrufe gehören nicht in setState-Updater (StrictMode ruft die doppelt).
  const current = useRef(route);
  const setRoute = useCallback((wanted: Route) => {
    // `big` gilt im Speicher nur zu einer Ansicht mit Karte (Plan 0059, E1, Review M2), wie in der URL
    const { big: _big, ...rest } = wanted;
    const next = wanted.big && !hasMap(wanted.tab) ? rest : wanted;
    current.current = next;
    setRouteState(next);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const popped = routeFromLocation();
      // In der großen Karte gesetzte Filter überstehen „Zurück“ (Plan 0059, Review 2, N1)
      const next = afterBigClosed(current.current, popped);
      if (next !== popped) window.history.replaceState(window.history.state, "", urlFor(next));
      setRoute(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setRoute]);

  const replace = useCallback(
    (wanted: Route) => {
      // Ein Wechsel der Ansicht schließt die große Karte (Plan 0059, E6): Sie gehört zur Karte, aus der sie kam.
      const { big: _big, ...rest } = wanted;
      const next = wanted.tab === current.current.tab ? wanted : rest;
      setRoute(next);
      window.history.replaceState(window.history.state, "", urlFor(next));
    },
    [setRoute],
  );

  const openDetail = useCallback(
    (offerId: string) => {
      const next = { ...current.current, offerId };
      window.history.pushState(DETAIL_STATE, "", urlFor(next));
      setRoute(next);
    },
    [setRoute],
  );

  const closeDetail = useCallback(() => {
    if (historyState()?.zpDetail) {
      window.history.back(); // popstate setzt den Zustand
      return;
    }
    const { offerId: _closed, ...rest } = current.current;
    window.history.replaceState(null, "", urlFor(rest));
    setRoute(rest);
  }, [setRoute]);

  const openProvider = useCallback(
    (providerId: string) => {
      const { offerId: _closed, ...rest } = current.current;
      const next = { ...rest, providerId };
      window.history.pushState(PROVIDER_STATE, "", urlFor(next));
      setRoute(next);
    },
    [setRoute],
  );

  const closeProvider = useCallback(() => {
    if (historyState()?.zpProvider) {
      window.history.back(); // popstate setzt den Zustand
      return;
    }
    const { providerId: _closed, ...rest } = current.current;
    window.history.replaceState(null, "", urlFor(rest));
    setRoute(rest);
  }, [setRoute]);

  const openBig = useCallback(() => {
    const next: Route = { ...current.current, big: true };
    window.history.pushState(BIG_STATE, "", urlFor(next));
    setRoute(next);
  }, [setRoute]);

  const closeBig = useCallback(() => {
    if (historyState()?.zpBig) {
      window.history.back(); // popstate setzt den Zustand
      return;
    }
    const { big: _closed, ...rest } = current.current;
    window.history.replaceState(null, "", urlFor(rest));
    setRoute(rest);
  }, [setRoute]);

  return { route, replace, openDetail, closeDetail, openProvider, closeProvider, openBig, closeBig };
}

export function useBirthDate(): [string | undefined, (value: string | undefined) => void] {
  const [value, setValue] = useState(loadBirthDate);
  const update = useCallback((next: string | undefined) => {
    setValue(next);
    saveBirthDate(next);
  }, []);
  return [value, update];
}

/** Merkliste mit Stufen (Plan 0057, E1) */
export interface SavedApi {
  state: SavedState;
  stage: (id: string) => SavedStage;
  /** Tipp aufs Herz: speichert sofort und liefert die neue Stufe */
  cycle: (id: string) => SavedStage;
  /** Halten oder „Rückgängig“: speichert sofort und liefert die neue Stufe */
  setStage: (id: string, stage: SavedStage) => SavedStage;
}

/** Schreibt nur die Liste, die sich geändert hat */
function storeSaved(before: SavedState, next: SavedState): void {
  if (next.ids.join() !== before.ids.join()) saveSaved(next.ids);
  if (next.tentative.join() !== before.tentative.join()) saveTentative(next.tentative);
}

/**
 * Gemerkte Angebote mit Stufen (Plan 0057, E1). Der Initializer bereinigt einmal (`cleanSavedState`): IDs aus der Zeit
 * vor ADR 0022 werden Kurz-IDs, Vorgemerktes außerhalb der Merkliste fällt weg; geschrieben wird nur bei Änderung.
 */
export function useSaved(): SavedApi {
  const [state, setState] = useState<SavedState>(() => {
    const stored = { ids: loadSaved(), tentative: loadTentative() };
    const cleaned = cleanSavedState(stored);
    storeSaved(stored, cleaned);
    return cleaned;
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const setStage = useCallback((id: string, stage: SavedStage) => {
    const before = stateRef.current;
    const next = withStage(before, id, stage);
    stateRef.current = next;
    setState(next);
    storeSaved(before, next);
    return stage;
  }, []);
  const cycle = useCallback((id: string) => setStage(id, stageOf(cycleStage(stateRef.current, id), id)), [setStage]);
  // aus dem Ref: Ein zweiter Tipp vor dem nächsten Rendern liest schon den neuen Stand. Die Identität bleibt deshalb
  // gleich: Ein `useMemo` über Stufen hängt an `state`, nie an `stage`
  const stage = useCallback((id: string) => stageOf(stateRef.current, id), []);
  return { state, stage, cycle, setStage };
}

/**
 * Gemerkte Anbieter (Plan 0025, E1), gebaut wie `useSaved`. Die Rohform aus dem Speicher prüft `cleanSavedProviders`
 * (wie `useOrigin` die Rohwerte, ADR 0017). `toggle` liefert, ob der Anbieter danach gemerkt ist.
 */
export function useSavedProviders(): [string[], (id: string) => boolean] {
  const [ids, setIds] = useState(() => {
    const stored = loadSavedProviders();
    const cleaned = cleanSavedProviders(stored);
    // Katalog-IDs aus der Zeit vor ADR 0022 einmal auf die publicId umschreiben
    if (cleaned.join() !== stored.join()) saveSavedProviders(cleaned);
    return cleaned;
  });
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const toggle = useCallback((id: string) => {
    const next = toggleId(idsRef.current, id);
    idsRef.current = next;
    setIds(next);
    saveSavedProviders(next);
    return next.includes(id);
  }, []);
  return [ids, toggle];
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function subscribeDark(onChange: () => void) {
  const query = darkQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Darstellung: Wahl speichern, `data-theme` setzen, wirksames Schema (für Icon und theme-color) liefern. */
export function useTheme(): { choice: ThemeChoice; dark: boolean; setChoice: (c: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState(loadTheme);
  const systemDark = useSyncExternalStore(subscribeDark, () => darkQuery().matches);
  const dark = choice === "auto" ? systemDark : choice === "dunkel";

  useEffect(() => {
    const root = document.documentElement;
    if (choice === "auto") delete root.dataset["theme"];
    else root.dataset["theme"] = choice === "dunkel" ? "dark" : "light";
    // Browser-Leiste passend einfärben, auch bei manueller Wahl
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      if (choice === "auto") meta.content = meta.media.includes("dark") ? "#0e1620" : "#e8f1ff";
      else meta.content = dark ? "#0e1620" : "#e8f1ff";
    }
  }, [choice, dark]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    saveTheme(c);
  }, []);
  return { choice, dark, setChoice };
}

/** Standarddauer einer Kurzmeldung */
const TOAST_MS = 2800;

/**
 * Dauer der langen Kalender-Toasts (Plan 0018, E4): mit Altersgrenze, mit fehlenden Angeboten und „nichts passt“. Sie
 * sind bis knapp 90 Zeichen lang, nach der Faustregel etwa 1 s je 15 Zeichen.
 */
export const LONG_TOAST_MS = 6000;

/** Toast mit Knopf (Plan 0057, E3) */
interface ToastOptions {
  ms?: number;
  tone?: ToastTone;
  /** Knopf im Toast, etwa „Rückgängig“; der Toast steht dann 6 s statt 2,8 s */
  action?: { label: string; run: () => void };
}

/** Meldung zeigen: 2,8 s oder `ms` lang, standardmäßig als Erfolg; mit Optionen auch mit Knopf */
export type Say = (message: string, msOrOptions?: number | ToastOptions, tone?: ToastTone) => void;

/**
 * Kurzmeldung, 2,8 s sichtbar oder `ms` lang. Mit Aktion 6 s (Plan 0057, E3): Solange der Knopf Fokus hat, läuft die
 * Zeit nicht ab, nach dem Blur beginnt sie neu (`hold`). Hover hält ihn bewusst nicht.
 */
export function useToast(): [ToastMessage, Say] {
  const [message, setMessage] = useState(NO_TOAST);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = useCallback<Say>((text, msOrOptions, toneArg) => {
    const options: ToastOptions =
      typeof msOrOptions === "object"
        ? msOrOptions
        : { ...(msOrOptions !== undefined && { ms: msOrOptions }), ...(toneArg && { tone: toneArg }) };
    const { action, tone = "ok" } = options;
    const ms = options.ms ?? (action ? LONG_TOAST_MS : TOAST_MS);
    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(NO_TOAST), ms);
    };
    setMessage(
      action
        ? {
            text,
            tone,
            action: {
              label: action.label,
              run: () => {
                clearTimeout(timer.current);
                setMessage(NO_TOAST);
                action.run();
              },
              hold: (paused) => (paused ? clearTimeout(timer.current) : arm()),
            },
          }
        : { text, tone },
    );
    arm();
  }, []);
  return [message, say];
}

export interface ShareState {
  /** im Tipp-Handler aufrufen, synchron (Safari verlangt die Nutzer-Aktivierung) */
  share: (target: { title: string; path: string }) => void;
  /** Link für das Sheet „Link zum Teilen“, wenn Teilen und Kopieren scheiterten (Review M2) */
  manualLink: string | undefined;
  closeManualLink: () => void;
}

/**
 * Teilen per Link (Plan 0026, E6): System-Teilen, sonst kopieren mit Toast, sonst den Link zum Markieren zeigen.
 * Geteilt wird nur der Pfad aus der ID, nie `location` – Filter, Ansicht, Geburtsdatum und Startpunkt bleiben draußen.
 */
export function useShare(say: (message: string) => void): ShareState {
  const [manualLink, setManualLink] = useState<string>();
  const share = useCallback(
    ({ title, path }: { title: string; path: string }) => {
      const url = absoluteUrl(path);
      void shareLink({ title, url }).then((outcome) => {
        if (outcome === "kopiert") say(SHARE_COPIED);
        if (outcome === "fehler") setManualLink(url);
      });
    },
    [say],
  );
  const closeManualLink = useCallback(() => setManualLink(undefined), []);
  return { share, manualLink, closeManualLink };
}

/** Wie oft „jetzt“ geprüft wird. Der Zustand ändert sich trotzdem höchstens einmal pro Minute. */
const NOW_CHECK_MS = 30_000;

/**
 * „Jetzt“ für die ganze App (Plan 0007, E2): erneuert sich in einem offenen Tab, damit beendete
 * Termine auch ohne Neuladen verschwinden und nach Mitternacht „heute“ stimmt. Geprüft wird alle
 * 30 s und wenn die Seite wieder sichtbar wird (Handy aus der Tasche). Ein neues `Date` gibt es nur
 * beim Minutenwechsel; sonst bleibt das Objekt gleich, und alle `useMemo` darauf bleiben gültig.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const check = () => {
      const next = new Date();
      setNow((prev) => (sameMinute(prev, next) ? prev : next));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    const timer = setInterval(check, NOW_CHECK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return now;
}

export interface OriginApi {
  /** gewählter Startpunkt; der zuletzt gewählte bleibt auf dem Gerät (ADR 0017) */
  origin: Origin | undefined;
  /** Standortabfrage läuft */
  locating: boolean;
  /** letzter Fehlergrund der Standortabfrage; weg bei neuer Abfrage und sobald ein Startpunkt gesetzt wird */
  problem: PositionProblem | undefined;
  /** ob „Meinen Standort nutzen“ überhaupt angeboten wird */
  canLocate: boolean;
  /** „Meinen Standort nutzen“: fragt einmal ab, nur auf Tipp */
  locateMe: () => void;
  setDistrict: (id: string) => void;
  /** „Startpunkt entfernen“: auch den gespeicherten Punkt bzw. Stadtteil */
  clear: () => void;
}

function districtOrigin(id: string | undefined): Origin | undefined {
  const district = id ? districtById(id) : undefined;
  return district && { source: "stadtteil", point: district.point, label: district.name, districtId: district.id };
}

/**
 * Startpunkt der Entfernung (Plan 0004, E3; Plan 0016). Gespeichert wird der zuletzt gewählte: ein Stadtteil als
 * ID, Standort und Kartenmitte als schon gerundeter Punkt (ADR 0017), nie beides. Der Standort wird nur auf Tipp
 * abgefragt, auch mit gespeichertem Standort nie beim Start. Die Reihenfolge (späte Antworten) regelt
 * `originReducer`; ein ungültiger gespeicherter Punkt oder eine unbekannte ID zählt als „nicht gespeichert“.
 */
export function useOrigin(): OriginApi {
  const [state, dispatch] = useReducer(originReducer, undefined, () =>
    initialOriginState(storedPointOrigin(loadOriginPoint()) ?? districtOrigin(loadOriginDistrict())),
  );
  const [locatable] = useState(() => canLocate());
  // Jede Wahl zählt hoch: Eine Standort-Antwort wird nur gespeichert, solange ihre Abfrage die neueste ist; dieselbe
  // Regel wie `pending` im Reducer (Plan 0016, E2).
  const nextRequest = useRef(0);

  const locateMe = useCallback(() => {
    const request = ++nextRequest.current;
    dispatch({ type: "locate", request });
    void requestPosition().then((result) => {
      dispatch({ type: "located", request, result });
      if (result.ok && nextRequest.current === request) saveOrigin({ source: "standort", ...result.point });
    });
  }, []);

  const setDistrict = useCallback((id: string) => {
    const origin = districtOrigin(id);
    if (!origin) return;
    nextRequest.current++;
    dispatch({ type: "district", origin });
    saveOrigin(id);
  }, []);

  const clear = useCallback(() => {
    nextRequest.current++;
    dispatch({ type: "clear" });
    saveOrigin(undefined);
  }, []);

  const { origin, locating, problem } = state;
  return { origin, locating, problem, canLocate: locatable, locateMe, setDistrict, clear };
}
