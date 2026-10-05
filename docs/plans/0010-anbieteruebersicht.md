# Plan 0010 – Anbieterübersicht

Status: live seit `27b7b3b` (2026-10-05), Browser-Review live bestanden; offen: Geräteprüfung am echten iPhone/Android
Datum: 2026-10-05
Bezug: `docs/ideas.md` („Anbieterverzeichnis auf der Website, ersetzt das frühere `ANBIETER.md`“), Plan 0004 (Startpunkt, `reachOf`), Plan 0005 (Ladekette der Karte, Orts-Liste und Orts-Sheet als Vorbild), Plan 0007 (Text-Gate, Tab-Leiste quer als Seitenleiste, E14), Plan 0008 (Feinschliff: Badge quer, `atPlace`, `retry`), **Plan 0009** (Öffi-Wegzeit, `ReachMode`, ADR 0011: kommt vor diesem Plan), ADR 0002 (Datenfluss), ADR 0003 (Themen → Kategorien), ADR 0006 (Katalog im Zod-Vertrag), ADR 0008 (Privatsphäre, Lazy-Budgets).

## Ziel

Eltern sehen auf einen Blick, **wer** in Nürnberg etwas für Kinder unter 3 Jahren anbietet, und kommen von dort zum ganzen Programm eines Anbieters. Am Ende gilt:

- Die Tab-Leiste hat einen **vierten Tab „Anbieter“** (`?ansicht=anbieter`), Reihenfolge Entdecken · Kalender · Anbieter · Merkliste (Nutzerentscheidung N2). Die Leiste ist dafür neu ausgelegt: hochkant 320–412 px, 200 %, Seitenleiste quer und kompakte Querleiste (E2).
- Die **Anbieterliste** zeigt alle Anbieter des Katalogs:
  - Jede Zeile nennt die Zahl der kommenden Angebote, Stadtteil(e) bzw. Ort und, mit Startpunkt, die Wegzeit bzw. Entfernung zum nächsten Ort.
  - Ohne Startpunkt ist sie alphabetisch sortiert, mit Startpunkt nach Wegzeit (N4).
  - Anbieter ohne kommende Termine stehen offen und blass am Ende, mit „Gerade keine Termine im Plan“ (N3).
  - Filter, Kategorie-Sticker und Altersregel wirken wie in „Entdecken“. Eine Suche filtert nach Namen.
- Ein Tipp auf einen Anbieter öffnet das **Anbieter-Sheet** (`?anbieter=<id>`): Kategorien, „Website & Programm“, Orte und alle kommenden Angebote als Kacheln.
- Aus dem **Detail** führt „Alle Angebote dieses Anbieters“ (umgesetzt als „Mehr von diesem Anbieter“, siehe „Umsetzung, Paket A“) in dasselbe Sheet, aus jeder Ansicht.
- Die Daten kommen aus dem vorhandenen Katalog. **Keine Schemaänderung**, kein neuer Pipeline-Lauf. Eine eigene Datei `data/anbieter.json` (7,6 kB gzip) lädt erst beim ersten Öffnen.
- Der Code der Übersicht ist ein eigener **Lazy-Chunk** in `dist/assets/anbieter/`.
- **Paket 0** verschlankt vorher das Startbundle (E8). Nach ADR 0012 gilt das Budget `JS (initial)` von 92 kB; das Start-JS liegt nach Plan 0009 und 0010 bei **≤ 91,0 kB** (1 kB Reserve).
- Kein neuer Drittanbieter-Request. Externe Links öffnen mit `target="_blank" rel="noopener"`.
- Mobile-UX-Gates grün für Tab-Leiste, Anbieterliste, Anbieter-Sheet und deren Zustände, hell und dunkel, bei 320 px / 200 % und in beiden Querformaten.

## Nicht-Ziele

- **Neue Katalogfelder**, etwa eine Einrichtungsart („Familienzentrum“, „Bibliothek“) oder ein Kurzname. Beides wäre eine Schemaänderung samt Skill-Lauf (ADR 0006). → `docs/ideas.md`.
- **Alle Termine eines Anbieters als Kalenderdatei oder Abo** (E11). → `docs/ideas.md`.
- **Anbieter merken oder „folgen“.** Die Merkliste bleibt bei Angeboten. → `docs/ideas.md`.
- **Anbietername auf der Kachel antippbar.** Der Weg geht über das Detail. → `docs/ideas.md`.
- **Ring** (innen / knapp außen / außen) in der Oberfläche. Er beschreibt den Recherche-Fokus (Altstadtring), nicht die Lage zum Startpunkt. Plan 0004 hat eine Gewichtung nach `ring` schon ausgeschlossen.
- **Aggregatoren und Verzeichnisse** (9 Einträge). Sie sind Recherchequellen ohne eigene Angebote (ADR 0006).
- Die Programm-Quellen des Katalogs (`programme[]`) als Linkliste (E6).
- Karte der Anbieter. Die Karte zeigt weiter Orte.
- **Filter- und Kind-Sheet lazy laden** (Review M1). Beide sind Kern-Bedienelemente, ohne Service Worker gingen sie offline verloren, und der Umbau kollidiert mit Plan 0009 (Kind-Sheet „Wegzeit ab“).

## Ausgangslage

**Code** (Stand `4d4c063`, dazu die Stände von Plan 0008 und 0009, soweit sie diesen Plan betreffen):
- `src/domain/route.ts`: `TABS = ["entdecken", "karte", "kalender", "merkliste"]`. `tabSection` ordnet `karte` dem Tab „Entdecken“ zu. Die URL kennt `ansicht=` und `angebot=`, kanonisch in der Reihenfolge Filter, Ansicht, Angebot. `route.test.ts` hat Round-Trip-Tests und „kennt keinen Startpunkt“ über alle Tabs. Plan 0009 ändert diese Datei (`umkreis` → `wegzeit`).
- `src/ui/use-app-state.ts`, `useRoute`: `replace`, `openDetail` (`pushState` mit `zpDetail`) und `closeDetail` (`history.back()`, sonst `replaceState`).
- **Tab-Leiste** (`Chrome.tsx` `TabBar`, `styles/tabs.css`):
  - drei Spalten, `.tabs` 16 px schmaler als der Viewport (höchstens 40 rem), innen 10 px Rand;
  - `.tab` mit 13 px Schrift (`0.8125rem`), 600 bzw. 800 fett, mindestens 56 px hoch;
  - jeder Tab ist Container, unter `4.6rem` Breite ist das Label nur für Screenreader da (das CSS nennt als längstes Label „≈ 4,4 rem“, gemeint sind „Entdecken“ und „Merkliste“);
  - der Daumen ist ein Drittel breit, die Klassen heißen `at-1`/`at-2`;
  - quer (`max-height: 500px`, `min-width: 40rem`) wird die Leiste zur Seitenleiste mit `6.5rem` Breite (Body `padding-left: 7.5rem`);
  - quer und schmaler als 40 rem (z. B. 568×320) gibt es die kompakte Leiste: Icon und Label nebeneinander, 44 px hoch;
  - das Badge der Merkliste ist mindestens 22 px groß und sitzt hochkant absolut bei `left: calc(50% + 8px)`. Plan 0008 (E8) stellt es quer in den Fluss und gibt der Seitenleiste gleich hohe Zeilen (`grid-auto-rows: 1fr`). Laut Plan 0008 ist die Seitenleiste mit drei Tabs bei 100 % 224 px und bei 200 % 284 px hoch.
- `src/ui/App.tsx` (296 Zeilen): Statuszeile (einzige `role="status"`-Region), Hinweise, Ansichten. Sticker nur in „Entdecken“, Schnellfilter außer in der Merkliste. `src/ui/Overlays.tsx`: Detail, Filter-Sheet, Kind-Sheet als native `<dialog>`.
- Vorbild für die Ladekette (Plan 0005): `MapPanel.tsx` (Start, `useLazy`/`LoadFailed` aus `Lazy.tsx`) → `src/ui/karte/` (Lazy-Chunk) → `src/ui/map/`. Die Props-Typen liegen außerhalb in `map-types.ts`. Regeln: `karte-ui-only-lazy`, `karte-ui-entry-only` und `lazy-loader-static`. Vite legt die Chunks über `chunkFileNames` nach `assets/karte/`. `LoadFailed` rendert `<p class="map-note">`, und das ist absolut im Kartenrahmen positioniert.
- Das Orts-Sheet stapelt das Detail über sich (`ctx.onOpen`, das Sheet bleibt offen).
- `use-offer-views.ts`: `reachOf` je Koordinate, `visible`, intern `upcoming`. `unfitIds` deckt **alle** kommenden Angebote ab. Plan 0009 baut `reachOf` auf `reachFn` um und liefert `ReachMode` (`oepnv` | `laedt` | `luftlinie` mit Grund `fehler`/`ausserhalb`) mit Platzhaltern beim Laden (`.dist` mit fester Breite, `.list-pending`).
- `src/domain/site-data.ts`: `site.json` enthält je Angebot `providerName` und `venue`. Website, Themen und Orte der Anbieter fehlen dort, ebenso Anbieter ohne Angebote.
- `src/domain/schema.ts`: Die Provider haben alles Nötige (`name`, `url`, `topics`, `venues[]` mit `name`, `address`, `district?`). Die ID-Form `kebab` ist dort lokal definiert, mit der Meldung „kebab-case erwartet“.
- Tokens: `--muted` (hell `#475563`, dunkel `#a9b8c6`) ist die gedämpfte Textfarbe. Ein `--ink-2` gibt es nicht.

**Echte Daten** (`data/providers.yaml`, `data/offers.json` vom 2026-10-04, gezählt am 2026-10-05 um 12:00):
- 83 Katalog-Einträge: 74 `anbieter`, 7 `aggregator`, 2 `verzeichnis`.
- **64 Anbieter mit kommenden Angeboten, 10 ohne.** Von den 10 laufen 3 über den Sammelkalender des Dekanats (`coveredBy`). Ohne Termine sind u. a. Staatstheater, Theater Salz+Pfeffer und Sternenhaus (KUF).
- 333 Angebote, 2 889 Termine. Kommende Angebote je Anbieter: Median 2, Spitze 71, 43 und 24.
- 113 Orte im Katalog. 19 Anbieter haben mehr als einen Ort, höchstens 11. Mit kommenden Angeboten nennen 52 Anbieter einen Stadtteil/Ort, 10 nennen zwei, je einer 4 bzw. 6.
- **Namen**: 20 bis 111 Zeichen, Median 59. 62 Namen mit „ – “-Zusatz, 33 mit Klammer. Alle Namen sind eindeutig.
- **Kategorien** aus den Katalog-Themen: 30 Anbieter haben 1, 19 haben 2, 16 haben 3, 5 haben 4, je einer 5 bis 8. Bei 10 Anbietern kommen in den Angeboten Kategorien vor, die der Katalog nicht nennt (12 Fälle). Eine Einrichtungsart gibt es nicht.
- **Programm-Links**: 197 Einträge. Bei allen 74 Anbietern ist `url` zugleich eine Programm-URL. Die übrigen 123 sind Recherchequellen: 86 HTML (darunter Buchungs-iFrames), 19 JS-Widgets, 8 iCal, 6 PDF, 4 JSON-APIs.

**Fixtures**: 5 Anbieter, alle mit Angeboten, 9 Angebote, davon 8 kommend bei eingefrorener Uhr (Mo 5.10.2026 12:00). `loadFixtures()` nutzen `dataset.test.ts` (erwartet `providers: 5`), `site-data`, `saved`, `ics`, `agenda` sowie die Pipeline-Tests `scripts/pipeline/lib/select.test.ts`, `draft.test.ts`, `raw.test.ts` und `build-offers.test.ts`.

**Größen** (gemessen am 2026-10-05 auf `4d4c063`, `pnpm build`, size-limit, echte Daten, gzip):

| | Wert | Budget |
|---|---|---|
| JS (initial) | **87,30 kB** | 90 kB |
| CSS | 10,37 kB | 15 kB |
| Karte JS / CSS (lazy) | 425,04 / 10,76 kB | 450 / 12 kB |
| `site.json` | 80,14 kB (593 kB roh) | 250 kB |

Laut Plan 0009 liegt das Start-JS nach Plan 0008 bei ca. 87,9 kB. Plan 0009 hält sich selbst an 88,6 kB (Entscheidungspunkt) und 89,0 kB (nach seiner UI, sonst verschlankt er).

Anbieterdaten als JSON (gzip -9, 74 Anbieter):

| Variante | roh | gzip allein | Zuwachs in `site.json` |
|---|---|---|---|
| **gewählt**: `id`, `name`, `url`, `topics`, `venues[{name, address, district?}]` | 30,6 kB | **7,63 kB** | – |
| plus `geo` je Ort | – | 8,80 kB | – |
| plus `ring`, Orts-`id` (ohne `programme`) | 41,7 kB | 9,47 kB | +8,65 kB |
| plus alle `programme`-URLs | 55,8 kB | 12,28 kB | +11,45 kB |
| plus `notes` | 76,4 kB | 21,17 kB | +20,28 kB |

Die Messungen zur Verschlankung des Startbundles stehen in E8.

## Entscheidungen

### E1 – Was Eltern am Handy in einer Anbieterübersicht wollen

Typische Fragen:
1. „Ist unser Familienzentrum / die Stadtbibliothek dabei?“ Gesucht wird nach dem Namen.
2. „Was macht der Anbieter, bei dem wir schon waren, sonst noch?“ Gefragt wird aus einem Angebot heraus.
3. „Wer hat Musik für Kleine?“ Gesucht wird nach der Art des Angebots.
4. „Wer ist in unserer Nähe?“
5. „Wo melde ich mich an, wo steht das ganze Programm?“ Das führt zur Website.

| Wo | Inhalt | Frage |
|---|---|---|
| Zeile der Liste | Name; „3 Angebote · Gostenhof · 25 Min.“ | 1, 3, 4 |
| Liste | Suche nach Namen; Sticker und Filter wie überall; mit Startpunkt nach Wegzeit sortiert | 1, 3, 4 |
| Anbieter-Sheet | Name, Kategorien, „Website & Programm“, Orte, alle kommenden Angebote als Kacheln | 2, 5 |
| Detail | „Alle Angebote dieses Anbieters“ | 2 |

- Nicht gezeigt werden Katalog-Notizen, Verfügbarkeitssysteme, `verified`, die Altersspanne und Formate/Kosten auf Anbieterebene. Das sind Angaben für die Recherche, für Eltern zählen die echten Angebote.
- **„Nach Art“ heißt nach Kategorie**: Die 12 Kategorien kennen Eltern von den Stickern, eine Einrichtungsart fehlt in den Daten.

### E2 – Navigation: vierter Tab „Anbieter“ und die neu ausgelegte Tab-Leiste (N2)

**Route** (`src/domain/route.ts`):
- `TABS = ["entdecken", "karte", "kalender", "anbieter", "merkliste"]`. `tabSection("anbieter") === "anbieter"`, es ist ein eigener Tab. Der Rückgabetyp bleibt `Exclude<Tab, "karte">`.
- `Route.providerId?: string`, URL-Parameter `anbieter=`.
  - Geprüft wird gegen `KEBAB_ID_PATTERN` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Die Regel zieht aus `schema.ts` nach `src/domain/ids.ts` (einzige Definition). `schema.ts` nutzt sie mit unveränderter Meldung „kebab-case erwartet“, `pnpm schema:check` bleibt grün.
  - Höchstens 80 Zeichen (längste echte ID: 47).
- Kanonisch: Filter, `ansicht`, `anbieter`, `angebot`.
- Der Deep-Link `?anbieter=<id>` öffnet das Sheet über **jedem** Tab. Er wechselt den Tab nicht.

**Tab-Leiste** (`TabBar`, `tabs.css`):
- `TAB_ITEMS` bekommt einen Eintrag `{ tab: "anbieter", label: "Anbieter", icon: "store" }` an Position 3. Die Merkliste bleibt ganz rechts, wo Daumen und Gewohnheit sie suchen.
- Neues Icon `store` in `icons.tsx` (Markise über Tür, gleicher Strich wie die übrigen, ca. +0,15 kB). Es muss allein tragen, denn bei 200 % zeigt die Leiste hochkant nur Icons.
- Das Label „Anbieter“ (8 Zeichen) ist kürzer als „Entdecken“ und „Merkliste“. **Ein Kurzlabel ist nicht nötig.** Die engste Stelle bleiben die beiden langen Labels.

**Abgeleitete Breiten.** `.tabs` ist `min(40rem, 100vw) − 16px` breit, die Spalte also `(Leistenbreite − 2 · Rand) / 4`. Das Label maß bisher ≈ 4,4 rem bei 13 px, bei 12 px ergibt das 4,4 · 12/13 ≈ 4,06 rem (65 px), bei 800 fett etwas mehr.

| Lage | heute (3 Tabs, 10 px Rand) | 4 Tabs, unverändert | **4 Tabs, neu** | Schwelle neu (4,25 rem) | Ergebnis |
|---|---|---|---|---|---|
| 320 hochkant, 100 % | 94,7 px | 71 px < 73,6 → nur Icons | Rand 6 px → **73 px** | 68 px | Labels ✓ |
| 360 hochkant | 108 | 81 | 82,5 | 68 | Labels ✓ |
| 390 hochkant | 118 | 88,5 | 89,6 | 68 | Labels ✓ |
| 412 hochkant | 125 | 94 | 94,9 | 68 | Labels ✓ |
| 412 hochkant, 125 % | 125 | 94 | 94,9 | 85 | Labels ✓ (Label ≈ 81 px) |
| 412 hochkant, 150–200 % | 125 < 147 → nur Icons | 94 | 94,9 | 102–136 | nur Icons, wie heute |
| Desktop 40 rem, 200 % | 201 | 151 | 151 | 136 | Labels ✓ |
| kompakt 568×320, 100 % | 177 | 133 | 133 | eigene Schwelle 128 | Icon + Label + Badge: 24 + 6 + 65 + 6 + 22 = 123 ✓ |
| kompakt 568×320, 125 % | 177 | 133 | 133 | eigene Schwelle 145 | nur Icons (ohne eigene Schwelle bräuchte es 24 + 6 + 81 + 6 + 27 ≈ 144 > 133) |
| kompakt 568×320, 150–200 % | 177 | 133 | 133 | eigene Schwelle 162–188 | nur Icons, Badge daneben ✓ |

