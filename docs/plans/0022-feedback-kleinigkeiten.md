# Plan 0022 – Kleinigkeiten aus dem Nutzer-Feedback

Status: in Umsetzung – umgesetzt und live seit d5fab1b; ins Archiv nach dem Browser-Review live (Plan 0027, Etappe 6). Früherer Status: umgesetzt (Branch `feedback-0022-kleinigkeiten`)
Datum: 2026-10-08
Review: **kein Plan-Review**, Nutzerentscheid „pragmatisch, ohne großen Plan“. Arch-Review nach der Umsetzung (unten). Die Gates (`pnpm check`, Budgets, Browser-Review nach dem Deploy) gelten unverändert.
Bezug: Plan 0004/0009/0016 (Startpunkt), Plan 0011 (App-Extras, ADR 0012 Startbudget), Plan 0003 (Merkliste)

## Ziel

Drei kleine Rückmeldungen aus der Nutzung: Die Stadtteil-Auswahl stört, wenn der Standort schon gilt. „Zum Startbildschirm hinzufügen“ steht unten im Kind-Sheet und wird übersehen. „Sticker“ und „Stickerheft“ versteht niemand.

## 1. Stadtteil-Auswahl bei aktivem Standort ausblenden

- `OriginPicker`: Wirkt ein Standort (`origin.source === "standort"`, kein Fehler der letzten Abfrage, nicht außerhalb des Stadtgebiets), fehlen Label „Stadtteil“ und Select. Bei Kartenmitte und Stadtteil bleibt die Auswahl.
- **Entscheidung (Arch-Review M1):** Rät der Hinweis zum Stadtteil („… Wähle einen Stadtteil.“ außerhalb des Stadtgebiets, „Standort nicht freigegeben …“ nach einem gescheiterten „Standort aktualisieren“), steht die Auswahl da. Die Hinweistexte bleiben unverändert.
- Der Standort-Knopf heißt bei Standort „Standort aktualisieren“. Zurück zur Auswahl geht es über „Startpunkt entfernen“.
- Fokus: Der Autofokus (Öffnen über „Startpunkt wählen“) bleibt auf der Auswahl. „Startpunkt wählen“ gibt es nur ohne Startpunkt oder außerhalb des Stadtgebiets, dann steht sie immer da. Nach „Startpunkt entfernen“ übernimmt die wieder sichtbare Auswahl den Fokus (`flushSync`, sonst fiele er im Modal auf `<body>`).
- Tests: `e2e/startpunkt.spec.ts` (Standort mit Freigabe, gespeicherter Standort, Wechsel zum Stadtteil mit Fokus, Kartenmitte behält die Auswahl, außerhalb des Stadtgebiets Auswahl sichtbar und fokussiert, „Standort aktualisieren“ verweigert).

## 2. „Zum Startbildschirm hinzufügen“ in den Fuß des Kind-Sheets

- Neue reine Funktion `installFoot(state)` in `src/domain/pwa.ts`: „angebot“ → Knopf, „ios“ → kompakte Zeile „Als App: [Teilen] → Zum Home-Bildschirm“, sonst nichts. `installHelp("angebot")` liefert nur noch den Text; der doppelte Knopf im Abschnitt „Als App“ entfällt.
- `AppFoot` liegt im selben Lazy-Chunk wie `AppSection` (`src/ui/app-extras/AppSection.tsx`). Der Lader `AppExtras.tsx` lädt einmal und liefert Abschnitt und Fuß-Zusatz (`useAppExtras`, mit `peek` für ein schon geladenes Modul). „Fertig“ gehört `KidSheet` und bleibt dasselbe Element; bis der Chunk da ist oder wenn er scheitert, steht es allein wie bisher.
- Im Zustand „angebot“ ist der Installationsknopf primär, „Fertig“ per CSS sekundär (`.foot-install ~ .btn.primary`). Verschwindet der Knopf mit dem Fokus (Tipp oder `appinstalled`), geht der Fokus auf „Fertig“ (`preventScroll`).
- iOS-Zeile: Pfeil `aria-hidden`, vorgelesen „, dann“ wie in `ReachLong.tsx`.
- Startbudget (ADR 0012): kein statischer Import zwischen den Lazy-Chunks, kein `__vite__mapDeps` im Einstieg. Gemessen siehe „Umsetzung“.
- Tests: `installFoot` in `src/domain/pwa.test.ts`, scheiterndes `prompt()` in `src/data/pwa.test.ts`; `e2e/installieren.spec.ts` (Knöpfe im Fuß je Zustand, ohne Scrollen sichtbar, primär/sekundär, iOS-Zeile mit Symbol und Pfeil, Fokus nach dem Tipp und nach `appinstalled`, Chunk nicht ladbar), `e2e/push.spec.ts` (Knopf im Fuß).

