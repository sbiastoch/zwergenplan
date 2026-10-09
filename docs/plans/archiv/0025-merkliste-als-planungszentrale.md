# Plan 0025 – Merkliste als Planungszentrale: Anbieter merken, Karte, Kalender, Filter

Status: abgeschlossen, live seit 3cb0740 (2026-10-09)
Datum: 2026-10-08
Mockup: https://claude.ai/artifact/QMwK1e16a2GQPKbVtMwMx9 (Design-Canvas, Stand „Feedback 2“, vom Nutzer am 2026-10-08 freigegeben)
Bezug: Plan 0003 (E12 Merkliste, E14 Kalender), Plan 0005 (Karte, E5 Umschalter), Plan 0007 (E2 „jetzt“, E5 Monatsknopf), Plan 0008 (E12 Leerzustände), Plan 0010 (E2 Tab-Leiste, E3 Anbieter-Sheet, E6 `anbieter.json`), Plan 0018 (ICS altersgerecht), Plan 0021 (Altersfilter), ADR 0007, ADR 0008, ADR 0010, ADR 0012, ADR 0013, ADR 0018, ADR 0019
Abhängigkeiten: **alle erfüllt**, seit `main` `d5fab1b` (Plan 0022–0024 umgesetzt; geprüft am 2026-10-08, Abschnitt „Abgleich mit `main`“). Der Plan ist gegen diesen Stand geschrieben.
- **Plan 0022** (`docs/plans/archiv/0022-feedback-kleinigkeiten.md`): „Sticker/Stickerheft“ ist aus der UI verschwunden. Die Merkliste heißt „Meine Merkliste“ (`SavedView.tsx:92`), der Leerzustand „Noch nichts gemerkt“ (`:94`), die Toasts „Gemerkt – liegt jetzt auf deiner Merkliste“ und „Nicht mehr gemerkt“ (`App.tsx:162`).
- **Plan 0023** (`docs/plans/archiv/0023-zeitraumfilter.md`): Das reine Modul `src/domain/date-range.ts` liefert
  - `type DateRange = { from: string; to?: string } | { from?: string; to: string }` (`:9`, Union: mindestens eine Grenze),
  - `notEnded(now)` (`:12`), `dateRange(a, b)` (`:18`, normalisiert, tauscht, verwirft Ungültiges),
  - `fieldLimits(range, today)` (`:38`) und `checkBound(value, limits)` (`:53`) für die Datumsfelder,
  - `rangeSession(offer, range, now)` (`:70`): der maßgebliche Termin im Zeitraum,
  - `inDateRange(offer, range, now)` (`:79`): Kurs passt mit erstem Termin im Zeitraum, regelmäßig/einmalig mit irgendeinem Termin.

  `FilterState.range?: DateRange` (`filter.ts:26`) steht in der URL als `von=`/`bis=` (`filterFromSearch` `:62`, `filterToSearch` `:83–84`). `withDateRange(state, from, to)` (`:128`) setzt ihn. `applyFilters` prüft ihn mit `inDateRange` (`:163–168`), `activeFilterCount` zählt ihn als 1 (`:105`). `searchOf` in `src/domain/searches.ts:16` lässt den Zeitraum für Such-Abos weg. Die Liste gruppiert über `groupByNextSession(visible, now, range)` (`agenda.ts:62–65`, `use-offer-views.ts:124–125`). Die Datumsfelder stehen im `FilterSheet` (`Sheets.tsx:108ff.`).
- **Plan 0024** (`docs/plans/archiv/0024-karte-im-app-look.md`): Kategorie-Symbole als Marker (`src/ui/map/marker-images.ts`, Kreis in `layers.ts`), Grundkarte in App-Farben (`src/ui/map/basemap.ts`). Die Kategorie eines Ortes ist die häufigste unter den übergebenen Angeboten (`src/ui/map/geojson.ts:45–49`), auf der Merkliste also die der gemerkten. Die Merkliste erbt das ohne eigenen Code.

## Ziel

Nutzerwünsche vom 2026-10-08 (Nummern aus der Feedback-Liste):

- **8.** „Man soll auch Anbieter merken können.“
- **9.** „Auf der Merkliste soll es auch eine Karte geben.“
- **10.** „Auf der Merkliste soll man auch filtern können, wichtig ist hier vor allem nach Format und Anmeldung, sowie vielleicht über einen Regler ab wann ein möglicher Beginn der anzuzeigenden Kurse ist, damit man einen neuen Kurs als Ersatz für einen auslaufenden suchen und sich dafür früh anmelden kann.“
- **11.** „Der Kalender sollte nur die eigenen gemerkten Termine anzeigen, sodass man damit seine Woche planen kann. Die Wochen- oder Monatsansicht dient dabei gleichzeitig als Filter für einen Tag, Woche oder Monat.“

Verbindliche Nutzerentscheidungen (2026-10-08):

- **a)** Der eigene Tab „Kalender“ entfällt. Die Merkliste bekommt wie „Entdecken“ einen Umschalter **Liste | Karte | Kalender**. Alle Angebote nach Datum durchsuchen geht künftig über den Zeitraumfilter (Plan 0023).
- **b)** „Beginn ab“ ist kein eigener Regler. Es nutzt dieselbe Zeitraumlogik wie die Startseite, ergänzt um Schnellwahlen „ab nächstem Monat“, „in 2 Monaten“, „in 3 Monaten“ (die Daten reichen ca. 4 Monate). Nach dem Review (Simplicity) gibt es auf der Merkliste **nur** diese Schnellwahlen, direkt als Chips. Die freie Datumseingabe bleibt der Startseite vorbehalten (E7).

Nutzerentscheidungen aus dem Mockup (Feedback 1 und 2, 2026-10-08):

- **c)** Die drei Tabs heißen **Angebote · Anbieter · Merkliste**. „Entdecken“ wird zu „Angebote“ (E8). Wo der Plan „Entdecken“ schreibt, meint er diesen Tab; der Routenwert bleibt `entdecken`.
- **d)** Gemerkte Anbieter stehen **oben im Tab „Anbieter“**, nicht auf der Merkliste. Das Suchfeld steht ganz oben, gemerkte Anbieter tauchen darunter nicht noch einmal auf, und jede Zeile hat ein Herz zum Merken (E3).
- **e)** Auf der Merkliste geht der Umschalter über die ganze Breite. Statt „5 gemerkt“ und der Export-Zeile gibt es eine Zeile „5 Angebote mit insgesamt 28 Terminen gemerkt“, daneben ein kompakter Export-Knopf nur mit Icon (E3a, E9).

Die Merkliste wird damit vom Sammelkorb zur Planungszentrale:
- was ich vorhabe (gemerkte Angebote),
- wo es ist (Karte),
- wann es ist (Kalender als Wochenplaner).

Bei wem ich weitersuchen will (gemerkte Anbieter), steht oben im Tab „Anbieter“.

UX-Leitlinien:

1. **Eine Merkliste, drei Blicke.** Liste, Karte und Kalender zeigen dieselben gemerkten Angebote mit denselben Filtern. Nur die Darstellung wechselt.
2. **Merklisten-Filter und Startseiten-Filter sind getrennt.** Wer auf der Merkliste „nur Kurse“ wählt, ändert nichts an „Entdecken“, und umgekehrt.
3. **Der Kalender ist der Wochenplaner.** Er zeigt nur Gemerktes. Tag, Woche oder Monat im Kalender bestimmen, was darunter steht.
4. **Nichts Gemerktes verlässt das Gerät.** Gemerkte Anbieter liegen wie gemerkte Angebote nur im `localStorage`, nie in URL oder Request.
5. **Keine Sackgasse.** Jeder Leerzustand sagt, warum er leer ist, und bietet den nächsten Schritt an.
6. **Einfach.** Je Aufgabe genau eine Bedienung, kein zusätzliches Sheet.

## Nicht-Ziele

- **Kein Kalender in „Entdecken“.** Der Umschalter dort bleibt Liste | Karte. Wer alle Angebote nach Datum sucht, nutzt den Zeitraumfilter (Entscheidung a).
- **Keine weiteren Filter auf der Merkliste** außer Format, Anmeldung und den drei Schnellwahlen „ab …“. Kategorie, Kosten, Wegzeit, Alter und eine freie Datumseingabe gibt es dort nicht (N4).
- **Keine Schnellwahlen auf der Startseite** durch diesen Plan. Ob das Filter-Sheet der Startseite sie bekommt, entscheidet Plan 0023 bzw. ein Folgeplan.
- **Der Altersfilter gilt auf der Merkliste weiterhin nicht** (Plan 0021, Nicht-Ziele). Unpassende gemerkte Angebote bleiben markiert sichtbar, auch im Kalender.
- **Der Merklisten-ICS-Export bleibt, wie er ist** (ADR 0007, ADR 0018). Er nimmt alle gemerkten Angebote, unabhängig vom Merklisten-Filter (E9; Alternative in N3).
- **Keine Angebote gemerkter Anbieter in Liste, Karte oder Kalender der Merkliste**, und die Merkliste zeigt keine Anbieter. Gemerkte Anbieter sind eine Adressliste oben im Tab „Anbieter“ (E3). Die Erweiterung steht in `docs/ideas.md` (N1).
- **Keine Benachrichtigung über neue Angebote gemerkter Anbieter** (Wochen-Push, Plan 0017).
- **Merklisten-Filter stehen nicht in der URL** und überstehen kein Neuladen (E6).
- **Keine rollende Kalenderwoche** (`docs/ideas.md`, Befund H2): Die Woche bleibt Mo–So.
- **Kein Lazy-Chunk für die Merkliste**, solange das Start-Budget es nicht verlangt (E11).
- **Kein Merken von Orten**, nur von Angeboten und Anbietern.

## Ausgangslage

Stand `main` `d5fab1b` (nach Plan 0022–0024).

**Merkliste**
- `src/ui/SavedView.tsx:71–120`:
  - Überschrift „Meine Merkliste“ (`:92`, Plan 0022).
  - Leerzustand „Noch nichts gemerkt“ mit „Angebote entdecken“ (`:94`).
  - Knopf „Alle in den Kalender“ (Sammel-ICS, ADR 0007).
  - Zeile „N gemerkt · M Termine in einer .ics-Datei · Kurse immer komplett“ (`:109`).
  - Je gemerktem Angebot eine `OfferCard` (`dated`) mit dem nächsten Termin.
  - Es gibt keinen Filter, keinen Umschalter und keine Statuszeile.
- `src/ui/SavedView.tsx:29–57` ist der einzige Lader des Export-Chunks `src/domain/ics.ts` (`ics-entry-only`, `LAZY_LOADERS` in `scripts/check-architecture.ts:60`). `preloadExportWhenIdle` startet in `App.tsx:88`. Plan 0018 (freigegeben, noch nicht umgesetzt) verlegt den Lader nach `src/ui/ics-export.ts`.
- **Nachtrag (2026-10-08):** Plan 0018 ist umgesetzt. Der Lader liegt jetzt in `src/ui/ics-export.ts`, `SavedView` importiert ihn von dort (E9, zweiter Fall). Die Auswahl der Merkliste trifft `collectionExport`, den Text unter dem Knopf `savedExportNote` in `src/ui/format.ts`. E9 erweitert `savedExportNote` um den Filter, statt ein neues `exportNote` anzulegen. Zeilenangaben zu `SavedView.tsx` und `saved.ts` in diesem Abschnitt sind vor Etappe 1 neu zu prüfen.
- `src/domain/saved.ts:9–29`:
  - `toggleId`,
  - `savedOffers(offers, ids, now)`: nur mit kommendem Termin, sortiert nach dem nächsten Termin,
  - `collectionSessions`: die Auswahl für den Export (seit Plan 0018 `exportSessions` je Angebot und `collectionExport` für die Merkliste).
- `src/data/preferences.ts:7–13, 41–52`: Schlüssel `zwergenplan.merkliste`, `loadSaved()`/`saveSaved()` als JSON-Array von IDs.
- `src/ui/use-app-state.ts:130–143`: `useSaved()` liefert `[ids, toggle]`. `toggle` meldet, ob das Angebot danach gemerkt ist.
- `src/ui/App.tsx`:
  - `:160–164` `onToggleSave` mit Toast („Gemerkt – liegt jetzt auf deiner Merkliste“ / „Nicht mehr gemerkt“, `:162`).
  - `:244` blendet die Kategorie-Sticker auf der Merkliste aus, `:245` die Schnellfilter.
  - `:278` zeigt Statuszeile und Hinweise auf allen Tabs außer der Merkliste.
  - `:409–415` rendert `SavedView`.
- `src/ui/use-offer-views.ts:152`: `saved = savedOffers(offers, savedIds, now)`. `App.tsx:418` zeigt `saved.length` als Badge.
- **ADR 0010** (`.dependency-cruiser.cjs:221–226`, `data-domain-runtime-allowlist`): `src/data` darf zur Laufzeit aus `src/domain` nur `geo.ts` importieren. Eine Formprüfung mit `KEBAB_ID_PATTERN` gehört deshalb nicht nach `preferences.ts` (Review B1).

**Kalender (Tab, entfällt)**
- `src/domain/route.ts`:
  - `:9` `MAX_PROVIDER_ID = 80` (nicht exportiert).
  - `:15` `TABS = ["entdecken", "karte", "kalender", "anbieter", "merkliste"]`. Ein unbekanntes `ansicht=` ergibt „entdecken“ (`parseRoute`, `:34`).
  - `:19` `tabSection` macht aus „karte“ „entdecken“.
- `src/ui/Chrome.tsx:130–136`: `TAB_ITEMS` mit vier Tabs.
- `src/ui/styles/tabs.css` ist fest auf vier gestellt: Kopfkommentar `:1`, `repeat(4, …)` `:13`, Daumenbreite `/ 4` `:49`, Seitenleiste `/ 4` `:187`, Kommentar `:197`. `docs/architecture.md:119` (Mobile-UX, „Tab-Leiste“) sagt „vier Spalten“.
- `src/ui/Chrome.tsx:179–200`: `ViewToggle({ map, onMap })` hat fest zwei Segmente (Klasse `seg seg2`, Daumen per `translateX`).
  - **`.seg2` hat kein eigenes CSS.** Die Breite des Daumens steht in `src/ui/styles/map.css:33–38` (`.view-toggle .seg-thumb { width: 50% }`).
  - `fieldset.view-toggle` ist auf `flex: 0 1 12rem` gedeckelt.
  - **`.seg3` gibt es schon** (`chrome.css:319–349`): Das ist der Darstellungs-Umschalter Hell/Dunkel/Auto im Kind-Sheet, mit `overflow-wrap: break-word` und einer Container-Query, die ihn im schmalen Sheet einspaltig macht. Er passt nicht für den Umschalter in der Statuszeile (Review M2).
- `src/ui/CalendarView.tsx` (355 Zeilen) enthält `WeekStrip`, `MonthGrid`, `AgendaEmpty` und die Agenda eines Tages.
  - Das Monatsraster klappt beim Tipp auf einen Tag zu (`CalendarView.tsx:123–126`).
  - Der Monatsknopf hält beim Auf- und Zuklappen seine Lage (`useLayoutEffect`, Plan 0007, E5).
- `src/ui/use-offer-views.ts`:
  - `:59–78` Schnittstelle `calendar.{index, allIndex, lastDay, dataEnd, endedToday, day, setDay, monthOpen, setMonthOpen}`, `:87` `map`,
  - `:124–125` die Gruppierung der Liste mit Zeitraum (Plan 0023),
  - `:126–146` die Kalender-Rechnungen, nur bei `route.tab === "kalender"` gefüllt,
  - `:148–151` `map` mit `placeCount: countPlaces(visible)` und `cameraOffers: upcoming`, nur bei `route.tab === "karte"`,
  - `:169–179` Rückgabe `calendar`.
- `src/domain/calendar.ts`: `clampDay`, `calendarNav(day, today, lastDay)` mit Woche/Monat vor und zurück.
- `src/domain/agenda.ts:94–175`: `sessionsByDay`, `DayAgenda`, `dayAgenda`, `endedOnDay`, `weekDays`, `monthDays`, `lastSessionDay`.
- `src/ui/App.tsx`:
  - `:124–126` Öffnen der Karte ist ein Wegzeit-Anlass (`want()`, `:125`), weil dort „Kartenmitte als Startpunkt“ steht.
  - `:355–373` `MapPanel` mit `offers={visible}` (Startseiten-Filter), sobald `views.map` gesetzt ist.
  - `:374–392` Kalender-Zweig samt `ListPending` bei `wegzeit=` (Plan 0009, M7). Seit Plan 0023 (E8) zeigt er bei aktivem Zeitraum die gefilterten Angebote mit allen ihren Terminen.
