# Plan 0027 – Verifikation nach Risiko

Status: in Umsetzung – Etappen 1–6 umgesetzt (Branches harness-0027-e1 … e6), Etappe 7 umgesetzt auf `harness-0027-e7`, K9 offen; freigegeben nach 2 Review-Runden, Nutzerentscheide getroffen. Früherer Status: freigegeben (2 Review-Runden, Nutzerentscheide getroffen)
Datum: 2026-10-08
Bezug: ADR 0004 (Backpressure, ergänzt durch ADR 0021), ADR 0002 (Hosting, „check → E2E → Deploy“, Teil B von ADR 0021 ändert das für Doku-Commits), ADR 0012 (Budgets, unverändert), Plan 0013 (CI-Sharding, `PW_SUITE`), `docs/architecture.md` (Schicht `.claude/hooks/`: nur Node-Builtins)

## Ziel

Der Nutzer hat am 2026-10-08 wörtlich verlangt: „Das Harness verbessern, damit die Verifikation einer Änderung im Verhältnis zu ihr und ihrem Risiko steht, sodass schnell iteriert werden kann ohne reale Einbußen in der QS.“ Dazu kam der Zusatz, vollständig umgesetzte Pläne zu archivieren.

1. **Lokal gibt es zwei Stufen, und der Diff wählt sie.**
   - Stufe 0 gilt für reine Doku und läuft unter 1 s.
   - Stufe C gilt für alles andere und dauert etwa 7 s.
   - Jeder Pfad, der nicht auf der Doku-Positivliste steht, bekommt C (fail-safe).
2. **Doku-Commits sind schnell.** Der pre-commit-Hook braucht für einen reinen Doku-Commit unter 10 s, auch bei hoher Last. Für reine Domänenlogik braucht er lokal unter 60 s.
3. **Das Stop-Gate prüft keinen Inhalt doppelt.** Ein Inhalt, der schon grün geprüft wurde, wird nicht erneut geprüft. Das gilt auch nach einem Commit und in einem anderen Worktree. Ein veraltetes `node_modules` meldet das Gate als klaren Hinweis mit Abhilfe.
4. **Agents fahren lokal nicht mehr die volle E2E-Suite.**
   - Lokal laufen nur die genannten Specs auf `pixel-7`.
   - Jeder lokale E2E-Lauf nimmt eine maschinenweite Sperre.
   - Die volle Suite fährt die CI auf jedem Branch.
5. **Die CI bleibt das volle Gate vor jedem Deploy**, mit allen Suites, WebKit und Budgets. Ein reiner Doku-Commit fährt in der CI nur den Job `check` und deployt nicht (Nutzerentscheid 1, E10).
6. **Abgeschlossene Pläne kommen ins Archiv** (`docs/plans/archiv/`). Wer `docs/plans/` liest, sieht nur aktive Pläne. Ein Gate prüft Status, Nummern und Pfadverweise (E11).

## Nicht-Ziele

- **Kein Gate wird schwächer.** Keine Schwelle, kein Budget, kein Retry und keine Assertion ändert sich. Einzige Ausnahme ist das Zeitlimit zweier CPU-gebundener Unit-Tests (E8). Das Zeitlimit ist keine Aussage dieser Tests.
- **Keine automatische Auswahl von E2E-Specs** über eine Zuordnung von Spec zu Quelle oder über Tags (E4).
- **`vitest related` und `--changed` werden kein Gate** (E3).
- **Keine weiteren lokalen Stufen für Daten oder Build.** Coverage, Builds und `size` laufen lokal nur auf ausdrücklichen Aufruf (`pnpm check`) und sonst in der CI (E2).
- **Keine Änderung an Shards, Geräten oder Testinhalten der CI.** Der Pixel-7-Shard liegt mit 486 s um 24 % über dem Chromium-Schnitt. Das ist unter der 30-%-Schwelle aus Plan 0013, E1, und bleibt eine Beobachtung.
- **Kein Wiederverwenden der CI über die SHA** (E10, verworfen).
- **lefthook im Worktree:** `pnpm install` schreibt in einem Worktree über `prepare` den absoluten Pfad seines lefthook-Binarys in das gemeinsame `.git/hooks/pre-commit`. Das widerspricht ADR 0004, Abschnitt „Mehrere Checkouts“. Fehlt der Worktree später, findet das Skript lefthook über seinen Fallback `$(git rev-parse --show-toplevel)/node_modules/lefthook/bin/index.js`, der Hook funktioniert also weiter. Das kommt nach `docs/ideas.md` (Etappe 5).

## Ausgangslage

### Harness heute

| Stelle | Was | Befund |
|---|---|---|
| `lefthook.yml:2–5` | pre-commit: `pnpm -s check:fast` | läuft unabhängig vom Diff, auch bei reinen Doku-Commits (Problem 2) |
| `scripts/check-fast.ts:8–20` | 8 Schritte parallel: 4× `tsc`, Biome, dependency-cruiser, `validate-data`, Vitest | keine Doku-Prüfung; `knip` und `schema:check` fehlen und laufen nur in der CI |
| `.claude/hooks/stop-gate.ts:25–29` | Stop-Gate: `treeHash()` ≠ letzter grüner Hash → `check-fast.ts` | prüft auch Turns ohne Änderung, sobald HEAD sich bewegt hat oder kein Zustand da ist (Problem 3) |
| `.claude/hooks/lib.ts:70–88` | `treeHash()` = sha256 über HEAD, `git status`, `git diff HEAD` und neue Dateien | hängt am **Commit**, nicht am Inhalt: Nach jedem Commit, nach einem Rebase und in jedem frischen Worktree läuft `check:fast` erneut |
| `.claude/hooks/lib.ts:14–20` | `exitIfNotInstalled()` prüft nur, ob `node_modules/.bin/tsc` existiert | ein **veraltetes** `node_modules` zeigt sich als Typfehler, z. B. „Cannot find module 'web-push'“ (Problem 3) |
| `.claude/settings.json:36–39` | Stop-Hook mit `timeout: 180` | Läuft er ins Timeout, ist das ein nicht blockierender Fehler, und das Gate lässt durch |
| `playwright.config.ts:78–82` | kein `workers` → Playwright nimmt 50 % der Kerne (8 von 16) | drei parallele Worktrees mit vollen Läufen = 24 Browser-Worker plus Preview-Server (Problem 1) |
| `playwright.config.ts:6–7, 70, 75` | Fixture-Port `PW_PORT`, echter Server auf `PW_PORT + 1`, `reuseExistingServer: !CI` | ohne eigenen `PW_PORT` übernimmt ein Lauf still den Server eines anderen Worktrees |
| `package.json` `check` | `check:fast && knip && schema:check && test:coverage && e2e && size` | die einzige dokumentierte „volle“ Stufe enthält die volle E2E-Suite |
| `CLAUDE.md:11` | „Fertig, wenn `pnpm check:fast` grün ist“ | sagt nichts zu E2E lokal; Agents fuhren deshalb `pnpm check` bzw. `pnpm e2e` (Problem 4) |
| `.github/workflows/ci.yml:3–5, 12–14` | jeder Push auf jeden Branch: 9 Jobs; `concurrency` je Ref ohne Abbruch | Läufe auf `main` warten aufeinander. GitHub hält je Gruppe nur **einen** wartenden Lauf, ein neuerer bricht den älteren wartenden ab („cancelled“ 3× in 100 Läufen) |
| knip 6.39.0, `plugins/playwright` | lädt `playwright.config.ts`, um `testMatch`, `globalSetup` und Reporter auszuwerten | Code, der beim Laden der Konfiguration wirft, macht `knip` rot (Review B1) |
| `.claude/skills/browser-review/SKILL.md` | Preview fest auf Port 4173 | kollidiert bei parallelen Sessions |

### Messwerte lokal (2026-10-08, 16 Kerne, Worktree auf `a666dbe`)

`pnpm check:fast` lief einmal in **5,9 s**. Die Last lag vorher bei 2,00 und nachher bei 3,46 (1-Minuten-Mittel). Das 15-Minuten-Mittel lag bei 47, ein Rest der Läufe vom Vormittag. Der pre-commit-Hook brauchte beim Commit dieses Plans 6,3 s.

Die Einzelschritte wurden nacheinander gemessen, bei einer Last von 3,0–4,3:

| Schritt | Dauer |
|---|---|
| `tsc` Haupt / SW / SW-Tests / Worker | 1,2 / 0,5 / 0,6 / 0,5 s |
| Biome `check .` | 0,9 s |
| Architektur (dependency-cruiser) | 1,6 s |
| Daten (`validate-data`) | 0,6 s |
| Vitest: 80 Dateien, 1 062 Tests | 4,7 s (Summe der Testdauern 7,2 s) |
| `knip` | 2,2 s |
| `schema:check` | 0,3 s |
| `test:coverage` | 6,6 s |
| `vitest related --run src/domain/format.ts` | 1,5 s |
| `vitest run --changed` ohne Änderung | 0,7 s |
| Inhalts-Hash des Arbeitsbaums (Wegwerf-Index, `git add -A`, `git write-tree`) | 0,1 s |
| `pnpm install --frozen-lockfile`, Store vorhanden | 6,3 s |

- Die langsamsten Unit-Tests stehen in `scripts/transit/profile-csa.test.ts`:
  - „gleicht der Referenz bei Abgang 300, 800 und 1 500 m“ (Zeile 682): **1 599 ms**
  - „gleicht der Referenz für jeden Steig und jede Minute“ (Zeile 632): **952 ms**
- Das Vitest-Zeitlimit liegt bei 5 s. Bei einer Last von 46–116 auf 16 Kernen (3- bis 7-fach überbucht) reißen die beiden Tests es (Problem 2). Alle anderen Tests liegen unter 230 ms.
- Biome verarbeitet kein Markdown: `biome check docs CLAUDE.md` meldet „Checked 0 files … No files were processed in the specified paths“.

**E2E-Umfang** laut `playwright test --list`: **2 422 Tests**, also 480 je Gerät × 5 Geräte plus 22 Smoke.
- Je Gerät verteilen sie sich so: `mobile-ux` 157, `layout` 113, `startpunkt` 37, `karte` 23, `anbieter` 23, `app` 20, `push` 19, `installieren` 17, `pwa`, `detail`, `calendar` und `anbieter-inhalt` je 13, `saved` 6, `font-swap` 5, `theme` 4, `timezone` 2, `perf` 2.
- Alle 17 Specs importieren `e2e/fixtures.ts`. `e2e/mobile-ux.ts` nutzen elf davon: `anbieter`, `app`, `calendar`, `installieren`, `layout`, `mobile-ux`, `push`, `pwa`, `smoke`, `startpunkt` und `theme`.
- Einen vollen lokalen Lauf misst dieser Plan nicht, weil parallel andere Agents arbeiten. Plan 0013 hat 1 442 Tests mit 4 Workern in 685 s gemessen. Hochgerechnet auf 2 422 Tests sind das **etwa 19 min ohne Last**. Am 2026-10-08 dauerten parallele Läufe über 40 min.

### Messwerte CI (Läufe auf `main`)

Lauf 37474075714 (`a666dbe`) brauchte vom Push bis zum Deploy 9,5 min:

| Job | Dauer | davon |
|---|---|---|
| Statische Gates & Unit-Tests | 0,6 min | `check:fast` 9 s („grün in 8.9s“), Coverage 9 s, knip < 4 s |
| E2E chromium 1/4 … 4/4 | 6,6 / 8,8 / 6,2 / 7,5 min | E2E 343 / 486 / 334 / 411 s, Browser 22–27 s |
| E2E webkit 1/2, 2/2 | 7,7 / 7,2 min | E2E 404 / 375 s, Browser 37 s |
| Smoke & Budgets | 2,6 min | Smoke 103 s, Deploy-Build 4 s |
| Deploy | 0,4 min | |

- **Dauer:** Die letzten 15 Läufe auf `main` dauerten 6,4–11,8 min. Ausreißer war Lauf 37455204469 (`0031f09`) mit **18,5 min**, ein **reiner Doku-Commit**. Davon waren 9 min Warten: angelegt um 11:15:33, gestartet erst um 11:24:18, hinter dem Lauf von `da03ded`.
- **Doku-Anteil:** **17 der letzten 40 Commits auf `main` ändern nur Markdown.** Gemeint sind `docs/**/*.md`, `*.md` im Wurzelverzeichnis und `.claude/skills|agents/**/*.md`.
  - Jeder dieser Commits fährt 9 Jobs, zusammen etwa 45 Job-Minuten.
  - Jeder deployt ein `dist/`, das sich nur in `meta.json` unterscheidet, im Feld `commit` (`scripts/build-data.ts:48–54`).
- **Was erst in CI auffiel:** Von den letzten 100 CI-Läufen waren 16 rot.
  - 8 Läufe auf `push-0017` und `worktree-push-0011-s2`, alle im Job „Statische Gates“. Ursache war jedes Mal **knip** (unbenutzte Exporte bzw. Abhängigkeiten). knip läuft in keinem lokalen Hook.
  - 3 Läufe auf `main` am 2026-10-05, im Job „E2E chromium 2/4“, an `font-swap.spec.ts:29`. **`origin/main` war also nicht immer grün.**
  - 5 Läufe waren absichtlich rot: Kanarienvögel aus Plan 0013, Diagnose und Spikes.
  - Folgerung: Lokal fehlt der billigste Check (knip, 2,2 s). Die teure lokale E2E-Suite hat keinen dieser CI-Fehler verhindert.

### Pläne heute

- **Umfang:** 21 Pläne mit zusammen 12 034 Zeilen.
- **Statuszeilen:** Sie sind uneinheitlich und teils veraltet.
  - 0004, 0005, 0007 und 0008 melden noch „offen: Fast-Forward nach `main`“. Auf `main` liegen aber 21, 21, 34 bzw. 13 Commits, die den Plan nennen.
  - 0017 und 0021 stehen auf „freigegeben“, obwohl sie live sind (`a666dbe` bzw. `fc39cf7`).
- **Verweise:**
  - Den Text „Plan 00NN“ gibt es etwa 950-mal: `src` 450, `e2e` 188, `scripts` 96, ADRs 97, `docs/ideas.md` 52, `architecture.md` 42 und weitere. Diese Verweise brechen beim Verschieben nicht.
  - **Pfadverweise** auf eine konkrete Plan-Datei gibt es **11**, alle in älteren Plänen, darunter 0007, 0008, 0009 (dreimal), 0012, 0014, 0018, 0019 und 0020. Weitere 19 Pfadverweise zeigen auf ADR-Dateien; sie bleiben beim Archivieren gültig. Alle 30 Verweise zeigen heute auf vorhandene Dateien (geprüft am 2026-10-08). Plan 0027 selbst nennt seit der Überarbeitung keinen Pfad mehr; die erste Fassung tat das (Review M2). Hinzu kommen die Platzhalter `docs/plans/NNNN-<thema>.md` in `CLAUDE.md:9` und `.claude/skills/plan-review/SKILL.md:8`.
  - Einen Link-Check gibt es nicht.
