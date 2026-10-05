/**
 * PWA-Kern (Plan 0011, E4a, E5, E7; ADR 0013), Lazy-Chunk in `assets/app/`: einziger Ort für `navigator.serviceWorker`,
 * `beforeinstallprompt` und `display-mode` (ab Stufe 2 auch das App-Badge). Geladen von `pwa-start.ts` nach `load`,
 * nur im Produktions-Build, und vom Abschnitt „Als App“ (`src/ui/app-extras/`). Injizierbare Umgebung wie
 * `geolocation.ts`; im Unit-Test stehen hier Fakes.
 *
 * Mit `serviceWorkers: "block"` (Playwright) liefert `register()` `undefined`, und `ready` löst nie auf. Dieses Modul
 * wartet deshalb nie auf `ready`: Ohne Registrierung lädt ein Frische-Anlass nur die Daten neu.
 */

import type { InstallState } from "../domain/pwa.ts";

/** Ab so alter Antwort holt die Rückkehr zur App einen neuen Stand (E4a) */
export const FRESH_AFTER_MS = 30 * 60_000;
/** So lange wartet ein Frische-Anlass höchstens auf den neuen Service Worker, bevor er nur die Daten tauscht */
export const UPDATE_WAIT_MS = 10_000;
/**
 * Kopie trotz Netz (5-s-Zeitlimit des Service Workers, Funkloch): Das Ereignis `online` kommt dann nie. Ein Anlass
 * nach dieser Wartezeit holt den frischen Stand (Arch-Review Stufe 1, H5).
 */
export const STALE_RETRY_MS = 30_000;

/**
 * Texte des PWA-Kerns. Sie stehen hier statt in `src/ui/format.ts`, damit sie nicht im Start-Bundle liegen (Plan 0011,
 * E5, erster Kandidat; Arch-Review Stufe 1, H12). Datum per `Intl` in Berlin, ohne Laufzeit-Import aus `src/domain`
 * (ADR 0010).
 */
const DAY = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "numeric", timeZone: "Europe/Berlin" });
/** Statuszeile, wenn `site.json` aus dem Cache des Service Workers kommt (E4): „Offline – Stand vom 5.10.“ */
export const offlineNote = (generatedAt: string) => `Offline – Stand vom ${DAY.format(new Date(generatedAt))}`;
/** Toast: Der Service Worker meldet eine Kalender-Datei, die offline nicht lädt (E4, Regel 2) */
export const ICS_OFFLINE = "Kalender-Datei braucht Netz";

/** Was die App beisteuert (`pwa-start.ts`) */
export interface PwaHooks {
  /** letzter erfolgreicher Abruf von `site.json` (`lastSiteLoad` aus site.ts) */
  lastLoad: () => { at: number; stale: boolean; generatedAt: string } | undefined;
  /** meldet jedes erfolgreiche Laden von `site.json` (`onSiteLoad`), auch nach dem Start des Kerns (B1) */
  onLoad: (fn: () => void) => void;
  /** Frische-Anlass ohne neuen Service Worker: Daten (und eine geladene Wegzeit-Tabelle) neu laden */
  refresh: () => Promise<unknown>;
  /** Toast der App */
  say: (text: string) => void;
  /** Zusatzzeile der Statuszeile; leer heißt keine */
  note: (text: string) => void;
}

/** Der Teil von `ServiceWorkerRegistration`, den die Frische braucht */
export interface UpdatableRegistration {
  update: () => Promise<unknown>;
  installing: unknown;
  waiting: unknown;
}

export interface PwaEnv {
  register: () => Promise<UpdatableRegistration | undefined>;
  /** `visibilitychange` am Dokument, `online` am Fenster; liefert das Abmelden */
  listen: (type: "visibilitychange" | "online", fn: () => void) => () => void;
  onMessage: (fn: (data: unknown) => void) => void;
  onControllerChange: (fn: () => void) => () => void;
  visible: () => boolean;
  online: () => boolean;
  now: () => number;
  reload: () => void;
  /** `data-pwa="bereit"` auf `<html>`: Ab jetzt hört die Seite auf `beforeinstallprompt` (E6) */
  markReady: () => void;
}

