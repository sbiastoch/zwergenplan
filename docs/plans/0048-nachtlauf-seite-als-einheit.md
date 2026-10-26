# Plan 0048 – Nachtlauf: die Programmseite als Einheit, ein Abruf, ein Wächter

Status: Entwurf
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`): Punkte 1 (ein Abruf), 2 (Einheit Seite), 3 (Zustand und Gesundheit), 5 (Wächter) und 7 (Grenzen nach Qualität). Dieser Plan setzt sie um.
- Ersetzt Plan 0047 (`docs/plans/archiv/0047-neue-angebote-zuverlaessig.md`). Dessen Messungen gelten weiter. Übernommen werden die Diagnose zu `carryReason`/`statusOf` und der abgeschottete Job für das Issue.
- ADR 0026, Punkte 2, 4 und 5; ADR 0022 und ADR 0031 (stabile IDs); Plan 0032, E3–E6 (Abruf, Schlüssel, Zustand, Bericht).
- Skill `babyevents-nuernberg`, Abschnitte 1 (Bericht sichten), 3 (Katalog pflegen) und 5 (Modell wechseln).

## Voraussetzungen

- **Basis `main`.** Der Plan hängt nicht an Düsseldorf. Umgesetzt wird auf einem eigenen Branch von `main`; übernommen werden ADR 0033 und diese Plandatei (Cherry-Pick).
- **Konflikt mit Branch `plan-0039`:** Plan 0042 ändert dort `scripts/pipeline/io/fetch-inputs.ts` und `scripts/pipeline/lib/fetch.ts` (`follow`, `withFollowPages`) und hat `partChars`. Kommt `plan-0039` zuerst auf `main`, baut S2 darauf auf. Sonst löst der spätere Rebase von `plan-0039` die Konflikte; Folgeseiten gehören dann zur Einheit ihrer Programmseite (E1).
- **Katalogfehler behoben** (ADR 0033, Reihenfolge 1), per Skill, Abschnitt 3: die 404-Seite von `die-familienbox` und der TLS-Fehler von `zentrum-kobergerstrasse` (seit 2026-10-23, alle drei Seiten). Sie werden **nicht** als Testfälle stehen gelassen; Ziel 1 prüft ein Test über mehrere Nächte.
- **Modell gewählt** (ADR 0033, Reihenfolge 2): Eval nach Skill, Abschnitt 5, mit Sonnet und Opus, je zwei Läufe, Entscheidung nach Recall. Dann extrahiert die Umstellung in S2 mit dem endgültigen Modell, und S0 misst mit ihm.

## Anlass

Der Nutzer will vor allem, dass neue Angebote bekannter Anbieter zuverlässig auftauchen und ein Ausfall nicht still bleibt (2026-10-25). Kosten sind kein Kriterium, auch das Kontingent nicht (2026-10-26). Das Gesamt-Review vom 2026-10-25 zeigte: Die Sonderlogik des Vorgängerplans 0047 stammt daher, dass Abruf, Schlüssel und Zustand je Anbieter gelten. ADR 0033 macht deshalb die Programmseite zur Einheit.

## Ausgangslage (gemessen 2026-10-25/26)

- **Seiten je Anbieter** (`data/providers.yaml` auf `plan-0039`, alle Regionen): 107 abgerufene Anbieter. 60 haben eine Seite, 47 mehrere; das sind 185 von 245 Seiten. Die meisten Seiten haben `studio-herzschlag` (14), `fbs-nuernberg` (12), `zoff-harmonie` (8) und `die-familienbox` (7). Drei Anbieter haben Seiten mit `use: verfuegbarkeit`: `hebamme-eva-kauper-wunderwerk`, `dance-maxx-nuernberg`, `wolf-pack-yoga`. 97 Seiten tragen einen `hint`. Seitenarten: 192 `html`, 32 `html` mit Browser, 10 `ical`, 6 `json-api`, 5 `pdf`.
- **Ein Seitenausfall sperrt den Anbieter:** `assembleProvider` (`scripts/pipeline/lib/fetch.ts`) setzt bei der ersten gescheiterten Seite `fehler`. `failed()` (`scripts/pipeline/lib/refresh.ts`) behält dann den alten Stand. Neue Kurse der übrigen Seiten kommen nicht an (`die-familienbox` seit 2026-10-22).
- **`sourceUrl` ist nicht verlässlich:** Bei `die-familienbox` tragen alle 24 Events die erste Seite. Eine Zuordnung Event → Seite im Nachhinein trägt nicht.
- **Schon vorhanden:** Teile an Seitengrenzen (`splitInput`, `scripts/pipeline/lib/split.ts`) und ihre Vereinigung (`mergeParts`). Dubletten derselben Quelle entfernt der Build über alle Rohdateien (`dropSameSourceDuplicates`, `sameOfferTwice`, ADR 0031); die Rangfolge der Quellen hängt am Event (`via`), nicht an der Rohdatei. Der Katalogauszug im Schlüssel (`catalogExcerpt`, `scripts/pipeline/lib/normalize.ts`) enthält den ganzen Eintrag samt aller `hint`.
- **Meldung:** Die Ampel wird gelb bei einem Ausfall und rot erst über 20 % (`scripts/pipeline/lib/report.ts`). `staleHints` meldet nach 14 Tagen im Bericht des Entdeckens. Ein Issue gibt es nicht.
- **Abruf:** Browser-User-Agent (`UA` in `scripts/pipeline/io/http.ts`), kein robots.txt. Je Lauf höchstens 4 Abrufe gleichzeitig, 2 je Host (`LIMITS` in `scripts/pipeline/io/fetch-inputs.ts`).
- **Grenzen:** `NIGHT_BRAKES` 150 Aufrufe und 3 Mio. Tokens (`scripts/pipeline/lib/cost.ts`), `DEFAULT_BUDGET_MIN` 50 (`scripts/pipeline/io/nightly.ts`), `CONCURRENCY` 3 Anbieter, Job `nachtlauf` 90 Min. (`.github/workflows/nightly.yml`).

## Ziel

1. **Seitenausfall kostet nur die Seite.** Fällt eine von mehreren Seiten aus, erscheinen in **derselben Nacht** neue Angebote der übrigen Seiten. Keine ID aus dem Vorstand der ausgefallenen Seite fehlt, solange der Ausfall vorübergehend ist oder weniger als 14 Tage `dauerhaft`. Gemessen mit einem Test über vier Nächte und in der Woche nach S2 im Bericht (verlorene IDs bei Anbietern mit ausgefallener Seite: 0).
2. **Nicht schlechter als heute.** Die Extraktion je Einheit liefert gegenüber der Extraktion je Anbieter mit demselben Modell (S0, je zwei Läufe):
   - mindestens so viele Angebote des Vorstands wieder (Recall gegen `data/offers.json`, höchstens 1 Prozentpunkt darunter);
   - höchstens 1 Prozentpunkt mehr Dubletten (gleicher Anbieter, Ort und Beginn, ähnlicher Titel);
   - kein Anbieter mit mehr als 10 % weniger Angeboten ohne erklärten Grund.
3. **Kein stiller Ausfall.** Im Wächter-Issue stehen:
   - jede Seite, die an zwei aufeinanderfolgenden Kalendertagen scheitert;
   - jede entfernte Seite;
   - jeder zurückgehaltene Einbruch;
   - jeder Anbieter, dessen Einheiten alle leer geworden sind (14 Tage lang);
   - jede Seite, die robots.txt sperrt.

   Ist nichts offen, ist das Issue geschlossen.
4. **Ein Abruf.** Jeder Abruf nennt uns im User-Agent und beachtet robots.txt. Wie viele Katalogseiten das kostet, ist vor dem Einschalten gemessen und entschieden (S1, N1).
5. **Umstellung ohne Verlust.** Nach den Nächten der Umstellung steht jeder Anbieter im neuen Format. Je Anbieter fehlen nicht mehr Angebote, als Ziel 2 erlaubt.

## Nicht-Ziele

- **Neue Programmseiten finden:** Plan 0049 (Seitenfinder).
- **Neue Anbieter:** Plan 0050.
- **Plätze per Rezept:** Plan 0046, zurückgestellt.
- **Modellwahl:** Voraussetzung nach Skill, Abschnitt 5, kein Teil dieses Plans; E9 regelt nur die Grenzen danach.
- **ID-Stabilität bei umformulierten Titeln** (103 ID-Wechsel in 12 Nächten, Plan 0047): Erst nach S2 neu messen, weil Modell und Einheit beide die Titel ändern. Danach bei Bedarf ein eigener Plan.
- **Plätze und `checkedAt` je Event:** `checkedAt` wird je Einheit genauer (E6), mehr nicht.

## Entscheidungen

### E1 – Einheit

- **Einheit** (`scripts/pipeline/lib/units.ts`, neu, rein):
  - je Programmseite mit `use: termine` ohne `blocked`, samt ihrer Folgeseiten (`follow`, sobald Plan 0042 auf `main` ist), dazu als **Beilage** alle Seiten mit `use: verfuegbarkeit` ohne `blocked` desselben Anbieters;
  - die Kandidaten der Sammelkalender des Anbieters als Einheit `kandidaten`. Anbieter mit `coveredBy` oder `skipCrawl` haben nur diese.
- **Kennung:** `seite:<URL aus dem Katalog>`, also die **Vorlage** mit `{von}`/`{bis}`, nicht die ausgefüllte URL; so bleibt sie über die Nächte gleich. Dazu `kandidaten`. Ändert ein Mensch die URL im Katalog, ist das eine neue Einheit, und die alte entfällt (E5).
- **Reihenfolge** der Einheiten: wie im Katalog, `kandidaten` zuletzt. Sie bestimmt die Reihenfolge der Batches im Build und damit, welche Fassung einer Dublette bleibt (`order`).
- **Eingabe je Einheit:** `## Seite 1: <url> (<art>)` für die eigene Seite, dann die Beilagen als weitere `## Seite k:`, bei `kandidaten` der Abschnitt `## Kandidaten (n)` wie heute. `MAX_INPUT_CHARS` gilt je Einheit. Große Einheiten zerlegt `splitInput` wie heute (`partChars` gilt je Einheit).
- **Status der Einheit:**
  - `fehler`, wenn ihre eigene Seite oder eine Folgeseite scheitert;
  - scheitert nur eine Beilage, `fehler` mit dem Grund der Beilage, weil ohne sie die Verfügbarkeit fehlt (betrifft drei Anbieter);
  - bei `kandidaten` `fehler`, wenn ein relevanter Sammelkalender ausfällt (`adapterFailure` wie heute, nur noch für diese Einheit).

