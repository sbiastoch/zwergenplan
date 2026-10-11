# Plan 0034 – Onboarding für Bestandsnutzer, App-Schritt je Plattform

Status: Entwurf
Datum: 2026-10-11
Bezug:
- Plan 0033 (`docs/plans/archiv/0033-onboarding.md`, live seit ecfccfb): E1 (Schritte und Reihenfolge), E2 (Gate, Flag, Privatsphäre), E8 (Schritt „App“), E10 (Texte), E15 (E2E-Basis), Test 7, Test 10
- ADR 0027 (App-Chunk beim Erststart vorladen), ADR 0014 (Push, im Safari-Tab kein Push), ADR 0017 (Startpunkt gespeichert), ADR 0012 (Startbudget, Delta-Tabelle)

## Anlass

Der Nutzer am 2026-10-11, wörtlich:

> „Stelle den Schritt mit der App-Installation in den Push-Nachrichten ganz an den Schluss und zeige den Wizard auch bei unseren aktuellen paar Nutzern, die wir schon haben.“

Nachgeschärft, nachdem die Folge auf dem iPhone (eigener Speicher der installierten App) besprochen war:

> „Ach so, nee, dann zeige den Schritt bei Apple ganz am Anfang an.“

## Ziel

1. **Reihenfolge**: Im Safari-Tab des iPhones (`install === "ios"`) steht der Schritt „App“ **ganz am Anfang**: App → Stadt → Alter → Weg. Überall sonst (Android, Desktop, installierte iPhone-App) bleibt er **zuletzt**: Stadt → Alter → Weg → App. Das ist heute schon so; „ganz an den Schluss“ ist damit außerhalb von iOS erfüllt.
2. **Bestandsnutzer** sehen das Onboarding beim nächsten Start einmal, auch wenn sie schon Angaben gespeichert haben. Ihre gespeicherten Werte (Geburtsdatum, Startpunkt) stehen im Flow vorbelegt.
3. Wer seit ecfccfb das Flag **still** bekommen hat (Gate „still-erledigt“), sieht das Onboarding trotzdem: Das Flag wird versioniert, erledigt ist nur der Wert `"2"`.

## Nicht-Ziele

- Angaben zwischen Safari-Tab und installierter iPhone-App übertragen (getrennte Speicher, Plattformgrenze). Dafür steht als Idee in `docs/ideas.md` der **Setup-Link für iOS**:
  - Die Angaben reisen per Fragment (`#setup=…`, geht nie an den Server) in der Startadresse der Home-Bildschirm-App, ggf. mit vor dem Hinzufügen dynamisch umgeschriebener Manifest-`start_url`.
  - Offen ist, ob iOS die aktuelle URL oder die Manifest-`start_url` übernimmt und ob ein umgeschriebenes Manifest greift. Das prüft erst eine Testseite auf einem echten iPhone, in der CI lässt es sich nicht nachstellen.
  - Ein Abgleich über einen Server ist verworfen (Privatsphäre).
- Neue Schritte, neue Eingaben, neue Gestaltung, neue Illustration. Der App-Schritt als erster Schritt nutzt die bestehende App-Bühne.
- Ein allgemeiner Mechanismus „Onboarding nach großen Änderungen erneut zeigen“ über die Konstante hinaus. Die Konstante `ONBOARDING_VERSION` ist dieser Mechanismus; eine weitere Erhöhung ist eine Einzeiländerung mit eigenem Anlass.
- Reichweiten-Grenze („Höchstens unterwegs“) vorbelegen: Sie lebt nur in der URL (`wegzeit=`), nicht im Speicher. Im Onboarding steht wie heute der Chip „Egal“ gewählt, wenn die URL keine Grenze trägt.

## Ausgangslage

