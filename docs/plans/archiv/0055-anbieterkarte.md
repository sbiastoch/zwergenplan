# Plan 0055 – Karte im Tab „Anbieter“

Status: abgeschlossen, live seit 2b31b96 (2026-10-29)
Datum: 2026-10-29

Hinweis zur Nummer: Entworfen als Plan 0054 mit ADR 0037. Beide Nummern hat parallel „Abos mit Glocke“ belegt (live seit dc7498d), daher Plan 0055 und ADR 0038. Zeilenangaben zu `App.tsx`, `ProviderScreen.tsx` und `ProviderSheet.tsx` stammen vom Stand vor der Glocke und können verschoben sein.

Bezug:
- Mockups `docs/design/anbieter-karte/project/` (Design-Canvas). Gewählt ist **C** (`C-Split.dc.html`), das Orts-Sheet folgt `A2-Ort.dc.html`. Varianten A, B und D sind verworfen.
- ADR 0008 (Karte, OpenFreeMap, Kamera-Regel), ADR 0012 (Budgets), ADR 0017 (Startpunkt). Neu: ADR 0038 (dieser Plan, E7).
- Plan 0005 (Karte, Ladekette), Plan 0010 (Anbieterübersicht, Nicht-Ziel „Karte der Anbieter“), Plan 0019 (Nicht-Ziel `geo` in `anbieter.json`), Plan 0025 (gemerkte Anbieter), Plan 0042 (Budget `anbieter.json`).
- `docs/architecture.md` (Karte :68–76, Anbieterübersicht :82–86, Invarianten Privatsphäre und Startpunkt, Mobile-UX-Gates).

## Anlass

Der Nutzer wünscht eine Kartenansicht der Anbieter. Er hat am 2026-10-29 sechs Mockups gesehen und so entschieden:

1. Variante C: Eine kompakte Karte steht oben im Tab, darunter die bekannte Anbieterliste, eingeschränkt auf den Kartenausschnitt.
2. Keine Mini-Karte im Anbieter-Sheet (D).
3. „Kostenlos“ und ähnliche Filter ergeben im Tab „Anbieter“ keinen Sinn. Auf Nachfrage: Es wirken nur Kategorie, Alter, Suche und Kartenausschnitt.
4. Die Karte lädt mit dem Tab, ohne eigenen Tipp. Das weicht von ADR 0008 ab, daher ADR 0038.
5. Anbieter ohne kommende Termine stehen blass auf der Karte.

## Befund

- Der Katalog hat 82 Anbieter mit 121 Orten, jeder Ort mit `geo`. Es gibt 110 verschiedene Koordinaten, 11 davon teilen sich mehrere Orte (Stand 2026-10-29).
- **`anbieter.json` ohne `geo`:**
  - `public/data/anbieter.json` entsteht in `scripts/build-data.ts:67–72` über `toProviderDirectory` (`src/domain/site-data.ts:103–122`).
  - Ein Ort trägt nur `{name, address, district?}`, kein `geo`, keine Orts-ID.
  - Die Datei ist kein Zod-Typ, sondern das TS-Interface `SiteProvider`/`ProviderDirectoryData`. `src/data/providers.ts` lädt sie per Cast, und sie gehört nicht zum Schema-Export.
- **Größe von `anbieter.json`:** heute 7,68 kB gzip, mit `geo` je Ort 8,92 kB (+1,24 kB). Das Budget liegt bei 15 kB (`.size-limit.json`).
- **Kommende Angebote haben schon Koordinaten:** `SiteOffer.venue.geo`.
  - Orte bündelt `placeKey(geo)` (`src/domain/place-key.ts`) nach Koordinate.
  - Katalog-Ort und Angebots-Ort kommen aus derselben Quelle, ihre Schlüssel stimmen also überein.
- **Karte heute:**
  - Ladekette `MapPanel.tsx` → `karte/MapScreen.tsx` → `map/MapView.tsx`.
  - Marker in Kategorie-Farbe, Badge „Angebote > 1“, Cluster mit Summe `angebote` (`map/layers.ts`, `map/geojson.ts`).
  - Es gibt keinen Rückruf für den Kartenausschnitt.
  - `lastCamera` liegt auf Modulebene (`MapView.tsx:59`).
- **Regeln, die zu ändern sind:**
  - `map-entry-only`: Nur `karte/MapScreen.tsx` darf `map/` importieren.
  - `karte-ui-entry-only`: Nur `MapPanel.tsx` darf `karte/` importieren.
  - `lazy-domain-apart`: `ui/anbieter/` und `directory.ts` dürfen weder `places.ts` noch `camera.ts` importieren.
  - `LAZY_LOADERS` in `scripts/check-architecture.ts`.
- **Was heute auf den Tab „Anbieter“ wirkt:**
  - Sticker (Kategorie) und die Zeile `QuickFilters` (`Chrome.tsx:67–120`): Knopf „Filter“ sowie Kostenlos, Ohne Anmeldung, Kurse, Regelmäßig, Einmalig.
  - Über das gemeinsame `visible` (`use-offer-views.ts:159–166`) wirken alle Filterdimensionen, auch Wegzeit-Grenze und Zeitraum, dazu das Alter.
- **E2E:**
  - `e2e/fixtures.ts` verbietet jeden Kachel-Request, solange ein Test nicht `tiles: "mock"` setzt (`thirdPartyGuard`, `tileMock` nur mit `.map-box` im DOM).
  - Jede Spec, die den Tab „Anbieter“ öffnet, braucht künftig `tiles: "mock"` oder einen Mock ohne Karte (E8).

## Ziel

Im Tab „Anbieter“ stehen von oben nach unten (Mockup C):

1. Kategorie-Sticker
2. Suche
3. Karte, 250 px hoch
4. Hinweis zur Karte
5. Statuszeile
6. Anbieterliste

Die Liste zeigt die Anbieter, die im Kartenausschnitt einen Ort haben. Ohne Karte (kein WebGL, Kachelfehler, offline, Chunk-Fehler) zeigt sie alle, wie heute.

## Nicht-Ziele

- Mini-Karte im Anbieter-Sheet (Mockup D, verworfen).
- Knopf „Karte groß“ bzw. Vollbild aus Mockup C. Er kommt nach `docs/ideas.md`.
- Wegzeit je Katalog-Ort (`docs/ideas.md:45`). Die Statuszeile und die Sortierung nach Nähe bleiben wie heute an kommenden Angeboten (Plan 0009, E11).
- Ein Umschalter „Liste | Karte“ im Tab. Die Karte steht immer oben.
- Änderungen an „Entdecken“, an der Merkliste und an der Angebotskarte über die gemeinsame Verallgemeinerung von `MapView` hinaus (E5).
- `src/domain/schema.ts` und `schema/*.json`. `anbieter.json` ist kein Teil des Datenvertrags-Exports, `geo` kommt aus dem schon validierten Katalog.

## Entscheidungen

### E1 – `geo` je Ort in `anbieter.json`

- `SiteProvider.venues[]` bekommt `geo: GeoPoint`, `toProviderDirectory` übernimmt `venue.geo`. Weitere Felder kommen nicht dazu: keine Orts-ID, kein `hint`.
- **Lesen bleibt tolerant:** Ein offener Tab mit neuem Code kann noch ein altes `anbieter.json` aus dem Cache des Service Workers lesen. Der Typ hat `geo` deshalb als Pflichtfeld, `providerPlaces` (E2) überspringt aber Orte ohne gültiges `geo`, statt zu werfen. Die Prüfung `isGeoPoint(x): x is GeoPoint` (endliche Zahlen `lat`/`lon`) kommt neu nach `src/domain/geo.ts`, mit Unit-Test (Review m2).
- **Budget:** Die 15 kB bleiben. Gemessen wird nach dem Build, erwartet sind etwa 9 kB.
  - Düsseldorf (Plan 0039/0042) hatte das Budget schon ohne `geo` als „knapp“ hochgerechnet (13–18 kB). Mit `geo` wächst die Datei um etwa 16 %.
  - Das ist ein Risiko für Plan 0042, nicht für diesen Plan. Es steht unter „Risiken“ und kommt als Hinweis nach `docs/plans/0042-duesseldorf-katalog-fuellen.md`.

