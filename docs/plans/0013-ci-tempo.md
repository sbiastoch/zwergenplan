# Plan 0013 – Schnellere CI durch parallele E2E-Jobs

Status: umgesetzt (2026-10-05), inklusive Befund F1
Datum: 2026-10-05

(ADR 0002 Hosting, ADR 0004 Backpressure, `docs/architecture.md` Mobile-UX-Gates, Plan 0003 E8 Smoke allein und seriell, Plan 0011 ändert dieselben Dateien.)

## Ziel

- Ein CI-Lauf auf `main` dauert vom Push bis zum Deploy **höchstens 10 Minuten**, angestrebt sind etwa 6. Heute sind es 21–39 Minuten.
- Die Abdeckung bleibt gleich: dieselben 1911 Tests (Stand `d793791`), dieselben fünf Geräte, dieselben Gates, derselbe Smoke-Test mit echten Daten vor dem Deploy. Keine Schwelle, kein Timeout im Test und kein Retry ändert sich.
- Lokal ändert sich nichts: `pnpm e2e` und `pnpm check` laufen wie bisher alles.
- Ein neues Geräteprojekt in `playwright.config.ts` landet in der CI automatisch in den Shards seiner Engine, ohne dass jemand die Workflow-Datei anfasst. Ein Projekt, das in keiner CI-Suite landen würde (andere Engine, Abhängigkeiten in einer gesharden Suite), macht das Laden der Konfiguration rot, statt still zu fehlen.

## Nicht-Ziele

- **Weniger Tests oder Geräte.** `docs/architecture.md` verlangt jede Ansicht auf 360 px, Pixel 7, iPhone 15, quer und Desktop. Rein fachliche Specs (Kalender, Merkliste, Startpunkt …) auf weniger Geräten laufen zu lassen, spart grob 30–40 % Testzeit, ändert aber diese Regel und braucht ein ADR. Das geht als Idee nach `docs/ideas.md` (Schritt 6).
- **Die Selbsttests der Gates nur einmal laufen lassen** („Text-Gate erkennt …“, 8 Tests × 5 Geräte, lokal ca. 130 s Testzeit). Nach der Parallelisierung bringt das unter 20 s Wandzeit und ist eine eigene Entscheidung über Testinhalt. Ebenfalls Idee.
- **Browser-Cache oder Playwright-Docker-Image.** Von den ca. 45 s für `playwright install --with-deps` sind ca. 40 s apt-Pakete und nur ca. 12 s Browser-Download (Log von Lauf 37330344847). Ein Cache der Browser spart also kaum etwas. Das Docker-Image (ca. 2 GB) muss ebenfalls erst geladen werden. Beides wird nicht weiter verfolgt.
- Merge der HTML-Reports über die Shards (`merge-reports`, Blob-Reporter). Jeder Shard lädt bei Rot seinen eigenen Report hoch. Das reicht zum Debuggen.

## Ausgangslage

### Messung CI (Läufe 37319740077, 37328909791, 37330344847)

| Schritt | Dauer |
|---|---|
| Job „Statische Gates & Unit-Tests“ | 26–40 s |
| E2E-Job: Setup bis `pnpm install` | ca. 10 s |
| `playwright install --with-deps chromium webkit` | 37–55 s |
| `pnpm e2e`: beide Vite-Builds | ca. 10 s |
| `pnpm e2e`: Playwright | **15–27 min** („Running 1911 tests using 2 workers“, „1536 passed (27.2m)“, 375 übersprungen) |
| Deploy | ca. 20 s |

- Der E2E-Job wartet auf den Static-Job (`needs: check`), obwohl er ihn nicht braucht.
- Das Repo ist öffentlich (`gh repo view --json visibility`). `ubuntu-latest` hat damit 4 vCPUs, und Actions-Minuten kosten nichts. Playwright nimmt ohne `workers` die Hälfte der Kerne, also 2.
- Die Dauer wächst linear mit den Tests, jeder neue Test läuft fünfmal: von 15 min (Plan 0009) auf 27 min (Plan 0010).

### Messung lokal (Stand `903866a`, 1442 Tests, 4 Worker, JSON-Reporter)

Gesamt 2464 s Testzeit, 685 s Wandzeit. Die Hilfsfunktionen in `e2e/mobile-ux.ts` haben keine festen Wartezeiten. Die Zeit geht an echte Arbeit: axe, die DOM-Durchläufe von `expectTextFits`, das Software-WebGL der Karte.

| Projekt | Testzeit | Anteil |
|---|---|---|
| `iphone-15` (WebKit) | 922 s | 37 % |
| `pixel-7` | 470 s | 19 % |
| `android-klein` | 333 s | 14 % |
| `desktop` | 331 s | 13 % |
| `pixel-7-quer` | 325 s | 13 % |
| `smoke-echte-daten` | 82 s | 3 % |

Ein WebKit-Test kostet also etwa 2,5-mal so viel wie ein Chromium-Test (922 s gegenüber im Schnitt 365 s je Chromium-Projekt). Das teuerste Chromium-Projekt ist `pixel-7` (+29 % über dem Chromium-Schnitt). Die übersprungenen Tests kosten zusammen 24 s und spielen keine Rolle.

### Wie Playwright 1.63 shardet (gelesen in `playwright/lib/runner/index.js`, `filterForShard`)

- `--shard=i/n` teilt die Testgruppen in **zusammenhängende Abschnitte gleicher Testzahl, in Projektreihenfolge**. Die Kosten je Test spielen keine Rolle. Gewichte gibt es nur über die interne Variable `PWTEST_SHARD_WEIGHTS`, auf die wir uns nicht verlassen.
- **Projekte, die nur als Abhängigkeit mitlaufen, werden vor dem Sharding abgetrennt und in jedem Shard vollständig ausgeführt.** `smoke-echte-daten` hängt von allen fünf Geräteprojekten ab. Wer den Smoke-Test in einen Shard nimmt, ohne `--no-deps`, lässt dort alle 1890 Gerätetests noch einmal laufen.
- Daraus folgt: Smoke bekommt einen eigenen Job, und Chromium und WebKit werden getrennt geshardet, damit kein Shard überwiegend teure WebKit-Tests bekommt.

