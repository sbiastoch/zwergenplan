# Plan 0060 – Filter-Reihenfolge und Sheets nach unten wischen

Status: in Umsetzung
Datum: 2026-11-01

Bezug:
- Plan 0021 (Filter-Sheet), Plan 0059 (Detail über der großen Karte, Griff `.detail-grab`).
- `docs/architecture.md`, „Mobile-UX-Gates“.
- Commit 37fb047 (Kleinänderung): Zeitraum ohne Überlappen, kein weißer Fokusrahmen, „bis 10 Min.“. Dieselbe Rückmeldung, nicht Teil dieses Plans.

## Anlass

Rückmeldung des Nutzers vom 2026-11-01, am Handy:

1. Im Filter-Sheet sollen die wichtigsten Filter oben stehen.
2. Sheets von unten mit Griff oben sollen sich nach unten wegwischen lassen, wie man es kennt.

## Befund

- **Reihenfolge** (`FilterSheet` in `src/ui/Sheets.tsx`): Merkliste (nur Merkliste), Alter, Tageszeit, Art, Format, Anmeldung, Kosten, Zeitraum, Wegzeit. Die harten Bedingungen „wann“ und „wie weit“ stehen ganz unten, unter der Falz.
- **Keine Wischgeste**: Zehn Ansichten zeichnen `.grab`: Filter, Merklisten-Filter, Kind/Startpunkt, Link zum Teilen, Anbieter-Sheet, Orts-Sheets beider Karten, Wege, Liste im Ausschnitt und das Detail über der großen Karte. Alle laufen über `Dialog` (`src/ui/Dialog.tsx`, natives `<dialog>`), und zwar mit `className` `sheet`, `sheet over-map` oder `detail over-map`. Heute schließen sie per Backdrop-Tipp, Esc/Zurück (`cancel`) oder Knopf, jeweils über `onClose`. Das Vollbild-Detail (`detail` ohne `over-map`) und das Onboarding (`onb`) haben keinen Griff.
- Gescrollt wird in `.sheet-scroll` (Sheets) bzw. im Scroller von `DetailContent` (Detail). Der Griff von Sheets liegt in `.sheet-scroll` und scrollt mit weg. Beim Detail über der Karte steht er als Knopf `.detail-grab` außerhalb des Scrollers (Tipp schaltet `voll`).

## Entscheidungen

