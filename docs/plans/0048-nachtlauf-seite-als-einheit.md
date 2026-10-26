# Plan 0048 – Nachtlauf: die Programmseite als Einheit, ein Wächter, ein Abruf

Status: Review eingearbeitet
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`): Punkte 1 (ein Abruf), 2 (Einheit Seite), 3 (Zustand und Gesundheit), 5 (Wächter) und 7 (Grenzen nach Qualität). Dieser Plan setzt sie um.
- Ersetzt Plan 0047 (`docs/plans/archiv/0047-neue-angebote-zuverlaessig.md`). Dessen Messungen gelten weiter. Übernommen werden die Diagnose zu `carryReason`/`statusOf` und der abgeschottete Job für das Issue.
- ADR 0026, Punkte 2, 4 und 5; ADR 0022 und ADR 0031 (stabile IDs); Plan 0032, E3–E6 (Abruf, Schlüssel, Zustand, Bericht); Plan 0038 (Zuordnung, Restpunkte in `docs/ideas.md`).
- Skill `babyevents-nuernberg`, Abschnitte 1 (Bericht sichten), 3 (Katalog pflegen) und 5 (Modell wechseln).

## Voraussetzungen

- **Doku auf `main`:** Vor S1 kommen ADR 0033, die Pläne 0045–0050 (0045 und 0047 im Archiv) und die Pläne, auf die sie verweisen (etwa 0039 und 0042), als reiner Doku-Commit nach `main`. `node scripts/check-docs.ts` auf `main` ist grün.
- **Basis `main`.** Umgesetzt wird auf einem eigenen Branch von `main`.
- **Konflikt mit Branch `plan-0039`:** Plan 0042 ändert dort `scripts/pipeline/io/fetch-inputs.ts` und `scripts/pipeline/lib/fetch.ts` (`follow`, `withFollowPages`, `siteOf`) und bringt `partChars`. Kommt `plan-0039` zuerst auf `main`, baut S1 darauf auf. Sonst löst der spätere Rebase von `plan-0039` die Konflikte; Folgeseiten gehören dann zur Einheit ihrer Programmseite (E1).
- **Katalogfehler:** erledigt. `die-familienbox` steht seit `84a2bad` (2026-10-26) unter der neuen URL; `zentrum-kobergerstrasse` hat sich selbst erholt (TLS wieder gültig, Nachtlauf 2026-10-26 ohne Fehler).
- **Modell gewählt, nicht gewechselt:** Eval nach Skill, Abschnitt 5, mit Sonnet und Opus, je zwei Läufe, Entscheidung nach Recall. Gewechselt wird **mit der Umstellung in S1** (E7). So gibt es nur eine Neuextraktion und nur eine Gelegenheit, IDs zu verlieren (ADR 0033, Konsequenz „IDs“).

## Anlass

Der Nutzer will vor allem, dass neue Angebote bekannter Anbieter zuverlässig auftauchen und ein Ausfall nicht still bleibt (2026-10-25). Kosten sind kein Kriterium, auch das Kontingent nicht (2026-10-26). Das Gesamt-Review vom 2026-10-25 zeigte: Die Sonderlogik des Vorgängerplans 0047 stammt daher, dass Abruf, Schlüssel und Zustand je Anbieter gelten. ADR 0033 macht deshalb die Programmseite zur Einheit.

## Ausgangslage (gemessen 2026-10-25/26)

- **Seiten je Anbieter** (`data/providers.yaml` auf `plan-0039`, alle Regionen): 107 abgerufene Anbieter.
  - 60 haben eine Seite, 47 mehrere; das sind 185 von 245 Seiten.
  - Die meisten Seiten haben `studio-herzschlag` (14), `fbs-nuernberg` (12), `zoff-harmonie` (8) und `die-familienbox` (7).
  - Drei Anbieter haben Seiten mit `use: verfuegbarkeit`: `hebamme-eva-kauper-wunderwerk`, `dance-maxx-nuernberg`, `wolf-pack-yoga`.
  - 97 Seiten tragen einen `hint`.
  - Seitenarten: 192 `html`, 32 `html` mit Browser, 10 `ical`, 6 `json-api`, 5 `pdf`.
- **Ein Seitenausfall sperrt den Anbieter:** `assembleProvider` (`scripts/pipeline/lib/fetch.ts`) setzt bei der ersten gescheiterten Seite `fehler`. `failed()` (`scripts/pipeline/lib/refresh.ts`) behält dann den alten Stand. Neue Kurse der übrigen Seiten kommen nicht an (`die-familienbox` vom 2026-10-22 bis 2026-10-26).
- **`sourceUrl` ist nicht verlässlich:** Bei `die-familienbox` tragen alle 24 Events die erste Seite.
- **Teile und Dubletten heute:**
  - `splitInput` und `mergeParts` (`scripts/pipeline/lib/split.ts`) zerlegen große Eingaben und vereinigen sie wieder. `mergeParts` legt dabei dasselbe Angebot aus zwei Teilen zusammen, **bevor** der Build läuft.
  - Schritt 3 des Builds (`scripts/pipeline/lib/build-offers.ts`, gleicher Fensterschlüssel) bricht mit einem Fehler ab, wenn ein regelmäßiges Angebot mit gleichem Titel und Ort aus zwei gleichrangigen Quellen andere Merkmale hat. Dann wird kein `data/offers.json` geschrieben.
  - `dropSameSourceDuplicates` (Schritt 4b) läuft erst danach.
- **Katalogauszug:** `catalogExcerpt` (`scripts/pipeline/lib/normalize.ts`) enthält den ganzen Eintrag samt aller `hint`. Er steckt im Schlüssel **und** in der Nachricht ans Modell (`extractMessage`, `scripts/pipeline/lib/extract.ts`).
- **IDs bei einer Neuextraktion** (Probe 2026-10-26, `die-familienbox` mit neuer URL, Sonnet statt Haiku): Nur 16 von 24 IDs blieben, obwohl es meist dieselben Kurse waren. Die Gründe:
  - **Kürzere Reihe:** 38 statt 53 künftige Termine. Die Reihe ist ein Anfangsstück der alten, aber nur 0,72 der Beginnzeiten stimmen überein; Stufe 1 verlangt 0,8.
  - **Formatwechsel** `kurs`/`regelmaessig`, den Stufe 2 nicht zulässt.
  - **Geänderte Altersangabe.**
- **Meldung:** Die Ampel wird gelb bei einem Ausfall und rot erst über 20 % (`scripts/pipeline/lib/report.ts`). `staleHints` meldet nach 14 Tagen im Bericht des Entdeckens. Ein Issue gibt es nicht.
- **Abruf:** Browser-User-Agent (`UA` in `scripts/pipeline/io/http.ts`), kein robots.txt. Je Lauf höchstens 4 Abrufe gleichzeitig, 2 je Host (`LIMITS` in `scripts/pipeline/io/fetch-inputs.ts`). Nominatim sperrt `/search` per robots.txt für alle Crawler (abgerufen 2026-10-26), erlaubt die API aber nach seiner Usage Policy.
- **Impressum:** Es entsteht aus `imprintPage()` in `scripts/lib/share-pages.ts`; `public/impressum/` ist gitignored.
- **Grenzen:** `NIGHT_BRAKES` 150 Aufrufe und 3 Mio. Tokens (`scripts/pipeline/lib/cost.ts`), `DEFAULT_BUDGET_MIN` 50 (`scripts/pipeline/io/nightly.ts`), `CONCURRENCY` 3 Anbieter. Zeitbudget und Bremse prüft der Lauf nur vor jedem Anbieter. Der Job `nachtlauf` hat fest `timeout-minutes: 90` (`.github/workflows/nightly.yml`).

## Ziel

1. **Seitenausfall kostet nur die Seite.** Fällt eine von mehreren Seiten aus, erscheinen in **derselben Nacht** neue Angebote der übrigen Seiten. Keine ID aus dem Vorstand der ausgefallenen Seite fehlt, solange der Ausfall vorübergehend ist oder weniger als 14 Tage ununterbrochen `dauerhaft`. Gemessen mit einem Test über mehrere Nächte und in der Woche nach S1 im Bericht (verlorene IDs bei Anbietern mit ausgefallener Seite: 0).
2. **Nicht schlechter als heute.** Die Extraktion je Einheit wird mit der Extraktion je Anbieter verglichen, mit demselben Modell (S0, je zwei Läufe). Bedingungen:
   - Sie liefert mindestens so viele Angebote des Vorstands wieder (Recall gegen `data/offers.json`, höchstens 1 Prozentpunkt darunter).
   - Sie hat höchstens 1 Prozentpunkt mehr Dubletten (gleicher Anbieter, Ort und Beginn, ähnlicher Titel).
   - Kein Build-Fehler.
   - Kein Anbieter hat mehr als 10 % weniger Angebote ohne erklärten Grund.
3. **Kein stiller Ausfall.** Im Wächter-Issue stehen:
   - jede Seite, die an zwei aufeinanderfolgenden Kalendertagen scheitert;
   - jede entfernte Seite;
   - jede Seite, die robots.txt sperrt;
   - jeder zurückgehaltene Einbruch;
   - jeder Anbieter, der keine künftigen Angebote mehr hat (14 Tage lang);
   - jede noch nicht umgestellte Rohdatei.

   Ist nichts offen, ist das Issue geschlossen.
4. **Ein Abruf.** Jeder Seitenabruf nennt uns im User-Agent und beachtet robots.txt. Wie viele Katalogseiten das kostet, ist vor dem Einschalten gemessen und entschieden (S3, N1).
5. **Umstellung ohne Verlust.** Nach höchstens drei Nächten der Umstellung steht jeder Anbieter im neuen Format oder steht mit Grund im Wächter.
6. **IDs halten.** Bei der Umstellung behalten mindestens 95 % der Angebote, deren Kurs es weiter gibt, ihre ID. „Derselbe Kurs“ heißt: gleicher Anbieter und Ort, gleicher erster künftiger Beginn auf die Minute oder gleiche Wochentage und Uhrzeiten. Gemessen in S0 offline und nach der Umstellung im Bericht.

## Nicht-Ziele

- **Neue Programmseiten finden:** Plan 0049 (Seitenfinder).
- **Neue Anbieter:** Plan 0050.
- **Plätze per Rezept:** Plan 0046, zurückgestellt.
- **ID-Wechsel bei Umformulierung von Nacht zu Nacht** (103 in 12 Nächten, Plan 0047): E11 behandelt nur die Fälle, die bei einer Neuextraktion auftreten (kürzere oder längere Reihe, Formatwechsel). Andere Fälle werden nach S1 neu gemessen, dann folgt bei Bedarf ein eigener Plan.
- **`checkedAt` je Event:** `checkedAt` wird je Einheit genauer (E6), mehr nicht.
- **`Crawl-delay`:** später, wenn eine Website es verlangt.

## Entscheidungen

### E1 – Einheit

- **Einheit** (`scripts/pipeline/lib/units.ts`, neu, rein):
  - je Programmseite mit `use: termine` ohne `blocked`, samt ihrer Folgeseiten (`follow`, sobald Plan 0042 auf `main` ist);
  - dazu als **Beilage** alle Seiten mit `use: verfuegbarkeit` ohne `blocked` desselben Anbieters;
  - die Kandidaten der Sammelkalender als Einheit `kandidaten`. Sie besteht, wenn der Anbieter in dieser Nacht Kandidaten hat, wenn er nur über Kandidaten läuft (`coveredBy`, `skipCrawl`) oder wenn der Vorzustand sie hat. Ohne Kandidaten in dieser Nacht gilt sie als leere Eingabe; der Einbruchschutz greift wie bei jeder Einheit (E5).
- **Kennung:** `seite:<URL aus dem Katalog>`, also die **Vorlage** mit `{von}`/`{bis}`, nicht die ausgefüllte URL, damit sie über die Nächte gleich bleibt. Bei `request` kommt `#<die ersten 8 Zeichen des SHA-256 des Bodys>` dazu. Für die Sammelkalender heißt die Einheit `kandidaten`.
- **Geänderte URL im Katalog:** Die Einheit mit der alten Kennung bleibt in Zustand und Build, bis jede Seite des Anbieters eine Einheit mit `inputHash` hat. Dann entfällt sie. So kostet eine neue URL, die noch scheitert, keine Angebote.
- **Reihenfolge:** wie im Katalog, `kandidaten` zuletzt. Sie bestimmt die Reihenfolge in `mergeParts` und die Batches im Build (E6).
- **Eingabe je Einheit:**
  - `## Seite 1: <url> (<art>)` für die eigene Seite, dann die Beilagen als weitere `## Seite k:`;
  - bei `kandidaten` der Abschnitt `## Kandidaten (n)` wie heute.

  `MAX_INPUT_CHARS` gilt je Einheit. Große Einheiten zerlegt `splitInput` wie heute (`partChars` je Einheit).
