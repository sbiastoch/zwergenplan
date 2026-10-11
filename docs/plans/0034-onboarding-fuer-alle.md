# Plan 0034 – Onboarding für Bestandsnutzer, App-Schritt je Plattform, Wischen

Status: freigegeben
Datum: 2026-10-11
Bezug:
- Plan 0033 (`docs/plans/archiv/0033-onboarding.md`, live seit ecfccfb): E1 (Schritte und Reihenfolge), E2 (Gate, Flag, Privatsphäre), E8 (Schritt „App“), E10 (Texte), E15 (E2E-Basis), Test 7, Test 10, Test 12
- ADR 0027 (App-Chunk beim Erststart vorladen), ADR 0013 (Punkt 5: `display-mode` nur in `src/data/pwa.ts`), ADR 0014 (Push, im Safari-Tab kein Push; Punkt 6 als Muster einer Ausnahme), ADR 0017 (Startpunkt gespeichert), ADR 0012 (Startbudget, Delta-Tabelle)

## Anlass

Der Nutzer am 2026-10-11, wörtlich:

> „Stelle den Schritt mit der App-Installation in den Push-Nachrichten ganz an den Schluss und zeige den Wizard auch bei unseren aktuellen paar Nutzern, die wir schon haben.“

Nachgeschärft, nachdem die Folge auf dem iPhone (eigener Speicher der installierten App) besprochen war:

> „Ach so, nee, dann zeige den Schritt bei Apple ganz am Anfang an.“

Nach dem Plan-Review, ebenfalls am 2026-10-11:

> „Und zwischen den Schritten im Wizard soll über Swipen gewechselt werden können.“

## Ziel

1. **Reihenfolge**: Im Safari-Tab des iPhones (`install === "ios"`) steht der Schritt „App“ **ganz am Anfang**: App → Stadt → Alter → Weg. Überall sonst (Android, Desktop, installierte iPhone-App) bleibt er **zuletzt**: Stadt → Alter → Weg → App. Das ist heute schon so; „ganz an den Schluss“ ist damit außerhalb von iOS erfüllt.
2. **Bestandsnutzer** sehen das Onboarding beim nächsten Start einmal, auch wenn sie schon Angaben gespeichert haben. Ihre gespeicherten Werte (Geburtsdatum, Startpunkt) stehen im Flow vorbelegt.
3. Wer seit ecfccfb das Flag **still** bekommen hat (Gate „still-erledigt“), sieht das Onboarding trotzdem: Das Flag wird versioniert, erledigt ist nur der Wert `"2"`.
4. **Wischen**: Zwischen den Schritten lässt sich per Wischgeste wechseln, nach links weiter, nach rechts zurück. Die Knöpfe bleiben.

## Nicht-Ziele

- Angaben zwischen Safari-Tab und installierter iPhone-App übertragen (getrennte Speicher, Plattformgrenze). Dafür steht als Idee in `docs/ideas.md` der **Setup-Link für iOS**:
  - Die Angaben reisen per Fragment (`#setup=…`, geht nie an den Server) in der Startadresse der Home-Bildschirm-App, ggf. mit vor dem Hinzufügen dynamisch umgeschriebener Manifest-`start_url`.
  - Offen ist, ob iOS die aktuelle URL oder die Manifest-`start_url` übernimmt und ob ein umgeschriebenes Manifest greift. Das prüft erst eine Testseite auf einem echten iPhone, in der CI lässt es sich nicht nachstellen.
  - Ein Abgleich über einen Server ist verworfen (Privatsphäre).
- Neue Schritte, neue Eingaben, neue Gestaltung, neue Illustration. Der App-Schritt als erster Schritt nutzt die bestehende App-Bühne.
- Ein eigener Knopf „Zurück“ neben den bestehenden Knöpfen. Zurück geht per Wischen und, ohne Wischen, per Tipp oder Tastatur auf die Fortschrittspunkte früherer Schritte (E11). Ein sichtbarer Zurück-Knopf wäre eine neue Gestaltung (`docs/ideas.md`, falls gewünscht).
- Die Bühne folgt dem Finger nicht (kein Mitziehen während der Geste). Erst nach erkannter Geste wechselt der Schritt.
- Ein allgemeiner Mechanismus „Onboarding nach großen Änderungen erneut zeigen“ über die Konstante hinaus. Die Konstante `ONBOARDING_VERSION` ist dieser Mechanismus; eine weitere Erhöhung ist eine Einzeiländerung mit eigenem Anlass.
- Reichweiten-Grenze („Höchstens unterwegs“) vorbelegen: Sie lebt nur in der URL (`wegzeit=`), nicht im Speicher. Im Onboarding steht wie heute der Chip „Egal“ gewählt, wenn die URL keine Grenze trägt.

## Ausgangslage

- **Reihenfolge**: `src/domain/onboarding.ts`, `onboardingSteps(install, push)`: ohne App-Teile `["stadt", "alter", "weg"]`, bei `install === "ios"` `["stadt", "app", "alter", "weg"]`, sonst `["stadt", "alter", "weg", "app"]`. Einmal beim Start des Flows festgelegt (`src/ui/onboarding/OnboardingFlow.tsx:36`). Bei `ios` liefert `appStepParts` immer `{ install: "ios", push: "nur-in-app" }`, der Schritt entfällt dort also nie. In der installierten iPhone-App ist `install === "app"`: kein Installationsteil, Push nach Fähigkeit, Schritt „App“ zuletzt oder gar nicht.
- **Plattform-Erkennung**: `install.state()` aus `src/data/pwa.ts` (Lazy-Chunk `assets/app/`): `standalone()` → `"app"`, dann installiert, dann Angebot, dann `isIos(env)` (`pwa.ts:240–241`, User-Agent `iPhone|iPad|iPod` oder `Macintosh` mit `maxTouchPoints > 1`) → `"ios"`. `standalone` liest `browserInstallEnv()` (`pwa.ts:293–297`, `display-mode: standalone` oder `navigator.standalone`). Im Start-Bundle gibt es diese Prüfung nicht; `pwa.ts` darf nur per `import()` geladen werden (`app-data-only-lazy`).
- **Ladebühne**: Der Lader `src/ui/Onboarding.tsx:59` zeigt bis Chunk, App-Teil und Daten da sind `.onb-pending`, fest in der Farbe der Stadt-Bühne: `src/ui/styles/dialog.css:53–59` `#ffd93b`, dunkel `:505–514` `color-mix(in srgb, #ffd93b 80%, #0e1620)`. Die Bühne im Chunk mischt zur Laufzeit `color-mix(in srgb, var(--k) var(--mix), #0e1620)` (`src/ui/onboarding/onboarding.css:43`), `--k` des App-Schritts ist `#b99cff` (`:29`), `--mix` dunkel 80 % (`:419`, `:427`). E2E: `e2e/onboarding.spec.ts:408–432` („leere Bühne in der Farbe der ersten Bühne“, dunkel und „dunkel per Darstellung“) vergleicht Lade- und erste Bühne und prüft, dass die Ladebühne nicht das ungemischte `255,217,59` trägt.
- **Texte**: `stepText(step, ctx)` (`onboarding.ts`) kennt die Position nicht. Kicker „Willkommen“ und der Lead mit Zahlen (`welcomeStats`) gehören zu „stadt“, der App-Schritt hat die Kicker „Immer griffbereit“ (mit Installationsteil) bzw. „Samstags-Nachricht“. `primaryLabel(index, …)`: Index 0 „Los geht’s“, letzter Index Abschluss-Beschriftung (`finishLabel`), sonst „Weiter“. „Später“ fehlt auf Schritt 1 (Plan 0033, Test 1). Der Aufruf steht in `OnboardingFlow.tsx:57`.
- **iOS-Hinweis**: `APP_STEP_TEXTS.iosNote` (`src/ui/app-extras/push-texts.ts:57–58`): „Auf dem iPhone kommt die Samstags-Nachricht nur in der installierten App. Darum frage ich das hier als Erstes. Die App hat einen eigenen Speicher und fragt dort noch einmal nach.“ „Fragt dort noch einmal nach“ passt nicht mehr: Wer auf Schritt 1 installiert, ist noch nie gefragt worden.
- **Navigation im Flow** (`OnboardingFlow.tsx:58–64`): `next()` hält auf „alter“ bei ungültigem Datum an und setzt den Fokus ins Feld, sonst `later()`; `later()` endet auf dem letzten Schritt mit `onEnd("fertig")`, sonst `setIndex(index + 1)`. Ein „Zurück“ gibt es nicht. Ein Effekt auf `index` (`:48–54`) fokussiert die Überschrift und scrollt den Dialog nach oben.
- **Push und Onboarding**: Der App-Schritt nutzt `usePushSwitch(push, { reconcile: false })` (`src/ui/app-extras/AppSection.tsx:207`): kein Abgleich, kein laufendes Spiegeln (`src/ui/app-extras/use-push-switch.ts:6–8`, `:55–58`). Gespiegelt wird nur im Kind-Sheet (`reconcile: true`). `push.mirror` (`src/data/push.ts:160–170`) schreibt nur in den Geräte-Speicher (IndexedDB) und nur, wenn `mirroring` gesetzt ist; das setzen `enable` und `reconcile` (`:219`, `:260`). `reconcile` kann `/abo` melden (Request), `mirror` nicht. Gespiegelt werden `birthDate`, `searches`, `origin` (`:115`); `mirrorData()` (`use-push-switch.ts:17–24`) liest sie aus dem Speicher.
- **Gate**: `src/domain/onboarding-gate.ts`, `onboardingGate({ storage, done, stored, deepLink })` → `"zeigen" | "still-erledigt" | "nichts"`. Test: `src/domain/onboarding-gate.test.ts`.
- **Speicher** (`src/data/preferences.ts`):
  - `KEYS.onboarding = "zwergenplan.einfuehrung"` (`:15`).
  - `loadOnboardingDone()` (`:142`): jeder vorhandene Wert zählt. `saveOnboardingDone()` (`:146`) schreibt `"1"`.
  - `hasStoredData()` (`:154`): irgendein Schlüssel außer dem Flag, dazu die Such-Abos.
  - `SEARCHES_KEY` (`:18–22`): nur wegen `hasStoredData` aus `searches-store.ts` hierher gezogen (Kommentar dort `:1–7`).
  - `storageUsable()` (`:159`): Schreibprobe `zwergenplan.probe`.
  - Tests: `src/data/preferences.test.ts:183–262`.
