# Plan 0033 – Onboarding beim ersten Öffnen

Status: in Umsetzung
Datum: 2026-10-11
Bezug:
- Referenz-Mockup `docs/design/onboarding-mockup.html` (freigegeben 2026-10-11; maßgeblich sind CSS, die vier SVGs und die Texte, die Skriptlogik ist Mockup; wird mit diesem Plan committet)
- ADR 0010 (src/data nur reine Hilfen), ADR 0011 (Wegzeit-Anlässe), ADR 0012 (Startbudget, Delta-Tabelle), ADR 0013 (PWA-Kern, Installationshilfe), ADR 0014 (Push), ADR 0017 (Startpunkt gespeichert), ADR 0025 (Regionen)
- Plan 0003, E3 (native `<dialog>`), Plan 0020, E3 (Fokus auf Überschrift), Plan 0021 (Altersfilter), Plan 0022 (Installationsknopf), Plan 0017 (PushControls)

## Anlass

Der Nutzer, wörtlich: „Ich möchte, dass beim erstmaligen Öffnen von Zwergenplan ein Onboarding-Wizard ausgeführt wird … Der Wizard sollte aber überspringbar sein.“

Feedback-Runden zum Mockup:
- „Fullscreen und je Screen ein Punkt. Dazu jeweils eine schöne Illustration. Und auf jedem Screen die Möglichkeit, die Daten einzugeben.“
- „Screen 4 und 5 bitte zusammenlegen. Screen 6 brauchen wir nicht … auf dem ersten Screen … Kacheln zum Auswählen. Sortiert nach den größten Städten, die wir unterstützen. Und darunter unter weitere dann erst eine Dropdown.“

## Ziel

Wer den Zwergenplan zum ersten Mal öffnet, sieht ein Vollbild-Onboarding mit einem Punkt je Screen. Oben steht eine Illustration auf farbiger Bühne. Darunter folgen Kicker, Überschrift, kurzer Text und gleich die Eingabe. Unten stehen „Weiter“ bzw. „Los geht's“ (Screen 1) bzw. „Zeig mir die N Angebote“ (letzter Screen) und „Später“. Oben stehen Fortschrittspunkte und „Überspringen“. Einen Fertig-Screen gibt es nicht.

| # (Android/Desktop) | Schritt | Bühne | Eingabe | wirkt auf |
|---|---|---|---|---|
| 1 | Stadt | gelb, Burg | Stadt-Kacheln (heute nur Nürnberg, vorgewählt) | nichts (E5) |
| 2 | Alter | pink, Messlatte | Geburtsdatum TT.MM.JJJJ | `zwergenplan.geburtsdatum`, Altersfilter an |
| 3 | Weg | blau, Straßenbahn | Standort oder Stadtteil, Chips 20/30/45 Min./Egal | Startpunkt (ADR 0017), `wegzeit=` |
| 4 | App | lila, Handy | Installieren, Schalter „Samstags-Nachricht“ | Installation, Push-Abo |

Auf dem iPhone im Browser (`InstallState` `ios`) rückt „App“ an Position 2. Ist weder Installation noch Push möglich, entfällt der Schritt „App“.

## Nicht-Ziele

- Stadtwahl speichern oder Daten je Region (eine zweite Region braucht eigene Daten, Fahrplan, Stadtteile; `docs/ideas.md`).
- Such-Abos im Onboarding, Darstellung hell/dunkel im Onboarding.
- History-Einträge je Schritt (Zurück-Geste = Schritt zurück).
- Erneutes Onboarding für alle nach einer Versionsänderung (Schlüsselwert ist dafür vorbereitet, E2).
- Eine Neugestaltung des Kind-Sheets. Es bekommt nur den Link „Einführung ansehen“.

## Ausgangslage

- **Start**: `src/ui/App.tsx` lädt `site.json` über den Frühstart (`index.html:34–42`) und rendert sofort den Ladezustand (`App.tsx:339–351`). `index.html` hat genau zwei Inline-Skripte (Frühstart, Darstellung `:43–52`; Bootstrap-Regel in `docs/architecture.md`). Ein drittes bräuchte ein ADR.
- **Speicher**: `src/data/preferences.ts:7–14` (`KEYS`: `geburtsdatum`, `merkliste`, `anbieter-merkliste`, `darstellung`, `entfernung-ab`, `startpunkt`), gekapselt über `read`/`write`. Such-Abos liegen in `src/data/searches-store.ts` (Lazy-Chunk `assets/app/`).
- **Geburtsdatum**: `KidSheet.tsx:44–55, 75–93` mit Text-Zustand, `parseGermanDate(text, today)` und `formatGermanDate` (`src/domain/time.ts:38–51`). `onBirthDate` ruft in `App.tsx:179–183` `setBirthDateStored` und `views.setAgeOnly(true)` auf. Der Altersfilter ist standardmäßig an und lebt nur im Speicher (`use-offer-views.ts`, `OfferViews.ageOnly`).
- **Startpunkt**: `useOrigin()` (`use-app-state.ts:340–383`: `locateMe`, `setDistrict`, `canLocate`, `problem`). `OriginPicker.tsx` zeigt Standort-Knopf, Stadtteil-`<select>` aus `DISTRICTS` (`src/domain/districts.ts`), `originHint` (`format.ts:415`) und die OSM-Namensnennung.
- **Wegzeit**: `useTransit().want()` lädt `wegzeit.json` und `linien.json` höchstens einmal je Sitzung. Anlässe sind Kind-Sheet, Karte und gespeicherter Startpunkt (`App.tsx:148–158`, Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“). Grenze: `LIMIT_MINUTES = [20, 30, 45]` (`src/domain/reach.ts:55`), `withReachLimit` (`src/domain/filter.ts`), URL-Schlüssel `wegzeit`. Das Filter-Sheet sperrt die Chips ohne wirksame Wegzeit (`Sheets.tsx:314–329`, Begründung `limitReason`, `format.ts:437`).
- **Regionen**: `src/domain/regions.ts`: `Region { name; bbox }`, `REGION_IDS = ["nuernberg"]`. `schema.ts:8` liest `REGION_IDS`/`REGIONS` für die Geo-Prüfung. ADR 0025, Punkt 1: „Weitere Region-Felder … kommen mit der zweiten Region“ (ebenso `regions.ts:3–4`).
- **App-Extras**: Der Lader `src/ui/AppExtras.tsx:27–37` lädt `app-extras/AppSection.tsx` und `src/data/pwa.ts` parallel und reicht `install` als Prop herein. Ein statischer Import zwischen zwei Lazy-Chunks schrieb `__vite__mapDeps` in den Einstieg (+0,11 kB, ADR 0013). `InstallState` und die Texte `installHelp`/`installFoot`/`pushView` stehen in `src/domain/pwa.ts`. Der Zustand `angebot` entsteht erst mit `beforeinstallprompt`, das erst gehört wird, wenn `pwa.ts` geladen ist (`data/pwa.ts:296–302`).
- **Push**: `PushControls.tsx:169–265` (Abgleich beim Mount, Spiegeln nach jedem Rendern, `toggle` mit `enable`/`disable`, Statuszeile). `push.ts:136–141` `support()` meldet `kein-sw`, solange keine Registrierung besteht, also beim Erstbesuch vor `load`. `enable` wartet nach `requestPermission` auf `ready` (`push.ts:72–75`) ohne Zeitlimit. Der Schalter heißt heute „Wochen-Nachricht“ (`push-texts.ts:29`, README, `e2e/push.spec.ts:35, 243, 278`, `push-texts.test.ts`).
- **Dialoge**: `src/ui/Dialog.tsx`. `showModal()` läuft im `useEffect`. `cancel` (Esc, Android-Zurück) und ein Tipp auf den Backdrop rufen `onClose` auf. Vollbild-Muster: `.detail` in `dialog.css:21–40`. `markAutofocus` setzt `autofocus`.
- **Lazy-Lader**: `useLazy`/`LoadFailed` in `src/ui/Lazy.tsx`.
- **Build**:
  - `vite.config.ts:108–121`: `chunkFileNames` nach Ordnern.
  - `:128–131`: `assetFileNames`. Nur die Karten-CSS hat einen eigenen Ordner.
  - Die Gruppe `$initial` (ADR 0012) bleibt.
  - `scripts/lib/chunks.ts` prüft nur JS direkt in `dist/assets/`.
  - `scripts/check-architecture.ts:73–86` `LAZY_LOADERS`.
- **Budgets** (`.size-limit.json`):
  - `JS (initial)` 100 kB, zuletzt 99,280 kB, Rest ≈ 0,72 kB (ADR 0012, Delta-Tabelle, Plan 0015 Nachtrag A).
  - `CSS` 15 kB (zuletzt ≈ 11,9 kB).
  - `App-Extras JS (lazy)` 7,1 kB (6,49 kB nach Plan 0022).
  - Gemessen in S0 (2026-10-11, auf `3bf4adb`, Basis `e63b1e1`): `JS (initial)` 99,284 kB, `CSS` 11,925 kB, `App-Extras JS (lazy)` 6,507 kB.
- **E2E**:
  - `e2e/fixtures.ts` setzt keinen Speicher. Alle Specs starten leer, nach diesem Plan also mit Onboarding.
  - `e2e/merkliste-anbieter.spec.ts:230` öffnet einen eigenen Kontext mit `browser.newContext()`.
  - `scripts/screenshots.ts` öffnet die App ohne Speicher.
  - `scripts/og-images.ts` rendert nicht die App, sondern ein eigenes Dokument mit der Start-CSS (`:6, 43–45, 145`). Es ist nicht betroffen.
- **Mobile-UX-Gates** (`e2e/mobile-ux.ts`):
  - `expectNoBrightIslands` überspringt SVG-Elemente (`:619`), `expectTextFits` ebenso (`:282`).
  - Gewählte Zustände nutzen `--sel`/`--on-sel`.
  - `motion.css` setzt bei reduzierter Bewegung global `animation: none !important; transition: none !important`.
  - Projekte: `android-klein` (360), `pixel-7`, `iphone-15` (WebKit), `pixel-7-quer`, `desktop`.

## Entscheidungen

