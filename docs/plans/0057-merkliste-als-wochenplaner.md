# Plan 0057 – Merkliste als Wochenplaner: zwei Stufen, Abschnitte, Filter wie auf der Startseite

Status: in Umsetzung
Datum: 2026-10-30
Bezug:
- Plan 0025 (`docs/plans/archiv/0025-merkliste-als-planungszentrale.md`): Merkliste mit Liste | Karte | Kalender, eigener Filter (E6), Schnellwahlen „ab …“ (E7), keine Wegzeit-Grenze (E8), Export aller gemerkten (E9). Dieser Plan löst E6, E7, E8 und E9 teilweise ab.
- Plan 0028 (`docs/plans/archiv/0028-merkliste-altersgerecht.md`): Altersregel der Merkliste, bleibt.
- Plan 0043 (`docs/plans/0043-neu-eingestellt.md`): Sortiermenü der Startseite (`SortMenu`), „Nächstgelegen“ (E7).
- Plan 0023 (`docs/plans/archiv/0023-zeitraumfilter.md`): Zeitraum von/bis im Filter-Sheet.
- Plan 0008 (`docs/plans/archiv/0008-feinschliff.md`), E9: Toast ohne Bedienelement. Dieser Plan löst E9 für Toasts mit Aktion ab.
- ADR 0007 (`docs/adr/0007-merkliste-ics-im-browser.md`), ADR 0018 (`docs/adr/0018-ics-altersgerecht.md`): Sammel-ICS im Browser, Chunk-Request unabhängig vom Inhalt.
- ADR 0020 (`docs/adr/0020-teilen-per-link.md`), Punkt 8, und ADR 0022 (`docs/adr/0022-stabile-ids.md`), Punkte 8 und 10: künftiges Fragment `#merkliste=1.…`, IDs und Migration in der Hook-Schicht.
- ADR 0012 (`docs/adr/0012-startbudget-und-chunks.md`): Budgets.
- ADR 0037 (`docs/adr/0037-abos-mit-glocke.md`): Angebote behalten das Herz.
- Mockup: `docs/design/merkliste/` (Leinwand mit sieben Rahmen, darunter die bedienbare Demo `HerzDemo.dc.html`).

## Anlass

Wunsch des Nutzers vom 2026-10-30:

1. „Die Sortierung und Filtermöglichkeiten der Entdecken-Seite sollte es auch in der Merkliste geben. Per Default sollte der Kalender ausgewählt sein.“
2. Die Merkliste soll die Fragen einer jungen Familie beantworten, ausdrücklich:
   - „Was sind die Kurse später, zu denen ich mich jetzt frühzeitig schon anmelden sollte?“
   - „Was kann ich direkt machen?“
   - „Was gibt es Außergewöhnliches, also Einmaliges, wo ich mich langfristiger für anmelden muss oder kurzfristig dran denken muss?“

Nutzerentscheidungen im Gespräch und zum Mockup (2026-10-30):

- **a)** Zwei Stufen schon jetzt, als **Long- und Shortlist**: „vorgemerkt“ und „fest eingeplant“. Die App soll **nicht** den Eindruck erwecken, sie verwalte Buchungen. Es gibt also kein „angemeldet“ und kein „gebucht“.
- **b)** Die Stufen wechseln am **Herz** (Variante A): ein Tipp merkt vor, ein zweiter Tipp oder langes Halten plant fest ein, ein Tipp auf ein volles Herz entfernt. Dazu gehört eine Micro-Interaction: Das Herz bläst sich auf und wächst beim Halten. Die Demo (`HerzDemo.dc.html`) mit Stil „Funken“, Haltezeit 550 ms und vorgemerkt „halb voll“ ist freigegeben („Sieht super aus“).
- **c)** Die Merkliste öffnet die **zuletzt gewählte** Ansicht, beim ersten Mal den Kalender.
- **d)** Ein **Tageszeit-Filter** kommt dazu („super Idee“).
- **e)** Die **Karte bleibt**, wie sie ist (keine Kopplung an die Kalenderauswahl).
- **f)** Liste nach Handlungsbedarf, Filter-Sheet, Sortiermenü und Kalender wie im Mockup („Sieht super aus“).

## Befund

Stand `origin/main` `a5dc5b5`.

- **Speicher** (`src/data/preferences.ts`): `zwergenplan.merkliste` ist ein JSON-Array von IDs in Merk-Reihenfolge. `loadIds` verwirft alles, was kein Array von Strings ist, und liefert dann `[]`. `saveIds` entfernt den Schlüssel bei leerer Liste. Es gibt keine Höchstzahl. Migration und Prüfung laufen in `useSaved` (`src/ui/use-app-state.ts`) über `migrateSavedIds` (`src/domain/saved.ts`), nicht in `src/data` (ADR 0022, Punkt 10; ADR 0010).
  - Folge für einen Formatwechsel: Eine alte, vom Service Worker gecachte App-Version läse ein Objekt als `[]`, zeigte eine leere Merkliste und überschriebe den Schlüssel beim nächsten Herz-Tipp.
  - 22 Stellen in 12 E2E-Specs belegen `zwergenplan.merkliste` direkt als Array.
- **Herz**: `HeartButton` (`src/ui/OfferCard.tsx`) mit `aria-pressed` (boolesch) und `aria-label` „<Titel> merken“. Es steht in jeder Kachel und mit `inline` im Detail (`src/ui/DetailDialog.tsx`). Die Animation `slap` hängt am Zustand (`.heart[aria-pressed="true"] .hs` in `src/ui/styles/card.css`) und bleibt bewusst unter 44 px, weil Chrome eine größere Ausdehnung als Seitenüberlauf zählt. Toasts in `App.tsx`: „Gemerkt – liegt jetzt auf deiner Merkliste“ bzw. „Nicht mehr gemerkt“.
- **Toast** (`src/ui/Toast.tsx`, `src/ui/styles/sheet.css`): reine Meldung mit `pointer-events: none` (Plan 0008, E9; geprüft per `elementFromPoint` in `e2e/layout.spec.ts`), 2,8 s sichtbar, keine Aktion.
- **Geräte-APIs**: Biome verbietet `navigator` außerhalb von `src/data` (`biome.json`, `noRestrictedGlobals`).
- **Wer liest die Merkliste**: nur die App im Vordergrund (`useOfferViews`, Badge, `SavedView`, `SavedCalendar`, Export). Teilen (`src/domain/share.ts`), Push und Service Worker lesen sie nicht (ADR 0014).
- **Startseiten-Filter**: `FilterState` (`src/domain/filter.ts`) hängt über `Route.filter` an der URL. `applyFilters` filtert hart (`matchesFilter` je Angebot, Zeitraum über `inDateRange`). `FilterSheet` (`src/ui/Sheets.tsx`), `QuickFilters` und `Stickers` (`src/ui/Chrome.tsx`) sind reine Prop-Komponenten, typisiert auf `FilterState`. Das Sheet ist genau einmal in `src/ui/Overlays.tsx` eingehängt, fest an `route.filter`.
- **Merklisten-Filter heute**: `SavedFilter { formats, registration, range? }` mit `asFilterState`, `applySavedFilter`, `SavedFilterChip`, `toggleSavedFilter`, `isSavedFilterChipOn` (`src/domain/saved.ts`). Keine eigene Filterlogik; der Zustand lebt als React-State in `App`, nicht in der URL. Die Chipzeile ist `src/ui/SavedFilters.tsx`.
- **Wegzeit** (`docs/architecture.md`, Abschnitt Wegzeit): `want()` lädt die Tabelle nur beim Öffnen von Kind-Sheet oder Karte, im Onboarding-Schritt „Weg“, auf „Nochmal laden“ oder beim Start mit gespeichertem Startpunkt. Die Sortierung „Nächstgelegen“ ist **kein** Anlass (`e2e/sortierung.spec.ts`). „Die Merkliste … kennt keine Wegzeit-Grenze und wartet nie (Plan 0025, E8).“
- **Uhrzeiten**: `Session { start, end }` mit Offset (`src/domain/schema.ts`). Berliner Uhrzeit liefern `src/domain/time.ts` und `src/domain/labels.ts`. Eine Tageszeit gilt **je Termin**. `shownSession` (`src/domain/agenda.ts`) nimmt ein weiches Prädikat `fits` (Altersregel): Passt kein Termin, fällt es auf den nächsten zurück (`?? base`). Ein solches Prädikat filtert also kein Angebot heraus.
- **Sortierung**: `SORTS = ["neu", "nah"]` (`src/domain/route.ts`), `SortMenu` ist generisch (`src/ui/SortMenu.tsx`). `groupByNextSession`, `groupByListing`, `groupByReach` liefern `ListGroup` mit Kopf (`src/domain/listing.ts`), gerendert in `src/ui/ListView.tsx`. „Nächstgelegen“ wartet mit `listWaits` auf die Tabelle und zeigt bis dahin „Wovon aus gerechnet?“.
- **Darstellungen**: Routen `merkliste`, `merkliste-karte`, `merkliste-kalender`. Der Tab-Knopf (`Chrome.tsx`, `App.onTab`) öffnet immer `merkliste` (Liste).
- **Kalender** (`src/ui/SavedCalendar.tsx`): Die Wochenleiste zeigt je Tag bis zu drei Kategorie-Formen. Die Agenda listet nur Tage mit Terminen. Für einen gewählten leeren Tag gibt es schon „Für diesen Tag entdecken“ (`discoverRange` in `App.tsx`, setzt `von`/`bis` und lässt andere Startseiten-Filter stehen).
- **Export**: nur in der Liste (`SavedView.tsx`), immer alle gemerkten (Plan 0025, E9; `docs/architecture.md`, Abschnitt „Export der Merkliste“). Bei null passenden Terminen wird der Chunk trotzdem angefordert (ADR 0018).
- **Daten** (425 Angebote, 2026-10-30): 225 Kurse (224 mit Anmeldung), 147 regelmäßige (54 ohne Anmeldung), 53 einmalige (52 mit Anmeldung). Das Anmeldefenster `registrationWindow` ist bei **0** Angeboten gefüllt. Der Platzstatus ist bei 149 bekannt.
- **Budgets** (ADR 0012, zuletzt nach Plan 0054): JS (initial) 105,29 von 150 kB, CSS 12,47 von 15 kB, Service Worker 9,10 von 12 kB.

## Ziel

Die Merkliste wird zum **Wochenplaner mit Long- und Shortlist**:

- **Kalender**, die Startansicht: Wann gehen wir hin? Was ist diese Woche noch frei?
- **Liste**: Was muss ich tun? Gegliedert nach „Demnächst“, „Rechtzeitig anmelden“, „Spontan möglich“, „Läuft gerade“.
- **Karte**: Wo ist das? Bleibt, wie sie ist.

Filter und Sortierung bedienen sich wie auf der Startseite. Ein Tageszeit-Filter kommt auf beiden Seiten dazu.

## Nicht-Ziele

- **Keine Buchungsverwaltung.** Kein „angemeldet“, „gebucht“, „bezahlt“ und keine Fristen-Erinnerung. „Fest eingeplant“ heißt nur: Das wollen wir machen.
- **Kein Push zur Merkliste.** Push liest die Merkliste weiterhin nicht (ADR 0014).
- **Tageszeit nicht in Such-Abos und Push.** `searchOf` streicht die Tageszeit wie den Zeitraum. Die Übernahme steht in `docs/ideas.md` (S6).
- **Keine Anmeldefristen.** Das Anmeldefenster fehlt in den Daten (Befund), und die Quellen nennen es selten (Nutzerentscheid U4). „Rechtzeitig anmelden“ sortiert deshalb nach Beginn.
- **Karte unverändert** (Entscheidung e), bis auf die neue Filterbedienung, die auch für sie gilt.
- **Merklisten-Filter und -Sortierung nicht in URL und nicht im `localStorage`**, wie bisher (Plan 0025, E6). Sie leben als React-State in `App` und überstehen Tab- und Darstellungswechsel, nicht das Neuladen.
- **Kein neuer Anlass für die Wegzeit-Tabelle.** Auch auf der Merkliste lädt sie nur bei den Anlässen aus `docs/architecture.md`.
- **Startseite**: Außer dem Tageszeit-Abschnitt im Filter-Sheet und dem Herz-Zyklus ändert sich dort nichts. Ihre Chipzeile bekommt keine Tageszeit-Chips.
- **Teilen der Merkliste** (ADR 0020, Punkt 8) ist nicht Teil dieses Plans. Die Stufen gehen dort später in ein Format v2 ein oder werden bewusst nicht übertragen (E1).

