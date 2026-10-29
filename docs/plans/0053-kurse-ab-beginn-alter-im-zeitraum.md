# Plan 0053 – Laufende Kurse ausblenden, Alter im Zeitraum, Alter aus Geburtszeitraum

Status: in Umsetzung
Datum: 2026-10-29

## Anlass

Rückmeldung des Nutzers vom 2026-10-29 (Kind 8 Monate):

1. `cl18m38e` „PEKiP Babys geb. April–Juni 2026, Di 9:30“ (Kurs ab 22.09.) steht als passend für 8 Monate in der Liste. Kurse sollen zum ersten Termin passen.
2. Kurse mit Anmeldung für die ganze Reihe sollen in der Liste nur erscheinen, solange sie noch nicht begonnen haben; kein „noch x von y“. Ausnahme Merkliste: Dort bleibt ein laufender Kurs mit Fortschritt und Export, man nimmt vielleicht teil.
3. `ws69wv8u` „Turnzwerge (1–3 J.)“ und `kihn0m03` „Krabbelgruppe Maxis (ab 13 Monate)“ (beide regelmäßig, 12–36 bzw. 13–24 Monate) stehen mit Zeitraum „diese Woche“ als passend in der Liste; das Detail sagt „passt nicht“.
4. Nach dem Teilen eines Angebots bleibt die Tab-Leiste beim Scrollen mitten auf der Seite hängen.

## Befund

1. Kurse prüft `offerFitsAge` schon am ersten Termin. `cl18m38e` hat aber **kein `age`**; ohne Angabe gilt `DEFAULT_AGE` 0–36. Die Altersgruppe steckt nur im Titel als Geburtszeitraum („geb. April–Juni 2026“). Im Datenstand vom 2026-10-29 tragen 28 Titel einen Geburtszeitraum (23 Kurse/Einzeltermine, 5 regelmäßige „Miniclub“-Gruppen); 7 der Kurse ohne `age`, andere mit grober Angabe (`a1xo7afp` „geb. Mai–Juli 2026“: 0–12). Der Prompt (`extract.md`) sagt nichts zu Geburtszeiträumen.
2. `applyFilters` (`src/domain/filter.ts`) lässt jedes Angebot mit kommendem Termin durch, also auch Kurse, die längst laufen; die Kachel zeigt dann `formatFact` „Kurs · noch x von y“.
3. `ageVisibility` (`src/domain/age.ts`) prüft das Alter über `splitByAge(upcoming, …)` **ohne Zeitraum**: Ein regelmäßiges Angebot passt, sobald irgendein kommender Termin passt (hier Termine ab März 2027). `shownSession` findet im Zeitraum keinen passenden Termin und fällt auf den Termin im Zeitraum zurück (`?? base`). Die Liste zeigt also den Termin dieser Woche als passend, das Detail prüft genau diesen Termin und sagt „passt nicht“.
4. Nicht reproduzierbar ohne Gerät (natives Teilen-Menü). Kein Scroll-Lock, kein `visualViewport` im Code. Braucht Gerät/Browser vom Nutzer; nicht Teil dieses Plans (siehe Offen).

## Entscheidungen

**E1 – Laufende Kurse fallen aus „Entdecken“, Merkliste ausgenommen.** Neue reine Prädikate in `src/domain/agenda.ts`:
- `startedCourse(offer, now)`: `format === "kurs"`, `registration === "mit-anmeldung"` und der erste Termin hat begonnen (`Date.parse(first.start) <= now`). Ein Kurs ohne Anmeldung (Datenstand: 1) bleibt, in den kann man einsteigen.
- `discoverable(offer, now)`: kommender Termin (`nextSession`) und nicht `startedCourse`. Die eine Regel für alles außer der Merkliste.

