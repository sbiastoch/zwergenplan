# Architektur

Grundlage für `/arch-review`. Regeln, die maschinell prüfbar sind, stehen zusätzlich in `.dependency-cruiser.cjs` (Verweis in Klammern). Alle anderen prüft der Review.

## Datenfluss

```
Recherche-Skill (.claude/skills/babyevents-nuernberg, orchestriert Subagenten)
   │  pnpm pipeline …  (scripts/pipeline: Sammelkalender, Rohdaten, build)
   │  pnpm pipeline oepnv  (VGN-GTFS, nur lokal, Cache + bedingtes GET; Plan 0009, E4)
   ▼
data/providers.yaml + data/offers.json + data/oepnv/fahrplan.json   (Commit auf main per `pipeline publish`)
                          │
            scripts/build-data.ts  (Zod + Invarianten; rot = kein Build; scripts/transit rechnet die Wegzeit-Tabelle)
                          │
   public/data/site.json, meta.json, wegzeit.json, public/ics/**.ics   (generiert, nicht committet)
                          │
              Vite-Build ► dist/ ► GitHub Pages zwergenplan.app
                          │
            Browser: index.html startet den Abruf von site.json (Frühstart), src/data übernimmt ihn ► src/domain ► src/ui
                     wegzeit.json nur auf Anlass (Kind-Sheet, Karte, gespeicherter Stadtteil; Plan 0009, E9)
```

## Schichten

| Ordner | Aufgabe | darf importieren |
|---|---|---|
| `src/domain/` | reine Logik: Schema, Kategorien, Alter, Filter, ICS, Zeit, Geometrie, Entfernung und Wegzeit (`geo`, `reach`, `districts`, `transit`) | nur `src/domain`, `zod` (nur schema/dataset) |
| `src/data/` | einziger Datenzugriff der App (fetch, localStorage, Geolocation; Ausnahme: Bootstrap in `index.html`, siehe Regeln) | `src/domain`: Typen, zur Laufzeit nur reine Hilfen ohne Zod, heute `geo` (ADR 0010, `data-domain-runtime-allowlist`) |
| `src/ui/` | React-Komponenten, Darstellung, Interaktion | `src/domain`, `src/data` |
| `scripts/` | Build, Validierung, Schema-Export (Node) | `src/domain`, `site.config.ts` |
| `scripts/pipeline/lib/` | reine Pipeline-Logik: Quellen-Parser, Termin-Regeln, Zuordnung, Build der Angebote | `src/domain`, `zod`, `cheerio`, `yaml` – kein Netz, keine Dateien |
| `scripts/pipeline/io/`, `cli.ts` | Netz, Dateien, git für die Pipeline | `scripts/pipeline/lib`, `src/domain`, Node, `fflate` (Entpacken des GTFS-Feeds, ADR 0011) |
| `scripts/transit/` | reine Build-Logik der Wegzeit (Plan 0009): Profil-CSA, Halt→Ort-Tabelle, Aktualität des Fahrplans | nur `src/domain` und `scripts/transit` – kein Node-I/O, kein npm-Paket, kein Netz (`transit-build-pure`) |
| `e2e/` | Black-Box-Tests im Browser | nichts aus `src/` (einzige Hintertür: `window.__zpMap`, siehe unten) |
| `.claude/hooks/` | Agenten-Hooks | nur Node-Builtins |

