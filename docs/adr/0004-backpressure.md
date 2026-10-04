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
| Tote Pfade | knip | CI |
| Browser | Playwright: Funktion, Mobile-UX-Gates, Web-Vitals, Konsolenfehler | CI (vor Deploy) |
| Bundle | size-limit | CI |
| Architektur-Urteil | `/arch-review` (adversarialer Subagent) | vor „fertig“ bei großen Änderungen |
| Sichtprüfung | `/browser-review` | vor „fertig“ bei UI-Änderungen, nach Deploy |

- `check:fast` (< 5 s) läuft im Stop-Hook, im pre-commit-Hook (lefthook) und in CI.
- Das Stop-Gate blockiert höchstens 3× pro Arbeitsstand und lässt einen unveränderten grünen Stand sofort durch. Das begrenzt Kosten und Schleifen.
- Für jedes Gate gilt der **Kanarienvogel**: Beim Aufsetzen wird ein absichtlicher Verstoß eingebaut und muss rot werden. Beim Aufsetzen gefunden: Ein `exclude` auf `node_modules` hatte alle npm-Regeln still deaktiviert.

- **Mehrere Checkouts/Worktrees**: Git-Hooks liegen im gemeinsamen `.git/hooks`. Das lefthook-Skript verweist dort auf das Binary des Checkouts, der es installiert hat. Installiert wird es deshalb über `prepare` beim `pnpm install` im **Haupt-Checkout**, nicht aus einem Worktree. Die Claude-Hooks prüfen zuerst, ob `node_modules` vorhanden ist. Fehlt es, geben sie nur einen Hinweis und blockieren nicht, damit parallele Sessions in noch nicht installierten Checkouts weiterarbeiten können. Maßgeblich bleibt das CI-Gate.

## Konsequenzen
- Mit Absicht zurückgestellt: visuelle Regression (bis das Design steht), Lighthouse CI (veraltetes Paket), Architektur-Review in CI (API-Kosten). Siehe `docs/ideas.md`.
