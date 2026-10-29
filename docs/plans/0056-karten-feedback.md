# Plan 0056 – Karten nach Nutzer-Feedback: näher am Startpunkt, Liste im Ausschnitt, weniger Text

Status: Review eingearbeitet
Datum: 2026-10-29

Bezug:
- Plan 0055 (Anbieterkarte, live seit 2b31b96), Plan 0005 (Karte), Plan 0025 (Merkliste mit Karte), Plan 0010 (Anbieterübersicht).
- ADR 0008 (Karte, Kamera-Regel, Hinweis unter der Karte), ADR 0038 (Anbieterkarte), ADR 0017 (gespeicherter Startpunkt), ADR 0028 (Datenschutztext).
- Neu: ADR 0039 (E6).

## Anlass

Der Nutzer hat am 2026-10-29 die live geschaltete Anbieterkarte geprüft. Er meldet Folgendes, wörtlich zusammengefasst:

1. **Zählung im Tab „Anbieter“:** „2 Anbieter ohne Kurse“, darunter aber 3 Zeilen.
   - Gemeint ist der Satz „2 weitere Anbieter haben gerade nichts Passendes.“ über 3 blassen Zeilen „Gerade keine Termine“.
   - Entscheidung per Rückfrage: **Ausgeblendete stehen als eigene blasse Zeile**, ohne Zählsatz.
2. **Fokusrahmen:** Der schwarze Rahmen um den Namen beim Öffnen eines Anbieters, auch an anderen Stellen. Das ist schon als Kleinänderung behoben (310f5d4, `[tabindex="-1"]:focus-visible`).
3. **Startzoom:** näher dran, etwa 2 km um den eigenen Standort. Entscheidung per Rückfrage: **„Doch 2 km um GPS-Standort“**, im Wissen, dass OpenFreeMap dann über die Kachelwahl grob den Standort sieht. Das braucht ein neues ADR.
4. **Quellenangabe:** Die OpenFreeMap-Angabe in der Karte soll standardmäßig eingeklappt sein.
5. **Hinweistext:** „Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät.“ unter der Karte soll weg, die Angabe steht hinter dem Info-Symbol.
6. **Gilt für alle Karten:** Punkte 3–5 gelten auch für die Karte in „Entdecken“ und, Nachtrag des Nutzers, für die Karte der Merkliste.
7. **Startpunkt-Knöpfe:** „Kartenmitte als Startpunkt“ und „Startpunkt wählen“ unter der Angebotskarte sollen weg.
8. **Liste im Ausschnitt:** Unter der Karte in „Entdecken“ (und der Merkliste) soll statt der Orts-Liste die normale Liste stehen, wie in der Listenansicht, aber auf den Kartenausschnitt gefiltert.
9. **Statuszeile:** „230 Angebote an 80 Orten · Wegzeit ab deinem Standort“ bricht hässlich um. Entscheidung per Rückfrage: **nur die Anzahl**.

Der Nutzer wünscht, Kleines zuerst umzusetzen. Punkt 2 ist live-fähig auf dem Branch. Punkt 1 ist mit 85 Zeilen keine Kleinänderung mehr und steht deshalb hier (S1, Code liegt schon im Arbeitsbaum).

## Befund

- **Ausgeblendete Anbieter:** `providerRows` (`src/domain/directory.ts`) zählt sie ohne Suchtext nur in `hiddenCount`, die Liste zeigt den Satz `hiddenProvidersText`. Auf der Anbieterkarte fehlen sie ganz (`providerPlaces`, Zustand nur `aktiv | ohne-termine`).
- **Kamera:**
  - `initialCamera(points, origin)` (`src/domain/camera.ts`) rahmt alle kommenden Orte und fährt nur bei einem Stadtteil heran (`DISTRICT_ZOOM` 13).
  - `providerCamera` rahmt alle Anbieter-Orte und ignoriert jeden Startpunkt (ADR 0038, Punkt 4).
  - `MapView` fährt bei einem Wechsel nur auf Stadtteile und nur auf der Angebotskarte (`easeTo`).
  - ADR 0008: Die Karte zentriert nie auf GPS oder Kartenmitte. E2E sichert das mit `tileLog` (`e2e/karte.spec.ts:553–575`, „keine Kacheln nach ‚Meinen Standort nutzen‘“).
