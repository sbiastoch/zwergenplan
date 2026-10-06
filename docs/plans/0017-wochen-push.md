# Plan 0017 – Wochen-Push mit Such-Abos

Status: **freigegeben** (2026-10-06), Review Runde 1 und 2 eingearbeitet. Umsetzung ab Schritt 0 offen.
Datum: 2026-10-06
Bezug:
- **Ersetzt Stufe 2 von Plan 0011** (Push nach jedem Deploy). Stufe 1 von Plan 0011 (installierbare App, Service Worker, Offline) ist live und am Gerät abgenommen. Was aus Plan 0011 gilt, steht unter „Übernommen aus Plan 0011“.
- **ADR 0014** (Web Push, Entwurf): wird in Schritt 7 überarbeitet (Auslöser wöchentlich, Such-Abos auf dem Gerät) und dann angenommen. ADR 0013 (PWA und Service Worker) gilt unverändert.
- Spike-Ergebnis in Plan 0011 (iOS 26.5): gilt vollständig.
- Domäne aus Plan 0011, Schritt 8, liegt schon auf dem Branch `worktree-push-0011-s2` (`7b5ec18`): `src/domain/news.ts`, `push-payload.ts`, `push-types.ts`. Dieser Plan baut sie um (E4, E5).

## Ziel

- Wer möchte, bekommt **jeden Samstag um 10 Uhr** (Europe/Berlin) genau **eine** Nachricht aufs Gerät, auch wenn es nichts Neues gibt („Diese Woche nichts Neues für dich“).
- Die Nachricht wird **auf dem Gerät** zugeschnitten, nach dem Alter des Kindes und nach den **Such-Abos**:
  - Die aktuelle Sucheinstellung der Liste (Kategorien, Format, Anmeldung, Kosten, Wegzeit) lässt sich in den Push-Einstellungen (Kind-Sheet, Abschnitt „Als App“) mit „Aktuelle Suche abonnieren“ merken (der Filter-Sheet hat dafür kein Start-Budget, E9).
  - Die Abos erscheinen dort als Liste und lassen sich entfernen.
  - Die Nachricht nennt die neuen Angebote, die zu mindestens einem Abo und zum Alter passen. Ohne Abo zählt nur das Alter.
- Ein Tipp auf die Nachricht öffnet die App. Gab es Neues, öffnet sie das Sheet „Neu seit der letzten Wochen-Nachricht“.
- Such-Abos, Geburtsdatum und Startpunkt verlassen das Gerät nicht. Der Absender kennt nur das Push-Abo.

Nutzerentscheidungen dazu (2026-10-06):
1. **Option 2 zuerst:** eine Nachricht pro Woche, immer, auch ohne Neues. Die Filterung beim Absender (nur Nachrichten mit Treffern) ist eine spätere Stufe, siehe „Stufe 3“.
2. **Zeitpunkt:** Samstag, 10 Uhr.
3. **Zuschnitt:** Sucheinstellungen sind abonnierbar, die Abos erscheinen in den Push-Einstellungen.

## Nicht-Ziele

- **Filterung beim Absender** (eine Nachricht nur, wenn für das Gerät etwas passt). Das geht nur, wenn der Absender die Filter kennt. Siehe „Stufe 3“ und `docs/ideas.md`.
- **Nachricht nach jedem Deploy** (bisherige Stufe 2 von Plan 0011). Entfällt.
- **Mehrere Zeitpunkte oder ein frei wählbarer Wochentag.** Samstag 10 Uhr für alle.
- **Such-Abos ohne Push**, etwa als Schnellwahl in der Liste. Die Abos sind hier nur Zuschnitt der Nachricht. Eine Schnellwahl wäre ein eigener Plan (`docs/ideas.md`, neben „Abo-Feeds (webcal)“).
- **Startpunkt Standort oder Kartenmitte in einem Abo.** Beide leben nur im Arbeitsspeicher (Invariante „Startpunkt“). Die Wegzeit eines Abos gilt ab dem gespeicherten Stadtteil.
- **App-Badge.** Wirkt auf iOS nicht, `setAppBadge` im Service Worker hängt (Spike g).

## Übernommen aus Plan 0011 (gilt unverändert, soweit unten nichts anderes steht)

- **E5b** Architekturregeln: `src/data/push.ts` ist der einzige Ort für `PushManager` und `Notification`, `src/data/pwa.ts` für Service Worker und Badge; Schicht `src/sw/`; die dependency-cruiser-Regeln `sw-isolated`, `sw-not-imported`, `no-zod-in-sw`, `app-extras-*`, `app-data-only-lazy`, `news-not-in-start`, `push-worker-isolated`, `web-push-only-in-push-send`; Biome-Globals; Kanarienvögel für jedes neue Gate.
- **E8** Geräte-Speicher `src/data/device-store.ts` (IndexedDB `zwergenplan`, Store `kv`, `get`/`set`/`del`, ohne npm-Paket). Die gespiegelten Einträge erweitert E6 dieses Plans.
- **E10** Push im Service Worker: Payload aus `event.notification`, sonst `event.data.json()`; `now` = `data.sentAt`; **hartes Limit 5 s** mit `Promise.race` und `AbortSignal.timeout(4000)`; `navigate` in jedem `showNotification`; kein `setAppBadge`; mit `event.notification` bei Fehler oder Zeitablauf **nichts** anzeigen (das System zeigt die deklarative Fassung), ohne `event.notification` die vorgeschlagene selbst anzeigen; `notificationclick` für Chromium/Firefox; `pushsubscriptionchange`. Die reine Entscheidung steckt in `src/sw/push-decision.ts`.
- **E11** Cloudflare Worker `push-worker/` vollständig: Routen `POST /abo`, `DELETE /abo`, `GET /abos`, `POST /abos/loeschen`, `GET /version`; Origin-Prüfung, Allowlist der Push-Dienste, Größe ≤ 2 kB, höchstens 500 Abos, Rate-Limit 10 je IP und Stunde; Gates für `push-worker/` (vitest, „Typen Worker“, knip, dependency-cruiser); devDependencies `wrangler`, `@cloudflare/workers-types`, `web-push`, `@types/web-push`. VAPID mit `subject: "https://zwergenplan.app/"`, `topic: "neueangebote"`, 404/410 → aufräumen, Ausgabe nur als Zahlen, Fehler beim Senden sind `::warning::` mit Exit 0. Testversand `--dry-run`, `--force` und `--only=<hash-präfix>`, „Geräte-Kennung“ (erste 8 Zeichen des `endpointHash`) im Abschnitt „Als App“.
  - **Geändert:** Es gibt keinen Job `notify` nach dem Deploy und kein `push-news.ts --against-deployed`. Den Auslöser regelt E1.
- **E12** An- und Abmelden (**geändert:** `seenIds` schreibt nur noch der Service Worker, E3): Schalter mit `role="switch"`, `pushSupport()` mit Zeitlimit 3 s, `Notification.requestPermission()` als **erstes `await`** im Tipp, Wartezustand, Rücksetzen bei jedem Fehler, Abmelden räumt auf, Schalter zeigt den echten Zustand, Abgleich beim Start in `push-start.ts`. Außerdem geändert: die Texte (E7).
- **E13** „Neu“ in der App: Flag `neu` in `route.ts`, Lazy-Block `NewsBlock`, Filter-Regel des Blocks (nur Alter, nicht die Listenfilter), „Chunk nicht ladbar“ → still entfernen. **Geändert:** „Neu“ ist ein Sheet über der Liste statt eines Blocks (E8, E9).
- Tests aus „Tests“ von Plan 0011 für Worker, `push.ts`, `push-start.ts`, `push-decision.ts`, `device-store.ts` (nur E2E), Fixture-Option `pushWorker: "mock"`, CDP-Zustellung mit früher Probe.

