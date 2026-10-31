# Plan 0054 – Abos mit Glocke: Anbieter und Suchen abonnieren

Status: in Umsetzung
Datum: 2026-10-29

## Anlass

Wunsch des Nutzers vom 2026-10-29:

1. Die Push-Nachricht soll auch und vor allem dann etwas melden, wenn ein gemerkter Anbieter etwas Neues, Passendes hat.
2. Anbieter bekommen dafür statt des Herzens eine **Glocke**: Sie werden nicht gemerkt, sondern **abonniert**.
3. Auch Suchen werden über eine Glocke abonniert, direkt an der Liste und nicht versteckt in den Einstellungen.
4. In den Einstellungen steht nur noch die **Verwaltung** der Abos.

## Befund

- **Push** (ADR 0014, Plan 0017, 0040, 0043): Einmal pro Woche (samstags) schickt die CI allen Geräten dieselbe Nachricht mit Zahlen aus den öffentlichen Daten. Der Service Worker schneidet sie auf dem Gerät zu (`src/sw/push-tailor.ts` → `weeklyText` in `src/domain/news.ts`). Dafür nutzt er Such-Abos, Geburtsdatum und Startpunkt, die bei eingeschaltetem Push in die IndexedDB gespiegelt sind (`src/data/device-store.ts`, `DEVICE_KEYS`). Der Push-Worker kennt nur das Abo.
- **Gemerkte Anbieter** (Plan 0025):
  - Die IDs (`publicId`) liegen in `zwergenplan.anbieter-merkliste` (`loadSavedProviders` in `src/data/preferences.ts`, State `useSavedProviders` in `src/ui/use-app-state.ts`).
  - Das Herz steht in der Anbieterzeile (`src/ui/anbieter/ProviderScreen.tsx`) und im Kopf des Anbieter-Sheets (`src/ui/anbieter/ProviderSheet.tsx`).
  - Gemerkte Anbieter stehen oben im Tab „Anbieter“ („Gemerkte Anbieter“). Der Toast kommt aus `src/ui/App.tsx:258`.
  - Die Invariante „Privatsphäre“ (`docs/architecture.md`) sagt: gemerkte Anbieter „nie in … IndexedDB, der Push liest sie nicht“.
- **Such-Abos** (Plan 0017, E6, E7):
  - Abonniert wird nur im Kind-Sheet, Abschnitt „Als App“ (`src/ui/app-extras/PushControls.tsx`), über „Aktuelle Suche · Suche abonnieren“. Die Liste mit „Entfernen“ steht dort auch.
  - Die Logik liegt in `src/domain/searches.ts` (höchstens 5, ohne Zeitraum, `searchOf`), gespeichert wird roh über `src/data/searches-store.ts`.
  - Beides liegt im Lazy-Chunk `assets/app/`. So erzwingen es die Regeln `push-domain-not-in-start` und `app-data-only-lazy` in `.dependency-cruiser.cjs`. Der Grund war das Start-Budget (Plan 0017, E7).
- **Spiegeln** läuft nur, solange das Kind-Sheet offen ist, und einmal am Ende des Onboardings (`syncPushMirror` über `loadAppStep` in `src/ui/AppExtras.tsx`, lokal, ohne Request; ADR 0014, Punkt 4; `architecture.md`, Push-Teil). Jede `createPush()`-Instanz hat ihr eigenes Flag `mirroring` (`src/data/push.ts:130`), `syncPushMirror` erzeugt je Aufruf eine neue.
- `site.json` trägt je Angebot `providerId` (= `publicId`) und `providerName`.
- **Budgets** (gemessen 2026-10-29 auf `ae6901f`, `pnpm build && pnpm size`):

  | Budget | Ist (gzip) | Grenze |
  |---|---|---|
  | JS (initial) | 103,44 kB | 150 kB |
  | CSS | 12,45 kB | 15 kB |
  | App-Extras JS (lazy) | 7,49 kB | 7,6 kB |
  | Service Worker | 8,99 kB | 9 kB |

## Ziel und Nicht-Ziele

Ziel: Ein Begriff **„Abo“** mit einem Zeichen, der **Glocke**, für Anbieter und Suchen. Die Wochen-Nachricht meldet neue, altersgerechte Angebote abonnierter Anbieter zuerst. Abonniert wird dort, wo man gerade ist. Die Einstellungen zeigen und verwalten die Abos.

Nicht-Ziele:
- **Keine sofortige Nachricht** nach dem Nachtlauf. Eine Nachricht nur bei Treffern verlangte, dass der Absender die Abos kennt (`docs/ideas.md`, „Stufe 3“). Auf dem Gerät lässt sich eine Nachricht nicht unterdrücken (ADR 0014, Kontext). Ein täglicher Push an alle hieße also eine tägliche Nachricht für alle. Es bleibt bei einer Nachricht pro Woche.
- Angebote behalten das **Herz** (Merkliste, Kalender, Export). Die Glocke gibt es nur für Dinge, die Neues bringen können: Anbieter und Suchen.
- Keine Schnellwahl der Such-Abos in der Liste (`docs/ideas.md`, bleibt).
- Keine Obergrenze für Anbieter-Abos. Die 5 für Such-Abos bleiben.

## Entscheidungen

**E1 – Ein Begriff, ein Zeichen.**
- Neues Icon `bell` in `src/ui/icons.tsx`, Strichzeichnung wie `heart` im 24er-Raster.
- Ein gemeinsamer Knopf `BellButton` in `src/ui/OfferCard.tsx` neben `HeartButton` (Start). Klasse `bell`, Muster wie `.heart`: `aria-pressed`, `aria-label` „<Name> abonnieren“, Trefferfläche ≥ 44 × 44 px, gefüllt, wenn gedrückt.
- Die Animation `slap` (`card.css:237`) gilt mit, wie beim Herz. Unter `prefers-reduced-motion` schaltet `motion.css:10-15` sie wie jede Animation global ab. Die Füllfarbe in hell und dunkel prüft das Browser-Review.
- Texte: „abonniert“ und „Abo“, nie „gemerkt“ für Anbieter. Der Abschnitt im Tab heißt „Deine Anbieter-Abos“. Feinschliff der Texte in S6 mit `design:ux-copy`.
- **Speicher bleibt**: `zwergenplan.anbieter-merkliste` wird weiter gelesen und geschrieben. Bestehende gemerkte Anbieter werden so zu Abos (U1).
- Code-Identifier werden umbenannt (`savedProviders` → `providerAbos`, `useSavedProviders` → `useProviderAbos`), der Wert von `KEYS.savedProviders` bleibt.

**E2 – Zuschnitt: abonnierte Anbieter in der Wochen-Nachricht.** `weeklyText` (`src/domain/news.ts`) bekommt `providers: readonly string[]` (publicIds).
- **Treffer**: neues Angebot, Alter passt (`startFitsAge` wie bisher), und es passt zu einem Abo. Das heißt: Es stammt von einem abonnierten Anbieter (`providerId`) **oder** passt zu einem Such-Abo. Ohne jedes Abo zählt wie bisher jedes neue Angebot, nur das Alter filtert.
- **Anbieter-Treffer** ist jeder Treffer eines abonnierten Anbieters, auch wenn er zugleich zu einer Suche passt.
- **Reihenfolge**: `hits` und die Titelliste (`titleList`) nennen erst die Anbieter-Treffer, dann die übrigen, je in Datenreihenfolge. Der Doc-Kommentar von `WeeklyText.hits` ändert sich entsprechend.
- **Titel**:
  - alle Treffer sind Anbieter-Treffer: „1 neues Angebot von deinen Anbietern“ bzw. „N neue Angebote von deinen Anbietern“
  - sonst, mit irgendeinem Abo: „… für deine Abos“ (ersetzt „für deine Suchen“)
  - ohne Abo wie heute (Alter bzw. allgemein).
- Die Wochenzahl („nichts Neues“, Plan 0043, E2) folgt derselben Treffer-Regel: „Diese Woche nichts Neues für deine Abos“.
- Die Wegzeit-Grenze eines Such-Abos wirkt wie bisher, für Anbieter-Abos gilt keine.
- Das Ziel bleibt `PUSH_TARGET` („Neu eingestellt“).
- **Budget**: Zuerst Platz sparen. Die Titelzweige werden über eine Tabelle statt verschachtelter Ternaries gebaut, und doppelte Zahlwort-Texte werden zusammengelegt. Reicht das nicht, entscheidet U3.