### E2 – Abruf je Einheit

- `fetchInputs` (`scripts/pipeline/io/fetch-inputs.ts`) ruft wie heute jede Seite einmal ab, auch eine Beilage, die in mehreren Einheiten steht. Pro Anbieter liefert es neu `units: FetchedUnit[]` statt eines Gesamttexts. Je Einheit: `id`, `status`, `reason`, `klasse` (E8), `pages: {url, text}[]`, `candidates`, `text`, `allowedUrls`.
- `assembleProvider` (`scripts/pipeline/lib/fetch.ts`) wird zu `assembleUnit`, mit derselben Logik für eine Einheit. `HashesFile` und `renderFetchMarkdown` zählen je Einheit; der Vergleich mit der Vornacht bleibt eine Messung.
- `FetchedProvider` (`scripts/pipeline/lib/refresh.ts`) behält `via`, `ownAdapter` und `adapterIssues` auf Anbieterebene und bekommt `units`.

### E3 – Schlüssel je Einheit

- `extractKey` (`scripts/pipeline/lib/normalize.ts`) bleibt, bekommt aber die Seiten bzw. Kandidaten **der Einheit**.
- Neue Funktion `unitExcerpt(provider, unit)`: der Eintrag ohne `notes` und mit `programme` gekürzt auf die Seiten der Einheit (eigene Seite und Beilagen). Sie ersetzt `catalogExcerpt` im Schlüssel. Eine geänderte `hint` einer Seite extrahiert dann nur deren Einheit neu. Venues, Name und `partChars` bleiben drin.
- Prompt, Schema und Modell gehen wie heute in den Schlüssel; `dated` bleibt je Einheit (iCal und Kandidaten).

