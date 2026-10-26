# Plan 0047 – Neue Angebote bekannter Anbieter: kein stiller Ausfall

Status: ersetzt durch Plan 0048 (`docs/plans/0048-nachtlauf-seite-als-einheit.md`), Neuschnitt nach ADR 0033 am 2026-10-26. Nie umgesetzt. Statt Teilerfolg je Anbieter wird die Programmseite die Einheit der Extraktion; der Wächter berechnet Befunde aus dem Zustand statt sie zu speichern. Die Messungen unter „Ausgangslage“ gelten weiter.
Datum: 2026-10-25
Bezug:
- Plan 0045 (Entdecken, Branch `plan-0039`), E1, Stufe C („Kurse“). Plan 0046 (Verfügbarkeit per Rezept, Branch `plan-0039`): nach Nutzerentscheid zurückgestellt.
- ADR 0026, Punkt 2 (Rohdaten nur über `refreshProvider`), Punkt 4 („Ein Fehler kostet höchstens Aktualität, nie Bestand“, Einbruchschutz), Punkt 5 (Modell nie mit Schreibrechten, Token nur in eigenen Jobs); ADR 0022 und ADR 0031 (stabile IDs, `assignIds`, Zwillinge).
- `scripts/pipeline/lib/build-offers.ts`, Schritt 7 „Übernahme aus dem Altbestand“.
- **ADR 0036** ist für diesen Plan reserviert (0033–0035: Pläne 0045, 0046, 0044).
- **Vor S1 läuft ein neues `/plan-review`**: Der Skill erlaubt zwei erneute Reviews, beide sind verbraucht; die Lösungen der Blocker aus Review 3 sind noch nicht unabhängig geprüft.

## Voraussetzungen

- **Basis `main`.** Der Plan hängt nicht an Düsseldorf und wird auf einem eigenen Branch von `main` umgesetzt; übernommen wird nur diese Plandatei (per Cherry-Pick). Er nennt die Pläne 0045 und 0046 nur mit Nummer, weil deren Dateien auf `main` fehlen.
- **Konflikt mit `plan-0039`:** Dort ändert Plan 0042 `io/fetch-inputs.ts` und `lib/fetch.ts` (`follow`). Kommt `plan-0039` zuerst auf `main`, baut dieser Plan darauf auf; sonst löst der spätere Rebase die Konflikte in diesen zwei Dateien.

## Anlass

Der Nutzer am 2026-10-25: „Die Verfügbarkeit, also freie Plätze ist für mich eher optional. Wichtiger ist, dass neue Angebote von bekannten Anbietern zuverlässig auftauchen.“ Davor: „Hochwertige und vollständige Daten sind das A und O“, Qualität vor Kosten.

Ein Kurs, den ein bekannter Anbieter neu veröffentlicht, soll bald erscheinen, und ein Ausfall soll nicht still bleiben. Dieser Plan behebt die zwei stillen Ausfälle, die die Messung unten zeigt. Weitere Hebel stehen unter „Nicht-Ziele“ mit ihrem Weg.

## Ausgangslage (gemessen 2026-10-25, ohne Modell)

**Angebote über 12 Nachtläufe** (`data/offers.json` auf `main`, 2026-10-13 bis 2026-10-25, stabile IDs):
- 7 bis 38 neue Angebots-IDs je Nacht.
- 258 Angebote verschwanden mit künftigen Terminen: 9 kamen wieder; 103 hatten am selben Ort mit gemeinsamem künftigem Termin einen Nachfolger mit anderer ID (meist umformulierter Titel); 146 ohne solchen Nachfolger, vor allem `fbs-nuernberg` (52), `sternenhaus-kuf` (32), `studio-herzschlag` (32). Ob diese 146 zu Recht fehlen, ist nicht gemessen.
- **Abdeckung FBS** (vier der 13 Programmseiten, Kursnummern): 80 Kurse mit künftigem Beginn, bei 67 (84 %) ist der Beginn ein Termin eines FBS-Angebots; die meisten übrigen sind zu Recht nicht dabei.