**E3 – Spiegel: Anbieter-Abos im Geräte-Speicher.**
- Neuer `DeviceKey` `"providers"` (`src/data/device-store.ts`).
- `MirrorData.providers: string[]` kommt aus `cleanSavedProviders(loadSavedProviders())` in `mirrorData()` (`use-push-switch.ts`). Gespiegelt wird also die bereinigte Form.
- `push.ts` spiegelt den Schlüssel wie `searches`, als leeres Array löscht es ihn.
- `tailorPush` liest `providers` und prüft mit `isStringArray`. Ein kaputter Wert zählt als „kein Anbieter-Abo“.
- Beim Abschalten löscht `clear()` alles, wie bisher.

**E4 – Spiegeln nach jedem Glocken-Tipp.** Nach jedem Umschalten einer Glocke außerhalb des Kind-Sheets ruft die App `syncPushLater()` auf (neuer Export in `src/ui/AppExtras.tsx`).
- `syncPushLater()` lädt `assets/app/` über den bestehenden Lader und ruft `mirrorIfSubscribed(mirrorData())` (lokal, ohne Request).
- Rückgabe `"an" | "aus" | "nein"` (Review 2, Nr. 7): „nein“, wenn `pushCapability` nicht „ok“ ist (kein Push möglich). Scheitert das Laden, ist das Ergebnis `undefined`.
- **Eine Push-Instanz** (Review M4): Kind-Sheet (`PushControls`), Onboarding (`PushSwitch`, `AppSection.tsx:211`), Onboarding-Ende und `syncPushLater` nutzen dieselbe `createPush()`-Instanz auf Modulebene in `AppSection.tsx`.
- **Generationszähler** (Review 2, Nr. 2): Das Flag allein reicht nicht, denn `mirrorIfSubscribed` setzt es nach seinem `await subscription()` selbst wieder auf `true` (`push.ts:274-276`). `createPush` bekommt deshalb einen Zähler `generation`, den `disable()` und `clearAll()` erhöhen. `mirrorIfSubscribed` und `reconcile` merken sich den Wert vor jedem `await` und brechen ab, wenn er sich geändert hat. Dann liefert `mirrorIfSubscribed` „aus“.
- Unit-Test in `push.test.ts`, mit erzwungener Reihenfolge: Das `subscription()` von `mirrorIfSubscribed` löst erst nach `clear()` aus `disable()` auf. Danach ist der Speicher leer.
- **Im Kind-Sheet** ruft „Entfernen“ kein `syncPushLater`, denn das Sheet spiegelt dort ohnehin nach jedem Rendern.
- **Offline** (Review M3): In `startChunks` (`vite.config.ts:94`) kommt das Modul `/\/src\/ui\/app-extras\/AppSection\.tsx$/`, denn die Muster treffen Module, keine Dateinamen (Review 2, Nr. 5). `precacheList` zieht dessen statische Imports mit (`scripts/vite-sw.ts:85-90`), also auch Push-Code und Geräte-Speicher. Der Service Worker precacht den Chunk bei der Installation, und ein `import()` offline scheitert nicht und vergiftet keinen Chunk. Das ändert ADR 0013 (Precache-Liste) und ADR 0027, Zeile 29 („Die Precache-Liste … ändert sich nicht“). Beides steht in ADR 0037, `scripts/vite-sw.test.ts:44` zieht nach.
- **Request-Invariante**: Der Chunk-Request hängt am Tipp, nicht am Gespeicherten. Er kommt bei jedem Glocken-Tipp, egal ob und was abonniert ist und ob Push an ist. Nach dem Precache kommt er ohnehin aus dem Cache. Das E2E zählt es (S7).

**E5 – Glocke bei ausgeschaltetem Push: Push gleich einschalten** (Nutzerentscheidung U2, 2026-10-29).
- **Abonnieren** bei ausgeschaltetem Push, wenn das Gerät Push kann: Der Tipp speichert das Abo und schaltet die wöchentliche Push-Nachricht ein, mit dem Erlaubnis-Dialog des Systems. Das ist derselbe Weg wie beim Schalter (`push.enable(mirrorData())`, `usePushSwitch`).
- **Beenden** eines Abos schaltet nie etwas ein oder aus.
- **Im Tipp** (iOS verlangt `requestPermission` noch in der Geste, Plan 0011, E12):
  - Der App-Chunk lädt vor, sobald eine Glocke sichtbar ist (`preloadAppExtras()` aus `AppExtras.tsx`, wie `preloadProviderUi`). Dafür gibt es zwei Anlässe: Tab „Anbieter“ bzw. Anbieter-Sheet offen, oder die Glocke der Suche erscheint. Der Anlass ist die sichtbare Ansicht, nicht das Gespeicherte (ADR 0027). Der Chunk ist precacht (E4).
  - Ist das Modul beim Tipp geladen, ruft der Handler `enable` synchron als erste Anweisung auf, wie `toggle` im Schalter.
  - Ist es noch nicht geladen, ruft der Start-Code im Tipp `Notification.requestPermission()` synchron auf (der einzige Push-Aufruf im Start, wenige Bytes) und danach `enable`. Ist die Erlaubnis dann erteilt, braucht `enable` keinen Dialog mehr.
  - **Spike in S3 am echten iPhone** (Nutzer): Klappt `pushManager.subscribe` nach einem `await import()`? Wenn nicht, bleibt nur der vorgeladene Weg. Ist das Modul dann noch nicht da, kommt der Hinweis-Toast unten.
- **Verweigert** (Dialog abgelehnt oder `Notification.permission === "denied"`): Das Abo bleibt gespeichert, ein Hinweis-Toast sagt: „Abonniert. Push-Nachrichten sind in den Einstellungen des Geräts blockiert.“
- Ist Push schon an, spiegelt die Glocke nur (`syncPushLater`, E4).
- **Toasts** (reine Funktion `aboToast(kind, outcome)` in `src/ui/format.ts` mit Unit-Test):
  - Push an: „Anbieter abonniert.“ bzw. „Suche abonniert.“
  - eben eingeschaltet: „Abonniert. Die wöchentliche Push-Nachricht ist jetzt an.“ (`LONG_TOAST_MS`)
  - verweigert oder gescheitert (`PushProblem`): Hinweis mit Grund, Texte wie `problemText` (`LONG_TOAST_MS`, `tone: "hint"`)
  - kein Push möglich (Safari-Tab ohne Installation, „nein“): „Anbieter abonniert. Steht oben im Tab „Anbieter“.“ bzw. „Suche abonniert.“
  - beenden: „Abo beendet.“
  - für Suchen zusätzlich: „voll“ (`MAX_SEARCHES`) und „Wegzeit wirkt erst mit Startpunkt“
- Während `enable` läuft, zeigt die Glocke `aria-busy` und nimmt keinen zweiten Tipp an. Der Toast kommt mit dem Ergebnis, nicht vorher (die Sequenznummer aus Review 2, Nr. 8 entfällt).
- **Requests**: Ein Tipp, der Push einschaltet, meldet das Abo beim Push-Worker an, genau wie der Schalter. ADR 0014, Punkt 4 („Requests nur nach Tipp auf den Schalter“) erweitert ADR 0037 auf „Tipp auf Schalter oder Glocke bei ausgeschaltetem Push“.

