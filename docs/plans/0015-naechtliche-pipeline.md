# Plan 0015 – Nächtliche Datenpipeline mit Evals

Status: freigegeben nach Plan-Review (3 Durchgänge), Umsetzung offen; E9 wartet auf Nutzerentscheidung
Datum: 2026-10-06

(ADR 0002 Hosting und Datenfluss, ADR 0003 Datenmodell, ADR 0004 Backpressure, ADR 0006 Recherche-Pipeline, Plan 0002 Pipeline, Plan 0009 Fahrplan; neu: ADR-Entwurf 0016.)

## Ziel

- **Jede Nacht aktuelle Daten ohne Menschen und ohne lokalen Rechner.** Eine GitHub Action holt alle Anbieterseiten, extrahiert die Termine und baut `data/offers.json`. Hat sich etwas geändert, committet sie auf `main`. CI prüft wie heute und deployt.
- **Kein Erfassungshorizont.** Erfasst wird jeder veröffentlichte Termin. Regeln ohne Ende („jeden Dienstag“) werden 12 Monate fortgeschrieben (E2).
- **Ein einziger Extraktionsweg.** Seiten deterministisch holen → Text → **ein** Sprachmodell-Aufruf je Anbieter (ohne Werkzeuge) → validieren → bauen. Das Modell ist eine Konfiguration (OpenAI-kompatibler Endpunkt), kein Code. Kostenlose Modelle sind damit möglich.
- **Evals als Fundament.** Ein fester Satz eingefrorener Fälle, ein deterministischer Scorer und ein Runner messen jedes Modell auf demselben Weg, den der Nachtlauf nimmt. Der Nachtlauf läuft nur mit einem Modell und Prompt, für die ein bestandenes Eval-Ergebnis im Repo liegt.
- **Robust.** Jeder Anbieter ist isoliert: Scheitert er, bleiben seine letzten Daten stehen, und der Bericht nennt ihn. Die Fehlerpfade sind in CI mit einem Fake-Modell getestet, ohne Netz und ohne Kosten.
- **Überblick über die Aktualität.** Jeder Lauf schreibt einen Statusbericht in die Zusammenfassung der Action (`$GITHUB_STEP_SUMMARY`). Lokal zeigt `pnpm pipeline status` denselben Bericht. Die Aktualität lässt sich so ohne weitere Infrastruktur prüfen, auch in der GitHub-App auf dem Handy.
- **Einfachheit vor Kostenoptimierung.** Keine Sonderadapter je Quellentyp und kein Diff-Prompt. Die einzige Sparmaßnahme ist ein Cache „gleiche Eingabe → gleiches Ergebnis“, und den braucht es ohnehin für stabile Daten (E5).

## Nicht-Ziele

- **Agenten-Schleife im Nachtlauf** (Links folgen, Buchungs-Widgets bedienen). Der Katalog nennt jede nötige Seite ausdrücklich (E4). Ein begrenztes `fetch`-Werkzeug wäre eine spätere Erweiterung, nur mit Eval-Befund (`docs/ideas.md`).
- **Automatische Katalogpflege.** Neue Anbieter, Drift und Umzüge bleiben beim Skill `babyevents-nuernberg`, der zum Wartungslauf wird (E10). Der Nachtlauf meldet nur.
- **Deterministische Adapter für iCal, JSON-APIs oder JSON-LD.** Sie laufen über denselben Modellweg. Zeigen die Evals dort Schwächen, wird das eine Idee mit Messung.
- **Aktualität in der App anzeigen** (z. B. „Plätze geprüft vor 2 Tagen“). Idee.
- **Benachrichtigung über neue Angebote** (Plan 0011, Stufe 2).
- **Die endgültige Modellwahl.** Sie ist das Ergebnis von Schritt 9 und wird dann in ADR 0016 nachgetragen.

## Ausgangslage

### Ablauf heute (Skill `babyevents-nuernberg`, Plan 0002, ADR 0006)

- Claude Code läuft lokal mit dem Abo des Nutzers (ADR 0002). `init` legt `runs/<from>/` mit einem Horizont von 4 Monaten an, `select` packt den Katalog in Pakete zu 7 Anbietern.
- Je Paket ruft ein Subagent die Programmseiten mit `pnpm pipeline fetch-page` ab, folgt Links, öffnet JS-Seiten im Browser, liest PDFs mit `pdftotext` und schreibt `raw/batch-<n>.json` (`RawBatch`, `scripts/pipeline/lib/raw.ts`).
- Die Sammelkalender (`evtermine`, `frankenkids`, `stadt-vk`) holt Code (`io/sources.ts`), die Zuordnung schlägt `lib/match.ts` vor. Behalten oder verwerfen und die Zusammenfassung schreibt der Hauptagent (`candidates keep`).
- `build` rechnet Offsets, Ferien, IDs und Dubletten, schreibt laufende Kurse fort (ADR 0006) und übernimmt bei Fehlern den Altbestand aus `data/offers.json`. `publish` committet `data/` und pusht. CI vergleicht mit dem deployten Stand (mehr als 50 % Einbruch = rot).
- Bisher gab es genau einen Lauf: 2026-10-04, 333 Angebote, 2889 Termine, 83 Katalogeinträge (74 Anbieter, 7 Aggregatoren, 2 Verzeichnisse), 9 Pakete, keine Fehler. Die Rohdaten liegen nur lokal in `runs/2026-10-04/raw/` (gitignored).

### Messung der Eingaben (2026-10-06, alle Programmseiten der 74 Anbieter)

Gemessen mit `fetchPage` + `renderFetchReport` (wie `fetch-page`), ohne Kürzung.

| | Wert |
|---|---|
| Programm-URLs | 197 (davon 6 PDF) |
| nicht direkt abrufbar | 14: Eversports-Widgets 403 (6), Canva 403 (1), mutherstudio.com 500 (3), Kursorganizer-GraphQL braucht POST (2), evangelische-termine.de iCal Timeout nach 30 s (2) |
| Hinweis „JS-gerendert“ | 34 |
| Text je Anbieter | Median 13 200 Zeichen, 90 % ≤ 65 100, Maximum 284 000 (`fbs-nuernberg`), dann 201 000 (`ev-langwasser-miniclubs`) |
| Summe | 2,15 Mio. Zeichen ≈ 0,55–0,6 Mio. Tokens Eingabe für einen vollen Lauf (Schätzung 3,5–4 Zeichen je Token) |

Größte Ausgabe im Lauf vom 04.10.: Paket 3 mit 85 Events. Ein einzelner großer Anbieter kann also mehrere zehntausend Ausgabe-Tokens brauchen. Das ist für Modelle mit kleinem Ausgabelimit ein Risiko (R2).

### Der Katalog ist für Agenten geschrieben, nicht für Code

Notizen in `data/providers.yaml` enthalten Arbeitsanweisungen, die ein fester Abrufer nicht ausführen kann. Beispiele:
- „FROM durch Laufbeginn ersetzen“ und „START_DATUM anpassen“ (`ajax_vk.pl`)
- „POST mit Headern Origin: …, x-application-type: end-user-app; Query coursesWithPaginationPublic …“ (Kursorganizer)
- „Paginierung &page=2“

### Wo der Horizont steckt

- `cli.ts`: `init` (4 Monate), Aggregator-Abruf `fetchSource(…, meta.from, meta.to)`, Ferien `loadFreeDays(from − 12 M, to + 24 M)`
- `lib/raw.ts`: `expansionWindow`, Warnungen in `validateRaw` („kein Termin im Horizont“, „Kurs beginnt nach dem Horizont“)
- `lib/build-offers.ts`: `horizon` als Eingabe, Filter bei der Übernahme aus dem Altbestand
- `src/domain/schema.ts`: `OffersFile.horizon { from, to }`. Die UI begrenzt die Kalender-Navigation über den letzten Termin (`lastSessionDay`, `src/ui/use-offer-views.ts:133–134`), nicht über `horizon`. Die Agenda nennt nach dem letzten Termin den Datenhorizont (B8).
- ADR 0003 nennt den Horizont mit „4 Monate“. ADR 0011 Nr. 4 legt fest, dass `pipeline oepnv` den Feed „lokal“ lädt.
- 13 Anbieter haben `coveredBy` (12 davon `et-dekanat-nuernberg`). `select.ts:29` überspringt sie heute: Ihre Termine kommen nur über den Sammelkalender. Kandidaten-Events tragen `sourceUrl` = `detailUrl` des Kandidaten (`lib/draft.ts:75`) und `via` = Adapter.

### Größe

`data/offers.json` hat für 4 Monate 687 kB, gzip 63 kB. Das Budget von `site.json` liegt bei 250 kB gzip (`.size-limit.json`). Mit 12 Monaten wachsen vor allem die Termine regelmäßiger Gruppen, grob auf das Dreifache. Schritt 2 misst das.

### CI und Actions

- Das Repo ist öffentlich, Actions-Minuten kosten nichts.
- ADR 0002, Konsequenzen: Ein Push mit `GITHUB_TOKEN` startet keinen weiteren Workflow. Ausgenommen sind `workflow_dispatch` und `repository_dispatch`. `ci.yml` hat bereits `workflow_dispatch`.
- GitHub deaktiviert geplante Workflows in öffentlichen Repos nach 60 Tagen ohne Repo-Aktivität.

## Entscheidungen

### E1 – Gesamtbild

```
nightly.yml (cron, täglich 01:30 UTC)
  pnpm pipeline oepnv                 # wie heute, Cache per actions/cache
  pnpm pipeline run                   # alles Folgende, ein Befehl
    1. Katalog lesen, Ferien laden, Gate prüfen (E8, „bestandenes Eval für Modell + Extraktor?“)
    2. Sammelkalender abrufen (vorhandene Adapter) → Kandidaten je Anbieter (lib/match.ts)
    3. je Anbieter (parallel, Limit LLM_CONCURRENCY):
         Seiten holen (E4; bei coveredBy keine Seiten, nur Kandidaten) → Eingabetext bauen → inputHash
         Entscheidungstabelle (E5): Seite ausgefallen → fehler; Sammelkalender (teilweise) ausgefallen → ausstehend
         gleicher Hash, gleicher Extraktor, gleiches Modell → alte Events übernehmen (Cache, E5)
         sonst → Modell (E3) → validateRaw + Build-Probelauf → bei Fehlern 1 Wiederholung mit den Meldungen
         Erfolg → Titel-Anker → data/raw/<id>.json neu
         Fehler → alte Events bleiben, status fehler; Rate-Limit oder Zeitbudget erschöpft → status ausstehend
         Einbruch (≥ 3 Events → leer oder < Hälfte) → zurückhalten bis zur Bestätigung (E5)
    4. build: data/raw/*.json (+ Kursfortschreibung aus data/offers.json) → data/offers.json
    5. Bericht (E7) → stdout, $GITHUB_STEP_SUMMARY, runs/<datum>/bericht.md
  upload-artifact runs/<datum>/       # Bericht, Modellantworten, Kandidaten – keine Seitentexte (E9), 14 Tage
  pnpm pipeline publish               # nur data/, nur bei Änderung; NIGHTLY_PUBLISH=1 nötig (E12)
  gh workflow run ci.yml --ref main   # nur wenn gepusht wurde
ci.yml (unverändert) → Gates → Deploy
```

Derselbe Befehl `pnpm pipeline run` läuft lokal mit eigenen Umgebungsvariablen. Es gibt keinen zweiten Weg.

