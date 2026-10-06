# Plan 0018 – Startseite entrümpeln

Status: freigegeben (Review Runde 2), Umsetzung offen
Datum: 2026-10-06
Bezug: Plan 0003 (E11, E15), Plan 0007 (E6), Plan 0009 (E1, E11), Plan 0012 (E10), ADR 0011 (Punkt 3), ADR 0015 (Kopf, Punkt 7)

## Ziel

Nutzermeldung (2026-10-06): Die Startseite wirkt überladen.

1. **Wegzeit-Hinweis kürzen.** „Wegzeit ab deinem Standort mit Bus & Bahn (Di vormittags, höchstens 1 Umstieg, inkl. Warten)“ belegt bei 320 px drei, bei 390 px zwei Zeilen. Er soll stark gekürzt in dieselbe Zeile wie „332 Angebote ab heute“. Geht das nicht, fällt er weg („gar nicht so wichtig“).
2. **Theme-Knopf im Kopf entfernen.** Die Wahl Hell/Dunkel/Automatisch steht schon im Kind-Sheet („Darstellung“) und bleibt nur dort.
3. **Kein Autofokus auf das Geburtsdatum, wenn es schon gesetzt ist.** Auf iOS öffnet der Fokus beim Öffnen des Kind-Sheets jedes Mal die Tastatur.

## Nicht-Ziele

- Das Wegzeit-Modell, die Kacheln („25 Min.“), das Detail („ca. 25 Min. mit Bus 37 → U1 ab Gostenhof“) und die Erklärung im Kind-Sheet bleiben unverändert.
- Das Kind-Sheet wird nicht umgebaut. „Darstellung“ bleibt an seinem Platz.
- Die Statuszeilen von Karte („8 Angebote an 5 Orten“) und Anbieter-Tab ändern ihren Zähltext nicht. Sie bekommen nur denselben kurzen Zusatz wie die Liste.
- Der Rückfall auf die Luftlinie (außerhalb, Fehler) ist selten. Er behält seine Begründung in der Statuszeile, nur kürzer (E1).

## Ausgangslage

- `src/ui/App.tsx:266–306`: Die Statuszeile ist `<p className="status" role="status" tabIndex={-1}>` mit `display: flex; flex-wrap: wrap` (`src/ui/styles/list.css:8`). Sie enthält
  - je Tab einen `<span>` mit den Zahlen,
  - optional `pwaNote` als `<span className="status-note">` in eigener Zeile (Plan 0011, E4),
  - bei `origin && reachMode` den Wegzeit-Hinweis als `<span className="status-note">` in eigener Zeile (`flex-basis: 100%`, `src/ui/styles/origin.css:70`). Beim Laden (`reachMode.kind === "laedt"`) ist er `pending`, also unsichtbar, aber mit Höhe (E11, M7).
- `src/ui/format.ts:257` `reachNote(mode, origin)`:
  - ÖPNV oder lädt: „Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, höchstens 1 Umstieg, inkl. Warten)“.
  - Luftlinie: „Entfernung als Luftlinie ab Gostenhof – außerhalb des Stadtgebiets.“ bzw. „… – Wegzeiten gerade nicht verfügbar.“
