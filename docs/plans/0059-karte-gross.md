# Plan 0059 – Karte groß: nur Karte, Detail als Overlay

Status: in Umsetzung
Datum: 2026-10-31

Bezug:
- Plan 0005 (Karte, E7: zwei Finger), Plan 0055 (Anbieterkarte), Plan 0056 (Liste im Ausschnitt), Plan 0025 (Merklisten-Karte).
- ADR 0008 und ADR 0039 (Kamera-Regel), ADR 0038 (Anbieterkarte lädt mit dem Tab).
- `docs/ideas.md`: „Anbieterkarte groß“ (Plan 0055, Nicht-Ziel). Das erledigt dieser Plan.
- Mockup: Canvas „Zwergenplan – Karte groß“, Reihe D (D1–D4), https://claude.ai/artifact/17xncMzqukEXjEwYvj2kBq

## Anlass

Nutzerwunsch (2026-10-31): Man soll auf der Karte suchen können, nicht nur die Karte als Filter der Liste nutzen.

Ablauf der Rückfragen am 2026-10-31:

1. Erste Mockups A–C zeigten die große Karte mit einer Liste (Sheet, Karussell, „Hier suchen“).
2. Der Nutzer wollte stattdessen keine Liste. Ein Tipp auf einen Punkt soll direkt das Detail als Overlay über der Karte öffnen. Dafür entstand Mockup D.
3. Entscheidungen des Nutzers zu D:
   - Die Tab-Leiste wird in der großen Karte ausgeblendet.
   - Es gilt für alle drei Karten: Entdecken, Merkliste, Anbieter.
   - Die kleine Karte bleibt, samt „Liste | Karte“ und der Liste im Ausschnitt (Plan 0056). „Groß“ kommt dazu.
   - Variante D wird gebaut.

## Befund

- **Drei Karten, ein Chunk:**
  - `MapPanel` → `karte/MapScreen.tsx` dient „Entdecken“ (`ansicht=karte`) und der Merkliste (`ansicht=merkliste-karte`, über `SavedView.renderMap`).
  - `ProviderMapPanel` → `karte/ProviderMapScreen.tsx` dient dem Tab „Anbieter“.
  - Beide rendern `.map-box` mit `map/MapView.tsx` (MapLibre) und ein eigenes Orts-Sheet (`Dialog` mit `className="sheet"`).
- **Tipp auf einen Ort:**
  - Angebotskarte: Ein Ort mit einem Angebot öffnet das Detail (`ctx.onOpen` → `openDetail`). Mehrere öffnen das Orts-Sheet `PlaceSheet` mit Kacheln.
  - Anbieterkarte: Ein Anbieter öffnet das Anbieter-Sheet (`openProvider`). Mehrere öffnen `ProviderPlaceSheet`.
  - Das Verhalten aus D2/D3 gibt es also schon. Es fehlen die große Darstellung und das Detail als Overlay über der Karte.
- **Detail:**
  - `Overlays.tsx` rendert es als `Dialog` mit `className="detail"`, also als Vollbild (`dialog.css`, `.detail`, Slide von rechts).
  - Der native `<dialog>` macht den Hintergrund inert, ein Tipp auf den Backdrop schließt ihn (`Dialog.tsx`).
- **Verlauf:** `useRoute` legt beim Öffnen von Detail und Anbieter-Sheet einen History-Eintrag an (`DETAIL_STATE`, `PROVIDER_STATE`). „Zurück“ schließt sie (`closeDetail` → `history.back()`).
- **Gesten:** `cooperativeGestures: true` (Plan 0005, E7): Ein Finger scrollt die Seite, zwei bewegen die Karte. Kein ADR legt das fest. MapLibre 6.12 schaltet es per `map.cooperativeGestures.enable()/disable()` um.
- **Größe:** MapLibre beobachtet den Container per `ResizeObserver` (`trackResize`). Ein Klassenwechsel am Rahmen passt die Karte ohne Neuaufbau an.

## Ziel

