# Paket prüfen: Termine eines Anbieter-Pakets erfassen

Du bekommst: Zeitraum `FROM`–`TO`, ggf. Alter des Kindes, ein Paket Anbieter aus `data/providers.yaml` und einen Ausgabepfad `RUN_DIR/raw/<paket>.json`. Dein Ergebnis ist diese eine JSON-Datei. Fertig bist du, wenn **jeder** Anbieter des Pakets in `status` steht und jeder gefundene Termin im Zeitraum in `events` steht.

## Vorgehen je Anbieter

1. **Alle** `programme`-URLs abrufen:
   `python3 SKILL_DIR/scripts/fetch_page.py URL --links`.
   Status-Ampeln aus HTML-Attributen erscheinen im Text als `[Status: …]`.
   Gibt es JSON-LD oder einen iCal-Feed, nimm diese Daten zuerst. Bei `HINWEIS: … JS-gerendert` die Seite mit WebFetch oder im Browser (claude-in-chrome) öffnen. Bei `kind: pdf` die PDF herunterladen und lesen.
2. Den Text nach Eltern-Kind-Angeboten für 0–3 Jahre durchsuchen, die in den Zeitraum fallen. Termine mit Datum und Uhrzeit sind das Ziel. Über Paginierung, Monatsansichten und Kategorie-Filter (Eltern-Kind, Familie, Baby, Krabbel …) gelangst du an alle Termine. Folge diesen Links mit `--links`.
3. Für jeden Treffer die **Detail- oder Buchungsseite** öffnen und die Verfügbarkeit ablesen. Den `availability.how`-Hinweis des Anbieters nutzen. Nennt `availability.system` ein Buchungssystem oder bleibt die Seite leer, zuerst `SKILL_DIR/references/booking-systems.md` lesen. Unter `Verfügbarkeit` steht, wie die Angaben übersetzt werden.
   Sind die Termine lesbar, die Platzangabe aber nicht (nur im Browser, nur per Telefon), gilt: `availability: unbekannt`, Buchungslink in `availability_note`, Anbieter-Status trotzdem `ok`.
4. Wenn Altersangaben vorliegen, gegen das Alter des Kindes abgleichen. Nicht passende Angebote weglassen.

Lässt sich ein Anbieter nicht prüfen (Fehler, Login, Seite leer, nur Telefon), trägst du `status: fehler` mit einem konkreten Grund ein und machst mit dem nächsten Anbieter weiter. Mehr als 3 Abrufversuche pro URL lohnen sich nicht.

Ein Anbieter mit festem Wochenplan ohne Datumsliste (z. B. „jeden Dienstag 10–11:30 Krabbeltreff“) liefert trotzdem Termine. Daraus entsteht **ein** Event mit erstem Termin im Zeitraum und `rrule`. Die Regel lautet `FREQ=WEEKLY;BYDAY=TU;UNTIL=20261011` (TO ohne Bindestriche, `enrich.py` ergänzt die Uhrzeit). `skip_holidays` regelt die Ferien:
- `true`, wenn der Anbieter „nicht in den Ferien“ schreibt. Das ist auch der Standard bei `offener-treff`.
- `false`, wenn er ausdrücklich auch in den Ferien stattfindet.

Ferien- und Feiertagstermine nimmt `enrich.py` dann selbst aus. Bei Gottesdiensten und Kulturterminen ist `skip_holidays: false` zu setzen, außer der Anbieter nennt eine Pause. Die `rrule` wird auch dann gesetzt, wenn nur ein Termin in den Zeitraum fällt. Ausdrücklich genannte Ausfälle (z. B. „am 21.10. kein Treff“) kommen in `exdates`.

## Aggregatoren im Paket

Ein Eintrag mit `role: aggregator` listet Termine fremder Veranstalter. Ins Event kommen:
- `provider_id`: die id des Aggregators
- `provider`: der **tatsächliche Veranstalter**, z. B. „Theater Mummpitz“

Dubletten mit dem Anbieter selbst entfernt `enrich.py` über gleichen Beginn und Titel. Zeigt die Liste je Produktion nur den nächsten Termin, öffnest du die Detailseiten aller Produktionen, die für 0–3 infrage kommen. Dort stehen die Folgetermine im Zeitraum.

## Kursreihen und Terminlisten

Ein Event pro Reihe:
- `start`/`end` ist der **erste Termin innerhalb des Zeitraums**. Eine Reihe, die erst nach `TO` beginnt, gehört nicht in diesen Lauf.
- Weitere Termine kommen in `rrule` (regelmäßig) oder `rdates` (unregelmäßig).
- In `series_info` steht z. B. „8 Termine, wöchentlich bis 26.11.“.
- Eine Reihe, die vor `FROM` begonnen hat, nimmst du nur auf, wenn ein späterer Einstieg ausdrücklich möglich ist. Dann bekommt sie den Tag `einstieg-laufend`.

