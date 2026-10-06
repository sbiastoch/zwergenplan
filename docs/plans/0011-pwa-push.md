# Plan 0011 – Installierbare App und Push zu neuen Angeboten

Status: Review 1 und 2 eingearbeitet, freigegeben, Nutzerfragen beantwortet (2026-10-05). Spike (Schritt 0) erledigt, Ergebnis eingearbeitet (2026-10-05). **Stufe 1 live seit `b23eb6c`** (https://zwergenplan.app/, `data/meta.json`); Icon abgenommen; Arch-Review „Freigabe mit Änderungen“ eingearbeitet (Abschnitt „Arch-Review (Stufe 1)“). **Browser-Review live im Browser (Schritt 6, 2026-10-06): bestanden bis auf einen Fehler** – die Statuszeile „Offline – Stand vom …“ fehlte live fast immer (Befund B1, **behoben in `fb5059b`, live bestätigt 2026-10-06: 10 von 10 Offline-Starts zeigen die Zeile, vorher 2 von 30**), dazu Hinweise; siehe Abschnitt „Browser-Review live (Stufe 1, Schritt 6, 2026-10-06)“. **Geräteprüfung bestanden** (2026-10-06, alle 8 Punkte vom Nutzer bestätigt) – **Stufe 1 abgenommen.** Stufe 2 in Arbeit; Budget-Entscheidung siehe „Stufe 2“ unter „Schritte“.
Datum: 2026-10-05
Bezug:
- **ADR 0013** (PWA und Service Worker, Entwurf `docs/adr/0013-pwa-service-worker.md`) und **ADR 0014** (Web Push, Entwurf `docs/adr/0014-web-push.md`).
- ADR 0002 (statisches Hosting, Datenfluss), ADR 0008 (keine fremden Kacheln cachen), ADR 0009 (Domain), ADR 0011 (Wegzeit-Tabelle).
- Plan 0008 E4 (Frühstart von `site.json`), Plan 0009 E10 (Entscheidungspunkt Start-JS).
- **Plan 0010 vollständig** (Paket 0 und die Pakete A/B, Branch `anbieter-0010`) ist Voraussetzung (E5). Beide Pläne ändern `route.ts`, `KidSheet.tsx`, `vite.config.ts` und das Start-Budget. Plan 0010 hält „ADR 0012“ als letzten Ausweg fürs Budget frei, deshalb nutzt dieser Plan die Nummern 0013 und 0014.
- Die Pläne 0001, 0003 und 0006 haben PWA und Service Worker jeweils als „eigener Plan“ zurückgestellt. Das ist dieser Plan.

## Ziel

Der Plan hat zwei Stufen. Jede Stufe wird für sich deployt und reviewt.

**Stufe 1 – installierbare App (PWA)**
- Der Zwergenplan lässt sich auf Android (Chrome), iPhone (Safari, „Zum Home-Bildschirm“) und am Desktop installieren. Er startet dann ohne Browserleiste, mit eigenem Icon und Namen.
- Ein Service Worker hält die App-Schale (HTML, Start-JS, CSS, Schrift) und den zuletzt geladenen Datenstand vor. Offline öffnet die App mit dem letzten Stand und dem Hinweis „Offline – Stand vom …“, statt mit einem Ladefehler abzubrechen.
- Online bleibt alles wie heute: Die Daten kommen frisch aus dem Netz, LCP und CLS halten die Gates.
- Eine installierte App, die tagelang im Speicher bleibt, holt beim Zurückkehren selbst den neuen Stand (E4a).
- Im Kind-Sheet gibt es einen Abschnitt „Als App“ mit Installationshilfe: auf Android über den Browser-Dialog, auf dem iPhone mit einer kurzen Anleitung.

**Stufe 2 – Push bei neuen Angeboten**
- Wer möchte, schaltet im Kind-Sheet „Benachrichtigen bei neuen Angeboten“ ein. Nach jedem Deploy mit neuen Angeboten kommt **eine** Benachrichtigung aufs Gerät.
- Ein **einziges Payload-Format** für alle Browser: **Declarative Web Push** (`"web_push": 8030`). Safari ab iOS/iPadOS 18.4 und macOS 15.5 zeigt die Nachricht ohne Service Worker an. Chrome, Edge, Firefox und ältere Safari-Versionen bekommen ein klassisches `push`-Event, der Service Worker liest dasselbe JSON und zeigt die Nachricht selbst an.
- **Persönlich zugeschnitten wird nur auf dem Gerät.** Der Absender kennt kein Alter und keinen Stadtteil. Er schickt einen allgemeinen Text („7 neue Angebote im Zwergenplan“) mit `"mutable": true`. Der Service Worker ersetzt ihn, wenn er kann, durch einen persönlichen („3 neue Angebote passen zu 14 Monaten“). Scheitert er oder gibt es nichts zuzuschneiden, bleibt der allgemeine Text.
- Ein Tipp auf die Nachricht öffnet die App mit den neuen Angeboten (`/?neu`).
- Der Absender ist so klein wie möglich: Ein Cloudflare Worker speichert nur die Push-Anmeldungen. Gesendet wird aus der CI nach einem erfolgreichen Deploy (ADR 0014).

## Nicht-Ziele

- **Periodic Background Sync** oder Background Fetch: läuft nicht auf iOS und nicht in Firefox. Push ersetzt das.
- Push für anderes als neue Angebote („Anmeldung öffnet“, „Kurs morgen“, Merkliste). Der Eintrag „Erinnerung ‚Anmeldung öffnet‘“ steht schon in `docs/ideas.md`.
- Zuschnitt nach **Wegzeit oder Stadtteil** in der Benachrichtigung. Dafür bräuchte der Service Worker `wegzeit.json` und die Wegzeit-Logik. Stufe 2 schneidet nur nach Alter zu. → `docs/ideas.md` (Schritt 12).
- Eine allgemeine „Neu“-Markierung für alle ohne Push-Abo. → `docs/ideas.md` (Schritt 12).
- Offline-Karte, Vorab-Laden des Karten-Chunks, Cachen fremder Kacheln (ADR 0008, `docs/ideas.md`).
- Offline-Download von ICS-Dateien.
- Mehrere Kinder je Gerät, Push-Konten, Synchronisierung zwischen Geräten.
- Workbox oder `vite-plugin-pwa` (E3).
- Service Worker unter `pnpm dev`. Er wird nur im Produktions-Build registriert (`import.meta.env.PROD`).

## Ausgangslage

- **Kein Manifest, kein Service Worker, keine Icons.** Es gibt keinen Ordner `public/`, nur die generierten `public/data/` und `public/ics/` (gitignored). `index.html` hat weder Favicon noch `apple-touch-icon`.
- `index.html` startet zwei Inline-Skripte (Plan 0008, E4): den Frühstart von `data/site.json` (`window.__zpSite`) und die Darstellung vor dem ersten Paint. Weitere Inline-Skripte brauchen eine Begründung (`docs/architecture.md`, Bootstrap). Dieser Plan fügt **keines** hinzu.
- Einstellungen liegen nur im `localStorage` (`src/data/preferences.ts`). **Ein Service Worker kann `localStorage` nicht lesen.**
- Datenbuild: `scripts/build-data.ts` schreibt `public/data/site.json` (`SiteData`: `generatedAt`, `offers[]` mit stabilen IDs nach ADR 0003/0006), `meta.json` (`offers`, `providers`, `generatedAt`, `commit` aus `git rev-parse --short HEAD`), `wegzeit.json` und `ics/**`.
- CI (`.github/workflows/ci.yml`): `check` → `e2e` → `deploy` (GitHub Pages über `actions/deploy-pages`, nur `main`). Auf `main` vergleicht `pnpm data:validate --against-deployed` den neuen Bestand mit dem Live-Stand. Die Concurrency-Gruppe je Ref bricht Push-Läufe nicht ab, zwei Läufe auf `main` laufen also nacheinander.
- Die Pipeline läuft lokal, committet auf `main` und pusht (ADR 0002). Jeder Pipeline-Lauf mit neuen Angeboten löst genau einen CI-Lauf mit Deploy aus.
- **Budgets:**
  - `JS (initial)` 90 kB gzip, gezählt über `dist/assets/*.js`, also über jedes JS direkt im Ordner `assets/`, auch Lazy-Chunks.
  - Stand nach Plan 0009: **89,80 kB** (Plan 0009, Arch-Review, Messung).
  - Plan 0010 senkt mit Paket 0 auf ≤ 87,7 kB vor und ≤ 89,0 kB nach seiner UI und führt einen **Chunk-Wächter** ein: Direkt in `dist/assets/` liegt genau eine JS-Datei.
  - Lazy-Chunks bekommen eigene Ordner und Budgets (`assets/karte/`, `assets/oepnv/`, bei Plan 0010 `assets/anbieter/`).
- Playwright: Projekte `android-klein`, `pixel-7`, `iphone-15` (WebKit), `pixel-7-quer`, `desktop`, dazu seriell `smoke-echte-daten`.
  - Die Uhr der Seite ist eingefroren (`e2e/fixtures.ts`, `page.clock.setFixedTime`, 5.10.2026 12:00 Berlin). Sie gilt **nicht** im Service Worker.
  - Der Drittanbieter-Wächter macht jeden Request an einen fremden Origin rot, auch wenn er per `context.route` gemockt ist. Ausnahme ist der Kachel-Mock (`tiles: "mock"`).
- Gates, die heute **nur** `src/`, `scripts/`, `e2e/` und `.claude/hooks/` sehen: Vitest-Include (`vitest.config.ts`), dependency-cruiser (`DIRS` in `scripts/check-architecture.ts`), `tsc -p .` (`tsconfig.json`), knip.
- Routen-Zustand: `src/domain/route.ts` parst die URL, `src/ui/use-app-state.ts` schreibt sie per `replaceState` neu (`urlFor`). Unbekannte Parameter gehen dabei verloren.
- Das Kind-Sheet (`src/ui/KidSheet.tsx`, „Dein Zwerg“) liegt im Start-Bundle und enthält Geburtsdatum, Startpunkt und „Darstellung“.

### Declarative Web Push (Stand der Recherche, 2026-10-05, ergänzt im Review)

Quellen:
- [WebKit-Blog „Meet Declarative Web Push“](https://webkit.org/blog/16535/meet-declarative-web-push/)
- [WebKit-Explainer](https://github.com/WebKit/explainers/blob/main/DeclarativeWebPush/README.md)
- [Push API (W3C Editor's Draft)](https://w3c.github.io/push-api/), dort ist Declarative Push inzwischen spezifiziert
- [Pushpad](https://pushpad.xyz/blog/declarative-web-push)

Stand:
- Payload: `{"web_push": 8030, "notification": {"title", "body"?, "navigate", "lang"?, "dir"?, "silent"?, "tag"?, "data"?, "app_badge"?}, "mutable"?: bool}`. `title` und `navigate` sind Pflicht, `mutable` steht auf oberster Ebene.
- Der Parser der Push-API-Spec erkennt die Payload an `web_push == 8030`. Einen `Content-Type` prüft er nicht.
- Verfügbar ab iOS/iPadOS 18.4 und macOS 15.5. `window.pushManager` erlaubt ein Abo ohne Service Worker. Ist ein Service Worker registriert, teilen beide dasselbe Abo.
- Mit `mutable: true` bekommt ein vorhandener Service Worker das `push`-Event. `PushEvent.notification` (Typ `Notification?`) trägt die vorgeschlagene Nachricht. Zeigt der Service Worker selbst eine an, ersetzt sie die vorgeschlagene. Sonst oder bei einem Fehler erscheint die deklarative Fassung. **Keine Strafe für stille Pushes**, weil immer etwas angezeigt wird.
- Browser ohne Unterstützung behandeln das JSON als gewöhnliche Payload und feuern das klassische `push`-Event (`event.data`). Der Service Worker muss die Nachricht dann selbst anzeigen (`userVisibleOnly`).
- Chromium hat im April 2025 ein „Intent to Prototype“ veröffentlicht, ausgeliefert ist dort nichts. Firefox unterstützt es nicht. Für beide bleibt der klassische Weg, mit derselben Payload.
- **Im Spike (Schritt 0) zu prüfen:**
  - (a) ob iOS Push weiterhin nur für Apps auf dem Home-Bildschirm erlaubt (angenommen: ja);
  - (d) wie lange der Service Worker auf iOS für den Zuschnitt Zeit hat;
  - (e) was iOS zeigt, wenn der Service Worker wirft;
  - (f) ob der Ersatz mit `mutable: true` so funktioniert wie beschrieben;
  - (g) ob `app_badge` ankommt;
  - (h) ob die Home-Bildschirm-App auf iOS einen eigenen Speicher hat, getrennt von Safari ([WebKit Bug 181849](https://bugs.webkit.org/show_bug.cgi?id=181849)). Dann fehlen dort Geburtsdatum, Merkliste und Stadtteil aus Safari;
  - (i) ob `pushManager.subscribe` nach `await Notification.requestPermission()` auf iOS noch als Nutzeraktion gilt;
  - (j) ob `WindowClient.navigate` und die Option `navigate` in `showNotification` auf iOS wirken.

  Die Antworten stehen unter „Spike-Ergebnis“.

## Spike-Ergebnis (2026-10-05)

Gemessen auf einem iPhone mit iOS 26.5.2 (UA `iPhone OS 18_7 … Version/26.5.2`), Spike-Seite als Home-Bildschirm-App, Wegwerf-Worker auf `workers.dev`, Versand lokal mit `web-push`. Der Code liegt auf dem Branch `spike-push-0011` (`spike/push/`), nicht auf `main`. Seite und Service Worker haben jede Beobachtung in ein Protokoll geschrieben, die Anzeige hat der Nutzer per Screenshot bestätigt, zusätzlich `registration.getNotifications()`.

| Punkt | Ergebnis |
|---|---|
| (a) Push nur als Home-Bildschirm-App | **Ja.** Im Safari-Tab gibt es `Notification` gar nicht (`ReferenceError`), `PushManager` schon. Erst die installierte App hat `Notification`, `window.pushManager` und einen Push-Dienst (`web.push.apple.com`). |
| `event.notification` / `event.data` | `event.notification` ist bei `mutable: true` gesetzt (`Notification` mit `title`, `body`, `tag`, `lang`, `navigate`, `data`). **`event.data` ist `null`.** Die Payload kommt auf iOS also nur über `event.notification`. |
| (d) Zeit für den Zuschnitt | **≈ 10 s**, dann beendet iOS den Service Worker (Lebenszeichen bis 10,2 s, danach nichts). Der realistische Zuschnitt (`site.json` von zwergenplan.app mit `no-cache`, Geburtsdatum aus IndexedDB, Nachricht anzeigen) brauchte **0,3 s**. |
| Zeit überschritten | **Gar keine Nachricht**, auch nicht die deklarative. Die nächsten Pushes an das Gerät kamen danach **bis zu 10 Min. verspätet** (Latenz 216 s und 575 s statt 1–5 s). Das Abo blieb gültig (201, keine Entziehung). |
| (e) Service Worker wirft | Synchron wie asynchron (`waitUntil` mit abgelehntem Promise): iOS zeigt die **deklarative Fassung**. |
| (f) Ersetzen mit `mutable: true` | **Funktioniert.** `showNotification` im `push`-Handler ersetzt die vorgeschlagene Nachricht, keine Dublette. |
| (g) `app_badge` | **Wirkt nicht** (Kennzeichen in den Einstellungen an). `navigator.setAppBadge` aus der Seite wirkt. `setAppBadge` im Service Worker kam nie zurück, der Lauf endete ohne Nachricht (wie „Zeit überschritten“). Später zeigte das Icon die Zahl der Mitteilungen (11); ob iOS die selbst setzt, ist offen. |
| (h) Eigener Speicher der App | **Ja.** Eine in Safari gesetzte Marke (`localStorage` und IndexedDB) fehlt in der App. |
| (i) `subscribe` nach `await Notification.requestPermission()` | **Funktioniert** (`granted`, Abo angelegt). |
| (j) Navigation per Tipp | `navigate` der deklarativen Nachricht und die Option `navigate` in `showNotification` öffnen die App mit der jeweiligen URL. **Ohne `navigate` lehnt iOS `showNotification` ab** (`TypeError: … did not include NotificationOptions that specify a valid defaultAction url`), dann erscheint die deklarative Fassung. `notificationclick` wird auf iOS also nicht gebraucht. |
| `tag` | Nachrichten mit gleichem `tag` **ersetzen sich nicht**, sie stapeln sich. |
| `Topic`-Header | Apple antwortet auf `topic: "neue-angebote"` (13 Zeichen) und `"spike"` (5) mit **400 `BadWebPushTopic`**, auf `"neueangebote"` (12) mit 201. Apple dekodiert das Topic offenbar als Base64url, die Länge muss ein Vielfaches von 4 sein. |
| nicht `mutable` | Der Service Worker wird nicht geweckt, die deklarative Nachricht erscheint. |

Folgen, eingearbeitet in E7, E10, E11 und Risiken:
- Das Zeitlimit im Service Worker ist **Pflicht mit Abstand**: Alles im `push`-Handler endet nach spätestens 5 s, auch ein hängendes Promise. Sonst kostet es die Nachricht und verzögert die nächsten.
- Kein `setAppBadge` im Service Worker.
- `navigate` in jedem `showNotification`.
- Topic `neueangebote`.
- Hinweis „Die App startet leer“ in der Installationshilfe ist fest.

## Entscheidungen

### E1 – Zwei Stufen, Stufe 1 ohne neue Infrastruktur

- Stufe 1 braucht keinen Server und kein Konto. Sie bringt aber Cache- und Datenzugriff außerhalb von `src/data` (Service Worker), und das verlangt ein ADR (`docs/architecture.md`, Bootstrap-Regel). Dafür steht **ADR 0013**, angenommen in Schritt 5.
- Stufe 1 geht zuerst live und wird per `/browser-review live` abgenommen.
- Stufe 2 beginnt erst danach, auf derselben Service-Worker-Basis, mit **ADR 0014**, angenommen in Schritt 11. So bleibt bei Problemen mit Push wenigstens die installierbare App.

### E2 – Manifest und Icons

- `public/manifest.webmanifest`:
  - `name` und `short_name` „Zwergenplan“, `lang: "de"`;
  - `start_url: "./"`, `scope: "./"`, `id: "./"`, also relativ zum Manifest, damit `BASE` (`site.config.ts`) die einzige Pfadquelle bleibt;
  - `display: "standalone"`;
  - `background_color` und `theme_color` aus den hellen Tokens (`#e8f1ff` wie die heutige `theme-color`). Der Android-Splash ist deshalb auch im Dunkelmodus hell. Hingenommen, weil das Manifest keine Farbe je Farbschema kennt. Prüfpunkt im Browser-Review.
  - `icons`: 192 und 512 px (`purpose: "any"`) sowie 512 px `maskable`.
- `index.html` bekommt `<link rel="manifest">`, `<link rel="icon">` (SVG) und `<link rel="apple-touch-icon">` (180 px PNG, **deckend**, ohne Transparenz, sonst setzt iOS Schwarz dahinter). Das sind nur Tags, kein Inline-Skript.
- Die Icon-Quelle ist **eine SVG** im Stickerheft-Stil (Plan 0003) in `design/icon.svg`.
  - Die PNGs erzeugt `node scripts/icons.ts` reproduzierbar: Playwright-Chromium rendert die SVG, `maskable` mit 10 % Schutzzone. Die PNGs werden committet, wie Schrift-Assets.
  - Ein neues npm-Paket gibt es dafür nicht.
- Der Entwurf des Icons ist ein **Nutzer-Abnahmepunkt** (Schritt 2): Screenshot der Icons auf hellem und dunklem Home-Bildschirm.

### E3 – Eigener kleiner Service Worker statt `vite-plugin-pwa`

- **Gewählt:** `src/sw/sw.ts` (rund 150 Zeilen) plus ein Vite-Plugin `scripts/vite-sw.ts`.
  - Das Plugin baut den Service Worker nach dem App-Bundle als einzelne IIFE-Datei `sw.js` im Wurzelpfad, ungehasht. GitHub Pages liefert `max-age=600`. Browser prüfen das Skript eines Service Workers beim Update ohnehin am HTTP-Cache vorbei.
  - Per `define` setzt es `__PRECACHE__`: die Liste der Start-Assets. Das sind `index.html`, der Entry-Chunk mit seinen statischen Imports, das Start-CSS und die Latin-woff2 der Schrift. Lazy-Chunks in Unterordnern von `assets/` gehören nicht dazu.
  - Außerdem `__SW_VERSION__`: Hash über die Precache-Liste **und den Inhalt von `index.html`**, denn die Inline-Skripte können sich ändern, ohne dass sich ein Asset-Name ändert.
  - Ein Unit-Test des Plugins prüft gegen ein Mini-Bundle, dass das Entry-Skript aus `index.html` in der Liste steht und kein Lazy-Chunk.
- Das Plugin läuft für `dist/` und für `dist-e2e/`.
- **Abgelehnt:**
  - `vite-plugin-pwa`/Workbox: mehrere Abhängigkeiten für ein Regelwerk aus fünf Routen. ADR 0001 nimmt Bibliotheken erst auf, wenn sie gebraucht werden („Motion kommt erst, wenn sie gebraucht wird“). Hier reicht eigener Code, der in die Budgets passt.
  - Modul-Service-Worker mit geteilten Chunks: Firefox unterstützt `type: "module"` für Service Worker nicht überall, und ein geteilter Chunk würde den Chunk-Wächter aus Plan 0010 verletzen.
- Eigener TypeScript-Kontext:
  - `src/sw/tsconfig.json` mit `lib: ["es2023", "webworker"]`.
  - Im Haupt-`tsconfig.json` wird `src/sw` ausgeschlossen, denn `dom` und `webworker` vertragen sich nicht.
  - `check:fast` bekommt den Schritt „Typen SW“.

### E4 – Caching-Regeln des Service Workers

Alle Pfade werden relativ zu `registration.scope` gebildet, nie mit festem `/`. Die Regeln werden **in dieser Reihenfolge** geprüft, die erste passende gilt. Pfadregeln stehen also vor der Navigationsregel, und `routes.test.ts` prüft die Reihenfolge.

| # | Anfrage | Strategie | Begründung |
|---|---|---|---|
| 1 | fremde Origins (Kacheln, Push-Worker) | Service Worker greift **nie** ein | ADR 0008: keine fremden Kacheln cachen |
| 2 | `ics/**` (auch als Navigation, die Links im Detail sind einfache `<a href>`, `DetailDialog.tsx`) | Netz. Offline bzw. bei Netzfehler: Antwort **204** (die Seite bleibt stehen) und `postMessage({ type: "ics-offline" })` an den Client, `src/data/pwa.ts` meldet das der App, Toast „Kalender-Datei braucht Netz“ | Die iOS-App hat keinen Zurück-Knopf; eine Fehlerseite wäre eine Sackgasse |
| 3 | `assets/**` (gehasht, unveränderlich) | Cache zuerst, sonst Netz und in `zp-assets` ablegen | Unveränderlich. Lazy-Chunks landen beim ersten Laden im Cache, werden aber nicht vorab geladen |
| 4 | `data/site.json` | Netz zuerst (`cache: "no-cache"`); gibt es eine Kopie in `zp-data`, nach **5 s** (Funkloch) oder bei Netzfehler die Kopie | Frische Daten. Den Frühstart-Request aus `index.html` sieht der Service Worker ebenfalls |
| 5 | `data/wegzeit.json`, `data/linien.json` (Plan 0012) | Netz zuerst, offline der Cache | Wie `site.json`. Das 8-s-Zeitlimit in `src/data/transit.ts` bleibt maßgeblich (die Linien haben ein eigenes) |
| 6 | Navigation auf die App (`./`, `./index.html`, jeweils mit beliebiger Query) | **Navigation Preload** an; Netz zuerst (Preload-Antwort), nach **3 s** oder offline die vorgehaltene `index.html`. Beim Ausweichen `event.waitUntil(event.preloadResponse)`, sonst warnt die Konsole | Online immer die aktuelle Version, ohne den Start des Service Workers in den LCP zu ziehen; offline die Schale |
| 7 | alles andere vom eigenen Origin (`data/meta.json`, `sw.js`, `manifest.webmanifest`, Icons, andere Navigationen) | nur Netz (Service Worker greift nicht ein) | `meta.json` ist für CI; Manifest und Icons prüft der Browser selbst |

- **Precache** im `install`:
  - `index.html` mit `new Request(url, { cache: "reload" })`, damit keine alte Seite aus dem HTTP-Cache zu einer neuen Asset-Liste passt. Gehashte Assets dürfen aus dem HTTP-Cache kommen.
  - Außerdem **`data/site.json` mit `cache: "reload"` in `zp-data`**. So öffnet die App auch offline, wenn sie nach dem ersten Besuch nie wieder online war, und beim ersten Start der Home-Bildschirm-App.
- Cache-Namen: `zp-shell-<version>`, `zp-assets`, `zp-data`.
- Beim `activate` werden alte `zp-shell-*`-Caches gelöscht.
- `zp-assets` hält höchstens 60 Einträge. Die ältesten fliegen raus, **nie** aber ein Eintrag, der in der aktuellen Precache-Liste steht.
- **Aktualisierung:** `skipWaiting()` und `clients.claim()`, **kein** automatisches Neuladen. Begründung: Gehashte Assets bleiben im Cache, eine offene Seite läuft mit ihrem alten Code weiter. Ein Lazy-Chunk, der weder im Cache noch auf dem Server liegt, scheitert heute schon nach jedem Deploy (bestehende Fehleranzeige in `Lazy.tsx`).
- **Offline-Hinweis:** Kommt `site.json` aus dem Cache, setzt der Service Worker den Antwort-Header `X-Zp-Cache: offline`. `loadSiteData` liefert dann zusätzlich `stale: true`. Die Statuszeile zeigt „Offline – Stand vom 5.10.“ (Text in `src/ui/format.ts`). Nur `src/data` liest den Header.

### E4a – Frischer Stand in der installierten App

- Eine installierte App hat auf iOS weder „Neu laden“ noch Pull-to-refresh und bleibt tagelang im Speicher.
- `src/data/pwa.ts` bekommt `watchFreshness(handlers)`. Ein **Frische-Anlass** liegt vor, wenn
  - die Seite wieder sichtbar wird (`visibilitychange`) und der letzte erfolgreiche Abruf älter als **30 Min.** ist, oder
  - das Gerät nach einem Offline-Abruf (`stale: true`) wieder `online` ist.
- Bei jedem Frische-Anlass:
  1. **Zuerst `registration.update()`.** Wird dabei ein neuer Service Worker aktiv (`controllerchange`), lädt die Seite neu (`location.reload()`). Das passiert nur hier, beim Zurückkehren zur App, nie mitten in einer Bedienung. So laufen Code und Daten nie in verschiedenen Ständen, etwa nach einer Schemaänderung.
  2. Sonst lädt `App` `site.json` neu (gleicher Lade-Weg, gleicher Request für alle) und tauscht die Daten ohne Layoutsprung aus.
  3. War die Wegzeit-Tabelle geladen, lädt `useTransit` sie **mit** neu (und damit `linien.json`, Plan 0012, E9; alte Linien verwirft die Kennung `id`/`table`), sonst würden neue Orte die Wegzeit bis zum Neustart auf die Luftlinie zurückwerfen (`App.tsx`, Prüfung auf neue Orte). Das ist eine Ausnahme von „höchstens einmal je Sitzung“ (`use-transit.ts`). Der Request ist für alle gleich und hängt nicht vom Startpunkt ab (ADR 0011). Festgehalten in `docs/architecture.md` (Absatz Wegzeit) und ADR 0013.
- Schwelle und Ablauf werden als Konstanten gesetzt und per Unit-Test mit Fake-Timern geprüft. E2E: Nach einem Frische-Anlass mit gesetztem Stadtteil bleibt die Wegzeit erhalten, und es gibt genau einen weiteren Request auf `wegzeit.json` und genau einen weiteren auf `linien.json` (Plan 0012).

### E5 – Start-Bundle: fast nichts, alles andere lazy (Entscheidungspunkt)

- **Voraussetzung:** Plan 0010 ist vollständig auf `main` (Paket 0 und Pakete A/B, mit Chunk-Wächter). Vor Schritt 1 wird `JS (initial)` auf `main` gemessen und als `X` hier notiert. Plan 0010 zielt auf X ≤ 89,0 kB.
- **Im Start-Bundle** steht nur `src/data/pwa-start.ts`: nach `load` ein `import("./pwa.ts")` (nur im Produktions-Build), dazu das Lesen von `X-Zp-Cache` in `site.ts` (E4), das Flag `neu` in `route.ts` (E13), der Lader `src/ui/AppExtras.tsx` und eine Prüfung „Push an?“ (`localStorage`), die bei Bedarf `import("./push-start.ts")` auslöst.
- **Lazy, ohne React, Ordner `assets/app/`:**
  - `src/data/pwa.ts`: Registrierung, Listener für `beforeinstallprompt`, `installState()`, `watchFreshness` (E4a), Nachrichten des Service Workers (`ics-offline`).
  - `src/data/push-start.ts` (Stufe 2, nur bei Push an): `seenIds` aktualisieren, Badge leeren, Endpoint-Abgleich (E12).
  - `src/data/push.ts` (Abo) und `src/data/device-store.ts`.
  - Der Listener für `beforeinstallprompt` hängt erst nach `load`. Chrome feuert das Event meist danach. Geht es doch verloren, bleibt auf Android das Browser-Menü „App installieren“, und der Abschnitt zeigt dann einen Hinweis darauf statt des Knopfs (E7). Das ist bewusst günstiger als ein Listener im Start-Bundle.
- **Lazy, mit React, Ordner `assets/app/`:** `src/ui/app-extras/AppSection.tsx` (beim Öffnen des Kind-Sheets) und `src/ui/app-extras/NewsBlock.tsx` mit `src/domain/news.ts` (nur bei `neu`).
- Budget `App-Extras JS (lazy)`: `dist/assets/app/*.js`, 5 kB gzip.
- **Geschätzter Zuwachs im Start** (gzip, je Teil, gemessen in Schritt 3 und 10):

  | Teil | Stufe | Schätzung |
  |---|---|---|
  | `pwa-start.ts` (`load` → `import()`) | 1 | 0,08 kB |
  | `X-Zp-Cache` → `stale`, Text „Offline – Stand vom …“ | 1 | 0,10 kB |
  | Lader `AppExtras.tsx` (zwei `lazy()`-Einstiege, Fehlerzustand mit `className`) | 1 | 0,12 kB |
  | Frische-Anlass → Neuladen in `App` (Callback) | 1 | 0,05 kB |
  | Flag `neu` in `parseRoute`/`routeToSearch` | 2 | 0,03 kB |
  | Platzhalter für `NewsBlock`, „Push an?“ → `import("./push-start.ts")` | 2 | 0,07 kB |
  | **Summe** | | **≈ 0,45 kB** |

- **Entscheidungspunkt** nach Schritt 3 und nach Schritt 10: Ziel `JS (initial)` ≤ X + 0,5 kB und ≤ 89,5 kB. (Seit dem Arch-Review Stufe 1: Die Budget-Entscheidung für Stufe 2 fällt **vor Schritt 9**, siehe „Stufe 2“ unter „Schritte“.)
  - Liegt es darüber, ist der erste Kandidat zum Auslagern der Offline-Text samt `stale`-Zweig: Er wandert nach `pwa.ts`, das die Statuszeile per Callback setzt (≈ 0,08 kB).
  - Der zweite Kandidat ist der Platzhalter von `NewsBlock`: Statt seiner hält die Liste bei `neu` kurz zurück (gleiche Mechanik wie `ListPending`, Plan 0009).
  - Über 90 kB ist Schluss: kein Anheben des Budgets. Dann gibt es eine Rückfrage an den Nutzer, welche Start-Funktion stattdessen lazy wird.
- **Chunk-Wächter und React-Abspaltung:** Plan 0010 hat gemessen, dass ein Lazy-Chunk mit React React in einen eigenen Start-Chunk abspalten kann (+3,16 kB). **Vor Schritt 4** läuft deshalb eine Stub-Probe: `AppSection` als leere Komponente, `vite build`, Chunk-Wächter und `pnpm size`. Spaltet sich etwas ab, gilt dieselbe Abhilfe wie in Plan 0010 (`manualChunks`/`advancedChunks`), bevor Inhalt dazukommt.
- `vite.config.ts`: Prädikat `isAppExtrasModule(id)` = `/src/ui/app-extras/`, `/src/data/(pwa|push|push-start|device-store)\.ts$`, `/src/domain/news\.ts$` → `assets/app/[name]-[hash].js`, eingeordnet wie `isMapModule` und `isTransitModule`.

### E5b – Architekturregeln und Schichten

- Geräte-APIs haben je einen festen Ort:
  - `src/data/pwa.ts` (lazy) ist der einzige Ort für `navigator.serviceWorker`, `beforeinstallprompt`, `display-mode` und das App-Badge (`setAppBadge`/`clearAppBadge`).
  - `src/data/push.ts` (lazy) ist der einzige Ort für `PushManager` und `Notification`.
  - Beide haben eine injizierbare API wie `geolocation.ts`.
- **`serviceWorkers: "block"` in Playwright** ersetzt `register` durch eine async-Funktion, die nur warnt und `undefined` liefert, und `navigator.serviceWorker.ready` löst dann nie auf. `pwa.ts` und `push.ts` kommen mit `undefined` zurecht und warten **nie** unbegrenzt auf `ready` (Zeitlimit 3 s, dann `pushSupport() = "kein-sw"`). Unit-Test für genau diesen Fall.
- Neue Schicht `src/sw/`:
  - darf `src/domain` (reine Hilfen ohne Zod) und `src/data/device-store.ts` importieren, nichts aus `src/ui` und nichts sonst aus `src/data`;
  - nichts außer `scripts/vite-sw.ts` referenziert `src/sw`.
- **dependency-cruiser**, ausgeschrieben mit `from`/`to` wie in Plan 0010 (E7):

  | Regel | from | to | Art |
  |---|---|---|---|
  | `sw-isolated` | `^src/sw/` | alles außer `^src/domain/`, `^src/data/device-store\.ts$`, `^src/sw/` | verboten |
  | `sw-not-imported` | alles außer `^scripts/vite-sw\.ts$` | `^src/sw/` | verboten |
  | `no-zod-in-sw` | `^src/sw/` | `zod` (auch transitiv) | verboten |
  | `app-extras-ui-only-lazy` | `^src/` außer `^src/ui/app-extras/` | `^src/ui/app-extras/` | nur `import()`, auch Typen nicht statisch |
  | `app-extras-ui-entry-only` | alles außer `^src/ui/AppExtras\.tsx$` | `^src/ui/app-extras/` | verboten |
  | `app-data-only-lazy` | `^src/(ui\|data)/` außer `^src/ui/app-extras/` und den Lazy-Modulen selbst | `^src/data/(pwa\|push\|push-start\|device-store)\.ts$` | nur `import()` |
  | `news-not-in-start` | `^src/(ui\|data)/` außer `^src/ui/app-extras/` | `^src/domain/news\.ts$` | verboten (erlaubt aus `src/sw`, `scripts`, `src/ui/app-extras`) |
  | `push-worker-isolated` | `^push-worker/` | `^src/` außer `^src/domain/push-(payload\|types)\.ts$` | verboten |
  | `web-push-only-in-push-send` | alles außer `^scripts/push-send\.ts$` | `web-push` | verboten |

  `scripts/check-architecture.ts`: `LAZY_LOADERS` um `["src/ui/AppExtras.tsx", "./app-extras/"]`, `["src/data/pwa-start.ts", "./pwa.ts"]`, `["src/data/pwa-start.ts", "./push-start.ts"]` und `["src/data/preferences.ts", "./device-store.ts"]` ergänzen. `DIRS` um `push-worker`.
- **Biome `noRestrictedGlobals` für `src/ui` und `main.tsx`** um `indexedDB`, `caches`, `Notification` und `PushManager` ergänzen (heute nur `navigator`, `localStorage`, `fetch`, `__zpSite`). So prüft das Gate „einziger Ort“, nicht nur der Review.
- **Kanarienvögel (ADR 0004)** für jedes neue Gate: je Regel oben ein absichtlicher Verstoß, je Budget eine aufgeblähte Datei, je `tsc`-Schritt („Typen SW“, „Typen Worker“) ein Typfehler, die neuen Globals. Jeder muss rot werden. Das Ergebnis steht im Plan unter „Umsetzung“.
- `docs/architecture.md` bekommt:
  - die Zeilen für `src/sw/` und `push-worker/` in der Schichtentabelle;
  - den Absatz „Service Worker“ (E3, E4, E4a);
  - die Lazy-Kette „App-Extras“ (E5);
  - die Ausnahme im Absatz Wegzeit (E4a);
  - ab Stufe 2 den Absatz „Push“ (E9–E13) und die geänderten Privatsphäre-Invarianten (ADR 0014).
- Budget `.size-limit.json`: `Service Worker` (`dist/sw.js`, 8 kB gzip) und `App-Extras JS (lazy)` (`dist/assets/app/*.js`, 5 kB gzip).

### E6 – E2E mit Service Worker

- Global gilt in `playwright.config.ts` `serviceWorkers: "block"`. Begründung: Ein Service Worker, der Fixture-Daten aus einem früheren Test liefert, ließe Tests voneinander abhängen. Außerdem sieht `context.route` Requests des Service Workers je nach Browser unterschiedlich.
- Neue Spec `e2e/pwa.spec.ts` mit `test.use({ serviceWorkers: "allow" })`, **nur in Chromium-Projekten** (`pixel-7`, `desktop`). WebKit prüft der Browser-Review auf einem echten iPhone (Schritt 6). Inhalt:
  1. Das Manifest ist verlinkt und gültig: `name`, `start_url`, `display`, Icons erreichbar, 192 und 512 px; das `apple-touch-icon` ist deckend (Alpha überall 255).
  2. Der Service Worker wird aktiv und kontrolliert nach dem Neuladen die Seite.
  3. **Kanarienvogel:** Nach `context.setOffline(true)` scheitert ein `fetch` **aus dem Service Worker** (per `serviceWorker.evaluate`). Sonst wäre Prüfung 4 trügerisch grün. Wirkt `setOffline` dort nicht, ist der Rückfall `context.route("**", (r) => r.abort("internetdisconnected"))`. Der Kanarienvogel gilt dann für diesen Weg.
  4. **Offline nach dem ersten Besuch:** Seite **einmal** laden, warten, bis der Service Worker aktiv ist (`navigator.serviceWorker.ready` per `page.evaluate`), sofort offline gehen und neu laden. Erwartet werden Liste und Statuszeile „Offline – Stand vom …“ mit Fixture-Daten aus dem Precache (E4). `expectMobileUx` läuft hell und dunkel.
  5. **ICS offline:** Ein Tipp auf einen Kalender-Link im Detail lässt die Seite stehen (URL unverändert, Detail offen) und zeigt den Toast „Kalender-Datei braucht Netz“. Kein Seitenfehler, keine erlaubten Konsolenfehler nötig (204).
  6. Online lädt `site.json` aus dem Netz (Antwort ohne `X-Zp-Cache`).
  7. **Wieder online** (E4a): `setOffline(false)` und das Ereignis `online` → die Statuszeile verliert „Offline“.
  8. Kein fremder Origin im Cache: Mit `tiles: "mock"` und offener Karte enthält `caches` keinen Eintrag von `tiles.openfreemap.org`.
- **LCP/CLS mit Service Worker** gehört in `e2e/smoke.spec.ts` (Projekt `smoke-echte-daten`, seriell). Dort ein eigener `describe` mit `serviceWorkers: "allow"`: erster und zweiter Besuch, LCP < 2,5 s, CLS < 0,05.
- **Installationshilfe Black-Box** (E7), ohne neue Hintertür neben `__zpMap`:
  - „läuft als App“: `page.addInitScript` stubbt `matchMedia("(display-mode: standalone)")`.
  - „Browser bietet an“: Nach `load` und nachdem `pwa.ts` geladen ist (sichtbar am Attribut `data-pwa="bereit"` auf `<html>`, das `pwa.ts` setzt), löst `page.evaluate` ein synthetisches `beforeinstallprompt` aus. Das ist ein `Event` mit `prompt()`-Stub und `userChoice`-Promise (`{ outcome: "accepted" }`). Der Test prüft auch, dass der Tipp `prompt()` aufruft. Kein Inline-Skript, keine Hintertür.
  - „iPhone“: Projekt `iphone-15` (WebKit, iOS-User-Agent).

  Je Zustand `expectMobileUx` hell und dunkel.

### E7 – Installationshilfe (Stufe 1, UI)

- Neuer Abschnitt „Als App“ im Kind-Sheet, unter „Darstellung“, lazy (E5).
  - **Laden:** Ein Platzhalter fester Höhe (eine Zeile) verhindert einen Sprung im Sheet.
  - **Chunk nicht ladbar** (offline, nicht im Cache): `LoadFailed` aus `Lazy.tsx` mit einem `className` für den Sheet-Kontext. Heute sitzt `.map-note` absolut im Kartenrahmen, deshalb bekommt `LoadFailed` den Parameter wie in Plan 0010 (E7).
- Je Zustand (`installState()` aus `src/data/pwa.ts`, Texte über die reine Funktion `src/domain/pwa.ts` mit Test):
  - **läuft schon als App** (`display-mode: standalone` bzw. `navigator.standalone`): „Läuft als App.“ Ab Stufe 2 steht hier der Push-Schalter.
  - **Browser bietet Installation an** (`beforeinstallprompt` gemerkt): Knopf „Zum Startbildschirm hinzufügen“ (≥ 44 px). Ist das Event verloren gegangen (E5), steht auf Android stattdessen „Im Browser-Menü ‚App installieren‘ wählen“.
  - **iPhone/iPad in Safari:** „Teilen-Symbol → ‚Zum Home-Bildschirm‘“ mit dem Teilen-Symbol als Inline-Icon.
    - Dazu der Satz „Die App startet leer: Alter, Merkliste und Stadtteil dort noch einmal eintragen.“ (Spike h: Die Home-Bildschirm-App hat einen eigenen Speicher.)
  - **sonst:** Der Abschnitt ist ausgeblendet.
- Die Erkennung von iOS steckt in `src/data/pwa.ts` (`navigator.userAgent`, `maxTouchPoints` für iPadOS) und ist als heuristisch dokumentiert. Fällt sie falsch aus, sieht man nur einen Hilfetext.
  - **Keine Versionsprüfung über den UA.** iOS 26 meldet dort eingefroren `iPhone OS 18_7`, die echte Version steht nur in `Version/26.x` (Spike). Ob Push geht, entscheidet die Feature-Erkennung in `pushSupport()` (E12), nicht die Version.

### E8 – Geräte-Speicher für den Service Worker (Stufe 2)

- Neues Modul `src/data/device-store.ts`: ein schmaler IndexedDB-Wrapper ohne npm-Paket (Datenbank `zwergenplan`, Store `kv`, Funktionen `get`, `set`, `del`). Es läuft im Fenster und im Service Worker.
- **Gespiegelt wird nur, solange Push an ist, und nur das Nötige:**
  - das Geburtsdatum;
  - `seenIds`, also die Angebots-IDs, die das Gerät beim letzten Öffnen der App kannte;
  - `endpointHash`, der SHA-256 des zuletzt beim Worker gemeldeten Endpoints (für den Abgleich in E12).

  „Nur passende“ wird **nicht** gespiegelt (Datensparsamkeit, siehe E9).
- `preferences.ts` schreibt bei jeder Änderung des Geburtsdatums zusätzlich in den Geräte-Speicher (per `import()`, E5), wenn `zwergenplan.push` gesetzt ist.
- Beim Abschalten von Push werden alle Einträge **gelöscht**.
- Das weicht von der Invariante „Das Geburtsdatum bleibt im `localStorage`“ ab. Der Wert bleibt auf dem Gerät und im eigenen Origin und erscheint nie in URL, Logs oder Requests. Festgehalten in ADR 0014 und `docs/architecture.md`.

### E9 – Was „neu“ heißt (Domäne)

`src/domain/news.ts`, rein, test-first. **`now` wird immer hineingegeben** (Invariante „Zeit“).

- `newOfferIds(before: readonly string[], after: readonly SiteOffer[], now: Date): string[]` liefert die IDs aus `after`, die nicht in `before` stehen **und** noch einen kommenden Termin haben, nach derselben Regel wie die Liste.
- `newsText({ count, birthDate?, now }): NewsText | undefined` liefert die persönliche Nachricht oder `undefined`. Bei `undefined` bleibt die allgemeine.
  - ohne Geburtsdatum → `undefined`;
  - **`count === 0`** (App zwischen Deploy und Push geöffnet) → `undefined`;
  - **`seenIds` fehlen** (IndexedDB geräumt), was der Aufrufer erkennt → `undefined`, statt alle Angebote als neu zu melden;
  - mit Geburtsdatum, passende vorhanden → „3 neue Angebote passen zu 14 Monaten“, im Text die ersten zwei Titel, Rest „und 1 weiteres“;
  - mit Geburtsdatum, keines passend → „7 neue Angebote, gerade keins für 14 Monate“;
  - `app_badge` = Zahl der passenden bzw. aller neuen.
- „Nur passende“ wirkt nicht auf die Nachricht. Die Zahl der passenden steht im Text, eine Nachricht kommt bei jedem Deploy mit neuen Angeboten. Darum wird die Einstellung nicht gespiegelt.
- Bekannte Unschärfe: Ein geänderter Titel erzeugt eine neue ID (ADR 0003) und zählt als neu. → Risiken.
- `declarativePayload({ count, siteUrl, sentAt })` (`src/domain/push-payload.ts`, rein) baut die allgemeine Payload für den Absender:
  - `notification.title` „Zwergenplan“, `body` „7 neue Angebote im Zwergenplan“, `navigate` `${siteUrl}?neu`, `tag` „neue-angebote“, `app_badge` = count;
  - `data: { sentAt }` (ISO mit Offset);
  - `lang: "de"`, `mutable: true`.

  Service Worker, Worker und CI-Skript teilen die Typen (`src/domain/push-types.ts`).
- **Das Zod-Schema der Payload** liegt in `scripts/lib/push-payload-schema.ts`, nicht in `src/domain`. Begründung: `no-zod-in-client-transitive` verbietet Zod in jedem Domänenmodul außer `schema.ts`/`dataset.ts`, und die Payload ist kein Teil des Datenvertrags. `push-send.ts` prüft jede Payload damit vor dem Versand.
- Der Worker prüft Abos mit einem eigenen Zod-Schema in `push-worker/src/lib/subscription.ts`. Zod im Worker berührt kein Client-Bundle.

### E10 – Push im Service Worker

Die Entscheidung, was angezeigt wird, steckt in der **reinen Funktion `src/sw/push-decision.ts`**:
- `decidePush({ proposed?, payload?, outcome })`, wobei `outcome` eines von `{ kind: "text", text }`, `{ kind: "nichts" }`, `{ kind: "zeit" }` oder `{ kind: "fehler" }` ist. Ergebnis: `{ show: { title, options } }` oder `{ show: null }`.
- Unit-Tests decken jeden Zweig ab: auch den deklarativen (`proposed` gesetzt, nichts anzeigen), den Chromium im E2E nie erreicht, dazu kaputte Payload und Zeitlimit. Die Datei steht in `coverage.include`.
- `sw.ts` verdrahtet nur Events, Speicher und Fetch.

`self.addEventListener("push", …)`:
1. Vorgeschlagene Nachricht lesen: `event.notification`, **wann immer vorhanden** (keine Browser-Erkennung), sonst `event.data.json().notification`. Auf iOS ist `event.data` `null`, die Payload steht nur in `event.notification` (Spike). Ist die Payload kaputt, kommt der feste Text „Neues im Zwergenplan“ (Chrome verlangt eine sichtbare Nachricht).
2. **`now` = `notification.data.sentAt`**, nur wenn das fehlt `new Date()`. Das ist fachlich die richtige Zeit (Stand beim Versand) und macht die E2E deterministisch.
3. Höchstens **5 s** insgesamt, **hart**:
   - `data/site.json` mit `cache: "no-cache"` laden;
   - `seenIds` und Geburtsdatum aus dem Geräte-Speicher lesen;
   - `newOfferIds` und `newsText` rechnen.

   iOS beendet den Service Worker nach ≈ 10 s. Dann erscheint **gar keine** Nachricht, und die nächsten Pushes kommen bis zu 10 Min. verspätet (Spike d). Deshalb:
   - Die Arbeit läuft in einem `Promise.race` gegen einen 5-s-Timer. Das Promise in `event.waitUntil` endet in jedem Fall nach spätestens 5 s, auch wenn ein Schritt hängt.
   - `fetch` bekommt zusätzlich ein `AbortSignal.timeout(4000)`.
   - Nach Ablauf gilt `outcome` `{ kind: "zeit" }` (Schritt 5). Ein später fertig werdender Zuschnitt zeigt nichts mehr an (Flag nach dem Rennen).
   - Unit-Test mit Fake-Timern: Ein nie auflösender Speicherzugriff führt nach 5 s zu `zeit`, und `waitUntil` ist erfüllt.

   Gemessen brauchte der echte Zuschnitt 0,3 s, das Limit ist reiner Schutz.
4. Liefert `newsText` einen Text: `registration.showNotification(title, { body, tag: "neue-angebote", navigate, data: { navigate }, icon, lang: "de" })`.
   - **`navigate` ist Pflicht.** Ohne gültige `navigate`-URL lehnt iOS `showNotification` im `push`-Event mit `TypeError` ab (Spike j). `decidePush` setzt sie immer, Test dazu.
   - **Kein `setAppBadge` im Service Worker.** Auf iOS kam der Aufruf nie zurück, und der Lauf endete ohne Nachricht (Spike g). `app_badge` in der Payload wirkt auf iOS 26.5 nicht, bleibt aber drin (Spec, schadet nicht).
   - `tag` ersetzt auf iOS keine ältere Nachricht, mehrere Pushes stapeln sich (Spike). Bei einer Nachricht je Deploy ist das hinnehmbar.
5. Sonst (kein Text, Zeit abgelaufen, Fehler):
   - mit `event.notification` (Declarative) **nichts** anzeigen, das System zeigt die allgemeine Fassung (Spike e, f);
   - ohne `event.notification` die vorgeschlagene Nachricht selbst anzeigen.
6. `notificationclick` nur für Browser ohne `navigate`-Option (Chromium, Firefox): offenes Fenster fokussieren und auf `data.navigate` bzw. `./?neu` navigieren (`WindowClient.navigate`), sonst `clients.openWindow`. Auf iOS wird er nie erreicht (Spike j).
   - Die App leert den Badge beim Öffnen über `src/data/pwa.ts` (`push-start.ts`), nie aus `src/ui`. Gesetzt wird er nur dort, wo der Browser es selbst tut. Ein eigener Zähler ist kein Ziel.
7. **`pushsubscriptionchange`** (Chrome und Firefox tauschen Abos gelegentlich aus):
   - Der Service Worker abonniert mit demselben `applicationServerKey` neu, sofern `event.newSubscription` fehlt.
   - Er meldet das neue Abo per `POST /abo`, das alte per `DELETE /abo`, und speichert `endpointHash`.
   - Das ist der einzige Request ohne Tipp. Er enthält nur das Abo (ADR 0014).
   - Schlägt er fehl, holt der Abgleich beim nächsten App-Start (E12) das nach.

Der Request auf `site.json` ist für alle gleich. Alter und Einstellungen verlassen das Gerät nicht.

### E11 – Absender: CI und ein Cloudflare Worker (ADR 0014)

**Worker `push-worker/`** (Ordner im Repo, TypeScript, `wrangler`, Workers KV, Gratis-Tarif):
- **Origin-Prüfung im Worker:** Jede öffentliche Route verlangt `Origin: https://zwergenplan.app`, sonst 403, auch ohne `Origin`-Header. CORS-Header plus `OPTIONS`-Preflight dienen dem Browser.
  - **Das ist kein Schutz** gegen Skripte, die den Header frei setzen. Es hält nur fremde Webseiten ab.
  - Die eigentlichen Grenzen sind Allowlist, Größe, Obergrenze und ein Rate-Limit von 10 Anmeldungen je IP und Stunde. Der Zähler liegt in KV mit TTL, die IP wird nur gehasht und nur für diese Stunde gehalten.
- `POST /abo`: Body ist das `PushSubscription`-JSON. Er prüft:
  - Schema;
  - Endpoint-Host gegen die Allowlist der Push-Dienste, exakt bzw. als Suffix mit Punkt: `*.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`;
  - nur `https:`, keine Userinfo, kein Port;
  - Größe ≤ 2 kB;
  - Gesamtzahl ≤ 500.

  Schlüssel ist der SHA-256 des Endpoints. Antwort 204.
- `DELETE /abo` mit `{ endpoint }`: Löschen, 204, auch wenn nichts da war.
- `GET /abos` und `POST /abos/loeschen` nur mit `Authorization: Bearer <PUSH_ADMIN_TOKEN>` (Vergleich in konstanter Zeit), ohne Origin-Pflicht.
- Er speichert nur das Abo und das Datum der Anmeldung, loggt keine Endpoints (nur Zähler) und setzt keine Cookies.
- `GET /version` liefert den Commit, mit dem der Worker deployt wurde. `pnpm push:deploy` setzt ihn per `--var VERSION:$(git rev-parse --short HEAD)`.
  - `push-send.ts` gibt ein `::warning::` aus, wenn der Worker älter ist als der letzte Commit, der `push-worker/` ändert.
  - Grund: Der Worker wird manuell deployt und kann sonst unbemerkt vom Repo abweichen.
- Reine Logik (Prüfung, Allowlist, Schlüssel, Origin, Rate-Limit) in `push-worker/src/lib/`, Handler mit `Request`/`Response` und einem KV-Fake getestet.

**Gates für `push-worker/`** (sonst läge er außerhalb aller Prüfungen):
- `vitest.config.ts`: Include um `push-worker/**/*.test.ts`.
- `scripts/check-architecture.ts`: `push-worker` in `DIRS`, Regel `push-worker-isolated` (importiert aus dem Repo nur `src/domain/push-payload.ts` und `src/domain/push-types.ts`).
- `check:fast`: Schritt „Typen Worker“ (`tsc --noEmit -p push-worker`).
- `knip.jsonc`: Entry `push-worker/src/index.ts`, Project `push-worker/**/*.ts`.
- `biome.json` erfasst den Ordner ohnehin (`biome check .`).
- **Abhängigkeiten im Root-`package.json`** als devDependencies (kein pnpm-Workspace): `wrangler`, `@cloudflare/workers-types`, `web-push`, `@types/web-push`. Gepinnt wie alle anderen, ein Lockfile. `wrangler` zieht `workerd` mit Build-Skript nach. `workerd` und was `pnpm install` sonst meldet, kommt in `pnpm.onlyBuiltDependencies`.

**CI** (`.github/workflows/ci.yml`, nur `main`):
- Job `check`, vor dem Deploy: `node scripts/push-news.ts --against-deployed` rechnet aus `data/offers.json` (über `loadDataset` und `toSiteData`) und der Live-`site.json` die Zahl neuer Angebote (`newOfferIds`, `now` = Laufzeit).
  - Ergebnis als Job-Output `news` (`echo "news=$n" >> "$GITHUB_OUTPUT"`). Das Skript setzt den Output **immer**, im Zweifel auf 0, auch auf Branches (dort ohne Abruf). So bekommt `fromJSON` nie einen leeren String.
  - Ist die Live-Datei nicht erreichbar: `news=0` mit `::warning::`. Lieber keine Nachricht als eine falsche.
- Neuer Job `notify`: `needs: [check, deploy]`, `if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && fromJSON(needs.check.outputs.news) > 0`.
  1. `node scripts/push-send.ts` wartet bis höchstens 10 Min., bis die Live-`meta.json` den neuen Stand zeigt: `GITHUB_SHA.startsWith(meta.commit)` (`meta.commit` ist der Kurz-Hash aus `build-data.ts`). Sonst lädt der Service Worker womöglich noch die alte `site.json`. Läuft die Zeit ab: `::warning::`, kein Versand.
  2. Abos vom Worker holen und jedem mit `web-push` senden:
     - VAPID mit `subject: "https://zwergenplan.app/"` (keine E-Mail-Adresse im öffentlichen Repo);
     - Payload `declarativePayload({ count: news, siteUrl: SITE_URL, sentAt: jetzt })`;
     - `TTL: 172800` (2 Tage), `urgency: "normal"`, `topic: "neueangebote"` (ein noch nicht zugestelltes Push wird ersetzt).
     - **Das Topic muss gültiges Base64url sein, mit einer Länge, die ein Vielfaches von 4 ist.** Apple lehnt `neue-angebote` mit 400 `BadWebPushTopic` ab, `neueangebote` nimmt es an (Spike). Die Konstante liegt in `push-payload.ts`, ein Unit-Test prüft `^[A-Za-z0-9_-]{1,32}$` und Länge % 4 = 0.
  3. Abos mit Antwort 404 oder 410 gehen an `POST /abos/loeschen`.
  4. Ausgabe nur als Zahlen: gesendet, entfernt, Fehler.
  5. Fehler beim Senden: `::warning::` und **Exit 0**. Der Job ist kein Gate, denn der Deploy ist schon live. Rot wird er nur bei einem Programmierfehler (ungültige Payload laut `declarativePayload`-Schema).
- **Testversand ohne Deploy:**
  - `push-send.ts` kennt `--force-news=<n>`, `--dry-run` (zählt nur Abos) und **`--only=<hash-präfix>`** (nur Abos, deren Endpoint-Hash so beginnt).
  - Bei eingeschaltetem Push zeigt der Abschnitt „Als App“ die ersten 8 Zeichen des eigenen `endpointHash` als „Geräte-Kennung“ an. Sie verrät nichts.
  - **Auf dem Branch** wird lokal getestet: `VAPID_PRIVATE_KEY=… PUSH_ADMIN_TOKEN=… node scripts/push-send.ts --force-news=1 --only=<kennung>`. Die Secrets hat der Nutzer aus Schritt 7. `workflow_dispatch` geht nur für Workflows, die auf dem Standard-Branch liegen.
  - **Nach dem Merge** steht `.github/workflows/push-test.yml` für spätere Tests bereit: `workflow_dispatch` mit den Eingaben `count`, `only` und `dry_run` (Standard `true`). `only` ist Pflicht, sobald `dry_run` aus ist, damit ein Test nie an alle geht.
- Secrets: `VAPID_PRIVATE_KEY`, `PUSH_ADMIN_TOKEN` (GitHub-Secrets). Der öffentliche VAPID-Schlüssel und die Worker-URL stehen in `site.config.ts`.
- `web-push` (MPL-2.0, ausgereift) nur in `scripts/push-send.ts` (`web-push-only-in-push-send`).
- Abgelehnt: das Senden im Worker. Dann müsste die RFC-8291-Verschlüsselung selbst gebaut oder `web-push` unter `nodejs_compat` betrieben werden, und Abos und privater Schlüssel lägen am selben Ort im Netz.

### E12 – An- und Abmelden (UI, Stufe 2)

- Im Abschnitt „Als App“ steht ein Schalter „Benachrichtigen bei neuen Angeboten“ (`role="switch"`, `aria-checked`, ≥ 44 px).
  - Er erscheint nur, wenn `pushSupport()` = `"ok"`. Das heißt: `PushManager` **und** `Notification` vorhanden, Service Worker aktiv (mit Zeitlimit, E5b), auf iOS als App installiert. Im Safari-Tab fehlt `Notification`, `PushManager` aber nicht (Spike a), deshalb prüft `pushSupport()` beides.
  - Sonst steht dort ein Hinweis: auf dem iPhone „Erst als App installieren“, sonst „Dieser Browser kann keine Benachrichtigungen“.
- **Einschalten** nur auf Tipp, Reihenfolge fest:
  1. `Notification.requestPermission()` ist das **erste `await`** im Tipp-Handler. Sonst verliert iOS die Nutzeraktivierung. Das hält ein Kommentar im Code fest, ein Unit-Test prüft es über die Reihenfolge der Fake-Aufrufe.
  2. Ab hier **Wartezustand**: Schalter deaktiviert, `aria-busy`, Text „Wird eingeschaltet …“. Kein Doppel-Tipp möglich.
  3. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
  4. `POST /abo`.
  5. Geräte-Speicher füllen (E8), `zwergenplan.push = "an"` im `localStorage`.

  Jeder Fehler (abgelehnt, Netz, Worker) setzt den Schalter zurück, meldet ein bereits erzeugtes Abo wieder ab und zeigt einen Toast mit Grund (Texte in `src/ui/format.ts`).
- **Ausschalten** (ebenfalls mit Wartezustand):
  1. `subscription.unsubscribe()`;
  2. `DELETE /abo` (Fehler stillschweigend, der Push-Dienst kennt das Abo nicht mehr);
  3. Geräte-Speicher löschen, `zwergenplan.push` entfernen.
- Der Schalter zeigt den **echten** Zustand (`pushManager.getSubscription()`), nicht nur den `localStorage`-Wert. Bei `Notification.permission === "denied"`: „aus“ mit dem Hinweis „In den Einstellungen des Geräts erlaubt?“.
- Die App aktualisiert `seenIds` im Geräte-Speicher bei jedem erfolgreichen Laden von `site.json`, nur bei Push an und nach dem Block „Neu“ (E13).
- **Abgleich beim Start** (`push-start.ts`, nur bei Push an):
  - `getSubscription()` lesen und den SHA-256 des Endpoints mit `endpointHash` vergleichen.
  - Weicht er ab (Abo ausgetauscht, `pushsubscriptionchange` verpasst): das neue Abo per `POST /abo` melden, das alte per `DELETE /abo` abmelden, `endpointHash` aktualisieren.
  - Gibt es kein Abo mehr: Der Schalter zeigt „aus“, und `zwergenplan.push` wird entfernt.
  - Der Request enthält nur das Abo und ist für alle gleich aufgebaut.

### E13 – „Neu“ in der App

- `src/domain/route.ts` kennt das Flag `neu` (`parseRoute`/`routeToSearch`). Sonst entfernt `replaceState` (über `urlFor` in `use-app-state.ts`) den Parameter, bevor der Block ihn liest. Test in `route.test.ts`.
- Mit `neu` lädt `App` lazy den `NewsBlock` (E5). Er zeigt über dem Tag „Heute“ „Neu seit deinem letzten Besuch“ mit den Angeboten aus `newOfferIds(seenIds, site.offers, now)`.
  - **Kein Layoutsprung:**
    - Solange `seenIds` aus dem Geräte-Speicher gelesen werden und der Chunk lädt, steht an seiner Stelle ein Platzhalter fester Höhe (Überschrift plus eine Kachelhöhe).
    - Ist danach nichts Neues da, schrumpft er auf die eine Zeile „Nichts Neues mehr“. Das passiert über dem Falz, bevor die Liste darunter gelesen wird.
    - E2E misst CLS < 0,05 für `/?neu`.
  - **Filter:** Der Block wendet nur die Altersregel der Liste an (`ageVisibility`, also auch „Nur passende“), nicht die Filter nach Kategorie, Format oder Wegzeit. Die Nachricht hat „neue Angebote“ versprochen, ein Filter soll sie nicht still verstecken. Was das Alter ausblendet, steht als Zeile „2 weitere passen nicht zum Alter“.
  - Danach wird `seenIds` aktualisiert und `neu` per `replace` aus der Route entfernt.
  - Ohne neue Angebote steht dort „Nichts Neues mehr“.
  - **Chunk nicht ladbar:** Der Platzhalter verschwindet, `neu` wird still entfernt, kein Fehlerkasten.
- `?neu` ist ein Flag ohne Inhalt und verrät nichts. Die IDs stehen nie in der URL.
- Der Block nutzt die bestehenden Kacheln. Er bekommt E2E und `expectMobileUx` hell und dunkel.
- Ohne `seenIds` (kein Push-Abo) erscheint der Block nicht, und `neu` wird still entfernt.

## Struktur

```
design/icon.svg                         Icon-Quelle (E2)
public/manifest.webmanifest             (E2)
public/icons/{icon-192,icon-512,maskable-512,apple-touch-180}.png, icon.svg
scripts/icons.ts                        PNGs aus design/icon.svg (Playwright, E2)
scripts/vite-sw.ts (+ .test.ts)         Vite-Plugin: baut sw.js, Precache-Liste (E3)
src/sw/sw.ts, src/sw/tsconfig.json      Service Worker (E3, E4, E10)
src/sw/routes.ts (+ .test.ts)           reine Routing-Entscheidung URL → Strategie, in Prüfreihenfolge
src/sw/push-decision.ts (+ .test.ts)    reine Entscheidung: was beim Push angezeigt wird (E10)
src/data/pwa-start.ts                   Start: nach `load` → import("./pwa.ts"), „Push an?“ → import("./push-start.ts") (E5)
src/data/pwa.ts                         lazy: Registrierung, Installationszustand, Frische, Badge (E4a, E5, E7)
src/data/push.ts                        lazy: Push-Abo (E12)
src/data/push-start.ts                  lazy: seenIds, Badge leeren, Endpoint-Abgleich (E12)
src/data/device-store.ts                lazy: IndexedDB-Wrapper (E8)
src/domain/pwa.ts                       Installationshilfe: Zustand → Text (E7)
src/domain/news.ts                      neu, Nachrichtentext (E9)
src/domain/push-payload.ts, push-types.ts  Payload (E9), geteilt mit CI und Worker
src/ui/AppExtras.tsx                    Lader der Lazy-Kette „App-Extras“ (E5)
src/ui/app-extras/AppSection.tsx        Abschnitt „Als App“ mit Push-Schalter (E7, E12)
src/ui/app-extras/NewsBlock.tsx         „Neu seit deinem letzten Besuch“ (E13)
push-worker/                            Cloudflare Worker (E11): src/index.ts, src/lib/*, wrangler.toml, tsconfig.json, Tests
scripts/push-news.ts, push-send.ts      CI und lokaler Testversand (E11)
scripts/lib/push-payload-schema.ts      Zod-Schema der Payload (E9)
.github/workflows/push-test.yml         Testversand nach dem Merge, `only` Pflicht (E11)
docs/adr/0013-pwa-service-worker.md     (Entwurf liegt bei)
docs/adr/0014-web-push.md               (Entwurf liegt bei)
```

## Tests

- **Unit (vitest, test-first, Zeitzone `America/Los_Angeles`):**
  - `src/domain/news.ts`: neu/bekannt, vergangene Angebote, Tagesgrenze in Berlin, Alter genau an der Grenze, Pluralformen, `app_badge`, **`count === 0` → undefined**, **ohne Geburtsdatum → undefined**.
  - `src/domain/push-payload.ts`: Pflichtfelder (`web_push`, `title`, `navigate`), `mutable`, `sentAt` mit Offset.
  - `src/domain/pwa.ts`: alle Zustände der Installationshilfe.
  - `src/domain/route.ts`: `neu` hin und zurück.
  - `src/sw/routes.ts` (in `coverage.include`): jede Zeile der Tabelle in E4 **und ihre Reihenfolge** (`ics/…` als Navigation trifft Regel 2, nicht 6), fremde Origins, Querystrings, Pfade relativ zum Scope.
  - `src/sw/push-decision.ts` (in `coverage.include`): alle Zweige, auch der deklarative.
  - Rotation von `zp-assets`: Einträge der aktuellen Precache-Liste bleiben.
  - `scripts/vite-sw.ts`: Entry aus `index.html` in der Liste, kein Lazy-Chunk.
  - `src/data/pwa.ts` mit Fakes:
    - Registrierung nach `load`;
    - **`register()` liefert `undefined`, `ready` löst nie auf** → kein Hänger;
    - `watchFreshness` mit Fake-Timern (30 Min., `online`), `registration.update()` zuerst, Neuladen nur bei `controllerchange`.
  - `src/data/push.ts` mit Fakes: jeder Fehlerpfad (Abo wird zurückgerollt), Abmelden räumt auf, `requestPermission` als erster Aufruf.
  - `src/data/push-start.ts` mit Fakes: Endpoint gleich → kein Request; Endpoint anders → genau ein `POST` und ein `DELETE`; kein Abo → Push aus.
  - `push-worker/src/lib`, Rate-Limit: elfte Anmeldung je IP und Stunde → 429.
  - `preferences.ts`: Spiegelung nur bei Push an, Löschen beim Abschalten.
  - `push-worker/src/lib`:
    - Schema;
    - Allowlist, auch `fcm.googleapis.com.evil.com`, `evil.com/?fcm.googleapis.com`, Userinfo, Port, Unicode-Hosts;
    - Origin-Prüfung (fehlend, fremd, richtig);
    - Größe, Obergrenze, Schlüssel, Token-Vergleich.
  - `scripts/push-news.ts`: Logik über `newOfferIds`; fehlt die Live-Datei → 0.
  - `device-store.ts` hat keinen Unit-Test (kein `fake-indexeddb`, keine neue Abhängigkeit). Der Wrapper ist dünn und läuft in `e2e/push.spec.ts` im echten Browser.
- **E2E:** `e2e/pwa.spec.ts` und Installationshilfe (E6). Dazu `e2e/push.spec.ts`, nur Chromium:
  - Neue Fixture-Option **`pushWorker: "mock"`** analog zu `tiles`:
    - Der Drittanbieter-Wächter lässt dann genau die Worker-URL aus `site.config.ts` zu und bedient sie per `context.route`.
    - Er protokolliert jeden Body. Der Test prüft, dass er nur das Abo enthält, ohne Geburtsdatum, ohne `seenIds`.
    - Ohne Option bleibt jeder Request an den Worker rot.
  - Berechtigung per `context.grantPermissions(["notifications"])`.
  - `PushManager.prototype.subscribe`, **`getSubscription` und `unsubscribe`** werden per `page.addInitScript` durch einen gemeinsamen Fake mit Zustand ersetzt. Ein echter Push-Dienst wäre ein Drittanbieter-Request, und der Schalter liest `getSubscription()`.
  - Push-Zustellung über CDP `ServiceWorker.deliverPushMessage` mit einer Payload aus `declarativePayload` mit **`sentAt` = Fixture-Jetzt**. Danach prüft `registration.getNotifications()` Titel und Text: mit und ohne Geburtsdatum, mit und ohne neue Angebote für das Gerät.
  - **Frühe Probe** (erster Schritt von Schritt 10): Funktionieren CDP-Zustellung und `getNotifications()` in Headless-Chromium? Wenn nicht, ist der Rückfall: `showNotification` per `serviceWorker.evaluate` umhüllen und die Aufrufe protokollieren. Das Ergebnis steht im Plan.
  - `/?neu`: Platzhalter ohne Sprung, CLS < 0,05.
  - `notificationclick` lässt sich nicht auslösen, deshalb wird `/?neu` geöffnet und der Block geprüft (`expectMobileUx`, hell und dunkel).
  - Schalter: Wartezustand sichtbar, Doppel-Tipp wirkungslos, Fehler des Workers (Mock 500) → Toast und Schalter aus.
- **Manuell auf echten Geräten** (Browser-Review, Checklisten in Schritt 6 und 11): iPhone mit iOS ≥ 18.4 (installiert), Android Chrome, Desktop-Chrome.

## Backpressure

- Neue Gates:
  - `Typen SW` und `Typen Worker` in `check:fast`;
  - Budgets `Service Worker` und `App-Extras JS (lazy)`, unverändert `JS (initial)` mit Entscheidungspunkt (E5);
  - dependency-cruiser `sw-isolated`, `sw-not-imported`, `no-zod-in-sw`, `app-extras-only-lazy`, `app-extras-entry-only`, `push-worker-isolated`, `web-push-only-in-push-send`;
  - Vitest und knip über `push-worker/`.
- Ein roter Smoke-Test (LCP/CLS mit Service Worker) wird an der Ursache behoben, etwa mit späterer Registrierung oder kleinerer Precache-Liste, nie durch eine höhere Schwelle.
- Der Job `notify` ist bewusst kein Gate (E11). Seine Zahlen stehen im CI-Log.

## Schritte

**Schritt 0 – Spike Declarative Web Push** (Wegwerf-Code, nicht auf `main`, kann parallel zu Stufe 1 laufen)
- Braucht vorgezogen den Cloudflare-Zugang aus Schritt 7. Der Worker liefert unter `/spike` eine temporäre Seite mit Manifest, Service Worker und Abo-Knopf. Gesendet wird lokal mit `web-push`.
- Der Nutzer installiert die Seite auf einem iPhone mit iOS ≥ 18.4 und meldet sich an.
- Geprüft und unter „Spike-Ergebnis“ festgehalten werden die Punkte (a) und (d)–(h) aus der Ausgangslage, außerdem ob `event.notification` wie spezifiziert gesetzt ist.
- Fertig, wenn alle Punkte beantwortet sind und E7, E10 und E11 bei Bedarf angepasst sind.
- Fällt (f) negativ aus, entfällt der Zuschnitt auf iOS (nur der allgemeine Text). Dann gibt es eine Rückfrage an den Nutzer, ob Stufe 2 so noch gewollt ist.
- Die Spike-Route wird danach aus dem Worker entfernt.
- *Erledigt (2026-10-05):* alle Punkte beantwortet, siehe „Spike-Ergebnis“. (f) ist positiv. Der Spike lief als eigener Worker `zwergenplan-spike` auf `workers.dev`, nicht im späteren `push-worker/`. Er wird gelöscht, sobald keine Nachmessung mehr nötig ist (`wrangler delete`, KV-Namespace `SPIKE`).

**Stufe 1**
1. **Voraussetzung und Build:**
   - Plan 0010 mit Paket 0 auf `main`; `X` = `JS (initial)` messen und hier notieren.
   - `scripts/vite-sw.ts` (test-first) und `src/sw/` mit den Routen aus E4, zunächst ohne Push.
   - tsconfig-Trennung, „Typen SW“, dependency-cruiser-Regeln, Budgets, `knip.jsonc`, `coverage.include`.
   - `serviceWorkers: "block"` in `playwright.config.ts`.
   - Biome-Globals für `src/ui` ergänzen (E5b).
   - Kanarienvögel für jede neue Regel, jedes Budget und „Typen SW“ (ADR 0004).

   Fertig, wenn `pnpm check:fast` grün ist, jeder Kanarienvogel rot war und `dist/sw.js` die Precache-Liste enthält.
2. **Manifest und Icons:** `design/icon.svg`, `scripts/icons.ts`, PNGs, `index.html`-Tags. Fertig, wenn `e2e/pwa.spec.ts` Punkt 1 grün ist und der Nutzer das Icon abgenommen hat.
3. **Registrierung, Offline, Frische:**
   - `src/data/pwa.ts`, `X-Zp-Cache`, `stale` in `loadSiteData`, Statuszeile „Offline – Stand vom …“, `watchFreshness` (E4a).
   - Test-first für `routes.ts` und `pwa.ts`.
   - Fertig, wenn `e2e/pwa.spec.ts` 2–8 und der Smoke mit Service Worker grün sind.
   - **Entscheidungspunkt E5** gemessen und notiert.
4. **Installationshilfe** (E7):
   - **Zuerst die Stub-Probe** (E5): leere `AppSection`, `vite build`, Chunk-Wächter, `pnpm size`. React darf sich nicht abspalten.
   - Dann `src/domain/pwa.ts` test-first, Lazy-Kette „App-Extras“, Abschnitt „Als App“ mit Platzhalter und Fehlerzustand.
   - E2E Black-Box (E6) mit `expectMobileUx` hell und dunkel und bei 320 px/200 % für die drei sichtbaren Zustände.
5. **Doku und Review:**
   - `docs/architecture.md` (Schicht `src/sw`, Absatz Service Worker, Lazy-Kette), README (Installation, Notausgang „selbst abmeldender `sw.js`“).
   - ADR 0013 auf „angenommen“.
   - `PW_PORT=4373 pnpm check` grün.
   - `/arch-review` (neue Schicht, neues Modul).
6. **Deploy und Browser-Review:** Branch pushen, CI grün, Fast-Forward nach `main`, `gh run watch`. Danach `/browser-review live` mit Zusatzcheckliste:
   - Installation auf Android und iPhone;
   - Icon deckend, ohne schwarzen Rand;
   - Start ohne Browserleiste, Statusleiste hell und dunkel;
   - Splash auf Android (hell, auch im Dunkelmodus: bewusst);
   - Flugmodus → App öffnet mit „Offline – Stand vom …“, Flugmodus aus → frische Daten ohne Neustart;
   - frisch installierte Home-Bildschirm-App sofort im Flugmodus starten → öffnet;
   - offline im Detail „In den Kalender“ → Toast, App bleibt bedienbar;
   - Karte offline zeigt den bestehenden Hinweis;
   - App 30 Min. im Hintergrund, nach einem Deploy zurückholen → neuer Stand.

**Stufe 2** (erst nach Abnahme von Stufe 1 und Spike)

**Vorab, vor Schritt 9: Start-Budget für Stufe 2 entscheiden** (verschoben aus E5, Arch-Review Stufe 1, H12).
- Ausgangslage: Stufe 1 allein 91,34 kB. **Gemessen nach dem Merge mit Plan 0012 (`main` 61de0da, 91,28 kB): 91,72 kB** von 92 kB, also 0,28 kB Rest (Plan 0012 +0,38 kB, Plan 0011 +0,44 kB gegenüber X; die Anteile addieren sich).
- Stufe 2 schätzt ≈ 0,10 kB im Start (Flag `neu`, Platzhalter `NewsBlock`, „Push an?“). Das passt rechnerisch, ließe aber nur ≈ 0,18 kB für alles Weitere bis zum Budget.
- Zu entscheiden (Rückfrage an den Nutzer, kein Anheben ohne ADR): welche Start-Funktion lazy wird. Kandidaten aus E5: der Platzhalter von `NewsBlock` (Liste hält bei `neu` zurück wie `ListPending`); weitere nach Messung auf dem dann aktuellen `main`.
- **Neu gemessen (2026-10-06, `main` c4861bb, nach Plan 0014): 91,77 kB** von 92 kB, also 0,23 kB Rest.
- **Entscheidung (2026-10-06, Vorschlag angenommen, Budget bleibt 92 kB):** Der Platzhalter von `NewsBlock` kommt **nicht** ins Start-Bundle. Bei `neu` hält die Liste zurück, bis der Lazy-Chunk mit `NewsBlock` geladen ist (gleiche Mechanik wie `ListPending`, Plan 0009). Im Start bleiben nur das Flag `neu` in `route.ts` und die Prüfung „Push an?“ → `import("./push-start.ts")`. Liegt `JS (initial)` nach Schritt 10 trotzdem über 92 kB, gibt es eine erneute Rückfrage, kein Anheben.
- **Überholt am 2026-10-06 durch Plan 0019 (E9):** Der Nutzer hat das Budget auf 100 kB angehoben (Nachtrag in ADR 0012). Die Schwelle für die Rückfrage ist damit 100 kB. Wer Stufe 2 merged, misst neu und trägt sein Delta in die Tabelle in ADR 0012 ein.

7. **Infrastruktur** (Nutzer-Schritte, Anleitung hier):
   - Cloudflare-Konto, `pnpm exec wrangler login`, KV-Namespace anlegen (ID in `push-worker/wrangler.toml`);
   - VAPID-Schlüssel erzeugen (`pnpm exec web-push generate-vapid-keys`);
   - `gh secret set VAPID_PRIVATE_KEY`, `gh secret set PUSH_ADMIN_TOKEN`, `pnpm exec wrangler secret put PUSH_ADMIN_TOKEN`;
   - öffentlichen Schlüssel und Worker-URL in `site.config.ts`.
8. **Domäne:** `news.ts`, `push-payload.ts`, `push-types.ts`, test-first.
9. **Worker:** `push-worker/` mit Tests und Gates (E11), Kanarienvögel für „Typen Worker“ und `push-worker-isolated`, Deploy per `pnpm push:deploy` (`wrangler deploy`). Fertig, wenn:
   - Unit-Tests grün sind;
   - `curl -X POST` **ohne** `Origin` bzw. mit `Origin: https://evil.example` 403 liefert (Funktionsprüfung, kein Sicherheitsnachweis, E11);
   - `curl -X OPTIONS` mit `Origin: https://zwergenplan.app` die CORS-Header liefert;
   - `GET /abos` ohne Token 401 liefert;
   - `GET /version` den deployten Commit zeigt.
10. **App:**
    - zuerst die frühe Probe zu CDP und `getNotifications()` (Tests);
    - `device-store.ts`, Spiegelung in `preferences.ts`, `src/data/push.ts`, `push-start.ts`, `push-decision.ts`;
    - Push im Service Worker (E10), Schalter (E12), `neu` in `route.ts`, Block „Neu“ (E13);
    - `e2e/push.spec.ts` mit Fixture `pushWorker: "mock"`;
    - `docs/architecture.md` (Privatsphäre-Invarianten nach ADR 0014, Absatz Push).
    - Entscheidungspunkt E5 erneut gemessen.
11. **CI und Abnahme:**
    - `scripts/push-news.ts`, `scripts/push-send.ts`, Job `notify`, Workflow `push-test.yml`.
    - Test auf dem Branch **lokal**: `push-send.ts --dry-run`, dann `--force-news=1 --only=<Geräte-Kennung>` an die eigenen Testgeräte (Secrets aus Schritt 7 als Umgebungsvariablen). `push-test.yml` ist erst nach dem Merge per `workflow_dispatch` nutzbar.
    - ADR 0014 auf „angenommen“, `/arch-review`.
    - Fast-Forward, CI grün, dann `/browser-review live` mit Zusatzcheckliste:
      - Anmelden auf iPhone, Android und Desktop;
      - Test-Push per `push-test.yml` mit `only` = eigene Geräte-Kennung;
      - Abo-Wechsel: in Chrome die Website-Daten für Push zurücksetzen, App neu öffnen → Abgleich meldet das neue Abo, nächster Test-Push kommt an;
      - Nachricht persönlich auf iPhone und Android;
      - Tipp öffnet `/?neu` mit dem Block;
      - Abmelden → kein Push mehr;
      - Berechtigung im System entzogen → Schalter zeigt den Hinweis.
12. **Abschluss:**
    - Ergebnis und Spike-Ergebnis im Plan festhalten, Status auf „umgesetzt“.
    - `docs/ideas.md` ergänzen: „Push-Zuschnitt nach Wegzeit/Stadtteil“, „allgemeine Neu-Markierung ohne Push“, „weitere Push-Anlässe (Merkliste, Kurs morgen)“.

## Umsetzung

- **2026-10-05, Schritt 0 (Spike):**
  - Branch `spike-push-0011` (gepusht, nie nach `main`), Code in `spike/push/` (Worker, Seite, Service Worker, Versandskript).
  - Cloudflare-Konto des Nutzers, `wrangler login` (OAuth), KV-Namespace `SPIKE`, Worker `zwergenplan-spike.sbiastoch.workers.dev`, Wegwerf-VAPID-Schlüssel nur lokal.
  - Drei Runden auf dem iPhone (Ersetzen/Fehler/Badge, Wartezeiten, Antippen) plus Topic- und Gesundheitsproben.
  - Ergebnis unter „Spike-Ergebnis“, eingearbeitet in E7, E10, E11, Risiken und ADR 0014.
  - Die echten VAPID-Schlüssel und Secrets entstehen erst in Schritt 7.
- **Stufe 1:** Plan 0010 ist vollständig auf `main` (Stand `origin/main` 693ffd1). Umsetzung auf Branch `pwa-0011`.
- **Hinweis für E5:** Seit `1415eb0` gilt **ADR 0012** (angenommen):
  - `JS (initial)` 92 kB statt 90 kB, Ziel nach Plan 0010 ≤ 91,0 kB;
  - die Rolldown-Gruppe `$initial` in `vite.config.ts` hält gemeinsame Start-Module im Einstieg.

  Die 90 kB und die Schwelle 89,5 kB in E5 beziehen sich auf den alten Stand. Zu Beginn von Stufe 1 werden `X` gemessen und Schwelle sowie Ziel mit gleicher Reserve (0,5 kB unter Budget) neu notiert. Die Stub-Probe gegen React-Abspaltung prüft dann auch, dass `$initial` die Lazy-Kette `assets/app/` nicht in den Einstieg zieht. Das Budget selbst hebt dieser Plan nicht an.

- **2026-10-05, Stufe 1, Schritt 1 (Build):**
  - **X gemessen** auf `693ffd1` (Plan 0010 vollständig): `JS (initial)` = **90,90 kB** (90 902 B, Budget 92 kB nach ADR 0012). Neu notiert mit gleicher Reserve wie in E5: **Ziel ≤ X + 0,5 kB = 91,40 kB**, Schwelle 0,5 kB unter Budget = 91,5 kB. Maßgeblich ist das engere Ziel 91,40 kB. Über 92 kB bleibt Schluss (kein Anheben). *(Überholt durch Plan 0019: Budget 100 kB, Nutzerentscheidung vom 2026-10-06, Nachtrag in ADR 0012.)*
  - `scripts/vite-sw.ts` (test-first, `scripts/vite-sw.test.ts` mit Mini-Bundle): Die Precache-Liste kommt aus den Tags von `index.html` (Modul-Skript, Modul-Preloads, Stylesheets) samt statischer Imports und `importedCss`, dazu die Latin-woff2 und die `startChunks`. Fehlt etwas (kein Entry-Skript, keine Schrift, Datei nicht im Bundle), wirft der Build. `sw.js` entsteht im `writeBundle` per zweitem `vite build` (Lib-Modus, IIFE). `dist/sw.js`: 3,8 kB roh, 1,46 kB gzip, Liste `index.html`, Latin-Schrift, Start-CSS, Einstieg.
  - `src/sw/routes.ts` (test-first, in `coverage.include`, 100 %): Regeln als geordnete Liste `RULES`, Cache-Namen, Zeitlimits, Rotation `assetsToEvict`. `src/sw/sw.ts` verdrahtet nur Events.
  - Gates: „Typen SW“ (`src/sw/tsconfig.json`, `lib: webworker`, im Haupt-`tsconfig.json` ausgeschlossen), Budget `Service Worker` 8 kB, knip-Entry `src/sw/sw.ts`, `serviceWorkers: "block"` in `use`, Biome-Globals, dependency-cruiser `sw-isolated`, `sw-not-imported`, `no-zod-in-sw`, `app-extras-ui-only-lazy`, `app-extras-ui-entry-only`, `app-data-only-lazy`. Die Regeln für Stufe 2 (`news-not-in-start`, `push-worker-isolated`, `web-push-only-in-push-send`) kommen mit Schritt 9/10: Ihre Ziele gibt es noch nicht, ein Kanarienvogel wäre nicht möglich.
  - **Abweichung `no-zod-in-sw`:** als direkte Regel (Laufzeit-Import von `schema`/`dataset` oder `zod`), nicht mit `reachable`. Kanarienvogel: Mit `reachable: true` wurde schon ein reiner Typ-Import (`import type { SiteOffer } from "../domain/site-data.ts"`) rot, weil `reachable` Typ-Kanten mitzählt und `viaOnly` nur für Zyklen gilt. Transitiv hält `no-zod-in-client-transitive` jedes andere Domänenmodul zodfrei, wie bei `no-zod-in-client`.
  - **Kanarienvögel, alle rot gesehen und zurückgenommen:**
    - „Typen SW“: Typfehler in `sw.ts` → Exit 1; `document` im Service Worker → „Cannot find name 'document'“. Der Haupt-`tsc` blieb dabei grün (sieht `src/sw` nicht).
    - `sw-isolated`: `sw.ts` importiert `../ui/format.ts` und `react` → beide rot.
    - `no-zod-in-sw`: Laufzeit-Import `../domain/dataset.ts` → rot; `zod` direkt → rot (auch `sw-isolated`); Typ-Import aus `site-data.ts` → grün.
    - `sw-not-imported`: `App.tsx` importiert `../sw/routes.ts` → rot.
    - Biome: `caches`, `indexedDB`, `Notification`, `PushManager` in `src/ui` → 4 × `noRestrictedGlobals`.
    - Budget `Service Worker`: `dist/sw.js` um 30 kB Zufall aufgebläht → 32,56 kB, rot.
    - Die Regeln zu `app-extras`/`app-data` und das Budget `App-Extras JS (lazy)` bekommen ihre Kanarienvögel in Schritt 3/4, sobald es die Module gibt.

- **2026-10-05, Stufe 1, Schritt 2 (Manifest und Icons):**
  - `design/icon.svg`: das Logo aus der Kopfzeile (gelber Kreis, rote Zipfelmütze, weißer Bommel) als Sticker mit weißem Rand, Schatten und Klebeband auf gepunktetem Heftpapier (`--bg`, `--dotc`, `--tape`). Gruppen `#papier` und `#motiv`, dazu ein `<title>` (Biome `noSvgWithoutTitle` prüft auch SVG-Dateien).
  - `node scripts/icons.ts` erzeugt `public/icons/` byte-gleich bei jedem Lauf (geprüft per md5): `icon-192/512.png` und `icon.svg` als abgerundetes Quadrat mit transparenten Ecken (`any`, Favicon), `maskable-512.png` randlos mit Motiv auf 80 %, `apple-touch-180.png` randlos und deckend. `--preview=<ordner>` legt die Abnahmebilder ab (Home-Bildschirm hell/dunkel, Schutzzone).
  - `public/manifest.webmanifest` wie E2, `index.html` mit `manifest`, `icon` (SVG) und `apple-touch-icon` über `%BASE_URL%`.
  - `e2e/pwa.spec.ts` Punkt 1 grün (`pixel-7`, `desktop`). **Kanarienvogel:** `apple-touch-180.png` mit transparenten Ecken → `minAlpha: 0`, rot.
  - **Icon vom Nutzer abgenommen** (2026-10-05, „Icon passt“), siehe „Nutzerentscheidungen“.

- **2026-10-05, Stufe 1, Schritt 3 (Registrierung, Offline, Frische):**
  - `src/data/site.ts` (test-first): `loadSiteData` liefert `{ data, stale }`; `stale`, wenn die Antwort `X-Zp-Cache: offline` trägt, auch über den Frühstart. `lastSiteLoad()` merkt Zeitpunkt und Art des letzten erfolgreichen Abrufs für die Frische.
  - `src/data/pwa-start.ts` (Start): nach `load` `import("./pwa.ts")`, nur im Produktions-Build. `src/data/pwa.ts` (lazy, test-first mit Fakes, 21 Tests): `start` setzt `data-pwa="bereit"`, registriert `sw.js`, hört auf `ics-offline` und startet `watchFreshness` (30 Min. sichtbar bzw. `online` nach `stale`, zuerst `update()`, Neuladen nur bei `controllerchange` binnen 10 s, sonst Daten tauschen; ein Durchlauf zur Zeit). `register()` → `undefined` (Playwright „block“): kein Warten auf `ready`, Frische lädt nur Daten.
  - `src/ui/use-transit.ts` (test-first): Aktion `refresh` lädt eine fertige Tabelle neu (am HTTP-Cache vorbei); die alte gilt weiter, ein Fehlschlag behält sie, `stale` wird während des Neuladens ignoriert.
  - `App`: Frische tauscht Daten ohne Ladezustand; Statuszeile „Offline – Stand vom 5.10.“ als eigene Zeile wie der Wegzeit-Hinweis (`offlineNote`, Toast `ICS_OFFLINE` in `format.ts`).
  - E2E `e2e/pwa.spec.ts` 2–8 und „Frische-Anlass nach 30 Min.“ grün in `pixel-7` und `desktop`; Smoke „mit Service Worker“ (erster und zweiter Besuch, LCP < 2,5 s, CLS < 0,05) grün.
    - Punkt 3 (Kanarienvogel `setOffline`): `context.setOffline(true)` trifft auch `fetch` aus dem Service Worker (Chromium, Playwright 1.63). Der Rückfall über `context.route` war nicht nötig.
    - Punkt 7: `setOffline(false)` löst in Chromium selbst das Ereignis `online` aus (geprüft ohne eigenes Ereignis).
    - Punkt 4 braucht einen erlaubten Konsolenfehler, eng gefasst auf `/assets/export/*.js … net::ERR_FAILED`: Das Vorladen des Export-Codes scheitert offline, wenn der Chunk nie geladen wurde (nicht im Precache, E3).
  - **Abweichung (Precache):** Die Liste enthält zusätzlich den PWA-Kern `assets/app/pwa-*.js` (Plugin-Option `startChunks`). Er lädt bei jedem Start nach `load`. Ohne ihn fehlte er beim ersten Offline-Start, und weder die Frische (Punkt 7) noch der ICS-Hinweis (Punkt 5) liefen. Andere Lazy-Chunks bleiben draußen.
  - **Kanarienvögel E2E, alle rot gesehen und zurückgenommen:** ohne `site.json` im Precache → Punkt 4 rot; ICS offline als Netzfehler statt 204 → Punkt 5 rot; fremde Origins im Service Worker gecacht → Punkt 8 rot; Frische ohne `transit.refresh()` → E4a-Test rot (kein Request auf `wegzeit.json`); ohne `X-Zp-Cache` → Punkt 4 rot (kein „Offline“).
  - Weitere Kanarienvögel: Budget `App-Extras JS (lazy)` (Chunk um 20 kB aufgebläht → rot); `app-data-only-lazy` (statischer bzw. Typ-Import von `pwa.ts` aus `App.tsx` und aus dem Lader `pwa-start.ts` → rot; ein zusätzlicher statischer Import im Lader fängt dieselbe Regel, bevor `lazy-loader-static` an der Reihe ist); Chunk-Wächter (Zuordnung `assets/app/` entfernt → `pwa-*.js` direkt in `assets/`, rot).
  - Bestehende E2E: `exportPreload` heißt jetzt `startPreloads` und wartet zusätzlich auf den PWA-Kern (der Request ist für alle gleich, käme sonst zu zufälliger Zeit in die Zählung). Nach dem Öffnen des Kind-Sheets warten die Zählungen in `startpunkt.spec.ts` und `karte.spec.ts` auf den Abschnitt „Als App“.
  - **Entscheidungspunkt E5 (nach Schritt 3):** `JS (initial)` 91,22 kB (+0,31 kB über X), unter dem Ziel 91,40 kB.
- **2026-10-05, Stufe 1, Schritt 4 (Installationshilfe):**
  - **Stub-Probe:** `AppSection` als Stub mit geteilten Start-Modulen (`Icon`, `plural`, `standDate`, wie ADR 0012 verlangt), `vite build`: Chunk-Wächter grün, nichts abgespalten, `$initial` zieht `assets/app/` nicht in den Einstieg. Start-JS 91,35 kB, `App-Extras` 0,99 kB.
  - `src/domain/pwa.ts` (test-first): `installHelp(state)` für `app`, `angebot`, `installiert`, `menue`, `ios`, `keine`. `src/data/pwa.ts` (test-first): `createInstallStore` merkt `beforeinstallprompt` (`preventDefault`), erkennt `display-mode`/`navigator.standalone`, iOS heuristisch (UA, iPadOS über `maxTouchPoints`), Android über den UA; `prompt()` gilt einmal. Typ des Events in `src/env.d.ts` statt eines Casts.
  - **Kleine Ergänzung zu E7:** Zustand `installiert` („Installiert. Öffne den Zwergenplan jetzt über das Symbol auf dem Startbildschirm.“) nach angenommenem Angebot bzw. `appinstalled`. Sonst zeigte Android danach wieder „Im Browser-Menü …“.
  - `src/ui/AppExtras.tsx` (Start) lädt Abschnitt und PWA-Kern parallel; `src/ui/app-extras/AppSection.tsx` mit `useSyncExternalStore`, Teilen-Symbol inline (nicht in `icons.tsx`, das läge im Start). Platzhalter `.app-pending` in Höhe der Überschrift, `LoadFailed` mit `lazy-note`.
  - **Abweichung (Lazy-Kette):** `AppSection` importiert `pwa.ts` nicht statisch, der Lader reicht `install` als Prop herein. Gemessen: Mit statischem Import schreibt Vite den Preload-Helfer `__vite__mapDeps` in den Einstieg (91,47 kB, über dem Ziel); mit dem Prop 91,37 kB. Dazu `setLoad({ kind: "ready", ...site })` statt Feldern (−11 B).
  - E2E `e2e/installieren.spec.ts`: „läuft als App“, „Browser bietet an“ (Tipp ruft `prompt()`, danach „Installiert“), „iPhone“ (nur `iphone-15`), „ohne Angebot“ (Android: Browser-Menü, Desktop: kein Abschnitt). Je sichtbarer Zustand `expectMobileUx` hell und dunkel und 320 px/200 % als eigene Tests, in allen fünf Geräteprojekten grün. **Kanarienvögel:** `prompt()` nicht gerufen → rot; `display-mode` ignoriert → rot.
  - Kanarienvögel der Regeln: `KidSheet` importiert `AppSection` statisch → `app-extras-ui-only-lazy` und `app-extras-ui-entry-only` rot; dynamisch aus `KidSheet` → `app-extras-ui-entry-only` rot; Typ-Import von `pwa.ts` aus `KidSheet` → `app-data-only-lazy` rot.
  - **Entscheidungspunkt E5 (nach Schritt 4, Stand Stufe 1):** `JS (initial)` **91,37 kB** = X + 0,47 kB, unter dem Ziel 91,40 kB und dem Budget 92 kB. `App-Extras JS (lazy)` 2,13 kB (Budget 5 kB), `Service Worker` 1,48 kB (Budget 8 kB). Für Stufe 2 bleiben bis zum Ziel nur 0,03 kB: Die Schätzung dort (Flag `neu`, Platzhalter `NewsBlock`, „Push an?“, ≈ 0,10 kB) passt nicht ohne die benannten Kandidaten zum Auslagern. Entschieden wird vor Schritt 9 (siehe „Stufe 2“ unter „Schritte“).
  - **Erster voller `pnpm check` (8 Worker, alle Projekte, Rechner mit Last 23–56 durch parallele Sitzungen): 6 rot.** Ursachen:
    - `installieren.spec.ts` (3 × `iphone-15`): hell, dunkel und 320 px/200 % in einem Test lagen in WebKit bei ≈ 19 s und unter Last über dem Timeout von 30 s. Behoben wie in `mobile-ux.spec.ts`: je Zustand eigene Tests für hell, dunkel und 320 px/200 % (je ≈ 13 s). Die Kanarienvögel (`prompt()` fehlt, `display-mode` ignoriert) wurden auf der neuen Struktur erneut rot gesehen.
    - `perf.spec.ts` LCP (`pixel-7` 2764 ms, `android-klein` 4524 ms): allein mit einem Worker 1436 ms bzw. 2064 ms, grün. Der Service Worker ist dort blockiert, der PWA-Kern lädt nach `load`; die Messung zeigt die Konkurrenz der Worker, nicht die Seite (vgl. Plan 0003, E8). Keine Schwelle geändert.
    - `karte.spec.ts:363` (`pixel-7-quer`) und `:401` (`iphone-15`): allein zweimal wiederholt grün.
  - **Zweiter voller `pnpm check`:** alles grün bis auf `perf.spec.ts` LCP (`pixel-7`, `android-klein`). **A/B gegen `main` (`693ffd1`)**, abwechselnd, je 10 Läufe, Fixture-Build, `PW_SUITE=chromium`, Median (Max) in ms:

    | Gerät | main, 1 Worker | Branch, 1 Worker | main, 4 Worker | Branch, 4 Worker |
    |---|---|---|---|---|
    | `pixel-7` | 1404 (1532) | 1406 (1552) | 1606 (1716) | 1622 (1784) |
    | `android-klein` | 1376 (1420) | 1394 (1464) | 1598 (1672) | 1614 (1712) |

    Kein messbarer Unterschied (≤ 1,5 %, im Rauschen), kein Lauf ≥ 2500 ms. Das Rot im vollen Lauf kommt von der Last (8 Worker, WebKit parallel, Rechner mit Last bis 56 durch andere Sitzungen); in CI läuft E2E geshardet mit 2 Workern (Plan 0013).
- **2026-10-05, Stufe 1, Schritt 5 (Doku):** `docs/architecture.md` (Schicht `src/sw/`, Absätze „Service Worker“ und „App-Extras“, Ausnahme im Absatz Wegzeit, Biome-Globals, E2E mit Service Worker), README („Als App installieren“, Notausgang), ADR 0013 angenommen.

## Arch-Review (Stufe 1) – Verdict: Freigabe mit Änderungen → eingearbeitet (2026-10-05)

Alle Befunde übernommen außer Finding 4 und der Zusammenführung mit Plan 0012 (`linien.json` in `routes.ts`, `failed`-Zweig im Reducer, Frische-Test mit Linien): Die macht der Orchestrator bei der Integration, sobald 0012 auf `main` ist.

- **B1 (Blocker) `networkKeeping`:** `res.clone()` kam erst nach `await caches.open()`. Da hatte `respondWith` den Body schon gelesen, `clone()` warf, `.catch` schluckte es: `wegzeit.json` landete nie in `zp-data`, `site.json` blieb auf dem Stand des Installs.
  - Behoben: Kopie synchron mit der Antwort, `waitUntil` sofort (auch wenn `site()` per Zeitlimit die Kopie liefert).
  - Neue E2E in `pwa.spec.ts`: (a) mit gespeichertem Stadtteil installieren, online neu laden, offline neu laden → „Wegzeit ab Gostenhof mit Bus & Bahn“; (b) nach einem zweiten Online-Laden enthält `zp-data` die frische `site.json` (die Kopie vom Install wird vorher durch eine erkennbar alte ersetzt).
  - **Kanarienvogel:** Beide Tests liefen zuerst gegen den alten Code: (a) zeigte „Entfernung als Luftlinie … Wegzeiten gerade nicht verfügbar“, (b) behielt „alt“. Beide rot, mit dem Fix grün.
- **H2 Gates für „menue“ und „installiert“:** `installieren.spec.ts` prüft jetzt alle fünf sichtbaren Zustände je hell, dunkel und 320 px/200 % (`menue` nur in den Android-Projekten, `ios` nur in `iphone-15`). `mobile-ux.spec.ts` („kind-sheet“) wartet auf `.app-pending` = 0.
  - **Befund dabei (echter Fehler):** Nach dem Tipp auf „Zum Startbildschirm hinzufügen“ verschwand der Knopf mit dem Fokus, der Fokus fiel im Modal auf `<body>`. Jetzt geht er auf die Zeile „Installiert …“ (`tabIndex={-1}`, `focus({ preventScroll: true })`). Test „… danach ‚Installiert‘ mit Fokus“, Kanarienvogel: ohne `focus()` rot.
  - **Befund dabei (Test):** Unter Last klickte Playwright, während das Sheet noch einfuhr (0,38 s), und scrollte dabei das Sheet selbst (`overflow: hidden`). Die Gates meldeten dann „Dein Zwerg“ in der Rundung. Ein Finger kann das nicht; `focus()` ohne `preventScroll` aber schon. Die Specs warten deshalb vor dem Tipp auf das Ende der Öffnungs-Animation. Danach 3 × wiederholt mit 6 Workern alle grün (159 Tests).
- **H3 Notausgang:** statt „`return;` in `startPwa`“ (scheiterte an Biome `noUnreachable` und den E2E) ein Schalter zur Build-Zeit: `ZWERGENPLAN_SW=aus` setzt `__SW_OFF__` (die Seite registriert nicht) und baut `src/sw/kill.ts` als `sw.js`. Die Logik steht rein in `src/sw/retire.ts` (Unit-Test, in `coverage.include`, „Typen SW“, knip-Entry). `pwa.spec.ts` und der Smoke „mit Service Worker“ überspringen sich mit Begründung. Einmal im Browser durchgespielt (Skript in `e2e/.artifacts/`, nicht committet): normaler Build installiert, Kill-Build ausgetauscht, Neuladen → Controller weg, keine Registrierung, keine `zp-*`-Caches, auch nach erneutem Laden nicht. README beschreibt den Weg über `env` in `ci.yml`.
- **H5 `stale` trotz Netz:** Nach dem 5-s-Zeitlimit kommt die Kopie, obwohl das Gerät online ist, und `online` folgt nie. `start()` plant dann einmal nach 30 s (`STALE_RETRY_MS`) einen Frische-Anlass; ein früherer Anlass oder das Aufräumen stoppt ihn. Unit-Tests, Kanarienvogel: ohne den Timer rot.
- **H6 `startChunks`:** jetzt eine Liste, jedes Muster muss einen Chunk treffen, sonst wirft der Build. Unit-Test; Kanarienvogel: umbenanntes Muster in `vite.config.ts` → „vite-sw: kein Chunk passt zu …“.
- **H7 Export-Code im Precache:** `src/domain/ics.ts` steht in `startChunks`. Damit entfallen die erlaubten Konsolenfehler in `pwa.spec.ts` ganz.
- **H8:** Test 5 (ICS offline) steht außerhalb jedes `describe` mit erlaubten Konsolenfehlern (es gibt keine mehr).
- **H9:** `app-data-only-lazy` gilt auch für `src/main.tsx`. Kanarienvogel: `main.tsx` importiert `pwa.ts` statisch → rot.
- **H10 später `controllerchange`:** Kommt der Wechsel erst nach 10 s, merkt sich `watchFreshness` das und lädt beim nächsten Sichtbarwerden neu, nie mitten in der Bedienung. Unit-Test; Kanarienvogel: ohne das Neuladen rot.
- **H11 Text:** „Die App startet leer: Alter, Merkliste und Stadtteil dort noch einmal eintragen.“ einheitlich in `src/domain/pwa.ts`, README und E7.
- **H12 Start-Budget:** Offline-Text und `stale`-Zweig liegen jetzt im PWA-Kern (`offlineNote`, `ICS_OFFLINE` in `src/data/pwa.ts`, Datum per `Intl` in Berlin). `loadSiteData` liefert wieder nur `SiteData`; `lastSiteLoad()` trägt `stale` und `generatedAt`. Die App hält nur eine Zusatzzeile `pwaNote`, die der Kern setzt.
  - Folge: Die Zeile „Offline – Stand vom …“ erscheint erst nach `load` (offline ein kleiner Sprung, kein Gate betroffen, CLS wird offline nicht gemessen).
  - Gemessen: **91,37 kB → 91,34 kB** (−33 B). Ein gemeinsamer `import()` für Start und Abschnitt (`loadPwa` in `pwa-start.ts`) brachte +3 B und wurde verworfen. Der Rest im Start ist der Lader des Abschnitts (≈ 0,16 kB) und der PWA-Start samt Frische-Callback (≈ 0,15 kB); weiter ginge es nur, indem Funktionen wegfallen.
  - Die Budget-Entscheidung für Stufe 2 steht jetzt vor Schritt 9 (siehe „Schritte“).
- Gates nach dem Review: `pnpm check:fast` grün, `pnpm size` grün (Chunk-Wächter, `JS (initial)` 91,34 kB, `App-Extras JS (lazy)` 2,48 kB, `Service Worker` 1,54 kB). Gezielt gelaufen: Chromium `pwa`, `mobile-ux`, `startpunkt`, `theme` (651 grün), `installieren` 3 × mit 6 Workern (159 grün), WebKit `installieren` und `mobile-ux`-Kind-Sheet (144 grün), Smoke „mit Service Worker“ grün.

## Merge mit Plan 0012 (2026-10-05)

`origin/main` 61de0da (Plan 0012 „Linien“ und der Font-Swap-Fix aus Plan 0013) per Merge-Commit nach `pwa-0011` geholt.

- **Konflikte:** nur drei. Die Imports in `e2e/karte.spec.ts` und `e2e/startpunkt.spec.ts`: `startPreloads` statt `exportPreload`, dazu `expectTwoLines`/`twoLinesEverywhere` aus 0012. Und der Reducer in `src/ui/use-transit.ts`: `bereit` trägt jetzt `lines?` **und** `refresh?`, die Aktionen `lines` und `refresh`. Alles andere (Doku, ADR 0013, `.size-limit.json`, `fixtures.ts`, `smoke.spec.ts`, `mobile-ux.spec.ts`) ließ sich ohne Konflikt zusammenführen. Die Doku-Stellen zu `wegzeit.json` und `linien.json` folgen der Fassung aus 0012 und sind um 0011 ergänzt.
- **Service Worker:** Regel 5 heißt jetzt `oepnv` und gilt für `TRANSIT_FILES` (`data/wegzeit.json`, `data/linien.json`), auch mit Query; Reihenfolge in `routes.test.ts` angepasst. `linien.json` kommt **nicht** in den Precache (lädt nur auf Anlass), sondern wie die Tabelle in den Laufzeit-Cache `zp-data`.
- **Reducer (Arch-Review, Finding 4):** `failed` beim Neuladen behält Tabelle **und** Linien (`{ ...rest, attempt }` ohne `refresh`, wegen `exactOptionalPropertyTypes`). Der Effekt nutzt `deliverLoad` aus 0012. Neue Tests (test-first, `failed` war vorher rot): `refresh` → `lines` mit altem Versuch wird ignoriert; `refresh` → `failed` behält Tabelle und Linien; `refresh` → `loaded` → `lines` des neuen Versuchs wird übernommen.
- **E2E:** Der Frische-Test wartet auch auf `linien.json` und zählt genau einen weiteren Request je Datei. Offline-Test (a) prüft zusätzlich die Linie im Detail („ca. 15 Min. mit Tram 1 ab Gostenhof“) aus `zp-data`. **Kanarienvogel:** ohne die Erweiterung in `routes.ts` rot, zuerst schon bei „`linien.json` über den Service Worker“; ohne diese Zwischenprüfung fehlt offline „mit Tram 1“ im Detail.
- **Start-JS gemeinsam:** 91,72 kB (Budget 92 kB, nicht angehoben). Eingetragen auch in ADR 0012.

## Browser-Review live (Stufe 1, Schritt 6, 2026-10-06) – Ergebnis: bestanden bis auf Befund B1 (behoben), Geräteprüfung bestanden

Ziel: https://zwergenplan.app/ mit Stand `b23eb6c` (geprüft über `data/meta.json`), echte Daten (333 Angebote, Stand 4.10.). Playwright 1.63 mit **echtem Service Worker** (`serviceWorkers: "allow"`), Chromium (Profil Pixel 7 bzw. Desktop Chrome) und WebKit (Profil iPhone 15), `de-DE`, Europe/Berlin, `reducedMotion: reduce`. Wegwerf-Skripte und alle Screenshots liegen außerhalb des Repos in `/home/suus/.claude/jobs/70a152b4/tmp/review-0011/` (`pwa-live.ts`, Bilder in `shots/`, Kontaktbögen in `sheets/`).

**Vorgehen:**
- Standard-Matrix `node scripts/screenshots.ts https://zwergenplan.app/`: 168 Bilder (14 Ansichten × 6 Viewports × hell/dunkel), alle angesehen (Kontaktbögen je Ansicht). Dazu derselbe Lauf mit `serviceWorkers: "block"` als Vergleich, Pixelvergleich per ImageMagick (`compare -fuzz 2%`).
- Manifest, Icons und Tags; Registrierung und Caches; Offline mit und ohne gespeicherten Stadtteil; erster Start offline; wieder online; Frische nach 30 Min.; Installationshilfe in allen sichtbaren Zuständen (je hell/dunkel, 360 px und 320 px/200 % Wurzel-Schriftgröße); Konsole; LCP mit und ohne Service Worker.

**Befunde:**
- **B1 (Fehler, behoben auf `pwa-0011`, live nach dem nächsten Deploy erneut zu prüfen): Die Statuszeile „Offline – Stand vom …“ fehlt live fast immer.** Offline neu geladen erscheint nur „333 Angebote ab heute“ (`chromium-{light,dark}-offline-start.png`, `chromium-erster-start-offline.png`). Gezählt: in 2 von 30 Offline-Starts erschien die Zeile, in 0 von 20 Neuladungen in Folge (je 10 bei CPU 1× und 4×).
  - Der Service Worker arbeitet richtig: `site.json` kommt offline mit `X-Zp-Cache: offline`, `data-pwa="bereit"` ist gesetzt.
  - **Ursache, gemessen mit Zeitstempeln:** `load` (40–83 ms) → PWA-Kern `start()` setzt `data-pwa` und ruft sofort `showNote` (78–279 ms) → erst danach ist `site.json` gelesen und die Liste da (117–374 ms). `showNote` liest `lastSiteLoad()`. Das ist zu diesem Zeitpunkt noch `undefined`, also setzt es eine leere Zeile, und später ruft es niemand mehr. Die Reihenfolge kommt aus Arch-Review H12: Seitdem setzt der PWA-Kern die Zeile, nicht mehr die App nach dem Laden. Mit den kleinen Fixture-Daten ist `site.json` vor `load` fertig, deshalb bleiben `pwa.spec.ts` 4 und 7 grün.
  - **Mitbetroffen:** Der 30-s-Wiederholer nach einem Funkloch (Arch-Review H5) wird in `watchFreshness` nur geplant, wenn `lastLoad()?.stale` beim Start schon gilt. Live wird er deshalb ebenso selten geplant. Nicht betroffen ist der `online`-Listener, denn er liest `lastLoad()` erst beim Ereignis. Wird er per Hand ausgelöst, erscheint die Zeile richtig (`chromium-dark-offline-statuszeile-provoziert.png`), und nach dem Wieder-online-Gehen verschwindet sie wieder (`chromium-*-wieder-online-nach-note.png`).
  - **Mögliche Richtung, nicht umgesetzt:** Der Kern wertet nach jedem abgeschlossenen Laden aus statt nur beim Start. Zum Beispiel ruft `pwa-start.ts` einen Rückruf aus `loadSiteData`, oder `start()` wartet auf den ersten Abruf, dann folgen `showNote` und der Wiederholer. Als Kanarienvogel in `pwa.spec.ts` 4 sollte `site.json` verzögert ausgeliefert werden (z. B. per `page.route` mit 1 s Verzögerung vor dem Offline-Gehen bzw. eine große Fixture). So läuft der Test in derselben Reihenfolge wie live.
  - **Behebung (2026-10-06, test-first):**
    - `src/data/site.ts` hat einen Rückruf-Platz `onSiteLoad`; `loadSiteData` ruft ihn nach jedem erfolgreichen Abruf auf, nachdem `lastSiteLoad()` gesetzt ist (ein Abonnent, im Start-Bundle +6 B).
    - `pwa-start.ts` reicht ihn als `onLoad` an den Kern. `watchFreshness` wertet in `evaluate()` nach **jedem** Laden aus: Statuszeile (`showNote`) und der 30-s-Wiederholer (H5, weiterhin einmal je Seite). Ist das Laden beim Start des Kerns schon fertig, wirkt der erste Aufruf sofort. Das Aufräumen meldet den Rückruf ab.
    - Unit-Tests: Laden nach dem Start setzt und löscht die Zeile; der Wiederholer wird auch bei späterem Offline-Abruf geplant, einmal; `onSiteLoad` meldet jeden Erfolg, keinen Fehlschlag. Alle drei vorher rot.
    - E2E `pwa.spec.ts`: Ein Init-Skript hält die Antwort auf `site.json` zurück, bis der Kern läuft (`data-pwa="bereit"`), also in der Reihenfolge wie live. (1) offline → „Offline – Stand vom 5.10.“ erscheint. (2) H5: online, aber mit `X-Zp-Cache: offline` nach dem Start des Kerns; nach `clock.fastForward(31 s)` holt der Wiederholer den frischen Stand, die Zeile verschwindet.
    - **Kanarienvögel:** Beide E2E-Tests mit dem alten Kern rot („8 Angebote ab heute“ ohne „Offline“). Der H5-Test ist zusätzlich rot, wenn nur der Timer des Wiederholers fehlt (kein zweiter Abruf, Timeout).
    - Start-JS 91,72 → 91,73 kB (Budget 92 kB unverändert).
- **H1 (Hinweis):** Der Toast „Kalender-Datei braucht Netz“ trägt das grüne Häkchen des Toasts (`Toast.tsx` zeigt immer `check`), obwohl er etwas meldet, das nicht geklappt hat (`chromium-{light,dark}-offline-ics-toast.png`). Funktional korrekt: Die Seite bleibt stehen (URL unverändert, Detail offen), der Service Worker antwortet mit 204. → `docs/ideas.md`.
- **H2 (Hinweis, gewollt nach E4):** Der zweite Besuch ist mit Service Worker etwas langsamer als mit HTTP-Cache allein (LCP-Median 572 statt 392 ms, Tabelle unten). Grund: Netz zuerst mit `cache: "no-cache"` prüft `site.json` jedes Mal nach, der HTTP-Cache allein liefert die bis zu 10 Min. alte Kopie ohne Request. Der erste Besuch ist unverändert, beide Werte liegen weit unter 2,5 s, CLS ≤ 0,0001.
- **H3 (Hinweis, Werkzeug):** Drei von 168 Bildern weichen vom Lauf ohne Service Worker ab (`kind-quelle-{iphone,quer,320}-dark.png`). Auf den Bildern ist nur die Scrollposition im Kind-Sheet anders. Wiederholt man den Lauf, wechselt die Abweichung zufällig die Ansicht und tritt auch **ohne** Service Worker auf (drei Wiederholungen mit `block`). Ursache ist die Ansicht „kind-quelle“ in `scripts/screenshots.ts`: Sie scrollt, bevor der Platzhalter „Als App“ verschwindet. Danach klemmt die Scrollhöhe. Für die App ohne Bedeutung, die übrigen 165 Bilder sind pixelgleich.
- **Offen (Werkzeug):** In Playwright-WebKit führt jede Navigation nach `context.setOffline(true)` zu „WebKit encountered an internal error“, und ein `fetch` aus der Seite über den Service Worker endet mit „Load failed“. Offline in WebKit ist damit hier nicht prüfbar und bleibt bei der Geräteprüfung. Online war in WebKit alles wie in Chromium: Registrierung, `controller`, Precache, `zp-data` mit `wegzeit.json`/`linien.json`, Navigation Preload an, Zustand „ios“ der Installationshilfe.

**Geprüft und in Ordnung:**
- **Darstellung mit Service Worker:** 165 von 168 Bildern pixelgleich mit dem Lauf ohne Service Worker, die übrigen 3 siehe H3. Keine Regression in den Ansichten Start, Kalender, Merkliste, Detail, Filter, Kind, Startpunkt, Wegzeit-Filter, Karte, Ort, Anbieter, Anbieter-Sheet und Tabs (alle Viewports, hell und dunkel).
- **Manifest** (`/manifest.webmanifest`, 200, `application/manifest+json`): `name`/`short_name` „Zwergenplan“, `lang: de`, `id`/`start_url`/`scope` `./`, `display: standalone`, `background_color`/`theme_color` `#e8f1ff`, Icons 192 und 512 `any` sowie 512 `maskable`.
- **Icons:** Alle liefern 200 mit der angegebenen Größe. `icon-192/512.png` haben wie vorgesehen transparente Ecken (abgerundetes Quadrat). `maskable-512.png` und `apple-touch-180.png` (180 × 180) sind deckend, mit Alpha überall 255 und Eckfarbe `#e8f1ff`. `icons/icon.svg` liefert 200 als `image/svg+xml`.
- **`index.html`:** `theme-color` hell `#e8f1ff` und dunkel `#0e1620` (je mit `media`), `color-scheme: light dark`, `manifest`, `icon` (SVG), `apple-touch-icon`, `robots: noindex, nofollow`. Es gibt kein `apple-mobile-web-app-status-bar-style` und kein `apple-mobile-web-app-title`. Die Statusleiste prüft die Geräteprüfung.
- **`sw.js`:** 200, `application/javascript`, `max-age=600`, 4 045 B.
- **Registrierung:** `ready`, Zustand `activated`, Scope `https://zwergenplan.app/`, `controller` schon nach dem ersten Besuch (`clients.claim`) und nach dem Neuladen, Navigation Preload `enabled`.
- **Precache** `zp-shell-5beb5ac63eeb`: `index.html`, Einstieg, Start-CSS, Latin-woff2, `assets/app/pwa-*.js`, `assets/export/ics-*.js` (6 Einträge). In `zp-data` liegt `site.json`.
  - Mit Stadtteil kommen nach dem Gebrauch `wegzeit.json` und `linien.json` in `zp-data` und der Chunk `assets/oepnv/transit-*.js` in `zp-assets`. Im Schalen-Cache stehen sie nie.
  - Nach dem Öffnen der Karte liegen deren Chunks in `zp-assets`. In keinem Cache steht ein fremder Origin (0 Einträge, ADR 0008).
- **Offline mit Stadtteil Gostenhof** (abgesehen von B1): Die Liste kommt mit 40 Kacheln und der Wegzeitzeile „Wegzeit ab Gostenhof mit Bus & Bahn …“. Das Detail „Babymassage (Sept.–Okt., dienstags)“ zeigt offline aus `zp-data` „ca. 45 Min. mit U1 → Bus 54 ab Gostenhof“ (`chromium-*-offline-detail.png`). „In den Kalender“ zeigt den Toast, die Seite bleibt stehen. Danach lässt sich das Filter-Sheet öffnen und schließen.
- **Karte offline:**
  - Ohne gecachten Chunk erscheint der bestehende Hinweis „Die Karte konnte nicht geladen werden. Alle Angebote stehen in der Liste.“ mit „Nochmal versuchen“ (`chromium-*-offline-karte.png`).
  - Mit vorher online geöffneter Karte kommt der Chunk aus `zp-assets`. Die Kacheln liefert dann der HTTP-Cache des Browsers, nicht der Service Worker, und die Karte steht (`chromium-*-offline-karte-chunk-gecacht.png`).
- **Erster Start offline:** neuer Kontext, einmal online laden, `ready`, sofort offline und neu laden. Die App öffnet mit der Liste aus dem Precache (die Zeile fehlt, siehe B1).
- **Wieder online:** `setOffline(false)` und `online` laden `site.json` frisch aus dem Netz (200, ohne `X-Zp-Cache`), ohne Neustart. Die Statuszeile ist danach normal.
- **Frische nach 30 Min.:** Die Uhr der Seite wird um 31 Min. vorgestellt, dann folgt `visibilitychange`. Danach gibt es genau einen Request je Datei (`site.json`, `wegzeit.json`, `linien.json`), und die Wegzeitzeile bleibt erhalten.
- **Installationshilfe** (`install-<zustand>-<hell|dunkel>-<360|320-200>.png`, Kontaktbögen `sheets/install-*.png`):
  - `menue` (Pixel 7 ohne Angebot): „Im Browser-Menü „App installieren“ wählen.“
  - `angebot` (Stub wie `installieren.spec.ts`): Text und Knopf „Zum Startbildschirm hinzufügen“, 52 px hoch, bei 200 % 138 px (dreizeilig, ohne Abschneiden).
  - `installiert`: nach dem Tipp `prompt()` genau einmal gerufen. Der **Fokus liegt auf der Zeile** „Installiert. Öffne den Zwergenplan jetzt über das Symbol auf dem Startbildschirm.“ (`<p>`).
  - `app` (`display-mode`-Stub): „Läuft als App.“
  - `ios` (WebKit, iPhone 15): Teilen-Symbol inline und „Die App startet leer: …“.
  - `keine` (Desktop Chrome): Der Abschnitt fehlt.
  - In allen Zuständen kein waagerechtes Scrollen und nichts abgeschnitten. Der Abschnitt steht unter „Darstellung“ über „Fertig“.

**Messwerte LCP/CLS** (Chromium, Pixel 7, CPU 4×, 150 ms Latenz, 1,6 Mbit/s wie `throttleMobile`; je 5 Läufe, Median, in Klammern Min.–Max.):

| | erster Besuch | zweiter Besuch |
|---|---|---|
| mit Service Worker | 1896 ms (1848–2032) | 572 ms (452–648), `site.json` über den SW |
| ohne Service Worker (`block`) | 1880 ms (1852–1900) | 392 ms (384–404), HTTP-Cache |

CLS in allen Läufen ≤ 0,0001.

**Konsole:** Online gab es in keinem Lauf (Chromium, WebKit, Installationshilfe) einen Fehler oder eine Warnung, kein `pageerror`, keinen fehlgeschlagenen Request und keine Antwort ≥ 400. Offline fielen nur die bewusst abgebrochenen Requests an: die ICS-Navigation (`net::ERR_ABORTED` nach der 204-Antwort) und der ungecachte Karten-Chunk `assets/karte/MapScreen-*.js` (`net::ERR_FAILED` samt „Failed to load resource“).

**Checkliste (SKILL.md, Abschnitt 4):**
- **Lesbarkeit:** ja. Liste, Detail und Statuszeile sehen aus wie vor dem Service Worker. Der Abschnitt „Als App“ nutzt die Überschrift- und Textstile des Sheets und ist kurz. Was, wann, wo und frei sind in 2 Sekunden erfassbar. Die Offline-Zeile ist, wenn sie erscheint, gut lesbar in der Nebentextfarbe (`chromium-dark-offline-statuszeile-provoziert.png`). Dass sie live meist fehlt, ist B1.
- **Daumen-Erreichbarkeit:** ja. Der Knopf „Zum Startbildschirm hinzufügen“ ist ≥ 44 px hoch (52 px), volle Breite, im unteren Drittel des Sheets mit Abstand zu „Fertig“.
- **Zustände:**
  - Leer: Der Abschnitt fehlt am Desktop ohne Angebot.
  - Fehler offline: Die Karte zeigt ihren Hinweis, die Kalender-Datei den Toast.
  - Laden: Der Platzhalter `.app-pending` ist auf keinem Bild sichtbar, der Abschnitt springt nicht.
  - Lange Texte: „Installiert …“ und der iOS-Hinweis brechen bei 320 px/200 % sauber um.
  - Nichts wird abgeschnitten. Der fehlende Offline-Zustand ist B1.
- **Dark Mode:** keine grellen Inseln. Abschnitt, Knopf (gelb wie „Fertig“), Toast und Statuszeile haben genug Kontrast (alle `*-dark*.png`).
- **Micro-Interactions:** Der Tipp auf „Zum Startbildschirm hinzufügen“ lässt den Knopf verschwinden und setzt den Fokus auf die neue Zeile, ohne dass das Sheet scrollt. Der ICS-Toast erscheint ohne Sprung, trägt aber das Häkchen (H1). Geprüft wurde mit `reducedMotion: reduce`; neue Animationen bringt Stufe 1 nicht.
- **Konsistenz mit dem Design-System:** ja. `btn primary wide` wie die übrigen Hauptaktionen, Abschnittsüberschrift wie „Darstellung“, das Teilen-Symbol im Linienstil der übrigen Icons.

**Geräteprüfung (durch den Nutzer) – bestanden am 2026-10-06:** Der Nutzer hat alle 8 Punkte am echten Android-Gerät und iPhone bestätigt. Damit ist Stufe 1 abgenommen.
1. **Android, Chrome:** Kind-Sheet → „Als App“ → „Zum Startbildschirm hinzufügen“ (bzw. Menü „App installieren“). Erwartet: Das Symbol „Zwergenplan“ (Zipfelmützen-Sticker) ist deckend und ohne schwarzen Rand; danach steht dort „Installiert …“.
2. **iPhone, Safari:** Teilen → „Zum Home-Bildschirm“. Erwartet: Das Symbol ist deckend, ohne schwarzen oder weißen Rand, mit dem Namen „Zwergenplan“.
3. **Start über das Symbol (beide), hell und dunkel:** Erwartet: keine Browserleiste, eine lesbare Statusleiste ohne störenden Balken über dem Kopf, und im Kind-Sheet „Läuft als App.“
4. **Android-Splash:** Erwartet: hellblaue Fläche (`#e8f1ff`) mit Symbol, auch im Dunkelmodus (bewusst so).
5. **Flugmodus (beide):** App ganz schließen, Flugmodus an, App öffnen. Erwartet: Die Liste erscheint. „Offline – Stand vom …“ erscheint (B1 behoben in `fb5059b`). Im Detail führt „In den Kalender“ zum Toast „Kalender-Datei braucht Netz“, und die App bleibt bedienbar. Die Karte zeigt ihren Hinweis oder die zwischengespeicherte Karte.
6. **Flugmodus aus, App bleibt offen:** Erwartet: binnen Sekunden frische Daten ohne Neustart, kein „Offline“ in der Statuszeile.
7. **iPhone, erster Start offline:** Die frisch installierte App einmal öffnen, im App-Umschalter schließen, Flugmodus an und wieder öffnen. Erwartet: Die App öffnet mit der Liste, nicht mit „Keine Verbindung“. Den Stadtteil in der App neu setzen (eigener Speicher), dann zeigt das Detail offline die Linie (z. B. „mit U1“).
8. **Frische nach einem Deploy:** Die App mindestens 30 Min. im Hintergrund lassen, während ein neuer Stand live geht (`data/meta.json` zeigt einen neuen `commit`), dann zurückholen. Erwartet: neuer Stand ohne manuelles Neuladen.

## Akzeptanzkriterien

- **Stufe 1:**
  - Chrome zeigt „Installieren“. Ein iPhone startet nach „Zum Home-Bildschirm“ im Vollbild mit Icon.
  - Offline öffnet die App mit dem letzten Stand und dem Hinweis, online wieder frisch.
  - Alle bestehenden E2E-Tests sind unverändert grün (mit `serviceWorkers: "block"`).
  - `JS (initial)` ≤ 90 kB (Ziel ≤ X + 0,5 kB), die neuen Budgets halten, LCP/CLS mit Service Worker halten.
- **Stufe 2:**
  - Nach einem Deploy mit neuen Angeboten kommt auf jedem angemeldeten Gerät genau eine Nachricht. Mit gesetztem Geburtsdatum nennt sie die passenden Angebote, sonst die Gesamtzahl.
  - Ohne neue Angebote kommt keine Nachricht.
  - Der Worker-Endpunkt erhält nie Geburtsdatum, Stadtteil, Merkliste, `seenIds` oder Standort (E2E-Protokoll des Request-Bodys).
  - Nach dem Abmelden ist das Abo in KV gelöscht (bzw. beim nächsten Senden per 410 entfernt) und der Geräte-Speicher leer.

## Risiken

- **iOS-Verhalten ist nur teilweise dokumentiert.** → Spike zuerst (erledigt, siehe „Spike-Ergebnis“). Der allgemeine Text erscheint, wenn der Service Worker nichts anzeigt oder wirft.
- **Service Worker überzieht das Zeitbudget** (≈ 10 s auf iOS): keine Nachricht, und die nächsten Pushes kommen bis zu 10 Min. verspätet (Spike). → Hartes 5-s-Limit mit `Promise.race` und Fetch-Abbruch, Unit-Test mit hängendem Schritt (E10), kein `setAppBadge` im Service Worker.
- **Eigener Speicher der Home-Bildschirm-App auf iOS** (Spike h): Nach der Installation fehlen Alter und Merkliste. → Hinweis in der Installationshilfe. Eine Übertragung (z. B. per Link) wäre ein eigener Plan.
- **Apple beendet Push-Abos** bei längerer Nichtnutzung oder nach einem Neuinstallieren. → 410 räumt auf. Der Schalter zeigt den echten Zustand.
- **Geänderte IDs zählen als neu** (E9). → Hinnehmbar. Gibt es auffällig viele, prüft die Pipeline Titeländerungen (eigener Plan).
- **Pages-Cache:** `site.json` ist bis zu 10 Min. gecacht. → `notify` wartet auf den neuen Commit in `meta.json`, der Service Worker lädt mit `no-cache`.
- **Ein Service Worker kann einen alten Stand festhalten.** → Netz zuerst für Navigation und Daten, `cache: "reload"` im Precache, E4a. Notausgang im README: ein Deploy mit `sw.js`, der sich selbst abmeldet.
- **Start-JS-Budget** (E5): kaum Luft. Seit Plan 0012 liegt das Start-JS bei 91,28 kB, 0,72 kB unter dem Budget von 92 kB und 0,28 kB über dem Ziel 91,0 kB aus ADR 0012. → Lazy-Kette, Entscheidungspunkt, kein Anheben. *(Überholt durch Plan 0019: Budget 100 kB, siehe ADR 0012.)*
- **Missbrauch des Abo-Endpunkts** (Spam-Abos). → Allowlist der Push-Dienste, Größen- und Mengengrenze, Rate-Limit je IP. Die Origin-Prüfung hält nur fremde Webseiten ab, keine Skripte. Im schlimmsten Fall ist die Grenze von 500 voll. Dann `wrangler kv` leeren und neu einladen.
- **Kosten:** Cloudflare Workers und KV im Gratis-Tarif (100 000 Requests/Tag, 1 000 Schreibvorgänge/Tag) reichen für Familie und Freunde um Größenordnungen.

## Nutzerentscheidungen (2026-10-05)

1. **Cloudflare** als Ort für die Abos (ADR 0014): ja.
2. **Icon:** keine Vorgabe. Ein Entwurf im Stickerheft-Stil (Plan 0003) kommt in Schritt 2 zur Abnahme.
3. **Gerät für den Spike:** Ein aktuelles iPhone ist vorhanden. Schritt 0 kann beginnen, sobald Cloudflare eingerichtet ist (Teil von Schritt 7, vorgezogen).
4. **Icon (Schritt 2):** abgenommen am 2026-10-05 („Icon passt“), Vorschau hell/dunkel und Schutzzone aus `node scripts/icons.ts --preview`.

## Review (2026-10-05, plan-reviewer, Runde 1) – Verdict: Überarbeiten → eingearbeitet

Alle Findings übernommen, keines abgelehnt.

- **B1 Start-JS-Budget** (89,80/90 kB, `dist/assets/*.js` zählt Lazy-Chunks im Wurzelordner): Plan 0010 mit Paket 0 als Voraussetzung, Ausgangswert `X` messen, neue UI in die Lazy-Kette `assets/app/` mit Budget und Regeln, Entscheidungspunkt mit Schwelle 89,5 kB (E5).
- **B2 Uhr im Service Worker:** `now` kommt als `notification.data.sentAt` aus der Payload (E9, E10). Die E2E setzt `sentAt` auf das Fixture-Jetzt.
- **W1** `serviceWorkers: "block"` liefert `register() → undefined`, `ready` löst nie auf: Zeitlimit, kein Hänger, Unit-Test (E5b).
- **W2** Drittanbieter-Wächter: Fixture-Option `pushWorker: "mock"`. LCP mit Service Worker in `smoke.spec.ts` (E6, Tests).
- **W3** `push-worker/` in Vitest, dependency-cruiser (`DIRS`, `push-worker-isolated`), „Typen Worker“, knip. Abhängigkeiten im Root (E11).
- **W4** ADR geteilt: PWA/SW (angenommen in Schritt 5) und Push (Schritt 11); seit Runde 2 als ADR 0013 und 0014 nummeriert. Installationshilfe Black-Box per `addInitScript` und `iphone-15` statt `__E2E__`-Hintertür (E6).
- **W5** Precache mit `cache: "reload"`, Navigation Preload, Plugin-Test für den Entry (E3, E4).
- **W6** Origin-Prüfung serverseitig mit 403, Abnahme per `curl` ohne/mit fremdem `Origin` und Preflight (E11, Schritt 9).
- **W7** Eigener Workflow `push-test.yml`, Exit 0 mit `::warning::`, `fromJSON(...) > 0`, Commit-Vergleich mit `git rev-parse --short` (E11).
- **W8** `newsText`: 0 neue je Gerät und fehlende `seenIds` → allgemeiner Text bzw. bei Declarative nichts anzeigen (E9, E10). Tests ergänzt.
- **W9** Schalter mit Wartezustand und `role="switch"` (E12); Frische bei `visibilitychange`/`online` (E4a); eigener Speicher der iOS-App im Spike (h) und als Hinweis (E7); Checkliste mit deckendem Icon und hellem Splash (E2, Schritt 6).
- **H1** Recherche nach Push-API-Spec aktualisiert: `event.notification` immer nutzen, kein Content-Type nötig, Blink „Intent to Prototype“. Spike-Punkte (b), (c) entfallen.
- **H2** VAPID-`subject` `https://zwergenplan.app/`. **H3** Manifest-Pfade `./`, Service-Worker-Routen relativ zum Scope. **H4** `neu` in `route.ts`, keine Registrierung unter `pnpm dev`. **H5** „Nur passende“ wird nicht gespiegelt (Datensparsamkeit). **H6** `beforeinstallprompt` auf Modulebene. **H7** Kanarienvogel für `setOffline` im Service Worker. **H8** `routes.ts` in `coverage.include`, Rotation schont die aktuelle Version. **H9** Einträge in `docs/ideas.md` in Schritt 12. **H10** `requestPermission` als erstes `await`, mit Test.

## Review (2026-10-05, plan-reviewer, Runde 2) – Verdict: Freigabe mit Änderungen → eingearbeitet

Kein Blocker. Alle Findings übernommen, keines abgelehnt.

- **W1** Frische: zuerst `registration.update()`, bei neuem Service Worker Neuladen, sonst Daten tauschen. Eine geladene Wegzeit-Tabelle lädt mit, als dokumentierte Ausnahme von „einmal je Sitzung“ (E4a).
- **W2** Erster Start offline: `site.json` im Precache, E2E „einmal laden, sofort offline“ (E4, E6).
- **W3** ICS-Links sind Navigationen: Pfadregeln vor der Navigationsregel, die Schale nur für App-Pfade, offline 204 und Toast (E4, E6).
- **W4** `beforeinstallprompt` im Test nach `load` per `page.evaluate`, Stub mit `prompt()` und `userChoice`, kein Inline-Skript (E6).
- **W5** Lazy-Kette ausgeschrieben: Regeln mit `from`/`to`, `LAZY_LOADERS`, Vite-Prädikat, Stub-Probe gegen React-Abspaltung vor Schritt 4 (E5, E5b).
- **W6** Voraussetzung ist Plan 0010 vollständig. Der Kern der PWA ist nun ganz lazy, im Start nur ≈ 0,45 kB laut Tabelle, mit benannten Kandidaten zum Auslagern (E5).
- **W7** `NewsBlock` mit Platzhalter fester Höhe und CLS-Messung. Lade- und Fehlerzustände von `AppSection` und `NewsBlock`, `LoadFailed` mit `className` (E7, E13).
- **W8** `pushsubscriptionchange` im Service Worker und Endpoint-Abgleich beim Start, in ADR 0014 als Request ohne Tipp festgehalten (E10, E12).
- **W9** Reine Funktion `push-decision.ts` mit allen Zweigen in der Coverage, frühe Probe zu CDP und `getNotifications()` mit Rückfall, Fake auch für `getSubscription` und `unsubscribe` (E10, Tests).
- **W10** Biome-Globals für `src/ui` ergänzt, Kanarienvögel je Gate nach ADR 0004 (E5b, Schritte 1 und 9).
- **W11** `workflow_dispatch` geht nur vom Standard-Branch: Test auf dem Branch lokal, `--only=<Geräte-Kennung>`, `only` Pflicht im Workflow (E11, Schritt 11).
- **H1** ADR-Nummern auf 0013 (PWA) und 0014 (Push), weil Plan 0010 „ADR 0012“ freihält.
- **H2** Origin-Prüfung ist kein Schutz gegen Skripte. Grenzen sind Allowlist, Obergrenze und das neue Rate-Limit je IP (E11, Risiken).
- **H3** Zod-Schema der Payload in `scripts/lib/`, Worker mit eigenem Schema (E9).
- **H4** `GITHUB_SHA.startsWith(meta.commit)`, Output `news` immer gesetzt (E11).
- **H5** `cache: "reload"` nur für `index.html` und `site.json`, `waitUntil(preloadResponse)`, Zeitlimit 5 s für `site.json` (E4).
- **H6** `__SW_VERSION__` enthält den Inhalt von `index.html` (E3).
- **H7** `navigate` in `showNotification`, Spike (i) und (j) (E10, Ausgangslage).
- **H8** Funktionsnamen korrigiert: `parseRoute`/`routeToSearch` in `route.ts`, `urlFor` in `use-app-state.ts` (E13).
- **H9** Badge nur über `src/data/pwa.ts` (E5b, E10).
- **H10** `workerd` in `onlyBuiltDependencies`, `GET /version` mit Warnung bei veraltetem Worker (E11).
- **H11** Rückfall `context.route(…abort("internetdisconnected"))`, falls `setOffline` den Service Worker nicht trifft (E6).
- **H12** `NewsBlock` wendet nur die Altersregel an, keine anderen Filter. Was ausgeblendet ist, wird genannt (E13).
