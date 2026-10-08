# Plan 0021 – Altersfilter wandert ins Filter-Sheet

Status: abgeschlossen, live seit fc39cf7 (2026-10-06). Restpunkte stehen in `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“ (Plan 0027, Etappe 6). Früherer Status: freigegeben nach zwei Review-Runden (siehe unten)
Datum: 2026-10-06
Bezug: Plan 0003 (Kind-Sheet, „Nur passende“, „trotzdem zeigen“), Plan 0005 (Karte zeigt `views.visible`), Plan 0008 (E12, Leerzustände), Plan 0020 (Startseite entrümpeln)

## Ziel

Nutzermeldung vom 2026-10-06, im Anschluss an Plan 0020: Die Startseite lässt sich weiter aufräumen. Die Zeile „148 passen nicht zu 7 Mon. · trotzdem zeigen“ soll verschwinden. Stattdessen gibt es im Filter-Sheet die Option „nur altersgerechte Angebote“. Sie ist immer vorausgewählt, bis man sie aktiv abwählt. Ist sie abgewählt, warnt ein kleiner Hinweis, dass auch Unpassendes angezeigt wird, und bietet einen Weg zurück.

UX-Leitlinien:

1. **Im Normalfall steht nichts da.** Wer den Filter nicht anfasst, sieht keine Zusatzzeile.
2. **Wer ihn abschaltet, sieht das immer.** Der Hinweis steht auf jedem Tab mit Statuszeile. Ein Tipp schaltet zurück.
3. **Es gibt einen Schalter statt zwei.** Heute gibt es den dauerhaften Schalter „Nur passende Angebote“ im Kind-Sheet und dazu den flüchtigen Link „trotzdem zeigen“. Beides wird zu einem Schalter im Filter-Sheet.
4. **Der sichere Standard kommt von selbst zurück.** Nach einem Neustart der App ist der Filter wieder an.
5. **Keine Sackgasse.** Blendet der Altersfilter alles aus, bietet jeder Leerzustand „Auch unpassende zeigen“ an.

## Nicht-Ziele

- Die Altersregel bleibt unverändert (`offerFitsAge`, `splitByAge`, `ageCheck`). Es zählt, ob das Angebot zum Kursstart passt.
- Unpassende Karten sehen aus wie bisher: gestrichelt, blass, mit Altershinweis (`.card.unfit`, `.fact.warn`).
- Die Merkliste ignoriert den Altersfilter weiterhin (Plan 0003).
- Der Kalender-Export (Plan 0018) entscheidet nach dem Geburtsdatum, nicht nach diesem Schalter. Er bleibt unberührt.
- Das Alter kommt nicht in die URL, weder als Geburtsdatum noch als Schalter (Plan 0003: Datenschutz, geteilte Links).
- Der Zähler am Knopf „Filter“ (`activeFilterCount`) ändert sich nicht. Er zählt weiter nur die URL-Filter. Den abgeschalteten Altersfilter zeigt der Hinweis an (E3).

## Ausgangslage

- `src/data/preferences.ts:11, 68–75`: Der Schlüssel `zwergenplan.nur-passende` steht in localStorage. `loadAgeOnly()` liefert standardmäßig `true`, `saveAgeOnly(false)` schreibt `"nein"`. Eigene Unit-Tests gibt es dafür nicht.
- `src/ui/use-app-state.ts:132–139`: `useAgeOnly()` gibt `[ageOnly, setAgeOnly]` zurück und speichert dauerhaft.
- `src/ui/KidSheet.tsx:100–116`: Unter dem Geburtsdatum steht der Schalter `role="switch"` „Nur passende Angebote“ mit dem Untertitel „geprüft zum Kursstart · bleibt auf diesem Gerät“. `Overlays.tsx:47, 67, 148` und `App.tsx:55, 435` reichen `ageOnly` und `setAgeOnly` dorthin durch. `Overlays` bekommt Einzel-Props, kein `views`.
- `src/ui/use-offer-views.ts:108–125`: `showUnfit` ist Sitzungszustand per `useState(false)`. Er geht an `ageVisibility(…, { ageOnly, showUnfit })`.
- `src/ui/App.tsx:160–163`: `setBirthDate` ruft `views.setShowUnfit(false)`. So springt „trotzdem zeigen“ bei neuem Geburtsdatum zurück. Einen Unit-Test dafür gibt es nicht.
- `src/ui/App.tsx:156–159`: `setFilter` ruft `views.resetPage()`. `showUnfit` setzt die Seitenzahl heute nicht zurück.
- `src/domain/age.ts:81–105` `ageVisibility` liefert `visible`, `hiddenCount` (gefilterte, unpassende, ausgeblendete Angebote) und `unfitIds`.
- `src/ui/App.tsx:317–324`: Unter der Statuszeile steht `{hiddenCount > 0 && <p className="status">… passen nicht zu {ageLabel} <button linkbtn>trotzdem zeigen | ausblenden</button></p>}`. Die Zeile erscheint auf allen Tabs außer der Merkliste.
- `src/ui/Sheets.tsx` `FilterSheet` hat die Abschnitte Art, Format, Anmeldung, Kosten und Wegzeit. Im Fuß stehen „Zurücksetzen“ (`onChange(EMPTY_FILTER)`) und „N Angebote zeigen“ (`resultCount`).
- Leerzustände:
  - `src/ui/ListView.tsx:60–74` `NoOffers({ hasData, onResetFilter })` zeigt „Mit diesen Filtern gibt es keine Angebote.“ und **immer** „Filter zurücksetzen“ (`onResetFilter` ist Pflicht). Aufrufer:
    - `App.tsx:339` (Liste),
    - `src/ui/karte/MapScreen.tsx:114` (Prop `onResetFilter` aus `src/ui/map-types.ts:34`, gesetzt in `App.tsx:361` über `MapPanel`),
    - `src/ui/anbieter/ProviderScreen.tsx:68`.
  - `ProviderScreen.tsx:59–74`: Ohne aktiven Filter zeigt er einen eigenen Leerzustand „Mit dieser Auswahl gibt es keine Angebote.“, ohne Knopf. Kommentar: „nur die Altersregel blendet alles aus“.
  - `src/ui/CalendarView.tsx:140–166` `AgendaEmpty`: „Nichts, was zu deiner Auswahl passt“ mit `hiddenNote` („… durch Filter, Wegzeit oder Alter“). „Filter zurücksetzen“ erscheint nur bei `activeFilterCount > 0` (`App.tsx:379–382`, Kommentar „Blendet allein das Alter aus, hilft Zurücksetzen nicht“, Plan 0008, E12).
  - Diese drei Stellen boten bisher keinen eigenen Altersausweg, weil die Alterszeile darüber ihn lieferte. Die fällt jetzt weg.
- `src/ui/icons.tsx` hat kein Warn-Icon. `.fact.warn` (`card.css:159–162`) hat keine Warnfarbe, nur `border: 1.5px dashed var(--muted)`. Ein Token für „Achtung“ ist `--hint-bad-line` (`tokens.css:283/314/346`; hell `var(--line)`, dunkel `#ff9a9a`).
- `e2e/mobile-ux.spec.ts:100–103`: Der Zustand `filter-sheet` läuft ohne Geburtsdatum.
- Tests, die den alten Zustand benutzen:
  - `src/domain/age.test.ts:95–128` (`ageVisibility`),
  - `src/ui/use-offer-views.test.ts:45–90, 147`,
  - `e2e/app.spec.ts:70–98` mit „4 passen nicht zu 1 Mon.“, „trotzdem zeigen“ und dem Schalter im Kind-Sheet,
  - weitere Treffer per grep in Schritt 1.
  - **Nicht** betroffen, obwohl der grep sie findet: `e2e/startpunkt.spec.ts` (Treffer bei „passt nicht zu“ betreffen die Wegzeit), `src/domain/timetable.test.ts`, `src/domain/directory.ts` und `src/ui/anbieter/*` (dort hat `hiddenCount` eine eigene Bedeutung: ausgeblendete Anbieter).

