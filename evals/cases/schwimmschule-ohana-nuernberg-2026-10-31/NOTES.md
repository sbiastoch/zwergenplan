# schwimmschule-ohana-nuernberg-2026-10-31

Art: html, Falle: fremder-ort, synthetisch: nein

## Prüfung

Die drei Kursolino-Seiten (Babys id=20290, Minis id=20291, Maxis id=20292) tragen die Termine nur im JSON-LD: je Kursinstanz Name mit Standortkürzel, Datum und Uhrzeit („NDE-14.11.-9.30-…“), `start` (nur Datum), `end`, Standort mit Adresse und Verfügbarkeit. Der Text darunter ist das leere Gerüst („Kurse werden geladen…“). Alle 42 Instanzen geprüft, Fenster 31.10.2026–31.10.2027. Bei allen liegt `end` eine ganze Zahl von Wochen nach `start`; Termine wie im Bestand wöchentlich von `start` bis `end` zur Uhrzeit aus dem Namen.

- **offers** (Kliniken Dr. Erler, Kürzel NDE, einziger Ort des Katalogauszugs): 10 Angebote, 94 Termine, unverändert aus dem Bestand. Babys Sa 9:30 (14.11., 23.01.) und 10:15 (14.11., 23.01., 20.03.), Minis Sa 9:30 (14.11., 20.03.), Maxis Sa 11:00 (14.11., 23.01., 20.03.). Status gegen `availability` geprüft (SoldOut = ausgebucht, InStock = frei).
- **excluded** (alle anderen Standorte): 32 Kurse, 305 Termine. Physio Aktiv Burgfarrnbach, Fürth (FBU, Sa, 9 Kurse), Klinikum Bamberg (BKL, Fr, 4), Klinik Wartenberg (WAB, So, 6), Klinikum Erding (KKE, So, 10), Medical Park Bad Feilnbach (BFR, Sa, 3). Titel von Hand gebildet aus Gruppe, Wochentag, Uhrzeit, Start und Standort.

Kein NDE-Beginn (Sa 9:30/10:15/11:00) fällt auf einen Beginn eines anderen Standorts (Sa 14:50/15:20/15:30/15:50, Fr, So). „Fehlverortet“ trifft also nur fremde Kurse.

## Katalogauszug

Unverändert der heutige Eintrag: ein Ort (Kliniken Dr. Erler). Kein anderer Standort steht im Katalog, auch nicht als eigener Anbieter. Herausgenommen wurde nichts. Burgfarrnbach liegt in der Region Fürth; er ist ein Hinweis für die Katalogpflege, für diesen Fall aber ein fremder Ort.

## Korrekturen gegenüber dem Bestand

keine (10 Angebote bestätigt; `excluded` neu)

## Grenzfälle

- Die Hinweise an den Terminseiten sagen „Nürnberg = Präfix 'NDE' / 'Kliniken Dr. Erler'“. Wie bei musikfuechse ist die Falle damit leichter als ein Ort ohne Hinweis.
- Einzeltermine stehen nicht auf der Seite (sie kommen per Skript). Die wöchentliche Reihe von `start` bis `end` übernimmt die Lesart des Bestands, auch über Feiertage (26.12., 02.01., 27.03.). „Preisanpassung für Resttage“ deutet an, dass einzelne Termine abweichen können.
- Bad Feilnbach 24.10.: Kurs begann vor dem Fenster, nur 7 Termine im Fenster.
- Maxis ab 2 Jahre: wie im Bestand aufgenommen (unter 3 möglich).
