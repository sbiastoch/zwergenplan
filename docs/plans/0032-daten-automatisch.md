# Plan 0032 – Daten automatisch: Nachtlauf und Entdecken über das Abo

Status: in Umsetzung (Stufe 0 auf Branch `stufe-0-stabile-ids`, 2026-10-10). Freigegeben 2026-10-10 vom Nutzer; N3 mit der Empfehlung entschieden.
Datum: 2026-10-10
Ersetzt: Plan 0015 (Hauptteil und Nachtrag B). Plan 0015, Nachtrag A (stabile IDs, ADR-Entwurf 0022) wird unverändert übernommen und ist Stufe 0 dieses Plans; seine offenen Entscheide N-I3 und N-I4 gelten weiter.
Bezug: ADR 0002 (Hosting, Datenfluss), ADR 0003 (Datenmodell), ADR 0004 (Backpressure), ADR 0006 (Recherche-Pipeline), ADR 0011 (Fahrplan), ADR 0016 (Entwurf, wird ersetzt), ADR 0022 (Entwurf, stabile IDs), ADR 0024 und 0025 (Katalog); neu: ADR 0026 (entsteht mit der Freigabe, Inhalt in E14)

## Anlass

Nutzer am 2026-10-10 (Chat, Kernsätze wörtlich):

> „Ich überlege, was die beste Architektur und der beste Tech-Stack ist, um die Daten regelmäßig und automatisch zu aktualisieren. […] Die Architektur soll so sein, dass weitere Orte auch noch dazukommen können. […] Wichtig ist, durch Updates nicht bestehende Daten zu beschädigen. Die Datenpipeline soll zudem evaluierbar sein […], da ich verschiedene Modelle ausprobieren möchte. […] Hinterfrage gerne aggressiv Dinge […]. Einfachheit ist ganz wichtig.“

Entscheide im Gespräch:

- **N-A** Crawlen nur mit Open Source, kein externer Crawl-Dienst per API. Firecrawl entfällt (selbst gehostet sechs Container, ohne Fire-engine kaum mehr als Playwright plus Markdown).
- **N-B** Modellzugang **über das Abo** (`claude -p` in GitHub Actions), für beide Läufe. Kein API-Konto, kein SDK.
- **N-C** Entdecken neuer Anbieter ist „der wichtigste Schritt für die Nutzer“ und **mergt direkt**, ohne PR.
- **N-D** Ein neuer Anbieter wird aufgenommen, wenn er **mindestens ein** gültiges Angebot liefert.
- **N-E** Websuche des Agenten ist erlaubt (Suchen ist kein Crawlen).
- **N-F** Kosten jedes Laufs werden sauber berichtet.
- **N-G** Wesentliche Änderungen aus Reviews werden dem Nutzer vor dem Einarbeiten begründet und von ihm abgenommen (Abschnitt „Review“).

## Ausgangslage

- Plan 0015 (143 kB, freigegeben, nicht umgesetzt) plant einen Nachtlauf mit einem Modellaufruf je Anbieter über einen OpenAI-kompatiblen Endpunkt mit eigenem SSE-Client, Eval-Gate über einen Extraktor-Hash, Schattenbetrieb in `actions/cache`, Zustand `ausstehend` und dreistufigen Exit-Codes. Es gibt weder `nightly.yml` noch `evals/`.
- Plan 0031 hat den Katalog ausführbar gemacht (`use`, `render`, `request`, `blocked`, `hint`, `{von}`/`{bis}`, `region`, `skipCrawl`). Darauf baut dieser Plan auf.
- Stand 2026-10-10: 83 Katalogeinträge (74 Anbieter, davon 13 mit `coveredBy`; 7 Sammelkalender, 2 Verzeichnisse), 223 Programm-URLs, 333 Angebote, 2889 Termine, ein einziger Recherchelauf (2026-10-04, Rohdaten nur lokal und gitignored). Verfügbarkeit: 135 `unbekannt`, 77 `frei`, 43 `warteliste`, 31 `ohne-anmeldung`, 27 `wenige`, 20 `ausgebucht`.
- Gemessen in Plan 0015: alle Seiten zusammen 2,15 Mio. Zeichen (≈ 0,6 Mio. Tokens), größter Anbieter 284 000 Zeichen, 14 von 197 URLs per Skript nicht abrufbar.
- `build` übernimmt heute schon Angebote aus dem Altbestand, wenn eine Quelle fehlt (`scripts/pipeline/lib/build-offers.ts`, ab Zeile 308). `lib/relevance.ts` (`isRelevant`) und `lib/similar.ts` gibt es.
- Stabile IDs (Plan 0015, Nachtrag A) sind nicht umgesetzt; heute hängt die Angebots-ID am Titel.
- Das Repo ist öffentlich (ADR 0002): Logs und Artefakte von Actions sind einsehbar, geplante Workflows werden nach 60 Tagen ohne Repo-Aktivität deaktiviert.

## Ziel