Rechenweg zu 412 px: Leiste 396 px, Rand `2.5 · 4,12 − 2 = 8,3` px, Spalte `(396 − 16,6) / 4 = 94,9` px.

CSS-Änderungen (Startwerte, entscheiden tun Text-Gate und `layout.spec.ts`):
- `.tabs`: `grid-template-columns: repeat(4, minmax(0, 1fr))`, `padding: 6px clamp(4px, 2.5vw - 2px, 10px)` (bei 320 px 6 px Rand, ab 480 px 10 px).
- `.tab`: `font-size: 0.75rem` (12 statt 13 px, im Rahmen üblicher Tab-Leisten), `@container (width < 4.25rem)` statt `4.6rem`. Die Schwelle ist das neue längste Label (4,06 rem) plus 0,2 rem Reserve, in `rem`, damit sie mit der Schriftgröße wandert (architecture.md: keine Viewport-Media-Queries für Schriftgrößen-Umschaltungen).
- Der Daumen ist `calc((100% - 2 · Rand) / 4)` breit, neu ist die Klasse `at-3`. Der Rand kommt als Custom Property `--tabs-pad`, die auch `padding` setzt. Im Daumen-Hintergrund gilt `inset: 0 clamp(2px, 2.5vw - 6px, 10px)`: Bei 320 px bleibt die weiße Pille ≥ 67 px breit, also breiter als das aktive Label.
- **Badge hochkant:** Mit Label wie heute (`left: calc(50% + 8px)`). Bei 73 px Spalte endet ein einstelliges Badge bei 66,5 px.
- **Badge im Nur-Icon-Zustand** (gleiche Container-Query, also ab 125–200 % je nach Breite):
  - Das Badge kann zweistellig werden (≥ 10 gemerkt). Bei 200 % ist es dann ca. 41 px breit: Schrift 24 px, zwei Ziffern ≈ 29 px, Innenabstand 12 px.
  - `left: calc(50% + 4px)` ragte dann aus der Spalte (36,5 + 4 + 41 > 73).
  - Review 2 schlug `right: 2px` vor. Das hält die Spalte ein, verdeckt das 24-px-Icon aber fast vollständig: Das Badge reicht von 31 bis 71 px, das Icon liegt bei 24,5–48,5 px, frei blieben 6,5 px.
  - **Entschieden:** Im Nur-Icon-Zustand steht das Badge **im Fluss rechts neben dem Icon** (`.tab` als Zeile, `gap: 4px`), wie in der kompakten Querleiste bei 200 %. Platz: 24 + 4 + 41 = 69 ≤ 73 px. Das Icon bleibt frei und ist um ca. 22 px aus der Mitte versetzt.
  - Ergibt der Browser-Review, dass der Versatz schlechter aussieht als die Überdeckung, gilt `right: 2px`. Die Tests unten gelten für beide Varianten: Badge in der eigenen Spalte und in der Leiste.
- **Seitenleiste quer:** Mit vier Tabs und dem Badge unter dem Label (Plan 0008, E8) wäre sie bei 200 % 4 · 88 + 20 = 372 px hoch. Das passt nicht in 360 px (z. B. 740×360, 863×360). Darum:
  - Label und Badge teilen sich in der Seitenleiste die zweite Zeile (`.tab` als Grid: Icon über beide Spalten, darunter Label und Badge mit 2 px Abstand). Es gibt keine Markup-Änderung. Das ändert die Seitenleisten-Variante aus Plan 0008, E8, deren Bedingung (keine Überschneidung) bleibt.
  - **Zeilenhöhe, gerechnet mit `line-height: 1.4`** (`base.css`) und dem Badge (`min-height: 22px`, `padding: 1px 6px`, Schrift 0,75 rem):
    - 100 %: Label 12 · 1,4 = 16,8 px, Badge max(22, 16,8 + 2) = 22 px, Zeile max(56, 24 + 2 + 22) = **56 px**, Leiste 4 · 56 + 20 = **244 px**.
    - 200 %: Label 24 · 1,4 = 33,6 px, Badge 33,6 + 2 = **35,6 px**, Zeile 24 + 2 + 35,6 = 61,6 px, Leiste 4 · 61,6 + 20 ≈ **266 px**.
  - **Kriterium:** Die Leiste liegt vollständig im Viewport, mit mindestens **8 px Rand** oben und unten. Bei 360 px Höhe bleiben 47 px je Seite. Reicht es auf einem Gerät nicht, bekommen Label und Badge in der Seitenleiste `line-height: 1.2`. Das spart bei 200 % ca. 4,8 px je Zeile und ist der vorab festgelegte Notausgang.
  - Breite: 6,5 rem lassen innen 92 px. „Merkliste“ (65) + 2 + zweistelliges Badge (ca. 26) = 93 px, das passt nicht. Darum wird die Seitenleiste **7 rem** breit: innen 100 px; bei 200 % 212 px gegen 130 + 2 + 41 = 173 px. Body `padding-left: 8rem`, die Inhaltsspalte verliert quer 8 px.
  - Zeilen bleiben gleich hoch (`grid-auto-rows: 1fr`, Plan 0008), der Daumen ist `(100% - 20px) / 4` hoch.
- **Kompakte Querleiste** (568×320): vier Spalten mit je 133 px, Höhe weiter ≤ 56 px. Das Badge steht im Fluss hinter dem Label (Plan 0008), ohne Label hinter dem Icon.
  - **Eigene Schwelle (Review 2, M2):** Hier stehen Icon, Label und Badge nebeneinander. Die Spalte muss also Label, Icon, zwei Abstände und Badge fassen. Innerhalb der kompakten Media-Query gilt deshalb `@container (width < calc(4.25rem + 60px))` (60 px = Icon 24 + 2 · 6 + Badge 22 + 2).
  - Bei 100 % sind das 128 px ≤ 133, also mit Labels. Ab 125 % (145 px) bleiben nur Icons.
  - Unterstützt WebKit `calc()` in Container-Queries nicht (der Test zeigt es), gilt die feste Näherung `8rem`: 128 px bei 100 %, 160 px bei 125 %.
  - Ohne eigene Schwelle ragten Label und Badge bei 125–175 % aus der Spalte (siehe Tabelle).
- `scripts/font-fallback.ts`: Die Klasse „Tabs 13/600“ wird zu „Tabs 12/600“. Sie wird nur berichtet und hat kein Gewicht für den `size-adjust`.

**Was „Anbieter“ oben zeigt:** Sticker und Schnellfilter wie in „Entdecken“, weil sie in der Liste wirken (E4). Die Bedingung in `App.tsx` lautet `section === "entdecken" || section === "anbieter"`. Die Statuszeile ist die einzige `role="status"`-Region, Hinweise (Alter, Wegzeit) stehen darunter wie in den anderen Tabs.

**Detail-Knopf:** „Alle Angebote dieses Anbieters“ (umgesetzt als „Mehr von diesem Anbieter“: Die lange Fassung brach bei 320 px um, siehe „Umsetzung, Paket A“) (`.btn wide`, Icon `store`) steht direkt über „Website von …“. Er öffnet das Sheet über dem aktuellen Tab (E3).

### E3 – Anbieter-Sheet und History, ohne Wartemechanik (M2)

- `Overlays.tsx` rendert **immer** `<Dialog open={providerId !== undefined} …>` mit der Klasse `sheet`, und zwar **vor** dem Detail-Dialog.
  - Darin steht `ProviderSheetLoader` aus `ProviderPanel.tsx`. Er rendert nur bei offenem Dialog und ruft erst dann `useLazy(loadProviderUi)`.
  - Weil beide Dialoge immer gemountet sind, ruft React ihre Effekte in Baumreihenfolge auf. Öffnen beide im selben Commit (Deep-Link, `popstate`), ruft zuerst das Sheet `showModal()`, dann das Detail. Das Detail liegt also oben, auch wenn der Inhalt des Sheets noch lädt.
  - Eine Wartemechanik (`providerPending`) entfällt.
- `useRoute` bekommt `openProvider(id)` und `closeProvider()`:
  - `openProvider` setzt `providerId`, **entfernt `offerId`** und macht `pushState({ zpProvider: true })`.
  - `closeProvider` geht per `history.back()` zurück, wenn der Eintrag von uns kommt, sonst `replaceState` ohne `anbieter`.
- **Wege:**
  - Liste → Zeile → Sheet. „Zurück“ schließt das Sheet.
  - Sheet → Kachel → Detail **über** dem Sheet (`openDetail` behält `providerId`). „Zurück“ schließt nur das Detail, Sheet und Scrollposition bleiben. Beim Spitzenreiter mit 71 Angeboten ist das wichtig.
  - Detail → „Alle Angebote dieses Anbieters“: Liegt das Sheet dieses Anbieters schon darunter, gilt `closeDetail()`. Sonst gilt `openProvider(offer.providerId)`: Das Detail schließt, das Sheet öffnet, und ein „Zurück“ öffnet wieder das Detail.
- **Früh laden:** Enthält die Route beim Start `anbieter=` oder `ansicht=anbieter`, ruft `useRoute` gleich nach dem Parsen `preloadProviderUi()` auf. Das startet Chunk und Daten, bevor `site.json` fertig ist. `loadProviderUi` speichert das Promise im Modul. `useLazy` bekommt dasselbe Promise, ein Fehlschlag leert den Speicher.
- **Unbekannte ID:** Nach dem Laden ruft der Loader `onUnknown()` auf, und die App entfernt `anbieter` per `replaceState`.
- **Fokus:** zurück an den Opener; fehlt er, an `fallbackFocus` = aktiver Tab (`activeTab`, Plan 0008 E11).
- **Toast:** Der Seiten-Toast schweigt bei offenem Sheet (`dialogOpen` um `route.providerId` erweitern).

### E4 – Filter: drei Zustände je Anbieter, das Sheet zeigt alles

Grundlage sind `visible` (Filter, Sticker, Wegzeit-Grenze, Altersregel) und `upcoming` (alle kommenden). Jeder Katalog-Anbieter hat genau einen Zustand:

| Zustand | Bedeutung | Anzeige |
|---|---|---|
| `aktiv` | ≥ 1 sichtbares Angebot | normale Zeile, sortiert nach E5. „3 Angebote“, wenn alles sichtbar ist, sonst „1 von 3 Angeboten“ |
| `ausgeblendet` | kommende Angebote, aber keins passt zur Auswahl | nicht in der Liste. Am Ende der aktiven Zeilen steht eine Zeile „12 weitere Anbieter haben gerade nichts Passendes.“ und, wenn Filter aktiv sind, der Textknopf „Filter zurücksetzen“ |
| `ohne-termine` | keine kommenden Angebote | **offen und blass am Ende** (N3), „Gerade keine Termine im Plan“ |

- **Mit Suchtext** erscheinen auch passende `ausgeblendet`-Anbieter, blass, mit „3 Angebote, keins passt zur Auswahl“. So beantwortet die Suche „Ist X dabei?“ unabhängig von den Filtern.
- `ohne-termine` stehen auch bei aktiven Filtern in der Liste. Der Nutzer will sie „in der Liste“ haben, und sie sind nie durch einen Filter verschwunden.
- **Statuszeile** in „Anbieter“: „**5** Anbieter mit **8** Angeboten“ (Einzahl „1 Anbieter mit 1 Angebot“), gezählt über `aktiv` und `visible` mit `countProviders` (E7). Die Zeile 2 kommt wie in „Entdecken“ aus `ReachMode` (Plan 0009).
- **Sheet:** **alle** kommenden Angebote des Anbieters, unabhängig von Filtern und Alter. Unpassende markiert die Kachel (`ctx.isUnfit`). Blendet die Auswahl in der Liste etwas aus, steht darüber „Alle Angebote, auch die außerhalb deiner Auswahl.“ Das Sheet öffnet auch aus Merkliste oder Kalender und darf dort nicht durch Filter leer sein.
- Die Logik liegt in `src/domain/directory.ts`. Komponenten zählen, filtern und sortieren nicht selbst.

### E5 – Sortierung (N4), Suche

**Sortierung:**
- **Ohne Startpunkt:** alphabetisch, `localeCompare(…, "de")`.
- **Mit Startpunkt:** `aktiv` nach dem **nächsten Ort** des Anbieters, also nach der kleinsten Wegzeit über seine sichtbaren Angebote. Verglichen wird mit `compareReach` aus `reach.ts` (Plan 0009), bei Gleichstand alphabetisch.
  - **Unerreichbar** heißt in Plan 0009 Wegzeit `Infinity`. `compareReach` sortiert diese Anbieter ans Ende der aktiven Gruppe. Zwei unerreichbare (`Infinity` gegen `Infinity`) gelten als gleich und stehen alphabetisch.
  - **Fehlt** in der Tabelle die Spalte eines Orts, fällt laut Plan 0009 die **ganze Tabelle** auf die Luftlinie zurück (Modus `luftlinie`). Es gibt also nie eine Liste, in der Minuten und Kilometer gemischt stehen, und `directory.ts` braucht dafür keinen eigenen Fall.
  - Im Modus `luftlinie` (Tabelle fehlt, Spalte fehlt oder Startpunkt außerhalb) wird nach Luftlinie sortiert.
  - Liefert `reachOf` ohne Startpunkt `undefined`, wird nicht nach Entfernung sortiert (`byReach` ist falsch).
  - Im Modus `laedt` steht statt der Zeilen der Platzhalter-Block `.list-pending` („Wegzeiten werden geladen …“, Höhe wie zwei Tagesgruppen), wie die Liste in Plan 0009. Die Reihenfolge hängt hier am Ergebnis, ein Umsortieren nach dem Laden ließe die Zeilen springen.
- **`ohne-termine` immer am Ende, alphabetisch.** Begründung:
  - Sie haben keine Angebote, also keinen Ort in der Wegzeit-Tabelle (Plan 0009 rechnet nur die Orte mit Angeboten). Eine Luftlinie aus den Katalog-Orten dazwischen zu mischen, verbietet Plan 0009, E11 („je Startpunkt eine Art“).
  - Sie sind gerade nicht nutzbar. Weiter oben verdrängten sie die nahen, aktiven Anbieter.
  - Sie stehen trotzdem offen in der Liste (N3), nur am Ende und blass.
  - `anbieter.json` braucht deshalb kein `geo`.
- Die Sortierung läuft lokal und löst keinen Request aus. Die Kamera-Regel (ADR 0008) betrifft nur die Karte, sie ist hier nicht berührt.

**Suche:**
- `<input type="search">` mit sichtbarem Label „Anbieter suchen“ und Platzhalter „z. B. Bibliothek“, Schrift ≥ 16 px, `enterkeyhint="search"`.
- `matchesProviderQuery(name, query)`:
  - Der Suchtext wird an Leerzeichen zerlegt. Jeder Teil muss im Namen vorkommen.
  - **Beide Seiten** werden gleich gefaltet: Kleinbuchstaben, NFD ohne Diakritika, `ß` → `ss`, dann `ae`/`oe`/`ue` → `a`/`o`/`u`. Damit treffen sich „Nürnberg“, „nurnberg“ und „nuernberg“.
  - Ein Wort mit echtem „ue“ („Steuer“) wird auf beiden Seiten gleich gefaltet und findet sich selbst (Test).
- Unter dem Feld zählt eine Live-Region mit, `<p aria-live="polite" class="small">` „12 Anbieter“. Der Text wird **entprellt** (ca. 500 ms nach dem letzten Tastendruck), damit Screenreader nicht jeden Buchstaben ansagen. Das ist keine `role="status"`, die bleibt die Statuszeile, wie beim Hinweis im `OriginPicker`.
- Kein Treffer: „Kein Anbieter heißt so.“ mit Textknopf „Suche löschen“.
- Der Suchtext ist Sitzungszustand und steht nie in der URL. Tippen löst keinen Request aus.
- Der Suchtext lebt **im Start**, nicht im Lazy-Chunk: als `useState` in `App.tsx` (`providerQuery`), an `ProviderPanel` und den Screen durchgereicht. So übersteht er einen Tab-Wechsel, bei dem `ProviderPanel` und Screen abgebaut werden. Ein Neuladen leert ihn.

### E6 – Daten: Katalog als eigene Lazy-Datei, keine Schemaänderung

```ts
// src/domain/site-data.ts
export interface SiteProvider {
  id: string;
  name: string;
  /** Website; laut Katalog bei allen 74 zugleich eine Programm-URL */
  url: string;
  topics: Topic[];
  venues: Array<{ name: string; address: string; district?: string }>; // address über venueAddress (Plan 0007, H6)
}
export interface ProviderDirectoryData {
  /** derselbe Datenstand wie site.json (M4) */
  generatedAt: string;
  providers: SiteProvider[];
}
export function toProviderDirectory(providers: readonly Provider[], generatedAt: string): ProviderDirectoryData; // nur role "anbieter", nach Name
```

- **Alle Felder gibt es im Katalog schon.** Keine Schemaänderung, `schema/*.json`, Skill und Pipeline bleiben unberührt.
- **Nicht ausgeliefert:** `programme[]`, `notes`, `availability`, `verified`, `age`, `formats`, `costs`, `registrations`, `coveredBy`, `ring`, `geo`, Orts-IDs. Das ist Datensparsamkeit, und es spart Bytes.
  - Für Eltern taugt nur `url`, das bei allen 74 Anbietern zugleich eine Programm-URL ist. Der Link heißt deshalb „**Website & Programm**“.
  - `geo` braucht es nicht, weil `ohne-termine` nicht nach Entfernung sortiert werden (E5).
- **Abgeleitet, nie gespeichert** (`directory.ts`): Zustand, Zahlen, Stadtteile, nächste Wegzeit, Kategorien.
- **Kategorien** = `categoriesOf(Katalog-Themen ∪ Themen der kommenden Angebote)`, weil bei 10 Anbietern die Angebote mehr Kategorien haben als der Katalog nennt.
- **Datei** `public/data/anbieter.json`, geschrieben von `scripts/build-data.ts`. Gemessen: **30,6 kB roh, 7,63 kB gzip**, ca. +0,1 kB je Anbieter.
  - **Verworfen: in `site.json`.** Das wären +7 bis 9 kB gzip für jeden Besuch, auf dem Weg zum LCP, für eine Nebenfunktion.