Regeln:
- `src/domain` ist framework-frei und läuft im Browser: kein React, kein Node-API, keine UI (`domain-is-pure`, `domain-no-node-at-runtime`).
- **Geschäftslogik gehört nach `src/domain`.** Komponenten rufen Domänenfunktionen auf, rechnen aber keine Filter-, Alters- oder Zeitlogik selbst. Das prüft der Review.
- Die UI lädt geprüfte Daten und importiert `schema.ts`/`dataset.ts` nur als Typ. Zod gehört nicht ins Client-Bundle (`no-zod-in-client`).
- Datenzugriff läuft nur über `src/data` (`ui-reads-data-only-via-src-data`).
- **Bootstrap** (Plan 0008, E4): `index.html` enthält genau zwei Inline-Skripte. Eines setzt die Darstellung vor dem ersten Paint (Schlüssel aus `src/data/preferences.ts`), das andere startet den Abruf von `site.json` (Frühstart, `window.__zpSite`, Pfad `%BASE_URL%data/site.json`, Vite ersetzt den Platzhalter beim Build). Diesen Abruf übernimmt nur `takeEarlyRequest` in `src/data/site.ts`, höchstens einmal; die UI fasst `__zpSite` nicht an (Biome `noRestrictedGlobals`). `loadSiteData` wirft nur `SiteLoadError` (`offline` | `netz` | `server`), die Texte stehen in `src/ui/format.ts` (E5). Weiterer Daten- oder Gerätezugriff außerhalb von `src/data` nur per ADR.
- `src/data` darf seit Plan 0004 Laufzeit-Code aus `src/domain` importieren, aber nur reine Hilfen ohne Zod, heute nur `geo` (`coarsen`, `inBounds`; ADR 0010, `data-domain-runtime-allowlist`). Begründung: Die Rohkoordinate darf `src/data/geolocation.ts` nie verlassen, also wird dort schon gerundet und gegen die Stadtgrenze geprüft. Ob eine gespeicherte Stadtteil-ID gilt, prüft `useOrigin`, nicht `preferences.ts`.
- Geolocation läuft nur über `src/data/geolocation.ts` (`canLocate`, `requestPosition`), nur auf Tipp, mit injizierbarer API für den Unit-Test. Die UI fasst `navigator`, `localStorage` und `fetch` nicht an (Biome `noRestrictedGlobals` für `src/ui` und `main.tsx`). Der Umweg über `window.navigator` usw. fällt nicht unter die Regel, den prüft der Review.
- `scripts/pipeline/lib` bleibt rein und testbar: kein Import aus `io/`, `cli.ts`, `scripts/lib/` und kein Node-I/O (`pipeline-lib-pure`, `pipeline-lib-no-node-io`), kein globales `fetch` (Biome `noRestrictedGlobals`). Unit-Tests laufen ohne Netz (`vitest.setup.ts`), Quellen werden mit Snapshots aus `tests/fixtures/pipeline/` getestet.
- `src/` hängt nie von `scripts/` ab (`src-not-scripts`, `no-cheerio-in-src`).
- **Karte** (ADR 0008, Plan 0005), Ladekette in drei Stufen: `src/ui/MapPanel.tsx` (Start: Platzhalter, Lader) → `src/ui/karte/` (Karten-Oberfläche ohne MapLibre: Orts-Liste, Orts-Sheet, Zustände) → `src/ui/map/` (MapLibre).
  - Nur `src/ui/map/` darf `maplibre-gl` importieren (`maplibre-only-in-map`).
  - `src/ui/karte/` und `src/ui/map/` erreicht man von außen nur per `import()`, auch Typen nicht statisch (`karte-ui-only-lazy`, `map-only-lazy`), und nur über den jeweiligen Lader (`karte-ui-entry-only`, `map-entry-only`). Die Props-Typen liegen deshalb in `src/ui/map-types.ts`.
  - dependency-cruiser fasst statischen und dynamischen Import desselben Moduls zu einer Kante zusammen; dass die Lader ihr Ziel nicht zusätzlich statisch importieren, prüft `scripts/check-architecture.ts` (`lazy-loader-static`).
  - Beide Lazy-Chunks, Worker und Karten-CSS landen in `dist/assets/karte/` mit eigenen Budgets; das Startbudget zählt sie nicht.
  - **Deutsche Beschriftung** (Plan 0008, E16): Die OpenFreeMap-Stile beschriften mit `coalesce(name_en, name)`. `germanTextField` (`src/ui/map/labels.ts`, rein) setzt im `style.load`, also auch nach jedem Stilwechsel, das `text-field` jedes Symbol-Layers auf `coalesce(name:de, name_de, name)`. Kein Request.
  - Die Kartenquelle `orte` ist nach `key` sortiert, unabhängig von der Orts-Liste: Cluster hängen nicht am Startpunkt (E15).
  - Der Startausschnitt hält rechts die Zoom-Knöpfe frei (Padding 32 / 90 / 32 / 32, gleich für jeden Ausschnitt; E20).