**E6 – Glocke für Suchen in der Schnellfilter-Zeile.**
- Im Tab „Angebote“ (Liste und Karte) steht die Glocke in `QuickFilters` (`src/ui/Chrome.tsx`), als runder Icon-Chip direkt **nach** dem Chip „Filter“. `QuickFilters` rendert auch im Tab „Anbieter“ (`App.tsx:430`), darum bekommt es einen Prop `bell`, den `App` nur bei `section === "entdecken"` setzt.
- Die Glocke ist kein Filter. Sie steht in derselben scrollenden Zeile, aber außerhalb des `fieldset` „Schnellfilter“: Die Zeile wird ein `div.chips`, das `fieldset` mit seiner `legend` umfasst nur die Filter-Chips (`display: contents`). Das Browser-Review prüft die Ansage (Review 2, Nr. 10).
- Sie erscheint nur, wenn `searchOf(route.filter)` nicht leer ist, also ein Filter außer dem Zeitraum gewählt ist.
- Die Zeile `.chips` scrollt waagrecht (`chrome.css:219`), bei 320 px und 200 % Text bricht also nichts um, und `view-tools` bleibt unverändert (Review M5).
- Beim Einblenden rücken die Chips rechts davon um eine Chip-Breite. Das passiert ohnehin nur nach dem Tipp auf einen Filter. Das Browser-Review prüft den Sprung.
- `aria-label` „Suche abonnieren: <searchLabel>“ (Review m7), `aria-pressed`, wenn die Suche schon abonniert ist. Ein Tipp auf die gedrückte Glocke beendet das Abo.
- **Start-Bundle**: `src/domain/searches.ts`, `src/data/searches-store.ts` und `searchLabel` (aus `push-texts.ts` nach `src/ui/format.ts`) gehen in den Start. Bei 46 kB Reserve gibt es keinen Fallback. Dafür werden die Regeln in `.dependency-cruiser.cjs` geändert, samt Kanarienvögeln:
  - `push-domain-not-in-start`: `searches.ts` wird aus dem `to` genommen, nur `news.ts` und `stored-origin.ts` bleiben.
  - `app-data-only-lazy`: `searches-store.ts` wird aus beiden Listen genommen.
  - `onboarding-apart-from-app` (`.dependency-cruiser.cjs:244`) und `pwa-core-no-push` (`:352`) nennen `searches`/`searches-store` nicht mehr.
  - `isAppExtrasModule` samt Kommentar (`vite.config.ts:50-59`) und die Zuordnung in `scripts/lib/e2e-map.ts:147-148` ziehen nach.
  - Die Kommentare in `searches.ts:4` und `searches-store.ts:4` und `architecture.md` (Push-Teil, Zeile 100 und 104) ziehen nach.
  - Die doppelten Texttabellen `FORMAT`, `REGISTRATION` und `COST` in `push-texts.ts:2-12` fallen weg. `searchLabel` nutzt die vorhandenen Labels im Start (Review 2, Nr. 11).
- State: neuer Hook `useSearchAbos()` in `src/ui/use-app-state.ts`, gebaut wie `useSavedProviders`. Glocke und Verwaltungsliste nutzen denselben State.

**E7 – Einstellungen: nur Verwaltung, im Start** (Review M6).
- Neue Komponente `AboList` in `src/ui/KidSheet.tsx` (Start, nicht im Lazy-Chunk). Sie erscheint immer, auch ohne Push-Unterstützung und offline, denn Anbieter-Abos wirken auch im Tab „Anbieter“.
- Die Liste „Such-Abos“ zeigt `searchLabel`, den Hinweis „Wegzeit wirkt ab einem Startpunkt“ und „Entfernen“, wie heute.
- Die Liste „Anbieter-Abos“ zeigt den Namen je `publicId` und „Entfernen“. Den Namen nimmt sie aus den Angeboten, die die App schon hat (`providerName` des ersten Angebots in `site.json`). Ohne kommendes Angebot heißt es „Anbieter ohne aktuelle Angebote“. `anbieter.json` lädt dafür **nicht**, sonst hinge ein Request am Gespeicherten.
- Solange die Daten nicht geladen sind (`load.kind !== "ready"`, etwa offline beim Erststart), steht neutral „Anbieter-Abo“ ohne Namen, nie „ohne aktuelle Angebote“ (Review 2, Nr. 3). Angebote und Ladezustand kommen über `Overlays.tsx` in `KidSheet`.
- **Fokus**: „Entfernen“ lässt die Zeile verschwinden. Danach geht der Fokus auf die Überschrift der Liste (`tabIndex={-1}`), wie heute in `PushControls.tsx:86-87`. Sonst fiele er im Modal auf `<body>`. Das E2E prüft es mit `toBeFocused`.
- `mirror` löscht den Schlüssel bei einem leeren Array ausdrücklich, denn `push.ts:164` macht aus `[]` kein `undefined`. Der Unit-Test prüft genau diesen Fall (Review 2, Nr. 13).
- Leer: „Noch keine Abos. Tippe auf die Glocke bei einem Anbieter oder über der Liste.“ Darunter steht, was ohne Abo kommt (bisher `noneWithAge`/`noneWithoutAge`, die Texte wandern mit).
- `PushControls` verliert „Aktuelle Suche“, die Such-Abo-Liste und die Such-Texte. Es bleiben Schalter, Statuszeile, der Hinweis „Kommt erst mit eingeschalteter wöchentlicher Push-Nachricht“ (jetzt für alle Abos) und die Geräte-Kennung. Es bleibt „ohne Props aus dem Start“.
- Reihenfolge im Kind-Sheet: Abschnitt „Als App“ mit dem Schalter, direkt darunter `AboList`.

**E8 – ADR 0037** „Abos: Anbieter im Zuschnitt der Wochen-Nachricht, Such-Abos im Start, Spiegeln nach Glocken-Tipp“. Es ändert:
- die Invariante „Privatsphäre“ (`architecture.md`): Anbieter-Abos liegen bei eingeschaltetem Push in der IndexedDB, der Service Worker liest sie. Sie verlassen das Gerät weiterhin nie, und kein Request hängt davon ab, ob oder welche Abos bestehen.
- ADR 0014, Punkt 4: Gespiegelt wird zusätzlich nach jedem Glocken-Tipp. Der Chunk-Request ist tippgebunden und hängt nicht am Gespeicherten, das ist die Begründung im Sinne von ADR 0027. Dazu die Liste der gespiegelten Angaben.
- ADR 0013: `AppSection-*.js` steht in der Precache-Liste.
- Plan 0025, E1 (gemerkte Anbieter → Anbieter-Abos).
- die Regeln `push-domain-not-in-start` und `app-data-only-lazy`.
- `architecture.md` (Privatsphäre, Push-Teil Zeile 100 und 120, App-Extras) und den Datenschutz-Abschnitt in `imprintPage()` (`scripts/lib/share-pages.ts`).
- In ADR 0012 kommt eine Zeile in die Delta-Tabelle (Start-JS, App-Extras, Service Worker).

## Nutzerentscheidungen

**Entschieden am 2026-10-29: U1 Filtern (Empfehlung), U2 Push gleich einschalten (statt Hinweis-Toast; E5 ist darauf umgeschrieben), U3 bei Bedarf auf 9,5 kB (Empfehlung).**

- **U1 – Bestehende gemerkte Anbieter werden Abos** und schneiden ab sofort die Nachricht zu (Empfehlung: ja).
  - Wer bisher nur Anbieter gemerkt und keine Suche abonniert hatte, bekam alle neuen, altersgerechten Angebote. Danach bekommt er nur noch die seiner Anbieter.
  - Alternative: Anbieter-Abos nur zuerst nennen, aber nicht filtern. Das passt nicht zu „abonnieren“.
  - Ein einmaliger Hinweis für Bestandsnutzer kommt in `docs/ideas.md` (Review m9). Die Nutzer sind Familie und Freunde, eine Info per Nachricht reicht.
- **U2 – Glocke bei ausgeschaltetem Push** (Empfehlung: Hinweis-Toast, E5).
  - Alternative: Die Glocke schaltet beim ersten Abo gleich Push ein, mit Erlaubnis-Dialog. Dann müsste der Push-Code vor dem Tipp geladen sein (iOS verlangt `requestPermission` noch im Tipp, Plan 0011, E12), und ein kleines Icon löste einen Systemdialog aus.
- **U3 – Service-Worker-Budget** (Empfehlung: nach dem Sparversuch aus E2 bei Bedarf auf 9,5 kB anheben).
  - Der Puffer beträgt 0,01 kB. Die neue Funktion bringt geschätzt +0,1 bis +0,2 kB.
  - Der Service Worker lädt nur bei der Installation und beim Push, das Start-Gate berührt er nicht. Präzedenz sind die Nutzerentscheide zu den Budgets in ADR 0012.
  - Alternative: Titel ohne eigenen Anbieter-Zweig („für deine Abos“ für alle Treffer). Das spart etwa 0,05 kB, nennt die Anbieter aber nicht im Titel.

