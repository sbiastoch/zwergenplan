# Plan 0043 – Neu eingestellt: Datum, Sortierung, Etikett und passender Wochen-Push

Status: Review eingearbeitet
Datum: 2026-10-24
Bezug:
- Plan 0017 (Wochen-Push), E3 (`seenIds`, erste Woche allgemein), E4 (Text), E8 (Start-Budget), Nutzerentscheidung 4 (`navigate` immer Startseite)
- ADR 0014 (Web-Push), Punkte zum Ziel eines Tipps; bekommt einen Nachtrag (E6)
- ADR 0022 (stabile IDs, nur der Build vergibt); bekommt einen Nachtrag (E1)
- ADR 0026 (Daten nur über den Nachtlauf), ADR 0007 (Kurs wird nicht mittendrin abgeschnitten)
- Plan 0028 (Altersprädikat je Termin, `sessionFit`), Plan 0021 (Altersfilter), Plan 0023 (Zeitraum)
- `docs/architecture.md`: Web-Push, Invarianten „Ein Datenvertrag“, „Stabile IDs“, „Altersprüfung“, Domänen-Tabelle
- `docs/ideas.md`: „Sortierung der Tagesliste nach Wegzeit“ (wird mit E7 umgesetzt und dort entfernt), „Fokus in der Orts-Liste beim Umsortieren“
- Plan 0009 (Wegzeit, `ReachFn`, Wegzeit-Tabelle), ADR 0011, ADR 0017 (Startpunkt)
- Mockup: https://claude.ai/artifact/BhPnLgE9Yzz9pSZbhSTGsU, Artboard „Gewählt: Sortier-Icon (B) und Sticker (2)“ (Nutzerwahl 2026-10-24). Lokale Quelle der Bilder: `runs/mockup-0043/` (git-ignoriert); maßgeblich sind die Regeln dieses Plans, die Mockup-CSS ist eine Skizze.

## Anlass

Wochen-Nachricht vom 2026-10-24 an den Nutzer (Sohn 8 Monate, Such-Abo „20 Minuten“): „… neue Angebote für deine Suchen“ mit „Turnzwerge (1–3 Jahre), Montag, Turnzwerge (1–2 Jahre), Dienstag und … weitere“. Beide waren in der App nicht zu finden.

Ursache: Für regelmäßige Angebote gilt `offerFitsAge` (`src/domain/age.ts`), sobald **irgendein** kommender Termin passt. Die Turnzwerge laufen bis Oktober 2027; der Sohn wird im Februar 12 Monate alt. Der erste passende Termin liegt zwischen 2027-02-25 und 2027-03-02. Die Liste zeigt sie mit „nur altersgerecht“ korrekt erst dort, die Nachricht meldet sie als „passt jetzt“. Mit dem Geburtsdatum des Nutzers gelten 107 regelmäßige Angebote als passend, bei 38 liegt der erste passende Termin über 4 Wochen weg (Nachrechnung mit der Live-`site.json`).

Nutzerwünsche (2026-10-24):
1. Bei regelmäßigen Angeboten muss schon der Beginn zum Alter passen, nicht erst irgendein späterer Termin, zu dem man den Kurs als Ganzes gar nicht buchen würde.
2. Die Ergebnisliste lässt sich sortieren: „Nächste Termine“ (wie heute, chronologisch) und „Neu eingestellt“ (neueste zuerst).
3. Ein Tipp auf die Push-Nachricht öffnet die Liste mit „Neu eingestellt“.
4. Angebote, die in den letzten 14 Tagen neu eingestellt wurden, tragen ein sichtbares Etikett „Neu“.
5. Dritte Sortierung „Nächstgelegen“ nach Wegzeit.
6. Nach den Mockups: Sortierung als **Icon-Knopf rechts neben „Liste | Karte“ mit Menü** (Variante B, nur Icon), Etikett als **schräger Sticker „NEU“ an der Kartenecke** (Variante 2).

Nebenbefund, getrennt behoben (Kleinänderung, siehe „Außerhalb“): Der allgemeine Text der CI meldet seit dem 2026-10-20 „neu = 0“, weil `git show` auf eine `offers.json` über 1 MiB in `execFileSync` ohne `maxBuffer` mit `ENOBUFS` scheitert (`scripts/push-weekly.ts`, `previousIds`).

## Ziel

- Jedes Angebot kennt den Zeitpunkt, an dem es zuerst im Zwergenplan stand (`listedAt`), vergeben nur vom Build.
- **Ein** Begriff „neu eingestellt“ (`isNewlyListed`) für Etikett, Gruppen der Liste und Treffer der Nachricht.
- Die Liste „Entdecken“ hat drei Sortierungen (Termine, Neu eingestellt, Nächstgelegen); die Wahl steht in der URL.
- Die Wochen-Nachricht nennt nur Angebote, deren Beginn ab jetzt zum Alter passt, und öffnet „Neu eingestellt“.
- Die erste Nachricht nach dem Einschalten ist ebenfalls zugeschnitten (bisher allgemein, Plan 0017, E3).

## Nicht-Ziele

- Sortierung in der Karte, in Kalender, Merkliste, Orts- und Anbieter-Sheet.
- Die Sortierung merken (localStorage) oder in Such-Abos aufnehmen.
- Die Alterslogik der Liste ändern (Plan 0028 bleibt; siehe E2 zur bewussten Abweichung).

## Änderung

### E1 – Datenfeld `listedAt` (Schema, Pipeline, ADR-Nachtrag)

