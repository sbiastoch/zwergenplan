# Eval-Ergebnisse

Ergebnisse der Evals (Plan 0032, E9): Entdecken neuer Anbieter und Extraktion der Termine.

## Entdecken

Eine Zeile je Entdecken-Eval (`pnpm pipeline discover --dry-run --hide …`, Plan 0032, E9): bekannte Anbieter werden für einen Trockenlauf aus dem Katalog ausgeblendet. **Wiedergefunden**: würde aufgenommen. **Gefunden**: von einer Quelle (Sammelkalender, Verzeichnis, Websuche) als Kandidat geliefert, gleich ob danach aufgenommen, verworfen, im Vorfilter gelandet oder nicht bewertet; misst die Breite der Quellen, „Wiedergefunden“ den ganzen Weg (Bericht: alles außer „nicht gefunden“). **Falsch aufgenommen**: aufgenommen, nicht ausgeblendet und von Hand als falsch beurteilt; **neu** sind aufgenommene, nicht ausgeblendete und passende Anbieter. Modell `LLM_MODEL_DISCOVER` für Suche und Bewerten, `LLM_MODEL_EXTRACT` für den Ertragsbeweis.

| Datum | Modell | Ausgeblendet | Wiedergefunden | Gefunden | Nicht gefunden | Falsch aufgenommen | Neu | Aufrufe | Kosten (USD, Schätzung) | Dauer | je Anbieter |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | haiku | 10 | 2 | 6 | 4 | 0 | 1 (donum-vitae-nuernberg) | 46 | $0.81 (Suche $0.74) | 15 Min. | brk-familienzentrum aufgenommen (über die PEKiP-Seite); zoff-harmonie aufgenommen (über das Verzeichnis der kath. Stadtkirche); cvjm-gostenhof-miniclub verworfen (Ertragsbeweis ohne künftigen Termin); djk-eibach, post-sv-nuernberg, schwimmschule-baer-ritterbad verworfen (Kursort ohne Postadresse: Turnhalle bzw. Bad nur mit Namen); die-familienbox, ev-suedstadt-krabbelgruppen, hebamme-elena-paulus, musikfuechse nicht gefunden |

## Extraktion

Eine Zeile je Lauf von `pnpm eval` über alle Fälle in `evals/cases/`. Bewertet wird nach dem Expandieren mit der Build-Funktion des Nachtlaufs. Neue Zeilen hängt `pnpm eval` ans Dateiende; diese Tabelle bleibt deshalb die letzte.

- **Prompt-Hash**: sha256 über Prompt und Antwortschema (`EXTRACT_KEY_PARTS`), 12 Zeichen. `pnpm data:validate` warnt, wenn der aktuelle Hash hier fehlt.
- **Modell**: `haiku` heißt ohne Fallback (Modell allein); `haiku (Fallback sonnet)` ist die Konfiguration des Nachtlaufs.
- **Fälle gültig**: Antwort bestand die Prüfung (ggf. nach der einen Wiederholung). **Aufrufe gültig**: Anteil der Modellaufrufe mit gültiger Antwort.
- **Termine R/P**: Recall und Präzision der Termine (Zuordnung 1:1 über Ort und Beginn, nur Termine im Fenster des Falls), Mikro-Mittel über alle Fälle. Ein ungültiger Fall zählt mit 0 Treffern.
- **Angebote R/P**: Angebote, die über gemeinsame Termine einander zugeordnet sind.
- **format … category**: Feldtreffer je zugeordnetem Angebotspaar (Platzstand = `availability.status`, topics als Menge, `category` exakt; Plan 0037, E10). Zeilen vor Plan 0037 haben in `category` „–“.
- **Kat. ohne Thema**: Anteil der vorhergesagten Angebote, deren `category` zu keinem ihrer Themen passt (Plan 0037, E10).
- **Kosten**: Schätzung der CLI zum API-Gegenwert, nicht der Abo-Preis. **Dauer**: Summe der Aufrufdauern (Fälle laufen parallel).
- **je Fall**: Termine R/P in Prozent; bei Fällen ohne erwartete Termine `FP n` = n falsch positive Termine.

