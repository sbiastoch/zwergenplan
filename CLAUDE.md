# Zwergenplan

Private, mobile-first PWA, die Angebote für Kinder unter 3 Jahren in Nürnberg findet. Gedacht für Freunde und Familie (`noindex`, kein Impressum). Statisch auf GitHub Pages. Daten kommen aus einer Agenten-Recherche (`.claude/skills/babyevents-nuernberg`) nach `data/`.

UI-Texte und Doku sind auf Deutsch, Code-Identifier auf Englisch. Die Kommandos stehen in `package.json`.

## Arbeitsweise (Pflicht)

1. **Plan**: Für jede nicht-triviale Änderung zuerst `docs/plans/NNNN-<thema>.md` schreiben. Fertig ist der Plan, wenn ein Fremder ihn ohne den Chat umsetzen könnte.
2. **`/plan-review`**: Fertig, wenn der Plan einen Review-Abschnitt hat und kein Blocker mehr offen ist.
3. **Umsetzen, test-first** für Domänenlogik. Fertig, wenn `pnpm check:fast` **grün** ist und jede neue Logik bzw. Ansicht einen Test hat.
4. **`/arch-review`** bei größeren Änderungen: neues Modul, neue Abhängigkeit, Schemaänderung oder mehr als 200 Zeilen. Fertig, wenn kein Blocker mehr offen ist.
5. **`/browser-review`** bei jeder UI-Änderung, nach dem Deploy auf der Live-URL. Fertig, wenn jede Zeile der Checkliste beantwortet ist.
6. **Commit und Push.**
   - Wer allein im Haupt-Checkout arbeitet, committet direkt auf `main`.
   - Wer in einem Worktree oder parallel zu einer anderen Session arbeitet, nutzt einen eigenen Branch. Der wird gepusht (CI läuft auf jedem Branch, ohne Deploy) und dann per Fast-Forward nach `main` gebracht.
   - CI ist das einzige Gate vor dem Deploy. Fertig erst, wenn der CI-Lauf auf `main` **grün** ist (`gh run watch`) und die Live-Seite den neuen Stand zeigt.

Die Hooks erzwingen einen Teil davon. Bei Rot meldet das Stop-Gate kein „fertig“. Die Gates sind die **Backpressure** des Projekts: Wird eins rot, reparierst du die Ursache. Eine Schwelle zu senken, eine Regel abzuschalten oder `skip`/`biome-ignore`/`as`-Casts zu setzen braucht eine schriftliche Begründung im Code und im Commit, bei Architekturregeln ein ADR.

## Wo was steht

- `docs/architecture.md`: Schichten, Abhängigkeitsregeln, Invarianten, Mobile-UX-Gates. **Lesen, bevor du ein Modul anlegst oder Daten anfasst.**
- `docs/adr/`: begründete Entscheidungen. **Lesen, bevor du eine Entscheidung infrage stellst.** Eine Abweichung wird ein neues ADR.
- `docs/ideas.md`: bewusst außerhalb des Scopes. Neue Ideen landen dort, nicht im Code.
- `src/domain/schema.ts`: der Datenvertrag, also die **einzige** Quelle. `schema/*.json` ist ein Export davon und wird nie von Hand geändert.

## Stolperfallen