- Jede der drei Karten hat einen Knopf „Groß“. Er öffnet die Karte im Vollbild, ohne Kopf, Filterzeile, Statuszeile, Liste und Tab-Leiste.
- Oben links in der großen Karte stehen „Karte verkleinern“ und, in „Entdecken“ und auf der Merkliste, „Filter“. Unten links steht die Zahl im Ausschnitt.
- Ein Tipp auf einen Punkt verhält sich wie heute: ein Angebot öffnet das Detail, mehrere öffnen das Orts-Sheet, ein Anbieter öffnet sein Sheet. Das Detail steht in der großen Karte als Sheet von unten über der Karte (etwa 60 %). Der gewählte Punkt ist hervorgehoben und liegt sichtbar darüber.
- Das Detail lässt sich ganz hochziehen. „×“, ein Tipp auf die Karte und „Zurück“ führen zurück zur großen Karte, ein weiteres „Zurück“ zur kleinen.
- Ein Finger bewegt die große Karte.

## Nicht-Ziele

- Die kleine Karte, „Liste | Karte“ und die Liste im Ausschnitt bleiben unverändert (Nutzerentscheid 3).
- Es gibt keine Liste und kein Karussell in der großen Karte (Mockups A–C verworfen).
- Abweichungen vom Mockup D, bewusst:
  - **Kein Zeitraum-Chip** in der Kopfleiste. Den Zeitraum gibt es im Filter-Sheet, ein zweiter Chip bräuchte bei 320 px eine zweite Zeile.
  - **Kein Knopf „Zum Startpunkt“.** Den gibt es heute auch nicht. „Alle zeigen“ bzw. ein neuer Startpunkt im Kind-Sheet bleiben die Wege.
  - **Orts-Sheet wie heute** (Kacheln aus `PlaceSheet`) statt der kompakten Zeilen aus D3. So bleibt ein Orts-Sheet für kleine und große Karte. Kompakte Zeilen kommen nach `docs/ideas.md`.
  - **Anbieter:** kein Filter-Knopf in der großen Karte. Im Tab wirken nur Kategorie und Alter, die Kategorie steht in den Stickern über der kleinen Karte (Plan 0055, E3).
- Im Zustand `voll` darf das Detail den gewählten Ort verdecken. Wer ganz hochzieht, liest das Detail. Ein Ort ganz oben kann unter der Kopfleiste liegen.
- Der Querformat-Kopf und die Seitenleiste (`docs/ideas.md`) bleiben außen vor. Die große Karte füllt auch quer den Bildschirm.

## Entscheidungen

### E1 – „Groß“ in der URL: `karte=gross`

- `Route` bekommt `big?: true`. `parseRoute` liest `karte=gross`, aber nur zu `ansicht=karte`, `ansicht=merkliste-karte` und `ansicht=anbieter`, sonst fällt es weg. `routeToSearch` schreibt es hinter `ansicht=`.
- `useRoute.setRoute` normalisiert: `big` gilt im Speicher nur zu einer Ansicht mit Karte (`hasMap`). `replace` mit anderer Ansicht lässt `big` fallen. So bleibt es auch über `endOnboarding`, `SavedView.onTab`, `discoverRange` und `followUp` nicht hängen (Review M2).
- `useRoute` bekommt `openBig()` und `closeBig()` nach dem Muster von `openDetail`/`closeDetail`: `pushState(BIG_STATE)` bzw. `history.back()`, wenn der Eintrag von uns stammt, sonst `replaceState` ohne `karte=`.
- **Filter überstehen „Zurück“** (Review 2, N1): Filter in der großen Karte ändern nur deren Eintrag (`replace`). Nimmt `popstate` die große Karte zurück und bleibt die Ansicht gleich, übernimmt `afterBigClosed` (`route.ts`, rein, mit Test) Filter und Sortierung aus dem Zustand davor und schreibt sie per `replaceState` in die URL. Das gilt für „Karte verkleinern“, `Esc` und die Zurück-Geste.
- „Zurück“ auf Android und im Browser schließt also die große Karte. Ein Deep-Link mit `karte=gross` öffnet sie direkt.
- **Privatsphäre:** `karte=gross` sagt nur etwas über die Darstellung, wie `ansicht=` (`docs/architecture.md`, Privatsphäre). Es kommt kein neuer Request dazu. Kacheln lädt die große Karte wie die kleine, nur für die größere Fläche.
- Teilen per Link (ADR 0020) nimmt die URL nie mit, also auch dies nicht.

### E2 – Darstellung: dieselbe Karte, Vollbild per CSS