## Dateien

- Neu: `docs/adr/0037-abos-mit-glocke.md`
- Domäne: `src/domain/news.ts` (+ Test), `src/domain/searches.ts` (Kommentar)
- Daten: `src/data/device-store.ts`, `src/data/push.ts` (+ Test), `src/data/searches-store.ts` (Kommentar)
- SW: `src/sw/push-tailor.ts` (+ Test), `src/sw/push-decision.test.ts` („für deine Suchen“)
- UI: `src/ui/icons.tsx`, `src/ui/OfferCard.tsx` (`BellButton`), `src/ui/Chrome.tsx` (Glocke in `QuickFilters`), `src/ui/anbieter/ProviderScreen.tsx`, `src/ui/anbieter/ProviderSheet.tsx`, `src/ui/provider-types.ts`, `src/ui/Overlays.tsx`, `src/ui/App.tsx`, `src/ui/use-app-state.ts` (+ Test), `src/ui/KidSheet.tsx` (`AboList`), `src/ui/format.ts` (+ Test: `searchLabel`, `aboToast`), `src/ui/AppExtras.tsx` (`syncPushLater`), `src/ui/app-extras/AppSection.tsx` (eine Push-Instanz), `src/ui/app-extras/PushControls.tsx`, `src/ui/app-extras/use-push-switch.ts`, `src/ui/app-extras/push-texts.ts` (+ Test), `src/ui/styles/card.css` bzw. `chrome.css` (`.bell`, Glocken-Chip)
- Build und Regeln: `vite.config.ts` (`startChunks`, `isAppExtrasModule`), `scripts/vite-sw.test.ts`, `.dependency-cruiser.cjs` (vier Regeln, Kanarienvögel), `scripts/lib/e2e-map.ts` (Zuordnung `searches`), `scripts/screenshots.ts:149-151` (klickt „Suche abonnieren“ und erwartet „Deine Such-Abos“), `.size-limit.json` (nur bei U3)
- ADRs: `docs/adr/0013-pwa-service-worker.md`, `docs/adr/0014-web-push.md`, `docs/adr/0027-app-chunk-beim-erststart-vorladen.md` (je ein Nachtrag mit Verweis auf ADR 0037)
- Doku: `docs/architecture.md`, `docs/adr/0012-startbudget-und-chunks.md` (Delta-Zeile), `scripts/lib/share-pages.ts` (Datenschutz), `docs/ideas.md` (die Einträge „Neue Angebote gemerkter Anbieter in der Wochen-Nachricht“ und „Suche abonnieren im Filter-Sheet“ als erledigt durch diesen Plan streichen, Hinweis für Bestandsnutzer neu)
- E2E: `e2e/push.spec.ts`, `e2e/merkliste-anbieter.spec.ts`, `e2e/anbieter.spec.ts`, `e2e/app.spec.ts` (Glocke der Suche), `e2e/pwa.spec.ts` (`describe("offline")`, Zeile 143: Glocke offline, dann Kind-Sheet; Precache-Liste enthält `assets/app/AppSection-*`), `e2e/mobile-ux.spec.ts` (Kind-Sheet mit langem Such-Abo und zwei Anbieter-Abos, 320 px, 200 %)

## Schritte

Jeder Schritt endet mit `pnpm verify` grün, UI-Schritte zusätzlich mit `pnpm e2e:local --affected` (im Hintergrund).

- **S1 – Domäne, test-first**: `weeklyText` mit `providers` (E2). `pnpm size`: Service Worker messen, bei Bedarf U3.
- **S2 – Spiegel und SW**: `DeviceKey` `providers`, `MirrorData.providers`, `mirrorIfSubscribed` liefert an/aus, eine Push-Instanz, `tailorPush` liest `providers`.
- **S3 – Glocke für Anbieter**: Icon, `BellButton`, ProviderScreen und ProviderSheet, Abschnittstitel, `aboToast`, `syncPushLater()`, `startChunks`, Umbenennung der Identifier.
- **S4 – Glocke für Suchen**: Regeln in `.dependency-cruiser.cjs`, `useSearchAbos`, `searchLabel` nach `format.ts`, Glocken-Chip in `QuickFilters`.
- **S5 – Einstellungen**: `AboList` im Kind-Sheet, `PushControls` verschlanken. `pnpm size` für alle Budgets, Werte in die ADR-0012-Tabelle.
- **S6 – Doku und Texte**: ADR 0037, `architecture.md`, `imprintPage()`, `ideas.md`, Texte prüfen (`design:ux-copy`).
- **S7 – Prüfen**: `pnpm verify`, `pnpm e2e:local --affected` und `--smoke` (Vorschauseiten über `share-pages.ts`), `/arch-review`.
  - `/browser-review` lokal mit Fixture-Build: Tab „Anbieter“, Anbieter-Sheet, Liste und Karte mit und ohne Filter und mit gedrückter Glocke, Kind-Sheet mit und ohne Abos.
  - Hell und dunkel, pixel-7 und iphone-15, 320 px, quer, 200 % Text, reduzierte Bewegung.
- **S8 – Ausliefern**: Branch pushen, CI grün, Fast-Forward nach `main`, CI auf `main` grün, `meta.json` prüfen, `/browser-review live`.

## Tests

- **Unit**
  - `news.test.ts`: nur Anbieter-Treffer (Titel „von deinen Anbietern“), gemischt (Reihenfolge Anbieter zuerst in `hits` und Text), Treffer zugleich von Anbieter und Suche zählt als Anbieter-Treffer, Anbieter-Treffer zu jung/alt → kein Treffer, Anbieter-Abo ohne Such-Abo filtert, ohne Abo unverändert, Wochenzahl „für deine Abos“.
  - `push.test.ts`: `providers` wird gespiegelt, beim Abschalten gelöscht, ein leeres Array löscht den Schlüssel. `mirrorIfSubscribed` während `disable()` schreibt nichts nach `clear()`.
  - `push-tailor.test.ts`: `providers` gelesen, kaputter Wert ignoriert.
  - `use-app-state.test.ts`: `useSearchAbos` fügt hinzu, meldet „voll“ und „schon-da“, entfernt, schreibt den Speicher.
  - `format.test.ts`: `aboToast` für alle Fälle, `searchLabel`.
  - `push-texts.test.ts`: kein „gemerkt“ mehr bei Anbietern.
- **E2E**
  - `merkliste-anbieter.spec.ts`: Glocke statt Herz (Rolle `button`, Name „… abonnieren“, `aria-pressed`) in Zeile und Sheet, Abschnitt „Deine Anbieter-Abos“ oben, Toast. **Privatsphäre**: Die Requests beim Start sind mit und ohne gespeicherte Abos gleich. Ein Tipp auf eine Glocke erzeugt beim Abonnieren dieselben Requests wie beim Beenden, höchstens `assets/app/`.
  - `push.spec.ts`:
    - Mit Push an einen Anbieter abonnieren → IndexedDB `providers` enthält die publicId, ohne das Kind-Sheet zu öffnen. Abo beenden → die ID fehlt.
    - Zustellung per CDP mit einem neuen Angebot dieses Anbieters → Titel „… von deinen Anbietern“.
    - Suche über die Glocke abonnieren → `zwergenplan.such-abos` gesetzt und gespiegelt.
    - Mit Push aus kommt der Hinweis-Toast.
    - Kind-Sheet: „Aktuelle Suche“ fehlt, `AboList` zeigt beide Listen, „Entfernen“ löst die Glocke.
  - `app.spec.ts`: Ohne Filter fehlt die Glocke der Suche, mit Filter ist sie da. Ein Tipp drückt sie, nach dem Reload ist sie noch gedrückt. Ein sechstes Abo meldet „voll“. Nur der Zeitraum als Filter: keine Glocke.
  - `pwa.spec.ts`, offline: Glocke tippen, dann Kind-Sheet öffnen → Abschnitt „Als App“ lädt (kein `LoadFailed`). Die Precache-Liste enthält `assets/app/AppSection-*`.
  - `mobile-ux.spec.ts`: Kind-Sheet mit langem Such-Abo und zwei Anbieter-Abos (320 px, 200 %). Die gefilterte Liste (`?kat=bewegung`, Zeile 280) prüft die Glocke schon mit.
  - Kind-Sheet: Nach „Entfernen“ hat die Listen-Überschrift den Fokus (`toBeFocused`). Ohne geladene Daten steht „Anbieter-Abo“ ohne Namen.
  - Der Fall „Push nicht möglich“ ist per Unit-Test (`aboToast`) abgedeckt. `push.spec.ts` läuft nur auf Chromium.
