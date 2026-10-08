# Plan 0028 – Merkliste und Entdecken nur mit altersgerechten Terminen

Status: in Umsetzung
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
- Orts-Sheet der Karte und Anbieter-Sheet (`groupByNextSession` ohne Prädikat), Detail (`referenceSession`), Navigationsgrenze des Kalenders (`lastSessionDay`).

## Tests

- Unit (zuerst rot): `age.test.ts` (`sessionFit`, `fittingSessions`), `agenda.test.ts` (`shownSession`, `groupByNextSession` und `sessionsByDay` mit Prädikat), `saved.test.ts` (Sortierung der Merkliste mit Geburtsdatum, Rückfall ohne passenden Termin, Terminzahl gleich Export über `BIRTH_DATES`), `use-offer-views.test.ts` (Liste, Kalender, Altersfilter aus, Merkliste).
- E2E `e2e/saved.spec.ts`: Treff und PEKiP mit Geburtsdatum 2026-04-20. Der Treff steht am Mi 21.10. hinter PEKiP, die Statuszeile zeigt 8 + 3 = 11, die Datei hat 11 VEVENTs. Die Statuszeilen der Plan-0018-Fälle zählen jetzt wie die Datei (10, 0, 4).

## Restpunkte

- Zeitraumfilter mit Alter, siehe oben.
- Wortlaut „1 Angebot mit insgesamt 0 Terminen gemerkt“, wenn nichts passt.