- **Quellenangabe:** `attributionControl: {}` (`MapView.tsx`) zeigt sie ausgeschrieben (Plan 0024, Browser-Review m4). `ATTRIBUTION_INSET` (66 px) hält dafür unten Platz frei, in `START_PADDING` und `PROVIDER_PADDING`.
- **Hinweistext:**
  - Er steht in `karte/MapScreen.tsx` (Angebots- und Merklisten-Karte) und in `MapPanel.tsx` (`TILE_NOTE`, Anbieterkarte).
  - ADR 0008 schreibt ihn vor („Unter der Karte steht …“).
  - Der Datenschutztext im Impressum (`imprintPage()`) nennt OpenFreeMap unabhängig davon.
- **Werkzeugzeile:**
  - `karte/MapScreen.tsx` rendert `.map-tools` mit „Kartenmitte als Startpunkt“ (nur bei bereiter Karte) und „Startpunkt wählen“.
  - Dazu kommt das Fadenkreuz `.crosshair`.
  - `onMapCenter` führt über `App.tsx` zu `originApi.setMapCenter` (`use-app-state.ts`).
  - Der Startpunkt lässt sich weiter im Kind-Sheet wählen (Standort, Stadtteil).
  - „Kartenmitte“ gibt es nur über diesen Knopf.
- **Liste unter der Karte:**
  - `karte/MapScreen.tsx` zeigt `PlaceList`, also Orte statt Angebote.
  - Die Listenansicht nutzt `ListView` mit `views.page.groups` (nach Tag, Neu oder Wegzeit gruppiert, in Schritten).
  - Die Merkliste als Liste rendert `SavedView` mit `views.savedVisible`.
- **Statuszeilen:**
  - `listStatusParts` liefert „230 Angebote ab heute“ mit `rangePhrase`.
  - `mapStatusParts` liefert „… an 80 Orten“.
  - `providerStatusParts` liefert „69 Anbieter mit 356 Angeboten“.
  - Dazu kommt jeweils `reachSuffix` mit „· Wegzeit ab …“ bzw. „· Luftlinie ab … (Wegzeiten gerade nicht verfügbar)“.

## Ziel

- Alle drei Karten (Entdecken, Merkliste, Anbieter):
  - Sie starten mit einem Startpunkt etwa 2 km um ihn, sonst wie bisher über alle Orte.
  - Die Quellenangabe ist eingeklappt, und es gibt keinen Text unter der Karte.
- Unter der Angebotskarte steht die normale Angebotsliste, beschränkt auf den Kartenausschnitt. Das gilt in „Entdecken“ wie auf der Merkliste.
- Werkzeugzeile und Fadenkreuz entfallen.
- Statuszeilen zeigen nur die Anzahl.
- Ausgeblendete Anbieter stehen blass in Liste und Karte.

## Nicht-Ziele

- Startausschnitt „so, dass man etwa 10 Anbieter sieht“. Der Nutzer hat den Startpunkt gewählt.
- Ein neuer Weg, die Kartenmitte als Startpunkt zu setzen. Gespeicherte Startpunkte der Art `kartenmitte` bleiben lesbar (ADR 0017).
- Vollbild-Karte und kompakter Kopf im Querformat (`docs/ideas.md`).
- Statuszeile der Merkliste als Liste und Kalender („5 Angebote mit insgesamt 28 Terminen gemerkt“): Der Nutzer nannte nur Listen- und Kartentexte.

## Entscheidungen

### E1 – Ausgeblendete Anbieter als blasse Zeile (Punkt 1)

- `providerRows`:
  - `idle` enthält immer zuerst die ausgeblendeten Anbieter (kommende Angebote, keins passt zur Auswahl), dann die ohne Termine, jeweils nach Name.
  - `hiddenCount` entfällt, `hiddenProvidersText` auch.
- **Liste:** Die Zeile zeigt `idleLine`, also „n Angebote, keins passt zur Auswahl“. Unter den aktiven Zeilen stehen, sobald eine ausgeblendete Zeile da ist, die Auswege wie im Leerzustand (`NoOffers`): „Auch unpassende zeigen“, wenn das Alter ausblendet, und „Filter zurücksetzen“, wenn eine Kategorie wirkt (Review m4).
- Die Reihenfolge an einem Ort ist aktiv, ausgeblendet, ohne Termine, jeweils nach Name (`STATE_RANK`, Review M3), mit Unit-Test.
- **Karte:**
  - `ProviderAtPlace.state` bekommt `ausgeblendet`. `providerPlaces` liefert solche Anbieter mit und zeigt sie blass (`blass`, wenn keiner am Ort aktiv ist).
  - Im Orts-Sheet steht „Passt nicht zur Auswahl“.