### E2 – Domäne `src/domain/provider-places.ts` (neu, rein)

```ts
export interface ProviderAtPlace { id: string; name: string; state: "aktiv" | "ohne-termine" }
export interface ProviderPlace { key: string; geo: GeoPoint; name: string; district?: string; providers: ProviderAtPlace[] }
export interface Bounds { west: number; south: number; east: number; north: number }

/** Geometrie (Review 2, B1): alle Orte aller Anbieter (Katalog + Rückfall), ohne Filter und Alter */
export interface ProviderGeometry { points: { id: string; key: string; geo: GeoPoint }[] }
export function providerGeometry(input: {
  providers: readonly SiteProvider[];
  upcoming: readonly SiteOffer[];  // kommende Angebote ohne Filter (wie ProviderScreen), nur für Rückfall-Orte
}): ProviderGeometry;

/** IDs der Anbieter mit mindestens einem Ort im Ausschnitt */
export function providersInBounds(geometry: ProviderGeometry, bounds: Bounds): Set<string>;

/** IDs der Anbieter mit mindestens einem bekannten Ort (können als „außerhalb“ gelten) */
export function providersWithPlace(geometry: ProviderGeometry): Set<string>;

/** Startausschnitt: Rahmen über alle Orte aller Anbieter, unabhängig von Filtern, Alter, Suche, Startpunkt */
export function providerCamera(geometry: ProviderGeometry): StartCamera;

/** Darstellung: Marker der Anbieterkarte, Katalog-Orte nach placeKey gebündelt, Zustand nach `visible` */
export function providerPlaces(input: {
  providers: readonly SiteProvider[];
  upcoming: readonly SiteOffer[];
  visible: readonly SiteOffer[];   // nach Kategorie und Alter (E3)
}): ProviderPlace[];
```

- **Geometrie und Darstellung sind getrennt** (Review 2, B1):
  - `providerCamera`, `providersInBounds` und `providersWithPlace` hängen nur an `providerGeometry`, also an Katalog und kommenden Angeboten, nie an Filter, Alter oder Suche. Der Startausschnitt und damit die Kachel-Requests bleiben so unabhängig vom Alter (ADR 0008, Zeile 66).
  - Auch ausgeblendete und blasse Anbieter stehen in `known` und werden nach dem Ausschnitt gefiltert. Das betrifft `hiddenCount` sowie blasse und gemerkte Zeilen.
  - Weil `inView` nur an Geometrie und Kamera hängt, bleibt es beim Wechsel eines Stickers gültig; ein neues `moveend` ist nicht nötig.
  - `providerPlaces(…visible)` liefert nur Marker und Blässe.
  - Unit-Tests: Die Kamera ist bei verschiedenem `visible` identisch. Ein ausgeblendeter Anbieter außerhalb des Ausschnitts zählt nicht in `hiddenCount`.
- **`providerCamera`** ruft `initialCamera(points, undefined)` (`camera.ts:24–37`) auf, ein neuer Helfer ist nicht nötig (Review 2, m7).

- Orte eines Anbieters (Review B1): die Katalog-Orte aus `anbieter.json`; für einen Anbieter **ohne Katalog-Eintrag** (Rückfall-Zeilen aus `directory.ts:46–59`, `fallbackEntry`) die Orte seiner kommenden Angebote (`venue.geo`, `venue.name`, `venue.district`). So steht jeder Anbieter, den die Liste zeigt, auch auf der Karte, sobald irgendein Ort bekannt ist.
- „Im Ausschnitt“ für die Liste (E4): Ein Anbieter fällt nur heraus, wenn er mindestens einen bekannten Ort hat (`providersWithPlace`) und keiner davon im Ausschnitt liegt. Ein Anbieter ganz ohne bekannten Ort gilt nie als außerhalb. Der Karten-Chunk meldet dafür `onInView({ inView, known })` (beide Sets); `directory.ts` und `provider-count.ts` prüfen `!known.has(id) || inView.has(id)`.

- **Zustand je Anbieter** (wie `directory.ts`):
  - `aktiv`: Er hat ein Angebot in `visible`.
  - `ohne-termine`: Er hat kein Angebot in `upcoming`.
  - Hat er kommende Angebote, aber keins in `visible` (ausgeblendet durch Kategorie oder Alter), steht er **nicht** auf der Karte. Das entspricht der Liste, die solche Anbieter nur als Hinweis zählt.
- **Ein Ort** erscheint, wenn mindestens ein Anbieter dort `aktiv` oder `ohne-termine` ist. Blass ist er, wenn keiner dort `aktiv` ist. Seine Zahl ist die Anzahl der Anbieter, die dort erscheinen.
- **Reihenfolge:**
  - Anbieter an einem Ort stehen erst `aktiv`, dann `ohne-termine`, jeweils nach Name (`de`).
  - Orte sortiert nach `key`, wie `placesToFeatures`.
  - `name` und `district` kommen vom ersten Katalog-Ort in Namensreihenfolge.
- **`providerCamera`** liefert `StartCamera` (`camera.ts:16`) und rahmt **alle** Orte der Anbieterkarte, auch die blassen, nicht nur kommende. ADR 0038 passt dafür den Wortlaut „über alle kommenden Orte“ in ADR 0008 und `architecture.md:134` an (Review m5). Die Kamera-Regel gilt: nie auf Standort oder Kartenmitte; auf der Anbieterkarte auch kein Stadtteil-Zoom (E4, Review M3).
- **Wer das Modul importiert:** nur der Karten-Chunk (`karte/`, E5). `ui/anbieter/` und `directory.ts` importieren es nicht (`lazy-domain-apart`, die Regel bekommt `provider-places.ts` dazu). Die Sets aus `onInView` sind einfache `Set<string>`, der Anbieter-Chunk braucht dafür keinen Import.

### E3 – Filter im Tab „Anbieter“: nur Kategorie und Alter

- **Neu in `src/domain/filter.ts`:** `providerFilter(f: FilterState): FilterState`, also `{ ...EMPTY_FILTER, categories: f.categories }`. Ohne `reachLimit` und ohne `range`.
- **`useOfferViews`** liefert zusätzlich `providerVisible`:
  - `applyFilters(offers, providerFilter(route.filter), { now })`, dann `ageVisibility` wie für `visible`.
  - Die Merkliste ist nicht betroffen.
- **App.tsx im Tab „Anbieter“** nutzt `providerVisible` statt `visible` für:
  - die Statuszeile (`countProviders`)
  - `ProviderPanel.visible`
  - `ProviderSheet.visible` (Hinweis „Alle Angebote, auch die außerhalb deiner Auswahl.“)
  - die Anbieterkarte
- **Filterzeile:** `QuickFilters` (Knopf „Filter“ und Chips) entfällt im Tab „Anbieter“, `section !== "merkliste"` wird zu `section === "entdecken"`.
  - „Filter zurücksetzen“ im Leerzustand des Tabs zählt nur Kategorien: `activeFilterCount(providerFilter(route.filter))`. Es setzt auch nur die Kategorien zurück. Andere Filter in der URL bleiben, sie gelten weiter in „Entdecken“.
  - Das Filter-Sheet ist aus dem Tab nicht mehr erreichbar. `filterButton` als Fokus-Rückweg wird dort nicht gebraucht.
