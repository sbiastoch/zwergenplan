# hebamme-kobielski-2026-10-31

Art: html (Onepager), Falle: keine (Gegenfalle zu `fremder-ort`, Plan 0049, Nachtrag 2, C), synthetisch: nein

## Gegenfall-Eigenschaft

Titel und Kopfzeile nennen das Einzugsgebiet der Hebamme: „Langwasser / Altenfurt / Moorenbrunn / Fischbach / Feucht / Gartenstadt / Zollhaus / Kettelersiedlung / Kornburg / Worzeldorf / Weiherhaus / Hasenbuck / Dutzendteich / Glockenhof“. Feucht liegt außerhalb Nürnbergs, und der Lebenslauf nennt die „Uni-Klinik Erlangen“. Keiner dieser Orte ist ein Kursort. Die Kurse stehen unter „Kurse in der Praxis“ und finden in der Praxis statt, also am Katalogort `hebamme-kobielski` (Glogauer Straße 15, Langwasser). Beide Angebote müssen bleiben.

## Prüfung

Den ganzen Text gelesen. „Kurse in der Praxis“ nennt:
- Babymassage, montags 10:00–10:45, Anmeldung über Kontaktformular, „keine Kassenleistung“. Aufgenommen.
- Mama Fitness, montags 09:30–10:30, „kein Babysitter benötigt“, das Baby ist also dabei. Aufgenommen.
- Erste-Hilfe-Kurse, Rückbildungskurs: ohne Zeiten, kein Angebot im Horizont.
- Schwangerschaftsgymnastik (Di 18:00) und Pre- & Postnatal Yoga (Fr 18:00): für Schwangere bzw. ohne Hinweis auf ein Kind, weggelassen.

Beide Angebote haben nur Wochenzeiten ohne Startdatum. Nach dem Prompt ist das `regelmaessig` mit einer Wochenregel ab heute. Der erste Montag im Horizont ist der 02.11.2026, es gibt 52 Termine bis 25.10.2027. `skipHolidays` ist `false`, denn der Text nennt keine Ferienpause und es ist kein offener Treff. Die Termine des Bestands stimmen damit überein. Status `unbekannt` (Anmeldung über Kontaktformular), `kostenpflichtig` („keine Kassenleistung“).

## Korrekturen gegenüber dem Bestand

- Babymassage-Kurs (montags 10:00): `format` von `kurs` auf `regelmaessig`. Es gibt kein Start- oder Enddatum, daher greift die Prompt-Regel „Laufende Kurse mit Wochenzeiten, aber ohne Startdatum: `regelmaessig`“, genau wie bei Mama Fitness im Bestand.

## Grenzfälle

- Mama Fitness: Kategorie `bewegung`, Thema `fitness-mit-baby`. Grund ist „kein Babysitter benötigt“, das Baby ist also dabei.
- Termine an Feiertagen (Ostermontag 29.03.2027, Pfingstmontag 17.05.2027) bleiben drin. Ohne „nicht in den Ferien“ gilt `skipHolidays: false`. Ein Modell, das Feiertage auslässt, verliert 2 bis 3 Termine je Angebot.