## Entscheidungen

### E1 – Ein Zustand: `ageOnly`, im Speicher, Standard an

- `showUnfit` und die gespeicherte Einstellung werden zu **einem** Zustand `ageOnly: boolean` in `useOfferViews`, dort, wo heute `showUnfit` steht.
  - Startwert ist `true`.
  - Ändert sich das Geburtsdatum, springt er auf `true` zurück. Ein neues Alter ist ein neuer Zusammenhang. Das bleibt, wo es heute steht: `App.setBirthDate` ruft `views.setAgeOnly(true)` statt `views.setShowUnfit(false)`. Getestet wird es per E2E (Tests, Punkt 4).
  - `useOfferViews` gibt `ageOnly` und `setAgeOnly` zurück. Die Option `ageOnly` als Eingabe von `useOfferViews` entfällt.
  - `setAgeOnly(on)` setzt zugleich die Seitenzahl zurück (`setLimit(PAGE)`, wie `resetPage`), denn die Liste ändert sich wie bei einem Filterwechsel.
- **Nicht gespeichert.** „Immer vorausgewählt, außer man wählt ihn aktiv ab“ heißt: Das Abwählen ist eine Erkundung für den Moment. Es gilt über Tab-Wechsel hinweg. Nach dem Neuladen oder einem Neustart der App ist der Filter wieder an.
  - Verworfen wurde `sessionStorage`. Er bringt eine weitere Stelle mit try/catch und hilft wenig. Auf iOS entspricht ein Neuladen einer PWA aus dem Hintergrund praktisch einem Neustart, und gerade dann soll der sichere Standard gelten.
