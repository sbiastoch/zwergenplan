# Plan 0025 – Merkliste als Planungszentrale: Anbieter merken, Karte, Kalender, Filter

Status: Entwurf, wartet auf `/plan-review`
Datum: 2026-10-08
Bezug: Plan 0003 (E12 Merkliste, E14 Kalender), Plan 0005 (Karte, E5 Umschalter), Plan 0007 (E2 „jetzt“), Plan 0008 (E12 Leerzustände), Plan 0010 (E2 Tab-Leiste, E3 Anbieter-Sheet, E6 `anbieter.json`), Plan 0018 (ICS altersgerecht), Plan 0021 (Altersfilter), ADR 0007, ADR 0008, ADR 0012, ADR 0013, ADR 0018
Abhängigkeiten (parallel in Arbeit, beim Schreiben nicht gepusht, geplant gegen die Beschreibung):
- **Plan 0022** (Branch `feedback-0022-kleinigkeiten`): „Sticker/Stickerheft“ verschwindet aus der UI, die Merkliste heißt „Meine Merkliste“, Toasts sagen „gemerkt“. Dieser Plan nutzt die neuen Begriffe, alle Texte unten sind schon so geschrieben. **Muss vor Etappe 1 auf `main` sein.**
- **Plan 0023** (Branch `zeitraumfilter-0023`): Zeitraum von/bis im `FilterState` (URL `von=`/`bis=`, Berliner Tage inklusive), reine Domänenfunktion in `src/domain/filter.ts`. Kurs passt, wenn sein erster Termin im Zeitraum liegt; regelmäßig/einmalig, wenn irgendein Termin im Zeitraum liegt. Bei aktivem Zeitraum gruppiert die Liste nach dem ersten Termin im Zeitraum. **Muss vor Etappe 4 auf `main` sein.**
- **Plan 0024** (Branch `karte-look-0024`): Kategorie-Symbole als Marker, Grundkarte in App-Farben. Keine harte Abhängigkeit: Die Merkliste nutzt dieselbe Karte (`MapPanel`) und erbt den Look. Wer zuletzt merged, löst Konflikte in `MapScreen.tsx`.

## Ziel

Nutzerwünsche vom 2026-10-08 (Nummern aus der Feedback-Liste):

- **8.** „Man soll auch Anbieter merken können.“
- **9.** „Auf der Merkliste soll es auch eine Karte geben.“
- **10.** „Auf der Merkliste soll man auch filtern können, wichtig ist hier vor allem nach Format und Anmeldung, sowie vielleicht über einen Regler ab wann ein möglicher Beginn der anzuzeigenden Kurse ist, damit man einen neuen Kurs als Ersatz für einen auslaufenden suchen und sich dafür früh anmelden kann.“
- **11.** „Der Kalender sollte nur die eigenen gemerkten Termine anzeigen, sodass man damit seine Woche planen kann. Die Wochen- oder Monatsansicht dient dabei gleichzeitig als Filter für einen Tag, Woche oder Monat.“

Verbindliche Nutzerentscheidungen (2026-10-08):

- **a)** Der eigene Tab „Kalender“ entfällt. Die Merkliste bekommt wie „Entdecken“ einen Umschalter **Liste | Karte | Kalender**. Alle Angebote nach Datum durchsuchen geht künftig über den Zeitraumfilter (Plan 0023).
- **b)** „Beginn ab“ ist kein eigener Regler, sondern derselbe Zeitraumfilter wie auf der Startseite, ergänzt um Schnellwahlen „ab nächstem Monat“, „in 2 Monaten“, „in 3 Monaten“ (die Daten reichen ca. 4 Monate).

Die Merkliste wird damit vom Sammelkorb zur Planungszentrale: Was ich vorhabe (gemerkte Angebote), wo es ist (Karte), wann es ist (Kalender als Wochenplaner), und bei wem ich weitersuchen will (gemerkte Anbieter).

UX-Leitlinien:

1. **Eine Merkliste, drei Blicke.** Liste, Karte und Kalender zeigen dieselben gemerkten Angebote mit denselben Filtern. Nur die Darstellung wechselt.
2. **Merklisten-Filter und Startseiten-Filter sind getrennt.** Wer auf der Merkliste „nur Kurse“ wählt, ändert nichts an „Entdecken“, und umgekehrt.
3. **Der Kalender ist der Wochenplaner.** Er zeigt nur Gemerktes. Tag, Woche oder Monat im Kalender bestimmen, was darunter steht.
4. **Nichts Gemerktes verlässt das Gerät.** Gemerkte Anbieter liegen wie gemerkte Angebote nur im `localStorage`, nie in URL oder Request.
5. **Keine Sackgasse.** Jeder Leerzustand sagt, warum er leer ist, und bietet den nächsten Schritt an.

## Nicht-Ziele

- **Kein Kalender in „Entdecken“.** Der Umschalter dort bleibt Liste | Karte. Wer alle Angebote nach Datum sucht, nutzt den Zeitraumfilter (Entscheidung a).
- **Keine weiteren Filter-Dimensionen auf der Merkliste** außer Format, Anmeldung und Zeitraum (siehe Offene Punkte, N4). Kategorie, Kosten, Wegzeit und Alter gibt es dort nicht.
- **Der Altersfilter gilt auf der Merkliste weiterhin nicht** (Plan 0021, Nicht-Ziele). Unpassende gemerkte Angebote bleiben markiert sichtbar, auch im Kalender.
- **Der Merklisten-ICS-Export bleibt, wie er ist** (ADR 0007, ADR 0018): alle gemerkten Angebote, unabhängig vom Merklisten-Filter (E9; Alternative in N3).
- **Kein Herz in der Anbieterliste** (Tab „Anbieter“) und keine Sortierung „gemerkte zuerst“. Gemerkt wird im Anbieter-Sheet (E2). Steht in `docs/ideas.md`.
- **Keine Benachrichtigung über neue Angebote gemerkter Anbieter** (Wochen-Push, Plan 0017). Steht in `docs/ideas.md`.
- **Merklisten-Filter stehen nicht in der URL** und überstehen kein Neuladen (E6).
- **Keine Orte gemerkter Anbieter ohne kommende Angebote auf der Karte.** Katalog-Orte in `anbieter.json` haben kein `geo` (Plan 0019, Nicht-Ziel), und `anbieter.json` lädt nur mit Tab bzw. Sheet „Anbieter“.
- **Keine rollende Kalenderwoche** (`docs/ideas.md`, Befund H2): Die Woche bleibt Mo–So.
- **Kein Lazy-Chunk für die Merkliste**, solange das Start-Budget es nicht verlangt (E11).
- **Kein Merken von Orten** (nur Angebote und Anbieter).

## Ausgangslage

Stand `main` `a666dbe`.

**Merkliste**
- `src/ui/SavedView.tsx:71–120`: Überschrift „Mein Stickerheft“ (Plan 0022 ändert sie), Leerzustand mit „Angebote entdecken“, Knopf „Alle in den Kalender“ (Sammel-ICS, ADR 0007), Zeile „N Sticker · M Termine in einer .ics-Datei · Kurse immer komplett“, dann je gemerktem Angebot eine `OfferCard` (`dated`) mit dem nächsten Termin. Kein Filter, kein Umschalter, keine Statuszeile.
- `src/ui/SavedView.tsx:29–57`: einziger Lader des Export-Chunks `src/domain/ics.ts` (`ics-entry-only`, `LAZY_LOADERS` in `scripts/check-architecture.ts:60`), `preloadExportWhenIdle` startet `App.tsx:88`. Plan 0018 (freigegeben, noch nicht umgesetzt) verlegt den Lader nach `src/ui/ics-export.ts`.
- `src/domain/saved.ts:9–29`: `toggleId`, `savedOffers(offers, ids, now)` (nur mit kommendem Termin, sortiert nach dem nächsten Termin), `collectionSessions` (Export-Auswahl).
- `src/data/preferences.ts:7–13, 41–52`: Schlüssel `zwergenplan.merkliste`, `loadSaved()`/`saveSaved()` als JSON-Array von IDs.
- `src/ui/use-app-state.ts:130–143`: `useSaved()` liefert `[ids, toggle]`, `toggle` meldet, ob danach gemerkt.
- `src/ui/App.tsx:160–168`: `onToggleSave` mit Toast. `App.tsx:249` blendet die Schnellfilter auf der Merkliste aus, `App.tsx:248` die Kategorie-Sticker. `App.tsx:282` zeigt Statuszeile und Hinweise auf allen Tabs außer der Merkliste. `App.tsx:411–419` rendert `SavedView`.
- `src/ui/use-offer-views.ts:204`: `saved = savedOffers(offers, savedIds, now)`; `App.tsx:421` zeigt `saved.length` als Badge.