## Entscheidungen

### E1 – Speicher: Array bleibt, zweiter Schlüssel nur für „vorgemerkt“

- `zwergenplan.merkliste` bleibt unverändert das Array **aller** gemerkten IDs in Merk-Reihenfolge.
- Neuer Schlüssel `zwergenplan.merkliste-vorgemerkt` (`KEYS.tentative` in `src/data/preferences.ts`, `loadTentative`/`saveTentative` über `loadIds`/`saveIds`): ein Array der IDs, die nur **vorgemerkt** sind. Er ist immer eine Teilmenge der Merkliste, eine leere Liste entfernt ihn.
- **Fest eingeplant** ist jede gemerkte ID, die nicht vorgemerkt ist (Nutzerentscheid U2). Dafür gibt es drei Gründe:
  - Bestehende Merklisten brauchen keine Migration. Alles bisher Gemerkte gilt als fest eingeplant, Export, Kalender und Badge verhalten sich für sie wie heute.
  - Eine alte gecachte App-Version liest das Array weiter richtig. Sie kennt nur keine Stufen und behandelt alles als gemerkt. Entfernt sie eine ID, bleibt sie höchstens als verwaiste Vorgemerkt-ID stehen, und die Bereinigung räumt sie beim nächsten Start der neuen Version ab.
  - Die 22 E2E-Stellen, die das Array belegen, bleiben gültig. Sie belegen damit „fest eingeplant“.
- **Bereinigung** in `useSaved` (Hook-Schicht, ADR 0022, Punkt 10):
  - beim Laden `migrateSavedIds` auf beide Listen;
  - die Vorgemerkt-Liste geschnitten mit der Merkliste;
  - zurückgeschrieben nur bei Änderung, wie heute.
- **Reine Funktionen** in `src/domain/saved.ts`:

```ts
/** Stufe eines Angebots auf der Merkliste (Plan 0057, E1) */
export type SavedStage = "aus" | "vorgemerkt" | "fest";
export interface SavedState { ids: readonly string[]; tentative: readonly string[] }
export function stageOf(state: SavedState, id: string): SavedStage;
/** Tipp aufs Herz: aus → vorgemerkt → fest → aus */
export function cycleStage(state: SavedState, id: string): SavedState;
/** Halten oder „Rückgängig“: Stufe direkt setzen; „aus“ entfernt aus beiden Listen */
export function withStage(state: SavedState, id: string, stage: SavedStage): SavedState;
export function cleanSavedState(state: SavedState): SavedState;
```

  - Neu gemerkte IDs hängen hinten an `ids` an, wie `toggleId` heute. Ein Wechsel zwischen „vorgemerkt“ und „fest“ ändert die Reihenfolge nicht („Zuletzt gemerkt“, E6). „Rückgängig“ nach dem Entfernen hängt die ID wieder hinten an; die alte Stelle ist verloren (bewusst, keine Positionsbuchhaltung).
- `useSaved` liefert `{ state, stage(id), cycle(id), setStage(id, stage) }`. `cycle` und `setStage` speichern sofort und liefern die neue Stufe.
- `docs/architecture.md`, Abschnitt Privatsphäre: Die Liste der `localStorage`-Schlüssel bekommt `.merkliste-vorgemerkt`. Er verlässt das Gerät nie und steht nie in IndexedDB, wie die Merkliste.
- **Teilen (später)**: Das Fragment v1 aus ADR 0020, Punkt 8 kennt keine Stufen. ADR 0040 hält fest, dass ein Import alles als „vorgemerkt“ übernimmt, bis ein Format v2 die Stufen trägt.

### E2 – Herz mit drei Stufen und Micro-Interaction

Vorbild ist die freigegebene Demo `docs/design/merkliste/HerzDemo.dc.html` mit Stil „Funken“, Haltezeit 550 ms und vorgemerkt „halb voll“. Abweichungen von der Demo sind unten genannt (Größen, Ereignisse).

- **`HeartButton`** (`src/ui/OfferCard.tsx`) bekommt `stage: SavedStage` statt `saved`, dazu `onCycle` und `onHold`.
  - `aria-pressed`: `false` (aus), `"mixed"` (vorgemerkt), `true` (fest). Das ist das ARIA-Muster für einen Dreifach-Schalter. Screenreader sagen „teilweise gedrückt“ bzw. „gedrückt“.
  - `aria-label` bleibt „<Titel> merken“, damit Ansage und E2E-Locator stabil bleiben. Die Wirkung sagt der Toast an (E3).
- **Aussehen**:
  - aus: Herz als Umriss auf weißem Grund (wie heute);
  - vorgemerkt: **halb gefülltes** Herz (neues Icon `heartHalf` in `src/ui/icons.tsx`: Umriss plus gefüllte untere Hälfte als eigener Pfad, ohne `clipPath` und IDs) auf hellem Rosa (`--heart-tentative` in `src/ui/styles/tokens.css`, hell und dunkel);
  - fest: volles Herz auf Koralle (wie heute gemerkt).
- **Ereignisse** (Review M2, Review 2 M4): Die Logik steckt als reine Zustandsmaschine `heartGesture` in `src/ui/heart-gesture.ts` mit Unit-Test. Der Knopf verdrahtet nur Ereignisse und Timer.
  - **`click` ist der einzige Tipp-Pfad** (`cycle`), gleich ob Maus, Touch, Tastatur, Screenreader, Schalter- oder Sprachsteuerung. So wirkt jede Aktivierung, auch eine ohne vorangehende Zeiger-Folge.
  - Zeiger-Ereignisse dienen nur dem **Halten**:
    - `pointerdown` (Hauptknopf) merkt Startpunkt und Zeit. Bei Stufe „aus“ oder „vorgemerkt“ startet er den Halte-Timer (**550 ms**) und setzt die Klasse `holding`. Er setzt außerdem ein noch stehendes Verschluck-Flag zurück.
    - `pointermove` mit mehr als **10 px** Abstand vom Startpunkt bricht ab. Statt `pointerleave`, das bei Touch wegen des impliziten Pointer-Capture nicht feuert.
    - `pointerup` vor Ablauf und `pointercancel` beenden nur das Halten (Klasse weg, Timer aus). Den Tipp liefert der folgende `click`.
  - **Ablauf des Timers**: `setStage(id, "fest")` mit `pop-big`, Vibration, Toast. Das Verschluck-Flag wird gesetzt, damit der `click` nach dem Loslassen nicht noch einmal schaltet.
  - Das Flag schluckt genau einen `click`. Es fällt beim nächsten `pointerdown` oder **600 ms nach `pointerup` bzw. `pointercancel`** (Review 3 B2), nie vorher: Wer 2 s hält, verliert das Flag also nicht, bevor sein `click` kommt. Kommt nach dem Loslassen kein `click` (etwa nach einem System-Long-Press), fällt es nach den 600 ms und schadet nicht.
  - `contextmenu` wird am Herz verhindert. Der Knopf hat `touch-action: manipulation`, `user-select: none` und `-webkit-touch-callout: none`.
  - Bei Stufe „fest“ startet kein Halten, der Tipp entfernt. Ein vorgemerktes Angebot ist also mit zwei Tipps entfernt (über „fest“). Das ist die Folge des Zyklus (Entscheidung b); „Rückgängig“ fängt Fehltipps ab (E3).
- **Animationen** (Review M4): Die Klasse `pop-small`, `pop-big` bzw. `deflate` setzt nur der Handler, nach einer Nutzeraktion; `animationend` und `animationcancel` entfernen sie. Beim Rendern, beim Wechsel der Darstellung und bei „Rückgängig“ läuft keine Animation. Die Animation `slap` entfällt für das Herz.
  - **Glocke unberührt** (Review 2): Die Glocke nutzt die Klasse `.heart` mit (`BellButton`). Alle neuen Regeln (Stufen, `holding`, Ring, Funken, Animationen) gelten nur für `.heart:not(.bell)`, `slap` bleibt für die Glocke.
  - **Reduzierte Bewegung erkennen**: `src/ui/styles/motion.css` setzt voraus, dass niemand auf `animationend` hört, denn dort feuert keins. Der Handler fragt deshalb `matchMedia("(prefers-reduced-motion: reduce)")` und setzt bei „reduce“ gar keine Animationsklasse. Der Kommentar in `motion.css` wird um diese Stelle ergänzt.
  - `pop-small` (aus → vorgemerkt): 1 → 1,3 → 0,92 → 1, 0,45 s.
  - `pop-big` (→ fest): 1,25 → 1,7 → 0,88 → 1, 0,6 s, dazu acht „Funken“ (Punkte in Koralle und Gelb) bis höchstens 34 px von der Mitte.
  - `deflate` (fest → aus): 1 → 0,6 → 1, 0,35 s.
  - `holding`: Das Herz wächst über die Haltezeit auf 1,5, ein Ring (Durchmesser 60 px) füllt sich.
  - **Grenzen**: Die Mitte des Herzens liegt 50 px vom rechten Rand des Viewports (16 px Rand der Liste, 10 px Abstand in der Kachel, 24 px halbe Knopfbreite). Herz bei 1,7 (41 px halbe Breite), Ring (30 px) und Funken (34 + 4 px) bleiben innerhalb. Zusätzlich trägt die Ebene der Funken `contain: paint` auf einem 96-px-Kasten um den Knopf, und Liste und Kalender tragen `overflow-x: clip`.
  - Im Detail (`inline`) und im Orts-Sheet gilt dasselbe. Das Browser-Review prüft die Fälle.
- **Vibration** (Review M3): `src/data/haptics.ts` (neu) mit `vibrate(ms)` über eine injizierbare API (Standard `navigator.vibrate`, sonst nichts) und Unit-Test. 8 ms beim Vormerken, 25 ms beim Festeinplanen. iOS hat keine, das ist in Ordnung.
- **Reduzierte Bewegung**: `src/ui/styles/motion.css` schaltet Animationen und Transitions global ab. Die Handler setzen dann keine Animationsklasse. Funken entfallen. Das Halten wirkt trotzdem; der Ring erscheint dann sofort voll als statischer Rand, damit das Halten eine Rückmeldung hat.
- Das Herz ist überall dasselbe: Kachel, Detail, Merkliste, Kalender, Orts-Sheet der Karte, Anbieter-Sheet.

### E3 – Toasts mit „Rückgängig“

