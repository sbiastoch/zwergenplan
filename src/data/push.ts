/**
 * Push-Abo der Wochen-Nachricht (Plan 0011, E12; Plan 0017, E6, E9; ADR 0014). Einziger Ort für `PushManager` und
 * `Notification`, außer der Erlaubnis im Glocken-Tipp (`pushPermission`, `askPushPermission` in `pwa-start.ts`, ADR 0037). Liest die Registrierung selbst (`getRegistration`, im Tipp `ready`), nur für `pushManager`;
 * registrieren und aktualisieren bleibt `pwa.ts` (ADR 0014, Punkt 6). Lazy im Chunk „Als App“, nie beim App-Start.
 *
 * Der Worker bekommt nur das Abo. Geburtsdatum und Anbieter-Abos landen nur im Geräte-Speicher, für den
 * Zuschnitt im Service Worker. Die Umgebung ist injizierbar wie in `geolocation.ts`.
 */
import { PUSH_WORKER_URL, VAPID_PUBLIC_KEY } from "../../site.config.ts";
import type { PushCapability, PushSupport } from "../domain/pwa.ts";
import type { DeviceKey } from "./device-store.ts";
// benannt statt `import * as`: ein Namensraum-Objekt zöge den Export-Helfer von rolldown in den Einstieg (+0,07 kB)
import { clear, get, set } from "./device-store.ts";

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
  /** `navigator.serviceWorker` da und kein Notausgang (`__SW_OFF__`, Plan 0033, E8, Review M1) */
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  /** `undefined`: kein `Notification` (Safari-Tab) */
  permission(): NotificationPermission | undefined;
  requestPermission(): Promise<NotificationPermission>;
  /** löst sofort auf, auch mit `serviceWorkers: "block"` (dann `undefined`) */
  getRegistration(): Promise<PushRegistration | undefined>;
  /** aktiver Worker; nur im Tipp, wenn es eine Registrierung gibt */
  ready(): Promise<PushRegistration>;
  /**
   * Löst auf, sobald `start()` in `pwa.ts` ohne Registrierung geendet hat (`data-sw="aus"` auf `<html>`), sofort, wenn
   * es schon steht. Dann käme `ready` nie (Plan 0033, E8). `signal` beendet das Beobachten, wenn `ready` gewinnt.
   */
  swGivenUp(signal?: AbortSignal): Promise<void>;
  fetch(url: string, init: { method: string; body: string }): Promise<{ ok: boolean; status: number }>;
  store: {
    get(key: DeviceKey): Promise<unknown>;
    set(key: DeviceKey, value: unknown): Promise<void>;
    clear(): Promise<void>;
  };
}

/** Was in den Geräte-Speicher gespiegelt wird (ADR 0042: ohne Startpunkt und Such-Abos) */
export interface MirrorData {
  birthDate: string | undefined;
  /** Anbieter-Abos (`publicId`, bereinigt, Plan 0054, E3); leer löscht den Schlüssel */
  providers: readonly string[];
}

