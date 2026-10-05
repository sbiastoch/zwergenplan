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

/** Was die App beisteuert (`pwa-start.ts`) */
export interface PwaHooks {
  /** letzter erfolgreicher Abruf von `site.json` (`lastSiteLoad` aus site.ts) */
  lastLoad: () => { at: number; stale: boolean } | undefined;
  /** Frische-Anlass ohne neuen Service Worker: Daten (und eine geladene Wegzeit-Tabelle) neu laden */
  refresh: () => void;
  /** Der Service Worker meldet: Kalender-Datei offline nicht ladbar (E4, Regel 2) */
  icsOffline: () => void;
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
  now: () => number;
  reload: () => void;
  /** `data-pwa="bereit"` auf `<html>`: Ab jetzt hört die Seite auf `beforeinstallprompt` (E6) */
  markReady: () => void;
}

function browserEnv(): PwaEnv {
  const sw = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
  const target = (type: string) => (type === "online" ? window : document);
  return {
    register: async () =>
      sw?.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }) ?? undefined,
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
    if (isIcsOffline(data)) hooks.icsOffline();
  });
  const registration = await env.register().catch(() => undefined);
  return watchFreshness(hooks, env, registration);
}

/**
 * Frische-Anlass (E4a): Seite wird wieder sichtbar und der letzte Abruf ist älter als 30 Min., oder das Gerät ist nach
 * einem Offline-Abruf wieder online. Dann zuerst `registration.update()`. Wird dabei ein neuer Service Worker aktiv
 * (`controllerchange`), lädt die Seite neu, damit Code und Daten nie in verschiedenen Ständen laufen. Sonst tauscht
 * die App nur die Daten. Ein Durchlauf zur Zeit.
 */
function watchFreshness(hooks: PwaHooks, env: PwaEnv, registration: UpdatableRegistration | undefined): () => void {
  let running = false;
  const occasion = async () => {
    if (running) return;
    running = true;
    try {
      if (await newWorkerActive(env, registration)) env.reload();
      else hooks.refresh();
    } finally {
      running = false;
    }
  };
  const offVisible = env.listen("visibilitychange", () => {
    const last = hooks.lastLoad();
    if (env.visible() && last && env.now() - last.at > FRESH_AFTER_MS) void occasion();
  });
  const offOnline = env.listen("online", () => {
    if (hooks.lastLoad()?.stale) void occasion();
  });
  return () => {
    offVisible();
    offOnline();
  };
}

/** `true`, wenn `update()` einen neuen Service Worker findet und er binnen `UPDATE_WAIT_MS` die Seite übernimmt. */
async function newWorkerActive(env: PwaEnv, registration: UpdatableRegistration | undefined): Promise<boolean> {
  if (!registration) return false;
  let off = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  // vor update() lauschen: Mit skipWaiting/claim kann der Wechsel schnell kommen
  const changed = new Promise<boolean>((resolve) => {
    off = env.onControllerChange(() => resolve(true));
    timer = setTimeout(() => resolve(false), UPDATE_WAIT_MS);
  });
  try {
    await registration.update();
    return Boolean(registration.installing ?? registration.waiting) && (await changed);
  } catch {
    return false;
  } finally {
    off();
    clearTimeout(timer);
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
