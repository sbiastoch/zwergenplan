# Plan 0015 – Nächtliche Datenpipeline mit Evals

Status: Review eingearbeitet für Nachtrag A (stabile IDs, 2026-10-08, neue Stufe 0; Nutzerentscheide N-I1 und N-I2 am 2026-10-08 mit „ja“ entschieden und eingearbeitet, N-I3 und N-I4 offen, umsetzbar mit den empfohlenen Standards). Hauptteil freigegeben nach Plan-Review (3 Durchgänge), Umsetzung offen. Nutzerentscheidungen vom 2026-10-06: E9 öffentlich (a), Datenhorizont 12 Monate bestätigt, Secrets folgen in Stufe C. Voraussetzung vor Stufe A live: Plan 0018 (Kalender-Export nur altersgerecht)
Datum: 2026-10-06

(ADR 0002 Hosting und Datenfluss, ADR 0003 Datenmodell, ADR 0004 Backpressure, ADR 0006 Recherche-Pipeline, Plan 0002 Pipeline, Plan 0009 Fahrplan; neu: ADR-Entwurf 0016; mit Nachtrag A neu: ADR-Entwurf 0022 stabile IDs.)

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
         Erfolg → data/raw/<id>.json neu   (kein Titel-Anker mehr, Nachtrag A, E21)
         Fehler → alte Events bleiben, status fehler; Rate-Limit oder Zeitbudget erschöpft → status ausstehend
         Einbruch (≥ 3 Events → leer oder < Hälfte) → zurückhalten bis zur Bestätigung (E5)
    4. build: data/raw/*.json (+ ID-Zuordnung und Kursfortschreibung gegen data/offers.json, Nachtrag A, E14) → data/offers.json
    5. Bericht (E7) → stdout, $GITHUB_STEP_SUMMARY, runs/<datum>/bericht.md
  upload-artifact runs/<datum>/       # Eingaben, Modellantworten, Kandidaten, Bericht, Zustand – 14 Tage
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
  - Alles Übrige liegt in **`lib/refresh.ts`**: Zustandslogik, Cache-Regel, Einbruchschutz, Zeitbudget, Ausfall-Regeln, Platzhalter.
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
- **Titel-Anker – entfällt (Nachtrag A, E21).** Ursprünglich sollte der Code nach der Validierung den alten Titel übernehmen, wenn ein neues Event einem alten des Anbieters entspricht (1:1, exakte Titel zuerst, dann ähnlicher Titel mit überlappenden Terminen), damit sich die ID nicht ändert. Seit Nachtrag A hängt die ID nicht mehr am Titel: Die Zuordnung in `build` (E14) übernimmt die gespeicherte ID mit fast denselben Regeln. Der Titel darf sich also ändern, und ein zweiter Mechanismus wäre doppelt.
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
  | 5 | Modell liefert gültiges Ergebnis, kein Einbruch | neu | aus Antwort | neu | jetzt | löschen | löschen |
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
  - Die Kursfortschreibung (ADR 0006) bleibt und liest weiter das bisherige `data/offers.json`. Seit Nachtrag A hängt sie an der ID-Zuordnung (E14) statt an gleichem Titel-Slug.
- **Warum im Repo und nicht in `actions/cache`?** Der Zustand ist sichtbar, diffbar und dauerhaft. Lokale Läufe und der Nachtlauf sehen denselben Stand, und es braucht keine weitere Infrastruktur. Einzige Ausnahme ist der vorübergehende Schattenbetrieb (E12).
- **Biome:** `data/raw/**` schreibt `writeJson` (`JSON.stringify(v, null, 1)`, Schlüssel in fester Reihenfolge des Zod-Schemas). Biome nimmt die Dateien aus, wie `data/oepnv/fahrplan.json`.
- **Schema-Ort (Abweichung von „ein Datenvertrag“, `docs/architecture.md`):** `ProviderRaw` ist Zustand der Pipeline, kein Datenvertrag der Website. Weder `build-data.ts` noch `src/` lesen ihn.
  - Das Schema liegt deshalb wie `RawBatch` (ADR 0006) in `scripts/pipeline/lib/raw.ts`. Seine Event-Felder sind aus `OfferFields` abgeleitet, und es wird nach `schema/provider-raw.schema.json` exportiert.
  - `scripts/validate-data.ts` darf dafür aus `scripts/pipeline/lib` importieren. Das ist eine neue erlaubte Kante in der Schichtentabelle, die ADR 0016 begründet.
- **Commit-Rauschen:** `checkedAt` ändert sich jede Nacht, also gibt es jede Nacht einen Commit. Das ist gewollt. Der Commit ist der Herzschlag des Systems und hält den Cron über die 60-Tage-Regel aktiv. Der Commit enthält nur `data/`.
- **`runs/<datum>/`** ist gitignored. Darin liegen `inputs/<id>.txt`, `responses/<id>.json` (nur neu extrahierte), `candidates/` (Kandidaten der Sammelkalender), `summary.json` (Laufzahlen für `publish`) und `bericht.md`.
  - Das Artefakt des Nachtlaufs enthält `runs/<datum>/` vollständig (E9).

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
      - actions/upload-artifact nachtlauf-<datum>: runs/, data/raw und data/offers.json (14 Tage), if: always()
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
- **Fehlerpfade mit Fake-Client:** kein JSON, Schemafehler mit Korrektur in der Wiederholung, zweimal Schemafehler, 429 und dann Erfolg, Timeout, `finish_reason: length`, fremde `sourceUrl`, Cache-Treffer ohne Aufruf, Seitenfehler (alte Events bleiben, `failingSince` wird gesetzt), Erholung (`failingSince` verschwindet), 429 nach allen Wiederholungen (`ausstehend`, kein `failingSince`, nicht in der 20-%-Regel), Sammelkalender ausgefallen (abhängige Anbieter `fehler`, alte Events bleiben), Build-Probelauf scheitert (nur dieser Anbieter `fehler`), 3 systemische 401 (Exit 1), mehr als 20 % Fehler (Exit 2).

### E9 – Ablage der eingefrorenen Eingaben: im öffentlichen Repo (Nutzerentscheidung 2026-10-06)

`evals/inputs/**` enthält vollständige Texte fremder Webseiten, und das Repo ist öffentlich. Der Nutzer hat entschieden: Die Eingaben liegen **im öffentlichen Repo** unter `evals/inputs/` (Variante a). Das ist die einfachste Lösung, ohne zweites Repo und ohne Token.

- Verworfen: (b) ein privates Repo mit PAT, (c) nur lokal (nicht reproduzierbar).
- Folge für das Artefakt des Nachtlaufs: Die Ausschlüsse aus E5 (keine `inputs/`, Kandidaten ohne `description`) dienten nur diesem Schutz. Sie **entfallen**, das Artefakt enthält `runs/<datum>/` vollständig. Das ist einfacher und hilft beim Nachsehen.
- Unverändert gilt: Was auf der Website erscheint, steht in eigenen Worten (`summary`).

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
- **Stufe 0** (Schritte S1–S5, Nachtrag A): stabile IDs. Unabhängig von Plan 0018 und von den übrigen Stufen. Sie muss live sein, bevor Stufe B den ersten Datenstand veröffentlicht, denn der erste Modelllauf extrahiert alle Anbieter neu und ändert viele Titel.
- **Stufe A** (Schritte 1–3): ADR, Horizont, Zustand in `data/raw`. **Voraussetzung:** Plan 0018 (Kalender-Export nur altersgerecht) ist live. Ab dann baut `offers.json` aus `data/raw` mit 12-Monats-Fenster. Zwischen Stufe A und Stufe B gibt es **keinen** Skill-Lauf. Der Bestand vom 04.10. bleibt stehen, der nächste Datenlauf ist der erste lokale `pnpm pipeline run` in Stufe B. Eine Übergangsfunktion für das alte Paketformat gibt es nicht.
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

- API-Schlüssel anlegen und als Secrets hinterlegen: Anthropic (Basislauf Haiku) und je kostenloser Kandidat (Google AI Studio, OpenRouter).
- Repo-Variablen `LLM_BASE_URL`, `LLM_MODEL` setzen, später `NIGHTLY_PUBLISH=1`.
- 5 Referenzfälle stichprobenartig prüfen (Schritt 8).

## Tests (Überblick)

| Bereich | Art | Wo |
|---|---|---|
| Horizont, Fenster, Zählung | Unit | `lib/build-offers.test.ts`, `lib/raw.test.ts` |
| `ProviderRaw`, Cache-Regel, Fehler-, `ausstehend`- und Erholungspfad, Build-Probelauf, `via` | Unit mit Fake-Client | `lib/extract.test.ts` |
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
- **R5 – Änderungen trotz `temperature: 0`.** Eine geänderte Seite kann auch unbeteiligte Angebote dieses Anbieters leicht verändern (Themen, Titel). Die ID bleibt seit Nachtrag A trotzdem (E14). Die Evals messen die Streuung über `--repeat`. Der Bericht zeigt +neu/−weg je Anbieter.
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

## Nutzerentscheidungen (2026-10-06, nach dem Review)

- **E9:** Eval-Eingaben im öffentlichen Repo (Variante a). Damit entfallen die Ausschlüsse im Artefakt (E5).
- **Datenhorizont 12 Monate** (E2) bestätigt.
- **Secrets und Variablen** (Stufe C) legt der Nutzer später an.
- **Neue Anforderung:** Regelmäßige Termine landen beim ICS-Export nur, solange das Angebot zum Alter des Kindes passt. Umgesetzt als eigener Plan 0018 (UI, unabhängig lieferbar). Er muss live sein, bevor Stufe A das 12-Monats-Fenster veröffentlicht. Sonst brächte „Alle Termine“ eine Wochengruppe mit etwa 50 Terminen in den Kalender, auch nachdem das Kind herausgewachsen ist.

## Nachtrag A (2026-10-08): stabile IDs für Angebote und Anbieter

Auftrag des Nutzers: Das Konzept „stabile IDs“ kommt in diesen Plan, nicht in einen eigenen. Es bildet die neue **Stufe 0** (Schritte S1–S5). Sie ist unabhängig von Plan 0018 und von den Stufen A–C lieferbar und geht vor ihnen live.

**Nutzerentscheid vom 2026-10-08**, wörtlich „NI1 Und 2: doch“, also gegen die bisherige Empfehlung:
- **N-I1 = ja:** kurze Pfade `a/<id>/` (Angebot) und `p/<id>/` (Anbieter). Die alten Ordner `angebot/` und `anbieter/` leiten weiter (E19).
- **N-I2 = ja:** Auch Anbieter bekommen eine feste Kurz-ID, gespeichert im Katalog (E16).

Eingearbeitet sind die beiden Entscheide in E13, E15, E16, E19, E20, E22, Budget, Tests, Schritte, Risiken und ADR-Entwurf 0022.

Bezug: ADR 0003 (Datenmodell, UID), ADR 0006 (ID-Regel, Kursfortschreibung), ADR 0007 (Merklisten-ICS im Browser), ADR 0010 (Schichten `src/data`), ADR 0012 (Startbudget), ADR 0014 (Push), ADR 0016 (dieser Plan), ADR 0020 (Teilen per Link, Pfadvertrag); **neu ADR-Entwurf 0022** (`docs/adr/0022-stabile-ids.md`, im selben Commit). Plan 0026 (Stufe 2 baut hierauf).

### Befund (2026-10-08)

- **Regel heute** (ADR 0003, ADR 0006, `src/domain/ids.ts`): Die Offer-ID ist `providerId--slug(title)--venueId`, bei `kurs` und `einmalig` mit `-YYYYMMDDtHHmm` des ersten Termins im Mittelteil. `validateDataset` prüft `id === offerId(offer)` (`src/domain/dataset.ts:60`). Die ID ist also eine Funktion von Titel und erstem Termin.
- **Titel ändern sich:** Von 333 Angeboten (117 regelmäßig, 170 Kurse, 46 einmalig) tragen 251 Wochentag, Uhrzeit, Datum oder Saison im Titel, z. B. „PEKiP (Babys geb. Jan.–Feb. 2026, Di 9:30)“, „Auf Entdeckungsreise mit Papa (10–24 Monate, Mi ab 11.11.)“. Jede Umformulierung durch die Recherche ergibt eine neue ID. In Stufe B extrahiert ein Sprachmodell alle Anbieter neu; danach ändern sich viele Titel auf einmal.
- **Was heute hält:** Nur laufende Kurse mit **gleichem Titel-Slug** behalten ihre ID (`scripts/pipeline/lib/build-offers.ts`, Schritt 2 „Kursfortschreibung“). Der Titel-Anker aus E3 hätte ähnliche Titel gehalten, wirkt aber erst ab Stufe B und hilft nicht bei geänderter Uhrzeit oder verschobenem Kursbeginn.
- **Folgen einer neuen ID:**
  - Geteilte Links (Plan 0026, seit 2026-10-08 live unter `angebot/<id>/` und `anbieter/<id>/`, ADR 0020) landen auf „Dieses Angebot ist nicht mehr im Zwergenplan.“.
  - Gemerkte Angebote verschwinden still von der Merkliste (`src/domain/saved.ts` blendet unbekannte IDs aus).
  - Ein erneuter Kalender-Import erzeugt Duplikate, weil die UID die ID enthält (ADR 0003).
  - Die Wochen-Nachricht hält das Angebot für neu (`seenIds`, `src/sw/push-tailor.ts`).
  - Plan 0026, Stufe 2 (Merkliste im Fragment über Kurz-Hashes der IDs) erbte das Problem.
- **Wo die Angebots-ID überall steht:**

  | Stelle | Ort im Code |
  |---|---|
  | `data/offers.json`, `site.json` (Reihenfolge bei gleichem Beginn nach ID) | `src/domain/schema.ts`, `src/domain/site-data.ts`, `scripts/build-data.ts` |
  | ICS-Pfade `ics/<id>.ics`, `ics/<id>/<YYYYMMDDTHHmm>.ics` | `src/domain/ics-paths.ts` |
  | UID `<id>--<YYYYMMDDTHHmm>@zwergenplan` (auch Merklisten-ICS, ADR 0007) | `src/domain/ics.ts:30` |
  | Merkliste `zwergenplan.merkliste` (JSON-Array von IDs) | `src/data/preferences.ts`, gelesen in `useSaved` (`src/ui/use-app-state.ts`) |
  | `seenIds` im IndexedDB (Wochen-Nachricht, Plan 0017) | `src/sw/push-tailor.ts` |
  | Query `?angebot=` | `src/domain/route.ts` |
  | Vorschauseite `angebot/<id>/`, Kachelbild, `404.html` (Muster `[a-z0-9-]{1,240}`) | `src/domain/share.ts`, `scripts/lib/share-pages.ts`, `scripts/og-images.ts` |
  | Merkliste im Fragment (geplant) | Plan 0026, E10 |

- **Anbieter-IDs** sind kebab-case, im Katalog von Hand vergeben (höchstens 38 Zeichen, Stand 2026-10-08) und nicht aus Recherchetext abgeleitet. Sie ändern sich nur durch eine bewusste Umbenennung im Wartungslauf (E10).
  - Intern stehen sie in `offers.providerId`, `coveredBy`, in den Rohdaten der Subagenten (`schema/raw-batch.schema.json`), ab Stufe A im Dateinamen `data/raw/<id>.json` und über `offerKey` in jeder Angebots-ID.
  - Öffentlich stehen sie in `site.json` (`providerId` je Angebot), `anbieter.json` (`id`), `?anbieter=`, `anbieter/<id>/` und seit Plan 0025, Etappe 1 (live seit 83da3b0) in der Merkliste gemerkter Anbieter (`zwergenplan.anbieter-merkliste`, `src/data/preferences.ts:10`, bereinigt von `cleanSavedProviders` in `src/domain/saved.ts:108`).
- **Messungen am Bestand** (Wegwerf-Skript außerhalb des Repos, 2026-10-08):
  - Die Kurz-IDs `shortId(id, 0)` (E13) der 333 heutigen IDs kollidieren nicht.
  - Selbstabgleich: 2 Paare **verschiedener** Angebote haben gleichen Anbieter, gleichen Ort und identische Termine, z. B. „Kleinkindturnen nach Pikler (12–36 Monate, Mo 16:30)“ und „Musikalische Früherziehung (1–3 Jahre, Mo 16:30)“.
  - 213 Paare haben gleichen Anbieter, Ort und Format und mindestens 50 % gemeinsame Tage, z. B. zwei PEKiP-Gruppen dienstags um 9:30 und 11:30.
  - Folgerung: Termine allein oder Tage allein reichen für eine Zuordnung nicht. E14 verlangt deshalb Eindeutigkeit, in Stufe 2 sogar den einzigen Kandidaten.
  - Anbieter (nach N-I2): `shortId(katalogId, 0)` kollidiert weder unter den 74 Einträgen mit `role: anbieter` noch unter allen 83 Katalog-Einträgen. Keine Katalog-ID passt auf `^[0-9a-z]{8}$`; alte und neue Form sind also eindeutig unterscheidbar (E15). Die Katalog-IDs der Angebote in `site.json` sind im Median 16 Zeichen lang, zusammen 3 186 Zeichen mehr als 8 je Angebot; in `anbieter.json` sind es 941 Zeichen mehr.

### Ziel

- Eine einmal vergebene Angebots-ID bleibt, solange es das Angebot gibt, auch wenn sich Titel, Uhrzeit oder Kursbeginn ändern.
- Alte Links, Merklisten-Einträge und `seenIds` leben weiter.
- Die ID ist kurz genug für Links und für die Merkliste im Fragment, ohne Hash im Browser.
- Anbieter haben ebenfalls eine feste Kurz-ID; jede Anbieter-ID im Browser ist sie (N-I2).
- Geteilte Links sind kurz: `a/<id>/` und `p/<id>/` (N-I1). Alte Links unter `angebot/` und `anbieter/` funktionieren weiter.
- `pipeline build` bleibt rein und deterministisch: gleiche Eingabe und gleicher Vorstand ergeben dieselben IDs.

### Nicht-Ziele

- **Verlegte Einzeltermine** (gleicher Titel, anderer Tag) behalten ihre ID nicht. Das bleibt wie in ADR 0006 „ein anderer Termin“. Idee für `docs/ideas.md` (S5).
- **Zusammenlegung** zweier alter Angebote zu einem, mit Weiterleitung der verschwundenen ID (Review B2). Sie ordnete in genau den Fällen aus dem Befund falsch zu. Ein verschwundenes Angebot bleibt verschwunden, wie heute. Idee für `docs/ideas.md` (S5).
- **Anbieter umbenennen.** Katalog-IDs werden nicht umbenannt (E16). Links hängen nach N-I2 nicht mehr an ihnen, wohl aber die Zuordnung und die Angebots-IDs. Braucht es das einmal, kommt vorher eine Abbildung alt → neu für die Zuordnung (Idee).
- **Kalendereinträge bei Nutzern umschreiben.** Das ist technisch unmöglich (E18).
- **Aliasseiten mit Vorschau für alte Links:** Standard „nein“, Nutzerentscheid N-I4 unten.
- **Kurze Query-Namen** (`?a=`, `?p=`): nein, `?angebot=` und `?anbieter=` bleiben (E19).

### E13 – Angebots-ID: 8 Zeichen, gespeichert statt abgeleitet

- **Form:** `Offer.id` passt auf `/^[0-9a-z]{8}$/` (`SHORT_ID_PATTERN` neu in `src/domain/ids.ts`; dasselbe Muster gilt für die Kurz-ID der Anbieter, E16). Sie steht in `data/offers.json`. Die Pipeline übernimmt sie aus dem Vorstand (E14), statt sie zu berechnen.
- **Alte Form:** `LEGACY_OFFER_ID_PATTERN` ist das bisherige `OFFER_ID_PATTERN`, `MAX_LEGACY_OFFER_ID = 240` das bisherige `MAX_OFFER_ID`. Beide braucht nur noch die Abbildung alt → neu (E15) und `notFoundPage` (`404.html`). Alle Nutzer von `OFFER_ID_PATTERN` und `MAX_OFFER_ID` werden umgestellt: `src/domain/schema.ts:7,120`, `src/domain/route.ts:6`, `src/domain/share.ts:7,15`, `scripts/lib/share-pages.ts:10,292`.
- **Zuordnungsschlüssel:** Die bisherige Formel heißt künftig `offerKey(o)` (Umbenennung von `offerId`, Regel unverändert, weiter in `src/domain/ids.ts`). Er wird nirgends gespeichert. Die Pipeline nutzt ihn für Dubletten (E14, Reihenfolge Schritt 3), für Stufe 0 der Zuordnung und als Saat neuer IDs.
- **`shortId`** (`src/domain/ids.ts`, rein, synchron; cyrb53 nach bryc, diese Fassung, damit die Testvektoren gelten):

  ```ts
  function cyrb53(text: string, seed: number): number {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  /** 8 Zeichen [0-9a-z], 41 Bit */
  export const shortId = (text: string, seed = 0): string => (cyrb53(text, seed) % 36 ** 8).toString(36).padStart(8, "0");
  ```

  Testvektoren (im Befund gerechnet): `atv-1873-frankonia--riesen-zwerge-turnen-fuer-2-bis-3-jaehrige-mo--atv-1873-frankonia` → `d4qshjw0`; `babykonzert-nuernberg--herbst-babykonzert-klassik-auf-der-krabbeldecke-20261108t1100--babykonzert-nuernberg` → `4tpu5qaq`; `brk-familienzentrum--auf-entdeckungsreise-mit-papa-10-24-monate-mi-ab-11-11-20261111t1600--brk-familienzentrum` → `toieuwx3`.
- **Neue ID:** `shortId(offerKey(d), seed)` mit dem kleinsten `seed` (0, 1, 2 …), dessen Ergebnis nicht **belegt** ist. Belegt ist jede `id` im Vorstand und in der schon erzeugten Ausgabe. Vergeben wird in der Reihenfolge von `offerKey`, damit das Ergebnis deterministisch bleibt.
  - **Warum ein Hash und kein Zufall:** Der Build bleibt rein und ohne injizierte Zufallsquelle testbar. Ein Angebot, das nach einer Lücke mit demselben Schlüssel zurückkommt, bekommt seine alte ID zurück. Das gilt auch für Angebote, die schon vor dem Umstieg verschwunden waren: Ihr Schlüssel ist ihre alte lange ID, und die App rechnet diese genauso um (E15).
  - **Warum 8 Zeichen base36 (41 Bit):** Bei 1 000 IDs liegt die Kollisionswahrscheinlichkeit bei etwa 2 · 10⁻⁷, und die Vergabe weicht ohnehin aus. Links bleiben kurz (`a/4tpu5qaq/`, E19), und das Fragment braucht 8 Zeichen je Angebot ohne Trenner.
  - **Keine Wiedervergabe:** Eine ID aus dem Vorstand wird nie an ein anderes Angebot vergeben. Längst verschwundene IDs verfolgt niemand; eine Wiedervergabe an ein anderes Angebot setzte eine Hash-Kollision voraus (R10).
- **Sortierung** von `data/offers.json`: nach `providerId`, `title` (`localeCompare(…, "de")`), Beginn des ersten Termins und zuletzt `id`. Bisher war es die ID, die mit `providerId` begann. Diffs bleiben so lesbar.
- **`site.json`** sortiert weiter nach erstem Termin; bei gleichem Beginn entscheidet künftig der Titel und erst dann die ID (`src/domain/site-data.ts:89–92`). Sonst bestimmte bei gleichem Beginn eine zufällig wirkende ID die Reihenfolge in Liste und Wochen-Nachricht.
- **Schema** (`src/domain/schema.ts`), danach `pnpm schema:export`: `id: z.string().regex(SHORT_ID_PATTERN)`; die Prüfung „id beginnt mit `providerId--` und endet mit `--venueId`“ entfällt. Ein Feld für Aliasse gibt es nicht (E15). `offers.providerId` bleibt die Katalog-ID (E16).
- **`validateDataset`:** Statt `id === offerId(offer)` bleibt nur „IDs eindeutig“ (wie bisher) mit der neuen Form aus dem Schema.

### E14 – Zuordnung gegen den Vorstand

Neues reines Modul **`scripts/pipeline/lib/stable-ids.ts`**:

```ts
export type Draft = Omit<Offer, "id">;
export interface IdAssignment { offers: Offer[]; notes: string[] }
export function assignIds(input: {
  drafts: readonly Draft[];               // nach den Dubletten-Schritten von buildOffers
  previous: OffersFile | undefined;       // data/offers.json vor dem Lauf (fehlt beim ersten Lauf)
  providers: readonly Provider[];         // Katalog, für vorhandene Orte
  horizon: { from: string; to: string };  // Datenhorizont des Laufs (Berliner Daten)
}): IdAssignment;
export function checkIdContinuity(previous: OffersFile | undefined, next: readonly Offer[]): string[];
```

**Vergleichsfenster:** von `horizon.from` des Laufs bis `min(previous.horizon.to, horizon.to)` (Berliner Tage, beide Grenzen inklusive). Beide Seiten werden darauf beschnitten. Grund (Review M1): Der Vorstand endet an seinem eigenen Horizont. Ohne Beschnitt sänke der Wert bei vier Wochen zwischen zwei Läufen und 4 Monaten Horizont auf etwa 13/17 ≈ 0,76.

**Vergleichsgrößen** je Paar aus altem Angebot `p` und neuem Entwurf `d`:
- **gleicher Anbieter:** `p.providerId === d.providerId`.
- **gleicher Ort:** `p.venueId === d.venueId`.
- **`T(p, d)`:** Jaccard-Index der Beginn-Zeitpunkte (auf die Minute) der Termine im Vergleichsfenster. Vergangene Termine zählen nicht, sonst sänke der Wert für laufende Kurse, deren Entwurf nur künftige Termine hat. Hat eine Seite keinen Termin im Fenster, ist `T = 0`.
- **`D(p, d)`:** derselbe Index über die Berliner Tage dieser Termine.
- **Titel:** `similarTitle` aus `scripts/pipeline/lib/similar.ts`.

**Drei Stufen**, nacheinander, jeweils nur über Angebote und Entwürfe, die noch keinen Partner haben:

| Stufe | Bedingung | Auswahl |
|---|---|---|
| 0 gleicher Schlüssel | `offerKey(p) === offerKey(d)` | nur wenn auf beiden Seiten genau ein Paar |
| 1 gleiche Termine | gleicher Anbieter; gleicher Ort, oder `p.venueId` steht nicht mehr im Katalog; `T ≥ 0,8` | Rang `T`, strikt bester für beide Seiten |
| 2 ähnlicher Titel, gleiche Tage | gleicher Anbieter, gleicher Ort, gleiches `format`, `similarTitle`, `D ≥ 0,5` | nur wenn `p` und `d` füreinander der **einzige** Kandidat sind |

- **Eindeutigkeit in Stufe 1:** Ein Paar wird nur genommen, wenn sein `T` für **beide** Seiten strikt größer ist als das jedes anderen Paars dieser Stufe mit `p` oder mit `d`. Dann scheiden beide aus, und die Stufe prüft die übrigen erneut, bis sich nichts mehr ändert. Bei Gleichstand gibt es keinen Treffer, nur den Hinweis „mehrdeutig“; Stufe 2 darf es erneut versuchen.
  - Begründung: Die zwei Paare mit identischen Terminen aus dem Befund würden sonst vertauscht, wenn beide ihren Titel ändern. Eine neue ID ist der heutige Zustand, eine vertauschte wäre ein neuer Fehler.
  - Stufe 1 fragt das Format nicht ab: Ein Angebot, das bei gleichen Terminen von `kurs` zu `regelmaessig` kippt (Modellstreuung), ist dasselbe. Der Ort darf nur fehlen, wenn der alte Ort aus dem Katalog verschwunden ist (Umbenennung im Wartungslauf).
- **Einziger Kandidat in Stufe 2** (Review M2): Zwei Gruppen am selben Wochentag haben `D = 1`. Eine Rangfolge über die Titelähnlichkeit entschiede dann über einen Zufallswert der Formulierung. Deshalb gilt: Hat `d` mehr als ein mögliches `p` oder `p` mehr als ein mögliches `d`, gibt es keinen Treffer.
- **Schwellen** als Konstanten `SAME_SESSIONS = 0.8` und `SAME_DAYS = 0.5` im Modul. 0,8 lässt einer Wochengruppe einzelne Ferientage, 0,5 lässt eine Uhrzeit wechseln und einige Termine wegfallen. Der Probelauf in S1 misst sie an echten Daten mit gestörten Titeln, der erste volle Lauf in Stufe B prüft sie am Bericht. Eine Änderung braucht eine Begründung im Code und im Commit (ADR 0004).
- **Treffer:** `d` bekommt `p.id`.
  - **Kursfortschreibung** hängt jetzt hier: Sind `p` und `d` beide `kurs`, kommen die Termine von `p` dazu, die vor `horizon.from` beginnen, also wirklich vergangen sind (Review m2). Bisher übernahm `build-offers.ts:247` alles vor dem ersten neuen Termin, auch abgesagte künftige Termine. Die Suche nach gleichem Titel-Slug entfällt.
- **Ohne Treffer:** neue ID (E13).
- **Teilung:** Erfüllt ein `p` mit Partner `d` die Bedingung von Stufe 1 oder 2 auch mit einem Entwurf `d'`, der eine neue ID bekam, behält `d` die ID, `d'` bekommt eine neue. Hinweis „geteilt?“.
- **Keine Zusammenlegung** (Nicht-Ziele): Ein `p` ohne Partner verschwindet mit seiner ID.
- **Hinweise** (`notes`, im Bericht von `build` und ab Stufe B im Statusbericht E7, eigener Abschnitt „IDs“): Treffer je Stufe, neue und weggefallene IDs je Anbieter, jede Zuordnung aus Stufe 1 und 2 mit altem und neuem Titel, Mehrdeutigkeiten und Teilungen. Eine falsche Zuordnung fällt so beim Lesen auf.
- **`checkIdContinuity`** (Fehler kommen in `report.errors` und brechen den Build ab): Eine ID, die vorher und nachher besteht, behält ihren Anbieter. Das kann nur ein Fehler im Code verletzen; die Prüfung ist das Netz dagegen, dass ein alter Link still auf ein fremdes Angebot zeigt.

**Reihenfolge in `buildOffers`:**
1. Rohevents → Kandidaten (unverändert).
2. Die bisherige Kursfortschreibung an dieser Stelle entfällt.
3. Dubletten mit gleichem **Fensterschlüssel**: `offerKey` mit dem ersten Termin ab `horizon.from` (ohne Termin im Fenster: dem ersten Termin). Sonst unverändert. Grund (Review m3): Bisher machte die Fortschreibung zwei Kandidaten desselben laufenden Kurses (eine Quelle mit, eine ohne vergangene Termine) vor diesem Schritt gleich. Ohne sie fasst nur der Fensterschlüssel sie zusammen. Test dazu in Tests 3.
4. Dubletten über Titel hinweg (unverändert).
5. **`assignIds`** samt Kursfortschreibung.
6. `crossProviderDuplicates` (braucht IDs, deshalb nach `assignIds`).
7. Übernahme aus dem Altbestand (unverändert; übernommene Angebote behalten ihre ID aus dem Vorstand; `ids.has(old.id)` prüft gegen die vergebenen IDs). Ab Stufe A entfällt dieser Schritt ohnehin (E5).
8. Sortierung (E13), `validateDataset`, `checkIdContinuity`.

`BuildInput.previous` ist schon ein `OffersFile`; `assignIds` bekommt es ganz (für `horizon.to`). Ab Stufe A liest `build` die Events aus `data/raw` und den Vorstand weiter aus `data/offers.json`. Die Äquivalenzprüfung in Schritt 3 vergleicht dann auch die IDs.

### E15 – Alt → neu: eine Rechenregel statt einer Liste

- Die Alias-Liste aus dem Auftrag braucht keine Daten: **Die neue ID einer alten ID ist `shortId(alteId, 0)`.** Genau das vergibt die Migration (E17), und für Angebote, die schon vor dem Umstieg verschwunden waren, vergäbe die Pipeline bei einer Rückkehr dieselbe ID (E13).
- Danach entstehen keine Aliasse mehr: Die Zuordnung hält die ID, eine Teilung erzeugt eine neue, und Zusammenlegungen gibt es nicht.
- **`resolveOfferId(id)`** (rein, `src/domain/ids.ts`): IDs der alten Form werden `shortId(id, 0)`, IDs der neuen Form bleiben, alles andere ist `undefined`.
- **`resolveProviderId(id)`** (rein, `src/domain/ids.ts`, nach N-I2): IDs auf `SHORT_ID_PATTERN` bleiben, sonst wird eine Katalog-ID (`KEBAB_ID_PATTERN`, höchstens `MAX_KEBAB_ID`) zu `shortId(id, 0)`, alles andere ist `undefined`.
  - Die Rechenregel gilt, weil die Migration jedem heutigen Anbieter genau `shortId(katalogId, 0)` gibt und bei einer Kollision abbricht (E17). Anbieter, die erst nach dem Umstieg in den Katalog kommen, hatten nie einen öffentlichen Link mit Katalog-ID; für sie braucht es keine Umrechnung.
  - Eindeutig ist die Unterscheidung, weil keine heutige Katalog-ID auf `^[0-9a-z]{8}$` passt (Befund); die Migration bricht sonst ab. Spätere Katalog-IDs dürfen so aussehen, denn sie werden nie öffentlich.
- **Anwendungen:**
  - **`?angebot=` und `?anbieter=`:** `parseRoute` nimmt für Angebote beide Formen an (`SHORT_ID_PATTERN` oder `LEGACY_OFFER_ID_PATTERN` bis 240 Zeichen); für Anbieter bleibt es, wie es ist, denn `SHORT_ID_PATTERN` ist eine Teilmenge von `KEBAB_ID_PATTERN`. `parseRoute` gibt die IDs unverändert weiter.
    - Aufgelöst wird **synchron in `useRoute`** (`src/ui/use-app-state.ts:55–73`, Review m6): Der Initialisierer und `onPop` wenden `resolveOfferId` und `resolveProviderId` auf die geparste Route an. Ändert sich dabei eine ID, folgt genau ein `history.replaceState` mit `routeToSearch`, und zwar außerhalb des `setState`-Updaters (StrictMode, Kommentar `:63`). Unter StrictMode läuft der Initialisierer doppelt; der zweite Lauf liest schon die umgeschriebene Adresse und ersetzt nichts mehr.
    - Damit sehen der Hinweis „nicht mehr im Zwergenplan“ (`App.tsx:150–157`, `OFFER_GONE`, Plan 0026, E7), `preloadProviderUi` (`:59`) und die Unbekannt-Prüfung des Anbieter-Sheets (`dropProvider`, `App.tsx:159–163`; `ProviderPanel.tsx:135`) von Anfang an nur Kurz-IDs. Eigene Effekte in `App.tsx` gibt es nicht; sie könnten sich mit diesen Prüfungen überholen.
  - **Alte Links aus Chats:** Für `angebot/<lange-id>/` und `anbieter/<katalog-id>/` gibt es keine Seite mehr. GitHub Pages liefert `404.html`, deren Skript nach `?angebot=<lange-id>` bzw. `?anbieter=<katalog-id>` weiterleitet (`notFoundPage`, E19), und die App rechnet um. Verloren geht nur die Vorschau, wenn jemand einen alten Link **erneut** teilt (N-I4).
  - **Merkliste:** Der Initialwert in `useSaved` (`src/ui/use-app-state.ts:135`) wird `migrateSavedIds(loadSaved())`; nur wenn sich etwas ändert, folgt `saveSaved`. `migrateSavedIds` (rein, `src/domain/saved.ts`) bildet IDs der alten Form ab, entfernt Dubletten und hält die Reihenfolge. Unter `<StrictMode>` läuft der Initialisierer doppelt; das ist unschädlich, denn der zweite Lauf liest schon die umgeschriebene Liste. **`src/data/preferences.ts` bleibt unverändert** (Review B1): `src/data` darf zur Laufzeit nur `src/domain/geo.ts` importieren (`data-domain-runtime-allowlist`, ADR 0010), und die Prüfung gespeicherter Werte gehört in die UI-Zustandsschicht.
  - **Gemerkte Anbieter** (`zwergenplan.anbieter-merkliste`, Plan 0025): `cleanSavedProviders` (`src/domain/saved.ts`) nimmt beide Formen an, bildet Katalog-IDs über `resolveProviderId` ab, entfernt Dubletten (stehen Katalog-ID und Kurz-ID desselben Anbieters beide in der Liste, bleibt die erste Stelle) und hält die Reihenfolge. `useSavedProviders` (`src/ui/use-app-state.ts:154`) schreibt nur bei einer Änderung mit `saveSavedProviders` zurück, wie `useSaved`. `src/data/preferences.ts` bleibt unverändert (ADR 0010).
  - **Wochen-Nachricht im Browser:** `tailorPush` bildet `seenIds` der alten Form über `resolveOfferId` ab, bevor `newOfferIds` rechnet. Sonst meldete die erste Nachricht nach dem Umstieg alle Angebote als neu.
  - **Wochen-Nachricht vom Server** (Review M2): `runWeekly` (`scripts/lib/push-weekly-core.ts:104–106`) bildet die IDs aus `previousIds` (`scripts/push-weekly.ts:53–63`, `data/offers.json` aus der Git-Historie vor 7 Tagen) über `resolveOfferId` ab, bevor `newOfferIds` rechnet. Sonst nennte die erste Nachricht nach dem Umstieg rund 333 neue Angebote. Die Abbildung steht in `runWeekly`, nicht in `previousIds`, damit der Test ohne Git auskommt.
  - **Plan 0026, Stufe 2:** Das Fragment enthält nur Kurz-IDs, für Angebote wie für Anbieter (E20).
- **ICS** braucht keine Abbildung (E18).
- **Wann die Altform-Logik entfällt:**
  - Die Umschreibung gespeicherter Werte (`migrateSavedIds`, der Altform-Zweig in `cleanSavedProviders`, die Abbildung in `tailorPush`; die in `runWeekly` schon nach der ersten Woche) frühestens, wenn kein Gerät mehr alte IDs gespeichert hat. Das lässt sich nicht messen. Ein Restpunkt in `docs/ideas.md` schlägt vor, sie nach 12 Monaten zu entfernen.
  - Die Umrechnung von Links (`LEGACY_OFFER_ID_PATTERN`, die Altform-Zweige von `resolveOfferId` und `resolveProviderId`, die Regeln für `angebot/` und `anbieter/` in `404.html`) bleibt, solange alte Links in Chats leben, also auf Dauer (ADR 0020, Punkt 1).

### E16 – Anbieter: feste Kurz-ID `publicId`, die Katalog-ID bleibt intern (Nutzerentscheid N-I2 = ja, 2026-10-08)

- **Feld:** Jeder Katalog-Eintrag mit `role: anbieter` bekommt `publicId`, 8 Zeichen auf `SHORT_ID_PATTERN` (E13), gespeichert in `data/providers.yaml` direkt nach `id`. Schema (`src/domain/schema.ts`, Zweig `anbieter` von `Provider`): `publicId: z.string().regex(SHORT_ID_PATTERN)`, Pflicht; danach `pnpm schema:export` (`schema/providers.schema.json`). `aggregator` und `verzeichnis` haben keine Seite und keine Angebote und bekommen kein Feld; wechselt ein Eintrag zu `anbieter`, bekommt er eins wie ein neuer.
- **Vergabe wie bei Angeboten:** `shortId(katalogId, seed)` mit dem kleinsten `seed`, dessen Ergebnis keine andere `publicId` im Katalog trägt (`nextPublicId(id, usedIds)`, rein, `src/domain/ids.ts`). Ab `seed` 10 wirft sie, passend zur Prüfung unten (Review m3); bei 41 Bit tritt das praktisch nie ein.
  - Die Migration vergibt einmalig `shortId(katalogId, 0)` (E17).
  - Neue Anbieter: `pnpm pipeline candidates add-provider` setzt das Feld selbst. `providerFromCandidate` (`scripts/pipeline/lib/draft.ts`) legt es als zweiten Schlüssel nach `id` an, damit es im YAML direkt darunter steht.
  - Von Hand ergänzter Eintrag (Wartungslauf, `references/catalog.md` des Skills): `pnpm data:validate` meldet das fehlende Feld samt freiem Wert, „`<id>`: `publicId` fehlt – frei ist `<wert>`“. Ein Mensch tippt also nie eine selbst ausgedachte ID.
  - **Mechanismus der Meldung** (Review M4): Ist `publicId` im Zod-Schema Pflicht, endet `validateDataset` (`src/domain/dataset.ts:26`) schon beim Parse-Fehler, und die Zod-Meldung kennt den Katalog nicht. Deshalb läuft vor `safeParse` eine Vorprüfung `missingPublicIds(raw)` (rein, `src/domain/dataset.ts`) auf den Rohdaten des Katalogs. Sie sucht Einträge mit `role: "anbieter"` ohne `publicId` und rechnet den freien Wert mit `nextPublicId` gegen die `publicId` der übrigen Roheinträge. Ihre Meldungen stehen in `errors` vor denen von Zod.
- **Übernahme:** Die `publicId` steht im Katalog und ändert sich nie. Das prüft `validateDataset`:
  - eindeutig über alle Anbieter,
  - `publicId === shortId(id, s)` für ein `s` von 0 bis 9.

  Die zweite Prüfung fängt Tippfehler und eine aus einem anderen Eintrag kopierte ID ab, ohne einen Vorstand zu brauchen. Sie bindet die `publicId` an die Katalog-ID; das passt zur Regel unten, dass Katalog-IDs nicht umbenannt werden.
- **Warum gespeichert und nicht nur gerechnet** (Nutzerentscheid): Die öffentliche ID steht sichtbar im Katalog, Build und App rechnen sie nicht nach, und bei einer Kollision weicht die Vergabe auf einen anderen `seed` aus, was eine reine Rechenregel nicht könnte.
- **Die Katalog-ID bleibt der interne Schlüssel:** `id` im Katalog, `offers.providerId`, `coveredBy`, die Orte (`dataset.ts:64`), die Rohdaten der Subagenten, `data/raw/<id>.json` (ab Stufe A), die Zuordnung (E14, „gleicher Anbieter“) und `offerKey` (Saat der Angebots-IDs).
  - Begründung:
    - Pipeline, Subagenten und Wartung arbeiten mit lesbaren Namen; Hash-IDs in Rohdaten und Berichten wären fehleranfällig.
    - `offerKey` und damit jede neue Angebots-ID und die Rechenregel alt → neu (E15) hängen an der Katalog-ID. Eine Umstellung von `offers.providerId` änderte daran nichts, kostete aber eine zweite Migration von `data/offers.json`.
  - **Pakete der Subagenten** (Review M3): `select` (`scripts/pipeline/cli.ts:124`) schreibt Katalog-Einträge in die Pakete `batch-<n>.json`. Es lässt `publicId` dort weg; Subagenten brauchen nur die Katalog-ID. `batchProviders` (`scripts/pipeline/io/files.ts:80–82`) liest nur noch `id` über ein lockeres Schema (`z.array(z.looseObject({ id: z.string() }))`) statt `ProvidersFile`. So scheitern `build` und `validate-raw` nicht an Paketen, die vor der Migration entstanden sind (Probelauf in S1, Rebase nach E6).
- **Jede Anbieter-ID im Browser ist die `publicId`:** Die Übersetzung geschieht an genau zwei Stellen im Build:
  - `toSiteData` (`src/domain/site-data.ts:69`) schreibt `providerId: provider.publicId` in jedes `SiteOffer`. Das Feld heißt weiter `providerId`; sein Kommentar sagt, dass es in `site.json` die öffentliche ID ist.
  - `toProviderDirectory` (`:100`) schreibt `id: provider.publicId` in `anbieter.json`.

  Alles danach (`directory.ts`, `provider-count.ts`, `share-pages.ts`, Anbieter-Sheet, Merkliste, `?anbieter=`, `p/<id>/`) vergleicht nur noch öffentliche IDs untereinander und ändert sich nicht. Tests 5 hält beide Felder fest.
  - **Grenze der Zusage** (Review B1): `SiteOffer` übernimmt mit `...offer` (`site-data.ts:77`) auch `venueId`. Die Orts-ID des Hauptorts ist meist gleich der Katalog-ID (`babykonzert-nuernberg`), weitere Orte beginnen mit ihr. Katalog-IDs stehen also weiter als Text in `site.json`, aber nie in einem Feld, das eine Anbieter-ID meint. `venueId` bleibt die interne Orts-ID; die UI liest sie nicht als Anbieter-ID. `venueId` aus `SiteOffer` zu entfernen, ist eine Idee für `docs/ideas.md` (S5), kein Teil von Stufe 0.
- **Regel:** Katalog-IDs werden weiter nicht umbenannt. Links hängen nicht mehr an ihnen, wohl aber die Zuordnung, die Angebots-IDs und die Prüfung der `publicId`. Die Regel kommt in den Skill `babyevents-nuernberg` (Abschnitt Katalogpflege) und in `CLAUDE.md` (S4). Muss es doch einmal sein (Review M5), braucht es vorher zweierlei, beides als Idee in `docs/ideas.md`:
  - eine Abbildung alt → neu für die Zuordnung,
  - ein Feld mit der früheren Katalog-ID, gegen das die Prüfung `publicId === shortId(…, s)` statt gegen die neue `id` rechnet. Sonst verlangte die Prüfung eine neue `publicId`, und Links und gemerkte Anbieter brächen. Eine Aliasseite braucht es dann nicht, denn die `publicId` bleibt.

### E17 – Migration, einmalig

- Neuer Befehl **`pnpm pipeline migrate-ids <offers.json> <providers.yaml>`** (ein `case` in `scripts/pipeline/cli.ts`, Logik als reine Funktionen `migrateOfferIds(file)` und `migrateCatalogIds(yamlText)` in `scripts/pipeline/lib/stable-ids.ts`). Ein Befehl statt eines losen Skripts, damit knip ihn über `cli.ts` erreicht und er nach einem Rebase erneut laufen kann (Review m4).
  - **Angebote:** Er liest ein `OffersFile`, setzt je Angebot `id = shortId(id, 0)` und sortiert nach E13.
  - **Katalog** (nach N-I2): Er setzt bei jedem Eintrag mit `role: anbieter` `publicId: shortId(id, 0)` direkt nach `id`. Er arbeitet auf dem YAML-Dokument (`parseDocument` aus `yaml`, wie `appendToCatalog` in `scripts/pipeline/io/files.ts:38`) und fügt das Paar per `map.items.splice(1, 0, doc.createPair("publicId", wert))` ein, damit Kommentare, Reihenfolge und Formatierung der übrigen Zeilen bleiben.
    - Den `visit`-Block aus `appendToCatalog` (`files.ts:41–47`) übernimmt er nicht (Review m4): Er setzte jede Liste aus Skalaren im ganzen Dokument auf Flow-Stil.
    - Vor dem Schreiben prüft er selbst: Die Ausgabe ohne die `publicId`-Zeilen ist zeichengleich mit der Eingabe. Sonst bricht er ab.
  - Danach prüft er beide zusammen mit `validateDataset` und schreibt erst dann, `offers.json` mit `writeJson`, den Katalog als Text.
  - Er bricht bei **jeder** Kollision ab, unter Angebots-IDs wie unter `publicId`, und weicht nicht auf einen anderen `seed` aus, denn die App rechnet alte IDs mit `seed` 0 um (E15). Heute gibt es keine Kollision (Befund). Entstünde bis zur Umsetzung eine, entscheidet der Nutzer, bevor es weitergeht.
  - Er bricht ab, wenn eine Katalog-ID mit `role: anbieter` auf `SHORT_ID_PATTERN` passt (alte und neue Form wären nicht mehr unterscheidbar, E15; heute keine).
  - Er bricht ab, wenn eine Angebots-ID schon die neue Form hat oder ein Anbieter schon eine `publicId` trägt (zweiter Lauf).
- Er läuft einmal auf `data/offers.json` mit `data/providers.yaml` und auf `tests/fixtures/offers.json` mit `tests/fixtures/providers.yaml`. Das ist eine benannte Ausnahme von „`data/offers.json` wird nie von Hand bearbeitet“: eine deterministische Umformung per Pipeline-Befehl, im Commit genannt.
- Migration und Code gehen im selben Push nach `main`. Kommt vorher ein Daten-Commit auf `main`, nimmt der Rebase dessen `data/offers.json` und `data/providers.yaml` (upstream, E6), und `migrate-ids` läuft darauf erneut.
- S5 entfernt Befehl und Funktionen wieder (knip grün).

### E18 – Kalender: UID und Pfade folgen der neuen ID (Nutzerentscheid N-I3 offen, Empfehlung ja)

- ICS-Pfade und UID bleiben in ihrer Form, nur mit der neuen ID: `ics/<id>.ics`, `ics/<id>/<YYYYMMDDTHHmm>.ics`, UID `<id>--<YYYYMMDDTHHmm>@zwergenplan`. Der Code nutzt schon `offer.id` und ändert sich nicht, nur Tests und Doku.
- **Folge:** Wer ein Angebot vor dem Umstieg in den Kalender übernommen hat und es danach erneut übernimmt, hat dessen Termine doppelt. Das passiert einmalig. Danach bleibt die UID über Titel- und Zeitänderungen stabil, besser als heute.
- **Begründung der Empfehlung:**
  - Der Nutzerkreis ist klein (Freunde und Familie), die Daten sind seit 2026-10-04 live, und dasselbe Angebot ein zweites Mal zu importieren ist selten.
  - Die heutige UID ist ohnehin nicht stabil: Jede Titeländerung erzeugt schon heute Duplikate.
- **Alternative: alte UID-Basis behalten.** Abgelehnt: Die Merklisten-ICS entsteht im Browser und muss dieselben UIDs haben wie die statischen Dateien (ADR 0007). Die lange ID ist aber nicht aus der kurzen rückrechenbar; `site.json` bräuchte sie je Angebot, rund 32 kB roh bei jedem Start, und es gäbe auf Dauer zwei UID-Regeln.

### E19 – Pfade: `a/<id>/` und `p/<id>/`, alte Ordner leiten weiter (Nutzerentscheid N-I1 = ja, 2026-10-08; N-I4 offen)

- **Neuer Pfadvertrag** (ersetzt ADR 0020, Punkt 1, mit ADR 0022):
  - Angebot: `a/<id>/index.html` und das Kachelbild `a/<id>/vorschau.jpg` (bisher `angebot/<id>/vorschau.jpg`, Plan 0026, Nachtrag A).
  - Anbieter: `p/<publicId>/index.html`.
  - `og:url` und `og:image` folgen, z. B. `https://zwergenplan.app/a/4tpu5qaq/` und `…/a/4tpu5qaq/vorschau.jpg?v=<hash>`.
  - Unter `angebot/` und `anbieter/` schreibt der Build keine Seiten mehr.
