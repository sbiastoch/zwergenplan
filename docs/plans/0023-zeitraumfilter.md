# Plan 0023 – Zeitraumfilter „von / bis“

Status: in Umsetzung – umgesetzt und live seit d5fab1b; ins Archiv nach dem Browser-Review live (Plan 0027, Etappe 6). Früherer Status: umgesetzt (Branch `zeitraumfilter-0023`)
Datum: 2026-10-08
Review: **kein Plan-Review**, Nutzerentscheid „pragmatisch“ (kurzer Plan, Umsetzung direkt). Arch-Review 2026-10-08 eingearbeitet (Abschnitt unten); das Browser-Review macht der Orchestrator.
Bezug: Plan 0003 (Filter-Sheet, URL-Filter), Plan 0009 (Wegzeit als Einfachwahl), Plan 0021 (Filter-Sheet), ADR 0012 (Startbudget)

## Ziel

Im Filter-Sheet zwei optionale Datumsfelder „von“ und „bis“. Eltern suchen damit z. B. „was gibt es in den Herbstferien“ oder „welcher Kurs beginnt im November“.

## Entscheidungen

- **E1 Grenzen:** Ganze Berliner Kalendertage, beide inklusive. Verglichen wird der Berliner Tag des Terminbeginns (`berlinIsoDate(session.start)`). Nur „von“ heißt ab diesem Tag, nur „bis“ heißt bis zu diesem Tag. Vertauschte Daten aus der URL werden still getauscht, ohne Fehlermeldung. In den Feldern entsteht kein vertauschter Zeitraum, weil die Grenzen der Felder ihn ausschließen (E9).
- **E2 Welcher Termin zählt** (`rangeSession` in `src/domain/date-range.ts`):
  - `kurs`: nur der Kursbeginn `sessions[0]`. Liegt er nicht im Zeitraum, fällt der Kurs heraus, auch wenn spätere Termine hineinfallen. Ein schon beendeter Kursbeginn zählt mit, wenn der Kurs noch läuft.
  - `regelmaessig` und `einmalig`: der erste **nicht beendete** Termin im Zeitraum. Ein heute schon beendeter Termin zählt nicht, denn hingehen kann man nicht mehr.
  - Ganz vorbei-e Angebote fallen wie bisher heraus (`applyFilters`).
