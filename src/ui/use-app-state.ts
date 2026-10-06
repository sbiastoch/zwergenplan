/** Zustand, der den Browser berührt: URL/History, Präferenzen (über src/data), Toast, Farbschema, Uhr, Startpunkt. */
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { canLocate, type PositionProblem, requestPosition } from "../data/geolocation.ts";
import {
  loadBirthDate,
  loadOriginDistrict,
  loadOriginPoint,
  loadSaved,
  loadTheme,
  saveBirthDate,
  saveOrigin,
  saveSaved,
  saveTheme,
  type ThemeChoice,
} from "../data/preferences.ts";
import { districtById } from "../domain/districts.ts";
import { coarsen, type GeoPoint, inBounds } from "../domain/geo.ts";
import type { Origin } from "../domain/reach.ts";
import { parseRoute, type Route, routeToSearch } from "../domain/route.ts";
import { toggleId } from "../domain/saved.ts";
import { sameMinute } from "../domain/time.ts";
import { initialOriginState, originReducer, storedPointOrigin } from "./origin-state.ts";
import { preloadProviderUi } from "./ProviderPanel.tsx";

/** Markiert einen History-Eintrag, den das Öffnen eines Details erzeugt hat (Plan 0003, E4). */
const DETAIL_STATE = { zpDetail: true } as const;
/** Markiert einen History-Eintrag, den das Öffnen des Anbieter-Sheets erzeugt hat (Plan 0010, E3). */
const PROVIDER_STATE = { zpProvider: true } as const;

// `history.state` ist `any`: Gelesen werden nur unsere eigenen Marker, fremde Einträge ergeben `undefined`.
const historyState = () => window.history.state as { zpDetail?: boolean; zpProvider?: boolean } | null;

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
}

export function useRoute(): RouteApi {
  const [route, setRouteState] = useState(() => {
    const parsed = parseRoute(window.location.search);
    // Deep-Link: Chunk und Katalog starten, bevor site.json da ist (Plan 0010, E3). Gemerkt im Lader, also auch unter
    // StrictMode (doppelter Initializer) nur ein Request.
    if (parsed.providerId !== undefined || parsed.tab === "anbieter") preloadProviderUi();
    return parsed;
  });
  // Aktueller Stand für Callbacks – History-Aufrufe gehören nicht in setState-Updater (StrictMode ruft die doppelt).
  const current = useRef(route);
  const setRoute = useCallback((next: Route) => {
    current.current = next;
    setRouteState(next);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setRoute]);

  const replace = useCallback(
    (next: Route) => {
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

  return { route, replace, openDetail, closeDetail, openProvider, closeProvider };
}

export function useBirthDate(): [string | undefined, (value: string | undefined) => void] {
  const [value, setValue] = useState(loadBirthDate);
  const update = useCallback((next: string | undefined) => {
    setValue(next);
    saveBirthDate(next);
  }, []);
  return [value, update];
}

export function useSaved(): [string[], (id: string) => boolean] {
  const [ids, setIds] = useState(loadSaved);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  /** liefert, ob das Angebot danach gemerkt ist */
  const toggle = useCallback((id: string) => {
    const next = toggleId(idsRef.current, id);
    idsRef.current = next;
    setIds(next);
    saveSaved(next);
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

/** Kurzmeldung, 2,8 s sichtbar. */
export function useToast(): [string, (message: string) => void] {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = useCallback((next: string) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(""), 2800);
  }, []);
  return [message, say];
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
  /** „Kartenmitte als Startpunkt“ (Plan 0005, E8): gerundet und so gespeichert; `false` außerhalb Nürnbergs */
  setMapCenter: (center: GeoPoint) => boolean;
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

  const setMapCenter = useCallback((center: GeoPoint) => {
    const point = coarsen(center);
    if (!inBounds(point)) return false;
    nextRequest.current++;
    dispatch({ type: "mapCenter", point });
    saveOrigin({ source: "karte", ...point });
    return true;
  }, []);

  const clear = useCallback(() => {
    nextRequest.current++;
    dispatch({ type: "clear" });
    saveOrigin(undefined);
  }, []);

  const { origin, locating, problem } = state;
  return { origin, locating, problem, canLocate: locatable, locateMe, setDistrict, setMapCenter, clear };
}
