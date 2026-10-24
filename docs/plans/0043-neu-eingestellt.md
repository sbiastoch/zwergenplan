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
- `docs/ideas.md`: „Sortierung der Tagesliste nach Wegzeit“

## Anlass

Wochen-Nachricht vom 2026-10-24 an den Nutzer (Sohn 8 Monate, Such-Abo „20 Minuten“): „… neue Angebote für deine Suchen“ mit „Turnzwerge (1–3 Jahre), Montag, Turnzwerge (1–2 Jahre), Dienstag und … weitere“. Beide waren in der App nicht zu finden.

Ursache: Für regelmäßige Angebote gilt `offerFitsAge` (`src/domain/age.ts`), sobald **irgendein** kommender Termin passt. Die Turnzwerge laufen bis Oktober 2027; der Sohn wird im Februar 12 Monate alt. Der erste passende Termin liegt zwischen 2027-02-25 und 2027-03-02. Die Liste zeigt sie mit „nur altersgerecht“ korrekt erst dort, die Nachricht meldet sie als „passt jetzt“. Mit dem Geburtsdatum des Nutzers gelten 107 regelmäßige Angebote als passend, bei 38 liegt der erste passende Termin über 4 Wochen weg (Nachrechnung mit der Live-`site.json`).

Nutzerwünsche (2026-10-24):
1. Bei regelmäßigen Angeboten muss schon der Beginn zum Alter passen, nicht erst irgendein späterer Termin, zu dem man den Kurs als Ganzes gar nicht buchen würde.
2. Die Ergebnisliste lässt sich sortieren: „Nächste Termine“ (wie heute, chronologisch) und „Neu eingestellt“ (neueste zuerst).
3. Ein Tipp auf die Push-Nachricht öffnet die Liste mit „Neu eingestellt“.
4. Angebote, die in den letzten 14 Tagen neu eingestellt wurden, tragen ein sichtbares Etikett „Neu“.

Nebenbefund, getrennt behoben (Kleinänderung, siehe „Außerhalb“): Der allgemeine Text der CI meldet seit dem 2026-10-20 „neu = 0“, weil `git show` auf eine `offers.json` über 1 MiB in `execFileSync` ohne `maxBuffer` mit `ENOBUFS` scheitert (`scripts/push-weekly.ts`, `previousIds`).

## Ziel

- Jedes Angebot kennt den Zeitpunkt, an dem es zuerst im Zwergenplan stand (`listedAt`), vergeben nur vom Build.
- **Ein** Begriff „neu eingestellt“ (`isNewlyListed`) für Etikett, Gruppen der Liste und Treffer der Nachricht.
- Die Liste „Entdecken“ hat zwei Sortierungen; die Wahl steht in der URL.
- Die Wochen-Nachricht nennt nur Angebote, deren Beginn ab jetzt zum Alter passt, und öffnet „Neu eingestellt“.
- Die erste Nachricht nach dem Einschalten ist ebenfalls zugeschnitten (bisher allgemein, Plan 0017, E3).

## Nicht-Ziele

- Sortierung nach Wegzeit (bleibt in `docs/ideas.md`, siehe „Weitere Sortierungen“).
- Sortierung in Kalender, Merkliste, Orts- und Anbieter-Sheet.
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