- **`src/domain/share.ts` bleibt die einzige Quelle der Pfade:**
  - `SHARE_DIRS = { offer: "a", provider: "p" }`.
  - `LEGACY_SHARE_DIRS = { offer: "angebot", provider: "anbieter" }` (neu), nur für `404.html`.
  - `checkedOfferId` und `checkedProviderId` prüfen `SHORT_ID_PATTERN`; die Pfadfunktionen werfen also bei jeder langen ID.
  - `offerSharePath`, `offerImagePath` und `providerSharePath` liefern die neuen Pfade. `offerAppSearch` und `providerAppSearch` bleiben (`?angebot=`, `?anbieter=`).
  - Der Kopfkommentar und der Kommentar „Ordnernamen wie die Query-Namen“ an `SHARE_DIRS` werden neu gefasst: Ordner und Query-Namen sind ab jetzt verschieden.
  - Die Nutzer folgen ohne eigene Pfadlogik: `scripts/lib/share-pages.ts` (Seiten), `scripts/og-images.ts` (Bilder über `offerImagePath`, Kopfkommentar `:2`), `scripts/build-data.ts` (Kopfkommentar `:7`), der Knopf „Teilen“ in der App.
- **`404.html`** (`notFoundPage`, `scripts/lib/share-pages.ts:288`) kennt vier Regeln. Jede leitet nach `BASE + "?" + <Query-Name> + "=" + <ID>` weiter:

  | Pfad | ID-Muster | Ziel |
  |---|---|---|
  | `a/<id>/` | `[0-9a-z]{8}` | `?angebot=` |
  | `p/<id>/` | `[0-9a-z]{8}` | `?anbieter=` |
  | `angebot/<id>/` (alt) | `[a-z0-9-]{1,240}` (`MAX_LEGACY_OFFER_ID`) | `?angebot=` |
  | `anbieter/<id>/` (alt) | `[a-z0-9-]{1,80}` (`MAX_KEBAB_ID`) | `?anbieter=` |

  - Die Query-Namen kommen aus `src/domain/route.ts`: `OFFER_PARAM = "angebot"` und `PROVIDER_PARAM = "anbieter"` (neu exportiert, genutzt von `parseRoute` und `routeToSearch`). Bisher war der Ordnername zugleich der Query-Name (`share-pages.ts:290–294`); das geht nicht mehr.
  - Die Regeln für `a/` und `p/` greifen bei verschwundenen Angeboten und Anbietern: Die App meldet dann wie bisher „nicht mehr im Zwergenplan“ bzw. das Sheet „unbekannt“.
  - Die alten Regeln führen alte Links in die App, die dort umgerechnet werden (E15). Damit lebt der Vertrag aus ADR 0020 als Weiterleitung weiter, wie ADR 0020, Punkt 1 es für eine Änderung verlangt.