### E1 – Schritte und Reihenfolge (rein, `src/domain/onboarding.ts`)

```ts
export type StepId = "stadt" | "alter" | "weg" | "app";
export interface AppStepParts {
  install: "knopf" | "ios" | "menue" | "installiert" | undefined;
  push: "schalter" | "nur-in-app" | "verweigert" | undefined;
}
export function appStepParts(install: InstallState, push: PushCapability): AppStepParts | undefined;
export function onboardingSteps(install: InstallState, push: PushCapability): StepId[];
```

- `install`: `angebot` → `knopf`, `ios` → `ios`, `menue` → `menue`, `installiert` → `installiert`, `app`/`keine` → `undefined`.
- `push`:
  - `ios` → immer `nur-in-app`. Im Safari-Tab gibt es kein Push (ADR 0014). Das Mockup zeigt dort einen Schalter, siehe „Abweichungen vom Mockup“.
  - sonst `ja` → `schalter`, `verweigert` → `verweigert`, `nein` → `undefined`.
- `appStepParts` liefert `undefined`, wenn weder ein Installationsteil noch `schalter`/`nur-in-app` bleibt. Ein reines `verweigert` hält den Schritt nicht. Dann entfällt der Schritt.
- Reihenfolge: bei `ios` `["stadt", "app", "alter", "weg"]`, sonst `["stadt", "alter", "weg", "app"]`, jeweils ohne `app`, wenn `appStepParts` `undefined` liefert.
- Die Reihenfolge wird **einmal beim Start des Flows** festgelegt (Punktezahl springt nicht). Der Flow startet deshalb erst, wenn Onboarding-Chunk, App-Teil (geladen oder gescheitert) und Daten feststehen (`Promise.allSettled`; Review 2, H-2). `parts` rechnet der Flow live aus `install.state()` (`useSyncExternalStore`). Kommt `angebot` später, wird aus „menue“ der Knopf. Ein Desktop ohne Push, der später ein Angebot bekommt, bleibt bei drei Schritten (bewusst).
- Neuer Typ in `src/domain/pwa.ts`: `export type PushCapability = "ja" | "verweigert" | "nein";`.

### E2 – Wann es erscheint, Speicher

- Neuer Schlüssel `zwergenplan.einfuehrung` in `KEYS` (`src/data/preferences.ts`), Wert `"1"` (Version; jeder vorhandene Wert zählt als erledigt):
  - `loadOnboardingDone(): boolean` (`read(...) !== null`)
  - `saveOnboardingDone(): void`
  - `hasStoredData(): boolean`: irgendein Schlüssel aus `KEYS` außer `onboarding` ist gesetzt. Such-Abos zählen ebenfalls: Ein Such-Abo geht auch ohne Push und ohne andere Angaben (`PushControls.tsx:133–138`). Der Schlüssel der Such-Abos wird als Konstante `SEARCHES_KEY` in `preferences.ts` (Start) definiert und von `searches-store.ts` importiert (Lazy → Start ist erlaubt), damit eine Umbenennung beide trifft (Arch-Review m2).
- Rein und im Start (`src/domain/onboarding-gate.ts`, ein Export):
  ```ts
  export type OnboardingGate = "zeigen" | "still-erledigt" | "nichts";
  export function onboardingGate(g: { storage: boolean; done: boolean; stored: boolean; deepLink: boolean }): OnboardingGate;
  // !storage || done || deepLink → "nichts"; stored → "still-erledigt"; sonst "zeigen"
  // `storage`: localStorage nutzbar (Schreib-/Leseprobe in `preferences.ts`, `storageUsable()`); ohne Speicher käme das Onboarding sonst bei jedem Besuch (Arch-Review m3)
  ```
- **Privatsphäre (Review H1)**: Ob der Onboarding-Chunk geladen wird, darf nicht davon abhängen, ob etwas gemerkt ist (`docs/architecture.md`, Invariante „Kein Request hängt davon ab, ob oder welche Anbieter gemerkt sind“). Deshalb:
  - Vorladen (`preloadOnboarding()`) hängt allein an `!done && !deepLink`, also an Gate ≠ `"nichts"`.
  - Bei `"still-erledigt"` (Bestandsnutzer mit gespeicherten Angaben) setzt `App` das Flag still und zeigt nichts. Der Chunk lädt damit einmal für alle, die das Flag noch nicht haben, egal ob etwas gespeichert ist; danach nie wieder.
  - E2E (Test 10) zählt die Requests auf `assets/onboarding/` mit und ohne gespeicherte Merkliste: je genau einer beim ersten Start, keiner beim zweiten.
- `deepLink`: `route.offerId !== undefined || route.providerId !== undefined`. Vorschauseiten (`a/<id>/`, `p/<publicId>/`) und `404.html` leiten auf diese Parameter um. Mit Deep-Link kommt zuerst der Inhalt. In derselben Sitzung kommt kein Onboarding mehr. Beim nächsten normalen Start erscheint es, sofern bis dahin nichts gespeichert wurde (dann ist man Bestandsnutzer).
- Entschieden wird **synchron** im `useState`-Initializer von `App` (localStorage-Lesen, kein Inline-Skript). Ist das Gate nicht `"nichts"`, startet dort sofort `preloadOnboarding()`, parallel zum Frühstart von `site.json`; bei `"still-erledigt"` setzt ein Effekt das Flag.
- Als erledigt gilt das Onboarding nach „Überspringen“, nach Esc/Zurück (E3) und nach dem letzten Schritt. Nicht erledigt ist es nach dem Schließen des Tabs mitten im Flow oder nach „Später“ bei nicht ladbarem Chunk (E3). Danach erscheint es nie wieder automatisch.
- Bestandsnutzer mit Geburtsdatum, Startpunkt, Merkliste, gemerkten Anbietern oder gewählter Darstellung sehen es nie automatisch. Wer bisher nichts gespeichert hat, sieht es nach dem Deploy einmal (gewollt).
- iPhone-App (standalone) hat einen eigenen Speicher. Dort ist nichts gespeichert, also läuft das Onboarding erneut, ohne Installationsteil (E1).

### E3 – Darstellung: Vollbild-`<dialog>`, Laden, Zurück-Geste, Fokus

- Der Lader `src/ui/Onboarding.tsx` (Start) rendert zwei Dinge:
  - `<div className="onb-cover" aria-hidden="true" />`: fest, `inset: 0`, Hintergrund `--bg` mit Punkten. Er ist schon im ersten Frame da, bevor der `useEffect` von `Dialog` `showModal()` ruft. So blitzt die Liste bzw. ihr Ladezustand nicht auf. CSS im Start (`dialog.css`, ≈ 0,1 kB).
  - `<Dialog open label="Einführung" className="onb" toast={NO_TOAST} onClose={() => onEnd("abbruch")}>`. Inhalt:
    - Laden (Onboarding-Chunk oder Daten noch nicht da): `<div className="onb-pending" aria-busy="true">` mit leerer Bühne in Höhe der echten **und schon der Kopfzeile mit „Überspringen“** (`.onb-topbar`, `.onb-skip`; Review H5). Diese drei Klassen stehen im Start-CSS (`dialog.css`), nicht in der Chunk-CSS. So gibt es auch auf dem iPhone ohne Zurück-Geste immer einen Ausweg.
    - Fehler des Onboarding-Chunks: `LoadFailed className="lazy-note"` mit „Die Einführung konnte nicht geladen werden.“ und daneben `<button className="btn">Später</button>` → `onEnd("spaeter")`. Das Flag wird dann nicht gesetzt.
    - Fehler nur des App-Teils (`loadAppStep`): Der Flow läuft ohne den Schritt „App“ (`onboardingSteps` bekommt dann `install: "keine"`, `push: "nein"`; Review H5). Bis App-Teil, Chunk und Daten feststehen, bleibt `onb-pending` mit Kopfzeile stehen (E1).
    - Geladen: `<OnboardingFlow …/>`.
- **Fokus am Ende (Review H4)**: `Dialog` wird mit dem Ende ausgehängt, `fallbackFocus` greift dann nicht. `endOnboarding` setzt deshalb den Modus per `flushSync` auf `"aus"` (Cover und Dialog verschwinden im selben Commit) und ruft danach `statusLine.current?.focus({ preventScroll: true })`.
- `.dlg.onb` im Start-CSS wie `.detail`: `position: fixed; inset: 0; width: 100%; height: 100%; overflow-y: auto`, ohne Slide-Animation. Den Rest bringt die Chunk-CSS.
- **Esc und Android-Zurück** (`cancel`) behandelt das Onboarding wie „Überspringen“ (erledigt). Begründung:
  - Ein zurückgehaltenes `cancel` (Schritt zurück) unterläuft Chromes CloseWatcher-Regel. Ohne neue Nutzeraktivierung schließt der Browser dann ohne `cancel`, und React hielte den Dialog für offen.
  - Wer zurück will, will raus. Was er schon eingetragen hat, bleibt.
- Kein History-Eintrag. Die URL ändert das Onboarding nur über den Filter (`wegzeit=`, E7), sonst nicht.
- **Fokus und Ansage**: Die Überschrift ist `<h2 tabIndex={-1}>` mit vorangestelltem `<span className="sr-only">Schritt 2 von 4: </span>`.
  - `showModal()` läuft, solange nur `onb-pending` im Dialog steht; ein später gesetztes `autofocus` wertet der Browser nicht mehr aus (Review H3). Deshalb fokussiert der Flow die Überschrift **per Effekt beim Mounten und bei jedem Schrittwechsel** (`heading.focus({ preventScroll: true })`, dazu `scrollTop = 0` des Dialogs). Kein `markAutofocus`.
  - Ist der Chunk schon geladen (Modus `manuell`), montiert der Flow im selben Commit wie `Dialog`; Kind-Effekte laufen vor `showModal()`. Deshalb trägt die aktuelle Überschrift **zusätzlich** `markAutofocus`, und `<Onboarding>` steht im Baum nach `<Overlays>` (das Kind-Sheet schließt im selben Commit). Test 11 prüft den Fokus (Review 2, M-1).
  - Das Lesen der fokussierten Überschrift ist die Ansage, eine zusätzliche Live-Region gibt es nicht.
  - Die Fortschrittspunkte sind `aria-hidden`.
  - Verschwindet ein fokussierter Knopf (Installationsknopf nach dem Tipp), geht der Fokus auf die Überschrift.