- **Status der Einheit:**
  - `fehler`, wenn ihre eigene Seite oder eine Folgeseite scheitert;
  - scheitert nur eine Beilage, ebenfalls `fehler`, mit dem Grund der Beilage (betrifft drei Anbieter);
  - bei `kandidaten` `fehler`, wenn ein relevanter Sammelkalender ausfällt (`adapterFailure` wie heute, nur noch für diese Einheit).

### E2 – Abruf je Einheit

- `fetchInputs` (`scripts/pipeline/io/fetch-inputs.ts`) ruft jede Seite einmal ab, wie heute, auch eine Beilage, die in mehreren Einheiten steht. Je Anbieter liefert es `units: FetchedUnit[]` statt eines Gesamttexts: `id`, `status`, `reason`, `klasse` (E8), `pages: {url, text}[]`, `candidates`, `text`, `allowedUrls`.
- `assembleProvider` (`scripts/pipeline/lib/fetch.ts`) wird zu `assembleUnit`, mit derselben Logik für eine Einheit. `HashesFile` und `renderFetchMarkdown` zählen je Einheit.
- `FetchedProvider` (`scripts/pipeline/lib/refresh.ts`) behält `via`, `ownAdapter` und `adapterIssues` auf Anbieterebene und bekommt `units`.

