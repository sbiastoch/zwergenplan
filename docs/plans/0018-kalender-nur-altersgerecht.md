# Plan 0018 – Kalender-Export regelmäßiger Termine nur, solange das Alter passt

Status: in Umsetzung seit 2026-10-08 (Branch `kalender-alter-0018`); freigegeben nach Plan-Review (3 Durchgänge, zuletzt „Freigeben mit Auflagen“, eingearbeitet); Schritt 0 erledigt (Fall A, 2026-10-06). Das Budget 100 kB aus Plan 0019 ist auf `main` (zuletzt 94,4 kB).
Datum: 2026-10-06

(ADR 0003 Datenmodell und ICS, ADR 0007 Merklisten-ICS im Browser, ADR 0012 Startbudget mit Nachtrag aus Plan 0019 (100 kB), Plan 0003 Risiko „iOS und Blob“, Plan 0010 E8 A Export-Chunk, Plan 0015 E2 Datenhorizont 12 Monate; neu: ADR-Entwurf 0018.)

Hinweis zur Nummer: Der Plan hieß kurz „0017“. Diese Nummer gehört dem Wochen-Push (`docs/plans/0017-wochen-push.md`, Branch `push-0017`), der schon Umsetzungs-Commits unter ihr hat.

## Ziel

- **Regelmäßige Angebote** (`format: regelmaessig`) kommen beim ICS-Export nur mit den Terminen in den Kalender, an denen das Angebot zum Alter des Kindes passt. Ist ein Geburtsdatum gespeichert, endet die Reihe im Kalender, sobald das Kind herauswächst. Ist es noch zu jung, beginnt sie erst, wenn es hineinwächst.
- Das gilt für „Alle Termine“ im Detail und für den Sammel-Export der Merkliste.
- **Ohne Geburtsdatum** ändert sich nichts.
- **Kurse und Einzeltermine** ändern sich nicht. Für sie zählt wie bisher das Alter zum (ersten) Termin (`offerFitsAge`). Ein Kurs wird nicht mittendrin abgeschnitten. Gemerkte, unpassende Kurse bleiben in der Merkliste-Datei, weil der Nutzer sie bewusst gemerkt hat.
- **„Nur <Datum>“** im Detail bleibt unverändert.

Hintergrund: Mit Plan 0015 werden regelmäßige Gruppen 12 Monate fortgeschrieben. Eine Wochengruppe brächte sonst etwa 50 Termine in den Kalender, auch Monate nachdem das Kind zu alt ist.

## Nicht-Ziele

- **Abo-Kalender (webcal)**, der sich mit dem Alter selbst kürzt. Braucht einen Server, Idee.
- **Kurse am Altersende kürzen.**
- **Altersfilter in den statischen Dateien.** Sie entstehen beim Build, und das Geburtsdatum verlässt das Gerät nie (ADR 0007).
- **Hinweiszeile im Detail vor dem Tippen.** Der Zeitraum steht im Toast. Eine zusätzliche Zeile im Fuß würde den Fuß bei 320 px und quer höher machen, für wenig Nutzen.
- **Bereits importierte Termine löschen.** Ein späterer Import der kürzeren Datei aktualisiert gleiche UIDs, entfernt aber keine früher importierten Termine (ADR 0018, Konsequenzen).
- **Mehrere Kinder.**

## Ausgangslage

- **Detail** (`src/ui/DetailDialog.tsx:174–205`):
  - Bei regelmäßigen Angeboten ist „Alle Termine“ ein `<a href>` auf die statische Datei `seriesIcsPath(offer)` mit `onClick={() => onIcs(…)}` für den Toast. Die Datei enthält alle Termine, auch vergangene (Kommentar H5).
  - Offline antwortet der Service Worker auf `ics/**` mit 204 und dem Toast „Kalender-Datei braucht Netz“ (Plan 0011, Regel 2).
  - Das Detail ist ein modales `<dialog>`, `body` ist dabei inert.
  - `DetailContent` bekommt `birthDate`, aber kein `generatedAt` (`Overlays.tsx:109–124`).