- **Reihenfolge**: `src/domain/onboarding.ts`, `onboardingSteps(install, push)`: ohne App-Teile `["stadt", "alter", "weg"]`, bei `install === "ios"` `["stadt", "app", "alter", "weg"]`, sonst `["stadt", "alter", "weg", "app"]`. Einmal beim Start des Flows festgelegt (`src/ui/onboarding/OnboardingFlow.tsx:36`). Bei `ios` liefert `appStepParts` immer `{ install: "ios", push: "nur-in-app" }`, der Schritt entfällt dort also nie. In der installierten iPhone-App ist `install === "app"`: kein Installationsteil, Push nach Fähigkeit, Schritt „App“ zuletzt oder gar nicht.
- **Texte**: `stepText(step, ctx)` (`onboarding.ts`) kennt die Position nicht. Kicker „Willkommen“ und der Lead mit Zahlen (`welcomeStats`) gehören zu „stadt“, der App-Schritt hat die Kicker „Immer griffbereit“ (mit Installationsteil) bzw. „Samstags-Nachricht“. `primaryLabel(index, …)`: Index 0 „Los geht’s“, letzter Index Abschluss-Beschriftung (`finishLabel`), sonst „Weiter“. „Später“ fehlt auf Schritt 1 (Plan 0033, Test 1). Der Aufruf steht in `OnboardingFlow.tsx:57`.
- **iOS-Hinweis**: `APP_STEP_TEXTS.iosNote` (`src/ui/app-extras/push-texts.ts:57–58`): „Auf dem iPhone kommt die Samstags-Nachricht nur in der installierten App. Darum frage ich das hier als Erstes. Die App hat einen eigenen Speicher und fragt dort noch einmal nach.“ Mit dem App-Schritt an Position 1 stimmt „als Erstes“ jetzt wörtlich.
- **Gate**: `src/domain/onboarding-gate.ts`, `onboardingGate({ storage, done, stored, deepLink })` → `"zeigen" | "still-erledigt" | "nichts"`. Test: `src/domain/onboarding-gate.test.ts`.
- **Speicher** (`src/data/preferences.ts`):
  - `KEYS.onboarding = "zwergenplan.einfuehrung"` (`:15`).
  - `loadOnboardingDone()` (`:142`): jeder vorhandene Wert zählt. `saveOnboardingDone()` (`:146`) schreibt `"1"`.
  - `hasStoredData()` (`:154`): irgendein Schlüssel außer dem Flag, dazu die Such-Abos.
  - `SEARCHES_KEY` (`:18–22`): nur wegen `hasStoredData` aus `searches-store.ts` hierher gezogen (Kommentar dort `:1–7`).
  - `storageUsable()` (`:159`): Schreibprobe `zwergenplan.probe`.
  - Tests: `src/data/preferences.test.ts:183–262`.
- **Start**: `src/ui/App.tsx:99–118`. Der `useState`-Initializer ruft `onboardingGate`. Bei „nichts“ gilt `"aus"`, sonst `preloadOnboarding()`. Bei „zeigen“ gilt `"auto"`, bei „still-erledigt“ `saveOnboardingDone()` und `"aus"`. Das Ende (`App.tsx:343`) setzt das Flag außer bei „Später“.
- **Folge seit ecfccfb**: Alle Bestandsnutzer mit Angaben, die die App seit dem Deploy geöffnet haben, tragen `zwergenplan.einfuehrung = "1"`, ohne das Onboarding gesehen zu haben. Ebenso `"1"` tragen die wenigen, die es seither wirklich durchlaufen oder übersprungen haben. Beide Gruppen lassen sich nicht unterscheiden.
- **Vorbelegung, geprüft**:
  - Geburtsdatum: `OnboardingFlow.tsx:44` `useBirthDateInput(props.birthDate, …)`, also aus dem gespeicherten Wert. Belegt durch Plan 0033, Test 11 („20.04.2026“, Hinweis „5 Monate!“).
  - Startpunkt: `WayStep` (`src/ui/onboarding/steps.tsx:107–140`) liest `originApi.origin` aus dem App-Zustand. Ein gespeicherter Stadtteil steht im `<select>`, ein gespeicherter Standort zeigt „Gefunden“. Mit gespeichertem Startpunkt lädt die Wegzeit schon beim Start (ADR 0017), die Chips sind also früh frei.
  - Merkliste, Darstellung, Such-Abos: kommen im Onboarding nicht vor und bleiben unberührt.
  - Kein Code nötig, nur ein E2E-Beleg (Test 10b).