- `loadAgeOnly`, `saveAgeOnly`, `useAgeOnly` und `KEYS.ageOnly` entfallen. Der Kopfkommentar in `preferences.ts:3` wird angepasst.
  - Ein alter Wert `"nein"` in localStorage wird nicht mehr gelesen. Er stört nicht, und ein Aufräum-Code lohnt sich für einen privaten Kreis nicht.
- `ageVisibility` (Domäne) bekommt nur noch `{ ageOnly }` und liefert:
  ```ts
  interface AgeVisibility<T> {
    visible: readonly T[];
    /** gefilterte Angebote, die nicht zum Kind passen: bei `ageOnly` ausgeblendet, sonst markiert sichtbar */
    unfitCount: number;
    unfitIds: ReadonlySet<string>;
  }
  ```
  - Ohne Geburtsdatum: `visible = filtered`, `unfitCount = 0`, leere `unfitIds`. Das gilt wie bisher.
  - Mit Geburtsdatum: `unfitCount = filtered.length - fitting.length`, **unabhängig** von `ageOnly`. `visible` ist bei `ageOnly` `fitting`, sonst `filtered`.
  - `hiddenCount` fällt weg. Die Kommentare in `age.ts:83/91` werden angepasst.

### E2 – Schalter oben im Filter-Sheet

- Der Abschnitt „Alter“ steht **als erster** im Filter-Sheet, vor „Art“. Er filtert am stärksten und ist der Standard, deshalb gehört er oben hin. Er erscheint **nur mit Geburtsdatum**. Ohne Geburtsdatum gibt es nichts zu filtern, und das Kind-Sheet sagt das schon („Ohne Geburtsdatum zeigen wir alle Angebote.“).
- Aufbau wie der bisherige Schalter im Kind-Sheet (`.swrow`, `role="switch"`), also kein neues Muster. IDs kommen aus `useId()` wie in `KidSheet.tsx:53`:
  ```tsx
  const labelId = useId();
  const noteId = useId();
  …
  <h3>Alter</h3>
  <div className="swrow">
    <span className="swtext">
      <b id={labelId}>Nur passend für {age.label}</b>
      <small id={noteId}>{ageOnlyNote(age.unfitCount, age.on)}</small>
    </span>
    <button type="button" className="switch" role="switch" aria-checked={age.on}
            aria-labelledby={labelId} aria-describedby={noteId} onClick={() => age.onChange(!age.on)}>
      <span className="track"><span className="knob" /></span>
    </button>
  </div>
  ```
  `age.label` ist derselbe Text wie im Kopf, zum Beispiel „7 Mon.“ (`ageChipLabel`).
