# musikfuechse-2026-10-11

Art: html, Falle: keine, synthetisch: nein

## Prüfung

Alle zehn Kraftshof-Kurse (vier laufende ab 14./15.09., sechs neue ab 23./24.11.) gegen die Terminlisten auf den Seiten Babys und Kleinkinder geprüft: Wochentag, Uhrzeit, Einzeltermine samt Herbst- und Weihnachtspause, Status („Kurs buchen“ = frei, „AUSGEBUCHT“ = ausgebucht bei 26-KH-K1-06). Die Workshops haben keinen Termin im Fenster (Babykirchenlieder 15.10.25, Herbst-/Winterzauber „in Planung“ ohne Datum).

## Korrekturen gegenüber dem Bestand

keine

## Grenzfälle

- Kurse in Fürth-Poppenreuth (Kürzel „F-“, z. B. Baby I 26-PP-B1-06 Do 10:30 ab 26.11., Kleinkinder Di/Do 15:30/16:30) fehlen im Bestand. Der Katalog hat dafür einen Ort `musikfuechse-pfarrscheune-fuerth-poppenreuth`, aber der Hinweis an den Seiten sagt „nur Kraftshof-Kurse liegen in Nürnberg“ und der Ort trägt „Fürth, nicht Nürnberg“. Der Prompt spricht dagegen von „Nürnberg und Umgebung“. Bestand gelassen (nur Kraftshof), weil der Katalog-Hinweis ausdrücklich zum Filtern nach dem Kürzel auffordert. Im ersten Eval (haiku und sonnet) nahmen beide Modelle die Fürther Kurse auf (78 Termine, Präzision 45 %). **Offen für den Nutzer:** Gehören die Fürther Kurse in die App? Ja → Hinweis im Katalog streichen und hier ergänzen; nein → Ort aus dem Katalog nehmen oder den Prompt schärfen.
- Der Kurs „Musikfüchse I & II“ (Fürth) ist ohnehin für 18 Monate bis 4,5 Jahre ausgeschrieben; er wäre auch bei Aufnahme der Fürther Kurse ein Grenzfall.

- 2026-10-11: Nutzerentscheid „nur Nürnberg“: Ort Pfarrscheune Fürth-Poppenreuth aus dem Katalog und aus dem Schnappschuss `catalog` entfernt. Fürther Kurse sind damit kein gültiger Ort mehr; `expected.json` bleibt unverändert (nur Kraftshof).
- 2026-10-31: Nutzerentscheid 2026-10-30 „Ort in anderer Region zulässig“: Poppenreuth ist wieder im Katalog (563de13, Ort `musikfuechse-poppenreuth`). Der Schnappschuss `catalog` hat jetzt den heutigen Eintrag (zweiter Ort, Hinweise „'N-Kraftshof' = Ort musikfuechse, 'F-Poppenreuth' = Ort musikfuechse-poppenreuth“, Notizen, `verified` 2026-10-30). `expected.json` hat die 12 Fürther Kurse dazu (Ort `musikfuechse-poppenreuth`, 78 Termine im Fenster: je 5 für die laufenden Kurse ab 15./17.09., je 8 für die Kurse ab 24./26.11.; Status „frei“, bei allen steht „Kurs buchen“; IDs und Titel aus dem Bestand vom 2026-10-31). Zusammen sind es 22 Angebote mit 143 Terminen. Gegen den Text dieses Falls geprüft; Musikfüchse I & II (18 Monate bis 4,5 Jahre) wie im Bestand aufgenommen. **Frühere Ergebnisse dieses Falls sind deshalb nicht mehr vergleichbar.** Den Katalogstand ohne Poppenreuth prüft jetzt `musikfuechse-2026-10-31` (Falle `fremder-ort`).
