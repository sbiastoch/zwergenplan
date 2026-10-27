# Plan 0051 – Größenbudgets der ÖPNV-Daten an den Katalog anpassen

Status: in Umsetzung
Datum: 2026-10-27

## Anlass

Der Daten-Commit `32ca5b8` (Umstellung des Nachtlaufs, Plan 0048) kam nicht live. Die CI (`gh run 40474257812`, Job „Smoke (Deploy-Build) & Budgets“) scheiterte an zwei Budgets in `.size-limit.json`:

| Budget | Grenze | Ist |
|---|---|---|
| `Wegzeit-Daten` (`dist/data/wegzeit.json`) | 64 kB | 65,06 kB |
| `Linien-Daten` (`dist/data/linien.json`) | 40 kB | 40,11 kB |

Ursache ist kein Fehler: Die Extraktion mit Opus je Seite findet mehr Kurse, und 9 Orte des Katalogs haben jetzt Angebote (unter anderem `vhs-fuerth`, `hebammen-johannis`, Stadtbibliothek Maxfeld und Südstadt). Netto sind es 7 Spalten mehr (82 → 89), weil zwei der Orte dieselbe Koordinate wie ein bestehender haben (`placeKey`). Die Tabelle hat eine Spalte je Ort mit Angeboten (`buildTransitTables`, `scripts/transit/table.ts`), bei 747 Halten als Zeilen. Bis zur Behebung wird kein Daten-Commit des Nachtlaufs ausgeliefert.

**Nutzerentscheid** vom 2026-10-27: „Wähle auch Größenbudgets, die Sinn ergeben und nicht unmotiviert eng bemessen sind“.

## Messung (2026-10-27)

Gemessen mit `buildTransitTables` auf dem Fahrplanauszug von `main`, gzip, kB wie size-limit (1 000 Byte). Wegwerf-Skript außerhalb des Repos; der Build meldet seit diesem Plan Byte je Zelle selbst (siehe unten). Die CI-Messung liegt etwa 0,3 kB darüber (65,06 kB gegen 64,8 kB), weil size-limit die Datei aus `dist/` mit anderer gzip-Stufe packt.

| Stand | Orte | `wegzeit.json` | `linien.json` |
|---|---|---|---|
| `0566b46` (Nachtlauf vor der Umstellung) | 82 | 59,9 kB | 36,6 kB |
| `32ca5b8` (nach der Umstellung) | 89 | 64,8 kB | 39,6 kB |
| alle 110 Orte des Katalogs mit Koordinaten | 110 | 78,4 kB | 46,2 kB |

Je Ort wachsen die Dateien um etwa 0,7 kB (`wegzeit`) bzw. 0,43 kB (`linien`). Byte je Zelle (`data:build`, echte Daten, 747 × 89), nur die zellabhängigen Felder (`minutes` bzw. `first` + `second`): Tabelle 0,92, Linien 0,60.

**LCP mit gespeichertem Stadtteil und `?wegzeit=20`**, echte Daten (424 Angebote, 89 Orte), gedrosselt wie `e2e/vitals.ts` (1,6 Mbit/s, CPU 4×), lokal `PW_SUITE=smoke pnpm e2e -- -g LCP`: **2 108 ms** (Gate 2 500 ms). Die gefilterte Liste wartet hier auf die Tabelle, das LCP aber nicht: Es liegt vor dem Ende des Abrufs (siehe „Was die Größe kostet“ unter „Entscheidung“).

## Entscheidung