- Untertitel `ageOnlyNote(unfitCount, on)`, neu in `src/ui/format.ts`, rein und testbar:
  - an, `unfitCount > 0`: „148 weitere passen nicht · geprüft zum Kursstart“ (Singular „1 weiteres passt nicht · …“),
  - aus, `unfitCount > 0`: „148 unpassende sind markiert · geprüft zum Kursstart“ (Singular „1 unpassendes ist markiert · …“),
  - `unfitCount === 0`: „geprüft zum Kursstart“.
  - Die Zahl bezieht sich auf die übrigen Filter, genau wie „N Angebote zeigen“ im Fuß. Damit sieht man vor dem Abschalten, was dazukommt.
- `FilterSheet` bekommt das Prop `age?: AgeFilter` mit `interface AgeFilter { label: string; on: boolean; unfitCount: number; onChange: (on: boolean) => void }` (exportiert aus `Sheets.tsx`).
  - `App.tsx` baut das Objekt (`birthDate ? { label: ageLabel, on: views.ageOnly, unfitCount: views.unfitCount, onChange: views.setAgeOnly } : undefined`) und reicht es als **ein** Prop `filterAge` über `Overlays` an `FilterSheet`.
  - Die Props `ageOnly`/`setAgeOnly` von `Overlays` entfallen.
- Der Knopf im Fuß „N Angebote zeigen“ zählt `visible.length` wie bisher. Er spiegelt den Schalter also sofort.
- **„Zurücksetzen“** im Filter-Sheet ruft das neue Prop `onReset` (statt `onChange(EMPTY_FILTER)`). `App.tsx` gibt `resetFilters` mit: Filter auf `EMPTY_FILTER`, `ageOnly` auf `true`.
  - Damit ändert sich Plan 0003, wonach „Filter zurücksetzen“ das Alter nie anfasst. Jetzt ist der Altersfilter ein Filter mit Standard „an“, und Zurücksetzen heißt: zurück auf den Standard.
  - Das Geburtsdatum bleibt unberührt.
- Aus dem Kind-Sheet verschwindet der Schalter samt `.swrow`. Die Props `ageOnly`/`onAgeOnly` von `KidSheet` entfallen, ebenso der Kopfkommentar dazu (`KidSheet.tsx:2`). Die CSS-Klasse `.swrow` bleibt, wo sie ist.
- Damit das Kind-Sheet den Zusammenhang nicht verliert, wird die Zeile `Bleibt nur auf diesem Gerät.` zu `Bleibt nur auf diesem Gerät. Unpassende Angebote blendet der Filter aus.`

### E3 – Statuszeile: Hinweis nur bei abgeschaltetem Filter

- Die Zeile „N passen nicht zu {ageLabel} · trotzdem zeigen/ausblenden“ (`App.tsx:317–324`) entfällt.
- Neu, an derselben Stelle (außerhalb der `role="status"`-Region, wie bisher), nur bei `birthDate && !views.ageOnly && views.unfitCount > 0`:
  ```tsx
  <p className="status age-warn">
    <Icon name="alert" size={18} />
    {ageWarnText(unfitCount, ageLabel)}
    <button type="button" className="linkbtn" onClick={showFittingOnly}>ausblenden</button>
  </p>
  ```
  - `ageWarnText(unfitCount, ageLabel)` ist eine reine Funktion in `format.ts`: „Zeigt auch 148 Angebote, die nicht zu 7 Mon. passen“ und „Zeigt auch 1 Angebot, das nicht zu 7 Mon. passt“. Das ist ein ganzer Satz, auch für Screenreader direkt nach der Statuszeile.
  - Der Knopf heißt „ausblenden“ und nicht „Filter zurücksetzen“, wie es die Nutzermeldung vorschlug. Zurücksetzen nähme auch Kategorie, Kosten und Wegzeit weg, obwohl nur das Alter gemeint ist. „ausblenden“ ist die genaue Umkehr und das Wort, das die App dafür schon benutzt.
  - `showFittingOnly`: zuerst `statusLine.current?.focus()`, dann `views.setAgeOnly(true)`. Der Knopf verschwindet danach, ohne den vorgezogenen Fokus fiele er auf `<body>`. Das ist dasselbe Muster wie bei `LimitAction` (Plan 0009, N2). Die Statuszeile meldet die neue Zahl selbst.