- **Querformat und kleine Höhen**: Der Dialog scrollt. Bühne `height: clamp(180px, 42dvh, 318px)`, Illustration mit `aspect-ratio: 320/300` und `height: calc(100% - 59px)`. Ab Desktop-Breite Inhaltsspalte `max-width: 34rem; margin-inline: auto`, Bühne voll breit.
- Safe Area: `padding-top: env(safe-area-inset-top)` in der Bühne, `padding-bottom: env(safe-area-inset-bottom)` im Fuß, `padding-inline: env(safe-area-inset-left) env(safe-area-inset-right)` am Dialog wie `.detail` (`dialog.css:27`; Review L2).

### E4 – Schichten, Lazy-Kette, Abhängigkeiten

| Datei | Schicht/Chunk | Inhalt |
|---|---|---|
| `src/domain/onboarding-gate.ts` | Start | `onboardingGate` |
| `src/domain/onboarding.ts` | nur Chunk `assets/onboarding/` | Schritte, `appStepParts`, Städte, Texte, Alterstipp, Labels (E1, E5–E10) |
| `src/data/preferences.ts` | Start | E2 |
| `src/data/push.ts` | Chunk `assets/app/` | `pushCapability`, Zeitlimit für `ready` (E8) |
| `src/ui/Onboarding.tsx` | Start, Lader | `preloadOnboarding()`, `Onboarding(props: OnboardingProps)`, `useLazy(loadOnboarding, () => loaded)` |
| `src/ui/onboarding-types.ts` | Start (nur Typen) | `OnboardingProps`, `OnboardingEnd = "fertig" \| "abbruch" \| "spaeter"`, `AppStepProps` |
| `src/domain/pwa.ts` | Start (Typen) | `PushCapability`; **`InstallApi` als Interface hierher verschoben** (Review H2): `app-data-only-lazy` verbietet aus `src/ui` auch Typ-Importe aus `src/data/pwa.ts` (`tsPreCompilationDeps: true`). `src/data/pwa.ts` implementiert es (`export const install: InstallApi`) und importiert den Typ aus der Domäne; `AppSection.tsx` und `onboarding-types.ts` importieren ihn von dort. |
| `src/ui/birth-date-input.ts` | Start | Hook aus dem Kind-Sheet (E6) |
| `src/ui/onboarding/OnboardingFlow.tsx` | Chunk `assets/onboarding/` (Einstieg) | Rahmen, Kopf, Fuß, Schrittwechsel, `import "./onboarding.css"` |
| `src/ui/onboarding/steps.tsx` | Chunk | `CityStep`, `AgeStep`, `WayStep` |
| `src/ui/onboarding/art.tsx` | Chunk | `CastleArt`, `RulerArt`, `TramArt`, `PhoneArt` |
| `src/ui/onboarding/onboarding.css` | Chunk-CSS | Layout aus dem Mockup (E11) |
| `src/ui/app-extras/AppSection.tsx` | Chunk `assets/app/` | zusätzlich `export function AppStep(props: AppStepProps)` und `export { pushCapability } from "../../data/push.ts"` |
| `src/ui/app-extras/use-push-switch.ts` | Chunk `assets/app/` | Hook aus `PushControls` (E8) |
| `src/ui/AppExtras.tsx` | Start, Lader | zusätzlich `loadAppStep(): Promise<{ AppStep; install: InstallApi; pushCapability: () => PushCapability }>`; teilt den Ladevorgang mit `loadExtras` (ein `Promise.all` über `AppSection.tsx` und `pwa.ts`) |

Regeln:
- **Kein statischer Import zwischen zwei Lazy-Chunks.** Der Onboarding-Lader holt beide Chunks parallel und reicht `AppStep`, `install` und `pushCapability()` als Props in den Flow (Muster `install` aus ADR 0013).
- Der Onboarding-Chunk importiert nichts, was nur `assets/app/` importiert. Typen sind frei.
- Start-Module (`Icon`, `plural`, `originHint`, `limitReason`, `DISTRICTS`, `time.ts`, `age.ts`, `agenda.ts`, `provider-count.ts`, `Chip`/`REACH_CHIPS` nicht, siehe E7) darf er importieren. Jeder solche Import wird ein Export des Einstiegs (Bytes zählen, E13).
- **Ladezeitpunkt**: Bei jedem Gate ≠ `"nichts"` (also auch bei `"still-erledigt"`) lädt `preloadOnboarding()` den Onboarding-Chunk **und** `AppSection`+`pwa.ts` gleich beim Start. Sonst verriete der frühe Request auf `assets/app/`, dass nichts gespeichert ist (Review 2, M-2). Das ist nur das Modul. `start()` (Registrierung, Frische) bleibt nach `load` in `pwa-start.ts`.
  - ADR 0013, Punkt 5 bleibt in der Sache erfüllt: Der Kern ist nicht im Start-Bundle, die Registrierung kommt nach `load`. Heute lädt ihn auch ein früh geöffnetes Kind-Sheet.
  - Vorteil: `beforeinstallprompt` wird früher gehört.
- **`vite.config.ts`**:
  - `const ONBOARDING = "assets/onboarding/[name]-[hash]"`, `isOnboardingModule = /\/src\/ui\/onboarding\/|\/src\/domain\/onboarding\.ts$/`.
  - In `chunkFileNames` nach `isAppExtrasModule` einreihen: Ein versehentlich geteilter Chunk mit Push-Code landet sichtbar in `app/`.
  - `assetFileNames`: `asset.names.some((n) => /^OnboardingFlow\b/.test(n))` → `${ONBOARDING}[extname]`.
- **`.size-limit.json`**:
  - `{ "name": "Onboarding JS (lazy)", "path": "dist/assets/onboarding/*.js", "limit": "9 kB", "gzip": true }`
  - `{ "name": "Onboarding CSS (lazy)", "path": "dist/assets/onboarding/*.css", "limit": "3 kB", "gzip": true }`
  - Nach S5 auf Messwert + ≈ 1 kB bzw. + 0,5 kB setzen (Begründung im Commit).
- **Chunk-Wächter**: `strayStartChunks` in `scripts/lib/chunks.ts` meldet zusätzlich jede `.css` direkt in `dist/assets/` außer genau einer `index-*.css`. Die Funktion bekommt einen zweiten Rückgabeteil bzw. wird zu `strayStartFiles`. Sonst zählte eine falsch abgelegte Chunk-CSS still ins 15-kB-Budget.
- **`.dependency-cruiser.cjs`** (Kommentare wie bei `anbieter-*`):
  - `onboarding-ui-only-lazy`: `^src/` außer `^src/ui/onboarding/` → `^src/ui/onboarding/` nur `dynamic-import`.
  - `onboarding-ui-entry-only`: nur `^src/ui/Onboarding\.tsx$` greift auf `^src/ui/onboarding/` zu.
  - `onboarding-domain-only-lazy`: `^src/domain/onboarding\.ts$` zur Laufzeit nur aus `^src/ui/onboarding/` und dem eigenen Test; Typ-Importe aus `^src/ui/(app-extras/|onboarding-types\.ts$)` erlaubt (`dependencyTypesNot: ["type-only"]`).
  - `onboarding-apart-from-app`: `^src/ui/onboarding/` **und `^src/domain/onboarding\.ts$`** → `^src/(data/(pwa|push|device-store|searches-store)|domain/(pwa|searches|stored-origin))\.ts$` nur `type-only` (Review M2: ein Laufzeit-Import von `domain/pwa.ts` aus der Onboarding-Domäne erzeugte einen geteilten Chunk in `assets/`).
- **`scripts/check-architecture.ts`**, `LAZY_LOADERS`: `["src/ui/Onboarding.tsx", "./onboarding/"]`. `AppExtras.tsx` → `./app-extras/` und `../data/pwa.ts` gibt es schon.
- Biome: Der Flow braucht keine Geräte-Globals (`navigator` usw.). Die Feature-Erkennung läuft in `push.ts`.

### E5 – Schritt „Stadt“: Kacheln aus den Regionen, nichts gespeichert

- `Region` bekommt `population: number` (Einwohner, auf Tausend gerundet; Quelle und Stichtag im Kommentar, beim Umsetzen beim Bayerischen Landesamt für Statistik nachschlagen, nie schätzen). `REGIONS.nuernberg.population` wird gesetzt, `regions.test.ts` prüft `population > 0`.
  - Keine Schemaänderung: `schema.ts` liest nur `REGION_IDS` und `bbox`, `schema/*.json` bleibt gleich.
  - Das weicht von ADR 0025, Punkt 1 ab (Feld vor der zweiten Region). Der Nachtrag in ADR 0025 nennt das offen: Nutzerwunsch „sortiert nach den größten Städten“ (abgelehntes Review-L6); der Kopfkommentar von `regions.ts` wird mitgeändert (Arch-Review m1).
- `cityChoices<K extends string>(regions: Readonly<Record<K, Region>>, maxTiles = 4): { tiles: { id: K; name: string }[]; more: { id: K; name: string }[] }` (generisch, damit der Test sechs Fake-Regionen ohne Cast nutzt): absteigend nach `population`, Gleichstand nach `name` (`localeCompare(…, "de")`), die ersten `maxTiles` als Kacheln, der Rest im Dropdown.
- Heute eine Kachel „Nürnberg“, `aria-pressed="true"`, kein Dropdown (`more.length === 0` → nicht gerendert). Kacheln stehen in `role="group" aria-label="Stadt"`, das Dropdown hat `aria-label="Weitere Städte"` mit Leer-Option „Weitere Städte …“.
- **Nichts speichern**, solange es eine Region gibt. Die Wahl lebt nur im Zustand des Flows. Speichern kommt mit der zweiten Region und deren Daten (`docs/ideas.md`).
- Lead aus echten Daten: `welcomeStats(offers, now): { offers: number; providers: number }` zählt Angebote mit `nextSession(o, now) !== undefined` und `countProviders` darüber. Text siehe E10, exakte Zahlen statt „über 70“, wie die Statuszeile.
- Der Flow rendert erst, wenn die Daten geladen oder gescheitert sind (`dataSettled`). Bis dahin bleibt der Platzhalter, der Text springt also nicht. Bei Ladefehler steht der Lead ohne Zahlen.