### E2 – Erfassung ohne Horizont, Datenhorizont 12 Monate

- **Erfassung:** Der Prompt verlangt alle veröffentlichten Termine ab heute, ohne Zeitgrenze. Vergangene Termine fallen weg, außer bei laufenden Kursen (ADR 0006, unverändert). Alles Erfasste steht in `data/raw/<id>.json`.
- **Datenhorizont** (`OffersFile.horizon`, Schema unverändert): `from` = heute, `to` = heute + 12 Monate (`DATA_MONTHS = 12`, eine Konstante in `lib/build-offers.ts`).
  - Regeln ohne Ende werden bis `to` fortgeschrieben.
  - Kurse mit `count`/`until` laufen wie heute über `to` hinaus (`expansionWindow`).
  - Einzeltermine nach `to` bleiben in `data/raw` und erscheinen von selbst, sobald sie ins Fenster rücken. Der Bericht zählt sie („N Termine nach dem Datenhorizont“).
  - Warum nicht „bis zum letzten veröffentlichten Termin“? Ein einziger Termin in 3 Jahren würde jede Wochengruppe 3 Jahre fortschreiben. Ein fester Wert ist einfacher und begrenzt die Größe.
- **Sammelkalender** fragen dasselbe Fenster wie die Platzhalter ab: `{von}` (Monatsanfang) … `{bis}` (E4). Mit „heute“ träfe der Cache für Kandidaten nie.
- **Ferien:** `loadFreeDays(heute − 12 M, to + 12 M)`. Hat ein Jahr im Fenster keine Schulferien (OpenHolidays noch nicht gepflegt), meldet der Bericht „Ferien <Jahr> fehlen – Termine in den Ferien werden nicht ausgelassen“. Der Lauf bricht nicht ab.
  - Ist OpenHolidays nicht erreichbar, nimmt `loadFreeDays` den Cache, auch wenn er älter als 30 Tage ist, mit Zeile im Bericht (🟡). Erst ohne Cache endet der Lauf mit Exit 1, denn ohne Ferien wären alle Ferienpausen falsch.
  - Der Cache liegt in `~/.cache/zwergenplan`, im Workflow per `actions/cache`.
- **Validierung** (`validateRaw`): Die Warnungen „kein Termin im Horizont“ und „Kurs beginnt nach dem Horizont“ entfallen. Es bleiben „Kurs ist schon vorbei“ und „kein künftiger Termin“.
- **UI:** keine Codeänderung. Der Kalender blättert bis zum letzten Termin. Die Fixture-Daten der E2E-Tests behalten ihren festen Horizont.
- **Größe**, zweimal gemessen:
  - Schritt 2 misst `site.json` (gzip) mit den Rohdaten vom 04.10. und 12 Monaten. Diese Daten sind nach Monat 4 unvollständig erfasst, das ist also eine Untergrenze.
  - Die verbindliche Messung folgt nach dem ersten vollen Schattenlauf (E12). Sie ist Gate vor `NIGHTLY_PUBLISH`: Budget, Smoke-Test und LCP mit echten 12-Monats-Daten in CI.
  - Liegt eine Messung über dem Budget, stoppt die Umsetzung, und der Nutzer entscheidet: Budget per ADR anheben oder Fenster verkleinern. Die Schwelle wird nicht still gesenkt (ADR 0004).

### E3 – Extraktion: ein Aufruf je Anbieter, OpenAI-kompatibel, ohne SDK

- **`scripts/pipeline/io/llm.ts`** schickt einen `POST {LLM_BASE_URL}/chat/completions`. Der Body enthält:
  - `model`, zwei Nachrichten (System: Prompt, User: Eingabetext), `temperature: 0`, `max_tokens`
  - **`stream: true` mit `stream_options: { include_usage: true }`**
  - optional `response_format: { type: "json_object" }`
- **Warum Streaming:**
  - Das globale `fetch` von Node (undici) bricht nach 300 s ohne Header ab (`headersTimeout`/`bodyTimeout`, Standard 300 000 ms). Eine nicht gestreamte Antwort mit rund 30 000 Ausgabe-Tokens (R2) schickt ihre Header aber erst am Ende.
  - Mit Streaming kommen Header und Chunks sofort. Laut den Anbietern unterstützen OpenAI, Gemini und der Kompatibilitäts-Endpunkt von Anthropic das.
- **Timeouts:**
  - 120 s ohne neue **Bytes**: Kommentarzeilen wie `: OPENROUTER PROCESSING` zählen als Lebenszeichen.
  - Höchstens 15 Minuten je Aufruf und nie über das Budgetende hinaus (unten).
- **SSE parsen** (`data: …`-Zeilen zu Text, `finish_reason` und Usage zusammensetzen) liegt rein in `lib/sse.ts` mit Unit-Tests. Zeilen, die mit `:` beginnen, werden ignoriert. Für Kommentarzeilen, unterbrochene Streams und abschließendes `[DONE]` gibt es eigene Fälle.
- **Obergrenze der Eingabe:** `MAX_INPUT_CHARS = 400 000`, etwa 110 000 Tokens. Gekürzt wird nie. Darüber geht der Anbieter nicht ans Modell, er wird `fehler` („Eingabe zu groß: N Zeichen – Katalogeintrag eingrenzen“). Ein Beispiel ist Kursorganizer mit über 1000 bundesweiten Kursen (`providers.yaml:2262`), dort hilft ein Filter in `request`.
- `io/llm.ts` selbst ist nur Verdrahtung (`fetch`, Body lesen). Es kommt kein npm-Paket dazu. Das globale `fetch` ist in `io/` erlaubt.
- **Abbrüche zählen nicht als systemisch:** Ein Timeout oder ein abgebrochener Stream ist `fehler` dieses Anbieters. Systemisch im Sinne der Exit-Regel (b), E6, sind nur 401/403/404 oder „Verbindung abgelehnt / DNS“ bei den ersten 3 Aufrufen.
- **Zeitbudget des Laufs als harte Frist:** `RUN_BUDGET_MIN` (Standard 45), gezählt ab Start von `run`.
  - Jeder Modellaufruf und jede Wiederholung bekommt ein `AbortSignal` mit min(15 Min., Restbudget). Auch Pausen wegen 429 enden spätestens am Budgetende.
  - Was am Budgetende läuft oder noch offen ist, wird `ausstehend`. Alles Fertige wird gesichert.
  - Der Workflow hat `timeout-minutes: 90`: rund 5 Min. Vorbereitung, 45 Min. Budget, rund 5 Min. Build, Publish und pre-commit, dazu Reserve. Der Workflow-Timeout greift so nie mitten im Sichern.
  - Nach einer Prompt-Änderung (Cache für alle ungültig) holt der Lauf in mehreren Nächten auf, statt jede Nacht von vorn zu scheitern.
  - Test mit Fake-Uhr: Ein Aufruf, der am Budgetende noch läuft, endet als `ausstehend`.
- **Wiederhol-Regeln** liegen rein in `lib/llm-retry.ts`: `withRetry(send, sleep, policy)` mit injiziertem `send` und `sleep`, unit-getestet.
  - Bei 429 und 5xx bis zu 3 Wiederholungen, mit `Retry-After` oder 5/15/45 s.
  - Ist nach den Wiederholungen weiter 429, wird der Anbieter `ausstehend` (E5), nicht `fehler`.
- **Antwort parsen:** Vor `JSON.parse` entfernt der Code einen umschließenden Code-Fence (```` ```json … ``` ````). Der OpenAI-kompatible Endpunkt von Anthropic ignoriert `response_format`.
- **Konfiguration nur per Umgebung:**
  - `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`
  - `LLM_JSON_MODE` (Standard `1`; `0` für Anbieter ohne `response_format`), `LLM_MAX_TOKENS` (Standard 32 000), `LLM_CONCURRENCY` (Standard 2)
  - In Actions kommen sie aus Repo-Variablen (`vars.LLM_*`) und dem Secret `LLM_API_KEY`. Einen Modellnamen im Code gibt es nicht.
- **Prompt:** `scripts/pipeline/prompt/extract.md` (Deutsch).
  - Er entsteht aus `.claude/skills/babyevents-nuernberg/references/extraction.md`: dieselben Fachregeln (Zielgruppe 0–3, Format, Anmeldung, Kosten, Verfügbarkeitstabelle, `schedule`-Tabelle, Feldgrenzen, „Werte werden nie geraten“). Die Teile über Abrufen, Links, Browser und PDF fallen weg.
  - Neu kommt hinzu: „Heute ist <Wochentag, Datum>“, „alle veröffentlichten Termine ab heute, ohne Zeitgrenze“, „antworte nur mit einem JSON-Objekt im Format …“.
  - Das Themen-Vokabular und das Antwortformat fügt der Code aus dem Zod-Vertrag ein (`schema/raw-batch.schema.json`). Es gibt also keine zweite Liste.
  - `extraction.md` wird gelöscht. Der Prompt ist die einzige Quelle der Extraktionsregeln.
- **Zuschnitt der Module:** Was das Modell sieht oder was seine Antwort bewertet, liegt in **`lib/extract-prompt.ts`**: Eingabe-Bauer, Zusammenbau des Prompts, Parsen der Antwort, Validierung samt Build-Probelauf.
  - Alles Übrige liegt in **`lib/refresh.ts`**: Zustandslogik, Cache-Regel, Einbruchschutz, Zeitbudget, Titel-Anker, Ausfall-Regeln, Platzhalter.
- **Extraktor-Version:** `EXTRACTOR_VERSION` = die ersten 12 Zeichen von sha256 über den Inhalt von `prompt/extract.md`, `lib/extract-prompt.ts` und das eingefügte Schema. Berechnet wird sie zur Laufzeit.
  - Jede Änderung daran ergibt eine neue Version und verlangt ein neues Eval. Auch reine Umformatierungen zählen; das ist billiger als eine vergessene Versionsnummer, die von Hand gepflegt werden müsste.
  - Bugfixes in `lib/refresh.ts` ändern die Version nicht. Sie kosten weder ein Eval noch eine Neu-Extraktion.
  - `pnpm data:validate` warnt in CI, wenn es für die aktuelle Extraktor-Version kein bestandenes Ergebnis in `evals/results/` gibt. Eine Prompt-Änderung fällt so schon im PR auf, nicht erst nachts.
- **Antwortformat (eine Datei je Anbieter):**
  ```json
  { "status": "ok", "note": "…", "drift": "…", "events": [ RawEvent, … ] }
  ```
  `status` ist `ok | keine-termine | fehler`, `reason` ist Pflicht bei `fehler`. Der Code verpackt die Antwort als `RawBatch` (`providers: { [id]: … }, events`) und prüft sie mit dem vorhandenen `validateRaw`, ohne `expected` und ohne Horizont-Warnungen.
