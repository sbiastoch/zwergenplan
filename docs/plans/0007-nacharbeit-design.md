# Plan 0007 – Nacharbeit zum Browser-Review von Plan 0003

Status: Pakete A, B und C umgesetzt (A+B zusammengeführt in Schritt 5, siehe „Umsetzung“; C siehe „Umsetzung Paket C“, Zusammenführen Schritt 9 offen)
Datum: 2026-10-04
Bezug: Plan 0003, Abschnitt „Browser-Review live (2026-10-04)“, Befunde B1–B8 und H1–H8. Dieser Plan ist die Voraussetzung, die Plan 0004 in „Ausgangslage und Voraussetzungen“ nennt. Plan 0006 (eigene Domain) ist schon auf `main` (`e6ea878`).

## Ziel

Die wichtigen Befunde B1, B2, B5, B6 und B7 sind behoben, die billigen Hinweise sind mitgenommen, und **für jeden Fehler gibt es ein Gate**, das rot wird, wenn er zurückkommt. Am Ende gilt:

- **B1:** Das Detail nennt bei „Montags“/„Freitags“ die Uhrzeit, wenn alle kommenden Termine dieselbe haben.
- **B2:** Die Agenda „Heute“ zeigt abends keine beendeten Termine mehr. Ist für heute alles vorbei, sagt sie das.
- **B5:** Die Kopfzeile bleibt zwischen 320 und 420 px einzeilig. Ein E2E-Test prüft das bei 320, 360, 365, 370, 384, 390, 412 und 420 px.
- **B6:** Beim Schrift-Swap mit echten Daten bleibt CLS < 0,05 bei 412 und 360 px, auch mit Roboto (Android) als Fallback. Der Perf-Test hält dafür die Webfont zurück.
- **B7:** Bei 320 px und 200 % Textgröße überlappt nichts, kein kurzes Wort bricht mitten im Wort um, kein Text ragt aus seinem Kasten oder aus einer Rundung. Bei 100 % bleiben kurze Knopf-Beschriftungen einzeilig, auch bei 320 px. Das prüft ein neues, allgemeines Gate `expectTextFits` in `e2e/mobile-ux.ts`, nicht nur ein Einzelfall-Test.
- **Dunkelmodus ohne helle Inseln:** Toast, gewählter Kalendertag, gewählte Chips und der Alters-Hinweis im Kind-Sheet leuchten nicht mehr weiß bzw. grell. Dafür gibt es ein Gate `expectNoBrightIslands`.
- **Querformat (H1):** Die Tab-Leiste verdeckt nicht mehr ein Viertel der Höhe. Bei geringer Höhe wird sie zur Seitenleiste neben der Inhaltsspalte bzw., wenn dafür die Breite fehlt, kompakt.
- B3, B4, B8, H1, H2 (teilweise), H3, H4, H5, H6, H7 und H8 sind umgesetzt. Der Rest steht begründet in `docs/ideas.md` (E17).
- Live unter https://zwergenplan.app/ mit echten Daten, `/browser-review live` beantwortet B1–B8 einzeln.

## Nicht-Ziele

- Neues Kalenderkonzept, also eine rollende Woche ab heute statt Mo–So (H2, zweiter Teil). Das kommt nach `docs/ideas.md` (E17).
- Ein eigenes Querformat-Design über die Tab-Leiste hinaus, also z. B. einen kompakteren Kopfbereich mit Stickern und Chips.
- Visuelle Regression als Gate (bleibt in `docs/ideas.md`, ADR 0004).
- `font-display: optional` oder ein Preload der Schrift (Begründung in E11).
- Schemaänderung. `data/offers.json` und `data/providers.yaml` bleiben unangetastet. Die Adresskorrektur (H6) passiert beim Denormalisieren in `toSiteData`.
- Karte und Entfernung (Pläne 0004/0005).

## Ausgangslage

- **Stand:** Dieser Plan entstand auf `2b57e47` und ist auf `main` rebased (nach Plan 0006, `e6ea878`). Zeilenangaben sind gegen diesen Stand geprüft; wo Zeilen wackeln könnten, stehen Funktions- und Selektornamen dabei. Seit Plan 0006 gilt: `BASE` ist „/“, die Live-URL ist https://zwergenplan.app/, die lokale Preview läuft unter http://localhost:4173/ (Fixtures) bzw. :4174 (echte Daten). Die Umsetzung beginnt auf dem Stand nach 0006. Pfade in diesem Plan sind ohne `/zwergenplan/` geschrieben. Route-Globs in Tests nutzen `**/assets/…`, damit sie von `BASE` unabhängig sind.
- **B1:** `src/ui/format.ts` `whenLabels` (Z. 115–139). Bei `regelmaessig` hängt nur der `weekly`-Zweig `timeRange(next)` an (Z. 132). „Freitags“ (Z. 133) und „Regelmäßig“ (Z. 130) bleiben ohne Uhrzeit, auch wenn `uniformTimes(upcoming)` gilt. `format.test.ts` Z. 139–143 schreibt diesen Fehler heute als Erwartung fest.
- **B2:** `src/ui/CalendarView.tsx` Z. 26 nimmt `index.get(day)` ungefiltert. `sessionsByDay` (`agenda.ts` Z. 94–106) indiziert alle Termine, beendete eingeschlossen. Inkonsistent ist das schon heute: Ein Angebot, dessen einziger Termin heute vorbei ist, fehlt ganz, denn `applyFilters` (`filter.ts` Z. 89) verlangt `nextSession`. Eine regelmäßige Reihe mit einem beendeten Termin von heute erscheint dagegen in der Agenda. Dasselbe gilt für Wochen-Labels (Z. 31), Formpunkte (Z. 72) und den Monatspunkt (Z. 167). Öffnet man so einen Termin, zeigt das Detail „Nur Mi 7.10.“ für einen vergangenen Termin (`referenceSession` mit `day`).
- **B5:** `src/ui/styles/chrome.css`. Die Kopfzeile `.hdr` (Z. 5–11) ist `flex-wrap: wrap`. Ausgeblendet wird der Theme-Knopf erst bei `max-width: 359px` (Z. 303–307). Die Mindestbreite der Kopfzeile steht in E6.
- **B6:** `src/ui/styles/tokens.css` Z. 10–63 enthält Fallback-Faces für Arial/Liberation, Noto und DejaVu, je „normal“ (200–549) und „fett“ (550–800). Laut Kommentar (Z. 3–9) und Commit `3c69c47` wurde `size-adjust` in Chromium als Breitenverhältnis gemessen, an Kartentiteln (23 px/800) und Fakten (14 px/600). Ein Skript dafür ist nicht eingecheckt. Roboto fehlt, lokal ist es nicht installiert (`fc-list | grep -i roboto` ist leer, `system-ui` ist hier Noto Sans).
  - Die Zeilenhöhe ist überall eine Zahl (`html { line-height: 1.4 }`, Titel 1,08). Ascent/Descent der Fallbacks ändern Zeilenhöhen also nicht. **CLS entsteht nur durch andere Zeilenumbrüche.**
  - Davon gibt es zwei Quellen: Die optische Größe (opsz) macht Bricolage klein relativ breiter, ein `size-adjust` passt deshalb nicht für 13 und 22 px zugleich. Außerdem fasst der Bucket „fett“ die Gewichte 600, 700 und 800 zusammen, Arial Bold hat aber nur 700.
  - `.facts` (`card.css` Z. 111–116) bricht um, und `.card-body` reserviert mit `padding-right: 62px` (Z. 40) über die ganze Höhe Platz für das Herz.
  - Die Perf-Tests `e2e/perf.spec.ts` und `e2e/smoke.spec.ts` (Test „LCP und CLS bleiben mit echten Daten im Budget“, Z. 54–85) messen mit derselben Drosselung zweimal denselben Code. Keiner hält die Webfont zurück, der Swap fällt also oft vor das erste Rendern der Karten.
- **B7:** 200 % werden heute so simuliert: `document.documentElement.style.fontSize = "200%"` (`mobile-ux.spec.ts` Z. 64–66, `smoke.spec.ts` Z. 36–38). Danach prüft der Test nur `expectNoHorizontalScroll` und axe. Alle Schriftgrößen im CSS sind in `rem` (`grep font-size …` findet keine px-Werte), sie skalieren also mit.
  - **Folge für das Layout:** Viewport-Media-Queries reagieren darauf nicht, auch nicht in `em`. Container-Queries mit `rem`/`em` dagegen schon, denn relative Einheiten in Container-Bedingungen werden gegen die berechneten Werte aufgelöst. Ebenso reagieren intrinsische Layouts (`flex-wrap`, `auto-fit`).
  - Die Stellen im Code: `.stk` hat eine feste Breite von 70 px (`chrome.css` Z. 150–164), `.tab` drei Spalten ohne Ausweichlayout (`tabs.css` Z. 59–74), `.two` ein starres Grid 1 : 1,3 (`dialog.css` Z. 261–265), `.week` 7 × `minmax(0,1fr)` (`calendar.css` Z. 18–22). Dazu bricht `body { overflow-wrap: anywhere }` (`base.css` Z. 18) jedes Wort an jeder Stelle, und `.catname`, `.chip`, `.pill`, `.btn`, `.monthbtn` haben `border-radius: 999px`.
- **B3:** `.day` bei 320 px: (288 − 6 × 2) / 7 = 39,4 px. Das Monatsraster hat bei 320 px (288 − 2 × 2 Rand − 2 × 4 Innenabstand) / 7 = 39,4 px je Tag. Das Gate misst Touch-Ziele bei 320 px bisher nicht (`mobile-ux.spec.ts`, Test „… bricht bei 320 px und 200 % Textgröße nicht aus“, Z. 58–69).
- **B4:** `registrationNote(offer)` (`format.ts` Z. 142–147) kennt kein „jetzt“ und sagt nach Ablauf weiter „Anmeldung bis 9.10.“.
- **B8:** Nach dem letzten Termin zeigt `CalendarView.tsx` Z. 110–114 „Freier Tag“. `lastDay` kommt aus den *gefilterten* Angeboten (`use-offer-views.ts` Z. 74).
- **H5:** `DetailDialog.tsx` Z. 158: „Alle {offer.sessions.length} Termine“. Die statische Datei enthält wirklich alle, auch vergangene (Build-Zeit ≠ Ansicht), die Etikette „Wann“ sagt aber „4 kommende Termine“.
- **H6:** 32 von 129 Orten in `data/providers.yaml` haben eine `address`, die mit dem Ortsnamen beginnt („CVJM-Haus, Kornmarkt 6, …“), einer endet mit „(Name)“. Detail (Z. 81–82) und ICS-`LOCATION` (`ics.ts` Z. 120: `${name}, ${address}`) wiederholen ihn. `build-data.ts` erzeugt die ICS aus `toSiteData` (Z. 30, 43).
- **H8:** Der Zweig `kurs` in `whenLabels` nutzt `courseProgress` nicht.
- **Nachträge des Koordinators aus dem Live-Review auf zwergenplan.app** (Screenshots `screenshots.ts`, 320/390/412/915 quer × hell/dunkel):
  1. Quer 915×412: Die Tab-Leiste (≈ 72 px plus 10 px Abstand, `.tabs` in `tabs.css` Z. 5–40, `.tab` 56 px) verdeckt ≈ ¼ der Höhe. Start, Kalender und Merkliste zeigen kaum Inhalt (H1).
  2. 320 px: Die aktive Pille „Automatisch“ stößt an den Rand (H3).
  3. 320 px **schon bei 100 %**: Knöpfe brechen zweizeilig, zwar zwischen Wörtern, aber unschön. Betroffen sind „Alle gemerkten in den / Kalender“ (`SavedView.tsx`, `.btn.wide`) und „Nur Mo / 5.10.“ bzw. „Alle 6 / Termine“ (`.two`) (B7).
  4. 320 px: Der Theme-Umschalter im Kopf fehlt. Das ist laut Plan 0003 E15 gewollt (< 360 px) und wird mit B5 neu festgelegt (E6).
  5. Dunkelmodus: Es gibt helle Inseln. Der Toast „Eingeklebt“ (H4) und der gewählte Kalendertag (`.day[aria-pressed]`, `.mday[aria-pressed]`: `background: var(--ink)`, im Dunkeln `#EEF3F8`) leuchten weiß, der Alters-Hinweis im Kind-Sheet (`.hint.ok`, fest `#A6DB5E`) grell grün. Dasselbe Muster haben gewählte Chips (`.chip[aria-pressed]`, `.chip.on`) und der gewählte Termin im Detail (`.dates li.sel`).
  6. Detail „Wann“ bei regelmäßigen ohne Uhrzeit („Montags“, B1).
- `e2e/fixtures.ts` friert die Uhr pro Test auf Mo 5.10.2026 12:00 ein (`page.clock.setFixedTime`). Ein Test darf sie vor `page.goto` neu setzen, so machen es `timezone.spec.ts` (Z. 10) und `smoke.spec.ts` (`openAtDataTime`, Z. 16). Der Fall „abends“ (B2) braucht also keine Änderung an `fixtures.ts`.
- **Uhr in Playwright** (aus `playwright-core` 1.63 gelesen): `setFixedTime` installiert die Fake-Uhr, hält `Date` fest und lässt die Timer in Echtzeit laufen. `page.clock.pauseAt(t)` hält danach auch die Timer an (`setTimeout`, `setInterval`, `requestAnimationFrame`). `runFor`/`fastForward` lösen fällige Timer aus, `setFixedTime(t2)` setzt `Date` neu. Damit sind Toast (2,8 s) und das Erneuern von „jetzt“ (E2) ohne Änderung an `fixtures.ts` deterministisch testbar.
- **„Jetzt“ in der App:** `App.tsx` Z. 35 erzeugt `now` einmal je Mount (`useMemo(() => new Date(), [])`). Ein Tab, der von 17 bis 20 Uhr offen bleibt, rechnet also weiter mit 17 Uhr (Arch-Hinweis 12 aus Plan 0003).
- Die Fixture-Daten haben am 5.10. nur „Elterncafé am Montag“ (einmalig, 9–10 Uhr; um 12 Uhr schon vorbei und deshalb nicht sichtbar). Für B2 eignet sich Mi 7.10.: „Offener Krabbeltreff“ (regelmäßig, 10:00–11:30) mit weiteren Terminen. Der letzte Fixture-Termin ist Do 10.12. (B8). PEKiP hat Anmeldeschluss 9.10. (B4) und 8 Termine ab 13.10. (H8).
- Budgets am Stand `d27ac67`: JS 81,9 / 90 kB, CSS 8,5 / 15 kB (gzip).

## Entscheidungen

### E1 – B1: Uhrzeit immer, wenn sie einheitlich ist

`whenLabels`, Zweig `regelmaessig`: Die Uhrzeit kommt an jede Hauptzeile, sobald es mindestens einen kommenden Termin gibt **und** `uniformTimes(upcomingSessions(offer, now))` gilt. Die erste Bedingung ist nötig, weil `uniformTimes([])` wahr ist; ohne kommenden Termin (Deep-Link auf ein vorbei-es Angebot) bleibt es bei „Regelmäßig“ ohne Uhrzeit. Das betrifft „Jeden Mittwoch, 10:00–11:30“ (wie bisher), „Freitags, 10:30–11:00“ und „Regelmäßig, 10:00–11:30“. Wechselt die Uhrzeit, steht keine da. Die Regel bleibt in der Domäne (`uniformTimes`), `format.ts` setzt nur zusammen. Die Kachel-Fakten (`formatFact`) bleiben kurz und ohne Uhrzeit, die steht dort schon in der Kopfzeile.

### E2 – B2 und B8: beendete Termine ausblenden, Datenhorizont benennen

**Entscheidung: beendete Termine von heute fallen aus der Agenda, sie werden nicht als „vorbei“ markiert.** Gründe:
- **Gleiche Regel überall:** „Ein Termin zählt, bis er beendet ist“ (`agenda.ts` Z. 19–20) gilt schon in Liste, Merkliste, Detail und `applyFilters`. Markieren hieße, nur einen Teil der beendeten Termine zu zeigen: Einmalige, die heute vorbei sind, sind wegen `applyFilters` gar nicht mehr in `visible`.
- **Kein Detail für Vergangenes:** Ein Tipp auf einen vergangenen Termin führte zum Detail mit „Nur Mi 7.10.“ als ICS für die Vergangenheit.
- **Laufende Termine bleiben** (Ende ≥ jetzt), wie überall.

Domäne, `src/domain/agenda.ts`:
```ts
export interface DayAgenda<T extends Offer> {
  /** nicht beendete Termine des Tages, nach Beginn */
  items: Occurrence<T>[];
  /** wie viele passende Termine dieses Tages schon beendet sind (nur heute > 0) */
  ended: number;
  /** Tag liegt nach dem letzten Termin des gesamten Datenstands */
  afterData: boolean;
}
export function dayAgenda<T extends Offer>(
  index: ReadonlyMap<string, Occurrence<T>[]>, day: string, now: Date,
  context: { dataEnd: string | undefined; endedToday: number },
): DayAgenda<T>;

/** Termine, die am Berliner Tag `day` beginnen und vor `now` beendet sind. */
export function endedOnDay(offers: readonly Offer[], day: string, now: Date): number;
```
- `items` filtert mit demselben Prädikat `notEnded(now)` wie `upcomingSessions`.
- `ended` ist `endedToday`, wenn `day` der Berliner Tag von `now` ist, sonst 0 (vergangene Tage sind gesperrt, künftige haben nichts Beendetes).
- `afterData` ist `dataEnd !== undefined && day > dataEnd`.
- `sessionsByDay` bleibt unverändert, der Index wird weiter einmal je Filterstand berechnet.

**Woher `endedToday` kommt:** Der Index enthält nur Angebote aus `applyFilters`, und das verlangt einen kommenden Termin (`nextSession`). Ein Einzeltermin, der heute schon vorbei ist, steht also gar nicht drin, und „Für heute ist alles vorbei“ käme für ihn nie. Deshalb zählt `endedToday` aus allen Angeboten, die zu den **Filtern** passen, **ohne** die Bedingung „kommender Termin“:
- `filter.ts` bekommt `matchesFilter(offer, state)` (Kategorie, Format, Anmeldung, Kosten). `applyFilters` wird zu `nextSession(o, now) && matchesFilter(o, state)`, das Verhalten bleibt gleich.
- `useOfferViews` berechnet `calendar.endedToday = endedOnDay(offers.filter((o) => matchesFilter(o, route.filter)), today, now)` (memo auf Angebote, Filter, `now`).
- Die Altersregel wirkt hier nicht. `endedToday` entscheidet nur, welcher Leerzustand-Text erscheint. Im schlimmsten Fall heißt es „alles vorbei“ für ein unpassendes Angebot; die Altersregel für vergangene Termine nachzubauen, lohnt dafür nicht.
- An den Fixtures geprüft: Am Mo 5.10. gibt es genau einen Termin, „Elterncafé am Montag“ (einmalig, 9–10 Uhr). Um 12:00 ist der Tag in der Agenda also leer, `endedToday` ist 1, und es erscheint „Für heute ist alles vorbei“ statt „Freier Tag“. Das ist der Startzustand jedes Kalender-Tests mit Fixture-Uhr, der Leerzustand läuft also durch die Mobile-Gates der Ansicht `kalender` (hell, dunkel, 320 px, 200 %).

UI, `CalendarView.tsx`: Agenda, Überschrift „N Angebote“, `aria-label` der Tage (Z. 31), Formpunkte (Z. 72) und Monatspunkt (Z. 167) nutzen `dayAgenda(…).items`. Kosten: 7 + 31 Filter über kurze Arrays je Render, das ist vernachlässigbar. Für die Leerzustände gilt in dieser Reihenfolge:
1. `items.length > 0`: Karten.
2. `ended > 0` (nur heute): „**Für heute ist alles vorbei**“ / „Die Termine von heute sind schon zu Ende. Die nächsten Tage stehen oben in der Woche.“ (Symbol `swing`).
3. `afterData` (B8): „**Weiter reicht der Plan noch nicht**“ / „Termine sind bis {longDate(dataEnd)} eingetragen. Neue kommen mit dem nächsten Datenstand.“
4. sonst wie bisher „Freier Tag“.

**B8, Datenhorizont:** Gemeint ist der letzte Termin des *ganzen* Datenstands, nicht der gefilterten Angebote. Mit Filter ist ein leerer Tag nach dem letzten passenden Termin ein echter freier Tag. `useOfferViews` liefert dafür zusätzlich `calendar.dataEnd = lastSessionDay(upcoming)`. `upcoming` gibt es schon (Z. 66), das sind alle nicht vorbei-en Angebote ohne Filter. `App.tsx` reicht `dataEnd` an `CalendarView` durch. `site.json` bleibt unverändert, der `horizon` aus `offers.json` wird nicht ausgeliefert.

**„Jetzt“ erneuern (B2 ohne Neuladen):** Damit die Agenda auch in einem offenen Tab abends richtig ist, erneuert die App „jetzt“ selbst:
- Neuer Hook `useNow()` in `src/ui/use-app-state.ts`, er ersetzt `useMemo(() => new Date(), [])` in `App.tsx`.
  - Zustand `now`. Eine Prüfung liest `new Date()` und setzt den Zustand **nur, wenn sich die Minute geändert hat**: `sameMinute(a, b)` aus `src/domain/time.ts` (neu, Paket A, mit Unit-Test) vergleicht `Math.floor(ms / 60 000)`. Berliner Offsets sind ganze Stunden, die Minute ist also überall dieselbe. So gibt es höchstens einen Render pro Minute, und solange die Minute gleich ist, bleibt das `Date`-Objekt gleich und alle `useMemo` in `useOfferViews` bleiben gültig.
  - Die Prüfung läuft alle 30 s (`setInterval`) und bei `visibilitychange`, wenn die Seite sichtbar wird (Handy aus der Tasche). Aufräumen im Effekt-Cleanup.