- Das Kind-Sheet erklärt das Modell schon ausführlich unter „Wegzeit ab“ (`transitSourceNote` mit `TRANSIT_RULE`, `src/domain/transit.ts:43`: „Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß für einen Dienstagvormittag, inklusive Warten. … mehr als einen Umstieg gibt es nicht …“). `originHint` meldet dort „außerhalb des Stadtgebiets“ schon selbst (Plan 0009, N3). Das Filter-Sheet begründet gesperrte Grenzen mit `limitReason` („Wegzeiten gerade nicht verfügbar.“).
- `src/ui/Chrome.tsx:9–42` `Header`: Marke, Knopf „Kind und Einstellungen“ und `iconbtn` mit Sonne/Mond (`onToggleTheme`). Unter 380 px blendet `src/ui/styles/chrome.css:318–325` den Knopf aus (Plan 0007, E6).
- `src/ui/App.tsx` reicht `dark` und `onToggleTheme` an `Header`. `useTheme()` (`src/ui/use-app-state.ts:165`) liefert `dark` auch für `meta[name="theme-color"]` und bleibt.
- `src/ui/Dialog.tsx`: `showModal()` fokussiert das Element mit `autofocus`, sonst das erste fokussierbare Element, im Kind-Sheet also das Feld „Geburtsdatum“. `OriginPicker` setzt `autofocus` bereits per Ref-Callback (`markAutofocus`) auf die Stadtteil-Auswahl, wenn das Sheet über „Startpunkt wählen“ öffnet (`focusOrigin`).
- Tests, die den alten Text oder den Kopf-Knopf benutzen:
  - `src/ui/format.test.ts:340–355` (`reachNote`),
  - E2E mit dem langen Text: `e2e/smoke.spec.ts:82`, `e2e/karte.spec.ts:274`, `e2e/startpunkt.spec.ts:21` (`WEGZEIT_STANDORT`) und weitere Stellen in `startpunkt.spec.ts`,
  - E2E mit „Wegzeit ab Gostenhof mit Bus & Bahn“: `e2e/anbieter-inhalt.spec.ts:59`, `e2e/mobile-ux.spec.ts:39`, `e2e/karte.spec.ts:246`,
  - weitere lange Texte: `e2e/pwa.spec.ts:12`, `e2e/startpunkt.spec.ts:30` (`WEGZEIT_GOSTENHOF`) und `:203`,
  - `e2e/startpunkt.spec.ts:100–106` verlangt das Gegenteil des neuen Entwurfs (eigene Zeile, kein „·“),
  - `e2e/startpunkt.spec.ts:671/674` prüft `.status-note` auf `visibility`,
  - E2E mit „Entfernung als Luftlinie …“: `e2e/startpunkt.spec.ts:353` und `:531`,
  - E2E mit „Wegzeiten gerade nicht verfügbar.“ (mit Punkt) auf der Statuszeile als Signal für den Fehlerzustand: `e2e/startpunkt.spec.ts:423, 449, 458, 474, 479, 498, 506`, `e2e/mobile-ux.spec.ts:164, 193`, `e2e/anbieter-inhalt.spec.ts:74`; mit „außerhalb des Stadtgebiets.“: `e2e/mobile-ux.spec.ts:219`. Die Stellen im Filter-Sheet (`startpunkt.spec.ts:364/371`) bleiben unberührt,
  - E2E mit „Dunkle/Helle Darstellung“: `e2e/theme.spec.ts:6–20` und `:69–92`,
  - `e2e/layout.spec.ts:75–98`: Die Kopfzeilen-Matrix wirft „Kopfzeile fehlt“ ohne `.iconbtn` im Kopf und verlangt den Theme-Knopf ab 384 px,
  - `scripts/screenshots.ts:47` wartet auf `.status-note:not(.pending)`,
  - nur Kommentare: `e2e/mobile-ux.spec.ts:111` und `:159`, `e2e/anbieter-inhalt.spec.ts:6`. `e2e/perf.spec.ts:52` bleibt als Teilstring gültig.
- Auf „Entdecken“ und „Karte“ teilt sich `.status` die `.status-row` mit „Liste | Karte“ (`src/ui/styles/map.css:19–26`: `.status` `flex: 1 1 10rem`, Umschalter `flex: 0 1 12rem`, Lücke 12 px, zusammen 364 px). Ab 412 px Viewport (380 px Inhalt) steht der Umschalter **neben** der Statuszeile, die dann nur ca. 176 px breit ist. Bei 390/393 px rutscht er darunter.

## Entscheidungen

### E1 – Wegzeit-Hinweis als kurzer Zusatz in der Zählzeile

- Neuer Text von `reachNote(mode, origin)`, ohne Satzzeichen am Ende:
  - ÖPNV oder lädt: „Wegzeit ab Gostenhof“, „Wegzeit ab deinem Standort“, „Wegzeit ab der Kartenmitte“.
  - Luftlinie, außerhalb: „Luftlinie ab deinem Standort (außerhalb des Stadtgebiets)“.
  - Luftlinie, Fehler: „Luftlinie ab Gostenhof (Wegzeiten gerade nicht verfügbar)“.
  - Der Rückfall ist selten und braucht seinen Grund auf der Seite. Im Fehlerfall nennt ihn das Kind-Sheet für einen Stadtteil nicht (`originHint` liefert dort nichts), und ohne `wegzeit=` gibt es keinen `limitHint`. ADR 0011, Punkt 9 verlangt den Hinweis „außerhalb des Stadtgebiets“. Die Länge ist hier zweitrangig, Ziel ist der kurze Normalfall.
