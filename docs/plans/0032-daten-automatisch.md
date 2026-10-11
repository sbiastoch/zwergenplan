# Plan 0032 – Daten automatisch: Nachtlauf und Entdecken über das Abo

Status: in Umsetzung (Stufe 0 live seit 37a1ace, 2026-10-10; Stufe 1 umgesetzt 2026-10-11, S1.1 in Actions bestätigt, S1.2 maß eine Nacht (dann Live-Freigabe); Stufe 2 und 3 umgesetzt, Nachtlauf live freigegeben 2026-10-11; Stufe 4 als Code im Modus trocken (Branch `plan-0032-s4b`, „Stufe 4 – Umsetzung“); Stufe 5 umgesetzt 2026-10-11 (Branch `plan-0032-s5`, „Stufe 5 – Umsetzung“); offen: zwei Wochen Trockenlauf des Entdeckens und Freigabe `live`, danach Archivierung; Ergebnisse unter „Stufe 1 – Ergebnisse“). Freigegeben 2026-10-10 vom Nutzer; N3 mit der Empfehlung entschieden.
Datum: 2026-10-10
Ersetzt: Plan 0015 (Hauptteil und Nachtrag B). Plan 0015, Nachtrag A (stabile IDs, ADR-Entwurf 0022) wird unverändert übernommen und ist Stufe 0 dieses Plans; seine offenen Entscheide N-I3 und N-I4 gelten weiter.
Bezug: ADR 0002 (Hosting, Datenfluss), ADR 0003 (Datenmodell), ADR 0004 (Backpressure), ADR 0006 (Recherche-Pipeline), ADR 0011 (Fahrplan), ADR 0016 (Entwurf, ersetzt durch ADR 0026), ADR 0022 (stabile IDs), ADR 0024 und 0025 (Katalog); neu: ADR 0026 (`docs/adr/0026-daten-automatisch.md`, Inhalt nach E14; vorgeschlagen 2026-10-11, angenommen 2026-10-11 mit Stufe 5)

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
- **N-H** (2026-10-11) Das Abo-Token ist nur der einfache Einstieg in die Entwicklung. Später wird auf API-Nutzung umgestellt, ggf. über Anthropic oder andere Anbieter. Keine rechtliche Abwägung im Plan; der Wechsel geschieht allein in `io/llm.ts`.

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

### E4 – Extraktion: ein Aufruf je Anbieter (große in Teilen, siehe „Stufe 2 – Aufteilen großer Anbieter“), nur bei geändertem Hash

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
- **Entdecken-Eval** (Stufe 5): 10 bekannte Anbieter werden für einen Trockenlauf ausgeblendet; gemessen wird, wie viele `discover` wiederfindet und wie viele falsche es aufnehmen würde.
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
- **ADR 0011 Nr. 4:** ~~`pipeline oepnv` läuft auch im Nachtlauf (Feed-Cache in `actions/cache`).~~ Entfällt (Stufe 3 – Umsetzung): ADR 0026 lässt ADR 0011 Nr. 4 unverändert.
- **`docs/architecture.md`:** `data/raw` und `data/discover` sind dauerhafter Zustand, kein Vertrag der Website; `scripts/validate-data.ts` darf aus `scripts/pipeline/lib` importieren; `pipeline publish` läuft aus dem Workflow.

## Stufen

Jede Stufe endet mit grünem `pnpm verify` und grüner CI auf `main`.

**Stufe 0 – Stabile IDs:** Plan 0015, Nachtrag A wie dort beschrieben (Schritte, Tests, Migration). Voraussetzung für alles mit Modell, weil sonst jede Umformulierung Links und Merklisten bricht.

**Stufe 1 – Spike und Messung (ohne Commit von Daten):**
- S1.1 `claude -p` in Actions: Workflow `spike-cli.yml` (manuell), drei Aufrufe mit Haiku (Extraktion ohne Werkzeuge, Bewerten ohne Werkzeuge, Websuche). Festhalten im Plan: Aufrufzeile nach E2 funktioniert (oder `--restricted`); Felder für Usage und `costUsd`; Erkennung von Auth-Fehler, Limit und Abschneiden; Dauer; Verbrauch gemessen am Nutzungsfenster.
  **Gate (Nutzer):** entschieden mit N-H (Abo für den Start, später API).
- S1.2 `pnpm pipeline fetch [--only]` (E3) und `nightly.yml` nur mit Abruf und Hashes, 7 Nächte, Ergebnis als Artefakt. Gemessen: Anteil geänderter Anbieter je Nacht, Hash-Rauschen, Abruffehler je Art.

### Stufe 1 – Ergebnisse (2026-10-11)

**S1.1 Spike** (`.github/workflows/spike-cli.yml`, `.github/spike/`, CLI 2.1.296, live seit e07b6b4). Lokal mit Haiku verifiziert; in Actions mit neu gesetztem Secret bestätigt (Lauf 38123724260): Extraktion und Bewerten schema-gültig in 7,5 s bzw. 3,6 s ($0,0011 bzw. $0,0005), Websuche 30 s mit 3 Suchen und 7 Schritten ($0,042, `webSearchRequests` in `modelUsage`), ungültiges Token → `abort: "auth"` (401), Abschneiden → `truncated` (hier `api_error_status: null`, Erkennung also nur über den Meldungstext). Das Nutzungsfenster blieb vor und nach dem Lauf bei 3 % (5 Stunden) bzw. 48 % (Woche); der Verbrauch ist erst über einen vollen Nachtlauf messbar (S3.2). Verbindliche Korrekturen an E2 für Stufe 2:

- `--json-schema` nimmt den Schema-**Text**, keinen Pfad (`llm.ts` liest die Datei und übergibt den Inhalt).
- Websuche braucht `--tools "WebSearch,WebFetch"` **und** `--allowedTools "WebSearch,WebFetch"`; ohne Letzteres lehnt `dontAsk` jede Suche ab und meldet trotzdem `success` (`permission_denials` prüfen).
- `--restricted` ersetzt die Liste nicht (lässt Datei- und MCP-Werkzeuge an); höchstens zusätzliche Härtung, nicht nötig bei leerem cwd/`HOME` und `--tools`.
- Tokens und Kosten aus `modelUsage[model]` (`inputTokens`, `outputTokens`, `cache*`, `webSearchRequests`, `costUSD`), nicht aus `usage` (nur Hauptschleife). `total_cost_usd` enthält vermutlich die Websuche (CI-Lauf prüft gegen).
- `--max-turns` zählt den Abschluss über `StructuredOutput` mit (`num_turns` = 2 ohne Werkzeuge): mindestens 3, mit Websuche 8.
- Erkennung in `--output-format json`: Erfolg = `is_error: false` und `structured_output` vorhanden. `abort: "auth"` bei `api_error_status` 401/403; `abort: "limit"` bei 429 (Limit lokal nicht provozierbar, sicher nur in `stream-json` über `rate_limit_event`); `truncated` bei `result` „exceeded the N output token maximum“ (`CLAUDE_CODE_MAX_OUTPUT_TOKENS` greift). `subtype` ist bei API-Fehlern trotzdem `success`.
- Nutzungsfenster (`five_hour`/`seven_day` `utilization`, 1-%-Schritte) gibt es nur in `stream-json`, das im Druckmodus `--verbose` verlangt. `--verbose` ist erlaubt, wenn stdout in eine Datei geht (stderr bleibt leer); E2 „Logs“ gilt für das Job-Log.
- Kosten lokal (Schätzung der CLI, Listenpreis): Extraktion eines kleinen Kurstexts $0,0013, Bewerten $0,0008, Websuche mit 2–3 Suchen $0,026–0,038.

**S1.2 Abruf** (`pnpm pipeline fetch`, `nightly.yml` nur Messung). Lokal: 74 Anbieter, 166 Seiten, 3 Adapter, 52–75 s, 1,80 Mio. Zeichen (größter: fbs-nuernberg 309 599, unter der Obergrenze 350 000). Ergebnis 67 ok, 5 leer (nur Kandidaten, keine), 2 fehler: `hebammenpraxis-gugelrund` HTTP 404, `sternenhaus-kuf` (eventim) Bot-Schutz. Fehler je Art: html 1/131, browser 1/17, ical/json-api/pdf/adapter 0. Abweichungen und Ergänzungen:

- Der Browser-Kontext nutzt denselben Chrome-UA wie `io/http.ts`; ohne ihn sperrt Cloudflare die eversports-Seiten (9 von 17 Abrufen).
- Cloudflare-Sperrseiten sind `fehler` („Bot-Schutz“), nicht Eingabe. Der Browser wartet, bis die Textlänge stabil ist (höchstens 15 s).
- Gespeichert wird der Text nur leerraumnormalisiert (`<id>.txt`, spätere Modelleingabe); die stärkere Normalisierung gilt nur für den Hash.
- `--only` ruft trotzdem alle Adapter ab (vergleichbare Hashes); `selectBatches` lässt `skipCrawl` jetzt auch ohne `--only` aus (ADR 0025, Punkt 7).
- Hash-Rauschen zwischen Läufen im Minutenabstand: 1–4 von 72 Anbietern. Ursache vor allem fbs-nuernberg und schwimmschule-baer-ritterbad, die ihre Kurse bei jedem Laden umsortieren. Zusätzlich gemessen wird deshalb `orderFreeHash` (Zeilen ohne Reihenfolge): 0–2 von 72. **Offen nach den 7 Nächten (Nutzerentscheid vor Stufe 2):** wird der reihenfolgefreie Hash Cache-Schlüssel? Dafür: der größte Anbieter wird sonst jede Nacht neu extrahiert. Dagegen: ein reiner Tausch von Platzständen zwischen zwei Kursen bliebe unsichtbar.
- iCal-Feeds ändern sich täglich, weil vergangene Termine herausfallen (echte, aber informationsarme Änderung); die Messung zeigt, wie stark das ins Gewicht fällt.
- Katalogpflege (Skill, nicht hier): `hebammenpraxis-gugelrund` 404; `sternenhaus-kuf` Kandidat für `blocked`; `hebamme-eva-kauper-wunderwerk` (mymiya) liefert nur 69 Zeichen, ungeprüft.
- `io/fetch-inputs.ts` wiederholt die Adapter-Schleife aus `candidates fetch`; sie entfällt mit E11.

### Stufe 2 – Ergebnisse (laufend, 2026-10-11)

Umgesetzt: `io/llm.ts`, Prompt `scripts/pipeline/prompt/extract.md` (ersetzt `references/extraction.md`; der Paket-Ablauf der alten Subagenten steht bis E11 in `references/paket.md`), `lib/extract.ts`/`io/extract.ts` (`createExtractor`), `ProviderRaw`, `lib/refresh.ts` (E5), `io/refresh.ts`, `io/nightly.ts`, `build` aus `data/raw`, `pipeline extract` und `pipeline nightly [--only] [--dry-run]`. Abweichungen und Präzisierungen:

- **E2:** Das Antwortschema geht ohne `$schema` an die CLI (2.1.296 bricht sonst ab). `MAX_TURNS` 3: Bei abgeschnittener Ausgabe setzt die CLI selbst fort, jede Fortsetzung kostet die ganze Eingabe. Lokal ohne Token und ohne API-Schlüssel bleibt `HOME` das echte (Login); in Actions nie. `ANTHROPIC_API_KEY` wird durchgereicht, falls gesetzt (N-H). „Not logged in“ zählt als `auth`; ein Kontextlimit ist `fehler` des Anbieters, kein Abbruch.
- **E4:** Die Wiederholung bekommt Meldungen und vorige Antwort; ein technischer Fehler ohne Antwort geht direkt zum Fallback. `via` setzt der Code, wenn `sourceUrl` die `detailUrl` eines Kandidaten ist. Kandidaten kommen immer aus dem Abruf, nie aus dem Text zurückgelesen.
- **E5:** `inputHash`, `model`, `changedAt` sind in `ProviderRaw` nur gemeinsam gesetzt; fehlen sie, wurde der Anbieter nie erfolgreich extrahiert, und `build` nimmt den Vorstand. `pending` trägt das Modell. „Alt“ zählt wie `offers.json` (Einzeltermine je Datum). Ein neuer Schlüssel wird nur mit erfolgreicher Extraktion gespeichert; bei Fehler oder Einbruch bleibt `checkedAt`. Ausfall eines Sammelkalenders zählt je Anbieter nur für Quellen, die zu ihm beitragen (eigener Adapter, Quellen der Vornacht und dieses Laufs; ohne bekannte Quelle jeder Adapter). Ein extrahierter Anbieter mit `fehler` bekommt nichts zusätzlich aus dem Vorstand (keine Dubletten). Leere Eingabe ist `leer` ohne Modellaufruf. `nightly` löscht Raw-Dateien von Anbietern, die nicht mehr im Katalog stehen.
- **E6 (für Stufe 3):** Die Ampel „mehr als 20 % fehler“ rechnet aus den Ergebnissen des Laufs, nicht aus `status`; ein zurückgehaltener Einbruch im ersten Lauf hat `status: fehler`, ist aber kein Fehler des Laufs.
- **Schalter reihenfolgefreier Schlüssel:** `ORDER_FREE_KEY` in `lib/normalize.ts`, Standard `false`, bis zum Entscheid nach der Messung (S1.2).
- **Probeläufe mit Haiku** (CLI-Schätzung): kleine bis mittlere Anbieter (3–74 k Zeichen) $0,003–0,017 und 5–91 s. 70–85 % der Ausgabe-Tokens sind Thinking (über die CLI nicht abschaltbar). fbs-nuernberg (309 k Zeichen) wurde abgeschnitten ($1,03, 8,6 Min.); große Eingaben werden deshalb in Teile zerlegt (siehe unten). Inhaltliche Schwächen für das Eval: Theaterreihen zusammengefasst, Termine nur aus Kandidaten übersehen, laufende Kurse ohne Terminzahl leer, Platzstand ohne Detailseiten meist `unbekannt`.

### Stufe 2 – Aufteilen großer Anbieter (2026-10-11)

Anlass: fbs-nuernberg (309 000 Zeichen, ~71 Angebote) wurde mit Haiku in einem Aufruf abgeschnitten (128 000 Ausgabe-Tokens über 4 Schritte, $1,03, 8,6 Min.). Die Ausgabe wächst mit der Zahl der Angebote (rund 2 000 Tokens je Angebot, 70–85 % Thinking, über die CLI nicht abschaltbar), nicht mit der Eingabe. Ergänzung zu E4:

- **Aufteilen** (`lib/split.ts`, `splitInput`): Eingaben über `PART_MAX_CHARS` = 25 000 Zeichen werden in Teile zerlegt, jeder Teil ist ein Aufruf nach dem bestehenden Ablauf (Wiederholung, Fallback). Geschnitten wird zwischen Seiten (kleine Seiten der Reihe nach zusammengepackt), in einer zu großen Seite vor `## TEXT`/`## ICAL`/`## JSON-LD`, in JSON nur zwischen Elementen einer Ebene (oberste zuerst), im Text nach der Zeile, die einen Eintrag abschließt (unter den Zeilen, die je Eintrag einmal vorkommen, die im ersten Eintrag letzte: fbs „Angebot drucken »“, Staatstheater „Tickets“; ist sie ein Feldname wie „Leitung:“, nach dessen Wert), erst zuletzt an Zeilengrenzen (dann ein Hinweis in `nightly.json`, ein Eintrag kann getrennt sein). Teile einer Seite beginnen mit deren Kopfzeile (`sourceUrl`). Grenzen sind nur die Kopfzeilen, die der Abruf kennt (`## Seite k: <k-te URL>`, `## Kandidaten (N)` mit der Zahl des Abrufs); gefälschte im Seitentext bleiben Text. `## Kandidaten (N)` kommt in den ersten Teil, in den er passt, sonst in einen eigenen.
- **Schnitte am echten Abruf geprüft** (2026-10-11, alle 18 Anbieter über 25 000 Zeichen): Teile enden an Seitenenden, JSON-Elementen (`},`), Kandidatenzeilen oder Eintragsenden (fbs „Angebot drucken »“, Staatstheater „Tickets“, Stadtbibliothek Fußzeile, martha-maria nach „Leitung:“ und Wert, Geburtshaus nach der Anmeldeadresse); kein Schnitt an Zeilengrenzen. Nicht abgedeckt: Kalenderseiten mit Tagesüberschriften über mehreren Einträgen (Folgeteil ohne Datum); bisher keine solche Seite über der Schwelle.
- **Vereinigen** (`mergeParts`): Ein Event aus einem späteren Teil entfällt, wenn ein früheres denselben Schlüssel hat (regelmäßig: dieselbe ID; sonst Titel, Ort, Termine) oder gleich gebaut ist (Ort, Format, Alter, Beginn und Ende des ersten Termins, Wochentage) und einen ähnlichen Titel hat (`similarTitle`) und seine Termine dort enthalten sind (regelmäßig: immer); sonst bekommt es den Titel des früheren, damit der Build die Termine vereinigt. Parallele Gruppen mit anderem Alter oder anderer Uhrzeit bleiben beide. Jeder Fall steht mit beiden Titeln in den Hinweisen (`nightly.json`). Danach prüft `checkExtraction` die Vereinigung gemeinsam; scheitert erst diese Prüfung, ist der Anbieter `fehler` ohne Wiederholung (kein Teil ist schuld), und weil ein Fehler keinen Schlüssel speichert, versucht es die nächste Nacht erneut (bei fbs 12 Min., $0,11). Der Kostenbericht (S3.1) muss solche Wiederholungen zeigen.
- Scheitert ein Teil, ist der Anbieter `fehler` (alter Stand bleibt, E5), die übrigen Teile laufen nicht mehr; `abort` und ein abgebrochener Lauf beenden sofort. Der Cache-Schlüssel bleibt je Anbieter. `CallRecord.part` nennt den Teil („2/15“), die Nachricht an das Modell eine Zeile „Teil k von n“ (der Prompt bleibt gleich).
- **Schwelle gemessen** (Haiku, fbs): mit 30 000 Zeichen 12 Teile, 9 000–25 500 Ausgabe-Tokens je Teil (80 % des Limits); mit 25 000 Zeichen 15 Teile, höchstens 23 400 (drei Läufe: 23 400, 21 300, 19 200). 25 000 lässt Luft, Abschneiden kostet den ganzen Anbieter.
- **Ergebnis fbs** (25 000, gegen `data/offers.json`, drei Läufe): 15 Aufrufe, alle im ersten Versuch gültig, 695–750 s, $0,10–0,14 (Schätzung der CLI), 181 000–195 000 Ausgabe-Tokens. Endstand (strenge Ähnlichkeitsregel): 92 Events, 38 Hinweise der Vereinigung, nach dem Build 85 Angebote (Bestand 71); 51 der 69 Startzeitpunkte des Bestands kommen wieder vor. Die übrigen sind laufende Kurse, die der Bestand ab dem ersten (vergangenen) Termin führt und die neue Antwort ab dem nächsten, dazu einzelne Termine einer Kursreihe als eigene Events („Abenteuerturnen 1 – Fr 04.12.“, Modellverhalten, nicht Aufteilen). Ohne Ähnlichkeitsregel waren es 124 Events und 114 Angebote; ohne Vereinigung gleicher IDs scheiterte die gemeinsame Prüfung (MilchZeit auf drei Seiten).
- zoff-harmonie (40 900 Zeichen, damals noch 30 000): 2 Teile, 101 s, $0,018, 13 Events gegen 12 Angebote im Bestand (eines doppelt mit anderen Anführungszeichen, im Build zusammengeführt).
- studio-herzschlag (74 400 Zeichen, 4 Teile, 74 s, $0,018): 2 Events gegen 43 im Bestand. Ursache ist nicht das Aufteilen: Die drei eversports-Widgets lieferten nur „Studio HERZSCHLAG“ (Abruf, Katalogpflege).
- Dazu aus dem Arch-Review von Teil A/B: Build-Probelauf je Anbieter in `checkExtraction` (Fehler zählen als ungültig, also Wiederholung; ohne `coveredBy`, das prüft `data:validate`), `warnings` aus `validateRaw` an `ExtractOutcome` und in `nightly.json`, Redirect-Ziele (`finalUrl`) und `ticketUrl` auch in `pipeline extract` (frisch: direkt aus dem Abruf; `--from`: `finalUrl` steht jetzt in `hashes.json`), Test von `createExtractor` mit der Fake-CLI.
- Offen: Die Teile laufen nacheinander (fbs 12,5 Min. im Budget von 50 Min. mit 3 Anbietern parallel); parallele Teile erst, wenn S3.2 zeigt, dass es eng wird.

### Stufe 2 – Nutzerentscheide (2026-10-11)

- **Modell:** Haiku mit Sonnet-Fallback (Plan-Standard). Grundlage: je zwei Eval-Läufe (`evals/results.md`); die Läufe streuen stark (Haiku Termine R/P 97/89 und 91/95 %, Sonnet 98/99 und 99/89 %), Sonnet trifft den Platzstand besser (96–100 % gegen 82 %), kostet aber das 4- bis 13-Fache.
- **Stichproben:** musikfuechse nur Nürnberg (Ort Pfarrscheune Fürth-Poppenreuth aus dem Katalog entfernt, damit Fürther Kurse an der Validierung scheitern); Babymassage-Kurse der FamilienBox bleiben bei der FamilienBox; bei Widersprüchen gelten konkrete Feed-Daten vor allgemeinen Seiten- oder Katalogtexten; nuebad-flipper bleibt ohne Erwartung, bis die Abfrage Folgetermine liefert.

**Stufe 2 – Extraktion lokal:** `io/llm.ts` (E2), Prompt, `extractProvider`, `refreshProvider` mit den Regeln aus E5, `ProviderRaw`, `build` aus `data/raw`. Dazu die 12 Eval-Fälle und `pnpm eval`. Ergebnis: Eval mit Haiku und Sonnet in `evals/results.md`; Modellwahl durch den Nutzer.

**Stufe 2 – Eval (E9), Stand 2026-10-11:** 12 Fälle in `evals/cases/` (10 echte aus `pnpm eval freeze`, 2 synthetische Fallen mit `synthetic: true`), `expected.json` aus dem Bestand vom 2026-10-04, von Hand gegen den Text geprüft (Korrekturen in `NOTES.md` je Fall), Fenster bis zum Horizont des Bestands (2027-02-04). Bewertung `lib/eval-score.ts`, Lauf `pnpm eval` (`scripts/pipeline/eval.ts`, `io/eval.ts`), Ergebnisse in `evals/results.md`. Abweichungen und Ergänzungen:

- `pnpm eval` misst das Modell allein (`--fallback` Standard = `--model`); `--fallback sonnet` misst die Konfiguration des Nachtlaufs.
- Statt `extractProvider` heißt die gemeinsame Funktion `createExtractor` (Teil A).
- `input.json` trägt statt des Katalogs einen Schnappschuss des Eintrags; Katalogpflege ändert Fälle nicht still. Eine Teilmenge (`--case`) schreibt keine Zeile in `results.md`.
- CI-Warnung: `pnpm data:validate` meldet `::warning::`, wenn für den Prompt-Hash keine Zeile existiert (kein Gate).
- Befund nuebad-flipper: Die GraphQL-Abfrage liefert je Kurs nur `startDateTime` des ersten Termins; Folgetermine stehen nicht in der Eingabe. Der Fall misst damit die Abfrage, nicht das Modell (Katalogpflege: Termine je Kurs mit abfragen). `expected.json` ist deshalb leer (nichts im Fenster belegbar); der Fall prüft bis zum Neueinfrieren nur, dass nichts erfunden wird.
- Streuung: Ein erster Lauf am selben Tag (vor der Korrektur von nuebad-flipper, Zeilen verworfen) zeigte bei sonnet in sv-johannis-07 8 erfundene Januartermine und in musikfuechse die Fürther Kurse, beides im zweiten Lauf nicht; haiku war in beiden Läufen gleich. Ein Lauf ist also eine Stichprobe; vor der Modellwahl lohnt ein zweiter Lauf je Modell.
- Arch-Review (2026-10-11), keine Blocker. Eingearbeitet: Test der echten Fälle statt Biome (M1), nuebad-flipper ohne unbelegbare Termine (M2), musikfuechse als Nutzerentscheid markiert (M2, Fürther Kurse), `pipeline-lib-pure` kennt `eval.ts`, `evals/**` ohne E2E, kein Eintrag in `results.md` ohne gültige Antwort, Casts entfernt. Restpunkte für Stufe 5: Fälle-Hash als Spalte in `results.md` (Hash deckt heute nur Prompt und Schema, nicht `extractMessage` und Fälle), gemeinsamer Ferien-Lader für Extraktor und Eval, schmales Modul für `EXTRACT_KEY_PARTS` (heute zieht `validate-data.ts` `io/llm.ts` mit), Test für `freezeCase`, ADR 0016 „Eval-Gate entfällt“ mit ADR 0026.