- **Kollisionen:** Plan- und ADR-Nummern kollidierten schon zwischen parallelen Branches. So wurde „0015“ zu 0017 und „0018“ zu 0020. ADR 0020 ist auf dem Branch `plan-0026-teilen` vergeben.

## Entscheidungen

### E1 – Zwei Klassen: Doku-Positivliste und alles andere (Review M4)

- **Modul:** `scripts/lib/change-class.ts` ist rein, ohne I/O. Es bildet eine Liste geänderter Pfade auf eine Stufe ab.
- **Stufe 0** gilt nur, wenn **jeder** Pfad auf der Positivliste steht. Sonst gilt C.
- **Pfade:** Gelöschte Pfade zählen mit, ebenso alter und neuer Pfad einer Umbenennung (der Aufrufer nutzt `--no-renames`).
- **Leerer Diff:** Eine leere Liste ergibt 0.

| Klasse | Pfade | Stufe |
|---|---|---|
| Doku und Agent-Texte | `docs/**/*.md` **außer `docs/design/**`**, `*.md` im Wurzelverzeichnis (`README.md`, `CLAUDE.md`), `.claude/skills/**/*.md`, `.claude/agents/*.md` | **0** |
| alles andere | z. B. `src/**`, `public/**` (auch `public/**/*.md`), `docs/design/**`, Konfiguration, Lockfile, unbekannte Ordner | **C** |

Warum diese Grenze trägt:
- Kein Build, kein Test und kein Skript liest diese Dateien. Das ist geprüft per grep in `src`, `scripts`, `e2e`, `push-worker`, `tests`, `vite.config.ts`, `playwright.config.ts` und `knip.jsonc`.
- Biome verarbeitet sie nicht (Ausgangslage).
- `public/**` wird deployt und liegt im Precache des Service Workers. Deshalb steht es nicht auf der Liste.
- Einen späteren Bruch dieser Grenze fängt der Test „Doku liest niemand“ ab (Tests, Nr. 1).

### E2 – Zwei Stufen

| Stufe | Inhalt | Dauer ohne Last |
|---|---|---|
| **0** Doku | `check-docs` (E11). Nur Node-Builtins; als Hook nur mit `node_modules` (E6). | < 1 s |
| **C** alles andere | `check:fast` mit **knip** und **`schema:check`** als neuen parallelen Schritten, dazu `check-docs` | ≈ 7 s |

- **knip und `schema:check` in `check:fast`:** Damit fällt lokal auf, was bisher erst in der CI rot wurde (8 von 11 nicht absichtlich roten Läufen waren knip). Die eigenen CI-Schritte „Tote Pfade (knip)“ und „Schema-Drift“ (`ci.yml:31–34`) entfallen, weil `check:fast` sie enthält.
- **Lokal ohne eigene Stufe:**
  - Coverage, beide Builds und `size` laufen lokal nicht. `pnpm check` bleibt als ausdrücklicher Aufruf für Menschen und läuft unter der Sperre (E7).
  - Das Daten-Gate ist schon in `validate-data` enthalten. Die Invarianten im Daten-Build (`build-data.ts:99–118`, z. B. `MAX_WITHOUT_LINES`) prüft die CI im Smoke-Job.
  - Wer Daten, Pipeline oder Build ändert, nennt diese Läufe im Plan je Schritt (E12).
- **`verify` nur lokal:** Die CI ruft ihre Schritte weiter einzeln auf. `pnpm verify` gibt es nur lokal.

### E3 – Unit-Tests: immer die ganze Suite, kein `related`

- Die ganze Suite braucht 4,7 s, `vitest related` spart also höchstens 3 s.
- `related` folgt nur dem Import-Graphen. Tests, die Dateien lesen, übersieht es:
  - `profile-csa.test.ts:633–635` liest `tests/fixtures/oepnv/fahrplan.json`.
  - Die Datensatz-Tests lesen `tests/fixtures/*.yaml`.
  - Die Parser-Tests lesen `tests/fixtures/pipeline/`.
- **Entscheidung:** Stufe C fährt immer die ganze Suite. `vitest related <datei>` nennt CLAUDE.md nur als Werkzeug für die innere Schleife.

### E4 – E2E lokal: genannte Specs auf `pixel-7`, unter Sperre (Nutzerentscheid 2)

**Automatische Auswahl verworfen:**
- E2E ist absichtlich Black-Box. Die Regel `e2e-black-box` verbietet `e2e/` jeden Import aus `src/`, also gibt es keinen Graphen von Spec zu Quelle.
- 270 der 480 Tests je Gerät prüfen jede Ansicht (`mobile-ux`, `layout`).
- Gemeinsame Helfer betreffen fast alles: `e2e/fixtures.ts` alle 17 Specs, `e2e/mobile-ux.ts` elf.
- Eine Zuordnung von Hand oder per Tags veraltet ohne eigenes Gate.

**Das Skript** `pnpm e2e:local <spec …> [-- <playwright-args>]` (`scripts/e2e-local.ts`):
- **Ohne Spec-Argument** bricht es ab und nennt die Regel.
- Es läuft unter der Sperre (E7, über `scripts/heavy.ts`).
- Es baut `dist-e2e/` (`pnpm build:e2e`, ca. 4 s).
- **Ports:** Es sucht zwei aufeinanderfolgende freie Ports `p` und `p + 1`, so wie `playwright.config.ts:6–7` sie erwartet. Der Helfer liegt in `scripts/lib/free-ports.ts` und prüft beide per `net.createServer().listen`.
- **Umgebung:** Es setzt `PW_PORT=p`, `PW_SUITE=chromium`, `--project=pixel-7` und `ZP_HEAVY_LOCK=1`. Mit `PW_SUITE=chromium` startet nur der Fixture-Server.
- **Andere Geräte** nur mit ausdrücklichem `-- --project=<name>`. Für `iphone-15` setzt das Skript `PW_SUITE=webkit`.

**`playwright.config.ts`:**
- **Worker:** lokal `workers: "25%"` (4 von 16). CI unverändert mit `--workers=2` (`ci.yml:75`).
- **Server:** `reuseExistingServer: !CI && !ZP_HEAVY_LOCK`. Unter dem Skript startet immer ein eigener Server. Ist der Port doch belegt, schlägt der Lauf über `--strictPort` laut fehl.
- **Wächter als `globalSetup`** (Review B1): `e2e/global-setup.ts` wirft, wenn weder `CI` noch `ZP_HEAVY_LOCK` gesetzt ist. Die Meldung nennt `pnpm e2e:local` bzw. `pnpm e2e`.
  - `globalSetup` läuft nur beim echten Testlauf, nicht bei `--list`. knip und das Laden der Konfiguration bleiben unberührt.
  - Beim Laden der Konfiguration wirft weiterhin nichts außer den Wächtern aus Plan 0013.

**Unverändert:** `pnpm e2e` (lokal alles) bleibt für Menschen und läuft unter der Sperre. `pnpm check` bleibt die volle Kette.

**Pflicht je Änderung** (CLAUDE.md, E12):

| Änderung | lokal | E2E lokal |
|---|---|---|
| nur Doku | Stufe 0 (automatisch) | keine |
| Domänenlogik ohne sichtbare Änderung | Stufe C | keine |
| Domänenlogik mit sichtbarer Änderung (Texte, Sortierung …) | Stufe C | Specs, die das Verhalten zeigen, auf `pixel-7` |
| UI | Stufe C | Specs der geänderten Ansicht auf `pixel-7`, danach `/browser-review` wie bisher |
| nur Tests | Stufe C | geänderte Specs auf `pixel-7`; bei `e2e/fixtures.ts` oder `e2e/mobile-ux.ts` zusätzlich `theme.spec.ts` (kurz, nutzt beide) |
| Daten, Pipeline, Build, Konfiguration, Service Worker | Stufe C | im Plan je Schritt benannt (z. B. `pwa.spec.ts` für den Service Worker, `--list`-Summe aus Plan 0013, Test 1 für die Playwright-Konfiguration) |

- **Dauer:** 37 Tests (`startpunkt.spec.ts`) brauchen in CI etwa 2 s Worker-Zeit je Test. Mit 4 Workern sind das etwa 20 s, mit Build und Serverstart **unter 1 min**.
- **Flakes unter Last** werden lokal nicht mit `--last-failed` gejagt. Ein Test, der nur lokal unter Last rot ist, wird erst ein Befund, wenn er auch in der CI rot oder „flaky“ wird. Dort gilt `retries: 1` (`playwright.config.ts:82`), und es gibt keine fremde Last.

### E5 – Stop-Gate: Inhalts-Hash und gemeinsame Stempel (Review M3, M4, M5)

1. **Inhalts-Hash statt Commit-Hash.** `treeHash()` in `.claude/hooks/lib.ts` liefert die Tree-ID des Arbeitsbaums:
   - Ablauf: `GIT_INDEX_FILE=<tmp> git read-tree HEAD`, dann `git add -A`, dann `git write-tree`.
   - Der Wegwerf-Index liegt in `.claude/state/idx-<pid>-<zufall>`, ist also je Prozess eindeutig, und wird danach gelöscht.
   - Kosten 0,1 s. Ignorierte Dateien zählen nicht (`.gitignore`), und der echte Index bleibt unberührt.
   - Gleicher Inhalt ergibt dieselbe ID, vor oder nach einem Commit, nach einem Rebase und in jedem Worktree.
   - `mark-reviewed.ts` und die Review-Erinnerung nutzen dieselbe Funktion.
2. **Gemeinsame grüne Stempel.**
   - **Wer stempelt:** nur `verify.ts`, in jedem Modus (E9 und Punkt 3). Das Gate und der pre-commit-Hook werten nur den Exit-Code aus und schreiben selbst nichts.
   - **Was gespeichert wird:** Nach einem grünen Lauf schreibt `verify` die Datei `~/.cache/zwergenplan/green/<tree-id>` mit `{ tier, at, cAt }`. Dazu kommt `.claude/state/last-green.json` mit `{ tree }`.
     - `cAt` ist der Zeitpunkt des letzten Laufs der Stufe C, der diesen Inhalt abdeckt.
     - Ein Lauf der Stufe C setzt `cAt = at`.
     - Ein Lauf der Stufe 0 erbt `cAt` vom Stempel seiner Basis (Review 2, M-B).
   - **Atomar:** Beide Dateien werden atomar geschrieben, erst in eine temporäre Datei, dann `rename`.
   - **Nur bei gleichem Baum:** `verify` stempelt nur, wenn die Tree-ID **vor und nach** dem Lauf gleich ist. Hat sich der Baum während des Laufs geändert, gibt es keinen Stempel, und das nächste Stop-Gate prüft erneut.
   - **Frische:** Ein Stempel gilt als frisch, wenn sein **`cAt` jünger als 12 h** ist. Dann lässt das Gate sofort durch, auch wenn der Stempel aus einem anderen Worktree stammt. Gemessen wird an `cAt`, nicht an `at`. So kann eine Kette reiner Doku-Turns die Frist nicht beliebig verlängern.
   - **Warum 12 h:** `validate-data` hängt am Datum, etwa bei der Warnung zum Fahrplanwechsel. Ein alter Stempel soll das nicht überdecken.
   - **Ohne Änderung kein Lauf:** Ein Turn, der einen schon grün geprüften Inhalt nicht ändert, prüft also nichts. Einen eigenen Hook für den Turn-Start gibt es nicht. Er hätte rote oder nie geprüfte Bäume durchgelassen (Review M4).
   - **Grenze des Stempels:** Er deckt nur den Inhalt ab. Bei einem Treffer läuft auch die Prüfung des Lockfiles (E6) nicht. Ein `node_modules`, das seit dem Stempel veraltet ist, fällt erst beim nächsten Lauf der Stufe C auf, spätestens aber in der CI.
3. **Eine Schnittstelle: `verify.ts --stop`** (Review 2, Minor 6).
   - **Was der Aufruf erledigt:** `verify --stop` berechnet selbst die Tree-ID, liest Stempel und Basis, entscheidet über `stop-decision.ts`, prüft und stempelt. Der Exit-Code sagt dem Gate: 0 heißt durchlassen, 1 heißt rot, 3 heißt Zeitlimit.
   - **Basis:** der letzte grüne Baum dieses Worktrees, sofern dessen Stempel frisch ist (`cAt` < 12 h) und das Tree-Objekt noch existiert (`git cat-file -e`). Sonst gibt es keine Basis.
   - **Stufe:** Die geänderten Pfade liefert `git diff --name-only --no-renames <base> <tree>`, daraus folgt die Stufe nach E1. Ohne Basis gilt Stufe C für den ganzen Baum.
   - **Folge:** Ein reiner Doku-Turn auf einem frisch gestempelten Stand prüft nur Stufe 0.
   - **Weitere Modi:** `--staged` für den pre-commit-Hook (E9), ohne Argument für den Aufruf von Hand (Diff gegen `merge-base origin/main` plus Arbeitsbaum). Weitere Optionen gibt es nicht.
4. **Höchstens Stufe C, Zeitlimit mit ganzer Prozessgruppe** (Review 2, M-A).
   - Das Gate baut nichts und startet kein E2E. So stört es kein `e2e:local`, das gerade `dist-e2e/` nutzt.
   - **Prozessgruppe:** `verify.ts` und `check-fast.ts` starten jeden Schritt mit `spawn(…, { detached: true })` in einer eigenen Prozessgruppe. Heute geschieht das ohne Gruppe (`check-fast.ts:24–36`). Bei Zeitablauf beenden sie jede Gruppe mit `process.kill(-pid, "SIGTERM")` und nach 2 s mit `SIGKILL`. So bleiben keine `tsc`- oder Vitest-Worker übrig.
   - **Zeitlimit von `verify`:** 150 s, danach Exit 3 mit der Meldung „Zeitlimit (150 s), Last zu hoch?“.
   - **Zeitlimit im Gate:** `run()` in `.claude/hooks/lib.ts:28–35` bekommt `timeout: 165_000` und `killSignal: "SIGKILL"`. Damit bleibt der Hook sicher unter seinem eigenen Timeout von 180 s (`.claude/settings.json:38`). Endet der Prozess durch ein Signal oder mit `ETIMEDOUT`, zählt das als Rot mit der Meldung „Zeitlimit“. Das Gate blockiert dann, statt über das Hook-Timeout still durchzulassen.