**Stille Ausfälle** (`data/raw` auf `main`):
- `die-familienbox`: `fehler` seit 2026-10-22, weil **eine** von acht Programmseiten HTTP 404 liefert (`/erwachsenenkurse/stundenplan-1/`). Fällt eine Seite aus, wird der ganze Anbieter `fehler` (`assembleProvider`, `lib/fetch.ts`); `failed()` (`lib/refresh.ts`) behält die alten `events` und den alten Schlüssel. Der Build baut dann aus diesen alten Rohdaten; die Übernahme aus dem Altbestand (Schritt 7) greift für extrahierte Anbieter nicht (`carryReason` gibt bei `perProviderStatus && extracted` vorab `undefined`, Test „extrahierter Anbieter mit fehler nimmt nur seine Rohdaten“). Bestand bleibt, aber neue Kurse der sieben erreichbaren Seiten kommen nicht an.
- Alle 24 Events der FamilienBox tragen als `sourceUrl` die erste Seite und liegen am Ort `die-familienbox`, darunter sieben Kleinkindturnen- und vier Babyturnen-Gruppen. Eine Zuordnung Event → Seite über `sourceUrl` oder über Ort plus Kerntitel ist nicht verlässlich.
- Sichtbar ist ein Ausfall nur im Job-Summary des Nachtlaufs (Ampel gelb, rot erst über 20 % Ausfall, `lib/report.ts`) und nach 14 Tagen im Entdecken-Bericht (`staleHints`). Ein Issue gibt es nicht. Ein Einbruch (`pending`) lebt meist nur eine Nacht.

## Ziel

1. **Teilausfall:** Fällt eine von mehreren Programmseiten eines Anbieters zwei Nächte in Folge aus, erscheinen ab der zweiten Nacht neue Angebote der übrigen Seiten, und **keine** ID aus dem Vorstand dieses Anbieters fehlt, solange die Seite ausfällt (auch nicht eine von mehreren gleichnamigen Gruppen). Gemessen per Fixture-Test über drei Nächte und in der Woche nach S1 im Bericht (verlorene IDs: 0; Dubletten gezählt).
2. **Kein stiller Ausfall:** Ein Seitenausfall und ein Ausfall aller Seiten stehen im Wächter-Issue, sobald sie an zwei Kalendertagen (Europe/Berlin) innerhalb von drei Tagen auftraten; ein Einbruch und ein Fall von Angeboten auf `keine-termine` sofort. Eine Zeile verschwindet erst, wenn der Befund an zwei Kalendertagen nicht mehr auftrat.

## Nicht-Ziele (mit ihrem Weg)

- **Modell der Extraktion nach Recall** (Haiku R 91 % mit dem aktuellen Prompt, Sonnet R 98–99 % mit einem älteren): eigene Kleinänderung nach Skill, Abschnitt 5, je zwei Eval-Läufe für Sonnet und Opus, Zielwert in beiden Läufen, Nachtrag zu ADR 0026, Punkt 3, Hinweis auf den Ertragsbeweis im Entdecken. Weil ein Modellwechsel Titel und IDs ändert, kommt er nach dem Plan zur ID-Stabilität.
- **ID-Wechsel bei Umformulierung** (103 in 12 Nächten): eigener Plan; er beginnt damit, `assignIds` auf aufeinanderfolgenden Ständen nachzuspielen und jeden Fall der verwerfenden Stufe oder Sperre zuzuordnen.
- **Neue Programmseiten bekannter Anbieter:** Plan 0045, Schritt S3b.
- Verfügbarkeit per Rezept (Plan 0046, zurückgestellt); neue Anbieter (Plan 0045).
- `pipeline extract --from` mit Teilerfolg: lehnt Einträge mit Status `teilweise` weiter ab (`cli.ts`), wie heute bei `fehler`.

## Entscheidungen

### E1 – Teilerfolg ab der zweiten Ausfallnacht

Nur im Nachtlauf: `fetchInputs` bekommt eine Option `partial`, Standard aus; `io/nightly.ts` schaltet sie ein. Ertragsbeweis im Entdecken, `io/eval.ts` und `pipeline fetch-page` behalten das heutige Verhalten.