- **E1 Reihenfolge**: Merkliste (nur dort), Alter, Wegzeit, Zeitraum, Tageszeit, Art, Kosten, Anmeldung, Format. Zuerst kommen die harten Bedingungen, ob ein Angebot überhaupt geht: passt es zum Kind, schaffen wir den Weg, passt der Termin. Danach die Vorlieben (Tageszeit, Art), am Ende die Feinheiten. Die Begründung unter der Wegzeit (`reason`, ohne Startpunkt) wandert mit. Logik und Zustand ändern sich nicht, nur die Reihenfolge im JSX.
- **E2 Modul** `src/ui/sheet-swipe.ts`:
  - Reine Entscheidung `swipeOutcome({ dy, ms, height }): "close" | "stay"`. Sie schließt bei `dy > min(120, height × 0,25)`, oder schnell (`dy / ms > 0,5`) ab `dy > 24`. Sonst bleibt das Sheet offen.
  - Hook `useSheetSwipe(ref, onSwipe | undefined)`, Touch-Ereignisse am `<dialog>`:
    - `touchstart` (passiv) merkt Lage und Zeit. Kein Start auf `input, select, textarea`, keiner, wenn ein Vorfahr des Ziels innerhalb des Dialogs `scrollTop > 0` hat (dann scrollt der Nutzer Inhalt), und keiner außerhalb des Sheet-Rechtecks, denn der Backdrop trifft ebenfalls das `<dialog>`. Eine noch laufende Öffnungsanimation (`up`) wird mit `getAnimations().finish()` beendet, denn CSS-Animationen stehen in der Kaskade über dem Inline-`transform`.
    - `touchmove` (`passive: false`): Entschieden wird erst ab 8 px Weg (`Math.hypot`), weil iOS schon ab 1 px meldet und ein Zittern den Wisch sonst abbräche. Bis dahin ruft eine Abwärtsbewegung schon `preventDefault()`, eine Aufwärtsbewegung nie, sonst bräche iOS das Scrollen der ganzen Geste ab. Danach entscheidet die Richtung. Geht sie nach unten und mehr senkrecht als waagerecht, ist es ein Wisch, und ab dann ruft jedes `touchmove` `preventDefault()`. So scrollt der Inhalt nicht mit, auch in Chrome, das `touchmove` nach Scrollbeginn nicht mehr abbrechen lässt. Sonst wird die Geste verworfen. Während des Wischens gilt `transform: translateY(dy)` ohne Übergang.
    - `touchend`: Bei `"close"` gleitet das Sheet aus (`translateY(100%)`, 0,2 s), danach ruft der Hook `onSwipe`. `transform` bleibt bis zum `close`-Ereignis des `<dialog>` stehen und wird erst dann zurückgesetzt. Das Schließen kommt verzögert (bei Detail und Anbieter-Sheet über `history.back()`/`popstate`, sonst im Effekt von `Dialog`), und sofort zurückgesetzt stünde das Sheet einen Frame lang wieder da. Bei `"stay"` federt es zurück (0,2 s) und wird danach zurückgesetzt. Gewartet wird per `setTimeout`, nie auf `transitionend` (`motion.css`). Mit `prefers-reduced-motion: reduce` (`matchMedia`) ist der Timer 0, das Sheet schließt bzw. springt sofort zurück. `touchcancel` zählt als `"stay"`.
    - Während das Sheet ausgleitet (`closing`), zählt keine neue Berührung. Eine neue Berührung beendet ein laufendes Zurückfedern samt Timer.
    - Der Rückruf liegt in einem Ref, der Effekt hängt nur an „an/aus“. Sonst hängte sich die Geste bei jedem Render neu an (`onClose` ist jedes Mal neu) und bräche einen laufenden Schließ-Timer ab.
  - Ohne `onSwipe` hängt der Hook nichts an.
- **E3 Einbindung**: `Dialog` ruft `useSheetSwipe(ref, swipesFor(className) ? onClose : undefined)`. Die reine Funktion `swipesFor` (in `sheet-swipe.ts`) zerlegt `className` in Klassen und ist wahr bei `sheet` oder `over-map`. Kein Aufrufer ändert sich. Das Wischen nimmt denselben Weg wie der Backdrop-Tipp (`onClose`). Verlauf (`history.back()` bei Detail und Anbieter-Sheet) und Fokus-Rückgabe bleiben dadurch gleich. Beim Detail über der Karte schließt ein Wisch auch aus `voll`, statt erst zu verkleinern; das ist einheitlich und einfacher.
- **E4 Keine Tastatur-Entsprechung nötig**: Esc/Zurück und die Knöpfe bleiben der zugängliche Weg (WCAG 2.5.1: Die Geste hat eine Alternative mit einem Zeiger, den Backdrop-Tipp).

## Nicht-Ziele

- Sheets per Ziehen vergrößern (Snap-Punkte) und Wischen mit der Maus. Kommt nach `docs/ideas.md`, „Sheets per Ziehen vergrößern“.

## Schritte und Tests

