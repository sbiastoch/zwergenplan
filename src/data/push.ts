/**
 * Push-Abo der Wochen-Nachricht (Plan 0011, E12; Plan 0017, E6, E9; ADR 0014). Einziger Ort für `PushManager` und
 * `Notification`. Liest die Registrierung selbst (`getRegistration`, im Tipp `ready`), nur für `pushManager`;
 * registrieren und aktualisieren bleibt `pwa.ts` (ADR 0014, Punkt 6). Lazy im Chunk „Als App“, nie beim App-Start.
 *
 * Der Worker bekommt nur das Abo. Geburtsdatum, Such-Abos und Startpunkt landen nur im Geräte-Speicher, für den
 * Zuschnitt im Service Worker. Die Umgebung ist injizierbar wie in `geolocation.ts`.
 */
import { PUSH_WORKER_URL, VAPID_PUBLIC_KEY } from "../../site.config.ts";
import type { PushSupport } from "../domain/pwa.ts";
import type { DeviceKey } from "./device-store.ts";
// benannt statt `import * as`: ein Namensraum-Objekt zöge den Export-Helfer von rolldown in den Einstieg (+0,07 kB)
import { clear, get, set } from "./device-store.ts";
import type { StoredOriginPoint } from "./preferences.ts";

export type PushProblem = "verweigert" | "abo" | "netz" | "server";

export class PushError extends Error {
  readonly problem: PushProblem;
  constructor(problem: PushProblem) {
    super(problem);
    this.problem = problem;
  }
}

export interface PushSub {
  endpoint: string;
  toJSON(): unknown;
  unsubscribe(): Promise<boolean>;
}

export interface PushRegistration {
  pushManager: {
    getSubscription(): Promise<PushSub | null>;
    subscribe(options: { userVisibleOnly: true; applicationServerKey: string }): Promise<PushSub>;
  };
}

export interface PushEnv {
  workerUrl: string;
  vapidKey: string;
  hasPushManager: boolean;
  /** `undefined`: kein `Notification` (Safari-Tab) */
  permission(): NotificationPermission | undefined;
  requestPermission(): Promise<NotificationPermission>;
  /** löst sofort auf, auch mit `serviceWorkers: "block"` (dann `undefined`) */
  getRegistration(): Promise<PushRegistration | undefined>;
  /** aktiver Worker; nur im Tipp, wenn es eine Registrierung gibt */
  ready(): Promise<PushRegistration>;
  fetch(url: string, init: { method: string; body: string }): Promise<{ ok: boolean; status: number }>;
  store: {
    get(key: DeviceKey): Promise<unknown>;
    set(key: DeviceKey, value: unknown): Promise<void>;
    clear(): Promise<void>;
  };
}

/** Was in den Geräte-Speicher gespiegelt wird; `origin` genau wie im `localStorage` (ADR 0017) */
export interface MirrorData {
  birthDate: string | undefined;
  /** rohe Liste aus `searches-store.ts` */
  searches: string | null;
  origin: string | StoredOriginPoint | undefined;
}

