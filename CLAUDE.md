# Zwergenplan

Private, mobile-first PWA, die Angebote für Kinder unter 3 Jahren in Nürnberg findet. Gedacht für Freunde und Familie (`noindex`, kein Impressum). Statisch auf GitHub Pages. Daten kommen aus einer Agenten-Recherche (`.claude/skills/babyevents-nuernberg`) nach `data/`.

UI-Texte und Doku sind auf Deutsch, Code-Identifier auf Englisch. Die Kommandos stehen in `package.json`.

## Arbeitsweise (Pflicht)

1. **Plan**: Für jede nicht-triviale Änderung zuerst `docs/plans/NNNN-<thema>.md` schreiben. Fertig ist der Plan, wenn ein Fremder ihn ohne den Chat umsetzen könnte.
   - **Mockup**: Ist ein Mockup verlangt, wird es dem Nutzer gezeigt. Umgesetzt wird erst nach seinem Feedback, auch bei einem freigegebenen Plan.
2. **`/plan-review`**: Fertig, wenn der Plan einen Review-Abschnitt hat und kein Blocker mehr offen ist.
3. **Umsetzen, test-first** für Domänenlogik. Fertig, wenn `pnpm verify` **grün** ist, die E2E-Pflicht aus „Lokal prüfen“ erfüllt ist und jede neue Logik bzw. Ansicht einen Test hat.
4. **`/arch-review`** bei größeren Änderungen: neues Modul, neue Abhängigkeit, Schemaänderung oder mehr als 200 Zeilen. Fertig, wenn kein Blocker mehr offen ist.
5. **`/browser-review`** bei jeder UI-Änderung, nach dem Deploy auf der Live-URL. Fertig, wenn jede Zeile der Checkliste beantwortet ist.
6. **Commit und Push.**
   - Wer allein im Haupt-Checkout arbeitet, committet direkt auf `main`.
   - Wer in einem Worktree oder parallel zu einer anderen Session arbeitet, nutzt einen eigenen Branch. Der wird gepusht (CI läuft auf jedem Branch, ohne Deploy) und dann per Fast-Forward nach `main` gebracht.
   - CI ist das einzige Gate vor dem Deploy. Fertig erst, wenn der CI-Lauf auf `main` **grün** ist und die Live-Seite den neuen Stand zeigt: `commit` in https://zwergenplan.app/data/meta.json ist `git rev-parse --short HEAD`. Ausnahme Doku-Pfad (ADR 0021, Teil B): Kam seit dem live ausgelieferten Commit nur Doku dazu (Positivliste wie Stufe 0), fährt die CI nur `check`, ohne E2E und ohne Deploy. Fertig ist ein solcher Commit mit grünem Lauf; `meta.json` zeigt weiter den letzten ausgelieferten Commit. Ob ein Lauf diesen Pfad nahm, zeigt der Hinweis des Jobs „Umfang (Doku-Pfad)“ (`full=false`).
   - **Die CI beobachtet nur die Haupt-Session**, mit `gh run watch <id> -i 120 --exit-status` oder einzelnen `gh run view` im Abstand von mindestens 2 Minuten. Ein Subagent pusht und meldet Branch und SHA. Grund: Parallele Watches mit dem Standardintervall von 3 s haben das API-Limit von 5 000 Anfragen pro Stunde gerissen (Plan 0027, E13).