- **Wann:** Ein Anbieter hat mehrere Programmseiten, mindestens eine scheitert, mindestens eine gelingt, kein Sammelkalender-Ausfall betrifft ihn, es gibt einen Vorzustand mit `inputHash`, **und** dieselbe Seite scheiterte schon in der vorigen Nacht (Befund `seite` mit `lastSeen` = gestern, E2). In der ersten Ausfallnacht, bei einer Seite oder ohne gelungene Seite gilt das heutige Verhalten (`fehler`, alter Stand). So kostet eine Seite, die nur gelegentlich ausfällt, keine zusätzliche Extraktion und keine Umformulierungen.
- **Abruf:** `assembleProvider` (rein, `lib/fetch.ts`) liefert neu den Status `teilweise` mit den gelungenen Seiten und `failedPages: [{url, reason}]` (`ProviderFetch.status` bekommt den Wert). Der Aufbau von `FetchedProvider`, heute ungetestet in `io/fetch-inputs.ts`, wandert als reine Funktion nach `scripts/pipeline/lib/fetched-provider.ts` mit Test.
- **Schlüssel:** `extractKey` wie heute über die gelungenen Seiten, Kandidaten, Katalogauszug, Prompt, Schema, Modell und `dated`, dazu **nur bei Teilausfall** je ausgefallener Seite ein Marker `ausgefallen:<url>`. Ohne Ausfall bitgleich zu heute (Golden-Test). Gleicher Ausfall in der Folgenacht und sonst gleich → `sameKey` → „unverändert“; Rückkehr der Seite → anderer Schlüssel → volle Extraktion.
- **Status in allen Pfaden:** Ist `fetched.status` `teilweise`, setzt `lib/refresh.ts` `ProviderRaw.status` in **jedem** Pfad auf `teilweise` (unverändert, `pending-uebernommen`, Übernahme neuer Events, Einbruch), statt `statusOf(events)`; `failedPages` steht im Zustand. Das Status-Enum von `ProviderRaw` wird von dem der Batches (`RawBatch`, `lib/raw.ts`) getrennt. Das `RefreshResult` bleibt wie heute (`extrahiert`, `unveraendert` …), damit `changedProviders` und `cached` stimmen; `teilweise` ist nur Status.
- **Einbruchschutz im Teilerfolg:** Die Prüfung in `adopt` (neue gegen alte Event-Einheiten) entfällt für `teilweise`, weil sie Teil-Events mit allen alten vergleicht und sonst neue Angebote als `pending` zurückhielte; den Bestand schützt die Übernahme im Build. Nach der Rückkehr der Seite vergleicht `adopt` gegen `max(eventUnits(prev.events), prevOfferCount)`, weil `prev.events` dann nur den Teilbestand enthält.
- **Kein Bestandsverlust, 1:1, im Build:** `batchesFromRaw` liefert neu `partial: Set<string>` (Anbieter mit Status `teilweise`) in `BuildInput`. In Schritt 7 prüft `carryReason` **vor** der Ausnahme für extrahierte Anbieter: Ist der Anbieter in `partial`, ist der Grund „Programmseite ausgefallen“. Übernommen wird dann jedes alte Angebot dieses Anbieters, dessen ID `assignIds` in diesem Lauf keinem neuen Entwurf gegeben hat, mit altem `checkedAt` und den Termin-Regeln von Schritt 7. Die Zuordnung ist die der stabilen IDs (1:1, Stufen 1 und 2, ADR 0031): Ein neues „Kleinkindturnen Montag“ nimmt nur die ID der Montagsgruppe, die übrigen Gruppen bleiben als Altbestand.
- **Keine Dubletten:** Ein altes Angebot wird nicht übernommen, wenn `sameOfferTwice(alt, neu, from)` (`lib/stable-ids.ts`) mit einem neuen Angebot desselben Anbieters gilt; der Bericht zählt solche Fälle als „Fassung erneuert“.
- **Dauer:** Die Übernahme gilt, solange der Anbieter `teilweise` ist, also solange die Seite ausfällt, wie heute bei `fehler` (ADR 0026, Punkt 4). Dass das nicht still bleibt, leistet E2.
- **`checkedAt`:** `raw.checkedAt` gilt für die Angebote aus den gelungenen Seiten; übernommene behalten ihr altes `checkedAt` aus dem Vorstand.
- **Bericht:** `BuildReport` zählt je Anbieter übernommene Angebote und erneuerte Fassungen. Die Ampel zeigt `teilweise` gelb; es zählt nicht in die 20-%-Regel für Rot.

