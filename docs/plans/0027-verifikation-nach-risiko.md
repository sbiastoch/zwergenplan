# Plan 0027 – Verifikation nach Risiko

Status: Entwurf, wartet auf Plan-Review
Datum: 2026-10-08
Bezug: ADR 0004 (Backpressure, wird durch ADR 0021 ergänzt), ADR 0002 (Hosting, „check → E2E → Deploy“), ADR 0012 (Budgets, unverändert), Plan 0013 (CI-Sharding, `PW_SUITE`), `docs/architecture.md` (Schicht `.claude/hooks/`: nur Node-Builtins)

## Ziel

Der Nutzer hat am 2026-10-08 wörtlich verlangt: „Das Harness verbessern, damit die Verifikation einer Änderung im Verhältnis zu ihr und ihrem Risiko steht, sodass schnell iteriert werden kann ohne reale Einbußen in der QS.“ Ergänzt hat er: Vollständig umgesetzte Pläne sollen archiviert werden.

1. **Lokal richtet sich die Prüfung nach dem Diff.** Ein Skript leitet aus den geänderten Pfaden eine Risikoklasse und daraus eine Prüfstufe ab. Lässt sich ein Pfad nicht sicher zuordnen, gilt die volle Stufe (fail-safe).
2. **Doku-Commits sind schnell.** Der pre-commit-Hook braucht für einen reinen Doku-Commit unter 10 s, auch bei hoher Last. Ein Commit mit reiner Domänenlogik braucht lokal unter 60 s.
3. **Das Stop-Gate prüft nur, was sich geändert hat.** Ein Turn ohne Änderung prüft nichts. Ein schon grün geprüfter Inhalt wird nicht noch einmal geprüft, auch nicht nach einem Commit und auch nicht in einem anderen Worktree. Ein veraltetes `node_modules` meldet es als klaren Hinweis mit Abhilfe.
4. **Keine volle E2E-Suite mehr lokal durch Agents.** Lokal laufen nur ausdrücklich genannte Specs auf einem Gerät. Alle schweren Läufe (E2E) gehen maschinenweit durch eine Sperre. Die volle Suite fährt die CI auf jedem Branch.
5. **Die CI bleibt das volle Gate vor dem Deploy**, mit allen Suites, WebKit und Budgets. Ein schnellerer Pfad für reine Doku-Commits ist eine Option, die der Nutzer entscheidet (E10, ADR 0021).
6. **Pläne werden archiviert.** Vollständig umgesetzte Pläne liegen in `docs/plans/archiv/`. Wer `docs/plans/` liest, sieht nur aktive Pläne. Ein Gate prüft Status und Pfadverweise (E11).

## Nicht-Ziele

- **Kein Gate wird schwächer.** Keine Schwelle, kein Budget, kein Retry und keine Assertion ändert sich. Die einzige Ausnahme ist das Zeitlimit von zwei CPU-gebundenen Unit-Tests (E8). Es ist keine Aussage des Tests.
- **Keine automatische Auswahl von E2E-Specs** über eine Zuordnung zwischen Spec und Quelldatei oder über Tags (E4 begründet das).
- **`vitest related` und `--changed` werden kein Gate** (E3 begründet das). Als Werkzeug in der inneren Schleife bleiben sie erlaubt.
- **Keine Änderung an Shards, Geräten oder Testinhalten der CI.** Der Pixel-7-Shard liegt mit 486 s um 24 % über dem Chromium-Schnitt. Das ist unter der 30-%-Schwelle aus Plan 0013, E1, und bleibt eine Beobachtung.
- **Die CI wird nicht über SHA-Gleichheit wiederverwendet** (E10, Option c).
- **lefthook im Worktree.** `pnpm install` in einem Worktree schreibt über `prepare` den absoluten Pfad seines lefthook-Binarys in das gemeinsame `.git/hooks/pre-commit`. Das widerspricht ADR 0004, „Mehrere Checkouts“. Ist der Worktree gelöscht, greift der Fallback des Skripts auf `$(git rev-parse --show-toplevel)/node_modules/lefthook/bin/index.js`, und das funktioniert. Das kommt nach `docs/ideas.md` (Schritt 5).

## Ausgangslage

### Harness heute

| Stelle | Was | Befund |
|---|---|---|
| `lefthook.yml:2–5` | pre-commit: `pnpm -s check:fast` | läuft unabhängig vom Diff, also auch bei reinen Doku-Commits (Problem 2) |
| `scripts/check-fast.ts:8–20` | 8 Schritte parallel: 4× `tsc`, Biome, dependency-cruiser, `validate-data`, Vitest | kein Doku-Check; `knip`, `schema:check` und Coverage fehlen (nur CI) |
| `.claude/hooks/stop-gate.ts:25–29` | Stop-Gate: `treeHash()` ≠ letzter grüner Hash → `check-fast.ts` | prüft auch Turns ohne Änderung, sobald der Hash fehlt oder sich HEAD geändert hat (Problem 3) |
| `.claude/hooks/lib.ts:70–88` | `treeHash()` = sha256(HEAD + `git status` + `git diff HEAD` + neue Dateien) | hängt am **Commit**, nicht am Inhalt: Nach jedem Commit, Rebase oder in einem frischen Worktree läuft `check:fast` erneut, obwohl der Inhalt schon grün war |
| `.claude/hooks/lib.ts:14–20` | `exitIfNotInstalled()` prüft nur, ob `node_modules/.bin/tsc` existiert | ein **veraltetes** `node_modules` (Lockfile neuer) zeigt sich als Typfehler, z. B. „Cannot find module 'web-push'“ (Problem 3) |
| `.claude/state/` | Zustand je Checkout | kein Austausch zwischen Worktrees |
| `playwright.config.ts:78–82` | kein `workers` → Playwright nimmt 50 % der Kerne (8 von 16) | drei parallele Worktrees mit vollen Läufen = 24 Browser-Worker plus Preview-Server (Problem 1) |
| `playwright.config.ts:70, 75` | `reuseExistingServer: !CI` | ohne eigenen `PW_PORT` übernimmt ein Lauf still den Server eines anderen Worktrees (CLAUDE.md, Stolperfallen) |
| `package.json` `check` | `check:fast && knip && schema:check && test:coverage && e2e && size` | die einzige dokumentierte „volle“ Stufe enthält die volle E2E-Suite |
| `CLAUDE.md:11` | „Fertig, wenn `pnpm check:fast` grün ist“ | sagt nichts zu E2E lokal; Agents fuhren deshalb `pnpm check` bzw. `pnpm e2e` (Problem 4) |
| `.github/workflows/ci.yml:3–5, 12–14` | jeder Push auf jeden Branch: 9 Jobs; `concurrency` je Ref ohne Abbruch | Läufe auf `main` warten aufeinander |
| `.claude/skills/browser-review/SKILL.md` | Preview fest auf Port 4173 | kollidiert bei parallelen Sessions |

### Messwerte lokal (2026-10-08, 16 Kerne, Worktree auf `a666dbe`)