- **Fixture**: Prüfen, dass `tests/fixtures/` einen Anbieter mit einem in der eingefrorenen Woche neu eingestellten Angebot (`listedAt`) hat. Sonst ergänzen (fiktiv). Die Fixtures wählen die volle E2E-Auswahl, die CI fährt sie.

## Review (2026-10-29) – Verdict: Überarbeiten → eingearbeitet

Übernommen:
- **B1** Service-Worker-Budget: Die Messung steht im Befund, E2 versucht zuerst zu sparen, U3 entscheidet die Anhebung, ADR 0012 bekommt eine Delta-Zeile.
- **M1** Regeln `push-domain-not-in-start` und `app-data-only-lazy`: Der Umbau steht in E6 und E8, der Fallback ist gestrichen.
- **M2** ADR 0037 ändert ADR 0014, Punkt 4 (Spiegelzeitpunkt), `architecture.md` Zeile 100 und 120, begründet nach ADR 0027 (E8).
- **M3** Offline: `AppSection-*.js` per `startChunks` precacht, dazu ein E2E-Test (E4).
- **M4** Eine Push-Instanz auf Modulebene. „Entfernen“ im Sheet ruft kein `syncPushLater`. Dazu ein Unit-Test (E4).
- **M5** Die Glocke steht in der waagrecht scrollenden Chip-Zeile statt in `view-tools`, prüfen bei 320 px, quer und 200 % (E6, S7).
- **M6** `AboList` und die Abo-Texte liegen im Start im Kind-Sheet, `PushControls` bleibt ohne Props (E7).
- m1 Titel und `hits`-Reihenfolge festgelegt (E2). m2 bereinigt spiegeln (E3). m3 `aboToast` als reine Funktion (E5). m4 `push-decision.test.ts` in „Dateien“. m5 Prüfung je Schritt, E2E „Abo beendet“. m6 Animation und Dunkelmodus (E1, S7). m7 `aria-label` mit `searchLabel` (E6). m8 Toast sofort, Hinweis nachgereicht (E5). m9 Hinweis für Bestandsnutzer in `ideas.md` (U1).

Abgelehnt: keins.

## Review 2 (2026-10-29) – Verdict: Freigabe mit Änderungen → eingearbeitet

Runde 1 bestätigt gelöst: B1, M1, M3, M5, M6. Übernommen:
1. ADR-Nummer: 0034 bis 0036 sind reserviert (Pläne 0045, 0046, 0044, 0047), also **ADR 0037**.
2. M4 war nur scheinbar gelöst. Dazu kommen ein Generationszähler in `createPush` (gegen `disable()`), ein Test mit erzwungener Reihenfolge und eine Instanz auch für `PushSwitch` im Onboarding (E4).
3. `AboList`: Neutraler Text, solange die Daten nicht geladen sind; Fokus nach „Entfernen“ auf die Überschrift (E7).
4. `scripts/screenshots.ts` und `e2e/pwa.spec.ts` stehen in „Dateien“, der Offline-Test liegt in `pwa.spec.ts`.
5. `startChunks` matcht das Modul `AppSection.tsx`. ADR 0027, Zeile 29 ändert sich mit (E4).
6. Weitere Regeln und Kommentare (`onboarding-apart-from-app`, `pwa-core-no-push`, `isAppExtrasModule`, `e2e-map.ts`, `architecture.md:104`) stehen in E6 und „Dateien“.
7. `syncPushLater` liefert `"an" | "aus" | "nein"` (E4).
8. Hinweis-Toast mit `LONG_TOAST_MS` und Sequenznummer aus `say` (E5).
9. Reduzierte Bewegung richtig beschrieben (E1).
10. Glocke außerhalb des `fieldset` „Schnellfilter“, Prop `bell` nur bei „Angebote“ (E6).
11. Doppelte Texttabellen in `push-texts.ts` fallen weg (E6).
12. Mobile-UX-Gate für das Kind-Sheet mit gefüllten Listen (Tests).
13. Leeres Array löscht ausdrücklich, mit Unit-Test (E7).

Abgelehnt: keins. Kein Blocker offen. Offen sind nur die Nutzerentscheidungen U1–U3.

## Umsetzung (2026-10-29)

S1–S6 umgesetzt. Abweichungen vom Plan:
- **Identifier nicht umbenannt** (E1): `savedProviders`, `useSavedProviders`, `isProviderSaved` bleiben. Die Umbenennung hätte gut 30 Stellen ohne Verhaltensänderung berührt. Texte, Kommentare und E2E heißen „abonnieren“.
- **Glocke der Suche** (E6): Sie steht fest rechts neben der Gruppe „Schnellfilter“ (`div.quickbar`), nicht nach dem Chip „Filter“ in der scrollenden Zeile. Ein `fieldset` mit `display: contents` hätte keinen Kasten, und `saved.spec.ts` prüft die Gruppe mit `toBeVisible`. So bleibt die Glocke bei 320 px sichtbar und verschiebt keine Chips.
- **Erlaubnis im Start** (E5): `pushPermission` und `askPushPermission` liegen in `src/data/pwa-start.ts`. Biome sperrt `Notification` in `src/ui` (Plan 0011, E5b).
- **Startpunkt-Hinweis** (E5, E7): Die App prüft `origin !== undefined` aus `useOrigin`, nicht `originFromStored`. `stored-origin.ts` darf nicht in den Start (`push-domain-not-in-start`).
- **Texte**: Abschnitt im Kind-Sheet „Deine Abos“, eine gemeinsame Liste (Anbieter zuerst, dann Suchen, je mit Zusatz „Anbieter“ bzw. „Suche“). „Entfernen“ heißt für Screenreader „Abo … beenden“.
- **SW-Budget**: Der Sparversuch in `weeklyText` (gemeinsamer Zahltext) brachte nach gzip nichts, daher zunächst 9 → 9,5 kB (U3). Beim Rebase auf `main` lag die Grenze schon bei 12 kB (ADR 0012, Nachtrag 2026-10-29), die 9,5 kB entfallen.

## Arch-Review (2026-10-29) – Verdict: Nacharbeit nötig → behoben

- **B1** `e2e/mobile-ux.spec.ts`: Ansicht `anbieter-sheet-gemerkt` suchte noch „… merken“. Umgestellt auf die Glocke, Ansichten heißen jetzt `anbieter-sheet-abonniert` und `anbieter-abonniert`.
- **M1** `.quickbar`/`.quick-bell` hatten kein CSS. Jetzt Flex-Zeile in `chrome.css`, die Glocke fest rechts.
- **M2** `bellPush` ohne Unit-Test: Die Entscheidung steht jetzt in `bellPushWith` mit injizierter Umgebung, `src/ui/AppExtras.test.ts` prüft alle Zweige. `problemOf` bleibt beim Duck-Typing, denn `push.ts` darf nicht statisch in den Start (begründet im Code).
- **M3** Mobile-UX der gefüllten Abo-Liste lief nur auf Chromium. Neue Ansicht `kind-sheet-abos` in `mobile-ux.spec.ts`, auf allen Geräten.
- **M4** `tsconfig.tsbuildinfo` aus dem Index genommen, `*.tsbuildinfo` in `.gitignore`.
- **Minor**:
  - m1 Kommentare in `searches.ts`, `searches-store.ts` und `vite.config.ts` nachgezogen.
  - m2 `architecture.md`, Push-Teil: Satzbezug korrigiert.
  - m3 ADR 0037, Konsequenzen: beide iOS-Fälle für den Spike genannt.
  - m4 `AppExtras.tsx` wählt `merkliste-anbieter.spec.ts` und `pwa.spec.ts`.
  - m5 `vite-sw.test.ts`: Fall mit `AppSection` als Start-Chunk.
  - m6 `news.test.ts`: feste Sollwerte.
  - m7 Privatsphäre-Test vergleicht Abonnieren und Beenden, nachdem das Vorladen fertig ist.
  - m8 Anbieter-Glocken bekommen `busy` (`bellBusy` über `provider-types.ts`).
  - m9 Typ von `syncPush` wieder genau.

