/**
 * Service Worker des Zwergenplans (Plan 0011, E3, E4; ADR 0013). Gebaut von `scripts/vite-sw.ts` als IIFE `sw.js`.
 * Die Regeln stehen rein in `routes.ts`; hier nur Events, Caches und Fetch.
 *
 * - Precache im `install`: Schale (`index.html` am HTTP-Cache vorbei, Start-Assets) und `data/site.json`, damit die
 *   App auch beim ersten Start offline öffnet.
 * - `activate`: alte Schalen löschen, Navigation Preload an, `clients.claim()`. Kein automatisches Neuladen; das
 *   macht nur die Seite beim Frische-Anlass (E4a, `src/data/pwa.ts`).
 * - Fremde Origins und alles ohne Regel: kein `respondWith` (ADR 0008).
 */
import { PUSH_WORKER_URL, VAPID_PUBLIC_KEY } from "../../site.config.ts";
import * as deviceStore from "../data/device-store.ts";
import { decidePush, readProposed } from "./push-decision.ts";
import { type TailorEnv, tailorPush } from "./push-tailor.ts";
import {
  ASSETS_CACHE,
  assetsToEvict,
  DATA_CACHE,
  NAVIGATION_TIMEOUT_MS,
  OFFLINE_HEADER,
  SITE_TIMEOUT_MS,
  shellCache,
  staleShells,
  strategyFor,
} from "./routes.ts";

declare const self: ServiceWorkerGlobalScope;
/** Start-Assets relativ zum Scope, gesetzt von scripts/vite-sw.ts */
declare const __PRECACHE__: readonly string[];
/** Hash über Precache-Liste und index.html */
declare const __SW_VERSION__: string;

const SHELL = shellCache(__SW_VERSION__);
const abs = (path: string) => new URL(path, self.registration.scope).href;

/** löst nach `ms` mit `undefined` auf (Funkloch: lieber die Kopie als warten) */
const timeout = (ms: number) => new Promise<undefined>((resolve) => setTimeout(resolve, ms, undefined));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      // index.html am HTTP-Cache vorbei: Eine alte Seite passte sonst nicht zur neuen Asset-Liste.
      // Gehashte Assets dürfen aus dem HTTP-Cache kommen.
      await Promise.all(
        __PRECACHE__.map((path) => shell.add(new Request(abs(path), path === "index.html" ? { cache: "reload" } : {}))),
      );
      const data = await caches.open(DATA_CACHE);
      await data.add(new Request(abs("data/site.json"), { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(staleShells(await caches.keys(), __SW_VERSION__).map((name) => caches.delete(name)));
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const navigate = request.mode === "navigate";
  const strategy = strategyFor({ url: request.url, scope: self.registration.scope, method: request.method, navigate });
  if (strategy === "ics") event.respondWith(ics(event));
  else if (strategy === "asset") event.respondWith(asset(event));
  else if (strategy === "site") event.respondWith(site(event));
  else if (strategy === "oepnv") event.respondWith(oepnv(event));
  else if (strategy === "schale") event.respondWith(shell(event));
  // nicht eingegriffen: Die Preload-Antwort abwarten, sonst warnt die Konsole
  else if (navigate) event.waitUntil(Promise.resolve(event.preloadResponse).catch(() => undefined));
});

/** Netz, bei Navigation über die Preload-Antwort */
async function network(event: FetchEvent): Promise<Response> {
  const preloaded: unknown = event.request.mode === "navigate" ? await event.preloadResponse : undefined;
  return preloaded instanceof Response ? preloaded : fetch(event.request);
}

/** Regel 2: Offline bleibt die Seite stehen (204), die App zeigt den Hinweis (`src/data/pwa.ts`). */
async function ics(event: FetchEvent): Promise<Response> {
  try {
    return await network(event);
  } catch {
    event.waitUntil(tellClients(event.clientId, { type: "ics-offline" }));
    return new Response(null, { status: 204 });
  }
}

/** Den auslösenden Tab; bei einer Navigation (ohne `clientId`) die Tabs im Vordergrund, sonst alle. */
async function tellClients(clientId: string, message: { type: "ics-offline" }) {
  const own = clientId ? await self.clients.get(clientId) : undefined;
  const windows = own ? [own] : await self.clients.matchAll({ type: "window" });
  const focused = windows.filter((c) => c instanceof WindowClient && c.focused);
  for (const client of focused.length > 0 ? focused : windows) client.postMessage(message);
}

/** Regel 3: gehasht und unveränderlich, also Cache zuerst. */
async function asset(event: FetchEvent): Promise<Response> {
  const cached = await caches.match(event.request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) event.waitUntil(keepAsset(event.request.url, response.clone()));
  return response;
}

async function keepAsset(url: string, response: Response) {
  const cache = await caches.open(ASSETS_CACHE);
  await cache.put(url, response);
  const keys = (await cache.keys()).map((r) => r.url);
  const keep = new Set(__PRECACHE__.map(abs));
  await Promise.all(assetsToEvict(keys, keep).map((key) => cache.delete(key)));
}

/** Antwort aus dem Cache, gekennzeichnet für `loadSiteData` (Statuszeile „Offline – Stand vom …“) */
function fromCache(copy: Response): Response {
  const headers = new Headers(copy.headers);
  headers.set(OFFLINE_HEADER, "offline");
  return new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers });
}