- `Toast` und `useToast` bekommen eine optionale Aktion: `say(text, { ms, tone, action: { label, run } })`. Die bestehende Signatur `say(text, ms?, tone?)` bleibt als Überladung.
- **Bedienbar** (Review M1, löst Plan 0008, E9 für Toasts mit Aktion ab):
  - Der Toast behält `pointer-events: none`, nur der Aktionsknopf bekommt `pointer-events: auto`. Er ist ≥ 44 px hoch.
  - **Nicht über der Herz-Spalte** (Review 2 M3): Ein Toast mit Aktion steht links (16 px Rand) und endet mindestens **96 px** vor dem rechten Rand des Viewports. Die Herzen liegen mit Ring bis 80 px vom Rand. Wer nach dem Tipp weiterscrollt und das nächste Herz tippt, trifft also nie „Rückgängig“. Der Knopf steht am rechten Ende dieses schmaleren Toasts, der Text bricht dafür eher um.
  - Ein Toast mit Aktion steht 6 s statt 2,8 s. Solange der Knopf Fokus hat, läuft die Zeit nicht ab; nach dem Blur beginnt sie neu. Hover hält ihn nicht (sonst bliebe er unter einem Mauszeiger stehen). Die 6 s sind für Zeiger gedacht.
  - **Tastatur und Screenreader** (Review 3 M3): Der Toast steht im DOM nach der Tab-Leiste und ist per Tab in 6 s kaum erreichbar. Der Weg dort ist das Herz selbst: Der Fokus bleibt am Herz, und weiteres Drücken schaltet weiter (aus → vorgemerkt → fest → aus). Das macht jede Stufe auch ohne „Rückgängig“ wiederherstellbar. Ein Anspruch auf WCAG 2.2.1 für den Toast wird deshalb nicht erhoben.
  - Nach „Rückgängig“ geht der Fokus aufs auslösende Herz zurück, nicht auf `<body>`.
  - **Schmal und mehrzeilig**: Der Toast mit Aktion bricht mit `flex-wrap` um. Passt der Knopf nicht neben den Text (320 px bei 200 %), steht er darunter.
  - Die Live-Region bleibt, der Fokus wird beim Erscheinen nicht verschoben.
  - `e2e/layout.spec.ts` prüft weiter, dass Tipps neben dem Knopf durch den Toast hindurch gehen, dass der Knopf selbst trifft, und dass `elementFromPoint` auf der x-Koordinate der Herzen über die ganze Höhe des Toasts nie den Toast trifft.
- **Texte** (reine Funktion `stageToast(stage)` in `src/ui/format.ts`, mit Test; Feinschliff mit `design:ux-copy`):
  - vorgemerkt: „Vorgemerkt. Nochmal tippen oder halten: fest einplanen.“
  - fest: „Fest eingeplant – steht im Kalender.“
  - aus: „Nicht mehr gemerkt.“
- **„Rückgängig“** steht an jedem der drei Toasts und setzt die vorige Stufe mit `setStage`, ohne Animation. Danach kommt der Toast „Rückgängig gemacht.“ ohne Aktion.

### E4 – Was „vorgemerkt“ und „fest“ bewirken

| Wo | vorgemerkt | fest eingeplant |
|---|---|---|
| Badge im Tab | zählt | zählt |
| Liste (Abschnitte) | steht drin, Herz halb | steht drin, Herz voll |
| Kalender, Wochenleiste | Form nur als Umriss (Strich in der Textfarbe, 2 px) | Form wie heute, gefüllt |
| Kalender, Agenda | Karte ohne Schatten, Rand gedämpft, Etikett „vorgemerkt“ | Karte wie heute |
| Chip „Nur fest eingeplant“ | ausgeblendet | sichtbar |
| Export (ICS) | **nicht** | ja |
| Karte | Ort wie heute | Ort wie heute |

- Der gestrichelte Rand bleibt dem Fall „passt nicht zum Alter“ vorbehalten (Plan 0028), „vorgemerkt“ nutzt ihn nicht.
- Die Umriss-Formen sind Grafik (WCAG 1.4.11, 3:1). Ein Strich in der Textfarbe erfüllt das in hell und dunkel; eine blasse Deckkraft hätte es voraussichtlich nicht (Review 3). Das Browser-Review prüft es in S5.
- **Export nur fest** löst Plan 0025, E9 ab. Er gilt in Liste und Kalender (E9 unten). Name des Knopfs: „Fest Eingeplantes in meinen Kalender“.
  - `collectionExport` bekommt die festen Angebote und zusätzlich die Zahl der vorgemerkten. Der Toast nach dem Export nennt sie: „… · 3 vorgemerkte sind nicht in der Datei.“ (`collectionToast`).
  - Ist nichts fest eingeplant, kommt der Hinweis „Noch nichts fest eingeplant. Tippe nochmal aufs Herz.“ (`tone: "hint"`). Der Export-Chunk wird trotzdem angefordert (Muster aus ADR 0018: Der Request verrät nicht, ob etwas fest eingeplant ist).
  - Die VEVENTs und UIDs bleiben, wie sie sind (ADR 0007). Nur die Menge der Angebote ändert sich.

### E5 – Filter der Merkliste wie auf der Startseite

- **Zustand**: `SavedFilter` wird zu `{ filter: FilterState; onlyFixed: boolean }` (`EMPTY_SAVED_FILTER`). Er lebt weiter als React-State in `App`.
  - `applySavedFilter(offers, saved: SavedFilter, state: SavedState, now, opts: { useRange: boolean; reach?: FilterContext["reach"] })` filtert über `applyFilters` (mit `runningCourses: true` wie heute, mit `reach` für die Wegzeit-Grenze) und danach `onlyFixed`.
  - `matchesSavedFilter` (für `endedToday` in `use-offer-views.ts`, „heute schon vorbei“) prüft zusätzlich `onlyFixed`, die Tageszeit aber nicht; sie wirkt dort je Termin (E7, Kalender je Termin).
  - **Alters-Markierung** (Review 3 M2): Die Merkliste markiert unpassende Angebote heute über `unfitIds` ohne Zeitraum. Neu: `savedUnfitIds` aus `offerFitsAgeIn` mit der Regel des Merklisten-Filters (`range` nur ohne Kalender, `daytimes`). So trägt ein regelmäßiges Angebot, dessen gezeigter Nachmittagstermin nicht passt, die Markierung.
  - Ein Zeitraum (`range`) wirkt in Liste und Karte, nicht im Kalender (dort ist die Auswahl der Zeitraum, wie heute).
  - Wegzeit siehe E7a.
  - `asFilterState`, `SavedFilterChip`, `toggleSavedFilter`, `isSavedFilterChipOn` und `savedFilterCount` entfallen (knip). `activeFilterCount` aus `filter.ts` plus 1 für `onlyFixed` zählt das Badge.
- **Chipzeile** der Merkliste (ersetzt `SavedFilters`): `QuickFilters` (`src/ui/Chrome.tsx`) bekommt einen Prop `chips: readonly QuickChip[]` statt der fest verdrahteten Startseiten-Chips. Ein `QuickChip` ist `{ label, on, toggle }`. Die Startseite übergibt ihre fünf Chips wie heute; die Merkliste übergibt:
  - Nur fest eingeplant
  - Vormittags
  - Nachmittags
  - Davor steht wie auf der Startseite der Knopf „Filter“ mit Badge. Die Zahl im Badge kommt als Prop `count` (heute zählt `QuickFilters` selbst aus `filter`); die Startseite übergibt `activeFilterCount(filter)`, die Merkliste zusätzlich +1 für `onlyFixed`. Keine Sticker-Zeile und keine Glocke auf der Merkliste.
- **Filter-Sheet**: dasselbe `FilterSheet`, ein zweites Mal in `Overlays.tsx` eingehängt als `SheetKind` `"saved-filter"`, mit eigenem `filter`, `onChange`, `onReset` und `resultCount`.
  - Ein neuer Prop `variant: "start" | "merkliste"` steuert Abschnitte und Texte. Für `merkliste` kommen `onlyFixed` und `onOnlyFixed` als eigene Props dazu. Der Typ bleibt `FilterState`, es gibt keine generische Form.
  - Überschrift „Merkliste filtern“.
  - Abschnitte: **Merkliste** (Alle gemerkten · Nur fest eingeplant), **Tageszeit**, Art, Format, Anmeldung, Kosten, **Zeitraum** (Schnellwahlen „ab Nov./Dez./Jan.“ aus `quickRanges` plus von/bis; im Kalender ausgeblendet mit Hinweis), Wegzeit.
  - **Kein Alter-Abschnitt**: Die Merkliste folgt weiter Plan 0028. Gemerktes „für später“ bleibt markiert sichtbar.
  - Der Fuß sagt „N gemerkte zeigen“.
- **Leerzustand** bei Filter, der alles ausblendet: wie heute (`savedFilteredEmpty`, „Filter zurücksetzen“).
- `src/ui/SavedFilters.tsx` entfällt samt Eintrag in `scripts/lib/e2e-map.ts`.

### E6 – Sortierung der Merkliste

- Ein Sortier-Knopf (`SortMenu`) steht rechts neben dem Umschalter, **nur in der Liste**, wie auf der Startseite.
- Optionen (Typ `SavedSort` in `src/domain/saved.ts`):

| Wert | Titel | Untertitel | Darstellung |
|---|---|---|---|
| `zutun` (Standard ab S4, Knopf ungefüllt) | Was ist zu tun | Demnächst, anmelden, spontan, läuft | Abschnitte (E8) |
| `termine` (Standard in S3) | Nächste Termine | was als Nächstes stattfindet | `groupByNextSession`, Tagesköpfe wie auf der Startseite |
| `nah` | Nächstgelegen | wie auf der Startseite (`nearSortSub`) | `groupByReach` |
| `gemerkt` | Zuletzt gemerkt | was du zuletzt gemerkt hast | eine Gruppe ohne Kopf, `ids` rückwärts |

- Alle vier Darstellungen rendert `ListView`. Dafür bekommt es den Prop `numbered` (wie `OfferCard numbered`, „Termin 3 von 8“ aus `6a9e806`), den die Merkliste heute direkt an `OfferCard` gibt, und `ListGroupHead` die Art `{ kind: "flach" }` für „Zuletzt gemerkt“ (kein sichtbarer Kopf, eine Gruppe).
- Der Zustand lebt als React-State in `App` neben dem Filter. Nach der Wahl springt die Liste nach oben (wie `onSort` der Startseite).
- „Nächstgelegen“ siehe E7a.

### E7 – Tageszeit-Filter auf Startseite und Merkliste

- **Typ** in `src/domain/filter.ts`: `type Daytime = "vormittags" | "mittags" | "nachmittags"` und `FilterState.daytimes: Daytime[]` (Mehrfachwahl, Teil von `LIST_DIMENSIONS`).
- **Grenzen** nach dem Beginn des Termins in Berliner Zeit: vormittags vor 12:00, mittags 12:00 bis vor 15:00, nachmittags ab 15:00. Der Hinweis im Sheet sagt das: „Beginn vor 12 Uhr, 12–15 Uhr, ab 15 Uhr“.
- **Harter Filter** (Review B1, Review 2 B1): Kandidaten-Termine folgen der Zeitraum-Regel aus Plan 0023 (`rangeSession` in `src/domain/date-range.ts`), die Tageszeit kommt am selben Termin dazu:
  - **Kurs**: einziger Kandidat ist der Kursbeginn (`sessions[0]`), auch wenn er schon beendet ist. Er muss im Zeitraum liegen (falls gesetzt) und in der Tageszeit. Ein Kurs, der vor dem Zeitraum beginnt, fällt also weiter heraus, auch mit Tageszeit.
  - **Regelmäßig und einmalig**: Kandidaten sind die nicht beendeten Termine, die im Zeitraum (falls gesetzt) und in der Tageszeit liegen.
  - Ein Angebot passt, wenn es einen Kandidaten hat.
  - Umgesetzt als `candidateSessions(offer, now, range?, daytimes?)` in `src/domain/date-range.ts` neben `rangeSession`. `rangeSession` wird damit `candidateSessions(…)[0]` ohne Tageszeit und behält sein Verhalten (Tests in `filter.test.ts` und `e2e/saved.spec.ts` zu „Kurse mit Beginn ab dann“ bleiben grün).
  - `applyFilters` prüft „hat einen Kandidaten“ statt `inDateRange` allein. Damit stimmen Liste, Statuszeile, Karte und Anbieter-Tab überein, die alle über `applyFilters` gehen.
  - `matchesFilter` (je Angebot, ohne Terminbezug) bleibt unverändert. Es kennt die Tageszeit nicht, deshalb ist sie nicht Teil von Such-Abos (Nicht-Ziele).