## Ausgangslage

- `FilterState` (`src/domain/filter.ts`): `categories`, `formats`, `registration`, `cost`, optional `reachLimit` (20/30/45 Min.). `filterToSearch`/`filterFromSearch` geben eine **kanonische** Form als Querystring (`kat=musik&wegzeit=20`). `matchesFilter(offer, state, reach)` prüft ein Angebot ohne Zeitbezug; die Wegzeit-Grenze wirkt nur mit einer `ReachFn` der Art „oepnv“.
- Der Filter steht nur in der URL, nicht im `localStorage`. Der Filter-Sheet (`FilterSheet` in `src/ui/Sheets.tsx`) liegt im Start-Bundle, sein Fuß hat „Zurücksetzen“ und „N Angebote zeigen“.
- Startpunkt: gespeichert wird höchstens die Stadtteil-ID (`zwergenplan.entfernung-ab`, `preferences.ts`). Die Wegzeit kommt aus `data/wegzeit.json` (`decodeTransitTable`, `transitReach` in `src/domain/transit.ts`); `districtById` (`src/domain/districts.ts`) liefert den Punkt eines Stadtteils.
- **Gemessen (2026-10-06):** Filter, Wegzeit-Tabelle, Alter und „Neu“ zusammen gebündelt (rolldown, minifiziert) ≈ **2,9 kB gzip**. Der Service Worker liegt heute bei 1,58 kB von 8 kB. Der Zuschnitt passt also in den Service Worker.
- Start-JS auf `main` (`297cc06`): **91,77 kB von 92 kB**, 0,23 kB Rest. Kein Anheben (ADR 0012).
- App-Extras JS (lazy) heute 2,5 kB von 5 kB.
- Pipeline-Läufe (neue Angebote) gibt es bisher etwa einmal pro Woche, von Hand über den Skill `babyevents-nuernberg`.

## Entscheidungen

### E0 – ADR 0014 zuerst (Review M6)

Vor Schritt 1 wird ADR 0014 (noch Entwurf) überarbeitet: Auslöser wöchentlich (E1), was zusätzlich im Geräte-Speicher liegt (E6), der neue Anlass „beim Push“ für `site.json` und `wegzeit.json` im Service Worker (E10, für alle gleich) und die Ausnahme von `transit-only-lazy`/`transit-entry-only` für `src/sw/` (E10). Die Invarianten in `docs/architecture.md` („Privatsphäre“, „Startpunkt“, „Kein Request hängt davon ab, welcher Startpunkt gilt“) werden im selben Schritt angepasst, nicht erst am Ende. Angenommen wird das ADR in Schritt 7.

### E1 – Auslöser: Zeitplan in GitHub Actions

- Neuer Workflow `.github/workflows/push-weekly.yml` mit **einem** Zeitplan in Berliner Zeit (GitHub kann seit März 2026 `timezone:` je Zeitplan, mit Sommer-/Winterzeit):
  ```yaml
  on:
    schedule:
      - cron: "7 10 * * 6"
        timezone: "Europe/Berlin"
  ```
  Minute 7 statt 0: GitHub warnt, dass Läufe zur vollen Stunde unter Last verspätet oder ganz verworfen werden. Gemeint ist „Samstag gegen 10 Uhr“.
- **Wächter** in der reinen Funktion `shouldSendNow(now: Date): boolean` (`scripts/lib/push-schedule.ts`, test-first): nur an einem Samstag in Berlin zwischen 10:00 und 14:00. Sonst Ende mit Exit 0 und Hinweis. So schickt ein später „Re-run“ am Montag keine Samstagsnachricht. Tests: Samstag 10:07 im Sommer und im Winter, 13:59/14:00, Freitag, Sonntag, beide Umstellungs-Wochenenden. Dazu `berlinDay(now)` für die Versand-Marke.
- Ein Test liest `push-weekly.yml` und prüft `cron` und `timezone` gegen die Konstanten in `push-schedule.ts` (`PUSH_WEEKDAY`, `PUSH_HOUR`), damit Code und YAML nicht auseinanderlaufen.
- `workflow_dispatch` im selben Workflow für Tests, ohne Wächter: Eingaben `only` (Pflicht, sobald `dry_run` aus ist) und `dry_run` (Standard `true`). Ersetzt `push-test.yml` aus Plan 0011.
- Zeitpläne laufen nur auf dem Standard-Branch. Auf dem Branch wird lokal getestet (Schritt 6).
- **Höchstens ein Versand je Samstag (Runde 2 H-C):** Vor dem Versand setzt `push-weekly.ts` beim Worker die Marke `POST /versand/<YYYY-MM-DD>` (Berliner Datum, mit `PUSH_ADMIN_TOKEN`, KV mit TTL 3 Tage). Antwortet der Worker 409 (schon gesetzt), endet der Lauf ohne Versand. Ein „Re-run“ am Samstag um 11 Uhr schickt also nichts mehr. Testversände (`workflow_dispatch`) setzen und prüfen die Marke nicht.
- `concurrency`: getrennte Gruppen `push-weekly-schedule` und `push-weekly-test` (Runde 2), damit ein Test keinen wartenden Zeitplan-Lauf abbricht; `cancel-in-progress: false`. `permissions: contents: read`. Der Lauf ist kein Gate für irgendetwas.

### E2 – Was der Absender schickt (allgemeiner Text)

`scripts/push-weekly.ts` (ersetzt `push-news.ts` und `push-send.ts` aus Plan 0011; `web-push` nur hier, die Regel `web-push-only-in-push-send` heißt dann `web-push-only-in-push-weekly` und zielt auf `^scripts/push-weekly\.ts$`). Es verdrahtet nur git, Dateien, Worker und `web-push`. Zählen, Argumente und Ablauf stecken testbar in `scripts/lib/push-weekly-core.ts` mit injizierter Funktion `readOffersAt(sha)` und injiziertem Versand (Runde 2 M-C):

1. `shouldSendNow` prüfen (außer bei `workflow_dispatch`).
2. Zahlen aus den Daten im Repo, `now` = Laufzeit:
   - `news`: `newOfferIds(vorher, jetzt, now).length`. `jetzt` = die Angebote aus `loadDataset()` (`scripts/lib/load-data.ts`) bzw. `toSiteData(providers, file)` aus dem Checkout; `vorher` = IDs aus `data/offers.json` im letzten Commit **vor `now − 7 × 24 h`** (`git rev-list -1 --before=… HEAD -- data/offers.json`, Checkout mit `fetch-depth: 0`). Fehlt der alte Stand: `news = 0` mit `::warning::`.
   - `week`: `offersInWeek(jetzt, now).length` (E4).
3. Payload `weeklyPayload({ news, week, siteUrl: SITE_URL, sentAt: now })` (E5), geprüft mit dem Zod-Schema in `scripts/lib/push-payload-schema.ts`.
4. Versand-Marke setzen (E1), dann Abos vom Worker (`GET /abos`), Versand wie Plan 0011 E11, `TTL` 1 Tag (`PUSH_TTL_SECONDS = 86_400`: Die Nachricht vom Samstag ist am Sonntag noch sinnvoll, am Montag nicht mehr).

Der allgemeine Text erscheint nur, wenn das Gerät nicht zuschneiden kann (Service Worker zu langsam oder kaputt, `seenIds` fehlen):
- `news > 0`: Titel „Zwergenplan“, Text „7 neue Angebote seit letztem Samstag“ (Singular „1 neues Angebot …“).
- `news = 0`: Titel „Zwergenplan“, Text „Diese Woche nichts Neues. 42 Angebote in den nächsten 7 Tagen.“
- **`navigate` ist immer die Startseite** (Review H2): Der Block „Neu“ hängt am Zuschnitt des Geräts; ein allgemeiner Text darf nicht auf `?neu` ohne passenden Block führen.