- **E2E**:
  - `e2e/fixtures.ts:56–68`: `skipOnboarding` schreibt `"1"`, nur wenn das Flag fehlt. Die Auto-Fixture `onboardingGate` (`:119–129`) ruft es bei `onboarding: "erledigt"`.
  - `e2e/onboarding.spec.ts`:
    - `FLAG` (`:29`).
    - Test 7 (`:182–202`, iPhone, App an Position 2).
    - Test 10 (`:259–325`): „mit Merkliste kein Onboarding, Flag still gesetzt“, „Geburtsdatum gespeichert: kein Onboarding“, Deep-Link.
    - Test 11 erwartet Flag `"1"`.
    - Test 2 (`:90–103`) setzt Stadt als Schritt 1 voraus und läuft in allen Projekten, auch `iphone-15`.
  - `e2e/onboarding-steps.ts:22–27`: `KICKER.stadt = "Willkommen"`.
  - `e2e/startpunkt.spec.ts:104–110`: `storedValues` filtert den Schlüssel.
  - Regel `e2e-black-box` (`.dependency-cruiser.cjs:271–276`): `e2e/` importiert nichts aus `src/`.
  - Smoke (`e2e/smoke.spec.ts:126–141`) läuft im Projekt `smoke-echte-daten` ohne iOS-User-Agent. Stadt bleibt dort Schritt 1.
- **Screenshots**: `scripts/screenshots.ts:200–204` schreibt `"1"` für alle Ansichten außer `onboarding`. Regel `scripts-not-ui`: `scripts/` importiert nichts aus `src/data/`.
- **Doku mit veraltetem Stand**:
  - `docs/architecture.md:101`, `:104`, `:132` (Gate „still-erledigt“, `hasStoredData`, `SEARCHES_KEY`, Flag-Wert `"1"`, Probe „ohne Onboarding-Flag“).
  - ADR 0027, Entscheidung 1 und Alternativen („still-erledigt“, iPhone „Position 2“).
  - ADR 0012, Delta-Zeile Plan 0033 (nennt `hasStoredData`; bleibt als Historie).
  - `docs/ideas.md`: Idee „Onboarding erneut für alle“, unter Plan 0033 die iPhone-Prüfung („Stadt → App → Alter → Weg“) und „Stadtwahl speichern und Onboarding-Version stehen oben“.

## Entscheidungen

### E1 – Reihenfolge je Plattform (`src/domain/onboarding.ts`)

```ts
// ohne App-Teile: ["stadt", "alter", "weg"]
// install === "ios" (Safari-Tab):  ["app", "stadt", "alter", "weg"]
// sonst:                           ["stadt", "alter", "weg", "app"]
```

- Grund für iOS zuerst: Die installierte App hat einen eigenen Speicher. Was im Safari-Tab eingetragen wird, fehlt dort. Wer zuerst installiert und die App öffnet, gibt Alter und Weg gleich dort ein. In der App läuft das Onboarding dann erneut (eigener Speicher, kein Flag), mit `install === "app"`, also in der Reihenfolge Stadt → Alter → Weg → App, mit Schalter statt Anleitung.
- Wer im Safari-Tab nicht installiert, tippt „Los geht’s“ und geht wie bisher durch Stadt, Alter und Weg. Seine Angaben bleiben im Tab.
- Doku-Kommentar von `onboardingSteps` nachziehen (iOS: „zuerst, weil die installierte App einen eigenen Speicher hat“).

### E2 – Texte, wenn „App“ der erste Schritt ist

Minimal. Nur der Kicker hängt an der Position, Überschriften, Leads und Knöpfe bleiben.

- `stepText(step, ctx)` bekommt `ctx.first: boolean`, gesetzt in `OnboardingFlow.tsx:57` als `index === 0`.
  - „app“ mit `first`: Kicker **„Willkommen“** statt „Immer griffbereit“. Überschrift „Ein Tipp, und ich bin da“ und Lead („Auf dem Startbildschirm wie eine App. Und samstags …“) bleiben. Das *Warum zuerst* erklärt der iOS-Hinweis darunter schon: „… Darum frage ich das hier als Erstes. Die App hat einen eigenen Speicher und fragt dort noch einmal nach.“ Der stimmt mit dieser Reihenfolge wieder wörtlich und bleibt unverändert.
  - „stadt“ ohne `first`: Kicker **„Eure Stadt“** (wie `ONBOARDING_TEXTS.cityLabel`) statt „Willkommen“. „Willkommen“ stünde sonst zweimal hintereinander. Überschrift „Alles für Kinder unter 3 an einem Ort“ und der Lead mit Zahlen bleiben. So sieht auch, wer im Tab weitermacht, die Willkommenszahlen.
  - Alle anderen Fälle sind unverändert. Auf Android und Desktop ändert sich kein Text.
- Knöpfe:
  - `primaryLabel` bleibt. Schritt 1 heißt „Los geht’s“, auch auf dem App-Schritt. Er führt im Tab weiter zu Stadt. Das passt, weil Installieren über das Teilen-Menü geht und keinen eigenen Knopf hat.
  - „Später“ fehlt auf Schritt 1 wie bisher, „Überspringen“ steht oben.