- **Keine unnötige Bewegung:** Die Kacheln merken sich beim Mounten, ob sie animieren (`useState(ctx.animate)` in `OfferCard`). Ein Minuten-Render animiert bestehende Kacheln also nicht. Nur eine Kachel, die wirklich die Tagesgruppe wechselt (ihr Termin ist gerade zu Ende gegangen), wird neu eingehängt; das ist eine echte Änderung.
- **Tageswechsel:** `useOfferViews` gibt `calendar.day` als `clampDay(calendarDay, today)` zurück. Nach Mitternacht steht der Kalender also nicht auf einem gesperrten Vortag.
- **Vitals:** Unter der Fixture-Uhr (`setFixedTime`) und im Smoke-Test steht `Date` fest, die Minute wechselt nie, es gibt also keinen zusätzlichen Render. Ohne Fixture fällt der erste mögliche Render ≥ 30 s nach dem Laden, also weit nach LCP und dem Messfenster für CLS.

### E3 – B4: Anmeldefrist mit „jetzt“

Neues Domänenmodul `src/domain/registration.ts`:
```ts
export type RegistrationPhase = "bald" | "offen" | "vorbei";
/** undefined = kein Fenster bekannt. Grenzen: opens ≤ now ist offen, now > deadline ist vorbei. */
export function registrationPhase(window: Offer["registrationWindow"], now: Date): RegistrationPhase | undefined;
```
`registrationNote(offer, now)` in `format.ts`:

| Fall | Text |
|---|---|
| vorbei | „Anmeldeschluss war am 9.10.“ |
| bald | „Anmeldung ab 15.10., bis 31.10.“ (wie bisher) |
| offen mit `deadline` | „Anmeldung bis 9.10.“ |
| offen ohne `deadline` | „Anmeldung ab 1.10.“ (wie bisher) |
| ohne Fenster | „Beim Anbieter“ bzw. „Einfach vorbeikommen“ (wie bisher) |

Die Kachel bekommt keinen neuen Chip, das Detail reicht. Eine eigene Datei statt `agenda.ts`, weil es nicht um Termine geht. Das ist ein neues Modul, also Pflicht für `/arch-review` (Schritt 6).

### E4 – H5, H6, H8: Texte im Detail

- **H5:** Der ICS-Knopf einer regelmäßigen Reihe heißt „**Alle Termine**“, ohne Zahl. Der Toast nennt weiter die echte Zahl in der Datei („Kalenderdatei mit 5 Terminen geladen“). Jede Zahl auf dem Knopf wäre falsch: Die statische Datei enthält auch vergangene Termine, „kommende“ ändert sich nach dem Build. Der kürzere Knopf hilft außerdem bei B7.
- **Kurze Knopf-Beschriftungen (B7 bei 100 %, Nachtrag 3):** Die Beschriftung passt bei 320 px einzeilig, ohne dass die Information verloren geht. Die Überschrift „In den Kalender holen (.ics)“ bzw. die Zusammenfassung darunter sagen schon, worum es geht.
  - Kurs: „Alle 8 Kurstermine in den Kalender“ wird „**Alle 8 Kurstermine**“. Kurse bleiben immer komplett (ADR 0007).
  - Merkliste: „Alle gemerkten in den Kalender“ wird „**Alle in den Kalender**“ (`SavedView.tsx`). Diese Änderung macht Paket B, weil sein Gate sonst rot bliebe (E10, E16).
- **H6:** In `src/domain/site-data.ts` schneidet `venueAddress(name, address)` in `toSiteData` den Ortsnamen ab, und zwar:
  - als Präfix `„<name>, “` (ohne Groß-/Kleinschreibung, getrimmt);
  - als Suffix `„ (<name>)“`.
  - Ist das Ergebnis kürzer als 5 Zeichen (Schema-Minimum), bleibt die Adresse unverändert.
  - Teilübereinstimmungen werden nicht angefasst („Gemeindehaus Eibach, Kleiner Saal“ ≠ Präfix „Gemeindehaus Eibach,“).

  Weil `build-data.ts` die ICS aus `toSiteData` erzeugt, korrigiert das Detail und `LOCATION` an einer Stelle. Die UIDs bleiben gleich (sie hängen nicht an der Adresse). Ob ein erneuter Import den Ort im Kalender korrigiert, ist aber offen: `DTSTAMP` kommt aus `generatedAt`, und es gibt kein `SEQUENCE`. Viele Kalender (Google, Apple) übernehmen eine Änderung bei gleicher UID ohne höhere `SEQUENCE` nicht. Schon importierte Termine behalten dann die doppelte Ortsangabe, neue bekommen die korrigierte. Das ist hinnehmbar, `SEQUENCE` einzuführen wäre ein eigenes Thema (ADR 0003). Der Browser-Review prüft an einem Termin, was Google bzw. Apple Kalender beim erneuten Import tun. Die Rohdaten bleiben unverändert: Weder `data/offers.json` noch die 32 Adressen in `data/providers.yaml` werden in diesem Plan bereinigt. Datenpflege läuft über den Skill `babyevents-nuernberg` und einen Pipeline-Lauf (ADR 0006). Dafür entsteht ein Eintrag in `docs/ideas.md` (E17).
- **H8:** Die Hauptzeile im Detail folgt `courseProgress(offer, now)`:
  - nicht begonnen (`remaining === total`): „Kurs mit 8 Terminen“ (wie bisher);
  - läuft (`0 < remaining < total`): „**Kurs · noch 6 von 8 Terminen**“, wie die Kachel;
  - vorbei (`remaining === 0`, nur per Deep-Link erreichbar): „**Kurs mit 8 Terminen – vorbei**“, nie „noch 0 von 8“.

  Die Zeile darunter bleibt („Di 13.10. bis Di 1.12., jeweils 9:30–11:00“). `formatFact` braucht den Fall nicht, Kacheln zeigen nur Angebote mit kommendem Termin.

### E5 – H2: doppelte Wochenleiste

- **Umsetzen:** Bei offenem Monatsraster blendet `CalendarView` die Wochenleiste samt Wochen-Navigation aus. Das Raster zeigt denselben Zeitraum und hat eigene Pfeile, die Agenda bleibt darunter.
- **Kein Springen des Knopfs:** Wochen-Navigation und Wochenleiste sind zusammen ≈ 130 px hoch (44 + 12 + 72). Ohne Gegenmaßnahme rutscht „Ganzen Monat zeigen“ beim Öffnen um diese Höhe nach oben, unter dem Finger weg. Deshalb:
  - Der Knopf bleibt dasselbe DOM-Element: Die Woche wird als `{!monthOpen && …}` *vor* ihm ausgeblendet, er selbst wird nicht neu gemountet. So bleibt der Fokus auf ihm (Tastatur, Screenreader).
  - Scroll-Ausgleich: Der Klick merkt sich `button.getBoundingClientRect().top`. Ein `useLayoutEffect` auf `monthOpen` misst danach erneut und ruft `window.scrollBy(0, nachher − vorher)` auf, vor dem Zeichnen. Der Knopf bleibt so an derselben Bildschirmstelle, soweit die Seite scrollen kann.
  - Steht die Seite zu weit oben, um auszugleichen (`scrollY` < 130), folgt `button.scrollIntoView({ block: "nearest" })`. Der Knopf rückt dann sichtbar nach oben, bleibt aber im Bild.
  - Beides ist reine Darstellung und liegt in `CalendarView.tsx`, nicht in der Domäne. Der Browser-Review prüft es (Schritt 8).
- **Verschieben:** „Am Sonntag sind 6 von 7 Tagen gesperrt“ ändert das Kalenderkonzept (rollende 7 Tage ab heute statt Mo–So, `calendarNav`, E14 aus Plan 0003). Das gehört in einen eigenen Plan (E17).

### E6 – B5: Kopfzeile, Mindestbreite und Schwelle

**Mindestbreite aus dem Code** (100 % Textgröße, CSS-px):

| Teil | Breite | Quelle |
|---|---|---|
| Innenabstand | 2 × 16 | `chrome.css` Z. 10 |
| Logo + Abstand | 34 + 8 | `icons.tsx` Z. 73, `chrome.css` Z. 17 |
| „Zwergenplan“ | W = c · fs, fs = 5,6 vw + 1,6 px (20–27 px) | Z. 21 |
| zwei Abstände | 2 × 8 | Z. 9 |
| Kind-Chip | 2 × 2 Rand + 5 + 30 + 6 + 14 + K | Z. 74–97 |
| Theme-Knopf | 44 | Z. 55–58 |

Summe R = 193 + W + K. Geeicht am Review-Befund (Umbruch bis 370 px mit „Alter?“, K ≈ 55 px) ergibt sich c ≈ 5,5. Damit gilt R(vw) ≈ 201,8 + 0,308 · vw + K.
- Mit K ≈ 62 px („23 Mon.“, das längste Label) passt alles erst ab **≈ 381 px**.
- Ohne Theme-Knopf (R − 52) passt es ab 306 px, also überall ab 320 px.
- K, c und die Schwelle sind abgeleitet, nicht gemessen. Paket B misst sie als ersten Schritt (Schritt 3.1).

**Layout:**
- Etwas Luft schaffen: `.kid` Innenabstand rechts 14 → 10 px, `.brand` `gap` 8 → 6 px. Das spart 6 px, also R(vw) ≈ 195,8 + 0,308 · vw + K, mit „23 Mon.“ passend ab ≈ 372 px.
- Der Theme-Knopf entfällt per **Container-Query** statt Media-Query:
  ```css
  .hdr { container: kopf / inline-size; }
  @container kopf (width < 21.75rem) { .iconbtn { display: none; } }
  ```
  - Der Inhalt von `.hdr` ist vw − 32 px, 21,75 rem = 348 px entspricht also einem **Viewport von 380 px**. Bei 380 px bleiben ca. 8 px Reserve.
  - Weil die Schwelle in `rem` steht, verschwindet der Knopf bei 200 % Text auf allen Telefonen. Die Kopfzeile darf bei 200 % in eine zweite Zeile umbrechen, das ist dafür vorgesehen.
  - Die Container-Query sitzt auf `.hdr` selbst, nicht auf `.app`. Grund: `container-type` erzeugt Layout-Containment, und `.app` enthält die `position: fixed`-Tab-Leiste und den Toast. Die würden sich sonst an `.app` statt am Viewport ausrichten.
- Ergebnis: Ab 380 px stehen drei Elemente in einer Zeile (390/393/402/412/414/430: iPhone 15, Pixel 7 …). Darunter (360/375/320) sind es zwei, die Darstellung bleibt im Kind-Sheet. Das bestätigt Plan 0003 E15 („unter 360 px entfällt der Knopf“, Nachtrag 4) und hebt die Schwelle von 360 auf 380 px. Einen Knopf, der bei 320–379 px die Kopfzeile umbrechen lässt, gibt es nicht. Wer die Darstellung dort ändern will, findet sie im Kind-Sheet, einen Tipp entfernt. Ergibt die Messung in Schritt 3.1 mit „23 Mon.“ mehr als 372 px, wird weiter gestrafft (Logo 34 → 30 px), nicht die Schwelle über 390 px gehoben.

**Test** (`e2e/layout.spec.ts`, neu, jeweils mit `setViewportSize`). Er läuft nur in den Projekten `pixel-7` (Chromium) und `iphone-15` (WebKit). Das steht ausdrücklich im Test: `test.skip(!["pixel-7", "iphone-15"].includes(testInfo.project.name), "Layout-Matrix je Engine einmal")`. Sonst liefe die Matrix in allen fünf Projekten, und `desktop`/`android-klein` brächten nichts Neues.
- Breiten 320, 360, 365, 370, 384, 390, 412 und 420 px, je mit Kind-Label „Alter?“ und „23 Mon.“ (Geburtsdatum 01.11.2024, über das Kind-Sheet gesetzt).
- Zwei Schriftzustände: Webfont geladen, und Webfont blockiert (`page.route("**/assets/*.woff2", r => r.abort())`, also dauerhaft die Fallback-Schrift der Maschine). Der Test braucht dafür keinen Helfer aus Paket C.
- Gemessen wird nur mit `offsetTop`/`offsetHeight`, nie mit `getBoundingClientRect`: Der Kind-Chip ist um 1,5° gedreht, die Tab-Leiste um −0,6°, und gedrehte Boxen sind im Bounding-Rect höher.
- Erwartungen:
  - alle sichtbaren Kinder von `.hdr` haben dieselbe Zeile (|Δ (`offsetTop` + `offsetHeight`/2)| < 2 px);
  - `.brand` ist einzeilig (`offsetHeight` < 1,5 × Zeilenhöhe);
  - `.hdr.offsetHeight` ≤ 66 px (heute 64);
  - der Theme-Knopf ist ab 384 px sichtbar und bei ≤ 370 px ausgeblendet.

### E7 – Wie 200 % simuliert werden und was daraus folgt

Die Simulation bleibt: Die Wurzel-Schriftgröße wird auf 200 % gesetzt, danach folgen `settle()` und zwei `requestAnimationFrame`. Das entspricht einer Browser-Einstellung für die Schriftgröße. Für das Layout gilt deshalb verbindlich (neu in `docs/architecture.md`, Mobile-UX-Gates):
- Umschaltungen für große Schrift laufen über **intrinsische Layouts** (`flex-wrap`, `grid auto-fit` mit `rem`-Mindestbreiten) oder **Container-Queries in `rem`**, nie über Viewport-Media-Queries.
- Kurze Wörter in Bedienelementen dürfen nicht mitten im Wort brechen. `overflow-wrap: anywhere` bleibt nur der Notausgang für lange Komposita und URLs.

Die Seitenzoom-Variante (Chrome Android „Seitenzoom“, also ein 206-px-Viewport bei 16 px) ist eine andere Situation und steht als Idee in `docs/ideas.md` (E17).

### E8 – B7: Korrekturen je Stelle

| Stelle | Ursache | Korrektur |
|---|---|---|
| Sticker-Beschriftungen überlappen | `.stk { width: 70px }` (`chrome.css` Z. 152) | `width: auto; min-width: 70px; padding-inline: 4px; white-space: nowrap`. Die Leiste scrollt ohnehin horizontal. |
| Tab-Leiste bricht im Wort | 3 Spalten à (W − 20)/3 px, Label bis 26 px Schrift | Label in `<span className="tab-label">` (`Chrome.tsx` `TabBar`). Jeder `.tab` wird selbst Container (`container-type: inline-size`, die Breite kommt aus der Grid-Spur), `@container (width < 4.6rem) { .tab-label { /* sr-only */ } }`: Ist die *eigene Spalte* schmaler als das längste Label (≈ 4,4 rem bei 0,8125 rem/800), zeigt der Tab nur das Icon. Der Name bleibt im DOM („Kalender“ in E2E unverändert). Unten bei 320 px/100 % ist die Spalte ≈ 95 px ≥ 73,6 px, die Labels bleiben also; bei 200 % sind es 147 px > 95 px, dann nur Icons. Das funktioniert auch in der Seitenleiste (E14), weil die Spaltenbreite zählt, nicht die Leistenbreite. Der Badge ist `absolute` in `.tab`, der ohnehin `position: relative` ist, Containment ändert also nichts. |
| ICS-Knöpfe brechen im Wort (200 %) bzw. zweizeilig (320 px/100 %, Nachtrag 3) | `.two` Grid 1 : 1,3 (`dialog.css` Z. 261–265) | `display: flex; flex-wrap: wrap`; `.two .btn { flex: 1 1 auto; white-space: nowrap }`, `.two .btn.primary { flex-grow: 1.3 }`. Passen beide nicht nebeneinander, stehen sie untereinander, jeder einzeilig. Bei 320 px: „Nur Mo 5.10.“ ≈ 139 px + 10 + „Alle Termine“ mit Icon ≈ 164 px > 288 px, also untereinander. Ab 360 px nebeneinander. H5 kürzt das Label. |
| Knöpfe mit Icon über die ganze Breite zweizeilig (Nachtrag 3) | „Alle gemerkten in den Kalender“ ≈ 258 px Text bei 224 px Platz (288 − 2 × 16 Padding − 4 Rand − 20 Icon − 8 Abstand) | Kürzere Beschriftungen (E4, Paket A). Das Gate (E10, Prüfung 5) hält das fest. |
| Tageszahlen senkrecht | 7 × `minmax(0,1fr)`, `.num` 1,3125 rem | `.week { grid-template-columns: repeat(auto-fit, minmax(max(44px, 2.5rem), 1fr)) }`: bei 100 % 7 Spalten, bei 200 % Umbruch in Zeilen (z. B. 3/3/1). `.day .wd, .day .num { white-space: nowrap }`. Mit B3 (E9). |
| Monatsraster (vorsorglich) | gleich | `.mday { white-space: nowrap; font-variant-numeric: tabular-nums; letter-spacing: -0.03em }`. Meldet das Gate „30“ als gebrochen, bekommt `.month` bei schmalem Container dieselbe Ausdehnung wie die Woche (E9). Das Monatsraster bleibt 7-spaltig (Kalender-Semantik). |
| Filter-Chips abgeschnitten | Mehrzeiliger Text in `border-radius: 999px` (`.wrap .chip`, Z. 257–260), die Rundung schneidet die Zeilenenden ab | `.chip { border-radius: 22px }`: einzeilig weiter eine Pille (Mindesthöhe 44), mehrzeilig ein abgerundetes Rechteck. Die Schnellfilter-Leiste (`nowrap`, scrollt) prüft das Gate mit. |
| Kategorie-Pille im Detail oval | `.catname` inline-block mit 999 px, bricht in 2 Zeilen | `border-radius: calc(0.7em + 4.5px)` (halbe einzeilige Höhe: 0,7 em halbe Zeile + 3 px Padding + 1,5 px Rand). `.hero { flex-wrap: wrap }`, Textblock `flex: 1 1 10rem; min-width: 0`: Bei großer Schrift rutscht er unter den Sticker. |
| Kachel-Pille (vorsorglich) | `.pill` 999 px | `border-radius: calc(0.7em + 3.5px)`, gleiche Regel. |
| Gewählter Monatstag bei großer Schrift oval | `.mday { border-radius: 50% }` (`calendar.css` Z. 134) | `border-radius: 22px` (E10, Prüfung 3). |
| Mehrzeilige Knöpfe | `.btn`, `.monthbtn` 999 px | `.btn { border-radius: 26px }`, `.monthbtn { border-radius: 22px }` (halbe Mindesthöhe). |
| Titel brechen an beliebiger Stelle | `overflow-wrap: anywhere` (`base.css` Z. 18) ohne Silbentrennung | `hyphens: auto` auf `.ptitle`, `.dtitle`, `.ctitle`, `.sheet h2`, `.empty b` (E10, Prüfung 1). |
| Fuß im Filter-Sheet | `.sheetfoot` Grid `auto 1fr` (`sheet.css` Z. 147–152), „Zurücksetzen“ lässt dem zweiten Knopf bei 200 % ~12 px | `display: flex; flex-wrap: wrap; gap: 10px`; erster Knopf `flex: 0 1 auto`, zweiter `flex: 1 1 7rem`. Bei 100 % und 320 px bleibt es eine Zeile (156 + 10 + 112 ≤ 288), bei 200 % werden es zwei. |
| Darstellungs-Segment (auch H3) | 3 × 92 px bei 320 px, „Automatisch“ fett ≈ 87 px | `.sheet-body { container: sheet / inline-size }` (der Toast ist Geschwister, nicht Kind, siehe `Dialog.tsx`). `@container sheet (width < 19.5rem)`: `.seg3` einspaltig mit `border-radius: 22px` (statt 999 px, sonst schneidet die Rundung die oberste und unterste Zeile), `.seg-thumb` aus, der gewählte Knopf bekommt selbst Fläche, Rand, Schatten und `border-radius: 18px`. Bei 100 % greift das unter 312 px Inhalt, also bei 320 px (H3), bei 200 % auf allen Telefonen. |
| Etiketten im Detail | 2 Spalten fest (`dialog.css` Z. 116–121) | `grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr))`, `.label.full` bleibt `1 / -1`. Bei 320 px/100 % 2 Spalten (2 × 128 + 10 ≤ 283), bei 200 % eine. |
| Zähler-Badge | `height: 22px` fix (`chrome.css` Z. 287–299) | `height: auto; min-height: 22px; padding-block: 1px`. |

Alle Korrekturen sind CSS, bis auf das `tab-label`-Span in `Chrome.tsx`. Weitere Stellen findet das Gate (E10). Was es meldet, wird nach demselben Muster behoben, nicht ausgenommen.

> **Umgesetzt mit Abweichungen** (siehe „Umsetzung“): `.two` ohne `nowrap`, Sheet-Fuß als Flex-Zeile mit `flex: 1 1 auto`, zusätzlich `.wrap .chip` schrumpfbar, Kachel-Pille per Container-Query `card`, Wochen-Navigation per Container-Query, Knopffarbe `var(--ink)`.

### E9 – B3: Kalendertage bei 320 px ≥ 44 px

Eine Media-Query in px ist hier richtig, denn es geht um Pixel, nicht um Text. Bei 200 % greift für die Woche ohnehin `auto-fit` (E8). Beide Raster werden unter 360 px breiter, gerechnet für 320 px (Inhalt der Spalte 288 px, `.body` hat 16 px Rand):

```css
@media (max-width: 359px) {
  .week { margin-inline: -12px; gap: 0; }                 /* 312 / 7 = 44,6 px je Tag */
  .month { margin-inline: -16px; padding-inline: 0; }      /* (320 − 2 × 2 Rand) / 7 = 45,1 px je Tag */
}
```