### E3 – Schlüssel und Nachricht je Einheit

- Neue Funktion `unitExcerpt(provider, unit)` (`scripts/pipeline/lib/units.ts`): der Eintrag ohne `notes`, `programme` gekürzt auf die Seiten der Einheit (eigene Seite und Beilagen, samt `hint`). Venues, Name, `availability` und `partChars` bleiben drin. Bei `kandidaten` bleibt `programme` leer.
- `unitExcerpt` ersetzt `catalogExcerpt` **im Schlüssel und in der Nachricht ans Modell** (`extractMessage`). Ein Test prüft, dass beide denselben Auszug nutzen. Eine geänderte `hint` extrahiert so nur ihre Einheit neu, und das Modell sieht nur die Hinweise seiner Seite.
- `extractKey` (`scripts/pipeline/lib/normalize.ts`) bleibt, bekommt aber die Seiten bzw. Kandidaten der Einheit. Prompt, Schema und Modell gehen wie heute in den Schlüssel; `dated` bleibt je Einheit.

### E4 – Zustand `ProviderRaw` Version 2

`scripts/pipeline/lib/raw.ts`, Export `schema/provider-raw.schema.json` über `pnpm schema:export`:

```ts
ProviderRawV2 = {
  version: 2,
  units: Record<UnitId, UnitState>,   // Kennung wie E1
}
UnitState = {
  events: RawEvent[],
  inputHash?, dated?, model?, changedAt?,   // nur zusammen, wie heute
  status: "ok" | "keine-termine" | "fehler",
  reason?,                                  // Pflicht bei fehler
  klasse?: "dauerhaft" | "gesperrt" | "voruebergehend",  // nur bei fehler aus dem Abruf
  klasseSince?: Instant,                    // Beginn der aktuellen Klasse, nur mit klasse
  checkedAt: Instant,
  failingSince?: Instant,                   // nur bei fehler
  emptySince?: Instant,                     // Events vorhanden, aber keine künftigen (E5)
  sources?: Source[],                       // nur bei kandidaten
  pending?: { inputHash, dated?, model, events },
}
```

- Die Regeln aus `ProviderRaw.superRefine` gelten je Einheit. Dazu kommen: `klasse` und `klasseSince` nur gemeinsam und nur bei `fehler`; `sources` nur bei `kandidaten`.
- **Status des Anbieters** wird berechnet, nicht gespeichert (`providerStatus(raw)` in `scripts/pipeline/lib/raw.ts`):
  - `fehler`, wenn alle Einheiten `fehler` sind;
  - `keine-termine`, wenn keine Einheit Events hat;
  - sonst `ok`, dazu die Zahl der Einheiten im Fehler.
- **Übergang:** `ProviderRaw` ist bis S5 die Vereinigung aus dem heutigen Schema (V1, ohne `version`) und V2. `data:validate` prüft beide.
- **Rückweg:** Alter Code kann V2 nicht lesen. Muss S1 zurück, werden die Code-Commits **und** die Daten-Commits der Nächte seit dem Deploy per `git revert` zurückgenommen. Die V1-Dateien kommen so zurück; das steht im Skill, Abschnitt 1.

### E5 – Regeln je Einheit

- `planRefresh` und `applyOutcome` (`scripts/pipeline/lib/refresh.ts`) arbeiten je Einheit mit denselben Regeln wie heute je Anbieter:
  - Abruffehler → alter Stand mit `fehler`, ohne neuen Schlüssel;
  - gleicher Schlüssel → unverändert;
  - `pending` mit gleichem Schlüssel → übernehmen;
  - leere Eingabe → leer;
  - sonst extrahieren;
  - Einbruch → `pending`; ohne Fallback-Modell zuerst ein zweiter Versuch mit ihm.

  `RefreshContext` bekommt `unit` und `prev: UnitState | undefined`. `prevOfferCount` gibt es nur noch für die Umstellung (E7).
- **Einbruch je Einheit:**
  - heutige Regel: mindestens 3 alte künftige Angebote, und es bleibt weniger als die Hälfte;
  - **neu:** mindestens 1 altes und 0 neue. So löscht eine leere Antwort auf einer kleinen Seite keine Angebote samt IDs.