**Stufe 3 – Nachtlauf live:**
- S3.1 Kostenbericht (E8) und `data/kosten.csv`.
- S3.2 **Trockenlauf**: erster voller Lauf per `workflow_dispatch` ohne Push. Bericht an den Nutzer (Angebote gegen heute, geänderte Anbieter, Fehler, Tokens); er gibt den Push frei.
- S3.3 Größe `site.json` mit 12 Monaten gegen das Budget (über Budget → Nutzerentscheid, Schwelle nicht still senken).
- S3.4 `nightly.yml` mit Push und CI-Dispatch.

### Stufe 3 – Umsetzung (2026-10-11, Branch `plan-0032-s3`)

S3.1 und S3.4 als Code, ohne Daten-Push; S3.2 (Trockenlauf in Actions) und S3.3 (Größe `site.json`) stehen aus. Umgesetzt: `lib/cost.ts` (E8: `kosten.jsonl`, Summen, Bremsen, `kosten.csv`), `lib/report.ts` (Form von `nightly.json`, Ampel nach E6, Live-Stand, Bericht, Commit-Text), `io/live.ts`, `io/publish.ts`, `pnpm pipeline status`, `nightly.yml` mit Modus-Schalter. Abweichungen und Präzisierungen:

- **Modus-Schalter:** `nightly.yml` kennt `messen` (S1.2 unverändert), `trocken` (Lauf, Gates, Bericht, Artefakte, kein Push) und `live` (zusätzlich Publish und CI-Dispatch, nur auf `main`). Der Zeitplan nimmt die Repo-Variable `NACHTLAUF_MODUS` (leer = `messen`, die Messung bis 2026-10-18 läuft also weiter); von Hand `gh workflow run nightly.yml --ref <branch> -f modus=trocken` mit `max_calls`, `max_tokens`, `budget_min`, `only`. Umstellen auf den Dauerbetrieb: `gh variable set NACHTLAUF_MODUS --body live` (Nutzer, nach S3.2).
- **E6, Rechte:** statt `permissions: contents: write, actions: write` für den ganzen Lauf drei Jobs: `nachtlauf` (Modell, Gates, Bericht) nur mit `contents: read`; `veroeffentlichen` mit Schreibrecht übernimmt `data/` aus dem Artefakt auf den Commit des Laufs, Token nur im Push-Schritt (`http.extraheader` per `GIT_CONFIG_*`, nichts in `.git/config`); `ampel` macht den Lauf rot. Das Modell läuft so nie in einem Job mit Schreib-Token.
- **E6, `pipeline oepnv` entfällt im Nachtlauf:** `data/oepnv/fahrplan.json` liegt im Repo, Gates und Build brauchen keinen neuen Auszug (veraltet → nur Warnung in `data:validate`). Ein Fahrplanwechsel bleibt Handarbeit über den Skill (Abweichung von E6 und E14 zu ADR 0011 Nr. 4).
- **E6, Rot:** Die Ampel rechnet `pnpm pipeline status` (`lib/report.ts`); `pipeline nightly` endet nur noch bei gescheitertem Build mit Exit 1 (Abbruch, Zeitbudget und Bremse beenden geordnet, Fertiges darf nach grünen Gates gepusht werden, M5). Rot: Gates, Push, Build, Abbruch, Bremse, **Zeitbudget** (wie bisher im CLI; E6 nennt es nicht, ein voller erster Lauf kann es reißen und meldet dann 2–3 Nächte rot), mehr als 20 % der Anbieter des Laufs `fehler` oder `ausgefallen` (Einbruch zählt nicht), Live-Stand ab 20 Std. hinter `origin/main` (der Daten-Commit der Vornacht ist beim nächsten Lauf rund 24 Std. alt). Gezählt ab dem ältesten nicht ausgelieferten Commit, der nicht nur Doku ist (Doku-Pfad deployt nicht, ADR 0021). Gelb: Fehler unter der Grenze, Einbrüche, nicht bearbeitete Anbieter, Live-Stand unbekannt.
- **E8, Bremsen:** greifen wie das Zeitbudget vor jedem Anbieter; laufende Anbieter enden noch (Überhang höchstens 3 Anbieter, bei fbs-nuernberg 15 Aufrufe). Tokens = Eingabe + Cache lesen + Cache schreiben + Ausgabe. `region` in `kosten.csv` ist beim Nachtlauf `alle`; `abbruch` ist `auth`, `limit`, `zeit`, `aufrufe` oder `tokens`; `geaenderte_anbieter` zählt `extrahiert` und `pending-uebernommen`. Der Trockenlauf mit `--dry-run` schreibt die Zeile nach `runs/<datum>/kosten.csv`; der Modus `trocken` im Workflow läuft ohne `--dry-run` (schreibt `data/` im Runner, damit die Gates den echten Stand prüfen) und pusht nur nicht.
- **`pipeline publish RUN_DIR`:** mit `RUN_DIR/nightly.json` der Weg des Nachtlaufs (`io/publish.ts`): nur auf `main`, jede Änderung außerhalb von `data/raw`, `data/offers.json`, `data/kosten.csv` bricht ab, `validate-data --against-deployed`, Commit mit Kurzbericht (`data: Nachtlauf <datum> (<n> Angebote, <m> Anbieter geändert)`), `pull --rebase`, Konflikt → `rebase --abort`, rot ohne Push. Ohne `nightly.json` der bisherige Weg des Skills.
- **Bericht (E10):** `runs/<datum>/status.md` und `$GITHUB_STEP_SUMMARY`; `nightly.json` trägt dafür den Vorstand (`previous`), `nightly` schreibt zusätzlich `fetch/report.md`. Neue Anbieter, Kandidaten ohne Ertrag und Hinweise ohne Aktion kommen mit Stufe 4.
- **Arch-Review (2026-10-11),** keine Blocker. Eingearbeitet: M1 Token nicht während Tests (`LEFTHOOK=0` im Push-Schritt, Token-Variable gelöscht, `validate-data` ohne `GIT_CONFIG_*`); Live-Stand rot ab 20 Std. (sonst erst die zweite Nacht); Bremse auch nach dem letzten Anbieter; `validate-data` erneut nach dem Rebase und Prüfung der gestagten Pfade; Ergebnis je Anbieter in der Kostentabelle; Doku. **Offen:** M2 – `live` pusht aus Actions (Abweichung von ADR 0002); vor `NACHTLAUF_MODUS=live` muss ADR 0026 mindestens vorgeschlagen sein (Workflow-Kommentar). Test für `io/live.ts` (Logik liegt getestet in `lib/report.ts`), `CLAUDE.md` „IDs vergibt nur `pipeline build`“ um `pipeline nightly` ergänzen (Stufe 5).
- **Probe lokal** (`nightly --only die-familienbox,hebamme-mainberger-praenatal --dry-run`, Haiku): 158 s (Abruf 47 s), 3 Aufrufe (hebamme in 2 Teilen), $0,023, Ampel grün. Termine 2 889 → 3 328 bei gleichen 333 Angeboten: der neue Horizont von 12 Monaten (E5) expandiert regelmäßige Angebote des Vorstands weiter, nicht die zwei Anbieter. die-familienbox brauchte 30 263 Ausgabe-Tokens in einem Aufruf (Grenze 32 000; Teile richten sich nach der Eingabe, nicht nach der Ausgabe).

**Stufe 4 – Entdecken:** E7 vollständig, Gates G1–G4, `discover.yml` wöchentlich. Zwei Wochen `--dry-run` mit Bericht an den Nutzer, dann Commit-Modus nach seiner Freigabe.

### Stufe 4 – Umsetzung (2026-10-11, Branch `plan-0032-s4`)

E7 als Code, Workflow `discover.yml` im Modus `trocken`; der Modus `live` wartet auf die zwei Wochen Trockenlauf und die Freigabe des Nutzers (Repo-Variable `ENTDECKEN_MODUS`, leer = `trocken`; nicht gesetzt). Umgesetzt: `lib/discover.ts` (Kandidaten aus Sammelkalendern und Verzeichnissen, Vorfilter, Antwortformen von Suche und Bewerten, Katalogeintrag mit IDs, Ertragsbeweis, Bericht, Commit- und Issue-Text), `lib/discover-terms.ts` (E7.2), `lib/discover-state.ts` (`data/discover/<region>.json`, geprüft von `data:validate`), `lib/catalog-diff.ts` (G2), `io/discover.ts` (Ablauf, Modellschritte über `io/llm.ts`), `io/discover-git.ts` (G1/G2/G4, Push), Prompts `prompt/discover-search.md` und `prompt/discover-assess.md`, `pipeline discover` und `pipeline discover-publish`. Abweichungen und Präzisierungen:

- **Rechte und Übergabe (wie E6 in Stufe 3, statt `permissions` für den ganzen Lauf):** Der Job `entdecken` hat nur `contents: read` und committet lokal (G4); seine Commits gehen als git-Bundle an den Job `veroeffentlichen` (`contents: write`, `actions: write`, `issues: write`). Der prüft vor dem Checkout, dass das Bundle auf dem Commit des Laufs aufbaut, linear ist, höchstens 100 Commits hat und nur `data/providers.yaml`, `data/raw/*.json`, `data/discover/*.json` und `data/kosten.csv` berührt (Arch-Review B1; `publishDiscover` prüft dasselbe noch einmal), dann `pull --rebase`, `validate-data`, Push (`rebaseAndPush`, gemeinsam mit dem Nachtlauf), `gh workflow run ci.yml` und genau ein Issue „Neue Anbieter <datum>“ mit Commit-Links nach dem Rebase.
- **G1:** im Modus live einmal vor dem Lauf (rot → Abbruch) und vor jedem Commit. Rot bei einem Kandidaten nimmt dessen Änderungen zurück; der Kandidat ist verworfen (ohne Wiedervorlage), der Lauf geht weiter, die Ampel wird rot. Ein roter Zustands-Commit am Ende verwirft die Anbieter-Commits nicht. Gates laufen ohne Modell-Token in der Umgebung.
- **Commits:** je Anbieter `data: neuer Anbieter <id> (<region>)` mit Katalog und `data/raw/<id>.json`; am Ende ein Commit `data: Entdecken <datum> (…)` mit `data/discover/` und `data/kosten.csv` (sonst würde jede Woche dasselbe neu bewertet).
- **Zustand:** `zurueckgestellt` (Wiedervorlage 8 Wochen) bekommt jeder Kandidat ohne Ertrag und jeder, den das Bewerten verwirft oder dessen Seite nicht abrufbar ist; nicht dagegen ungültige Antworten, G1 rot und ein gesperrter Geocoder (403/429: Rest des Laufs ohne Geocodieren). `abgelehnt` gilt für URL oder Host samt Subdomains.
- **Ertragsbeweis:** Zustand zuerst nach `runs/<datum>/discover/beweis/` (frisch je Kandidat, nur `extrahiert` zählt; Arch-Review M1), erst bei Aufnahme nach `data/raw` (im Trockenlauf `runs/<datum>/discover/raw`). Modell und Schlüssel wie der Nachtlauf (`LLM_MODEL_EXTRACT`), damit der Zustand dort „unverändert“ ist.
- **Bewerten:** Text der Seite höchstens 30 000 Zeichen plus bis zu 200 Links; Programmseiten nur aus Fund-URL, abgerufener Seite und deren Links (Prompt-Injection); keine IP-Literale und kein `localhost`. Programmseite eines bekannten Anbieters → verworfen.
- **Kandidaten aus Verzeichnissen:** nur Links auf andere Websites mit Veranstalter- oder Babybezug im Linktext; Hinweise „neue Programmseite?“ nur für Unterseiten auf dem Host eines bekannten Anbieters (beides nach dem ersten Trockenlauf geschärft).
- **Neu, nicht im Plan:** `--terms a,b` (Teilmenge der Suchbegriffe für Proben, auch als Workflow-Eingabe), `LLM_MODEL_DISCOVER` (Suche und Bewerten, Standard Haiku), Zeitbudget `RUN_BUDGET_MIN` (Standard 90), `MAX_NEW` mit `--bootstrap` (Standard 30), Websuche mit `--max-turns 10`, Bewerten mit 3. `CallRecord.step` kennt `search` und `assess`, `kosten.csv` die Lauf-Art `entdecken` (wie `nacht`), eine Zeile je Region. Der Zustand aller Regionen wird erst nach der Schleife geschrieben (Arch-Review M2).
- **Lokaler Trockenlauf (2026-10-11, Haiku, lokaler Login):**
  - 2 Suchbegriffe (Krabbelgruppe, PEKiP), alter Verzeichnis-Filter: 52 Kandidaten, 5 im Vorfilter, 46 verworfen (35 davon Navigationslinks des Verzeichnisses der kath. Stadtkirche), **1 würde aufgenommen**: Donum Vitae Bayern, Beratungsstelle Nürnberg (Gruppe „ElternOase“ für Eltern mit Kindern 0–3; plausibel). 48 Aufrufe, 7 Min., $0,24 (Suche 2 × $0,09–0,11, Bewerten 45 × ≈ $0,001, eine Extraktion $0,003).
  - Alle 10 Suchbegriffe, geschärfter Filter: 65 Kandidaten, 21 im Vorfilter, 30 verworfen, **0 würden aufgenommen**; 39 Aufrufe, 11 Min., $0,79 (Suche $0,73, also $0,06–0,10 je Begriff und ≈ 150 000 Eingabe-Tokens; Bewerten $0,05). Donum Vitae scheiterte diesmal am Ertragsbeweis (Extraktion ohne künftigen Termin, Streuung des Modells). Mehrere passende Kandidaten (Schwimmschule SAM, Schwimmschule Bär, DieFamilienBox) verwarf das Bewerten, weil die abgerufene Seite keine Postadresse nennt; die beiden letzten stehen schon im Katalog (Name mit Zusatz), der Vorfilter vergleicht seitdem auch den Kopf des Namens.
- **Arch-Review (2026-10-11):** 1 Blocker, 3 Major, 10 Minor. Eingearbeitet: B1 (Bundle-Prüfung), M1 (frischer Beweis), M2 (Zustand nach der Schleife), M3 (dieser Abschnitt), Minor 1–4, 6 (Text im Issue), 7, 8, 10; Minor 5 und 6 mit der Nacharbeit unten. **Offen** (Stufe 5): Minor 9 (`docs/architecture.md` „nur `refreshProvider` schreibt `data/raw`“ meint den Inhalt, kopiert wird beim Entdecken; `CLAUDE.md` „`publicId` vergibt `add-provider`“ um `discover` ergänzen).
- **Aus dem Trockenlauf:** Das Bewerten sah nur die Fund-Seite; fehlte dort die Adresse (Startseiten mit Kontaktseite), wurde ein passender Anbieter verworfen und 8 Wochen zurückgestellt (gelöst mit Nutzerentscheid Option A, unten). Die Websuche kostet mit allen zehn Begriffen etwa $0,75 je Lauf und Region; Haiku sucht dabei 2–3-mal je Begriff.

- **Nacharbeit (2026-10-11, Branch `plan-0032-s4b`, Nutzerentscheide nach dem Trockenlauf):**
  - **Option A (Nutzerentscheid):** Das Bewerten bekommt zusätzlich höchstens zwei Kontakt-, Anfahrt-, Impressums- oder „Über uns“-Seiten derselben Website (`contactLinks`: aus den Links der Fund-Seite, erkannt an Linktext oder Pfad, Vorrang Kontakt vor Anfahrt vor Impressum; dieselbe Website = gleicher Host oder Subdomain, `sameSite`), je höchstens 8 000 Zeichen als `## WEITERE SEITE: <URL>`. Abruf über `io/http.ts` mit 15 s und ohne Wiederholung; eine Weiterleitung auf eine andere Website oder eine interne Adresse verwirft die Seite. Kein zusätzlicher Modellaufruf; die erlaubten Programmseiten bleiben die Links der Fund-Seite (Abweichung von E3 „Links werden nie verfolgt“, nur beim Entdecken; ADR 0026 Nr. 2 präzisiert).
  - **G2 und Katalogteil von G1 im Trockenlauf** (`dryRunCatalogIssues`: `catalogDiff` gegen den Ausgangsstand, `validateDataset` auf dem Katalog des Laufs), Befunde rot im Bericht und in der Ampel.
  - **Zurückgenommene IDs:** `abgelehnt` kann `id` und `publicId` eines zurückgenommenen Anbieters tragen. Das Entdecken behandelt sie (aus allen Regionen) als belegt; `data:validate` meldet jeden Katalogeintrag, der eine davon trägt, gleich über welchen Weg (`reservedConflicts`, Arch-Review S4b M1). Das Issue bittet, beide Werte bei der Rücknahme einzutragen. Belegt ist nur die Basis-Orts-ID, weitere Orts-IDs des zurückgenommenen Anbieters nicht (intern, ohne Folgen nach ADR 0022).
  - **Trockenlauf mit Option A** (alle 10 Begriffe, Haiku, lokaler Login): 75 Kandidaten, 33 im Vorfilter, 23 verworfen, **2 würden aufgenommen**: Donum Vitae Nürnberg („ElternOase“, Eltern mit Kindern 0–3) und Pfarrei St. Karl Borromäus (Mutter-Kind-Gruppe 0–2 freitags, Gemeindezentrum Lindnerstraße 3). 37 Aufrufe, 37 Min., $0,95 (Suche $0,88, Bewerten $0,07, Extraktion $0,006). Schwimmschule SAM kommt jetzt bis zur Adresse, scheitert aber an „Ort außerhalb der Region“: Mindestens einer ihrer Kursorte liegt außerhalb der bbox, und ein Ort außerhalb verwirft den ganzen Eintrag (Nutzerentscheid: Orte außerhalb weglassen, unten). Zwei Treffer waren PDF-Flyer auf nuernberg.de, die als HTML abgerufen nicht lesbar sind (Nutzerentscheid: PDF über `pdftotext`, unten).
  - Arch-Review der Nacharbeit: kein Blocker, 2 Major (Gate für alle Wege, Doku), 7 Minor; eingearbeitet; Weiterleitungen je Sprung kamen mit dem nächsten Nutzerentscheid (unten).

