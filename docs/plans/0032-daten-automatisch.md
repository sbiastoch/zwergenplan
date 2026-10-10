# Plan 0032 – Daten automatisch: Nachtlauf und Entdecken über das Abo

Status: Entwurf (2026-10-10)
Datum: 2026-10-10
Ersetzt: Plan 0015 (Hauptteil und Nachtrag B). Plan 0015, Nachtrag A (stabile IDs, ADR-Entwurf 0022) wird unverändert übernommen und ist Stufe 0 dieses Plans.
Bezug: ADR 0002 (Hosting, Datenfluss), ADR 0003 (Datenmodell), ADR 0006 (Recherche-Pipeline), ADR 0016 (Entwurf, wird ersetzt), ADR 0022 (Entwurf, stabile IDs), ADR 0024 und 0025 (Katalog); neu: ADR 0026 (entsteht mit der Freigabe)

## Anlass

Nutzer am 2026-10-10 (Chat, sinngemäß zusammengefasst, Kernsätze wörtlich):

> „Ich überlege, was die beste Architektur und der beste Tech-Stack ist, um die Daten regelmäßig und automatisch zu aktualisieren. […] Die Architektur soll so sein, dass weitere Orte auch noch dazukommen können. […] Wichtig ist, durch Updates nicht bestehende Daten zu beschädigen. Die Datenpipeline soll zudem evaluierbar sein […], da ich verschiedene Modelle ausprobieren möchte. […] Hinterfrage gerne aggressiv Dinge […]. Einfachheit ist ganz wichtig.“

Entscheide im Gespräch:

- **N-A** Crawlen nur mit Open Source, kein externer Crawl-Dienst per API. Firecrawl entfällt (selbst gehostet sechs Container, ohne Fire-engine kaum mehr als Playwright plus Markdown).
- **N-B** Modellzugang **über das Abo** (`claude -p` in GitHub Actions), für beide Läufe. Kein API-Konto, kein SDK.
- **N-C** Entdecken neuer Anbieter ist „der wichtigste Schritt für die Nutzer“ und **mergt direkt**, ohne PR.
- **N-D** Ein neuer Anbieter wird aufgenommen, wenn er **mindestens ein** gültiges Angebot liefert.
- **N-E** Websuche des Agenten ist erlaubt (Suchen ist kein Crawlen).
- **N-F** Kosten jedes Laufs werden sauber berichtet.

## Ausgangslage

- Plan 0015 (143 kB, freigegeben, nicht umgesetzt) plant einen Nachtlauf mit einem Modellaufruf je Anbieter über einen OpenAI-kompatiblen Endpunkt mit eigenem SSE-Client, Eval-Gate über einen Extraktor-Hash, Schattenbetrieb in `actions/cache`, Zustand `ausstehend` und dreistufigen Exit-Codes. Es gibt weder `nightly.yml` noch `evals/`.
- Plan 0031 hat den Katalog ausführbar gemacht (`use`, `render`, `request`, `blocked`, `hint`, `{von}`/`{bis}`, `region`, `skipCrawl`). Darauf baut dieser Plan auf.
- Stand 2026-10-10: 83 Katalogeinträge (74 Anbieter, 7 Sammelkalender, 2 Verzeichnisse), 223 Programm-URLs, 333 Angebote, 2889 Termine, ein einziger Recherchelauf (2026-10-04). Verfügbarkeit: 135 `unbekannt`, 77 `frei`, 43 `warteliste`, 31 `ohne-anmeldung`, 27 `wenige`, 20 `ausgebucht`.
- Gemessen in Plan 0015: alle Seiten zusammen 2,15 Mio. Zeichen (≈ 0,6 Mio. Tokens), größter Anbieter 284 000 Zeichen, 14 von 197 URLs per Skript nicht abrufbar.
- Stabile IDs (Plan 0015, Nachtrag A) sind nicht umgesetzt; heute hängt die Angebots-ID am Titel.

## Ziel