- **Start**: `src/ui/App.tsx:4` importiert `hasStoredData`, `:99–118` der `useState`-Initializer ruft `onboardingGate` mit `stored: hasStoredData()` (`:110`). Bei „nichts“ gilt `"aus"`, sonst `preloadOnboarding()`. Bei „zeigen“ gilt `"auto"`, bei „still-erledigt“ (`:116`) `saveOnboardingDone()` und `"aus"`. Das Ende (`App.tsx:343`) setzt das Flag außer bei „Später“.
- **Folge seit ecfccfb**: Alle Bestandsnutzer mit Angaben, die die App seit dem Deploy geöffnet haben, tragen `zwergenplan.einfuehrung = "1"`, ohne das Onboarding gesehen zu haben. Ebenso `"1"` tragen die wenigen, die es seither wirklich durchlaufen oder übersprungen haben. Beide Gruppen lassen sich nicht unterscheiden.
- **Vorbelegung, geprüft**:
  - Geburtsdatum: `OnboardingFlow.tsx:44` `useBirthDateInput(props.birthDate, …)`, also aus dem gespeicherten Wert. Belegt durch Plan 0033, Test 11 („20.04.2026“, Hinweis „5 Monate!“).
  - Startpunkt: `WayStep` (`src/ui/onboarding/steps.tsx:107–140`) liest `originApi.origin` aus dem App-Zustand. Ein gespeicherter Stadtteil steht im `<select>`, ein gespeicherter Standort zeigt „Gefunden“. Mit gespeichertem Startpunkt lädt die Wegzeit schon beim Start (ADR 0017), die Chips sind also früh frei.
  - Merkliste, Darstellung, Such-Abos: kommen im Onboarding nicht vor und bleiben unberührt.
  - Kein Code nötig, nur ein E2E-Beleg (Test 10b).
- **E2E**:
  - `e2e/fixtures.ts:56–68`: `skipOnboarding` schreibt `"1"`, nur wenn das Flag fehlt. Die Auto-Fixture `onboardingGate` (`:119–129`) ruft es bei `onboarding: "erledigt"`.
  - `e2e/onboarding.spec.ts`:
    - `FLAG` (`:29`), `flag(page)` (`:51`).
    - Erwartung `"1"` in Test 8 (`:222`), Test 9 (`:237`, `:252`), Test 10 (`:284`, `:311`), Test 12 „Chunk nicht ladbar“ (`:363`), Test 12 „App-Teil nicht ladbar“ (`:470`), Test 11 (`:494`).
    - Test 1 (`:72–88`) prüft schon die Kicker-Folge `["Willkommen", …, "Immer griffbereit"]`.
    - Test 7 (`:182–202`, iPhone, App an Position 2).
    - Test 10 (`:259–325`): „mit Merkliste kein Onboarding, Flag still gesetzt“, „Geburtsdatum gespeichert: kein Onboarding“, Deep-Link.
    - Test 2 (`:90–103`) setzt Stadt als Schritt 1 voraus und läuft in allen Projekten, auch `iphone-15`.
    - Test 12 „leere Bühne in der Farbe der ersten Bühne“ (`:408–432`), siehe Ladebühne.
    - Test 13 (`:512–`): Kommentar `:517–518` begründet das Setzen von `data-theme` per `page.evaluate` damit, dass eine gespeicherte Darstellung aus dem Besuch einen Bestandsnutzer machte.
  - `e2e/onboarding-steps.ts:22–27`: `KICKER.stadt = "Willkommen"`.
  - `e2e/startpunkt.spec.ts:104–110`: `storedValues` filtert den Schlüssel.
  - `e2e/push.spec.ts:244`, `:311`, `:348`: lesen und schreiben `zwergenplan.such-abos` wörtlich, prüfen also den Schlüsselnamen des Such-Abo-Speichers. `readStore` (`:88`, `:110`) liest den Geräte-Speicher; `:300–308` zeigt den Init-Skript-Wächter per `sessionStorage`.
  - Regel `e2e-black-box` (`.dependency-cruiser.cjs:271–276`): `e2e/` importiert nichts aus `src/`.
  - Smoke (`e2e/smoke.spec.ts:126–141`) läuft im Projekt `smoke-echte-daten` ohne iOS-User-Agent. Stadt bleibt dort Schritt 1.
- **Budgets** (`.size-limit.json`): `JS (initial)` 100,349 von 101 kB (ADR 0012, Zeile Plan 0033 S5), `Onboarding JS (lazy)` 6,287 von 7,3 kB, `Onboarding CSS (lazy)` 1,981 von 2,5 kB, `CSS` 12,110 von 15 kB.
- **Screenshots**: `scripts/screenshots.ts:200–204` schreibt `"1"` für alle Ansichten außer `onboarding`. Regel `scripts-not-ui`: `scripts/` importiert nichts aus `src/data/`.
- **Doku mit veraltetem Stand**:
  - `docs/architecture.md:101`, `:104`, `:105`, `:132` (Gate „still-erledigt“, `hasStoredData`, `SEARCHES_KEY`, Flag-Wert `"1"`, E2E-Fixture ohne `e2e/onboarding-flag.ts`, Probe „ohne Onboarding-Flag“), dazu `:98` (Push-Teil: „Gespiegelt und abgeglichen wird, solange das Kind-Sheet offen ist“) und `:106` (Onboarding-Schalter „ohne laufendes Spiegeln“).
  - ADR 0027, Entscheidung 1 und Alternativen („still-erledigt“, iPhone „Position 2“).
  - ADR 0014, Nachtrag 2026-10-11 (Onboarding ohne Spiegeln).
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

Minimal. Kicker hängen an der Position, dazu ein Satz im iOS-Hinweis. Überschriften, Leads und Knöpfe bleiben.

- `stepText(step, ctx)` bekommt `ctx.first: boolean`, gesetzt in `OnboardingFlow.tsx:57` als `index === 0`.
  - „app“ mit `first`: Kicker **„Willkommen“** statt „Immer griffbereit“ (N1, entschieden). Überschrift „Ein Tipp, und ich bin da“ und Lead („Auf dem Startbildschirm wie eine App. Und samstags …“) bleiben.
  - „stadt“ ohne `first`: Kicker **„Schön, dass ihr da seid“** statt „Willkommen“. „Willkommen“ stünde sonst zweimal hintereinander, und „Eure Stadt“ wiederholte das Label der Gruppe direkt darunter (`ONBOARDING_TEXTS.cityLabel`). Überschrift „Alles für Kinder unter 3 an einem Ort“ und der Lead mit Zahlen bleiben. So sieht auch, wer im Tab weitermacht, die Willkommenszahlen.
  - Alle anderen Fälle sind unverändert. Auf Android und Desktop ändert sich kein Text.
- **iOS-Hinweis** (`APP_STEP_TEXTS.iosNote`, `push-texts.ts:58`), neu: „Auf dem iPhone kommt die Samstags-Nachricht nur in der installierten App. Darum frage ich das hier als Erstes. Die App hat einen eigenen Speicher, dort frage ich dann nach Alter und Startpunkt.“
  - Stimme geprüft: Die App spricht in der Ich-Form („Ein Tipp, und ich bin da“, „zeige ich dir“, „prüfe ich jeden einzelnen Termin“, `src/domain/onboarding.ts:118`, `:156`, `:184`), nie „wir“. Die Anrede wechselt zwischen „du“ (Alter) und „ihr“/„euch“ (Weg, Samstag, Stadt-Label); der neue Teilsatz braucht keine Anrede, der neue Kicker „Schön, dass ihr da seid“ passt zu „euch“/„Eure Stadt“.
  - Der Hinweis erscheint nur bei `install === "ios"`, also nur, wenn „App“ Schritt 1 ist. „Noch einmal“ entfällt, weil noch nichts gefragt wurde.
- Knöpfe:
  - `primaryLabel` bleibt. Schritt 1 heißt „Los geht’s“, auch auf dem App-Schritt (N2, entschieden). Er führt im Tab weiter zu Stadt. Das passt, weil Installieren über das Teilen-Menü geht und keinen eigenen Knopf hat.
  - „Später“ fehlt auf Schritt 1 wie bisher, „Überspringen“ steht oben.
- `e2e/onboarding-steps.ts`:
  - `KICKER.stadt` wird `/^(Willkommen|Schön, dass ihr da seid)$/`. Weil auf iOS auch der App-Schritt „Willkommen“ trägt, hält `goTo(page, "stadt")` nur, wenn zusätzlich die Gruppe „Stadt“ sichtbar ist (`getByRole("group", { name: "Stadt" })`).
  - `KICKER.app` bleibt. `goTo(page, "app")` braucht auf iOS niemand (Schritt 1). Test 7 prüft dort `expectStep` und den Kicker direkt.

### E3 – Gate ohne „still-erledigt“ (`src/domain/onboarding-gate.ts`)

```ts
export type OnboardingGate = "zeigen" | "nichts";
export function onboardingGate(g: { storage: boolean; done: boolean; deepLink: boolean }): OnboardingGate;
// !storage || done || deepLink → "nichts"; sonst "zeigen"
```

- `stored` entfällt. Ob etwas gespeichert ist, spielt für das Gate keine Rolle mehr.
- `App.tsx`: Import von `hasStoredData` (`:4`) und `stored:` (`:110`) entfallen. Der Initializer wird `if (gate === "nichts") return "aus"; preloadOnboarding(); return "auto";`. Der Zweig mit dem stillen `saveOnboardingDone()` (`:116`) und der Satz zu „still-erledigt“ im Kommentar entfallen. Weil `App.tsx` `hasStoredData` und `stored` nutzt, ändern sich Gate, Speicher und `App.tsx` in **einem** Schritt (S1), sonst bliebe tsgo rot.
- Deep-Link (`?angebot=`, `?anbieter=`) bleibt „nichts“: zuerst der Inhalt, kein Flag. Beim nächsten normalen Start erscheint es, jetzt auch mit gespeicherten Angaben.
- Ohne nutzbaren Speicher bleibt es „nichts“ (sonst käme es bei jedem Besuch).

### E4 – Flag versioniert (`src/data/preferences.ts`)