- Warum der Startpunkt bleibt und nicht ganz wegfällt: Seit Plan 0016 bleibt auch der Standort gespeichert. Ohne Hinweis sähe man nach Tagen „25 Min.“ ohne zu wissen, ab wo. Die Annahme (Di vormittags, 1 Umstieg, Warten) steht dagegen schon im Kind-Sheet und fällt aus der Statuszeile.
- Darstellung: Der Zusatz steht im **selben** `<span>` wie die Zahlen, als Fließtext, nicht als eigenes Flex-Element:
  ```tsx
  <span>
    <b>{n}</b> Angebote ab heute
    {reach && (
      <span className={reach.pending ? "status-reach pending" : "status-reach"}>
        {" · "}
        <span className="status-reach-text">{reach.text}</span>
      </span>
    )}
  </span>
  ```
  - `" · "` klebt den Punkt an das letzte Wort davor. Bricht die Zeile um, steht der Punkt am Ende der ersten Zeile, nie verwaist am Anfang der zweiten (der Grund für die eigene Zeile in Plan 0012).
  - `.status-reach-text { display: inline-block; }`: Der Ausdruck wandert als Ganzes in die nächste Zeile, statt nach „Wegzeit ab“ umzubrechen. Ist er breiter als die Zeile (320 px, 200 % Schrift), bricht er innerhalb des Blocks um, ohne horizontal zu überlaufen.
  - Zugesagt ist nur, was der Aufbau garantiert:
    - kein horizontaler Überlauf, bei jeder Breite und jedem Namen,
    - der „·“ hängt am letzten Wort davor,
    - einzeilig für „Wegzeit ab Gostenhof“ auf „Kalender“ ab 390 px.
  - Lange Namen („Wegzeit ab Röthenbach b. Schweinau“, `src/domain/districts.ts:50`) und der schmale Platz neben dem Umschalter (ab 412 px auf „Entdecken“/„Karte“, ca. 176 px) ergeben zwei oder drei Zeilen. Das ist erlaubt und immer noch kürzer als heute. Bewusst wird die Statuszeile **nicht** per `flex-basis` verbreitert: Dann stünde der Umschalter auf allen Handys in einer eigenen Zeile, die Seite würde also nicht kürzer.
  - Reihenfolge mit `pwaNote`: „Offline – Stand vom …“ steht danach **unter** der Zählzeile samt Zusatz, vorher stand es über dem Wegzeit-Hinweis. Die Live-Region sagt also erst Zahl und Startpunkt, dann den Offline-Stand. Das ist gewollt, denn beides gehört zur Zahl.
  - Im Code steht am NBSP ein Kommentar („U+00A0: kein Umbruch vor dem Punkt“), denn mit einem normalen Leerzeichen wären fast alle Gates grün.
  - Die drei Zählvarianten (Liste/Kalender, Karte, Anbieter) bekommen den Zusatz gleich. Damit es nicht dreimal im JSX steht, rendert ein kleiner Helfer in `App.tsx` (`ReachSuffix`) den Zusatz und wird in jedem Zweig ans Ende des Zähl-`<span>` gesetzt.
- Laden (`reachMode.kind === "laedt"`): Der Zusatz trägt `pending` und steht unsichtbar mit dem endgültigen Text da, wie bisher (`visibility: hidden`, keine Ansage, keine Breitenänderung). Die Regel `.status-note.pending` (`origin.css:93`) wird durch `.status-reach.pending` **ersetzt**, `pwaNote` hat keinen Ladezustand.
- Screenreader: Die Live-Region sagt „332 Angebote ab heute · Wegzeit ab Gostenhof“. Der Punkt bleibt Text wie überall in der App (Kacheln, Detail); kein `sr-only`-Trenner mehr.
- CSS: Die Regel `.status-note { flex-basis: 100% }` in `origin.css` gilt danach nur noch für `pwaNote`. Sie zieht samt Kommentar nach `list.css` zur Statuszeile. In `origin.css` steht stattdessen die Regel für `.status-reach-text`.
- `scripts/screenshots.ts:47` wartet künftig auf `.status-reach:not(.pending)`.

