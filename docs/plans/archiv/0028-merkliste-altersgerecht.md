# Plan 0028 – Merkliste und Entdecken nur mit altersgerechten Terminen

Status: abgeschlossen, live seit 3cb0740 (2026-10-09)
Datum: 2026-10-08
Bezug: Plan 0018 (ICS nur altersgerecht, archiviert), ADR 0007 (Kurse komplett), ADR 0018, Plan 0021 (Altersfilter), Plan 0025, E3a (Statuszeile der Merkliste)

## Anlass

Der Nutzer, wörtlich: „aktuell werden in der merkliste auch regelmäßige termine angezeigt, die noch nicht passen. Im ics download ist das jetzt richtig, dass nur der passende range an terminen in der ics enthalten ist, aber in der Merkliste wird zB der Termin für morgen angezeigt, auch wenn es erst in 7 Wochen passt“

## Ursache

Seit Plan 0018 wählt `exportSessions` (`src/domain/saved.ts`) die Termine für den ICS-Export: Kurse komplett, sonst die nicht beendeten Termine, bei regelmäßigen Angeboten mit Geburtsdatum nur die, an denen sie zum Alter passen (`fitsAgeAt` je Termin). Die Anzeige kannte diese Auswahl nicht:

- **Merkliste**: `savedOffers` sortierte nach `nextSession`, die Karte in `SavedView.tsx` zeigte `nextSession`, und `upcomingSessionCount` zählte alle kommenden Termine.
- **Entdecken**: `offerFitsAge` lässt ein regelmäßiges Angebot durch, sobald irgendein kommender Termin passt. `groupByNextSession` stellte es aber an den nächsten Termin, und der Kalender (`sessionsByDay`) zeigte jeden Termin. Ein Angebot, das erst in sieben Wochen passt, stand so auch dort morgen.

## Entscheidungen

- **E1, eine Quelle**: `sessionFit(birthDate)` in `src/domain/age.ts` ist das Prädikat „Termin zählt“. Regelmäßige Angebote prüft es je Termin mit `fitsAgeAt`, Kurse und Einzeltermine nie: Für sie gilt weiter `offerFitsAge` zum (ersten) Termin, ein Kurs wird nicht abgeschnitten (ADR 0007). Ohne Geburtsdatum gibt es kein Prädikat. `fittingSessions(offer, now, birthDate)` liefert damit die kommenden, passenden Termine. Darauf bauen `exportSessions`, `offerFitsAge` (regelmäßig) und `upcomingSessionCount`.
- **E2, angezeigter Termin**: `shownSession(offer, now, range?, fits?)` in `src/domain/agenda.ts` nimmt den Termin wie bisher (`nextSession` bzw. `rangeSession`). Mit `fits` nimmt es den ersten passenden nicht beendeten Termin (im Zeitraum). Gibt es keinen, bleibt es beim bisherigen Termin. `SessionFit` ist ein Typ in `agenda.ts`, damit `agenda.ts` nicht `age.ts` importiert (sonst Zyklus). `ageCheck` nutzt `shownSession` für seinen Rückfall, die Logik steht nur einmal.
- **E3, Merkliste**: `savedOffers(…, birthDate)` sortiert nach `shownSession`, die Karte zeigt ihn, die Statuszeile zählt `fittingSessions`. Bei Kursen zählen wie bisher nur die kommenden Termine. Die Datei nimmt dagegen den ganzen Kurs (Plan 0025, E3a, unverändert). Ein gemerktes regelmäßiges Angebot ohne passenden Termin bleibt in der Liste am nächsten Termin, markiert und mit 0 Terminen in der Statuszeile. Es ist bewusst gemerkt, und der Export meldet es weiter als „passt nicht zum Alter“.
- **E4, Entdecken**: Mit „nur altersgerecht“ (Plan 0021) und Geburtsdatum bekommen `groupByNextSession` und `sessionsByDay` das Prädikat. Die Liste steht dann am ersten passenden Termin, der Kalender zeigt nur passende Termine. Die übrigen zählen dort als „ausgeblendet“ (`allIndex` bleibt ungefiltert, Plan 0008, E12). Ohne Altersfilter bleibt alles wie bisher, unpassende Angebote sind markiert.
- **Eigener Plan statt Nachtrag in 0018**: Plan 0018 ist abgeschlossen und archiviert. Die Änderung betrifft die Anzeige in zwei Tabs, nicht den Export.

## Nicht geändert

- Kurse und Einzeltermine, Export ohne Geburtsdatum, `seriesExport`, `collectionExport`.
- Zeitraumfilter: `inDateRange` prüft das Alter nicht. Ein regelmäßiges Angebot, das im Zeitraum nur unpassende Termine hat, aber später passt, steht im Zeitraum weiter am ersten Termin darin (Rückfall aus E2). Das wäre eine Änderung am Filter und ist ein Restpunkt.
- Orts-Sheet der Karte und Anbieter-Sheet (`groupByNextSession` ohne Prädikat), Navigationsgrenze des Kalenders (`lastSessionDay`). Das Detail kam mit dem Nachtrag nach dem Browser-Review dazu.

## Tests