- **Merkliste** (`src/ui/SavedView.tsx`):
  - Sie erzeugt im Browser über den Lazy-Chunk `assets/export/`. Einziger Lader von `src/domain/ics.ts` ist `loadExport` in `SavedView.tsx` (Regel `ics-entry-only`, Wächter `LAZY_LOADERS` in `scripts/check-architecture.ts:60`). Der Chunk wird im Leerlauf vorgeladen (`preloadExportWhenIdle`, App).
  - Die Auswahl macht `collectionSessions` (`src/domain/saved.ts:26`), ohne Alter.
  - Unter dem Knopf steht heute „2 Sticker · 13 Termine in einer .ics-Datei · Kurse immer komplett“ (`SavedView.tsx:108–111`, `e2e/saved.spec.ts:35`).
  - Der Hilfslink für den Download hängt an `document.body`.
- **Alter:** `fitsAgeAt`, `ageInMonths`, `offerFitsAge` in `src/domain/age.ts`. `ageInMonths` steigt monoton, deshalb fallen nur vorne oder hinten Termine weg, nie in der Mitte.
- **Startbudget:** Auf `b2023c1` lag `JS (initial)` bei 91,95 von 92 kB. Plan 0019 hebt das Budget per Nutzerentscheidung auf **100 kB** (ADR 0012, Nachtrag „Budget 100 kB“). Jeder Plan trägt dort sein Delta ein.
- **E2E-Uhr** steht auf `2026-10-05T12:00+02:00` (`e2e/fixtures.ts:11`). Fixture „Offener Krabbeltreff“: regelmäßig, 6–24 Monate, mittwochs 7.10.–4.11. (5 Termine). „Krabbelreime & Fingerspiele“: regelmäßig, 0–36 Monate. „PEKiP-Gruppe Herbst“: Kurs, 1–5 Monate, 8 Termine.

## Entscheidungen

### E0 – Befund am iPhone: Blob-ICS funktioniert (Schritt 0, erledigt)

Live auf zwergenplan.app getestet, Merkliste „Alle in den Kalender“, 2026-10-06, durch den Nutzer:

| Umgebung | Verhalten |
|---|---|
| iPhone, installierte Home-Bildschirm-App | Der Dialog zum Hinzufügen der Termine in den Kalender öffnet sich direkt. |
| iPhone, Safari-Tab | Banner „Calendar File Available“, darüber hinzufügen. Das ist das übliche Verhalten bei `.ics`, wie bei den statischen Links. |
| Android | Die Datei wird heruntergeladen, wie bei den statischen Links. |

→ **Fall A:** Der Blob-Weg verhält sich wie der statische Link. Eine Plattformweiche gibt es nicht. Nicht gesondert gemeldet ist, ob man danach ohne Neustart zurück in die App kommt. Das und den Download **aus dem Detail-Dialog** (anderer DOM-Kontext) prüft Schritt 6 am iPhone ausdrücklich.

### E1 – Auswahl in der Domäne

In `src/domain/saved.ts` (rein, im Start-Bundle, unit-getestet):

```ts
/** Auswahl für den ICS-Export einer Reihe bzw. der Merkliste (Plan 0018). */
export interface ExportSelection {
  sessions: Session[];
  /** Beginn des ersten passenden Termins, wenn davor kommende Termine wegfallen (zu jung) */
  from?: string;
  /** Beginn des letzten passenden Termins, wenn danach Termine wegfallen (zu alt) */
  until?: string;
}
export function exportSessions(offer: Offer, now: Date, birthDate: string | undefined): ExportSelection
```

- `kurs`: alle Termine (wie heute `collectionSessions`).
- `einmalig`: nicht beendete Termine (wie heute).
- `regelmaessig` ohne `birthDate`: alle nicht beendeten Termine (wie heute).
- `regelmaessig` mit `birthDate`: alle nicht beendeten Termine `s` mit `fitsAgeAt(offer.age, birthDate, s.start)`, dazu `from`/`until` wie oben.
- `collectionSessions` entfällt. `exportSessions(o, now, undefined).sessions` ist dasselbe, ein Test sichert das.
- **Konsistenz:** Ein Test sichert für regelmäßige Angebote `exportSessions(o, now, b).sessions.length > 0 ⇔ offerFitsAge(o, b, now)` über alle Fixture-Angebote und mehrere Geburtsdaten.

Dazu die Entscheidung für den Detail-Knopf, ebenfalls rein:

```ts
/** Was „Alle Termine“ tun soll (Plan 0018, E2). */
export type SeriesExport =
  | { kind: "static" }                                  // statische Datei: kein Geburtsdatum oder nicht regelmäßig
  | { kind: "none" }                                    // kein kommender Termin passt
  | { kind: "blob"; selection: ExportSelection };       // im Browser erzeugen (gekürzt oder nicht)
export function seriesExport(offer: Offer, now: Date, birthDate: string | undefined): SeriesExport
```

