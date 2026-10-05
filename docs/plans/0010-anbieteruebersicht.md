# Plan 0010 – Anbieterübersicht

Status: Entwurf, `/plan-review` offen
Datum: 2026-10-05
Bezug: `docs/ideas.md` („Anbieterverzeichnis auf der Website, ersetzt das frühere `ANBIETER.md`“), Plan 0004 (Startpunkt, `reachOf`), Plan 0005 (Ladekette der Karte, Orts-Liste und Orts-Sheet als Vorbild, E5 Umschalter), Plan 0007 (Text-Gate, Querformat mit Seitenleiste), ADR 0002 (Datenfluss), ADR 0003 (Themen → Kategorien), ADR 0006 (Katalog im Zod-Vertrag), ADR 0008 (Privatsphäre, Lazy-Budgets). Parallel in Arbeit: Plan 0008 (Feinschliff, Branch `feinschliff-0008-int`) und Plan 0009 (Öffi-Wegzeit, Entwurf), Berührungspunkte in E11.

## Ziel

Eltern sehen auf einen Blick, **wer** in Nürnberg etwas für Kinder unter 3 Jahren anbietet, und kommen von dort zum ganzen Programm eines Anbieters. Am Ende gilt:

- „Entdecken“ hat eine dritte Darstellung: Der Umschalter heißt **Liste | Karte | Anbieter** (`?ansicht=anbieter`).
- Die **Anbieterliste** zeigt alle Anbieter des Katalogs alphabetisch. Jede Zeile nennt die Zahl der kommenden Angebote, Stadtteil(e) bzw. Ort und, mit Startpunkt, die Entfernung zum nächsten Ort. Filter, Kategorie-Sticker und Altersregel wirken wie auf Liste und Karte. Anbieter ohne passende Termine stehen eingeklappt am Ende. Eine Suche filtert nach Namen.
- Ein Tipp auf einen Anbieter öffnet das **Anbieter-Sheet** (`?anbieter=<id>`): Kategorien, Link „Website & Programm“, Orte und alle kommenden Angebote als Kacheln.
- Aus dem **Detail** eines Angebots führt „Alle Angebote dieses Anbieters“ in dasselbe Sheet, aus jeder Ansicht.
- Die Daten kommen aus dem vorhandenen Katalog (`data/providers.yaml`). **Keine Schemaänderung**, kein neuer Pipeline-Lauf. Eine eigene Datei `data/anbieter.json` (7,6 kB gzip) lädt erst beim ersten Öffnen.
- Der Code der Übersicht ist ein eigener **Lazy-Chunk** in `dist/assets/anbieter/`. Das Start-JS wächst um höchstens 1,0 kB gzip (E7).
- Kein neuer Drittanbieter-Request. Externe Links öffnen mit `target="_blank" rel="noopener"`.
- Mobile-UX-Gates grün für Anbieterliste, Anbieter-Sheet und deren Zustände, hell und dunkel, auch bei 320 px / 200 % und im Querformat.

## Nicht-Ziele

- **Neue Katalogfelder**, z. B. eine Einrichtungsart („Familienzentrum“, „Bibliothek“) oder ein Kurzname. Beides wäre eine Schemaänderung samt Skill-Lauf (ADR 0006). → `docs/ideas.md`, offene Fragen 4 und 5.
- **Alle Termine eines Anbieters als Kalenderdatei oder Abo** (E10). → `docs/ideas.md`.
- **Anbieter merken oder „folgen“.** Die Merkliste bleibt bei Angeboten. → `docs/ideas.md`.
- **Anbietername auf der Kachel antippbar.** Der Weg geht über das Detail (E2). → `docs/ideas.md`.
- **Ring** (innen / knapp außen / außen) in der Oberfläche. Er beschreibt den Recherche-Fokus (Altstadtring), nicht die Lage zum Startpunkt. Für Eltern zählt die Entfernung ab dem eigenen Startpunkt (Plan 0004). Plan 0004 hat eine Gewichtung nach `ring` schon ausgeschlossen.
- **Aggregatoren und Verzeichnisse** (9 Einträge). Sie sind Recherchequellen ohne eigene Angebote (ADR 0006).
- Die Programm-Quellen des Katalogs (`programme[]`) als Linkliste (E6).
- Sortierung nach Entfernung (E5, offene Frage 2). Für „was ist in meiner Nähe“ gibt es die Karte mit der sortierten Orts-Liste.
- Karte der Anbieter. Die Karte zeigt weiter Orte.

## Ausgangslage

**Code** (Stand `4d4c063`):
- `src/domain/route.ts`: `TABS = ["entdecken", "karte", "kalender", "merkliste"]`. `tabSection` ordnet `karte` dem Tab „Entdecken“ zu. Die URL kennt `ansicht=` und `angebot=`, kanonisch in der Reihenfolge Filter, Ansicht, Angebot. Round-Trip-Tests stehen in `route.test.ts`, darunter „kennt keinen Startpunkt“ über alle Tabs.
- `src/ui/use-app-state.ts`, `useRoute`: `replace`, `openDetail` (`pushState` mit `zpDetail`) und `closeDetail` (`history.back()`, sonst `replaceState`).
- `src/ui/Chrome.tsx`: `ViewToggle` mit zwei festen Segmenten. Der Daumen hat in `styles/map.css` eine feste Breite von 50 %. `TabBar` hat drei Einträge, die Labels werden in schmalen Spalten per Container-Query nur für Screenreader gezeigt.
- `src/ui/App.tsx` (296 Zeilen): Statuszeile (einzige `role="status"`-Region), Umkreis- und Alters-Hinweis, Ansichten. `src/ui/Overlays.tsx`: Detail, Filter-Sheet, Kind-Sheet als native `<dialog>`.
- `src/ui/DetailDialog.tsx`: Anbietername im Kopf (`.hero .meta`) und unten der Knopf „Website von …“ (`offer.url`, `target="_blank" rel="noopener"`).
- Vorbild für die Ladekette (Plan 0005): `src/ui/MapPanel.tsx` (Start, Lader mit `useLazy`/`LoadFailed` aus `src/ui/Lazy.tsx`) → `src/ui/karte/` (Lazy-Chunk: `MapScreen`, `PlaceList`, `PlaceSheet`). Die Props-Typen liegen außerhalb in `src/ui/map-types.ts`. Regeln: dependency-cruiser `karte-ui-only-lazy` und `karte-ui-entry-only`, dazu `lazy-loader-static` in `scripts/check-architecture.ts`. `vite.config.ts` legt die Chunks über `chunkFileNames` nach `assets/karte/`.
- Das Orts-Sheet stapelt heute schon das Detail über sich: `ctx.onOpen` öffnet das Detail, das Orts-Sheet bleibt offen.
- `src/ui/use-offer-views.ts`: `reachOf(offer)` je Koordinate zwischengespeichert, `visible` (Filter, Alter, Umkreis), intern `upcoming` (alle kommenden ohne Filter). `ageVisibility` liefert `unfitIds` für **alle** kommenden Angebote, `ctx.isUnfit` markiert also auch Angebote außerhalb der Filter richtig.
- `src/domain/site-data.ts`: `site.json` enthält je Angebot `providerName` und `venue` (`name`, `address` über `venueAddress`, `district`, `ring`, `geo`). Website, Themen und Orte der Anbieter fehlen dort. Ebenso fehlen Anbieter ohne Angebote.
- `src/domain/schema.ts`: Die Provider haben schon alles, was die Übersicht braucht: `name`, `url`, `topics`, `venues[]` mit `name`, `address`, `district?`. Die ID-Form `kebab` ist dort lokal definiert.

**Echte Daten** (`data/providers.yaml`, `data/offers.json` vom 2026-10-04, gezählt am 2026-10-05 um 12:00):
- **83 Katalog-Einträge**: 74 `anbieter`, 7 `aggregator`, 2 `verzeichnis`. Nur Anbieter haben Angebote.
- **64 Anbieter mit kommenden Angeboten, 10 ohne.** Von den 10 laufen 3 über den Sammelkalender des Dekanats (`coveredBy`). Ohne Termine sind u. a. Staatstheater, Theater Salz+Pfeffer und Sternenhaus (KUF).
- 333 Angebote mit 2 889 Terminen. Kommende Angebote je Anbieter: Median 2, Spitze 71, 43 und 24.
- Orte: 113 im Katalog. 19 Anbieter haben mehr als einen Ort, höchstens 11. Mit kommenden Angeboten nennt ein Anbieter 1 Stadtteil/Ort (52 Anbieter), 2 (10), 4 (1) bzw. 6 (1). Jeder Anbieter hat mindestens einen Ort mit `district`, 38 Orte haben keinen.
- **Namen sind lang**: 20 bis 111 Zeichen, Median 59. 62 Namen haben einen Zusatz mit „ – “, 33 eine Klammer, z. B. „Ev.-Luth. Pfarrei Nürnberg-Südstadt – Mutter/Vater-Kind-Gruppen (Gustav-Adolf-Gedächtniskirche, Christuskirche)“. Alle Namen sind eindeutig.
- **Kategorien** aus den Katalog-Themen (`categoriesOf`): 30 Anbieter haben 1, 19 haben 2, 16 haben 3, 5 haben 4, je einer 5 bis 8. Je Kategorie: Krabbel- & Spielgruppen 33, Bewegung 29, Musik 28, Treffs 21, Beratung 16, Babykurse 15, Bühne 6, Wasser 5, Natur 3, Kreativ 3, Bücher 2, Museum 1. Bei 10 Anbietern kommen in den Angeboten Kategorien vor, die die Katalog-Themen nicht nennen (12 Fälle).
- **Eine Einrichtungsart gibt es nicht**, nur Themen. Das Thema `bibliothek` hat z. B. genau ein Anbieter.
- **Programm-Links**: 197 Einträge in `programme[]`. Bei allen 74 Anbietern ist `url` zugleich eine Programm-URL. Die übrigen 123 sind Recherchequellen: 86 HTML (darunter Buchungs-iFrames mit Querystring), 19 JS-Widgets (Eventim, Calendly), 8 iCal-Feeds, 6 PDFs, 4 JSON-APIs (`ajax_vk.pl?ABFRAGE=…`).