### E4 – Zustand `ProviderRaw` Version 2

`scripts/pipeline/lib/raw.ts`, Export `schema/provider-raw.schema.json` über `pnpm schema:export`:

```ts
ProviderRawV2 = {
  version: 2,
  units: Record<UnitId, UnitState>,   // Schlüssel wie E1
}
UnitState = {
  events: RawEvent[],
  inputHash?, dated?, model?, changedAt?,   // nur zusammen, wie heute
  status: "ok" | "keine-termine" | "fehler",
  reason?,                                  // Pflicht bei fehler
  klasse?: "dauerhaft" | "gesperrt" | "voruebergehend",  // nur bei fehler aus dem Abruf
  checkedAt: Instant,
  failingSince?: Instant,                   // nur bei fehler
  emptySince?: Instant,                     // Einheit hatte künftige Events und hat keine mehr
  sources?: Source[],                       // nur bei kandidaten
  pending?: { inputHash, dated?, model, events },
}
```

- Die Regeln aus `ProviderRaw.superRefine` gelten je Einheit. Dazu: `klasse` nur bei `fehler`; `sources` nur bei `kandidaten`.
- **Status des Anbieters** wird nicht gespeichert, sondern berechnet (`providerStatus(raw)` in `scripts/pipeline/lib/raw.ts`):
  - `fehler`, wenn alle Einheiten `fehler` sind;
  - `keine-termine`, wenn keine Einheit Events hat;
  - sonst `ok`, mit der Zahl der Einheiten im Fehler als Zusatz.
- **Übergang:** `ProviderRaw` ist bis S5 die Vereinigung aus dem heutigen Schema (V1, ohne `version`) und V2. `data:validate` prüft beide.

### E5 – Regeln je Einheit