- **URL und Route**: Parameter `sortierung=neu`; fehlt er oder ist er unbekannt, gilt „Nächste Termine“. `Route` bekommt ein **optionales** `sort?: "neu"` (fehlt = Termine), damit bestehende Route-Literale (`src/domain/share.ts` u. a.) unverändert bleiben (Review, Klein). Gelesen in `parseRoute` (`src/domain/route.ts`), geschrieben in `routeToSearch` (dort) bzw. `urlFor` (`src/ui/use-app-state.ts`). Ein Wechsel nutzt `replaceState` wie die Filter. Die Sortierung ist **kein** Filter: Sie zählt nicht in Filterzahl und „Filter zurücksetzen“, steht nicht in Such-Abos (`searchOf`) und nicht im Teilen-Link. Beim Wechsel von Tab oder Ansicht bleibt sie in der URL.
- **Gruppen** (Review B2): Die Liste bekommt einen eigenen Gruppentyp, statt `DayGroup` zu erweitern (Review 2, K1: `DayGroup` erzeugen auch `rangeAgenda` und `SavedCalendar`): `ListGroup<I> = { kind: "termin" | "eingestellt" | "frueher"; key: string; day?: string; items: I[] }`. `day` ist bei `termin` der Termin-Tag, bei `eingestellt` der Einstell-Tag, bei `frueher` leer; `key` ist `day`, `n:<Einstell-Tag>` bzw. `frueher`. `use-offer-views.ts` wandelt das Ergebnis von `groupByNextSession` in `ListGroup` mit `kind: "termin"`; `takeGroups` wird generisch über `{ items }` (arbeitet ohnehin nur darauf). `byStartThenTitle` wird aus `agenda.ts` exportiert.
- **Domäne**, neu in `src/domain/listing.ts`: `groupByListing(offers, now, range, fits)`.
  - Jedes Angebot steht am selben Termin wie bei „Nächste Termine“ (`shownSession`).
  - Gruppen nach `listedDay`, neueste zuerst, nur für `isNewlyListed`. Alles andere (älter, ohne `listedAt`) bildet am Ende **eine** Gruppe `frueher`.
  - Innerhalb jeder Gruppe nach Termin, dann Titel (`byStartThenTitle`).
- **`ListView`** (Review B2):
  - Schlüssel `key={group.key}`; `is-today` nur bei `kind === "termin"`.
  - Bei `kind !== "termin"` rendern die Karten mit `dated` (Datum und Uhrzeit, wie auf der Merkliste), denn die Überschrift nennt dann keinen Termin-Tag.
  - `calendarDay` fürs Detail kommt bei aktivem Zeitraum immer aus `berlinIsoDate(item.session.start)`, nicht aus der Gruppe. Damit öffnet das Detail auch bei „neu“ den Termin der Karte.
  - Überschriften aus einer neuen Funktion `listingHeading(group, today)` in `src/ui/format.ts`, die wie `dayHeading` `{ title, sub }` liefert (auch für das `aria-label` der `section`, Review 2, K2): „Heute neu“ / „Gestern neu“ / „Neu am“ mit `sub` „Mi, 22. Okt.“; letzte Gruppe „Früher eingestellt“ ohne `sub`. `dayHeading` bleibt für Termine.
- **Bedienelement** (Review 2, M-c): das bestehende `ViewToggle` (`src/ui/Chrome.tsx`) wiederverwenden (`fieldset`/`legend`, `aria-pressed`, gleitender `seg-thumb`), Legende „Sortierung“, Segmente „Termine“ und „Neu“ (kurz, damit das gleichbreite Raster bei 320 px/200 % hält). Platz: eigene Zeile direkt unter der `status-row`, über der Liste, nur in der Listenansicht von „Entdecken“, nicht im Kalender und nicht auf der Karte. In der Seitenleiste im Querformat an derselben Stelle über der Liste. Gerendert wird er auch im Ladezustand (wie `{toggle}` heute), damit nichts springt (CLS). Ein Wechsel setzt das schrittweise Rendern (`limit`) zurück und scrollt an den Listenanfang (mit `prefers-reduced-motion` ohne Animation); der Fokus bleibt auf dem gedrückten Segment. Ansage über die bestehende Statuszeile (`role="status"`) als `sr-only`-Text „Sortiert nach Neu eingestellt“ bzw. „Sortiert nach Terminen“, ohne sichtbare Layoutänderung (Review 2, K3).
- **Leerzustand**: Filter und Altersfilter können weiter alles ausblenden; `NoOffers` bleibt in beiden Sortierungen gleich. Gibt es bei „Neu“ keine Gruppe `eingestellt`, steht über „Früher eingestellt“ der Hinweis „In den letzten 14 Tagen kam nichts Neues dazu.“ (Review 2, M-e; Anlaufzeit und ruhige Wochen).
- **Start-Budget** (Review M4, Review 2 M-d): Vor E4 eine Stub-Probe wie in Plan 0017, Schritt 5b: Umschalter, `groupByListing`, Überschriften und Etikett als minimale Fassung bauen und `JS (initial)` (102 kB), `CSS` (15 kB) und `Service Worker` (9 kB, `listing.ts` kommt über `news.ts` hinein) messen. Ergebnis mit Zahlen in diesen Plan. **Haltepunkt**: Reißt eine Grenze, wird der Plan um einen Lazy-Chunk ergänzt (Unterordner per `chunkFileNames`, Budget-Eintrag, Regeln `*-only-lazy`/`*-entry-only`, `LAZY_LOADERS`, `listingHeading` aus `format.ts` gelöst) und neu reviewt. Kein stilles Anheben einer Grenze.