### Wer welchen Server braucht

Nur `e2e/smoke.spec.ts` und `e2e/font-swap.smoke.spec.ts` nutzen den Deploy-Build (`dist/`, Port `PW_PORT + 1`). Alle anderen Specs nutzen nur den Fixture-Build (`dist-e2e/`). Heute startet `webServer` immer beide Server, deshalb baut der E2E-Job beide.

## Entscheidungen

### E1 – Prüf-Jobs parallel, ein Sammelknoten vor dem Deploy

```
check ─────────────────┐
e2e (chromium 1..4) ───┤
e2e (webkit 1..2) ─────┼──► gates ──► deploy (nur main, nicht bei PR)
smoke (Deploy-Build) ──┘
```

- **`check`**: unverändert und weiter ein eigener Job. Plan 0011 hängt daran einen Output (`news`) für seinen Job `notify`.
- **`e2e`** (Matrix): je Engine und Shard ein Job. Er baut nur `dist-e2e/`, installiert nur seinen Browser und führt `playwright test --shard=<shard>/<total>` mit `PW_SUITE=<engine>` aus. `strategy.fail-fast: false`, damit ein roter Shard die anderen nicht abbricht. So sieht man alle Fehler eines Laufs auf einmal, und die Zählung (Test 2) bleibt auch bei Rot möglich. Matrix als `include`-Liste:
  ```yaml
  strategy:
    fail-fast: false
    matrix:
      include:
        - { engine: chromium, shard: 1, total: 4 }
        - { engine: chromium, shard: 2, total: 4 }
        - { engine: chromium, shard: 3, total: 4 }
        - { engine: chromium, shard: 4, total: 4 }
        - { engine: webkit, shard: 1, total: 2 }
        - { engine: webkit, shard: 2, total: 2 }
  ```
  Der Job heißt `E2E ${{ matrix.engine }} ${{ matrix.shard }}/${{ matrix.total }}`.
- **`smoke`**: baut `dist/` (Deploy-Build), installiert nur Chromium und führt `PW_SUITE=smoke` aus. Danach gibt er die Schrift-Swap-Werte aus, prüft `pnpm size` und lädt bei `main` das Pages-Artefakt hoch. Damit ist das deployte `dist/` genau der Build, den der Smoke-Test geprüft hat, wie heute. `fonts-liberation` (Arial-Ersatz für `font-swap.smoke.spec.ts`) kommt bei `--with-deps` mit jedem Browser, also auch mit Chromium allein.
- **`gates`**: `needs: [check, e2e, smoke]`, **ohne** Branch-Bedingung, nur `run: echo "alle Gates grün"`. Das ist der eine Knoten, der „alles grün“ bedeutet, auch auf Branches. Der Kanarienvogel (Test 3) zeigt dort, dass `gates` übersprungen wird. `deploy` allein kann das nicht zeigen, weil es auf Branches ohnehin übersprungen wird.
- **`deploy`**: `needs: gates`, Bedingung unverändert. Der spätere `notify` aus Plan 0011 bleibt bei `needs: [check, deploy]`.
- Kein Job wartet mehr auf `check`. Fällt `check` rot aus, laufen die anderen trotzdem zu Ende. Das kostet nichts, und der Deploy bleibt gesperrt.
- ADR 0002 beschreibt die Pipeline als „check → E2E → Deploy“. Gemeint ist, dass beides vor dem Deploy grün sein muss, und das bleibt erfüllt. Ein neues ADR ist nicht nötig. ADR 0002 bekommt einen Verweis auf diesen Plan.

Startaufteilung: Chromium 4 Shards, WebKit 2 Shards, je 2 Worker. Rechnung mit den CI-Zahlen: 1890 Gerätetests in ca. 25,7 min mit 2 Workern sind ca. 3080 Worker-Sekunden. Umgelegt auf Kosteneinheiten (Chromium-Test 1, WebKit-Test 2,5; 4 × 378 + 2,5 × 378 ≈ 2460 Einheiten) entfallen ca. 1890 s auf Chromium und ca. 1190 s auf WebKit. Je Shard mit 2 Workern sind das 1890 / 4 / 2 ≈ 235 s bzw. 1190 / 2 / 2 ≈ 300 s. Bei 4 Shards ist jeder Chromium-Shard genau ein Projekt, und der `pixel-7`-Shard liegt mit +29 % bei ca. 305 s. Mit ca. 1,5 min Setup ergibt das **ca. 6,5 min** bis zum Deploy. Die endgültige Aufteilung legt Schritt 3 nach Messung fest (E4). Vorab benannte Ausweichlösung, falls ein Shard mehr als 30 % über dem Schnitt liegt: ein 5. Chromium-Shard. Er verteilt `pixel-7` auf zwei Shards.

Jobs je Lauf: 1 + 6 + 1 = 8, dazu `deploy`. GitHub Free erlaubt 20 gleichzeitige Jobs je Konto. Zwei parallele Läufe passen, beim dritten warten einige Jobs kurz. Das ist hinnehmbar, Parallelität kostet sonst nichts.

### E2 – `PW_SUITE` wählt Projekte und Server in `playwright.config.ts`

Die Workflow-Datei zählt keine Projekte auf. Die Konfiguration filtert selbst:

```ts
/** CI teilt E2E nach Engine (Plan 0013). Ohne PW_SUITE läuft alles, wie lokal üblich. */
const SUITE = process.env["PW_SUITE"]; // undefined | "chromium" | "webkit" | "smoke"
```