1. **Jede Nacht aktuelle Termine und Plätze** für alle bekannten Seiten, ohne Menschen und ohne lokalen Rechner.
2. **Jede Woche neue Anbieter und neue Seiten** je Region, automatisch aufgenommen, wenn sie Ertrag belegen.
3. **Bestehende Daten werden nie beschädigt**: Ein Fehler kostet höchstens Aktualität, nie Bestand.
4. **Evaluierbar**: Jedes Modell lässt sich auf denselben eingefrorenen Fällen messen.
5. **Kosten sichtbar** je Aufruf, je Lauf und als Zeitreihe im Repo.
6. **Regionsfähig**: Eine zweite Region ist ein Matrix-Eintrag, kein Umbau der Pipeline.
7. **Einfach**: deutlich weniger eigener Code als Plan 0015.

## Nicht-Ziele

- Eine zweite Region bauen (ÖPNV, Ferien je Land, Stadtteile, Texte bleiben Restpunkte in `docs/ideas.md`).
- Adapter für Platzstände je Buchungssystem (E4: der Platzstand kommt über den geänderten Seiten-Hash).
- Modelle anderer Anbieter im Betrieb. Ein zweites Backend nur für Evals ist Option, nicht Teil der ersten Stufen.
- Kennzeichnung „neu entdeckt“ in der App (eigener Plan).
- Katalog in eine Datei je Anbieter aufteilen (N1, offen).

## Entscheidungen

### E1 – Zwei Läufe, klare Arbeitsteilung

| | **Nachtlauf** (`nightly.yml`) | **Entdecken** (`discover.yml`) |
|---|---|---|
| Frage | Was steht auf den Seiten, die wir kennen? | Welche Anbieter und Seiten kennen wir noch nicht? |
| Takt | täglich 01:30 UTC | wöchentlich, Matrix je Region; `--bootstrap` einmalig für eine neue Region |
| schreibt | `data/raw/<id>.json`, `data/offers.json`, `data/kosten.csv` | `data/providers.yaml`, dazu über den Nachtlauf-Code die Rohdaten der neuen Einträge |
| Modell | Haiku, ohne Werkzeuge | Sonnet bzw. Haiku je Schritt, nur `WebSearch`/`WebFetch` |
| Ende | Commit auf `main`, CI per `workflow_dispatch` | Commit je Anbieter auf `main`, CI per `workflow_dispatch` |

**Regel:** Nur Code aus dem Nachtlauf erzeugt Angebote. Entdecken erweitert den Katalog und ruft für jeden neuen Eintrag denselben Code (`refreshProvider`) auf; so gibt es genau einen Extraktionsweg.

### E2 – Modellzugang: `claude -p` über das Abo

- **Actions:** `npm i -g @anthropic-ai/claude-code@<fest gepinnte Version>` im Workflow, Secret `CLAUDE_CODE_OAUTH_TOKEN` (einmalig per `claude setup-token`). Kein npm-Paket im Repo.
- **`scripts/pipeline/io/llm.ts`** ist die einzige Stelle, die ein Modell aufruft. Schnittstelle:
  ```ts
  type LlmCall = { model: string; system: string; user: string; tools: "none" | "web"; schema?: JsonSchema; signal: AbortSignal };
  type LlmResult = { text: string; usage: Usage; costUsd: number | null; turns: number; durationMs: number; rateLimited: boolean };
  ```
  Das Backend `claude-cli` startet `claude -p` per `execFile`, Prompt über stdin, `--output-format json`, Modell per `--model`, Werkzeuge per CLI-Option gesperrt bzw. auf `WebSearch,WebFetch` begrenzt. Die Umgebung des Kindprozesses enthält nur `PATH`, `HOME` und das Token.
- **Strukturierte Ausgabe:** Kann die gepinnte CLI ein JSON-Schema erzwingen, wird es genutzt. Sonst parst `lib/llm-json.ts` die Antwort (Code-Fence entfernen, `JSON.parse`), Zod prüft, und es gibt **eine** Wiederholung mit den Fehlermeldungen. Was die CLI kann, klärt der Spike (Stufe 1, S1.1).
- **Kein eigenes Streaming, kein eigener Retry-Client.** Wiederholung bei Netz- oder 5xx-Fehlern übernimmt die CLI; erkennt `llm.ts` ein Nutzungslimit des Abos, meldet es `rateLimited`, und der Lauf endet geordnet (E8).
- **Weitere Backends** (z. B. OpenAI-kompatibel für Evals) implementieren dieselbe Schnittstelle; sie kommen erst, wenn ein Eval sie braucht.
- Tests nutzen einen Fake, der `LlmCall` aufzeichnet und feste Antworten gibt.