- `e2e/onboarding-steps.ts`:
  - `KICKER.stadt` wird `/^(Willkommen|Eure Stadt)$/`. Weil auf iOS auch der App-Schritt „Willkommen“ trägt, hält `goTo(page, "stadt")` nur, wenn zusätzlich die Gruppe „Stadt“ sichtbar ist.
  - `KICKER.app` bleibt. `goTo(page, "app")` braucht auf iOS niemand (Schritt 1). Test 7 prüft dort `expectStep` und den Kicker direkt.

### E3 – Gate ohne „still-erledigt“ (`src/domain/onboarding-gate.ts`)

```ts
export type OnboardingGate = "zeigen" | "nichts";
export function onboardingGate(g: { storage: boolean; done: boolean; deepLink: boolean }): OnboardingGate;
// !storage || done || deepLink → "nichts"; sonst "zeigen"
```

- `stored` entfällt. Ob etwas gespeichert ist, spielt für das Gate keine Rolle mehr.
- `App.tsx`: Der Initializer wird `if (gate === "nichts") return "aus"; preloadOnboarding(); return "auto";`. Der Zweig mit dem stillen `saveOnboardingDone()` und sein Kommentar entfallen.
- Deep-Link (`?angebot=`, `?anbieter=`) bleibt „nichts“: zuerst der Inhalt, kein Flag. Beim nächsten normalen Start erscheint es, jetzt auch mit gespeicherten Angaben.
- Ohne nutzbaren Speicher bleibt es „nichts“ (sonst käme es bei jedem Besuch).

### E4 – Flag versioniert (`src/data/preferences.ts`)

- Eine Konstante im Modul, nicht exportiert: `const ONBOARDING_VERSION = "2";` mit Kommentar. `"1"` wurde ab ecfccfb auch still an Bestandsnutzer vergeben (Plan 0033, Gate „still-erledigt“). Erst `"2"` heißt „gesehen oder übersprungen“. Eine Erhöhung zeigt das Onboarding allen einmal erneut.
- `loadOnboardingDone()`: `read(KEYS.onboarding) === ONBOARDING_VERSION`. Exakte Gleichheit, kein Zahlenvergleich. Ein späterer Wert `"3"` gilt in diesem Code als nicht erledigt. Das betrifft nur ein Zurückrollen nach einer künftigen Erhöhung und ist dort erwünscht (lieber einmal zu oft als nie).
- `saveOnboardingDone()` schreibt `ONBOARDING_VERSION`.
- Folge, akzeptiert (Vorgabe des Nutzers): Wer seit ecfccfb das Onboarding wirklich durchlaufen oder übersprungen hat, sieht es einmal erneut. Das sind wenige.
- Der Wert `"1"` wird nicht aktiv gelöscht. Er wird beim nächsten Erledigen mit `"2"` überschrieben. Bis dahin läuft beim Start die Schreibprobe `storageUsable()` (wie bei jedem Start ohne gültiges Flag).
- `hasStoredData()` entfällt samt Tests, weil es keinen Aufrufer mehr hat (knip).
- `SEARCHES_KEY` wandert zurück nach `src/data/searches-store.ts` als modullokale `const KEY = "zwergenplan.such-abos"`. Der Grund für den Umzug (Plan 0033, Arch-Review m2: `hasStoredData` muss den Schlüssel kennen) fällt weg, und das Start-Bundle wird ein paar Bytes kleiner. Die Prüfung `expect(SEARCHES_KEY).toBe("zwergenplan.such-abos")` entfällt; den Schlüsselnamen prüft schon ein bestehender Test des Such-Abo-Speichers. In S2 per `grep -rn "such-abos" src` nachsehen. Fehlt der Test, kommt ein Ein-Zeilen-Test in einen bestehenden Test des Push-Teils, keine neue Datei.

### E5 – Privatsphäre bleibt gewahrt

- Vorladen von `assets/onboarding/` und `assets/app/` hängt weiter nur an Flag und Deep-Link (ADR 0027, Punkt 1). Mit E3 hängt jetzt auch das *Erscheinen* nicht mehr an gespeicherten Angaben. Die Invariante „Kein Request hängt davon ab, ob etwas gespeichert ist“ gilt damit noch schlichter.
- Neu ist ein einmaliger Effekt: Alle mit Flag `"1"` laden die beiden Chunks beim nächsten Start ein weiteres Mal. Das hängt am Flag-Wert, nicht an Angaben, und ist für alle mit `"1"` gleich.
- Mit gespeichertem Startpunkt lädt die Wegzeit beim Start wie bisher (ADR 0017). Der Schritt „Weg“ löst über `want()` keinen zweiten Request aus (höchstens einmal je Sitzung).