- **Die URL** behält alle Filter. Ein Wechsel nach „Entdecken“ zeigt sie unverändert.
- **Wegzeit:** Die Grenze (`wegzeit=`) wirkt im Tab nicht mehr. Die Wegzeit selbst (`reachOf`, Sortierung nach Nähe, Zusatz in der Statuszeile) bleibt.
- **Reste von Grenze und Zeitraum** im Tab entfernen (Review M2):
  - `hint`/`LimitAction` (`App.tsx:347, 508–514`) und `listPending` (`App.tsx:351, 472`) gelten nur noch für `section === "entdecken"`.
  - `useOfferViews` liefert zusätzlich `providerUnfitCount` (Altersprüfung ohne `range`, auf Basis von `providerFilter`). `ageEscape` und der Altershinweis (`App.tsx:515–519`) nutzen im Tab diesen Wert statt `unfitCount` (`App.tsx:192, 371`; Review 2, m5).
  - Test: `use-offer-views.test.ts` und ein E2E-Fall `?wegzeit=30&ansicht=anbieter` mit gespeichertem Startpunkt (Statuszeile sichtbar, kein Grenz-Hinweis).

### E4 – Oberfläche (Mockup C)

- **Reihenfolge in `App.tsx`** für `route.tab === "anbieter"`:
  1. `Stickers`
  2. `ProviderSearch`
  3. `ProviderMapPanel` (E5)
  4. Hinweis „Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät.“ (ADR 0008, wörtlich wie in `MapScreen.tsx:110`)
  5. Statuszeile
  6. `ProviderPanel`
- **Karte:** Rahmen und Stil wie die Angebotskarte (`map-box`), Zoom-Knöpfe, Attribution.
  - Höhe `clamp(160px, 40svh, 250px)`, damit quer und auf kurzen Viewports Statuszeile und Liste sichtbar bleiben (Review M5).
  - Keine Werkzeugzeile: „Kartenmitte als Startpunkt“ gibt es hier nicht, der Startpunkt wird weiter über das Kind-Sheet gewählt.
- **Startpunkt auf der Anbieterkarte** (Review M3): Er wird nur als lokaler Layer gezeichnet, wie heute. Bei einem Stadtteil fährt die Karte **nicht** dorthin (`MapView` ohne `easeTo` für `kind: "anbieter"`, `MapView.tsx:252–254`), sonst filterte eine Wahl im Kind-Sheet still die Liste. Folge: Ab der Wahl eines Startpunkts lädt die Anbieterkarte keine Kachel.
- **Marker:**
  - Abgerundete Kachel in `--surface` des Themas mit Laden-Symbol und Rand in `--ink` (wie das Tab-Symbol „Anbieter“), hell und dunkel über die vorhandenen `tokens`/`dark` in `marker-images.ts` (Review m9).
  - Badge mit der Zahl der Anbieter ab 2.
  - Blass: Deckkraft 0,55, ohne Schatten. Die gestrichelte Kante aus dem Mockup ist in einem MapLibre-Symbol nicht billig. Ersatz ist ein eigenes Bild `anbieter-blass` mit gestricheltem Rand in `marker-images.ts`.
  - Cluster wie heute (dunkler Kreis), Summe der Anbieter-Zahlen. Ein Tipp auf den Cluster zoomt hinein.
- **Tipp auf einen Ort:**
  - Ein Anbieter dort: `onOpenProvider(id)`, also das bestehende Anbieter-Sheet mit `anbieter=` in der URL.
  - Mehrere: Orts-Sheet nach Mockup A2, `karte/ProviderPlaceSheet.tsx`, auf Basis von `Dialog`. Es zeigt Name, Adresse und Stadtteil des Orts, „N Anbieter an diesem Ort“ und je Anbieter eine Zeile mit Name, Zeile wie in der Liste (`providerLine`/`idleLine` aus dem Anbieter-Chunk sind dort nicht erreichbar, daher eine eigene schlanke Zeile „n Angebote“ bzw. „Gerade keine Termine“) und Herz. Dazu kommt „Route in Google Maps“ (`routeLink`, Plan 0019).
  - Ein Tipp auf eine Zeile schließt das Orts-Sheet und öffnet das Anbieter-Sheet.
  - Das Orts-Sheet ist Sitzungszustand und steht nie in der URL, wie `PlaceSheet` (Plan 0005, E5).
  - Es meldet sich über `onSheetOpen` in `dialogOpen` (`App.tsx:343–344`), wie das `PlaceSheet` (Review m4).
  - Fokus: Schließen ohne Wahl gibt den Fokus an die Karte (`.map-box`) zurück, wie beim `PlaceSheet`.
  - Wird das Anbieter-Sheet aus der Karte geöffnet (direkt oder über das Orts-Sheet), geht der Fokus beim Schließen ebenfalls an die Karte, denn ein Ort ist kein fokussierbares DOM-Element. Aus der Liste geöffnet bleibt der Rückweg zur Zeile (`anbieter.spec.ts:169`).
  - Die Herkunft merkt sich `openProvider(id, from: "liste" | "karte")` im Sitzungszustand, nie in der URL. E2E Fall 15 (Review 2, m11).
- **Statuszeile** (Review M1):
  - Die Zahl rechnet weiter das Start-Bundle mit `provider-count.ts`. `directory.ts` ist dort verboten (`directory-only-lazy`).
  - Neu ist `countProviders(visible, view?)` mit `view = { inView, known }`. Gezählt werden wie heute die **aktiven** Anbieter, mit `view` nur die, die nicht außerhalb liegen (Regel aus E2).
  - Ein Unit-Test vergleicht die Zahl mit `providerRows(…, view)` (aktive plus gemerkte aktive).
  - Ist die Karte bereit und filtert der Ausschnitt mindestens eine Zeile der Liste weg (aktiv, gemerkt, blass oder ausgeblendet, also `known.has(id) && !inView.has(id)` für irgendeinen Anbieter der Liste; Review 2, m8), lautet die Zeile „**12** Anbieter im Kartenausschnitt“ mit Textknopf „Alle zeigen“. Der setzt die Kamera auf `providerCamera`, mit `prefers-reduced-motion` per `jumpTo` statt `easeTo`, wie `MapView.tsx:139` (Review m9). Dabei können Kacheln laden.
  - Sonst lautet sie wie heute „**69** Anbieter mit **356** Angeboten“.
  - Der Zusatz zum Startpunkt (`reachSuffix`) bleibt in beiden Fällen.
  - „Alle zeigen“ verschwindet nach dem Tipp. Vorher geht der Fokus auf die Statuszeile (`statusLine.focus()`, Muster `App.tsx:367`; Review 2, m3).
  - Ansage (Review m8, Review 2, m4): Im Ausschnitt-Fall ist der sichtbare Text `aria-hidden`. Ein `sr-only`-Teil in der Live-Region bekommt die Zahl erst 500 ms nach dem letzten `moveend` (`useSettled`, Muster `provider-announce` in `ProviderScreen.tsx:113`).
- **Liste:** `ProviderScreenProps` bekommt `view: { inView; known } | undefined`.
  - Mit `view` filtert `providerRows` (neuer optionaler Parameter in `directory.ts`) alle Gruppen (gemerkt, aktiv, blass) nach der Regel aus E2.
  - `undefined` heißt „Karte nicht bereit oder gescheitert“ und zeigt alle.
  - `hiddenCount` bezieht sich ebenfalls auf den Ausschnitt.
- **Suche und Ausschnitt** wirken zusammen. Die Karte zeigt weiter alle Orte, die Suche filtert nur die Liste.
- **Leerer Ausschnitt ohne Suche** (Review 2, M3): Liegt kein aktiver Anbieter im Ausschnitt, zeigt die Liste statt `NoOffers` mit „Filter zurücksetzen“ den Text „Im Kartenausschnitt bietet gerade niemand etwas an.“ mit „Alle zeigen“. Gibt es auch keinen blassen, entfällt die Liste darunter. Dazu kommt ein E2E-Fall (E8, Fall 14).
- **Suchtreffer außerhalb:**
  - Gibt es Treffer außerhalb des Ausschnitts, steht unter der Liste „n weitere Treffer außerhalb des Kartenausschnitts“ mit „Alle zeigen“. Liegen alle Treffer außerhalb, ist das der Leerzustand (Review m10).
- **Aktualisiert** wird der Ausschnitt bei `moveend`, nicht bei jedem Frame. Der Rückruf vergleicht die Menge und setzt den Zustand nur bei einer Änderung, um Re-Render der Liste zu sparen.
  - Beim Unmount und bei einem Kartenfehler (`onProblem`, WebGL, Kacheln, Chunk) ruft `ProviderMapScreen` `onInView(undefined)`. So filtert kein veralteter Ausschnitt die Liste (Review M4).