- **Service Worker** (`src/sw/routes.ts`): keine Regeländerung. `a/…` und `p/…` treffen keine Pfadregel, und die Regel `schale` greift nur für `""` und `index.html`. Sie fallen also unter „sonst nur Netz“, wie bisher `angebot/` und `anbieter/` (ADR 0020, Punkt 5). `src/sw/routes.test.ts:46–48` bekommt Zeilen für `a/<id>/` (Navigation), `a/<id>/vorschau.jpg?v=…` und `p/<id>/`, jeweils `"netz"`; die alten Zeilen bleiben, denn alte Links kommen weiter an.
- **Kein Konflikt mit bestehenden Ordnern:** Im Artefakt liegen auf oberster Ebene `assets/`, `data/`, `ics/`, `icons/`, `og/` und einzelne Dateien; `a/` und `p/` sind frei. Die Regel `asset` prüft `assets/` mit Schrägstrich, `a/` trifft sie nicht.
- **Query bleibt `?angebot=` und `?anbieter=`** (Auftrag: entscheiden und begründen):
  - Geteilt wird der Pfad, nicht die Query. Die Query sieht man nur in der Adresszeile der App, nachdem die Vorschauseite weitergeleitet hat.
  - Die übrigen Query-Namen sind deutsche Wörter (`ansicht=`, aus `src/domain/filter.ts:33–43` `von=`, `bis=`, `wegzeit=`, `format=`, `anmeldung=`, `kosten=`; nur `kat=` ist abgekürzt). `?a=` und `?p=` fielen heraus und wären ohne Kontext unlesbar.
  - Die alten Namen müssten ohnehin auf Dauer gelesen werden: aus `404.html` für alte Links, aus Lesezeichen und Startbildschirm-Verknüpfungen. Kurze Namen hießen zwei Namen je Parameter in `parseRoute`, im Start-JS und in den Tests, für etwa 12 Zeichen weniger in einer Adresse, die niemand teilt.