- Die Invariante der Statuszeile bleibt: Gezählt werden nur aktive Anbieter.

### E2 – Statuszeile: nur die Anzahl (Punkt 9)

- **„Entdecken“, Liste:** „230 Angebote“. `rangePhrase` entfällt, der Zeitraum steht im Chip.
- **„Entdecken“, Karte:** „42 Angebote im Kartenausschnitt“, sobald der Ausschnitt etwas ausblendet (E5), sonst „230 Angebote“. „an 80 Orten“ entfällt.
- **Tab „Anbieter“:** „69 Anbieter“ bzw. „12 Anbieter im Kartenausschnitt“. „mit 356 Angeboten“ entfällt.
- **Startpunkt-Zusatz** (Review B1):
  - „· Wegzeit ab Gostenhof“ entfällt. Das ändert ADR 0019, Punkt 1, der den Hinweis in der Statuszeile vorschreibt und „ganz weglassen“ verworfen hatte. Abwägung in ADR 0039: Der Nutzer stuft den Umbruch als störender ein als den fehlenden Bezug. Der Startpunkt steht weiter im Kind-Sheet und, bei der Sortierung „Nächstgelegen“, in deren Untertitel. Die Minuten an den Kacheln heißen „Min.“ wie bisher.
  - Der Rückfall bleibt **sichtbar** und kurz, mit Grund: „· Luftlinie, außerhalb“ bzw. „· Luftlinie, Wegzeit fehlt“. Das hält ADR 0011, Punkt 9 (Grund sichtbar), in gekürzter Form. ADR 0039 nennt die neue Form.
- **Merklisten-Karte:** `savedMapStatusParts` („… an n Orten“, `SavedView.tsx`) wird ebenfalls nur die Zahl, im Ausschnitt-Fall „n gemerkte im Kartenausschnitt“ (Review m2).
- Die Ansage über `role="status"` bleibt, mit demselben kurzen Text.
- **Sortierung „Nächstgelegen“:** Der Satz `.sr-only` „Sortiert nach …“ bleibt.

### E3 – Quellenangabe eingeklappt, kein Hinweistext (Punkte 4, 5, 6)

- **Einklappen nach 5 s** (Review M2): Die OSMF-Richtlinie erlaubt das Einklappen nach einer Interaktion oder „automatically after five seconds“, nicht direkt beim Laden.
  - MapLibre klappt auf Karten ≤ 640 px schon heute nach der ersten Bewegung ein. `compact: true` ändert dort nichts.
  - Neu: 5 s nach `load` klappt `MapView` die Angabe einmal ein. Es entfernt die Klasse `maplibregl-compact-show` und das Attribut `open` am `<details>`. Das gilt auch auf breiten Karten (dafür `compact: true`) und nach einem Stilwechsel.
  - Der Nutzer wünschte „per Standard eingeklappt“. Die 5 s sind die rechtlich gedeckte Annäherung, das steht in ADR 0039 und im Bericht an den Nutzer.
- `ATTRIBUTION_INSET` bleibt. Beim Öffnen steht die Angabe noch ausgeschrieben, und das „i“ ist 44 px hoch (`map-overrides.css`).
- **Hinweistext:** Er entfällt in `MapScreen.tsx` und in `ProviderMapPanel` (`TILE_NOTE`). Der Datenschutztext im Impressum behält die Angabe zu OpenFreeMap und nennt künftig auch den Startausschnitt (E6).
- **Attribution:** ADR 0039 hält die 5 s mit Verweis auf die OSMF Attribution Guidelines fest.

### E4 – Werkzeugzeile und Fadenkreuz entfallen (Punkt 7)