- **Woche:** 288 + 2 × 12 = 312 px, ohne Abstand 312 / 7 = 44,57 px. Die gestrichelten Ränder stoßen aneinander, das ist optisch vertretbar. (Mit −16 px wären es 45,7 px, aber dann klebt der Rand am Bildschirmrand.)
- **Monat:** `.month` hat heute 2 px Rand und 4 px Innenabstand, also (288 − 4 − 8) / 7 = 39,4 px. Mit −16 px Außenrand und 0 Innenabstand an den Seiten sind es (320 − 4) / 7 = 45,1 px. `.mday` hat keinen eigenen Rand und `min-width: 0`, die Spur ist also die Knopfbreite. Rundung und Schatten von `.month` laufen dann über den Bildschirmrand, das ist bei 320 px hinnehmbar. Ein Schatten erzeugt keinen Scroll-Überlauf, `expectNoHorizontalScroll` bleibt grün.
- Die Ansicht `kalender` in `mobile-ux.spec.ts` öffnet den Monat. Das Touch-Gate, das künftig auch bei 320 px/100 % läuft (Tests), misst also beide Raster.

### E10 – Gate `expectTextFits` (B7, allgemein)

Neu in `e2e/mobile-ux.ts`, exportiert und in `expectMobileUx` aufgerufen, gilt also bei 100 % in jedem Gate-Lauf. Zusätzlich direkt nach dem Umschalten auf 200 %. Ein `page.evaluate`, fünf Prüfungen. **Für alle fünf gilt:** Visuell versteckte Elemente werden übersprungen, also alles mit einem Vorfahren (oder sich selbst) ≤ 1 px breit oder hoch bzw. mit `clip`/`clip-path` auf null, wie `.sr-only`. Sonst wären die versteckten Legenden „Kategorien“, „Schnellfilter“ (`Chrome.tsx` Z. 46, 110) und „Woche“ (`CalendarView.tsx` Z. 57) für Prüfung 2 rot, denn ihr Text ragt aus dem 1-px-Kasten. Jede Meldung nennt Element (Tag + erste Klasse) und Text, damit der Fehler ohne Debugging behebbar ist.

1. **Kein Bruch mitten in kurzen Wörtern.**
   - Ein `TreeWalker` geht über alle Textknoten unter `body`, offene `<dialog>`s eingeschlossen.
   - Wörter sind Folgen ohne Leerraum und ohne `-`, `‐`, `–`, `/`. An diesen Zeichen ist ein Umbruch legitim („Eltern-Kind-Turnen“, „10:00–11:30“).
   - Ein Wort ist gebrochen, wenn die Rects seiner `Range` (`getClientRects()`) auf mehr als einer Zeile liegen (verschiedene `top`, Toleranz 2 px).
   - Seine **ungebrochene Breite** ist die Summe der Rect-Breiten der Bruchstücke. Das ist genau die Breite, die es in einer Zeile hätte, in derselben Schrift, Größe und Laufweite.
   - Die **Referenzbreite** ist die Breite einer Textzeile in der Seitenspalte: `min(innerWidth, 640) − 32` px (40-rem-Spalte bei 16 px Grundschrift, 16 px Rand je Seite). Bei 320 px sind das 288 px.
   - Verstoß: Das Wort ist gebrochen **und** seine ungebrochene Breite ist ≤ 70 % der Referenzbreite (bei 320 px also ≤ 201,6 px). So ein Wort hätte in eine eigene Zeile gepasst. Ist es trotzdem gebrochen, war sein Kasten zu schmal (Tab, Knopf, Tageszelle), und das ist ein Layoutfehler.
   - **Warum die Spalte und nicht der eigene Container:** Genau die zu schmalen Container sind der Fehler. Bei 200 % ist „Entdecken“ ≈ 130 px breit, die Tab-Spalte bei 320 px ≈ 95 px. Gegen den eigenen Container gemessen (130 > 0,7 × 95) wäre das erlaubt, gegen die Spalte (130 ≤ 201,6) ist es ein Verstoß.
   - **Warum 70 %:** Titel sind groß. „Stickerheft“ (`.ptitle`, 2 rem/800), „Krabbeltreff“, „Fingerspiele“, „Babymassage“ (`.ctitle` 1,375 rem, `.dtitle` 1,875 rem) sind bei 200 % ≈ 280–340 px breit, also breiter als die 288-px-Spalte. Sie *müssen* brechen und sind über 70 % (keine Meldung). Bei 100 % sind dieselben Wörter ≈ 140–170 px breit; brächen sie dort, wäre das ein echter Fehler (Meldung). Eine Zeichengrenze (früher „≤ 12 Zeichen“) hätte genau diese Titel bei 200 % fälschlich rot gemacht.
   - Damit Titel sauber brechen statt an beliebiger Stelle, bekommen `.ptitle`, `.dtitle`, `.ctitle`, `.sheet h2` und `.empty b` `hyphens: auto` (`<html lang="de">` ist gesetzt, Paket B). Das ändert Plan 0003 E5 („`hyphens` nur für `.summary`“): Dort ging es um unnötige Trennungen wie „Nürn-berg“ in Titeln, die bei 100 % noch passen würden. `hyphens: auto` trennt nur, wenn ein Wort nicht in die Zeile passt, und dann ist „Sticker-heft“ besser als „Stickerhef-t“ durch `overflow-wrap: anywhere`.
   - Ausgenommen sind Elemente mit berechnetem `hyphens: auto` (die Trennung kommt dann aus dem Wörterbuch, `.summary` und die Titel) (versteckte Elemente siehe oben, gilt für alle Prüfungen).
   - Das trifft die Befunde: „Entdecken“ (Tab), „Termine“ (ICS-Knopf), „12“ (Tageszahl), „Automatisch“ (Segment).
2. **Text ragt nicht heraus und wird nicht abgeschnitten.**
   - Für jede Textzeile (Rects der Textknoten) werden die Vorfahren nach oben verglichen. Horizontal darf die Zeile über keinen Padding-Rand eines Vorfahren um mehr als 1,5 px hinausgehen. Vertikal gilt das nur bei Vorfahren, die abschneiden (`overflow` `hidden`/`clip`). Ascent/Descent ragen bei Zeilenhöhe 1,08 legitim aus dem Zeilenkasten.
   - Der Weg nach oben endet am ersten Scroll-Container (`overflow-x` `auto`/`scroll`, z. B. `.chips`: Text außerhalb des sichtbaren Bereichs ist dort Absicht) und nach dem ersten `position: fixed/absolute`-Vorfahren (dessen Bezug ist nicht der DOM-Vorfahr).
   - Das trifft die Sticker-Labels (Text breiter als `.stk`) und abgeschnittene Inhalte.
3. **Text bleibt innerhalb der Rundung.**
   - Geprüft wird der nächste Vorfahr, dessen Rundung **sichtbar** ist: `border-radius` > 0 **und** eine deckende Hintergrundfarbe (Alpha > 0), ein `background-image` oder ein sichtbarer Rand (`border-*-width` > 0 und Stil ≠ `none`). Ein unsichtbarer Kasten mit Rundung (z. B. `.mday` ohne Auswahl, Hintergrund `none`) schneidet optisch nichts ab.
   - Die Radien werden **je Ecke** gelesen (`border-top-left-radius` …, jeweils horizontal und vertikal), `%`-Werte gegen Breite bzw. Höhe der Box aufgelöst und nach CSS-Regel skaliert, wenn die Summe zweier Radien einer Seite die Seitenlänge übersteigt.
   - Für jede Ecke jeder Textzeile, die im Eckbereich der Box liegt, gilt: Der Punkt liegt in der Ellipse mit den Halbachsen (rx, ry) um den Bogenmittelpunkt, Toleranz 1 px.
   - Das trifft die ovale Kategorie-Pille und mehrzeilige Chips, nicht aber breite zweizeilige Knöpfe, deren Text die Ecken nicht berührt. So gibt es keinen pauschalen „Pillen müssen einzeilig sein“-Alarm.
   - Der gewählte Monatstag `.mday[aria-pressed="true"]` hat heute `border-radius: 50%`. Bei 200 % ist er höher als breit (Zahl + Formpunkt), aus dem Kreis wird eine schmale Ellipse, und die Zahl stößt an. Deshalb `.mday { border-radius: 22px }` statt 50 %: bei 100 % (45 × 44 px) praktisch ein Kreis, bei großer Schrift ein abgerundetes Rechteck (E8).
4. **Geschwister in Leisten überlappen nicht.**
   - Für die Leisten in `BARS` (`.hdr, .stickers, .chips, .tabs, .week, .mgrid, .cal-nav, .card-top, .facts, .two, .sheetfoot, .seg, .labels, .hero`) werden die Layout-Boxen der sichtbaren, nicht absolut/fest positionierten Kinder paarweise verglichen, Toleranz 0,5 px.
   - Gemessen wird mit `offsetLeft/Top/Width/Height` statt `getBoundingClientRect`. Rotationen (Karten ±0,6°, gewählter Tag −4°, Etiketten ±0,5°) blähen sonst die Boxen auf und lösen Fehlalarme aus.

5. **Kurze Knopf-Beschriftungen sind bei 100 % einzeilig** (Nachtrag 3). Die Optionen sind `expectTextFits(page, { scale = 1, buttons = true })`:
   - Bei `scale: 2` ist die Prüfung aus, dort dürfen Knöpfe zwischen Wörtern umbrechen.
   - Mit `buttons: false` ist sie ebenfalls aus. So ruft sie der Smoke-Test mit **echten Daten** auf. Beschriftungen mit Daten (Anbietername im Link „Website von …“, Tag im „Nur …“-Knopf) dürfen nie den Deploy rot machen, nur weil ein neuer Anbieter einen langen Namen hat. Prüfung 5 läuft nur in Fixture-Läufen (`mobile-ux.spec.ts`).
   - Geprüft werden Bedienelemente (`button`, `a[href]` mit `display` ≠ `inline`, `[role=button]`), die *nicht* in einer Überschrift liegen. Der Kachel-Titel ist ein Knopf in einem `h3` und darf als Titel umbrechen.
   - Die Beschriftung (`textContent`, getrimmt) muss höchstens **32 Zeichen** lang sein. Längere Beschriftungen kommen aus den Daten („Website von Ev. Kirchengemeinde St. Markus – …“) und dürfen umbrechen.
   - Jeder Textknoten im Element muss auf einer Zeile liegen (alle Rects mit demselben `top`, Toleranz 2 px). Ein Tag-Knopf mit „Mo“ und „5“ in zwei Spans ist also erlaubt, „Alle gemerkten in den / Kalender“ nicht.

> **Umgesetzt mit präzisierten Regeln** (siehe „Umsetzung“): `/` ist keine Trennstelle in Prüfung 1, Toleranz > 1 px in Prüfung 4, „versteckt“ nur bei ≤ 1 px **und** Abschneiden, Prüfung 5 je Elternelement.

Ohne Fehlalarme heißt hier: Die Toleranzen sind oben festgelegt. Die Ausnahmen (`hyphens: auto`, `sr-only`, Scroll-Container, positionierte Vorfahren) sind im Code mit Grund kommentiert. Eine Ausnahme per Selektor oder per `data-`Attribut gibt es nicht. Meldet das Gate etwas, wird das Layout korrigiert.

**Kanarienvogel (Pflicht):** Das Gate wird *vor* den CSS-Korrekturen geschrieben und auf dem alten CSS laufen gelassen (Schritt 3.2). Es muss bei 320 px/200 % mindestens für Sticker-Labels (Prüfung 2), Tab-Labels, ICS-Knöpfe und Tageszahlen (1) sowie für die Kategorie-Pille und die Sheet-Chips (3) rot sein. Bei 320 px/100 % muss es für „Alle gemerkten in den Kalender“ (Merkliste) rot sein (5). Das Merklisten-Label ändert deshalb Paket B (`SavedView.tsx`, E16), damit B allein grün werden kann. Das Fixture-Detail im Gate ist der PEKiP-Kurs, `.two` prüft dort also niemand. Paket B ergänzt deshalb in `mobile-ux.spec.ts` die Ansicht `detail-regelmaessig` (Detail „Offener Krabbeltreff“). Sie läuft durch alle Gates, hell und dunkel, und durch 320 px/100 % und 200 %. Vor der `.two`-Korrektur muss sie für „Nur Mi 7.10.“ rot sein (5). Die Meldungen kommen als Beleg in die Commit-Message. Prüfung 4 bekommt einen eigenen Kanarienvogel: Der Test fügt per `page.addStyleTag({ content: ".hdr .kid { margin-left: -40px }" })` eine Überlappung ein. Die Regel muss `.hdr .kid` heißen, denn `.hdr .kid { margin-left: auto }` in `chrome.css` ist spezifischer als `.kid`. Das Gate muss rot werden. Der Fall bleibt als dauerhafter Test in `mobile-ux.spec.ts` („Text-Gate erkennt Überlappung“, erwartet den Fehler per `expect(…).rejects`).

### E11 – B6: Roboto-Fallback und genauere Metriken (Paket C, Layout-Maßnahme Paket B)

B6 bleibt in diesem Plan, ist aber ein eigenes **Paket C** (E16). Es läuft nach Paket B, weil es auf Bs fertigem Layout misst: Jede Layoutänderung aus B verschiebt die Umbruchgrenzen, an denen CLS entsteht.

**Messung wird reproduzierbar:** `scripts/font-fallback.ts` (neu, nur Entwicklung, Playwright-Chromium wie `scripts/screenshots.ts`):
- Lädt Bricolage aus `node_modules/@fontsource-variable/bricolage-grotesque/files/…latin-opsz-normal.woff2` sowie die Kandidaten. Arial/Liberation, Noto und DejaVu kommen per `local()`, Roboto per `url()` aus der neuen Dev-Abhängigkeit `@fontsource-variable/roboto` (OFL-1.1, variable wght wie Roboto ab Android 12).
- Misst die Breiten (`white-space: nowrap`, `getBoundingClientRect().width`) für die Textklassen der Seite:
  - Titel 1,375 rem/800, Tagesüberschrift 1,4375 rem/800, Marke ≈ 22 px/800;
  - Zeit 0,9375 rem/800, Fakten 0,8125 rem/700, Chips 1 rem/700, Tabs 0,8125 rem/600;
  - Meta 0,875 rem/450, Fließtext 1 rem/400.
- Mustertexte: Titel und Anbieter aus `data/offers.json` (über `src/domain`) und feste Fakten-Texte („Kurs · noch 4 von 8“, „Jeden Mittwoch“, „Anmeldung nötig“, „Wenige Plätze“, „Kostenlos“ …).
- Gibt je Fallback und Gewichtsbereich `size-adjust` (Breitenverhältnis), `ascent-override = 93 % / size-adjust` und `descent-override = 27 % / size-adjust` (Bricolage-Maße wie bisher) aus, dazu den Restfehler je Textklasse.

**Faces in `tokens.css`** (nur die `@font-face`-Blöcke und `--font-sans`; die Farb-Tokens ändert Paket B, siehe E16):
- Neu „Bricolage Fallback Roboto“. Der normale Schnitt hat `src: local("Roboto"), local("Roboto-Regular"), local("Roboto Regular")`, der fette `local("Roboto Bold"), local("Roboto-Bold"), local("Roboto")`. Ab Android 12 gibt es nur die variable Datei „Roboto“, Chromium stellt das Gewicht dann über die wght-Achse ein.
- Reihenfolge im Stack: Arial, **Roboto**, Noto, DejaVu, `system-ui`, `sans-serif`.
- **Gewichts-Buckets nach Messung:** Ziel ist, dass jede Textklasse einen Breitenfehler ≤ 1,5 % hat. Reichen die zwei Buckets nicht, kommt zuerst ein dritter hinzu: 200–549, 550–749 (Fakten, Chips, Tabs) und 750–800 (Titel, Zeit), beim Bold-Schnitt mit derselben `local()`-Datei und eigenem `size-adjust`.
- **Nur wenn der Fehler danach noch > 1,5 % ist** zwischen klein (≤ 16 px) und groß (≥ 20 px), gibt es einen zweiten Stack: `--font-display` mit Faces „… Display“, gesetzt auf die Überschriften-Klassen (`.brand, .ctitle, .dtitle, .daylabel, .ptitle, .sheet h2, .h3, .empty b, .cal-nav b, .label b`). `--font-sans` bleibt der Text-Stack. Die Zuordnung steht als **eine** Regel in `tokens.css` (`:where(.brand, .ctitle, …) { font-family: var(--font-display) }`, Spezifität 0). So muss C keine der Komponenten-Dateien von B anfassen. Braucht eine Klasse doch eine eigene Regel in ihrer Datei (z. B. weil dort `font-family` gesetzt ist), ändert C nur diese eine Zeile, und die Datei steht dann ausdrücklich in Cs Commit.
- Die Messwerte stehen im Kommentar über den Faces („erzeugt mit `node scripts/font-fallback.ts`, Datum“) und im Commit.
- CSS-Zuwachs bei 4 Fallbacks × 3 Gewichte × 2 Klassen: 24 kurze Faces, geschätzt < 1 kB gzip.

**Layout-Maßnahme (zusätzlich, Paket B, weil sie auch B7 hilft):** Die Herz-Spalte reserviert Platz nur noch dort, wo das Herz liegt (`top: 10px`, 44 px hoch):
- `.card-body` bekommt rechts 15 statt 62 px Innenabstand;
- `.card-top` und `.ctitle` bekommen `margin-right: 47px`;
- Meta und `.facts` nutzen die volle Kartenbreite.

Gründe: Pro Zeile passen mehr Fakten-Chips, es gibt also weniger Umbruchgrenzen, an denen ±1 % Breite eine ganze Zeile kostet. Bei 200 % hilft es auch (E8). Ab der zweiten Titelzeile liegt der Text tiefer als das Herz (Herz bis 54 px, Titel ab ≈ 46 px), nur die erste Titelzeile braucht den Rand. Ob die Meta-Zeile unter dem Herz frei bleibt, prüft Gate-Prüfung 4 (`.card-body`-Kinder gegen das Herz) nicht. Das prüft der Browser-Review.

**Verworfen:**
- `font-display: optional`: Beim ersten Besuch bliebe die Seite oft ganz ohne Bricolage, und die Kopfzeile steht vor den Daten.
- Feste Kartenhöhen bzw. `line-clamp`: verliert Inhalt bei 200 %.
- `.fact { white-space: nowrap }`: „Kurs · noch 4 von 8“ wäre bei 200 % breiter als die Karte.

### E12 – B6: Perf-Test mit zurückgehaltener Webfont (Paket C)

Neu `e2e/vitals.ts`. Damit ist auch der Arch-Hinweis 13 aus Plan 0003 erledigt („Web-Vitals-Helfer“):
- **Zeitbasis:** Die Fake-Uhr aus `e2e/fixtures.ts` (Z. 26, `setFixedTime`) ist in **jedem** Test installiert und ersetzt `performance`: `now()`, `mark()` und `getEntries*()` liefern gefälschte Werte (aus `playwright-core` 1.63 gelesen). Die Zeitstempel der `PerformanceObserver`-Einträge (`startTime`) sind dagegen nativ. `vitals.ts` nutzt deshalb **nie** `performance.now`, `performance.mark` oder `performance.getEntries*`. Ein Vergleichszeitpunkt kommt aus einer nativen Quelle mit derselben Zeitbasis wie `startTime`: `new Event("zp").timeStamp` (ersatzweise `document.timeline.currentTime`). Das steht als Kommentar über dem Helfer.
- `observeVitals(page)`: Init-Skript für LCP und CLS über `PerformanceObserver`. Bei CLS werden `sources` (Selektor, alte und neue Rechtecke) gesammelt und bei Rot in die Fehlermeldung geschrieben.
- `readVitals(page)`.
- `throttleMobile(page)`: CDP, CPU 4×, Netz wie bisher.
- `holdWebfont(page)`: `page.route("**/assets/bricolage-grotesque-latin-opsz-normal*.woff2")` hält die Anfrage, bis `release()` aufgerufen wird. Der Kanarienvogel steckt in `expectHeld()`: Die Route muss genau einmal gegriffen haben, sonst ist der Test wirkungslos.
- `useOnlyFallback(page, name)`: `page.route("**/assets/*.css")` holt das echte CSS und schreibt die `@font-face`-Blöcke um:
  - In allen Blöcken der *anderen* „Bricolage Fallback …“-Familien wird jede `local(…)`-Quelle durch `local("ZP kein Font")` ersetzt.
  - Der reguläre Ausdruck erfasst alle drei Schreibweisen, `local("Arial")`, `local('Arial')` und `local(Arial)`. Lightning CSS (Vites Minifier) lässt die Anführungszeichen weg, wenn der Name ein gültiger Bezeichner ist.
  - Bei `Roboto` wird `src` des gewählten Blocks durch `url("/__zp-test/roboto-<gewicht>.woff2") format("woff2")` ersetzt und `font-display: block` gesetzt. Eine zweite Route liefert die Datei aus `@fontsource-variable/roboto`. Das ist derselbe Origin, `thirdPartyGuard` bleibt grün. `block` sorgt dafür, dass Roboto selbst nicht per Swap nachrutscht; auf Android ist es lokal und sofort da.
  - Gezählt wird, wie viele Blöcke je Familie umgeschrieben wurden. Erwartet ist für jede andere Familie genau die Zahl ihrer Gewichts-Buckets. Weicht das ab (z. B. Minifier-Format geändert), schlägt die Funktion fehl. Ein still nur teilweise umgeschriebenes CSS gibt es also nicht.
- `expectOnlyFallback(page, name)` prüft über `document.fonts` nach dem Laden, dass von den „Bricolage Fallback …“-Faces **genau die der gewählten Familie** den Status `loaded` haben und keine andere. Die anderen sind `error` (Quelle gibt es nicht) oder `unloaded` (nie gebraucht).