- **Wegzeit** (Plan 0009, ADR 0011): Die Tabelle `wegzeit.json` lädt nur `src/data/transit.ts` (eigener Origin; ein Zeitlimit von 8 s für Tabelle und Rechenlogik zusammen; „Nochmal laden“ am HTTP-Cache vorbei). Scheitert bei „Nochmal laden“ (`retry()`, nicht beim Öffnen von Kind-Sheet oder Karte) nur der Chunk, während die Tabelle kommt, lädt die Seite gleich neu: Chromium behält einen gescheiterten `import()` (`reloadAfterRetry`, Plan 0009, N1). Ohne Tabelle (kein Netz) und nach dem Zeitlimit nie. Wann, entscheidet allein `useTransit().want()` (`src/ui/use-transit.ts`): beim Öffnen von Kind-Sheet oder Karte, auf „Nochmal laden“ oder beim Start mit gespeichertem Stadtteil, höchstens einmal je Sitzung.
  - Die Rechenlogik `src/domain/transit.ts` ist ein Lazy-Chunk in `dist/assets/oepnv/` (Entscheidungspunkt E10: statisch lag das Start-JS bei 90,5 kB). Von `src/` aus nur per `import()`, auch Typen nicht statisch (`transit-only-lazy`), und nur über den Lader `use-transit.ts` (`transit-entry-only`, `lazy-loader-static`). Typen stehen in `src/domain/transit-types.ts`; Budget `Wegzeit JS (lazy)`.
  - Je Startpunkt ist alles eine Art: Wegzeit mit Bus & Bahn, oder als Rückfall die Luftlinie (Tabelle fehlt oder passt nicht, Startpunkt außerhalb des Stadtgebiets). Solange sie lädt, stehen Platzhalter ohne Layoutsprung (`ReachMode` „laedt“); mit gesetzter Grenze (`wegzeit=`) ersetzt ein Platzhalter-Block Liste und Kalender. Bewusste Lücke: Die Karte (Marker, Orts-Liste) zeigt beim Laden alle Orte, höchstens bis zum Zeitlimit; die Statuszeile ist solange unsichtbar.
- **Export der Merkliste** (Plan 0010, E8 A; ergänzt ADR 0007): `src/domain/ics.ts` ist ein Lazy-Chunk in `dist/assets/export/` (Budget `Export JS (lazy)`). Von `src/` aus nur per `import()`, auch Typen nicht statisch (`ics-only-lazy`), und nur über den Lader `src/ui/SavedView.tsx` (`ics-entry-only`, `lazy-loader-static`). Pfade und Termin-Schlüssel der statischen ICS-Dateien stehen in `src/domain/ics-paths.ts`, das das Detail beim Start braucht. Die App lädt den Chunk nach dem ersten Rendern mit Daten im Leerlauf vor, für alle gleich. Typen stehen in `src/domain/ics-types.ts`. Scheitert er, rät der Toast zum Neuladen mit Netz (Chromium behält einen gescheiterten `import()`, auch den des Vorladens).
- **Chunk-Wächter** (Plan 0010, E8): Direkt in `dist/assets/` liegt genau eine JS-Datei, `index-*.js` (`scripts/check-chunks.ts`, läuft im Skript `size`). Lazy-Chunks bekommen per `chunkFileNames` einen Unterordner. Ein gemeinsamer Teil, den Rolldown abspaltet (z. B. React, sobald mehrere Lazy-Chunks es mit dem Einstieg teilen), wird so sofort rot, nicht erst als Summe im Budget. Die `codeSplitting`-Gruppe mit `tags: ["$initial"]` (`vite.config.ts`, ADR 0012) hält alles, was der Einstieg statisch erreicht, im Einstieg; sie umgeht rolldown#11026. Fällt sie weg oder wirkt sie nicht mehr, zeigt der Wächter die Abspaltung.
- **Kachel-Host** steht nur in `src/data/tiles.ts`. `guardTileRequest` sitzt als `transformRequest` vor jedem MapLibre-Request (auch denen, die der Worker lädt) und lässt nur `https://tiles.openfreemap.org` ohne Querystring und Fragment durch.
- Keine Zyklen (`no-circular`). Produktivcode importiert keine Tests oder Fixtures (`no-test-code-in-prod`).