- `src/ui/OfferCard.tsx:45, 76`: `calendarDay` geht ans Detail (`referenceSession`, `agenda.ts:36`).
- Kein Push-, Service-Worker- oder ICS-Pfad kennt `ansicht=kalender`. Geprüft per grep in `src/sw`, `scripts/push-weekly.ts` und `public/manifest.webmanifest`; `start_url` ist `./`. Nur diese Skripte nennen ihn:
  - `scripts/screenshots.ts:77` (Ansicht `kalender`),
  - `scripts/font-fallback.ts:139` (das Wort „Kalender“ als Probe; bleibt, weil der Umschalter es trägt).

**Karte**
- Ladekette: `src/ui/MapPanel.tsx` (Start) → `src/ui/karte/MapScreen.tsx` (Lazy) → `src/ui/map/MapView.tsx` (MapLibre).
- Props `MapScreenProps` in `src/ui/map-types.ts`: `offers`, `cameraOffers` (alle kommenden, Kamera-Regel ADR 0008), `origin`, `reach`, `ctx`, `onResetFilter`, `age` u. a.
- `MapScreen.tsx:111–115` zeigt bei null Orten `NoOffers` mit dem Text der Startseite („Mit diesen Filtern gibt es keine Angebote.“). Die Karte selbst lädt trotzdem Kacheln.
- `src/ui/map/MapView.tsx:44–52`: `lastCamera` gilt für die ganze Sitzung und wird nie gespeichert.

**Anbieter**
- Tab „Anbieter“ in `src/ui/App.tsx`: oben Sticker und Schnellfilter, dann die Statuszeile „5 Anbieter mit 8 Angeboten“ (`countProviders`), dann `ProviderScreen` (Lazy-Chunk) über `ProviderPanel`. Der Suchtext `providerQuery` lebt in `App.tsx` (Plan 0010, E5).
- `src/ui/anbieter/ProviderScreen.tsx` rendert das Suchfeld `.provider-search` (Label, Eingabe, Live-Region „12 Anbieter“ nach 500 ms) und darunter die Zeilen. Jede Zeile ist ein `li` mit **einem** Knopf `button.place` über die ganze Breite (Name fett, darunter `providerLine` bzw. `idleLine` aus `provider-format.ts`).
- `src/domain/directory.ts:85` `providerRows({ providers, visible, upcoming, reachOf, byReach, query })` liefert `{ active, hiddenCount, idle }`. Zustand je Anbieter: `aktiv` (sichtbares Angebot), `ausgeblendet` (kommend, aber gefiltert), `ohne-termine`. Rückfall-Einträge aus den Angeboten, wenn der Katalog einen Anbieter nicht kennt.
- Die Stile `.provider-search`, `.place.idle` usw. stehen in `src/ui/styles/anbieter.css` und damit im Start-CSS.
- `src/ui/anbieter/ProviderSheet.tsx` (Lazy-Chunk `anbieter/`) zeigt Name, Kategorien, „Website & Programm“, Orte und kommende Angebote. Props `ProviderSheetProps` stehen in `src/ui/provider-types.ts:37–48`. Den Dialog rendert `Overlays.tsx` immer, mit `toast`.
- `src/domain/site-data.ts:8–11`: Jedes `SiteOffer` trägt `providerId` und `providerName`.
- Den Katalog (`anbieter.json`) lädt nur `src/data/providers.ts`, und nur mit Tab oder Sheet „Anbieter“. Das ist eine Invariante in `docs/architecture.md:103`, belegt per E2E in `e2e/anbieter.spec.ts` (Privatsphäre).
- `src/domain/provider-count.ts`: `isKnownProvider` (Katalog oder Angebote).
- `docs/ideas.md`:
  - `:61` „Anbieter merken oder ‚folgen‘ … (Plan 0010, Nicht-Ziele)“: wird mit diesem Plan umgesetzt,
  - `:69` „Merkliste ‚Beginn ab‘ mit Schnellwahlen …, eigener Plan“ (aus Plan 0023): wird mit diesem Plan umgesetzt,
  - `:46` „Karte im Kalender oder in der Merkliste“ und `:59` „Kalender und Merkliste als Lazy-Chunks“ (E13).

**Start-Budget** (ADR 0012, Nachtrag „Budget 100 kB“): zuletzt 92,78 kB von 100 kB (nach Plan 0017). Die Pläne 0022–0024 und 0018 kommen davor dazu. Vor Etappe 1 wird neu gemessen.

**Tests, die den Kalender-Tab, `ansicht=kalender` oder den `calendar`-Block benutzen** (grep `kalender` in `e2e/`, `src/`, `scripts/`, ohne „in den Kalender“/„Kalender-Datei“):

| Datei:Zeile | Inhalt | Umgang (Etappe 3) |
|---|---|---|
| `e2e/calendar.spec.ts` (ganz) | Woche, Agenda, B2, E12, Blättern, Monat, B8, H2, Detail-Termin, „jetzt“ (5 Tests) | wird zu `e2e/merkliste-kalender.spec.ts` mit vorbelegter Merkliste; „Monat klappt zu“ ändert sich (E5) |
| `e2e/timezone.spec.ts:19–20` | Berliner Tag als heute markiert | im Merklisten-Kalender, Merkliste vorbelegt |
| `e2e/anbieter.spec.ts:214–229` | Deep-Link: Sheet über Tab „Kalender“ | über `?ansicht=merkliste-kalender` |
| `e2e/anbieter.spec.ts:279` | `pushState("?ansicht=kalender")` | `?ansicht=merkliste` |
| `e2e/anbieter.spec.ts:464–467` | „ohne Anlass (Kalender, Startpunkt gespeichert)“ | Merklisten-Kalender |
| `e2e/smoke.spec.ts:39–40` | Ansicht „Kalender“ bei 320 px/200 % mit echten Daten | Merklisten-Kalender, vorher drei Herzen tippen |
| `e2e/layout.spec.ts:186–187, 307` | Kalender-Ansicht im Layout-Gate | Merklisten-Kalender |
| `e2e/layout.spec.ts:566–718` | Tab-Leiste mit vier Tabs, `TAB_NAMES` (`:629`), `describe` `:641` | drei Tabs (E8) |
| `e2e/mobile-ux.spec.ts:83–90, 408, 455–460` | Zustände `kalender`, `kalender-woche`, Touch-Ziele, 320 px mit reduzierter Bewegung | Merklisten-Zustände (Tests, Punkt 15) |
| `e2e/mobile-ux.spec.ts:461–490` | Hilfen `calendarAt320`, `weekWithTwoDigitMonday` | auf den Merklisten-Kalender umstellen, Merkliste vorbelegt |
| `e2e/startpunkt.spec.ts:186–196` | Statuszeile „Kalender, Gostenhof“ | entfällt; dieselbe Prüfung gibt es für Liste, Karte und Anbieter |
| `e2e/startpunkt.spec.ts:242–253` | „Filter-Sheet und Kalender sind kein Anlass“ | „Filter-Sheet und Merkliste (Liste, Kalender) sind kein Anlass“; die Merklisten-Karte ist einer |
| `e2e/startpunkt.spec.ts:843–846` | Kalender mit `?wegzeit=20`: Platzhalter | entfällt; neu: „Merkliste ignoriert `wegzeit=`“ |
| `e2e/karte.spec.ts:153` | Wechsel Karte → Kalender → Entdecken | Karte → Merkliste → Entdecken |
| `e2e/app.spec.ts:133` | Alters-Warnhinweis auf Tab „Kalender“ | auf Tab „Anbieter“ |
| `e2e/app.spec.ts:179–196` | Leerzustände inkl. Kalender | Kalender-Teil entfällt (die Merkliste ignoriert das Alter) |
| `e2e/app.spec.ts:267–269` | Monatspunkt trägt die gewählte Kategorie | im Merklisten-Kalender mit `?kat=` |
| `e2e/saved.spec.ts` (ganz) | Merkliste | erweitert (Tests 9–11) |
| `e2e/zeitraum.spec.ts:161–168` | „der Kalender zeigt die gefilterten Angebote mit allen ihren Terminen (E8)“ mit `?von=…&ansicht=kalender` | entfällt mit dem Tab, denn der Zeitraum gilt im Merklisten-Kalender nicht (E5); `?von=…&ansicht=kalender` landet in „Entdecken“ mit Zeitraum (Test 13) |
| `src/ui/use-app-state.test.ts:292, 298, 324–328, 338` | Deep-Links mit `?ansicht=kalender` (`angebot=`, `anbieter=`, Vorladen) | `?ansicht=merkliste…`; `:338` bleibt als Altlast-Fall „kein Vorladen“ |
| `src/domain/route.test.ts` | Parsen/Serialisieren von `kalender` | neue Ansichten, Altlast `kalender` (Test 4) |
| `src/ui/use-offer-views.test.ts:135–190, 302` | `calendar.index`, `endedToday`, Wegzeit im Kalender | auf `savedCalendar` umschreiben bzw. streichen (Test 8) |
| `src/domain/calendar.test.ts`, `src/domain/agenda.test.ts` | `calendarNav`, `dayAgenda` | `calendarNav` bleibt; `dayAgenda` → `rangeAgenda` (Test 3) |
| `scripts/font-fallback.ts:139` | „Kalender“ als Probe | bleibt (Umschalter), Werte prüfen (E8) |

## Entscheidungen

### E1 – Speicher für gemerkte Anbieter

- Neuer Schlüssel in `src/data/preferences.ts`: `KEYS.savedProviders = "zwergenplan.anbieter-merkliste"`.
- Wert: JSON-Array von Anbieter-IDs in der Reihenfolge des Merkens, genau wie `zwergenplan.merkliste`.
- **Nur IDs, kein Name** (Nachtrag Mockup, Entscheidung d). Gemerkte Anbieter erscheinen nur im Tab „Anbieter“ und im Anbieter-Sheet. Dort ist `anbieter.json` ohnehin geladen, Namen und Orte kommen aus dem Katalog bzw. aus dem Rückfall-Eintrag (`directory.ts`).
  - Der frühere Namens-Schnappschuss war nur nötig, solange die Merkliste die Anbieter ohne `anbieter.json` zeigen sollte. Er entfällt.
  - Eine gemerkte ID, die weder der Katalog noch ein Angebot kennt, hat keine Zeile. Sie bleibt im Speicher und erscheint wieder, sobald der Anbieter zurück ist (wie `savedOffers`, nie automatisch löschen).
- **Aufteilung nach ADR 0010** (Review B1):
  - `src/data/preferences.ts` liefert nur die **Rohform**: `loadSavedProviders(): string[]` prüft wie `loadSaved` nur JSON und Typen (Array, nur Strings), kaputtes JSON ergibt `[]`. Ein Laufzeit-Import aus `src/domain` gibt es dort nicht.
  - `saveSavedProviders(ids)` speichert wie `saveSaved`. Bei leerer Liste entfernt es den Schlüssel.
  - Die inhaltliche Prüfung ist eine reine Funktion in `src/domain/saved.ts`:
    ```ts
    /** Gemerkte Anbieter aus dem Speicher bereinigen (Plan 0025, E1): gültige ID, höchstens MAX_KEBAB_ID, keine Dubletten. */
    export function cleanSavedProviders(raw: readonly string[]): string[];
    ```
    Sie prüft die ID gegen `KEBAB_ID_PATTERN` und `MAX_KEBAB_ID`. Bei Dubletten gilt der erste Eintrag.
  - `useSavedProviders()` ruft `cleanSavedProviders(loadSavedProviders())` im Initializer auf, wie `useOrigin` die Rohwerte aus `preferences.ts` prüft (ADR 0017, Punkt 5).
  - `MAX_PROVIDER_ID` zieht von `src/domain/route.ts:9` nach `src/domain/ids.ts` und wird von dort exportiert. `route.ts` importiert ihn.
  - Nachtrag beim Merge mit `main`: Plan 0026 brachte `MAX_KEBAB_ID` (80) in `src/domain/ids.ts` als Höchstlänge aller Katalog-IDs im Schema, deshalb entfällt `MAX_PROVIDER_ID`, und `cleanSavedProviders` wie `route.ts` nutzen `MAX_KEBAB_ID` als einzige Quelle.
- Merken und Entfernen nutzt das bestehende `toggleId` aus `saved.ts`.
- Hook `useSavedProviders()` in `src/ui/use-app-state.ts`, gebaut wie `useSaved()`. Er liefert `[ids, toggle]`, und `toggle(id)` meldet, ob danach gemerkt.
- **Privatsphäre**: Der Abschnitt „Privatsphäre“ in `docs/architecture.md` wird ergänzt.
  - Gemerkte Anbieter bleiben im `localStorage`. Sie stehen nie in URL, Logs, Requests oder IndexedDB.
  - Der Push (ADR 0014) liest sie nicht.
  - `route.ts:1–3` nennt sie im Kopfkommentar neben Geburtsdatum und Merkliste.
  - Kein Request hängt davon ab, ob oder welche Anbieter gemerkt sind (E2E, Test 9).
- Gelöscht wird nie automatisch. Wie bei `savedOffers` bleiben Einträge stehen, auch wenn ein Anbieter im aktuellen Datenstand fehlt. Ein lückenhafter Pipeline-Lauf soll keine Merkliste leeren (`saved.ts:1–4`).

### E2 – Merken im Anbieter-Sheet

- Im Kopf von `ProviderSheet` steht neben dem Namen (`h2`) ein Herz-Knopf wie auf der Kachel: `<button type="button" className="heart" aria-pressed={saved} aria-label={`${name} merken`}>`.
  - Icon (`heart`), Animation (`slap`) und Klasse sind dieselben wie auf der Kachel. Touch-Ziel (≥ 44 px), Fokusring und reduzierte Bewegung sind damit schon geprüft.
  - Der Kopf ist eine Flex-Zeile. Links steht der Name (`flex: 1`, darf umbrechen, `hyphens: auto`), rechts oben das Herz (`align-self: start`).
  - Der Name des Knopfs folgt dem Muster der Kachel („… merken“ mit `aria-pressed`), nicht „Anbieter merken/entfernen“. So gibt es ein Muster für alles Merkbare.
- Toasts nach dem Muster aus Plan 0022 (`App.tsx:162`), im Sheet über `toast` aus `Overlays.tsx`, in der Liste über `say`: „Anbieter gemerkt – steht jetzt oben im Tab „Anbieter““ bzw. „Anbieter nicht mehr gemerkt“. Derselbe Text für Sheet und Liste, denn das Sheet lässt sich auch aus „Angebote“ öffnen.
- `ProviderSheetProps` (`src/ui/provider-types.ts`) bekommt `saved: boolean` und `onToggleSaved: (providerId: string) => void`.
  - `Overlays.tsx` reicht beides durch, `App.tsx` baut es aus `useSavedProviders()`.
- Der Ladezustand des Sheets (`ProviderSheetLoader`, noch ohne Chunk) zeigt kein Herz. Gemerkt werden kann erst, wenn der Anbieter feststeht.

### E3 – Tab „Anbieter“: Suche oben, gemerkte Anbieter, Herz in jeder Zeile (Nachtrag Mockup, Entscheidung d)

Aufbau von oben nach unten:

1. Sticker und Schnellfilter wie heute.
2. **Suchfeld** `.provider-search` (Label „Anbieter suchen“, Eingabe). Es zieht aus `ProviderScreen` nach `App.tsx` und steht **über** der Statuszeile. `providerQuery` lebt dort schon. Die neue kleine Komponente `src/ui/ProviderSearch.tsx` (Start) übernimmt Label und Eingabe aus `ProviderScreen`, die Stile stehen schon im Start-CSS (`anbieter.css`).
   - Vor dem Laden des Chunks ist das Feld schon da und nimmt Text an. Das ist unkritisch, denn der Suchtext ist bereits Start-Zustand.
   - Es steht im Tab „Anbieter“ auch, solange `site.json` lädt, damit die Statuszeile danach nicht springt; im Fehlerfall nicht.
   - Die Live-Region „12 Anbieter“ (`useSettled`, 500 ms) bleibt im Chunk, als `p.sr-only.provider-announce[aria-live]` oben in `ProviderScreen`. Sichtbar stünde „1 Anbieter“ verwirrend unter „5 Anbieter mit 8 Angeboten“ (Review Nachtrag, Minor). Sie zählt jetzt gemerkte und weitere Treffer zusammen.
3. Statuszeile wie heute: „**6** Anbieter mit **11** Angeboten“. Sie zählt alle aktiven Anbieter, gemerkte eingeschlossen (`countProviders`, unverändert).
4. Abschnitt **„Gemerkte Anbieter“**: `h2` (Stil `.places h2` wie die Orts-Liste), darunter `ul.provider-saved` mit den Zeilen. Nur wenn mindestens ein gemerkter Anbieter eine Zeile hat (Suche eingerechnet).
5. **„Weitere Anbieter“**: `h2`, nur wenn es den Abschnitt „Gemerkte Anbieter“ gibt und darunter noch eine Zeile oder der Hinweis auf ausgeblendete steht. Darunter die heutige Liste (aktive Zeilen, Hinweis auf ausgeblendete, blasse Zeilen), **ohne** die gemerkten.