### E3 – Abruf: deterministisch, Open Source, nach Katalog

Übernommen aus Plan 0015, E4 mit Nachtrag B, gekürzt:

- Je Programmeintrag: `html` per `fetchPage` + `extractPage`; `render: browser` per Playwright Chromium (`io/browser.ts`, einzige Stelle mit Playwright-Import); `ical` per `parseIcal`; `json-api` per GET oder `request` (POST); `pdf` per `pdftotext`.
- Abgerufen wird nach ADR 0025, Punkt 7: `use: info` und `blocked` nie; Sammelkalender nur über ihren Adapter; Anbieter mit `coveredBy` bekommen nur ihre Kandidaten.
- Platzhalter `{von}`/`{bis}` (Monatsanfang, 13 Monate) über `fillPlaceholders`. Links werden nie verfolgt.
- Höflichkeit: höchstens 4 Abrufe parallel, 2 je Host, 2 Wiederholungen bei Timeout.
- **Normalisierung vor dem Hash** (`lib/normalize.ts`): Leerraum, Zeitstempel, Session-IDs in URLs, Cookie-Banner-Texte aus einer festen Liste. Ziel: Der Hash ändert sich nur, wenn sich Inhalt ändert. S1.2 misst, ob das reicht.
- **Eingabe-Obergrenze** 350 000 Zeichen je Anbieter. Darüber: `fehler` („Eingabe zu groß“), nie gekürzt.
- Eine Seite mit Fehler (HTTP ≥ 400, Timeout, leeres PDF, Playwright-Fehler) heißt: Der Anbieter geht nicht ans Modell, sein alter Stand bleibt.

### E4 – Extraktion: ein Aufruf je Anbieter, nur bei geändertem Hash

- `inputHash` = sha256 über normalisierten Text aller Seiten, Kandidaten, Katalogauszug ohne `notes` (ADR 0025) und `PROMPT_VERSION` (sha256 über `prompt/extract.md`).
- **Gleicher Hash → kein Aufruf**, die alten Events bleiben. Das spart wenig Geld, hält aber Titel, Zusammenfassungen und damit Diffs und ID-Zuordnung stabil.
- **Platzstand bei gleichem Hash:** `availability.checkedAt` wird auf die Abrufzeit gesetzt; die Seite wurde ja geprüft und war gleich.
- Prompt aus `references/extraction.md` des Skills (Fachregeln, Verfügbarkeitstabelle, „Werte werden nie geraten“), ergänzt um Datum und Antwortformat; `extraction.md` wird danach gelöscht, der Prompt ist die einzige Quelle.
- **Modelle:** `LLM_MODEL_EXTRACT` (Standard Haiku). Scheitert die Validierung nach der einen Wiederholung, folgt **ein** Versuch mit `LLM_MODEL_FALLBACK` (Standard Sonnet). Danach `fehler`, alter Stand bleibt.
- **Validierung** = `validateRaw` + Build-Probelauf nur dieses Anbieters + `sourceUrl` in der Menge der abgerufenen URLs, ihrer Redirect-Ziele und der Kandidaten-`detailUrl` (Schutz gegen Prompt-Injection aus Webseiten).
- `via` setzt der Code, nie das Modell.

### E5 – Zustand und Schutz des Bestands

- **`data/raw/<providerId>.json`** (Schema `ProviderRaw` in `scripts/pipeline/lib/raw.ts`, exportiert nach `schema/`): `events`, `inputHash`, `promptVersion`, `model`, `status: ok | keine-termine | fehler`, `reason?`, `checkedAt`, `changedAt`, `sources` (Adapter mit Kandidaten).
- **Regeln (vollständig):**

  | Fall | Ergebnis |
  |---|---|
  | Hash gleich | alte Events, `checkedAt` neu |
  | Seite oder Adapter ausgefallen (auch teilweise) | alte Events, `status: fehler` mit Grund |
  | Antwort nach Wiederholung und Fallback ungültig | alte Events, `status: fehler` |
  | Einbruch: alt ≥ 3 Events, neu leer oder < Hälfte | alte Events, neue als `pending` in der Datei; übernommen erst, wenn der nächste Lauf mit gleichem Hash dasselbe liefert |
  | Lauf endet vorzeitig (Limit, Budget, Zeit) | nicht bearbeitete Anbieter unverändert |
  | sonst | neue Events, `status: ok` oder `keine-termine` |