## 3. „Sticker“ und „Stickerheft“ aus den UI-Texten

- „Mein Stickerheft“ → „Meine Merkliste“, „N Sticker“ → „N gemerkt“, Leerzustand „Hier klebt noch nichts“ → „Noch nichts gemerkt“.
- Toasts: „Gemerkt – liegt jetzt auf deiner Merkliste“, „Nicht mehr gemerkt“. Kalender: „Nichts für diesen Tag – Zeit für den Spielplatz.“
- Code-Identifier, CSS-Klassen und Code-Kommentare zur Kategorie-Leiste bleiben; alte Pläne und ADRs bleiben unverändert. `docs/architecture.md` nennt den Begriff nicht.
- Tests: bestehende E2E-Assertions umgestellt (`saved`, `detail`, `layout`, `mobile-ux`, `anbieter`), neu im Kalender (`calendar.spec.ts`).

## Außerdem

- `docs/ideas.md`: „Umzug auf ein anderes Gerät per QR-Code“ zurückgestellt (Nutzerentscheid 2026-10-08).

## Umsetzung

- Start-JS (gzip, `pnpm size`): 93,24 kB vorher, 93,37 kB nach der Nacharbeit; nach dem Merge von 0023/0024 gegen 91663f6 94,119 → 94,259 kB, +0,14 kB (ADR 0012, Delta-Tabelle). Etwa 0,1 kB entfallen auf `OriginPicker`, der Rest auf Lader und Fuß; die Installationslogik liegt weiter im Chunk `assets/app/` (App-Extras JS 6,27 → 6,48 kB, Budget 7,1 kB), kein `__vite__mapDeps` im Einstieg.
- Lokal (Rechner überlastet, Vorgabe des Koordinators): `pnpm check:fast` grün; nach der Nacharbeit auf `pixel-7` grün: installieren, startpunkt, push (74 bestanden, 3 übersprungen), mobile-ux `-g kind-sheet` (12). Den vollen Lauf mit WebKit macht die CI auf dem Branch.

## Review (Arch-Review 2026-10-08)

Kein Blocker.

| Befund | Umgang |
|---|---|
| M1: „Wähle einen Stadtteil“ bei ausgeblendeter Auswahl (außerhalb, nach verweigerter Abfrage) | Auswahl nur ausblenden, wenn der Standort wirkt (`hideDistricts`); E2E außerhalb umgestellt, neuer Test „Standort aktualisieren verweigert“ |
| M2: Rückfall-Fuß ohne Test | E2E „Abschnitt „Als App“ nicht ladbar“: `LoadFailed`, Fuß nur „Fertig“ (primär, schließt), Mobile-UX-Gates |
| m1: Fuß wird ausgetauscht, „Fertig“ verliert den Fokus | „Fertig“ gehört `KidSheet`, der Chunk setzt nur den Zusatz davor; `peek` auf Modulebene; nach geglücktem „Nochmal versuchen“ Fokus auf die Überschrift „Als App“ (sonst „Fertig“). Ohne E2E: Chromium behält einen gescheiterten `import()` (Lazy.tsx), ein Test des Wiederholens wäre browserabhängig wie bei der Karte |
| m2: Pfeil wird vorgelesen | `aria-hidden` plus „, dann“ wie `ReachLong.tsx`; `installFoot` ohne Pfeil |
| m3: ADR 0012 Delta-Tabelle | Zeile 0022 eingetragen (93,24 → 93,37 kB) |
| m4: veraltete Kommentare | `src/data/pwa.ts` korrigiert, `docs/architecture.md` um den Fuß ergänzt; `KidSheet.tsx` und `Dialog.tsx` stimmen wieder, weil der Autofokus wie zuvor nur auf der Auswahl liegt |
| m5: Autofokus-Zweig „clear“, Zustand „keine“ | Zweige „Standort-Knopf“/„Startpunkt entfernen“ entfernt: nach M1 nicht mehr erreichbar (siehe 1.). Zustand „keine“/„menue“: Fuß nur „Fertig“, geprüft |
| m6: `appinstalled` von außen | umgesetzt: Effekt im Fuß fokussiert „Fertig“, wenn der Knopf mit dem Fokus verschwindet; ersetzt `promptThenFocus`; E2E |
| m7: `prompt()` ohne Absicherung | `try/catch/finally`, gemeldet wird immer, kein Fehler nach außen; Unit-Test |
| Nits | Klasse `single` und Keys entfernt (Objekt statt Tupel) |