### E2 – Theme-Knopf im Kopf entfällt

- `Header` verliert die Props `dark` und `onToggleTheme` und den `iconbtn`. `App.tsx` reicht beides nicht mehr. Bleibt eine Funktion für den Umschalter in `App.tsx` ohne Nutzer, fällt sie weg.
- Die Container-Query `@container kopf` für `.hdr .iconbtn` (`chrome.css:318–325`) entfällt samt Kommentar. Ebenso entfällt `container: kopf / inline-size` an `.hdr` (`chrome.css:6–8`), das sonst totes Containment wäre. Die Klasse `.iconbtn` selbst bleibt, `CalendarView` und `DetailDialog` nutzen sie.
- Die Icons `sun`/`moon` in `icons.tsx` fallen samt `case "sun"` (`icons.tsx:32`) weg.
- Überholte Kommentare werden angepasst: `chrome.css:23`, `chrome.css:319`, `e2e/karte.spec.ts:63`, `e2e/mobile-ux.spec.ts:316`.
- `useTheme()` bleibt unverändert: `dark` steuert weiter `theme-color`.
- Der Knopf „Kind und Einstellungen“ behält `margin-left: auto` und steht damit rechts außen.

### E3 – Kein Autofokus auf ein ausgefülltes Geburtsdatum

- War beim Öffnen ein Geburtsdatum gespeichert und öffnet das Sheet nicht über „Startpunkt wählen“, bekommt die Überschrift „Dein Zwerg“ (`h2`) `tabIndex={-1}` und das HTML-Attribut `autofocus`. **Beides nur unter dieser Bedingung** (`tabIndex={focusHeading ? -1 : undefined}`): Ohne Autofokus-Kandidat nimmt `showModal()` das erste fokussierbare Element, und dazu zählt auch `tabindex=-1`. Eine immer fokussierbare Überschrift nähme dem leeren Feld den Fokus. `showModal()` fokussiert dann die Überschrift statt des Feldes. Auf iOS öffnet sich keine Tastatur. Ein Screenreader beginnt beim Titel des Sheets.
- Ohne Geburtsdatum bleibt es wie heute: Das Feld bekommt den Fokus, denn dann ist Eintippen der wahrscheinliche Zweck.
- Über „Startpunkt wählen“ (`focusOrigin`) bleibt die Stadtteil-Auswahl das Ziel. Die Überschrift bekommt dann kein `autofocus`, sonst gewönne sie als erstes Element in Baumreihenfolge.
- Umsetzung wie in `OriginPicker`: Ref-Callback `markAutofocus`, der das Attribut setzt (Reacts `autoFocus` fokussiert vor `showModal()` und schreibt kein Attribut). Der Helfer zieht dafür in eine gemeinsame Stelle (`src/ui/Dialog.tsx`, exportiert), `OriginPicker` importiert ihn von dort. Der Typ wird `HTMLElement`.
- Maßgeblich ist der Stand **beim Öffnen**: `const [focusHeading] = useState(() => birthDate !== undefined && !focusOrigin)`. Tippt man im offenen Sheet ein Datum ein, ändert sich nichts mehr am Fokus. Das Sheet wird bei jedem Öffnen neu gemountet (`Dialog` rendert die Kinder nur bei `open`), der Wert ist also je Öffnen frisch.
- Fokusring: Die Überschrift bekommt den globalen `:focus-visible`-Ring wie die Statuszeile (ebenfalls `tabIndex={-1}`). Nach einem Tipp zeigen Chromium und WebKit ihn bei programmatischem Fokus nicht; nach Tastatur schon, das ist richtig.

### E4 – Doku

- **Neues ADR 0019 „Statuszeile nennt nur den Startpunkt“** (kurz, Status „angenommen“, Nutzerentscheidung 2026-10-06):
  - Kontext: Der Hinweis belegte zwei bis drei Zeilen.
  - Entscheidung: E1. Die Annahme steht im Kind-Sheet unter „Wegzeit ab“ (`TRANSIT_RULE`), der Rückfall auf die Luftlinie behält seinen Grund in Klammern.
  - Alternativen: Hinweis ganz weglassen (verworfen: Der gespeicherte Startpunkt wäre auf der Seite unsichtbar), Umschalter immer darunter.
  - Konsequenzen: siehe E1.