- **Nacharbeit 2 (2026-10-11, Branch `plan-0032-s4c` auf dem aktuellen `main`, Nutzerentscheide nach dem Trockenlauf):**
  - **Orte außerhalb der Region** fallen aus dem Katalogeintrag weg (Hinweis im Bericht und als `Hinweis:` im Commit-Text), wie „musikfuechse nur Nürnberg“: Jede Terminseite bekommt dazu einen `hint` („Nur Termine an …; Termine an … weglassen (außerhalb der Region)“), sonst legte der Extraktor sie an den ersten Ort (`prompt/extract.md`, Hauptort; Arch-Review S4c M1). Verworfen wird nur, wenn kein Ort in der Region bleibt; der Grund nennt die Adressen.
  - **PDF-Funde** (Content-Type `application/pdf` oder Endung `.pdf`) liest das Bewerten über `pdftotext` wie der Abruf des Nachtlaufs (`fetchPdfText` in `io/fetch-inputs.ts`). Bekannte Schwäche: Die Datei wird dabei zweimal geholt (erst als Seite, dann als PDF).
  - **Weiterleitungen je Sprung** im allgemeinen Abruf `io/http.ts` (gilt für Nachtlauf, Sammelkalender, Geocoder und Entdecken): `redirect: manual`, höchstens 5 Sprünge, jede Zieladresse (auch die erste) gegen die Sperre interner Adressen (`lib/redirect.ts`: IP-Literale, `localhost`, `.local`, `.internal`, `.lan`, `.home.arpa`, auch mit Punkt am Ende), Methode und Header wie `redirect: "follow"` (303 und 301/302 bei POST → GET ohne Body und Body-Header, bei anderem Origin ohne `Authorization`), `finalUrl` normalisiert wie bisher `res.url`. Eine abgelehnte Weiterleitung wird nicht wiederholt. Restrisiko: keine DNS-Prüfung; ein öffentlicher Name, der auf eine interne Adresse auflöst, kommt durch (der Abruf läuft nur im Job mit Leserecht).
  - **Trockenlauf** (alle 10 Begriffe, Code dieser Nacharbeit): 68 Kandidaten, 31 im Vorfilter, 23 verworfen, **2 würden aufgenommen**: Donum Vitae Nürnberg (ElternOase, wie im vorigen Lauf) und Sozial- und Familienzentrum Stein der Caritas Fürth (PEKiP ab der 4. Lebenswoche in Stein, in der bbox). 36 Aufrufe, 13 Min., $0,78. Schwimmschule SAM wird weiter verworfen, jetzt mit Adressen: Alle ihre Kursorte liegen außerhalb der bbox (Hilpoltstein, Postbauer-Heng, Georgensgmünd, Neuendettelsau …); sie ist also kein Anbieter der Region Nürnberg. Der PDF-Flyer des Familienzentrums Julienstraße wurde jetzt gelesen (verworfen: keine Termine).
  - Arch-Review: kein Blocker, 1 Major (Hint für weggelassene Orte), 6 Minor; eingearbeitet bis auf den doppelten PDF-Abruf (oben).

### Stufe 4 – Nutzerentscheide (2026-10-11)

- Fund-Seite ohne Adresse: Kontakt- oder Impressumsseite derselben Website wird beim Bewerten mit abgerufen (Option A).
- Orte außerhalb der Region werden aus dem Eintrag weggelassen; verworfen wird nur, wenn keiner übrig bleibt.
- **Region** = Stadt Nürnberg plus direkt angrenzende Orte (bbox in `src/domain/regions.ts` bleibt, z. B. Stein ist in Ordnung). Der Ausschluss von Fürth-Poppenreuth bei musikfuechse bleibt eine bewusste Einzelentscheidung.
- `discover.yml` läuft wöchentlich im Modus `trocken` (`ENTDECKEN_MODUS` leer); nach zwei Wochen Bericht gibt der Nutzer den Modus `live` frei.
**Stufe 5 – Abschluss:** Entdecken-Eval, Skill (E11), ADR 0026 angenommen, ADR 0016 auf „ersetzt“, Plan 0015 nach `docs/plans/archiv/` mit `ersetzt durch Plan 0032`, `docs/architecture.md` und `CLAUDE.md` nachgezogen.

### Stufe 5 – Umsetzung (2026-10-11, Branch `plan-0032-s5`)

Umgesetzt, soweit es ohne den Modus `live` des Entdeckens geht. Offen bleiben die zwei Wochen Trockenlauf des Entdeckens (Stufe 4) und die Freigabe `ENTDECKEN_MODUS=live` durch den Nutzer; danach wird der Plan archiviert (Statuszeile bleibt bis dahin `in Umsetzung`).

