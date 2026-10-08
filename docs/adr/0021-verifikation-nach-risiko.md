# ADR 0021 – Verifikation nach Risiko

Status: **Teil A angenommen** (2026-10-08, umgesetzt mit Plan 0027, Etappen 1 bis 5). **Teil B ist Entwurf** und gilt als angenommen mit Etappe 7. Der Nutzer hat Teil B am 2026-10-08 zugestimmt. Dieses ADR ergänzt ADR 0004 (Backpressure). Teil B ändert für Doku-Commits ADR 0002 („check → E2E → Deploy“).

## Kontext

ADR 0004 legt fest: `check:fast` läuft im Stop-Hook, im pre-commit-Hook und in CI, und die volle E2E-Suite läuft in CI vor dem Deploy. Wann lokal wie viel geprüft wird, regelt ADR 0004 nicht. Messwerte und Belege stehen in Plan 0027, Abschnitt Ausgangslage.

- Agents fuhren die volle E2E-Suite lokal (2 422 Tests, 5 Geräte, ohne Last etwa 19 min), mehrere Worktrees gleichzeitig. Die Last stieg auf 46–116 bei 16 Kernen, Läufe dauerten über 40 min, und Tests flackerten. Die CI fährt dieselbe Suite auf jedem Branch in etwa 9 min.
- pre-commit und Stop-Gate fuhren `check:fast` auch bei reinen Doku-Änderungen. Das Stop-Gate prüfte auch dann, wenn sich nur der Commit geändert hatte, nicht der Inhalt. Unter Last wurden diese Läufe rot, weil `profile-csa.test.ts` das Zeitlimit von 5 s riss.
- 8 von 11 CI-Läufen, die nicht absichtlich rot waren, scheiterten an knip. knip lief lokal nicht.
- 17 von 40 Commits auf `main` änderten nur Markdown. Jeder davon fuhr 9 Jobs und deployte.

## Entscheidung

### Teil A: lokal

1. **Zwei Stufen aus dem Diff.** `scripts/lib/change-class.ts` vergibt Stufe 0, wenn jeder geänderte Pfad auf der Doku-Positivliste steht. Die Liste umfasst `docs/**/*.md` außer `docs/design/**`, `*.md` im Wurzelverzeichnis, `.claude/skills/**/*.md` und `.claude/agents/*.md`. Jeder andere Diff bekommt Stufe C. Ein Test hält fest, dass kein Build, kein Test, kein Skript und keine Werkzeugkonfiguration Markdown liest. **Grenze:** In der Frontmatter von Skills und Agents könnten `hooks:`, `permissionMode:`, `allowed-tools:` oder `model:` Prozessregeln ändern. Solche Änderungen sichert nur das Review, kein Gate.
2. **Was jede Stufe prüft.**
   - Stufe 0 prüft nur `check-docs`: eindeutige Plan- und ADR-Nummern, Pfadverweise, ab Plan 0027, Etappe 6, auch den Planstatus.
   - Stufe C ist `check:fast` mit knip, `schema:check` und `check-docs`.
   - Coverage, Builds, `size` und die volle E2E-Suite laufen lokal nur auf ausdrücklichen Aufruf. Sonst laufen sie in der CI.
3. **Die Hooks prüfen nach Stufe.**
   - Der pre-commit-Hook ruft `verify --staged` auf.
   - Das Stop-Gate ruft `verify --stop` auf. Geprüft wird nur ein Inhalt (Tree-ID des Arbeitsbaums), der noch keinen frischen grünen Stempel hat.
   - Die Stempel schreibt nur `verify`. Sie liegen maschinenweit unter `~/.cache/zwergenplan/green/<tree-id>`. Geschrieben wird ein Stempel nur, wenn der Baum vor und nach dem Lauf gleich ist.
   - Frisch ist ein Stempel, solange der letzte Lauf der Stufe C (`cAt`) weniger als 12 h zurückliegt. Läufe der Stufe 0 übernehmen `cAt` und verlängern die Frist nicht.
   - Ein Stempel deckt nur den Inhalt ab, nicht `node_modules`.
   - Das Stop-Gate prüft höchstens Stufe C. Es hat ein eigenes Zeitlimit unter dem Hook-Timeout und beendet dann die ganze Prozessgruppe. Ein Zeitlimit zählt als Rot.
   - Rot blockiert weiterhin höchstens 3× je Arbeitsstand.
4. **Veraltetes `node_modules` wird vor allen Schritten erkannt.** Weicht `pnpm-lock.yaml` von `node_modules/.pnpm/lock.yaml` ab, kommt eine einzige Meldung mit Abhilfe statt Typfehlern.
5. **E2E lokal läuft nur gezielt.**
   - `pnpm e2e:local <spec …>` testet genannte Specs auf `pixel-7`, mit zwei freien Ports, die das Skript selbst wählt.
   - Jeder lokale E2E-Lauf nimmt eine maschinenweite Sperre: `flock -o`, ein Platz, eigene Prozessgruppe, kurze Wartezeit.
   - Lokal läuft Playwright mit 25 % der Kerne als Worker.
   - Ein `globalSetup` bricht lokale Läufe ohne Sperre ab. Beim Laden der Konfiguration wirft es nicht, damit knip und `--list` weiter funktionieren.
   - Die volle Suite fährt kein Agent lokal.
