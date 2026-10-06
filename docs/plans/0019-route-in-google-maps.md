# Plan 0019 – Route in Google Maps und andere Wege

Status: **umgesetzt** (Teil A und Teil B), freigegeben nach drei Reviews, Budget-Entscheidung des Nutzers in E9. Arch-Review ohne Blocker, eingearbeitet (Abschnitt „Arch-Review“). Offen: CI auf `main`, Deploy, Browser-Review live, Gerätematrix (E8) durch den Nutzer. Nummer 0019, weil 0017 schon doppelt vergeben ist: auf `main` (Kalender) und auf dem Branch `push-0017`.
Datum: 2026-10-06
Bezug: Plan 0005 (Nicht-Ziel „Route in Karten-App öffnen“, `docs/ideas.md`), Plan 0009 und 0012 (Wegzeit, Linien, ADR 0011, ADR 0015), Plan 0010 (Anbieter-Sheet), ADR 0008 (Referrer-Policy), `docs/architecture.md` (Invarianten „Privatsphäre“ und „Startpunkt“)

## Ziel

Nutzerwunsch (2026-10-06), in zwei Nachrichten:

1. „In der Detailansicht von Angeboten und auch von den Anbietern möchte ich auf die Kachel mit der Wegezeit und der Adresse klicken können, um die Navigation mit Google Maps starten zu können. […] Wichtig ist vor allem, dass man direkt die Navigation im Handy damit starten kann, um kurz in Echtzeit nochmal zu überprüfen, wie die Verbindung ist.“
2. „Falls unsere bestehende Routing-Infrastruktur für den ÖPNV das bereits hergibt, sollen […] alternative Routen angezeigt werden, sodass ich die App gar nicht verlassen muss, um einen ganz, ganz kurzen Überblick darüber zu bekommen, wie ich zum Zielort kommen kann, also welche Optionen ich grundsätzlich habe.“ Als Beispiel nennt er: statt der schnellsten Verbindung eine mit Umstieg, dafür mit kürzerem Fußweg.

Daraus folgen diese Ziele:

- **Link nach Google Maps.** Ein Tipp auf die Kachel „Wo“ im Detail öffnet Google Maps mit der Route **zum Ort** im Modus Bus & Bahn. Auf dem Handy öffnet das die Maps-App, sonst Google Maps im Browser. Dasselbe gilt für jeden Ort im Anbieter-Sheet und für die Ortszeile im Orts-Sheet der Karte.
- **Startpunkt der Route** ist, was Google Maps auf dem Gerät als Standort hat. Der Zwergenplan gibt seinen Startpunkt nie weiter.
- Die Kachel zeigt sichtbar, dass sie ein Link ist („Route in Google Maps“ mit Icon).
- **Andere Wege, in der App.** Mit gewähltem Startpunkt und Wegzeit mit Bus & Bahn zeigt das Detail unter „Wo“ eine kleine Karte „Wege ab …“. Sie listet die gewählte Verbindung und bis zu zwei Alternativen mit anderen Linien bzw. zu Fuß, jeweils mit Minuten, Linien und Fußweg bis zum Halt. Alles wird aus den schon geladenen Daten im Browser gerechnet (E4).

## Nicht-Ziele

- **Echtzeit in der App.** Die anderen Wege kommen aus dem statischen Fahrplan (Di vormittags, ADR 0011). Für Echtzeit gibt es den Link nach Maps (E1).
- **Haltestellennamen, Umstiegsort, Abfahrtszeiten.** `wegzeit.json` kennt je Zeile nur die Koordinate des Haltbereichs, keinen Namen (Formatversion 2). Wer sie will, braucht eine Datenänderung und einen eigenen Plan. Kommt als Idee nach `docs/ideas.md`.
- **Mehrere Verbindungen ab demselben Halt.** Der Build speichert je Halt-Ort-Paar genau eine Verbindung (Plan 0012, E4–E7). Alternativen ergeben sich deshalb nur über verschiedene Zugangshalte (E4).
- **Andere Wege im Orts-Sheet der Karte.** Zuerst nur im Detail, denn dort steht die Frage „wie komme ich hin“. Das Orts-Sheet bekommt nur den Link. Kommt als Idee nach `docs/ideas.md`.
- **Wegzeit je Ort im Anbieter-Sheet.** Katalog-Orte haben dort kein `geo` (`SiteProvider`). Kommt als Idee nach `docs/ideas.md`.
- **Apple Karten oder eine Wahl der Karten-App.** Der Nutzer will Google Maps.
- **Startpunkt in der Route.** Siehe E3.
- Keine Änderung an `wegzeit.json`, `linien.json`, am Build der Wegzeit, am Schema oder an den Daten.

## Ausgangslage

- **Detail** (`src/ui/DetailDialog.tsx:107`): Die Kachel „Wo“ ist ein `div.label.full`. Sie enthält den Ortsnamen (`b`), „Adresse · Stadtteil“ (`span`) und mit Startpunkt die lange Wegzeit (`ReachLong`, z. B. „ca. 25 Min. mit Bus 37 → U1 ab Gostenhof“) bzw. den Platzhalter `DistPending`. Sie ist kein Link. Die Wegzeit kommt als `reach` aus `ctx.reachOf(offer)` (`Overlays.tsx:116`).
- **Anbieter-Sheet** (`src/ui/anbieter/ProviderSheet.tsx:43`): Abschnitt „Ort“ bzw. „Orte“, je Ort ein `li` mit Name und „Adresse · Stadtteil“, ohne Wegzeit. Die Daten kommen aus `anbieter.json`.
- **Orts-Sheet** (`src/ui/karte/PlaceSheet.tsx:28`): `p.place-where` mit der Adresse und `ReachLong`. Der Stil `.place-where > span` (`map.css:143`) macht `ReachLong` und `DistPending` zu fetten Blockzeilen.
- **Wegzeit im Browser** (`src/domain/transit.ts`, `transitReach`, Lazy-Chunk): Für einen Startpunkt geht die Funktion alle Haltbereiche im Umkreis von `ACCESS_METERS` (1 500 m) durch. Je Ort rechnet sie Fußweg zum Halt plus Tabellenwert (Tür-zu-Tür ab Halt, inkl. Warten und Fußweg vom Halt). Bei gesetztem Umstiegs-Bit kommt `TRANSFER_PENALTY_MINUTES` als Aufschlag in die Wahl. Sie merkt sich **nur die beste Zeile** (`bestRow`) und liest deren Linien aus `linien.json`. Die übrigen Zeilen im Umkreis sind echte Alternativen mit eigenen Linien, die heute verworfen werden.
- **Adressen**: Die Adressen sind schon um einen wiederholten Ortsnamen gekürzt (`venueAddress`, Plan 0007, H6), viele tragen aber weiter Präfixe und Zusätze (Review 1, H1, Belege aus `data/providers.yaml`):
  - „Pfarramt Lutherkirche (Keller, Zugang vom Garten), Nerzstraße 34, …“
  - „Fürther Straße 212, Gebäude E6 (Eingang Regerstraße), 2. OG, nicht barrierefrei, 90429 Nürnberg“
  - „Kornmarkt 6, 90402 Nürnberg (Turnhalle 2. UG)“
  - ohne PLZ: „Billrothstraße 16, Nürnberg“, „Wöhrder See, Nürnberg“
  - ohne Hausnummer: „Faberpark, Rednitzstraße/Castellstraße“