- **Neue Einheit** (neue Seite im Katalog, ohne Vorzustand): extrahieren ohne Einbruchprüfung, wie heute ein neuer Anbieter.
- **Entfallene Einheit:** siehe E1, „geänderte URL“. Eine Seite, die nur gestrichen oder `blocked` wurde, entfällt sofort.
- **Fehlerklasse über die Nächte:** Bleibt die Klasse gleich, bleibt `klasseSince`. Wechselt sie, beginnt `klasseSince` neu. `failingSince` zählt die ganze Fehlerserie wie heute.
- **Entfernte Seite** (ADR 0033, Punkt 3): Bei `klasse: dauerhaft` und `klasseSince` mindestens 14 Kalendertage vor `today` (Europe/Berlin, `berlinIsoDate`) setzt die Regel `events: []`. Status bleibt `fehler`, Grund „entfernt: <Grund> seit <Datum>“. Kehrt die Seite zurück, wird sie normal extrahiert.
- **`emptySince`:** gesetzt in **jedem** Pfad, auch bei „unverändert“, sobald die Einheit Events hat, aber keine mit künftigem Termin (`eventUnits` = 0). Gelöscht, sobald es wieder künftige gibt. Eine unveränderte Seite, deren Kurse ablaufen, fällt so auf.
- `refreshProvider` (`scripts/pipeline/io/refresh.ts`):
  - bearbeitet die Einheiten eines Anbieters nacheinander;
  - fragt vor jeder Einheit `mayContinue()` (Zeitbudget, Bremse, Abbruch);
  - schreibt die Datei **einmal** am Ende. Nach einem Abbruch schreibt sie die fertigen Einheiten neu und die übrigen mit altem Zustand; jede Einheit ist für sich gültig;
  - meldet je Einheit ein `RefreshResult` wie heute und je Anbieter eine Zusammenfassung.

### E6 – Build je Einheit

- `batchesFromRaw` (`scripts/pipeline/lib/build-offers.ts`):
  - vereinigt je Anbieter die Events aller Einheiten mit `mergeParts`, in Katalogreihenfolge (E1), wie heute die Teile einer großen Eingabe. Dasselbe Angebot von zwei Seiten wird so vor Schritt 3 zusammengelegt, und der Build bricht nicht ab;
  - legt jedes übrige Event in den Batch seiner Einheit (`name` `<id>#<nn>` mit Katalogindex, zweistellig mit Null aufgefüllt; `checkedAt` der Einheit). `availability.checkedAt` eines Angebots ist damit die Prüfzeit seiner Seite;
  - lässt Einheiten, deren Kennung nicht mehr zum Katalog passt, nach E1 („geänderte URL“) stehen oder mit Hinweis entfallen.
- Der Status je Anbieter im `BuildInput` kommt aus `providerStatus`. `extracted` enthält Anbieter, bei denen eine Einheit `inputHash` hat.
- Schritt 7 („Übernahme aus dem Altbestand“) bleibt **unverändert**: Ausgefallene Einheiten tragen ihre alten Events selbst.
- Das Eval (`scripts/pipeline/io/eval.ts`) vereinigt die Einheiten eines Falls ebenso mit `mergeParts`, bevor es wertet.

### E7 – Umstellung vom alten Format, zusammen mit dem Modellwechsel

- Die Umstellung kommt mit dem Commit, der `LLM_MODEL_EXTRACT` (und bei Bedarf `LLM_MODEL_FALLBACK`) in beiden Workflows auf das gewählte Modell setzt (Skill, Abschnitt 5).
- Liest `refreshProvider` eine V1-Datei, ist **jede** Einheit neu. Der Anbieter wechselt nur dann in V2, wenn in diesem Lauf
  - alle Einheiten ein gültiges Ergebnis haben (extrahiert oder leer) und
  - die Summe ihrer künftigen Angebote (`eventUnits`) nicht unter die Hälfte der alten fällt (bei mindestens 3 alten).
- Sonst bleibt die V1-Datei **unverändert**. Der Bericht nennt „Umstellung ausstehend“ mit Grund, und der Wächter meldet jede V1-Datei (E10).
- **Erzwingen nach Prüfung:** Die neue Eingabe `umstellen` von `nightly.yml` gibt `--umstellen <id,…>` an `pipeline nightly` weiter. Das stellt diese Anbieter auch bei einem Einbruch oder mit einer dauerhaft scheiternden Seite um; die Einheit dieser Seite beginnt dann leer mit `fehler`. Daten schreibt so weiter nur der Workflow, nie ein lokaler Lauf (CLAUDE.md, „Daten“).
- **Grenzen der Umstellung:**
  - `nightly.yml` bekommt die Eingabe `timeout` (Standard 90) für `timeout-minutes` des Jobs `nachtlauf`;
  - die Umstellung läuft per `workflow_dispatch` mit `timeout`, `budget_min`, `max_calls` und `max_tokens` aus S0;
  - `budget_min` bleibt mindestens 20 Minuten unter `timeout`.

  Wer in einer Nacht nicht fertig wird, stellt in der nächsten um; bis dahin gilt sein alter Stand.

### E8 – Ein Abruf: User-Agent, robots.txt, Fehlerklasse

- **User-Agent** `Mozilla/5.0 (compatible; zwergenplan/1.0; +https://zwergenplan.app/impressum/)` für alle Seitenabrufe in `scripts/pipeline/io/http.ts` und im Browser (`scripts/pipeline/io/browser.ts`, Kontext-Option). Nominatim bekommt denselben Kontakt (`scripts/pipeline/io/geocode.ts`).
- **Impressum:** Ein Absatz zum Abruf in `imprintPage()` (`scripts/lib/share-pages.ts`): Zweck, Token `zwergenplan`, robots.txt wird beachtet, Kontakt. Test in `scripts/lib/share-pages.test.ts`. `/browser-review` der Impressumsseite lokal und nach dem Deploy live.
- **robots.txt:** `scripts/pipeline/lib/robots.ts` (neu, rein) nach RFC 9309:
  - die Gruppe `zwergenplan` ersetzt `*`; gleiche Gruppen werden zusammengeführt;
  - die längste passende Regel gilt, bei Gleichstand `Allow`; Muster mit `*` und `$`;
  - Antwort 4xx → alles erlaubt; 5xx, 429 oder nicht erreichbar → alles gesperrt für diesen Lauf.

  Ein Cache je Host und Lauf liegt in `scripts/pipeline/io/robots.ts` (neu); Weiterleitungen der robots.txt selbst werden verfolgt.
- **Wo geprüft wird:** nur bei **Seitenabrufen**, nicht in `fetchJson` allgemein. Das sind:
  - `fetchTask` und `withFollowPages` (jede Station einer Weiterleitung);
  - der Browser (Navigationen über `page.route`);
  - die Sammelkalender (`scripts/pipeline/io/sources.ts`);
  - später Seitenfinder und Quellen des Entdeckens (Pläne 0049, 0050).

  **Ausgenommen** sind APIs mit eigenen Nutzungsregeln: Nominatim, OpenHolidays, GTFS-Feeds. Die Liste steht im Code mit Begründung, ein Test hält sie fest.