### E3 – Was „neu“ auf dem Gerät heißt (Review H1)

- `seenIds` im Geräte-Speicher: die Angebots-IDs, die das Gerät bei der letzten Wochen-Nachricht kannte.
  - **Nur der Service Worker schreibt sie**, nach jedem Push, auf die IDs der dabei geladenen `site.json`. Dazu einmal beim Einschalten: `src/data/push.ts` lädt im Tipp-Handler nach dem Abo `data/site.json` (derselbe Request wie beim App-Start, für alle gleich, meist aus dem Cache) und schreibt die IDs. So braucht `PushControls` keine Angebote als Prop (E9).
  - Die App schreibt sie beim Öffnen **nicht** (Abweichung von Plan 0011 E12): Die Liste markiert nichts als neu, Öffnen heißt also nicht Bemerken. Wer freitags die Liste öffnet, bekommt samstags trotzdem alles, was in der Woche dazukam. Damit entfällt auch ein zweiter Abonnent von `onSiteLoad` (`src/data/site.ts`, heute genau einer für den PWA-Kern).
  - Fehlen `seenIds` (Geräte-Speicher geräumt): kein Zuschnitt (allgemeiner Text), aber `seenIds` werden geschrieben, damit es nächste Woche wieder geht.
- Ein Testversand (`data.test: true`, E5) schreibt weder `seenIds` noch `announced` (Runde 2 M-D).
- `announced` im Geräte-Speicher: `{ ids, sentAt }`, die Treffer der letzten zugeschnittenen Nachricht (E4) und ihr `sentAt`. Der Service Worker überschreibt den Eintrag bei jedem zugeschnittenen Push, auch mit `ids: []`.

### E4 – Zuschnitt (Domäne, rein, test-first)

`src/domain/news.ts` wird umgebaut. `newOfferIds` bleibt. `newsText` wird ersetzt durch:

```ts
/** Angebote mit mindestens einem Termin, der in [now, now + 7 × 24 h) beginnt. */
export function offersInWeek<T extends Offer>(offers: readonly T[], now: Date): T[];

export interface WeeklyInput<T extends Offer & { venue: ReachTarget }> {
  /** neue, noch nicht beendete Angebote (aus newOfferIds) */
  fresh: readonly T[];
  /** offersInWeek(site.offers, now) */
  week: readonly T[];
  /** Such-Abos als FilterState; leer = keins */
  searches: readonly FilterState[];
  birthDate?: string | undefined;
  /** Wegzeit ab dem gespeicherten Stadtteil; ohne wirkt die Wegzeit-Grenze nicht (wie in der Liste) */
  reach?: ReachFn | undefined;
  now: Date;
}

export interface WeeklyText { title: string; body: string; hits: string[] }

export function weeklyText<T extends Offer & { venue: ReachTarget }>(input: WeeklyInput<T>): WeeklyText;
```

- **Liefert immer einen Text** (Review H2). Das Gerät rechnet „neu“ selbst, seine Zahl hat Vorrang vor der des Absenders.
- **Passt** heißt: (keine Abos **oder** `matchesFilter(o, abo, reach)` für mindestens ein Abo) **und** (kein gültiges Alter **oder** `offerFitsAge(o, birthDate, now)`). Gültig ist das Alter ab 0 Monaten. Vor der Geburt wird nur das Alter ignoriert, die Abos wirken weiter.
- `hits` = passende aus `fresh`, in Datenreihenfolge.
- Texte (Alter wie der Kind-Chip: unter 2 Jahren in Monaten, danach in Jahren; „zu“ mit Dativ, „für“ mit Akkusativ):

  | Fall | Titel | Text |
  |---|---|---|
  | Treffer, mit Abos | „3 neue Angebote für deine Suchen“ | die ersten zwei Titel, Rest „und 1 weiteres“ / „und 2 weitere“ |
  | Treffer, nur Alter | „3 neue Angebote passen zu 14 Monaten“ | wie oben |
  | Treffer, weder Abos noch Alter | „3 neue Angebote im Zwergenplan“ | wie oben |
  | kein Treffer, mit Abos | „Diese Woche nichts Neues für deine Suchen“ | „5 passende Angebote in den nächsten 7 Tagen.“ bzw. „In den nächsten 7 Tagen nichts Passendes.“ |
  | kein Treffer, nur Alter | „Diese Woche nichts Neues für 14 Monate“ | wie oben |
  | kein Treffer, weder noch | „Diese Woche nichts Neues“ | „42 Angebote in den nächsten 7 Tagen.“ |

  Singular jeweils („1 neues Angebot passt zu …“, „1 neues Angebot für deine Suchen“, „1 passendes Angebot …“, „1 Angebot …“).
- `navigate` (im Service Worker): `?neu` genau dann, wenn `hits` nicht leer ist, sonst die Startseite.
- „Passende Angebote in den nächsten 7 Tagen“ zählt `week` mit derselben Regel. Die Woche sind **7 × 24 h ab `now`** (an den Umstellungs-Wochenenden also eine Stunde verschoben, bewusst); ein Termin, der genau bei `now + 7 × 24 h` beginnt, zählt nicht, ein laufender (Beginn vor `now`) auch nicht.
- Tests: jede Zeile der Tabelle, Singular/Plural, mehrere Abos (ODER), Abo mit Wegzeit mit und ohne `reach`, ungeborenes Kind mit Abos, Alter an der Grenze, Berliner Tagesgrenze, `offersInWeek` an beiden Rändern.

### E5 – Payload (Domäne)

`src/domain/push-payload.ts`: `declarativePayload` wird zu `weeklyPayload({ news, week, siteUrl, sentAt })`.
- `news` und `week` sind ganze Zahlen ≥ 0, sonst `RangeError`.
- Format wie im Spike: `{ web_push: 8030, notification: { title, body, navigate, tag, lang: "de", data: { sentAt } }, mutable: true }`. **Kein `app_badge`** (Nicht-Ziel). `navigate` = `siteUrl` (E2).
- Optional `test: true` → `data: { sentAt, test: true }` (Testversand, E3).
- `PUSH_TTL_SECONDS` wird `86_400` (heute im Code `172_800`, E2).
- `PUSH_TAG = "wochen-nachricht"`, `PUSH_TOPIC = "neueangebote"` bleibt (Base64url, Länge % 4 = 0, Test bleibt), `FALLBACK_TITLE` bleibt. `newsUrl(siteUrl)` bleibt für den Service Worker.
- `push-types.ts`: `app_badge` entfällt, `data.test?: true` kommt dazu.

### E6 – Such-Abos (Domäne und Speicher)

- Neues reines Modul `src/domain/searches.ts`, test-first:
  - Ein Abo ist ein **kanonischer Filter-Querystring** (`filterToSearch`), z. B. `kat=musik,natur&wegzeit=20`. Kein eigenes Format, keine IDs.
  - `MAX_SEARCHES = 5`.
  - `addSearch(list, filter)`: hängt an, wenn der Filter nicht leer ist (`activeFilterCount(…, { limitActive: true }) > 0`), noch nicht enthalten ist und das Limit nicht erreicht ist. Ergebnis `{ list, outcome: "neu" | "schon-da" | "leer" | "voll" }`.
  - `removeSearch(list, search)`, `hasSearch(list, filter)`.
  - `parseSearches(raw: string | null): string[]`: JSON lesen, Unbekanntes verwerfen, jeden Eintrag über `filterToSearch(filterFromSearch(x))` normalisieren, Leere und Dubletten entfernen, auf 5 kappen.