- Externe Links gibt es schon („Website von …“, „Website & Programm“, „Beim Anbieter prüfen“), jeweils mit `target="_blank" rel="noopener"`. Die Referrer-Policy ist `strict-origin-when-cross-origin` (ADR 0008).

## Entscheidungen

### E1 – Google-Maps-URL mit Ziel, ohne Start

Format laut „Maps URLs“ von Google: dokumentiert, plattformübergreifend, öffnet auf Android und iOS die App, wenn sie installiert ist (Review 1 hat das gegen die Doku geprüft).

```
https://www.google.com/maps/dir/?api=1&destination=<Adresse>&travelmode=transit
```

- `origin` fehlt absichtlich. Google Maps nimmt dann den Standort des Geräts oder fragt danach.
- `travelmode=transit`: Die Seite rechnet mit Bus & Bahn, also startet Maps dort. In Maps lässt sich auf zu Fuß oder Auto umschalten.
- Kein `dir_action=navigate`. Das würde sofort die Turn-by-Turn-Navigation starten und die Verbindungsübersicht mit Echtzeit überspringen. Genau diese Übersicht will der Nutzer sehen. Von dort startet ein Tipp die Navigation.
- Die URL baut `URLSearchParams`, also mit `+` für Leerzeichen.

### E2 – Adresse als Ziel, auf Straße und Ort reduziert (Review 1, H1)

- `destination` ist die Adresse, nicht `geo`. Gründe: Maps zeigt dann „Kornmarkt 6, 90402 Nürnberg“ statt Zahlen als Ziel. Außerdem haben Katalog-Orte im Anbieter-Sheet kein `geo`, alle drei Stellen kommen also ohne Datenänderung aus.
- Abgewogen gegen die Koordinate: Sie träfe genau den Punkt der Wegzeit, aber Maps zeigt dann nur Zahlen, und `anbieter.json` bräuchte `geo` (Datenvertrag und Budget). Bei deutschen Straßenadressen ist der Gewinn an Genauigkeit klein.
- **Bereinigung** `mapsDestination(address)` (rein, `src/domain/maps-link.ts`), in dieser Reihenfolge:
  1. Zusätze in runden Klammern fallen weg, danach doppelte Leerzeichen und Leerzeichen vor Kommas.
  2. Die Adresse wird an Kommas in Teile zerlegt. Gibt es einen Teil mit PLZ und Ort (`^\d{5}\s+\S`), so ist das Ziel „Straße, PLZ Ort“. Die Straße ist der **erste** Teil davor, der auf eine Hausnummer endet. Der erste, weil Zusätze wie „Halle 2“ hinter der Straße stehen (Review 2, N6). Der Teil endet auf eine Hausnummer, wenn er so aussieht (Leerzeichen, Ziffern, optional Buchstabe oder Bereich wie `12-14`: `\s\d+\s?[a-z]?(\s?[-–/]\s?\d+[a-z]?)?$`, ohne Groß-/Kleinschreibung). Präfixe wie „Pfarramt Lutherkirche“ und Zusätze wie „Gebäude E6“, „2. OG“ oder „nicht barrierefrei“ fallen so weg. „E6“ zählt nicht als Hausnummer, weil vor der Ziffer kein Leerzeichen steht. „2. OG“ endet nicht auf eine Ziffer.
  3. Ohne PLZ-Teil oder ohne Straßenteil gilt die Adresse aus Schritt 1, zum Beispiel „Billrothstraße 16, Nürnberg“ oder „Faberpark, Rednitzstraße/Castellstraße“.
  4. Bleibt weniger als `MIN_ADDRESS` übrig, gilt die Adresse unverändert.
- Kein Ortsname im Ziel. Namen wie „Marmorsaal des Presseclubs“ können Maps zu einer Ortssuche verleiten, die woanders landet.
- `MIN_ADDRESS` kommt zur Laufzeit aus `src/domain/site-data.ts`. Das ist unkritisch: Das Modul importiert kein Zod, und der Rest fällt per Tree-Shaking weg (Review 1, N6). Der Kommentar am Import sagt das.

### E3 – Privatsphäre: nur die öffentliche Adresse geht hinaus (Review 1, M4)

- Die URL enthält nur die bereinigte Adresse des Orts. Die ist öffentlich und steht ohnehin auf der Seite und in der ICS-Datei. Nie in der URL: Startpunkt, Stadtteil, Standort, Kartenmitte, Geburtsdatum, Filter.
- Die Routen-Links tragen `rel="noopener noreferrer"`. Google erfährt dadurch auch nicht, dass der Link vom Zwergenplan kommt. Das ist strenger als ADR 0008, also keine Abweichung, und Maps braucht den Referrer nicht.
- Die App selbst stellt keinen Request an Google. Erst der Tipp der Nutzerin öffnet den Link, wie heute die Links zu den Anbieter-Websites. Die Invariante „keine Drittanbieter-Requests außer Kartenkacheln“ bleibt gewahrt. `docs/architecture.md` bekommt dazu unter „Privatsphäre“ einen Satz: Routen-Links tragen nur die bereinigte Ortsadresse, kein `origin`, kein Referrer.
- Kein eigenes ADR. Review 1 hat das bestätigt: Es ist eine Navigation durch die Nutzerin, kein Request der App, und sie hängt nicht vom Startpunkt ab (ADR 0011).
- Die anderen Wege (E4) entstehen lokal aus `wegzeit.json` und `linien.json`. Es gibt keinen neuen Request, und der Startpunkt verlässt das Gerät nicht.
- E2E belegt: Der `href` ist exakt die erwartete URL, ohne Startpunkt, mit gespeichertem Stadtteil und mit gespeichertem Punkt (`zwergenplan.startpunkt`, ADR 0017). Kein Test tippt einen Routen-Link an, so bleibt der Drittanbieter-Wächter (`e2e/fixtures.ts`) scharf.

### E4 – Andere Wege aus der bestehenden Rechnung

Die bestehende Rechnung gibt Alternativen her, ohne neue Daten. Nachgemessen mit dem echten Datenstand: Ab Gostenhof, Altstadt, St. Johannis und Südstadt hat jeder der 76 Orte im Umkreis mehrere Linienfolgen. `transitReach` liefert sie gleich mit:

- **Neue Felder an `TransitReach`** (`src/domain/transit-types.ts`):
  - `toStop?: number`: Fußweg in Minuten vom Startpunkt zum Halt der gewählten Verbindung.
  - `transfer?: true`: Die gewählte Verbindung hat einen Umstieg (Umstiegs-Bit). Das Feld fehlt ohne Umstieg (Review 2, M3).
  - `others?: readonly TransitOther[]`: höchstens zwei andere Wege, aufsteigend nach Minuten. Ohne andere Wege fehlt das Feld, es ist nie `[]` (Review 2, N3).
  - `TransitOther` ist entweder `{ byFoot: true; minutes }` oder `{ byFoot: false; minutes; toStop; lines; transfer?: true }`. `minutes` ist ungerundet wie bei `TransitReach`.