- Optik von `.age-warn`, keine Fläche, kein Kasten, damit die Seite ruhig bleibt:
  - Rahmenlinie links, 3 px, in `var(--hint-bad-line)`. Sie ist nur Schmuck: Hell ist sie grau, dunkel rötlich, wie beim Hinweis im Kind-Sheet.
  - Das Icon hat `currentColor`, also die Textfarbe der Statuszeile. Damit ist der Kontrast (≥ 3:1) in beiden Themes gesichert.
  - `padding-left` so, dass Icon und Text nicht an der Linie kleben. Das Icon steht mit `vertical-align: -0.2em` in der Zeile.
- Neues Icon `alert` in `icons.tsx` (Strich-Icon wie die anderen, dekorativ): `PATHS.alert = "M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.01"`.
- Ist der Filter an, steht auf der Seite **nichts** zum Alter. Die Zahl „N Angebote ab heute“ zählt wie bisher nur die sichtbaren Angebote.

### E4 – Leerzustände ohne Sackgasse

- `App.tsx` berechnet einmal `showUnfit = birthDate && views.ageOnly && views.unfitCount > 0 ? () => { statusLine.current?.focus(); views.setAgeOnly(false); } : undefined`. Ist es gesetzt, kann der Altersfilter etwas ausblenden.
  - Der Knopf sitzt im Leerzustand, und der verschwindet nach dem Tipp. Deshalb geht der Fokus vorher auf die Statuszeile (wie bei „ausblenden“, E3). Das geschieht an einer Stelle für alle vier Aufrufer, ohne neue Props in den Lazy-Chunks.
- `App.tsx` berechnet ebenso einmal `resetIfActive = activeFilterCount(route.filter, { limitActive: limitOn }) > 0 ? resetFilters : undefined`. Es ersetzt die bisherigen vier `() => setFilter(EMPTY_FILTER)` bzw. Bedingungen in `App.tsx:339, 361, 381, 397`.
- **`NoOffers`** (Liste, Karte, Anbieter) bekommt die Signatur
  ```ts
  NoOffers({ hasData, onResetFilter, age }: {
    hasData: boolean;
    onResetFilter?: (() => void) | undefined;            // nur mit aktiven URL-Filtern
    age?: { label: string; onShow: () => void } | undefined; // nur, wenn der Altersfilter etwas ausblendet
  })
  ```
  Text je nach Lage:
  | `onResetFilter` | `age` | Text | Knöpfe |
  |---|---|---|---|
  | ja | nein | „Mit diesen Filtern gibt es keine Angebote.“ (wie bisher) | Filter zurücksetzen |
  | nein | ja | „Nichts davon passt zu {label}.“ | Auch unpassende zeigen |
  | ja | ja | „Mit diesen Filtern passt nichts zu {label}.“ | Auch unpassende zeigen · Filter zurücksetzen |
  | nein | nein | „Mit dieser Auswahl gibt es keine Angebote.“ (bisheriger Text aus `ProviderScreen.tsx:72`; selten, im Anbieter-Tab über `providerRows` denkbar) | – |

  „Auch unpassende zeigen“ steht zuerst, weil es der direkte Weg ist. Danach erscheint der Warnhinweis aus E3. Ohne Daten (`hasData` falsch) gilt wie bisher „Noch keine Angebote“.