- **Speicher nur im Lazy-Code (Review H3, Runde 2 H-B):** Die Abos liest und schreibt nur `src/data/searches-store.ts` (Gruppe `push`, E9) im `localStorage` `zwergenplan.such-abos`, **roh** (`string | null`). Geparst wird mit `parseSearches` in `PushControls` und im Service Worker; so braucht `data-domain-runtime-allowlist` keine Ausnahme. `src/data` bleibt der einzige Ort für `localStorage`, `preferences.ts` (Start) bleibt unverändert. Die Abos stehen nie in URL, Logs oder Requests.
- **Beschriftung und Texte nicht im Start-Bundle (Review H3):** `searchLabel(filter)` („Musik & Singen, Natur & Draußen · Kurs · bis 20 Min.“) und alle Toast- und Hinweistexte des Push liegen in `src/ui/app-extras/push-texts.ts`. Die Kategorienamen kommen aus `CATEGORY_LABELS` in `src/domain/topics.ts`.
- Die Abos sind unabhängig vom Push-Schalter (anlegen geht, sobald Push möglich ist, auch wenn er noch aus ist). Der Service Worker sieht sie nur, solange Push an ist.
- **Gespiegelt in den Geräte-Speicher, nur bei Push an:** Geburtsdatum, `seenIds`, `announced`, `endpointHash` (wie Plan 0011) und **neu** `searches` (die rohe Liste) und `originDistrict` (die Stadtteil-ID, nie eine Koordinate).
- **Wer spiegelt (Runde 2 H-B: kein Haken im Start):**
  - `push-start.ts` beim App-Start (bei Push an): Geburtsdatum und Stadtteil aus `preferences.ts`, Abos aus `searches-store.ts`, je einmal in den Geräte-Speicher.
  - `PushControls` im Kind-Sheet: bei jeder Änderung der Props Geburtsdatum und Stadtteil (beide werden im Kind-Sheet bearbeitet) und bei jeder Änderung der Abos.
  - Ein Stadtteil, der anderswo gewählt wird (Karte, „Stadtteil wählen“ im Filter), kommt beim nächsten Öffnen des Kind-Sheets oder beim nächsten App-Start an. Das ist bewusst: Es spart den Haken im Start-Bundle.
  - Beim Einschalten werden alle einmal geschrieben, beim Ausschalten alle gelöscht.

### E7 – Oberfläche: alles im Kind-Sheet (Runde 2, Scope)

**Kein Knopf im Filter-Sheet.** Der Filter-Sheet liegt im Start-Bundle; sein Lazy-Einstieg samt Props passt nicht in den Rest von 0,23 kB (E9). Abonniert wird im Kind-Sheet, wo der Abschnitt „Als App“ ohnehin lazy lädt.

**Abschnitt „Als App“ – Sichtbarkeit (Review M3)**

| Installationszustand (`installState`) | `pushSupport()` | Abschnitt zeigt |
|---|---|---|
| `app` | `ok` | „Läuft als App.“, Push-Teil |
| `angebot`, `installiert`, `menue` (Android-Browser) | `ok` | Installationshilfe, darunter Push-Teil (Chrome kann Push auch im Tab) |
| `ios` (Safari-Tab) | `ok` (heute nicht beobachtet, Spike a) | Installationshilfe, darunter Push-Teil |
| `ios` | nicht `ok` | Installationshilfe, Hinweis „Benachrichtigungen gibt es in der App.“ |
| `keine` (Desktop ohne Angebot) | `ok` | Push-Teil (Desktop-Chrome/Firefox) |
| `keine` | nicht `ok` | ausgeblendet (wie heute) |
| sonst | nicht `ok` | Installationshilfe bzw. „Läuft als App.“, Hinweis „Dieser Browser kann keine Benachrichtigungen.“ |

**Push-Teil (`src/ui/app-extras/PushControls.tsx`, nur bei `pushSupport() === "ok"`; Review H5: im Safari-Tab nutzlos)**
- Schalter „Wochen-Nachricht“ mit Untertitel „Samstags gegen 10 Uhr: was es Neues für euch gibt.“ (`role="switch"`, Verhalten Plan 0011 E12).
- **„Aktuelle Suche abonnieren“**: zeigt die Beschriftung der Suche, mit der die Liste gerade gefiltert ist (Route als Prop), und einen Knopf mit festem Namen „Suche abonnieren“ und `aria-pressed` (kein wechselnder Name), daneben bei gedrücktem Zustand sichtbar „Abonniert“. Höhe ≥ 44 px.
  - Filter leer: statt des Knopfs „Wähle im Filter, was dich interessiert, und abonniere die Suche hier.“
  - Suche schon abonniert: gedrückt. Ein Tipp entfernt das Abo, Toast „Such-Abo entfernt.“
  - 5 Abos erreicht: Toast „Höchstens 5 Such-Abos. Erst eins entfernen.“
  - Suche mit Wegzeit, kein Stadtteil gespeichert: Abo wird angelegt, Toast „Abonniert. Die Wegzeit wirkt in der Nachricht ab einem Stadtteil.“
  - Push aus: Toast „Abonniert. Kommt in die Nachricht, sobald die Wochen-Nachricht an ist.“ Push an: „Abonniert. Kommt in die Nachricht am Samstag.“
- „Deine Such-Abos“:
  - je Abo eine Zeile mit `searchLabel` und „Entfernen“ (≥ 44 px, Name „Such-Abo … entfernen“), danach Toast „Such-Abo entfernt.“;
  - Abo mit Wegzeit ohne gespeicherten Stadtteil: Zusatz „Wegzeit wirkt ab einem Stadtteil“ (der Stadtteil wird im selben Sheet weiter oben gewählt);
  - ohne Abo: „Noch keine. Bis dahin zählt nur das Alter.“ (ohne Geburtsdatum: „… Bis dahin kommen alle neuen Angebote.“);
  - bei Push aus: Hinweis „Kommt erst mit eingeschalteter Wochen-Nachricht.“
- Geräte-Kennung bei Push an (Plan 0011 E11).
- Das Alter filtert die Nachricht immer, wenn ein Geburtsdatum da ist, unabhängig von „Nur passende“ (Entscheidung, Runde 2): Die Nachricht soll „für euch“ sein; „Nur passende“ betrifft die Liste.
- E2E für jeden sichtbaren Zustand der Matrix mit `expectMobileUx` hell, dunkel und 320 px/200 %, wie `e2e/installieren.spec.ts`; ein Abo mit allen Dimensionen (längste Beschriftung). `iphone-15` prüft `ios` ohne Push-Teil.

### E8 – „Neu“ als Sheet (`?neu`, Runde 2 H-B)

- Mit `neu` in der Route öffnet `App` über den Lader lazy das Sheet `NewsSheet` (`src/ui/app-extras/NewsSheet.tsx`) **über** der Liste, im bestehenden Sheet-Rahmen (`Sheets`/`Dialog`). Ein Overlay verschiebt nichts: kein Zurückhalten der Liste, kein Platzhalter, kein CLS-Risiko. Ersetzt den Block über „Heute“ aus Plan 0011 E13.
- Inhalt: Überschrift „Neu seit der letzten Wochen-Nachricht“, die Angebote aus `announced.ids`, die noch einen kommenden Termin haben, in Datenreihenfolge, mit den bestehenden Kacheln (Tipp öffnet das Detail wie aus der Liste), Knopf „Zur Liste“.
- **Abweichung von Plan 0011 E13:** keine zweite Filterung nach Alter. Die Auswahl hat die Nachricht schon getroffen (E4).
- Gültig nur, wenn `announced.sentAt` höchstens 8 Tage zurückliegt (`now` der App). Ältere oder leere `announced`, kein Eintrag oder Chunk nicht ladbar: kein Sheet, `neu` wird still entfernt. Sonst wird `neu` beim Schließen per `replace` entfernt. `announced` bleibt bis zum nächsten Push.

### E9 – Start-Budget und Chunks (Review H3, H4; Runde 2 H-A, H-B)