- **Laden** (`src/data/providers.ts`), in zwei getrennten Schritten (Review 2, M1):
  - `loadProviderDirectory(fetchFn = fetch)` lädt `${BASE_URL}data/anbieter.json` **ohne** Kenntnis von `site.json`. HTTP ≠ 2xx wirft. `fetch` wird injiziert, weil `vitest.setup.ts` `fetch` verbietet.
    - Grund: Beim Deep-Link startet das Vorladen schon beim Parsen der Route, also bevor `site.json` da ist (E3). Ein Lader, der den erwarteten Stand als Argument braucht, könnte dann nicht starten. Ein Argument, das sich nach dem Laden von `site.json` ändert, gäbe `useLazy` eine neue `load`-Identität und damit einen zweiten Ladelauf.
  - `ensureFresh(data, expected, fetchFn = fetch)`: Der Abgleich ist ein eigener Schritt, sobald `site.json` da ist.
    - Stimmt `data.generatedAt` mit `expected` (aus `site.json`) überein, liefert er `data` unverändert zurück.
    - Sonst, weil GitHub Pages oder der Browser eine ältere Fassung cacht, folgt **höchstens ein** Request mit `cache: "reload"`. Das Ergebnis wird im Modul gemerkt (ein Promise je `expected`), damit Liste und Sheet nicht zweimal nachladen.
    - Aufgerufen wird er in `ProviderPanel.tsx` (Start, Paket A) per `useEffect`, sobald `expected` vorliegt, für Liste und Sheet. Screen und Sheet bekommen `directory` schon abgeglichen und rufen ihn nie selbst auf (geändert im Schritt „Schnittstellen“, siehe „Umsetzung“).
  - Weicht der Stand nach dem Reload immer noch ab, wird die Datei trotzdem genutzt. Für jeden Anbieter, der in den Angeboten vorkommt, aber in der Datei fehlt, baut `directory.ts` eine **Rückfall-Zeile** aus `providerName` und `venue` der Angebote: Themen aus den Angeboten, keine Website, im Sheet kein Website-Knopf.
  - Anbieter, die nur in der Datei stehen, sind ohne Angebote ohnehin `ohne-termine`.
  - So gilt immer `active.length === countProviders(visible)` (Test).
- `data/offers.json` und `data/providers.yaml` werden nicht angefasst. Die Plausibilität gegen die Live-Seite (ADR 0002) bleibt gleich.
- **Fixtures** (fiktiv) bekommen zwei Einträge:
  - `turnverein-beispiel` („Turnverein Beispiel (fiktiv)“), `role: anbieter`, **ohne Angebote**, Themen `eltern-kind-turnen`, `bewegung`, zwei Orte:
    - „Turnhalle Beispiel“ mit Adresse „Turnhalle Beispiel, Sportweg 3, 90441 Nürnberg“. Sie beginnt mit dem Ortsnamen, `venueAddress` kürzt sie. Dazu `district: Schweinau`.
    - „Gymnastikraum Beispiel“, „Am Beispielpark 7, 90480 Nürnberg“, ohne `district`.
  - `sammelkalender-beispiel`, `role: aggregator`, ohne `adapter`. Er darf in `anbieter.json` nicht auftauchen.
  - Nachziehen: `dataset.test.ts` (`providers: 7`) und alle Tests, die über `loadFixtures()` Anbieter zählen oder auswählen. Konkret zu prüfen sind `scripts/pipeline/lib/select.test.ts`, `draft.test.ts`, `raw.test.ts` und `build-offers.test.ts` sowie in `src/domain` `site-data.test.ts`, `saved.test.ts`, `ics.test.ts` und `agenda.test.ts`.

### E7 – Ladekette, Architekturregeln, Budgets der Anbieterübersicht

**Ladekette in zwei Stufen** (Vorbild Plan 0005):
- **Start:** `src/ui/ProviderPanel.tsx` exportiert:
  - `ProviderPanel` für den Tab;
  - `ProviderSheetLoader`, den Inhalt des immer gemounteten Sheet-Dialogs (E3);
  - `preloadProviderUi()`.
  - Gemeinsamer Lader, **ohne Argument** (stabile Identität für `useLazy`, Review 2 M1):
    ```ts
    let pending: Promise<ProviderUi> | undefined;
    async function fetchUi(): Promise<ProviderUi> {
      const [ui, data] = await Promise.all([import("./anbieter/entry.ts"), loadProviderDirectory()]);
      return { ...ui, data };
    }
    export function loadProviderUi(): Promise<ProviderUi> {
      pending ??= fetchUi().catch((e: unknown) => { pending = undefined; throw e; });
      return pending;
    }
    export const preloadProviderUi = (): void => void loadProviderUi().catch(() => {});
    ```
    Das bleibt eine async-Funktion mit `await import(…)`, wie `Lazy.tsx` verlangt. Den Datenstand gleicht `ensureFresh` danach ab (E6).
  - Zustände: laden (Platzhalter in `.lazy-box`), Fehler (`LoadFailed` in `.lazy-box`), da.
  - `LoadFailed` bekommt eine Prop `className` (Standard `"map-note"`, die Anbieter nutzen `"lazy-note"`). `.map-note` ist absolut im Kartenrahmen positioniert und passt nicht in eine Liste.
- **Lazy:** `src/ui/anbieter/`: `entry.ts` (exportiert `ProviderScreen` und `ProviderSheet`, damit es ein Chunk bleibt), `ProviderScreen.tsx`, `ProviderSheet.tsx`, `provider-format.ts` (+Test). Dazu `src/domain/directory.ts`, das nur von hier importiert wird.
- **Props-Typen** in `src/ui/provider-types.ts` (wie `map-types.ts`). `ProviderScreenProps` enthält `reachMode: ReachMode` aus Plan 0009 (M3).
- **Statuszeilen-Zahl** im Start: `countProviders(offers)` in einem eigenen Mini-Modul `src/domain/provider-count.ts`, damit `directory.ts` nicht in den Start rutscht (Muster `place-key.ts`).
- **Stile:** `src/ui/styles/anbieter.css` im Start-CSS (ca. +0,3 kB). Die Zeilen nutzen die Klassen der Orts-Liste (`.places`, `.place`). Neu sind `.place.idle`, `.lazy-box`/`.lazy-note`, die Suche und der Sheet-Kopf.

**Architekturregeln** (je mit Kanarienvogel, ADR 0004):
- `anbieter-ui-only-lazy`: `from: { path: "^src/", pathNot: "^src/ui/anbieter/" }` → `to: { path: "^src/ui/anbieter/", dependencyTypesNot: ["dynamic-import"] }` ist verboten, auch für reine Typ-Importe.
- `anbieter-ui-entry-only`: Nur `src/ui/ProviderPanel.tsx` greift auf `src/ui/anbieter/` zu.
- **`directory-only-lazy` (M5):** `to: { path: "^src/domain/directory\\.ts$" }` nur von `^src/ui/anbieter/` und `^src/domain/directory\\.test\\.ts$`. Es gibt keinen Typ-Import von außen, die Typen liegen in `provider-types.ts` bzw. `site-data.ts`.
- **`lazy-domain-apart` (M5):** `directory.ts` importiert keine nur von der Karte genutzten Domänenmodule (`places.ts`, `camera.ts`). Und umgekehrt: Ein Modul, das nur die beiden Lazy-Chunks teilen, käme sonst als eigener Chunk nach `assets/` und zählte ins Startbudget.
- `scripts/check-architecture.ts`, `LAZY_LOADERS`: Neu ist `["src/ui/ProviderPanel.tsx", "./anbieter/"]`.
- `vite.config.ts`, `chunkFileNames`: Ein Chunk mit einem Modul aus `/src/ui/anbieter/` landet in `assets/anbieter/[name]-[hash].js`.
- **Chunk-Wächter** (aus Paket 0, E8): Direkt in `dist/assets/` liegt genau eine JS-Datei (`index-*.js`). Die Prüfung ist nicht rekursiv, Unterordner wie `karte/` und `anbieter/` zählen nicht, `.js.map` wird ignoriert. Damit fällt eine Abspaltung gemeinsamer Teile wie im Kalender-Versuch sofort auf.

**Budgets** (`.size-limit.json`):
- `JS (initial)` steigt auf **92 kB** (ADR 0012, Option a). Ziel nach diesem Plan ≤ 91,0 kB.
- **Zuwachs durch diesen Plan: ≤ 1,3 kB gzip.** Geschätzt:
  - Route und `useRoute` ca. 0,3 kB;
  - Lader, Sheet-Loader und Vorladen ca. 0,35 kB;
  - vierter Tab mit Icon ca. 0,2 kB;
  - Statuszeile und Verdrahtung ca. 0,2 kB;
  - Detail-Knopf ca. 0,08 kB;
  - `src/data/providers.ts` samt Datenstand-Abgleich ca. 0,15 kB;
  - `provider-count.ts` ca. 0,03 kB.
- Neu `Anbieter JS (lazy)`, `dist/assets/anbieter/*.js`: **6 kB**. Geschätzt sind 3 bis 4 kB.
- Neu `Daten (anbieter.json)`, `dist/data/anbieter.json`: **15 kB** (gemessen 7,63 kB).
- `CSS` bleibt 15 kB. Hinzu kommen ca. 0,3 kB (Tab-Leiste und Anbieter).

### E8 – Paket 0: Verschlankung des Startbundles (M1)

**Reihenfolge (N1, M1):** Plan 0009 → Paket 0 → Pakete A/B dieses Plans.

**Ziel:** Start-JS nach Plan 0009 und 0010 **≤ 89,0 kB** (1 kB Reserve). Mit dem Zuwachs von ≤ 1,3 kB (E7) muss das Start-JS **vor** der Anbieter-UI bei ≤ 87,7 kB liegen. Die Schwellen passen zu Plan 0009: 88,6 kB ist dort der Entscheidungspunkt, 89,0 kB die Obergrenze nach seiner UI. Liegt 0009 am Ende bei `X`, muss Paket 0 `X − 87,7` kB einsparen. Bei `X = 89,0` sind das 1,3 kB.

**Stand nach Plan 0009 (2026-10-05):**
- `X = 89,80 kB` auf `main` (2d134a2, Plan 0009 live). Paket 0 muss also **≈ 2,1 kB** sparen.
- Mit der Nacharbeit zu Plan 0009 (H1–H8, Branch `worktree-hinweise-0009`, 66ed39c) sind es **90,09 kB**. Die Nacharbeit wartet auf Paket 0, weil sie allein das Budget von 90 kB reißt (Plan 0009, „Budget“).
- Paket 0 baut deshalb auf der Nacharbeit auf und muss **≈ 2,4 kB** sparen.
- Die gemessenen Kandidaten reichen knapp: A −0,64 kB, B ≈ −1,3 kB (nur ohne React-Abspaltung), C −0,6 bis −0,9 kB.
- Reicht es nicht, greift Schritt 6 (ADR 0012, Entscheidung des Nutzers).

**Messung per Sourcemap und Versuch** (2026-10-05, `4d4c063`, Ausgang 87,30 kB). Die Sourcemap von `index-*.js` (minifiziert, ohne gzip) zeigt die Verteilung:
- React-DOM 207 kB von 280 kB;
- vom eigenen Code `App.tsx` 4,7 kB, `CalendarView.tsx` 4,2 kB, `DetailDialog.tsx` 4,1 kB, `Chrome.tsx` 3,8 kB, `format.ts` 3,6 kB, `use-app-state.ts` 3,1 kB, `districts.ts` 2,4 kB, `Sheets.tsx` 2,3 kB, `KidSheet.tsx` 2,2 kB, `agenda.ts`/`time.ts`/`icons.tsx` je 2,0 kB, `ics.ts` 1,9 kB.

Da gzip nicht additiv ist, wurde die Ersparnis gemessen. Dafür wurde der Kandidat vorübergehend entfernt bzw. lazy gemacht, `vite build` und size-limit liefen, danach wurde zurückgebaut.

| Kandidat | entfernt | als Lazy-Chunk | Bewertung |
|---|---|---|---|
| **A – Merklisten-ICS lazy beim Export.** `icsForCollection`/`icsContextFor` per `import()` im Export-Handler. `seriesIcsPath`/`sessionIcsPath` ziehen nach `src/domain/ics-paths.ts`, damit `ics.ts` den Start verlässt. | −0,72 kB | **−0,64 kB** (Chunk 1,04 kB, keine Abspaltung) | **empfohlen.** Export ist eine seltene, ausdrückliche Handlung. Offline: Chunk nach dem ersten Rendern im Leerlauf vorladen (`requestIdleCallback`, sonst `setTimeout`). Schlägt der Export trotzdem fehl, meldet der Toast „Export gerade nicht möglich – bitte mit Netz nochmal versuchen.“ |
| **B – Kalender lazy beim Tab-Wechsel** (`CalendarView`) | −1,51 kB | **−0,22 kB** (mit `useLazy`-Lader −0,19 kB): Rolldown spaltet React samt `jsx-runtime` in einen eigenen Start-Chunk ab (3,16 kB), Start 83,92 + 3,16 = 87,08 kB. Ein Lader im Stil von `useLazy` statt `React.lazy` ändert nichts. Eine triviale zweite Lazy-Komponente spaltet nicht ab | **bedingt**: Erst die Ursache der Abspaltung klären und per Rolldown-Konfiguration verhindern. Dann sind etwa −1,3 kB zu erwarten (entfernt −1,51 abzüglich Lader). Dazu nach dem ersten Rendern im Leerlauf vorladen, weil es keinen Service Worker gibt (offline wäre der Kalender sonst weg). Gelingt das nicht: verworfen |
| **C – Vite-Preload-Helfer** | ca. −0,6 bis −0,9 kB (Ausschnitt aus dem Bundle, grob) | – | **prüfen.** Er entfällt nur mit `build.modulePreload: false`, wenn kein Lazy-Chunk CSS-Abhängigkeiten hat. Das Karten-CSS müsste `MapView` dann selbst als `<link>` setzen (`?url`), mit Lade-Zustand gegen ungestylte Bedienelemente. Messen, dann entscheiden |
| D – Detail-Inhalt lazy | −1,40 kB | – | **verworfen**: Kern-Interaktion, der erste Tipp auf eine Kachel würde warten, Deep-Link `angebot=`, offline |
| E – Stadtteil-Tabelle lazy | −0,73 kB | – | **verworfen**: Ein gespeicherter Stadtteil braucht sie beim Start (Entfernung bzw. Wegzeit sofort, Plan 0009 lädt dann die Tabelle), das Kind-Sheet bleibt statisch |
| F – Filter-/Kind-Sheet lazy | (8,8 kB minifiziert) | – | **verworfen** (Review M1, Nicht-Ziele) |

**Vorgehen in Paket 0** (eigener Branch, eigener Commit, eigenes Arch-Review, weil Lazy-Chunks und Regeln dazukommen):
1. Ausgangswert `X` auf `main` nach Plan 0009 messen und notieren. Sourcemap-Tabelle neu erzeugen.
   - Das Skript liegt **nicht** im Repo. Die Methode steht hier: Segmente der Sourcemap je Quelle aufsummieren, Ersparnis per Entfernen messen.
2. **Chunk-Wächter** einbauen:
   - `scripts/check-chunks.ts` prüft nach dem Build, dass **direkt** in `dist/assets/` genau eine Datei auf `.js` endet. Nicht rekursiv, `.js.map` und andere Endungen werden ignoriert.
   - Er hängt am Skript `size` in `package.json` (`node scripts/check-chunks.ts && size-limit`) und läuft damit lokal und in CI.
   - **Kanarienvogel:** ein dynamischer Import eines neuen Moduls, für das keine Ordnerregel in `chunkFileNames` greift. Der Chunk landet in `assets/`, der Wächter wird rot.
3. **A umsetzen**, test-first:
   - `ics-paths.ts` bekommt die Pfad-Tests aus `ics.test.ts`.
   - `SavedView` lädt `ics.ts` im Export-Handler. **Auch `icsContextFor`** wandert in den Handler: Heute baut `SavedView` die Einträge samt Kontext schon beim Rendern. Bleibt der Import dafür statisch, bleibt `ics.ts` im Start.
   - Vite-Ziel `assets/export/`, Budget-Zeile `Export JS (lazy)` 2 kB. Messen.
   - Der Download geschieht nach einem `await`. Ob iOS Safari ihn dann noch als Folge des Tipps gelten lässt, prüft der Browser-Review am echten iPhone. Das Vorladen im Leerlauf sorgt dafür, dass das `await` praktisch sofort auflöst.
4. **Ursache der React-Abspaltung klären** (Pflicht, auch wenn der Kalender am Ende nicht lazy wird, denn der Anbieter-Chunk hängt davon ab):
   - **Hooks sind es nicht.** `karte/MapScreen.tsx` nutzt Hooks und spaltet nicht ab, eine triviale Probe mit `useState` auch nicht.
   - Zu untersuchen: was `CalendarView` anders importiert (Modulgraph des Chunks gegen den von `MapScreen` vergleichen, z. B. per `rolldown`-Ausgabe oder Sourcemap), und ob der zweite statisch erreichbare React-Nutzer im Lazy-Graphen die Aufteilung auslöst.
   - Werkzeug ist die Rolldown-Option **`output.codeSplitting`** (Gruppen, Mindestgrößen). Das veraltete `advancedChunks` wird nicht verwendet.
   - Ergebnis (Ursache und Konfiguration) wird hier notiert.
   - Gelingt eine Aufteilung ohne Abspaltung (Chunk-Wächter grün): Kalender umsetzen (`assets/kalender/`, Budget `Kalender JS (lazy)` 3 kB, Regeln `kalender-only-lazy`/`kalender-entry-only`, `LAZY_LOADERS`, Vorladen im Leerlauf, `LoadFailed` im Tab). Sonst den Kalender verwerfen und das Ergebnis notieren.