### E5 – Etikett „Neu“ (UI)

- `OfferCard`: Ist `isNewlyListed(offer, ctx.now)`, erscheint in `card-top` nach dem Kategorie-Etikett ein Etikett „Neu“ (Klasse `is-new`; `fresh` ist für die Einblend-Animation belegt). `card-top` erhält `flex-wrap`, damit Pille, Zeit samt Datum und „Neu“ bei 320 px/200 % umbrechen statt überzulaufen. Farbe aus den bestehenden Tokens, Kontrast ≥ 4,5 : 1 hell und dunkel; die Bedeutung trägt der Text, nicht die Farbe. Gilt überall, wo `OfferCard` rendert (Liste, Sheets der Karte, Merkliste).
- Detail-Dialog: Satz „Neu im Zwergenplan seit Mi, 22. Okt.“ unter den Fakten, wenn `isNewlyListed` (Nutzerentscheid 1).

### E6 – Tipp auf die Nachricht öffnet „Neu eingestellt“ (ADR-Nachtrag)

- **ADR 0014 bekommt einen Nachtrag** (Review B1): Das Ziel eines Tipps ist die feste URL `./?sortierung=neu`, für alle Geräte gleich; die Begründung zur Privatsphäre (kein gerätespezifisches Ziel) gilt weiter. Ist die App offen, wird ihr Fenster nach vorn geholt und auf das Ziel navigiert; der Zustand des Fensters (offenes Detail, gewählter Tab) geht dabei verloren. Das ist gewollt: Der Tipp soll die neuen Angebote zeigen. `docs/architecture.md`, Abschnitt Web-Push, und Plan 0017, Nutzerentscheidung 4, bekommen Verweise.
- `weeklyPayload` (`src/domain/push-payload.ts`): `navigate` = `new URL("./?sortierung=neu", siteUrl).href`.
- `decidePush` (`src/sw/push-decision.ts`): `navigate` und `data.navigate` ebenso, aus dem Scope; Konstante `PUSH_TARGET = "./?sortierung=neu"` an einer Stelle in `push-payload.ts`.
- `notificationclick` (`src/sw/sw.ts`), Review M7: Die Entscheidung wird eine reine Funktion `clickPlan(windows, target)` in `push-decision.ts` mit Unit-Test: kontrolliertes Fenster vorhanden → `focus`, dann `navigate(target)`; nur unkontrolliertes Fenster → `focus` und kein `navigate` (lehnt ab), stattdessen `openWindow(target)`; keins → `openWindow(target)`. `navigate` mit Fehler → bei `focus` bleiben. iOS folgt `navigate` der Nachricht selbst.

## Weitere Sortierungen (Vorschlag an den Nutzer, nicht Teil dieses Plans)

- **Nächstgelegen (Wegzeit)**, nur mit Startpunkt: naheliegend, steht schon in `docs/ideas.md`. Bewusst später, weil die Wegzeit nachlädt und die Liste dann umsortiert (Fokusproblem, `docs/ideas.md`).
- Preis oder Anbieter A–Z bringen für Eltern wenig; Kosten deckt der Filter ab.

## Tests (test-first für E1–E5)