1. **Unit** `src/ui/sheet-swipe.test.ts` (test-first): `swipeOutcome` für kurz/langsam (`stay`), weit/langsam (`close` bzw. knapp unter der Schwelle `stay`), schnell ab 24 px (`close`), schnell unter 24 px (`stay`), nach oben (`stay`) und kleines Sheet (Schwelle 25 % der Höhe). `swipesFor`: `sheet`, `sheet over-map`, `detail over-map voll` → ja; `detail`, `onb`, `sheetfoot` → nein.
2. E1: Abschnitte in `FilterSheet` umsortieren.
3. **E2E** `app.spec.ts` und `merkliste-liste.spec.ts`: Die `h3` beider Filter-Sheets erscheinen in der Reihenfolge von E1. Gleich danach läuft `pnpm e2e:local e2e/app.spec.ts e2e/merkliste-liste.spec.ts`.
4. E2, E3 umsetzen.
5. **E2E** neue Spec `e2e/sheet-swipe.spec.ts` mit Eintrag in `SPEC_COVERS` (`scripts/lib/e2e-map.ts`) für `src/ui/sheet-swipe.ts`, `src/ui/Dialog.tsx` und `src/ui/styles/(sheet|dialog|motion).css`. Sie läuft nur in Chromium mit Touch-Emulation (`pixel-7`), mit Touch über CDP `Input.dispatchTouchEvent` wie `karte-gross.spec.ts`. Fälle:
   - Filter-Sheet: Wisch vom Griff 250 px in 10 Schritten nach unten → Sheet zu, Fokus zurück auf „Alle Filter“. Eine Aufzeichnung der Oberkante je Frame zeigt, dass es nach dem Ausgleiten nie wieder hochkam. Beim nächsten Öffnen ist `transform` leer.
   - Mit `reducedMotion: "reduce"`: Der Wisch schließt sofort (unter 500 ms).
   - Zittriger Anfang (erst 2 px schräg, dann senkrecht) → schließt.
   - Waagerechter Wisch und Start auf dem Datumsfeld „von“ → bleibt offen.
   - Kurzer, langsamer Wisch (40 px über 600 ms) → Sheet bleibt offen, `transform` ist danach leer.
   - Inhalt gescrollt (`scrollTop > 0`), Wisch im Inhalt nach unten → Sheet bleibt offen.
   - Wisch nach oben → Sheet bleibt offen.
   - Detail über der großen Karte: Wisch auf dem Griff → Detail zu, URL ohne Detail, kein Zurückspringen (Schließen über `popstate`).
6. `pnpm verify`, `pnpm e2e:local --affected`, `/browser-review` (Filter-Sheet, Kind-Sheet, Anbieter-Sheet, Wege, Detail über der Karte, Querformat), `/arch-review` (neues Modul).
7. ADR 0012: Delta des Start-JS in die Tabelle eintragen (gemessen: +0,732 kB, 113,246 → 113,978 kB von 150 kB). `docs/architecture.md`, „Mobile-UX-Gates“: ein Satz, dass Sheets mit Griff nach unten wegwischbar sind (`src/ui/sheet-swipe.ts`). In `docs/ideas.md` entfällt „Wischen am Griff des Detail-Sheets“ (aus Plan 0059), neu kommt „Sheets per Ziehen vergrößern“. Plan 0059 hatte das Wischen gestrichen, weil die Karte im Vordergrund stand. Jetzt hat der Nutzer es für alle Sheets ausdrücklich verlangt.

## Risiken

- **Wisch gegen Scrollen**: Steht der Inhalt oben, schließt eine Abwärtsbewegung, statt zu überscrollen. So verhalten sich native Sheets auf iOS und Android.
- **Animation `up` beim Öffnen**: Sie läuft über `transform` und steht in der Kaskade über dem Inline-Stil. Ein Wisch beendet sie deshalb beim `touchstart` (E2).
- **Griff des Details über der Karte**: Ein Tipp ohne Bewegung schaltet weiter `voll` um (`onClick`). Ein Wisch mit Bewegung erzeugt keinen Klick.
- **iOS lokal nicht prüfbar**: Die Geste nutzt nur Standard-Touch-Ereignisse. Der Nutzer prüft nach dem Deploy am iPhone, besonders den zittrigen Anfang (Schwelle 8 px). Fehlt die Prüfung beim Archivieren, kommt sie in die Restpunkte (`docs/ideas.md`).
- **Tempo als Mittelwert**: `swipeOutcome` misst das Tempo über die ganze Geste. Wer erst langsam zieht und dann schnipst, schließt nur über die Weite (25 % bzw. 120 px). Bewusst einfach gehalten; ein Tempo aus den letzten 100 ms käme bei Bedarf als Nachtrag.