### E2 – Wächter

- **Zustand:** `ProviderRaw.findings: [{kind, url?, reason?, since, lastSeen}]`, Daten als `z.iso.date()` (Kalendertag Europe/Berlin über `src/domain/time.ts`), `kind` `seite` (eine Programmseite scheitert, `reason` etwa „HTTP 404“), `fehler` (alle Seiten), `einbruch` (`pending` entstanden, oder mehr als 50 % der alten Angebote im Teilerfolg übernommen, mindestens `COLLAPSE_MIN_OLD`), `leer` (der Anbieter hatte im Vorstand Angebote und hat im gebauten Stand, neu plus übernommen, keine).
- **Wer schreibt:** eine reine Funktion `nextFindings(prev, observation, today)` in `scripts/pipeline/lib/findings.ts`. `refreshProvider` liefert die Beobachtungen aus Abruf und Extraktion (`seite`, `fehler`, `pending`); `io/nightly.ts` ergänzt nach dem Build die aus dem Bericht (`leer`, Übernahmequote) und schreibt `findings` danach in die Rohdaten. Das ist ein zweiter Schreibweg nach `data/raw`, nur für dieses Feld, und steht in ADR 0036 (Abweichung von ADR 0026, Punkt 2 und `docs/architecture.md`).
- **Regeln:** `since` beim ersten Auftreten, `lastSeen` an jedem Kalendertag mit Befund; ein Befund wird gelöscht, wenn `lastSeen` mehr als 2 Kalendertage zurückliegt (Hysterese). `einbruch` und `leer` bleiben mindestens 14 Tage ab `since`, auch wenn ein `pending` am nächsten Tag übernommen wurde.
- **Wann im Issue:** `seite` und `fehler`, wenn `lastSeen` > `since` und `lastSeen` − `since` ≤ 2 Tage beim ersten Mal (zwei Kalendertage innerhalb von drei); `einbruch` und `leer` sofort. Im Modus `trocken` wird kein Zustand gespeichert; das Summary zeigt dann nur `einbruch`, `leer` und `fehler`.
- **Text:** reine Funktion `watchIssue(raws, today)` in `lib/report.ts` über **alle** Rohdaten, nicht nur die Anbieter des Laufs (ein Lauf mit `--only` darf das Issue nicht schließen). Als Liste (keine Tabelle, `|` in Code-Spans spaltet GFM-Zellen): je Befund Anbieter-ID, Art, Seite, Grund, seit wann. Fremder Text (Gründe, URLs) nur in Code-Spans, Backticks und Zeilenumbrüche ersetzt, `@` entschärft, je Zeile höchstens 200 Zeichen, gesamt unter 60 000 Zeichen. Letzte Zeile ein Marker `<!-- waechter: id:kind,id:kind,… -->`.
- **Ablauf in `nightly.yml`:**
  - Der Job `nachtlauf` (ohne Token) schreibt `waechter.md` (`pnpm pipeline status`) und lädt sie als eigenes Artefakt `waechter` hoch.
  - Neuer Job `waechter`: `needs: [modus, nachtlauf, veroeffentlichen]`, `if: always() && needs.modus.outputs.modus == 'live' && needs.nachtlauf.result == 'success'`, `permissions: issues: write` und sonst nichts, kein Checkout. Schritte: `actions/download-artifact@v4` (im selben Lauf ohne `actions: read`), dann Shell mit `gh` und `jq`, immer `--repo "$GITHUB_REPOSITORY"`, `GH_TOKEN` nur hier, Werte über `env`, Text per `--body-file`, `continue-on-error: true` mit `::warning::`.
  - Logik: Label `nachtlauf-waechter` anlegen (`gh label create … --force`); Issue suchen mit `gh issue list --app github-actions --label nachtlauf-waechter --state all --json number,state,body`; Text leer → offenes Issue schließen; sonst offenes bearbeiten, geschlossenes wiedereröffnen (mit Kommentar) oder neu anlegen; einen Kommentar zusätzlich, wenn der Marker ein Paar `id:kind` enthält, das im alten Marker fehlte. Der Marker wird nur aus einer Zeile gelesen, die mit `<!-- waechter: ` beginnt, und nur, wenn er `^[a-z0-9:,-]*$` erfüllt.