- **Warum alte Ordner nur über `404.html`** und nicht über eigene Weiterleitungsseiten: Für alte lange Angebots-IDs gibt es keine Daten mehr (N-I4), und für Anbieter wäre es eine zweite Mechanik neben derselben `404.html`. Verloren geht in beiden Fällen nur die Vorschaukarte beim erneuten Teilen eines alten Links (R14).
- **Aliasseiten für alte Links (N-I4, offen, Empfehlung nein, Review M4):**
  - Alte Links funktionieren auch ohne sie: `404.html` leitet in die App, und die App rechnet um (E15).
  - Aliasseiten bräuchten für Angebote die langen IDs als Daten (ein Feld `formerIds` an jedem Angebot, gepflegt über alle Läufe) und 333 weitere Seiten im Artefakt.
  - Sie brächten nur eins: die Vorschaukarte, wenn jemand einen vor dem Umstieg geteilten Link erneut teilt. Das betrifft Links aus wenigen Tagen.
  - Falls N-I4 = ja: `formerIds?: string[]` am Angebot (lange ID aus der Migration, bei Treffern geerbt, nie in `site.json`), `validateDataset` prüft `shortId(alias, 0) === id`, `build-data` schreibt je Alias eine Seite `angebot/<alias>/` mit dem Inhalt der kanonischen Seite (`og:url`, `og:image` und Weiterleitung auf die neue ID), plus Test in `scripts/lib/share-pages.test.ts`. Für Anbieter ginge dasselbe ohne neues Feld, denn die Katalog-ID ist bekannt: je Anbieter eine Seite `anbieter/<katalog-id>/` mit dem Inhalt von `p/<publicId>/`.