- Eine Konstante im Modul, nicht exportiert: `const ONBOARDING_VERSION = "2";` mit Kommentar. `"1"` wurde ab ecfccfb auch still an Bestandsnutzer vergeben (Plan 0033, Gate „still-erledigt“). Erst `"2"` heißt „gesehen oder übersprungen“. Eine Erhöhung zeigt das Onboarding allen einmal erneut.
- `loadOnboardingDone()`: `read(KEYS.onboarding) === ONBOARDING_VERSION`. Exakte Gleichheit, kein Zahlenvergleich. Ein späterer Wert `"3"` gilt in diesem Code als nicht erledigt. Das betrifft nur ein Zurückrollen nach einer künftigen Erhöhung und ist dort erwünscht (lieber einmal zu oft als nie).
- `saveOnboardingDone()` schreibt `ONBOARDING_VERSION`.
- Folge, akzeptiert (Vorgabe des Nutzers): Wer seit ecfccfb das Onboarding wirklich durchlaufen oder übersprungen hat, sieht es einmal erneut. Das sind wenige.
- Der Wert `"1"` wird nicht aktiv gelöscht. Er wird beim nächsten Erledigen mit `"2"` überschrieben. Bis dahin läuft beim Start die Schreibprobe `storageUsable()` (wie bei jedem Start ohne gültiges Flag).
- `hasStoredData()` entfällt samt Tests, weil es keinen Aufrufer mehr hat (knip).
- `SEARCHES_KEY` wandert zurück nach `src/data/searches-store.ts` als modullokale `const KEY = "zwergenplan.such-abos"`. Der Grund für den Umzug (Plan 0033, Arch-Review m2: `hasStoredData` muss den Schlüssel kennen) fällt weg, und das Start-Bundle wird ein paar Bytes kleiner. Die Prüfung `expect(SEARCHES_KEY).toBe("zwergenplan.such-abos")` entfällt ersatzlos: Den Schlüsselnamen belegen schon `e2e/push.spec.ts:244`, `:311` und `:348`, die `zwergenplan.such-abos` wörtlich lesen und schreiben.

### E5 – Privatsphäre bleibt gewahrt

- Vorladen von `assets/onboarding/` und `assets/app/` hängt weiter nur an Flag und Deep-Link (ADR 0027, Punkt 1). Mit E3 hängt jetzt auch das *Erscheinen* nicht mehr an gespeicherten Angaben. Die Invariante „Kein Request hängt davon ab, ob etwas gespeichert ist“ gilt damit noch schlichter.
- Neu ist ein einmaliger Effekt: Alle mit Flag `"1"` laden die beiden Chunks beim nächsten Start ein weiteres Mal. Das hängt am Flag-Wert, nicht an Angaben, und ist für alle mit `"1"` gleich.
- Mit gespeichertem Startpunkt lädt die Wegzeit beim Start wie bisher (ADR 0017). Der Schritt „Weg“ löst über `want()` keinen zweiten Request aus (höchstens einmal je Sitzung).
- Die Ladebühne (E8) hängt an User-Agent und Anzeigemodus, nicht an Gespeichertem, und löst keinen Request aus.
- Das Spiegeln am Ende (E9) liest lokal das Abo (`pushManager.getSubscription()`) und schreibt lokal in IndexedDB. Es entsteht kein Request, weder mit noch ohne Abo, weder mit noch ohne Angaben.

### E6 – E2E und Screenshots aus einer Quelle

- Neue Datei `e2e/onboarding-flag.ts` ohne Importe: `export const ONBOARDING_FLAG = { key: "zwergenplan.einfuehrung", value: "2" } as const;`. Begründung: Wegen `e2e-black-box` darf `e2e/` nichts aus `src/` importieren, wegen `scripts-not-ui` darf `scripts/` nichts aus `src/data/` importieren.
- Gekoppelt wird über einen Unit-Test in `src/data/preferences.test.ts`, der `../../e2e/onboarding-flag.ts` importiert. Tests dürfen das: `no-test-code-in-prod` gilt nur für Produktivcode, und keine Regel verbietet `src/**/*.test.ts` → `e2e/`. In S1 mit `pnpm arch` bestätigen. Der Test erwartet, dass nach `saveOnboardingDone()` der Speicher genau `[[ONBOARDING_FLAG.key, ONBOARDING_FLAG.value]]` enthält und dass `loadOnboardingDone()` für diesen Wert `true` liefert. Läuft eins auseinander, wird `pnpm verify` rot.
- Nutzer:
  - `e2e/fixtures.ts`, `skipOnboarding`: `context.addInitScript(({ key, value }) => { … }, ONBOARDING_FLAG)`, weiterhin nur bei fehlendem Flag (`=== null`). Ein vorhandenes `"1"` bleibt, damit Test 10c es setzen kann. Die Option heißt weiter `onboarding: "erledigt" | "neu"`.
  - `e2e/onboarding.spec.ts`: `FLAG` → `ONBOARDING_FLAG.key`. **Jede** Erwartung `"1"` am Flag wird `ONBOARDING_FLAG.value`: Tests 8, 9, 10, 11 und beide Tests 12 (Stellen unter „Ausgangslage“). Vollständig per `grep -rn '"1"' e2e/` und `grep -rn "einfuehrung" e2e/ scripts/`; übrig bleiben darf `"1"` nur dort, wo bewusst der alte Wert gesetzt wird (Test 10c, Deep-Link-Zusatz).
  - `e2e/startpunkt.spec.ts:107`: `ONBOARDING_FLAG.key`.
  - `scripts/screenshots.ts:200–204`: importiert `../e2e/onboarding-flag.ts` (`scripts/` → `e2e/` ist erlaubt; in S1 mit `pnpm arch` bestätigen) und übergibt `ONBOARDING_FLAG` ans Init-Skript.
- `scripts/lib/e2e-map.ts`: `e2e/onboarding-flag.ts` ist ein E2E-Helfer. `node scripts/e2e-select.ts e2e/onboarding-flag.ts` zeigt, ob die Auswahl ihn schon erfasst (Helfer wählen nach Importgraph). Wenn nicht, bekommt er einen Eintrag wie die anderen Helfer.

### E7 – ADR: Nachträge zu ADR 0027, ADR 0014 und ADR 0013, kein neues ADR

Die Entscheidung von ADR 0027 (Vorladen bei Gate ≠ „nichts“, nur das Modul früher, ein Ladevorgang je Datei) bleibt. Es ändern sich zwei Annahmen aus dem Kontext: Den Gate-Zustand „still-erledigt“ gibt es nicht mehr, und auf dem iPhone steht „App“ jetzt an Position 1. Ein Nachtrag statt Umschreiben hält die ursprüngliche Begründung lesbar. ADR 0014 bekommt einen Nachtrag zu E9 (einmal spiegeln am Ende des Onboardings, ohne Request), weil sein Nachtrag vom 2026-10-11 „im Onboarding kein Spiegeln“ festhält. ADR 0013 bekommt einen Nachtrag zu E8 (Review Runde 2, M1): Punkt 5 legt `display-mode` allein in `src/data/pwa.ts`; `src/data/platform.ts` liest ihn als **Ausnahme** nur lesend (`matchMedia("(display-mode: standalone)").matches`, `navigator.standalone`), ohne Listener, ohne `beforeinstallprompt`, ohne Registrierung. Muster ist ADR 0014, Punkt 6 (`push.ts` liest die Registrierung nur lesend). `docs/architecture.md:96` nennt die zweite Ausnahme.

### E8 – Ladebühne in der Farbe der ersten Bühne, auch auf dem iPhone

Ohne Änderung stünde auf dem iPhone im Safari-Tab beim Laden die gelbe Stadt-Bühne, danach die lila App-Bühne: ein Farbsprung genau beim ersten Eindruck, und Test 12 „leere Bühne in der Farbe der ersten Bühne“ wird auf `iphone-15` rot.

- **Eine Prüfung für beide**: Die iOS-Erkennung wandert aus `src/data/pwa.ts` in ein neues, kleines Start-Modul **`src/data/platform.ts`**:
  - `isIosDevice({ userAgent, maxTouchPoints })`: rein, der bisherige Ausdruck aus `pwa.ts:240–241`.
  - `standalone()`: der bisherige Ausdruck aus `pwa.ts:295–297` (`display-mode: standalone` oder `navigator.standalone === true`).
  - `iosTab()`: `!standalone() && isIosDevice(navigator)`. Das ist genau die Bedingung, unter der `install.state()` `"ios"` liefert (vor `"ios"` prüft `state()` nur noch „installiert“ und „Angebot“, beide kommen aus Chromium-Events und auf dem iPhone nie vor).
  - Das liest `display-mode` außerhalb von `pwa.ts`: Ausnahme von ADR 0013, Punkt 5, nur lesend und ohne Listener (Nachtrag ADR 0013, E7).
  - `src/data/pwa.ts` importiert `isIosDevice` und `standalone` von dort (Lazy-Chunk → Start-Modul ist erlaubt und kostet nichts, das Modul liegt ohnehin im Einstieg), der lokale `isIos` und der `standalone`-Ausdruck in `browserInstallEnv` entfallen. So gibt es die Prüfung einmal.
  - Warum nicht `src/domain/pwa.ts`: Das Modul wird zur Laufzeit nur aus `assets/app/` genutzt. Ein Import aus dem Start zöge es samt Installationstexten in den Einstieg. Warum nicht `src/data/pwa-start.ts`: `pwa.ts` müsste es statisch importieren, und `pwa-start.ts` lädt `pwa.ts` per `import()` (Zyklus).
- **Lader** `src/ui/Onboarding.tsx:59`: `className={iosTab() ? "onb-pending ios" : "onb-pending"}`. Synchron, ohne Zustand; der Wert ändert sich während des Ladens nicht.
- **Start-CSS** `src/ui/styles/dialog.css`:
  - `.onb-pending.ios { background-color: #b99cff; }` neben `:53–59` (Kommentar: „iPhone im Safari-Tab: App-Bühne zuerst, Plan 0034, E8“).
  - Dunkel in beiden Blöcken (`:505–507` und `:512–514`): `.onb-pending.ios { background-color: color-mix(in srgb, #b99cff 80%, #0e1620); }`, wie `--mix: 80%` der Bühne im Chunk.
