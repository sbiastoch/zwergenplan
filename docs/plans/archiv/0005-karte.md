# Plan 0005 – Karte der Orte (MapLibre GL + OpenFreeMap)

Status: abgeschlossen, live seit ed4e5e4 (2026-10-05). Restpunkte stehen in `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“ (Plan 0027, Etappe 6). Früherer Status: umgesetzt auf Branch `karte-0005` (Schritte 2–7), Arch-Review eingearbeitet → Push, CI und Browser-Review live offen
Datum: 2026-10-04
Bezug: Plan 0004 (Startpunkt, Luftlinie: Voraussetzung), Plan 0003 (E1, E4), ADR 0005 (Startpunkt ohne GPS), **ADR 0008** (angenommen: MapLibre, OpenFreeMap, Kamera-Regel, Alternativen)

## Ziel

„Entdecken“ bekommt neben der Liste eine **Karte** der Orte. Am Ende gilt:

- Ein Umschalter **Liste | Karte** (`?ansicht=karte`). „Entdecken“ startet immer mit der Liste (Nutzerentscheidung 5).
- Die Karte (MapLibre GL JS, Kacheln von OpenFreeMap) zeigt einen Marker je Ort mit der Zahl der Angebote. Nahe Orte werden zu Clustern gebündelt.
- Ein Tipp auf einen Marker öffnet das **Orts-Sheet** mit den Angeboten des Orts, bei genau einem Angebot direkt das Detail.
- Unter der Karte steht eine **Orts-Liste** als zugängliche Entsprechung. Ist ein Startpunkt gesetzt (Plan 0004), ist sie nach Entfernung sortiert.
- Filter, Altersregel und Umkreis aus Plan 0004 wirken auf Karte und Orts-Liste genauso wie auf die Liste.
- Neue Startpunkt-Quelle „**Kartenmitte als Startpunkt**“.
- Der Karten-Code lädt erst beim Öffnen der Karte (ca. 440 kB gzip, Nutzerentscheidung 2: Variante A). Die Startbudgets bleiben (JS 90 kB, CSS 15 kB), die Karte hat eigene Budget-Zeilen.
- Einziger Drittanbieter ist `tiles.openfreemap.org`, nur bei offener Karte. Die Karte fährt nie auf einen Standort oder auf die Kartenmitte (ADR 0008).
- Mobile-UX-Gates grün für Karte und Orts-Sheet, hell und dunkel. E2E läuft offline mit gemockten Kacheln.

## Nicht-Ziele

- Alles aus Plan 0004 (Startpunkt per Standort und Stadtteil, Luftlinie, Umkreis, Kind-Sheet „Entfernung ab“). Dieser Plan nutzt es nur.
- ÖPNV-Fahrzeit (ADR 0005), Haltestellen als Startpunkt.
- Service Worker, Offline-Kacheln, Vorab-Laden der Karte, selbst gehostete Kacheln (ADR 0008, „Alternativen“: als Ausweichweg festgehalten).
- Karte im Kalender oder in der Merkliste.

  > **Geändert durch Plan 0025:** Die Merkliste hat eine eigene Karte (`?ansicht=merkliste-karte`, E4) mit den Orten der gemerkten Angebote. Der Startausschnitt ist derselbe wie in „Entdecken“ (alle kommenden Angebote, ADR 0008).
- Diese Punkte kommen nach `docs/ideas.md`: Umkreis-Kreis auf der Karte, „Auf der Karte zeigen“ im Detail, Link „Route in Karten-App öffnen“, Adresssuche.
- Sortierung der Tagesliste nach Entfernung (Plan 0004, Nicht-Ziele).

## Ausgangslage und Voraussetzungen

- **Voraussetzung:** Plan 0004 ist umgesetzt und live, und damit auch die Nacharbeit zu Plan 0003 (B1, B2, B5, B6, B7). Bereits vorhanden sind dann:
  - in der Domäne `geo.ts`, `reach.ts` (`Origin`, `reachTo`, `compareReach`, `withinLimit`), `districts.ts` (35 Stadtteile) und `FilterContext.origin`;
  - `useOrigin()` und `OriginPicker`;
  - `CardContext.reachOf`, `distanceShort`/`distanceLong`/`originPhrase`.
- Echte Daten (Stand 2026-10-04): 82 genutzte Orte mit 76 verschiedenen Koordinaten. Höchstens 2 Orte teilen sich eine Koordinate, ein Ort hat bis zu 62 Angebote. Die Fixtures haben 5 Orte (Familientreff Beispielhof 4 Angebote, Theater 2, die übrigen je 1).
- `.size-limit.json` zählt **alle** Dateien unter `dist/assets/*.js` zusammen. Ein Lazy-Chunk im selben Ordner zählt also mit.
- `e2e/fixtures.ts`: `thirdPartyGuard` (jeder fremde Origin ist rot) und `consoleGuard` (jedes `console.error` ist rot), beide automatisch.
- `App.tsx` hat 240 Zeilen. Die Overlays sind native `<dialog>` (`Dialog.tsx`).
- **Spike vom 2026-10-04** (außerhalb des Repos, Vite 8.3.2 + `maplibre-gl` 6.12.0):
  - Das Paket ist reines ESM. Die Worker-URL kommt aus `import.meta.url` und stimmt nach dem Bündeln nicht mehr. Abhilfe: `setWorkerUrl` mit `?worker&url`.
  - Gebündelt (gzip): Karten-Chunk 283,6 kB, Worker 144,4 kB, CSS 10,7 kB.
  - Die Ausgabe nach `assets/karte/` funktioniert.
  - In Chromium und WebKit headless lädt die Karte mit lokalem Stil und rendert eine GeoJSON-Quelle. Chromium meldet nur `console.warning`.
  - Im Quelltext von 6.12.0 bestätigt: `easeTo`/`jumpTo` setzen `duration = 0`, wenn `!essential && prefersReducedMotion`. `flyTo` springt dann ebenfalls.
- OpenFreeMap: Stile `positron` (hell, Schriften Noto Sans Regular/Bold/Italic) und `dark` (nur Noto Sans Regular). Alles kommt von `https://tiles.openfreemap.org` ohne Querystring, darunter die Kachel-URLs `/planet/<version>/{z}/{x}/{y}.pbf`, `/fonts/{fontstack}/{range}.pbf` und `/sprites/ofm_f384/ofm…`. Datenschutz, Nutzungsbedingungen und Alternativen stehen in ADR 0008.

## Entscheidungen

### E1 – Grundlage und Ladegröße

- Variante A (Nutzerentscheidung 2): MapLibre wird von Vite gebündelt und lazy geladen, ca. 440 kB gzip beim ersten Öffnen, danach aus dem HTTP-Cache.
- Verworfen ist Variante B: die drei `.mjs`-Dateien unverändert aus `public/vendor/` laden, ca. 305 kB. Sie bräuchte einen Kopierschritt, eine Versionskonstante, einen `as`-Cast und knip-Sonderwege.
- B wird wieder geprüft, wenn der Browser-Review auf „Fast 4G“ mehr als 4 s bis zu den ersten Kacheln misst.

### E2 – MapLibre: Version, Laden, Worker, erneuter Versuch

- Abhängigkeit `maplibre-gl` **exakt 6.12.0** (`pnpm add -E`), Lizenz BSD-3-Clause. Eine Patch-Version 6.12.x ist erlaubt, wenn Schritt 2 damit grün ist.
- **Laden**: `src/ui/MapPanel.tsx` (Startbundle) lädt beim Mounten `import("./map/MapView.tsx")`.
  - Ein Hook im Panel hält `loading | ready | error` und einen Versuchszähler.
  - `React.lazy` scheidet aus, weil ein fehlgeschlagener Import dort gecacht bleibt.
- **Erneuter Versuch**:
  - Nach dem ersten Fehlschlag gibt es „Nochmal versuchen“, das `import()` erneut aufruft.
  - Manche Browser merken sich einen fehlgeschlagenen Modul-Import (Modul-Map). Schlägt deshalb auch der zweite Versuch fehl, heißt der Knopf „Seite neu laden“ und ruft `location.reload()` auf. Die URL behält `ansicht=karte`.
  - `vite:preloadError` (Vites Preload-Helfer, z. B. wenn das Karten-CSS fehlt) wird **nicht** per `preventDefault()` unterdrückt. Sonst würde `import()` ohne Modul auflösen. Die Ablehnung fängt der Hook wie jeden anderen Fehler.
- **Worker** (in `src/ui/map/MapView.tsx`):
  ```ts
  import { Map, setWorkerUrl } from "maplibre-gl";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
  import "maplibre-gl/dist/maplibre-gl.css";
  import "./map-overrides.css"; // nach maplibre-gl.css, E4/E7
  setWorkerUrl(workerUrl); // vor dem ersten new Map()
  ```
  `vite.config.ts` bekommt `worker: { format: "es" }`.
- **Ausgabe**: Der Chunk von `src/ui/map/**` samt `maplibre-gl`, der Worker und das Karten-CSS landen in **`dist/assets/karte/`**. Konfiguration wie im Spike (die Bedingung an den Chunk-Namen anpassen):
  ```ts
  const KARTE = "assets/karte/[name]-[hash]";
  worker: { format: "es", rolldownOptions: { output: { entryFileNames: `${KARTE}.js`, chunkFileNames: `${KARTE}.js` } } },
  build: { rolldownOptions: { output: {
    chunkFileNames: (c) => (c.name === "MapView" ? `${KARTE}.js` : "assets/[name]-[hash].js"),
    assetFileNames: (a) => (a.names?.some((n) => n.startsWith("MapView")) ? `${KARTE}[extname]` : "assets/[name]-[hash][extname]"),
  } } },
  ```
  Ob das greift, prüfen die Budgets (E3): Landet MapLibre in `dist/assets/`, reißt das Startbudget. Bleibt `dist/assets/karte/` leer, findet size-limit keine Datei und wird rot.

### E3 – Budgets und Architekturregeln

- `.size-limit.json`:
  - `JS (initial)` `dist/assets/*.js` bleibt bei 90 kB; der Glob schließt `karte/` aus.
  - `CSS` `dist/assets/*.css` bleibt bei 15 kB.
  - Neu: `Karte JS (lazy)` `dist/assets/karte/*.js` **450 kB** (gemessen 428 kB + ca. 5–8 kB eigener Karten-Code).
  - Neu: `Karte CSS (lazy)` `dist/assets/karte/*.css` **12 kB** (gemessen 10,7 kB + Overrides).
- **Startbundle**: Im Startbundle bleiben `MapPanel`, `PlaceList`, `PlaceSheet`, Umschalter, `places.ts`, `tiles.ts` und das Karten-CSS (`styles/map.css`). Sie müssen auch ohne Karten-Chunk funktionieren (offline, kein WebGL).
  - Dazu kommt Vites Preload-Helfer für den ersten dynamischen Import der App (ca. 0,5–1 kB).
  - Schätzung zusammen ca. +3,5–5 kB gzip.
  - **Gemessen wird nach Schritt 2** (Gerüst) **und nach Schritt 5** (UI komplett), notiert hier.
  - Liegt das Startbundle dann über 90 kB, wird verschlankt, z. B. durch gemeinsame Kachel-/Listen-Bausteine oder kürzere Texte. Das Budget wird nicht erhöht; braucht es mehr, ist das eine neue Entscheidung mit ADR.
  - Der frühere Ausweg „Orts-Liste in den Karten-Chunk“ ist gestrichen: Er würde die Liste ohne Karte unbenutzbar machen und das Karten-Budget verfälschen.
- dependency-cruiser, zwei neue Regeln mit Kanarienvogel (ADR 0004):
  - `maplibre-only-in-map`: `from: { pathNot: "^src/ui/map/" }` → `to: { path: "(^|/)node_modules/maplibre-gl/" }` verboten.
  - `map-only-lazy`: `from: { path: "^src/", pathNot: "^src/ui/map/" }` → `to: { path: "^src/ui/map/", dependencyTypesNot: ["dynamic-import"] }` verboten, auch für reine Typ-Importe. Die Props-Typen liegen deshalb in `src/ui/map-types.ts`.
  - Kanarienvogel: Ein statisches `import { MapView } from "./map/MapView.tsx"` bzw. `import "maplibre-gl"` in `App.tsx` muss `pnpm arch` rot machen; danach wird beides wieder entfernt.
- E2E-Nachweis: Die Startseite lädt nichts aus `assets/karte/` und schickt keinen Request an OpenFreeMap (E13, Test 1).

### E4 – OpenFreeMap (ADR 0008)

- `src/data/tiles.ts` ist die **einzige** Stelle mit dem Kachel-Host:
  - `TILE_ORIGIN = "https://tiles.openfreemap.org"`
  - `styleUrl(dark)` → `/styles/positron` bzw. `/styles/dark`
  - `ATTRIBUTION`: `<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>`
  - `guardTileRequest(url)`: Durch kommen nur `https:` auf diesem Origin ohne Querystring und Fragment, außerdem `blob:` und `data:` unverändert. Sonst wirft die Funktion `Error("Karten-Request an fremde Adresse blockiert")`. `MapView` übergibt sie als `transformRequest`.
  - Die Datei liegt in `src/data`, weil das laut `docs/architecture.md` der einzige Datenzugriff ist, auch wenn MapLibre selbst lädt.
- **Attribution**:
  - `attributionControl: { compact: false, customAttribution: ATTRIBUTION }`. Die eingeklappte Variante hätte einen 24-px-Knopf.
  - Die Links bleiben `inline` und bekommen in `src/ui/map/map-overrides.css` `padding-block` (damit das Rechteck ≥ 24 px hoch ist) sowie Token-Farben für hell und dunkel.
  - Doppelte Einträge (Stil + `customAttribution`) entfernt MapLibre; der Browser-Review prüft, dass der Text genau einmal steht.
- **Overrides für MapLibre-Bedienelemente** stehen in `src/ui/map/map-overrides.css`. Die Datei wird in `MapView.tsx` **nach** `maplibre-gl.css` importiert und nutzt zusätzlich höhere Spezifität (`.map-box .maplibregl-…`), damit die Reihenfolge der Lazy-CSS keine Rolle spielt.
  - Inhalt: Zoom-Knöpfe 44 × 44 px, Fokusrahmen, Farben.
  - Alles, was ohne Karte gebraucht wird (`.map-box`, Platzhalter, Fehlermeldungen, Werkzeugzeile, Orts-Liste, Orts-Sheet), steht in `src/ui/styles/map.css` im Start-CSS.
- Unter der Karte steht (`.small`): „Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät.“
- Referrer: Browser-Standard (Abwägung in ADR 0008).

### E5 – Ansicht und URL

- `src/domain/route.ts`: `TABS = ["entdecken", "karte", "kalender", "merkliste"]`. `?ansicht=karte` setzt die Kartenansicht per `replaceState`, wie bei den anderen Tabs (Plan 0003, E4).
  - `tabSection(tab)` liefert `"entdecken"` für `entdecken` und `karte` (Test).
  - Die Tab-Leiste behält drei Tabs; „Entdecken“ ist in beiden Fällen `aria-current="page"`.
- **Startansicht** (Nutzerentscheidung 5): Ohne `ansicht` startet die App mit der Liste.
  - Ein Tipp auf „Entdecken“ aus Kalender oder Merkliste führt immer zur Liste. Es gibt kein Gedächtnis für die letzte Darstellung, weder im Speicher noch in `localStorage`.
  - `?ansicht=karte` in der URL (Neuladen, geteilter Link) öffnet die Karte, weil die URL der Zustand ist.
- **Umschalter Liste | Karte**: Segment `.seg seg2` mit `aria-pressed`, in einem `fieldset` mit versteckter Legende „Darstellung der Angebote“. Er steht unter den Schnellfiltern, über der Statuszeile. Sticker-Leiste und Schnellfilter stehen auch auf der Karte.

  > **Geändert durch Plan 0025:** `ViewToggle` ist allgemein (`options`, `current`, `onChange`, `legend`), die Klasse heißt `seg`, die Daumenbreite folgt `--n`. In „Entdecken“ steht er wie bisher neben der Statuszeile; auf der Merkliste steht er allein über die ganze Breite (`.view-toggle.full`, Legende „Darstellung der Merkliste“), ohne Sticker und Schnellfilter.
- Das Detail öffnet aus der Karte wie überall (`pushState`, `angebot=`).
- Das Orts-Sheet ist Sitzungszustand (`placeKey` im Speicher), nicht in der URL.
- Nie in der URL: Startpunkt, Kartenausschnitt, Ort.

### E6 – Orte, Marker, Cluster, Orts-Sheet

- Domäne `src/domain/places.ts`:
  - `placeKey(geo)` = `` `${geo.lat},${geo.lon}` ``.
  - `placesOf(offers)` → `Place<T>[]` `{ key, geo, names, district?, address, offers }`, gebündelt nach **Koordinate**. Zwei Anbieter im selben Haus teilen sich einen Marker. `names` ohne Dubletten in Reihenfolge des Auftretens.
  - Generisch über `T extends { venue: { name; address; district?; geo } }`.
  - `sortPlaces(places, origin?)`: mit Startpunkt nach `compareReach`, sonst bzw. bei Gleichstand nach `names[0]` (`localeCompare(…, "de")`).
- Die Karte zeigt die Orte von `views.visible`, also nach Filtern, Altersregel samt „trotzdem zeigen“ und Umkreis.

> **Geändert durch Plan 0021:** „trotzdem zeigen“ ist der Altersschalter im Filter-Sheet; der Leerzustand der Orts-Liste bietet „Auch unpassende zeigen“.

- **Marker als WebGL-Layer**, nicht als DOM-Marker. 44-px-Knöpfe für 76 Orte überlappen in der Stadtansicht, und die zugängliche Bedienung übernimmt die Orts-Liste.
  - GeoJSON-Quelle `orte` mit `cluster: true`, `clusterRadius: 40`, `clusterMaxZoom: 14`, `clusterProperties: { angebote: ["+", ["get", "angebote"]] }`.
  - Layer `orte-cluster` (Kreis 18 px) mit `orte-cluster-zahl`.
  - Layer `orte-punkt` (Kreis 14 px) mit `orte-punkt-zahl`.
  - Schrift `["Noto Sans Regular"]` (in beiden OpenFreeMap-Stilen vorhanden).
  - Feature-Properties `{ key, angebote }`, Koordinaten `[lon, lat]`. Die reine Umwandlung ist `placesToFeatures` in `src/ui/map/geojson.ts` (mit Test).
- **Tippen** (`click`):
  - `queryRenderedFeatures` in einem Rechteck von ±22 px um den Tipp-Punkt (effektiv 44 px) auf `orte-cluster` und `orte-punkt`. Es gewinnt der nächstgelegene Mittelpunkt.
  - Cluster: `getClusterExpansionZoom` + `easeTo`. Das ist erlaubt, weil der Zielpunkt öffentlich ist (ein Cluster von Orten).
  - Ort mit einem Angebot: Detail.
  - Sonst: Orts-Sheet.
  - Desktop: Über einem Feature zeigt der Mauszeiger `pointer`.
- **Orts-Sheet** (`src/ui/PlaceSheet.tsx`, Startbundle, `Dialog` mit `className="sheet"`):
  - `h2` `names.join(" / ")`, darunter Adresse und mit Startpunkt `distanceLong`.
  - Dann die Angebote als `OfferCard` mit Datum (`dated`), sortiert nach dem nächsten Termin (`nextSession`).
  - Fuß: „Schließen“.
  - Eine Kachel öffnet das Detail über dem Sheet. Schließt man das Detail, ist man wieder im Sheet.
- Den **Startpunkt** zeichnet die eigene Quelle `startpunkt` (Kreis 7 px, Rand 4 px), nur wenn er gesetzt ist.

### E7 – Bedienbarkeit: Die Karte ergänzt, die Liste bleibt die Hauptansicht

- Kartenrahmen `.map-box`: volle Spaltenbreite, `height: clamp(240px, 60dvh, 544px)`, Stickerheft-Rahmen (2 px `--line`, harter Schatten).
  - Die Höhe steht bewusst in px und `dvh`, nicht in `rem`. Bei 200 % Textgröße würde eine rem-Karte sonst den Bildschirm füllen. Im Querformat (412 px Höhe) sind es ca. 247 px.
  - Dieselbe Box ist Platzhalter beim Laden (CLS).
- `cooperativeGestures: true`: Auf dem Handy bewegen zwei Finger die Karte, ein Finger scrollt die Seite. Am Desktop zoomt Strg/⌘ + Scrollrad.
- `NavigationControl({ showCompass: false })`, Knöpfe 44 × 44 px (E4).
- Deutsche Texte über `locale`; die Schlüssel kommen aus MapLibres `defaultLocale`:
  - `"Map.Title": "Karte der Orte"`
  - `"NavigationControl.ZoomIn": "Hineinzoomen"`, `"NavigationControl.ZoomOut": "Herauszoomen"`
  - `"CooperativeGesturesHandler.WindowsHelpText": "Zum Zoomen Strg + Scrollen"`, `"CooperativeGesturesHandler.MacHelpText": "Zum Zoomen ⌘ + Scrollen"`
  - `"CooperativeGesturesHandler.MobileHelpText": "Mit zwei Fingern bewegen"`
  - übrige Schlüssel sinngemäß
- **Tastatur**: Die Kartenfläche ist fokussierbar (Pfeile, +/−) und hat einen sichtbaren Fokus (`.map-box .maplibregl-canvas:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px }`). Marker sind nicht fokussierbar.
- Unter der Karte, in dieser Reihenfolge:
  1. **Werkzeugzeile**: „Kartenmitte als Startpunkt“ (E8) und „Startpunkt: Gostenhof“ bzw. „Startpunkt wählen“. Der zweite Knopf öffnet das Kind-Sheet.
  2. Der OpenFreeMap-Satz (E4).
  3. **Orts-Liste** (`src/ui/PlaceList.tsx`): `h2` „Orte“, je Ort ein `button.place` (≥ 44 px) mit Name (fett), darunter „Stadtteil bzw. Adresse · 3 Angebote · 1,4 km“. Wirkt wie der Marker, sortiert nach `sortPlaces`.
- Orts-Liste, Statuszeile und der Knopf „Startpunkt …“ hängen nie an der Karte. Ohne WebGL, ohne Netz und ohne Chunk bleibt die Seite vollständig bedienbar.
- **Statuszeile** (einzige `role="status"`-Region) in der Kartenansicht: „**N** Angebote an **M** Orten“ (Singular „1 Angebot“, „1 Ort“). Mit Startpunkt folgt „· Entfernung als Luftlinie ab …“ (Plan 0004).

### E8 – Kartenmitte als Startpunkt

- `OriginSource` aus Plan 0004 bekommt den Wert `"karte"`, Label „Kartenmitte“, `originPhrase` → „ab der Kartenmitte“.
- Ein dezentes Fadenkreuz (CSS, `aria-hidden`, `pointer-events: none`) markiert die Mitte.
- „Kartenmitte als Startpunkt“ übernimmt `coarsen(map.getCenter())`. Liegt der Punkt außerhalb von `NUERNBERG_BBOX`, kommt der Toast „Die Kartenmitte liegt außerhalb von Nürnberg.“
- Speicherung wie beim Standort: **nur im Arbeitsspeicher** (Plan 0004, E3). **Ersetzt durch ADR 0017 / Plan 0016:** gerundet gespeichert.
- Der Knopf erscheint nur bei `data-state="bereit"`. Bei Fehler, ohne WebGL und beim Laden fehlt er.
- Warum kein „auf die Karte tippen“ (ADR 0005 nennt das als Fallback): Ein Tipp öffnet schon Marker. Die Kartenmitte ist auch mit Tastatur und Bildschirmleser bedienbar. Festgehalten in ADR 0008.

### E9 – Kamera und Privatsphäre (ADR 0008)

- **Die Karte fährt und zoomt nie auf einen Startpunkt aus Standort oder Kartenmitte.** Sie zeichnet ihn nur als lokalen GeoJSON-Layer, und der fordert keine Kacheln an. Damit verraten die Kachel-Requests den Standort nicht.
- Ausschnitt beim Öffnen:
  - immer `fitBounds` über **alle kommenden Orte**, unabhängig von Filtern, Alter und Startpunkt (außer Stadtteil-Zoom) (Innenabstand 32 px, `maxZoom: 14`). Umkreis und Altersregel verrieten sonst über die Kachelwahl Standort bzw. Geburtsdatum (Arch-Review B1, Arch-Review 2 m1). Reine Funktion `initialCamera` in `src/domain/camera.ts`;
  - ohne Orte: Hauptmarkt (49,454 / 11,077), Zoom 11;
  - **Ausnahme Stadtteil**: Ist der Startpunkt ein Stadtteil, zentriert die Karte beim Öffnen auf ihn (Zoom 13). Wird ein Stadtteil gewählt, während die Karte offen ist, fährt sie per `easeTo` hin.
- Der zuletzt gesehene Ausschnitt gilt für die Sitzung (Modul-Variable in `MapView.tsx`) und wird beim erneuten Öffnen wiederhergestellt. Er steht weder in der URL noch im Speicher.
- Ein Filterwechsel tauscht nur die Quelldaten und bewegt die Kamera nicht.
- Was Nutzer selbst verschieben, ist ihre Handlung (ADR 0008).

### E10 – Theme und Stilwechsel

- Stil hell: OpenFreeMap `positron`, dunkel: `dark`.
- **Wechsel**: `map.setStyle(styleUrl(dark), { diff: false })`.
  - Ohne `diff: false` vergleicht MapLibre die Stile, löst kein `style.load` aus und entfernt dabei die eigenen Quellen und Layer, die im neuen Stil fehlen.
  - Ein Handler `map.on("style.load", …)` (dauerhaft registriert, nicht `once`) ruft danach immer `addOwnLayers(map, readMapColors())` auf (`src/ui/map/layers.ts`). Der Handler gilt auch für den ersten Load.
- `readMapColors()` liest `--primary`, `--on-primary`, `--surface` und `--line` per `getComputedStyle(document.documentElement).getPropertyValue(…).trim()`.
  - Gelesen wird **im `style.load`-Handler**, nicht im Effekt auf `dark`: Effekte von Kind-Komponenten laufen vor dem Effekt in `App`/`useTheme`, der `data-theme` setzt. Im Effekt kämen also noch die alten Farben.
  - Ein leerer Wert ist ein Fehler im Test (siehe Tests).
- Farben:
  - Orte und Cluster: Füllung `--primary`, Rand 2 px `--surface`, Zahl `--on-primary`.
  - Startpunkt: Füllung `--surface`, Rand 4 px `--primary`.
- MapLibre-Bedienelemente bekommen Token-Farben für hell und dunkel (E4), damit axe den Kontrast in beiden Themes besteht.

### E11 – Reduzierte Bewegung

- Im Quelltext von 6.12.0 bestätigt (Ausgangslage): `easeTo`/`flyTo` ohne `essential: true` laufen bei `prefers-reduced-motion: reduce` mit `duration: 0`. Der Plan setzt `essential` deshalb **nie**.
- Die CSS-Übergänge aus `maplibre-gl.css` (z. B. der Zwei-Finger-Hinweis) fängt die bestehende `!important`-Regel in `motion.css` ab.
- `expectReducedMotion` läuft auf der Kartenansicht.

### E12 – Lade-, Fehler-, Leer- und Offline-Zustände

Orts-Liste, Statuszeile und der Knopf „Startpunkt …“ stehen immer da. `.map-box` trägt `data-state="laden" | "bereit" | "fehler"`; `bereit` gilt nach dem ersten `idle`.

| Zustand | Erkennung | Anzeige in `.map-box` |
|---|---|---|
| Karten-Code lädt | `import()` läuft | Platzhalter „Karte wird geladen …“ |
| Code nicht ladbar | `import()` wirft | „Die Karte konnte nicht geladen werden.“ + „Nochmal versuchen“, beim zweiten Fehlschlag „Seite neu laden“ (E2) |
| Kein WebGL | `new Map()` wirft oder `webglcontextcreationerror` | „Dein Browser kann die Karte nicht zeigen. Die Orte stehen unten in der Liste.“ |
| Stil/Kacheln nicht ladbar | `error` vor dem ersten `load` oder kein `load` nach 15 s | „Kartenbilder lassen sich gerade nicht laden. Die Orte stehen unten in der Liste.“ + „Nochmal versuchen“ (Karte neu aufbauen) |
| Einzelne Kachel fehlt nach `load` | `error` mit `tile` | nichts |
| Keine Orte | `places.length === 0` | Die Karte bleibt sichtbar, darunter der bestehende Leerzustand mit „Filter zurücksetzen“ |
| Offline | wie oben | wie oben |

- MapLibre-Fehler gehen nicht nach `console.error`: Der eigene `error`-Listener verhindert das Standard-Logging.
- In allen Fehlerzuständen fehlt „Kartenmitte als Startpunkt“ (E8).

### E13 – E2E: offline, deterministisch, Wächter mit gezielter Ausnahme

- **Optionen in `e2e/fixtures.ts`** (Playwright `option: true`):
  - `tiles: "verboten" | "mock"`, Standard `"verboten"`: Der Wächter bleibt wie heute.
  - Bei `"mock"`:
    - Eine Auto-Fixture leitet `https://tiles.openfreemap.org/**` per **`context.route`** um, nicht per `page.route`, damit auch Requests aus dem Worker abgefangen werden.
    - Ziel sind Dateien in `tests/fixtures/karte/`. Der Pfad wird mit `decodeURIComponent` aufgelöst (`Noto%20Sans%20Regular` → Ordner `Noto Sans Regular`). Unbekannte Pfade bekommen 404 und werden als Verstoß gesammelt.
    - Der Wächter lässt den Host nur durch, wenn **die Karte im DOM ist**: Für jeden Request an den Host wird `request.frame().evaluate(() => !!document.querySelector(".map-box"))` gesammelt und am Testende ausgewertet. Für Worker-Requests ohne Frame gilt der Zustand der Seite. Die Seiten-URL wäre als Kriterium zu schwach.
    - Jede Anfrage wird geprüft: kein Querystring, kein Fragment.
    - Die Kachel-Requests (`z/x/y`) werden mit Zeitstempel protokolliert (für den Kamera-Test).
  - `allowedConsoleErrors: RegExp[]`, Standard `[]`. Der `consoleGuard` prüft `` `${msg.location().url} ${msg.text()}` `` dagegen. Nur die Fehlertests setzen konkrete Muster:
    - `/^https:\/\/tiles\.openfreemap\.org\/\S+ Failed to load resource/` (Stil 503);
    - `/\/assets\/karte\/\S+ .*(ERR_FAILED|Failed to load|Failed to fetch dynamically imported module)/` (Chunk abgebrochen).
- **Fixtures** unter `tests/fixtures/karte/`, nie in `dist/`:
  - `positron.json` und `dark.json`: minimale Stile, **absichtlich verschieden**. Andere `background`-Layer-IDs und -Farben (hell `#e8f1ff` mit Layer `bg-hell`, dunkel `#0e1620` mit `bg-dunkel`), damit ein Stilwechsel real Layer tauscht.
    - Beide haben eine Vektorquelle `openmaptiles` mit `tiles: ["https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf"]`.
    - Beide haben `glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf"`.
  - Kachel-Mock: Jede `/planet/test/{z}/{x}/{y}.pbf` bekommt eine leere Antwort `200`, `application/x-protobuf`, das gilt als leere Vektorkachel. Wirft MapLibre bei leerem Puffer, wird einmalig eine minimale gültige Kachel als Fixture erzeugt; das wird in Schritt 2 geprüft und notiert.
  - `fonts/Noto Sans Regular/0-255.pbf`: einmalig von OpenFreeMap geladen (ca. 80 kB, OFL-1.1).
- **Test-Haken nur im E2E-Build**: `vite.config.ts` definiert `__E2E__` = (`ZWERGENPLAN_DATA === "fixture"`). Nur dann setzt `MapView` `window.__zpMap = map`. Damit finden Tests Marker-Positionen (`project`) und können zoomen. Im Deploy-Build entfernt Vite den Zweig, der Smoke-Test prüft dort `window.__zpMap === undefined`. Das ist eine begründete Ausnahme von „E2E ist Black-Box“ (Kommentar im Code, `docs/architecture.md`, Schritt 7).
- **Geolocation** wie in Plan 0004 (Berechtigung + `setGeolocation` bzw. Stub per `addInitScript`).
- **WebGL in CI**: Chromium headless rendert per SwiftShader, WebKit lief im Spike. Risiko und Ausweg stehen unten.

## Struktur

```
src/domain/
  places.ts (+test)       placeKey, placesOf, sortPlaces
  reach.ts                OriginSource + "karte" (Rest aus Plan 0004)
  route.ts (+test)        + Tab „karte“, tabSection
src/data/
  tiles.ts (+test)        TILE_ORIGIN, styleUrl, ATTRIBUTION, guardTileRequest
src/ui/
  MapPanel.tsx            Kartenrahmen, dynamischer Import + Retry, Zustände, Werkzeugzeile, Hinweis, PlaceList
  map-types.ts            Props-Typen der Karte (außerhalb von map/, wegen map-only-lazy)
  map/MapView.tsx         lazy: Instanz, Worker-URL, Events, Kamera-Regel, Stilwechsel, __zpMap (nur E2E)
  map/layers.ts           Quellen/Layer, readMapColors, addOwnLayers, locale
  map/geojson.ts (+test)  placesToFeatures
  map/map-overrides.css   MapLibre-Bedienelemente (nach maplibre-gl.css, höhere Spezifität)
  PlaceList.tsx  PlaceSheet.tsx
  Chrome.tsx              + Umschalter Liste|Karte, Tab-Leiste kennt „karte“
  App.tsx                 Kartenansicht, Orts-Sheet, Verdrahtung (Overlays ggf. nach Overlays.tsx)
  format.ts (+test)       + Statuszeile Karte, originPhrase „Kartenmitte“
  use-offer-views.ts (+test)  + places
  use-app-state.ts        useOrigin + setPoint(point, "karte")
  styles/map.css          .map-box, Platzhalter, Fadenkreuz, Werkzeugzeile, Orts-Liste (Start-CSS)
tests/fixtures/karte/     positron.json, dark.json, fonts/Noto Sans Regular/0-255.pbf
e2e/
  fixtures.ts             + Optionen tiles, allowedConsoleErrors; Kachel-Mock; Kachel-Protokoll
  karte.spec.ts           Karte, Orte, Sheet, Filter, Theme, Fehler, Kamera-Regel
  mobile-ux.spec.ts       + karte, orts-sheet
  smoke.spec.ts           + Karte mit echten Daten (Mock), kein __zpMap
vite.config.ts            worker.format es, Ausgabe assets/karte/, __E2E__
.size-limit.json          + Karte JS (lazy), Karte CSS (lazy)
.dependency-cruiser.cjs   + maplibre-only-in-map, map-only-lazy
```

Alle Dateien bleiben unter ~250 Zeilen. `App.tsx` (240 Zeilen) bekommt nur `<MapPanel …/>` und `<PlaceSheetDialog …/>`. Reicht das nicht, wandern die Overlays nach `src/ui/Overlays.tsx`.

## Tests

Test-first für die Domäne (Vitest, TZ `America/Los_Angeles`, Coverage ≥ 90 % in `src/domain`):

- **`places`**: zwei Anbieter mit gleicher Koordinate → ein Ort mit beiden Namen; gleicher Name an zwei Koordinaten → zwei Orte; `sortPlaces` mit und ohne Startpunkt, Gleichstand nach Name, „Ö“ nach „O“.
- **`route`**: `ansicht=karte` Round-Trip; `tabSection`.
- **`ui/map/geojson`**: Reihenfolge `[lon, lat]`, `angebote` je Ort, leere Liste.
- **`ui/format`**: Statuszeile Karte (Singular und Plural), „ab der Kartenmitte“.
- **`ui/use-offer-views`**: `places` folgt `visible` (Filter, Alter, Umkreis).
- **`data/tiles`**: `guardTileRequest`
  - lässt die echten URL-Formen durch: Stil, TileJSON `/planet`, Kachel, Glyphen mit `%20`, Sprite `.json`/`.png`/`@2x`;
  - wirft bei fremdem Host, `http:`, Querystring und Fragment;
  - reicht `blob:` und `data:` durch.

E2E, `karte.spec.ts` (`test.use({ tiles: "mock" })` außer Test 1):

1. **Startseite** (Wächter „verboten“): nichts aus `assets/karte/` geladen, kein Request an OpenFreeMap.
2. **Umschalter „Karte“**:
   - URL `ansicht=karte`, `.map-box[data-state="bereit"]`;
   - Orts-Liste mit 5 Orten, Attribution sichtbar;
   - mindestens ein Kachel-Request aus dem Worker wurde vom Mock bedient (beweist, dass `context.route` greift);
   - Neuladen behält die Karte;
   - Tab „Kalender“ und zurück zu „Entdecken“ → Liste (Nutzerentscheidung 5).
3. **Schnellfilter „Kurse“**: Orts-Liste und Statuszeile ändern sich, URL `format=kurs&ansicht=karte`.
4. **Orts-Liste**: „Familientreff Beispielhof“ öffnet das Orts-Sheet; eine Kachel öffnet das Detail; `page.goBack()` führt zurück ins Sheet.
5. **Ort mit einem Angebot** (Bibliothek) öffnet direkt das Detail.
6. **Marker-Tipp** über `__zpMap.project` öffnet das Orts-Sheet. Bei Zoom 10 (`__zpMap.jumpTo`) erhöht ein Tipp auf den Cluster den Zoom.
7. **Stilwechsel (Blocker B1)**: Header-Knopf auf Dunkel.
   - Request `/styles/dark`, `__zpMap.getLayer("orte-punkt")` existiert, `getLayer("bg-dunkel")` existiert.
   - Der Kreis hat die dunkle `--primary`-Farbe (`getPaintProperty("orte-punkt", "circle-color")` gleich dem Token, nicht leer).
   - Ein Marker-Tipp öffnet weiter das Sheet. Danach zurück auf Hell, gleiche Prüfungen.
8. **Kamera-Regel (M4)**:
   - Karte `bereit`, Kachel-Protokoll merken.
   - Im Kind-Sheet „Meinen Standort nutzen“ (Berechtigung, Standort 49,45213 / 11,07672), dann „Kartenmitte als Startpunkt“.
   - Danach `idle` abwarten: **kein neuer Kachel-Request**, `__zpMap.getCenter()`/`getZoom()` unverändert, Startpunkt-Layer vorhanden.
   - Gegenprobe: Stadtteil „Langwasser“ wählen → Kamera fährt (Zentrum ändert sich).
9. **Stil 503** (`allowedConsoleErrors`): Fehlermeldung, Orts-Liste bedienbar, kein Knopf „Kartenmitte“. „Nochmal versuchen“ mit funktionierendem Mock → `bereit`.
10. **Kein WebGL** (`addInitScript`: `getContext("webgl"/"webgl2")` → `null`): Meldung, Orts-Liste da, kein Knopf „Kartenmitte“.
11. **Chunk nicht ladbar**, in Chromium und WebKit:
    - `context.route("**/assets/karte/**", r => r.abort())` → Meldung „konnte nicht geladen werden“.
    - Dann `unroute` und „Nochmal versuchen“.
    - Erscheint „Seite neu laden“ (Browser hat den Fehlschlag gecacht), wird er geklickt.
    - Ende: `data-state="bereit"`, URL hat `ansicht=karte`.

Außerdem:
- `mobile-ux.spec.ts`: Gates hell und dunkel für `karte` (bereit, mit Stadtteil als Startpunkt) und `orts-sheet`. 320 px / 200 % für beide. Fokusprüfung (Desktop) auf der Karte: Kartenfläche, Zoom-Knöpfe, Attribution-Links, Werkzeugzeile, Orts-Liste. `expectReducedMotion` auf der Karte.
- `smoke.spec.ts` (echte Daten, Mock): Karte `bereit`, Orts-Liste mit ≥ 50 Orten, Gates und 320 px / 200 % bestehen, `window.__zpMap` ist `undefined`.
- `scripts/screenshots.ts`: Ansichten `karte` und `ort` (lokal mit Mock über `context.route`, live echt).

## Backpressure

Keine Schwelle wird gesenkt. Neu bzw. geändert:

- `.size-limit.json`: zwei Karten-Zeilen; die Startbudgets bleiben und werden nach Schritt 2 und 5 gemessen.
- `.dependency-cruiser.cjs`: `maplibre-only-in-map`, `map-only-lazy`, beide mit Kanarienvogel.
- `e2e/fixtures.ts`:
  - Der Wächter bleibt standardmäßig scharf. Die Ausnahme ist an eine Test-Option, einen Host und die Karte im DOM gebunden, und jede Anfrage wird geprüft.
  - `allowedConsoleErrors` ist Opt-in je Test, mit konkretem Muster gegen URL und Text, nie global.
- `__E2E__`: begründet in E13; die Abwesenheit im Deploy-Build beweist der Smoke-Test.
- knip: Löst knip `…?worker&url` nicht auf, kommt die engste mögliche Ausnahme für genau diesen Spezifizierer, mit Begründung in `knip.json` und im Commit.
- `docs/architecture.md` (Schritt 7):
  - Privatsphäre-Invariante: „… außer Kartenkacheln von `tiles.openfreemap.org`, nur bei offener Karte; die Karte zentriert nie auf Standort oder Kartenmitte (ADR 0008).“
  - Schichten-Regeln: `maplibre-only-in-map`, `map-only-lazy`.
  - E2E-Abschnitt: Ausnahme `__E2E__`.
  - Mobile-UX-Gates: „Die Karte ist eine Ergänzung; jede ihrer Funktionen hat einen Weg ohne Karte (Orts-Liste).“
- ADR 0001: Die Stack-Zeile zu MapLibre/OpenFreeMap verweist auf ADR 0008.

## Schritte

0. **Voraussetzung**: Plan 0004 ist auf `main` und live.
1. Plan + ADR-0008-Entwurf, `/plan-review`, Review einarbeiten (erledigt, siehe unten).
2. **Gerüst und Gates zuerst** (eigener Branch im Worktree, `pnpm install`):
   - `pnpm add -E maplibre-gl@6.12.0`;
   - `vite.config.ts` (E2, `__E2E__`);
   - minimale `MapView`/`MapPanel` mit dynamischem Import;
   - Budget-Zeilen, dependency-cruiser-Regeln samt Kanarienvögeln;
   - leere Vektorkachel im Mock prüfen (E13).
   - `pnpm build && pnpm size`: **Startbundle messen**, notieren. `pnpm check:fast` grün.
3. **Domäne test-first**: `places` → `route` (`karte`, `tabSection`) → `OriginSource` „karte“.
4. **`src/data/tiles.ts`** test-first.
5. **UI**, nach jedem Block `pnpm check:fast` grün:
   1. Umschalter + Route;
   2. `MapView` (Layer, Tippen, Kamera-Regel, Stilwechsel mit `diff: false`);
   3. `PlaceList`, `PlaceSheet`;
   4. Kartenmitte;
   5. Zustände inkl. Retry;
   6. CSS (`map.css`, `map-overrides.css`).
   Danach **Startbundle erneut messen**, notieren.
6. **E2E**: Fixtures, `karte.spec.ts`, `mobile-ux.spec.ts`, `smoke.spec.ts`, Screenshots. `pnpm check` komplett grün inkl. WebKit.
7. **Doku**: `docs/architecture.md` (siehe Backpressure), ADR 0001, ADR 0008 auf „angenommen“, ADR 0005 Hinweis „Fallback ‚auf die Karte tippen‘ → Kartenmitte, siehe ADR 0008“, `docs/ideas.md` (Nicht-Ziele + PMTiles-Selbsthosting als Ausweichweg).
8. **`/arch-review`** (Pflicht: neue Abhängigkeit, neue Module). Befunde einarbeiten, hier anhängen.
9. **Commit und Push** auf den Branch, CI grün (`gh run watch`). Fast-Forward nach `main`, CI auf `main` grün, Deploy.
10. **`/browser-review live`**, jede Zeile der Checkliste beantworten, besonders:
    - Netzwerk: in der Liste kein Request an OpenFreeMap; in der Karte nur `tiles.openfreemap.org` ohne Querystring, **auch die Worker-Requests**; nach „Meinen Standort nutzen“ keine neuen Kacheln.
    - Zwei-Finger-Hinweis, dunkler Stil nach Theme-Wechsel mit Markern, Attribution genau einmal.
    - Querformat und 200 %.
    - Zeit vom Tipp auf „Karte“ bis zu den ersten Kacheln auf „Fast 4G“ (gedrosselt) und auf einem echten Handy.
    Ergebnis hier anhängen.

## Akzeptanzkriterien

- Umschalter, Karte mit Cluster- und Ort-Markern, Orts-Sheet, Orts-Liste, Kartenmitte als Startpunkt und Stilwechsel mit erhaltenen Markern: umgesetzt und per E2E abgedeckt.
- Karte und Orts-Sheet bestehen `expectMobileUx` hell und dunkel, dazu 320 px / 200 %, Fokus und `expectReducedMotion`.
- `pnpm check` grün, CI grün auf `main`. Budgets: JS (initial) ≤ 90 kB, CSS ≤ 15 kB, Karte JS ≤ 450 kB, Karte CSS ≤ 12 kB; Messwerte nach Schritt 2 und 5 notiert.
- Privatsphäre, durch E2E belegt:
  - Startseite ohne Karten-Code und ohne OpenFreeMap-Request.
  - Requests an OpenFreeMap nur bei offener Karte und ohne Querystring.
  - Kein Kachel-Request und keine Kamerafahrt nach dem Setzen von Standort oder Kartenmitte.
- Ohne WebGL, ohne Kacheln und ohne Karten-Chunk bleibt die Seite bedienbar.
- Browser-Review live abgeschlossen: erste Kacheln auf „Fast 4G“ ≤ 4 s nach dem Tipp, sonst Variante B als Folgeaufgabe.
- ADR 0008 angenommen; `docs/architecture.md`, ADR 0001, ADR 0005 und `docs/ideas.md` nachgeführt.

## Risiken

- **Startbudget**: +3,5–5 kB geschätzt. Gemessen nach Schritt 2 und 5. Ausweg ist Verschlanken, kein Budget-Ausweg über Lazy-Laden der Orts-Liste (E3).
- **Brandneue MapLibre-Version** (6.12.0 vom 2026-10-03): exakt gepinnt, im Spike geprüft. Bei Problemen 6.11.2.
- **Vite 8 / rolldown-Optionen** können sich ändern. Abgesichert durch die Budget-Zeilen.
- **WebGL in CI** (WebKit/Linux): Fehlt es dort, würden die Render-Tests rot. Ausweg: `test.skip(browserName === "webkit" && !!process.env.CI, "<Begründung>")` nur für Render-Fälle, mit schriftlicher Begründung im Code und im Commit (CLAUDE.md). Fehler- und Listentests laufen weiter in WebKit, der Browser-Review prüft ein echtes iPhone.
- **Worker-Requests und Routing**: Greift `context.route` in einem Browser nicht für Worker-Fetches, schlägt Test 2 fehl, statt still echtes Netz zu nutzen. Ausweg: den Stil im Test ohne Vektorquelle liefern und den Fall im Browser-Review prüfen.
- **OpenFreeMap ohne SLA**: Ausfall = Fehlerzustand mit Orts-Liste. Ausweichweg PMTiles (ADR 0008).
- **axe auf MapLibre-DOM**: Behoben wird per CSS und `locale`, nicht per axe-Ausnahme.
- **Ladezeit** auf schwachem Mobilnetz: Akzeptanzkriterium mit Messung, Variante B als vorbereiteter Ausweg.

## Review (unabhängiger Subagent `plan-reviewer`, 2026-10-04) – Verdict: „Freigabe mit Änderungen“ → eingearbeitet

Der Review lief auf dem gemeinsamen Entwurf `0004-karte-luftlinie.md`. Hier stehen die Karten-Befunde, die Entfernungs-Befunde in Plan 0004.

Blocker:
- **B1** `setStyle` mit Diff, kein `style.load`, eigene Layer weg → `setStyle(url, { diff: false })` und ein dauerhafter `style.load`-Handler mit `addOwnLayers` (E10). Test 7 prüft `getLayer("orte-punkt")`, die Farbe und den Marker-Tipp nach jedem Wechsel. Die Fixture-Stile unterscheiden sich in den Layern (E13).

Wichtig:
- **M1** `allowedConsoleErrors` prüft `` `${msg.location().url} ${msg.text()}` ``, mit eigenem Muster für `assets/karte/…ERR_FAILED` (E13).
- **M2** Chunk-Retry: zweiter Fehlschlag → „Seite neu laden“; `vite:preloadError` bewusst nicht unterdrückt (E2). Test 11 mit abort → unroute → Retry → `bereit`, Chromium und WebKit.
- **M3** Ausweg „Orts-Liste in den Karten-Chunk“ gestrichen; Preload-Helfer in der Schätzung; Messung nach Schritt 2 und 5 (E3). Der `stadtteile.json`-Ausweg mit Speicherregel steht in Plan 0004.
- **M4** Kamera-Regel: nie auf Standort oder Kartenmitte fahren, nur zeichnen; `fitBounds` über die Orte, Zoom auf den Startpunkt nur beim Stadtteil (E9, ADR 0008). `forbiddenInRequests` ersetzt durch „kein neuer Kachel-Request, Kamera unverändert“ (Test 8).
- **M5** ADR 0008 hat den Abschnitt „Alternativen“ mit gemessenem PMTiles-Extrakt: Stadt z0–15 19 MB, z0–14 9,6 MB, ganze BBOX 37 MB; Range-Requests auf Pages geben 206; +16 kB JS; Glyphen und Sprites selbst hosten; Aktualisierung per CI. Begründet verworfen und als Ausweichweg festgehalten. Ein eigener Messschritt entfällt, weil gemessen ist.
- **M6** Attribution-Links inline mit `padding-block` ≥ 24 px; Overrides in `map-overrides.css` nach `maplibre-gl.css` und mit höherer Spezifität; `.map-box`, Orts-Liste und Werkzeugzeile im Start-CSS (E4).
- **M7** Scope-Schnitt in Plan 0004 (Entfernung) und 0005 (Karte), Entscheidungen neu nummeriert, Querverweise angepasst.

Nutzerentscheidungen: Variante A (E1), Startansicht immer Liste ohne Gedächtnis (E5, Test 2). Standort nur im Arbeitsspeicher, Umkreis-Stufen und kurze Stadtteil-Liste: Plan 0004.

Minor:
1. `easeTo` ohne `essential` → `duration 0` bei reduzierter Bewegung, im Quelltext bestätigt und festgehalten (E11, Ausgangslage).
2. `coarsen`-Verfahren und Testwerte: Plan 0004.
3. Wächter-Ausnahme an `.map-box` im DOM statt an der URL (E13).
4. `test.use({ tiles: "mock" })` für alle Kartentests inkl. Kamera-Test 8 (der frühere Startpunkt-Test 4 ist jetzt hier).
5. Worker-Requests: `context.route`, Test 2 beweist das Abfangen, Browser-Review prüft ausdrücklich. Der Glyphen-Mock dekodiert `%20` (E13).
6. „Kartenmitte“-Knopf nur bei `bereit` (E8, Tests 9 und 10).
7. `readMapColors` mit `.trim()`, gelesen im `style.load`-Handler nach dem Theme-Effekt (E10).
8. `architecture.md`-Anpassungen (Wächter, `__E2E__`, Schichtregeln) als Schritt 7. Geolocation in `src/data` steht in Plan 0004.
9. ADR 0005 „auf die Karte tippen“ vs. Kartenmitte ist in ADR 0008 benannt, ADR 0005 bekommt einen Hinweis (Schritt 7).
10. `?umkreis` ohne Startpunkt zählt nicht: Plan 0004.
11. Kartenhöhe `clamp(240px, 60dvh, 544px)`, px statt rem wegen 200 % (E7).
12. Referrer-Policy abgewogen und in ADR 0008 begründet.
13. Fixture-Stile mit Vektorquelle, damit das Kachel-Protokoll aussagekräftig ist (E13).

## Umsetzung (2026-10-04)

Branch `karte-0005`, Commits `981b3e7` (Schritt 2) bis `3e43840` (Schritt 7), dazu die Nacharbeit zum Arch-Review.

Messwerte (`pnpm build && pnpm size`, echte Daten, gzip):

| | vorher | nach Schritt 2 | nach Schritt 5 | nach Rebase auf `entfernung-0004` | nach Karten-Oberflächen-Chunk | Budget |
|---|---|---|---|---|---|---|
| JS (initial) | 85,67 kB | 86,62 kB | 87,94 kB | 88,46 kB (Basis 85,92) | **87,35 kB** (+1,43 ggü. Basis) | 90 kB |
| CSS | 8,75 kB | 8,80 kB | 9,04 kB | 9,94 kB | 10,01 kB | 15 kB |
| Karte JS (lazy) | – | 419,94 kB | 423,09 kB | 423,06 kB | 425,15 kB (MapView 276,9 + Worker 144,7 + Oberfläche 2,1) | 450 kB |
| Karte CSS (lazy) | – | 10,38 kB | 10,66 kB | 10,66 kB | 10,66 kB | 12 kB |

Kanarienvögel (je einzeln eingesetzt, `pnpm arch` rot, wieder entfernt): statischer und reiner Typ-Import von `./map/MapView.tsx` in `App.tsx` → `map-only-lazy`; `import "maplibre-gl"` und `import type` daraus in `App.tsx` sowie `import "maplibre-gl"` in `src/data/tiles.ts` → `maplibre-only-in-map`. Leere Vektorkachel (E13): 200 mit leerem Body gilt in Chromium und WebKit als leere Kachel, keine Konsolenmeldung.

Abweichungen und Befunde:
- dependency-cruiser löste `maplibre-gl` zunächst nicht auf (nur Export-Bedingung `import`): `exportsFields`/`conditionNames` in `enhancedResolveOptions`, die Regel prüft zusätzlich den Paketnamen.
- `tiles.ts` liegt im Karten-Chunk, nicht im Startbundle (nur `MapView` nutzt es).
- Drehen und Neigen sind aus: Ohne Kompass gäbe es keinen Weg zurück nach Norden.
- `maplibre-gl.css` ist ungeschichtet und schlägt `@layer components`; alles zu MapLibre-Elementen (auch `.map-canvas`) steht ungeschichtet in `map-overrides.css`.
- Vite schreibt `import(…).then(ok, fail)` so um, dass die Handler am rohen Import im Preload-Helfer hängen; ein fehlendes Karten-CSS gab dann eine unbehandelte Ablehnung. `MapPanel` lädt über die async-Funktion `loadMapView`.
- WebKit (Playwright 1.63) lädt ein fehlgeschlagenes Modul-Skript in derselben Seite nie wieder, auch nicht nach `reload()`; Test 11 prüft dort in einem neuen Tab. Echtes iPhone: Browser-Review.
- Leerzustand `NoOffers` aus `ListView` herausgezogen und von Liste und Karte genutzt; `ViewToggle` an `Chrome.tsx` angehängt, `TabBar` unverändert (bekommt `tabSection`).
- **Orts-Liste nicht mehr im Startbundle (E3, nach dem Rebase):** Ladekette `MapPanel` (Start: Platzhalter in Kartenhöhe, Lader) → `src/ui/karte/` (eigener Lazy-Chunk ohne MapLibre: Zustände, Werkzeugzeile, Orts-Liste, Orts-Sheet, `map-data.ts` mit `placesOf`/`sortPlaces`/`initialCamera`) → `src/ui/map/`. Ohne WebGL, ohne Kacheln und ohne MapLibre-Chunk bleibt die Orts-Liste bedienbar; fällt auch die Karten-Oberfläche aus, verweist die Meldung auf den Umschalter „Liste“. Der gestrichene Ausweg „Orts-Liste in den Karten-Chunk“ bleibt gestrichen, denn MapLibre lädt weiter getrennt. Das spart gegenüber dem Rebase-Stand 1,1 kB Start-JS (siehe Tabelle); `useOfferViews` liefert nur noch `map.placeCount` und `map.cameraOffers`.
- **Neue Architekturregeln:** `karte-ui-only-lazy`, `karte-ui-entry-only`, `map-entry-only` und die Lader-Prüfung `lazy-loader-static` in `scripts/check-architecture.ts`, weil dependency-cruiser statischen und dynamischen Import desselben Moduls zu einer Kante zusammenfasst (nur `dynamic-import` bleibt). Kanarienvögel, je eingesetzt, rot und zurückgebaut:
  - `karte-ui-only-lazy`: statischer Import und reiner Typ-Import von `./karte/MapScreen.tsx` in `App.tsx`; statischer Import von `../karte/PlaceList.tsx` in `map/MapView.tsx`.
  - `karte-ui-entry-only`: dynamischer Import von `./karte/MapScreen.tsx` in `Overlays.tsx`.
  - `map-entry-only`: dynamischer Import von `../map/MapView.tsx` in `karte/PlaceList.tsx`.
  - `lazy-loader-static`: zusätzlicher statischer Import von `../map/MapView.tsx` in `karte/MapScreen.tsx` (dependency-cruiser allein blieb hier grün); nach Arch-Review 2 auch Seiteneffekt-Importe ohne `from` (`import "./karte/MapScreen.tsx";` in `MapPanel.tsx`, `import "../map/MapView.tsx";` in `MapScreen.tsx`).
  - `maplibre-only-in-map`: `import "maplibre-gl"` in `karte/PlaceList.tsx`.
- **Source-Maps bleiben `sourcemap: true` (bewusst):** Im Repo hängt nichts daran, die Budgets zählen nur `*.js`. Der Browser-Review live nutzt aber DevTools mit lesbaren Stacktraces, und Browser laden Maps nur bei offenen DevTools. `"hidden"` veröffentlichte die Dateien trotzdem, nur ohne Verweis, und brächte keinen Datenschutzgewinn (Quellcode ist öffentlich).
- **`modulePreload.polyfill` aus:** Ziel es2023, ohne natives modulepreload wird nur nicht vorgeladen. Vites Preload-Helfer (ca. 0,5 kB) bleibt im Start, weil er auch den Import der Karten-Oberfläche umhüllt.
- **Umschalter neben der Statuszeile (E5):** Statt darüber steht er rechts neben ihr (`.status-row`, `flex-wrap`, bei wenig Platz bzw. 200 % darunter) und ist kompakt (44 px). Mit eigener Zeile hatte die erste Kachel im Querformat 852×393 nur 68 statt der geforderten 80 px frei (layout.spec, Plan 0007).
- **Stilwechsel-Test über das Kind-Sheet:** Der Theme-Knopf im Kopf entfällt bei 360 px (Plan 0007).
- **Kartenmitte im `originReducer`** (Aktion `mapCenter`, Plan 0004 Arch-Review m1), mit Test.
- `App.tsx`: Overlays nach `src/ui/Overlays.tsx`, 296 Zeilen (vor Plan 0005: 280).
- **Querformat:** Mit der Seitenleiste aus Plan 0007 liegt die Karte nicht mehr unter einer Tab-Leiste.
- **Hotfix Attribution (Browser-Review live, W1; weicht von E4 ab):** Die Pflicht-Attribution kommt jetzt nur noch aus der TileJSON von OpenFreeMap (`/planet`: OpenFreeMap, © OpenMapTiles, OpenStreetMap, je verlinkt). Die eigene `customAttribution` stand zeichenverschieden daneben und damit doppelt, `ATTRIBUTION` in `tiles.ts` entfällt. Statt `compact: false` gilt MapLibres Standard: Auf Karten ≤ 640 px steht die Attribution beim Öffnen ausgeschrieben, klappt nach dem ersten Verschieben zum Info-Knopf (44 × 44 px) ein und lässt sich per Tipp wieder öffnen. Bei 320 px / 200 % belegt sie anfangs 152 statt 216 px, danach 44 px. Die Fixtures liefern die TileJSON mit der echten Attribution (`tests/fixtures/karte/planet.json`), E2E prüft „genau einmal, mit OpenStreetMap-Link“.
- E2E: `MAP_READY` (20 s bis `bereit`, Software-WebGL unter Parallellast), Wächter und Kachel-Protokoll in einer Fixture, zusätzlicher Test „Wächter: Querystring/fremder Host verlassen den Browser nicht, auch nicht aus dem Worker“. Worker-Kacheln belegt über das Resource-Timing des Workers (Test 2).

## Arch-Review (2026-10-04) – Verdict: Nacharbeit nötig → eingearbeitet

- **B1 (Blocker, Privatsphäre)**: Der Startausschnitt war `fitBounds` über `places` aus `visible`, also nach dem Umkreis um einen Standort gefiltert. Liste → „Meinen Standort nutzen“ → „bis 2 km“ → Karte zeigte die Orte um den GPS-Punkt, die Kachel-Requests verrieten die Gegend. Behoben:
  - `initialCamera(points, origin)` in `src/domain/camera.ts` (rein, getestet): vom Startpunkt zählt nur `source === "stadtteil"`; sonst Orte bzw. Hauptmarkt.
  - `useOfferViews().startCamera` filtert dafür ohne Startpunkt (der Umkreis wirkt so nicht), mit denselben übrigen Filtern und derselben Altersregel; `MapView` bekommt nur noch `start` und schaut für den Ausschnitt nicht auf Orte oder Startpunkt.
  - Weitere Wege geprüft: Filterwechsel tauscht nur Daten, `easeTo` nur bei Stadtteil und Cluster-Tipp, `sortPlaces` betrifft nur die Liste.
  - Tests: `camera.test.ts` (Standort und Kartenmitte = ohne Startpunkt), `use-offer-views.test.ts` (Standort + 2 km = ohne Startpunkt), E2E „Startausschnitt verrät den Standort nicht“ (Kamera und Kachel-Requests identisch; vor dem Fix rot).
  - ADR 0008, E9 und `docs/architecture.md` präzisiert: „über die Orte ohne Umkreis-Filter“.
- **m1**: Status, Messwerte, Kanarienvögel und Umsetzung hier nachgetragen.
- **m2**: `thirdPartyGuard` nahm `tiles.openfreemap.org` ganz aus. Jetzt muss jeder Kontext-Request an den Host von einem Mock-Handler beantwortet sein (Set der bedienten URLs); Tests mit eigenen Antworten nutzen `routeTiles`. Kanarienvogel: ohne Eintrag ins Set meldet der Wächter Stil und Worker-Kacheln als „nicht gemockt“.

## Arch-Review 2 (2026-10-05) – Verdict: OK → Minors eingearbeitet

- **m1 (Privatsphäre)**: Die Datenbasis des Startausschnitts (`cameraOffers`) hing an Filtern und am Geburtsdatum (Altersregel), die Kachelwahl also mittelbar am Geburtsdatum. Jetzt sind es alle kommenden Angebote, unabhängig von Filtern, Alter und Startpunkt (außer Stadtteil-Zoom). Test-first in `use-offer-views.test.ts` (Umkreis mit Standort bzw. Kartenmitte, Filter, Geburtsdatum und alles zusammen ändern `cameraOffers` nicht), das E2E „Startausschnitt verrät weder Standort noch Alter“ setzt zusätzlich Geburtsdatum und „Kurse“. ADR 0008, E9 und `docs/architecture.md` nachgeführt.
- **m2**: `lazy-loader-static` erkennt auch Seiteneffekt-Importe ohne `from`; Kanarienvögel siehe „Umsetzung“.
- **m3**: Die Prüfungen „kein Querystring/Fragment“ und „Karte im DOM“ laufen im Wrapper von `tileMock.route`, gelten also auch für Antworten aus `routeTiles`. Kanarienvogel (temporäre Spec): `routeTiles` bedient in der Listenansicht `…/kanarienvogel?x=1` → beide Verstöße rot.
- **m4**: `src/domain/place-key.ts` mit `placeKey` und `countPlaces` ist die einzige Quelle für „gleicher Ort“ (Statuszeile, Entfernungs-Cache, `placesOf`); Test `countPlaces(offers) === placesOf(offers).length`. `geoKey` entfällt. Eigenes Modul, damit `places.ts` im Karten-Oberflächen-Chunk bleibt.
- **m5**: Kopfkommentar `MapView.tsx` (lädt aus `karte/MapScreen.tsx`), Bezugszeile ADR 0008 „angenommen“, Kanarienvögel je Regel unter „Umsetzung“.
- **m6**: Gate-Ansicht `karte-fehler` (ohne WebGL) in `mobile-ux.spec.ts`, hell, dunkel, dunkel per Darstellung, 320 px / 200 %.
- **Hinweis Source-Maps**: geprüft und bewusst bei `true` gelassen (siehe „Umsetzung“).

## Browser-Review live (2026-10-05)

**Verdict: bestanden, kein Blocker.** Die Privatsphäre-Regeln aus ADR 0008 und E9 halten live. Das gilt auch für die Worker-Requests, den Referrer und die Kamera-Regel samt Kachel-Set. Offen ist **ein wichtiger Befund**: Die Attribution steht doppelt da (W1). Dazu kommen einige Hinweise.

- **Ziel**: https://zwergenplan.app/ mit echten Daten (333 Angebote, 76 Orte).
- **Stand**: `a682d4d`, gleich `origin/main`. Live-HTML `index-BTpp6E6l.js`, Worker `maplibre-gl-worker-BAEWVkqd.js`, Kachel-Version `planet/20260927_080001_pt`.
- **Methode**:
  - Playwright 1.63 gegen die Live-URL, Chromium headless mit `--use-angle=swiftshader --enable-unsafe-swiftshader`. `e2e/` setzt keine eigenen WebGL-Flags, Chromium läuft dort mit dem Standard-WebGL; beides rendert, mit den Flags fehlen nur die „GPU stall“-Warnungen. Gegenprobe in WebKit (iPhone 15).
  - Viewport 390×844 mit DPR 2, Touch, `de-DE`, Europe/Berlin.
  - Alle Requests über `context.on("request")` aufgezeichnet, Referrer über `request.allHeaders()`. Zusätzlich Resource-Timing in Seite und Worker (`page.workers()[i].evaluate(performance.getEntriesByType("resource"))`).
  - Drosselung per CDP `Network.emulateNetworkConditions`.
  - Screenshots mit `node scripts/screenshots.ts https://zwergenplan.app/ --views=start,karte,ort` und `--views=karte,ort --text=200`, nach `e2e/.artifacts/screens/`, dazu eigene Bilder unter `tmp/`. Alle angesehen.
  - Im Deploy-Build gibt es kein `window.__zpMap` (E13). Die Kamera wird deshalb als schwarzer Kasten belegt: über das angefragte Kachel-Set z/x/y, einen Fingerabdruck der Kartenmitte (Entfernungen der Orts-Liste ab „Kartenmitte als Startpunkt“) und Sichtvergleich.
  - claude-in-chrome kam nicht zum Einsatz, alles lief per Playwright.

### Checkliste (Skill)

- **Lesbarkeit**: Die Statuszeile „**333** Angebote an **76** Orten“ ist sofort erfassbar.
  - Die Zahlen auf Markern und Clustern sind gut lesbar: hell weiß auf Dunkelblau, dunkel dunkel auf Gelb. Auch dreistellige Zahlen (100, 119, 150) passen in den Kreis.
  - Die Orts-Liste ist klar gegliedert: Name fett, darunter „Stadtteil · N Angebote · Entfernung“.
  - Marker verdecken Kartenbeschriftungen, z. B. „Nuren…g“ unter „100“. Das ist vertretbar, die Marker sind die Hauptinfo.
  - Störend ist nur die doppelte Attribution (W1).
- **Daumen-Erreichbarkeit**:
  - Der Umschalter Liste|Karte (44 px) sitzt im oberen Drittel.
  - Werkzeugzeile („Kartenmitte als Startpunkt“ 236×44, „Startpunkt wählen“ 177×44) und Orts-Liste (Zeilen ≥ 68 px) liegen unter der Karte.
  - Die Zoom-Knöpfe (44×44) liegen oben rechts in der Karte. Das ist üblich, auf großen Handys aber weit oben.
  - Ein Finger scrollt die Seite, zwei bewegen die Karte. Die Abstände zwischen den Touch-Zielen reichen.
- **Zustände**: Laden, Fehler (Kacheln blockiert), ohne WebGL und lange Titel sind geprüft, nichts bricht.
  - Der Platzhalter „Karte wird geladen …“ hat dieselbe Höhe wie die fertige Karte (506 px), es gibt keinen Layout-Sprung.
  - Lange Ortsnamen im Orts-Sheet umbrechen sauber, z. B. „BRK Familienzentrum – Kreisverband Nürnberg-Stadt (Familienstützpunkt)“.
  - Den Leerzustand habe ich live nicht erzeugt, er ist per E2E abgedeckt.
- **Dark Mode**: Nach dem Theme-Wechsel kommt der Stil `dark`. Marker sind gelb, Zoom-Knöpfe und Attribution haben dunkle Token-Farben (Attribution-Hintergrund `rgb(27,39,51)`, Link `rgb(238,243,248)`). Grell weiße Inseln gibt es keine (`review-0005-karte-dunkel.png`, `karte-*-dark.png`, `ort-*-dark.png`).
- **Micro-Interactions**:
  - Der Zwei-Finger-Hinweis blendet ein und wieder aus.
  - Ein Tipp auf einen Cluster zoomt hinein, ein Tipp auf einen Ort öffnet Sheet oder Detail.
  - Den Pressed-State und die reduzierte Bewegung habe ich live nicht gesondert gemessen; das decken die E2E-Gates ab (`expectReducedMotion`). Die Screenshots liefen mit `reducedMotion: reduce`, Cluster-Sprünge dabei ohne Animation.
- **Konsistenz**:
  - Kartenrahmen im Stickerheft-Stil (2 px Linie, harter Schatten), Zoom-Knöpfe und Werkzeugknöpfe passen zum Design-System.
  - Die Attribution nutzt MapLibres Standardschrift (Helvetica/Arial), nicht die App-Schrift (H3).

### 1. Netzwerk in der Liste

- Startseite plus Scrollen, Detail öffnen und zurück: **5 Requests, alle an `zwergenplan.app`**. Das sind `/`, `/data/site.json`, `assets/index-<hash>.js`, `assets/index-<hash>.css` und die Schrift `bricolage-grotesque-…woff2`.
- **0** Requests an `openfreemap`, **0** an `assets/karte/`, **0** URLs mit `maplibre`.
- Das Start-JS `index-BTpp6E6l.js` (280 kB roh) enthält **0×** „maplibre“ und keinen Verweis auf `assets/karte/`.

### 2. Netzwerk in der Karte

Ablauf: Tipp auf „Karte“, einmal hinein- und herauszoomen, Theme dunkel, Theme hell. Das ergibt 31 Requests.

- **Hosts**: nur `zwergenplan.app` und `tiles.openfreemap.org`.
- **Querystring oder Fragment**: 0 von 31. Im Resource-Timing der Seite 0, im Resource-Timing des Workers 0.
- **Pfad-Muster** (Anzahl):
  - `zwergenplan.app/assets/karte/MapScreen-<hash>.js` (1), `…/MapView-<hash>.js` (1), `…/MapView-<hash>.css` (1), `…/maplibre-gl-worker-<hash>.js` (1)
  - `tiles.openfreemap.org/styles/positron` (2), `/styles/dark` (1)
  - `tiles.openfreemap.org/planet` (TileJSON, 3)
  - `tiles.openfreemap.org/planet/<version>/{z}/{x}/{y}.pbf` (10)
  - `tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.json` (3), `ofm@2x.png` (3)
  - `tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/{range}.pbf` (3), `fonts/Noto%20Sans%20Italic/{range}.pbf` (2)
- **Worker**: Das Resource-Timing des Workers `maplibre-gl-worker-BAEWVkqd.js` kennt **10 Einträge, alle `/planet/<version>/{z}/{x}/{y}.pbf`** auf `tiles.openfreemap.org`, ohne Querystring. Das sind genau die 10 Kachel-Requests im Kontext-Protokoll.
  - Der Worker lädt also nur die Vektorkacheln. Stil, TileJSON, Glyphen und Sprites holt in MapLibre 6.12 der Hauptthread (Resource-Timing der Seite).
  - Playwright meldet die Worker-Requests als `fetch` der Seite. Die Zuordnung zum Worker belegt deshalb das Resource-Timing.
- **Referrer**: Alle 27 Requests an OpenFreeMap tragen `referer: https://zwergenplan.app/`, also nur den Origin, ohne Pfad und ohne `?ansicht=karte`. Das gilt auch für die 10 Kachel-Requests aus dem Worker.
- **WebKit** (iPhone 15): Karte `bereit`, 8 Requests an OpenFreeMap, 0 mit Querystring, Hosts wieder nur die beiden.

### 3. Standort nicht verraten

Stub-Standort 49,40 / 11,15, am Südostrand bei Langwasser, Berechtigung erteilt.

| Schritt | Kachel-Requests | Kamera |
|---|---|---|
| a) Karte ohne Startpunkt | `10/543/349`, `10/543/350` | Ausgangslage (`k3a.png`) |
| b) neuer Kontext: Liste → „Meinen Standort nutzen“, Geburtsdatum 01.06.2025, „Kostenlos“, „bis 2 km“ (Liste: „2 Angebote ab heute“, URL `?kosten=kostenlos&umkreis=2`), dann erstmals „Karte“ | **`10/543/349`, `10/543/350`, identisch mit a)**. Vor dem Öffnen 0 Requests an OpenFreeMap. | Gleicher Ausschnitt wie a) (`k3b.png`). Statuszeile „2 Angebote an 2 Orten“, die Filter wirken nur auf die Marker. |
| c) bei offener Karte (Kontext a) „Startpunkt wählen“ → „Meinen Standort nutzen“ | **0 neue Requests** an OpenFreeMap | unverändert, nur der Startpunkt-Punkt kommt dazu (`k3c.png`) |
| d) „Kartenmitte als Startpunkt“ vor und nach c) | **0 neue Requests** | Fingerabdruck der Kartenmitte (die ersten 8 Orte mit Entfernung: BRK Familienzentrum 400 m, Geburtshaus 600 m …) vor und nach c) **identisch** → keine Kamerafahrt |
| e) Gegenprobe: Stadtteil „Langwasser“ | 9 neue: `11/1086–1087/699–700`, `12/2174/1399`, `13/4348–4349/2798–2799` | fährt auf Langwasser (Zoom 13, `k3e.png`), wie gewollt |

**Nachgerechnet**:
- Die beiden z10-Kacheln aus a) und b) decken 49,153–49,611 N und 10,898–11,250 E ab, also etwa 51 × 25 km und damit den ganzen Großraum Nürnberg. Der Standort liegt in `10/543/349`, die ohnehin jeder Besucher lädt. Die Requests sagen also nur: „jemand sieht sich Nürnberg an“.
- Erst ab z13 würde eine Kachel den Standort eingrenzen: `13/4349/2799` umfasst 49,382–49,411 N und 11,118–11,162 E, rund 3 × 3 km. Diese Kachel kam nur in e), weil ein öffentlicher Stadtteil gewählt wurde, der zufällig neben dem Stub liegt. In a) bis d) gab es keine Kachel über z10.

### 4. Ladezeit (Tipp auf „Karte“ → erste Kachel / `data-state="bereit"`)

Je Lauf ein neuer Kontext mit kaltem Cache. Gezählt ab dem Klick, die Startseite war schon geladen.

| | Lauf 1 | Lauf 2 | Lauf 3 |
|---|---|---|---|
| ungedrosselt, erste Kachel / bereit | 2185 / 2520 ms (kalter OFM-Cache, Stil 2,0 s) | 465 / 875 ms | 498 / 833 ms |
| „Fast 4G“, erste Kachel / bereit | 1604 / 2345 ms | 1597 / 2337 ms | 1615 / 2349 ms |

- „Fast 4G“ ist das DevTools-Preset: 9 Mbit/s ↓, 1,5 Mbit/s ↑, 60 ms RTT, mit den DevTools-Faktoren 0,9 bzw. ×2,75, also 165 ms Latenz.
- Unter „Fast 4G“ (Lauf 1) kommt das MapView-JS nach ca. 0,7 s, der Stil nach 1,0 s, das Worker-JS nach 1,1 s.
- Die Drosselung greift auch im Worker: Eine Kachel dauert gedrosselt 365–399 ms, ungedrosselt 51–68 ms.
- **Ziel aus E1 und den Akzeptanzkriterien (≤ 4 s bis zu den ersten Kacheln auf „Fast 4G“) erfüllt**, mit ca. 1,6 s. Variante B ist nicht nötig.
- Offen bleibt die Messung auf einem echten Handy (Schritt 10).

### 5. Bedienung

- **Marker und Cluster** (`review-0005-karte-hell.png`): Startausschnitt mit Clustern 1–119, die Zahlen sind gut lesbar.
- **Tippen**:
  - Ein Tipp auf einen Cluster („5“, „100“, „119“, „20“) zoomt hinein; es kommen neue z11-Kacheln, eine Nutzerhandlung.
  - Ein Ort mit einem Angebot („1“ bei Neunhof) öffnet direkt das Detail („Babyschwimmen 2 ab 8 Monaten …“, URL `?ansicht=karte&angebot=…`).
  - Ein Ort mit 2 Angeboten (nach drei Cluster-Tipps Richtung Langwasser) öffnet das **Orts-Sheet** „Hebamme Ewelina Kobielski (hebamme-nuernberg.de)“ mit 2 Kacheln (`k5-marker-sheet.png`).
- **Orts-Liste**: 76 Orte. Ein Ort mit 10 Angeboten öffnet das Orts-Sheet mit 10 Kacheln. Die kleinste Zeilenhöhe ist 68 px.
- **Gesten**:
  - Ein-Finger-Wischen über die Karte (CDP-Touch) zeigt „Mit zwei Fingern bewegen“ (`maplibregl-show`, Deckkraft 1) und scrollt die Seite (290 → 402 px), die Karte bleibt stehen (`k5-zweifinger.png`).
  - Am Desktop zeigt das Scrollrad „Zum Zoomen Strg + Scrollen“ (`k5-desktop-wheel.png`).
- **Attribution**: **steht doppelt da** (W1). Schrift 12 px, Links 26 px hoch (≥ 24), Linkfarbe `rgb(19,33,46)` auf Weiß, gut lesbar.
- **Zoom-Knöpfe**: 44 × 44 px, `aria-label` „Hineinzoomen“ bzw. „Herauszoomen“. Die Kartenfläche hat `aria-label` „Karte der Orte“ und `tabindex 0`.

### 6. Theme

- Der Kopf-Knopf „Dunkle Darstellung“ lädt `/styles/dark`. Marker und Cluster bleiben erhalten (gelb), Zoom-Knöpfe und Attribution werden dunkel (`review-0005-karte-dunkel.png`).
- Zurück auf „Hell“ wird `/styles/positron` geladen, die Marker bleiben.
- Konsole: nur `warning` aus dem OFM-Stil (`Image "wood-pattern" could not be loaded`), kein Fehler.

### 7. Zustände

- **OFM blockiert** (`context.route("https://tiles.openfreemap.org/**", abort)`), `k7-fehler.png`:
  - Nach 905 ms `data-state="fehler"` mit „Kartenbilder lassen sich gerade nicht laden. Die Orte stehen unten in der Liste.“ und dem Knopf „Nochmal versuchen“.
  - Kein Knopf „Kartenmitte als Startpunkt“, „Startpunkt wählen“ bleibt.
  - Orts-Liste mit 76 Orten; das Orts-Sheet öffnet.
  - Nach `unroute` führt „Nochmal versuchen“ zu `bereit`.
  - Konsole: nur `error: https://tiles.openfreemap.org/styles/positron Failed to load resource: net::ERR_FAILED`. Das ist die Netzwerkmeldung des Browsers und entspricht dem erlaubten Muster aus E13. MapLibre selbst loggt nichts.
- **Ohne WebGL** (`getContext("webgl"/"webgl2")` → `null`), `k7-ohne-webgl.png`:
  - „Dein Browser kann die Karte nicht zeigen. Die Orte stehen unten in der Liste.“
  - Orts-Liste mit 76 Orten, ein Ort mit 1 Angebot öffnet das Detail, keine „Kartenmitte“.
  - **0 Requests an OpenFreeMap**, Konsole leer.
- **Laden** (MapView-Chunk künstlich um 3 s verzögert): `data-state="laden"` mit „Karte wird geladen …“ in voller Kartenhöhe (506 px = Höhe bei `bereit`), also kein Layout-Sprung.

### 8. Layout

| Viewport | Karte (B × H) | horizontaler Überlauf | Bemerkung |
|---|---|---|---|
| 320×640 | 288 × 384 | nein | Attribution 54 px (3 Zeilen, wegen W1) |
| 390×844 | 358 × 506 | nein | Attribution 36 px (2 Zeilen, wegen W1) |
| 915×412 quer | 608 × 247 | nein | Seitenleiste links (106 px), Karte beginnt bei y = 266, nur ca. 146 px ohne Scrollen sichtbar (H4) |
| 320 / 200 % | 288 × 384 | nein | **Attribution 216 px von 384 px Kartenhöhe** (W1), Werkzeugknöpfe 288×88 |
| 915×412 / 200 % | 643 × 247 | nein | Attribution 108 von 247 px, Karte ganz unter dem Falz |

- Gesichtet: Screenshot-Matrix `karte-*`, `ort-*` und `start-*` für 320, 360, 365, iphone, pixel und quer, je hell und dunkel, dazu `-200`. Weiter `k8-320.png`, `k8-320-200.png`, `k8-quer.png` und `k8-quer-200.png`.
- Das Orts-Sheet ist auf allen Breiten sauber, auch bei 200 % und im Querformat.
- **Startbundle**: Die Startseite lädt kein `maplibre` und nichts aus `assets/karte/` (Punkt 1).

### Befunde

**Blocker**: keine.

**Wichtig**

- **W1 – Attribution steht doppelt da** (Plan E4 verlangt „genau einmal“). Sichtbar ist „OpenFreeMap © OpenMapTiles Data from OpenStreetMap | OpenFreeMap © OpenMapTiles Data from OpenStreetMap“, auf allen Viewports, hell und dunkel.
  - Belege: `k5-zweifinger.png`, `k3-montage.png`, `karte-pixel-light.png`, `k8-320-200.png`.
  - Ursache: Die TileJSON `https://tiles.openfreemap.org/planet` liefert `<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from …`. `ATTRIBUTION` in `src/data/tiles.ts` weicht davon ab (© außerhalb des Links, ohne `target`), deshalb entfernt MapLibre die Dublette nicht.
  - Folge: Bei 320 px und 200 % belegt die Attribution 216 von 384 px Kartenhöhe.
  - E2E hat das nicht gefunden, weil die Fixture-Stile die Kacheln direkt per `tiles: […]` liefern, ohne TileJSON und ohne Attribution.
  - Vorschlag: `customAttribution` streichen (die Quelle bringt die Pflicht-Attribution mit) oder `ATTRIBUTION` zeichengleich zur OFM-Zeichenkette machen. Zusätzlich sollte die Fixture-Quelle `openmaptiles` die echte OFM-Attribution tragen, damit Test 2 (`toHaveText(…)`) eine Dublette erkennt.

**Hinweise**

- **H1 – Cluster gruppieren sich beim Setzen eines Startpunkts um.** Bei gleicher Kamera: vorher 16 / 100 / 119, nach „Meinen Standort nutzen“ 14 / 62 / 150 / 14 (`k3a.png` vs. `k3c.png`). Vermutlich ändert `sortPlaces` die Reihenfolge der Features, und Supercluster bündelt reihenfolgeabhängig. Das ist kosmetisch und privatsphäre-neutral (keine Requests), kann aber irritieren. Möglicher Ausweg: `placesToFeatures` mit stabiler Reihenfolge, z. B. nach `key`.
- **H2 – Stadtname englisch**: „Nuremberg“. Der OFM-Stil `positron`/`dark` nutzt für `label_city` `coalesce(name_en, name)`, betroffen sind `karte-*`, `k3b.png` und `k8-quer.png`. Kandidat für `docs/ideas.md`: im `style.load` das `text-field` der Ortslabels auf `name:de`/`name` umstellen.
- **H3 – Attribution in MapLibres Standardschrift** (Helvetica/Arial) statt der App-Schrift. Ist rein optisch.
- **H4 – Querformat**: Kopf, Sticker, Schnellfilter und Statuszeile belegen 266 von 412 px, von der Karte sind ohne Scrollen nur ca. 146 px sichtbar, bei 200 % nichts. Das ist bewusst so (die Liste ist die Hauptansicht, die Karte hat `clamp(240px, 60dvh, …)`). Notiert für einen späteren Blick (`karte-quer-light.png`, `k8-quer.png`).
- **H5 – Konsolen-Warnungen aus den OFM-Stilen**: `highway-shield-…filter: Expected value to be of type number` (positron) und `Image "wood-pattern" could not be loaded` (dark). Es sind nur `warning`, keine `error`, aus dem Fremdstil. Kein Handlungsbedarf.
- **H6 – Orts-Sheet wiederholt Ortsangaben**: Jede Kachel nennt noch einmal Anbieter, Stadtteil und Entfernung, die schon im Sheet-Kopf stehen (`ort-iphone-light.png`). Ist redundant, aber nicht falsch.
- **H7 – Zoom-Knöpfe verdecken am oberen rechten Rand gelegentlich einen Marker** (`karte-320-light.png`, „3“). Üblich; der Marker bleibt per Orts-Liste erreichbar.
- **Offen aus Schritt 10**: Ladezeit und Bedienung auf einem **echten Handy** bzw. echten iPhone (WebKit headless lädt die Karte live fehlerfrei, `k-webkit.png`).

**Nachtrag (2026-10-05):** W1 (Attribution doppelt) ist mit dem Hotfix `192e94e` behoben, siehe „Umsetzung“.