5. **Unverändert:**
   - Rot blockiert mit Exit 2, höchstens 3× je Arbeitsstand (`MAX_BLOCKS`), danach Freigabe mit Warnung. Die Warnung nennt den Grund: „check:fast ist weiterhin ROT“ bzw. „Zeitlimit, nicht geprüft“ (`stop-gate.ts:45`, Review 2, Minor 11).
   - Die Erinnerung an `/arch-review` ab 200 Zeilen bleibt.
   - Die Hooks importieren nur Node-Builtins. Die Klassifizierung liegt in `scripts/`, das Gate ruft sie als Prozess auf.

### E6 – Veraltetes `node_modules` als Hinweis, nicht als Typfehler

- **Vergleich:** `verify.ts` und `check-fast.ts` vergleichen zuerst `pnpm-lock.yaml` byte-genau mit `node_modules/.pnpm/lock.yaml`. Diese Kopie legt pnpm bei jeder Installation an. Nach `pnpm install --frozen-lockfile` waren beide identisch (geprüft am 2026-10-08).
- **Bei Abweichung** (oder fehlender Kopie) bricht Stufe C vor allen Schritten ab, mit genau einer Meldung: `node_modules passt nicht zu pnpm-lock.yaml. Abhilfe: pnpm install --frozen-lockfile`.
- **Stufe 0** prüft das Lockfile nicht. `check-docs` selbst braucht nur Node-Builtins. Die Hooks laufen aber nur mit `node_modules`: Ohne `node_modules/.bin/tsc` geben die Claude-Hooks nur einen Hinweis (`lib.ts:14–20`), und lefthook braucht sein Binary aus `node_modules`. Ohne Installation bleibt also nur der Aufruf von Hand `node scripts/check-docs.ts`.
- **Stop-Gate:** Es gibt die Meldung unverändert weiter.
- **CI:** Dort ist die Prüfung immer grün, denn der Job installiert vorher.
- **Kein automatisches `pnpm install`:** Es würde über `prepare` die gemeinsamen Git-Hooks umschreiben und braucht Netz.

### E7 – Eine maschinenweite Sperre für E2E (Review M1)

- **Aufruf:** `scripts/heavy.ts <cmd …>` startet `flock -o -w <s> ~/.cache/zwergenplan/heavy.lock <cmd>` (util-linux 2.39.3 ist vorhanden).
- **Warum `-o`:** Damit schließt `flock` den Deskriptor der Sperre, bevor es das Kommando startet. Kinder und Enkel (Browser, ein abgekoppeltes `vite preview`) erben die Sperre nicht. Die Sperre hält nur der `flock`-Prozess selbst. Endet er, auch mit `SIGKILL`, gibt der Kernel sie frei.
- **Prozessgruppe:**
  - `heavy.ts` startet `flock` mit `detached: true` in einer eigenen Prozessgruppe.
  - Bei `SIGINT`, `SIGTERM` und beim eigenen Ende schickt es `SIGTERM` an die ganze Gruppe (`process.kill(-pid)`), nach 5 s `SIGKILL`.
  - So bleiben keine Preview-Server zurück, die einen späteren Lauf auf demselben Port stören.
- **Wartezeit:**
  - Das Bash-Tool der Agents bricht nach 10 min ab. Standard ist deshalb `-w 30`.
  - Ist die Sperre belegt, endet das Skript mit Exit 75 und der Meldung: „E2E-Sperre belegt von <Worktree>, <Kommando>, seit <Zeit>. Später erneut, oder warten mit ZP_LOCK_WAIT=1800 und run_in_background.“ Diese Angaben schreibt der Halter nach dem Erwerb in eine Begleitdatei.
  - CLAUDE.md schreibt vor: `pnpm e2e:local` immer mit `run_in_background`.
- **Ohne `flock`** (macOS) läuft das Kommando mit Warnung ohne Sperre.
- **Bekannte Grenze, `SIGKILL` auf `heavy.ts`** (Review 2, Minor 10): `heavy.ts` kann dieses Signal nicht abfangen. `flock` und das Kommando laufen dann weiter und halten die Sperre, bis sie von selbst enden; die Wartezeit ist durch Playwright begrenzt. Die Begleitdatei nennt PID und Kommando, damit man von Hand aufräumen kann. Ein Wächter, der den Elternprozess beobachtet, kommt nicht dazu. Er wäre die einzige Mechanik für einen seltenen Fall.
- **Ein Platz.** Maschinenweit läuft also ein E2E-Lauf mit 4 Workern, statt bis zu 24 Browser. Ein zweiter Platz brächte unter Last wieder Flakes.
- **Unter der Sperre:** `pnpm e2e:local`, `pnpm e2e` und damit `pnpm check`.
- **Ohne Sperre:** `check:fast`, `verify` und der pre-commit-Hook. Ein Commit soll nie hinter einem fremden E2E-Lauf warten.
- **Worker nach Last: verworfen.** Mit der Sperre bleibt die Fremdlast klein, und feste 25 % sind reproduzierbar.

### E8 – CPU-gebundene Unit-Tests ohne Last-Flakes

- **Zeitlimit:** Die zwei Referenztests in `scripts/transit/profile-csa.test.ts` (Zeilen 632 und 682) bekommen `{ timeout: 30_000 }`. Der Kommentar dazu begründet es:
  - Die Aussage ist Gleichheit mit der Referenz, nicht Tempo.
  - Ohne Last brauchen sie 1,6 s bzw. 0,95 s.
  - 30 s halten eine 15-fache Überbuchung aus und fangen trotzdem eine Endlosschleife ab.
- **Unverändert** bleiben Assertions, Netz und Seed.
- **Kein globales `testTimeout`:** Ein höherer Wert verdeckte Hänger in den anderen 1 060 Tests, die alle unter 230 ms brauchen.
- **Neue Regel in CLAUDE.md, Stolperfallen:** Ein CPU-gebundener Test über 1 s bekommt ein eigenes, begründetes Zeitlimit.

### E9 – pre-commit nach Stufe

- **Aufruf:** `lefthook.yml` ruft `node scripts/verify.ts --staged` statt `pnpm -s check:fast` auf.
- **Pfade und Prüfgegenstand:** Die Pfade kommen aus `git diff --cached --name-only --no-renames`. Geprüft wird wie heute der Arbeitsbaum.
- **Reiner Doku-Commit:** Er fährt Stufe 0 und braucht unter 1 s. Einen Format-Check verliert er nicht, denn Biome prüft kein Markdown. Neu kommen Status-, Nummern- und Pfadprüfung dazu (E11).
- **Leerer Diff** (`--allow-empty`) zählt als Stufe 0.

### E10 – CI: Doku-Pfad (Nutzerentscheid 1, Review B2)

- **Job `scope`:** Er läuft vor allem anderen. Er braucht `actions/checkout` mit `fetch-depth: 0` und Node, aber kein `pnpm install`, und ruft `node scripts/ci-scope.ts` auf (nutzt `change-class.ts`). Ergebnis ist `full=true|false`, im Zweifel `true`.
- **Wann `full=false` gilt:**
  - **Auf `main`:** Verglichen wird mit dem **ausgelieferten** Stand, nicht mit dem Vorgänger.
    - **Live-Commit über die Deployments-API, mit vollem SHA** (Review 2, Minor 1). Der Aufruf `gh api "repos/{owner}/{repo}/deployments?environment=github-pages&per_page=10"` liefert die Deployments, das neueste zuerst. Maßgeblich ist das neueste, dessen letzter Status (`…/deployments/<id>/statuses`) `success` ist. Am 2026-10-08 geprüft: Die API liefert `sha` voll (z. B. `3f57669…`) und die Statusfolge `waiting → queued → in_progress → success`.
    - **Warum nicht `meta.json`:** `https://zwergenplan.app/data/meta.json` trägt nur einen Kurz-SHA oder `"unbekannt"` (`build-data.ts:48–50`) und kann aus einem CDN-Cache kommen.
    - **Prüfung des Werts:** Der SHA muss `^[0-9a-f]{40}$` erfüllen. Andernfalls gilt `full=true`.
    - `full=false` nur, wenn dieser Commit Vorfahre von `github.sha` ist (`git merge-base --is-ancestor`) **und** `git diff --name-only --no-renames <live>..<sha>` nur Stufe 0 enthält.
    - **Jede Ausnahme in `ci-scope` ergibt `full=true` und kein Rot** (Review 2, Minor 2). Das gilt bei API-Fehlern, fehlendem oder ungültigem SHA, unbekanntem Objekt und Zeitüberschreitung (10 s je Aufruf). Der Grund steht im Log.
    - **Rechte des Jobs:** `permissions: { contents: read, actions: read, deployments: read }`.
    - Warum: Ein wartender Code-Lauf C0, den ein Doku-Commit D1 abbricht, ist nie live gegangen. Der Diff von „live“ nach D1 enthält dann C0, also gilt `full=true`, und C0 wird mitgeprüft und deployt (Review B2).
  - **Auf anderen Branches:**
    - `full=false` nur, wenn `github.event.before` Vorfahre ist, `before..sha` nur Stufe 0 enthält **und** es für `before` einen Lauf von `ci.yml` gibt mit `event: push`, gleicher Ref (`head_branch`) und `conclusion: success`. Abgefragt wird per `gh api` (Rechte siehe oben).
    - Ein abgebrochener wartender Lauf erfüllt das nicht, ebenso wenig ein grüner Lauf auf einer anderen Ref.
  - **Neue Branches** (`before` aus Nullen), **`pull_request` und `workflow_dispatch`:** immer `full=true`.
- **Bei `full=false`:**
  - **`check`** läuft wie immer, auch `data:validate --against-deployed` auf `main`.
  - **`e2e` und `smoke`:** `if: needs.scope.outputs.full == 'true'`, sonst übersprungen.
  - **`gates`:** `needs: [scope, check, e2e, smoke]` und `if: ${{ !cancelled() }}`. Der Schritt prüft `needs.*.result` und schlägt fehl, wenn `scope` oder `check` nicht `success` ist oder wenn bei `full == 'true'` `e2e` oder `smoke` nicht `success` ist.
  - **`deploy`:** `needs: [gates, scope]`, `if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && needs.scope.outputs.full == 'true'`.
- **Garantie danach:** Jeder **ausgelieferte** Stand ist voll grün geprüft. Ein Stand auf `main` ohne vollen Lauf unterscheidet sich vom ausgelieferten, voll geprüften Stand nur in Dateien, die kein Build, kein Test und kein Skript liest. Er führt also keinen neuen roten Befund ein. Behauptet wird **nicht**, dass `origin/main` immer grün ist; das war am 2026-10-05 dreimal nicht so.
- **Folge für „live zeigt den neuen Stand“:** Für Doku-Commits zeigt `meta.json` den letzten Commit mit Build-Eingaben. CLAUDE.md sagt das (E12).
- **Verworfen, SHA wiederverwenden:** Nach einem Fast-Forward hat derselbe Commit auf dem Branch schon voll bestanden. Das Ergebnis trotzdem nicht übernehmen, weil:
  - Das Pages-Artefakt müsste aus einem fremden Lauf kommen.
  - `--against-deployed` läuft nur auf `main`.
  - Ein Fehler in dieser Verdrahtung deployte ungeprüft.

  Das kommt nach `docs/ideas.md`.

### E11 – Pläne archivieren (Nutzerentscheid 3)

- **Wohin:** `docs/plans/archiv/`. Die Dateinamen bleiben gleich, die Nummern bleiben über beide Ordner eindeutig.
- **Statusfeld:** Die **erste nicht-leere Zeile nach dem Titel** beginnt mit `Status: `. Darauf folgt genau einer dieser Werte, danach darf freier Text stehen:
  - `Entwurf`
  - `Review eingearbeitet`
  - `freigegeben`
  - `in Umsetzung`
  - `abgeschlossen, live seit <sha> (<JJJJ-MM-TT>)`
  - `ersetzt durch Plan NNNN`
- **„Vollständig umgesetzt“** heißt:
  - Der Status ist `abgeschlossen` mit SHA und Datum.
  - Alle Schritte bzw. Etappen sind erledigt.
  - **Nichts steht mehr offen.** Offene Restpunkte (Geräteprüfung, Hinweise aus dem Browser-Review, spätere Ideen) wandern vorher nach `docs/ideas.md`, Abschnitt „Offen aus abgeschlossenen Plänen“, je mit „(aus Plan NNNN)“. Das macht der archivierende Agent, nicht das Skript.
- **Wer und wann:** Wer einen Plan abschließt, archiviert ihn als **letzten Schritt der Arbeitsweise**: nach grüner CI auf `main` und, wo nötig, nach `/browser-review live`. Dazu gehört ein Doku-Commit „docs: Plan NNNN abgeschlossen, archiviert“ mit:
  - Status im neuen Format,
  - Restpunkten in `docs/ideas.md`,
  - `git mv`,
  - umgeschriebenen Pfadverweisen.
- **Gate `scripts/check-docs.ts`** (Stufe 0, zusätzlich in `check:fast` und damit in der CI, nur Node-Builtins). Es durchsucht nur getrackte Dateien (`git ls-files`), also nie `.claude/worktrees/`, und lässt `tests/fixtures/docs/` aus (Review M2). Regeln:
  1. Jede `docs/plans/*.md` und jede `docs/plans/archiv/*.md` hat eine gültige Statuszeile.
  2. `abgeschlossen` und `ersetzt` stehen nur in `archiv/`, alle anderen Status nur in `docs/plans/`. Wer den Status setzt, muss also auch verschieben.
  3. Plan-Nummern sind über `docs/plans/` und `archiv/` eindeutig, ADR-Nummern in `docs/adr/`.
  4. **Pfadverweise:** Jeder Treffer eines Pfads auf eine Plan- oder ADR-Datei (vierstellige Nummer, Thema, `.md`, optional mit `archiv/`) in getrackten `*.md`, `*.ts`, `*.tsx`, `*.yml`, `*.json` und `*.cjs` muss als Datei existieren. Ausgenommen sind `data/` und `tests/fixtures/`, denn das sind Rohdaten und Testmaterial (Review 2, Minor 9). Jeder relative Markdown-Link auf eine `.md`-Datei in `docs/`, `CLAUDE.md` und `README.md` muss auflösen. Externe Links prüft das Gate nicht, denn Netz in einem Gate flackert.
