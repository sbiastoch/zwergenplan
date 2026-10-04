# Plan 0008 – Feinschliff nach den Live-Reviews

Status: Entwurf, `/plan-review` offen
Datum: 2026-10-05
Bezug: Plan 0007, Abschnitt „Offen für die Feinschliff-Runde (Stand 2026-10-05, nach Plan 0005)“ und dessen „Browser-Review live“ (Wichtig 1, Hinweise 1–9); Plan 0004, „Browser-Review live“ (H1–H4, W1); Plan 0005, Browser-Review live vom 2026-10-05 (H1–H7; steht noch nicht im Plan 0005, Quelle ist der Review-Bericht des Koordinators). Basis ist `main` auf `a682d4d`.

**Läuft parallel und gehört nicht in diesen Plan:**
- **Plan 0007, Paket C** (B6: Roboto-Fallback, Swap-Matrix, CLS). Es ändert `tokens.css`, `e2e/smoke.spec.ts`, `e2e/perf.spec.ts`, `e2e/vitals.ts`, `scripts/font-fallback.ts`, `package.json` und ggf. einzelne `font-family`-Zeilen in Komponenten-CSS. Dieser Plan fasst `tokens.css`, `smoke.spec.ts`, `perf.spec.ts` und `vitals.ts` nicht an (E22).
- **Doppelte Attribution der Karte** (W1 aus dem Review zu Plan 0005). Sie wird als Hotfix behoben, voraussichtlich in `src/data/tiles.ts`, `src/ui/map/MapView.tsx`, `tests/fixtures/karte/` und `e2e/karte.spec.ts`. Paket C startet erst auf einem `main` mit diesem Hotfix (Schritt 0).

## Ziel

Die offenen Befunde der drei Live-Reviews sind entschieden: umgesetzt mit Test oder begründet in `docs/ideas.md`. Am Ende gilt:

- **WebKit mit „Bewegung reduzieren“:** Nach dem Wechsel der Darstellung hat jeder Text spätestens 300 ms nach dem Tipp die neue Farbe, auch beim ersten Laden. Ein E2E-Test in WebKit war vorher rot.
- **Text-Gate ohne Fehlalarme, ohne Aufweichung:**
  - Die Woche mit zweistelligem Montag bei 320 px ist grün.
  - Eine halb hinausgescrollte Überschrift in einem Sheet ist grün.
  - Jede Präzisierung hat einen dauerhaften Kanarienvogel, der weiter rot wird.
- **`site.json`** wird in jedem Browser genau einmal geladen, ohne Preload-Warnung in WebKit.
- **Fehlerzustand** zeigt einen deutschen Satz statt „Failed to fetch“ bzw. „Load failed“. Die Fehlerart bestimmt `src/data`.
- **200 %:**
  - Im Detail belegt der ICS-Fuß bei großer Schrift und im Querformat keine feste Fläche mehr. Er steht am Ende des Inhalts.
  - Im Monatsraster sind benachbarte Tage bei großer Schrift als eigene Felder erkennbar.
- **Badge und Toast:**
  - Das Merklisten-Badge überdeckt in den Querformat-Leisten weder Label noch Herz.
  - Der Toast fängt keine Tipps ab.
- **Filter-Fuß** einzeilig ab ca. 340 px, weil „Zurücksetzen“ ein Textknopf wird.
- **Fokus-Rückweg:** Schließt man das Detail, nachdem die Kachel aus der Merkliste verschwunden ist, landet der Fokus auf dem aktiven Tab statt auf `<body>`.
- **Leerzustand im Kalender:** Blenden Filter, Umkreis oder Alter an diesem Tag Angebote aus, sagt die Agenda das, statt „Freier Tag“.
- **Kleinkram:**
  - „Startpunkt entfernen“ bleibt bei 200 % linksbündig.
  - Lange Anbieternamen trennen nach Silben statt an beliebiger Stelle.
- **Karte:**
  - Cluster bündeln unabhängig vom Startpunkt gleich (H1).
  - Ortsnamen stehen auf Deutsch (H2).
  - Die Attribution nutzt die App-Schrift (H3).
  - Kacheln im Orts-Sheet wiederholen den Ort nicht (H6).
  - Der Startausschnitt hält die Ecke der Zoom-Knöpfe frei (H7).
- Live unter https://zwergenplan.app/, `/browser-review live` beantwortet jeden Befund einzeln. Die Geräte-Checkliste (Abschnitt „Nur am Gerät prüfbar“) liegt beim Nutzer.

## Nicht-Ziele

- Plan 0007 Paket C und der Attributions-Hotfix (siehe oben).
- Schemaänderung, Änderung an `data/offers.json` oder `data/providers.yaml`. Die 9 Angebote mit doppeltem Ortsnamen bereinigt ein Pipeline-Lauf (E21).
- Ein neues Design für den Kopfbereich im Querformat (Review 0005, H4). Das steht schon als „Kompakter Kopfbereich im Querformat“ in `docs/ideas.md`.
- Sortierung der Liste nach Entfernung (Review 0004, H5, laut Plan 0004 kein Ziel).
- Neue Schwellen oder gelockerte Gates. Einzige Schwellenänderung ist eine Verschärfung: `MAX_REDUCED_MS` geht von 1 auf 0 (E1).

## Ausgangslage

- **Stand:** `main` auf `a682d4d`. Zeilenangaben sind gegen diesen Stand geprüft. Wo Zeilen wackeln können, stehen Funktions- oder Selektornamen dabei.
- **Reduzierte Bewegung:** `src/ui/styles/motion.css` Z. 5–17 setzt unter `prefers-reduced-motion: reduce` auf `*, *::before, *::after`:
  - `animation-duration: 0.01ms !important`, `animation-delay: 0s`, `animation-iteration-count: 1`,
  - `transition-duration: 0.01ms !important`, `transition-delay: 0s`.
  - Der Anfangswert von `transition-property` ist `all`. Damit trägt **jedes** Element eine echte 0,01-ms-Transition über alle Eigenschaften, also auch über `color`. WebKit schließt solche Transitionen verspätet ab. Gemessen im Review: Farben springen gestaffelt nach 340, 990, 3 900 und 4 650 ms um, 18 Textknoten ohne Kontrast. Beim Laden sind Marke und Tagesüberschrift die ersten 0,5–1 s `rgb(0,0,0)`.
  - Kein Code hört auf `transitionend` oder `animationend` (`grep` in `src/` leer). Keine Animation nutzt `forwards`, um einen Endzustand zu halten. Nur `peelin` nutzt `both` mit Verzögerung (`dialog.css` Z. 88).
- **`expectReducedMotion`** (`e2e/mobile-ux.ts` Z. 123–158) liest je Element `transitionDuration + transitionDelay` und `animationDuration + animationDelay` sowie `document.getAnimations()`. Verstoß ist alles über `MAX_REDUCED_MS = 1` (Z. 14). 0,01 ms besteht also. Das Gate misst die deklarierte Dauer, nicht die Wirkung. Den WebKit-Fehler konnte es deshalb nicht sehen. Die Gate-Läufe emulieren `reducedMotion: "reduce"` (`mobile-ux.spec.ts` Z. 159, 192, 239), `theme.spec.ts` dagegen nicht.
- **Text-Gate** (`expectTextFits`, `e2e/mobile-ux.ts` ab Z. 207):
  - **Prüfung 2** (Z. 289–319) vergleicht jede Textzeile mit der Padding-Kante **jedes** Vorfahren bis zum ersten waagrechten Scroll-Container. Die Woche hat unter 360 px `margin-inline: -12px` (`calendar.css`, Media-Query am Ende). Sie liegt in `fieldset.plain` (`CalendarView.tsx` Z. 188) ohne Innenabstand. Die Tageszahl „28“ (Mo 28.9.) steht in `button.day` (sichtbarer, gestrichelter Rand), ragt aber 3,2 px (Chromium) bzw. 1,9 px (WebKit) links aus dem Fieldset. Meldung: „Text ragt aus fieldset.plain: „28““. Die Fixtures treffen das nie, ihre Woche beginnt mit „5“.
  - **Prüfung 3** (Z. 321–443) überspringt nur Zeilen, die **ganz** aus dem sichtbaren Bereich des nächsten senkrechten Scroll-Containers gescrollt sind (Z. 432). Eine halb hinausgescrollte Zeile wird ungekürzt gegen die Rundung des Sheets (`dialog.dlg.sheet`, `border-radius: 28px 28px 0 0`, `overflow: hidden`) geprüft. Ihre obere Kante liegt dann über dem Sheet, also außerhalb der Ellipse. Gemeldet im Review 0004 (H1): Kind-Sheet quer („Entfernung ab“, bei 200 % „Startpunkt:“), Filter-Sheet 320 px/200 % („Kosten“).
  - `.sheet-scroll` hat `padding: 6px 16px 20px` (`sheet.css`), der Text steht also 16 px vom linken Rand. Eine bloße Kürzung der Zeile auf den sichtbaren Bereich reicht nicht: Der Punkt (16 px, 0 px) liegt bei Innenradius 28/25,5 px noch außerhalb der Ellipse (gerechnet: 1,10 > 1). Siehe E3.
