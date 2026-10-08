# ADR 0004 – Backpressure statt menschlichem Review

Status: angenommen (2026-10-04)

## Kontext
Agenten arbeiten autonom, und es gibt kein PR-Review. Qualität muss deshalb aus Prüfungen kommen, die schnell und ohne Ermessen rot werden.

## Entscheidung
Die Prüfungen sind in Schichten organisiert. Jede fängt eine Fehlerklasse so früh wie möglich ab:

| Schicht | Werkzeug | Wann |
|---|---|---|
| Format/Lint | Biome | PostToolUse-Hook je Datei |
| Typen | TS 7 strict (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` …) | PostToolBatch-Hook |
| Architektur | dependency-cruiser (swc) + Modulzahl-Wächter | `check:fast` |
| Daten | Zod + Invarianten + Plausibilität gegen Live | `check:fast`, Hook bei `data/*`, CI |
| Logik | Vitest, 90 % Coverage in `src/domain`, TZ=America/Los_Angeles | `check:fast`, CI |
| Tote Pfade | knip | `check:fast` (lokal und CI), geändert durch ADR 0021 |
| Schema-Drift | `schema/*.json` gegen `src/domain/schema.ts` | `check:fast` (lokal und CI), geändert durch ADR 0021 |
| Browser | Playwright: Funktion, Mobile-UX-Gates, Web-Vitals, Konsolenfehler | CI (vor Deploy) |
| Bundle | size-limit | CI |
| Architektur-Urteil | `/arch-review` (adversarialer Subagent) | vor „fertig“ bei großen Änderungen |
| Sichtprüfung | `/browser-review` | vor „fertig“ bei UI-Änderungen, nach Deploy |

- `check:fast` läuft im Stop-Hook, im pre-commit-Hook (lefthook) und in CI. Gemessen am 2026-10-08 (Plan 0027, Ergebnis): lokal etwa 6 s auf 16 Kernen, in CI 9 s. **Geändert durch ADR 0021:** Seit Plan 0027, Etappe 1, gehören knip und die Schema-Drift dazu. Ab Etappe 2 prüft der pre-commit-Hook nach Stufe, ein reiner Doku-Commit fährt dann nur `check-docs`.
- Das Stop-Gate blockiert höchstens 3× pro Arbeitsstand und lässt einen unveränderten grünen Stand sofort durch. Das begrenzt Kosten und Schleifen. **Geändert durch ADR 0021:** „Unverändert“ heißt seit Plan 0027, Etappe 3, gleicher Inhalt (Tree-ID), auch nach einem Commit und in einem anderen Worktree. Der grüne Stempel gilt 12 h ab dem letzten Lauf von `check:fast`. Ein Zeitlimit zählt als Rot.
- Für jedes Gate gilt der **Kanarienvogel**: Beim Aufsetzen wird ein absichtlicher Verstoß eingebaut und muss rot werden. Beim Aufsetzen gefunden: Ein `exclude` auf `node_modules` hatte alle npm-Regeln still deaktiviert.

- **Mehrere Checkouts/Worktrees**: Git-Hooks liegen im gemeinsamen `.git/hooks`. Das lefthook-Skript verweist dort auf das Binary des Checkouts, der es installiert hat. Installiert wird es deshalb über `prepare` beim `pnpm install` im **Haupt-Checkout**, nicht aus einem Worktree. Die Claude-Hooks prüfen zuerst, ob `node_modules` vorhanden ist. Fehlt es, geben sie nur einen Hinweis und blockieren nicht, damit parallele Sessions in noch nicht installierten Checkouts weiterarbeiten können. Maßgeblich bleibt das CI-Gate.

## Konsequenzen
- Mit Absicht zurückgestellt: visuelle Regression (bis das Design steht), Lighthouse CI (veraltetes Paket), Architektur-Review in CI (API-Kosten). Siehe `docs/ideas.md`.

## Nachtrag (2026-10-08): Verifikation nach Risiko, ADR 0021

ADR 0021, Teil A, ergänzt diese Entscheidung (Plan 0027, Etappen 1 bis 5). Kein Gate wird schwächer, und vor jedem Deploy fährt die CI weiter alles.

- **Hooks nach Stufe:**
  - pre-commit (`verify --staged`) und Stop-Gate (`verify --stop`) prüfen nach der Stufe des Diffs. Bei reiner Doku (Stufe 0) läuft `check-docs`, sonst `check:fast` (Stufe C).
  - Das Stop-Gate prüft einen Inhalt (Tree-ID) nur einmal je 12 h. Ein Zeitlimit oder ein Fehler im Gate zählt als Rot.
- **`check:fast`** enthält knip, Schema-Drift und `check-docs` und erkennt ein veraltetes `node_modules`.
- **E2E lokal** läuft nur gezielt (`pnpm e2e:local`), unter einer maschinenweiten Sperre (`scripts/heavy.ts`). Die volle Suite fährt die CI auf jedem Branch.
- **Mehrere Checkouts:** Tests nutzen git schreibend nur in isolierten Temp-Repos (`scripts/lib/temp-repo.ts`). `vitest.setup.ts` löscht alle GIT_*-Variablen. Anlass war ein Test im pre-commit-Hook, der am 2026-10-08 das gemeinsame `.git/config` umgeschrieben hat.