- **Build-Probelauf je Anbieter:** Zur Validierung gehört ein `buildOffers` nur mit diesem Anbieter (Katalog, freie Tage, Fenster). Fehler, die heute erst im Gesamt-Build auffallen, gelten so als Validierungsfehler dieses Anbieters und kippen nie den ganzen Lauf. Beispiel: „gleicher Titel und Ort, andere Merkmale“ (`build-offers.ts:279`).
- **Wiederholung:** Ist die Antwort kein JSON oder meldet die Validierung Fehler, geht genau eine Folgenachricht raus: „Deine Antwort hat diese Fehler: … Gib die vollständige, korrigierte Antwort.“ Scheitert auch die, gilt der Anbieter als `fehler` mit Grund „Extraktion ungültig: <erste 3 Meldungen>“.
- **Abgeschnittene Antwort** (`finish_reason: "length"`): Der Anbieter gilt sofort als `fehler` („Antwort abgeschnitten“), ohne Wiederholung.
- **Plausibilität der URLs** (Schutz gegen Prompt-Injection aus Webseiten):
  - `sourceUrl` muss in der Menge der erlaubten URLs liegen: die abgerufenen URLs, ihre Ziele nach Redirects (`finalUrl`) und die `detailUrl` der Kandidaten in der Eingabe. Sonst ist das ein Validierungsfehler.
  - `url` muss `http:` oder `https:` sein; es gibt Bestandsdaten mit `http://`, z. B. `providers.yaml:1571`. Der Bericht listet Hosts, die in keiner Katalog-URL vorkommen, als Hinweis. Er lehnt sie nicht ab.
- **Titel-Anker (stabile IDs, ADR 0003/0006):** Nach der Validierung vergleicht der Code jedes neue Event mit den alten Events des Anbieters und übernimmt bei einem Treffer den **alten Titel**.
  - Ein Modell, das „Krabbelgruppe (Di)“ einmal „Krabbelgruppe Dienstag“ nennt, ändert so weder die ID noch die Kalender der Nutzer.
  - Die Zuordnung ist **1:1**: zuerst exakt gleiche Titel. Dann für die übrigen Paare mit gleichem `venueId` und `format`, ähnlichem Titel (`similarTitle`) und sich überschneidenden Terminen, gierig nach größter Überschneidung der Termine (Jaccard).
  - Jedes alte Event verankert höchstens ein neues. Ergäben sich zwei gleiche Titel, unterbleibt der Anker für das zweite.
  - Die Regel ist rein und unit-getestet, auch mit zwei ähnlich benannten Gruppen.
- **`via`:** Das Modell setzt `via` nicht, das macht der Code.
  - Für Anbieter mit `coveredBy` ist es der Adapter des Sammelkalenders.
  - Sonst bleibt es leer (Rang `anbieter`). Hier kombiniert das Modell Seite und Kandidaten in einer Antwort und führt doppelte Termine selbst zusammen. Die Dublettenregeln in `buildOffers` bleiben als Netz.
- **Eine Funktion für Nacht und Eval:** `extractProvider(client, provider, input, today)` (in `lib/`, der Client wird übergeben) kapselt Prompt, Aufruf, Wiederholung und Validierung. Nachtlauf, Eval-Runner und Tests nutzen sie gleich. Die Tests übergeben einen Fake-Client.

### E4 – Seiten holen: deterministisch, der Katalog ist ausführbar

- **Je Programmeintrag nach `kind`:**
  - `html`: `fetchPage` + `extractPage` wie heute (Text, JSON-LD, Status-Ampeln).
  - `ical`: `parseIcal` → kompaktes JSON.
  - `json-api`: `fetchPage` (GET oder `request`, siehe unten) → JSON, kompakt serialisiert.
  - `pdf`: Download, dann `pdftotext <datei> -` (poppler-utils, im Workflow per apt). Lokal ist das schon heute Voraussetzung des Skills.
  - `js`: Playwright Chromium (`@playwright/test` ist schon devDependency): `goto`, warten auf `networkidle` (höchstens 30 s), dann `page.content()` → `extractPage`. Nur `scripts/pipeline/io/browser.ts` darf Playwright importieren (neue dependency-cruiser-Regel `pipeline-playwright-only-in-browser`).
- **Platzhalter in URLs:** `{von}` und `{bis}` (YYYY-MM-DD) ersetzt der Code vor dem Abruf, z. B. `START_DATUM={von}`. So bleiben Katalog-URLs gültig, ohne dass jemand Daten nachzieht.
  - `{von}` ist der **Monatsanfang** des aktuellen Monats, `{bis}` der Monatsanfang 13 Monate später.
  - Mit `{heute}` änderte sich die Eingabe jede Nacht, und der Cache (E5) träfe nie. So ändert sie sich höchstens einmal im Monat, außer die Seite selbst ändert sich.
  - Dasselbe Fenster gilt für die Abfrage der Sammelkalender.
- **Anbieter mit `coveredBy`:** Wie heute ruft der Lauf ihre Programmseiten **nicht** ab. Die Eingabe besteht nur aus Katalogauszug und zugeordneten Kandidaten.
- **Ausfall eines Sammelkalenders, auch teilweise:**
  - `fetchSource` liefert neben den Kandidaten eine Liste **gescheiterter Abfragen**: `failed: string[]`, z. B. `vid=579`, `Stichwort krabbel`, `Seite 3`.
  - Heute landen Teilausfälle nur in `warnings` (`io/sources.ts:56–61`, `:96–101`), und ein 404 auf Seite 1 von frankenkids ergibt still 0 Kandidaten (`:76`, `cli.ts:154`). Künftig gilt: Ein 404 auf Seite 1 ist ein Ausfall, ein leeres Ergebnis bei sonst gefüllten Nächten nicht.
  - Hat ein Adapter in diesem Lauf **irgendeine** gescheiterte Abfrage, gilt er als teilweise ausgefallen. Jeder Anbieter mit diesem Adapter in `coveredBy` oder in `sources` (E5: Adapter, aus denen seine letzte Eingabe Kandidaten enthielt) geht nicht ans Modell.
  - Er wird **`ausstehend`** („<Adapter> teilweise nicht erreichbar: vid=579“), nicht `fehler`. Das passt zur Bedeutung: Die alten Events bleiben, der Anbieter zählt nicht in die 20-%-Regel, und nach 3 Tagen wird er über `checkedAt` 🟡. Ein einzelner Timeout macht den Lauf so nicht rot. Das gilt mit und ohne `coveredBy`.
  - Gescheiterte Abfragen wiederholt `fetchSource` am Ende einmal, bevor sie als gescheitert gelten.
  - Grob, aber einfach: Ein Timeout bei einer `vid` sperrt für eine Nacht alle Anbieter dieses Adapters. Die Zuordnung „welche Abfrage gehört zu welchem Anbieter“ entfällt damit.
  - Die Migration (Schritt 3) setzt `sources` aus dem `via` der Altdaten, damit die Regel vom ersten Lauf an greift.
- **Zweites Netz für alles Übrige** (Cookie-Wand mit Status 200, leere JS-Seite, stiller Teilausfall): der Einbruchschutz in E5.
- **Schemaänderung** in `Provider.programme[]`: optional `request: { method: "POST", headers?: Record<string,string>, body: string }`, z. B. für die Kursorganizer-GraphQL-Abfragen. Dazu die Platzhalter in der Beschreibung des Felds. `pnpm schema:export` danach.
- **Paginierung:** Jede Seite ist ein eigener Programmeintrag. Links folgt der Code nie.
- **Fehler einer Seite** (HTTP ≥ 400, Timeout nach 2 Wiederholungen, Playwright-Fehler, leeres PDF): Der Anbieter geht **nicht** ans Modell. Seine alten Daten bleiben, `status: fehler`, Grund mit URL und Code. Begründung: Eine teilweise Eingabe ließe Angebote still verschwinden.
- **`pnpm pipeline fetch [--only a,b]`** holt alle Seiten und zeigt je Eintrag Status, Zeichen und Art, ohne Modell. Damit wird der Katalog in Schritt 5 ausführbar gemacht.
- **Höflichkeit:** höchstens 4 Abrufe parallel, höchstens 2 gleichzeitig je Host, ein Lauf pro Nacht.

### E5 – Zustand im Repo: `data/raw/<providerId>.json` und Cache

- **Format** (Zod `ProviderRaw` in `scripts/pipeline/lib/raw.ts`, exportiert nach `schema/provider-raw.schema.json`):
  ```json
  {
    "providerId": "zoff-harmonie",
    "status": "ok",
    "reason": "…",
    "note": "…",
    "drift": "…",
    "inputHash": "sha256:…",
    "extractor": "3f2a9c01b7de",
    "model": "…",
    "checkedAt": "2026-10-07T03:41:12+02:00",
    "changedAt": "2026-10-05T03:40:58+02:00",
    "extractedAt": "2026-10-05T03:41:30+02:00",
    "failingSince": "2026-10-07T03:41:12+02:00",
    "events": [ … ]
  }
  ```
  - `status` ist `ok | keine-termine | fehler | ausstehend`. `ausstehend` heißt: Rate-Limit erreicht, in diesem Lauf nicht extrahiert. Die alten Events bleiben, `failingSince` wird nicht gesetzt, und der Anbieter zählt nicht in die 20-%-Regel. Der Bericht zeigt die Zahl, und ein Alter über 3 Tagen wird über `checkedAt` 🟡.
  - Dazu kommt `sources: ["evtermine", …]`: die Sammelkalender, aus denen die Eingabe Kandidaten enthielt (E4, Ausfall-Regel).
  - Dazu kommt `held` (optional): `{ inputHash, since, events }`, ein zurückgehaltenes Ergebnis (Einbruchschutz, unten).
- **Einbruchschutz:** Hatte ein Anbieter mindestens 3 Events, und das neue gültige Ergebnis ist leer oder hat weniger als die Hälfte der Events, gilt es noch nicht.
  - Die alten Events bleiben. Das neue Ergebnis kommt nach `held`, und der Bericht zeigt „zurückgehalten“ (🟡).
  - In der nächsten Nacht gilt: Ist der `inputHash` gleich `held.inputHash`, also die Seite seither unverändert, wird `held.events` übernommen, ohne neuen Modellaufruf. Der Einbruch ist damit bestätigt, ein Saisonende etwa.
  - Ist der Hash anders, wird normal extrahiert und erneut geprüft.
  - So dauert ein echtes Saisonende einen Tag länger, und eine kaputte Nacht löscht nie Daten. Die Regel ist rein und unit-getestet.
- **Entscheidungstabelle je Anbieter** (`lib/refresh.ts`). Die Reihenfolge ist verbindlich, die erste passende Zeile gilt. Jede Zeile hat einen Test.

  | # | Lage | Events | `status` | `inputHash` | `checkedAt` | `held` | `failingSince` |
  |---|---|---|---|---|---|---|---|
  | 1 | Seite ausgefallen, Eingabe zu groß | alt | `fehler` | alt | alt | bleibt | setzen, falls leer |
  | 2 | Sammelkalender (teilweise) ausgefallen, Rate-Limit, Budget erschöpft | alt | `ausstehend` | alt | alt | bleibt | bleibt |
  | 3 | `held` besteht und neuer Hash = `held.inputHash` | `held.events` | aus `held` | neu | jetzt | löschen | löschen |
  | 4 | neuer Hash = gespeicherter Hash (Cache) | alt | alt | alt | jetzt | löschen | löschen |
  | 5 | Modell liefert gültiges Ergebnis, kein Einbruch | neu (mit Titel-Anker) | aus Antwort | neu | jetzt | löschen | löschen |
  | 6 | Modell liefert gültiges Ergebnis mit Einbruch | alt | alt | **alt** | alt | `{ neuer Hash, jetzt, neue Events }` | bleibt |
  | 7 | Modell meldet selbst `status: fehler` | alt | `fehler` (`reason` aus der Antwort) | alt | alt | bleibt | setzen, falls leer |
  | 8 | Modellantwort ungültig, abgeschnitten, Timeout | alt | `fehler` | alt | alt | bleibt | setzen, falls leer |

  - Zeile 6 behält den alten Hash. So greift in der nächsten Nacht bei unveränderter Seite Zeile 3 (Bestätigung) und nicht Zeile 4.
  - Kehrt die Seite zum alten Hash zurück, greift Zeile 4 und löscht `held`: Der Einbruch war vorübergehend.
  - `changedAt` wird in Zeile 3 und 5 gesetzt, wenn sich der Hash geändert hat, `extractedAt` in Zeile 5 und 6.
  - `reason` gibt es nur bei `fehler`, `failingSince` nur bei `fehler` in Folge.
  - `checkedAt` ist der letzte Lauf mit vollständig abrufbaren Seiten **und** gültigem Ergebnis, ob aus dem Cache oder neu extrahiert.
  - `changedAt` ist die letzte Änderung von `inputHash`, `extractedAt` der letzte erfolgreiche Modellaufruf.