- Weitergereicht wird so:
  - Liste: `ListViewProps` (`ListView.tsx:16–20`) bekommt `onResetFilter?` (jetzt optional) und `age?` und reicht beide an `NoOffers`. `App.tsx:339` gibt `onResetFilter={resetIfActive}` und `age={showUnfit && { label: ageLabel, onShow: showUnfit }}` mit.
  - Karte: `MapPanel` → `map-types.ts` (`onResetFilter` wird optional, neues optionales `age`) → `MapScreen.tsx:114`.
  - Anbieter: `ProviderPanel`/`provider-types.ts` bekommt ein optionales `age`. In `ProviderScreen.tsx:59–74` entfällt der eigene Alters-Leerzustand samt Kommentar. Statt `onResetFilter ?? (() => {})` geht `NoOffers` mit `onResetFilter` und `age`. Die Bedingung `upcoming.length === 0 || onResetFilter` wird zu „kein aktiver Anbieter“, sonst bleibt sie gleich.
  - Kalender: `AgendaEmpty` bekommt `onShowUnfit?: () => void`. Im Zweig `agenda.hidden > 0` steht dann vor „Filter zurücksetzen“ der Knopf „Auch unpassende zeigen“.
    - Die Zahl bleibt `hiddenNote` (sie zählt je Tag Filter, Wegzeit und Alter zusammen). Der Knopf kann also an einem Tag erscheinen, an dem nur Filter ausblenden. Er schadet dort nicht: Danach steht der Warnhinweis da, und „ausblenden“ macht es rückgängig.
    - Eine Zählung je Tag nur fürs Alter wäre genauer, aber teurer. Verworfen.
- Der Kommentar `App.tsx:379` („Blendet allein das Alter aus, hilft Zurücksetzen nicht“) wird ersetzt durch: „Zurücksetzen nur mit aktiven URL-Filtern; fürs Alter gibt es ‚Auch unpassende zeigen‘ (Plan 0021, E4)“.

### E5 – Doku

- Plan 0003 bekommt je einen Vermerk `> **Geändert durch Plan 0021:** …` an den Zeilen 12, 72, 131, 145–149, 161, 206, 263, 301 und 374. Kernaussage: Der Schalter steht im Filter-Sheet, ist nicht gespeichert und ersetzt „trotzdem zeigen“. Zurücksetzen schaltet ihn wieder an.
- Plan 0005, Zeile 143: Vermerk „Altersfilter statt ‚trotzdem zeigen‘ (Plan 0021)“.
- Plan 0004, Zeile 158: Vermerk zum Ort des `OriginPicker` (der Schalter darüber entfällt).
- Plan 0008, Zeilen 375 und 899 (E12, Leerzustand im Kalender): Vermerk „Fürs Alter gibt es ‚Auch unpassende zeigen‘ (Plan 0021, E4)“.
- Ein ADR gibt es nicht. Es ändern sich weder eine Schicht noch eine Abhängigkeit noch das Schema. Die Speicherregel (Geburtsdatum nie in der URL) bleibt bestehen.
- `docs/architecture.md` nennt den Schalter nicht. In Schritt 1 wird das per grep geprüft.

## Tests (test-first)

1. **Unit `src/domain/age.test.ts`** (`ageVisibility`), zuerst rot:
   - `ageOnly: true` mit 2 unpassenden: `visible` ohne sie, `unfitCount` 2.
   - `ageOnly: false`: `visible === filtered`, `unfitCount` 2 (heute 0), `unfitIds` gesetzt.
   - Ohne Geburtsdatum: `{ visible: filtered, unfitCount: 0, unfitIds: ∅ }`.
2. **Unit `src/ui/format.test.ts`**: `ageOnlyNote` (an/aus × 0/1/viele) und `ageWarnText` (1/viele).
3. **Unit `src/ui/use-offer-views.test.ts`**: Startwert `ageOnly === true`. Das Muster „setState im Render“ (wie `:137–157`) zeigt: `setAgeOnly(false)` liefert alle Angebote, `unfitCount` bleibt gleich.
4. **E2E `e2e/app.spec.ts`**, ersetzt die beiden Tests in `:70–98`, Fixture mit Geburtsdatum 01.09.2026 (4 von 8 passen):
   - Nach dem Setzen des Geburtsdatums 4 Karten. **Keine** Zeile „passen nicht“, kein Knopf „trotzdem zeigen“.
   - Filter-Sheet öffnen. Der Schalter „Nur passend für 1 Mon.“ ist `aria-checked="true"`, der Untertitel lautet „4 weitere passen nicht · geprüft zum Kursstart“, im Fuß steht „4 Angebote zeigen“.
   - Schalter tippen. Der Fuß zeigt „8 Angebote zeigen“, der Untertitel „4 unpassende sind markiert · …“. Sheet schließen: 8 Karten, davon 4 `.card.unfit`. „Zeigt auch 4 Angebote, die nicht zu 1 Mon. passen“ ist sichtbar.
   - Tab „Kalender“: Der Hinweis steht dort auch (der Zustand überlebt den Tab-Wechsel).
   - „ausblenden“: 4 Karten, kein Hinweis, Fokus auf der Statuszeile.
   - Abschalten, dann neu laden: 4 Karten, kein Hinweis (Standard an).
   - Abschalten, im Filter-Sheet „Zurücksetzen“: Der Schalter ist wieder an.
   - Abschalten, im Kind-Sheet das Geburtsdatum auf 01.08.2026 ändern: Der Schalter ist wieder an, kein Hinweis.
   - Das Kind-Sheet hat keinen Schalter „Nur passende Angebote“ mehr (`toHaveCount(0)`).
   - Ohne Geburtsdatum hat das Filter-Sheet keinen Schalter „Nur passend für …“.
   - Die URL enthält weiter kein Geburtsdatum und keinen Altersschalter.