- **Preload:** `index.html` Z. 13: `<link rel="preload" href="/data/site.json" as="fetch" crossorigin="anonymous">`. `src/data/site.ts` Z. 4–9 ruft `fetch(BASE_URL + "data/site.json")` ohne Optionen. Chromium nutzt den Preload, WebKit lädt die Datei ein zweites Mal und warnt („preloaded … but not used“). Die Regeln, nach denen WebKit einen `as=fetch`-Preload einem `fetch()` zuordnet, sind nicht dokumentiert.
- **Fehlerzustand:** `App.tsx` Z. 30 (`LoadState` mit `message: string`), Z. 59–66 (`e.message` ungeprüft), Z. 158–166 (Anzeige unter „Das hat nicht geklappt“). `loadSiteData` wirft bei HTTP ≠ 2xx einen eigenen Text, reicht aber den `TypeError` von `fetch` durch („Failed to fetch“, „Load failed“). Es gibt keinen E2E-Test für den Fehlerzustand.
- **ICS-Fuß:** `DetailDialog.tsx` Z. 155–192, `.dfoot` in `dialog.css` Z. 250–283. Der Fuß ist ein Flex-Geschwister unter `.dscroll` und damit immer sichtbar. Bei 320 px/200 % stehen die Knöpfe untereinander: 35 % der Höhe (100 %: 26 %), quer bei 200 % ≈ 40 %.
- **Monatsraster:** `.mgrid` (`calendar.css` Z. 138) hat 7 Spalten ohne Abstand, `.mday` (Z. 149) `letter-spacing: -0.03em`, kein Hintergrund. Bei 200 % (32 px) ist eine Spalte bei 320–360 px ≈ 45 px breit, „12“ ≈ 36 px. Zwischen zwei Zahlen bleiben ≈ 9 px, so viel wie zwischen zwei Ziffern einer Zahl gefühlt. „12131415161718“ liest sich als Kette.
- **Badge:** `.tab .badge` ist `position: absolute; top: 2px; left: calc(50% + 8px)` (`tabs.css` Z. 96–100), Basis in `chrome.css` Z. 300–312. In der kompakten Querleiste (`tabs.css` Z. 174ff., `.tab` als Zeile: Icon, Label) liegt es über dem Label. In der Seitenleiste bei 200 % sitzt es auf dem Herz und stößt ans Label.
- **Toast:** `.toast` (`sheet.css` Z. 185–205) ist fest positioniert und fängt Tipps ab. Bei 320 px/200 % ist er drei- bis vierzeilig und liegt 2,8 s über dem Hauptknopf der Merkliste.
- **Filter-Fuß:** `Sheets.tsx` Z. 149–156: zwei `.btn`, `.sheetfoot` mit `flex-wrap` (`sheet.css` Z. 172–184). Zweizeilig in Chromium bis 380 px, in WebKit bis 360 px. Der Fuß ist dann 146 statt 84 px hoch.
- **Fokus-Rückweg:** `Dialog.tsx` Z. 17–20 und 33–35: `fallbackFocus` wirkt, wenn der Fokus nach `close()` auf `<body>` steht. Das Detail (`Overlays.tsx` Z. 49–71) hat keinen. Wer in der Merkliste ein Detail öffnet und dort das Herz löst, verliert die Kachel, und der Fokus fällt auf `<body>`.
- **„Freier Tag“:** `AgendaEmpty` (`CalendarView.tsx` Z. 125–146) kennt nur `ended` und `afterData`. `dayAgenda` (`agenda.ts` Z. 109–137) bekommt nur den Index der sichtbaren Angebote. `useOfferViews` hat mit `upcoming` (Z. 117) schon alle kommenden Angebote ohne Filter.
- **„Startpunkt entfernen“:** `.linkbtn` (`list.css` Z. 20–32) ist ein `<button>` und erbt das UA-`text-align: center`. Bricht es bei 200 % um, steht es zentriert, der Rest des Kind-Sheets linksbündig.
- **Anbietername:** `.meta` (`card.css` Z. 121–126) hat kein `hyphens`. Es greift `body { overflow-wrap: anywhere }` (`base.css` Z. 18), daher „Auferstehungskirc|he“ bei 320 px/200 %. Titel und Zusammenfassung trennen schon mit `hyphens: auto` (Plan 0007, E10), `<html lang="de">` ist gesetzt.
- **Karte:**
  - `mapData` (`karte/map-data.ts` Z. 21) gibt `sortPlaces(placesOf(visible), origin)` an `MapView`. `placesToFeatures` (`map/geojson.ts` Z. 34–39) übernimmt diese Reihenfolge. Supercluster bündelt reihenfolgeabhängig, deshalb ändern sich die Cluster mit dem Startpunkt (H1).
  - Der `style.load`-Handler (`MapView.tsx` Z. 131–138) fügt nur die eigenen Layer hinzu. `LOCALE` in `map/layers.ts` übersetzt nur Bedienelemente, keine Kartenbeschriftungen. Die OFM-Stile nutzen für Ortslabels `coalesce(name_en, name)`, daher „Nuremberg“ (H2).
  - `maplibre-gl.css` setzt `.maplibregl-map { font: 12px/20px "Helvetica Neue", Arial, … }`. `map-overrides.css` Z. 50–57 setzt für die Attribution nur Farbe und Größe (H3).
  - `OfferCard` zeigt in der Meta-Zeile „Anbieter · Stadtteil · Entfernung“ (`OfferCard.tsx` Z. 75–83), auch im Orts-Sheet, dessen Kopf Ort, Adresse und Entfernung schon nennt (H6).
  - `cameraOptions` (`MapView.tsx` Z. 43–48) nutzt `fitBoundsOptions: { padding: 32 }` rundum. Die Zoom-Knöpfe (44 × 88 px plus Rand, oben rechts, 10 px Abstand) überdecken deshalb manchmal einen Marker in der Ecke (H7).
- **E2E-Uhr:** `e2e/fixtures.ts` setzt pro Test `page.clock.setFixedTime` auf Mo 5.10.2026 12:00. `Date` steht, Timer und CSS-Zeitachse laufen in Echtzeit. Ein Test darf die Uhr vor `goto` neu setzen.
- **Ports:** `playwright.config.ts` nimmt `PW_PORT` (Fixtures) und `PW_PORT + 1` (echte Daten).
- **Budgets** (Plan 0005, „Umsetzung“): JS 87,35 / 90 kB, CSS 10,01 / 15 kB, Karte JS 425,15 / 450 kB, Karte CSS 10,66 / 12 kB (gzip).

## Entscheidungen

### E1 – WebKit mit „Bewegung reduzieren“: keine Transition statt 0,01 ms (Paket B)

**Ursache:** 0,01 ms erzeugt echte Transitionen bzw. Animationen, die die Engine erst abschließen muss. Mit `transition-property: all` betrifft das jede Farbänderung jedes Elements. Chromium schließt sie im nächsten Frame ab, WebKit erst Sekunden später. Ohne „reduzieren“ ist WebKit sauber (90–140 ms), weil dann kaum ein Element eine Transition deklariert.

**Lösung**, `motion.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    /* biome-ignore-start lint/complexity/noImportantStyles: reduced-motion muss alles übersteuern */
    animation: none !important;
    transition: none !important;
    /* biome-ignore-end lint/complexity/noImportantStyles: - */
  }
}
```

- `none` statt `0s`: Mit `none` entsteht gar kein Transitions- bzw. Animationsobjekt, das eine Engine verspätet abschließen könnte. Die Kurzschreibweise setzt Dauer, Verzögerung und `transition-property` zugleich.
- Animationen gleich mit: Dieselbe Fehlerklasse droht bei Animationen mit Deckkraft 0 im ersten Keyframe (`stick`, `drop`, `toast`, `peelin`). Kein Code hängt an `animationend`, keine Animation hält mit `forwards` einen Endzustand. Ohne Animation steht also jedes Element sofort im Endzustand. Der Kommentar über `motion.css` nennt die Bedingung: Wer künftig auf `animationend`/`transitionend` hört, muss den Fall „reduzieren“ selbst behandeln.
- Die `!important`-Regel schlägt auch Inline-Stile ohne `!important` und die ungeschichtete `maplibre-gl.css` (Zwei-Finger-Hinweis, E11 in Plan 0005).

**`expectReducedMotion` bricht nicht, es wird schärfer:**
- `transition: none` ergibt berechnet `transition-duration: 0s`, `transition-delay: 0s`. Der Parser (Z. 125–133) liest „0s“ als 0 ms. `animation: none` ergibt `animation-name: none`, der Zweig zählt 0. `document.getAnimations()` ist leer.
- **`MAX_REDUCED_MS` geht von 1 auf 0** (Verstoß: Dauer + Verzögerung > 0). Damit wird eine Rückkehr zu 0,01 ms rot. Das ist eine Verschärfung, keine Lockerung. Die Zeile in `docs/architecture.md` („keine Animation oder Transition länger als 1 ms“) wird zu „keine Animation und keine Transition (0 ms)“.
- Der Kommentar über `settle()` (Z. 17–23) wird angepasst: Mit „reduzieren“ gibt es keine Animationen mehr. `settle()` bleibt für die Läufe ohne Emulation (Smoke, Fokus).
- Neuer dauerhafter Kanarienvogel in `mobile-ux.spec.ts`: „Bewegungs-Gate erkennt Transition trotz Reduce“. Unter `reducedMotion: "reduce"` fügt `page.addStyleTag({ content: ".brand { transition: color 0.3s !important }" })` eine Transition ein. `.brand` ist spezifischer als `*`, beide sind ungeschichtet und `!important`, also gewinnt der Kanarienvogel. Erwartet wird `expect(expectReducedMotion(page)).rejects.toThrow(/transition auf .*brand/)`.

**E2E, der den Fehler zuerst rot zeigt** (`e2e/theme.spec.ts`, läuft in allen Projekten, rot nur in `iphone-15`):

1. „Darstellung wechselt bei reduzierter Bewegung sofort die Textfarben“:
   - `test.skip` unter 380 px (Kopf-Knopf fehlt, wie im bestehenden Test).
   - **Referenz** (dieselbe `page`, kein neuer Kontext, denn Konsolen- und Drittanbieter-Wächter hängen an der Fixture-Seite): `page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" })`, `goto`, dann `page.evaluate(() => localStorage.setItem("zwergenplan.darstellung", "dunkel"))` und `reload`. Erste Kachel sichtbar, 1 500 ms warten. Dann die berechneten Farben (`getComputedStyle(el).color`) von `.brand`, `.kid`, je den ersten drei `.stk`, `.daylabel`, `.when`, `.ctitle` und `.chip` in einem `page.evaluate` lesen. Das ist die eingeschwungene dunkle Darstellung.
   - **Prüfung:** `localStorage.removeItem("zwergenplan.darstellung")`, `reload` (hell), erste Kachel sichtbar, Klick auf „Dunkle Darstellung“, `data-theme="dark"` abwarten, dann **genau 300 ms** `page.waitForTimeout(300)` (echte Zeit; die Fake-Uhr hält nur `Date` fest, nicht die CSS-Zeitachse; Kommentar im Test). Dieselben Farben in **einem** `page.evaluate` lesen. Erwartet: gleich der Referenz, Element für Element. Die Meldung nennt Selektor, Ist- und Sollfarbe.
   - Danach `expectAccessible(page)` (axe, Kontrast) als zweiter Beleg.
2. „Beim Laden mit reduzierter Bewegung stehen die Farben sofort“: hell, `reducedMotion: "reduce"`, `goto`, erste Kachel sichtbar, sofort die Farben von `.brand` und `.daylabel` lesen, 1 500 ms warten, erneut lesen. Erwartet: gleich.

**Reproduktion vor dem Fix** (Pflicht, Ergebnis in die Commit-Message): `pnpm build:e2e`, dann `PW_PORT=4273 pnpm exec playwright test e2e/theme.spec.ts --project=iphone-15` auf dem alten `motion.css`. Test 1 muss mit abweichenden Farben rot sein (laut Review 18 Knoten), Test 2 voraussichtlich auch (Marke 0,5–1 s schwarz). Ist Test 2 auf dem alten Stand grün, bleibt er als Absicherung, und die Commit-Message sagt das. Lokal braucht WebKit `libavif16` (CLAUDE.md). Fehlt es, belegt die Branch-CI das Rot: Der Test wird zuerst allein gepusht (Commit „test: WebKit-Farbwechsel bei reduzierter Bewegung (rot)“), CI muss in `iphone-15` rot sein, erst dann folgt der Fix.

**Gegenprobe am iPhone** mit „Bewegung reduzieren“ (Geräte-Checkliste): Headless-WebKit taktet Timer anders als Safari.

### E2 – Text-Gate, Prüfung 2: Vorfahren ohne sichtbare Kante zählen nur ohne sichtbaren Kasten dazwischen (Paket B)

**Regel neu:** Prüfung 2 überspringt einen Vorfahren A, wenn **alle drei** Bedingungen gelten:
1. A hat keine sichtbare Kante: kein deckender Hintergrund (Alpha > 0), kein `background-image`, kein sichtbarer Rand. Das ist dieselbe Definition wie `visible` in `roundBox` (Prüfung 3). Sie wird als gemeinsame Funktion `hasVisibleEdge(s)` herausgezogen und von beiden Prüfungen genutzt.
2. A schneidet nicht ab (`overflow-x` und `overflow-y` sind `visible`).
3. Zwischen dem Text und A liegt ein Vorfahr mit sichtbarer Kante, und die Textzeile liegt innerhalb von dessen Padding-Kante. Das prüft der Weg nach oben ohnehin. Ragte der Text aus diesem Kasten, wäre er dort schon gemeldet.

**Begründung:** Der Text steckt dann sicht- und messbar in seinem eigenen Kasten (`button.day` mit gestricheltem Rand). Dass dieser Kasten über einen unsichtbaren Layout-Kasten hinausreicht, ist ein gewollter Ausbruch (negativer Rand, „Bleed“). Das sieht niemand. Ragt der Kasten über eine *sichtbare* Kante oder aus dem Viewport, melden das die weiteren Vorfahren bzw. `expectNoHorizontalScroll`.

**Warum nicht einfach „unsichtbare Vorfahren überspringen“:** Dann fiele Text durch, der aus einer unsichtbaren Zelle in die Nachbarzelle läuft (z. B. ein Etikett im Raster `.labels`). Prüfung 4 vergleicht nur Kästen, nicht Text. Bedingung 3 hält genau diesen Fall rot: Ohne sichtbaren Kasten dazwischen zählt der unsichtbare Vorfahr weiter. Auch die Sticker-Labels bleiben geprüft: `.stk` ist unsichtbar (`background: none; border: 0`), dazwischen liegt kein sichtbarer Kasten.