- **E3 Reine, wiederverwendbare Domäne:** `DateRange`, `dateRange()` (normalisiert: ungültig verwerfen, tauschen), `rangeSession()` und `inDateRange()` stehen in einem neuen Modul `src/domain/date-range.ts`. Es hängt nur an `time.ts` und dem Schema, nicht an Filter oder Startseite. Der spätere Plan „Beginn ab“ auf der Merkliste mit Schnellwahlen nutzt dieselben Funktionen (nicht Teil dieses Plans, siehe `docs/ideas.md`). Ein eigenes Modul vermeidet zudem den Zyklus `filter.ts` ↔ `agenda.ts`.
- **E4 URL:** `von=YYYY-MM-DD&bis=YYYY-MM-DD`, nach `wegzeit`. Ungültige Werte (kein ISO-Tag, kein echter Kalendertag) werden verworfen, vertauschte kanonisch sortiert. `FilterState.range` ist optional wie `reachLimit`; ohne Zeitraum fehlt der Schlüssel, damit der Zustand gleich `EMPTY_FILTER` bleibt. **Alter Link:** Ein `von` (oder `bis`) vor heute bleibt gültig, damit laufende Kurse über einen geteilten Link auffindbar bleiben. Das Feld beginnt dann bei diesem Wert statt bei heute, sonst zeigte es dauerhaft `:invalid` (`fieldLimits`).
- **E5 Badge und Zurücksetzen:** Ein gesetzter Zeitraum zählt in `activeFilterCount` als **1** (eine Dimension, egal ob eine oder beide Grenzen). „Zurücksetzen“ und „Filter zurücksetzen“ setzen `EMPTY_FILTER` und entfernen ihn damit.
- **E6 Liste:** `groupByNextSession(offers, now, range)` stellt jedes Angebot bei aktivem Zeitraum an seinen `rangeSession`-Tag, sonst wie bisher an den nächsten Termin. Kurse stehen also am Kursbeginn, regelmäßige am ersten Termin im Zeitraum.
- **E7 Detail:** Bei aktivem Zeitraum gibt die Liste den Tag der Gruppe an `onOpen` weiter, wie der Kalender heute (`calendarDay`). Das Detail markiert damit den Termin (regelmäßig), bietet „Nur TT.MM.“ als ICS für ihn an und prüft das Alter zu diesem Termin. Ohne Zeitraum bleibt alles wie bisher. **Grenze:** Nach dem Neuladen eines Detail-Links fehlt der Tag (er steht nicht in der URL), wie beim Kalender.
- **E8 Kalender und Karte** bleiben unverändert und zeigen die gefilterten Angebote (`views.visible`). Der Kalender zeigt dabei alle Termine eines passenden Angebots, auch die außerhalb des Zeitraums.
- **E9 Eingabe:** `<input type="date">` statt Textfeld. Grenzen (`fieldLimits`, als Attribut und in `checkBound`): „von“ ab heute bis „bis“, „bis“ ab „von“ (sonst ab heute). Eine Eingabe außerhalb der Grenzen, auch ein halb getipptes Jahr, wird nicht übernommen; das Feld bekommt `aria-invalid` und eine kurze Zeile per `aria-describedby` („Frühestens heute“, „Nicht vor ‚von‘“, „Nicht nach ‚bis‘“). Die Felder stehen in einer Gruppe (`role="group"`, benannt durch die Überschrift „Zeitraum“). „Zeitraum entfernen“ setzt den Fokus vorher auf diese Überschrift, wie `LimitAction`. Begründung: Das Geburtsdatum ist Text (Plan 0003), weil man dort Jahre zurückblättern müsste und das Feld im Mockup das Geräte-Locale zeigte. Hier geht es um die nächsten Wochen; der native Picker zeigt Wochentage und braucht kein Tippen. Die Familie nutzt deutsche Geräte. Felder in der Klasse `.input` (≥ 56 px), zwei Spalten per `grid auto-fit` mit `rem`-Mindestbreite (große Schrift). Bei gesetztem Zeitraum steht darunter „Zeitraum entfernen“, denn nicht jeder native Picker hat einen Löschknopf.
- **E10 Budget:** Der Filter-Sheet liegt im Start-Bundle. Delta wird mit `pnpm size` gemessen und in ADR 0012 eingetragen; die Schwelle bleibt 100 kB.
- **E11 Nicht in `matchesFilter`:** `matchesFilter` bleibt ohne Zeitbezug (Plan 0007, E2). Der Zeitraum wirkt in `applyFilters`, das `now` hat. Der Zähler „heute schon beendet“ im Kalender ignoriert den Zeitraum deshalb, das ist hinnehmbar.
- **E12 Such-Abos ohne Zeitraum** (Plan 0017): Ein Abo ist der Filter ohne `range` (`searchOf` in `src/domain/searches.ts`, für `addSearch`, `hasSearch`, `parseSearches` und `current` in `PushControls`). Die Wochen-Nachricht schaut immer auf die kommende Woche; ein fester Zeitraum veraltete im Abo, und ein Abo nur mit Zeitraum hätte ein leeres Label und träfe alles.
- **Bekannte Grenze (Alter):** Die Liste blendet nach Alter wie bisher über `ageVisibility` aus (`splitByAge`, geprüft zum Kursstart), das Detail prüft aus der Liste mit Zeitraum zum Termin im Zeitraum (E7). Bei regelmäßigen Angeboten kann das auseinanderlaufen, etwa wenn das Kind erst zum Termin im Zeitraum alt genug ist. `rangeSession` lässt sich nicht trivial in `ageVisibility` durchreichen (die Funktion kennt keinen Termin je Angebot); bewusst nicht in diesem Plan.

## Tests