**Zeilen** (`directory.ts`, reine Logik):
- `providerRows` bekommt die Eingabe `saved: readonly string[]` und liefert zusätzlich `saved: ProviderRow[]`.
  - Gemerkte Anbieter werden **vor** der Einteilung in aktiv, ausgeblendet und ohne Termine herausgenommen. `active`, `hiddenCount` und `idle` enthalten sie nie.
  - `saved` enthält jeden gemerkten Anbieter mit Eintrag (Katalog oder Rückfall), der zur Suche passt, nach Name sortiert (`byName`). Eine Adressliste, deshalb nicht nach Wegzeit.
  - Der Zustand je Zeile bleibt (`aktiv`, `ausgeblendet`, `ohne-termine`). Der Startseiten-Filter blendet einen gemerkten Anbieter also nicht aus, er macht seine Zeile blass („1 Angebot, passt nicht zur Auswahl“, `idleLine`). Der Text der zweiten Zeile ist derselbe wie in der übrigen Liste (`providerLine` bzw. `idleLine`).
  - Ohne Suchtext gilt weiter: `active.length` plus die aktiven unter `saved` ergibt die Zahl der Statuszeile.
- Leerzustände wie heute, aber über **alle** Zeilen gerechnet und **über beiden Abschnitten** (Review Nachtrag M2), damit sie auch blasse gemerkte Zeilen erklären: „Kein Anbieter heißt so.“ nur, wenn weder ein gemerkter noch ein weiterer Anbieter passt; `NoOffers` nur, wenn es auch unter den gemerkten keine aktive Zeile gibt. Der Hinweis „3 weitere Anbieter haben gerade nichts Passendes.“ steht, sobald es irgendeine aktive Zeile gibt, auch wenn sie nur unter den gemerkten steht.
- Mit `reachMode.kind === "laedt"` zeigt der Tab wie heute nur `ListPending`, auch für den Abschnitt der gemerkten.

**Herz in jeder Zeile**
- Jede Zeile wird ein `li.provider-row` (Flex) mit zwei Knöpfen: links `button.place` wie heute (öffnet das Sheet), rechts `button.heart.inline` mit `aria-pressed` und `aria-label={`${name} merken`}`, wie im Sheet (E2). Das Herz ist ≥ 44 px und gehört nicht zum Sheet-Knopf.
- Ein Tipp merkt bzw. entfernt sofort (`onToggleProvider(id)` aus `App.tsx`, Toast nach E2). Die Zeile wandert in den anderen Abschnitt.
- **Fokus** (Muster aus Plan 0021, E3: erst fokussieren, dann ändern; Review Nachtrag M3): Vor dem Umschalten geht der Fokus auf das nächste Herz desselben Abschnitts in DOM-Reihenfolge (über aktive und blasse Zeilen hinweg), sonst das vorige. Bleibt im Abschnitt keins, geht er auf `section.providers` (`tabIndex={-1}`). So springt die Seite beim Merken mehrerer Anbieter nicht nach oben.
  - Beide Abschnitte sind als `div.provider-group` **immer** gerendert, nur die Überschriften sind bedingt. Sonst hängte React beim ersten Merken Listen neu ein, und der Fokus fiele auf `<body>`.
  - Den Zustandswechsel meldet der Toast (WCAG 4.1.3). Der neue Fokus ist das nächste Element derselben Liste (WCAG 2.4.3, 3.2.2).
  - **Fokus nicht verdeckt** (WCAG 2.4.11): `html { scroll-padding-bottom }` mit denselben Werten wie `.app { padding-bottom }` (Hochformat `base.css`, Querformat und kompakt `tabs.css`), damit ein fokussiertes Herz nie unter der festen Tab-Leiste liegt.
- `ProviderScreenProps` bekommt `saved: readonly string[]` und `onToggleSaved: (providerId: string) => void`.

**Privatsphäre**
- Der Start liest die gemerkten IDs, gibt sie aber nur an Chunk und Sheet. Sie ändern keinen Request: Tab „Anbieter“ und Sheet laden `anbieter.json` wie heute, mit oder ohne Gemerktes (E2E, Test 9).

**Merkliste und Badge**
- Die Merkliste zeigt keine Anbieter. Das Badge der Tab-Leiste zählt wie heute nur gemerkte Angebote mit kommendem Termin.

### E3a – Merkliste: Aufbau (Nachtrag Mockup, Entscheidung e)

Von oben nach unten:

1. `h2.ptitle` „Meine Merkliste“ (Plan 0022).
2. **Umschalter** Liste | Karte | Kalender über die ganze Breite, als eigene Zeile direkt unter der Überschrift (E4).
3. **Filterzeile** (E6), horizontal scrollend wie die Schnellfilter.
4. **Statuszeile** `.status-row` mit `p.status[role=status][tabIndex=-1]`, rechts daneben nur in der Darstellung Liste der runde Export-Knopf (E9). Texte (neu in `format.ts`, `savedStatusParts`, fette Zahlen wie `statusParts`):
   - Liste und Kalender ohne Filter: „**5** Angebote mit insgesamt **28** Terminen gemerkt“. Die Terminzahl zählt die **kommenden** Termine (`upcomingSessions`), wie der Kalender sie zeigt (Review Nachtrag, Minor). Seit Plan 0028 zählen mit Geburtsdatum bei regelmäßigen Angeboten nur die passenden (`fittingSessions`), und der Kalender der Merkliste (E5) zeigt ebenso nur sie (`sessionsByDay(…, sessionFit(birthDate))`). Der Export nimmt bei Kursen weiter auch vergangene Kurstermine (ADR 0007). Der Knopf nennt keine Zahl, der Toast nach dem Export aber die Terminzahl der Datei („Kalenderdatei mit 10 Terminen geladen“). Sie kann bei einem laufenden Kurs höher sein als die Statuszeile, und das ist gewollt: Die Statuszeile zählt, was noch kommt, der Toast, was in der Datei steht (korrigiert nach dem Browser-Review live von Etappe 2). Singular: „**1** Angebot mit insgesamt **1** Termin gemerkt“.
   - Mit aktivem Merklisten-Filter: „**2** von 5 gemerkten Angeboten passen“, Singular „**1** von 5 gemerkten Angeboten passt“. Im Kalender zählt der Zeitraum nicht mit (`useRange: false`, E6).
   - Karte: „**5** Angebote an **5** Orten gemerkt“, mit Filter „**2** von 5 gemerkten Angeboten an **2** Orten“ (`savedMapStatusParts`).
   - Kein Wegzeit-Zusatz (die Merkliste kennt keine Wegzeit-Grenze) und kein `pwaNote`, wie heute.
5. Gemerkte Angebote (gefiltert), je eine `OfferCard` mit Datum. Ohne Zeitraum gilt der nächste Termin (wie heute). Mit Zeitraum gilt der maßgebliche Termin im Zeitraum (`rangeSession`, `date-range.ts:70`), und danach wird sortiert.

Die heutige Zeile „N gemerkt · M Termine in einer .ics-Datei · Kurse immer komplett“ und der breite Knopf „Alle in den Kalender“ entfallen (Entscheidung e).

### E4 – Umschalter Liste | Karte | Kalender

**Route**
- `TABS` in `src/domain/route.ts` wird zu `["entdecken", "karte", "anbieter", "merkliste", "merkliste-karte", "merkliste-kalender"]`.
- Die URL heißt `ansicht=merkliste-karte` bzw. `ansicht=merkliste-kalender`, analog zu `ansicht=karte` für „Entdecken“ (Plan 0005, E5). `tabSection` bildet beide auf „merkliste“ ab.
- Verworfen: ein eigener Parameter `darstellung=`. Das wäre ein zweiter Parameter für dieselbe Sache, die `ansicht=karte` heute schon löst.
- Die Darstellung ist keine private Information, denn sie verrät nichts über das Gemerkte. Sie darf also in die URL. Ein geteilter Link `?ansicht=merkliste-kalender` öffnet beim Empfänger dessen eigene Merkliste.

**Weichen in `App.tsx` auf `section` umstellen** (Review M1). Heute fragen mehrere Stellen `route.tab` direkt ab. Mit den neuen Ansichten griffen sie falsch:
- `:244` Sticker und `:245` Schnellfilter: beide `section === "entdecken" || section === "anbieter"`. Auf allen Merklisten-Ansichten bleiben sie aus.
- `:278` Statuszeile der anderen Tabs: `section !== "merkliste"` statt `route.tab !== "merkliste"`. Die Merkliste rendert ihre eigene Statuszeile in `SavedView`.
- `:334` Liste „Entdecken“: bleibt `route.tab === "entdecken"`.
- `:356` `MapPanel`: Es gibt je Abschnitt genau einen Aufruf.
  - In „Entdecken“ (`route.tab === "karte"`) wie heute mit `offers={visible}`.
  - Auf der Merkliste (`route.tab === "merkliste-karte"`) rendert `SavedView` die Karte selbst, mit den gefilterten gemerkten Angeboten.
- `:124–126` Wegzeit-Anlass: `route.tab === "karte" || route.tab === "merkliste-karte"`. Liste und Kalender der Merkliste sind kein Anlass.
- `views.map` (`use-offer-views.ts:148–151`) wird für beide Karten berechnet.
  - Für `karte` gilt `placeCount: countPlaces(visible)`.
  - Für `merkliste-karte` gilt `placeCount: countPlaces(savedVisible)`, also die gefilterten gemerkten Angebote (E6).
  - `cameraOffers` ist in beiden Fällen `upcoming`. Sonst ist `map` `undefined`.
  - Der Unit-Test steht unter Test 8.

**`ViewToggle`** (`Chrome.tsx`, Review M2)
- Signatur: `ViewToggle<V extends string>({ options: readonly { value: V; label: string }[]; current: V; onChange: (v: V) => void; legend: string })`.
- Die Klasse bleibt `seg`, **nicht** `seg3`. `.seg3` gehört dem Darstellungs-Umschalter im Kind-Sheet, mit Umbruch und einspaltiger Container-Query.
- Das Element setzt `style={{ "--n": options.length }}` und den Daumen per `translateX(${index * 100}%)`.
- `map.css:33–38`: Die Daumenbreite wird `calc(100% / var(--n, 2))` statt `50%`.
- **Auf der Merkliste steht der Umschalter allein über die ganze Breite** (Entscheidung e), direkt unter „Meine Merkliste“ und nicht in der Statuszeile. Neue Klasse `.view-toggle.full` (in `map.css` neben `.view-toggle`, weil der Umschalter dort schon steht):
  - `flex: none; width: 100%; min-width: 0` statt des Deckels `0 1 12rem`,
  - `.seg-btn { white-space: nowrap }`, „Kalender“ bricht nie.
  - **Schmal einspaltig** (Review Nachtrag B1): Bei 320 px und 200 % bleiben je Segment etwa 84 px, „Kalender“ braucht in 32 px gut 120 px. `.view-toggle.full` bekommt deshalb `container: seg-full / inline-size` und unter `17rem` dasselbe Muster wie `.seg3` (`chrome.css:332–349`): eine Spalte, kein Daumen, der gewählte Knopf trägt die Fläche selbst (`--surface`, Rahmen, Schatten). Zuerst stand hier `19rem`; das Arch-Review zu Etappe 2 hat gezeigt, dass dann schon 320 px bei 100 % (288 px Inhalt, 18rem) einspaltig sind. Test 15 prüft 320 px bei 100 % (drei Spalten) und 200 % (eine Spalte).
  - Nachtrag Etappe 3: Mit drei Segmenten bleibt es bei `17rem`. Bei 320 px und 100 % (288 px Inhalt) stehen „Liste | Karte | Kalender“ dreispaltig, keines wird abgeschnitten; bei 200 % ist der Umschalter einspaltig. `e2e/saved.spec.ts` prüft beides (Test 15). Chromium wertet die Container-Query nach einer reinen Schriftänderung erst nach einem Breitenwechsel aus; die Gates nutzen dafür `setTextScaleRelayout` (`e2e/mobile-ux.ts`).
- In „Angebote“ bleibt der Umschalter Liste | Karte in der Statuszeile wie heute (Plan 0005, E5).
- Die Legende lautet „Darstellung der Angebote“ bzw. „Darstellung der Merkliste“.

**Karte der Merkliste**
- `MapPanel` erhält:
  - `offers` = die gefilterten gemerkten Angebote,
  - `cameraOffers` = **alle kommenden Angebote** (`views.map.cameraOffers`, wie „Entdecken“). Der Startausschnitt darf nicht von der Merkliste abhängen, sonst verrieten die Kachel-Requests, wo die gemerkten Angebote liegen (Kamera-Regel, ADR 0008). Das ist keine Abweichung von ADR 0008.
  - `onResetFilter` setzt die Merklisten-Filter zurück. `age` ist `undefined`, weil die Merkliste das Alter ignoriert.
- Die Karte wird **nur gerendert, wenn mindestens ein gemerktes Angebot zum Filter passt**. Sonst zeigt `SavedView` einen eigenen Leerzustand (E5a), ohne `MapPanel` und damit ohne Kacheln. `NoOffers` in `MapScreen.tsx:111–115` wird auf der Merkliste so nie erreicht.
- Statuszeile: „**5** Angebote an **5** Orten gemerkt“ (E3a). Der neue Text `savedMapStatusParts` in `format.ts` folgt dem Muster von `mapStatusParts`.
- Orts-Sheet, Orts-Liste und „Kartenmitte als Startpunkt“ funktionieren wie in „Entdecken“. `lastCamera` (Sitzung) teilen sich beide Karten, und das ist gewollt.

**Fokus**
- Der Umschalter bleibt beim Wechsel dasselbe Element an derselben Stelle, und der Fokus bleibt auf dem gedrückten Segment.
- `window.scrollTo({ top: 0 })` gibt es nur beim Tab-Wechsel, nicht beim Wechsel der Darstellung (wie heute bei Liste | Karte).

### E5 – Kalender der Merkliste: Tag, Woche oder Monat als Filter der Liste darunter

**Inhalt**
- Der Kalender zeigt nur Termine gemerkter Angebote, gefiltert nach den Merklisten-Filtern Format und Anmeldung (E6).
- Er zeigt **jeden** nicht beendeten Termin, bei einem Kurs also jede Kursstunde und bei einer regelmäßigen Gruppe jedes Treffen.
- Grundlage ist `sessionsByDay(savedFiltered)`. `allIndex` ist `sessionsByDay(savedAll)`, ungefiltert, für „ausgeblendet“.
- `endedToday` (Review M7): `endedOnDay` über `offers.filter((o) => savedIds.includes(o.id))` **plus** Merklisten-Filter. Bewusst nicht über `savedOffers`, das nur Angebote mit kommendem Termin kennt. Ein gemerktes Angebot, dessen einziger Termin heute schon vorbei ist, zählt sonst nicht (B2).

**Zustand** (Review M4), fest im Sitzungszustand von `useOfferViews`:

```ts
/** Was der Kalender der Merkliste auswählt (Plan 0025, E5). `day` ist ein Berliner Tag, nie vor heute. */
export interface CalendarSelection {
  unit: "tag" | "woche" | "monat";
  /** Anker: der gewählte Tag; bei Woche ein Tag darin (Mo–So um ihn), bei Monat ein Tag darin */
  day: string;
}
/** Zustand des Merklisten-Kalenders in useOfferViews */
interface SavedCalendarState {
  selection: CalendarSelection;
  /** Monatsraster offen; unabhängig von `selection.unit` (offenes Raster mit gewähltem Tag ist erlaubt) */
  monthOpen: boolean;
}
/** Erster und letzter Berliner Tag der Auswahl, inklusive; nie vor `today`. */
export function selectionRange(sel: CalendarSelection, today: string): { from: string; to: string };
```

- Der Startwert ist `{ selection: { unit: "woche", day: today }, monthOpen: false }`. Das entspricht „seine Woche planen“ (Wunsch 11).
- Der Zustand übersteht Tab- und Darstellungswechsel, aber nicht das Neuladen. `day` wird beim Lesen mit `clampDay` auf heute gezogen, etwa nach Mitternacht im offenen Tab.
- **Pfeile über das bestehende `calendarNav`** (`src/domain/calendar.ts`). Es gibt keine eigene Navigationsfunktion; `selectionNav` aus dem Entwurf entfällt.
  - Woche: `nav.prevWeek`/`nav.nextWeek` → `{ unit: "woche", day: ziel }`.
  - Monat: `nav.prevMonth`/`nav.nextMonth` → `{ unit: "monat", day: ziel }`.
  - `calendarNav` sperrt wie heute vor heute und nach `lastDay`.
- Die Navigationsgrenze `lastDay` ist der letzte Tag des **ganzen Datenstands** (`lastSessionDay(upcoming)`), nicht der letzte gemerkte Termin. So kann man auch in leere Wochen blättern und von dort „Für diese Woche entdecken“ nutzen.

