# Plan 0009 – Öffi-Fahrzeit statt Luftlinie

Status: umgesetzt bis Schritt 8 (2026-10-05), Arch-Review, Deploy und Browser-Review siehe „Umsetzung“
Datum: 2026-10-05
Bezug: ADR 0005 (Öffi-Wegzeit, Stufe 2: hier umgesetzt, mit Abweichungen → **ADR 0011**, Entwurf in `docs/adr/0011-oepnv-wegzeit-tabelle.md`, E14), Plan 0004 (Startpunkt, Luftlinie, Schnittstelle `Reach`, E2/E9), Plan 0005 (Karte, Kamera-Regel, Kartenmitte), ADR 0002 (Datenfluss), ADR 0003 (`nearestStops`), ADR 0006 (Pipeline), ADR 0008 (Privatsphäre der Karte), ADR 0010 (`src/data` und Domänenhilfen).

## Ziel

Ist ein Startpunkt gesetzt, zeigt die Seite statt der Luftlinie eine **geschätzte Wegzeit mit Bus & Bahn** (oder zu Fuß, wenn das schneller ist). Am Ende gilt:

- Die Kachel zeigt „… · 25 Min.“, das Detail „ca. 25 Min. mit Bus & Bahn ab Gostenhof“, die Statuszeile „Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, inkl. Warten)“. Liegt der Ort näher als jede Verbindung, heißt es „ca. 10 Min. zu Fuß ab Gostenhof“.
- Grundlage sind die **Soll-Fahrplandaten des VGN** (GTFS) für einen Referenz-Dienstag, Abfahrt 8:30–10:30. Gezählt wird der Median der Tür-zu-Tür-Zeit über dieses Fenster, **mit** Warte- und Umsteigezeit. **Bus ist dabei**, denn 22 der 76 Orte liegen weiter als 600 m von U-Bahn, S-Bahn und Tram (E2).
- Der Filter „Wegzeit: bis 20 / 30 / 45 Min.“ (`wegzeit=`) ersetzt den Umkreis in km.
- Orts-Liste und Orts-Sheet der Karte zeigen und sortieren nach derselben Wegzeit. Die Kamera-Regel (ADR 0008) bleibt unverändert.
- **Kein Drittanbieter, kein Routing-Dienst zur Laufzeit.** Der Browser lädt eine für alle gleiche Datei `data/wegzeit.json` vom eigenen Origin und rechnet lokal. Der Standort verlässt das Gerät nie.
- Die Wegzeit-Logik und die Tabelle belasten das Startbundle nicht nennenswert: Die Tabelle lädt nur auf Anlass, die Rechenlogik kommt je nach Messung lazy oder ins Startbundle (Entscheidungspunkt mit Schwelle, E10).
- Solange die Tabelle lädt, steht an Stelle der Wegzeit ein Platzhalter ohne Layoutsprung (E11). Fehlt sie oder liegt der Startpunkt außerhalb des Stadtgebiets, gilt die Luftlinie wie heute, ehrlich beschriftet.

## Nicht-Ziele

- Echtzeit, Verspätungen, Baustellen-Umleitungen (GTFS-Realtime), Tarife, Barrierefreiheit (Aufzüge), Kinderwagen-Plätze.
- Routenvorschlag oder Linienangabe („U1 bis Plärrer“). Die Seite nennt nur Minuten. Link „Route in der Karten-App öffnen“ bleibt in `docs/ideas.md`.
- **Haltestelle als Startpunkt** (ADR 0005 nennt „Haltestelle wählen“): Stadtteil, Standort und Kartenmitte reichen; eine Liste mit 570 Halten wäre schlecht bedienbar. → `docs/ideas.md`.
- Weitere Zeitfenster (nachmittags, Wochenende). Die Nachmittagsspitze (15 Uhr) ist real, verdoppelt aber die Datei. → `docs/ideas.md` (Nutzerentscheidung: erst nur vormittags).
- Sortierung der Tagesliste nach Wegzeit (Plan 0004, Nicht-Ziele).
- Startpunkte außerhalb des Nürnberger Stadtgebiets mit Öffi-Zeit (Fürth, Erlangen): Nutzerentscheidung „nur Stadtgebiet“. Dort gilt die Luftlinie mit dem Hinweis „außerhalb des Stadtgebiets“ (E11).
- Karte zeigt Isochronen oder Linien: → `docs/ideas.md`.

## Ausgangslage und Voraussetzungen

**Code (Stand `ffddb46`):**
- `src/domain/reach.ts`: `Origin`, `Reach = { kind: "luftlinie"; meters }`, `ReachTarget { geo }`, `reachTo`, `compareReach`, `RADII_KM = [2, 5, 10]`, `ReachLimit = { kind: "km" }`, `withinLimit`, `roundedDistance`.
- `src/domain/filter.ts`: `FilterContext.origin`, `matchesFilter(offer, state, origin)`, `umkreis=` in der URL, `activeFilterCount(filter, { hasOrigin })`.
- `src/ui/use-offer-views.ts`: `reachCache(origin)` je Koordinate (`placeKey`), `reachOf` an Kachel, Detail, Orts-Liste und Orts-Sheet.
- `src/ui/format.ts`: `distanceShort`, `distanceLong`, `distanceNote`, `originPhrase`, `reachLimitLabel`. Aufrufer: `OfferCard`, `DetailDialog`, `App` (Statuszeile, Umkreis-Hinweis), `Sheets` (Gruppe „Entfernung“), `Chrome` (Badge), `karte/PlaceSheet`, `karte/place-format`.
- `src/domain/schema.ts`: `Venue.nearestStops?: { stopId, name, walkMeters }[]` ist seit ADR 0003 vorbereitet, **kein Ort in `data/providers.yaml` nutzt es**.
- `scripts/build-data.ts` schreibt `public/data/site.json`, `meta.json`, ICS. `src/data/site.ts` lädt `site.json`.
- `.size-limit.json`: `JS (initial)` `dist/assets/*.js` 90 kB, zuletzt **87,3 kB** (2,7 kB Luft). Karten-Chunks liegen in `dist/assets/karte/` mit eigenem Budget.
- CI (`.github/workflows/ci.yml`): `check` (check:fast, knip, schema:check, Coverage, Plausibilität auf `main`) → `e2e` (Fixture-Build, Deploy-Build, Playwright, size) → `deploy`. CI hat heute **keinen** Netzzugriff auf Datenquellen außer der Plausibilität gegen die Live-Seite.
- `vitest.setup.ts` verbietet `fetch` in Unit-Tests.

**Echte Daten (2026-10-04):** 333 Angebote, 82 Orts-Einträge an **76 Koordinaten**, 2 889 Termine.
- Startzeiten: 53 % beginnen 9:00–10:59 (853 + 669), 60 % 8:00–11:59. Zweite Spitze 15 Uhr (591).
- Wochentag: Dienstag ist der häufigste (870 Termine, 30 %).

**Messungen** (2026-10-05, Skripte `analyze.mjs`, `csa.mjs`, `pcsa2.mjs` unter `/home/suus/.claude/jobs/1aadb80d/tmp/gtfs/`, außerhalb des Repos). Der Rechner lief unter starker Last (Load Average ≈ 119 auf 16 Kernen); alle Laufzeiten sind deshalb Obergrenzen.

### Datenquelle