- **`inputHash`** ist sha256 über die **gesamte User-Nachricht**: Katalogauszug samt Orten und Notizen, alle Seitentexte, die Kandidaten. Eine Katalogänderung führt so zu neuer Extraktion.
- **Cache-Regel:** Stimmen `inputHash`, `extractor` und `model` mit der Datei überein, ruft der Lauf kein Modell auf. Die Events bleiben, `checkedAt` wird neu gesetzt.
  - Wichtiger als die Kostenersparnis: Unveränderte Seiten liefern garantiert unveränderte Daten. Ein Sprachmodell würde sonst jede Nacht leicht andere Themen oder Titel erzeugen.
  - Das heutige Datum gehört **nicht** in den Hash. Sonst gäbe es keinen Treffer.
- **Fehlerfall:** Die Events bleiben, dazu `status: fehler`, `reason` und `failingSince` (nur wenn noch nicht gesetzt). `checkedAt` bleibt alt. So zeigt der Bericht ehrlich, wie alt die Daten des Anbieters sind.
- **`build`** liest alle `data/raw/*.json`.
  - **Verwaiste Datei** (kein Katalogeintrag mehr): `build` und `run` löschen sie und schreiben eine Zeile in den Bericht. `pnpm data:validate` warnt nur. So muss niemand von Hand in `data/raw` eingreifen, wenn die Wartung einen Anbieter entfernt.
  - **Unbekannter Ort** (die Wartung hat einen Ort gelöscht oder umbenannt): `build` verwirft die Events mit diesem Ort und schreibt eine Zeile in den Bericht. `run` leert beim Anbieter `inputHash`, damit er in der nächsten Nacht neu extrahiert wird. Ein Katalog-Umbau kippt so nie den Gesamt-Build. Heute übersprang die Übernahme aus dem Altbestand solche Orte (`build-offers.ts:328–329`).
  - Ein Anbieter ohne Datei ist erlaubt: Er ist neu und noch nie geprüft. `build` behandelt ihn wie „keine Events“, der Bericht nennt ihn unter „Braucht Aufmerksamkeit“, und der nächste `run` legt die Datei an. So wird CI nicht rot, wenn der Wartungslauf einen Anbieter aufnimmt.
- **Keine Handarbeit in `data/raw`:** Wie `data/offers.json` wird es nie von Hand bearbeitet. Eine Handkorrektur bliebe über den Cache dauerhaft stehen und wäre nicht reproduzierbar. Korrekturen laufen über Katalog, Prompt oder Eval-Fall. Diese Regel kommt in `CLAUDE.md`, Abschnitt Stolperfallen/Daten.
  - `availability.checkedAt` der Angebote kommt aus `checkedAt` des Anbieters.
  - Die Übernahme aus dem Altbestand bei Fehlern (Schritt 5 in `buildOffers`) entfällt, denn `data/raw` hält die alten Events.
  - Die Kursfortschreibung (Schritt 2, ADR 0006) bleibt und liest weiter das bisherige `data/offers.json`.
- **Warum im Repo und nicht in `actions/cache`?** Der Zustand ist sichtbar, diffbar und dauerhaft. Lokale Läufe und der Nachtlauf sehen denselben Stand, und es braucht keine weitere Infrastruktur. Einzige Ausnahme ist der vorübergehende Schattenbetrieb (E12).
- **Biome:** `data/raw/**` schreibt `writeJson` (`JSON.stringify(v, null, 1)`, Schlüssel in fester Reihenfolge des Zod-Schemas). Biome nimmt die Dateien aus, wie `data/oepnv/fahrplan.json`.
- **Schema-Ort (Abweichung von „ein Datenvertrag“, `docs/architecture.md`):** `ProviderRaw` ist Zustand der Pipeline, kein Datenvertrag der Website. Weder `build-data.ts` noch `src/` lesen ihn.
  - Das Schema liegt deshalb wie `RawBatch` (ADR 0006) in `scripts/pipeline/lib/raw.ts`. Seine Event-Felder sind aus `OfferFields` abgeleitet, und es wird nach `schema/provider-raw.schema.json` exportiert.
  - `scripts/validate-data.ts` darf dafür aus `scripts/pipeline/lib` importieren. Das ist eine neue erlaubte Kante in der Schichtentabelle, die ADR 0016 begründet.
- **Commit-Rauschen:** `checkedAt` ändert sich jede Nacht, also gibt es jede Nacht einen Commit. Das ist gewollt. Der Commit ist der Herzschlag des Systems und hält den Cron über die 60-Tage-Regel aktiv. Der Commit enthält nur `data/`.
- **`runs/<datum>/`** ist gitignored. Darin liegen `inputs/<id>.txt` (nur lokal), `responses/<id>.json` (nur neu extrahierte), `candidates/` (Kandidaten der Sammelkalender), `summary.json` (Laufzahlen für `publish`) und `bericht.md`.
  - In `candidates/` stehen die Kandidaten **ohne** `description`: Titel, Datum, Ort, Veranstalter und Link reichen für `add-provider`. Die vollständigen Beschreibungstexte fremder Seiten bleiben so aus dem öffentlichen Artefakt (E9).
  - Das Artefakt des Nachtlaufs enthält alles **außer `inputs/`**. Artefakte öffentlicher Repos kann jeder angemeldete Nutzer laden, und Seitentexte sollen nicht öffentlich kopiert werden (E9).
  - Zum Nachstellen einer Eingabe dient lokal `pnpm pipeline fetch --only <id>`.

### E6 – Nachtlauf-Workflow `.github/workflows/nightly.yml`

```yaml
name: Nachtlauf Daten
on:
  schedule: [{ cron: "30 1 * * *" }]   # 02:30 MEZ / 03:30 MESZ
  workflow_dispatch:
    inputs:
      only: { description: "nur diese Anbieter (a,b)", required: false }
permissions: { contents: write, actions: write }
concurrency: { group: nightly, cancel-in-progress: false }
jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 90                 # Budget 45 Min. + Vorbereitung + Sichern, siehe E3
    steps:
      - checkout (ref: main), pnpm, setup-node (.nvmrc), pnpm install --frozen-lockfile
      - mkdir -p runs
      - sudo apt-get update && sudo apt-get install -y poppler-utils
      - pnpm exec playwright install --with-deps chromium
      - actions/cache: ~/.cache/zwergenplan, key: zp-cache-${{ github.run_id }}, restore-keys: zp-cache-
      - nur wenn vars.NIGHTLY_PUBLISH != '1': actions/cache/restore des Schattenzustands (E12)
      - pnpm pipeline oepnv || echo "$?" > runs/oepnv-fehler   # Fehler → Datei, run nimmt sie in den Bericht
      - id: run
        run: set +e; pnpm pipeline run; echo "code=$?" >> "$GITHUB_OUTPUT"   # env: LLM_*, ONLY: ${{ inputs.only }} (nur über env)
      - actions/upload-artifact nachtlauf-<datum>: runs/ ohne runs/*/inputs, dazu data/raw und data/offers.json (14 Tage), if: always()
      - if code in (0, 2):
          NIGHTLY_PUBLISH == '1' → pnpm pipeline publish
          sonst → actions/cache/save des Schattenzustands (E12)
      - if gepusht nach main: gh workflow run ci.yml --ref main
      - if code != 0: exit 1        # Exit 1 und 2 machen den Job rot → GitHub-Mail
```

Ohne das `set +e` und die Ausgabe nach `$GITHUB_OUTPUT` übersprängen Actions bei Exit 2 alle folgenden Schritte, und es würde nichts gesichert.

- **Exit-Codes von `pipeline run`:**
  - `0`: alles normal, auch wenn einzelne Anbieter `fehler` oder `ausstehend` sind. Sie stehen im Bericht.
  - `2`: **sichern, aber rot melden.** Das gilt, wenn
    - mehr als 20 % der Anbieter in **diesem** Lauf `fehler` haben (ohne `ausstehend`), oder
    - die Live-Seite mehr als 1 Tag hinter `main` liegt (E7).
    - Begründung zum zweiten Fall: Eine rote CI nach dem Daten-Commit meldet GitHub niemandem, denn ihr Auslöser ist `github-actions[bot]`. Ein roter geplanter Lauf dagegen geht per Mail an den Autor des Crons. Ein reales Beispiel ist das Font-Swap-Gate, das nach einem Datenupdate rot werden kann (`docs/architecture.md`).
    - Weil gescheiterte Anbieter ihre alten Daten behalten, ist das Sichern der erfolgreichen sicher. Der Job wird trotzdem rot, damit die Mail kommt.
  - `1`: **nichts sichern.** Das gilt, wenn (a) das Gate scheitert (E8), (b) der Endpunkt systemisch nicht geht oder (c) der Gesamt-Build bzw. `validateDataset` trotz Probeläufen je Anbieter scheitert (ein Bug).
    - Zu (b): Die ersten 3 Aufrufe enden mit 401/403/404 oder ohne Verbindung. Der Lauf bricht dann sofort ab.
- **Pre-commit-Hook:** `pnpm install` installiert über `prepare` den lefthook-Hook. Der Commit des Nachtlaufs durchläuft also `check:fast`. Das ist gewollt, es ist dasselbe Gate wie lokal.
- **`publish`** verliert das Argument `RUN_DIR`. Sonst bleibt es wie heute: Abbruch bei Änderungen außerhalb von `data/`, Vergleich mit dem deployten Stand, Commit, Push.
  - Neu: Ohne Änderung in `data/` endet es mit „nichts zu veröffentlichen“ und Exit 0.
  - **Kein Konfliktpfad:** Ist der Push kein Fast-Forward, weil jemand während des Laufs auf `main` gepusht hat, endet `publish` mit Exit 1 und einer klaren Meldung. Die nächste Nacht wiederholt den Lauf; dank Cache kostet das nur die geänderten Anbieter. Das Fenster dafür ist etwa eine Stunde in der Nacht, ein Rebase-Pfad mit vertauschtem `ours`/`theirs` wäre dafür ungetesteter Aufwand.
  - Commit-Identität `github-actions[bot]`. Nachricht: `data: Nachtlauf 2026-10-07 (334 Angebote, +3/−2; 6 Anbieter neu extrahiert, 2 Fehler)`.
    - Die Zahlen liest `publish` aus `runs/<heute>/summary.json`, das `run` schreibt.
    - Fehlt die Datei (lokales `publish` ohne `run`), zählt es nur Angebote und Δ aus `offers.json`.