- **Querverweise:** „Plan 00NN“ als Text bleibt gültig, die Nummer ist eindeutig. Beim Archivieren werden nur die Pfadverweise umgeschrieben (heute 11, siehe Ausgangslage). Regel 4 hält das danach dicht. CLAUDE.md sagt: „Plan NNNN liegt in `docs/plans/` oder, wenn abgeschlossen, in `docs/plans/archiv/`.“
- **Agents:** `ls docs/plans` zeigt nur aktive Pläne und den Ordner `archiv/`. Der `plan-reviewer` liest Pläne aus dem Archiv nur, wenn ein Verweis darauf zeigt.
- **Frontmatter von Skills und Agents** (Review 2, Minor 3): Diese Dateien gehören zur Klasse 0, aber in der Frontmatter können `hooks:`, `permissionMode:`, `allowed-tools:` und `model:` Verhalten ändern. Ein Prüfskript dafür wäre neue Mechanik für einen Fall, den es heute nicht gibt: Die vorhandenen Dateien nutzen nur `name`, `description` und `tools`. Deshalb die einfachere Lösung: ADR 0021 hält fest, dass Prozessregeln in dieser Frontmatter nur durch Review gesichert sind und nicht durch ein Gate.

### E12 – Doku sagt, welche Stufe wann genügt

- **`CLAUDE.md`, Arbeitsweise:**
  - Schritt 3: „Fertig, wenn `pnpm verify` grün ist und die E2E-Pflicht aus der Tabelle erfüllt ist.“ Die Tabelle aus E4 steht dort in Kurzform.
  - Neuer Satz: „Die volle E2E-Suite fährt lokal kein Agent; die CI fährt sie auf jedem Branch.“
  - Schritt 6: Doku-Commits deployen nicht (E10).
  - Neuer Schritt 7: Archivieren (E11).
- **`CLAUDE.md`, Stolperfallen:**
  - `e2e:local` immer mit `run_in_background`. Ports wählt das Skript selbst, `PW_PORT` von Hand entfällt.
  - die Sperre (E7) und der Wächter in `globalSetup` (E4);
  - die Meldung zu veraltetem `node_modules` (E6);
  - die Zeitlimit-Regel (E8);
  - `vitest related` als Werkzeug (E3);
  - Plan-Nummern werden auch im Archiv vergeben.
- **Skills:**
  - `arch-review`, Schritt 1: `pnpm verify` statt `pnpm check:fast`.
  - `browser-review`: Die Vorschau startet über `scripts/lib/free-ports.ts`, das Skript gibt die URL aus, statt fest 4173.
  - `plan-review`: Pläne in `archiv/` sind abgeschlossen.
- **Agents:**
  - `plan-reviewer`, unter „Backpressure-Lücken“: Der Plan nennt je Schritt die lokale Prüfung und die E2E-Specs.
  - `arch-reviewer` bleibt unverändert.
- **ADRs:**
  - ADR 0004 bekommt einen Nachtrag mit Verweis auf ADR 0021: knip und `schema:check` laufen in `check:fast`, Hooks prüfen nach Stufe.
  - ADR 0002 bekommt einen Verweis auf ADR 0021, Teil B (Etappe 7).
  - Der Status von ADR 0021 hat zwei feste Zeitpunkte: Teil A gilt als angenommen mit Etappe 5, Teil B mit Etappe 7.

### E13 – CI beobachten, ohne das API-Limit zu reißen (Nachtrag 2026-10-08)

**Befund:** Am 2026-10-08 ist das Rate-Limit der GitHub-API gerissen, das primäre wie das sekundäre.
- `gh run watch` fragt standardmäßig alle 3 s Lauf und Jobs ab. Das sind etwa 2 400 Anfragen pro Stunde je Watch.
- Mehrere Watches liefen parallel, vom Orchestrator und von Agents, alle über dasselbe Token. Das Limit liegt bei 5 000 Anfragen pro Stunde.
- Folge: `gh` antwortete mit „HTTP 403: API rate limit exceeded“, auch für Abfragen, die nichts mit dem Beobachten zu tun hatten.

**Regel:**
1. **Wer beobachtet:** nur der Orchestrator bzw. die Haupt-Session. Subagents beobachten die CI nicht. Sie pushen und berichten.
2. **Wie:** `gh run watch <id> -i 120 --exit-status` oder einzelne `gh run view <id>` mit mindestens 2 min Abstand. Nie in einer Schleife ohne Pause.
3. **Deploy prüfen ohne API:** `curl -s https://zwergenplan.app/data/meta.json` und das Feld `commit` mit `git rev-parse --short HEAD` vergleichen. Der Skill `babyevents-nuernberg` macht es schon so (Schritt 5, „Fertig, wenn …“).
4. **Folgen für E10:** Der Job `scope` fragt die API höchstens zweimal je Lauf ab (Deployments und Statuses bzw. die Läufe von `before`), mit dem `GITHUB_TOKEN` des Laufs, nicht mit dem Token der Sessions. Das Limit der Sessions berührt das nicht.

**Betroffene Stellen** (Etappe 5):
- `CLAUDE.md:17`, Arbeitsweise, Schritt 6: „(`gh run watch`)“ wird zu „(`gh run watch <id> -i 120 --exit-status`, nur die Haupt-Session; Subagents beobachten die CI nicht)“. Für „Live zeigt den neuen Stand“ kommt der Weg über `meta.json` dazu.
- `.claude/skills/babyevents-nuernberg/SKILL.md:73, 78`: `gh run watch` → `gh run watch <id> -i 120 --exit-status`. Läuft der Skill als Subagent, beobachtet er die CI nicht und meldet stattdessen SHA und Lauf-ID.
- `.claude/skills/browser-review/SKILL.md`: nutzt keine `gh`-Abfragen. Ergänzt wird nur, dass `live` erst nach dem Deploy sinnvoll ist, geprüft über `meta.json.commit`.
- `.claude/agents/*.md`: haben keine Bash-Rechte, sind also nicht betroffen.

## Tests (wie das Harness selbst getestet wird)

Für die reinen Module zuerst die Tests. Für jedes Gate gibt es einen Kanarienvogel (ADR 0004).

1. **`scripts/lib/change-class.test.ts`** (tabellengetrieben):
   - Jedes Muster der Positivliste.
   - `public/x.md` → C.
   - `docs/design/x.png` → C.
   - `docs/design/x.md` → C (Review 2, Minor 5).
   - unbekannter Pfad → C.
   - Doku plus `src/domain/x.ts` → C.
   - leere Liste → 0.
   - Umbenennung `src/ui/a.tsx` nach `docs/a.md` (beide Pfade) → C.
   - **„Doku liest niemand“:** Der Test sucht in `src/`, `scripts/`, `e2e/`, `push-worker/`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `biome.json`, `knip.jsonc`, `.github/workflows/`, `.claude/hooks/`, `.claude/settings.json`, `lefthook.yml`, `.dependency-cruiser.cjs` und in den `scripts` von `package.json` (Review 2, Minor 4).
     - Er sucht nach einem `.md`-String in der Nähe von `readFileSync`, `readFile`, `import`, `fetch` oder `glob`.
     - Er sucht nach `readdirSync`/`readdir` mit `.endsWith(".md")` und nach Mustern wie `**/*.md`.
     - Er prüft, dass `biome check docs CLAUDE.md` 0 Dateien verarbeitet.
     - Ausnahmeliste: nur `scripts/check-docs.ts`.
     - Ein Treffer außerhalb davon macht den Test rot.
2. **`scripts/lib/stop-decision.test.ts`.** Die Entscheidung des Gates ist eine reine Funktion `decide({ treeBefore, treeAfter, stamp, lastGreen, blocks, … })` mit den Ergebnissen `pass`, `check(stufe, base)`, `stamp` und `block`. Fälle:
   - Stempel frisch (`cAt` < 12 h) → `pass`.
   - `cAt` 13 h alt → `check`.
   - Basis mit `cAt` 13 h alt oder Objekt fehlt → `check(C, keine Basis)`.
   - Basis gültig, Diff nur Doku → `check(0)`; der neue Stempel erbt `cAt` der Basis.
   - **Doku-Kette über mehr als 12 h** (C-Lauf um 0 h, dann Doku-Turns bei 4 h, 8 h und 13 h) → beim Turn nach 13 h `check(C)` (Review 2, M-B).
   - Tree vor ≠ nach → kein `stamp`.
   - dreimal rot → Freigabe mit Warnung; Grund „ROT“ bzw. „Zeitlimit“.

   Die Funktion liegt in `scripts/lib/`. Das Gate ruft `verify.ts --stop` als Prozess auf, wegen der Regel „Hooks nur mit Builtins“.
2a. **Zeitlimit mit Prozessgruppe** (`scripts/lib/run-steps.test.ts`, Review 2, M-A):
   - Ein Schritt `sh -c 'sleep 999 & sleep 999; wait'` mit Limit 1 s → Ergebnis rot mit der Meldung „Zeitlimit“.
   - Danach läuft kein Prozess der Gruppe mehr (`process.kill(-pid, 0)` wirft `ESRCH`).
   - Ein Hook-`run()` mit `timeout` gegen einen hängenden Prozess → Ergebnis rot, Meldung „Zeitlimit“.
3. **`scripts/check-docs.test.ts`** mit Fixture-Ordner `tests/fixtures/docs/`, den das echte Gate auslässt:
   - gültiger und fehlender Status;
   - Status erst nach einer Leerzeile (gültig);
   - `abgeschlossen` außerhalb von `archiv/`;
   - doppelte Plan-Nummer und doppelte ADR-Nummer;
   - toter Pfadverweis;
   - toter relativer Link;
   - externer Link bleibt ungeprüft;
   - ungetrackte Datei bleibt ungeprüft.
4. **`scripts/heavy.test.ts`** mit eigenem Pfad für die Sperre über `ZP_LOCK_DIR`, ohne die echte Sperre:
   - Zwei Aufrufe nacheinander: Der zweite endet mit Exit 75 bei `ZP_LOCK_WAIT=0`. Mit Wartezeit beginnt er erst nach dem ersten.
   - **Enkelprozess:** Halter `heavy.ts sh -c 'sleep 5 & wait'`, `SIGTERM` an `heavy.ts` → die Sperre ist sofort frei, und `sleep` lebt nicht mehr.
   - **`SIGKILL` an `flock`** → die Sperre ist frei, obwohl der Enkel noch läuft (`-o`).
5. **Vorprüfung in `verify.ts`** (E6) mit Fixture-Ordner: Lockfile ≠ Kopie → Exit 1 und genau die Zeile mit der Abhilfe.
6. **`scripts/ci-scope.test.ts`** (reine Entscheidung, Git und HTTP als Eingaben). Fälle:
   - `main`: Live-Commit ist Vorfahre und der Diff ist nur Doku → `false`.
   - `main`: Der Diff enthält einen Code-Commit, der nie live war (wartender Lauf abgebrochen) → `true`.
   - Abruf fehlgeschlagen (Netz, 404, Zeitüberschreitung) → `true`.
   - Antwort kein JSON, kein Deployment mit Status `success`, `sha` fehlt, `sha` = `"unbekannt"` oder ein Kurz-SHA → `true` (Review 2, Minor 1).
   - Ausnahme im Skript → `true` und Exit 0 (Review 2, Minor 2).
   - Live-Commit kein Vorfahre → `true`.
   - Branch: Vorgänger ohne grünen Push-Lauf auf derselben Ref → `true`.
   - neuer Branch, `pull_request` → `true`.
7. **Kanarienvögel**, je einmal von Hand, Ergebnis im Plan unter „Ergebnis“:
   - **K1:** Commit nur mit einer Plan-Datei, die eine nicht vorhandene Plan-Datei mit Nummer 9999 per Pfad nennt (im Commit-Text beschrieben, nicht hier ausgeschrieben, damit Regel 4 diesen Plan nicht trifft) → pre-commit rot in < 2 s.
   - **K2:** Commit mit `docs/x.md` und einem Typfehler in `src/domain/format.ts` → Stufe C, rot.
   - **K3:** `neu/x.txt` → „Stufe C (nicht auf der Doku-Liste: neu/x.txt)“.
   - **K4:** `pnpm-lock.yaml` um eine Leerzeile ändern (nicht committen) → Meldung aus E6, kein Typfehler.
   - **K5:** `pnpm exec playwright test e2e/theme.spec.ts` ohne Skript → `globalSetup` wirft. Mit `--list` → kein Wurf. **`pnpm knip` grün** (Review B1).
   - **K6:** zweimal `pnpm e2e:local e2e/theme.spec.ts` gleichzeitig → der zweite meldet „E2E-Sperre belegt …“ und Exit 75; mit `ZP_LOCK_WAIT=600` läuft er danach grün. Danach ist kein `vite preview` übrig (`pgrep -f "vite preview"`).
   - **K7:** Stop-Gate:
     - Turn nur mit einer Frage auf gestempeltem Stand → kein Prüflauf.
     - Commit ohne Inhaltsänderung → kein Lauf.
     - frischer Worktree mit demselben Baum → Stempel greift.
     - Datei während des Laufs geändert → kein Stempel.
   - **K8:** `profile-csa.test.ts` unter künstlicher Last (48× `node -e "for(;;);"` für 60 s) → grün. Gegenprobe mit dem alten Zeitlimit von 5 s → rot.
   - **K9** (Etappe 7, auf einem Branch und danach auf `main`):
     - Doku-Commit nach grünem Push-Lauf → `e2e` und `smoke` übersprungen, `gates` grün.
     - Doku-Commit nach rotem Vorgänger → volle Matrix.
     - Doku plus `src/`-Datei → volle Matrix.
     - **Wartender Lauf abgebrochen:** Code-Commit und direkt danach Doku-Commit pushen, sodass der Code-Lauf als wartender Lauf abgebrochen wird → der Doku-Lauf fährt `full=true`. Auf `main` wird deployt, und `meta.json` zeigt den Doku-Commit.

## Erfolgskriterien