Ablauf in `smoke.spec.ts` (Projekt `smoke-echte-daten`, seriell, echte Daten), neuer Test „Schrift-Swap verschiebt nichts“:
- Parametrisiert über Fallback ∈ {Arial, Roboto, Noto, DejaVu} × Breite ∈ {412, 360}.
- Ablauf:
  1. `useOnlyFallback`, `holdWebfont`, `observeVitals`, Uhr auf `generatedAt`, `goto`, erste Karte sichtbar.
  2. Die gewählte Fallback-Familie normal und fett laden: `document.fonts.load('400 16px "Bricolage Fallback <Name>"')` und `('800 16px …')`. Bei Roboto (per URL) ist das Pflicht, bei lokalen Schriften schadet es nicht. Danach `expectOnlyFallback`.
  3. 300 ms warten, dann `t0 = new Event("zp").timeStamp` im Browser merken (nativ, siehe Zeitbasis) und `release()`.
  4. `document.fonts.ready`, `document.fonts.check('800 22px "Bricolage Grotesque Variable"')` muss wahr sein (der Swap hat stattgefunden), 500 ms warten.
- Erwartung: **CLS < 0,05**, summiert nur aus `layout-shift`-Einträgen mit `startTime ≥ t0`. Gemessen wird also genau der Swap, nicht das Laden der Daten oder das Nachladen der Test-Roboto.
- **Kanarienvogel für die Zeitbasis (dauerhafter Test in `perf.spec.ts`):** Gleicher Ablauf, aber direkt nach `t0` verschiebt der Test künstlich den Inhalt (`document.querySelector("main").style.paddingTop = "120px"`). Dieser Shift muss gezählt werden (CLS > 0,05). Mit einer gefälschten Zeitbasis fiele er aus der Summe, und der Test wird rot.
- **Bestehender Code:** `perf.spec.ts` und der LCP/CLS-Test in `smoke.spec.ts` summieren CLS über alle Einträge und vergleichen LCP-`startTime` mit 2 500 ms. Beide nutzen nur `PerformanceObserver`, also native Zeitstempel, und keinen Vergleich mit `performance.now`. Sie sind vom Problem nicht betroffen. Beim Umstellen auf `vitals.ts` bleibt das so.
- Ist eine lokale Schrift auf der Maschine nicht vorhanden (Face-Status `error` in `document.fonts`), wird `test.skip` mit Begründung gesetzt, und das nie bei Roboto, das immer per URL kommt. Auf CI (Ubuntu mit `playwright install --with-deps`) sind Liberation und DejaVu da. Noto kann fehlen, das ist dann ein Skip und kein Grün ohne Messung.
- Ohne CPU-Drosselung: Es geht um Verschiebung, nicht um Tempo. Der bestehende LCP/CLS-Test mit Drosselung bleibt, nutzt aber die Helfer.
- `perf.spec.ts` (Fixtures) nutzt die Helfer und bekommt denselben Swap-Test für Roboto bei 412 px, damit er auch außerhalb des Smoke-Projekts läuft.

### E13 – Kleine Layout-Hinweise H3, H7

- **H3:** über das Darstellungs-Segment in E8 (Nachtrag 2).
- **H7:** Der Fuß im Sheet klebt unten, ohne negativen Versatz:
  - `.sheet` verliert seinen unteren Innenabstand (`padding-bottom: 0`).
  - `.sheetfoot { position: sticky; bottom: 0; margin-inline: -16px; padding: 12px 16px calc(18px + env(safe-area-inset-bottom)); background: var(--bg); border-top: 2px solid var(--edge2) }`. Der Fuß trägt den Abstand zum unteren Rand und zur Home-Leiste also selbst.
  - Damit stehen „N Angebote zeigen“ und „Fertig“ immer sichtbar unten, auch wenn das Sheet scrollt. Ein negatives `bottom` hätte je nach Browser unterschiedlich mit dem Innenabstand des Scroll-Containers gerechnet.
  - Auf dem iPhone (Home-Leiste, `env(safe-area-inset-bottom)`) prüft das der Browser-Review (Schritt 8).

> **Umgesetzt ohne `sticky`** (siehe „Umsetzung“): Das Sheet ist eine Flex-Spalte, `.sheet-scroll` scrollt, der Fuß steht als Geschwister darunter.

### E14 – H1: Querformat, Tab-Leiste als Seitenleiste

Nachtrag 1 zeigt: Bei 915 × 412 verdeckt die Leiste ≈ 82 von 412 px. Weil der Kopfbereich (Kopf 64 + Sticker 88 + Chips 60 px) mitscrollt, bleiben oben nur ≈ 60 px für den ersten Inhalt. Eine nur kompaktere Leiste brächte ≈ 16 px, das reicht nicht. Im Querformat ist aber neben der 40-rem-Spalte Platz. Deshalb:

- **Seitenleiste** bei `@media (max-height: 500px) and (min-width: 40rem)`. Das betrifft Telefone quer: Pixel 7 quer, iPhone 15 quer (852 px) und das Projekt `pixel-7-quer`.
  - `.tabs` steht fest links: `left: calc(env(safe-area-inset-left) + 8px)`, vertikal mittig, Breite 6,5 rem (Spalte ≈ 5,25 rem ≥ 4,6 rem, die Labels bleiben bei 100 % sichtbar), drei Zeilen statt drei Spalten. Das Washi-Tape ist um 90° gedacht: gleiche Farben und Streifen, Rotation +0,6°.
  - `body` bekommt links `calc(env(safe-area-inset-left) + 7.5rem)` Innenabstand. Die Spalte `.app` zentriert sich im Rest und wird notfalls schmaler (`max-width` bleibt 40 rem). Die Leiste kann den Inhalt also auch mit Notch-Einzug nie überdecken.
  - `.app` unten nur noch `calc(20px + env(safe-area-inset-bottom))`.
  - Der Toast steht unten mittig über der Inhaltsspalte, nicht über dem ganzen Viewport (er bleibt `position: fixed` mit `translateX(-50%)`):
    ```css
    .toast {
      --rail: calc(env(safe-area-inset-left) + 7.5rem);   /* = body padding-left */
      left: calc(var(--rail) + (100vw - var(--rail) - env(safe-area-inset-right)) / 2);
      width: min(26rem, 100vw - var(--rail) - env(safe-area-inset-right) - 32px);
      bottom: calc(16px + env(safe-area-inset-bottom));
    }
    ```
    Die Mitte des Bereichs rechts der Leiste ist auch die Mitte der zentrierten `.app`-Spalte. Bei 915 px: Leiste 120 px, Mitte bei 120 + 795 / 2 = 517,5 px, Breite 416 px. `layout.spec.ts` prüft: Toast-Box (`offsetLeft`/`offsetWidth` des Toasts gegen `main`) liegt vollständig über `main` und überlappt `.tabs` nicht (mit angehaltener Uhr wie in E15).
  - `.tab-thumb` folgt der Wahl über eine CSS-Variable statt über ein Inline-`translateX`: `Chrome.tsx` setzt `className={`tab-thumb at-${index}`}`, CSS `.at-1 { --i: 1 }`, `.at-2 { --i: 2 }`. Unten gilt `translateX(calc(var(--i, 0) * 100%))`, an der Seite `translateY(…)`. Es kommt ohne Cast aus, und `style` mit eigener Property bräuchte in TS ein `as`.
- **Kompakte Leiste** bei `@media (max-height: 500px) and (max-width: 39.99rem)` (sehr kleine Telefone quer, z. B. 568 × 320): Icon und Label nebeneinander, `.tab` 44 statt 56 px hoch, weniger Innenabstand. `.app`-Unterabstand und Toast passen sich an.
- **Test** in `layout.spec.ts`:
  - 915 × 412 und 852 × 393: Die Leiste liegt links neben `main` (`tabs.right ≤ main.left`), und die erste Karte ist ohne Scrollen sichtbar.
  - 568 × 320: Die Leiste ist höchstens 56 px hoch.
  - Hochformat 412 × 915: unverändert unten.
  - **863 × 360 (Pixel 7 quer) bei 200 %:** Seitenleiste plus große Schrift ist die engste Kombination (Spalte ≈ 863 − 120 − 32 px, Höhe 360). Start, Kalender und Detail mit `expectTextFits(page, { scale: 2 })` und `expectNoHorizontalScroll`, dazu prüft der Test, dass die Tab-Labels per Container-Query ausgeblendet sind oder in ihre Spalte passen.

  Die bestehenden Gates im Projekt `pixel-7-quer` prüfen damit automatisch die Seitenleiste (Touch, axe, Text, Überlauf), hell und dunkel.

### E15 – Dunkelmodus ohne helle Inseln (H4 und Nachtrag 5)

Die Inversflächen nutzen heute `var(--ink)`/`var(--bg)`. Im Dunkeln ist `--ink` `#EEF3F8`, also fast weiß. Das passt zum Mockup (`stickerheft-mockup.html` Z. 232), wirkt aber im Dunkeln als grelle Insel. Die Entscheidung zu H4 kippt deshalb von „belassen“ zu **umsetzen**. Kategorie- und Statusfarben (Pillen, Sticker, Stempel, Fakten-Chips) bleiben farbig, das ist das Sticker-Design. Dunkel werden nur neutrale Inversflächen und große Hinweisflächen.

- Neue Tokens in `tokens.css`. Die Dunkel-Werte stehen dort **zweimal**, unter `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` und unter `:root[data-theme="dark"]`. Jedes neue Token kommt in **beide** Blöcke; das Gate prüft beide Wege (unten).
  - `--sel`/`--on-sel` für gewählte Zustände: hell `#13212E`/`#E8F1FF` (unverändert), dunkel `#FFD93B`/`#13212E` (wie `--primary`).
  - `--toast`/`--on-toast`: hell `#13212E`/`#E8F1FF`, dunkel `#243241`/`#EEF3F8` (`--soft`/`--ink`) mit Rand `--line`.
- Angewandt auf:
  - `.chip[aria-pressed="true"], .chip.on` (`chrome.css` Z. 239–244);
  - `.stk .tick` (Z. 198–210);
  - `.day[aria-pressed="true"]` samt `.wd` (`calendar.css` Z. 56–65);
  - `.mday[aria-pressed="true"]` (Z. 144–147);
  - `.dates li.sel` (`dialog.css` Z. 234–237);
  - `.toast` (`sheet.css` Z. 154–173).
- Alters-Hinweis `.hint.ok`/`.hint.bad` (`sheet.css` Z. 84–91): Statt fester Farben nutzen sie die neuen Tokens `--hint-ok-bg`/`--hint-bad-bg` und `--on-hint`. Hell bleibt es wie bisher (`#A6DB5E`/`#FF9A9A`, Text `#13212E`). Dunkel gilt `color-mix(in srgb, #A6DB5E 22%, #1B2733)` bzw. `#FF9A9A` 22 %, Text `#EEF3F8`, Rand in der vollen Farbe. Auch diese Tokens stehen in **beiden** Dunkel-Blöcken; über Tokens statt eigener Selektoren kann kein Zweig vergessen werden.
- Gate `expectNoBrightIslands(page)` in `e2e/mobile-ux.ts`. Aufgerufen wird es in allen Dunkel-Läufen von `mobile-ux.spec.ts`, und zwar über **beide** Wege zum Dunkelmodus:
  - wie bisher `emulateMedia({ colorScheme: "dark" })` (System-Einstellung, `@media`-Zweig);
  - zusätzlich je Ansicht ein Lauf mit hellem System und gewählter Darstellung „Dunkel“ (`data-theme="dark"`). Dafür setzt `page.addInitScript` vor dem Laden `localStorage["zwergenplan.darstellung"] = "dunkel"`. Der Weg über den Theme-Knopf geht nicht überall, denn unter 380 px ist er ausgeblendet (E6). Der Test prüft vor dem Gate, dass `document.documentElement.dataset.theme === "dark"` ist.
  - Regel: Kein sichtbares Element und kein `::before`/`::after` ohne `background-image` hat eine deckende Hintergrundfarbe (Alpha > 0,5) mit relativer Luminanz > 0,75 auf mehr als 1 000 px². Pseudo-Elemente werden über `getComputedStyle(el, "::before")` gelesen; ihre Fläche wird aus `width`/`height` bzw. bei `inset`-Positionierung aus der Box des Elements geschätzt. So fällt z. B. `.tab-thumb::before` (der gewählte Tab, `background: var(--surface)`) auf, falls er hell würde.
  - Gelb `#FFD93B` (0,71), Grün `#A6DB5E` (0,60) und alle Kategoriefarben liegen darunter, `#EEF3F8` (0,89) und Weiß darüber. Der Schalter-Knopf (24 × 24 = 576 px², weiß) liegt unter der Fläche.
  - **Toast deterministisch:** Der Toast verschwindet nach 2,8 s. Ob ein Gate-Lauf ihn erwischt, wäre Zufall. Deshalb gibt es einen eigenen Test „Toast im Dunkeln“ in `mobile-ux.spec.ts`, in beiden Dunkel-Wegen:
    - Startseite laden, dann `page.clock.pauseAt(new Date("2026-10-05T12:00:00+02:00"))`. Die Fixture hat die Fake-Uhr per `setFixedTime` schon installiert; `pauseAt` hält jetzt auch die Timer an (`playwright-core` 1.63, Ausgangslage).
    - Herz tippen, auf den Toast-Text warten, dann sofort `expectNoBrightIslands` und `expectTextFits`. Der Timer des Toasts läuft nicht weiter, der Toast bleibt stehen.
    - Danach `page.clock.runFor(3000)`: Der Toast ist weg. Das prüft nebenbei, dass der Timer wirklich an der Fake-Uhr hängt.
    - Im angehaltenen Zustand gibt es kein Warten auf `requestAnimationFrame` (es ist ebenfalls angehalten). Die beiden Gates sind reine `evaluate`-Aufrufe.
  - Kanarienvogel: Auf dem alten CSS muss das Gate für `kalender` (gewählter Tag = heute) und für den Toast-Test im Dunkeln rot sein, jeweils in beiden Dunkel-Wegen.
  - `.hint.ok` liegt mit Luminanz 0,60 unter der Schwelle. Der Test `kind-sheet` (dunkel, beide Wege) prüft deshalb zusätzlich gezielt, dass die Hintergrundfarbe von `.hint.ok` eine Luminanz < 0,2 hat. Das ist eine Erwartung an eine bekannte Stelle, keine Gate-Ausnahme.
  - Die allgemeine Schwelle bleibt bei 0,75. Eine niedrigere träfe die gewollten gelben Primärknöpfe (0,71).

### E16 – Arbeitsteilung: drei Pakete ohne gemeinsame Dateien zur selben Zeit

A und B arbeiten parallel in getrennten Worktrees, **keine Datei gehört beiden**. C läuft danach, im Anschluss an B und durch denselben Playwright-Agenten. Nur B und C starten Playwright, nacheinander, weil die Ports 4173/4174 nur einmal belegt werden können. Paket A schreibt seine E2E-Specs ungetestet, sie laufen erst beim Zusammenführen (Schritt 5).

**Paket A „Domäne + Texte“** (B1, B2 inkl. „jetzt“ erneuern, B4, B8, H2-Teil, H5, H6, H8), Branch `nacharbeit-0007-a`:
- `src/domain/agenda.ts` + `agenda.test.ts` (`dayAgenda`, `endedOnDay`)
- `src/domain/filter.ts` + `filter.test.ts` (`matchesFilter`)
- `src/domain/time.ts` + `time.test.ts` (`sameMinute`)
- `src/domain/registration.ts` + `registration.test.ts` (neu)
- `src/domain/site-data.ts` + `site-data.test.ts` (`venueAddress`)
- `src/ui/format.ts` + `format.test.ts` (B1, B4, H8)
- `src/ui/CalendarView.tsx` (B2, B8, H2, Scroll-Ausgleich E5)
- `src/ui/DetailDialog.tsx` (B4 mit `now`, H5, Kurs-Knopf „Alle 8 Kurstermine“ aus E4)
- `src/ui/use-offer-views.ts` + `use-offer-views.test.ts` (`dataEnd`, `clampDay` auf `calendar.day`)
- `src/ui/use-app-state.ts` (`useNow`, E2)
- `src/ui/App.tsx` (`useNow`, `dataEnd` und `endedToday` durchreichen)
- `e2e/calendar.spec.ts`, `e2e/detail.spec.ts`
- `docs/ideas.md` (alle Einträge aus E17, auch die für B und C), `docs/plans/0003-design-stickerheft.md` (Verweise „geändert durch Plan 0007“ in E5, E6, E12, E13, E14 und E15 von Plan 0003)

**Paket B „Layout + Gates“** (B3, B5, B7, H1, H3, H4, H7, Dunkelmodus, Kachel-Layout aus E11), Branch `nacharbeit-0007-b`:
- `src/ui/styles/tokens.css`: **nur die Farb-Tokens** (`:root`, beide Dunkel-Blöcke, E15)
- `src/ui/styles/base.css`, `chrome.css`, `card.css`, `calendar.css`, `tabs.css`, `dialog.css`, `sheet.css`, `list.css` (falls das Gate dort etwas meldet)
- `src/ui/Chrome.tsx` (`tab-label`-Span, `tab-thumb at-N` statt Inline-`transform`)
- `src/ui/SavedView.tsx` (nur das Label „Alle in den Kalender“, E4) und `e2e/saved.spec.ts` Z. 48
- `e2e/mobile-ux.ts`, `e2e/mobile-ux.spec.ts` (+ Ansicht `detail-regelmaessig`, Dunkel per `data-theme`, Toast-Test, Kanarienvogel Überlappung), `e2e/layout.spec.ts` (neu), `e2e/theme.spec.ts` (Schwelle 380 px)
- `e2e/smoke.spec.ts`: **nur** der Test „echte Daten brechen bei 320 px und 200 % Textgröße nicht aus“ und der Aufruf `expectMobileUx(page, { buttons: false })` in „echter Build lädt und ist bedienbar“
- `scripts/screenshots.ts` (Option `--text=200`)
- `docs/architecture.md`: Zeilen zum Text-Gate, zum Insel-Gate und zur Regel aus E7

**Paket C „Font-Swap“** (B6), Branch `nacharbeit-0007-c`, abgezweigt vom fertigen Stand von B (nach Schritt 3, CI grün):
- `src/ui/styles/tokens.css`: **nur die `@font-face`-Fallback-Blöcke**, `--font-sans` und ggf. `--font-display` samt der einen `:where(…)`-Regel für die Überschriften (E11)
- nur falls nötig: einzelne `font-family`-Zeilen in den Komponenten-Dateien von B (`base.css` `.ptitle`, `chrome.css` `.brand`, `card.css` `.ctitle`/`.empty b`, `list.css` `.daylabel`, `dialog.css` `.dtitle`/`.h3`/`.label b`, `sheet.css` `.sheet h2`, `calendar.css` `.cal-nav b`). Diese Dateien hat B dann schon abgeschlossen (nacheinander, kein Konflikt), C ändert dort nichts anderes.
- `scripts/font-fallback.ts` (neu)
- `package.json`, `pnpm-lock.yaml` (`@fontsource-variable/roboto` als devDependency), ggf. `knip.json`
- `e2e/vitals.ts` (neu), `e2e/perf.spec.ts`
- `e2e/smoke.spec.ts`: **nur** der LCP/CLS-Test (auf die Helfer umgestellt) und die neue Swap-Matrix
- `docs/architecture.md`: Zeile zum Swap-Test je Fallback

**Gemeinsam genutzte Dateien, nur nacheinander:** `tokens.css`, `smoke.spec.ts` und `architecture.md` ändern B und C. Weil C erst auf dem fertigen B-Stand abzweigt, entsteht kein Konflikt; die Aufteilung oben (welche Blöcke wem gehören) gilt trotzdem, damit ein Review die Änderungen klar zuordnen kann.

`docs/plans/0007-nacharbeit-design.md` ändert kein Paket. Ergebnisse und Messwerte stehen in den Commit-Messages, der Koordinator überträgt sie (Schritte 4 und 8). Berührungspunkt A/B: `CalendarView.tsx` (A) und `calendar.css` (B). A ändert kein Klassen-Markup außer neuen Leerzuständen über die bestehende `EmptyState`-Komponente, B ändert dort nur CSS. Für `DetailDialog.tsx` (A) und `dialog.css` (B) gilt dasselbe.

### E17 – Entscheidung je Befund

| Befund | Entscheidung | Paket | Begründung (ein Satz) |
|---|---|---|---|
| B1 Uhrzeit bei „Freitags“/„Montags“ (auch Nachtrag 6) | umsetzen | A | Die Information steht in den Daten und fehlt nur durch einen fehlenden Zweig. |
| B2 beendete Termine heute | umsetzen: ausblenden | A | Gleiche Regel wie überall („zählt bis beendet“), kein Detail-ICS für Vergangenes; „jetzt“ wird auch ohne Neuladen erneuert. |
| B3 Kalendertage 320 px | umsetzen | B | Woche 44,6 px, Monat 45,1 px durch Ausdehnung in den Seitenrand, zwei Zeilen CSS. |
| B4 Frist abgelaufen | umsetzen | A | Kleines Domänenmodul, sonst lädt das Detail zu einer geschlossenen Anmeldung ein. |
| B5 Kopfzeile 360–370 px | umsetzen | B | Container-Query mit berechneter Schwelle und E2E über acht Breiten. |
| B6 CLS Font-Swap | umsetzen | C | Roboto-Fallback, gemessene Buckets, Kachel-Layout, Test mit zurückgehaltener Schrift. |
| B7 200 % bei 320 px, Knöpfe zweizeilig bei 100 % | umsetzen | B (Kurs-Label A) | Korrekturen je Stelle, kürzere Labels und ein allgemeines Gate. |
| B8 nach dem letzten Termin | umsetzen | A | Fällt mit `dayAgenda` fast kostenlos ab. |
| H1 Querformat | umsetzen | B | Seitenleiste neben der Spalte bzw. kompakte Leiste, CSS plus eine Klasse in `Chrome.tsx`, weil eine nur kompaktere Leiste ≈ 16 px bringt. |
| H2 Sonntag / doppelte Woche | teilweise | A | Doppelte Leiste ausblenden jetzt; rollende Woche → `docs/ideas.md`, ändert das Kalenderkonzept. |
| H3 Segment 320 px | umsetzen | B | Fällt mit der Container-Query für 200 % ab. |
| H4 Toast dunkel hell, dazu gewählter Tag, Chips, Alters-Hinweis (Nachtrag 5) | umsetzen | B | Gleiches Muster an sechs Stellen, zwei Token-Paare und ein Gate gegen helle Inseln. |
| Nachtrag 4 Theme-Knopf fehlt bei 320 px | bestätigt | B | Gewollt, Schwelle jetzt 380 px (E6); die Darstellung bleibt im Kind-Sheet. |
| H5 „Alle N Termine“ | umsetzen | A | Knopf ohne Zahl, Toast mit echter Zahl. |
| H6 Ort doppelt | umsetzen | A | Eine Funktion in `toSiteData` korrigiert Detail und ICS; die Daten selbst bereinigt ein späterer Pipeline-Lauf (`docs/ideas.md`). |
| H7 Filter-Fuß | umsetzen | B | `position: sticky`, wenige Zeilen. |
| H8 Kurs „noch X von N“ | umsetzen | A | `courseProgress` gibt es schon, gleiche Formulierung wie die Kachel. |

