# Paket prüfen: Termine eines Anbieter-Pakets erfassen

Du bekommst den Horizont `from`–`to`, ein Paket `runs/<from>/batch-<n>.json` (Katalogeinträge, Format: `schema/providers.schema.json`) und den Ausgabepfad `runs/<from>/raw/batch-<n>.json`. Dein Ergebnis ist diese eine JSON-Datei im Format `schema/raw-batch.schema.json`.

**Fertig** bist du, wenn drei Dinge gelten:
- Jeder Anbieter des Pakets steht in `providers`.
- Jedes Angebot für 0–3 Jahre im Horizont steht in `events`.
- `pnpm pipeline validate-raw runs/<from>/raw/batch-<n>.json` endet ohne Fehler. Meldet es Fehler, korrigierst du die Datei und prüfst erneut.

## Vorgehen je Anbieter

1. **Alle** `programme`-URLs abrufen: `pnpm pipeline fetch-page URL --links`.
   - Status-Ampeln aus HTML-Attributen erscheinen im Text als `[Status: …]`.
   - JSON-LD und iCal-Feeds nimmst du zuerst.
   - Bei `HINWEIS: … JS-gerendert` öffnest du die Seite mit WebFetch oder im Browser (claude-in-chrome).
   - Bei `kind: pdf` lädst du die PDF herunter und liest sie mit `pdftotext datei.pdf -` (ohne `-layout`).
2. Den Text nach Eltern-Kind-Angeboten für 0–3 Jahre im Horizont durchsuchen.
   - Über Paginierung, Monatsansichten und Kategorie-Filter (Eltern-Kind, Familie, Baby, Krabbel …) kommst du an alle Termine. Folge diesen Links mit `--links`.
   - Widersprechen sich Website und PDF-Heft, gilt die Website bzw. die Detailseite. Den Widerspruch meldest du als `drift`.
3. Je Treffer die **Detail- oder Buchungsseite** öffnen und die Verfügbarkeit ablesen.
   - Der Hinweis `availability.how` des Anbieters sagt, wo sie steht.
   - Nennt `availability.system` ein Buchungssystem oder bleibt die Seite leer, liest du zuerst `references/booking-systems.md`.
   - Sind die Termine lesbar, die Plätze aber nicht: `status: unbekannt`, in `note` steht, wie man anfragt bzw. bucht. Der Anbieter bleibt `ok`.
4. Altersangaben übernimmst du als `age`. Angebote erst ab 3 Jahren lässt du weg.

Ist ein Anbieter nicht prüfbar (Fehler, Login, Seite leer, nur Telefon), trägst du `status: fehler` mit konkretem `reason` ein und machst mit dem nächsten weiter. Mehr als 3 Abrufversuche pro URL lohnen sich nicht.

## Ausgabedatei

```json
{
  "providers": {
    "zoff-harmonie": { "status": "ok", "checked": ["https://…", "https://…"] },
    "brk-familienzentrum": { "status": "keine-termine", "checked": ["https://…"], "note": "nur Kurse ab Januar" },
    "xyz": { "status": "fehler", "reason": "Kursportal verlangt Login", "checked": ["https://…"] },
    "abc": { "status": "ok", "checked": ["https://…"], "drift": "Programm-PDF umgezogen nach https://…" }
  },
  "events": [ … ]
}
```

`drift` meldet alles, was der Katalog nachziehen muss: tote oder umgezogene URLs, ein neues Buchungssystem, eine Schließung, einen **neuen Ort** (Name + Adresse).

## Ein Event

```json
{
  "providerId": "zoff-harmonie",
  "venueId": "zoff-harmonie",
  "title": "PEKiP-Gruppe (Babys geb. Juli–Sept. 2026)",
  "summary": "Bewegungs- und Spielanregungen für Babys im ersten Lebensjahr, Austausch für Eltern. 10 Treffen.",
  "topics": ["pekip"],
  "format": "kurs",
  "registration": "mit-anmeldung",
  "cost": "kostenpflichtig",
  "price": "96 € (10 Termine)",
  "age": { "minMonths": 1, "maxMonths": 4 },
  "url": "https://… (Detail- oder Buchungsseite)",
  "sourceUrl": "https://… (Seite, auf der der Termin stand)",
  "availability": { "status": "wenige", "note": "2 Plätze frei" },
  "registrationWindow": { "deadline": "2026-10-10T12:00" },
  "schedule": { "kind": "weekly", "weekdays": ["TU"], "start": "09:30", "end": "11:00",
                "from": "2026-10-13", "count": 10, "skipHolidays": true }
}
```