- **Regel für Menschen und lokale Sessions** (kommt in `CLAUDE.md`):
  - `data/raw` und `data/offers.json` werden nur über `pipeline publish` committet.
  - Konflikte darin, auch beim Rebase eines eigenen Branchs, werden **zugunsten von upstream** gelöst, danach folgt `pipeline build`. Nie von Hand.
  - Katalog- und Codeänderungen laufen wie heute über eigene Commits.
- **CI-Start:** `gh workflow run ci.yml --ref main` mit `GH_TOKEN: ${{ github.token }}` (dafür `actions: write`). `ci.yml` bleibt unverändert, sein Deploy-Pfad (`github.ref == refs/heads/main`, kein PR) greift. Weder PAT noch GitHub App nötig.

### E7 – Statusbericht

`renderStatus(input) → Markdown` ist rein (in `lib/status.ts`). Die Eingabe besteht aus den `data/raw`-Dateien, dem Katalog, `offers.json`, dem vorigen `offers.json` und den Laufzahlen, falls vorhanden. `pipeline run` hängt den Bericht an `$GITHUB_STEP_SUMMARY` (wenn gesetzt), gibt ihn aus und schreibt `runs/<datum>/bericht.md`. `pnpm pipeline status` zeigt ihn jederzeit. Ohne Netz steht beim Live-Stand „unbekannt“, alles andere kommt aus dem Repo.

Inhalt in dieser Reihenfolge:

1. **Kopfzeile mit Ampel.**
   - 🔴: Lauf gescheitert oder mehr als 20 % `fehler`.
   - 🟡, wenn eines davon zutrifft:
     - ein Anbieter seit mindestens 3 Tagen `fehler` oder seit mindestens 3 Tagen nicht geprüft
     - ein zurückgehaltener Einbruch
     - ein Sammelkalender ganz oder teilweise ausgefallen
     - eine Drift-Meldung
     - fehlende Ferien
     - die Live-Seite hängt hinterher (unten)
   - 🟢: sonst.
2. **Kennzahlen:**
   - Datenstand (`generatedAt`), Datenhorizont
   - **Live-Stand:** Commit und `generatedAt` aus `https://zwergenplan.app/data/meta.json` neben dem Stand auf `main`. Weichen sie mehr als 1 Tag voneinander ab, ist das 🟡 („Live-Seite hängt hinterher – CI prüfen“). So fällt eine rote CI nach einem Daten-Commit auf, z. B. das Font-Swap-Gate.
   - Angebote und Termine mit Δ zum vorigen Stand (+neu/−weg)
   - Anbieter je Status (Cache / neu extrahiert / Fehler / ausstehend / neu ohne Datei)
   - Modell und Extraktor-Version, Modellaufrufe, Wiederholungen, Tokens ein/aus, Laufzeit
   - Sammelkalender mit Anzahl, Fahrplanstatus
3. **„Braucht Aufmerksamkeit“** (Tabelle):
   - Anbieter mit `fehler` (seit, Grund)
   - Anbieter mit `checkedAt` älter als 3 Tage
   - Anbieter, deren Angebotszahl auf 0 fiel oder sich mehr als halbiert hat
   - Drift-Meldungen, zu große Eingaben (E3)
   - relevante Sammelkalender-Kandidaten ohne Zuordnung (Titel, Veranstalter, Link)
   - Termine nach dem Datenhorizont
4. **`<details>` Alle Anbieter:** id | Status | geprüft | geändert | extrahiert | Angebote | nächster Termin, sortiert nach `checkedAt` aufsteigend (Ältestes oben).

Die Schwellen (3 Tage, 20 %) stehen als Konstanten in `lib/status.ts`. Getestet wird mit festen Fixtures je Ampelfall.

### E8 – Evals

**Ablage**

```
evals/
  cases/<case-id>/case.json       # Katalogeintrag (Snapshot), heute, freie Tage, Kandidaten, erlaubte URLs, Herkunft, Tags, Review-Vermerk
  cases/<case-id>/expected.json   # Referenzantwort im Antwortformat aus E3
  inputs/<case-id>/<n>.json       # je Programmseite: { url, finalUrl, kind, text } nach dem Abruf (Ablage siehe E9)
  results/<YYYY-MM-DD>-<modell-slug>-<extractor>.json
```

- **Ein Fall** ist ein Anbieter zu einem Zeitpunkt. Eingefroren werden die **Bausteine** der Eingabe, nicht der fertige Text:
  - die abgerufenen Seitentexte (`inputs/`)
  - Katalogauszug, Kandidaten und freie Tage (`case.json`)
- `eval run` baut daraus mit dem **aktuellen** Eingabe-Bauer den Text, wie der Nachtlauf. Eine Änderung am Eingabe-Bauer (neue Extraktor-Version) wird damit wirklich gemessen und nicht an einem alten Text vorbei.
- Evals messen Eingabe-Bauer, Prompt und Modell, nicht den Abruf. Den Abruf decken Unit-Tests mit HTML-Fixtures ab (`tests/fixtures/pipeline/`).
- **`case.json` enthält auch die erlaubten URLs** (abgerufene URLs, `finalUrl`, `detailUrl` der Kandidaten). Replay und Integritätstest prüfen `sourceUrl` damit auch ohne `inputs/`. Ohne Netz ist jeder Fall reproduzierbar.

**Fallauswahl:** 25 Fälle. Jedes Merkmal ist mindestens einmal abgedeckt, die Tags erlauben Auswertungen je Merkmal.

| Tag | Merkmal |
|---|---|
| `woechentlich` | offene Gruppe mit Ferienpause |
| `kurs` | Kurs mit `count` |
| `kurs-laufend` | laufender Kurs mit vergangenen Terminen |
| `daten` | Liste konkreter Daten |
| `kultur` | Stück mit vielen Vorstellungen |
| `monatlich` | n-ter Wochentag im Monat |
| `14-taeglich` | 14-täglich |
| `ampel` | Platzampel; mindestens ein Fall mit „ausgebucht“ und einer mit Warteliste |
| `ohne-anmeldung` | offener Treff |
| `ical`, `json`, `pdf`, `js` | Eingabe je Quellentyp |
| `kandidaten` | nur Sammelkalender-Kandidaten; dazu ein Fall mit Seite und Kandidaten gemischt |
| `keine-termine` | Seite ohne aktuelle Angebote |
| `falle-3plus` | nur Angebote ab 3 Jahren |
| `falle-ohne-kind` | Geburtsvorbereitung, Vortrag, Elternkurs |
| `falle-vergangen` | nur vergangene Termine |
| `mehrere-orte` | Anbieter mit mehreren Orten |
| `gross` | `fbs-nuernberg`, etwa 280 000 Zeichen |
| `drift` | neuer Ort oder Umzugshinweis auf der Seite |

- Echte Seiten haben Vorrang. Höchstens 5 Fälle dürfen fiktiv sein (wie `tests/fixtures/`), und nur für Fallen, die es gerade auf keiner echten Seite gibt.

**Referenzen erstellen**

- `pnpm eval capture <providerId> --case <id> [--tags a,b]` schreibt `case.json` und die Eingabe.
- `expected.json` erstellt Claude Code (stärkstes Modell) nach denselben Regeln wie der Prompt. Ein **zweiter, unabhängiger** Durchgang erzeugt eine zweite Fassung.
- `pnpm eval diff <case>` vergleicht beide mit dem Scorer. Jede Abweichung wird am Eingabetext entschieden.
- Der Nutzer prüft 5 zufällige Fälle selbst. `case.json` vermerkt `reviewed: { at, by: "claude-2pass" | "nutzer" }`.
- Regel für später: **Jeder im Betrieb gefundene Extraktionsfehler wird ein neuer Eval-Fall**, bevor Prompt oder Modell geändert werden.

**Scorer `lib/eval-score.ts`** (rein, unit-getestet)

- Erwartete und tatsächliche Events laufen durch dieselbe Expansion (`expandSchedule`, freie Tage aus `case.json`, Fenster `today` … +12 M).
- **Termin-F1 (Hauptkennzahl):** F1 über die Menge `venueId|Beginn (Minute)` des ganzen Falls. Die Darstellung (`weekly` oder `dates`) spielt dabei keine Rolle, nur die Termine.
- **Angebots-F1:** Events werden gepaart, wenn `venueId` gleich ist und der Titel ähnlich (`lib/similar.ts`) oder die Termine sich zu mindestens 50 % überschneiden (Jaccard). Gepaart wird gierig nach bester Überschneidung.
- **Feldgenauigkeit** auf gepaarten Events: `format`, `registration`, `cost`, `availability.status`, `age.minMonths`/`maxMonths`, Endzeit gleich; `topics`: gleiche Kategorien. Der Wert ist der Mittelwert der Treffer.
- **Status richtig:** `ok`/`keine-termine`/`fehler` stimmt.
- **Fallen:** In Fällen mit Tag `falle-*` und leerer Referenz zählt jedes extrahierte Event als Fehler. Das deckt Precision ab.
- **Gültigkeit:** gültig beim ersten Versuch / nach der Wiederholung / ungültig. Dazu Tokens ein/aus, Sekunden, abgeschnitten ja/nein.
- **Nicht bewertet:** `summary`, `note`, `price` (Freitext). Nur ob vorhanden und innerhalb der Länge.
- **Aggregation:** Makro-Mittel über die Fälle und dieselben Werte je Tag.

**Runner und Bericht**

- `pnpm eval run [--cases tag:pdf|id,…] [--repeat 3]` nutzt `LLM_*` aus der Umgebung und **`extractProvider`** wie der Nachtlauf.
  - Er schreibt `evals/results/<datum>-<modell>-<extractor>.json`: je Fall und Wiederholung die Kennzahlen, dazu die Zusammenfassung (Mittel und Minimum über die Wiederholungen), Modell, Extraktor-Version, Endpunkt-Host und Datum.
  - Die Modellantworten liegen in `runs/eval-<datum>/` (nicht committet).
- `pnpm eval report [dateien…]` erzeugt eine Vergleichstabelle (Modell × Kennzahlen, darunter je Tag) als Markdown nach stdout und `$GITHUB_STEP_SUMMARY`.
- `.github/workflows/eval.yml` (`workflow_dispatch` mit Eingaben `model`, `base_url`, `repeat`, `api_key_secret`, d. h. der Name des Secrets) führt `eval run` und `eval report` aus und lädt das Ergebnis als Artefakt hoch.
  - Er committet nicht. Ein Ergebnis ins Repo zu nehmen ist eine bewusste Entscheidung, weil es dem Nachtlauf ein Modell freigibt: lokal per `gh run download` und Commit.

**Gate `lib/eval-gate.ts`**

- `pipeline run` startet nur, wenn `evals/results/` ein Ergebnis mit **gleichem `model`, gleicher `extractor`-Version und gleichem Endpunkt-Host** (aus `LLM_BASE_URL`) hat, das alle Schwellen erfüllt. Dasselbe Modell bei einem anderen Anbieter kann sich anders verhalten (Quantisierung, Limits).
  - Gültigkeit nach Wiederholung ≥ 95 %
  - Termin-F1 ≥ 0,90
  - Angebots-F1 ≥ 0,85
  - Feldgenauigkeit ≥ 0,85
  - Minimum über die Wiederholungen