| Datum | Modell | Prompt-Hash | Fälle gültig | Aufrufe gültig | Termine R | Termine P | Angebote R | Angebote P | format | Platzstand | cost | registration | topics | category | Kat. ohne Thema | Kosten (USD, Schätzung) | Dauer | je Fall (Termine R/P in %, FP = falsch positive Termine) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | sonnet | `8af502812b3a` | 12/12 | 12/12 | 98 % | 99 % | 98 % | 90 % | 91 % | 96 % | 94 % | 96 % | 47 % | – | – | $0.44 | 173 s | die-familienbox 100/100; ev-fischbach 100/100; ev-langwasser-miniclubs 85/85; ev-st-andreas-thon 88/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/100; nuebad-flipper FP 0; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 95/100; sv-johannis-07 FP 0 |
| 2026-10-11 | haiku | `8af502812b3a` | 12/12 | 12/12 | 97 % | 89 % | 94 % | 74 % | 94 % | 82 % | 100 % | 96 % | 47 % | – | – | $0.13 | 467 s | die-familienbox 96/100; ev-fischbach 95/100; ev-langwasser-miniclubs 100/100; ev-st-andreas-thon 100/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/45; nuebad-flipper FP 0; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 95/98; sv-johannis-07 FP 0 |
| 2026-10-11 | haiku | `8af502812b3a` | 12/12 | 25/25 | 91 % | 95 % | 93 % | 88 % | 92 % | 82 % | 100 % | 96 % | 46 % | – | – | $0.12 | 579 s | die-familienbox 85/100; ev-fischbach 95/100; ev-langwasser-miniclubs 96/59; ev-st-andreas-thon 100/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/100; nuebad-flipper FP 0; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 100/85; sv-johannis-07 FP 0 |
| 2026-10-11 | sonnet | `8af502812b3a` | 12/12 | 25/25 | 99 % | 89 % | 98 % | 72 % | 91 % | 100 % | 94 % | 96 % | 25 % | – | – | $1.59 | 317 s | die-familienbox 100/100; ev-fischbach 100/100; ev-langwasser-miniclubs 96/87; ev-st-andreas-thon 100/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/45; nuebad-flipper FP 0; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 95/100; sv-johannis-07 FP 0 |
| 2026-10-12 | haiku | `7b31b918b80b` | 12/12 | 25/25 | 99 % | 95 % | 96 % | 85 % | 94 % | 87 % | 100 % | 96 % | 69 % | 100 % | 3 % | $0.14 | 565 s | die-familienbox 100/100; ev-fischbach 95/100; ev-langwasser-miniclubs 85/40; ev-st-andreas-thon 100/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/100; nuebad-flipper FP 0; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 95/98; sv-johannis-07 FP 0 |
| 2026-10-12 | haiku | `7b31b918b80b` | 12/12 | 25/25 | 89 % | 86 % | 91 % | 92 % | 94 % | 94 % | 100 % | 96 % | 65 % | 96 % | 4 % | $0.08 | 579 s | die-familienbox 85/79; ev-fischbach 95/100; ev-langwasser-miniclubs 96/87; ev-st-andreas-thon 81/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/100; nuebad-flipper FP 0; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 100/85; sv-johannis-07 FP 0 |
| 2026-10-18 | haiku | `0e9f8910c248` | 11/12 | 24/25 | 43 % | 97 % | 50 % | 87 % | 100 % | 100 % | 100 % | 93 % | 48 % | 100 % | 0 % | $0.33 | 2016 s | die-familienbox fehler; ev-fischbach 95/100; ev-langwasser-miniclubs 96/76; ev-st-andreas-thon 100/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/100; nuebad-flipper FP 0; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 95/98; sv-johannis-07 FP 0 |