- `.map-tools`, `.crosshair`, `onMapCenter` und `onPickOrigin` entfallen aus `MapScreenProps`. `MapView.onReady` liefert keine Kartenmitte mehr.
- `originApi.setMapCenter` bleibt nur, wenn ihn sonst etwas braucht. Sonst entfällt er samt Test. Laden, Anzeigen und Speichern von `kartenmitte` bleiben (ADR 0017).
- **E2E:** Die Fälle „Kartenmitte als Startpunkt“ in `karte.spec.ts` und `startpunkt.spec.ts` entfallen bzw. werden auf das Kind-Sheet umgestellt.
- **Texte im Fehlerfall** (`MapScreen.tsx`): „Die Orte stehen unten in der Liste“ wird „Alle Angebote stehen unten in der Liste“, passend zu E5 (Review m3).
- Das ändert ADR 0008, Punkt „Startpunkt ohne GPS“ (Kartenmitte mit Fadenkreuz), und ADR 0005 (Weg ohne GPS: „auf die Karte tippen“ bzw. Kartenmitte). Ohne GPS bleibt der Stadtteil. Beides steht in ADR 0039 (Review B2).

### E5 – Angebotsliste im Kartenausschnitt (Punkt 8)

- **Domäne:**
  - Neu ist `offersInBounds(offers, bounds)` in `src/domain/places.ts` (Karten-Chunk), rein und mit Test. Sie liefert die `placeKey`s im Ausschnitt.
  - Der Karten-Chunk meldet `onInView({ inView: Set<placeKey>, known: Set<placeKey> } | undefined)`, wie die Anbieterkarte, aber nach Orten.
- **„Entdecken“, Karte** (Review M1):
  - `useOfferViews` bekommt einen optionalen Ausschnitt (`mapView`) und liefert dafür **eigene** Felder: `inView` (Angebote im Ausschnitt), `inViewPage` (Gruppen in Schritten) und die Zahl.
  - Diese Felder gelten nur bei `route.tab === "karte"` bzw. `"merkliste-karte"`. `visible` bleibt ungefiltert, denn daran hängen die Marker der Karte, `resultCount` des Filter-Sheets, `finish.count` des Onboardings und `placeCount`. Sonst verlöre die Karte beim Verschieben ihre Marker.
  - Beim Tabwechsel verwirft `App` den Ausschnitt (Unmount meldet `undefined`).
  - Ein Unit-Test belegt: Karte und Filter-Sheet bleiben ungefiltert.
  - Unter der Karte rendert `App` dann `ListView` mit diesen Gruppen, denselben Karten-Kacheln wie in der Listenansicht, mit „Mehr laden“.
  - `PlaceList` entfällt. Das Orts-Sheet beim Tipp auf einen Ort bleibt.
- **Merkliste, Karte:** Dasselbe mit `savedVisible`. Darunter steht die Liste der Merkliste (`SavedView`-Liste), gefiltert auf den Ausschnitt.
- **Leerer Ausschnitt:** „Im Kartenausschnitt gibt es gerade nichts.“ mit „Alle zeigen“.
- **Statuszeile im Ausschnitt-Fall:** „42 Angebote im Kartenausschnitt“ mit „Alle zeigen“, wie im Tab „Anbieter“ (E2).
- **Ohne Karte** (WebGL, Kacheln, Chunk): `onInView(undefined)`, die Liste zeigt alles.
- **Gemeinsam statt doppelt:**
  - `ProviderView` (`provider-count.ts`) wird zu einem allgemeinen `MapView`-Ausschnitt mit Schlüsseln (`inView`, `known`) in einem kleinen Start-Modul `src/domain/map-view.ts`.
  - `isOutside` und `viewNarrows` ziehen mit um.
  - Der Anbieter-Fall nutzt weiter Anbieter-IDs, der Angebots-Fall `placeKey`s.

### E6 – Startausschnitt um den Startpunkt, ADR 0039 (Punkt 3)

- **Neue Kamera-Regel** für alle drei Karten:
  - Mit Startpunkt (Standort, Stadtteil, gespeicherte Kartenmitte) startet die Karte auf dem Rahmen ±2 km um den Punkt, `fitBounds` ohne Animation.
  - Ohne Startpunkt bleibt es beim Rahmen über alle Orte.
