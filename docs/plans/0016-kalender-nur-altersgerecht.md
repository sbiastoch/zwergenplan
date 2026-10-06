# Plan 0016 – Kalender-Export regelmäßiger Termine nur, solange das Alter passt

Status: Entwurf, Review 1 eingearbeitet. **Wartet auf Schritt 0 (iPhone-Test durch den Nutzer).**
Datum: 2026-10-06

(ADR 0003 Datenmodell und ICS, ADR 0007 Merklisten-ICS im Browser, ADR 0012 Startbudget, Plan 0003 Risiko „iOS und Blob“, Plan 0010 E8 A Export-Chunk, Plan 0011 Stufe 2 Budget, Plan 0015 E2 Datenhorizont 12 Monate; neu: ADR-Entwurf 0017.)

## Ziel

- **Regelmäßige Angebote** (`format: regelmaessig`) kommen beim ICS-Export nur mit den Terminen in den Kalender, an denen das Angebot zum Alter des Kindes passt. Ist ein Geburtsdatum gespeichert, endet die Reihe im Kalender, sobald das Kind herauswächst. Ist es noch zu jung, beginnt sie erst, wenn es hineinwächst.
- Das gilt für „Alle Termine“ im Detail und für den Sammel-Export der Merkliste.
- **Ohne Geburtsdatum** ändert sich nichts.
- **Kurse und Einzeltermine** ändern sich nicht. Für sie zählt wie bisher das Alter zum (ersten) Termin (`offerFitsAge`). Ein Kurs wird nicht mittendrin abgeschnitten, und gemerkte unpassende Kurse bleiben in der Merkliste-Datei, weil der Nutzer sie bewusst gemerkt hat.
- **„Nur <Datum>“** im Detail bleibt unverändert.
- **Startbudget:** kein zusätzlicher Code im Start-Bundle (E2).

Hintergrund: Mit Plan 0015 werden regelmäßige Gruppen 12 Monate fortgeschrieben. Eine Wochengruppe brächte sonst etwa 50 Termine in den Kalender, auch Monate nachdem das Kind zu alt ist.

## Nicht-Ziele

- **Abo-Kalender (webcal)**, der sich mit dem Alter von selbst kürzt. Braucht einen Server, Idee.
- **Kurse am Altersende kürzen.**
- **Altersfilter in den statischen Dateien.** Sie entstehen beim Build, und das Geburtsdatum verlässt das Gerät nie (ADR 0007).
- **Hinweiszeile vor dem Tippen** („Bis 14.3.2027 …“ unter dem Knopf). Die Auswahl müsste dafür im Start-Bundle liegen, und dort sind nur 0,23 kB frei, um die auch Plan 0011 Stufe 2 konkurriert. Den Zeitraum nennt der Toast nach dem Tippen. Ist das zu wenig, wird es eine Idee mit Budgetfrage.
- **Bereits importierte Termine löschen.** Ein späterer Import der kürzeren Datei aktualisiert gleiche UIDs, entfernt aber keine früher importierten Termine (ADR 0017, Konsequenzen).
- **Mehrere Kinder.**

## Ausgangslage

- **Detail** (`src/ui/DetailDialog.tsx:174–205`): Bei regelmäßigen Angeboten ist „Alle Termine“ ein `<a href>` auf die statische Datei `seriesIcsPath(offer)`. Sie enthält alle Termine, auch vergangene (Kommentar H5). Offline antwortet der Service Worker auf `ics/**` mit 204 und dem Toast „Kalender-Datei braucht Netz“ (Plan 0011, Regel 2).
- **Merkliste** (`src/ui/SavedView.tsx:71–88`): erzeugt im Browser über den Lazy-Chunk `assets/export/`. Der einzige Lader von `src/domain/ics.ts` ist `loadExport` in `SavedView.tsx` (Regel `ics-entry-only`, Wächter `LAZY_LOADERS` in `scripts/check-architecture.ts:60`). Der Chunk wird im Leerlauf vorgeladen (`preloadExportWhenIdle`). Die Auswahl der Termine macht `collectionSessions` (`src/domain/saved.ts:26`), ohne Alter. Unter dem Knopf steht fest „N Termine“ (`SavedView.tsx:108–111`).
- **Alter:** `fitsAgeAt`, `ageInMonths`, `offerFitsAge` in `src/domain/age.ts`. `ageInMonths` steigt monoton, deshalb fallen nur vorne oder hinten Termine weg, nie in der Mitte. Das Geburtsdatum liegt im `localStorage` und kommt als `birthDate` bis `DetailDialog`. `generatedAt` kommt dort bisher **nicht** an (`Overlays.tsx:109–124`).
- **Startbudget:** JS (initial) 91,77 von 92 kB gzip (Plan 0011, Z. 590). Stufe 2 von Plan 0011 braucht davon noch etwas.
- **iOS:** Ob Safari und die installierte PWA eine Blob-`.ics` als „Zum Kalender hinzufügen“ öffnen, ist seit Plan 0003 (Risiko, Z. 350) **nie am Gerät geprüft** worden. Öffentliche Berichte nennen Probleme, vor allem in installierten PWAs: Teilen-Menü statt Kalender, Sackgasse ohne Zurück.
- **Fixture:** „Offener Krabbeltreff“ (6–24 Monate, wöchentlich 7.10.–4.11. in `tests/fixtures/`) deckt beide Kürzungen ab:
  - Geburtsdatum 18.09.2024: gekürzt nach dem 14.10.
  - Geburtsdatum 20.04.2026: beginnt erst am 21.10.