- **Anker und gezeigter Termin sind getrennt** (Review 3 B1): Die Kandidaten entscheiden nur, **ob** ein Angebot passt. **Welcher** Termin auf der Kachel steht, entscheidet `shownSession(offer, now, { range, daytimes }, fits?)`:
  - **Kurs mit Zeitraum**: der Kursbeginn, wie heute (`rangeSession`).
  - **Kurs ohne Zeitraum** (auch mit Tageszeit): `nextSession` wie heute. Die Tageszeit prüft nur der Filter am Kursbeginn. Ein laufender Kurs steht also weiter am nächsten Termin mit „Termin 3 von 8“ (`6a9e806`).
  - **Regelmäßig und einmalig**: der erste Kandidat, der auch die weiche Altersregel `fits` erfüllt, sonst der erste Kandidat.
  - Ohne Zeitraum und Tageszeit gilt das heutige Verhalten.
  - `groupByNextSession`, `groupByListing`, `groupByReach`, `rangeAgenda` (Kopf) und `savedOffers` reichen `{ range, daytimes }` durch.
  - **Detail**: `openOnDay` (`App.tsx`) gilt auch, wenn nur eine Tageszeit gesetzt ist, auf Startseite und Merkliste. Das Detail hebt so den Termin der Kachel hervor.
- **Kalender je Termin** (Review 3 M1): Im Kalender wirkt die Tageszeit als Prädikat **je Termin**, nicht über die Kandidaten. `inDaytime(daytimes): SessionFit | undefined` in `src/domain/filter.ts` wird mit `savedFits` (Altersregel) verknüpft und geht an `sessionsByDay` für `index` und `ageIndex`, nicht für `allIndex`, und an `endedOnDay`. Ein Kurs steht im Kalender also an allen Terminen in der Tageszeit, nicht nur am ersten. `ageHidden` zählt nur, was das Alter verdeckt.
- **„Heute schon vorbei“** (`endedToday` in `use-offer-views.ts`): Es zählt beendete Termine von heute je Termin mit `inDaytime`. `matchesSavedFilter` bleibt ohne Terminbezug und prüft die Tageszeit **nicht** (sonst fiele ein Angebot heraus, dessen einziger Termin heute schon vorbei ist; Plan 0025, B2).
- **Alterssichtbarkeit** (Review 2 M1): `offerFitsAgeIn` und `ageVisibility` (`src/domain/age.ts`) bekommen statt `range` dieselbe Regel `{ range, daytimes }`. Ein regelmäßiges Angebot passt dann nur über einen passenden Termin **in der Tageszeit**. Sonst stünde bei „nachmittags“ ein unpassender Nachmittagstermin ohne Markierung in der Liste, während nur ein Vormittagstermin passt (dieselbe Fehlerklasse wie Plan 0053, E2).
- **URL** (nur Startseite): `tageszeit=vormittags,nachmittags` über `PARAMS` in `filter.ts`. Ein unbekannter Wert wird verworfen.
- **Such-Abo**: `searchOf` (`src/domain/searches.ts`) streicht `daytimes` wie `range`. Die Glocke erscheint deshalb nicht, wenn nur die Tageszeit gewählt ist. Abonniert man mit gesetzter Tageszeit (plus einem anderen Filter), sagt der Abo-Toast es: „Suche abonniert, ohne Tageszeit.“ (`aboToast` in `src/ui/format.ts`, mit Test). `news.ts` ändert sich nicht. Der Service Worker bündelt `filterFromSearch` (`src/sw/push-tailor.ts`) und damit `PARAMS` samt `tageszeit` mit; er wächst also um wenige Bytes, gemessen in S2 (Budget 12 kB).
- **Startseite**: Abschnitt „Tageszeit“ im Filter-Sheet zwischen Alter und Art. Er zählt im Badge des Knopfs „Filter“ mit.
- **Merkliste**: Chips „Vormittags“ und „Nachmittags“ in der Chipzeile, alle drei im Sheet.

### E7a – Wegzeit auf der Merkliste (Review M5)

Die Liste der Merkliste übernimmt das Verhalten der Startseite (`App.tsx`: `listPending`, `listWaits`, `askOrigin`), ohne neuen Lade-Anlass. **Kein `want()`**: Weder die Wegzeit-Grenze noch „Nächstgelegen“ lösen das Laden aus. Die Tabelle ist da, wenn ein Startpunkt gespeichert ist (Laden beim Start, ADR 0017) oder Kind-Sheet bzw. Karte schon offen waren.

Drei Fälle (Review 2 M2), je für „Nächstgelegen“ und für eine gesetzte Grenze:

| Fall | „Nächstgelegen“ | Wegzeit-Grenze |
|---|---|---|
| **kein Startpunkt** | Block „Wovon aus gerechnet?“ mit „Startpunkt wählen“ **über** der Liste, darunter „Bis dahin nach Terminen“ und die Liste nach Terminen (bzw. „Was ist zu tun“) | Hinweis aus `limitReason` mit Aktion, Liste **ungefiltert** |
| **Tabelle lädt** (`reachMode.kind === "laedt"`) | Platzhalter `ListPending` statt der Liste, Zahl der Statuszeile bleibt | Platzhalter `ListPending` statt der Liste |
| **Tabelle da** | `groupByReach` | gefiltert |
| **Rückfall Luftlinie** (Startpunkt außerhalb, Tabelle fehlt oder passt nicht; ADR 0011, Punkt 9) | `groupByReach` nach Luftlinie, wie auf der Startseite | Hinweis aus `limitReason` statt Filter, Liste ungefiltert, wie auf der Startseite |

- **Statuszeile** in allen Fällen wie auf der Startseite: Bei `ListPending` mit gesetzter Grenze ist sie unsichtbar (die Zahl stünde erst mit Tabelle fest), bei „Nächstgelegen“ bleibt sie sichtbar.

- **Kalender und Karte der Merkliste** warten nie: Die Grenze filtert, sobald Wegzeiten da sind; bis dahin zeigen sie alles, ohne Startpunkt mit dem Hinweis aus `limitReason`.
- `docs/architecture.md`, Abschnitt Wegzeit: Der Satz „Die Merkliste … kennt keine Wegzeit-Grenze und wartet nie (Plan 0025, E8)“ wird ersetzt durch: „Die Liste der Merkliste wartet mit Grenze oder ‚Nächstgelegen‘ wie die Startseite; Kalender und Karte der Merkliste warten nie und filtern erst mit geladener Tabelle (Plan 0057, E7a).“ Die Anlass-Liste bleibt unverändert.

### E8 – Liste nach Handlungsbedarf

- Reine Funktion in `src/domain/saved.ts`:

```ts
export type SavedSection = "demnaechst" | "anmelden" | "spontan" | "laeuft" | "spaeter";
/** Abschnitte der Liste „Was ist zu tun“ (Plan 0057, E8); je Abschnitt nach gezeigtem Termin sortiert */
export function savedSections<T extends Offer>(items: readonly Occurrence<T>[], now: Date): ListGroup<T>[];
```

- `ListGroupHead` (`src/domain/listing.ts`) bekommt die Art `{ kind: "abschnitt"; section: SavedSection; count: number }`. Titel und Untertitel macht `src/ui/format.ts` (`sectionHeading`), gerendert von `ListView`.
- **Regeln**, in dieser Reihenfolge; das erste Zutreffende gewinnt, jedes Angebot steht genau einmal da:
  1. **Läuft gerade**: Kurs, dessen erster Termin schon begonnen hat, mit oder ohne Anmeldung (Review 3). `startedCourse` (`src/domain/agenda.ts`) gilt nur für Kurse mit Anmeldung (Plan 0053) und bleibt so; dafür kommt `courseRunning(offer, now)` daneben.
  2. **Spontan möglich**: regelmäßig und ohne Anmeldung.
  3. **Demnächst**: Der gezeigte Termin beginnt bis einschließlich zum 14. Kalendertag nach heute (Berliner Kalendertage; `SOON_DAYS = 14`; heute Mo 5.10. → bis So 19.10., 23:59).
  4. **Rechtzeitig anmelden**: mit Anmeldung, gezeigter Termin später.
  5. **Später**: alles Übrige, also ohne Anmeldung und später (selten, Befund: ein einmaliges Angebot ohne Anmeldung im Bestand).
- **Reihenfolge der Abschnitte**: Demnächst, Rechtzeitig anmelden, Spontan möglich, Läuft gerade, Später. Leere Abschnitte entfallen.
- **Köpfe** (Titel · Untertitel, dazu die Anzahl als Zahlmarke):
  - „Demnächst“ · „Termine in den nächsten 14 Tagen“
  - „Rechtzeitig anmelden“ · „Beginnt später, Anmeldung nötig – nach Beginn sortiert“
  - „Spontan möglich“ · „Ohne Anmeldung, einfach hingehen“
  - „Läuft gerade“ · „Laufende Kurse“
  - „Später“ · „Ohne Anmeldung“
- **Kachel-Zusätze** (nur in dieser Sortierung):
  - In „Demnächst“ trägt die Kachel eine dunkle Marke „heute“, „morgen“ oder „in N Tagen“ (`daysUntilLabel` in `src/ui/format.ts`).
  - In „Läuft gerade“ trägt sie eine Fußzeile „Endet <Tag Datum>“ mit dem Link „Anschluss suchen“.
    - Er öffnet „Angebote“ mit Format Kurs, der Kategorie des Kurses und Zeitraum ab dem Tag nach dem letzten Termin. Die übrigen Startseiten-Filter werden dabei ersetzt, nicht ergänzt.
    - Reine Funktion `followUpFilter(offer): FilterState` in `src/domain/saved.ts`.
    - Der Link ist ein `<button class="linkbtn">` mit `aria-label` „Anschluss an <Titel> suchen“.
  - Der Platzstatus („Wenige Plätze“ usw.) steht schon heute auf der Kachel.

### E9 – Kalender als Start, zuletzt gewählte Ansicht, leere Tage

- **Start der Merkliste**: Der Tab-Knopf öffnet `lastSavedTab ?? "merkliste-kalender"`.
  - `lastSavedTab` ist ein React-State in `App`, gesetzt bei jedem Wechsel der Darstellung. Er lebt bis zum Neuladen der App. Ein Neustart beginnt wieder im Kalender (Nutzerentscheid U1).
  - Deep-Links bleiben eindeutig: `?ansicht=merkliste` ist die Liste, `?ansicht=merkliste-kalender` der Kalender.
  - Ohne gemerkte Angebote zeigt jede Darstellung den Leerzustand „Noch nichts gemerkt“ wie heute.