**Warum nicht die Woche umbauen** (Padding statt negativem Rand): Das behebt nur diese eine Stelle. Der gleiche Ausbruch ist ein legitimes Muster (auch `.month` nutzt `margin-inline: -16px`, sitzt aber zufällig direkt im Innenabstand von `.body`). Die Regel soll den Unterschied zwischen sichtbarem und unsichtbarem Überstand kennen.

Kommentar im Code mit dieser Begründung. Keine Ausnahme per Selektor.

**Test zuerst rot:** In `mobile-ux.spec.ts` neuer Test „Text-Gate: Woche mit zweistelligem Montag bei 320 px“. Ablauf: `page.clock.setFixedTime(new Date("2026-09-28T12:00:00+02:00"))` vor `goto`, Viewport 320 × 640, `reducedMotion: "reduce"`, Kalender öffnen (Woche 28.9.–4.10., Monat zu), `expectTextFits(page)`. Auf dem alten Gate rot mit „Text ragt aus fieldset.plain: „28““, danach grün.

**Kanarienvögel (dauerhaft, `mobile-ux.spec.ts`):**
- „Text-Gate erkennt Text, der aus seinem sichtbaren Kasten ragt“: Kalender bei 320 px, `addStyleTag(".day .num { margin-left: -30px }")`. Erwartet `rejects.toThrow(/Text ragt aus button\.day/)`.
- „Text-Gate erkennt Text, der aus einem unsichtbaren Kasten ragt“: Startseite, `addStyleTag(".status-row > .status { width: 2rem; white-space: nowrap }")`. Zwischen Text und `p.status` liegt kein sichtbarer Kasten. Erwartet `rejects.toThrow(/Text ragt aus p\.status/)`.

### E3 – Text-Gate, Prüfung 3: nur ganz sichtbare Zeilen in Scroll-Containern (Paket B)

**Regel neu:** Liegt zwischen Text und gerundetem Kasten ein senkrechter Scroll-Container (`scrollViewport`, Z. 355), zählt eine Textzeile nur, wenn sie **ganz** in dessen sichtbarem Bereich liegt, Toleranz 1 px: `r.top >= viewport.top - 1 && r.bottom <= viewport.bottom + 1`. Eine Zeile, die die obere oder untere Kante kreuzt, wird übersprungen. Das ersetzt die Bedingung in Z. 432, die nur ganz hinausgescrollte Zeilen ausließ.

**Begründung:** Eine Zeile, die an der Kante des Scrollbereichs angeschnitten ist, steht da, weil gescrollt wurde, nicht wegen des Layouts. In einer Sekunde steht sie woanders. Dass die Rundung des Sheets sie dabei anschneidet, ist normales Scrollverhalten. Das Gate soll Layoutfehler im Ruhezustand finden. Zeilen nur auf den sichtbaren Teil zu kürzen, reicht nicht. Der Punkt am linken Rand liegt 16 px vom Rand und 0 px unter der Oberkante, bei Innenradius 28/25,5 px also noch außerhalb der Ellipse (siehe Ausgangslage).

**Schwächt das Gate nicht:**
- Ohne Scroll-Container ändert sich nichts.
- Im Ruhezustand (`scrollTop = 0`) beginnt der Inhalt innerhalb des Containers. Jede Zeile in der Ecke ist dann ganz sichtbar und wird geprüft.
- Der bestehende Kanarienvogel „Text-Gate erkennt Text in der Rundung, auch im Scroll-Container des Sheets“ setzt „Filter“ ganz in die Ecke, ohne Scrollen, und bleibt rot. Er muss nach der Änderung unverändert rot sein, das gehört zum Fertig-Kriterium von Schritt 3.

**Test zuerst rot:** „Text-Gate übergeht halb hinausgescrollte Überschriften im Sheet“ (`mobile-ux.spec.ts`):
- 320 × 640, `reducedMotion: "reduce"`, Filter-Sheet öffnen, `setTextScale(page, 2)`.
- Dann `.sheet-scroll` so scrollen, dass die Überschrift „Kosten“ die Oberkante halbiert: `el.scrollTop += h.getBoundingClientRect().top - el.getBoundingClientRect().top + h.getBoundingClientRect().height / 2`. `h` ist das `h3` mit Text „Kosten“.
- Prüfen, dass sie wirklich kreuzt: `top < viewport.top < bottom`.
- Dann `expectTextFits(page, { scale: 2 })`. Auf dem alten Gate rot mit „Text stößt an die Rundung von dialog.dlg: „Kosten““, danach grün.

### E4 – `site.json` genau einmal: Frühstart im HTML statt Preload (Paket A)

**Entscheidung:** Der Preload entfällt. Ein Inline-Skript in `index.html` startet den Abruf, `src/data/site.ts` übernimmt die laufende Anfrage.

```html
<!-- Daten parallel zum JS laden (LCP, Plan 0003 E8). Ersetzt den Preload, den WebKit nicht wiederverwendet
     (Plan 0008, E4). Übernommen von src/data/site.ts (takeEarlyRequest), Pfad wie dort. -->
<script>
  try {
    window.__zpSite = fetch("/data/site.json");
    // als behandelt markieren: Den Fehler wertet loadSiteData aus, nicht die Konsole
    window.__zpSite.catch(() => {});
  } catch {
    // ohne fetch: loadSiteData lädt selbst
  }
</script>
```

- **Warum kein anderes Preload-Attribut:** Welche Kombination aus `crossorigin`, `credentials` und `Accept` WebKit einem `as=fetch`-Preload zuordnet, ist nicht dokumentiert und ohne Gerät nicht prüfbar. Ein im HTML gestarteter `fetch` ist in jeder Engine genau ein Request und startet so früh wie der Preload (beim Parsen des `<head>`).
- `src/data/site.ts`:
  - `takeEarlyRequest(): Promise<Response> | undefined` liest `window.__zpSite`, setzt es auf `undefined` und gibt es zurück. Es wird also **höchstens einmal** übernommen; „Nochmal versuchen“ lädt neu.
  - `loadSiteData(env)` nimmt die Abhängigkeiten als Parameter, wie `LocationEnv` in `geolocation.ts`: `{ early, fetch, online }`. Standard sind `takeEarlyRequest()`, `globalThis.fetch` und `() => navigator.onLine`. Der Unit-Test braucht so keinen Browser.
  - Typ in `src/env.d.ts`: `interface Window { __zpSite?: Promise<Response> }` (als `declare global`).
- **Schichtregel:** `index.html` ist Bootstrap. Den bisherigen Preload gab es dort auch, der Request ist derselbe. Die UI fasst weiter kein `fetch` an. `docs/architecture.md`, Datenfluss, bekommt eine Zeile: „`index.html` startet den Abruf von `site.json` (Frühstart), `src/data/site.ts` übernimmt ihn“. Ein neues ADR gibt es nicht, weil die Schichtregel unverändert bleibt. Sieht das Arch-Review das anders, folgt ADR 0011.
- **E2E zuerst rot** (`e2e/app.spec.ts`, alle Projekte): „`site.json` wird genau einmal geladen“. `page.on("request")` zählt URLs, die auf `/data/site.json` enden, ab vor `goto`. Nach sichtbarer erster Kachel und 500 ms Pause muss die Zahl genau 1 sein. Auf dem alten Stand rot in `iphone-15` (2), grün in Chromium. Dazu ein Test für den Fehlerweg in E5.
- **Unit** (`src/data/site.test.ts`, neu): übernimmt die frühe Anfrage, ohne `fetch` aufzurufen. Ein zweiter Aufruf ruft `fetch` (nur einmal übernehmen). Ohne frühe Anfrage ruft er `fetch` mit `BASE_URL + "data/site.json"`.

### E5 – Fehlerzustand mit eigenem Text; die Fehlerart bestimmt `src/data` (Paket A)

- `src/data/site.ts` exportiert `class SiteLoadError extends Error` mit `reason: "offline" | "netz" | "server"` und `cause`:
  - `offline`: `fetch` (bzw. die frühe Anfrage) wirft, und `online()` ist `false`.
  - `netz`: `fetch` wirft, `online()` ist `true` („Failed to fetch“, „Load failed“, Abbruch).
  - `server`: HTTP ≠ 2xx oder `res.json()` wirft.
  - `loadSiteData` wirft nur noch `SiteLoadError`. Die rohe Meldung steht in `cause`, nie in der Anzeige.
- Texte zentral in `src/ui/format.ts`, `loadErrorText(reason)`:
  - `offline`: „Du bist gerade offline. Sobald das Netz wieder da ist, klappt es.“
  - `netz`: „Die Verbindung ist abgebrochen. Versuch es gleich nochmal.“
  - `server`: „Die Angebote ließen sich gerade nicht laden. Versuch es später nochmal.“
- `App.tsx`: `LoadState` `{ kind: "error"; reason }`. Im Fehlerfall gilt `e instanceof SiteLoadError ? e.reason : "server"`. Ein unbekannter Fehler zeigt also nie seinen Rohtext. Überschrift „Das hat nicht geklappt“ und „Nochmal versuchen“ bleiben.
- **Unit:** `site.test.ts`, je Grund ein Fall mit gestubbtem `fetch`, `online` und `early`. Dazu `cause` gesetzt, Meldung ohne „fetch“/„Load“. `format.test.ts`: drei Texte, keiner enthält englische Wörter.
- **E2E** (`e2e/app.spec.ts`), mit `test.use({ allowedConsoleErrors: [/\/data\/site\.json /] })`. Das Muster greift nur, wenn die Quelle der Konsolenmeldung `site.json` ist:
  - „Fehlerzustand mit eigenem Text, danach lädt ‚Nochmal versuchen‘“:
    - `page.route("**/data/site.json", (r) => r.abort())` vor `goto`.
    - `getByRole("alert")` enthält „Die Verbindung ist abgebrochen.“ und **nicht** `/fetch|load failed/i`.
    - `expectMobileUx(page)`, damit der Zustand durch die Gates läuft.
    - `page.unroute(…)`, „Nochmal versuchen“, erste Kachel sichtbar. Das belegt auch, dass die frühe Anfrage nur einmal übernommen wird.
  - „Serverfehler“: `route.fulfill({ status: 503 })` → „Die Angebote ließen sich gerade nicht laden.“

### E6 – ICS-Fuß bei wenig Höhe in `rem`: scrollt mit (Paket B)

**Entscheidung:** Ist der Dialog niedriger als 34 rem, steht der ICS-Fuß am Ende des Inhalts und scrollt mit. Sonst bleibt er fest unten wie heute.

```css
.detail {
  container: detail / size;
}
@container detail (height < 34rem) {
  .detail[open] {
    overflow-y: auto;
  }
  .dscroll {
    flex: none;
    overflow: visible;
  }
}
```

- **Warum Container-Query in `rem`:** Sie reagiert auf die Textgröße (Plan 0007, E7, Regel in `docs/architecture.md`), eine Viewport-Media-Query nicht. Größenbeispiele:
  - 640 px bei 200 % = 20 rem, ja;
  - Pixel 7 bei 200 % (915 px) = 28,6 rem, ja;
  - 640 px bei 100 % = 40 rem, nein;
  - iPhone SE bei 100 % (568 px) = 35,5 rem, nein;
  - quer 412 px bei 100 % = 25,75 rem, ja. Der Fuß belegte quer 26–28 %, das ist ein gewollter Nebeneffekt.