**Interaktion** (Simplicity: Ein erneuter Tipp auf den gewählten Tag ändert nichts mehr; zurück zur ganzen Woche oder zum ganzen Monat geht es nur über den Titel):

| Ansicht | Geste | Zustand danach |
|---|---|---|
| Woche (Standard) | Tipp auf einen Tag | `tag` = dieser Tag |
| Woche | Tipp auf den Wochentitel „5.–11. Okt.“ (jetzt ein Knopf, `aria-pressed` bei `woche`) | `woche` |
| Woche | Pfeil ‹ / › | `woche` der vorigen/nächsten Woche (Blättern zeigt immer die ganze neue Woche) |
| Woche | „Ganzen Monat zeigen“ | `monthOpen: true`, `monat` des Ankertags |
| Monat | Tipp auf einen Tag | `tag` = dieser Tag, **Raster bleibt offen**, Überschrift der Liste wird sichtbar (unten) |
| Monat | Tipp auf den Monatstitel „Oktober 2026“ (Knopf, `aria-pressed` bei `monat`) | `monat` |
| Monat | Pfeil ‹ / › | `monat` des vorigen/nächsten Monats (Anker: der 1., nie vor heute) |
| Monat | „Monat zuklappen“ | `monthOpen: false`, `woche` um den Ankertag |

- Dass das Raster beim Tipp auf einen Tag offen bleibt, ist eine Änderung gegenüber heute (`CalendarView.tsx:123–126`). Der Monat ist jetzt ein Filter, kein Datumswähler.
- **Sichtbarkeit nach dem Tipp im Monat** (Review M3): Das offene Raster schiebt die Liste bei 320×640 unter den Falz.
  - Nach dem Tipp auf einen Tag ruft ein `useLayoutEffect` `daylabel.scrollIntoView({ block: "nearest" })` auf, ohne `behavior: "smooth"`. Damit gilt die reduzierte Bewegung von selbst.
  - Der Fokus bleibt auf dem Tag. Die Statuszeile meldet die neue Zahl nicht (sie zählt nicht die Auswahl). Die Überschrift `h2.daylabel` mit „3 Termine“ ist deshalb zugleich sichtbar und per `aria-live="polite"` angesagt; die Region umfasst nur Überschrift und Zahl.
  - E2E: Nach dem Tipp liegt die Überschrift im Viewport (Test 10).
- Vergangene Tage bleiben gesperrt (`disabled`, wie heute). Der Monatsknopf hält seine Lage beim Auf- und Zuklappen (bestehender `useLayoutEffect`, Plan 0007, E5).
- Die Punkte in Woche und Monat (`dots`, Kategorie-Formen) zeigen nur gemerkte Termine. Sie folgen `ctx.categoryOf` wie heute (Plan 0014: die gewählte Kategorie der Startseite zuerst).
- **Namen** (WCAG 2.5.3, Label im Namen):
  - Je Tag: „Mittwoch, 7. Oktober, 1 Termin“. Heute steht dort „… Angebote“; im Merklisten-Kalender zählen Termine.
  - Wochentitel: Der sichtbare Text „5.–11. Okt.“ steht am Anfang des zugänglichen Namens. Der Zusatz kommt als `span.sr-only` in den Knopf: „ · ganze Woche, 3 Termine“. Kein `aria-label`, das den sichtbaren Text umformuliert.
  - Monatstitel analog: „Oktober 2026“ plus `sr-only` „ · ganzer Monat, 7 Termine“.

**Liste darunter** (`h2.daylabel` mit Karten)
- Die Überschrift richtet sich nach der Auswahl: „Heute, 5. Oktober“ / „Mittwoch, 7. Oktober“ (wie `agendaHeading`), „Diese Woche“ / „Woche 12.–18. Okt.“, „Oktober 2026“. Rechts steht `small` „3 Termine“.
  - Neue reine Texte in `src/ui/format.ts`: `selectionHeading(sel, today)`. Die Wortlaute werden zuerst im Test festgelegt.
- Bei `woche` und `monat` wird nach Tag gruppiert, mit `h3` je Tag („Mi 7.10.“) und nur für Tage mit Terminen.
- Je Termin gibt es eine `OfferCard` mit `calendarDay` = dieser Tag. So nimmt das Detail diesen Termin (`referenceSession`).
- Reine Domänenfunktion in `src/domain/agenda.ts`, sie ersetzt `dayAgenda`:

```ts
export interface RangeAgenda<T extends Offer> {
  /** nicht beendete Termine je Tag in [from, to], Tage aufsteigend, je Tag nach Beginn */
  groups: DayGroup<Occurrence<T>>[];
  count: number;
  /** heute schon beendete passende Termine, wenn `today` in [from, to] liegt */
  ended: number;
  /** nicht beendete Termine in [from, to], die der Merklisten-Filter ausblendet (allIndex minus index, nie < 0) */
  hidden: number;
  /** `from` liegt nach dem letzten Tag des Datenstands */
  afterData: boolean;
}
export function rangeAgenda<T extends Offer>(
  index: ReadonlyMap<string, Occurrence<T>[]>,
  range: { from: string; to: string },
  now: Date,
  context: { dataEnd: string | undefined; endedToday: number; allIndex: ReadonlyMap<string, Occurrence<T>[]> },
): RangeAgenda<T>;
```

  - Sie iteriert die Tage von `from` bis `to` (höchstens 31) per `addDays`, nicht die Map.
  - `dayAgenda` entfällt. `endedOnDay` bleibt, jetzt über die gemerkten Angebote (siehe oben).

**Leerzustände des Kalenders**, in dieser Reihenfolge (Muster aus `AgendaEmpty`, Plan 0008, E12):

1. `hidden > 0`: Titel „Nichts, was zu deinem Filter passt“, Text „2 gemerkte Termine blendet der Filter aus.“, Knopf „Filter zurücksetzen“. Es gibt kein „Auch unpassende zeigen“, weil das Alter hier nicht wirkt.
2. `ended > 0` (nur bei `tag` = heute): „Für heute ist alles vorbei“ wie heute.
3. `afterData`: „Weiter reicht der Plan noch nicht“ wie heute.
4. Sonst: Titel „Nichts gemerkt“, Text „Für diesen Tag hast du nichts gemerkt.“ (bzw. „diese Woche“, „diesen Monat“), Knopf „Für diesen Tag entdecken“ (bzw. „… diese Woche …“, „… diesen Monat …“).
   - Der Knopf wechselt zu „Entdecken“ und setzt dort den Zeitraum auf die Auswahl: `replace({ ...route, tab: "entdecken", filter: withDateRange(route.filter, from, to) })` (`filter.ts:128`), in der URL `von=`/`bis=`. Alle übrigen Startseiten-Filter bleiben.

**Zeitraum im Kalender**: Die Kalenderauswahl **ist** der Zeitraum.
- In der Darstellung Kalender sind die Chips „ab …“ der Merkliste ausgeblendet. Ihr Wert bleibt erhalten und gilt wieder in Liste und Karte.
- Verworfen: beides kombinieren. Die Kurs-Regel „erster Termin im Zeitraum“ widerspricht „jeder Termin“ im Kalender, und zwei Zeitfilter übereinander wären schwer zu verstehen.

**Wiederverwendung**
- `CalendarView.tsx` wird per `git mv` zu `src/ui/SavedCalendar.tsx` umgebaut.
  - `WeekStrip` und `MonthGrid` bleiben. Sie bekommen `selection` statt `day` und die Titelknöpfe.
  - `AgendaEmpty` wird zu `RangeEmpty`.
  - Es bleibt kein zweiter Kalender zurück.
- `styles/calendar.css` bleibt und wird um den Titelknopf ergänzt (`.cal-nav .cal-title`): ≥ 44 px hoch, sieht aus wie der heutige `<b>`-Titel, gewählt über `--sel`/`--on-sel`.

### E5a – Leerzustände der Merkliste (Review M5)

| Lage | Liste | Karte | Kalender |
|---|---|---|---|
| kein gemerktes Angebot mit kommendem Termin (gemerkte Anbieter zählen nicht) | Leerzustand „Noch nichts gemerkt“ (Plan 0022, `SavedView.tsx:94`) mit „Angebote entdecken“; **keine** Statuszeile, kein Umschalter, keine Filter | wie Liste | wie Liste |
| Filter blendet alle gemerkten Angebote aus | `EmptyState` „Nichts, was zu deinem Filter passt“ / „Von deinen 5 gemerkten Angeboten passt keins.“ mit „Filter zurücksetzen“ | derselbe `EmptyState`, kein `MapPanel` | Kalender bleibt; je Auswahl `RangeEmpty` Fall 1 |

- Der Leerzustand ohne Gemerktes gilt auch, wenn die URL auf `merkliste-karte`/`-kalender` steht. Die URL bleibt stehen. Ohne gemerktes Angebot gibt es also nie `MapPanel` und keine Kacheln.
- Der frühere Fall „nur Anbieter gemerkt“ entfällt, denn die Merkliste zeigt keine Anbieter (E3).
- Neue reine Texte in `format.ts`: `savedFilteredEmpty(total)` („Von deinen 5 gemerkten Angeboten passt keins.“, Singular „Dein gemerktes Angebot passt nicht.“).

### E6 – Filter auf der Merkliste: eigener Zustand, nicht in der URL

- Typ und Funktionen in `src/domain/saved.ts`:

```ts
/** Filter der Merkliste (Plan 0025, E6): getrennt vom Startseiten-Filter, nie in der URL. */
export interface SavedFilter {
  formats: Format[];
  registration: Registration[];
  /** eine der Schnellwahlen „ab …“ (E7); nur Liste und Karte */
  range?: DateRange;
}
export const EMPTY_SAVED_FILTER: SavedFilter;
export function applySavedFilter<T extends Offer & { venue: ReachTarget }>(
  offers: readonly T[],
  filter: SavedFilter,
  now: Date,
  opts: { useRange: boolean },
): T[];
export function savedFilterCount(filter: SavedFilter, opts: { useRange: boolean }): number;
```

  - Die Typgrenze `Offer & { venue: ReachTarget }` stammt aus `matchesFilter` (`filter.ts:139`).
  - `applySavedFilter` baut einen `FilterState` mit `formats`, `registration` und (bei `useRange`) `range`, die übrigen Dimensionen leer, und ruft `applyFilters`. Das prüft Format und Anmeldung über `matchesFilter` und den Zeitraum über `inDateRange` (`filter.ts:163–168`). Ohne kommenden Termin fällt ein Angebot heraus, wie in `savedOffers`.
  - Es gibt keine eigene Format-, Anmelde- oder Zeitraumlogik. `DateRange` ist der Union-Typ aus `src/domain/date-range.ts:9`; die Schnellwahlen setzen immer nur `from`.
- **Zustand:** `useState<SavedFilter>(EMPTY_SAVED_FILTER)` in `App.tsx`, neben `providerQuery`. Er übersteht Tab- und Darstellungswechsel, nicht das Neuladen.
  - **Nicht in der URL.** Die URL-Parameter `format=`, `anmeldung=`, `von=`, `bis=` gehören der Startseite und gelten auf allen Tabs außer der Merkliste.
  - Eigene Parameter (`m-format=` o. ä.) würden die URL-Logik verdoppeln und wären beim Teilen wertlos, denn der Empfänger hat eine andere Merkliste. Leitlinie 2: nicht vermischen.
  - Verworfen: `sessionStorage` (wie Plan 0021, E1). Wenig Nutzen und eine weitere Stelle mit try/catch.
- **Bedienung:** Filterzeile `SavedFilters` (neue Komponente `src/ui/SavedFilters.tsx`), gebaut wie `QuickFilters` (`fieldset.plain` > `.chips`, horizontal scrollend). Die Legende lautet „Merkliste filtern“. Die Chips:
  - „Kurse“, „Regelmäßig“, „Einmalig“: Mehrfachwahl, wie in `QuickFilters`.
  - „Mit Anmeldung“, „Ohne Anmeldung“: **Einfachwahl** wie im Filter-Sheet. Der eine schaltet den anderen ab.
  - Die drei Schnellwahlen „ab Nov.“, „ab Dez.“, „ab Jan.“ (E7): Einfachwahl untereinander, ein zweiter Tipp auf den gewählten hebt ihn auf. Nur in Liste und Karte.
  - Mit aktivem Filter steht am Ende ein Chip „Zurücksetzen“.
    - Er setzt den **ganzen** Merklisten-Filter zurück, auch den Zeitraum. Ein Knopf hat eine Bedeutung.
    - In der Darstellung Kalender erscheint er nur, wenn Format oder Anmeldung aktiv ist (`savedFilterCount(…, { useRange: false }) > 0`). Er löscht dann auch einen dort ausgeblendeten Zeitraum. Das ist bewusst: Wer zurücksetzt, will alles sehen.
  - Es gibt keinen Badge-Knopf „Filter“ und kein Sheet.
- **Wo der Filter wirkt:**
  - Liste und Karte: Format, Anmeldung, Zeitraum.
  - Kalender: Format und Anmeldung (E5).
  - Export (E9): nie.
- **Startseiten-Filter auf der Merkliste** wirken nicht, wie heute (E4, Weichen über `section`). Einzige Ausnahme bleibt `ctx.categoryOf`, das die Kategorie-Pille wählt (Plan 0014). Es filtert nichts.

### E7 – Schnellwahlen „ab …“ als Chips

- Simplicity (Review): Es gibt kein Zeitraum-Sheet und keine freie Datumseingabe auf der Merkliste. Die drei Schnellwahlen der Nutzerentscheidung b stehen als Chips direkt in der Filterzeile.
- Reine Funktion in `src/domain/date-range.ts` neben `dateRange` (dort hängt sie weder an Filter noch an Startseite, Plan 0023, E3):

```ts
/** Schnellwahlen „Beginn ab“ (Plan 0025, E7): Monatserste nach heute; nur solche bis zum Ende des Datenstands. */
export function quickRanges(today: string, dataEnd: string | undefined): Array<{ month: string; range: DateRange }>;
```

  - Die Schnellwahlen sind die Monatsersten der nächsten drei Monate, je `{ from: YYYY-MM-01 }` ohne `to`. „ab nächstem Monat“ ist der 1. des Folgemonats, „in 2 Monaten“ der 1. des übernächsten, „in 3 Monaten“ der 1. des dritten Monats.
  - `month` ist der Monat (`YYYY-MM`). Die Beschriftung macht `format.ts`: `quickRangeLabel(month)` → „ab Nov.“, „ab Dez.“, „ab Jan.“. Die Monatsnamen sind abgekürzt, Mai, Juni und Juli ohne Punkt („ab Mai“, „ab Juni“, „ab Juli“).
  - Eine Schnellwahl, deren `from` nach `dataEnd` liegt, fehlt, denn sie zeigte immer nichts. Ohne `dataEnd` gibt es keine.
  - Beispiel heute (8.10.2026): „ab Nov.“, „ab Dez.“, „ab Jan.“.
- Gedeutet wird das als „Beginn ab“, wie der Wunsch es beschreibt („ab wann ein möglicher Beginn …“).
  - Für Kurse heißt das mit der Regel aus Plan 0023: Kurse, deren **erster** Termin ab dann liegt. Genau das braucht die Suche nach einem Ersatzkurs.
  - Regelmäßige Gruppen passen, wenn sie dann noch Termine haben.
- Ein gewählter Chip hat `aria-pressed="true"`. Der zugängliche Name ist der sichtbare Text „ab Nov.“, ohne `aria-label` und ohne `<abbr>`. Mit der Legende „Merkliste filtern“ ist er verständlich.

### E8 – Tab „Kalender“ entfällt

- `TAB_ITEMS` (`Chrome.tsx:130–136`) wird zu **Angebote** · Anbieter · Merkliste (Entscheidung c). Die Reihenfolge bleibt sonst gleich (Merkliste ganz rechts, Plan 0010, E2).
- **„Entdecken“ heißt „Angebote“.** Nur die Beschriftung ändert sich, das Icon `compass` und der Routenwert `entdecken` bleiben (keine URL ändert sich).
  - Sichtbare Texte, die den Tab beim Namen nennen, werden angepasst (grep „Entdecken“ in `src/ui`, Schritt 0). Verben wie „Angebote entdecken“ oder „Für diese Woche entdecken“ bleiben, sie nennen keinen Tab.
  - Kommentare im Code dürfen „Entdecken“ behalten, wo sie Pläne zitieren.
  - E2E: Selektoren auf den Tab-Namen („Entdecken“) in `e2e/anbieter.spec.ts`, `app.spec.ts`, `layout.spec.ts`, `saved.spec.ts`, `karte.spec.ts` und `merkliste-anbieter.spec.ts` werden „Angebote“, mit `exact: true` bzw. `^Angebote` im Tab-Navigator, sonst träfe „Angebote“ auch „… Angebote zeigen“ (`karte.spec.ts:162, 189`).
  - `scripts/font-fallback.ts:139` bekommt „Angebote“ als Probe; geänderte `size-adjust`-Werte wandern nach `tokens.css`.