- **Ausnahme, akzeptiert**: Lädt nur der App-Teil nicht, fehlt der Schritt „App“, und Schritt 1 ist die gelbe Stadt-Bühne nach einer lila Ladebühne. Das ist ein Fehlerfall (Plan 0033, Review H5); ein Farbsprung ist dort hinnehmbar.
- **Budget**: geschätzt +0,05 bis +0,10 kB `JS (initial)` (Modul `platform.ts`, Klassenwahl im Lader), dagegen −0,03 bis −0,06 kB durch E3/E4 (`hasStoredData`, `SEARCHES_KEY`, Zweig „still-erledigt“). In S1 und S3 messen, Delta in ADR 0012. Liegt `JS (initial)` danach über 101 kB, ist das ein Blocker: dann zuerst den Sparversuch „Klasse per Inline-Ausdruck ohne `isIosDevice`-Export“ messen und den Nutzer fragen, bevor das Budget steigt.

### E9 – Einmal spiegeln am Ende des Onboardings

Ein Bestandsnutzer mit eingeschalteter Samstags-Nachricht ändert im Onboarding Geburtsdatum oder Startpunkt. Der App-Schritt spiegelt nicht (`reconcile: false`), also schneidet der Service Worker die nächste Nachricht mit den alten Werten zu, bis das Kind-Sheet einmal offen war.

- **Push-API** (`src/data/push.ts`): neue Methode `mirrorIfSubscribed(data: MirrorData): Promise<void>`: `if (!env.hasPushManager) return; const sub = await this.subscription(); if (!sub) return; mirroring = true; await mirror(data);`. Die Vorprüfung `env.hasPushManager` (Review Runde 2, m5) hält Geräte ohne Push (iOS-Tab, alte Browser) fern von `getRegistration()`/`pushManager`. Anders als `reconcile` kein `register`, kein `forget`, kein `clearAll`: kein Request, und ohne Abo bleibt der Geräte-Speicher unberührt. `mirror` schreibt wie bisher nur Geändertes.
- **Aufruf**: `src/ui/app-extras/AppSection.tsx` exportiert `syncPushMirror(): Promise<void>` (`createPush().mirrorIfSubscribed(mirrorData())`; `mirrorData` wird dazu aus `use-push-switch.ts` exportiert). `AppStepModule` (`src/ui/onboarding-types.ts`) bekommt `syncPush: () => Promise<void>`, `loadAppStep()` (`src/ui/AppExtras.tsx:46`) reicht es durch.
- **Wann**: `OnboardingFlow` ruft beim Unmount einmal `app?.syncPush().catch(() => {})` (Cleanup eines `useEffect` mit leerer Abhängigkeitsliste, Ref auf `app`). Das deckt jedes Ende ab: „fertig“, „Überspringen“, Esc und Android-Zurück (`cancel` im Lader), auch den erneuten Aufruf über „Einführung ansehen“. „Später“ gibt es nur bei nicht ladbarem Chunk, dann lief der Flow nie und es gibt nichts zu spiegeln. Fehlt der App-Teil (`app === undefined`), passiert nichts.
- **Restrisiko** (Review Runde 2, m5): Läuft beim Ende noch eine Standortabfrage im Schritt „Weg“, spiegelt der Cleanup den Startpunkt vor ihrem Ergebnis. Der neue Standort landet dann erst beim nächsten Abgleich im Kind-Sheet im Geräte-Speicher. Akzeptiert: selten (Abfrage läuft, und gleichzeitig wird beendet), und der Zuschnitt fällt höchstens auf den alten Startpunkt zurück.
- Der Code liegt in den Lazy-Chunks (`assets/app/`, `assets/onboarding/`), kein Start-Byte. StrictMode ruft den Cleanup im Entwicklungsmodus einmal mehr; das schadet nicht (lokale Schreibvorgänge, nur Geändertes).
- **Privatsphäre** (E5): Kein Request. Ob gespiegelt wird, hängt am Abo, nicht an Angaben, und ist von außen nicht sichtbar. `docs/architecture.md:98` („Kein Push-Code läuft beim App-Start, mit einer Ausnahme …“) bekommt die zweite Ausnahme: „am Ende des Onboardings einmal `mirrorIfSubscribed` (lokal, ohne Request)“.

### E10 – Wischen zwischen den Schritten

Neue Anforderung des Nutzers (2026-10-11). Wischen kommt **zusätzlich** zu den Knöpfen; jede Aktion bleibt per Knopf oder Tastatur erreichbar (Barrierefreiheit).

- **Bedeutung**:
  - Nach links = **weiter**: ruft dieselbe Funktion wie der Hauptknopf (`next()`), also gleiche Prüfung. Bei ungültigem Geburtsdatum hält es an und setzt den Fokus ins Feld, sonst wechselt der Schritt und der Fokus geht wie beim Knopf auf die Überschrift (Effekt auf `index`).
  - Auf dem **letzten Schritt** löst Wischen nach links nichts aus. Der Abschluss („Zeig mir die N Angebote“) wechselt Tab und Ansicht und bleibt eine bewusste Tipp-Aktion; ein versehentliches Wischen soll das Onboarding nicht beenden.
  - Nach rechts = **zurück**: neue Funktion `back()` = `setIndex(index - 1)`. Eingaben bleiben (Geburtsdatum liegt im Flow, Stadtteil und Wegzeit im App-Zustand). Auf Schritt 1 nichts.
- **Reine Logik, test-first** in `src/domain/onboarding.ts` (kein neues Modul; liegt dort schon im Onboarding-Chunk, `onboarding-domain-only-lazy`):

  ```ts
  export type SwipeStep = "weiter" | "zurueck";
  export const SWIPE = { minDistance: 56, edge: 24, maxSlope: 0.5 } as const;
  /** Klassifiziert eine abgeschlossene Geste; `width` = Breite des Viewports in CSS-Pixeln */
  export function swipeStep(g: { x0: number; y0: number; x1: number; y1: number; width: number }): SwipeStep | undefined;
  // x0 < edge || x0 > width - edge          → undefined (Systemgeste: Android-Zurück, Safari-Zurück/Vor)
  // |dx| < minDistance                       → undefined
  // |dy| > |dx| * maxSlope (≈ 27°)           → undefined (eher vertikal)
  // dx < 0 → "weiter", dx > 0 → "zurueck"
  ```

- **UI** (`src/ui/onboarding/OnboardingFlow.tsx`), Pointer Events auf `.onb-flow`:
  - `onPointerDown`: nur `pointerType` `touch` oder `pen` (Maus nicht: Ziehen markiert dort Text, Desktop hat die Knöpfe), nur `isPrimary`. Start merken (`pointerId`, `clientX/Y`), außer die Geste beginnt in `input`, `select`, `textarea`, `[role="switch"]` oder in einem horizontal scrollbaren Element (Vorfahre bis `.onb-flow` mit `overflow-x` `auto`/`scroll` und `scrollWidth > clientWidth`).
  - `onPointerUp` mit gleicher `pointerId`: `swipeStep({ …, width: window.innerWidth })`, dann `next()` (außer letzter Schritt) bzw. `back()` (außer Schritt 1). `onPointerCancel` verwirft den Start (der Browser hat die Geste fürs vertikale Scrollen übernommen).
  - **Klick nach der Geste** (Review Runde 2, M2): Ob der Browser nach einer Touch-Geste mit Bewegung über einem Knopf noch `click` auslöst, wird **test-first** geklärt: Test 15e läuft zuerst nur per CDP-Touch (`pixel-7`) **ohne** Klick-Unterdrückung. Bleibt er grün (Browser feuert nach `touchmove` keinen Klick), entfallen Unterdrückung und Timer ganz. Wird er rot, kommt ein einmaliger `click`-Listener in der Capture-Phase auf `.onb-flow`, entfernt beim nächsten `pointerdown` oder nach 400 ms. Das Ergebnis steht unter „Umsetzung“.
  - CSS (`src/ui/onboarding/onboarding.css`): `.onb-flow { touch-action: pan-y pinch-zoom; }`. `pan-y` lässt vertikales Scrollen beim Browser und gibt die horizontale Geste der Seite; `pinch-zoom` hält das Zoomen frei (sonst schaltete `pan-y` es ab).
  - **Gleit-Effekt**: Nach einer erkannten Geste bekommen `.onb-txt` und `.onb-data` des neuen Schritts die Klasse `onb-in-vor` bzw. `onb-in-zurueck` (Einblenden aus 24 px Versatz in Wischrichtung, 180 ms). Beide tragen `key={index}` (`OnboardingFlow.tsx:81`, `:97`; Review Runde 2, M3): React baut sie je Schritt neu, sonst bliebe die Klasse beim zweiten Wischen in dieselbe Richtung gleich, und die Animation liefe nicht erneut. Nach Knopf-Navigation keine Klasse, dort bleibt alles wie heute. Bei reduzierter Bewegung nimmt `motion.css` Animationen ohnehin weg (Kopfkommentar `onboarding.css:4`); kein Code hört auf `animationend`.
- **Budget**: geschätzt `Onboarding JS (lazy)` +0,4 bis +0,6 kB (6,29 → höchstens 6,9 von 7,3), `Onboarding CSS (lazy)` +0,1 kB (≈ 2,1 von 2,5). Kein Start-Byte. Reicht das Budget nicht, wird zuerst der Gleit-Effekt gestrichen, dann gefragt.
- **E2E**: Playwright kann auf `page.touchscreen` nur tippen. Festgelegt:
  - **Beide Engines** (`pixel-7`, `iphone-15`): synthetische Pointer Events per `locator.dispatchEvent("pointerdown" | "pointerup", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX, clientY, bubbles: true })`. Playwright erzeugt dafür echte `PointerEvent`s, in Chromium und WebKit. Helfer `swipe(page, { from: [x, y], to: [x, y], target? })` in `e2e/onboarding-steps.ts`. Prüft die Logik, nicht `touch-action`.
  - **Nur Chromium**: echte Touch-Geste über CDP (`page.context().newCDPSession(page)`, `Input.dispatchTouchEvent` `touchStart`/`touchMove` in mehreren Schritten/`touchEnd`). Prüft, dass mit `touch-action` die horizontale Geste bei der Seite ankommt und eine vertikale scrollt statt zu wechseln. In WebKit mit `test.skip(browserName !== "chromium", "CDP-Touch nur in Chromium; WebKit deckt die synthetischen Pointer Events ab")`.