5. Reicht es noch nicht für ≤ 87,7 kB: **C messen** und ggf. umsetzen.
6. Reicht auch das nicht: **ADR 0012** (Budget oder Stack, z. B. ein kleineres React-Pendant). Das ist der letzte Ausweg, nicht Teil dieses Plans.

**Ergebnis Paket 0 (2026-10-05, Branch `paket0-0010`):**
- **Ausgang:** `X` = 90,09 kB (Plan 0009 mit Nacharbeit). Die Sourcemap von `index-*.js` (minifiziert) zeigt:
  - react-dom 207,0 kB, react 8,2 kB, scheduler 3,5 kB;
  - `format.ts` 6,2 kB, `App.tsx` 5,4 kB, `CalendarView.tsx` 4,5 kB, `DetailDialog.tsx` 4,1 kB, `Chrome.tsx` 3,8 kB, `use-app-state.ts` 3,1 kB, `Sheets.tsx` 2,5 kB, `districts.ts` 2,4 kB, `KidSheet.tsx` 2,3 kB, `agenda.ts` 2,1 kB, `Lazy.tsx` 2,1 kB, `icons.tsx` 2,0 kB, `time.ts` 2,0 kB, `ics.ts` 1,9 kB.
- **Chunk-Wächter:** `scripts/check-chunks.ts` mit `scripts/lib/chunks.ts` (Unit-Test), am Skript `size`. Der Kanarienvogel (dynamischer Import von `src/ui/zz-canary.ts` ohne Ordnerregel) ist rot geworden: „Chunk direkt in dist/assets/: zz-canary-….js“.
- **A umgesetzt:** **90,09 → 89,61 kB (−0,48 kB)**, Chunk `assets/export/ics-*.js` 1,15 kB.
  - Etwas weniger als die gemessenen −0,64 kB: Lader, Vorladen im Leerlauf und Fehler-Toast bleiben im Start.
  - Das Vorladen startet nach dem ersten Rendern mit Daten (`requestIdleCallback`, Zeitlimit 3 s, sonst `setTimeout` 1 s), für alle gleich.
  - E2E-Tests, die „kein Request ab …“ zählen, warten vorher darauf (`exportPreload` in `e2e/fixtures.ts`).
  - Fehlschlag: Der Toast lautet „Export gerade nicht möglich – mit Netz die Seite neu laden und nochmal tippen.“ Chromium behält einen gescheiterten `import()`, auch den des Vorladens im Leerlauf. „Nochmal versuchen“ allein liefe dort in eine Schleife (Arch-Review, Befund 1).
  - Typen in `src/domain/ics-types.ts`, Vorbild `transit-types.ts`.
  - **Kanarienvögel der neuen Regeln** (Arch-Review, Befund 4), jeweils rot, nach dem Rückbau grün:
    - Typ-Import aus `ics.ts` in `DetailDialog.tsx` → `ics-only-lazy` und `ics-entry-only`;
    - statischer Import im Lader `SavedView.tsx` → `ics-only-lazy`. dependency-cruiser meldet ihn hier selbst, `lazy-loader-static` ist die zweite Linie;
    - dynamischer Import aus `DetailDialog.tsx` → `ics-entry-only`.
- **Schritt 4, Ursache der Abspaltung (Rolldown 1.2.12):**
  - Mit lazy Kalender spaltet Rolldown **`jsx-runtime`** (react samt `__commonJS`-Helfer, 3,2 kB gzip) und **`time.ts`** (0,9 kB) als eigene Start-Chunks ab. Beide erreichen der Einstieg und **mehrere** Lazy-Chunks: `jsx-runtime` Karte und Kalender, `time.ts` Export und Kalender.
  - Ohne `experimental.chunkOptimization` entstehen elf Start-Chunks. Die Optimierung (`mergeCommonChunks`) holt alle bis auf diese zwei in den Einstieg zurück, auch Module mit drei Nutzern wie `geo.ts`. Laut Doku mischt sie nicht, wenn eine zirkuläre Chunk-Abhängigkeit entstünde. Warum sie gerade diese zwei für unsicher hält, steht nicht in Typen oder Doku.
  - **Ohne Wirkung:**
    - `treeshake.moduleSideEffects` für React und eigene Module (dieselben Hashes);
    - `preserveEntrySignatures: false`;
    - eine `codeSplitting`-Gruppe namens `index` (ergibt einen weiteren Chunk plus `rolldown-runtime`).
  - `codeSplitting.experimentalInlineCommonChunks` verschlechtert auf 93,67 kB mit Laufzeit-Chunk.
  - **Kalender verworfen** (Plan-Vorgabe). Für die Anbieter-UI heißt das: Ihr Lazy-Chunk teilt `jsx-runtime` mit Karte bzw. Kalender und wird dieselbe Abspaltung auslösen. Der Chunk-Wächter macht das im Schritt „Schnittstellen“ sofort sichtbar.
- **C gemessen:** kein Gewinn. Auch mit `modulePreload: false` und vorübergehend ganz ohne CSS in Lazy-Chunks bleibt Vites Preload-Helfer im Start-JS (89,61 kB unverändert).
- **Ziel ≤ 87,7 kB nicht erreicht.** Es fehlen 1,9 kB. Nach Schritt 6 entscheidet der Nutzer über **ADR 0012**. Optionen:
  - (a) Budget anheben, z. B. auf 92 kB;
  - (b) kleineres React-Pendant (Preact), Stack-Änderung;
  - (c) Rolldown-Abspaltung als Issue melden, auf eine Version warten und dann Kalender und Anbieter lazy machen;
  - (d) weitere Kandidaten aus der Sourcemap.
  Bis dahin starten weder „Schnittstellen“ noch A/B.
- Nacharbeit 0009 und Paket 0 liegen zusammen unter dem Budget von 90 kB und gehen gemeinsam nach `main`.

**Entscheidung (2026-10-05, ADR 0012):** Option (a) mit Workaround.
- Nachgemessen: Ursache der Abspaltung ist rolldown#11026. `output.codeSplitting.groups: [{ name: "index", tags: ["$initial"] }]` hält alles, was der Einstieg statisch erreicht, im Einstieg. Auf `main` ändert die Gruppe nichts (gleicher Hash, 89,62 kB).
- Ein **realistischer** Anbieter-Stub, der geteilte Start-Module nutzt (`Dialog`, `Icon`, `plural`, `berlinIsoDate`), spaltet ohne Gruppe `jsx-runtime` und `time` ab, auch ohne lazy Kalender (90,86 kB, Wächter rot). Mit Gruppe sind es 89,75 kB, Wächter grün. Ein trivialer Stub mit `useState` spaltet nie ab und taugt deshalb nicht als Probe.
- `JS (initial)` steigt auf 92 kB. Das Eintrittsziel von 87,7 kB entfällt, das Ziel nach diesem Plan ist ≤ 91,0 kB.
- Kalender und Merkliste lazy (−1,65 kB) sowie Preact (−60,5 kB) stehen mit Messwerten in `docs/ideas.md`.

**Fertig, wenn** das Start-JS ≤ 87,7 kB ist (bzw. `X` − Ersparnis notiert; ersetzt durch ADR 0012: Budget 92 kB, kein Eintrittsziel mehr), der Chunk-Wächter läuft, `pnpm check` grün ist und Arch-Review sowie Browser-Review (Merkliste-Export, ggf. Kalender offline nach dem Laden) eingetragen sind.

**Wechselwirkung mit diesem Plan:** Der Anbieter-Chunk ist selbst eine React-Lazy-Komponente.
- Ob er die Abspaltung auslöst, wird **vor** den parallelen Paketen geprüft: Im Schritt „Schnittstellen“ ist der Stub `anbieter/entry.ts` eine kleine Komponente, die `ProviderPanel` per `import()` lädt und **geteilte Start-Module** nutzt (umgesetzt mit `Icon`, `plural`, `standDate` samt `time.ts`), wie es Screen und Sheet später tun (ADR 0012). Danach laufen `pnpm build && pnpm size` samt Chunk-Wächter.
- **Kanarienvogel des Workarounds:** Ohne die Gruppe `$initial` wird der Wächter mit diesem Stub rot, mit ihr grün.
- Bleibt der Wächter grün, beginnen A und B. Wird er trotz Gruppe rot, wird nichts parallel begonnen, bis die Ursache geklärt ist.

### E9 – Privatsphäre

- **Kein neuer Drittanbieter-Request.** `anbieter.json` und die Chunks kommen vom eigenen Origin, für alle gleich, ohne Querystring. Der Reload-Request nach M4 ist ebenso für alle gleich. Der `thirdPartyGuard` bleibt scharf.
- Plan 0009 führt die Invariante ein: Kein Request hängt davon ab, welcher Startpunkt gilt. Hier lädt die Datei beim Öffnen des Tabs bzw. Sheets und beim Start mit `ansicht=anbieter`/`anbieter=` in der URL, nie wegen eines Startpunkts. Die Invariante gilt also weiter.
- **Externe Links** öffnen mit `target="_blank" rel="noopener"`. Der Referrer bleibt beim Browser-Standard (ADR 0008).
- **URL:** Hinzu kommen nur `ansicht=anbieter` und `anbieter=<id>`, öffentliche IDs wie `angebot=`. Suchtext, Geburtsdatum, Startpunkt und Merkliste kommen nie hinein. „Kennt keinen Startpunkt“ in `route.test.ts` läuft künftig auch über `anbieter` und mit `providerId: "theater-beispiel"`.
- Sortierung und Suche laufen lokal. E2E belegt: Ab Startpunkt-Wahl bzw. Tastendruck entsteht kein Request.

### E10 – Darstellung, Zustände und Plan-0009-Anschluss (M3)

**Zeile** (Button ≥ 44 px, `.places`/`.place`):
- `<b class="provider-name">` mit vollem Namen und `hyphens: auto` (`lang="de"`). Das Text-Gate überspringt `hyphens: auto` mit derselben begründeten Regel wie bei Titeln.
- Zweite Zeile aus `providerLine(row, mode)`: „3 Angebote · Gostenhof · 25 Min.“.
  - Bei mehr als zwei Stadtteilen: „Gostenhof, St. Johannis +2“. Der Stadtteil ist `venue.district ?? venue.name`.
  - Die Wegzeit bzw. Entfernung kommt in der Kurzform der Kachel aus Plan 0009.
  - Im Modus `laedt` gibt es keine Zeilen, sondern den Platzhalter-Block (E5). Zeilen kennen deshalb keinen `.dist`-Platzhalter, den gibt es nur auf den Kacheln im Sheet (Plan 0009), und nur als Ladezustand. Hat eine Zeile **keinen Wert** (kein Startpunkt bzw. kein sichtbares Angebot), entfällt die Wegzeit ganz.
- `idle`-Zeilen (`ohne-termine`, bei Suche auch `ausgeblendet`). **Reihenfolge:** erst die `ausgeblendet`-Treffer der Suche, dann `ohne-termine`, jeweils alphabetisch. Wer Angebote hat, die nur nicht zur Auswahl passen, ist näher an „nutzbar“ als ein Anbieter ganz ohne Termine.
  - Klasse `.place.idle` mit gestricheltem Rahmen (Stickerheft: „noch nicht eingeklebt“) in derselben Rahmenfarbe wie die normale Zeile, nur gestrichelt. Text in `--muted`, kein `opacity`. AA prüft axe.
  - Zweite Zeile: „Gerade keine Termine im Plan“ bzw. „3 Angebote, keins passt zur Auswahl“. Die Stadtteile kommen dann aus dem Katalog.

**Anbieter-Sheet** (`ProviderSheet.tsx`, Hülle wie beim Orts-Sheet):
1. `h2` mit dem Namen, `font-size: 1.375rem` und `hyphens: auto`, weil viele Namen sehr lang sind.
2. Kategorien als Text (`CATEGORY_LABELS`).
3. `<a class="btn wide" href={url} target="_blank" rel="noopener">` mit Icon `external`, Text „Website & Programm“. Fehlt bei der Rückfall-Zeile (E6).
4. `h3` „Ort“ bzw. „Orte“: Katalog-Orte mit Name, Adresse und Stadtteil. Bei Rückfall-Zeilen kommen die Orte aus den Angeboten.
5. `h3` „Kommende Angebote (7)“, ggf. mit dem Hinweis aus E4. Dann die Kacheln nach dem nächsten Termin (`groupByNextSession`, `dated`) mit **`context="provider"`**.
   - `OfferCard` bekommt statt zweier Booleans `context?: "place" | "provider"`. Das ersetzt `atPlace` aus Plan 0008, `PlaceSheet` übergibt `context="place"`.
   - `provider` lässt den Anbieternamen in der Meta-Zeile weg, `place` den Ort.
6. Ohne kommende Angebote: „Gerade stehen keine Termine im Zwergenplan. Auf der Website steht vielleicht mehr.“
7. Fuß: „Schließen“.

**Zustände:**
- **Laden:** `.lazy-box` mit fester Mindesthöhe (CLS), „Anbieter werden geladen …“. Im Sheet steht „Anbieter wird geladen …“.
- **Fehler:** `LoadFailed className="lazy-note"` in `.lazy-box`: „Die Anbieter konnten nicht geladen werden.“ Erst kommt „Nochmal versuchen“, beim zweiten Mal „Seite neu laden“ (die URL behält Tab bzw. `anbieter=`).
- **Leer:**
  - Keine Daten: `NoOffers` aus `ListView.tsx`, darunter die `ohne-termine`-Zeilen.
  - Filter ohne aktiven Anbieter: `NoOffers` mit „Filter zurücksetzen“, darunter die `ohne-termine`-Zeilen.
  - Suche ohne Treffer: E5.
- **Wegzeit** (Plan 0009, `ReachMode`): `laedt` → Platzhalter-Block, `oepnv` → Minuten, `luftlinie` → km. Die Begründung steht in der Statuszeile (Plan 0009). `want()` wird hier **nicht** aufgerufen: Ein Startpunkt entsteht nur über Kind-Sheet, Karte oder einen gespeicherten Stadtteil, und dort hat Plan 0009 die Tabelle schon angefordert.

**Text-Gate, Touch, Dunkelmodus:**
- Alle Bedienelemente sind ≥ 44 px, die Suche hat ≥ 16 px Schrift.
- Tab-Labels stehen bei 100 % einzeilig und brechen nie im Wort: `nowrap`, sonst Nur-Icon per Container-Query.
- Bei 320 px / 200 % ragt nichts heraus.
- Es gibt nur Tokens, `expectNoBrightIslands` prüft.

### E11 – Merkliste und ICS: „alle Termine dieses Anbieters“ → `docs/ideas.md`

Nicht in diesem Plan. Gründe:
- **Menge:** Bis zu 71 Angebote, regelmäßige mit Dutzenden Terminen, fluten den Kalender (ein VEVENT je Termin, ADR 0003).
- **Der gezielte Weg existiert:** Angebote im Sheet merken, dann die Merklisten-ICS (ADR 0007).
- **Der eigentliche Wunsch ist ein Abo.** Dass neue Termine von selbst kommen, ist die Idee „Abo-Feeds (webcal)“. Eine statische Datei je Anbieter veraltet.
- `docs/ideas.md` bekommt die Einträge „Anbieter-Feed (webcal)“ und „Anbieter merken/folgen“.

### E12 – Berührungspunkte mit Plan 0008 und 0009

**Voraussetzungen:** Plan 0008 und Plan 0009 sind auf `main` (N1). Dieser Plan baut auf deren Stand auf.

**Stand 2026-10-05:** Plan 0009 ist live (`main` 2d134a2, Start-JS 89,80 kB). Die Nacharbeit H1–H8 (66ed39c) liegt darunter, mit 90,09 kB. Die Spalte „Plan 0009“ unten gilt mit diesen Ergänzungen der Nacharbeit:
- `src/ui/Sheets.tsx`: `LimitAction` mit `focusTarget`, `LimitActionFor`.
- `src/ui/use-transit.ts`: `retry()`, `reloadAfterRetry`.
- `src/ui/format.ts`: `originHint`.
- `src/ui/OriginPicker.tsx`, `KidSheet.tsx`: `reachMode`.
- `e2e/mobile-ux.ts`: Text-Gate N5.

| Datei | Plan 0008 | Plan 0009 | Plan 0010 ändert |
|---|---|---|---|
| `src/domain/route.ts`, `route.test.ts` | – | `umkreis` → `wegzeit`, Test „kein Startpunkt“ | Tab `anbieter`, `providerId`, Tests |
| `src/domain/ids.ts`, `schema.ts` | – | `Timetable`, − `nearestStops` | `KEBAB_ID_PATTERN` (eine Zeile in `schema.ts`) |
| `src/ui/App.tsx` | `LoadState.reason`, `activeTab` | Statuszeile Wegzeit, Hinweise | Tab `anbieter`, Statuszeile, Sticker-Bedingung, `ProviderPanel` |
| `src/ui/Overlays.tsx` | `fallbackFocus` | Durchreichen | Sheet-Dialog vor dem Detail |
| `src/ui/Chrome.tsx`, `styles/tabs.css` | `TabBar.currentRef`, Badge quer | Badge (Wegzeit) | vierter Tab, Leisten-Geometrie (E2) |
| `src/ui/icons.tsx` | – | – | Icon `store` |
| `src/ui/DetailDialog.tsx` | `.detail-body` | Wegzeit-Text | Knopf über „Website von …“ |
| `src/ui/OfferCard.tsx`, `karte/PlaceSheet.tsx` | `atPlace` | Wegzeit-Kurzform | `context` statt `atPlace` |
| `src/ui/Lazy.tsx` | `retry` | ggf. Lader | Prop `className` an `LoadFailed` |
| `src/ui/SavedView.tsx`, `src/domain/ics.ts` | – | – | Paket 0 (A): Export lazy, `ics-paths.ts` |
| `src/ui/use-offer-views.ts` | `calendar.allIndex` | `reachFn`, `ReachMode` | **unverändert** |
| `src/ui/format.ts` | `loadErrorText` | `reach*` | `providerStatusParts` |
| `src/ui/use-app-state.ts` | – | – | `openProvider`/`closeProvider`, `preloadProviderUi` |
| `scripts/build-data.ts` | – | `wegzeit.json` | `anbieter.json` |
| `vite.config.ts`, `.size-limit.json`, `.dependency-cruiser.cjs`, `scripts/check-architecture.ts` | – | ggf. Wegzeit-Zeilen | Anbieter-/Export-/ggf. Kalender-Zeilen, Regeln |
| `package.json` | – | – | Skript `size` mit Chunk-Wächter (Paket 0) |
| `scripts/font-fallback.ts` | – | – | Tabs 12/600 |
| `e2e/layout.spec.ts`, `mobile-ux.spec.ts` | Regressionen, Badge quer | Wegzeit-Ansichten | Tab-Leiste mit vier Tabs, Anbieter-Ansichten |
| `docs/architecture.md` | Datenfluss, Gates | Wegzeit, Invariante | Datenfluss, Ladeketten, Chunk-Wächter |