- `styles/tabs.css` wird über eine Variable gesteuert. `.tabs` setzt `--n: 3`, und diese Stellen nutzen sie:
  - `repeat(var(--n), minmax(0, 1fr))` statt `repeat(4, …)` (`:13`),
  - `/ var(--n)` statt `/ 4` (`:49`, `:187`),
  - der Daumen `at-0` … `at-2`,
  - Kopfkommentar `:1` und Kommentar `:197` werden angepasst.
- Die Regeln aus `docs/architecture.md:119` gelten weiter: Rand, Label 12 px, Nur-Icon unter `4.25rem` Spaltenbreite, Seitenleiste quer, kompakt quer.
  - Die Seitenleiste quer wird mit drei Tabs niedriger. Die Höhenrechnung aus Plan 0010 (E2) belegt der Layout-Test mit drei Tabs neu.
  - `docs/architecture.md` bekommt „drei Spalten“.
- **Alte Links `?ansicht=kalender`:**
  - `parseRoute` liest `kalender` als `entdecken`. Das passiert durch `TABS.find(…) ?? "entdecken"` schon von selbst.
  - Neu: `useRoute` ersetzt beim Start die URL einmal per `replaceState` durch die kanonische (`routeToSearch`), wenn `ansicht=kalender` darin stand. Sonst bliebe der Parameter stehen. Die reine Hilfe dafür ist `isLegacyView(search): boolean` in `route.ts`.
  - Filter (`kat=`, `wegzeit=` …), `anbieter=` und `angebot=` bleiben erhalten.
  - Ziel ist „Entdecken“, nicht „Merkliste“. Der alte Kalender zeigte **alle** Angebote nach Datum, und das gibt es jetzt in „Entdecken“ mit Zeitraum (Entscheidung a). Ein geteilter Link meinte nie die Merkliste des Empfängers.
- **Push, Service Worker, ICS:** keine Änderung.
  - Die Wochen-Nachricht öffnet die Startseite (`docs/architecture.md:87`).
  - Der Service Worker kennt keine Ansichten.
  - ICS-Links und der Toast „Kalender-Datei braucht Netz“ hängen nicht am Tab.
- **Wegzeit-Platzhalter** (`App.tsx:374`): Der Zweig für den Kalender fällt weg. Die Merkliste wartet nie auf die Wegzeit, denn sie hat keine Grenze. `docs/architecture.md:66` („ersetzt ein Platzhalter-Block Liste und Kalender“) wird zu „die Liste“.
- **`use-offer-views.ts`:** Der Block `calendar` für „Entdecken“ entfällt (`index`, `allIndex`, `endedToday` über `route.filter`). An seine Stelle treten:
  - `savedVisible`: die gemerkten Angebote nach dem Merklisten-Filter, als neue Eingabe `savedFilter`,
  - `savedCalendar`: `index`, `allIndex`, `endedToday`, `dataEnd`, `lastDay` sowie Zustand und Setter aus E5. Berechnet wird das nur bei `route.tab === "merkliste-kalender"`.
- **Skripte:**
  - `scripts/screenshots.ts`: Die Ansicht `kalender` wird zu `merkliste-kalender` und belegt die Merkliste vorher per `localStorage` vor.
  - `scripts/font-fallback.ts` behält „Kalender“ als Probe (Umschalter). Ändern sich die `size-adjust`-Werte nicht, bleibt `tokens.css` unberührt. Sonst das Skript laufen lassen und die Werte übernehmen (`docs/architecture.md:124–125`).

### E9 – Der Merklisten-ICS bleibt korrekt (ADR 0007, ADR 0018)

- „Alle in den Kalender“ exportiert wie heute **alle** gemerkten Angebote mit kommendem Termin.
  - Die Auswahl trifft `collectionSessions` bzw. nach Plan 0018 `exportSessions`, mit denselben VEVENTs und UIDs.
  - Merklisten-Filter, Kalenderauswahl und gemerkte Anbieter ändern daran nichts. ADR 0007 und ADR 0018 bleiben unverändert.
- Der Knopf steht **nur in der Darstellung Liste** (Simplicity). Karte und Kalender bleiben ruhig. Wer exportieren will, ist mit einem Tipp in der Liste.
- **Kompakter Knopf** (Entscheidung e): rund, 48 px, nur Icon (`calendarPlus` aus `icons.tsx`, wie heute im breiten Knopf), rechts neben der Statuszeile (E3a). Der breite Knopf und die Zeile „… · Kurse immer komplett“ entfallen.
  - Zugänglicher Name und `title`: „Alle in den Kalender“. Ist ein Merklisten-Filter aktiv: „Alle 5 gemerkten in den Kalender, auch ausgeblendete“. So weiß auch ein Screenreader, dass der Filter nicht wirkt. Der neue reine Text ist `exportLabel(savedCount, filtered: boolean)` in `format.ts`.
  - Sichtbar steht der Hinweis „auch ausgeblendete“ nur im Tooltip. Der Nutzer hat das so freigegeben (Mockup, Abwägung im Chat am 2026-10-08).
  - Der Toast nach dem Export bleibt wie heute.
- Der Lader des Export-Chunks bleibt in `SavedView.tsx` (`LAZY_LOADERS`, `ics-entry-only`). Ist Plan 0018 vorher umgesetzt, liegt er in `src/ui/ics-export.ts`, und `SavedView` importiert ihn von dort. In beiden Fällen gibt es keinen neuen Lader.

### E10 – Mobile-UX und Barrierefreiheit

- Neue Ansichten und Overlays bekommen `expectMobileUx`, hell und dunkel (`docs/architecture.md:128`):
  - Merkliste als Liste, mit Filtern,
  - Tab „Anbieter“ mit gemerkten Anbietern,
  - Karte,
  - Kalender in der Woche,
  - Kalender im Monat mit gewähltem Tag,
  - Anbieter-Sheet mit gemerktem Herz,
  - Leerzustände.
- Touch-Ziele ≥ 44 px: das Herz im Anbieter-Sheet und in jeder Zeile im Tab „Anbieter“, der Export-Knopf, die Titelknöpfe von Woche und Monat, die Chips und die drei Segmente des Umschalters bei 320 px.
- Text passt:
  - Der Anbietername neben dem Herz bricht um (`hyphens: auto`, kein Bruch mitten in kurzen Wörtern).
  - Die Segmente „Liste“, „Karte“ und „Kalender“ bleiben einzeilig (`nowrap`, E4). Zu eng heißt: Der Umschalter wird einspaltig (Container-Query, E4).
  - Die Statuszeile „**5** Angebote mit insgesamt **28** Terminen gemerkt“ bricht neben dem Export-Knopf um und passt bei 320 px/200 %.
  - Der Anbietername neben dem Herz in der Zeile bricht um wie im Sheet.
- Dunkelmodus: Ein gewählter Wochen- oder Monatstitel nutzt `--sel`/`--on-sel`, ohne helle Inseln.
- Reduzierte Bewegung: Der Daumen des dreiteiligen Umschalters hat keine Transition (über `motion.css`, wie der zweiteilige). `scrollIntoView` ist ohne `smooth` (E5).
- Screenreader:
  - Die Statuszeile ist die Live-Region und meldet nach einem Filterwechsel „2 von 5 gemerkten Angeboten passen“.
  - Die Titelknöpfe haben `aria-pressed`, der sichtbare Text steht am Anfang des Namens (E5).
  - `h2.daylabel` bildet die Auswahl ab und sagt die Zahl an; `h3` je Tag.

### E11 – Start-Budget: im Start-Bundle bleiben, messen

- Die Merkliste bleibt im Start-Bundle.
  - Der Kalender-Code zieht nur um (`CalendarView` → `SavedCalendar`), und der Entdecken-Kalender in `use-offer-views.ts` fällt weg.
  - Dazu kommen Suchfeld (zieht aus dem Chunk in den Start), Statuszeile mit Export-Knopf, Filterzeile, Auswahl-Logik und Texte. Die Anbieter-Abschnitte liegen im Lazy-Chunk.
  - Schätzung: +1,0 bis +1,5 kB gzip über alle Etappen. Ohne Zeitraum-Sheet ist das weniger als im Entwurf.
- Jede Etappe misst `JS (initial)` und trägt ihr Delta in die Tabelle von ADR 0012 ein („Nachtrag 2026-10-06: Budget 100 kB“).
- **Entscheidungspunkt:** Liegt die Summe aller Etappen über +2,5 kB, entscheidet der Nutzer vor dem Merge der nächsten Etappe (N5).

### E12 – ADR-Prüfung

| ADR | Berührt? | Ergebnis |
|---|---|---|
| 0003 Datenmodell | nein | kein Schemafeld, keine ID-Änderung |
| 0007 Merklisten-ICS | ja, Export | unverändert (E9) |
| 0008 Karte/Kamera-Regel | ja, Merklisten-Karte | `cameraOffers` = alle kommenden; keine Abweichung (E4) |
| 0010 `src/data` nutzt nur reine Hilfen | ja, Speicher | `preferences.ts` liefert die Rohform, geprüft wird in der Domäne (E1); keine Abweichung |
| 0011/0017 Wegzeit, Startpunkt | ja, Anlass | Die Merklisten-Karte ist ein Anlass wie die Karte, der Request bleibt für alle gleich |
| 0012 Startbudget | ja | Delta je Etappe in der Tabelle; ein Lazy-Chunk erst am Entscheidungspunkt (E11), dann mit eigenem ADR |
| 0013 Service Worker | nein | keine neue Route, kein neuer Start-Chunk |
| 0014 Push | nein | liest gemerkte Anbieter nicht |
| 0018 ICS altersgerecht | ja, Export | unverändert |
| 0020 Teilen per Link | ja, Plan 0026 Stufe 2 | Gemerkte Anbieter bleiben nur IDs im `localStorage`; das Fragment von Stufe 2 bleibt möglich, braucht für Namen aber `anbieter.json` (Vermerk in Plan 0026) |
| 0019 Statuszeile nur Startpunkt | ja, Statuszeile der Merkliste | Die Merkliste hat eine eigene Statuszeile mit Zahlen und ohne Startpunkt (E3). Die anderen Statuszeilen bleiben wie in ADR 0019; keine Abweichung |

**Ergebnis: kein neues ADR.** Geändert werden Regeln in `docs/architecture.md`: Tab-Leiste mit drei Spalten, Privatsphäre um gemerkte Anbieter ergänzt, Wegzeit-Platzhalter nur noch für die Liste, Karte der Merkliste als Wegzeit-Anlass. Pläne bekommen Vermerke (E13). Kommt es zum Lazy-Chunk (E11), wird das ein ADR.

### E13 – Doku

- `docs/architecture.md`: wie in E12, dazu im Datenfluss-Block „wegzeit.json nur auf Anlass (Kind-Sheet, Karte **auch auf der Merkliste**, …)“.
- `docs/ideas.md`:
  - entfallen, weil umgesetzt: „Anbieter merken oder ‚folgen‘“ (`:61`, samt Herz in der Anbieterliste), „Merkliste ‚Beginn ab‘“ (`:69`) und „Karte im Kalender oder in der Merkliste“ (`:46`),
  - „Kalender und Merkliste als Lazy-Chunks“ (`:59`) wird zu „Merkliste als Lazy-Chunk“, mit Verweis auf E11; der Verweis darauf in `:12` wird angepasst,
  - neu:
    - **„Angebote gemerkter Anbieter in der Merkliste“** (früher Etappe 5, N1): ein Chip „+ von meinen Anbietern“ in Liste und Karte, Standard aus, eigener Abschnitt „Von deinen Anbietern“, auf der Karte auch ihre Orte; Kalender, Export und Badge zählen sie nie. Stärkt die Suche nach einem Ersatzkurs. Logik als reine Funktion in `saved.ts`, nicht aus `directory.ts` (nur Lazy-Chunk).
    - „Neue Angebote gemerkter Anbieter in der Wochen-Nachricht“,
    - „Merklisten-Filter in der URL“,
    - „Freie Datumseingabe auf der Merkliste“.
- Vermerke `> **Geändert durch Plan 0025:** …` in:
  - Plan 0003: Z. 10 (drei Bereiche), Z. 71 (`ansicht=kalender`), E14 (Kalender),
  - Plan 0005: Nicht-Ziel „Karte in der Merkliste“, E5 (Umschalter),
  - Plan 0007: E5 (Monat klappt zu),
  - Plan 0008: E12 (Leerzustand Kalender),
  - Plan 0010: Z. 11 und E2 (vier Tabs), Nicht-Ziel „Anbieter merken“,
  - Plan 0021: Test „Hinweis auf Tab Kalender“.
- `README.md`: anpassen, falls es Tabs aufzählt (grep in Schritt 0).
- Vermerk in Plan 0026, Stufe 2 (Review Nachtrag, Minor): Gemerkte Anbieter stehen oben im Tab „Anbieter“, nicht auf der Merkliste, und sind nur IDs. Der Kopf der Merkliste hat Umschalter, Filter und Statuszeile mit Export-Knopf; den Ort von „Liste teilen“ (E15) und die Anbieterzeilen im Sheet (E13) legt Stufe 2 neu fest.
- `docs/architecture.md`, Privatsphäre: nur IDs, Anbieter nur in Tab und Sheet „Anbieter“ (statt Namens-Schnappschuss).

## Tests (test-first)

Domänenlogik zuerst rot, dann der Code. Unit-Tests laufen in `America/Los_Angeles`.

1. **`src/domain/saved.test.ts`**
   - `cleanSavedProviders`:
     - verwirft eine ungültige ID (Großbuchstaben, Leerzeichen),
     - verwirft eine zu lange ID (81 Zeichen),
     - bei Dubletten gilt der erste Eintrag,
     - die Reihenfolge bleibt erhalten.
   - `applySavedFilter`:
     - Format wirkt als ODER, dazu Anmeldung.
     - Zeitraum mit `useRange: true`: Ein Kurs mit erstem Termin im Zeitraum passt, mit erstem Termin davor nicht. Ein regelmäßiges Angebot passt mit irgendeinem Termin.
     - `useRange: false` ignoriert den Zeitraum.
     - Ein leerer Filter ergibt alle.
   - `savedFilterCount` mit und ohne Zeitraum.
2. **`src/domain/calendar.test.ts`**: `selectionRange`
   - für den Tag,
   - für die Woche: Mo–So, Beginn nie vor heute,
   - für den Monat: 1. bis Letzter, Beginn nie vor heute,
   - Monatswechsel Dez → Jan,
   - Zeitumstellung am 25.10.2026.

   `calendarNav` bleibt mit seinen Tests.
3. **`src/domain/agenda.test.ts`**: `rangeAgenda`
   - Gruppen nur für Tage mit Terminen,
   - beendete Termine fallen weg,
   - `ended` nur, wenn heute im Bereich liegt,
   - `hidden` = `allIndex` minus `index` im Bereich,
   - `afterData`,
   - ein Termin um 0:30 Berliner Zeit landet am Berliner Tag (LA-Zeitzone).

   Die Tests für `dayAgenda` werden auf `rangeAgenda` umgeschrieben.
4. **`src/domain/route.test.ts`**:
   - `merkliste-karte`/`merkliste-kalender` hin und zurück,
   - `tabSection` beider ergibt `merkliste`,
   - `ansicht=kalender` ergibt `entdecken` mit erhaltenen Filtern,
   - `isLegacyView`.

   `src/domain/ids.test.ts`: `MAX_PROVIDER_ID` ist 80 (nach dem Merge entfallen, `MAX_KEBAB_ID` prüft Plan 0026 dort schon an der Grenze).

   **`src/domain/directory.test.ts`**: `providerRows` mit `saved`
   - Ein gemerkter aktiver Anbieter steht nur in `saved`, nicht in `active`; ohne Suchtext ergibt `active.length` plus aktive in `saved` die Zahl aus `countProviders`.
   - Ein gemerkter ausgeblendeter Anbieter steht in `saved` mit Zustand `ausgeblendet` und zählt nicht in `hiddenCount`.
   - Ein gemerkter Anbieter ohne Termine steht in `saved`, nicht in `idle`.
   - Die Suche wirkt auf `saved`; `saved` ist nach Name sortiert, auch mit Startpunkt.
   - Eine gemerkte unbekannte ID ergibt keine Zeile.
   - Ohne gemerkte Anbieter ist das Ergebnis wie bisher (`saved: []`).
5. **`src/domain/date-range.test.ts`**: `quickRanges`
   - am 8.10.2026: 2026-11, 2026-12, 2027-01,
   - am 31.1.: der Folgemonat ist der Februar,
   - mit `dataEnd` 20.12.: nur zwei,
   - ohne `dataEnd`: keine.