- Diese Werte sind vorläufig. Schritt 9 legt sie nach dem ersten Basislauf fest und hält die Begründung fest. Senken danach nur mit Begründung im Code und im Commit (ADR 0004).
- Eine Prompt-Änderung ergibt eine neue Extraktor-Version. Der Nachtlauf bleibt dann rot, bis ein neues Eval bestanden und committet ist. Das ist gewollt (Backpressure).
- `pipeline run --skip-gate` gibt es nur lokal für die Entwicklung. Der Workflow ruft es nie auf, ein Test in `cli`-Nähe prüft, dass `nightly.yml` den Schalter nicht enthält.

**In CI (jeder Push, ohne Netz, ohne Kosten)**

- Unit-Tests des Scorers: identische Antwort = 1,0; fehlende Termine; Darstellungen `weekly` und `dates` gleichwertig; Fallen; Paarung.
- **Integrität des Eval-Satzes:** Jede `expected.json` besteht `validateRaw` gegen den Anbieter aus `case.json`, und Scorer(expected, expected) = 1,0. Damit verrottet der Satz bei Schemaänderungen nicht still.
- **Replay:** Ein Fake-Client antwortet in jedem Fall mit `expected.json`. Der volle Weg `extractProvider` → `data/raw` → `buildOffers` bleibt grün.
  - Er braucht nur `cases/`, nicht `inputs/`: Der Fake ignoriert die Seitentexte, und der Test setzt leere Seiten ein.
  - Die erlaubten URLs kommen aus `case.json`.
- **Fehlerpfade mit Fake-Client:** kein JSON, Schemafehler mit Korrektur in der Wiederholung, zweimal Schemafehler, 429 und dann Erfolg, Timeout, `finish_reason: length`, fremde `sourceUrl`, Cache-Treffer ohne Aufruf, Seitenfehler (alte Events bleiben, `failingSince` wird gesetzt), Erholung (`failingSince` verschwindet), 429 nach allen Wiederholungen (`ausstehend`, kein `failingSince`, nicht in der 20-%-Regel), Sammelkalender ausgefallen (abhängige Anbieter `fehler`, alte Events bleiben), Build-Probelauf scheitert (nur dieser Anbieter `fehler`), Titel-Anker, 3 systemische 401 (Exit 1), mehr als 20 % Fehler (Exit 2).

### E9 – Ablage der eingefrorenen Eingaben (Nutzerentscheidung offen)

`evals/inputs/**` sind vollständige Texte fremder Webseiten, und das Repo ist öffentlich. Das Projekt schreibt Zusammenfassungen bewusst in eigenen Worten (Skill-Regel). Aus demselben Grund enthält das Artefakt des Nachtlaufs keine Seitentexte (E5).

- **(a)** Im öffentlichen Repo unter `evals/inputs/`. Am einfachsten, aber eine öffentliche Kopie fremder Texte (25 Seiten von Vereinen, Kirchengemeinden, Hebammen).
- **(b, Empfehlung)** Privates Repo `sbiastoch/zwergenplan-evals` mit nur den Eingaben. Es wird lokal nach `evals/inputs/` geklont (gitignored). `eval.yml` checkt es mit einem fein granulierten PAT (Secret `EVALS_REPO_TOKEN`, nur Lesen) aus.
  - CI-Tests brauchen `inputs/` nicht (E8, Replay). Die Hürde betrifft nur echte Eval-Läufe.
- (c) Nur lokal. Nicht reproduzierbar, verworfen.

Bis zur Entscheidung plant der Rest mit (b). Bei (a) entfallen nur das Klonen und das Secret.

### E10 – Der Skill wird zum Wartungslauf

`babyevents-nuernberg/SKILL.md` wird neu geschrieben. Auslöser sind „Daten pflegen“, „Katalog pflegen“, ein gelber oder roter Nachtlauf und ein Modellwechsel. Aufgaben:

1. **Bericht lesen** (`pnpm pipeline status` oder die letzte Action-Zusammenfassung) und „Braucht Aufmerksamkeit“ abarbeiten:
   - Fehler-Anbieter reparieren (Programmeinträge, `request`, Platzhalter)
   - Drift im Katalog umsetzen
   - neue Veranstalter aus nicht zugeordneten Kandidaten aufnehmen (`candidates add-provider`)
2. **Prüfen:** `pnpm pipeline fetch --only <id>` und `pnpm pipeline run --only <id>`.
3. **Eval-Fälle pflegen:** Jeder gefundene Extraktionsfehler wird ein Fall (`eval capture`, Referenz in 2 Durchgängen).
4. **Modell wechseln:** `eval run --repeat 3` je Kandidat, `eval report`, Ergebnis committen, `gh variable set LLM_MODEL …`.

Entfallen: `init`, `select`, `candidates fetch|list|keep`, `build RUN_DIR`, die Subagenten-Pakete und `references/extraction.md` (wird der Prompt).

Es bleiben `fetch-page` (für den Menschen bzw. Agenten), `validate-raw`, `holidays`, `geocode`, `oepnv`, `publish` und `candidates add-provider`.
- `add-provider` liest die Kandidaten aus `runs/<datum>/candidates/`.
- Lokal kommen sie entweder aus einem eigenen `pnpm pipeline run`, oder aus dem Artefakt des letzten Nachtlaufs: `gh run download --name nachtlauf-<datum> --dir runs/`. Der Skill beschreibt beide Wege.

knip meldet tote Reste.

### E11 – Modellwahl: Vorgehen

- **Basis:** Claude Haiku 4.5 über den OpenAI-kompatiblen Endpunkt von Anthropic als günstige, bezahlte Referenz.
  - Einmalig dazu das stärkste verfügbare Modell als Obergrenze, um Referenzen und Prompt selbst zu prüfen.
  - Anthropic nennt den Kompatibilitäts-Endpunkt selbst nicht „production-ready“. Macht er Probleme (Streaming, Usage), läuft die Basis über OpenRouter, das Claude-Modelle ebenfalls OpenAI-kompatibel anbietet. Der Code ändert sich dafür nicht.
- **Kostenlose Kandidaten** (die Limits prüft Schritt 9 vor dem Lauf an der aktuellen Doku):
  - ein Gemini-Flash-Modell (kostenlose Stufe, OpenAI-kompatibler Endpunkt von Google)
  - ein OpenRouter-`:free`-Modell: ohne Guthaben 50 Anfragen am Tag, mit 10 $ Guthaben 1 000. Schon `eval --repeat 3` braucht 75 Anfragen, ein voller Neulauf 74. Praktikabel nur mit Guthaben. Ohne Guthaben holt der Lauf nach einer Prompt-Änderung über mehrere Nächte auf (`ausstehend`, E5).
- **GitHub Models fällt weg:** Die kostenlose Stufe begrenzt je Anfrage auf etwa 8 000 Tokens Eingabe und 4 000 Ausgabe. Die Ausgabe allein reicht für mittelgroße Anbieter nicht.
- Claude-5-Modelle haben standardmäßig Thinking an. Beim Basislauf Thinking-Einstellung und Kosten im Ergebnis festhalten, damit der Vergleich fair bleibt.
- **Regel:** Das günstigste Modell (kostenlos zuerst), das das Gate in 3 Wiederholungen besteht. Bei Gleichstand gewinnt die höhere Termin-F1. Das Ergebnis kommt als Nachtrag in ADR 0016.
- **Nutzungsbedingungen kostenloser Stufen** (Eingaben dürfen zum Training dienen): Die Eingaben sind öffentliche Webseiten ohne personenbezogene Daten der Nutzer. Das ist mit ADR 0002 vereinbar.

### E12 – Umstieg im Schattenbetrieb

- **Erster Lauf:** `data/raw/` entsteht in Schritt 3 aus den Rohdaten vom 04.10. (ohne `inputHash`). Der erste echte Lauf extrahiert daher alle Anbieter.
- **Schattenbetrieb:** `NIGHTLY_PUBLISH` ist nicht gesetzt. Der Nachtlauf läuft vollständig, veröffentlicht aber nicht auf `main`. Den Zustand (`data/raw/`, `data/offers.json`) sichert er per **`actions/cache`**, damit Cache-Quote, `failingSince`, Einbruchschutz und Erholung von Nacht zu Nacht beobachtbar sind.
  - **Vor dem Lauf** (nur bei `NIGHTLY_PUBLISH != '1'`): `actions/cache/restore` mit `key: schatten-${{ github.run_id }}` und `restore-keys: schatten-` holt den jüngsten Schattenzustand über den Checkout von `main`. Katalog und Code kommen immer von `main`, nur der Zustand aus dem Schatten.
  - **Nach dem Lauf** (Exit 0 oder 2): `actions/cache/save` mit `key: schatten-${{ github.run_id }}`.
  - Kein Branch, kein Commit, kein Hook, kein zweiter Worktree. Ein Branch scheiterte am gemeinsamen pre-commit-Hook ohne `node_modules` und könnte nach dem Umschalten veralteten Zustand über `main` legen.
  - Ein Cache, der nach 7 Tagen ohne Zugriff verfällt, ist für diese Phase unkritisch. Er wird jede Nacht gelesen, und im schlimmsten Fall extrahiert die nächste Nacht alles neu.
  - Das Artefakt enthält den Zustand (`data/`), der Verlauf bleibt also nachlesbar.
  - Der Bericht vergleicht zusätzlich mit dem deployten Stand (Angebote neu/weg je Anbieter).
  - Lokale `publish`-Läufe auf `main` stören den Schatten nicht. Er überlagert nur seinen eigenen Zustand.
- **Gate vor dem Umschalten** (Größe, W7 aus dem 1. Review):
  - Aus dem letzten Artefakt entsteht ein Branch `pruefung-0015-daten` (Code von `main`, `data/` aus dem Artefakt). Er wird von Hand gepusht, die volle CI läuft (Branches ohne Deploy): `site.json`-Budget, Smoke-Test und LCP mit echten 12-Monats-Daten.
    - Das ist die einzige benannte Ausnahme von „`data/` nur über `publish`“ (E6).
    - Der Branch wird nie gemergt und nach der Prüfung gelöscht.
  - Dazu kommt ein kurzer Blick auf Kalender und Liste mit diesen Daten auf 320 px und im Querformat (lokaler Preview).
- **Umschalten** nach mindestens 5 Nächten, wenn
  - jede weggefallene Angebotsgruppe erklärt ist (echt beendet, oder Katalog bzw. Eval-Fall nachgezogen),
  - mindestens 4 der 5 Nächte 🟢 oder 🟡 ohne neue Fehlerart waren und
  - die Prüfung oben grün ist.
- **Dann umschalten:**
  1. Den Zustand des Schattens nach `main` bringen: `data/` aus dem letzten Artefakt lokal einspielen, `pnpm pipeline build`, `pnpm pipeline publish`.
  2. `gh variable set NIGHTLY_PUBLISH --body 1`.
  3. Ab der nächsten Nacht ist `main` die einzige Quelle des Zustands. Der Schatten-Cache wird nicht mehr gelesen und verfällt von selbst.
  - Ohne Schritt 1 extrahiert der erste veröffentlichende Lauf einmal alles neu. Das ist auch korrekt, kostet aber einen vollen Lauf.

## Schritte

Jeder Schritt endet mit grünem `pnpm check:fast`. Neue Logik entsteht test-first (Vitest, ohne Netz).