- **Im Start-Bundle stehen, geschätzt (gzip):**

  | Teil | Schätzung |
  |---|---|
  | Flag `neu` in `parseRoute`/`routeToSearch` | 0,03 kB |
  | `AppExtras.tsx`: Einstieg `NewsSheet` (ein `lazy`-Eintrag, ohne Platzhalter) | 0,05 kB |
  | Props an `AppExtrasSection` an der Aufrufstelle im Kind-Sheet: Route-Filter, Geburtsdatum, Stadtteil-ID | 0,04 kB |
  | Props an `NewsSheet` an der Aufrufstelle in `App`: Angebote, Karten-Kontext der Kacheln, `now`, Schließen | 0,03 kB |
  | **Summe** | **≈ 0,15 kB** von 0,23 kB Rest |

  Nicht im Start: die Prüfung „Push an?“ (macht `pwa.ts`, unten), Speicher und Spiegelung der Abos (E6), alle Texte (E6), Toast-Aufrufe (`PushControls` bekommt `say` über die schon vorhandenen Props des Abschnitts bzw. ruft den Toast selbst über den Lader; die Stub-Probe zeigt, was billiger ist).
- **Wie Push an die Registrierung kommt (Runde 2 H-A):** `src/data/pwa.ts` (Gruppe `app`) bleibt der einzige Ort für `navigator.serviceWorker`. Es injiziert `getRegistration: () => Promise<ServiceWorkerRegistration | undefined>` in die Push-Module:
  - Nach der Registrierung lädt `pwa.ts` bei gesetztem `zwergenplan.push` per `import("./push-start.ts")` den Abgleich und ruft `start({ getRegistration, … })`. Die Prüfung „Push an?“ liegt damit in `pwa.ts` (lazy), nicht in `pwa-start.ts` (Start).
  - Der Lader `AppExtras.tsx` lädt `AppSection`, `pwa.ts` und `PushControls` je per `import()` und reicht `getRegistration` (aus `pwa.ts`) als Prop an `PushControls`, wie heute `install`.
  - Kein statischer Import zwischen `assets/app/` und `assets/push/`. Die Stub-Probe prüft genau das.
- **`pushSupport()` ohne Hänger (Runde 2 M-E):** nutzt `getRegistration()` (löst sofort auf, auch mit `serviceWorkers: "block"`, dann `undefined` → `"kein-sw"`), nicht `ready`. Kein 3-s-Platzhalter im Sheet. Ist der Push-Teil entschieden (gezeigt oder nicht), setzt `PushControls` `data-push="bereit"` auf `<html>`, wie `data-pwa` (Wartebedingung für die Request-Zählungen).
- **Chunk-Gruppe `push`** (`advancedChunks`, Ordner `assets/push/`): `src/data/(push|push-start|device-store|searches-store)\.ts`, `src/ui/app-extras/(PushControls|NewsSheet|push-texts)\.tsx?`, `src/domain/(news|searches)\.ts`. Die `import()`-Ziele teilen sich so keine kleinen Zwischen-Chunks; was schon im Start liegt (etwa `filter.ts`), bleibt dort. `isPushModule(id)` wird in `vite.config.ts` **vor** `isAppExtrasModule` geprüft; `isAppExtrasModule` verliert die Push-Pfade.
- **Regeln:** `news-not-in-start` wird zu `push-domain-not-in-start` (`^src/domain/(news|searches)\.ts$`, Runde 2 M-G), `app-data-only-lazy` um `searches-store` erweitert; `LAZY_LOADERS` in `scripts/check-architecture.ts` um `["src/data/pwa.ts", "./push-start.ts"]` und die neuen Einstiege im Lader. Kanarienvogel je Änderung.
- **Stub-Probe vor Schritt 5 (5a):** realistische Stubs aller neuen Module mit den Imports **und den Props an den Aufrufstellen** wie im Endzustand, `vite build`, Chunk-Wächter, `pnpm size`. Erwartet: kein `__vite__mapDeps` im Einstieg, ein Start-Chunk, `JS (initial)` ≤ 92 kB. Ergebnis im Plan. Über 92 kB: Rückfrage an den Nutzer, kein Anheben.
- **Budgets:** neues `Push JS (lazy)` (`dist/assets/push/*.js`, 6 kB gzip) mit Kanarienvogel; `App-Extras JS (lazy)` bleibt 5 kB; `Service Worker` bleibt 8 kB (erwartet ≈ 4,5 kB: gemessen 2,9 kB für die Domäne plus heute 1,58 kB).

### E10 – Push im Service Worker (Ergänzung zu Plan 0011 E10)

**Ausnahme für die Wegzeit-Logik (Review B1):** `src/domain/transit.ts` ist für `src/` nur per `import()` und nur über `src/ui/use-transit.ts` erlaubt (`transit-only-lazy`, `transit-entry-only`). Der Grund der Regeln ist das Start-JS der App (Plan 0009, E10). Der Service Worker ist ein klassisches Skript ohne `import()`, bündelt seine Abhängigkeiten selbst (`scripts/vite-sw.ts`) und hat ein eigenes Budget; das Start-JS berührt er nicht. Beide Regeln bekommen `pathNot: "^src/sw/"` im `from`, mit Kommentar, Begründung in ADR 0014 (E0) und einem Kanarienvogel (ein statischer Import von `transit.ts` aus `src/ui/` bleibt rot, aus `src/sw/` grün). `sw-isolated` erlaubt `src/domain/` ohnehin.

**Zuschnitt als testbares Modul (Runde 2 M-B):** `src/sw/push-tailor.ts`, test-first, in `coverage.include`. Signatur `tailorPush({ payload, now, env }): Promise<TailorResult>` mit injizierter Umgebung `env = { fetchJson(path), store: { get, set }, timeoutMs }`. `sw.ts` verdrahtet nur `push`-Event, `fetch`, `device-store` und `decidePush`. Ablauf, alles innerhalb des 5-s-Limits:

1. Parallel laden:
   - `data/site.json` mit `cache: "no-cache"`;
   - `data/wegzeit.json` **bei jedem Push**, Cache `zp-data` zuerst, sonst Netz (die Tabelle ändert sich selten; `TRANSIT_TABLE_VERSION` prüft das Format). Bei jedem Push gleich, deshalb verrät der Request nichts, auch nicht, ob ein Stadtteil oder ein Abo mit Wegzeit gespeichert ist (Runde 2, Alternative zu M2; die Invariante bleibt in der Sache unverändert, E0 ergänzt nur den Anlass „beim Push“);
   - aus dem Geräte-Speicher: `seenIds`, `searches`, `birthDate`, `originDistrict`.
2. `reach` = `transitReach(decodeTransitTable(file, placeKeys), origin)`; `placeKeys` = `new Set(site.offers.map((o) => placeKey(o.venue.geo)))` (wie `App.tsx`), `origin` aus `districtById(originDistrict)` (`source: "stadtteil"`). Fehlt etwas oder scheitert das Dekodieren: `undefined`, die Wegzeit-Grenze wirkt dann nicht.
3. Fehlen `seenIds`: `seenIds` schreiben, Ergebnis „kein Zuschnitt“ (allgemeiner Text).
4. Sonst `fresh` = Angebote aus `newOfferIds(seenIds, site.offers, now)`, `week` = `offersInWeek(site.offers, now)`, `searches` = `parseSearches(raw).map(filterFromSearch)`, `weeklyText(…)`.
5. **Testversand (Runde 2 M-D):** Trägt die Payload `data.test: true`, schreibt der Zuschnitt **nichts** (weder `seenIds` noch `announced`). So verbraucht ein Testversand die Woche nicht.
6. Sonst **vor** dem Anzeigen `announced = { ids: text.hits, sentAt }` und `seenIds` = alle IDs der geladenen `site.json` schreiben. Scheitert das Schreiben von `announced`, wird `navigate` auf die Startseite gesetzt.