## Invarianten

- **Ein Datenvertrag**: `src/domain/schema.ts` (Zod 4), auch für den Anbieterkatalog. Abgeleitete Werte wie Kategorien werden berechnet, nie gespeichert. `schema/*.json` ist ein Export (CI prüft Drift). Das Rohformat der Subagenten (`schema/raw-batch.schema.json`) ist ein daraus abgeleitetes Zwischenformat (ADR 0006).
- **Zeit**: Jeder Zeitpunkt trägt einen Offset. Kalendertage, das Alter und „heute“ werden in Europe/Berlin bestimmt (`time.ts`), nie in der Geräte-Zeitzone. „Jetzt“ wird in Domänenfunktionen hineingegeben (`FilterContext.now`), nicht intern mit `new Date()` erzeugt.
- **Stabile IDs** (ADR 0003, ADR 0006): Die Offer-ID ist `providerId--slug(title)--venueId` (Kurse und Einzeltermine mit Beginn im Slug, `src/domain/ids.ts`), die Termin-UID ist `offerId--YYYYMMDDTHHmm@zwergenplan`. Eine geänderte ID erzeugt Duplikate im Kalender der Nutzer.
- **ICS**: ein VEVENT je Termin in UTC, keine RRULE/RDATE. Die Dateien entstehen statisch zur Build-Zeit. Einzige Ausnahme ist die Sammeldatei der Merkliste: Sie entsteht im Browser aus denselben VEVENTs (ADR 0007).
- **Privatsphäre**: Das Geburtsdatum bleibt im `localStorage`. Es steht nie in URL, Logs oder Requests. Kein Tracking, keine Drittanbieter-Requests außer Kartenkacheln von `tiles.openfreemap.org`, nur bei offener Karte (auch die Wegzeit kommt vom eigenen Origin und wird lokal gerechnet); die Karte zentriert nie auf Standort oder Kartenmitte, sie zeichnet einen solchen Startpunkt nur als lokalen Layer (Kamera-Regel, ADR 0008). Ihr Startausschnitt liegt über alle kommenden Orte, unabhängig von Filtern, Alter und Startpunkt (außer Stadtteil-Zoom) (`initialCamera`, `src/domain/camera.ts`); er hängt also nie mittelbar an Standort oder Geburtsdatum. Auf einen Stadtteil darf sie fahren.
- **Startpunkt** (Plan 0004, Plan 0005): Der Startpunkt (Standort, Stadtteil oder Kartenmitte) steht nie in URL, Logs oder Requests. Der Standort wird nur auf Tipp abgefragt, in `src/data` sofort auf ca. 100 m gerundet (`coarsen`) und lebt nur im Arbeitsspeicher, ebenso die gerundete Kartenmitte. Gespeichert wird höchstens die ID eines Stadtteils (`zwergenplan.entfernung-ab`), nie eine Koordinate, auch keine gerundete. In die URL darf nur die Wegzeit-Grenze (`wegzeit=`, Plan 0009; `umkreis=` wird nicht mehr gelesen), weil sie ohne Startpunkt nichts verrät. E2E belegt: Ab der Wahl des Startpunkts entsteht kein Request (`e2e/startpunkt.spec.ts`, erst nach der Antwort von Tabelle und Chunk und nach dem Vorladen des Export-Chunks gezählt). Bei offener Karte lädt die Wahl von Standort oder Kartenmitte keine Kachel; die Wahl eines Stadtteils fährt die Karte dorthin und lädt dabei höchstens Kacheln, sonst nichts (ADR 0008, `e2e/karte.spec.ts`).
- **Kein Request hängt davon ab, welcher Startpunkt gilt** (Plan 0009, E9; ADR 0011), außer den Kartenkacheln beim Stadtteil-Zoom (ADR 0008: ein öffentlicher, grober Punkt von 35, nur bei offener Karte). Sonst sind URL und Inhalt jedes Requests für alle gleich. Die Wegzeit-Tabelle lädt beim Öffnen einer Startpunkt-Oberfläche (Kind-Sheet, Karte), auf „Nochmal laden“ oder beim Start, wenn irgendein Stadtteil gespeichert ist, nie als Folge einer Wahl. Ebenfalls bewusst: Der Request beim Start verrät dem eigenen Host ein Bit, nämlich dass *ein* Stadtteil gespeichert ist, aber nicht welcher. E2E belegt für die Tabelle: ohne Anlass kein Request auf `wegzeit.json`, mit gespeichertem Stadtteil genau einer, und ab der Wahl eines Startpunkts keiner mehr (`e2e/startpunkt.spec.ts`, `e2e/karte.spec.ts`).
- **Testdaten gehen nie live**: Der Fixture-Build schreibt nach `dist-e2e/`, nur `dist/` wird deployt.
- **Altersprüfung**: Kurs und einmalig zählen zum (ersten) Termin, regelmäßig zählt, wenn irgendein Termin passt. Die Grenzen sind inklusiv, es zählen vollendete Monate.