- **Wann die Felder gesetzt sind** (Review 2, H1, M1; Review 3, M2):
  - `toStop` und `transfer` (bei gesetztem Bit) gibt es **genau dann**, wenn der Hauptweg mit Bus & Bahn geht, Linien hat und höchstens `MAX_MINUTES` dauert. Das gilt unabhängig von `others`. Geht der Hauptweg zu Fuß, fehlen beide.
  - `others` setzt die passende Linien-Datei voraus und einen Hauptweg bis `MAX_MINUTES`, der entweder zu Fuß geht **oder** Linien hat. Ein Hauptweg mit Bus & Bahn ohne Linien, etwa „zu Fuß vom Halt“ oder ein Ausreißer der Passungsprüfung, bekommt nichts davon. Die bestehende Anzeige „mit Bus & Bahn“ bleibt dann wie heute.
- **Kandidaten** (Konstanten in `src/domain/transit.ts`, im Lazy-Chunk):
  - **Mit Bus & Bahn**: jede Zeile im Umkreis von `ACCESS_METERS`, deren Zelle einen Wert **und** Linien hat. Zeilen ohne Linien sind nicht unterscheidbar und fallen weg. Je Kandidat zählen die echte Zeit (Fußweg zum Halt plus Tabellenwert), der Fußweg zum Halt und das Umstiegs-Bit. Ein Kandidat zählt nur mit echter Zeit ≤ `MAX_MINUTES` (Review 2, M1).
  - **Zu Fuß**: ein Kandidat, wenn der Hauptweg mit Bus & Bahn geht und der direkte Fußweg höchstens `MAX_MINUTES` dauert. Sein „Fußweg“ ist die ganze Zeit, Umstiege hat er keine.
  - **Zusammenfassen**: Kandidaten mit gleicher Linienfolge und gleichem Umstiegs-Bit werden zusammengefasst. „Bus 37 → U1“ ist eine Folge, „U1“ mit Bit eine andere als „U1“ ohne. Es bleibt der schnellste, bei Gleichstand der mit kürzerem Fußweg zum Halt, dann die kleinere Zeilennummer. Die Folge des Hauptwegs fällt weg, sie steht schon da.
- **Auswahl, Pareto über drei Merkmale** (Review 2, H2), **auf den angezeigten Werten** (Review 3, H1): Minuten gerundet wie in der Anzeige (`roundedMinutes(...).value`), Fußweg gerundet auf ganze Minuten, mindestens 1 (bis zum Halt bzw. bei zu Fuß die ganze Zeit, dann gerundet wie die Minuten), Umstiege (0 oder 1). So bleibt kein Weg, dessen Vorteil in der Anzeige nicht sichtbar ist, etwa 0,2 Min. weniger Fußweg bei 10 Min. mehr Fahrzeit.
  - Ein Kandidat fällt weg, wenn der Hauptweg oder ein anderer Kandidat in **allen drei Merkmalen gleich gut oder besser** ist und in mindestens einem besser. Übrig bleiben nur Wege, die in irgendeiner Hinsicht etwas bieten: schneller, weniger Fußweg oder ohne Umstieg.
  - Gilt auch, wenn der Hauptweg zu Fuß geht. Sein Fußweg ist dann die ganze Zeit. Eine langsamere U-Bahn mit 3 Min. zum Halt bleibt also, denn sie hat weniger Fußweg. Genau das ist das Beispiel des Nutzers („statt 7 Min. Fußweg 12 Min. mit der U1, 3 Min. Fußweg“). Die Forderung aus Review 2, H2 („bei Hauptweg zu Fuß nur schnellere Wege“) ist deshalb abgelehnt.
  - **Vorher** fällt weg, was mehr als `OTHER_SLACK_MINUTES = 15` länger dauert als der Hauptweg (echte Zeit, Grenze inklusiv). Pareto vergleicht nur die übrigen Wege und den Hauptweg. So kann ein Weg, der ohnehin nicht gezeigt wird, keinen sichtbaren verdrängen. Das wurde in der Umsetzung so festgelegt, die Fassung vor Review 3 nannte die umgekehrte Reihenfolge.
- **Sortierung** nach echter Zeit, bei Gleichstand ohne Umstieg zuerst, dann mit kürzerem Fußweg, dann nach Linientext im Code-Unit-Vergleich wie `cmp` in `scripts/transit/lines.ts`, unabhängig von der Locale (Review 2, N2; Review 3, N1). Es bleiben höchstens `MAX_OTHERS = 2`.
- **Rechenaufwand**: `transitReach` merkt sich je Startpunkt einmal die Zeilen im Umkreis mit ihrem Fußweg. Die anderen Wege rechnet die Funktion erst je Ort beim ersten Abruf und legt sie im bestehenden Cache ab. Im Umkreis liegen typisch 10–40 Zeilen, das ist vernachlässigbar.
- **Grenzen, offen benannt**:
  - Je Halt gibt es nur eine Verbindung. Zwei Wege mit gleicher Linienfolge ab verschiedenen Halten fasst die Regel zusammen, „gleiche Linie, aber näherer Halt“ zeigt sie also nicht.
  - Haltestellennamen fehlen, die Karte nennt nur „4 Min. zum Halt“.
  - Der Fußweg vom Ziel-Halt zum Ort steckt in der Zelle und ist unbekannt (Review 2, N4). „Weniger Fußweg“ heißt deshalb nur „weniger Fußweg bis zum Halt“, und die Karte sagt genau das.
- **Hauptweg unverändert**: Die bestehende Anzeige (Minuten, Linien, Filter, Sortierung) ändert sich nicht. `minutes`, `byFoot` und `lines` des Hauptwegs bleiben exakt wie heute, das sichern die bestehenden Unit-Tests.
- **ADR 0015** bekommt einen Nachtrag (Review 2, M4). Unter „Konsequenzen“ steht, dass Umstiegswege bewusst verdrängt werden (Review 3, N4). Die Wahl des Hauptwegs bleibt so, aber das Detail zeigt verdrängte Wege jetzt als „andere Wege“, ausdrücklich mit „1 Umstieg“.

### E5 – Gestaltung der Links: die ganze Kachel (Review 1, M1, M2, N3, N4, N7)

- **Detail**: Aus `div.label.full` („Wo“) wird `a.label.full.route` mit gleichem Inhalt und einer letzten Zeile `span.route-hint`: Icon `route` (neu, Strich-Icon wie die übrigen) und der Text „Route in Google Maps“. Der Link hat `target="_blank" rel="noopener noreferrer"`.
  - Der zugängliche Name ist der Inhalt der Kachel. Kein `aria-label`, denn es würde den sichtbaren Text verdrängen (WCAG 2.5.3).
  - Die Kachel behält ihre Optik: Rand, Schatten, Drehung, Lochpunkt. Dazu `color: inherit` und keine Unterstreichung.
  - Die Drehung von `.label:nth-child(odd/even)` wandert in eine Variable `--tilt`. `:active` setzt `transform: translate(2px, 2px) rotate(var(--tilt))` und nimmt den Schatten weg, wie bei `.btn` (N4). Bei reduzierter Bewegung greift `motion.css` global, das prüft `expectReducedMotion`.
  - `.route-hint` hat eigene Werte mit genügend Spezifität gegen `.label span:not(.cap)`: Farbe `--ink`, Gewicht 800, `hyphens: manual`. Icon und Text stehen in einer Flex-Zeile (M2). Den Kontrast hell und dunkel prüft axe.