| Kriterium | Ziel | Wie gemessen |
|---|---|---|
| pre-commit, reiner Doku-Commit | < 10 s, auch bei Last ≥ 40 (Ziel < 2 s) | `time git commit` in K1, Last mit `uptime` |
| pre-commit, nur Domänenlogik | < 60 s lokal (ohne Last ≈ 7 s) | `time git commit` mit einer Änderung in `src/domain/` |
| Stop-Gate auf gestempeltem Stand | 0 Prüfläufe, < 1 s | K7 |
| E2E lokal für eine Ansicht | < 3 min für einen Spec auf `pixel-7` | Ausgabe von `e2e:local` |
| Last bei 3 parallelen Sessions | höchstens ein E2E-Lauf gleichzeitig, Last < 32 (2× Kerne) | `uptime` während paralleler Arbeit, Begleitdatei der Sperre |
| CI für Doku-Commit auf `main` | ≈ 1 min statt ≈ 9,5 min, kein Warten des nächsten Code-Commits | `gh run view --json jobs` |
| **QS: Fehler erst in CI** | knip-Fehler in CI → 0; andere Klassen nicht mehr als heute | Zählung wie in der Ausgangslage über die nächsten 100 Läufe: `gh run list --status failure`, je Lauf roter Job und Ursache (`gh run view <id> --json jobs`, `--log-failed`); Kanarienvögel zählen nicht |
| **QS: nichts Kaputtes live** | 0 Deploys mit rotem Gate; kein Hotfix wegen eines Fehlers, den eine bisher lokale Prüfung gefunden hätte | `gh run list --branch main`, Commits `fix:` auf `main` mit Ursache |

Mehr rote E2E-Läufe auf Branches sind Absicht und kein QS-Verlust. Die volle Suite läuft ab jetzt in der CI des Branches: 9 min statt lokal unter Last mehr als 40 min. Maßstab ist, dass nichts Kaputtes live geht.

## Schritte (einzeln mergebare Etappen, nach Gewinn je Risiko)

Jede Etappe bekommt einen eigenen Branch `harness-0027-e<n>`, eigene CI und einen Fast-Forward nach `main`. Bis Etappe 2 gilt noch der alte pre-commit.

1. **Sofortmaßnahmen** (kein neues Modul):
   - E8: Zeitlimit für `profile-csa`, belegt mit K8.
   - knip und `schema:check` in `check-fast.ts`. Die zwei CI-Schritte dafür entfallen.
   - E6: Vorprüfung des Lockfiles in `check-fast.ts`, mit Test 5 und K4.
   - CLAUDE.md, Stolperfallen: Zeitlimit-Regel, Vorprüfung und vorab die Regel „E2E lokal nur gezielt, die volle Suite fährt die CI“.

   Fertig, wenn `check:fast` grün ist, K4 und K8 belegt sind und die CI grün ist.
2. **pre-commit mit Doku-Kurzschluss** (E1, E2, E9):
   - Zuerst `change-class.ts` mit Test 1.
   - `check-docs.ts` mit Test 3, anfangs **nur Regel 3 und 4**. Die Statusregeln kommen mit Etappe 6, sonst wären heute 21 Pläne rot.
   - `verify.ts` mit `--staged` und ohne Argument (Diff gegen `merge-base origin/main` plus Arbeitsbaum). `--stop` kommt mit Etappe 3 (E5.3).
   - `run-steps.ts`: Schritte in eigener Prozessgruppe mit Zeitlimit (E5.4), mit Test 2a, gemeinsam für `verify.ts` und `check-fast.ts`.
   - `lefthook.yml`, in `package.json` der Eintrag `verify`, `check-docs` in `check:fast`.
   - Vor dem Merge `check-docs` auf dem ganzen Repo laufen lassen. Erwartung: grün, denn alle 30 Pfadverweise zeigen heute auf vorhandene Dateien.

   Fertig, wenn Test 1 und 3 grün sind, K1–K3 belegt sind und ein Doku-Commit unter 2 s braucht.
3. **Inhalts-Hash mit Stempeln** (E5):
   - `lib.ts` `treeHash()` neu, Stempel unter `~/.cache/zwergenplan/green/`.
   - `stop-decision.ts` mit Test 2.
   - `verify.ts --stop` (E5.3), schreibt Stempel mit `cAt`.
   - `stop-gate.ts` ruft `verify.ts --stop`. `run()` in `lib.ts` bekommt `timeout: 165_000` und `killSignal: "SIGKILL"`. Die Freigabe nach drei Blocks nennt „Zeitlimit“, wenn das der Grund war.
   - **Pflicht vor dem Merge:** Test 2a (Zeitlimit beendet die ganze Prozessgruppe) muss grün sein, sonst greift wieder das Hook-Timeout (Review 2, M-A).

   Fertig, wenn Test 2 und 2a grün sind und K7 belegt ist.
4. **Sperre und Worker** (E4, E7):
   - `heavy.ts` mit Test 4.
   - `free-ports.ts`, `e2e-local.ts`.
   - `e2e/global-setup.ts` (Wächter), in `playwright.config.ts` Worker 25 % und `reuseExistingServer`.
   - In `package.json` `e2e` und `e2e:local`.
   - Plan 0013, Test 1 lokal: Die `--list`-Summen bleiben gleich.

   Fertig, wenn K5 und K6 belegt sind und die CI grün ist. Summe aus passed, skipped und flaky über alle Jobs = 2 422.
5. **Doku** (E12):
   - CLAUDE.md, Skills und Agents. `browser-review` nutzt `free-ports.ts`.
   - Regel zum Beobachten der CI aus E13: in `CLAUDE.md` (Schritt 6, mit Intervall) und im Skill `babyevents-nuernberg`, dazu der Hinweis in `browser-review`.
   - ADR 0004, Nachtrag. ADR 0021, Teil A, auf „angenommen“.
   - `docs/ideas.md`: SHA-Wiederverwendung, lefthook im Worktree, 5. Chromium-Shard.

   Fertig, wenn `check-docs` grün ist und ein frischer Subagent die Frage „Welche Prüfung genügt für eine Änderung an `src/ui/Detail.tsx`?“ allein aus CLAUDE.md so beantwortet: „`pnpm verify`, dazu `pnpm e2e:local e2e/detail.spec.ts` im Hintergrund, danach `/browser-review`“.
6. **Archiv** (E11):
   - Statusregeln 1 und 2 in `check-docs.ts`.
   - **Erste Archivierung:** je Plan den Stand gegen `git log` und den Inhalt prüfen, Restpunkte nach `docs/ideas.md` übertragen (Nutzerentscheid 3), den Status ins Format bringen, `git mv`. Die 11 Pfadverweise auf archivierte Plan-Dateien umschreiben, und dabei prüfen, dass auch dieser Plan bis dahin keinen neuen Pfadverweis bekommen hat.
   - Pläne, die einer der offenen Branches ändert (`git diff --name-only origin/main...origin/<branch>` für jeden Branch auf `origin`), werden erst nach dessen Merge archiviert.
   - Vorschlag:

     | Plan | Vorschlag |
     |---|---|
     | 0001, 0002, 0003, 0006, 0012, 0013, 0014, 0016, 0019, 0020, 0021 | archivieren; offene Hinweise vorher nach `ideas.md` |
     | 0004, 0005, 0007, 0008 | archivieren. Der Status ist veraltet („offen: FF nach `main`“), die Commits liegen auf `main`, und `/browser-review live` ist laut `3469f6a` bzw. `25878b3` erledigt. Den Abschluss-SHA aus `git log` übernehmen. |
     | 0009, 0010 | archivieren, nachdem H1–H8 bzw. die Geräteprüfung in `ideas.md` stehen |
     | 0011 | Stufe 2 `ersetzt durch Plan 0017`, Stufe 1 abgeschlossen → archivieren |
     | 0015, 0018 | bleiben (freigegeben, nicht umgesetzt) |
     | 0017 | bleibt, bis die Mittel-Befunde der Nachprüfung entschieden sind |
     | 0022–0026 (andere Branches) | unberührt |

   Fertig, wenn `check-docs` mit allen Regeln grün ist und `ls docs/plans` nur aktive Pläne zeigt.
7. **CI-Doku-Pfad** (E10, Nutzerentscheid 1):
   - `scripts/ci-scope.ts` mit Test 6.
   - `ci.yml`: Job `scope`, Bedingungen an `e2e`, `smoke`, `gates` (`!cancelled()`) und `deploy` (`needs: [gates, scope]`), am Job `scope` `permissions: { contents: read, actions: read, deployments: read }`.
   - K9 mit allen vier Fällen.
   - ADR 0021, Teil B, auf „angenommen“; Verweis in ADR 0002.

   Fertig, wenn K9 mit verlinkten Läufen belegt ist.

## Ergebnis

### Etappe 1 (Branch `harness-0027-e1`, `72fab74`)

| Messung | vorher | nachher |
|---|---|---|
| `check:fast`, lokal (16 Kerne) | 5,3 s bei Last 2,9, 8 Schritte | 5,7 s bei Last 5,6, 10 Schritte (mit knip und Schema-Drift) |
| pre-commit (lefthook, gesamt) | 5,6 s | 6,1 s |
| CI, `check:fast` im Job „Statische Gates“ | 9 s, dazu knip < 4 s und Schema-Drift als eigene Schritte (Lauf 37474075714) | nach dem ersten Lauf auf `main` eintragen |
| `profile-csa`, 12 Endlosschleifen auf CPU 0, Vitest auf demselben Kern | 2× „Test timed out in 5000ms“ (Stand `origin/main`) | grün |

- K4: Eine Leerzeile im Lockfile ergibt „node_modules passt nicht zu pnpm-lock.yaml …“ mit Exit 1, ohne einen einzigen Schritt.
- K8: siehe die Zeile `profile-csa` in der Tabelle.

### Etappe 2 (Branch `harness-0027-e2`, `821018d`)

- `check:fast` mit 11 Schritten (dazu Doku): 5,9 s bei Last 1,0.
- `check-docs` auf dem Repo: 0,15 s, grün, 402 Dateien.
- K1: Ein Doku-Commit mit totem Pfadverweis ist im pre-commit nach **0,29 s** rot. Vorher lief `check:fast` mit 5,6 s.
- K2: Doku plus ein Typfehler in `src/domain/age.ts` ergibt Stufe C, „Typen“ ist rot.
- K3: `neu/x.txt` ergibt „Stufe C (neu/x.txt, Index)“.
- Kanarienvogel für „Doku liest niemand“: `readdirSync(...).endsWith(".md")` in `scripts/icons.ts` macht den Test rot.
- **Abweichung vom Plan:** Test 3 (`check-docs`) arbeitet mit einem Repo im Speicher statt mit `tests/fixtures/docs/`. Das ist einfacher und braucht keine Fixture-Ausnahme. Die Ausnahme für `tests/fixtures/docs/` bleibt trotzdem in `check-docs.ts`. `*.test.ts` sind von Regel 4 ausgenommen, weil Tests Pfade als Testdaten nennen.

### Etappe 3 (Branch `harness-0027-e3b`, siehe Vorfall unten)

- **Neue Module, jeweils mit Test vorab:**
  - `scripts/lib/stop-decision.ts` (Test 2, auch die Doku-Kette über mehr als 12 h);
  - `scripts/lib/tree-id.ts` (Tree-ID gleich vor und nach einem Commit, Ignoriertes zählt nicht, der echte Index bleibt unberührt, Wegwerf-Index je Prozess, atomares Schreiben);
  - `tree-id-hooks.test.ts` hält die Kopie in `.claude/hooks/lib.ts` gleich.
- **`verify.ts --stop`:** stempelt nach E5.2. `stop-gate.ts` ruft es mit `timeout: 165_000` und `SIGKILL` auf. Ein Zeitlimit zählt als Rot, die Meldung lautet „Zeitlimit, nicht geprüft“.
- **K7** gegen das echte Gate (`echo '{…}' | node .claude/hooks/stop-gate.ts`), mit eigenem Cache (`ZP_CACHE_DIR`):

  | Fall | Ergebnis |
  |---|---|
  | erster Lauf, kein Stempel | Stufe C, 6,3 s |
  | unverändert | kein Lauf, 0,3 s |
  | `last-green.json` gelöscht (wie frischer Worktree) | Stempel greift, 0,3 s |
  | Doku-Änderung auf grünem Stand | Stufe 0 „seit grünem Stand …“, `check-docs` |
  | Stempel der Stufe 0 | erbt `cAt` der Basis |
  | Datei zurück auf den gestempelten Inhalt | kein Lauf, 0,3 s |
  | roter Baum | dreimal Block (Exit 2), danach Freigabe mit „Prüfung weiterhin: ROT“ |
  | Zeitlimit in `verify` (1 s) | Block „Zeitlimit, nicht geprüft“, Exit 3; danach kein `check-fast`, `tsc` oder Vitest übrig |
  | Zeitlimit im Gate (0,5 s, SIGKILL) | Block „Zeitlimit, nicht geprüft“ |
  | Datei während der Prüfung geändert | „Baum hat sich während der Prüfung geändert → kein Stempel“; Gegenprobe ohne Änderung stempelt |
  | `node_modules` fehlt | Hinweis „Hooks inaktiv“, Exit 0, kein Block (wie bisher) |

- **Abweichung von Test 2:**
  - `decide` ist schmaler als geplant und liefert nur `pass` oder `check(base?)`.
  - `nextStamp` baut den Stempel.
  - `shouldStamp(mode, tier)` legt fest, welcher Modus stempeln darf.
  - Die Blocks zählt weiter `stop-gate.ts`.
  - Kein Vergleich vor und nach dem Lauf in `decide`, das macht `verify.ts`.
- **Doku:** CLAUDE.md enthält schon je einen kurzen Satz zu `verify` im pre-commit, zum Stop-Gate mit Stempeln und zur git-Isolation. Die vollständige Fassung der Arbeitsweise kommt mit Etappe 5 (E12).
- **Nacharbeit nach dem Arch-Review zu Etappe 2 und 3:**
  - **M1:** Ein Fehler im Stop-Gate selbst blockiert jetzt (Exit 2) statt still durchzulassen (Exit 1), höchstens dreimal, danach Freigabe mit Warnung. `treeHash` verträgt fehlendes stdout. Ein ungültiges `ZP_GATE_TIMEOUT_MS` ist ein Fehler.
  - **M2:** `vitest.setup.ts` löscht alle GIT_* für jeden Test. Ein statischer Test verlangt `withoutGitEnv` in jeder Zeile, die in einem Test git startet.
  - **Minor:**
    - `verify` kommentiert, warum `--staged` die Umgebung erbt, und nutzt `-z`.
    - Ein Diff-Fehler führt zu Stufe C statt zu Rot.
    - Exit 3 von `check:fast` heißt Zeitlimit, und `verify` reicht es durch.
    - `MD_STRING` erkennt `?raw`.
    - Getrackte Symlinks sind verboten.
    - Der Kanarienvogel vergleicht `.git/config` byte-gleich.
    - `CLAUDE_PROJECT_DIR` wird nach dem Test zurückgesetzt.