### E6 – Schritt „Alter“: dieselbe Speicherung wie das Kind-Sheet

- Neuer Hook `src/ui/birth-date-input.ts`, aus `KidSheet` extrahiert, ohne Verhaltensänderung dort:
  ```ts
  export const BIRTH_DATE_INVALID = "Bitte als TT.MM.JJJJ eingeben, z. B. 02.11.2025.";
  export function useBirthDateInput(birthDate: string | undefined, today: string, onBirthDate: (iso: string | undefined) => void):
    { text: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; onBlur: () => void; parsed: string | undefined; invalid: boolean };
  ```
- Der Flow bekommt `onBirthDate` = `App.setBirthDate`. Gesetzt werden damit `zwergenplan.geburtsdatum` und der Altersfilter („Nur passende“) wieder an, genau wie im Kind-Sheet.
- Feld: `<label class="lbl" for>Geburtsdatum</label>`, `input.input` mit `inputMode="numeric"`, `autoComplete="off"`, `placeholder="TT.MM.JJJJ"` und `aria-describedby` auf den Hinweis.
  - Leer: `p.small` „Bleibt nur auf diesem Gerät.“
  - Gültig: `p.hint.ok` mit `ageHint` (E10).
  - Ungültig und nicht leer: `p.hint.bad` mit `BIRTH_DATE_INVALID`.
- **Alterstipp** (rein, `onboarding.ts`):
  - `dateAtAge(birthDate: string, months: number): string` (ISO). Am Monatsende wird geklemmt wie in `ageInMonths`. Es gilt `ageInMonths(b, dateAtAge(b, m)) === m` und für den Vortag `m - 1`.
  - `nextAgeStep(offers, birthDate, now): { months: number; from: string } | undefined`: kleinste `age.minMonths` > aktuelles Alter unter den regelmäßigen Angeboten mit mindestens einem passenden kommenden Termin (`fittingSessions`), `from = dateAtAge(birthDate, months)`.
  - Ohne Treffer gibt es den einfachen Text. Das ist sauber ableitbar, weil die Liste ein solches Angebot nach Plan 0028 an seinen ersten passenden Termin stellt.
- **Weiter** mit ungültigem, nicht leerem Text geht nicht weiter, sondern fokussiert das Feld (der Hinweis steht schon da). „Später“ geht immer weiter und verwirft nichts.

### E7 – Schritt „Weg“: Startpunkt und Wegzeit-Grenze

- Sobald der Schritt aktuell wird, ruft der Flow `onOriginSurface()` (= `want()`). Damit ist der Schritt eine weitere Startpunkt-Oberfläche wie Kind-Sheet und Karte. Der Request hängt am Anzeigen, nie an der Wahl. Die Invariante gilt unverändert, `docs/architecture.md` nennt den Schritt.
- Zeile `.onb-row` (`flex-wrap`):
  - Knopf `btn` mit Kompass-Icon, nur wenn `origin.canLocate`. Beschriftung „Standort“, beim Suchen „Suche …“ (`aria-busy`, kein `disabled`, wie `OriginPicker`), bei `origin.source === "standort"` „Gefunden“ mit Klasse `on`.
  - Stadtteil-`<select class="input">` mit `aria-label="Stadtteil"`, Leer-Option „Stadtteil …“ (`disabled`), Optionen `DISTRICTS`, `value={origin?.districtId ?? ""}`, `onChange` → `setDistrict`.
  - Es gilt höchstens ein Startpunkt (ADR 0017), die Logik bleibt in `useOrigin`.
- Darunter eine eigene `aria-live="polite"`-Region mit `originHint(problem, origin, reachMode)`.
- Label „Höchstens unterwegs“, Chips `LIMIT_CHOICES` (domain: `[{label:"20 Min.",limit:{kind:"minuten",value:20}}, …30, …45, {label:"Egal",limit:undefined}]`).
  - `aria-pressed` folgt `reachLimit`; ohne Grenze ist „Egal“ gedrückt.
  - Tipp → `onReachLimit(limit)` → `setFilter(withReachLimit(route.filter, limit))`, also URL `wegzeit=`.
  - Wie im Filter-Sheet sind die Minuten-Chips `disabled`, solange `limitReason(reachMode)` einen Grund liefert. Der Grund steht als `p.small` darunter. „Egal“ bleibt immer bedienbar.
  - `REACH_CHIPS` aus `Sheets.tsx` wird nicht wiederverwendet: andere Beschriftung („bis 20 Min.“) und nicht exportiert.
- `p.small`: „Bleibt nur auf diesem Gerät. Stadtteile: © OpenStreetMap-Mitwirkende.“ (Namensnennung wie `OriginPicker`).

### E8 – Schritt „App“: Installation und Samstags-Nachricht ohne Duplikat

- `AppStep({ install, parts, heading }: AppStepProps)` in `AppSection.tsx`. Texte der Installation aus `src/domain/pwa.ts`, neue Texte in `push-texts.ts` (`APP_STEP_TEXTS`):
  - `knopf`: `btn primary wide` „Zum Startbildschirm hinzufügen“ (`installFoot("angebot").button`) → `install.prompt()`.
  - `installiert`: `p.hint.ok` „Geschafft! Liegt jetzt auf dem Startbildschirm.“ Verschwindet der Knopf mit dem Fokus, geht der Fokus auf `heading`.
  - `menue`: `p` mit `installHelp("menue").text`.
  - `ios`: `p.onb-note` mit `installHelp("ios")` (`ShareIcon` wie `AppSection`) und `p.small` „Auf dem iPhone kommt die Samstags-Nachricht nur in der installierten App. Darum frage ich das hier als Erstes. Die App hat einen eigenen Speicher und fragt dort noch einmal nach.“
  - `schalter`: `.swrow` mit `b` „Samstags-Nachricht“ und `small` (aus: „Aus. Jederzeit änderbar.“, an: „An. Die erste kommt am Samstag.“, beim Schalten „Wird eingeschaltet …“/„Wird ausgeschaltet …“), dazu `button.switch role="switch"` wie `PushControls` und `p role="status" class="small"` für Ergebnisse (`problemText`, an/aus).
  - `verweigert`: `p.small` mit `PUSH_TEXTS.denied`.
- **Hook** `usePushSwitch(push: PushApi, opts: { reconcile: boolean }): { on: boolean | undefined; busy: "an" | "aus" | undefined; result: { kind: "an" | "aus" | PushProblem; seq: number } | undefined; toggle: () => void }`:
  - `reconcile: true` (Kind-Sheet): heutiges Verhalten, also Abgleich beim Mount und Spiegeln nach jedem Rendern bei `on`.
  - `reconcile: false` (Onboarding): nur `push.subscription()` (lokal, kein Request) für den Anfangszustand, kein Abgleich, kein laufendes Spiegeln. `enable(mirrorData())` spiegelt einmal beim Einschalten. Requests entstehen also nur nach dem Tipp (ADR 0014, Punkt 4 unverändert).
  - `mirrorData()` zieht mit in den Hook-Modul.
  - Texte macht jede Oberfläche selbst aus `result`; `seq` sorgt dafür, dass ein wiederholtes Ergebnis erneut angesagt wird.
  - `PushControls` nutzt den Hook ohne sichtbare Änderung (`e2e/push.spec.ts` bleibt grün).
- **`src/data/push.ts`**:
  - `PushEnv.hasServiceWorker: boolean` (browserEnv: `navigator.serviceWorker !== undefined`).
  - `export function pushCapability(env = browserEnv()): PushCapability`: kein Service Worker, kein `PushManager` oder kein `Notification` → `nein`, `denied` → `verweigert`, sonst `ja`. Ohne Registrierung: Beim Erstbesuch kommt sie erst nach `load`, `support()` sagte dann `kein-sw`.
  - Im Onboarding zählt `kein-sw` bei `ja` als einschaltbar. `enable` wartet ohnehin auf `ready`.
  - `pushCapability` liefert `nein`, wenn der Notausgang aktiv ist (`__SW_OFF__`): Dort gibt es nie einen Service Worker, eine Erlaubnisfrage brächte nichts (Review M1).
  - Zeitlimit (Review M1): Beim Erstbesuch kann die Installation des Service Workers auf langsamem Netz (Start-JS und `site.json` in den Cache) länger als 10 s dauern; ein festes Zeitlimit träfe dann echte Nutzer. Direkt nach `load` gibt es beim Erstbesuch noch keine Registrierung (`pwa-start.ts:20–21` importiert erst, dann `start()` → `register()`), ein Blick auf `getRegistration()` träfe also genau den langsamen Erstbesuch (Review 2, M-3). Deshalb (Arch-Review M1, m5): `start()` setzt ein **eigenes** Attribut `document.documentElement.dataset.sw = "aus"`, wenn es **ohne** Registrierung endet (Notausgang, `register()` gescheitert oder blockiert). `data-pwa` behält allein die Bedeutung „bereit“ (darauf warten `installieren.spec.ts:44`, `push.spec.ts:445`, `pwa.spec.ts:215, 252, 306`). `PushEnv.swGivenUp(): Promise<void>` löst auf, sobald `data-sw="aus"` steht (sofort, wenn es schon steht, sonst per `MutationObserver` auf das Attribut). `enable` wartet auf `Promise.race([ready, swGivenUp().then(() => { throw new PushError("abo") })])`. Ein festes Zeitlimit gibt es nicht. Der Kanal `pwa.ts` → `push.ts` über `data-sw` steht in `docs/architecture.md` (App-Extras), `start()` bekommt einen Unit-Test dafür.

### E9 – Knöpfe und Abschluss

- `primaryLabel(index, total, finish: { count: number; pending: boolean }): string`:
  - `index === 0` → „Los geht's“
  - letzter Schritt → `finishLabel`: `pending` → „Zeig mir die Angebote“, `0` → „Zur Liste“, `1` → „Zeig mir das eine Angebot“, sonst „Zeig mir die {n} Angebote“
  - sonst „Weiter“