/** `data-sw="aus"` (gesetzt von `start()` in `pwa.ts`) beobachten; Kanal in docs/architecture.md (App-Extras) */
function swGivenUp(signal?: AbortSignal): Promise<void> {
  const root = document.documentElement;
  const off = () => root.dataset["sw"] === "aus";
  return new Promise((resolve) => {
    if (off()) return resolve();
    const observer = new MutationObserver(() => {
      if (!off()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-sw"] });
    // gewinnt `ready`, bleibt das Versprechen offen, der Beobachter aber nicht hängen (Arch-Review der Umsetzung, m2)
    signal?.addEventListener("abort", () => observer.disconnect(), { once: true });
  });
}

function browserEnv(): PushEnv {
  const sw = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
  return {
    workerUrl: PUSH_WORKER_URL,
    vapidKey: VAPID_PUBLIC_KEY,
    hasServiceWorker: sw !== undefined && !__SW_OFF__,
    hasPushManager: typeof PushManager !== "undefined",
    permission: () => (typeof Notification === "undefined" ? undefined : Notification.permission),
    requestPermission: () => Notification.requestPermission(),
    getRegistration: async () => (await sw?.getRegistration().catch(() => undefined)) ?? undefined,
    ready: async () => {
      if (!sw) throw new PushError("abo");
      return sw.ready;
    },
    swGivenUp,
    fetch: (url, init) => fetch(url, { ...init, headers: { "content-type": "application/json" } }),
    store: { get, set, clear },
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MIRRORED = ["birthDate", "providers"] as const;
/**
 * Altlast (Plan 0054, Nachtrag A; ADR 0042): Startpunkt und Such-Abos lagen bis dahin im Geräte-Speicher. Das erste
 * Spiegeln je Instanz löscht sie (über `written` nur einmal); den Rest erledigt der Service Worker beim Push.
 */
const LEGACY = ["searches", "origin"] as const;

/**
 * Kann dieses Gerät Push (Plan 0033, E1, E8)? Für den App-Schritt des Onboardings. Anders als `support()` ohne Blick auf
 * die Registrierung: Beim Erstbesuch kommt sie erst nach `load`, `support()` sagte dann `kein-sw`. Ohne Registrierung
 * wartet `enable` ohnehin auf `ready` bzw. `data-sw="aus"`.
 */
export function pushCapability(env: PushEnv = browserEnv()): PushCapability {
  const permission = env.permission();
  if (!env.hasServiceWorker || !env.hasPushManager || permission === undefined) return "nein";
  return permission === "denied" ? "verweigert" : "ja";
}

export function createPush(env: PushEnv = browserEnv()) {
  /** zuletzt geschriebene Werte als JSON-Text; leer heißt: beim nächsten Mal alles schreiben */
  const written = new Map<DeviceKey, string>();
  /**
   * Spiegeln erlaubt? Erst wenn Einschalten oder Abgleich ein Abo bestätigt; beim Ausschalten sofort (synchron) aus.
   * Sonst füllt ein Spiegeln, das während des Leerens läuft oder startet, den Speicher wieder: `written` ist dann leer,
   * also schreibt es Geburtsdatum und Abos neu, obwohl Push aus ist (CI-Lauf 37765545767, E6).
   */
  let mirroring = false;
  /**
   * Zählt jedes Ausschalten und Leeren (Plan 0054, E4). Wer nach einem `await` `mirroring` wieder setzt, prüft vorher,
   * ob sich die Zahl geändert hat; sonst setzte ein Spiegeln nach dem Glocken-Tipp, dessen `subscription()` erst nach
   * dem Leeren antwortet, das Flag zurück und füllte den Speicher, obwohl Push aus ist.
   */
  let generation = 0;

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
    generation++;
    written.clear();
    await env.store.clear();
  };

  async function mirror(data: MirrorData): Promise<void> {
    for (const key of [...MIRRORED, ...LEGACY]) {
      // nach jedem `await` neu prüfen: das Ausschalten kann dazwischenkommen
      if (!mirroring) return;
      const raw = key === "searches" || key === "origin" ? undefined : data[key];
      const value = Array.isArray(raw) && raw.length === 0 ? undefined : (raw ?? undefined);
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
     * Nutzeraktivierung (Plan 0011, E12). Erst danach auf den aktiven Worker warten (`subscribe` braucht ihn). Endet
     * `start()` ohne Registrierung (`data-sw="aus"`), käme `ready` nie: dann „abo“. Ein festes Zeitlimit gibt es nicht,
     * es träfe den langsamen Erstbesuch (Plan 0033, E8).
     */
    async enable(data: MirrorData): Promise<string> {
      if ((await env.requestPermission()) !== "granted") throw new PushError("verweigert");
      let sub: PushSub;
      try {
        // `reject` statt eines geworfenen Fehlers in `then`: Gewinnt `ready`, bleibt kein unbehandelter Fehler zurück
        const watch = new AbortController();
        const givenUp = new Promise<never>((_, reject) => {
          void env.swGivenUp(watch.signal).then(() => reject(new PushError("abo")));
        });
        const registration = await Promise.race([env.ready(), givenUp]).finally(() => watch.abort());
        sub = await registration.pushManager.subscribe({
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
      generation++;
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
      const start = generation;
      const sub = await this.subscription();
      if (start !== generation) return false;
      if (!sub) {
        await clearAll();
        return false;
      }
      const stored = await env.store.get("endpoint");
      if (stored !== sub.endpoint && (await register(sub))) {
        if (typeof stored === "string") await forget(stored);
        await env.store.set("endpoint", sub.endpoint);
      }
      if (start !== generation) return false;
      mirroring = true;
      await mirror(data);
      return true;
    },

    mirror,

    /**
     * Einmal am Ende des Onboardings (Plan 0035, E9): Mit Abo die Angaben in den Geräte-Speicher spiegeln, sonst nichts.
     * Anders als `reconcile` kein Request und ohne Abo kein Leeren. Ohne `PushManager` (Safari-Tab) nicht einmal ein
     * Blick auf die Registrierung (Review Runde 2, m5). Auch nach jedem Glocken-Tipp (Plan 0054, E4); das Ergebnis sagt,
     * ob Push an ist („nein“: das Gerät kann kein Push).
     */
    async mirrorIfSubscribed(data: MirrorData): Promise<"an" | "aus" | "nein"> {
      if (!env.hasPushManager) return "nein";
      const start = generation;
      if (!(await this.subscription()) || start !== generation) return "aus";
      mirroring = true;
      await mirror(data);
      return "an";
    },

    /** Geräte-Kennung für den Testversand: die ersten 8 Zeichen des SHA-256 des Endpoints (Schlüssel im Worker) */
    async deviceId(endpoint: string): Promise<string> {
      return (await sha256Hex(endpoint)).slice(0, 8);
    },
  };
}

export type PushApi = ReturnType<typeof createPush>;