function browserEnv(): PushEnv {
  const sw = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
  return {
    workerUrl: PUSH_WORKER_URL,
    vapidKey: VAPID_PUBLIC_KEY,
    hasPushManager: typeof PushManager !== "undefined",
    permission: () => (typeof Notification === "undefined" ? undefined : Notification.permission),
    requestPermission: () => Notification.requestPermission(),
    getRegistration: async () => (await sw?.getRegistration().catch(() => undefined)) ?? undefined,
    ready: async () => {
      if (!sw) throw new PushError("abo");
      return sw.ready;
    },
    fetch: (url, init) => fetch(url, { ...init, headers: { "content-type": "application/json" } }),
    store: { get, set, clear },
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MIRRORED = ["birthDate", "searches", "origin"] as const;

export function createPush(env: PushEnv = browserEnv()) {
  /** zuletzt geschriebene Werte als JSON-Text; leer heißt: beim nächsten Mal alles schreiben */
  const written = new Map<DeviceKey, string>();
  /**
   * Spiegeln erlaubt? Erst wenn Einschalten oder Abgleich ein Abo bestätigt; beim Ausschalten sofort (synchron) aus.
   * Sonst füllt ein Spiegeln, das während des Leerens läuft oder startet, den Speicher wieder: `written` ist dann leer,
   * also schreibt es Startpunkt und Such-Abos neu, obwohl Push aus ist (CI-Lauf 37765545767, E6).
   */
  let mirroring = false;

  const post = (path: string, method: "POST" | "DELETE", body: unknown) =>
    env.fetch(`${env.workerUrl}${path}`, { method, body: JSON.stringify(body) });

  /** Meldet das Abo beim Worker; `false` bei Netz- oder Serverfehler */
  const register = async (sub: PushSub) => {
    try {
      return (await post("/abo", "POST", sub.toJSON())).ok;
    } catch {
      return false;
    }
  };

  const forget = async (endpoint: string) => {
    await post("/abo", "DELETE", { endpoint }).catch(() => undefined);
  };

  const clearAll = async () => {
    mirroring = false;
    written.clear();
    await env.store.clear();
  };

  async function mirror(data: MirrorData): Promise<void> {
    for (const key of MIRRORED) {
      // nach jedem `await` neu prüfen: das Ausschalten kann dazwischenkommen
      if (!mirroring) return;
      const value = data[key] ?? undefined;
      const text = JSON.stringify(value) ?? "";
      if (written.get(key) === text) continue;
      await env.store.set(key, value);
      written.set(key, text);
    }
  }

  return {
    async support(): Promise<PushSupport> {
      if (!(await env.getRegistration())) return "kein-sw";
      const permission = env.permission();
      if (!env.hasPushManager || permission === undefined) return "kein-push";
      return permission === "denied" ? "verweigert" : "ok";
    },

    /** Läuft gerade ein Abo? Das ist „Push an“ (kein eigener Schlüssel, Plan 0017, Runde 3). */
    async subscription(): Promise<PushSub | undefined> {
      return (await (await env.getRegistration())?.pushManager.getSubscription()) ?? undefined;
    },

    /**
     * Einschalten auf Tipp. `requestPermission` muss das erste `await` im Tipp-Handler sein, sonst verliert iOS die
     * Nutzeraktivierung (Plan 0011, E12). Erst danach auf den aktiven Worker warten (`subscribe` braucht ihn).
     */
    async enable(data: MirrorData): Promise<string> {
      if ((await env.requestPermission()) !== "granted") throw new PushError("verweigert");
      let sub: PushSub;
      try {
        sub = await (await env.ready()).pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: env.vapidKey,
        });
      } catch {
        throw new PushError("abo");
      }
      let problem: PushProblem | undefined;
      try {
        if (!(await post("/abo", "POST", sub.toJSON())).ok) problem = "server";
      } catch {
        problem = "netz";
      }
      if (problem) {
        await sub.unsubscribe().catch(() => false);
        throw new PushError(problem);
      }
      written.clear();
      mirroring = true;
      try {
        await env.store.set("endpoint", sub.endpoint);
        await mirror(data);
      } catch {
        // Geräte-Speicher kaputt oder voll: alles zurück, damit der Schalter den echten Zustand zeigt (Arch-Review M1)
        await sub.unsubscribe().catch(() => false);
        await forget(sub.endpoint);
        await clearAll().catch(() => undefined);
        throw new PushError("abo");
      }
      return sub.endpoint;
    },

    async disable(): Promise<void> {
      // vor dem ersten `await`: Ab jetzt schreibt kein Spiegeln mehr, auch keins, das schon läuft
      mirroring = false;
      const sub = await this.subscription();
      if (sub) {
        await sub.unsubscribe().catch(() => false);
        await forget(sub.endpoint);
      }
      await clearAll();
    },

    /**
     * Abgleich beim Öffnen des Kind-Sheets (statt beim App-Start, Plan 0017, E6). `true` heißt: Push ist an.
     * Ein ausgetauschtes Abo wird neu gemeldet und das alte abgemeldet; scheitert das, bleibt der alte Endpoint stehen,
     * damit es beim nächsten Öffnen erneut versucht wird.
     */
    async reconcile(data: MirrorData): Promise<boolean> {
      const sub = await this.subscription();
      if (!sub) {
        await clearAll();
        return false;
      }
      const stored = await env.store.get("endpoint");
      if (stored !== sub.endpoint && (await register(sub))) {
        if (typeof stored === "string") await forget(stored);
        await env.store.set("endpoint", sub.endpoint);
      }
      mirroring = true;
      await mirror(data);
      return true;
    },

    mirror,

    /** Geräte-Kennung für den Testversand: die ersten 8 Zeichen des SHA-256 des Endpoints (Schlüssel im Worker) */
    async deviceId(endpoint: string): Promise<string> {
      return (await sha256Hex(endpoint)).slice(0, 8);
    },
  };
}

export type PushApi = ReturnType<typeof createPush>;