- `.detail` ist fest positioniert mit `inset: 0` und hängt in seiner Größe nicht vom Inhalt ab. `container-type: size` ist deshalb unkritisch.
- Der Fuß behält Rahmen und Rundung. Er ist am Ende des Inhalts mit einem Wisch erreichbar.
- **Warum nicht nur das Label ausblenden:** Das spart ≈ 34 px, der Fuß bliebe bei ≈ 25 %.
- **E2E zuerst rot** (`e2e/layout.spec.ts`, `pixel-7` und `iphone-15`):
  - 320 × 640, `setTextScale(page, 2)`, Detail „Offener Krabbeltreff“. Erwartet: `.dfoot` liegt anfangs ganz unter dem Viewport (`getBoundingClientRect().top >= innerHeight`). Nach `scrollIntoViewIfNeeded()` ist „Alle Termine“ sichtbar und klickbar.
  - 412 × 915 bei 100 %: `.dfoot` endet bündig am unteren Rand (Abweichung ≤ 1 px), wie bisher.
  - Auf dem alten Stand ist der erste Fall rot.

### E7 – Monatsraster bei großer Schrift: jeder Tag ein eigenes Feld (Paket B)

**Entscheidung:** Wird eine Spalte schmal im Verhältnis zur Schrift, bekommt jeder Tag ein zartes Feld. Die Zahlen werden nicht verkleinert, weil Text bei 200 % nicht gedeckelt wird.

```css
.mgrid {
  container: mgrid / inline-size;
}
@container mgrid (width < 19rem) {
  .mday {
    /* sichtbare Lücke ohne Layout-Lücke: Spalte bleibt ≥ 44 px (B3) */
    border: 2px solid transparent;
    background: var(--soft) padding-box;
    border-radius: 12px;
    letter-spacing: normal;
  }
  .mday[aria-pressed="true"] {
    background: var(--sel) padding-box;
  }
}
```

- **Schwelle 19 rem:** Bei 100 % ist das Raster auf Telefonen ≥ 316 px = 19,75 rem breit, die Regel greift dort nie. Das Aussehen bei 100 % bleibt also wie es ist. Bei 200 % greift sie auf jedem Telefon (412 px = 12,9 rem), bei 125 % ab 320 px (16 rem).
- **Durchsichtiger Rand statt `gap`:** Mit `gap: 3px` fiele die Spalte bei 320 px unter 44 px (B3). Mit Rand bleibt sie 45,1 px. Optisch liegen zwischen zwei Feldern 4 px Monatshintergrund.
- `var(--soft)` steht in beiden Dunkel-Blöcken. Das Insel-Gate prüft das mit (Luminanz im Dunkeln < 0,75).
- **Rundung 12 px:** Prüfung 3 des Text-Gates misst die Zahl gegen die Rundung des jetzt sichtbaren Felds. Gerechnet für „28“ bei 32 px: Abstand der Zeile oben ≈ 3,5 px, seitlich ≈ 2 px, Innenradius 10 px, das liegt in der Ellipse. Meldet das Gate trotzdem etwas, wird der Radius kleiner, nie eine Ausnahme.
- **E2E zuerst rot** (`layout.spec.ts`):
  - 320 × 640, Monat offen, `setTextScale(page, 2)`. Für jede Zeile von `.mgrid` haben benachbarte freigegebene `.mday` einen Hintergrund mit Alpha > 0. Ihre Hintergrundflächen (Border-Box minus 2 px Rand je Seite) liegen ≥ 3 px auseinander.
  - Bei 100 % ist der Hintergrund nicht gewählter Tage durchsichtig (unverändert).
  - Dazu `expectTouchTargets` bei 100 % wie bisher.

### E8 – Badge in den Querformat-Leisten im Fluss (Paket B)

**Entscheidung:** In beiden Querformat-Modi (Seitenleiste und kompakte Leiste) wird das Badge `position: static` und steht hinter dem Label. In der kompakten Leiste steht es in der Zeile rechts neben „Merkliste“, in der Seitenleiste unter dem Label. Im Hochformat bleibt es am Herz.

```css
/* beide Querformat-Modi (Seitenleiste und kompakt) */
@media (max-height: 500px) {
  .tab .badge {
    position: static;
  }
}
/* nur in der bestehenden Seitenleisten-Query (max-height: 500px) and (min-width: 40rem): gleich hohe
   Zeilen, damit der Daumen (Höhe = ein Drittel) auf dem gewählten Tab bleibt */
.tabs {
  grid-auto-rows: 1fr;
}
```

- Die Markup-Reihenfolge in `TabBar` (Icon, Label, Badge) passt. `Chrome.tsx` ändert sich dafür nicht.
- **Warum nicht am Icon verankern:** Bei 200 % ist das Badge 24 px hoch und würde aus der Leiste ragen, die `clip-path` hat.
- **Höhe in der Seitenleiste:** 100 % ergibt 3 × 68 px + 20 = 224 px, 200 % ergibt 3 × 88 px + 20 = 284 px. Beides passt in 360 bzw. 412 px Höhe.
- **E2E zuerst rot** (`layout.spec.ts`): ein Angebot merken, dann bei 568 × 320 (100 %) und 863 × 360 (100 % und 200 %) die Rechtecke von `.tab .badge`, `.tab-label` und dem Icon des Merklisten-Tabs vergleichen. Erwartet: keine Überschneidung über 0,5 px. Auf dem alten Stand rot bei 568 × 320 (Label) und 863 × 360/200 % (Herz). Der Daumen sitzt weiter auf dem gewählten Tab (`offsetTop`/`offsetHeight` von `.tab-thumb` und `.tab[aria-current]` gleich, ±2 px).

### E9 – Toast fängt keine Tipps ab (Paket B)

**Entscheidung:** `.toast { pointer-events: none }`. Der Toast ist reine Meldung, ohne Bedienelement. Tipps gehen durch ihn auf den Knopf darunter. Die 2,8 s Sichtbarkeit bleiben, die Live-Region auch.
- **Warum nicht verschieben oder kürzen:** Wo der Toast bei 200 % auch steht, verdeckt er auf 320 px etwas. Kürzere Texte ändern daran wenig, die längste Meldung hat ≈ 45 Zeichen. Entscheidend ist, dass er nichts blockiert.
- **E2E zuerst rot** (`layout.spec.ts`): 320 × 640, zwei Angebote merken, Merkliste, `setTextScale(page, 2)`, `page.clock.pauseAt(FIXTURE_NOW)`, Herz einer Kachel lösen („Sticker abgelöst …“ erscheint). `document.elementFromPoint` in der Mitte des Toasts darf nicht innerhalb von `.toast` liegen. Danach `getByRole("button", { name: "Alle in den Kalender" }).click({ trial: true })` ohne Fehler. Auf dem alten Stand rot.

### E10 – Filter-Fuß: „Zurücksetzen“ als Textknopf (Paket B)

**Entscheidung:** Im Filter-Sheet (`Sheets.tsx` Z. 150) wird „Zurücksetzen“ ein `.linkbtn`. Es steht links, der Hauptknopf rechts mit `flex: 1 1 auto`.
- `.sheetfoot .linkbtn { flex: none }`. Die Mindesthöhe 44 px hat `.linkbtn` schon (`list.css`).
- Gerechnet für einen Hauptknopf „333 Angebote zeigen“ (≈ 200 px), „Zurücksetzen“ (≈ 110 px) und 10 px Abstand: Bei 360 px (328 px Platz) passt die Zeile, bei 320 px (288 px) bricht sie um. Dann ist die zweite Zeile 44 statt 56 px hoch. Ab ≈ 340 px ist der Fuß einzeilig, 84 statt 146 px. Das spart ≈ 60 px auf 360–380-px-Telefonen.
- Das Kind-Sheet und das Orts-Sheet ändern sich nicht.
- **E2E zuerst rot** (`layout.spec.ts`): 360 × 640 und 390 × 844, Filter-Sheet. „Zurücksetzen“ und „… Angebote zeigen“ haben denselben `offsetTop`, und `.sheetfoot` ist ≤ 90 px hoch. Auf dem alten Stand rot bei 360 px.
- `e2e/app.spec.ts`, Test „Filter-Sheet wirkt sofort … Zurücksetzen leert“, sucht den Knopf per Rolle und Name und bleibt unverändert grün.

### E11 – Fokus-Rückweg im Detail: der aktive Tab (Paket A)

**Entscheidung:** Das Detail bekommt `fallbackFocus` auf den Knopf des aktiven Tabs.
- Er existiert immer, im Hochformat wie quer, auf jedem Tab. Er sagt Bildschirmlesern, wo man ist („Merkliste, aktuelle Seite“).
- `App.tsx`: `const activeTab = useRef<HTMLButtonElement>(null)`. `TabBar` (`Chrome.tsx`) bekommt `currentRef` und setzt `ref` nur auf den Knopf mit `aria-current="page"`. `Overlays.tsx` reicht `activeTab` als `fallbackFocus` an den Detail-Dialog.
- Greift nur, wenn der Browser den Fokus auf `<body>` fallen lässt (bestehende Logik in `Dialog.tsx`). Das passiert nach dem Lösen in der Merkliste und beim Schließen eines Deep-Links.
- **Warum nicht die nächste Kachel:** Welche das ist, hinge an Liste, Sortierung und Kalender. Das Gewinn-Verhältnis stimmt nicht.
- **E2E zuerst rot** (`e2e/saved.spec.ts`): zwei Angebote merken, Merkliste, Detail des ersten öffnen, im Detail das Herz lösen, „Zurück“. Die Kachel ist weg, `getByRole("button", { name: /^Merkliste/ })` ist fokussiert (`toBeFocused`). Auf dem alten Stand ist `<body>` fokussiert, also rot.

### E12 – „Freier Tag“ sagt, wenn die Auswahl Angebote ausblendet (Paket A)

**Domäne** (`src/domain/agenda.ts`, test-first):
- `DayAgenda` bekommt `hidden: number`. Das sind die nicht beendeten Termine des Tages im ungefilterten Index minus `items.length`, nie negativ.
- `dayAgenda(index, day, now, context)` bekommt `context.allIndex` (Index aller kommenden Angebote ohne Filter, Alter und Umkreis).
- `visible` ist Teilmenge von `upcoming`, die Differenz der Zahlen ist also genau die Zahl der ausgeblendeten Termine.
- Beendete Termine zählen nicht. „Ausgeblendet“ soll nur heißen, was man noch besuchen könnte.

**View-Modell:** `useOfferViews` liefert `calendar.allIndex = sessionsByDay(upcoming)`, nur im Kalender-Tab (wie `index`), memoisiert auf `upcoming`.

**UI** (`CalendarView.tsx`, `AgendaEmpty`). Reihenfolge der Leerzustände:
1. Karten,
2. `ended > 0` „Für heute ist alles vorbei“,
3. **neu** `hidden > 0`,
4. `afterData`,
5. „Freier Tag“.

Der neue Zustand:
- Titel „Nichts, was zu deiner Auswahl passt“.
- Text aus `format.ts` `hiddenNote(n)`: „1 Angebot an diesem Tag ist ausgeblendet – durch Filter, Umkreis oder Alter.“ bzw. „3 Angebote an diesem Tag sind ausgeblendet – …“.
- Darunter `.linkbtn` „Filter zurücksetzen“, nur wenn `activeFilterCount(route.filter, { hasOrigin }) > 0`. `CalendarView` bekommt dafür `onResetFilter?: () => void`, `App.tsx` reicht es nur dann durch. Blendet nur das Alter aus, gibt es keinen Knopf, der Text nennt das Alter.
- Symbol `search` (wie „Diese Seite ist noch leer“).

**Warum `hidden` vor `afterData`:** Nach dem Datenende gibt es keine Termine, `hidden` ist dort 0. Die Reihenfolge ändert also nichts an B8.

**Tests:**
- `agenda.test.ts`, test-first:
  - `hidden` zählt die Differenz;
  - beendete Termine zählen nicht (Uhr nach Terminende);
  - ohne `allIndex`-Eintrag ist `hidden` 0;
  - der Termin um 00:30 Berlin liegt am richtigen Tag (Test in LA).