### E13 – Arbeitsteilung

- **Paket 0** (E8) läuft allein und zuerst, auf eigenem Branch, nach Plan 0009.
- Danach ein gemeinsamer Schritt „Schnittstellen“ (ein Commit): `SiteProvider`/`ProviderDirectoryData`, `provider-types.ts`, `anbieter/entry.ts` als Stub per `import()` verdrahtet, die Regeln `anbieter-ui-only-lazy`/`anbieter-ui-entry-only`, `LAZY_LOADERS` und die Budget-Zeile `Anbieter JS (lazy)`, danach `pnpm build && pnpm size` samt Chunk-Wächter (Schritt 4). `directory.ts` entsteht ganz in B (siehe „Umsetzung“).
- Dann zwei Pakete parallel in eigenen Worktrees:

| | Paket A – Daten, Route, Tab-Leiste, Verdrahtung (`PW_PORT=4173`) | Paket B – Oberfläche im Chunk (`PW_PORT=4273`) |
|---|---|---|
| Domäne | `ids.ts`, `schema.ts`, `route.ts`, `provider-count.ts`, `site-data.ts` (+Tests) | `directory.ts` (+Test) |
| Daten | `build-data.ts`, `src/data/providers.ts` (+Test), Fixtures, nachgezogene Fixture-Tests | – |
| UI | `use-app-state.ts`, `App.tsx`, `Chrome.tsx`, `icons.tsx`, `tabs.css`, `Overlays.tsx`, `DetailDialog.tsx`, `ProviderPanel.tsx`, `Lazy.tsx` (`className`), `format.ts` | `anbieter/*`, `OfferCard.tsx` + `karte/PlaceSheet.tsx` (`context`), `styles/anbieter.css`, `styles.css` |
| Build, Regeln | `vite.config.ts`, `.size-limit.json`, `.dependency-cruiser.cjs`, `check-architecture.ts`, `font-fallback.ts` | – |
| E2E | `anbieter.spec.ts`, `layout.spec.ts` (Tab-Leiste) | `anbieter-inhalt.spec.ts`, `mobile-ux.spec.ts`, `smoke.spec.ts`, `scripts/screenshots.ts` |

- B testet bis zur Zusammenführung mit Unit-Tests. Seine E2E-Läufe starten nach dem Merge von A.
- **Lokale Perf-Tests** (`perf.spec.ts`, Schrift-Swap) sind unter Parallellast unzuverlässig. Rot nur lokal unter Last ist kein Befund, das Gate ist die CI.

## Umsetzung

**Stapel (2026-10-05):** `main` (2d134a2) ← Nacharbeit 0009 (`worktree-hinweise-0009`) ← diese Plan-Doku (`anbieter-0010-v2`, aus `origin/anbieter-0010` übernommen, ohne Force-Push) ← Paket 0. `main` springt per Fast-Forward erst auf einen Stand mit grünem Budget.

**Schritt 3, Ausgangswert (2026-10-05):** `main` 6ab43b5 plus ADR 0012 (Branch `adr-0012`, ec737bc): Start-JS 89,62 kB von 92 kB, gleicher Hash wie ohne die Gruppe `$initial`, Chunk-Wächter grün.

**Schritt 4, Schnittstellen (2026-10-05, Branch `anbieter-0010-schnitt`):**
- **Inhalt:**
  - `route.ts`: Tab `anbieter` zwischen Kalender und Merkliste, mit Tests (Roundtrip, `tabSection`, „kein Startpunkt“ über alle fünf Tabs). `providerId`/`anbieter=` folgt in A.
  - `site-data.ts`: Typen `SiteProvider`, `ProviderDirectoryData`. `toProviderDirectory` folgt in A.
  - `provider-types.ts`: `ProviderScreenProps`, `ProviderSheetProps`, `ProviderUiModule`.
  - `anbieter/entry.ts` mit Stubs `ProviderScreen` (`useState`, `Icon`, `plural`, `standDate` samt `time.ts`) und `ProviderSheet`.
  - `ProviderPanel.tsx`: Lader per `import()`, vorerst mit leerem Katalog.
  - `App.tsx`: rendert ihn bei `ansicht=anbieter`; `providerQuery` lebt hier.
  - `vite.config.ts`: Ordnerregel `assets/anbieter/`.
  - Vorgezogen aus A (Arch-Review M1): Regeln `anbieter-ui-only-lazy` und `anbieter-ui-entry-only`, `LAZY_LOADERS`-Eintrag `ProviderPanel.tsx`, Budget-Zeile `Anbieter JS (lazy)` 6 kB. Kanarienvögel rot: Typ-Import aus `anbieter/` in `App.tsx` (beide Regeln), dynamischer Import in `Overlays.tsx` (`anbieter-ui-entry-only`), zusätzlicher statischer Import im Lader (`lazy-loader-static`; dependency-cruiser fasst die Kanten zusammen).
  - Noch kein Knopf in der Tab-Leiste, erreichbar nur per URL.
- **Messung:** Start-JS **89,80 kB** (+0,18 kB: Tab, Lader, Verdrahtung), Chunk `assets/anbieter/entry-*.js` 0,50 kB. Chunk-Wächter grün.
- **Kanarienvogel** (ADR 0012): ohne die Gruppe `$initial` spaltet schon dieser Stub `jsx-runtime` und `time` ab, der Wächter wird rot. Zurückgebaut.
- **Abweichungen vom Plan, beide ohne Folgen für das Budget:**
  - `directory.ts` entsteht ganz in **B**, statt als Stub hier: Es wird nur im Chunk genutzt, ein Stub ohne Logik bräche knip und die Coverage.
  - `ensureFresh` ruft **`ProviderPanel`** auf (A), bevor es den Katalog an Screen bzw. Sheet gibt, nicht der Chunk selbst (E6). So hängt B nicht an `src/data/providers.ts`. E7 hatte den Abgleich ohnehin im Start eingeplant (ca. 0,15 kB). Screen und Sheet bekommen `directory` immer schon abgeglichen.

**Schritt 5, Paket A (2026-10-05, Branch `anbieter-0010-a`):**
- **Inhalt:** wie E13 und „Struktur“ [A]:
  - Domäne test-first: `KEBAB_ID_PATTERN`, `providerId`/`anbieter=`, `countProviders`, `toProviderDirectory`.
  - Daten: `anbieter.json` aus `build-data.ts`, `loadProviderDirectory`/`ensureFresh`.
  - Fixtures: Turnverein und Sammelkalender; nachgezogen wurden nur `dataset.test.ts` (7 Einträge, Test-Sammelkalender umbenannt) und `select.test.ts`. Die übrigen Fixture-Tests blieben grün.
  - UI: Lader, Sheet-Dialog, Detail-Knopf, Statuszeile, vierter Tab.
  - Regeln und Budget-Zeile.
- **Messung** (`pnpm build && pnpm size`, echte Daten, gzip):
  - Start-JS **90,81 kB**, also **+1,01 kB** gegenüber 89,80 kB (Schnittstellen). Ohne Tab-Leiste lag es bei 90,78 kB.
  - CSS 10,74 kB. Chunk `assets/anbieter/` 0,51 kB (Stub).
  - `anbieter.json` **7,61 kB** (31,2 kB roh, 74 Anbieter). Chunk-Wächter grün.
- **Kanarienvögel**, je rot gesehen, danach zurückgebaut:
  - `programme` in `toProviderDirectory` → `site-data.test.ts` rot.
  - Temporäre `directory.ts` mit Import von `places.ts`, importiert aus `App.tsx`: `directory-only-lazy` rot, auch beim reinen Typ-Import, dazu `lazy-domain-apart`.
  - Sheet-Dialog hinter dem Detail im Baum → `anbieter.spec.ts` „Zurück auf einen Eintrag mit Sheet und Detail“ rot. Der Deep-Link allein zeigt die Reihenfolge nicht: Dort öffnet das Sheet sofort, das Detail erst mit `site.json`.
  - `dialogOpen` ohne `providerId` → Toast-Test rot.
  - `layout.spec.ts` zuerst rot (24 von 37 neuen Fällen), dann grün in Chromium und WebKit.
- **Abweichungen:**
  - **`.tab` als Grid statt Spalten-Flex** (E2): Eine Container-Query stylt nur Kinder des Containers, nicht den Tab selbst. „Badge im Fluss neben dem Icon“ geht deshalb nur über die Zeile je Kind: Icon in Zeile 1, Label in Zeile 2, im Nur-Icon-Zustand das Badge in Zeile 1. In der Seitenleiste spannt das Icon über Label und Badge, kompakt stehen alle drei in Zeile 1. Das Markup bleibt gleich.
  - **Pille in der kompakten Querleiste 2 px statt 8 px eingezogen:** E2 rechnete mit der Spalte (133 px). Der Bestandstest „Badge im Querformat“ misst gegen die sichtbare Pille, bei 568 px also 116,6 px. Mit dreistelligem Badge (100 gemerkt) ragte der Inhalt bei 100 % über die Pille. Mit 2 px Einzug ist die Pille 129 px breit.
  - **Hochkant mit Label sitzt das Badge wie bisher am Herz.** Die Prüfung „Badge überdeckt das Herz nicht“ gilt nur im Nur-Icon-Zustand.
  - **Detail-Knopf heißt „Mehr von diesem Anbieter“** statt „Alle Angebote dieses Anbieters“. Das Text-Gate verlangt kurze Knöpfe (≤ 32 Zeichen) bei 100 % einzeilig. Bei 320 px stehen neben dem Icon 224 px zur Verfügung, die lange Fassung braucht in Chromium 244 px und brach um (`mobile-ux.spec.ts`, „detail … 320 px“). Die neue Fassung braucht 206 px. Icon `store` und Platz über „Website von …“ bleiben.
  - **`onUnknown` ruft der Loader** (`ProviderSheetLoader`), wie E3 es beschreibt. Er prüft nach dem Laden Katalog und Angebote. Das Sheet von B muss `onUnknown` nicht selbst aufrufen und rendert nur für bekannte IDs.
  - **Scheitert der Reload in `ensureFresh`, gilt die zuerst geladene Datei** (ohne weiteren Request, gemerkt je `expected`). Bis der Reload da ist, zeigen Tab und Sheet den Ladezustand.
  - Neu ist ein Test „Zurück auf einen Eintrag mit Sheet und Detail“ (popstate). Nur dort öffnen beide Dialoge im selben Commit.
  - **knip:** Der CI-Lauf von „Schnittstellen“ war rot, weil `SiteProvider` als Export ungenutzt war. A nutzt den Typ jetzt in `site-data.test.ts`. Der Lader destrukturiert den Chunk direkt am `import()` (`loadChunk`). Sonst meldet knip `ProviderScreen` und `ProviderSheet` als ungenutzt, weil es Exporte durch `Promise.all` nicht verfolgt.
- **Prüfung:** `PW_PORT=4173 pnpm check` grün, mit WebKit (`libavif16` vorhanden): 1 284 E2E-Fälle bestanden, 373 übersprungen (Projektfilter). Unit-Tests 658.
- **Offen für die Zusammenführung** (brauchen den Chunk von B; die Tests in `anbieter.spec.ts` nutzen nur das Suchfeld „Anbieter suchen“ und `h2` mit dem Namen im Sheet):
  - Test 3: Zeile → Sheet und Zurück schließt.
  - Test 4: Kachel im Sheet → Detail darüber, Zurück → Sheet offen.
  - Test 6: Nach „Nochmal versuchen“ erscheinen Zeilen, nicht nur das Suchfeld.
  - Test 7: Rückfall-Zeile ohne Website-Knopf.
  - Test 8: Website-Link mit `target`, `rel` und Katalog-`href`.

**Schritt 5, Paket B (2026-10-05, Branch `anbieter-0010-b`):**
- **Inhalt:**
  - `src/domain/directory.ts` (+Test, test-first): `providerRows`, `providerOffers`, `providerCategories`, `matchesProviderQuery`, Rückfall-Zeilen. Coverage 100 % Zeilen, 96 % Zweige.
  - Die Tests nutzen `loadFixtures()` und ergänzen den Turnverein (Felder wie E6) nur, solange er in `tests/fixtures/` fehlt. Nach dem Merge mit A gelten sie unverändert. Die Invariante zählt im Test selbst die verschiedenen `providerId` (gleiche Definition wie `countProviders`).
  - `src/ui/anbieter/`: `ProviderScreen`, `ProviderSheet`, `provider-format.ts` (+Test). `OfferCard` hat `context` statt `atPlace`. `styles/anbieter.css` ist im Start-CSS.
- **Messung** (`pnpm build && pnpm size`, echte Daten; Ausgang „Schnittstellen“):
  - Start-JS 89,80 → **89,84 kB** (+0,04 kB, `OfferCard`);
  - CSS 10,64 → **10,84 kB** (+0,20 kB);
  - `Anbieter JS (lazy)` 0,50 → **2,75 kB** von 6 kB;
  - Chunk-Wächter grün.
- **Abweichungen:**
  - `directory.ts` exportiert zusätzlich **`findProvider`** (Katalog-Eintrag oder Rückfall aus allen Angeboten), für das Sheet und `onUnknown`. `ProviderState` bleibt modulintern (knip).
  - **`hiddenCount` ist mit Suchtext 0**, weil die ausgeblendeten Treffer dann blass in `idle` stehen. Die Zeile „N weitere Anbieter …“ steht nur unter aktiven Zeilen. Ohne aktive Zeile übernimmt `NoOffers` den Hinweis samt „Filter zurücksetzen“.
  - Bei Leerstand ohne Filter (nur die Altersregel blendet aus) steht `EmptyState` „Mit dieser Auswahl gibt es keine Angebote.“ ohne Knopf, weil `NoOffers` einen Reset verlangt.
  - `idleLine` nennt hinter dem Zustand die Orte aus dem Katalog („Gerade keine Termine im Plan · Schweinau, Gymnastikraum Beispiel“). In der Einzahl heißt es „1 Angebot, passt nicht zur Auswahl“.
  - Im Sheet tragen die Kacheln mit `context="provider"` Ort und Wegzeit in der Meta-Zeile, ohne den Anbieternamen.
  - `provider-types.ts` ist unverändert.
- **Vorab geprüft, nicht committet:**
  - Die Anbieterliste besteht `expectMobileUx` hell und dunkel sowie 320 px / 200 % auf Pixel 7 und iPhone 15 (WebKit). Geprüft wurden ohne Filter, Sticker „Bücher“, Suche „theater“, Suche ohne Treffer und Startpunkt Gostenhof. Dafür lief ein temporäres Spec auf dem Schnittstellen-Stand, mit leerem Katalog, also mit lauter Rückfall-Zeilen.
  - `karte.spec.ts` (Pixel 7, iPhone 15) sowie `layout`, `mobile-ux`, `app` und `detail` (Pixel 7) sind mit `context="place"` grün.
- **Für die Integration offen** (E2E von B, erst mit A lauffähig):
  - `e2e/anbieter-inhalt.spec.ts`, Fälle 1–6 aus „Tests“;
  - `mobile-ux.spec.ts`, `VIEWS`: `anbieter`, `anbieter-startpunkt`, `anbieter-filter`, `anbieter-suche-leer`, `anbieter-sheet`, `anbieter-sheet-leer`, `anbieter-fehler`. Der Fehlerzustand nutzt `.lazy-box`/`.lazy-note` aus `anbieter.css`, das Markup baut A;
  - `smoke.spec.ts`: zweistelliges Badge, mehr als 50 aktive Zeilen, Sheet des Spitzenreiters, Gates mit langen Namen;
  - `scripts/screenshots.ts`: `anbieter`, `anbieter-sheet`, Tab-Leiste quer.
  - Sheet-Optik und Turnverein-Zeile sind noch nicht im Browser gesehen: Ohne A gibt es weder den Sheet-Dialog noch den Fixture-Eintrag.

**Schritt 6, E2E von Paket B (2026-10-05, Branch `anbieter-0010-b-e2e` auf `anbieter-0010-int`):**
- **Neu bzw. ergänzt:**
  - `e2e/anbieter-inhalt.spec.ts`: Fälle 1–6, dazu die Umlaut-Suche. Wegzeit ab Gostenhof aus den 0009-Fixtures: Theater „5 Min.“, Familientreff und Bibliothek „15 Min.“, Musikschule „30 Min.“, Gemeinde „35 Min.“. Bei 404 gilt die Luftlinie, das Theater steht mit „200 m“ vorn, die übrigen in km. CLS über den Wechsel vom Platzhalter zu den Zeilen < 0,05, gemessen nur in Chromium (Layout-Shift-API).
  - `mobile-ux.spec.ts`: die sieben Ansichten `anbieter*`. Das Sheet zeigt die Gemeinde mit dem längsten Namen.
  - `smoke.spec.ts`: mehr als 50 aktive Zeilen, die blassen am Ende (Zeilen = Katalog, heute 64 + 10), das Sheet des Spitzenreiters mit allen Angeboten (heute 71), 320 px / 200 %, zweistelliges Badge bei 320 px / 200 % und in der Seitenleiste 863×360 / 200 %.
  - `scripts/screenshots.ts`: Ansichten `anbieter`, `anbieter-sheet` und `tabs` (im Viewport `quer` die Seitenleiste).