- **Anbieter-Sheet**: Jeder Ort in `.provider-venues` wird ein `a.venue-route` im `li` mit Name, „Adresse · Stadtteil“ und derselben Hinweiszeile. Er ist gestaltet als kleine Kachel wie `.label` (Rand, Radius, Schatten). Mit drei Zeilen ist er höher als 44 px.
- **Orts-Sheet**: `p.place-where` bleibt. Adresse und `ReachLong` stehen in einem `a.place-route` mit Hinweiszeile, gestaltet wie im Anbieter-Sheet. Der Stil `.place-where > span` wird zu `.place-route > span:not(.route-hint)` (M1). `e2e/karte.spec.ts:218` (`expectTwoLines`) bleibt als Regressionstest.
- Die Hinweiszeile ist kurz: „Route in Google Maps“ mit 20 Zeichen, einzeilig bei 360 px und 100 %. Bei großer Schrift darf sie umbrechen, aber nie mitten im Wort.
- **Abwägung, Text der Hinweiszeile** (Review 1, N9, abgelehnt): „Route ab deinem Standort“ würde den Unterschied zu „ab Gostenhof“ erklären, verschweigt aber, wohin der Tipp führt. Maps zeigt den Start selbst deutlich an („Mein Standort“), deshalb bleibt „Route in Google Maps“.
- **Abwägung, Adresse kopieren** (N7): Ein langer Druck zeigt jetzt das Link-Menü statt einer Textauswahl. Das Menü bietet „Link kopieren“, und die Adresse steht weiter im ICS. Hingenommen.

### E6 – Gestaltung der anderen Wege: Karte „Wege ab …“

- Sie steht nur im Detail, direkt unter der Kachel „Wo“, als eigenes `div.ways` im Grid `.labels` (volle Breite). Sie sieht aus wie eine Kachel, trägt aber **nicht** die Klasse `label`. Sie ist **kein** Link, damit der Linkname der Kachel kurz bleibt.
- **Drehung ohne Umkippen** (Review 2, N1): Die Drehung zählt nur Kacheln, also `.label:nth-child(odd of .label)` bzw. `even of .label` (Selectors Level 4, Chrome 111, Safari 9, Firefox 113). Kommt die Karte „Wege ab …“ dazu, kippen Alter, Kosten und Anmeldung nicht um. Die Karte selbst ist leicht gegen die Kachel darüber gedreht (fester Wert).
- Sie erscheint nur, wenn `reach.kind === "oepnv"` und `reach.others` vorhanden ist (mindestens ein Eintrag, E4). Ohne Startpunkt, bei Luftlinie, beim Laden und ohne Linien fehlt sie ganz. Sie hat keinen Platzhalter: Sie kommt mit den Linien, also nach den Minuten. Das ist ein bewusster kleiner Sprung unter der Kachel „Wo“ im Inhalt eines offenen Dialogs. Er betrifft nicht den Start-CLS, denn die Linien laden nach Tabelle und Rechenlogik (Plan 0012, E9).
- Aufbau:
  - Überschrift `span.cap` mit „Wege ab Gostenhof“ bzw. „Wege ab deinem Standort“ (`originPhrase`).
  - Danach eine `ol` mit dem Hauptweg zuerst, dann die anderen. Je Zeile die gerundeten Minuten fett, dann die Art:
    - „ca. 25 Min. · Bus 37 → U1 · 1 Umstieg · 4 Min. zum Halt“ (Hauptweg)
    - „ca. 20 Min. · U1 · 1 Umstieg · 9 Min. zum Halt“
    - „ca. 35 Min. zu Fuß“
  - Der Hauptweg trägt eine kleine Marke „Vorschlag“. Darunter steht einmal der Grund: „Vorschlag: direkt vor Umstieg, wenn der nur wenig spart“ (Review 2, M3). Der Grund steht nur da, wenn ein anderer Weg in der Anzeige schneller ist als der Hauptweg, also mit kleineren gerundeten Minuten (Review 3, H1). Sonst reicht die Marke.
  - Zeilenumbruch (Review 3, N6): Jedes Segment („ca. 15 Min.“, „1 Umstieg“, „6 Min. zum Halt“) ist ein eigenes `span` mit `white-space: nowrap`. Umbrechen darf die Zeile nur zwischen den Segmenten. Die Trenner „·“ sind `aria-hidden`. So steht ein schnellerer Weg nicht unerklärt unter dem Hauptweg.
  - „1 Umstieg“ kommt aus dem Umstiegs-Bit (`transfer`), nicht aus der Zahl der Linien. „U1 → U1“ entsteht nie: `linien.json` speichert dann nur eine Linie mit gesetztem Bit (`lines.ts`, `legs`). Die Zeile heißt deshalb „U1 · 1 Umstieg“.
  - Die Linien stehen mit Pfeil wie in `ReachLong` (Pfeil für Screenreader verborgen, „, dann“). Das Teilstück wird dafür aus `ReachLong.tsx` herausgezogen (`LineChain`).
  - Am Ende ein Satz `span` „Laut Fahrplan, Di vormittags. Live: Route in Google Maps“. „Route in Google Maps“ ist ein zweiter Link auf dieselbe URL (`a.linkbtn`, ≥ 44 px), damit die Karte nicht als Sackgasse endet.
- Die Minuten werden wie überall gerundet (`roundedMinutes`). „zum Halt“ wird auf ganze Minuten gerundet, mindestens 1.
- Die Texte baut eine reine Funktion `wayParts(...)` in `src/ui/format.ts` (Start-Bundle, wie `reachLong`). Sie hat Unit-Tests.

### E7 – Ein Ort für URL und Bereinigung (Review 1, N5)

- Neue reine Datei `src/domain/maps-link.ts` mit `mapsDirectionsUrl(address)` und `mapsDestination(address)` (E2). Der Name ist bewusst anders als `src/domain/route.ts`, das die URL-Route der App enthält.
- Sie gehört nach `src/domain`, weil die Bereinigung eine Regel über Daten ist: Welcher Teil der Adresse geht hinaus? Sie braucht Unit-Tests ohne React. Die Komponenten rufen nur `mapsDirectionsUrl(...)`.
- Sie landet im Start-Bundle, denn das Detail ist im Start. Review 1 hat geprüft: Die `$initial`-Gruppe hält sie im Einstieg, und die Lazy-Chunks von Anbieter- und Orts-Sheet spalten nichts ab (Chunk-Wächter).

### E8 – Verhalten offline und in der installierten App (Review 1, M3, N8)

- **Offline**: Die App stellt keinen Request. Der Service Worker greift bei fremden Origins nie ein (`src/sw/routes.ts`). Maps bzw. der Browser zeigt seinen eigenen Offline-Zustand. Die Karte „Wege ab …“ funktioniert offline, sobald Tabelle und Linien geladen sind.
- **Installierte PWA**: `target="_blank"` aus einer Standalone-PWA öffnet unter iOS einen In-App-Browser bzw. Safari. Ob dort der Universal Link die Maps-App öffnet, ist nicht belegt. Unter Android bleibt nach dem Wechsel in die App womöglich ein leerer Tab zurück.
  - Die Browser-Prüfung (Schritt 9) kann das nur in Chromium mit Emulation zeigen, nicht auf echten Geräten.
  - Die **Gerätematrix** geht deshalb als offene Abnahme an den Nutzer: iPhone und Android, jeweils im Browser und als installierte App, jeweils mit und ohne installierte Maps-App.
  - Hält der Weg aus der iOS-PWA nicht, kommt ein Folgeplan, der zum Beispiel `target` dort weglässt. Auch im schlechtesten Fall öffnet sich Google Maps im Browser mit der richtigen Route.