- `build` liest nur `data/raw/*.json`, rechnet Offsets, Ferien, Dubletten und hält IDs über die Zuordnung gegen den Vorstand (ADR 0022). `data/raw` und `data/offers.json` werden nie von Hand bearbeitet.
- **Migration:** Der erste volle Lauf extrahiert alles; `data/offers.json` ist dabei der Vorstand für die ID-Zuordnung. Anbieter, die im ersten Lauf `fehler` liefern, bekommen ihre Events aus dem Vorstand übernommen (einmalig, `status: fehler`, Grund „aus Bestand übernommen“).
- Datenhorizont `offers.json`: heute + 12 Monate (wie Plan 0015, E2), Budget-Messung vor dem ersten Publish (S3.5).

### E6 – Nachtlauf `nightly.yml`

```
concurrency: daten (nie parallel zu discover.yml)
timeout-minutes: 90
  pnpm install --frozen-lockfile; apt poppler-utils; Chromium; claude-code CLI
  pnpm pipeline oepnv                     # wie heute, Feed-Cache in actions/cache
  pnpm pipeline nightly                   # Abruf → Extraktion → build → Bericht → kosten.csv
  pnpm data:validate && pnpm check:fast   # dieselben Gates wie lokal
  git commit data/ && git push origin main  # kein Fast-Forward → Lauf rot, nächste Nacht neu
  gh workflow run ci.yml --ref main       # GITHUB_TOKEN-Push startet sonst keine CI
  upload-artifact runs/<datum>/ (Eingaben, Antworten, Bericht, kosten.jsonl; 14 Tage)
```

- `pnpm pipeline nightly` hat ein Zeitbudget (`RUN_BUDGET_MIN`, Standard 50). Was danach offen ist, bleibt unverändert und steht im Bericht.
- **Rot** (Workflow schlägt fehl, GitHub mailt): Gates rot (dann kein Push), mehr als 20 % der Anbieter `fehler`, Push gescheitert, Nutzungslimit getroffen, oder die Live-Seite liegt mehr als einen Tag hinter `main`. Was fertig war, ist in den ersten beiden Fällen nicht gepusht, in den übrigen schon.
- `data/kosten.csv` bekommt jede Nacht eine Zeile. Damit gibt es auch ohne Datenänderung einen Commit, und GitHub deaktiviert den Cron nicht nach 60 Tagen.
- CI bleibt das einzige Gate vor dem Deploy. Ist sie rot, bleibt die alte Version live.

### E7 – Entdecken `discover.yml`

`pnpm pipeline discover --region <id> [--bootstrap]`:

1. **Kandidaten sammeln (Code):**
   - Sammelkalender: Kandidaten, deren Veranstalter keinem Katalog-Anbieter zugeordnet ist (`lib/match.ts`).
   - Sitemaps bekannter Anbieter (`/sitemap.xml`, `robots.txt`): URLs, die neu sind gegenüber `data/discover/<region>.json` (gemerkte Sitemap-Stände) und ein Stichwort aus `lib/discover-terms.ts` tragen.
   - Verzeichnisse (`role: verzeichnis`): Einträge ohne Treffer im Katalog.
   - Reparaturliste aus den letzten 7 Nachtberichten: Seite 404 oder Umzug.
