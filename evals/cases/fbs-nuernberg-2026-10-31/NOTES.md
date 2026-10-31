# fbs-nuernberg-2026-10-31

Art: html, gross (12 Seiten, rund 305 000 Zeichen, 6 Kandidaten), Falle: keine (Gegenfalle zu `fremder-ort`, Plan 0049, Nachtrag 2, C), synthetisch: nein

## Gegenfall-Eigenschaft

Der Text nennt Fürth oft, aber nie als Kursort:
- jede Ortsangabe am Haupthaus lautet „Südl. Fürther Str. 20, 90429 Nürnberg“, die Kopfzeile „Südliche Fürther Str. 20, 90443 Nürnberg“;
- die Kochkurse und das Abenteuerturnen nennen den Förderer: „finanziert über das Amt für Ernährung, Landwirtschaft und Forsten in Fürth“ bzw. „… Forsten Fürth“.

Alle Angebote im Fenster finden an Katalogorten statt: im Haupthaus (`fbs-nuernberg`), im Gemeindehaus Thomaskirche Großreuth (`fbs-nuernberg-gemeindehaus-thomaskirche`), am Waldracker Schiestlstraße (`fbs-nuernberg-waldracker`) und am Parkplatz Steinbrüchlein (`fbs-nuernberg-wald-angebot-steinbruechlein`). Sie müssen alle bleiben.

## Zuschnitt

Der Text bleibt vollständig. Nur das Fenster in `expected.json` ist verkürzt, auf **2026-10-31 bis 2026-12-20**, also das Herbsthalbjahr bis vor die Weihnachtsferien. Gründe:
- Das ganze Jahr hätte 71 Angebote mit 441 Terminen, von Hand nicht verlässlich prüfbar.
- Ab Januar rollt der Bestand die offenen Treffs (FamilienOase, BewegungsOase, Krabbelkäfer, MilchZeit) mit Wochenregeln bis zum Horizont aus. Diese Termine stehen nicht im Text und hängen an der Ferienlogik.
- Im Fenster stehen alle Termine als Einzeldaten im Text, entweder in der Kursliste oder auf den Suchseiten `?s=…`.

Die Kurse des Halbjahrs „a“ (ab Januar 2027) liegen außerhalb des Fensters und werden nicht bewertet.

## Prüfung

Die Kursblöcke (je „Kurs-Nr.“ mit Terminliste, Ort, Gebühr und Ampel) wurden mit einem Hilfsskript aus `input.json` gezogen und je Kurs-Nr. gegen die Beginnzeiten des Bestands im Fenster abgeglichen. Danach wurde jede Abweichung und jeder Kurs ohne Bestand von Hand im Text nachgelesen. Geprüft je Angebot:
- Ort: Thomaskirche, Waldracker und Steinbrüchlein haben eigene Katalogorte, die übrigen liegen im Haupthaus.
- Ampel: grün = `frei`, gelb = `wenige`, rot = `warteliste`, blau = `unbekannt` bzw. `ohne-anmeldung` bei offenen Treffs.
- Gebühr; Altersangabe; Format.

Ergebnis: 45 Angebote mit 179 Terminen.

Zu Recht nicht enthalten (im Fenster):
- ab 3 Jahren: Kinderturnen 3–6 (EKBE 0763 c, 0764 c), Eltern-Kind-Yoga Thomaskirche 3–6, „Große Künstler ganz klein“ 3,5–5, Zitronenblau 3–5 (EKKR 0601 c, 0603 c) und Grundschulalter;
- ohne Kind: HappyBauch (Schwangere), Babyschlaf & Fragerunde (20:00), Elterngeld-Infoabend;
- Nähkurse ab 8 und Nähmarathon;
- der Flohmarkt KinderSchätze (Basar).

## Korrekturen gegenüber dem Bestand