`decidePush` bekommt das Ergebnis als `outcome` `{ kind: "text", text }` usw. (wie Plan 0011). `navigate` = `newsUrl(scope)` bei Treffern, sonst `scope`. **`notificationclick` fällt ohne `data.navigate` auf `scope` zurück, nicht auf `./?neu`** (Runde 2 M-F; Abweichung von Plan 0011 E10.6).

## Stufe 3 (später, eigener Plan und ADR)

**Filterung beim Absender:** Eine Nachricht kommt nur, wenn für das Gerät etwas passt. Dazu speichert der Worker mit dem Push-Abo die Such-Abos, die Stadtteil-ID und ein grobes Alter (Geburtsmonat), und `push-weekly.ts` rechnet je Abo mit derselben Domänenlogik. Folgen: Privatsphäre-Invariante und ADR 0014 ändern sich, der Zuschnitt im Service Worker entfällt weitgehend. Die App bleibt statisch, der Worker ist schon da (ADR 0014). Kommt nach `docs/ideas.md`.

## Struktur

```
src/domain/news.ts (+ .test.ts)              newOfferIds, offersInWeek, weeklyText (E3, E4)
src/domain/push-payload.ts (+ .test.ts)      weeklyPayload, Konstanten (E5)
src/domain/push-types.ts                     geteilte Typen (ohne app_badge, mit data.test)
src/domain/searches.ts (+ .test.ts)          Such-Abos (E6)
src/data/searches-store.ts                   Abos im localStorage, roh (E6, Gruppe push)
src/data/device-store.ts                     IndexedDB-Wrapper (Plan 0011 E8)
src/data/push.ts (+ .test.ts)                Push-Abo, pushSupport mit getRegistration (E9)
src/data/push-start.ts (+ .test.ts)          Abgleich und Spiegelung beim Start, aus pwa.ts geladen (E6, E9)
src/data/pwa.ts                              lädt push-start bei Push an, injiziert getRegistration (E9)
src/sw/sw.ts                                 push, notificationclick, pushsubscriptionchange (E10)
src/sw/push-tailor.ts (+ .test.ts)           Zuschnitt mit injizierter Umgebung (E10)
src/sw/push-decision.ts (+ .test.ts)         reine Entscheidung (Plan 0011 E10)
src/ui/AppExtras.tsx                         Lader: PushControls und NewsSheet (E9)
src/ui/app-extras/AppSection.tsx             Abschnitt „Als App“, Sichtbarkeit nach E7
src/ui/app-extras/PushControls.tsx           Schalter, „Aktuelle Suche abonnieren“, Abo-Liste, Geräte-Kennung (E7)
src/ui/app-extras/NewsSheet.tsx              „Neu seit der letzten Wochen-Nachricht“ (E8)
src/ui/app-extras/push-texts.ts              searchLabel, Toast- und Hinweistexte (E6)
push-worker/                                 Cloudflare Worker (Plan 0011 E11) plus POST /versand (E1)
scripts/push-weekly.ts                       Verdrahtung: git, Dateien, Worker, web-push (E2)
scripts/lib/push-weekly-core.ts (+ .test.ts) Zählen, Argumente, Ablauf mit injiziertem readOffersAt (E2)
scripts/lib/push-schedule.ts (+ .test.ts)    shouldSendNow, Konstanten, Abgleich mit der YAML (E1)
scripts/lib/push-payload-schema.ts           Zod-Schema der Payload
.github/workflows/push-weekly.yml            Zeitplan und Testversand (E1)
```

## Tests

- **Unit (vitest, test-first, Zeitzone `America/Los_Angeles`):**
  - `news.ts`: siehe E4, dazu „passt zu 0 Monaten“.
  - `push-payload.ts`: beide Texte, Singular, `navigate` = Startseite, `sentAt` mit Offset (Sommer und Winter), `RangeError`, Topic-Regel, `data.test`.
  - `searches.ts`: kanonisch (Reihenfolge der Werte egal), Dublette, leer, Limit 5, `parseSearches` mit Müll (`null`, kein JSON, kein Array, Zahlen, unbekannte Schlüssel, 7 Einträge).
  - `push-schedule.ts`: siehe E1, dazu der Abgleich von `cron`/`timezone` mit `push-weekly.yml`.
  - `push-weekly-core.ts`: Zählen mit altem und neuem Datenstand (Fixtures über `readOffersAt`), fehlender alter Stand → 0 mit Warnung, Wächter verneint → kein Versand, Versand-Marke schon gesetzt → kein Versand, `--only` Pflicht ohne `--dry-run`, Test-Payload mit `data.test`.
  - `push-tailor.ts`: Erfolg mit und ohne Abos/Alter/Wegzeit; `seenIds` fehlen → schreiben, kein Zuschnitt; `data.test` → nichts geschrieben; `wegzeit.json` fehlt oder kaputt → ohne Wegzeit; Schreiben von `announced` scheitert → `navigate` Startseite; hängender Speicherzugriff → nach 5 s `zeit` (Fake-Timer).
  - `push-decision.ts`, `push.ts` (auch `getRegistration` → `undefined` → `"kein-sw"` ohne Warten), `push-start.ts`, Worker (auch `POST /versand`: erstes Mal 204, zweites Mal 409, ohne Token 401): wie Plan 0011.
- **E2E (Chromium, `e2e/push.spec.ts`, Fixture `pushWorker: "mock"`, eingefrorene Uhr):**
  - Kind-Sheet mit gefilterter Route: „Aktuelle Suche abonnieren“ → gedrückt mit „Abonniert“, die Liste zeigt das Abo mit Beschriftung; „Entfernen“ entfernt es mit Toast. Push-Teil fehlt ohne Push-Fähigkeit. Jeder sichtbare Zustand der Matrix in E7 mit `expectMobileUx` hell, dunkel, 320 px/200 % (Stubs wie `installieren.spec.ts`; `iphone-15` für `ios`).
  - Schalter an (Fake-Push-Manager wie Plan 0011), Request-Body an den Worker enthält nur das Abo: kein Geburtsdatum, keine Such-Abos, kein Stadtteil, keine `seenIds`.
  - Push per CDP mit `weeklyPayload` (`sentAt` = Fixture-Jetzt), danach `registration.getNotifications()`:
    - ohne Geburtsdatum und Abos → „N neue Angebote im Zwergenplan“ bzw. „Diese Woche nichts Neues“;
    - mit Geburtsdatum → Text nach Alter;
    - mit Abo „Musik“ und neuen Musik-Angeboten → „… für deine Suchen“, `navigate` mit `?neu`;
    - mit Abo ohne neue Treffer → „Diese Woche nichts Neues für deine Suchen“, `navigate` Startseite;
    - Abo mit Wegzeit und Stadtteil → Wegzeit wirkt (ein Angebot außerhalb der Grenze fehlt in der Zahl);
    - zweiter Push ohne neue Daten → „nichts Neues“; Test-Push (`data.test`) dazwischen ändert daran nichts.
  - Danach `/?neu`: Sheet mit genau den angekündigten Angeboten, kein Layout-Sprung der Liste, `neu` verschwindet beim Schließen aus der URL. `announced` älter als 8 Tage → kein Sheet.
  - Privatsphäre: Requests des Service Workers beim Push sind ohne Query und **mit und ohne** Stadtteil bzw. Wegzeit-Abo dieselben (`site.json`, `wegzeit.json`) (Runde 2 M-A).
  - Schalter aus → Geräte-Speicher leer (IndexedDB per `page.evaluate`).