### E20 – Plan 0026, Stufe 2: Die Kurz-IDs sind die IDs

- **Fragment v1:** `#merkliste=1.{A}` bzw. `#merkliste=1.{A}.{P}`, wie ursprünglich in Plan 0026, E10 vorgesehen.
  - `{A}` sind die gespeicherten Angebots-IDs, `{P}` die `publicId` der gemerkten Anbieter (N-I2), jeweils ohne Trenner aneinandergereiht (je genau 8 Zeichen).
  - `{A}` darf leer sein, wenn nur Anbieter geteilt werden (`1..{P}`).
  - Der Zeichensatz ist `[0-9a-z.]`.
- **Es entfallen:** der Hash im Browser, `findShortIdCollisions`, die Build-Warnung „Kurz-ID-Kollision“ und das Verwerfen mehrdeutiger Kurz-IDs. Die IDs sind eindeutig; das prüft `validateDataset` für Angebote und für `publicId`.
- **Empfang:** Angebote per Nachschlagen in `site.json`, Anbieter in `anbieter.json` (Plan 0026, Hinweis aus Plan 0025 vor E10). Das Fragment enthält nie eine Katalog-ID oder lange Angebots-ID; der Parser lehnt Gruppen ab, deren Länge kein Vielfaches von 8 ist.
- **Länge:** 30 Angebote wie bisher geplant 277 Zeichen, jeder gemerkte Anbieter 8 Zeichen mehr. Der Parser lehnt weiter mehr als 200 Einträge je Gruppe ab.
- **Budget:** `shortId` liegt ab Stufe 0 schon im Start-JS (E15). Die Schätzung von Stufe 2 (+0,6–0,9 kB) sinkt entsprechend.
- Plan 0026, E10 hat dazu einen Hinweis. E10–E12 werden vor Beginn von Stufe 2 angepasst; das sieht Plan 0026 dort ohnehin vor.

### E21 – Titel-Anker entfällt

- E14 ersetzt den Titel-Anker aus E3: Die ID hängt nicht mehr am Titel, und die Zuordnung nutzt verwandte Regeln (1:1, ähnlicher Titel, überlappende Termine). Zwei Mechanismen für dasselbe Ziel wären doppelt.
- Ein Modell, das einen Titel umformuliert, ändert ab Stufe B also den angezeigten Titel, aber nicht mehr die ID, die Merkliste oder die Kalender-UID. Gegen tägliches Flattern schützt weiter der Cache (E5): Unveränderte Seiten liefern unveränderte Events.
- E1, E3, E5, die Entscheidungstabelle in E5, E8 und die Testtabelle sind angepasst. ADR 0016 nennt statt des Titel-Ankers ADR 0022.

### E22 – ADR und Doku

- **ADR-Entwurf 0022** `docs/adr/0022-stabile-ids.md` liegt im selben Commit. Er ersetzt die ID-Regeln von ADR 0003 („Stabile IDs“, UID) und ADR 0006 („ID-Regel“) und ergänzt ADR 0003 (Feld `publicId` am Anbieter), ADR 0007 (UID-Form) und ADR 0016 (Titel-Anker). In ADR 0020 ersetzt er den Pfadvertrag aus Punkt 1 (`a/`, `p/`, alte Ordner als Weiterleitung) und ergänzt Punkt 2 (Kachelbild-Pfad, Höchstlängen), Punkt 3 (Ziel bleibt die Query), Punkt 4 (`404.html` mit vier Regeln), Punkt 5 (gilt für `a/` und `p/`) und Punkt 8 (Kurz-IDs für beides).
- **Bei Annahme (S4):**
  - ADR 0003, 0006, 0007, 0016 und 0020 bekommen an den betroffenen Stellen den Verweis „ersetzt bzw. ergänzt durch ADR 0022“.
  - `docs/architecture.md`: Invariante „Stabile IDs“ neu gefasst (gespeicherte Kurz-ID, Zuordnung in `build`, Rechenregel alt → neu, UID; `publicId` als einzige Anbieter-ID im Browser, Übersetzung nur in `toSiteData` und `toProviderDirectory`); Pfadvertrag `a/`, `p/` mit den alten Ordnern als Weiterleitung; Schichtentabelle mit `scripts/pipeline/lib/stable-ids.ts`.
  - `CLAUDE.md`, Stolperfallen/Daten: Angebots-IDs vergibt nur `pipeline build`, `publicId` nur `add-provider` bzw. der Wert aus der Meldung von `data:validate`, nie ein Mensch nach Gutdünken; Katalog-IDs werden nicht umbenannt; die einmalige Migration ist als Ausnahme genannt.
  - Skill `babyevents-nuernberg` samt `references/catalog.md`: Katalog-IDs nicht umbenennen, `publicId` nie ändern, bei neuen Einträgen den gemeldeten Wert übernehmen (E16).
  - Kopfkommentar von `src/domain/ids.ts`.