- **Nur mit Rahmen** (Review B1): Verborgen wird nur, wenn ein Rahmen `.map-box.big` wirklich im DOM steht (`.app:has(.map-box.big)`). Lädt `site.json` noch, scheitert es oder fehlt die Karte (Merkliste leer), bleibt die Seite normal sichtbar, ohne leeren Bildschirm.
  - Beide Platzhalter (`MapPanel`, `ProviderMapPanel`) und die Fehlerzustände der Karten rendern `.big` samt Kopfleiste. So bleibt „Karte verkleinern“ immer erreichbar.
  - Merkliste: In der großen Karte bleibt die Karte auch dann stehen, wenn der Merklisten-Filter alles ausblendet (0 Orte, Zahl „0 von 5 gemerkten Angeboten“). Ohne gemerkte Angebote gibt es keine Karte, dann gilt der Rückfall oben.
- **Der Rahmen:** `.map-box` bekommt die Klasse `big`: `position: fixed; inset: 0; z-index: 15` (unter Toast 20 und Onboarding-Cover 30), ohne Rand und Radius, mit `height: 100dvh`. Der React-Baum bleibt gleich, es gibt **keinen** Neuaufbau von MapLibre: Kamera, Kacheln und Zustand bleiben erhalten.
- **Der Rest:** `.app:has(.map-box.big)` setzt `visibility: hidden`. `.map-box.big`, `dialog`, `.toast` und `.onb-cover` setzen `visibility: visible`. Damit fehlt der Rest auch im Fokus und im Accessibility-Baum, ohne `inert`-Pflege von Hand, und Overlays bleiben bedienbar. `html:has(.map-box.big)` setzt `overflow: hidden`.
- **Scroll-Position** (Review M1): Der fixe Rahmen fällt aus dem Fluss, das Dokument wird kürzer. `App` merkt sich `scrollY` samt Ansicht beim Öffnen und stellt es nach dem Schließen wieder her, nur in derselben Ansicht (Review 2, M-a).
- **Steht der Rahmen?** (Review 2, M-b): `App` rechnet `bigShown`: `big`, Daten geladen und eine Karte gerendert (Tab „Anbieter“ immer, sonst `views.map`, auf der Merkliste mit Gemerktem). Danach richten sich Detail-Sheet (`overMap`), Fokus-Rückweg, `Esc` und Fokus. Ohne Rahmen öffnet das Detail also wie bisher im Vollbild.
- **Toast:** In der großen Karte gibt es keine Seitenleiste. Der Toast steht unten mittig, auch quer.
- **Safe Areas:** Kopfleiste und Zahl halten `env(safe-area-inset-*)` frei. MapLibres Bedienelemente rücken per CSS ebenso ein (`.map-box.big .maplibregl-ctrl-top-right`, `-bottom-right`).
- **Gesten:** `MapViewProps` bekommt `big: boolean`. Ein Effekt schaltet `map.cooperativeGestures` aus (groß) bzw. ein (klein). Im Vollbild gibt es keine Seite zu scrollen.

### E3 – Bedienelemente

- **„Groß“** steht oben links in jedem Kartenrahmen (`MapScreen`, `ProviderMapScreen` und der Platzhalter in `MapPanel`), außer im Fehlerzustand. Es ist ein Pillen-Knopf mit Symbol und Text „Groß“, 44 px hoch, mit `aria-label="Karte groß zeigen"`.
- **Kopfleiste der großen Karte** (oben links, `BigMapBar` in `src/ui/BigMapBar.tsx`, Start-Bundle):
  - Ein runder Knopf „Karte verkleinern“ ruft `closeBig`.
  - „Filter“ mit Zähler öffnet in „Entdecken“ das Filter-Sheet und auf der Merkliste `saved-filter`. Im Tab „Anbieter“ fehlt er (siehe Nicht-Ziele).
- **Zahl unten links** (`role="status"`):
  - „42 Angebote im Kartenausschnitt“ bzw. ohne Einschränkung „230 Angebote“, mit denselben Texten wie die Statuszeile (`inViewStatusParts`, `listStatusParts`, `providerStatusParts`, `savedMapStatusParts`).
  - Die Wahl der Wörter ist die reine Funktion `bigMapStatusParts` (`format.ts`, mit Test; Arch-Review, Minor 1).
  - Die Ansage läuft erst, wenn die Karte ruht (`useSettled`, wie die Statuszeile, Review m8 aus Plan 0055). Die Statuszeile selbst ist dann verborgen und sagt nichts an.