- ADR 0015 bekommt die Kopfzeile „**Geändert durch ADR 0019 (Plan 0018):** Die Anzeige in der Statuszeile (Kopf, „Di vormittags, höchstens 1 Umstieg, inkl. Warten“) gilt nur noch für die Erklärung im Kind-Sheet.“
- ADR 0011 bekommt in den Kopfzeilen den Vermerk „**Geändert durch ADR 0019 (Plan 0018):** Wortlaut der Statuszeile. Punkt 9 bleibt erfüllt (‚außerhalb des Stadtgebiets‘ steht weiter dort).“
- Plan 0003 (E15) und Plan 0007 (E6) bekommen je einen Vermerk nach dem Muster `> **Geändert durch Plan …**` (`docs/plans/0003-design-stickerheft.md:218`): „Der Theme-Knopf im Kopf entfällt, die Darstellung steht nur im Kind-Sheet (Plan 0018, E2).“
- Kommentare in `format.ts` (`reachNote`), `App.tsx` (Statuszeile) und `Chrome.tsx` (Kopf) werden angepasst.
- `docs/architecture.md` nennt den Knopf und die Statuszeile nicht im Wortlaut, keine Änderung.

## Tests (test-first)

1. **Unit `src/ui/format.test.ts`** (`reachNote`), zuerst rot:
   - ÖPNV ab Stadtteil → „Wegzeit ab Gostenhof“, ab Standort → „Wegzeit ab deinem Standort“, ab Kartenmitte → „Wegzeit ab der Kartenmitte“.
   - Lädt → derselbe Text wie ÖPNV.
   - Luftlinie außerhalb ab Standort → „Luftlinie ab deinem Standort (außerhalb des Stadtgebiets)“, ab Kartenmitte → „Luftlinie ab der Kartenmitte (außerhalb des Stadtgebiets)“.
   - Luftlinie Fehler ab Gostenhof → „Luftlinie ab Gostenhof (Wegzeiten gerade nicht verfügbar)“.
2. **E2E Statuszeile** (ersetzt `e2e/startpunkt.spec.ts:100–106`), mit Stadtteil Gostenhof:
   - Die Statuszeile enthält „8 Angebote ab heute · Wegzeit ab Gostenhof“ (Zahl aus der Fixture).
   - Der „·“ steht in derselben Zeile wie „heute“ (Rechteck per `Range` über den Textknoten, `top` beider gleich ±1 px). Das gilt auch bei 320 px und 200 % Schrift (wie die Schrift-Matrix in `layout.spec.ts`).
   - Auf dem Tab „Kalender“ ist die `.status` ab 390 px Viewport einzeilig (Höhe ≤ 1,5 × berechnete `line-height`).
   - Kein horizontaler Überlauf der Statuszeile (`scrollWidth <= clientWidth`) und „·“ in derselben Zeile wie das Wort davor. Geprüft wird auf jedem Projekt mit Gostenhof und mit „Röthenbach b. Schweinau“, dazu auf „Karte“ mit der Kartenmitte als Startpunkt.
3. **E2E angepasst**: alle Stellen aus „Ausgangslage“ auf die neuen Texte.
   - Die Fehler- und Außerhalb-Signale prüfen „Wegzeiten gerade nicht verfügbar“ bzw. „außerhalb des Stadtgebiets“ ohne Schlusspunkt, denn der Text steht jetzt in Klammern.
   - `startpunkt.spec.ts:671/674` prüft `.status-reach` statt `.status-note`.
   - `layout.spec.ts:75–98` sucht kein `.iconbtn` mehr im Kopf und sichert stattdessen zu, dass es dort keines gibt. Wo heute „Wegzeit ab Gostenhof mit Bus & Bahn“ als Signal „Wegzeit geladen“ dient, wird daraus „Wegzeit ab Gostenhof“ **plus** eine Prüfung, die erst mit geladener Wegzeit stimmt (z. B. `.status-reach:not(.pending)` sichtbar oder eine Kachel mit „Min.“), weil der Text jetzt auch im Ladezustand unsichtbar im DOM steht. Das galt schon vorher (der `pending`-Text stand auch im DOM), wird aber beim Umbau einmal geprüft: `toContainText` auf einer Live-Region mit `visibility: hidden`-Kind liest den Text trotzdem.