- **Test:** `scripts/lib/nightly-workflow.test.ts` (Muster `scripts/lib/push-schedule.test.ts`): `waechter` hat genau `issues: write`, keinen Checkout, `always()` in der Bedingung, `--repo`, `--body-file`, `--app github-actions`; `nachtlauf` hat kein Schreibrecht.
- `staleHints` im Entdecken entfällt (doppelt). ADR 0036 nennt den neuen Job mit Token (ADR 0026, Punkt 5).

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/fetch.ts` (`assembleProvider`, `ProviderFetch`), `io/fetch-inputs.ts`, `lib/fetched-provider.ts` (neu, rein) | Status `teilweise`, `failedPages`, Option `partial` | S1 |
| `scripts/pipeline/lib/normalize.ts` | Marker nur bei Teilausfall | S1 |
| `scripts/pipeline/lib/refresh.ts`, `io/refresh.ts` | Status `teilweise` in allen Pfaden, Einbruchprüfung aussetzen bzw. Vergleichsbasis | S1 |
| `scripts/pipeline/lib/raw.ts` (Export `schema/provider-raw.schema.json` per `export-schema`) | Status `teilweise` (getrenntes Enum), `failedPages`, `findings` | S1 |
| `scripts/pipeline/lib/build-offers.ts` | `partial` in `BuildInput`, Übernahmegrund vor der `extracted`-Ausnahme, `sameOfferTwice`-Sperre, Zählung im `BuildReport` | S1 |
| `scripts/pipeline/lib/findings.ts` (neu, rein) | `nextFindings` | S1 |
| `scripts/pipeline/io/nightly.ts` | Option `partial`, Befunde nach dem Build schreiben | S1 |
| `scripts/pipeline/lib/report.ts` | Ampel und Tabelle für `teilweise`, `watchIssue` | S1, S2 |
| `scripts/pipeline/cli.ts` | `status` schreibt `waechter.md` | S2 |
| `scripts/validate-data.ts` | `findings`, `failedPages`, `teilweise` | S1 |
| `.github/workflows/nightly.yml` | Artefakt `waechter`, Job `waechter` | S2 |
| `scripts/lib/nightly-workflow.test.ts` (neu) | Rechte und Aufrufe je Job | S2 |
| `scripts/pipeline/lib/discover.ts` | `staleHints` entfällt | S2 |
| ADR 0036 (neu, unter `docs/adr/`); ADR 0026 Statuszeile; `docs/architecture.md`; Skill (Nachtlauf, Wächter-Issue) | Doku | S1, S2 |

## Tests (test-first)

- `lib/fetch.test.ts`, `lib/fetched-provider.test.ts`: zwei Seiten, eine scheitert → `teilweise` mit `failedPages`; eine Seite, alle scheitern, Option aus → wie heute.
- `lib/normalize.test.ts`: Schlüssel ohne Ausfall bitgleich (Golden-Test); Marker nur bei Ausfall; gleicher Ausfall zweimal → `sameKey`; Rückkehr → anderer Schlüssel.
- `lib/refresh.test.ts`: `teilweise` bleibt in allen Pfaden (unverändert, `pending-uebernommen`, Übernahme, Einbruch); Teil-Events lösen im Teilerfolg keinen Einbruch aus; nach der Rückkehr vergleicht `adopt` gegen `max(…)`; erste Ausfallnacht → `fehler` wie heute; `findings` überstehen alle Pfade.
- `lib/build-offers.test.ts`: **zwei Kleinkindturnen-Gruppen (Mo, Mi), die Seite der Mittwochsgruppe fällt aus, die neue Extraktion liefert nur Montag** → Montag behält seine ID, Mittwoch kommt aus dem Altbestand mit altem `checkedAt`, mit `perProviderStatus` und `extracted`; Fixture mit falscher `sourceUrl` (alle auf Seite 1) → kein Angebot verschwindet; altes Angebot mit `sameOfferTwice` zu einem neuen → nicht übernommen, gezählt; Anbieter nicht in `partial` → keine Übernahme wie heute.
- `io/nightly.test.ts` mit Fake-Abruf **über drei Nächte**: Nacht 1 Seite fällt aus → `fehler`, alter Stand; Nacht 2 gleicher Ausfall → `teilweise`, neue Angebote der übrigen Seite, keine alte ID fehlt; Nacht 3 gleiche Eingabe → unverändert, weiter `teilweise`, keine alte ID fehlt; Nacht 4 Rückkehr → volle Extraktion, `ok`.
- `lib/findings.test.ts`: `since`/`lastSeen` nach Kalendertag; zwei Läufe am selben Tag zählen einmal; Hysterese; `einbruch` und `leer` 14 Tage, auch nach übernommenem `pending`; `leer` über den gebauten Stand.
- `lib/report.test.ts` (`watchIssue`): Seite an zwei Kalendertagen innerhalb von drei → Zeile; einmal → keine; über alle Rohdaten, nicht nur `--only`; fremder Text nur in Code-Spans, ohne Backticks, Zeilenumbrüche, `@`; Liste; Marker `id:kind`; Länge begrenzt.
- `scripts/lib/nightly-workflow.test.ts`: wie in E2.

## Schritte

Vor S1: neues `/plan-review` (Bezug). Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected` (Daten und Schema mit `--smoke`); S1 und S2 mit `/arch-review`.

