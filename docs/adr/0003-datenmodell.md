# ADR 0003 – Datenmodell: Angebote mit materialisierten Terminen

Status: angenommen (2026-10-04)

## Entscheidung
- Ein **Offer** ist ein Kurs, ein regelmäßiger Termin oder ein einmaliger Termin (`format: kurs | regelmaessig | einmalig`). Anmeldung (`mit-/ohne-anmeldung`) und Kosten (`kostenlos/kostenpflichtig`) sind eigene, unabhängige Dimensionen. „Offener Treff“ heißt `regelmaessig` + `ohne-anmeldung`.
- **Termine werden materialisiert**: `sessions[]` enthält jeden Termin im Horizont (4 Monate) mit Offset. Die Pipeline expandiert Regeln und berücksichtigt Ferien und Ausfälle. Der Browser braucht keine RRULE-Engine.
- **ICS**: ein VEVENT je Termin, Zeiten in UTC. Es gibt keine RRULE (kennt keine Ausfälle) und kein RDATE (von Google ignoriert).
  - Serie: `ics/<offerId>.ics`
  - Einzeltermin einer regelmäßigen Reihe: `ics/<offerId>/<YYYYMMDDTHHmm>.ics`
- **Stabile IDs**: Die Offer-ID ist `providerId--slug(title)--venueId` und wird von der Pipeline vergeben. Das Schema prüft Präfix und Suffix. Die UID ist `offerId--YYYYMMDDTHHmm@zwergenplan` (Berliner Ortszeit). Ein erneuter Import landet damit im Kalender als Update statt als Duplikat.
- **Themen und Kategorien**: Die Daten speichern Themen aus einem geschlossenen Vokabular. Die 12 Filter-Kategorien werden über `TOPIC_CATEGORIES` abgeleitet. Merkmals-Themen (`mehrsprachig`, `vaeter`, `muetter`) haben keine Kategorie. Jedes Angebot braucht mindestens ein kategorisiertes Thema.
- **Alter**: `age.minMonths/maxMonths` sind inklusiv und zählen vollendete Monate. Ohne Angabe gilt 0–36. Geprüft wird zum (ersten) Termin bzw. bei regelmäßigen Angeboten zu irgendeinem Termin.
- **Verfügbarkeit** ist eine Momentaufnahme mit `checkedAt`. Die UI zeigt das Datum und einen Link zum Anbieter.
- **Ort**: `geo` ist Pflicht (Bounding-Box Großraum Nürnberg). `nearestStops` ist für ADR 0005 vorbereitet.

## Konsequenzen
- Ändert ein Anbieter einen Titel, entsteht eine neue ID. Das ist akzeptiert, denn neuer Titel heißt meist neues Angebot.