### E9 – Startbudget: 100 kB (Nutzerentscheidung, Review 2, B1)

- Gemessen am 2026-10-06 auf `b2023c1` (Stand `main`, Plan 0016): `JS (initial)` **91,95 kB** von 92 kB, Rest 0,05 kB. `Wegzeit JS (lazy)` 1,66 kB von 3 kB.
- Schätzung im Start (gzip): Link samt `maps-link.ts` und Hinweiszeile ≈ 0,3 kB, Karte „Wege ab …“ samt `wayParts` und `LineChain` ≈ 0,4–0,5 kB. Zusammen also ≈ 0,7–0,8 kB, das passt nicht.
- Gefragt wurde mit drei Optionen: 93 kB, Kalender lazy bei 92 kB, Karte lazy und 92,5 kB. **Der Nutzer hat am 2026-10-06 „Budget auf 100 kB“ entschieden.**
- **Wörtlich** (Review 3, M3): Angeboten wurden „Budget auf 93 kB (Empfohlen)“, „Kalender lazy, 92 kB bleibt“ und „Wege-Karte lazy, Rest anheben“. Der Nutzer hat frei geantwortet: „Budget auf 100kb“. Begründung des Vorschlags: Die billigen Kandidaten zum Auslagern sind verbraucht (Platzhalter von `NewsBlock`, Plan 0011), der nächste wäre ein Umbau des Kalenders. Weitere 8 kB gzip lassen Luft für die nächsten Pläne. Über Ladezeit und Bedienbarkeit wachen LCP, CLS und die Schrift-Swap-Gates, nicht die Byte-Zahl.
- Umsetzung:
  - `.size-limit.json` setzt `JS (initial)` auf `100 kB`. Die Datei kann keinen Kommentar tragen, die Begründung steht deshalb im Commit (CLAUDE.md, Backpressure).
  - ADR 0012: Statuszeile und Abschnitt „Entscheidung“ bzw. „Konsequenzen“ bekommen „geändert am 2026-10-06 durch Plan 0019: 100 kB“, dazu ein Nachtrag „Stand nach Plan 0019“ mit Messwert vorher und nachher, Nutzerentscheidung und Delta je Plan. Wer danach merged, trägt dort sein Delta ein, damit die Luft nicht unbemerkt schwindet.
  - Verweise in Plan 0011, Stufe 2 („über 92 kB … erneute Rückfrage“) und in ADR 0013 (92 kB): Die Schwelle ist jetzt 100 kB, siehe ADR 0012. Der Branch `push-0017` misst beim Merge neu.
  - Alles bleibt im Start, die Karte bekommt keinen eigenen Lazy-Chunk. Das ist einfacher und hält die Karte ohne Ladeverzug.
- Die anderen Gates bleiben unverändert, vor allem LCP < 2,5 s und CLS < 0,05 bei gedrosselter CPU und gedrosseltem Netz (`e2e/perf.spec.ts`). Auf sie kommt es für die Nutzer an.
- Die Rechenlogik der anderen Wege liegt im Lazy-Chunk `assets/oepnv/` (Schätzung +0,3–0,4 kB, Budget 3 kB, Review 2, N5).

## Struktur

| Datei | Änderung |
|---|---|
| `src/domain/maps-link.ts` | neu: `mapsDirectionsUrl`, `mapsDestination` (E1, E2, E7) |
| `src/domain/maps-link.test.ts` | neu: Unit-Tests |
| `src/domain/transit-types.ts` | `TransitReach.toStop`, `.transfer`, `.others`, Typ `TransitOther` (E4) |
| `src/domain/transit.ts` | andere Wege in `transitReach`, Konstanten `OTHER_SLACK_MINUTES`, `MAX_OTHERS` (E4) |
| `src/domain/transit.test.ts` | Unit-Tests der anderen Wege |
| `src/ui/format.ts`, `src/ui/format.test.ts` | `wayParts` (E6) |
| `src/ui/icons.tsx` | Icon `route` |
| `src/ui/ReachLong.tsx` | Linien mit Pfeil als `LineChain` herausgezogen |
| `src/ui/Ways.tsx` | neu: Karte „Wege ab …“ (E6) und `RouteHint` (E5) |
| `src/ui/DetailDialog.tsx` | Kachel „Wo“ als Link, Karte „Wege ab …“ |
| `src/ui/anbieter/ProviderSheet.tsx` | Orte als Links |
| `src/ui/karte/PlaceSheet.tsx` | Ortszeile als Link |
| `src/ui/styles/dialog.css`, `anbieter.css`, `map.css` | Stile für `a.label.route` (mit `--tilt`, Drehung `of .label`), `.ways`, `.venue-route`, `.place-route`, `.route-hint` |
| `.size-limit.json`, `docs/adr/0012-startbudget-und-chunks.md` | `JS (initial)` 100 kB, Status, Entscheidung, Nachtrag (E9) |
| `docs/plans/0011-pwa-push.md`, `docs/adr/0013-pwa-service-worker.md` | Verweis: Budget jetzt 100 kB (E9) |
| `docs/adr/0015-wegzeit-linien.md` | Nachtrag „ergänzt durch Plan 0019“: andere Wege im Detail (E4) |
| `e2e/detail.spec.ts`, `e2e/anbieter-inhalt.spec.ts`, `e2e/karte.spec.ts`, `e2e/startpunkt.spec.ts` | E2E-Tests (unten) |
| `docs/architecture.md` | Satz unter „Privatsphäre“ (E3), `maps-link` in der Liste der Domänen-Module, im Absatz „Linien“ ein Satz zu `others` (E4) |
| `docs/ideas.md` | fällt weg: „Route in Karten-App öffnen“. Neu: Haltestellennamen und Abfahrtszeiten der Wege, andere Wege im Orts-Sheet, Wegzeit je Ort im Anbieter-Sheet |

Keine neue Abhängigkeit, keine Schemaänderung, keine Datenänderung. Neu sind ein Domänen-Modul und eine UI-Datei, mit Tests und Stilen voraussichtlich über 200 Zeilen. `/arch-review` ist Pflicht (CLAUDE.md, Schritt 4). Gemessen wird das Start-JS gegen 100 kB (E9) und `Wegzeit JS (lazy)` gegen 3 kB.

## Tests

Test-first. Die Unit-Tests sind rot, weil `maps-link.ts`, `others` und `wayParts` fehlen. Die E2E-Tests sind rot, weil es weder Links noch die Karte gibt.

**Unit**

