/**
 * Notausgang statt `sw.ts` (README; Arch-Review Stufe 1, H3): gebaut von `scripts/vite-sw.ts`, wenn `ZWERGENPLAN_SW=aus`
 * gesetzt ist. Übernimmt sofort, räumt auf, meldet sich ab. Die Logik steht rein in `retire.ts`.
 */
import { retire } from "./retire.ts";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) =>
  event.waitUntil(
    retire({
      cacheNames: () => caches.keys(),
      deleteCache: (name) => caches.delete(name),
      unregister: () => self.registration.unregister(),
      windows: () => self.clients.matchAll({ type: "window" }),
    }),
  ),
);