- **Domäne:** `initialCamera(points, origin)` und `providerCamera(geometry, origin)` geben `{ bounds }` um den Startpunkt zurück. Neu ist der Helfer `aroundPoint(point, km)` in `camera.ts`, mit Test (Breite und Länge, cos φ).
- **Wechsel des Startpunkts bei offener Karte:** Die Karte fährt auf den neuen Rahmen (`fitBounds`, bei reduzierter Bewegung springend). Das gilt jetzt auf allen Karten und für jede Art von Startpunkt. Damit entfällt der Sonderfall „Anbieterkarte fährt nie“ (ADR 0038, Punkt 4).
- **„Alle zeigen“** setzt auf den Rahmen über alle Orte, nicht auf den Startpunkt. Sonst gäbe es keinen Weg zur ganzen Liste.
- **Leerer Startrahmen** (Review M4):
  - Liegt im Rahmen ±2 km kein Ort der jeweiligen Karte, startet sie auf dem Rahmen über alle Orte, wie ohne Startpunkt. Das passiert am Stadtrand, mit Filtern oder auf der Merkliste.
  - Grundlage sind dieselben öffentlichen Daten wie heute: alle kommenden Orte bzw. alle Anbieter-Orte, nicht die gefilterten. So hängt der Rückfall nicht am Alter.
  - Unit-Test in `camera.test.ts`, E2E mit einem Fixture-Startpunkt ohne Orte im Umkreis.
  - Das stille Schrumpfen der Liste, das ADR 0038 (Kontext, Punkt 4) abgelehnt hatte, nimmt ADR 0039 bewusst in Kauf: Die Statuszeile sagt „im Kartenausschnitt“, und „Alle zeigen“ steht daneben.
- **`lastCamera`** (Angebotskarte) bleibt für die Sitzung. Sie speichert den Startpunkt mit, als Quelle plus Punkt bzw. `districtId` (Review M6). Weicht der Startpunkt beim nächsten Öffnen ab, gilt der neue Startrahmen statt `lastCamera`. Dazu ein Unit- oder E2E-Fall „Startpunkt bei geschlossener Karte gewechselt“.
- **ADR 0039 „Karten starten am Startpunkt“** ändert bzw. ersetzt (vollständige Liste, Review B2):
  - **ADR 0008:**
    - Kamera-Regel
    - Punkt „Nur in der Kartenansicht“ (Hinweistext unter der Karte)
    - Attribution ausgeschrieben
    - Punkt „Startpunkt ohne GPS: Kartenmitte als Startpunkt“
    - Tests („kein Kachel-Request nach dem Setzen eines Startpunkts“)
  - **ADR 0038:** Punkt 2 (Hinweistext), Punkt 3 (Startausschnitt), Punkt 4 (kein Stadtteil-Zoom), Kontext zum stillen Schrumpfen.
  - **ADR 0017:** Folgen „Die Karte startet aber im üblichen Ausschnitt“ und „Kamera-Regel bleibt unverändert“.
  - **ADR 0019:** Punkt 1 (Hinweis in der Statuszeile), ersetzt.
  - **ADR 0011, Punkt 9:** Grund der Luftlinie sichtbar, in gekürzter Form (E2).
  - **ADR 0005:** Weg ohne GPS über die Kartenmitte entfällt, der Stadtteil bleibt.
  - Statuszeilen der genannten ADRs bekommen „geändert durch ADR 0039“.
  - **Was OpenFreeMap jetzt sieht:** die Kachelkoordinaten rund um den Startpunkt. Bei ±2 km und Zoom ≈ 13–14 ist das eine Gegend von wenigen Quadratkilometern. Der Standort ist in `src/data` schon auf ≈ 100 m gerundet (`coarsen`).
  - **Was gleich bleibt:** Es gibt keinen Querystring und keinen Startpunkt in einem Request. Die Wegzeit-Requests sind weiter für alle gleich.
  - **Nutzerentscheid** vom 2026-10-29, wörtlich: „Doch 2 km um GPS-Standort“.
- **`docs/architecture.md` anpassen:**
  - `:134`, Invariante Privatsphäre: Die Karte zentriert nie auf Standort oder Kartenmitte. Startausschnitt über alle Orte, Anbieterkarte fährt nie.
  - `:164`, Mobile-UX: „jede Funktion hat einen Weg ohne Karte (Orts-Liste, Statuszeile, Startpunkt wählen)“ wird „Liste unter der Karte, Statuszeile, Startpunkt im Kind-Sheet“.
  - `:68–76`: `PlaceList` entfällt, die Werkzeugzeile auch.
  - Invariante Startpunkt: „Bei offener Karte lädt die Wahl … keine Kachel“.
  - Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt, außer den Kartenkacheln“: Diese Ausnahme gilt jetzt für jeden Startpunkt, nicht nur für Stadtteile.