- **Statuszeilen nur mit der Anzahl** (ADR 0039, Punkt 1; Review 2): im Kalender wie heute die Zahl der Termine der Auswahl, in der Liste „**8** Angebote gemerkt“, mit Filter „**2** von **8** gemerkten Angeboten passen“ wie heute. Die Aufteilung in vorgemerkt und fest zeigen Herzen, Etiketten und der Chip „Nur fest eingeplant“, nicht die Zeile. Das Mockup („davon 2 fest eingeplant“) wird darin nicht umgesetzt. Rechts steht der runde Export-Knopf (E4), jetzt auch im Kalender.
- **Leere Tage in der Wochenansicht**: Die Agenda zeigt alle Tage der gewählten Woche ab heute, in einer künftigen Woche also alle sieben.
  - Ein Tag ohne Termin wird eine schmale gestrichelte Zeile „Nichts eingeplant“ mit dem Link „Angebote am <Wochentag>“, für heute „Angebote für heute“. Der Link ruft `discoverRange(Tag, Tag)` wie der bestehende Leerzustand.
  - Sind Samstag und Sonntag beide leer und beide noch nicht vorbei, stehen sie in einer Zeile „Wochenende · Noch frei“ mit „Angebote am Wochenende“ (`von` = Samstag, `bis` = Sonntag). Ist heute Sonntag, steht nur der Sonntag da.
  - Vergangene Tage der Woche erscheinen nicht.
  - **Vom Filter verdeckt** (Review 2): Hat ein Tag gemerkte Termine, die nur der Filter ausblendet, sagt die Zeile „Ausgeblendet durch Filter“ statt „Nichts eingeplant“, mit dem Link „Filter zurücksetzen“ statt „Angebote am …“.
  - In Tag- und Monatsauswahl bleibt es beim heutigen Leerzustand.
  - Reine Funktion `weekRows(groups, hiddenDays, week, today)` in `src/domain/calendar.ts` liefert die Folge aus Tagen mit Terminen, verdeckten Tagen, leeren Tagen und dem Wochenende. `hiddenDays` kommt aus `rangeAgenda` (heute nur die Gesamtzahl `hidden`, künftig je Tag).
- **Filter im Kalender**: wie E5. Der Zeitraum ist ausgeblendet, „Nur fest eingeplant“ und Tageszeit wirken.
- **Anlass für den Export-Chunk**: Der Knopf im Kalender lädt denselben Chunk über denselben Lader. Vorladen im Leerlauf wie heute, für alle gleich.

### E10 – Mobile-UX und Barrierefreiheit

- Alle neuen Bedienelemente haben ≥ 44 px: Herz, Chips, Sortier-Knopf, Links in leeren Tagen, „Anschluss suchen“, „Rückgängig“.
- Die Chipzeile der Merkliste scrollt waagrecht wie die der Startseite. Der „Zurücksetzen“-Chip am Ende entfällt (das Sheet hat „Zurücksetzen“). Der Restpunkt „Filterzeile quer abgeschnitten“ aus Plan 0025 (`docs/ideas.md`) bleibt offen, denn die Startseite hat dasselbe Problem.
- `expectMobileUx` (hell und dunkel) für: Kalender mit leeren Tagen, Liste mit Abschnitten, offenes Sortiermenü der Merkliste, Merklisten-Filter-Sheet, Toast mit „Rückgängig“.
- 320 px bei 200 %: Statuszeile und Export-Knopf brechen um, ohne zu überlappen. Die Zeile „Wochenende · Noch frei · Angebote am Wochenende“ bricht in zwei Zeilen. Der Toast mit Knopf verdeckt die Tab-Leiste nicht.
- Kein horizontaler Überlauf am Höhepunkt der Herz-Animation (E2, Grenzen), geprüft bei 320 px in Liste, Detail und Orts-Sheet.

### E11 – Start-Budget

Alles bleibt im Start-Bundle (Merkliste ist ein Haupt-Tab, `docs/ideas.md`, „Merkliste als Lazy-Chunk“). Grob geschätzt sind es +2,5 bis +3,5 kB JS und +0,6 kB CSS. Gemessen wird in jedem Schritt mit `pnpm build && pnpm size`, und die Delta-Tabelle in ADR 0012 wird fortgeschrieben. Die Grenzen (150 kB JS, 15 kB CSS) reichen. Der Service Worker wächst nur um `tageszeit` in `PARAMS` (E7), gemessen in S2.

### E12 – ADR

Ein neues **ADR 0040 „Merkliste mit zwei Stufen“** (auf `main` liegen 0038 und 0039) hält fest:
- E1: Speicherform, abwärtsverträglich, Bestand gilt als fest eingeplant, Fragment v1 importiert als vorgemerkt;
- E4: Export nur fest eingeplant. Das ändert die Menge aus ADR 0007, nicht dessen Bauweise, und übernimmt das Request-Muster aus ADR 0018;
- E2: `aria-pressed="mixed"` als Bedeutung von „vorgemerkt“; Halten als Abkürzung, nie als einziger Weg;
- E3: Toasts mit Aktion (löst Plan 0008, E9 dafür ab).

ADR 0007 bekommt einen Verweis-Nachtrag auf ADR 0040.

## Dateien

- Domäne:
  - `src/domain/saved.ts`: Stufen, `savedSections`, `followUpFilter`, `SavedFilter` neu, `SavedSort`, Export nur fest; Chip-Helfer entfallen.
  - `src/domain/filter.ts`: `Daytime`, `daytimes`, URL, `sessionMatch`, `applyFilters`.
  - `src/domain/agenda.ts`: `shownSession` mit Kandidaten-Regel; Regel in den Gruppierungen und `sessionsByDay`.
  - `src/domain/date-range.ts`: `candidateSessions`; `rangeSession` darauf aufgebaut, Verhalten gleich.
  - `src/domain/age.ts`: `offerFitsAgeIn`, `ageVisibility` mit Kandidaten-Regel statt `range`.
  - `src/domain/listing.ts`: `ListGroupHead` „abschnitt“ und „flach“, `groupByListing`/`groupByReach` mit Kandidaten-Regel.
  - `src/domain/calendar.ts`: `weekRows`.
  - `src/domain/searches.ts`: `searchOf` streicht `daytimes`.
- Daten:
  - `src/data/preferences.ts`: `KEYS.tentative`, `loadTentative`/`saveTentative`.
  - `src/data/haptics.ts` (neu): `vibrate` mit injizierbarer API.
- UI:
  - `src/ui/use-app-state.ts`: `useSaved` mit Stufen; `useToast` mit Aktion und Pause bei Fokus.
  - `src/ui/heart-gesture.ts` (neu): Zustandsmaschine Tippen/Halten.
  - `src/ui/OfferCard.tsx`: `HeartButton` mit Stufen und Geste; Kachel-Zusätze in Abschnitten.
  - `src/ui/icons.tsx`: `heartHalf`.
  - `src/ui/Toast.tsx`: Aktion.
  - `src/ui/Chrome.tsx`: `QuickFilters` mit `chips`.
  - `src/ui/Sheets.tsx`: `FilterSheet` mit `variant` und Tageszeit.
  - `src/ui/Overlays.tsx`: `"saved-filter"`.
  - `src/ui/ListView.tsx`: Abschnittsköpfe mit Zahlmarke, Kopf „flach“, Prop `numbered`.
  - `src/ui/SavedView.tsx`: Sortierung, Statuszeilen, Export, Wegzeit-Platzhalter.
  - `src/ui/SavedCalendar.tsx`: leere Tage, Stufen, Export.
  - `src/ui/use-offer-views.ts`: Merklisten-Filter, Sortierung, Tageszeit, `listWaits` auch für die Merkliste.
  - `src/ui/App.tsx`: Zustände, `lastSavedTab`, Toasts, „Anschluss suchen“.
  - `src/ui/format.ts`: `stageToast`, `daysUntilLabel`, `sectionHeading`, Statuszeilen, `collectionToast`.
  - `src/ui/SavedFilters.tsx`: entfällt.
- Styles: `src/ui/styles/card.css` (Herz, Ring, Funken, vorgemerkte Karte), `src/ui/styles/calendar.css` (leere Tage, blasse Formen), `src/ui/styles/list.css` (Zahlmarke im Abschnittskopf, `overflow-x: clip`), `src/ui/styles/sheet.css` (Toast mit Aktion links und schmal, Aktionsknopf), `src/ui/styles/tokens.css` (`--heart-tentative`), `src/ui/styles/motion.css` (Kommentar: Herz-Handler prüfen `matchMedia`).
- Doku:
  - `docs/architecture.md`: Abschnitt Wegzeit (E7a), Abschnitt „Export der Merkliste“ (Knopf in Liste und Kalender, nur fest eingeplant), Abschnitt Privatsphäre (Schlüsselliste mit `.merkliste-vorgemerkt`; Merklisten-Filter und -Sortierung als React-State).
  - ADR 0040 (neu), ADR 0007 (Nachtrag), ADR 0012 (Messung), `docs/ideas.md`.
- `scripts/lib/e2e-map.ts`: `SavedFilters` raus; `heart-gesture`, `haptics` und die neue Spec `merkliste-liste` rein.

## Tests (test-first)

Unit (Domäne zuerst, rot vor grün):

1. `saved.test.ts`, Stufen:
   - `stageOf`/`cycleStage`/`withStage`: aus → vorgemerkt → fest → aus; `withStage` aus jeder Stufe in jede; die Reihenfolge von `ids` bleibt beim Stufenwechsel.
   - `cleanSavedState`: Vorgemerkt-IDs außerhalb der Merkliste fallen weg, lange IDs werden migriert.
   - Bestand ohne Vorgemerkt-Liste: alles „fest“.
2. `saved.test.ts`, `savedSections`:
   - je Regel ein Fall; Vorrang (begonnener Kurs mit Termin in 3 Tagen ist „Läuft gerade“);
   - Grenze: Termin am 14. Kalendertag 23:30 ist „Demnächst“, am 15. um 0:30 nicht;
   - regelmäßiges Angebot mit Anmeldung in 3 Tagen ist „Demnächst“;
   - leere Abschnitte entfallen, Sortierung im Abschnitt;
   - Tests laufen in `America/Los_Angeles`; die Tage zählen nach Berlin.
3. `saved.test.ts`, Filter und Export:
   - `applySavedFilter` mit Kategorie, Kosten, Tageszeit, `onlyFixed`, Zeitraum (nur ohne Kalender) und Wegzeit-Grenze mit `reach`;
   - `matchesSavedFilter` mit `onlyFixed`, ohne Tageszeit; `endedToday` zählt je Termin mit `inDaytime` (einziger Termin heute schon vorbei bleibt gezählt; vergangener Vormittagstermin zählt bei „nachmittags“ nicht);
   - `savedUnfitIds` mit Zeitraum und Tageszeit: passender Termin nur vormittags, Chip „Nachmittags“ → markiert;
   - `collectionExport` nimmt nur feste und zählt die vorgemerkten; `count === 0`, wenn nichts fest ist;
   - `followUpFilter`: Format Kurs, Kategorie, `von` = Tag nach dem letzten Termin.
4. `filter.test.ts`:
   - `daytimes` aus und in die URL (Reihenfolge kanonisch, Unbekanntes verworfen);
   - Grenzen 11:59/12:00/14:59/15:00 Berliner Zeit, auch am Tag der Zeitumstellung (25.10.2026);
   - `applyFilters` mit Tageszeit filtert **hart**: Ein Angebot nur mit Nachmittagsterminen fällt bei „vormittags“ heraus;
   - Zeitraum und Tageszeit am selben Termin: Vormittag am Montag und Nachmittag am Dienstag, Filter Dienstag + vormittags → kein Treffer;
   - **Kurs**: Beginn vor dem Zeitraum, spätere Termine darin → fällt heraus, auch mit passender Tageszeit; Beginn im Zeitraum, aber nachmittags, Filter vormittags → fällt heraus; die bestehenden Fälle zu „Kurse mit Beginn ab dann“ bleiben unverändert grün;
   - `activeFilterCount` zählt die Tageszeit.