## Entscheidungen

### E0 – Erst messen, ob iOS mit Blob-ICS klarkommt (Schritt 0)

Der Merklisten-Export ist heute live und nutzt genau den Blob-Weg. Der Nutzer prüft ihn am iPhone in zwei Umgebungen, je mit einem gemerkten Angebot und „Alle in den Kalender“:
- (i) im Safari-Tab
- (ii) in der installierten Home-Bildschirm-App

Festgehalten wird je Umgebung, was erscheint: Kalender-Dialog „Hinzufügen“, Datei-Vorschau, Teilen-Menü oder nichts. Dazu, ob man ohne Neustart zurück in die App kommt.

- **Fall A, beides geht:** E2 wie beschrieben.
- **Fall B, mindestens eine Umgebung scheitert:**
  - Auf iOS bleibt „Alle Termine“ der statische Link.
  - Der Toast nennt nach dem Tippen das Altersende: „… – ab 15.10. passt es nicht mehr zum Alter, diese Termine kannst du im Kalender löschen.“
  - Die Merkliste bekommt auf iOS den Ausweichweg aus Plan 0003: die Einzel-Links.
  - Erkannt wird iOS über die Feature-Lage, nicht über die Version: `navigator.maxTouchPoints > 1` plus `/Mac|iPhone|iPad/` im Plattform-String. Das ist die einzige Plattformweiche, kommentiert mit diesem Befund.
- Der Befund kommt mit Datum in den Plan. Erst danach beginnt Schritt 1.

### E1 – Eine reine Auswahlfunktion, im Export-Chunk

`exportSessions(offer, now, birthDate) → { sessions, from?, until? }` liegt in **`src/domain/ics-select.ts`**. Das Modul wird nur von `src/domain/ics.ts` re-exportiert und liegt damit im Lazy-Chunk `assets/export/`, nicht im Start-Bundle.
- `kurs`: alle Termine (wie heute).
- `einmalig`: der Termin, falls nicht beendet (wie heute).
- `regelmaessig` ohne `birthDate`: alle nicht beendeten Termine (wie heute in der Merkliste).
- `regelmaessig` mit `birthDate`: alle nicht beendeten Termine `s` mit `fitsAgeAt(offer.age, birthDate, s.start)`.
  - `from` ist gesetzt, wenn davor nicht beendete Termine wegfallen (zu jung).
  - `until` ist gesetzt, wenn danach Termine wegfallen (zu alt).
  - Beide Werte sind der Beginn des ersten bzw. letzten passenden Termins.
- `collectionSessions` entfällt (knip).
- **Konsistenz:** Ein Unit-Test sichert für regelmäßige Angebote `exportSessions(o, now, b).sessions.length > 0 ⇔ offerFitsAge(o, b, now)` über die Fixture-Daten und mehrere Geburtsdaten. Die Kachel kann so nie „passt“ zeigen, während der Export „nichts passt“ meldet.

### E2 – „Alle Termine“ im Detail (Fall A)

- Bleibt ein `<a href={seriesIcsPath}>` mit einem zusätzlichen `onClick`. **Synchron** im Klick gilt:
  - Ist das Angebot regelmäßig, ein Geburtsdatum gespeichert, `generatedAt` vorhanden **und** der Export-Chunk schon geladen (`loadedExport()` liefert das Modul synchron, sonst `undefined`), rechnet der Handler `exportSessions`.
  - Wird **gekürzt** (`from` oder `until` gesetzt): `preventDefault`, Blob erzeugen mit `icsForCollection([{ offer, sessions, ctx }], offer.title)`, herunterladen unter dem Basisnamen von `seriesIcsPath`, dann Toast.
  - Passt **kein** Termin: `preventDefault`, kein Download, Toast „Keiner der kommenden Termine passt zum Alter.“
  - **Sonst** (nichts gekürzt, Chunk noch nicht geladen, kein Geburtsdatum): Der Link läuft normal. Die statische Datei gilt wie heute.