- `planRefresh` und `applyOutcome` (`scripts/pipeline/lib/refresh.ts`) arbeiten je Einheit mit denselben Regeln wie heute je Anbieter:
  - Abruffehler → alter Stand mit `fehler`, ohne neuen Schlüssel;
  - gleicher Schlüssel → unverändert;
  - `pending` mit gleichem Schlüssel → übernehmen;
  - leere Eingabe → leer;
  - sonst extrahieren;
  - Einbruch (`COLLAPSE_MIN_OLD` 3 Angebote, unter der Hälfte) → `pending`;
  - Einbruch ohne Fallback-Modell → zweiter Versuch mit ihm.

  `RefreshContext` bekommt `unit` und `prev: UnitState | undefined`. `prevOfferCount` gibt es nur noch für die Umstellung (E7).
- **Neue Einheit** (neue Seite im Katalog, ohne Vorzustand): extrahieren ohne Einbruchprüfung, wie heute ein neuer Anbieter mit Rohdatei.
- **Entfallene Einheit** (Seite nicht mehr im Katalog oder jetzt `blocked`): `refreshProvider` schreibt sie nicht mehr. Der Build ignoriert sie schon vorher (E6).
- **Entfernte Seite** (ADR 0033, Punkt 3): Scheitert die eigene Seite mit `klasse: dauerhaft`, und liegt `failingSince` mindestens 14 Kalendertage vor `today` (Europe/Berlin), setzt die Regel `events: []`. Status bleibt `fehler`, der Grund lautet „entfernt: <Grund> seit <Datum>“, `failingSince` bleibt. Kehrt die Seite zurück, wird sie normal extrahiert.
- **`emptySince`:**
  - gesetzt bei der Übernahme von Events ohne künftige Einheiten (`eventUnits` = 0), wenn der Vorzustand künftige hatte;
  - gelöscht, sobald die Einheit wieder künftige Events hat;
  - bleibt sonst unverändert stehen, auch über „unverändert“-Nächte.
- `refreshProvider` (`scripts/pipeline/io/refresh.ts`) bearbeitet die Einheiten eines Anbieters nacheinander und schreibt die Datei **einmal** am Ende. Nach einem Abbruch (Limit, Bremse, Zeitbudget) schreibt sie die fertigen Einheiten mit ihrem neuen Zustand und die übrigen mit dem alten; jede Einheit ist für sich gültig. Das Ergebnis meldet je Einheit ein `RefreshResult` wie heute und je Anbieter eine Zusammenfassung.

### E6 – Build je Einheit

- `batchesFromRaw` (`scripts/pipeline/lib/build-offers.ts`) liefert **einen Batch je Einheit** (`name` `<id>#<n>`, `checkedAt` der Einheit). `availability.checkedAt` eines Angebots ist damit die Prüfzeit seiner Seite.
- Einheiten, deren Kennung nicht mehr zum Katalog passt, entfallen mit Hinweis, wie heute Anbieter ohne Katalogeintrag.
- Der Status je Anbieter im `BuildInput` kommt aus `providerStatus`. `extracted` enthält Anbieter, bei denen eine Einheit `inputHash` hat. Schritt 7 („Übernahme aus dem Altbestand“) bleibt **unverändert**: Ausgefallene Einheiten tragen ihre alten Events selbst. Eine neue Übernahmeregel gibt es nicht.
- Dubletten zwischen Einheiten entfernt `dropSameSourceDuplicates` wie heute. S0 misst, ob das reicht (Ziel 2). Reicht es nicht, ergänzt ein Nachtrag vor S2 eine Regel nach dem Muster von `mergeParts`.

### E7 – Umstellung vom alten Format

- Liest `refreshProvider` eine V1-Datei, ist **jede** Einheit neu. Der Anbieter wechselt nur dann in V2, wenn in diesem Lauf alle seine Einheiten ein gültiges Ergebnis haben (extrahiert oder leer) und die Summe ihrer künftigen Angebote (`eventUnits`) nicht unter die Hälfte der alten fällt (bei mindestens 3 alten).
- Sonst bleibt die V1-Datei **unverändert**. Der Bericht nennt „Umstellung ausstehend“ mit Grund; der Wächter führt einen Einbruch bei der Umstellung als `einbruch`.
- Ein bestätigter Einbruch (Seite wirklich leerer) lässt sich nach Prüfung von Hand erzwingen: `pnpm pipeline nightly --only <id> --umstellen` übernimmt die Einheiten trotz Einbruch.
- Die Umstellung braucht höhere Grenzen. Dafür einmal `gh workflow run nightly.yml -f modus=live` mit `max_calls`, `max_tokens` und `budget_min` aus der Messung in S0, wie beim Modellwechsel (Skill, Abschnitt 5). Wer in einer Nacht nicht fertig wird, stellt in der nächsten um; bis dahin gilt sein alter Stand.