Prüfreihenfolge:
1. `static`, wenn `format !== "regelmaessig"` oder kein `birthDate`.
2. `none`, wenn die Auswahl leer ist. Das wird geprüft, bevor `from`/`until` eine Rolle spielen.
3. Sonst `blob`, **auch ungekürzt**.

Begründung (Review 3, W2): Hinge der Request auf `ics/<id>.ics` daran, ob gekürzt wird, erführe der Host, ob das Kind über die ganze Reihe in die Altersspanne passt. `docs/architecture.md` verbietet das Geburtsdatum in Requests. So verrät der Request nur noch das Bit „Geburtsdatum gesetzt“, und ADR 0018 benennt es wie ADR 0017 beim Startpunkt.

### E2 – „Alle Termine“ im Detail

- Bleibt ein `<a href={seriesIcsPath(offer)}>`. Der `onClick` entscheidet **synchron** mit `seriesExport(offer, now, birthDate)`:
  - `static` (oder `generatedAt` fehlt): wie heute. Der Link läuft, der Toast nennt die Zahl.
  - `none`: `preventDefault`, kein Download, Toast „Keiner der kommenden Termine passt zum Alter.“
  - `blob`: `preventDefault`, dann `await loadExport()` wie in der Merkliste. Mit `icsForCollection([{ offer, sessions, ctx: icsContextFor(offer, generatedAt) }], offer.title)` entsteht die Datei, `download()` lädt sie unter dem Basisnamen von `seriesIcsPath` herunter, dann der Toast.
    - Scheitert das Laden des Chunks, kommt derselbe Toast wie in der Merkliste („Export gerade nicht möglich – …“).
- **Laden beim Tippen statt synchronem Griff in den Chunk** (Review 3, W1): Der Weg mit `await` ist laut E0 auf dem iPhone belegt, denn die Merkliste macht es genauso. Das Vorladen im Leerlauf macht das `await` praktisch sofort. Es gibt kein Wettrennen und keinen stillen Rückfall auf die ungekürzte Datei.
- **Download im Dialog:** `download(ics, filename, container)` hängt den Hilfslink in das übergebene Element (im Detail `e.currentTarget.parentElement`, in der Merkliste weiter `document.body`). Grund: Bei offenem modalem `<dialog>` ist `body` inert.
- **`generatedAt`** wird von `Overlays` bis `DetailContent` durchgereicht.
- **Offline:** Der Blob-Weg geht offline (Chunk vorgehalten), der statische Link liefert wie heute 204 plus Toast.

### E3 – Merkliste

- `exportAll` nutzt `exportSessions(offer, now, birthDate)`. `SavedView` bekommt `birthDate`.
- Angebote ohne passenden Termin fehlen in der Datei.
- **Nichts passt:** kein Download, Toast „Keins der gemerkten Angebote passt zum Alter.“
- **Text unter dem Knopf**, gezählt mit derselben Auswahl:
  - ohne Geburtsdatum unverändert: „2 Sticker · 13 Termine in einer .ics-Datei · Kurse immer komplett“
  - mit Geburtsdatum: „2 Sticker · 10 Termine in einer .ics-Datei · Kurse komplett, regelmäßige nur passend zum Alter“
  - mit Geburtsdatum und 0 passenden Terminen: „2 Sticker · keiner passt gerade zum Alter“
  - Der Text bricht als `<p class="small">` normal um. Geprüft wird er im Mobile-UX-Gate (Ansicht unten), nicht auf Einzeiligkeit.

### E4 – Texte (Toasts)

Formatiert in `src/ui/format.ts` mit den vorhandenen Helfern (`plural`, Datum ohne führende Null wie `shortDate`). Das Jahr steht nur, wenn es nicht das laufende in Berliner Zeit ist (`now`). Gleiche Grundform wie heute („Kalenderdatei mit N Terminen geladen“):