2. **Websuche (Modell):** je Suchbegriff aus einer festen Liste (Krabbelgruppe, PEKiP, Babyschwimmen, Babymassage, Eltern-Kind-Turnen, Musikgarten, Familienzentrum, Familienbildungsstätte, Hebammenpraxis Kurse, Eltern-Kind-Gruppe Pfarrei) und Region ein Aufruf mit `WebSearch`/`WebFetch`. Ausgabe: Liste `{name, url, warum}`.
3. **Dubletten (Code):** gleiche registrierbare Domain, ähnlicher Name (`lib/similar.ts`) oder geocodierter Ort < 50 m neben einem bekannten Ort → kein neuer Anbieter; höchstens neue Programmseite beim bekannten.
4. **Bewerten (Modell):** je Kandidat ein Aufruf mit `WebFetch`. Ausgabe nach Schema: verwerfen mit Grund, oder ein Katalogeintrag (`Provider` aus `schema.ts`, ohne `publicId`, Orte als Adresse) bzw. ein neuer Programmeintrag für einen bekannten Anbieter.
5. **Geocodieren (Code)** über `io/geocode.ts`; Ort muss in der bbox der Region liegen.
6. **Ertragsbeweis (Code):** `refreshProvider` (Nachtlauf-Code) nur für diesen Eintrag. **≥ 1 gültiges Angebot** mit Alter 0–3 und künftigem Termin → aufnehmen. Sonst Kandidatenliste im Bericht und `data/discover/<region>.json` (damit derselbe Kandidat nicht jede Woche neu bewertet wird; Wiedervorlage nach 8 Wochen).
7. **Gates (Code), alle Pflicht:**
   - G1 Schema und `data:validate` grün.
   - G2 Nur hinzufügen: neue Einträge, neue Programmeinträge, URL-Ersatz nur mit nachweislich abrufbarer neuer URL. Nie löschen, nie `skipCrawl` setzen, nie bestehende Angebote ändern. Ein Diff-Prüfer (`lib/catalog-diff.ts`) erzwingt das.
   - G3 Höchstens 10 neue Anbieter je Lauf und Region, mit `--bootstrap` 60.
   - G4 Ein Commit je Anbieter: `data: neuer Anbieter <id> (<region>)` mit Fund-URL, Grund und erstem Angebot im Commit-Text.
8. `git push`, `gh workflow run ci.yml`, Bericht.

`publicId` vergibt der Code (`shortId`, ADR 0022). Der Agent hat keine Schreib- oder Shell-Werkzeuge; alles, was er liefert, ist Daten, die Code prüft.

### E8 – Kosten und Grenzen

- **Je Aufruf** eine Zeile in `runs/<datum>/kosten.jsonl`: Lauf, Schritt (`extract`, `fallback`, `search`, `assess`), Anbieter bzw. Kandidat, Modell, Tokens (Eingabe, Ausgabe, Cache lesen/schreiben), Schritte, Dauer, `costUsd` (API-Gegenwert laut CLI, nicht der Abo-Preis), Ergebnis.
- **Je Lauf** im `$GITHUB_STEP_SUMMARY` und im Bericht: Summen je Schritt und Modell, Kosten je aufgenommenem Anbieter bzw. je extrahiertem Anbieter, Rate-Limit-Treffer, Aufrufe gespart durch den Cache.
- **Zeitreihe** `data/kosten.csv`: `datum,lauf,region,aufrufe,tokens_ein,tokens_aus,usd_api_gegenwert,limit_getroffen,neue_anbieter,geaenderte_anbieter`.
- **Bremsen** je Lauf: `MAX_CALLS` (Nacht 150, Entdecken 120), `MAX_TOKENS` (Nacht 3 Mio., Entdecken 5 Mio.) und das Zeitbudget. Erreicht → geordnetes Ende, Fertiges wird gesichert, Lauf rot.
- `pnpm pipeline kosten [--monat JJJJ-MM]` druckt Monatssummen aus `data/kosten.csv`.

### E9 – Evals

- `evals/cases/<anbieter>-<datum>/`: `input.json` (eingefrorene Eingabe wie in E4, aus `runs/` übernommen) und `expected.json` (von Hand geprüfte Events). 12 Fälle zum Start, ausgewählt nach Art: html, browser, ical, pdf, json-api, Sammelkalender-Kandidaten, groß (> 100 000 Zeichen), keine Termine.
- `pnpm eval [--model …] [--backend …]` ruft dieselbe Funktion wie der Nachtlauf (`extractProvider`) und bewertet deterministisch (`lib/eval-score.ts`): Termine über Anbieter, Ort und Beginnzeit 1:1 zuordnen; Recall und Präzision der Termine; Feldtreffer für `format`, `availability.status`, `cost`, `registration`, `topics`; Validierungsrate; Kosten und Dauer.
- Ergebnis als Zeile in `evals/results.md` (Datum, Modell, Backend, `PROMPT_VERSION`, Kennzahlen). Kein Gate: Das Eval läuft bei Modell- oder Prompt-Wechsel; CI warnt, wenn für die aktuelle `PROMPT_VERSION` keine Zeile existiert.
- **Entdecken-Eval** (Stufe 6): 10 bekannte Anbieter werden für den Lauf ausgeblendet; gemessen wird, wie viele `discover` wiederfindet und wie viele falsche Anbieter es aufnehmen würde (Trockenlauf ohne Commit).
- Eingefrorene Eingaben liegen im öffentlichen Repo (wie Plan 0015, E9 entschieden).