**Fixtures** (`tests/fixtures/`): 5 Anbieter, alle mit Angeboten, 9 Angebote, davon 8 kommend bei eingefrorener Uhr (Mo 5.10.2026 12:00; ein Angebot des Familientreffs ist beendet). Es gibt keinen Anbieter ohne Angebote und keinen Aggregator. `dataset.test.ts` erwartet `providers: 5`.

**Größen** (gemessen am 2026-10-05 auf `4d4c063`, `pnpm build && pnpm exec size-limit`, echte Daten, gzip):

| | Wert | Budget |
|---|---|---|
| JS (initial) | **87,3 kB** (Vite meldet für `index-*.js` 88,37 kB, size-limit zählt anders) | 90 kB |
| CSS | 10,37 kB | 15 kB |
| Karte JS / CSS (lazy) | 425,04 / 10,76 kB | 450 / 12 kB |
| `site.json` | 80,14 kB (593 kB roh) | 250 kB |

Nach Plan 0008 liegt das Start-JS laut Plan 0009 bei ca. 87,9 kB. Plan 0009 rechnet selbst mit bis zu +1,5 kB.

Anbieterdaten als JSON, gemessen mit gzip -9 über die echten 74 Anbieter:

| Variante | roh | gzip allein | Zuwachs, wenn in `site.json` |
|---|---|---|---|
| **gewählt**: `id`, `name`, `url`, `topics`, `venues[{name, address, district?}]` | 30,6 kB | **7,63 kB** | – |
| wie gewählt, plus `geo` je Ort | – | 8,80 kB | – |
| zusätzlich `ring`, Orts-`id` (ohne `programme`) | 41,7 kB | 9,47 kB | +8,65 kB |
| zusätzlich alle `programme`-URLs | 55,8 kB | 12,28 kB | +11,45 kB |
| zusätzlich `notes` | 76,4 kB | 21,17 kB | +20,28 kB |
| schlank: `id`, `name`, `url`, `topics`, Orts-IDs | 21,0 kB | 5,29 kB | +4,76 kB |

Anteile am Start-JS (Sourcemap, minifiziert, ohne gzip): React-DOM ca. 207 kB von 280 kB. Vom eigenen Code sind die größten Teile `App.tsx` 4,7 kB, `CalendarView.tsx` 4,2 kB, `DetailDialog.tsx` 4,1 kB und `Chrome.tsx` 3,8 kB. Filter- und Kind-Sheet kommen samt `OriginPicker` und `districts.ts` zusammen auf 8,8 kB. Das ist der Ausweg in E7.

## Entscheidungen

### E1 – Was Eltern am Handy in einer Anbieterübersicht wollen

Typische Fragen:
1. „Ist unser Familienzentrum / die Stadtbibliothek dabei?“ Gesucht wird nach dem Namen.
2. „Was macht der Anbieter, bei dem wir schon waren, sonst noch?“ Gefragt wird aus einem Angebot heraus.
3. „Wer hat Musik für Kleine?“ Gesucht wird nach der Art des Angebots.
4. „Wo ist das, wie weit ist es?“
5. „Wo melde ich mich an, wo steht das ganze Programm?“ Das führt zur Website.

Daraus folgt der Inhalt:

| Wo | Inhalt | Frage |
|---|---|---|
| Zeile der Liste | Name; „3 Angebote · Gostenhof · 1,4 km“ | 1, 3, 4 |
| Liste | Suche nach Namen, Kategorie-Sticker und Filter wie überall | 1, 3 |
| Anbieter-Sheet | Name, Kategorien, „Website & Programm“, Orte mit Adresse, alle kommenden Angebote als Kacheln | 2, 4, 5 |
| Detail | „Alle Angebote dieses Anbieters“ | 2 |

Nicht gezeigt werden Katalog-Notizen (Recherche-Hinweise, teils intern), Verfügbarkeitssysteme, das Prüfdatum `verified`, die Altersspanne des Anbieters und Formate/Kosten auf Anbieterebene. Das sind Angaben für die Recherche. Für Eltern zählen die Kacheln mit den echten Angeboten.

**„Nach Art“ heißt nach Kategorie** (E6): Die 12 Kategorien kennen Eltern schon von den Stickern. Eine Einrichtungsart fehlt in den Daten. Die Frage dahinter ist meist ohnehin „wer macht Musik“, nicht „wer ist eine Musikschule“.

### E2 – Navigation: dritte Darstellung in „Entdecken“ und Einstieg aus dem Detail

**Entschieden: Umschalter „Liste | Karte | Anbieter“, dazu der Knopf im Detail. Kein vierter Tab, kein Einstieg auf der Kachel.**

- **Warum kein Tab:** Die Tab-Leiste hat drei Einträge. Mit vier hätte jeder Eintrag bei 320 px nur noch 80 px, und „Entdecken“ fiele unter die Container-Schwelle von 4,6 rem: Die Labels wären nur noch für Screenreader da. Im Querformat steht die Leiste als Seitenleiste (Plan 0007, E14), dort kostet ein vierter Eintrag Höhe. Außerdem ist die Übersicht eine Nebenfunktion. `tabs.css` ändert Plan 0008 gerade (Badge).
- **Warum im Umschalter:** Die Anbieterliste ist eine weitere **Gruppierung derselben gefilterten Angebote**. Die Karte gruppiert nach Ort, die Anbieterliste nach Anbieter (E4). Sticker, Schnellfilter und Statuszeile oben bleiben gültig und funktionieren weiter. Das ist dieselbe Logik wie bei `karte` (Plan 0005, E5).
- **Warum der Detail-Knopf:** Frage 2 aus E1 entsteht im Detail. Der Knopf „Alle Angebote dieses Anbieters“ steht direkt über „Website von …“ (`.btn wide`, Icon `compass`). Er funktioniert aus jeder Ansicht, auch aus Kalender und Merkliste.
- **Warum nicht auf der Kachel:** Der Anbietername steht dort in der Meta-Zeile. Ein eigenes Touch-Ziel ≥ 44 px darin würde die Kachel aufblähen und mit dem Titel-Knopf konkurrieren. Kachel → Detail → Anbieter sind zwei Tipps. → `docs/ideas.md`.

**Route** (`src/domain/route.ts`):
- `TABS = ["entdecken", "karte", "anbieter", "kalender", "merkliste"]`. `tabSection("anbieter")` liefert `"entdecken"`, der Rückgabetyp wird `Exclude<Tab, "karte" | "anbieter">`.
- `Route` bekommt `providerId?: string`, URL-Parameter `anbieter=`.
  - Geprüft wird gegen `PROVIDER_ID_PATTERN`. Die kebab-Regel `^[a-z0-9]+(?:-[a-z0-9]+)*$` zieht dafür aus `schema.ts` nach `src/domain/ids.ts` um (einzige Definition, wie `OFFER_ID_PATTERN`). `schema.ts` importiert sie, der Vertrag bleibt gleich (`pnpm schema:check` grün).
  - Zusätzlich sind höchstens 80 Zeichen erlaubt (längste echte ID: 47).
  - Ob es den Anbieter gibt, prüft die Oberfläche nach dem Laden des Katalogs (E3).
- Kanonisch: Filter, `ansicht`, `anbieter`, `angebot`. Beispiel: `kat=musik&ansicht=anbieter&anbieter=theater-beispiel&angebot=…`.
- **Startansicht** bleibt die Liste (Plan 0005, E5). Ein Tipp auf „Entdecken“ führt immer zur Liste, eine zuletzt gewählte Darstellung wird nicht gespeichert.
- Suchtext, aufgeklappte Abschnitte und Scrollposition sind Sitzungszustand und stehen nie in der URL.

**Umschalter** (`ViewToggle` in `Chrome.tsx`):
- API `view: "liste" | "karte" | "anbieter"`, `onView(view)`. Drei Knöpfe mit `aria-pressed`, die Legende „Darstellung der Angebote“ bleibt.
- CSS (`styles/map.css`, Abschnitt `.view-toggle`):
  - Daumenbreite `calc(100% / var(--n))` statt 50 %, `--n: 3`.
  - Position per `translateX(index · 100%)`, wie heute über `style`.
  - `fieldset.view-toggle` mit `flex: 0 1 18rem` und `min-width: min(100%, 16.5rem)`.
  - **Große Schrift**: `container-type: inline-size` am Fieldset. `@container (width < 16.5rem)` macht ihn einspaltig, ohne Daumen, und der gewählte Knopf trägt die Fläche selbst (wie `.seg3` im Sheet, Plan 0007, E8). In `rem` gerechnet greift das bei 200 % und nie bei 320 px / 100 %.
  - Die Werte sind Startwerte. Es entscheidet das Text-Gate: einzeilige kurze Labels bei 100 %, nichts ragt bei 320 px / 200 % heraus.
- Bei 320 und 360 px hochkant steht der Umschalter schon heute in einer eigenen Zeile unter der Statuszeile (10 rem + 12 rem > Inhaltsbreite). Daran ändert sich nichts. Im Querformat bleibt er neben der Statuszeile, die erste Kachel behält ≥ 80 px (layout.spec, Plan 0007).

### E3 – Anbieter-Sheet, History und Reihenfolge der Dialoge

