# Plan 0013 – Schnellere CI durch parallele E2E-Jobs

Status: freigegeben (Review mit Änderungen eingearbeitet), nicht umgesetzt
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