- **Bekannte Grenze:** Beendet das Gate `verify` per SIGKILL (die letzte Sicherung, 165 s), läuft das `check:fast` darunter in seiner eigenen Prozessgruppe weiter. Es endet nach höchstens 140 s an seinem eigenen Zeitlimit. Im Normalfall greift vorher das Zeitlimit von `verify` (150 s), und dann bleibt nichts übrig (Zeile „Zeitlimit in `verify`“ in der Tabelle).
- **Ergänzung zum Plan:** Greift ein Stempel, setzt `verify --stop` den gestempelten Baum als `last-green.json` dieses Worktrees. Ein frischer Checkout auf grünem Inhalt hat damit sofort eine Basis für den Doku-Kurzschluss.
- **Vorfall beim ersten Commit (2026-10-08, 12:43):**
  - **Was geschah:** Die neuen Tests `tree-id.test.ts` und `tree-id-hooks.test.ts` liefen im pre-commit-Hook. Dort setzt git `GIT_DIR` und `GIT_INDEX_FILE`. Die Tests erbten beide, und ihr `git init`, `git config` und `git commit` im Temp-Ordner trafen das echte Repo.
  - **Schaden:**
    - `core.bare = true` im gemeinsamen `.git/config`: Haupt-Checkout und alle Worktrees waren kaputt. Der Orchestrator hat den Wert zurückgesetzt.
    - `user.email = t@example.org` und `user.name = Test` lokal im gemeinsamen `.git/config`: entfernt. In der halben Stunde danach hat kein Commit diese Identität getragen.
    - Zwei Commits „start“ auf `harness-0027-e3`, sie leeren den Baum. Der Branch ist mit ihnen gepusht und wird nicht weiter genutzt. Die Arbeit liegt auf `harness-0027-e3b`.
  - **Behebung:**
    - `scripts/lib/git-env.ts` (`withoutGitEnv`): Produktivcode ruft git mit eigenem `cwd` nur ohne geerbte GIT_*-Variablen auf, ebenso die Kopie in `.claude/hooks/lib.ts`.
    - `scripts/lib/temp-repo.ts`: Tests nutzen git schreibend nur dort. Temp-Ordner, explizites `GIT_DIR` und `GIT_WORK_TREE`, keine globale Konfiguration, Identität per `-c`, nie `git config`.
  - **Kanarienvogel `scripts/lib/git-isolation.test.ts`:**
    - Er stellt die Lage im Hook mit einem Köder-Repo nach: Konfiguration, HEAD und Index des Köders bleiben unverändert.
    - Danach prüft er am echten Projekt: `core.bare` ist `false`, es gibt kein lokales `user.email`, HEAD ist unverändert.
    - Gegenprobe: Mit geerbter Umgebung im Temp-Repo wird er rot.
- **Ergänzung zum Plan:** `--staged` und der Aufruf von Hand stempeln nur nach Stufe C. Ein Lauf der Stufe 0 im pre-commit prüft nur den Index-Diff und ist deshalb kein Beleg für den ganzen Arbeitsbaum.

### Etappe 4 (Branch `harness-0027-e4`)

- **`scripts/heavy.ts`** (Test 4, mit eigenem `ZP_LOCK_DIR`):
  - `flock -o -E 75 -w <ZP_LOCK_WAIT, Standard 30>`, eigene Prozessgruppe.
  - Bei SIGINT, SIGTERM und SIGHUP sowie nach dem Ende beendet `heavy.ts` die ganze Gruppe.
  - Der Halter schreibt Worktree, Kommando, Zeit und Prozessgruppe in `heavy.holder`.
  - Getestet: Exit-Code und `ZP_HEAVY_LOCK=1` werden durchgereicht. Ein zweiter Lauf endet mit Exit 75 und nennt den Halter; mit Wartezeit startet er erst nach dem ersten. SIGTERM beendet auch den Enkel (`sleep 30 & wait`) und gibt die Sperre frei. Werden `heavy.ts` und `flock` per SIGKILL beendet, ist die Sperre trotzdem frei, während der Enkel weiterläuft (die bekannte Grenze aus E7).
- **`scripts/lib/free-ports.ts`** (mit Test): zwei aufeinanderfolgende freie Ports.
- **`scripts/e2e-local.ts`** (`pnpm e2e:local <spec …> [-- …]`): ohne Spec bricht es ab; es läuft unter `heavy.ts`, nimmt pixel-7 und `PW_SUITE` passend zur Engine. `pnpm e2e` läuft unter `heavy.ts`.
- **`playwright.config.ts`:**
  - lokal `workers: "25%"`;
  - `reuseExistingServer: false`;
  - Wächter `e2e/global-setup.ts` (Review B1).
  - **Ergänzung zum Plan:** Lokal ohne Sperre startet die Konfiguration keine Server. Playwright startet Server vor `globalSetup`, ohne `dist-e2e/` hätte sonst die Meldung „dist-e2e does not exist“ den Wächter verdeckt.
  - In CI bleibt alles wie bisher: `CI=true` setzt den Wächter außer Kraft, und `ci.yml` gibt die Worker vor.
- **Messung:**
  - Plan 0013, Test 1: `--list` lokal ohne Sperre ergibt 2 512 Tests. Mit `CI=true` sind es 1 992 (chromium) + 498 (webkit) + 22 (smoke) = 2 512. `--list` startet keinen Server und kein globalSetup.
  - `pnpm knip` ist grün; `flock` steht als Systemprogramm in `ignoreBinaries`.
- **K5:** `pnpm exec playwright test e2e/theme.spec.ts` ohne Sperre bricht im globalSetup mit dem Hinweis auf `pnpm e2e:local` ab.
- **K6:** zwei `e2e:local e2e/theme.spec.ts` gleichzeitig:
  - Der zweite (`ZP_LOCK_WAIT=0`) endet mit Exit 75: „E2E-Sperre belegt von <Worktree>, Kommando …“.
  - Der erste läuft grün durch: 4 passed, **12 s** mit Build.
  - Danach ist kein `vite preview` übrig, und die Sperre ist frei.
- **CLAUDE.md:** Die lokalen Beispiele nutzen `pnpm e2e:local`. Die Nachstellung eines CI-Jobs läuft unter `heavy.ts`.
- `browser-review` startet nur `vite preview` und `scripts/screenshots.ts` (Playwright als Bibliothek) und ist vom Wächter nicht betroffen. Den freien Port dort bekommt es mit Etappe 5.

### Etappe 5 (Branch `harness-0027-e5`)

- **`CLAUDE.md`:**
  - Neuer Abschnitt „Lokal prüfen“ mit den Stufen 0 und C, den Stempeln des Stop-Gates und einer E2E-Tabelle je Änderung. Er ist die einzige Quelle; die verstreuten Sätze aus Etappe 1 bis 4 in den Stolperfallen sind entfernt.
  - Arbeitsweise, Schritt 3: `pnpm verify`.
  - Schritt 6 mit E13: Nur die Haupt-Session beobachtet die CI, mit `gh run watch <id> -i 120 --exit-status`; der Deploy wird über `meta.json` geprüft.
  - Stolperfallen um die Git-Regel für Tests gekürzt.
- **Skills:**
  - `browser-review`: freier Port über `node scripts/free-port.ts` (neu, nutzt `free-ports.ts`); vor `live` die Prüfung über `meta.json`.
  - `babyevents-nuernberg`: `gh run watch` mit Intervall; als Subagent nur SHA und Lauf-ID melden.
  - `arch-review`: `pnpm verify`.
  - `plan-review`: unverändert, das Archiv kommt mit Etappe 6.
- **Agents:** `plan-reviewer` fragt nach der lokalen Prüfung je Schritt. `arch-reviewer` hat keine Bash-Rechte und bleibt unverändert.
- **ADRs und Ideen:**
  - ADR 0004 hat einen Nachtrag.
  - ADR 0021, Teil A, ist angenommen.
  - `docs/ideas.md` hat drei Einträge: SHA-Wiederverwendung, lefthook im Worktree, 5. Chromium-Shard.
- **Abnahme:** Ein frischer Subagent hat nur CLAUDE.md gelesen und die Frage „Welche Prüfung genügt für `src/ui/Detail.tsx`, und wie beobachte ich als Subagent die CI?“ so beantwortet: „`pnpm verify` (Stufe C) plus `pnpm e2e:local e2e/detail.spec.ts` mit `run_in_background`, danach `/browser-review`; die CI beobachtest du als Subagent nicht, du meldest Branch und SHA.“

### Etappe 6 (Branch `harness-0027-e6`, mit `origin/main` `bde7685`)