- Keine neue Spec-Datei (Wischen gehört zu `e2e/onboarding.spec.ts`, Switch-Fall zu `e2e/onboarding-push.spec.ts`), also kein neuer Spec-Eintrag in `SPEC_COVERS`. Das neue Modul `src/data/platform.ts` kommt aber in die Abdeckung von `onboarding.spec` und `installieren.spec` (Review Runde 2, m6; S2).
- **Lint** (Review Runde 2, m4): Meldet Biome für die Pointer-Handler auf `.onb-flow` `noStaticElementInteractions`, hängen die Listener per Ref in einem `useEffect` (`addEventListener`), kein `biome-ignore`.

### E11 – Zurück per Tipp: Fortschrittspunkte als Knöpfe (Review Runde 2, m7)

Entscheidung des Auftraggebers (2026-10-11): Wischen ist eine Geste ohne Alternative für „Zurück“ (WCAG 2.5.1, Zeigergesten). Damit Zurück auch per Tipp und Tastatur geht:

- Die Fortschrittspunkte **früherer** Schritte werden `<button type="button">` mit `aria-label` „Zu Schritt n: <Überschrift>“ und rufen `setIndex(n - 1)` (wie `back()`, Fokus über den Effekt auf `index` auf die Überschrift).
- Touch-Ziel mindestens 44 × 44 px per Polster (transparentes `padding` bzw. Pseudo-Element), das sichtbare Aussehen der Punkte ändert sich nicht.
- Der aktuelle und die **zukünftigen** Punkte bleiben nicht interaktiv (weiter nur über „Weiter“, damit die Prüfung des Geburtsdatums nicht umgangen wird).
- Fokus-Ring sichtbar (`:focus-visible` wie die übrigen Knöpfe).
- Umsetzung in S3, Test 15g.

## Tests (test-first für Domäne und Daten)

**Unit**

- `src/domain/onboarding.test.ts`:
  - Erwartungen `ios/ja`, `ios/verweigert`, `ios/nein` (`:48–50`) → `app,stadt,alter,weg`. Alle anderen 15 Fälle unverändert.
  - `stepText`:
    - „app“ mit `first: true` und `{ install: "ios", push: "nur-in-app" }` → Kicker „Willkommen“, Überschrift und Lead wie ohne `first`.
    - „stadt“ mit `first: false` → Kicker „Schön, dass ihr da seid“, Lead mit Zahlen.
    - „stadt“ mit `first: true` → „Willkommen“ (heutiges Verhalten).
    - „app“ ohne `first` → „Immer griffbereit“ bzw. „Samstags-Nachricht“ (heutiges Verhalten).
  - `swipeStep` (Breite 412):
    - (300,400) → (200,410): „weiter“; (100,400) → (200,390): „zurueck“.
    - genau `minDistance` (dx −56) → „weiter“; dx −55 → `undefined`.
    - Start x 23 bzw. 389 (Rand) → `undefined`; Start x 24 → gewertet.
    - dx −100, dy 50 → „weiter“ (Steigung 0,5); dy 51 → `undefined`.
    - rein vertikal (dx 0, dy 300) → `undefined`.
- `src/data/platform.test.ts` (neu, zum neuen Modul): `isIosDevice` für iPhone-, iPad- und iPod-UA → `true`; `Macintosh` mit `maxTouchPoints` 5 → `true`, mit 0 → `false`; Android- und Desktop-UA → `false`. Die bisherigen Fälle aus `src/data/pwa.test.ts` (sofern dort `isIos` über `state()` geprüft wird) bleiben grün und belegen, dass `pwa.ts` die neue Funktion nutzt.
- `src/data/push.test.ts`: `mirrorIfSubscribed` ohne `hasPushManager` → kein `getRegistration`, kein `store.set` (m5); ohne Abo → kein `store.set`, kein `fetch`; mit Abo → schreibt `birthDate`, `searches`, `origin` in den Store, kein `fetch`; zweiter Aufruf mit gleichen Daten schreibt nichts.
- `src/domain/onboarding-gate.test.ts`: Wahrheitstafel über `storage`, `done` und `deepLink` (8 Fälle), nur `"zeigen"` bei `storage && !done && !deepLink`. Der Fall `stored` entfällt; tsgo meldet jeden alten Aufruf mit `stored`.
- `src/data/preferences.test.ts`:
  - `saveOnboardingDone()` schreibt `[[ONBOARDING_FLAG.key, ONBOARDING_FLAG.value]]` (aus `e2e/onboarding-flag.ts`, E6).
  - `loadOnboardingDone()` ist `true` nur bei `"2"`, `false` bei fehlendem Wert, bei `"1"` (still gesetzt seit ecfccfb), bei `"3"` und bei `""`.
  - Tests zu `hasStoredData` und `SEARCHES_KEY` entfallen ersatzlos (E4: E2E-Abdeckung in `e2e/push.spec.ts`). Der Fall „Speicher wirft“ verliert die Zeile zu `hasStoredData`.

**E2E `e2e/onboarding.spec.ts`**

- **Test 7 (iPhone, neu gefasst)**: Reihenfolge App → Stadt → Alter → Weg.
  - Schritt 1 von 4: Kicker „Willkommen“, Überschrift „Ein Tipp, und ich bin da“, iOS-Anleitung, Hinweis mit „Darum frage ich das hier als Erstes.“ und dem neuen Schlusssatz (E2), kein Schalter, Knopf „Los geht’s“, kein „Später“.
  - Schritt 2: Kicker „Schön, dass ihr da seid“, Lead mit Zahlen.
  - Schritt 3 „Passt zum Alter“.
  - Schritt 4 „Gut erreichbar“ mit Abschluss-Beschriftung (`/^(Zeig mir|Zur Liste)/`).
- **Test 1**: unverändert (Android). Die Kicker-Folge mit „Willkommen“ zuerst und „Immer griffbereit“ zuletzt prüft er schon (`stepOrder`).
- **Test 2**: Statt Schritt 1 vorauszusetzen, `goTo(page, "stadt")`. So läuft er auch auf `iphone-15` (dort Schritt 2).
- **Test 8, Test 9, Test 11, Test 12 „Chunk nicht ladbar“, Test 12 „App-Teil nicht ladbar“**: erwarten `ONBOARDING_FLAG.value` statt `"1"` (E6, vollständig per grep).
- **Test 10 (Bestandsnutzer und Privatsphäre, neu gefasst)**:
  - **10a** „erster Start mit und ohne Merkliste lädt dieselben Chunks“: Ohne Angaben erscheint das Onboarding. Im eigenen Kontext mit Merkliste **erscheint es ebenfalls** (statt „kein Onboarding, Flag still gesetzt“). Die Chunk-Listen sind gleich, der Onboarding-Chunk kommt genau einmal. Nach „Überspringen“ ist das Flag `ONBOARDING_FLAG.value`. Der zweite Start bringt kein Onboarding, aus `assets/` kommt nur `app/pwa.js`.
  - **10b** „Bestandsnutzer mit Geburtsdatum und Stadtteil sieht es, vorbelegt“ (ersetzt „Geburtsdatum gespeichert: kein Onboarding“): Init-Skript mit `zwergenplan.geburtsdatum = "2026-04-20"` und `zwergenplan.entfernung-ab = "gostenhof"`. Das Onboarding erscheint. `goTo("alter")`: Feld „20.04.2026“, Hinweis beginnt mit „5 Monate!“. `goTo("weg")`: Stadtteil-Auswahl hat den Wert `gostenhof`. Je genau ein Request auf `wegzeit.json` und `linien.json` in der ganzen Sitzung. Nach „Überspringen“ sind Geburtsdatum und Stadtteil unverändert und das Flag `ONBOARDING_FLAG.value`.
  - **10c** „altes Flag ‚1‘ → erscheint einmal“: Das Init-Skript setzt `ONBOARDING_FLAG.key = "1"` **nur beim ersten Laden**, mit `sessionStorage`-Wächter wie `e2e/push.spec.ts:306–308` (`if (sessionStorage.getItem("__e2eSeeded")) return; sessionStorage.setItem("__e2eSeeded", "1"); …`). Ohne Wächter schriebe es nach dem Neuladen wieder `"1"`, und der Test prüfte nichts. Die Option `"neu"` lässt den Wert stehen. Das Onboarding erscheint. Nach „Überspringen“ ist das Flag `ONBOARDING_FLAG.value`. Nach dem Neuladen kommt kein Onboarding und kein Request auf `assets/onboarding/`.
  - **Deep-Link** (bestehend): unverändert. Zusätzlich mit Flag `"1"` (gleicher Wächter): kein Onboarding, Flag bleibt `"1"`.
- **Test 12 „leere Bühne in der Farbe der ersten Bühne“** (`:408–432`): läuft wie bisher in allen Projekten, auf `iphone-15` jetzt mit der lila Bühne. Die Gleichheit Ladebühne = Bühne von Schritt 1 bleibt die Kernprüfung. Die Gegenprobe „nicht ungemischt“ wird je Projekt: `255,217,59` auf Android, `185,156,255` auf `iphone-15` (Konstante je Projektname, wie `ANDROID`). Zusätzlich auf `iphone-15`: die Ladebühne trägt die Klasse `ios`, auf `pixel-7` nicht. Der Farbvergleich läuft auf `iphone-15` auch **hell** (Review Runde 2, m3), nicht nur dunkel.
- **Test 13**: Kommentar `:517–518` neu: Mit Plan 0034 macht eine gespeicherte Darstellung keinen Bestandsnutzer mehr. `chosenDark` setzt deshalb `zwergenplan.darstellung = "dunkel"` per Init-Skript **vor** dem Laden, wie `e2e/mobile-ux.spec.ts:506`; das prüft den echten Weg (Inline-Skript in `index.html` setzt `data-theme` vor dem ersten Paint) statt `page.evaluate` nach dem Öffnen. Die Gates laufen weiter für jeden Schritt, auf `iphone-15` jetzt auch für „App“ als Schritt 1.
- **Test 15 „Wischen“ (neu)**, `reducedMotion: "reduce"` außer in 15f:
  - **15a**: Auf der Bühne nach links wischen → Schritt 2, Überschrift hat den Fokus. Nach rechts → Schritt 1, Fokus auf der Überschrift. Auf Schritt 1 nach rechts → bleibt Schritt 1.
  - **15b**: Auf „alter“ ein ungültiges Datum eintragen, außerhalb des Felds nach links wischen → bleibt auf „alter“, Fokus im Feld, Hinweis steht. Nach rechts zurück und wieder vor: Eingabe steht noch.
  - **15c**: Keine Wirkung bei Start am Rand (x 10 und `width - 10`), bei Start im Geburtsdatum-Feld, bei überwiegend vertikaler Geste (dx −40, dy 200), bei `pointerType: "mouse"`.
  - **15d**: Auf dem letzten Schritt nach links → bleibt, das Onboarding ist noch offen, Flag unverändert.
  - **15e** (test-first, nur `pixel-7`, CDP-Touch, M2): Wischen über eine Stadt-Kachel bzw. über „Weiter“ wechselt genau einen Schritt, keine Doppelnavigation. Zuerst **ohne** Klick-Unterdrückung; bleibt er grün, wird keine gebaut (E10).
  - **15f** (`test.skip(testInfo.project.name !== "pixel-7", …)`, CDP-Touch; Review Runde 2, m2): horizontale Touch-Geste auf der Bühne → Schritt 2; vertikale Touch-Geste bei 200 % Textgröße → kein Schrittwechsel, der Dialog ist gescrollt. Ohne `reduce`: nach der horizontalen Geste trägt `.onb-txt` die Klasse `onb-in-vor`, nach einem **zweiten** Wischer nach links gilt `getAnimations().length > 0` auf dem neuen `.onb-txt` (M3: `key={index}` startet die Animation neu); mit `reduce` laufen keine Animationen (`expectReducedMotion`).
  - **15g** (E11): Auf Schritt 3 sind die Punkte 1 und 2 Knöpfe („Zu Schritt 1: …“), Punkt 3 und 4 nicht. Tipp auf Punkt 1 → Schritt 1, Fokus auf der Überschrift; per Tastatur (Tab bis zum Punkt, Enter) ebenso. Treffer-Fläche ≥ 44 × 44 px (`boundingBox` des Knopfs).