- **Einbau:** Die Kopfleiste und die Zahl rendert `App` und gibt sie als `overlay?: ReactNode` an `MapScreenProps` bzw. `ProviderMapScreenProps` weiter. Die Karten setzen sie in `.map-box`, damit sie in der sichtbaren Ebene liegen. Ein `ReactNode` über die Lazy-Grenze ist nur ein Wert, kein statischer Import (`karte-ui-only-lazy` bleibt).
- **Tastatur und Fokus** (Review M3, M7):
  - Nach dem Öffnen liegt der Fokus auf „Karte verkleinern“, nach dem Schließen auf „Groß“. `App` hält dafür zwei Refs: Den für „Groß“ reicht es als `growRef` in den Karten-Chunk.
  - Der Fokus-Rückweg des Detail-Dialogs (`fallbackFocus`) ist in der großen Karte „Karte verkleinern“ statt der verborgenen Tab-Leiste.
  - `Esc` schließt die große Karte nur, wenn kein Dialog offen ist. `keydown` erreicht `document` vor dem `cancel` des Dialogs, deshalb prüft der Handler ausdrücklich auf einen offenen `dialog[open]`. Sonst schlössen Detail und große Karte zusammen.
- **Fehlertexte** (Review M6): In der großen Karte heißt es statt „… stehen unten in der Liste“: „Mit ‚Karte verkleinern‘ stehen alle Angebote (bzw. Anbieter) in der Liste.“

### E4 – Detail als Sheet über der großen Karte

- `Overlays` bekommt `overMap: boolean` (= `big`). Dann ist die Klasse des Detail-Dialogs `detail over-map`, sonst wie heute `detail`.
- **CSS `.detail.over-map`:**
  - Unten verankert, `top: auto`, Höhe `min(62dvh, 100dvh − 8rem)`, oben gerundet wie `.sheet`, Animation `up` statt `slide`.
  - Wie `.sheet`: `max-width: 40rem`, mittig. Oben kein `safe-area-inset-top`, unten `safe-area-inset-bottom` (Review, Minor).
  - Der Backdrop ist leichter (`rgba(…, 0.15)`), damit die Karte darüber sichtbar bleibt. Ein Tipp darauf schließt wie bisher (`Dialog`).
- **Hochziehen** (D4):
  - Über dem Kopf steht ein Griff als Knopf („Detail ganz zeigen“ bzw. „Detail verkleinern“, `aria-expanded`, 44 px hoch). Er schaltet die Klasse `voll`: Höhe `calc(100dvh − 6rem)`, so bleibt ein Streifen Karte sichtbar.
  - Scrollt man im Inhalt mehr als 24 px (`scrollTop` von `.dscroll` bzw. `.detail-body`, per `onScroll` an beiden, Rückruf `onScrolled`), schaltet es ebenfalls auf `voll`. Ein programmatischer Sprung an den Anfang löst es also nicht aus (Review, Minor).
  - Den Zustand hält `Overlays` je geöffnetem Angebot. Er ist beim nächsten Öffnen wieder halb.
- `DetailContent` bekommt nur `onScrolled` (Rückruf mit `scrollTop`), sonst bleibt der Inhalt gleich. Die ICS-Fußzeile steht unten im Sheet wie heute im Vollbild.
- **Anbieter-Sheet und Orts-Sheets** sind schon Sheets von unten (`.sheet`) und bleiben so. In der großen Karte sind sie wie das Detail höchstens `min(62dvh, 100dvh − 8rem)` hoch (`.sheet.over-map`, Review M4). Ihr Inhalt scrollt ohnehin, und so gilt die Schwelle aus E5 für alle Overlays. Nur ihr Backdrop wird in der großen Karte ebenso leicht. Dafür bekommen auch diese Dialoge die Klasse `over-map`, gesetzt über dieselbe Prop bzw. über `big` im Karten-Chunk.

### E5 – Gewählter Punkt: hervorgehoben und sichtbar

- `MapViewProps` bekommt `selected?: string` (Ort-Schlüssel). Dazu kommt eine eigene Quelle `auswahl` mit einem Punkt und ein Kreis-Layer `auswahl-ring` unter den Markern: Ring in festem Gelb (`#ffd93b`, wie der Sticker-Kreis im Logo, hell und dunkel gleich), 26 px Radius; den Kontrast trägt der Rand in `--line`. Das läuft wie `startpunkt` nach jedem `style.load` (`addOwnLayers`).
- **Wer gewählt ist:**
  - In `MapScreen` und `ProviderMapScreen` gilt der zuletzt getippte Ort, solange sein Overlay offen ist.
  - Das Orts-Sheet kennt die Karte selbst. Für Detail und Anbieter-Sheet meldet `App` `overlayOpen` (`detailOffer !== undefined || sheetProviderId !== undefined`) als Prop.
  - Schließt das Overlay, entfällt die Auswahl.
  - Ein Detail, das nicht von der Karte kam (Deep-Link), hebt nichts hervor.