**Kalender (Tab, entfällt)**
- `src/domain/route.ts:15`: `TABS = ["entdecken", "karte", "kalender", "anbieter", "merkliste"]`; unbekanntes `ansicht=` ergibt „entdecken“ (`parseRoute`, Zeile 34). `tabSection` (Zeile 19) macht aus „karte“ „entdecken“.
- `src/ui/Chrome.tsx:130–136`: `TAB_ITEMS` mit vier Tabs. `tabs.css` positioniert den Daumen per `at-0` … `at-3`. `docs/architecture.md:117` (Mobile-UX, „Tab-Leiste“): „vier Spalten“.
- `src/ui/Chrome.tsx:178–199`: `ViewToggle({ map, onMap })`, fest zwei Segmente (`seg seg2`, Daumen per `translateX`).
- `src/ui/CalendarView.tsx` (355 Zeilen): `WeekStrip`, `MonthGrid`, `AgendaEmpty`, Agenda eines Tages. Monat klappt beim Tipp auf einen Tag zu (`CalendarView.tsx:123–126`); der Monatsknopf hält seine Lage (`useLayoutEffect`, E5 aus Plan 0007).
- `src/ui/use-offer-views.ts:112–131, 165–196, 221–231`: `calendar.{index, allIndex, lastDay, dataEnd, endedToday, day, setDay, monthOpen, setMonthOpen}`, nur bei `route.tab === "kalender"` gefüllt.
- `src/domain/calendar.ts`: `clampDay`, `calendarNav(day, today, lastDay)` (Woche/Monat vor und zurück). `src/domain/agenda.ts:94–175`: `sessionsByDay`, `DayAgenda`, `dayAgenda`, `endedOnDay`, `weekDays`, `monthDays`, `lastSessionDay`.
- `src/ui/App.tsx:377–395`: Kalender-Zweig samt `ListPending` bei `wegzeit=` (Plan 0009, M7).
- `src/ui/OfferCard.tsx:45, 76`: `calendarDay` geht ans Detail (`referenceSession`, `agenda.ts:36`).
- Kein Push-, Service-Worker- oder ICS-Pfad kennt `ansicht=kalender` (grep in `src/sw`, `scripts/push-weekly.ts`, `public/manifest.webmanifest`: `start_url` ist `./`). Nur `scripts/screenshots.ts:77` (Ansicht `kalender`) und `scripts/font-fallback.ts:139` (Wort „Kalender“ als Probe; bleibt, weil der Umschalter es trägt) nennen ihn.

**Karte**
- `src/ui/MapPanel.tsx` (Start) → `src/ui/karte/MapScreen.tsx` (Lazy) → `src/ui/map/MapView.tsx` (MapLibre). Props `MapScreenProps` in `src/ui/map-types.ts`: `offers`, `cameraOffers` (alle kommenden, Kamera-Regel ADR 0008), `origin`, `reach`, `ctx`, `onResetFilter`, `age` u. a.
- `src/ui/App.tsx:124–126`: Öffnen der Karte ist ein Wegzeit-Anlass (`want()`), weil „Kartenmitte als Startpunkt“ dort steht.
- `src/ui/map/MapView.tsx:44–52`: `lastCamera` gilt für die ganze Sitzung, nie gespeichert.

**Anbieter**
- `src/ui/anbieter/ProviderSheet.tsx` (Lazy-Chunk `anbieter/`): Name, Kategorien, „Website & Programm“, Orte, kommende Angebote. Props `ProviderSheetProps` in `src/ui/provider-types.ts:37–48`. Den Dialog rendert `Overlays.tsx` immer, mit `toast`.
- `src/domain/site-data.ts:8–11`: Jedes `SiteOffer` trägt `providerId` und `providerName`. Den Katalog (`anbieter.json`) lädt nur `src/data/providers.ts`, und nur mit Tab oder Sheet „Anbieter“ (Invariante in `docs/architecture.md:101`, E2E in `e2e/anbieter.spec.ts`, Privatsphäre).
- `src/domain/provider-count.ts`: `isKnownProvider` (Katalog oder Angebote).
- `docs/ideas.md:197`: „Anbieter merken oder ‚folgen‘ … (Plan 0010, Nicht-Ziele)“ – wird mit diesem Plan umgesetzt.

**Start-Budget** (ADR 0012, Nachtrag „Budget 100 kB“): zuletzt 92,78 kB von 100 kB (nach Plan 0017). Pläne 0022–0024 und 0018 kommen davor dazu; gemessen wird vor Etappe 1 neu.

**E2E, die den Kalender-Tab oder `ansicht=kalender` benutzen** (grep `Kalender` in `e2e/`, ohne „in den Kalender“/„Kalender-Datei“):

| Datei:Zeile | Inhalt | Umgang (Etappe 3) |
|---|---|---|
| `e2e/calendar.spec.ts` (ganz) | Woche, Agenda, B2, E12, Blättern, Monat, B8, H2, Detail-Termin, „jetzt“ (5 Tests) | wird zu `e2e/merkliste-kalender.spec.ts` mit gemerkten Fixtures; „Monat klappt zu“ ändert sich (E5) |
| `e2e/timezone.spec.ts:19–20` | Berliner Tag als heute markiert | im Merklisten-Kalender, vorher ein Angebot merken |
| `e2e/anbieter.spec.ts:214–229` | Deep-Link Sheet über Tab „Kalender“ | über `?ansicht=merkliste-kalender` |
| `e2e/anbieter.spec.ts:279` | `pushState("?ansicht=kalender")` | `?ansicht=merkliste` |
| `e2e/anbieter.spec.ts:464–467` | „ohne Anlass (Kalender, Startpunkt gespeichert)“ | Merkliste-Kalender |
| `e2e/smoke.spec.ts:39–40` | Ansicht „Kalender“ bei 320 px/200 % mit echten Daten | Merklisten-Kalender, vorher drei Herzen tippen |
| `e2e/layout.spec.ts:186–187, 307` | Kalender-Ansicht im Layout-Gate | Merklisten-Kalender |
| `e2e/layout.spec.ts:566–629` | Tab-Leiste mit vier Tabs, `TAB_NAMES` | drei Tabs (E8) |
| `e2e/mobile-ux.spec.ts:83–90, 408, 455–460` | Zustände `kalender`, `kalender-woche`, Touch-Ziele, 320 px + reduzierte Bewegung | Merklisten-Zustände (Tests, Punkt 8) |
| `e2e/startpunkt.spec.ts:186–196` | Statuszeile „Kalender, Gostenhof“ | entfällt; dieselbe Prüfung gibt es für Liste, Karte und Anbieter |
| `e2e/startpunkt.spec.ts:233–239` | „Filter-Sheet und Kalender sind kein Anlass“ | „Filter-Sheet und Merkliste (Liste, Kalender) sind kein Anlass“; Merkliste-Karte ist einer |
| `e2e/startpunkt.spec.ts:784–788` | Kalender mit `?wegzeit=20`: Platzhalter | entfällt; neu: „Merkliste ignoriert `wegzeit=`“ |
| `e2e/karte.spec.ts:142` | Wechsel Karte → Kalender → Entdecken | Karte → Merkliste → Entdecken |
| `e2e/app.spec.ts:133` | Alters-Warnhinweis auf Tab „Kalender“ | auf Tab „Anbieter“ |
| `e2e/app.spec.ts:179–196` | Leerzustände inkl. Kalender | Kalender-Teil entfällt (Merkliste ignoriert das Alter) |
| `e2e/app.spec.ts:267–269` | Monatspunkt trägt gewählte Kategorie | im Merklisten-Kalender mit `?kat=` |
| `e2e/saved.spec.ts` (ganz) | Merkliste | erweitert (Tests 5–7) |

## Entscheidungen

### E1 – Speicher für gemerkte Anbieter

- Neuer Schlüssel in `src/data/preferences.ts`: `KEYS.savedProviders = "zwergenplan.anbieter-merkliste"`.
- Wert: JSON-Array von `{ "id": string, "name": string }`, in der Reihenfolge des Merkens. Der Name ist ein Schnappschuss beim Merken. Er wird gebraucht, wenn ein Anbieter gerade keine kommenden Angebote hat: Dann kennt `site.json` ihn nicht, und `anbieter.json` darf die Merkliste nicht laden (Invariante „`anbieter.json` nur mit Tab bzw. Sheet“).
  - Verworfen: nur IDs speichern und den Namen aus `anbieter.json` holen. Das wäre ein Request, der verrät, dass jemand Anbieter gemerkt hat, und bräche die Invariante.
  - Verworfen: nur IDs und ohne kommende Angebote die ID als Namen zeigen (`familientreff-beispiel`). Unlesbar.