Nutzer von `discoverable`:
- `applyFilters` (Liste, Karte, Statuszeile, Anbieter-Tab über `ProviderScreen`), außer mit `FilterContext.runningCourses === true`. Die Option setzt nur `applySavedFilter` (`src/domain/saved.ts`): Merkliste, ihr Kalender und Export bleiben wie bisher (`savedOffers` nutzt `applyFilters` nicht).
- `providerOffers` (`src/domain/directory.ts`, Anbieter-Sheet und Vorschauseite `p/<publicId>/` über `scripts/lib/share-pages.ts`, „N kommende Angebote“): sonst zeigte das Sheet laufende Kurse, die Zeile im Tab wäre aber blass, und `hasOffersOutside` behauptete einen Filter (Review M2).
- `welcomeStats` (`src/domain/onboarding.ts`): „wie die Statuszeile“.
- Wochen-Nachricht (`src/domain/news.ts`): `newOfferIds` und `offersInWeek` zählen gestartete Kurse nicht (sonst meldete sie etwas, das die Liste nicht zeigt). Ein Kurs, dessen erster Termin in den 7 Tagen liegt, zählt weiter.

Folgen: Ein Anbieter, der nur laufende Kurse hat, wird im Tab blass, sein Sheet sagt „keine kommenden Angebote“ (nichts davon ist buchbar; bewusst akzeptiert, Browser-Review prüft den Text). `upcoming` in `useOfferViews` (Grundlage für `unfitIds`, `dataEnd` und den Startausschnitt der Karte) behält laufende Kurse (`runningCourses: true`, Review 2, M1): Sonst verlöre ein gemerkter laufender Kurs auf der Merkliste die Markierung „passt nicht“; Datenende und Startausschnitt bleiben wie bisher. Das Detail per Link bleibt unverändert („noch x von y“), ebenso `formatFact`: In „Entdecken“ erreicht ihn kein laufender Kurs mehr, auf der Merkliste ist der Fortschritt erwünscht. Ein Kurs verschwindet mit Beginn des ersten Termins; „jetzt“ erneuert sich minütlich (`useNow`).

**E2 – Alter mit Zeitraum.** `offerFitsAge(offer, birthDate, now, range?)`: Regelmäßige Angebote passen nur, wenn ein nicht beendeter, passender Termin **im Zeitraum** liegt (`inRangeDay`). Kurse und Einzeltermine unverändert (erster Termin). `splitByAge` reicht `range` durch.
- `ageVisibility(filtered, upcoming, birthDate, now, { ageOnly, range })` liefert `visible` und `unfitCount` mit Zeitraum, dazu **zwei** Mengen (Review M1): `unfitIds` ohne Zeitraum (wie bisher, für Karten in Merkliste, Sheets, Detail-Umfeld) und `listUnfitIds` mit Zeitraum (nur Liste und Karte in „Entdecken“).
- `App.tsx` gibt ListView und Karte von „Entdecken“ einen Kartenkontext mit `listUnfitIds`; alle anderen behalten `ctx`. Sonst bekäme ein gemerktes regelmäßiges Angebot auf der Merkliste „passt nicht“, weil in „Entdecken“ ein Zeitraum gewählt ist (`route.filter.range` bleibt beim Tabwechsel).
- Ohne Zeitraum bleibt Plan 0028 (passend, wenn irgendein kommender Termin passt; die Liste steht am ersten passenden Termin), beide Mengen sind dann gleich.