- `src/domain/schema.ts`: `OfferFields` bekommt `listedAt: Instant.optional()` mit Kommentar „gesetzt und gehalten vom Build in `pipeline nightly` (wie `id`, ADR 0022); fehlt bei Angeboten, die vor Plan 0043 schon da waren“. `RawEvent` (`scripts/pipeline/lib/raw.ts`) entsteht per `OfferFields.pick(…)` und bekommt das Feld damit nicht; ein Test belegt, dass ein Rohevent mit `listedAt` abgelehnt wird. `schema/*.json` per Export neu.
- `scripts/pipeline/lib/build-offers.ts`, nach Schritt 5 (`assignIds`): Hat die zugeordnete ID einen Vorgänger in `input.previous`, wird dessen `listedAt` übernommen (auch „fehlt“ bleibt „fehlt“). Sonst `listedAt = input.generatedAt`. Angebote aus der Übernahme (Schritt 7) behalten das Feld des Altbestands. Fortgeschriebene Kurse (Kursfortschreibung, ADR 0022) tragen dieselbe ID und behalten das Feld (Nutzerentscheid 4).
- **Kein Nachtragen** für den Bestand: Alle heutigen Angebote haben kein `listedAt` und gelten als „früher eingestellt“. Das vermeidet eine Ausnahme von „`offers.json` nie von Hand“ (ADR 0026). Sortierung und Etikett füllen sich ab dem ersten Nachtlauf nach dem Deploy; nach 14 Tagen ist der Zustand eingeschwungen.
- **ADR 0022 bekommt einen Nachtrag** (Review M3): `listedAt` ist wie `id` gespeicherter Zustand, den nur `buildOffers` setzt und hält; er wird nie von Hand gesetzt oder geändert. **`docs/architecture.md`**: Invariante „Ein Datenvertrag“ nennt `listedAt` als zweite Ausnahme von „abgeleitete Werte nie gespeichert“ (es ist kein abgeleiteter Wert, sondern Zustand der Pipeline); „Stabile IDs“ erwähnt, dass `listedAt` an der ID hängt.
- `site.json` übernimmt das Feld unverändert (`toSiteData` spreizt `offer`). Größe im eingeschwungenen Zustand (fast alle Angebote mit Feld): etwa 40 Byte × 462 ≈ 18 kB roh, gzip wenige kB, gegen heute 117 kB gz bei 250 kB Budget `Daten (site.json)`. Der Umsetzer misst und trägt die Zahl nach.
- **Gate** (Review 2, K10): `validateDataset` prüft `listedAt ≤ generatedAt`.
- **Lücken** (Review M2): Die Zuordnung kennt nur `input.previous`. Fehlt ein Angebot eine Nacht ohne Übernahmegrund und kommt zurück, gilt es erneut als neu. Gemessen über die 7 Datenstände seit 2026-10-18 (stabile IDs, Plan 0038): 88 neue IDs, davon 2, die nach einer Lücke von mindestens einer Nacht wiederkamen. Das ist selten genug, um es hinzunehmen; ein dauerhaftes „zuerst gesehen“ je `offerKey` in `data/raw/` bleibt als Idee in `docs/ideas.md`, falls es sich häuft.

### E2 – Altersregel „Beginn passt“ (Domäne, nur Push)

- Neu in `src/domain/age.ts`: `startFitsAge(offer, birthDate, now): boolean`.
  - Kurs und einmalig: wie `offerFitsAge` (erster Termin, ADR 0007).
  - Regelmäßig: der **nächste** nicht beendete Termin (`nextSession(offer, now)`) passt (`fitsAgeAt`). Ohne kommenden Termin `false`.
- `weeklyText` (`src/domain/news.ts`) nutzt `startFitsAge` statt `offerFitsAge`, für die neuen Angebote **und** für die Zahl „in den nächsten 7 Tagen“. Für die Wochenzahl zählt bei regelmäßigen Angeboten zusätzlich nur ein passender Termin innerhalb der 7 Tage. Diese Prüfung je Termin liegt **in `weeklyText` unter `byAge`** (Review 2, M-a), nicht in `offersInWeek`: Vor der Geburt (`months < 0`) wirkt das Alter wie heute gar nicht, ein Prädikat in `offersInWeek` hätte dann alle regelmäßigen Angebote verworfen. `offersInWeek` und die CI (`scripts/lib/push-weekly-core.ts`) bleiben unverändert.
- Die Liste bleibt bei `offerFitsAge`/`sessionFit` (Plan 0028): Dort stehen regelmäßige Angebote am ersten passenden Termin, also ehrlich im Februar. Nur die Nachricht behauptet „passt jetzt“ und braucht die strengere Regel. **Bewusste Lücke**: Ein regelmäßiges Angebot erscheint in „Neu eingestellt“ mit dem Termin im Februar, wird aber in der Nachricht nicht genannt. Die Karte zeigt dabei ihr Datum (E4), der Widerspruch ist also sichtbar und erklärbar.
- **Bewusste Lücke 2** (Review M5): Ein Angebot, in das das Kind erst nach dem Einstellen hineinwächst, wird nie als Treffer genannt, weil es danach nicht mehr neu ist. In der Wochenzahl zählt es, sobald sein **nächster** Termin passt und in den 7 Tagen liegt. Alternative als Nutzerentscheid 5.
- `docs/architecture.md`, Invariante „Altersprüfung“: Satz zur Nachricht ergänzen.

### E3 – Ein Begriff „neu“ und Zuschnitt ohne `seenIds` (Domäne, Service Worker)

- Neues reines Modul `src/domain/listing.ts` (darf in den Start, anders als `news.ts` wegen `push-domain-not-in-start`):
  - `NEW_DAYS = 14`.
  - `isNewlyListed(offer, now): boolean` – `listedAt` vorhanden und dessen **Berliner Kalendertag** liegt höchstens `NEW_DAYS − 1` Kalendertage vor dem Berliner „heute“ (also heute und die 13 Tage davor). Kalendertage statt 14 × 24 h, damit Etikett und Gruppen (E4) dieselbe Grenze haben, auch über die Zeitumstellung (Review M6).
  - `listedDay(offer): string | undefined` – Berliner Kalendertag von `listedAt`.