- `count` = `visible.length` aus `App` (live nach Alter und wirksamer Grenze). `pending` = `listPending` (Grenze gesetzt, Wegzeit lädt).
- „Später“ (`button.later`) gibt es auf jedem Schritt außer dem ersten (Mockup). Er überspringt nur diesen Schritt und verwirft nichts. Auf dem letzten Schritt beendet er wie der Hauptknopf.
- „Überspringen“ (oben, jeder Schritt) → `onEnd("abbruch")`.
- Ende (`onEnd("fertig")`): Flag setzen, Dialog schließen und Tab „Angebote“ (`replace({ ...route, tab: "entdecken" })`) **in einem `flushSync`**, dann `scrollTo(0)`. Fokusziel `statusLine.current ?? activeTab.current` (die Statuszeile fehlt beim Laden und beim Ladefehler; Review 2). Der Fokus geht danach ausdrücklich auf die Statuszeile, die die Zahl ansagt (E3, Review H4).
- `App`:
  - `type OnboardingMode = "aus" | "auto" | "manuell"`
  - `endOnboarding(kind: OnboardingEnd)`: außer bei `spaeter` `saveOnboardingDone()`, dann `"aus"`, bei `fertig` Tab-Wechsel.
  - `dialogOpen` schließt das Onboarding ein (Seiten-Toast schweigt).

### E10 – Texte (in `src/domain/onboarding.ts`, `ONBOARDING_TEXTS` bzw. Funktionen)

| Schritt | Kicker | Überschrift | Lead |
|---|---|---|---|
| stadt | Willkommen | Alles für Kinder unter 3 an einem Ort | `{offers} Babykurse, Krabbelgruppen, Konzerte und Ausflüge von {providers} Anbietern.`, ohne Daten oder bei `offers === 0`: „Babykurse, Krabbelgruppen, Konzerte und Ausflüge an einem Ort.“ |
| alter | Passt zum Alter | Nur, was zu deinem Zwerg passt | Auch bei regelmäßigen Treffs prüfe ich jeden einzelnen Termin. |
| weg | Gut erreichbar | Nur, was ihr mit Bus und Bahn schafft | Fahrzeit nach echtem VGN-Fahrplan, mit höchstens einem Umstieg. |
| app (Installation + Push) | Immer griffbereit | Ein Tipp, und ich bin da | Auf dem Startbildschirm wie eine App. Und samstags gegen 10 Uhr eine Nachricht, was es Neues für euch gibt. |
| app (nur Installation) | Immer griffbereit | Ein Tipp, und ich bin da | Auf dem Startbildschirm wie eine App, mit eigenem Symbol und ohne Browserleiste. |
| app (nur Push) | Samstags-Nachricht | Neues kommt von selbst | Samstags gegen 10 Uhr eine Nachricht, was es Neues für euch gibt. |

- `stepText(step: StepId, ctx: { stats?: {offers; providers}; app?: AppStepParts }): { kicker: string; title: string; lead: string }`.
- Labels: „Eure Stadt“, „Geburtsdatum“, „Höchstens unterwegs“.
- `ageHint(months: number, next?: { months: number; from: string }): string`:
  - `0` → „Neugeboren!“, sonst `plural(months, "Monat", "Monate") + "!"`
  - Mit `next` folgt „ Treffs ab {next.months} Monaten zeige ich dir mit Terminen ab dem {T.M.}.“ (Datum wie `dayDots`, ohne führende Null), sonst „ Ab jetzt siehst du nur, was passt.“
  - `plural` zieht von `src/ui/format.ts` nach `src/domain/labels.ts` um; `format.ts` exportiert es weiter (keine zweite Kopie; Arch-Review m4).

### E11 – Gestaltung (Chunk-CSS `onboarding.css`, alles in `@layer components`)

- Aus dem Mockup übernommen, Präfix `onb-` (auch Keyframes: `onb-artin`, `onb-float`, `onb-swing`, `onb-drive`, `onb-plop`):
  - **Alle Schriftgrößen in rem** (Mockup nutzt px; `src/ui/**/*.css` hat keine px-Schriftgrößen, und `setTextScale` skaliert nur `html { font-size }`; Review 2, M-4). Test 13 prüft, dass sich die berechnete Größe von `.onb-title` bei Faktor 2 verdoppelt.
  - `.onb-stage` (`--k`-Bühne mit Punkten, Rand unten 3px `#13212E`, Ellipsen-Radius)
  - `.onb-topbar`, `.onb-dots i(.on|.done)`, `.onb-skip` (min-height 44px)
  - `.onb-art`, `.onb-kicker`, `.onb-title` (1.8125rem = 29 px, `line-height:1.04`, `hyphens:auto`), `.onb-lead`, `.onb-data`, `.lbl`
  - `.onb-tiles`/`.onb-tile` mit `.dot` und den Farben `c1–c4`, `.onb-foot` (`margin-top:auto`), `.later`, `.onb-note` (gestrichelt, ohne Fläche)
  - Bühnenfarben: `.onb-k-stadt{--k:#ffd93b}` `.onb-k-alter{--k:#ff8cc0}` `.onb-k-weg{--k:#5cb8ff}` `.onb-k-app{--k:#b99cff}`
- Vorhandene Start-Klassen werden genutzt: `.btn`, `.btn.primary`, `.btn.wide`, `.chip`, `.input`, `.select`, `.hint.ok/.bad`, `.swrow`, `.switch`, `.track`, `.knob`, `.share`, `.small`.
- `--mix`: `100%` hell, **`80%`** dunkel, in **beiden** Dunkel-Blöcken (`@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .onb{…}}` und `:root[data-theme="dark"] .onb{…}`). Bühne `background-color: color-mix(in srgb, var(--k) var(--mix), #0e1620)`.
- Gewählte Kachel und Chip nutzen `--sel`/`--on-sel` (Gate „helle Inseln“), nicht `--ink`.
- 320 px/200 %:
  - Kacheln `grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr))`
  - Chips `display:flex; flex-wrap:wrap`, je `flex: 1 1 4.5rem`
  - Zeile Standort/Stadtteil `flex-wrap`
  - `.onb .btn.wide { white-space: normal; text-wrap: balance }`, „Zeig mir die 123 Angebote“ bricht so um.
  - Keine Viewport-Media-Query für Schriftgröße.
- Illustrationen: die vier SVGs aus dem Mockup, wörtlich in JSX übertragen:
  - `class` → `className`, `stroke-dasharray` → `strokeDasharray`, `text-anchor` → `textAnchor`, `font-size` → `fontSize`, `clip-path` → `clipPath`, Inline-`style` als Objekt.
  - `clipPath id` per `useId()`.
  - Alle `aria-hidden="true" focusable="false"`.
  - **Helle Flächen im Dunkelmodus (Arch-Review M3)**: Die hellen Füllungen (`#FFFFFF`, `#E8F1FF`: Handy, Karten, Kalender, Fenster, Häuser, Benachrichtigung) setzen die SVGs über CSS-Variablen `--onb-paper` (hell `#ffffff`) und `--onb-screen` (hell `#e8f1ff`), im Dunkelmodus in **beiden** Dunkel-Blöcken `#2b3a49` bzw. `#1b2733`. Text darauf (`.onb-st`) nutzt `--onb-ink` (hell `#13212e`, dunkel `#eef3f8`); Konturen bleiben `#13212e`. Das Gate `expectNoBrightIslands` überspringt SVG; die Sichtprüfung im `/browser-review` deckt die Illustrationen ab (eigene Checklistenzeile).
  - Text in den SVGs (`.onb-st { font-family: var(--font-display); font-weight: 800; fill:#13212e }`).
  - **Text im SVG ist hier vertretbar**: Er ist rein dekorativ und für Hilfstechnik verborgen, der Inhalt steht im HTML-Text. Er skaliert nicht mit der Schriftgröße, kann also bei 200 % nichts sprengen. Die Gates `expectTextFits`/Inseln überspringen SVG ausdrücklich. Bewertet beim Browser-Review.
  - Pro Schritt nur eine Illustration im DOM (`key={step}` für die Einflug-Animation).
- Bewegung: Endlos-Animationen (`onb-float` usw.) und Einflug fallen bei `prefers-reduced-motion` über `motion.css` weg. Kein Code hört auf `animationend`.

### E12 – Erneut aufrufen: Link im Kind-Sheet

- `KidSheet` bekommt `onIntro: () => void`. Am Ende von `.sheet-scroll`, nach `extras.section`, steht `<p className="small">Alles noch einmal erklärt? <button type="button" className="linkbtn" onClick={onIntro}>Einführung ansehen</button></p>`. `.linkbtn` hat ohnehin 44 px Höhe (`list.css:61–62`).
- `Overlays` reicht `onIntro` durch. `App`: `setSheet(null); setOnboarding("manuell")`.
- Im Modus `manuell` sind alle Eingaben mit den aktuellen Werten vorbelegt (sie hängen am App-Zustand). Das Ende setzt das Flag ebenfalls.

### E13 – Budget

- Start-JS, geschätzt +0,7 bis +0,9 kB:
  - `App.tsx` ≈ 0,25 kB
  - Lader ≈ 0,25 kB
  - `preferences` + Gate ≈ 0,1 kB
  - Kind-Sheet-Link ≈ 0,06 kB
  - `loadAppStep` ≈ 0,06 kB
  - Einstiegs-Exporte und `__vite__mapDeps` für die Chunk-CSS ≈ 0,15 kB; der Vite-Preload-Helfer liegt laut altem `dist/` schon im Einstieg
- **Rest bis 100 kB ≈ 0,72 kB, das reicht vermutlich nicht → N1.** Gemessen wird in S4 mit einem realistischen Stub (ADR 0012: nutzt `Icon`, `plural`, `DISTRICTS`, `time.ts`). Die Zeile kommt in die Delta-Tabelle von ADR 0012.
- Start-CSS +≈ 0,15 kB (`.dlg.onb`, `.onb-cover`, `.onb-pending`). `App-Extras JS (lazy)` +≈ 0,5 kB (`AppStep`, Hook); bei Überschreiten 7,1 → 7,6 kB mit Begründung.