### E10 – Bericht

`pnpm pipeline status` und `$GITHUB_STEP_SUMMARY`: Ampel, Angebote und Termine gegen den Vorstand, jede Quelle mit `fehler` samt Grund und Alter, zurückgehaltene Einbrüche, neue Anbieter mit Fund-URL, Kandidaten ohne Ertrag, Kosten (E8), Live-Stand gegen `main`.

### E11 – Skill und Katalogpflege

Der Skill `babyevents-nuernberg` wird ein Wartungsleitfaden: Kandidaten ohne Ertrag sichten, Katalog von Hand korrigieren, Eval-Fälle anlegen, Modell wechseln, Region starten. Er ruft dieselben Befehle (`pipeline nightly --only`, `discover --dry-run`, `eval`). `init`, `select`, Pakete und Subagenten-Rohdaten entfallen.

### E12 – Was aus Plan 0015 bleibt und was entfällt

- **Bleibt:** Abruf nach Katalog (E4 mit Nachtrag B), `data/raw` je Anbieter, Hash-Cache, Einbruchschutz, Build-Probelauf je Anbieter, URL-Plausibilität, 12-Monats-Horizont, Statusbericht, Nachtrag A (stabile IDs).
- **Entfällt:** OpenAI-kompatibler Client mit SSE und eigenem Retry (E3, `lib/sse.ts`, `lib/llm-retry.ts`), `EXTRACTOR_VERSION` als Gate, Schattenbetrieb in `actions/cache`, Zustand `ausstehend`, Exit-Codes 0/1/2, `NIGHTLY_PUBLISH`.

### E13 – Regionen

`nightly.yml` läuft über den ganzen Katalog (eine Region heute). `discover.yml` ist eine Matrix über `REGION_IDS` (`src/domain/regions.ts`). Suchbegriffe sind regionsneutral, die Region geht als Name in die Suche. Ferien je Bundesland, ÖPNV und Sammelkalender-Adapter einer neuen Region sind deren eigener Plan.

## Stufen

Jede Stufe endet mit grünem `pnpm verify` und grüner CI auf `main`.

**Stufe 0 – Stabile IDs:** Plan 0015, Nachtrag A wie dort beschrieben (Schritte, Tests, Migration). Voraussetzung für alles mit Modell, weil sonst jede Umformulierung Links und Merklisten bricht.

**Stufe 1 – Spike und Messung (ohne Commit von Daten):**
- S1.1 `claude -p` in Actions: Workflow `spike-cli.yml` (manuell), ein Aufruf mit Haiku auf einem Eval-Kandidaten. Festhalten im Plan: genaue CLI-Optionen für Modell, gesperrte Werkzeuge, JSON-Ausgabe, Schema-Zwang; Felder für Usage und `costUsd`; Erkennung von Nutzungslimits; Dauer. Gate: Nutzer bestätigt, dass Nutzung im Abo so in Ordnung ist.
- S1.2 `pnpm pipeline fetch [--only]` (E3) und `nightly.yml` nur mit Abruf und Hashes, 7 Nächte, Ergebnis als Artefakt. Gemessen: Anteil geänderter Anbieter je Nacht, Hash-Rauschen (Änderung ohne Inhaltsänderung), Abruffehler je Art.

**Stufe 2 – Extraktion lokal:** `io/llm.ts` (E2), `lib/llm-json.ts`, Prompt, `extractProvider`, `refreshProvider` mit den Regeln aus E5, `ProviderRaw`, `build` aus `data/raw`. Dazu die 12 Eval-Fälle und `pnpm eval`. Ergebnis: Eval mit Haiku und Sonnet in `evals/results.md`; Modellwahl durch den Nutzer.