7. **Archivieren**: Ist ein Plan vollständig umgesetzt und live (CI grün, wo nötig `/browser-review live`), kommen seine Restpunkte nach `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“. Die Statuszeile wird `Status: abgeschlossen, live seit <sha> (<JJJJ-MM-TT>)`, der Plan wandert per `git mv` nach `docs/plans/archiv/`, und Pfadverweise werden umgeschrieben. Fertig, wenn `check-docs` grün ist; es prüft Statuszeile, Ablageort und Pfadverweise.
   - Die Statuszeile ist die erste nicht-leere Zeile nach dem Titel und beginnt mit einem von sechs Werten.
     - Aktiv in `docs/plans/`: `Entwurf`, `Review eingearbeitet`, `freigegeben`, `in Umsetzung`.
     - Im Archiv: `abgeschlossen, live seit <sha> (<JJJJ-MM-TT>)` oder `ersetzt durch Plan NNNN`.
   - Ein Plan, der live ist, aber noch Restpunkte hat, bleibt `in Umsetzung`, bis die Restpunkte in `docs/ideas.md` stehen.

Die Hooks erzwingen einen Teil davon. Bei Rot meldet das Stop-Gate kein „fertig“. Die Gates sind die **Backpressure** des Projekts: Wird eins rot, reparierst du die Ursache. Eine Schwelle zu senken, eine Regel abzuschalten oder `skip`/`biome-ignore`/`as`-Casts zu setzen braucht eine schriftliche Begründung im Code und im Commit, bei Architekturregeln ein ADR.

## Lokal prüfen (Plan 0027, ADR 0021)

Der Diff bestimmt die Stufe. `pnpm verify`, der pre-commit-Hook und das Stop-Gate wählen sie selbst:

- **Stufe 0**: Jeder geänderte Pfad ist Doku (`docs/**/*.md` außer `docs/design/`, `*.md` im Wurzelverzeichnis, `.claude/skills/**/*.md`, `.claude/agents/*.md`). Es läuft nur `check-docs`: eindeutige Plan- und ADR-Nummern, keine toten Pfadverweise, gültige Statuszeile und richtiger Ablageort der Pläne.
- **Stufe C**: alles andere, auch Unbekanntes. Es läuft `check:fast` (Typen, Biome, Architektur, Daten, Vitest, knip, Schema-Drift, Doku), etwa 7 s.
- Das Stop-Gate prüft einen Inhalt (Tree-ID) nur einmal: Ist er in den letzten 12 h grün geprüft, auch in einem anderen Worktree oder vor einem Commit, läuft nichts. Ein Zeitlimit zählt als Rot.

E2E läuft lokal **gezielt**, die volle Suite fährt die CI auf jedem Branch (etwa 9 Minuten):

| Änderung | E2E lokal |
|---|---|
| nur Doku; Domänenlogik ohne sichtbare Folge; Daten, Pipeline | keine |
| sichtbares Verhalten, UI, geänderte Specs | die betroffenen Specs: `pnpm e2e:local e2e/detail.spec.ts`, danach bei UI `/browser-review` |
| `e2e/fixtures.ts`, `e2e/mobile-ux.ts` | zusätzlich `e2e/theme.spec.ts` |
| Service Worker, Vite-, Playwright-Konfiguration | die im Plan genannten Specs, z. B. `e2e/pwa.spec.ts`; bei der Playwright-Konfiguration die `--list`-Summen aus Plan 0013, Test 1 |

- `pnpm e2e:local <spec …>` und `pnpm e2e` laufen immer mit `run_in_background`. `e2e:local` testet auf `pixel-7`, ein anderes Gerät wählt `-- --project=iphone-15`. Es nimmt eine maschinenweite Sperre (`scripts/heavy.ts`), wählt freie Ports und baut `dist-e2e/`. Bricht das Tool den Lauf ab, beendet der Wächter `scripts/heavy-watchdog.ts` die Gruppe des Laufs (Playwright räumt Browser und Server ab), und die Sperre wird frei.
- Ist die Sperre belegt, endet es nach 30 s mit Exit 75 und nennt den Halter. Länger warten geht mit `ZP_LOCK_WAIT=1800`.
- `pnpm exec playwright test` bricht lokal ohne Sperre ab (`e2e/global-setup.ts`). `--list` geht immer. Meldet Playwright „… is already used … set reuseExistingServer:true“, ist ein Port belegt. Dann den Lauf neu starten (er wählt neue Ports) und `reuseExistingServer` nicht ändern, sonst testet der Lauf den Build eines anderen Worktrees.
- In der inneren Schleife darf `pnpm exec vitest related <datei>` nur die betroffenen Unit-Tests laufen lassen. Für „fertig“ zählt `pnpm verify` mit der ganzen Suite, denn `related` übersieht Tests, die Fixture-Dateien lesen.
- Ist ein Test lokal nur unter Last rot, wird er erst zum Befund, wenn er auch in der CI rot oder „flaky“ ist.

## Wo was steht

- `docs/architecture.md`: Schichten, Abhängigkeitsregeln, Invarianten, Mobile-UX-Gates. **Lesen, bevor du ein Modul anlegst oder Daten anfasst.**
- `docs/adr/`: begründete Entscheidungen. **Lesen, bevor du eine Entscheidung infrage stellst.** Eine Abweichung wird ein neues ADR.
- `docs/plans/`: aktive Pläne. Abgeschlossene liegen in `docs/plans/archiv/`. „Plan NNNN“ findet sich in einem der beiden Ordner, die Nummern sind über beide eindeutig. Eine neue Nummer ist die höchste aus beiden plus eins.
- `docs/ideas.md`: bewusst außerhalb des Scopes. Neue Ideen landen dort, nicht im Code.
- `src/domain/schema.ts`: der Datenvertrag, also die **einzige** Quelle. `schema/*.json` ist ein Export davon und wird nie von Hand geändert.

## Stolperfallen

- TypeScript 7 (nativer Compiler): dependency-cruiser parst deshalb mit **swc**. `pnpm arch` meldet es, wenn der Parser stumm wird (zu wenige Module).
- Zeiten haben immer einen Offset (`2026-10-25T10:00:00+01:00`). Kalenderlogik läuft in Europe/Berlin über `src/domain/time.ts`. Die Unit-Tests laufen absichtlich in `America/Los_Angeles`.
- E2E nutzt Fixture-Daten (`tests/fixtures/`, fiktiv) mit eingefrorener Uhr (`e2e/fixtures.ts`). Der Deploy-Build (`dist/`) enthält nie Fixtures, der E2E-Build liegt in `dist-e2e/`.
- **Daten**: `data/providers.yaml` (Katalog) und `data/offers.json` entstehen über den Skill `babyevents-nuernberg` und `pnpm pipeline` (ADR 0006). `data/offers.json` wird nie von Hand bearbeitet, Korrekturen laufen über die Rohdaten eines Laufs und `pipeline build`. Der Fahrplanauszug `data/oepnv/fahrplan.json` (ADR 0011) entsteht nur über `pnpm pipeline oepnv`, nie von Hand; Biome nimmt ihn aus, `pnpm data:validate` prüft ihn per Zod.
- Hooks brauchen `node_modules`. In einem frischen Checkout zuerst `pnpm install` ausführen, das installiert auch den lefthook-pre-commit. Ohne `node_modules` melden sich die Claude-Hooks nur mit einem Hinweis und blockieren nichts. Meldet `check:fast` „node_modules passt nicht zu pnpm-lock.yaml“ oder „node_modules fehlt“, hilft `pnpm install --frozen-lockfile`.
- **git in Tests**: In Hooks setzt git `GIT_DIR` und `GIT_INDEX_FILE`, und ein Kindprozess mit fremdem `cwd` arbeitet dann auf dem echten Repo. Am 2026-10-08 hat so ein Test `core.bare = true` gesetzt. Tests nutzen git schreibend nur über `tempRepo()` (`scripts/lib/temp-repo.ts`), mit Identität per `-c`. Andere git-Aufrufe mit eigenem `cwd` nutzen `withoutGitEnv()` (`scripts/lib/git-env.ts`). Den Kanarienvogel dafür hält `scripts/lib/git-isolation.test.ts`.
- Ein CPU-gebundener Unit-Test über 1 s bekommt ein eigenes Zeitlimit mit Begründung im Code, wie `REFERENCE_TIMEOUT_MS` in `scripts/transit/profile-csa.test.ts`. Unter der Last paralleler Sessions reißt er sonst die Standardgrenze von 5 s.
- CI teilt E2E über `PW_SUITE` (`chromium`, `webkit`, `smoke`) in parallele Jobs und Shards (Plan 0013).
  - Nur um einen roten CI-Job nachzustellen, läuft `pnpm e2e` mit `PW_SUITE` und Shard (unter der Sperre, freie Ports, `run_in_background`): `PW_SUITE=webkit pnpm e2e -- --shard=1/2`, für Smoke `PW_SUITE=smoke pnpm e2e`.
  - Ein Gerät mit neuer Engine oder mit `dependencies` lässt die Konfiguration beim Laden werfen.
- WebKit lokal braucht die Systembibliothek `libavif16`. Fehlt sie, bleibt es bei `pixel-7`. CI testet WebKit immer.