| | VGN Open Data | gtfs.de „Nahverkehr Deutschland“ |
|---|---|---|
| URL | `https://www.vgn.de/opendata/GTFS.zip` (Seite: https://www.vgn.de/web-entwickler/open-data/) | `https://download.gtfs.de/germany/nv_free/latest.zip` (https://gtfs.de/de/feeds/) |
| Größe | **15,26 MB** gezippt (15 261 462 B), 156,7 MB entpackt | **285,5 MB** gezippt |
| Stand / Rhythmus | `Last-Modified: 24.06.2026`, gültig **24.06.–12.12.2026**, „ca. vierteljährlich“, ältere Stände unter http://www.vgn.de/opendata/ | täglich generiert, nur die nächsten 30 Tage |
| Lizenz | Download-Seite: **CC BY 3.0 DE**, Namensnennung „VGN – Verkehrsverbund Großraum Nürnberg GmbH“. Nutzungsbedingungen Nr. 5 Abs. 3 (https://www.vgn.de/web-entwickler/open-data/nutzungsbedingungen/, am 2026-10-05 im Wortlaut geprüft): **CC BY-SA 3.0 DE** („Creative Commons Namensnennung – Weitergabe unter gleichen Bedingungen 3.0 Deutschland“). Widerspruch, siehe E3. | CC BY 4.0 |
| Inhalt | U-Bahn, Tram, S-Bahn, R-Bahn, Stadt- und Regionalbus, Bedarfsverkehre | ganz Deutschland |

**VGN-Feed im Detail:** 8 Dateien (`agency`, `routes`, `trips`, `stops`, `calendar`, `calendar_dates`, `transfers`, `stop_times`), kein `feed_info`, keine `shapes`, keine `frequencies`.
- 1 295 Routen. Nach `route_desc`: Regionalbus 701, Stadtbus 362, Rufbus 129, R-Bahn 62, U-Bahn 10, Tram 8, S-Bahn 8, Linienbedarfstaxi 5, Anrufsammeltaxi 5, Kleinbus 3, Train 1, Linientaxi 1.
- 90 753 Fahrten, 1 710 427 `stop_times`, 24 787 Steige in 13 536 Haltbereichen. Die `stop_id` ist eine DHID (`de:09564:510:11:U1`), der Haltbereich sind die ersten drei Teile (`de:09564:510` = Nürnberg Hbf, 09564 = Gemeindeschlüssel Nürnberg).
- Zeiten mit Sekunden, bis `29:xx:xx` (Fahrten nach Mitternacht).
- Bedarfsverkehre haben `pickup_type = 2` (Anmeldung nötig), z. B. Rufbus 93 444 Halte-Ereignisse. Auch Stadtbus hat 39 606 Ereignisse mit `pickup_type = 2`.

**Referenz-Dienstag 13.10.2026** (Schultag): 405 aktive `service_id`, 34 882 Fahrten, davon 15 554 mit einem Abschnitt in `NUERNBERG_BBOX`.

| Haltbereiche in `NUERNBERG_BBOX` | Anzahl |
|---|---|
| bedient (irgendein Tag) | 1 862, davon Stadt Nürnberg 591 |
| mit Abfahrt am Stichtag 8–13 Uhr | **1 736**, davon **Stadt Nürnberg 570** |
| mit U-Bahn, S-Bahn oder Tram | **158**, davon Stadt 121 (ADR 0005 schätzte ~150) |
| je Verkehrsmittel | Stadtbus 1 400, Regionalbus 707, Tram 71, Rufbus 66, S-Bahn 52, U-Bahn 49, R-Bahn 41 |

Verbindungen (Fahrtabschnitt Halt → nächster Halt) in der BBOX am Stichtag: 259 521 am ganzen Tag, 104 953 zwischen 7 und 14 Uhr, für den Auszug 8:30–12:30 **52 579** in 3 405 Fahrten an 3 529 Steigen.

### Orte und Schiene

Nächster Halt je Ort (76 Koordinaten, Luftlinie zum Haltbereich):

| | ≤ 300 m | ≤ 600 m | > 600 m | > 1 km | weitester |
|---|---|---|---|---|---|
| U/S/Tram | 36 | 54 | **22** | **12** | 2 830 m (Boxdorfer Werkstatt) |
| irgendein Halt (auch Bus) | 69 | **76** | 0 | 0 | 411 m |

Die 12 Orte über 1 km: Boxdorfer Werkstatt 2 830 m, Wald-Angebot Steinbrüchlein 2 292 m, Mutherstudio Kraftshof 2 255 m, Gemeindesaal Ziegelstein 2 189 m, Waldracker 2 061 m, Haus der Begegnung Fischbach 1 697 m, Sportzentrum Nordost 1 175 m, Langwasserbad 1 166 m, Gemeindehaus Eibach 1 136 m, Hebamme Elena Paulus 1 020 m, Stadtteilhaus FiSch 1 019 m, Auferstehungskirche Zerzabelshof 1 011 m. Jeder davon hat einen Bushalt in höchstens 307 m.

### Routing-Messungen

Fußweg: Luftlinie × 1,3 bei 4,5 km/h. Umstiegspuffer 1 Min. Bedarfsverkehre ausgeschlossen (in der Messung noch über `route_desc`, ohne `pickup_type`). Fenster in der Messung: Abfahrt 9:00–10:59 je Minute; der Plan nimmt 8:30–10:30 (E5), die Zahlen verschieben sich dadurch nur wenig.

**Radien der Prototypen** (m13): Die Messung nutzte **1 000 m** für den Abgang zum Ort (Tabelle und exakte Rechnung) und für den Zugang der exakten Rechnung. Der Plan legt Zugang **und** Abgang auf **800 m** fest (E6, E8). Für den Zugang ist das belegt: 800, 1 000 und 1 500 m ergeben dieselben Werte (siehe unten). Für den Abgang ist es nicht gemessen, aber unkritisch: Jeder Ort hat einen Halt in höchstens 411 m. Schritt 5 vergleicht 800 gegen 1 000 m Abgang auf den echten Daten und notiert den Anteil geänderter Zellen (Erwartung < 1 %).

- **Bus ja oder nein**, 35 Stadtteile × 76 Orte = 2 660 Paare, Median Tür-zu-Tür. Nur U/S/Tram ist im Schnitt **+5,2 Min.** langsamer (Median +1,4, p90 +16,4, max +73,5). **31,8 %** der Paare sind mehr als 5 Min. und **20,3 %** mehr als 10 Min. zu pessimistisch. Beispiele (mit Bus / ohne): Gostenhof → Langwasserbad 36,5 / 47,1; Altstadt → Boxdorfer Werkstatt 48,5 / 87,3; Buch → Haus der Begegnung 72,2 / 89,7.
- **Wartezeit:** Median minus beste Fahrt im Fenster: im Schnitt 6,0 Min. Mittelwert minus Median: 0,0. Median minus „geplant“ (Abfahrt passend zur Verbindung, also ohne Wartezeit am ersten Halt): 4,5 Min. p80 minus Median: 3,5 Min.
- **Zu Fuß schneller** bei 1,2 % der Paare (z. B. Gostenhof → FBS Haupthaus: 5 Min. zu Fuß).
- **Verteilung** Stadtteil → Ort, je Stadtteil gezählt:

  | bis | Orte je Stadtteil (Median) | wenigste | Stadtteile ohne Ort |
  |---|---|---|---|
  | 15 Min. | 2 | 0 | 3 |
  | 20 Min. | 8 | 0 | 1 |
  | 30 Min. | 29 | 1 | 0 |
  | 45 Min. | 64 | 12 | 0 |
  | 60 Min. | 73 | 45 | 0 |

- **Halt→Ort-Tabelle statt exakter Rechnung ab dem Punkt:** Rechnet man ab einem Stadtteil über die Halte im Umkreis von 800 m (Fußweg dorthin + Tabellenwert, Minimum mit dem direkten Fußweg), weicht das von der exakten CSA ab dem Punkt im Median um **−0,16 Min.** ab (Mittel −0,29; p5 −1,5; p95 +1,4). **30 von 2 660** Paaren (1,1 %) weichen mehr als 5 Min. ab. Mit 600 m sind es 92 Paare, mit 1 000 m und 1 500 m dasselbe wie mit 800 m.
- **Zugang der Stadtteile:** Jeder der 35 Stadtteil-Punkte hat mindestens 4 Haltbereiche im Umkreis von 800 m (Median 9). Der weiteste nächste Halt liegt 358 m entfernt.
- **Laufzeit:**
  - Vorwärts-CSA je Start und Minute: 35 Stadtteile × 120 Minuten in 2,2 s. Für 570 Halte × 120 Minuten aber **212,5 s**, für den Build zu langsam.
  - **Profil-CSA** (all-to-one, ein Lauf je Ort, typisierte Arrays): 76 Orte × 570 Halte in **5,3 s Scan + 1,5 s Auswertung**, × 1 771 Halte in 8,9 + 5,7 s, jeweils mit den Verbindungen 7–14 Uhr (104 205).
  - Gleichheit Profil- gegen Vorwärts-CSA, 570 × 76: 40 223 Werte gleich (92,9 %), 1 218 ±1 Min. (Rundung des Medians), 113 ±2–3, 107 mehr. 1 157 Werte unterscheiden sich nur, weil die Vorwärts-Messung nach 2,5 h abbricht. Der Rest (220 Zellen) ist ungeklärt. Zugangsradius und Rundung scheiden aus, also liegt ein Fehler in einem der beiden Prototypen vor. Im Produkt schließt der Referenztest (E6, „Profil = Vorwärts für jeden Halt und jede Minute“) das aus.
- **Systematische Verzerrung** (m13), bewusst oder in Kauf genommen:
  - **pessimistisch:**
    - Wartezeit am ersten Halt (bewusst, Nutzerentscheidung): im Schnitt +4,5 Min. gegenüber „passend losgehen“;
    - Fußwege werden nicht verkettet (höchstens ein Fußweg je Umstieg);
    - 1 Min. Puffer auch beim Umsteigen am selben Steig;
    - Umwegfaktor 1,3 auch dort, wo der Weg gerade ist;
    - Zugang zum Mittelpunkt des Haltbereichs statt zum nächsten Steig.
  - **optimistisch:**
    - keine Verspätungen, keine verpassten Anschlüsse;
    - die Messung ignorierte noch `pickup_type`/`drop_off_type` (das Produkt beachtet sie, E2);
    - der Fußweg zählt ab der gerundeten Koordinate (±70 m).
  - In der Summe liegt die Schätzung eher **über** der Fahrplanauskunft. Der Browser-Review vergleicht 5 Stichproben mit der VGN-Auskunft (Schritt 11).

### Größen

| Variante | Werte | roh | gzip |
|---|---|---|---|
| (a) Halt→Halt, nur U/S/Tram (ADR 0005) | 158² = 24 964 | 25 kB | – |
| (a) Halt→Halt mit Bus, Stadt | 570² = 324 900 | 325 kB | – |
| (a) Halt→Halt mit Bus, BBOX | 1 771² ≈ 3,1 Mio. | 3,1 MB | – |
| (b) Halt→Ort, Stadt, Minuten ≤ 120 (`Uint8`) | 570 × 76 = 43 320 | 43 kB | **38,2 kB** als JSON mit Base64 |
| (b) Halt→Ort, BBOX | 1 771 × 76 = 134 596 | 135 kB | 114,3 kB als JSON mit Base64 (85,9 kB binär) |
| (b′) nur 35 Stadtteile → Ort | 2 660 | 2,7 kB | – |
| Fahrplanauszug 8:30–12:30 (Repo, E4) | 52 579 Verbindungen | ≈ 650 kB JSON (gemessen: 1 017 kB, siehe „Umsetzung“) | ≈ 121 kB (gemessen: 169 kB) |

GitHub Pages komprimiert JSON (`site.json`: `content-encoding: gzip`, 83,5 kB übertragen), Binärdateien dagegen nicht (ADR 0008, Range-Prüfung). Deshalb JSON mit Base64 statt `.bin`.

### npm statt eigenem Algorithmus?

| Paket | Version, Lizenz | Bewertung |
|---|---|---|
| `raptor-journey-planner` (planarnetwork) | 5.2.0, **GPL-3.0** | Einzelabfragen A→B, kein Profil über ein Zeitfenster, eigener GTFS-Lader |
| `connection-scan-algorithm` (planarnetwork) | 3.1.0, **GPL-3.0** | wie oben |
| `gtfs` (node-gtfs) | 4.21.0, MIT | Import nach SQLite mit `better-sqlite3` (nativer Build), kein Routing |
| `gtfs-utils` | 5.1.0, ISC | zuletzt 2022 geändert, kein Routing, viele Abhängigkeiten (u. a. `ioredis`) |
| `fflate` | 0.8.3, MIT, keine Abhängigkeiten, 0,8 MB entpackt | nur zum Entpacken der ZIP-Datei (E4) |

## Entscheidungen

### E1 – Begriff und Ehrlichkeit

- Die UI nennt das Konzept „**Wegzeit**“ (Plan 0004, E1/E9). Das Kind-Sheet heißt „Wegzeit ab“, die Filtergruppe „Wegzeit“. Die Domäne behält `Reach`.
- Jede lange Form sagt, was gemeint ist: „mit Bus & Bahn“ oder „zu Fuß“. Die Statuszeile nennt einmal die Annahme: „(Di vormittags, inkl. Warten)“. Die kurze Form „25 Min.“ steht nur auf Kacheln und in der Orts-Liste.
- Gerundet wird, weil es eine Schätzung ist (E8). Die lange Form beginnt mit „ca.“.
- Die Luftlinie bleibt als Rückfall (E11) und heißt dann weiter „Entfernung als Luftlinie“.

### E2 – Umfang: Bus gehört dazu

- **Mit Bus**: alle Linienverkehre des VGN-Feeds in `NUERNBERG_BBOX`, also U-Bahn, Tram, S-Bahn, R-Bahn, Stadt- und Regionalbus, Kleinbus.
- **Ohne Bedarfsverkehr**: `route_desc` ∈ {Rufbus, Linienbedarfstaxi, Anrufsammeltaxi, Linientaxi} fällt ganz weg. Zusätzlich gilt je Halte-Ereignis: Einsteigen nur bei `pickup_type = 0`, Aussteigen nur bei `drop_off_type = 0`. Wer im Fahrzeug sitzen bleibt, fährt durch solche Halte durch.
- Begründung (gemessen): Ohne Bus liegen 22 von 76 Orten über 600 m und 12 über 1 km vom nächsten Halt. Die Schätzung wäre bei einem Drittel der Stadtteil-Ort-Paare mehr als 5 Min. zu pessimistisch, im schlimmsten Fall um 73 Min. Mit Bus liegt jeder Ort höchstens 411 m vom nächsten Halt.

### E3 – Datenquelle, Lizenz, Namensnennung

- Quelle ist **VGN Open Data**, `https://www.vgn.de/opendata/GTFS.zip`: regional, 15 MB, gültig bis zum Fahrplanwechsel.
- Verworfen: gtfs.de (285 MB für ganz Deutschland, nur 30 Tage, müsste auf Nürnberg zugeschnitten werden), DELFI (Registrierung, ebenfalls bundesweit).
- **Lizenz:** Download-Seite (CC BY 3.0 DE) und Nutzungsbedingungen Nr. 5 Abs. 3 (CC BY-SA 3.0 DE) widersprechen sich. Wir behandeln die Daten **vorsichtig als CC BY-SA 3.0 DE** (Nutzerentscheidung) und erfüllen Abschnitt 4 des Lizenztextes (https://creativecommons.org/licenses/by-sa/3.0/de/legalcode, am 2026-10-05 gelesen) vollständig:
  - **4a – Lizenz beifügen:** Jede Weitergabe nennt die vollständige Lizenz-URI `https://creativecommons.org/licenses/by-sa/3.0/de/`.
  - **4b – gleiche Bedingungen:** Abwandlungen (`data/oepnv/fahrplan.json`, `public/data/wegzeit.json` und die daraus angezeigten Minuten) stehen unter CC BY-SA 3.0 DE. Das übrige Repo (Code, Angebote) bleibt davon unberührt: Die Tabelle ist ein abgegrenzter Bestandteil, kein Sammelwerk unter dieser Lizenz.
  - **4c – Namensnennung:** in angemessener Form
    - der Rechteinhaber, wörtlich wie verlangt: „VGN – Verkehrsverbund Großraum Nürnberg GmbH“;
    - der Titel des Inhalts, wie auf der Download-Seite: „VGN-Soll-Daten vom 24.06.2026“ (aus `Last-Modified`, ändert sich je Feed);
    - die vom VGN angegebene URI `https://www.vgn.de/web-entwickler/open-data/`;
    - der Hinweis, dass es sich um eine **Abwandlung** handelt: „abgewandelt: Auszug für einen Dienstagvormittag, daraus berechnete Wegzeiten“.
    - Kein Text deutet eine Unterstützung durch den VGN an (4c, letzter Satz). Wir nutzen keine VGN-Marke (Logo, Nr. 7 der Nutzungsbedingungen), nur den Namen als Quelle.
  - **4d – Einordnung:** Für Teile, die nur als Datenbank geschützt sind (Leistungsschutz eigener Art), gelten 4a–c nach dem Lizenztext nicht. Fahrplandaten fallen vermutlich darunter. Wir erfüllen 4a–c trotzdem, weil das billig ist und den Lizenzwiderspruch entschärft.
- **Wo die Angaben stehen:**
  - Feld `source` in `data/oepnv/fahrplan.json` (E4) und `public/data/wegzeit.json` (E7): `{ attribution, title, url, license, licenseUrl, modified }`.
  - `README.md`, Abschnitt „Datenquellen“: alle vier Angaben aus 4c plus Lizenz-URI.
  - **Kind-Sheet** unter „Wegzeit ab“ (`.small`): „Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß für einen Dienstagvormittag, inklusive Warten. Fahrplan: VGN – Verkehrsverbund Großraum Nürnberg GmbH, ‚VGN-Soll-Daten vom 24.06.2026‘, abgewandelt, Lizenz CC BY-SA 3.0 DE.“ Dabei sind „VGN-Soll-Daten vom 24.06.2026“ ein Link auf die VGN-URI und „CC BY-SA 3.0 DE“ ein Link auf die Lizenz-URI. Beide Links sind Fließtext-Links mit Trefferfläche ≥ 24 px (Mobile-UX-Gate, `padding-block` wie die Karten-Attribution). Danach folgen wie bisher die Sätze zu Speicherung und OSM-Stadtteilen.
  - Die Texte entstehen aus `source` in `wegzeit.json`, nicht fest im Code (`transitSourceNote` in `format.ts`). Ohne geladene Tabelle steht nur „Fahrplan: VGN – Verkehrsverbund Großraum Nürnberg GmbH, CC BY-SA 3.0 DE“ mit beiden Links.
- Der Abruf läuft nur in der Pipeline, nie im Browser und nie in CI.

### E4 – Pipeline-Schritt „oepnv“: Fahrplanauszug ins Repo

Neuer Befehl `pnpm pipeline oepnv [--force]`. Er läuft lokal wie alle Netzschritte (ADR 0002, ADR 0006).

1. **Laden mit Cache** (`scripts/pipeline/io/gtfs.ts`):
   - `GET` mit `If-None-Match`/`If-Modified-Since` aus dem Cache `~/.cache/zwergenplan/gtfs/` (wie `io/cache.ts`).
   - Bei `304` und unverändertem `lastModified` in `data/oepnv/fahrplan.json`: Meldung „Fahrplan aktuell (Stand …)“, Ende **ohne** Änderung an `data/` (kein `checkedAt`, kein Diff je Lauf, m10). `--force` baut trotzdem neu, z. B. nach einer Code-Änderung am Auszug.
   - Entpacken mit `fflate` (devDependency, exakt gepinnt). `stop_times.txt` (146 MB) wird zeilenweise an die reine Logik gereicht.
2. **Referenztag** (`scripts/pipeline/lib/gtfs.ts`, rein):
   - `pickServiceDay({ validFrom, validTo, freeDays, today })`: Kandidaten sind alle Dienstage im Gültigkeitszeitraum, die weder Feiertag noch Ferientag in Bayern sind (`loadFreeDays` aus `io/holidays.ts`). Gewählt wird der erste Kandidat ab `today + 7 Tage`, sonst der letzte. Ohne Kandidat bricht der Befehl ab.
   - Begründung: Ein Schultag hat den Regelfahrplan. Die Woche Abstand meidet kurzfristige Ausnahmen in `calendar_dates`.
3. **Auszug** (rein): aktive `service_id` am Stichtag aus `calendar` und `calendar_dates` (1 = hinzu, 2 = weg); Fahrten ohne Bedarfsverkehr (E2); je Fahrt nur die Halte-Ereignisse in `NUERNBERG_BBOX`; nur Fahrten mit einem Ereignis zwischen **8:30 und 12:30** (Abfahrtsfenster 8:30–10:30 plus 120 Min. Obergrenze, E8). Eine Fahrt, die die BBOX verlässt und wieder hineinfährt, bleibt eine Fahrt: Der Abschnitt draußen wird eine Verbindung ohne Zwischenhalt.
4. **Ausgabe** `data/oepnv/fahrplan.json` (committet, ≈ 650 kB geschätzt, gemessen 1 017 kB roh / 169 kB gzip, eine Fahrt je Zeile für lesbare Diffs), geprüft mit dem Zod-Schema `Timetable` aus `src/domain/schema.ts` (E12).
   - **Format und Biome (M2):** Ein eigener Serialisierer (`serializeTimetable` in `scripts/pipeline/lib/gtfs.ts`) schreibt ein Steig bzw. eine Fahrt je Zeile. Durch `biome format` geschickt (wie `writeOffers`) würde die Datei gemessen **3,3 MB mit 272 232 Zeilen** (224 kB gzip), weil Biome jede Zahl auf eine eigene Zeile setzt.
   - Deshalb bekommt `biome.json` unter `files.includes` die Ausnahmen `!data/oepnv` und `!tests/fixtures/oepnv`, mit Kommentar: „generierter Fahrplanauszug, eigenes Zeilenformat (Plan 0009, E4), Prüfung per Zod in validate-data“.
   - **Besitzer** ist Paket B1, weil B1 die Fixture `tests/fixtures/oepnv/fahrplan.json` als Erstes anlegt (E16). Die Fixture steht von Hand im selben Zeilenformat.
   ```ts
   {
     source: { attribution: "VGN – Verkehrsverbund Großraum Nürnberg GmbH", title: "VGN-Soll-Daten vom 24.06.2026",
               url: "https://www.vgn.de/web-entwickler/open-data/", download: "https://www.vgn.de/opendata/GTFS.zip",
               license: "CC BY-SA 3.0 DE", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/",
               modified: Instant /* Last-Modified */, validFrom: IsoDate, validTo: IsoDate, fetchedAt: Instant },
     serviceDay: IsoDate,                       // Referenz-Dienstag
     window: { from: "08:30", to: "10:30" },    // Abfahrtsfenster
     stops: [id: string, lat: number, lon: number][],      // Steige, DHID, 5 Nachkommastellen
     trips: { route: string; stops: number[]; times: number[]; flags: number[] }[],
       // times: Sekunden ab Mitternacht des Stichtags, je Halt [an, ab], ab dem zweiten Wert als Differenz
       // flags: Bit 1 = Einsteigen erlaubt, Bit 2 = Aussteigen erlaubt
   }
   ```
   `route` ist der Kurzname („U1“, „36“), nur zur Fehlersuche.
5. **Veröffentlichen:** `pipeline publish` committet ohnehin `data/`. Der Skill bekommt einen Schritt „Fahrplan prüfen“ (E13).

Warum ein Auszug im Repo und nicht der Feed in CI:
- CI bleibt ohne Netzabhängigkeit an `vgn.de`, und jeder Build ist reproduzierbar.
- Die Tests laufen offline (E15).
- Der Auszug ist Eingangsdatum wie `offers.json`, kein abgeleiteter Wert. Abgeleitet wird erst die Tabelle (E5, E7), und die entsteht bei jedem Build neu.
- Kosten: etwa 120 kB komprimiert in der Git-Historie je Aktualisierung, also rund 0,5 MB im Jahr.

### E5 – Wegzeit-Tabelle zur Build-Zeit: Halt → Ort (Variante b)

`scripts/build-data.ts` rechnet aus `data/oepnv/fahrplan.json` und den Orten der Angebote die Tabelle `public/data/wegzeit.json`.

**Bewertung der Varianten** (Zahlen oben unter „Größen“ und „Routing-Messungen“):

| | (a) Halt→Halt + `nearestStops` (ADR 0005) | (b) Halt→Ort |
|---|---|---|
| Größe mit Bus | 325 kB roh (Stadt) bis 3,1 MB (BBOX) | **43 kB roh, 38 kB gzip** (Stadt) |
| Genauigkeit | nur U/S/Tram tragbar, dann +5,2 Min. im Schnitt und bis +73 Min.; Umstieg Matrix → Fußweg zum Ort ohne Wartezeit | Tür-zu-Tür inkl. Warten; gegenüber exakter Rechnung ab dem Punkt Median −0,2 Min., 1,1 % über 5 Min. |
| GPS / Kartenmitte | Browser braucht Fußweg + Matrix + `nearestStops` | Browser braucht nur Fußweg zum Halt + Tabellenwert |
| Schema | `Venue.nearestStops` gespeichert (abgeleiteter Wert im Datenvertrag) | keine Schemaänderung am Ort |
| Kopplung | unabhängig von den Orten | Tabelle hängt an den Orten, wird aber bei jedem Build neu gerechnet |

Entschieden: **(b)**. Variante (b′), nur 35 Stadtteile → Orte (2,7 kB), wäre exakt und winzig, kann aber Standort und Kartenmitte nicht bedienen. Die Halt-Zeilen decken die Stadtteile mit derselben Rechnung ab (E9).

**Zeilen:** die Haltbereiche im Stadtgebiet Nürnberg (DHID-Präfix `de:09564:`) mit mindestens einer Abfahrt im Fenster, heute 570. Koordinate ist der Mittelpunkt der Steige. Das Netz zum Rechnen ist die ganze BBOX, also zählen auch Wege über Fürth.
**Spalten:** die Orte als `placeKey(geo)` (`src/domain/place-key.ts`, dieselbe Funktion wie Karte und Entfernungs-Cache), in der Reihenfolge der ersten Nennung in `site.json`.
**Wert** je Zelle (m12), genau so:
1. Für jede Abfahrtsminute `m = 0…119` (`t = 8:30 + m · 60 s`) ist `x_m = min über alle Steige s des Haltbereichs von min(profil_s(t), t + abgang_s) − t` in Minuten. `profil_s(t)` ist die früheste Ankunft am Ort beim Start an Steig `s` ab `t` (E6), `abgang_s` der direkte Fußweg vom Steig zum Ort (≤ 800 m, sonst ∞). Unerreichbar ergibt `x_m = ∞`.
2. `x` aufsteigend sortieren, Median `= (x[59] + x[60]) / 2` (gerade Anzahl, 120 Werte).
3. `Math.round`. Ist das Ergebnis > 120 oder nicht endlich, wird `255` gespeichert, sonst die ganze Minute `0…120`.
4. Enthalten sind damit Warten am ersten Halt, Fahrt, Umsteigen mit Puffer und der Fußweg zum Ort. Der Fußweg vom Startpunkt zum Halt kommt erst im Browser dazu (E8).

Kodierung: `Uint8Array` zeilenweise (Halt × Ort). Im Build `Buffer.from(bytes).toString("base64")`, im Browser `atob` und eine Schleife `charCodeAt` → `Uint8Array`. `Uint8Array.fromBase64` ist noch nicht in allen Zielbrowsern verfügbar.

### E6 – Routing in TypeScript: eigene Profil-CSA

- **Eigener Algorithmus** statt Bibliothek: Die Kandidaten sind GPL-3.0 und können keine Profile über ein Zeitfenster, oder sie routen gar nicht (Tabelle oben). Der Kern ist klein (geschätzt ≤ 200 Zeilen) und vollständig testbar.
- **Profil-CSA** (Connection Scan, Dibbelt/Pajor/Strasser/Wagner, „Connection Scan Algorithm“, 2018), all-to-one, **ein Lauf je Ort**. Je Steig entsteht ein Profil (Abfahrt → früheste Ankunft am Ort). Gemessen: 6,8 s für 570 × 76 unter Last; Ziel im Build ≤ 10 s auf dem CI-Runner (E10, Risiken).
- **Sortierung (M4), festgeschrieben:** Verbindungen absteigend nach Abfahrt `dep`. Bei gleicher Abfahrt absteigend nach Ankunft `arr`, danach nach Fahrt und absteigend nach `stop_sequence` (Position in der Fahrt).
  - Grund: Bei Verbindungen mit `dep == arr` (Halte im Sekundenabstand, im Feed vorhanden) muss die spätere Verbindung derselben Fahrt zuerst gescannt werden, sonst kennt die frühere den Wert „sitzen bleiben“ (`T[trip]`) noch nicht.
  - Die Sortierung ist eine benannte Funktion `connectionOrder` mit eigenem Test. Das Fixture-Netz enthält eine Fahrt mit zwei aufeinanderfolgenden Verbindungen `dep == arr` (E15).
- **Modell:**
  - Sitzenbleiben in derselben Fahrt kostet nichts.
  - Umsteigen am selben Steig oder zu Fuß zu einem anderen Steig im Umkreis von **400 m** Luftlinie kostet Fußweg + **1 Min.** Puffer. Fußwege werden nicht verkettet.
  - `transfers.txt` (11 883 Paare, 2–10 Min.) wird nicht genutzt: Es deckt nur einen Teil der Paare ab und ist in sich nicht einheitlich. Ein eigenes, überall gleiches Modell ist nachvollziehbar. → `docs/ideas.md`.
  - Abgang zum Ort: von jedem Steig im Umkreis von **800 m** Luftlinie.
- **Fußweg:** Luftlinie × **1,3** (Umweg) bei **4,5 km/h** (75 m/Min.), Kinderwagen-Tempo. Dieselbe Funktion `walkMinutes(meters)` gilt im Build und im Browser; sie liegt in `src/domain/transit.ts`, der Build importiert sie.
- **Referenz im Test:** eine einfache Vorwärts-CSA (nur Testcode) rechnet für jede Startminute einzeln. Auf dem Fixture-Netz muss die Profil-CSA für **jeden** Halt und **jede** Minute dieselbe Ankunft liefern (E15). So kann der Modellunterschied der Prototypen nicht ins Produkt.
- **Ort:** `scripts/transit/` (neu, rein, ohne Node-I/O und ohne Netz): `profile-csa.ts`, `table.ts` (Auszug + Orte → Tabelle, Kodierung). Die Regeln von `scripts/pipeline/lib` gelten auch hier (E10).

### E7 – Datei `public/data/wegzeit.json`

```ts
/** Build-Artefakt wie site.json: Typ in src/domain/transit-types.ts (E10), kein Zod im Client. */
interface TransitTableFile {
  version: 1;
  source: { attribution: string; title: string; url: string; license: string; licenseUrl: string;
            validFrom: string; validTo: string };   // Abwandlungshinweis entsteht im Text (E3)
  serviceDay: string;                 // „2026-10-13“
  window: { from: string; to: string };
  places: string[];                   // placeKey je Spalte
  lat: number[]; lon: number[];       // Zeilen: Grad × 1e4, ab dem zweiten Wert als Differenz
  minutes: string;                    // Base64, Uint8Array(rows × places), zeilenweise, 255 = keine Angabe
}
```

- Gemessen 38,2 kB gzip für 570 × 76. Die Datei wächst linear mit der Zahl der Orte.
- **Budget** in `.size-limit.json`: `Wegzeit-Daten` `dist/data/wegzeit.json` **64 kB** gzip. Bei rund 120 Orten wird es eng; dann folgt erst Kompression (Halte räumlich sortieren und zeilenweise Differenzen, gemessen −10 %), danach eine neue Entscheidung.
- **Fehlender Auszug, zweistufig (Review B1):**
  - **Bis zum Zusammenführen in Schritt 5** gibt es `data/oepnv/fahrplan.json` noch nicht (Paket A erzeugt ihn parallel zu B2). Solange gilt: Fehlt der Auszug, schreiben `validate-data` und `build-data` nur `::warning::Kein Fahrplanauszug (data/oepnv/fahrplan.json) – Wegzeit entfällt`. `build-data` schreibt dann **keine** `wegzeit.json`, und die UI fällt auf „fehler“ zurück (E11). So bleiben lefthook, `check:fast` und die Branch-CI von B1 und B2 ohne Auszug grün.
  - Gesteuert wird das über eine Konstante `TIMETABLE_REQUIRED` in `scripts/lib/load-data.ts` (Start: `false`, Test für beide Werte).
  - **Schritt 5 schaltet um** (eigener Haken): `TIMETABLE_REQUIRED = true`, ab dann ist ein fehlender echter Auszug **rot**. Die Budget-Zeile `Wegzeit-Daten` kommt erst mit Paket C (nach Schritt 5), sonst fände size-limit keine Datei.
  - Ein ungültiger Auszug (Zod) ist immer rot, ein abgelaufener nur eine Warnung (E13).
- Der Fixture-Build nutzt `tests/fixtures/oepnv/fahrplan.json` (fiktives Mini-Netz, E15), derselbe Pfad relativ zum Datenverzeichnis (`loadDataset`). Die Fixture gibt es ab B1, der Fixture-Build schreibt also immer eine `wegzeit.json`.

### E8 – Domäne: `Reach` „oepnv“, Rundung, Vergleich, Filter

`src/domain/reach.ts` (Startbundle):

```ts
export type Reach =
  | { kind: "luftlinie"; meters: number }
  | { kind: "oepnv"; minutes: number; byFoot: boolean };   // minutes > 120 = „über 2 Std.“
export type ReachFn = (target: ReachTarget) => Reach;
export function airlineReach(origin: Origin): ReachFn;     // bisher reachTo, bleibt die Luftlinie
export function compareReach(a: Reach, b: Reach): number;
export const LIMIT_MINUTES = [20, 30, 45] as const;
export type ReachLimit = { kind: "minuten"; value: (typeof LIMIT_MINUTES)[number] };
export function withinLimit(reach: Reach, limit: ReachLimit): boolean | undefined;  // undefined: Grenze gilt nicht
export function roundedMinutes(minutes: number): { over: boolean; value: number };
```

- **Rundung** `roundedMinutes`:
  - unter 7,5 Min.: 5;
  - bis einschließlich 60 Min.: auf 5 Min. (`Math.round(m / 5) * 5`);
  - bis einschließlich 120 Min.: auf 10 Min.;
  - darüber: `{ over: true, value: 120 }` → „über 2 Std.“.
  - Beispiele: 0 → 5, 7,4 → 5, 7,5 → 10, 23 → 25, 57,4 → 55, 57,5 → 60, 64 → 60, 65 → 70, 120 → 120, 121 → über 2 Std.
- **`compareReach`**: gleiche Art nach Wert, per Vergleich (`a < b ? -1 : a > b ? 1 : 0`) statt Subtraktion. Sonst ergäbe `Infinity − Infinity` ein `NaN` und die Sortierung würde unbestimmt (m11). Zwei unerreichbare Orte sind gleich (0); Test dafür. Bei verschiedener Art steht `oepnv` vor `luftlinie`. Das kommt praktisch nicht vor (E11: je Startpunkt ist alles eine Art), macht die Ordnung aber total.
- **`withinLimit`**: `oepnv` vergleicht die **ungerundeten** Minuten (`≤ value`). Bei `luftlinie` gilt die Minuten-Grenze nicht (`undefined`), der Filter wirkt dann nicht (E11).
- **Filter** (`filter.ts`):
  - `FilterContext.origin` wird zu `FilterContext.reach?: ReachFn`. `matchesFilter(offer, state, reach?)`.
  - URL `wegzeit=20|30|45`, kanonisch nach `kosten`, andere Werte werden verworfen.
  - `umkreis=` wird nicht mehr gelesen. Alte Links zeigen dann alle Angebote. Die App ist privat und der Parameter zwei Tage alt; eine Übersetzung km → Min. wäre geraten.
  - `activeFilterCount(filter, { limitActive })` zählt die Grenze nur, wenn sie wirkt.
  - `withReachLimit` bleibt.
- **Warum 20 / 30 / 45:** Bei 15 Min. hätten 3 Stadtteile keinen einzigen Ort und der Median läge bei 2 Orten. 20 / 30 / 45 ergeben im Median 8 / 29 / 64 von 76 Orten je Stadtteil, eine brauchbare Staffel (Messung oben).
- `RADII_KM`, `ReachLimit` in km und `roundedDistance` für den Filter entfallen. `roundedDistance` bleibt für die Anzeige der Luftlinie.

`src/domain/transit.ts` (lazy oder statisch nach dem Entscheidungspunkt in E10), Typen in `src/domain/transit-types.ts`:

```ts
export function walkMinutes(meters: number): number;                 // meters × 1,3 / 75
export function decodeTransitTable(file: TransitTableFile, placeKeys: ReadonlySet<string>): TransitTable | undefined;
export function transitReach(table: TransitTable, origin: Origin): ReachFn | undefined;
export const ACCESS_METERS = 800;
// transit-types.ts: TransitTableFile (E7), TransitTable (dekodiert: lat/lon als Float64Array, minutes als Uint8Array)
```

- `decodeTransitTable` prüft `version`, die Längen (`lat.length === lon.length`, `minutes` = Zeilen × Spalten) und dass **jeder** Ort aus `site.json` eine Spalte hat. Sonst liefert es `undefined`, z. B. wenn der HTTP-Cache eine alte `wegzeit.json` zur neuen `site.json` liefert.
- `transitReach`:
  - Zugangshalte: alle Zeilen im Umkreis von `ACCESS_METERS` (Luftlinie). Gibt es keine, ist das Ergebnis `undefined` (E11, Modus „ausserhalb“: Die Zeilen decken nur das Stadtgebiet ab, und dort hat jeder Stadtteil Halte in höchstens 358 m).
  - Je Ort `min(walkMinutes(Luftlinie Start→Ort), min über Zugangshalte (walkMinutes(Start→Halt) + Tabellenwert))`; `255` zählt nicht.
  - `byFoot` ist wahr, wenn der direkte Fußweg das Minimum ist.
  - Das Ergebnis wird je Startpunkt einmal für alle Spalten gerechnet und zwischengespeichert (`Map<placeKey, Reach>`), wie heute `reachCache`.
  - Ein Ort ohne Wert und mit direktem Fußweg über 120 Min. ergibt `minutes: Infinity` → „über 2 Std.“.

### E9 – Was der Browser wann rechnet

| Startpunkt | Rechnung | Netz |
|---|---|---|
| **Stadtteil** (35 feste Punkte) | wie jeder Punkt: Zugangshalte ≤ 800 m + Tabelle (gemessen: alle 35 haben ≥ 4 Zugangshalte) | keins nach der Wahl |
| **Standort** (GPS, gerundet auf ~100 m in `src/data`) | dieselbe Rechnung | keins nach der Wahl |
| **Kartenmitte** (gerundet) | dieselbe Rechnung | keins nach der Wahl |

- Es gibt **einen** Rechenweg für alle drei Quellen. Getrennte Stadtteil-Zeilen sind nicht nötig, die Abweichung liegt im Median bei −0,2 Min.
- Der Aufwand je Startpunkt sind 570 Abstände plus 76 × (Zugangshalte, Median 9) Additionen, also unter 1 ms.
- **Laden der Tabelle** (`src/data/transit.ts`, `loadTransitTable()`, nur `fetch` vom eigenen Origin, kein Laufzeit-Import aus `src/domain`, ADR 0010 bleibt):
  - Auslöser ist `useTransit().want()` in `src/ui/use-transit.ts`. Er feuert, wenn
    1. beim Start ein Stadtteil gespeichert ist (`zwergenplan.entfernung-ab`),
    2. das Kind-Sheet geöffnet wird (dort wählt man Standort oder Stadtteil),
    3. die Karte geöffnet wird (dort gibt es „Kartenmitte als Startpunkt“),
    4. jemand im Modus „fehler“ auf „Nochmal laden“ tippt (E11). Das ist eine eigene Handlung, unabhängig davon, welcher Startpunkt gilt.
  - Die **Wahl** eines Startpunkts löst nie einen Request aus. So bleibt die Invariante „ab der Wahl des Startpunkts entsteht kein Request“ (E2E) wörtlich wahr.
  - **Neue Invariante** für `docs/architecture.md` (m14): „**Kein Request hängt davon ab, welcher Startpunkt gilt.** URL und Inhalt jedes Requests sind für alle gleich. Die Wegzeit-Tabelle lädt beim Öffnen einer Startpunkt-Oberfläche (Kind-Sheet, Karte), auf ‚Nochmal laden‘ oder beim Start, wenn irgendein Stadtteil gespeichert ist, nie als Folge einer Wahl.“
  - Bewusste Ausnahme: Der Request beim Start verrät dem eigenen Host (GitHub Pages) ein Bit, nämlich dass *ein* Stadtteil gespeichert ist, aber nicht welcher. Ohne ihn gäbe es nach dem Neuladen keine Wegzeit, bis jemand das Kind-Sheet öffnet. Festgehalten in ADR 0011.
  - Ist die Rechenlogik lazy (E10), lädt parallel `import("../domain/transit.ts")` über `useLazy` aus `src/ui/Lazy.tsx`, im Stand nach Plan 0008: `retry` setzt „laden“ und den Versuch im selben Render.
  - Zeitlimit 8 s für den `fetch`, danach Modus `fehler`.
  - Ein Fehlschlag (offline, 404, Zeitlimit, Chunk) setzt den Modus `fehler`. Erneut versucht wird erst beim nächsten Auslöser 2, 3 oder 4, nie als Reaktion auf eine Wahl.
  - Geladen wird höchstens einmal je Sitzung (Zustand `bereit` bleibt).
- Ohne Startpunkt-Oberfläche und ohne gespeicherten Stadtteil lädt die Seite die Tabelle nicht (E2E).

### E10 – Startbundle, Entscheidungspunkt lazy/statisch, Budgets und Regeln

- **Immer im Startbundle:** `reach.ts` (Zweig `oepnv`, `roundedMinutes`), Texte in `format.ts`, `use-transit.ts`, `src/data/transit.ts`, der Filter. Schätzung +1,0–1,5 kB gzip, abzüglich der entfallenden km-Teile (~0,2 kB). Die Tabelle selbst ist nie im Bundle.
- **Entscheidungspunkt für `src/domain/transit.ts` (m15), nach Schritt 5:**
  - Ausgangswert: Nach Plan 0008 liegt das Start-JS bei ca. **87,9 kB** (Messung des Koordinators). Er wird zu Beginn von Schritt 5 neu gemessen und hier notiert.
  - Gemessen wird `pnpm build && pnpm size` mit Domäne und Hook verdrahtet **und `transit.ts` statisch importiert**, noch vor der UI aus Schritt 6.
  - **Schwelle 88,6 kB:** Liegt das Start-JS darunter oder darauf, bleibt `transit.ts` **statisch**. Für die UI aus Schritt 6 bleiben dann mindestens 1,4 kB bis 90 kB. Es entfallen Lazy-Chunk, `transit-only-lazy`, die Budget-Zeile `Wegzeit JS (lazy)` und der Chunk-Fehlerfall (M8).
  - **Darüber** kommt `transit.ts` **lazy** in `dist/assets/oepnv/` (Vite `chunkFileNames` über den Chunk-Namen, wie `karte/`), mit Budget `Wegzeit JS (lazy)` `dist/assets/oepnv/*.js` **3 kB**, und es gelten die Regeln unten.
  - Die Entscheidung samt Messwert steht in der Commit-Message und wird hier eingetragen.
- **Nach Schritt 6** wird wieder gemessen. Über 89 kB wird verschlankt (Texte kürzen; im Fall „statisch“ doch lazy). Das Budget von 90 kB bleibt; mehr braucht ein ADR.
  - Ergebnis (Umsetzung, Paket C): 89,69 kB, Texte gekürzt, weiter über 89 kB. Die restliche Verschlankung ist Pflicht von **Paket 0 aus Plan 0010** (E8 „Paket 0: Verschlankung des Startbundles“, Reihenfolge Plan 0009 → Paket 0). Plan 0010 liegt noch nicht auf `main`, sondern auf Branch `anbieter-0010` (`docs/plans/0010-anbieteruebersicht.md`).
- **Typen getrennt** (M3): `TransitTableFile` und `TransitTable` liegen in `src/domain/transit-types.ts` (wie `src/ui/map-types.ts`). Dieses Modul darf jeder statisch importieren. So braucht `transit-only-lazy` keine Ausnahme für Typ-Importe.
- **Regeln, nur im Fall „lazy“**, je mit Kanarienvogel (ADR 0004):
  - `transit-only-lazy` (dependency-cruiser): `from: { path: "^src/", pathNot: "\\.test\\.ts$" }` → `to: { path: "^src/domain/transit\\.ts$", dependencyTypesNot: ["dynamic-import"] }` verboten, auch für reine Typ-Importe.
  - `transit-entry-only`: `to: { path: "^src/domain/transit\\.ts$" }` nur von `^src/ui/use-transit\\.ts$`.
  - `scripts/check-architecture.ts`, `LAZY_LOADERS`: `["src/ui/use-transit.ts", "../domain/transit.ts"]`. Das Ziel steht **mit Endung**, damit die Regex nicht auch `../domain/transit-types.ts` trifft.
- **Immer:** `transit-build-pure`: `scripts/transit/` importiert kein `node:*`, kein `scripts/pipeline/io`, kein `scripts/lib`; dazu Biome `noRestrictedGlobals` für `fetch`. Umsetzung: die Pfade von `pipeline-lib-pure`/`pipeline-lib-no-node-io` und der Biome-Override erweitern.
- **Coverage:** `vitest.config.ts` nimmt `scripts/transit/**/*.ts` in `coverage.include` auf (≥ 90 %, wie `scripts/pipeline/lib`). `src/domain/transit.ts` zählt ohnehin.

### E11 – Laden, Platzhalter und Rückfall auf die Luftlinie

`useTransit` liefert neben `reachFn` einen Modus, den Kachel, Statuszeile, Filter und Hinweise nutzen:

```ts
type ReachMode =
  | { kind: "oepnv" }                                    // Wegzeit
  | { kind: "laedt" }                                    // Platzhalter, weder Luftlinie noch Wegzeit (M7)
  | { kind: "luftlinie"; reason: "fehler" | "ausserhalb" };
```

**Anzeige je Modus** (ohne Startpunkt wie heute: keine Entfernung):

| Modus | Kachel, Detail, Orts-Liste | Statuszeile (Zeile 2) |
|---|---|---|
| `laedt` | Platzhalter `<span class="dist" aria-hidden="true">` mit reservierter Breite (`min-width: 6ch`, leer) | der endgültige Text „Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, inkl. Warten)“ mit `visibility: hidden`: Die Höhe steht, die Live-Region sagt nichts an |
| `oepnv` | „25 Min.“ / „ca. 25 Min. mit Bus & Bahn ab Gostenhof“ / „ca. 10 Min. zu Fuß …“ | derselbe Text, sichtbar (eine Ansage) |
| `luftlinie`, `fehler` | „1,4 km“ / „ca. 1,4 km Luftlinie ab Gostenhof“ | „Entfernung als Luftlinie ab Gostenhof – Wegzeiten gerade nicht verfügbar.“ |
| `luftlinie`, `ausserhalb` (m16) | wie oben | „Entfernung als Luftlinie ab deinem Standort – außerhalb des Stadtgebiets.“ |

- `ausserhalb` heißt: kein Stadtgebiets-Halt im Umkreis von 800 m. Im Stadtgebiet kommt das nicht vor, weil der weiteste nächste Halt eines Stadtteils 358 m entfernt liegt. Der Text nennt deshalb die Ursache, die praktisch immer stimmt.
- Je Startpunkt ist alles **eine** Art. Es gibt keine Liste, in der „25 Min.“ und „1,4 km“ gemischt stehen.
- **Kein Flackern bei gespeichertem Stadtteil** (M7): Nach dem Neuladen steht `laedt`, die Kacheln zeigen den Platzhalter statt erst „1,4 km“ und dann „25 Min.“.
  - Ist zusätzlich `wegzeit=` gesetzt, zeigt die Liste in `laedt` statt der ungefilterten Angebote einen Platzhalter-Block (`.list-pending`, `min-height` wie zwei Tagesgruppen, Text „Wegzeiten werden geladen …“). Danach erscheint die gefilterte Liste, ohne dass Kacheln springen.
  - Ohne `wegzeit=` steht die Liste sofort, nur die `.dist`-Platzhalter füllen sich.
  - Die Orts-Liste der Karte sortiert in `laedt` nach Namen und danach nach Wegzeit. Sie liegt unter der Karte und meist außerhalb des Sichtbereichs; der Browser-Review prüft das.
  - Der Kalender zeigt mit `wegzeit=` denselben Platzhalter-Block (Arch-Review, Befund 4). Bewusste Lücke: Die Karte (Marker und Orts-Liste) zeigt in `laedt` mit `wegzeit=` alle Orte, höchstens bis zum Zeitlimit von 8 s, und filtert danach; die Statuszeile ist solange unsichtbar.

**Filtergruppe „Wegzeit“ je Modus** (M6). Die Chips „bis 20 / 30 / 45 Min.“ sind nur in `oepnv` bedienbar, sonst `disabled` mit Begründung darunter:

| Modus | Begründung unter den Chips | Knopf |
|---|---|---|
| kein Startpunkt | „Erst einen Startpunkt wählen.“ | „Startpunkt wählen“ (wie heute) |
| `laedt` | „Wegzeiten werden geladen …“ | – |
| `fehler` | „Wegzeiten gerade nicht verfügbar.“ | „Nochmal laden“ → `want()` |
| `ausserhalb` | „Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg.“ | „Startpunkt wählen“ |

„Egal“ bleibt immer bedienbar, so lässt sich eine gesetzte Grenze jederzeit entfernen.

**Hinweis unter der Statuszeile**, wenn `wegzeit=` gesetzt ist, aber nicht wirkt (außerhalb der Status-Region, wie der heutige Umkreis-Hinweis):
- kein Startpunkt: „„bis 30 Min.“ braucht einen Startpunkt.“ + „Startpunkt wählen“;
- `laedt`: kein Hinweis (Platzhalter-Block);
- `fehler`: „„bis 30 Min.“ wirkt gerade nicht: Wegzeiten nicht geladen.“ + „Nochmal laden“;
- `ausserhalb`: „„bis 30 Min.“ wirkt nicht: Startpunkt außerhalb des Stadtgebiets.“ + „Startpunkt wählen“.

**Fehlschlag des Lazy-Imports** (M8, nur im Fall „lazy“, E10): Manche Browser merken sich einen gescheiterten Modul-Import. Deshalb läuft der Import über `useLazy` (`src/ui/Lazy.tsx`, Stand nach Plan 0008), und `fehler` zeigt das Muster von `LoadFailed`: Beim ersten Fehlschlag „Nochmal laden“, beim zweiten Fehlschlag des Chunks „Seite neu laden“ (`location.reload()`, die URL behält den Filter). Im Fall „statisch“ entfällt das, dann kann nur der `fetch` scheitern.

### E12 – Schema und Datenvertrag

- **`Venue.nearestStops` wird gestrichen** (ADR 0003, ADR 0005). Die nächsten Halte sind ein abgeleiteter Wert („berechnet, nie gespeichert“, `docs/architecture.md`), und Variante (b) braucht sie nicht. Kein Ort nutzt das Feld, die Streichung bricht also nichts. `pnpm schema:export` aktualisiert `schema/providers.schema.json`.
- **Neu `Timetable`** in `src/domain/schema.ts`: Der Fahrplanauszug ist eine Datei in `data/`, also Teil des Datenvertrags.
  - Prüfungen per `refine`:
    - `trips[].stops`, `times` (2 je Halt) und `flags` haben passende Längen;
    - Stop-Indizes sind gültig;
    - Zeiten sind nicht fallend;
    - alle Steige liegen in `NUERNBERG_BBOX`;
    - `validFrom ≤ serviceDay ≤ validTo`;
    - `serviceDay` ist ein Dienstag.
  - Kein JSON-Schema-Export nach `schema/`: Kein Agent schreibt die Datei, sie entsteht nur aus Code (Unterschied zu Katalog und Rohformat). `schema.ts` bleibt die einzige Quelle.
- `validateDataset` bleibt unverändert. `loadDataset` (bzw. ein neues `loadTimetable` in `scripts/lib/load-data.ts`) liest und prüft `oepnv/fahrplan.json`. `validate-data` (Teil von `check:fast`) prüft damit auch den Auszug.
- `TransitTableFile` (E7) ist ein Build-Artefakt wie `SiteData`: Typ in `src/domain/transit-types.ts`, kein Zod. Er entsteht nur durch `scripts/transit/table.ts` und wird im Round-Trip-Test geprüft.

### E13 – Aktualität und Fahrplanwechsel

- Der VGN aktualisiert „ca. vierteljährlich“, der Fahrplanwechsel ist am 13.12.2026 (Feed gültig bis 12.12.2026).
- Der **Skill** `babyevents-nuernberg` bekommt Schritt „0. Fahrplan prüfen“: `pnpm pipeline oepnv`. Ist der Feed neu, entsteht ein neuer Auszug mit neuem Stichtag, und `publish` committet ihn mit dem Datenstand.
- **Warnungen** in `validate-data` (`::warning::`, nie rot), Funktion `timetableWarnings(source, now)` in `scripts/transit/freshness.ts`:
  - `validTo` liegt in der Vergangenheit: „Fahrplanauszug abgelaufen (gültig bis …), `pnpm pipeline oepnv` ausführen.“
  - `validTo` liegt in weniger als 14 Tagen: „Fahrplanwechsel steht an (…).“
  - Für Fixtures (`fixture: true`) gibt es keine Warnung.
- Eine Warnung „Feed lange nicht geprüft“ gibt es bewusst nicht (m10): Dafür müsste jeder `304` die Datei ändern (`checkedAt`), also einen Diff je Lauf erzeugen. Der Skill prüft bei jedem Lauf (bedingter `GET`), und `validTo` deckt den Fahrplanwechsel ab.
- Rot wird es bewusst nicht: Ein Fahrplan von gestern ist für eine Schätzung „Di vormittags“ fast immer noch richtig. Ein roter Build würde dagegen jeden Daten-Deploy blockieren (ADR 0002).
- Das Kind-Sheet nennt den Stand („Fahrplan Stand 24.6.2026“), so ist ein alter Auszug sichtbar.

### E14 – ADR 0011 (neu, ersetzt Teile von ADR 0005)

ADR 0005 bleibt als Ziel gültig. Der Entwurf liegt schon in `docs/adr/0011-oepnv-wegzeit-tabelle.md` (Status: Entwurf, Schritt 2 setzt ihn auf „angenommen“). Abweichungen, die ADR 0011 „Öffi-Wegzeit: Halt→Ort-Tabelle aus VGN-GTFS mit Bus“ festhält:

1. **Bus** gehört dazu, nicht nur U/S/Tram (E2).
2. **Halt→Ort-Tabelle** statt Halt→Halt-Matrix mit `Venue.nearestStops`. `nearestStops` wird gestrichen (E5, E12).
3. **Wartezeit zählt**: Median über das Fenster statt reiner Fahrzeit ohne Umsteigewartezeit (E5).
4. **Fahrplanauszug im Repo** (`data/oepnv/fahrplan.json`, Schema `Timetable`), Abruf nur in der Pipeline (E4).
5. **Lizenz** vorsichtig als CC BY-SA 3.0 DE, Namensnennung im UI (E3).
6. **Ladezeitpunkt** der Tabelle vor der Wahl des Startpunkts (E9), neue Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“, mit der Ein-Bit-Ausnahme beim Start.
7. Neue devDependency `fflate` (E4).
8. **„Haltestelle wählen“ entfällt** als Startpunkt-Quelle (ADR 0005, Fallback ohne GPS). Stadtteil, Standort und Kartenmitte decken das ab, eine Liste mit 570 Halten wäre schlecht bedienbar. → `docs/ideas.md`.
9. **Filter in Minuten** (`wegzeit=20|30|45`) statt km (`umkreis=`, Plan 0004); `docs/architecture.md` (Privatsphäre-Invariante „In die URL darf nur der Umkreis (`umkreis=`)“) wird auf `wegzeit=` umgestellt.
10. Startpunkte mit Wegzeit nur im **Stadtgebiet Nürnberg**.

ADR 0005 bekommt den Hinweis „teilweise ersetzt durch ADR 0011“, ADR 0003 den Hinweis „`nearestStops` gestrichen (ADR 0011)“. ADR 0010 ändert sich nicht.

### E15 – Tests ohne Netz und Fixtures

- `tests/fixtures/pipeline/gtfs/` (fiktiv, von Hand, Textdateien wie im Feed, mit BOM und Anführungszeichen):
  - 8 Steige in 5 Haltbereichen, davon einer außerhalb der BBOX;
  - Linien: „T1“ (Tram, alle 10 Min.), „B2“ (Stadtbus, alle 20 Min., ein Halt mit `pickup_type = 2`), „R9“ (Rufbus, muss wegfallen), eine Fahrt über 24:00 und eine Fahrt, die die BBOX verlässt und wieder betritt;
  - `calendar` mit Dienstag-Dienst, `calendar_dates` mit Ausnahme am Stichtag (Typ 1 und 2);
  - eine Fahrt mit zwei aufeinanderfolgenden Verbindungen `dep == arr` (Halte im selben Sekundenwert, M4).
- `tests/fixtures/oepnv/fahrplan.json` (fiktiv, `Timetable`-gültig): ein Mini-Netz um die 5 Fixture-Orte (Plan 0004, Ausgangslage) und den Stadtteil Gostenhof (49,448 / 11,058).
  - Die Erwartungen stehen im Test und sind von Hand nachgerechnet, z. B. Gostenhof → Beispielhof: Fußweg zum Halt + T1 (Takt 10, Median-Wartezeit 4,5–5 Min.) + Fußweg.
  - Der E2E-Build (`dist-e2e/`) bekommt so eine echte `wegzeit.json`.
  - DHID-Präfix der Fixture-Halte `de:09564:` (fiktive Nummern); ein Halt mit Präfix `de:09563:` (Nachbarstadt) dient als Netz-, aber nicht als Zeilen-Halt.
  - Auch hier gibt es eine Fahrt mit `dep == arr` an zwei aufeinanderfolgenden Verbindungen (M4).
  - Ein Fixture-Punkt in der BBOX, aber weiter als 800 m von jedem `de:09564:`-Halt, für den Modus `ausserhalb`.
- Kein Test lädt etwas aus dem Netz (`vitest.setup.ts`). `io/gtfs.ts` wird nicht unit-getestet, sondern nur über `pnpm pipeline oepnv` beim echten Lauf (wie `io/sources.ts`).

### E16 – Arbeitsteilung

Drei Pakete. Zur selben Zeit gehört keine Datei zwei Paketen. Nur Paket C startet Playwright.

**Paket B1 „Vertrag“** (zuerst, klein, Koordinator oder Paket B), Branch `oepnv-0009`:
- `src/domain/schema.ts` (`Timetable`, `nearestStops` weg), `schema/providers.schema.json`, `tests/fixtures/oepnv/fahrplan.json`, `biome.json` (`!data/oepnv`, `!tests/fixtures/oepnv`, E4), `scripts/lib/load-data.ts` (`loadTimetable`, `TIMETABLE_REQUIRED = false`, E7), `scripts/validate-data.ts` (Prüfung + Warnungen), `scripts/transit/freshness.ts` (+Test), ADR 0011 auf „angenommen“, ADR 0003/0005 Hinweise.
- Fertig, wenn `pnpm check:fast` und `pnpm schema:check` **ohne** `data/oepnv/fahrplan.json` grün sind (nur die Warnung „Kein Fahrplanauszug“).

Danach parallel, je in eigenem Worktree, beide vom Stand nach B1:

**Paket A „Pipeline“**, Branch `oepnv-0009-a`, **kein Playwright, kein `PW_PORT`**:
- `scripts/pipeline/lib/gtfs.ts` (+Test), `scripts/pipeline/io/gtfs.ts`, `scripts/pipeline/cli.ts` (Befehl `oepnv`, Kopfkommentar), `tests/fixtures/pipeline/gtfs/**`, `package.json`/`pnpm-lock.yaml` (`fflate`), `.claude/skills/babyevents-nuernberg/SKILL.md`, `data/oepnv/fahrplan.json` (erzeugt), `README.md` (Datenquellen).

**Paket B2 „Tabelle“**, Branch `oepnv-0009-b`, **kein Playwright**:
- `scripts/transit/profile-csa.ts`, `table.ts` (+Tests, Referenz-CSA nur im Test), `src/domain/transit.ts`, `transit-types.ts` (+Test), `scripts/build-data.ts` (ohne Auszug: Warnung, keine `wegzeit.json`), `vitest.config.ts` (Coverage), `.dependency-cruiser.cjs` (`transit-build-pure`). `biome.json` gehört B1; braucht B2 den Override für `fetch` in `scripts/transit/`, legt B1 ihn gleich mit an.
- B2 braucht `data/oepnv/fahrplan.json` für den echten Build erst beim Zusammenführen. Bis dahin genügt die Fixture (`ZWERGENPLAN_DATA=fixture pnpm data:build`).

**Paket C „Domäne + UI“**, Branch `oepnv-0009-c`, vom zusammengeführten Stand A + B2, **`PW_PORT=4291`**:
- `src/domain/reach.ts`, `filter.ts`, `route.test.ts` (+Tests);
- `src/data/transit.ts` (+Test), `src/ui/use-transit.ts` (+Test), `use-offer-views.ts`, `format.ts`, `OriginPicker.tsx`, `KidSheet.tsx`, `Sheets.tsx`, `Chrome.tsx`, `App.tsx`, `OfferCard.tsx`, `DetailDialog.tsx`, `Overlays.tsx`, `karte/*`, `map-types.ts`;
- `vite.config.ts` (`assets/oepnv/`, nur im Fall „lazy“), `.size-limit.json`, `.dependency-cruiser.cjs` (`transit-only-lazy`/`transit-entry-only`, nur im Fall „lazy“), `scripts/check-architecture.ts`, `e2e/**`, `scripts/screenshots.ts`, `docs/architecture.md`, `docs/ideas.md`.

Berührungspunkt: `.dependency-cruiser.cjs` gehört zuerst B2, danach C (C startet erst nach dem Zusammenführen von B2). `docs/plans/0009-oepnv-fahrzeit.md` ändert kein Paket, Messwerte stehen in den Commit-Messages, der Koordinator überträgt sie.

## Struktur

```
data/oepnv/fahrplan.json          NEU, committet: Fahrplanauszug (Pipeline, E4)
src/domain/
  schema.ts                       + Timetable, − Venue.nearestStops
  reach.ts (+test)                Reach „oepnv“, ReachFn, airlineReach, LIMIT_MINUTES, roundedMinutes, compareReach, withinLimit
  filter.ts (+test)               FilterContext.reach, wegzeit=, activeFilterCount(…, { limitActive })
  transit.ts (+test)              walkMinutes, decodeTransitTable, transitReach (lazy oder statisch, E10)
  transit-types.ts                TransitTableFile, TransitTable (frei importierbar, M3)
src/data/
  transit.ts (+test)              loadTransitTable() – fetch data/wegzeit.json
src/ui/
  use-transit.ts (+test)          Zustand, want(), reachFn, ReachMode (oepnv/laedt/luftlinie); einziger Lader von transit.ts (useLazy)
  use-offer-views.ts (+test)      reachOf aus reachFn, FilterContext.reach
  format.ts (+test)               reachShort, reachLong, reachNote, reachLimitLabel, transitSourceNote
  OriginPicker.tsx, KidSheet.tsx  „Wegzeit ab“, Quellenhinweis, want() beim Öffnen
  Sheets.tsx, Chrome.tsx, App.tsx Gruppe „Wegzeit“, Badge, Statuszeile, Hinweise
  OfferCard.tsx, DetailDialog.tsx, Overlays.tsx, karte/PlaceSheet.tsx, karte/place-format.ts, karte/MapScreen.tsx (want() beim Öffnen)
  ListView.tsx                    Platzhalter-Block bei laedt + wegzeit= (M7)
scripts/
  build-data.ts                   + public/data/wegzeit.json
  validate-data.ts                + Timetable prüfen, Aktualitäts-Warnungen
  lib/load-data.ts                + loadTimetable, TIMETABLE_REQUIRED (bis Schritt 5 false)
  transit/ (neu, rein)            profile-csa.ts, table.ts, freshness.ts (+tests)
  pipeline/lib/gtfs.ts (+test)    CSV, Kalender, pickServiceDay, Auszug
  pipeline/io/gtfs.ts             Download mit ETag-Cache, fflate
  pipeline/cli.ts                 + Befehl oepnv
tests/fixtures/
  pipeline/gtfs/*.txt             fiktiver Mini-Feed
  oepnv/fahrplan.json             fiktiver Auszug für Fixture-Build und Tests
e2e/
  startpunkt.spec.ts              Wegzeit, Laden vor der Wahl, Rückfall, Filter
  karte.spec.ts                   Orts-Sheet und Orts-Liste mit Minuten, Kartenmitte
  mobile-ux.spec.ts, smoke.spec.ts
docs/adr/0011-oepnv-wegzeit-tabelle.md    NEU (Entwurf liegt schon vor)
biome.json                        !data/oepnv, !tests/fixtures/oepnv, fetch-Verbot in scripts/transit
```

## Tests

**Unit, test-first** (Vitest, TZ `America/Los_Angeles`, Coverage ≥ 90 % für `src/domain`, `scripts/pipeline/lib`, `scripts/transit`):

- **`pipeline/lib/gtfs`:**
  - CSV: BOM, Anführungszeichen, Komma im Feld, CRLF;
  - aktive Dienste: Wochentag, Zeitraum, `calendar_dates` 1 und 2;
  - `pickServiceDay`: überspringt Feiertag und Ferien, nimmt den ersten ab heute + 7, sonst den letzten, ohne Kandidat Fehler;
  - Auszug: Rufbus fehlt, `pickup_type 2` sperrt das Einsteigen, Fahrt über 24:00, Fahrt raus und wieder rein, Fenster 8:30–12:30, Sekunden bleiben erhalten;
  - die Ausgabe besteht `Timetable.parse`.
- **`transit/profile-csa`** (Fixture-Netz):
  - direkte Fahrt;
  - Umstieg knapp verpasst (30 s unter Puffer) → nächster Takt;
  - Sitzenbleiben ohne Puffer;
  - Fußweg-Umstieg ≤ 400 m, keiner bei 401 m;
  - Ein- und Aussteigesperren;
  - Abgang ≤ 800 m;
  - unerreichbar → 255;
  - `connectionOrder`: Gleichstand bei `dep` nach `arr`, dann `stop_sequence` absteigend; zwei Verbindungen `dep == arr` derselben Fahrt ergeben „sitzen bleiben“ (M4);
  - Median über das Fenster bei Takt 10 = Fahrzeit + ~5 Min.; Median `(x[59] + x[60]) / 2` mit `∞` in der oberen Hälfte → 255;
  - **Profil = Vorwärts-Referenz für jeden Halt und jede Minute**.
- **`transit/table`:**
  - nur `de:09564:`-Halte mit Abfahrt im Fenster werden Zeilen;
  - Spalten = `placeKey` in `site.json`-Reihenfolge;
  - Obergrenze 120 → 255;
  - Kodierung → `decodeTransitTable` Round-Trip;
  - deterministisch (zweimal gleich).
- **`transit/freshness`:** abgelaufen, < 14 Tage, Fixture ohne Warnung.
- **`lib/load-data`:** ohne Auszug und `TIMETABLE_REQUIRED = false` → Warnung, kein Fehler; mit `true` → Fehler; ungültiger Auszug → immer Fehler (B1).
- **`domain/transit`:**
  - `walkMinutes(750) = 13`;
  - `decodeTransitTable` lehnt falsche Version, falsche Längen und fehlende Orte ab;
  - `transitReach`: Minimum über Zugangshalte, direkter Fußweg gewinnt (`byFoot`), kein Halt in 800 m → `undefined`, Grenze 800 m inklusiv, 255 wird ignoriert, alles unerreichbar → `Infinity`;
  - Zeitzonen-unabhängig.
- **`domain/reach`:** `roundedMinutes` mit allen Beispielen aus E8; `compareReach` gleich, gemischt und `Infinity` gegen `Infinity` = 0 (m11); `withinLimit` an der Grenze (30,0 bei 30 → wahr, 30,01 → falsch, Luftlinie → `undefined`); `airlineReach` = bisheriges `reachTo`.
- **`domain/filter`:** `wegzeit=` parsen und kanonisch schreiben, `umkreis=5` wird ignoriert; `applyFilters` mit `reach` (oepnv), mit Luftlinie (wirkt nicht) und ohne; `activeFilterCount` mit und ohne `limitActive`.
- **`domain/route`:** Kein Startpunkt, kein Stadtteil und keine Koordinate im Querystring, auch mit `wegzeit=`.
- **`ui/format`:** „25 Min.“, „über 2 Std.“, „ca. 25 Min. mit Bus & Bahn ab Gostenhof“, „ca. 10 Min. zu Fuß ab deinem Standort“, „… ab der Kartenmitte“, Statuszeilen je `ReachMode`, „bis 30 Min.“, Quellenhinweis mit Stand.
- **`ui/use-transit`** (reiner Reducer wie `origin-state.ts`): `want()` lädt einmal; die Wahl des Startpunkts löst kein Laden aus; Fehler (fetch, Zeitlimit, Chunk) → `fehler`, erst das nächste `want()` lädt neu; zweiter Chunk-Fehlschlag → Knopf „Seite neu laden“; `ReachMode` je Lage aus E11, auch `laedt` bei gespeichertem Stadtteil.
- **`ui/format`, Filter-Texte:** Begründung und Hinweis je Modus aus E11 (kein Startpunkt, `laedt`, `fehler`, `ausserhalb`), Quellenhinweis aus `source` mit Titel, Lizenz und „abgewandelt“.
- **`ui/use-offer-views`:** `reachOf` nutzt `reachFn`; der Wegzeit-Filter wirkt auf Liste, Kalender und „Für heute ist alles vorbei“; `cameraOffers` bleibt unabhängig von Startpunkt und Tabelle (Kamera-Regel).
- **`data/transit`:** URL `data/wegzeit.json`, HTTP-Fehler wirft (mit gestubbtem `fetch`).

**E2E** (Fixtures, eingefrorene Uhr Mo 5.10.2026 12:00, `PW_PORT=4291`), `startpunkt.spec.ts`:

1. **Wegzeit ab Stadtteil:** Kind-Sheet öffnen → Request auf `data/wegzeit.json`. **Vor der Wahl** auf die Antwort von `wegzeit.json` und, im Fall „lazy“, des Chunks `assets/oepnv/*.js` warten (`page.waitForResponse`, M9). Sonst läuft der Request noch, wenn die Zählung ab dem Tipp beginnt. Dann Gostenhof wählen → ab dem Tipp **kein** Request. Die Kachel des Beispielhofs zeigt den von Hand nachgerechneten Wert aus E15 (geplant „15 Min.“, das Fixture-Netz wird darauf ausgelegt), das Detail „ca. 15 Min. mit Bus & Bahn ab Gostenhof“, die Statuszeile „Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, inkl. Warten)“.
2. **Kein Laden ohne Anlass:** Startseite ohne gespeicherten Stadtteil, ohne Kind-Sheet und ohne Karte → kein Request auf `wegzeit.json`. Mit gespeichertem Stadtteil → genau ein Request beim Start.
3. **Standort** (Berechtigung, 49,45213 / 11,07672): wie in 1 erst auf die Antworten warten, dann tippen. Minuten erscheinen, ab dem Tipp kein Request.
4. **Rückfall Daten:** `page.route("**/data/wegzeit.json", r => r.abort())` → Luftlinie, Statuszeile „… – Wegzeiten gerade nicht verfügbar.“, Chips gesperrt mit „Wegzeiten gerade nicht verfügbar.“, Hinweis mit „Nochmal laden“. Route freigeben, „Nochmal laden“ → Minuten.
   **Rückfall Chunk** (nur im Fall „lazy“, M8): `page.route("**/assets/oepnv/*.js", r => r.abort())` → derselbe Modus `fehler`; „Nochmal laden“ mit weiter blockiertem Chunk → Knopf „Seite neu laden“; Konsolenfehler per `allowedConsoleErrors` erlaubt.
5. **Außerhalb:** Standort in der BBOX, aber > 800 m von jedem `de:09564:`-Fixture-Halt → Luftlinie, Statuszeile „… – außerhalb des Stadtgebiets.“, Chips mit „Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg.“
6. **Filter:** Gostenhof + „bis 20 Min.“ blendet die erwarteten Orte aus, Badge 1. `?wegzeit=20` ohne Startpunkt → Hinweis, Badge 0. `?umkreis=5` → wirkungslos, keine Fehlermeldung.
7. **Kein Flackern** (M7): gespeicherter Stadtteil, `./?wegzeit=20`, `wegzeit.json` per `route` um 1,5 s verzögert. Während des Ladens: keine Kachel mit „km“, Platzhalter-Block sichtbar, keine Ansage in der Statuszeile. Danach die gefilterte Liste. Dazu in `perf.spec.ts` derselbe Aufbau mit gedrosseltem Netz: **CLS < 0,05** über Laden und Umschalten.

`karte.spec.ts` (`tiles: "mock"`): Orts-Liste mit Minuten, nach Wegzeit sortiert; Orts-Sheet „ca. … Min. mit Bus & Bahn …“; „Kartenmitte als Startpunkt“ ergibt Minuten; Kamera-Test 8 aus Plan 0005 unverändert grün; Öffnen der Karte lädt `wegzeit.json`.

Außerdem:
- `mobile-ux.spec.ts`: Ansichten `entdecken-wegzeit`, `kind-sheet-wegzeit` (Quellenhinweis sichtbar), `filter-sheet-wegzeit`, `detail-wegzeit`, `entdecken-wegzeit-rueckfall` (Tabelle blockiert), je hell, dunkel, dunkel per Darstellung, 320 px / 200 %. Die bisherigen `…-entfernung`-Ansichten werden umbenannt, nicht verdoppelt.
- `smoke.spec.ts` (echte Daten): Altstadt wählen → `.meta .dist` passt auf `/^(\d+ Min\.|über 2 Std\.)$/`; Gates und 320 px / 200 % bestehen.
- `scripts/screenshots.ts`: `kind`, `start-startpunkt`, `filter-wegzeit`.
- Kanarienvögel: `import "node:fs"` in `scripts/transit/table.ts` → `pnpm arch` rot. Im Fall „lazy“ zusätzlich: statischer Import und reiner Typ-Import von `src/domain/transit.ts` in `App.tsx` → rot; Typ-Import aus `transit-types.ts` → grün. Danach wieder entfernt, Beleg in der Commit-Message.

## Backpressure

Keine Schwelle wird gesenkt. Neu:

- Budgets: `Wegzeit-Daten` 64 kB (ab Paket C), im Fall „lazy“ `Wegzeit JS (lazy)` 3 kB. `JS (initial)` bleibt 90 kB, Messungen nach Schritt 5 (Entscheidungspunkt, Schwelle 88,6 kB) und 6 werden hier notiert (E10).
- dependency-cruiser: `transit-build-pure`, im Fall „lazy“ `transit-only-lazy` und `transit-entry-only` (E10), mit Kanarienvögeln.
- Fehlender Auszug: bis Schritt 5 Warnung, danach rot (`TIMETABLE_REQUIRED`, E7).
- Coverage-Gate auf `scripts/transit/**` (E10).
- `validate-data` prüft den Auszug per Zod (rot) und seine Aktualität (Warnung).
- Referenztest Profil- gegen Vorwärts-CSA (E6).
- E2E: kein Request ab der Wahl (nach abgewarteter Antwort, M9), kein Laden ohne Anlass, Rückfall für Daten und Chunk, CLS bei gespeichertem Stadtteil (E9, E11).
- **Build-Dauer:** `build-data` misst die Routing-Zeit und gibt sie aus („✓ Wegzeit: 570 Halte × 76 Orte in 4,2 s“). Über 20 s gibt es eine Warnung, kein Rot. Wird es knapp, ist der nächste Schritt ein Cache in `node_modules/.cache/zwergenplan/` über einen Hash aus Auszug und Orten.

## Schritte

1. **Plan, ADR 0011 (Entwurf), `/plan-review`**, Befunde einarbeiten. **Erledigt** (siehe „Review“ und „Nutzerentscheidungen“).
2. **Paket B1 „Vertrag“** (E16): Schema, Fixture-Auszug, `loadTimetable`, Prüfung und Warnungen, ADR 0011 angenommen, Hinweise in ADR 0003/0005, `pnpm schema:export`.
   - Fertig: `pnpm check:fast` und `pnpm schema:check` grün, **ohne** `data/oepnv/fahrplan.json` (nur Warnung), Tests für `Timetable`-`refine`, `freshness` und `TIMETABLE_REQUIRED`.
3. **Paket A „Pipeline“** (parallel zu 4): `gtfs.ts` test-first, `io/gtfs.ts`, `pipeline oepnv`, Skill-Schritt, README. Dann der echte Lauf `pnpm pipeline oepnv` und Commit von `data/oepnv/fahrplan.json`.
   - Fertig: `check:fast` grün; Lauf meldet Stichtag, Steige, Fahrten, Verbindungen (Erwartung grob 3 500 / 3 400 / 52 000) und Dateigröße; zweiter Lauf meldet „Fahrplan aktuell“ (304).
4. **Paket B2 „Tabelle“** (parallel zu 3): `profile-csa.ts` und `table.ts` test-first mit Referenz-CSA, `src/domain/transit.ts`, `build-data.ts`, Coverage, `transit-build-pure`.
   - Fertig: `check:fast` grün (ohne echten Auszug), Coverage ≥ 90 %, `ZWERGENPLAN_DATA=fixture pnpm data:build` schreibt `wegzeit.json`, `pnpm data:build` ohne Auszug warnt und schreibt keine.
5. **Zusammenführen A + B2** auf `oepnv-0009`, echter `pnpm data:build`.
   - **Eigener Haken:** `TIMETABLE_REQUIRED = true` (E7), eigener Commit; ab hier ist ein fehlender Auszug rot.
   - Fertig:
     - Laufzeit und Größe von `wegzeit.json` notiert (Erwartung ≈ 38 kB gzip);
     - Abgang 800 gegen 1 000 m verglichen, Anteil geänderter Zellen notiert (m13, Erwartung < 1 %);
     - Stichprobe plausibel (Gostenhof → Marmorsaal ≈ 18 Min., Altstadt → Boxdorfer Werkstatt ≈ 50 Min.);
     - die Ausgabe nennt alle 35 Stadtteile mit Zugangshalt.
   - Danach **Paket C**, zuerst Domäne (`reach`, `filter`) und `use-transit` test-first, dann verdrahten, `transit.ts` zunächst statisch.
   - **Entscheidungspunkt lazy/statisch** (E10): `pnpm build && pnpm size`, Schwelle 88,6 kB, Ergebnis und Entscheidung notieren.
6. **Paket C, UI:** Kachel, Detail, Statuszeile, Kind-Sheet mit Quellenhinweis (E3), Filtergruppe mit Begründungen je Modus, Hinweise, Platzhalter (E11), Karte (Orts-Liste, Orts-Sheet, `want()` beim Öffnen). Im Fall „lazy“: Chunk `assets/oepnv/`, `useLazy`, `transit-only-lazy`/`transit-entry-only`, `LAZY_LOADERS`. Nach jedem Block `check:fast` grün, danach Budget erneut messen.
7. **Paket C, E2E und Gates:** Specs aus „Tests“, `mobile-ux`, `smoke`, Screenshots.
   - Fertig: `PW_PORT=4291 pnpm check` grün inklusive WebKit (lokal ggf. ohne `iphone-15`, CLAUDE.md); Budgets eingehalten und notiert.
8. **Doku:**
   - `docs/architecture.md`: Datenfluss mit Pipeline-Schritt `oepnv` und `wegzeit.json`; Schichten-Zeile `scripts/transit/`; ggf. Lazy-Regeln um `assets/oepnv/`; Startpunkt-Invariante: `umkreis=` → `wegzeit=` (heute Zeile 59) und neue Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“ (E9);
   - `docs/ideas.md`: Nicht-Ziele;
   - Plan 0004 E9: Verweis „umgesetzt in Plan 0009“.
9. **`/arch-review`** (Pflicht: neue Module, neue Abhängigkeit, Schemaänderung, > 200 Zeilen). Befunde einarbeiten und hier anhängen.
10. **Commit und Push** der Branches, CI grün (`gh run watch`), Fast-Forward nach `main`, CI auf `main` grün, Deploy.
11. **`/browser-review live`**, jede Zeile beantworten, besonders:
    - Netzwerk-Tab: `wegzeit.json` kommt beim Öffnen von Kind-Sheet oder Karte, nach der Wahl kommt nichts, nichts geht an Dritte außer den Kacheln bei offener Karte;
    - Plausibilität von 5 Stichproben gegen die VGN-Auskunft (Di vormittags), Abweichung notieren;
    - CLS beim Laden mit gespeichertem Stadtteil und `?wegzeit=` (Platzhalter statt Flackern);
    - Orts-Liste der Karte beim Umsortieren nach dem Laden;
    - Links im Quellenhinweis ≥ 24 px;
    - Kind-Sheet mit Quellenhinweis bei 320 px / 200 %;
    - Rückfall offline.

    Ergebnis hier anhängen.

## Akzeptanzkriterien

- Mit Startpunkt (Stadtteil, Standort, Kartenmitte) zeigen Kachel, Detail, Statuszeile, Orts-Liste und Orts-Sheet die Wegzeit mit Bus & Bahn bzw. zu Fuß, gerundet nach E8. Der Wegzeit-Filter 20 / 30 / 45 Min. wirkt. Der Rückfall auf die Luftlinie ist beschriftet. Alles per E2E abgedeckt.
- Die Tabelle entsteht bei jedem Build aus dem committeten Auszug. Profil-CSA = Vorwärts-Referenz auf dem Fixture-Netz.
- Privatsphäre, durch E2E belegt:
  - kein Request ab der Wahl des Startpunkts;
  - `wegzeit.json` nur auf Anlass (E9), für alle gleich;
  - Startpunkt nie in der URL;
  - kein Drittanbieter.
- `pnpm check` grün, CI grün auf `main`. Budgets: JS initial ≤ 90 kB, `Wegzeit-Daten` ≤ 64 kB, im Fall „lazy“ `Wegzeit JS (lazy)` ≤ 3 kB. Entscheidung lazy/statisch mit Messwert notiert.
- Kein Flackern: Bei gespeichertem Stadtteil erscheint nie erst „km“ und dann „Min.“; CLS < 0,05 auch mit `?wegzeit=` und gedrosseltem Netz.
- `Venue.nearestStops` gestrichen, `Timetable` im Schema, ADR 0011 angenommen, ADR 0003/0005 mit Hinweis, `docs/architecture.md` nachgeführt.
- Namensnennung nach CC BY-SA 3.0 DE Abschnitt 4a und 4c (Rechteinhaber, Titel, URI, Hinweis „abgewandelt“, Lizenz-URI) im Kind-Sheet, im README und im Feld `source` beider Dateien.

## Risiken

- **Build-Dauer:** Die Profil-CSA läuft in jedem `data:build`, also auch in `pnpm dev` und zweimal im E2E-Job. Gemessen 6,8 s unter starker Last. Ausweg: Cache über einen Hash (Backpressure), danach Halte-Zeilen ausdünnen.
- **Genauigkeit:** Soll-Daten ohne Verspätungen und Baustellen. Der Median über ein Fenster passt nicht zu jeder Uhrzeit, und eine seltene Linie (Takt 60) wird ehrlich teuer. „ca.“, „Di vormittags“ und der Quellenhinweis sagen das. Der Browser-Review vergleicht Stichproben mit der VGN-Auskunft.
- **Lizenzwiderspruch** beim VGN (E3): Wir gehen den strengeren Weg (BY-SA). Klärt der VGN auf BY, ändert sich nur der Text.
- **Feed-Änderungen** (URL, Spalten, DHID-Schema): `pipeline oepnv` bricht laut ab, der alte Auszug bleibt gültig, CI warnt nach Ablauf.
- **Wachsende Ortszahl:** Die Datei wächst linear (≈ 0,5 kB gzip je Ort). Das Budget von 64 kB reicht bis rund 120 Orte, dann Kompression (E7).
- **Cache-Versatz** `site.json` ↔ `wegzeit.json` (beide `max-age=600`): `decodeTransitTable` prüft die Spalten, sonst Rückfall (E8, E11).
- **Startbudget** (nach Plan 0008 ca. 2,1 kB Luft): Entscheidungspunkt nach Schritt 5, Messung nach Schritt 6, Ausweg in E10.
- **Stadtgrenze:** Wer in Fürth oder Erlangen wohnt, bekommt die Luftlinie mit „außerhalb des Stadtgebiets“ (Nutzerentscheidung).
- **Ein Bit beim Start:** Mit gespeichertem Stadtteil lädt die Seite `wegzeit.json` beim Start. GitHub Pages sieht damit, dass ein Stadtteil gespeichert ist, nicht welcher (E9, ADR 0011).

## Offene Fragen an den Nutzer

Alle beantwortet, siehe „Nutzerentscheidungen (2026-10-05)“ unten. Offen bleibt nur die Klärung der Lizenz mit dem VGN (Risiken); sie ändert höchstens Texte.

## Review (2026-10-05, plan-reviewer) – Verdict: Freigabe mit Änderungen → eingearbeitet

- **B1 (Blocker) Reihenfolge fehlender Auszug** → E7: zweistufig über `TIMETABLE_REQUIRED`. Bis Schritt 5 gibt es nur eine Warnung, und `build-data` schreibt keine `wegzeit.json`. Schritt 5 schaltet mit eigenem Haken auf Rot. B1 und B2 sind ohne Auszug grün (E16, Schritte 2, 4, 5), die Budget-Zeile kommt erst mit Paket C.
- **M2 Biome** → E4: Ausnahmen `!data/oepnv` und `!tests/fixtures/oepnv` mit Begründung. Gemessen: `biome format` machte aus dem Auszug 3,3 MB mit 272 232 Zeilen. Eigener Serialisierer, eine Fahrt je Zeile. Besitzer ist Paket B1, weil B1 die Fixture zuerst anlegt.
- **M3 `transit-only-lazy`** → E10: Typen in `src/domain/transit-types.ts` (wie `map-types.ts`), die Regel verbietet auch Typ-Importe von `transit.ts`. Dazu `transit-entry-only`. `LAZY_LOADERS`-Ziel mit Endung `../domain/transit.ts`.
- **M4 CSA-Sortierung** → E6: `dep` absteigend, bei Gleichstand `arr` absteigend, dann `stop_sequence` absteigend (`connectionOrder`, eigener Test). Fixture-Netze mit `dep == arr` (E15).
- **M5 Lizenz BY-SA vollständig** → E3:
  - 4a Lizenz-URI;
  - 4b gleiche Bedingungen für die Abwandlungen;
  - 4c Rechteinhaber, Titel „VGN-Soll-Daten vom …“, VGN-URI, Hinweis „abgewandelt“, keine angedeutete Unterstützung;
  - 4d (Datenbankschutz) als Einordnung.
  - Feld `source` mit allen Angaben, Kind-Sheet-Text mit zwei Links ≥ 24 px.
  - Die Fundstelle in den VGN-Nutzungsbedingungen ist **Nr. 5 Abs. 3**, nicht „§3“ (am 2026-10-05 im Wortlaut geprüft, korrigiert). Der Lizenztext Abschnitt 4 wurde am selben Tag gelesen.
- **M6 Filter-Hinweise je Modus** → E11: eigene Begründung unter den gesperrten Chips für kein Startpunkt, `laedt`, `fehler` und `ausserhalb`, eigener Hinweistext je Modus; bei `fehler` „Nochmal laden“ (`want()`, Auslöser 4 in E9). „Egal“ bleibt bedienbar.
- **M7 kein Flackern/CLS** → E11: neuer Modus `laedt` mit Platzhaltern (`.dist` mit reservierter Breite, Statuszeile `visibility: hidden`, Platzhalter-Block der Liste bei `wegzeit=`). E2E 7 und `perf.spec.ts`: gespeicherter Stadtteil, `?wegzeit=20`, verzögerte Tabelle, CLS < 0,05.
- **M8 gescheiterter Lazy-Import** → E9/E11: `useLazy` aus `src/ui/Lazy.tsx` (Stand nach Plan 0008), Muster von `LoadFailed`: erst „Nochmal laden“, beim zweiten Chunk-Fehlschlag „Seite neu laden“. E2E 4 auch mit abgebrochenem Chunk. Im Fall „statisch“ (m15) entfällt das.
- **M9 E2E-Wettlauf** → E2E 1 und 3: vor der Wahl auf die Antworten von `wegzeit.json` und Chunk warten.
- **m10** → E4/E13: kein `checkedAt`. Die Warnung „lange nicht geprüft“ entfällt, ein `304` ändert nichts in `data/`.
- **m11** → E8: `compareReach` vergleicht statt zu subtrahieren, `Infinity` gegen `Infinity` = 0, mit Test.
- **m12** → E5: Wert je Zelle genau festgelegt: Minimum je Minute über die Steige des Bereichs und den direkten Abgang, Median `(x[59] + x[60]) / 2`, `Math.round`, > 120 oder ∞ → 255; Base64 per `Buffer`/`atob`.
- **m13** → „Routing-Messungen“: Radien der Prototypen offengelegt (Abgang 1 000 m gemessen, 800 m geplant; Vergleich in Schritt 5). Die 220 ungeklärten Zellen gelten als Fehler eines Prototyps und sind über den Referenztest ausgeschlossen. Die systematisch pessimistische Verzerrung ist benannt.
- **m14** → E9/E14 und Schritt 8:
  - Wegfall „Haltestelle wählen“ in ADR 0011;
  - `docs/architecture.md` Zeile 59 `umkreis=` → `wegzeit=`;
  - neue Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“, mit der Ein-Bit-Ausnahme beim Start;
  - **ADR 0011 als Entwurf geschrieben**: `docs/adr/0011-oepnv-wegzeit-tabelle.md`.
- **m15** → E10: Entscheidungspunkt nach Schritt 5. Mit `transit.ts` statisch und Start-JS ≤ 88,6 kB (Ausgangswert nach Plan 0008 ca. 87,9 kB) bleibt es statisch, sonst lazy.
- **m16** → E11: Modus `ausserhalb` mit „… – außerhalb des Stadtgebiets.“ statt „keine Haltestelle in der Nähe“.

## Nutzerentscheidungen (2026-10-05)

Verbindlich, eingearbeitet:

1. **Filter:** Der Umkreis in km wird durch „Wegzeit: bis 20 / 30 / 45 Min.“ ersetzt (`wegzeit=`). `umkreis=` wird nicht mehr gelesen (E8).
2. **Begriff:** „Wegzeit“ (E1).
3. **Startgebiet:** nur das Stadtgebiet Nürnberg, 570 Halte, ≈ 38 kB (E5). Außerhalb gilt die Luftlinie mit Hinweis (E11).
4. **Lizenz:** vorsichtig CC BY-SA 3.0 DE, vollständig nach Abschnitt 4 (E3).

Plan-Vorschlag gilt für die übrigen Fragen:

5. **Zeitfenster:** nur Dienstag vormittags, Abfahrt 8:30–10:30 (E5). Nachmittags → `docs/ideas.md`.
6. **Wartezeit:** Die Wartezeit am ersten Halt zählt mit (Median Tür-zu-Tür, E5).
7. **Gehtempo:** 4,5 km/h mit Umwegfaktor 1,3 (E6).

## Umsetzung (2026-10-05)

Der Koordinator überträgt hier die Messwerte und Entscheidungen der Pakete aus ihren Commit-Messages. Branches: `oepnv-0009-b1` (B1), `oepnv-0009-a` (A), `oepnv-0009-b2` (B2), `oepnv-0009-int` (Zusammenführung und Schritt 5), `oepnv-0009-c` (C). Der alte Branch `oepnv-0009` wird nicht genutzt.

**Paket A, Pipeline** (`69ba8cb` … `ae68fd0`, CI 37269139875 grün):
- **Feed:** VGN-GTFS mit 15,26 MB, Last-Modified 24.06.2026, gültig 24.06.–12.12.2026. Der Feed hat kein `feed_info`, die Gültigkeit kommt deshalb aus `calendar.txt`.
- **Auszug:**
  - Stichtag Di 13.10.2026, 3 534 Steige, 3 405 Fahrten, 52 617 Verbindungen.
  - 2 210 Fahrten mit Bedarfsverkehr weggelassen.
  - Gesperrt: 203 Halte-Ereignisse ohne Ein- und Aussteigen, 75 nur Aussteigen, 5 nur Einsteigen.
- **Größe:** 1 017 kB roh und 169 kB gzip statt der geschätzten 650/121 kB (schon der Prototyp hatte 992/160 kB). In der Git-Historie sind das ≈ 170 kB je Fahrplanwechsel.
- **Laufzeit:** 10 s. Ein zweiter Lauf meldet „HTTP 304 … Fahrplan aktuell“. Die Prüfung „aktuell“ vergleicht `Last-Modified` mit `source.modified`. `--force` baut byte-gleich neu.
- **Coverage** `lib/gtfs.ts`: 100 % Zeilen, 93 % Zweige.
- **Zuschnitt:** jede Fahrt auf die Verbindungen mit Abfahrt 8:30–12:30 (inklusiv).
- Fehler im Feed (unbekannte Fahrt, Route oder Steig, fehlende Spalte, rückwärts laufende Zeit) brechen laut ab.
- Gegenüber dem Prototyp sind es +5 Steige und +38 Verbindungen. Der Prototyp setzte die Ankunft als Abfahrt an, seine Messwerte sind deshalb nur grobe Vergleichswerte.

**Paket B2, Tabelle** (`14149b3` … `4d0acaa`, CI 37269392824 grün):
- **Format** `wegzeit.json`:
  - `version`, `source` (Namensnennung, Lizenz, Gültigkeit), `serviceDay`, `window`;
  - `places` in der Reihenfolge von `site.json`;
  - `lat`/`lon` ×1e4 als Differenzen;
  - `minutes` als Base64 (0–120, 255 = unerreichbar).
- **Referenztest:** Profil- und Vorwärts-CSA sind für jeden Steig und jede Minute gleich, auf dem Fixture-Netz und auf einem Zufallsnetz. Eingebaute Fehler (Sortierung, Tiebreak, Dominanz, Einsteigesperre) machen den Test rot.
- **Coverage** `scripts/transit` und `src/domain/transit.ts`: 100 %. Der Lesehelfer `valueAt` ersetzt tote `?? 0`.
- **`transit-build-pure`:** eine Positivliste. Kanarienvögel: `node:fs` und `scripts/lib` sind rot.
- `transitReach` liefert `TransitReach`. C hat den Typ in die Union `Reach` aufgenommen. Der direkte Fußweg zählt bis 120 Min.

**Schritt 5, Zusammenführung** (`b58e53a`, `d8cdf74`):
- **Echter Build:** „✓ Wegzeit: 556 Halte × 76 Orte in 3,4 s“, `data:build` gesamt 7,5 s, max. RSS 214 MB. `wegzeit.json` hat **62,4 kB roh / 42,0 kB gzip** (Plan ≈ 38 kB, Budget 64 kB). Es sind 556 statt 570 Halte, weil das Fenster 8:30–10:30 statt 8–13 Uhr ist.
- **Zugangshalt:** Jeder der 35 Stadtteile hat 4–14 Haltbereiche in 800 m, der weiteste nächste liegt 340 m entfernt (Eberhardshof).
  - Neu: `build-data` bricht mit echten Daten ab, wenn ein Stadtteil keinen Zugangshalt hat (`withoutAccess`, test-first, Kanarienvogel Altenfurt).
- **Abgang 800 gegen 1 000 m** (m13):
  - 2 477 von 42 256 Zellen (5,9 %) sind anders, fast nur bei Halten 800–1 000 m vom Ort (255 → Fußweg).
  - Stadtteil → Ort: 149 von 2 660 Paaren (5,6 %) ändern sich um ≥ 0,5 Min., 3 Paare um > 5 Min., höchstens 6,0 Min.
  - Die Erwartung < 1 % ist **nicht** erfüllt. Es bleibt bei 800 m (E6/E8): Die Abweichung ist klein und geht in Richtung „pessimistisch“.
- **Stichproben:**
  - Gostenhof → Marmorsaal 18,4 Min. (Erwartung ≈ 18);
  - Altstadt → Boxdorfer Werkstatt 48,4 (≈ 50);
  - Altstadt → Haus der Begegnung 41,8;
  - Buch → Haus der Begegnung 77,6 (Prototyp 72,2).
- `TIMETABLE_REQUIRED = true` als eigener Commit, Test zuerst rot.

**Paket C, Domäne und UI** (`2dc33d2` … `f9a827d`, CI 37277454216 grün):
- **Entscheidungspunkt E10:**
  - Ausgang 87,95 kB.
  - Statisch wären es 90,52 kB, über der Schwelle (88,6) und über dem Budget. Deshalb **lazy**: 89,70 kB, nach Kürzen der Fehlertexte **89,69 kB**.
  - Die Wegzeit-Texte und -Zustände kosten im Start ≈ 1,7 kB gzip.
  - Das Ziel ≤ 89,0 kB ist verfehlt. Für Plan 0010 (Branch `anbieter-0010`, `docs/plans/0010-anbieteruebersicht.md`, E8 „Paket 0: Verschlankung des Startbundles“) heißt das: Paket 0 muss X − 87,7 kB einsparen, bei X = 89,69 also ≈ **2,0 kB**. Nach dem Arch-Review liegt X bei 89,81 kB (≈ 2,1 kB, siehe unten).
- **Budgets:** `JS (initial)` 89,69/90 kB, `Wegzeit JS (lazy)` 1,01/3 kB, `Wegzeit-Daten` 42,03/64 kB, CSS 10,62/15 kB.
- **Kanarienvögel**, alle wie erwartet:
  - statischer Import und reiner Typ-Import von `transit.ts` in `App.tsx`: rot (`transit-only-lazy`, `transit-entry-only`);
  - Typ-Import aus `transit-types.ts`: grün;
  - zusätzlicher statischer Import im Lader: rot (`lazy-loader-static`).
- **Abweichungen:**
  - `useLazy` bleibt ungenutzt, weil es beim Einhängen lädt. Das Laden steckt im Reducer `use-transit` (`attempt`, `chunkFailures`), Tabelle und Chunk laden parallel.
  - `want()` beim Öffnen der Karte sitzt im `App`-Effekt auf `route.tab === "karte"` (deckt Deep-Links ab).
  - `places.ts` sortiert nach `ReachFn`.
  - Das Badge zählt die Grenze schon während „laedt“, damit nichts springt. Statuszeile und Datenstand erscheinen erst mit der Liste.
  - E2E „Kartenmitte ergibt Minuten“ verschiebt die Karte per `__zpMap.jumpTo`, weil die Startmitte der Fixture-Karte > 800 m von jedem Fixture-Halt entfernt liegt.
- **CI:** Das Zeitlimit des E2E-Jobs steigt von 20 auf 30 Min. Der erste Lauf brach nach 963 grünen Tests bei 18,8 Min. ab, main lag schon bei 17,3 Min. Die Begründung steht in `ci.yml`.
- **Lokal** (`PW_PORT=4291 pnpm check`, inkl. WebKit):
  - Unit 616/616.
  - E2E 947 grün, 1 Ausreißer `perf` unter Last, einzeln grün.
  - Smoke mit echten Daten 17/17.
  - Der neue CLS-Test (gespeicherter Stadtteil, `?wegzeit=20`, Tabelle 1,5 s verzögert) misst CLS 0.