- **Sichtbar halten:**
  - Nur in der großen Karte. Alle Overlays sind dort höchstens 62 % hoch (E4). Liegt der Punkt beim Öffnen unterhalb von 38 % der Kartenhöhe, fährt die Karte ihn auf 25 % (`easeTo` mit `offset`). Bei reduzierter Bewegung springt MapLibre selbst.
  - Die Rechnung ist eine reine Funktion `revealOffset(y, height)` in `src/ui/map/reveal.ts`, mit Unit-Test.
  - Das ist eine Bewegung auf Tipp zu einem öffentlichen Ort wie der Cluster-Zoom. Die Kamera-Regel (ADR 0039: Start und neuer Startpunkt) bleibt unberührt. Das gilt auch auf der Merkliste: Sie startet weiter über alle Orte und fährt nie von selbst. Nur ein Tipp darf sie bewegen, wie schon der Cluster-Zoom (`docs/architecture.md`, E9).

### E6 – Merkliste und Anbieter

- **Merkliste:** `SavedView` reicht über `renderMap` dieselben Props durch. „Filter“ öffnet `saved-filter`, die Zahl kommt aus `savedMapStatusParts` bzw. „n gemerkte im Kartenausschnitt“. Die Karte startet weiter über alle Orte (Option a, Plan 0056).
- **Anbieter:** Ein Anbieter öffnet sein Sheet über der großen Karte, mehrere öffnen das Orts-Sheet. „Mehr von diesem Anbieter“ im Detail öffnet das Anbieter-Sheet wie bisher.
- Ein Wechsel des Tabs ist in der großen Karte nicht möglich, die Leiste ist verborgen. `onTab` und `ViewToggle` lassen `big` beim Wechsel fallen, falls sie doch erreicht werden (Popstate, Onboarding).

### E7 – Budgets

- **Start-JS:** Neu sind `BigMapBar`, der Groß-Knopf im Platzhalter, `openBig`/`closeBig`, das Routen-Feld und die Overlay-Prop. Erwartet sind ≈ +0,6 kB gzip.
- **Gemessen** (`pnpm size`, Basis 3ae0cb8): Start-JS 112,45 → 113,92 kB (+1,47), CSS 13,63 → 14,07 kB, `Karte JS` 429,98 → 430,52 kB, `Karte CSS` 10,77 → 10,82 kB. Die Zeile steht in ADR 0012.
- **Karten-JS:** Neu sind Auswahl-Layer, `revealOffset` und der Gesten-Effekt, ≈ +0,3 kB.
- **CSS:** ≈ +0,4 kB.
- Gemessen wird mit `pnpm size`. Die Zeile kommt in die Delta-Tabelle von ADR 0012.

### E8 – Tests

- **Unit:**
  - `route.test.ts`: `karte=gross` nur zu den drei Karten-Ansichten, Reihenfolge im Querstring, Rundweg.
  - `use-app-state.test.ts`: `openBig` legt einen Eintrag an, `closeBig` nimmt ihn zurück oder ersetzt ihn beim Deep-Link.
  - `reveal.test.ts`: oberhalb der Schwelle keine Bewegung, darunter Ziel 25 %, Ränder.
  - `layers` bzw. `geojson.test.ts`: Auswahl-Feature aus dem Schlüssel.
