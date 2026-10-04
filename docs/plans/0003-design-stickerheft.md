# Plan 0003 – Design „Stickerheft mit Knete-Kacheln“: Liste, Kalender, Merkliste, Detail

Status: freigegeben nach Review (mit Änderungen, eingearbeitet) → Umsetzung
Datum: 2026-10-04

## Ziel

Die Platzhalter-UI wird durch das freigegebene Design ersetzt. Das ist die Mockup-Variante „C + A · Mix“: Stickerheft-Gesamtdesign mit den harten Schatten und dem Kachelaufbau der Variante „Knete“. Am Ende gilt:

- Die Seite hat drei Bereiche in einer Washi-Tape-Tab-Leiste unten: **Entdecken** (Liste nach Tagen), **Kalender** (Woche, Monat, Tagesagenda) und **Merkliste** („Mein Stickerheft“).
- Jedes Angebot öffnet ein **Detail** mit Etiketten (Wann/Wo/Alter/Kosten/Anmeldung), Verfügbarkeits-Stempel, Terminliste und ICS-Export.
- Filter gibt es als Sticker-Leiste (Kategorien), Schnellfilter-Chips und Filter-Sheet. Ein **Kind-Sheet** enthält das Geburtsdatum (TT.MM.JJJJ), „Nur passende Angebote“ und die Darstellung (Automatisch/Hell/Dunkel).
- Hell und Dunkel entsprechen den Mockup-Tokens. Bricolage Grotesque ist selbst gehostet.
- Alle Mobile-UX-Gates sind grün, für jede neue Ansicht hell und dunkel. Die Budgets bleiben unverändert (JS 90 kB, CSS 15 kB).
- Live unter https://sbiastoch.github.io/zwergenplan/ mit echten Daten (333 Angebote).