- `.size-limit.json`: `Wegzeit-Daten` **120 kB**, `Linien-Daten` **72 kB**. Das reicht für etwa 165 Orte: das 1,5-Fache aller heutigen Katalogorte und knapp das Doppelte der Orte mit Angeboten.
- **Wann die Dateien laden** (`docs/architecture.md`, Wegzeit): bei jedem Start mit gespeichertem Startpunkt, beim Öffnen der Karte und bei jedem Push im Service Worker; der Service Worker holt sie „Netz zuerst“ (ADR 0013, Regel 5). Die Kosten fallen also nicht einmal an, sondern je Änderung der Datei, und die ändert sich mit jeder Nacht, in der sich die Menge der Orte mit Angeboten ändert. Das nehmen wir hin: Eine Spalte mehr kostet 0,7 kB, die Datei liegt auch bei 120 kB unter dem, was ein Kachelbild kostet, und das Start-JS berührt sie nicht.
- **Was die Größe kostet:** Gedrosselt (1,6 Mbit/s) ist `wegzeit.json` bei 89 Orten nach **2 705 ms** fertig, das LCP liegt mit **2 112 ms** davor. Das LCP-Element ist also nicht die gefilterte Liste, und das LCP-Gate begrenzt die Tabellengröße nicht (anders als in Review 2, M3 angenommen). Die Größe verschiebt, wann die nach Wegzeit gefilterte Liste erscheint: jede Spalte etwa 5 ms, bei ausgeschöpftem Budget etwa 0,28 s später (≈ 3,0 s gedrosselt). Das nehmen wir hin; ein Gate „Liste mit Wegzeit sichtbar“ und das frühere Laden der Tabelle stehen in `docs/ideas.md`. Die „etwa 165 Orte“ sind das, was das Budget erlaubt, keine Empfehlung. Wird der Smoke-Test rot, wird die Ursache behoben, die Schwelle von 2 500 ms bleibt.
- **Zwei neue Gates statt enger Budgets:**
  1. `data:build` prüft mit echten Daten höchstens **1,15 Byte gzip je Zelle** im Feld `minutes` von `wegzeit.json` und **0,75** in `first` + `second` von `linien.json` (`MAX_BYTES_PER_CELL`, `bytesPerCell` und `perCellIssues` in `scripts/transit/table.ts` mit Unit-Tests, Aufruf in `scripts/build-data.ts`). Das ist der Messwert plus rund 25 %. Gemessen werden nur die zellabhängigen Felder: Koordinaten, Liniennamen und Quelle wachsen nicht mit den Orten und höben den Wert bei wenigen Orten (Netz `vrr` vor und kurz nach dem Bootstrap, Plan 0039) über die Grenze. Eine Formatänderung, die je Zelle teurer wird, fällt so auch weit unter dem Budget auf.
  2. Smoke-Test „LCP mit gespeichertem Stadtteil und ?wegzeit= bleibt mit echten Daten im Budget“ in `e2e/smoke.spec.ts` (Gate 2 500 ms). Die `[perf]`-Zeile nennt LCP und das Ende des Abrufs von `wegzeit.json` (über das Timing von Playwright, weil `page.clock` auch `performance` ersetzt). Er läuft im Job „Smoke (Deploy-Build) & Budgets“ vor jedem Deploy und macht die Zeit bis zur Tabelle sichtbar, begrenzt sie aber nicht.
- ADR 0011, ADR 0015 und ADR 0032 bekommen je einen Nachtrag bzw. Änderungsvermerk mit dem Nutzerentscheid; die JSON-Datei kann keinen Kommentar tragen.
- **Plan 0039** (Düsseldorf, in Umsetzung) teilt die Dateien je Netz. Seine Budgetstellen (Zeilen „Wegzeit … 60,7 kB“, „Budgets je Netz“, Abnahme „unter 64 kB“) sind auf 120/72 kB je Netz umgeschrieben; ebenso Plan 0042 (Gates, Größen, N7 überholt).
- **Byte je Zelle nur am VGN geeicht.** Plan 0042 maß für `linien/vrr.json` 45,68 kB bei 609 × 91 Zellen (≈ 0,82 Byte je Zelle für die ganze Datei); `first` + `second` könnten dort über 0,75 liegen. Für `vrr` wird nach Bootstrap und Nachtlauf nachgemessen, wie bei `MAX_WITHOUT_LINES`; liegt der Wert darüber, bekommt jedes Netz eine eigene Schwelle mit Begründung.

## Nicht-Ziele

- Keine Verkleinerung des Formats (Orte mit gleichen Spalten zusammenlegen). Eintrag in `docs/ideas.md` mit den Messwerten.

## Umsetzung und Test