function browserEnv(): PwaEnv {
  const sw = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
  const target = (type: string) => (type === "online" ? window : document);
  return {
    // Notausgang (`__SW_OFF__`, README): nicht registrieren, sonst holte jede Seite den sich abmeldenden sw.js zurück
    register: async () =>
      __SW_OFF__
        ? undefined
        : (sw?.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }) ?? undefined),
    listen: (type, fn) => {
      target(type).addEventListener(type, fn);
      return () => target(type).removeEventListener(type, fn);
    },
    onMessage: (fn) => sw?.addEventListener("message", (event) => fn(event.data)),
    onControllerChange: (fn) => {
      sw?.addEventListener("controllerchange", fn);
      return () => sw?.removeEventListener("controllerchange", fn);
    },
    visible: () => document.visibilityState === "visible",
    online: () => navigator.onLine,
    now: Date.now,
    reload: () => window.location.reload(),
    markReady: () => {
      document.documentElement.dataset["pwa"] = "bereit";
    },
  };
}

const isIcsOffline = (data: unknown) =>
  typeof data === "object" && data !== null && "type" in data && data.type === "ics-offline";

/**
 * Registriert den Service Worker und beobachtet Frische-Anlässe. Liefert das Aufräumen. Wirft nie: Ohne Service Worker
 * (blockiert, privat, alter Browser) läuft die App wie bisher.
 */
export async function start(hooks: PwaHooks, env: PwaEnv = browserEnv()): Promise<() => void> {
  env.markReady();
  env.onMessage((data) => {
    if (isIcsOffline(data)) hooks.say(ICS_OFFLINE);
  });
  const registration = await env.register().catch(() => undefined);
  return watchFreshness(hooks, env, registration);
}

/** Statuszeile zum letzten Abruf: offline mit Datenstand, sonst nichts */
function showNote(hooks: PwaHooks) {
  const last = hooks.lastLoad();
  hooks.note(last?.stale ? offlineNote(last.generatedAt) : "");
}

/**
 * Frische-Anlass (E4a): Seite wird wieder sichtbar und der letzte Abruf ist älter als 30 Min., oder das Gerät ist nach
 * einem Offline-Abruf wieder online. Dann zuerst `registration.update()`. Wird dabei ein neuer Service Worker aktiv
 * (`controllerchange`), lädt die Seite neu, damit Code und Daten nie in verschiedenen Ständen laufen. Sonst tauscht
 * die App nur die Daten. Ein Durchlauf zur Zeit.
 */
function watchFreshness(hooks: PwaHooks, env: PwaEnv, registration: UpdatableRegistration | undefined): () => void {
  let running = false;
  /** Ein neuer Service Worker hat die Seite erst nach `UPDATE_WAIT_MS` übernommen (Arch-Review, H10) */
  let lateWorker = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const occasion = async () => {
    clearTimeout(retry);
    if (running) return;
    running = true;
    try {
      if (await newWorkerActive(env, registration, () => (lateWorker = true))) env.reload();
      else {
        await hooks.refresh();
        showNote(hooks);
      }
    } finally {
      running = false;
    }
  };
  const offVisible = env.listen("visibilitychange", () => {
    if (!env.visible()) return;
    // Code und Daten nie in verschiedenen Ständen: der späte Wechsel lädt beim Zurückkehren neu, nie mitten drin
    if (lateWorker) return env.reload();
    const last = hooks.lastLoad();
    if (last && env.now() - last.at > FRESH_AFTER_MS) void occasion();
  });
  const offOnline = env.listen("online", () => {
    if (hooks.lastLoad()?.stale) void occasion();
  });
  // Nach jedem Laden auswerten, nicht nur jetzt: Live ist site.json oft erst nach dem Start des Kerns gelesen
  // (Browser-Review live, B1). Ist sie schon da, wirkt der erste Aufruf sofort. Der Wiederholer (H5) einmal je Seite.
  let retried = false;
  const evaluate = () => {
    showNote(hooks);
    if (retried || !hooks.lastLoad()?.stale || !env.online()) return;
    retried = true;
    retry = setTimeout(() => void occasion(), STALE_RETRY_MS);
  };
  hooks.onLoad(evaluate);
  evaluate();
  return () => {
    hooks.onLoad(() => {});
    clearTimeout(retry);
    offVisible();
    offOnline();
  };
}