6. **`src/data/preferences.test.ts`** (nur die Form):
   - kaputtes JSON → `[]`,
   - kein Array → `[]`,
   - Einträge, die keine Strings sind, fallen weg,
   - `saveSavedProviders([])` entfernt den Schlüssel,
   - Hin und zurück ergibt dieselbe Liste.

   Ungültige ID, Länge und Dubletten prüft Test 1.
7. **`src/ui/format.test.ts`**:
   - `selectionHeading`,
   - `savedStatusParts`: „5 Angebote mit insgesamt 28 Terminen gemerkt“, Singular „1 Angebot mit insgesamt 1 Termin gemerkt“, mit Filter „2 von 5 gemerkten Angeboten passen“ bzw. „1 von 5 … passt“,
   - `savedMapStatusParts`,
   - `exportLabel` mit und ohne Filter,
   - `savedFilteredEmpty` im Singular und Plural,
   - `quickRangeLabel`: „ab Nov.“, „ab Jan.“, „ab Mai“, „ab Juni“,
8. **`src/ui/use-offer-views.test.ts`**:
   - `views.map` ist bei `karte` gesetzt (`placeCount` aus `visible`), ebenso bei `merkliste-karte` (`placeCount` aus den gefilterten gemerkten Angeboten). Beide Male ist `cameraOffers` gleich `upcoming`. Sonst ist es `undefined`.
   - `savedCalendar` ist nur bei `merkliste-kalender` gefüllt.
   - Die Startauswahl ist die Woche von heute, mit `monthOpen` aus.
   - `endedToday` zählt ein gemerktes Angebot, dessen einziger Termin heute schon vorbei ist (M7).
   - Es gibt keinen `calendar`-Block mehr. Die alten Fälle `:121–177, 239–240` werden umgeschrieben oder gestrichen.

**E2E** (Fixtures, Uhr Mo 5.10.2026 12:00). Die Merkliste wird per `localStorage` vorbelegt (`zwergenplan.merkliste`, `zwergenplan.anbieter-merkliste`, über `page.addInitScript`), nicht per Herz-Tipp. Ausnahme sind die Tests, die das Merken selbst prüfen. Die Zahlen werden in Schritt 0 gegen `tests/fixtures/offers.json` nachgerechnet.

9. **`e2e/saved.spec.ts`**, erweitert:
   - Die Merkliste zeigt auch mit gemerkten Anbietern im Speicher keine Anbieter.
   - **Merkliste ohne gemerktes Angebot** (vorbelegt nur ein Anbieter): Karte und Kalender zeigen „Noch nichts gemerkt“, `.map-box` hat die Anzahl 0, kein Kachel-Request (Etappe 2 bzw. 3).
   - **Filter:** PEKiP (Kurs, mit Anmeldung, erster Termin 13.10.), Musikgarten (Kurs, mit Anmeldung, erster Termin 5.11.) und Krabbeltreff (regelmäßig, ohne Anmeldung, letzter Termin 4.11.) vorbelegen.
     - „Kurse“ ergibt 2 Karten. Mit zusätzlich „Ohne Anmeldung“ ergibt es 0, mit „Nichts, was zu deinem Filter passt“ / „Von deinen 3 gemerkten Angeboten passt keins.“ und „Filter zurücksetzen“. Zurücksetzen ergibt 3.
     - Nur „ab Nov.“ ergibt Musikgarten und Krabbeltreff, nicht PEKiP (Kurs-Regel: erster Termin im Oktober). Die Statuszeile zeigt „**2** von 3 gemerkten Angeboten passen“.
     - Es stehen genau „ab Nov.“ und „ab Dez.“ da. „ab Jan.“ fehlt, weil der letzte Fixture-Termin am 10.12. liegt (Musikgarten; in Schritt 0 nachprüfen).
     - Tab-Wechsel und zurück: Der Filter bleibt. Neuladen: Der Filter ist weg.
     - Die URL enthält nie `format=`, `anmeldung=` oder `von=` aus der Merkliste. Der Startseiten-Filter bleibt unberührt, in „Entdecken“ ist kein Chip aktiv.
   - **Statuszeile und Export:** „5 Angebote mit insgesamt N Terminen gemerkt“ (Zahl in Schritt 0 nachrechnen). Der Knopf „Alle in den Kalender“ steht nur in der Liste, nicht in Karte und Kalender. Mit aktivem Filter heißt er „Alle 3 gemerkten in den Kalender, auch ausgeblendete“ und enthält weiter alle Termine (dieselbe Zahl wie ohne Filter).
   - **Umschalter über die ganze Breite:** Seine Breite ist die des Inhalts (± 1 px), bei 320 px und 412 px.
10. **`e2e/merkliste-kalender.spec.ts`** (ersetzt `calendar.spec.ts`), mit Krabbeltreff und PEKiP vorbelegt:
    - **Start:** Die Woche 5.–11. Okt. ist gewählt (`aria-pressed` am Wochentitel). Die Liste „Diese Woche“ hat 1 Termin (Krabbeltreff Mi 7.10.).
    - **Tag und Woche:**
      - Tipp auf Mi ergibt „Mittwoch, 7. Oktober“ mit 1 Termin.
      - Tipp auf den Wochentitel führt zurück zur Woche.
      - Ein zweiter Tipp auf Mi lässt den Tag gewählt.
    - **Blättern:** Pfeil › ergibt die Woche 12.–18. Okt. mit 2 Terminen (PEKiP Di 13., Krabbeltreff Mi 14.), gruppiert mit `h3` je Tag.
    - **Monat:**
      - „Ganzen Monat zeigen“ ergibt „Oktober 2026“ mit 7 Terminen.
      - Tipp auf den 20.: Der Tag ist gewählt, das Raster bleibt offen, und bei 320×640 liegt `h2.daylabel` danach im Viewport (M3).
      - Der Monatstitel wählt wieder den Monat.
      - „Monat zuklappen“ ergibt die Woche um den Anker. Der Monatsknopf behält Fokus und Lage (H2).
    - **Nur Gemerktes:** Nicht gemerkte Angebote erscheinen nie, z. B. „Krabbelreime & Fingerspiele“ am Fr 9.10.
    - **Filter im Kalender:**
      - Filter „Kurse“ in der Woche 12.–18. ergibt 1 Termin.
      - In der Woche 5.–11. ergibt er „1 gemerkter Termin blendet der Filter aus“ mit „Zurücksetzen“.
      - Die Statuszeile zählt ohne Zeitraum.
    - **Leere Auswahl ohne Filter:** „Für diese Woche hast du nichts gemerkt“ mit „Für diese Woche entdecken“. Der Knopf führt zu „Entdecken“ mit `von=`/`bis=` dieser Woche.
    - **Übernommen aus `calendar.spec.ts`:**
      - heute schon vorbei (B2, Elterncafé gemerkt; zählt trotz fehlendem kommenden Termin, M7),
      - nach dem Datenhorizont (B8),
      - das Detail nimmt den gewählten Termin,
      - „jetzt“ erneuert sich (Timer, `visibilitychange`, Tageswechsel).
    - **Zeitraum:** Die Chips „ab …“ sind im Kalender ausgeblendet. Ihr Wert gilt wieder in der Liste.
9a. **`e2e/merkliste-anbieter.spec.ts`** (neu, Tab „Anbieter“, Fixtures aus `tests/fixtures/`):
    - **Merken im Sheet:** Detail „Offener Krabbeltreff“ → „Mehr von diesem Anbieter“ → Herz im Sheet. Erwartet: Toast „Anbieter gemerkt – steht jetzt oben im Tab „Anbieter““ und `aria-pressed="true"`. Im Tab „Anbieter“ steht er unter „Gemerkte Anbieter“ und nicht noch einmal unter „Weitere Anbieter“. Das übersteht ein Neuladen.
    - **Merken in der Liste:** Herz an einer Zeile unter „Weitere Anbieter“ → die Zeile steht unter „Gemerkte Anbieter“, mit `aria-pressed="true"`. Der Fokus liegt danach auf dem Herz der nachrückenden Zeile. Herz im Abschnitt „Gemerkte Anbieter“ → zurück unter „Weitere Anbieter“; war es der letzte, verschwinden beide Überschriften.
    - **Reihenfolge:** Suchfeld, Statuszeile, „Gemerkte Anbieter“, „Weitere Anbieter“ (DOM-Reihenfolge).
    - **Suche:** Ein Suchtext, der nur einen gemerkten Anbieter trifft, zeigt ihn unter „Gemerkte Anbieter“ und kein „Kein Anbieter heißt so.“. Die Statuszeile bleibt unverändert.
    - **Filter:** Mit einem Startseiten-Filter, der den gemerkten Anbieter ausblendet, bleibt seine Zeile oben, blass mit „passt nicht zur Auswahl“.
    - **URL:** Sie enthält nie eine gemerkte Anbieter-ID, außer `anbieter=` bei offenem Sheet.
    - **Privatsphäre:** Mit gemerkten Anbietern im Speicher laden Start, „Angebote“ und Merkliste weder `anbieter.json` noch den Anbieter-Chunk. Der Tab „Anbieter“ lädt beides je genau einmal, wie ohne Gemerktes. Gezählt wird nach `startPreloads`.
11. **Umschalter und Route** (`e2e/saved.spec.ts`):
    - Liste | Karte | Kalender setzt `ansicht=merkliste`, `merkliste-karte` bzw. `merkliste-kalender`.
    - Ein Deep-Link auf jede Darstellung funktioniert, und der Tab „Merkliste“ ist aktiv.
    - Der Fokus bleibt auf dem Segment.
    - Auf keiner Merklisten-Ansicht stehen Sticker oder Schnellfilter der Startseite (M1).
12. **Merklisten-Karte** (`e2e/karte.spec.ts`, `tiles: "mock"`):
    - Die Orts-Liste enthält nur gemerkte Orte. Die Statuszeile zeigt „N Angebote an M Orten gemerkt“.
    - Der Startausschnitt ist gleich dem von „Entdecken“ (Kamera-Regel: dieselben Kachel-Requests beim ersten Öffnen einer frischen Sitzung).
    - Das Öffnen lädt die Wegzeit-Tabelle (Anlass), Liste und Kalender der Merkliste nicht (`e2e/startpunkt.spec.ts`).
13. **Alte URL** (`e2e/app.spec.ts`):
    - `?ansicht=kalender&kat=musik` → URL wird `?kat=musik`, Tab „Entdecken“ aktiv, Musik-Filter aktiv.
    - `?ansicht=kalender&anbieter=theater-beispiel` → Sheet offen über „Entdecken“.
    - `?von=2026-11-06&ansicht=kalender` → URL wird `?von=2026-11-06`, „Entdecken“ mit Zeitraum (ersetzt `e2e/zeitraum.spec.ts:161–168`).
14. **Tab-Leiste** (`e2e/layout.spec.ts`): drei Tabs (`TAB_NAMES = ["Angebote", "Anbieter", "Merkliste"]`). Geprüft werden Spalten, Badge, Seitenleiste quer und kompakt quer, bei 320–412 px und 100–200 %.
15. **Mobile-UX-Matrix** (`e2e/mobile-ux.spec.ts`). Neue Zustände statt `kalender`/`kalender-woche`:
    - `merkliste-liste`: 3 gemerkt, Filter „Kurse“ aktiv,
    - `merkliste-karte`,
    - `merkliste-kalender-woche`,
    - `merkliste-kalender-monat`: Tag gewählt,
    - `anbieter-gemerkt`: Tab „Anbieter“ mit zwei gemerkten (einer ohne Termine),
    - `anbieter-sheet-gemerkt`,
    - `merkliste-gefiltert-leer`.

    Die Hilfen `calendarAt320`/`weekWithTwoDigitMonday` (`:466–490`) und der Test bei 320 px mit reduzierter Bewegung (`:455–460`) laufen im Merklisten-Kalender. Der Umschalter mit drei Segmenten wird bei 320 px und 200 % geprüft.
16. **Smoke** (`e2e/smoke.spec.ts:39–40`): Ansicht „Merkliste Kalender“ mit drei gemerkten echten Angeboten bei 320 px/200 %.
17. **Angepasste Bestandstests**: alle Zeilen der Tabelle in „Ausgangslage“.

## Schritte

**Schritt 0 – Vorbereitung** (vor jeder Etappe)
- `git fetch` und `main` in den Arbeitsbranch mergen. Die Vorbedingungen (Plan 0022 für Etappe 1, Plan 0023 für Etappe 3 und 4) sind seit `d5fab1b` erfüllt.
- Weichen Namen auf `main` vom „Abgleich mit `main`“ ab, hier per Vermerk nachtragen.
- `grep -rni "kalender" src e2e scripts docs README.md` als Inventar.
- Die Fixture-Zahlen der E2E-Fälle nachrechnen. Das Start-JS auf `main` messen (`pnpm size`).

**Etappe 1 – Anbieter merken** (unabhängig von 0023, einzeln mergebar)
1. Die Tests 1 (`cleanSavedProviders`), 4 (`MAX_PROVIDER_ID`, `providerRows` mit `saved`) und 6 rot schreiben.
2. Logik umsetzen:
   - `MAX_PROVIDER_ID` nach `ids.ts` verschieben,
   - `cleanSavedProviders` in `saved.ts`,
   - `loadSavedProviders`/`saveSavedProviders` in `preferences.ts` (Rohform, nur IDs),
   - `useSavedProviders` in `use-app-state.ts`,
   - `providerRows` mit `saved` in `directory.ts`.
3. Herz im `ProviderSheet` (E2). Die Props laufen durch `provider-types.ts`, `Overlays.tsx` und `App.tsx`.
4. Tab „Anbieter“ (E3): `ProviderSearch` über der Statuszeile, Abschnitte „Gemerkte Anbieter“ und „Weitere Anbieter“, Herz in jeder Zeile mit Fokusregel. `SavedView` bleibt in dieser Etappe unberührt.
5. E2E: Test 9a. Mobile-UX: `anbieter-gemerkt`, `anbieter-sheet-gemerkt`. **Signal „Liste geladen“** (Review Nachtrag M1): Das Suchfeld steht jetzt vor dem Chunk. `e2e/anbieter.spec.ts` und `e2e/anbieter-inhalt.spec.ts` warten deshalb auf die Region „Anbieter“ (`listReady`), nicht auf das Suchfeld.
6. Doku: Privatsphäre-Invariante, `ideas.md`, Vermerk in Plan 0010. Das Delta in ADR 0012 eintragen.
7. Gates nach CLAUDE.md („Lokal prüfen“, Review Nachtrag M4): `pnpm verify`, dazu gezielt `pnpm e2e:local e2e/merkliste-anbieter.spec.ts e2e/anbieter.spec.ts e2e/anbieter-inhalt.spec.ts e2e/mobile-ux.spec.ts e2e/layout.spec.ts` (`run_in_background`) und `pnpm size` für ADR 0012. Dann `/arch-review` (Speicherformat, > 200 Zeilen), Branch, CI, Fast-Forward, `/browser-review live`.

**Stand Etappe 1:** live seit `83da3b0` (2026-10-08), CI auf `main` grün, `/browser-review live` ohne Blocker und Major. Start-JS +0,336 kB (ADR 0012). Befunde:
- Minor 1: Im Tab „Anbieter“ klebt die Statuszeile rund 4 px unter dem Schatten des Suchfelds. → Etappe 2, Schritt 5 (Abstand unter `.provider-search`).
- Minor 2: Bei 320 px und 200 % werden Anbieterzeilen neben dem Herz bis zu 760 px hoch; kein WCAG-Verstoß. → `docs/ideas.md`.

**Etappe 2 – Umschalter und Karte auf der Merkliste** (zwei Segmente Liste | Karte)
1. Rot schreiben:
   - Test 4 (nur `merkliste-karte`),
   - Test 7 (`savedMapStatusParts`),
   - Test 8 (`views.map` für beide Karten).
2. `TABS` um `merkliste-karte` erweitern, `tabSection` anpassen. `ViewToggle` wird allgemein, mit `--n` und der Daumenbreite in `map.css` (E4).
3. Die Weichen in `App.tsx` auf `section` umstellen (E4, M1). `views.map` für beide Karten berechnen.
4. `MapPanel` in der Merkliste mit `cameraOffers = upcoming` und Wegzeit-Anlass. Leerzustände der Karte (E5a).
5. Abstand unter dem Suchfeld im Tab „Anbieter“ (Browser-Review Etappe 1, Minor 1). Kopf der Merkliste nach E3a: Umschalter `.view-toggle.full` unter der Überschrift, Statuszeile `savedStatusParts`/`savedMapStatusParts` (ohne Filter-Varianten), runder Export-Knopf mit `exportLabel` nur in der Liste (E9). Der breite Knopf und die Export-Zeile entfallen. Test 7 (`savedStatusParts` ohne Filter, `exportLabel` ohne Filter) zuerst rot.
6. E2E: Tests 11 und 12 sowie Statuszeile, Export und Umschalterbreite aus Test 9. Mobile-UX: `merkliste-karte`, Merkliste als Liste.
7. Doku: `architecture.md` (Anlass), Vermerk in Plan 0005. Das Delta in ADR 0012 eintragen. Gates: `pnpm verify`, gezielt `e2e/saved.spec.ts`, `e2e/karte.spec.ts`, `e2e/startpunkt.spec.ts`, `e2e/mobile-ux.spec.ts`, `e2e/layout.spec.ts`, `pnpm size`. Dann Review, Merge, Browser-Review.