## Arch-Review 2 (2026-10-29) – Verdict: Nacharbeit nötig (kein Blocker) → behoben

Runde 1 bestätigt behoben. Neu:
- **M1** Namenswahl der Abo-Verwaltung ungetestet: jetzt `providerAboName` in `format.ts` mit Unit-Test; `kind-sheet-abos` prüft Name und Ersatztext.
- **Minor**:
  1. `architecture.md`: Der Service Worker liest Anbieter-Abos, das Vorladen bei sichtbarer Glocke ist nachgetragen.
  2. Kommentare in `push.ts`, `push-tailor.ts` und die Lint-Texte in `biome.json` nennen die Ausnahme `pwa-start.ts`.
  3. Hinweis „Deine Abos wirken erst mit eingeschalteter wöchentlicher Push-Nachricht“ steht wieder in `PushControls`, wenn Push aus ist.
  4. `searchLabel` trennt Mehrfachwerte wieder mit Komma, mit typisierten Tabellen und Test.
  5. `pushPermission` liefert beim Notausgang (`data-sw="aus"`) `undefined`, dann kommt kein Erlaubnis-Dialog.
  6. Privatsphäre-E2E wartet gezielt auf den vorgeladenen `AppSection`-Chunk.
  7. Ungeprüften Kommentar in `app.spec.ts` gestrichen.
  8. Anbieter-Abos ohne Namen bekommen für Screenreader eine Nummer.

## Browser-Review (2026-10-29, lokal, Fixture-Build)

Ansichten `glocke`, `anbieter-abos`, `anbieter-sheet`, `push` (neu bzw. angepasst in `scripts/screenshots.ts`), je 320, 360, 365, iPhone, Pixel und quer, hell und dunkel: 48 Bilder, alle angesehen. Headless ist Push blockiert, daher zeigen die Toasts den Fall „blockiert“.

- **F1** (`glocke-iphone-light`, `glocke-quer-*`): Die Chips brachen hart unter der Glocke ab, wegen des negativen Rands. Behoben: kein negativer Rand, die Chip-Zeile läuft vor der Glocke weich aus (`mask-image`).
- **F2** (`push-*`, `push-quer-*`): Der lange Hinweis-Toast eines Glocken-Tipps steht noch, wenn man gleich das Kind-Sheet öffnet, und liegt dort über Liste und „Fertig“. Das ist das bestehende Toast-Muster der Dialoge, daher nicht geändert; Idee in `docs/ideas.md`.

Checkliste:
- **Lesbarkeit**: Die gedrückte Glocke ist gelb mit dunklem Symbol, in hell wie dunkel klar. Der Abschnitt „Deine Anbieter-Abos“ steht über „Weitere Anbieter“. In der Abo-Verwaltung steht die Art („Anbieter“, „Suche“) als Zusatz unter dem Namen.
- **Daumen**: Die Glocke der Suche liegt oben rechts in der Filterzeile, also dort, wo auch die Filter sind. Die Anbieter-Glocken liegen rechts in jeder Zeile wie bisher das Herz. Die Abstände betragen ≥ 8 px, die Ziele 44 px.
- **Zustände**:
  - ohne Filter keine Glocke (E2E);
  - leere Abo-Liste mit Hinweis;
  - lange Such-Abos umbrechen bei 320 px ohne Abschneiden;
  - Anbieter ohne Angebote heißen „Anbieter ohne aktuelle Angebote“;
  - vor dem Laden „Anbieter-Abo“.
- **Dark Mode**: keine hellen Inseln, die Glocke hat genug Kontrast.
- **Micro-Interactions**: Die Glocke hat `aria-pressed` mit Farbwechsel und die Animation des Herzens (unter reduzierter Bewegung aus), `aria-busy` während des Einschaltens. Eine Live-Interaktion in Chrome entfiel. Die Interaktionen laufen in den E2E-Specs (Tipp, Neuladen, offline, Fokus).
- **Konsistenz**: Die Glocke nutzt die Form des Herzens (`.heart`), Toasts und Listen nutzen die vorhandenen Muster.

## Live (2026-10-29)

Live seit dc7498d: CI auf `main` grün, Deploy durch, `meta.json` zeigt `dc7498d`. Kurzcheck `/browser-review live` mit `glocke`, `push` und `anbieter-sheet` (iPhone hell und dunkel): Die Glocke steht auch neben langen echten Anbieternamen sauber, die Chips laufen weich aus, die Abo-Verwaltung bricht nicht. `anbieter-abos` nutzt Fixture-IDs und läuft live nicht.

Offen vor dem Archivieren: der iPhone-Spike (E5; Glocke bei ausgeschaltetem Push, Erlaubnis „default“ und „granted“), danach Restpunkte nach `docs/ideas.md`.

## Nachtrag A (2026-10-31): Chip „Meine Anbieter“, Push nur für Anbieter, Such-Abos entfallen

### Anlass

Wunsch des Nutzers vom 2026-10-31: „Bei Entdecken sollte man auch nur nach Angeboten von abonnierten Anbietern filtern können, das wäre auch für die Push-Nachricht praktisch.“ Auf die Rückfrage, was das für den Push heißt, entschied er: **Push nur für Anbieter, Such-Abos entfernen.**

### Befund

- Der Wochen-Push zählt heute einen Treffer, wenn er von einem abonnierten Anbieter stammt **oder** zu einem Such-Abo passt (E2). Anbieter-Treffer stehen vorn.
- Such-Abos sind der einzige Grund, warum der Service Worker `wegzeit.json` lädt und den Startpunkt (`origin`) aus dem Geräte-Speicher liest. `reach` wirkt in `weeklyText` nur über `matchesFilter` mit einem Such-Abo (`src/domain/news.ts`, `fits`; `src/sw/push-tailor.ts`, `reach`). `src/domain/stored-origin.ts` nutzt nur `push-tailor.ts`.
- In „Entdecken“ gibt es keinen Filter nach abonnierten Anbietern. `useOfferViews` filtert `visible` mit `applyFilters(offers, route.filter, …)` (`src/ui/use-offer-views.ts`).
- Vorbild für einen Chip außerhalb des Filter-Sheets sind die Listen-Chips der Merkliste (Plan 0058, E1): eigener Zustand im Speicher, nicht in URL und Sheet, kein Badge, „Filter zurücksetzen“ leert sie mit.

### Entscheidungen

**N1 – Chip „Meine Anbieter“ in „Entdecken“.**
- Er steht in `QuickFilters` der Startseite als erster Chip nach „Filter“, nur wenn mindestens ein Anbieter abonniert ist (`savedProviders`, dieselbe Liste wie im Tab „Anbieter“).
- Der Zustand `ownProviders: boolean` lebt in `App` (`useState(false)`), nur im Speicher, wie die Listen-Chips der Merkliste. Er steht **nie in der URL**: Beim Empfänger eines geteilten Links zeigte er dessen Abos, also eine andere Liste.
- Er wirkt in Liste und Karte von „Entdecken“: `useOfferViews` bekommt `ownProviders?: readonly string[]`. Ist es gesetzt, schränkt es `filtered` ein, also das Ergebnis von `applyFilters(offers, route.filter, …)`, **vor** `ageVisibility`. Sonst stimmte `unfitCount` nicht (Review M2). Davon leiten sich Statuszeile, Liste, Karte, Marker, `unfitCount` und die Zahl im Filter-Sheet ab.
- **Kamera-Regel** (Review M2): `upcoming` und damit `cameraOffers` bleiben unberührt. Der Kartenausschnitt und die Kachel-Requests hängen nie an den Abos (`architecture.md`, Invariante „Kein Request hängt davon ab, ob oder welche Anbieter abonniert sind“). Der Varianten-Test in `use-offer-views.test.ts` bekommt `ownProviders` dazu.
- Unberührt bleiben der Tab „Anbieter“ und die Merkliste. `providerVisible` ist außerhalb des Tabs „Anbieter“ künftig `visible` **ohne** Chip. Sonst zeigte das Anbieter-Sheet eines nicht abonnierten Anbieters bei gedrücktem Chip alle seine Angebote als „außerhalb der Filter“ (`hasOffersOutside`, `ProviderSheet.tsx`; Review m5).
- Die reine Funktion `fromProviders(offers, ids)` liegt in `src/domain/filter.ts` (Unit-Test).
- Nicht im Filter-Sheet, kein Badge (wie Plan 0058, E1). `resetFilters` setzt ihn mit zurück, `resetIfActive` greift auch, wenn nur der Chip an ist.
- Wird das letzte Abo beendet, verschwindet der Chip, und `ownProviders` wird `false` (Effekt auf `savedProviders.length === 0`). Ein späteres neues Abo zeigt ihn dann nicht schon gedrückt (Review m4). Ein Hook- oder E2E-Fall prüft das.
- Text: „Meine Anbieter“. Leerzustand wie bei jedem Filter, mit „Filter zurücksetzen“.