Die Schritte bilden drei **Stufen**. Jede Stufe ist für sich lieferbar, wird eigens committet und nach `main` gebracht:
- **Stufe A** (Schritte 1–3): ADR, Horizont, Zustand in `data/raw`. Ab dann baut `offers.json` aus `data/raw` mit 12-Monats-Fenster. Zwischen Stufe A und Stufe B gibt es **keinen** Skill-Lauf. Der Bestand vom 04.10. bleibt stehen, der nächste Datenlauf ist der erste lokale `pnpm pipeline run` in Stufe B. Eine Übergangsfunktion für das alte Paketformat gibt es nicht.
- **Stufe B** (Schritte 4–8): Abruf, Katalog, Extraktion, `run`/`status`, Evals. Danach läuft alles lokal per `pnpm pipeline run`.
- **Stufe C** (Schritte 9–11): Modellwahl, Nachtlauf im Schatten, Umschalten.

1. **ADR 0016 annehmen, Architektur nachziehen.**
   - ADR-Entwurf `docs/adr/0016-naechtliche-pipeline.md` (liegt dem Plan bei) auf „angenommen“.
   - ADR 0002, ADR 0003 (Horizont „4 Monate“), ADR 0006 und ADR 0011 (Nr. 4 „lokal“) bekommen je einen Verweis „ergänzt/ersetzt durch ADR 0016“ an den betroffenen Stellen.
   - `docs/architecture.md`:
     - Datenfluss-Diagramm
     - Schichtentabelle: `io/llm.ts`, `io/browser.ts`, `lib/llm-retry.ts`, `lib/status.ts`, `lib/eval-*.ts`, `evals/` und die Kante `scripts/validate-data.ts` → `scripts/pipeline/lib`
     - Invariante „ein Datenvertrag“ mit dem Zusatz zu `data/raw` (E5)
   - Neue Regel `pipeline-playwright-only-in-browser` in `.dependency-cruiser.cjs`, nur für `from: ^scripts/pipeline/`. `e2e/` und `playwright.config.ts` bleiben unberührt. Dazu ein Kanarienvogel wie bei den anderen Regeln.
   - Fertig, wenn `pnpm arch` grün ist und die Regel bei einem Test-Import rot wird.
2. **Horizont (E2).**
   - Tests zuerst für `buildOffers`/`validateRaw`/`expansionWindow`: Fenster heute + 12 M, keine Horizont-Warnungen, Zählung „nach dem Datenhorizont“.
   - Dann aus `runs/2026-10-04/raw/` mit 12 Monaten bauen und `site.json` gzip messen. Wert in den Plan (Abschnitt Ergebnis).
   - Fertig, wenn die Messung unter 250 kB liegt (sonst Stopp, E2) und `pnpm check` grün ist.
3. **Zustand `data/raw` (E5).**
   - `ProviderRaw` (Zod), Lesen/Schreiben in `io/files.ts`, `buildOffers` liest `ProviderRaw[]`.
   - Einmal-Migration `runs/2026-10-04/raw/*.json` → `data/raw/<id>.json` als Skript in `scripts/pipeline/migrate-0015.ts`, das danach gelöscht wird.
   - **Äquivalenzprüfung** als Teil des einmaligen Migrationsskripts, nicht als dauerhafter Unit-Test: Er hinge an Live-Daten und würde nach dem ersten Nachtlauf rot. `build` aus `data/raw` muss bei gleichem Fenster dieselben Angebote ergeben wie `data/offers.json` vom 04.10., abgesehen von `horizon` und Terminen jenseits der 4 Monate. Das Ergebnis kommt in den Plan.
   - Fertig, wenn die Prüfung bestanden ist und `data:validate` die neuen Regeln prüft (verwaiste Datei warnt, fehlende Datei erlaubt).
4. **Abruf (E4).**
   - Schemafeld `request`, Platzhalter `{von}`/`{bis}`, `io/browser.ts`, `pdftotext`, `pnpm pipeline fetch`.
   - Tests mit HTML-, iCal- und PDF-Fixtures für alles Reine: Platzhalter, `request`, Auswahl je `kind`, Ausfall-Regel der Sammelkalender.
   - **Kein Playwright-Test in Vitest.** Vitest läuft in `check:fast` (pre-commit, CI-Job `check` ohne Browser). `io/browser.ts` ist reine Verdrahtung (`goto`, `content()`) ohne Logik. Geprüft wird es durch `pnpm pipeline fetch` in Schritt 5 und jede Nacht im Bericht (JS-Anbieter mit Zeichenzahl). Diese Begründung steht als Kommentar in der Datei.
   - Fertig, wenn `pnpm pipeline fetch` lokal läuft und je Eintrag Status und Zeichen zeigt.
5. **Katalog ausführbar machen** (Datenarbeit mit dem Skill).
   - Jede Agenten-Anweisung in `notes` wird URL, Platzhalter oder `request`. Paginierte Seiten werden eigene Einträge.
   - Fertig, wenn `pnpm pipeline fetch` für jeden Eintrag Status < 400 und mehr als 200 Zeichen meldet. Ausnahmen (z. B. Eversports mit 403 auch in Playwright) stehen mit Grund in `notes` und in der Ergebniszeile des Plans.
6. **Extraktion (E3).**
   - Prompt, Eingabe-Bauer, `io/llm.ts`, `extractProvider`, Cache-Regel.
   - Fertig, wenn alle Fehlerpfad-Tests aus E8 grün sind und ein lokaler Lauf `pnpm pipeline run --only <3 Anbieter> --skip-gate` mit Haiku gültige `data/raw`-Dateien schreibt.
7. **`pipeline run`, `status`, Exit-Regeln (E6, E7).**
   - Fertig, wenn die Ampel-Tests grün sind und ein voller lokaler Lauf (`--skip-gate`, Haiku) einen Bericht erzeugt. Der Bericht kommt als Beispiel in den Plan (Ergebnis).
8. **Evals bauen (E8).**
   - Fallformat, `capture`, Scorer, Runner, `report`, Gate, CI-Integrität und Replay.
   - Danach 25 Fälle samt Referenzen (2 Durchgänge, Diff, 5 Stichproben durch den Nutzer).
   - Fertig, wenn der Satz in CI grün ist und jeder Tag aus E8 mindestens einen Fall hat.
9. **Basislauf und Modellwahl (E11).**
   - Haiku und 2–3 kostenlose Kandidaten, je `--repeat 3`.
   - Schwellen festlegen (Begründung im Plan), Ergebnisse committen, Nachtrag in ADR 0016.
   - Fertig, wenn mindestens ein Modell das Gate besteht.
10. **Nachtlauf im Schatten (E6, E12).**
    - `nightly.yml`, `eval.yml`; Nutzer legt Secrets und Variablen an (siehe unten).
    - Fertig, wenn 5 Nächte gelaufen sind und die Bedingungen aus E12 erfüllt sind.
11. **Umschalten und aufräumen.**
    - `NIGHTLY_PUBLISH=1`.
    - Skill neu schreiben (E10), alte Befehle entfernen (knip grün).
    - `CLAUDE.md` (Abschnitt Daten: Nachtlauf statt Skill-Lauf) und `docs/ideas.md` nachziehen.
    - Fertig, wenn der erste veröffentlichte Nachtlauf über CI deployt ist und `https://zwergenplan.app/data/meta.json` den Commit zeigt.

`/arch-review` ist Pflicht (neue Module, Schemaänderung, mehr als 200 Zeilen), am Ende jeder Stufe.

`/browser-review` (live) läuft zweimal, jeweils mit Kalender und Liste auf 320 px und im Querformat. Der UI-Code ändert sich nicht, die Datenmenge aber wächst.
- Am Ende von Stufe A, sobald der erste Datenstand mit 12-Monats-Fenster live ist. Ab dann werden regelmäßige Gruppen 12 Monate fortgeschrieben.
- Nach dem ersten veröffentlichten Nachtlauf, mit vollständig erfassten 12 Monaten.

### Was der Nutzer tun muss

- E9 entscheiden (Ablage der Eingaben).
- API-Schlüssel anlegen und als Secrets hinterlegen: Anthropic (Basislauf Haiku) und je kostenloser Kandidat (Google AI Studio, OpenRouter).
- Repo-Variablen `LLM_BASE_URL`, `LLM_MODEL` setzen, später `NIGHTLY_PUBLISH=1`.
- 5 Referenzfälle stichprobenartig prüfen (Schritt 8).

## Tests (Überblick)

| Bereich | Art | Wo |
|---|---|---|
| Horizont, Fenster, Zählung | Unit | `lib/build-offers.test.ts`, `lib/raw.test.ts` |
| `ProviderRaw`, Cache-Regel, Fehler-, `ausstehend`- und Erholungspfad, Build-Probelauf, Titel-Anker, `via` | Unit mit Fake-Client | `lib/extract.test.ts` |
| Wiederhol-Regeln (429, 5xx, `Retry-After`, Timeout) | Unit mit injiziertem `send`/`sleep` | `lib/llm-retry.test.ts` |
| Eingabe-Bauer, Platzhalter, `request`, Ausfall-Regel Sammelkalender, erlaubte URLs | Unit | `lib/input.test.ts` |
| Abruf je `kind` (ohne Playwright) | Unit mit Fixtures | `lib/*.test.ts` |
| Exit-Codes 0/1/2 | Unit über eine reine Entscheidungsfunktion | `lib/run-outcome.test.ts` |
| Statusbericht, Ampel | Unit mit Fixtures | `lib/status.test.ts` |
| Scorer, Gate | Unit | `lib/eval-score.test.ts`, `lib/eval-gate.test.ts` |
| Eval-Satz Integrität, Replay | Unit über `evals/cases/` | `lib/eval-cases.test.ts` |
| Äquivalenz `data/raw` → offers | einmalige Prüfung im Migrationsskript (kein dauerhafter Test) | `scripts/pipeline/migrate-0015.ts` |
| SSE-Parser, Einbruchschutz, Teilausfall der Sammelkalender, verwaiste Datei, unbekannter Ort | Unit | `lib/sse.test.ts`, `lib/extract.test.ts`, `lib/input.test.ts`, `lib/build-offers.test.ts` |
| Zeitbudget (offene Anbieter → `ausstehend`) | Unit mit Fake-Uhr | `lib/extract.test.ts` |
| `nightly.yml` ohne `--skip-gate`, mit `NIGHTLY_PUBLISH`-Bedingung | Unit (liest YAML) | `scripts/pipeline/workflows.test.ts` |

## Risiken

- **R1 – Kostenlose Modelle sind zu schwach oder zu knapp begrenzt.** Die Evals zeigen das, bevor es Daten kostet. Haiku bleibt als bezahlte Rückfalloption mit derselben Konfiguration.
- **R2 – Ausgabelimit bei großen Anbietern** (FBS, 85 Events in einem Paket). Fall `gross` im Eval. Ist ein Modell sonst gut und scheitert nur hier, wäre die Idee „Anbieter je Programmseite aufteilen“ der nächste Plan. Bis dahin bleibt der Anbieter mit alten Daten und 🟡 sichtbar.
- **R3 – Bot-Schutz** (Eversports 403 auch im Headless-Browser). Der Anbieter bleibt `fehler` und sichtbar. Der Wartungslauf sucht eine andere Seite (z. B. die Kursseite des Anbieters statt des Widgets).
- **R4 – Rauschen im Seitentext** (Datumsanzeigen, Teaser) zerstört Cache-Treffer. Das kostet nur Aufrufe, und der Bericht zeigt die Quote. Normalisieren erst bei Bedarf (Idee).
- **R5 – Änderungen trotz `temperature: 0`.** Eine geänderte Seite kann auch unbeteiligte Angebote dieses Anbieters leicht verändern (Themen, Titel → neue ID bei Kursen). Die Evals messen die Streuung über `--repeat`. Der Bericht zeigt +neu/−weg je Anbieter.
- **R6 – Prompt-Injection über Webseiten.** Die Ausgabe ist durch Schema, `sourceUrl` und `https:`-Regel begrenzt. React escaped Texte. Der Schaden wäre ein falscher Text oder Link auf einer privaten Seite. Das ist hinnehmbar.
- **R7 – Wachsende Git-Historie** durch nächtliche Commits (`offers.json` ≈ 63 kB gzip, Deltas kleiner). Nach einem Monat messen (`git count-objects -vH`), Idee falls nötig.
- **R8 – Rechtliches zu den Eval-Eingaben:** E9.