- **Entdecken-Eval (E9):** `pnpm pipeline discover --dry-run --hide a,b` blendet bekannte Anbieter aus Katalog und Katalogtext aus (`hideProviders`, `removeEntries` in `lib/catalog-yaml.ts`; nur im Trockenlauf, nur `anbieter` der Regionen des Laufs, G3 steigt um ihre Zahl). `hiddenEval` gibt je ausgeblendetem Anbieter den besten Ausgang (aufgenommen, verworfen, nicht bewertet, Vorfilter, nicht gefunden; Treffer wie im Vorfilter über URL oder Host und ähnlichen Namen, bei Aufnahmen auch über den Namen des Eintrags) und listet fremde Aufnahmen zum Beurteilen von Hand; Abschnitt im Bericht, `hidden` in `report.json`.
- **Lauf** (lokaler Login, Haiku, alle 10 Begriffe; ausgeblendet: brk-familienzentrum, die-familienbox, post-sv-nuernberg, musikfuechse, djk-eibach, ev-suedstadt-krabbelgruppen, hebamme-elena-paulus, zoff-harmonie, cvjm-gostenhof-miniclub, schwimmschule-baer-ritterbad): 67 Kandidaten, 24 im Vorfilter, 32 verworfen, 3 würden aufgenommen; 46 Aufrufe, 15 Min., $0,81 (Suche $0,74). **Wiedergefunden 2 von 10** (brk-familienzentrum über die PEKiP-Seite, zoff-harmonie über das Verzeichnis der kath. Stadtkirche), **gefunden 6 von 10**, **falsch aufgenommen 0**; zusätzlich würde Donum Vitae Nürnberg aufgenommen (wie in den Trockenläufen von Stufe 4, passend). Verworfen: djk-eibach, post-sv-nuernberg und schwimmschule-baer-ritterbad, weil der Kursort (Turnhalle, Bad) auf den Seiten nur mit Namen ohne Postadresse steht; cvjm-gostenhof-miniclub am Ertragsbeweis (kein künftiger Termin). Nicht gefunden: die-familienbox, ev-suedstadt-krabbelgruppen, hebamme-elena-paulus, musikfuechse. Zeile unter „Entdecken“ in `evals/results.md`. Lesart: Das Entdecken ist vorsichtig (keine falsche Aufnahme), aber schwach im Wiederfinden; die größte Lücke sind Orte ohne Postadresse (Restpunkt unten), die zweite die Breite der Websuche.
- Der erste Bericht des Laufs zählte zoff-harmonie als „nicht gefunden“: Der Fund hieß nach dem Linktext des Verzeichnisses nur „Kinder & Familie“. `hiddenEval` vergleicht Aufnahmen seitdem auch über den Namen des Eintrags (Test); die Zahlen oben sind mit diesem Stand aus `report.json` neu gerechnet.
- **Skill (E11):** `babyevents-nuernberg` ist ein Wartungsleitfaden: Bericht und Issue sichten, Rücknahme per `git revert` und `abgelehnt` (mit `id` und `publicId`), Katalogpflege mit den offenen Punkten aus S1.2/Stufe 2 (gugelrund 404, sternenhaus-kuf Bot-Schutz, eva-kauper 69 Zeichen, studio-herzschlag eversports, nuebad-flipper Folgetermine), Eval-Fälle (`pnpm eval freeze`), Entdecken-Eval, Modellwechsel (`LLM_MODEL_EXTRACT`, Eval-Lauf, einmal höhere Token-Bremse), Region starten (`discover --bootstrap`), Fahrplan (`pipeline oepnv`), Umstieg auf die API (N-H). `references/paket.md` entfällt, `catalog.md` und `booking-systems.md` ohne alte Befehle.
- **Entfernter Code** (vorher per grep und knip geprüft; nichts außer dem alten Skill nutzte ihn): `init`, `select`, `candidates fetch|list|keep|add-provider`, `validate-raw`, `build RUN_DIR` und der alte Weg von `publish RUN_DIR` (bleibt für den Nachtlauf), `selectBatches`, `nextBatchFiles`, `lib/draft.ts`, `lib/run.ts`, `providerIdsOf`, die Lauf-Helfer in `io/files.ts`, die Themen-Heuristik in `lib/relevance.ts`, `CandidatesFile`, die validate-raw-Prüfung im post-edit-Hook. Damit ist auch die doppelte Adapter-Schleife von `candidates fetch` neben `io/fetch-inputs.ts` weg (S1.2). Die `publicId` neuer Anbieter vergibt nur noch `pipeline discover` (`nextPublicId`) oder die Meldung von `data:validate`; `candidates add-provider` brauchte nichts mehr, weil das Entdecken Veranstalter aus Sammelkalendern selbst aufnimmt.
- **ADRs:** ADR 0026 angenommen (Nachtlauf live seit 7bd84f2), ADR 0016 „ersetzt durch ADR 0026“, Verweise in der Statuszeile von ADR 0002, 0003, 0004, 0006, 0022 (Vergabeweg der IDs) und 0024 (`validate-raw` entfällt). Plan 0015 liegt mit `ersetzt durch Plan 0032` im Archiv.
- **Doku:** `CLAUDE.md` (Stolperfallen, Daten: Datenfluss, `data/raw` und `data/discover` nie von Hand außer `abgelehnt`, IDs über `pipeline nightly` bzw. `pipeline discover`), `docs/architecture.md` (Datenfluss, `refreshProvider` erzeugt den Inhalt von `data/raw`, das Entdecken kopiert nur den Ertragsbeweis (Arch-Review S4, Minor 9), Horizont durch ADR 0026 gedeckt, Entdecken-Eval).
- **Arch-Review (2026-10-11):** kein Blocker, 2 Major, 6 Minor; eingearbeitet: M1 (nicht bewertete Kandidaten als eigener Ausgang, G3 mit `--hide` angehoben), M2 (ADR 0022 und 0026 zum Vergabeweg), Minor 1–5; Minor 6 (Export `schema/raw-batch.schema.json` ohne Abnehmer) begründet in `docs/architecture.md`, Streichen als Restpunkt. Die Prüfung „nur Regionen des Laufs“ hat keinen Test, weil es heute nur eine Region gibt.
- **WebKit-Flake** `e2e/saved.spec.ts:443` („Worker failed to load“, am 2026-10-11 dreimal in der CI): behoben mit e63b1e1, der Test wartet per `mapSettled` vor dem Neuladen auf die Karte; lokal 40/40 grün, CI auf `main` grün.
- **Nacharbeit zum Arch-Review** (Branch `plan-0032-review-fix`): M1 `pnpm pipeline nightly --build-only` baut `data/offers.json` ohne Abruf und Modell aus `data/raw` und Katalog neu (gleicher Build wie der Nachtlauf, `buildFromRaw` in `io/nightly.ts`) und räumt Zustände entfernter Anbieter weg; Schritt der Rücknahme im Skill und in `references/catalog.md`, Test „Anbieter aus dem Katalog entfernt“. m1 „gefunden“ im Entdecken-Eval heißt „von einer Quelle geliefert“ (auch Vorfilter und nicht bewertet), `evals/results.md` an den Code angeglichen, weil es die Breite der Quellen getrennt vom ganzen Weg misst; Test mit Vorfilter-Fall. m2 `--hide` hebt G3 auch mit `--bootstrap` an.

**Restpunkte** (kommen bei der Archivierung nach `docs/ideas.md`):

- Entdecken: Orte ohne Postadresse (Bad, Turnhalle, Gemeindehaus nur mit Namen) verwerfen passende Anbieter; Geocodieren über den Namen samt Ort oder eine Rückfrage im Bericht prüfen (Entdecken-Eval: 3 von 10).
- Entdecken: Breite der Websuche (4 von 10 bekannten Anbietern nicht gefunden), etwa mehr Suchbegriffe oder Stadtteile; Kosten der Suche im Blick ($0,74 je Lauf).
- PDF-Funde beim Bewerten werden zweimal abgerufen (erst als Seite, dann für `pdftotext`).
- Weiterleitungen ohne DNS-Prüfung: ein öffentlicher Name, der auf eine interne Adresse auflöst, kommt durch.
- Hash über die Eval-Fälle als Spalte in `evals/results.md` (heute deckt der Hash nur Prompt und Schema, nicht `extractMessage` und die Fälle); schmales Modul für `EXTRACT_KEY_PARTS` (`validate-data.ts` zieht `io/llm.ts` mit).
- Gemeinsamer Ferien-Lader für Extraktor und Eval.
- Test für `freezeCase`; Test für `io/live.ts`.
- Entscheid zum reihenfolgefreien Schlüssel (`ORDER_FREE_KEY`) nach einigen Live-Nächten anhand der gesparten Aufrufe.
- Vergangene Termine vor dem Hash filtern (iCal-Feeds ändern sich täglich, weil alte Termine herausfallen).
- Teile großer Anbieter parallel extrahieren (fbs-nuernberg 12,5 Min. im Budget von 50 Min.), wenn das Zeitbudget eng wird.
- Aufteilen: Kalenderseiten mit Tagesüberschriften über mehreren Einträgen (Folgeteil ohne Datum) sind nicht abgedeckt.
- `LLM_MODEL_EXTRACT` steht in keinem Workflow; ein Modellwechsel ist eine Änderung an `nightly.yml` und `discover.yml`.
- Export `schema/raw-batch.schema.json` streichen, wenn ihn niemand mehr liest.
- Adapterabruf zweimal geschrieben: `fetchAggregatorCandidates` (`io/discover.ts`) und die Schleife in `io/fetch-inputs.ts`.


### Stufe 3 – Trockenlauf und Freigabe (2026-10-11)

- **S3.2 Trockenlauf** (Run 38136150454, `main`): 74 Anbieter in 18 Min., 115 Modellaufrufe (fbs-nuernberg in 15 Teilen), 2,40 Mio. Tokens ein und 0,64 Mio. aus, $0,57 (CLI-Schätzung, API-Gegenwert). Ergebnis 372 Angebote und 5 307 Termine gegen 333 und 2 889 im Bestand (vor allem 12 statt 4 Monate). Einbruchschutz griff bei nuebad-flipper (10 → 0, Vorstand bleibt). Fehler: hebammenpraxis-gugelrund (404), sternenhaus-kuf (Bot-Schutz), studio-herzschlag (Timeout). Rot wegen eines Test-Flakes in `scripts/heavy.test.ts` (behoben in 398a0e8) und der Token-Bremse (3 Mio.), die 2 Anbieter offen ließ; der erste Lauf extrahiert alles neu, danach nur geänderte Seiten.
- **S3.3:** Deploy-Build mit den Daten des Trockenlaufs hält alle Budgets (`pnpm size`, Daten 93 kB von 250 kB).
- **Freigabe (Nutzer, 2026-10-11):** Push freigegeben; erster Live-Lauf per `workflow_dispatch` mit `max_tokens=5000000`, danach `NACHTLAUF_MODUS=live`. Die reine Hash-Messung aus S1.2 endet damit nach einer Nacht; geänderte Anbieter je Nacht zeigt weiter `data/kosten.csv`. Der Entscheid zum reihenfolgefreien Schlüssel (`ORDER_FREE_KEY`) fällt nach einigen Live-Nächten anhand der Zahl der gesparten Aufrufe.