5. `agenda.test.ts`, `date-range.test.ts`, `age.test.ts`:
   - `candidateSessions` je Format; `rangeSession` gleich wie vorher;
   - `shownSession` mit Tageszeit und `fits`: Alter passt nicht, Tageszeit passt → erster Termin in der Tageszeit; beides passt → erster gemeinsamer; ohne Zeitraum und Tageszeit unverändert;
   - **laufender Kurs, Tageszeit ohne Zeitraum** (Review 3 B1): Beginn vormittags, Filter „vormittags“ → passt, gezeigt wird `nextSession` (nicht der vergangene Kursbeginn); Beginn nachmittags → fällt heraus;
   - `groupByNextSession` mit Tageszeit: kein Tageskopf in der Vergangenheit;
   - `sessionsByDay` mit `inDaytime`: ein Kurs steht an allen Terminen in der Tageszeit; `ageIndex` zählt nur, was das Alter verdeckt;
   - `offerFitsAgeIn` mit Tageszeit: passender Termin nur vormittags, Filter nachmittags → passt nicht (markiert).
6. `searches.test.ts`: `searchOf` streicht `daytimes`; nur Tageszeit gewählt → leere Suche.
7. `calendar.test.ts`, `weekRows`: Woche mit Lücken; heute leer; Wochenende zusammengefasst nur, wenn beide leer; heute ist Sonntag; künftige Woche mit allen sieben Tagen; vergangene Tage fehlen; ein vom Filter verdeckter Tag ist „verdeckt“, nicht „leer“.
8. `heart-gesture.test.ts`:
   - kurzer Tipp (`down`, `up` nach 100 ms, `click`) → genau ein `cycle`;
   - `click` mit `detail === 1` **ohne** vorangehendes `down` (Hilfstechnik) → `cycle`; Tastatur (`detail === 0`) → `cycle`;
   - Halten ≥ 550 ms → `fest`; folgendes `up` und `click` → nichts mehr;
   - **Halten 2 s** (Review 3 B2), dann `up` und `click` → bleibt `fest`; das Flag fällt erst 600 ms nach `up`;
   - Halten ohne folgenden `click` (System-Long-Press): Flag fällt nach 600 ms, der nächste `click` wirkt;
   - **nächster Tipp nach dem Halten wirkt** (`down` nach 300 ms setzt das Flag zurück);
   - Bewegung > 10 px → kein Halten; `cancel` → kein Halten;
   - Halten auf „fest“ → kein Timer, Tipp entfernt.
9. `haptics.test.ts`: mit API ruft sie `vibrate(ms)`, ohne API passiert nichts, ein Fehler der API wird geschluckt.
10. `use-app-state.test.ts`: `useSaved` liest beide Schlüssel, schreibt nur bei Änderung, leere Vorgemerkt-Liste entfernt den Schlüssel; `useToast` mit Aktion (6 s, Pause bei Fokus, Neustart nach Blur, keine Pause bei Hover).
11. `format.test.ts`: `stageToast`, `daysUntilLabel`, `sectionHeading`, `collectionToast` mit vorgemerkten.
12. `preferences.test.ts`: `loadTentative` mit kaputtem JSON, falschem Typ und ohne Speicher.

E2E:

13. `e2e/saved.spec.ts` (S1):
    - Herz: Tipp → `aria-pressed="mixed"` und Toast „Vorgemerkt …“; zweiter Tipp → `true`; dritter → `false`.
    - „Rückgängig“ im Toast stellt die Stufe wieder her, danach hat das auslösende Herz den Fokus.
    - Tastatur: Fokus am Herz, dreimal Enter → `"mixed"`, `true`, `false`; der Fokus bleibt am Herz.
    - Halten mit der Maus (`down`, 700 ms, `up`) → `true` ohne Zwischenstufe; ebenso mit 2 s Halten (der folgende `click` entfernt nicht).
    - Halten mit **Touch** auf `pixel-7` über CDP (`Input.dispatchTouchEvent`, wie in `e2e/onboarding.spec.ts`): Start, 700 ms, Ende → `true`; danach ein kurzer Touch-Tipp → `false` (der nächste Tipp wirkt).
    - Neuladen erhält die Stufen; nichts davon in der URL.
    - Export: nur fest; nichts fest → Hinweis, und der Export-Chunk wird trotzdem angefordert.
14. `e2e/layout.spec.ts` (S1): Toast mit Aktion: `elementFromPoint` neben dem Knopf trifft den Inhalt darunter, auf dem Knopf den Knopf, auf der x-Koordinate der Herzen über die ganze Toast-Höhe nie den Toast; bei 320 px kein horizontaler Überlauf am Höhepunkt der Herz-Animation in Liste, Detail und Orts-Sheet: über `document.getAnimations()` pausiert, das Herz am Offset des Keyframes mit 1,7, die Funken am Ende ihrer Animation (größte Ausdehnung); die Glocke behält `slap`.
15. `e2e/app.spec.ts` (S2): Tageszeit im Filter-Sheet der Startseite → `?tageszeit=vormittags`; Liste, Statuszeile und Karte zeigen dieselbe Zahl; keine Glocke, wenn nur die Tageszeit gewählt ist.
16. `e2e/merkliste-liste.spec.ts` (neu, S3/S4; `SPEC_COVERS`: `SavedView|OfferCard|ListView|SortMenu|Sheets|Chrome`, `use-offer-views`, `saved|listing|agenda|filter`):
    - Filter-Sheet: Kategorie und Tageszeit wirken, Badge zählt, „Zurücksetzen“, kein Alter-Abschnitt, keine Glocke;
    - Sortiermenü: vier Optionen; „Zuletzt gemerkt“ kehrt die Merk-Reihenfolge um; „Nächstgelegen“ ohne Startpunkt zeigt „Wovon aus gerechnet?“ über der Liste nach Terminen und lädt **keine** Tabelle; mit gespeichertem Startpunkt erst `ListPending`, dann `groupByReach`;
    - „Termin 3 von 8“ steht weiter an laufenden Kursen, auch mit Chip „Vormittags“ (Kurs mit Beginn vormittags): Kachel am nächsten Termin, kein Tageskopf in der Vergangenheit;
    - Abschnitte mit Fixture-Daten in fester Reihenfolge (S4);
    - „Anschluss suchen“ führt zu `?format=kurs&kat=…&von=…` (S4);
    - `expectMobileUx` hell/dunkel für Liste, Menü und Sheet.
17. `e2e/merkliste-kalender.spec.ts` (S5):
    - Tab-Knopf öffnet den Kalender; nach Wechsel auf die Liste öffnet er wieder die Liste, nach Neuladen den Kalender;
    - leere Tage mit „Angebote am Do“ → `?von=T&bis=T`; Wochenende zusammengefasst; vom Filter verdeckter Tag mit „Filter zurücksetzen“;
    - Export-Knopf im Kalender;
    - vorgemerkte Termine mit Etikett; „Nur fest eingeplant“ blendet sie aus;
    - `expectMobileUx`.
18. **Reduzierte Bewegung** (`mobile-ux`, S1): Herz mit `reducedMotion: "reduce"` → keine laufende Animation; Halten wirkt trotzdem.

Anpassungen bestehender Specs, je Schritt (Review M6):

- **S1** (Herz, Toast, Export):
  - Einmal aufs Herz tippen und `aria-pressed="true"` bzw. den alten Toast erwarten: `e2e/saved.spec.ts`, `e2e/layout.spec.ts`, `e2e/mobile-ux.spec.ts`, `e2e/sortierung.spec.ts`, `e2e/detail.spec.ts`, `e2e/anbieter.spec.ts` (erwartet `/^Gemerkt/`). Sie tippen künftig zweimal oder erwarten `"mixed"`.
  - `saved.spec.ts`: „Export nur in der Liste“ bleibt bis S5; Name „Alle in den Kalender“ wird „Fest Eingeplantes in meinen Kalender“.
- **S3** (Filter, Sortierung):
  - `e2e/sortierung.spec.ts` erwartet keinen Sortier-Knopf auf der Merkliste; künftig erwartet sie ihn in der Liste der Merkliste und nicht in Kalender und Karte.
  - `saved.spec.ts`, Filterfälle: neue Chipzeile und Sheet statt `SavedFilters`.
  - `e2e/merkliste-kalender.spec.ts`, Filterfälle (Format, Anmeldung im Kalender): neue Chipzeile bzw. Sheet.
  - `e2e/mobile-ux.spec.ts`, Gruppe „Merkliste filtern“ mit Chip „ab Nov.“: Schnellwahl jetzt im Sheet.
  - `e2e/layout.spec.ts`, Abstand unter `.saved-filters`: neue Chipzeile; in `scripts/lib/e2e-map.ts` die Zuordnung `SavedFilters` für `layout.spec.ts` ersetzen.
  - `e2e/zeitraum.spec.ts`: Merkliste mit eigenem Zeitraum im Sheet; der Startseiten-Zeitraum gilt weiter nicht.
- **S5** (Kalender als Start): Specs, die nach dem Tipp auf den Tab die Liste erwarten. Sie öffnen die Liste künftig per Umschalter oder Deep-Link `?ansicht=merkliste`:
  - `e2e/saved.spec.ts` (`ansicht=merkliste$`; Export-Knopf);
  - `e2e/layout.spec.ts`;
  - `e2e/mobile-ux.spec.ts` (Text der Statuszeile);
  - `e2e/startpunkt.spec.ts`, `e2e/zeitraum.spec.ts`, `e2e/karte.spec.ts`;
  - `e2e/sortierung.spec.ts` (erwartet nach dem Tab-Tipp `ansicht=merkliste&sortierung=neu`);
  - `e2e/merkliste-anbieter.spec.ts` (Tab-Tipp im Request-Ablauf) prüfen: Der Kalender lädt keine anderen Requests als die Liste;
  - dazu `saved.spec.ts`, „Export nur in der Liste“ → „Export in Liste und Kalender“.
- Belegte Arrays bleiben gültig (E1).

## Schritte

Jeder Schritt endet mit grünem `pnpm verify`, `pnpm e2e:local --affected`, bei UI `/browser-review` und kann einzeln live gehen. Nach S1, S2 und S3 läuft `/arch-review` (je über 200 Zeilen; S1 bringt einen Speicherschlüssel und ein neues Modul in `src/data`), nach S4 und S5 bei Bedarf.

- **S1 – Stufen im Speicher und am Herz.** E1, E2, E3, E4 (Export nur fest, Kalender und Liste zeigen „vorgemerkt“), ADR 0040, `architecture.md` (Privatsphäre, Export). Tests 1, 3 (Export), 8–14, 18 und die Anpassungen zu S1. Danach live: Das Herz hat drei Stufen, sonst bleibt die Merkliste wie heute.
- **Spike an echten Geräten** (Nutzer, nach S1 live):
  - Langes Halten in der installierten App am iPhone (Textauswahl, Lupe, Kontextmenü) und, wenn verfügbar, an einem Android-Gerät (System-Long-Press, `contextmenu`, kein `click`).
  - Herz mit VoiceOver bzw. TalkBack: Doppeltipp schaltet genau eine Stufe weiter, die Ansage nennt „teilweise gedrückt“ bzw. „gedrückt“, „Rückgängig“ ist erreichbar.
  - Scheitert das Halten auf einer Plattform, bleibt dort der zweite Tipp, und das Halten wird für diese Plattform abgeschaltet (Nachtrag).
- **S2 – Tageszeit.** E7 auf der Startseite samt URL und `searchOf`. Tests 4–6, 15.
- **S3 – Filter und Sortierung der Merkliste.** E5, E6 (Standard `termine`), E7a, `architecture.md` (Wegzeit). Tests 3, 16 (ohne Abschnitte) und die Anpassungen zu S3. `SavedFilters` entfällt.
- **S4 – Liste nach Handlungsbedarf.** E8; Standard der Sortierung wird `zutun`. Tests 2, 16 (Abschnitte, Anschluss).
- **S5 – Kalender als Start.** E9. Tests 7, 17 und die Anpassungen zu S5. Das Browser-Review prüft zusätzlich den Kontrast der blassen Formen (E4).
- **S6 – Abschluss.** Budgets in ADR 0012; `docs/ideas.md`:
  - erledigt: „Freie Datumseingabe auf der Merkliste“, „Weitere Filter auf der Merkliste“, der Restpunkt zum „Zurücksetzen“-Chip aus Plan 0025 (der zur quer abgeschnittenen Filterzeile bleibt, E10);
  - neu: „Tageszeit in Such-Abos und Push“, „Stufen im Teilen-Fragment (Format v2)“.
  - Danach `/browser-review live`.