4. **E2E Kopf** (`e2e/theme.spec.ts`):
   - Test 1 „Kopf-Knopf schaltet um …“ wird zu „Darstellung im Kind-Sheet überlebt das Neuladen“: über das Kind-Sheet „Dunkel“ wählen, neu laden, `data-theme="dark"`, im Sheet ist „Dunkel“ `aria-pressed`. Kein `test.skip` mehr nach Breite.
   - Test „Darstellung wechselt bei reduzierter Bewegung sofort …“ schaltet über das Kind-Sheet, ohne Breiten-Skip. Gemessen wird 300 ms nach dem Tipp auf „Dunkel“ **bei offenem Sheet** (`getComputedStyle` wirkt auch hinter dem Dialog), erst danach wird geschlossen. Sonst käme die Schließzeit dazu. `expectAccessible` läuft nach dem Schließen.
   - Neue Zusicherung: Im Kopf gibt es keinen Knopf „Dunkle Darstellung“/„Helle Darstellung“ (`toHaveCount(0)`).
5. **E2E Autofokus** (in `e2e/app.spec.ts`):
   - Ohne Geburtsdatum: Kind-Sheet öffnen → `Geburtsdatum` ist fokussiert (bisheriges Verhalten festgehalten).
   - Mit gespeichertem Geburtsdatum (vorher setzen, Sheet schließen, erneut öffnen): Überschrift „Dein Zwerg“ ist fokussiert, das Feld nicht.
   - „Startpunkt wählen“ mit gespeichertem Geburtsdatum: Stadtteil-Auswahl ist fokussiert (ergänzt die bestehenden Tests in `startpunkt.spec.ts:586/626`).
   - Läuft auch auf `iphone-15` (WebKit), dort zählt es.
6. **Accessibility**: `expectAccessible` läuft in den bestehenden Tests mit offenem Kind-Sheet weiter; eine fokussierbare Überschrift mit `tabindex="-1"` ist zulässig.

## Schritte

1. `grep -rn` nach allen Textstellen (Ausgangslage) und nach `iconbtn`, `sun`, `moon`.
2. Unit-Tests für `reachNote` rot schreiben, dann `reachNote` ändern.
3. Statuszeile in `App.tsx` umbauen (E1), CSS verschieben und ergänzen, `screenshots.ts` anpassen.
4. `Header` entschlacken (E2), CSS und Icons aufräumen.
5. `markAutofocus` nach `Dialog.tsx`, Überschrift im Kind-Sheet (E3).
6. E2E anpassen und ergänzen (Tests 2–5).
7. Doku (E4).
8. `pnpm check:fast`, dann `PW_PORT=4273 pnpm check`.
9. Branch pushen, CI grün, Fast-Forward nach `main`, CI auf `main` grün, `/browser-review live`.

## Risiken

- **Start-JS-Budget** (ADR 0012): Die Änderung entfernt mehr als sie hinzufügt (Icons, Knopf, längere Texte). Kein Risiko erwartet; `pnpm check` misst.
- **Zeilenzahl**: Bei langen Stadtteilnamen („Röthenbach b. Schweinau“) oder neben dem Umschalter bricht der Zusatz um. Das ist erlaubt (E1) und immer noch kürzer als bisher.
- **Fokusring auf „Dein Zwerg“**: Die Überschrift liegt in `.sheet-scroll` mit Overflow, ein 3-px-Umriss kann beschnitten werden. Der Browser-Review prüft das nach Öffnen per Tastatur, auch im Querformat.
- **iOS-Verhalten von `autofocus` im `<dialog>`**: WebKit unterstützt das Attribut bei `showModal()` (seit Safari 15.4). Der E2E-Test auf `iphone-15` (Playwright-WebKit) belegt es; ein echtes iPhone prüft der Nutzer.
- **Live-Region-Ansage beim Wechsel ÖPNV ↔ Luftlinie**: ändert sich nur der Zusatz, sagt die Live-Region die ganze Zeile neu an. Das war vorher genauso.

## Review (2026-10-06) – Verdict: Überarbeiten

Geprüft hat der Subagent `plan-reviewer`, ohne Chat-Kontext.