### E5 – Architektur und Ladekette

- **Ein gemeinsamer Einstieg `src/ui/karte/entry.ts`** (Review B2), nach dem Muster von `anbieter/entry.ts` (`ProviderPanel.tsx:28`). Er exportiert `MapScreen` und `ProviderMapScreen`.
  - `MapPanel.tsx` lädt künftig `import("./karte/entry.ts")` für beide Panels (`MapPanel` und neu `ProviderMapPanel`). So gibt es nur **einen** Lazy-Einstieg in `karte/`.
  - Das Geteilte (`camera.ts`, `places.ts`, `place-key.ts`, `provider-places.ts`) landet im Karten-Chunk statt in einem gemeinsamen Chunk direkt unter `assets/`, und der Chunk-Wächter bleibt grün.
  - `karte-ui-entry-only` bleibt unverändert, `LAZY_LOADERS` (`MapPanel` → `./karte/`) schon heute vorhanden (`scripts/check-architecture.ts:74`, Review m1).
  - Ob Rolldown den `MapView`-Chunk sauber vom Einstieg trennt (wie heute bei `map-data.ts` und `MapView.tsx`, die beide `camera.ts` nutzen), zeigt `pnpm size` mit `check-chunks.ts` in S4. Ist er doch rot, wird `isMapModule` (`vite.config.ts:26`) um genau diese Domänenmodule erweitert, mit Kommentar.
- **`src/ui/karte/ProviderMapScreen.tsx`** (neu) rechnet `providerPlaces` und `providerCamera`, lädt `../map/MapView.tsx`, hält das Orts-Sheet und meldet `onInView({ inView, known } | undefined)`.
- **`src/ui/map-types.ts`:** `ProviderMapScreenProps` mit:
  - Daten: `directory`, `offers`, `upcoming`, `visible`, `now`, `origin`, `dark` (Stil, `MapView.tsx:153, 257–263`; Review 2, m1), `saved`
  - Rückrufe: `onToggleSaved`, `onOpenProvider`, `onInView`, `onSheetOpen` (Review m4)
  - `resetView`: Zähler, der die Kamera auf den Startausschnitt setzt
- **`ProviderMapPanel`** hat eigene Texte, etwa „Alle Anbieter stehen in der Liste“ statt „Alle Angebote …“ (`MapPanel.tsx:31`). Sein Platzhalter hat dieselbe `clamp`-Höhe wie die Karte, ohne `.map-rest`, damit kein CLS entsteht (Review 2, m6).
- **Verzeichnis für die Karte** (Review M4):
  - **Problem:** `directory` kommt heute aus dem Anbieter-Chunk-Lader (`loadProviderUi` lädt Chunk und `anbieter.json` als ein Promise).
  - **Lösung:** Neuer Hook `useProviderDirectory(generatedAt)` in `ProviderPanel.tsx` (Start-Bundle). Er liefert `laden | da | fehler` samt `retry`, und das gemeinsame Promise bleibt ein Request.
  - Aufrufen dürfen ihn **nur** `ProviderMapPanel` und `ProviderPanel`, die erst im Tab mounten. `App` ruft ihn nie auf, sonst lüde `anbieter.json` bei jedem Start (Invariante `docs/architecture.md:136`, `e2e/anbieter.spec.ts:133, 486`; Review 2, M2).
  - Bei `fehler` zeigt die Karte den Fehlerzustand mit „Nochmal versuchen“ statt eines endlosen Ladezustands, und die Liste zeigt wie heute ihren Fehler.
  - E2E: 503 auf `anbieter.json` zeigt einen Fehler, aber keine endlos ladende Karte.
- **`MapView` wird verallgemeinert:**
  - `places` wird zu `layer: { kind: "angebote"; places: Place<…>[] } | { kind: "anbieter"; places: ProviderPlace[] }`.
  - `geojson.ts` bekommt `providerPlacesToFeatures` mit den Properties `{key, anbieter, blass}`.
  - `layers.ts` bekommt `PROVIDER_LAYERS`: Quelle `anbieter-orte`, Cluster-Summe `anbieter`, Symbol `anbieter` bzw. `anbieter-blass`, Badge ab 2.
  - `marker-images.ts` zeichnet die beiden neuen Bilder.
  - Neu ist der Prop `onViewport?: (b: Bounds) => void`, aufgerufen nach `load` und bei `moveend`.
  - `onTap` wählt Quelle und Layer je `kind`. Heute stehen dort fest `getSource("orte")` und `PLACE_LAYERS` (`MapView.tsx:128, 141`). Sonst zoomt auf der Anbieterkarte kein Cluster (Review m3).
  - Kein Stadtteil-`easeTo` für `kind: "anbieter"` (E4).
- **`lastCamera`** wird je `kind` gemerkt, also `Record<kind, StartCamera | undefined>`. So erbt die Anbieterkarte nicht den Ausschnitt der Angebotskarte.
- **`__zpMap`** bleibt eine Instanz, die beiden Karten sind nie zugleich im DOM.
- **Regeln:**
  - `map-entry-only`: `pathNot` um `^src/ui/karte/ProviderMapScreen\.tsx$` erweitern, Kommentar mit Verweis auf Plan 0055.
  - `LAZY_LOADERS`: neu nur `ProviderMapScreen` → `../map/` (Review m1).
  - `lazy-domain-apart` um `provider-places.ts` erweitern.
  - `vite.config.ts`: Das Asset-Muster `^Map(View|Screen)\b` betrifft nur CSS. `ProviderMapScreen` bekommt kein eigenes CSS, die Stile kommen nach `src/ui/styles/map.css`.
- Das sind Regeln, die erweitert, nicht gelockert werden: Die Karte bleibt hinter `karte/` und lazy. Ein ADR braucht es dafür nicht, die Begründung steht im Kommentar und im Commit.

### E6 – Budgets

| Budget | Grenze | erwartet |
|---|---|---|
| `anbieter.json` gzip | 15 kB | ≈ 9 kB |
| Karte JS | 450 kB | ≈ +3 kB auf ≈ 431 kB |
| Start-CSS (`map.css` hängt über `styles.css:14` daran, Review 2, m2) | 15 kB | +0,2 kB |
| Karte CSS | 12 kB | unverändert |
| Anbieter JS | 6 kB | +0,2 kB (`inView`) |
| JS initial | 150 kB, Startbudget 90 kB | `ProviderMapPanel` ≈ +0,3 kB |

Gemessen wird nach S4 mit `pnpm size`. Reißt ein Budget, wird nicht gesenkt, sondern zuerst gekürzt. Sonst entscheidet der Nutzer, wie in ADR 0012.

Gemessen nach S4 (2026-10-29, `pnpm build && pnpm size`, Chunk-Wächter grün): `anbieter.json` 8,9 kB, Karte JS 429,96 kB, Start-CSS 12,67 kB (+0,2), Karte CSS 10,77 kB, Anbieter JS 3,23 kB, Start-JS 106,52 kB (+1,23 kB statt der geschätzten 0,3 kB: gemeinsamer Katalog-Zustand, Statuszeile und `ProviderMapPanel` liegen im Start). Zeile in der Delta-Tabelle von ADR 0012.

### E7 – ADR 0038 „Anbieterkarte lädt mit dem Tab“