- **S0 – Messen (ohne Modell).** Aus der Historie von `data/raw` auf `main` (Wegwerf-Skript, nicht im Repo): Anbieter mit mehreren Programmseiten, deren Seitenausfälle der letzten 14 Nächte und die Flatterrate (Ausfall an nicht aufeinanderfolgenden Tagen), also wie oft der Teilerfolg ab der zweiten Nacht gegriffen hätte; Befunde, die der Wächter gemeldet hätte. Ergebnis in den Abschnitt „Umsetzung“ dieses Plans. Die 404 der FamilienBox bleibt bis S1 unrepariert, damit S1 sie live prüft; sonst gilt nur der Fixture-Test.
- **S1 – Teilerfolg** (E1) und `findings` (E2, Zustand). Abnahme: In der zweiten Nacht nach dem Deploy ist die FamilienBox `teilweise`, `checkedAt` stammt aus dieser Nacht, keine ihrer IDs aus dem Vorstand fehlt, und neue Kurse der sieben Seiten erscheinen.
- **S2 – Wächter-Issue** (E2). Abnahme: Der 404 der FamilienBox steht im Issue, bis er im Katalog behoben ist; danach schließt sich das Issue nach zwei Tagen.
- **S3 – Abschluss.** Eine Woche Bericht mit Zielwerten: verlorene IDs bei Anbietern mit `teilweise` 0; übernommene Angebote und erneuerte Fassungen gezählt; Befunde im Issue je Art. Live-Prüfung (CI grün, `meta.json`), `/browser-review live` für den Prüfzeitpunkt in der Detailansicht; Restpunkte nach `docs/ideas.md`: Modell nach Recall, Plan zur ID-Stabilität.

## Kosten

Nach Nutzervorgabe kein Kriterium. Der Teilerfolg kostet je betroffenem Anbieter eine Extraktion in der zweiten Ausfallnacht und eine bei der Rückkehr, dazwischen keine (`sameKey`).

