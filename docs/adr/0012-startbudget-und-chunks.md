# ADR 0012 – Startbudget, Rolldown-Workaround und Stack

Status: angenommen (2026-10-05), Nutzerentscheidung: Option (a) mit Workaround. Betrifft Plan 0010 (E7, E8) und `.size-limit.json`. ADR 0001 (Stack) bleibt unverändert. **Geändert am 2026-10-06 durch Plan 0019 (E9): Budget `JS (initial)` 100 kB statt 92 kB, Nutzerentscheidung** (Nachtrag unten).

## Kontext

- **Budget:** `JS (initial)` hat ein Budget von 90 kB gzip.
  - Auf `main` (`903866a`) liegt das Start-JS bei **89,62 kB**.
  - Plan 0010 (Anbieterübersicht) bringt bis zu 1,3 kB hinzu.
  - Sein Eintrittsziel von ≤ 87,7 kB hat Paket 0 um 1,9 kB verfehlt (Plan 0010, E8, „Ergebnis Paket 0“).
- **Verteilung:** react-dom macht laut Sourcemap 203 kB vom minifizierten Einstieg aus. Der größte eigene Brocken ist `format.ts` mit 6,2 kB.
- **Abspaltung:** Wird der Kalender lazy, spaltet Rolldown `jsx-runtime` (3,2 kB) und `time.ts` (0,9 kB) als eigene Start-Chunks ab. Der Chunk-Wächter (`scripts/check-chunks.ts`) wird rot.

Gemessen am 2026-10-05, alle Werte in kB gzip wie size-limit. Gemessen wurde mit Vite 8.3.2 und Rolldown 1.2.12, beide `latest`; eine neuere Version gibt es nicht.

### Ursache der Abspaltung