- `news.ts` importiert von dort. Treffer der Nachricht (Review M1): `fresh` = Angebote, die nicht in `seenIds` stehen (wie heute), einen kommenden Termin haben **und** entweder kein `listedAt` haben (Übergang) oder `isNewlyListed` sind. So steht jeder genannte Treffer nach dem Tipp in einer Neu-Gruppe, sobald `listedAt` da ist; ein ID-Wechsel ohne neues `listedAt` (Lücke E1) erzeugt keinen Treffer, der unter „Früher eingestellt“ landet.
- `src/sw/push-tailor.ts`: Fehlen `seenIds`, gilt als `fresh`, was `isNewlyListed` ist **und** dessen `listedAt` in `[now − 7 × 24 h, now]` liegt (neu: `listedSince(offers, from, now)` in `news.ts`) und noch einen kommenden Termin hat. Der Text wird wie sonst zugeschnitten; `seenIds` werden geschrieben (außer Testversand). Hat kein Angebot in `site.json` ein `listedAt` (Übergang, alte Kopie), bleibt es beim Ergebnis `nichts`.
- Plan 0017, E3 bekommt einen Verweis „ersetzt durch Plan 0043, E3“. Die App schreibt weiterhin keine `seenIds` beim Einschalten.
- `docs/architecture.md`: Domänen-Tabelle um `listing.ts` ergänzen. Eine eigene Arch-Regel braucht es nicht; `no-circular` verhindert den Rückimport aus `news.ts`.

### E4 – Sortierung der Liste (Route, Domäne, UI)

- **URL und Route**: Parameter `sortierung=neu` bzw. `sortierung=nah` (E7); fehlt er oder ist er unbekannt, gilt „Nächste Termine“. `Route` bekommt ein **optionales** `sort?: "neu" | "nah"` (fehlt = Termine), damit bestehende Route-Literale (`src/domain/share.ts` u. a.) unverändert bleiben (Review, Klein). Gelesen in `parseRoute` (`src/domain/route.ts`), geschrieben in `routeToSearch` (dort) bzw. `urlFor` (`src/ui/use-app-state.ts`). Ein Wechsel nutzt `replaceState` wie die Filter. Die Sortierung ist **kein** Filter: Sie zählt nicht in Filterzahl und „Filter zurücksetzen“, steht nicht in Such-Abos (`searchOf`) und nicht im Teilen-Link. Beim Wechsel von Tab oder Ansicht bleibt sie in der URL.
- **Gruppen** (Review B2): Die Liste bekommt einen eigenen Gruppentyp, statt `DayGroup` zu erweitern (Review 2, K1: `DayGroup` erzeugen auch `rangeAgenda` und `SavedCalendar`): `ListGroup<I> = { kind: "termin" | "eingestellt" | "frueher" | "wegzeit" | "ohne-wegzeit"; key: string; day?: string; band?: WayBand; items: I[] }`. `day` ist bei `termin` der Termin-Tag, bei `eingestellt` der Einstell-Tag, sonst leer; `key` ist `day`, `n:<Einstell-Tag>`, `frueher`, `w:<Band>` bzw. `ohne-wegzeit` (E7). `use-offer-views.ts` wandelt das Ergebnis von `groupByNextSession` in `ListGroup` mit `kind: "termin"`; `takeGroups` wird generisch über `{ items }` (arbeitet ohnehin nur darauf). `byStartThenTitle` wird aus `agenda.ts` exportiert.
- **Domäne**, neu in `src/domain/listing.ts`: `groupByListing(offers, now, range, fits)`.
  - Jedes Angebot steht am selben Termin wie bei „Nächste Termine“ (`shownSession`).
  - Gruppen nach `listedDay`, neueste zuerst, nur für `isNewlyListed`. Alles andere (älter, ohne `listedAt`) bildet am Ende **eine** Gruppe `frueher`.
  - Innerhalb jeder Gruppe nach Termin, dann Titel (`byStartThenTitle`).
- **`ListView`** (Review B2):
  - Schlüssel `key={group.key}`; `is-today` nur bei `kind === "termin"`.
  - Bei `kind !== "termin"` rendern die Karten mit `dated` (Datum und Uhrzeit, wie auf der Merkliste), denn die Überschrift nennt dann keinen Termin-Tag.
  - `calendarDay` fürs Detail kommt bei aktivem Zeitraum immer aus `berlinIsoDate(item.session.start)`, nicht aus der Gruppe. Damit öffnet das Detail auch bei „neu“ den Termin der Karte.
  - Überschriften aus einer neuen Funktion `listingHeading(group, today)` in `src/ui/format.ts`, die wie `dayHeading` `{ title, sub }` liefert (auch für das `aria-label` der `section`, Review 2, K2): „Heute neu“ / „Gestern neu“ / „Neu am“ mit `sub` „Mi, 22. Okt.“; letzte Gruppe „Früher eingestellt“ ohne `sub`. `dayHeading` bleibt für Termine.