- **Warum synchron:** iOS lässt einen Download nur als direkte Folge des Tipps zu, und der Chunk ist im Leerlauf vorgeladen. Ist er es ausnahmsweise nicht, ist der statische Link der Rückfall, ohne Fehler.
- **Startbudget:** Im Start-Bundle bleiben nur der `onClick` und `loadedExport` (wenige Zeilen in `src/ui/ics-export.ts`). Auswahl, Texte des Zeitraums und ICS-Erzeugung liegen im Chunk. `pnpm size` prüft das (Schritt 5).
- **Toast bei Kürzung**, eine Form, Datum ohne führende Null wie sonst in der App:
  - nur Ende: „23 Termine geladen – bis 14.3.2027, danach passt es nicht mehr zum Alter“
  - nur Anfang: „23 Termine geladen – ab 21.10., vorher passt es noch nicht zum Alter“
  - beides: „8 Termine geladen – 21.10.–14.3.2027 passt es zum Alter“
  - Das Jahr steht nur, wenn es nicht das laufende ist.
  - Die Texte entstehen im Chunk (`exportToast` in `ics-select.ts`) und werden mit `design:ux-copy` gegengelesen.
- **Offline:** Der Blob-Weg geht offline (Chunk vorgehalten). Der statische Link liefert offline wie heute 204 plus Toast. Ein E2E-Test prüft den Blob-Weg offline (Chromium).
- **`generatedAt`** wird von `Overlays` bis `DetailDialog` durchgereicht. Ohne Wert gilt der statische Link.

### E3 – Merkliste

- `exportAll` nutzt `exportSessions(offer, now, birthDate)` aus dem Chunk. `SavedView` bekommt `birthDate`.
- **Fehlende Angebote:** Angebote ohne passenden Termin fehlen in der Datei. Toast: „Kalenderdatei mit 41 Terminen geladen – 1 Angebot passt nicht zum Alter“. Neutral formuliert, weil es auch „noch zu jung“ heißen kann.
- **Nichts passt:** Kein Download. Toast: „Keins der gemerkten Angebote passt zum Alter.“
- **Text unter dem Knopf:** Heute steht dort „N Termine“, im Start-Bundle gezählt.
  - Mit Geburtsdatum wird daraus „N Termine · regelmäßige nur, solange das Alter passt“. Die Zahl bleibt die ungefilterte, weil das Filtern im Chunk passiert. Der Toast nennt die echte Zahl.
  - Passt der Text bei 320 px nicht in eine Zeile, entfällt die Zahl („Regelmäßige Termine nur, solange das Alter passt“).
- Im Fall B auf iOS: Einzel-Links (Plan 0003, Ausweichweg), die Kürzung gilt dort nicht. Der Text unter dem Knopf entfällt dann.

### E4 – Architektur und ADR 0017

- `loadExport`, `loadedExport`, `download` und `preloadExportWhenIdle` ziehen aus `SavedView.tsx` nach **`src/ui/ics-export.ts`**, dem neuen einzigen Lader von `src/domain/ics.ts`. Angepasst werden:
  - `ics-entry-only` in `.dependency-cruiser.cjs`
  - `LAZY_LOADERS` in `scripts/check-architecture.ts:60`, mit Kanarienvogel (ein zusätzlicher statischer Import in `ics-export.ts` → rot)
  - `docs/architecture.md`: Lader-Liste und ICS-Invariante („einzige Ausnahme Merkliste“ → Merkliste und gekürzte Reihen)
  - ADR 0007: Vermerk „ergänzt durch ADR 0017“ an der Auswahl der Termine
- ADR 0017 (Entwurf liegt bei) begründet die zweite Ausnahme von „ICS entstehen statisch“. Danach wird er angenommen.

## Schritte

0. **iPhone-Test des Merklisten-Exports** durch den Nutzer (E0). Befund in den Plan, Fall A oder B festlegen.
1. **Domäne, test-first:** `src/domain/ics-select.ts` mit `exportSessions` und `exportToast`.
   - Tests in `America/Los_Angeles`:
     - ohne Geburtsdatum
     - zu jung
     - zu alt
     - beides
     - keiner passt
     - Grenztag am 31. in einem kurzen Monat
     - Kurs und Einzeltermin unverändert
     - vergangene Termine fallen weg
     - Jahreswechsel im Text
     - Konsistenz mit `offerFitsAge`
   - Fertig, wenn die Coverage von `src/domain` hält.