**N2 – Push nur für Anbieter-Abos** (`weeklyText`, ersetzt E2 in diesem Punkt).
- `WeeklyInput` verliert `searches` und `reach`. Treffer: neues Angebot, Alter passt wie bisher, und es stammt von einem abonnierten Anbieter. Ohne Anbieter-Abo zählt wie bisher jedes neue Angebot, nur das Alter filtert.
- Titel mit Abo: „1 neues Angebot von deinen Anbietern“ bzw. „N neue Angebote von deinen Anbietern“. Wochenzahl: „Diese Woche nichts Neues von deinen Anbietern“. Ohne Abo bleibt alles wie heute.
- `hits` ist die Datenreihenfolge, denn die Sortierung „Anbieter zuerst“ entfällt.

**N3 – Service Worker ohne Wegzeit und Startpunkt.**
- `tailorPush` lädt nur `data/site.json`. `TailorEnv` verliert `cachedJson` und `reachFor`, `fetchJson` kennt nur `data/site.json`. Gelesen werden `birthDate`, `providers` und `seenIds`. `src/sw/sw.ts` verdrahtet entsprechend.
- `src/domain/stored-origin.ts` samt Test entfällt (knip), ebenso sein Eintrag in `scripts/lib/e2e-map.ts`. Plan 0039 (Düsseldorf, in Umsetzung) wollte die Datei auf die Netz-bbox umstellen (E3). Der Punkt entfällt dort, Plan 0039 bekommt einen Hinweis (Review m6).
- **Altlast löscht auch der Service Worker** (Review M1): `mirror()` läuft nur bei offenem Kind-Sheet, am Ende des Onboardings und nach einem Glocken-Tipp. Bei vielen Nutzern mit Push bliebe der Startpunkt sonst liegen. Deshalb gilt:
  - `tailorPush` löscht bei jedem Push `origin` und `searches`, auch beim Testversand. Das ist keine Nutzerangabe, sondern Aufräumen.
  - `TailorEnv.store.set` erlaubt dafür `"origin" | "searches"` mit `undefined`.
  - Kein Löschen im `activate`-Handler (Umsetzung): Die Altlast liegt nur auf Geräten mit eingeschaltetem Push, und dort löscht sie spätestens der nächste Samstags-Push. Ein Löschen im `activate` legte bei allen anderen eine leere IndexedDB an.
  - Unit-Test in `push-tailor.test.ts`.
- Privatsphäre: Der Startpunkt liegt bei eingeschaltetem Push nicht mehr in der IndexedDB. Damit fällt die Ergänzung zu ADR 0017 (Punkte 1 und 3) aus ADR 0014 weg.

**N4 – Spiegel: nur Geburtsdatum und Anbieter-Abos.**
- `MirrorData` verliert `searches` und `origin`, `MIRRORED` wird `["birthDate", "providers"]`.
- **Altlast im Geräte-Speicher**: `DEVICE_KEYS` behält `searches` und `origin` als `LEGACY_KEYS`. `mirror()` löscht sie, sobald es zum ersten Mal spiegeln darf (je Instanz einmal, über `written`). Bei eingeschaltetem Push bleibt so kein Startpunkt in der IndexedDB liegen. Ein Unit-Test in `push.test.ts` prüft das.
- `mirrorData()` (`use-push-switch.ts`) liest weder Startpunkt noch Such-Abos.

**N5 – Such-Abos entfallen in der Oberfläche.**
- Weg sind die Glocke in `QuickFilters` (Prop `bell`; `.quickbar` bleibt nur, wenn das Layout sie noch braucht) und `useSearchAbos`. Mit Tests entfallen `src/domain/searches.ts`, `src/data/searches-store.ts` und `searchLabel`. In `aboToast` fallen die Such-Zweige weg (`kind` nur „anbieter“, ohne `noOrigin` und `daytime`), in `AboList` die Such-Abos (`searches`, `hasOrigin`, `removeSearch`).
- `bellVisible` hängt nur noch am Tab „Anbieter“ und am Anbieter-Sheet.
- Leertext von `AboList`: „Noch keine. Tippe auf die Glocke bei einem Anbieter.“, danach der Satz zum Alter wie bisher.
- **Altlast im `localStorage`**: `forgetSearchAbos()` in `src/data/preferences.ts` entfernt `zwergenplan.such-abos`, gefangen mit `try`/`catch` wie die übrigen Schreiber, denn bei gesperrtem Speicher darf es nicht werfen (Review m8). `App` ruft es einmal beim Start auf (lokal, kein Request). In `docs/ideas.md` kommt ein Eintrag: Den Altlast-Code (`forgetSearchAbos`, `LEGACY_KEYS`, das Löschen im Service Worker) entfernen, sobald er ein halbes Jahr live ist. Bestehende Such-Abos verschwinden ohne Hinweis. Das ist bewusst so: Der Nutzerkreis ist klein, und der Push meldet danach alles Neue bzw. die Anbieter-Treffer.
- Regeln und Kommentare in `.dependency-cruiser.cjs` (`push-domain-not-in-start`, `onboarding-apart-from-app` u. a.), `vite.config.ts` (Kommentar zu `isAppExtrasModule`) und `scripts/lib/e2e-map.ts` nennen `searches`, `searches-store` und `stored-origin` nicht mehr.

**N6 – ADR 0042** „Push nur für Anbieter-Abos, Such-Abos entfallen“. Es ändert:
- ADR 0037, Punkte 2 und 7 (Zuschnitt, Such-Abos im Start), dazu die Kopfzeile „Ändert ADR 0027“ (Glocke der Suche als Vorlade-Anlass);
- ADR 0027 (Vorladen): Anlässe sind nur noch der Tab „Anbieter“ und das Anbieter-Sheet (Review M3);
- ADR 0014:
  - Zuschnitt nach Anbieter-Abos und Alter;
  - je Push lädt nur `site.json`. Der Anlass „beim Push“ für `wegzeit.json`, mit dem ADR 0014 ADR 0011, Punkt 6, geändert hatte, entfällt; ADR 0042 nennt ADR 0011, Punkt 6, ausdrücklich (Review M3);
  - gespiegelt werden Geburtsdatum und Anbieter-Abos, der Startpunkt liegt nicht in der IndexedDB;
- `docs/architecture.md`: „Eine Kategorie je Angebot“, App-Extras/Push-Teil (`preloadBell`), Onboarding-Chunk, Push im Service Worker, Such-Abo-Absatz, die Invarianten „Privatsphäre“ (samt Liste der `localStorage`-Schlüssel ohne `zwergenplan.such-abos`), „Startpunkt“ und den Satz „Beim Push lädt der Service Worker `site.json` und `wegzeit.json`“ (Review M3);
- den Datenschutztext in `imprintPage()` (`scripts/lib/share-pages.ts`): „Abos (Anbieter)“; das Gerät rechnet ohne Startpunkt.
- ADR 0014 und 0037 bekommen je eine Kopfzeile „Teilweise ersetzt durch ADR 0042“.

### Nicht-Ziele