- Ändert ADR 0008, Punkt „Nur in der Kartenansicht“: Auch das Öffnen des Tabs „Anbieter“ ist eine ausdrückliche Handlung und lädt die Karte samt Kacheln.
- Alles andere aus ADR 0008 gilt weiter: einziger Host, kein Querystring, Kamera-Regel, kein Cache, Hinweistext unter der Karte.
- Das Anbieter-Sheet allein (Deep-Link `?anbieter=` über einem anderen Tab) lädt **keine** Karte.
- Startausschnitt der Anbieterkarte: alle Orte aller Anbieter, auch ohne kommende Termine. Kein Stadtteil-Zoom, die Karte fährt also nie auf einen Startpunkt. Der Wortlaut „über alle kommenden Orte“ (ADR 0008, Zeile 66; `architecture.md:134`) wird entsprechend ergänzt.
- Mitzuändern:
  - `docs/architecture.md`, Invariante Privatsphäre: „nur bei offener Karte (Karte in ‚Entdecken‘, Merkliste, Tab ‚Anbieter‘)“
  - Absatz Wegzeit-Anlässe: Die Anbieterkarte ist **kein** neuer Anlass, Wegzeit und Linien laden dort wie heute im Tab.
  - Datenschutztext in `imprintPage()` (`scripts/lib/share-pages.ts`), Pflicht nach ADR 0028
  - Statuszeile von ADR 0008 („geändert durch ADR 0038“)

### E8 – E2E und Wächter

- Specs, die den Tab „Anbieter“ öffnen, setzen `tiles: "mock"`. Die Liste wird vor S4 vollständig per `grep -lE 'name: "Anbieter"|ansicht=anbieter|"anbieter"' e2e/` ermittelt. Bekannt sind `app.spec.ts` (`:163`, `:218`; Review 2, M1), `anbieter.spec.ts`, `anbieter-inhalt.spec.ts`, `merkliste-anbieter.spec.ts`, `mobile-ux.spec.ts` (Anbieter-Ansichten), `layout.spec.ts`, `sortierung.spec.ts`, `teilen.spec.ts` und `smoke.spec.ts`, soweit dort der Tab geöffnet wird.
  - Der Wächter bleibt unverändert: Kacheln nur mit `.map-box` im DOM.
  - `smoke.spec.ts` (echte Daten) braucht ebenfalls den Mock. Er läuft gegen den Deploy-Build, Kacheln sollen nicht echt geladen werden.
- `anbieter.spec.ts` „Privatsphäre“:
  - Die Request-Zählung im Tab rechnet Kachel-Requests heraus (nur Host `tiles.openfreemap.org`, gemockt).
  - „Ab der Wahl eines Startpunkts kein Request“ gilt weiter für alle Startpunkte, auch für einen Stadtteil, weil die Anbieterkarte dorthin nicht fährt (E4, Review M3).
- `e2e/anbieter.spec.ts:105/117` (Schnellfilter und „Alle Filter“ im Tab) wird umgeschrieben: Im Tab steht keine Filterzeile.
- Neue Spec `e2e/anbieter-karte.spec.ts`, in `SPEC_COVERS` deckt sie `karte/ProviderMapScreen.tsx`, `karte/ProviderPlaceSheet.tsx`, `domain/provider-places.ts` und `MapPanel.tsx` ab:
  1. Der Tab zeigt Karte und Hinweis. Die Zahl der Orte entspricht den Fixture-Orten: Gezählt wird über `__zpMap.getSource("anbieter-orte")` und die Eingangsdaten (bzw. `querySourceFeatures` ohne Cluster, entdoppelt nach `key`), denn `querySourceFeatures` liefert Cluster und Kachel-Duplikate (Review m11).
  2. Ort mit einem Anbieter: Tipp öffnet das Anbieter-Sheet, `anbieter=` steht in der URL.
  3. Ort mit zwei Anbietern: Orts-Sheet mit zwei Zeilen, Zeile öffnet das Anbieter-Sheet, Herz merkt.
  4. Ein Anbieter ohne Termine erscheint als blasser Marker (Property `blass`).
  5. Zoom auf einen Ausschnitt (`__zpMap.jumpTo`): Die Statuszeile sagt „N Anbieter im Kartenausschnitt“, die Liste hat N Zeilen. „Alle zeigen“ stellt alles wieder her.
  6. Kategorie-Sticker: Marker ausgeblendeter Anbieter verschwinden. „Kostenlos“ in der URL (`?kosten=kostenlos&ansicht=anbieter`) ändert im Tab nichts, in „Entdecken“ wirkt es weiter.
  7. Ohne WebGL bzw. mit Kachelfehler: Hinweis, und die Liste zeigt alle Anbieter.
  8. Kamera-Regel: Mit gespeichertem Standort startet die Karte im Rahmen aller Orte, nicht beim Standort.
  9. Deep-Link `?anbieter=<id>` über „Entdecken“: Es gibt keinen Kachel-Request.
  10. Rückfall-Anbieter (Fixture ohne Katalog-Eintrag): erscheint mit dem Ort seines Angebots auf der Karte und bleibt in der Liste (Review B1).
  11. Stadtteil im Kind-Sheet wählen: Die Karte bewegt sich nicht, die Liste bleibt gleich, es gibt keinen Kachel-Request (Review M3). Gezählt wird erst, wenn die Karte `idle` ist, sonst ist der Fall flaky (Review 2, m11).
  12. 503 auf `anbieter.json`: Fehler in Liste und Karte, kein endloser Ladezustand (Review M4).
  13. `?wegzeit=30&ansicht=anbieter` mit gespeichertem Startpunkt: Die Statuszeile ist sichtbar, kein Grenz-Hinweis (Review M2).
  14. Ausschnitt ohne aktiven Anbieter: Text „Im Kartenausschnitt bietet gerade niemand etwas an.“, „Alle zeigen“ stellt die Liste wieder her (Review 2, M3).
  15. Fokus-Rückweg: Das Anbieter-Sheet, aus der Karte geöffnet und geschlossen, gibt den Fokus an `.map-box`; aus der Liste an die Zeile (Review 2, m11).
- Die Fixtures (`tests/fixtures/`) bekommen bei Bedarf einen zweiten Anbieter an einem schon belegten Ort und einen Anbieter ohne Termine mit Ort. Erst prüfen, was schon da ist.
- `mobile-ux.spec.ts`: neue Ansichten „Anbieter mit Karte“, „Orts-Sheet“, „Kartenfehler im Tab“ und „Keine Treffer im Kartenausschnitt“, jeweils hell und dunkel mit `expectMobileUx`, Touch ≥ 44 px. `layout.spec.ts`: Im Querformat (z. B. 844×390) sind Statuszeile und erste Listenzeile ohne Scrollen erreichbar (Review M5).

## Dateien

Neu:
- `src/domain/provider-places.ts` und `.test.ts`
- `src/ui/karte/entry.ts`
- `src/ui/karte/ProviderMapScreen.tsx`
- `src/ui/karte/ProviderPlaceSheet.tsx`
- `e2e/anbieter-karte.spec.ts`
- ADR 0038 „Anbieterkarte lädt mit dem Tab“ (unter `docs/adr/`, entsteht in S5)

Geändert:
- **Domäne und Build:** `src/domain/site-data.ts` (+ Test), `src/domain/geo.ts` (`isGeoPoint`, + Test), `src/domain/filter.ts` (+ Test), `src/domain/directory.ts` (+ Test), `src/domain/provider-count.ts` (+ Test), `src/domain/camera.ts` (Helfer, + Test), `scripts/build-data.ts`
- **Oberfläche:** `src/ui/use-offer-views.ts` (+ Test), `src/ui/App.tsx`, `src/ui/MapPanel.tsx`, `src/ui/map-types.ts`, `src/ui/provider-types.ts`, `src/ui/ProviderPanel.tsx`, `src/ui/anbieter/ProviderScreen.tsx`
- **Karte:** `src/ui/map/MapView.tsx`, `src/ui/map/layers.ts`, `src/ui/map/geojson.ts` (+ Test), `src/ui/map/marker-images.ts`, `src/ui/styles/map.css`
- **Regeln:** `.dependency-cruiser.cjs`, `scripts/check-architecture.ts`, `scripts/lib/e2e-map.ts`
- **Datenschutztext:** `scripts/lib/share-pages.ts`
- **E2E:** die Specs aus E8, `tests/fixtures/` nach Bedarf
- **Doku:** `docs/architecture.md`, `docs/adr/0008-karte-openfreemap.md` (Statuszeile), `docs/ideas.md` (Vollbild-Karte), `docs/plans/0042-duesseldorf-katalog-fuellen.md` (Budget-Hinweis)

