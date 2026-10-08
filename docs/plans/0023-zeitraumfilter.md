# Plan 0023 – Zeitraumfilter „von / bis“

Status: umgesetzt (Branch `zeitraumfilter-0023`)
Datum: 2026-10-08
Review: **kein Plan-Review**, Nutzerentscheid „pragmatisch“ (kurzer Plan, Umsetzung direkt). Arch- und Browser-Review macht der Orchestrator nach der Umsetzung.
Bezug: Plan 0003 (Filter-Sheet, URL-Filter), Plan 0009 (Wegzeit als Einfachwahl), Plan 0021 (Filter-Sheet), ADR 0012 (Startbudget)

## Ziel

Im Filter-Sheet zwei optionale Datumsfelder „von“ und „bis“. Eltern suchen damit z. B. „was gibt es in den Herbstferien“ oder „welcher Kurs beginnt im November“.

## Entscheidungen

- **E1 Grenzen:** Ganze Berliner Kalendertage, beide inklusive. Verglichen wird der Berliner Tag des Terminbeginns (`berlinIsoDate(session.start)`). Nur „von“ heißt ab diesem Tag, nur „bis“ heißt bis zu diesem Tag. Vertauschte Daten werden still getauscht, ohne Fehlermeldung.
- **E2 Welcher Termin zählt** (`rangeSession` in `src/domain/date-range.ts`):
  - `kurs`: nur der Kursbeginn `sessions[0]`. Liegt er nicht im Zeitraum, fällt der Kurs heraus, auch wenn spätere Termine hineinfallen. Ein schon beendeter Kursbeginn zählt mit, wenn der Kurs noch läuft.
  - `regelmaessig` und `einmalig`: der erste **nicht beendete** Termin im Zeitraum. Ein heute schon beendeter Termin zählt nicht, denn hingehen kann man nicht mehr.
  - Ganz vorbei-e Angebote fallen wie bisher heraus (`applyFilters`).
- **E3 Reine, wiederverwendbare Domäne:** `DateRange`, `dateRange()` (normalisiert: ungültig verwerfen, tauschen), `rangeSession()` und `inDateRange()` stehen in einem neuen Modul `src/domain/date-range.ts`. Es hängt nur an `time.ts` und dem Schema, nicht an Filter oder Startseite. Der spätere Plan „Beginn ab“ auf der Merkliste mit Schnellwahlen nutzt dieselben Funktionen (nicht Teil dieses Plans, siehe `docs/ideas.md`). Ein eigenes Modul vermeidet zudem den Zyklus `filter.ts` ↔ `agenda.ts`.
- **E4 URL:** `von=YYYY-MM-DD&bis=YYYY-MM-DD`, nach `wegzeit`. Ungültige Werte (kein ISO-Tag, kein echter Kalendertag) werden verworfen, vertauschte kanonisch sortiert. `FilterState.range` ist optional wie `reachLimit`; ohne Zeitraum fehlt der Schlüssel, damit der Zustand gleich `EMPTY_FILTER` bleibt.
- **E5 Badge und Zurücksetzen:** Ein gesetzter Zeitraum zählt in `activeFilterCount` als **1** (eine Dimension, egal ob eine oder beide Grenzen). „Zurücksetzen“ und „Filter zurücksetzen“ setzen `EMPTY_FILTER` und entfernen ihn damit.
- **E6 Liste:** `groupByNextSession(offers, now, range)` stellt jedes Angebot bei aktivem Zeitraum an seinen `rangeSession`-Tag, sonst wie bisher an den nächsten Termin. Kurse stehen also am Kursbeginn, regelmäßige am ersten Termin im Zeitraum.
- **E7 Detail:** Bei aktivem Zeitraum gibt die Liste den Tag der Gruppe an `onOpen` weiter, wie der Kalender heute (`calendarDay`). Das Detail markiert damit den Termin (regelmäßig), bietet „Nur TT.MM.“ als ICS für ihn an und prüft das Alter zu diesem Termin. Ohne Zeitraum bleibt alles wie bisher. **Grenze:** Nach dem Neuladen eines Detail-Links fehlt der Tag (er steht nicht in der URL), wie beim Kalender.
- **E8 Kalender und Karte** bleiben unverändert und zeigen die gefilterten Angebote (`views.visible`). Der Kalender zeigt dabei alle Termine eines passenden Angebots, auch die außerhalb des Zeitraums.
- **E9 Eingabe:** `<input type="date">` mit `min` = heute statt Textfeld. Begründung: Das Geburtsdatum ist Text (Plan 0003), weil man dort Jahre zurückblättern müsste und das Feld im Mockup das Geräte-Locale zeigte. Hier geht es um die nächsten Wochen; der native Picker zeigt Wochentage und braucht kein Tippen. Die Familie nutzt deutsche Geräte. Felder in der Klasse `.input` (≥ 56 px), zwei Spalten per `grid auto-fit` mit `rem`-Mindestbreite (große Schrift). Bei gesetztem Zeitraum steht darunter „Zeitraum entfernen“, denn nicht jeder native Picker hat einen Löschknopf.
- **E10 Budget:** Der Filter-Sheet liegt im Start-Bundle. Delta wird mit `pnpm size` gemessen und in ADR 0012 eingetragen; die Schwelle bleibt 100 kB.
- **E11 Nicht in `matchesFilter`:** `matchesFilter` bleibt ohne Zeitbezug (Plan 0007, E2). Der Zeitraum wirkt in `applyFilters`, das `now` hat. Der Zähler „heute schon beendet“ im Kalender ignoriert den Zeitraum deshalb, das ist hinnehmbar.