- **E2E**, neue Spec `e2e/karte-gross.spec.ts` (`tiles: "mock"`, `mapSettled`; Eintrag in `SPEC_COVERS`):
  1. „Entdecken“, Karte, „Groß“: `karte=gross` steht in der URL, der Rahmen füllt den Viewport, Tab-Leiste, Kopf und Liste sind nicht sichtbar, der Fokus liegt auf „Karte verkleinern“, die MapLibre-Leinwand hat Viewport-Größe, `cooperativeGestures` ist aus.
  2. Tipp auf einen Ort mit einem Angebot: Das Detail ist `over-map`, seine Oberkante liegt unter 30 % der Höhe, der Auswahl-Layer zeigt den Ort, der Punkt liegt über der Oberkante. Griff: `voll`. „×“: zurück zur großen Karte ohne Auswahl.
  3. „Zurück“ zweimal: erst Detail zu, dann klein; der Fokus liegt auf „Groß“, `cooperativeGestures` ist wieder an.
  4. `Esc` schließt die große Karte. Deep-Link `?ansicht=karte&karte=gross` startet groß. `?karte=gross` ohne Karten-Ansicht wird ignoriert.
  5. Ort mit mehreren Angeboten: Das Orts-Sheet öffnet über der großen Karte, eine Kachel öffnet das Detail `over-map`.
  6. Merkliste-Karte und Anbieter-Tab: „Groß“, Tipp, Sheet. Auf der Merkliste (Start über alle Orte, also nicht eingeschränkt) stimmt die Zahl unten links mit der Statuszeile der kleinen Karte überein. Eingeschränkte Ausschnitte zählen groß neu, weil groß mehr Fläche sichtbar ist (Review 2, M-c).
  7. `expectMobileUx` und axe (Review M5): große Karte, Detail halb und `voll`, Orts-Sheet, jeweils hell und dunkel, dazu 320 px mit 200 % Schrift und quer (844×390). Die Zahl unten links darf das Attributions-„i“ nicht überdecken.
  8. Privatsphäre: Öffnen und Schließen der großen Karte lösen keinen Request außer Kacheln aus.
  9. Ein-Finger-Drag per CDP-Touch auf `pixel-7` (wie Plan 0005): Groß verschiebt sich die Kartenmitte, klein nicht.
  10. `Esc` bei offenem Detail schließt nur das Detail, `karte=gross` bleibt.
  11. Merkliste groß, per Filter alles ausblenden: Die Karte bleibt mit 0 Orten stehen, „Karte verkleinern“ geht. Deep-Link groß mit abgebrochenem Karten-Chunk: Die Fehlermeldung steht im großen Rahmen, „Karte verkleinern“ geht.
  12. Scroll-Position: in „Entdecken“ unter der Karte scrollen, groß, klein, gleiche Position.
  13. Filter in der großen Karte setzen, verkleinern: Der Filter steht in URL und Liste (Review 2, N1).
- Die bestehenden Specs `karte.spec.ts`, `anbieter-karte.spec.ts` und `saved.spec.ts` laufen über `--affected` mit.

### E9 – Doku

- **`docs/architecture.md`:**
  - Privatsphäre: `karte=gross` steht neben `ansicht=` in der Liste dessen, was in die URL darf.
  - Karte: Vollbild per Klasse, kein Neuaufbau, Gesten nur klein kooperativ.
  - Mobile-UX: Auch die große Karte hat einen Weg ohne Karte, nämlich „Karte verkleinern“ und die Liste.
  - Privatsphäre, Merklisten-Karte: „fährt nicht von selbst; nur ein Tipp (Cluster, Ort in der großen Karte) bewegt sie“.
- **`docs/ideas.md`:** „Anbieterkarte groß“ entfällt. Neu kommen hinzu: kompakte Zeilen im Orts-Sheet der großen Karte (D3), Zeitraum-Chip in der Kopfleiste, „Zum Startpunkt“, Filter-Knopf im Tab „Anbieter“, Wischen am Griff.
- Ein ADR ist nicht nötig. Keine Entscheidung eines ADR ändert sich: Die Kamera-Regel bleibt, und die Gesten standen nur in Plan 0005, E7. Das prüft `/arch-review`.

## Schritte

1. Plan, `/plan-review`.
2. Test-first in der Domäne bzw. den reinen Funktionen: `route.ts`, `reveal.ts`, Auswahl-Feature, `shownSelection`. Danach `pnpm exec vitest related`.
3. `useRoute` (`openBig`/`closeBig`, Normalisierung), `App` (`BigMapBar`, Zahl, Props, Fokus, Scroll, Esc), `Overlays` (`overMap`). Danach `pnpm verify`.
4. Karten-Chunk: Groß-Knopf, Overlay-Slot, `big`, `selected`, Gesten, Auswahl-Layer, Reveal, Fehlertexte. Danach `pnpm verify`.
5. CSS: `map.css` (`.big`, Kopfleiste, Zahl, Groß-Knopf, Toast), `dialog.css` (`.detail.over-map`, `voll`, `.sheet.over-map`, Backdrop), `map-overrides.css` (Safe Areas der MapLibre-Elemente). Danach `pnpm verify`.
6. E2E-Spec und `SPEC_COVERS`, `pnpm verify`, `pnpm e2e:local e2e/karte-gross.spec.ts` und `pnpm e2e:local --affected`, beide im Hintergrund.
7. `/arch-review` (neues Modul, über 200 Zeilen) und `/browser-review` (Fixture-Build, volle Checkliste).
8. Commit, Push, CI grün, `/browser-review live`, archivieren.