Abweichungen in der Umsetzung stehen im Abschnitt „Umsetzung“ am Ende.

Neue Einträge in `docs/ideas.md` (Paket A schreibt sie):
- **Kompakter Kopfbereich im Querformat**: Sticker und Chips nehmen quer ≈ 150 px Höhe ein. Mit der Seitenleiste (E14) ist das tragbar, ein kompakterer Kopf wäre ein eigenes Designthema (H1).
- **Rollende Kalenderwoche**: 7 Tage ab heute statt Mo–So, damit am Sonntag nicht 6 von 7 Tagen gesperrt sind (H2).
- **Seitenzoom als Gate**: Chrome Android zoomt die ganze Seite, bei 200 % ist der Viewport dann ~206 px. Das Gate deckt heute 320 px bei 200 % Text ab (E7).
- **Schrift-Preload**: `<link rel="preload">` der Latin-woff2 verkürzt das Swap-Fenster, braucht aber den gehashten Asset-Namen im HTML.
- **Anmeldeschluss auf der Kachel**: ein Chip „Anmeldung vorbei“ (B4 zeigt es nur im Detail).
- **Katalog-Adressen ohne Ortsnamen-Präfix**: Die 32 Adressen in `data/providers.yaml`, die mit dem Ortsnamen beginnen, beim nächsten Pipeline-Lauf bereinigen, dazu eine Warnung in `validate-data` (H6 korrigiert das bis dahin nur in der Anzeige).

## Struktur

```
src/domain/
  agenda.ts (+test)        + DayAgenda, dayAgenda, endedOnDay             [A]
  filter.ts (+test)        + matchesFilter                                [A]
  time.ts (+test)          + sameMinute                                   [A]
  registration.ts (+test)  RegistrationPhase, registrationPhase (neu)       [A]
  site-data.ts (+test)     + venueAddress, in toSiteData angewandt          [A]
src/ui/
  format.ts (+test)        whenLabels (B1, H8), registrationNote(offer, now) [A]
  CalendarView.tsx         dayAgenda, Leerzustände, Woche aus bei offenem Monat [A]
  DetailDialog.tsx         registrationNote(offer, now), „Alle Termine“, „Alle 8 Kurstermine“ [A]
  use-offer-views.ts (+test)  + calendar.dataEnd, calendar.day geklemmt    [A]
  use-app-state.ts         + useNow (Minutenwechsel, visibilitychange)      [A]
  App.tsx                  useNow, dataEnd/endedToday durchreichen          [A]
  Chrome.tsx               tab-label-Span, tab-thumb at-N                   [B]
  SavedView.tsx            Label „Alle in den Kalender“                     [B]
  styles/*.css             E6, E8, E9, E10 (hyphens), E11 (Kachel), E13, E14, E15 [B]
  styles/tokens.css        Farb-Tokens [B]; @font-face-Fallbacks, --font-sans [C]
e2e/
  calendar.spec.ts, detail.spec.ts                                         [A]
  mobile-ux.ts             + expectTextFits, expectNoBrightIslands, export expectTouchTargets [B]
  mobile-ux.spec.ts        Text-Gate 100/200 %, Touch bei 320 px, Inseln dunkel, + detail-regelmaessig [B]
  layout.spec.ts (neu)     Kopfzeile über Breiten, Labels, Schriftzustände; Querformat [B]
  saved.spec.ts            Label „Alle in den Kalender“                     [B]
  smoke.spec.ts            320 px/200 %, buttons: false [B]; LCP/CLS, Swap-Matrix [C]
  vitals.ts (neu)          observeVitals, readVitals, throttleMobile, holdWebfont, useOnlyFallback, expectOnlyFallback [C]
  perf.spec.ts             Helfer, Swap-Test Roboto                         [C]
scripts/
  font-fallback.ts (neu)   misst size-adjust je Fallback/Gewicht/Klasse     [C]
  screenshots.ts           + --text=200                                     [B]
```

Die Schichtregeln bleiben: `registration.ts` ist rein und bekommt „jetzt“ übergeben, `e2e/` importiert nichts aus `src/`. `scripts/font-fallback.ts` liest Mustertexte über `src/domain` und Node-I/O (erlaubt für `scripts/`).

## Tests

**Unit, test-first** (Vitest, TZ `America/Los_Angeles`, Coverage `src/domain` ≥ 90 %), Paket A:
- **`agenda` – `dayAgenda`:**
  - Mi 7.10. 20:00 Berlin: Termin 10:00–11:30 → `items` leer, `ended` 1;
  - 11:00: laufend → 1 Item, `ended` 0;
  - Ende genau = jetzt → zählt noch (wie `notEnded`);
  - künftiger Tag → `ended` 0, auch wenn `endedToday` > 0;
  - heute → `ended` = `endedToday`;
  - `afterData`: Tag > `dataEnd` wahr, = falsch, `dataEnd` undefined falsch;
  - ein Termin 00:30 Berlin liegt am richtigen Tag, obwohl der Test in LA läuft.
- **`registration`:**
  - kein Fenster → `undefined`;
  - `opens` in der Zukunft → `bald`;
  - `opens` = jetzt → `offen`;
  - `deadline` = jetzt → `offen`, eine Millisekunde später → `vorbei`;
  - nur `deadline` → `offen`/`vorbei`.
- **`site-data` – `venueAddress`:**
  - Präfix („CVJM-Haus, Kornmarkt 6, 90402 Nürnberg (Turnhalle 2. UG)“ → ohne „CVJM-Haus, “);
  - Groß-/Kleinschreibung;
  - Suffix „(Haus der Katholischen Stadtkirche)“;
  - Teilübereinstimmung bleibt;
  - Ergebnis < 5 Zeichen → unverändert;
  - `toSiteData` wendet es an;
  - die ICS-`LOCATION` aus `icsForSeries(toSiteData(…))` nennt den Namen genau einmal.
- **`ui/format`:**
  - `whenLabels`: 14-täglich mit gleicher Uhrzeit → „Freitags, HH:MM–HH:MM“ (die bestehende Erwartung Z. 139–143 wird zuerst auf rot umgestellt), gemischte Wochentage mit gleicher Uhrzeit → „Regelmäßig, …“, wechselnde Uhrzeit → ohne;
  - regelmäßig ohne kommenden Termin → „Regelmäßig“ ohne Uhrzeit (`uniformTimes([])` ist wahr, darf aber keine Uhrzeit erzeugen);
  - laufender Kurs → „Kurs · noch 6 von 8 Terminen“, nicht begonnener → „Kurs mit 8 Terminen“, beendeter → „Kurs mit 8 Terminen – vorbei“;
  - `registrationNote(offer, now)` für alle fünf Fälle aus E3.
- **`ui/use-offer-views`:** `calendar.dataEnd` ist der letzte Tag aller kommenden Angebote, auch wenn ein Filter aktiv ist. `calendar.lastDay` bleibt der gefilterte. Liegt der gespeicherte Kalendertag vor heute, liefert `calendar.day` heute.
- **`time` – `sameMinute`:** gleiche Minute (…:10 und …:50), Minutenwechsel, Stunden- und Tageswechsel, über die Zeitumstellung (25.10.). Der Hook `useNow` selbst wird über die E2E-Tests unten geprüft.
- **`agenda` – `endedOnDay`:** zählt nur Termine des Tages mit Ende < jetzt; Ende = jetzt zählt nicht (läuft noch); Termin 00:30 Berlin am richtigen Tag (Test in LA).
- **`filter` – `matchesFilter`:** gleiche Fälle wie `applyFilters`, aber ein vorbei-es Angebot passt weiter; `applyFilters` bleibt mit seinen bestehenden Tests grün.

**E2E Paket A** (Fixtures, Uhr Mo 5.10.2026 12:00, sonst vor `goto` per `page.clock.setFixedTime`), ungetestet geliefert:
- `calendar.spec.ts`:
  - „abends fehlen beendete Termine“: Uhr Mi 7.10. 20:00 → Überschrift „Heute, 7. Oktober“, „0 Angebote“, „Für heute ist alles vorbei“, Tag-Knopf „Mittwoch, 7. Oktober, 0 Angebote“.
  - „laufender Termin bleibt“: Uhr Mi 7.10. 11:00 → „Offener Krabbeltreff“ in der Agenda.
  - „nach dem letzten Termin“: Monat auf, zweimal „Nächster Monat“, „Freitag, 11. Dezember, 0 Angebote“ → „Weiter reicht der Plan noch nicht“ und „Donnerstag, 10. Dezember“.
  - „offener Monat blendet die Woche aus“: Monat auf → kein Knopf „Vorherige Woche“/„Nächste Woche“, der Monatsknopf ist weiter fokussiert (`toBeFocused`), zu → wieder da.
  - „jetzt wird ohne Neuladen erneuert“ (B2 im offenen Tab): Uhr Mi 7.10. 11:00, Kalender, „Offener Krabbeltreff“ sichtbar (läuft). Dann `page.clock.pauseAt(11:00)`, `page.clock.setFixedTime(new Date("2026-10-07T11:31:00+02:00"))` und `page.clock.runFor(60_000)`: Der 30-s-Timer feuert, die Minute hat gewechselt → „Für heute ist alles vorbei“. 
  - „jetzt wird beim Zurückkehren erneuert“ (eigener Test, frische Seite, ohne Timer): Uhr Mi 7.10. 11:00, Kalender laden, „Offener Krabbeltreff“ sichtbar. `page.clock.pauseAt(11:00)` (damit kein Intervall dazwischenfunkt), `setFixedTime(11:31)`, dann `document.dispatchEvent(new Event("visibilitychange"))` (`visibilityState` ist `visible`) → „Für heute ist alles vorbei“.
  - „Tageswechsel im offenen Tab“: `setFixedTime` Mi 7.10. 23:59:40, Kalender laden („Heute, 7. Oktober“). `pauseAt(23:59:40)`, `setFixedTime` Do 8.10. 00:00:10, `runFor(30_000)` → Überschrift „Heute, 8. Oktober“, der Knopf „Mittwoch, 7. Oktober, …“ ist gesperrt (`toBeDisabled`), und der gewählte Tag ist Do 8.10. (`clampDay`).
  - „heute schon vorbei, ohne kommende Termine“ (B2, `endedToday`): Fixture-Uhr Mo 5.10. 12:00, Kalender → „Heute, 5. Oktober“, „0 Angebote“, „Für heute ist alles vorbei“ (Elterncafé, 9–10 Uhr).
- `detail.spec.ts`:
  - B1: „Krabbelreime & Fingerspiele“ zeigt „Freitags, 10:30–11:00“.
  - B4: Uhr Sa 10.10. 12:00, PEKiP → „Anmeldeschluss war am 9.10.“
  - H5: Link „Alle Termine“ (Z. 79 angepasst), 5 VEVENTs.
  - H8: Uhr Di 20.10. 12:00 → „Kurs · noch 6 von 8 Terminen“.
  - H6: im Etikett „Wo“ steht der Ortsname nur einmal. Falls die Fixtures keinen Ort mit Namen in der Adresse haben, deckt das der Unit-Test, und `tests/fixtures/providers.yaml` bekommt keinen künstlichen Fall.

**E2E Paket B** (nur B startet Playwright):
- `mobile-ux.ts`: `expectTextFits(page, { scale, buttons })` (E10). `expectMobileUx(page, { buttons = true })` ruft es mit `scale: 1` auf und reicht `buttons` durch. Dazu `expectNoBrightIslands(page)` (E15). `expectTouchTargets` wird exportiert.
- `mobile-ux.spec.ts`:
  - neue Ansicht `detail-regelmaessig` (Detail „Offener Krabbeltreff“);
  - in allen Dunkel-Läufen `expectNoBrightIslands`, je Ansicht über System-Dunkel **und** über `data-theme="dark"` (E15);
  - `kind-sheet` dunkel: `.hint.ok` mit Luminanz < 0,2;
  - Test „Toast im Dunkeln“ mit angehaltener Uhr (E15);
  - im Test „… bricht bei 320 px und 200 % Textgröße nicht aus“ kommen dazu: bei 100 % `expectTouchTargets` (B3, alle Ansichten) und `expectTextFits` (inkl. Prüfung 5: einzeilige Knöpfe), nach dem Umschalten auf 200 % `expectTextFits(page, { scale: 2 })` neben `expectNoHorizontalScroll` und axe.
- `layout.spec.ts`: Kopfzeile (E6) und Querformat (E14) inkl. Toast über der Spalte und 863 × 360 bei 200 %; `test.skip` nach `testInfo.project.name` (nur `pixel-7`, `iphone-15`). Gemessen nur mit `offsetTop`/`offsetHeight` (gedrehte Elemente).
- `theme.spec.ts`: Der Test mit dem Kopf-Knopf überspringt bisher nur unter 360 px (Z. 5). Weil der Knopf jetzt unter 380 px fehlt und `android-klein` 360 px breit ist, wird die Schwelle auf 380 px gehoben (Begründung im Skip-Text).
- `mobile-ux.spec.ts`: dauerhafter Kanarienvogel „Text-Gate erkennt Überlappung“ (`.hdr .kid { margin-left: -40px }` per `addStyleTag`, E10).
- `saved.spec.ts`: Knopf „Alle in den Kalender“ (Z. 48).
- `smoke.spec.ts` (Bs Teil):
  - „echter Build lädt und ist bedienbar“ ruft `expectMobileUx(page, { buttons: false })` auf;
  - 320 px/200 % für Start, Kalender (Monat offen) und Detail mit echten Daten, jeweils `expectTextFits(page, { scale: 2, buttons: false })` (Arch-Hinweis 16 aus Plan 0003).
- Kanarienvögel laut E10 und E15, Ergebnis in der Commit-Message.

**E2E Paket C** (nach B, derselbe Playwright-Agent):
- `vitals.ts` mit den Helfern aus E12.
- `smoke.spec.ts` (Cs Teil): Swap-Matrix (E12); der bestehende LCP/CLS-Test nutzt die Helfer.
- `perf.spec.ts`: Helfer und Swap-Test Roboto 412 px.
- Kanarienvögel laut E12 (Route hat gegriffen, Umschreiben vollständig, Swap-Test ohne Roboto-Faces rot, künstlicher Shift nach `t0` wird gezählt), Ergebnis in der Commit-Message.

## Backpressure

Keine Schwelle wird gesenkt, kein Gate gelockert. Neu, und rot, wenn der jeweilige Fehler zurückkommt:

| Fehler kommt zurück | Gate wird rot |
|---|---|
| B1 Uhrzeit fehlt | `format.test.ts` (whenLabels), `detail.spec.ts` |
| B2 Beendete in „Heute“ | `agenda.test.ts` (`dayAgenda`), `calendar.spec.ts` „abends“ |
| B2 im offenen Tab („jetzt“ veraltet) | `calendar.spec.ts` „jetzt wird ohne Neuladen erneuert“ (Timer), „… beim Zurückkehren“ (`visibilitychange`), „Tageswechsel im offenen Tab“ |
| B2 einmaliger Termin heute vorbei → „Freier Tag“ | `agenda.test.ts` (`endedOnDay`), `filter.test.ts` (`matchesFilter`), `calendar.spec.ts` „heute schon vorbei“, Mobile-Gates der Ansicht `kalender` |
| B3 Tage < 44 px bei 320 px (Woche und Monat) | `expectTouchTargets` bei 320 px in `mobile-ux.spec.ts` (Ansicht `kalender` mit offenem Monat) |
| B4 Frist ohne Hinweis | `registration.test.ts`, `format.test.ts`, `detail.spec.ts` |
| B5 Kopfzeile bricht um | `layout.spec.ts` (8 Breiten × 2 Labels × 2 Schriftzustände, Chromium + WebKit) |
| B6 CLS beim Swap | Swap-Matrix in `smoke.spec.ts` (echte Daten, 412/360, 4 Fallbacks, nur Verschiebungen nach `release()`), Swap-Test in `perf.spec.ts` (Paket C) |
| B7 Überlappung, Wortbruch, Abschneiden, ovale Pillen | `expectTextFits` in jedem `expectMobileUx`-Lauf (100 %) und in allen 320-px/200-%-Tests, Fixtures und echte Daten |
| B7 bei 100 %: Knöpfe zweizeilig bei 320 px | `expectTextFits` Prüfung 5 im 320-px-Test, u. a. Merkliste und `detail-regelmaessig` (nur Fixtures, nie echte Daten) |
| B8 „Freier Tag“ hinter dem Horizont | `agenda.test.ts`, `calendar.spec.ts` |
| H1 Tab-Leiste verdeckt quer den Inhalt | `layout.spec.ts` (915 × 412, 852 × 393, 568 × 320) |
| Helle Inseln im Dunkelmodus (H4, Nachtrag 5) | `expectNoBrightIslands` in allen Dunkel-Gates, über System-Dunkel und `data-theme="dark"`; Toast-Test mit angehaltener Uhr; `.hint.ok`-Erwartung im Kind-Sheet |
| H6 Ort doppelt | `site-data.test.ts` inkl. ICS-`LOCATION` |

- Budgets bleiben (JS 90 kB, CSS 15 kB). Erwartet sind CSS +≈ 0,5–1 kB in B (Container-Queries, Tokens) und +< 1 kB in C (Faces), JS +< 0,5 kB in A. Gemessen wird in den Schritten 5 und 9, das Ergebnis steht in „Umsetzung“.
- `@fontsource-variable/roboto` ist eine devDependency, sie wird nur von `e2e/vitals.ts` und `scripts/font-fallback.ts` per `createRequire(import.meta.url).resolve(…)` gelesen. Sie landet nie in `dist/`: `src/` importiert sie nicht, und die Route liefert sie nur im Test aus. Erkennt knip die Nutzung nicht, kommt sie mit Kommentar-Begründung in `ignoreDependencies` (ADR 0004 verlangt eine Begründung im Code und im Commit).
- `docs/architecture.md`, Mobile-UX-Gates, bekommt vier Zeilen: das Text-Gate (E10), das Gate gegen helle Inseln im Dunkelmodus (E15) und die Layoutregel für große Schrift (E7) von Paket B, den Swap-Test je Fallback (E12) von Paket C.

## Schritte

Jeder Schritt ist erst fertig, wenn sein Fertig-Kriterium erfüllt ist. **Playwright läuft immer nur an einer Stelle zur Zeit:** erst B (Schritt 3), dann C (Schritt 4), dann das Zusammenführen von A und B (Schritt 5). Danach wird C getrennt zusammengeführt (Schritt 9).

0. **Voraussetzung:** Plan 0006 ist auf `main` (`e6ea878`), dieser Plan ist darauf rebased.
   *Fertig:* erledigt (`d70c434` und Folge-Commit).
1. **`/plan-review`**, Review hier einarbeiten.
   *Fertig:* Review-Abschnitt vorhanden, kein Blocker offen (erledigt, siehe unten; Freigabe durch den Koordinator).
2. **Paket A** (Worktree `.claude/worktrees/nacharbeit-0007-a`, `pnpm install`, kein Playwright):
   1. Domäne test-first, jeweils erst der rote Test: `sameMinute` → `matchesFilter` → `endedOnDay` → `dayAgenda` → `registrationPhase` → `venueAddress`.
   2. `format.ts` test-first (B1 inkl. Leerfall, B4, H8 inkl. „vorbei“).
   3. `useNow`, `use-offer-views.ts` (+test, `endedToday`), `CalendarView.tsx` (inkl. Scroll-Ausgleich E5), `DetailDialog.tsx`, `App.tsx`.
   4. E2E-Specs schreiben (laufen nicht lokal).
   5. `docs/ideas.md` und Verweise in Plan 0003.

   *Fertig:* `pnpm check:fast` grün, jede neue Funktion hat einen Unit-Test, Coverage `src/domain` ≥ 90 % (`pnpm test:coverage`), `pnpm typecheck` grün für die neuen Specs, Commit auf `nacharbeit-0007-a`. Push erlaubt (CI läuft auf dem Branch, ohne Deploy). Die Branch-CI führt auch A's E2E aus. Sind dort nur A's neue Specs rot, blockiert das A nicht, denn die Korrektur gehört zu Schritt 5. A darf das CI-Protokoll aber nutzen, um offensichtliche Fehler gleich zu beheben.