- **Bedienelement** (Nutzerwahl nach Mockup: Variante B, nur Icon; ersetzt den Umschalter aus Review 2, M-c): ein runder Icon-Knopf (44 × 44 px, Rand und Schatten wie `.chip`) **rechts neben „Liste | Karte“** in der `status-row`, neue Komponente `SortMenu` in `src/ui/SortMenu.tsx`.
  - **Icon**: zwei gegenläufige Pfeile (Strich-SVG wie die übrigen Icons in `icons.tsx`, `aria-hidden`). Ist eine andere Sortierung als „Termine“ aktiv, ist der Knopf gefüllt (`--sel`/`--on-sel`), damit die Wahl ohne Text erkennbar bleibt.
  - **Zugänglicher Name**: `aria-label="Sortierung: Nächste Termine"` (bzw. „Neu eingestellt“, „Nächstgelegen“), `aria-haspopup="menu"`, `aria-expanded`.
  - **Menü** unter dem Knopf, rechtsbündig, über der Liste (`z-index` über den Karten). Aufbau (Review 3, M4, axe `aria-required-children`): ein Container mit sichtbarer Überschrift „Sortieren nach“ (`id`), darin das Element `role="menu"` mit `aria-labelledby` auf die Überschrift und nur drei `menuitemradio` als Kindern. Jeder Eintrag: Titel als zugänglicher Name, Untertitel per `aria-describedby`: „Nächste Termine – was als Nächstes stattfindet“, „Neu eingestellt – neueste zuerst“, „Nächstgelegen – Wegzeit ab <Startpunkt>“, bei Luftlinie „Luftlinie ab <Startpunkt>“ (Review 3, K3), ohne Startpunkt „Startpunkt wählen“. Die aktive Zeile ist invers (`--sel`). Jede Zeile ≥ 48 px hoch. Beim Öffnen `scrollIntoView({ block: "nearest" })` auf das Menü, damit es bei 200 % nicht unter die Tab-Leiste ragt (Review 3, M5).
  - **Bedienung** (Review 3, M5): Öffnen per Tipp, Enter oder Leertaste; Fokus auf die aktive Zeile; Pfeiltasten wandern (mit Umlauf), Home/End springen; Enter/Leertaste oder Tipp wählt und schließt, **Fokus zurück auf den Knopf**; Escape schließt, **Fokus zurück auf den Knopf**. Tab schließt und folgt dem natürlichen Fokus (kein Zurückreißen). Ein Tipp daneben schließt und wird **verbraucht** (eine transparente Fangfläche unter dem Menü über der Liste), damit er nicht zugleich eine Karte öffnet. Kein Fokusfang, kein Scroll-Lock. Die Zurück-Geste schließt es nicht eigens (kein History-Eintrag). Die Tastenlogik ist eine reine Funktion `menuKey(key, index, count)` mit Unit-Test (Review 3, K6; Komponententests gibt es im Repo nicht).
  - **Platz**: nur in der Listenansicht von „Entdecken“; in der Kartenansicht wird der Knopf nicht gerendert, „Liste | Karte“ steht dann wie heute. Gerendert wird er auch im Ladezustand (wie `{toggle}` heute), damit nichts springt (CLS). Im Querformat (Tab-Leiste seitlich) unverändert in der Statuszeile (Review 3, K8).
  - **Layout der `status-row`** (`map.css`, Review 3, M3): „Liste | Karte“ und Knopf stehen in `.view-tools { flex: 0 1 auto; display: flex; gap: 8px; min-width: 0 }`; darin `fieldset.view-toggle { flex: 1 1 auto; min-width: 0 }` (das heutige `min-width: min(100%, 9rem)` und `flex: 0 1 12rem` gelten nur noch außerhalb von `.view-tools`, also in der Kartenansicht und auf der Merkliste) und der Knopf `flex: none`. Die Statuszeile darf auf `flex-basis: 8rem` schrumpfen (heute 10rem), damit bei 390 px Zahl samt Startpunkt, Umschalter und Knopf in eine Zeile passen (im Mockup belegt). Bei 320 px/200 % bricht `.view-tools` als Ganzes unter die Statuszeile; Umschalter und Knopf bleiben nebeneinander. E2E prüft dort, dass „Liste“ und „Karte“ (je etwa 118 px) einzeilig bleiben, und fährt die Kartenansicht ohne Knopf als eigenen Fall in `expectMobileUx`.
  - **Nach der Wahl**: `limit` zurücksetzen, an den Listenanfang scrollen (mit `prefers-reduced-motion` ohne Animation), Fokus zurück auf den Knopf. Ansage über die bestehende Statuszeile (`role="status"`) als `sr-only`-Text „Sortiert nach Neu eingestellt“ usw., ohne sichtbare Layoutänderung (Review 2, K3).
- **Leerzustand**: Filter und Altersfilter können weiter alles ausblenden; `NoOffers` bleibt in beiden Sortierungen gleich. Gibt es bei „Neu“ keine Gruppe `eingestellt`, steht über „Früher eingestellt“ der Hinweis „In den letzten 14 Tagen kam nichts Neues dazu.“ (Review 2, M-e; Anlaufzeit und ruhige Wochen).
- **Start-Budget** (Review M4, Review 2 M-d): Vor E4 eine Stub-Probe wie in Plan 0017, Schritt 5b: `SortMenu`, `groupByListing`, `groupByReach` (E7), Überschriften und Sticker als minimale Fassung bauen und `JS (initial)` (102 kB), `CSS` (15 kB) und `Service Worker` (9 kB, `listing.ts` kommt über `news.ts` hinein) messen. Ergebnis mit Zahlen in diesen Plan. **Haltepunkt**: Reißt eine Grenze, wird der Plan um einen Lazy-Chunk ergänzt (Unterordner per `chunkFileNames`, Budget-Eintrag, Regeln `*-only-lazy`/`*-entry-only`, `LAZY_LOADERS`, `listingHeading` aus `format.ts` gelöst) und neu reviewt. Kein stilles Anheben einer Grenze.

### E5 – Etikett „Neu“ (UI)

- `OfferCard` (Nutzerwahl nach Mockup: Variante 2, Sticker-Optik): Ist `isNewlyListed(offer, ctx.now)`, klebt an der linken oberen Kartenecke ein Etikett „Neu“. Benennung (Review 3, K5; „Sticker“ heißen in der App schon die Kategorie-Filter): Karte `.is-new`, Etikett `.new-tag`, in der Doku „Etikett“. `fresh` ist für die Einblend-Animation belegt. Gestalt: absolut positioniert, etwa 12 px über und 10 px links neben der Ecke, um −8° gedreht, Hintergrund `--tape`, Text `--on-tape`, 2 px Rand `--line`, **`border-radius: 8px`** (Review 3, M1: sonst wird die gerundete Karte zur Bezugsbox des Text-Gates in `e2e/mobile-ux.ts`), Schatten 2 px wie `.chip`, Großbuchstaben per `text-transform` (Quelltext „Neu“, damit Screenreader „Neu“ lesen), `font-weight: 900`.
  - Das Etikett steht im DOM **vor** dem Titel und ist Teil des Kartentexts (kein `aria-hidden`), damit die Karte „Neu, …“ vorliest.
  - Es darf weder Kategorie-Pille noch Herz noch die Tagesüberschrift verdecken: Abstand der ersten Karte zur Überschrift prüfen und ggf. `margin-top` der Karte bei `.is-new` vergrößern. `container: card / inline-size` schneidet nicht ab (Review 3, M2).
  - **Scroll-Container** (Review 3, M2): In Orts- und Anbieter-Sheet liegt die erste Karte in einem Container mit `overflow-y: auto` und 6 px Innenabstand (`sheet.css`). Dort bekommt die erste `.is-new`-Karte so viel `margin-top`, dass das Etikett ganz sichtbar ist. E2E prüft per Bounding-Box gegen das `clientRect` des Scroll-Containers, dass das Etikett in Liste, Orts-Sheet und Merkliste voll sichtbar ist.
  - Keine Animation (auch nicht bei `prefers-reduced-motion`).
  - Kontrast Text zu `--tape` ≥ 4,5 : 1 hell und dunkel (im Dunkeln ist `--tape` ein dunkles Ocker mit hellem Text, Mockup), sonst eigenes Token-Paar.
  - Gilt überall, wo `OfferCard` rendert (Liste, Sheets der Karte, Merkliste).