### Budget

- **Start-JS** (`JS (initial)`, 100 kB): `shortId` (cyrb53), `SHORT_ID_PATTERN`, `LEGACY_OFFER_ID_PATTERN`, `resolveOfferId`, `resolveProviderId`, `migrateSavedIds`, der Altform-Zweig in `cleanSavedProviders` und die Verdrahtung in `useRoute`, `useSaved` und `useSavedProviders`. Geschätzt +0,3–0,45 kB. Vorher und nachher messen, Zeile in die Delta-Tabelle von ADR 0012. Liegt es über 0,6 kB, wird vor dem Merge geprüft, was entfallen kann.
- **Service Worker** (9 kB): `resolveOfferId` samt `shortId`, geschätzt +0,2 kB. Anbieter-IDs kennt er nicht. Messen.
- **`site.json`** wird kleiner:
  - Angebots-IDs schrumpfen im Median von 95 auf 8 Zeichen, bei 333 Angeboten rund 29 kB roh weniger.
  - `providerId` je Angebot von im Median 16 auf 8 Zeichen, rund 3,2 kB roh weniger (Befund).
  - Messen und im Plan festhalten.
- **`anbieter.json`** wird um rund 0,9 kB roh kleiner (`id` als `publicId`, Befund).
- **Anbieter-Chunk:** praktisch unverändert; `providerSharePath` prüft nur ein anderes Muster.
- **Artefakt:** gleich viele Seiten und Bilder, nur unter `a/` und `p/` statt `angebot/` und `anbieter/`. `404.html` wächst um zwei Regeln.

### Tests zu Nachtrag A (test-first)

1. **`src/domain/ids.test.ts`:** `shortId` mit den drei Testvektoren aus E13, `seed` ändert das Ergebnis, immer 8 Zeichen `[0-9a-z]`; `offerKey` mit den bisherigen Fällen von `offerId`; beide Muster; `resolveOfferId` für neue Form, alte Form, Unfug.
   - `resolveProviderId`: Kurz-ID bleibt; Katalog-IDs mit den Vektoren `babykonzert-nuernberg` → `gl1sfqim`, `atv-1873-frankonia` → `2i1objpq`, `familientreff-beispiel` (Fixture) → `b5nuus36`; über `MAX_KEBAB_ID` oder kein kebab-case → `undefined`.
   - `nextPublicId`: ohne Kollision `seed` 0; ist `shortId(id, 0)` belegt, der nächste freie `seed`; sind die `seed` 0–9 alle belegt (künstlich), wirft sie.
2. **`scripts/pipeline/lib/stable-ids.test.ts`:**
   - Stufe 0: unveränderter Bestand behält alle IDs.
   - Stufe 1: Titeländerung bei gleichen Terminen; Wechsel `kurs` → `regelmaessig`; alter Ort fehlt im Katalog; vorhandener anderer Ort verhindert den Treffer.
   - Stufe 2: Uhrzeit 9:30 → 9:45 samt Titel „(Di 9:30)“ → „(Di 9:45)“, während eine zweite PEKiP-Gruppe am selben Tag um 11:30 unverändert bleibt (Stufe 0 bindet sie, die erste trifft in Stufe 2).
   - Einziger Kandidat: Beide PEKiP-Gruppen ändern ihren Titel und die erste auch ihre Uhrzeit → kein Treffer für die erste (zwei Kandidaten), neue ID.
   - Mehrdeutigkeit in Stufe 1: die zwei Angebote mit identischen Terminen ändern beide den Titel → kein Tausch.
   - Entfallenes Angebot mit Schwester gleicher Termine (Review B2): Die Schwester behält ihre ID, die ID des entfallenen wird nicht weitergegeben.
   - Vergleichsfenster: Vorstand mit kürzerem Horizont als der Lauf (4 Wochen Abstand, 4 Monate Horizont) behält die IDs einer Wochengruppe.
   - Laufender Kurs: Entwurf nur mit künftigen Terminen behält die ID; fortgeschrieben werden nur Termine vor `horizon.from`, nicht ein abgesagter künftiger Termin.
   - Folgekurs mit gleichem Titel und gleichem Wochentag nach Kursende → neue ID.
   - Schwellen an der Grenze (0,8 / 0,5 genau getroffen bzw. knapp verfehlt).
   - Teilung: einer behält, einer neu.
   - Neue ID: Kollision mit belegter `id` → nächster `seed`; deterministisch bei vertauschter Eingabereihenfolge.
   - `checkIdContinuity`: eine ID, die den Anbieter wechselt, ist ein Fehler.
   - `migrateOfferIds`: Ergebnis gleich `shortId(alt, 0)` je Angebot, Abbruch bei künstlicher Kollision (injizierte Hashfunktion) und bei schon migrierter Datei.
   - `migrateCatalogIds`: `publicId = shortId(id, 0)` direkt nach `id`, nur bei `role: anbieter`; Kommentare, Flow- und Blockstil der übrigen Zeilen bleiben (Text vorher und nachher unterscheidet sich nur um die neuen Zeilen; Testkatalog mit Kommentar, Flow-Liste und Block-Liste); Abbruch bei künstlicher Kollision, bei schon vorhandener `publicId` und bei einer Katalog-ID auf `SHORT_ID_PATTERN`.
   - `batchProviders` liest ein Paket mit und ohne `publicId`; die Pakete aus `select` enthalten keine `publicId` (Test in `scripts/pipeline/io/files.test.ts`, neu, bzw. in der bestehenden Testdatei von `selectBatches`).
3. **`scripts/pipeline/lib/build-offers.test.ts`:** Die bestehenden Fälle laufen mit der neuen Reihenfolge; Kursfortschreibung über die Zuordnung; zwei Kandidaten desselben laufenden Kurses aus gleichrangigen Quellen, einer mit und einer ohne vergangene Termine, werden über den Fensterschlüssel ein Angebot; Sortierung nach E13; übernommene Angebote (Altbestand) behalten ihre ID; `crossProviderDuplicates` meldet weiter mit IDs.
4. **`src/domain/dataset.test.ts`, Schema:** ID-Form, doppelte ID; die alte Regel „ID entspricht der Formel“ ist weg.
   - `publicId`: Pflicht bei `role: anbieter`, die Meldung aus `missingPublicIds` nennt den freien Wert und steht vor den Zod-Meldungen; falsche Form, doppelt, nicht `shortId(id, s)` für `s` 0–9 (Tippfehler, aus einem anderen Eintrag kopiert); `aggregator` mit `publicId` lehnt das Schema ab (`strictObject`).
5. **`src/domain/site-data.test.ts`:** gleicher Beginn → Reihenfolge nach Titel. Für jedes Angebot aus `toSiteData` ist `providerId` die `publicId` seines Anbieters und passt auf `SHORT_ID_PATTERN`; für jeden Eintrag aus `toProviderDirectory` gilt dasselbe für `id`. Geprüft werden diese Felder, nicht der ganze Text, denn `venueId` enthält weiter Katalog-IDs (E16, Review B1).
6. **`src/domain/route.test.ts`:** `?angebot=` in beiden Formen; `?anbieter=` mit Kurz-ID und mit Katalog-ID; Unfug abgelehnt; `routeToSearch` nutzt `OFFER_PARAM` und `PROVIDER_PARAM`.
7. **`src/domain/saved.test.ts`, `src/ui/use-app-state.test.ts`:** `migrateSavedIds` (alte Form → Kurz-ID, Dubletten weg, Reihenfolge bleibt); `useSaved` schreibt nur bei einer Änderung zurück.
   - `useRoute`: Adresse mit langer Angebots-ID und Katalog-ID ergibt eine Route mit beiden Kurz-IDs und genau einen `replaceState`; eine Adresse mit Kurz-IDs ruft `replaceState` nicht auf; `popstate` auf eine alte Adresse löst ebenso auf.
   - `cleanSavedProviders`: Katalog-ID → `publicId`, Katalog-ID und Kurz-ID desselben Anbieters ergeben einen Eintrag an der ersten Stelle, Reihenfolge bleibt, Unfug fällt weg; `useSavedProviders` schreibt nur bei einer Änderung zurück.
   - **`scripts/pipeline/lib/draft.test.ts`** (`providerFromCandidate`, `scripts/pipeline/lib/draft.ts`): Der neue Eintrag trägt `nextPublicId(id, catalog)`.
8. **`src/sw/push-tailor.test.ts`:** `seenIds` in alter Form ergeben nach dem Umstieg keine „neuen“ Angebote. **`scripts/lib/push-weekly-core.test.ts`:** Ein alter Stand mit langen IDs und ein neuer mit den Kurz-IDs derselben Angebote ergeben `news = 0` (Review M2).
9. **`src/domain/ics.test.ts`, `scripts/lib/share-pages.test.ts`, `src/domain/share.test.ts`, `src/sw/routes.test.ts`:** UID und ICS-Pfade mit der neuen ID (Testdaten angepasst).
   - `share.test.ts`: `SHARE_DIRS` ist `{ offer: "a", provider: "p" }`, `LEGACY_SHARE_DIRS` die alten Ordner; `offerSharePath` → `a/<id>/`, `offerImagePath` → `a/<id>/vorschau.jpg`, `providerSharePath` → `p/<id>/`; lange Angebots-ID und Katalog-ID werfen; `offerAppSearch` und `providerAppSearch` liefern weiter `?angebot=` bzw. `?anbieter=`.
   - `share-pages.test.ts`: `og:url` und `og:image` unter `a/` bzw. `p/`. `notFoundPage`: Das erzeugte Skript läuft gegen eine Liste von Pfaden. `/a/4tpu5qaq/` → `?angebot=4tpu5qaq`, `/p/gl1sfqim/` → `?anbieter=gl1sfqim`, `/angebot/<lange-id>/` → `?angebot=<lange-id>`, `/anbieter/babykonzert-nuernberg/` → `?anbieter=babykonzert-nuernberg`, jeweils auch ohne Schrägstrich am Ende und mit `index.html`; `/a/zu-lang-123/`, `/p/ABCDEFGH/` und `/x/4tpu5qaq/` leiten nicht weiter.
   - `routes.test.ts`: `a/<id>/` (Navigation), `a/<id>/vorschau.jpg?v=…` und `p/<id>/` ergeben `"netz"`; die Zeilen für `angebot/` und `anbieter/` bleiben.