**E3 – Alter aus dem Geburtszeitraum, im Build.** Neues reines Modul `scripts/pipeline/lib/cohort.ts`:
- `birthCohort(title)` erkennt nach „geb.“ bzw. dem **Wort** „geboren“ (Wortgrenze, „Neugeborene“ trifft nicht) die Formen `April–Juni 2026`, `Dez. 2025–Feb. 2026`, `Sept.–Okt. 2026`, `Sep.–Nov. 2026`, `Juni–August 2026`, `März–Apr. 2026`, `Mai 2026`, `Jan. bis März 2026`, `02-06/2026`, `04/2024-07/2024`, `09/2025–01/2026`, `03/2026` (Bindestrich, Halbgeviert, „bis“). Ein vorangestellter Kurszeitraum („Nov. 2026–Feb. 2027 (Babys geb. März–Apr. 2026)“) stört nicht, gesucht wird ab „geb.“. Ergebnis: erster und letzter Monat (`YYYY-MM`) oder `undefined` (ohne Jahr, Monat außerhalb 1–12).
- **Jahresregel**: Steht nur ein Jahr am Ende und ist der erste Monat größer als der letzte („Nov.–Feb. 2026“), gehört der erste Monat ins Vorjahr (Nov. 2025–Feb. 2026). Steht das erste Jahr da, gilt es.
- `cohortAge(cohort, at)`: vollendete Monate am Termin `at` (`ageInMonths`, `src/domain/age.ts`): `minMonths` für ein Kind vom letzten Tag des letzten Monats (nicht unter 0), `maxMonths` für eines vom 1. des ersten Monats. Liegt der Termin vor dem ersten Geburtsmonat, `undefined` (die Angabe des Modells bleibt).
- `fromRaw` in `build-offers.ts`: Für **Kurse und Einzeltermine** mit Geburtszeitraum im Titel ersetzt `cohortAge` am ersten Termin des Angebots das `age` des Modells (bei `einmalig` je Termin). **Reihenfolge**: Die Ersetzung liegt vor der Prüfung „erst ab > 36 Monaten – entfällt“ und vor der Kappung auf 36; ein Kurs für einen alten Jahrgang (`04/2024-07/2024` im Jahr 2027) entfällt also wie jeder andere über 36 Monate. Regelmäßige Angebote nicht: Ihre Altersgruppe wächst mit, ein festes `age` wäre ab dem nächsten Monat falsch (Offen).
- Gespeichert wird ein abgeleiteter Wert (`docs/architecture.md`, „Abgeleitete Werte werden berechnet, nie gespeichert“). Zulässig, weil `age` ohnehin eine Angabe des Builds im Datenvertrag ist (bisher vom Modell abgeschrieben) und die Website es nicht aus dem Titel nachrechnen soll (der Titel ist Freitext). Der Build ersetzt nur die Quelle desselben Felds.
- Prompt unverändert: Die Ableitung hängt nicht am Modell.
- IDs: `age` wirkt in `sameOfferTwice` (`compatibleAge`, Dubletten und Zwillinge) und in `sameAttributes` (Schritt 3, nur regelmäßige Angebote, also nicht betroffen), nicht in den Stufen 1/2 der Zuordnung.
- Abnahme der IDs (Review B1: `--build-only` schreibt `data/`, `--dry-run` wirkt dort nicht): `pnpm pipeline nightly --build-only` vor und nach der Änderung, jeweils `data/offers.json` in den Scratchpad kopieren und sofort `git checkout -- data/ && git clean -fdq data/` (nie committen); verglichen werden die ID-Mengen und die geänderten `age`-Werte.
- Live wirkt E3 ab dem nächsten Nachtlauf; `data/offers.json` wird nicht von Hand geändert (CLAUDE.md).

**E4 – Doku.** `docs/architecture.md`: Invariante „Altersprüfung“ um den Zeitraum (E2) und die Sichtbarkeit laufender Kurse (E1) ergänzen, Zeile `scripts/pipeline/lib/` um `cohort`. ADR 0003 bekommt einen Nachtrag (regelmäßig: „irgendein Termin“ heißt mit Zeitraum „irgendein Termin im Zeitraum“; laufende Kurse mit Anmeldung nur auf der Merkliste).

**Verworfen:** ein Schemafeld `birthCohort` (exakt auch für regelmäßige Gruppen, aber Schemaänderung samt Export und Prompt, für 5 Miniclub-Gruppen). Eintrag in `docs/ideas.md`.

## Dateien