6. **Lange Unit-Tests.** Ein CPU-gebundener Unit-Test, der ohne Last länger als 1 s läuft, bekommt ein eigenes Zeitlimit mit Begründung im Code. Vorbild ist `REFERENCE_TIMEOUT_MS = 30_000` in `scripts/transit/profile-csa.test.ts`: Der Test prüft Gleichheit, nicht Tempo, und lief ohne Last 1,6 s, unter Last über 5 s. Die globale Grenze von 5 s bleibt, damit Hänger in den übrigen Tests (alle unter 230 ms) auffallen.
7. **CI beobachten** (Plan 0027, E13): nur die Haupt-Session, mit `gh run watch <id> -i 120` oder `gh run view` im Abstand von mindestens 2 min. Den Deploy prüft man ohne API über `https://zwergenplan.app/data/meta.json` (`commit`). Anlass: Am 2026-10-08 haben parallele Watches mit dem Standardintervall von 3 s das API-Limit von 5 000 Anfragen pro Stunde gerissen.

### Teil B: CI-Doku-Pfad

8. **Der Job `scope` entscheidet `full`.**
   - Auf `main` gilt `full=false` nur, wenn der live ausgelieferte Commit ein Vorfahre ist und der Diff von dort bis zum Push nur Stufe 0 enthält. Den Live-Commit liefert die Deployments-API von GitHub: der volle SHA (40 Hex-Zeichen) des neuesten Deployments in `github-pages` mit Status `success`. `https://zwergenplan.app/data/meta.json` scheidet dafür aus, weil es nur einen Kurz-SHA oder `"unbekannt"` enthält und aus einem CDN-Cache kommen kann.
   - Auf anderen Branches gilt `full=false` nur, wenn der Vorgänger einen grünen Lauf mit `event: push` auf derselben Ref hat und der Diff nur Stufe 0 enthält.
   - In jedem anderen Fall gilt `full=true`, auch wenn eine Abfrage fehlschlägt, bei neuen Branches, bei Pull Requests und bei `workflow_dispatch`. Ein Fehler in `scope` macht den Lauf nie rot, er führt nur zu `full=true`. Der Job `scope` braucht die Rechte `contents: read`, `actions: read` und `deployments: read`.
9. **Bei `full=false`** laufen nur `scope`, `check` und `gates`, ohne E2E, Smoke und Deploy.
   - `gates` läuft mit `!cancelled()` und prüft alle Ergebnisse.
   - `deploy` hängt an `gates` und `scope` und läuft nur bei `full == 'true'`.
10. **Garantie.**
   - Jeder ausgelieferte Stand ist voll grün geprüft.
   - Ein Stand auf `main` ohne vollen Lauf unterscheidet sich vom ausgelieferten, voll geprüften Stand nur in Dateien, die kein Build, kein Test und kein Skript liest. Er führt also keinen neuen roten Befund ein.
   - Dass `origin/main` immer grün ist, behauptet das ADR nicht. Das war schon vorher nicht so: Am 2026-10-05 war `main` dreimal rot.

## Konsequenzen

- **ADR 0004 bleibt in Kraft.** Kein Gate wird schwächer, keine Schwelle sinkt, und vor jedem Deploy fährt die CI alles. ADR 0004 bekommt einen Nachtrag mit Verweis hierher:
  - In der Zeile „Tote Pfade“ steht künftig `check:fast`, CI.
  - Die Hooks prüfen nach Stufe.
- **Mehr rote E2E-Läufe auf Branches sind beabsichtigt.** Der Erfolg zeigt sich daran, dass nichts Kaputtes live geht und keine Hotfixes nötig werden, nicht an der Zahl roter Branches (Plan 0027, Erfolgskriterien).
- **Für Doku-Commits zeigt `meta.json` live nicht deren SHA.** „Live zeigt den neuen Stand“ (CLAUDE.md) gilt nur für Commits, die Build-Eingaben ändern.
- **Verworfen:**
  - automatische Auswahl von E2E-Specs: E2E ist Black-Box, es gibt keinen Import-Graphen, und eine Zuordnung veraltet;
  - `vitest related` als Gate: Es übersieht Fixture-Dateien und spart höchstens 3 s;
  - weitere lokale Stufen für Daten oder Build;
  - ein Hook zum Turn-Start;
  - Worker abhängig von der Last;
  - das CI-Ergebnis nach einem Fast-Forward über die SHA wiederverwenden.