| Fall | Toast |
|---|---|
| Detail, nur Ende | „Kalenderdatei mit 2 Terminen geladen – bis 14.10., danach passt es nicht mehr zum Alter“ |
| Detail, nur Anfang | „Kalenderdatei mit 3 Terminen geladen – ab 21.10., vorher passt es noch nicht zum Alter“ |
| Detail, beides | „Kalenderdatei mit 8 Terminen geladen – vom 21.10. bis 14.3.2027 passt es zum Alter“ |
| Detail, keiner passt | „Keiner der kommenden Termine passt zum Alter.“ |
| Merkliste, eins fehlt | „Kalenderdatei mit 8 Terminen geladen – 1 Angebot passt nicht zum Alter“ |
| Merkliste, nichts passt | „Keins der gemerkten Angebote passt zum Alter.“ |

- Zwei Funktionen in `format.ts`, beide unit-getestet:
  - `seriesToast(selection, now)` für das Detail. Ungekürzt bleibt es bei „Kalenderdatei mit N Terminen geladen“.
  - `collectionToast(count, missing)` für die Merkliste. Fehlt kein Angebot, bleibt es bei der heutigen Form.
- Die Texte liest `design:ux-copy` gegen.
- **Anzeigedauer:** `useToast` zeigt heute 2,8 s (`use-app-state.ts:196`). `say(message, ms?)` bekommt eine optionale Dauer. Toasts mit Kürzung oder fehlenden Angeboten stehen **6 s**, nach der Faustregel etwa 1 s je 15 Zeichen.
- **Dauerhaft sichtbar:** In der installierten iOS-App verdeckt der Kalender-Dialog den Toast sofort (E0). Deshalb ergänzt die **Alterszeile im Detail** (`DetailDialog.tsx:116–120`) bei regelmäßigen Reihen mit Geburtsdatum und Kürzung „· passt bis 14.10.“ bzw. „· passt ab 21.10.“ bzw. „· passt 21.10.–14.3.2027“.
  - Die Zeile steht im Inhalt, nicht im Fuß, und widerspricht damit nicht dem Nicht-Ziel.
  - Mobile-UX-Gate über die Ansicht `detail-mit-geburtsdatum` (Schritt 4).

### E5 – Lader und Architektur

- `loadExport`, `download` und `preloadExportWhenIdle` ziehen unverändert aus `SavedView.tsx` nach **`src/ui/ics-export.ts`**, den neuen einzigen Lader von `src/domain/ics.ts`. Einzige Änderung: `download` nimmt optional einen Container.
- **Unit-Test** analog `src/ui/ProviderPanel.test.ts`: Ein Fehlschlag setzt `pending` zurück, und der nächste Aufruf versucht es neu.
- Angepasst werden:
  - `ics-entry-only` (`.dependency-cruiser.cjs`)
  - `LAZY_LOADERS` (`scripts/check-architecture.ts`) mit Kanarienvogel: Ein statischer Import in `ics-export.ts` wird rot.
  - `docs/architecture.md`: Lader und ICS-Invariante („Ausnahme Merkliste“ → Merkliste und gekürzte Reihen)
  - ADR 0007: Vermerk „ergänzt durch ADR 0018“
- Das strukturelle Interface `IcsExport` bleibt gleich (`icsContextFor`, `icsForCollection`). `ics.ts` ändert sich nicht.
- **Budget:** Das Delta von `JS (initial)` kommt in die Tabelle in ADR 0012 (Nachtrag Plan 0019). Erwartet sind etwa +0,3 kB.
- **Doku-Reste:**
  - ADR 0007, Z. 12: `collectionSessions` → `exportSessions`
  - `docs/architecture.md`: Abschnitt „Export der Merkliste“ und Invariante „Altersprüfung“ um den Export ergänzen
  - `saved.test.ts:28–39` mit festen Erwartungen statt Vergleich mit der alten Funktion
  - ADR 0018 auf „angenommen“ (Schritt 7)

## Schritte

0. ~~iPhone-Test des Merklisten-Exports~~ (erledigt, E0).
1. **Domäne, test-first:** `exportSessions`, `seriesExport` in `src/domain/saved.ts`.
   - Tests in `America/Los_Angeles`:
     - ohne Geburtsdatum (gleich dem alten `collectionSessions`)
     - zu jung, zu alt, beides
     - keiner passt
     - Grenztag am 31. in einem kurzen Monat
     - Kurs und Einzeltermin unverändert
     - vergangene Termine fallen weg
     - Konsistenz mit `offerFitsAge`
     - alle Zweige von `seriesExport`
   - Fertig, wenn die Coverage von `src/domain` hält.