- Eine gesperrte Seite scheitert mit „robots.txt sperrt <Pfad>“, `klasse: gesperrt`. Ist robots.txt nicht erreichbar, gilt `klasse: voruebergehend`.
- **Fehlerklasse** `failureClass(reason)` (`scripts/pipeline/lib/fetch.ts`): HTTP 404/410 → `dauerhaft`; robots.txt → `gesperrt`; sonst `voruebergehend`, auch Bot-Schutz.
- **Einschalten erst nach Messung** (S3): Ein Schalter `--abruf=alt|neu` (Standard `alt`, Eingabe `abruf` in `nightly.yml`) hält das alte Verhalten, bis N1 entschieden ist. Danach entfallen Schalter und Browser-UA.

### E9 – Grenzen

- **Ab S1** gilt: `timeout-minutes` aus der Eingabe (E7). `mayContinue` prüft Zeitbudget und Bremse vor jeder Einheit, nicht nur vor jedem Anbieter.
- **Nach sieben Nächten im neuen Format (S4):** Ein Commit setzt `NIGHT_BRAKES`, `DEFAULT_BUDGET_MIN`, `CONCURRENCY` und den Standard von `timeout` auf das Doppelte des größten gemessenen Werts, aufgerundet. Bremsen schützen vor Schleifen, nicht vor Kosten (ADR 0033, Punkt 7).
- `CallRecord` bekommt `unit` (wie `part`), damit `kosten.jsonl` je Seite zählt.

### E10 – Wächter

- **Befunde** berechnet `watchFindings({ raws, catalog, today, discoverStates? })` in `scripts/pipeline/lib/watch.ts` (neu, rein) aus dem Zustand. `today` kommt aus `nightly.json`; Kalendertage rechnet `berlinIsoDate`. Arten:
  - `seite`: Einheit `fehler` mit `failingSince` mindestens einen Kalendertag vor `today` (zwei Nächte), außer `entfernt` und `gesperrt`;
  - `entfernt`: die Regel aus E5 hat gegriffen;
  - `gesperrt`: `klasse: gesperrt`, sofort;
  - `einbruch`: `pending`;
  - `leer`: keine Einheit des Anbieters hat künftige Events, mindestens eine hat `emptySince`, und das späteste liegt höchstens 14 Tage zurück;
  - `anbieter`: alle Einheiten `fehler` seit mindestens einem Tag (eine Zeile statt einer je Seite);
  - `umstellung`: Rohdatei noch V1.

  `discoverStates` bleibt in diesem Plan leer; Plan 0050 hängt die Art `klaerfall` an.
- **Text:** `watchIssue(findings, today)` im selben Modul, als Liste (keine Tabelle).
  - Je Befund: Anbieter-ID, Art, Seite, Grund, seit wann.
  - Fremder Text (Gründe, URLs) nur in Code-Spans; Backticks und Zeilenumbrüche werden ersetzt, `@` entschärft.
  - Je Zeile höchstens 200 Zeichen, gesamt unter 60 000.
  - Letzte Zeile ein Marker `<!-- waechter: schluessel:art,… -->`, der nur `^[a-z0-9:,#-]*$` enthält. Der Schlüssel ist die Anbieter-ID; Plan 0050 nutzt für Klärfälle `k<hash8>`.
- **Ablauf** in `.github/workflows/nightly.yml`:
  - Der Job `nachtlauf` schreibt `waechter.md` (`pnpm pipeline status --waechter`) und lädt sie als Artefakt `waechter` hoch.
  - Neuer Job `waechter`:
    - `needs: [modus, nachtlauf, veroeffentlichen]`;
    - `if: always() && needs.modus.outputs.modus == 'live' && needs.nachtlauf.result == 'success'`;
    - `permissions: issues: write` und sonst nichts, kein Checkout.

    Schritte: `actions/download-artifact`, dann Shell mit `gh` und `jq`. Dabei immer `--repo "$GITHUB_REPOSITORY"`, `GH_TOKEN` nur in diesem Schritt, Werte über `env`, Text per `--body-file`, `continue-on-error: true` mit `::warning::`.
  - Logik:
    - Label `waechter` anlegen (`gh label create … --force`);
    - Issue suchen mit `gh issue list --app github-actions --label waechter --state all`;
    - ohne Befund das offene Issue schließen;
    - sonst das offene bearbeiten, ein geschlossenes wiedereröffnen oder ein neues anlegen;
    - zusätzlich ein Kommentar, wenn der Marker ein Paar enthält, das im alten fehlte.
- `staleHints` (`scripts/pipeline/lib/discover.ts`) entfällt.
- **Ampel:** `fehler` zählt für die 20-%-Regel nur, wenn der ganze Anbieter scheitert. Eine einzelne Seite im Fehler macht gelb.

### E11 – IDs über die Neuextraktion halten

Vor der Umstellung (S1) wird die Zuordnung in `scripts/pipeline/lib/stable-ids.ts` an zwei Stellen robuster. Das ist ein Nachtrag zu ADR 0031, mit Begründung im Code und im Commit nach ADR 0004.

- **Stufe 1, gemeinsamer Zeitraum:** Die Beginnzeiten werden nur im Zeitraum verglichen, den beide Fassungen abdecken, also ab dem späteren ersten bis zum früheren letzten künftigen Termin. Voraussetzung: beide haben dort mindestens 4 Termine. Sonst gilt der Vergleich wie heute. Eine Reihe, die nur früher endet oder später beginnt, behält so ihre ID. `SAME_SESSIONS` bleibt 0,8.
- **Stufe 2, Formatwechsel `kurs` ↔ `regelmaessig`:** zulässig, wenn außerdem
  - der erste künftige Beginn auf die Minute gleich ist,
  - `conflictingLabels` nichts findet
  - und kein anderer Kandidat in Frage kommt.

  Das ist ein Restpunkt aus Plan 0038 (`docs/ideas.md`). `einmalig` bleibt ausgenommen.