## Review (2026-11-01) – Verdict: Überarbeiten → eingearbeitet

Übernommen:
- **Blocker 1** (Zurückspringen vor dem Schließen): `transform` wird erst beim `close`-Ereignis zurückgesetzt (E2). Ein E2E-Fall zeichnet die Oberkante je Frame auf, für das Filter-Sheet und das Detail über der Karte (Verlauf).
- **Major 2** (Animation über Inline-Stil): `finish()` beim `touchstart`, der Risikosatz ist korrigiert.
- **Major 3** (reduzierte Bewegung): Timer und `matchMedia` sind festgeschrieben, kein `transitionend`, dazu ein E2E-Fall mit `reducedMotion: "reduce"`.
- **Major 4** (Abdeckung): `SPEC_COVERS` nennt jetzt auch `Dialog.tsx` und `sheet.css`, `dialog.css`, `motion.css`.
- **Minor 5** (Backdrop): Start nur im Sheet-Rechteck.
- **Minor 6** (Klassenregel): `swipesFor` zerlegt in Klassen, mit Unit-Test.
- **Minor 7** (Griff-Tipp): steht in den Risiken.
- **Minor 8** (ideas.md): Eintrag ersetzt, Grund genannt (Schritt 7).
- **Minor 9** (Prüfung je Schritt, Browser-Review-Liste): in Schritt 3 und 6 ergänzt.

Abgelehnt: nichts.


## Review 2 (2026-11-01) – Verdict: Freigabe mit Änderungen → eingearbeitet

Alle Punkte aus Runde 1 sind bestätigt gelöst, ein neuer Blocker kam nicht hinzu.

Übernommen:
- **Major 1** (Entscheidung ohne Schwelle): Schwelle 8 px, darunter schon `preventDefault` abwärts (E2), dazu der E2E-Fall „zittriger Anfang“.
- **Major 2** (Startbudget): Delta in ADR 0012 eingetragen (Schritt 7).
- **Minor 3** (Berührung während des Ausgleitens): Sperre `closing`, ein laufendes Zurückfedern endet beim neuen `touchstart`.
- **Minor 5** (Testlücken): waagerechter Wisch und Start auf einem Eingabefeld im Spec. Der Backdrop-Start bleibt ohne E2E, weil ein Zug auf dem Backdrop in Chromium das Sheet nicht trifft und nur der Rechteck-Vergleich ihn ausschließt; er steht im Code begründet.
- **Minor 6** (Referenz im Unit-Test): auf E2 korrigiert.
- **Minor 7** (Style-Muster in `SPEC_COVERS`): bleiben als Doku-Absicht, mit Kommentar am Eintrag.
- **Minor 8** (iOS doppelt): zusammengefasst, als möglicher Restpunkt vorgemerkt.

Bewusst nicht übernommen:
- **Minor 4** (Tempo aus den letzten 100 ms): Der Mittelwert bleibt, er steht in den Risiken. Weite oder Schnipsen von Anfang an schließen, das deckt den Normalfall.

Kein Blocker ist offen. Status nach Umsetzung: in Umsetzung.

## Arch-Review (2026-11-01) – Verdict: OK

- m1 (zweiter Finger lässt Versatz stehen): `onStart` setzt außer beim Ausgleiten immer zurück, dazu ein E2E-Fall mit zwei Touch-Punkten. Übernommen.
- m2 (Geste nur in Chromium getestet): bleibt Handprüfung am iPhone, beim Archivieren Restpunkt in `docs/ideas.md`.
- m3 (Ref-Write im Render): `useLayoutEffect`. Übernommen.