### E8 – Ein Abruf: User-Agent, robots.txt, Fehlerklasse

- **User-Agent** `Mozilla/5.0 (compatible; zwergenplan/1.0; +https://zwergenplan.app/impressum/)` für alle Abrufe in `scripts/pipeline/io/http.ts` und im Browser (`scripts/pipeline/io/browser.ts`, Kontext-Option). Das Impressum (`public/impressum/index.html`) bekommt einen Absatz: Zweck, Token `zwergenplan`, robots.txt wird beachtet, Kontakt.
- **robots.txt:** `scripts/pipeline/lib/robots.ts` (neu, rein) nach RFC 9309:
  - die Gruppe `zwergenplan` ersetzt `*`;
  - die längste passende Regel gilt, bei Gleichstand `Allow`;
  - Antwort 4xx → alles erlaubt; 5xx, 429 oder nicht erreichbar → alles gesperrt für diesen Lauf.

  Ein Cache je Host und Lauf liegt in `scripts/pipeline/io/robots.ts` (neu). Geprüft wird jede Station einer Weiterleitung und jede Folgeseite. Ist eine Seite gesperrt, scheitert sie mit „robots.txt sperrt <Pfad>“, `klasse: gesperrt`. Ist robots.txt nicht erreichbar, `klasse: voruebergehend`. Eine Zeile `Crawl-delay` wird befolgt, höchstens 10 s.
- **Fehlerklasse** `failureClass(reason)` (`scripts/pipeline/lib/fetch.ts`): HTTP 404/410 → `dauerhaft`; robots.txt oder Bot-Schutz → `gesperrt`; sonst `voruebergehend`. Der Grund bleibt Text wie heute.
- **Einschalten erst nach Messung** (S1): Ein Schalter `--abruf=alt|neu` hält das alte Verhalten, bis N1 entschieden ist. Danach entfallen Schalter und Browser-UA.

### E9 – Grenzen

- Nach der Umstellung (S4) setzt ein Commit `NIGHT_BRAKES`, `DEFAULT_BUDGET_MIN`, `CONCURRENCY` und `timeout-minutes` des Jobs `nachtlauf` auf das Doppelte des größten in sieben Nächten gemessenen Werts, aufgerundet. Bremsen schützen vor Schleifen, nicht vor Kosten (ADR 0033, Punkt 7).
- Laufzeit und Aufrufe je Einheit misst S0. `CallRecord` bekommt `unit` (wie `part`), damit `kosten.jsonl` je Seite zählt.

### E10 – Wächter

- **Befunde** berechnet `watchFindings(raws, catalog, today)` in `scripts/pipeline/lib/watch.ts` (neu, rein) aus dem Zustand, nicht aus dem Lauf. Arten:
  - `seite`: eine Einheit `fehler` mit `failingSince` mindestens einen Kalendertag vor `today`, also zwei Nächte. Ausgenommen sind die Fälle `entfernt` und `gesperrt`.
  - `entfernt`: Regel aus E5 hat gegriffen.
  - `gesperrt`: `klasse: gesperrt`, sofort.
  - `einbruch`: `pending` oder „Umstellung ausstehend“ wegen Einbruch.
  - `leer`: alle Einheiten des Anbieters haben `emptySince`, das späteste liegt höchstens 14 Tage zurück.
  - `anbieter`: alle Einheiten `fehler` seit mindestens einem Tag (eine Zeile statt einer je Seite).
- **Text:** `watchIssue(findings, today)` im selben Modul, als Liste (keine Tabelle). Je Befund: Anbieter-ID, Art, Seite, Grund, seit wann. Fremder Text (Gründe, URLs) steht nur in Code-Spans; Backticks und Zeilenumbrüche werden ersetzt, `@` entschärft. Je Zeile höchstens 200 Zeichen, gesamt unter 60 000. Letzte Zeile ist ein Marker `<!-- waechter: id:art,… -->`, der nur `^[a-z0-9:,-]*$` enthält. Plan 0050 hängt die Klärfälle des Entdeckens als weitere Art an.
- **Ablauf** in `.github/workflows/nightly.yml`:
  - Der Job `nachtlauf` schreibt `waechter.md` (`pnpm pipeline status --waechter`) und lädt sie als Artefakt `waechter` hoch.
  - Neuer Job `waechter`: `needs: [modus, nachtlauf, veroeffentlichen]`, `if: always() && needs.modus.outputs.modus == 'live' && needs.nachtlauf.result == 'success'`, `permissions: issues: write` und sonst nichts, kein Checkout. Schritte: `actions/download-artifact`, dann Shell mit `gh` und `jq`, immer `--repo "$GITHUB_REPOSITORY"`. `GH_TOKEN` nur in diesem Schritt, Werte über `env`, Text per `--body-file`, `continue-on-error: true` mit `::warning::`.
  - Logik:
    - Label `waechter` anlegen (`gh label create … --force`);
    - Issue suchen mit `gh issue list --app github-actions --label waechter --state all`;
    - ohne Befund das offene Issue schließen;
    - sonst bearbeiten, ein geschlossenes wiedereröffnen oder ein neues anlegen;
    - ein Kommentar, wenn der Marker ein Paar `id:art` enthält, das im alten fehlte.