- **Impressum:** Der Datenschutztext in `imprintPage()` sagt künftig: „Hast du einen Startpunkt gewählt, zeigt die Karte zuerst die Gegend darum; OpenFreeMap sieht dann, welchen Kartenausschnitt dein Browser lädt.“

### E7 – Budgets

- **Start-JS:**
  - Fällt weg: `TILE_NOTE`, Werkzeug-Props, `rangePhrase` in der Statuszeile, wenn sie sonst niemand nutzt.
  - Kommt dazu: `map-view.ts`, `ListView` unter der Karte (schon im Start) und der Ausschnitt-Filter in `useOfferViews`.
  - Erwartet: ±0,5 kB.
- **Karte JS:** `offersInBounds` und `aroundPoint`, ≈ +0,2 kB.
- Gemessen wird mit `pnpm size`, die Zeile kommt in die Delta-Tabelle von ADR 0012.

### E8 – Tests

- **Unit:**
  - `directory.test.ts` (E1, schon angepasst)
  - `provider-places.test.ts` (Zustand `ausgeblendet`, schon angepasst)
  - `camera.test.ts` (`aroundPoint`, `initialCamera` mit jedem Startpunkt)
  - `places.test.ts` (`offersInBounds`)
  - `map-view.test.ts`
  - `use-offer-views.test.ts` (Ausschnitt filtert Liste und Zahl)
  - `format.test.ts` (Statustexte nur mit Zahl)
- **E2E:**
  - `karte.spec.ts`: Startausschnitt mit Startpunkt ±2 km, ohne Startpunkt alle Orte. Die Liste unter der Karte zeigt Kacheln im Ausschnitt, „Alle zeigen“, keine Werkzeugzeile, Quellenangabe eingeklappt („i“ sichtbar, Text nicht), kein Hinweistext. Die Fälle zur Kartenmitte entfallen. Die Kamera-Regel-Fälle (`tileLog` nach Standort) drehen sich um: Nach der Wahl fährt die Karte, und Kacheln dürfen laden.
  - `startpunkt.spec.ts`: Die Request-Zählung ab der Wahl rechnet Kacheln heraus (nur `tiles.openfreemap.org`, gemockt). Die Fälle zur Kartenmitte entfallen.
  - `anbieter-karte.spec.ts`: Fall 8 (Kamera-Regel) dreht sich, mit Stadtteil startet die Karte dort. Fall 11 und der Privatsphäre-Fall in `anbieter.spec.ts` („mit offenem Tab einen Startpunkt wählen“) zählen Kacheln nicht mehr mit. Der Hinweistext entfällt in Fall 1.
  - `merkliste-*.spec.ts` und `saved.spec.ts`: Die Karte der Merkliste zeigt die Merklisten-Liste im Ausschnitt.
  - `mobile-ux.spec.ts`: Die Ansichten `karte`, `orts-sheet`, `merkliste-karte` und `anbieter` werden neu bewertet, dazu kommt eine Ansicht „Karte mit Liste im Ausschnitt“.
  - `layout.spec.ts`: Die Statuszeile ist bei 320 px einzeilig.
  - `smoke.spec.ts`: Wortlaut der Statuszeile.

## Schritte

Jeder Schritt endet mit grünem `pnpm verify`, der lokalen E2E-Pflicht nach CLAUDE.md (`pnpm e2e:local --affected`, bei `share-pages.ts` zusätzlich `--smoke`) und einem Commit. Die ADR-Änderungen gehen in den Schritt, der die Regel zuerst bricht (Review M5).

- **S1 – E1** (Code im Arbeitsbaum, Review M3 und m4 eingearbeitet): Unit-Tests und E2E-Anpassungen sind gemacht und lokal grün. Danach Commit.
- **S2 – E2 mit ADR 0039, Teil Statuszeile:**
  - `format.ts` test-first, Statuszeile in `App.tsx` und `SavedView.tsx`.
  - ADR 0039 entsteht hier, mit den Punkten zu ADR 0019 und ADR 0011, Punkt 9. Die folgenden Schritte ergänzen es.
  - Betroffene Specs per `grep -l "Angeboten\|an .* Orten\|Wegzeit ab" e2e/`.