5. **E2E Leerzustände** (E4), zwei feste Fälle:
   - `?kat=bewegung` mit Geburtsdatum 01.09.2026 (nur „Bewegungslandschaft“, 24–36 Mon., unpassend; `kat=theater` gibt es nicht, und unter `buehne` passt das Babykonzert ohne `age` über `DEFAULT_AGE`): Die Liste zeigt „Mit diesen Filtern passt nichts zu 1 Mon.“, „Auch unpassende zeigen“ und „Filter zurücksetzen“. Ein Tipp auf „Auch unpassende zeigen“ bringt 1 Karte und „Zeigt auch 1 Angebot, das nicht zu 1 Mon. passt“. Die Statuszeile ist fokussiert.
   - Geburtsdatum 01.01.2023 ohne URL-Filter (alle 8 unpassend):
     - Liste: „Nichts davon passt zu …“ mit „Auch unpassende zeigen“, kein „Filter zurücksetzen“.
     - Anbieter-Tab: derselbe Leerzustand, Tipp bringt die Anbieter.
     - Kalender: Mi 7.10. im Wochenstreifen antippen (Offener Krabbeltreff; der Standardtag Mo 5.10. hat nur das schon beendete Elterncafé und zeigt „Für heute ist alles vorbei“). „Auch unpassende zeigen“ ist da, nach dem Tipp steht 1 Termin da.
     - Karte: Leerzustand der Ortsliste mit „Auch unpassende zeigen“.
6. **E2E Mobile-UX** (`e2e/mobile-ux.spec.ts`), zwei neue Zustände in der Matrix, damit `expectMobileUx` alle Gates prüft (320 px, Schrift 200 %, Touch-Ziele, Querformat, Hell/Dunkel, axe):
   - `filter-sheet-alter`: Geburtsdatum 01.09.2026, Filter-Sheet offen, Schalter aus.
   - `entdecken-alter-aus`: Geburtsdatum 01.09.2026, Schalter aus, Sheet zu, Warnhinweis sichtbar.
   - `entdecken-alter-leer`: `?kat=bewegung`, Geburtsdatum 01.09.2026. Zwei Textknöpfe stehen nebeneinander, die Matrix prüft Abstand und Umbruch bei 320 px und 200 % Schrift.
7. **E2E angepasst**: alle Stellen aus Schritt 1, die „trotzdem zeigen“, „passen nicht zu“ oder den Schalter im Kind-Sheet benutzen.

## Schritte