2. **Lader (E5)** mit Unit-Test, Regeln und Kanarienvogel. Fertig, wenn `pnpm arch` grün ist und der Kanarienvogel rot wird.
3. **UI (E2–E4):** `seriesToast`/`collectionToast` mit Tests, `say(message, ms?)`, Alterszeile, Detail, Merkliste, `generatedAt` durchreichen. Fertig, wenn `pnpm check:fast` grün ist.
4. **E2E** mit Fixture-Daten und Uhr 5.10.2026.
   - Geburtsdatum und Merkliste kommen per `addInitScript` (`zwergenplan.geburtsdatum`, `zwergenplan.merkliste`, wie `layout.spec.ts:392`). Das Detail wird per `?angebot=<id>` geöffnet. Grund: Der Altersfilter ist Standard an und blendet unpassende Angebote in „Entdecken“ aus (bis Plan 0021 hieß er `nur-passende`).
   - Weil der Klick auf den Chunk wartet (E2), braucht es kein `startPreloads`. Der Test wartet auf das `download`-Ereignis.
   - Erwartungen:
   - Detail „Offener Krabbeltreff“, Geburtsdatum 2024-09-18 (24 Monate am 14.10., 25 am 21.10.): Download mit **2** VEVENTs (7.10., 14.10.). Ihre UIDs sind eine Teilmenge der statischen Datei. Toast „… mit 2 Terminen geladen – bis 14.10., danach passt es nicht mehr zum Alter“.
   - Gleiches Angebot, Geburtsdatum 2026-04-20 (5 Monate am 14.10., 6 am 21.10.): **3** VEVENTs ab 21.10.
   - „Krabbelreime & Fingerspiele“ (0–36) mit 2024-09-18: nichts gekürzt, trotzdem Blob (W2): **4** VEVENTs, `download.url()` beginnt mit `blob:`. Toast ohne Zusatz, keine Angabe in der Alterszeile.
   - „Offener Krabbeltreff“ mit Geburtsdatum 2026-08-01 (2–3 Monate, keiner passt): kein Download, Toast.
   - Ohne Geburtsdatum: statische URL wie bisher (`download.url()` endet auf `/ics/…ics`).
   - Alterszeile im Detail: „· passt bis 14.10.“ (2024-09-18) bzw. „· passt ab 21.10.“ (2026-04-20).
   - Merkliste mit PEKiP-Kurs und Krabbeltreff, Geburtsdatum 2024-09-18: **8 + 2 = 10** VEVENTs, Text unter dem Knopf wie E3.
   - Merkliste mit Krabbeltreff allein, Geburtsdatum 2026-08-01: kein Download, Toast.
   - Merkliste mit Krabbeltreff und „Krabbelreime“, Geburtsdatum 2026-08-01: Die Datei enthält nur die 4 Termine der „Krabbelreime“, Toast „… – 1 Angebot passt nicht zum Alter“.
   - Offline: Der Blob-Weg im Detail funktioniert. Der Test liegt in `e2e/pwa.spec.ts`, nur dort ist der Service Worker an.
   - Mobile-UX: Ansichten `merkliste-mit-geburtsdatum` und `detail-mit-geburtsdatum` in `e2e/mobile-ux.spec.ts` (alle Geräte, hell/dunkel, 320 px/200 %). Sie setzen das Geburtsdatum vor dem Laden (`addInitScript`), weil `VIEWS` nach `ready()` startet. Dazu die längsten Toasts bei 320 px.
   - Die Zahlen prüft Schritt 4 gegen die echte Fixture. Weichen sie ab, wird der Plan korrigiert, nicht der Test.
5. **Budget:** `pnpm size`, Delta in ADR 0012.
6. **`/arch-review`**, dann **`/browser-review`** live, Mobile-Viewports hell/dunkel. Danach testet der Nutzer am iPhone den gekürzten Download **aus dem Detail**, in der App und im Safari-Tab: Kalender-Dialog bzw. Banner erscheint, und man kommt ohne Neustart zurück.
   - **Scheitert das nur im Detail**, ist der Rückfall eine Zeile: `seriesExport` liefert im Detail wieder `static`. Das Detail nutzt dann die statische Datei, die Merkliste kürzt weiter, und die Alterszeile nennt die Grenze weiterhin.
   - Eine bessere Lösung für das Detail wird ein eigener Plan. Ein Aktionsknopf im Toast ist es nicht: Er verschwände nach Sekunden, das verletzt WCAG 2.2.1.
   - Die Entscheidung kommt mit Befund in den Plan.