- Kommentar an `onboardingLoaded` („auch bei still erledigt“) streichen.
- **Unverändert grün**:
  - `e2e/onboarding-push.spec.ts` (Android, App zuletzt), dazu ein Fall in Test 5: Wischgeste, die auf dem Schalter beginnt, wechselt nicht den Schritt und schaltet nicht.
  - `e2e/push.spec.ts`, Test „Schalter im letzten Schritt“.
  - `e2e/smoke.spec.ts` (kein iOS-UA).
  - Test 14.

**E2E `e2e/push.spec.ts`** (E9)

- **Neu** „Onboarding spiegelt am Ende einmal, ohne Request“: Push im Kind-Sheet einschalten (wie der Test ab `:300`), `readStore` zeigt die alten Werte. Dann `ONBOARDING_FLAG.key = "1"` per `page.evaluate`, neu laden → Onboarding erscheint. Auf „alter“ ein neues Geburtsdatum, auf „weg“ einen anderen Stadtteil, „Überspringen“. `readStore` zeigt per `expect.poll` die neuen Werte. `pushLog` hat seit dem Neuladen keinen Eintrag.
- **Gegenprobe** im selben Test oder einem zweiten: ohne Abo bleibt der Geräte-Speicher nach dem Onboarding leer (`{}`).

## Schritte

- **S0 Messen**: auf aktuellem `main` `pnpm build`, size-limit. `JS (initial)`, `CSS`, `Onboarding JS (lazy)`, `Onboarding CSS (lazy)`, `App-Extras JS (lazy)` notieren und unter „Umsetzung“ eintragen.
  - Fertig, wenn: Werte mit Commit-SHA im Plan stehen.
- **S1 Domäne, Speicher, Gate und App (test-first)**: zuerst die Unit-Tests aus „Tests“ für `onboarding.ts` (ohne `swipeStep`), `onboarding-gate.ts`, `preferences.ts` rot schreiben, dann:
  - `e2e/onboarding-flag.ts` anlegen (E6).
  - `onboardingSteps` und `stepText` (`first`) ändern, `iosNote` neu (E1, E2).
  - `onboardingGate` ohne `stored` (E3), **zugleich** `App.tsx` (Import `:4`, Aufruf `:110`, Zweig `:116`, Kommentar), damit tsgo grün bleibt.
  - `ONBOARDING_VERSION`, `loadOnboardingDone` und `saveOnboardingDone` ändern, `hasStoredData` entfernen, `SEARCHES_KEY` zurück nach `searches-store.ts` (E4).
  - `OnboardingFlow.tsx:57`: `first: index === 0` an `stepText`.
  - Kommentare in `onboarding-gate.ts`, `preferences.ts` (Kopf, `:18–22`) und `searches-store.ts` nachziehen.
  - **E2E dieses Schritts** (Review Runde 2, M4: die Änderung bricht sie, also zieht sie hier mit): `e2e/fixtures.ts` (`skipOnboarding` mit `ONBOARDING_FLAG`), `e2e/onboarding-steps.ts` (`KICKER.stadt`, `goTo` mit Gruppe „Stadt“), `e2e/onboarding.spec.ts` (Test 1 Kommentar, Test 2 per `goTo`, Test 7, Tests 8–11 inkl. 10a–c, beide Tests 12 mit Flag, Test 13, Kommentar `onboardingLoaded`), `e2e/startpunkt.spec.ts`, `scripts/screenshots.ts`. `grep -rn '"1"' e2e/` und `grep -rn "einfuehrung" e2e/ scripts/`: keine übrigen Flag-Werte außer den bewusst alten in Test 10c und Deep-Link. `node scripts/e2e-select.ts e2e/onboarding-flag.ts` prüfen.
  - Fertig, wenn: `pnpm verify` grün ist (tsgo, knip ohne Funde zu `hasStoredData`/`SEARCHES_KEY`, `pnpm arch` grün mit dem Test-Import aus `e2e/` und dem Import `scripts/` → `e2e/`) und `pnpm e2e:local --affected` grün ist.
- **S2 Ladebühne und Spiegeln (test-first)**:
  - `src/data/platform.test.ts` rot, dann `src/data/platform.ts`, `pwa.ts` darauf umstellen, Lader und `dialog.css` (E8).
  - `push.test.ts` für `mirrorIfSubscribed` rot (inkl. Fall ohne `hasPushManager`), dann `push.ts`, `AppSection.tsx` (`syncPushMirror`), `use-push-switch.ts` (`mirrorData` exportiert), `onboarding-types.ts`, `AppExtras.tsx`, Cleanup in `OnboardingFlow.tsx` (E9).
  - `scripts/lib/e2e-map.ts`: `src/data/platform.ts` in `SPEC_COVERS` von `onboarding.spec` und `installieren.spec` (m6); `node scripts/e2e-select.ts src/data/platform.ts` nennt beide.
  - **E2E dieses Schritts** (M4): Test 12 „leere Bühne in der Farbe der ersten Bühne“ (Klasse `ios`, Gegenprobe je Projekt, `iphone-15` hell und dunkel), `e2e/push.spec.ts` (E9, mit Gegenprobe).
  - `pnpm build` und size-limit: `JS (initial)` gegen S0 messen und eintragen.
  - Fertig, wenn: `pnpm verify` grün ist, `JS (initial)` ≤ 101 kB, `pnpm e2e:local --affected` grün ist und `pnpm e2e:local e2e/onboarding.spec.ts -- --project=iphone-15` grün ist (falls lokal WebKit geht; sonst die CI auf dem Branch).
- **S3 Wischen und Zurück per Punkt (test-first)**: `swipeStep`-Tests rot, dann `swipeStep` in `onboarding.ts`, Pointer-Handler, `back()`, Gleit-Klassen mit `key={index}` in `OnboardingFlow.tsx`, `touch-action` und Keyframes in `onboarding.css` (E10), Fortschrittspunkte als Knöpfe (E11). Sofort danach `pnpm lint` (m4: bei `noStaticElementInteractions` Listener per Ref in `useEffect`, kein `biome-ignore`). Test 15e zuerst ohne Klick-Unterdrückung (M2); nur wenn er rot ist, die Unterdrückung bauen. `pnpm build`, size-limit für die Onboarding-Budgets eintragen.
  - **E2E dieses Schritts** (M4): Helfer `swipe` in `e2e/onboarding-steps.ts`, Test 15a–g in `e2e/onboarding.spec.ts`, Switch-Fall in `e2e/onboarding-push.spec.ts` (Test 5).
  - Fertig, wenn: `pnpm verify` grün ist, beide Onboarding-Budgets halten und `pnpm e2e:local --affected` grün ist.
- **S4 E2E gesamt**: `node scripts/e2e-select.ts` prüfen; `pnpm e2e:local --affected` und, falls lokal WebKit geht, `pnpm e2e:local e2e/onboarding.spec.ts -- --project=iphone-15` über den ganzen Diff.
  - Fertig, wenn: `pnpm verify` grün ist und beide Läufe grün sind (sonst prüft `iphone-15` die CI auf dem Branch).
- **S5 Browser-Review lokal** (`/browser-review`, betroffene Ansichten):
  - Onboarding auf `iphone-15` (App als Schritt 1 mit Kicker „Willkommen“ und neuem Hinweis, Schritt 2 „Schön, dass ihr da seid“) und auf `pixel-7` unverändert, je hell und dunkel, 320 px / 200 %.
  - **Übergang Laden → Schritt 1** auf `iphone-15` und `pixel-7`, hell und dunkel: kein Farbsprung der Bühne (Chunk per Route zurückhalten wie Test 12).
  - **App-Schritt 1 auf `iphone-15` im Querformat** und **bei 200 % Textgröße**: Anleitung, Hinweis, „Los geht’s“ und „Überspringen“ erreichbar, nichts abgeschnitten.
  - Onboarding mit vorbelegtem Geburtsdatum und Stadtteil.
  - Wischen auf `pixel-7` (Chromium-Touch): Wechsel vor und zurück, Gleit-Effekt ruhig, vertikales Scrollen bei 200 % geht weiter.
  - Liste nach „Überspringen“.
  - Fertig, wenn: jede Zeile der Checkliste beantwortet ist und Befunde behoben oder begründet sind.
- **S6 `/arch-review`**: Pflicht (neues Modul `src/data/platform.ts`, Diff voraussichtlich über 200 Zeilen). Fertig, wenn kein Blocker offen ist.
- **S7 Doku** (siehe „Doku“), dann Commit auf dem Branch, Push, CI auf dem Branch grün, Fast-Forward nach `main`, CI auf `main` grün, `meta.json` zeigt den Commit, `/browser-review live` als Kurzcheck. Zum Schluss archivieren.
  - Fertig, wenn: `commit` in https://zwergenplan.app/data/meta.json `git rev-parse --short HEAD` ist und `check-docs` nach dem Archivieren grün ist.