- Die Geräteprojekte stehen wie heute in einer Liste. Ihre Engine kommt aus dem Gerät (`devices[…].defaultBrowserType`), nicht aus einem zweiten Eintrag.
- `SUITE === "chromium" | "webkit"`: nur die Geräteprojekte dieser Engine, nur der Fixture-Server.
- `SUITE === "smoke"`: nur `smoke-echte-daten`, **ohne `dependencies`**, nur der Server mit echten Daten. `fullyParallel: false` bleibt.
- `SUITE` undefiniert: alle Projekte, beide Server, Smoke mit `dependencies` wie heute.
- Das Smoke-Projekt bekommt immer `workers: 1` (Projektfeld, gibt es in 1.63). `fullyParallel: false` macht nur jede Datei seriell. Mit 2 Workern liefen `smoke.spec.ts` (LCP bei 4× gedrosselter CPU) und `font-swap.smoke.spec.ts` (CLS) sonst gleichzeitig und mäßen sich gegenseitig. Das kostet im Smoke-Job ca. 1 min, und er ist nicht der längste Job. Erst damit läuft der Smoke-Test so allein, wie es Plan 0003 E8 will.
- Der Kommentar am Smoke-Projekt nennt beide Wege: lokal seriell nach allen anderen über `dependencies`, in CI allein im eigenen Job über `PW_SUITE=smoke`.
- **Wächter beim Laden der Konfiguration** (immer, auch lokal, damit ein Fehler sofort auffällt):
  - Jedes Projekt außer `smoke-echte-daten` hat eine Engine aus `["chromium", "webkit"]`. Sonst `throw` mit dem Hinweis, Suite und Matrix in `ci.yml` zu ergänzen. Ein Firefox-Gerät fiele sonst still aus der CI.
  - Kein Projekt einer gesharden Suite hat `dependencies`. Sonst `throw`. Abhängigkeiten liefen in jedem Shard komplett mit (siehe Ausgangslage), etwa ein Setup-Projekt für die Service-Worker-Specs aus Plan 0011.
  - Jeder andere Wert von `PW_SUITE` und jede Auswahl ohne Projekt wirft. Ein Tippfehler im Workflow wird also rot, statt still nichts zu testen.

Lokal lässt sich jeder CI-Job nachstellen: `PW_SUITE=webkit pnpm exec playwright test --shard=1/2`.

### E3 – Bauen und Browser je Job

| Job | Build | Browser |
|---|---|---|
| `e2e` chromium | `pnpm build:e2e` | `playwright install --with-deps chromium` |
| `e2e` webkit | `pnpm build:e2e` | `playwright install --with-deps webkit` |
| `smoke` | `pnpm build` | `playwright install --with-deps chromium` |

`pnpm e2e` bleibt für lokal unverändert (baut beides, testet alles). Die CI ruft die Teilschritte direkt auf.

### E4 – Worker und Shard-Zahl nach Messung

Schritt 3 misst zwei Varianten auf dem Branch, jede in zwei Läufen:

- **A**: Chromium 4 Shards, WebKit 2 Shards, `--workers=2`.
- **B**: Chromium 2 Shards, WebKit 1 Shard, `--workers=4`. Das sind halb so viele Jobs, wenn 4 Worker auf 4 vCPUs fast doppelt so schnell sind.

Gewählt wird B nur, wenn alle drei Bedingungen erfüllt sind. Sonst gilt A.

1. Der langsamste E2E-Job braucht höchstens 20 % länger als bei A.
2. Beide Läufe kommen ohne „flaky“ (in der Zusammenfassung von Playwright) durch.
3. Die Messwerte der lastempfindlichen Gerätetests rücken nicht deutlich ans Budget: LCP und CLS aus `e2e/perf.spec.ts` (LCP < 2500 ms bei 4× CPU-Drosselung, „Wegzeit lädt …“ mit CLS). Ein LCP knapp unter dem Budget wird nicht „flaky“, sondern ist grün oder dauerhaft rot. Deshalb zählen die Werte selbst und nicht nur grün oder rot. „Deutlich“ heißt: Die Marge zum Budget schrumpft um mehr als die Hälfte.

Ebenfalls gegen 4 Worker spricht die Karte: Sie rendert per Software-WebGL und wird unter Last langsamer bereit (`MAP_READY`, 20 s). Später kommen die LCP-Specs mit Service Worker aus Plan 0011 dazu.

Damit die Werte aus Bedingung 3 sichtbar sind, schreibt `perf.spec.ts` sie als Annotation (`test.info().annotations`). Der `github`-Reporter zeigt sie nicht, deshalb kommt zusätzlich ein `console.log` mit festem Präfix (`[perf]`) dazu, das im Job-Log steht. Das ist eine reine Ausgabe. Assertion und Schwelle bleiben unverändert.

Die gewählten Werte stehen in der Matrix in `ci.yml`, mit einem Kommentar, der die Messung nennt.

### E5 – Reports und Timeouts

- Reporter in CI unverändert (`github` + `html`). Bei Rot lädt jeder Job `playwright-report-<job>-<shard>` hoch. Die Namen müssen eindeutig sein, sonst bricht `upload-artifact@v4` ab.
- `timeout-minutes` je E2E- und Smoke-Job: das Doppelte des längsten gemessenen Laufs, aufgerundet auf 5 min. Es bleibt ein Schutz gegen Hänger, kein Gate. Der Kommentar nennt die Messung.
- `concurrency` bleibt wie heute.

## Struktur

- `playwright.config.ts`: `PW_SUITE`, Filter von `projects` und `webServer`, Wächter, `workers: 1` am Smoke-Projekt (E2).
- `.github/workflows/ci.yml`: Jobs `check`, `e2e` (Matrix), `smoke`, `gates`, `deploy` (E1, E3, E5).
- `e2e/perf.spec.ts`: Messwerte als Annotation und `[perf]`-Logzeile (E4), ohne Änderung an den Assertions.
- `CLAUDE.md`, Stolperfallen: ein Satz zu `PW_SUITE` und zum lokalen Nachstellen eines Shards.
- `docs/adr/0002-hosting-datenfluss.md`: Verweis auf Plan 0013 bei „check → E2E → Deploy“.
- `docs/ideas.md`: zwei Einträge (Nicht-Ziele 1 und 2).
- Keine neue Abhängigkeit, kein neues Modul, keine Änderung an `src/` oder an Schwellen.