- Das Anbieter-Sheet ist ein `<dialog>` (Hülle `Dialog.tsx`, Klasse `sheet`) wie das Orts-Sheet. Es öffnet über `?anbieter=<id>`, aus jeder Ansicht.
- `useRoute` bekommt `openProvider(id)` und `closeProvider()`:
  - `openProvider` setzt `providerId`, **entfernt `offerId`** und macht `pushState({ zpProvider: true })`.
  - `closeProvider` geht per `history.back()` zurück, wenn der Eintrag von uns kommt, sonst `replaceState` ohne `anbieter`. Das ist dasselbe Muster wie `closeDetail`.
- **Wege:**
  - Liste → Zeile → Sheet. „Zurück“ (Browser oder „Schließen“) schließt das Sheet.
  - Sheet → Kachel → Detail **über** dem Sheet (`openDetail` behält `providerId`). „Zurück“ schließt nur das Detail. Das Sheet bleibt samt Scrollposition stehen, wie beim Orts-Sheet. Beim Spitzenreiter mit 71 Angeboten ist das wichtig.
  - Detail → „Alle Angebote dieses Anbieters“:
    - Ist das Sheet dieses Anbieters schon darunter offen (`route.providerId === offer.providerId`), gilt `closeDetail()`. Man landet zurück im Sheet.
    - Sonst gilt `openProvider(offer.providerId)`: Das Detail schließt, das Sheet öffnet. Ein „Zurück“ öffnet wieder das Detail.
- **Reihenfolge im Top-Layer:** Stehen `anbieter` und `angebot` zugleich in der URL (Neuladen, geteilter Link, `popstate` nach einem Neuladen), muss das Detail **über** dem Sheet liegen.
  - Das Sheet lädt aber lazy, das Detail nicht. Ohne Vorkehrung ginge das Detail zuerst auf, und das Sheet legte sich darüber.
  - Darum meldet der Sheet-Host `pending` (Chunk oder Katalog laden noch), und `Overlays` öffnet das Detail erst, wenn `!providerPending`. Schlägt das Laden fehl, gilt das als erledigt.
  - Der Host rendert in `Overlays` vor dem Detail-Dialog. Ist der Chunk schon geladen, öffnet das Sheet also im selben Commit zuerst.
- **Unbekannte ID** (Tippfehler, Anbieter aus dem Katalog entfernt): Nach dem Laden des Katalogs ruft der Host `onUnknown()` auf, und die App entfernt `anbieter` per `replaceState`. Das ist dasselbe Muster wie beim unbekannten Angebot in `App.tsx`.
- Fokus:
  - Das Sheet gibt den Fokus an den Opener zurück (Zeile, Detail-Knopf).
  - Fehlt der Opener (Deep-Link, Detail geschlossen), geht der Fokus an `fallbackFocus`. Ist Plan 0008 da, ist das der aktive Tab (`activeTab`, Plan 0008 E11), sonst bleibt es beim Standard von `Dialog.tsx`.
- Der Seiten-Toast schweigt bei offenem Sheet, wie bei jedem Modal (`dialogOpen` in `App.tsx` um `route.providerId` erweitern).

### E4 – Filter: Die Liste folgt der Auswahl, das Sheet zeigt alles

- **Liste:** Grundlage sind `visible` (Filter, Sticker, Umkreis bzw. später Wegzeit, Altersregel) und `upcoming` (alle kommenden Angebote).
  - **Aktiv** ist ein Anbieter mit mindestens einem sichtbaren Angebot.
  - Die Zeile sagt „3 Angebote“, wenn alle kommenden sichtbar sind, sonst „1 von 3 Angeboten“.
  - Ein Anbieter ohne sichtbares Angebot kommt in den eingeklappten Abschnitt (E5).
  - Das entspricht der Orts-Liste der Karte, die auch nur Orte mit sichtbaren Angeboten zeigt.
  - So beantwortet die Liste Frage 3 aus E1 ohne eigenen Filter: Sticker „Musik“ antippen, dann stehen oben die Anbieter mit Musik.
- **Statuszeile** in dieser Darstellung: „**5** Anbieter mit **8** Angeboten“ (Einzahl „1 Anbieter mit 1 Angebot“). Gezählt werden nur die aktiven Anbieter und die sichtbaren Angebote. Mit Startpunkt folgt wie überall `distanceNote(origin)` in eigener Zeile. Umkreis- und Alters-Hinweis gelten unverändert.
- **Sheet:** Es zeigt **alle** kommenden Angebote des Anbieters, unabhängig von Filtern und Alter.
  - Was nicht zum Alter passt, markiert die Kachel wie überall (`ctx.isUnfit`, Fakt mit der Altersspanne).
  - Sind Filter oder Altersregel aktiv und blenden in der Liste etwas aus, steht über den Kacheln: „Alle Angebote, auch die außerhalb deiner Auswahl.“
  - Begründung: Das Sheet beantwortet Frage 2 („was macht der sonst noch“) und öffnet auch aus der Merkliste oder dem Kalender. Ein durch Filter leeres Sheet würde dort verwirren.
- Die Rechenlogik liegt in der Domäne (E6, `directory.ts`). Komponenten zählen und filtern nicht selbst.

### E5 – Sortierung, Suche, Anbieter ohne Termine

- **Sortierung:** immer alphabetisch nach Namen, `localeCompare(…, "de")`. Begründung:
  - Eine Übersicht sucht man nach Namen ab (Frage 1).
  - Mit Startpunkt sortiert bereits die Orts-Liste der Karte nach Nähe.
  - Eine Sortierung, die sich mit dem Startpunkt ändert, macht eine Namensliste unberechenbar.
  - Offene Frage 2.
- **Suche:** `<input type="search">` mit sichtbarem Label „Anbieter suchen“ und Platzhalter „z. B. Bibliothek“. Schrift ≥ 16 px, `enterkeyhint="search"`.
  - Die Suche wirkt auf beide Abschnitte. Mit Suchtext ist der eingeklappte Abschnitt offen.
  - Verglichen wird in der Domäne mit `matchesProviderQuery(name, query)`:
    - Der Suchtext wird an Leerzeichen in Teile zerlegt. Jeder Teil muss im Namen vorkommen.
    - Gefaltet wird ohne Groß-/Kleinschreibung, `ß` → `ss`, und Umlaute in beiden Schreibweisen: „nurnberg“, „nuernberg“ und „Nürnberg“ treffen „Nürnberg“.
  - Kein Treffer: „Kein Anbieter heißt so.“ mit Textknopf „Suche löschen“.
  - Der Suchtext ist Sitzungszustand der Ansicht und steht nicht in der URL (E2). Tippen löst keinen Request aus (E8).
- **Anbieter ohne passende Termine:** Sie stehen eingeklappt am Ende, hinter einem Knopf mit `aria-expanded`:
  - ohne Filter: „10 Anbieter ohne Termine zeigen“ bzw. „… ausblenden“;
  - mit Filter: „58 Anbieter ohne passende Termine zeigen“.
  - Die Zeilen sind blasser gestaltet, ohne Deckkraft-Trick: gestrichelter Rahmen („noch nicht eingeklebt“, Stickerheft-Stil) und Text in `--ink-2`. Der Kontrast bleibt AA, axe prüft das.
  - Die zweite Zeile lautet „Gerade keine Termine im Plan“, wenn der Anbieter gar keine kommenden Angebote hat, sonst „3 Angebote, keins passt zur Auswahl“. Stadtteile kommen dann aus den Katalog-Orten.
  - Ein Tipp öffnet auch hier das Sheet. Es nennt die Website als nächsten Schritt (E9).
  - Begründung: Weglassen hieße, dass Eltern einen bekannten Anbieter vergeblich suchen. Er steht vielleicht nur gerade ohne Termine da (z. B. das Staatstheater). Offen gedimmt würden die 10 bis 58 Zeilen die aktiven Anbieter verdrängen. Offene Frage 3.

### E6 – Daten: Katalog als eigene Lazy-Datei, keine Schemaänderung

**Felder je Anbieter** (`SiteProvider` in `src/domain/site-data.ts`):

```ts
export interface SiteProvider {
  id: string;
  name: string;
  /** Website des Anbieters; laut Katalog bei allen 74 zugleich eine Programm-URL */
  url: string;
  topics: Topic[];
  venues: Array<{ name: string; address: string; district?: string }>; // address über venueAddress (Plan 0007, H6)
}
export interface ProviderDirectoryData { providers: SiteProvider[] }
export function toProviderDirectory(providers: readonly Provider[]): ProviderDirectoryData; // nur role "anbieter", nach Name sortiert
```

- **Alle Felder gibt es im Katalog schon.** Es gibt keine Schemaänderung, `schema/*.json` bleibt unverändert, und der Skill `babyevents-nuernberg` und die Pipeline bleiben unberührt.
- **Nicht ausgeliefert** werden `programme[]`, `notes`, `availability`, `verified`, `age`, `formats`, `costs`, `registrations`, `coveredBy`, `ring`, `geo` und die Orts-IDs. Das ist Datensparsamkeit, und es spart Bytes (Tabelle in der Ausgangslage).
  - `programme[]` sind Recherchequellen (JSON-APIs, iFrames, JS-Widgets). Für Eltern taugt davon nur `url`, und das ist laut Ausgangslage bei allen 74 Anbietern zugleich eine Programm-URL. Der Link heißt deshalb „**Website & Programm**“.
  - `geo` braucht es nicht: Die Entfernung kommt aus den Angeboten (E9). Ein Anbieter ohne Angebote zeigt keine Entfernung.