- **Produkt-Fix aus der Sichtprüfung:** Ohne Suchtext stand unter dem Feld „6 Anbieter“ (mit Turnverein), direkt unter der Statuszeile „5 Anbieter mit 8 Angeboten“. Die Live-Region zählt jetzt nur mit Suchtext. Ohne Suchtext bleibt sie leer, die Zeile bleibt reserviert (`min-height`), damit beim ersten Buchstaben nichts springt. Das weicht von E5 ab: Die Zahl ohne Suche nennt schon die Statuszeile.
- **Ergebnis:** Pixel 7 und iPhone 15 grün mit `anbieter-inhalt`, `anbieter`, `layout`, `app`, `karte` und `mobile-ux` (602 Tests, 6 übersprungen); `smoke` grün (13 Tests).

**Schritt 6, Zusammenführung (2026-10-05, Branch `anbieter-0010-int`):**
- **Reihenfolge:**
  - Schnittstellen ← B, dann A gemergt. Konflikt nur in diesem Plan, beide Abschnitte übernommen.
  - Danach die E2E-Ergänzungen von A (`anbieter.spec.ts`, Fälle 3, 4, 6, 7, 8) und von B (`anbieter-inhalt.spec.ts`, `mobile-ux.spec.ts`, `smoke.spec.ts`, `screenshots.ts`).
- **`PW_PORT=4373 pnpm check` komplett, mit WebKit:** grün. 691 Unit-Tests, 1 513 E2E-Fälle bestanden, 373 per Projektfilter übersprungen.
- **Budget** (echte Daten, gzip, nach den Fixes aus dem Arch-Review):
  - Start-JS **90,90 kB** von 92 kB. Ziel ≤ 91,0 kB eingehalten. Zuwachs durch diesen Plan +1,28 kB gegenüber 89,62 kB (Vorgabe ≤ 1,3 kB).
  - `Anbieter JS (lazy)` 2,74 kB von 6 kB, `Daten (anbieter.json)` 7,61 kB von 15 kB, CSS 10,95 kB von 15 kB.
  - Chunk-Wächter grün.

### Arch-Review Schritt 8 (2026-10-05, arch-reviewer) – Verdict: OK, keine Blocker → eingearbeitet
- **M1 (Nachweis Schritt 6):** `pnpm check` komplett und das Budget am integrierten Stand. → Siehe oben.
- **m1:** Die Mengenrechnung „Angebote außerhalb der Auswahl“ stand im Sheet. → `hasOffersOutside` in `directory.ts`, mit Test.
- **m2:** Die Prüfung auf eine unbekannte ID gab es doppelt, der Zweig im Sheet war tot. → `isKnownProvider` in `provider-count.ts` (Start, mit Test) für den Lader. Das Sheet und `ProviderSheetProps` kennen kein `onUnknown` mehr.
- **m3:** Scheiterte `site.json`, stand das Sheet beim Deep-Link endlos auf „wird geladen“, modal über der Fehlerseite. → Ohne Daten bleibt der Dialog zu (`sheetProviderId` in `App.tsx`), `anbieter=` bleibt in der URL, nach „Nochmal versuchen“ öffnet das Sheet. Test in `anbieter.spec.ts`, erst rot, dann grün.
- **m4:** Bei der Rückkehr in den Tab blitzte der Ladekasten auf. → Abgeglichene Kataloge sind je Datenstand gemerkt. `useLazy` bekommt optional `peek` für ein schon geladenes Modul, und ein Modul im Zustand „da“ fällt im Effekt nicht mehr auf „laden“ zurück. Der Test (MutationObserver im Datenstand-Fall) war mit dem Cache allein noch rot, mit `peek` ist er grün.
- **m5:** Der Fehlerzustand des Sheets war nur hell geprüft. → Ansicht `anbieter-sheet-fehler` in `mobile-ux.spec.ts`: hell, dunkel, 320 px / 200 %, beide Engines.
- **m6:** `as`-Casts ohne Begründung. → Begründungen im Code, zwei davon in `anbieter.spec.ts`. Der neue Test kommt ohne Cast aus (`data`-Attribut).
- **m7:** Die Testhilfe in `directory.test.ts` baute den Katalog von Hand nach. → Sie nutzt jetzt `toProviderDirectory`, der Turnverein ist nur noch ein erwartetes Objekt mit eigenem Test.
- **m8:** Doku-Drift. → `architecture.md` hat jetzt die Tab-Leiste und `anbieter.json` in der Startpunkt-Invariante. Statuszeile, Ziel und E2 hier verweisen auf „Mehr von diesem Anbieter“.

## Struktur

```
Paket 0 (E8)
  src/domain/ics-paths.ts (+test)  seriesIcsPath, sessionIcsPath (aus ics.ts)
  src/ui/SavedView.tsx             ics.ts (icsForCollection, icsContextFor) per import() im Export-Handler, Vorladen im Leerlauf
  src/ui/DetailDialog.tsx          Pfade aus ics-paths.ts
  [bedingt] src/ui/CalendarPanel.tsx + Kalender-Chunk, Regeln, Vorladen
  scripts/check-chunks.ts          genau eine *.js direkt in dist/assets/ (nicht rekursiv, ohne .js.map)
  package.json                     size = check-chunks && size-limit
  vite.config.ts, .size-limit.json assets/export/ (2 kB) [, assets/kalender/ (3 kB)]

Plan 0010
public/data/anbieter.json          generiert, nicht committet
src/domain/
  ids.ts (+test)                   KEBAB_ID_PATTERN                                               [A]
  schema.ts                        kebab nutzt KEBAB_ID_PATTERN, Meldung unverändert              [A]
  route.ts (+test)                 Tab „anbieter“, providerId/anbieter=, tabSection               [A]
  site-data.ts (+test)             SiteProvider, ProviderDirectoryData, toProviderDirectory      [Schnittstellen/A]
  provider-count.ts (+test)        countProviders                                                 [A]
  directory.ts (+test)             NUR LAZY: providerRows, providerOffers, providerCategories,
                                   matchesProviderQuery, Rückfall-Zeilen                          [B]
src/data/
  providers.ts (+test)             loadProviderDirectory (ohne Argument), ensureFresh (≤ 1 Reload) [A]
src/ui/
  ProviderPanel.tsx                ProviderPanel, ProviderSheetLoader, preloadProviderUi         [A]
  provider-types.ts                ProviderScreenProps (inkl. reachMode), ProviderSheetProps      [Schnittstellen]
  anbieter/entry.ts, ProviderScreen.tsx, ProviderSheet.tsx, provider-format.ts (+test)           [B]
  use-app-state.ts (+test)         openProvider, closeProvider, Vorladen beim Parsen              [A]
  App.tsx, Overlays.tsx, DetailDialog.tsx, format.ts (+test)                                      [A]
  Chrome.tsx, icons.tsx, styles/tabs.css   vierter Tab, Geometrie                                 [A]
  Lazy.tsx                         LoadFailed className                                           [A]
  OfferCard.tsx, karte/PlaceSheet.tsx   context="place" | "provider"                              [B]
  styles/anbieter.css, styles.css                                                                 [B]
scripts/build-data.ts, check-architecture.ts, font-fallback.ts, screenshots.ts                   [A/A/A/B]
.dependency-cruiser.cjs            anbieter-ui-only-lazy, anbieter-ui-entry-only, directory-only-lazy, lazy-domain-apart [A]
.size-limit.json                   Anbieter JS (lazy) 6 kB, Daten (anbieter.json) 15 kB           [A]
vite.config.ts                     assets/anbieter/                                               [A]
tests/fixtures/providers.yaml      + turnverein-beispiel, + sammelkalender-beispiel               [A]
e2e/anbieter.spec.ts [A], anbieter-inhalt.spec.ts [B], layout.spec.ts [A], mobile-ux.spec.ts [B], smoke.spec.ts [B]
docs/architecture.md, docs/ideas.md                                                               [Schritt 7]
```

Signaturen in `src/domain/directory.ts`:

```ts
export type ProviderState = "aktiv" | "ausgeblendet" | "ohne-termine";
export interface ProviderEntry {           // SiteProvider oder Rückfall aus den Angeboten (url fehlt)
  id: string; name: string; url?: string; topics: Topic[];
  venues: Array<{ name: string; address: string; district?: string }>;
}
export interface ProviderRow {
  provider: ProviderEntry;
  state: ProviderState;
  shown: number;        // sichtbare kommende Angebote
  upcoming: number;     // alle kommenden
  places: string[];     // district ?? venue.name, ohne Dubletten
  nearest?: Reach;      // kleinste über die sichtbaren Angebote; ohne Startpunkt undefined
}
export function providerRows(input: {
  providers: readonly SiteProvider[];
  visible: readonly SiteOffer[];
  upcoming: readonly SiteOffer[];
  reachOf: (offer: SiteOffer) => Reach | undefined;
  byReach: boolean;     // Startpunkt gesetzt und Modus nicht „laedt“
  query: string;
}): { active: ProviderRow[]; hiddenCount: number; idle: ProviderRow[] }; // idle: erst ausgeblendet (nur mit query), dann ohne-termine
export function providerOffers(offers: readonly SiteOffer[], providerId: string, now: Date): SiteOffer[];
export function providerCategories(provider: ProviderEntry, offers: readonly SiteOffer[]): Category[];
export function matchesProviderQuery(name: string, query: string): boolean;
```

`upcoming` entsteht im Chunk über `applyFilters(offers, EMPTY_FILTER, { now })`. `use-offer-views.ts` bleibt unberührt.

## Tests

Test-first für die Domäne (Vitest, TZ `America/Los_Angeles`, Coverage ≥ 90 % in `src/domain`).

**Paket 0:**
- `ics-paths.test.ts`: Pfade wie bisher (aus `ics.test.ts` verschoben). `ics.test.ts` prüft weiter, dass die VEVENTs gleich bleiben.
- E2E `saved.spec.ts`: Der Export lädt `assets/export/*.js` erst beim Tipp bzw. im Leerlauf. Die Datei entsteht wie bisher (Inhalt gegen den bestehenden Test). Mit abgebrochenem Chunk-Request erscheint der Toast-Text.
- Chunk-Wächter mit Kanarienvogel. Bedingt Kalender: E2E Tab-Wechsel, offline nach dem Laden (`context.setOffline(true)` nach dem Vorladen) funktioniert der Kalender.

**Plan 0010, Unit:**
- **`ids`:** `KEBAB_ID_PATTERN` akzeptiert alle 7 Fixture-IDs und lehnt `../x`, `A-b`, `a--b`, `-a`, `a-` und den Leerstring ab. Die Schema-Meldung bleibt „kebab-case erwartet“.
- **`route`:**
  - `ansicht=anbieter` und `anbieter=<id>` übersteht den Round-Trip, allein und mit Filter/Angebot. Kanonisch `kat=…&ansicht=anbieter&anbieter=…&angebot=…`.
  - Kaputte IDs bzw. mehr als 80 Zeichen werden verworfen.
  - `tabSection("anbieter") === "anbieter"`.
  - „Kein Startpunkt“ über alle fünf Tabs und mit `providerId`.
- **`site-data`, `toProviderDirectory`:**
  - nur `anbieter`;
  - genaue Schlüssel (kein `programme`/`notes`/`geo`);
  - `generatedAt` übernommen;
  - der Turnverein-Ort ist per `venueAddress` gekürzt;
  - Sortierung `de`;
  - kein `district`-Schlüssel ohne Wert.
- **`provider-count`:** verschiedene `providerId`, leer → 0.
- **`directory`** (Fixtures, Uhr Mo 5.10.2026 12:00):
  - Ohne Filter, ohne Startpunkt: `active` = Bibliothek, Ev.-Luth. Kirchengemeinde, Familientreff, Kleines Theater, Musikschule (alphabetisch); `idle` = Turnverein (`ohne-termine`); `hiddenCount` 0. Familientreff `shown = upcoming = 3`.
  - Sticker „Bücher“: `active` nur die Bibliothek, `hiddenCount` 4, `idle` weiter der Turnverein.
  - Mit Suchtext „theater“ und Sticker „Bücher“: das Theater erscheint in `idle` als `ausgeblendet`.
  - Mit Suchtext „beispiel“ und Sticker „Bücher“: `idle` = erst die vier `ausgeblendet` (alphabetisch), dann der Turnverein.
  - `byReach` mit gestubbtem Luftlinien-`reachOf` (ab Gostenhof, Werte aus Plan 0004): Theater 226 m, Familientreff 1 427 m, Bibliothek 1 689 m, Musikschule 2 358 m, Gemeinde 3 008 m → genau diese Reihenfolge. Bei Gleichstand alphabetisch.
  - `byReach` mit gestubbtem **Wegzeit**-`reachOf` (`kind: "oepnv"`, Plan 0009): z. B. Gemeinde 12 Min., Theater 18, Bibliothek 18, Familientreff `Infinity`, Musikschule `Infinity`.
    - Ergebnis: Gemeinde, dann Bibliothek vor Theater (gleich, also alphabetisch), dann Familientreff vor Musikschule.
    - `Infinity` gegen `Infinity` gilt als gleich und wird alphabetisch geordnet. Unerreichbare stehen am Ende der aktiven Gruppe, vor den `idle`-Zeilen.
  - `ohne-termine` bleibt auch mit `byReach` am Ende, alphabetisch.
  - **Rückfall (M4):** Katalog ohne `theater-beispiel` → Zeile aus `providerName`/`venue` ohne `url`. Invariante `active.length === countProviders(visible)` über die Fälle ohne Filter, mit Sticker und mit fehlendem Katalog-Eintrag.
  - Umlaute in der Sortierung (Testname „Ärztehaus …“ zwischen A und B).
- **`providerCategories`:** Fixture-Theater: Katalog `theater`, `konzert`, ein Angebot `musik` → „Musik & Singen“ und „Bühne & Konzert“.
- **`matchesProviderQuery`:**
  - Groß/klein;
  - „nurnberg“, „nuernberg“ und „Nürnberg“ gegen „Nürnberg“;
  - „strasse“ gegen „Straße“;
  - „steuer“ gegen „Steuer“ (beidseitige ue-Faltung);
  - mehrere Teile in beliebiger Reihenfolge;
  - Leerstring trifft alles, „xyz“ nichts.
- **`data/providers`:**
  - `loadProviderDirectory` lädt `…/data/anbieter.json` (injizierter `fetch`), ohne Argument zum Datenstand;
  - 503 wirft, der nächste Aufruf fragt neu an;
  - `ensureFresh` mit gleichem Datenstand → kein weiterer Request;
  - `ensureFresh` mit abweichendem Datenstand → genau ein Request mit `cache: "reload"`. Zwei Aufrufe mit demselben `expected` (Liste und Sheet) ergeben zusammen weiter nur einen Request. Danach wird die Datei auch bei weiterer Abweichung genutzt.
- **`ui/ProviderPanel` bzw. Lader:** `loadProviderUi` hat keine Parameter. Vorladen und `useLazy` teilen sich ein Promise: zwei Aufrufe, ein Chunk- und ein Daten-Request.
- **`ui/format`:** `providerStatusParts`, Einzahl.
- **`provider-format`:**
  - `providerLine` mit „3 Angebote“, „1 Angebot“, „1 von 3 Angeboten“, einem, zwei und vier Stadtteilen („+2“);
  - Minuten bzw. km je `ReachMode`; ohne Wert entfällt die Wegzeit (kein Platzhalter in der Zeile);
  - `idleLine` in beiden Fällen;
  - „12 weitere Anbieter haben gerade nichts Passendes.“;
  - Live-Text „12 Anbieter“ / „1 Anbieter“.
- **`use-app-state`:**
  - `openProvider` pusht und entfernt `angebot`;
  - `closeProvider` geht zurück bzw. macht `replaceState`;
  - `openDetail` aus offenem Sheet behält `anbieter`;
  - Start mit `?anbieter=…` ruft das Vorladen genau einmal auf.

**E2E** (Fixtures, eingefrorene Uhr; Wegzeit-Werte aus den Fixtures von Plan 0009, `tests/fixtures/oepnv/`, beim Umsetzen eintragen):

`e2e/anbieter.spec.ts` [A]:
1. **Tab:**
   - „Anbieter“ → URL `ansicht=anbieter`, `aria-current="page"` am vierten Tab, Statuszeile „5 Anbieter mit 8 Angeboten“.
   - Sticker und Schnellfilter sichtbar.
   - Neuladen öffnet den Tab.
2. **Lazy:**
   - Die Startseite lädt nichts aus `assets/anbieter/` und nicht `anbieter.json`.
   - Beim Tab-Wechsel kommt beides genau einmal, erneutes Öffnen ohne Request.
   - Start mit `?anbieter=theater-beispiel`: Beide Requests starten, bevor `site.json` beantwortet ist (Antwort von `site.json` per `route` verzögert).
3. **Sheet und History:**
   - Zeile → Sheet, `anbieter=…`, Zurück schließt.
   - Deep-Link öffnet über dem Tab „Kalender“, ohne Tabwechsel.
   - `?anbieter=gibt-es-nicht` → Parameter weg.
4. **Aus dem Detail:**
   - Detail → Knopf → Sheet offen, Detail zu, Zurück → Detail.
   - Im Sheet eine Kachel → Detail darüber, Zurück → Sheet offen.
   - Derselbe Knopf im Detail → zurück im Sheet ohne neuen History-Eintrag.
5. **Deep-Link mit beiden Parametern** (bleibt nach M2): Das Detail liegt oben, `elementFromPoint` in der Bildmitte liegt im Detail. Schließen → das Sheet ist darunter.
6. **Fehler** (`allowedConsoleErrors: [/\/data\/anbieter\.json\b/]`):
   - 503 → Fehlertext in `.lazy-box`, `expectMobileUx`;
   - `unroute`, dann „Nochmal versuchen“ → Zeilen da;
   - dasselbe im Sheet.
7. **Datenstand (M4):**
   - `anbieter.json` mit anderem `generatedAt` → genau ein zweiter Request mit Reload, danach Zeilen.
   - Fehlt ein Anbieter, erscheint seine Rückfall-Zeile ohne Website-Knopf.
   - **Deep-Link plus abweichender Stand** (Review 2, M1): Start mit `?anbieter=theater-beispiel`, `site.json` verzögert, `anbieter.json` mit anderem `generatedAt`. Erwartet: insgesamt genau zwei Requests an `anbieter.json` (Vorladen und genau ein Reload), ein Chunk-Request, das Sheet zeigt danach den Anbieter.