- Unit (zuerst rot): `age.test.ts` (`sessionFit`, `fittingSessions`), `agenda.test.ts` (`shownSession`, `groupByNextSession` und `sessionsByDay` mit Prädikat), `saved.test.ts` (Sortierung der Merkliste mit Geburtsdatum, Rückfall ohne passenden Termin, Terminzahl gleich Export über `BIRTH_DATES`), `use-offer-views.test.ts` (Liste, Kalender, Altersfilter aus, Merkliste).
- E2E `e2e/saved.spec.ts`: Treff und PEKiP mit Geburtsdatum 2026-04-20. Der Treff steht am Mi 21.10. hinter PEKiP, die Statuszeile zeigt 8 + 3 = 11, die Datei hat 11 VEVENTs. Die Statuszeilen der Plan-0018-Fälle zählen jetzt wie die Datei (10, 0, 4).

## Nachtrag nach Browser-Review

Der Browser-Review live fand drei Befunde. Testfall: regelmäßiges Angebot für 24–36 Monate, Kind 22 Monate, nächster Termin Mo 12.10., erster passender Mo 30.11.

- **B1, Mittel: Das Detail zeigte den unpassenden Termin.** Die Alters-Kachel stimmte („passt ab 30.11.“), aber die Terminliste hob den 12.10. hervor, „Nur Mo 12.10.“ lud ihn, und der Zusatz lautete „14 kommende Termine“. Fix: `detailSession(offer, now, day, birthDate)` in `src/domain/age.ts` ist `referenceSession` mit `sessionFit`. `referenceSession` nimmt dafür ein optionales Prädikat und fällt ohne Kalendertag auf `shownSession` zurück. `ageCheck` nutzt `detailSession`, Kachel, Terminliste und „Nur …“ zeigen so denselben Termin. Ein gewählter Kalendertag gilt weiter, auch wenn er nicht passt. Passt kein Termin, bleibt es beim nächsten. Kurse und Einzeltermine prüft das Prädikat nicht (ADR 0007). `whenLabels(offer, now, birthDate)` zählt bei regelmäßigen Angeboten „8 passende von 14 Terminen“, wenn nur ein Teil passt. Passen alle oder keiner, bleibt „14 kommende Termine“, den Rest erklärt die Alters-Kachel.
- **B2, Minor: Die Statuszeile verschwieg unpassende Angebote.** `savedStatusParts(offers, sessions, missing)` hängt den Zusatz des Export-Toasts an: „1 Angebot mit insgesamt 0 Terminen gemerkt – 1 Angebot passt nicht zum Alter“. Beide nutzen `missingSuffix` in `format.ts`, `missing` kommt aus `collectionExport`. Die Statuszeile der Merklisten-Karte bleibt unverändert.
- **B3, Minor: Hinweise trugen das grüne Erfolgshäkchen.** Der Toast kennt jetzt eine Art (`ToastTone` in `src/ui/Toast.tsx`): `ok` mit Häkchen, `hint` mit gelbem Warndreieck (`.toast.hint`). `say(text, ms?, tone?)` setzt sie. Als Hinweis laufen „Keins der gemerkten Angebote passt zum Alter.“, „Keiner der kommenden Termine passt zum Alter.“, `EXPORT_UNAVAILABLE`, `OFFER_GONE` und „Die Kartenmitte liegt außerhalb …“.

Tests: `age.test.ts` (`detailSession`), `agenda.test.ts` (`referenceSession` mit Prädikat), `format.test.ts` (`whenLabels` mit Geburtsdatum, `savedStatusParts` mit `missing`), `use-app-state.test.ts` (Art des Toasts). E2E: `e2e/detail.spec.ts` (Treff ab 21.10. markiert, Bewegungslandschaft „2 passende von 4 Terminen“ und „Nur Di 3.11.“, Hinweis-Toast), `e2e/saved.spec.ts` (Statuszeilen mit Zusatz, Hinweis-Toast).

## Vermerk: Merge mit Plan 0025, Etappe 3

Plan 0025 (Etappe 3) ersetzt den Kalender in „Entdecken“ durch den Kalender der Merkliste. Der Teil von E4 für den Kalender in „Entdecken“ entfällt damit, `groupByNextSession` mit Prädikat bleibt. Der Kalender der Merkliste nimmt das Prädikat wie Liste, Statuszeile und Datei (E3): `sessionsByDay(saved, sessionFit(birthDate))` in `use-offer-views.ts`, unabhängig vom Altersfilter in „Entdecken“. `allIndex` ist dort derselbe Index, unpassende Termine zählen nicht als „blendet der Filter aus“. Ein gemerktes regelmäßiges Angebot ohne passenden Termin steht in der Liste am nächsten Termin (Rückfall aus E2), im Kalender an keinem Tag. Tests: `use-offer-views.test.ts`, `e2e/merkliste-kalender.spec.ts`.

## Restpunkte

- Zeitraumfilter mit Alter, siehe oben; steht in `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“.
- Detail: Der passende Termin lag in der eingeklappten Terminliste manchmal hinter den ersten vier; behoben in der Abschlussrunde von Plan 0025 (`collapsedSessions`).
- ~~Wortlaut „1 Angebot mit insgesamt 0 Terminen gemerkt“, wenn nichts passt.~~ Erledigt mit B2.