- **Messung vor dem Einbau** (S0): Die Umstellung wird offline nachgespielt (alter Stand gegen neue Extraktion je Einheit mit dem gewählten Modell), mit heutiger und neuer Zuordnung. Ziel 6 gilt für die neue. Verfehlt sie es, nennt S0 die übrigen Ursachen, und ein Nachtrag vor S1 entscheidet.

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/units.ts` (neu) | Einheiten, Kennung, Beilagen, `unitExcerpt` | S1 |
| `scripts/pipeline/lib/normalize.ts`, `scripts/pipeline/lib/extract.ts`, `scripts/pipeline/io/extract.ts` | Schlüssel und Nachricht mit `unitExcerpt`; `CallRecord.unit`; Eingabe je Einheit | S1 |
| `scripts/pipeline/lib/fetch.ts`, `scripts/pipeline/io/fetch-inputs.ts` | `assembleUnit`, Einheiten im Abruf, Bericht je Einheit | S1 |
| `scripts/pipeline/lib/raw.ts`, `schema/provider-raw.schema.json` | V2, `providerStatus`, Übergangsschema | S1, S5 |
| `scripts/pipeline/lib/refresh.ts`, `scripts/pipeline/io/refresh.ts` | Regeln je Einheit, Einbruch 1 → 0, Fehlerklasse, entfernte Seite, `emptySince`, `mayContinue`, Umstellung | S1 |
| `scripts/pipeline/lib/build-offers.ts` | `mergeParts` je Anbieter, Batch je Einheit, Status aus `providerStatus` | S1 |
| `scripts/pipeline/lib/stable-ids.ts` | E11 | S1 |
| `scripts/pipeline/io/nightly.ts`, `scripts/pipeline/lib/report.ts`, `scripts/pipeline/lib/cost.ts` | Ablauf, Bericht und Ampel je Einheit; `--umstellen`; Grenzen | S1, S4 |
| `scripts/pipeline/io/eval.ts` | Fälle in Einheiten zerlegen (nach `## Seite k:` und Katalog), je Einheit extrahieren, mit `mergeParts` vereinigen, werten wie heute | S1 |
| `scripts/pipeline/io/discover.ts`, `scripts/pipeline/lib/discover.ts` | Ertragsbeweis je Einheit; Bericht nennt Seiten ohne Ertrag; `staleHints` entfällt | S1, S2 |
| `scripts/pipeline/cli.ts` | `nightly --umstellen`, `--abruf`; `status --waechter`; `extract --from` je Einheit | S1–S3 |
| `scripts/validate-data.ts` | V1 und V2, Events je Einheit dem Anbieter zugehörig | S1 |
| `.github/workflows/nightly.yml`, `scripts/lib/nightly-workflow.test.ts` (neu) | Eingaben `timeout`, `umstellen`, `abruf`, `LLM_MODEL_EXTRACT`; Artefakt und Job `waechter`; Test der Rechte und Eingaben | S1, S2, S3 |
| `scripts/pipeline/lib/watch.ts` (neu) | `watchFindings`, `watchIssue` | S2 |
| `scripts/pipeline/lib/robots.ts`, `scripts/pipeline/io/robots.ts` (neu) | robots.txt parsen und prüfen, Cache je Host | S3 |
| `scripts/pipeline/io/http.ts`, `scripts/pipeline/io/browser.ts`, `scripts/pipeline/io/sources.ts`, `scripts/pipeline/io/geocode.ts` | User-Agent; robots.txt bei Seitenabrufen; Ausnahmen der APIs | S3 |
| `scripts/lib/share-pages.ts`, `scripts/lib/share-pages.test.ts` | Absatz im Impressum | S3 |
| `docs/architecture.md`, `CLAUDE.md` („Daten“), Skill (Abschnitte 1, 3, 5), ADR 0026 Statuszeile, ADR 0031 Nachtrag | Doku | S1–S5 |

## Tests (test-first)

- `lib/units.test.ts`:
  - Kennung aus der Vorlage, nicht der ausgefüllten URL, und mit Body-Hash bei `request`;
  - Beilagen in jeder Einheit;
  - `blocked` und `use: info` ausgenommen;
  - `coveredBy` nur `kandidaten`;
  - Reihenfolge;
  - `unitExcerpt` enthält nur die eigenen Seiten, und eine geänderte `hint` einer anderen Seite ändert ihn nicht.
- `lib/extract.test.ts`: Die Nachricht enthält `unitExcerpt`, nicht `catalogExcerpt`. Schlüssel und Nachricht nutzen denselben Auszug.
- `lib/normalize.test.ts`: Schlüssel je Einheit; Kandidaten nur in `kandidaten`.
- `lib/fetch.test.ts`:
  - `assembleUnit` mit gescheiterter Beilage → `fehler`;
  - `failureClass` für 404, 410, 500, Zeitüberschreitung, TLS, Bot-Schutz und robots.txt.
- `lib/raw.test.ts`:
  - V2-Regeln je Einheit, darunter `klasse` mit `klasseSince`;
  - `providerStatus` für alle, keine und einige Einheiten im Fehler;
  - V1 bleibt gültig bis S5.
- `lib/refresh.test.ts`:
  - jede heutige Regel je Einheit;
  - Einbruch 1 → 0 hält zurück;
  - neue Einheit ohne Einbruchprüfung;
  - `kandidaten` ohne Kandidaten → leere Eingabe mit Einbruchschutz;
  - Klassenwechsel setzt `klasseSince` neu: 10 Tage HTTP 500, dann 404, an Tag 14 nicht entfernt;
  - 14 Tage 404 → entfernt;
  - Rückkehr;
  - `emptySince` auch bei „unverändert“, wenn die Kurse ablaufen; gelöscht bei neuen künftigen.
- `io/refresh.test.ts`:
  - Abbruch über `mayContinue` nach zwei von drei Einheiten → zwei neue, eine alte, Datei gültig;
  - geänderte URL → alte Einheit bleibt, bis die neue `inputHash` hat;
  - Umstellung: alle gelungen → V2; eine gescheitert → V1 unverändert; Einbruch → V1 unverändert mit Bericht; `--umstellen` → V2, auch mit dauerhaft scheiternder Seite.
- `lib/build-offers.test.ts`:
  - **dasselbe regelmäßige Angebot aus zwei Einheiten mit anderem `cost` → kein Build-Fehler, ein Angebot;**
  - Batch je Einheit mit eigenem `checkedAt`;
  - Reihenfolge mit 11 Einheiten (`#02` vor `#10`);
  - Anbieter mit einer Einheit im Fehler → deren alte Events bleiben, neue der anderen kommen, keine ID fehlt;
  - Schritt 7 unverändert.
- `lib/stable-ids.test.ts` (E11):
  - Reihe mit 38 von 53 Terminen (Anfangsstück) → ID bleibt;
  - zwei Reihen ohne gemeinsamen Zeitraum mit mindestens 4 Terminen → Vergleich wie heute;
  - `kurs` → `regelmaessig` mit gleichem ersten Beginn → ID bleibt;
  - mit Konkurrenten → neue ID;
  - `conflictingLabels` → neue ID.