**Zusammenspiel mit Plan 0011** (ändert ebenfalls `ci.yml`: Job `notify`, Output `news` aus `check`; und `playwright.config.ts`: `serviceWorkers: "block"`). Wer zuerst nach `main` kommt, bleibt maßgeblich, der andere Plan rebased. Nach dem Rebase gilt:
- `check` bleibt ein eigener Job mit seinen Outputs.
- `notify` hängt an `deploy`.
- `serviceWorkers` steht in `use` und gilt damit für alle Suites.
- Ein Setup-Projekt für Service-Worker-Specs darf nicht als Abhängigkeit einer gesharden Suite eingehängt werden (Wächter in E2).

## Tests und Backpressure

Die Änderung betrifft nur die Prüf-Infrastruktur, deshalb gibt es keinen neuen Unit-Test. Belegt wird mit Zählungen und Kanarienvögeln (ADR 0004):

1. **Vollständigkeit lokal**: `pnpm exec playwright test --list` (alles) ergibt dieselbe Gesamtzahl wie die Summe aus `PW_SUITE=chromium … --list`, `PW_SUITE=webkit … --list` und `PW_SUITE=smoke … --list`. Heute: 1911 = 4 × 378 + 378 + 21.
2. **Vollständigkeit in CI**: Die Summe aus „passed“, „skipped“ und „flaky“ über alle E2E- und Smoke-Jobs eines Laufs ist 1911 (bzw. die aktuelle Zahl aus Punkt 1).
3. **Kanarienvogel Shard**: Ein absichtlich roter Test in einem Geräte-Spec (nur auf dem Branch, eigener Commit, z. B. mit `test.skip` für alle Projekte außer `desktop`) macht genau den Shard rot, der ihn enthält. Die anderen Shards laufen grün zu Ende (`fail-fast: false`). `gates` wird übersprungen. Danach wird der Commit zurückgenommen.
4. **Kanarienvogel Smoke-Build**: Den Smoke-Job auf dem Branch einmal gegen `dist-e2e/` laufen lassen (eigener Commit, `--outDir dist-e2e` im Server für `PW_SUITE=smoke`). Er muss am `__zpMap`-Check in `e2e/smoke.spec.ts` rot werden. Das belegt, dass der Smoke-Job wirklich den Deploy-Build prüft. Danach zurücknehmen.
5. **Kanarienvogel `PW_SUITE`**: `PW_SUITE=chromum pnpm exec playwright test --list` bricht mit Fehlermeldung ab.
6. **Kanarienvogel Engine und Abhängigkeit** (lokal, nicht committet):
   - Ein temporäres Projekt mit `devices["Desktop Firefox"]` lässt `pnpm exec playwright test --list` mit dem Hinweis auf `ci.yml` abbrechen.
   - Ein temporäres `dependencies: ["desktop"]` an `pixel-7` lässt `PW_SUITE=chromium … --list` abbrechen.
7. `pnpm check:fast` grün (Biome und Typen decken die Konfiguration ab).

## Schritte

Auf einem eigenen Branch (`worktree-ci-tempo`). CI läuft auf jedem Branch, ohne Deploy.

1. **Konfiguration** (E2) und **`perf.spec.ts`-Ausgabe** (E4). Fertig, wenn Tests 1, 5, 6 und 7 lokal grün sind und ein voller lokaler Lauf ohne `PW_SUITE` (`PW_PORT=4373 pnpm e2e`) grün ist.
2. **Workflow, Variante A** (E1, E3, E5 mit vorläufig 20 min Timeout). Push. Fertig, wenn der Lauf grün ist, Test 2 stimmt und im Log des Smoke-Jobs die Swap-Werte und die size-limit-Tabelle stehen.
3. **Messen** (E4): Variante A ein zweites Mal ausführen (`gh run rerun`), danach Variante B als eigener Commit, zwei Läufe. Je Lauf notieren (Tabelle im Abschnitt „Ergebnis“):
   - die Dauer jedes Jobs,
   - die Wartezeit in der Queue (`createdAt` bis `startedAt` je Job aus `gh run view --json jobs`),
   - die Zahl „flaky“,
   - die `[perf]`-Werte.

   Danach die Variante festlegen und die Timeouts nach E5 setzen. Fertig, wenn die Tabelle steht und die gewählte Variante committet ist.
4. **Kanarienvögel in CI** (Tests 3 und 4). Fertig, wenn die roten Läufe und der danach wieder grüne Lauf verlinkt sind.
5. **Doku**:
   - `CLAUDE.md` (Stolperfallen).
   - ADR 0002 (Verweis).
   - In `ci.yml` die Kommentare mit den Messwerten. Der Kommentar „Gemessen: E2E 16,7 → 17,3 → 18,8 Min.“ am alten Job entfällt.
   - In `playwright.config.ts` der Kommentar am Smoke-Projekt (E2).
6. **`docs/ideas.md`**: „Gerätematrix für fachliche Specs ausdünnen (braucht ADR, ändert die Mobile-UX-Regel in `docs/architecture.md`, spart grob 30–40 % Testzeit, Messung in Plan 0013)“ und „Selbsttests der Gates nur auf einem Gerät“.
7. **Fast-Forward nach `main`**, Push, `gh run watch`. Fertig, wenn der Lauf auf `main` grün ist, der Deploy gelaufen ist, die Live-Seite den Stand zeigt (`curl -s https://zwergenplan.app/data/meta.json`) und die Dauer vom Push bis zum Deploy unter 10 min liegt.

`/arch-review` ist nicht nötig: kein neues Modul, keine Abhängigkeit, keine Schemaänderung, deutlich unter 200 Zeilen. `/browser-review` ist nicht nötig, es ändert sich keine UI.

## Akzeptanzkriterien