- `format.test.ts`: `hiddenNote(1)`, `hiddenNote(3)`.
- `use-offer-views.test.ts`: `allIndex` enthält gefilterte Angebote, `index` nicht.
- E2E `calendar.spec.ts` „ausgeblendete Angebote statt ‚Freier Tag‘“, zuerst rot:
  - Schnellfilter „Kurse“, Kalender, Mi 7.10. Dort liegt nur „Offener Krabbeltreff“ (regelmäßig).
  - Erwartet: „Nichts, was zu deiner Auswahl passt“, „1 Angebot an diesem Tag ist ausgeblendet“.
  - „Filter zurücksetzen“ zeigt danach „Offener Krabbeltreff“.
  - Der neue Leerzustand läuft beim Zusammenführen durch die Gates der Ansicht `kalender` (Schritt 5).

### E13 – „Startpunkt entfernen“ und jeder Textknopf übernehmen die Ausrichtung der Umgebung (Paket B)

**Entscheidung:** `.linkbtn { text-align: inherit }` (`list.css`). Der Knopf steht im Kind-Sheet linksbündig, im zentrierten Leerzustand (`.empty`) zentriert. Bisher gab das UA-Stylesheet allen Knöpfen `center`.
- **E2E zuerst rot** (`layout.spec.ts`): 320 × 640, Kind-Sheet mit Gostenhof, `setTextScale(page, 2)`. Die Zeilen-Rechtecke des Textknotens von „Startpunkt entfernen“ (per `Range.getClientRects`) haben alle dasselbe `left` (±1 px), und es liegt am linken Innenrand des Knopfs (±1 px). Der Text muss dafür zweizeilig sein, sonst schlägt der Test mit einem Hinweis fehl. Auf dem alten Stand ist die zweite Zeile eingerückt, also rot.
- Die Leerzustände („Filter zurücksetzen“, „Nochmal versuchen“) bleiben zentriert. Die Gates der Ansichten `entdecken` (leer) und `merkliste` (leer) belegen das nicht direkt. Der Browser-Review sieht sie an.

### E14 – Anbietername trennt nach Silben (Paket B)

**Entscheidung:** `.meta { hyphens: auto }` (`card.css`). Das wirkt auf die Kachel und über die Klasse auch auf `.hero .meta` im Detail. `overflow-wrap: anywhere` aus `body` bleibt der Notausgang, wenn kein Wörterbuch greift.
- Wirkung: „Auferstehungs-kirche“ statt „Auferstehungskirc|he“, wo der Browser ein deutsches Wörterbuch hat (Safari, Chrome auf Android und macOS).
- **Folge für das Text-Gate:** Prüfung 1 überspringt Elemente mit `hyphens: auto` (Plan 0007, E10). Für `.meta` gilt das jetzt auch. Das ist dieselbe begründete Regel wie für Titel: Dort trennt das Wörterbuch, nicht der Zufall.
- **Test** (`layout.spec.ts`): berechnetes `hyphens` von `.card .meta` und `.hero .meta` ist `auto`. Eine geometrische Prüfung der Trennstelle gibt es nicht, weil die Headless-Engines ohne Wörterbuch an beliebiger Stelle umbrechen. Die Sichtprüfung macht der Browser-Review (320 px/200 %, echte Daten, „Auferstehungskirche“).

### E15 – Karte H1: GeoJSON in fester Reihenfolge (Paket C)

**Entscheidung:** `placesToFeatures` sortiert die Features nach `key` (Codepunkt-Vergleich, `a.key < b.key`, nicht `localeCompare`). Die Orts-Liste bleibt nach `sortPlaces` sortiert, nur die Kartenquelle ist unabhängig davon. Damit bündelt Supercluster bei gleicher Menge immer gleich, mit und ohne Startpunkt.
- **Unit, test-first** (`map/geojson.test.ts`): dieselben Orte in zwei Reihenfolgen ergeben gleiche FeatureCollections. Die Eingabe wird nicht verändert.
- Privatsphäre unverändert: keine neuen Requests, keine Kamerabewegung.

### E16 – Karte H2: deutsche Ortsnamen über `text-field` (Paket C)

**Entscheidung:** Neues reines Modul `src/ui/map/labels.ts` mit `germanTextField(value: unknown): unknown`.
- In einem Ausdruck ersetzt es jedes `["get", "name_en"]`, `["get", "name:latin"]` und `["get", "name_int"]` durch `["coalesce", ["get", "name:de"], ["get", "name_de"], ["get", "name"]]`.
- Ist der Wert eine Token-Zeichenkette, die genau aus einem dieser Tokens besteht (`"{name_en}"`), wird sie durch denselben Ausdruck ersetzt. Alles andere bleibt unverändert (Hausnummern, Straßennummern).
- `MapView.tsx`, im bestehenden `style.load`-Handler vor `addOwnLayers`: Für jeden `symbol`-Layer aus `map.getStyle().layers` ergibt sich der neue Wert aus `germanTextField(map.getLayoutProperty(id, "text-field"))`. Weicht er ab, folgt `map.setLayoutProperty(id, "text-field", neu)`. Läuft auch nach jedem Stilwechsel.
- **Warum nicht `locale`:** MapLibres `locale` (`LOCALE` in `layers.ts`) übersetzt nur Bedienelemente. Für Beschriftungen gibt es in MapLibre 6.12 keine eingebaute Sprachwahl, der Stil bestimmt sie über `text-field`.
- OpenMapTiles-Kacheln tragen `name`, `name_de` und `name:de`. Für Nürnberg ist schon `name` „Nürnberg“. „ü“ und „ß“ liegen im Glyphenbereich 0–255, den beide Stile ohnehin laden. Es gibt also keinen neuen Request.
- **Unit, test-first** (`map/labels.test.ts`):
  - `coalesce(name_en, name)` ersetzt;
  - verschachtelt in `format`/`case` ersetzt;
  - `"{name_en}"` ersetzt;
  - `"{housenumber}"`, `["get", "ref"]` und `undefined` unverändert;
  - die Eingabe wird nicht verändert.
- **E2E** (`karte.spec.ts`, `tiles: "mock"`):
  - Die Fixture-Stile `tests/fixtures/karte/positron.json` und `dark.json` bekommen je einen Symbol-Layer `label-stadt` (Quelle `openmaptiles`, `source-layer: "place"`, `text-field: ["coalesce", ["get", "name_en"], ["get", "name"]]`, `text-font: ["Noto Sans Regular"]`). Die Mock-Kacheln sind leer, es entsteht also kein Glyphen-Request.
  - Nach `bereit` enthält `JSON.stringify(__zpMap.getLayoutProperty("label-stadt", "text-field"))` `"name:de"`, nach dem Wechsel auf dunkel ebenso.
  - Auf dem alten Stand rot.

### E17 – Karte H3: Attribution in der App-Schrift (Paket C)

**Entscheidung:** `map-overrides.css`: `.map-box .maplibregl-map { font-family: var(--font-sans); }`. Das gilt für Attribution und Zwei-Finger-Hinweis. Größe und Zeilenhöhe der Attribution bleiben (Z. 50–57). Die Schriftdatei ist schon geladen, es gibt keinen weiteren Request.
- **E2E** (`karte.spec.ts`): berechnetes `fontFamily` von `.maplibregl-ctrl-attrib` beginnt mit dem ersten Eintrag von `--font-sans` (im Test aus `getComputedStyle(document.documentElement)` gelesen). Auf dem alten Stand rot („Helvetica Neue“).
- Die Attribution-Zeichenkette selbst ändert der Hotfix (W1), nicht dieser Plan.

### E18 – Karte H5: Konsolen-Warnungen der OFM-Stile → `docs/ideas.md`

Nicht umsetzen. Es sind `warning`, keine `error`, aus einem fremden Stil, der sich mit OpenFreeMap ändert. Abfangen (`styleimagemissing`, Layer entfernen) wäre Code ohne Nutzen für Eltern. Notiz im bestehenden Eintrag „Selbst gehostete Kacheln (PMTiles)“: Mit eigenem Stil entfallen auch diese Warnungen.

### E19 – Karte H6: Kacheln im Orts-Sheet ohne Ortsangaben (Paket C)

**Entscheidung:** `OfferCard` bekommt `atPlace?: boolean`. Ist es gesetzt, zeigt die Meta-Zeile nur den Anbieternamen, ohne Stadtteil bzw. Ortsnamen und ohne Entfernung. `PlaceSheet` setzt `atPlace`. Liste, Kalender und Merkliste bleiben gleich.
- Der Anbieter bleibt, denn an einem Ort können mehrere Anbieter sein („Markuskirche“ und „Ev. Kirchengemeinde St. Markus“).
- **E2E** (`karte.spec.ts`, bestehender Orts-Sheet-Test erweitert): Jede `.meta` im Orts-Sheet „Familientreff Beispielhof“ enthält kein „·“ und keine Entfernung (Gostenhof gesetzt, `/\d+(,\d)? k?m/` kommt nicht vor). In der Liste steht die Entfernung weiter. Auf dem alten Stand rot.

### E20 – Karte H7: Startausschnitt hält die Ecke der Zoom-Knöpfe frei (Paket C)

**Entscheidung:** `cameraOptions` nutzt `padding: { top: 32, right: 32 + ZOOM_CONTROL_INSET, bottom: 32, left: 32 }`. `ZOOM_CONTROL_INSET = 58`, das sind 44 px Knopf, 2 × 2 px Rand und 10 px Abstand. Konstante mit Herleitung im Kommentar.
- Betrifft nur den Startausschnitt über `bounds`. Stadtteil-Zoom und der gespeicherte Ausschnitt der Sitzung bleiben.
- Die Kamera-Regel bleibt erfüllt: Der Ausschnitt hängt weiter nur an öffentlichen Daten. Der Zoom sinkt um ≈ 0,3 Stufen (bei 390 px), die Kachelmenge kann sich leicht ändern, verrät aber nichts.
- Nach dem Start kann ein Marker durch Verschieben weiter unter die Knöpfe geraten. Das ist üblich, die Orts-Liste bleibt der Weg dorthin.
- **E2E** (`karte.spec.ts`): nach `bereit`, ohne Startpunkt, alle gerenderten Features von `orte-cluster`/`orte-punkt` per `__zpMap.queryRenderedFeatures` projizieren. Kein Kreis (Radius 18 px) schneidet das Rechteck von `.maplibregl-ctrl-top-right .maplibregl-ctrl-group`. Rot zuerst nur, wenn der Fixture-Ausschnitt breitenbegrenzt ist. Sonst ist der Test eine Absicherung, das steht in der Commit-Message.
- Die Tests „Kamera-Regel …“ und „Startausschnitt verrät weder Standort noch Alter …“ vergleichen Kachel-Sets zwischen zwei Läufen mit gleichem Padding. Sie bleiben gültig.

### E21 – Daten: 9 Angebote mit doppeltem Ortsnamen → `docs/ideas.md`

Nicht in der UI lösen. `venueAddress` (Plan 0007, H6) müsste für „Name (Zusatz), …“ und längere Namen eine unscharfe Heuristik lernen, für einen Datenfehler an 3 Orten. Der bestehende Eintrag „Katalog-Adressen ohne Ortsnamen-Präfix“ wird ergänzt:
- Rest nach Plan 0007: 9 Angebote an 3 Orten.
- Beispiele: „Pfarramt Lutherkirche (Keller, Zugang vom Garten), Nerzstraße 34 …“, „Ökumenisches Gemeindezentrum Thon (evang. Teil, UG), …“, „Nürnberg Langwasser“ → „Nürnberg Langwasser Bad, …“.
- Bereinigung beim nächsten Lauf über den Skill `babyevents-nuernberg`.

### E22 – Arbeitsteilung: drei Pakete ohne gemeinsame Dateien