/**
 * Netz, die erfolgreiche Antwort landet zusätzlich in `zp-data`. Die Kopie entsteht **synchron** mit der Antwort, bevor
 * `respondWith` den Body liest: Ein `clone()` erst nach `await caches.open()` warf, und nichts wurde gecacht
 * (Arch-Review Stufe 1, B1). `waitUntil` hängt sofort, auch wenn `site()` vorher per Zeitlimit die Kopie liefert.
 */
function networkKeeping(event: FetchEvent, request: Request): Promise<Response> {
  const fetched = fetch(request).then((res) => {
    const copy = res.status === 200 ? res.clone() : undefined;
    const stored = copy ? caches.open(DATA_CACHE).then((cache) => cache.put(request.url, copy)) : Promise.resolve();
    return { res, stored };
  });
  event.waitUntil(fetched.then(({ stored }) => stored).catch(() => undefined));
  return fetched.then(({ res }) => res);
}

/** Regel 4: Netz zuerst ohne HTTP-Cache; mit Kopie nach 5 s oder bei Netzfehler die Kopie. */
async function site(event: FetchEvent): Promise<Response> {
  const request = new Request(event.request, { cache: "no-cache" });
  const response = networkKeeping(event, request);
  const copy = await caches.match(request.url, { cacheName: DATA_CACHE });
  if (!copy) return response;
  try {
    return (await Promise.race([response, timeout(SITE_TIMEOUT_MS)])) ?? fromCache(copy);
  } catch {
    return fromCache(copy);
  }
}

/** Regel 5: Wegzeit-Tabelle und Linien, Netz zuerst (die Zeitlimits hat src/data/transit.ts), offline die Kopie. */
async function oepnv(event: FetchEvent): Promise<Response> {
  try {
    return await networkKeeping(event, event.request);
  } catch (e) {
    const copy = await caches.match(event.request.url, { cacheName: DATA_CACHE });
    if (copy) return copy;
    throw e;
  }
}

/** Regel 6: online immer die aktuelle Seite; nach 3 s oder offline die vorgehaltene Schale. */
async function shell(event: FetchEvent): Promise<Response> {
  const response = network(event);
  try {
    const fresh = await Promise.race([response, timeout(NAVIGATION_TIMEOUT_MS)]);
    if (fresh) return fresh;
  } catch {
    // offline: Schale
  }
  // Die Preload-Antwort trotzdem abwarten, sonst warnt die Konsole
  event.waitUntil(response.catch(() => undefined));
  return (await caches.match(abs("index.html"), { cacheName: SHELL })) ?? response;
}