### E6 – E2E und Screenshots aus einer Quelle

- Neue Datei `e2e/onboarding-flag.ts` ohne Importe: `export const ONBOARDING_FLAG = { key: "zwergenplan.einfuehrung", value: "2" } as const;`. Begründung: Wegen `e2e-black-box` darf `e2e/` nichts aus `src/` importieren, wegen `scripts-not-ui` darf `scripts/` nichts aus `src/data/` importieren.
- Gekoppelt wird über einen Unit-Test in `src/data/preferences.test.ts`, der `../../e2e/onboarding-flag.ts` importiert. Tests dürfen das: `no-test-code-in-prod` gilt nur für Produktivcode, und keine Regel verbietet `src/**/*.test.ts` → `e2e/`. In S1 mit `pnpm arch` bestätigen. Der Test erwartet, dass nach `saveOnboardingDone()` der Speicher genau `[[ONBOARDING_FLAG.key, ONBOARDING_FLAG.value]]` enthält und dass `loadOnboardingDone()` für diesen Wert `true` liefert. Läuft eins auseinander, wird `pnpm verify` rot.
- Nutzer:
  - `e2e/fixtures.ts`, `skipOnboarding`: `context.addInitScript(({ key, value }) => { … }, ONBOARDING_FLAG)`, weiterhin nur bei fehlendem Flag (`=== null`). Ein vorhandenes `"1"` bleibt, damit Test 10c es setzen kann. Die Option heißt weiter `onboarding: "erledigt" | "neu"`.
  - `e2e/onboarding.spec.ts`: `FLAG` → `ONBOARDING_FLAG.key`, erwartete Werte `ONBOARDING_FLAG.value`.
  - `e2e/startpunkt.spec.ts:107`: `ONBOARDING_FLAG.key`.
  - `scripts/screenshots.ts:200–204`: importiert `../e2e/onboarding-flag.ts` (`scripts/` → `e2e/` ist erlaubt; in S3 mit `pnpm arch` bestätigen) und übergibt `ONBOARDING_FLAG` ans Init-Skript.
- `scripts/lib/e2e-map.ts`: `e2e/onboarding-flag.ts` ist ein E2E-Helfer. `node scripts/e2e-select.ts e2e/onboarding-flag.ts` zeigt, ob die Auswahl ihn schon erfasst (Helfer wählen nach Importgraph). Wenn nicht, bekommt er einen Eintrag wie die anderen Helfer.

### E7 – ADR: Nachtrag zu ADR 0027, kein neues ADR

Die Entscheidung von ADR 0027 (Vorladen bei Gate ≠ „nichts“, nur das Modul früher, ein Ladevorgang je Datei) bleibt. Es ändern sich zwei Annahmen aus dem Kontext: Den Gate-Zustand „still-erledigt“ gibt es nicht mehr, und auf dem iPhone steht „App“ jetzt an Position 1. Ein Nachtrag statt Umschreiben hält die ursprüngliche Begründung lesbar.

## Tests (test-first für Domäne und Daten)

**Unit**

- `src/domain/onboarding.test.ts`:
  - Erwartungen `ios/ja`, `ios/verweigert`, `ios/nein` (`:48–50`) → `app,stadt,alter,weg`. Alle anderen 15 Fälle unverändert.
  - `stepText`:
    - „app“ mit `first: true` und `{ install: "ios", push: "nur-in-app" }` → Kicker „Willkommen“, Überschrift und Lead wie ohne `first`.
    - „stadt“ mit `first: false` → Kicker „Eure Stadt“, Lead mit Zahlen.
    - „stadt“ mit `first: true` → „Willkommen“ (heutiges Verhalten).
    - „app“ ohne `first` → „Immer griffbereit“ bzw. „Samstags-Nachricht“ (heutiges Verhalten).