- `io/nightly.test.ts` mit Fake-Abruf über mehrere Nächte (Ziel 1):
  - Nacht 1: Seite B fällt aus (404), Seite A bringt einen neuen Kurs → er erscheint, alle IDs von B bleiben;
  - Nacht 2: gleich → unverändert, kein Modellaufruf;
  - **Rückkehr von B vor Tag 14** → IDs von B bleiben;
  - **zweiter Fall: B bis Tag 15** → Bs Angebote fehlen; Rückkehr danach → neue IDs (die Zuordnung kennt nur die Vornacht).
- `io/eval.test.ts`: Fall mit zwei Seiten und Beilage wird in Einheiten zerlegt, mit `mergeParts` vereinigt und gewertet.
- `lib/watch.test.ts` (S2):
  - `seite` erst ab dem zweiten Kalendertag, auch bei Bot-Schutz;
  - `gesperrt` sofort;
  - `entfernt`;
  - `einbruch`;
  - `leer` nur, wenn keine Einheit künftige Events hat, 14 Tage;
  - `anbieter` statt je Seite;
  - `umstellung` je V1-Datei;
  - Tage nach Europe/Berlin;
  - Text nur in Code-Spans, ohne Backticks, Zeilenumbrüche und `@`;
  - Marker geprüft;
  - Längen;
  - leere Befunde → leerer Text;
  - der Durchlauf über mehrere Nächte aus `io/nightly.test.ts` erzeugt die erwarteten Befunde.
- `scripts/lib/nightly-workflow.test.ts` (Muster `scripts/lib/push-schedule.test.ts`):
  - `waechter` hat genau `issues: write`, keinen Checkout, `always()`, `--repo`, `--body-file`, `--app github-actions`;
  - `nachtlauf` hat kein Schreibrecht;
  - `timeout-minutes` kommt aus der Eingabe;
  - `umstellen` und `abruf` werden weitergegeben.
- `lib/robots.test.ts` (S3):
  - eigene Gruppe ersetzt `*`, gleiche Gruppen zusammengeführt;
  - längste Regel, Gleichstand `Allow`;
  - `*` und `$`;
  - leere Datei;
  - 4xx erlaubt, 5xx/429 sperrt;
  - Pfad mit Query und Prozent-Kodierung.
- `io/robots.test.ts`, `io/http.test.ts` (S3):
  - User-Agent gesetzt;
  - robots.txt je Weiterleitung geprüft und selbst weitergeleitet;
  - gesperrt → „robots.txt sperrt“;
  - Nominatim und OpenHolidays ohne robots-Prüfung.