- **Request-Zählungen (Review M4):** Der Push-Chunk lädt beim Öffnen des Kind-Sheets. `e2e/startpunkt.spec.ts` und `e2e/karte.spec.ts` warten vor der Zählung auf `data-push="bereit"` (E9), wie heute bei „Als App“ (`docs/architecture.md`, Abschnitt E2E).
- **Manuell (Browser-Review live, Schritt 8):** iPhone (installiert) und Android: Einschalten, Abo anlegen, Testversand mit `only`, Text passt, Abmelden. Der Fall „Treffer“ mit `?neu` wird geprüft, indem Push **vor** einem Pipeline-Lauf eingeschaltet und nach dessen Deploy ein Testversand geschickt wird (Runde 2 M-D).

## Backpressure

- Neue Gates: Budget `Push JS (lazy)`; „Typen Worker“; die Regeln aus Plan 0011 E5b (mit `web-push-only-in-push-weekly`, `push-domain-not-in-start`); die Ausnahme `src/sw/` in `transit-only-lazy`/`transit-entry-only` mit Kanarienvogel; `scripts/lib/push-schedule.ts` und `push-weekly-core.ts` in `coverage.include` (wie `scripts/transit`).
- `src/sw/push-decision.ts` und `src/sw/push-tailor.ts` in `coverage.include`; `src/domain/searches.ts` ist als Domäne ohnehin drin.
- Der Wochen-Lauf ist kein Gate. Ein Fehler beim Senden ist `::warning::`; rot nur bei einer ungültigen Payload (Programmierfehler).

## Schritte

0. **ADR und Invarianten (E0):** ADR 0014 überarbeiten (Entwurf bleibt Entwurf), `docs/architecture.md` (Privatsphäre, Startpunkt, Anlass „beim Push“ in der Request-Liste, Ausnahme `src/sw/` für die Wegzeit-Logik). Plan 0011: Status „Stufe 2 ersetzt durch Plan 0017“. Fertig, wenn committet.
1. **Domäne** (test-first): `news.ts` umbauen (E4), `push-payload.ts`/`push-types.ts` (E5), `searches.ts` (E6), `scripts/lib/push-schedule.ts` (E1). Fertig, wenn `pnpm check:fast` grün ist.
2. **Abhängigkeiten und Infrastruktur:**
   - zuerst devDependencies `wrangler`, `@cloudflare/workers-types`, `web-push`, `@types/web-push` gepinnt installieren, `workerd` in `pnpm.onlyBuiltDependencies` (Plan 0011 E11);
   - dann, **nach Freigabe durch den Nutzer** und mit dem vorhandenen `wrangler login`: KV-Namespace `zwergenplan-push` anlegen (ID in `push-worker/wrangler.toml`); VAPID-Schlüssel erzeugen (`pnpm exec web-push generate-vapid-keys`), öffentlichen Schlüssel und Worker-URL in `site.config.ts`; `gh secret set VAPID_PRIVATE_KEY`, `gh secret set PUSH_ADMIN_TOKEN`, `pnpm exec wrangler secret put PUSH_ADMIN_TOKEN`.
   - Privater Schlüssel und Token landen nur in den Secrets und in einer gitignorierten lokalen Datei für den Testversand (`.push.local.json`), nie im Repo oder im Log.
3. **Worker** wie Plan 0011 Schritt 9, plus `POST /versand/<datum>` (E1). Deploy mit `pnpm push:deploy`, Prüfungen per `curl` (403 ohne/mit fremdem `Origin`, CORS bei `OPTIONS`, 401 bei `GET /abos` ohne Token, `GET /version`).
4. **Speicher und Push in der App:** Ausnahme in `.dependency-cruiser.cjs` (E10) mit Kanarienvogel, `device-store.ts`, `searches-store.ts`, `push.ts`, `push-start.ts` (aus `pwa.ts` geladen), `push-tailor.ts`, `push-decision.ts`, Push im Service Worker (E10). Zuerst die frühe Probe zu CDP und `getNotifications()` (Plan 0011).
5. **Oberfläche:**
   - 5a. **Stub-Probe** (E9) mit Imports und Props an den Aufrufstellen; Ergebnis im Plan.
   - 5b. `PushControls` und Sichtbarkeit in `AppSection`, `neu` in `route.ts`, `NewsSheet`, `push-texts.ts`. E2E nach „Tests“. Budgets erneut messen.
6. **Versand:** `scripts/lib/push-weekly-core.ts`, `scripts/push-weekly.ts`, `.github/workflows/push-weekly.yml`. Test auf dem Branch lokal: `--dry-run`, dann `--force --only=<Geräte-Kennung>` (Test-Payload) an die eigenen Geräte.
7. **Doku und Review:**
   - ADR 0014 auf „angenommen“;
   - `docs/architecture.md`: Schicht `push-worker/`, Absatz „Push“;
   - `docs/ideas.md`: Stufe 3, „Such-Abos als Schnellwahl in der Liste“, „Abo-Knopf im Filter-Sheet, wenn das Start-Budget es erlaubt“;
   - README: Wochen-Nachricht, Testversand, Zeitplan wieder einschalten;
   - `PW_PORT=4373 pnpm check` grün, `/arch-review`.
8. **Deploy und Abnahme:** Branch pushen, CI grün, Fast-Forward nach `main`, `gh run watch`. `/browser-review live` mit Zusatzcheckliste (Abschnitt „Als App“ je Zustand hell/dunkel/200 %, „Aktuelle Suche abonnieren“ mit langer Beschriftung, Sheet „Neu“). Dann Testversand per `workflow_dispatch` mit `only` an die Geräte des Nutzers, Geräteprüfung durch den Nutzer: Text, Tipp, Abmelden. Der erste echte Versand ist der nächste Samstag gegen 10 Uhr.

## Akzeptanzkriterien

- Samstags gegen 10 Uhr Berlin kommt auf jedem angemeldeten Gerät **höchstens eine** Nachricht, auch an den Umstellungs-Wochenenden und bei einem „Re-run“ (Versand-Marke im Worker, E1). Verwirft GitHub einen Lauf, fällt die Woche aus.
- Mit Abos nennt sie die neuen Angebote, die zu einem Abo und zum Alter passen, oder sagt „nichts Neues“ mit der Zahl passender Angebote der nächsten 7 Tage. Ohne Abo zählt das Alter, ohne beides zählen alle. Den allgemeinen Text des Absenders sieht man nur, wenn das Gerät nicht zuschneiden kann.
- Der Worker erhält nie Geburtsdatum, Such-Abos, Stadtteil, `seenIds` oder `announced` (E2E-Protokoll). Die Requests des Service Workers beim Push sind für alle Geräte gleich.
- `JS (initial)` ≤ 92 kB, `Push JS (lazy)` ≤ 6 kB, `Service Worker` ≤ 8 kB.
- Nach dem Abschalten sind Abo beim Worker und Geräte-Speicher leer; die Such-Abos im `localStorage` bleiben (sie gehören dem Nutzer, nicht dem Push).

## Risiken