/**
 * Wochen-Nachricht (Plan 0017, E10; ADR 0014). Die Payload steht auf iOS nur in `event.notification` (Declarative Web
 * Push), sonst in `event.data`. `now` ist der Versandzeitpunkt aus der Payload. Höchstens 5 s Zuschnitt, sonst zeigt
 * das System die allgemeine Fassung bzw. der Service Worker die vorgeschlagene (`push-decision.ts`).
 */
const TAILOR_TIMEOUT_MS = 5000;
const FETCH_TIMEOUT_MS = 4000;

const tailorEnv: TailorEnv = {
  timeoutMs: TAILOR_TIMEOUT_MS,
  // bei jedem Push genau ein Request je Datei, für alle gleich; bedingt, also meist 304 (Runde 3, H1)
  fetchJson: async (path) => {
    const response = await fetch(abs(path), { cache: "no-cache", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  },
  cachedJson: async (path) => (await caches.match(abs(path), { cacheName: DATA_CACHE }))?.json(),
  store: deviceStore,
};

/** `PushEvent.notification` (Declarative Web Push) steht noch nicht in lib.webworker */
type DeclarativePushEvent = PushEvent & { notification?: Notification };

function proposedOf(event: DeclarativePushEvent) {
  if (event.notification) {
    const { title, body, data } = event.notification;
    return readProposed({ title, body, data });
  }
  try {
    return readProposed((event.data?.json() as { notification?: unknown } | undefined)?.notification);
  } catch {
    return undefined;
  }
}

self.addEventListener("push", (event: DeclarativePushEvent) => {
  const proposed = proposedOf(event);
  const sent = proposed?.sentAt === undefined ? Number.NaN : Date.parse(proposed.sentAt);
  const now = Number.isNaN(sent) ? new Date() : new Date(sent);
  event.waitUntil(
    (async () => {
      const outcome = await tailorPush({ now, test: proposed?.test ?? false, env: tailorEnv });
      const { show } = decidePush({
        proposed,
        declarative: event.notification !== undefined,
        outcome,
        scope: self.registration.scope,
      });
      // `navigate` kennt lib.webworker noch nicht; ohne lehnt iOS die Nachricht ab (Spike j)
      if (show) await self.registration.showNotification(show.title, show.options as NotificationOptions);
    })(),
  );
});

/** Nur Chromium und Firefox (iOS folgt `navigate` selbst): offenes Fenster nach vorn, sonst die Startseite öffnen. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = Object(event.notification.data) as { navigate?: unknown };
  const target = typeof data.navigate === "string" ? data.navigate : self.registration.scope;
  event.waitUntil(
    (async () => {
      const [open] = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (open) await open.focus();
      else await self.clients.openWindow(target);
    })(),
  );
});

/** `pushsubscriptionchange` noch nicht in lib.webworker */
type SubscriptionChangeEvent = ExtendableEvent & {
  oldSubscription?: PushSubscription | null;
  newSubscription?: PushSubscription | null;
};

/**
 * Chrome und Firefox tauschen Abos gelegentlich aus (Plan 0011, E10.7): neues Abo melden, altes abmelden. Der einzige
 * Request ohne Tipp; er enthält nur das Abo (ADR 0014). Scheitert er, holt der Abgleich beim Öffnen des Kind-Sheets
 * es nach.
 */
self.addEventListener("pushsubscriptionchange", (event: Event) => {
  const change = event as SubscriptionChangeEvent;
  change.waitUntil(
    (async () => {
      const fresh =
        change.newSubscription ??
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: VAPID_PUBLIC_KEY,
        }));
      const send = (method: "POST" | "DELETE", body: unknown) =>
        fetch(`${PUSH_WORKER_URL}/abo`, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const response = await send("POST", fresh.toJSON());
      if (!response.ok) return;
      const old = change.oldSubscription?.endpoint ?? (await deviceStore.get("endpoint"));
      if (typeof old === "string" && old !== fresh.endpoint)
        await send("DELETE", { endpoint: old }).catch(() => undefined);
      await deviceStore.set("endpoint", fresh.endpoint);
    })(),
  );
});