- Push bis Deploy auf `main` ≤ 10 min, in zwei aufeinanderfolgenden Läufen. Gemessen wird ohne die Wartezeit in der Runner-Queue: vom frühesten `startedAt` bis zum Ende von `deploy`, abzüglich der Queue-Zeit von `gates` und `deploy`. Die Wartezeit wird daneben notiert. Ist sie regelmäßig über 1 min, kommt das als Befund in den Abschnitt „Ergebnis“ und spricht für Variante B.
- Die Zahl der ausgeführten Tests je Lauf ist dieselbe wie vorher (Test 2).
- Rot in einem einzigen Shard sperrt `gates` und damit den Deploy (Test 3).
- Der Smoke-Test läuft allein (1 Worker) auf seinem Runner gegen den Build, der deployt wird (Test 4).
- Lokal liefern `pnpm e2e` und `pnpm check` dasselbe wie vorher.

## Risiken

- **Ungleiche Shards.** Playwright teilt nach Testzahl, nicht nach Dauer. Innerhalb einer Engine sind die Projekte ähnlich teuer (Chromium-Projekte lokal 325–470 s). Der `pixel-7`-Shard liegt mit +29 % direkt an der Grenze. → Messung in Schritt 3. Ist ein Shard mehr als 30 % langsamer als der Schnitt, kommt der 5. Chromium-Shard aus E1 dazu.
- **Concurrency-Limit (20 Jobs).** Mehrere Sessions pushen parallel auf verschiedene Branches, je Lauf sind es 8 Jobs. → Bei sichtbarem Warten ist Variante B (5 Jobs) im Vorteil. Das fließt in E4 ein, wenn beide Varianten ähnlich schnell sind.
- **Mehr Last, mehr Wackler.** Mit 4 Workern kippen knappe Timings (Karte). → E4 verlangt null „flaky“ in zwei Läufen. Retries bleiben bei 1, und ein Wackler zählt nicht als grün für die Wahl.
- **Smoke ohne `dependencies` in CI.** Der Smoke-Test lief bisher nach den Gerätetests, damit er die Seite misst und nicht die Konkurrenz paralleler Worker (Plan 0003, E8). Im eigenen Job mit `workers: 1` läuft er allein auf seinem Runner, Datei für Datei. Das erfüllt die Absicht besser als bisher: Vorher liefen `smoke.spec.ts` und `font-swap.smoke.spec.ts` auf zwei Workern gleichzeitig.
- **Fehlende Schritte im neuen Smoke-Job.** Schrift-Swap-Ausgabe, `pnpm size` und Pages-Artefakt wandern mit. Die Plausibilität gegen den Live-Stand bleibt in `check`. → Abnahme in Schritt 2: Im Log stehen die Swap-Werte und die size-limit-Tabelle.

## Review (2026-10-05, plan-reviewer, Runde 1) – Verdict: Freigabe mit Änderungen → eingearbeitet

Kein Blocker. Der Reviewer hat die Kernannahmen im Quellcode bzw. per API bestätigt: `filterForShard` teilt nur nach Testzahl, reine Abhängigkeitsprojekte laufen in jedem Shard komplett, das Repo ist öffentlich, das Limit liegt bei 20 gleichzeitigen Jobs, `fonts-liberation` kommt mit jedem Browser, und `size` liest nur `dist/`.

Übernommen:
- **W1** `fail-fast: false` und die Matrix als `include`-Liste (E1).
- **W2** Sammeljob `gates`, an dem `deploy` hängt. Der Kanarienvogel belegt auf dem Branch, dass `gates` übersprungen wird (E1, Test 3).
- **W3** Wächter beim Laden der Konfiguration: nur `chromium` oder `webkit`, keine `dependencies` in gesharden Suites. Dazu Kanarienvögel (E2, Test 6, Ziel).
- **W4** `workers: 1` am Smoke-Projekt, damit `smoke.spec.ts` und `font-swap.smoke.spec.ts` nicht gleichzeitig messen (E2, Risiken).
- **W5** LCP- und CLS-Werte aus `perf.spec.ts` als dritte Bedingung für 4 Worker. Die Werte kommen per Annotation und `[perf]`-Logzeile ins Log (E4, Schritt 3).
- **H6** WebKit 2,5× statt 2×, Rechnung korrigiert. Ein 5. Chromium-Shard ist als Ausweichlösung benannt (E1, Risiken).
- **H7** Zusammenspiel mit Plan 0011: `check` bleibt ein eigener Job, und wer später nach `main` kommt, rebased (Struktur).
- **H8** ADR 0002 („check → E2E → Deploy“): Die Absicht bleibt erfüllt, es gibt einen Verweis statt eines neuen ADR (E1, Struktur).
- **H9** Kanarienvogel Smoke gegen `dist-e2e/`: muss am `__zpMap`-Check rot werden (Test 4).
- **H10** Kommentar am Smoke-Projekt nennt beide Wege (E2, Schritt 5).
- **H11** Abnahmezeit ohne Queue, Queue-Zeit wird daneben notiert (Akzeptanzkriterien, Schritt 3).

Abgelehnt: nichts.

## Ergebnis (2026-10-05)

Umgesetzt auf `worktree-ci-tempo` (abgezweigt vom Plan-Branch), per Fast-Forward nach `main`.

### Lokal (Schritt 1)

- **Test 1**: `--list` ohne `PW_SUITE` 1911 Tests = 1512 (`chromium`) + 378 (`webkit`) + 21 (`smoke`).
- **Test 5**: `PW_SUITE=chromum` wirft: „PW_SUITE=chromum ist unbekannt. Erlaubt: chromium, webkit, smoke oder leer.“
- **Test 6**: Ein temporäres Projekt mit `devices["Desktop Firefox"]` wirft: „Projekt firefox-test: Engine firefox hat keine CI-Suite. PW_SUITE hier und die Matrix in .github/workflows/ci.yml ergänzen (Plan 0013).“ Ein temporäres `dependencies: ["desktop"]` an `pixel-7` wirft bei `PW_SUITE=chromium` (und auch ohne): „Projekt pixel-7: dependencies in einer geshardeten Suite laufen in jedem Shard komplett mit (Plan 0013, E2).“
- **Test 7**: `pnpm check:fast` grün.
- Voller Lauf `PW_PORT=4373 pnpm e2e` ohne `PW_SUITE`: grün, 1538 passed, 373 skipped (11,8 min, 8 Worker). Lokal ist Noto installiert, deshalb 2 Swap-Tests mehr als in CI.
- `PW_SUITE=smoke` mit `CI=1`: „Running 21 tests using 1 worker“, 21 passed. Die `[perf]`-Zeilen erscheinen auch im CI-Modus: Weil der `github`-Reporter nicht auf stdout schreibt, hängt Playwright dort den `dot`-Reporter an, und der gibt die Konsolenausgabe der Tests aus.