**Stand Etappe 2:** committet in `7850b53` (2026-10-08), mit `origin/main` (`2cce4ea`, Herz in der Anbieterkachel) zusammengeführt, noch nicht live. Start-JS +0,316 kB (96,493 → 96,809 kB), CSS +0,092 kB (ADR 0012). Summe Etappen 1 und 2: +0,652 kB, unter dem Entscheidungspunkt von +2,5 kB (E11). Abweichungen vom Plan:
- Keine Icons im Umschalter: Der Plan nennt keine, im Icon-Set fehlen passende, und bei 320 px und 200 % wird es eng.
- `exportLabel` hat die Filtervariante schon (`exportLabel(savedCount, filtered)`); Etappe 4 muss sie nur noch verdrahten.
- Die Zeile „Kurse komplett, regelmäßige nur passend zum Alter“ entfällt, den Hinweis gibt nur noch der Toast nach dem Export.

**Etappe 3 – Merklisten-Kalender, der Tab „Kalender“ entfällt** (braucht Plan 0023, auf `main` seit `d5fab1b`)
1. Rot schreiben: Tests 2, 3, 4 (Rest), 7 (`selectionHeading`) und 8 (`savedCalendar`, `endedToday`).
2. Domäne: `CalendarSelection` und `selectionRange` in `calendar.ts`, `rangeAgenda` in `agenda.ts`. `dayAgenda` entfernen.
3. UI:
   - `git mv src/ui/CalendarView.tsx src/ui/SavedCalendar.tsx` und nach E5 umbauen,
   - `scrollIntoView` nach dem Tipp im Monat,
   - dritte Option „Kalender“ im Umschalter,
   - Umbau in `use-offer-views.ts` (E8),
   - Leerzustände des Kalenders.
4. Den Tab entfernen und „Entdecken“ in „Angebote“ umbenennen (E8):
   - `TAB_ITEMS`,
   - `tabs.css` über `--n`,
   - `isLegacyView` mit `replaceState` in `useRoute`,
   - die Kalender-Zweige in `App.tsx`.
5. E2E: Tests 10, 13, 14, 15 (Kalender-Zustände) und 16. Alle Bestandstests aus der Tabelle anpassen, `calendar.spec.ts` löschen.
6. `scripts/screenshots.ts` umstellen, `node scripts/font-fallback.ts` prüfen.
7. Doku:
   - `architecture.md`: Tab-Leiste, Wegzeit-Platzhalter,
   - Vermerke in den Plänen 0003, 0007, 0008, 0010 und 0021,
   - das Delta in ADR 0012.
8. Gates: `pnpm verify`, gezielt alle Specs der Inventar-Tabelle plus `e2e/merkliste-kalender.spec.ts`, `e2e/layout.spec.ts`, `e2e/smoke.spec.ts` (`PW_SUITE=smoke`), bei Änderungen an `e2e/fixtures.ts` oder `e2e/mobile-ux.ts` auch `e2e/theme.spec.ts`; `pnpm size`. Dann `/arch-review`, Merge, `/browser-review live`.

**Stand Etappe 3:** committet (2026-10-08), noch nicht gemergt und nicht live. Start-JS +0,575 kB (96,812 → 97,387 kB), CSS +0,085 kB (ADR 0012). Summe Etappen 1–3: +1,227 kB, unter dem Entscheidungspunkt von +2,5 kB (E11). Gates lokal grün: `pnpm verify`, alle Specs der Inventar-Tabelle plus `e2e/merkliste-kalender.spec.ts`, `layout`, `mobile-ux`, `theme` (pixel-7), Smoke. Abweichungen vom Plan:
- **„Für heute ist alles vorbei“ auch in Woche und Monat**: Plan E5 nennt Fall 2 nur für `tag` = heute. Steht in der Woche heute nur ein schon beendeter gemerkter Termin und sonst nichts, sagte Fall 4 „Für diese Woche hast du nichts gemerkt“, und das wäre falsch. `rangeAgenda` liefert `ended` ohnehin nur, wenn heute im Bereich liegt; in Woche und Monat steht zusätzlich der Knopf „Für diese Woche entdecken“.
- **Wochentitel kurz**: `weekTitle` schreibt wie im Mockup „5.–11. Okt.“ statt „5.–11. Oktober“.
- **`savedCalendar` ohne `lastDay`**: Die Grenze der Pfeile ist der ganze Datenstand (E5), also gleich `dataEnd`; ein zweites Feld entfällt. `allIndex` ist bis zum Merklisten-Filter (Etappe 4) gleich `index`, Fall 1 („… blendet der Filter aus“) ist gebaut, greift aber erst mit Etappe 4; ebenso „Filter im Kalender“ und die Chips „ab …“ (Test 10).
- **Tab-Leiste mit drei Tabs, zwei Schwellen neu** (`tabs.css`, `docs/architecture.md`): Nur-Icon hochkant unter `5.5rem` statt `4.25rem` (sonst wuchs das Badge ab 150 % in die Label-Zeile), kompakt quer `calc(5.6rem + 52px)` statt `calc(4.25rem + 60px)` (das dreistellige Badge wächst mit der Schrift; bei 639 × 320 und 200 % ragte „100“ über die Karte). Labels stehen damit wie bisher hochkant bis 125 %, kompakt quer jetzt bis 125 % statt nur bei 100 %.
- **`.mgrid.inmonth` und `.week.inweek`** (Mockup): Ist der ganze Monat bzw. die ganze Woche gewählt, tragen die wählbaren Tage ein Feld bzw. einen festen Rand. Der Layout-Test „bei 100 % bleiben nicht gewählte Tage ohne Hintergrund“ läuft deshalb mit gewähltem Tag, ein neuer prüft den gewählten Monat.
- **E2E-Streichungen aus `calendar.spec.ts`**: „ausgeblendete Angebote statt ‚Freier Tag‘“ (Plan 0008, E12) entfällt, denn Startseiten-Filter und Alter wirken im Kalender der Merkliste nicht; den Merklisten-Filter prüft Etappe 4. „Monat klappt zu“ ist durch „Raster bleibt offen“ ersetzt. Alle übrigen Fälle stehen in `e2e/merkliste-kalender.spec.ts`. `e2e/startpunkt.spec.ts` prüft die Statuszeile mit Startpunkt jetzt in der Liste (die hat den Umschalter daneben, die Prüfung „ab 390 px einzeilig“ galt nur dem Kalender ohne Umschalter).
- **`scripts/screenshots.ts`**: Die Ansicht `merkliste-kalender` merkt per Herz statt per `localStorage`, damit sie auch live mit echten IDs läuft. `scripts/font-fallback.ts` probt „Angebote“; die `size-adjust`-Werte bleiben gleich (Tabs sind `fit: false`), `tokens.css` unverändert.
- `docs/ideas.md`: „Karte im Kalender oder in der Merkliste“ gestrichen, „Kalender und Merkliste als Lazy-Chunks“ wird „Merkliste als Lazy-Chunk“ (E13).
- **Merge mit Plan 0028** (`main` 497819d): Der Kalender der Merkliste zeigt regelmäßige Angebote mit Geburtsdatum nur an Tagen, an denen sie zum Alter passen, `sessionsByDay(saved, sessionFit(birthDate))` (`use-offer-views.ts`, `savedIndex`), unabhängig vom Altersfilter in „Entdecken“. `allIndex` bleibt gleich `index`: Unpassende Termine sind keine Filter-Ausblendung. Die Liste der Merkliste steht am Termin aus `shownSession` (Plan 0028, E2). Tests: `use-offer-views.test.ts` (rot ohne Prädikat geprüft) und ein Fall in `e2e/merkliste-kalender.spec.ts`.
- **Befunde aus dem Browser-Review live von Etappe 2**: M1, die Seite sprang beim Wechsel Liste → Karte nach oben, weil das Dokument beim Laden des Karten-Chunks auf die Viewport-Höhe schrumpfte. `MapPanel` hält beim Laden unter dem Platzhalter `.map-rest` (12 rem) frei (`e2e/karte.spec.ts`). Der Wechsel zum Kalender lädt nichts nach; ist der Kalender kürzer als die Liste, steht er oben, das ist kein Sprung im Zwischenzustand. M2, der Export-Knopf ragte samt Schatten in die erste Kachel: 8 px Abstand unter der Zeile (`list.css`, `e2e/layout.spec.ts`). Die drei älteren Befunde (Herz im Orts-Sheet, Umschalter dunkel, Fokusrahmen) stehen in `docs/ideas.md`.
- **Merge mit dem Plan-0028-Nachtrag und Arch-Review** (`main` 507dc8b): Detail per `detailSession`, Statuszeile mit `missingSuffix`, Toast-Ton „hint“ sind übernommen. Der Arch-Review fand zwei Mittel-Befunde: `endedOnDay` zählte unpassende Termine als „heute vorbei“ (jetzt mit Prädikat `sessionFit(birthDate)` wie `sessionsByDay`, Tests in `agenda.test.ts` und `use-offer-views.test.ts`), und die Invariante Altersprüfung in `docs/architecture.md` nannte den Kalender der Merkliste nicht. Dazu Minor: `savedOffers` liefert Paare `{offer, session}`, die Liste der Merkliste rechnet `shownSession` nicht mehr selbst; Testtitel und Kommentar in `tabs.css` (drei Tabs) nachgezogen.

**Etappe 4 – Filter auf der Merkliste** (braucht Plan 0023, auf `main` seit `d5fab1b`)
1. Rot schreiben:
   - Test 1 (`applySavedFilter`, `savedFilterCount`),
   - Test 5,
   - Test 7 (Filter-Varianten von `savedStatusParts`, `savedMapStatusParts` und `exportLabel`; `savedFilteredEmpty`, `quickRangeLabel`).
2. `SavedFilter` und seine Funktionen in `saved.ts`, `quickRanges` in `date-range.ts`.
3. UI:
   - `SavedFilters.tsx` mit Chips für Format, Anmeldung und „ab …“,
   - der Zustand in `App.tsx`,
   - die Filter-Varianten der Statuszeile („2 von 5 gemerkten Angeboten passen“) und des Export-Namens (E3a, E9),
   - die gefilterten Leerzustände (E5a),
   - „Filter zurücksetzen“ in den Leerzuständen des Kalenders.
4. E2E: Test 9 (Filter, Export) und Test 10 (Filter im Kalender). Mobile-UX: `merkliste-liste`, `merkliste-gefiltert-leer`.
5. Doku: Die `ideas.md`-Einträge aus E13 (auch `:69` „Merkliste ‚Beginn ab‘“ streichen). Das Delta in ADR 0012 eintragen. Gates: `pnpm verify`, gezielt `e2e/saved.spec.ts`, `e2e/merkliste-kalender.spec.ts`, `e2e/mobile-ux.spec.ts`, `pnpm size`. Dann Review, Merge, Browser-Review.

**Stand Etappe 4:** committet (2026-10-09), noch nicht gemergt und nicht live. Start-JS +0,940 kB (97,770 → 98,710 kB, gemessen gegen `ca6d80d`), CSS +0,020 kB (ADR 0012). Summe Etappen 1–4: +2,167 kB, mit den Fixes aus Etappe 2 (im Merge mit Plan 0028 gemessen, +0,214 kB zusammen) höchstens +2,381 kB, unter dem Entscheidungspunkt von +2,5 kB (E11); die übrigen Merges von `main` zählen nicht mit. Jeder weitere Zuwachs der Merkliste löst N5 aus. Gates lokal grün: `pnpm verify`, gezielt `saved`, `merkliste-kalender`, `mobile-ux`, `layout`, `merkliste-anbieter`, `zeitraum`, `detail` (pixel-7). `/arch-review` und `/browser-review` stehen noch aus. Abweichungen vom Plan:
- **`toggleSavedFilter(filter, chip)`** mit dem Typ `SavedFilterChip` in `saved.ts` (nicht im Plan): Was ein Tipp auf einen Chip bewirkt (Format Mehrfachwahl, Anmeldung Einfachwahl, Schnellwahl Einfachwahl mit Aufheben), ist Filterlogik und gehört in die Domäne, nicht in `SavedFilters.tsx`. `toggleId` ist dafür generisch (`<T extends string>`), ohne Cast.
- **`matchesSavedFilter(offer, filter)`** in `saved.ts` (nicht im Plan): `endedToday` braucht Format und Anmeldung ohne Zeitbezug, denn `applySavedFilter` (über `applyFilters`) verwirft Angebote ohne kommenden Termin, und genau die zählen für „heute schon vorbei“ (M7).
- **Statuszeile mit Filter als eigene Funktion** `savedFilterStatusParts(shown, total)` statt einer Variante von `savedStatusParts`: Sie hat nur eine fette Zahl. Die Karte bekommt `savedMapStatusParts(offers, places, total?)`. Singular über `total` mit „von 1 gemerkten Angebot“. Mit Filter entfällt der Zusatz „– 1 Angebot passt nicht zum Alter“ (Plan 0028, B2): Er gilt allen gemerkten, nicht den passenden; der Export-Toast nennt ihn weiter.
- **Karte ohne passendes Angebot**: Die Statuszeile bleibt stehen („0 von 3 gemerkten Angeboten an 0 Orten“), darunter der Leerzustand aus E5a. Ebenso in der Liste („0 von 3 … passen“).
- **`savedOffers(…, range?)`**: Mit Schnellwahl stellt die Merkliste ein Angebot an den Termin im Zeitraum (`shownSession` mit `range`, E3a) und sortiert danach; ohne Filter bleibt `views.saved` die Quelle.
- **`useOfferViews`**: Eingabe `savedFilter` ist optional (Standard leer), damit die Bestandstests unverändert bleiben. Neu sind `savedVisible` (gefiltert für die aktuelle Darstellung, im Kalender ohne Zeitraum), `savedFiltered` und `savedQuick` (`quickRanges` mit dem ganzen Datenstand). `allIndex` ist jetzt ungefiltert, `index` gefiltert; Fall 1 („… blendet der Filter aus“) greift.
- **Fokus nach „Zurücksetzen“**: Chip „Zurücksetzen“, „Filter zurücksetzen“ im Leerzustand und im Kalender verschwinden nach dem Tipp. Der Fokus geht vorher auf die Statuszeile (`tabIndex=-1`), sie meldet die neue Zahl (Muster aus Plan 0021, E3). Der Plan sagte dazu nichts.
- **Kalender, Fall 1**: Der Knopf heißt wie in den übrigen Leerzuständen „Filter zurücksetzen“, nicht „Zurücksetzen“ (Test 10).
- **Filterzeile im Inhalt**: `.saved-filters .chips { margin-inline: -16px }` (`list.css`), damit sie wie die Schnellfilter bis an den Rand scrollt, obwohl sie in `main.body` steht.
- **E2E**: Test 9 (Filter, Export) in `e2e/saved.spec.ts`, dazu die Statuszeile der Merklisten-Karte mit Filter und der Leerzustand der Karte mit `expectMobileUx`. Test 10 (Filter im Kalender, Schnellwahl im Kalender ausgeblendet) in `e2e/merkliste-kalender.spec.ts`, Fall 1 mit `expectMobileUx`. Mobile-UX-Zustände `merkliste-liste` und `merkliste-gefiltert-leer` in `e2e/mobile-ux.spec.ts`; `e2e/mobile-ux.ts` ist unverändert.
- `docs/ideas.md`: „Merkliste ‚Beginn ab‘“ gestrichen; neu „Merklisten-Filter in der URL“, „Freie Datumseingabe auf der Merkliste“ und „Weitere Filter auf der Merkliste“ (N4).