1. **Jede Nacht aktuelle Termine und Plätze** für alle bekannten Seiten, ohne Menschen und ohne lokalen Rechner.
2. **Jede Woche neue Anbieter** je Region, automatisch aufgenommen, wenn sie Ertrag belegen.
3. **Bestehende Daten werden nie beschädigt**: Ein Fehler kostet höchstens Aktualität, nie Bestand.
4. **Evaluierbar**: Jedes Modell lässt sich auf denselben eingefrorenen Fällen messen.
5. **Kosten sichtbar** je Aufruf, je Lauf und als Zeitreihe im Repo.
6. **Regionsfähig**: Eine zweite Region ist ein Eintrag in `REGION_IDS`, kein Umbau der Pipeline.
7. **Einfach**: deutlich weniger eigener Code als Plan 0015.

## Nicht-Ziele

- Eine zweite Region bauen (ÖPNV, Ferien je Land, Stadtteile, Texte bleiben Restpunkte in `docs/ideas.md`).
- Adapter für Platzstände je Buchungssystem (E4: der Platzstand kommt über den geänderten Seiten-Hash).
- **Automatische Änderungen an bekannten Anbietern** durch das Entdecken: neue Seiten, umgezogene URLs, `skipCrawl`. Sie stehen nur im Bericht (Nutzerabnahme, Review M3).
- Sitemaps und Reparaturliste als Quellen des Entdeckens (Nutzerabnahme, Review Scope).
- Modelle anderer Anbieter im Betrieb. Notausweg siehe R1.
- Kennzeichnung „neu entdeckt“ in der App (eigener Plan).
- Katalog in eine Datei je Anbieter aufteilen (erst mit der zweiten Region, `docs/ideas.md`).

## Entscheidungen

### E1 – Zwei Läufe, klare Arbeitsteilung

| | **Nachtlauf** (`nightly.yml`) | **Entdecken** (`discover.yml`) |
|---|---|---|
| Frage | Was steht auf den Seiten, die wir kennen? | Welche Anbieter kennen wir noch nicht? |
| Takt | täglich 01:30 UTC | wöchentlich, Sonntag 04:30 UTC; per `workflow_dispatch` mit `--bootstrap` für eine neue Region |
| schreibt | `data/raw/<id>.json`, `data/offers.json`, `data/kosten.csv` | `data/providers.yaml`, `data/raw/<id>.json` der neuen Anbieter, `data/discover/<region>.json`, `data/kosten.csv` |
| Modell | Haiku, ohne Werkzeuge | Websuche: mit `WebSearch`/`WebFetch`; Bewerten und Extraktion: ohne Werkzeuge |
| Ende | Commit auf `main`, CI per `workflow_dispatch` | Commit je Anbieter auf `main`, CI per `workflow_dispatch`, ein Sammel-Issue |

**Regel:** Nur `refreshProvider` (Nachtlauf-Code) erzeugt Rohdaten. Entdecken ruft für jeden neuen Eintrag dieselbe Funktion auf; so gibt es genau einen Extraktionsweg. `offers.json` baut nur der Nachtlauf; neue Anbieter erscheinen also spätestens am nächsten Morgen.

### E2 – Modellzugang: `claude -p` über das Abo

- **Actions:** `npm i -g @anthropic-ai/claude-code@<fest gepinnte Version>` im Workflow, Secret `CLAUDE_CODE_OAUTH_TOKEN` (einmalig per `claude setup-token`). Kein npm-Paket im Repo.
- **`scripts/pipeline/io/llm.ts`** ist die einzige Stelle, die ein Modell aufruft. Schnittstelle:
  ```ts
  type LlmCall = { model: string; systemPromptFile: string; user: string; tools: "none" | "web"; schema: JsonSchema; maxTurns: number; signal: AbortSignal };
  type LlmResult = { output: unknown; usage: Usage; costUsd: number | null; turns: number; durationMs: number; abort: "auth" | "limit" | null; truncated: boolean };
  ```