## Tests

- `src/domain/date-range.test.ts` (läuft in America/Los_Angeles): Grenzen um Mitternacht Berlin (23:30 und 00:30 Berliner Zeit), Wechsel auf Winterzeit am 25.10.2026, inklusive Grenzen, nur „von“, nur „bis“, Kurs mit Beginn vor dem Zeitraum, regelmäßig mit einem Termin im Zeitraum, beendeter Termin heute, Normalisierung (tauschen, ungültige Tage verwerfen).
- `src/domain/filter.test.ts`: URL-Roundtrip `von`/`bis`, Verwerfen, Tauschen, Badge zählt 1, `applyFilters` mit Fixtures.
- `src/domain/agenda.test.ts`: `groupByNextSession` mit Zeitraum (regelmäßig am ersten Termin im Zeitraum, Kurs am Beginn).
- `src/domain/time.test.ts`: `isIsoDate`.
- `e2e/zeitraum.spec.ts` (Fixtures, Uhr Mo 5.10.2026 12:00): Felder im Sheet, URL, Badge, Kurs vor dem Zeitraum fehlt, regelmäßiges Angebot steht am Tag im Zeitraum, Detail markiert diesen Termin, „Zurücksetzen“, Mobile-UX hell und dunkel. Neue Fixtures sind nicht nötig: PEKiP (Kurs ab 13.10.) und „Offener Krabbeltreff“ (wöchentlich ab 7.10.) decken die Fälle ab.

## Schritte

1. Tests für `isIsoDate`, `date-range.ts`, Filter und Agenda schreiben (rot).
2. `time.ts`, `date-range.ts`, `filter.ts`, `agenda.ts` umsetzen (grün).
3. `use-offer-views.ts`, `ListView.tsx` (Tag an `onOpen`), `Sheets.tsx` (Abschnitt „Zeitraum“), CSS.
4. E2E schreiben, `PW_PORT=4373 pnpm check`.
5. `pnpm size`, Delta in ADR 0012; `docs/architecture.md` (Domänenmodul), `docs/ideas.md` (Merkliste „Beginn ab“).

## Status

Umgesetzt. Ergebnisse (Gates, Start-JS) stehen im Commit und in ADR 0012.
