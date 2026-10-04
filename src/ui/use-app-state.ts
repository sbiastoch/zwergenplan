/** Zustand, der den Browser berührt: URL/History, Präferenzen (über src/data), Toast, Farbschema. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  loadAgeOnly,
  loadBirthDate,
  loadSaved,
  loadTheme,
  saveAgeOnly,
  saveBirthDate,
  saveSaved,
  saveTheme,
  type ThemeChoice,
} from "../data/preferences.ts";
import { parseRoute, type Route, routeToSearch } from "../domain/route.ts";
import { toggleId } from "../domain/saved.ts";

/** Markiert einen History-Eintrag, den das Öffnen eines Details erzeugt hat (Plan 0003, E4). */
const DETAIL_STATE = { zpDetail: true } as const;

function urlFor(route: Route): string {
  const search = routeToSearch(route);
  return `${window.location.pathname}${search ? `?${search}` : ""}`;
}

export interface RouteApi {
  route: Route;
  /** Filter/Ansicht ändern: ersetzt den Eintrag (kein Zurück-Schritt je Filter-Tipp) */
  replace: (next: Route) => void;
  openDetail: (offerId: string) => void;
  closeDetail: () => void;
}

export function useRoute(): RouteApi {
  const [route, setRouteState] = useState(() => parseRoute(window.location.search));
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
    if ((window.history.state as { zpDetail?: boolean } | null)?.zpDetail) {
      window.history.back(); // popstate setzt den Zustand
      return;
    }
    const { offerId: _closed, ...rest } = current.current;
    window.history.replaceState(null, "", urlFor(rest));
    setRoute(rest);
  }, [setRoute]);

  return { route, replace, openDetail, closeDetail };
}

export function useBirthDate(): [string | undefined, (value: string | undefined) => void] {
  const [value, setValue] = useState(loadBirthDate);
  const update = useCallback((next: string | undefined) => {
    setValue(next);
    saveBirthDate(next);
  }, []);
  return [value, update];
}

export function useAgeOnly(): [boolean, (on: boolean) => void] {
  const [value, setValue] = useState(loadAgeOnly);
  const update = useCallback((on: boolean) => {
    setValue(on);
    saveAgeOnly(on);
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
