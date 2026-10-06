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