## Schritte

Jeder Schritt endet mit grünem `pnpm verify`. Domänenlogik entsteht test-first.

Die lokale E2E-Prüfung richtet sich nach „Lokal prüfen“ in CLAUDE.md (Review m7). Specs laufen mit `run_in_background`.

- **S1 – Daten (E1):** Test `site-data.test.ts`: `toProviderDirectory` übernimmt `geo`. Dann Umsetzung, `pnpm build:data` bzw. Fixture-Build und `pnpm size` für `anbieter.json` messen. Lokal danach `pnpm e2e:local --affected --smoke`.
- **S2 – Domäne (E2, E3):**
  - Tests zuerst für `provider-places.test.ts`:
    - Bündelung zweier Anbieter an einer Koordinate
    - Zustände aktiv, ohne Termine, ausgeblendet (ausgeblendete fehlen)
    - Ort ohne `geo` wird übersprungen
    - `providersInBounds` an den Rändern
    - `providerCamera` unabhängig von Filtern und Startpunkt
    - Rückfall-Anbieter ohne Katalog-Eintrag bekommt die Orte seiner Angebote (Review B1)
    - `providersWithPlace` und die Regel „ohne bekannten Ort nie außerhalb“
  - `geo.test.ts`: `isGeoPoint`.
  - `filter.test.ts`: `providerFilter`.
  - `directory.test.ts`: `view` filtert alle Gruppen, ein Rückfall-Anbieter ohne Ort bleibt, die Invariante der Zählung bleibt.
  - `provider-count.test.ts`: `countProviders(visible, view)` stimmt mit `providerRows(…, view)` überein (Review M1).
  - `use-offer-views.test.ts`: `providerVisible` ignoriert Kosten, Anmeldung, Format, Wegzeit-Grenze und Zeitraum, wirkt aber auf Kategorie und Alter.
  - Lokal danach `pnpm e2e:local --affected`, weil sich `src/ui/use-offer-views.ts` ändert (Review 2, m10).
- **S3 – Filterzeile und Liste (E3, E4 Liste):** `App.tsx` ohne `QuickFilters` im Tab, ohne Grenz-Hinweis, mit `providerVisible` und `providerUnfitCount`, `view` in `ProviderScreen`. Die betroffenen E2E-Specs anpassen (E8, Teil 1). Das ist ohne Karte schon auslieferbar: Ohne `view` zeigt die Liste alle. Lokal: `pnpm e2e:local --affected`.
- **S4 – Karte (E4, E5):**
  - Zuerst `MapView` verallgemeinern und `karte/entry.ts` einführen. Die Angebotskarte bleibt unverändert, lokal muss `pnpm e2e:local e2e/karte.spec.ts` grün sein.
  - Dann `ProviderMapScreen`, `ProviderPlaceSheet`, `ProviderMapPanel`, `useProviderDirectory` und die Regeln.
  - Lokal: `pnpm e2e:local e2e/karte.spec.ts e2e/anbieter-karte.spec.ts`.
  - Danach `pnpm size` samt Chunk-Wächter, und die Tabelle in E6 mit Messwerten füllen.
- **S5 – Doku und Privatsphäre (E7):**
  - ADR 0038, `architecture.md`, `imprintPage()`, Statuszeile von ADR 0008, `ideas.md`.
  - Hinweis in Plan 0042: Budget **und** Startausschnitt über zwei Regionen (Review 2, m9).
  - Lokal `pnpm e2e:local --affected --smoke`, weil `share-pages.ts` die Vorschauseiten betrifft (Review 2, m10).
- **S6 – Prüfen:**
  - `pnpm e2e:local --affected` (mehr als 8 Specs, die CI fährt den Rest) und `pnpm e2e:local e2e/anbieter-karte.spec.ts e2e/karte.spec.ts`.
  - `pnpm e2e:local --affected --smoke`, weil sich die Daten ändern.
  - `/arch-review` (neues Modul, Regeländerung, mehr als 200 Zeilen), `/browser-review` mit voller Checkliste, Tab „Anbieter“ hell und dunkel, Orts-Sheet.
- **S7 – Ausliefern:** Branch `anbieter-karte`, Push, CI grün, Fast-Forward nach `main`, CI auf `main` grün, `meta.json` zeigt den Commit, `/browser-review live`.

## Tests (Übersicht)

- **Unit:** `provider-places.test.ts` (neu), `site-data.test.ts`, `geo.test.ts`, `filter.test.ts`, `directory.test.ts`, `provider-count.test.ts`, `camera.test.ts`, `geojson.test.ts`, `use-offer-views.test.ts`
- **E2E:** `anbieter-karte.spec.ts` (neu, 15 Fälle), angepasst `app.spec.ts`, `sortierung.spec.ts`, `teilen.spec.ts`, `anbieter.spec.ts`, `anbieter-inhalt.spec.ts`, `merkliste-anbieter.spec.ts`, `mobile-ux.spec.ts`, `layout.spec.ts`, `smoke.spec.ts`. Unverändert grün müssen `karte.spec.ts` und `startpunkt.spec.ts` bleiben.

## Risiken

- **Budget `anbieter.json` für Düsseldorf** (Plan 0042): +16 % durch `geo`. Fängt Plan 0042 das nicht ab, ist die Datei je Region zu teilen oder das Budget per ADR anzuheben. Beides liegt außerhalb dieses Plans.
- **Leistung:** MapLibre lädt jetzt beim Öffnen des Tabs, also etwa 430 kB JS gzip. Der Tab ist bisher leicht (3 kB). Auf langsamen Geräten erscheint die Liste zuerst, die Karte füllt sich danach. Die Karte darf den Aufbau der Liste nicht blockieren: eigener Lazy-Pfad, die Liste rendert unabhängig vom Ladezustand der Karte. INP und LCP prüft `mobile-ux.spec.ts`.
- **Scrollen auf dem Handy:** Mit der Karte oben kann ein Wisch die Karte bewegen statt die Seite. `cooperativeGestures` (zwei Finger) gilt wie bei der Angebotskarte. Im Browser-Review besonders prüfen.
- **Zweite Region** (Plan 0042, Review m6): Mit Düsseldorf im Katalog rahmte `providerCamera` beide Städte, und der Startausschnitt wäre nutzlos. Mit Düsseldorf muss der Startausschnitt je Region gelten (z. B. die Region des Startpunkts bzw. der Stadtwahl). Das entscheidet Plan 0042 bzw. ein Folgeplan, hier steht nur der Hinweis.
- **Ausschnitt vs. Liste:** Wer die Karte verschiebt, sieht weniger Anbieter, und das ist leicht zu übersehen. Deshalb nennt die Statuszeile „im Kartenausschnitt“ und bietet „Alle zeigen“ an.

## Offen

- Keine offenen Nutzerentscheidungen. Die Entscheidungen vom 2026-10-29 stehen unter „Anlass“.

## Umsetzung (2026-10-29)

Abweichungen und Präzisierungen gegenüber E1–E8 und den Nachträgen:

- **Glocke statt Herz** (Plan 0054, parallel live): Gemerkte Anbieter heißen jetzt Anbieter-Abos. Das Orts-Sheet zeigt je Zeile die Glocke (`BellButton`), nicht das Herz.
- **Fokus-Rückweg ohne `openProvider(id, from)`** (E4, Fall 15): Der native `<dialog>` gibt den Fokus beim Schließen an den Auslöser zurück. Nach einem Tipp auf die Karte ist das die Canvas in `.map-box`, aus der Liste die Zeile. Ein eigener Sitzungszustand für die Herkunft ist deshalb nicht nötig; Fall 2 der Spec prüft den Weg über die Karte.
- **Gemeinsamer Ladezustand** (E5, N13): `useProviderDirectory` in `ProviderPanel.tsx` hält Chunk und Katalog in einem kleinen Store (`useSyncExternalStore`). So sehen Liste und Karte denselben Fehlschlag, und „Nochmal versuchen“ in der Liste lädt für beide. Ein neuer Mount nach einem Fehlschlag versucht es wie bisher neu. Das Anbieter-Sheet behält seinen eigenen `useLazy`.
- **`ProviderPlace`** trägt zusätzlich `address` (Route im Orts-Sheet) und je Anbieter `shown` („n Angebote“).
- **`useSettled`** liegt jetzt im Start (`src/ui/use-settled.ts`), weil Statuszeile und Liste es nutzen.
- **Marker**: Die Kachel ist ein Bild (`anbieter`, `anbieter-blass`) mit Schatten im Bild; der unsichtbare Kreis `anbieter-punkt` ist die Trefferfläche für `PROVIDER_LAYERS`.
- **Kartenhöhe** (E4, N6): `clamp(10rem, 40svh, max(250px, 12rem))` statt `clamp(160px, 40svh, 250px)`. Bei 100 % Schrift ist das dasselbe; bei 200 % wächst die Karte wie die Angebotskarte mit, sonst überlagerten sich Attribution und Zoom-Knöpfe (axe target-size in `mobile-ux.spec.ts`).
- **Querformat** (Review M5, Abweichung): Bei 844×390 belegen Kopf, Sticker und Suche schon ≈ 250 px. Die Statuszeile ist dort ohne Scrollen nicht erreichbar, wie niedrig die Karte auch ist. `layout.spec.ts` sichert stattdessen, dass die Karte quer auf ihre Mindesthöhe (160 px, höchstens 45 % der Höhe) schrumpft und die Statuszeile direkt darunter folgt. Ein kompakterer Kopf im Querformat wäre eine eigene Änderung (`docs/ideas.md`).
- **Dateien, die sich nicht ändern** (Plan-Drift, Arch-Review Minor 5): `src/domain/camera.ts` samt Test (der Helfer entfiel mit Review 2, m7) und `scripts/build-data.ts` (es ruft `toProviderDirectory` unverändert auf). Der Satz in E5 „Ein ADR braucht es dafür nicht“ ist überholt: ADR 0038 nennt die Ausnahme in `map-entry-only` (N10).
- **Smoke** (Arch-Review B1): `smoke.spec.ts` fährt den Tab mit `tiles: "mock"` und `mapSettled`; lokal läuft Smoke nur mit `PW_SUITE=smoke`, nicht über `e2e:local` mit Spec-Liste.
- **E2E-Hilfe** `mapSettled` (`e2e/fixtures.ts`, N1): Karte bereit und ruhig, vor jeder Request-Zählung und vor dem Verlassen des Tabs. `mockTilesIn` gibt einem zweiten Browser-Kontext denselben Kachel-Mock.
- **E2E**: Fall 6 (Kostenlos in der URL) steht in `anbieter.spec.ts`. Fall 11 (Stadtteil wählen bei offenem Tab) deckt der vorhandene Privatsphäre-Fall in `anbieter.spec.ts` ab, jetzt mit Karte im Tab; dazu prüft Fall 8 denselben Startausschnitt mit gespeichertem Stadtteil. Dazu kommt ein Fall „Suche mit Treffern außerhalb des Ausschnitts“.

## Arch-Review und Browser-Review (2026-10-29)

- **Arch-Review 1** – Nacharbeit nötig: B1 (Smoke-Specs ohne Kachel-Mock) behoben, `smoke.spec.ts` mit `tiles: "mock"` und `mapSettled`, `PW_SUITE=smoke pnpm e2e` grün (27). Minor 1–6 übernommen: doppelter Aufruf in `layout.spec.ts`, `outsideText` nach `provider-format.ts` und `placeProviderLine` nach `provider-places.ts` mit Unit-Tests, Kommentare in `map-types.ts` und `provider-count.ts`, Plan-Drift unter „Umsetzung“, der Ausschnitt-Leerzustand nur, wenn es ohne Ausschnitt aktive Anbieter gäbe.
- **Arch-Review 2** – OK, ohne Blocker und Major. Minor übernommen: Padding der Anbieterkarte in `architecture.md`, zwei Ansichten „Suche außerhalb“ in `mobile-ux.spec.ts`, E2E-Fall „alle Treffer außerhalb“, Kommentar in `directory.ts`, überflüssige CSS-Klasse entfernt. Nicht übernommen: eigene Ansicht für den Kachelfehler im Tab (der Weg ist derselbe wie auf der Angebotskarte, `karte.spec.ts`).
- **Browser-Review** (Fixture-Build, `scripts/screenshots.ts`, Ansichten `anbieter`, `anbieter-sheet`, `tabs`, alle Viewports hell und dunkel):
  - Lesbarkeit: Reihenfolge Sticker, Suche, Karte, Hinweis, Statuszeile, Liste wie Mockup C; Statuszeile und Zeilen unverändert lesbar.
  - Daumen: Zoom-Knöpfe oben rechts, „Alle zeigen“ als Textknopf an der Statuszeile; Ziele ≥ 44 px (`mobile-ux.spec.ts`).
  - Zustände: Laden, Fehler (ohne WebGL, 503), leerer Ausschnitt, Suche außerhalb und lange Namen geprüft (E2E und `mobile-ux`).
  - Dunkel: Kacheln in `--surface`, Cluster in `--primary`, keine hellen Inseln (`expectNoBrightIslands`).
  - Befund behoben: Quer lag ein Marker unter der ausgeschriebenen Attribution (`anbieter-quer-dark.png`); `PROVIDER_PADDING` hält unten jetzt Platz frei. Quer fasst die 160 px hohe Karte die Orte der Fixtures dadurch zu einem Cluster zusammen.
  - Micro-Interactions: Zeilen und Glocken wie in der Liste; Kamerafahrten bei reduzierter Bewegung springen (MapLibre).

## Review (2026-10-29) – Verdict: Überarbeiten

Reviewer: Subagent `plan-reviewer`, ohne Chat-Kontext. Alle Punkte übernommen, keiner abgelehnt.

- **B1, Rückfall-Anbieter fallen aus der Liste:** übernommen.
  - `providerPlaces` nimmt für Anbieter ohne Katalog-Eintrag die Orte ihrer Angebote.
  - Ein Anbieter ohne bekannten Ort gilt nie als außerhalb (`known`).
  - Tests in `provider-places`, `directory` und E2E Fall 10 (E2, E4, E8).
- **B2, geteilter Chunk in `assets/`:** übernommen. Ein gemeinsamer Einstieg `karte/entry.ts`; als Rückfall wird `isMapModule` erweitert, geprüft mit `pnpm size` in S4 (E5).
- **M1, Statuszeile im Start-Bundle:** übernommen. `countProviders(visible, view)` in `provider-count.ts` mit Vergleichstest; gezählt werden die aktiven Anbieter (E4).
- **M2, Reste von Grenze und Zeitraum:** übernommen. `hint` und `listPending` nur in „Entdecken“, dazu `providerUnfitCount` und E2E Fall 13 (E3).
- **M3, Stadtteil-Zoom:** übernommen. Die Anbieterkarte fährt nie auf einen Stadtteil, E2E Fall 11 (E4, E7, E8).
- **M4, Fehlerweg beim Verzeichnis:** übernommen.
  - `useProviderDirectory` mit Fehlerzustand statt `onDirectory`.
  - `onInView(undefined)` bei Unmount und Kartenfehler.
  - E2E Fall 12 (E4, E5).
- **M5, Querformat:** übernommen. Höhe `clamp(160px, 40svh, 250px)`, Prüfung quer in `layout.spec.ts`, weitere Ansichten in `mobile-ux.spec.ts` (E4, E8).
- **m1–m11:** übernommen.
  - m1: `LAZY_LOADERS` korrigiert
  - m2: `isGeoPoint` in `geo.ts`, Typ `StartCamera`
  - m3: `onTap` je `kind`
  - m4: `onSheetOpen` und Fokus-Rückweg
  - m5: Wortlaut zum Startausschnitt in ADR 0038
  - m6: Risiko zweite Region
  - m7: lokale E2E je Schritt
  - m8: Ansage verzögert
  - m9: Marker im Dunkelmodus, reduzierte Bewegung
  - m10: Hinweis „n weitere Treffer außerhalb“
  - m11: Zählung der Marker im Test

