# Plan 0022 – Kleinigkeiten aus dem Nutzer-Feedback

Status: umgesetzt (Branch `feedback-0022-kleinigkeiten`)
Datum: 2026-10-08
Review: **kein Plan-Review**, Nutzerentscheid „pragmatisch, ohne großen Plan“. Die Gates (`pnpm check`, Budgets, Browser-Review nach dem Deploy) gelten unverändert.
Bezug: Plan 0004/0009/0016 (Startpunkt), Plan 0011 (App-Extras, ADR 0012 Startbudget), Plan 0003 (Merkliste)

## Ziel

Drei kleine Rückmeldungen aus der Nutzung: Die Stadtteil-Auswahl stört, wenn der Standort schon gilt. „Zum Startbildschirm hinzufügen“ steht unten im Kind-Sheet und wird übersehen. „Sticker“ und „Stickerheft“ versteht niemand.

## 1. Stadtteil-Auswahl bei aktivem Standort ausblenden

- `OriginPicker`: Bei `origin.source === "standort"` fehlen Label „Stadtteil“ und Select. Bei Kartenmitte und Stadtteil bleibt die Auswahl.
- Der Standort-Knopf heißt dann „Standort aktualisieren“. Zurück zur Auswahl geht es über „Startpunkt entfernen“.
- Fokus: Der Autofokus (Öffnen über „Startpunkt wählen“) geht bei aktivem Standort auf den Standort-Knopf, ohne Geolocation auf „Startpunkt entfernen“. Nach „Startpunkt entfernen“ übernimmt die wieder sichtbare Auswahl den Fokus (`flushSync`, sonst fiele er im Modal auf `<body>`).
- Hinweise und Live-Region bleiben unverändert, auch „… Wähle einen Stadtteil.“ bei einem Standort außerhalb des Stadtgebiets.
- Tests: `e2e/startpunkt.spec.ts` (Standort mit Freigabe, gespeicherter Standort, Wechsel zum Stadtteil mit Fokus, Kartenmitte behält die Auswahl, Autofokus außerhalb des Stadtgebiets).

## 2. „Zum Startbildschirm hinzufügen“ in den Fuß des Kind-Sheets

- Neue reine Funktion `installFoot(state)` in `src/domain/pwa.ts`: „angebot“ → Knopf, „ios“ → kompakte Zeile „Als App: [Teilen] → Zum Home-Bildschirm“, sonst nichts. `installHelp("angebot")` liefert nur noch den Text; der doppelte Knopf im Abschnitt „Als App“ entfällt.
- `AppFoot` liegt im selben Lazy-Chunk wie `AppSection` (`src/ui/app-extras/AppSection.tsx`). Der Lader `AppExtras.tsx` lädt einmal und liefert `[Abschnitt, Fuß]` (`useAppExtras`); bis der Chunk da ist oder wenn er scheitert, zeigt der Fuß nur „Fertig“ wie bisher.
- Im Zustand „angebot“ ist der Installationsknopf primär, „Fertig“ sekundär. Nach dem Tipp fokussiert `promptThenFocus` „Fertig“ (`preventScroll`), der Knopf ist dann weg.
- Startbudget (ADR 0012): kein statischer Import zwischen den Lazy-Chunks, kein `__vite__mapDeps` im Einstieg. Gemessen siehe „Umsetzung“.
- Tests: `installFoot` in `src/domain/pwa.test.ts`; `e2e/installieren.spec.ts` (Knöpfe im Fuß je Zustand, ohne Scrollen sichtbar, primär/sekundär, iOS-Zeile mit Symbol, Fokus nach dem Tipp).

## 3. „Sticker“ und „Stickerheft“ aus den UI-Texten

- „Mein Stickerheft“ → „Meine Merkliste“, „N Sticker“ → „N gemerkt“, Leerzustand „Hier klebt noch nichts“ → „Noch nichts gemerkt“.
- Toasts: „Gemerkt – liegt jetzt auf deiner Merkliste“, „Nicht mehr gemerkt“. Kalender: „Nichts für diesen Tag – Zeit für den Spielplatz.“
- Code-Identifier, CSS-Klassen und Code-Kommentare zur Kategorie-Leiste bleiben; alte Pläne und ADRs bleiben unverändert. `docs/architecture.md` nennt den Begriff nicht.
- Tests: bestehende E2E-Assertions umgestellt (`saved`, `detail`, `layout`, `mobile-ux`, `anbieter`), neu im Kalender (`calendar.spec.ts`).

## Außerdem

- `docs/ideas.md`: „Umzug auf ein anderes Gerät per QR-Code“ zurückgestellt (Nutzerentscheid 2026-10-08).

## Umsetzung

- Start-JS (gzip, `pnpm size`): 93,24 kB vorher, 93,36 kB nachher. Davon entfallen etwa 0,1 kB auf `OriginPicker` (Ausblenden, Fokus-Ziele) und etwa 0,03 kB auf Lader und Fuß-Rückfall; die Installationslogik selbst liegt weiter im Chunk `assets/app/` (App-Extras JS 6,27 → 6,4 kB, Budget 7,1 kB).
- Lokal (Rechner überlastet, Vorgabe des Koordinators): `pnpm check:fast` grün, `pnpm test:coverage` grün, betroffene Specs auf `pixel-7` grün (installieren, push, startpunkt, saved, calendar, detail, Toast-Tests in layout/mobile-ux/anbieter). Den vollen Lauf mit WebKit macht die CI auf dem Branch.