- **Abgeleitet, nie gespeichert** (`src/domain/directory.ts`): Zahl der sichtbaren und kommenden Angebote, Stadtteile, nächste Entfernung, Kategorien, aktiv oder nicht.
- **Kategorien des Anbieters** = `categoriesOf(Katalog-Themen ∪ Themen seiner kommenden Angebote)`. Die Vereinigung ist nötig, weil bei 10 Anbietern die Angebote Kategorien haben, die der Katalog nicht nennt.
- **Auslieferung als eigene Datei** `public/data/anbieter.json`, geschrieben von `scripts/build-data.ts` aus `toProviderDirectory(result.providers)`. Der Fixture-Build schreibt sie aus den Fixtures, wie `site.json`.
  - **Verworfen: in `site.json`.** Das wären +7 bis 9 kB gzip für jeden Besuch, auf dem Weg zum LCP (die Kacheln warten auf `site.json`), für eine Nebenfunktion. Das Budget von 250 kB hielte es aus, die Ladezeit zählt trotzdem.
  - Die Lazy-Datei kostet keinen zusätzlichen Zustand: Der Code der Übersicht lädt ohnehin lazy (E7). Datei und Chunk laden parallel, mit einem gemeinsamen Lade- und Fehlerzustand.
  - Gemessen: **30,6 kB roh, 7,63 kB gzip.** Das wächst um ca. 0,1 kB gzip je Anbieter.
- **Laden**: `src/data/providers.ts`, `loadProviderDirectory(fetchFn = fetch)`:
  - lädt `${BASE_URL}data/anbieter.json`;
  - HTTP ≠ 2xx wirft;
  - das Promise wird im Modul zwischengespeichert, ein Fehlschlag leert den Speicher (erneuter Versuch);
  - `fetch` wird injiziert, weil `vitest.setup.ts` `fetch` verbietet.
  - Die UI liest die Datei nur über diese Funktion (`ui-reads-data-only-via-src-data`).
- `data/offers.json` und `data/providers.yaml` werden nicht angefasst. `meta.json` und die Plausibilität gegen die Live-Seite (ADR 0002) bleiben gleich.
- **Fixtures** (fiktiv) bekommen zwei Einträge:
  - `turnverein-beispiel`, „Turnverein Beispiel (fiktiv)“, `role: anbieter`, **ohne Angebote**, zwei Orte (einer mit, einer ohne `district`), Themen `eltern-kind-turnen`, `bewegung`;
  - `sammelkalender-beispiel`, `role: aggregator`, darf in `anbieter.json` nicht auftauchen.
  - `dataset.test.ts` erwartet dann `providers: 7`. Weitere Tests, die Fixture-Anbieter zählen, ziehen nach.

### E7 – Ladekette, Budgets und Architekturregeln

**Ladekette in zwei Stufen** (Vorbild Plan 0005):
- **Start**: `src/ui/ProviderPanel.tsx`. Es exportiert `ProviderPanel` (Darstellung „Anbieter“) und `ProviderSheetHost` (Dialog-Hülle des Sheets).
  - Beide nutzen `useLazy(loadProviderUi)` aus `Lazy.tsx`.
  - Der Lader ist modulweit und lädt Chunk und Daten parallel:
    ```ts
    async function loadProviderUi(): Promise<ProviderUi> {
      const [ui, data] = await Promise.all([import("./anbieter/entry.ts"), loadProviderDirectory()]);
      return { ...ui, data };
    }
    ```
    Das ist eine async-Funktion mit `await import(…)`, wie es `Lazy.tsx` verlangt.
  - Zustände: laden (Platzhalter), Fehler (`LoadFailed`), da.
- **Lazy**: `src/ui/anbieter/`:
  - `entry.ts` exportiert `ProviderScreen` und `ProviderSheet`, damit es ein Chunk bleibt;
  - `ProviderScreen.tsx`, `ProviderSheet.tsx`, `provider-format.ts` (+Test).
  - `src/domain/directory.ts` wird nur von hier importiert und landet deshalb im Lazy-Chunk.
- **Props-Typen** liegen in `src/ui/provider-types.ts` (wie `map-types.ts`), weil von außen kein Typ statisch nach `anbieter/` greifen darf.
- **Statuszeilen-Zahl** im Start: `countProviders(offers)` in einem eigenen Mini-Modul `src/domain/provider-count.ts`. Sonst zöge `directory.ts` ins Startbundle. Das ist dasselbe Muster wie `place-key.ts` (Plan 0005, Arch-Review 2, m4).
- Die Stile stehen in `src/ui/styles/anbieter.css` im Start-CSS (ca. +0,3 kB, CSS-Luft 4,6 kB). So machen es auch `styles/map.css` und die Orts-Liste. Die Zeilen verwenden die Klassen der Orts-Liste (`.places`, `.place`), neu sind nur `.place.idle`, die Suche und das Sheet.

**Architekturregeln** (mit Kanarienvogel je Regel, ADR 0004):
- dependency-cruiser `anbieter-ui-only-lazy`: `from: { path: "^src/", pathNot: "^src/ui/anbieter/" }` → `to: { path: "^src/ui/anbieter/", dependencyTypesNot: ["dynamic-import"] }` ist verboten, auch für reine Typ-Importe.
- dependency-cruiser `anbieter-ui-entry-only`: Nur `src/ui/ProviderPanel.tsx` greift auf `src/ui/anbieter/` zu.
- `scripts/check-architecture.ts`, `LAZY_LOADERS`: Neu ist `["src/ui/ProviderPanel.tsx", "./anbieter/"]` (`lazy-loader-static`).
- `src/ui/anbieter/` importiert nichts aus `src/ui/karte/` oder `src/ui/map/`. Die bestehenden Regeln erzwingen das bereits. Ein Modul, das nur die beiden Lazy-Chunks teilen, landete sonst als eigener Chunk in `assets/` und zählte fälschlich ins Startbudget.
- `vite.config.ts`, `chunkFileNames`: Ein Chunk mit einem Modul aus `/src/ui/anbieter/` landet in `assets/anbieter/[name]-[hash].js`.
  - Greift die Zuordnung nicht, zählt der Chunk ins Startbudget, und `Anbieter JS (lazy)` findet keine Datei. Beides wird rot.

**Budgets** (`.size-limit.json`):
- `JS (initial)` bleibt 90 kB. **Ziel für diesen Plan: +≤ 1,0 kB gzip.** Geschätzt:
  - Route und `useRoute` ca. 0,3 kB;
  - Lader und Host ca. 0,3 kB;
  - Umschalter, Detail-Knopf, Statuszeile und Verdrahtung ca. 0,3 kB;
  - `src/data/providers.ts` und `provider-count.ts` ca. 0,1 kB.
  - **Gemessen wird nach Schritt 3 und nach Schritt 5**, das Ergebnis steht unter „Umsetzung“.
- Neu `Anbieter JS (lazy)`, `dist/assets/anbieter/*.js`: **6 kB**. Geschätzt sind 3 bis 4 kB: zwei Komponenten, Domäne, Format.
- Neu `Daten (anbieter.json)`, `dist/data/anbieter.json`: **15 kB**. Gemessen sind 7,63 kB, das reicht bis etwa 140 Anbieter.
- `CSS` bleibt bei 15 kB.

**Entscheidungsregel Startbudget** (Schritt 2): Gemessen wird der Ausgangswert `A` auf dem aktuellen `main`.
- Gilt `A + 1,0 ≤ 89,5 kB`, geht es los. 0,5 kB bleiben als Reserve.
- Sonst wird **zuerst verschlankt, nicht das Budget erhöht**: Filter- und Kind-Sheet samt `OriginPicker` und `districts.ts` laden lazy beim Öffnen. Das sind 8,8 kB minifiziert, geschätzt 2,5 bis 3 kB gzip.
  - Das wird ein eigener kleiner Plan vor diesem. Sollte auch das nicht reichen, ist eine Budget-Änderung eine neue Entscheidung mit ADR (nächste freie Nummer nach 0011, das Plan 0009 belegt).
- **Hinweis für die Reihenfolge:** Plan 0009 rechnet mit bis zu +1,5 kB. Nach Plan 0008 (ca. 87,9 kB) gilt: 87,9 + 1,5 + 1,0 = 90,4 kB. Beide Pläne zusammen passen also nur, wenn mindestens einer unter seiner Schätzung bleibt oder der Ausweg vorher kommt. Wer als Zweiter landet, misst und entscheidet nach dieser Regel.

### E8 – Privatsphäre

- **Kein neuer Drittanbieter-Request.** `anbieter.json` und der Chunk kommen vom eigenen Origin. Die Datei ist für alle gleich, ohne Querystring. GitHub Pages erfährt nur „jemand hat die Übersicht geöffnet“, wie bei jeder anderen Datei. Der `thirdPartyGuard` in E2E bleibt unverändert scharf.
- **Externe Links** (Website & Programm) öffnen mit `target="_blank" rel="noopener"`, wie im Detail. Der Referrer bleibt beim Browser-Standard (ADR 0008): Die Anbieterseite sieht nur `https://zwergenplan.app/`, keinen Pfad und keinen Querystring.
- **URL:** Hinzu kommen nur `ansicht=anbieter` und `anbieter=<id>`. Die Anbieter-ID ist öffentlich (Repo) und verrät nichts über die Familie, wie heute `angebot=`.
  - Suchtext, Geburtsdatum, Startpunkt und Merkliste kommen nie in die URL.
  - Der Test „kennt keinen Startpunkt“ in `route.test.ts` läuft künftig auch über `anbieter` und mit gesetztem `providerId`. Die Fixture-ID `theater-beispiel` enthält keinen Stadtteilnamen.
- Die Entfernung rechnet lokal über `ctx.reachOf` (E9). Ab der Wahl des Startpunkts entsteht kein Request (`e2e/startpunkt.spec.ts` gilt weiter), auch nicht bei offener Anbieterliste. E2E belegt das.
- Die Suche läuft lokal. Ab dem ersten Tastendruck entsteht kein Request (E2E).

### E9 – Darstellung und Zustände