- `src/domain/maps-link.test.ts`:
  - Grundform: `"Bühnenplatz 2, 90429 Nürnberg"` ergibt genau `https://www.google.com/maps/dir/?api=1&destination=B%C3%BChnenplatz+2%2C+90429+N%C3%BCrnberg&travelmode=transit`.
  - Die URL hat genau die Parameter `api`, `destination` und `travelmode`, kein `origin`.
  - Für die Bereinigung gibt es je Fall einen Test, mit fiktionalisierten Werten aus den echten Daten:
    - Klammer am Ende: „Beispielweg 6, 90402 Nürnberg (Turnhalle 2. UG)“ → „Beispielweg 6, 90402 Nürnberg“
    - Klammer mitten drin: „Kirchengemeindehausstraße 128a (Hinterhaus), 90461 Nürnberg“ → „Kirchengemeindehausstraße 128a, 90461 Nürnberg“
    - Präfix: „Pfarramt Musterkirche (Keller), Musterstraße 34, 90471 Nürnberg“ → „Musterstraße 34, 90471 Nürnberg“
    - Zusätze dazwischen: „Musterstraße 212, Gebäude E6 (Eingang Nebenstraße), 2. OG, nicht barrierefrei, 90429 Nürnberg“ → „Musterstraße 212, 90429 Nürnberg“
    - Zusatz mit Nummer hinter der Straße: „Musterstraße 5, Halle 2, 90402 Nürnberg“ → „Musterstraße 5, 90402 Nürnberg“ (Review 2, N6)
    - Bereich: „Musterweg 12-14, 90402 Nürnberg“ bleibt.
    - Ohne PLZ: „Musterstraße 16, Nürnberg“ bleibt.
    - Ohne Hausnummer: „Musterpark, Astraße/Bstraße“ bleibt.
    - Nur Klammern bzw. zu kurz: Die Adresse bleibt unverändert.
- `src/domain/transit.test.ts`, mit einer handgebauten Tabelle und handgebauten Linien wie in den bestehenden Tests:
  - Zwei Zeilen mit verschiedenen Linien, die zweite langsamer, aber mit kürzerem Fußweg zum Halt: Der Hauptweg bleibt exakt wie heute. `others` enthält die zweite Folge mit echter Zeit und `toStop`, der Hauptweg hat `toStop`.
  - **Pareto** (Review 2, H2):
    - Ein Kandidat, der langsamer ist, längeren Fußweg hat und gleich viele oder mehr Umstiege, fällt weg.
    - Ein langsamerer mit kürzerem Fußweg bleibt.
    - Zwei Kandidaten, von denen einer den anderen dominiert: Nur der bessere bleibt.
  - **Hauptweg zu Fuß**: Eine langsamere Linie mit kürzerem Fußweg zum Halt bleibt (Beispiel des Nutzers). Eine langsamere mit längerem Fußweg fällt weg.
  - Zu Fuß als anderer Weg, wenn der Hauptweg mit Bus & Bahn und Umstieg geht und der Fußweg in die Schwelle passt. Dominiert der Hauptweg ihn (schneller, kürzerer Fußweg, kein Umstieg), fällt er weg.
  - Gleiche Linienfolge mit gleichem Bit ab zwei Zeilen wird zu einem Eintrag zusammengefasst. „U1“ mit Bit und „U1“ ohne Bit sind zwei Folgen. Die Folge des Hauptwegs taucht nicht in `others` auf.
  - Ein schnellerer Weg mit Umstieg, den der Aufschlag verdrängt hat, steht in `others`, mit `transfer: true`.
  - **Angezeigte Werte** (Review 3, H1): Ein Weg, der langsamer ist und nur 0,3 Min. weniger Fußweg hat (gerundet gleich), fällt weg.
  - Grenze `OTHER_SLACK_MINUTES` inklusiv: Ein Weg mit 15 Min. mehr bleibt, einer mit 16 Min. mehr fällt weg. Gebaut mit Zeilen genau am Startpunkt (Fußweg 0), damit die Differenz exakt ist. Der Hauptweg hat das Umstiegs-Bit, der andere Weg nicht. Sonst entfernt Pareto den anderen Weg schon vorher, und die Schwelle wird gar nicht geprüft (Review 3, N2). Ein Kandidat über `MAX_MINUTES` fällt immer weg (Review 2, M1).
  - Höchstens `MAX_OTHERS`. Sortiert wird nach Zeit, bei Gleichstand ohne Umstieg zuerst, dann mit kürzerem Fußweg, dann nach Linientext.
  - Ohne Linien-Datei gibt es kein `others`, kein `toStop` und kein `transfer`. Zeilen ohne Linien sind keine Kandidaten.
  - **Hauptweg mit Bus & Bahn ohne Linien** (Review 2, H1): kein `others`, kein `toStop`.
  - Hauptweg über 120 Min.: kein `others`.
  - Ohne andere Wege fehlt das Feld `others` (`toEqual` exakt, Review 2, N3).
- `src/ui/format.test.ts`, `wayParts`:
  - Bus & Bahn mit einer bzw. zwei Linien;
  - „1 Umstieg“ aus dem Bit, auch bei nur einer Linie;
  - „zum Halt“ gerundet (0,4 → 1, 3,6 → 4);
  - zu Fuß;
  - der Grund „Vorschlag: …“ nur, wenn ein anderer Weg schneller ist.

**E2E** (Fixture-Daten, alle Geräte)

- `e2e/detail.spec.ts`:
  - Ohne Startpunkt ist die Kachel „Wo“ im Detail von „Kuckuck im Nest“ ein Link. Sein Name enthält „Route in Google Maps“. Der `href` ist exakt wie im Unit-Test, dazu `target="_blank"`, und `rel` enthält `noopener` und `noreferrer`.
  - Ohne Startpunkt gibt es keine Karte „Wege ab …“.
  - Ein Angebot am Ort „Kirchengemeindehausstraße 128a (Hinterhaus)“ hat den bereinigten `href` (N1).
  - Hit-Test (N3): `document.elementFromPoint` in der Mitte der Kachel landet im `a`.
- `e2e/startpunkt.spec.ts`:
  - Mit gespeichertem Stadtteil Gostenhof und mit gespeichertem Punkt zeigt die Kachel die Wegzeit, und der `href` bleibt derselbe (E3, N2).
  - **Karte „Wege ab deinem Standort“, ohne Änderung der Fixture** (Review 2, M2, abgelehnt mit Beleg):
    - Ab Gostenhof gibt der Fixture-Fahrplan keinen anderen Bus-&-Bahn-Weg mit anderer Linienfolge her, alle Zugangshalte liefern dieselbe Folge. Ab dem schon genutzten gespeicherten Punkt `STORED_HERE` (49,452 / 11,077) liegen 9001 (1 358 m), 9002 (974 m), 9003, 9004 und 9005 im Umkreis. 9001 und 9002 liefern Tram 1 → Bus 202E mit 45,5 bzw. 36,9 Min., das wird mit 9003 zusammengefasst (Review 3, N3).
    - Nachgerechnet mit `dist-e2e/data` für die Gemeinde (Kirchengemeindehausstraße):
      - Hauptweg Bus 202E: 5,9 Min. zum Halt + 10 = 15,9;
      - Tram 1 → Bus 202E mit Umstieg: 1,3 + 16 = 17,3;
      - Bus 2: 7,5 + 18 = 25,5, dominiert vom Hauptweg.
    - Erwartet ist die Karte mit „ca. 15 Min. · Bus 202E · 6 Min. zum Halt“ (Vorschlag) und „ca. 15 Min. · Tram 1 → Bus 202E · 1 Umstieg · 1 Min. zum Halt“.
    - So prüft E2E auch `LineChain`, „1 Umstieg“ und „zum Halt“ an einem anderen Weg. Die Rechnung steht im Kopfkommentar von `startpunkt.spec.ts`, mit Angebotstitel und Liniennamen mit U+00A0. Review 3 hat die Werte unabhängig nachgerechnet. Schritt B3 prüft sie gegen den Build.
  - **Musikgarten ab Gostenhof** (Review 3, M1): Hauptweg „ca. 30 Min. · Tram 1 → Bus 2 · 1 Umstieg · 2 Min. zum Halt“ (29,6 Min.), anderer Weg „ca. 40 Min. zu Fuß“ (40,9 Min., ohne Umstieg, also nicht dominiert). Damit ist die Fuß-Zeile im E2E geprüft.
  - **Mit abgebrochener `linien.json`** fehlt die Karte beim Musikgarten. Der Fall hätte mit Linien eine Karte, der Test ist also ein echter Gegentest (Review 3, M1).
  - **Kuckuck im Nest ab Gostenhof**: Der Hauptweg geht mit Bus & Bahn ohne Linien („zu Fuß vom Halt“), also gibt es keine Karte. Das ist nur ein schwacher Gegentest für Review 2, H1, denn der Fuß-Kandidat wäre ohnehin dominiert. Den eigentlichen Beleg liefert der Unit-Test.
  - **Locator** (Review 3, N5): Mit Karte gibt es zwei Links „Route in Google Maps“ (Kachel und `a.linkbtn`). Die Tests suchen die Kachel über `a.route` und prüfen für die Privatsphäre jeden `a[href^="https://www.google.com/maps"]` im Dialog (`rel` mit `noreferrer`, keine Koordinate).
