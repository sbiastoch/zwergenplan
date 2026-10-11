# nuebad-flipper-2026-10-11

Art: json-api, Falle: keine, synthetisch: nein

## Prüfung

Die 13 Kurse der Kursorganizer-Antwort von UTC in Berliner Zeit umgerechnet und den zehn Bestandsangeboten zugeordnet (Mo 16:30/17:00/17:30 Baby, Do 16:30 Kind, Sa 10:15 Baby, Sa 10:45 ab 2 J., So 08:45/09:15 Baby, So 09:45 Kind, So 10:30 ab 2 J.); alle Langwasserbad, alle `freePlaces` 0 bzw. -1 mit `waitListCount` > 0, also `warteliste`. Die drei Kurse „Kleinkinderschwimmen ab 3 Jahre“ (Sa 11:30, So 11:15, So 12:00) fallen nach „Angebote erst ab 3 Jahren“ zu Recht weg.

## Korrekturen gegenüber dem Bestand

keine

## Grenzfälle

- Die API liefert je Kurs nur `startDateTime` des ersten Termins (21.–27.09.2026, vor dem Fenster), keine Terminzahl, kein Ende und keine Ferien. Die Folgetermine im Bestand (je 9 im Fenster bis Mitte/Ende Dezember, Pause in den Herbstferien, sonntags auch 08.11. ausgelassen) lassen sich aus input.json nicht belegen. Bestand gelassen; ein Modell, das nichts rät, kann diese Termine nicht treffen.
- Topics von „Mutter/Vater-Kleinkind-Schwimmen“ (12–24 Mon.): Bestand `kleinkindschwimmen` + `babyschwimmen`, vertretbar, gelassen.