**Zeile** (Button, ≥ 44 px, Klassen `.places`/`.place`):
- `<b class="provider-name">` mit dem vollen Namen. Er trennt nach Silben (`hyphens: auto`, `lang="de"` steht am `<html>`). Lange Komposita wie „Schwangerschaftsfragen“ brechen so an Silben statt mitten im Wort. Das Text-Gate überspringt `hyphens: auto` mit derselben begründeten Regel wie bei Titeln (Plan 0007, E10; Plan 0008, E14).
- Zweite Zeile, gebaut von `providerLine(row)` in `provider-format.ts`: „3 Angebote · Gostenhof · 1,4 km“.
  - Bei mehr als zwei Stadtteilen: „Gostenhof, St. Johannis +2“.
  - Der Stadtteil ist `venue.district ?? venue.name`, wie auf der Kachel.
  - Die Entfernung ist die **kürzeste** über die sichtbaren Angebote, verglichen mit `compareReach` aus der Domäne und formatiert mit der Kurzform der Kachel (heute `distanceShort`, nach Plan 0009 dessen Nachfolger).
  - So wird aus der Luftlinie mit Plan 0009 ohne Änderung hier eine Wegzeit.
- Kategorien stehen nicht in der Zeile, nur im Sheet. Die Namen sagen meist schon, worum es geht, und jede weitere Zeile kostet bei 200 % viel Höhe.

**Anbieter-Sheet** (`ProviderSheet.tsx`, Hülle wie beim Orts-Sheet: `.sheet-body`, `.sheet-scroll`, `.sheetfoot`):
1. `h2` mit dem Namen (`hyphens: auto`).
2. Kategorien als Text: „Musik & Singen · Krabbel- & Spielgruppen“ (`CATEGORY_LABELS`).
3. `<a class="btn wide" href={url} target="_blank" rel="noopener">` mit Icon `external`, Text „Website & Programm“.
4. `h3` „Ort“ bzw. „Orte“: je Katalog-Ort Name, Adresse und Stadtteil. Liste ohne Entfernung (kein `geo`, E6).
5. `h3` „Kommende Angebote (7)“, darunter ggf. der Hinweis aus E4. Dann die Kacheln nach dem nächsten Termin (`groupByNextSession`, `dated`).
   - Die Kachel bekommt `atProvider`: Ihre Meta-Zeile lässt den Anbieternamen weg (er steht im Kopf) und zeigt nur Stadtteil/Ort und Entfernung. Das ist das Gegenstück zu `atPlace` aus Plan 0008 (E19).
6. Ohne kommende Angebote: „Gerade stehen keine Termine im Zwergenplan. Auf der Website steht vielleicht mehr.“
7. Fuß: „Schließen“ (`.btn primary wide`).

**Zustände der Liste:**
- **Laden** (Chunk oder Datei): Platzhalter in fester Höhe, wie die Orts-Liste (`min-height`), damit nichts springt (CLS). Text „Anbieter werden geladen …“.
- **Fehler:** `LoadFailed` mit „Die Anbieter konnten nicht geladen werden. Alle Angebote stehen in der Liste.“ Erst kommt „Nochmal versuchen“, beim zweiten Mal „Seite neu laden“ (Verhalten aus `Lazy.tsx`, die URL behält `ansicht=anbieter`).
- **Leer:**
  - Keine Daten (`hasData` falsch): `NoOffers` aus `ListView.tsx`, darunter der eingeklappte Abschnitt mit allen Anbietern.
  - Filter ohne aktiven Anbieter: `NoOffers` mit „Filter zurücksetzen“, der Abschnitt darunter bleibt.
  - Suche ohne Treffer: siehe E5.
- `site.json` lädt noch oder fehlt: Das regelt `App.tsx` wie bisher. Die Darstellung „Anbieter“ erscheint erst mit Daten.

**Zustände des Sheets:** Beim Laden steht „Anbieter wird geladen …“ im Dialog, beim Fehlschlag `LoadFailed` im Dialog. Eine unbekannte ID schließt das Sheet still (E3).

**Text-Gate und Touch-Ziele:**
- Zeilen, Suche, Ausklapp-Knopf, Website-Knopf und Schließen sind ≥ 44 px hoch. Die Suche hat ≥ 16 px Schrift.
- „Anbieter“ steht im Umschalter bei 100 % einzeilig (Text-Gate, Fixture-Daten).
- Bei 320 px / 200 % ragt nichts heraus. Der Umschalter ist dann einspaltig (E2).

**Dunkelmodus:** Es gibt nur Tokens, keine neuen Flächenfarben. Der gestrichelte Rahmen nutzt `--line`. `expectNoBrightIslands` prüft das.

**Querformat:** Die Seitenleiste bleibt unverändert. Das Sheet folgt den bestehenden Sheet-Regeln für das Querformat.

### E10 – Merkliste und ICS: „alle Termine dieses Anbieters“ → `docs/ideas.md`

Nicht in diesem Plan. Gründe:
- **Menge:** Der Spitzenreiter hat 71 Angebote, regelmäßige Angebote haben Dutzende Termine je Reihe. Eine Datei „alles von X“ flutet den Kalender, und ein Aufräumen ist mühsam (ein VEVENT je Termin, ADR 0003).
- **Es gibt den gezielten Weg schon:** Angebote im Sheet merken (Herz auf der Kachel), dann die Merklisten-ICS (ADR 0007). Das sind ausgewählte Termine statt aller.
- **Der eigentliche Wunsch ist ein Abo.** Dass neue Termine eines Anbieters von selbst kommen, ist die Idee „Abo-Feeds (webcal)“ aus `docs/ideas.md`. Ein statisches `ics/anbieter/<id>.ics` wäre ohne Abo bald veraltet.
- `docs/ideas.md` bekommt deshalb den Eintrag „Anbieter-Feed (webcal): alle Termine eines Anbieters als Abo, Unterfall der Abo-Feeds“, dazu „Anbieter merken/folgen“.

### E11 – Berührungspunkte mit Plan 0008 und Plan 0009

**Voraussetzung: Plan 0008 ist auf `main`.** Das betrifft die Paket-A-Dateien `App.tsx`, `Overlays.tsx` (`activeTab`), `Chrome.tsx` (`TabBar.currentRef`), `Lazy.tsx` (`retry` ohne Zwischen-Render) und `OfferCard.tsx` (`atPlace`). Dieser Plan baut auf dem Stand danach auf und legt sich nicht mit offenen Zweigen an.

| Datei | Plan 0008 | Plan 0009 | Plan 0010 ändert |
|---|---|---|---|
| `src/ui/App.tsx` | `LoadState.reason`, `activeTab` | Statuszeile „Wegzeit“, Hinweise | Statuszeile für `anbieter`, `ProviderPanel`, `dialogOpen` (ca. 20 Zeilen) |
| `src/ui/Overlays.tsx` | `fallbackFocus` | Durchreichen | `ProviderSheetHost` vor dem Detail, Detail wartet auf `!providerPending` |
| `src/ui/Chrome.tsx` | `TabBar` | Badge | nur `ViewToggle` |
| `src/ui/DetailDialog.tsx` | Hülle `.detail-body` | Wegzeit-Text | ein Knopf über „Website von …“ |
| `src/ui/OfferCard.tsx` | `atPlace` | Wegzeit-Kurzform | `atProvider` neben `atPlace` |
| `src/ui/Lazy.tsx` | `retry` | – | **unverändert**, nur genutzt |
| `src/ui/use-offer-views.ts` | `calendar.allIndex` | `reachFn` | **unverändert** (das Sheet rechnet `upcoming` im Chunk selbst über die Domäne) |
| `src/ui/format.ts` | `loadErrorText` | `reach*` | `providerStatusParts` (ein Export) |
| `src/ui/use-app-state.ts` | – | – | `openProvider`/`closeProvider` |
| `src/domain/route.ts` | – | – | `anbieter`, `providerId` |
| `src/domain/schema.ts` | – | `Timetable`, − `nearestStops` | eine Zeile: Import von `PROVIDER_ID_PATTERN` |
| `scripts/build-data.ts` | – | `wegzeit.json` | `anbieter.json` (eine `write`-Zeile) |
| `vite.config.ts` | – | ggf. `assets/oepnv/` | `assets/anbieter/` |
| `.size-limit.json`, `.dependency-cruiser.cjs`, `scripts/check-architecture.ts` | – | ggf. Wegzeit-Zeilen | Anbieter-Zeilen |
| `styles/map.css` | – | – | `.view-toggle` für drei Segmente |
| `e2e/mobile-ux.spec.ts` | Regressionen | Wegzeit-Ansichten | Anbieter-Ansichten (eigene Einträge in `VIEWS`) |
| `docs/architecture.md` | Datenfluss, Gates | Wegzeit | Datenfluss, Ladekette |

- **Mit Plan 0009:**
  - Die Anbieterliste nutzt nur `ctx.reachOf`, `compareReach` und die Kurzform der Kachel. Hinter dieser Schnittstelle tauscht Plan 0009 die Luftlinie gegen die Wegzeit (Plan 0004, E9).
  - Landet 0009 zuerst, ruft `ProviderScreen` beim Öffnen mit Startpunkt dessen `want()` auf, wie `MapScreen`. Landet 0010 zuerst, ergänzt 0009 diese eine Zeile.
  - Die Schlagwort-Umbenennung (`distanceShort` → Nachfolger) macht, wer zuletzt landet.
  - Die Budget-Reihenfolge regelt E7.

### E12 – Arbeitsteilung: zwei Pakete ohne gemeinsame Dateien

Zuerst kommt ein gemeinsamer Schritt (Schritt 3, „Schnittstellen“, ein Commit): `SiteProvider`/`ProviderDirectoryData` in `site-data.ts`, `src/ui/provider-types.ts` mit `ProviderScreenProps`/`ProviderSheetProps`, die Signaturen von `src/domain/directory.ts` (Typen und `throw`-Stubs, noch ohne Logik), das Gerüst `src/ui/anbieter/entry.ts`. Danach laufen zwei Pakete parallel, jeweils in einem eigenen Worktree und Branch:

| | Paket A – Daten, Route, Verdrahtung (`PW_PORT=4173`) | Paket B – Oberfläche im Chunk (`PW_PORT=4273`) |
|---|---|---|
| Domäne | `ids.ts`, `route.ts` (+Tests), `provider-count.ts` (+Test), `site-data.ts` (`toProviderDirectory` +Test) | `directory.ts` (+Test, ersetzt die Stubs) |
| Daten | `scripts/build-data.ts`, `src/data/providers.ts` (+Test), Fixtures (`providers.yaml`), `dataset.test.ts` | – |
| UI | `use-app-state.ts`, `App.tsx`, `Chrome.tsx`, `Overlays.tsx`, `DetailDialog.tsx`, `ProviderPanel.tsx`, `format.ts` (+Test), `styles/map.css` | `anbieter/*` (+`provider-format.test.ts`), `OfferCard.tsx` (`atProvider`), `styles/anbieter.css`, `styles.css` (Import) |
| Build, Regeln | `vite.config.ts`, `.size-limit.json`, `.dependency-cruiser.cjs`, `scripts/check-architecture.ts`, `schema.ts` (Import) | – |
| E2E | `e2e/anbieter.spec.ts` Teil „Navigation, URL, Laden, Fehler“ | `e2e/anbieter.spec.ts` Teil „Liste, Suche, Sheet-Inhalt“ als **eigene Datei** `e2e/anbieter-inhalt.spec.ts`, `mobile-ux.spec.ts`, `smoke.spec.ts`, `scripts/screenshots.ts` |

- B testet seine Komponenten bis zur Zusammenführung mit Unit-Tests (`directory.test.ts`, `provider-format.test.ts`). Die E2E-Läufe von B starten erst nach dem Merge von A in B, weil erst A die Navigation verdrahtet.
- **Lokale Perf-Tests** (`perf.spec.ts`, Schrift-Swap) sind unter Parallellast unzuverlässig. Rot nur lokal unter Last ist kein Befund. Das endgültige Gate ist die CI.

## Struktur

```
public/data/anbieter.json          NEU, generiert (nicht committet), wie site.json
src/domain/
  ids.ts (+test)                   + PROVIDER_ID_PATTERN (kebab, aus schema.ts)                    [A]
  schema.ts                        kebab = PROVIDER_ID_PATTERN (Vertrag unverändert)              [A]
  route.ts (+test)                 Tab „anbieter“, providerId/anbieter=, tabSection               [A]
  site-data.ts (+test)             SiteProvider, ProviderDirectoryData, toProviderDirectory      [A]
  provider-count.ts (+test)        countProviders (Start, Statuszeile)                            [A]
  directory.ts (+test)             NUR LAZY: providerRows, providerCategories, providerOffers,
                                   matchesProviderQuery                                           [B]
src/data/
  providers.ts (+test)             loadProviderDirectory (fetch injizierbar, Cache, Retry)       [A]
src/ui/
  ProviderPanel.tsx                Start: ProviderPanel, ProviderSheetHost, loadProviderUi       [A]
  provider-types.ts                Props der Lazy-Komponenten                                     [Schritt 3]
  anbieter/entry.ts                exportiert ProviderScreen, ProviderSheet                       [Schritt 3/B]
  anbieter/ProviderScreen.tsx      Suche, aktive Zeilen, eingeklappter Abschnitt, Leerzustände    [B]
  anbieter/ProviderSheet.tsx       Kopf, Website, Orte, Kacheln                                   [B]
  anbieter/provider-format.ts (+test)  providerLine, idleLine, toggleLabel                        [B]
  use-app-state.ts (+test)         openProvider, closeProvider                                    [A]
  App.tsx                          Statuszeile „N Anbieter mit M Angeboten“, ProviderPanel        [A]
  Overlays.tsx                     ProviderSheetHost, Detail wartet auf !providerPending          [A]
  Chrome.tsx                       ViewToggle mit drei Segmenten                                  [A]
  DetailDialog.tsx                 „Alle Angebote dieses Anbieters“                               [A]
  OfferCard.tsx                    atProvider                                                     [B]
  format.ts (+test)                providerStatusParts                                            [A]
  styles/map.css                   .view-toggle: --n, Container-Query                             [A]
  styles/anbieter.css, styles.css  Suche, .place.idle, Sheet                                      [B]
scripts/
  build-data.ts                    + data/anbieter.json                                           [A]
  check-architecture.ts            LAZY_LOADERS + ProviderPanel                                   [A]
  screenshots.ts                   Ansichten anbieter, anbieter-sheet                             [B]
.dependency-cruiser.cjs            anbieter-ui-only-lazy, anbieter-ui-entry-only                  [A]
.size-limit.json                   Anbieter JS (lazy) 6 kB, Daten (anbieter.json) 15 kB           [A]
vite.config.ts                     chunkFileNames → assets/anbieter/                              [A]
tests/fixtures/providers.yaml      + turnverein-beispiel (ohne Angebote), + sammelkalender-beispiel [A]
e2e/
  anbieter.spec.ts                 Navigation, URL, History, Lazy, Fehler, Privatsphäre           [A]
  anbieter-inhalt.spec.ts          Liste, Filter, Suche, Sheet-Inhalt, Entfernung                 [B]
  mobile-ux.spec.ts                Ansichten anbieter*, hell/dunkel, 320 px/200 %                 [B]
  smoke.spec.ts                    echte Daten: Anbieterliste und Gates                           [B]
docs/architecture.md               Datenfluss (anbieter.json), Ladekette Anbieter, Regeln         [Schritt 6]
docs/ideas.md                      Eintrag „Anbieterverzeichnis“ raus; neu: Anbieter-Feed, folgen,
                                   Kurzname, Einrichtungsart, Anbieter auf der Kachel, Sheets lazy  [Schritt 6]
```

Signaturen in `src/domain/directory.ts` (rein, ohne React, ohne Zod):

```ts
export interface ProviderRow {
  provider: SiteProvider;
  /** sichtbare (gefilterte) kommende Angebote / alle kommenden */
  shown: number;
  upcoming: number;
  /** district ?? venue.name, ohne Dubletten, aus den sichtbaren Angeboten; ohne solche aus dem Katalog */
  places: string[];
  /** kürzeste Entfernung über die sichtbaren Angebote; ohne Startpunkt undefined */
  nearest?: Reach;
}
export function providerRows(
  providers: readonly SiteProvider[],
  visible: readonly SiteOffer[],
  upcoming: readonly SiteOffer[],
  reachOf: (offer: SiteOffer) => Reach | undefined,
): { active: ProviderRow[]; idle: ProviderRow[] };            // beide nach Name (de) sortiert
export function providerOffers(offers: readonly SiteOffer[], providerId: string, now: Date): SiteOffer[]; // kommende
export function providerCategories(provider: SiteProvider, offers: readonly SiteOffer[]): Category[];
export function matchesProviderQuery(name: string, query: string): boolean;
```

`upcoming` für die Liste und `providerOffers` für das Sheet entstehen im Chunk über `applyFilters(offers, EMPTY_FILTER, { now })` aus `filter.ts`. `use-offer-views.ts` bleibt dadurch unberührt (E11).

## Tests

Test-first für alle Domänenfunktionen (Vitest, TZ `America/Los_Angeles`, Coverage ≥ 90 % in `src/domain`):

- **`ids`:** `PROVIDER_ID_PATTERN` akzeptiert alle 7 Fixture-IDs und lehnt `../x`, `A-b`, `a--b`, `-a`, `a-` und den Leerstring ab. `schema.ts` nutzt dieselbe Konstante, `pnpm schema:check` bleibt grün.
- **`route`:**
  - `ansicht=anbieter` übersteht den Round-Trip.
  - `anbieter=<id>` übersteht den Round-Trip, allein und zusammen mit Filter, Ansicht und Angebot. Kanonische Reihenfolge `kat=…&ansicht=anbieter&anbieter=…&angebot=…`.
  - Kaputte IDs (s. o., über 80 Zeichen) werden verworfen.
  - `tabSection("anbieter") === "entdecken"`.
  - Der Test „kennt keinen Startpunkt“ läuft zusätzlich über den Tab `anbieter` und mit `providerId: "theater-beispiel"`.
- **`site-data`, `toProviderDirectory`:**
  - nur `role: anbieter`, also kein Aggregator;
  - Schlüssel genau `id`, `name`, `url`, `topics`, `venues`, je Ort `name`, `address`, ggf. `district`. Kein `programme`, kein `notes`, kein `geo`;
  - `address` läuft über `venueAddress` (Fixture-Ort, dessen Adresse mit dem Namen beginnt);
  - sortiert nach `localeCompare(…, "de")`;
  - ein Ort ohne `district` hat den Schlüssel nicht (`exactOptionalPropertyTypes`).
- **`provider-count`:** `countProviders` zählt verschiedene `providerId`, leer → 0.
- **`directory`:**
  - `providerRows` mit den Fixtures (Uhr Mo 5.10.2026 12:00):
    - ohne Filter: 5 aktiv, 1 nicht aktiv (Turnverein). Familientreff `shown = upcoming = 3`, das beendete Angebot zählt nicht.
    - Sticker „Bücher“: aktiv nur „Bibliothek Beispiel (fiktiv)“, nicht aktiv die übrigen 5. Die Gründe unterscheiden sich: Turnverein mit `upcoming = 0`, die anderen mit `upcoming > 0`.
    - `places`: ohne Dubletten. Beim Turnverein kommen sie aus dem Katalog: der Stadtteil bzw. der Ortsname beim Ort ohne `district`.
    - `nearest`: mit einem gestubbten `reachOf` das Minimum über `compareReach`. Ohne Startpunkt `undefined`.
    - Sortierung mit Umlauten (Testname „Ärztehaus …“ zwischen A und B).
  - `providerOffers`: nur kommende des Anbieters, Reihenfolge wie in `site.json`.
  - `providerCategories`: Vereinigung aus Katalog und Angeboten. Fixture-Fall, schon vorhanden: Das Theater nennt im Katalog `theater` und `konzert` (nur „Bühne & Konzert“), ein Angebot hat zusätzlich `musik` → „Musik & Singen“ und „Bühne & Konzert“.
  - `matchesProviderQuery`: Groß/klein; „nurnberg“, „nuernberg“ und „Nürnberg“ gegen „Nürnberg“; „strasse“ gegen „Straße“; mehrere Teile in beliebiger Reihenfolge; Leerstring trifft alles; „xyz“ trifft nichts.