- `age.test.ts`: `startFitsAge` – regelmäßig mit nächstem Termin zu jung → `false`, obwohl ein späterer passt (Turnzwerge-Fall: 8 Monate, 12–36, Termine bis 2027); nächster passt → `true`; Kurs wie `offerFitsAge`; ohne kommenden Termin → `false`. Zeitzone der Tests bleibt `America/Los_Angeles`.
- `listing.test.ts`: `isNewlyListed` an der 14-Tage-Grenze (Berliner Kalendertag, auch über 2026-10-25), ohne `listedAt`; `groupByListing` – Gruppen nach Einstell-Tag, neueste zuerst, `frueher` am Ende, Reihenfolge in der Gruppe, Zeitraum und `fits` wie bei `groupByNextSession`; **Etikett genau dann, wenn das Angebot in einer Gruppe `eingestellt` steht** (Eigenschaftstest über die Fixtures).
- `news.test.ts`: `weeklyText` nennt den Turnzwerge-Fall nicht mehr; Wochenzahl zählt ein regelmäßiges Angebot nur mit passendem Termin im Fenster; ungeborenes Kind (Geburtsdatum in der Zukunft): regelmäßiges Angebot zählt; `fresh` ohne `isNewlyListed` (mit `listedAt`) fällt weg, ohne `listedAt` bleibt; `listedSince` an den Grenzen. **Jeder `hit` steht in `groupByListing` in einer Gruppe `eingestellt`**, sofern er `listedAt` hat.
- `push-tailor.test.ts`: ohne `seenIds` und mit `listedAt` → `text`, `seenIds` geschrieben; ohne `seenIds` und ohne jedes `listedAt` → `nichts`; Testversand schreibt weiter nichts; `offersInWeek` bekommt das Prädikat.
- `build-offers.test.ts`: neues Angebot bekommt `generatedAt`; zugeordnete ID behält `listedAt` des Vorgängers; Vorgänger ohne Feld → bleibt ohne; Übernahme aus dem Altbestand behält das Feld; Kursfortschreibung behält es.
- Schema: `listedAt` optional und als `Instant` geprüft; Rohevent mit `listedAt` abgelehnt; Schema-Drift grün nach Export.
- `route.test.ts`: `sortierung=neu` gelesen und geschrieben, unbekannter Wert → keine Sortierung, Sortierung nicht in Filterzahl/`searchOf`/Teilen-Link.
- `format.test.ts`: `listingHeading` für heute, gestern, älter, `frueher`.
- `push-payload.test.ts`, `push-decision.test.ts`: Ziel mit `?sortierung=neu`; `clickPlan` mit kontrolliertem, unkontrolliertem und keinem Fenster. `scripts/lib/push-weekly-core.test.ts` (erwartetes `navigate`) nachziehen.
- Fixtures (`tests/fixtures/`), **in Schritt 1** (Review 2, M-b): Angebote mit `listedAt` relativ zur eingefrorenen E2E-Uhr (heute, gestern, vor 5 und vor 20 Tagen) und einige ohne. Für den Zuschnitt-Test in `e2e/push.spec.ts` (`SENT_AT` 2026-10-05, Treffer „Musikgarten“ und „Krabbelreime“) bekommen beide ein `listedAt` innerhalb der 7 Tage vor `SENT_AT`; der Umsetzer prüft gegen die Spec, dass die erwarteten Texte bleiben, und legt die Werte im Commit fest.
- **E2E**: neue Spec `e2e/sortierung.spec.ts` mit Eintrag in `SPEC_COVERS` (Review 2, K9): Umschalter wechselt, URL trägt `sortierung=neu`, Überschriften und Reihenfolge, **Karten im Modus „neu“ zeigen ein Datum**, Etikett „Neu“ auf den erwarteten Karten, Hinweis „nichts Neues“ bei einem Filter, der alle neuen ausblendet, `expectMobileUx` hell/dunkel/320 px/200 %, Querformat und Desktop; Deep-Link `?sortierung=neu` öffnet sortiert; **Zeitraum + „neu“ → Detail öffnet den Termin der Karte**. `e2e/push.spec.ts`: neues Ziel (Stellen mit `navigate`) und ein Fall „ohne `seenIds`, mit `listedAt` → zugeschnitten“.
- `/arch-review` (Schema, neues Modul, > 200 Zeilen).