`pnpm check:fast` einmal: **5,9 s**, Last vorher 2,00 / nachher 3,46 (1-Minuten-Mittel; das 15-Minuten-Mittel lag bei 47 aus den Läufen vom Vormittag).

Einzelschritte nacheinander gemessen, Last 3,0–4,3:

| Schritt | Dauer |
|---|---|
| `tsc` Haupt / SW / SW-Tests / Worker | 1,2 / 0,5 / 0,6 / 0,5 s |
| Biome `check .` | 0,9 s |
| Architektur (dependency-cruiser) | 1,6 s |
| Daten (`validate-data`) | 0,6 s |
| Vitest, 80 Dateien, 1062 Tests | 4,7 s (Summe der Testdauern 7,2 s) |
| `knip` | 2,2 s |
| `schema:check` | 0,3 s |
| `test:coverage` | 6,6 s |
| `vitest related --run src/domain/format.ts` | 1,5 s |
| `vitest run --changed` ohne Änderung | 0,7 s |
| Inhalts-Hash des Arbeitsbaums (Wegwerf-Index, `git add -A`, `git write-tree`) | 0,1 s |
| `pnpm install --frozen-lockfile` bei vorhandenem Store | 6,3 s |

Die langsamsten Unit-Tests stehen beide in `scripts/transit/profile-csa.test.ts`: „gleicht der Referenz bei Abgang 300, 800 und 1 500 m“ (Zeile 682) mit **1 599 ms** und „gleicht der Referenz für jeden Steig und jede Minute“ (Zeile 632) mit **952 ms**. Das Vitest-Zeitlimit ist 5 s. Bei einer Last von 46–116 auf 16 Kernen, also 3- bis 7-fach überbucht, reißen sie es (Problem 2). Alle anderen Tests liegen unter 230 ms.

E2E-Umfang (`playwright test --list`): **2 422 Tests**, 480 je Gerät × 5 Geräte + 22 Smoke. Je Gerät verteilen sie sich so: `mobile-ux` 157, `layout` 113, `startpunkt` 37, `karte` 23, `anbieter` 23, `app` 20, `push` 19, `installieren` 17, `pwa`/`detail`/`calendar`/`anbieter-inhalt` je 13, `saved` 6, `font-swap` 5, `theme` 4, `timezone` 2, `perf` 2. Einen vollen lokalen Lauf misst dieser Plan nicht, denn parallel arbeiten andere Agents. Plan 0013 hat 1 442 Tests mit 4 Workern in 685 s gemessen. Auf 2 422 Tests hochgerechnet sind das **etwa 19 min ohne Last**. Am 2026-10-08 dauerten parallele Läufe über 40 min.

### Messwerte CI (Läufe auf `main`)

Lauf 37474075714 (`a666dbe`), 9,5 min vom Push bis zum Deploy:

| Job | Dauer | davon |
|---|---|---|
| Statische Gates & Unit-Tests | 0,6 min | `check:fast` 9 s (Ausgabe „grün in 8.9s“), Coverage 9 s, knip < 4 s |
| E2E chromium 1/4 … 4/4 | 6,6 / 8,8 / 6,2 / 7,5 min | E2E-Schritt 343 / 486 / 334 / 411 s, Browser-Installation 22–27 s |
| E2E webkit 1/2, 2/2 | 7,7 / 7,2 min | E2E 404 / 375 s, Browser 37 s |
| Smoke & Budgets | 2,6 min | Smoke 103 s, Deploy-Build 4 s |
| Deploy | 0,4 min | |

- Die letzten 15 Läufe auf `main` dauerten 6,4–11,8 min, mit einem Ausreißer von **18,5 min** (37455204469, `0031f09`, ein **reiner Doku-Commit**). Davon waren 9 min Warten: Der Lauf war um 11:15:33 angelegt und startete erst um 11:24:18, weil der vorige Lauf auf `main` (`da03ded`) noch lief (`concurrency: ci-refs/heads/main`).
- **17 der letzten 40 Commits auf `main` ändern nur Markdown** (`docs/**/*.md`, `*.md` im Wurzelverzeichnis, `.claude/skills|agents/**/*.md`). Jeder davon fährt die volle Matrix aus 9 Jobs (ca. 45 Job-Minuten) und deployt ein `dist/`, das sich nur in `meta.json` (`commit`) unterscheidet (`scripts/build-data.ts:48–54`).

**Was erst in CI rot wurde.** In den letzten 100 CI-Läufen waren 16 rot:
- 8 Läufe auf `push-0017` und `worktree-push-0011-s2`, alle im Job „Statische Gates“. Die Ursache war **knip** (unbenutzte Exporte und Abhängigkeiten). knip läuft lokal in keinem Hook.
- 3 Läufe auf `main` am 2026-10-05, alle im Job „E2E chromium 2/4“: `font-swap.spec.ts:29` („Swap-Messung zählt einen Shift direkt nach der Grenze“).
- 5 absichtliche Läufe: Kanarienvögel und Diagnose-Branches aus Plan 0013 sowie Spikes.

Daraus folgt: Lokal fehlt der billigste Check, knip mit 2,2 s. Die teure lokale E2E-Suite hat dagegen keinen der CI-Fehler verhindert.

### Pläne heute

- In `docs/plans/` liegen 21 Pläne mit zusammen 12 034 Zeilen.
- Die Statuszeilen sind uneinheitlich und teils veraltet. Plan 0004, 0005, 0007 und 0008 nennen noch „offen: Fast-Forward nach `main`“, obwohl ihre Commits auf `main` liegen (21, 21, 34 und 13 Commits mit „Plan 00NN“ in der Message). Plan 0017 und 0021 stehen noch auf „freigegeben“, sind aber live (`a666dbe`, `fc39cf7`).
- **Verweise:** Der Text „Plan 00NN“ steht etwa 950-mal im Repo: `src` 450, `e2e` 188, `scripts` 96, ADRs 97, `docs/ideas.md` 52, `architecture.md` 42 und weitere. Diese Verweise brechen bei einer Verschiebung nicht. **Pfadverweise** auf `docs/plans/00NN-….md` gibt es nur 10, alle in Plänen (z. B. `docs/plans/0014-kategorie-etikett-folgt-filter.md:103`, `docs/plans/0009-oepnv-fahrzeit.md:377, 514, 790`). Dazu kommen die Muster `docs/plans/NNNN-<thema>.md` in `CLAUDE.md:9` und `.claude/skills/plan-review/SKILL.md:8`. Einen Link-Check gibt es nicht. Biome prüft kein Markdown: `biome check docs CLAUDE.md` verarbeitet keine Datei.
- Plannummern kollidierten schon. „0015“ wurde zu 0017, „0018“ zu 0020, weil parallele Branches dieselbe Nummer nahmen (`docs/plans/0018-kalender-nur-altersgerecht.md:8`).

## Entscheidungen

### E1 – Risikoklassen aus dem Diff, ein reines Modul