1. `grep -rn "trotzdem zeigen\|passen nicht zu\|Nur passende\|ageOnly\|showUnfit\|nur-passende" src e2e scripts docs` als Inventar. Die bekannten Fremdtreffer aus „Ausgangslage“ bleiben unberührt.
2. Unit-Tests für `ageVisibility` rot, dann `age.ts` ändern.
3. Unit-Tests für `ageOnlyNote` und `ageWarnText` rot, dann `format.ts`.
4. `useOfferViews` umbauen (E1), Test anpassen. `preferences.ts` und `use-app-state.ts` entschlacken.
5. `FilterSheet` (E2), `KidSheet`/`Overlays` (Schalter raus, `filterAge` rein), `App.tsx` (E3, `resetFilters`, `resetIfActive`, `showUnfit`), `NoOffers`, `ListView`, `MapScreen`/`map-types`, `ProviderScreen`/`provider-types`, `CalendarView` (E4), CSS `.age-warn`, Icon `alert`.
6. E2E schreiben und anpassen. `PW_PORT=4273 pnpm check:fast`, danach `PW_PORT=4273 pnpm check`.
7. Doku-Vermerke und Code-Kommentare (E5, E1, E4).
8. `/arch-review` (mehr als 200 Zeilen sind wahrscheinlich), Branch pushen, CI grün, Fast-Forward nach `main`, `/browser-review live`.

## Offene Punkte

- Keine. Die Annahme „nicht gespeichert“ (E1) folgt dem Wortlaut der Nutzermeldung („immer vorausgewählt“). Will der Nutzer das Abwählen doch dauerhaft speichern, ändert sich nur E1: `useState` würde dann wieder `useAgeOnly`.

## Review (2026-10-06) – Verdict: Überarbeiten → eingearbeitet

Unabhängiger `plan-reviewer`, keine Blocker. Alle Findings sind übernommen:

- **M1** Das Zurücksetzen bei neuem Geburtsdatum steht in `App.setBirthDate`, nicht im Hook. Es bleibt dort (Variante a) und wird per E2E statt per Unit getestet (E1, Tests 3/4).
- **M2** Die Leerzustände von Kalender und Anbieter wären Sackgassen geworden. Sie bekommen „Auch unpassende zeigen“ (E4, Leitlinie 5).
- **M3** `NoOffers` wird auch von Karte und Anbieter benutzt und zeigte „Filter zurücksetzen“ immer. Die Signatur, die Fälle und alle Aufrufer sind jetzt ausgeschrieben (E4).
- **M4** Die Mobile-UX-Matrix hat zwei neue Zustände (Tests 6).
- **m5** `.fact.warn` hat keine Warnfarbe. Die Linie nutzt jetzt `--hint-bad-line`, das Icon `currentColor` (E3).
- **m6** Das Icon `alert` hat einen festen Pfad (E3).
- **m7** Der Wortlaut ist jetzt ein ganzer Satz: „Zeigt auch …“ (E3).
- **m8** `setAgeOnly` setzt die Seitenzahl zurück (E1).
- **m9** `Overlays` bekommt ein Objekt `filterAge` (E2).
- **m10** IDs kommen aus `useId()`, die `h3` hat keine ID (E2).
- **m11** Der Leerzustand-Test hat feste Fälle: `?kat=theater` und 01.01.2023 (Tests 5).
- **m12** Die Doku-Vermerke sind vollständig (Plan 0003, 0004, 0005, 0008), dazu die veralteten Code-Kommentare (E5).
- **m13** Das Kind-Sheet verweist auf den Filter (E2).
- **m14** Die Behauptung „samt Tests“ ist korrigiert (E1).
- **m15** Die Fremdtreffer des grep sind markiert (Ausgangslage, Schritt 1).

Abgelehnt wurde nichts.

## Review Runde 2 (2026-10-06) – Verdict: Freigabe mit Auflagen → eingearbeitet

Neuer `plan-reviewer`, keine Blocker. Alle Punkte sind übernommen:

- **M1** `?kat=theater` gibt es nicht, unter `buehne` bleibt das Babykonzert stehen. Test 5 nimmt `?kat=bewegung`.
- **M2** Nach „Auch unpassende zeigen“ fiele der Fokus auf `<body>`. Jetzt geht er vorher auf die Statuszeile (E4).
- **m3** Der Kalendertag ist festgelegt: Mi 7.10. (Test 5).
- **m4** `ListView` bekommt neue Props (E4, Schritt 5).
- **m5** Für den Fall ohne Filter gilt der Text „Mit dieser Auswahl …“ (E4, Tabelle).
- **m6** Es gibt einen Mobile-UX-Zustand `entdecken-alter-leer` (Tests 6).
- **m7** Status und Review-Abschnitt sind aktualisiert.