8. **Privatsphäre:**
   - Tippen in der Suche → kein Request, kein Suchtext in der URL.
   - Mit offenem Tab den Startpunkt Gostenhof wählen → ab dem Tipp kein Request.
   - Website-Link mit `target="_blank"`, `rel="noopener"` und Katalog-`href`, nicht angeklickt.

`e2e/anbieter-inhalt.spec.ts` [B]:
1. **Liste ohne Startpunkt:** fünf aktive Zeilen alphabetisch, Turnverein blass am Ende mit „Gerade keine Termine im Plan“, sichtbar ohne Aufklappen.
2. **Startpunkt Gostenhof:**
   - Wegzeit-Reihenfolge laut 0009-Fixtures, Turnverein weiter am Ende.
   - Bei `wegzeit.json` → 404 (`luftlinie`, `fehler`): Reihenfolge Theater, Familientreff, Bibliothek, Musikschule, Gemeinde, mit km.
   - Bei verzögerter `wegzeit.json` (`laedt`): Platzhalter-Block, danach Zeilen ohne Sprung (CLS < 0,05 über den Wechsel).
3. **Filter:** Sticker „Bücher“ → nur die Bibliothek, Zeile „4 weitere Anbieter haben gerade nichts Passendes.“ mit „Filter zurücksetzen“, Turnverein blass am Ende, Statuszeile „1 Anbieter mit 1 Angebot“.
4. **Suche:**
   - „bibliothek“ → eine Zeile, Live-Region „1 Anbieter“;
   - „theater“ bei Sticker „Bücher“ → Theater blass mit „2 Angebote, keins passt zur Auswahl“;
   - „xyz“ → „Kein Anbieter heißt so.“, „Suche löschen“.
5. **Sheet-Inhalt:**
   - Name, Kategorien, „Website & Programm“, Orte;
   - Kacheln ohne Anbieternamen;
   - mit Sticker „Bücher“ alle Theater-Angebote und der Hinweis;
   - Turnverein-Sheet mit dem Text ohne Termine, Orte „Turnhalle Beispiel“ (Adresse ohne wiederholten Namen) und „Gymnastikraum Beispiel“.
6. **Alter:** Mit Geburtsdatum markiert das Sheet unpassende Angebote wie die Kachel.

`e2e/layout.spec.ts` [A], Tab-Leiste:
- **Hochkant 320, 360, 390, 412 bei 100 %:**
  - alle vier Labels sichtbar und einzeilig (`label.scrollWidth ≤ tab.clientWidth`);
  - das aktive Label liegt innerhalb der Daumen-Pille (±1 px);
  - jede Spalte ≥ 44 px breit und ≥ 56 px hoch;
  - Merklisten-Badge (ein Angebot gemerkt) innerhalb der eigenen Spalte und innerhalb der Leiste.
- **Hochkant 320 und 412 bei 200 %:** nur Icons (Labels per Container-Query versteckt), Badge in der eigenen Spalte, keine Überlappung mit dem Nachbar-Tab und dem Icon (Badge im Fluss). Geprüft wird ein- und zweistellig: Die Fixtures haben nur 8 Angebote, deshalb wird das zweistellige Badge mit echten Daten geprüft (siehe `smoke.spec.ts`).
- **Hochkant 412 bei 125 %:** Labels sichtbar und einzeilig. Bei 150 und 175 %: nur Icons.
- **Seitenleiste 863×360 und 740×360, je 100 % und 200 %:**
  - Leiste vollständig im Viewport mit mindestens 8 px Rand (top ≥ 8, bottom ≤ Höhe − 8);
  - Label und Badge ohne Überschneidung (> 0,5 px);
  - Daumen auf dem aktiven Tab (`offsetTop`/`offsetHeight` ±2 px), für jeden der vier Tabs.
  - Der bestehende Test „Querformat 852×393/915×412: erste Kachel ≥ 80 px frei“ bleibt grün, mit 7 rem Leistenbreite.
- **Kompakt 568×320 bei 100, 125, 150, 175 und 200 %:**
  - Höhe ≤ 56 px;
  - Labels nur bei 100 % sichtbar, ab 125 % nur Icons (eigene Schwelle);
  - in keiner Stufe ragt ein Label oder Badge aus seiner Spalte (`scrollWidth ≤ clientWidth`, Rechtecke);
  - Badge ohne Überschneidung.
- `LANDSCAPE_200` bekommt die Einträge „Anbieter“ und „Merkliste mit Badge“.

`e2e/mobile-ux.spec.ts` [B]:
- Neue Einträge in `VIEWS`: `anbieter`, `anbieter-startpunkt`, `anbieter-filter` (Sticker „Bücher“), `anbieter-suche-leer`, `anbieter-sheet`, `anbieter-sheet-leer` (Turnverein), `anbieter-fehler`.
- Je hell, dunkel per System und per `data-theme="dark"`, dazu 320 px / 200 %.
- Die bestehenden Ansichten prüfen die Tab-Leiste mit vier Tabs automatisch (`.tabs` steht in `BARS`, Prüfung 4).

`e2e/smoke.spec.ts` [B], echte Daten:
- **Zweistelliges Badge:** 10 Angebote merken, dann bei 320 px / 200 % prüfen: Badge in der eigenen Spalte, in der Leiste, ohne Überschneidung mit dem Icon. Dasselbe in der Seitenleiste 863×360 bei 200 % (Label und Badge in einer Zeile, Leiste mit 8 px Rand im Viewport).
- > 50 aktive Zeilen, die 10 blassen am Ende.
- Das Sheet des Spitzenreiters (71 Angebote) öffnet.
- Gates und 320 px / 200 % bestehen, mit langen Namen.

`scripts/screenshots.ts` [B]: Ansichten `anbieter`, `anbieter-sheet`, Tab-Leiste quer.

## Backpressure

Keine Schwelle wird gesenkt, kein Gate gelockert. Neu sind Tests, Budget-Zeilen, Architekturregeln und der Chunk-Wächter.

| Fehler kommt zurück | Gate wird rot |
|---|---|
| Anbieter- oder Export-Code im Startbundle | `JS (initial)`, Lazy-Budget-Zeile findet keine Datei, `*-only-lazy`, `lazy-loader-static` |
| Gemeinsamer Chunk (z. B. React) abgespalten | Chunk-Wächter (`scripts/check-chunks.ts`) |
| `directory.ts` statisch von außen | `directory-only-lazy` |
| Lazy-Chunks teilen ein Domänenmodul | `lazy-domain-apart`, Chunk-Wächter |
| `anbieter.json` > 15 kB bzw. mit `programme`/`notes`/`geo` | Budget-Zeile, `site-data.test.ts` |
| Liste und Statuszeile zählen verschieden | `directory.test.ts` (Invariante) |
| Suchtext, Startpunkt oder Geburtsdatum in der URL | `route.test.ts`, `anbieter.spec.ts` |
| Request beim Tippen oder bei der Startpunkt-Wahl | `anbieter.spec.ts`, `startpunkt.spec.ts` |
| Externer Link ohne `rel="noopener"` | `anbieter.spec.ts` |
| Detail unter dem Sheet | `anbieter.spec.ts` Test 5 |
| Tab-Label bricht, ragt heraus, Badge überlappt, Leiste zu hoch | `layout.spec.ts`, Text-Gate, Prüfung 4 |
| Blasse Zeilen zu wenig Kontrast, helle Insel | axe, `expectNoBrightIslands` |

Kanarienvögel (je einzeln, rot sehen, zurückbauen, unter „Umsetzung“ notieren):
- statischer und reiner Typ-Import von `./anbieter/entry.ts` in `App.tsx`;
- dynamischer Import in `Overlays.tsx`;
- zusätzlicher statischer Import in `ProviderPanel.tsx`;
- Import von `directory.ts` in `App.tsx` bzw. von `places.ts` in `directory.ts`;
- `programme` in `toProviderDirectory`;
- Kalender per `import()` vor der Chunk-Lösung (Chunk-Wächter).

## Schritte

0. **Voraussetzungen:** Plan 0008 und Plan 0009 sind auf `main` und live.
   - *Fertig:* Beide Stände und das Start-JS `X` stehen unter „Umsetzung“.
1. **Plan und `/plan-review`.**
   - *Fertig:* erledigt, siehe „Review“ und „Nutzerentscheidungen“.
2. **Paket 0** (E8) auf eigenem Branch: Messung, Chunk-Wächter, A, B untersuchen, ggf. C. Danach `/arch-review`, CI, Fast-Forward nach `main`, `/browser-review live` (Export am echten iPhone: kommt der Download nach dem `await` noch an; ggf. Kalender offline nach dem Laden).
   - *Fertig:* erledigt. Start-JS 89,62 kB auf `main`, ADR 0012 entschieden (Option a, Budget 92 kB, Workaround).
3. **Worktree und Ausgangswert:** Branch auf dem aktuellen `main` (mit ADR 0012), `pnpm install --ignore-scripts`, `pnpm build && pnpm size`.
   - *Fertig:* Wert notiert, Chunk-Wächter grün.
4. **Schnittstellen** (ein Commit):
   - `SiteProvider`/`ProviderDirectoryData`, `provider-types.ts` (`directory.ts` entsteht ganz in B, siehe „Umsetzung“).
   - `anbieter/entry.ts` als **Stub mit `useState`, der geteilte Start-Module nutzt** (umgesetzt mit `Icon`, `plural`, `standDate` samt `time.ts`), schon von `ProviderPanel` per `import()` geladen und im Tab „Anbieter“ verdrahtet (Review 2, M5; ADR 0012).
   - Dann `pnpm build && pnpm size` samt Chunk-Wächter, dazu der Kanarienvogel ohne Gruppe `$initial` (rot).
   - *Fertig:* `pnpm check:fast` grün, Chunk-Wächter grün (keine Abspaltung durch den Anbieter-Chunk), Kanarienvogel rot gesehen, Messwert notiert. Erst dann beginnen A und B.
5. **Pakete A und B parallel** (E13), test-first für die Domäne, nach jedem Block `pnpm check:fast`.
   - **A:**
     - Route, Daten, Fixtures samt nachgezogenen Tests;
     - Tab-Leiste mit `layout.spec.ts` zuerst rot, dann grün;
     - Lader, Sheet-Dialog, Detail-Knopf, Statuszeile;
     - Regeln mit Kanarienvögeln, Budgets.
     - **Budget messen** (Chunk-Wächter grün).
     - *Fertig:* Unit und `layout.spec.ts` grün, Zuwachs ≤ 1,3 kB.
   - **B:** `directory.ts`, `provider-format.ts`, Screen, Sheet, `context`, CSS.
     - *Fertig:* `check:fast` und Unit-Tests grün.
6. **Zusammenführen:**
   - **Erst dieser Stand geht nach `main`.** „Schnittstellen“ und A bzw. B allein bleiben auf ihren Branches (Branch-CI), weil `?ansicht=anbieter` dort ohne Tab-Knopf, E2E und `expectMobileUx` erreichbar wäre (Arch-Review „Schnittstellen“, M2).
   - A nach B, dann die E2E von B.
   - `pnpm check` komplett, inklusive WebKit (lokal ggf. ohne `iphone-15`).
   - Budget messen.
   - *Fertig:* `pnpm check` grün, Start-JS ≤ 91,0 kB, alle Lazy- und Datenbudgets eingehalten, Werte notiert.
7. **Doku:**
   - `docs/architecture.md`:
     - Datenfluss (`anbieter.json`);
     - Ladeketten (Anbieter, Export, ggf. Kalender);
     - Regeln;
     - Chunk-Wächter unter Mobile-UX-Gates bzw. Budgets;
     - Tab-Leiste mit vier Tabs.
   - `docs/ideas.md`:
     - Eintrag „Anbieterverzeichnis“ streichen;
     - neu: Anbieter-Feed, Anbieter folgen, Kurzname und Einrichtungsart im Katalog, Anbietername auf der Kachel.
   - *Fertig:* nachgeführt, `check:fast` grün.
8. **`/arch-review`** (neue Module, Datenausgabe, > 200 Zeilen).
   - *Fertig:* kein Blocker offen, Befunde hier.
9. **Commit, Push, CI grün, Fast-Forward nach `main`, CI auf `main` grün, Deploy.**
   - *Fertig:* Die Live-Seite zeigt den vierten Tab.
10. **`/browser-review live`.** Jede Zeile der Checkliste beantworten, besonders:
    - Tab-Leiste hochkant 320–412, 200 %, Seitenleiste und kompakt quer, mit Badge, auf einem echten iPhone und einem echten Android;
    - lange Namen bei 320 px / 200 % (Silbentrennung);
    - Sortierung nach Wegzeit mit echtem Stadtteil;
    - Sheet mit 71 Angeboten: INP beim Öffnen im Performance-Panel, Scrollen, Detail darüber, Zurück behält die Position;
    - externer Link im neuen Tab, keine fremden Requests;
    - blasse Zeilen hell und dunkel.
    - *Fertig:* Ergebnis hier, jede Zeile beantwortet.

## Akzeptanzkriterien

- Paket 0 ist auf `main`, der Chunk-Wächter läuft in CI, und ADR 0012 ist umgesetzt (Budget 92 kB, Gruppe `$initial`).
- Vierter Tab „Anbieter“, Anbieterliste mit Suche, Sortierung nach Wegzeit mit Startpunkt (alphabetisch ohne), blasse Anbieter ohne Termine am Ende, Anbieter-Sheet, Detail-Einstieg, Deep-Link: umgesetzt und per E2E abgedeckt.
- Die Tab-Leiste besteht `layout.spec.ts` in allen Lagen aus E2 sowie Text-Gate und Touch-Gate.
- `anbieter.json` enthält nur die Felder aus E6 und nur Anbieter. Datenstand-Abgleich und Rückfall-Zeilen sind getestet.
- **Keine Schemaänderung**, `pnpm schema:check` grün, `data/` unverändert.
- Alle neuen Ansichten und Zustände bestehen `expectMobileUx` hell und dunkel, dazu 320 px / 200 %.
- `pnpm check` grün, CI grün auf `main`.
- Budgets:
  - Start-JS ≤ 91,0 kB (Zuwachs durch 0010 ≤ 1,3 kB, notiert);
  - `Anbieter JS (lazy)` ≤ 6 kB;
  - `Daten (anbieter.json)` ≤ 15 kB;
  - CSS ≤ 15 kB.
- Privatsphäre per E2E belegt (E9).
- `docs/architecture.md`, `docs/ideas.md`, Arch-Review und Browser-Review live stehen hier.

## Risiken