1. `.size-limit.json` (zwei Zahlen), `bytesPerCell` mit Test, Gate in `scripts/build-data.ts`, Smoke-Test, Doku (ADRs, Plan 0039, `docs/ideas.md`).
2. Lokal: `pnpm verify`; `pnpm e2e:local --affected --smoke` (`run_in_background`). Die Messung von 2 108 ms stammt aus `PW_SUITE=smoke pnpm e2e -- -g LCP` (nur die drei LCP-Tests).
3. Commit auf Branch `budgets-oepnv`, Push. **Vor dem Fast-Forward:** Branch-CI grün, insbesondere der Job „Smoke (Deploy-Build) & Budgets“ (läuft bei `full=true`).
4. Fast-Forward nach `main`. Abnahme: CI auf `main` grün, `commit` in `meta.json` = HEAD.

## Review (2026-10-27) – Verdict: Überarbeiten

Alle Punkte übernommen:

- **B1** ADR 0011 und 0015: Nachträge mit dem Nutzerentscheid im Wortlaut; ADR 0032, Punkt 3: Änderungsvermerk.
- **M1** Ladeanlässe richtiggestellt (Start mit Startpunkt, Karte, Push; „Netz zuerst“), Kosten je Änderung statt einmalig.
- **M2** LCP mit echten Daten gemessen (2 108 ms) und als Smoke-Test dauerhaft eingerichtet.
- **M3** Variante (b): 120/72 kB plus Prüfung „Byte je Zelle“. Abweichung: im Build statt als Vitest, denn nur der Build rechnet die echte Tabelle (ein Vitest bräuchte gut 3 s CPU und hinge an der Fixture); die Rechnung selbst hat einen Unit-Test.
- **M4** Plan 0039 an allen drei Stellen angepasst.
- **m1** Abweichung zur CI erklärt; Byte je Zelle meldet jetzt der Build. **m2** netto/brutto getrennt. **m3** Branch-CI als Bedingung vor dem Fast-Forward. **m4** Abnahme über `meta.json`. **m5** Eintrag in `docs/ideas.md`. **m6** bestätigt.

## Review 2 (2026-10-27) – Verdict: Freigabe mit Änderungen

- **M1** Byte je Zelle misst nur `minutes` bzw. `first` + `second` (Messwert 0,92 bzw. 0,60, Schwellen 1,15 bzw. 0,75); Plan 0039 nennt das Gate je Netz.
- **M2** Lokale Prüfung mit `pnpm e2e:local --affected --smoke`.
- **M3** Geprüft und widerlegt: Das LCP (2 112 ms) liegt vor dem Ende des Abrufs der Tabelle (2 705 ms), das LCP-Gate bindet die Größe also nicht. Unter „Entscheidung“ steht jetzt, was die Größe tatsächlich kostet (Zeit bis zur gefilterten Liste), dass wir das hinnehmen und dass dafür kein Gate besteht (`docs/ideas.md`).
- **m1** Linien einheitlich 0,60. **m2** Prüfung als reine Funktion `perCellIssues` mit Test. **m3** Der Smoke-Test protokolliert das Ende des Abrufs von `wegzeit.json` neben dem LCP. **m4** bleibt (Muster wie `e2e/pwa.spec.ts`). **m6** bestätigt.
- **m5 abgelehnt:** `if: always()` für die Bundle-Budgets ändert `ci.yml` und gehört nicht zu diesem Plan; bei rotem Smoke-Test zeigt dessen eigene Meldung die Ursache.

## Arch-Review (2026-10-27) – Verdict: Nacharbeit nötig, kein Blocker

Alles übernommen: **M1** Schwellen nur am VGN geeicht, Nachmessung für `vrr` (hier, Plan 0039, ADR 0032, JSDoc von `MAX_BYTES_PER_CELL`). **m1** Plan 0042 an drei Stellen. **m2** `docs/architecture.md` nennt das Gate. **m3** LCP-Widerspruch aufgelöst, auch in `docs/ideas.md` („früher laden“). **m4** Status `in Umsetzung`. **m5** Kommentar am Smoke-Test.