- `loadSavedProviders(): SavedProvider[]` prüft nur die Form (Array, je Eintrag `id` und `name` als String, `id` passt auf `KEBAB_ID_PATTERN`, höchstens 80 Zeichen wie `MAX_PROVIDER_ID` in `route.ts`; Doppelte fallen weg). Kaputte Werte ergeben `[]`, wie `loadSaved`. `saveSavedProviders(list)` schreibt bei leerer Liste nichts (Schlüssel entfernen), baut jeden Eintrag neu (nur `id`, `name`).
- `SavedProvider` ist ein Typ in `src/domain/saved.ts` (`{ id: string; name: string }`), damit Domäne und `src/data` ihn teilen, ohne dass `src/data` Laufzeit-Code aus der Domäne braucht.
- Reine Logik in `src/domain/saved.ts`:
  - `toggleProvider(list, entry): SavedProvider[]` – entfernt per ID oder hängt an.
  - `savedProviderRows(list, offers, now): SavedProviderRow[]` mit `{ id, name, upcoming: number, next?: Session }`. `name` kommt aus dem ersten kommenden Angebot (`providerName`, aktueller Datenstand), sonst aus dem Schnappschuss. `upcoming` zählt kommende Angebote des Anbieters (`nextSession !== undefined`). Sortiert nach Name (`localeCompare(…, "de")`).
- Hook `useSavedProviders()` in `src/ui/use-app-state.ts`, gebaut wie `useSaved()`: `[list, toggle]`, `toggle(entry)` meldet, ob danach gemerkt.
- **Privatsphäre** (Invariante in `docs/architecture.md`, Abschnitt „Privatsphäre“, wird ergänzt): Gemerkte Anbieter bleiben im `localStorage`, nie in URL, Logs, Requests oder IndexedDB. Der Push (ADR 0014) liest sie nicht. `route.ts:1–3` nennt sie im Kopfkommentar neben Geburtsdatum und Merkliste. Kein Request hängt davon ab, ob oder welche Anbieter gemerkt sind (E2E, Tests 6).
- Gelöscht wird nie automatisch. Wie bei `savedOffers` bleiben Einträge auch dann stehen, wenn ein Anbieter im aktuellen Datenstand fehlt (ein lückenhafter Pipeline-Lauf soll keine Merkliste leeren, `saved.ts:1–4`).

### E2 – Merken im Anbieter-Sheet

- Im Kopf von `ProviderSheet` steht neben dem Namen (`h2`) ein Herz-Knopf wie auf der Kachel: `<button type="button" className="heart" aria-pressed={saved} aria-label={`${name} merken`}>`. Gleiches Icon (`heart`), gleiche Animation (`slap`), gleiche Klasse, damit Touch-Ziel (≥ 44 px), Fokusring und reduzierte Bewegung schon geprüft sind. Kopf als Flex-Zeile: Name links (`flex: 1`, darf umbrechen, `hyphens: auto`), Herz rechts oben (`align-self: start`).
  - Der Name des Knopfs folgt dem Muster der Kachel („… merken“ mit `aria-pressed`), nicht „Anbieter merken/entfernen“: ein Muster für alles Merkbare.
- Toasts (im Dialog, `toast` aus `Overlays.tsx`): „Anbieter gemerkt – steht jetzt in deiner Merkliste“ bzw. „Anbieter nicht mehr gemerkt“. Wortlaut passend zu Plan 0022; liefert 0022 andere Toast-Muster, gilt dessen Muster.
- `ProviderSheetProps` (`src/ui/provider-types.ts`) bekommt `saved: boolean` und `onToggleSaved: (entry: SavedProvider) => void`. `Overlays.tsx` reicht beides durch, `App.tsx` baut sie aus `useSavedProviders()`. Der Name im Eintrag ist `provider.name` (Katalog bzw. Rückfall-Zeile, `findProvider`).
- Der Ladezustand des Sheets (`ProviderSheetLoader`, noch ohne Chunk) zeigt kein Herz. Gemerkt werden kann erst, wenn der Name feststeht.

### E3 – Merkliste: Aufbau und Abschnitt „Gemerkte Anbieter“

Aufbau von oben nach unten (Liste):

1. `h2.ptitle` „Meine Merkliste“ (Plan 0022).
2. **Statuszeile** wie auf den anderen Tabs (`.status-row` mit `p.status[role=status][tabIndex=-1]`): „**5** gemerkt“, mit gemerkten Anbietern „**5** gemerkt · **2** Anbieter“. Bei aktivem Merklisten-Filter zählt die erste Zahl die sichtbaren gemerkten Angebote („**2** von 5 gemerkt“). Rechts der Umschalter Liste | Karte | Kalender (E4). Ohne Wegzeit-Zusatz (die Merkliste kennt keine Wegzeit-Grenze) und ohne `pwaNote` (die steht schon auf den anderen Tabs; bleibt wie heute).
3. **Filterzeile** (E6), horizontal scrollend wie die Schnellfilter.
4. Knopf „Alle in den Kalender“ und die Zeile darunter (E9).
5. Gemerkte Angebote (gefiltert), je eine `OfferCard` mit Datum. Ohne Zeitraum der nächste Termin (wie heute), mit Zeitraum der erste Termin im Zeitraum (Funktion aus Plan 0023), sortiert danach.
6. Abschnitt **„Gemerkte Anbieter“** (`h3`), nur wenn mindestens einer gemerkt ist. Er steht in der Liste **unter** den Angeboten: Die Angebote sind das, was man plant; die Anbieter sind der Ort zum Weitersuchen.

Zeile je gemerktem Anbieter (`savedProviderRows`), als Liste `ul.saved-providers`:

- Ein Knopf über die ganze Zeile außer dem Herz: Name (fett), darunter „3 kommende Angebote · nächster Mi 7.10.“ bzw. „Gerade keine Termine im Zwergenplan“ (Zeile dann blass wie „ohne Termine“ im Tab „Anbieter“, `anbieter.css`). Tipp öffnet das Anbieter-Sheet (`openProvider(id)`, `anbieter=<id>` in der URL wie überall). Erst **dieser Tipp** lädt Chunk und `anbieter.json` (zulässig: Sheet „Anbieter“).
- Rechts das Herz (`aria-pressed="true"`, „{Name} merken“). Tipp entfernt den Anbieter sofort, Toast „Anbieter nicht mehr gemerkt“. Der Fokus geht danach auf die Überschrift „Gemerkte Anbieter“ bzw., wenn der Abschnitt verschwindet, auf die Statuszeile (Muster wie Plan 0021, E3: vorher fokussieren, dann entfernen).
- Unbekannte ID beim Öffnen (Anbieter nicht mehr im Katalog und ohne Angebote): Das Sheet entfernt `anbieter=` wie heute (`onUnknown`, Plan 0010, E3). Die Zeile bleibt, bis man das Herz tippt; ihr Text sagt schon „Gerade keine Termine im Zwergenplan“.
- Die Merklisten-Filter wirken auf den Anbieter-Abschnitt **nicht**. Er ist eine Adressliste, keine Terminliste. Die Zahl „3 kommende Angebote“ zählt ungefiltert.
- Karte und Kalender zeigen den Abschnitt nicht (E4, E5). Ob kommende Angebote gemerkter Anbieter zusätzlich in Liste und Karte erscheinen, ist Offener Punkt N1 (Empfehlung: als Schalter, Etappe 5).
- Badge der Tab-Leiste: zählt wie heute nur gemerkte Angebote mit kommendem Termin. Begründung: Das Badge steht für das, was geplant ist und in den Kalender geht; Anbieter sind keine Termine.

### E4 – Umschalter Liste | Karte | Kalender

- **Route:** `TABS` in `src/domain/route.ts` wird `["entdecken", "karte", "anbieter", "merkliste", "merkliste-karte", "merkliste-kalender"]`. URL `ansicht=merkliste-karte` bzw. `ansicht=merkliste-kalender`, analog zu `ansicht=karte` für „Entdecken“ (Plan 0005, E5). `tabSection` bildet beide auf „merkliste“ ab.
  - Verworfen: eigener Parameter `darstellung=`. Ein zweiter Parameter für dieselbe Sache, die „karte“ heute schon über `ansicht` löst.
  - Die Darstellung ist keine private Information (sie verrät nichts über das Gemerkte), darf also in die URL. Ein geteilter Link `?ansicht=merkliste-kalender` öffnet beim Empfänger dessen eigene Merkliste.
- **`ViewToggle`** (`Chrome.tsx`) wird allgemein: `ViewToggle<V extends string>({ options: readonly { value: V; label: string }[]; current: V; onChange: (v: V) => void; legend: string })`. Klasse `seg seg${options.length}`, Daumen `translateX(${index * 100}%)`. `styles/chrome.css` bekommt `.seg3` (drei gleich breite Spalten) neben `.seg2`. „Entdecken“ nutzt zwei Optionen, die Merkliste drei. Legende „Darstellung der Angebote“ bzw. „Darstellung der Merkliste“.
  - Bei wenig Platz bricht der Umschalter unter die Statuszeile (wie heute, Plan 0005, E5). Das Layout-Gate prüft 320 px/200 % (Tests, Punkt 8).