## Mobile-UX-Gates (`e2e/mobile-ux.ts`)

Jede Ansicht besteht in Playwright auf 360 px, Pixel 7, iPhone 15 (WebKit), quer und Desktop:
- kein horizontales Scrollen, auch bei 320 px und 200 % Textgröße
- Touch-Ziele ≥ 44 px (Links im Fließtext ≥ 24 px)
- Eingabefelder ≥ 16 px (sonst zoomt iOS)
- axe WCAG 2.2 AA ohne Verstöße, hell und dunkel (dunkel über die System-Einstellung und über die gewählte Darstellung `data-theme="dark"`)
- Text passt in seinen Kasten (`expectTextFits`, Plan 0007): kein Bruch mitten in kurzen Wörtern, nichts ragt heraus oder wird abgeschnitten, kein Text in sichtbaren Rundungen, keine Überlappung in Leisten; bei 100 % zusätzlich einzeilige kurze Knopf-Beschriftungen (nur mit Fixture-Daten). Läuft in jedem `expectMobileUx` und bei 320 px/200 %. Ausnahmen nur als begründete Regel im Gate, nie per Selektor. Sichtbare Kante heißt: Hintergrund mit Alpha > 0, Hintergrundbild oder Rand mit Breite, Stil und deckender Farbe (`hasVisibleEdge`, gemeinsam für Prüfung 2 und 3). Präzisierungen (Plan 0008), je mit Kanarienvögeln in `mobile-ux.spec.ts`:
  - **E2, bewusste Lockerung für Ausbrüche über unsichtbare, nicht abschneidende Kästen:** Prüfung 2 übergeht einen Vorfahren ohne sichtbare Kante, der nicht abschneidet, wenn der Text schon in einem sichtbaren Kasten dazwischen steht (Woche bei 320 px mit negativem Rand). Ohne sichtbaren Kasten dazwischen, über einer sichtbaren Kante oder einem abschneidenden Kasten bleibt herausragender Text rot; den Seitenrand prüft `expectNoHorizontalScroll`.
  - **E3 (präzisiert mit Plan 0009, N5):** Prüfung 3 prüft eine Zeile in Scroll-Containern dort, wo das Layout sie hinlegt. An den oberen Ecken zählt die Lage bei `scrollTop = 0`, an den unteren die Endlage. Dafür werden die Versätze aller Scroll-Container zwischen Text und gerundetem Kasten summiert, der Kasten eingeschlossen. Text in `position: sticky` wird an seiner tatsächlichen Lage geprüft. Was das Scrollen in die Rundung schiebt, ist grün. Was das Layout in die Ecke legt, ist in jeder Scroll-Lage rot.