- Kein Schalter „Meine Anbieter“ im Filter-Sheet, keine Speicherung über das Neuladen hinaus. Beides kommt nach `docs/ideas.md`.
- Ein Tipp auf den Push öffnet weiter „Neu eingestellt“ ohne den Chip (`docs/ideas.md`: „Push-Ziel mit Meine Anbieter“).
- `docs/ideas.md`: „Such-Abos als Schnellwahl in der Liste“ und „Tageszeit in Such-Abos und Push“ fallen weg. „Wochen-Nachricht nur bei Treffern (Stufe 3)“ nennt Anbieter-Abos statt Such-Abos und Startpunkt.

### Tests

- **Unit**
  - `news.test.ts`: Mit Abo zählen nur Angebote abonnierter Anbieter (das Alter filtert weiter). Der Titel lautet „von deinen Anbietern“, die Wochenzahl zählt nur Anbieter-Angebote. Ohne Abo ändert sich nichts. Die Such-Fälle entfallen.
  - `push-tailor.test.ts`: Geholt wird nur `site.json`, kein `wegzeit.json`. `providers` wird gelesen, ein kaputter Wert ignoriert.
  - `push.test.ts`: Gespiegelt werden nur `birthDate` und `providers`. Das erste Spiegeln löscht `searches` und `origin`.
  - `filter.test.ts`: `fromProviders`. `use-offer-views.test.ts`: `ownProviders` schränkt `visible` ein, `providerVisible` nicht.
  - `format.test.ts`: `aboToast` ohne Such-Fälle. `preferences`: `forgetSearchAbos` entfernt den Schlüssel.
- **E2E**
  - `app.spec.ts`:
    - Ohne Abo fehlt der Chip.
    - Mit vorbelegtem `zwergenplan.anbieter-merkliste` ist er da. Gedrückt zeigt er in Liste und Karte nur Angebote dieses Anbieters. „Filter zurücksetzen“ schaltet ihn aus, und die URL ändert sich nicht.
    - `zwergenplan.such-abos` ist nach dem Start gelöscht. Die Tests zur Such-Glocke entfallen.
  - `push.spec.ts`:
    - Fälle mit Such-Abos und `origin` entfallen oder werden auf `providers` umgestellt.
    - Liegt ein Anbieter-Abo im Speicher, lautet der Titel der Zustellung „… von deinen Anbietern“.
    - Nach dem Spiegeln mit Push an liegt kein `origin` mehr im Speicher.
    - **Request-Invariante** (Review M4): `SAME_REQUESTS` wird `["/data/site.json"]`. Je Push kommt genau ein Request auf `site.json` und keiner auf `wegzeit.json`, gleich mit und ohne Startpunkt und Abo.
  - Chip und Requests (Review M2): Ein Tipp auf „Meine Anbieter“ erzeugt keinen Request. Auf der Karte bleibt `tileLog` mit und ohne Chip gleich.
  - `mobile-ux.spec.ts`: Kind-Sheet ohne Such-Abo. Neue Ansicht `meine-anbieter`: Chipzeile mit gedrücktem Chip, 320 px, 200 % Text.
  - `pwa.spec.ts` und `scripts/screenshots.ts`: Was dort die Such-Glocke nutzte, nimmt eine Anbieter-Glocke oder entfällt.

### Dateien

- Neu: `docs/adr/0042-push-nur-anbieter.md`
- Entfällt: `src/domain/searches.ts` (+ Test), `src/data/searches-store.ts`, `src/domain/stored-origin.ts` (+ Test, falls vorhanden)
- Domäne: `src/domain/news.ts`, `src/domain/filter.ts` (je + Test)
- Daten: `src/data/push.ts` (+ Test), `src/data/device-store.ts`, `src/data/preferences.ts`
- SW: `src/sw/push-tailor.ts` (+ Test), `src/sw/sw.ts`, ggf. `src/sw/push-decision.test.ts`
- UI: `src/ui/App.tsx`, `src/ui/Chrome.tsx`, `src/ui/use-offer-views.ts` (+ Test), `src/ui/use-app-state.ts` (+ Test), `src/ui/format.ts` (+ Test), `src/ui/KidSheet.tsx`, `src/ui/Overlays.tsx`, `src/ui/app-extras/use-push-switch.ts`, ggf. `src/ui/styles/chrome.css`
- Regeln und Build: `.dependency-cruiser.cjs`, `vite.config.ts` (Kommentar), `scripts/lib/e2e-map.ts`, `scripts/screenshots.ts`
- Doku: `docs/adr/0014-web-push.md`, `docs/adr/0027-app-chunk-beim-erststart-vorladen.md`, `docs/adr/0037-abos-mit-glocke.md`, `docs/architecture.md`, `scripts/lib/share-pages.ts`, `docs/ideas.md`, `docs/plans/0039-region-duesseldorf.md` (Hinweis)
- Tests, die mitziehen: `src/domain/route.test.ts` (importiert `searchOf`, Review m7)
- E2E: `e2e/app.spec.ts`, `e2e/push.spec.ts`, `e2e/mobile-ux.spec.ts`, ggf. `e2e/pwa.spec.ts`

### Schritte

Jeder Schritt endet mit `pnpm verify` grün.

- **A1 – Domäne, SW und Spiegel, test-first** (Review m1: in einem Schritt, sonst kompiliert `push-tailor.ts` nicht): `weeklyText` (N2), `fromProviders` (N1), N3, N4. `pnpm size` misst das SW-Budget, es sinkt.
- **A2 – Rückbau Such-Abos**: N5 mit Regeln, `e2e-map` und Screenshots. Danach `pnpm e2e:local --affected` (im Hintergrund, Review m2).
- **A3 – Chip**: N1 in `App`, `QuickFilters` und `useOfferViews`. Danach `pnpm e2e:local --affected` (im Hintergrund).
- **A4 – Doku**: N6, `ideas.md`, Hinweis in Plan 0039.
- **A5 – Prüfen**: `pnpm e2e:local --affected --smoke` (Datenschutzseite), `/arch-review` (mehr als 200 Zeilen), `/browser-review` lokal:
  - Chipzeile mit und ohne Abo, gedrückter Chip in Liste und Karte, auch bei 360 px; Leerzustand; Kind-Sheet ohne Such-Abos;
  - „Zurücksetzen“ im Filter-Sheet schaltet auch den Chip aus, den das Sheet nicht zeigt. Die Zahl dort zählt ihn mit. Das ist gewollt wie in Plan 0058, die Prüfung bewertet, ob es verständlich ist (Review m9);
  - hell und dunkel, pixel-7 und iphone-15, 320 px, Querformat, 200 % Text, reduzierte Bewegung (Review m3).
- **A6 – Ausliefern**: Branch `anbieter-filter` pushen, CI grün, Fast-Forward nach `main`, CI auf `main` grün, `meta.json` prüfen, `/browser-review live`.

### Review Nachtrag A (2026-10-31) – Verdict: Freigabe mit Änderungen → eingearbeitet

Übernommen:
- **M1**: Die Altlast `origin`/`searches` löscht auch der Service Worker in `tailorPush`, siehe N3.
- **M2**: Der Chip filtert `filtered` vor `ageVisibility`, `upcoming`/`cameraOffers` bleiben unberührt (N1). Dazu ein Varianten-Test und ein E2E, dass keine Requests und gleiche Kacheln entstehen.
- **M3**: N6 nennt ADR 0027, ADR 0011, Punkt 6, und die übrigen Stellen in `architecture.md` (Invariante „Startpunkt“, Push-Requests, `localStorage`-Schlüssel).
- **M4**: Neuer E2E-Test: `SAME_REQUESTS` ist nur noch `site.json`.
- **m1**: A1 und A2 sind zu einem Schritt zusammengelegt.
- **m2**: E2E in den UI-Schritten.
- **m3**: Die Liste des Browser-Reviews ist vollständig.
- **m4**: Der Chip wird beim letzten beendeten Abo zurückgesetzt.
- **m5**: `providerVisible` ist außerhalb des Tabs „Anbieter“ ohne Chip.
- **m6**: Hinweis in Plan 0039.
- **m7**: `route.test.ts` steht in „Dateien“.
- **m8**: `try`/`catch` und ein Eintrag in `ideas.md` zum Entfernen der Altlast.
- **m9**: eine Prüfzeile im Browser-Review.

Abgelehnt: keins. Kein Blocker offen.