- `e2e/anbieter-inhalt.spec.ts`: Im Sheet des Turnvereins sind beide Orte Links mit `href` auf ihre Adresse. Der bestehende Text-Test der Orte wird um „Route in Google Maps“ ergänzt.
- `e2e/karte.spec.ts`: Im Orts-Sheet ist die Ortszeile ein Link mit `href` auf die Adresse. `expectTwoLines` (`:218`) bleibt grün (M1).
- `expectMobileUx` läuft schon für Detail, Anbieter-Sheet und Orts-Sheet (`mobile-ux.spec.ts`). Für das Detail **mit** Startpunkt und Karte „Wege ab …“ kommt ein Aufruf dazu, hell und dunkel, damit die neue Karte die Gates durchläuft.

## Umsetzungsschritte

In zwei Teilen und zwei Commits (Review 2, M5; Review 3, M4).

**Teil A – Link und Budget**

- A1. Unit-Tests `maps-link.test.ts` (rot), dann `maps-link.ts` (grün).
- A2. E2E-Tests der Links in Detail, Anbieter-Sheet, Orts-Sheet und Privatsphäre (rot).
- A3. Icon, `Ways.tsx` (`routeLink`, `RouteHint`), Links in den drei Komponenten, Stile (grün).
- A4. `.size-limit.json` auf 100 kB, ADR 0012, Verweise in Plan 0011 und ADR 0013, `docs/architecture.md` (Privatsphäre), `docs/ideas.md`. Commit.

**Teil B – andere Wege**

- B1. Unit-Tests der anderen Wege in `transit.test.ts` (rot), dann `transit.ts` und `transit-types.ts` (grün). Die bestehenden Tests bleiben unverändert grün.
- B2. `wayParts` mit Tests, `LineChain`, Karte in `Ways.tsx`, Stile. E2E-Tests vorher (rot).
- B3. Die erwarteten Werte der Karte ab `STORED_HERE` und ab Gostenhof mit der fertigen Rechnung gegen `dist-e2e/data` nachprüfen (Wegwerf-Skript außerhalb des Repos). Die Fixture bleibt unverändert.
- B4. ADR 0015, `docs/architecture.md` (Linien), `docs/ideas.md`. Commit.

**Danach**

7. `PW_PORT=4273 pnpm check` grün, dabei Budgets und Chunk-Wächter ansehen. `/arch-review`.
8. Branch pushen, CI grün, Fast-Forward nach `main`, CI auf `main` grün, Deploy.
9. `/browser-review live`:
   - Detail mit und ohne Startpunkt, Karte „Wege ab …“, Anbieter-Sheet, Orts-Sheet.
   - 360 px und iPhone, hell und dunkel, 200 % Schrift, Fokusring, Druckeffekt.
   - Ein Klick auf den Link öffnet Google Maps mit dem richtigen Ziel im ÖPNV-Modus. Geprüft werden sechs echte Adressen mit Präfix oder Klammer (H1) und die Plausibilität der anderen Wege bei zwei echten Orten.
   - Die Gerätematrix (E8) geht als offene Abnahme an den Nutzer.

## Risiken

- **Maps findet eine Adresse nicht genau**, etwa ohne PLZ oder ohne Hausnummer. Maps zeigt dann die Straße bzw. den Park. Für die Navigation reicht das. Die Browser-Prüfung sieht sich die echten Problemfälle an.
- **Ganze Kachel als Link bei langem Inhalt**: Screenreader lesen einen langen Linknamen. Abgewogen gegen ein kleines, separates Link-Element: Der Nutzer will ausdrücklich auf die Kachel tippen, und eine große Fläche trifft man auf dem Handy leichter.
- **Andere Wege wirken unplausibel**, zum Beispiel weil zwei benachbarte Haltbereiche mit fast gleicher Zeit verschiedene Linien liefern. Pareto, die Schwelle (15 Min.) und die Obergrenze (2) halten die Liste kurz. Bei der Browser-Prüfung an echten Orten ansehen. Wirkt es verwirrend, nachschärfen, aber nur mit einem Test.
- **Die Regel für Hausnummern** in E2 kann eine seltene Adressform verfehlen. Dann gilt die Adresse aus Schritt 1, die nur von Klammern bereinigt ist, und Maps sucht etwas breiter.

## Review 1 (2026-10-06) – Verdict: Freigabe mit Auflagen

Unabhängiger `plan-reviewer` auf die 1. Fassung (nur Link, ohne andere Wege). Keine Blocker.

Übernommen:
- **H1** Bereinigung auf „Straße, PLZ Ort“ (E2, Variante a), Unit-Tests aus fiktionalisierten echten Fällen, Browser-Prüfung echter Adressen.
- **M1** Stil im Orts-Sheet auf `.place-route > span:not(.route-hint)` (E5), Regressionstest `karte.spec.ts:218`.
- **M2** `.route-hint` mit eigener Spezifität (E5).
- **M3** Verhalten aus der PWA als offene Gerätematrix (E8). Ehrlich benannt: Echte Geräte prüft nur der Nutzer.
- **M4** `noreferrer` an den Routen-Links, Referrer in E3 genannt. Kein ADR, bestätigt.
- **N1** E2E mit bereinigtem `href` (Hinterhaus-Fixture).
- **N2** Privatsphäre-Test auch mit gespeichertem Punkt.
- **N3** Hit-Test der Kachel.
- **N4** `--tilt` und `:active` mit Drehung.
- **N5** `maps-link.ts` statt `route-link.ts`.
- **N6** Begründung zum Laufzeit-Import von `MIN_ADDRESS` (E2).
- **N7** Adresse kopieren, als Abwägung (E5).
- **N8** Offline (E8).

Abgelehnt:
- **N9** Hinweistext „Route ab deinem Standort“. Begründung in E5: Der Text muss sagen, wohin der Tipp führt, und Maps zeigt den Start selbst an.