- Detail-Dialog: Satz „Neu im Zwergenplan seit Mittwoch, 22. Oktober“ unter den Fakten, davor dasselbe Etikett in kleiner, ungedrehter Form (ebenfalls mit `border-radius`), wenn `isNewlyListed` (Nutzerentscheid 1).

### E6 – Tipp auf die Nachricht öffnet „Neu eingestellt“ (ADR-Nachtrag)

- **ADR 0014 bekommt einen Nachtrag** (Review B1): Das Ziel eines Tipps ist die feste URL `./?sortierung=neu`, für alle Geräte gleich; die Begründung zur Privatsphäre (kein gerätespezifisches Ziel) gilt weiter. Ist die App offen, wird ihr Fenster nach vorn geholt und auf das Ziel navigiert; der Zustand des Fensters (offenes Detail, gewählter Tab) geht dabei verloren. Das ist gewollt: Der Tipp soll die neuen Angebote zeigen. `docs/architecture.md`, Abschnitt Web-Push, und Plan 0017, Nutzerentscheidung 4, bekommen Verweise.
- `weeklyPayload` (`src/domain/push-payload.ts`): `navigate` = `new URL("./?sortierung=neu", siteUrl).href`.
- `decidePush` (`src/sw/push-decision.ts`): `navigate` und `data.navigate` ebenso, aus dem Scope; Konstante `PUSH_TARGET = "./?sortierung=neu"` an einer Stelle in `push-payload.ts`.
- `notificationclick` (`src/sw/sw.ts`), Review M7: Die Entscheidung wird eine reine Funktion `clickPlan(windows, target)` in `push-decision.ts` mit Unit-Test: kontrolliertes Fenster vorhanden → `focus`, dann `navigate(target)`; nur unkontrolliertes Fenster → `focus` und kein `navigate` (lehnt ab), stattdessen `openWindow(target)`; keins → `openWindow(target)`. `navigate` mit Fehler → bei `focus` bleiben. iOS folgt `navigate` der Nachricht selbst.

### E7 – Sortierung „Nächstgelegen“ (Wegzeit)

- **Wert** `sortierung=nah`. Grundlage ist dieselbe `ReachFn` wie für die Wegzeit auf der Karte und die Wegzeit-Grenze (`reachOf` in `use-offer-views.ts`, Plan 0009). Kein neuer Request: Die Wahl löst weder `wegzeit.json` noch `linien.json` aus (Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“; Tabelle lädt weiter nur bei gespeichertem Startpunkt oder beim Öffnen einer Startpunkt-Oberfläche).
- **Domäne**, neu in `src/domain/listing.ts`: `groupByReach(offers, now, range, fits, reachOf)`.
  - Schlüssel je Angebot: bei `oepnv` die **gerundeten** Minuten (`roundedMinutes`, wie `reachShort` auf der Karte), bei `luftlinie` die Meter (Startpunkt außerhalb der Tabelle, Plan 0009).
  - Bänder (Review 3, K1) aus den Stufen der Wegzeit-Grenze `LIMIT_MINUTES = [20, 30, 45]` (`src/domain/reach.ts`), damit Filter und Sortierung dieselben Zahlen nutzen: „Bis 20 Minuten“, „Bis 30 Minuten“, „Bis 45 Minuten“, „Über 45 Minuten“. (Abweichung vom Mockup, das 15/30/60 zeigt.)
  - Innerhalb eines Bands nach gerundeten Minuten, dann nach Termin, dann Titel.
  - Hat der Startpunkt **nur Luftlinie**: Bänder nach Metern („Bis 1 km“, „Bis 3 km“, „Bis 10 km“, „Über 10 km“) mit Unterzeile „Luftlinie ab …“, gleiche Regeln. Gemeinsamer Typ `ReachBand = { unit: "min" | "m"; upTo?: number }` (Review 3, K2), `ListGroup.band?: ReachBand`. Angebote ohne Ergebnis (kommt praktisch nicht vor) in eine Gruppe `ohne-wegzeit` am Ende.
  - Jedes Angebot steht am selben Termin wie bei „Nächste Termine“ (`shownSession`); Karten mit `dated` wie bei „Neu“.