- `src/domain/agenda.ts`: `startedCourse`, `discoverable`.
- `src/domain/filter.ts`: `applyFilters` mit `runningCourses`.
- `src/domain/saved.ts`: `applySavedFilter` setzt `runningCourses: true`.
- `src/domain/directory.ts`: `providerOffers` über `discoverable`.
- `src/domain/onboarding.ts`: `welcomeStats` über `discoverable`.
- `src/domain/news.ts`: `newOfferIds`, `offersInWeek` ohne gestartete Kurse.
- `src/domain/age.ts`: `offerFitsAge`, `splitByAge`, `ageVisibility` mit `range`, `listUnfitIds`.
- `src/ui/use-offer-views.ts`: `range` an `ageVisibility`, `listUnfitIds` heraus.
- `src/ui/App.tsx`: Kartenkontext für Liste und Karte in „Entdecken“.
- `scripts/pipeline/lib/cohort.ts` (neu) mit Test, `scripts/pipeline/lib/build-offers.ts`.
- `docs/architecture.md`, `docs/adr/0003-datenmodell.md` (Nachtrag), `docs/ideas.md`.
- `e2e/detail.spec.ts` (H8 per Deep-Link), neue Fälle in `e2e/saved.spec.ts` bzw. `e2e/detail.spec.ts` (siehe Tests).

## Schritte

1. Unit-Tests rot, dann Domäne (E1, E2), dann UI-Verdrahtung, dann Pipeline (E3). `pnpm exec vitest related` in der Schleife.
2. `pnpm verify` grün.
3. `pnpm e2e:local --affected`, dazu `--smoke` (Vorschauseiten), im Hintergrund.
4. ID-Abnahme nach E3 (oben).
5. `/arch-review` (neues Modul, mehr als 200 Zeilen).
6. `/browser-review` lokal: Liste mit Geburtsdatum und Zeitraum, Merkliste mit laufendem Kurs, Anbieter-Sheet.
7. Commit auf `main`, Push, CI beobachten, `meta.json` prüfen, `/browser-review live`.

## Tests

1. `startedCourse`/`discoverable`: Kurs mit Anmeldung vor/an/nach Beginn des ersten Termins; Kurs ohne Anmeldung; regelmäßig nie; ohne kommenden Termin nie `discoverable`.
2. `applyFilters`: gestarteter Kurs fehlt, mit `runningCourses` da; ungestarteter Kurs da.
3. `applySavedFilter`: gestarteter gemerkter Kurs bleibt.
4. `newOfferIds`, `offersInWeek`: gestarteter Kurs zählt nicht; Kurs mit Beginn in 3 Tagen zählt.
5. `providerOffers`, `welcomeStats`: gestarteter Kurs fehlt.
6. `ageVisibility` mit Zeitraum: regelmäßiges Angebot 12–36 Monate, Kind 8 Monate, Zeitraum diese Woche → in `listUnfitIds`, mit `ageOnly` ausgeblendet, `unfitCount` 1; in `unfitIds` nicht (passt später). Ohne Zeitraum passend (Plan 0028). Kurs im Zeitraum unverändert.
7. `birthCohort`: alle Formen aus E3; ohne Jahr, „Neugeborene“, „Gebersdorf“, Monat 13 → `undefined`; „Nov.–Feb. 2026“ → 2025-11 bis 2026-02.
8. `cohortAge`: „geb. April–Juni 2026“ am 22.09.2026 → 2–5; teils ungeborene → min 0; Termin vor dem Geburtszeitraum → `undefined`.
9. `buildOffers`: Kurs mit „geb. …“ und Modell-`age` 0–12 bekommt das abgeleitete Alter; Einzeltermine je Termin; regelmäßiges Angebot behält seins; Kurs für Jahrgang 2024 im Jahr 2027 entfällt.
10. E2E (Fixtures, `reloadAt` 20.10., PEKIP `nle21y1x` läuft seit 13.10.): H8 („laufender Kurs zählt die übrigen Termine“) öffnet per Deep-Link statt aus der Liste; neu: PEKIP fehlt in „Entdecken“, gemerkt steht er auf der Merkliste mit „noch … von …“. Spec in `SPEC_COVERS` prüfen.