`scripts/lib/change-class.ts` (rein, ohne I/O) bildet eine Liste geänderter Pfade auf eine Stufe ab. Die Regeln stehen als geordnete Liste von Mustern, **die erste passende Regel gewinnt**. Die Stufe des Diffs ist das **Maximum** über alle Pfade. Ein Pfad ohne Regel bekommt die Stufe **V** (fail-safe). Gelöschte Pfade zählen wie geänderte. Umbenennungen zählen mit altem und neuem Pfad, denn der Aufrufer nutzt `--no-renames`.

| Klasse | Pfade (Reihenfolge = Priorität) | Stufe |
|---|---|---|
| Harness, Build, Konfiguration, Abhängigkeiten, Service Worker | `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `*.config.ts`, `vitest.setup.ts`, `**/tsconfig*.json`, `biome.json`, `knip.jsonc`, `.dependency-cruiser.cjs`, `.size-limit.json`, `lefthook.yml`, `.gitignore`, `.github/**`, `.claude/hooks/**`, `.claude/settings.json`, `scripts/check-*.ts`, `scripts/verify.ts`, `scripts/heavy.ts`, `scripts/e2e-local.ts`, `scripts/lib/change-class.ts`, `scripts/vite-sw.ts`, `src/sw/**`, `site.config.ts`, `push-worker/wrangler.toml`, `index.html`, `public/**` | **V** voll |
| Daten und Pipeline | `data/**`, `tests/fixtures/**`, `schema/**`, `src/domain/schema.ts`, `src/domain/topics.ts`, `scripts/pipeline/**`, `scripts/build-data.ts`, `scripts/validate-data.ts`, `scripts/export-schema.ts`, `scripts/transit/**` | **D** Daten |
| UI | `src/ui/**`, `src/data/**`, `src/main.tsx`, `src/env.d.ts` | **C** Code, dazu E2E-Pflicht (E4) |
| Domänenlogik und Skripte | `src/domain/**`, `scripts/lib/**`, `scripts/*.ts` (sonst), `push-worker/src/**` | **C** Code |
| Tests | `**/*.test.ts`, `e2e/**` | **C** Code; geänderte Specs laufen lokal (E4) |
| Doku und Agent-Texte | `docs/**/*.md`, `*.md` im Wurzelverzeichnis, `.claude/skills/**/*.md`, `.claude/agents/*.md` | **0** Doku |
| alles andere | z. B. `docs/design/**`, neue Wurzelordner | **V** voll (fail-safe) |

Begründung der Grenzen:
- `index.html` und `public/**` landen im Deploy und im Precache des Service Workers (`architecture.md`, Abschnitt Service Worker). Deshalb gilt **V**. Auch `public/**/*.md` ist **V**: Die Doku-Regel steht unter der Regel für `public/**` und greift dort nie.
- `.claude/skills/**/*.md` und `.claude/agents/*.md` sind Text für Agents. Kein Build, kein Test und kein Skript liest sie (geprüft per grep in `src`, `scripts`, `e2e`, `push-worker`, `tests`). Für `*.md` außerhalb von `public/` gilt dasselbe. Den Rest sichert E2 mit einem Test ab.
- `scripts/transit/**` erzeugt `wegzeit.json` im Daten-Build. Deshalb gilt **D**, nicht **C**.
- `src/domain/schema.ts` und `topics.ts` ändern den Export `schema/*.json` (`post-edit.ts:36`). Deshalb gilt **D** mit `schema:check`.

### E2 – Prüfstufen

| Stufe | Inhalt | gemessen bzw. geschätzt (ohne Last) |
|---|---|---|
| **0** Doku | `check-docs` (E11: Planstatus, Pfadverweise, Plannummern). Nur Node-Builtins, läuft auch ohne `node_modules`. | < 1 s |
| **C** Code | `check:fast` (8 Schritte wie heute) **plus knip** als 9. paralleler Schritt, plus `check-docs` | ≈ 6–8 s |
| **D** Daten | C, dazu `schema:check` und `data:build` für echte Daten und Fixture-Daten (Invarianten wie `MAX_WITHOUT_LINES`, `build-data.ts:99–118`) | ≈ 15 s |
| **V** voll | D, dazu `test:coverage`, `pnpm build`, `pnpm build:e2e` und `pnpm size` | ≈ 35 s (CI: Build 4 s, Coverage 9 s) |

- **Keine Stufe enthält lokal die volle E2E-Suite.** E2E regelt E4.
- **knip kommt in `check:fast`.** Das ist die billigste Maßnahme gegen „erst in CI rot“: 8 der 11 nicht absichtlichen roten Läufe waren knip. Der eigene CI-Schritt „Tote Pfade (knip)“ (`ci.yml:31–32`) entfällt, weil `check:fast` ihn enthält. ADR 0004 nennt knip dann bei `check:fast` und CI.
- Die CI ruft weiterhin alles einzeln auf, wie heute. `verify` gibt es nur lokal.
- Ein **Test schützt die Grenze „Doku liest niemand“**. `change-class.test.ts` sucht in `src/`, `scripts/`, `e2e/`, `push-worker/`, `vite.config.ts` und `playwright.config.ts` nach Lesezugriffen auf `.md`, also nach `readFileSync`, `import` oder `fetch` mit einem String auf `.md`. Findet er einen Treffer, der nicht auf einer Ausnahmeliste steht, wird der Test rot. Auf der Ausnahmeliste steht anfangs nur `scripts/check-docs.ts`, denn das Gate liest Markdown, ändert aber nichts am Build. Liest künftig Code eine Markdown-Datei, wird die Klasse 0 damit nicht still falsch.

### E3 – Unit-Tests: immer die ganze Suite, kein `related`

- Die ganze Suite braucht 4,7 s. `vitest related` spart höchstens 3 s.
- `related` folgt nur dem Import-Graphen. Tests, die Dateien lesen, erfasst es nicht. Beispiele sind `profile-csa.test.ts:633–635` mit `tests/fixtures/oepnv/fahrplan.json`, die Datensatz-Tests mit `tests/fixtures/*.yaml` und die Parser-Tests mit `tests/fixtures/pipeline/`. Eine Änderung an Fixture-Daten liefe damit an genau den Tests vorbei, die sie prüfen.
- Entscheidung: Stufe C und höher fährt immer die ganze Vitest-Suite. `vitest related <datei>` steht in CLAUDE.md nur als Werkzeug für die innere Schleife.

### E4 – E2E lokal: genannte Specs, ein Gerät, unter Sperre

**Bewertung der automatischen Auswahl.** Sie ist nicht verlässlich und wird verworfen:
- E2E ist absichtlich Black-Box. dependency-cruiser verbietet `e2e/` jeden Import aus `src/` (`e2e-black-box`). Einen Import-Graphen von Spec zu Quelle gibt es also nicht.
- 270 der 480 Tests je Gerät (`mobile-ux`, `layout`) prüfen querschnittlich jede Ansicht. Sie wären von fast jeder UI-Änderung „betroffen“.
- Eine handgepflegte Zuordnung oder Tags veralten ohne eigenes Gate. Ein Gate, das prüft, ob eine Zuordnung vollständig ist, gibt es nicht und wäre selbst „clever“.

**Entscheidung:**
- Neues Skript `pnpm e2e:local <spec …> [-- <playwright-args>]` (`scripts/e2e-local.ts`):
  - **Ohne Spec-Argument bricht es ab** und nennt die Regel.
  - Es nimmt die maschinenweite Sperre (E7).
  - Es baut `dist-e2e/` (`pnpm build:e2e`, ca. 4 s).
  - Es sucht selbst zwei freie Ports. Kein `PW_PORT` mehr von Hand.
  - Es setzt `PW_SUITE=chromium` und `--project=pixel-7` als Standard. Mit `--project=iphone-15` setzt es `PW_SUITE=webkit`. Dann läuft nur der Fixture-Server, und der Server mit echten Daten startet nicht.
  - Es setzt `ZP_HEAVY_LOCK=1`.
- `playwright.config.ts`:
  - `workers` lokal `"25%"` (4 von 16 Kernen). In CI ändert sich nichts, dort gilt weiter `--workers=2` aus `ci.yml:75`.
  - `reuseExistingServer: !CI && !ZP_HEAVY_LOCK`. Unter dem Skript startet immer ein eigener Server. Ist der Port belegt, wird der Lauf wegen `--strictPort` laut rot und testet nicht still den Build eines anderen Worktrees.
  - **Wächter:** Lokal (ohne `CI`) wirft die Konfiguration beim Laden, wenn `ZP_HEAVY_LOCK` fehlt und `--list` nicht in `process.argv` steht. Die Meldung nennt `pnpm e2e:local` bzw. `pnpm e2e`. So läuft kein E2E ohne Sperre. Das ist eine mechanische Regel, keine Bitte in der Doku.
- `pnpm e2e` (alles, lokal) bleibt für Menschen und Ausnahmen. Es läuft ebenfalls unter der Sperre (`node scripts/heavy.ts …`). `pnpm check` bleibt unverändert die volle Kette.

**Pflicht je Klasse** (CLAUDE.md, E12):

| Änderung | lokal Pflicht | E2E lokal |
|---|---|---|
| nur Doku | Stufe 0 | keine |
| Domänenlogik ohne sichtbare Änderung | Stufe C | keine |
| Domänenlogik mit sichtbarer Änderung (Texte, Sortierung …) | Stufe C | die Specs, die das Verhalten zeigen, auf `pixel-7` |
| UI | Stufe C | die Specs der geänderten Ansicht auf `pixel-7`; bei CSS und Layout zusätzlich `layout.spec.ts`. Danach `/browser-review` wie bisher. |
| nur Tests | Stufe C | die geänderten Specs auf `pixel-7` |
| Daten, Pipeline | Stufe D | keine (Smoke und Daten-Specs laufen in CI) |
| Service Worker, Vite, Playwright-Konfiguration | Stufe V | `pwa.spec.ts` (SW, Vite); bei der Playwright-Konfiguration `--list` mit der Summe aus Plan 0013, Test 1 |
| unklar | Stufe V | nach Ermessen; die CI fährt alles |

Geschätzte Dauer: 37 Tests (`startpunkt.spec.ts`) brauchen in CI je Test etwa 2 s Worker-Zeit. Mit 4 Workern sind das etwa 20 s, mit Build und Serverstart **unter 1 min**.

**Flakes unter Last** werden lokal nicht mit `--last-failed` gejagt. Ein Test, der lokal nur unter Last rot wird, gilt erst als Befund, wenn er auch in der CI rot oder „flaky“ wird. Dort läuft er mit `retries: 1` (`playwright.config.ts:82`) und ohne fremde Last.

### E5 – Stop-Gate: Inhalts-Hash, Turn-Start, gemeinsame Stempel

1. **Inhalts-Hash statt Commit-Hash.** `treeHash()` in `.claude/hooks/lib.ts` wird zur Tree-ID des Arbeitsbaums:
   - `GIT_INDEX_FILE=<tmp> git read-tree HEAD`, dann `git add -A` und `git write-tree`. Der Wegwerf-Index liegt unter `.claude/state/`.
   - Das kostet 0,1 s und beachtet `.gitignore`.
   - Gleicher Inhalt ergibt dieselbe ID, egal ob vor oder nach dem Commit, nach einem Rebase oder in einem anderen Worktree.
   - Der echte Index bleibt unberührt.
   - `mark-reviewed.ts` und die Review-Erinnerung nutzen dieselbe Funktion.
2. **Turn-Start.** Ein neuer Hook `UserPromptSubmit` (`.claude/hooks/turn-start.ts`) schreibt die Tree-ID beim Start jedes Turns nach `.claude/state/turn-start.json`. Das Stop-Gate lässt **ohne jede Prüfung** durch, wenn die aktuelle ID gleich der vom Turn-Start ist. Fehlt die Datei (Hook neu, erste Session), prüft es wie bisher.
3. **Gemeinsame grüne Stempel.**
   - Nach einem grünen Lauf schreibt das Stop-Gate `~/.cache/zwergenplan/green/<tree-id>` mit Stufe und Zeit. Dazu kommt `.claude/state/last-green.json` mit `{ tree }`.
   - Liegt für die aktuelle ID ein Stempel vor, der jünger als 12 h ist, lässt das Gate sofort durch. Das gilt auch, wenn ein anderer Worktree den Stempel geschrieben hat.
   - Warum 12 h: `validate-data` hängt am Datum, z. B. an Warnungen zum Fahrplanwechsel. Ein alter Stempel soll das nicht überdecken.
4. **Nur die Änderung prüfen.**
   - Basis ist der letzte grüne Baum dieses Worktrees, sofern sein Tree-Objekt noch existiert (`git cat-file -e`). Sonst ist es der Baum von `merge-base HEAD origin/main`, denn `main` ist durch die CI voll grün.
   - Das Gate ruft `node scripts/verify.ts --base <tree> --tree <tree>` auf. `verify` bestimmt die geänderten Pfade mit `git diff --name-only --no-renames <base> <tree>` und daraus die Stufe nach E1/E2.
   - Ein reiner Doku-Turn auf grünem Stand prüft also nur Stufe 0.
   - Das ist korrekt, weil der Basisbaum für seinen ganzen Inhalt grün war. Die Doku-Änderung berührt keinen Prüfgegenstand der Stufe C (E2, Test „Doku liest niemand“).
5. **Unverändert:** Rot blockiert mit Exit 2, höchstens 3× je Arbeitsstand (`MAX_BLOCKS`). Danach gibt das Gate mit Warnung frei. Die Erinnerung an `/arch-review` ab 200 Zeilen bleibt. Die Hooks importieren weiter nur Node-Builtins (`architecture.md`, Schichten). Die Klassifizierung liegt in `scripts/`, und das Gate ruft sie als Prozess auf.

### E6 – Veraltetes `node_modules` als Hinweis, nicht als Typfehler

- `verify.ts` und `check-fast.ts` vergleichen zuerst `pnpm-lock.yaml` byte-genau mit `node_modules/.pnpm/lock.yaml`. pnpm legt dort bei jeder Installation eine Kopie ab; nach `pnpm install --frozen-lockfile` sind beide identisch, geprüft am 2026-10-08.
- Weichen sie ab oder fehlt die Kopie, bricht der Lauf ab Stufe C vor allen Schritten ab, mit genau einer Meldung: `node_modules passt nicht zu pnpm-lock.yaml. Abhilfe: pnpm install --frozen-lockfile`.
- Stufe 0 braucht kein `node_modules` und läuft trotzdem.
- Das Stop-Gate gibt diese Meldung unverändert weiter. Es blockiert damit nur, wenn der Turn Code geändert hat (E5.2).
- In CI ist die Prüfung immer grün, weil der Job vorher `pnpm install --frozen-lockfile` ausführt.
- Kein automatisches `pnpm install` im Hook. Es würde über `prepare` die gemeinsamen Git-Hooks umschreiben (Nicht-Ziele) und braucht Netz.

### E7 – Eine maschinenweite Sperre für schwere Läufe

- `scripts/heavy.ts <cmd …>` führt das Kommando unter `flock -w 3600 ~/.cache/zwergenplan/heavy.lock` aus (util-linux 2.39.3, vorhanden).
- Der Kernel gibt die Sperre frei, wenn der Prozess endet, auch bei `kill -9`. Verwaiste Sperren gibt es also nicht.
- Wer warten muss, liest einmal: „wartet auf schweren Lauf: <Worktree>, <Kommando>, seit <Zeit>“. Das steht in einer Begleitdatei, die der Halter nach dem Erwerb schreibt.
- Fehlt `flock` (macOS), läuft das Kommando mit Warnung ohne Sperre.
- **Ein Platz.** Mit der Sperre läuft maschinenweit nur ein E2E-Lauf, mit 4 Workern. Das sind 4 Browser statt bis zu 24. Ein zweiter Platz brächte unter Last wieder die alten Flakes.
- **Unter der Sperre:** `pnpm e2e:local`, `pnpm e2e` und damit `pnpm check`.
- **Nicht unter der Sperre:** `check:fast`, `verify` (auch Stufe V mit ihren 4-s-Builds) und der pre-commit-Hook. Ein Commit soll nie 10 min hinter einem fremden E2E-Lauf warten.
- **Worker nach Last: verworfen.** Mit der Sperre bleibt die Fremdlast klein, und feste 25 % sind reproduzierbar. Worker nach Last machten Laufzeit und Flake-Bild vom Zufall abhängig.

### E8 – CPU-gebundene Unit-Tests ohne Last-Flakes

- Die zwei Referenztests in `scripts/transit/profile-csa.test.ts` (Zeilen 632 und 682) bekommen `{ timeout: 30_000 }`. Ein Kommentar begründet es:
  - Die Aussage ist Gleichheit mit der Referenz, nicht Tempo.
  - Ohne Last laufen sie in 1,6 s und 0,95 s.
  - 30 s halten eine 15-fache Überlast aus und fangen trotzdem eine Endlosschleife.
- Assertions, Netz und Seed bleiben gleich.
- Eine globale Anhebung von `testTimeout` gibt es nicht. Sie verdeckte Hänger in den 1 060 anderen Tests, die alle unter 230 ms liegen.
- **Wächter gegen neue Ausreißer:** Ein Test über 1 s ohne eigenes Zeitlimit fällt erst unter Last auf. Schritt 1 nimmt deshalb in CLAUDE.md, Stolperfallen, die Regel auf: CPU-gebundene Tests über 1 s bekommen ein begründetes eigenes Zeitlimit.

### E9 – pre-commit nach Stufe

- `lefthook.yml` ruft `node scripts/verify.ts --staged` statt `pnpm -s check:fast` auf.
- Die Pfade kommen aus `git diff --cached --name-only --no-renames`. Geprüft wird wie heute der Arbeitsbaum.
- Bei einem reinen Doku-Commit läuft nur Stufe 0, unter 1 s. Biome prüft kein Markdown, ein Doku-Commit verliert also keinen Format-Check. Den Link- und Status-Check bekommt er neu dazu (E11).
- Ein leerer Diff (`--allow-empty`) gilt als Stufe 0.

### E10 – CI: ein schneller Pfad für reine Doku-Commits (Nutzerentscheid)

Heute fährt jeder Push die volle Matrix. Optionen:

- **(a) Unverändert.** Jeder Commit auf `main` ist für sich voll geprüft und deployt. Kosten: 17 von 40 Commits fahren 9 Jobs (ca. 45 Job-Minuten) und blockieren `main` bis zu 9 min für den nächsten Code-Commit (Lauf 37455204469).
- **(b) Doku-Pfad.**
  - Ein Job `scope` vor allem anderen braucht nur `actions/checkout` mit `fetch-depth: 0` und Node, ohne `pnpm install`. Er ruft `node scripts/ci-scope.ts` auf, das `change-class.ts` nutzt.
  - Ergebnis ist `full=false` nur, wenn alle drei Bedingungen gelten:
    1. Der Diff `github.event.before..github.sha` ist reine Stufe 0. Bei einem neuen Branch (`before` = Nullen), bei `pull_request` und bei `workflow_dispatch` gilt immer `full=true`.
    2. `before` ist Vorfahre von `sha`.
    3. Für `before` gibt es einen Lauf von `ci.yml` mit `conclusion: success` (`gh api`, Rechte `actions: read`).
  - Bei `full=false`:
    - `check` läuft wie immer, mit `check-docs` in `check:fast`.
    - `e2e` und `smoke` werden übersprungen (`if: needs.scope.outputs.full == 'true'`).
    - `gates` läuft mit `if: always()` und schlägt fehl, wenn `check` nicht `success` ist oder wenn bei `full=true` `e2e` bzw. `smoke` nicht `success` sind.
    - `deploy` entfällt, denn `dist/` wäre bis auf `meta.json.commit` gleich.
  - Garantie neu: Jeder Stand auf `main` ist voll grün geprüft, **oder** er unterscheidet sich vom voll grün geprüften Vorgänger nur in Dateien, die kein Build, kein Test und kein Skript liest (E1, E2 mit Test).
  - Der Commit, den `meta.json` live zeigt, ist dann der letzte Nicht-Doku-Commit. „Live zeigt den neuen Stand“ gilt für Doku-Commits nicht. CLAUDE.md sagt das (E12).
- **(c) SHA wiederverwenden.** Nach einem Fast-Forward hat derselbe Commit auf dem Branch schon voll grün bestanden. `main` könnte Prüfung und Artefakt übernehmen. **Verworfen:**
  - Das Pages-Artefakt müsste aus einem anderen Lauf geladen werden (`download-artifact` mit `run-id`).
  - `data:validate --against-deployed` läuft nur auf `main` (`ci.yml:37–39`).
  - Ein Fehler in dieser Verdrahtung deployte ungeprüft. Das ist das „Clevere, das selbst bricht“.
  - Es kommt nach `docs/ideas.md`.

**Empfehlung: (b), als ADR 0021 Teil B, nur auf Nutzerentscheid.**
- (b) verkürzt einen Doku-Commit auf `main` von ca. 9,5 auf ca. 1 min.
- Der nächste Code-Commit wartet nicht mehr hinter einem Doku-Lauf.
- Der Deploy bleibt für jede Änderung an Build-Eingaben voll gesperrt.

Das berührt ADR 0002 („check → E2E → Deploy“ für jeden Stand) und Plan 0013 („dieselben Tests“). Ohne Zusage gilt (a), und Etappe 7 entfällt.

### E11 – Pläne archivieren

- **Wohin:** `docs/plans/archiv/`. Die Dateinamen bleiben gleich, die Nummern bleiben über beide Ordner eindeutig.
- **Statusfeld:** Die erste Zeile nach dem Titel beginnt mit `Status: ` und dann genau einem dieser Werte:
  - `Entwurf …`
  - `freigegeben …`
  - `in Umsetzung …`
  - `abgeschlossen, live seit <sha> (<JJJJ-MM-TT>) …`
  - `ersetzt durch Plan NNNN …`

  Danach darf freier Text folgen. Alte Formen wie „umgesetzt und live“ setzt Etappe 6 einmalig um.
- **„Vollständig umgesetzt“ heißt:** Der Status ist `abgeschlossen` mit SHA und Datum, alle Schritte bzw. Etappen sind erledigt, und **nichts steht mehr offen**. Offene Restpunkte wie Geräteprüfung, Hinweise H1–H8 oder spätere Ideen wandern vorher in `docs/ideas.md`, mit „(aus Plan NNNN)“, oder in einen Folgeplan. Diesen Schritt macht der archivierende Agent, nicht das Skript.
- **Wer und wann:** Wer einen Plan abschließt, archiviert ihn selbst als **letzten Schritt der Arbeitsweise**. Das geschieht nach grüner CI auf `main` und nach `/browser-review live`, wo eins nötig ist. Dazu gehört ein Doku-Commit „docs: Plan NNNN abgeschlossen, archiviert“, mit Status nach Format, `git mv` und angepassten Pfadverweisen.
- **Gate `scripts/check-docs.ts`** (Stufe 0, auch in `check:fast` und damit in CI; nur Node-Builtins):
  1. Jede `docs/plans/*.md` und `docs/plans/archiv/*.md` hat eine gültige Statuszeile.
  2. `abgeschlossen` und `ersetzt` liegen nur in `archiv/`, alle anderen Status nur in `docs/plans/`. Ein abgeschlossener Plan außerhalb des Archivs ist also rot. Wer den Status setzt, muss auch verschieben.
  3. Die Nummern `NNNN` sind über beide Ordner eindeutig.
  4. **Pfadverweise:** In allen getrackten `*.md` sowie in `src`, `scripts`, `e2e`, `.claude` und `.github` muss jeder Treffer von `docs/(plans|adr)/(archiv/)?\d{4}-[a-z0-9-]+\.md` als Datei existieren. Dazu muss jeder relative Markdown-Link `](…\.md)` in `docs/`, `CLAUDE.md` und `README.md` auflösen. Externe Links prüft der Check nicht: Netz in einem Gate flackert.
- **Querverweise:** „Plan 00NN“ als Text bleibt gültig, denn die Nummer ist eindeutig, und bricht bei einer Verschiebung nicht. Nur die 10 Pfadverweise in Plänen werden beim Archivieren umgeschrieben. Den Rest hält Regel 4 künftig dicht. CLAUDE.md sagt: „Plan NNNN liegt in `docs/plans/` oder, wenn abgeschlossen, in `docs/plans/archiv/`.“
- **Agents:** Der `plan-reviewer` liest weiter alle ADRs, aber Pläne nur auf Verweis. `ls docs/plans` zeigt nur aktive Pläne und den Ordner `archiv/`.

### E12 – Doku sagt, welche Stufe wann genügt

- **`CLAUDE.md`, Arbeitsweise:**
  - Schritt 3: „Fertig, wenn `pnpm verify` grün ist (Stufe nach Diff, siehe Tabelle) und die E2E-Pflicht aus der Tabelle erfüllt ist.“ Die Tabelle aus E4 kommt in Kurzform dazu.
  - Neuer Satz: „Die volle E2E-Suite lokal fährt kein Agent. Die CI fährt sie auf jedem Branch.“
  - Schritt 6: Doku-Commits deployen nur bei E10 (a).
  - Schritt 7: Archivieren (E11).
- **`CLAUDE.md`, Stolperfallen:**
  - `PW_PORT` von Hand entfällt für `e2e:local`.
  - Die Sperre (E7) und der Wächter in der Playwright-Konfiguration (E4).
  - Bei veraltetem `node_modules` steht die Abhilfe in der Meldung (E6).
  - Die Timeout-Regel aus E8.
  - `vitest related` als Werkzeug für die innere Schleife (E3).
- **Skills:**
  - `arch-review`, Schritt 1: `pnpm verify` statt `pnpm check:fast`.
  - `browser-review`: Preview über einen freien Port. Das Skript nimmt `--port 0` bzw. sucht einen freien Port, statt fest 4173.
  - `plan-review`: Pläne in `archiv/` sind abgeschlossen.
- **Agents:**
  - `plan-reviewer`, „Backpressure-Lücken“: Der Plan nennt die lokale Stufe und die E2E-Specs je Schritt.
  - `arch-reviewer`: unverändert.
- **ADR 0004:** Nachtrag mit Verweis auf ADR 0021. knip läuft bei `check:fast` und CI; Hooks prüfen nach Stufe.
- **ADR 0002:** Verweis auf ADR 0021, nur bei E10 (b).

## Tests (wie das Harness selbst getestet wird)

Test-first für die reinen Module. Für jedes Gate gibt es einen Kanarienvogel nach ADR 0004.

1. **`scripts/lib/change-class.test.ts`** (Vitest, tabellengetrieben):
   - Je Zeile der Tabelle in E1 mindestens ein Pfad.
   - `public/x.md` → V.
   - `docs/design/x.png` → V.
   - unbekannter Pfad `neu/x.ts` → V.
   - gemischt Doku + `src/domain/x.ts` → C.
   - gemischt C + `pnpm-lock.yaml` → V.
   - leere Liste → 0.
   - Löschung und Umbenennung (alter Pfad `src/ui/a.tsx`, neuer Pfad `docs/a.md`) → C.
   - Test „Doku liest niemand“ (E2).
2. **`scripts/lib/stop-decision.test.ts`.** Die Entscheidung des Stop-Gates wird zur reinen Funktion `decide({ tree, turnStart, stampAgeHours, lastGreenTree, … })` mit den Ergebnissen `pass`, `check(base)` und `block`.
   - Fälle: kein Turn-Wechsel; Stempel frisch; Stempel 13 h alt; Basis fehlt (→ `merge-base`); drei Blocks, dann Freigabe.
   - Die Funktion liegt in `scripts/lib/`. Das Gate ruft sie über `verify.ts --stop` als Prozess auf und importiert sie nicht, wegen der Builtins-Regel für Hooks.
3. **`scripts/check-docs.test.ts`** mit einem Fixture-Ordner `tests/fixtures/docs/`:
   - gültiger Status;
   - fehlender Status;
   - `abgeschlossen` außerhalb von `archiv/`;
   - doppelte Nummer;
   - toter Pfadverweis;
   - toter relativer Link;
   - externer Link wird nicht geprüft.
4. **`scripts/heavy.test.ts`:**
   - Zwei Aufrufe mit `node -e "setTimeout(…, 500)"` laufen nacheinander. Gemessen wird, dass der zweite nach ≥ 500 ms beginnt.
   - Mit eigenem Lockpfad über `ZP_LOCK_DIR`. Der Test fasst die echte Sperre also nicht an.
   - Ein mit `SIGKILL` beendeter Halter gibt die Sperre frei.
5. **`verify.ts` Vorprüfung** (E6): Test mit Fixture-Ordner, Lockfile ≠ Kopie → Exit 1 und genau die Abhilfe-Zeile.
6. **Kanarienvögel**, je einmal von Hand, Ergebnis im Plan unter „Ergebnis“:
   - **K1:** Commit nur mit `docs/plans/x.md`, das einen toten Pfad `docs/plans/9999-x.md` nennt → pre-commit rot in < 2 s.
   - **K2:** Commit mit `docs/x.md` und einem Typfehler in `src/domain/format.ts` → Stufe C läuft und ist rot.
   - **K3:** Datei unter `neu/x.txt` → Ausgabe „Stufe V (unbekannter Pfad neu/x.txt)“.
   - **K4:** `pnpm-lock.yaml` um eine Leerzeile ändern (nicht committen) → Meldung aus E6, kein Typfehler.
   - **K5:** `pnpm exec playwright test e2e/theme.spec.ts` ohne Skript → Wächter wirft. Mit `--list` → kein Wurf.
   - **K6:** Zwei `pnpm e2e:local e2e/theme.spec.ts` gleichzeitig → der zweite meldet „wartet auf schweren Lauf …“ und läuft danach grün.
   - **K7:** Stop-Gate, Turn nur mit einer Frage → kein `check-fast`-Prozess (`ps` bzw. Ausgabe leer). Nach einem Commit ohne Inhaltsänderung → kein Lauf. Frischer Worktree auf demselben Baum → Stempel greift.
   - **K8:** `profile-csa.test.ts` unter künstlicher Last (`stress-ng --cpu 48` bzw. 48× `node -e "for(;;);"` für 60 s) → grün. Gegenprobe: mit dem alten Zeitlimit von 5 s unter derselben Last rot.
   - **K9 (nur bei E10 b):** auf einem Branch ein reiner Doku-Commit nach grünem Vorgänger → `e2e` und `smoke` übersprungen, `gates` grün. Ein Doku-Commit nach einem roten Vorgänger → volle Matrix. Ein Doku-Commit plus `src/`-Datei → volle Matrix.
7. **Messung des Erfolgs** (Abschnitt „Erfolgskriterien“), einmal nach Etappe 4 und nach zwei Wochen.

## Erfolgskriterien

| Kriterium | Ziel | Wie gemessen |
|---|---|---|
| pre-commit, reiner Doku-Commit | < 10 s, auch bei Last ≥ 40 (Ziel < 2 s) | `time git commit` in K1, Last mit `uptime` |
| pre-commit, nur Domänenlogik | < 60 s lokal (ohne Last ≈ 8 s) | `time git commit` mit einer Änderung in `src/domain/` |
| Stop-Gate ohne Änderung im Turn | 0 Prüfläufe, < 1 s | K7 |
| E2E lokal für eine Ansicht | < 3 min für einen Spec auf `pixel-7` | Ausgabe von `e2e:local` |
| Maschinenlast bei 3 parallelen Sessions | höchstens ein E2E-Lauf gleichzeitig; Last < 32 (2× Kerne) | `uptime` während paralleler Arbeit, Begleitdatei der Sperre |
| **QS: Fehler, die erst in CI auffallen** | knip-Fehler in CI → 0; alle anderen Klassen nicht mehr als heute | Zählung wie in der Ausgangslage über die nächsten 100 Läufe: `gh run list --status failure`, je Lauf der rote Job (`gh run view <id> --json jobs`) und die Ursache. Absichtliche Kanarienvögel zählen nicht. |
| **QS: nichts Kaputtes live** | 0 rote `gates` auf `main`, 0 Hotfixes wegen eines Fehlers, den eine bisher lokale Stufe gefunden hätte | `gh run list --branch main --status failure` und Commits `fix:` auf `main` mit Ursache |

Mehr Fehler auf Branches in E2E sind kein QS-Verlust, sondern Absicht. Die CI auf dem Branch ist ab jetzt der Ort für die volle Suite und braucht 9 min, lokal unter Last waren es mehr als 40 min. Maßstab ist, dass `main` grün bleibt und nichts Kaputtes live geht.

## Schritte (einzeln mergebare Etappen)

Jede Etappe hat einen eigenen Branch `verify-0027-<n>`, ihre eigene CI und einen Fast-Forward nach `main`. Geprüft wird jede Etappe noch mit dem **alten** pre-commit, bis Etappe 2 ihn ersetzt.

1. **Sofortmaßnahmen** (klein, ohne neues Modul):
   - E8, Zeitlimit in `profile-csa.test.ts` mit K8.
   - knip in `check-fast.ts` als 9. Schritt; der CI-Schritt „Tote Pfade (knip)“ entfällt.
   - E6, Vorprüfung des Lockfiles in `check-fast.ts`, mit Test 5 und K4.
   - CLAUDE.md, Stolperfallen: Timeout-Regel; Vorprüfung; „E2E lokal nur gezielt“ vorab als Regel in einem Satz.

   Fertig, wenn `check:fast` grün ist, K4 und K8 belegt sind und die CI grün ist.
2. **Klassen, Stufen und pre-commit:**
   - `change-class.ts` mit Test 1 zuerst.
   - `check-docs.ts` mit Test 3, zunächst **nur Regel 3 und 4** (Nummern, Pfade). Die Statusregeln kommen mit Etappe 6, sonst wären heute 21 Pläne rot.
   - `verify.ts` mit `--staged`, `--base/--tree` und ohne Argument gegen `merge-base origin/main` plus Arbeitsbaum.
   - `lefthook.yml` (E9), `package.json` `verify`, `check-docs` in `check:fast`.

   Fertig, wenn Test 1 und 3 grün sind, K1–K3 belegt sind und ein Doku-Commit unter 2 s braucht.
3. **Stop-Gate** (E5):
   - `turn-start.ts`, `UserPromptSubmit` in `.claude/settings.json`.
   - `lib.ts` `treeHash()` neu, Stempel in `~/.cache/zwergenplan/green/`.
   - `stop-decision.ts` mit Test 2.
   - `stop-gate.ts` ruft `verify.ts --stop`.

   Fertig, wenn Test 2 grün ist und K7 belegt ist.
4. **Sperre und E2E lokal** (E4, E7):
   - `heavy.ts` mit Test 4.
   - `e2e-local.ts`.
   - `playwright.config.ts`: Worker 25 %, `reuseExistingServer`, Wächter.
   - `package.json`: `e2e`, `e2e:local`.
   - `browser-review` mit freiem Port.
   - Plan 0013, Test 1 lokal wiederholen: Die Summen von `--list` bleiben gleich.

   Fertig, wenn K5 und K6 belegt sind und die CI grün ist. Die CI-Matrix fährt dieselben 2 422 Tests: Summe aus „passed“, „skipped“ und „flaky“ über alle Jobs.
5. **Doku** (E12):
   - CLAUDE.md, Arbeitsweise und Stolperfallen.
   - Skills und Agents.
   - ADR 0004, Nachtrag.
   - ADR 0021 auf „angenommen“, Teil A.
   - `docs/ideas.md`: E10 (c), lefthook im Worktree, 5. Chromium-Shard.

   Fertig, wenn `check-docs` grün ist und ein frischer Subagent auf die Frage „Welche Prüfung genügt für eine Änderung an `src/ui/Detail.tsx`?“ allein aus CLAUDE.md „Stufe C plus `detail.spec.ts` auf pixel-7 per `e2e:local`, danach `/browser-review`“ antwortet.
6. **Archiv** (E11):
   - Die Statusregeln 1 und 2 in `check-docs.ts`.
   - Danach die **erste Archivierung**: je Plan den Status prüfen, Restpunkte nach `docs/ideas.md` übertragen, den Status ins Format bringen und verschieben. Die 10 Pfadverweise umschreiben.
   - Vorschlag, den der Agent der Etappe gegen `git log` und den Planinhalt prüft:

     | Plan | Vorschlag |
     |---|---|
     | 0001, 0002, 0003, 0006, 0012, 0013, 0014, 0016, 0019, 0020, 0021 | archivieren; offene Hinweise vorher nach `ideas.md` |
     | 0004, 0005, 0007, 0008 | archivieren; der Status ist veraltet („offen: FF nach `main`“), Commits liegen auf `main`, `/browser-review live` laut `3469f6a`/`25878b3` erledigt; Abschluss-SHA aus `git log` |
     | 0009, 0010 | archivieren, sobald H1–H8 bzw. die Geräteprüfung in `ideas.md` stehen (Nutzerentscheid 3) |
     | 0011 | `ersetzt durch Plan 0017` für Stufe 2; Stufe 1 ist abgeschlossen → archivieren |
     | 0015, 0018 | bleiben (freigegeben, nicht umgesetzt) |
     | 0017 | bleibt, bis die Mittel-Befunde der Nachprüfung entschieden sind |
     | 0022–0026 (andere Branches) | unberührt |

   Fertig, wenn `check-docs` mit allen Regeln grün ist und `ls docs/plans` nur aktive Pläne zeigt.
7. **CI-Doku-Pfad** (E10 b), **nur nach Nutzerentscheid 1**:
   - `scripts/ci-scope.ts` mit Tests: Nullen, kein Vorfahre, Vorgänger rot → `full=true`.
   - `ci.yml`: Job `scope`, Bedingungen an `e2e`, `smoke`, `gates` und `deploy`; `permissions: actions: read`.
   - K9.
   - ADR 0021, Teil B auf „angenommen“; ADR 0002, Verweis.

   Fertig, wenn K9 mit drei verlinkten Läufen belegt ist.

## Offene Punkte (Nutzerentscheid)

1. **CI-Doku-Pfad (E10).**
   - (a) unverändert;
   - **(b) Doku-Commits ohne E2E und ohne Deploy, nur nach voll grünem Vorgänger (empfohlen)**;
   - (c) SHA wiederverwenden (nicht empfohlen).

   Empfehlung (b): Ein Doku-Commit auf `main` dauert dann ca. 1 statt ca. 9,5 min, und der nächste Code-Commit wartet nicht mehr. Der Deploy-Schutz für alles, was gebaut wird, bleibt gleich. Die Kosten: Für Doku-Commits zeigt `meta.json` live nicht ihren SHA.
2. **E2E-Pflicht lokal bei UI-Änderungen (E4).**
   - **(a) genannte Specs auf `pixel-7` (empfohlen)**;
   - (b) zusätzlich immer `mobile-ux.spec.ts` auf `pixel-7` (157 Tests, geschätzt 1,5–2 min);
   - (c) keine, nur CI.

   Empfehlung (a): `mobile-ux` und `layout` fallen in CI in 9 min auf, und `/browser-review` sieht dieselben Ansichten.
3. **Offene Restpunkte beim Archivieren (E11).** Geräteprüfungen und Hinweise aus Browser-Reviews (Plan 0009 H1–H8, Plan 0010 Geräteprüfung):
   - **(a) nach `docs/ideas.md`, Abschnitt „Offen aus abgeschlossenen Plänen“, und archivieren (empfohlen)**;
   - (b) Pläne mit offenen Punkten bleiben aktiv.

   Empfehlung (a): Sonst bleiben Pläne wegen Kleinigkeiten auf Dauer „aktiv“, und das Archiv verfehlt sein Ziel.

## Risiken

| Risiko | Abfangen |
|---|---|
| Eine Datei wird falsch als Doku eingestuft, und ein Fehler rutscht lokal durch | Doku-Klasse als enge Positivliste; alles Unbekannte ist V; Test „Doku liest niemand“; die CI fährt auf jedem Branch alles; auf `main` gilt (b) nur nach voll grünem Vorgänger |
| Inhalts-Stempel aus einem anderen Worktree täuscht grün vor | Stempel nur für identische Tree-ID (gleicher Inhalt inkl. Lockfile); TTL 12 h; `node_modules` per E6 geprüft |
| Tree-Objekt des letzten grünen Stands von `git gc` entfernt | `git cat-file -e`, sonst Basis `merge-base` (prüft mehr, nie weniger) |
| Die Sperre blockiert, weil ein Lauf hängt | Kernel gibt sie beim Prozessende frei; `-w 3600` bricht nach 1 h mit Meldung ab; Begleitdatei nennt Halter und Kommando |
| Wächter in `playwright.config.ts` stört einen legitimen Aufruf | Ausnahmen `CI`, `--list`; `pnpm e2e` bleibt; die Meldung nennt den Weg |
| UI-Fehler auf anderen Geräten fallen erst in CI auf | gewollt, die CI braucht 9 min statt > 40 min lokal; `main` bleibt gesperrt, bis alles grün ist |
| Zeitlimit 30 s verdeckt eine echte Verlangsamung von `profile-csa` | Laufzeit in CI sichtbar (Vitest-Bericht); ein Leistungsziel war nie Aussage des Tests; Rechenzeit der Wegzeit im Build misst `build-data` |
| Archivieren bricht Verweise | „Plan NNNN“ bleibt gültig; Pfadverweise prüft `check-docs` (Regel 4) |
| Parallele Branches (0022–0026) ändern einen Plan, der archiviert wird | Git erkennt die Umbenennung beim Rebase; Etappe 6 nimmt nur Pläne, die keiner der offenen Branches ändert (`git diff --name-only origin/main...origin/<branch>`) |
| Plannummern kollidieren weiter zwischen parallelen Branches | Regel 3 macht die Kollision beim Rebase rot statt still; die Vergabe selbst bleibt Absprache (nicht Teil dieses Plans) |