3. **Paket B** (Worktree `.claude/worktrees/nacharbeit-0007-b`, `pnpm install`, darf Playwright):
   1. **Messen:** Mindestbreite der Kopfzeile je Kind-Label in Chromium und WebKit (`offsetWidth` von `.brand`, `.kid`, Knopf, Abstände, mit Webfont und mit blockierter Webfont). Werte in den Commit.
   2. **Gates zuerst:** `expectTextFits` und `expectNoBrightIslands` schreiben, auf dem alten CSS laufen lassen. Rot wie in E10 und E15 verlangt, Meldungen in den Commit (Kanarienvogel). Dann `layout.spec.ts`: rot bei 360–370 px (Kopfzeile) und bei 915 × 412 (Querformat).
   3. **CSS** nach E6, E8, E9, E10 (`hyphens`), E11 (nur Kachel-Layout), E13, E14 und E15, `Chrome.tsx` (Span, `at-N`), `SavedView.tsx`-Label. Danach alle Gates grün, ohne Ausnahmen.
   4. `scripts/screenshots.ts --text=200`, `docs/architecture.md` (Bs Zeilen).

   *Fertig:* `pnpm check` komplett grün inklusive E2E. WebKit lokal ggf. ohne `iphone-15` (CLAUDE.md), dann muss die Branch-CI WebKit grün zeigen. Budgets eingehalten. Commit und Push auf `nacharbeit-0007-b`, CI grün (`gh run watch`).
4. **Paket C** (derselbe Agent wie B, neuer Worktree `.claude/worktrees/nacharbeit-0007-c`, Branch `nacharbeit-0007-c` vom Ende von `nacharbeit-0007-b`):
   1. `@fontsource-variable/roboto` als devDependency, `scripts/font-fallback.ts`, Messung auf Bs Layout. Werte in den Commit.
   2. `e2e/vitals.ts` und die Swap-Matrix **zuerst**, auf dem alten `tokens.css` laufen lassen. Kanarienvögel: Roboto bei 412 px rot (≈ 0,11), künstlicher Shift nach `t0` wird gezählt, `useOnlyFallback` zählt die erwarteten Blöcke, `holdWebfont` hat gegriffen.
   3. Roboto-Faces und Buckets nach Messung in `tokens.css`, ggf. `--font-display`. Swap-Matrix grün.
   4. `perf.spec.ts` und der LCP/CLS-Test im Smoke-Test auf die Helfer umstellen, `docs/architecture.md` (Cs Zeile).

   *Fertig:* `pnpm check` komplett grün, Budgets eingehalten, Commit und Push auf `nacharbeit-0007-c`, Branch-CI grün. **Nicht** nach `main`, das passiert in Schritt 9.
5. **A und B zusammenführen** (ein Worktree, darf Playwright, erst nach Schritt 4):
   - B nach `nacharbeit-0007` übernehmen, A darauf rebasen.
   - `pnpm check` komplett. Erst jetzt laufen A's E2E-Specs, und das Text-Gate prüft A's neue Leerzustände.
   - Fehler beheben; im Zweifel gilt dieser Plan.
   - Budgets messen und hier eintragen, dazu Ergebnisse und Messwerte von A und B (Abschnitt „Umsetzung“).

   *Fertig:* `pnpm check` grün, Budget-Zahlen notiert.
6. **`/arch-review`** über A + B: Pflicht wegen des neuen Moduls (`registration.ts`), des neuen Hooks und > 200 Zeilen. Befunde einarbeiten und hier anhängen.
   *Fertig:* kein Blocker offen, `pnpm check` weiter grün.
7. **Commit und Push**, Fast-Forward nach `main`.
   *Fertig:* CI auf `main` grün (`gh run watch`), Deploy durch, https://zwergenplan.app/data/meta.json zeigt den neuen Commit.
8. **`/browser-review live`** auf https://zwergenplan.app/ mit echten Daten. Jede Checklisten-Zeile beantworten, dazu einzeln:
   - B1: Detail einer 14-täglichen Reihe zeigt die Uhrzeit.
   - B2: Kalender nach 18 Uhr mit „Heute“; nachmittags ein laufender Termin sichtbar; Tab offen lassen, nach Ende des Termins verschwindet er ohne Neuladen.
   - B3: 320 px, Kalendertage in Woche und Monat ≥ 44 px.
   - B4: Detail mit abgelaufener Frist.
   - B5: Kopfzeile bei 320/360/375/390/412 einzeilig, Theme-Knopf ab 380 px.
   - B7: 320 px/200 %, Screenshots `--text=200` aller Ansichten; bei 320 px/100 % keine zweizeiligen Knöpfe (Merkliste, Detail regelmäßig); Titel trennen sauber („Sticker-heft“).
   - B8: Tag nach dem letzten Termin.
   - E5: „Ganzen Monat zeigen“ antippen, der Knopf bleibt unter dem Finger bzw. sichtbar und fokussiert, auch ganz oben auf der Seite.
   - H1: quer 915 × 412 Seitenleiste links, erste Karte sichtbar; iPhone quer mit Notch-Einzug.
   - H7: Filter-Sheet auf dem iPhone, der Fuß klebt unten über der Home-Leiste.
   - Dunkelmodus, über System und über die Darstellungs-Wahl: keine hellen Inseln bei Toast, gewähltem Tag, gewählten Chips und Alters-Hinweis (Kind-Sheet).

   - H6: Einen schon importierten Termin erneut aus der statischen ICS importieren (Google und Apple Kalender) und notieren, ob der Ort aktualisiert wird (ohne `SEQUENCE` wohl nicht, E4).

   Dazu H3, H5, H8 kurz. Ergebnis hier anhängen.
   *Fertig:* jede Zeile beantwortet, keine neuen Blocker.
9. **Paket C zusammenführen:** `nacharbeit-0007-c` auf `main` rebasen. Konflikte kann es nur in `tokens.css`, `smoke.spec.ts` und `architecture.md` geben, und nur, wenn Schritt 5 dort etwas geändert hat; Bs Teile gewinnen, Cs Teile kommen dazu. `pnpm check` komplett, Budgets eintragen. `/arch-review` über C (neue devDependency, neues Skript, neues Testmodul). Push, Fast-Forward nach `main`.
   *Fertig:* kein Blocker offen, CI auf `main` grün, Deploy durch.
10. **`/browser-review live` für B6:** Webfont im Netzwerk-Tab blockieren bzw. verzögern, CLS bei 412 und 360 px. Auf einem echten Android-Gerät prüfen, ob „Bricolage Fallback Roboto“ greift (Remote-Debugging, „Rendered Fonts“). Ergebnis hier anhängen.
    *Fertig:* beantwortet, keine neuen Blocker. **Danach darf Plan 0004 starten.**

## Akzeptanzkriterien

- B1–B8 und die übernommenen Hinweise sind umgesetzt wie in E1–E16 beschrieben und jeweils durch einen Unit- bzw. E2E-Test abgedeckt (Tabelle in „Backpressure“).
- `expectTextFits` läuft in jedem `expectMobileUx`-Aufruf und in allen 320-px/200-%-Tests (Fixtures und echte Daten; Prüfung 5 nur mit Fixtures). Vor den CSS-Korrekturen war es nachweislich rot (Commit-Message).
- Kopfzeile einzeilig zwischen 320 und 420 px, belegt durch `layout.spec.ts` in Chromium und WebKit.
- Im Querformat verdeckt die Tab-Leiste keinen Inhalt (Seitenleiste) bzw. ist höchstens 56 px hoch (kompakt), belegt durch `layout.spec.ts`.
- `expectNoBrightIslands` läuft in allen Dunkel-Gates über beide Dunkel-Wege und war vor der Korrektur für den Kalender und den Toast-Test rot.
- Die Agenda „Heute“ wird auch in einem offen gebliebenen Tab richtig, ohne Neuladen (E2E mit Fake-Uhr).
- CLS < 0,05 beim Swap mit zurückgehaltener Webfont, bei 412 und 360 px, für Roboto immer und für Arial/Noto/DejaVu, soweit installiert. Kein Fallback wird übersprungen, der auf CI vorhanden ist.
- `pnpm check` grün, CI grün auf `main`, Budgets eingehalten und notiert, `docs/architecture.md` und `docs/ideas.md` nachgeführt.
- `/browser-review live` mit B1–B8 einzeln beantwortet (Schritte 8 und 10).

## Risiken

- **Abgeleitete Kopfzeilen-Breite:** K und c stammen aus einer Rechnung, die am Review-Befund geeicht ist. Schritt 3.1 misst zuerst. Der Test über acht Breiten und zwei Labels ist der Beweis, und der Ausweg (Logo verkleinern) steht in E6.
- **Fehlalarme des Text-Gates:** Rotationen, Zeilenhöhe < Glyphenhöhe, versteckte Texte, Scroll-Leisten und positionierte Elemente sind in E10 ausdrücklich behandelt. Taucht ein neuer Fehlalarm auf, wird die *Regel* mit Begründung präzisiert (im Code und im Commit). Eine Ausnahme per Selektor gibt es nicht.
- **`local("Roboto")` auf Android:** Chromium unterstützt `local()` auf Android über seine Tabelle eindeutiger Schriftnamen. Ob die variable System-Roboto über `local("Roboto")` im Bold-Bucket das Gewicht richtig wählt, ist nur auf einem echten Gerät prüfbar (Schritt 10). Greift es nicht, bleibt das Layout-Maß (E11) als Puffer, und der Befund geht zurück in diesen Plan.
- **CSS-Umschreiben im Test** (`useOnlyFallback`) hängt am Minifier-Format der `@font-face`-Blöcke (Lightning CSS lässt Anführungszeichen in `local()` weg). Die Funktion zählt die umgeschriebenen Blöcke je Familie, und `expectOnlyFallback` prüft über `document.fonts`, dass nur die gewählte Familie geladen ist. Ein still nur teilweise umgeschriebenes CSS fällt also auf.
- **`useNow` und Fake-Uhr:** Der E2E-Test für das Erneuern von „jetzt“ hängt an der Playwright-Uhr (`pauseAt`, `setFixedTime`, `runFor`), deren Verhalten aus dem Quelltext von `playwright-core` 1.63 abgeleitet ist. Paket A kann den Test nicht laufen lassen. Verhält sich die Uhr in Schritt 5 anders, bleibt der Fall über `visibilitychange` (ohne Timer) als zweiter Weg.
- **`hyphens: auto` in Titeln** kann Wörter trennen, die Plan 0003 E5 ungetrennt wollte („Nürn-berg“). Das passiert nur, wenn das Wort nicht in die Zeile passt; vorher brach `overflow-wrap: anywhere` an beliebiger Stelle. Der Browser-Review sieht sich die Titel bei 320 px an.
- **Container-Queries** brauchen Chrome ≥ 105 und Safari ≥ 16. Das ist für die Zielgruppe (aktuelle Telefone) gegeben. Ältere Browser zeigen das bisherige Layout ohne Umschalten (kein Totalausfall).
- **Zusammenführen:** A's E2E-Specs laufen erst in Schritt 5. Brechen sie dort, liegt die Korrektur im Merge-Worktree, nicht in zwei parallelen Nachbesserungen. C kommt getrennt (Schritt 9); bis dahin ist B6 live noch offen, und Plan 0004 wartet auf Schritt 10.
- **Seitenleiste im Querformat:** `body`-Innenabstand und feste Leiste hängen an `env(safe-area-inset-left)`. Ob die Leiste auf einem iPhone mit Notch richtig sitzt, zeigt nur ein echtes Gerät (Schritt 8). Ausweg: dieselbe Media-Query mit größerem Abstand.
- **Gelb als Auswahlfarbe im Dunkeln** (E15) ändert den Look gewählter Tage und Chips. Kontrast und axe sind unkritisch (`#13212E` auf `#FFD93B`). Gefällt es nicht, bleibt die Token-Stelle die einzige Stellschraube.
- **Datenänderung durch H6:** Die statischen ICS bekommen eine andere `LOCATION`. Die UIDs bleiben; ohne `SEQUENCE` übernehmen viele Kalender den korrigierten Ort beim erneuten Import nicht (E4). Bereits importierte Termine bleiben dann wie sie sind, das ist hinnehmbar.

## Review (2026-10-04, plan-reviewer) – Verdict: Überarbeiten → eingearbeitet

Der Review lief auf `d70c434` (Plan auf `main` rebased). Zwei Blocker, sechs wichtige Punkte und sieben kleinere; der Koordinator hat entschieden, was übernommen wird.

Blocker:
- **B1 Prüfung 1 von `expectTextFits` hätte Titel bei 200 % fälschlich rot gemacht.** Die Grenze „≤ 12 Zeichen“ trifft „Stickerheft“ (`.ptitle` 2 rem), „Krabbeltreff“, „Fingerspiele“, „Babymassage“ (`.ctitle` 1,375 rem, `.dtitle` 1,875 rem), die bei 200 % breiter als die Spalte sind. → **Übernommen:** Die Regel misst jetzt die Breite. Verstoß ist ein gebrochenes Wort, dessen ungebrochene Breite ≤ 70 % der Spaltenbreite ist (`min(innerWidth, 640) − 32`). Gemessen wird gegen die Spalte und nicht gegen den eigenen Container, weil die zu schmalen Container (Tab, Knopf, Tageszelle) genau der Fehler sind (E10). Dazu `hyphens: auto` auf `.ptitle`, `.dtitle`, `.ctitle`, `.sheet h2`, `.empty b` (`lang="de"` ist gesetzt); das ändert Plan 0003 E5 mit Begründung.
- **B2 Das Monatsraster bleibt bei 320 px unter 44 px**, und die Ansicht `kalender` öffnet den Monat. Das neue Touch-Gate bei 320 px wäre also rot geblieben. → **Übernommen:** `.month { margin-inline: -16px; padding-inline: 0 }` unter 360 px. Nachgerechnet: (320 − 2 × 2) / 7 = 45,1 px (vorher (288 − 4 − 8) / 7 = 39,4 px). Die Woche bleibt bei 44,6 px (E9).

Wichtig:
- **M3 Dunkel-Tokens stehen doppelt** (`@media` und `data-theme`). → **Übernommen:** Neue Tokens in beide Blöcke, `.hint.ok`/`.hint.bad` über Tokens statt fester Farben. `expectNoBrightIslands` läuft zusätzlich mit `data-theme="dark"` (gesetzt per `localStorage` vor dem Laden, weil der Theme-Knopf unter 380 px fehlt). Dazu eine gezielte Erwartung an `.hint.ok` (E15).
- **M4 Toast nicht deterministisch** (2,8 s). → **Übernommen:** Eigener Test „Toast im Dunkeln“ mit `page.clock.pauseAt` nach dem Laden. Die Fixture-Uhr ist per `setFixedTime` schon installiert, `pauseAt` hält auch die Timer an (aus `playwright-core` 1.63 gelesen). Danach `runFor(3000)` prüft das Verschwinden (E15).
- **M5 Swap-Messung zu ungenau.** → **Übernommen:**
  - Die gewählte Fallback-Familie wird vor `release()` per `document.fonts.load` geladen, normal und fett. Die Test-Roboto bekommt `font-display: block`.
  - CLS zählt nur Einträge ab `t0` (direkt vor `release()`).
  - `useOnlyFallback` erfasst `local()` mit und ohne Anführungszeichen (Lightning CSS) und zählt die umgeschriebenen Blöcke je Familie.
  - `expectOnlyFallback` prüft per `document.fonts`, dass nur die gewählte Familie geladen ist (E12).
- **M6 B2 nur nach Neuladen richtig.** `now` entstand einmal je Mount (`App.tsx` Z. 35). → **Übernommen:** `useNow` in `use-app-state.ts` (Paket A).
  - Erneuert wird alle 30 s und bei `visibilitychange`, der Zustand ändert sich nur beim Minutenwechsel.
  - Bestehende Kacheln animieren nicht neu (`useState(ctx.animate)`), und `calendar.day` wird auf heute geklemmt.
  - Vitals bleiben unberührt: Unter der Fake-Uhr wechselt die Minute nie, sonst frühestens nach 30 s.
  - E2E mit `pauseAt`/`setFixedTime`/`runFor` und zusätzlich über `visibilitychange` (E2, Tests).
- **M7 Sticky-Fuß mit negativem `bottom`** rechnet je nach Browser anders. → **Übernommen:** `bottom: 0`, der Fuß trägt `padding-bottom: calc(18px + env(safe-area-inset-bottom))` selbst, das Sheet verliert seinen unteren Innenabstand. iPhone-Prüfung im Browser-Review (E13, Schritt 8).
- **M8 Prüfung 5 mit echten Daten** könnte den Deploy wegen eines langen Anbieternamens rot machen. → **Übernommen:** Option `buttons: false`, im Smoke-Test immer gesetzt (auch über `expectMobileUx(page, { buttons: false })`). Prüfung 5 läuft nur mit Fixtures (E10).

Kleiner:
- **m9 Veraltete Zeilenangaben** (Ursache: `cat -n` über mehrere Dateien zählte durch). → **Übernommen:** Alle Angaben gegen den rebasten Stand geprüft und korrigiert: `base.css` Z. 18, `tabs.css` Z. 5–40/59–74, `mobile-ux.spec.ts` Z. 58–69/64–66, `smoke.spec.ts` Z. 16/36–38/54–85, `use-offer-views.ts` Z. 66/74. Wo sinnvoll stehen Test- oder Selektornamen dabei.
- **m10 Leerfälle in Texten.** → **Übernommen:** Uhrzeit nur bei mindestens einem kommenden Termin (`uniformTimes([])` ist wahr). Ein beendeter Kurs heißt „Kurs mit 8 Terminen – vorbei“, nie „noch 0 von 8“ (E1, E4, Unit-Tests).
- **m11 „Morgen geht's weiter.“** stimmt nicht immer. → **Übernommen:** „Die nächsten Tage stehen oben in der Woche.“ (E2).
- **m12 `layout.spec.ts` mit `getBoundingClientRect`** misst gedrehte Elemente zu hoch. → **Übernommen:** nur `offsetTop`/`offsetHeight` (E6, Tests).
- **m13 Monatsknopf springt** beim Ausblenden der Woche um ≈ 130 px. → **Übernommen:** Der Knopf bleibt dasselbe Element (Fokus bleibt). Scroll-Ausgleich per `useLayoutEffect` hält ihn an derselben Stelle, sonst folgt `scrollIntoView({ block: "nearest" })`. E2E prüft den Fokus, der Browser-Review das Springen (E5, Schritt 8).
- **m14 Die 32 Adressen in `data/providers.yaml` gleich mit bereinigen.** → **Abgelehnt:** Datenpflege läuft über den Skill `babyevents-nuernberg` und einen Pipeline-Lauf (ADR 0006), nicht in einem UI-Plan. H6 korrigiert die Anzeige in `toSiteData`. Neuer Eintrag in `docs/ideas.md`: „Katalog-Adressen ohne Ortsnamen-Präfix + Warnung in validate-data“ (E4, E17).
- **m15 Scope zu groß, B6 abtrennen.** → **Anders gelöst:** B6 bleibt in Plan 0007, wird aber ein eigenes **Paket C** (Font-Swap). Es läuft nach B durch denselben Playwright-Agenten auf `nacharbeit-0007-c` (vom Ende von B), wird getrennt zusammengeführt (Schritt 9) und live geprüft (Schritt 10). Die Dateilisten in E16 überschneiden sich zeitlich nicht. `tokens.css`, `smoke.spec.ts` und `architecture.md` ändern B und C nacheinander, je mit klar zugeordneten Blöcken: B die Farb-Tokens, C die `@font-face`-Fallbacks. Die Kachel-Layoutmaßnahme aus E11 bleibt in B, weil sie auch B7 hilft.

## Review 2 (2026-10-04, plan-reviewer) – Verdict: Freigabe mit Änderungen → eingearbeitet

Der zweite Review lief auf `82d0e68`. Die Abweichung zu Blocker 1 aus Review 1 (70 % der **Seitenspalte** statt des eigenen Containers) ist bestätigt. Alle 16 Punkte sind übernommen:

1. **(Blocker, C) Gefälschte Zeitbasis.** Die Fake-Uhr ist in jedem Test installiert (`fixtures.ts` Z. 26) und ersetzt `performance.now/mark/getEntries*`. → `t0` kommt nativ aus `new Event("zp").timeStamp` (ersatzweise `document.timeline.currentTime`). `vitals.ts` nutzt diese `performance`-Methoden nie, mit Kommentar dazu. Ein dauerhafter Kanarienvogel in `perf.spec.ts` verlangt, dass ein künstlicher Shift direkt nach `t0` gezählt wird. Geprüft: `perf.spec.ts` und der LCP/CLS-Test in `smoke.spec.ts` nutzen nur `PerformanceObserver` (native `startTime`) und sind nicht betroffen (E12).
2. **`theme.spec.ts` überspringt nur unter 360 px**, `android-klein` ist 360 px breit. → Die Datei gehört zu Paket B, die Schwelle wird 380 px (E16, Tests).
3. **`sr-only`-Legenden machen Prüfung 2 rot.** → Die Ausnahme für visuell Verstecktes gilt jetzt für alle fünf Prüfungen von `expectTextFits` (E10).
4. **Prüfung 3 zu grob.** → Geprüft werden nur sichtbare Rundungen (Hintergrund, Bild oder Rand). Radien werden je Ecke gelesen, `%`-Werte aufgelöst und nach CSS-Regel skaliert. `.mday` bekommt `border-radius: 22px` statt 50 %, damit der gewählte Tag bei großer Schrift nicht oval wird (E8, E10).
5. **„Für heute ist alles vorbei“ greift nicht für Einzeltermine**, denn der Index enthält nur Angebote mit kommendem Termin. → Neue Domänenfunktionen `matchesFilter` (`filter.ts`) und `endedOnDay` (`agenda.ts`), beide mit Unit-Tests. `dayAgenda` nimmt `endedToday` aus allen filterpassenden Angeboten, ohne die Bedingung `nextSession`. An den Fixtures geprüft: Am Mo 5.10. 12:00 ist der Tag leer, das Elterncafé (9–10 Uhr) zählt als beendet. Ein E2E prüft das. Weil das der Startzustand jedes Kalender-Tests ist, läuft der Leerzustand durch die Mobile-Gates der Ansicht `kalender` (E2, Tests).
6. **Tageswechsel als E2E.** → Ablauf: `setFixedTime` Mi 23:59:40 → `pauseAt` → `setFixedTime` Do 00:00:10 → `runFor(30_000)`. Erwartet: „Heute, 8. Oktober“, der 7.10. ist gesperrt, der gewählte Tag geklemmt (Tests).
7. **Kanarienvogel mit falscher Spezifität.** → `.hdr .kid { margin-left: -40px }` kommt per `addStyleTag` und bleibt als dauerhafter Test (E10).
8. **`layout.spec.ts` ohne ausdrückliche Projektwahl.** → `test.skip` nach `testInfo.project.name`, nur `pixel-7` und `iphone-15` (E6).
9. **`sameMinute`** liegt jetzt in `src/domain/time.ts` mit Unit-Test, in Paket A (E2, E16).
10. **`visibilitychange`-Fall als eigener Test** mit frischer Seite und angehaltener Uhr (Tests).
11. **`expectNoBrightIslands` prüft auch `::before`/`::after`** (E15).
12. **Toast im Querformat:** Eine konkrete CSS-Regel stellt den Toast mittig über die Inhaltsspalte rechts der Seitenleiste. `layout.spec.ts` prüft, dass er über `main` liegt und `.tabs` nicht überlappt (E14).
13. **Zusätzlicher Lauf 863 × 360 bei 200 %** mit `expectTextFits` und `expectNoHorizontalScroll` in `layout.spec.ts` (E14).
14. **Das einspaltige `.seg3`** bekommt in der Container-Query `border-radius: 22px` (E8).
15. **H6 abgeschwächt:** Ohne `SEQUENCE` und mit gleichem `DTSTAMP` übernehmen viele Kalender den korrigierten Ort beim erneuten Import nicht. Der Browser-Review prüft das (E4, Risiken, Schritt 8).
16. **Paket C und `--font-display`:** Die Zuordnung der Überschriften steht als eine `:where(…)`-Regel in `tokens.css`, damit C Bs Komponenten-Dateien nicht anfassen muss. Falls doch einzelne `font-family`-Zeilen nötig sind, sind die Dateien in Cs Liste benannt. B und C ändern sie nacheinander, mit klar zugeordneten Teilen (E11, E16).

## Umsetzung (Schritt 5, 2026-10-04)

Pakete A (`nacharbeit-0007-a`) und B (`nacharbeit-0007-b`) sind in `nacharbeit-0007` zusammengeführt. Paket C (B6) ist offen. Die Einzelheiten stehen in den Commit-Messages, hier die Abweichungen vom Plan mit je einem Satz Begründung.

**Abweichungen Paket B**
- **H7 ohne `sticky` (E13):** Das Sheet ist eine Flex-Spalte, `.sheet-scroll` scrollt, und `.sheetfoot` steht als Geschwister darunter; ein klebender Fuß verdeckte gescrollte Chips, und axe meldete sie als zu kleine Ziele (`target-size`, Filter-Sheet bei 320 px/200 %). Dafür bekam `Sheets.tsx` die Hülle `.sheet-scroll`, der Inhalt ist unverändert.
- **Container `sheet` auf `.sheet-scroll` statt `.sheet-body` (E8):** Der scrollende Teil hat die Breite, an der das Darstellungs-Segment umschaltet; `.sheet-body` ist jetzt nur noch die Flex-Spalte.
- **`.sheetfoot`-Knöpfe `flex: 1 1 auto`, `.sheetfoot.single` entfällt (E8):** Mit der Basis 7 rem wäre „8 Angebote zeigen“ bei 320 px zweizeilig; jetzt stehen beide Knöpfe einzeilig nebeneinander (ab ≈ 390 px) oder untereinander.
- **`.two` ohne `nowrap` (E8):** Sonst ragt „Alle 5 Termine“ bei 200 % heraus; mit `flex-wrap` und Basis = Textbreite stehen die Knöpfe einzeilig nebeneinander oder untereinander.
- **Prüfung 1 ohne `/` als Trennstelle (E10):** Chromium und WebKit brechen nicht am Schrägstrich, „Gostenhof/Himpfelshof“ ist ein langes Wort, und echte Daten meldeten sonst „Himpfelshof“ fälschlich.
- **Prüfung 4 mit Toleranz > 1 px (E10):** `offset*` ist ganzzahlig gerundet; mit 0,5 px meldeten `.tabs` und `.mgrid` schon bei 100 % Rundungsfehler.
- **„Versteckt“ nur bei ≤ 1 px *und* Abschneiden (E10):** Die 0 px hohe `aria-live`-Hülle des Toasts hätte den sichtbaren festen Toast sonst aus allen Prüfungen genommen.
- **Prüfung 5 je Elternelement (E10):** React teilt „Nur {Tag}“ in zwei Textknoten; Knoten mit demselben Elternteil müssen zusammen einzeilig sein.
- **Zusätzliche Ansicht `kalender-woche` (Tests):** Bei offenem Monat blendet Paket A die Woche aus (E5), B3 misst aber beide Raster.
- **`.card` als Container, `@container card (width < 12rem)` blendet `.pill .mini` aus (E8):** Neben dem Herz fehlt bei 200 % der Platz für Form plus „Spielgruppen“; bei 100 % sind Kacheln ≥ 283 px, die Regel greift dort nie.
- **Wochen-Navigation (`.cal-nav`) als Container (E8, gefunden in Schritt 5):** Unter 14 rem steht der Titel über den Pfeilen, sonst brach „Dezember“ bei 320 px/200 % mitten im Wort; der B8-Test prüft das jetzt bei 320 px/200 %.
- **Knopffarbe `var(--ink)` statt `inherit` (`base.css`), `.card` mit eigener Textfarbe:** WebKit behielt bei hellem System und gewählter dunkler Darstellung für geerbte Farben bis zur nächsten Stil-Neuberechnung Schwarz (axe: 40–47 Kontrastfehler, schon auf dem alten Stand nachgestellt).
- **Kopfzeile stärker gestrafft als in E6:** Logo 34 → 30 px, Kopf-`gap` 8 → 6, `.brand`-`gap` 8 → 6, Kind-Chip rechts 14 → `max(10px, 0.5em)` und `gap` 6 → 4, Gesicht 30 → 26 px, Marke `5.4vw + 0.1rem` statt `5.6vw` und Laufweite −0,05 em; die Schwelle bleibt 21,75 rem (380 px).
- **layout.spec hält die Webfont zurück statt `abort()`:** Ein Abbruch ist ein Konsolenfehler und macht jeden Test rot; der Schriftzustand wird über `FontFace.status` geprüft, weil WebKits `fonts.check()` bei ladender Schrift `true` meldet.

**Abweichung Paket A:** Der Leerzustand „Weiter reicht der Plan noch nicht“ nutzt das Symbol `search`; ein Kalender-Symbol hätte `EmptyState` in `ListView.tsx` geändert, das keinem Paket zugeordnet war.

**Messwerte Kopfzeile (B5)**, natürliche Breiten mit sichtbarem Theme-Knopf:

| | vorher: einzeilig ab | nachher: Reserve bei 380 px |
|---|---|---|
| Chromium, Webfont, „23 Mon.“ | ≈ 400 px | 14 px |
| Chromium, Fallback, „23 Mon.“ | ≈ 392 px | 18 px |
| WebKit, Webfont, „23 Mon.“ | ≈ 372 px | 35 px |
| WebKit, Fallback, „23 Mon.“ | ≈ 412 px | 22 px |
| alle, „Alter?“ | 350–388 px | ≥ 31 px |

Abgeleitet: c ≈ 6,0 statt 5,5, K(„23 Mon.“) = 63 px. Die Kopfzeile ist überall 64 px hoch.

**Budgets** (gzip, `pnpm size`, kombinierter Stand): JS 82,67 / 90 kB (Paket A allein 82,66 kB, vorher 81,82 kB), CSS 9,40 / 15 kB (Paket B allein 9,36 kB, vorher 8,5 kB), Daten 80,1 / 250 kB.

**Ergebnis Schritt 5:** `pnpm check` grün, auch E2E in allen sechs Projekten lokal (WebKit mit `libavif16`).
- Unit-Tests: 268 grün, Coverage 98,4 % der Anweisungen.
- E2E: 451 Tests, 404 bestanden, 47 gewollt übersprungen, 0 rot. Je Projekt 89 Tests: android-klein 74 bestanden / 15 übersprungen, pixel-7 87 / 2, iphone-15 86 / 3, pixel-7-quer 75 / 14, desktop 76 / 13; smoke-echte-daten 6 / 0.
- As bis dahin ungetestete Specs (`calendar.spec.ts`, `detail.spec.ts`) waren beim ersten Lauf grün, auch fünffach wiederholt in allen fünf Fixture-Projekten (575/575).
- In den Screenshots gefunden und behoben: „Dezember“ in der Wochen-Navigation bei 320 px/200 % (siehe oben).


## Browser-Review live (2026-10-04, Pakete A+B)

**Ziel:** https://zwergenplan.app/, Stand `2d9b925` laut `data/meta.json`. Echte Daten: 333 Angebote, 83 Anbieter, Datenstand 4.10. 14:05. Geprüft am 4.10. zwischen 23:05 und 23:40 durch einen Subagenten, ohne lokalen Server.

**Methode:**
- **Screenshot-Matrix:** `node scripts/screenshots.ts https://zwergenplan.app/`, dazu ein zweiter Lauf mit `--text=200`.
  - 144 Bilder: 320/360/365/390/412/915 quer × hell/dunkel × start, kalender, merkliste, detail, filter, kind, je bei 100 % und 200 %.
  - Jedes Bild wurde angesehen, je vier Bilder auf einem Kontaktbogen.
- **Interaktiv** mit Playwright gegen die Live-URL, in Chromium mobil und WebKit, mit `Europe/Berlin` und `de-DE`. Die Skripte liegen unter `$CLAUDE_JOB_DIR/tmp`.
  - Die **Gates des Projekts liefen auf echten Daten.** Je Engine waren es 48 Kombinationen: 320/412 px × hell/dunkel/dunkel per Darstellungswahl × 8 Ansichten (start, woche, monat, merkliste, detail regelmäßig, detail kurs, filter, kind). Die Gates kommen aus `e2e/mobile-ux.ts`:
    - `expectNoHorizontalScroll`,
    - `expectTouchTargets`,
    - `expectAccessible`,
    - `expectTextFits` mit und ohne Knopf-Prüfung,
    - `expectNoBrightIslands`,
    - bei 320 px zusätzlich 200 %.
  - **Kalender** mit `page.clock.setFixedTime`.
  - **Detail** per Deep-Link.
  - **Kopfzeilen-Matrix** über 9 Breiten × 2 Kind-Labels × Webfont/Fallback.
  - **Querformat:** 915×412, 863×360 (auch bei 200 %), 852×393 und 568×320.
  - **Sheets:** Kind- und Filter-Sheet.
  - **Dunkelmodus** über beide Wege, dazu Umschalten ohne Neuladen.
  - **Zustände:** Laden (Daten verzögert), Fehler (Abbruch), leer.
  - **Navigation:** Zurück, Esc, Deep-Link, Neuladen.
  - **Vitals** nur in Chromium per CDP:
    - CLS beim Font-Swap mit zurückgehaltener Webfont,
    - LCP mit CPU 4× und 1,6 Mbit/s bei 150 ms.

### Checkliste
- **Lesbarkeit:** ok.
  - Karten erfassbar (Kategorie, Zeit, Titel, Ort, Fakten).
  - Detail: „Wann“ nennt jetzt die Uhrzeit (B1), „Wo“ ohne doppelten Ort (H6, Reste siehe Hinweis 6).
  - Bei 200 % stehen die Monatszahlen dicht an dicht (Hinweis 4).
- **Daumen-Erreichbarkeit:** ok.
  - Tab-Leiste und ICS-Fuß liegen unten.
  - Kalendertage bei 320 px: Woche 44,6 px, Monat 45,1 × 44 px (B3).
  - Filter-Fuß ohne Scrollen sichtbar (H7).
  - Touch-Gate in beiden Engines grün.
- **Zustände:** ok, ein Hinweis.
  - Laden zeigt drei Platzhalter und „Lade Angebote …“.
  - Fehler zeigt „Das hat nicht geklappt“ und „Nochmal versuchen“. Danach laden 40 Karten.
  - Leer: Filter ohne Treffer „Diese Seite ist noch leer“ samt „Filter zurücksetzen“. Leere Merkliste „Hier klebt noch nichts“.
  - Abends „Für heute ist alles vorbei“ (B2), nach dem Datenende „Weiter reicht der Plan noch nicht“ (B8).
  - Lange Titel brechen sauber.
  - Die Fehlermeldung zeigt den technischen Browsertext (Hinweis 7).
- **Dark Mode:** keine hellen Inseln, Insel-Gate über beide Wege und beide Engines grün. Aber: **WebKit mit „Bewegung reduzieren“ zeigt nach dem Umschalten 1–5 s lang Text ohne Kontrast** (Wichtig 1).
- **Micro-Interactions/reduzierte Bewegung:** ok.
  - `expectReducedMotion` ist grün.
  - Ohne Reduce laufen `peel` (3 s) und `pop` (400 ms).
  - Zurück und Esc schließen das Detail, Deep-Link-Schließen landet auf `/`.
  - Neuladen behält Ansicht und Filter.
- **Design-System:** ok, einheitlich. Gelb als Auswahlfarbe im Dunkeln (E15) wirkt stimmig.
- **Netzwerk:** ok.
  - Chromium: 5 Requests, nur `zwergenplan.app`, genau eine Schriftdatei, keine Konsolenfehler.
  - WebKit: 6 Requests, `site.json` doppelt, mit Konsolen-Warnung (Hinweis 2).
- **Gates auf echten Daten:**
  - 96 Kombinationen, davon 90 grün.
  - Rot ist nur `expectTextFits`, Prüfung 2 in der Ansicht „woche“ bei 320 px (beide Engines, alle drei Schemata): „Text ragt aus fieldset.plain: „28““. Das ist ein Fehlalarm des Gates (Hinweis 1).
  - 200 % bei 320 px ist in allen Ansichten grün.
- **Vitals:** LCP gedrosselt 1,82–1,84 s (Budget 2,5 s), FCP ≈ 1,52 s. CLS siehe B6.

### Befunde B1–B8
- **B1 ok.** Die Uhrzeit steht jetzt bei jeder Reihe mit einheitlicher Uhrzeit:
  - „Montags, 9:00–11:00“ (Offene Tür, Lücke von 4 Wochen),
  - „Donnerstags, 10:45–11:40“ (Barre, 14-täglich),
  - „Regelmäßig, 9:30–10:30“ (Pikler Mo/Di/Fr).
- **B2 ok.**
  - So 4.10. um 9:20: Der Termin 8:45–9:15 ist weg, der laufende 9:15–9:45 steht noch da (5 Angebote).
  - Um 20:00 sowie live um 23:10: „Für heute ist alles vorbei“.
  - Mo 5.10. um 16:40: nur noch laufende und kommende Termine (13). Um 20:00 ebenfalls „alles vorbei“.
  - **Ohne Neuladen:** Uhr bei offenem Tab von 9:20 auf 9:50 gestellt. Nach ≤ 32 s verschwindet 9:15–9:45, es bleiben 4.
  - Screenshot `b2-2026-10-05-20uhr-chromium.png`.
- **B3 ok.** 320 px in Chromium und WebKit: Woche 44,6 × 72 px, der gewählte Tag 49,5 px (Drehung), Monat 45,1 × 44 px.
- **B4 ok.** Waldspielgruppe „Die Eulenbande“ (Frist 2.10.): „Anmeldeschluss war am 2.10.“. Es ist der einzige Fall in den echten Daten.
- **B5 ok.**
  - Einzeilig und 64 px hoch bei 320, 360, 365, 370, 375, 380, 384, 390 und 412 px.
  - Geprüft in Chromium und WebKit, je mit „Alter?“ und „23 Mon.“, mit geladener und mit dauerhaft zurückgehaltener Webfont.
  - Der Theme-Knopf erscheint genau ab 380 px.
- **B6 offen, wie geplant (Paket C).** Nur notiert:
  - CLS beim Swap mit zurückgehaltener Webfont und Fallback Liberation Sans („Bricolage Fallback Arial“): **0,052 bei 412 px** (Quelle `.card .facts`) und **0,012 bei 360 px**, reproduzierbar.
  - Vorher waren es 0,070 mit Arial, jetzt knapp über dem Ziel von 0,05.
  - Roboto ist hier nicht gemessen.
- **B7 ok.**
  - **Bei 320 px und 200 %:**
    - Sticker überlappen nicht (in Breite gewachsen, scrollen).
    - Tabs zeigen nur Icons (alle `tab-label` ausgeblendet).
    - ICS-Knöpfe stehen untereinander und sind jeweils einzeilig.
    - Die Wochenleiste bricht in drei Zeilen (104 × 105 px je Tag).
    - Filter-Chips sind mehrzeilig als abgerundetes Rechteck (`r=22px`), ohne Abschneiden.
    - Die Kategorie-Pille ist zweizeilig mit `r≈22,7px`, nicht oval, und steht unter dem Sticker.
  - Die Wochen-Navigation zeigt „28. Sep. – 4. Okt.“ ohne Wortbruch.
  - **Bei 320 px und 100 %:** keine zweizeiligen Knöpfe. „Alle in den Kalender“, „Nur Mo 5.10.“ und „Alle Termine“ sind einzeilig, die Knopf-Prüfung ist mit echten Daten grün.
  - Text-Gate bei 200 % in beiden Engines grün. Screenshots `*-320-*-200.png`.
- **B8 ok.**
  - Nach 23 Wochenklicks steht die Woche bei 8.–14. März. „Weiter“ ist gesperrt, der Monat endet im März 2027.
  - Sa 13.3. zeigt 3 Angebote, So 14.3. „Weiter reicht der Plan noch nicht“ mit dem Text „Termine sind bis Samstag, 13. März eingetragen.“
  - Screenshot `b8-chromium.png`.

### Befunde H1–H8 und E5
- **E5 (H2) / m13 ok.**
  - Bei offenem Monat ist die Wochenleiste ausgeblendet.
  - Der Fokus bleibt auf dem Monatsknopf (`aria-expanded` wechselt), in beiden Engines, auch per Tastatur.
  - Ist die Seite gescrollt, steht der Knopf beim Öffnen und beim Schließen pixelgenau an derselben Stelle (100 → 100 px, `scrollY` 184 → 56 → 184).
  - Ganz oben rückt er beim Öffnen um 128 px nach oben (284 → 156) und bleibt sichtbar. Das ist laut Plan so gewollt.
- **H1 ok.**
  - **915×412:** Seitenleiste links (`tabs` 7–113 px, `main` ab 198 px). Die erste Karte steht bei y = 289 und ist sichtbar.
  - **863×360 und 852×393:** ebenso.
  - **Toast:** Er liegt mittig über der Spalte (Mitte 517 bzw. 491 px, die Spaltenmitte bei 518 bzw. 492 px) und überlappt die Leiste nicht. Das gilt in beiden Engines und auch bei 863×360 mit 200 %.
  - **568×320:** Die kompakte Leiste ist 56 px hoch.
  - **Bei 863×360 und 200 %** liegt die erste Karte unter dem Falz (y = 380–385). Der Plan verlangt das nur für 100 %.
  - **iPhone quer mit Notch: nicht prüfbar.** Playwright setzt `env(safe-area-inset-*)` auf 0, das braucht ein echtes Gerät.
- **H3 ok.** Kind-Sheet bei 320 px: Das Segment ist einspaltig (1 Spalte, 3 Zeilen), „Automatisch“ hat rundum Luft. Bei 360 px ist es dreispaltig mit 7,7 px (Chromium) bzw. 12,5 px (WebKit) Innenrand um „Automatisch“, knapp, aber sauber.
- **H4 ok.** Luminanz der Hintergründe im Dunkeln:
  - Toast 0,03,
  - Alters-Hinweis 0,068 (Chromium) bzw. 0,019 (WebKit), unter der Schwelle von 0,2.
  - Gewählter Tag, Monatstag und Chip 0,712 (Gelb, unter der Schwelle von 0,75).

  Das gilt über System und über die Darstellungswahl, in beiden Engines. Insel-Gate mit stehendem Toast grün. Zum WebKit-Umschalten siehe Wichtig 1.
- **H5 ok.** Regelmäßige Reihen zeigen „Alle Termine“, Kurse „Alle 4/6/8/10 Kurstermine“, einmalige „In den Kalender“.
- **H6 ok mit Rest.**
  - Detail und ICS-`LOCATION` sind korrigiert („Markuskirche / FreiRaum“ + „Frankenstraße 29, 90443 Nürnberg“, ICS `LOCATION:Markuskirche / FreiRaum\, Frankenstraße 29\, 90443 Nürnberg`).
  - Rest: 3 Orte in 9 Angeboten (Hinweis 6).
  - **Erneuter Import in Google/Apple Kalender: nicht prüfbar.** Das braucht echte Konten bzw. Geräte, muss also der Nutzer testen.
- **H7 ok.**
  - **Fuß sichtbar:** Er steht ohne Scrollen sichtbar bei 320×568, 320×640, 360, 365, 375×667, 380, 390 und 412.
  - **Zweizeilig:** Chromium bis 380 px, WebKit bis 360 px. Der Fuß ist dann 146 statt 84 px hoch, bei 320×568 bleiben 363 px Scrollfläche.
  - **Bewertung:** vertretbar. Beide Knöpfe sind einzeilig, groß und immer sichtbar, und die Zahl im Hauptknopf bleibt lesbar. Ein Gewinn wäre ein schmaler Textknopf „Zurücksetzen“ (Hinweis 5), nötig ist er nicht.
  - **iPhone mit Home-Leiste: nicht prüfbar** (siehe H1).