## Review (2026-10-06) – Verdict: Überarbeiten (1. Durchgang)

Unabhängiger `plan-reviewer`. Die Blocker sind eingearbeitet, ein zweiter Durchgang folgt.

**Übernommen**
- **B1 Sammelkalender** → E4 (Ausfall macht abhängige Anbieter `fehler`, `ProviderRaw.sources`), E3 (erlaubte `sourceUrl` inkl. `finalUrl` und `detailUrl`; `via` setzt der Code), Ausgangslage (`coveredBy`, `select.ts:29`).
- **B2 Schatten ohne Zustand** → E12, E6. Im 1. Durchgang mit Branch `nachtlauf-schatten` gelöst, im 2. Durchgang durch `actions/cache` ersetzt.
- **W1 stabile IDs** → E3 Titel-Anker. Platzhalter und Fenster der Sammelkalender auf Monatsanfang (`{von}`/`{bis}`), damit der Cache trifft.
- **W2 ein Anbieter kippt den Lauf** → Build-Probelauf je Anbieter (E3), Status `ausstehend` bei Rate-Limits (E5), Exit-Code 2 „sichern, aber rot“ (E6).
- **W3 ADR-Widersprüche** → ADR 0016 „Abweichungen“ (0002, 0003, 0011, ein Datenvertrag), Schritt 1 zieht ADR 0003/0011 und die Schichtentabelle nach.
- **W4 Playwright in Vitest** → kein Playwright-Test in Vitest, mit Begründung (Schritt 4).
- **W5 Wiederhol-Logik ungetestet** → `lib/llm-retry.ts`, rein mit injiziertem `send`/`sleep`.
- **W6 Timeout, Extraktor-Version** → 600 s. Die Version hasht auch Eingabe-Bauer und Nachbearbeitung, das Gate vergleicht den Endpunkt-Host. `inputHash` deckt die ganze User-Nachricht ab.
- **W7 Größe zu früh gemessen** → zweite, verbindliche Messung mit Schatten-Daten in CI als Gate vor `NIGHTLY_PUBLISH` (E2, E12).
- **W8 Konflikte** → `publish` baut und validiert nach dem Rebase neu; Regel „nie von Hand lösen“; `fetch-depth: 0`.
- **W9 neuer Anbieter macht CI rot** → fehlende `data/raw`-Datei ist erlaubt (E5). Statt eines neuen Status `neu` ist das die einfachere Lösung.
- **Hinweise:**
  - `url` darf `http:` sein, fremde Hosts sind nur ein Berichtshinweis.
  - `writeJson` korrekt beschrieben; Navigation über `lastSessionDay` korrigiert.
  - Regel `pipeline-playwright-only-in-browser` nur für `^scripts/pipeline/`.
  - Code-Fence vor dem Parsen entfernen (Anthropic ignoriert `response_format`); Thinking bei Claude 5 im Basislauf festhalten.
  - Limits von OpenRouter und GitHub Models in E11.
  - `actions/cache` mit `restore-keys`; `inputs.only` nur über `env`; lefthook im Nachtlauf ausdrücklich gewollt.
  - Äquivalenzprüfung als einmaliges Skript.
  - Keine Handarbeit in `data/raw` (Regel in `CLAUDE.md`).
  - Browser-Review live mit 320 px und Querformat.

**Abgelehnt**
- **Aufteilen in drei Pläne.** Die Stufen teilen sich Entscheidungen (`ProviderRaw`, Eingabe-Bauer, Extraktor-Version, Gate), und drei Pläne würden sie wiederholen oder quer verweisen. Stattdessen gliedert sich der Plan in die Stufen A/B/C. Jede ist für sich lieferbar und endet mit `/arch-review`.

## Review (2026-10-06) – Verdict: Überarbeiten (2. Durchgang)

Neuer, unabhängiger `plan-reviewer` auf die überarbeitete Fassung.

**Übernommen**
- **B1 Teilausfall der Sammelkalender löscht still Daten:**
  - `fetchSource` liefert `failed`. Jede gescheiterte Abfrage sperrt die Anbieter dieses Adapters, mit und ohne `coveredBy` (E4).
  - Ein 404 auf Seite 1 von frankenkids gilt als Ausfall.
  - Dazu kommt der Einbruchschutz mit `held` und Bestätigung in der Folgenacht (E5).
- **B2 600 s mit undici unerreichbar** → Streaming (`stream: true`, `include_usage`), SSE-Parser rein in `lib/sse.ts`, Timeout als Pause zwischen Chunks. Abbrüche zählen nicht als systemisch (E3).
- **W1/W2 Schatten-Branch scheitert am Hook bzw. springt zurück** → Der Schatten nutzt `actions/cache` statt eines Branchs, gelesen nur bei `NIGHTLY_PUBLISH != '1'`. Kein Commit, kein Hook, kein Rücksprung (E12). Einfacher als der vorgeschlagene Orphan-Branch mit `LEFTHOOK=0`, ohne Ausnahme vom Gate.
- **W3 kein Zeitbudget** → `RUN_BUDGET_MIN` 45. Danach werden offene Anbieter `ausstehend`, alles Fertige wird gesichert (E3).
- **W4 eingefrorener Text vs. Extraktor-Version** → Eingefroren werden die Bausteine (Seitentexte je URL, Kandidaten, Katalogauszug), der Text entsteht mit dem aktuellen Eingabe-Bauer (E8).
- **W5 Artefakt widerspricht E9** → Das Artefakt enthält keine `inputs/` (E5, E6).
- **W6 Konflikte in `data/raw`** → Im Nachtlauf gewinnt die eigene Seite, lokal gewinnt upstream, danach immer `pipeline build` (E6).
- **W7 Katalog-Umbau blockiert** → `build` verwirft Events mit unbekanntem Ort und lässt neu extrahieren; verwaiste Dateien löschen `build`/`run` selbst (E5).
- **W8 ADR veraltet** → ADR 0016 neu geschrieben: `{von}`/`{bis}`, Hash-Umfang, Host im Gate, Exit-Codes, `ausstehend`, Einbruchschutz, Schatten, Regel „nie von Hand“, Abweichung von ADR 0006.
- **Hinweise:**
  - Titel-Anker 1:1, exakte Titel zuerst.
  - Erlaubte URLs stehen in `case.json`.
  - Testtabelle: Äquivalenz ist ein einmaliges Skript.
  - Schatten sichert auch `offers.json`.
  - Workflow: Exit-Code über `$GITHUB_OUTPUT`, `apt-get update`, `oepnv`-Fehler per Datei.
  - Kandidaten im Artefakt, dazu `gh run download` für `add-provider`.
  - `/browser-review` schon nach Stufe A.
  - Live-Stand aus `meta.json` im Bericht.
  - R1: Kompatibilitäts-Endpunkt von Anthropic nicht „production-ready“, Ausweg OpenRouter (E11).
  - GitHub Models gestrichen (Ausgabelimit).

**Abgelehnt**
- **Mit 15 statt 25 Eval-Fällen starten.** Belastbare Evals sind ausdrücklich Priorität des Nutzers. Der Satz bleibt bei 25. Die Mehrarbeit sind 10 Referenzfälle, die wegen der 2-Durchgangs-Regel ohnehin weitgehend Agentenarbeit sind.
- **`eval.yml` braucht `models: read`.** Entfällt mit GitHub Models.

## Review (2026-10-06) – Verdict: Freigabe mit Änderungen (3. Durchgang)

Dritter, unabhängiger `plan-reviewer`. Die Blocker der Durchgänge 1 und 2 bestätigt er als gelöst (Streaming, Schatten über `actions/cache`, Teilausfall der Sammelkalender). Alle Punkte sind eingearbeitet. Nach Skill-Regel (höchstens zwei Re-Reviews) folgt kein weiterer Durchgang. Offene Blocker gibt es keine.

**Übernommen**
- **B1 Zeitbudget nicht hart** → Das Budget ist eine harte Frist: `AbortSignal` mit min(15 Min., Restbudget) für jeden Aufruf, jede Wiederholung und jede 429-Pause. Was abbricht, wird `ausstehend`. `timeout-minutes: 90`, Test mit Fake-Uhr (E3, E6).
- **W1 Zustandsregeln mehrdeutig** → Entscheidungstabelle in E5 mit fester Reihenfolge. Bei Einbruch bleibt der alte Hash, damit die Bestätigung greift. Ein Cache-Treffer löscht `held`.
- **W2 Teilausfall macht chronisch rot** → Gesperrte Anbieter werden `ausstehend` statt `fehler`. Gescheiterte Abfragen werden einmal wiederholt, die Migration setzt `sources` aus `via` (E4).
- **W3 Extraktor-Hash zu breit** → Zuschnitt in `lib/extract-prompt.ts` (gehasht: Eingabe, Prompt, Parsen, Validierung) und `lib/refresh.ts` (nicht gehasht: Zustand). Dazu eine CI-Warnung bei fehlendem bestandenem Eval (E3).
- **W4 rote CI nach dem Nacht-Commit bleibt stumm** → Liegt die Live-Seite mehr als 1 Tag zurück, gibt `run` Exit 2, der geplante Lauf wird rot und die Mail geht an den Autor des Crons (E6).
- **W5 Widersprüche** → Verwaiste Datei „warnt“ (Schritt 3), das Fenster der Sammelkalender ist überall `{von}`…`{bis}` (E2).
- **W6 Konfliktpfad in `publish` zu komplex** → gestrichen. Ist der Push kein Fast-Forward, gibt es Exit 1, und die nächste Nacht wiederholt den Lauf. `fetch-depth: 0` entfällt.
- **W7 Übergangsfunktion in Stufe A** → gestrichen. Zwischen Stufe A und B gibt es keinen Skill-Lauf.
- **Hinweise:**
  - `mkdir -p runs`.
  - SSE: Kommentarzeilen ignorieren, der Leerlauf-Timer zählt Bytes.
  - Obergrenze der Eingabe 400 000 Zeichen, darüber `fehler`, nie kürzen.
  - Rest zu GitHub Models entfernt.
  - `status` offline: Live-Stand „unbekannt“.
  - Commit-Zahlen aus `summary.json`.
  - Prüf-Branch als benannte Ausnahme.
  - Kandidaten im Artefakt ohne `description`.
  - OpenHolidays fällt auf den Cache zurück.
  - `status: fehler` vom Modell → Zeile 7 der Tabelle.

**Abgelehnt**
- keine