- `src/domain/onboarding-gate.test.ts`: Wahrheitstafel über `storage`, `done` und `deepLink` (8 Fälle), nur `"zeigen"` bei `storage && !done && !deepLink`. Der Fall `stored` entfällt; tsgo meldet jeden alten Aufruf mit `stored`.
- `src/data/preferences.test.ts`:
  - `saveOnboardingDone()` schreibt `[[ONBOARDING_FLAG.key, ONBOARDING_FLAG.value]]` (aus `e2e/onboarding-flag.ts`, E6).
  - `loadOnboardingDone()` ist `true` nur bei `"2"`, `false` bei fehlendem Wert, bei `"1"` (still gesetzt seit ecfccfb), bei `"3"` und bei `""`.
  - Tests zu `hasStoredData` und `SEARCHES_KEY` entfallen. Der Fall „Speicher wirft“ verliert die Zeile zu `hasStoredData`.

**E2E `e2e/onboarding.spec.ts`**

- **Test 7 (iPhone, neu gefasst)**: Reihenfolge App → Stadt → Alter → Weg.
  - Schritt 1 von 4: Kicker „Willkommen“, Überschrift „Ein Tipp, und ich bin da“, iOS-Anleitung, Hinweis mit „Darum frage ich das hier als Erstes.“, kein Schalter, Knopf „Los geht’s“, kein „Später“.
  - Schritt 2: Kicker „Eure Stadt“, Lead mit Zahlen.
  - Schritt 3 „Passt zum Alter“.
  - Schritt 4 „Gut erreichbar“ mit Abschluss-Beschriftung (`/^(Zeig mir|Zur Liste)/`).
- **Test 1**: unverändert (Android). Zusätzlich: Kicker von Schritt 1 ist „Willkommen“, der App-Schritt zuletzt „Immer griffbereit“.
- **Test 2**: Statt Schritt 1 vorauszusetzen, `goTo(page, "stadt")`. So läuft er auch auf `iphone-15` (dort Schritt 2).
- **Test 10 (Bestandsnutzer und Privatsphäre, neu gefasst)**:
  - **10a** „erster Start mit und ohne Merkliste lädt dieselben Chunks“: Ohne Angaben erscheint das Onboarding. Im eigenen Kontext mit Merkliste **erscheint es ebenfalls** (statt „kein Onboarding, Flag still gesetzt“). Die Chunk-Listen sind gleich, der Onboarding-Chunk kommt genau einmal. Nach „Überspringen“ ist das Flag `ONBOARDING_FLAG.value`. Der zweite Start bringt kein Onboarding, aus `assets/` kommt nur `app/pwa.js`.
  - **10b** „Bestandsnutzer mit Geburtsdatum und Stadtteil sieht es, vorbelegt“ (ersetzt „Geburtsdatum gespeichert: kein Onboarding“): Init-Skript mit `zwergenplan.geburtsdatum = "2026-04-20"` und `zwergenplan.entfernung-ab = "gostenhof"`. Das Onboarding erscheint. `goTo("alter")`: Feld „20.04.2026“, Hinweis beginnt mit „5 Monate!“. `goTo("weg")`: Stadtteil-Auswahl hat den Wert `gostenhof`. Je genau ein Request auf `wegzeit.json` und `linien.json` in der ganzen Sitzung. Nach „Überspringen“ sind Geburtsdatum und Stadtteil unverändert und das Flag `"2"`.
  - **10c** „altes Flag ‚1‘ → erscheint einmal“: Init-Skript setzt `ONBOARDING_FLAG.key = "1"` (die Option `"neu"` lässt es stehen). Das Onboarding erscheint. Nach „Überspringen“ ist das Flag `"2"`. Nach dem Neuladen kommt kein Onboarding und kein Request auf `assets/onboarding/`.
  - **Deep-Link** (bestehend): unverändert. Zusätzlich mit Flag `"1"`: kein Onboarding, Flag bleibt `"1"`.
- **Test 11**: erwartet `ONBOARDING_FLAG.value` statt `"1"`.
- Kommentar an `onboardingLoaded` („auch bei still erledigt“) streichen.
- **Unverändert grün**:
  - `e2e/onboarding-push.spec.ts` (Android, App zuletzt).
  - `e2e/push.spec.ts`, Test „Schalter im letzten Schritt“.
  - `e2e/smoke.spec.ts` (kein iOS-UA).
  - Test 13 (`eachStep` zählt Schritte, Mobile-UX-Gates jetzt auch für App als Schritt 1 auf `iphone-15`).
  - Test 14.

## Schritte

- **S0 Messen**: auf aktuellem `main` `pnpm build`, size-limit. `JS (initial)` notieren und unter „Umsetzung“ eintragen.
  - Fertig, wenn: Wert mit Commit-SHA im Plan steht.