Es ist ein offener Rolldown-Fehler, [rolldown/rolldown#11026](https://github.com/rolldown/rolldown/issues/11026):
- `experimental.chunkOptimization` führt gemeinsame Chunks in einem einzigen Durchlauf und abhängig von der Reihenfolge zusammen.
- Ein früh ausgeführtes Blatt wie React oder `time.ts` kommt an die Reihe, solange seine Importeure noch eigene Chunks sind.
- Die Prüfung meldet dann einen Zyklus, den es nur vorübergehend gibt. Der Merge wird abgelehnt und später nicht nachgeholt.
- Eine minimale Repro mit sieben Dateien, nur Rolldown und den Standardoptionen liegt vor. Das Issue nennt nur eine Variante mit `avoidRedundantChunkLoads: false`.

Auslöser ist die Form des Modulgraphen, nicht JSX, Hooks oder React. Das zeigen drei Befunde:
- Ein trivialer Anbieter-Stub (Komponente mit `useState`) spaltet nicht ab: Start-JS 89,74 kB, Wächter grün.
- Ein **realistischer Stub**, der geteilte Start-Module nutzt (`Dialog`, `Icon`, `plural`, `berlinIsoDate`), spaltet `jsx-runtime` und `time` ab, auch **ohne** lazy Kalender: 90,86 kB, Wächter rot.
  - Die Anbieter-UI aus Plan 0010 löst die Abspaltung also sicher aus.
  - Das ist unabhängig davon, wie dieses ADR entschieden wird.
- Unter Preact bleibt die Abspaltung ebenfalls; dort wird das ganze Preact als `jsxRuntime` abgespalten (7,2 kB).

### Workaround

```ts
// vite.config.ts, build.rolldownOptions.output
codeSplitting: { groups: [{ name: "index", tags: ["$initial"] }] },
```

- Alle Module, die der Einstieg statisch erreicht, bleiben im Einstieg, auch wenn Lazy-Chunks sie teilen.
- **Auf `main` neutral:** gleicher Hash `index-DUZZBaYg.js`, 89,62 kB. Lazy-Budgets unverändert: Karte 425,40, Wegzeit 1,01, Export 1,15 kB. Kein zusätzlicher Preload in `index.html`.
- Gegenprobe ohne Gruppe: `jsx-runtime` und `time` als eigene Chunks, Start 91,53 kB.
- Frühere Fehlversuche (Plan 0010, E8) nutzten eine Gruppe namens `index` **ohne** `tags`. Der Name ist egal, entscheidend ist `$initial`.

### Messungen

| Variante | Start-JS | Chunk-Wächter | Bemerkung |
|---|---|---|---|
| `main` heute | 89,62 | grün | |
| + Gruppe `$initial` | 89,62 | grün | gleicher Hash |
| realistischer Anbieter-Stub, ohne Gruppe | 90,86 | **rot** | `jsx-runtime` + `time` abgespalten |
| realistischer Anbieter-Stub, mit Gruppe | 89,75 | grün | +0,13 = Lader |
| Kalender lazy, mit Gruppe | **88,53** | grün | Kalender-Chunk 1,83 |
| Merkliste (`SavedView`) lazy, mit Gruppe | 89,11 | grün | Chunk 1,25 |
| Kalender + Merkliste lazy, mit Gruppe | **87,97** | grün | Chunks zusammen 3,12 |
| Anbieter-Stub + Kalender lazy, mit Gruppe | 88,67 | grün | |
| **Preact 11 / `preact/compat`** (Alias, Code unverändert) | **29,09** | grün | Karte 425,35, Export 1,15, Wegzeit 1,01 |

Die Lazy-Werte gelten mit einem minimalen `React.lazy`-Lader. Vorladen im Leerlauf und `LoadFailed`, wie beim Export, kosten geschätzt 0,1–0,2 kB je Chunk.

Weitere Kandidaten außerhalb der Tabelle in E8 haben nichts gebracht: Minifier-Optionen ergeben denselben Hash, und `topics.ts` vorzuberechnen widerspräche der Regel „Kategorien nie gespeichert“.

**Preact im Detail** (Experiment-Worktree, Alias in `vite.config.ts` und `vitest.config.ts`):
- **Tests:**
  - Vitest 630/630 grün, Typecheck gegen die `preact/compat`-Typen ohne Fehler.
  - E2E Pixel 7: 277 grün, 5 rot.
    - 3× Schrift-Swap: `load` kommt später, weil Preact synchron rendert. Mit `waitUntil: "commit"` in `e2e/vitals.ts` grün.
    - 1× `startpunkt.spec.ts:213`: Preact führt `useEffect` (also `showModal`) erst nach dem Zeichnen aus, und `clock.pauseAt` hält das an.
    - 1× `karte.spec.ts:172`: Kachel-Request beim Wechsel Karte → Liste, **ungeklärt**.
  - WebKit nicht gelaufen.
- **Folgen:**
  - Effekte laufen später als unter React.
  - `StrictMode` prüft nichts mehr.
  - knip und `domain-is-pure` (`.dependency-cruiser.cjs`) brauchen Anpassungen.
  - `@types/react` entfällt.
  - Künftige React-APIs sind nicht nutzbar, und Preact 11 ist ein neues Major.
- **Aufwand:** geschätzt 1–1,5 Tage.

## Optionen

**(a) Budget anheben auf 92 kB, mit Workaround.**
- Nach Plan 0010 sind es ≤ 90,9 kB, gut 1 kB Reserve.
- Kein weiterer Umbau.
- Der Workaround ist trotzdem nötig, denn ohne ihn macht die Anbieter-UI den Wächter rot.

**(b) Preact/compat statt React.**
- −60,5 kB Start-JS. Das Budget könnte auf etwa 35 kB **sinken**.
- Stack-Änderung gegen ADR 0001, mit eigenem Plan, Plan-Review und Browser-Review an echten Geräten.
- `karte.spec.ts:172` ist vorher zu klären.

**(c) Auf einen Rolldown-Fix warten.**
- Das Issue ist offen, und es gibt keinen Fix-PR.
- Mit dem Workaround ist Warten unnötig. Das Issue wird nur beobachtet.
- Als eigenständige Option **nicht empfohlen**: Sie blockiert Plan 0010 ohne Termin.

**(d) Weitere Lazy-Chunks, mit Workaround, Budget bleibt 90 kB.**
- Kalender und Merkliste lazy, jeweils mit Vorladen im Leerlauf, `LoadFailed` und Regeln wie beim Export: ca. 88,2 kB.
- Nach Plan 0010 sind das ca. 89,5 kB, 0,5 kB Reserve.
- Der Kalender ist ein Haupt-Tab. Ohne Service Worker hängt er offline am Vorladen.
- Dazu kommen zwei weitere Ladeketten mit Regeln, Kanarienvögeln und E2E-Tests.

## Entscheidung

**(a) mit Workaround.** Begründung des Nutzers: Die Performance soll nicht vorzeitig und unnötig hart optimiert werden.
- **Workaround:** Er ist Pflicht, sobald die Anbieter-UI kommt, und auf `main` neutral. Der Chunk-Wächter bleibt das Gate.
  - Ein Kommentar an der Konfiguration verweist auf #11026.
  - Ist der Fehler behoben, wird geprüft, ob die Gruppe entfallen kann. Gleicher Hash ohne Gruppe heißt: entfernen.
- **Nicht gewählt:**
  - **(d):** spart 1,4 kB, das sind 1,6 % des Start-JS. Dafür würde ein Haupt-Tab lazy, und es kämen zwei Ladeketten dazu.
  - **(b):** Preact ist der einzige große Hebel (−67 %), aber eine Stack-Entscheidung mit Verhaltensänderungen (Zeitpunkt der Effekte, Dialoge, Fokus). Ein Bedarf ist heute nicht gemessen: Die LCP-Gates sind grün.
  - Beide stehen mit ihren Messwerten in `docs/ideas.md`.
- **(c):** Kein Kommentar in #11026 (Nutzerentscheidung 2026-10-05: nichts Öffentliches unter seinem Konto). Das Issue wird beobachtet; ist es behoben, wird die Gruppe ohne Hash-Änderung entfernt.

## Konsequenzen

- **Budget:** `.size-limit.json` setzt `JS (initial)` auf 92 kB (**seit Plan 0019: 100 kB**, Nachtrag „Stand nach Plan 0019“). Das Ziel nach Plan 0010 ist ≤ 91,0 kB (1 kB Reserve). Das Eintrittsziel von 87,7 kB entfällt. **Ziel und Reserve sind seit Plan 0019 überholt.** Statt eines Ziels führt der Nachtrag „Stand nach Plan 0019“ eine Delta-Tabelle je Plan.
  - **Stand nach Plan 0012 (2026-10-05, size-limit):** 91,28 kB (vorher auf `main` 90,9 kB). Erst 91,42 kB; gesenkt um 0,14 kB, indem die Erklärung im Quellenhinweis aus `format.ts` in den Wegzeit-Chunk zog (`TRANSIT_RULE`) und Tabelle und Linien einen Abruf-Helfer teilen. Übrig bleiben Anzeige (`ReachLong.tsx`), Laden und Zustellen der Linien (`src/data/transit.ts`, `use-transit.ts`). Das Ziel ≤ 91,0 kB ist um 0,28 kB überschritten, **Restreserve zum Budget 0,72 kB**. Das Budget bleibt 92 kB.
- **Workaround:** `vite.config.ts` bekommt die Gruppe `$initial` mit Kommentar und Verweis auf #11026, in einem eigenen Commit vor „Schnittstellen“.
  - **Kanarienvogel:** Ohne die Gruppe muss der realistische Stub den Wächter rot machen.
- **Plan 0010:**
  - **E8:** Ergebnis, Entscheidung und Verweis auf dieses ADR.
  - **Schritt 4 „Schnittstellen“:** Der Stub `anbieter/entry.ts` muss **geteilte Start-Module** nutzen (umgesetzt mit `Icon`, `plural`, `standDate` samt `time.ts`). Nur dann prüft er die Abspaltung. Ein trivialer Stub mit `useState` spaltet nie ab.
  - **E7, Budgets:** `JS (initial)` 92 kB, Zuwachs weiter ≤ 1,3 kB.
  - **Akzeptanz:** Start-JS ≤ 91,0 kB statt ≤ 89,0 kB.
  - **Risiken:** Der Punkt „Startbudget“ wird entschärft.
- **`docs/architecture.md`, Abschnitt Chunk-Wächter:** neu ist der Satz zur Gruppe `$initial`: Sie hält gemeinsame Start-Module im Einstieg. Fällt sie weg, zeigt der Wächter die Abspaltung.
- **`docs/ideas.md`:**
  - „Kalender/Merkliste lazy (−1,65 kB gemessen)“;
  - „Preact/compat (−60,5 kB gemessen, Befunde siehe ADR 0012)“.
- **ADR 0001** bleibt unverändert, der Stack bleibt React 19.
- **ADR 0008** nennt beim Startbudget noch 90 kB. Die Zahl ist durch dieses ADR ersetzt (92 kB); ADR 0008 selbst bleibt unverändert.

## Nachtrag (2026-10-05): Stand nach Plan 0011, Stufe 1, und Plan 0012

- Gemessen nach dem Merge von Plan 0012 (Linien, `main` 61de0da: 91,28 kB) in Plan 0011, Stufe 1 (PWA): **`JS (initial)` 91,72 kB** von 92 kB. Die Anteile addieren sich (0012 +0,38 kB, 0011 +0,44 kB gegenüber 90,90 kB vor beiden).
- Rest 0,28 kB. Das Budget bleibt bei 92 kB. Wie Stufe 2 von Plan 0011 (≈ 0,10 kB geschätzt) und spätere Pläne hineinpassen, entscheidet Plan 0011 vor Schritt 9; die Kandidaten zum Auslagern stehen dort und hier unter „Optionen“ (d) bzw. in `docs/ideas.md`.


## Nachtrag (2026-10-06): Stand nach Plan 0016

- Gemessen gegen `main` 32d4edb (**91,77 kB**): Plan 0016 (Startpunkt gespeichert, ADR 0017) bringt **`JS (initial)` 91,95 kB** von 92 kB, also +0,18 kB. Schon eingespart sind −30 B (ein gemeinsames `saveOrigin`, knappe Formprüfung, ein Ref statt zwei).
- Rest **0,05 kB**. Das Budget bleibt bei 92 kB. Stufe 2 von Plan 0011 (≈ 0,10 kB) passt damit nur mit den dort benannten Kandidaten zum Auslagern. Wer nach Plan 0016 nach `main` merged, misst neu.

## Nachtrag (2026-10-06): Budget 100 kB, Stand nach Plan 0019

- **Ausgangslage:** gemessen auf `b2023c1` (Plan 0016): `JS (initial)` 91,95 kB von 92 kB, Rest 0,05 kB. Plan 0019 (Route in Google Maps, Karte „Wege ab …“) braucht im Start geschätzt 0,7–0,8 kB.
- **Rückfrage an den Nutzer** mit drei Optionen: „Budget auf 93 kB (Empfohlen)“, „Kalender lazy, 92 kB bleibt“, „Wege-Karte lazy, Rest anheben“. **Antwort, wörtlich: „Budget auf 100kb“.**
- **Begründung:** Die billigen Kandidaten zum Auslagern sind verbraucht (Platzhalter von `NewsBlock`, Plan 0011). Der nächste wäre ein Umbau des Kalenders (−1,65 kB, `docs/ideas.md`). 8 kB gzip Luft reichen für die nächsten Pläne. Über Ladezeit und Bedienbarkeit wachen LCP < 2,5 s, CLS < 0,05 und die Schrift-Swap-Gates bei gedrosselter CPU und gedrosseltem Netz. Diese Gates bleiben unverändert.
- **Umsetzung:** `.size-limit.json` setzt `JS (initial)` auf 100 kB. Die Begründung steht hier und im Commit, weil die JSON-Datei keinen Kommentar tragen kann.
- **Ab jetzt** trägt jeder Plan, der das Start-JS ändert, hier sein Delta ein. So schwindet die Luft nicht unbemerkt. Wer nach einem anderen Plan merged, misst neu.

| Plan | vorher | nachher | Delta |
|---|---|---|---|
| 0019 Teil A (Link nach Google Maps) | 91,95 kB | 92,28 kB | +0,33 kB |
| 0019 Teil B (Karte „Wege ab …“; Lazy-Chunk `Wegzeit JS` 1,66 → 2,30 kB von 3 kB) | 92,28 kB | 92,82 kB | +0,54 kB |
| 0017 (Wochen-Push; Push-Code nur im Lazy-Chunk „Als App“, gemessen gegen b2023c1 +0,03 kB für Exporte des Einstiegs) | 92,82 kB | 92,78 kB (nach Rebase auf f317505) | ≈ 0 |
| 0022 (Stadtteil-Auswahl bei Standort aus; Installationsknopf im Fuß des Kind-Sheets, Logik im Lazy-Chunk „Als App“ 6,27 → 6,49 kB; gemessen nach 0023/0024 gegen 91663f6, vorher gegen a666dbe 93,24 → 93,37 kB) | 94,119 kB | 94,259 kB | +0,140 kB |
| 0023 (Zeitraumfilter „von / bis“ samt Arch-Review-Nacharbeit: Feldgrenzen, Hinweise, Fokus; gemessen nach 0024 gegen 3f57669, dessen Basis a666dbe schon die nicht eingetragenen Pläne 0020/0021 enthält) | 93,252 kB | 94,119 kB | +0,867 kB |
| 0024 (Karte im App-Look; kein neuer Start-Code, zwei zusätzliche Exporte des Einstiegs für den Karten-Chunk; Lazy-Chunk `Karte JS` 425,45 → 427,19 kB von 450 kB) | 93,244 kB | 93,252 kB | +0,008 kB |
| Nachschliff Browser-Review 0022–0024 (Zählzeile nennt den Zeitraum, `listStatusParts`; Karte: Straßennamen, Höhe, Start-Padding; Lazy-Chunk `Karte JS` 427,18 → 427,53 kB, CSS 11,505 → 11,535 kB; gemessen gegen bde7685) | 94,259 kB | 94,415 kB | +0,156 kB |
| 0026 Stufe 1 (Teilen per Link: `src/domain/share.ts` samt Export aus `route.ts`, `labels.ts` statt Texten in `format.ts`, `src/data/share.ts`, `useShare`, Sheet „Link zum Teilen“, Icon, Toast bei verschwundenem Angebot; Lazy-Chunk `Anbieter JS` 2,72 → 2,74 kB; Plan schätzte +0,4–0,5 kB; gemessen gegen 5701141). Aufschlüsselung (Arch-Review m8, Builds je Commit, Rest durch Weglassen gemessen): Teil 1 f44680b (`labels.ts`, `category-look.ts`, ohne Verdrahtung) +0,14 kB; Teil 2 9dd541f +0,76 kB, davon `src/domain/share.ts` mit ID-Prüfung etwa 0,12, `src/data/share.ts` 0,18, Sheet „Link zum Teilen“ 0,19, Rest 0,27 (`useShare`, Knöpfe, Icon, Texte, Toast); Arch-Review-Nacharbeit (ID-Höchstlängen) +0,02 kB. Nichts davon ist leicht vermeidbar: Teilen muss synchron im Start-Bundle liegen (E6), die Pfade haben eine Quelle (E1). | 94,41 kB | 95,33 kB | +0,92 kB |
| 0018 (Kalender-Export regelmäßiger Reihen nur altersgerecht: `exportSessions`/`seriesExport`/`collectionExport` in `saved.ts`, Toasts und Alterszeile in `format.ts`, Detail-Knopf mit Blob-Weg; Lader nach `src/ui/ics-export.ts`, Lazy-Chunk `Export JS` 1,151 → 1,152 kB; geschätzt +0,3 kB. Minifiziert laut Sourcemap: `format.ts` +0,98 kB, vor allem Texte, `saved.ts` +0,60, `DetailDialog.tsx` +0,39, `SavedView.tsx` −0,13 kB; kein ICS-Code im Start; gegen 5701141 allein 94,412 → 95,260 kB, +0,848 kB; hier gemessen nach dem Merge mit 0026 Stufe 1, ca60ec9) | 95,33 kB | 96,157 kB | +0,83 kB |
| Plan 0025, Etappe 1 (Anbieter merken: Suchfeld im Start, Herz-Logik, `providerRows` im Chunk; Lazy-Chunk `Anbieter JS` 2,744 → 3,085 kB von 6 kB, CSS 11,557 → 11,628 kB; gemessen gegen 3ba9ef0) | 96,157 kB | 96,493 kB | +0,336 kB |
| Plan 0025, Etappe 2 (Umschalter Liste \| Karte auf der Merkliste, Route `merkliste-karte`, `views.map` für beide Karten, neuer Kopf mit Statuszeile und rundem Export-Knopf; Lazy-Chunks unverändert, `Karte JS` 427,528 → 427,530 kB; CSS 11,640 → 11,732 kB; gemessen nach dem Merge gegen 2cce4ea). Summe Etappen 1 und 2: +0,652 kB von +2,5 kB (E11) | 96,493 kB | 96,809 kB | +0,316 kB |
| Plan 0025, Etappe 3 (Kalender der Merkliste: `SavedCalendar` mit Auswahl Tag/Woche/Monat, `rangeAgenda`, Titelknöpfe und Leerzustände; Tab „Kalender“ und Entdecken-Kalender entfallen, Tab-Leiste über `--n`; Lazy-Chunks unverändert bis auf Rundung, CSS 11,736 → 11,821 kB; gemessen gegen 8320e44). Summe Etappen 1–3: +1,227 kB von +2,5 kB (E11) | 96,812 kB | 97,387 kB | +0,575 kB |
| Merge Plan 0028 (`main` 497819d: `sessionFit`/`fittingSessions`, `shownSession`, Merkliste und Kalender der Merkliste nur mit altersgerechten Terminen) in Plan 0025 Etappe 3, dazu die Fixes aus dem Browser-Review von Etappe 2 (`.map-rest` im Platzhalter der Karte, Abstand unter dem Export-Knopf); nicht nach den beiden Teilen getrennt gemessen. Lazy-Chunks unverändert, CSS 11,821 → 11,846 kB. Gegen 8320e44 zusammen +0,789 kB | 97,387 kB | 97,601 kB | +0,214 kB |
| Plan 0025, Etappe 4 (Filter auf der Merkliste: `SavedFilter`, `applySavedFilter`, `toggleSavedFilter` in `saved.ts`, `quickRanges` in `date-range.ts`, Filterzeile `SavedFilters.tsx`, Filter-Varianten der Statuszeile, gefilterte Leerzustände; Lazy-Chunks unverändert, CSS 11,856 → 11,876 kB; gemessen gegen ca6d80d, dessen Stand nach den Merges von `main` bei 97,770 kB lag). Minifiziert laut Sourcemap: `SavedFilters.tsx` +1,15 kB, `SavedView.tsx` +0,64, `saved.ts` +0,61, `use-offer-views.ts` +0,36, `format.ts` +0,34, `date-range.ts` +0,18, `App.tsx` +0,14 kB (vor dem Verdichten der Chip-Liste). Summe Etappen 1–4: +2,167 kB, mit den Fixes aus Etappe 2 (im Merge mit Plan 0028 gemessen) höchstens +2,381 kB, von +2,5 kB (E11). Jeder weitere Zuwachs der Merkliste löst N5 aus | 97,770 kB | 98,710 kB | +0,940 kB |
| Plan 0025/0028, Abschlussrunde (Browser-Review live Etappe 3, Arch-Review Etappe 4: `collapsedSessions` in `agenda.ts` für die eingeklappte Terminliste im Detail, `ageHidden` in `rangeAgenda` mit `ageIndex` und Leerzustand „Nichts passt zum Alter“, `isSavedFilterChipOn` in `saved.ts`; Lazy-Chunks unverändert, CSS 11,876 → 11,897 kB; gemessen gegen 00b7ec7, gegen ca6d80d zusammen mit Etappe 4 +1,079 kB). Summe Etappen 1–4 mit Abschlussrunde: +2,306 kB, mit den Fixes aus Etappe 2 höchstens +2,520 kB, **über +2,5 kB: N5 ausgelöst**. Nutzerentscheid 2026-10-09: akzeptiert, Grenze für Plan 0025 nachträglich +2,6 kB, kein Lazy-Chunk; bis 100 kB bleiben etwa 1,15 kB | 98,710 kB | 98,849 kB | +0,139 kB |
| Plan 0015, Nachtrag A / Plan 0032, Stufe 0 (stabile IDs, ADR 0022: `shortId` mit cyrb53, `SHORT_ID_PATTERN`/`LEGACY_OFFER_ID_PATTERN`, `resolveOfferId`/`resolveProviderId`, `resolveRouteIds` in `useRoute`, `migrateSavedIds` und Altform-Zweig in `cleanSavedProviders`; geschätzt +0,3–0,45 kB; Lazy-Chunks unverändert bis auf Rundung; Service Worker 8,263 → 8,534 kB von 9 kB; `site.json` gzip 79,878 → 75,413 kB, roh 591,6 → 559,7 kB; `anbieter.json` gzip 6,997 → 7,111 kB, roh 27,6 → 26,7 kB; gemessen gegen a590278). Bis 100 kB bleiben etwa 0,72 kB | 98,857 kB | 99,280 kB | +0,423 kB |
