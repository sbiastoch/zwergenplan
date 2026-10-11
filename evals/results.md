# Eval-Ergebnisse

Eine Zeile je Lauf von `pnpm eval` über alle Fälle in `evals/cases/` (Plan 0032, E9). Bewertet wird nach dem Expandieren mit der Build-Funktion des Nachtlaufs.

- **Prompt-Hash**: sha256 über Prompt und Antwortschema (`EXTRACT_KEY_PARTS`), 12 Zeichen. `pnpm data:validate` warnt, wenn der aktuelle Hash hier fehlt.
- **Modell**: `haiku` heißt ohne Fallback (Modell allein); `haiku (Fallback sonnet)` ist die Konfiguration des Nachtlaufs.
- **Fälle gültig**: Antwort bestand die Prüfung (ggf. nach der einen Wiederholung). **Aufrufe gültig**: Anteil der Modellaufrufe mit gültiger Antwort.
- **Termine R/P**: Recall und Präzision der Termine (Zuordnung 1:1 über Ort und Beginn, nur Termine im Fenster des Falls), Mikro-Mittel über alle Fälle. Ein ungültiger Fall zählt mit 0 Treffern.
- **Angebote R/P**: Angebote, die über gemeinsame Termine einander zugeordnet sind.
- **format … topics**: Feldtreffer je zugeordnetem Angebotspaar (Platzstand = `availability.status`, topics als Menge).
- **Kosten**: Schätzung der CLI zum API-Gegenwert, nicht der Abo-Preis. **Dauer**: Summe der Aufrufdauern (Fälle laufen parallel).
- **je Fall**: Termine R/P in Prozent; bei Fällen ohne erwartete Termine `FP n` = n falsch positive Termine.

| Datum | Modell | Prompt-Hash | Fälle gültig | Aufrufe gültig | Termine R | Termine P | Angebote R | Angebote P | format | Platzstand | cost | registration | topics | Kosten (USD, Schätzung) | Dauer | je Fall (Termine R/P in %, FP = falsch positive Termine) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | sonnet | `8af502812b3a` | 12/12 | 12/12 | 85 % | 87 % | 81 % | 70 % | 90 % | 100 % | 100 % | 96 % | 63 % | $1.65 | 232 s | die-familienbox 96/100; ev-fischbach 100/100; ev-langwasser-miniclubs 85/85; ev-st-andreas-thon 100/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/45; nuebad-flipper 0/–; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 95/100; sv-johannis-07 FP 8 |
| 2026-10-11 | haiku | `8af502812b3a` | 12/12 | 12/12 | 86 % | 88 % | 81 % | 74 % | 94 % | 83 % | 100 % | 96 % | 42 % | $0.23 | 442 s | die-familienbox 96/100; ev-fischbach 95/100; ev-langwasser-miniclubs 100/100; ev-st-andreas-thon 100/100; familienwerkstatt-beispiel 100/100; hebamme-mainberger-praenatal 100/100; klangwiese-beispiel FP 0; musikfuechse 100/45; nuebad-flipper 0/–; staatstheater-nuernberg-familie FP 0; stadtteilhaus-fisch 100/85; sv-johannis-07 FP 0 |