- `staleHints` (`scripts/pipeline/lib/discover.ts`) entfällt.
- **Ampel:** `fehler` zählt für die 20-%-Regel nur, wenn der ganze Anbieter scheitert. Eine einzelne Seite im Fehler macht gelb.

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/robots.ts`, `scripts/pipeline/io/robots.ts` (neu) | robots.txt parsen und prüfen, Cache je Host | S1 |
| `scripts/pipeline/io/http.ts`, `scripts/pipeline/io/browser.ts`, `scripts/pipeline/io/fetch-inputs.ts` | User-Agent, robots.txt je Station und Folgeseite, Schalter `--abruf` | S1 |
| `scripts/pipeline/lib/fetch.ts` | `failureClass`; `assembleUnit` statt `assembleProvider`; Bericht je Einheit | S1, S2 |
| `public/impressum/index.html` | Absatz zum Abruf | S1 |
| `scripts/pipeline/lib/units.ts` (neu) | Einheiten, Kennung, Beilagen, `unitExcerpt` | S2 |
| `scripts/pipeline/lib/normalize.ts` | Schlüssel mit `unitExcerpt` | S2 |
| `scripts/pipeline/lib/raw.ts`, `schema/provider-raw.schema.json` | V2, `providerStatus`, Übergangsschema | S2, S5 |
| `scripts/pipeline/lib/refresh.ts`, `scripts/pipeline/io/refresh.ts` | Regeln je Einheit, entfernte Seite, `emptySince`, Umstellung | S2 |
| `scripts/pipeline/lib/extract.ts`, `scripts/pipeline/io/extract.ts` | `CallRecord.unit`; Eingabe je Einheit | S2 |
| `scripts/pipeline/lib/build-offers.ts` | Batch je Einheit, Status aus `providerStatus` | S2 |
| `scripts/pipeline/io/nightly.ts`, `scripts/pipeline/lib/report.ts`, `scripts/pipeline/lib/cost.ts` | Ablauf, Bericht und Ampel je Einheit; Grenzen | S2, S4 |
| `scripts/pipeline/io/eval.ts` | Eval-Fälle in Einheiten zerlegen (nach `## Seite k:` und Katalog), je Einheit extrahieren, vereinigen, werten wie heute | S2 |
| `scripts/pipeline/io/discover.ts`, `scripts/pipeline/lib/discover.ts` | Ertragsbeweis je Einheit; Bericht nennt Seiten ohne Ertrag; `staleHints` entfällt | S2, S3 |
| `scripts/pipeline/cli.ts` | `nightly --umstellen`, `--abruf`; `status --waechter`; `extract --from` je Einheit | S1–S3 |
| `scripts/validate-data.ts` | V1 und V2, Events je Einheit dem Anbieter zugehörig | S2 |
| `scripts/pipeline/lib/watch.ts` (neu) | `watchFindings`, `watchIssue` | S3 |
| `.github/workflows/nightly.yml`, `scripts/lib/nightly-workflow.test.ts` (neu) | Artefakt und Job `waechter`; Test der Rechte | S3 |
| `docs/architecture.md`, `CLAUDE.md` („Daten“), Skill (Abschnitte 1, 3, 5), ADR 0026 Statuszeile | Doku | S2–S5 |

## Tests (test-first)

- `lib/robots.test.ts`:
  - eigene Gruppe ersetzt `*`;
  - längste Regel, Gleichstand `Allow`;
  - leere Datei;
  - 4xx erlaubt, 5xx/429 sperrt;
  - Pfad mit Query und Prozent-Kodierung;
  - `Crawl-delay` gekappt.
- `io/http.test.ts`: User-Agent gesetzt; robots.txt je Weiterleitung geprüft; gesperrt → Fehler „robots.txt sperrt“.
- `lib/fetch.test.ts`:
  - `failureClass` für 404, 410, 500, Zeitüberschreitung, TLS, Bot-Schutz, robots.txt;
  - `assembleUnit` mit gescheiterter Beilage → `fehler`.
