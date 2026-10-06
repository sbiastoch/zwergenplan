# ADR 0013 – Installierbare App und eigener Service Worker

Status: angenommen (2026-10-05, mit Stufe 1 von Plan 0011, Schritt 5). Ergänzt ADR 0002 und die Bootstrap-Regel in `docs/architecture.md`. Details stehen in Plan 0011 (E2–E7), Abweichungen der Umsetzung dort unter „Umsetzung“.

## Kontext

- Familie und Freunde öffnen den Zwergenplan fast nur auf dem Handy. Ohne Manifest gibt es kein eigenes Icon und keinen Vollbild-Start. Ohne Netz bricht die Seite mit „Keine Verbindung“ ab.
- `docs/architecture.md` erlaubt Daten- und Gerätezugriff außerhalb von `src/data` nur per ADR. Ein Service Worker cacht Antworten und beantwortet Requests der Seite. Das ist ein solcher Zugriff.
- Das Start-JS liegt am Budget (90 kB gzip, seit ADR 0012 92 kB; seit Plan 0019 100 kB, Nachtrag in ADR 0012). Neue Logik im Start-Bundle braucht einen Grund.

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
- Umgesetzt mit zwei Präzisierungen (Plan 0011, „Umsetzung“):
  - Die Precache-Liste enthält zusätzlich den PWA-Kern (`assets/app/pwa-*.js`). Jeder Start lädt ihn nach `load`; ohne ihn liefen offline weder die Frische (Punkt 7) noch der ICS-Hinweis (Punkt 8).
  - Der Abschnitt „Als App“ bekommt den Installationszustand vom Lader als Prop, statt `src/data/pwa.ts` statisch zu importieren. Ein statischer Import zwischen zwei Lazy-Chunks lässt Vite einen Preload-Helfer in den Einstieg schreiben (+0,11 kB Start-JS).
- Nach dem Arch-Review (Plan 0011, „Arch-Review (Stufe 1)“):
  - Die Precache-Liste enthält auch den Export-Code (jeder Start lädt ihn im Leerlauf vor).
  - Text und Zweig der Zeile „Offline – Stand vom …“ liegen im PWA-Kern statt im Start-Bundle. Die Zeile erscheint erst nach `load`.
  - Notausgang zur Build-Zeit (`ZWERGENPLAN_SW=aus`): ein selbst abmeldender Service Worker statt einer Anleitung zum Umschreiben.
- Gemessen (Stand nach dem Arch-Review): Start-JS 91,34 kB statt 90,90 kB (+0,44 kB, Ziel ≤ 91,40 kB), `Service Worker` 1,5 kB, `App-Extras JS (lazy)` 2,5 kB. Zusammen mit Plan 0012: 91,72 kB (ADR 0012, Nachtrag).
- Mit Plan 0012: Regel 5 (`oepnv`) gilt für `wegzeit.json` und `linien.json`, beide nur im Laufzeit-Cache, nie im Precache. Beim Frische-Anlass bleiben Tabelle und Linien zusammen, bis die neuen da sind, auch wenn das Neuladen scheitert.

## Nachtrag (2026-10-06): Wochen-Push (Plan 0017, ADR 0014)

- **Punkt 5 geändert durch ADR 0014 (Punkt 6):** `src/data/push.ts` liest `navigator.serviceWorker.getRegistration()` und im Tipp-Handler `ready` selbst, nur lesend für `pushManager`. Registrieren, aktualisieren und auf Nachrichten hören bleibt allein `src/data/pwa.ts`. Grund: Eine Injektion über den Lader kostete Start-JS (Plan 0017, E9).