11. E2E Zeitraum und Alter (Review 2, M3; Fixtures, Uhr 5.10.): Treff 6–24 Monate, Geburtsdatum 20.4.2026, Zeitraum 5.–11.10.: mit „nur altersgerecht“ fehlt der Treff; ohne den Altersfilter ist er markiert, und sein Detail sagt „passt nicht“; gemerkt ist er auf der Merkliste nicht markiert.
12. `useOfferViews`: gemerkter laufender Kurs fehlt in `visible`, steht auf der Merkliste und in `unfitIds`.

## Offen

- Punkt 4 (Tab-Leiste nach Teilen): braucht Gerät, Browser und ob in der installierten App; danach eigener Plan oder Kleinänderung.
- Regelmäßige Gruppen mit Geburtszeitraum (Miniclub): siehe `docs/ideas.md`.
- Datenlücke: Nennt eine Quelle die vergangenen Termine eines laufenden Kurses nicht mehr, beginnt er in den Daten mit einem künftigen Termin und gilt als ungestartet. Bekannt aus ADR 0022 (Stufe 0); kein Schutz in diesem Plan.
- Leerzustand mit „Format: Kurs“, wenn nur laufende Kurse da wären: kein eigener Text, die Liste sagt wie bisher „nichts gefunden“. Idee in `docs/ideas.md`, falls es auffällt.

## Review (2026-10-29) – Verdict: Überarbeiten → eingearbeitet

Übernommen:
- **B1** `--build-only --dry-run` schreibt doch nach `data/`: Abnahme umgeschrieben (kopieren, sofort zurücksetzen, nie committen).
- **M1** `unfitIds` global: zwei Mengen, Kontext nur für „Entdecken“ (E2).
- **M2** Anbieter-Sheet und Willkommenszahlen: über `discoverable` (E1).
- **M3** E2E H8 kippt: per Deep-Link, neue Spec-Fälle (Test 10).
- **M4** Invariante und ADR: E4.
- Minor 1 `offersInWeek`: ausgeschlossen (E1). Minor 2 IDs-Satz korrigiert. Minor 3 Reihenfolge festgelegt, Test 9. Minor 4 Jahresregel festgelegt, Test 7. Minor 5 Wortgrenze, Test 7. Minor 6 Zahlen und Formen korrigiert. Minor 7 begründet (E3). Minor 8 Schritte ergänzt. Minor 9 `dataEnd` in E1 genannt. Minor 10 unter Offen.

Abgelehnt: keine.

## Review 2 (2026-10-29) – Verdict: Freigabe mit Änderungen → eingearbeitet

Übernommen:
- **M1** `unfitIds` verlor gemerkte laufende Kurse: `upcoming` in `useOfferViews` mit `runningCourses: true` (E1, Folgen), Test 12.
- **M2** Vorschauseiten nutzen `providerOffers`: folgen der Regel aus „Entdecken“ (E1), `--smoke` in Schritt 3.
- **M3** Verdrahtung Liste/Karte gegen Merkliste nur per Domänentest: E2E (Test 11).
- Minor 1 Invariante „Ein Datenvertrag“ um `age` ergänzt. Minor 2 `docs/ideas.md`, „Einstieg in laufende Kurse“, umgeschrieben. Minor 3 Basis der ID-Abnahme: Der Vorher-Lauf lief vor jeder Änderung am selben Tag (Arbeitsbaum sauber bis auf den Plan). Minor 4 unter Offen. Minor 5 bewusst akzeptiert (E1, Folgen). Minor 6 Statuszeile von ADR 0003 verweist auf den Nachtrag. Minor 7 Negativfälle „geb. ab …“ und „geb. 1.1.–30.6.2026“ in Test 7.