- **Aufruf, verbindlich** (Review B1; `llm.test.ts` prüft Argumentliste, Arbeitsverzeichnis und Umgebung):
  - Arbeitsverzeichnis: frisches `mkdtemp()`, nie der Checkout. So lädt die CLI weder `.claude/settings.json` (Hooks, Stop-Gate) noch `CLAUDE.md`, und es gibt kein `.git`.
  - `HOME`: eigenes leeres Temp-Verzeichnis.
  - Umgebung nur `PATH`, `HOME`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS` (fest 32 000).
  - Argumente: `-p`, `--model <m>`, `--system-prompt-file <datei>` (ersetzt den Standard-Prompt; Pflicht auch wegen der Tokens), `--tools ""` bzw. `--tools "WebSearch,WebFetch"`, `--disallowedTools "mcp__*"`, `--output-format json`, `--json-schema <datei>`, `--max-turns <n>`, `--no-session-persistence`, `--permission-mode dontAsk`. Eingabe über stdin.
  - S1.1 prüft zusätzlich, ob `--restricted` dasselbe mit einer Option leistet; dann ersetzt es die Liste.
- **Ausgabe:** Die CLI erzwingt das Schema (`--json-schema`, Ergebnis in `structured_output`). Zod prüft trotzdem; scheitert die fachliche Validierung (E4), gibt es **eine** Wiederholung mit den Meldungen.
- **Abbruch:** Meldet die CLI `authentication_failed` oder `billing_error`, wird `abort: "auth"`; meldet sie ein Nutzungslimit, `abort: "limit"`. Der **erste** solche Fall beendet den Lauf geordnet (E6). Eine abgeschnittene Ausgabe (`truncated`) ist `fehler` des Anbieters, ohne Wiederholung.
- **Logs:** `--verbose` und Debug-Ausgaben nie; Modellantworten nur im Artefakt, nicht im Log.
- Tests nutzen ein Fake-Binary (`tests/fixtures/`), das Antworten, Limits und Auth-Fehler simuliert.

### E3 – Abruf: deterministisch, Open Source, nach Katalog

Übernommen aus Plan 0015, E4 mit Nachtrag B, gekürzt:

- Je Programmeintrag: `html` per `fetchPage` + `extractPage`; `render: browser` per Playwright Chromium (`io/browser.ts`, einzige Stelle mit Playwright-Import); `ical` per `parseIcal`; `json-api` per GET oder `request` (POST); `pdf` per `pdftotext`.
- Abgerufen wird nach ADR 0025, Punkt 7: `use: info` und `blocked` nie; Sammelkalender nur über ihren Adapter; Anbieter mit `coveredBy` bekommen nur ihre Kandidaten.
- Platzhalter `{von}`/`{bis}` (Monatsanfang, 13 Monate) über `fillPlaceholders`. Links werden nie verfolgt.
- Höflichkeit: höchstens 4 Abrufe parallel, 2 je Host, 2 Wiederholungen bei Timeout.
- **Normalisierung vor dem Hash** (`lib/normalize.ts`): Leerraum, Zeitstempel, Session-IDs in URLs, Cookie-Banner-Texte aus einer festen Liste. S1.2 misst, ob das reicht.
- **Eingabe-Obergrenze** 350 000 Zeichen je Anbieter. Darüber: `fehler` („Eingabe zu groß“), nie gekürzt.
- Eine Seite mit Fehler (HTTP ≥ 400, Timeout, leeres PDF, Playwright-Fehler) heißt: Der Anbieter geht nicht ans Modell, sein alter Stand bleibt.

### E4 – Extraktion: ein Aufruf je Anbieter, nur bei geändertem Hash

- **Cache-Schlüssel** `inputHash` = sha256 über normalisierten Text aller Seiten, Kandidaten, Katalogauszug ohne `notes` (ADR 0025), `prompt/extract.md`, das JSON-Schema der Antwort und das Modell. Ein Wechsel von Prompt, Schema oder Modell extrahiert also einmal alles neu (siehe N3).
- **Gleicher Hash → kein Aufruf**, die alten Events bleiben. Das hält Titel, Zusammenfassungen und damit Diffs und ID-Zuordnung stabil.
- **Platzstand bei gleichem Hash:** `availability.checkedAt` wird auf die Abrufzeit gesetzt; die Seite wurde geprüft und war gleich.
- Prompt aus `references/extraction.md` des Skills (Fachregeln, Verfügbarkeitstabelle, „Werte werden nie geraten“), ergänzt um Datum und Antwortformat; `extraction.md` wird danach gelöscht, der Prompt ist die einzige Quelle.
- **Modelle:** `LLM_MODEL_EXTRACT` (Standard Haiku). Scheitert die Validierung nach der einen Wiederholung, folgt **ein** Versuch mit `LLM_MODEL_FALLBACK` (Standard Sonnet). Danach `fehler`, alter Stand bleibt.
- **Validierung** = `validateRaw` + Build-Probelauf nur dieses Anbieters + `sourceUrl` in der Menge der abgerufenen URLs, ihrer Redirect-Ziele und der Kandidaten-`detailUrl` (Schutz gegen Prompt-Injection aus Webseiten).
- `via` setzt der Code, nie das Modell.

### E5 – Zustand und Schutz des Bestands

- **`data/raw/<providerId>.json`** (Schema `ProviderRaw` in `scripts/pipeline/lib/raw.ts`, exportiert nach `schema/`): `events`, `inputHash`, `model`, `status: ok | keine-termine | fehler`, `reason?`, `checkedAt`, `changedAt`, `failingSince?`, `sources` (Adapter mit Kandidaten), `pending?: { inputHash, events }`.
- **Regeln (vollständig):**

  | Fall | Ergebnis |
  |---|---|
  | keine Raw-Datei (noch nie extrahiert, Lauf vorzeitig beendet) | `build` übernimmt die Angebote des Anbieters aus dem Vorstand `data/offers.json` (bestehende Logik) |
  | Hash gleich, kein `pending` | alte Events, `checkedAt` neu |
  | Hash gleich, `pending` mit diesem Hash | `pending` wird übernommen, ohne Modellaufruf |
  | Seite oder Adapter ausgefallen (auch teilweise) | alte Events, `status: fehler` mit Grund, `failingSince` gesetzt |
  | Antwort nach Wiederholung und Fallback ungültig oder abgeschnitten | alte Events, `status: fehler` |
  | Einbruch: alt ≥ 3 Events, neu leer oder < Hälfte | alte Events bleiben, neue als `pending` mit ihrem `inputHash` |
  | Lauf endet vorzeitig (Abbruch, Budget, Zeit) | nicht bearbeitete Anbieter unverändert |
  | sonst | neue Events, `status: ok` oder `keine-termine`, `failingSince` gelöscht, `pending` gelöscht |

  „Alt“ ist ohne Raw-Datei die Zahl der Angebote des Anbieters in `data/offers.json`; so schützt der Einbruchschutz auch den ersten Lauf. Ändert sich der Hash eines Anbieters mit `pending`, wird normal extrahiert und neu bewertet.
- `build` liest `data/raw/*.json`, rechnet Offsets, Ferien, Dubletten und hält IDs über die Zuordnung gegen den Vorstand (ADR 0022). `data/raw` und `data/offers.json` werden nie von Hand bearbeitet.
- **Migration:** keine. `data/raw` füllt sich Lauf für Lauf; bis dahin gilt die erste Zeile der Tabelle. Der Erstbestand darf über 2–3 Nächte entstehen, wenn das Nutzungslimit des Abos den ersten Lauf beendet (Nutzerabnahme).
- Datenhorizont `offers.json`: heute + 12 Monate (wie Plan 0015, E2), Budget-Messung vor dem ersten Publish (S3.4).

### E6 – Nachtlauf `nightly.yml`

```
permissions: contents: write, actions: write
concurrency: daten (mit discover.yml; ein verworfener wartender Lauf ist hinnehmbar)
timeout-minutes: 90
  actions/checkout mit persist-credentials: false
  pnpm install --frozen-lockfile; apt poppler-utils; Chromium; claude-code CLI (gepinnt)
  pnpm pipeline oepnv                         # wie heute, Feed-Cache in actions/cache
  pnpm pipeline nightly                       # Abruf → Extraktion → build → Bericht → kosten.csv
  pnpm data:validate && pnpm check:fast       # dieselben Gates wie lokal
  pnpm pipeline publish --against-deployed    # bestehender Befehl; git pull --rebase vor dem Push,
                                              # Konflikt → rot ohne Push; Token erst in diesem Schritt
  gh workflow run ci.yml --ref main           # GITHUB_TOKEN-Push startet sonst keine CI
  upload-artifact runs/<datum>/ (Eingaben, Antworten, Bericht, kosten.jsonl; 14 Tage)
```

- `pnpm pipeline nightly` hat ein Zeitbudget (`RUN_BUDGET_MIN`, Standard 50). Was danach offen ist, bleibt unverändert und steht im Bericht.
- **Push:** Sind die Gates grün, wird **immer** gepusht, auch bei vielen Fehlern; betroffene Anbieter behalten ihren alten Stand (Nutzerabnahme, Review M5).
- **Rot** (Workflow schlägt fehl, GitHub mailt): Gates rot (dann kein Push), Konflikt beim Push, mehr als 20 % der Anbieter `fehler`, `abort` (Auth oder Limit), Bremse erreicht (E8), oder die Live-Seite liegt mehr als einen Tag hinter `main`.
- `data/kosten.csv` bekommt jede Nacht eine Zeile. Damit gibt es auch ohne Datenänderung einen Commit, und GitHub deaktiviert den Cron nicht nach 60 Tagen.
- CI bleibt das einzige Gate vor dem Deploy. Ist sie rot, bleibt die alte Version live.

### E7 – Entdecken `discover.yml`

`pnpm pipeline discover [--region <id>] [--bootstrap] [--dry-run]` geht die Regionen aus `REGION_IDS` im Code nacheinander durch (keine Matrix). Workflow wie E6 (`permissions` zusätzlich `issues: write`, `timeout-minutes: 120`).

1. **Kandidaten sammeln (Code):**
   - Sammelkalender: Kandidaten, deren Veranstalter keinem Katalog-Anbieter zugeordnet ist (`lib/match.ts`).
   - Verzeichnisse (`role: verzeichnis`): Einträge ohne Treffer im Katalog.
2. **Websuche (Modell, `tools: web`):** je Suchbegriff aus einer festen Liste in `lib/discover-terms.ts` (Krabbelgruppe, PEKiP, Babyschwimmen, Babymassage, Eltern-Kind-Turnen, Musikgarten, Familienzentrum, Familienbildungsstätte, Hebammenpraxis Kurse, Eltern-Kind-Gruppe Pfarrei) plus Regionsname ein Aufruf. Ausgabe nach Schema: Liste `{name, url, warum}`.
3. **Vorfilter (Code):** verwerfen, wenn die normalisierte URL schon im Katalog steht, wenn Host **und** ähnlicher Name (`lib/similar.ts`) zu einem bekannten Anbieter passen, oder wenn URL bzw. Host in `abgelehnt` (`data/discover/<region>.json`) steht. Eine übersehene Dublette ist billig (Revert), ein verschluckter Anbieter nicht.
4. **Bewerten (Modell, `tools: none`):** Den Seitentext holt unser Abruf (E3). Ausgabe nach Schema: verwerfen mit Grund, oder ein Katalogeintrag (`Provider` aus `schema.ts`, Orte als Adresse, mindestens eine Programmseite `use: termine`).
5. **Geocodieren (Code)** über `io/geocode.ts` (Nominatim, höchstens 1 Anfrage/s; 403 → Kandidat zurückstellen). Jeder Ort muss in der bbox der Region liegen.
6. **Ertragsbeweis (Code):** `refreshProvider` nur für diesen Eintrag. Aufgenommen wird nur, wenn **≥ 1 gültiges Angebot** mit Alter 0–3 und künftigem Termin entsteht **und** `isRelevant()` (`lib/relevance.ts`) auf dem abgerufenen Text anschlägt. Sonst: Kandidat mit Grund und Datum in `data/discover/<region>.json`, Wiedervorlage nach 8 Wochen.
7. **IDs und Felder vergibt der Code:** Katalog-ID (kebab aus dem Namen, bei Kollision mit Suffix), Orts-IDs, `publicId` (`shortId`, ADR 0022), `region`, `verified` = heute.
8. **Gates (Code), alle Pflicht:**
   - G1 `pnpm data:validate` und `pnpm check:fast` grün. Ein kaputter Katalog auf `main` würde jeden Nachtlauf blockieren.
   - G2 Nur neue Anbieter: Der Diff-Prüfer (`lib/catalog-diff.ts`) lässt nur neue Einträge in `providers.yaml` zu; jede Änderung an bestehenden Einträgen bricht den Lauf ab.
   - G3 Höchstens 10 neue Anbieter je Lauf und Region; mit `--bootstrap` gelten die Grenzen aus den `workflow_dispatch`-Eingaben.
   - G4 Ein Commit je Anbieter: `data: neuer Anbieter <id> (<region>)` mit Fund-URL, Grund und erstem Angebot im Commit-Text.
9. Push wie E6, `gh workflow run ci.yml`, Bericht.
10. **Sichtbarkeit:** Ist mindestens ein Anbieter neu, legt der Lauf genau ein Issue an („Neue Anbieter <datum>“, Liste mit Commit-Links und Fund-URLs). GitHub schickt dazu eine Mail.

**Hinweise im Bericht ohne Aktion:** neue Programmseiten bekannter Anbieter (aus Sammelkalendern) und Anbieter mit `failingSince` älter als 14 Tage.

**Rücknahme:** Ein falsch aufgenommener Anbieter wird per `git revert` des Commits zurückgenommen und von Hand (oder per Skill) in `abgelehnt` eingetragen, sonst findet ihn die nächste Woche wieder (Nutzerabnahme).

**`--dry-run`:** alle Schritte echt, aber kein Commit, kein Issue. Der Bericht nennt „würde aufnehmen“ mit Fund-URL und erstem Angebot sowie „verworfen“ mit Grund. Stufe 4 läuft zwei Wochen so, bevor der Nutzer den Commit-Modus freigibt.

Der Agent hat keine Schreib- oder Shell-Werkzeuge; alles, was er liefert, sind Daten, die Code prüft.

### E8 – Kosten und Grenzen

- **Je Aufruf** eine Zeile in `runs/<datum>/kosten.jsonl`: Lauf, Schritt (`extract`, `fallback`, `search`, `assess`), Anbieter bzw. Kandidat, Modell, Tokens (Eingabe, Ausgabe, Cache lesen/schreiben), Schritte, Dauer, `costUsd`, Ergebnis.
- `costUsd` ist die Schätzung der CLI zum API-Gegenwert, nicht der Abo-Preis; Bericht und CSV beschriften es so. Ob Websuche darin enthalten ist, klärt S1.1.
- **Je Lauf** im `$GITHUB_STEP_SUMMARY` und im Bericht: Summen je Schritt und Modell, Schätzung je aufgenommenem bzw. je extrahiertem Anbieter, `abort`-Fälle, durch den Cache gesparte Aufrufe.
- **Zeitreihe** `data/kosten.csv` (Datum in Europe/Berlin): `datum,lauf,region,aufrufe,tokens_ein,tokens_aus,usd_schaetzung,abbruch,neue_anbieter,geaenderte_anbieter`. Scheitert der Push, steht die Zeile nur im Artefakt; das ist hinnehmbar.
- **Bremsen** je Lauf: `MAX_CALLS` (Nacht 150, Entdecken 120) und `MAX_TOKENS` (Nacht 3 Mio., Entdecken 5 Mio.), beim Bootstrap per `workflow_dispatch`-Eingabe. Erreicht → geordnetes Ende, Fertiges wird gesichert, Lauf rot.

### E9 – Evals

- `evals/cases/<anbieter>-<datum>/`: `input.json` (eingefrorene Eingabe wie in E4, aus `runs/` übernommen) und `expected.json`. 12 Fälle zum Start, ausgewählt nach Art (html, browser, ical, pdf, json-api, Sammelkalender-Kandidaten, groß > 100 000 Zeichen, keine Termine), darunter **mindestens drei Fallen**: nur Angebote ab 3 Jahren, Kurse für Eltern ohne Kind, nur vergangene Termine.
- `expected.json` entsteht aus dem aktuellen Bestand und wird von Hand geprüft (Nutzer sieht 5 Stichproben).
- `pnpm eval [--model …]` ruft dieselbe Funktion wie der Nachtlauf (`extractProvider`) und bewertet deterministisch (`lib/eval-score.ts`) **nach** dem Expandieren mit derselben Build-Funktion und denselben freien Tagen: Termine über Ort und Beginnzeit 1:1 zuordnen; Recall und Präzision; Feldtreffer für `format`, `availability.status`, `cost`, `registration`, `topics`; Validierungsrate; Kosten und Dauer.
- Ergebnis als Zeile in `evals/results.md` (Datum, Modell, Hash von Prompt und Schema, Kennzahlen). Kein Gate: Das Eval läuft bei Modell- oder Prompt-Wechsel; CI warnt, wenn für den aktuellen Prompt-Hash keine Zeile existiert. Das frühere Eval-Gate (ADR 0016) ersetzen Validierung, Einbruchschutz und der Vergleich gegen den deployten Stand (E14).
- **Entdecken-Eval** (Stufe 6): 10 bekannte Anbieter werden für einen Trockenlauf ausgeblendet; gemessen wird, wie viele `discover` wiederfindet und wie viele falsche es aufnehmen würde.
- Eingefrorene Eingaben liegen im öffentlichen Repo (wie Plan 0015, E9 entschieden).

### E10 – Bericht

`pnpm pipeline status` und `$GITHUB_STEP_SUMMARY`: Ampel, Angebote und Termine gegen den Vorstand, jede Quelle mit `fehler` samt Grund und `failingSince`, zurückgehaltene Einbrüche (`pending`), neue Anbieter mit Fund-URL, Kandidaten ohne Ertrag, Hinweise ohne Aktion (E7), Kosten (E8), Live-Stand gegen `main`.

### E11 – Skill und Katalogpflege

Der Skill `babyevents-nuernberg` wird ein Wartungsleitfaden: Bericht und Issue sichten, falsche Anbieter zurücknehmen und in `abgelehnt` eintragen, Hinweise ohne Aktion von Hand umsetzen, Eval-Fälle anlegen, Modell wechseln, Region starten. Er ruft dieselben Befehle (`pipeline nightly --only`, `discover --dry-run`, `eval`). `init`, `select`, Pakete und Subagenten-Rohdaten entfallen.

### E12 – Was aus Plan 0015 bleibt und was entfällt

- **Bleibt:** Abruf nach Katalog (E4 mit Nachtrag B), `data/raw` je Anbieter, Hash-Cache, Einbruchschutz, Build-Probelauf je Anbieter, URL-Plausibilität, 12-Monats-Horizont, Statusbericht, `failingSince`, Nachtrag A (stabile IDs).
- **Entfällt:** OpenAI-kompatibler Client mit SSE und eigenem Retry, `EXTRACTOR_VERSION` als Gate, Schattenbetrieb in `actions/cache`, Zustand `ausstehend`, Exit-Codes 0/1/2, `NIGHTLY_PUBLISH`, Migration von Rohdaten, Rückfall auf einen veralteten Ferien-Cache (ein Ausfall kostet eine Nacht), Bericht über fremde Hosts.

### E13 – Regionen und Ablage

- `discover` iteriert `REGION_IDS` (`src/domain/regions.ts`). Suchbegriffe sind regionsneutral, die Region geht als Name in die Suche. Ferien je Bundesland, ÖPNV und Sammelkalender-Adapter einer neuen Region sind deren eigener Plan.
- **Module:** reine Logik in `scripts/pipeline/lib/` (`refresh.ts`, `normalize.ts`, `catalog-diff.ts`, `eval-score.ts`, `discover.ts`, `cost.ts`); alles mit Prozess, Netz, Dateien oder git in `scripts/pipeline/io/` (`llm.ts`, `publish`, Orchestrierung von `nightly` und `discover`). `refreshProvider` liegt in `io/refresh.ts` und ruft die reine Regel aus `lib/refresh.ts`.
- `biome.json` nimmt `data/raw` und `data/discover` aus (wie `data/oepnv/fahrplan.json`); `pnpm data:validate` prüft beide per Zod.

### E14 – ADR 0026, Abweichungen von bestehenden Festlegungen

ADR 0026 ersetzt ADR 0016 und nennt je einen Satz zu:
- **ADR 0002:** Die Pipeline läuft in Actions über das Abo, nicht lokal; der Push startet CI per `workflow_dispatch`.
- **ADR 0003:** Datenhorizont 12 Monate statt 4.
- **ADR 0004:** Das Eval-Gate aus ADR 0016 entfällt; Backpressure leisten Validierung je Anbieter, Einbruchschutz, Gates vor dem Push und der Vergleich gegen den deployten Stand.
- **ADR 0006:** Keine Subagenten-Pakete; Agenten pflegen den Katalog nur über `discover` (neue Anbieter) und von Hand über den Skill.
- **ADR 0011 Nr. 4:** `pipeline oepnv` läuft auch im Nachtlauf (Feed-Cache in `actions/cache`).
- **`docs/architecture.md`:** `data/raw` und `data/discover` sind dauerhafter Zustand, kein Vertrag der Website; `scripts/validate-data.ts` darf aus `scripts/pipeline/lib` importieren; `pipeline publish` läuft aus dem Workflow.

## Stufen

Jede Stufe endet mit grünem `pnpm verify` und grüner CI auf `main`.

**Stufe 0 – Stabile IDs:** Plan 0015, Nachtrag A wie dort beschrieben (Schritte, Tests, Migration). Voraussetzung für alles mit Modell, weil sonst jede Umformulierung Links und Merklisten bricht.

**Stufe 1 – Spike und Messung (ohne Commit von Daten):**
- S1.1 `claude -p` in Actions: Workflow `spike-cli.yml` (manuell), drei Aufrufe mit Haiku (Extraktion ohne Werkzeuge, Bewerten ohne Werkzeuge, Websuche). Festhalten im Plan: Aufrufzeile nach E2 funktioniert (oder `--restricted`); Felder für Usage und `costUsd`; Erkennung von Auth-Fehler, Limit und Abschneiden; Dauer; Verbrauch gemessen am Nutzungsfenster.
  **Gate (Nutzer):** Die Doku-Zitate zur Abo-Nutzung (R1) liegen vor; der Nutzer entscheidet bewusst, ob der Betrieb über das Abo läuft.
- S1.2 `pnpm pipeline fetch [--only]` (E3) und `nightly.yml` nur mit Abruf und Hashes, 7 Nächte, Ergebnis als Artefakt. Gemessen: Anteil geänderter Anbieter je Nacht, Hash-Rauschen, Abruffehler je Art.

**Stufe 2 – Extraktion lokal:** `io/llm.ts` (E2), Prompt, `extractProvider`, `refreshProvider` mit den Regeln aus E5, `ProviderRaw`, `build` aus `data/raw`. Dazu die 12 Eval-Fälle und `pnpm eval`. Ergebnis: Eval mit Haiku und Sonnet in `evals/results.md`; Modellwahl durch den Nutzer.

**Stufe 3 – Nachtlauf live:**
- S3.1 Kostenbericht (E8) und `data/kosten.csv`.
- S3.2 **Trockenlauf**: erster voller Lauf per `workflow_dispatch` ohne Push. Bericht an den Nutzer (Angebote gegen heute, geänderte Anbieter, Fehler, Tokens); er gibt den Push frei.
- S3.3 Größe `site.json` mit 12 Monaten gegen das Budget (über Budget → Nutzerentscheid, Schwelle nicht still senken).
- S3.4 `nightly.yml` mit Push und CI-Dispatch.

**Stufe 4 – Entdecken:** E7 vollständig, Gates G1–G4, `discover.yml` wöchentlich. Zwei Wochen `--dry-run` mit Bericht an den Nutzer, dann Commit-Modus nach seiner Freigabe.

**Stufe 5 – Abschluss:** Entdecken-Eval, Skill (E11), ADR 0026 angenommen, ADR 0016 auf „ersetzt“, Plan 0015 nach `docs/plans/archiv/` mit `ersetzt durch Plan 0032`, `docs/architecture.md` und `CLAUDE.md` nachgezogen.

### Was der Nutzer tun muss

- Secret `CLAUDE_CODE_OAUTH_TOKEN` anlegen (Stufe 1).
- S1.1 entscheiden (Abo-Nutzung), nach Stufe 2 das Modell wählen, S3.2 und den Trockenlauf in Stufe 4 abnehmen.
- Falsch aufgenommene Anbieter zurücknehmen und in `abgelehnt` eintragen (bei Bedarf, über den Skill).

## Tests

Test-first für alles in `lib/`:

- `refresh.test.ts`: jede Zeile der Tabelle in E5, `pending` über zwei Läufe (gleicher und anderer Hash), Einbruch im ersten Lauf gegen `offers.json`, vorzeitiges Ende.
- `build-offers.test.ts` (Ergänzung): Anbieter ohne Raw-Datei behält seine Angebote aus dem Vorstand.
- `llm.test.ts`: Fake-Binary; genaue Argumentliste, Arbeitsverzeichnis außerhalb des Checkouts, Umgebung nur mit den vier Variablen; `abort` bei Auth-Fehler und Limit; `truncated`.
- `normalize.test.ts`: gleicher Inhalt mit anderem Zeitstempel ergibt gleichen Hash.
- `catalog-diff.test.ts`: G2 lehnt jede Änderung bestehender Einträge ab und erlaubt nur neue.
- `discover.test.ts`: Vorfilter (URL, Host + Name, `abgelehnt`), Ertragsbeweis mit Fake-Extraktion und `isRelevant`, G3, Vergabe der IDs, `--dry-run` ohne Schreiben; Commits je Anbieter im `io/`-Test mit `tempRepo()`.
- `cost.test.ts`: Zeilen, Summen, Bremsen.
- `eval-score.test.ts`: Zuordnung nach Expansion, Recall, Präzision, Feldtreffer.
- E2E: keine neuen Specs; Daten-Änderungen laufen über die bestehenden Smoke-Specs.

## Risiken

| | Risiko | Gegenmaßnahme |
|---|---|---|
| R1 | **Abo-Nutzung in Actions.** Laut Doku ist OAuth-Anmeldung für „ordinary use“ gedacht, die Limits „assume ordinary, individual usage“, und Anthropic kann „without prior notice“ durchsetzen; dagegen wird `claude setup-token` ausdrücklich für CI und Skripte angeboten. Eine Sperre träfe auch die interaktive Arbeit des Nutzers. | S1.1 misst den Verbrauch, Nutzer entscheidet mit den Zitaten. Notausweg ohne Code: dieselbe CLI mit `ANTHROPIC_API_KEY` (braucht ein API-Konto, Abweichung von N-B, Nutzerentscheid). |
| R2 | Haiku extrahiert schlechter als gedacht | Eval in Stufe 2, Fallback auf Sonnet je Anbieter |
| R3 | Prompt-Injection aus Webseiten oder Suchergebnissen | leeres Arbeitsverzeichnis, kein Token im Checkout, Werkzeuge per `--tools`, Bewerten ohne Werkzeuge, Schema, URL-Plausibilität, Ertragsbeweis, G2 |
| R4 | Entdecken nimmt einen falschen Anbieter auf (Zielgruppe, Vermittler) | Ertragsbeweis mit Alter 0–3 und `isRelevant`, G3, Commit je Anbieter, Issue mit Mail, `abgelehnt` |
| R5 | Hash-Rauschen macht den Cache wirkungslos | S1.2 misst, Normalisierung nachschärfen |
| R6 | 12 Monate sprengen das Budget von `site.json` | S3.3 |
| R7 | CLI-Version ändert Ausgabeformat oder Optionen | Version gepinnt, Update nur mit Eval-Lauf und `llm.test.ts` |
| R8 | Nutzungslimit beendet Läufe regelmäßig vorzeitig | Bestand bleibt (E5), Bericht und Rot; Bremsen und Takt anpassen |

## Nutzerentscheide

- **N3** (entschieden mit der Freigabe am 2026-10-10: Empfehlung gilt) Modell im Cache-Schlüssel (E4): Ein Modellwechsel extrahiert einmal alles neu. Für Nutzer ändern sich dann Formulierungen (Titel, Zusammenfassungen, Themen), IDs, Links und Merklisten bleiben (ADR 0022), der Einbruchschutz hält die Zahl der Angebote. Alternative: Modell nicht im Schlüssel, der Bestand wechselt schleichend über Wochen. **Empfehlung: im Schlüssel lassen** (eine gewollte Umstellung nach bestandenem Eval statt eines Mischzustands).

## Review (2026-10-10)

**Adversariales Review** (Subagent `plan-reviewer`), Verdict: Überarbeiten. 3 Blocker, 10 Major, Minor gesammelt. **Architekten-Urteil** (Subagent): absegnen mit Änderungen, keine andere Architektur; etwa die Hälfte der Kritik schmaler gelöst oder zurückgewiesen, um Plan 0015 nicht durch die Hintertür zurückzuholen. Der Nutzer hat die wesentlichen Änderungen am 2026-10-10 abgenommen („Ansonsten nehme ich alle Vorschläge an“), N3 offen.

| Befund | Urteil | Eingearbeitet in |
|---|---|---|
| B1 CLI lädt Hooks und CLAUDE.md, `--allowedTools` sperrt nicht, Token in `.git/config` | abgewandelt: leeres cwd und `HOME` statt langer Flag-Liste | E2, E6 (`persist-credentials: false`), R3 |
| B2 Anbieter ohne Raw-Datei verlieren Angebote | angenommen; Übernahme aus `offers.json` statt Rohdaten aus `runs/` (gitignored, Altformat) | E5 (erste Zeile, Migration entfällt) |
| B3 Einbruchschutz widerspricht dem Cache | angenommen: `pending` mit Hash; „alt“ im ersten Lauf aus `offers.json` | E5 |
| M1 Dubletten-Regel | abgewandelt: nur URL oder Host + Name; 50 m und Domain-Regel gestrichen | E7.3 |
| M2 Ertragsbeweis prüft sich selbst | abgewandelt: `isRelevant` zusätzlich, keine Host-Liste | E7.6 |
| M3 G2 widersprüchlich | angenommen: nur neue Anbieter (Nutzerabnahme) | E7, G2, Nicht-Ziele |
| M4 Revert-Schleife, Sichtbarkeit | angenommen: `abgelehnt`, ein Issue je Lauf (Nutzerabnahme) | E7.3, E7.10 |
| M5 kein Push bei > 20 % Fehlern | angenommen: immer pushen, rot melden (Nutzerabnahme) | E6 |
| M6 Auth-Fehler, Abschneiden | angenommen | E2 |
| M7 Abo-Risiko | angenommen: Zitate und Gate in S1.1, Notausweg API-Schlüssel (Nutzerabnahme) | R1, S1.1 |
| M8 Evals | abgewandelt: Fallen, Verfahren für `expected.json`, Expansion; kein `--repeat`, Entdecken-Eval bleibt spät (Trockenlauf deckt ab) | E9 |
| M9 ADR-Abweichungen | angenommen | E14 |
| M10 Nebenläufigkeit | abgewandelt: keine Matrix, `pull --rebase`, Bremsen beim Bootstrap per Eingabe | E6, E7, E8 |
| Minor | angenommen: Cache-Schlüssel mit Schema und Modell, git nur in `io/`, `publish --against-deployed`, `permissions`, `failingSince`, Biome-Ausnahme, IDs durch Code, `costUsd` als Schätzung, Datum Berlin, `offers.json` nur im Nachtlauf; Scope gekürzt (Sitemaps, Reparaturliste, `pipeline kosten`). Zurückgewiesen: Ferien-Cache-Rückfall, fremde Hosts, Konfliktregel in `CLAUDE.md`, 320 px/Querformat, Geocode-Cache | E4, E5, E6, E7, E8, E12, E13 |
| Architekt, eigene Befunde | `--json-schema` gibt es (kein eigenes JSON-Parsen); Bewerten ohne Werkzeuge; keine Debug-Ausgaben in öffentliche Logs; `--system-prompt-file` Pflicht; Erstbestand über 2–3 Nächte; G1 mit `check:fast` | E2, E5, E7 |

Kein Blocker mehr offen.