- TypeScript 7 (nativer Compiler): dependency-cruiser parst deshalb mit **swc**. `pnpm arch` meldet es, wenn der Parser stumm wird (zu wenige Module).
- Zeiten haben immer einen Offset (`2026-10-25T10:00:00+01:00`). Kalenderlogik läuft in Europe/Berlin über `src/domain/time.ts`. Die Unit-Tests laufen absichtlich in `America/Los_Angeles`.
- E2E nutzt Fixture-Daten (`tests/fixtures/`, fiktiv) mit eingefrorener Uhr (`e2e/fixtures.ts`). Der Deploy-Build (`dist/`) enthält nie Fixtures, der E2E-Build liegt in `dist-e2e/`.
- **Daten**: `data/providers.yaml` (Katalog) und `data/offers.json` entstehen über den Skill `babyevents-nuernberg` und `pnpm pipeline` (ADR 0006). `data/offers.json` wird nie von Hand bearbeitet, Korrekturen laufen über die Rohdaten eines Laufs und `pipeline build`. Der Fahrplanauszug `data/oepnv/fahrplan.json` (ADR 0011) entsteht nur über `pnpm pipeline oepnv`, nie von Hand; Biome nimmt ihn aus, `pnpm data:validate` prüft ihn per Zod.
- Hooks brauchen `node_modules`. In einem frischen Checkout zuerst `pnpm install` ausführen, das installiert auch den lefthook-pre-commit. Ohne `node_modules` melden sich die Claude-Hooks nur mit einem Hinweis und blockieren nichts.
- **E2E lokal nur gezielt** (Plan 0027): Lokal laufen nur die Specs, die die Änderung betreffen, auf `pixel-7`: `pnpm e2e:local e2e/detail.spec.ts` (immer mit `run_in_background`; anderes Gerät mit `-- --project=iphone-15`). Das Skript nimmt eine maschinenweite Sperre (`scripts/heavy.ts`, `flock`), wählt freie Ports und baut `dist-e2e/`. Ist die Sperre belegt, endet es nach 30 s mit Exit 75 und nennt den Halter; länger warten mit `ZP_LOCK_WAIT=1800`. Direkt `pnpm exec playwright test` bricht lokal ab (Wächter in `e2e/global-setup.ts`), `--list` geht immer. Die volle Suite mit allen Geräten fährt kein Agent lokal. Das übernimmt die CI auf jedem Branch, parallel: Ein Lauf auf `main` dauert vom Push bis zum Deploy 9–10,6 min (gemessen 2026-10-08, Plan 0027), der längste E2E-Job 8,8 min. Ist ein Test lokal nur unter Last rot, jagt man ihn nicht mit `--last-failed`; ein Befund ist er erst, wenn er auch in der CI rot oder „flaky“ ist.
- Das Stop-Gate ruft `node scripts/verify.ts --stop` auf (Plan 0027, E5). Ein Inhalt (Tree-ID), der in den letzten 12 h grün geprüft wurde, wird nicht erneut geprüft, auch nicht nach einem Commit oder in einem anderen Worktree. Die Stempel liegen in `~/.cache/zwergenplan/green/`. Ein Zeitlimit zählt als Rot.
- **git in Tests und Skripten:** In Hooks setzt git `GIT_DIR` und `GIT_INDEX_FILE`. Ein Kindprozess erbt sie und arbeitet dann auf dem echten Repo, auch mit fremdem `cwd`. Deshalb laufen Tests, die git schreibend nutzen, nur in `tempRepo()` aus `scripts/lib/temp-repo.ts`: Temp-Ordner, explizites `GIT_DIR`, Identität per `-c`, nie `git config`. Jeder andere git-Aufruf mit eigenem `cwd` nutzt `withoutGitEnv()` aus `scripts/lib/git-env.ts`. Am 2026-10-08 hat ein Test im pre-commit-Hook das gemeinsame `.git/config` auf `core.bare = true` gesetzt. Der Kanarienvogel dagegen ist `scripts/lib/git-isolation.test.ts`.
- Der pre-commit-Hook ruft `node scripts/verify.ts --staged` auf (Plan 0027). Ändert ein Commit nur Doku (`docs/**/*.md` außer `docs/design/`, `*.md` im Wurzelverzeichnis, `.claude/skills|agents/**/*.md`), läuft nur `check-docs`: eindeutige Plan- und ADR-Nummern, keine toten Pfadverweise. Alles andere fährt `check:fast`. `pnpm verify` macht von Hand dasselbe für den Diff zu `origin/main`.
- `check:fast` prüft zuerst, ob `node_modules` zum Lockfile passt. Meldet es „node_modules passt nicht zu pnpm-lock.yaml“ oder „node_modules fehlt“, hilft `pnpm install --frozen-lockfile`. Seit Plan 0027 enthält `check:fast` auch knip und die Schema-Drift.
- Ein CPU-gebundener Unit-Test über 1 s bekommt ein eigenes Zeitlimit mit Begründung im Code, etwa `{ timeout: 30_000 }` wie in `scripts/transit/profile-csa.test.ts`. Unter der Last paralleler Sessions reißt er sonst die Standardgrenze von 5 s. Die globale Grenze bleibt.
- CI teilt E2E über `PW_SUITE` (`chromium`, `webkit`, `smoke`) in parallele Jobs und Shards (Plan 0013). Lokal ohne `PW_SUITE` läuft alles. Einen CI-Job stellt man unter der Sperre so nach: `node scripts/heavy.ts sh -c "pnpm build:e2e && PW_PORT=4373 PW_SUITE=webkit pnpm exec playwright test --shard=1/2"` (Smoke: `pnpm build`, dann `PW_SUITE=smoke`). Einen eigenen `PW_PORT` braucht nur dieser Weg; `e2e:local` wählt die Ports selbst. Ein Gerät mit neuer Engine oder mit `dependencies` lässt die Konfiguration beim Laden werfen.
- WebKit lokal braucht die Systembibliothek `libavif16`. Fehlt sie, bleibt es bei `pixel-7` (Standard von `pnpm e2e:local`). CI testet WebKit immer.