- **Karte der Merkliste:** `MapPanel` mit
  - `offers` = die gefilterten gemerkten Angebote (ggf. plus Anbieter-Angebote, N1),
  - `cameraOffers` = **alle kommenden Angebote** (wie „Entdecken“). Der Startausschnitt darf nicht von der Merkliste abhängen, sonst verrieten die Kachel-Requests, wo die gemerkten Angebote liegen (Kamera-Regel, ADR 0008). Keine Abweichung von ADR 0008.
  - `onResetFilter` = Merklisten-Filter zurücksetzen (nur bei aktivem Merklisten-Filter), `age` = `undefined` (Merkliste ignoriert das Alter).
  - Statuszeile: „**3** gemerkt an **2** Orten“ (`mapStatusParts`-Muster, neuer Text in `format.ts`: `savedMapStatusParts`).
  - Orts-Sheet, Orts-Liste und „Kartenmitte als Startpunkt“ wie in „Entdecken“. `lastCamera` (Sitzung) teilen sich beide Karten; das ist gewollt.
  - **Wegzeit-Anlass:** Öffnen der Merklisten-Karte ruft `want()` wie die Karte von „Entdecken“ (`App.tsx:124–126` prüft künftig `route.tab === "karte" || route.tab === "merkliste-karte"`). Liste und Kalender der Merkliste sind kein Anlass.
- **Fokus:** Der Umschalter bleibt beim Wechsel dasselbe Element an derselben Stelle; der Fokus bleibt auf dem gedrückten Segment. `window.scrollTo({ top: 0 })` nur beim Tab-Wechsel, nicht beim Wechsel der Darstellung (wie heute bei Liste | Karte).
- **Leere Merkliste:** Ist weder ein Angebot noch ein Anbieter gemerkt, gibt es weder Statuszeile noch Umschalter noch Filter, nur den Leerzustand (Text aus Plan 0022). Eine Karte ohne Inhalt lädt so keine Kacheln. Steht die URL auf `merkliste-karte`/`-kalender`, bleibt sie stehen; der Leerzustand ist derselbe.

### E5 – Kalender der Merkliste: Tag, Woche oder Monat als Filter der Liste darunter

**Inhalt:** nur Termine gemerkter Angebote, nach den Merklisten-Filtern Format und Anmeldung (E6), **jeder** nicht beendete Termin (bei einem Kurs also jede Kursstunde, bei einer regelmäßigen Gruppe jedes Treffen). Grundlage ist `sessionsByDay(savedFiltered)`; `allIndex` ist `sessionsByDay(savedAll)` (ungefiltert, für „ausgeblendet“).

**Auswahl** – neuer reiner Typ in `src/domain/calendar.ts`:

```ts
/** Was der Kalender der Merkliste auswählt (Plan 0025, E5). `day` ist ein Berliner Tag, nie vor heute. */
export interface CalendarSelection {
  unit: "tag" | "woche" | "monat";
  /** Anker: der gewählte Tag; bei Woche/Monat ein Tag darin (für Woche: Mo–So um ihn, Monat: sein Monat) */
  day: string;
}
/** Erster und letzter Berliner Tag der Auswahl, inklusive; nie vor `today`. */
export function selectionRange(sel: CalendarSelection, today: string): { from: string; to: string };
/** Ziele der Pfeile je Einheit; `undefined` = gesperrt (Grenzen wie `calendarNav`). */
export function selectionNav(sel: CalendarSelection, today: string, lastDay: string | undefined): {
  prev: CalendarSelection | undefined;
  next: CalendarSelection | undefined;
};
```

- Startwert: `{ unit: "woche", day: today }` – „seine Woche planen“ (Wunsch 11). Liegt im Sitzungszustand von `useOfferViews` (wie heute `calendarDay`/`monthOpen`), übersteht Tab- und Darstellungswechsel, nicht das Neuladen. `day` wird beim Lesen mit `clampDay` auf heute gezogen (nach Mitternacht im offenen Tab).
- Navigationsgrenze `lastDay` ist der letzte Tag des **ganzen Datenstands** (`lastSessionDay(upcoming)`), nicht der letzten gemerkten Termine. So kann man auch in leere Wochen blättern und von dort „Für diese Woche entdecken“ (unten) nutzen.

**Interaktion:**

| Ansicht | Geste | Auswahl danach |
|---|---|---|
| Woche (Standard) | Tipp auf einen Tag | `tag` = dieser Tag |
| Woche | Tipp auf den schon gewählten Tag | `woche` (zurück zur ganzen Woche) |
| Woche | Tipp auf den Wochentitel „5.–11. Okt.“ (jetzt ein Knopf, `aria-pressed` bei `woche`) | `woche` |
| Woche | Pfeil ‹ / › | `woche` der vorigen/nächsten Woche (blättern zeigt immer die ganze neue Woche) |
| Woche | „Ganzen Monat zeigen“ | Monatsraster auf, `monat` des Ankertags |
| Monat | Tipp auf einen Tag | `tag` = dieser Tag, **Raster bleibt offen** (Änderung zu heute, `CalendarView.tsx:123–126`: Der Monat ist jetzt ein Filter, kein Datumswähler) |
| Monat | Tipp auf den gewählten Tag | `monat` |
| Monat | Tipp auf den Monatstitel „Oktober 2026“ (Knopf, `aria-pressed` bei `monat`) | `monat` |
| Monat | Pfeil ‹ / › | `monat` des vorigen/nächsten Monats (Anker: der 1., nie vor heute) |
| Monat | „Monat zuklappen“ | `woche` um den Ankertag |

- Vergangene Tage bleiben gesperrt (`disabled`, wie heute). Der Monatsknopf hält seine Lage beim Auf- und Zuklappen (bestehender `useLayoutEffect`, Plan 0007, E5).
- Die Punkte in Woche und Monat (`dots`, Kategorie-Formen) zeigen nur gemerkte Termine. Sie folgen `ctx.categoryOf` wie heute (Plan 0014: gewählte Kategorie der Startseite zuerst).
- `aria-label` je Tag: „Mittwoch, 7. Oktober, 1 Termin“ (heute „… Angebote“; im Merklisten-Kalender zählen Termine). Wochentitel: „Ganze Woche, 5. bis 11. Oktober, 3 Termine“; Monatstitel analog.

**Liste darunter** (`h2.daylabel` + Karten):

- Überschrift nach Auswahl: „Heute, 5. Oktober“ / „Mittwoch, 7. Oktober“ (wie `agendaHeading`), „Diese Woche“ / „Woche 12.–18. Okt.“, „Oktober 2026“; rechts `small` „3 Termine“. Neue reine Texte in `src/ui/format.ts`: `selectionHeading(sel, today)`, Wortlaute test-first.
- Bei `woche` und `monat` gruppiert nach Tag mit `h3` je Tag („Mi 7.10.“), nur Tage mit Terminen. Je Termin eine `OfferCard` mit `calendarDay` = dieser Tag (Detail nimmt den Termin, `referenceSession`).
- Reine Domänenfunktion in `src/domain/agenda.ts`, ersetzt `dayAgenda`:

```ts
export interface RangeAgenda<T extends Offer> {
  /** nicht beendete Termine je Tag in [from, to], Tage aufsteigend, je Tag nach Beginn */
  groups: DayGroup<Occurrence<T>>[];
  count: number;
  /** heute schon beendete passende Termine, wenn `today` in [from, to] liegt */
  ended: number;
  /** nicht beendete Termine in [from, to], die der Merklisten-Filter ausblendet (allIndex minus index, nie < 0) */
  hidden: number;
  /** `from` liegt nach dem letzten Tag des Datenstands */
  afterData: boolean;
}
export function rangeAgenda<T extends Offer>(
  index: ReadonlyMap<string, Occurrence<T>[]>,
  range: { from: string; to: string },
  now: Date,
  context: { dataEnd: string | undefined; endedToday: number; allIndex: ReadonlyMap<string, Occurrence<T>[]> },
): RangeAgenda<T>;
```

  Iteriert die Tage von `from` bis `to` (höchstens 31) per `addDays`, nicht die Map. `dayAgenda` entfällt, `endedOnDay` bleibt (jetzt über die gefilterten gemerkten Angebote).

**Leerzustände** der Liste, in dieser Reihenfolge (Muster aus `AgendaEmpty`, Plan 0008, E12):

1. `hidden > 0`: „Nichts, was zu deinem Filter passt“ / „2 gemerkte Termine blendet der Filter aus.“ / Knopf „Filter zurücksetzen“ (setzt nur die Merklisten-Filter zurück). Kein „Auch unpassende zeigen“ (das Alter wirkt hier nicht).
2. `ended > 0` (nur bei `tag` = heute): „Für heute ist alles vorbei“ wie heute.
3. `afterData`: „Weiter reicht der Plan noch nicht“ wie heute.
4. sonst: „Nichts gemerkt“ / „Für diesen Tag (diese Woche, diesen Monat) hast du nichts gemerkt.“ / Knopf „Für diesen Tag entdecken“ bzw. „… diese Woche …“/„… diesen Monat …“ (Etappe 4, braucht Plan 0023): wechselt zu „Entdecken“ und setzt dort den Zeitraum auf die Auswahl (`von=`/`bis=`, alle übrigen Startseiten-Filter bleiben). Vor Etappe 4 steht stattdessen „Angebote entdecken“ ohne Zeitraum.