## Review 2 (2026-10-29) – Verdict: Überarbeiten

Zweiter Reviewer, ohne Chat-Kontext. Er bestätigt B2, M2, M3 und M5 aus Runde 1 als gelöst, B1 und M1 nur zum Teil. Alle neuen Punkte sind übernommen, keiner abgelehnt.

- **B1, Kamera und Ausschnitt hingen an gefilterten Orten:** übernommen.
  - `providerGeometry` (alle Orte, ohne Filter) trägt jetzt Kamera, `known` und `inView`. `providerPlaces` liefert nur noch die Darstellung.
  - Dazu Unit-Tests: Kamera bei verschiedenem `visible` gleich; `hiddenCount` richtet sich nach dem Ausschnitt (E2).
- **M1, `app.spec.ts` fehlte:** übernommen, samt vollständiger Ermittlung der Specs per `grep` vor S4 (E8).
- **M2, wer `useProviderDirectory` aufruft:** übernommen. Nur `ProviderMapPanel` und `ProviderPanel`, nie `App` (E5).
- **M3, Leerzustand ohne Suche:** übernommen. Eigener Text und E2E Fall 14 (E4, E8).
- **m1–m12:** übernommen.
  - m1: `dark`, `now` und `upcoming` in den Props
  - m2: CSS-Zeile im Budget korrigiert
  - m3: Fokus bei „Alle zeigen“
  - m4: Ansage über einen eigenen `sr-only`-Teil
  - m5: Altershinweis
  - m6: Texte und Platzhalterhöhe von `ProviderMapPanel`
  - m7: kein eigener Helfer `boundsCamera`, `initialCamera` reicht
  - m8: Bedingung für „im Kartenausschnitt“
  - m9: Risiko Region im Hinweis zu Plan 0042
  - m10: lokale E2E für S2 und S5
  - m11: Fokus-Herkunft (Fall 15), `idle` vor dem Zählen
  - m12: Testübersicht vervollständigt

## Review 3 (2026-10-29) – Verdict: Freigabe mit Änderungen

Dritter Reviewer, ohne Chat-Kontext. Er findet keinen Blocker und bestätigt die Ladekette (`karte/entry.ts`, `camera.ts` heute schon geteilt, ohne Chunk in `assets/`) und die Regeländerungen. Alle Punkte sind übernommen. Sie gelten als **verbindliche Nachträge** zu E1–E8 und gehen dort vor, wo der Text oben abweicht.

**Major**
- **N1, Privatsphäre-Specs (zu E8):** Jede Request-Zählung und jeder Pfadvergleich im Tab beginnt erst, wenn die Karte bereit und `idle` ist. Das betrifft `anbieter.spec.ts:454–483` und `merkliste-anbieter.spec.ts:63–77, 239`.
  - Das Signal ist `.map-box[data-state=bereit]` plus `__zpMap.once("idle")`.
  - Im Deploy-Build (Smoke), wo es `__zpMap` nicht gibt, filtert die Zählung `assets/karte/` und `tiles.openfreemap.org` ausdrücklich heraus.
  - Nur Kacheln herauszurechnen reicht nicht.
- **N2, keine Fixture-Änderung (zu E8):** Die Fixtures haben keinen Ort mit zwei Anbietern (`tests/fixtures/providers.yaml`). Die Fälle 3 (Orts-Sheet), 4 (blass), 10 (Rückfall) und der neue Fall 16 laufen deshalb über `page.route("**/data/anbieter.json")`, nach dem Muster von `anbieter.spec.ts:412–418`.
  - Fall 3/4: einen Anbieter ohne Termine am Ort eines vorhandenen Anbieters ergänzen.
  - Fall 10: einen Anbieter aus `anbieter.json` entfernen, dann wird er zur Rückfall-Zeile. Der Satz „Fixture ohne Katalog-Eintrag“ entfällt, denn `toSiteData` wirft dann (`site-data.ts:74`).
  - Fall 16: altes `anbieter.json` ohne `geo` (die Route entfernt `geo`). Die Liste zeigt alle, und es gibt keinen Fehler.
  - `tests/fixtures/` bleibt unverändert.
- **N3, `upcoming` ohne laufende Kurse (zu E2, E5):** `providerGeometry` und `providerPlaces` bekommen `applyFilters(offers, EMPTY_FILTER, { now })` **ohne** `runningCourses`, wie `ProviderScreen.tsx:42`, nicht `views.upcoming` (`use-offer-views.ts:158`). Den Wert rechnet `ProviderMapScreen` selbst aus `offers` und `now`. Der Prop `upcoming` entfällt. Ein Unit-Test belegt: Ein Anbieter mit nur einem laufenden Kurs ist auf der Karte blass, wie in der Liste (`architecture.md:137`).

**Minor**
- **N4 (E1):** Grund für das tolerante Lesen ist der HTTP-Cache bei einem Deploy mit gleichem `generatedAt`, nicht der Service Worker. `anbieter.json` läuft über „sonst nur Netz“ (`architecture.md:90`).
- **N5 (E4):** Der Hinweis „Kartenbilder kommen von OpenFreeMap …“ steht im Start-Bundle in `ProviderMapPanel`, unter dem Platzhalter bzw. der Karte, damit er beim Laden des Chunks nichts verschiebt.
- **N6 (E4):** Die Anbieterkarte bekommt die Klasse `.map-box.anbieter`. Normal gilt `height: clamp(160px, 40svh, 250px)`, im Lade- und Fehlerzustand `min-height` mit derselben Formel und `height: auto`, damit Text und Knopf bei 320 px und 200 % Schrift passen.
- **N7 (E5):** Eigenes festes Padding zum Einpassen für `kind: "anbieter"` (z. B. 24 px ringsum, statt `START_PADDING` aus `MapView.tsx:51–56`). Es hängt an nichts Privatem und ist ADR-konform. Der Browser-Review prüft es quer.
- **N8 (E5):** Kein `lastCamera` für die Anbieterkarte. Sie startet immer im Startausschnitt, damit die Liste beim Zurückkehren nicht ohne Eingabe schrumpft. `lastCamera` bleibt nur für `kind: "angebote"`.
- **N9 (E5):** `MapViewProps` bekommt `resetKey: number`. Ändert er sich, ruft MapView `fitBounds` mit dem Padding aus N7, mit `duration: 0` bei `prefers-reduced-motion`. Das ersetzt den Satz mit `jumpTo` in E4.
- **N10 (E7):** „Mitzuändern“ umfasst zusätzlich:
  - `architecture.md:135` (Stadtteil fährt nur die Angebotskarte) und `:68–72` (Lader, `karte/entry.ts`, Ausnahme in `map-entry-only`)
  - `docs/ideas.md:45` (veraltet: `anbieter.json` hat jetzt `geo`)
  - ADR 0038 nennt die Ausnahme in `map-entry-only` ausdrücklich (CLAUDE.md, Backpressure)
- **N11 (E6):** Das Startbudget beträgt 150 kB (ADR 0012, Nachtrag 2026-10-24), nicht 90 kB. Die Messwerte kommen als Zeile in die Delta-Tabelle von ADR 0012.
- **N12 (S4):** Lokal zusätzlich `pnpm e2e:local --affected`, denn `App.tsx`, `MapPanel.tsx` und `ProviderPanel.tsx` ändern sich.
- **N13 (E5):** Scheitert `anbieter.json`, zeigt die Karte nur den Hinweis „Anbieter lassen sich gerade nicht laden.“ ohne Knopf. „Nochmal versuchen“ gibt es nur in der Liste, und es lädt beide neu (gemeinsamer Hook).
- **N14 (S1):** `site-data.test.ts:106–128` verbietet heute `"geo"` im ganzen JSON. Der Test wird auf die Ebene des Anbieters eingeschränkt und erwartet `geo` je Ort ausdrücklich.