- `scripts/lib/share-pages.test.ts` (S3): Absatz zum Abruf im Impressum.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected` (Daten und Schema zusätzlich mit `--smoke`), jeder mit `/arch-review`; S3 wegen des Impressums mit `/browser-review`.

- **S0 – Messen (ohne Änderung im Repo, Wegwerf-Skripte im Job-Verzeichnis).**
  1. **Einheit gegen Anbieter** mit dem gewählten Modell, je zwei Läufe:
     - Für alle Anbieter mit mehr als einer Seite auf `main` werden die Eingaben eines Abrufs (`pnpm pipeline fetch`) zweimal extrahiert: je Anbieter wie heute und je Einheit nach E1, mit `unitExcerpt` und `mergeParts` nach E6.
     - Beide Varianten laufen durch `buildOffers` gegen `data/offers.json`.
     - Verglichen werden je Anbieter: Angebote, Vorstand-IDs wiedergefunden, Dubletten, Build-Fehler, Aufrufe, Tokens, Dauer.
     - Verfehlt ein Anbieter Ziel 2, wird die Ursache benannt (fehlender Kontext einer anderen Seite, Dublette mit anderem Titel), und ein Nachtrag regelt sie vor S1.
  2. **IDs** (E11, Ziel 6): dieselben Läufe mit heutiger und neuer Zuordnung (Prototyp im Skript).
  3. **Laufzeit:** Aufrufe und Minuten einer vollen Umstellung, daraus `timeout`, `budget_min` und die Bremsen für E7.
  4. Ergebnis in den Abschnitt „Umsetzung“.
- **S1 – Einheit Seite, IDs, Umstellung (E1–E7, E9, E11).**
  - Code mit Tests, dazu das Eval je Einheit.
  - Vor dem Push: ein Eval-Lauf je Einheit mit dem gewählten Modell gegen die letzte Zeile in `evals/results.md` (Ziel 2). Dazu lokal `pnpm pipeline nightly --dry-run` über alle Anbieter; verglichen wird `data/offers.json` des Trockenlaufs mit `main` (Angebote je Anbieter, Ziel 6).
  - Dann Deploy mit gesetztem Modell und die Umstellung per `workflow_dispatch` mit den Grenzen aus S0.
  - Abnahme: Ziele 5 und 6 nach höchstens drei Nächten; Ziel 1 im Test und in der Woche danach.
- **S2 – Wächter (E10).** Abnahme: Das Issue entsteht live bei einem echten Befund, sonst über eine noch nicht umgestellte Datei oder eine vorübergehend gestellte Lage. Es schließt sich, wenn nichts offen ist.
- **S3 – Ein Abruf (E8).**
  - robots.txt, User-Agent, Fehlerklasse, Impressum, Schalter `--abruf` (Standard `alt`).
  - **Messung im Runner** (die IP zählt für den Bot-Schutz): ein `workflow_dispatch` mit `modus=trocken` und `abruf=neu` über alle Katalogseiten und Sammelkalender. Gesucht sind gesperrte Seiten, Seiten, die mit dem neuen User-Agent anders antworten (Status, Länge ±20 %), und Bot-Schutz. Ergebnis in „Umsetzung“, dann N1.
  - Danach Standard `neu`; Schalter und Browser-UA entfallen. Nach dem Deploy `/browser-review live` der Impressumsseite.
- **S4 – Grenzen (E9)** nach sieben Nächten im neuen Format.
- **S5 – Abschluss.**
  - Sind alle Rohdateien V2, entfallen V1-Schema und Umstellungscode.
  - Eine Woche Bericht mit den Zielen 1, 3, 5 und 6.
  - ID-Wechsel von Nacht zu Nacht neu messen (Nicht-Ziele).
  - Live-Prüfung (CI grün, `meta.json`).
  - Restpunkte nach `docs/ideas.md`; Statuszeilen von ADR 0026 und ADR 0031; Plan archivieren.

## Nutzerentscheide (offen)

- **N1 – Seiten, die robots.txt sperrt oder die den neuen User-Agent abweisen** (nach der Messung in S3). Empfehlung: robots.txt achten. Eine gesperrte Seite bekommt `blocked` mit Grund, und der Anbieter wird über den Seitenfinder (Plan 0049) oder von Hand anders erschlossen. Alternative: eine Ausnahme je Seite im Katalog mit Begründung. Zu entscheiden nur, wenn die Messung Seiten findet.
- **N2 – Entfernte Seite nach 14 Tagen** (ADR 0033, Punkt 3). Empfehlung: ja, wie im ADR. Alternative: Bestand bleibt unbegrenzt wie heute, und nur der Wächter meldet.

## Kosten

Nach Nutzervorgabe kein Kriterium. Die Umstellung extrahiert einmal alles neu, zusammen mit dem Modellwechsel. Danach extrahiert eine Nacht nur Einheiten mit geänderter Seite statt ganzer Anbieter. Mehr Aufrufe kosten kleine Einheiten mit festem Anteil an Prompt und Auszug, die heute zusammen in einem Aufruf liefen. S0 misst die Bilanz.

## Risiken

- **Fehlender Kontext zwischen Seiten:** Eine Seite nennt den Kurs, eine andere Zeit oder Ort. Abhilfe:
  - Beilage für `use: verfuegbarkeit`;
  - S0 misst je Anbieter;
  - ein Nachtrag vor S1 regelt gefundene Fälle;
  - Venues und Hinweise der Seite stehen im Auszug.
- **Dubletten zwischen Seiten mit verschiedenen Titeln** (Übersicht und Detailseite). Abhilfe: `mergeParts` je Anbieter (E6), danach `dropSameSourceDuplicates`; S0 misst.
- **Bruch der IDs bei der Umstellung.** Abhilfe:
  - eine Neuextraktion für Modell und Einheit;
  - E11 vorher;
  - Ziel 6 offline gemessen, bevor umgestellt wird.
- **Umstellung bleibt hängen** (ein Anbieter mit dauerhaft scheiternder Einheit). Abhilfe: Wächter (`umstellung`), Eingabe `umstellen` nach Prüfung. S5 wartet, bis alle umgestellt sind.
- **Rückweg nötig.** Abhilfe: Revert von Code und Daten-Commits (E4), im Skill beschrieben.
- **robots.txt kostet Seiten.** Abhilfe: Messung im Runner vor dem Einschalten, N1, Schalter.
- **Entfernte Seite war nur lange kaputt.** Abhilfe: 14 Tage Meldung vorher; die Rückkehr extrahiert neu. Die Zuordnung vergleicht nur mit der Vornacht. Kehrt eine Seite nach Tag 14 zurück, bekommen ihre Angebote deshalb neue IDs, und alte Links laufen ins Leere. Das ist bewusst so: Ein Link ins Leere ist besser als einer auf einen Kurs, der nicht mehr gilt. N2 lässt den Nutzer anders entscheiden.
- **Issue als Angriffsfläche.** Abhilfe: eigener Job mit nur `issues: write`, kein Checkout, Text als Datei, fremder Text nur in Code-Spans, geprüfter Marker.

## Review (2026-10-26) – Verdict: Überarbeiten

Unabhängiger Review des Entwurfs mitsamt ADR 0033. Alle Befunde sind am Code nachgeprüft. Die Begründung steht jeweils in der genannten Entscheidung.

**Blocker**
- **B1 Dubletten über Einheiten brechen den Build** (Schritt 3, `build-offers.ts` Z. 379–389; `mergeParts` fehlte): übernommen.
  - E6: `mergeParts` je Anbieter vor dem Build, das Eval ebenso.
  - Test „anderes `cost` → kein Build-Fehler“.
  - Ziel 2 und S0 zählen Build-Fehler.

**Major**, alle übernommen:
- **M1 Schlüssel und Nachricht:** `unitExcerpt` für beide (E3, Test).
- **M2 „entfernt“ zählte die ganze Fehlerserie:** `klasseSince` (E4, E5, Test 500 → 404).
- **M3 Test widersprach dem Plan:** zwei Fälle, Rückkehr vor und nach Tag 14.
- **M4 robots.txt in `http.ts` sperrte Nominatim:** Prüfung nur bei Seitenabrufen, APIs ausgenommen, Messung im Runner samt Sammelkalendern (E8, S3). ADR 0033, Punkt 1 angepasst.
- **M5 `emptySince`:** in jedem Pfad, `leer` über künftige Events (E5, E10).
- **M6 Umstellung im Wächter:** Art `umstellung`.
- **M7 Job-Limit:** Eingabe `timeout`, `mayContinue` je Einheit (E7, E9).
- **M8 Einbruchschutz kleiner Seiten:** Regel „1 → 0“ (E5).
- **M9 Impressum:** `imprintPage()` in `share-pages.ts` mit Test.
- **M10 `check-docs` auf `main`:** Doku-Commit als Voraussetzung.

**Minor**, übernommen:
- Batch-Index mit Nullen;
- `kandidaten` ohne Kandidaten;
- alte Einheit bleibt bis zum Ersatz;
- `--umstellen` auch bei dauerhaft scheiternder Seite, Eingaben in `nightly.yml`;
- Body-Hash in der Kennung;
- robots-Tests (`*`, `$`, Gruppen, Weiterleitung, Browser);
- Bot-Schutz als `voruebergehend`, gemeldet ab Tag 2;
- Wächter-Test in S2, `berlinIsoDate`, `today` aus `nightly.json`;
- Modellwechsel geklärt: zusammen mit der Umstellung, wegen der ID-Probe vom 2026-10-26 (E7, E11);
- Rückweg (E4).

**Scope**, übernommen: Reihenfolge Einheit (S1), Wächter (S2), Abruf (S3); `Crawl-delay` gestrichen. **Abgelehnt:** den Befund `leer` zu verschieben. Grund: „kein stiller Ausfall“ ist ein Hauptziel des Nutzers, und mit M5 kostet `leer` nur eine Zeile in `watchFindings`.

**Neu nach dem Review:** E11 und Ziel 6. Grund ist die Probe vom 2026-10-26: Nur 16 von 24 IDs blieben bei `die-familienbox` mit neuem Modell. Das ist noch nicht unabhängig geprüft; deshalb folgt Review 2.