10. **E2E** (Fixtures nach E17):
    - **Muster für alte und unbekannte Pfade** (Review m1): `vite preview` liefert für unbekannte Pfade die Startseite (`e2e/smoke.spec.ts:373`), nicht `404.html`. Die Tests für alte Links und für unbekannte `a/`/`p/` nutzen deshalb das Muster aus `e2e/teilen.spec.ts:222–227`: `page.route` liefert `404.html` mit Status 404, dazu `allowedConsoleErrors` für die 404-Meldung.
    - `e2e/teilen.spec.ts`: Teilen-Link `a/<id>/` bzw. `p/<publicId>/`. Ein alter langer Link `angebot/<lang>/` landet über `404.html` im Detail, die Adresszeile zeigt danach `?angebot=<kurz-id>`. Ein alter Link `anbieter/familientreff-beispiel/` öffnet das Anbieter-Sheet, die Adresszeile zeigt danach `?anbieter=b5nuus36`. Unbekannte `a/<id>/` und `p/<id>/` führen zum Hinweis bzw. zur Meldung des Sheets. Anzupassen sind dort `:5`, `:89`, `:100`, `:114`, `:152` und `:161–273` samt `:222`.
    - `e2e/saved.spec.ts`: Merkliste mit langer ID im `localStorage` zeigt das Angebot und ist danach umgeschrieben.
    - `e2e/merkliste-anbieter.spec.ts`: `zwergenplan.anbieter-merkliste` mit Katalog-ID zeigt den gemerkten Anbieter und ist danach auf `publicId` umgeschrieben. `:125` prüft „gemerkte ID nie in der URL“ künftig mit der `publicId` (mit der Katalog-ID wäre die Prüfung immer grün), `:157–158` vergleicht den Speicher mit `publicId`.
    - `e2e/anbieter.spec.ts`: `?anbieter=<publicId>` und `?anbieter=<katalog-id>` öffnen dasselbe Sheet; die Vergleiche von `search` mit Katalog-IDs (`:171`, `:198`, `:205`, `:248`, `:272`, `:299`, `:328`) erwarten die `publicId`.
    - `e2e/smoke.spec.ts` (echte Daten, `dist/`): Seiten und Kachelbild unter `a/`, Anbieterseite unter `p/`, `og:url` entsprechend; `dist/angebot/` und `dist/anbieter/` gibt es nicht; die Prüfung „keine Fixture-Seite“ sucht unter `dist/a/<id>` und `dist/p/<publicId>` (Review m5).
    - Angepasste IDs und Pfade: `e2e/detail.spec.ts`, `e2e/pwa.spec.ts` (`a/<id>/` statt `angebot/<id>/`, `:136`), `e2e/mobile-ux.spec.ts` (`:138`, `SHARE_PAGE` unter `a/` statt `angebot/`, `:505`).

### Schritte zu Nachtrag A (Stufe 0)

Stufe 0 geht als Ganzes in einem Push nach `main`; die Zwischenstände liegen nur auf ihrem Branch. Jeder Schritt ist ein Commit mit grünem `pnpm verify`. Domänenlogik entsteht test-first. Schema, Daten und Pipeline müssen zusammen wechseln, deshalb ist S1 der große Schritt.

- **S1 – Umstellung (Domäne, Schema, Zuordnung, Migration).**
  - `src/domain/ids.ts`: `SHORT_ID_PATTERN`, `LEGACY_OFFER_ID_PATTERN`, `MAX_LEGACY_OFFER_ID`, `shortId`, `offerKey` (Umbenennung von `offerId`), `resolveOfferId`, `resolveProviderId`, `nextPublicId`; alle Nutzer von `OFFER_ID_PATTERN` und `MAX_OFFER_ID` umstellen (E13).
  - Schema (Angebots-ID, `publicId` am Anbieter), `validateDataset` (E13, E16), `pnpm schema:export`; Sortierung in `site-data.ts`; `toSiteData` und `toProviderDirectory` geben `publicId` aus (E16).
  - `scripts/pipeline/lib/stable-ids.ts`, neue Reihenfolge in `buildOffers`, Befehl `migrate-ids` für Angebote und Katalog; `providerFromCandidate` setzt `publicId`.
  - Migration auf `data/offers.json` mit `data/providers.yaml` und auf `tests/fixtures/offers.json` mit `tests/fixtures/providers.yaml`.
  - `select` lässt `publicId` aus den Paketen weg, `batchProviders` liest lockerer (E16, Review M3).
  - Unit-Tests mit langen IDs (heute 16 Dateien, `grep -rlE "[a-z0-9]+--[a-z0-9-]+--[a-z0-9]+" src scripts e2e`) auf die neue Form umstellen. Katalog-IDs als öffentliche ID stehen in Tests, deren Code die Form prüft oder die Übersetzung durchläuft: `src/domain/share.test.ts`, `src/domain/saved.test.ts`, `src/domain/route.test.ts`, `src/domain/site-data.test.ts`, `src/ui/use-app-state.test.ts`, `src/data/providers.test.ts`, `scripts/lib/share-pages.test.ts` (`:187`, `anbieter/familientreff-beispiel/` wirft künftig). `src/domain/directory.test.ts` braucht keine Umstellung, denn `directory.ts` prüft keine ID-Form (Review m2).
  - **Probelauf** (Review M3): ein Wegwerf-Skript unter `runs/` (gitignored) ruft `buildOffers` direkt auf, mit den Rohdaten vom 04.10. (`runs/2026-10-04/raw/`, liegt im Haupt-Checkout), dem migrierten `data/offers.json` als `previous` und `generatedAt` und `horizon` aus diesem Vorstand. Es schreibt nichts ins Repo.
    - Durchgang 1: Alle 333 IDs bleiben (Stufe 0 trifft jedes Angebot).
    - Durchgang 2 mit gestörten Titeln: In jedem Rohevent wird ein Klammerzusatz am Titelende entfernt (Uhrzeit, Wochentag, Datum, z. B. „(Babys geb. Jan.–Feb. 2026, Di 9:30)“). Treffer je Stufe, Mehrdeutigkeiten und neue IDs kommen in den Plan, mit Stichprobe der Zuordnungen aus Stufe 1 und 2.
  - Fertig, wenn Tests 1–5 und 7 (Unit-Teil, ohne `useSaved`/`useSavedProviders`) grün sind, `pnpm data:validate` auf dem migrierten Katalog grün ist, Durchgang 1 alle IDs behält und Durchgang 2 im Plan steht. Zeigt Durchgang 2 eine falsche Zuordnung, wird vor S2 nachgeschärft.
- **S2 – App, Service Worker, Pfade.**
  - `parseRoute` mit `OFFER_PARAM`/`PROVIDER_PARAM`, Auflösung beider IDs in `useRoute` (E15), `migrateSavedIds` in `useSaved`, `cleanSavedProviders` in `useSavedProviders`, `tailorPush`.
  - `src/domain/share.ts` (`SHARE_DIRS`, `LEGACY_SHARE_DIRS`, Prüfung auf `SHORT_ID_PATTERN`), `notFoundPage` mit vier Regeln, Kommentare in `share-pages.ts` (`MAX_PAGE_BYTES`: ID jetzt 8 statt 240 Zeichen, der Wert bleibt), `og-images.ts` und `build-data.ts` (E19).
  - Erzeugte Ordner (Review M1): Die Löschliste in `scripts/build-data.ts:41` wird `["data", "ics", "a", "p", "angebot", "anbieter", "404.html"]`. `angebot` und `anbieter` bleiben darin, damit ein bestehender Checkout keine veralteten Seiten behält; sonst lieferte `vite preview` sie aus, und Smoke- und E2E-Tests für alte Links liefen über eine alte Seite statt über `404.html`. `.gitignore` (`:9–10`) bekommt `public/a/` und `public/p/`; die alten Zeilen bleiben aus demselben Grund.
  - `runWeekly` bildet die IDs des alten Stands ab (E15, Review M2).
  - Fertig, wenn Tests 6–9 grün sind und `scripts/lib/push-weekly-core.test.ts` den Fall aus Tests 8 abdeckt.
- **S3 – E2E und Budget.** Lokal: `pnpm e2e:local e2e/teilen.spec.ts e2e/saved.spec.ts e2e/merkliste-anbieter.spec.ts e2e/detail.spec.ts e2e/anbieter.spec.ts e2e/pwa.spec.ts e2e/mobile-ux.spec.ts` mit `run_in_background`, dazu `e2e/theme.spec.ts` nur, falls `e2e/fixtures.ts` oder `e2e/mobile-ux.ts` sich ändern. Die Smoke-Suite mit echten Daten (Tests 10, `e2e/smoke.spec.ts`) fährt die CI auf dem Branch; lokal läuft sie nur, um einen roten CI-Job nachzustellen (CLAUDE.md, Review m5). Die Fixtures ändern sich, die volle Suite fährt die CI auf dem Branch. Start-JS, Service Worker, `site.json` und `anbieter.json` messen, Zeile in ADR 0012. Fertig, wenn die Specs lokal und die CI auf dem Branch grün sind und die Messwerte im Plan stehen.
- **S4 – ADR und Doku.** ADR 0022 auf „angenommen“, Verweise in ADR 0003, 0006, 0007, 0016 und 0020 (dort Punkt 1: neuer Pfadvertrag laut ADR 0022), `docs/architecture.md`, `CLAUDE.md`, Skill samt `references/catalog.md` (E22). Fertig, wenn `pnpm docs:check` grün ist.
- **S5 – Prüfen, ausliefern, aufräumen.**
  - `/arch-review` (Schemaänderung, neues Modul, mehr als 200 Zeilen) vor dem Push nach `main`.
  - Nach dem Deploy `/browser-review live`: Teilen-Link (Angebot und Anbieter), alter Link (Angebot und Anbieter), Merkliste und gemerkte Anbieter, auf Pixel 7 und iPhone, hell und dunkel.
  - Live-Proben:
    - Ein am 2026-10-08 geteilter langer Link, z. B. `https://zwergenplan.app/angebot/atv-1873-frankonia--riesen-zwerge-turnen-fuer-2-bis-3-jaehrige-mo--atv-1873-frankonia/`, öffnet das Detail, und die Adresszeile zeigt danach `?angebot=d4qshjw0`.
    - `https://zwergenplan.app/anbieter/atv-1873-frankonia/` öffnet das Anbieter-Sheet, die Adresszeile zeigt danach `?anbieter=2i1objpq`.
    - `https://zwergenplan.app/a/<id>/` und `https://zwergenplan.app/p/2i1objpq/` liefern 200 mit `og:url` auf sich selbst; ein WhatsApp-Test zeigt die Vorschaukarte mit Kachelbild.
  - Danach `migrate-ids`, `migrateOfferIds` und `migrateCatalogIds` entfernen (knip grün), eigener Commit.
  - Restpunkte nach `docs/ideas.md`: verlegte Einzeltermine, Zusammenlegung, vor einer Umbenennung einer Katalog-ID die Abbildung für die Zuordnung und das Feld mit der früheren Katalog-ID (E16), `venueId` aus `SiteOffer` entfernen (E16), Umschreibung gespeicherter Werte nach 12 Monaten entfernen (E15).
  - Fertig, wenn die CI auf `main` grün ist und `meta.json` den Commit zeigt.

### Risiken zu Nachtrag A

- **R9 – Falsche Zuordnung:** Zwei verschiedene Angebote bekommen über zwei Läufe dieselbe ID. Dann zeigt ein alter Link oder ein Merklisten-Eintrag auf ein anderes Angebot. Dagegen: gleicher Anbieter (und außer bei verschwundenem Ort gleicher Ort) als Pflicht, strikte Eindeutigkeit in Stufe 1, einziger Kandidat in Stufe 2, keine Zusammenlegung, `checkIdContinuity`, der Probelauf mit gestörten Titeln, und jede Zuordnung aus Stufe 1 und 2 steht mit beiden Titeln im Bericht.
- **R10 – Verpasste Zuordnung:** Ein Angebot bekommt trotzdem eine neue ID, z. B. bei neuem Titel **und** neuer Uhrzeit oder bei zwei Schwestergruppen, die sich zugleich ändern. Das ist der heutige Zustand, nur seltener. Der Bericht zeigt neue und weggefallene IDs je Anbieter.
- **R11 – Einmalige Kalender-Duplikate** durch den UID-Wechsel (E18).
- **R12 – Kein einfaches Zurück:** Nach dem Deploy schreibt die App Merklisten und gemerkte Anbieter in Kurz-IDs um. Ein Revert brächte lange IDs und Katalog-IDs zurück, und beide Listen wären leer. Dazu verschwänden die Seiten unter `a/` und `p/`, und `404.html` kennte sie nicht mehr; seit dem Deploy geteilte Links führten dann auf „gibt es nicht“. Ein Rückweg wäre ein Fix nach vorn. Deshalb gehören Tests 7, 9 und 10 zur Pflicht vor dem Merge.
- **R13 – Hash-Kollision bei der Migration:** Der Befehl bricht ab (E17). Heute gibt es keine.
- **R14 – Erneut geteilte alte Links ohne Vorschau** (N-I4): Der Link funktioniert, die Karte im Chat fehlt. Das gilt nach N-I1 auch für alte Anbieter-Links, denn `anbieter/<katalog-id>/` hat keine Seite mehr.
- **R15 – Zwei IDs je Anbieter verwechselt:** Code im Build schlägt mit einer `publicId` im Katalog nach oder vergleicht sie mit `offers.providerId`; dann fehlt ein Anbieter still oder eine Seite zeigt keine Angebote. Dagegen: Übersetzung nur in `toSiteData` und `toProviderDirectory` (E16), Test der Felder `providerId` und `id` (Tests 5), Smoke-Test mit echten Daten über Anbieterseite und Angebote (Tests 10). `venueId` sieht der Katalog-ID ähnlich, ist aber keine Anbieter-ID (E16).
- **R16 – `publicId` von Hand geändert:** Alte Links und gemerkte Anbieter zeigten ins Leere. Dagegen: `validateDataset` verlangt `publicId === shortId(id, s)` mit `s` 0–9 (E16), die Regel steht im Skill.
- **R17 – Zwei Pfadverträge auf Dauer:** `a/`, `p/` als Seiten und `angebot/`, `anbieter/` als Regeln in `404.html`. Das ist der Preis von N-I1; die alten Regeln sind vier Zeilen in `notFoundPage` mit eigenem Test (Tests 9).