A, B und C arbeiten parallel in eigenen Worktrees und Branches. **Keine Datei gehört zwei Paketen.** Jedes Paket startet Playwright auf eigenem Port, Fixtures auf `PW_PORT`, echte Daten auf `PW_PORT + 1`:

| Paket | Branch / Worktree | `PW_PORT` | Inhalt |
|---|---|---|---|
| A „Domäne, Daten und Texte“ | `feinschliff-0008-a` | 4173 | E4, E5, E11, E12, E21 |
| B „CSS und Gates“ | `feinschliff-0008-b` | 4273 | E1, E2, E3, E6–E10, E13, E14 |
| C „Karte“ | `feinschliff-0008-c` | 4373 | E15–E20 |

Läuft Plan 0007 Paket C gleichzeitig, nutzt es einen vierten Port (z. B. 4473).

**Paket A:**
- `index.html` (Frühstart statt Preload)
- `src/env.d.ts` (`Window.__zpSite`)
- `src/data/site.ts`, `src/data/site.test.ts` (neu)
- `src/domain/agenda.ts`, `src/domain/agenda.test.ts`
- `src/ui/format.ts`, `src/ui/format.test.ts` (`loadErrorText`, `hiddenNote`)
- `src/ui/use-offer-views.ts`, `src/ui/use-offer-views.test.ts` (`allIndex`)
- `src/ui/CalendarView.tsx` (Leerzustand, `onResetFilter`)
- `src/ui/App.tsx` (Fehlerzustand, `activeTab`, `onResetFilter` an den Kalender)
- `src/ui/Chrome.tsx` (nur `TabBar`: `currentRef`)
- `src/ui/Overlays.tsx` (`fallbackFocus` am Detail)
- `e2e/app.spec.ts`, `e2e/calendar.spec.ts`, `e2e/saved.spec.ts`
- `docs/ideas.md` (E18, E21)

**Paket B:**
- `src/ui/styles/motion.css`, `dialog.css`, `calendar.css`, `tabs.css`, `sheet.css`, `list.css`, `card.css`
- `src/ui/Sheets.tsx` (nur der Fuß)
- `e2e/mobile-ux.ts`, `e2e/mobile-ux.spec.ts`, `e2e/layout.spec.ts`, `e2e/theme.spec.ts`

**Paket C:**
- `src/ui/map/geojson.ts`, `src/ui/map/geojson.test.ts`
- `src/ui/map/labels.ts`, `src/ui/map/labels.test.ts` (neu)
- `src/ui/map/MapView.tsx`, `src/ui/map/map-overrides.css`
- `src/ui/OfferCard.tsx` (`atPlace`), `src/ui/karte/PlaceSheet.tsx`
- `tests/fixtures/karte/positron.json`, `tests/fixtures/karte/dark.json`
- `e2e/karte.spec.ts`

**Nur beim Zusammenführen** (Schritt 5, ein Agent): `docs/architecture.md` und `docs/plans/0008-feinschliff.md`. Jedes Paket nennt in seiner Commit-Message die Zeilen, die es dort braucht:
- A: Datenfluss, Frühstart.
- B: reduzierte Bewegung 0 ms, Präzisierungen in Prüfung 2 und 3 des Text-Gates.
- C: Karte, deutsche Beschriftung über `text-field`.

**Berührungspunkte ohne gemeinsame Datei:**
- A's neue Leerzustände und der Fehlerzustand nutzen B's `.linkbtn`-Regel (E13). Beides wird erst beim Zusammenführen gemeinsam geprüft.
- A ändert in `Chrome.tsx` nur die `ref` am Tab-Knopf, B nur `tabs.css`.
- C ändert `OfferCard.tsx`, B nur `card.css` (`.meta`).

**Bezug zu den parallelen Arbeiten:**
- Plan 0007 Paket C ändert ggf. einzelne `font-family`-Zeilen in `card.css`, `list.css`, `dialog.css`, `sheet.css` und `calendar.css`. Das sind andere Zeilen als die von B. Wer später nach `main` kommt, rebased. Ein Konflikt kann nur bei Nachbarzeilen entstehen, dann gewinnen beide Änderungen.
- Der Attributions-Hotfix (W1) ändert voraussichtlich `MapView.tsx`, `tests/fixtures/karte/` und `karte.spec.ts`, also Dateien von C. Deshalb zweigt C erst von einem `main` mit Hotfix ab.

**Parallele Last:** Unter gleichzeitigen E2E-Läufen sind die CPU-gedrosselten Perf-Tests unzuverlässig (Plan 0004, „Umsetzung“: LCP einzeln rot bei Load Average 17–44). Ein roter Perf- oder LCP-Test unter Parallellast wird **einzeln** wiederholt (`PW_PORT=… pnpm exec playwright test e2e/perf.spec.ts --project=pixel-7`, Smoke mit `--project=smoke-echte-daten --no-deps`). Ist er einzeln grün, gilt er lokal als bestanden. **Das endgültige Gate ist die CI.**

### E23 – Entscheidung je Befund

| Befund (Quelle) | Entscheidung | Paket | Begründung (ein Satz) |
|---|---|---|---|
| WebKit + „Bewegung reduzieren“: Text 1–5 s alte Farbe (0007 Wichtig 1) | umsetzen: `transition: none`, `animation: none`; Gate auf 0 ms | B | 0,01 ms erzeugt echte Transitionen auf jedem Element, `none` erzeugt keine, und die Verschärfung hält das fest. |
| Text-Gate Prüfung 2: „28“ ragt aus `fieldset.plain` (0007 Hinweis 1) | umsetzen: Regel präzisieren | B | Überstand eines sichtbaren Kastens über einen unsichtbaren ist gewollt; Text ohne sichtbaren Kasten bleibt rot (zwei Kanarienvögel). |
| Text-Gate: halb hinausgescrollte Überschriften (0004 H1) | umsetzen: nur ganz sichtbare Zeilen | B | Angeschnittene Zeilen sind Scroll-Zustand, kein Layout; der bestehende Kanarienvogel bleibt rot. |
| WebKit lädt `site.json` doppelt (0007 Hinweis 2) | umsetzen: Frühstart im HTML | A | Ein früher `fetch` ist in jeder Engine ein Request, WebKits Preload-Zuordnung ist undokumentiert. |
| ICS-Fuß 35–40 % bei 200 % (0007 Hinweis 3) | umsetzen: scrollt unter 34 rem Höhe mit | B | Container-Query in `rem` reagiert auf die Textgröße, der Inhalt bekommt die ganze Höhe. |
| Monatsraster: Zahlen laufen zusammen (0007 Hinweis 4) | umsetzen: Feld je Tag unter 19 rem | B | Trennt die Tage, ohne Text zu verkleinern und ohne unter 44 px zu fallen. |
| Fehlerzustand mit Browsertext (0007 Hinweis 7) | umsetzen: `SiteLoadError` in `src/data`, Texte in `format.ts` | A | Eltern verstehen „Failed to fetch“ nicht, die Fehlerart kennt nur die Datenschicht. |
| Badge verdeckt Label bzw. Herz quer (0007 Hinweis 8) | umsetzen: Badge im Fluss | B | Im Querformat ist neben bzw. unter dem Label Platz, am Icon bei 200 % nicht. |
| Toast verdeckt Hauptknopf bei 200 % (0007 Hinweis 9) | umsetzen: `pointer-events: none` | B | Der Toast blockiert dann nichts mehr; Verschieben würde auf 320 px nur etwas anderes verdecken. |
| Filter-Fuß zweizeilig bis 380 px (0007 Hinweis 5, H7) | umsetzen: „Zurücksetzen“ als Textknopf | B | Einzeilig ab ≈ 340 px, spart ≈ 60 px auf den häufigen 360–380-px-Telefonen. |
| Fokus-Rückweg nach Ablösen (0007 Offen) | umsetzen: aktiver Tab | A | Immer vorhanden, verständlich für Bildschirmleser, nutzt das bestehende `fallbackFocus`. |
| „Freier Tag“ trotz ausgeblendeter Angebote (0004 H2) | umsetzen: neuer Leerzustand mit `hidden` | A | Eltern sollen wissen, dass ihre Auswahl Termine versteckt, und sie mit einem Tipp zurücksetzen können. |
| „Startpunkt entfernen“ zentriert bei 200 % (0004 H3) | umsetzen: `.linkbtn { text-align: inherit }` | B | Eine Zeile CSS, und Leerzustände bleiben zentriert. |
| „Auferstehungskirc-he“ (0004 H4) | umsetzen: `.meta { hyphens: auto }` | B | Silbentrennung wie bei Titeln, `overflow-wrap` bleibt Notausgang. |
| Cluster ändern sich mit Startpunkt (0005 H1) | umsetzen: GeoJSON nach `key` | C | Eine Sortierung in einer reinen Funktion, Liste bleibt nach Entfernung sortiert. |
| „Nuremberg“ (0005 H2) | umsetzen: `germanTextField` im `style.load` | C | Reine Funktion, kein Request, wirkt in beiden Stilen. |
| Attribution in Helvetica (0005 H3) | umsetzen: `font-family: var(--font-sans)` | C | Eine Zeile CSS, Schrift ist schon geladen. |
| Konsolen-Warnungen OFM (0005 H5) | `docs/ideas.md` (Notiz bei PMTiles) | – | Nur Warnungen aus einem fremden Stil, ohne Nutzen für Eltern. |
| Orts-Sheet wiederholt Ort (0005 H6) | umsetzen: `OfferCard atPlace` | C | Der Sheet-Kopf nennt Ort und Entfernung schon, der Anbieter bleibt. |
| Zoom-Knöpfe verdecken Marker (0005 H7) | umsetzen: asymmetrisches Padding | C | Eine Konstante, Startausschnitt bleibt öffentlich. |
| Doppelte Attribution (0005 W1) | Hotfix, nicht hier | – | Läuft parallel. |
| B6 CLS / Roboto (0007 Paket C) | Plan 0007, nicht hier | – | Läuft parallel. |
| 9 Angebote mit Ort in der Adresse (0007 Hinweis 6) | `docs/ideas.md` (Eintrag ergänzt) | A | Datenfehler an 3 Orten gehören in den Pipeline-Lauf, nicht in eine UI-Heuristik. |
| Querformat: Karte unter dem Falz (0005 H4) | bleibt in `docs/ideas.md` („Kompakter Kopfbereich“) | – | Bewusst so, eigenes Designthema. |
| Geräteprüfungen (0007, 0004 W1, 0005 Schritt 10) | Checkliste für den Nutzer | – | Braucht echte Geräte und Konten. |

## Struktur