2. **Lader auslagern (E4).** Fertig, wenn `pnpm arch` grün ist und der Kanarienvogel rot wird.
3. **Detail und Merkliste (E2, E3)**, `generatedAt` durchreichen. Fertig, wenn `pnpm check:fast` grün ist.
4. **E2E** mit dem „Offenen Krabbeltreff“ und gespeichertem Geburtsdatum. Keine neue Fixture, sie verschöbe Zählungen in vielen Specs.
   - Detail, zu alt (18.09.2024): Die Download-Datei (Playwright `download`) enthält nur Termine bis 14.10. Ihre UIDs sind eine Teilmenge der statischen Datei, und der Toast stimmt.
   - Detail, zu jung (20.04.2026): Die Datei beginnt am 21.10.
   - Detail, passt ganz: Der Link lädt die statische Datei (kein Blob).
   - Detail, keiner passt: kein Download, Toast.
   - Ohne Geburtsdatum: statische Datei.
   - Merkliste: gekürzt, ein Angebot fehlt (Toast), nichts passt (kein Download, Toast), Text unter dem Knopf.
   - Offline (Chromium): Der Blob-Weg funktioniert.
   - Mobile-UX: Ansicht „merkliste-mit-geburtsdatum“ in `e2e/mobile-ux.spec.ts` (320 px/200 %, hell/dunkel), dazu die Toasts bei 320 px.
   - „Beide Seiten gekürzt“ prüft nur der Unit-Test.
5. **Budget:** `pnpm size`. Das Start-JS darf höchstens um den `onClick` und `loadedExport` wachsen (Ziel ≤ +0,1 kB). Reicht der Rest nicht, Rückfrage an den Nutzer zur Reihenfolge mit Plan 0011 Stufe 2. Kein Anheben (ADR 0012).
6. **`/arch-review`** (Lader-Regel, neue Ausnahme der ICS-Invariante), danach **`/browser-review`** live, Mobile-Viewports hell/dunkel. Dazu wiederholt der Nutzer den iPhone-Test aus Schritt 0 für das Detail (gekürzte Reihe).
7. Commit, Push, CI grün auf `main`, Live-Seite zeigt den Stand. **Erst danach** darf Plan 0015 Stufe A das 12-Monats-Fenster veröffentlichen.

## Risiken

- **R1 – iOS und Blob:** E0 entscheidet vorher. Im Fall A wird der Blob nur genutzt, wenn wirklich gekürzt wird. Passt alles, bleibt der native Link.
- **R2 – Startbudget:** Die Auswahl liegt im Chunk. Die Messung in Schritt 5 ist ein Gate.
- **R3 – Uhr und Zeitzone:** Alter nach Berliner Kalendertag (`ageInMonths`), Grenztag-Tests in `America/Los_Angeles`.
- **R4 – Chunk beim Tippen noch nicht geladen:** Dann kommt die statische, ungekürzte Datei. Das ist selten (Vorladen im Leerlauf) und ehrlich, kein Fehler.

## Review (2026-10-06) – Verdict: Überarbeiten (1. Durchgang)

Unabhängiger `plan-reviewer`.

**Übernommen**
- **B1 iOS ungeprüft** → Schritt 0 und E0 mit Fall A/B vor jeder Umsetzung. Der Blob kommt nur bei echter Kürzung, sonst bleibt der native Link (E2).
- **M1 Budget veraltet, Konkurrenz mit Plan 0011 Stufe 2, Rückfall widersprüchlich** → Zahl 91,77 kB korrigiert. Die Auswahl liegt ganz im Export-Chunk. Statt Hinweiszeile vor dem Tippen gibt es einen Toast danach (Nicht-Ziel mit Begründung), die Merkliste zeigt einen festen Text. Das Start-Bundle wächst nur um den `onClick`, Gate in Schritt 5 mit Rückfrage statt Anheben.
- **M2 Lader-Wächter** → `LAZY_LOADERS`, Kanarienvogel, `architecture.md` (Lader, ICS-Invariante), Vermerk in ADR 0007 (E4).
- **M3 Merkliste „nichts passt“** → kein Download, Toast; Text unter dem Knopf festgelegt; E2E für beides (E3).
- **M4 Mobile-Gates** → Ansicht `merkliste-mit-geburtsdatum` und Toasts bei 320 px. Im Detail-Fuß ändert sich das Layout nicht mehr (kein neuer Knopf, keine Hinweiszeile), der Fuß-Test bleibt gültig.
- **M5 `generatedAt`** → wird durchgereicht, ohne Wert gilt der statische Link.
- **m1 Texte** → Datum ohne führende Null, Jahr nur bei Bedarf, neutral „passt nicht zum Alter“ in der Merkliste.
- **m2** → bewusste Uneinheitlichkeit (Kurse bleiben) im Ziel festgehalten.
- **m3** → Konsistenztest mit `offerFitsAge`.
- **m4** → vorhandene Fixture statt neuer.
- **m5** → Offline-Verhalten und E2E.
- **m6** → Nicht-Ziel und Konsequenz in ADR 0017.

**Abgelehnt**
- keine. Ein zweiter Review-Durchgang folgt nach Schritt 0, weil E0 Fall B die Lösung ändert.