Nach Review 1 erweitert durch den zweiten Nutzerwunsch: E4 (bisher „keine eigenen Alternativrouten“) heißt jetzt „Andere Wege aus der bestehenden Rechnung“, dazu kommt E6. Deshalb gibt es ein zweites Review.

## Review 2 (2026-10-06) – Verdict: Überarbeiten

Neuer, unabhängiger `plan-reviewer` auf die 2. Fassung. Ein Blocker.

Übernommen:
- **B1** Startbudget (91,95 von 92 kB gemessen, Befund bestätigt). Der Nutzer hat entschieden: 100 kB. Umgesetzt als E9 mit Nachtrag in ADR 0012.
- **H1** Hauptweg mit Bus & Bahn ohne Linien bekommt keine anderen Wege und kein `toStop` (E4). Dazu ein Unit-Test und der E2E-Fall Kuckuck.
- **H2**, teilweise: Pareto über Minuten, Fußweg und Umstiege (E4).
- **M1** Kandidaten nur bis `MAX_MINUTES`.
- **M3** „1 Umstieg“ aus dem Bit, Marke „Vorschlag“ mit Grund, wenn ein anderer Weg schneller ist (E6).
- **M4** Nachtrag in ADR 0015.
- **N1** Drehung mit `nth-child(… of .label)`.
- **N2** letzter Tie-Break nach Linientext.
- **N3** `others` fehlt statt `[]`.
- **N4** Fußweg am Ziel unbekannt, unter „Grenzen“ in E4.
- **N5** Schätzung für den Lazy-Chunk in E9.
- **N6** erster statt letzter Straßenteil, mit Test. Gegen alle 125 echten Adressen geprüft: 43 werden gekürzt, alle auf „Straße Nr., PLZ Ort“, bis auf „Schiestlstraße, 90427 Nürnberg“, die schon im Original keine Hausnummer hat.

Abgelehnt:
- **H2**, Teil „bei Hauptweg zu Fuß nur schnellere Wege“. Das widerspricht dem Beispiel des Nutzers (statt 7 Min. Fußweg lieber 12 Min. mit der U1, 3 Min. Fußweg). Pareto behält solche Wege, weil sie weniger Fußweg haben, und entfernt langsamere mit mehr Fußweg.
- **M2**, Teil „Fixture ergänzen“. Ab dem schon genutzten gespeicherten Punkt liefert die Fixture einen anderen Bus-&-Bahn-Weg mit Linien, Umstieg und „zum Halt“. Nachgerechnet mit `dist-e2e/data`, die Werte stehen unter „Tests“.
- **M5** Scope teilen. Der Nutzer will beides, und das Budget ist mit E9 geklärt. Umgesetzt wird trotzdem in zwei Commits: erst der Link, dann die Wege.

## Review 3 (2026-10-06) – Verdict: Freigabe mit Auflagen

Neuer, unabhängiger `plan-reviewer` auf die 3. Fassung. Keine Blocker. Er hat die Fixture selbst dekodiert und die erwarteten Werte ab `STORED_HERE` bestätigt.

Übernommen:
- **H1** Pareto und Grund auf den angezeigten (gerundeten) Werten (E4, E6), mit Unit-Test.
- **M1** Musikgarten ab Gostenhof als positiver E2E-Fall mit Fuß-Zeile, Abbruch-Test mit Musikgarten, Kuckuck als schwacher Gegentest benannt.
- **M2** `toStop` und `transfer` genau dann, wenn der Hauptweg mit Bus & Bahn, mit Linien und bis 120 Min. geht (E4).
- **M3** E9 wörtlich, mit Begründung; ADR 0012 bekommt Status, Entscheidung und Nachtrag; Verweise in Plan 0011 und ADR 0013; Begründung im Commit; Delta je Plan.
- **M4** Schritte in Teil A und Teil B, Budget im ersten Commit.
- **N1** Code-Unit-Vergleich statt `localeCompare`.
- **N2** Schwellen-Test mit Zeilen am Startpunkt.
- **N3** Kopfkommentar mit den richtigen Halten.
- **N4** Verweis auf „Konsequenzen“ in ADR 0015.
- **N5** Locator über `a.route`, Privatsphäre für jeden Maps-Link.
- **N6** Segmente mit `nowrap`, Trenner `aria-hidden`.
- **N7** Kopfkommentar in `maps-link.ts` nennt Plan 0019.

Abgelehnt:
- **N8** Test über alle Adressen aus `data/providers.yaml`. Ein Unit-Test auf echte Daten wird mit jedem nächtlichen Lauf (Plan 0015) zum Zufallsrot, ohne dass ein Fehler vorliegt. Die Regel fällt sicher zurück: Ohne Treffer bleibt die nur von Klammern bereinigte Adresse. Geprüft wurde einmalig gegen alle 125 echten Adressen (Review 2, N6), und die Browser-Prüfung sieht sich echte Problemfälle an.

Status nach Review 3: freigegeben, keine offenen Blocker.

## Arch-Review (2026-10-06) – Verdict: Nacharbeit, kein Blocker

Unabhängiger `arch-reviewer` auf den Diff gegen `main` (Teil A und B).

Übernommen:
- **M1** Die Rundung „zum Halt“ stand doppelt, in `transit.ts` (Pareto) und `format.ts` (Anzeige). Jetzt gibt es eine Quelle: `stopMinutes` in `src/domain/reach.ts`, mit Unit-Test. So bleibt Pareto an die angezeigten Werte gebunden.
- **m1** `wayParts` deutet Bus & Bahn ohne Linien oder Halt nicht mehr als „zu Fuß“ um. Es zeigt dann keine Karte, abgesichert mit Unit-Test.
- **m2** `OTHER_SLACK_MINUTES` und `MAX_OTHERS` werden im Test importiert. `WayRow` ist nicht mehr exportiert (knip war schon grün).
- **m3** Ziel und Reserve in ADR 0012 sowie zwei Stellen in Plan 0011 sind als überholt markiert.
- **m4** `toStop` kommt exakt aus `bestWalk` statt aus einer Differenz.

Abgelehnt:
- **m3**, Teil „eigenes ADR statt Nachtrag“. ADR 0012 hat seine Budgetstände schon zweimal per Nachtrag fortgeschrieben (Plan 0011/0012, Plan 0016). Die Entscheidung selbst bleibt dieselbe, nur die Zahl ändert sich: Budget im Start-JS mit Workaround und Chunk-Wächter. Status, Abschnitt „Entscheidung“ und Nachtrag sind angepasst. Eine neue ADR-Nummer hätte zudem mit den parallel vergebenen Nummern kollidiert (0017/0018).

Messung im vollständigen Check: `LCP und CLS bleiben im Budget` war auf Android klein und Pixel 7 rot (LCP 2 952 ms). Es wurde abwechselnd unter gleicher Last gemessen, Load 24–61 auf 16 Kernen durch parallele Sessions:
- `main`: 2 652, 2 948, 2 468, 2 836 ms
- Plan 0019: 2 484, 3 196, 2 792, 2 540 ms

Die Werte sind nicht zu unterscheiden, auch `main` reißt das Budget unter dieser Last. Bei geringerer Last lag Plan 0019 bei 1 812–2 176 ms. Es entscheidet die CI.