## Review (2026-10-31) – Verdict: Überarbeiten → eingearbeitet

Reviewer: Subagent `plan-reviewer`, ohne Chat-Kontext.

**Übernommen:**
- **B1, leerer Bildschirm ohne Rahmen:** Verborgen wird nur mit `.map-box.big` im DOM (`:has`). Platzhalter und Fehlerzustände rendern groß samt Kopfleiste. Die Merkliste behält groß die Karte auch mit 0 Orten. Dazu E2E Nr. 11 (E2, E8). Statt einer reinen Funktion `bigShown` entscheidet das CSS am DOM. Das deckt jeden Fall ab, in dem keine Karte steht, auch künftige.
- **M1, Scroll-Position:** `scrollY` merken und wiederherstellen, mit E2E Nr. 12.
- **M2, `big` bleibt hängen:** Normalisierung in `setRoute`, `replace` mit Ansichtswechsel lässt `big` fallen, mit Unit-Test.
- **M3, `Esc`:** Der Handler prüft ausdrücklich auf einen offenen Dialog, mit E2E Nr. 10. Die falsche Begründung im Plan ist korrigiert.
- **M4, Punkt unter hohen Sheets:** `.sheet.over-map` ist höchstens so hoch wie das Detail. Damit gilt die eine Schwelle von 38 %, ohne Messen des Dialogs.
- **M5, Mobile-UX:** `expectMobileUx` für alle Zustände, große Schrift, quer. Dazu ein Ein-Finger-Drag per CDP.
- **M6, Fehlertexte:** eine eigene Variante für groß.
- **M7, Fokus:** `fallbackFocus` ist groß „Karte verkleinern“, `growRef` geht in den Chunk.
- **Minor:**
  - „Wischen“ ist gestrichen.
  - Die Scroll-Schwelle liegt bei 24 px.
  - Breite und Safe Areas des Sheets sind festgelegt.
  - Der Toast steht groß mittig.
  - `.onb-cover` bleibt sichtbar.
  - Die Invariante der Merklisten-Karte ist in E9 ergänzt.
  - Die lokalen Prüfungen stehen je Schritt.
  - Die Zahl der Merkliste nutzt dieselbe Funktion wie `SavedView` auf der Karte (`savedMapStatusParts(shown, total)`), mit denselben Argumenten.

**Abgelehnt bzw. erläutert:**
- **„Props in `map-types.ts` ausdrücklich auflisten“:** Die Props stehen als gemeinsames Interface `BigMapProps` in `map-types.ts`, das beide Screens erweitern. Die Platzhalter erhalten dieselben Props. Eine zweite Liste im Plan wäre doppelt.
- **„Umsetzung vor dem Review“:** stimmt. Während der Review lief, entstanden test-first die reinen Teile: Route samt Test, `revealOffset`, Auswahl-GeoJSON, `openBig`/`closeBig`. Keiner davon widerspricht einem Befund, angepasst werden sie nach diesem Abschnitt. `cooperativeGestures: !start.big` in `MapView` liest `big` aus den Props beim Aufbau (`start = latest.current`, also `MapViewProps`), nicht aus `StartCamera`. Danach schaltet ein Effekt um, wie in E2.

## Review 2 (2026-10-31) – Verdict: Überarbeiten → eingearbeitet

Reviewer: neuer Subagent `plan-reviewer` auf der überarbeiteten Fassung. B1 und M1–M7 tragen laut Review.