## Nutzerentscheide

Getroffen (2026-10-30): a–f unter „Anlass“, dazu U1–U4 (U1–U3 wie empfohlen angenommen, U4 abgelehnt).

- **U1 – „Zuletzt gewählt“ über einen Neustart hinaus?** Entschieden: nein. Nach einem Neustart öffnet der Kalender, innerhalb der Sitzung die letzte Ansicht. Ein gespeicherter Wert wäre ein neuer Schlüssel. Eine gespeicherte „Karte“ löste beim Öffnen des Tabs Kachel-Requests aus, die vom Gespeicherten abhingen (Invariante Privatsphäre in `docs/architecture.md`).
- **U2 – Bestand gilt als „fest eingeplant“** (E1). Entschieden: ja. So bleiben Export und Kalender für alle wie heute, und keine Migration ist nötig.
- **U3 – Namen.** Entschieden: „vorgemerkt“ / „fest eingeplant“ (Mockup).
- **U4 – Anmeldefristen-Stichprobe.** Entschieden: nein. Anmeldefristen stehen auf den Quellseiten in der Regel zu selten. „Rechtzeitig anmelden“ bleibt dauerhaft eine Näherung über den Beginn.

## Risiken

- **Langes Drücken auf iOS und Android** (Textauswahl, Lupe, System-Long-Press, fehlende Haptik auf iOS): Spike nach S1 an echten Geräten. Der zweite Tipp ist immer der vollwertige Weg, das Halten nur eine Abkürzung.
- **Versehentliches Entfernen**: Der dritte Tipp entfernt, ein vorgemerktes Angebot mit zwei Tipps. „Rückgängig“ im Toast fängt das ab (E3).
- **Scrollen startet Halten**: Ein Finger, der auf dem Herz zu scrollen beginnt, überschreitet die 10-px-Schwelle oder löst `pointercancel` aus. Beides bricht ohne Tipp ab. Unit-Test 8 prüft die Logik, E2E 13 den Touch-Weg, das Browser-Review das Gefühl auf Pixel 7.
- **Toast mit Knopf über Inhalt**: Nur der Knopf fängt Tipps, nur 6 s lang und nie über der Herz-Spalte. `e2e/layout.spec.ts` prüft das (E2E 14).
- **Hilfstechnik**: Jede Aktivierung läuft über `click`, das Halten ist nur eine Abkürzung für Zeiger. Unit-Test 8 und der Spike mit VoiceOver/TalkBack prüfen das.
- **Tageszeit verändert Zahlen auf der Startseite**: Der harte Filter wirkt über `applyFilters` überall gleich (Liste, Statuszeile, Karte, Anbieter-Tab). E2E 15 vergleicht die Zahlen.
- **Viele E2E-Anpassungen** (Herz-Erwartungen in sechs Specs, Tab-Start in sechs Specs): je Schritt gebündelt, damit danach die Basis stabil ist.
- **Abschnitte ohne Anmeldefrist**: „Rechtzeitig anmelden“ ist eine Näherung über den Beginn. Ist ein Kurs schon voll, zeigt der Platzstatus es, wo er bekannt ist.

## Review (2026-10-30) – Verdict: Überarbeiten

Unabhängiger `plan-reviewer` auf die Fassung „Entwurf“. Alle Punkte am Code geprüft.

Übernommen:
- **B1** Tageszeit filterte nicht (weiches `fits` mit Rückfall `?? base` in `shownSession`): E7 macht sie zu einem harten Filter in `applyFilters` (`sessionMatch`, Tageszeit und Zeitraum am selben Termin) und gibt `shownSession` einen harten Parameter `must`; Tests 4, 5, 15.
- **M1** Toast mit Aktion widersprach Plan 0008, E9 und WCAG 2.2.1: nur der Knopf fängt Tipps, 6 s, Pause bei Fokus und Hover; E3, Test 10, 14.
- **M2** Halten-Geste: Tipp über `pointerup`, `click` nur bei `detail === 0`, Verschluck-Flag mit Rücksetzen beim nächsten `pointerdown` und Zeitlimit, Bewegungsschwelle statt `pointerleave`; Touch-E2E per CDP; Spike auch für Android; E2, Tests 8, 13.
- **M3** `navigator` in `src/ui` verboten: `src/data/haptics.ts` mit Test 9.
- **M4** Animation an Nutzeraktion statt am Zustand, `animationend`; Größen so begrenzt, dass nichts über den Viewport ragt, dazu `contain: paint` und `overflow-x: clip`; E2E 14.
- **M5** Wegzeit: kein `want()`; Verhalten der Startseite (`listWaits`) für die Liste der Merkliste, Kalender und Karte warten nie; `architecture.md` ausdrücklich geändert (E7a).
- **M6** E2E-Anpassungen je Schritt vollständig aufgelistet, inklusive `anbieter`, `sortierung`, `startpunkt`, `zeitraum`, `karte`.
- **M7** `/arch-review` nach S1, S2, S3; Standard der Sortierung in S3 `termine`, ab S4 `zutun`.
- Minor: Mockup wird mit dem Plan committet; „im Speicher“ → „React-State in `App`“; Erst-Hinweis gestrichen (Toast-Text sagt es ohnehin); 14-Tage-Grenze inklusiv nach Kalendertagen, Untertitel „Termine in den nächsten 14 Tagen“; `weekRows` für künftige Wochen und Sonntag; `ListGroupHead` „abschnitt“, `QuickFilters` mit `chips`, `FilterSheet` mit `variant` statt generischer Form, Chip-Helfer entfallen; `architecture.md`-Abschnitte konkret benannt; Export-Toast nennt die vorgemerkten; Entfernen in zwei Tipps bewusst bestätigt; Kontrast der blassen Formen ins Browser-Review; „E2E-Fall 8“ korrigiert.
- Scope: Tageszeit **nicht** in Such-Abo und Push (`searchOf` streicht sie, `docs/ideas.md`).

Abgelehnt:
- **ADR-Nummer 0038 statt 0040**: Auf `origin/main` liegen schon ADR 0038 (Anbieterkarte lädt mit dem Tab) und ADR 0039 (Karten und Statuszeile kurz); der Worktree stand bei der Prüfung auf einem älteren Commit. 0040 ist die nächste freie Nummer.
- **„Anschluss suchen“ und „Nächstgelegen“ verschieben**: Beide stehen im freigegebenen Mockup bzw. im Wunsch „Sortierung der Entdecken-Seite auch in der Merkliste“. „Nächstgelegen“ kommt ohne neuen Lade-Anlass aus (E7a), „Anschluss suchen“ ist eine reine Funktion und ein Link.

## Review 2 (2026-10-30) – Verdict: Überarbeiten

Neuer, unabhängiger `plan-reviewer` auf die Fassung „Review eingearbeitet“. Alle Punkte am Code geprüft und übernommen.

- **B1** `sessionMatch`/`must` hätten die Zeitraum-Regel für Kurse aus Plan 0023 (nur der Kursbeginn, auch wenn beendet; `rangeSession`) gebrochen: E7 baut die Kandidaten jetzt auf dieser Regel auf (`candidateSessions` neben `rangeSession`, das sein Verhalten behält); Test 4 und 5 mit Kursfällen.
- **M1** Alterssichtbarkeit ohne Tageszeit: `offerFitsAgeIn` und `ageVisibility` nehmen die Kandidaten-Regel (E7, Test 5).
- **M2** E7a beschrieb die Startseite falsch: drei Fälle (kein Startpunkt, lädt, da) ausgeschrieben, wie `App.tsx` es heute tut; Test 16 angepasst.
- **M3** „Rückgängig“ lag über der Herz-Spalte: Toast mit Aktion links und mindestens 96 px vor dem rechten Rand; Pause nur bei Fokus, nicht bei Hover; Layout-Test auf der x-Koordinate der Herzen (E3, Test 14).
- **M4** Tipp über `pointerup` schloss Hilfstechnik aus: `click` ist der einzige Tipp-Pfad, Zeiger-Ereignisse dienen nur dem Halten, das Flag schluckt den `click` nach dem Halten (E2, Test 8); Spike mit VoiceOver/TalkBack.
- **M5** E2E-Anpassungen ergänzt: `merkliste-kalender`, `mobile-ux` („Merkliste filtern“), `layout` (`.saved-filters`, `e2e-map.ts`) in S3; `sortierung`, `merkliste-anbieter` in S5.
- Minor: neue Herz-Regeln nur für `.heart:not(.bell)`, die Glocke behält `slap`; reduzierte Bewegung per `matchMedia`, `animationcancel`, Kommentar in `motion.css`; Service Worker wächst um `tageszeit` in `PARAMS`, gemessen; `applySavedFilter` mit `reach`, `matchesSavedFilter` mit Tageszeit und `onlyFixed`; `ListView` mit `numbered` und Kopf „ohne“ (Review 3: „flach“); `QuickFilters` mit `count`; Statuszeilen nur mit der Anzahl (ADR 0039, Punkt 1) statt „davon N fest eingeplant“; Restpunkt zur abgeschnittenen Filterzeile bleibt offen; `weekRows` kennt vom Filter verdeckte Tage; Überlauf-Test auch für Detail und Orts-Sheet.

Abgelehnt: nichts.

## Review 3 (2026-10-30) – Verdict: Überarbeiten → eingearbeitet, keine offenen Blocker

Dritter, neuer `plan-reviewer` (letzte erlaubte Runde laut `/plan-review`). Alle Punkte am Code geprüft und übernommen; ein weiterer Reviewer läuft nicht, die Einarbeitung prüft `/arch-review` nach S1–S3.

- **B1** Mit Tageszeit ohne Zeitraum stand ein laufender Kurs am vergangenen Kursbeginn: Anker (Filter) und gezeigter Termin sind getrennt; Kurs ohne Zeitraum zeigt `nextSession` (E7); Tests 5 und 16.
- **B2** Verschluck-Flag lief bei langem Halten vor dem `click` ab: 600 ms zählen ab `pointerup`/`pointercancel` (E2); Tests 8 und 13 mit 2 s Halten.
- **M1** Kalender, `endedToday` und `ageIndex` brauchen die Tageszeit je Termin: `inDaytime` an `sessionsByDay` (`index`, `ageIndex`) und `endedOnDay`; `matchesSavedFilter` ohne Tageszeit (E7, E5); Tests 3 und 5.
- **M2** Alters-Markierung der Merkliste ohne Zeitraum und Tageszeit: `savedUnfitIds` (E5); Test 3.
- **M3** „Rückgängig“ per Tastatur kaum erreichbar: Tastaturweg ist das Weiterschalten am Herz, Fokus nach „Rückgängig“ zurück aufs Herz, kein WCAG-2.2.1-Anspruch für den Toast (E3); Test 13.
- Minor: `openOnDay` auch mit Tageszeit; E7a um den Rückfall auf die Luftlinie und die Statuszeile bei `ListPending` ergänzt; „Läuft gerade“ für jeden begonnenen Kurs (`courseRunning`); Toast mit `flex-wrap`; Test 14 pausiert am Keyframe 1,7 und am Ende der Funken; blasse Deckkraft ersetzt durch Umriss in Textfarbe (E4); Kopfart „flach“ statt „ohne“; Abo-Toast „ohne Tageszeit“.
- Hinweis zum Verweis auf Plan 0043 (aktiv): Wird er vor diesem Plan archiviert, schreibt der Archivschritt (CLAUDE.md, Schritt 7) die Pfadverweise um; `check-docs` fängt es.