- **Überschriften** (`listingHeading`): Titel = Band, Unterzeile „mit Bus & Bahn ab <Startpunkt>“ bzw. „Luftlinie ab …“ (`originPhrase`).
- **Ohne Startpunkt**: Das Menü zeigt „Nächstgelegen – Startpunkt wählen“. Die Wahl setzt `sortierung=nah`; die Liste zeigt oben eine Karte „Wovon aus gerechnet?“ mit „Wähle einen Startpunkt, dann stehen die Angebote mit der kürzesten Wegzeit mit Bus & Bahn oben.“ und dem Knopf „Startpunkt wählen“ (öffnet das Startpunkt-Sheet, `setSheet("origin")`), darunter die Liste nach Terminen unter der Überschrift „Bis dahin nach Terminen“. Nach der Wahl eines Startpunkts sortiert die Liste ohne weiteren Tipp nach Wegzeit. Weil der Knopf „Startpunkt wählen“ dann verschwindet, geht der Fokus nach dem Schließen des Startpunkt-Sheets auf die Statuszeile (`statusLine`, wie beim Kind-Sheet); E2E prüft das (Review 3, M5).
- **Während die Tabelle lädt** (Review 3, M6): eigenes Flag `listWaits = listPending || (sort === "nah" && reachMode?.kind === "laedt")`, nur für den Tausch von `ListView` gegen `ListPending`. `listPending` bleibt unverändert, denn es blendet auch die Zahl der Statuszeile aus und steuert `finish.pending` des Onboardings; bei „nah“ stimmt die Zahl, und die `sr-only`-Ansage bleibt hörbar. So sortiert die Liste nicht nachträglich um und der Fokus springt nicht.
- **Scheitert das Laden** (Review 3, K4): Es gilt der Luftlinien-Fall. Erklärt wird er durch die Statuszeile (`reachNote`) und die Überschriften „Luftlinie ab …“; der Hinweis `limitHint` erscheint wie heute nur mit `wegzeit=`.
- **Bewusste Lücke** (Review 3, M6): Ein Frische-Anlass (`refresh`, Plan 0011, E4a) tauscht die `ReachFn` und sortiert eine offene „nah“-Liste um. Selten (neue Daten während der Nutzung); hingenommen.
- **Privatsphäre**: In der URL steht nur `sortierung=nah`, nie der Startpunkt (ADR 0017). Ein geteilter Link mit `nah` zeigt beim Empfänger seine eigene Wegzeit oder die Aufforderung.
- `docs/ideas.md`: Eintrag „Sortierung der Tagesliste nach Wegzeit“ entfernen (umgesetzt mit Plan 0043).

## Weitere Sortierungen

- Preis oder Anbieter A–Z bringen für Eltern wenig; Kosten deckt der Filter ab. Nicht geplant.

## Tests (test-first für E1–E5)

- `age.test.ts`: `startFitsAge` – regelmäßig mit nächstem Termin zu jung → `false`, obwohl ein späterer passt (Turnzwerge-Fall: 8 Monate, 12–36, Termine bis 2027); nächster passt → `true`; Kurs wie `offerFitsAge`; ohne kommenden Termin → `false`. Zeitzone der Tests bleibt `America/Los_Angeles`.
- `listing.test.ts`: `isNewlyListed` an der 14-Tage-Grenze (Berliner Kalendertag, auch über 2026-10-25), ohne `listedAt`; `groupByListing` – Gruppen nach Einstell-Tag, neueste zuerst, `frueher` am Ende, Reihenfolge in der Gruppe, Zeitraum und `fits` wie bei `groupByNextSession`; **Etikett genau dann, wenn das Angebot in einer Gruppe `eingestellt` steht** (Eigenschaftstest über die Fixtures).
- `news.test.ts`: `weeklyText` nennt den Turnzwerge-Fall nicht mehr; Wochenzahl zählt ein regelmäßiges Angebot nur mit passendem Termin im Fenster; ungeborenes Kind (Geburtsdatum in der Zukunft): regelmäßiges Angebot zählt; `fresh` ohne `isNewlyListed` (mit `listedAt`) fällt weg, ohne `listedAt` bleibt; `listedSince` an den Grenzen. **Jeder `hit` steht in `groupByListing` in einer Gruppe `eingestellt`**, sofern er `listedAt` hat.
- `push-tailor.test.ts`: ohne `seenIds` und mit `listedAt` → `text`, `seenIds` geschrieben; ohne `seenIds` und ohne jedes `listedAt` → `nichts`; Testversand schreibt weiter nichts; Wochenzahl mit Alter wie in `news.test.ts`.
- `format.test.ts`: `listingHeading` auch für Wegzeit-, Luftlinien- und `ohne-wegzeit`-Gruppen (Review 3, K7).
- `listing.test.ts` (E7): `groupByReach` – Bandgrenzen an `LIMIT_MINUTES` (20/über 20, 30/über 30, 45/über 45, jeweils nach Rundung wie `reachShort`; Rohwerte, die über die Rundung die Grenze wechseln); Reihenfolge Minuten, Termin, Titel; Luftlinien-Bänder; Gruppe `ohne-wegzeit`; Zeitraum und `fits` wirken wie bei `groupByNextSession`.
- `menuKey`: Unit-Test der Tastenlogik. `SortMenu` per E2E: Tastatur (Pfeile, Home/End, Enter, Escape → Fokus auf dem Knopf, Tab → natürlicher Fokus), Tipp daneben schließt ohne Detail zu öffnen, `aria-expanded`, `aria-label` je Sortierung, gefüllter Knopf; `expectMobileUx` **mit offenem Menü** hell, dunkel, 320 px/200 % (axe).
- Fixtures für E7: Der Umsetzer nennt im Commit, welche Bänder die Fixture-Wegzeit ab dem E2E-Startpunkt erzeugt; mindestens zwei Bänder müssen belegt sein, sonst werden Fixtures ergänzt (Review 3, K7).
- `build-offers.test.ts`: neues Angebot bekommt `generatedAt`; zugeordnete ID behält `listedAt` des Vorgängers; Vorgänger ohne Feld → bleibt ohne; Übernahme aus dem Altbestand behält das Feld; Kursfortschreibung behält es.
- Schema: `listedAt` optional und als `Instant` geprüft; Rohevent mit `listedAt` abgelehnt; Schema-Drift grün nach Export.
- `route.test.ts`: `sortierung=neu` gelesen und geschrieben, unbekannter Wert → keine Sortierung, Sortierung nicht in Filterzahl/`searchOf`/Teilen-Link.
- `format.test.ts`: `listingHeading` für heute, gestern, älter, `frueher`.
- `push-payload.test.ts`, `push-decision.test.ts`: Ziel mit `?sortierung=neu`; `clickPlan` mit kontrolliertem, unkontrolliertem und keinem Fenster. `scripts/lib/push-weekly-core.test.ts` (erwartetes `navigate`) nachziehen.
- Fixtures (`tests/fixtures/`), **in Schritt 1** (Review 2, M-b): Angebote mit `listedAt` relativ zur eingefrorenen E2E-Uhr (heute, gestern, vor 5 und vor 20 Tagen) und einige ohne. Für den Zuschnitt-Test in `e2e/push.spec.ts` (`SENT_AT` 2026-10-05, Treffer „Musikgarten“ und „Krabbelreime“) bekommen beide ein `listedAt` innerhalb der 7 Tage vor `SENT_AT`; der Umsetzer prüft gegen die Spec, dass die erwarteten Texte bleiben, und legt die Werte im Commit fest.
- **E2E**: neue Spec `e2e/sortierung.spec.ts` mit Eintrag in `SPEC_COVERS` (Review 2, K9): Menü öffnet und wählt (Tipp und Tastatur), URL trägt `sortierung=neu` bzw. `nah`, Knopf gefüllt und `aria-label` passend, Überschriften und Reihenfolge, **Karten im Modus „neu“ und „nah“ zeigen ein Datum**, Sticker „Neu“ auf den erwarteten Karten und nicht über Pille oder Herz (Bounding-Box-Prüfung), „nah“ mit gespeichertem Stadtteil (Bänder in Reihenfolge) und ohne Startpunkt (Aufforderung, Knopf öffnet das Startpunkt-Sheet, danach sortiert), kein Request auf `wegzeit.json` durch die Wahl von „nah“ ohne Startpunkt, Knopf fehlt in der Kartenansicht, Hinweis „nichts Neues“ bei einem Filter, der alle neuen ausblendet, `expectMobileUx` hell/dunkel/320 px/200 %, Querformat und Desktop; Deep-Link `?sortierung=neu` öffnet sortiert; **Zeitraum + „neu“ → Detail öffnet den Termin der Karte**. `e2e/push.spec.ts`: neues Ziel (Stellen mit `navigate`) und ein Fall „ohne `seenIds`, mit `listedAt` → zugeschnitten“.
- `/arch-review` (Schema, neues Modul, > 200 Zeilen).