7. Commit, Push, CI grün auf `main`, Live-Seite zeigt den Stand. **Erst danach** darf Plan 0015 Stufe A das 12-Monats-Fenster veröffentlichen.

## Risiken

- **R1 – Download aus dem Dialog auf iOS:** In der Merkliste belegt, im Detail nicht. Schritt 6 prüft das, der Ausweg ist benannt.
- **R2 – Uhr und Zeitzone:** Das Alter zählt nach Berliner Kalendertag. Die Grenztag-Tests laufen in `America/Los_Angeles`.
- **R3 – Budget nicht auf `main`:** Die Umsetzung beginnt erst, wenn Plan 0019 (Budget 100 kB) auf `main` ist. Dann wird neu gemessen (Plan 0017 Wochen-Push und Plan 0011 Stufe 2 brauchen ebenfalls Platz).

## Umsetzung (2026-10-08)

Basis `5701141`. `JS (initial)` vorher 94,41 kB von 100 kB, Export-Chunk 1,15 kB von 2 kB.

- **Abweichung durch spätere Pläne:** Seit Plan 0022 heißt es unter dem Merklisten-Knopf „N gemerkt“ statt „N Sticker“. Die Texte aus E3 gelten mit „gemerkt“, z. B. „2 gemerkt · 10 Termine in einer .ics-Datei · Kurse komplett, regelmäßige nur passend zum Alter“.
- **Schritt 1:** `exportSessions`/`seriesExport` in `src/domain/saved.ts`, `seriesToast`/`collectionToast`/`ageWindowLabel` in `src/ui/format.ts`. Die Fixture-Zahlen aus Schritt 4 (2 / 3 / 0 / 4 / 8) stimmen. Der Gegenleser `design:ux-copy` hat die Toasts ohne Änderung bestätigt.
- **Schritt 2:** `src/ui/ics-export.ts` ist der einzige Lader. Der Chunk bleibt unter `assets/export/`, weil `vite.config.ts` ihn nach dem Modulpfad `src/domain/ics.ts` zuordnet. Kanarienvögel, je temporär eingefügt und zurückgenommen:

  | Eingriff | `pnpm arch` |
  |---|---|
  | statischer Import von `../domain/ics.ts` in `ics-export.ts` | rot: `ics-only-lazy` |
  | dasselbe, `ics-only-lazy` vorübergehend aus | rot: `lazy-loader-static` (`LAZY_LOADERS`) |
  | `import("../domain/ics.ts")` aus `SavedView.tsx` | rot: `ics-entry-only` |
  | `import type * as Ics from "../domain/ics.ts"` im Lader | rot: `ics-only-lazy` |

- **Offen für den Browser-Review:** Die Alterszeile nennt den Bezugstermin aus `ageCheck`, beim Fall „zu jung“ ist das der erste passende Termin. Mit Zusatz steht dort z. B. „Passt: am Mi 21.10. 6 Monate alt · passt ab 21.10.“, also das Datum doppelt. Umgesetzt wie in E4. Der `/browser-review` entscheidet, ob der Text nachgeschärft wird.

## Review (2026-10-06) – Verdict: Überarbeiten (1. Durchgang)

Unabhängiger `plan-reviewer`.

**Übernommen**
- **B1 iOS ungeprüft** → Schritt 0 vor der Umsetzung, inzwischen erledigt (E0, Fall A). Der Blob kommt nur bei echter Kürzung, sonst bleibt der native Link.
- **M1 Budget** → damals mit Lazy-Auswahl gelöst, im 2. Durchgang ersetzt (siehe unten).
- **M2 Lader-Wächter** → `LAZY_LOADERS`, Kanarienvogel, `architecture.md`, Vermerk in ADR 0007 (E5).
- **M3 Merkliste „nichts passt“** → kein Download, Toast, E2E (E3).
- **M4 Mobile-Gates** → Ansicht `merkliste-mit-geburtsdatum`, Toasts bei 320 px. Der Detail-Fuß behält sein Layout (keine neue Zeile), der Fuß-Test bleibt gültig.
- **M5 `generatedAt`** → wird durchgereicht.
- **m1–m6** → Texte, bewusste Uneinheitlichkeit bei Kursen, Konsistenztest, vorhandene Fixture, Offline, Nicht-Ziel „importierte Termine löschen“.

## Review (2026-10-06) – Verdict: Überarbeiten (2. Durchgang)