Übernommen:
- **B1 (Blocker)**: Ab 412 px steht „Liste | Karte“ neben der Statuszeile, die dann nur ca. 176 px breit ist. Die Erwartung „eine Zeile ab 390 px“ stimmte dort nicht.
  - E1 erlaubt neben dem Umschalter zwei kurze Zeilen, die nicht höher sind als der Umschalter.
  - Test 2 misst die Einzeiligkeit auf „Kalender“ und auf „Entdecken“ die Höhe der `.status-row`.
  - 360 px ist ausdrücklich festgelegt.
- **W2**: Die Testliste war lückenhaft. Neu in der Ausgangslage stehen `layout.spec.ts:75–98`, `startpunkt.spec.ts:30/100–106/203/353/531/671/674`, `pwa.spec.ts:12` und alle Fehler- und Außerhalb-Signale. Den Ersatz je Stelle nennt Test 3.
- **W3**: Im Fehlerfall verschwände die einzige Erklärung auf der Seite. Entschieden ist Variante (a): Der seltene Rückfall auf die Luftlinie behält den Grund kurz in Klammern. So bleibt ADR 0011, Punkt 9 erfüllt, und die Fehler-Signale der E2E-Tests bleiben ohne Schlusspunkt gültig.
- **H5**: ADR-Weg. ADR 0015 bekommt die Kopfzeile „Geändert durch Plan 0018“ nach dem Muster von ADR 0011, dazu ein Vermerk in ADR 0011, Punkt 9 (E4).
- **H6**: Aufräumen von `case "sun"`, `container: kopf` und überholten Kommentaren. `.status-note.pending` wird ersetzt statt erweitert.
- **H7**: Der Theme-Test misst bei offenem Sheet.
- **H8**: Der Fokusring wird im Browser-Review geprüft (siehe Risiken).

Abgelehnt:
- **W4** („Der Punkt kann verwaist am Zeilenanfang stehen“): Der Plan schreibt den Trenner schon als `" · "` mit geschütztem Leerzeichen vor dem Punkt. Vor dem Punkt gibt es also keine Umbruchstelle. Der vorgeschlagene Test ist trotzdem übernommen (Test 2: Punkt in derselben Zeile wie „heute“, auch bei 320 px und 200 %).
- **H9** (Autofokus auch ohne Geburtsdatum abschalten): Der Nutzer hat ausdrücklich nur den Fall „wenn es bereits ausgefüllt ist“ gemeldet. Ohne Datum ist Eintippen der Zweck des Sheets.

Bestätigt (H10):
- Der Ref-Callback läuft vor `showModal()`.
- Das Sheet wird bei jedem Öffnen neu gemountet.
- `expectStatusHidden` bleibt grün.
- `theme.dark` wird weiter für `MapPanel` gebraucht.
- `.iconbtn` wird weiter gebraucht.

## Review Runde 2 (2026-10-06) – Verdict: Freigabe mit Änderungen

Geprüft hat ein neuer Subagent `plan-reviewer`. Keine Blocker. Alles übernommen:
- **W1**: Test 1 widersprach E1 (Rückfall ohne Klammer-Grund). Test 1 trägt jetzt die vollen Texte, dazu den Fall Kartenmitte außerhalb.
- **W2**: Die Layout-Zusagen galten nur für kurze Namen. E1 sagt nur noch zu, was der Aufbau garantiert: kein Überlauf, Punkt am Wort davor, einzeilig für Gostenhof auf „Kalender“ ab 390 px. Test 2 prüft auch „Röthenbach b. Schweinau“ und die Kartenmitte auf „Karte“. Die Zusage „`.status-row` ≤ Umschalter“ ist gestrichen, mit Begründung gegen `flex-basis` in E1.
- **W3**: Der Weg über den Plan-Vermerk im ADR war kein etabliertes Muster. Stattdessen gibt es ein neues ADR 0019, auf das ADR 0011 und 0015 per „Geändert durch ADR 0019“ verweisen.
- **H4**: `tabIndex` ist genauso bedingt wie `autofocus` (E3).
- **H5**: Übersehene Kommentar-Stellen stehen jetzt in der Ausgangslage.
- **H6**: Vermerke in Plan 0003 und Plan 0007 (E4).
- **H7**: Die Reihenfolge mit `pwaNote` ist in E1 festgelegt.
- **H8**: Der NBSP bekommt einen Kommentar im Code (E1).