## Ablauf und lokale Prüfung

1. **E1–E3** (Schema, Build, Domäne, Service Worker, Fixtures mit `listedAt`, ADR-0022-Nachtrag, Doku): `pnpm verify`, `pnpm e2e:local --affected` (trifft `push.spec`) und `--affected --smoke` (Fixtures).
2. **Stub-Probe** (E4) mit Zahl in den Plan, dann **E4, E5** (Route, Menü, Liste, Etikett, E2E): `pnpm verify`, `pnpm e2e:local --affected` und `--affected --smoke` (Fixtures), `/browser-review` mit Liste in „Termine“ und „Neu“, Menü offen, Etikett hell/dunkel, 320 px/200 %, Querformat; Abgleich mit dem Mockup-Artboard „Gewählt“.
2b. **E7** (Wegzeit) als eigener Schritt mit eigenem Commit und eigener Live-Prüfung (Review 3, K10): `pnpm verify`, `pnpm e2e:local --affected`, `/browser-review` für „Nah“ mit und ohne Startpunkt und bei Luftlinie.
3. **E6** (Ziel der Nachricht, ADR-0014-Nachtrag): `pnpm verify`, `pnpm e2e:local e2e/push.spec.ts`.
4. Ein Commit je Schritt auf `main` (allein im Haupt-Checkout), CI grün, Live-Prüfung (`meta.json`), nach UI-Schritten `/browser-review live`. Nach dem ersten Nachtlauf prüfen, dass neue Angebote `listedAt` tragen; nach dem nächsten Samstag die Nachricht auf dem Gerät des Nutzers prüfen (Text passt zum Alter, Tipp öffnet „Neu eingestellt“).

## Risiken

- **Anlaufzeit**: Bis zum ersten Nachtlauf hat kein Angebot `listedAt`; „Neu eingestellt“ zeigt dann nur „Früher eingestellt“, kein Etikett. Gewollt (kein Nachtragen, E1).
- **ID-Wechsel und Lücken**: siehe E1, gemessen 2 von 88 in einer Woche. Nicht gemessen ist „neue ID nach Titeländerung“ (`architecture.md`, „im Zweifel eine neue ID“); solche Angebote tragen 14 Tage zu Unrecht „Neu“. Hingenommen.
- **Übergang** (Review 2, K6): In der ersten Woche nach dem Deploy können Treffer der Nachricht noch ohne `listedAt` sein und stehen nach dem Tipp unter „Früher eingestellt“. Ebenso kann ein Treffer vom Samstag bei einem Tipp mehr als eine Woche später schon außerhalb der 14 Tage liegen.
- **Treffer gehen unter** (Review 2, K7): Der Tipp öffnet „Neu“ ohne den Filter des Such-Abos, gewollt (festes Ziel, ADR 0014). Die genannten Treffer stehen zwischen allen neuen Angeboten.
- **Budget**: siehe Stub-Probe in E4.
- **Privatsphäre**: Die Sortierung steht in der URL wie die Filter; kein Request hängt davon ab. Das Ziel der Nachricht ist für alle gleich.
- **Nur-Icon-Knopf**: Ohne Beschriftung ist die Sortierung weniger auffindbar. Gemildert durch den gefüllten Zustand, den Untertitel im Menü und den Tipp auf die Nachricht, der direkt „Neu“ öffnet.
- **Sticker über dem Kartenrand**: kann je nach Container-Clipping abgeschnitten werden oder Nachbarn überdecken (E5, Prüfung in der Stub-Probe).

## Außerhalb (separat)

- Kleinänderung: `maxBuffer` für `git show` in `scripts/push-weekly.ts` mit Test gegen eine Datei über 1 MiB in `tempRepo()`.

## Offene Nutzerentscheide

