# ADR 0021 – Verifikation nach Risiko

Status: Entwurf (2026-10-08), wartet auf das Plan-Review von Plan 0027. Teil B braucht zusätzlich eine Nutzerentscheidung. Ergänzt ADR 0004 (Backpressure). Teil B ändert ADR 0002 („check → E2E → Deploy“ für jeden Stand).

## Kontext

ADR 0004 sagt: `check:fast` läuft im Stop-Hook, im pre-commit-Hook und in CI. Die volle E2E-Suite läuft in CI vor dem Deploy. Wann lokal wie viel geprüft wird, regelt ADR 0004 nicht. Messwerte und Belege stehen in Plan 0027, Ausgangslage.

- Agents fuhren lokal die volle E2E-Suite: 2 422 Tests, 5 Geräte, ohne Last etwa 19 min. Mehrere Worktrees taten das parallel. Die Last stieg auf 46–116 bei 16 Kernen, Läufe dauerten über 40 min, und Tests flackerten. Die CI fährt dieselbe Suite auf jedem Branch in etwa 9 min.
- Der pre-commit-Hook und das Stop-Gate fuhren `check:fast` auch bei reinen Doku-Änderungen. Das Stop-Gate prüfte auch dann, wenn sich nur der Commit, nicht aber der Inhalt geändert hatte. Unter Last wurden diese Läufe rot: `profile-csa.test.ts` riss das Zeitlimit von 5 s.
- 8 von 11 nicht absichtlich roten CI-Läufen scheiterten an knip, und knip lief lokal nicht.
- 17 von 40 Commits auf `main` ändern nur Markdown. Jeder davon fährt 9 Jobs und deployt.

## Entscheidung

### Teil A – lokal (mit Plan 0027 angenommen, sobald das Plan-Review freigibt)

1. **Stufe aus dem Diff.**
   - `scripts/lib/change-class.ts` ordnet jedem geänderten Pfad eine Stufe zu: 0 (Doku), C (Code), D (Daten) oder V (voll). Es gilt das Maximum über alle Pfade.
   - Die Doku-Klasse ist eine enge Positivliste. Jeder unbekannte Pfad bekommt V.
   - Ein Test hält fest, dass kein Build, Test oder Skript Markdown liest.
2. **Hooks nach Stufe.** pre-commit (`verify --staged`) und Stop-Gate (`verify --base … --tree …`) prüfen die Stufe des Diffs.
   - Das Stop-Gate prüft nur, wenn sich der **Inhalt** im Turn geändert hat und dieser Inhalt noch keinen grünen Stempel hat.
   - Die Stempel liegen maschinenweit unter `~/.cache/zwergenplan/green/<tree-id>` und gelten 12 h.
   - Rot blockiert weiterhin höchstens 3× je Arbeitsstand.
3. **knip gehört zu `check:fast`.** Die Tabelle in ADR 0004 lautet für „Tote Pfade“ damit `check:fast`, CI.
4. **Veraltetes `node_modules`** wird vor allen Schritten erkannt: `pnpm-lock.yaml` ≠ `node_modules/.pnpm/lock.yaml`. Es erscheint als eine Meldung mit Abhilfe, nicht als Typfehler.
5. **E2E lokal nur gezielt.**
   - `pnpm e2e:local <spec …>` lässt nur genannte Specs laufen, standardmäßig auf `pixel-7`.
   - Jeder lokale E2E-Lauf nimmt eine maschinenweite Sperre (`flock`, ein Platz) und läuft mit 25 % der Kerne als Worker.
   - `playwright.config.ts` wirft lokal ohne Sperre.
   - Die volle Suite fährt die CI auf jedem Branch. Lokal fährt sie kein Agent.
6. **CPU-gebundene Unit-Tests über 1 s** bekommen ein eigenes, begründetes Zeitlimit. Die globale Grenze bleibt.

### Teil B – CI-Doku-Pfad (nur auf Nutzerentscheid, Plan 0027, E10)

7. Ein Push, dessen Diff zum Vorgänger nur Stufe 0 ist, fährt nur den Job `check` und keinen Deploy. Voraussetzung ist, dass der Vorgänger sein Vorfahre ist und einen voll grünen CI-Lauf hat. In jedem anderen Fall, auch bei neuen Branches und Pull Requests, fährt die volle Matrix.
8. Die Garantie für `main` lautet dann: Jeder Stand ist voll grün geprüft, **oder** er unterscheidet sich von einem voll grün geprüften Vorgänger nur in Dateien, die kein Build, Test oder Skript liest.

## Konsequenzen

- **ADR 0004 bleibt in Kraft.** Kein Gate wird abgeschwächt, keine Schwelle sinkt, und die CI fährt vor jedem Deploy einer Build-Eingabe alles. ADR 0004 bekommt einen Nachtrag mit Verweis hierher. Der Satz „`check:fast` läuft im Stop-Hook und im pre-commit-Hook“ gilt nur noch für Diffs ab Stufe C.
- **Mehr rote Branch-Läufe in E2E sind beabsichtigt.** Gemessen wird der Erfolg an roten `gates` auf `main` und an Hotfixes, nicht an roten Branches (Plan 0027, Erfolgskriterien).
- **Mit Teil B** zeigt `meta.json` live für Doku-Commits nicht deren SHA. „Live zeigt den neuen Stand“ (CLAUDE.md) gilt dann nur für Commits mit Build-Eingaben.
- **Verworfen:**
  - automatische Auswahl von E2E-Specs: E2E ist Black-Box, es gibt keinen Import-Graphen, und eine Zuordnung veraltet;
  - `vitest related` als Gate: es übersieht Fixture-Dateien und spart höchstens 3 s;
  - Worker nach Last;
  - Wiederverwendung des CI-Ergebnisses über die SHA nach einem Fast-Forward: Das Artefakt käme aus einem fremden Lauf, und ein Fehler deployte ungeprüft.