**Abschlussrunde** (2026-10-09, Browser-Review live von Etappe 3 mit Plan 0028, Arch-Review von Etappe 4). Start-JS +0,139 kB (98,710 → 98,849 kB), CSS +0,021 kB (ADR 0012). Damit liegt die Summe bei +2,306 kB, mit den Fixes aus Etappe 2 bei höchstens +2,520 kB. Das ist über +2,5 kB, **N5 ist ausgelöst**. Nutzerentscheid 2026-10-09: akzeptiert, Grenze für Plan 0025 nachträglich +2,6 kB, kein Lazy-Chunk (ADR 0012).
- **Mittel, eingeklappte Terminliste im Detail:** Sie zeigte nur die ersten vier Termine. Lag der Bezugstermin (`detailSession`) dahinter, war kein Termin hervorgehoben. `collapsedSessions(upcoming, ref, 4)` in `agenda.ts` hängt ihn an, der Knopf „Alle … Termine zeigen“ erscheint nur, wenn dann noch Termine fehlen. Tests: `agenda.test.ts`, `e2e/detail.spec.ts` (Treff mit Geburtsdatum 2026-05-01, passt erst am 5. Termin).
- **Minor 1, Leerzustand bei nur altersbedingt Ausgeblendetem:** `rangeAgenda` zählt `ageHidden` aus `ageIndex`, dem Index nach Merklisten-Filter ohne Altersprüfung (nur mit Geburtsdatum). Der Kalender sagt dann „Nichts passt zum Alter – Für diese Woche hast du nur Termine gemerkt, die nicht zum Alter passen.“ statt „Nichts gemerkt“. Tests: `agenda.test.ts`, `format.test.ts`, `e2e/merkliste-kalender.spec.ts`.
- **Minor 2, Abstand unter dem Umschalter:** `fieldset.view-toggle.full` hat unten 4 px Rand; `e2e/layout.spec.ts` prüft bei 320 px und 100/200 % mindestens 8 px vom Umschalter zum ersten Chip und vom Chip zum Export-Knopf bzw. zur Statuszeile. Die Filterzeile aus Etappe 4 steht inzwischen dazwischen.
- **Minor 3 und 4** (Seitenleiste quer, Monatsraster bei 320 px und 200 %): Restpunkte in `docs/ideas.md`.
- **Arch-Review Etappe 4:** `isSavedFilterChipOn(filter, chip)` in `saved.ts`, genutzt von `SavedFilters.tsx` und `toggleSavedFilter`, die Schnellwahl vergleicht jetzt `from` und `to`. Der Export-Name nimmt `filtered` der Darstellung (`exportLabel(offers.length, filtered)`). `--body-pad` in `list.css` für `.body` und die Filterzeile. Privatsphäre-Invariante um den Merklisten-Filter ergänzt (`docs/architecture.md`).

## Offene Punkte (Nutzerentscheid)

**Entschieden (Nutzer, 2026-10-08):** Alle Empfehlungen sind angenommen.
- N2: nein, die Karte zeigt nur Orte gemerkter Angebote.
- N3: nein, der Export nimmt weiter alle gemerkten Angebote.
- N4: vorerst keine weiteren Filter.
- N5: Reißt das Budget, wird zuerst die Grenze geprüft, erst danach ein Lazy-Chunk geplant.
- N6: Die Woche bleibt Mo–So.

Die Punkte unten bleiben zur Nachvollziehbarkeit stehen.

- **N1 – Angebote gemerkter Anbieter in der Merkliste?** Das Review hat entschieden: aus dem Plan genommen, steht als Idee in `docs/ideas.md` (E13). Wer es später will, schreibt einen eigenen Plan.
- **N2 – Orte gemerkter Anbieter auf der Karte?**
  - Ohne N1 gibt es Anbieter-Orte nur für Anbieter mit kommenden Angeboten, und das sind dann nicht gemerkte Angebote.
  - **Empfehlung:** nein. Die Karte zeigt nur Orte gemerkter Angebote, damit jeder Marker dasselbe bedeutet. Wer bei einem Anbieter schauen will, öffnet sein Sheet.
- **N3 – Nur die gefilterten Angebote exportieren?**
  - Heute (und laut E9) gehen alle gemerkten in die ICS-Datei.
  - Die Alternative: Mit aktivem Filter exportiert der Knopf nur die sichtbaren („3 in den Kalender“).
  - **Empfehlung:** alle, wie bisher. Der Filter dient dem Suchen, und ein Export, der still vom Filter abhängt, verliert Termine. Die Zeile sagt es (E9). Wer nur einen Teil will, exportiert im Detail einzeln.
- **N4 – Weitere Filter auf der Merkliste?**
  - Der Wunsch nennt „vor allem“ Format und Anmeldung. Kategorie und Kosten wären mit `matchesFilter` billig, kosten aber Platz in der Chipzeile.
  - **Empfehlung:** vorerst nein und nach zwei Wochen Nutzung fragen.
- **N5 – Falls das Budget reißt (E11):** Nur relevant, wenn die Etappen zusammen mehr als +2,5 kB bringen.
  - **Empfehlung:** zuerst die Budgetgrenze prüfen (wie bei Plan 0019: Der Nutzer hob auf 100 kB). Erst danach einen Lazy-Chunk für die Merkliste mit eigenem ADR planen.
- **N6 – Wochenstart des Kalenders.**
  - Die Woche bleibt Mo–So (Nicht-Ziel „rollende Woche“). Für „seine Woche planen“ ist am Sonntag die neue Woche oft interessanter.
  - **Empfehlung:** so lassen. Am Sonntag ist die nächste Woche einen Pfeil entfernt.

## Risiken

- **Viele E2E-Änderungen in Etappe 3** (siehe die Tabelle oben).
  - Gegenmittel: die Tabelle als Checkliste abarbeiten.
  - `calendar.spec.ts` erst löschen, wenn jeder Test eine Entsprechung oder eine begründete Streichung hat.
- **Parallele Pläne:** Plan 0022–0024 sind seit `d5fab1b` auf `main`. Es bleibt das übliche Konfliktrisiko in `SavedView.tsx`, `App.tsx` und `map.css`. Gegenmittel: vor jeder Etappe `main` mergen (Schritt 0).
- **Die Seitenleiste quer wirkt mit drei Tabs leerer.** Der Browser-Review prüft das (Etappe 3).

## Abgleich mit `main` (2026-10-08, `d5fab1b`)

Plan 0022–0024 sind umgesetzt. Geprüft wurde gegen den echten Stand. Die freigegebenen Entscheidungen bleiben unverändert; korrigiert sind nur Namen und Datei:Zeile.

- **Plan 0023:** Die Annahmen stimmen, nur der Ort weicht ab. Die Zeitraumlogik liegt nicht in `filter.ts`, sondern in `src/domain/date-range.ts` (`DateRange` als Union, `dateRange`, `rangeSession`, `inDateRange`, `fieldLimits`, `checkBound`, `notEnded`). `FilterState.range`, `withDateRange`, die URL `von=`/`bis=`, `searchOf` (ohne Zeitraum) und `groupByNextSession(…, range)` sind wie beschrieben. Folgen im Plan:
  - `quickRanges` kommt nach `date-range.ts` (E7, Test 5).
  - `applySavedFilter` ruft `applyFilters` mit `range` (E6).
  - Die Karten der Liste nutzen `rangeSession` (E3).
  - „Für diese Woche entdecken“ nutzt `withDateRange` (E5).
  - Neu im Inventar: `e2e/zeitraum.spec.ts:161–168` prüft den Zeitraum im alten Kalender-Tab und entfällt mit ihm (Ersatz in Test 13). `docs/ideas.md:69` („Merkliste ‚Beginn ab‘“) wird mit Etappe 4 gestrichen.
  - Schnellwahlen bringt Plan 0023 nicht mit. Die Merkliste bekommt sie wie geplant als Chips.
- **Plan 0022:** Die Annahmen stimmen: „Meine Merkliste“, „N gemerkt · …“, Leerzustand „Noch nichts gemerkt“, Toasts „Gemerkt – liegt jetzt auf deiner Merkliste“ / „Nicht mehr gemerkt“. Die Anbieter-Toasts folgen diesem Muster (E2).
- **Plan 0024:** Die Annahmen stimmen. Die Marker liegen in `src/ui/map/marker-images.ts` und `layers.ts`, die Grundkarte in `basemap.ts`. Die Kategorie je Ort ist die häufigste der übergebenen Angebote (`geojson.ts:45–49`), auf der Merkliste also die der gemerkten. Es braucht keinen eigenen Code.
- **Zeilen:** `App.tsx`, `use-offer-views.ts`, `docs/architecture.md`, `docs/ideas.md` und die E2E-Tabelle sind auf `d5fab1b` umgestellt. Unverändert sind `ViewToggle` (`Chrome.tsx:179`), `.view-toggle .seg-thumb { width: 50% }` (`map.css:33–38`), `TABS`/`MAX_PROVIDER_ID` (`route.ts:9, 15`) und `NoOffers` in `MapScreen.tsx:114`. Plan 0018 ist weiter nicht umgesetzt (`src/ui/ics-export.ts` fehlt). E9 gilt also mit dem Lader in `SavedView.tsx`.

## Nachtrag aus dem Mockup (2026-10-08)

Der Nutzer hat das Mockup (Kopfzeile „Mockup“) in zwei Runden kommentiert und dann freigegeben. Geändert gegenüber dem freigegebenen Stand:

- **Tabs** heißen Angebote · Anbieter · Merkliste (Entscheidung c, E8, Test 14).
- **Gemerkte Anbieter** wandern von der Merkliste in den Tab „Anbieter“: Suchfeld ganz oben, darunter „Gemerkte Anbieter“ und „Weitere Anbieter“ ohne Dubletten, Herz in jeder Zeile (Entscheidung d, E3, Tests 4 und 9a). Damit entfallen
  - der Namens-Schnappschuss im Speicher, gespeichert werden nur IDs (E1),
  - `SavedProvider`, `toggleProvider`, `savedProviderRows` und die Anbieterzeile in `format.ts`,
  - der Merklisten-Abschnitt „Gemerkte Anbieter“ und der Leerzustand „nur Anbieter“ (E5a),
  - das Nicht-Ziel „Kein Herz in der Anbieterliste“ und der Eintrag dazu in `docs/ideas.md`.
- **Kopf der Merkliste** (Entscheidung e, E3a): Umschalter über die ganze Breite unter der Überschrift (`.view-toggle.full` statt `.view-toggle.three`, E4), eine Statuszeile „5 Angebote mit insgesamt 28 Terminen gemerkt“ und ein runder Export-Knopf nur mit Icon (E9, `exportLabel` statt `exportNote`). Der Hinweis „Kurse immer komplett“ entfällt. Umgesetzt in Etappe 2 bzw. die Filter-Varianten in Etappe 4.
- **Etappe 1** war vor dem Mockup-Feedback schon teilweise umgesetzt (Merkliste mit Anbieter-Abschnitt, uncommittet). Sie wird nach E1–E3 umgebaut, bevor sie gemergt wird.

### Review des Nachtrags (2026-10-08) – Urteil: Freigabe mit Änderungen → eingearbeitet

Unabhängiger `plan-reviewer`, nur der Nachtrag.

- **B1** „Kalender“ passt im Umschalter über die ganze Breite bei 320 px/200 % nicht. → Container-Query, einspaltig unter `19rem` wie `.seg3` (E4, E10, Test 15). Betrifft Etappe 3.
- **M1** Das Suchfeld im Start nimmt Tests ihr Signal „Chunk geladen“. → `listReady` (Region „Anbieter“) in `anbieter.spec.ts` und `anbieter-inhalt.spec.ts` (Etappe 1, Schritt 5).
- **M2** Nur gemerkte aktiv: Hinweis auf ausgeblendete fehlte. → Hinweis bei irgendeiner aktiven Zeile, Leerzustand über beiden Abschnitten (E3, E2E in 9a).
- **M3** Fokusregel ungenau, Remount-Gefahr, verdeckter Fokus. → nächstes Herz des Abschnitts in DOM-Reihenfolge, Abschnitte immer gerendert, `scroll-padding-bottom`; E2E per Tastatur (E3, 9a).
- **M4** Gates nicht nach CLAUDE.md. → je Etappe `pnpm verify`, gezielte Specs, `pnpm size`.
- **Minor**, alle übernommen: Live-Region `sr-only`; Suchfeld auch beim Laden; „Angebote“ mit `exact` und als Font-Probe; `architecture.md` ohne Schnappschuss; Wortlaute in Test 9 und E10; Terminzahl zählt kommende Termine; ADR 0020 und Vermerk in Plan 0026.
- **Simplicity**:
  - übernommen: eine Hilfe `loadIds`/`saveIds` in `preferences.ts`.
  - abgelehnt: Suchfeld im Chunk unter der Statuszeile lassen. Der Nutzer wollte es „ganz oben“ (Feedback 2), das Mockup zeigt es über der Statuszeile.
  - abgelehnt: Abschnitte bis zum nächsten Öffnen festhalten. Im Mockup wandert die Zeile sofort („steht jetzt oben“), und doppelt stünde sie sonst auch nicht; die Fokusregel ist mit M3 belastbar.

## Review (2026-10-08) – Urteil: freigabefähig nach Einarbeitung → eingearbeitet

Unabhängiger `plan-reviewer`. Alle Befunde sind übernommen.

**Blocker**
- **B1** Formprüfung mit `KEBAB_ID_PATTERN` in `preferences.ts` verletzt ADR 0010. → `preferences.ts` liefert die Rohform, `cleanSavedProviders` steht in `saved.ts` und wird in `useSavedProviders` aufgerufen. `MAX_PROVIDER_ID` zieht nach `ids.ts`. Test 6 ist auf `saved.test.ts` (Test 1) und `preferences.test.ts` (Test 6) aufgeteilt (E1).

**Major**
- **M1** `route.tab`-Weichen in `App.tsx` (`:248–249`, `:282`, `:358`). → Sie laufen über `section`, `views.map` gilt für beide Karten, mit Unit-Test (E4, Test 8).
- **M2** `.seg3` existiert schon für einen anderen Zweck, `.seg2` hat kein CSS, und der Daumen ist auf 50 % fest. → `--n` und `calc(100% / var(--n))`, eigene Klasse `.view-toggle.three` mit `nowrap` und Mindestbreite (E4, E10).
- **M3** Das offene Monatsraster schiebt die Liste unter den Falz. → `scrollIntoView({ block: "nearest" })` ohne `smooth`, Ansage der Zahl, E2E-Prüfung im Viewport (E5, Test 10).
- **M4** Die Auswahl-API war mehrdeutig. → Zustand `{ selection, monthOpen }` ist festgeschrieben. Die Pfeile laufen über `calendarNav`, `selectionNav` ist gestrichen (E5).
- **M5** Leerzustände fehlten; eine Karte nur mit Anbietern lud Kacheln. → Tabelle E5a, ohne `MapPanel` bei 0 Treffern, mit Wortlaut.
- **M6** Plan 0023 ist Vorbedingung für Etappe 3. → Abhängigkeiten, Schritt 0, Etappe 3 und Risiken angepasst.
- **M7** `endedToday` über `savedOffers` verliert heute beendete Termine. → `endedOnDay` über alle gemerkten Angebote plus Filter (E5, Test 8). Die E2E-Merkliste wird per `localStorage` vorbelegt.

**Minor**
- Zeilenangaben korrigiert (`use-offer-views.ts:151`, `:110–143`, `:168–178`, `ideas.md:61`). ADR 0019 steht in der Tabelle E12.
- Das Inventar ist ergänzt: `use-app-state.test.ts:328`, `route.test.ts`, `use-offer-views.test.ts`, `calendar.test.ts`/`agenda.test.ts`, `mobile-ux.spec.ts:466–490`, `scripts/font-fallback.ts:139`.
- `tabs.css` über `--n` (Z. 1, 13, 49, 187, 197) (E8).
- Typgrenze `Offer & { venue: ReachTarget }` für `applySavedFilter` (E6).
- WCAG 2.5.3: Der sichtbare Titeltext steht am Anfang des Namens, der Zusatz als `sr-only` (E5).
- `h3` „Gemerkte Anbieter“ bekommt `tabIndex={-1}` (E3).
- Statuszeile im Kalender mit `useRange: false`. „Zurücksetzen“ löscht auch den Zeitraum (E3, E6).
- In Etappe 2 ist „sonst gleich drei“ gestrichen.

**Simplicity** (alle übernommen)
- Kein Sheet `saved-range`: Die Schnellwahlen stehen als Chips „ab Nov./Dez./Jan.“ in der Filterzeile, die freie Datumseingabe gibt es nur auf der Startseite (E7).
- Die Geste „gewählten Tag nochmal antippen → Woche“ ist gestrichen, der Titelknopf bleibt (E5).
- Etappe 5 (N1) ist aus dem Plan genommen und steht als Eintrag in `docs/ideas.md` (E13).
- „Alle in den Kalender“ steht nur in der Darstellung Liste (E9).

Abgelehnt wurde nichts.

## Status

Abgeschlossen (2026-10-09): Etappen 1–4 und die Abschlussrunde sind umgesetzt. Die Restpunkte stehen in `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“; N5 ist entschieden: Die Überschreitung ist akzeptiert (ADR 0012). Freigegeben war er mit eingearbeitetem Review und den Nutzerentscheiden vom 2026-10-08. Der Nachtrag aus dem Mockup (Entscheidungen c–e) ist reviewt und eingearbeitet (Abschnitt „Review des Nachtrags“); kein Blocker offen.