Abgelehnt: nichts.

## Nachtrag S1 (2026-10-31)

Abweichungen bei der Umsetzung von S1, im Sinn des Plans entschieden:

- **Größe der Animation:** Wie in der Demo wächst das Herz-Symbol (`.hw`, 20 px) im 40-px-Kreis des 44-px-Knopfs, nicht der ganze Knopf (die Grenzen in E2 rechneten mit 48 px). Bei `pop-big` federt der Kreis zusätzlich auf 1,15 („btnPop“ der Demo). Ring (30 px) und Funken (38 px) bleiben wie geplant; der Knopf liegt 48 px vom Rand.
- **`overflow-x: clip`** sitzt auf `.body` (allen Tabs), nicht nur auf Liste und Kalender: Dieselbe Kachel steht auch in „Entdecken“.
- **Halten mit der Maus:** Ohne Pointer-Capture (sonst käme der `click` auch nach dem Loslassen außerhalb). Verlässt die Maus das Herz, endet das Halten (`pointerleave` nur für `pointerType === "mouse"`); bei Touch bleibt es bei Bewegung und `pointercancel`.
- **Fokus nach „Rückgängig“:** Ist das auslösende Herz verschwunden (Entfernen in der Liste der Merkliste), bekommt das neu gerenderte Herz desselben Angebots den Fokus (`data-offer` am Knopf).
- **Export-Texte:** Mit Filter heißt der Knopf „Alle N fest eingeplanten in meinen Kalender, auch ausgeblendete“. Der Toast nennt die vorgemerkten ohne Schlusspunkt wie die übrigen Export-Toasts: „… geladen · 3 vorgemerkte sind nicht in der Datei“ (Einzahl „1 vorgemerktes ist …“); mit vorgemerkten steht er 6 s. Passt keins der fest eingeplanten zum Alter: „Keins der fest eingeplanten Angebote passt zum Alter.“
- **Statuszeile:** zählt Angebote ohne passenden Termin weiter über alle gemerkten, gleich welche Stufe (`collectionExport` ohne Stufen); nur die Datei nimmt allein fest Eingeplantes.
- **Monatsraster:** Die Form eines vorgemerkten Termins steht auch dort als Umriss, wie in der Wochenleiste.
- **Toast mit Aktion:** Er hat links 8 statt 16 px Rand (E3), damit neben dem Knopf mehr Platz für den Text bleibt. Ist der Toast schmal, fällt das Häkchen vor dem Text weg (Container-Query auf den Toast).
- **Tests:** Die Kalender-Darstellung von „vorgemerkt“ (E4) kam schon in S1; ihr E2E-Fall steht deshalb jetzt in `e2e/merkliste-kalender.spec.ts`, nicht erst in S5. `e2e/sortierung.spec.ts` blieb unverändert: Ein Tipp merkt vor, das Angebot steht danach wie erwartet auf der Merkliste.

## Nachtrag S2 (2026-10-31)

Abweichungen bei der Umsetzung von S2, im Sinn des Plans entschieden:

- **Ort der Tageszeit:** `Daytime`, `DAYTIMES` und `daytimeOf` stehen in `src/domain/date-range.ts`, nicht in `filter.ts`. `filter.ts` importiert `date-range.ts`, und `candidateSessions` braucht die Tageszeit; so entsteht kein Zyklus. `FilterState.daytimes` und `PARAMS` (`tageszeit=`) stehen wie geplant in `filter.ts`. Die Stunde kommt aus `berlinKey` (`time.ts`).
- **Gemeinsamer Parametertyp `SessionRule`** (`{ range?, daytimes? }`, `date-range.ts`): `shownSession`, `groupByNextSession`, `groupByListing`, `groupByReach`, `savedOffers`, `offerFitsAgeIn` und `splitByAge` nehmen ihn statt `range`, `ageVisibility` als `{ ageOnly, ...rule }`. `FilterState` erfüllt den Typ. `ruleActive(rule)` sagt, ob Zeitraum oder Tageszeit gesetzt sind (`applyFilters`, `openOnDay`, Alters-Markierung). `isCandidate` ist dieselbe Regel als Prädikat, damit `shownSession` nur bis zum ersten Treffer sucht. `rangeAgenda` bekommt die Regel erst in S3/S5 (Kalender je Termin über `inDaytime`); `inDaytime` kommt deshalb erst in S3 (knip).
- **Badge:** Jede gewählte Tageszeit zählt als ein Wert, wie in den anderen Listen-Dimensionen (`activeFilterCount` summiert jetzt über `LIST_DIMENSIONS`).
- **Abo-Toast:** „Suche abonniert, ohne Tageszeit“ ohne Schlusspunkt wie die übrigen Abo-Toasts; die Push-Varianten hängen an diesen Anfang an („… – Neues kommt in die wöchentliche Push-Nachricht“, „…. Push-Nachrichten sind …“). Mit Tageszeit steht er 6 s. `aboToast` nimmt die Zusätze jetzt als Objekt `{ noOrigin, iosTab, daytime }`.
- **Statuszeile:** nennt die Tageszeit nicht („6 Angebote“), anders als den Zeitraum. Das Badge und das Sheet zeigen sie; ADR 0039 (kurze Statuszeile).
- **`docs/ideas.md`:** „Tageszeit in Such-Abos und Push“ steht schon mit S2 drin (Arch-Review), S6 legt ihn nicht neu an.
- **Screenshots:** `scripts/screenshots.ts` hat die Ansicht `filter-tageszeit`.
- **Messung** (`pnpm build && pnpm size`, nach S1 und S2 zusammen): JS (initial) 109,82 kB, CSS 13,47 kB, Service Worker 9,18 kB (vorher 9,10 kB, also +0,08 kB durch `tageszeit` in `PARAMS` und die Kandidaten-Regel). Die Delta-Tabelle in ADR 0012 folgt in S6.

## Nachtrag S3 (2026-10-31)

Abweichungen bei der Umsetzung von S3, im Sinn des Plans entschieden:

- **Sortiermenü mit drei Optionen:** „Nächste Termine“ (Standard), „Nächstgelegen“, „Zuletzt gemerkt“. `SavedSort` in `saved.ts` ist `"termine" | "nah" | "gemerkt"`; S4 ergänzt `"zutun"` und macht es zum Standard. „Zuletzt gemerkt“ ordnet `recentlySaved(items, ids)` (Merk-Reihenfolge rückwärts).
- **Liste über `ListView`:** Die Liste der Merkliste rendert App über `renderList` mit `ListView` (`numbered`), die Gruppen liefert `views.savedGroups`. Bei „Nächste Termine“ stehen die Kacheln wie auf der Startseite unter Tagesköpfen und tragen deshalb kein Datum mehr; bei „Zuletzt gemerkt“ (Kopf `flach`, nur als Name der Region) und „Nächstgelegen“ mit Datum.
- **Zähler:** `savedFilterCount(saved, { useRange, limitActive })` bleibt als dünne Hülle um `activeFilterCount` (plus eins für `onlyFixed`), damit Badge, „gefiltert“ und Export-Name dieselbe Zahl nehmen. Im Kalender zählt der Zeitraum nicht, er wirkt dort nicht (Badge und Statuszeile wie ohne Filter). `savedRule(saved, useRange)` liefert die Regel für gezeigten Termin, Alters-Markierung und `openOnDay`.
- **`inDaytime` und `allFits`:** `inDaytime` steht wie geplant in `filter.ts`; die Verknüpfung mit der Altersregel macht `allFits(a, b)` in `agenda.ts` neben `SessionFit`.
- **`rangeAgenda` unverändert:** Die Tageszeit wirkt schon in `index` (`allFits(savedFits, inDaytime)`) und `ageIndex` (nur `inDaytime`), nicht in `allIndex`. So zählt `hidden` auch, was die Tageszeit verdeckt, und `ageHidden` nur das Alter; eine eigene Regel braucht `rangeAgenda` erst für `weekRows` in S5.
- **Kopf:** Umschalter und Sortier-Knopf stehen in `.saved-tools` (der Umschalter nimmt den Rest der Zeile, seine Container-Query sieht die schmalere Breite). Die Chipzeile ist `QuickFilters` in `.saved-filters` (Rand wie bisher bis an den Inhalt); `QuickFilters` hat dafür neben `chips` und `count` den Prop `legend` („Merkliste filtern“), die Startseiten-Chips baut `startQuickChips`.
- **Filter-Sheet:** statt `variant` nur der Prop `saved` (`SavedSheetParts`: `onlyFixed`, `onOnlyFixed`, `quick`, `calendar`); mit ihm ist es das Sheet der Merkliste. So gibt es keine ungültige Kombination (Arch-Review, m4). Die Schnellwahlen „ab …“ stehen als Chips über von/bis (Einfachwahl, ein zweiter Tipp hebt sie auf; `quickRangeOn`/`toggleQuickRange` in `filter.ts` mit Unit-Test). Im Kalender steht unter „Zeitraum“ nur der Hinweis „Im Kalender gilt stattdessen die gewählte Woche bzw. der Monat.“ (Mockup). Der Dialog heißt „Merkliste filtern“; der Fuß „N gemerkte zeigen“ hat keine Einzahl-Form.
- **Wegzeit-Grenze im Badge (E7a):** In der Liste zählt sie wie auf der Startseite schon, solange die Tabelle lädt (die Liste wartet ja); in Kalender und Karte erst mit Wegzeit (`savedLimitActive`), denn dort filtert sie vorher nichts. Praktisch ist die Grenze ohnehin nur mit geladener Tabelle wählbar (die Chips sind sonst gesperrt); der Platzhalter der Liste erscheint also nur, wenn die Tabelle neu lädt.
- **Wegzeit (E7a):** Mit gesetzter, aber wirkungsloser Grenze steht unter der Statuszeile der Hinweis aus `limitHint` mit `LimitAction`, wie auf der Startseite, in allen drei Darstellungen. Der Block „Wovon aus gerechnet?“ ist in App ein gemeinsames Element für Startseite und Merkliste.
- **Alters-Markierung:** Merkliste (Liste, Karte, Kalender) nimmt `savedCtx` mit `savedUnfitIds`; Detail und Sheets behalten `unfitIds`.
- **Sortier-Ansage:** Die Statuszeile der Liste sagt „Sortiert nach …“ für Screenreader wie auf der Startseite.
- **E2E-Helfer:** `savedFilter(page, …)` (Sheet öffnen, Chips tippen, schließen) steht bewusst je Spec (`saved`, `merkliste-kalender`, `mobile-ux`); ein gemeinsamer Helfer in `e2e/fixtures.ts` stünde auf der Sperrliste und verbreiterte die E2E-Auswahl jeder Änderung.
- **Tests:** `mobile-ux` hat die Ansicht `merkliste-filter-sheet`; `scripts/screenshots.ts` die Ansichten `merkliste-sortieren`, `merkliste-filter`, `merkliste-filter-kalender` und `merkliste-nah`.
- **Browser-Review:** Das Sortiermenü stand ohne Bezugselement weit unter dem Knopf über der Liste; `.saved-tools` ist jetzt `position: relative` wie `.status-row`, `merkliste-liste.spec.ts` prüft die Lage. Bei 320 px teilt sich der Umschalter die Zeile mit dem Sortier-Knopf (236 px): Die Schwelle der Einspaltigkeit sinkt auf 14rem, darunter bis 17rem rücken die Segmente enger (`e2e/saved.spec.ts`, „Kopf der Merkliste“).
- **Messung** (`pnpm build && pnpm size`, nach S3): JS (initial) 110,78 kB (S2: 109,82, also +0,96 kB), CSS 13,51 kB (+0,04), Service Worker 9,17 kB.