**Übernommen:**
- **N1, Filter gehen beim Verkleinern verloren (Blocker):** `afterBigClosed` in `onPop`, Unit-Test, E2E Nr. 13 (E1, E8).
- **M-a, Scroll nach einem Wechsel der Ansicht:** Die Ansicht wird mitgemerkt, zurückgescrollt wird nur in dieselbe (E2).
- **M-b, Detail-Sheet ohne Rahmen:** `bigShown` statt `big` für Overlays, Fokus und `Esc` (E2).
- **M-c, Zahl gegen Statuszeile:** nur im nicht eingeschränkten Fall verglichen (E8 Nr. 6).
- **Minor:**
  - Der Plan folgt dem Code: Normalisierung in `setRoute` und `replace`, `onScrolled` an `DetailContent`, Kommentar in `BigMapBar`.
  - Der Griff ist 44 px hoch.
  - Der Toast steht groß über der Zahl, auch mit Knopf.
  - Die veraltete Auswahl entfällt: Ist weder Sheet noch Overlay offen, gibt es keine Auswahl.
  - `voll` darf den Ort verdecken, das steht in den Nicht-Zielen.
  - Die Nummerierung in E8 ist korrigiert.
  - `SPEC_COVERS` nennt `BigMapBar` ausdrücklich.

**Abgelehnt:**
- **Begründung der Merklisten-Invariante erweitern:** steht schon in E5 und E9. Hochgefahren wird nur ein Ort, den man gerade angetippt hat und der damit schon sichtbar war. Es lädt höchstens Kacheln derselben Gegend. Der Text in `docs/architecture.md` sagt das bei der Umsetzung ausdrücklich.

Nach zwei Review-Runden (Grenze aus `/plan-review`) ist kein Blocker mehr offen. N1 ist im Code behoben und hat einen Test.

## Arch-Review (2026-10-31) – Verdict: Nacharbeit nötig, keine Blocker

**Übernommen:**
- **Major 1, Zeile in ADR 0012:** mit `pnpm size` gemessen und eingetragen.
- **Minor 1:** `bigMapStatusParts` in `format.ts` mit Test, statt der Verschachtelung in `App`.
- **Minor 2:** `strayBig` in `route.ts` mit Test, kein zweites Literal `"karte"`.
- **Minor 3:** Der Zustand „voll“ gilt je Angebots-ID (`fullFor`), ohne Effekt und ohne Zwischen-Frame.
- **Minor 4 und 5:** Der Plan folgt dem Code (Ringfarbe, z-Index, `onScroll`, CSS-Orte, Ideen).
- **Minor 6:** Neue Mobile-UX-Ansicht `anbieter-karte-gross-sheet`.
- **Minor 7:** Privatsphäre-Test auch für die große Merklisten-Karte mit Tipp und Hochfahren.

## Browser-Review (2026-10-31, lokal, Fixture-Build)

Screenshots `karte`, `karte-gross`, `karte-gross-detail` und `anbieter-gross` (neue Ansichten in `scripts/screenshots.ts`), 320–915 px, hell und dunkel. Die Interaktionen (Tipp, Griff, Esc, Zurück, Filter, Scroll, Ein-Finger-Geste) belegt `e2e/karte-gross.spec.ts`.

- **Befund 1:** Die Zahl unten links verdeckte die beim Öffnen ausgeschriebene Quellenangabe (`karte-gross-iphone-light`). Behoben: Sie steht darüber, solange die Angabe offen ist (`:has(.maplibregl-compact-show)`).
- **Befund 2:** Der Griff im Detail-Sheet war unsichtbar (`karte-gross-detail-iphone-light`), weil das `<span>` im Knopf inline blieb. Behoben mit `display: block`.
- **Checkliste:**
  - **Lesbarkeit:** Titel, Wann und Wo stehen im halben Sheet oben, der gewählte Ort liegt mit gelbem Ring darüber.
  - **Daumen:** „Karte verkleinern“ und „Filter“ stehen oben links, Zoom oben rechts. Das Sheet beginnt bei gut 38 %, Griff und Kopf sind mit dem Daumen erreichbar.
  - **Zustände:**
    - Laden und Fehler stehen im großen Rahmen (E2E Nr. 11).
    - Die leere Merkliste behält die Karte.
    - Lange Titel brechen um (320 px).
  - **Dunkel:** Es gibt keine hellen Inseln. Ring und Rand bleiben erkennbar, der Schleier ist leicht.
  - **Micro-Interactions:** „Groß“ und „Verkleinern“ haben einen Pressed-Zustand. Das Sheet fährt von unten herein, bei reduzierter Bewegung ohne Animation (`motion.css`).
  - **Design-System:** Pillen, Ränder und Schatten sind dieselben wie bei Chips und Sheets.