- **`check-docs`, Regeln 1 und 2:** Statuszeile nach Format, und `abgeschlossen`/`ersetzt` nur in `archiv/`. Die Tests laufen vorab, auch für Fettdruck, fehlende SHA oder ein falsches Datumsformat.
- **Statuszeilen:** Alle 27 Pläne sind ins Format gebracht. Der frühere Status steht jeweils als „Früherer Status: …“ dahinter.
- **Live-SHA:** Wo der alte Status einen Live-Commit nannte, ist es dieser. Sonst ist es der letzte Commit auf `main`, der den Plan nennt und zum Abschluss gehört (Browser-Review live, Ergebnis oder Hotfix). Bei 0001–0005, 0007, 0008, 0011 und 0013 ist das also kein exakter Deploy-Zeitpunkt.
- **Restpunkte:** in `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“, je Plan mit dem Abschnitt, in dem die Einzelheiten stehen (Nutzerentscheid 3).
- **Archiviert (18):** 0001–0014, 0016, 0019, 0020, 0021.
- **Aktiv (9):**

  | Plan | Grund |
  |---|---|
  | 0015, 0018 | freigegeben, nicht umgesetzt |
  | 0017 | live, aber Nutzerentscheid zu den Mittel-Befunden und Geräteprüfung offen |
  | 0022–0024 | live; archiviert nach dem Browser-Review-OK des Orchestrators im Merge mit `main` `1e0ced7` (Nachschliff), live seit `1e0ced7` (2026-10-08). Die Restpunkte Android-Installationsknopf, iPhone und Marker-Kategorie stehen in `docs/ideas.md`, die drei Pfadverweise in 0025 zeigen ins Archiv. |
  | 0025, 0026 | freigegeben, nicht umgesetzt |
  | 0027 | dieser Plan |

- **Pfadverweise:** 10 Verweise in archivierten Plänen zeigen jetzt auf `docs/plans/archiv/`. Verweise auf aktive Pläne (0017) bleiben. `check-docs` ist grün.
- **Doku:**
  - `CLAUDE.md`, Arbeitsweise: neuer Schritt 7 „Archivieren“.
  - `CLAUDE.md`, „Wo was steht“: `docs/plans/` und `archiv/`, Nummernvergabe über beide Ordner.
  - `plan-review`: Statuszeile und Archiv.
- **Panne beim Umschreiben:** Das einmalige Hilfsskript hat auch die Testdaten in `scripts/lib/doc-check.test.ts` umgeschrieben. Ich habe es bemerkt und von Hand zurückgesetzt. Der Diff gegen HEAD enthält nur die beabsichtigten Änderungen.

### Nacharbeit zum Arch-Review von Etappe 4 (als Fix-Commit auf `harness-0027-e6`)

Der Weg: ein Fix-Commit oben auf e6 statt Fixes auf e4 mit anschließendem Nachziehen von e5 und e6. Alle Etappen gehen ohnehin gemeinsam nach `main`.

- **M1:** `pnpm e2e` ist jetzt `node scripts/e2e-local.ts --all`. Argumente gehen unverändert an Playwright, Ports sind frei. Damit lässt sich auch ein CI-Job nachstellen: `PW_SUITE=webkit pnpm e2e -- --shard=1/2`. Tests: Argumente über `heavy.ts` und `sh -c "$@"`; Parser `scripts/lib/e2e-args.ts`.
- **M2:**
  - `heavy.ts` beendet die Gruppe in Stufen: SIGINT, nach 7 s SIGTERM, nach weiteren 3 s SIGKILL. Es pollt, bis die Gruppe leer ist, und endet erst danach.
  - Warum SIGINT zuerst: Bei der Abnahme mit Ctrl+C blieb mit SIGTERM der `vite preview` von Playwright übrig, denn Playwright startet ihn in einer eigenen Gruppe und räumt nur bei SIGINT ab.
  - `e2e-local.ts` ruft Playwright direkt über `node_modules/.bin/playwright` auf statt über `pnpm exec`, damit das Signal Playwright selbst erreicht.
  - Test mit `trap "" INT TERM; sleep 30`: Danach ist die Gruppe leer.
  - Die Fristen lassen sich für Tests über `ZP_INT_GRACE_MS` und `ZP_TERM_GRACE_MS` verkürzen.
  - Die Grenze „Sperre frei, während die Kinder abbauen“ steht in ADR 0021.
- **M3:** Ein verschachtelter Aufruf mit `ZP_HEAVY_LOCK=1` läuft direkt, mit Test.
- **Minor:**
  - **m1:** „belegt“ meldet `heavy.ts` nur, wenn ein anderer Halter eingetragen ist. Die Meldung nennt `kill -- -<pgid>`.
  - **m2:** freie Ports auch für `pnpm e2e`. Die Meldung „already used … reuseExistingServer“ ist in CLAUDE.md eingeordnet.
  - **m3:** `free-ports` prüft auch `::1`.
  - **m4:** Abnahme: `kill -INT` an die Gruppe mitten in `e2e:local e2e/layout.spec.ts`, danach ist kein Preview-Server auf dem Port des Laufs mehr da, keine Browser des Laufs, und die Sperre ist frei. Der erste Versuch ohne die M2-Stufen ließ den Preview-Server übrig.
  - **m5:** Der Parser liegt in `scripts/lib/e2e-args.ts` (mit Test). Die Geräteprojekte liegen nur noch in `playwright.devices.ts`, und `engineOf` leitet die Engine daraus ab.
  - **m6:** Die Kommentare in `playwright.config.ts` sind aktualisiert.
  - **m7:** `flock` wird mit `-o -E 75 -w 0` auf eine eigene Probedatei geprüft; scheitert das, läuft das Kommando ohne Sperre.
- **Kontrolle:** `--list` ergibt weiter 2 512 bzw. 1 992 + 498 + 22, `pnpm knip` ist grün.

### Nacharbeit zum Arch-Review von `harness-0027-e6` (`227a1f0`)

- **M1:** ADR 0021 beschreibt die Beendigung jetzt wie umgesetzt: zuerst SIGINT, mit Begründung aus der Abnahme m4. Die Sperre ist bis zu 10 s frei, dann folgen SIGTERM und SIGKILL.
- **M2:**
  - Neu ist der Wächter `scripts/heavy-watchdog.ts` in eigener Prozessgruppe. Endet `heavy.ts` per SIGKILL, räumt er die Gruppe des Laufs in Stufen ab, und die Sperre wird frei.
  - Die Logik zum Beenden der Gruppe liegt gemeinsam in `scripts/lib/process-group.ts`.
  - Test: SIGKILL nur an `heavy.ts`, danach ist die Gruppe leer und die Sperre frei. Der Test für `flock -o` läuft ohne Wächter (`ZP_NO_WATCHDOG=1`).
  - **Abnahme:** `pnpm e2e:local e2e/layout.spec.ts` als Hintergrundlauf des Bash-Tools, mitten im Lauf per TaskStop beendet. Danach lief kein Preview-Server auf dem Port des Laufs, kein `e2e-local`-Prozess und kein Wächter, und die Sperre war sofort frei.
  - CLAUDE.md: `pnpm e2e` nur, um einen roten CI-Job nachzustellen, und immer mit `run_in_background`.
- **Minor:**
  - **m1:** `docs/architecture.md`: `scripts/e2e-local.ts` darf `playwright.devices.ts` importieren.
  - **m2:** CLAUDE.md und `check-docs.ts` nennen für Stufe 0 auch Statuszeile und Ablageort. Für Agents gilt `.claude/agents/*.md`.
  - **m3:** CLAUDE.md, Schritt 7, nennt alle sechs Statuswerte und die Regel „live mit Restpunkten = in Umsetzung“.
  - **m5:** Die Statuszeilen von 0022–0024 bleiben in diesem Branch. Ohne sie wäre `check-docs` rot, weil „umgesetzt (Branch …)“ kein gültiger Status ist. Die Änderung betrifft nur Zeile 3; ein Konflikt mit `nachschliff-review-0022-0024` ist dort leicht aufzulösen. Beim späteren Archivieren kommen die Pfadverweise in 0025 (Zeilen 7, 8, 16) mit.
  - **m6:** `vitest related` steht in CLAUDE.md. `plan-reviewer` hat den Hinweis auf das Archiv.
  - **m7:** Ungültige Fristen fallen auf den Standard zurück (`graceMs`). Die Tests setzen `ZP_HEAVY_LOCK` leer; `afterEach` beendet auch die Gruppe aus `heavy.holder`.
  - **m8:** Neue Tests für „ersetzt“ außerhalb von `archiv/` und für eine Plandatei ohne Titel. Die Auswahl von Suite und Builds ist die reine Funktion `runPlan` mit Test; `--all` mit `PW_SUITE=smoke` baut beide.

### Nacharbeit zum Review des Wächters (`ef36c19`, Verdict OK)

- **m1:** Der Wächter hängt jetzt an einer Pipe zu seinem stdin (`stdio: ["pipe", "ignore", "ignore"]`) statt PIDs zu pollen. Schließt sich die Pipe, auch bei SIGKILL an `heavy.ts`, beendet er die Gruppe in Stufen und endet selbst. Damit entfallen Polling, die Wiederverwendung von PIDs und der Zombie-Fall.
- **m2:** Der Wächter startet mit `process.execPath`; scheitert der Start, kommt eine Warnung.
- **m3:** Das Fenster zwischen den beiden `spawn`-Aufrufen steht als bekannte Grenze im ADR und im Code.
- **m4:**
  - Der Wächter schreibt seine PID nach `heavy.watchdog.<pgid>` im Sperr-Ordner.
  - Neue Tests: Nach einem normalen Ende und nach dem Aufräumen nach SIGKILL endet der Wächter selbst und entfernt seine Datei.
  - `afterEach` beendet übrig gebliebene Wächter.
  - Der SIGKILL-Test hat ein Limit von 15 s.
- **m5:** CLAUDE.md nennt den Wächter am Ende des Punkts.
- **m6:** Der Test nutzt `alive` aus `process-group.ts`.
- **Abnahme erneut:** TaskStop mitten in `e2e:local e2e/layout.spec.ts`. Danach liefen kein Preview-Server, kein `e2e-local` und kein Wächter, und die Sperre war frei.

### CI: Browser-Installation mit Zeitlimit und Wiederholung (2026-10-08)

- **Befund:** Der Schritt „Playwright-Browser“ hing am 2026-10-08 zweimal 15 min beim WebKit-Download, bis zum Job-Timeout. Der Lauf wurde abgebrochen.
- **Lösung** in `ci.yml`, in allen E2E-Jobs und im Smoke-Job:
  - Jeder Versuch ist mit `timeout 180` begrenzt, es gibt bis zu drei.
  - Der ganze Schritt hat `timeout-minutes: 10`.
  - Ein gescheiterter Versuch erzeugt eine Warnung im Lauf.
  - Gemessen dauert die Installation sonst 22–37 s.
- **Verworfen:** ein Cache für `~/.cache/ms-playwright`. Er hilft nur bei einem Treffer, nach jedem Playwright-Update gar nicht. Außerdem müsste der Schritt in Cache, `install` und `install-deps` zerfallen.
- **Zurückgenommen (2026-10-08):** Auf `main` (`8a75abb`, Lauf 37780913534) wurde der Smoke-Job rot. `timeout` beendete nur `pnpm`, das als root laufende `apt-get` blieb übrig und hielt den dpkg-Lock, also scheiterten Versuch 2 und 3 sofort. Die Schritte stehen wieder wie vor `8a75abb`. Die Alternativen stehen in `docs/ideas.md`.

### `check:fast` wieder unter 7,5 s (2026-10-08)

- **Messung:** Laufzeit je Testdatei mit dem JSON-Reporter, Last 2,7.
  - `scripts/heavy.test.ts` brauchte **6,8 s** und bestimmte die Dauer der Vitest-Suite. Mit Abstand folgten `profile-csa.test.ts` (2,7 s), `change-class.test.ts` (1,4 s) und `run-steps.test.ts` (1,0 s).
  - `check:fast` lag dadurch bei 8,9–9,2 s.
- **Ursache:** reale Wartezeiten in `heavy.test.ts`:
  - zwei Halter mit `sleep 1`;
  - Fristen von 300 ms je Stufe (SIGINT, SIGTERM) in den Tests zum Beenden der Gruppe;
  - dazu Prozessstarts, etwa 0,15 s je Aufruf von `heavy.ts`.
- **Änderung:**
  - Die Halter schlafen 0,2 s statt 1 s.
  - `ZP_INT_GRACE_MS` und `ZP_TERM_GRACE_MS` sind in den Tests auf 100 ms gesetzt.
  - Die Aussagen bleiben gleich: Reihenfolge der Läufe, Selbstende des Wächters, Stufen bis SIGKILL.
- **Ergebnis:**
  - `heavy.test.ts` braucht 3,6 s, und fünf Läufe nacheinander waren grün.
  - `check:fast` braucht **6,8 / 7,1 / 7,0 s** bei Last 4,9.

### Etappe 7 (Branch `harness-0027-e7`, auf `ci-apt-lock` `c0b3217`)

- **`scripts/lib/ci-scope.ts`**, rein, mit Test 6 vorab (`scripts/lib/ci-scope.test.ts`, 48 Fälle):
  - `decideScope(event, io)` bekommt Git (`isAncestor`, `changedPaths`) und die API (`api(path)` liefert den Rumpf) als Eingaben und wirft nie. Jede Ausnahme ergibt `full=true` mit dem Grund.
  - `main`: höchstens zwei Abfragen, Deployments in `github-pages` und die Statuses des neuesten. Neuestes Deployment und letzter Status sind jeweils der Eintrag mit der höchsten `id`, unabhängig von der Sortierung der Antwort. Der SHA wird vor der zweiten Abfrage gegen `^[0-9a-f]{40}$` geprüft.
  - Branches: zuerst Git (Vorfahre, Diff nur Doku), erst dann eine Abfrage der Läufe von `ci.yml` mit `event=push`, `branch` und `head_sha`. Gezählt wird nur ein Lauf mit gleichem `head_sha`, gleichem `head_branch`, `event: push` und `conclusion: success`.
  - Abgedeckt sind alle Fälle aus Test 6, dazu: gleicher Stand wie live (leerer Diff → `false`), Status `inactive`, `in_progress` oder `failure` → `true`, Force-Push, Tag, ungültiger SHA des Laufs, Branchname mit Schrägstrich. Abdeckung 100 % der Zeilen, 96 % der Zweige.
- **`scripts/ci-scope.ts`** verdrahtet Git (`scripts/lib/ci-scope-git.ts`), `fetch` mit 10 s je Abfrage und `$GITHUB_OUTPUT`. Jede Ausnahme zur Laufzeit endet mit Exit 0. Den Grund schreibt es als `::notice` in den Lauf. `scripts/ci-scope.test.ts` startet es als Prozess: `pull_request`, eine Ausnahme (Repository und Token fehlen) und fehlendes `GITHUB_OUTPUT` enden mit Exit 0 und `full=true`.
- **`ci.yml`:**
  - Neuer Job `scope` mit `fetch-depth: 0`, Node ohne `pnpm install` und den Rechten `{ contents: read, actions: read, deployments: read }`.
  - `e2e` und `smoke` haben `needs: scope` und `if: needs.scope.outputs.full == 'true'`.
  - `gates` hat `needs: [scope, check, e2e, smoke]` und `if: ${{ !cancelled() }}`. Es verlangt `scope` und `check` mit `success`. Bei `full=false` verlangt es `e2e` und `smoke` als `skipped`, bei jedem anderen Wert (auch leer) als `success`.
  - `deploy` hat `needs: [gates, scope]` und läuft nur bei `full == 'true'`.
  - Die Schritte zur Browser-Installation sind unverändert.
- **Doku:** ADR 0021 ist ganz angenommen, Teil B nennt die zwei Abfragen und die Absicherung gegen Rot. ADR 0002 verweist auf ADR 0021, Teil B. CLAUDE.md, Schritt 6, beschreibt den Doku-Pfad statt „Sobald Etappe 7 …“.
- **Abweichungen vom Plan:**
  - Test 6 liegt neben dem reinen Modul in `scripts/lib/`, wie Test 2 (`stop-decision`). `scripts/ci-scope.test.ts` prüft nur das Skript als Prozess, also den Fall „Ausnahme im Skript → `true` und Exit 0“.
  - Auf `main` zählt nur das neueste Deployment. Ist sein letzter Status nicht `success`, gilt `full=true`, statt ältere Deployments abzufragen. So bleibt es bei zwei Abfragen (E13). Ein laufender oder gescheiterter Deploy führt also zu einem vollen Lauf; das prüft mehr, nie weniger.
  - `check` wartet nicht auf `scope` und startet sofort. Nur `e2e`, `smoke`, `gates` und `deploy` hängen an `scope`.
  - Kein Rot durch `scope`, doppelt abgesichert: `continue-on-error` am Schritt, und die Job-Ausgabe ist `steps.scope.outputs.full || 'true'`. Ein Absturz des Skripts ergibt also `full=true`.
  - `persist-credentials: false` am Checkout von `scope`, denn der Job schreibt nichts.
  - Die API ruft das Skript mit `fetch` auf statt mit `gh api` (E10): So ist das Zeitlimit von 10 s je Abfrage steuerbar, und der Job braucht `gh` nicht.
- **Nacharbeit zum Arch-Review** (Verdict: Nacharbeit nötig, kein Blocker):
  - **M1** (Kanarienvogel für das umgebaute `gates`): K9 hat die Fälle 6 bis 8, siehe unten.
  - **M2** (ohne `pnpm install`): neue Regel `ci-scope-builtins-only` in `.dependency-cruiser.cjs` und eine Zeile in `docs/architecture.md`. Das Skript und seine Module `lib/ci-scope`, `lib/ci-scope-git`, `lib/change-class` und `lib/git-env` dürfen nur Node-Builtins und einander importieren. Kanarienvogel: `import "zod"` und ein Import aus `src/domain/` in `change-class.ts` ergeben zwei Verstöße, danach zurückgenommen.
  - **m1:** ADR 0021 und der Kopf des Skripts sagen genau, was nie rot wird: eine Ausnahme im Skript. Scheitert der Job selbst, ist der Lauf rot, aber nie grün ohne volle Prüfung. Die git-Aufrufe haben ein Zeitlimit von 30 s.
  - **m2:** Skill `browser-review`, Ziel `live`: Liegen nach dem UI-Commit nur Doku-Commits, zeigt `meta.json` den letzten Commit mit Build-Eingaben.
  - **m3:** Der Test „Doku liest niemand“ prüft auch `site.config.ts` und `playwright.devices.ts`.
  - **m4:** Die Dauer von `scope` wird in K9 gemessen, siehe Fall 9.
  - **m5:** Der git-Teil liegt in `scripts/lib/ci-scope-git.ts` und ist gegen ein Temp-Repo getestet (`tempRepo()`). Geprüft werden alle Pfade, auch mit Leerzeichen und Umlaut, bei einer Umbenennung beide Pfade, Vorfahre ja und nein, und dass ein unbekanntes Objekt oder ein fehlendes Repo wirft.
  - **m6:** ADR 0021, Teil B: Ohne neuen Commit liefert nur `workflow_dispatch` neu aus. „Re-run all jobs“ auf dem Lauf des Live-Commits ergibt `full=false`.
  - **Hinweis zum Merge:** Gegenüber `origin/main` (`8a75abb`) nimmt dieser Branch die Wiederholung bei der Browser-Installation zurück, denn er baut auf `ci-apt-lock` (`c0b3217`) auf. Das ist gewollt, siehe „CI: Browser-Installation mit Zeitlimit und Wiederholung“.
- **Formen der API geprüft** (2026-10-08, je eine Abfrage mit `gh api`):
  - Deployments in `github-pages`: neuestes zuerst, `sha` voll, `ref: main`.
  - Statuses: neuestes zuerst (`success` vor `in_progress`, `queued`, `waiting`).
  - Läufe von `ci.yml` mit `event=push&branch=ci-apt-lock&head_sha=d07f229…`: ein Lauf mit `head_sha`, `head_branch`, `event: push` und `conclusion: success`.
- **Probe mit echtem Git**, ohne Token:
  - Code-Diff `d07f229..c0b3217` → `full=true`, „`.github/workflows/ci.yml` geändert“.
  - `before` kein Vorfahre → `full=true`.
  - unbekannter SHA → `full=true` über die Ausnahme.
  - Doku-Diff `4700445..8113cd3` erreicht die Abfrage der Läufe; die scheitert ohne Token → `full=true`.
- **K9: offen.** Er braucht Läufe auf einem Branch und auf `main`, und Subagents beobachten die CI nicht (E13). Der erste Lauf von `harness-0027-e7` ist ein neuer Branch und fährt deshalb voll; er belegt die neuen Jobs mit `full=true`. Ablauf für die Haupt-Session:
  1. Auf dem Branch nach dem grünen Lauf einen reinen Doku-Commit pushen → `e2e` und `smoke` übersprungen, `gates` grün, kein `deploy`.
  2. Einen Doku-Commit nach einem roten oder abgebrochenen Vorgänger pushen → volle Matrix.
  3. Doku plus eine Datei in `src/` → volle Matrix.
  4. **Wartender Lauf abgebrochen**, auf `main`: Ein Lauf X läuft, dann Code-Commit C0 pushen (wartet) und direkt danach Doku-Commit D1 (bricht den wartenden C0 ab). D1 fährt `full=true`, weil der Diff von live (X) nach D1 C0 enthält, und deployt; `meta.json` zeigt D1.
  5. Danach auf `main` ein reiner Doku-Commit → `full=false`, kein Deploy, `meta.json` bleibt.
  6. **Kanarienvogel `gates` bei voller Matrix** (Arch-Review M1), auf dem Branch: ein absichtlich roter E2E-Test, danach ein Doku-Commit → volle Matrix, `gates` rot mit „E2E ist failure“, kein `deploy`.
  7. **Kanarienvogel `gates` im Doku-Pfad**: nach grünem Lauf ein Doku-Commit mit totem Plan-Pfad (im Commit-Text beschrieben, wie K1) → `full=false`, `check` rot, `gates` rot.
  8. **Absturz von `scope`**: Das Skript endet absichtlich vor der Ausgabe mit `exit 1` → Schritt rot, Job grün (`continue-on-error`), `full=true`, volle Matrix.
  9. **Dauer von `scope`** in einem vollen Lauf messen. Verzögert der volle Klon E2E und Smoke spürbar, bekommt der Checkout `filter: blob:none`; `merge-base` und `diff --name-only` brauchen nur Commits und Trees.

## Entschieden (Nutzer, 2026-10-08)

Alle Empfehlungen sind angenommen.

1. **CI-Doku-Pfad: (b).** Ein Doku-Commit fährt nur den Job `check`, ohne E2E und ohne Deploy. ADR 0021, Teil B gilt, mit dem Fix aus Review B2: Auf `main` wird gegen den ausgelieferten Stand geprüft, auf Branches gegen einen grünen Push-Lauf derselben Ref.
2. **E2E lokal bei UI:** nur die genannten Specs auf `pixel-7`.
3. **Restpunkte** kommen vor dem Archivieren nach `docs/ideas.md`.

## Offene Punkte

Keine.

## Risiken

| Risiko | Abfangen |
|---|---|
| Eine Datei wird fälschlich als Doku eingestuft, und ein Fehler rutscht lokal durch | enge Positivliste, alles andere ist C; Test „Doku liest niemand“ (auch dynamische Pfade, Biome-Probe); die CI fährt auf jedem Branch alles, außer nach einem grünen Push-Lauf derselben Ref |
| Doku-Commit überdeckt einen nie ausgelieferten Code-Commit | auf `main` Diff gegen den vollen SHA des letzten erfolgreichen Pages-Deployments (Deployments-API); jeder Fehler → voll (E10, Test 6, K9) |
| Stempel aus einem anderen Worktree täuscht grün vor | Ein Stempel gilt nur für eine identische Tree-ID, also gleichen Inhalt einschließlich Lockfile, und nur, wenn der letzte Lauf der Stufe C keine 12 h zurückliegt (`cAt`). Gestempelt wird nur, wenn der Baum vor und nach dem Lauf gleich war. Der Stempel deckt **nur den Inhalt** ab: Bei einem Treffer läuft auch E6 nicht. Ein `node_modules`, das in diesem Worktree veraltet ist, fällt dann erst beim nächsten Lauf der Stufe C oder in der CI auf. Das ist hinnehmbar, weil der Inhalt schon anderswo grün war. |
| Kette reiner Doku-Turns hält einen alten Stempel frisch | Frische nach `cAt`, nicht nach `at`; Test 2, Doku-Kette (Review 2, M-B) |
| Zeitlimit lässt Kindprozesse weiterlaufen, und das Hook-Timeout greift doch | eigene Prozessgruppe je Schritt, `process.kill(-pid)`; `run()` mit `timeout` und `SIGKILL`; Test 2a (Review 2, M-A) |
| `SIGKILL` auf `heavy.ts` hält die Sperre bis zum Ende des Kommandos | bekannte Grenze (E7); die Begleitdatei nennt PID und Kommando |
| Frontmatter von Skills und Agents ändert Prozessregeln an der Doku-Stufe vorbei | nur durch Review gesichert, festgehalten in ADR 0021 (E11, Review 2, Minor 3) |
| Tree-Objekt des letzten grünen Stands entfernt (`git gc`) | `git cat-file -e`, sonst keine Basis → Stufe C (prüft mehr, nie weniger) |
| Stop-Gate läuft ins Hook-Timeout und lässt still durch | höchstens Stufe C (≈ 7 s), eigenes Zeitlimit 150 s mit roter Meldung |
| Die Sperre bleibt hängen oder Server bleiben übrig | `flock -o`: nur der `flock`-Prozess hält sie; eigene Prozessgruppe, die bei Ende und Signal ganz beendet wird; Test 4 mit Enkelprozess; K6 prüft auf übrige `vite preview` |
| Agent wartet länger als das Bash-Limit von 10 min auf die Sperre | Standard-Wartezeit 30 s mit Exit 75 und Hinweis; längeres Warten nur mit `ZP_LOCK_WAIT` und `run_in_background` |
| Der Wächter stört knip oder `--list` | Wächter in `globalSetup`, nicht beim Laden der Konfiguration (Review B1); K5 mit `pnpm knip` |
| UI-Fehler auf anderen Geräten fallen erst in der CI auf | gewollt (Nutzerentscheid 2); die CI braucht 9 min; ohne grünes `gates` kein Deploy |
| Zeitlimit von 30 s verdeckt eine Verlangsamung von `profile-csa` | Tempo war nie Aussage des Tests; Laufzeiten stehen im Vitest-Bericht der CI |
| Archivieren bricht Verweise | „Plan NNNN“ bleibt gültig; Pfadverweise prüft `check-docs` über getrackte Dateien (Regel 4) |
| Parallele Branches ändern einen Plan, der archiviert werden soll | solche Pläne erst nach dem Merge des Branches archivieren (Etappe 6) |
| Nummern kollidieren weiter zwischen Branches | Regel 3 macht die Kollision spätestens beim Rebase rot; die Vergabe selbst bleibt Absprache |

## Review (2026-10-08) – Verdict: Überarbeiten (gezielt) → eingearbeitet

| Befund | Umgang |
|---|---|
| **B1** knip lädt `playwright.config.ts` (knip 6.39.0, `plugins/playwright`); ein Wurf beim Laden macht `check:fast` rot | übernommen: Wächter in `e2e/global-setup.ts` (E4); K5 mit `pnpm knip` |
| **B2** `concurrency` bricht ältere wartende Läufe ab; ein Doku-Commit hätte einen nie ausgelieferten Code-Commit überdeckt | übernommen: `main` prüft gegen `meta.json.commit` von zwergenplan.app, Branches nur gegen einen grünen Push-Lauf derselben Ref (E10); Test 6 und K9 mit dem Fall „wartender Lauf abgebrochen“ |
| **M1** `flock` vererbt den Deskriptor an Kinder; das Bash-Limit liegt bei 10 min | übernommen: `flock -o`, eigene Prozessgruppe, ganze Gruppe beenden; Test 4 mit Enkelprozess; Wartezeit 30 s mit Exit 75, längeres Warten mit `run_in_background` (E7) |
| **M2** Regel 4 wäre sofort rot (Beispielpfad in K1, Fixtures) und durchsuchte `.claude/worktrees/`; es sind 11 Verweise, nicht 10 | übernommen: nur `git ls-files`, `tests/fixtures/docs/` ausgenommen, K1 ohne ausgeschriebenen Pfad. Nachgezählt: 11 Verweise auf Plan-Dateien in älteren Plänen und 19 auf ADR-Dateien, alle vorhanden; die Verweise der ersten Fassung von 0027 sind entfernt (Ausgangslage, E11, Etappe 6) |
| **M3** Hook-Timeout 180 s lässt still durch; `build:e2e` in V kollidiert mit `e2e:local` | übernommen: Stop-Gate höchstens Stufe C, eigenes Zeitlimit 150 s mit roter Meldung; V entfällt lokal (E5.4) |
| **M4** zu viele Klassen, Turn-Start überflüssig und unsicher | übernommen: nur 0 und C (E1, E2); Turn-Start samt Hook und Zustandsdatei gestrichen (E5.2); Etappen nach Gewinn je Risiko neu geordnet |
| **M5** Race beim Stempeln | übernommen: Tree-ID vor und nach dem Lauf, atomares Schreiben, Wegwerf-Index je Prozess (E5.1, E5.2) |
| Minor: 12-h-Grenze auch für die Basis | übernommen (E5.3) |
| Minor: Garantie zu stark formuliert | übernommen: „führt keinen neuen roten Befund ein“; `main` war am 2026-10-05 dreimal rot (E10) |
| Minor: Test „Doku liest niemand“ zu eng | übernommen: dynamische Pfade, `readdirSync` mit `.md`, `biome.json`, `vitest.config.ts`, Biome-Probe (Tests, Nr. 1) |
| Minor: zwei aufeinanderfolgende Ports; `browser-review` | übernommen: `scripts/lib/free-ports.ts` für beide, URL wird ausgegeben (E4, E12) |
| Minor: gemeinsame E2E-Helfer | übernommen: Nutzer genannt (Ausgangslage), Pflicht-Spec bei Änderung (E4) |
| Minor: Statusregel „erste nicht-leere Zeile“ | übernommen (E11) |
| Minor: ADR-Nummern eindeutig | übernommen: Regel 3 gilt auch für `docs/adr/` (E11) |
| Minor: Zeitpunkt des ADR-Status | übernommen: Teil A angenommen mit Etappe 5, Teil B mit Etappe 7 (E12, ADR 0021) |
| Minor: `gates` und `deploy` in Teil B | übernommen: `!cancelled()`, Ergebnis von `scope` prüfen, `deploy` mit `needs: [gates, scope]` und `full == 'true'` (E10) |

## Review Runde 2 (2026-10-08, auf `85cd480`) – Verdict: Freigabe mit Änderungen → eingearbeitet

Es gab keinen Blocker. Alle Befunde sind übernommen.

| Befund | Umgang |
|---|---|
| **M-A** Das Zeitlimit beendet keine Enkelprozesse. `check-fast.ts:24–36` startet ohne Prozessgruppe, und `run()` in `lib.ts:28–35` hat kein `timeout` | übernommen: Jeder Schritt läuft mit `detached: true`, bei Zeitablauf wird die ganze Gruppe mit `process.kill(-pid)` beendet. `run()` bekommt `timeout: 165_000` und `SIGKILL`; ein Signal oder `ETIMEDOUT` zählt als Rot mit „Zeitlimit“ (E5.4). Neuer Test 2a mit `sleep 999`. Pflicht vor dem Merge von Etappe 3 |
| **M-B** Reine Doku-Turns verlängern die 12-h-Frist | übernommen: Der Stempel trägt `cAt`, Stufe 0 erbt es, gemessen wird an `cAt` (E5.2). Test 2 enthält eine Doku-Kette über mehr als 12 h |
| Minor 1: `meta.json` hat nur einen Kurz-SHA oder `"unbekannt"` und liegt im CDN-Cache | übernommen: Der Live-Commit kommt aus der Deployments-API (`environment=github-pages`, neuestes mit Status `success`), mit vollem SHA. Am 2026-10-08 geprüft. Der Wert wird gegen `^[0-9a-f]{40}$` geprüft; Test 6 deckt die Fehlerfälle ab (E10) |
| Minor 2: Fehler in `ci-scope`; Rechte | übernommen: Jede Ausnahme ergibt `full=true` und Exit 0. Rechte `{ contents: read, actions: read, deployments: read }`; `deployments` ist wegen der API dazugekommen (E10, Etappe 7) |
| Minor 3: Frontmatter von Skills und Agents (`hooks:`, `permissionMode:`, `allowed-tools:`, `model:`) | einfachere Variante gewählt: ADR 0021 hält fest, dass Prozessregeln dort nur durch Review gesichert sind (E11, Risiken) |
| Minor 4: Test „Doku liest niemand“ zu eng | übernommen: auch `.github/workflows/`, `.claude/hooks/`, `.claude/settings.json`, `lefthook.yml`, die `scripts` aus `package.json` und `.dependency-cruiser.cjs` (Tests, Nr. 1) |
| Minor 5: `docs/**/*.md` trifft auch `docs/design/` | übernommen: `docs/design/**` ist ausgenommen; neuer Testfall `docs/design/x.md` → C (E1, Test 1) |
| Minor 6: keine eindeutige Schnittstelle für `verify` | übernommen: drei Modi, `--stop`, `--staged` und ohne Argument; `--base/--tree` entfällt. Stempel schreibt nur `verify.ts` (E5.2, E5.3) |
| Minor 7: „Stufe 0 auch ohne `node_modules`“ war falsch | korrigiert: `check-docs` braucht nur Builtins, die Hooks aber `node_modules` (E2, E6) |
| Minor 8: Risiko „Stempel aus anderem Worktree“ ungenau | umformuliert: Der Stempel deckt nur den Inhalt ab, E6 läuft bei einem Treffer nicht (E5.2, Risiken) |
| Minor 9: Regel 4 und Rohdaten | übernommen: `data/` und `tests/fixtures/` sind ausgenommen (E11) |
| Minor 10: `SIGKILL` auf `heavy.ts` | als bekannte Grenze notiert; die Begleitdatei nennt PID und Kommando. Einen Wächter auf den Elternprozess gibt es bewusst nicht (E7, Risiken) |
| Minor 11: Meldung bei Zeitlimit nach drei Blocks | übernommen: Die Freigabe nennt „Zeitlimit, nicht geprüft“ statt „ROT“ (E5.5, Etappe 3) |