- **Startbudget:** entschärft durch ADR 0012 (92 kB, 1 kB Reserve nach diesem Plan). Der Anbieter-Chunk löst ohne die Gruppe `$initial` die Rolldown-Abspaltung aus (rolldown#11026); ein Rolldown-Update kann das Verhalten ändern, das zeigt der Chunk-Wächter (E8).
- **Tab-Leiste:** Die Breiten sind aus dem CSS abgeleitet, nicht gerendert (kein Browser in der Planung). Am knappsten ist es hochkant bei 320 px mit 73 px Spalte gegen ca. 65–68 px Label. Notausgang in zwei Stufen, entschieden von `layout.spec.ts`:
  1. Den Rand bis 4 px senken (Spalte 74 px). Kein Test ändert sich.
  2. Reicht das nicht, zeigt die Leiste bei 320 px / 100 % nur Icons, wie bei 200 %. Dann ändert sich **genau eine** Erwartung in `layout.spec.ts`: Der Fall „Hochkant 320 bei 100 %: alle vier Labels sichtbar“ wird zu „nur Icons, Badge in der eigenen Spalte“. 360, 390 und 412 behalten ihre Labels.
     - Die Änderung kommt mit Begründung und Messwerten (Spalte gegen Label) in den Commit und unter „Umsetzung“.
     - Sie ist eine Planentscheidung, keine gesenkte Schwelle: Text-Gate und Touch-Gate bleiben unverändert.
- **Kleinere Tab-Schrift** (12 statt 13 px): Lesbarkeit prüft der Browser-Review am Gerät.
- **Lange Namen:** Median 59, max. 111 Zeichen. Abhilfe: Silbentrennung, `h2` 1,375 rem, Text-Gate mit echten Daten. Kurznamen kämen über `docs/ideas.md`.
- **Sheet mit 71 Kacheln:** Das Öffnen rendert viele Kacheln auf einmal. Der Browser-Review misst INP. Ist es zu langsam, folgt „mehr zeigen“ in Schritten wie die Liste (40).
- **Merge-Konflikte** mit 0008/0009: Beide sind Voraussetzung, die Stellen stehen in E12.
- **„Gerade keine Termine“ täuscht**, wenn die Recherche eine Quelle nicht lesen konnte. Darum heißt es „im Plan“ bzw. „im Zwergenplan“, mit Verweis auf die Website.
- **Cache-Versatz** zwischen `site.json` und `anbieter.json`: abgefangen durch den Reload-Request und Rückfall-Zeilen (M4).
- **`anbieter.json` fällt aus:** Liste, Karte, Kalender und Merkliste bleiben voll bedienbar, der Tab zeigt den Fehlerzustand.

## Offene Fragen an den Nutzer

Alle beantwortet, siehe „Nutzerentscheidungen (2026-10-05)“. Die früheren Fragen 4 (Kurznamen) und 5 (Einrichtungsart) bleiben beim Standard: volle Namen, Kategorien statt Einrichtungsart. Beides steht als Idee in `docs/ideas.md`.

## Review (2026-10-05, plan-reviewer) – Verdict: Freigabe mit Änderungen → eingearbeitet

- **M1 Budget** → E8 „Paket 0“, Reihenfolge 0009 → Paket 0 → 0010, Schritte 2/3:
  - Sourcemap-Verteilung und gemessene Ersparnis je Kandidat: Export −0,64 kB; Kalender entfernt −1,51 kB, als Chunk heute nur −0,22 kB wegen der React-Abspaltung; Detail −1,40 kB und Stadtteile −0,73 kB verworfen; Preload-Helfer zu prüfen.
  - Filter- und Kind-Sheet ausdrücklich nicht lazy.
  - Ziel ≤ 89,0 kB nach 0009 + 0010, Eintritt ≤ 87,7 kB, Schwellen wie 0009 (88,6/89,0 kB).
  - ADR 0012 nur als letzter Ausweg.
  - Der vierte Tab ist im Zuwachs von ≤ 1,3 kB eingerechnet.
  - Neu: Chunk-Wächter.
- **M2** → E3: Wartemechanik gestrichen. Der Sheet-Dialog ist immer gemountet und steht vor dem Detail, `useLazy` nur im Kind bei offenem Dialog. E2E-Test 5 bleibt.
- **M3** → E10, E7, E12: `reachMode` in `ProviderScreenProps`, Platzhalter-Block in `laedt` (Review 2 präzisiert: kein `.dist` in der Zeile), kein `want()`. E12 nennt `route.test.ts` als von 0009 geändert.
- **M4** → E6: `generatedAt` in `anbieter.json`, einmal `cache: "reload"`, Rückfall-Zeilen aus `providerName`/`venue`, Test `active.length === countProviders(visible)`.
- **M5** → E7: `directory-only-lazy` und `lazy-domain-apart` (keine nur-Karten-Module wie `places.ts`), je mit Kanarienvogel.
- **Minors:**
  - `LoadFailed` mit `className`, `.lazy-box`/`.lazy-note` (E7, E10);
  - Tokens: `--muted`, blasse Zeilen gestrichelt statt über `--line`-Abschwächung (E10);
  - `KEBAB_ID_PATTERN` mit unveränderter Meldung (E2);
  - `OfferCard` `context?: "place" | "provider"` (E10, E12);
  - Suche beidseitig gefaltet inklusive ae/oe/ue, Test „Steuer“, Live-Region „N Anbieter“ (E5);
  - Sheet-`h2` 1,375 rem, INP im Browser-Review (E10, Schritt 10);
  - Pipeline- und Domänen-Tests mit `loadFixtures()` konkret genannt, Turnverein-Adresse beginnt mit dem Ortsnamen (E6);
  - Lader startet beim Parsen der Route (E3);
  - Der Satz zum Pixel-7-Umschalter entfällt, weil es keinen Umschalter mehr gibt (N2). Geprüft: Der Querformat-Test „erste Kachel ≥ 80 px“ bleibt relevant und steht in `layout.spec.ts`.
- **ADR-Nummern:** 0011 gehört zu Plan 0009, eine Budget- oder Stack-Entscheidung wäre 0012.

## Nutzerentscheidungen (2026-10-05)

- **N1 Reihenfolge:** Plan 0009 (Wegzeit) zuerst, dann dieser Plan. Dazwischen kommt Paket 0 (M1). → Status, E8, E12, Schritte 0–3.
- **N2 Navigation:** eigener vierter Tab „Anbieter“ statt Umschalter. → E2:
  - Tab-Leiste neu ausgelegt: 12-px-Labels, Schwelle 4,25 rem, Rand `clamp(4px, 2.5vw - 2px, 10px)`, Seitenleiste 7 rem mit Label und Badge in einer Zeile, Badge im Nur-Icon-Zustand weiter innen;
  - kein Kurzlabel nötig;
  - Breiten-Tabelle für 320/360/390/412, 200 %, Seitenleiste und 568×320;
  - Tests in `layout.spec.ts`.
  - `ansicht=anbieter` ist ein eigener Tab, der Deep-Link `?anbieter=<id>` bleibt.
- **N3 Anbieter ohne kommende Termine:** offen und blass in der Liste, „Gerade keine Termine im Plan“. → E4, E10.
- **N4 Sortierung:** mit Startpunkt nach Wegzeit zum nächsten Ort (`compareReach`, Unerreichbare ans Ende der aktiven Gruppe), ohne Startpunkt alphabetisch. → E5.
  - Die blassen Anbieter stehen immer am Ende, alphabetisch: Sie haben keinen Ort in der Wegzeit-Tabelle, und eine Luftlinie dazwischen widerspräche Plan 0009 („je Startpunkt eine Art“). Trotzdem stehen sie offen in der Liste.
  - Die Sortierung läuft lokal, ohne Request. Die Kamera-Regel betrifft nur die Karte.

## Review 2 (2026-10-05, plan-reviewer) – Verdict: Freigabe mit Änderungen → eingearbeitet

Keine Blocker.

- **M1 Vorladen gegen Datenstand** → E6, E7, Tests:
  - `loadProviderDirectory()` und `loadProviderUi()` haben kein Argument mehr. Chunk und Datei laden und cachen sich unabhängig von `site.json`, `useLazy` behält eine stabile `load`-Identität.
  - Der Abgleich ist der eigene Schritt `ensureFresh(data, expected)`, sobald `site.json` da ist, mit höchstens einem Reload-Request (gemerkt je `expected`).
  - Unit-Tests für beide Funktionen und den gemeinsamen Lader, dazu der E2E-Fall „Deep-Link plus abweichender Stand → genau ein Reload“.
- **M2 Kompakte Querleiste bei Zwischengrößen** → E2:
  - eigene Schwelle `@container (width < calc(4.25rem + 60px))` in der kompakten Media-Query, Rückfall `8rem`, falls WebKit kein `calc()` in Container-Queries kann;
  - Tabelle um 125 % und 150–200 % ergänzt;
  - `layout.spec.ts` prüft 100, 125, 150, 175 und 200 %, hochkant 412 zusätzlich bei 125/150/175 %.
- **M3 Seitenleisten-Höhe** → E2, Tests:
  - neu gerechnet mit `line-height: 1.4` und Badge 35,6 px bei 200 %: 244 px bei 100 %, ca. 266 px bei 200 %;
  - Kriterium „vollständig im Viewport + 8 px Rand“ statt „≤ 260 px“, Notausgang `line-height: 1.2` in der Seitenleiste;
  - Breite mit zweistelligem Badge nachgerechnet (7 rem reichen).
- **M4 Zweistelliges Badge** → E2, Tests:
  - `left: calc(50% + 4px)` entfällt.
  - **Abweichung mit Begründung:** Statt `right: 2px` steht das Badge im Nur-Icon-Zustand im Fluss neben dem Icon (24 + 4 + 41 = 69 ≤ 73 px). `right: 2px` hielte die Spalte ein, verdeckte das Icon aber bis auf 6,5 px. `right: 2px` bleibt der festgelegte Ausweg, falls der Browser-Review den Versatz schlechter findet. Die Tests gelten für beide Varianten.
  - Smoke mit echten Daten: 10 Angebote merken, 320 px / 200 % und Seitenleiste prüfen.
- **M5 React-Abspaltung** → E8, Schritt 4, E13:
  - Paket 0, Schritt 4 klärt die Ursache verbindlich. Hooks sind es nicht (`MapScreen` nutzt Hooks und spaltet nicht ab).
  - Werkzeug ist `output.codeSplitting`, nicht `advancedChunks`.
  - Im Schritt „Schnittstellen“ ist `anbieter/entry.ts` ein Stub mit `useState`, per `import()` verdrahtet. `pnpm build && pnpm size` samt Chunk-Wächter laufen vor den parallelen Paketen.
  - Die Notlösung „ohne eigene Hooks“ ist gestrichen.
- **Minors:**
  - Chunk-Wächter nicht rekursiv, ignoriert `.js.map`.
  - Kanarienvogel: dynamischer Import ohne Ordnerregel.
  - Kalender-Ersparnis −0,22 kB (mit `useLazy`-Lader −0,19 kB).
  - 412 px: 94,9 px Spalte (390 px: 89,6 px).
  - E5: unerreichbar = `Infinity`, eine fehlende Spalte lässt die ganze Tabelle auf die Luftlinie zurückfallen.
  - Sortier-Test mit gestubbter Wegzeit inklusive `Infinity` gegen `Infinity` → alphabetisch.
  - Notausgang 320 px: Stufe 1 ändert keinen Test, Stufe 2 genau eine Erwartung in `layout.spec.ts`, mit Begründung im Commit.
  - Export lazy: auch `icsContextFor` in den Handler; iPhone-Download nach `await` im Browser-Review.
  - Suchtext als `providerQuery` in `App.tsx` (übersteht Tab-Wechsel).
  - Live-Region entprellt (ca. 500 ms).
  - `idle`: erst `ausgeblendet`, dann `ohne-termine`.
  - `.dist`-Platzhalter nur als Ladezustand auf Kacheln; ohne Wert entfällt die Wegzeit in der Zeile.
- **Scope-Vorschlag „Paket 0 als eigener Plan“: abgelehnt** (Koordinator). Paket 0 bleibt ein klar abgegrenzter Abschnitt dieses Plans (E8) mit eigenem Branch, eigenen Fertig-Kriterien und eigenem Arch-Review. Begründung: kein zusätzlicher Review-Zyklus, gleicher Kontext.

## Browser-Review live, Paket 0 (2026-10-05) – Verdict: bestanden, kein Befund, ein Gerätetest offen

**Stand:** live `903866a` (CI-Lauf 37307015084 grün, Deploy grün), echte Daten (333 Angebote). Live liefert `assets/index-DUZZBaYg.js`, denselben Hash wie der lokale Build von `903866a`. Geprüft mit Playwright gegen https://zwergenplan.app/, Chromium (Pixel 7) und WebKit (iPhone 15), `de-DE`, Europe/Berlin. Das Skript liegt außerhalb des Repos (`e2e/.artifacts/review-live.ts`, ignoriert). Es prüft Paket 0 und die Nacharbeit zu Plan 0009 zusammen (dort „Browser-Review live (Nacharbeit)“).

**Paket 0, je Engine:**
- **Start und Vorladen:**
  - Start-JS ist nur `index-DUZZBaYg.js`.
  - `assets/export/ics-Ji-SLKgv.js` lädt im Leerlauf mit 200, ca. 0,4 s (Chromium) bzw. 1,2 s (WebKit) nach den ersten Kacheln.
  - Kein ICS-Code im Einstieg (`BEGIN:VCALENDAR` fehlt), keine Requests auf Karte, Wegzeit oder Kacheln.
  - Konsole: 0 Fehler.
- **Merkliste-Export:**
  - Zwei Angebote gemerkt, „Alle in den Kalender“ ergibt `zwergenplan-merkliste.ics` mit 18 VEVENTs.
  - Der Toast meldet „Kalenderdatei mit 18 Terminen geladen“, Konsole: 0 Fehler.
- **Export blockiert** (Chunk per Route abgebrochen): Der Toast meldet „Export gerade nicht möglich – mit Netz die Seite neu laden und nochmal tippen.“
- **Screenshots** (`scripts/screenshots.ts`, Ansichten `kind-quelle`, `start-startpunkt`, `merkliste`, `filter-wegzeit`, je 100 und 200 %, 96 Bilder, als Kontaktbögen angesehen): unauffällig.
  - Bei 320 px/200 % liegt der Toast „Eingeklebt …“ für 2,8 s über „Alle in den Kalender“ (`merkliste-320-light-200`). Das ist bekannt und entschieden: Plan 0008, E9, `pointer-events: none`.

**Checkliste (Skill):**
- **Lesbarkeit:** ok. Die Merkliste nennt „2 Sticker · 18 Termine in einer .ics-Datei · Kurse immer komplett“.
- **Daumen:** ok, unverändert.
- **Zustände:** ok. Export-Fehler mit Ausweg, Laden ohne sichtbaren Unterschied (vorgeladen).
- **Dunkel:** ok, keine hellen Inseln.
- **Micro-Interactions:** unverändert.
- **Design-System:** unverändert, keine neuen Bauteile.

**Offen (Gerät):** Ob der Merklisten-Download am **echten iPhone** nach dem `await` noch als Folge des Tipps gilt (ADR 0007). Playwright-WebKit lädt herunter, ersetzt aber kein iOS Safari. Das prüft der Nutzer am Gerät: Merkliste → „Alle in den Kalender“ → erscheint der Kalender- bzw. Download-Dialog?

### Arch-Review „Schnittstellen“ (2026-10-05, arch-reviewer) – Verdict: OK, keine Blocker → eingearbeitet
- **M1:** Kommentare nannten Regeln und ein Budget, die es noch nicht gab. → Regeln, `LAZY_LOADERS` und Budget-Zeile sind in „Schnittstellen“ vorgezogen, mit Kanarienvögeln.
- **M2:** `?ansicht=anbieter` ist ohne Tab-Knopf, E2E und `expectMobileUx` erreichbar. → Der Zwischenstand geht nie allein nach `main` (Schritt 6).
- **M3:** E6 (`ensureFresh` im Chunk) und E13/Schritt 4 (`directory.ts`-Stub) widersprachen der Umsetzung. → Nachgeführt.
- **M4:** ADR 0012 nannte `Dialog` im Stub, ADR 0008 nennt noch 90 kB, „Fertig, wenn ≤ 87,7 kB“ stand unverändert. → Korrigiert bzw. als ersetzt markiert.

## Browser-Review live (2026-10-05) – Verdict: bestanden, kein Blocker, Hinweise offen

**Stand:** live `27b7b3b`, main-CI 37334514544 grün (Gates, E2E & Budgets, Deploy). Live liefert `index-ClX4lluz.js`, denselben Hash wie der lokale Build. Echte Daten: 74 Anbieter, 333 Angebote.

Playwright gegen https://zwergenplan.app/, Chromium (Pixel 7) und WebKit (iPhone 15), `de-DE`, Europe/Berlin. Das Skript `e2e/.artifacts/review-0010.ts` ist ignoriert, es lief vorab gegen eine lokale Vorschau.

**Schritt 10, je Engine:**
- **Lazy und Requests:**
  - Der Start lädt weder `anbieter.json` noch `assets/anbieter/`. Der Tab lädt beides genau einmal (`data/anbieter.json`, `anbieter/entry-*.js`), Wechsel und Rückkehr laden nichts mehr.
  - Hosts: nur `zwergenplan.app`. Konsole: 0 Fehler.
  - Statuszeile „64 Anbieter mit 333 Angeboten“; 64 aktive, 10 blasse Zeilen.
- **Sortierung mit echtem Stadtteil (Gostenhof):** aufsteigend nach Minuten (5, 5, 5, 10 …). Vorn steht die FBS – Evangelische Familien-Bildungsstätte.
- **Sheet des Spitzenreiters (FBS, 71 Angebote):**
  - 71 Kacheln. Vom Klick bis zur ersten Kachel vergehen 128 ms (Chromium) bzw. 371 ms (WebKit), headless gemessen.
  - Gescrollt, eine Kachel → Detail darüber, Zurück → Sheet offen, `scrollTop` unverändert (8 476 bzw. 8 231).
  - „Website & Programm“ mit `target="_blank"`, `rel="noopener"`, nicht angeklickt. Keine fremden Hosts.
- **Detail → „Mehr von diesem Anbieter“:** öffnet das Sheet, URL `?anbieter=<id>`.
- **Tab-Leiste:** Bei 320, 360, 390 und 412 px (100 %) sind alle vier Labels sichtbar, bei 320 px / 200 % nur Icons.
- **Gates mit echten Daten:**
  - Text-Gate der Liste und des Sheets bei 320 px / 200 % grün;
  - `expectMobileUx` des Sheets bei 412 px grün.
- **Screenshots** (`scripts/screenshots.ts`, Ansichten `anbieter`, `anbieter-sheet`, `tabs`, je 100 und 200 %, 72 Bilder): als Kontaktbögen angesehen.
  - Liste: lange Namen trennen sauber (`hyphens: auto`).
  - Sheet: Kopf, Kategorie, Link, Ort mit Stadtteil, Kachel ohne Anbieternamen.
  - Tab-Leiste: Badge in der eigenen Spalte, auch bei 200 %.
  - Seitenleiste quer: vier Tabs, Badge neben „Merkliste“, auch bei 200 %.
  - Hell und dunkel ohne helle Inseln.

**Checkliste (Skill):**
- **Lesbarkeit:** ok.
  - Die Zeile nennt Name, „N Angebote · Stadtteil · Min.“; das Sheet beginnt mit Name und Kategorie.
  - Bei 200 % nimmt ein langer Name im Sheet viel Höhe ein, er scrollt aber (E10, `h2` 1,375 rem).
- **Daumen:** ok. Der Tab „Anbieter“ liegt unten, die Zeilen sind ganze Knöpfe ≥ 44 px, „Schließen“ steht im Fuß.
- **Zustände:** ok.
  - Laden, Fehler und leer sind per E2E und `mobile-ux` geprüft.
  - Fehler im Sheet sind jetzt auch dunkel und bei 200 % geprüft (m5).
  - Ohne `site.json` gibt es kein Sheet über der Fehlerseite (m3).
- **Dunkel:** ok, keine hellen Inseln, blasse Zeilen gestrichelt in `--muted`.
- **Micro-Interactions:** wie die Orts-Liste (`.place`). Die Rückkehr in den Tab kommt ohne Ladekasten aus (m4).
- **Design-System:** Zeilen, Sheet-Hülle, Kacheln und Chips sind die bestehenden Bauteile. Neu ist nur das Icon `store`.

**Hinweise (offen, kein Blocker):**
- **H1 – Lücke unter dem Suchfeld:** Die Live-Region hält ohne Suchtext eine leere Zeile frei (`min-height: 1.4em`, gegen Sprung beim ersten Buchstaben). Zwischen Suchfeld und erster Zeile wirkt das wie eine Lücke, bei 200 % deutlicher (`anbieter-320-light-200`). Vorschlag: die Zählung in die Statuszeile oder neben das Label legen.
- **H2 – Gerade Apostrophe in Namen:** „'Riesen & Zwerge'“ steht im Katalog mit `'` statt typografischer Anführungszeichen. Das ist eine Datenfrage für den nächsten Pipeline-Lauf (Skill `babyevents-nuernberg`), nicht für die UI.
- **H3 – Detail-Knopf „Mehr von diesem Anbieter“** statt „Alle Angebote dieses Anbieters“ (Paket A, Text-Gate bei 320 px): vom Nutzer bestätigt (2026-10-05).

**Nicht prüfbar (Gerät):** Tab-Leiste und Lesbarkeit der 12-px-Labels an einem echten iPhone und Android; INP beim Öffnen des Sheets mit 71 Kacheln im Performance-Panel eines echten Telefons; Merklisten-Download nach dem `await` (ADR 0007, aus Paket 0).
