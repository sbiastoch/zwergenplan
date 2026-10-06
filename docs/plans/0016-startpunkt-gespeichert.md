# Plan 0016 – Der Startpunkt übersteht das Neuladen

Status: **umgesetzt und live seit `b2023c1`** (https://zwergenplan.app/). Browser-Review live bestanden, ohne Blocker.
Datum: 2026-10-06
Bezug: ADR 0017 (neu), Plan 0004 (E3), Plan 0005 (E8), Plan 0009 (E9), ADR 0008 (Kamera-Regel), ADR 0011 (Punkt 6), ADR 0012 (Startbudget)

## Ziel

Nutzermeldung (2026-10-06): „Der Standort wird nicht im Local Cache gespeichert. Das wäre aber wichtig.“

- Wer „Meinen Standort nutzen“ tippt oder die Kartenmitte als Startpunkt wählt, findet diesen Startpunkt nach dem Neuladen bzw. dem nächsten Start der PWA wieder. Die Wegzeit steht dann sofort, wie heute schon beim Stadtteil.
- Es gilt immer der **zuletzt gewählte** Startpunkt.
- Gespeichert wird nur der schon gerundete Punkt (ca. 100 m). Nichts davon geht ins Netz (ADR 0017).

## Nicht-Ziele

- **Kein automatisches Neu-Abfragen** des Standorts beim Start (Plan 0004: nur auf Tipp).
- **Kein Ablaufdatum** für den gespeicherten Punkt (ADR 0017, Alternativen).
- Kamera-Regel (ADR 0008) und „kein Request ab der Wahl“ bleiben unverändert. Ein gespeicherter Standort bewegt die Karte nie.
- Texte für Statuszeile und Detail („ab deinem Standort“, „ab der Kartenmitte“) bleiben gleich.

## Ausgangslage

- `src/data/preferences.ts`: Nur `zwergenplan.entfernung-ab` (Stadtteil-ID) wird gelesen und geschrieben.
- `src/ui/use-app-state.ts`, `useOrigin`:
  - Der Startzustand kommt aus dem gespeicherten Stadtteil.
  - `setDistrict` speichert die ID, `clear` löscht sie.
  - `locateMe` und `setMapCenter` speichern nichts. Ein vorher gespeicherter Stadtteil bleibt liegen und gilt nach dem Neuladen wieder (Plan 0004, E3).
- `src/ui/origin-state.ts`: Ein reiner Reducer setzt „Mein Standort“ bzw. „Kartenmitte“ als `Origin` mit festem Label. Eine späte Standort-Antwort zählt nur, wenn ihre Abfrage noch die aktuelle ist (`pending`).
- `src/ui/use-transit.ts:240`: Die Tabelle lädt beim Start nur, wenn `origin?.source === "stadtteil"` ist (`initialTransitState(storedDistrict)`).
- `src/ui/OriginPicker.tsx:104` sagt: „Dein Standort wird nicht gespeichert, ein Stadtteil bleibt auf diesem Gerät.“
- `docs/architecture.md`, Invarianten „Startpunkt“ und „Kein Request hängt davon ab …“ legen das bisherige Verhalten fest.
- E2E `e2e/startpunkt.spec.ts`, Test „Standort mit Freigabe …“: Er prüft, dass kein `localStorage`-Wert „49.45“ enthält und dass nach dem Neuladen kein Startpunkt gilt.

## Entscheidungen

### E1 – Speicherformat (`src/data/preferences.ts`)

- Neuer Schlüssel `zwergenplan.startpunkt` mit JSON `{"source":"standort"|"karte","lat":number,"lon":number}`.
- Neue Exporte:
  ```ts
  export interface StoredOriginPoint { source: "standort" | "karte"; lat: number; lon: number }
  /** nur die Form: Quelle bekannt, lat/lon endliche Zahlen; sonst undefined. Runden und BBOX prüft useOrigin. */
  export function loadOriginPoint(): StoredOriginPoint | undefined;
  export function saveOriginPoint(value: StoredOriginPoint | undefined): void;
  ```
- Gespeichert werden nur `source`, `lat` und `lon`, auch wenn der übergebene Wert mehr Felder hätte. `JSON.stringify` läuft deshalb über ein neu gebautes Objekt.
- Kaputtes JSON, ein falscher Typ oder ein gesperrter Speicher ergeben `undefined` und werfen nie.
- Formprüfung bewusst knapp (Start-Budget, Review W3): `typeof lat === "number"` usw., kein `Number.isFinite`. JSON kennt weder `NaN` noch `Infinity` (beides wird `null`), und `inBounds` in E3 verwirft einen ungültigen Punkt ohnehin.
- Der Kopfkommentar der Datei nennt den Startpunkt-Punkt mit.

### E2 – Genau ein gespeicherter Startpunkt (`useOrigin`)

- **Start:** `loadOriginPoint()` wird über `storedPointOrigin` (E3) zum `Origin`. Ist das `undefined`, gilt wie bisher der gespeicherte Stadtteil (`districtOrigin(loadOriginDistrict())`).
- **`setDistrict(id)`:** Bei bekannter ID wird die ID gespeichert und `saveOriginPoint(undefined)` aufgerufen. Bei unbekannter ID passiert wie bisher nichts.
- **`setMapCenter(center)`:** Liegt der gerundete Punkt in Nürnberg, wird `{ source: "karte", ...point }` gespeichert und `saveOriginDistrict(undefined)` aufgerufen. Außerhalb bleibt alles unverändert, und die Funktion liefert `false`.
- **`locateMe()`:** Nur eine erfolgreiche Antwort, die noch zählt, wird gespeichert, also `{ source: "standort", ...point }`, und der Stadtteil gelöscht. „Zählt noch“ heißt dasselbe wie im Reducer: Seit der Abfrage gab es keine neue Abfrage, keine Stadtteilwahl, keine Kartenmitte und kein „Entfernen“.
  - Umsetzung: `latestRequest = useRef(0)`. `locateMe` setzt es auf die neue Abfragenummer, `setDistrict` (bei bekannter ID), `setMapCenter` (bei Erfolg) und `clear` setzen es auf 0.
  - In `.then` wird nur gespeichert, wenn `result.ok && latestRequest.current === request` gilt.
  - Der Reducer bleibt die Quelle für den angezeigten Zustand. Die Regel ist bewusst doppelt (Reducer und Ref), die Unit-Tests (Tests, 3) belegen, dass beide übereinstimmen.
  - Ein Fehlschlag (`denied`, `timeout`, `outside` …) ändert am Gespeicherten nichts.
- **`clear()`:** Löscht beide Schlüssel und setzt `latestRequest` auf 0.
- Verworfen: Speichern in einem `useEffect` auf `origin`. Das wäre eine einzige Stelle, aber Effekte laufen im Unit-Test-Harness (`renderToStaticMarkup`, ohne DOM) nicht, und die bestehenden Tests prüfen das Speichern genau dort. Zudem würde der Effekt schon beim Mount schreiben.

### E3 – Wiederherstellen als reine Funktion (`src/ui/origin-state.ts`)

- Neu:
  ```ts
  /** Origin für Standort/Kartenmitte mit festem Label („Mein Standort“, „Kartenmitte“); vom Reducer und beim Wiederherstellen genutzt */
  export function pointOrigin(source: "standort" | "karte", point: GeoPoint): Origin;
  /** gespeicherten Punkt erneut runden (`coarsen`) und gegen NUERNBERG_BBOX prüfen; ungültig → undefined */
  export function storedPointOrigin(stored: StoredOriginPoint | undefined): Origin | undefined; // import type aus ../data/preferences.ts
  ```
- Der Reducer nutzt `pointOrigin` für `located` und `mapCenter`. Labels und Verhalten bleiben gleich.
- `origin-state.ts` darf `coarsen` und `inBounds` aus `src/domain/geo.ts` importieren (UI → Domäne ist erlaubt). `src/data` bleibt bei der Formprüfung.

### E4 – Laden beim Start (`src/ui/use-transit.ts`)

- `useReducer(transitReducer, origin !== undefined, initialTransitState)`: Die Tabelle lädt beim Start mit **jedem** gespeicherten Startpunkt.
- Der Parameter von `initialTransitState` heißt jetzt `storedOrigin`. Die Kommentare in `use-transit.ts` werden angepasst: Kopf, `initialTransitState`, `useTransit` und `reloadAfterRetry` („Das Neuladen verliert Standort bzw. Kartenmitte“ gilt nicht mehr). Ebenso der Kommentar in `App.tsx` (Zeilen 62, 105, 212).
- Weitere veraltete Kommentare (Review K5): `src/data/geolocation.ts:4` („Nichts davon wird gespeichert“ → die Rohkoordinate nie; gespeichert wird höchstens der gerundete Punkt, und zwar in `preferences.ts`), `use-app-state.ts` (Doku von `OriginApi.origin`, `setMapCenter`, `clear`, `useOrigin`), `preferences.ts:76–79`, `origin-state.ts:4–5` und der Testname `origin-state.test.ts:97`, falls er „nur im Speicher“ sagt.
- Ein Request mehr pro Start entsteht nur für Nutzer, die einen Standort oder eine Kartenmitte gespeichert haben. Er ist für alle gleich (ADR 0011, Punkt 6).

### E5 – Texte

- `OriginPicker.tsx`, Fußnote: „Dein Startpunkt bleibt nur auf diesem Gerät (ein Standort auf ca. 100 m gerundet).“ ersetzt „Dein Standort wird nicht gespeichert, ein Stadtteil bleibt auf diesem Gerät.“
- Der Hinweis „Wegzeit ab deinem Standort (auf ca. 100 m gerundet).“ (`originHint`) bleibt. Er erscheint auch nach dem Wiederherstellen, weil er nur von `origin.source` abhängt.
- `MapScreen.tsx`: „Dein Standort bleibt auf dem Gerät.“ bleibt, das stimmt weiterhin.

### E6 – Doku

- `docs/architecture.md`, Invariante „Startpunkt“: „lebt nur im Arbeitsspeicher … Gespeichert wird höchstens die ID eines Stadtteils (…), nie eine Koordinate, auch keine gerundete.“ wird ersetzt durch: „Gespeichert wird nur der zuletzt gewählte Startpunkt, und zwar nur auf dem Gerät: ein Stadtteil als ID (`zwergenplan.entfernung-ab`), Standort und Kartenmitte als schon gerundeter Punkt (`zwergenplan.startpunkt`, ADR 0017). Eine ungerundete Koordinate wird nie gespeichert.“
- Invariante „Kein Request hängt davon ab …“: „wenn irgendein Stadtteil gespeichert ist“ wird zu „wenn irgendein Startpunkt gespeichert ist“, „dass *ein* Stadtteil gespeichert ist“ zu „dass *ein* Startpunkt gespeichert ist“.
- `docs/architecture.md`, außerdem (Review W2):
  - Zeile 21 (Schichtenbild): „gespeicherter Stadtteil“ → „gespeicherter Startpunkt“.
  - Zeile 48: „Ob eine gespeicherte Stadtteil-ID gilt, prüft `useOrigin`“ → „Ob ein gespeicherter Startpunkt gilt, prüft die UI (`useOrigin`; für einen Punkt `storedPointOrigin`: erneut runden, BBOX). `preferences.ts` prüft nur die Form.“
  - Zeile 60 (Wegzeit): „beim Start mit gespeichertem Stadtteil“ → „beim Start mit gespeichertem Startpunkt (ADR 0017)“.
- ADR 0011: Im Kopf neben „Geändert durch ADR 0015“ die Zeile „**Geändert durch ADR 0017 (Plan 0016):** Punkt 6, Spiegelstriche 1 und 3 (gespeicherter Startpunkt statt Stadtteil).“ (Review W1).
- In Plan 0004 (E3), Plan 0005 (E8) und Plan 0009 (E9, die Stelle zum „gespeicherten Stadtteil“) kommt an die betroffene Stelle ein Verweis „Ersetzt durch ADR 0017 / Plan 0016“. Der übrige Text bleibt als Historie stehen.
- ADR 0017 wird mit dem Merge nach `main` auf „angenommen“ gesetzt.

## Tests (test-first)

1. `src/data/preferences.test.ts`, neuer Block „Startpunkt-Punkt“:
   - Speichert `{source,lat,lon}` als JSON unter `zwergenplan.startpunkt`, und `load` liefert es zurück.
   - Zusätzliche Felder werden nicht gespeichert.
   - `undefined` löscht den Eintrag.
   - Beschädigt ergibt `undefined`: kein JSON, `null`, Array, unbekannte Quelle (`"stadtteil"`), `lat` als String, `NaN`/`Infinity` (in JSON als `null`), fehlendes `lon`.
   - Ein gesperrter Speicher wirft nicht.
2. `src/ui/origin-state.test.ts`:
   - `pointOrigin` liefert die Labels „Mein Standort“ und „Kartenmitte“.
   - `storedPointOrigin` rundet erneut (49.45213 → 49.452).
   - Außerhalb von `NUERNBERG_BBOX` (München) und bei `undefined` ergibt es `undefined`.
   - Die bestehenden Reducer-Tests bleiben grün.
3. `src/ui/use-app-state.test.ts`, Block `useOrigin` (mit `fakeStorage`):
   - Stellt einen gespeicherten Standort bzw. eine gespeicherte Kartenmitte wieder her (`source`, gerundeter Punkt, Label).
   - Ein gespeicherter Punkt geht vor einen gespeicherten Stadtteil.
   - Ist der Punkt ungültig (außerhalb, kaputt), gilt der Stadtteil.
   - `setDistrict` löscht einen gespeicherten Punkt, bei unbekannter ID bleibt alles.
   - Der bestehende Test „Kartenmitte … nur im Speicher“ wird umgeschrieben: Gespeichert ist danach genau `zwergenplan.startpunkt` mit `{source:"karte",lat:49.452,lon:11.077}`, der Stadtteil ist gelöscht. Außerhalb bleibt der Speicher unverändert.
   - `locateMe` mit gestubbter Geolocation (`vi.stubGlobal("navigator", …)`, `isSecureContext`): Nach dem Auflösen (Microtasks abwarten) steht der gerundete Punkt mit `source:"standort"` im Speicher, der Stadtteil ist weg.
   - Ein Fehlschlag (`code: 1`) lässt den Speicher unverändert.
   - Späte Antwort, parametrisiert (Review W4): `locateMe`, dann in derselben Render-Phase eine der Aktionen, danach löst die Geolocation (manuell gesteuerter Stub) auf. Geprüft wird jeweils der Speicher:
     - `setDistrict("gostenhof")` → nur `gostenhof`, kein Punkt;
     - `setMapCenter` mit Punkt in Nürnberg (49.46/11.08) → nur die Kartenmitte, nicht der Standort;
     - `clear()` → Speicher leer (sonst käme ein bewusst entfernter Standort nach dem Neuladen zurück);
     - zweites `locateMe`, erste Antwort löst zuerst auf → nichts gespeichert; die zweite Antwort danach → genau der zweite Punkt.
   - `clear` löscht beide Schlüssel.
4. `src/ui/use-transit.test.ts`: Der bestehende Test zu `initialTransitState` gilt unverändert (`true` → „laedt“). Einen Render-Test für `useTransit` gibt es nicht, und er könnte den Unterschied nicht zeigen (`resolveReach` liefert mit Startpunkt bei „aus“ wie bei „laedt“ den Modus `laedt`). Den Kern belegt der E2E-Test „Gespeicherter Startpunkt: genau ein Request beim Start“ (Tests, 5).
5. `e2e/startpunkt.spec.ts`:
   - **Umschreiben** „Standort mit Freigabe: gerundet, nur im Speicher …“ → „Standort mit Freigabe: gerundet gespeichert, Wegzeit, ab dem Tipp kein Request“.
     - Nach der Wahl enthält `localStorage["zwergenplan.startpunkt"]` genau `{"source":"standort","lat":49.452,"lon":11.077}`.
     - Kein gespeicherter Wert enthält die Rohkoordinate (`49.4521` bzw. `11.0767`).
     - `zwergenplan.entfernung-ab` ist leer.
     - Nach `page.reload()` zeigt die Statuszeile wieder „Wegzeit ab deinem Standort …“, ohne neue Standortabfrage. Beleg: Vor dem Neuladen wird per `addInitScript` ein Zähler um `getCurrentPosition` gelegt, der zusätzlich `window.__geoWrapped = true` setzt. Nach dem Neuladen gilt `__geoWrapped === true` und Zähler 0 (Review K8).
   - **Neu** im Block „Gespeicherter Startpunkt“ (aus „Gespeicherter Stadtteil“ umbenannt): Mit `addInitScript` wird `zwergenplan.startpunkt = {"source":"standort","lat":49.452,"lon":11.077}` gesetzt. Dann gibt es genau einen Request auf `wegzeit.json` und auf `linien.json` beim Start, die Statuszeile zeigt „ab deinem Standort“, und das Kind-Sheet zeigt „Startpunkt: Mein Standort“ samt Hinweis „(auf ca. 100 m gerundet)“.
   - **Neu:** Erst Standort, dann Stadtteil Gostenhof wählen. Danach ist `zwergenplan.startpunkt` gelöscht, und nach dem Neuladen gilt Gostenhof.
   - **Neu:** „Startpunkt entfernen“ bei gespeichertem Standort löscht beide Schlüssel. Nach dem Neuladen gibt es keinen Startpunkt und keinen Request auf `wegzeit.json`.
   - Der bestehende Test „Kein Laden ohne Anlass“ bleibt unverändert.
6. `e2e/karte.spec.ts`, eigener kurzer Test (Review K7): `zwergenplan.startpunkt` als Kartenmitte per `addInitScript`, Karte öffnen. Der Knopf heißt „Startpunkt: Kartenmitte“, die Statuszeile sagt „ab der Kartenmitte“, und der Layer `startpunkt` hat 1 Feature. Dass die Kamera unberührt bleibt, belegt schon `camera.test.ts` (`initialCamera` ignoriert Standort und Kartenmitte).

## Schritte

1. ADR 0017 (liegt bei), Plan-Review.
2. Tests 1–3 rot, dann E1–E3 umsetzen, grün.
3. E4 und E5, dann Tests 4–6.
4. E6 Doku.
5. `pnpm check:fast`. Danach `PW_PORT=4473 pnpm check` (inkl. `pnpm size`).
   - **Entscheidungspunkt Start-Budget** (Review W3): Nach E1–E3 auf dem aktuellen `main` messen. Plan 0011 nennt 91,77 von 92 kB, Stufe 2 plant dort ≈ 0,10 kB. Wer als Zweiter nach `main` merged, misst neu.
   - Sparhebel, schon festgelegt: knappe Formprüfung (E1), `pointOrigin` im Reducer statt doppelter Literale (E3).
   - Liegt es trotzdem über dem Budget: Rückfrage an den Nutzer und Nachtrag zu ADR 0012, kein stilles Anheben.
6. `/arch-review`, Pflicht wegen der Änderung an einer Invariante und am ADR.
7. Push des Branches `standort-speichern`, CI grün, Fast-Forward nach `main`, CI auf `main` grün.
8. `/browser-review live`: Standort wählen, neu laden, Startpunkt steht, auch als installierte PWA (Kaltstart).

## Risiken

- **Start-Budget**: siehe Schritt 5, Entscheidungspunkt.
- **Bestehende E2E** setzen teils einen Standort und laden dann in derselben Seite neu (`karte.spec.ts`, „Startausschnitt verrät weder Standort noch Alter“). Dort wird nach der Standortwahl nicht mehr neu geladen, der Test ist also nicht betroffen. Weitere Fälle zeigt der volle E2E-Lauf.
- **Kartenmitte nach dem Neuladen**: Sie heißt weiter „Kartenmitte“, die Karte startet aber im üblichen Ausschnitt. Das wird bewusst hingenommen (ADR 0017, Folgen), der Layer zeigt den Punkt.
- **Alter Standort**: Ein wiederhergestellter Standort kann Tage alt sein und heißt trotzdem „Mein Standort“. Ein Zusatz wie „zuletzt gewählt“ kostet Start-Budget und kommt als Idee nach `docs/ideas.md` (Review K9).

## Review (2026-10-06) – Verdict: Freigabe mit Änderungen

Unabhängiger `plan-reviewer`. Keine Blocker. Alle Punkte übernommen:

- **W1** Widerspruch zu ADR 0011, Punkt 6 → ADR 0017 nennt die Änderung von Punkt 6 (Spiegelstriche 1 und 3) im Kopf, ADR 0011 bekommt „Geändert durch ADR 0017“ (E6).
- **W2** `architecture.md` Zeilen 21, 48, 60 nicht nachgezogen → in E6 aufgenommen.
- **W3** Start-Budget kollidiert mit Plan 0011, Stufe 2 → Entscheidungspunkt in Schritt 5, Sparhebel in E1/E3 festgelegt, kein stilles Anheben.
- **W4** Reset von `latestRequest` nur für `setDistrict` getestet → späte Antwort parametrisiert über `setDistrict`, `setMapCenter`, `clear`, zweites `locateMe` (Tests, 3).
- **K5** veraltete Kommentare → Liste in E4.
- **K6** Test 4 unentschieden → festgeschrieben: E2E belegt den Kern.
- **K7** Test 6 → eigener kurzer Test.
- **K8** Zähler-Beleg ohne Nachweis, dass der Wrapper greift → Flag `__geoWrapped`.
- **K9** alter Standort, Kartenmitte nicht sichtbar → Risiko notiert, Zusatz „zuletzt gewählt“ nach `docs/ideas.md`.
- **K10** Fußnote → „Dein Startpunkt bleibt nur auf diesem Gerät (ein Standort auf ca. 100 m gerundet).“
- **K11** ADR-Status → „Entwurf“ bis zum Merge; Verweis „(E5)“ korrigiert.
- **K12** E3-Signatur → `import type { StoredOriginPoint }` aus `src/data/preferences.ts`.

## Umsetzung (2026-10-06)

- Umgesetzt wie geplant, mit drei Abweichungen fürs Start-Budget (Schritt 5, Entscheidungspunkt):
  - **Ein `saveOrigin(value: string | StoredOriginPoint | undefined)`** statt `saveOriginDistrict` und `saveOriginPoint`. Eine ID speichert den Stadtteil, ein Punkt Standort bzw. Kartenmitte, `undefined` löscht. Der jeweils andere Schlüssel wird immer gelöscht, „nie beides“ (E2) liegt also in `src/data` und ist dort getestet.
  - **Kein zweiter Ref `latestRequest`.** `nextRequest` zählt bei jeder Wahl hoch (Stadtteil, Kartenmitte, Entfernen). Eine Standort-Antwort wird nur gespeichert, solange `nextRequest.current === request`. Die Regel ist dieselbe, die parametrisierten Unit-Tests (Tests, 3) belegen sie.
  - **Formprüfung über `Object(JSON.parse(…))`** statt `in`-Prüfungen. `null`, Zahlen und Wahrheitswerte werden so zu Objekten ohne die Felder.
- **Start-Budget:** `main` 32d4edb 91,77 kB → **91,95 kB** (+0,18 kB, Budget 92 kB unverändert, Rest 0,05 kB). Eingetragen in ADR 0012 („Nachtrag 2026-10-06“). Für Plan 0011, Stufe 2 heißt das: nur mit Auslagern.
- **Gates:** `pnpm check:fast` grün. `PW_PORT=4473 pnpm check` grün, mit 1738 E2E-Tests, Coverage, knip, Schema und Size. Nach den Arch-Review-Fixes liefen `startpunkt.spec.ts` und `karte.spec.ts` auf Pixel 7 und Desktop erneut, 104 grün.

## Arch-Review (2026-10-06) – Verdict: Nacharbeit nötig, keine Blocker

- **M1** Entscheidungspunkt Start-Budget nicht dokumentiert → gemessen (91,77 → 91,95 kB), Abschnitt „Umsetzung“ und Nachtrag in ADR 0012.
- **m1** ADR 0017, Punkt 5 und der Kommentar zu `Infinity` waren ungenau → Text korrigiert, Unit-Fälle `Infinity`/`NaN` in `origin-state.test.ts`.
- **m2** `architecture.md`: Der Satz zur Kartenmitte stimmte nicht → „die Kartenmitte rundet `useOrigin` (`setMapCenter`) ebenso“.
- **m3** veraltete Kommentare und Testnamen → `reach.ts`, `use-transit.test.ts` und `ideas.md` nachgezogen.
- **m4** E2E zur gespeicherten Kartenmitte prüfte die Kamera-Regel nicht selbst → Vergleich von Kamera und Kachelpfaden mit dem Stand ohne Startpunkt.
- **m5** ADR 0017 noch „Entwurf“ → „angenommen“.

## Browser-Review live (2026-10-06) – bestanden, ohne Blocker

- **Ablauf live** (Playwright gegen https://zwergenplan.app/, Bundle `index-BlaEC7uo.js`; Pixel 7 hell und dunkel, iPhone 15/WebKit hell; Geolocation 49,45391/11,07752):
  - „Meinen Standort nutzen“ speichert genau `{"source":"standort","lat":49.454,"lon":11.078}`. Die Rohkoordinate steht nirgends.
  - Nach dem Neuladen: Statuszeile „Wegzeit ab deinem Standort mit Bus & Bahn …“, Kacheln mit Minuten, Kind-Sheet „Startpunkt: Mein Standort“ samt „(auf ca. 100 m gerundet)“. `getCurrentPosition` wird 0-mal aufgerufen, es gibt keine Konsolenfehler.
- **Screenshots** `node scripts/screenshots.ts https://zwergenplan.app/`: alle 168 Bilder angesehen (14 Ansichten × 6 Viewports × hell/dunkel).
  - Die neue Fußnote „Dein Startpunkt bleibt nur auf diesem Gerät (ein Standort auf ca. 100 m gerundet).“ steht in jeder Variante vollständig, ohne Abschneiden oder Überlappen (`kind-quelle-*`, `kind-*`).
- **Checkliste:**
  - **Lesbarkeit:** in Ordnung. Die Fußnote ist Sekundärtext mit ausreichendem Kontrast, hell und dunkel (`kind-quelle-320-dark`, `kind-quelle-365-dark`).
  - **Daumen:** in Ordnung. „Fertig“ steht fest unten, Standort-Knopf und Stadtteil-Auswahl sind voll breit (`kind-360-light`).
  - **Zustände:** Der Startpunkt übersteht das Neuladen (`start-startpunkt-*`, Ablauf oben). Nichts ist abgeschnitten.
  - **Dark Mode:** keine kontrastlosen Flächen, keine grellen Inseln (`kind-pixel-dark`, `start-*-dark`).
  - **Micro-Interactions:** keine neuen. Die bestehenden Zustände sind sichtbar (aktiver Chip und Tab, Segment).
  - **Stickerheft-Stil:** durchgängig.
- **Befunde ohne Bezug zu dieser Änderung** (schon vorher da, offen):
  - Mittel: Das Herz überdeckt bei 360–412 px das Ende langer Kurstitel (`ort-pixel-light/dark`, knapp `ort-360-*`, `ort-365-*`).
  - Mittel: Detail bei 320 px, die gestapelte Aktionsleiste schiebt „Wann/Wo“ unter die Falz (`detail-320-*`).
  - Mittel: Anbieter-Sheet und Anbieterliste quer zeigen kaum Inhalt über der Falz (`anbieter-sheet-quer-*`, `anbieter-quer-*`).
  - Mittel: Zoom-Knöpfe verdecken Cluster am rechten Kartenrand (`karte-320-*`, `karte-pixel-*`, `karte-quer-*`).
  - Klein: geschützte Leerzeichen fehlen („10 / Min.“, „12 / € im Monat“, „© / OpenStreetMap“), dazu Silbentrennung in Eigennamen („Nürn-berg“) und der Monatskalender bei 320 px ohne Seitenrand.