**Zeitraum-Filter im Kalender:** Die Kalenderauswahl **ist** der Zeitraum. In der Darstellung Kalender ist der Zeitraum-Chip der Merkliste ausgeblendet; sein Wert bleibt erhalten und gilt wieder in Liste und Karte. Verworfen: beide kombinieren (Kurs-Regel „erster Termin im Zeitraum“ widerspricht „jeder Termin“ im Kalender, und zwei Zeitfilter übereinander wären schwer zu verstehen).

**Wiederverwendung:** `CalendarView.tsx` wird zu `src/ui/SavedCalendar.tsx` umgebaut (Datei umbenannt, `git mv`): `WeekStrip` und `MonthGrid` bleiben, bekommen `selection` statt `day` und die Titelknöpfe; `AgendaEmpty` wird zu `RangeEmpty`. Kein zweiter Kalender bleibt zurück. `styles/calendar.css` bleibt, ergänzt um den Titelknopf (`.cal-nav .cal-title`, ≥ 44 px hoch, sieht aus wie der heutige `<b>`-Titel, mit `aria-pressed`-Zustand über `--sel`/`--on-sel`).

### E6 – Filter auf der Merkliste: eigener Zustand, nicht in der URL

- Typ in `src/domain/saved.ts`:

```ts
/** Filter der Merkliste (Plan 0025, E6): getrennt vom Startseiten-Filter, nie in der URL. */
export interface SavedFilter {
  formats: Format[];
  registration: Registration[];
  /** Zeitraum aus Plan 0023 (Berliner Tage, inklusive); nur Liste und Karte */
  range?: DateRange;
}
export const EMPTY_SAVED_FILTER: SavedFilter;
export function applySavedFilter<T extends Offer>(offers: readonly T[], filter: SavedFilter, now: Date, opts: { useRange: boolean }): T[];
export function savedFilterCount(filter: SavedFilter, opts: { useRange: boolean }): number;
```

  `applySavedFilter` nutzt `matchesFilter` (`filter.ts`) für Format und Anmeldung, indem es einen `FilterState` mit leeren übrigen Dimensionen baut, und für den Zeitraum die Funktion aus Plan 0023. Keine eigene Format-, Anmelde- oder Zeitraumlogik. `DateRange` ist der Typ aus Plan 0023 (Name dort nachsehen, siehe Schritt 0).
- **Zustand:** `useState<SavedFilter>(EMPTY_SAVED_FILTER)` in `App.tsx`, neben `providerQuery`. Er übersteht Tab- und Darstellungswechsel, nicht das Neuladen.
  - **Nicht in der URL.** Die URL-Parameter `format=`, `anmeldung=`, `von=`, `bis=` gehören der Startseite und gelten auf allen Tabs außer der Merkliste. Eigene Parameter (`m-format=` o. ä.) würden die URL-Logik verdoppeln und sind beim Teilen wertlos: Der Empfänger hat eine andere Merkliste. Leitlinie 2: nicht vermischen.
  - Verworfen: `sessionStorage` (wie Plan 0021, E1: wenig Nutzen, eine weitere Stelle mit try/catch).
- **Bedienung:** Filterzeile `SavedFilters` (neue Komponente in `src/ui/SavedFilters.tsx`), gebaut wie `QuickFilters` (`fieldset.plain` > `.chips`, horizontal scrollend), Legende „Merkliste filtern“:
  - Chips: „Kurse“, „Regelmäßig“, „Einmalig“ (Mehrfachwahl, wie `QuickFilters`), „Mit Anmeldung“, „Ohne Anmeldung“ (**Einfachwahl** wie im Filter-Sheet: der eine schaltet den anderen ab), „Zeitraum“ (öffnet das Zeitraum-Sheet, E7; mit aktivem Zeitraum trägt der Chip den Wert, z. B. „ab 1. Nov.“, `aria-pressed="true"`).
  - Mit aktivem Filter steht am Ende ein Chip „Zurücksetzen“.
  - Kein Badge-Knopf „Filter“: Es gibt kein Sheet mit weiteren Dimensionen (Nicht-Ziel).
- **Wo der Filter wirkt:** Liste (gemerkte Angebote) und Karte mit Format, Anmeldung und Zeitraum; Kalender mit Format und Anmeldung (E5). Anbieter-Abschnitt nie (E3). Export nie (E9).
- **Startseiten-Filter auf der Merkliste:** wirken nicht, wie heute (Schnellfilter und Sticker sind dort ausgeblendet, `App.tsx:248–249`; die Bedingung wird zu `section !== "merkliste"`). Einzige Ausnahme bleibt `ctx.categoryOf`, das die Kategorie-Pille wählt (Plan 0014); es filtert nichts.

### E7 – Zeitraum mit Schnellwahlen

- Die Merkliste nutzt **dieselbe Zeitraum-Bedienung** wie die Startseite aus Plan 0023 (Komponente und Texte von dort), in einem eigenen kleinen Sheet „Zeitraum“ (`Overlays.tsx`, neue `SheetKind` `"saved-range"`), Fuß „N gemerkte zeigen“ und „Zurücksetzen“.
- Ergänzt um **Schnellwahlen** als Chips über den Datumsfeldern (Entscheidung b). Reine Funktion in `src/domain/filter.ts` (bzw. in dem Modul, in das Plan 0023 den Zeitraum legt):

```ts
/** Schnellwahlen „Beginn ab“ (Plan 0025, E7): Monatserste ab heute; nur solche vor dem Ende des Datenstands. */
export function quickRanges(today: string, dataEnd: string | undefined): Array<{ label: string; range: DateRange }>;
```

  - „ab nächstem Monat“ → `{ from: 1. des Folgemonats }` (ohne `to`),
  - „in 2 Monaten“ → `{ from: 1. des Monats in 2 Monaten }`,
  - „in 3 Monaten“ → `{ from: 1. des Monats in 3 Monaten }`.
  - Eine Schnellwahl, deren `from` nach `dataEnd` liegt, fehlt (sie zeigte immer nichts). Ohne `dataEnd` keine.
  - Beispiel heute (8.10.2026): ab 1.11., ab 1.12., ab 1.1.2027.
  - Gedeutet als „Beginn ab“, wie der Wunsch es beschreibt („ab wann ein möglicher Beginn …“). Für Kurse heißt das mit der Regel aus Plan 0023: Kurse, deren **erster** Termin ab dann liegt. Genau das braucht die Suche nach einem Ersatzkurs. Regelmäßige Gruppen passen, wenn sie dann noch Termine haben.
- **Auch auf der Startseite:** Die Schnellwahlen stecken in der gemeinsamen Zeitraum-Komponente, erscheinen also auch im Filter-Sheet der Startseite. Bringt Plan 0023 schon Schnellwahlen mit, werden diese drei dort ergänzt statt doppelt gebaut.
- Eine gewählte Schnellwahl ist danach einfach ein Zeitraum; der Chip zeigt den Wert („ab 1. Nov.“), nicht den Namen der Schnellwahl.

### E8 – Tab „Kalender“ entfällt

- `TAB_ITEMS` (`Chrome.tsx:130–136`): Entdecken · Anbieter · Merkliste. Reihenfolge sonst unverändert (Merkliste ganz rechts, Plan 0010, E2).
- `styles/tabs.css`: Daumen `at-0` … `at-2` für drei Spalten. Die Regeln aus `docs/architecture.md:117` gelten weiter (Rand, Label 12 px, Nur-Icon unter `4.25rem` Spaltenbreite, Seitenleiste quer, kompakt quer). Die Seitenleiste quer wird mit drei Tabs niedriger; die Höhenrechnung aus Plan 0010 (E2) wird im Layout-Test mit drei Tabs neu belegt. `docs/architecture.md` bekommt „drei Spalten“.
- **Alte Links `?ansicht=kalender`:** `parseRoute` liest `kalender` als `entdecken` (passiert durch `TABS.find(…) ?? "entdecken"` schon von selbst). Neu: `useRoute` ersetzt beim Start die URL einmal per `replaceState` durch die kanonische (`routeToSearch`), wenn `ansicht=kalender` darin stand, damit der Parameter nicht stehen bleibt. Reine Hilfe in `route.ts`: `isLegacyView(search): boolean`. Filter (`kat=`, `wegzeit=` …), `anbieter=` und `angebot=` bleiben erhalten.
  - Ziel „Entdecken“ statt „Merkliste“: Der alte Kalender zeigte **alle** Angebote nach Datum. Das gibt es jetzt in „Entdecken“ mit Zeitraum (Entscheidung a). Ein geteilter Link meinte nie die Merkliste des Empfängers.