Neuer, unabhängiger `plan-reviewer` nach Schritt 0. Bestätigt: Der synchrone Zugriff auf den geladenen Chunk verletzt keine Lazy-Regel, und die Fixture-Rechnung stimmt.

**Übernommen**
- **B1 Budget veraltet (91,95 kB, Rest 0,05 kB)** → Der Nutzer hat in Plan 0019 das Budget auf 100 kB freigegeben (ADR 0012, Nachtrag). Die Umsetzung wartet, bis das auf `main` ist. Das Delta kommt in die Tabelle in ADR 0012.
  - Damit entfällt der Zwang, die Auswahl in den Lazy-Chunk zu legen. Sie liegt jetzt **rein in der Domäne** (`saved.ts`), was M1, M3 und M4 gleich mit löst und einfacher ist.
- **M1 `collectionSessions` vs. Zählung** → `exportSessions` ersetzt sie. Die Zählung unter dem Knopf nutzt dieselbe Auswahl und stimmt also mit der Datei überein.
- **M2 Entscheidungslogik in der UI** → `seriesExport` in der Domäne, unit-getestet; im `onClick` bleibt nur das Verzweigen.
- **M3 keine Regel für `ics-select.ts`** → Das Modul entfällt, die Auswahl liegt in `saved.ts`.
- **M4 Formatierer** → `exportToast` liegt in `src/ui/format.ts` und nutzt die vorhandenen Helfer, `now` für das Jahr.
- **M5 E2E nicht deterministisch** → `startPreloads` vor jedem Tippen, Geburtsdaten und erwartete Zahlen festgeschrieben, `download.url()` für „statisch“.
- **M6 Loader ohne Test** → Unit-Test für `loadedExport`.
- **Hinweise:**
  - Text unter dem Knopf festgelegt.
  - Toasts in der Grundform „Kalenderdatei mit N Terminen geladen“, „vom … bis …“.
  - Anzeigedauer des Toasts prüfen.
  - Hilfslink im Dialog einhängen.
  - ADR 0018 mit Befund Fall A und Rückfallkriterium für das Detail.
  - Keine neuen Typen in `ics-types.ts` nötig, weil die Auswahl nicht im Chunk liegt.

**Abgelehnt**
- keine

## Review (2026-10-06) – Verdict: Freigeben mit Auflagen (3. Durchgang)

Dritter, unabhängiger `plan-reviewer`. Er bestätigt die E2E-Zahlen gegen Fixture und Uhr (2 / 3 / 0 / 10 / 4 Termine) und sieht keine Zyklen durch die Auswahl in `saved.ts`. Keine Blocker. Nach Skill-Regel folgt kein weiterer Durchgang.

**Übernommen**
- **W1 Wettrennen mit dem Vorladen, stiller Rückfall auf ungekürzt** → Der Klick entscheidet synchron und wartet dann wie die Merkliste auf `loadExport()` (am iPhone belegt). `loadedExport`, sein Test, R3 alt und `startPreloads` im E2E entfallen.
- **W2 Request verrät das Alter** → Mit Geburtsdatum entsteht bei regelmäßigen Reihen immer ein Blob, auch ungekürzt. Der Request verrät nur noch das Bit „Geburtsdatum gesetzt“, in ADR 0018 benannt.
- **W3 Kürzung nur im flüchtigen Toast** → `say(message, ms?)` mit 6 s für diese Toasts. Die Alterszeile im Detail zeigt die Grenze dauerhaft, Mobile-UX-Ansicht `detail-mit-geburtsdatum`.
- **W4 Rückfall nicht umsetzbar** → Rückfall ist `static` im Detail (eine Zeile), eine bessere Lösung wird ein eigener Plan. Kein Aktionsknopf im Toast (WCAG 2.2.1).
- **Hinweise:**
  - H1: Prüfreihenfolge `static` → `none` → `blob`.
  - H2: getrennte `seriesToast`/`collectionToast`.
  - H3: E2E per `addInitScript` und `?angebot=`, Offline-Test in `pwa.spec.ts`, Mobile-Ansichten setzen das Geburtsdatum vor dem Laden.
  - H4: Doku-Reste (ADR 0007, `architecture.md`, `saved.test.ts`, ADR 0018 annehmen).
  - H5: „regelmäßige“ statt „Treffs“, eigener Text bei 0 passenden Terminen.
  - H6: neu messen, sobald das Budget auf `main` ist (R3).

**Abgelehnt**
- keine