- **S1 Domäne und Speicher (test-first)**: zuerst die Unit-Tests aus „Tests“ rot schreiben, dann:
  - `e2e/onboarding-flag.ts` anlegen (E6).
  - `onboardingSteps` und `stepText` (`first`) ändern (E1, E2).
  - `onboardingGate` ohne `stored` (E3).
  - `ONBOARDING_VERSION`, `loadOnboardingDone` und `saveOnboardingDone` ändern, `hasStoredData` entfernen, `SEARCHES_KEY` zurück nach `searches-store.ts` (E4).
  - Fertig, wenn: `pnpm verify` grün ist (tsgo, knip ohne Funde zu `hasStoredData`/`SEARCHES_KEY`, `pnpm arch` grün mit dem Test-Import aus `e2e/`).
- **S2 App und Flow**:
  - `App.tsx`: Initializer ohne Zweig „still-erledigt“, Kommentar ohne Review-H1-Satz zu „still-erledigt“.
  - `OnboardingFlow.tsx:57`: `first: index === 0` an `stepText`.
  - Kommentare in `onboarding-gate.ts`, `preferences.ts` (Kopf, `:18–22`) und `searches-store.ts` nachziehen.
  - Fertig, wenn: `pnpm verify` grün ist.
- **S3 E2E und Screenshots**:
  - `fixtures.ts`, `onboarding-steps.ts` (`KICKER.stadt`), `onboarding.spec.ts` (Tests 1, 2, 7, 10a–c, 11), `startpunkt.spec.ts` und `scripts/screenshots.ts` nach E6 und „Tests“ umstellen.
  - `node scripts/e2e-select.ts` prüfen; bei Bedarf `scripts/lib/e2e-map.ts` ergänzen.
  - Fertig, wenn:
    - `pnpm verify` grün ist.
    - `pnpm e2e:local --affected` (im Hintergrund) grün ist.
    - `pnpm e2e:local e2e/onboarding.spec.ts -- --project=iphone-15` grün ist, falls lokal WebKit geht (`libavif16`); sonst prüft es die CI auf dem Branch.
- **S4 Browser-Review lokal** (`/browser-review`, betroffene Ansichten):
  - Onboarding auf `iphone-15` (App als Schritt 1 mit Kicker „Willkommen“, Schritt 2 „Eure Stadt“) und auf `pixel-7` unverändert, je hell und dunkel, 320 px / 200 %.
  - Onboarding mit vorbelegtem Geburtsdatum und Stadtteil.
  - Liste nach „Überspringen“.
  - Fertig, wenn: jede Zeile der Checkliste beantwortet ist und Befunde behoben oder begründet sind.
- **S5 Doku** (siehe „Doku“), dann Commit auf dem Branch, Push, CI auf dem Branch grün, Fast-Forward nach `main`, CI auf `main` grün, `meta.json` zeigt den Commit, `/browser-review live` als Kurzcheck. Zum Schluss archivieren.
  - Fertig, wenn: `commit` in https://zwergenplan.app/data/meta.json `git rev-parse --short HEAD` ist und `check-docs` nach dem Archivieren grün ist.

`/arch-review`: nicht Pflicht (kein neues Modul im Sinne der Schichten, keine Abhängigkeit, kein Schema; unter 200 Zeilen erwartet). Liegt der Diff ohne Tests und Doku doch über 200 Zeilen, folgt es vor S5.

## Doku

- **ADR 0027**: Nachtrag „(2026-10-11): ohne ‚still-erledigt‘, Flag-Version 2, iPhone App zuerst (Plan 0034)“:
  - Das Gate kennt nur noch „zeigen“/„nichts“, Bestandsnutzer sehen das Onboarding. Damit hängt auch das Erscheinen nicht mehr an gespeicherten Angaben.
  - Erledigt ist nur `"2"`, alle mit `"1"` laden die Chunks beim nächsten Start einmal erneut.
  - Im Safari-Tab des iPhones steht „App“ an Position 1 (Grund: eigener Speicher der installierten App).
  - Der Kontextsatz „rückt ‚App‘ an Position 2“ und die Erwähnung von „still-erledigt“ in Entscheidung 1 gelten als überholt. Der Text oben bleibt stehen.