- **GitHub-Zeitpläne** starten verspätet, verwerfen unter Last Läufe (besonders zur vollen Stunde) und werden nach 60 Tagen Ruhe abgeschaltet. → Minute 7, Wächter bis 14 Uhr, Versand-Marke, Pipeline-Läufe halten das Repo aktiv, README nennt das Wiedereinschalten.
- **iOS beendet den Service Worker nach ≈ 10 s** (Spike). Zwei Fetches plus Rechnen in 5 s: gemessen waren 0,3 s für `site.json` allein; `wegzeit.json` kommt meist aus dem Cache. → hartes Limit, Unit-Test mit hängendem Schritt.
- **Die Zahl des Absenders und die des Geräts weichen ab** (E2, E4). → Der Text des Geräts hat Vorrang; der allgemeine Text sagt „seit letztem Samstag“.
- **Eigener Speicher der Home-Bildschirm-App auf iOS** (Spike h). → Push-Teil nur mit Push-Fähigkeit (E7), also auf dem iPhone nur in der App.
- **Abonnieren im Kind-Sheet ist weniger naheliegend als im Filter.** → „Aktuelle Suche abonnieren“ zeigt die Beschriftung der aktuellen Suche; der Hinweis bei leerem Filter erklärt den Weg. Ein Knopf im Filter-Sheet steht in `docs/ideas.md`.
- **Ein Stadtteil, der außerhalb des Kind-Sheets gewählt wird, kommt erst beim nächsten Öffnen des Kind-Sheets oder App-Start beim Service Worker an** (E6). → Bewusst, spart den Start-Haken.
- **Start-JS** (E9): 0,23 kB Rest, Schätzung 0,15 kB. → Stub-Probe mit Props; kein Anheben.
- **Ausnahme von `transit-only-lazy`** (E10) wird später als Präzedenz für die App missverstanden. → Die Ausnahme nennt nur `^src/sw/`, der Kanarienvogel aus `src/ui/` bleibt rot.

## Review (2026-10-06, plan-reviewer, Runde 1) – Verdict: Überarbeiten → eingearbeitet

Hinweis: Runde 2 hat einen Teil davon überholt. Der Abo-Knopf sitzt jetzt im Kind-Sheet (M5, `SearchSubscribe` entfallen), „Neu“ ist ein Sheet statt eines Blocks, `wegzeit.json` lädt bei jedem Push (M2). Maßgeblich ist der Text der Entscheidungen oben.

**Übernommen:**
- **B1** (Blocker, Service Worker darf `transit.ts` nicht statisch importieren): Ausnahme `pathNot: "^src/sw/"` in `transit-only-lazy` und `transit-entry-only`, begründet in ADR 0014, mit Kanarienvogel; `placeKeys` aus `site.json` (E10).
- **H1** (`seenIds` beim Öffnen überschrieben): Nur der Service Worker schreibt `seenIds`, plus einmal beim Einschalten; kein zweiter Abonnent von `onSiteLoad` (E3).
- **H2** (`?neu` ohne Block): `weeklyText` liefert mit `seenIds` immer einen Text, auch ohne Abo und Alter; der allgemeine Text verlinkt immer die Startseite; `announced` trägt `sentAt` und gilt 8 Tage; scheitert das Schreiben, verlinkt der Push die Startseite (E2, E4, E8, E10).
- **H3** (Start-Budget unvollständig): Tabelle vervollständigt (≈ 0,32 kB, über dem Rest), Kind-Sheet als erster Ausweichkandidat; Texte und `searchLabel` in `src/ui/app-extras/push-texts.ts`; `preferences.ts` nur roh, ohne `parseSearches` (E6, E9).
- **H4** (Preload-Helfer): eine Chunk-Gruppe `push`, `isPushModule` vor `isAppExtrasModule`, Props über den Lader, Stub-Probe als Schritt 5a (E9).
- **H5** (Abos im Safari-Tab wirkungslos): Knopf nur mit `pushSupport() === "ok"` (E7).
- **M1** (Zeitplan): ein `cron` mit `timezone: "Europe/Berlin"`, Minute 7, Wächter Samstag 10–14 Uhr, YAML-Abgleich im Test, Akzeptanz „höchstens eine“ (E1).
- **M2** (Privatsphäre `wegzeit.json`): Invariante und ADR ausdrücklich ändern, E2E für gleiche Requests (E0, E10).
- **M3** (Sichtbarkeit): Matrix in E7, E2E je Zustand.
- **M4** (Request-Zählung): Zählungen warten auf den Chunk (Tests).
- **M5** (Filter-Fuß quer): Knopf am Ende des Scrollbereichs, klappt bei Fehler zusammen (E7).
- **M6** (ADR-Reihenfolge): Schritt 0 vor der Umsetzung.
- **Niedrig:** fester Name mit `aria-pressed`, Toast beim Entfernen; ungeborenes Kind ignoriert nur das Alter; Woche = 7 × 24 h; E8 hebt E13 ausdrücklich auf; kein spätes Einsetzen des Blocks; devDependencies vor der Infrastruktur; `SearchSubscribe` liest den Push-Zustand aus `push.ts` im selben Chunk.

**Abgelehnt:**
- **S1** (Wegzeit in Abos auf später verschieben): Der Nutzer hat die Einschränkung nach Wegzeit ausdrücklich verlangt („Filterung auf abonnierte Anbieter, Kategorien und Wegezeiteinschränkungen“). Die Kosten (Regelausnahme mit ADR, ≈ 1 kB im Service Worker, ein dokumentiertes Bit beim Request) sind überschaubar.
- **S2** ist mit M1 erledigt (übernommen, nicht abgelehnt).

## Review (2026-10-06, plan-reviewer, Runde 2) – Verdict: Freigabe mit Änderungen → eingearbeitet

Kein Blocker. B1, H1, H2, H5, M3, M5 und M6 aus Runde 1 bestätigt gelöst.

**Übernommen:**
- **H-A** (Push braucht die Registrierung aus `pwa.ts`, anderer Chunk): `pwa.ts` lädt `push-start.ts` selbst und injiziert `getRegistration`; der Lader reicht `getRegistration` als Prop an `PushControls`; kein statischer Import zwischen `assets/app/` und `assets/push/`; die Stub-Probe prüft das (E9).
- **H-B** (Budget geht nicht auf, Props an den Aufrufstellen fehlen): Knopf ins Kind-Sheet („Aktuelle Suche abonnieren“), „Neu“ als Sheet statt Block (kein Zurückhalten der Liste), Prüfung „Push an?“ in `pwa.ts`, Speicher der Abos und Spiegelung nur im Lazy-Code; neue Schätzung ≈ 0,15 kB inklusive Props; Stub-Probe mit Props (E6–E9).
- **H-C** (zweiter Versand am selben Samstag): Versand-Marke `POST /versand/<datum>` im Worker mit 409 (E1, E2, Tests).
- **M-A** (Negativfall Privatsphäre): durch die Alternative zu M2 erledigt; der Service Worker lädt `site.json` und `wegzeit.json` bei **jedem** Push, E2E prüft gleiche Requests mit und ohne Stadtteil bzw. Wegzeit-Abo (E10, Tests).
- **M-B** (Push-Logik ohne Unit-Test): `src/sw/push-tailor.ts` mit injizierter Umgebung, in `coverage.include` (E10).
- **M-C** (`push-weekly.ts` kaum testbar, falsche Signatur): `scripts/lib/push-weekly-core.ts` mit `readOffersAt`, Signatur korrigiert (E2).
- **M-D** (Testversand verbraucht die Woche): `data.test: true`, der Service Worker schreibt dann nichts; Geräteprüfung für „Treffer“ vor/nach einem Pipeline-Lauf (E3, E5, E10, Tests).
- **M-E** (`pushSupport()` wartet 3 s): `getRegistration()` statt `ready`, Marke `data-push="bereit"` (E9).
- **M-F** (`notificationclick` auf `./?neu`): Rückfall `scope` (E10).
- **M-G** (keine Regel für `searches.ts`): `push-domain-not-in-start` (E9).
- **Niedrig:** TTL in E5; Kategorienamen aus `CATEGORY_LABELS` (`src/domain/topics.ts`); Woche eindeutig 7 × 24 h; getrennte `concurrency`-Gruppen; Alter filtert die Nachricht unabhängig von „Nur passende“ (Entscheidung, E7) und Test „0 Monaten“; Matrix um `ios` + `ok`; E2E mit längster Beschriftung.
- **Scope** (Filter-Sheet-Knopf streichen): übernommen, als Idee in `docs/ideas.md` (Schritt 7).

**Abgelehnt:** keins.
