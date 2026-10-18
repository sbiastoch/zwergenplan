---
name: babyevents-nuernberg
description: Datenpflege des Zwergenplans – Berichte von Nachtlauf und Entdecken sichten, falsch aufgenommene Anbieter zurücknehmen, den Anbieterkatalog data/providers.yaml von Hand pflegen, Eval-Fälle anlegen, das Modell wechseln, eine Region starten, den Fahrplan erneuern. Nutzen bei „Daten prüfen“, „Nachtlauf rot“, „Issue Neue Anbieter“, „Anbieter falsch aufgenommen“, „Modell wechseln“ und bei Pflege des Katalogs. Termine holt der Nachtlauf in GitHub Actions selbst. Fragen wie „was machen wir nächste Woche mit dem Baby“ beantwortet die Website (https://zwergenplan.app/) bzw. data/offers.json.
---

# Zwergenplan-Daten pflegen

Die Daten aktualisieren sich selbst (Plan 0032, ADR 0026):

- **Nachtlauf** (`.github/workflows/nightly.yml`, täglich): ruft alle Seiten des Katalogs ab, extrahiert geänderte Anbieter mit dem Modell und schreibt `data/raw/<id>.json`, `data/offers.json` und `data/kosten.csv` auf `main`. Ein Lauf für alle Regionen; Schulferien und Feiertage nimmt er je Netz (VGN: Bayern, VRR: NRW, ADR 0032).
- **Entdecken** (`.github/workflows/discover.yml`, je Netz ein Lauf: sonntags `--netz vgn` für Fürth und Nürnberg, samstags `--netz vrr` für Düsseldorf): sucht neue Anbieter je Region und nimmt einen auf, wenn er mindestens ein Angebot für 0–3 Jahre liefert. Es schreibt `data/providers.yaml` (nur neue Einträge), `data/raw/<id>.json` und `data/discover/<region>.json`. Im Modus `trocken` (Repo-Variable `ENTDECKEN_MODUS` leer) steht das Ergebnis nur im Bericht.

Dieser Skill ist der **Wartungsleitfaden** dafür. Er ruft dieselben Befehle wie die Workflows; Übersicht im Kopf von `scripts/pipeline/cli.ts` und `scripts/pipeline/eval.ts`. `data/offers.json`, `data/raw/` und `data/discover/` werden nie von Hand bearbeitet, mit einer Ausnahme: `abgelehnt` in `data/discover/<region>.json`. Der Datenvertrag ist `src/domain/schema.ts` (Katalog exportiert nach `schema/providers.schema.json`).

Läufe mit Modell kosten Geld bzw. Abo-Kontingent. Lokal nutzen sie den Login des Entwicklers (`io/llm.ts`). Vor einem Lauf ohne `--only` oder `--terms` kurz sagen, was er etwa kostet (Nachtlauf voll ≈ $0,60, Entdecken voll ≈ $0,80–1,00 für das Netz `vgn` mit zwei Regionen, ≈ $0,40–0,50 für `vrr`).

## 1. Bericht sichten

```
gh run list --workflow nightly.yml --limit 3
gh run view <id>                         # Job-Summary: Ampel, Fehler, Einbrüche, Kosten
gh run download <id> -n <artefakt>       # runs/<datum>/ mit nightly.json, status.md, kosten.jsonl
pnpm pipeline status runs/<datum>        # Bericht aus einem heruntergeladenen oder lokalen Lauf
```

Entdecken genauso mit `--workflow discover.yml`; es gibt zwei Läufe je Woche (Samstag `vrr`, Sonntag `vgn`), also beide sichten. Von Hand nur ein Netz: `gh workflow run discover.yml -f netz=vrr` (oder `-f region=<id>`, nicht beides), lokal `pnpm pipeline discover --netz vrr --dry-run`. Nach einem Lauf im Modus `live` mit neuen Anbietern gibt es genau ein Issue „Neue Anbieter <datum>“ mit Commit-Links und Fund-URLs (`gh issue list --search "Neue Anbieter"`).

Worauf achten:
- **Ampel rot**: Gates, Push, Build, Abbruch (`auth`, `limit`), Bremse, Zeitbudget, mehr als 20 % der Anbieter mit Fehler oder Live-Stand ab 20 Std. hinter `main` (Plan 0032, „Stufe 3 – Umsetzung“). Ein Abbruch oder eine Bremse lässt nur Anbieter offen; die nächste Nacht holt sie nach.
- **Quellen mit `fehler`** samt Grund und `failingSince`: ab 14 Tagen steht die Quelle unter „Hinweise ohne Aktion“. Das ist Katalogpflege (Abschnitt 3).
- **Zurückgehaltene Einbrüche** (`pending`): Die alte Zahl Angebote bleibt, bis die Seite wieder mehr liefert oder der Katalog angepasst ist. Prüfen, ob der Anbieter wirklich weniger anbietet.
- **Kategorie** (Plan 0037): „Kategorie aus Themen abgeleitet: N“ ist ein Übergang (E5) und sinkt mit jeder Neu-Extraktion auf 0. „Kategorie passt zu keinem Thema“ über 5 % der neuen Events heißt: Eval-Fall anlegen und den Prompt schärfen, nicht den Code ändern.
- **Neue Anbieter** (Issue oder „Würde aufnehmen“ im Trockenlauf): Name, Fund-URL und erstes Angebot gegen die Website prüfen. Passt einer nicht, Abschnitt 2.

Fertig, wenn jede rote Zeile und jeder neue Anbieter eingeordnet ist: in Ordnung, zurückgenommen (2) oder als Katalogpflege umgesetzt (3).

## 2. Falsch aufgenommenen Anbieter zurücknehmen

Jeder neue Anbieter ist ein eigener Commit `data: neuer Anbieter <id> (<region>)` mit Katalogeintrag und `data/raw/<id>.json`.

1. `git revert <sha>` dieses Commits. `id` und `publicId` aus dem zurückgenommenen Eintrag notieren.
2. In `data/discover/<region>.json` unter `abgelehnt` eintragen, sonst findet ihn das nächste Entdecken wieder (der Eintrag sperrt ihn in allen Regionen):
   ```json
   { "url": "<Fund-URL>", "name": "<Name>", "id": "<id>", "publicId": "<publicId>", "grund": "<warum>", "datum": "<heute>" }
   ```
   Statt `url` geht `host` (ganzer Host samt Subdomains, etwa für einen Vermittler). `id` und `publicId` werden danach nie neu vergeben (ADR 0022); `pnpm data:validate` meldet jeden Katalogeintrag, der eine davon trägt.
3. `pnpm pipeline nightly --build-only`: baut `data/offers.json` ohne Abruf und ohne Modell aus `data/raw` und dem Katalog neu (gleicher Build wie der Nachtlauf, IDs bleiben stabil) und entfernt `data/raw/<id>.json` von Anbietern, die nicht mehr im Katalog stehen. Ohne diesen Schritt stehen die Angebote des Anbieters weiter in `data/offers.json`, und `pnpm data:validate` meldet „unbekannter Anbieter“. Die freien Tage kommen aus dem Cache `~/.cache/zwergenplan/`, sonst aus dem Netz (OpenHolidays).
4. `pnpm data:validate`, dann Commit (mit `data/offers.json` und `data/raw`) und Push wie in `CLAUDE.md`.

Fertig, wenn der Revert, der Neubau und der Eintrag in `abgelehnt` auf `main` sind und CI grün ist.

Geprüfte und bewusst nicht aufgenommene Anbieter ohne Rücknahme stehen in `references/excluded.md`. Findet das Entdecken einen davon, gehört er zusätzlich in `abgelehnt`.

## 3. Katalog von Hand pflegen

Regeln für `data/providers.yaml`: `references/catalog.md`. Lesarten der Buchungssysteme für `hint` und `availability.how`: `references/booking-systems.md`.

Jede Änderung an einem Eintrag ändert den Eingabe-Hash; der Anbieter wird in der nächsten Nacht neu extrahiert. Vorher lokal prüfen:

```
pnpm pipeline fetch-page <url> --links         # was der Abruf von einer Seite sieht
pnpm pipeline fetch --only <id>                # Abruf nach Katalog, Text unter runs/<heute>/fetch/<id>.txt
pnpm pipeline nightly --only <id> --dry-run    # Extraktion und Build nur dieses Anbieters, nichts nach data/
```

Fertig ist eine Änderung, wenn der Trockenlauf das Erwartete liefert, `pnpm data:validate` grün ist und `verified` das heutige Datum trägt.

**Hinweise ohne Aktion** im Bericht des Entdeckens:
- „neue Programmseite?“: Seite eines bekannten Anbieters aus einem Sammelkalender, die der Katalog nicht kennt. Prüfen und als `programme`-Eintrag ergänzen. Das Entdecken ändert bestehende Einträge nie (G2).
- Quelle mit Fehlerserie: URL korrigieren, `render: browser` setzen, `blocked` mit Beleg eintragen oder den Anbieter mit `skipCrawl` ruhen lassen.

**Neuer Anbieter von Hand** (etwa aus `references/excluded.md`, wenn sich die Lage geändert hat): Eintrag nach `references/catalog.md` anlegen, Orte mit `pnpm pipeline geocode "<Adresse>"`. `pnpm data:validate` nennt die freie `publicId` („`<id>`: `publicId` fehlt – frei ist `<wert>`“); genau diesen Wert übernehmen. Dann `pnpm pipeline nightly --only <id> --dry-run` als Ertragsbeweis.

**Offene Pflegepunkte** (Stand 2026-10-11, nach der Katalogpflege):
- `studio-herzschlag`: Haiku liefert für den Teil mit PEKiP, MusikZauber und SinnesZauber reproduzierbar `{"events": []}`, obwohl die Seiten Termine nennen. Sonnet erfasst alles (58 Events). Der Einbruchschutz hält den Bestand, bis die Pipeline das abfängt.
- `hebamme-eva-kauper-wunderwerk`: mymiya liefert nur 69 Zeichen; Kursliste über die miya-URL aus `references/booking-systems.md` prüfen.
- `hebammenpraxis-gugelrund`: derzeit keine Kurse mit Baby; die Startseite ist Terminquelle, eine neue Babymassage fällt dem Nachtlauf auf.

## 4. Eval-Fälle anlegen

```
pnpm eval freeze <id> --kind html[,gross] [--trap ab-3-jahren]
```

legt `evals/cases/<id>-<heute>/` aus einem frischen Abruf an. `expected.json` ist ein Entwurf aus dem Bestand: von Hand gegen `input.json` prüfen, Korrekturen in `NOTES.md` (Plan 0032, E9). Arten und Fallen nennt `scripts/pipeline/eval.ts`. Fertig, wenn `pnpm verify` grün ist (`io/eval.test.ts` prüft alle Fälle).

**Entdecken-Eval** (Plan 0032, E9): misst, ob das Entdecken bekannte Anbieter wiederfindet, etwa nach einer Änderung an Suchbegriffen oder Prompts von `prompt/discover-*.md`.

```
pnpm pipeline discover --dry-run --hide <id>,<id>,…    # ≈ 10 Anbieter verschiedener Arten, ≈ $0,80, 15–40 Min.
```

Der Bericht `runs/<heute>/discover/report.md` nennt je ausgeblendetem Anbieter den Ausgang (aufgenommen, verworfen mit Grund, nicht bewertet, Vorfilter, nicht gefunden) und unter „Zusätzlich aufgenommen“ Anbieter, die nicht ausgeblendet waren: Die sind neu oder falsch und werden von Hand beurteilt. Ergebnis als Zeile unter „Entdecken“ in `evals/results.md`.

## 5. Modell wechseln

1. Messen: `pnpm eval --model <neu>` (Modell allein) und `pnpm eval --model <neu> --fallback sonnet` (wie der Nachtlauf). Jeder volle Lauf schreibt eine Zeile in `evals/results.md`. Ein Lauf ist eine Stichprobe; vor einer Entscheidung je Modell zwei Läufe.
2. Entscheidet der Nutzer für den Wechsel, setzt ein Commit `LLM_MODEL_EXTRACT` (und bei Bedarf `LLM_MODEL_FALLBACK`) in der `env` beider Workflows; ohne Wert gilt Haiku mit Sonnet als Fallback. Das Modell ist Teil des Cache-Schlüssels: Die erste Nacht danach extrahiert alles neu (N3). Dafür einmal `gh workflow run nightly.yml -f modus=live -f max_tokens=5000000` statt der normalen Bremse.
3. Suche und Bewerten beim Entdecken wählt `LLM_MODEL_DISCOVER` (Standard Haiku), unabhängig davon.

Ein neuer Prompt oder ein neues Antwortschema braucht ebenfalls eine Zeile in `evals/results.md`; sonst warnt `pnpm data:validate` in der CI. Ändert der Prompt die Antwort für alle Anbieter (etwa ein neues Feld), gilt wie beim Modellwechsel: einmal mit `max_tokens=5000000`.

## 6. Region starten

Eine neue Region ist ein eigener Plan (Muster: Plan 0036 Fürth im bestehenden Netz, ADR 0029; Plan 0039 Düsseldorf in einem neuen Netz, ADR 0032). Zuerst klären, zu welchem **Netz** (Verkehrsverbund in einem Bundesland, `NETWORKS` in `src/domain/regions.ts`) sie gehört.

**Region in einem bestehenden Netz** (etwa Erlangen im VGN):
- Eintrag in `src/domain/regions.ts`: bbox (in der bbox des Netzes), Einwohner mit Quelle und Stichtag, `kreis` (Startgebiet der Wegzeit), `network` und Platz in `REGION_IDS` (spezifischere Region vor der umfassenden, denn in dieser Reihenfolge läuft das Entdecken). `municipality` nur, wenn das Rechteck Nachbarstädte enthält, die nicht dazugehören sollen (Gemeinde-Prüfung beim Aufnehmen, wie Düsseldorf).
- Stadtteile in `src/domain/districts.ts`: jeder braucht einen Haltbereich seines Netzes in 800 m mit Einstieg im Fenster (`pnpm data:build` prüft das, `scripts/transit/gates.ts`); Namen über alle Regionen eindeutig.
- Texte; der Sonntags- bzw. Samstagslauf des Netzes nimmt die Region mit (`regionsOf`).

**Region in einem neuen Netz** zusätzlich:
- Netz-Eintrag in `NETWORK_IDS` und `NETWORKS`: `area` (Wendung nach „außerhalb“), `bbox` (Stadt plus Rand; Gültigkeitsbereich der Startpunkte und Zuschnitt des Auszugs; darf keine andere Netz-bbox berühren), `home` (Kartenmitte ohne Orte), `holidays` (ISO-Code des Bundeslands, für OpenHolidays) und `transitSource` (Namensnennung und Lizenz des Feeds).
- Feed in `FEEDS` (`scripts/pipeline/lib/gtfs.ts`): Ort (feste URL oder CKAN-Datensatz), `modes` für jeden `route_type` des Feeds (ein unbekannter bricht ab), Bedarfsverkehr, `source` mit Lizenz und Hinweis „abgewandelt“. Lizenz und verlangte Namensnennung vorher nachlesen; README-Abschnitt „Datenquellen“ ergänzen.
- `pnpm pipeline oepnv --netz <netz>` schreibt `data/oepnv/<netz>.json` (Größe, Steige, Fahrten, Laufzeit und Speicher in den Plan). Budgets `Wegzeit-Daten <netz>` und `Linien-Daten <netz>` in `.size-limit.json`.
- Zweiter Cron in `.github/workflows/discover.yml` an einem eigenen Tag mit `--netz <netz>` (Bremsen und Zeitbudget gelten je Lauf).

Steht sie in `REGION_IDS`, füllt das Entdecken ihren Katalog:

```
pnpm pipeline discover --region <id> --bootstrap --dry-run          # lokal, Bericht unter runs/<heute>/discover/
gh workflow run discover.yml -f region=<id> -f bootstrap=true -f modus=trocken
```

`--bootstrap` hebt G3 auf `MAX_NEW` (Standard 30, Eingabe `max_new`); die Bremsen setzen `max_calls` und `max_tokens`. Erst nach Abnahme des Trockenlaufs durch den Nutzer mit `-f modus=live`. Neue Anbieter landen erst mit dem nächsten Nachtlauf in `data/offers.json`; danach also `gh workflow run nightly.yml -f modus=live`. In einem neuen Netz bekommen die Linien-Gates erst mit Orten etwas zu prüfen; `MAX_WITHOUT_LINES` danach für das Netz nachmessen.

Regionen eines Netzes dürfen überlappen (Fürth liegt in der Nürnberger bbox). Ein neuer Anbieter gehört zur Region des Laufs, der ihn aufnimmt. Hat er beim Aufnehmen einen Ort außerhalb der bbox seiner Region verloren (Hinweis im Commit-Text), `region` auf die umfassende Region setzen (etwa `nuernberg`; `region` ist keine ID) und den Ort von Hand ergänzen. Dazu an den Terminseiten den `hint` „Nur Termine an …; Termine an … weglassen (außerhalb der Region)“ entfernen bzw. anpassen, sonst lässt der Extraktor die Termine am ergänzten Ort weiter weg.

**Gemeinde-Prüfung** (Regionen mit `municipality`, heute Düsseldorf): Das Entdecken verwirft auch Orte in der bbox, deren Gemeinde laut Geocoding eine andere ist („andere Gemeinde (Neuss)“) oder fehlt („Gemeinde unbekannt“). Das Schema prüft nur die bbox: Einen Ort von Hand nur eintragen, wenn er wirklich in der Stadt liegt (`pnpm pipeline geocode "<Adresse>"` zeigt die Gemeinde). Ein Anbieter aus einer Nachbarstadt gehört nicht in die Region, auch wenn er im Rechteck liegt.

## 7. Fahrplan erneuern

```
pnpm pipeline oepnv
```

fragt je Netz (VGN, VRR; nur eins mit `--netz vgn` bzw. `--netz vrr`) mit bedingtem `GET` nach einem neuen GTFS-Feed (Cache unter `~/.cache/zwergenplan/gtfs/<netz>/`, Plan 0009, Plan 0039). Den VRR-Feed sucht er über die CKAN-API von opendata-oepnv.de (jüngste `google_transit.zip`; monatliche „Beta“-Ausgabe, ein fehlender Monat schadet nicht, solange der Auszug gültig ist). Der VRR-Auszug braucht lokal etwa 17 s und bis 1,9 GB Speicher. Den Referenztag wählt er mit den Ferien des Netzes. Unverändert meldet er „Fahrplan aktuell“; neu schreibt er `data/oepnv/<netz>.json`, den man dann normal committet und pusht. Der Nachtlauf erneuert den Fahrplan nicht (ADR 0026 lässt ADR 0011 Nr. 4 unverändert). Anlass ist die Warnung von `pnpm data:validate`, der Auszug sei abgelaufen oder ein Fahrplanwechsel stehe an.

## 8. Vom Abo auf die API umsteigen

Das Abo-Token (`CLAUDE_CODE_OAUTH_TOKEN`) ist nur der Einstieg (N-H). Für die API bei Anthropic: Secret `ANTHROPIC_API_KEY` anlegen und in beiden Workflows statt `CLAUDE_CODE_OAUTH_TOKEN` an die Schritte mit Modell geben. `io/llm.ts` reicht den Schlüssel schon durch; geändert wird nur dort und in den Workflows. Ein anderer Anbieter bedeutet einen neuen Aufrufweg allein in `io/llm.ts` (gleiche Schnittstelle `LlmCall`/`LlmResult`, `llm.test.ts`) und einen Eval-Lauf vor dem Umstellen.

## Abschlussbericht im Chat

- Ampel der letzten Läufe und jede rote Ursache
- jede Quelle mit `fehler` samt Grund und jeder zurückgehaltene Einbruch
- neue, zurückgenommene und von Hand geänderte Anbieter
- Kosten der Läufe, wenn auffällig
- offene Pflegepunkte
