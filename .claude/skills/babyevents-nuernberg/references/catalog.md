# Anbieterkatalog pflegen (`data/providers.yaml`)

Der Vertrag ist `Provider` in `src/domain/schema.ts`, exportiert als `schema/providers.schema.json`. Nach jeder Änderung prüft der Hook die Datei, und `pnpm data:validate` muss grün sein. Ein neues Feld oder ein neues Thema ist eine Schemaänderung in `schema.ts`/`topics.ts` mit `pnpm schema:export`, keine Freitext-Notiz.

## Rollen

- `anbieter` veranstaltet selbst. Er hat mindestens einen Ort und als Einziger Angebote. `coveredBy: <aggregator>` heißt, dass seine Termine vollständig über diesen Sammelkalender kommen und kein Subagent seine Seite prüft.
- `aggregator` ist ein Sammelkalender fremder Veranstalter mit `adapter` (Pflicht); `candidates fetch` fragt ihn ab. Ein Sammelkalender ohne Adapter ist ein `verzeichnis`.
- `verzeichnis` ist eine Liste zur Katalogpflege und liefert keine Termine.
- Der Katalog beschreibt Quellen, nicht Inhalte (ADR 0024). Alle Rollen haben `region`, `name`, `url`, `programme`, `availability`, `verified` und `notes`. Nur `anbieter` hat `age`, `venues` und `coveredBy`, nur `aggregator` hat `adapter`. Themen, Format, Kosten und Anmeldung stehen nur an den Angeboten.
- `region` ist die Region der Quelle (heute nur `nuernberg`, `src/domain/regions.ts`); jeder Ort muss in ihrer bbox liegen (ADR 0025).

## Programmseiten (`programme`, ADR 0025)

Der nächtliche Crawler (Plan 0015) liest nur Felder, keine Notizen. Je Seite:

| Feld | Bedeutung |
|---|---|
| `url` | darf `{von}`/`{bis}` enthalten (Monatsanfang bis +13 Monate); `pipeline fetch-page` setzt sie ein. Keine Platzhalter in URLs von Sammelkalendern mit `adapter` |
| `kind` | Format: `html`, `pdf`, `ical`, `json-api` |
| `render: browser` | Seite braucht JavaScript (früher `kind: js`); Eversports-Widgets mit 403 per Skript gehören hierher |
| `use` | `termine` (Abruf und Prompt), `verfuegbarkeit` (nur Plätze), `info` (Linkhub, Erklärseite, Spiegelseite; nicht abgerufen) |
| `request` | POST mit JSON-Body (Kursorganizer-GraphQL); vor dem Eintragen einmal per `curl` prüfen |
| `blocked` | `{ reason, since }`, nur mit Abrufbeleg auch im Browser (Login, Bot-Schutz) |
| `hint` | höchstens 200 Zeichen, **ohne Datum**: was ein Modell beim Lesen dieser Seite braucht („nur Gruppen ‚ab 0‘ und ‚ab 1‘“, „Termine im JSON-LD“) |

- Ein `anbieter` ohne `coveredBy` braucht eine Seite mit `use: termine` ohne `blocked`. Bei `coveredBy` auf evangelische-termine bleibt die URL mit `vid=` Pflicht, sie ist der Zuordnungsschlüssel.
- Folgeseiten mit stabilen URLs sind eigene Einträge; Links folgt der Crawler nie. Eine URL, die nur in einer Notiz steht, sieht der Crawler nicht: Was abgerufen werden soll, ist ein Programmeintrag.

## Orte (`venues`)

- Der Hauptort hat die Anbieter-ID als `id`, weitere Orte `<anbieter>-<slug>`. IDs sind dauerhaft und stecken in den Offer-IDs (ADR 0006). Wird ein Ort umbenannt, bleibt die `id`.
- Ein neuer Ort braucht Koordinaten: `pnpm pipeline geocode "Straße Nr, PLZ Nürnberg"` liefert `lat`, `lon` und `district`.
- `venues[].hint` (höchstens 200 Zeichen, ohne Datum) sagt dem Crawler, was an diesem Ort stattfindet („Babymassage freitags, Krabbelgruppen“). Ist die Koordinate nur ungefähr (Park, Straßenmitte), steht das in `notes`.
- Meldet ein Subagent „neuer Ort“ als Drift: Ort anlegen, dann in der Rohdatei `venueId` der betroffenen Events umstellen und `build` neu laufen lassen.

## Drift umsetzen

| Meldung | Änderung |
|---|---|
| tote oder umgezogene URL | `programme`-Eintrag korrigieren |
| neues Buchungssystem | `availability.system` und `availability.how` anpassen |
| Schließung | Eintrag löschen und mit Grund in `references/excluded.md` vermerken |
| neuer Veranstalter, mehrfach in Sammelkalendern | als `anbieter` aufnehmen (`candidates add-provider` oder von Hand) |

Nach jeder Prüfung bekommt `verified` das heutige Datum.

## Konventionen

- `age` gilt in vollendeten Monaten und darf über 36 hinausgehen.
- `notes` ist eine Liste mit einer Notiz je Eintrag. Neue Erkenntnisse kommen als neuer Eintrag dazu, nie mit „ | “ angehängt. `notes` ist Protokoll für Menschen: Der Crawler liest es nicht (ADR 0025). Was er wissen muss, gehört in `hint`, `venues[].hint` oder `availability.how`.
- Anmeldestart und -schluss stehen je als eigener Eintrag in `notes`: `Anmeldestart: …`, `Anmeldeschluss: …` (Regel, Datum oder Verweis).
- `availability.how` lässt man weg, wenn es nichts zu sagen gibt; Platzhalter wie „-“ lehnt das Schema ab.
- `references/excluded.md` listet geprüfte und bewusst nicht aufgenommene Anbieter. Diese kommen nur bei veränderter Lage wieder in den Katalog.
