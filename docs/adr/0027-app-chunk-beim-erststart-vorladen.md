# ADR 0027 – App-Chunk beim Erststart vorladen

Status: angenommen (2026-10-11), mit Plan 0033 (Onboarding beim ersten Öffnen). **Ändert** ADR 0013, Punkt 5 („Auch dieser Kern lädt lazy nach `load`“) für den Ladezeitpunkt des Moduls; die Registrierung des Service Workers bleibt nach `load`. Details in Plan 0033, E2, E4 und E8.

## Kontext

- Plan 0033 zeigt beim ersten Öffnen ein Onboarding. Sein letzter Schritt „App“ braucht den Installationszustand (`install` aus `src/data/pwa.ts`) und den Push-Schalter (`AppStep` in `src/ui/app-extras/AppSection.tsx`). Beide liegen im Lazy-Chunk `assets/app/`. Ein statischer Import zwischen zwei Lazy-Chunks schreibt `__vite__mapDeps` in den Einstieg (ADR 0013, Konsequenzen), also holt der Lader `src/ui/Onboarding.tsx` beide Chunks parallel und reicht den App-Teil als Prop herein.
- Die Reihenfolge der Schritte hängt am App-Teil (auf dem iPhone rückt „App“ an Position 2, ohne Installation und Push entfällt er). Sie wird einmal beim Start des Flows festgelegt (Plan 0033, E1). Der App-Teil muss also schon beim Start feststehen, nicht erst nach `load`.
- Privatsphäre (`docs/architecture.md`, Invariante „Kein Request hängt davon ab, ob oder welche Anbieter gemerkt sind“): Ob das Onboarding erscheint, hängt auch daran, ob schon Angaben gespeichert sind. Lüde der App-Chunk nur, wenn das Onboarding wirklich erscheint, verriete ein früher Request auf `assets/app/` dem eigenen Host, dass nichts gespeichert ist (Plan 0033, Review 2, M-2).
- `beforeinstallprompt` hört erst, wer `src/data/pwa.ts` geladen hat (Listener auf Modulebene). Bisher geschah das nach `load` oder mit dem Abschnitt „Als App“ im Kind-Sheet.

## Entscheidung

1. **Vorladen bei jedem Gate ≠ „nichts“.** Ist das Flag `zwergenplan.einfuehrung` nicht gesetzt und gibt es keinen Deep-Link (`onboardingGate`, Plan 0033, E2), startet `preloadOnboarding()` schon im `useState`-Initializer von `App`, parallel zum Frühstart von `site.json`: den Onboarding-Chunk (`assets/onboarding/`) **und** über `loadAppStep()` die beiden Module des App-Teils (`assets/app/AppSection-*.js`, `assets/app/pwa-*.js`). Das gilt auch bei `"still-erledigt"` (Bestandsnutzer mit gespeicherten Angaben, die nichts sehen und deren Flag still gesetzt wird). Die Requests sind damit beim ersten Start für alle gleich, egal ob etwas gespeichert ist, und danach entfallen sie (Flag gesetzt).
2. **Nur das Modul lädt früher.** `start()` (Registrierung, Frische, `data-pwa="bereit"`) ruft weiter allein `src/data/pwa-start.ts` nach `load` auf. Der Kern steht weiter nicht im Start-Bundle; im Start stehen nur die `import()`-Aufrufe der Lader.
3. **Ein Ladevorgang je Datei.** Kind-Sheet (`loadExtras`) und Onboarding (`loadAppStep`) teilen sich die Module über die Modul-Map des Browsers; ein gemeinsamer Merker kostete 0,07 kB Start-JS (Plan 0033, „Umsetzung (S4)“). Scheitert der App-Teil, läuft das Onboarding ohne den Schritt „App“.

## Alternativen

- **App-Teil erst nach `load` oder beim Erreichen des Schritts „App“ laden** (ADR 0013 unverändert): Die Reihenfolge der Schritte stünde beim Start nicht fest, die Punktezahl spränge, und der Request verriete beim Erreichen des Schritts, dass das Onboarding läuft, also dass nichts gespeichert war.
- **Vorladen nur bei `"zeigen"`**: weniger Bandbreite für Bestandsnutzer, aber der Request auf `assets/app/` hinge an gespeicherten Angaben (Review 2, M-2).
- **App-Teil in den Onboarding-Chunk kopieren**: Push- und Installationscode stünden doppelt, und ein geteilter Chunk mit Push-Code landete in `assets/` (Chunk-Wächter, Regel `onboarding-apart-from-app`).

## Konsequenzen

- Beim ersten Start ohne Flag lädt der App-Chunk neben `site.json` und konkurriert um Bandbreite. Gegenmittel: Er ist klein (Budget `App-Extras JS (lazy)` 7,6 kB) und kommt nach dem Start-JS. Nachweis: Plan 0033, Test 14 (LCP < 2,5 s, CLS < 0,05 beim Erstbesuch mit Onboarding).
- Plan 0033, Test 10 zählt die Requests auf `assets/onboarding/` und `assets/app/` beim ersten Start mit und ohne gespeicherte Merkliste (gleich viele) und beim zweiten Start (keiner auf `assets/onboarding/`, nur der PWA-Kern nach `load`).
- `beforeinstallprompt` wird beim Erststart früher gehört; der Installationsknopf im Onboarding kann also schon erscheinen, bevor `load` kommt.
- Die Precache-Liste des Service Workers (`startChunks`) ändert sich nicht: Der PWA-Kern ist schon drin, `AppSection` und der Onboarding-Chunk landen beim Laden im Laufzeit-Cache.
- Weitere Vorladungen von Lazy-Chunks beim Start brauchen ihre eigene Begründung; dieses ADR deckt nur den Erststart ohne Flag.

## Nachtrag (2026-10-11): ohne „still-erledigt“, Flag-Version 2, iPhone App zuerst (Plan 0035)

- **Gate nur noch „zeigen“/„nichts“** (`onboardingGate` in `src/domain/onboarding-gate.ts`): Bestandsnutzer mit gespeicherten Angaben sehen das Onboarding einmal, ihre Angaben stehen vorbelegt. `hasStoredData` und der Zustand „still-erledigt“ entfallen. Damit hängt auch das *Erscheinen* nicht mehr an gespeicherten Angaben; die Entscheidung oben (Vorladen bei jedem Gate ≠ „nichts“, nur das Modul früher, ein Ladevorgang je Datei) bleibt und gilt noch schlichter.
- **Flag-Version 2:** Erledigt ist nur der Wert `"2"` (`ONBOARDING_VERSION` in `src/data/preferences.ts`, exakt verglichen). `"1"` wurde von Plan 0033 auch still an Bestandsnutzer vergeben und zählt nicht mehr; wer `"1"` hat, lädt die Chunks beim nächsten Start einmal erneut. Eine spätere Erhöhung zeigt das Onboarding allen einmal erneut. E2E und `scripts/screenshots.ts` nutzen denselben Wert aus `e2e/onboarding-flag.ts`.
- **iPhone App zuerst:** Im Safari-Tab des iPhones steht „App“ an Position 1, weil die installierte App einen eigenen Speicher hat. Die Ladebühne trägt dort schon vor dem Chunk die App-Farbe (`iosTab()` aus `src/data/platform.ts`, Klasse `onb-pending ios`; ADR 0013, Nachtrag 2026-10-11, Plan 0035).
- Der Kontextsatz „auf dem iPhone rückt ‚App‘ an Position 2“ und die Erwähnung von „still-erledigt“ in Entscheidung 1 und den Alternativen sind damit überholt. Der Text oben bleibt als Begründung stehen.