## Risiken

- **Veraltete Angebote einer toten Seite** bleiben stehen wie heute bei `fehler`. Abhilfe: Wächter-Issue ab dem zweiten Tag, Pflege per Skill.
- **Dubletten** (altes und neues Angebot nach Umformulierung): Abhilfe: `sameOfferTwice`-Sperre vor der Übernahme, Zählung im Bericht, Befund `einbruch` ab 50 % Übernahme.
- **Zweiter Schreibweg nach `data/raw`** (`findings` nach dem Build): Abhilfe: nur dieses Feld, reine Funktion mit Test, in ADR 0036.
- **Issue als Angriffsfläche:** Abhilfe: eigener Job mit nur `issues: write`, kein Checkout, Text als Datei, fremder Text nur in Code-Spans, geprüfter Marker.

## Review (2026-10-25) – Verdict: Überarbeiten

Unabhängiger Review auf den ersten Entwurf (damals mit Modellwahl, ID-Regel und neuen Programmseiten im Plan). Übernommen: Übernahme ohne `sourceUrl` (B1); `checkedAt`, Ablauf, Flattern, Entdecken ausgenommen, Dateien, getrenntes Status-Enum (M1); eigener Job mit nur `issues: write` (M2); Zustand des Wächters (M3); Modellwahl, ID-Regel und neue Programmseiten aus dem Plan genommen (M4–M7).

## Review 2 (2026-10-25) – Verdict: Überarbeiten

Übernommen: Übernahme über Altbestand und `assignIds` statt eigener n:1-Regel (B1); Einbruch im Teilerfolg (M1); Schlüssel mit Marker statt Seiten-Hashes (M2); Golden-Test ohne Ausfall (M3); ein Feld `findings` mit Hysterese (M4); Job `waechter` in Shell mit `--repo` (M5); keine toten Pfade auf `main` (M6); Minor-Punkte.

## Review 3 (2026-10-25) – Verdict: Überarbeiten

Dritter, unabhängiger Review (letzter erlaubter Durchgang nach dem Skill). Das Konzept (Altbestand plus `assignIds`, 1:1) hielt; der Weg im Code fehlte. Alle Punkte übernommen:
- **B1 Übernahme greift nicht bzw. nur eine Nacht** (`carryReason` nimmt extrahierte Anbieter vorab aus; `statusOf` setzt ab Nacht 2 `ok`): `partial` in `BuildInput`, Prüfung vor der `extracted`-Ausnahme, Status `teilweise` in allen Refresh-Pfaden, Test über mehrere Nächte, Build-Test mit `perProviderStatus` und `extracted`.
- **B2 Einbruchschutz im Teilerfolg:** Prüfung in `adopt` für `teilweise` ausgesetzt, Befund `einbruch` aus der Übernahmequote nach dem Build, kein Fallback-Versuch mehr, Vergleichsbasis `max(…)` nach der Rückkehr.
- **M1 Dubletten:** `sameOfferTwice`-Sperre vor der Übernahme, Zählung. **M2 Flattern:** Teilerfolg erst ab der zweiten Ausfallnacht in Folge; S0 misst die Flatterrate. **M3 Wer schreibt `findings`:** `nextFindings` rein, Schreiben nach dem Build in `io/nightly.ts`, Abweichung in ADR 0036, Feld `reason`, Daten als `z.iso.date()`. **M4 Job `waechter`:** `always()` in der Bedingung, `download-artifact`, `--app github-actions`, Marker `id:kind` geprüft.
- **Minor:** `watchIssue` über alle Rohdaten; ADR 0036 deckt den neuen Job mit Token; `ProviderFetch.status`; `extract --from` genannt; `RefreshResult` unverändert, `teilweise` nur Status, nicht in der 20-%-Regel; Probe live oder per Fixture; Abnahme mit Zielwerten; Ziel 2 präzisiert, Trockenlauf genannt; Datei `lib/fetched-provider.ts` benannt.
- **Nicht mehr unabhängig geprüft; deshalb neues `/plan-review` vor S1.**