- `src/domain/date-range.test.ts` (läuft in America/Los_Angeles): Grenzen um Mitternacht Berlin (23:30 und 00:30 Berliner Zeit), Wechsel auf Winterzeit am 25.10.2026, inklusive Grenzen, nur „von“, nur „bis“, Kurs mit Beginn vor dem Zeitraum, regelmäßig mit einem Termin im Zeitraum, beendeter Termin heute, Normalisierung (tauschen, ungültige Tage verwerfen), `fieldLimits` und `checkBound` (auch alter Link), `DateRange` ohne Grenze ist ein Typfehler.
- `src/domain/filter.test.ts`: URL-Roundtrip `von`/`bis`, Verwerfen, Tauschen, Badge zählt 1, `applyFilters` mit Fixtures.
- `src/domain/route.test.ts`: Roundtrip mit `von`/`bis`, `ansicht` und `angebot`.
- `src/domain/searches.test.ts`: `?von=…` allein ist „leer“, `kat=musik&von=…` wird `kat=musik` (E12).
- `src/domain/agenda.test.ts`: `groupByNextSession` mit Zeitraum (regelmäßig am ersten Termin im Zeitraum, Kurs am Beginn).
- `src/domain/time.test.ts`: `isIsoDate`.
- `e2e/zeitraum.spec.ts` (Fixtures, Uhr Mo 5.10.2026 12:00): Felder im Sheet, URL, Badge, Kurs vor dem Zeitraum fehlt, regelmäßiges Angebot am Tag im Zeitraum, Detail markiert diesen Termin, Detail eines Kurses am Kursbeginn, Tausch aus der URL, abgewiesene Eingabe per Tastatur (`pressSequentially`, nur Chromium), Fokus nach „Zeitraum entfernen“, alter Link mit `von` vor heute, Zeitraum ganz in der Vergangenheit mit Leerzustand, „Zurücksetzen“, Kalender. Neue Fixtures sind nicht nötig.
- Mobile-UX hell und dunkel: Ansicht `filter-sheet-zeitraum` in `e2e/mobile-ux.spec.ts` (nicht in `zeitraum.spec.ts`).

## Schritte

1. Tests für `isIsoDate`, `date-range.ts`, Filter und Agenda schreiben (rot).
2. `time.ts`, `date-range.ts`, `filter.ts`, `agenda.ts` umsetzen (grün).
3. `use-offer-views.ts`, `ListView.tsx` (Tag an `onOpen`), `Sheets.tsx` (Abschnitt „Zeitraum“), CSS.
4. E2E schreiben, `PW_PORT=4373 pnpm check`.
5. `pnpm size`, Delta in ADR 0012; `docs/architecture.md` (Domänenmodul), `docs/ideas.md` (Merkliste „Beginn ab“).

## Review (Arch-Review 2026-10-08)

Urteil: kein Blocker, Nacharbeit nötig. Befund → Umgang:

- **M1** Such-Abos übernahmen den Zeitraum, die Nachricht ignoriert ihn → E12, `searchOf`, Tests in `searches.test.ts`, Satz in `docs/architecture.md` (Push).
- **M2** „Zeitraum entfernen“ verlor den Fokus → Fokus vorher auf die Überschrift „Zeitraum“ (`tabIndex=-1`), E2E `toBeFocused`.
- **M3** Tausch während der Eingabe ließ Werte unter dem Fokus springen → Feldgrenzen (`fieldLimits`, `checkBound`), getauscht wird nur noch beim Parsen der URL (E1, E9), E2E mit `pressSequentially`.
- **m1** keine Rückmeldung bei abgewiesener Eingabe → `aria-invalid` und Hinweiszeile per `aria-describedby` (E9).
- **m2** Gruppe fehlte → `role="group"` mit `aria-labelledby` auf die Überschrift.
- **m3** alter Link mit `von` vor heute → bleibt gültig (Variante A), E4, E2E.
- **m4** `notEnded` doppelt → Export aus `date-range.ts`, `agenda.ts` nutzt ihn.
- **m5** `DateRange` erzwang den Vertrag nicht → Union-Typ, Test mit `{}` (`@ts-expect-error`).
- **m6** Alter in Liste und Detail kann sich widersprechen → bekannte Grenze (Entscheidungen).
- **m7** fehlende Tests → ergänzt (Abschnitt Tests).
- **m8** dieser Abschnitt.

## Status

Umgesetzt. Ergebnisse (Gates, Start-JS) stehen im Commit und in ADR 0012.