- **S3 – E3 und E4:** Quellenangabe nach 5 s, Hinweistext, Werkzeugzeile, Fadenkreuz. ADR 0039 ergänzt ADR 0008 (Hinweis, Attribution, Kartenmitte) und ADR 0005. Specs `karte.spec.ts` und `startpunkt.spec.ts`.
- **S4 – E5:** `map-view.ts`, `offersInBounds`, `useOfferViews` mit eigenen Feldern, Liste unter der Angebots- und der Merklisten-Karte.
- **S5 – E6:**
  - `aroundPoint`, Startrahmen mit Rückfall, `lastCamera` mit Startpunkt, `MapView` fährt bei jedem neuen Startpunkt.
  - ADR 0039 ergänzt die Kamera-Regel (ADR 0008, 0017, 0038), dazu `architecture.md` und das Impressum. Wegen `share-pages.ts` lokal auch `--smoke`.
  - E2E zur Kamera-Regel umdrehen.
- **S6:** `pnpm size`, `/arch-review`, `/browser-review` mit voller Checkliste. Lokal `pnpm e2e:local --affected --smoke` sowie `karte`, `anbieter-karte`, `startpunkt` und `mobile-ux`.
- **S7:** Branch `karten-feedback`, CI, Fast-Forward nach `main`, `/browser-review live`, archivieren.

S1 und S2 sind ohne die übrigen auslieferbar.

## Risiken

- **Privatsphäre:**
  - OpenFreeMap sieht künftig die Gegend um den gewählten Startpunkt. Der Nutzer hat das bewusst entschieden.
  - Die IP-Adresse plus Kachelkoordinaten verraten grob den Wohnort. Das steht in ADR 0039 und im Impressum.
- **Attribution:** Eingeklappt ist sie leichter zu übersehen. Bei einer Beschwerde wäre die Folge, sie wieder auszuschreiben (ADR 0039).
- **Leistung:** `ListView` unter der Karte rendert Kacheln statt Orte. Bei vielen Angeboten im Ausschnitt greift dasselbe Schrittladen wie in der Liste.
- **Verwechslung:** Wer die Karte verschiebt, sieht weniger Angebote. Das sagen die Statuszeile („im Kartenausschnitt“) und „Alle zeigen“, wie im Tab „Anbieter“.
- **Kartenmitte als Startpunkt** fällt als Funktion weg. Ohne GPS bleibt der Stadtteil (ADR 0005).

## Offen

- Keine offenen Nutzerentscheidungen (Rückfrage vom 2026-10-29, Anlass).

## Review (2026-10-29) – Verdict: Überarbeiten

Reviewer: Subagent `plan-reviewer`, ohne Chat-Kontext. Alle Punkte übernommen, keiner abgelehnt.

- **B1, Statuszeile gegen ADR 0019 und ADR 0011, Punkt 9:** übernommen. ADR 0039 ersetzt ADR 0019, Punkt 1, mit Abwägung. Der Grund der Luftlinie bleibt sichtbar und kurz (E2).
- **B2, unvollständige Liste für ADR 0039:** übernommen, mit vollständiger Liste in E6 und den Stellen in `architecture.md`.
- **M1, Rückkopplung über `visible`:** übernommen. Eigene Felder für den Ausschnitt, `visible` bleibt ungefiltert, dazu ein Test (E5).
- **M2, OSMF und Padding:** übernommen. Einklappen nach 5 s, `ATTRIBUTION_INSET` bleibt (E3).
- **M3, Komparator:** übernommen und im Code behoben (`STATE_RANK`), mit Unit-Test.
- **M4, leerer Startrahmen:** übernommen. Rückfall auf alle Orte, ADR 0039 begründet das Schrumpfen (E6).
- **M5, Reihenfolge der ADR-Änderungen:** übernommen. ADR 0039 entsteht in S2 und wächst je Schritt.
- **M6, Startpunkt bei geschlossener Karte:** übernommen. `lastCamera` speichert den Startpunkt mit (E6).
- **m1–m4:** übernommen.
  - m1: Gates je Schritt, `--smoke` statt `PW_SUITE`
  - m2: `savedMapStatusParts`
  - m3: veraltete Kommentare und Texte, Code-Teil schon behoben
  - m4: „Auch unpassende zeigen“ neben „Filter zurücksetzen“, im Code behoben
