# ADR 0013 – Installierbare App und eigener Service Worker

Status: Entwurf (2026-10-05). Wird mit Stufe 1 von Plan 0011 angenommen (Schritt 5). Ergänzt ADR 0002 und die Bootstrap-Regel in `docs/architecture.md`. Details stehen in Plan 0011 (E2–E7).

## Kontext

- Familie und Freunde öffnen den Zwergenplan fast nur auf dem Handy. Ohne Manifest gibt es kein eigenes Icon und keinen Vollbild-Start. Ohne Netz bricht die Seite mit „Keine Verbindung“ ab.
- `docs/architecture.md` erlaubt Daten- und Gerätezugriff außerhalb von `src/data` nur per ADR. Ein Service Worker cacht Antworten und beantwortet Requests der Seite. Das ist ein solcher Zugriff.
- Das Start-JS liegt am Budget (90 kB gzip). Neue Logik im Start-Bundle braucht einen Grund.

## Entscheidung

1. **Web-App-Manifest und Icons.** `display: standalone`, Pfade relativ zum Manifest. Die Icons entstehen reproduzierbar aus einer SVG-Quelle.
2. **Eigener Service Worker** (`src/sw/`), als einzelne IIFE-Datei `sw.js` von einem kleinen Vite-Plugin gebaut, mit eigener Precache-Liste. Kein Workbox, kein `vite-plugin-pwa`.
3. **Regeln:**
   - Navigation und Daten (`site.json`, `wegzeit.json`, `linien.json`) **Netz zuerst**, offline der Cache (`linien.json` seit Plan 0012, ADR 0015).
   - Gehashte Assets Cache zuerst.
   - Alles andere vom eigenen Origin und **jeder fremde Origin**: Der Service Worker greift nicht ein (ADR 0008).
   - Aktualisierung mit `skipWaiting`/`clients.claim`, ohne automatisches Neuladen.
4. **Neue Schicht `src/sw/`**: importiert nur reine Domänenhilfen (ohne Zod) und ab Stufe 2 `src/data/device-store.ts`. Nur das Build-Plugin referenziert sie.
5. **Registrierung und Geräte-APIs** (`navigator.serviceWorker`, `beforeinstallprompt`, `display-mode`, App-Badge) nur in `src/data/pwa.ts`. Auch dieser Kern lädt lazy nach `load` aus `assets/app/` (eigenes Budget). Im Start-Bundle steht nur das `import()`. Biome sperrt `indexedDB`, `caches`, `Notification` und `PushManager` in `src/ui`.
6. **Offline-Stand sichtbar**: Antworten aus dem Cache tragen `X-Zp-Cache: offline`, die Statuszeile sagt „Offline – Stand vom …“. `site.json` liegt schon nach dem ersten Besuch im Precache.
7. **Frische in der installierten App**: Beim Zurückkehren nach 30 Min. oder beim Wieder-online-Gehen prüft die App zuerst auf einen neuen Service Worker und lädt dann neu, sonst tauscht sie die Daten. Lädt dabei die Wegzeit-Tabelle neu, kommt `linien.json` mit; alte Linien passen über die Kennung nicht mehr (Plan 0012, E6).
   - Eine geladene Wegzeit-Tabelle lädt dabei mit. Das ist eine Ausnahme von „höchstens einmal je Sitzung“ (Plan 0009).
   - Der Request ist für alle gleich, die Invariante aus ADR 0011 gilt weiter.
8. **ICS-Links** bleiben reine Netz-Requests. Offline antwortet der Service Worker mit 204, und die App zeigt einen Hinweis. Eine Fehlerseite ohne Zurück-Knopf gibt es in der iOS-App nicht.
9. **E2E blockiert Service Worker standardmäßig.** Eigene Specs prüfen Offline, Caching und LCP mit Service Worker in Chromium. WebKit prüft der Browser-Review auf echten Geräten.

## Alternativen

- **`vite-plugin-pwa`/Workbox:** fertig und verbreitet, aber mehrere Abhängigkeiten und generiertes Verhalten für fünf Routen. ADR 0001 nimmt Bibliotheken erst auf, wenn sie gebraucht werden.
- **Cache zuerst für Daten** (stale-while-revalidate): schnellerer Start, aber man sieht nach einem Deploy zunächst den alten Stand. Für eine Terminliste ist Frische wichtiger.
- **Nur Manifest, kein Service Worker:** installierbar auf Android und iOS, aber offline unbrauchbar, und Stufe 2 (Push) bräuchte ihn ohnehin.
- **Modul-Service-Worker mit geteilten Chunks:** kleinere Dateien, aber in Firefox nicht überall unterstützt, und er koppelt sich an die Chunk-Aufteilung der App.

## Konsequenzen

- Ein Service Worker kann einen alten Stand festhalten. Gegenmittel sind Netz zuerst, `cache: "reload"` im Precache und ein dokumentierter Notausgang (selbst abmeldender `sw.js`).
- Zwei weitere Budgets (`Service Worker`, `App-Extras JS (lazy)`) und ein zweiter `tsc`-Lauf (`lib: webworker`).
- Die Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“ (ADR 0011) und die Kamera-Regel (ADR 0008) bleiben unverändert.