- `lib/units.test.ts`:
  - Kennung aus der Vorlage, nicht der ausgefüllten URL;
  - Beilagen in jeder Einheit;
  - `blocked` und `use: info` ausgenommen;
  - `coveredBy` nur `kandidaten`;
  - Reihenfolge;
  - `unitExcerpt` enthält nur die eigenen Seiten, und eine geänderte `hint` einer anderen Seite ändert ihn nicht.
- `lib/normalize.test.ts`: Schlüssel je Einheit; Kandidaten nur in `kandidaten`.
- `lib/raw.test.ts`:
  - V2-Regeln je Einheit;
  - `providerStatus` für alle, keine und einige Einheiten im Fehler;
  - V1 bleibt gültig bis S5.
- `lib/refresh.test.ts`:
  - jede heutige Regel je Einheit: unverändert, `pending` übernommen, leer, Einbruch, zweiter Versuch, Abruffehler;
  - neue Einheit ohne Einbruchprüfung;
  - entfallene Einheit nicht geschrieben;
  - entfernte Seite genau ab Tag 14, nur bei `dauerhaft`;
  - Rückkehr;
  - `emptySince` gesetzt, bleibt über „unverändert“, wird gelöscht.
- `io/refresh.test.ts`:
  - Abbruch nach zwei von drei Einheiten → zwei neue, eine alte, Datei gültig;
  - Umstellung: alle gelungen → V2, eine gescheitert → V1 unverändert, Einbruch → V1 unverändert mit Bericht, `--umstellen` → V2.
- `lib/build-offers.test.ts`:
  - Batch je Einheit mit eigenem `checkedAt`;
  - Dublette über zwei Einheiten → eine bleibt;
  - Einheit nicht mehr im Katalog → entfällt mit Hinweis;
  - Anbieter mit einer Einheit im Fehler → deren alte Events bleiben, neue der anderen kommen, keine ID fehlt;
  - Schritt 7 unverändert.
- `io/nightly.test.ts` mit Fake-Abruf über **vier Nächte** (Ziel 1):
  - Nacht 1: Seite B fällt aus (404), Seite A bringt einen neuen Kurs → er erscheint, alle IDs von B bleiben;
  - Nacht 2: gleich → unverändert, kein Modellaufruf;
  - Nacht 15: entfernt → Bs Angebote fehlen, Wächter meldet;
  - Rückkehr → B extrahiert, IDs von B per Zuordnung zurück.
- `io/eval.test.ts`: Fall mit zwei Seiten und Beilage wird in Einheiten zerlegt und vereinigt gewertet.
- `lib/watch.test.ts`:
  - `seite` erst ab dem zweiten Kalendertag;
  - `gesperrt` sofort;
  - `entfernt`;
  - `einbruch` aus `pending`;
  - `leer` nur, wenn alle Einheiten leer sind, 14 Tage;
  - `anbieter` statt je Seite;
  - Text nur in Code-Spans, ohne Backticks, Zeilenumbrüche und `@`;
  - Marker geprüft;
  - Längen;
  - leere Befunde → leerer Text.