```
index.html                         Frühstart statt Preload                          [A]
src/env.d.ts                       Window.__zpSite                                  [A]
src/data/site.ts (+test, neu)      takeEarlyRequest, SiteLoadError, loadSiteData(env) [A]
src/domain/agenda.ts (+test)       DayAgenda.hidden, context.allIndex               [A]
src/ui/
  format.ts (+test)                loadErrorText, hiddenNote                        [A]
  use-offer-views.ts (+test)       calendar.allIndex                                [A]
  CalendarView.tsx                 Leerzustand „Nichts, was zu deiner Auswahl passt“ [A]
  App.tsx                          LoadState.reason, activeTab, onResetFilter        [A]
  Chrome.tsx                       TabBar: currentRef                               [A]
  Overlays.tsx                     Detail: fallbackFocus                            [A]
  Sheets.tsx                       Fuß: „Zurücksetzen“ als .linkbtn                 [B]
  styles/motion.css                animation/transition: none                       [B]
  styles/dialog.css                .detail Container, ICS-Fuß scrollt              [B]
  styles/calendar.css              .mgrid Container, Felder                         [B]
  styles/tabs.css                  Badge im Fluss (quer), gleich hohe Zeilen        [B]
  styles/sheet.css                 Toast pointer-events, .sheetfoot .linkbtn        [B]
  styles/list.css                  .linkbtn text-align: inherit                     [B]
  styles/card.css                  .meta hyphens                                    [B]
  OfferCard.tsx                    atPlace                                          [C]
  karte/PlaceSheet.tsx             atPlace setzen                                   [C]
  map/geojson.ts (+test)           Reihenfolge nach key                             [C]
  map/labels.ts (+test, neu)       germanTextField                                  [C]
  map/MapView.tsx                  Labels im style.load, Padding                    [C]
  map/map-overrides.css            Schrift der Karte                                [C]
tests/fixtures/karte/*.json        Symbol-Layer label-stadt                         [C]
e2e/
  app.spec.ts                      site.json einmal, Fehlerzustand                  [A]
  calendar.spec.ts                 ausgeblendete Angebote                           [A]
  saved.spec.ts                    Fokus-Rückweg                                    [A]
  theme.spec.ts                    WebKit-Farbwechsel                               [B]
  mobile-ux.ts                     Prüfung 2/3 präzisiert, MAX_REDUCED_MS = 0       [B]
  mobile-ux.spec.ts                Regressionen und Kanarienvögel                   [B]
  layout.spec.ts                   ICS-Fuß, Monat, Badge, Toast, Fuß, Linkbtn, Meta [B]
  karte.spec.ts                    Labels, Schrift, Orts-Sheet, Zoom-Ecke           [C]
docs/ideas.md                      E18, E21                                         [A]
docs/architecture.md               Datenfluss, Gates, Karte                         [Schritt 5]
```

Die Schichtregeln bleiben:
- `labels.ts` liegt in `src/ui/map/` und wird nur von `MapView.tsx` importiert. Es importiert nichts aus `maplibre-gl` außer ggf. Typen.
- `site.ts` bleibt der einzige Datenzugriff der UI.
- `e2e/` importiert nichts aus `src/`.

## Tests

**Unit, test-first** (Vitest, TZ `America/Los_Angeles`, Coverage `src/domain` ≥ 90 %):
- **A:**
  - `agenda.test.ts` (`hidden`);
  - `site.test.ts` (frühe Anfrage einmal, drei Fehlerarten, `cause`);
  - `format.test.ts` (`loadErrorText`, `hiddenNote`);
  - `use-offer-views.test.ts` (`allIndex`).
- **C:**
  - `geojson.test.ts` (Reihenfolge);
  - `labels.test.ts` (`germanTextField`).

**E2E zuerst rot** (Beleg je Test in der Commit-Message, sonst ausdrücklich „Absicherung“):

| Test | Datei | rot auf dem alten Stand |
|---|---|---|
| Darstellung wechselt bei reduzierter Bewegung sofort die Farben | `theme.spec.ts` | `iphone-15` |
| Beim Laden mit reduzierter Bewegung stehen die Farben sofort | `theme.spec.ts` | `iphone-15` (sonst Absicherung) |
| Woche mit zweistelligem Montag bei 320 px | `mobile-ux.spec.ts` | alle Engines |
| Halb hinausgescrollte Überschrift im Sheet | `mobile-ux.spec.ts` | alle Engines |
| `site.json` genau einmal | `app.spec.ts` | `iphone-15` |
| Fehlerzustand mit eigenem Text, Serverfehler | `app.spec.ts` | alle |
| ICS-Fuß scrollt bei 200 % mit | `layout.spec.ts` | ja |
| Monatsraster: Felder bei 200 % | `layout.spec.ts` | ja |
| Badge überdeckt nichts (quer) | `layout.spec.ts` | ja |
| Toast lässt Tipps durch | `layout.spec.ts` | ja |
| Filter-Fuß einzeilig ab 360 px | `layout.spec.ts` | ja |
| „Startpunkt entfernen“ linksbündig bei 200 % | `layout.spec.ts` | ja |
| `.meta` mit `hyphens: auto` | `layout.spec.ts` | ja |
| Fokus auf aktivem Tab nach Ablösen | `saved.spec.ts` | ja |
| Ausgeblendete Angebote statt „Freier Tag“ | `calendar.spec.ts` | ja |
| Deutsche Beschriftung (hell, dunkel) | `karte.spec.ts` | ja |
| Attribution in App-Schrift | `karte.spec.ts` | ja |
| Orts-Sheet ohne Ortsangaben | `karte.spec.ts` | ja |
| Zoom-Ecke frei | `karte.spec.ts` | Absicherung, falls nicht breitenbegrenzt |

**Dauerhafte Kanarienvögel** (`mobile-ux.spec.ts`, erwarten `rejects`):
- Bewegungs-Gate erkennt Transition trotz Reduce (E1).
- Text-Gate erkennt Text, der aus seinem sichtbaren Kasten ragt (E2).
- Text-Gate erkennt Text, der aus einem unsichtbaren Kasten ohne sichtbaren Kasten dazwischen ragt (E2).
- Bestehend und weiter rot: Überlappung (Prüfung 4), Text in der Rundung im Scroll-Container (Prüfung 3).

**Neue Zustände durch die Gates:** Fehlerzustand (`app.spec.ts`, `expectMobileUx`). Der Leerzustand „Nichts, was zu deiner Auswahl passt“ wird beim Zusammenführen einmal per Hand durch `expectMobileUx` und 320 px/200 % geführt. Er ist kein Startzustand einer Gate-Ansicht. Der Test in `calendar.spec.ts` ruft dafür nach der Erwartung `expectMobileUx(page)` auf.

## Backpressure

Keine Schwelle wird gesenkt, kein Gate gelockert. `MAX_REDUCED_MS` wird schärfer (1 → 0 ms). Die zwei Präzisierungen im Text-Gate sind begründete Regeln mit Kanarienvögeln, keine Ausnahmen per Selektor.

| Fehler kommt zurück | Gate wird rot |
|---|---|
| Transition/Animation unter Reduce (auch 0,01 ms) | `expectReducedMotion` (0 ms) in jedem Gate-Lauf; Kanarienvogel |
| WebKit-Farbwechsel verzögert | `theme.spec.ts` (Farben 300 ms nach dem Tipp, beim Laden), `iphone-15` |
| Prüfung 2 meldet gewollten Überstand | Regression „Woche mit zweistelligem Montag“ |
| Prüfung 2 übersieht herausragenden Text | zwei Kanarienvögel (sichtbarer und unsichtbarer Kasten) |
| Prüfung 3 meldet angeschnittene Zeile bzw. übersieht Text in der Ecke | Regression „halb hinausgescrollt“; Kanarienvogel „Rundung im Scroll-Container“ |
| `site.json` doppelt | `app.spec.ts` „genau einmal“ |
| Rohtext im Fehlerzustand | `site.test.ts`, `format.test.ts`, `app.spec.ts` |
| ICS-Fuß fest bei 200 % | `layout.spec.ts` |
| Monatszahlen ohne Trennung | `layout.spec.ts` |
| Badge über Label/Herz | `layout.spec.ts` |
| Toast blockiert | `layout.spec.ts` |
| Filter-Fuß zweizeilig ab 360 px | `layout.spec.ts` |
| Fokus auf `<body>` nach Ablösen | `saved.spec.ts` |
| „Freier Tag“ trotz Auswahl | `agenda.test.ts`, `calendar.spec.ts` |
| „Startpunkt entfernen“ zentriert | `layout.spec.ts` |
| Meta ohne Silbentrennung | `layout.spec.ts` |
| Cluster reihenfolgeabhängig | `geojson.test.ts` |
| „Nuremberg“ | `labels.test.ts`, `karte.spec.ts` |
| Attribution in Fremdschrift | `karte.spec.ts` |
| Ort doppelt im Orts-Sheet | `karte.spec.ts` |
| Marker unter Zoom-Knöpfen beim Start | `karte.spec.ts` |

- Budgets bleiben (JS 90 kB, CSS 15 kB, Karte 450/12 kB). Erwartet sind:
  - A: JS +< 0,5 kB (Fehlerklasse, Leerzustand);
  - B: CSS +≈ 0,3 kB;
  - C: Karten-JS +< 0,3 kB, Start-JS +< 0,1 kB (`atPlace`).
  - Gemessen wird in Schritt 5, das Ergebnis steht in „Umsetzung“.
- `docs/architecture.md`, Schritt 5:
  - Datenfluss: Frühstart (A);
  - Mobile-UX-Gates: „reduzierte Bewegung: keine Animation und keine Transition (0 ms)“, Text-Gate mit den Regeln aus E2/E3 (B);
  - Karte: deutsche Beschriftung über `text-field` im `style.load` (C).

## Schritte

Jeder Schritt ist erst fertig, wenn sein Fertig-Kriterium erfüllt ist. Die Schritte 2, 3 und 4 laufen parallel.

0. **Voraussetzungen:**
   - Der Attributions-Hotfix (W1) ist auf `main` und deployt, bevor Paket C abzweigt.
   - Mit Plan 0007 Paket C ist der Port abgesprochen.

   *Fertig:* `git log origin/main` enthält den Hotfix, und die Ports stehen fest (4173/4273/4373, 0007-C z. B. 4473).
1. **`/plan-review`**, Review hier einarbeiten.

   *Fertig:* Review-Abschnitt vorhanden, kein Blocker offen.
2. **Paket A** (Worktree `.claude/worktrees/feinschliff-0008-a`, Branch `feinschliff-0008-a` von `main`, `pnpm install`, `PW_PORT=4173`):
   1. Unit-Tests zuerst, je erst rot: `agenda` (`hidden`), `site` (frühe Anfrage, Fehlerarten), `format` (`loadErrorText`, `hiddenNote`), `use-offer-views` (`allIndex`).
   2. E2E zuerst rot: `app.spec.ts` (einmal, Fehler), `calendar.spec.ts`, `saved.spec.ts`. Das Rot gegen den alten Stand belegen (`site.json` doppelt nur in `iphone-15`, lokal mit `libavif16`, sonst über die Branch-CI wie in E1).
   3. Umsetzung E4, E5, E11, E12, dann `docs/ideas.md` (E18, E21).

   *Fertig:*
   - `pnpm check:fast` grün, Coverage `src/domain` ≥ 90 %.
   - `PW_PORT=4173 pnpm e2e` grün; Perf einzeln wiederholt, falls unter Last rot (E22).
   - Budgets eingehalten.
   - Commit mit Rot-Belegen und den Zeilen für `architecture.md`, Push, Branch-CI grün.
3. **Paket B** (Worktree `.claude/worktrees/feinschliff-0008-b`, Branch `feinschliff-0008-b`, `PW_PORT=4273`):
   1. **Rot zuerst:**
      - `theme.spec.ts` (E1) auf dem alten `motion.css`, in `iphone-15`. Ohne `libavif16` als eigener Commit gepusht, Branch-CI rot in `iphone-15`.
      - Dazu die Regressionen aus E2/E3 auf dem alten Gate und die `layout.spec.ts`-Tests aus E6–E10, E13, E14 auf dem alten CSS.
      - Alle Meldungen in die Commit-Message.
   2. **Gates:**
      - `mobile-ux.ts`: Prüfung 2 und 3 präzisieren, `hasVisibleEdge` herausziehen, `MAX_REDUCED_MS = 0`, Kommentar an `settle()`.
      - Kanarienvögel schreiben. Sie müssen rot sein, der bestehende „Rundung im Scroll-Container“ unverändert rot.
   3. **CSS:** `motion.css`, dann E6–E10, E13, E14, `Sheets.tsx`. Alle Gates grün, ohne Ausnahmen.

   *Fertig:* `PW_PORT=4273 pnpm check` grün inklusive E2E (WebKit lokal ggf. ohne `iphone-15`, dann muss die Branch-CI WebKit grün zeigen). Budgets eingehalten. Commit und Push, Branch-CI grün.
