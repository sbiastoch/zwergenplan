# ADR 0024 – Katalog beschreibt Quellen, Angebote beschreiben Inhalte

Status: angenommen (2026-10-10), mit Plan 0030. Ergänzt ADR 0003 (Datenmodell) und ADR 0006 („Ein Katalogformat“).

## Kontext

- Jeder Eintrag in `data/providers.yaml` trug von Hand gepflegte Facetten `topics`, `formats`, `costs` und `registrations`. Am 2026-10-10 widersprachen sie den Angeboten: 95 von 333 Angeboten hatten ein Thema, das ihr Anbieter nicht nannte, 18 ein Format, 4 eine Kostenart, 3 eine Anmeldeart.
- Genutzt wurden die Facetten an zwei Stellen: als Kategorien in der Anbieterübersicht (vereinigt mit denen der Angebote) und als Rückfallwerte, wenn die Pipeline einen Sammelkalender-Termin zum Entwurf macht.
- Sammelkalender (`aggregator`) und Verzeichnisse (`verzeichnis`) trugen dieselben Felder wie Anbieter, dazu `age` und Orte. Ihre 16 Orte lagen alle 0–17 m neben einem Ort eines Anbieters und wurden von nichts gelesen.
- `notes` war ein String; 42 Einträge klebten darin mit „ | “ mehrere Notizen zusammen.

## Entscheidung

1. **Der Katalog beschreibt Quellen**: wer, wo, welche Seiten, wie Plätze sichtbar sind, wann zuletzt geprüft. **Inhalte** (Themen, Format, Kosten, Anmeldung) stehen nur an den Angeboten. Die vier Facetten entfallen ersatzlos (Nutzerentscheid, Plan 0030, N2).
2. **Felder nach Rolle**: Alle Rollen haben `name`, `url`, `programme`, `availability`, `verified`, `notes`. Nur `anbieter` hat `age`, `venues` (≥ 1) und `coveredBy`; nur `aggregator` hat `adapter`. Der Typ `Anbieter` in `schema.ts` verengt darauf.
3. **Kategorien eines Anbieters** leiten sich nur aus seinen kommenden Angeboten ab (Anbieter-Sheet und Vorschauseite gleich). Ohne kommende Angebote zeigt keine von beiden Kategorien.
4. **Entwürfe aus Sammelkalendern** übernehmen nur, was der Termin selbst hergibt. Kosten, Anmeldung und Themen ohne Kategorie bleiben offen, das Format kommt nur aus dem Rhythmus; ein so vermutetes `einmalig` steht wie die offenen Felder in der Liste zum Prüfen; `validate-raw` prüft wie das Angebot, dass ein Thema eine Kategorie hat.
5. **`notes` ist eine Liste**, eine Notiz je Eintrag; „ | “ ist im Schema verboten. `availability.how` braucht Text, Platzhalter wie „-“ entfallen.

## Alternativen

- **Facetten aus den Angeboten ableiten und als Rückfall behalten**: weniger offene Felder im Entwurf, Kategorien auch für Anbieter ohne Termine (aus dem letzten Datenstand). Verworfen vom Nutzer zugunsten eines Katalogs ohne Inhaltsangaben.
- **Facetten behalten, der Build erzwingt Konsistenz**: Der Katalog müsste bei jedem Lauf nachgezogen werden, und die Facetten wären eine Kopie der Angebote.
- **Orte in eine eigene Liste mit globalen IDs** (Dubletten über Anbieter zusammenführen): ändert `venueId` und damit heute die Angebots-IDs. Erst nach ADR 0022 sinnvoll (`docs/ideas.md`).

## Konsequenzen

- Anbieter ohne kommende Angebote (am 2026-10-10: 10 von 74) zeigen im Sheet keine Kategorienzeile mehr, ihre Vorschauseite nennt nur Stadtteile.
- Bei Sammelkalender-Entwürfen ist mehr von Hand zu füllen. Ein abgeleitetes `einmalig` ist zu prüfen, weil eine Reihe als Einzeltermine eine andere ID-Form bekommt.
- `anbieter.json` trägt bis frühestens einen Tag nach dem Deploy `topics: []`, damit Tabs mit altem Code nicht abstürzen (Plan 0030, Review M1); Restpunkt in `docs/ideas.md`.
