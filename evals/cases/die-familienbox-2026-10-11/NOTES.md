# die-familienbox-2026-10-11

Art: Familienzentrum mit Wochenstundenplan (HTML), Eversports-Widgets leer, Falle: Stundenplan mischt Eltern-Kind-Kurse mit Erwachsenen- und Schwangerenkursen; Wochenregeln ohne Startdatum mit Ferien; PEKiP-Warteliste steht nur in `availability.how`, synthetisch: nein

## Prüfung

Jede Zeile des Stundenplans (Seite 1 und 5 identisch) gegen den Bestand abgeglichen: Wochentag, Beginnzeit, Altersgruppe, Zugehörigkeit (mit Kind 0–3). Alle Beginnzeiten mit `expand.ts` als Wochenregel ab heute (PEKiP ab 26.11.) mit `skipHolidays: true` nachgerechnet; sie stimmen mit dem Bestand überein. Eversports-Seiten 4 und 7 sind leer, Seite 6 enthält nur Schwangeren- und Familienyoga außerhalb 0–3; Status daher `unbekannt`.

## Korrekturen gegenüber dem Bestand

- Neu: „Achtsame Babymassage (6 Wochen–5 Monate, Mo 11:00)“, regelmaessig, mit-anmeldung, kostenpflichtig, `babymassage`, unbekannt, 14 Termine montags 11:00 ohne Ferien. Beleg: „MO … 11:00-12:15 Achtsame Babymassage 6 Wochen-5 Mte.“; der Bestand führt die Babymassage am Do 12:00, die am Montag fehlte.
- Zumbini® (Di 14:00 und Di 15:00): Thema `mehrsprachig` entfernt. Der Text nennt keine Sprache („Zumbini ® 0-4 Jahre“), Werte werden nicht geraten.

## Grenzfälle

- PEKiP (Do 9:30/11:30/13:30): Bestand gelassen (ab 26.11., `warteliste`). Der Seitentext nennt nur die Donnerstagszeiten; Warteliste und Start der neuen Kurse ab 26.11.2026 stehen allein in `catalog.availability.how`. Ob die laufenden Kurse vor dem 26.11. als Termine dazugehören, gibt der Text nicht her.
- Babymassage (Mo und Do): Laut interner Katalognotiz (dem Modell nicht gezeigt) bietet die Hebamme Anne Schulz Babymassage an und wird dort erfasst. Der Text nennt keinen anderen Veranstalter, daher beide Termine bei der FamilienBox.
- Weggelassen, weil kein Kind dabei oder unklar: „KENNENLERN-ZEIT lerne uns kennen“ (Mo 13:00), Rückbildung Kassenkurs, Rückbildungs Yoga, Beikost („Erwachsene mit/ohne Baby“, Elternkurs), Erste Hilfe am Kind, Babyzeichensprache und MONTIS (pausiert, ohne Zeiten).