/**
 * `true`, wenn `update()` einen neuen Service Worker findet und er binnen `UPDATE_WAIT_MS` die Seite übernimmt. Kommt
 * der Wechsel später, meldet ihn `onLate` (einmal), statt die Seite mitten in der Bedienung neu zu laden.
 */
async function newWorkerActive(
  env: PwaEnv,
  registration: UpdatableRegistration | undefined,
  onLate: () => void,
): Promise<boolean> {
  if (!registration) return false;
  let late = false;
  let changed: (value: boolean) => void = () => {};
  // vor update() lauschen: Mit skipWaiting/claim kann der Wechsel schnell kommen
  const off = env.onControllerChange(() => {
    if (!late) return changed(true);
    off();
    onLate();
  });
  const settled = new Promise<boolean>((resolve) => {
    changed = resolve;
  });
  const timer = setTimeout(() => changed(false), UPDATE_WAIT_MS);
  try {
    await registration.update();
    if (!(registration.installing ?? registration.waiting)) return false;
    if (await settled) return true;
    late = true;
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    if (!late) off();
  }
}

/** `beforeinstallprompt` (nur Chromium, nicht in lib.dom) */
export interface PromptEvent {
  preventDefault: () => void;
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: string }>;
}

export interface InstallEnv {
  /** `display-mode: standalone` bzw. `navigator.standalone` (iOS) */
  standalone: () => boolean;
  userAgent: string;
  maxTouchPoints: number;
  onPrompt: (fn: (event: PromptEvent) => void) => void;
  onInstalled: (fn: () => void) => void;
}

/**
 * iPhone/iPad, heuristisch (E7): iPadOS meldet sich als Mac, nur die Touch-Punkte verraten es. Keine Versionsprüfung:
 * iOS 26 meldet im UA eingefroren `iPhone OS 18_7` (Spike). Fällt die Erkennung falsch aus, sieht man nur einen
 * Hilfetext.
 */
const isIos = ({ userAgent, maxTouchPoints }: InstallEnv) =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

/** Merkt das Angebot des Browsers und meldet Änderungen (für `useSyncExternalStore`). */
export function createInstallStore(env: InstallEnv) {
  let offer: PromptEvent | undefined;
  let installed = false;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const fn of listeners) fn();
  };
  env.onPrompt((event) => {
    // Kein Mini-Infobar: Der Knopf im Abschnitt „Als App“ bietet die Installation an.
    event.preventDefault();
    offer = event;
    changed();
  });
  env.onInstalled(() => {
    installed = true;
    offer = undefined;
    changed();
  });
  return {
    state(): InstallState {
      if (env.standalone()) return "app";
      if (installed) return "installiert";
      if (offer) return "angebot";
      if (isIos(env)) return "ios";
      return /Android/.test(env.userAgent) ? "menue" : "keine";
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Tipp auf „Zum Startbildschirm hinzufügen“. Das Angebot gilt nur einmal (Chrome), danach bleibt das Menü. */
    async prompt(): Promise<void> {
      const event = offer;
      if (!event) return;
      offer = undefined;
      await event.prompt();
      if ((await event.userChoice).outcome === "accepted") installed = true;
      changed();
    },
  };
}

function browserInstallEnv(): InstallEnv {
  return {
    standalone: () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && navigator.standalone === true),
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    // Typ des Events in src/env.d.ts (fehlt in lib.dom)
    onPrompt: (fn) => window.addEventListener("beforeinstallprompt", fn),
    onInstalled: (fn) => window.addEventListener("appinstalled", fn),
  };
}

/**
 * Auf Modulebene: Der Listener hängt, sobald der Chunk lädt (nach `load` über `pwa-start.ts` oder mit dem Abschnitt
 * „Als App“). Geht das Event vorher verloren, zeigt Android den Weg über das Browser-Menü (E5, E7).
 */
const store = typeof window === "undefined" ? undefined : createInstallStore(browserInstallEnv());

/** Installationszustand für den Abschnitt „Als App“ (`useSyncExternalStore`, Tipp auf den Knopf) */
export interface InstallApi {
  state: () => InstallState;
  subscribe: (onChange: () => void) => () => void;
  prompt: () => Promise<void>;
}

export const install: InstallApi = {
  state: () => store?.state() ?? "keine",
  subscribe: (fn) => store?.subscribe(fn) ?? (() => {}),
  prompt: () => store?.prompt() ?? Promise.resolve(),
};
