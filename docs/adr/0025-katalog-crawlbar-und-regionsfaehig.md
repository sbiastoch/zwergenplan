# ADR 0025 – Katalog crawlbar und regionsfähig

Status: angenommen (2026-10-10), mit Plan 0031. Ergänzt ADR 0003 (Geo-Prüfung je Region statt fester bbox), ADR 0006 (Katalogformat) und ADR 0024 (`notes` ist Protokoll; `adapter` wird für `aggregator` Pflicht).

## Kontext

- Der nächtliche Crawler (Plan 0015) braucht einen Katalog, aus dessen Feldern hervorgeht, welche Seite er wie abruft und wozu. Heute steht das als Freitext in `programme[].note` (222 von 223 Einträgen) und `notes`, gemischt mit Rechercheprotokoll und veraltenden Inhalten.
- Freitext im Prompt und im Cache-Schlüssel des Crawlers hieße: Jede Pflegeänderung löst eine neue Extraktion aus, und veraltete Angaben widersprechen „Werte werden nie geraten“.
- Die App soll später weitere Regionen tragen (Nutzer, 2026-10-10: „zum Beispiel Düsseldorf oder Oldenburg“). Der Datenvertrag prüfte Orte fest gegen die Nürnberger bbox und trug mit `ring` (Abstand zur Nürnberger Stadtmauer) Nürnberg-Semantik, die niemand las.

## Entscheidung

1. **Regionen** stehen in `src/domain/regions.ts` (heute nur `nuernberg`, mit Name und bbox). Jeder Katalog-Eintrag hat das Pflichtfeld `region`; das Schema prüft die Orte eines Anbieters gegen die bbox seiner Region. Keine Präfixe in IDs (ADR 0022, Punkt 5). Weitere Region-Felder (Ferienland, ÖPNV, Kamera) kommen mit der zweiten Region.
2. **`ring` entfällt.**
3. **Programmeinträge sind ausführbar**: `kind` (Format), `render: browser`, `use` (`termine | verfuegbarkeit | info`), `request` (POST mit JSON-Body), `blocked` (nur mit Abrufbeleg; der Anbieter ist dann bewusst ohne diese Quelle), `hint` (Extraktionshinweis ohne Datum), Platzhalter `{von}`/`{bis}` in URL und Body. `note` und `kind: js` entfallen.
4. **`Venue.hint`** trägt Ortshinweise für den Crawler.
5. **`notes` ist Protokoll für Menschen.** Der Crawler liest es nicht, weder im Prompt noch im Cache-Schlüssel. Was er braucht, steht in `hint`, `Venue.hint` und `availability.how`/`system`.
6. **`aggregator` verlangt `adapter`.** Ein Sammelkalender ohne Adapter ist `verzeichnis`. `coveredBy` auf einen evtermine-Kalender verlangt eine `vid` in den Programm-URLs. In URLs und Bodies von Sammelkalendern stehen keine Platzhalter; ihr Fenster setzt der Adapter.
7. **Was der Crawler abruft, entscheidet die Rolle:** `programme` nur von `anbieter` ohne `coveredBy` und ohne `skipCrawl`; `aggregator` nur über ihren `adapter` (ihr `programme` ist Doku); `verzeichnis` nie. Innerhalb eines abgerufenen Anbieters entscheidet `use`.
8. **`skipCrawl: { reason, since }`** am `anbieter`: bewusst nicht crawlen, weil er keine Termine veröffentlicht; er bleibt in der Anbieterübersicht (Nutzerentscheid 2026-10-10). Ohne `coveredBy` und ohne `skipCrawl` braucht ein Anbieter eine Seite `use: termine` ohne `blocked`.
9. Orte bleiben denormalisiert am Anbieter (ADR 0024).

## Alternativen

- **Freitext behalten, der Crawler-Prompt liest alles**: kein Umbau, aber instabiler Cache und veraltete Daten im Prompt.
- **Abrufkonfiguration in eine eigene Datei je Anbieter**: trennt Pflege und Abruf, verdoppelt aber die Stelle, an der eine Programm-URL steht.
- **Region aus den Koordinaten ableiten**: kein Feld, aber eine Region braucht dann überlappungsfreie bboxes, und Sammelkalender ohne Orte hätten keine Region.
- **Region als Präfix der IDs**: widerspricht ADR 0022 (Katalog-IDs werden nie umbenannt).

## Konsequenzen

- Die Migration von 223 Programmeinträgen braucht Urteil; sie läuft über Subagenten mit Prüfskript (Plan 0031, E6).
- Plan 0015 bekommt Nachtrag B: Abruf nach `render`/`use`/`blocked`, Prompt mit `hint`, Cache-Schlüssel ohne `notes`.
- Eine zweite Region braucht: Eintrag in `regions.ts`, Katalog-Einträge mit `region`, und die Folgearbeiten außerhalb des Datenvertrags (Fahrplan, Stadtteile, Texte, Feiertage; `docs/ideas.md`).