- **Push, Service Worker, ICS:** keine Änderung. Die Wochen-Nachricht öffnet die Startseite (`docs/architecture.md:86`), der Service Worker kennt keine Ansichten, ICS-Links und der Toast „Kalender-Datei braucht Netz“ hängen nicht am Tab.
- **Wegzeit-Platzhalter** (`App.tsx:377`): Der Zweig für den Kalender fällt weg. Die Merkliste wartet nie auf die Wegzeit (keine Grenze). `docs/architecture.md:65` („ersetzt ein Platzhalter-Block Liste und Kalender“) wird zu „die Liste“.
- **`use-offer-views.ts`:** der Block `calendar` für „Entdecken“ entfällt (`index`, `allIndex`, `endedToday` über `route.filter`), stattdessen `savedCalendar` (E5) mit `index`/`allIndex` über die gemerkten Angebote, nur bei `route.tab === "merkliste-kalender"` berechnet.
- **Skripte:** `scripts/screenshots.ts` Ansicht `kalender` → `merkliste-kalender` (merkt vorher zwei Fixtures). `scripts/font-fallback.ts` behält „Kalender“ als Probe (Umschalter). Ändern sich dadurch die `size-adjust`-Werte nicht, bleibt `tokens.css` unberührt; sonst Skript laufen lassen und übernehmen (`docs/architecture.md:122–123`).

### E9 – Merklisten-ICS bleibt korrekt (ADR 0007, ADR 0018)

- „Alle in den Kalender“ exportiert **alle** gemerkten Angebote mit kommendem Termin, wie heute: Auswahl `collectionSessions` bzw. nach Plan 0018 `exportSessions`, dieselben VEVENTs und UIDs. Der Merklisten-Filter, die Kalenderauswahl und gemerkte Anbieter ändern daran nichts. ADR 0007 und ADR 0018 bleiben unverändert.
- Die Zeile darunter (heute `SavedView.tsx:108–111`, Begriffe nach Plan 0022) nennt mit aktivem Merklisten-Filter ausdrücklich „alle 5 gemerkten, auch ausgeblendete“, damit niemand annimmt, nur die sichtbaren gingen in den Kalender. Neuer reiner Text `exportNote(savedCount, sessionCount, filtered: boolean)` in `format.ts`.
- Der Knopf steht in allen drei Darstellungen an derselben Stelle unter der Filterzeile (auch im Kalender: dort plant man).
- Der Lader des Export-Chunks bleibt in `SavedView.tsx` (`LAZY_LOADERS`, `ics-entry-only`). Ist Plan 0018 vorher umgesetzt, liegt er in `src/ui/ics-export.ts`, und `SavedView` importiert den Lader von dort. In beiden Fällen kein neuer Lader.

### E10 – Mobile-UX und Barrierefreiheit

- Neue Ansichten und Overlays bekommen `expectMobileUx` hell und dunkel (`docs/architecture.md:126`): Merkliste Liste (mit Filtern und Anbietern), Karte, Kalender Woche, Kalender Monat mit gewähltem Tag, Zeitraum-Sheet, Anbieter-Sheet mit gemerktem Herz, Leerzustände.
- Touch-Ziele ≥ 44 px: Herz im Anbieter-Sheet und in der Anbieterzeile, Wochen- und Monatstitel-Knopf, Chips, drei Segmente des Umschalters bei 320 px.
- Text passt: Anbietername neben dem Herz bricht um (`hyphens: auto`, kein Bruch mitten in kurzen Wörtern), Segmente „Kalender“ einzeilig bei 100 % (Fixture), Statuszeile „**2** von 5 gemerkt · **2** Anbieter“ bei 320 px/200 %.
- Dunkelmodus: gewählter Wochen-/Monatstitel nutzt `--sel`/`--on-sel` (keine hellen Inseln).
- Reduzierte Bewegung: Daumen des dreiteiligen Umschalters ohne Transition (über `motion.css`, wie `.seg2`).
- Screenreader: Statuszeile ist die Live-Region (meldet „2 von 5 gemerkt“ nach Filterwechsel), Titelknöpfe mit `aria-pressed`, `h2.daylabel` für die Auswahl, `h3` je Tag.

### E11 – Start-Budget: im Start-Bundle bleiben, messen

- Die Merkliste bleibt im Start-Bundle. Kalender-Code zieht nur um (`CalendarView` → `SavedCalendar`), der Entdecken-Kalender in `use-offer-views.ts` fällt weg. Neu dazu kommen Anbieter-Abschnitt, Filterzeile, Auswahl-Logik und Texte. Schätzung: +1,0 bis +1,8 kB gzip über alle Etappen.
- Jede Etappe misst `JS (initial)` und trägt ihr Delta in die Tabelle von ADR 0012 („Nachtrag 2026-10-06: Budget 100 kB“) ein.
- **Entscheidungspunkt:** Liegt die Summe aller Etappen über +2,5 kB, wird vor dem Merge der nächsten Etappe die Merkliste als Lazy-Chunk geplant (`src/ui/merkliste/`, Vorladen im Leerlauf wie der Export, Eintrag in `startChunks` des Service Workers für offline, Regeln `merkliste-ui-only-lazy`/`-entry-only`, `LAZY_LOADERS`). Das ist ADR 0012 Option (d) für die Merkliste und bekäme ein eigenes ADR. Mit dem Wegfall des Kalender-Tabs trifft der Einwand aus ADR 0012 („Haupt-Tab offline am Vorladen“) nur noch die Merkliste, und die läge im Precache. Siehe N5.

### E12 – ADR-Prüfung

| ADR | Berührt? | Ergebnis |
|---|---|---|
| 0003 Datenmodell | nein | kein Schemafeld, keine ID-Änderung |
| 0007 Merklisten-ICS | ja, Export | unverändert, E9 |
| 0008 Karte/Kamera-Regel | ja, Merklisten-Karte | `cameraOffers` = alle kommenden; keine Abweichung (E4) |
| 0011/0017 Wegzeit, Startpunkt | ja, Anlass | Merklisten-Karte ist Anlass wie die Karte; Request gleich für alle |
| 0012 Startbudget | ja | Delta je Etappe in der Tabelle; Lazy erst am Entscheidungspunkt (E11), dann eigenes ADR |
| 0013 Service Worker | nein | keine neue Route, kein neuer Start-Chunk |
| 0014 Push | nein | liest gemerkte Anbieter nicht |
| 0018 ICS altersgerecht | ja, Export | unverändert |

**Ergebnis: kein neues ADR.** Geändert werden Regeln in `docs/architecture.md` (Tab-Leiste drei Spalten, Privatsphäre um gemerkte Anbieter, Wegzeit-Platzhalter nur Liste, Karte der Merkliste als Wegzeit-Anlass) und Pläne per Vermerk (E13). Kommt es zum Lazy-Chunk (E11), wird das ein ADR.

### E13 – Doku

- `docs/architecture.md`: wie in E12, dazu im Datenfluss-Block „wegzeit.json nur auf Anlass (Kind-Sheet, Karte **auch auf der Merkliste**, …)“.
- `docs/ideas.md`: „Anbieter merken oder ‚folgen‘“ und „Karte im Kalender oder in der Merkliste“ entfallen (umgesetzt). „Kalender und Merkliste als Lazy-Chunks“ wird zu „Merkliste als Lazy-Chunk“ mit Verweis auf E11. Neu: „Herz in der Anbieterliste“, „Neue Angebote gemerkter Anbieter in der Wochen-Nachricht“, „Merklisten-Filter in der URL“; je nach N1 „Angebote gemerkter Anbieter in der Merkliste“.
- Vermerke `> **Geändert durch Plan 0025:** …` in Plan 0003 (Z. 10 drei Bereiche, Z. 71 `ansicht=kalender`, E14 Kalender), Plan 0005 (Nicht-Ziel „Karte in der Merkliste“, E5 Umschalter), Plan 0007 (E5 Monat klappt zu), Plan 0008 (E12 Leerzustand Kalender), Plan 0010 (Z. 11 und E2 vier Tabs, Nicht-Ziel „Anbieter merken“), Plan 0021 (Test „Hinweis auf Tab Kalender“).
- `README.md`: falls es Tabs aufzählt, anpassen (grep in Schritt 0).

## Tests (test-first)

Domäne zuerst rot, dann Code. Unit-Tests laufen in `America/Los_Angeles`.

1. **`src/domain/saved.test.ts`**
   - `toggleProvider`: hinzufügen, entfernen per ID, Name eines erneut gemerkten Eintrags wird aktualisiert.
   - `savedProviderRows`: Name aus `providerName` des aktuellen Datenstands schlägt den Schnappschuss; ohne kommende Angebote Schnappschuss, `upcoming: 0`, kein `next`; vergangene Angebote zählen nicht; Sortierung `de`.
   - `applySavedFilter`: Format (ODER), Anmeldung, Zeitraum mit `useRange: true` (Kurs mit erstem Termin im Zeitraum passt, mit erstem Termin davor nicht; regelmäßig passt mit irgendeinem Termin), `useRange: false` ignoriert den Zeitraum; leerer Filter = alle.
   - `savedFilterCount`.