Abgelehnt: keine.

## Umsetzung (2026-10-29)

- **ID-Abnahme** (E3): `--build-only` vor und nach der Änderung am 2026-10-29, danach `data/` zurückgesetzt. 431 Angebote vorher und nachher, gleiche ID-Menge; geändert ist nur `age` bei 17 Kursen mit Geburtszeitraum (7 davon vorher ohne `age`), sonst nichts. `cl18m38e` bekommt 2–5 Monate (Beginn 22.09.), passt also nicht mehr zu 8 Monaten.
- **Nachtrag zu E3**: Beim Kurs rechnet der Build das Alter erst nach der Fortschreibung um vergangene Termine (`courseCohortAge` nach `assignIds`), sonst zählte der erste Termin der Quelle ab heute statt des Kursbeginns (beim ersten Probelauf 4–7 statt 2–5 für `cl18m38e`).
- **Umgebung**: `scripts/heavy.test.ts` („… danach ist die Gruppe leer (M2)“) ist in der Cloud-Session rot, auch ohne diese Änderung: PID 1 (`process_api`) räumt verwaiste Prozesse nicht ab, sie bleiben Zombies, und `kill(-pgid, 0)` sieht die Gruppe als lebend. Nicht Teil dieses Plans; die CI prüft ihn.

## Arch-Review (2026-10-29) – Verdict: Nacharbeit nötig → behoben

- **M1** Einzeltermine mit Geburtszeitraum konnten später über 36 Monate wachsen (ungültiges `AgeRange`, Nachtlauf rot): Prüfung je Termin, zu alte Termine entfallen mit Hinweis; Test.
- m1, m2 Invariante „Laufende Kurse“ in `docs/architecture.md` präzisiert (zweiter Nutzer von `runningCourses`, Vorschauseite, `startedCourse` für die Wochenzahl).
- m4 Gegenprobe im E2E: kurz vor Kursbeginn steht PEKiP in der Liste.
- m3 (E2E für die Karte in „Entdecken“ mit Zeitraum) nicht übernommen: Liste und Karte bekommen denselben Kontext `discoverCtx` an zwei benachbarten Stellen in `App.tsx`; die Liste prüft der neue Fall in `zeitraum.spec.ts`, eine Karten-Spec kostet einen Kartenstart mit Kachel-Wächter für eine Zeile Verdrahtung. Browser-Review prüft die Karte.

## Browser-Review (2026-10-29, lokal, Fixture-Build)

Standardansichten `start` und `merkliste` (alle Viewports, hell/dunkel) unverändert. Eigene Zustände auf 390×844 hell/dunkel (Uhr per Playwright):
- 20.10. „Entdecken“: 6 statt 7 Angebote, PEKiP (läuft seit 13.10.) fehlt; nichts verrutscht.
- 20.10. Merkliste mit PEKiP und Treff: PEKiP mit „Kurs · noch 6 von 8“, Statuszeile „2 Angebote mit insgesamt 9 Terminen“.
- Zeitraum 5.–11.10., Kind 5 Monate, Altersfilter aus: Treff gestrichelt mit „6–24 Monate“, Hinweis „Zeigt auch 1 Angebot, das nicht zu 5 Mon. passt“; Detail „Passt nicht: am Mi 7.10. 5 Monate alt · passt ab 21.10.“, also wie die Liste.
- Checkliste: Lesbarkeit, Daumenbereich, Dark Mode, Micro-Interactions unverändert (keine neuen Bedienelemente); Zustände: Leerzustand mit nur laufenden Kursen siehe Offen.
- Lokal nicht prüfbar: Das LCP-Budget der Smoke-Specs reißt in dieser Cloud-Session auch ohne die Änderung (2724 ms auf dem Ausgangsstand); entscheidend ist die CI.