### Messung in CI (Schritt 3)

Dauer je Job vom Start bis zum Ende, Queue von `created_at` bis `started_at` (Jobs-API). In allen Läufen 0 „flaky“, 1536 passed + 375 skipped = 1911 (Test 2).

| Job | A1 | A2 | B1 | B2 |
|---|---|---|---|---|
| Lauf | [37345119548 #1](https://github.com/sbiastoch/zwergenplan/actions/runs/37345119548/attempts/1) | [37345119548 #2](https://github.com/sbiastoch/zwergenplan/actions/runs/37345119548/attempts/2) | [37346996607 #1](https://github.com/sbiastoch/zwergenplan/actions/runs/37346996607/attempts/1) | [37346996607 #2](https://github.com/sbiastoch/zwergenplan/actions/runs/37346996607/attempts/2) |
| check | 0,6 min / 4 s | 0,6 / 2 s | 0,6 / 2 s | 0,5 / 2 s |
| chromium 1/4 (A) bzw. 1/2 (B) | 4,5 / 4 s | 3,4 / 2 s | 5,3 / 2 s | **8,0** / 3 s |
| chromium 2/4 (`pixel-7`) bzw. 2/2 | 5,5 / 3 s | 5,6 / 3 s | 5,7 / 3 s | 6,8 / 2 s |
| chromium 3/4 | 4,3 / 3 s | 4,3 / 2 s | – | – |
| chromium 4/4 | 4,4 / 2 s | 3,5 / 2 s | – | – |
| webkit 1/2 (A) bzw. 1/1 (B) | 3,9 / 3 s | 5,8 / 2 s | **6,8** / 3 s | 7,3 / 3 s |
| webkit 2/2 | **6,2** / 4 s | **6,1** / 2 s | – | – |
| smoke | 2,6 / 2 s | 2,5 / 2 s | 2,5 / 3 s | 2,6 / 2 s |
| gates | 0,1 / 4 s | 0,1 / 2 s | 0,1 / 2 s | 0,1 / 3 s |
| erster Start bis gates | 6,4 min | 6,2 min | 6,9 min | 8,2 min |

Reiner Testschritt (ohne Setup), A1/A2: `pixel-7` 297/300 s, die anderen Chromium-Shards 166–229 s, webkit 2/2 311/315 s. Setup bis zum Test: ca. 35 s, davon `playwright install` 20–29 s (Chromium) und 33–60 s (WebKit).

`[perf]`-Werte (LCP in ms; Budget 2500 ms):

| Projekt | A1 | A2 | B1 | B2 |
|---|---|---|---|---|
| `android-klein` | 1456 | 1176 | 1216 | 1592 |
| `pixel-7` | 1428 | 1448 | 1280 | **2044** |
| `pixel-7-quer` | 1212 | 1216 | 1228 | 1396 |

CLS war in allen Läufen gleich: 0,00028 / 0,00046 / 0,00021 (LCP-Test), 0 („Wegzeit lädt …“). Budget 0,05.

**Wahl: Variante A.** B verfehlt zwei der drei Bedingungen aus E4:
1. Langsamster E2E-Job B 6,8 bzw. 8,0 min gegen A 6,2 min: +10 % bzw. **+29 %** (erlaubt +20 %).
2. Kein „flaky“: erfüllt.
3. LCP `pixel-7` in B2 2044 ms: Die Marge zum Budget fällt von ca. 1060 ms (A) auf 456 ms, also um mehr als die Hälfte.

Queue-Zeit lag in allen Läufen bei 2–4 s je Job, kein Befund.

**Timeouts (E5)**: E2E 15 min (2 × 6,2 min, aufgerundet), Smoke 10 min (2 × 2,6 min, aufgerundet).

### Kanarienvögel in CI (Schritt 4)

- **Test 3** ([Lauf 37349973498](https://github.com/sbiastoch/zwergenplan/actions/runs/37349973498), Commit `01a218a`): Rot ist nur `E2E chromium 4/4` mit 1 failed („Kanarienvogel Plan 0013: absichtlich rot auf desktop“). Die anderen sieben Jobs liefen grün zu Ende, `gates` und `deploy` wurden übersprungen. Summe 1916 = 1911 + 5 (der Kanarienvogel auf jedem Gerät, auf vier davon übersprungen). Zurückgenommen in `d2eff0c`.
- **Test 4** ([Lauf 37350873604](https://github.com/sbiastoch/zwergenplan/actions/runs/37350873604), Commit `acc6ef5`, Server für `PW_SUITE=smoke` auf `dist-e2e/`, dort E2E-Build mit echten Daten, siehe Abweichungen): Rot ist nur der Smoke-Job mit genau 1 failed, im Test „Karte ist bereit, Orts-Liste vollständig, kein Test-Haken im Deploy-Build“ an `e2e/smoke.spec.ts:138` (`"__zpMap" in window`, Expected false, Received true). Alle E2E-Shards grün, `gates` übersprungen. Zurückgenommen in `4afcffa`.
- Wieder grün nach beiden Rücknahmen: [Lauf 37358265120](https://github.com/sbiastoch/zwergenplan/actions/runs/37358265120) (`10643e8`): 1911 Tests, 0 flaky, 6,3 min.

### Befund F1: Swap-Messung verwirft Shifts nach einer Viewport-Änderung (Nachtrag 2026-10-05)

**Beobachtung.** Nach dem Fast-Forward waren drei main-Läufe hintereinander rot, alle in `E2E chromium 2/4` (`pixel-7`), immer in den Gegen-Kanarienvögeln von `e2e/font-swap.spec.ts`:
- [37359159821](https://github.com/sbiastoch/zwergenplan/actions/runs/37359159821) (`10643e8`): „zählt einen Shift direkt nach der Grenze“.
- [37360033809](https://github.com/sbiastoch/zwergenplan/actions/runs/37360033809) (`693ffd1`): dazu „erkennt Roboto ohne Breitenanpassung“.
- [37361003270](https://github.com/sbiastoch/zwergenplan/actions/runs/37361003270) (`workflow_dispatch`): wie der erste.

Gemessen wurde jeweils CLS 0 statt > 0,05, im ersten Versuch und im Retry. Derselbe Fehler trat schon vor diesem Plan auf, in [37332253362](https://github.com/sbiastoch/zwergenplan/actions/runs/37332253362) (Branch `spike-push-0011`, alter Einzel-Job). Mit der Parallelisierung hat er nichts zu tun.

**Ursache** (Diagnose-Branch `diag-font-swap`, [Lauf 37362036634](https://github.com/sbiastoch/zwergenplan/actions/runs/37362036634): sechs Runner, je 40 Wiederholungen, alle `layout-shift`-Einträge roh protokolliert):
- Auf einem der sechs Runner tragen alle Shifts in den ersten ca. 550–580 ms nach dem Navigationsstart `hadRecentInput: true`, auch die künstliche Verschiebung um 120 px. `observeVitals` verwirft solche Einträge, also misst der Test 0 (4 von 40 rot).
- Eine Eingabe gibt es im Test nicht. Chrome zählt aber eine Viewport-Änderung als Eingabe. `measureSwap` setzt die Größe mit `setViewportSize` vor `goto`. Auf diesem Runner kam die neue Größe erst im neuen Dokument an (Trace: erstes Bild 839 px hoch, dann 915 px). Das 500-ms-Fenster reichte deshalb bis über die Grenze.
- Lokal deterministisch nachgestellt: Eine Viewport-Änderung direkt vor der Grenze macht „Shift nach der Grenze“ rot, 5 von 5.

Das ist ein **Loch im Swap-Gate**, nicht nur ein wackelnder Test. Ein echter Swap-Shift in diesem Fenster würde ebenso verworfen, und das Gate bliebe grün.

**Entscheidung** (nach Review, siehe unten):
- **Ursache abstellen**: `measureSwap` ändert den Viewport nicht mehr. Er kommt aus `test.use({ viewport })` (font-swap.spec.ts: 412×915, font-swap.smoke.spec.ts: je Breite ein `describe`). `measureSwap` prüft vor der Grenze `innerWidth`/`innerHeight` gegen die erwartete Größe.
- **Zweite Sicherung**: `observeVitals` schreibt jeden Shift mit, samt Merkmal `input` (`hadRecentInput`). `clsFrom(vitals, from, { withInput })` lässt Eingabe-Shifts standardmäßig weg. Das ist die CLS-Definition und gilt für `perf.spec.ts`, `smoke.spec.ts` und `anbieter-inhalt.spec.ts`; Letzteres summierte bisher selbst und nutzt jetzt `clsFrom`. `measureSwap` zählt ab der Grenze alle Shifts (`withInput: true`). Zwischen Grenze und `release()` steht keine Eingabe, ein Eingabe-Shift ist dort ein Artefakt. Das hält ein Kommentar an `measureSwap` fest. `detail` markiert Eingabe-Shifts mit `[input]`.
- Schwellen unverändert. Die Gates mit `< 0,05` werden nur strenger. Die Gegen-Kanarienvögel mit `> 0,05` könnten durch ein Eingabe-Artefakt grün werden. Da der Viewport nicht mehr wechselt, gibt es dieses Artefakt aber nicht mehr.
- **Neuer Kanarienvogel** in `font-swap.spec.ts`: Viewport-Änderung direkt vor der Grenze, danach die künstliche Verschiebung. Er muss > 0,05 messen.
- Verworfen: die Grenze erst 500 ms nach der letzten Größenänderung setzen. Das hängt an der Annahme über den Auslöser des Fensters und kostet Zeit.

**Belege lokal**:
- Neuer Kanarienvogel ohne Korrektur: 5 von 5 rot (`Received: 0`).
- Mit Korrektur grün; nimmt man nur `withInput` wieder heraus: 3 von 3 rot.
- `font-swap.spec.ts` 10 Wiederholungen: 50 passed.
- `anbieter-inhalt.spec.ts`: 65 passed.
- `font-swap.smoke.spec.ts`: 8 passed, CLS 0,0000–0,0024.

**Review (plan-reviewer, Freigabe mit Änderungen, eingearbeitet)**: W1 `anbieter-inhalt.spec.ts` auf `clsFrom`. W2 Viewport per `test.use` statt nur die Wirkung abzufangen, plus Größenprüfung. W3 Abnahme in CI muss einen Eingabe-Shift nach der Grenze zeigen, sonst beweist „0 Rote“ nichts. Hinweise: `[input]` in `detail`, Optionsobjekt, Doku (Kopf von `vitals.ts`, `docs/architecture.md`), Kommentar „keine Eingabe zwischen Grenze und `release()`“.

**Abnahme in CI**:
- Diagnose-Branch `diag-font-swap-2`, [Lauf 37363992113](https://github.com/sbiastoch/zwergenplan/actions/runs/37363992113): Korrektur `32db3b0` plus Protokoll der Eingabe-Shifts nach der Grenze, `font-swap.spec.ts` 10× je Runner.
- Wegen eines GitHub-Actions-Störfalls (Verzögerungen bei der Runner-Zuteilung ab 19:12Z, Jobs nach 15 min ohne Runner abgebrochen) kamen über zwei Versuche 4 von 6 Runnern durch. Das sind 200 Messungen, alle grün.
- Normale Messungen: kein Eingabe-Shift nach der Grenze (`input 0`), die Ursache ist also weg.
- Viewport-Kanarienvogel: 1–2 Eingabe-Shifts nach der Grenze, Summe 0,091, gezählt und grün. Damit ist die Bedingung aus W3 erfüllt: Eine Messung mit Eingabe-Shift nach der Grenze ist dabei, und weder Gate noch Gegen-Kanarienvögel werden falsch rot.

### Abweichungen vom Plan

- **`console.warn` statt `console.log`** für die `[perf]`-Zeile: Biome erlaubt in `e2e/` nur `warn` und `error` (`noConsole`). Ein `biome-ignore` wäre die schlechtere Wahl.
- **Kanarienvogel 4 mit echten Daten im E2E-Build.** Gegen das normale `dist-e2e/` (Fixtures) wird der Smoke-Job zwar rot, aber schon an den Datenprüfungen: lokal 9 rote Tests, im `__zpMap`-Test bereits an „≥ 50 Orte“ (Fixtures: 5). Damit ist nicht gezeigt, dass der Build-Unterschied selbst auffällt. Der Kanarienvogel baut deshalb nach `pnpm build` zusätzlich `ZWERGENPLAN_DATA=fixture vite build`: E2E-Build (`__E2E__`) mit den echten Daten aus `public/`. Lokal war damit genau ein Test rot, am `__zpMap`-Check (`e2e/smoke.spec.ts:138`).
- **Kein 5. Chromium-Shard.** Der `pixel-7`-Shard liegt im Testschritt 24–40 % über dem Chromium-Schnitt, also über der 30-%-Grenze aus „Risiken“. Er ist aber nicht der kritische Pfad: `webkit 2/2` ist in beiden A-Läufen der längste Job (6,1–6,2 min gegen 5,5–5,6 min). Ein 5. Shard kostet einen Job und verkürzt den Lauf nicht. Wird WebKit schneller oder `pixel-7` teurer, ist das wieder die erste Stellschraube.
- `PW_SUITE=""` gilt wie „nicht gesetzt“.
- Der Branch liegt im Worktree `plan-ci-tempo`, nicht in einem neuen Worktree. Die Session war an diesen Worktree gebunden.

### Abnahme auf `main` (Schritt 7)

- Erster Fast-Forward `d793791..10643e8`: Die main-Läufe [37359159821](https://github.com/sbiastoch/zwergenplan/actions/runs/37359159821), [37360033809](https://github.com/sbiastoch/zwergenplan/actions/runs/37360033809) (`693ffd1`, Commit einer anderen Session) und [37361003270](https://github.com/sbiastoch/zwergenplan/actions/runs/37361003270) waren rot, wegen Befund F1. `gates` hat den Deploy jedes Mal gesperrt, live blieb `d793791`. Das ist zugleich der Beleg für das Akzeptanzkriterium „Rot in einem Shard sperrt den Deploy“ auf `main`.
- Branch mit Korrektur ([Lauf 37364042075](https://github.com/sbiastoch/zwergenplan/actions/runs/37364042075), `32db3b0`): grün, 1916 Tests (1911 + neuer Kanarienvogel auf 5 Projekten), 0 flaky. Wegen des GitHub-Actions-Störfalls (19:12–21:32Z, zeitweise „major outage“) brauchte es drei Wiederholungen der abgebrochenen Jobs. Die Laufzeit dieses Laufs ist deshalb nicht aussagekräftig.
- Fast-Forward `693ffd1..32db3b0` um 21:39:39Z. Abnahme mit zwei aufeinanderfolgenden Läufen auf `main`:

| | M3 (Push) | M4 (`workflow_dispatch`) |
|---|---|---|
| Lauf | [37377322577](https://github.com/sbiastoch/zwergenplan/actions/runs/37377322577) | [37378235579](https://github.com/sbiastoch/zwergenplan/actions/runs/37378235579) |
| check | 0,6 min | 0,4 min |
| chromium 1/4 · 2/4 · 3/4 · 4/4 | 4,9 · 5,5 · 3,5 · 4,6 min | 6,3 · 5,7 · 4,5 · 4,6 min |
| webkit 1/2 · 2/2 | 6,1 · 6,0 min | 5,9 · 5,8 min |
| smoke | 3,1 min | 2,7 min |
| Queue je Job | 2–3 s | 2–3 s |
| Tests | 1537 passed + 379 skipped = 1916, 0 flaky | 1537 + 379 = 1916, 0 flaky |
| LCP `android-klein` / `pixel-7` / `pixel-7-quer` | 1380 / 1372 / 1084 ms | 1900 / 1404 / 1192 ms |
| **Start bis Deploy-Ende ohne Queue** | **6,4 min** | **6,5 min** |

- Live (`curl -s https://zwergenplan.app/data/meta.json`) nach M3: `"commit": "32db3b0"`.
- Akzeptanzkriterien:
  - ≤ 10 min in zwei aufeinanderfolgenden Läufen: erfüllt, 6,4 und 6,5 min. Vorher waren es 21–39 min.
  - Gleiche Testzahl: erfüllt, 1911 bis F1, danach 1916 mit dem neuen Kanarienvogel.
  - Rot in einem Shard sperrt den Deploy: erfüllt, siehe Test 3 und die roten main-Läufe.
  - Smoke allein gegen den Deploy-Build: erfüllt, siehe Test 4 und „Running 21 tests using 1 worker“.
  - Lokal unverändert: erfüllt, voller Lauf ohne `PW_SUITE` grün.
- Queue-Zeit außerhalb des Störfalls meist 2–8 s, vereinzelt 30–77 s für einen Job (G, `693ffd1`, M2). Sie liegt nicht regelmäßig über 1 min, also kein Befund für Variante B.
- Ausreißer: LCP `android-klein` 1900 ms in M4. Die Marge zum Budget (2500 ms) liegt damit bei 600 ms. Das ist kein Rot, aber ein Wert zum Beobachten.