## Doku

- **ADR 0027**: Nachtrag „(2026-10-11): ohne ‚still-erledigt‘, Flag-Version 2, iPhone App zuerst (Plan 0034)“:
  - Das Gate kennt nur noch „zeigen“/„nichts“, Bestandsnutzer sehen das Onboarding. Damit hängt auch das Erscheinen nicht mehr an gespeicherten Angaben.
  - Erledigt ist nur `"2"`, alle mit `"1"` laden die Chunks beim nächsten Start einmal erneut.
  - Im Safari-Tab des iPhones steht „App“ an Position 1 (Grund: eigener Speicher der installierten App). Die Ladebühne trägt dort die App-Farbe (`iosTab()` aus `src/data/platform.ts`).
  - Der Kontextsatz „rückt ‚App‘ an Position 2“ und die Erwähnung von „still-erledigt“ in Entscheidung 1 gelten als überholt. Der Text oben bleibt stehen.
- **ADR 0014**: Nachtrag „(2026-10-11, Plan 0034): Am Ende des Onboardings einmal `mirrorIfSubscribed`, lokal, ohne Request“.
- **ADR 0013**: Nachtrag „(2026-10-11, Plan 0034): `display-mode` auch in `src/data/platform.ts`“: Ausnahme von Punkt 5, nur lesend (`standalone()`), ohne Listener, ohne `beforeinstallprompt` und Registrierung, im Start-Bundle für die Farbe der Ladebühne (E8). Muster ADR 0014, Punkt 6.
- **`docs/architecture.md`**:
  - `:96` PWA-Kern: „der einzige für `beforeinstallprompt` und `display-mode`“ um die zweite Ausnahme ergänzen: `src/data/platform.ts` liest `display-mode` nur lesend, ohne Listener (ADR 0013, Nachtrag 2026-10-11, Plan 0034).
  - `:118` Push-Unterpunkt („Gespiegelt und abgeglichen wird nur, solange das Kind-Sheet offen ist …“): „und einmal am Ende des Onboardings (`mirrorIfSubscribed`, lokal, ohne Request; Plan 0034, E9)“.
  - `:98` Push-Teil: zweite Ausnahme „am Ende des Onboardings einmal `mirrorIfSubscribed` (lokal, kein Request)“; „Gespiegelt und abgeglichen wird, solange das Kind-Sheet offen ist“ um „und einmal am Ende des Onboardings“ ergänzen.
  - `:101` Start: `onboardingGate` ohne „still-erledigt“; `hasStoredData` streichen; `src/data/platform.ts` (`iosTab`, Ladebühne `.onb-pending.ios`) nennen.
  - `:102` Chunk: Wischen (`swipeStep` in `src/domain/onboarding.ts`, Pointer Events auf `.onb-flow`, `touch-action: pan-y pinch-zoom`), Fortschrittspunkte früherer Schritte als Knöpfe (E11).
  - `:104` Wann: „Vorladen bei jedem Gate ≠ ‚nichts‘“ ohne den Zusatz „auch bei still-erledigt …“, dazu „Bestandsnutzer sehen es einmal, gespeicherte Angaben stehen vorbelegt (Plan 0034)“.
  - `:105` E2E: Flag-Schlüssel und -Wert aus `e2e/onboarding-flag.ts` (`ONBOARDING_FLAG`), gekoppelt per Unit-Test in `src/data/preferences.test.ts`; auch `scripts/screenshots.ts` nutzt ihn. Wischen: synthetische Pointer Events in beiden Engines, CDP-Touch nur Chromium.
  - `:106` Push: „ohne laufendes Spiegeln“ → „ohne laufendes Spiegeln, einmal am Ende (Plan 0034, E9)“.
  - `:132` Privatsphäre:
    - „die Such-Abos (`zwergenplan.such-abos`, `SEARCHES_KEY`)“ → Schlüssel in `src/data/searches-store.ts`.
    - Probe „nur beim Start ohne gültiges Onboarding-Flag“.
    - Flag „Wert `"2"` (`ONBOARDING_VERSION`; `"1"` aus Plan 0033 gilt nicht mehr als erledigt)“.
    - Test-Beleg „mit und ohne gespeicherte Merkliste“ bleibt.
- **ADR 0012**: Delta-Zeile „Plan 0034“ mit vorher/nachher `JS (initial)` (E8 und E3/E4 gegeneinander), dazu die Lazy-Budgets in Klammern. Die Zeile von Plan 0033 bleibt als Historie.
- **`docs/ideas.md`**:
  - „Onboarding erneut für alle nach großen Änderungen“ entfernen. Der Mechanismus ist mit Plan 0034 umgesetzt (`ONBOARDING_VERSION` erhöhen). Ein Satz unter „Offen aus abgeschlossenen Plänen“ bei Plan 0033 verweist darauf.
  - iPhone-Prüfung (Plan 0033): Reihenfolge im Safari-Tab „App → Stadt → Alter → Weg“, Ladebühne lila, Wischen vor/zurück. Die installierte App zeigt „Stadt → Alter → Weg → App“ mit Schalter.
  - Restpunkte Plan 0033: „Onboarding-Version“ aus „stehen oben“ streichen.
  - Neu (nur falls im Browser-Review gewünscht): sichtbarer Knopf „Zurück“ im Onboarding.
- **Plan 0033** (Archiv): keine Änderung; Verweis nur von hier.
- Keine README-Änderung (das Onboarding steht dort nicht im Detail; in S7 per `grep -n -i "einführung\|onboarding" README.md` bestätigen).

## Risiken

- **Wiederholung für die, die es schon gesehen haben**: Wer seit ecfccfb das Onboarding durchlaufen hat, sieht es noch einmal. Vom Nutzer akzeptiert (wenige Nutzer, ein Tag seit Deploy). Die Werte sind vorbelegt, „Überspringen“ steht oben.
- **iPhone: Angaben im Tab fehlen in der App**: Wer im Safari-Tab Alter und Weg einträgt und danach installiert, muss sie in der App erneut eingeben. Der App-Schritt als erster Schritt und der Hinweis „Die App hat einen eigenen Speicher, dort frage ich dann nach Alter und Startpunkt“ machen das sichtbar. Ganz verhindern lässt es sich nicht (Plattformgrenze, Nicht-Ziel). Am echten iPhone prüft es der Nutzer (`docs/ideas.md`, Plan 0033).
- **Bestandsnutzer auf dem iPhone im Tab**: Sie sehen zuerst die Installationsanleitung, obwohl ihre Angaben im Tab liegen. Installieren sie, sind die Angaben in der App leer. Das ist der Preis der Nutzerentscheidung „App zuerst“, im Plan bewusst festgehalten.
- **Bestandsnutzer mit Samstags-Nachricht** (Review M4): Ohne E9 schnitte der Service Worker nach geänderten Angaben im Onboarding mit alten Werten zu, bis das Kind-Sheet offen war. E9 spiegelt am Ende einmal. Rest-Risiko: Wird die Seite während des Onboardings geschlossen (Tab weg, kein Unmount), wird nicht gespiegelt; dann gilt wie bisher der Abgleich beim nächsten Öffnen des Kind-Sheets. Das Onboarding kommt dann beim nächsten Start ohnehin erneut (Flag nicht gesetzt).
- **Startbudget** (E8): Die iOS-Ladebühne kostet Start-Bytes bei 0,65 kB Rest. Gemessen in S2; über 101 kB ist Blocker (E8).
- **Wischen gegen Systemgesten**: Am Bildschirmrand beginnende Gesten (Android-Zurück, Safari-Zurück) gehören dem System; `swipeStep` ignoriert die äußeren 24 px. Android-Zurück schließt den Dialog wie bisher (`cancel` = „Überspringen“). Dass `pointercancel` bei vertikalem Scrollen kommt und die horizontale Geste mit `touch-action: pan-y` bei der Seite ankommt, belegt nur Chromium per CDP (15f); auf WebKit prüft es der Nutzer am echten iPhone (`docs/ideas.md`).
- **Wischen auf Knöpfen**: Ein Klick nach der Geste würde doppelt navigieren. Ob der Browser ihn auslöst, klärt Test 15e test-first per CDP-Touch; nur wenn ja, kommt die Klick-Unterdrückung (E10). WebKit prüft der Nutzer am echten iPhone.
- **Kicker-Abhängigkeit in E2E**: `goTo` erkennt Schritte am Kicker. Auf iOS trägt der App-Schritt „Willkommen“, also könnte `goTo(page, "stadt")` fälschlich auf Schritt 1 halten. Gegenmittel (E2): Für „stadt“ prüft `goTo` zusätzlich die Gruppe „Stadt“ (`getByRole("group", { name: "Stadt" })`).
- **Service-Worker-Cache**: Ein Gerät mit altem App-Stand (vor Plan 0034) wertet `"2"` als erledigt (jeder Wert zählt). Ein Rückfall auf den alten Stand richtet also keinen Schaden an.
- **Lokal kein WebKit**: Test 7, Test 2, Test 12 (Ladebühne) und Test 15 auf `iphone-15` laufen dann nur in der CI. Der Branch-Lauf wählt `onboarding.spec.ts` über den Diff.

## Offene Punkte

- **N1 Kicker** – entschieden (2026-10-11, vom Auftraggeber nach Empfehlung, ohne Nutzer, umkehrbar): Im Safari-Tab trägt der App-Schritt als Schritt 1 „Willkommen“, der Stadt-Schritt danach „Schön, dass ihr da seid“ (E2).
- **N2 Knopf auf Schritt 1 (iOS)** – entschieden (2026-10-11, vom Auftraggeber nach Empfehlung, ohne Nutzer, umkehrbar): bleibt „Los geht’s“.
- **Wischen nach links auf dem letzten Schritt** – entschieden (2026-10-11, vom Auftraggeber, ohne Nutzer, umkehrbar): beendet nicht (E10).
- **iOS-Hinweis in Ich-Form** – entschieden (2026-10-11, vom Auftraggeber, ohne Nutzer, umkehrbar): „… dort frage ich dann nach Alter und Startpunkt.“ (E2).
- **Zurück ohne Wischen** – entschieden (2026-10-11, vom Auftraggeber nach Review Runde 2, m7): Fortschrittspunkte früherer Schritte als Knöpfe (E11).
- Keine weiteren offenen Nutzerentscheide. Im Browser-Review dem Nutzer zeigen: Wischen auf dem letzten Schritt endet nicht, Zurück per Punkt statt eigenem Knopf.