**Stufe 3 – Nachtlauf live:**
- S3.1 Kostenbericht (E8) und `data/kosten.csv`.
- S3.2 Erster voller Lauf lokal bzw. per `workflow_dispatch` ohne Push, Bericht an den Nutzer.
- S3.3 Migration (E5) und `data/raw` initial.
- S3.4 Größe `site.json` mit 12 Monaten gegen das Budget (über Budget → Nutzerentscheid, Schwelle nicht still senken).
- S3.5 `nightly.yml` mit Push und CI-Dispatch.

**Stufe 4 – Entdecken, deterministische Quellen:** E7 Schritte 1 (ohne Sitemaps), 3, 4–8, Gates G1–G4, `discover.yml` wöchentlich. Erst als `--dry-run` zwei Wochen mit Bericht, dann mit Commit.

**Stufe 5 – Entdecken, Websuche und Sitemaps:** E7 Schritt 1 (Sitemaps) und 2.

**Stufe 6 – Abschluss:** Entdecken-Eval, Skill (E11), ADR 0026 angenommen, ADR 0016 auf „ersetzt“, Plan 0015 nach `docs/plans/archiv/` mit `ersetzt durch Plan 0032`, `docs/architecture.md` und `CLAUDE.md` nachgezogen.

### Was der Nutzer tun muss

- Secret `CLAUDE_CODE_OAUTH_TOKEN` anlegen (Stufe 1).
- S1.1 bestätigen, nach Stufe 2 das Modell wählen, nach S3.2 den ersten vollen Lauf ansehen.

## Tests

Test-first für alles in `lib/`:

- `refresh.test.ts`: jede Zeile der Tabelle in E5, Einbruch über zwei Läufe, vorzeitiges Ende.
- `llm-json.test.ts`: Code-Fence, kaputtes JSON, Wiederholung mit Meldungen.
- `llm.test.ts`: Backend `claude-cli` mit einem Fake-Binary (Skript in `tests/fixtures/`), das Antworten und Limits simuliert; Umgebung des Kindprozesses ohne fremde Variablen.
- `normalize.test.ts`: gleicher Inhalt mit anderem Zeitstempel ergibt gleichen Hash.
- `catalog-diff.test.ts`: G2 lehnt Löschen, `skipCrawl`, Änderung bestehender Felder ab, erlaubt Hinzufügen und belegten URL-Ersatz.
- `discover.test.ts`: Dubletten, Ertragsbeweis (Fake-Extraktion), G3, ein Commit je Anbieter (mit `tempRepo()`).
- `cost.test.ts`: Zeilen und Summen, Bremsen.
- `eval-score.test.ts`: Zuordnung, Recall, Präzision, Feldtreffer.
- E2E: keine neuen Specs; Daten-Änderungen laufen über die bestehenden Smoke-Specs.

## Risiken

| | Risiko | Gegenmaßnahme |
|---|---|---|
| R1 | Nutzungsbedingungen oder Limits des Abos für `claude -p` in Actions | S1.1 klärt und misst, Nutzer bestätigt; `llm.ts` hat eine Schnittstelle für ein anderes Backend |
| R2 | Haiku extrahiert schlechter als gedacht | Eval in Stufe 2, Fallback auf Sonnet je Anbieter |
| R3 | Prompt-Injection aus Webseiten oder Suchergebnissen | keine Schreib-/Shell-Werkzeuge, Schema, URL-Plausibilität, Ertragsbeweis, G2 |
| R4 | Entdecken nimmt einen falschen Anbieter auf (Zielgruppe, Vermittler) | Ertragsbeweis mit Alter 0–3, G3, Commit je Anbieter für gezielten Revert, Bericht |
| R5 | Hash-Rauschen macht den Cache wirkungslos | S1.2 misst, Normalisierung nachschärfen |
| R6 | 12 Monate sprengen das Budget von `site.json` | S3.4 |
| R7 | CLI-Version ändert Ausgabeformat | Version gepinnt, Update nur mit Eval-Lauf |

## Offene Nutzerentscheide

- **N1** Katalog in eine Datei je Anbieter (`data/providers/<region>/<id>.yaml`)? Empfehlung: nicht in diesem Plan, erst mit der zweiten Region; Commits je Anbieter (G4) halten Diffs auch so klein.
- **N2** Entdecken auch für Korrekturen an bestehenden Anbietern (z. B. `skipCrawl` nach 4 Wochen ohne Termine) automatisch? Empfehlung: nein, nur Bericht (G2).