### E14 – ADR-Prüfung: kein neues ADR, drei Nachträge

- Neuer localStorage-Schlüssel: ein Flag ohne Personenbezug. Die Privatsphäre-Invariante bleibt gewahrt, weil das Vorladen nur am Flag und am Deep-Link hängt, nicht an gespeicherten Angaben (E2, Review H1). Nachweis in `docs/architecture.md` (Liste der Schlüssel) und E2E Test 10.
- Neue Lazy-Kette: nach dem Muster aus ADR 0012/Plan 0010 (Ordner, Budget, Regeln, Lader). Kein ADR nötig, Plan 0010 und 0011 haben es ebenso gemacht.
- `REGIONS.population`: Nachtrag in ADR 0025, der die Abweichung von Punkt 1 offen nennt (E5).
- Wegzeit-Anlass „Onboarding-Schritt Weg“: Er fällt unter „beim Öffnen einer Startpunkt-Oberfläche“ (ADR 0011, Punkt 6), so wie Plan 0025 die Merklisten-Karte ergänzt hat. Der Text steht in `docs/architecture.md`.
- Push-Schalter im Onboarding: Requests nur nach Tipp, kein Abgleich, kein laufendes Spiegeln. ADR 0014 bleibt in der Sache gleich, ein Nachtrag stellt klar, dass der Schalter auch im Onboarding steht.
- Früheres Laden des PWA-Kern-Moduls (E4): Das Arch-Review (M2) wertet es als Abweichung von ADR 0013, Punkt 5 („Auch dieser Kern lädt lazy nach `load`“). Deshalb **neues ADR 0027 „App-Chunk beim Erststart vorladen“** (Nummer vor dem Anlegen erneut prüfen, auch Remote-Branches): Begründung Privatsphäre (E2, beide Chunks bei jedem Gate ≠ „nichts“) und früheres `beforeinstallprompt`; Folge Bandbreite neben `site.json`, Nachweis Test 14. ADR 0013 bekommt einen Verweis darauf. Veraltete Stellen: `docs/architecture.md` (PWA-Kern „nach `load`“), Kommentar `src/data/pwa.ts:296–299`.
- Kein drittes Inline-Skript in `index.html`.

### E15 – E2E-Basis

- `e2e/fixtures.ts`: neue Option `onboarding: ["erledigt" | "neu", { option: true }]`, Standard `"erledigt"`, und eine Auto-Fixture `onboardingGate`:
  ```ts
  if (onboarding === "erledigt") await context.addInitScript(() => {
    try { if (localStorage.getItem("zwergenplan.einfuehrung") === null) localStorage.setItem("zwergenplan.einfuehrung", "1"); } catch {}
  });
  ```
  Dazu exportiert `export async function skipOnboarding(context: BrowserContext)` dasselbe für selbst gebaute Kontexte.
- `e2e/merkliste-anbieter.spec.ts:230` ruft `skipOnboarding(context)` auf.
- `e2e/startpunkt.spec.ts`: `storedValues` (`:104`) vergleicht den ganzen `localStorage` exakt (`:376, 398, 452, 474`). Es filtert künftig den Schlüssel `zwergenplan.einfuehrung` heraus (Review H7).
- **Push in E2E (Review B1)**: Die Projekte laufen in der Headless-Shell, die Benachrichtigungen immer verweigert (`e2e/push.spec.ts:3–5`). `pushCapability` liefert dort `verweigert`. Tests, die den Schalter brauchen (5, 6, Push-Test), nutzen `test.use({ channel: "chromium" })` wie `push.spec.ts`. Der Fall `verweigert` bekommt einen eigenen Test in der Headless-Shell. Hinweis: `serviceWorkers: "block"` (Standard der Fixtures) blendet den Schalter im Kind-Sheet aus (`kein-sw`), im Onboarding nicht (dort zählt `kein-sw` als einschaltbar, E8).
- Smoke-Specs, `font-swap*`, `perf`, `pwa` nutzen alle `fixtures.ts`. Sie bleiben also ohne Onboarding (LCP-Gates messen weiter die Liste).
- `scripts/screenshots.ts`: Init-Skript mit dem Flag für alle Ansichten. Neue Ansicht `onboarding` mit allen vier Schritten, hell und dunkel; Kopf-Doku der Datei.
- `scripts/og-images.ts`: keine Änderung (rendert nicht die App).

## Abweichungen vom Mockup (begründet)

