# ADR 0016 – Nächtliche Datenpipeline: ein Modellaufruf je Anbieter, Zustand im Repo, Eval-Gate

Status: Entwurf (2026-10-06), ergänzt ADR 0002, 0003, 0006 und 0011. Details und Begründungen in Plan 0015.

## Kontext
Bisher aktualisiert ein interaktiver Lauf in Claude Code die Daten (ADR 0002: lokal, Abo des Nutzers). Subagenten rufen dabei Seiten ab, folgen Links und schreiben Rohdaten für einen Horizont von 4 Monaten. Das teure Modell liest jedes Mal alle Seiten neu, es gibt keinen Zeitplan, und welches Modell wie gut extrahiert, ist nicht messbar. Gewünscht sind:
- jede Nacht aktuelle Daten
- alle veröffentlichten Termine
- wechselbare, auch kostenlose Modelle
- belastbare Evals
- ein einfacher Überblick über die Aktualität
- Einfachheit vor Kostenoptimierung

## Entscheidung
- **Nachtlauf in GitHub Actions** (`nightly.yml`, Cron): `pnpm pipeline run` und `publish`. Danach startet `gh workflow run ci.yml` die unveränderte CI, denn ein Push mit `GITHUB_TOKEN` löst sonst keinen Workflow aus (ADR 0002, Konsequenzen). Der lokale Skill wird ein Wartungslauf für Katalog, Eval-Fälle und Modellwechsel.
- **Ein Extraktionsweg:** Seiten holt deterministischer Code: HTML, iCal, JSON, PDF per `pdftotext`, JS per Playwright.
  - Der Katalog nennt jede Seite ausdrücklich, mit Platzhaltern `{von}`/`{bis}` (Monatsanfang) und optionalem `request`. Links werden nie verfolgt.
  - Je Anbieter gibt es **einen** Aufruf eines Sprachmodells ohne Werkzeuge, gestreamt, mit Validierung samt Build-Probelauf und einer Wiederholung.
  - Ein Titel-Anker im Code hält Titel und damit IDs stabil.
- **Modell als Konfiguration:** OpenAI-kompatibles `chat/completions` per `fetch` mit `stream: true`, ohne SDK. Endpunkt, Modell und Schlüssel kommen aus der Umgebung.
- **Zustand im Repo:** `data/raw/<providerId>.json` hält je Anbieter Events, Eingabe-Hash, Extraktor-Version, Modell, Status (`ok | keine-termine | fehler | ausstehend`) und Zeitstempel.
  - Gleiche Eingabe bedeutet kein Modellaufruf.
  - Eine feste Entscheidungstabelle regelt den Zustand je Anbieter.
    - Seitenfehler und ungültige Antworten → `fehler`.
    - Rate-Limit, Zeitbudget (harte Frist) und Ausfälle von Sammelkalendern, auch teilweise → `ausstehend`.
    - In beiden Fällen bleiben die alten Events stehen.
    - Ein Einbruch der Event-Zahl gilt erst nach Bestätigung in der Folgenacht.
  - `data/offers.json` entsteht wie bisher per `build`.
  - `data/raw` wird nie von Hand bearbeitet. Konflikte löst immer `pipeline build`.
- **Exit-Codes:**
  - `0`: normal.
  - `2`: sichern und rot melden. Das gilt bei mehr als 20 % Fehlern oder wenn die Live-Seite mehr als 1 Tag hinter `main` liegt. Eine rote CI nach dem Bot-Commit meldet GitHub sonst niemandem.
  - `1`: nichts sichern. Das gilt bei gescheitertem Gate, systemisch kaputtem Endpunkt, Bug im Gesamt-Build oder einem Push, der kein Fast-Forward ist. Einen Konfliktpfad gibt es nicht, die nächste Nacht wiederholt den Lauf.
- **Kein Erfassungshorizont:** Erfasst wird alles Veröffentlichte. Der Datenhorizont in `offers.json` ist fest heute + 12 Monate. Regeln ohne Ende werden bis dorthin fortgeschrieben.
- **Eval-Gate:** Der Nachtlauf startet nur, wenn `evals/results/` für genau dieses Modell, diese Extraktor-Version und diesen Endpunkt-Host ein Ergebnis über den Schwellen enthält.
  - Die Extraktor-Version ist ein Hash aus Prompt, Schema und `lib/extract-prompt.ts` (Eingabe-Bauer, Parsen, Validierung). Die Zustandslogik in `lib/refresh.ts` gehört nicht dazu.
  - Evals nutzen denselben Code wie der Nachtlauf, auf eingefrorenen Bausteinen der Eingabe.
- **Statusbericht** in `$GITHUB_STEP_SUMMARY` und per `pnpm pipeline status`: Ampel, Kennzahlen, Live-Stand, „Braucht Aufmerksamkeit“, Aktualität je Anbieter.
- **Umstieg im Schattenbetrieb:** Der Zustand liegt vorübergehend in `actions/cache`, bis `NIGHTLY_PUBLISH=1`.

## Abweichungen von bestehenden Festlegungen
- **ADR 0002:** Die Pipeline läuft nicht mehr lokal mit dem Abo des Nutzers, sondern in Actions. Der Push mit `GITHUB_TOKEN` startet die CI per `workflow_dispatch`.
- **ADR 0003:** Der Horizont ist nicht mehr „4 Monate“. Der Datenhorizont beträgt 12 Monate, die Erfassung ist unbegrenzt.
- **ADR 0006:**
  - Keine Subagenten-Pakete und keine Übernahme aus dem Altbestand mehr: `data/raw` hält die alten Events.
  - Das Rohformat liegt je Anbieter vor (`ProviderRaw`) statt je Paket.
  - Die Kursfortschreibung bleibt.
- **ADR 0011 Nr. 4:** `pipeline oepnv` läuft auch im Nachtlauf, nicht nur lokal. Der Feed-Cache liegt dann in `actions/cache`.
- **`docs/architecture.md`, „ein Datenvertrag“:** `data/raw` ist dauerhafter Zustand in `data/`, aber kein Vertrag der Website. Sein Schema liegt wie `RawBatch` in `scripts/pipeline/lib/raw.ts` und wird nach `schema/` exportiert. `scripts/validate-data.ts` darf dafür aus `scripts/pipeline/lib` importieren.

## Konsequenzen
- Jede Nacht ein Daten-Commit (Herzschlag). Er hält auch den Cron über die 60-Tage-Regel aktiv.
- Jede Änderung an Prompt, Schema oder `lib/extract-prompt.ts` verlangt ein neues, bestandenes Eval, bevor der Nachtlauf wieder läuft. CI warnt schon im PR.
- Seiten, die nur mit Interaktion lesbar sind, bleiben `fehler`, bis der Katalog eine lesbare Seite nennt.
- Ein echtes Saisonende erscheint einen Tag später (Einbruchschutz).
- Neue Laufzeitabhängigkeiten der Pipeline: Playwright (schon devDependency, nur in `scripts/pipeline/io/browser.ts`) und `pdftotext` (System). Kein neues npm-Paket.
- Die Modellwahl wird nach dem Basislauf (Plan 0015, Schritt 9) hier nachgetragen.
