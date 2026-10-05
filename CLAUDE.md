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
- Parallele Worktrees oder Sessions: Playwright immer mit eigenem `PW_PORT` starten (z. B. `PW_PORT=4273 pnpm check`, belegt 4273 und 4274). Sonst übernimmt `reuseExistingServer` still den Preview-Server eines anderen Checkouts und testet dessen Build.
- CI teilt E2E über `PW_SUITE` (`chromium`, `webkit`, `smoke`) in parallele Jobs und Shards (Plan 0013). Lokal ohne `PW_SUITE` läuft alles. Einen CI-Job stellt man so nach: `pnpm build:e2e && PW_PORT=4373 PW_SUITE=webkit pnpm exec playwright test --shard=1/2` (Smoke: `pnpm build`, dann `PW_SUITE=smoke`). Ein Gerät mit neuer Engine oder mit `dependencies` lässt die Konfiguration beim Laden werfen.
- WebKit lokal braucht die Systembibliothek `libavif16`. Fehlt sie, `pnpm exec playwright test --project=pixel-7 …` ohne `iphone-15` ausführen. CI testet WebKit immer.