2. **`src/domain/calendar.test.ts`**: `selectionRange` für Tag, Woche (Mo–So, Beginn nie vor heute), Monat (1. bis Letzter, Beginn nie vor heute), Monatswechsel Dez → Jan, Zeitumstellung 25.10.2026; `selectionNav` je Einheit inkl. Grenzen (heute, `lastDay`, ohne `lastDay`).
3. **`src/domain/agenda.test.ts`**: `rangeAgenda` – Gruppen nur für Tage mit Terminen, beendete Termine fallen weg, `ended` nur wenn heute im Bereich, `hidden` = allIndex minus index im Bereich, `afterData`, Termin um 0:30 Berliner Zeit landet am Berliner Tag (LA-Zeitzone). Tests für `dayAgenda` werden zu `rangeAgenda` umgeschrieben.
4. **`src/domain/route.test.ts`**: `merkliste-karte`/`merkliste-kalender` hin und zurück, `tabSection` beider → `merkliste`, `ansicht=kalender` → `entdecken` mit erhaltenen Filtern, `isLegacyView`.
5. **`src/domain/filter.test.ts`** (bzw. Modul aus Plan 0023): `quickRanges` am 8.10.2026 (1.11., 1.12., 1.1.2027), am 31.1. (Folgemonat Februar), mit `dataEnd` 20.12. (nur zwei), ohne `dataEnd` (keine).
6. **`src/data/preferences.test.ts`**: `loadSavedProviders` mit kaputtem JSON, falschen Typen, ungültiger ID, Duplikat, zu langer ID → bereinigt; `saveSavedProviders([])` entfernt den Schlüssel; gespeichert werden nur `id` und `name` (Zusatzfelder fallen weg).
7. **`src/ui/format.test.ts`**: `selectionHeading`, `savedStatusParts` („5 gemerkt“, „2 von 5 gemerkt · 2 Anbieter“, Singular „1 Anbieter“), `savedMapStatusParts`, `exportNote` mit/ohne Filter, Anbieterzeile („3 kommende Angebote · nächster Mi 7.10.“, „1 kommendes Angebot …“, „Gerade keine Termine im Zwergenplan“).
8. **`src/ui/use-offer-views.test.ts`**: `savedCalendar` nur bei `merkliste-kalender` gefüllt; Startauswahl Woche von heute; kein `calendar`-Block mehr.

**E2E** (Fixtures, Uhr Mo 5.10.2026 12:00; Zahlen in Schritt 0 gegen `tests/fixtures/offers.json` nachrechnen):

9. **`e2e/saved.spec.ts`**, erweitert:
   - Anbieter merken: Detail „Offener Krabbeltreff“ → „Mehr von diesem Anbieter“ → Herz im Sheet → Toast, `aria-pressed="true"`; Merkliste zeigt Abschnitt „Gemerkte Anbieter“ mit „3 kommende Angebote · nächster Mi 7.10.“; übersteht Neuladen; URL enthält keine Anbieter-ID außer beim offenen Sheet.
   - Herz in der Anbieterzeile entfernt den Anbieter, Fokus auf der Überschrift bzw. der Statuszeile.
   - Nur ein Anbieter gemerkt (kein Angebot): kein globaler Leerzustand, Hinweis „Noch keine Angebote gemerkt“, Abschnitt sichtbar.
   - **Privatsphäre:** Mit gemerktem Anbieter Merkliste öffnen (Liste, Karte mit Kachel-Mock, Kalender): kein Request auf `anbieter.json` und kein Anbieter-Chunk; erst der Tipp auf die Zeile lädt beides genau einmal. Gezählt nach `startPreloads`.
   - Filter: PEKiP (Kurs, mit Anmeldung, erster Termin 13.10.), Musikgarten (Kurs, mit Anmeldung, erster Termin 5.11.) und Krabbeltreff (regelmäßig, ohne Anmeldung, letzter Termin 4.11.) merken.
     - „Kurse“ → 2 Karten; dazu „Ohne Anmeldung“ → 0 und Leerzustand mit „Filter zurücksetzen“; Zurücksetzen → 3.
     - Nur Zeitraum „ab nächstem Monat“ (ab 1.11.) → Musikgarten und Krabbeltreff, nicht PEKiP (Kurs-Regel: erster Termin im Oktober). Statuszeile „**2** von 3 gemerkt“.
     - Tab-Wechsel und zurück: Filter bleibt. Neuladen: Filter weg. Die URL enthält nie `format=`, `anmeldung=`, `von=` aus der Merkliste; der Startseiten-Filter bleibt unberührt (in „Entdecken“ keine Chips aktiv).
   - Export mit aktivem Filter enthält weiter alle Termine (Zahl wie ohne Filter), Zeile nennt „auch ausgeblendete“.
10. **`e2e/merkliste-kalender.spec.ts`** (ersetzt `calendar.spec.ts`), Krabbeltreff und PEKiP gemerkt:
    - Start: Woche 5.–11. Okt. gewählt (`aria-pressed` am Wochentitel), Liste „Diese Woche“ mit 1 Termin (Krabbeltreff Mi 7.10.).
    - Tipp auf Mi → „Mittwoch, 7. Oktober“, 1 Termin; erneuter Tipp → zurück zur Woche.
    - Pfeil › → Woche 12.–18. Okt. mit 2 Terminen (PEKiP Di 13., Krabbeltreff Mi 14.), gruppiert mit `h3` je Tag.
    - „Ganzen Monat zeigen“ → „Oktober 2026“, 7 Termine; Tipp auf den 20. → Tag gewählt, Raster bleibt offen; Monatstitel → wieder Monat; „Monat zuklappen“ → Woche um den Anker; der Monatsknopf behält den Fokus und seine Lage (H2).
    - Nicht gemerkte Angebote erscheinen nie (z. B. „Krabbelreime & Fingerspiele“ am Fr 9.10.).
    - Filter „Kurse“ → Woche 12.–18.: 1 Termin; leere Woche 5.–11.: „1 gemerkter Termin blendet der Filter aus“ + Zurücksetzen.
    - Leere Auswahl ohne Filter: „Für diese Woche hast du nichts gemerkt“ + „Für diese Woche entdecken“ → „Entdecken“ mit `von=`/`bis=` der Woche (ab Etappe 4).
    - Übernommen aus `calendar.spec.ts`: heute schon vorbei (B2, Elterncafé gemerkt), nach dem Datenhorizont (B8), Detail nimmt den gewählten Termin, „jetzt“ erneuert sich (Timer, `visibilitychange`, Tageswechsel).
    - Zeitraum-Chip ist im Kalender ausgeblendet, sein Wert gilt wieder in der Liste.
11. **Umschalter und Route** (`e2e/saved.spec.ts`): Liste | Karte | Kalender setzt `ansicht=merkliste`, `merkliste-karte`, `merkliste-kalender`; Deep-Link auf jede Darstellung; Tab „Merkliste“ aktiv; Fokus bleibt auf dem Segment.
12. **Merklisten-Karte** (`e2e/karte.spec.ts`, `tiles: "mock"`): Orts-Liste nur mit gemerkten Orten; Startausschnitt gleich dem von „Entdecken“ (Kamera-Regel: gleiche Kachel-Requests beim ersten Öffnen); Öffnen lädt die Wegzeit-Tabelle (Anlass), Liste und Kalender der Merkliste nicht (`e2e/startpunkt.spec.ts`).
13. **Alte URL** (`e2e/app.spec.ts`): `?ansicht=kalender&kat=musik` → URL wird `?kat=musik`, Tab „Entdecken“ aktiv, Musik-Filter aktiv; `?ansicht=kalender&anbieter=theater-beispiel` → Sheet offen über „Entdecken“.
14. **Tab-Leiste** (`e2e/layout.spec.ts`): drei Tabs (`TAB_NAMES = ["Entdecken", "Anbieter", "Merkliste"]`), Spalten, Badge, Seitenleiste quer, kompakt quer, 320–412 px, 100–200 %.
15. **Mobile-UX-Matrix** (`e2e/mobile-ux.spec.ts`), neue Zustände statt `kalender`/`kalender-woche`: `merkliste-liste` (3 gemerkt, 1 Anbieter, Filter „Kurse“ aktiv), `merkliste-karte`, `merkliste-kalender-woche`, `merkliste-kalender-monat` (Tag gewählt), `merkliste-zeitraum-sheet`, `anbieter-sheet-gemerkt`, `merkliste-nur-anbieter`. Der Test „Kalender bei 320 px, reduzierte Bewegung“ (`:455–460`) läuft im Merklisten-Kalender.
16. **Smoke** (`e2e/smoke.spec.ts:39–40`): Ansicht „Merkliste Kalender“ mit drei gemerkten echten Angeboten bei 320 px/200 %.
17. **Angepasste Bestandstests**: alle Zeilen der Tabelle in „Ausgangslage“.

## Schritte

**Schritt 0 – Vorbereitung** (vor jeder Etappe)
- `git fetch` und prüfen, ob Plan 0022 und (ab Etappe 4) Plan 0023 auf `main` sind. Namen aus Plan 0023 übernehmen (`DateRange`, Zeitraum-Funktion, Zeitraum-Komponente) und in diesem Plan per Vermerk nachtragen.
- `grep -rni "kalender" src e2e scripts docs README.md` und `grep -rn "Stickerheft\|Sticker" src e2e` als Inventar.
- Fixture-Zahlen der E2E-Fälle nachrechnen; Start-JS auf `main` messen (`pnpm size`).