## Umsetzung

- **S0** (a4739b2, Code = `main` 9a4a894): `JS (initial)` 100,352 kB, `CSS` 12,126 kB, `Onboarding JS (lazy)` 6,289 kB, `Onboarding CSS (lazy)` 2,064 kB, `App-Extras JS (lazy)` 7,449 kB (von 7,6 kB).
- **S1**: wie geplant. `pnpm verify` grün (`pnpm arch` erlaubt `src/data/preferences.test.ts` → `e2e/onboarding-flag.ts` und `scripts/screenshots.ts` → `e2e/`). `e2e/onboarding-flag.ts` hängt über `e2e/fixtures.ts` an jeder Spec, `--affected` wählt deshalb die volle Auswahl und fährt lokal nur `app`, `theme` und die direkt getroffenen Specs (139 grün); `onboarding.spec.ts` und `startpunkt.spec.ts` zusätzlich von Hand auf `pixel-7` (67 grün, 3 übersprungen). Abweichungen: Test 10c und der Deep-Link-Zusatz setzen den alten Wert „1“ per Init-Skript mit `sessionStorage`-Wächter; `stepText` bekommt `first` als Pflichtfeld, „App“ als Schritt 1 heißt in jeder Variante „Willkommen“. Zwischen S1 und S2 ist Test 12 „leere Bühne“ auf `iphone-15` erwartbar rot (gelbe Ladebühne vor lila App-Bühne), S2 behebt das; nicht gepusht.
- **S2**: wie geplant. `JS (initial)` 100,352 → 100,446 kB (+0,094 kB, S1 und S2 zusammen, ≤ 101 kB), `CSS` 12,126 → 12,153 kB, `Onboarding JS (lazy)` 6,289 → 6,386 kB, `Onboarding CSS (lazy)` 2,064 → 2,067 kB, `App-Extras JS (lazy)` 7,449 → 7,469 kB von 7,6 kB (Rest 0,13 kB); Delta in ADR 0012. `node scripts/e2e-select.ts src/data/platform.ts` nennt `onboarding.spec` und `installieren.spec`. E2E: `--affected` auf `pixel-7` 129 grün, 9 übersprungen; beide neuen Fälle in `push.spec.ts` grün, `onboarding.spec.ts` auf `iphone-15` 27 grün (lokal WebKit vorhanden). Abweichungen:
  - **Kicker-Pille in em** (`onboarding.css`): Test 13 „320 px und 200 %“ war auf `iphone-15` rot, weil der neue, längere Kicker „Schön, dass ihr da seid“ dort zweizeilig umbricht und an die 999-px-Rundung stößt. Jetzt `border-radius: 1em`, `padding: 2px 0.9em`: einzeilig weiter rund, zweizeilig ohne Anstoßen. Im Browser-Review (S5) ansehen.
  - Test 12 „leere Bühne“ läuft zusätzlich hell nur auf `iphone-15` und prüft dort die ungemischte App-Farbe genau; dunkel bleibt die Gegenprobe „nicht ungemischt“ je Projekt.
  - `push.spec.ts`: zwei Fälle in einem `describe` (mit Abo: neue Werte, kein Request; ohne Abo: Speicher bleibt `{}`). Der Fall ohne Abo wartet 300 ms auf den asynchronen Cleanup, weil es kein Ereignis gibt, auf das er warten könnte.

## Review (2026-10-11) – Verdict: Überarbeiten

Unabhängiger Plan-Review (`/plan-review`), Befunde bewertet vom Auftraggeber.

**Übernommen**

- **B1** Ladebühne fest gelb, auf iOS Farbsprung zur lila App-Bühne, Test 12 „leere Bühne in der Farbe der ersten Bühne“ auf `iphone-15` rot → neue Entscheidung E8 (Variante a): Klasse `onb-pending ios` per synchroner Prüfung `iosTab()` aus dem neuen Start-Modul `src/data/platform.ts`, das auch `pwa.ts` nutzt (eine Prüfung, kein Duplikat); dunkel mit 80 % wie `--mix`. Budget messen (S2), Delta in ADR 0012. Test 12 angepasst, Übergang in S5.
- **M1** S1 konnte nicht grün werden, weil `App.tsx:4,110,116` `hasStoredData`/`stored` nutzt → S1 und S2 zusammengelegt (neuer S1 ändert Gate, Speicher und `App.tsx` zugleich).
- **M2** Test 10c: Init-Skript setzte `"1"` bei jedem Laden → `sessionStorage`-Wächter wie `e2e/push.spec.ts:306–308`.
- **M3** E2E-Anpassungen unvollständig → E6 und S4: jede Erwartung `"1"` per grep auf `ONBOARDING_FLAG.value`; Tests 8, 9, 11 und beide Tests 12 ausdrücklich genannt.
- **M4** Bestandsnutzer mit aktiver Samstags-Nachricht: Onboarding spiegelt nicht, Service Worker schneidet mit alten Werten zu → E9: am Ende einmal `mirrorIfSubscribed` (lokal, ohne Request, nur mit geladenem App-Teil), Privatsphäre in E5, Test in `e2e/push.spec.ts`, Risiko vermerkt, Nachträge ADR 0014 und `docs/architecture.md`.
- **m1** Kicker „Eure Stadt“ doppelt mit dem Gruppen-Label → „Schön, dass ihr da seid“.
- **m2** Ersatztest für `SEARCHES_KEY` → gestrichen, E2E-Abdeckung `e2e/push.spec.ts:244`, `:311`, `:348` genannt.
- **m3** Test 13: Kommentar `:517–518` veraltet → neu gefasst, `chosenDark` über gespeicherte Darstellung per Init-Skript.
- **m4** S5 (vorher S4): App-Schritt 1 auf `iphone-15` im Querformat und bei 200 % prüfen.
- **m5** iOS-Hinweis „… und fragt dort noch einmal nach“ passt auf Schritt 1 nicht → neuer Schlusssatz „… dort frage ich dann nach Alter und Startpunkt.“ (E2), Ich-Form der App geprüft.
- **m6** Doppelprüfung in Test 1 → gestrichen, `stepOrder` prüft die Kicker schon.
- **m7** N1/N2 → entschieden nach Empfehlung, ohne Nutzer, umkehrbar.
- **m8** `docs/architecture.md:105` → `e2e/onboarding-flag.ts` dort nennen.

**Abgelehnt**

- Keiner.

**Neu nach dem Review**

- Nutzeranforderung „Wischen zwischen den Schritten“ → E10, Unit-Tests `swipeStep`, Test 15, S3, Budget-Schätzung. Neu dadurch: `/arch-review` Pflicht (S6, auch wegen `src/data/platform.ts`).

## Review Runde 2 (2026-10-11) – Verdict: Freigabe mit Änderungen

Zweiter unabhängiger Plan-Review (`/plan-review`) nach Einarbeitung von Runde 1 und dem Zusatz „Wischen“. Alle Befunde vom Auftraggeber übernommen.

**Übernommen**

- **M1** `src/data/platform.ts` liest `display-mode` außerhalb von `pwa.ts` (ADR 0013, Punkt 5) → Nachtrag ADR 0013 als Ausnahme (nur lesend, ohne Listener; Muster ADR 0014, Punkt 6), `docs/architecture.md:96`, E7, E8 und Doku-Liste ergänzt.
- **M2** Klick-Unterdrückung ungeprüft angenommen → Test 15e test-first nur per CDP-Touch (`pixel-7`) ohne Unterdrückung; bleibt er grün, entfallen Unterdrückung und Timer (E10, S3, Risiken).
- **M3** Gleit-Klasse bleibt beim zweiten Wischen gleich, Animation läuft nicht neu → `key={index}` auf `.onb-txt`/`.onb-data` (`OnboardingFlow.tsx:81`, `:97`), Test 15f mit zweitem Wischer (`getAnimations().length > 0`).
- **M4** E2E-Anpassungen lagen gesammelt in S4, die Schritte davor wären lokal rot → in den verursachenden Schritt gezogen (S1: Flag-Datei, `fixtures.ts`, Tests 1, 2, 7–11, 13, Test 12 Flag, `startpunkt.spec.ts`, `screenshots.ts`; S2: Test 12 Ladebühne, `push.spec.ts` E9; S3: Test 15 und Switch-Fall). Jeder Schritt ist erst mit grünem `pnpm e2e:local --affected` fertig; S4 ist nur noch der Gesamtlauf.
- **m1** `docs/architecture.md:118` und `:96` fehlten in der Doku-Liste → ergänzt.
- **m2** 15f lief per `browserName` auch auf anderen Chromium-Projekten → `test.skip(project !== "pixel-7")`.
- **m3** Farbvergleich Test 12 auf `iphone-15` nur dunkel → auch hell.
- **m4** Pointer-Handler auf `div` können Biome `noStaticElementInteractions` auslösen → S3 ruft sofort `pnpm lint`; dann Listener per Ref in `useEffect`, kein `biome-ignore` (E10).
- **m5** `mirrorIfSubscribed` ohne Push-Fähigkeit → prüft vorher `env.hasPushManager` (Unit-Fall); laufende Standortabfrage beim Ende als Restrisiko in E9.
- **m6** `src/data/platform.ts` ohne E2E-Zuordnung → `SPEC_COVERS` von `onboarding.spec` und `installieren.spec`, Prüfung per `node scripts/e2e-select.ts src/data/platform.ts` in S2.
- **m7** Zurück nur per Wischen (WCAG 2.5.1) → Entscheidung des Auftraggebers: Fortschrittspunkte früherer Schritte als Knöpfe („Zu Schritt n: <Titel>“, Ziel ≥ 44 px per Polster, Aussehen unverändert), zukünftige Punkte nicht interaktiv (E11, Test 15g, S3). Das Nicht-Ziel „Zurück-Knopf“ ist entsprechend gefasst.

**Entschieden ohne Nutzer (umkehrbar)**

- Wischen nach links auf dem letzten Schritt beendet nicht.
- iOS-Hinweis in Ich-Form.

**Abgelehnt**

- Keiner.