Laufende Kurse mit festen Wochenzeiten, aber ohne Startdatum und ohne Angabe zum Einstieg (z. B. Tanz- und Fitnessstudios): Wochenregel wie oben, Tag `einstieg-anfragen`, `availability: unbekannt`.

Widersprechen sich Website und PDF-Programmheft, gilt die Website bzw. Detailseite. Der Widerspruch wird als Drift gemeldet. PDFs liest du mit `pdftotext datei.pdf -`, ohne `-layout`, denn das liefert bei manchen Heften nichts.

Nennt die Seite **konkrete Daten** (z. B. „Nächste Termine: 9.10., 16.10.“), übernimmst du diese als `start` + `rdates`. Nur wenn es ausschließlich einen Wochenplan gibt, nimmst du die Wochenregel aus dem vorigen Abschnitt.

## Event-Schema

```json
{
  "provider_id": "zoff-harmonie",
  "provider": "Zoff + Harmonie",
  "title": "PEKiP-Gruppe (Babys geb. Juli–Sept. 2026)",
  "start": "2026-10-13T09:30",
  "end": "2026-10-13T11:00",
  "location": "Zoff + Harmonie, Raum 2",
  "address": "Vordere Sterngasse 1, 90402 Nürnberg",
  "url": "https://… (Detail-/Buchungsseite)",
  "tags": ["pekip", "kursreihe", "mit-anmeldung", "kostenpflichtig"],
  "age": "6w-12m",            // Wochen w / Monate m: "6w-12m", "12m+", "12m-36m"
  "price": "96 € (8 Termine)",
  "availability": "frei",
  "availability_note": "3 Plätze frei",
  "series": "zoff-harmonie-pekip-okt",
  "series_info": "8 Termine, wöchentlich Di",
  "rrule": "FREQ=WEEKLY;COUNT=8",
  "skip_holidays": true,
  "exdates": ["2026-10-27T09:30"],
  "description": "1–2 Sätze, was passiert",
  "source_url": "Seite, auf der der Termin stand"
}
```

`tags` stammen aus dem Vokabular der `topics` in `references/provider-schema.md`. Ergänzt werden je Termin die Meta-Tags `kostenlos` oder `kostenpflichtig`, `ohne-anmeldung` oder `mit-anmeldung` sowie `kursreihe`, `einzeltermin` oder `offener-treff`. Die Meta-Tags gelten für den **konkreten Termin**, nicht für den Anbieter. Ist etwas nicht angegeben, wird das Tag weggelassen. Zur Abgrenzung: `offener-treff` heißt, man kommt ohne feste Gruppe dazu. Eine feste Gruppe mit Anmeldung ist `kursreihe`. Ein Feld ohne Angabe lässt du weg, auch `end`; `enrich.py` setzt dann 60 Minuten an. Werte werden nie geraten.

## Verfügbarkeit

| Seite zeigt | `availability` |
|---|---|
| freie Plätze, „buchbar“, grüne Ampel, Anmeldebutton aktiv | `frei` |
| „wenige Plätze“, gelbe Ampel, ≤ 2 Restplätze | `wenige` |
| „ausgebucht“, „belegt“, rote Ampel | `ausgebucht` |
| nur noch Warteliste | `warteliste` |
| offener Treff / „ohne Anmeldung“ / „einfach vorbeikommen“ | `ohne-anmeldung` |
| keine Angabe, Anmeldung nur per Mail oder Telefon | `unbekannt` (in `availability_note` vermerken, wie man anfragt) |

## Ausgabedatei

```json
{
  "events": [ … ],
  "status": {
    "zoff-harmonie": {"status": "ok", "checked": ["https://…", "https://…"]},
    "brk-familienzentrum": {"status": "keine-termine", "checked": ["https://…"]},
    "xyz": {"status": "fehler", "reason": "Kursportal verlangt Login", "checked": ["https://…"]},
    "abc": {"status": "keine-termine", "note": "nur Stücke ab 6 J. im Zeitraum", "checked": ["https://…"]}
  }
}
```

Melde zum Schluss in 2–4 Zeilen auffällige **Drift**. Gemeint sind URLs, die umgezogen oder tot sind, ein neues Buchungssystem oder ein geschlossener Anbieter. Mit diesen Angaben wird `data/providers.yaml` gepflegt.