### Nutzerentscheide

N-I1 und N-I2 hat der Nutzer am 2026-10-08 entschieden, wörtlich „NI1 Und 2: doch“, also gegen die bisherige Empfehlung. N-I3 und N-I4 sind offen; umgesetzt wird mit der Empfehlung, solange nichts anderes entschieden ist.

| Nr. | Frage | Stand | Abschnitt |
|---|---|---|---|
| N-I1 | Neue kurze Pfade `/a/<id>/` und `/p/<id>/`? | **entschieden 2026-10-08: ja** („NI1 Und 2: doch“). Alte Ordner `angebot/` und `anbieter/` leiten über `404.html` weiter; die Query bleibt `?angebot=`/`?anbieter=` (Begründung in E19). Bisherige Empfehlung war nein. | E19 |
| N-I2 | Feste Kurz-ID auch für Anbieter? | **entschieden 2026-10-08: ja** („NI1 Und 2: doch“). `publicId` im Katalog, die Katalog-ID bleibt interner Schlüssel. Bisherige Empfehlung war nein. | E16 |
| N-I3 | ICS-UID auf die Kurz-ID umstellen (einmalig Duplikate bei erneutem Import)? | offen, Empfehlung ja | E18 |
| N-I4 | Aliasseiten mit Vorschau für alte lange Links (Feld `formerIds`)? | offen, Empfehlung nein, `404.html` und die Rechenregel reichen | E19 |

### Review zu Nachtrag A (2026-10-08) – Verdict: Freigabe mit Änderungen → eingearbeitet

Unabhängiger `plan-reviewer` auf Nachtrag A, ADR-Entwurf 0022 und die Folgeänderungen. Er hat die Zahlen des Befunds am Bestand nachgezählt; die cyrb53-Vektoren konnte er ohne Shell nicht nachrechnen (sie stammen aus dem Befund-Skript mit genau dem Code aus E13). Alle Punkte sind eingearbeitet, offene Blocker gibt es keine.

**Übernommen**

| Befund | Einarbeitung |
|---|---|
| **B1** Migration in `loadSaved()` verletzt `data-domain-runtime-allowlist` (ADR 0010) | Migration im Initialwert von `useSaved`, `preferences.ts` unverändert; Test nach `use-app-state.test.ts` (E15, Tests 7) |
| **B2** Zusammenlegung ordnet verschiedene Angebote zu (Paar mit identischen Terminen, Schwestergruppen); Konflikt mit der Übernahme aus dem Altbestand | Zusammenlegung gestrichen (Nicht-Ziele, Idee); damit entfallen kurze Aliasse in `site.json`, `remapSaved` und der Fixture-Alias; Test „entfallene Schwester“ (E14, Tests 2) |
| **M1** `T`/`D` hängen am Abstand der Läufe | Vergleichsfenster bis `min(previous.horizon.to, horizon.to)`, `previous` als `OffersFile`, Test mit verschieden langen Fenstern (E14) |
| **M2** Stufe 2 entscheidet über den Zufallswert der Titelähnlichkeit | Stufe 2 nur bei einzigem Kandidaten auf beiden Seiten, Test mit zwei umbenannten Gruppen (E14) |
| **M3** Probelauf über `pipeline build` scheitert an `generatedAt` und überschreibt `data/offers.json` | Wegwerf-Skript unter `runs/` ruft `buildOffers` mit `generatedAt` und `horizon` des Vorstands, schreibt nichts; zweiter Durchgang mit gestörten Titeln (S1) |
| **M4** schlanke Variante ohne `formerIds` | übernommen als Standard: Rechenregel `shortId(alt, 0)` statt Liste, alte Links über `404.html`; Aliasseiten als Nutzerentscheid N-I4 (E15, E19); Anbieter-`formerIds` erst vor einer Umbenennung (E16) |
| **m1** S1 unvollständig (`MAX_OFFER_ID`-Nutzer, `crossProviderDuplicates`) | Fundstellen in E13, `crossProviderDuplicates` nach `assignIds` (E14); `toSiteData` entfällt mangels `formerIds` |
| **m2** Kursfortschreibung übernimmt abgesagte künftige Termine | nur Termine vor `horizon.from` (E14, Tests 2) |
| **m3** zwei Kandidaten desselben laufenden Kurses werden nicht mehr zusammengefasst | Dubletten über den Fensterschlüssel (E14, Tests 3) |
| **m4** Migrationsskript gelöscht und doch „aus der Historie“ | Pipeline-Befehl `migrate-ids` (knip über `cli.ts`), entfernt in S5 (E17) |
| **m5** E2E-Liste | `pwa.spec.ts` und `mobile-ux.spec.ts` ergänzt, `layout.spec.ts` gestrichen (S3, Tests 10) |
| **m6** Backpressure Alias ↔ Rechenregel, cyrb53-Fassung | Code von cyrb53 in E13; die Alias-Prüfung gilt nur bei N-I4 = ja (E19) |
| **m7** Doku | ADR 0022 Punkt 3 nennt die Ortsausnahme; ADR 0020 Punkte 2 und 4 unter „ergänzt“ |
| **m8** Budget, Sortierung in `site.json` | Gleichstand in `site-data.ts` nach Titel (E13, Tests 5); Anbieter-Chunk unberührt, da keine Anbieter-Felder |

**Abgelehnt**
- **m7, Statuszeile „Entwurf“:** Die Statuszeile wurde vor dem Review gesetzt; nach der Einarbeitung ist „Review eingearbeitet“ richtig.

### Review zu Nachtrag A, Nutzerentscheide N-I1 und N-I2 (2026-10-08) – Verdict: Freigabe mit Änderungen → eingearbeitet

Unabhängiger `plan-reviewer` nur auf die Teile, die N-I1 (kurze Pfade) und N-I2 (Kurz-ID für Anbieter) geändert haben, samt ADR-Entwurf 0022 und den Hinweisen in Plan 0026, geprüft gegen den Code. Die Zeilenangaben hat er bestätigt, die Query-Entscheidung für tragfähig befunden. Die Testvektoren der Anbieter (`gl1sfqim`, `2i1objpq`, `b5nuus36`) hat er nicht nachgerechnet; sie stammen aus demselben Skript mit dem Code aus E13, das den Vektor `d4qshjw0` reproduziert. Alle Befunde sind eingearbeitet, offene Blocker gibt es keine.

| Befund | Einarbeitung |
|---|---|
| **B1** „Der Browser sieht nur die `publicId`“ ist falsch: `venueId` in `site.json` enthält Katalog-IDs; Test 5 als Textsuche wäre immer rot | Zusage auf die Anbieter-Felder `providerId` und `id` eingeengt, `venueId` als interne Orts-ID benannt, Entfernen als Idee (E16, Tests 5, R15, ADR 0022 Punkt 5) |
| **M1** Löschliste `build-data.ts:41` und `.gitignore` kennen `a/`, `p/` nicht | beide in S2, alte Einträge bleiben gegen veraltete Seiten in bestehenden Checkouts |
| **M2** Wochen-Nachricht vom Server (`push-weekly`) meldete alle Angebote als neu | Abbildung in `runWeekly`, Test in `push-weekly-core.test.ts` (E15, Tests 8, S2) |
| **M3** Pakete aus Läufen vor der Migration scheitern an Pflichtfeld `publicId` | `select` ohne `publicId`, `batchProviders` mit lockerem Schema, Test (E16, Tests 2, S1) |
| **M4** Meldung mit freiem Wert lässt sich aus Zod nicht erzeugen | Vorprüfung `missingPublicIds(raw)` vor `safeParse` (E16, Tests 4) |
| **M5** Bindung `publicId === shortId(id, s)` widerspricht dem Umbenennungsweg | Satz korrigiert: vor einer Umbenennung ein Feld mit der früheren Katalog-ID, Idee (E16, S5, ADR 0022) |
| **M6** E2E-Fundstellen unvollständig, eine Prüfung würde still wirkungslos | Fundstellen in Tests 10, `merkliste-anbieter.spec.ts:125` prüft mit `publicId` |
| **m1** `vite preview` liefert für unbekannte Pfade die Startseite | Muster `page.route` mit `404.html` aus `teilen.spec.ts:222–227` (Tests 10) |
| **m2** Liste der Unit-Tests in S1 | korrigiert (S1) |
| **m3** Obergrenze für `nextPublicId` | wirft ab `seed` 10 (E16, Tests 1) |
| **m4** YAML-Migration: `visit`-Block nicht übernehmen, Selbstprüfung, Schlüsselreihenfolge | E17, Tests 2, E16 (`providerFromCandidate`) |
| **m5** `PW_SUITE=smoke` lokal widerspricht CLAUDE.md; Fixture-Prüfung auch unter `p/` | Smoke nur in der CI (S3); Prüfung unter `dist/a/` und `dist/p/` (Tests 10) |
| **m6** Auflösen in `useRoute` statt in Effekten von `App.tsx` | übernommen: synchron im Initialisierer und in `onPop`, ein `replaceState` (E15, Tests 7, S2, Budget) |
| **m7** ADR 0022, Punkt 6: 80 Zeichen gelten weiter im Schema | Wortlaut korrigiert |
| **m8** Plan 0026, E1–E7 beschreiben weiter `angebot/`, `anbieter/` | Hinweis vor E1 in Plan 0026 |

## Nachtrag B (2026-10-10): Katalog crawlbar (Plan 0031, ADR 0025)

Plan 0031 hat den Katalog so umgebaut, dass dieser Plan ihn ausführen kann. Der Text oben bleibt stehen; wo er abweicht, gilt dieser Nachtrag.

- **E4 (Abruf):** Statt `kind: js` steht `render: browser` (auch der Eval-Tag `js` aus E8 heißt künftig `render`). Seiten mit `use: info` ruft der Lauf nicht ab. Seiten mit `blocked` ruft er nicht ab; der Anbieter geht trotzdem ans Modell (bewusst ohne diese Quelle) und steht jede Nacht im Bericht. Platzhalter ersetzt `fillPlaceholders` (`scripts/pipeline/lib/placeholders.ts`, gibt es schon). Das Schemafeld `request` gibt es schon; die zwei Kursorganizer-Abfragen sind per `curl` geprüft (Plan 0031). Den POST-Abruf selbst baut dieser Plan (`fetch-page` kann heute nur GET).
- **E3 (Eingabe):** Der Prompt bekommt je Seite `hint`, je Ort `venues[].hint`, dazu `availability.how`/`system`; `notes` nie.
- **E5:** Der `inputHash` umfasst den Katalogauszug **ohne** `notes` (ersetzt „samt Orten und Notizen“).
- **Schritt 4:** Schemafeld `request`, Platzhalter und `fillPlaceholders` entfallen (erledigt durch Plan 0031).
- **Schritt 5:** Ausnahmen stehen künftig als `blocked` mit Abrufbeleg, nicht in `notes`. Die Eversports-Seiten (403 per Skript) stehen als `render: browser`; ob sie im Browser lesbar sind, klärt `pipeline fetch`.
- **Neu:** `aggregator` hat immer einen `adapter`; jeder Anbieter ohne `coveredBy` hat eine Seite `use: termine` ohne `blocked` (Schema). Jeder Katalog-Eintrag hat `region`.