- **H8 ok.**
  - „Kurs · noch 1 von 6 Terminen“ und „Kurs · noch 5 von 10 Terminen“ (laufend).
  - „Kurs mit 4 Terminen“ (noch nicht begonnen).

### Neue Befunde

**Blocker:** keine.

**Wichtig**
1. **WebKit mit „Bewegung reduzieren“: Nach dem Theme-Umschalten bleibt Text 1–5 s in der alten Farbe**, also dunkel auf dunkel bzw. hell auf hell. Die WebKit-Korrektur aus Paket B (Knopffarbe `var(--ink)`, Kartenfarbe) reicht nicht.
   - **Betroffen:**
     - Marke „Zwergenplan“, „Alter?“,
     - Sticker-Labels,
     - Tagesüberschrift „Morgen“,
     - Zeit und Titel der Karten,
     - Theme- und Filter-Icon.
   - **Gemessen in Playwright-WebKit**, helles System, 412 px, Klick auf den Theme-Knopf: 18 Textknoten ohne Kontrast, axe rot.
     - Die Farben springen gestaffelt nach 340, 990, 3 900 und 4 650 ms um.
     - Zurück nach Hell: 9 Knoten, fertig nach 2,9 s.
     - Ein Ansichtswechsel behebt es sofort.
   - **Ohne Reduce** wechselt WebKit in ≈ 90–140 ms sauber, Chromium in beiden Fällen in ≈ 50–250 ms.
   - **Ursache (sehr wahrscheinlich):**
     - `src/ui/styles/motion.css` setzt unter `prefers-reduced-motion: reduce` `transition-duration: 0.01ms !important` auf `*`.
     - Die Vorgabe für `transition-property` ist `all`. Damit wird **jede** Stiländerung zu einer echten 0,01-ms-Transition (`body` meldet `transition: 0.00001s`), die WebKit erst verspätet abschließt.
     - Dasselbe zeigt sich beim Laden: Im hellen Modus sind Marke und Tagesüberschrift die ersten ≈ 0,5–1 s `rgb(0,0,0)` statt `#13212E`.
   - **Vorschlag:** unter Reduce `transition: none !important` bzw. `transition-duration: 0s` statt 0,01 ms, dazu ein E2E in WebKit, das 300 ms nach dem Umschalten axe bzw. `__darkText` prüft. Auf einem echten iPhone mit „Bewegung reduzieren“ gegenprüfen, weil headless WebKit Timer anders taktet.
   - Screenshots `wk-412-a-sofort.png` (300 ms nach dem Klick) und `wk-412-b-spaeter.png` (nach 3 s), zusammen in `review-0007-webkit-umschalten.png`.

**Hinweis**
1. **Fehlalarm im Text-Gate (Prüfung 2) bei der verbreiterten Woche.**
   - Bei 320 px ragt die Tageszahl „28“ (Mo 28.9.) 3,2 px in Chromium bzw. 1,9 px in WebKit links aus `fieldset.plain` heraus.
   - Grund ist `.week { margin-inline: -12px }` aus E9, das ist so gewollt und sichtbar unkritisch.
   - Die Fixtures treffen das nie, denn ihre Woche beginnt mit „5“. Die Smoke-Tests mit echten Daten prüfen bei 320 px nur 200 %.
   - **Latentes Risiko:** Der Test wird rot, sobald eine Fixture- oder Smoke-Woche bei 320 px/100 % mit einem zweistelligen Montag läuft.
   - **Abhilfe:** Prüfung 2 ignoriert Vorfahren ohne sichtbare Kante (wie Prüfung 3), oder die Woche bekommt `padding` statt negativem Rand.
2. **WebKit lädt `data/site.json` doppelt.** Der `<link rel=preload as=fetch crossorigin=anonymous>` wird nicht wiederverwendet, die Konsole warnt („preloaded … but not used“). Das kostet auf iPhone-Safari bis zu 84 kB zusätzlich, sofern nicht aus dem HTTP-Cache. Chromium lädt die Datei einmal.
3. **Detail bei 320 px und 200 %:** Der ICS-Fuß nimmt 35 % der Höhe ein (Chromium, Knöpfe untereinander, bei 100 % 26 %). Im Querformat bei 200 % sind es ≈ 40 %. Bedienbar, aber viel. Screenshots `detail-320-light-200.png` und `detail-quer-light-200.png`.
4. **Monatsraster bei 200 %:** Die zweistelligen Tage laufen optisch zusammen („12131415161718“, `letter-spacing: -0.03em` und Spalten ohne Abstand). Lesbar ist es nur über das Raster. Screenshots `kalender-360-light-200.png` und `kalender-iphone-light-200.png`.
5. **Filter-Fuß bis 380 px zweizeilig** (H7, siehe oben). Ein Textknopf „Zurücksetzen“ statt eines vollbreiten Knopfs spart ≈ 60 px. Screenshots `filter-320-light.png` und `filter-365-light.png`.
6. **H6, Rest:** 9 Angebote an 3 Orten wiederholen den Ort weiter, weil die Form „Name (Zusatz), …“ bzw. ein längerer Name nicht unter die Regel fällt:
   - „Pfarramt Lutherkirche (Keller, Zugang vom Garten), Nerzstraße 34 …“,
   - „Ökumenisches Gemeindezentrum Thon (evang. Teil, UG), …“,
   - „Nürnberg Langwasser“ → „Nürnberg Langwasser Bad, …“.

   Passt zum Eintrag „Katalog-Adressen“ in `docs/ideas.md`. Die Bereinigung läuft über die Pipeline, nicht über die UI-Regel.
7. **Fehlerzustand zeigt den Browsertext** „Failed to fetch“ bzw. „Load failed“ unter „Das hat nicht geklappt“. Für Eltern ist das unverständlich, besser wäre ein fester deutscher Satz. Screenshot `zustand-fehler-webkit.png`.
8. **Zähler-Badge der Merkliste** verdeckt in der kompakten Querleiste (568×320) einen Buchstaben von „Merkliste“. In der Seitenleiste bei 200 % sitzt er auf dem Herz und stößt an das Label. Screenshots `quer-568x320-100-chromium.png` und `quer-863x360-200-chromium.png`.
9. **Toast bei 200 % auf schmalen Telefonen** ist drei- bis vierzeilig und verdeckt kurz den Hauptknopf der Merkliste (2,8 s, flüchtig). Screenshot `merkliste-320-light-200.png`.

**Nicht prüfbar (braucht echtes Gerät bzw. Konto):**
- iPhone quer mit Notch-Einzug (H1),
- Filter-Fuß über der Home-Leiste (H7),
- erneuter ICS-Import in Google/Apple Kalender (H6),
- Gegenprobe zu Wichtig 1 auf einem iPhone mit „Bewegung reduzieren“.

Verdict: **keine Blocker.**
- B1, B2, B3, B4, B5, B7 und B8 sowie H1, H3, H4, H5, H6, H7, H8 und E5 sind live bestätigt. B6 bleibt wie geplant für Paket C offen (CLS 0,052 bei 412 px).
- **Wichtig 1** (WebKit + reduzierte Bewegung beim Umschalten) gehört vor Plan 0004 behoben oder zumindest auf einem iPhone bestätigt.
- Hinweis 1 (Gate-Fehlalarm) sollte mit Paket C mitgehen, damit das Gate nicht an einem Datum rot wird.

## Offen für die Feinschliff-Runde (Stand 2026-10-05, nach Plan 0005)

Bewusst zurückgestellt, damit die Karte mit Entfernung zuerst live geht. Wird nach Plan 0005 als eigener kleiner Plan umgesetzt.

- ~~**Paket C (B6):** Roboto-Fallback und Swap-Matrix, wie in diesem Plan beschrieben. Live gemessen: CLS 0,052 bei 412 px, 0,012 bei 360 px.~~ **Erledigt** auf `nacharbeit-0007-c`, siehe „Umsetzung Paket C“; offen sind Schritt 9 (Zusammenführen) und 10 (live und am Android-Gerät).
- **WebKit mit „Bewegung reduzieren“:** Nach dem Theme-Wechsel bleibt Text 1–5 s in der alten Farbe. Vermutete Ursache: `transition-duration: 0.01ms` auf `*` in `motion.css`, dazu `transition-property: all`. Fix mit `transition: none` und einem E2E in WebKit, dann am iPhone gegenprüfen.
- **Text-Gate:**
  - Fehlalarm Prüfung 2 an der Woche mit −12 px Rand bei 320 px („28“ ragt aus `fieldset.plain`).
  - Halb hinausgescrollte Überschriften in Sheets (Review 0004, H1).
- **WebKit** lädt `site.json` doppelt, weil der Preload nicht genutzt wird.
- **Platz bei 200 %:**
  - Der ICS-Fuß im Detail nimmt bei 200 % 35–40 % der Höhe ein.
  - Im Monatsraster laufen bei 200 % die Zahlen zusammen.
- **Fehlerzustand** zeigt den Browsertext („Failed to fetch“) statt eines eigenen Texts.
- **Badge und Toast:**
  - Das Merklisten-Badge verdeckt in der kompakten Querleiste einen Buchstaben bzw. stößt bei 200 % ans Label.
  - Der Toast verdeckt bei 200 % den Hauptknopf der Merkliste.
- **Filter-Fuß:** „Zurücksetzen“ als Textknopf spart ≈ 60 px.
- **Fokus-Rückweg** im Detail-Dialog, wenn die Kachel nach dem Ablösen aus der Merkliste verschwindet (`fallbackFocus`).
- **„Freier Tag“** sagt nicht, dass ein Filter oder der Umkreis Termine ausblendet (Review 0004, H2).
- **„Startpunkt entfernen“** steht bei 200 % zentriert statt linksbündig (Review 0004, H3).
- **Daten:**
  - 9 Angebote an 3 Orten wiederholen den Ort in der Adresse (Form „Name (Zusatz), …“). Das läuft über die Pipeline, siehe `docs/ideas.md`.
- **Nur am Gerät prüfbar:**
  - iPhone mit Notch im Querformat
  - Filter-Fuß über der Home-Leiste
  - erneuter ICS-Import (Google/Apple)
  - echter Geolocation-Dialog auf iPhone und Android
  - Merklisten-ICS auf dem iPhone

## Umsetzung Paket C (B6, 2026-10-05)

Branch `nacharbeit-0007-c` auf `main` (`a682d4d`, nach den Plänen 0004 und 0005). Die Messwerte stehen auch in den Commit-Messages.

**Messung (`node scripts/font-fallback.ts`)**: echte Daten, Chromium. Gerendert wird zehnfach mit der optischen Größe der echten Größe, siehe Abweichung 2.

| Fallback | normal 200–549 | 550–749 | 750–800 Text | 750–800 Display | größter Restfehler (Klassen, die umbrechen) |
|---|---|---|---|---|---|
| Arial/Liberation | 104,2 % (vorher 100,4) | 102,3 % (vorher 102,5) | 100,8 % | 101,4 % | Zeit/Pille ±3,0 %, sonst ≤ 0,4 % |
| Roboto (neu) | 104,7 % | 107,6 % | 103,8 % | 105,4 % | Zeit/Pille ±5,6 %, Etikett 1,0 %, sonst ≤ 1,0 % |
| Noto | 99,2 % (vorher 98,4) | 98,1 % (vorher 96,5) | 98,1 % | 98,1 % | Zeit/Pille ±2,2 %, sonst ≤ 0,8 % |
| DejaVu | 92,9 % (vorher 84,2) | 86,6 % (vorher 86,6) | 84,3 % | 85,6 % | Zeit/Pille ±4,5 %, Titel und Etikett 1,2–1,3 %, sonst ≤ 0,9 % |

- Zeit (15 px/800) und Pille (13 px/800) liegen weit auseinander, weil Bricolage Ziffern schmal und Buchstaben breit setzt. Mit Größe hat das nichts zu tun. Beide stehen in derselben Kachel-Kopfzeile, ihre Fehler gleichen sich dort zum Teil aus.
- Die Abweichung zwischen Titel (22 px) und Zeit (15 px) lag über 1,5 % (Arial 3,3 %), deshalb gibt es nach E11 den zweiten Stack `--font-display`.

**Swap-Test (CLS nur nach der Freigabe der Webfont)**, Schrift-Rendering wie am Telefon (Abweichung 3):

| | vorher 412 px | vorher 360 px | nachher 412 px | nachher 360 px |
|---|---|---|---|---|
| Arial, echte Daten | 0,0031 | 0,0003 | 0,0002 | 0,0002 |
| Roboto, echte Daten | 0,0325 | 0,0063 | 0,0002 | 0,0003 |
| Noto, echte Daten | 0,0041 | 0,0032 | 0,0000 | 0,0024 |
| DejaVu, echte Daten | 0,0216 | 0,0005 | 0,0000 | 0,0000 |
| Roboto, Fixtures (Test in `font-swap.spec.ts`) | 0,1111 | 0,0281 | 0,0004 | 0,0003 |

- „Vorher“ bei Roboto: Roboto ohne Anpassung, so wie Android bisher über `system-ui` rendert. Gemessen mit einem vorübergehenden Face ohne `size-adjust`, nicht committet.
- Mit ganzzahliger Glyphen-Rundung (Standard in headless Chromium) waren die echten Daten vorher bei max. 0,0506 (Roboto 412) und nachher bei max. 0,0058.
- Live gemessen vor C: 0,052 bei 412 px mit Liberation. Lokal hält der Test genau den Swap fest und misst dort weniger; live kamen Datenladen und Swap zusammen.

**Abweichungen vom Plan**
1. **Grenze per Eintragszahl statt Zeitstempel (E12, Review 2 Blocker 1):** Der Kanarienvogel war mit `new Event().timeStamp` als `t0` rot (0,0025 statt > 0,05), denn die `startTime` eines Layout-Shifts ist der Frame-Beginn und lag bis zu ≈ 60 ms vor dem auslösenden Ereignis. Jetzt holt `markShifts()` nach zwei Frames per `takeRecords()` alles Ausstehende und merkt sich die Anzahl; gezählt wird nur Späteres, ganz ohne Uhr.
2. **Messung zehnfach (Skript):** Headless Chromium rundet Glyphen-Breiten auf ganze Pixel, bei 13 px verfälschte das die Verhältnisse um mehrere Prozent (Roboto-Fakten 111,8 % statt 107,6 %). Das Skript rendert deshalb bei 10 × Größe mit `font-variation-settings: "opsz" <echte Größe>`.
3. **Swap-Tests mit `--force-device-scale-factor=2.625`:** Die Geräte-Emulation ändert in headless Chromium nicht die Schrift-Parameter. Erst ein Faktor > 1 schaltet die subpixelgenaue Glyphen-Positionierung ein, wie sie ein hochauflösendes Telefon hat. Weil `launchOptions` nur auf oberster Ebene einer Datei gesetzt werden kann, stehen die Swap-Tests in eigenen Dateien: `font-swap.spec.ts` (Fixtures, Kanarienvögel) und `font-swap.smoke.spec.ts` (echte Daten, läuft über `testMatch` im Smoke-Projekt) statt in `perf.spec.ts`/`smoke.spec.ts`.
4. **Ziel „jede Klasse ≤ 1,5 %“ (E11) nicht erreicht:**
   - Zeit und Pille liegen bis ±5,6 % daneben (Roboto; Arial ±3,0, DejaVu ±4,5, Noto ±2,2). Mit drei Gewichtsbereichen und zwei Stacks lässt sich das nicht trennen, denn die Ursache sind Ziffern gegen Buchstaben, nicht Größe oder Gewicht.
   - Chips, Tabs, Tagesüberschrift und Marke bestimmen kein `size-adjust` (z. B. Noto-Tabs −1,6 %, Roboto-Tagesüberschrift 2,8 %). Sie stehen in einer scrollenden Leiste, in festen Spalten bzw. einzeilig mit Reserve und brechen beim Laden nicht um.
   - Maßgeblich ist deshalb das CLS-Gate, nicht der Breitenfehler je Klasse.
5. **Namen:** `useOnlyFallback` heißt `allowOnlyFallback` (Biome hält `use…` für einen React-Hook), `expectOnlyFallback` ist Teil von `loadOnlyFallback` und gibt bei fehlender lokaler Schrift `false` zurück. `holdWebfont` hält alle Bricolage-Dateien zurück (nicht nur Latin), der Kanarienvogel verlangt genau eine Latin-Anfrage.
6. **`knip.json` → `knip.jsonc`**, damit die Begründung für `ignoreDependencies: @fontsource-variable/roboto` als Kommentar dabeistehen kann (knip erkennt `require.resolve` auf eine Schriftdatei nicht).

**Noto 3 × 98,1 % gegengeprüft:** Die drei Werte kommen aus getrennten Basen und treffen sich zufällig: Fakten 98,1 %, Mitte von Zeit 96,0 % und Pille 100,3 %, Mitte von Titel 97,7 % und Etikett 98,5 %. Ein Kopierfehler ist das nicht.

**Bei Rot nach einem Datenupdate:** `node scripts/font-fallback.ts` neu laufen lassen und die Werte übernehmen, dann die gemeldete Stelle im Layout prüfen; die Verursacher stehen in der Fehlermeldung. Die Schwelle 0,05 wird nie gesenkt, eine Ausnahme gibt es nur per ADR.

**Bekannte Grenze, kein Fehlalarm, aber ehrlich notiert:** In den Fixtures liegt die Fakten-Zeile der ersten Kachel bei 412 px mit Bricolage 0,8 px über der Breite (341,8 von 341 px). Jeder Fallback mit mehr als 0,2 % Abweichung in dieser Zeile kippt sie. Arial und DejaVu tun das bei Telefon-Rendering (0,105), Roboto bei ganzzahliger Rundung (0,10). Getestet ist mit Fixtures nach Plan nur Roboto; die echten Daten liegen über alle vier Fallbacks bei ≤ 0,0024. Ganz ausschließen lässt sich CLS beim Swap für beliebige Inhalte nicht. Der Test fängt groben Rückfall, nicht jede Kante.

**Tests:**
- `pnpm check` grün, alle sechs Projekte lokal (WebKit mit `libavif16`).
- E2E: 699 bestanden, 63 übersprungen (gewollt), davon 17 Tests im Smoke-Projekt inkl. der 8 Swap-Tests.
- Unit: 413 grün.
- Kanarienvögel dauerhaft in `font-swap.spec.ts`: Shift direkt nach der Grenze zählt; teilweises Umschreiben des CSS (fremdes `src`-Format, fehlender Block) wirft. Dazu `expectHeld` in jedem Lauf.

**Budgets:** CSS 10,01 → 10,37 / 15 kB (24 Faces, `:where`-Regel), JS 87,3 / 90 kB (unverändert).

## Arch-Review Paket C (2026-10-05) – Verdict: Nacharbeit nötig → eingearbeitet

Keine Blocker. Vorher `origin/main` (`ffddb46`) eingemergt, ohne Konflikte.

- **M1 Swap-Matrix auf CI nicht still überspringen.** → `font-swap.smoke.spec.ts` verlangt bei `CI` Messwerte für Roboto, Arial (Liberation) und DejaVu; nur Noto darf fehlen (Begründung im Code: Ubuntu-Image ohne Noto Sans).
  - Ein einzelner unbekannter `local()`-Name ließ nie die Familie ausfallen, denn ein Face lädt, sobald *eine* Quelle auflöst. Der Skip griff aber schon, wenn *ein* Face scheiterte (z. B. nur der fette Schnitt fehlt).
  - Jetzt gilt „fehlt“ nur, wenn alle sechs Faces scheitern. Teilweise installiert ist ein Fehler mit den betroffenen Faces.
  - Jeder Wert steht in `test-results/font-swap-werte.txt`, und ein CI-Schritt gibt die Datei aus. Ergebnis aus dem Branch-CI: siehe unten.
- **m1** `docs/architecture.md`: Telefon-Rendering (`PHONE_FONT_RENDERING`, nur Chromium), Schritt 10 bestätigt am echten Android, Noto auf CI übersprungen.
- **m2** Abweichung 4 ehrlich formuliert: Ziel ≤ 1,5 % für Zeit/Pille und Chips/Tabs nicht erreicht, maßgeblich ist das CLS-Gate.
- **m3** Dauerhafter Gegen-Kanarienvogel in `font-swap.spec.ts`: Roboto mit `size-adjust: 100 %` (`rewriteFallbackCss(…, { unadjusted })`) muss bei 412 px mit Fixtures CLS > 0,05 liefern.
- **m4** `loadOnlyFallback` prüft zuerst die Zahl der Faces (`FALLBACK_BUCKETS[chosen]`).
- **m5** Die Verursacher eines Shifts werden nur übernommen, wenn `previousRect` und `currentRect` echte `DOMRectReadOnly` sind.
- **m6** Die `:where`-Regel steht in `@layer base`, der Kommentar ist korrigiert; das Swap-Gate bleibt grün.
- **m7** Verweise in `vitals.ts` zeigen auf `font-swap.spec.ts`.
- **m8** JSDoc hängt an `width()`.
- **m9** `chooseAdjust` liegt rein in `scripts/lib/font-adjust.ts`, mit Unit-Test; ohne umbrechende Klasse wirft es. Die Skriptausgabe ist unverändert (geprüft per Diff).
- **m10** Noto 3 × 98,1 % gegengeprüft (siehe oben).
- **m11** `dataMeta` liegt in `e2e/real-data.ts` und prüft die Form, statt per Cast anzunehmen.
- **m12** Handlungsanweisung bei Rot nach einem Datenupdate in diesem Plan und in `docs/architecture.md`.