- **`docs/architecture.md`**:
  - `:101` Start: `onboardingGate` ohne „still-erledigt“; `hasStoredData` streichen.
  - `:104` Wann: „Vorladen bei jedem Gate ≠ ‚nichts‘“ ohne den Zusatz „auch bei still-erledigt …“, dazu „Bestandsnutzer sehen es einmal, gespeicherte Angaben stehen vorbelegt (Plan 0034)“.
  - `:132` Privatsphäre:
    - „die Such-Abos (`zwergenplan.such-abos`, `SEARCHES_KEY`)“ → Schlüssel in `src/data/searches-store.ts`.
    - Probe „nur beim Start ohne gültiges Onboarding-Flag“.
    - Flag „Wert `"2"` (`ONBOARDING_VERSION`; `"1"` aus Plan 0033 gilt nicht mehr als erledigt)“.
    - Test-Beleg „mit und ohne gespeicherte Merkliste“ bleibt.
- **ADR 0012**: Delta-Zeile „Plan 0034“ mit vorher/nachher `JS (initial)` (vermutlich leicht negativ). Die Zeile von Plan 0033 bleibt als Historie.
- **`docs/ideas.md`**:
  - „Onboarding erneut für alle nach großen Änderungen“ entfernen. Der Mechanismus ist mit Plan 0034 umgesetzt (`ONBOARDING_VERSION` erhöhen). Ein Satz unter „Offen aus abgeschlossenen Plänen“ bei Plan 0033 verweist darauf.
  - iPhone-Prüfung (Plan 0033): Reihenfolge im Safari-Tab „App → Stadt → Alter → Weg“. Die installierte App zeigt „Stadt → Alter → Weg → App“ mit Schalter.
  - Restpunkte Plan 0033: „Onboarding-Version“ aus „stehen oben“ streichen.
- **Plan 0033** (Archiv): keine Änderung; Verweis nur von hier.
- Keine README-Änderung (das Onboarding steht dort nicht im Detail; in S5 per `grep -n -i "einführung\|onboarding" README.md` bestätigen).

## Risiken

- **Wiederholung für die, die es schon gesehen haben**: Wer seit ecfccfb das Onboarding durchlaufen hat, sieht es noch einmal. Vom Nutzer akzeptiert (wenige Nutzer, ein Tag seit Deploy). Die Werte sind vorbelegt, „Überspringen“ steht oben.
- **iPhone: Angaben im Tab fehlen in der App**: Wer im Safari-Tab Alter und Weg einträgt und danach installiert, muss sie in der App erneut eingeben. Der App-Schritt als erster Schritt und der Hinweis „Die App hat einen eigenen Speicher und fragt dort noch einmal nach“ machen das sichtbar. Ganz verhindern lässt es sich nicht (Plattformgrenze, Nicht-Ziel). Am echten iPhone prüft es der Nutzer (`docs/ideas.md`, Plan 0033).
- **Bestandsnutzer auf dem iPhone im Tab**: Sie sehen zuerst die Installationsanleitung, obwohl ihre Angaben im Tab liegen. Installieren sie, sind die Angaben in der App leer. Das ist der Preis der Nutzerentscheidung „App zuerst“, im Plan bewusst festgehalten.
- **Kicker-Abhängigkeit in E2E**: `goTo` erkennt Schritte am Kicker. Auf iOS trägt der App-Schritt „Willkommen“, also könnte `goTo(page, "stadt")` fälschlich auf Schritt 1 halten. Gegenmittel (E2): Für „stadt“ prüft `goTo` zusätzlich die Gruppe „Stadt“ (`getByRole("group", { name: "Stadt" })`).
- **Service-Worker-Cache**: Ein Gerät mit altem App-Stand (vor Plan 0034) wertet `"2"` als erledigt (jeder Wert zählt). Ein Rückfall auf den alten Stand richtet also keinen Schaden an.
- **Lokal kein WebKit**: Test 7 und Test 2 auf `iphone-15` laufen dann nur in der CI. Der Branch-Lauf wählt `onboarding.spec.ts` über den Diff.

## Offene Punkte (Nutzerentscheid)

- **N1 Kicker**: Im Safari-Tab trägt der App-Schritt als Schritt 1 „Willkommen“ und der Stadt-Schritt danach „Eure Stadt“ (E2). Alternative: Der App-Schritt behält „Immer griffbereit“, dann fehlt auf dem iPhone ein Willkommen auf Schritt 1. Empfehlung: E2.
- **N2 Knopf auf Schritt 1 (iOS)**: Er bleibt „Los geht’s“ (führt im Tab weiter zu Stadt). Alternative „Ohne App weiter“ wäre deutlicher, ist aber ein neuer Text und eine Sonderregel in `primaryLabel`. Empfehlung: unverändert.