1. Satz im Detail „Neu im Zwergenplan seit …“? Vorschlag: ja (so in E5 eingeplant).
2. Überschriften „Heute neu“, „Gestern neu“, „Neu am Mi, 22. Okt.“, „Früher eingestellt“ – passt das?
3. ~~Sortierung nach Wegzeit gleich mitnehmen?~~ Entschieden (2026-10-24): ja, E7. Bedienung Variante B als Icon, Etikett Variante 2 (Mockup).
4. Ein fortgeschriebener Kurs (neues Semester unter derselben ID, ADR 0022) gilt **nicht** als neu. Vorschlag: so lassen; sonst bräuchte es eine Regel „neues Semester = neu eingestellt“.
5. Regel für regelmäßige Angebote in der Nachricht: „nächster Termin passt“ (eingeplant, wörtlich nach Wunsch 1) oder „ein passender Termin in den nächsten 7 Tagen“ (fängt Kinder, die diese Woche hineinwachsen). Vorschlag: „nächster Termin passt“.

## Review (2026-10-24) – Verdict: Überarbeiten

Übernommen:
- **B1** ADR 0014: Nachtrag samt `architecture.md` und Zustandsverlust beim Navigieren (E6).
- **B2** `ListView`/`OfferCard`: `kind` und `key` verbindlich, Karten mit `dated` im Modus „neu“, `calendarDay` aus dem Termin, E2E für Datum und Zeitraum + Detail (E4, Tests).
- **M1** ein Begriff „neu“: Treffer verlangen `isNewlyListed`, sobald `listedAt` da ist; Eigenschaftstest „jeder Treffer in einer Neu-Gruppe“; Lücke beim Alter benannt (E2, E3).
- **M2** Lücken gemessen (2 von 88) und hingenommen, Idee für `data/raw/` (E1).
- **M3** `listedAt` in `OfferFields`, `pick` schließt es aus; ADR-0022-Nachtrag und Invarianten jetzt beschlossen (E1).
- **M4** Stub-Probe vor E4 mit Rückfall Lazy-Chunk (E4).
- **M5** als Nutzerentscheid 5 aufgenommen, Lücke in E2 benannt.
- **M6** ein Prädikat, Berliner Kalendertage für Etikett und Gruppen (E3).
- **M7** `clickPlan` als reine Funktion mit Test, unkontrollierte Fenster ohne `navigate` (E6).
- Klein: `routeToSearch`/`urlFor` und optionales `sort`; Prädikat in `push-tailor.ts`, `push-weekly-core.test.ts` und `push.spec.ts`; `flex-wrap` und Klasse `is-new`; Statuszeile genannt; Detail-Satz entschieden; Leerzustand berichtigt; reduzierte Bewegung und Fokus; lokale Prüfung je Schritt; Kursfortschreibung als Nutzerentscheid 4.

Abgelehnt: keine.

## Review Runde 2 (2026-10-24) – Verdict: Freigabe mit Änderungen

Kein Blocker; B1 und B2 bestätigt gelöst.

Übernommen:
- **M-a** Altersprüfung der Wochenzahl in `weeklyText` unter `byAge` statt in `offersInWeek`; Test „ungeboren“; Satz zur Lücke 2 berichtigt (E2, Tests).
- **M-b** Fixtures mit `listedAt` nach Schritt 1, Werte für die Push-Fixtures, E2E-Fall „ohne `seenIds`“ (Tests, Ablauf).
- **M-c** `ViewToggle` wiederverwenden, „Termine“ | „Neu“, eigene Zeile unter der Statuszeile. **Ersetzt durch E4 (Nutzerwahl nach Mockup: Icon-Knopf mit Menü)**; übernommen bleibt „auch im Ladezustand rendern“.
- **M-d** Rückfall als Haltepunkt mit den nötigen Punkten; Probe misst auch CSS und Service Worker (E4).
- **M-e** Hinweis „In den letzten 14 Tagen kam nichts Neues dazu.“ mit E2E-Fall (E4).
- Klein: K1 eigener `ListGroup`-Typ statt `DayGroup`; K2 `title`/`sub`; K3 `sr-only`; K4 Größe gegen Budget; K5–K7 unter Risiken; K8 Arch-Regel gestrichen; K9 `e2e/sortierung.spec.ts`; K10 Gate `listedAt ≤ generatedAt`.

Abgelehnt: keine.

## Nachtrag nach dem Mockup (2026-10-24)

Mockup https://claude.ai/artifact/BhPnLgE9Yzz9pSZbhSTGsU. Nutzerwahl: Sortierung als Icon-Knopf mit Menü (Variante B, nur Icon), Etikett als Sticker-Optik (Variante 2), Wegzeit-Sortierung mit aufnehmen. Eingearbeitet in E4, E5 und das neue E7.

## Review Runde 3 (2026-10-24) – Verdict: Freigabe mit Änderungen

Kein Blocker.

Übernommen:
- **M1** `border-radius: 8px` am Etikett, damit das Text-Gate nicht an der Kartenrundung anschlägt (E5).
- **M2** Etikett in Scroll-Containern: `margin-top` der ersten neuen Karte in Sheets, E2E-Sichtbarkeit gegen den Container; Hinweis zu `contain` berichtigt (E5).
- **M3** CSS von `.view-tools` festgelegt, 200 % geprüft, Kartenansicht ohne Knopf als eigener Fall (E4).
- **M4** Überschrift außerhalb von `role="menu"`, `aria-labelledby`/`aria-describedby`, axe mit offenem Menü (E4, Tests).
- **M5** Fokusregeln (Escape und Wahl → Knopf, Tab natürlich), verbrauchter Tipp daneben, `scrollIntoView`, Fokus nach dem Startpunkt-Sheet (E4, E7).
- **M6** eigenes Flag `listWaits` statt `listPending`; Umsortieren bei Frische-Anlass als Lücke (E7).
- Klein: K1 Bänder aus `LIMIT_MINUTES` mit gerundeten Minuten; K2 `ReachBand`; K3 Untertitel „Luftlinie ab …“; K4 Erklärung bei gescheitertem Laden; K5 `.is-new`/`.new-tag`, „Etikett“; K6 `menuKey` als reine Funktion, `SortMenu` per E2E; K7 Überschriften- und Fixture-Tests; K8 Querformat umformuliert; K9 M-c als ersetzt vermerkt; K10 E7 als eigener Schritt.

Abgelehnt: keine.