- **`data/providers`:**
  - lädt `…/data/anbieter.json` mit dem injizierten `fetch`;
  - zwei Aufrufe ergeben einen Request;
  - nach HTTP 503 wirft der Aufruf, der nächste Aufruf fragt neu an;
  - der Fehlertext enthält den Status.
- **`ui/format`:** `providerStatusParts(5, 8)` → „5“, „ Anbieter mit “, „8“, „ Angeboten“; Einzahl.
- **`ui/anbieter/provider-format`:** `providerLine` mit „3 Angebote“, „1 Angebot“, „1 von 3 Angeboten“, einem, zwei und vier Stadtteilen („+2“), mit und ohne Entfernung; `idleLine` in beiden Fällen; `toggleLabel` mit und ohne Filter, auf und zu.
- **`ui/use-app-state`:**
  - `openProvider` pusht und entfernt `angebot`;
  - `closeProvider` geht zurück, wenn der Eintrag von uns kommt, sonst `replaceState`;
  - `openDetail` aus offenem Sheet behält `anbieter`.

**E2E** (Fixtures, eingefrorene Uhr):

`e2e/anbieter.spec.ts` [A]:
1. **Umschalter:**
   - Liste → „Anbieter“: URL `ansicht=anbieter`, Statuszeile „5 Anbieter mit 8 Angeboten“.
   - „Entdecken“ aus dem Kalender führt zur Liste.
   - Neuladen mit `?ansicht=anbieter` öffnet die Anbieter.
2. **Lazy:**
   - Die Startseite lädt nichts aus `assets/anbieter/` und nicht `data/anbieter.json`.
   - Nach dem Umschalten kommen beide genau einmal.
   - Wieder „Liste“, dann wieder „Anbieter“: kein weiterer Request.
3. **Sheet und History:**
   - Zeile → Sheet, URL `anbieter=…`.
   - Browser-Zurück schließt das Sheet.
   - Neuladen mit `?anbieter=theater-beispiel` öffnet es.
   - `?anbieter=gibt-es-nicht` → Parameter weg, kein Dialog.
4. **Aus dem Detail:**
   - Detail des Theaters → „Alle Angebote dieses Anbieters“ → das Sheet ist offen, das Detail zu.
   - Zurück → wieder das Detail.
   - Im Sheet eine Kachel → Detail über dem Sheet. Zurück → das Sheet ist noch offen. Dort derselbe Knopf → zurück im Sheet, ohne neuen History-Eintrag.
5. **Deep-Link mit beiden Parametern:** Das Detail liegt oben. `elementFromPoint` in der Bildmitte liegt im Detail-Dialog. Schließen → das Sheet ist darunter sichtbar.
6. **Fehler** (`allowedConsoleErrors: [/\/data\/anbieter\.json\b/]`):
   - `anbieter.json` mit 503 → „Die Anbieter konnten nicht geladen werden …“ und `expectMobileUx`.
   - `unroute`, dann „Nochmal versuchen“ → die Zeilen sind da.
   - Dasselbe im Sheet per Deep-Link.
7. **Privatsphäre:**
   - In der Suche tippen → kein Request. Die URL enthält den Suchtext nie.
   - Mit offener Anbieterliste den Startpunkt Gostenhof wählen → ab dem Tipp kein Request.
   - Der Website-Link hat `target="_blank"`, `rel="noopener"` und das `href` aus dem Katalog. Er wird nicht angeklickt, der Wächter bleibt scharf.

`e2e/anbieter-inhalt.spec.ts` [B]:
1. **Liste:**
   - fünf Zeilen alphabetisch;
   - Familientreff „3 Angebote · Altstadt“;
   - der Knopf „1 Anbieter ohne Termine zeigen“ hat `aria-expanded="false"`. Danach ist der Turnverein mit „Gerade keine Termine im Plan“ sichtbar.
2. **Filter:**
   - Sticker „Bücher“ → nur die Bibliothek ist aktiv;
   - der Knopf heißt „5 Anbieter ohne passende Termine zeigen“;
   - Statuszeile „1 Anbieter mit 1 Angebot“.
3. **Suche:**
   - „bibliothek“ → eine Zeile;
   - „xyz“ → „Kein Anbieter heißt so.“; „Suche löschen“ stellt alles wieder her;
   - mit Suchtext ist der eingeklappte Abschnitt offen.
4. **Startpunkt Gostenhof:** Theater „200 m“, Familientreff „1,4 km“ (Werte aus Plan 0004). Ohne Startpunkt keine Entfernung.
5. **Sheet-Inhalt:**
   - Name, Kategorien, „Website & Programm“, Orte mit Adresse;
   - Kacheln ohne Anbieternamen in der Meta-Zeile;
   - mit Sticker „Bücher“ zeigt das Theater-Sheet trotzdem alle Theater-Angebote und den Hinweis „Alle Angebote, auch die außerhalb deiner Auswahl.“;
   - das Turnverein-Sheet zeigt den Text ohne Termine.
6. **Alter:** Mit Geburtsdatum markiert das Sheet nicht passende Angebote, wie die Kachel.

`e2e/mobile-ux.spec.ts` [B]:
- Neue Einträge in `VIEWS`: `anbieter`, `anbieter-offen` (eingeklappter Abschnitt offen), `anbieter-suche-leer`, `anbieter-sheet` (Theater), `anbieter-sheet-leer` (Turnverein), `anbieter-fehler`, `anbieter-startpunkt` (Gostenhof).
- Jeweils hell, dunkel per System und dunkel per Darstellung (`data-theme="dark"`), dazu 320 px / 200 %. Querformat und WebKit laufen über die Projekte wie bei jeder Ansicht.

`e2e/smoke.spec.ts` [B], echte Daten:
- Die Anbieterliste hat > 50 aktive Zeilen, der eingeklappte Abschnitt nennt > 0.
- Ein Sheet mit vielen Angeboten öffnet (die erste Zeile mit der höchsten Zahl).
- Gates und 320 px / 200 % bestehen, mit langen echten Namen.

`e2e/layout.spec.ts` [A]:
- „Anbieter“ steht im Umschalter bei 320 und 360 px einzeilig.
- Bei 320 px / 200 % ist er einspaltig, ohne Überlappung.
- Querformat 852×393 mit Darstellung „Anbieter“: Umschalter neben der Statuszeile, erste Zeile ≥ 80 px frei.

`scripts/screenshots.ts` [B]: neue Ansichten `anbieter` und `anbieter-sheet`.

## Backpressure

Keine Schwelle wird gesenkt, kein Gate gelockert. Neu sind Tests, zwei Budget-Zeilen und zwei Architekturregeln.

| Fehler kommt zurück | Gate wird rot |
|---|---|
| Anbieter-Code im Startbundle | `JS (initial)` und `Anbieter JS (lazy)` (findet keine Datei); `anbieter-ui-only-lazy`; `lazy-loader-static` |
| Zugriff auf `anbieter/` an `ProviderPanel` vorbei | `anbieter-ui-entry-only` |
| `directory.ts` rutscht in den Start | `JS (initial)` (Messung), Arch-Review |
| `anbieter.json` wächst über 15 kB | `Daten (anbieter.json)` |
| Programm-Quellen, Notizen oder `geo` in `anbieter.json` | `site-data.test.ts` (genaue Schlüssel) |
| Aggregator in der Übersicht | `site-data.test.ts`, `anbieter-inhalt.spec.ts` |
| Suchtext, Startpunkt oder Geburtsdatum in der URL | `route.test.ts`, `anbieter.spec.ts` |
| Request beim Tippen oder bei der Startpunkt-Wahl | `anbieter.spec.ts`, `startpunkt.spec.ts` |
| Externer Link ohne `rel="noopener"` | `anbieter.spec.ts` |
| Detail unter dem Sheet | `anbieter.spec.ts` Test 5 |
| Startseite lädt die Übersicht vorab | `anbieter.spec.ts` Test 2 |
| Umschalter bricht oder überlappt | Text-Gate in `expectMobileUx`, `layout.spec.ts` |
| Helle Insel, Kontrast der blassen Zeilen | `expectNoBrightIslands`, axe |

Kanarienvögel (je einzeln einsetzen, rot sehen, zurückbauen, unter „Umsetzung“ notieren):
- statischer Import und reiner Typ-Import von `./anbieter/entry.ts` in `App.tsx` → `anbieter-ui-only-lazy`;
- dynamischer Import von `./anbieter/entry.ts` in `Overlays.tsx` → `anbieter-ui-entry-only`;
- zusätzlicher statischer Import in `ProviderPanel.tsx` → `lazy-loader-static`;
- `programme` in `toProviderDirectory` → `site-data.test.ts`.

## Schritte

0. **Voraussetzung:** Plan 0008 ist auf `main` und live.
   - Den Stand von Plan 0009 prüfen: auf `main` oder nicht. Davon hängen die Budget-Rechnung (E7) und die Umbenennung (E11) ab.
   - *Fertig:* Beide Stände stehen hier unter „Umsetzung“.