4. **Paket C** (Worktree `.claude/worktrees/feinschliff-0008-c`, Branch `feinschliff-0008-c` von `main` **nach** Schritt 0, `PW_PORT=4373`):
   1. Unit-Tests zuerst: `geojson.test.ts` (Reihenfolge), `labels.test.ts`.
   2. Fixture-Stile mit `label-stadt`, E2E in `karte.spec.ts` zuerst rot (Labels, Schrift, Orts-Sheet; Zoom-Ecke ggf. Absicherung).
   3. Umsetzung E15–E17, E19, E20.

   *Fertig:* `pnpm check:fast` grün, `PW_PORT=4373 pnpm e2e` grün (Karten-Specs auch in `iphone-15`, notfalls über die Branch-CI), Karten-Budgets eingehalten. Commit mit den Zeilen für `architecture.md`, Push, Branch-CI grün.
5. **Zusammenführen** (ein Agent, eigener Worktree, Branch `feinschliff-0008`):
   - Erst B übernehmen, dann A und C darauf rebasen. Konflikte sind nach E22 nicht zu erwarten. Treten welche auf, gilt dieser Plan.
   - `pnpm check` komplett. Erst jetzt laufen A's Leerzustände und der Fehlerzustand durch B's Gates und `.linkbtn`-Regel.
   - `docs/architecture.md` nachführen (Zeilen aus den Commit-Messages), Budgets und Abweichungen hier unter „Umsetzung“ eintragen.

   *Fertig:* `pnpm check` grün, Budgets notiert, „Umsetzung“ geschrieben.
6. **`/arch-review`** über alle drei Pakete. Pflicht wegen neuer Module (`site.test.ts`, `labels.ts`), des Frühstarts in `index.html` (Datenfluss) und > 200 Zeilen. Befunde einarbeiten und hier anhängen.

   *Fertig:* kein Blocker offen, `pnpm check` weiter grün.
7. **Commit, Push, Fast-Forward nach `main`.**

   *Fertig:* CI auf `main` grün (`gh run watch`), Deploy durch, https://zwergenplan.app/data/meta.json zeigt den neuen Commit.
8. **`/browser-review live`** auf https://zwergenplan.app/ mit echten Daten. Jede Checklisten-Zeile beantworten, dazu einzeln:
   - **E1:** WebKit, `reducedMotion: reduce`, 412 px: Theme umschalten, 300 ms danach axe ohne Kontrastfehler. Beim Laden ist die Marke nicht schwarz.
   - **E2/E3:** Gates auf echten Daten in der Woche bei 320 px (mit zweistelligem Montag) und in gescrollten Sheets (Kind quer, Filter 320 px/200 %).
   - **E4:** WebKit, Netzwerk: `site.json` einmal, keine Preload-Warnung. Chromium unverändert 5 Requests.
   - **E5:** `site.json` blockiert: deutscher Text, „Nochmal versuchen“ lädt.
   - **E6:** Detail bei 320 px/200 % und quer: ICS-Fuß am Ende des Inhalts. Bei 100 % hochkant unverändert fest.
   - **E7:** Monat bei 360 px/200 %: Tage als Felder lesbar. Bei 100 % unverändert.
   - **E8, E9:** 568 × 320 und 863 × 360/200 % mit gemerkten Angeboten; Toast auf 320 px/200 % in der Merkliste.
   - **E10:** Filter-Fuß bei 360, 375, 390 px einzeilig.
   - **E11:** Fokus nach Ablösen in der Merkliste (Tastatur, Desktop).
   - **E12:** Kalender mit „Kurse“ bzw. Umkreis 2 km an einem Tag mit anderen Angeboten.
   - **E13:** Kind-Sheet bei 320 px/200 %.
   - **E14:** Kacheln bei 320 px/200 % mit „Auferstehungskirche“ in WebKit.
   - **E15–E20:** Cluster vor und nach „Meinen Standort nutzen“ gleich; „Nürnberg“, „Fürth“, „Erlangen“ deutsch; Attribution in Bricolage; Orts-Sheet ohne doppelte Ortsangabe; keine Marker unter den Zoom-Knöpfen im Startausschnitt.

   Ergebnis hier anhängen.

   *Fertig:* jede Zeile beantwortet, keine neuen Blocker.
9. **Geräte-Checkliste an den Nutzer** (Abschnitt unten). Die Antworten kommen hier unter „Gerätecheck“ dazu. Schlechte Befunde werden neue Einträge in diesem Plan oder ein neuer Plan.

   *Fertig:* Checkliste übergeben. Das Ergebnis ist kein Gate für das Deploy.

## Nur am Gerät prüfbar (Checkliste für den Nutzer)

Ohne Umsetzung in diesem Plan. Bitte jeweils kurz notieren: Gerät, Betriebssystem, Browser, Ergebnis.

- [ ] **iPhone mit Notch im Querformat** (Plan 0007, H1): Seitenleiste links sitzt neben der Notch, nichts verdeckt. Toast mittig über dem Inhalt.
- [ ] **Filter-Fuß über der Home-Leiste** (Plan 0007, H7): Auf dem iPhone steht „… Angebote zeigen“ ganz über der Home-Leiste, „Zurücksetzen“ ist als Textknopf gut zu treffen (nach Plan 0008, E10).
- [ ] **Erneuter ICS-Import** (Plan 0007, H6): einen schon importierten Termin noch einmal aus „Alle Termine“ importieren (Google Kalender und Apple Kalender). Gibt es eine Dublette, und wird der Ort aktualisiert?
- [ ] **Geolocation-Dialog** (Plan 0004, W1): auf iPhone (Safari) und Android (Chrome) „Meinen Standort nutzen“. Der Systemdialog erscheint erst nach dem Tipp. Ablehnen zeigt den Hinweis, Zulassen die Entfernungen.
- [ ] **Merklisten-ICS auf dem iPhone** (ADR 0007): „Alle in den Kalender“ bietet „Zum Kalender hinzufügen“ an oder lädt nur eine Datei herunter?
- [ ] **Karte auf echtem Handy** (Plan 0005, Schritt 10): Ladezeit bis zu den ersten Kacheln (Ziel ≤ 4 s mobil), Zwei-Finger-Geste, Tipp auf Cluster und Ort, Wechsel hell/dunkel.
- [ ] **„Bewegung reduzieren“ auf dem iPhone** (Plan 0008, E1): Einstellungen → Bedienungshilfen → Bewegung → „Bewegung reduzieren“ an. Darstellung im Kopf umschalten: Der Text wechselt sofort die Farbe, keine Sekunde dunkel auf dunkel.

## Akzeptanzkriterien

- Jeder Befund aus E23 ist umgesetzt wie beschrieben oder steht begründet in `docs/ideas.md`. Jede Umsetzung hat einen Unit- oder E2E-Test (Tabelle „Backpressure“).
- Die E2E-Tests aus „Tests“ waren vor ihrer Korrektur rot. Belege stehen in den Commit-Messages, Ausnahmen sind dort als „Absicherung“ benannt.
- `expectReducedMotion` verlangt 0 ms und ist in allen Gate-Läufen grün. Der Kanarienvogel ist rot.
- Das Text-Gate ist auf echten Daten in der Woche bei 320 px/100 % und in gescrollten Sheets grün. Alle vier Kanarienvögel (zwei neu, zwei bestehend) sind rot.
- `pnpm check` grün, CI auf `main` grün, Budgets eingehalten und notiert, `docs/architecture.md` und `docs/ideas.md` nachgeführt.
- `/browser-review live` beantwortet E1–E20 einzeln (Schritt 8). Die Geräte-Checkliste ist übergeben (Schritt 9).

## Risiken

- **`animation: none` statt 0,01 ms:** Wer künftig auf `animationend`/`transitionend` hört, bekommt unter „reduzieren“ kein Ereignis. Heute hört niemand darauf (geprüft). Der Kommentar in `motion.css` nennt die Bedingung.
- **WebKit-Test und Headless-Zeitverhalten:** Headless-WebKit taktet anders als Safari. Ist der Test auf dem alten Stand lokal nicht rot, entscheidet die Branch-CI (`iphone-15`). Ist er auch dort grün, bleibt er Absicherung, und die iPhone-Gegenprobe (Checkliste) ist der Beleg. Der Fix bleibt trotzdem, weil die Ursache im Code klar ist.
- **Präzisierte Text-Gate-Regeln:** Bedingung 3 in E2 hängt am Begriff „sichtbare Kante“. Er ist identisch mit Prüfung 3 und wird geteilt, damit beide nicht auseinanderlaufen. Taucht ein neuer Fehlalarm auf, wird wieder die Regel präzisiert, mit Kanarienvogel, nie per Selektor.
- **Frühstart in `index.html`:** Ein globales `window.__zpSite` ist eine versteckte Kopplung zwischen HTML und `src/data`. Sie ist auf eine Stelle begrenzt (`takeEarlyRequest`), kommentiert und durch `app.spec.ts` (einmal) sowie den Fehlertest (übernimmt nur einmal) abgesichert. LCP ändert sich nicht, der Request startet wie der Preload beim Parsen des `<head>`. Die Perf-Tests messen das. Wird ein Pfadwechsel nötig (`BASE`), muss die Zeile in `index.html` mit; der Kommentar dort verweist auf `site.ts`.
- **ICS-Fuß scrollt mit:** Bei großer Schrift und quer ist der Kalender-Knopf nicht mehr ohne Scrollen zu sehen. Das ist der Tausch für mehr Lesefläche. Der Browser-Review sieht es an, eine offene Geschmacksfrage steht unten.
- **Container `size` am Detail:** Größencontainment verhindert, dass die Größe des Dialogs vom Inhalt abhängt. Bei `inset: 0` ist das ohnehin so. Ältere Browser ohne Container-Queries (Safari < 16) zeigen den Fuß fest wie bisher.
- **Felder im Monatsraster:** Bei 125–150 % greift die Regel teils schon. Das ist gewollt, die Zahlen werden dort ebenfalls eng. Das Text-Gate prüft die neue Rundung (Prüfung 3), der Radius wird notfalls kleiner.
- **Deutsche Beschriftung:** Hängt an den Feldnamen der OFM-Kacheln (`name:de`, `name_de`, `name`). Ändert OpenFreeMap das Schema, fällt `coalesce` auf `name` zurück, also den lokalen Namen. Es gibt keinen Totalausfall.
- **Asymmetrisches Padding:** Der Startausschnitt verschiebt sich leicht nach links und zoomt etwas heraus. Die Kamera-Regel bleibt erfüllt, der Test „Startausschnitt verrät weder Standort noch Alter“ vergleicht weiter gleiche Paddings.
- **Parallele Arbeiten:**
  - Plan 0007 Paket C und der Hotfix ändern Nachbardateien. E22 trennt die Dateien. C zweigt nach dem Hotfix ab.
  - Konflikte bei Nachbarzeilen löst, wer später nach `main` kommt.
  - Die CPU-gedrosselten Perf-Tests sind unter paralleler Last unzuverlässig. Lokal gilt „einzeln grün“, endgültig entscheidet die CI.

## Offene Fragen an den Nutzer (Geschmack)

1. **ICS-Fuß bei großer Schrift und im Querformat:** am Ende des Inhalts mitscrollen (Plan, mehr Lesefläche) oder fest unten lassen (immer sichtbar, aber 35–40 % der Höhe)?
2. **Monatsraster bei großer Schrift:** zarte Felder je Tag (Plan) oder lieber nur eine dünne Trennlinie zwischen den Spalten?
3. **„Zurücksetzen“ im Filter-Sheet:** als Textknopf links im Fuß (Plan) oder oben rechts neben der Überschrift „Filter“ (Fuß dann immer einzeilig, Zurücksetzen scrollt aber weg)?
4. **Merklisten-Badge im Querformat:** hinter bzw. unter dem Wort „Merkliste“ (Plan) statt als Punkt am Herz. Passt das zum Stickerheft-Look?