- Dunkelmodus ohne helle Inseln (`expectNoBrightIslands`): keine deckende Fläche (auch `::before`/`::after`) mit Luminanz > 0,75 auf mehr als 1 000 px². Gewählte Zustände und Toast nutzen die Tokens `--sel`/`--on-sel` und `--toast`/`--on-toast`, die in **beiden** Dunkel-Blöcken von `tokens.css` stehen.
- Große Schrift: Umschaltungen dafür laufen über intrinsische Layouts (`flex-wrap`, `grid auto-fit` mit `rem`-Mindestbreiten) oder Container-Queries in `rem`, nie über Viewport-Media-Queries (die reagieren nicht auf die Schriftgröße). Kurze Wörter in Bedienelementen brechen nie mitten im Wort, `overflow-wrap: anywhere` ist nur der Notausgang für lange Komposita und URLs; Titel trennen mit `hyphens: auto`.
- sichtbarer Fokus bei Tastaturbedienung
- keine Konsolen- oder Seitenfehler (automatisch in jedem Test)
- reduzierte Bewegung funktioniert: keine Animation und keine Transition (0 ms, Dauer + Verzögerung), `expectReducedMotion`; `motion.css` setzt `animation: none` und `transition: none`, nie eine kurze Dauer (WebKit schloss 0,01-ms-Transitionen erst Sekunden später ab, Plan 0008, E1). Wer auf `animationend`/`transitionend` hört, behandelt den Fall „reduzieren“ selbst.
- LCP < 2,5 s und CLS < 0,05 bei gedrosselter Mobile-CPU bzw. gedrosseltem Netz
- Schrift-Swap verschiebt nichts (`e2e/font-swap*.spec.ts`, Plan 0007): Webfont zurückgehalten, je Fallback (Arial/Liberation, Roboto, Noto, DejaVu) bei 412 und 360 px mit echten Daten CLS < 0,05, gezählt nur ab der Freigabe. Swap-Tests laufen mit Telefon-Rendering (`PHONE_FONT_RENDERING`, nur Chromium); ob ein echtes Android die Annahme bestätigt, prüft Schritt 10 von Plan 0007. Auf CI müssen Roboto, Arial (Liberation) und DejaVu gemessen werden, nur Noto darf dort fehlen und wird übersprungen; die Werte stehen im CI-Log („Schrift-Swap je Fallback“). Die `size-adjust`-Werte der Fallback-Faces in `tokens.css` kommen aus `node scripts/font-fallback.ts`, nie geschätzt.
  - **Rot nach einem Datenupdate:** Skript neu laufen lassen und die Werte übernehmen, dann die gemeldete Stelle im Layout prüfen (Verursacher stehen in der Fehlermeldung). Die Schwelle wird nie gesenkt, eine Ausnahme gibt es nur per ADR.
- Bundle-Budgets (`.size-limit.json`)

Eine neue Ansicht bekommt eigene E2E-Tests **und** einen Aufruf von `expectMobileUx`, hell und dunkel. Das gilt auch für jedes Overlay (`<dialog>`: Detail, Sheets), denn es liegt im Top-Layer und wird sonst nie geprüft.

Die Karte ist eine Ergänzung; jede ihrer Funktionen hat einen Weg ohne Karte (Orts-Liste, Statuszeile, „Startpunkt wählen“). Ohne WebGL, ohne Netz und ohne Karten-Chunk bleibt die Seite bedienbar.

## E2E und die Karte (Plan 0005, E13)

- Der Drittanbieter-Wächter (`e2e/fixtures.ts`) ist standardmäßig scharf: Jeder Request an `tiles.openfreemap.org` ist rot. Nur Tests mit `test.use({ tiles: "mock" })` bekommen Stil, Glyphen und leere Vektorkacheln aus `tests/fixtures/karte/`, per `context.route` (auch Worker-Requests), nur solange `.map-box` im DOM ist und nur ohne Querystring. Unbekannte Pfade sind rot. Die Kachel-Requests stehen im Protokoll `tileLog` (Kamera-Regel).
- Erlaubte Konsolenfehler gibt es nur per Opt-in je Test (`allowedConsoleErrors`, konkretes Muster gegen URL und Text).
- **Begründete Ausnahme von „E2E ist Black-Box“**: Nur im E2E-Build (`__E2E__`, gesetzt in `vite.config.ts` bei `ZWERGENPLAN_DATA=fixture`) hängt die Karten-Instanz an `window.__zpMap`, damit Tests Marker finden (`project`) und Kamera und Layer prüfen. Im Deploy-Build entfernt Vite den Zweig; der Smoke-Test prüft, dass es `__zpMap` dort nicht gibt.
- CSS-Hinweis: `maplibre-gl.css` ist ungeschichtet und schlägt jede Regel in `@layer components`. Was MapLibre-Elemente betrifft, steht deshalb ungeschichtet in `src/ui/map/map-overrides.css`.
