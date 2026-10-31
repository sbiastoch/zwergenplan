# musikfuechse-2026-10-31

Art: html, Falle: fremder-ort, synthetisch: nein (Text echt, Katalogauszug von Hand auf den Stand vor 563de13 gesetzt)

## Prüfung

Alle 22 Kursblöcke der Seiten Babys und Kleinkinder (je Kursnummer, Kursort, Einzeltermine, „Kurs buchen“ bzw. „AUSGEBUCHT“) gegen den Text geprüft, Termine im Fenster 31.10.2026–31.10.2027:

- **offers** (Kraftshof, Kürzel N-/KH): 10 Angebote, 50 Termine. Vier laufende Kurse ab 14./15.09. (je 2 Termine im Fenster: 09./16.11. bzw. 10./17.11.), fünf neue ab 23./24.11. (je 8 Termine bis 25./26.01.27) und Musikzwerge I Mo 15:30 ab 14.09. (26-KH-K1-06, AUSGEBUCHT, 2 Termine).
- **excluded** (Fürth-Poppenreuth, Kürzel F-/PP): 12 Kurse, 60 Termine. Baby I/II und Baby I+II donnerstags ab 17.09. (je 2) und ab 26.11. (je 8), Musikfüchse I Di 15:30 und I & II Di/Do 16:30 ab 15./17.09. (je 2) und ab 24./26.11. (je 8). Titel aus dem Bestand.
- Workshops: kein Termin im Fenster (Babykirchenlieder 15.10.25 in St. Michael, Fürth, liegt zurück; Herbst-/Winterzauber „in Planung“, Ort „tbd“).

Kein Kraftshof-Beginn fällt auf einen Poppenreuth-Beginn (Kraftshof Mo/Di vormittags und Mo 15:30, Poppenreuth Do sowie Di 15:30/16:30). „Fehlverortet“ trifft also nur Poppenreuth-Kurse.

## Katalogauszug

Der Schnappschuss `catalog` ist der Eintrag vor Commit 563de13: Ort `musikfuechse-poppenreuth` entfernt, die beiden Hinweise wieder „Kursort-Kürzel 'N-' vs 'F-' zum Filtern nutzen; nur Kraftshof-Kurse liegen in Nürnberg“, die Notizen wieder „Nur Kraftshof-Kurse liegen in Nürnberg …“ und „Ort Pfarrscheune Fürth-Poppenreuth: Fürth, nicht Nürnberg“, `verified` 2026-10-04. Geprüft: Der so hergeleitete Auszug ist gleich dem Schnappschuss von `musikfuechse-2026-10-11` vor dessen Änderung am 2026-10-31.

## Korrekturen gegenüber dem Bestand

- Die 12 Poppenreuth-Kurse stehen im Bestand in `offers` (Ort `musikfuechse-poppenreuth`, seit 563de13). Hier stehen sie in `excluded`, weil der Auszug den Ort nicht hat.
- Die vier laufenden Kraftshof-Babykurse ab 14./15.09. haben im Bestand `availability.status` „unbekannt“; laut Text steht „Kurs buchen“ dabei, nach dem Katalog also „frei“ (wie alle anderen Kurse mit „Kurs buchen“ und wie im Fall `musikfuechse-2026-10-11`).

## Grenzfälle

- Die Hinweise vor 563de13 fordern ausdrücklich zum Filtern nach dem Kürzel auf. Die Falle ist damit leichter als ein fremder Ort ohne Hinweis; sie misst, ob das Modell dem Hinweis folgt oder die Kurse dem Hauptort zuschlägt (so geschehen im ersten Eval des Falls vom 2026-10-11).
- Kopf von 26-PP-B1-07 nennt veraltet „21.05. bis 23.07.2026“, die Terminliste darunter „ab November 2026“ (26.11.–04.02.27). Maßgeblich ist die Liste.
- 26-PP-K1-11: erster Termin „Di, 24.11.26 1630 Uhr“ (Tippfehler) als 16:30 gewertet.
- Musikfüchse I & II (18 Monate bis 4,5 Jahre) wie im Bestand aufgenommen; sie stehen ohnehin in `excluded`.
