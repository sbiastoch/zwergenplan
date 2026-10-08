# ADR 0023 – Zeremonie nach Größe, E2E nach Diff

Status: **angenommen** (2026-10-09). Teil A ist umgesetzt mit Plan 0029, Teil A. Teil B ist umgesetzt mit Plan 0029, Teil B. Dieses ADR ändert ADR 0004 (Sichtprüfung „nach Deploy“, „volle Suite auf jedem Branch“) und hebt in ADR 0021 den Verworfen-Punkt „automatische Auswahl von E2E-Specs“ auf.

## Kontext

Eine kleine Änderung brauchte am 2026-10-08 etwa eine Stunde (Plan 0029, Anlass). Gemessen wurde:

- `check:fast` braucht 9,7 s und ist kein Engpass.
- Jeder CI-Lauf fährt alle 313 E2E-Tests auf allen Geräten, auch für eine einzige Zeile. Das dauert etwa 10 min, auf einem Branch und nach dem Fast-Forward noch einmal auf `main`.
- Jede Änderung, auch eine kleine, bekam ein Plan-Dokument mit `/plan-review`-Subagent.
- `/browser-review` lief erst auf der Live-URL, wartete also auf CI und Deploy.

Der Nutzer hat am 2026-10-08 entschieden: „Die volle suite nur bevor es live geht, einmal“, und zwar ohne vorherige Schattenmessung.

## Entscheidung

### Teil A: Zeremonie nach Größe

1. **Kleinänderung** heißt (Regeln in `scripts/lib/change-size.ts`, Hinweis mit `node scripts/change-size.ts`, Plan 0029, A1):
   - höchstens 60 geänderte Zeilen; hinzugefügte Zeilen in Tests und Doku zählen nicht, gelöschte Testzeilen schon,
   - keine neue Datei außer Tests und Doku,
   - keine hinzugefügte Zeile mit `.skip(`, `.only(`, `.fixme(` oder `biome-ignore`,
   - kein Pfad auf der Sperrliste: Abhängigkeiten, Schema, Gate-Konfiguration, E2E-Helfer, Stufen- und Auswahllogik, ADRs,
   - kein verlangtes Mockup.
2. Eine Kleinänderung braucht **kein Plan-Dokument und kein `/plan-review`**. Ihr Plan steht im Commit-Text. Test-first, `pnpm verify` und die E2E-Pflicht gelten unverändert. `/arch-review` wird schon nach seinen eigenen Auslösern nicht fällig.
3. **Die Sichtprüfung läuft lokal vor dem Commit**, für jede UI-Änderung, mit voller Checkliste gegen den Fixture-Build. Nach dem Deploy folgt nur ein Kurzcheck auf der Live-URL: Commit in `meta.json`, Screenshots der betroffenen Ansichten, einmal die Interaktion, Konsole und Service Worker.

### Teil B: E2E nach Diff

4. Die Auswahl der Specs berechnet `scripts/lib/e2e-select.ts` aus der Hülle der geänderten Dateien im Importgraphen und aus einer Zuordnung „Spec → Ansichtsmodule“ (`scripts/lib/e2e-map.ts`). Ein Pfad, der unter keine Regel fällt, löst die volle Suite aus (fail-safe).
5. **Lokal** wählt `pnpm e2e:local --affected` die Specs. Bei einer vollen Auswahl laufen lokal die berechneten Specs plus Stellvertreter, nie alles (ADR 0021, Nr. 5 bleibt).
6. **CI auf einem Branch** (nur bei `push`, Ref außer `main`) fährt die gewählten Specs auf allen Geräten, in der unveränderten Matrix.
7. **CI auf `main`**, bei Pull Requests und `workflow_dispatch` fährt die volle Suite, vor jedem Deploy genau einmal. Die Garantie aus ADR 0021, Nr. 10 bleibt: Ausgeliefert wird nur ein auf `main` voll grün geprüfter Stand. Abgesichert ist das an drei Stellen unabhängig von der Auswahl:
   - Auf `main` ist die Spec-Liste im YAML immer leer.
   - `gates` verlangt auf `main` `e2e == full`.
   - `deploy` verlangt es ebenfalls.

## Konsequenzen

- ADR 0021 nannte gegen die Auswahl zwei Einwände: „Kein Import-Graph“ und „eine Zuordnung veraltet“. Beiden begegnet das ADR so:
  - Der Graph wird bei jedem Lauf berechnet, ein Kanarienvogel vergleicht ihn mit dependency-cruiser.
  - Wächtertests machen eine veraltete Zuordnung rot.
  - Übersieht die Auswahl dennoch eine Spec, wird `main` rot, und es wird nichts ausgeliefert.
- **Preis:** Ein Fehler, den die Auswahl übersieht, zeigt sich erst auf `main` und kostet dann einen weiteren Lauf von etwa 10 min.
- Ein grüner Push-Lauf auf einem Branch bedeutet nicht mehr „voll geprüft“. Das betrifft den Doku-Pfad aus ADR 0021, Nr. 8 auf Branches. Auf `main` gilt weiterhin der live ausgelieferte, voll geprüfte Commit als Basis.
- Wer direkt auf `main` arbeitet, gewinnt in der CI nichts. Er spart lokal die Spec-Wahl von Hand und die Wartezeit für die Sichtprüfung.