1. Dunkel `--mix: 80%` statt `72%`. Nachgerechnet: „Überspringen“ (#13212E, 16 px, fett) erreicht auf Pink/Blau/Lila mit 72 % nur 4,39/4,43/4,21 : 1, mit 80 % 5,2/5,2/4,97 : 1. axe wäre sonst rot.
2. Gewählte Kachel und Chip in `--sel` (dunkel gelb) statt `--ink`. `--ink` dunkel (#EEF3F8, Luminanz 0,89) wäre eine helle Insel.
3. iPhone im Browser: kein Schalter, nur der Hinweis. Im Safari-Tab gibt es kein Push.
4. „samstags gegen 10 Uhr“ statt „um 10 Uhr“, wie ADR 0014 und README (Versand per Zeitplan, verspätet möglich).
5. Lead mit exakter Anbieterzahl statt „über 70“, wie die Statuszeile.

## Tests (test-first für Domäne und Daten)

**Unit**
- `src/domain/onboarding-gate.test.ts`: Wahrheitstafel `onboardingGate`.
- `src/domain/onboarding.test.ts`:
  - `appStepParts`/`onboardingSteps`: alle 6 `InstallState` × 3 `PushCapability`, mindestens: `ios` → App an Position 2, ohne Schalter; `angebot` → Knopf, App zuletzt; `app` + `nein` → drei Schritte; `keine` + `ja` → nur Schalter; `keine` + `nein`/`verweigert` → drei Schritte; `menue` + `verweigert` → App mit Menü-Hinweis und `verweigert`.
  - `cityChoices`: mit 1 Region (1 Kachel, `more` leer) und mit 6 Fake-Regionen (4 Kacheln absteigend, Gleichstand nach Name, 2 im Dropdown).
  - `welcomeStats`: beendete Angebote zählen nicht, Anbieter eindeutig.
  - `dateAtAge`: 31.01. + 1 → 28./29.02., Konsistenz mit `ageInMonths` (Tag und Vortag), Schaltjahr.
  - `nextAgeStep`: kein Kandidat, Kandidat ohne passenden Termin ignoriert, kleinstes `minMonths` gewinnt, Kurse ignoriert.
  - `ageHint`: 0, 1, n, mit und ohne `next`.
  - `primaryLabel`/`finishLabel`: alle Zweige.
  - `stepText`: drei App-Varianten, Stadt mit und ohne Daten.
  - `LIMIT_CHOICES` deckt `LIMIT_MINUTES` plus „Egal“ ab.
  - Läuft absichtlich in `America/Los_Angeles`.
- `src/domain/regions.test.ts`: `population > 0`.
- `src/data/preferences.test.ts`: `loadOnboardingDone`/`saveOnboardingDone`; `hasStoredData` je Schlüssel; Flag allein zählt nicht als Angabe; Speicher wirft → `false`.
- `src/data/push.test.ts`: `pushCapability` (ohne SW, ohne PushManager, ohne Notification, `denied`, ok); `enable`: (a) `ready` löst auf → Abo; (b) `swGivenUp` hat schon aufgelöst → sofort `PushError("abo")`; (c) `swGivenUp` löst später auf → dann `PushError("abo")`; (d) keins von beiden → bleibt offen (kein Zeitlimit); Fakes um `hasServiceWorker` ergänzt.
- `scripts/lib/chunks.test.ts`: zusätzliche `.css` direkt in `dist/assets/` ist rot, genau eine `index-*.css` ist grün.

**E2E `e2e/onboarding.spec.ts`** (`test.use({ onboarding: "neu" })`, Fixture-Uhr 5.10.2026)
1. Erster Start (`pixel-7`): Dialog „Einführung“ statt Liste; Reihenfolge Stadt → Alter → Weg → App (Kicker); Fokus auf der Überschrift je Schritt (inkl. „Schritt n von 4“); „Später“ fehlt auf Schritt 1.
2. Stadt: genau eine Kachel „Nürnberg“, `aria-pressed=true`, kein „Weitere Städte“; Lead passt auf `/^\d+ Babykurse, .* von \d+ Anbietern\.$/`, und die Angebotszahl ist gleich der Statuszeile nach „Überspringen“ ohne Filter.
3. Alter: „20.04.2026“ → Hinweis beginnt mit „5 Monate!“, `localStorage` `zwergenplan.geburtsdatum` = `2026-04-20`; „31.02.2026“ + Weiter → bleibt auf dem Schritt, Fokus im Feld, `hint bad`.
4. Weg, Privatsphäre: bis Schritt 3 kein Request auf `wegzeit.json`/`linien.json`; mit Schritt 3 je genau einer; Wahl Gostenhof und Chip „30 Min.“ → keine weiteren; Minuten-Chips gesperrt, bis die Wegzeit da ist; URL enthält danach nur `wegzeit=30`, nie Stadtteil oder Datum.
5. App (`pixel-7`, `channel: "chromium"`): Menü-Hinweis und Schalter „Samstags-Nachricht“ (aus); synthetisches `beforeinstallprompt` nach `data-pwa="bereit"` (Muster `installieren.spec.ts`) → Knopf „Zum Startbildschirm hinzufügen“; kein Request an den Push-Worker ohne Tipp.
6. `desktop` (`channel: "chromium"`): App-Schritt nur mit Schalter (Variante „Neues kommt von selbst“); mit Init-Skript `delete window.PushManager` → drei Schritte, Schritt 3 trägt „Zeig mir die … Angebote“. Headless-Shell (verweigert) auf `desktop`: drei Schritte.
7. `iphone-15`: Reihenfolge Stadt → App → Alter → Weg; App mit iOS-Anleitung, ohne Schalter, mit iPhone-Hinweis.
8. Abschluss: Label „Zeig mir die N Angebote“, N gleich der Zahl der Statuszeile danach; Tab „Angebote“; Fokus auf der Statuszeile; Flag gesetzt; Neuladen → kein Onboarding.
9. „Überspringen“ auf Schritt 2 und Esc auf Schritt 3 → Flag gesetzt, Liste da, Neuladen → keins.
10. Bestandsnutzer: `geburtsdatum` bzw. `merkliste` vorab gesetzt → kein Onboarding, Flag danach gesetzt. Requests auf `assets/onboarding/` und `assets/app/`: beim ersten Start mit und ohne Merkliste je gleich viele, beim zweiten Start keiner (Privatsphäre, E2). Deep-Link `?angebot=<id>` → Detail, kein Onboarding, kein Flag; Neuladen ohne Parameter → Onboarding.
11. Kind-Sheet: „Einführung ansehen“ öffnet es mit vorbelegtem Geburtsdatum; „Überspringen“ schließt.
12. Chunk nicht ladbar (`page.route` bricht `assets/onboarding/*.js` ab, `allowedConsoleErrors` nach dem Muster `e2e/saved.spec.ts:107`): Während des Ladens steht „Überspringen“; danach `LoadFailed` mit „Später“, schließt, Flag bleibt leer. App-Chunk nicht ladbar: drei Schritte ohne „App“.
13. Mobile-UX je Schritt (Schalter- und Knopf-Variante zusätzlich in Test 5 mit `channel: "chromium"`: `expectMobileUx` hell und dunkel, 320 px/200 %; Review 2, M-5): `expectMobileUx` hell, dunkel per `colorScheme` und per `data-theme="dark"`, `expectNoBrightIslands`; 320 px mit 200 % (`setTextScale`, `expectNoHorizontalScroll`, `expectTextFits({ scale: 2 })`); `expectReducedMotion`; `expectVisibleFocus`; läuft in allen Projekten inkl. `pixel-7-quer` (Dialog scrollt).
14. Vitals Erstbesuch mit Onboarding (Chromium, `throttleMobile`, `observeVitals`): LCP < 2,5 s, CLS < 0,05.

**Smoke (Deploy-Build, echte Daten; Arch-Review m6)**: ein Test mit `onboarding: "neu"` in einer Smoke-Spec: Dialog erscheint, Lead mit Zahlen, „Überspringen“ schließt, keine Konsolenfehler.

**E2E `e2e/push.spec.ts`**, neuer Test mit `onboarding: "neu"` und `pushWorker: "mock"`: Schalter im letzten Schritt einschalten → genau ein `POST /abo` im `pushLog`, Status „An. Die erste kommt am Samstag.“; vorher kein Request an den Worker. Die bestehenden Push-Tests bleiben unverändert grün (Refaktor `usePushSwitch`).

**`scripts/lib/e2e-map.ts`**:
- `"e2e/onboarding.spec.ts": [/^src\/ui\/(Onboarding|AppExtras|KidSheet|Dialog)\.tsx$/, /^src\/ui\/(onboarding-types|birth-date-input)\.ts$/, /^src\/ui\/onboarding\//, /^src\/ui\/app-extras\/AppSection\.tsx$/, /^src\/domain\/(onboarding|onboarding-gate|regions)\.ts$/, /^src\/data\/preferences\.ts$/]`
- `birth-date-input.ts` kommt in S3 zu einer Nicht-app-Spec, die das Geburtsdatum im Kind-Sheet tippt (per grep wählen; `e2e-map.test.ts:39–45` verlangt eine Spec außer `app.spec`; Review 2, H-1).
- `push.spec` deckt `app-extras/` schon ab.

## Schritte

- **S0 Messen**: auf aktuellem `main` `pnpm build`, size-limit. Start-JS, CSS und App-Extras notieren und in „Ausgangslage“ übernehmen.
  - Fertig, wenn: drei Werte mit Commit-SHA im Plan stehen.
- **S1 Domäne (test-first)**: `onboarding-gate.ts`, `onboarding.ts` (E1, E5, E6, E9, E10), `regions.ts` (`population`, Quelle im Kommentar), `PushCapability` in `domain/pwa.ts`.
  - Fertig, wenn: Unit-Tests erst rot, dann grün und `pnpm verify` grün.
- **S2 Daten (test-first)**: `preferences.ts` (E2), `push.ts` (`hasServiceWorker`, `swGivenUp`, `pushCapability`; `pwa.ts` setzt `data-sw="aus"`, Zeitlimit für `ready`), `InstallApi` nach `src/domain/pwa.ts` (E4).
  - Fertig, wenn: Unit-Tests grün, `pnpm verify` grün und `push.spec` lokal grün.
- **S3 Refaktor ohne Verhaltensänderung**: `useBirthDateInput` aus `KidSheet`, `usePushSwitch` aus `PushControls`.
  - Fertig, wenn: `pnpm verify` grün, `pnpm e2e:local e2e/app.spec.ts e2e/push.spec.ts e2e/installieren.spec.ts` grün und Start-JS ± 0,05 kB.
- **S4 Lazy-Kette mit Stub, E2E-Basis zuerst**:
  1. `e2e/fixtures.ts` (E15), `skipOnboarding` in `merkliste-anbieter.spec.ts`, `storedValues` in `startpunkt.spec.ts`, `scripts/screenshots.ts`.
  2. Dann `vite.config.ts`, `.size-limit.json`, `.dependency-cruiser.cjs` (vier Regeln, je ein Kanarienvogel, wie bei `anbieter-*`), `LAZY_LOADERS`, Chunk-Wächter für CSS, `onboarding-types.ts`, `Onboarding.tsx` (Lader, Cover, Dialog, Laden/Fehler), `loadAppStep` in `AppExtras.tsx`, `App.tsx`-Verdrahtung (E2, E9).
  3. Ein realistischer Stub `OnboardingFlow.tsx` nutzt `Icon`, `plural`, `DISTRICTS`, `time.ts` und importiert seine CSS.
  4. `e2e/onboarding.spec.ts` als Gerüst mit Eintrag in `SPEC_COVERS` (`e2e-map.test.ts:21–26` verlangt eine vorhandene Datei, `:39–45` eine Spec für jedes neue `src/ui/`-Modul). Test 10 (Request-Zählung) und Test 12 (Chunk-Fehler) laufen schon gegen den Stub (Review 2, H-1).
  5. Budget-Alternative messen: Onboarding-CSS im Start-CSS statt Chunk-CSS (dort ≈ 3 kB frei, spart `__vite__mapDeps`, `assetFileNames`-Regel, CSS-Wächter und CSS-Budget). Die billigere Variante gewinnt (Review 2).
  - Fertig, wenn:
    - `pnpm verify` grün und der Chunk-Wächter grün (genau `index-*.js` und `index-*.css` oben).
    - Die Stub-CSS liegt in `assets/onboarding/`.
    - Start-JS gemessen und mit E13 verglichen. **Liegt es über 100 kB, zuerst im Start-Anteil des Onboardings sparen (Lader schlanker, Logik in den Chunk). Reicht das nicht: `JS (initial)` auf 101 kB anheben (N1, vom Nutzer entschieden), Nachtrag ADR 0012.**
    - `pnpm e2e:local --affected` ohne neue Fehler.
- **S5 Oberfläche**: `OnboardingFlow.tsx`, `steps.tsx`, `art.tsx` (SVGs aus dem Mockup), `onboarding.css`, `AppStep` und `APP_STEP_TEXTS`, Link im Kind-Sheet (E12), `.dlg.onb`/`.onb-cover`/`.onb-pending`/`.onb-topbar`/`.onb-skip` in `dialog.css`. Umbenennung „Wochen-Nachricht“ → „Samstags-Nachricht“ (N2): `push-texts.ts` (`switchLabel`, `on`, `off`, `addedOff`, `needsSwitch`), Selektoren `e2e/push.spec.ts:35, 243, 278`, `push-texts.test.ts`, `docs/architecture.md`, README (Review L4).
  - Fertig, wenn: alle Schritte im Fixture-Build bedienbar sind, die Budgets gesetzt (Messwert + Reserve, Begründung im Commit), `pnpm verify` grün und `pnpm e2e:local --affected` ohne neue Fehler.
- **S6 E2E**: `e2e/onboarding.spec.ts` (Tests 1–14), Push-Test.
  - Fertig, wenn: `pnpm verify` grün, `pnpm e2e:local --affected` sowie `-- --project=iphone-15` für die Specs `onboarding` und `installieren` grün sind und `e2e-map.test.ts` grün.
- **S7 Doku** (siehe unten).
  - Fertig, wenn: `check-docs` grün.
- **S8 Reviews**: `/arch-review` (neues Modul, über 200 Zeilen), `/browser-review` lokal mit `--views=onboarding,kind,start` hell/dunkel, 320/200 %, quer.
  - Fertig, wenn: kein Blocker offen ist und jede Zeile der Checkliste beantwortet ist.
- **S9 Commit, Push, CI auf `main`, `/browser-review live`**, auf einem echten Android und iPhone (Safari-Tab und installierte App).
  - Fertig, wenn: `meta.json` den Commit zeigt.

## Offene Punkte (Nutzerentscheid)

Stand 2026-10-11: Der Nutzer hat das Mockup freigegeben („Passt so super, bitte bauen“) und war für N1–N3 nicht erreichbar. N2 („Samstags-Nachricht“ überall) und N3 sind nach den Empfehlungen entschieden, im Abschlussbericht genannt und vom Nutzer umkehrbar. **N1 entschieden (Nutzer, 2026-10-11): „Bei Bedarf anheben“.** Reißt die Messung in S4 das Budget auch nach Sparversuchen, wird `JS (initial)` auf 101 kB angehoben, mit Nachtrag in ADR 0012 und Begründung im Commit. Die Umsetzung hält dafür nicht mehr an.

- **N1 – Start-Budget.** Rest ≈ 0,72 kB, geschätzter Bedarf +0,7 bis +0,9 kB.
  - Empfehlung: Liegt die Messung in S4 über 100 kB, `JS (initial)` auf **101 kB** setzen (Nachtrag ADR 0012). Die Gates LCP/CLS/Schrift-Swap bleiben unverändert, Präzedenz Plan 0019.
  - Alternative: Kalender lazy (−1,65 kB, `docs/ideas.md`), als eigener Plan, das Onboarding wartet dann.
- **N2 – Ein Begriff.** Das Onboarding sagt „Samstags-Nachricht“, das Kind-Sheet und die README „Wochen-Nachricht“.
  - Empfehlung: in diesem Plan auf „Samstags-Nachricht“ vereinheitlichen. Betroffen sind nur UI-Texte: `PUSH_TEXTS.switchLabel`, `on`, `off`, `addedOff`, `needsSwitch`, die README-Abschnitte und die Selektoren in `e2e/push.spec.ts`. Workflow-Name und Code-Bezeichner bleiben.
  - Sonst bleiben zwei Begriffe für denselben Schalter.
- **N3 – Abweichungen vom Mockup 1–5** zur Kenntnis (von den Gates erzwungen bzw. sachlich).

## Risiken

- **Erster Besuch langsamer sichtbar**: Neue Nutzer sehen das Onboarding erst nach Chunk und `site.json`. Gegenmittel: Vorladen im Initializer und Cover. Gemessen in Test 14. Die LCP-Gates der Liste messen weiter ohne Onboarding.
- **Rolldown-Abspaltung** (rolldown#11026) durch einen weiteren Chunk mit geteilten Start-Modulen. Die Gruppe `$initial` sollte halten, Gate ist der Chunk-Wächter (S4 mit realistischem Stub).
- **Android-Zurück**: Chromes CloseWatcher kann ohne `cancel` schließen. Dann stimmt `open` in React nicht mehr. Der Flow nutzt kein zurückgehaltenes `cancel`. Optional `onClose`-Ereignis zusätzlich abfangen, im Browser-Review auf echtem Android prüfen.
- **Push beim Erstbesuch**: Die Registrierung kommt nach `load`, `enable` wartet auf `ready`. Ohne Service Worker (Notausgang, blockiert) greift das Zeitlimit von 10 s mit „Das Gerät konnte die Benachrichtigung nicht einrichten …“.
- **`beforeinstallprompt`** kommt in Chrome erst nach Engagement-Heuristik oder gar nicht. Dann zeigt Android den Menü-Hinweis (wie heute im Kind-Sheet).
- **App-Extras-Budget** 7,1 kB kann reißen (E13).
- **E2E-Abdeckung**: Specs mit eigenem Kontext (`browser.newContext`) sehen das Onboarding, wenn sie `skipOnboarding` vergessen. Nach S4 läuft die volle Suite in der CI auf dem Branch.
- **Bestandsnutzer ohne gespeicherte Angaben** sehen das Onboarding nach dem Deploy einmal (gewollt, E2).
- **Fallback-Schrift in SVG-Texten** vor dem Webfont-Swap: Die Breite kann abweichen. Dekorativ, kein Gate. Sichtprüfung.

## Doku

- `docs/architecture.md`:
  - Schichten: `onboarding`, `onboarding-gate` bei `src/domain`.
  - Neuer Absatz „**Onboarding**“: Lader `Onboarding.tsx`, Chunk `assets/onboarding/` mit eigener CSS, Budgets, die vier Regeln, `LAZY_LOADERS`, App-Teil über `loadAppStep`, Startbedingung, Esc/Zurück, Fixture-Option `onboarding`.
  - Chunk-Wächter jetzt auch für CSS.
  - Invarianten: Schlüssel `zwergenplan.einfuehrung` (Flag, kein Personenbezug); Wegzeit-Anlass „Onboarding-Schritt Weg“ in „Wegzeit“ und „Kein Request hängt …“.
  - Push: „Schalter auch im Onboarding, dort ohne Abgleich und ohne laufendes Spiegeln“.
  - App-Extras: `AppStep`, `usePushSwitch`.
- ADR 0012: Zeile in der Delta-Tabelle (und Budget-Nachtrag bei N1).
- ADR 0027 (neu): App-Chunk beim Erststart vorladen (E14). ADR 0013: Verweis auf ADR 0027. `docs/architecture.md`: PWA-Kern-Ladezeitpunkt, `data-sw`.
- ADR 0014: Nachtrag „Schalter auch im Onboarding“.
- ADR 0025: Nachtrag `population`.
- `README.md`:
  - im Einleitungsabsatz „Beim ersten Öffnen führt eine kurze Einführung durch Alter, Startpunkt und App“
  - „Als App installieren“ und „Wochen-/Samstags-Nachricht“: Einschalten auch im Onboarding (Begriff nach N2)
- `.claude/skills/browser-review/SKILL.md`: Ansicht `onboarding` in der Liste der Ansichten.
- `docs/ideas.md`: „Stadtwahl speichern mit zweiter Region“, „Onboarding-Version erhöhen bei großen Änderungen“.
- Mockup `docs/design/onboarding-mockup.html` mit dem Plan committen (heute untracked).

## Review (2026-10-11) – Verdict: Überarbeiten

Unabhängiger `plan-reviewer`, Runde 1. Übernommen:

- **B1** (Push in der Headless-Shell immer verweigert): Tests 5, 6 und der Push-Test mit `channel: "chromium"`, eigener Fall `verweigert` (E15, Tests).
- **H1** (Privatsphäre: Chunk-Request hing an gespeicherten Angaben): Gate mit `"still-erledigt"`, Vorladen nur an Flag und Deep-Link, E2E zählt Requests (E2, E14, Test 10).
- **H2** (Typ-Import aus `src/data/pwa.ts` verboten): `InstallApi` nach `src/domain/pwa.ts` (E4, S2).
- **H3** (Autofokus nach `showModal()` wirkungslos): Fokus per Effekt beim Mounten und je Schritt (E3).
- **H4** (`fallbackFocus` greift beim Aushängen nicht): `flushSync` und ausdrücklicher Fokus auf die Statuszeile (E3, E9).
- **H5** (kein Ausweg beim Laden, App-Chunk-Fehler kippt alles): Kopfzeile mit „Überspringen“ im Ladezustand (Start-CSS), ohne App-Teil entfällt nur der Schritt (E3, Test 12).
- **H6** (N1 widersprüchlich): Budget-Anhebung nicht selbst entschieden; S4 hält nach Sparversuchen an (Offene Punkte, S4).
- **H7** (`startpunkt.spec.ts` vergleicht den ganzen Speicher): `storedValues` filtert das Flag (E15, S4).
- **M1** (Zeitlimit traf langsame Erstbesuche, Notausgang): Zeitlimit nur ohne Registrierung nach `load`, `pushCapability` → `nein` bei `__SW_OFF__` (E8).
- **M2** (Regel deckte `domain/onboarding.ts` nicht): Regel erweitert (E4).
- **M3** (Prüfungen je Schritt): `pnpm verify` bzw. `--affected` in S2, S3, S5.
- **L1** (ADR 0026 vergeben): 0027 (E14). **L2** (Safe Area links/rechts): E3. **L3** (`allowedConsoleErrors`): Test 12. **L4** (Umbenennung ohne Schritt): S5. **L5** (ungenaue Formulierungen): E3, E12.

Abgelehnt:

- **L6** (`population` und Dropdown erst mit der zweiten Region): Der Nutzer hat die Sortierung nach Größe und das Dropdown ausdrücklich verlangt. Die reine Funktion `cityChoices` ist klein und getestet, so ist die zweite Region nur Daten. Die Einwohnerzahl wird beim Umsetzen mit Quelle nachgeschlagen.

## Review Runde 2 (2026-10-11) – Verdict: Freigabe mit Änderungen

Neuer `plan-reviewer` auf die überarbeitete Fassung. Kein Blocker. Alles übernommen:

- **H-1** (e2e-map-Wächter ab S3 rot): Spec-Gerüst mit `SPEC_COVERS` in S4, `birth-date-input.ts` in S3 bei einer Nicht-app-Spec.
- **H-2** (Reihenfolge ohne App-Teil nicht bestimmbar): Flow startet nach `Promise.allSettled` (E1, E3).
- **M-1** (Fokus im Modus „manuell“): zusätzlich `markAutofocus`, `<Onboarding>` nach `<Overlays>`, Test 11.
- **M-2** (früher Request auf `assets/app/` verriet Speicher): beide Chunks bei jedem Gate ≠ „nichts“, Test 10 zählt beide.
- **M-3** (Zeitlimit-Wettlauf nach `load`): `data-pwa="ohne-sw"` aus `start()`, `PushEnv.swGivenUp()` (E8, S2).
- **M-4** (px-Schriften machen 200 % wirkungslos): rem, Test 13 prüft die Verdopplung (E11).
- **M-5** (Schalter/Knopf ohne Mobile-UX-Gate): Gates in Test 5.
- Niedrig: Fokusziel ohne Statuszeile und `flushSync` (E9), generisches `cityChoices`, Such-Abos in `hasStoredData`, Umbenennung vollständig (S5), Zeilenangaben, „Egal“-Chip, Lead bei 0 Angeboten, `pnpm verify` in S6, CSS-Budget-Alternative in S4.

Freigegeben zur Umsetzung.

## Arch-Review des Plans (2026-10-11) – keine Blocker

Das Stop-Gate verlangte `/arch-review` auf Plan und Mockup. Übernommen:

- **M1** (`data-pwa="ohne-sw"` hätte „bereit“ überschrieben): eigenes Attribut `data-sw="aus"`, Kanal dokumentiert (E8).
- **M2** (Vorladen des PWA-Kerns weicht von ADR 0013, Punkt 5 ab): neues ADR 0027 statt Nachtrag (E14, Doku).
- **M3** (helle SVG-Flächen im Dunkelmodus): Füllungen über `--onb-paper`/`--onb-screen`/`--onb-ink`, Checklistenzeile im Browser-Review (E11).
- **m1** (ADR 0025 falsch zitiert), **m2** (Such-Abo-Schlüssel als Konstante), **m3** (Gate ohne nutzbaren Speicher), **m4** (`plural` in die Domäne), **m5** (`enable` per `Promise.race` statt Zeitlimit, vier Testfälle), **m6** (Smoke-Test im Deploy-Build).
