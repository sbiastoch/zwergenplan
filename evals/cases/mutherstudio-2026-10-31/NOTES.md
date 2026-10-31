# mutherstudio-2026-10-31

Art: html (5 Seiten; der Canva-Kursplan ist per robots.txt gesperrt und fehlt), Falle: keine (Gegenfalle zu `fremder-ort`, Plan 0049, Nachtrag 2, C), synthetisch: nein

## Gegenfall-Eigenschaft

Seite 1 (`baby-and-kinderkurse-12-36-monate`) trägt den Titel „Baby- & Kinderkurse | MUTHERSTUDIO | Nürnberg, Fürth, Erlangen“. Fürth und Erlangen sind dort nur ein SEO-Titel. Alle Angebote finden im Studio statt (Kraftshofer Hauptstraße 181, Katalogort `mutherstudio`) oder am Treffpunkt „Spielplatz Schiestlstraße Kraftshof“ (Katalogort `mutherstudio-spielplatz-schiestlstrasse`). Alle Angebote müssen bleiben.

## Prüfung

Jede Seite gelesen und die Termine nachgezählt.
- Mama-Baby-Yoga (Seite 2): „Mittwochs 16.09–04.11.26 (8 Einheiten)“ hat im Fenster nur noch den 04.11. „Mittwochs 11.11.26–30.12.2026 (8 Einheiten)“ ergibt genau 8 aufeinanderfolgende Mittwoche (11.11. bis 30.12.), 10:45, 129 €, Anmeldung per Mail. Daher `unbekannt`, `kurs`. Das stimmt mit dem Bestand überein.
- Waldspielracker (Seite 4), Herbst: „8x Dienstags 22.09–24.11.2026 (kein Kurs in den Ferien)“, 10:00. Mit `count: 8` ab 22.09., ohne den 03.11. (Herbstferien), fallen die letzten beiden Termine auf den 10.11. und 17.11. Winter: „8x Dienstags 01.12.–02.03.“ ohne den 22.12., 29.12., 05.01., 12.01., 19.01. und 09.02. Das ergibt genau 8 Termine (01.12., 08.12., 15.12., 26.01., 02.02., 16.02., 23.02., 02.03.). Beide wie im Bestand. Die Kurse aus dem Frühjahr 2026 liegen in der Vergangenheit.
- Musikzwerge und Seite 1: ohne Termine.

## Korrekturen gegenüber dem Bestand

- Waldspielracker Herbst 2026 und Winter 2026/27: `venueId` von `mutherstudio` auf `mutherstudio-spielplatz-schiestlstrasse`. Der Text nennt den Treffpunkt ausdrücklich („Treffpunkt: Spielplatz Schiestlstraße Kraftshof“), und der Auszug enthält diesen Ort. Nach der Prompt-Regel gilt der Hauptort nur, wenn der genannte Treffpunkt nicht im Auszug steht.

## Grenzfälle

- **Mama, Mini & Mental Health** (Seite 3 und 5, ca. 0–18 Monate, „6x Mittwochs 23.09.26–25.11.26, 09:30–10:30, kein Kurs an Ferien & Feiertagen“, „nur noch wenige Plätze“) steht nicht im Soll, wie im Bestand. Die Angabe widerspricht sich: Zwischen 23.09. und 25.11. liegen ohne den 04.11. (Herbstferien) und den 18.11. (Buß- und Bettag) noch 8 Mittwoche, nicht 6. Liest man es wie die Prompt-Regel („6 Termine ab …“ = `count: 6`), endet der Kurs am 28.10., also vor dem Fenster. Ein Modell, das stattdessen bis 25.11. ausrollt, bekommt 2 Termine (11.11., 25.11.) als Fehltreffer. Das ist bewusst hingenommen, weil dieselbe Lesart (`count` vor Enddatum) auch beim Waldspielracker gilt.
- Waldspielracker Herbst: Nach dem Enddatum „24.11.“ wäre auch der 24.11. ein Termin. Wie oben gilt `count: 8`, daher ist der 17.11. der letzte Termin.
- Mama-Baby-Yoga: Der Kurs Nov.–Dez. läuft auch am 18.11. (Buß- und Bettag) und am 23./30.12. (Weihnachtsferien). Der Text nennt genau 8 Einheiten vom 11.11. bis 30.12. und keine Ferienpause.