Referenz-Mockup: `docs/design/stickerheft-mockup.html` (im Repo, nur fiktive Daten; Kopie des Canvas-Boards „C + A · Mix“, https://claude.ai/artifact/92zvm3ERkLQvYNQqSurf1G). Daraus stammen das Komponenten-CSS, die Icons (SVG-Pfade im Markup) und die 12 Kategorieformen (`SHAPES`, `CATS`). Die Mockup-Logik nutzt fiktive Daten. Maßgeblich sind die Regeln dieses Plans und der Domäne, nicht die Mockup-Rechnungen.

## Nicht-Ziele

- **Karte und Entfernung** (Liste/Karte-Umschalter, Pins, „1,4 km“, „Entfernung ab Standort/Stadtteil“). Das kommt in Plan 0004 mit MapLibre GL + OpenFreeMap (neue Abhängigkeit, Drittanbieter-Requests, Standortabfrage → ADR). Begründung siehe E1.
- PWA/Service Worker, Offline (eigener Plan).
- Motion-Bibliothek. Alle Micro-Interactions sind CSS-Animationen aus dem Mockup (E6).
- Visuelle Regression als Gate (`docs/ideas.md`).
- Eigene Kategorie „Glaube“. Krabbelgottesdienste bleiben unter „Treffs & Cafés“ (E10).

## Ausgangslage

- `src/ui/App.tsx` (Platzhalter): Format-Chips, natives Datumsfeld, Karten mit ICS-Link und Anbieter-Link.
- Domäne vorhanden: `filter.ts` (`FilterState`, URL-Parameter `kat/format/anmeldung/kosten`, `applyFilters`, `nextSession`), `age.ts` (`ageInMonths`, `offerFitsAge`), `ics.ts` (Reihe und Einzeltermin, statische Dateien), `topics.ts` (12 Kategorien), `time.ts` (Berlin-Kalender).
- `src/data/site.ts`: `loadSiteData`, `assetUrl`, Geburtsdatum im `localStorage` (`zwergenplan.geburtsdatum`, ISO).
- Echte Daten: 333 Angebote (170 Kurse, 117 regelmäßig, 46 einmalig), 2 889 Termine, `site.json` 80 kB gzip. Verfügbarkeit: 135 unbekannt, 77 frei, 27 wenige, 20 ausgebucht, 43 Warteliste, 31 ohne Anmeldung. 51 verschiedene, teils lange Stadtteil-Bezeichnungen.
- Budgets heute: JS 71,0 / 90 kB, CSS 3,1 / 15 kB (gzip).
- Offene Punkte aus `docs/ideas.md`, die dieser Plan löst: „Lange Listen“ (E8), „Verfügbarkeit auf der Karte“ (E9), „Sortierung nach nächstem Termin“ (E7).

## Entscheidungen

### E1 – Karte und Entfernung kommen in Plan 0004

MapLibre GL hat etwa 200 kB gzip. Es passt nur lazy geladen ins Budget, braucht eine eigene Size-Limit-Zeile und erzeugt Requests an OpenFreeMap. Das ist die einzige erlaubte Drittanbieter-Ausnahme (`docs/architecture.md`, Privatsphäre) und braucht eine eigene Begründung. Die Entfernung braucht Geolocation oder eine Stadtteil-Koordinatentabelle; die 51 Stadtteil-Strings der Daten sind dafür nicht normalisiert. Beides wäre in diesem Plan ein zweites großes Thema. Darum:
- Kein Liste/Karte-Umschalter und keine km-Angabe in diesem Plan. Die Meta-Zeile der Karte lautet „Anbieter · Stadtteil“ (Ort, wenn kein Stadtteil).
- Im Kind-Sheet entfällt „Entfernung ab“.
- `docs/ideas.md` bekommt keinen Eintrag; Plan 0004 wird direkt im Anschluss geschrieben. Er muss ADR 0005 aufgreifen (Öffi-Fahrzeit als Ziel, Luftlinie höchstens als Zwischenstufe).

### E2 – Layout: Dokument-Scroll statt App-Shell

Das Mockup scrollt in einem festen 390×844-Rahmen. Die Website nutzt dagegen den normalen Dokument-Scroll: Adressleiste klappt ein, 200 % Text funktioniert, Scroll-Wiederherstellung funktioniert.
- Kopfbereich (Header, Sticker-Leiste, Chips) scrollt mit.
- Tab-Leiste `position: fixed` unten, mit `env(safe-area-inset-bottom)`. Der Inhalt bekommt unten Platz in Höhe der Leiste.
- Inhalt mittig, `max-width: 40rem`, Seitenrand 16 px. Desktop zeigt dieselbe Spalte.

### E3 – Overlays sind native `<dialog>`

Detail, Filter-Sheet und Kind-Sheet sind `<dialog>` mit `showModal()`. Das bringt Fokusfalle, `Esc`, `inert` für den Hintergrund und `::backdrop` ohne eigenen Code.
- Das `dialog`-Element bleibt immer gemountet. Ein Effekt ruft je nach Zustand `showModal()` bzw. `close()` auf, der Inhalt wird nur im offenen Zustand gerendert. So stellt der Browser nach dem Schließen den Fokus auf den Auslöser wieder her.
- `cancel` (Esc, Android-Zurück bei offenem Modal) wird mit `preventDefault()` abgefangen und nimmt denselben Schließpfad wie der Zurück-Button (beim Detail also History, E4).
- Ein Klick auf den Backdrop schließt (Klickziel ist das `dialog`-Element selbst).
- Scroll-Sperre: `html:has(dialog[open]) { overflow: hidden }`, im Dialog `overscroll-behavior: contain`.
- Dialoge liegen im Top-Layer und erben das Safe-Area-Padding des `body` nicht: Sie setzen eigene `env(safe-area-inset-*)`. Die feste Tab-Leiste berücksichtigt im Querformat auch links/rechts.
- Das Detail ist ein Vollbild-Dialog (Mockup `.detail`). Die Sheets sind unten angedockt (Mockup `.sheet`), scrollen bei wenig Höhe (Querformat) selbst, das Eingabefeld steht oben.
- Toasts: Der Hintergrund ist bei offenem Dialog `inert` und verdeckt. Deshalb rendert jeder offene Dialog eine eigene Toast-Region, die Seite nur, solange kein Dialog offen ist.

### E4 – URL-Zustand

- Filter bleiben wie bisher in der URL (`kat`, `format`, `anmeldung`, `kosten`, `replaceState`).
- Neu: `ansicht=kalender|merkliste` (fehlt = Entdecken, `replaceState`) und `angebot=<offerId>` für das Detail.
  - Das Öffnen eines Details nutzt `pushState` mit `history.state = { zpDetail: true }`. Die Zurück-Geste von Android/iOS schließt das Detail, statt die Seite zu verlassen. `popstate` liest den Zustand neu.
  - Das Schließen (Zurück-Button, Esc, Backdrop) ruft `history.back()` auf, wenn `history.state?.zpDetail` gesetzt ist. Das Flag steht in `history.state` und übersteht damit ein Neuladen. Bei einem Deep-Link (direkt mit `?angebot=`) ersetzt das Schließen den Eintrag per `replaceState`.
  - Ein unbekanntes `angebot` (abgelaufen, falsche ID) zeigt kein Detail und entfernt den Parameter.
- Geburtsdatum, Merkliste, Darstellung und „Nur passende“ stehen **nie** in der URL.
- Die reine Parse-/Serialisier-Logik liegt in `src/domain/route.ts` (testbar), `filter.ts` bleibt für die Filter-Parameter zuständig.

### E5 – Design-Tokens und CSS

- Tokens aus dem Mockup als CSS-Variablen in `src/ui/styles.css`.
  - Hell auf `:root`.
  - Dunkel unter `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` und `:root[data-theme="dark"]`.
  - Tailwind-Farben (`@theme`) verweisen auf diese Variablen, damit Utilities (`text-muted` usw.) dieselben Werte nutzen.
  - Tokens hell: `--bg #E8F1FF`, `--dotc rgba(19,33,46,.13)`, `--surface #FFF`, `--rim #FFF`, `--ink #13212E`, `--muted #475563`, `--soft #EEF3FA`, `--edge rgba(19,33,46,.12)`, `--edge2 rgba(19,33,46,.28)`, `--line #13212E`, `--shadow #13212E`, `--primary #13212E`, `--on-primary #FFF`, `--tape #FFE38A`, `--tape-stripe rgba(255,255,255,.5)`, `--on-tape #13212E`, `--scrim rgba(19,33,46,.45)`.
  - Tokens dunkel: `--bg #0E1620`, `--dotc rgba(238,243,248,.08)`, `--surface #1B2733`, `--rim #2B3A49`, `--ink #EEF3F8`, `--muted #A9B8C6`, `--soft #243241`, `--edge rgba(0,0,0,.4)`, `--edge2 rgba(238,243,248,.28)`, `--line #8FA4BA`, `--shadow #34495E`, `--primary #FFD93B`, `--on-primary #13212E`, `--tape #3B3420`, `--tape-stripe rgba(255,217,59,.10)`, `--on-tape #F5E7B5`, `--scrim rgba(0,0,0,.62)`.
  - `color-scheme` folgt dem aktiven Theme. Zwei `<meta name="theme-color">` mit `media` (hell `#E8F1FF`, dunkel `#0E1620`).
- Kategorienfarben als Klassen `.k-<kategorie>` setzen `--k` (Werte siehe Mockup Zeile 18). Text auf `--k` ist immer `#13212E`.
- Kategorieformen (12 SVG-Pfade, Mockup `SHAPES`) liegen mit Kurzlabel in `src/ui/categories.ts`. Das ist Darstellung, keine Domäne.
- Die Komponenten-Klassen des Mockups (`.card`, `.chip`, `.stk`, `.pill`, `.fact`, `.label`, `.stamp`, `.tabs` …) werden als handgeschriebenes CSS in `@layer components` übernommen. Utilities nur für Layout-Kleinkram. Begründung: Die Kacheln haben viele Zustände (`:has(:active)`, `.on`, Rotation), die als Utility-Ketten unlesbar würden.
- Fokus: `:focus-visible` mit `outline: 3px solid var(--ink); outline-offset: 2px` (Mockup), Eingabefelder auch bei `:focus`.
- Lange Komposita: `overflow-wrap: anywhere` bleibt. `hyphens: auto` nur noch für Fließtext (`.summary`), nicht für Titel und Meta-Zeilen („Alt-stadt“). Das Mockup-Review hatte „Nürn-berg“ in Titeln bemängelt.

### E6 – Schrift und Bewegung

- Bricolage Grotesque über `@fontsource-variable/bricolage-grotesque` (OFL-1.1, neue Laufzeit-Abhängigkeit ohne JS). Eingebunden per `import "@fontsource-variable/bricolage-grotesque/opsz.css"` in `src/main.tsx`; so erkennt knip die Abhängigkeit und Vite schreibt die `url()`s um. Der Familienname ist **`"Bricolage Grotesque Variable"`** (Fontsource), nicht der Name aus dem Mockup.
- `opsz.css` hat die Achsen Gewicht 200–800 und optische Größe; Titel wirken nur damit wie im Mockup. `wght.css` (41 statt 77 kB) wäre kleiner, verliert aber die optische Größe. Der Browser lädt per `unicode-range` nur die Latin-Datei. Vite legt die Dateien unter `dist/assets/` ab, kein Drittanbieter-Request. Der Browser-Review prüft in den Netzwerk-Requests, dass genau diese eine Schriftdatei geladen wird.
- `font-display: swap`. Der Perf-Test misst CLS mit echtem Font-Swap. Weil CI (Linux, `system-ui` = DejaVu Sans) damit 0,38 maß, gibt es in `src/ui/styles/tokens.css` Fallback-`@font-face`s mit `size-adjust` und Ascent/Descent-Override für Arial/Liberation, Noto und DejaVu, je normal und fett getrennt, gemessen bei echter Schriftgröße (die optische Größe macht Bricolage klein breiter). Danach `system-ui, sans-serif`. CLS mit jeder dieser Schriften ≤ 0,004. Roboto (Android) ist nicht angepasst, weil hier nicht messbar; im Browser-Review live beobachten.
- Animationen ausschließlich in CSS: `stick` (Karte erscheint), `plop` (Chip), `slap` (Herz), `stamp` (Kalendertag), `peel` (Logo, 2× nach 1 s), `up` (Sheet), `slide` (Detail), `toast`, `wiggle` (Leerzustand).
- `prefers-reduced-motion: reduce` schaltet Animationen und Transitionen ab (bestehende Regel, ergänzt um `animation-iteration-count: 1`, sonst flackert `wiggle`).
- Die Karten-Animation `stick` beginnt mit `opacity: 0`. Damit sie LCP nicht verzögert, bekommen Karten des **ersten** Renderings nach dem Laden keine Animation. Nur später eingefügte Karten (Filterwechsel, „Weitere“) kleben sich ein. Der Zustand „animieren“ wird beim Mounten der Karte festgehalten, ein Re-Render startet die Animation nicht neu.

### E7 – Liste „Entdecken“: jedes Angebot einmal, am nächsten Termin

- Domänenfunktion `groupByNextSession(offers, now)` in `src/domain/agenda.ts`. Je Angebot zählt der nächste nicht beendete Termin (`nextSession`). Sortiert wird nach dessen Beginn, bei Gleichstand nach Titel. Gruppiert wird nach dem Berliner Kalendertag.
- Gruppentitel: „Heute“ (Tape-Markierung), „Morgen“, sonst Wochentag. Darunter „Montag, 5. Oktober“ bzw. „12. Oktober“. Formatierung in `src/ui/format.ts`, der Vergleich „heute/morgen“ über `berlinIsoDate(now)` aus `time.ts`.
- Damit erledigt sich der Ideen-Eintrag „Sortierung nach nächstem Termin“. Für laufende Kurse zeigt die Karte „Kurs · noch 4 von 8“ statt „Kurs · 8 Termine“ (`courseProgress(offer, now)` in `agenda.ts`). Ob ein Einstieg möglich ist, wissen die Daten nicht; das bleibt in `docs/ideas.md`.

### E8 – Lange Listen: schrittweise rendern

333 Karten auf einmal wären auf schwachen Geräten spürbar (Animation, Schatten). Die Liste rendert die ersten **40 Angebote**, notfalls mitten in einem Tag: In echten Daten hat ein Tag bis zu 93 Angebote, ganze Tage machten den ersten Schritt unbegrenzt und LCP zu langsam (gefunden im Smoke-Test). Der nächste Schritt setzt denselben Tag ohne neue Überschrift fort. Darunter steht ein Button „Weitere Angebote zeigen (noch N)“, der 40 weitere freigibt. Das ist bewusst ein Button statt Endlos-Scroll: bedienbar per Tastatur, deterministisch testbar, kein IntersectionObserver.
- Reine Logik `takeGroups(groups, limit)` in `agenda.ts` (Test).
- Ein Filterwechsel setzt das Limit zurück.
- Kalender-Agenda und Merkliste zeigen immer alles (wenige Einträge je Tag bzw. selbst gewählt).
- Perf-Nachweis: Der Smoke-Test mit echten Daten bekommt einen LCP/CLS-Check (wie `perf.spec.ts`, Chromium, gedrosselt) auf dem echten Build. Das Projekt `smoke-echte-daten` läuft dafür nach allen anderen und seriell (`dependencies`, `fullyParallel: false`): Mit 4× gedrosselter CPU maß der Check sonst die parallelen Worker (2,6 s statt isoliert 1,8 s). `site.json` wird per `<link rel="preload">` parallel zum JS geladen (LCP 2,2 → 1,8 s).

### E9 – Karte (Kachel) und Fakten

Aufbau wie im Mockup:
- `article.card` (`data-testid="offer"`), Rotation abwechselnd ±0,6°.
- Kopfzeile: Kategorie-Pille (Farbe und Form der **ersten** Kategorie aus `categoriesOf`) und Uhrzeit „10:00–11:30 Uhr“.
- Titel als `h3` mit einem Button, der per `::after` die ganze Kachel abdeckt (Stretched-Button). So bleibt der Name des Buttons kurz (Titel), es gibt eine Überschriften-Navigation, und die ganze Fläche ist klickbar. Das Herz liegt darüber (`z-index`).
  - Das Touch-Gate misst das Rechteck des Buttons, nicht `::after`. Der Button ist deshalb `display: flex; align-items: center; min-height: 44px` mit `margin: -10px 0`; optisch bleibt die Zeile gleich hoch.
  - Fokus: eigener `:focus-visible`-Rahmen am Button (das Fokus-Gate prüft das fokussierte Element selbst).
- Meta: „Anbieter · Stadtteil“.
- Fakten-Chips:
  - Format: „Kurs · 8 Termine“ / „Kurs · noch 4 von 8“ / „Jeden Mittwoch“ / „Freitags“ / „Regelmäßig“ / „Einmalig“. Regel `rhythm(offer, now)` in `agenda.ts`: mindestens 2 kommende Termine am selben Wochentag → „<Wochentag>s“; zusätzlich lückenlos im 7-Tage-Abstand zur selben Uhrzeit → „Jeden <Wochentag>“; sonst „Regelmäßig“. (14-tägliche Reihen wie die Fixture „Krabbelreime“ heißen also „Freitags“.)
  - Kosten: „Kostenlos“ / `price` / „Kostenpflichtig“.
  - Anmeldung: „Anmeldung nötig“ (umrandet) / „Ohne Anmeldung“.
  - Verfügbarkeit: `frei` → „Plätze frei“ (`#A6DB5E`), `wenige` → „Wenige Plätze“ (`#FFD93B`), `ausgebucht` → „Ausgebucht“ (`#FF9A9A`), `warteliste` → „Warteliste“ (`#FF9A9A`), Text immer `#13212E`. `unbekannt` und `ohne-anmeldung` → kein Chip.
  - Altershinweis „6–24 Monate“ (gestrichelt), nur bei einer unpassenden Karte, die per „trotzdem zeigen“ sichtbar ist.
- In Kalender-Agenda und Merkliste lautet die Kopfzeile „Di 6.10. · 9:30 Uhr“ bzw. Uhrzeit. Die Merkliste zeigt den nächsten Termin mit Datum.
- Herz: `button` mit festem Label „<Titel> merken“ und `aria-pressed` (ein wechselndes Label ergäbe „nicht mehr merken, gedrückt“).

### E10 – Kategorien-Sticker

Die Sticker-Leiste zeigt alle 12 Kategorien (Kurzlabel aus dem Mockup: Babykurse, Krabbeln, Treffs, Bewegung, Wasser, Musik, Kreativ, Bücher, Museum, Bühne, Natur, Beratung) als horizontal scrollende Leiste. Antippen schaltet den Kategorie-Filter (`kat`). Der Button-Name ist das volle Label („Krabbel- & Spielgruppen“), dazu `aria-pressed`. Ist ein Filter aktiv, werden die anderen Sticker gedimmt. Eine Kategorie „Glaube“ würde eine 13. Farbe und Form brauchen und betrifft nur 9 Angebote. Sie bleibt unter „Treffs & Cafés“; der Ideen-Eintrag wird als entschieden entfernt und der Kommentar an `krabbelgottesdienst` in `src/domain/topics.ts` auf „entschieden in Plan 0003“ geändert.

### E11 – Alter: anzeigen statt verstecken

- Das Kind-Sheet nimmt das Geburtsdatum als Text `TT.MM.JJJJ` (`inputmode="numeric"`, Label „Geburtsdatum“), nicht als `type="date"`. Das native Feld zeigte im Mockup-Review das Geräte-Locale-Format. Parsing in der Domäne: `parseGermanDate(text, today)` liefert ein ISO-Datum oder `undefined`.
  - Die iOS-Zifferntastatur hat keinen Punkt. Deshalb gelten auch `01092026` und die Trenner `,` `/` Leerzeichen. Beim Verlassen des Feldes wird ein gültiger Wert als `01.09.2026` angezeigt.
  - Abgelehnt werden ungültige Kalendertage und Tage in der Zukunft. Hinweistexte: gültig „Dein Kind ist heute 11 Monate alt.“, ungültig „Bitte als TT.MM.JJJJ eingeben, z. B. 02.11.2025.“, leer „Ohne Geburtsdatum zeigen wir alle Angebote.“ Darunter „Bleibt nur auf diesem Gerät.“
  - Gespeichert wird wie bisher ISO unter `zwergenplan.geburtsdatum`, sobald der Text gültig ist; ein leeres Feld löscht.
- Schalter „Nur passende Angebote“ (Standard: an, gespeichert unter `zwergenplan.nur-passende`).
  - An und Geburtsdatum gesetzt: unpassende Angebote fallen heraus. Unter der Statuszeile steht „12 passen nicht zu 11 Mon.“ (bzw. „1 passt nicht …“) mit dem Link-Button „trotzdem zeigen“ (danach „ausblenden“). Sichtbar gemachte erscheinen gestrichelt, ohne Schatten und mit Altershinweis. Der Button liegt außerhalb der `role="status"`-Region.
  - „trotzdem zeigen“ ist Sitzungszustand im Speicher, gilt für Liste **und** Kalender und wird zurückgesetzt, wenn sich das Geburtsdatum ändert.
  - Aus: alle Angebote, unpassende gestrichelt markiert.
  - „Filter zurücksetzen“ setzt nur Kategorie/Format/Anmeldung/Kosten zurück, nie Alter oder „Nur passende“.
- Domäne: `applyFilters` bekommt kein Geburtsdatum mehr, sondern filtert nur nach Kategorie, Format, Anmeldung, Kosten und „vorbei“. Neu ist `splitByAge(offers, birthDate, now)` → `{ fitting, unfit }` in `age.ts`. Die Altersregel bleibt `offerFitsAge` (Invariante unverändert).
- Kind-Chip im Header: „Alter?“ ohne Datum, sonst „11 Mon.“ (unter 24 Monaten) bzw. „2 J.“. Die Formatierung liegt in `format.ts`, das Alter kommt aus `ageInMonths(birth, now)`.
- Detail „Alter“-Etikett: „6–24 Monate“ (ohne Angabe „0–36 Monate“). Darunter: „Passt: am Di 6.10. 11 Monate alt“, „Passt nicht: …“ oder „Geburtsdatum eintragen, dann prüfen wir das“. Logik: `ageCheck(offer, birth, now, session?)` in `age.ts`, liefert `{ fits, at, months }`. Stichtag:
  - Kurs und einmalig: erster Termin.
  - Regelmäßig mit vorgegebenem Termin (Detail aus der Kalender-Agenda geöffnet): dieser Termin.
  - Regelmäßig sonst: der erste kommende Termin, der passt, sonst der nächste. Damit widerspricht das Detail nie der Liste (`offerFitsAge`: „irgendein kommender Termin“).

### E12 – Merkliste

- Gespeichert als JSON-Array von Offer-IDs unter `zwergenplan.merkliste` (`src/data/preferences.ts`). Kaputte Werte zählen als leer.
- `savedOffers(all, ids, now)` in `src/domain/saved.ts` liefert die gemerkten, noch nicht vorbei-en Angebote, sortiert nach nächstem Termin. IDs, die im aktuellen Datenstand fehlen, werden nur ausgeblendet, nie gelöscht: Ein lückenhafter Pipeline-Lauf darf keine Merkliste leeren. (Die Liste wächst dadurch langsam; ein paar Dutzend IDs sind im `localStorage` belanglos.)
- Die Merkliste ignoriert Filter und „Nur passende“: Gemerkt ist gemerkt. Unpassende erscheinen gestrichelt mit Altershinweis.
- Leerzustand: „Hier klebt noch nichts“ / „Tipp auf das Herz bei einem Angebot. Hier sammelst du deine Favoriten und holst sie mit einem Tipp in deinen Kalender.“ / Link-Button „Angebote entdecken“.
- Badge an der Tab-Leiste mit der Anzahl.
- „Alle gemerkten in den Kalender“ erzeugt **clientseitig** eine ICS-Datei mit allen Terminen (`icsForCollection` in `ics.ts`, gleiche VEVENTs und UIDs wie die statischen Dateien). Das ist eine bewusste Ausnahme von „ICS entstehen statisch“: **ADR 0007**, Invariante in `docs/architecture.md` angepasst. `DTSTAMP` = `generatedAt`, `X-WR-CALNAME` = „Zwergenplan – Merkliste“. Download als Blob mit `<a download="zwergenplan-merkliste.ics">`, `revokeObjectURL` erst nach 10 s. Die Auswahl der Termine:
  - Kurs: alle Termine („Kurse immer komplett“, wie die statische Datei).
  - Regelmäßig und einmalig: alle nicht beendeten Termine.
  Die Zusammenfassung sagt „2 Sticker · 14 Termine in einer .ics-Datei · Kurse immer komplett“. `ics.ts` importiert Zod nur als Typ, das Modul darf also in den Client (Regel `no-zod-in-client-transitive` bleibt grün).
- Toasts: „Eingeklebt – liegt jetzt in deinem Stickerheft“ bzw. „Sticker abgelöst – nicht mehr gemerkt“. Eine dauerhaft vorhandene `role="status"`-Region, die Text 2,8 s zeigt.

### E13 – Detail

Inhalt wie im Mockup:
- Kopf mit Zurück und Herz.
- Bigsticker in Kategoriefarbe und -form, Kategorie-Name, Anbieter.
- Titel (`h2`) und `summary`.
- Etiketten:
  - **Wann**: Kurs „Kurs mit 8 Terminen“ + „Di 13.10. bis Di 1.12., jeweils 9:30–11:00“ (bei uneinheitlicher Uhrzeit ohne „jeweils …“, `uniformTimes`). Regelmäßig „Jeden Mittwoch, 10:00–11:30“ / „Freitags“ / „Regelmäßig“ (`rhythm`, siehe E9) + „Einzeln besuchbar“ nur bei `ohne-anmeldung`, sonst „N kommende Termine“. Einmalig „Samstag, 17. Oktober“ + „10:00–11:00 Uhr“.
  - **Wo**: Ortsname, darunter Adresse · Stadtteil.
  - **Alter** (E11).
  - **Kosten**: „Kostenlos“ / `price` / „Kostenpflichtig“.
  - **Anmeldung**: „Anmeldung nötig“ / „Ohne Anmeldung“, darunter `registrationWindow` („Anmeldung ab 1.10.“ / „bis 12.10.“), falls vorhanden.
- Verfügbarkeits-Stempel (nur frei/wenige/ausgebucht/warteliste): Status, `availability.note` falls vorhanden, „Momentaufnahme vom 3.10. – kann sich geändert haben.“ (`checkedAt`), Link „Beim Anbieter prüfen“.
- Termine: die nicht beendeten, erst 4, dann „Alle N Termine zeigen“.
- Link „Website von <Anbieter>“ (`offer.url`, `target=_blank`, `rel=noopener`).
- Fuß „In den Kalender holen (.ics)“, alles echte Links auf die statischen Dateien:
  - Regelmäßig: „Nur Mi 7.10.“ (`sessionIcsPath` des nächsten Termins) und „Alle N Termine“ (`seriesIcsPath`, N = `sessions.length`).
  - Kurs: „Alle 8 Kurstermine in den Kalender“.
  - Einmalig: „In den Kalender“.
- Wird das Detail aus der Kalender-Agenda geöffnet, gilt dort der gewählte Tag als „nächster“ Termin (für „Nur …“ und die Markierung in der Terminliste).

### E14 – Kalender

- Wochenleiste (Mo–So) mit Navigation. Vergangene Tage sind `disabled` (axe ignoriert so den gedimmten Kontrast). Unter jedem Tag bis zu 3 Kategorie-Formen der Angebote des Tages.
- „Ganzen Monat zeigen“ klappt ein Monatsraster auf (Mo-erste Spalte, Formpunkt der ersten Kategorie). Ein Tag dort wählt den Tag und klappt zu.
- Darunter die Agenda des gewählten Tages: alle gefilterten Angebote mit einem Termin an diesem Berliner Tag, nach Uhrzeit. Leer: „Freier Tag“.
- Grenzen: Zurück ist ab der aktuellen Woche bzw. dem aktuellen Monat gesperrt. Vor ist gesperrt, wenn die Woche bzw. der Monat nach dem letzten Termin der Daten beginnt.
- Domäne `agenda.ts`: `sessionsByDay(offers)` → `Map<Tag, { offer, session }[]>` nach Uhrzeit, einmal je Filterstand berechnet (bei 2 889 Terminen wäre eine Suche je Rasterzelle zu teuer). `weekDays(isoDate)` → 7 ISO-Daten ab Montag, `monthDays(isoDate)` → `{ lead, days }` (der 1. bekommt `grid-column-start`, keine Leerzellen), `lastSessionDay(offers)`. Kalendertage immer über `berlinIsoDate`.
- Touch-Ziele: Bei 360 px Breite (Inhalt 328 px) sind 7 Spalten knapp. Exakte Boxen:
  - Wochenleiste: kein Rand, Abstand 2 px → (328 − 12) / 7 = 45,1 px.
  - Monatsraster: Außenrand 0, Rahmen 2 px, Innenabstand 4 px, Abstand 0 → (328 − 4 − 8) / 7 = 45,1 px.
  - Der Gate-Test bei 360 px beweist das. Bei 320 px gilt nur „kein horizontales Scrollen“ (das Gate misst dort keine Touch-Ziele, die Tage sind dann ~39 px breit, über WCAG 2.5.8 mit 24 px).
- Der Kalender nutzt dieselben Filter (Chips), dieselbe Altersregel und denselben „trotzdem zeigen“-Zustand wie die Liste. Sticker-Leiste nur auf „Entdecken“.
- Der gewählte Tag und „Monat offen“ sind Sitzungszustand im Speicher (nicht in der URL). Start: heute.
- Agenda-Überschrift: „Heute, 5. Oktober“ / „Morgen, 6. Oktober“ / „Mittwoch, 7. Oktober“ + „2 Angebote“ bzw. „1 Angebot“. Leer: „Freier Tag“ / „Kein Sticker für diesen Tag – Zeit für den Spielplatz.“

### E15 – Darstellung (Theme)

- `zwergenplan.darstellung` = `hell | dunkel` (fehlt = automatisch) in `preferences.ts`.
- Ein kleines Inline-Skript in `index.html` setzt `data-theme` vor dem ersten Paint (kein Aufblitzen). Es liest nur diesen einen Schlüssel und ist in `try/catch` gekapselt.
- Header-Knopf: wechselt zwischen Hell und Dunkel (ausgehend vom aktuell sichtbaren Theme). Kind-Sheet: Segment Automatisch/Hell/Dunkel. Unter 360 px Breite entfällt der Header-Knopf (Platz für Titel und Kind-Chip), die Darstellung bleibt im Kind-Sheet.

### E16 – Filter-Bedienung

- Schnellfilter-Chips (Entdecken und Kalender), horizontal scrollend, in dieser Reihenfolge:
  1. „Filter“ mit Regler-Icon und Badge = `activeFilterCount` (öffnet das Filter-Sheet; Name „Alle Filter, N aktiv“).
  2. „Kostenlos“ (`kosten=kostenlos` an/aus).
  3. „Ohne Anmeldung“ (`anmeldung=ohne-anmeldung` an/aus).
  4. „Kurse“, „Regelmäßig“, „Einmalig“ (`format`, je an/aus).
  Gewählte Chips sind gefüllt (`--ink`) mit Häkchen und `aria-pressed="true"`.
- Filter-Sheet („Filter“), wirkt **sofort** (kein „Anwenden“):
  - „Art“: 12 Kategorie-Chips mit Form, gewählt in Kategoriefarbe.
  - „Format“: Kurs, Regelmäßig, Einmalig (Mehrfachwahl).
  - „Anmeldung“: Egal, Ohne Anmeldung, Mit Anmeldung (Einfachwahl; Egal = leere Liste).
  - „Kosten“: Egal, Kostenlos, Kostenpflichtig (Einfachwahl).
  - Fuß: „Zurücksetzen“ (alle vier Dimensionen leeren) und primär „N Angebote zeigen“ bzw. „1 Angebot zeigen“ (schließt).
- Jeder Filterwechsel setzt das Listen-Limit (E8) zurück. Die Logik `toggleIn`/`activeFilterCount` liegt in `filter.ts`.

### E17 – Lade-, Fehler- und Leerzustände

- Laden: Kopf, Sticker und Chips stehen sofort. Darunter „Lade Angebote …“ (`role="status"`) und drei Platzhalter-Kacheln in Kachelhöhe (gestrichelt, ohne Text), damit beim Eintreffen der Daten nichts springt (CLS).
- Fehler: `role="alert"` mit der Meldung und einem Button „Nochmal versuchen“, der neu lädt.
- Liste leer mit Filtern: „Diese Seite ist noch leer“ / „Mit diesen Filtern gibt es keine Angebote.“ / Link-Button „Filter zurücksetzen“.
- Liste leer ohne Daten (0 Angebote im Datenstand): „Noch keine Angebote – Daten folgen.“
- Statuszeile (genau eine `role="status"`-Region auf der Seite): „<b>N</b> Angebote ab heute“ bzw. „1 Angebot ab heute“.
- Merkliste: „2 Sticker · 14 Termine in einer .ics-Datei · Kurse immer komplett“ (Singular: „1 Sticker“, „1 Termin“).
- Fußzeile der Liste: „Datenstand: 4.10.2026“ (`generatedAt`).

## Struktur

```
src/domain/
  agenda.ts (+test)     upcomingSessions, nextSession, referenceSession, sessionOnDay, groupByNextSession, takeGroups, sessionsByDay, weekDays, monthDays, lastSessionDay, courseProgress, rhythm, uniformTimes
  age.ts (+test)        + splitByAge, ageCheck, ageVisibility, DEFAULT_AGE
  calendar.ts (+test)   calendarNav, clampDay (Kalender-Grenzen)
  ids.ts (+test)        + OFFER_ID_PATTERN (eine Quelle für schema.ts und route.ts)
  saved.ts (+test)      toggleId, savedOffers, collectionSessions
  ics.ts (+test)        + icsForCollection, icsContextFor (Einzel- und Sammel-ICS gleich, ADR 0007)
  route.ts (+test)      parseRoute / routeToSearch (ansicht, angebot, Filter)
  time.ts (+test)       + berlinIsoDate, parseGermanDate, formatGermanDate
  filter.ts (+test)     applyFilters ohne Alter, + activeFilterCount, toggleIn
src/data/
  site.ts               loadSiteData, assetUrl
  preferences.ts        Geburtsdatum, Merkliste, Darstellung, nur-passende (localStorage, try/catch)
src/ui/
  App.tsx               Laden, URL-Zustand, Tabs, Overlays
  Chrome.tsx            Header, Stickers, QuickFilters, TabBar
  OfferCard.tsx  ListView.tsx  CalendarView.tsx  SavedView.tsx  DetailDialog.tsx
  Sheets.tsx            FilterSheet, KidSheet (Inhalte der Dialoge)
  Dialog.tsx            Hülle um das native <dialog> (E3)
  Toast.tsx
  icons.tsx             SVG-Icons (Mockup-Pfade)
  categories.ts         Kategorie → Kurzlabel, Form (SVG-Pfad)
  format.ts (+test)     Datums-/Zeit-/Fakten-Texte (Test läuft in America/Los_Angeles)
  use-app-state.ts      Hooks: URL-Route, Präferenzen, Toast
  use-offer-views.ts (+test)  abgeleitete Ansichten: Sichtbarkeit nach Alter, Seiten, Kalendertag, Merkliste, Detail
  styles.css            Einstieg: Tailwind und @imports, Reihenfolge = Kaskade (E5)
  styles/               tokens (Fallback-Schriften, Farben, @theme, Kategorien), base, chrome, list, card,
                        tabs, calendar, dialog (Hülle, Detail), sheet (Sheets, Toast), motion (reduzierte Bewegung, zuletzt)
index.html              Theme-Inline-Skript, theme-color
```

Alle Dateien bleiben unter ~250 Zeilen. Die Schichtregeln bleiben unverändert: Domäne ohne React, UI liest Daten nur über `src/data`, kein Zod im Client.

## Tests

Test-first für alle Domänenfunktionen (Vitest, TZ `America/Los_Angeles`, Coverage ≥ 90 %):
- `agenda`: Gruppierung über Mitternacht Berlin (Termin 00:30 Berlin = Vortag in UTC), Zeitumstellung 25.10., laufende Kurse am nächsten Termin, Tie-Break, `takeGroups` nimmt genau `limit` und kürzt die letzte Gruppe, `sessionsByDay`, `weekDays` über Monats-/Jahresgrenze, `monthDays` (Leerspalten für Monate, die am Sonntag beginnen), `courseProgress`, `rhythm` (wöchentlich, 14-täglich, gemischt, ein Termin, wechselnde Uhrzeit), `uniformTimes`.
- `age`: `splitByAge` respektiert die Regel „regelmäßig: irgendein künftiger Termin“; `ageCheck` liefert Stichtag und Monate, bei regelmäßig den ersten passenden kommenden Termin (Fall: am 7.10. 5 Monate, am 4.11. 6 Monate → „Passt“).
- `saved`: Toggle, unbekannte IDs werden ausgeblendet, Sortierung nach nächstem Termin, `collectionSessions` (Kurs komplett, sonst nur künftige).
- `ui/format`: Gruppentitel „Heute/Morgen/Wochentag“, Kurzdatum, Uhrzeiten über die Zeitumstellung, Pluralformen, Alterslabel. Läuft in Vitest unter `America/Los_Angeles` (src/ui zählt nicht zur Coverage-Schwelle, wird aber getestet).
- `ics`: `icsForCollection` hat dieselben UIDs wie `icsForSeries`, ein VCALENDAR, Faltung, deterministisch.
- `route`: Round-Trip, unbekannte Werte verworfen, Geburtsdatum kommt nie vor.
- `time`: `parseGermanDate` (1.2.2026, 01.02.2026, `01092026`, `1,9,2026`, 31.02. ungültig, Zukunft ungültig, Leerzeichen), `berlinIsoDate` kurz vor Mitternacht.
- `filter`: bestehende Tests angepasst (Alter raus), `activeFilterCount`.

E2E (Fixtures, eingefrorene Uhr Mo 5.10.2026 12:00):
- `app.spec.ts` (angepasst):
  - Liste nach Tagen mit erstem Gruppentitel „Mittwoch“ und „Offener Krabbeltreff“ zuerst.
  - Vergangenes fehlt.
  - Filter per Chip und Sticker in der URL, überleben das Neuladen.
  - Geburtsdatum im Kind-Sheet als „01.09.2026“: Filter, nie in der URL, überlebt das Neuladen. „trotzdem zeigen“ zeigt die unpassenden gestrichelt.
  - Leerzustand mit „Filter zurücksetzen“.
- `detail.spec.ts`:
  - Öffnen per Karte, URL hat `angebot=`, Zurück-Geste (`page.goBack()`) schließt, Deep-Link öffnet direkt.
  - Kurs-ICS (8 VEVENTs, DTSTART nach Zeitumstellung).
  - Regelmäßig „Nur …“ liefert genau 1 VEVENT.
  - Verfügbarkeits-Stempel bei „wenige“.
  - `Esc` schließt.
- `calendar.spec.ts`: Woche zeigt Formpunkte, Tag wählen zeigt die Agenda, Monatsraster, Grenzen der Navigation, „Freier Tag“.
- `saved.spec.ts`:
  - Herz merkt, Badge zählt, Toast erscheint.
  - Merkliste überlebt das Neuladen und steht nicht in der URL.
  - Gesamt-ICS per Download (`page.waitForEvent("download")`) mit erwarteter VEVENT-Zahl.
  - Leerzustand.
- `theme.spec.ts`: Header-Knopf schaltet `data-theme`, Wahl überlebt das Neuladen, „Automatisch“ folgt `prefers-color-scheme`.
- `timezone.spec.ts`: `test.use({ timezoneId: "America/Los_Angeles" })`, Uhr auf Di 6.10. 00:30 Berlin (= Mo 15:30 in LA). Die Liste beginnt mit „Morgen“ (Mi 7.10.), der Kalender markiert Dienstag als heute.
- `fixtures.ts`: neue Auto-Fixture, die jeden Request auf einen fremden Origin rot macht (Privatsphäre-Invariante, keine Drittanbieter-Requests).
- `mobile-ux.spec.ts`: Gates (hell und dunkel) für Entdecken, Kalender (mit offenem Monat), Merkliste (mit Einträgen), Detail, Filter-Sheet und Kind-Sheet. Dazu 320 px/200 % für Entdecken, Kalender, Detail und beide Sheets sowie die Fokusprüfung auf Desktop für die Startseite und im Detail-Dialog.
- `smoke.spec.ts` (echte Daten): bestehende Gates + „Weitere Angebote zeigen“ vorhanden + LCP/CLS-Budget.
- `scripts/screenshots.ts`: zusätzlich Kalender, Merkliste, Detail und Filter-Sheet für `/browser-review`.

## Backpressure

Keine Schwelle wird gesenkt. Neu:
- `.size-limit.json` bleibt (JS 90 kB, CSS 15 kB). Fonts zählen nicht ins JS/CSS-Budget, werden aber in `/browser-review` geprüft (nur die Latin-Datei wird geladen).
- `knip`: `@fontsource-variable/bricolage-grotesque` wird per `import` in `src/main.tsx` genutzt, knip erkennt das.
- `e2e/mobile-ux.ts`: `settle()` wartet vor jeder Messung auf endliche Animationen. WebKit spielt sie trotz `reducedMotion` ab, mitten in `scale(.98)` misst ein 44-px-Knopf 43 px. Die Schwellen bleiben.
- `biome.json`: `docs/design/` (Referenz-Mockup, wird nie ausgeliefert) ist vom Lint ausgenommen.
- `docs/architecture.md`: Bei Mobile-UX-Gates wird ergänzt, dass Overlays (`dialog`) eigene Gate-Aufrufe brauchen.

## Schritte

1. Plan, `/plan-review`, Review einarbeiten.
2. Domäne test-first: `time` → `agenda` → `age` → `filter` → `saved` → `ics` → `route`.
3. `src/data/preferences.ts`, Font-Abhängigkeit, Tokens und Komponenten-CSS.
4. UI-Komponenten, Liste zuerst, dann Detail, Sheets, Kalender, Merkliste, Theme.
5. E2E anpassen bzw. ergänzen, `pnpm check:fast` und `pnpm check` grün.
6. `/arch-review`, einarbeiten.
7. Commit, Push auf `design-stickerheft`, CI grün. Fast-Forward nach `main` durch den Nutzer (Hintergrund-Session pusht nicht auf `main`).
8. `/browser-review` live, Ergebnis hier anhängen. Plan 0004 (Karte, Entfernung) schreiben.

## Akzeptanzkriterien

- Alle Ansichten aus E7–E15 sind umgesetzt und per E2E abgedeckt. Jede Ansicht und jedes Overlay besteht `expectMobileUx` hell und dunkel.
- `pnpm check` grün, CI grün, Budgets unverändert eingehalten.
- Geburtsdatum, Merkliste und Darstellung erscheinen nie in URL oder Requests (E2E prüft die URL; keine neuen Requests außer eigenen Assets).
- Echte Daten: Liste lädt mit LCP < 2,5 s und CLS < 0,05 (gedrosselt), „Weitere Angebote zeigen“ funktioniert.
- `docs/ideas.md`: Einträge „Lange Listen“, „Verfügbarkeit auf der Karte“, „Sortierung nach nächstem Termin“ (bis auf den Einstiegs-Hinweis) und „Kategorie Glaube“ als erledigt bzw. entschieden entfernt.

## Risiken

- **iOS und Blob-Download der Merklisten-ICS**: Safari bietet Blob-`.ics` evtl. nur als Datei-Download statt „Zum Kalender hinzufügen“ an. Prüfung im Browser-Review auf echtem iPhone durch den Nutzer. Ausweichweg: Die Merkliste listet zusätzlich die statischen Einzel-Links.
- **Font-Swap und CLS**: siehe E6, gemessen im Perf-Test.
- **Touch-Ziele im Kalender** bei 360 px knapp: E14, durch Gate bewiesen. Reicht es nicht, wird die Wochenleiste horizontal scrollbar.
- **Bundle**: React allein hat ~60 kB. Die UI soll ≤ 12 kB gzip dazukommen. Lazy Loading hilft nicht: `.size-limit.json` zählt alle Chunks unter `dist/assets/*.js` zusammen. Wird es knapp, wird Code verschlankt (z. B. Icons zusammenlegen), das Budget bleibt.
- **Umfang**: Der Plan ist groß. Reihenfolge der Umsetzung so, dass nach jedem Block (Liste + Detail, Sheets, Kalender, Merkliste) `pnpm check:fast` grün ist.

## Review (unabhängiger Subagent `plan-reviewer`, 2026-10-04) – Verdict: „Freigabe mit Änderungen“ → eingearbeitet

Blocker:
- **B1** Merklisten-ICS im Browser widerspricht der Invariante „ICS statisch zur Build-Zeit“. → ADR 0007, Invariante in `docs/architecture.md` ergänzt, DTSTAMP/CALNAME in E12 festgelegt.
- **B2** `inputmode="numeric"` hat auf iOS keinen Punkt. → `parseGermanDate` akzeptiert `TTMMJJJJ` und die Trenner `,` `/` Leerzeichen (Unit-Tests), Anzeige wird beim Verlassen normalisiert (E11).
- **B3** Mockup war git-ignoriert. → `docs/design/stickerheft-mockup.html` committet; Chips, Filter-Sheet und Statusfarben im Plan ausgeschrieben (E9, E16).

Wichtig (alle übernommen):
1. `ageCheck` regelmäßig: erster passender kommender Termin (E11, Unit-Test).
2. „Jeden <Wochentag>“ nur bei lückenlosem 7-Tage-Rhythmus und gleicher Uhrzeit (`rhythm`), „Einzeln besuchbar“ nur ohne Anmeldung (E9, E13).
3. Schriftname `"Bricolage Grotesque Variable"`, Import in `main.tsx` (E6). `opsz` bleibt wegen der Titel-Wirkung, Begründung in E6.
4. Dialog: immer gemountet, `cancel` abgefangen, Flag in `history.state`, Scroll-Sperre, Safe-Area (E3, E4).
5. Toast-Region im offenen Dialog (E3).
6. Exakte Boxen für Wochen- und Monatsraster (E14).
7. Stretched-Button mit `min-height: 44px` und eigenem Fokusrahmen (E9).
8. `src/ui/format.test.ts` in fremder Zeitzone und `timezone.spec.ts` (Tests).
9. Lade-, Fehler-, Leerzustände, Pluralformen, „trotzdem zeigen“-Zustand, Merkliste ohne Filter, Kalendertag im Speicher (E11, E12, E14, E17).
10. Budget-Ausweg „lazy laden“ gestrichen (Risiken).

Hinweise: übernommen sind `animation-iteration-count`, keine `stick`-Animation beim ersten Rendern (LCP), festes Herz-Label, eine einzige `role="status"`-Region, Fremd-Origin-Fixture, zusätzliche 320/200-%-Gates und Fokus im Detail, verzögertes `revokeObjectURL`, kein endgültiges Löschen gemerkter IDs (statt `pruneSaved`), Kommentar in `topics.ts`, ADR 0005 als Auftrag für Plan 0004. Der Font-Fallback mit `size-adjust` kommt nur, wenn der Perf-Test ihn braucht (E6). Den Plan nicht zu teilen ist bewusst: Kalender und Merkliste teilen Karte, Filter und Altersregel; die Umsetzung läuft in Blöcken mit jeweils grünem `check:fast`.

## Übergabe (Stand 2026-10-04, Session-Wechsel wegen Kontextgröße)

Branch `design-stickerheft` (Worktree `.claude/worktrees/foundation`), gepusht, **noch nicht auf `main`**. Commits: `e6148d7` (Plan, ADR 0007, Mockup), `32a7cf1` (Umsetzung). Lokal ist `pnpm check` komplett grün (194 Unit-Tests, Coverage 98/91 %, 239 E2E, JS 81,4/90 kB, CSS 8,1/15 kB).

Offen, in dieser Reihenfolge:

1. **CI rot (Run 37211292322):** `e2e/perf.spec.ts` auf `pixel-7` (Fixture-Build) misst CLS 0,38, auch im Retry; lokal grün. Verdacht: Die Fallback-Schrift auf dem CI-Linux ist breiter, Kopfzeile/Titel brechen anders um, der Font-Swap verschiebt alles. Vorgehen: lokal mit `fc-match system-ui` bzw. im Playwright-Docker-Image nachstellen, Layout-Shift-Quellen per `PerformanceObserver` (`entry.sources`) ausgeben. Lösung laut E6: Fallback-`@font-face` mit `size-adjust`/`ascent-override` auf eine überall vorhandene Schrift (z. B. `local("DejaVu Sans")`, `local("Arial")`), oder `font-display: optional` + preload der Latin-Datei. Schwelle bleibt 0,05.
2. **Arch-Review** (Abschnitt unten): die 7 wichtigen Befunde umsetzen, Hinweise nach Aufwand, `pnpm check` grün.
3. Push, CI grün auf dem Branch (`gh run watch`). Dann bringt der Nutzer den Branch per Fast-Forward nach `main` (Hintergrund-Sessions pushen nicht auf `main`), CI grün auf `main`, Deploy.
4. **`/browser-review` live** auf https://sbiastoch.github.io/zwergenplan/ mit echten Daten, Ergebnis hier anhängen. Hilfsmittel: `node scripts/screenshots.ts <URL> [--views=start,kalender,merkliste,detail,filter,kind]` → `e2e/.artifacts/screens/`. Besonders prüfen: Blob-ICS der Merkliste auf einem echten iPhone (ADR 0007), nur eine Schriftdatei im Netzwerk, Kalender-Touch-Ziele.
5. Plan 0004 (Karte mit MapLibre + OpenFreeMap, Entfernung; ADR 0005 beachten) schreiben.

Hinweise für die nächste Session:
- Bash-Heredocs und komplexe Pipes lehnt die Worktree-Sandbox teils ab: Dateien mit Write/Edit ändern, Befehle einfach halten.
- Preview-Server belegen die Ports 4173/4174; vor `playwright test` ggf. `fuser -k 4173/tcp 4174/tcp`.
- Den Smoke-Test einzeln mit `--project=smoke-echte-daten --no-deps` starten (er hängt sonst an allen anderen Projekten).

## Arch-Review (Subagent `arch-reviewer`, 2026-10-04) – Verdict: „Nacharbeit nötig“, keine Blocker → Befunde 1–7 erledigt

Bestätigt: Schichtregeln, „jetzt“ nur in `App.tsx`, kein Zod im Client, gleiche UIDs. Die drei Gate-Änderungen (smoke seriell, biome-Ausnahme, `settle()`) sind legitim, keine Schwelle gesenkt.

Wichtig (umsetzen):
1. Termin-/Zeitlogik aus `DetailDialog.tsx` in die Domäne: `upcomingSessions(offer, now)` (ersetzt das Prädikat an 7 Stellen) und `referenceSession(offer, now, day?)` in `agenda.ts`; `whenLabels`/`registrationNote` nach `format.ts` mit Tests (Einmalig, Kurs mit wechselnder Uhrzeit, „Freitags“, `registrationWindow`).
2. Kalender-Grenzen aus `CalendarView.tsx` in die Domäne: `calendarNav(day, today, lastDay)` + `clampDay`, Tests inkl. Jahreswechsel.
3. Alters-Sichtbarkeit aus `App.tsx:66-77` nach `age.ts`: `ageVisibility(filtered, upcoming, birthDate, now, { ageOnly, showUnfit })` → `{ visible, hiddenCount, unfitIds }`, Unit-Test.
4. Offer-ID-Regex nur einmal: `OFFER_ID_PATTERN` in `ids.ts`, genutzt von `schema.ts` und `route.ts`.
5. ADR 0007 absichern: `icsContextFor(offer, generatedAt)` in der Domäne (genutzt von `SavedView.tsx` und `scripts/build-data.ts`), Test vergleicht ganze VEVENT-Blöcke, `icsForCollection` wirft bei fremdem Termin (Index −1).
6. Reduzierte Bewegung wirklich prüfen: Reduce-Block um `animation-delay: 0s` und `transition-delay: 0s` ergänzen; Gate `expectReducedMotion` (alle Animationen ≤ 1 ms) in allen Projekten inkl. WebKit; `settle()` bleibt mit benannter Ursache.
7. Dateigrößen: `styles.css` per `@import` aufteilen (tokens, base, card, calendar, dialog, tabs), Zustand aus `App.tsx` in `useOfferViews`; Struktur-Abschnitt des Plans an `Chrome.tsx`/`Sheets.tsx`/`Dialog.tsx` anpassen.

Hinweise (nach Aufwand):
- 8 Doppel-Esc/-Zurück ruft `history.back()` zweimal (Schutz-Ref); `Dialog.tsx` auf natives `close` reagieren.
- 9 Merkliste über zwei Tabs: in `toggle` frisch `loadSaved()`, `storage`-Ereignis abonnieren; kein Ref-Schreiben im Render.
- 10 Cast in `use-app-state.ts:66` durch Type-Guard ersetzen; `NO_INDEX` typisieren.
- 11 `DEFAULT_AGE` aus `age.ts` exportieren statt in `format.ts` zu wiederholen.
- 12 `now` bei `visibilitychange` erneuern (über Nacht offener Tab).
- 13 Duplikate: Theme-Farben (index.html, use-app-state, CSS), dunkle Tokens per `light-dark()`, Wochentagsköpfe, Web-Vitals-Helfer `e2e/vitals.ts`, `savedOffers` liefert `Occurrence[]`.
- 14 Doku: architecture.md-Privatsphäre-Invariante um Merkliste/Darstellung und den `thirdPartyGuard` ergänzen; CLAUDE.md: `--no-deps` für den Smoke-Test, veralteter BOOTSTRAP-Abschnitt; Plan E10 (Sticker-Name „Kurz: Voll“); visuelle Regression (ADR 0004, ideas.md) jetzt bewusst entscheiden.
- 15 ADR 0001: Font-Abhängigkeit in die Stack-Liste.
- 16 E2E: Fehler-/Ladezustand („Nochmal versuchen“ per `page.route` 500) mit `expectMobileUx`; Smoke 320 px/200 % auch für Detail und Kalender mit echten Daten.

### Nacharbeit (2026-10-04, zweite Session)

- **CI-CLS behoben** (`3c69c47`): Fallback-Schriften mit Bricolage-Maßen (siehe E6). Lokal nachgestellt mit DejaVu als Fallback (CLS 0,379, Quelle: Kopfzeile bricht um), danach mit Arial/Noto/DejaVu ≤ 0,0032. CI-Lauf 37212117010 grün.
- **Befunde 1–7 erledigt**, parallel in drei Worktrees, test-first: 1/4/5 Domäne (`652ccdb`), 2/3/7b Kalender/Alter/`useOfferViews` (`11bef82`), 6/7a CSS-Split und `expectReducedMotion` (`45d0357`, Gate vorher in allen 60 Fällen rot: `peel` 1 s, `peelin` 100 ms Delay). Hinweis 11 (`DEFAULT_AGE`) gleich mit.
- **Zweiter Arch-Review** über `729b3c8..HEAD`: Verdict OK, keine Blocker, nichts Wichtiges. Umgesetzt: `applyFilters` nutzt `nextSession` statt eigenem Prädikat, `expectReducedMotion` wertet unbekannte Dauern (`auto`) als Verstoß, Doku-Drift (E6, Struktur). Offen, optional: eine Quelle für die Formate (`schema.ts`, `ids.ts`, `filter.ts`), Roboto-Fallback, Hinweise 8–10, 12–16 von oben, unbegründete `as never` in `ics.test.ts`.
- `pnpm check` grün: 229 Unit-Tests (Coverage 98,3/91,6 %), 239 E2E inkl. WebKit, JS 81,9/90 kB, CSS 8,5/15 kB.
- Offen aus der Übergabe: Punkte 3 (Fast-Forward nach `main` durch den Nutzer), 4 (`/browser-review` live, besonders Kalender nach dem Refactor) und 5 (Plan 0004).