- **Abenteuerturnen:** Der Bestand führt zwei Angebote mit überlappenden Terminen. „Abenteuerturnen (1–3 Jahre, Freitag 15 Uhr)“ hat den 04.12. und 11.12., „Abenteuerturnen 1 für Kinder von 1–3 Jahren“ den 13.11., 20.11., 04.12. und 11.12. Die Dublette ist entfernt, es bleibt ein Angebot mit 4 Terminen. Das `format` ist von `kurs` auf `einmalig` geändert: Jeder Termin hat eine eigene Kurs-Nr. (EKSO 8004–8007 c) und wird einzeln gebucht („Termin: … von 15.00–16.00 Uhr“). „Anmeldung für das Ganze“ (`kurs`) trifft daher nicht zu.
- **MilchZeit – Stillcafé:** entfernt. Im Fenster hatte es nur den 02.12. und 16.12., die erfunden sind: Die MilchZeit ist 14-täglich, die Termine laut Text sind der 11.11., 25.11. und 09.12. Diese drei stehen im zweiten MilchZeit-Angebot.
- **FamilienOase:** Der 11.11. ist entfernt. Die Terminliste (EKFB 0062c, Suchseite `?s=FamilienOase`) nennt ihn nicht, denn an dem Tag findet „Laterne, Laterne“ im Rahmen der FamilienOase statt, mit Anmeldung, als eigenes Angebot. Konkrete Daten haben nach dem Prompt Vorrang vor der Wochenregel.
- **In einem kleinen Apfel** und **Mit Kleinkindern unterwegs (09:45)**: `cost` von `kostenpflichtig` auf `kostenlos`. Grund: „Der Kurs ist kostenlos“ bzw. „Die Teilnahme ist kostenlos“ und „Kursgebühr 0,00 €“. Die 3 € Materialgeld sind keine Kursgebühr. Das zweite Snack-Angebot (13:15, gleicher Text) war im Bestand schon `kostenlos`.
- **Mit Kleinkindern unterwegs (13:15)**: `topics` von `beikost` auf `beratung`, gleich wie beim Angebot um 09:45 mit identischem Text. Es geht um Zwischenmahlzeiten für Kinder von 1–3 Jahren, nicht um Beikost.
- **Neu: Bohnenpower am Sa 05.12.2026** (EKSO 0718 c, 10:00, belegt/rot → `warteliste`, „Die Teilnahme ist kostenfrei“). Der Text ist derselbe wie am 04.11. (EKSO 0717 c), und das Angebot vom 04.11. steht im Bestand. Ein eigenes Angebot ist es, weil der Status abweicht.

## Grenzfälle

- **Bohnenpower** („Kochen für Familien mit Kindern“) hat keine Altersangabe. Es bleibt drin wie im Bestand, weil es in der Liste der Eltern-Kind-Kurse steht. Ein Modell, das es weglässt, verliert 2 Termine.
- **Offene Treffs mit Ampel:** Die Suchseiten zeigen für Krabbelkäfer und BewegungsOase teils eine rote Ampel. Die Seiten der Treffs sagen aber ausdrücklich „ohne vorherige Anmeldung“, daher `ohne-anmeldung`. Ein „[Status: ampel red]“ ohne Text ist oft nur die Legende im Seitenkopf.
- **Kosten der offenen Treffs:** FamilienOase, BewegungsOase und MilchZeit (Unkostenbeitrag 3 €) sind `kostenpflichtig`, der Krabbelkäfer ist `kostenlos`. PapaZeit erleben hat „Kursgebühr 10,00 €“ und ist trotz „Teilnahme kostenfrei“ `kostenpflichtig`.
- **Kategorien:** ZwergenTanz 1/2 ist `musik` („ein musikalisches Angebot“, Lieder, Reime, Rhythmus), Alternative `bewegung`. Adventszeit (Kamishibai und Basteln) ist `kreativ`, Alternative `buecher`. Laterne ist `treffs-cafes` (im Rahmen der FamilienOase), Alternative `musik`.
- **nappydancers Do (EKBE 0803 c):** Der erste Termin beginnt um 14:45, die übrigen um 15:00, wie im Text.
- **Altersgrenze:** Angebote „ab 2 Jahren“ bzw. „2,5–6 Jahre“ (Adventszeit, Weihnachtswerkstatt, PapaZeit Spezial, Waldracker, Waldwichtel) bleiben, denn sie beginnen unter 3 Jahren.