### Kostenhebel: vergangene Termine aus dem Vergleich (2026-10-11, Branch `kosten-vergangene`)

**Anlass:** iCal-Feeds und Sammelkalender verlieren jeden Tag ihre vergangenen Termine. Damit ändert sich der Schlüssel (E4) von etwa 40 der 74 Anbieter jede Nacht, obwohl kein neuer Termin dazukam, und sie werden neu extrahiert. Ein bloßer Filter „ab heute“ vor dem Hash hilft nicht: Das Fenster rückt mit, und die Termine von gestern fallen trotzdem aus dem Hash. Der Vergleich muss beide Eingaben am selben Stichtag abschneiden.

**Entscheidung:** Der Schlüssel hat zwei Teile.
- **Grundschlüssel** (`inputHash`, wie bisher): normalisierte Seiten, Katalogauszug, Prompt, Schema, Modell. Ausgenommen sind die datierten Bestandteile:
  - iCal-Termine **ohne** `RRULE` mit lesbarem `DTSTART` (Seitentext `## ICAL`, `lib/fetch.ts`).
  - Alle Kandidaten.
- **Datierte Bestandteile** (`dated`, neu): je letztem Tag (`JJJJ-MM-TT`) ein Hash über die sortierten, normalisierten Bestandteile mit diesem letzten Tag.
  - Erkannt wird ein iCal-Text am Anfang `## ICAL\n` (`ICAL_HEADING`), der Rest per `JSON.parse`. Scheitert das, bleibt die ganze Seite im Grundschlüssel. Sonst wird der Rest wie in `programmeText` neu serialisiert.
  - „Lesbar“ heißt `^\d{8}(T\d{6}Z?)?$`. `ical.ts` verwirft Parameter wie `TZID` und `VALUE`.
  - Letzter Tag eines iCal-Termins ist der exakte Berliner Tag von `DTEND`, sonst von `DTSTART`.
    - Zeiten mit `Z` werden über `berlinIsoDate` umgerechnet.
    - Lokale Zeiten gelten als Berliner Zeit.
    - Ein ganztägiges `DTEND` ist exklusiv, zählt also einen Tag früher.
    - Ohne Zuschlag: Ein Tag zu lange hieße, dass der gestrige Termin noch zählt, wenn der Feed ihn nachts schon weglässt. Der Hebel griffe dann nie (Arch-Review, Blocker 1).
  - Ein Kandidat zählt **je Termin**: Hash über den Kandidaten ohne `occurrences` plus diesen Termin, unter dessen Tag (`end ?? start`). Fällt der vergangene Termin einer Reihe weg, bleiben die künftigen Tage gleich. Eine Änderung am Kandidaten (Titel, Plätze) ändert alle seine Tage (Plan-Review M2).
  - Bestandteile ohne lesbares Datum bleiben im Grundschlüssel.
- **Vergleich** (`sameKey`, rein): Die Grundschlüssel sind gleich, und die Tage ≥ heute (Europe/Berlin, aus `now`) stimmen in beiden `dated` überein. Das gilt für `prev` und für `pending`.
- **Gespeichert** wird `dated` nur mit Tagen ≥ heute, also ohne Vergangenes. Bei „unverändert“ kürzt der Lauf auch das alte `dated` auf heute. So wächst die Datei nicht.
- Datenfluss: `extractKey` liefert `ExtractKey { hash, dated }` an `planRefresh`, `applyOutcome`, `adopt` und `pending`. `RefreshContext` bekommt `today` aus `io/refresh.ts`. Ein fehlendes `dated` gilt als leer.
- **Einbruchschutz** (Plan-Review M1): Er zählt nur Termine ab heute, alt wie neu. Ohne Neu-Extraktion altern die alten Events. Die neue Antwort kennt nur Künftiges, das sähe sonst wie ein Einbruch aus.
- Die Messung `hashes.json` aus `pipeline fetch` (`assembleProvider`) hasht weiter alles. Sie ist nicht der Cache-Schlüssel.
- Was das Modell sieht, bleibt gleich: Der Eingabetext enthält weiter alle Termine; der Build filtert Vergangenes wie bisher.
- **Fachlich gleichwertig:** Wird ein Anbieter nicht neu extrahiert, stammen seine Events aus einer Eingabe, die sich von der heutigen nur in vergangenen Terminen unterscheidet.
- **Anbieter ohne datierte Bestandteile:** Grundschlüssel bitgleich zum alten `inputHash`, keine Neu-Extraktion.
- **Anbieter mit datierten Bestandteilen:** einmal neu extrahiert in der ersten Nacht nach dem Deploy, geschätzt 20–30 ct.

**Nicht erfasst:** Termine in HTML-Seiten, JSON-LD und `json-api`. Ihr Text lässt sich nicht verlässlich in Termine zerlegen.

**Bleibt bei der Auswertung von `geaenderte_anbieter` zu beachten:**
- Ein Feed mit gleitendem Fenster („nächste 90 Tage“) bekommt jede Nacht einen neuen künftigen Tag und wird weiter neu extrahiert.
- Anbieter mit Kandidaten extrahieren einmal im Monat neu: Das Fenster der Sammelkalender (`placeholderWindow`) springt am Monatsersten.
- Beides ist fachlich richtig.

**Schema:** `ProviderRaw` bekommt `dated: Record<LocalDate, string>` optional, auch in `pending`.
- Es gibt `dated` nur zusammen mit `inputHash`.
- Danach `pnpm schema:export`.
- Kein neuer Datenvertrag der Website (ADR 0026), ältere Dateien ohne `dated` bleiben gültig.

**Tests:**
- `normalize.test.ts`:
  - Ohne datierte Bestandteile ist der Schlüssel gleich dem alten `inputHash`.
  - Eine RRULE-Serie bleibt im Grundschlüssel.
  - Ein Kandidat landet unter seinem letzten Tag.
  - `sameKey` gilt nach Wegfall eines gestrigen Termins.
  - `sameKey` gilt nicht bei einem neuen oder geänderten Termin ab heute.
- `refresh.test.ts`:
  - Ein Feed, der über Nacht nur den gestrigen Termin verliert, ergibt „unverändert“ ohne Aufruf, und `dated` wird gekürzt.
  - Ein geänderter künftiger Termin ergibt „extract“.
  - `pending` mit gleicher künftiger Eingabe wird übernommen.
  - Migration: Ein alter Zustand ohne `dated` wird einmal neu extrahiert.
  - Einbruchschutz mit gealterten Einzelterminen.
- `normalize.test.ts`, weitere Fälle:
  - Mehrtägige Termine, ganztägige Termine, Termine in UTC um Mitternacht.
  - Ein iCal-Text, der sich nicht lesen lässt.
  - Eine Reihe, deren vergangener Termin wegfällt.
- Wirkung: Spalte `geaenderte_anbieter` in `data/kosten.csv` der Folgenächte.
- **Plan-Review** (2026-10-11): kein Blocker.
  - Eingearbeitet: M1 (Einbruchschutz nur Künftiges), M2 (Kandidaten je Termin), m3–m7 (UTC, Regex und Zerlegung festgelegt, Datenfluss, Tests, Hinweis auf `hashes.json`).
- **Arch-Review** (2026-10-11):
  - Blocker: Der pauschale Zuschlag von +1 Tag hätte den Hebel bei zwei aufeinanderfolgenden Nächten ausgehebelt. Behoben: Berliner Tag exakt, `DTEND` ganztägig exklusiv. Der Refresh-Test läuft jetzt über die Nächte 11 → 12.
  - Minor: Doku in `architecture.md` ergänzt, Kommentar zu `prevOfferCount`.
  - Zweites Review: OK. Eingearbeitet: Feed-URL im Tageshash, datierte Bestandteile ohne Cookie-Zeilenfilter, Hinweise zur Auswertung.

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
| R1 | Abo-Läufe teilen sich das 5-Stunden- und Wochenkontingent mit der interaktiven Arbeit | Nur für den Start (N-H); Umstieg auf API-Nutzung ohne Pipeline-Umbau, nur in `io/llm.ts` (dieselbe CLI mit `ANTHROPIC_API_KEY` oder ein anderer Anbieter). |
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