**Etappe 1 – Anbieter merken** (unabhängig von 0023; einzeln mergebar)
1. Tests 1 (Teil Anbieter), 6, 7 (Anbieterzeile) rot.
2. `SavedProvider`, `toggleProvider`, `savedProviderRows` (`saved.ts`); `loadSavedProviders`/`saveSavedProviders` (`preferences.ts`); `useSavedProviders` (`use-app-state.ts`).
3. Herz im `ProviderSheet` (E2), Props durch `provider-types.ts`, `Overlays.tsx`, `App.tsx`.
4. Abschnitt „Gemerkte Anbieter“ in `SavedView` (E3), Leerzustände „nur Anbieter“, Statuszeile der Merkliste mit Anbieterzahl.
5. E2E Test 9 (Anbieter, Privatsphäre), Mobile-UX `anbieter-sheet-gemerkt`, `merkliste-nur-anbieter`.
6. Doku: Privatsphäre-Invariante, `ideas.md`, Plan 0010 Vermerk. Delta in ADR 0012.
7. `PW_PORT=4273 pnpm check`, `/arch-review` (Schema des Speichers, > 200 Zeilen wahrscheinlich), Branch, CI, Fast-Forward, `/browser-review live`.

**Etappe 2 – Umschalter und Karte auf der Merkliste**
1. Test 4 (nur `merkliste-karte`), Test 7 (`savedMapStatusParts`) rot.
2. `TABS` um `merkliste-karte` erweitern, `tabSection`; `ViewToggle` allgemein (E4), `.seg3`; vorerst zwei Segmente Liste | Karte auf der Merkliste, wenn Etappe 3 noch nicht gemerged ist, sonst gleich drei.
3. `MapPanel` in der Merkliste mit `cameraOffers = upcoming`, Wegzeit-Anlass.
4. E2E Tests 11, 12; Mobile-UX `merkliste-karte`.
5. Doku: `architecture.md` (Anlass), Plan 0005 Vermerk. Delta in ADR 0012. Gates, Review, Merge, Browser-Review.

**Etappe 3 – Merklisten-Kalender, Tab „Kalender“ entfällt**
1. Tests 2, 3, 4 (Rest), 7 (`selectionHeading`), 8 rot.
2. `CalendarSelection`, `selectionRange`, `selectionNav` (`calendar.ts`); `rangeAgenda` (`agenda.ts`), `dayAgenda` entfernen.
3. `git mv src/ui/CalendarView.tsx src/ui/SavedCalendar.tsx`, Umbau nach E5; dritte Option im Umschalter; `use-offer-views.ts` (E8).
4. Tab entfernen (`TAB_ITEMS`, `tabs.css`), `isLegacyView` + `replaceState` in `useRoute`, Kalender-Zweige in `App.tsx` entfernen.
5. E2E: Tests 10, 13, 14, 15 (Kalender-Zustände), 16; alle Bestandstests aus der Tabelle anpassen, `calendar.spec.ts` löschen.
6. `scripts/screenshots.ts`; `node scripts/font-fallback.ts` prüfen.
7. Doku: `architecture.md` (Tab-Leiste, Wegzeit-Platzhalter), Vermerke Plan 0003, 0007, 0008, 0010, 0021. Delta in ADR 0012.
8. Gates, `/arch-review`, Merge, `/browser-review live`.

**Etappe 4 – Filter auf der Merkliste** (braucht Plan 0023 auf `main`)
1. Tests 1 (`applySavedFilter`, `savedFilterCount`), 5, 7 (`savedStatusParts`, `exportNote`) rot.
2. `SavedFilter` und Funktionen (`saved.ts`), `quickRanges` (Modul aus 0023).
3. `SavedFilters.tsx`, Zeitraum-Sheet (`Overlays.tsx`, `SheetKind "saved-range"`), Schnellwahlen in der gemeinsamen Zeitraum-Komponente (auch Startseite), Zustand in `App.tsx`, Statuszeile „N von M gemerkt“, Export-Zeile (E9), Leerzustände mit „Filter zurücksetzen“, Kalender-Leerzustand „Für diese Woche entdecken“.
4. E2E Test 9 (Filter, Export), Test 10 (Filter im Kalender, „entdecken“-Knopf), Mobile-UX `merkliste-liste`, `merkliste-zeitraum-sheet`.
5. Doku: `ideas.md` („Merklisten-Filter in der URL“). Delta in ADR 0012. Gates, Review, Merge, Browser-Review.

**Etappe 5 – nur nach Nutzerentscheid N1: Angebote gemerkter Anbieter einbeziehen**
- Chip „+ von meinen Anbietern“ in der Filterzeile (nur Liste und Karte, Standard aus). An: unter den gemerkten Angeboten ein Abschnitt „Von deinen Anbietern“ mit kommenden, nicht gemerkten Angeboten gemerkter Anbieter, nach denselben Merklisten-Filtern; auf der Karte zusätzlich ihre Orte. Kalender, Export und Badge zählen sie nie. Reine Funktion `providerOffers`-artig in `saved.ts` (nicht aus `directory.ts`, das ist Lazy-Chunk-only). Tests analog zu Etappe 4.

## Offene Punkte (Nutzerentscheid)

- **N1 – Angebote gemerkter Anbieter in der Merkliste?** Der Ersatzkurs-Fall (Wunsch 10) wird am stärksten, wenn man „Kurse · mit Anmeldung · ab nächstem Monat“ auch über die Angebote seiner gemerkten Anbieter legen kann – die Kurse, die man noch nicht gemerkt hat, sind ja genau die gesuchten.
  - (a) Nein, Anbieter sind nur eine Adressliste; zum Suchen öffnet man das Anbieter-Sheet.
  - (b) **Empfehlung:** Ja, als Schalter-Chip „+ von meinen Anbietern“ in Liste und Karte, Standard aus, eigener Abschnitt „Von deinen Anbietern“; Kalender, Export und Badge bleiben bei gemerkten Angeboten (Etappe 5).
  - (c) Immer einbeziehen. Dann wäre der Kalender kein Plan mehr, sondern wieder ein Angebotskalender.
- **N2 – Karte: Orte gemerkter Anbieter zeigen?** Folgt aus N1. **Empfehlung:** nur mit eingeschaltetem Chip aus N1 (Orte ihrer kommenden Angebote), sonst nur Orte gemerkter Angebote. Ohne N1 (b) gibt es keine Anbieter-Orte auf der Karte.
- **N3 – Export nur der gefilterten Angebote?** Heute (und laut E9) gehen alle gemerkten in die ICS-Datei. Alternative: Mit aktivem Filter exportiert der Knopf nur die sichtbaren („3 in den Kalender“). **Empfehlung:** alle, wie bisher. Der Filter ist zum Suchen gedacht; ein Export, der still vom Filter abhängt, verliert Termine. Die Zeile sagt es (E9). Wer nur einen Teil will, kann im Detail einzeln exportieren.
- **N4 – Weitere Filter auf der Merkliste?** Der Wunsch nennt „vor allem“ Format und Anmeldung. Kategorie und Kosten wären mit `matchesFilter` billig, kosten aber Platz in der Chipzeile. **Empfehlung:** vorerst nein, nach zwei Wochen Nutzung fragen.
- **N5 – Falls das Budget reißt (E11): Merkliste lazy?** Nur relevant, wenn die Etappen zusammen mehr als +2,5 kB bringen. **Empfehlung:** dann zuerst die Budgetgrenze prüfen (wie bei Plan 0019: Nutzer hob auf 100 kB) und erst danach einen Lazy-Chunk mit eigenem ADR planen.
- **N6 – Wochenstart des Kalenders.** Die Woche bleibt Mo–So (Nicht-Ziel „rollende Woche“). Für „seine Woche planen“ ist am Sonntag die neue Woche oft interessanter. **Empfehlung:** so lassen; am Sonntag ist die nächste Woche einen Pfeil entfernt.

## Risiken

- **Viele E2E-Änderungen in Etappe 3** (Tabelle oben). Gegenmittel: die Tabelle als Checkliste abarbeiten, `calendar.spec.ts` erst löschen, wenn jeder Test eine Entsprechung oder eine begründete Streichung hat.
- **Plan 0023 verzögert sich.** Etappen 1–3 brauchen ihn nicht; Etappe 4 wartet.
- **Mergekonflikte mit 0022/0024** in `SavedView.tsx`, `MapScreen.tsx`, Texten. Gegenmittel: Etappe 1 erst nach 0022; 0024 berührt nur die Karte.
- **Seitenleiste quer mit drei Tabs** sieht leerer aus. Der Browser-Review prüft das (Etappe 3).

## Status

Entwurf. Nächster Schritt: `/plan-review`, danach Nutzerentscheid zu N1–N6.