1. **Plan und `/plan-review`**, Review einarbeiten.
   - *Fertig:* Der Plan hat einen Review-Abschnitt, kein Blocker ist offen, die offenen Fragen sind vom Nutzer beantwortet oder ausdrücklich auf den Standard gesetzt.
2. **Worktree und Ausgangswert:**
   - Branch `anbieter-0010` auf dem aktuellen `main`, `pnpm install`.
   - `pnpm build && pnpm size` als Ausgangswert `A` notieren und die Entscheidungsregel aus E7 anwenden.
   - *Fertig:* `A` und die Entscheidung („los“ oder „erst Sheets lazy“) sind hier notiert.
3. **Schnittstellen** (ein Commit, Basis für beide Pakete): `SiteProvider`/`ProviderDirectoryData`, `provider-types.ts`, `directory.ts` mit Typen und Stubs, `anbieter/entry.ts`.
   - *Fertig:* `pnpm check:fast` ist grün. knip meldet die Stubs nicht, weil `entry.ts` sie exportiert und `ProviderPanel` sie lädt; sonst bleiben sie bis Schritt 4 in einem Test referenziert.
4. **Pakete A und B parallel** (E12), jeweils test-first für die Domäne. Nach jedem Block `pnpm check:fast`.
   - **A**:
     - `ids`/`route`, `provider-count`, `toProviderDirectory`, `build-data`, `data/providers`, `useRoute`;
     - Lader, Host, Umschalter, Detail-Knopf, Statuszeile;
     - Regeln samt Kanarienvögeln, `vite.config`, Budgets, Fixtures;
     - `anbieter.spec.ts`, `layout.spec.ts`.
     - **Budget nach A messen** und notieren.
     - *Fertig:* `pnpm check:fast` grün, Unit-Tests grün, Budget unter dem Ziel.
   - **B**: `directory.ts`, `provider-format.ts`, `ProviderScreen`, `ProviderSheet`, `atProvider`, `anbieter.css`.
     - *Fertig:* `pnpm check:fast` grün, `directory.test.ts` und `provider-format.test.ts` grün.
5. **Zusammenführen:**
   - A nach B mergen (bzw. beide auf den Integrationsbranch).
   - Dann `anbieter-inhalt.spec.ts`, `mobile-ux.spec.ts`, `smoke.spec.ts` und `screenshots.ts` schreiben bzw. laufen lassen.
   - Dann `pnpm check` komplett, inklusive WebKit (lokal ggf. ohne `iphone-15`, siehe CLAUDE.md).
   - **Budget messen** und notieren.
   - *Fertig:* `pnpm check` grün, alle Budgets eingehalten, Messwerte notiert.
6. **Doku:**
   - `docs/architecture.md`: Datenfluss um `public/data/anbieter.json`; Schichten mit der Ladekette `ProviderPanel` → `src/ui/anbieter/` und den Regeln `anbieter-ui-only-lazy`, `anbieter-ui-entry-only`, `lazy-loader-static`; Budgets.
   - `docs/ideas.md`: Den Eintrag „Anbieterverzeichnis“ streichen. Neu: Anbieter-Feed (webcal), Anbieter merken/folgen, Kurzname im Katalog, Einrichtungsart im Katalog, Anbietername auf der Kachel antippbar, Filter-/Kind-Sheet lazy laden (Budget-Ausweg, E7). Je nach Antwort auf die offenen Fragen kommt eventuell „Sortierung nach Entfernung“ dazu.
   - *Fertig:* Beide Dateien sind nachgeführt, `pnpm check:fast` ist grün.
7. **`/arch-review`:** Pflicht, weil neue Module, eine neue Datenausgabe und über 200 Zeilen dazukommen.
   - *Fertig:* Kein Blocker ist offen, die Befunde stehen hier.
8. **Commit und Push** auf den Branch, CI grün (`gh run watch`). Dann Fast-Forward nach `main`, CI auf `main` grün, Deploy.
   - *Fertig:* Der CI-Lauf auf `main` ist grün, die Live-Seite zeigt den Umschalter mit „Anbieter“.
9. **`/browser-review live`:** Jede Zeile der Checkliste beantworten, besonders:
   - lange echte Namen bei 320 px / 200 % (Silbentrennung in Safari und Chrome Android);
   - Umschalter mit drei Segmenten hochkant, quer und bei 200 %;
   - Sheet mit 71 Angeboten (Scrollen, Detail darüber, Zurück behält die Position);
   - externer Link öffnet einen neuen Tab, im Netzwerk-Tab gehen keine Requests an fremde Hosts;
   - Dunkelmodus der blassen Zeilen.
   - *Fertig:* Das Ergebnis steht hier, jede Zeile ist beantwortet.

## Akzeptanzkriterien

- Umschalter „Liste | Karte | Anbieter“, Anbieterliste mit Suche und eingeklapptem Abschnitt, Anbieter-Sheet, Einstieg aus dem Detail und Deep-Link `?anbieter=`: umgesetzt und per E2E abgedeckt.
- Die Liste folgt Filtern, Stickern und Altersregel. Das Sheet zeigt alle kommenden Angebote. Beides ist per E2E belegt.
- `anbieter.json` enthält nur die Felder aus E6 und nur Anbieter.
- **Keine Schemaänderung**, `pnpm schema:check` grün, `data/` unverändert.
- Alle neuen Ansichten und Zustände bestehen `expectMobileUx` hell und dunkel, dazu 320 px / 200 %.
- `pnpm check` grün, CI grün auf `main`.
- Budgets:
  - `JS (initial)` ≤ 90 kB, Zuwachs ≤ 1,0 kB gemessen und notiert;
  - `Anbieter JS (lazy)` ≤ 6 kB;
  - `Daten (anbieter.json)` ≤ 15 kB;
  - `CSS` ≤ 15 kB.
- Privatsphäre per E2E belegt: kein Request beim Tippen und bei der Startpunkt-Wahl, kein Suchtext in der URL, Startseite ohne Anbieter-Assets, externe Links mit `rel="noopener"`.
- `docs/architecture.md` und `docs/ideas.md` sind nachgeführt, Arch-Review und Browser-Review live stehen hier.

## Risiken

- **Startbudget** (größtes Risiko): Plan 0008, 0009 und 0010 konkurrieren um die letzten 2,7 kB. Die Entscheidungsregel und der Ausweg stehen in E7. Gemessen wird nach Schritt 2, 4 und 5.
- **Lange Namen:** Median 59, maximal 111 Zeichen. Bei 320 px / 200 % werden Zeilen und Sheet-Kopf drei- bis fünfzeilig. Dagegen helfen Silbentrennung, das Text-Gate mit echten Daten (`smoke.spec.ts`) und der Browser-Review. Kurznamen wären eine Katalogänderung (offene Frage 4).
- **Reihenfolge im Top-Layer:** Die Vorkehrung steht in E3. Ein `popstate` in einen Eintrag mit beiden Parametern ist durch das Warten auf `!providerPending` mit abgedeckt.
- **Merge-Konflikte** mit Plan 0008 und 0009 in `App.tsx`, `Overlays.tsx`, `OfferCard.tsx`, `format.ts`, `mobile-ux.spec.ts`. Plan 0008 ist Voraussetzung. Mit 0009 sind es kleine, getrennte Stellen (Tabelle in E11).
- **„Gerade keine Termine“ täuscht:** Unter den 10 Anbietern ohne Angebote sind solche, deren Quelle die Recherche gerade nicht lesen konnte. Darum sagt der Text „im Plan“ bzw. „im Zwergenplan“, nicht „bietet nichts an“, und verweist auf die Website.
- **Katalog und Angebote laufen auseinander:** Bei 10 Anbietern fehlen Kategorien im Katalog. Die Vereinigung in E6 fängt das ab. Eine Warnung in `validate-data` wäre eine Katalogpflege-Aufgabe → beim nächsten Pipeline-Lauf, nicht hier.
- **Zweiter Daten-Request:** Fällt nur `anbieter.json` aus (Deploy-Fehler), bleiben Liste, Karte, Kalender und Merkliste voll bedienbar. Die Übersicht zeigt dann den Fehlerzustand. Die Gates prüfen ihn.

## Offene Fragen an den Nutzer

Jede Frage hat einen Standard, mit dem der Plan ohne Antwort umgesetzt wird.

1. **Wo soll die Übersicht wohnen?** Als dritte Darstellung „Liste | Karte | Anbieter“ in „Entdecken“ (Standard) oder als eigener vierter Tab? Ein vierter Tab ist auffälliger. Bei 320 px fallen dann aber die Tab-Beschriftungen weg (nur noch Symbole), und quer wird die Seitenleiste voller.
2. **Sortierung:** immer alphabetisch (Standard) oder, sobald ein Startpunkt gesetzt ist, nach Entfernung? Nach Nähe sortiert heute schon die Orts-Liste der Karte.
3. **Anbieter ohne Termine:** eingeklappt am Ende (Standard), ganz weglassen oder offen und blass mitten in der Liste?
4. **Lange Anbieternamen** (Median 59 Zeichen, z. B. „Stadtteiltreff Nordost (Sozialamt) – Offener Krabbeltreff & multikulturelle Eltern-Kind-Gruppe“): voll zeigen, wie heute auf der Kachel (Standard)? Oder soll der Katalog einen Kurznamen bekommen („Stadtteiltreff Nordost“)? Das wäre eine Schemaänderung und ein Pflege-Lauf über alle 74 Anbieter, also ein eigener Plan.
5. **„Art“ des Anbieters:** Reicht die Einordnung über die bekannten Kategorien („Musik & Singen“, „Krabbel- & Spielgruppen“) (Standard)? Oder wollt ihr eine Einrichtungsart wie Familienzentrum, Bibliothek, Musikschule, Theater, Museum? Auch das wäre ein neues Katalogfeld mit Pflege-Lauf.
