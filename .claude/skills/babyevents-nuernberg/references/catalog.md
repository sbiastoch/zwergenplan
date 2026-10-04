# Anbieterkatalog pflegen (`data/providers.yaml`)

Der Vertrag ist `Provider` in `src/domain/schema.ts`, exportiert als `schema/providers.schema.json`. Nach jeder Änderung prüft der Hook die Datei, und `pnpm data:validate` muss grün sein. Ein neues Feld oder ein neues Thema ist eine Schemaänderung in `schema.ts`/`topics.ts` mit `pnpm schema:export`, keine Freitext-Notiz.

## Rollen

- `anbieter` veranstaltet selbst. Er hat mindestens einen Ort und als Einziger Angebote. `coveredBy: <aggregator>` heißt, dass seine Termine vollständig über diesen Sammelkalender kommen und kein Subagent seine Seite prüft.
- `aggregator` ist ein Sammelkalender fremder Veranstalter. Mit `adapter` fragt ihn `candidates fetch` ab. Ohne Adapter ist er nur eine Quelle für die Pflege.
- `verzeichnis` ist eine Liste zur Katalogpflege und liefert keine Termine.

## Orte (`venues`)

- Der Hauptort hat die Anbieter-ID als `id`, weitere Orte `<anbieter>-<slug>`. IDs sind dauerhaft und stecken in den Offer-IDs (ADR 0006). Wird ein Ort umbenannt, bleibt die `id`.
- Ein neuer Ort braucht Koordinaten: `pnpm pipeline geocode "Straße Nr, PLZ Nürnberg"` liefert `lat`, `lon`, `district` und `ring`. Ist die Koordinate nur ungefähr (Park, Straßenmitte), steht das in `notes`.
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

- `formats`, `costs` und `registrations` beschreiben, was der Anbieter **insgesamt** anbietet. Ein offener Treff ist `regelmaessig` + `ohne-anmeldung`.
- `age` gilt in vollendeten Monaten und darf über 36 hinausgehen.
- Anmeldestart und -schluss stehen in `notes` als `Anmeldestart: … | Anmeldeschluss: …` (Regel, Datum oder Verweis).
- `references/excluded.md` listet geprüfte und bewusst nicht aufgenommene Anbieter. Diese kommen nur bei veränderter Lage wieder in den Katalog.