Regeln:
- **Ein Event je Angebot**: eine Kursreihe, eine regelmäßige Gruppe, ein Stück mit all seinen Vorstellungen. Die Pipeline zerlegt Einzeltermine selbst.
- `venueId` ist eine `id` aus `venues` des Anbieters. Nennt die Quelle einen anderen festen Treffpunkt, nimmst du den Hauptort und meldest den Treffpunkt als `drift` („neuer Ort: Name, Adresse“).
- `title` macht das Angebot unterscheidbar, zum Beispiel durch Altersgruppe oder Wochentag, wenn ein Anbieter mehrere gleichnamige Gruppen hat. Höchstens 140 Zeichen.
- `summary` sind **eigene Worte**: 1–2 Sätze, was passiert und was man wissen muss. Höchstens 320 Zeichen.
- `topics` stammen aus dem Vokabular in `schema/raw-batch.schema.json`. Mindestens eines muss einer Kategorie zugeordnet sein. Merkmale wie `vaeter` oder `mehrsprachig` kommen zusätzlich dazu.
- `format`:
  - `kurs`: feste Reihe mit Anmeldung für das Ganze
  - `regelmaessig`: wiederkehrend ohne festes Ende, auch offene Treffs
  - `einmalig`: Konzert, Führung, Stück, Workshop
- `registration` und `cost` beschreiben das **konkrete Angebot**, nicht den Anbieter.
- `availability.status` ist eins von `frei`, `wenige`, `ausgebucht`, `warteliste`, `ohne-anmeldung` oder `unbekannt` (Tabelle unten).
- Zeiten sind Berliner Ortszeit ohne Offset: `2026-10-13T09:30`, `09:30`. Ein unbekanntes Ende lässt du weg, die Pipeline schätzt es. Werte werden nie geraten: Fehlt eine Angabe, fehlt das Feld.

### `schedule`

| Lage auf der Seite | `schedule` |
|---|---|
| konkrete Daten („9.10., 16.10., 23.10.“), Vorstellungen eines Stücks | `{"kind": "dates", "dates": [{"start": "2026-10-09T10:00", "end": "2026-10-09T11:30"}, …]}` |
| fester Wochenplan („jeden Dienstag 10–11:30“) | `{"kind": "weekly", "weekdays": ["TU"], "start": "10:00", "end": "11:30", "from": "<erster Termin im Horizont>", "skipHolidays": true}` |
| Kurs „8 Termine ab 13.10., dienstags“ | `weekly` mit `"from": "2026-10-13", "count": 8` |
| 14-täglich | `weekly` mit `"interval": 2` und `from` = ein tatsächlicher Termin |
| „jeden 1. Mittwoch im Monat“ | `{"kind": "monthly", "nth": 1, "weekday": "WE", …}` (`nth: -1` = letzter) |

- `skipHolidays: true` gilt, wenn der Anbieter „nicht in den Ferien“ schreibt. Das ist auch der Standard bei offenen Treffs. `false` gilt, wenn er ausdrücklich auch in den Ferien stattfindet, außerdem bei Gottesdiensten und Kulturterminen, solange keine Pause genannt ist.
- Ausdrücklich genannte Ausfälle („am 21.10. kein Treff“) kommen in `except: ["2026-10-21"]`.
- Konkrete Daten haben Vorrang vor einer Wochenregel.
- Laufende Kurse: Sind die bisherigen Termine bekannt, gehören sie mit hinein. Ist ein späterer Einstieg möglich, steht das in der `summary`.
- Laufende Kurse mit Wochenzeiten, aber ohne Startdatum (Tanz- und Fitnessstudios): als `regelmaessig` mit Wochenregel, `status: unbekannt`, „Einstieg auf Anfrage“ in der `summary`.

### Verfügbarkeit

| Seite zeigt | `availability.status` |
|---|---|
| freie Plätze, „buchbar“, grüne Ampel, Anmeldebutton aktiv | `frei` |
| „wenige Plätze“, gelbe Ampel, ≤ 2 Restplätze | `wenige` |
| „ausgebucht“, „belegt“, rote Ampel | `ausgebucht` |
| nur noch Warteliste | `warteliste` |
| offener Treff, „ohne Anmeldung“, „einfach vorbeikommen“ | `ohne-anmeldung` |
| keine Angabe, Anmeldung nur per Mail oder Telefon | `unbekannt` (in `note`, wie man anfragt) |

Zum Schluss meldest du in 2–4 Zeilen auffällige Drift. Die gleichen Angaben stehen auch in `drift` der Datei.