- `scripts/lib/nightly-workflow.test.ts` (Muster `scripts/lib/push-schedule.test.ts`):
  - `waechter` hat genau `issues: write`, keinen Checkout, `always()`, `--repo`, `--body-file`, `--app github-actions`;
  - `nachtlauf` hat kein Schreibrecht.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected` (Daten und Schema zusätzlich mit `--smoke`). S1, S2 und S3 mit `/arch-review`; S1 wegen des Impressums mit `/browser-review` der Impressumsseite.

- **S0 – Messen (ohne Änderung im Repo, Wegwerf-Skripte im Job-Verzeichnis).**
  1. **Einheit gegen Anbieter:** Für alle Anbieter mit mehr als einer Seite auf `main` werden die Eingaben eines Abrufs (`pnpm pipeline fetch`) zweimal extrahiert, je Anbieter wie heute und je Einheit nach E1, mit dem gewählten Modell, je zwei Läufe. Beide Varianten laufen durch `buildOffers` gegen `data/offers.json`. Verglichen werden je Anbieter:
     - Angebote;
     - Vorstand-IDs wiedergefunden;
     - Dubletten (gleicher Ort, gleicher Beginn, ähnlicher Titel);
     - Aufrufe, Tokens, Dauer.

     Ergebnis in den Abschnitt „Umsetzung“. Verfehlt ein Anbieter Ziel 2, wird die Ursache benannt (fehlender Kontext einer anderen Seite, Dublette mit anderem Titel), und ein Nachtrag regelt sie vor S2.
  2. **Laufzeit der Umstellung:** Aufrufe und Minuten einer vollen Nacht je Einheit, daraus die Grenzen für E7.
- **S1 – Ein Abruf (E8).**
  - robots.txt, User-Agent, Fehlerklasse, Impressum, Schalter `--abruf` (Standard `alt`).
  - Messung mit `--abruf=neu` über alle Katalogseiten: gesperrte Seiten, Seiten, die mit dem neuen User-Agent anders antworten (Status, Länge ±20 %), Bot-Schutz. Ergebnis in „Umsetzung“, dann N1.
  - Danach Standard `neu`, Schalter und Browser-UA entfernt.
- **S2 – Einheit Seite (E1–E7).**
  - Code mit Tests, Eval je Einheit. Vor dem Push: ein Eval-Lauf je Einheit gegen die letzte Zeile in `evals/results.md` (Ziel 2), dazu `pnpm pipeline nightly --dry-run` lokal über alle Anbieter. Verglichen wird `data/offers.json` des Trockenlaufs mit `main`: Angebote je Anbieter, verlorene IDs.
  - Dann Deploy und die Umstellung per `workflow_dispatch` mit den Grenzen aus S0. Abnahme: Ziel 5 nach höchstens drei Nächten.
- **S3 – Wächter (E10).** Abnahme:
  - Das Issue entsteht bei einem echten Befund oder einem gestellten: `--only` auf einen Anbieter, dessen Seite per Katalogkopie im Trockenlauf scheitert. Das Issue selbst entsteht nur live.
  - Es schließt sich, wenn nichts offen ist.
- **S4 – Grenzen (E9)** nach sieben Nächten im neuen Format.
- **S5 – Abschluss.**
  - Sind alle Rohdateien V2, entfallen V1-Schema und Umstellungscode.
  - Eine Woche Bericht mit den Zielen 1, 3 und 5.
  - ID-Wechsel neu messen (Nicht-Ziele).
  - Live-Prüfung (CI grün, `meta.json`).
  - Restpunkte nach `docs/ideas.md`; Statuszeile von ADR 0026; Plan archivieren.

## Nutzerentscheide (offen)

- **N1 – Seiten, die robots.txt sperrt oder die den neuen User-Agent abweisen** (nach der Messung in S1). Empfehlung: robots.txt achten; eine gesperrte Seite bekommt `blocked` mit Grund, und der Anbieter wird über den Seitenfinder (Plan 0049) oder von Hand anders erschlossen. Alternative: eine Ausnahme je Seite im Katalog mit Begründung. Entscheidet nur, wenn die Messung Seiten findet.
- **N2 – Entfernte Seite nach 14 Tagen** (ADR 0033, Punkt 3). Empfehlung: ja, wie im ADR. Alternative: Bestand bleibt unbegrenzt wie heute, und nur der Wächter meldet.

## Kosten

Nach Nutzervorgabe kein Kriterium. Die Umstellung extrahiert einmal alles neu. Danach extrahiert eine Nacht nur Einheiten mit geänderter Seite statt ganzer Anbieter. Mehr Aufrufe kosten kleine Einheiten mit festem Anteil an Prompt und Katalog, die heute zusammen in einem Aufruf liefen. S0 misst die Bilanz.

## Risiken

- **Fehlender Kontext zwischen Seiten:** Eine Seite nennt den Kurs, eine andere Zeit oder Ort. Abhilfe:
  - Beilage für `use: verfuegbarkeit`;
  - S0 misst je Anbieter;
  - ein Nachtrag vor S2 regelt gefundene Fälle;
  - Venues und Hinweise der Seite stehen im Auszug.
- **Dubletten zwischen Seiten mit verschiedenen Titeln** (Übersicht und Detailseite). Abhilfe: S0 misst; `dropSameSourceDuplicates`; bei Bedarf eine Regel wie `mergeParts` (E6).
- **Umstellung bleibt hängen** (ein Anbieter mit dauerhaft scheiternder Einheit). Abhilfe: Bericht „Umstellung ausstehend“, Wächter, `--umstellen` nach Prüfung. S5 wartet, bis alle umgestellt sind.
- **robots.txt kostet Seiten.** Abhilfe: Messung vor dem Einschalten, N1.
- **Entfernte Seite war nur lange kaputt.** Abhilfe: 14 Tage Meldung vorher; die Rückkehr extrahiert neu. Die Zuordnung der IDs vergleicht nur mit der Vornacht. Kehrt eine Seite nach Tag 14 zurück, bekommen ihre Angebote deshalb neue IDs, und alte Links und Merklisten-Einträge darauf laufen ins Leere. Das ist bewusst so: Ein Link ins Leere ist besser als einer auf einen Kurs, der nicht mehr gilt. N2 lässt den Nutzer anders entscheiden.
- **Issue als Angriffsfläche:** eigener Job mit nur `issues: write`, kein Checkout, Text als Datei, fremder Text nur in Code-Spans, geprüfter Marker.