## Ablauf und lokale Prüfung

1. **E1–E3** (Schema, Build, Domäne, Service Worker, Fixtures mit `listedAt`, ADR-0022-Nachtrag, Doku): `pnpm verify`, `pnpm e2e:local --affected` (trifft `push.spec`) und `--affected --smoke` (Fixtures).
2. **Stub-Probe** (E4) mit Zahl in den Plan, dann **E4, E5** (Route, Liste, Karte, Fixtures, E2E): `pnpm verify`, `pnpm e2e:local --affected` und `--affected --smoke` (Fixtures), `/browser-review` mit Liste in beiden Sortierungen, Etikett hell/dunkel, 320 px/200 %.
3. **E6** (Ziel der Nachricht, ADR-0014-Nachtrag): `pnpm verify`, `pnpm e2e:local e2e/push.spec.ts`.
4. Ein Commit je Schritt auf `main` (allein im Haupt-Checkout), CI grün, Live-Prüfung (`meta.json`), nach UI-Schritten `/browser-review live`. Nach dem ersten Nachtlauf prüfen, dass neue Angebote `listedAt` tragen; nach dem nächsten Samstag die Nachricht auf dem Gerät des Nutzers prüfen (Text passt zum Alter, Tipp öffnet „Neu eingestellt“).

## Risiken

- **Anlaufzeit**: Bis zum ersten Nachtlauf hat kein Angebot `listedAt`; „Neu eingestellt“ zeigt dann nur „Früher eingestellt“, kein Etikett. Gewollt (kein Nachtragen, E1).
- **ID-Wechsel und Lücken**: siehe E1, gemessen 2 von 88 in einer Woche. Nicht gemessen ist „neue ID nach Titeländerung“ (`architecture.md`, „im Zweifel eine neue ID“); solche Angebote tragen 14 Tage zu Unrecht „Neu“. Hingenommen.
- **Übergang** (Review 2, K6): In der ersten Woche nach dem Deploy können Treffer der Nachricht noch ohne `listedAt` sein und stehen nach dem Tipp unter „Früher eingestellt“. Ebenso kann ein Treffer vom Samstag bei einem Tipp mehr als eine Woche später schon außerhalb der 14 Tage liegen.
- **Treffer gehen unter** (Review 2, K7): Der Tipp öffnet „Neu“ ohne den Filter des Such-Abos, gewollt (festes Ziel, ADR 0014). Die genannten Treffer stehen zwischen allen neuen Angeboten.
- **Budget**: siehe Stub-Probe in E4.
- **Privatsphäre**: Die Sortierung steht in der URL wie die Filter; kein Request hängt davon ab. Das Ziel der Nachricht ist für alle gleich.

## Außerhalb (separat)

- Kleinänderung: `maxBuffer` für `git show` in `scripts/push-weekly.ts` mit Test gegen eine Datei über 1 MiB in `tempRepo()`.

## Offene Nutzerentscheide

1. Satz im Detail „Neu im Zwergenplan seit …“? Vorschlag: ja (so in E5 eingeplant).
2. Überschriften „Heute neu“, „Gestern neu“, „Neu am Mi, 22. Okt.“, „Früher eingestellt“ – passt das?
3. Sortierung nach Wegzeit gleich mitnehmen oder später? Vorschlag: später.
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
- **M-c** `ViewToggle` wiederverwenden, „Termine“ | „Neu“, eigene Zeile unter der Statuszeile, auch im Ladezustand und in der Seitenleiste (E4).
- **M-d** Rückfall als Haltepunkt mit den nötigen Punkten; Probe misst auch CSS und Service Worker (E4).
- **M-e** Hinweis „In den letzten 14 Tagen kam nichts Neues dazu.“ mit E2E-Fall (E4).
- Klein: K1 eigener `ListGroup`-Typ statt `DayGroup`; K2 `title`/`sub`; K3 `sr-only`; K4 Größe gegen Budget; K5–K7 unter Risiken; K8 Arch-Regel gestrichen; K9 `e2e/sortierung.spec.ts`; K10 Gate `listedAt ≤ generatedAt`.

Abgelehnt: keine.
