# Plan 0009 – Öffi-Fahrzeit statt Luftlinie

Status: Entwurf, `/plan-review` offen
Datum: 2026-10-05
Bezug: ADR 0005 (Öffi-Wegzeit, Stufe 2: hier umgesetzt, mit Abweichungen → **ADR 0011**, E14), Plan 0004 (Startpunkt, Luftlinie, Schnittstelle `Reach`, E2/E9), Plan 0005 (Karte, Kamera-Regel, Kartenmitte), ADR 0002 (Datenfluss), ADR 0003 (`nearestStops`), ADR 0006 (Pipeline), ADR 0008 (Privatsphäre der Karte), ADR 0010 (`src/data` und Domänenhilfen).

## Ziel

Ist ein Startpunkt gesetzt, zeigt die Seite statt der Luftlinie eine **geschätzte Wegzeit mit Bus & Bahn** (oder zu Fuß, wenn das schneller ist). Am Ende gilt:

- Die Kachel zeigt „… · 25 Min.“, das Detail „ca. 25 Min. mit Bus & Bahn ab Gostenhof“, die Statuszeile „Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, inkl. Warten)“. Liegt der Ort näher als jede Verbindung, heißt es „ca. 10 Min. zu Fuß ab Gostenhof“.
- Grundlage sind die **Soll-Fahrplandaten des VGN** (GTFS) für einen Referenz-Dienstag, Abfahrt 8:30–10:30. Gezählt wird der Median der Tür-zu-Tür-Zeit über dieses Fenster, **mit** Warte- und Umsteigezeit. **Bus ist dabei**, denn 22 der 76 Orte liegen weiter als 600 m von U-Bahn, S-Bahn und Tram (E2).
- Der Filter „Wegzeit: bis 20 / 30 / 45 Min.“ (`wegzeit=`) ersetzt den Umkreis in km.
- Orts-Liste und Orts-Sheet der Karte zeigen und sortieren nach derselben Wegzeit. Die Kamera-Regel (ADR 0008) bleibt unverändert.
- **Kein Drittanbieter, kein Routing-Dienst zur Laufzeit.** Der Browser lädt eine für alle gleiche Datei `data/wegzeit.json` vom eigenen Origin und rechnet lokal. Der Standort verlässt das Gerät nie.
- Die Wegzeit-Logik und die Tabelle belasten das Startbundle nicht nennenswert: eigene Lazy-Budgets, das Start-JS wächst um höchstens 1,5 kB (E10).
- Solange die Tabelle lädt, fehlt oder den Startpunkt nicht abdeckt, gilt die Luftlinie wie heute, ehrlich beschriftet.

## Nicht-Ziele

- Echtzeit, Verspätungen, Baustellen-Umleitungen (GTFS-Realtime), Tarife, Barrierefreiheit (Aufzüge), Kinderwagen-Plätze.
- Routenvorschlag oder Linienangabe („U1 bis Plärrer“). Die Seite nennt nur Minuten. Link „Route in der Karten-App öffnen“ bleibt in `docs/ideas.md`.
- **Haltestelle als Startpunkt** (ADR 0005 nennt „Haltestelle wählen“): Stadtteil, Standort und Kartenmitte reichen; eine Liste mit 570 Halten wäre schlecht bedienbar. → `docs/ideas.md`.
- Weitere Zeitfenster (nachmittags, Wochenende). Die Nachmittagsspitze (15 Uhr) ist real, verdoppelt aber die Datei. → `docs/ideas.md`, offene Frage 3.
- Sortierung der Tagesliste nach Wegzeit (Plan 0004, Nicht-Ziele).
- Startpunkte außerhalb des Nürnberger Stadtgebiets mit Öffi-Zeit (Fürth, Erlangen): offene Frage 4. Dort gilt die Luftlinie.
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
| Lizenz | Download-Seite: **CC BY 3.0 DE**, Namensnennung „VGN – Verkehrsverbund Großraum Nürnberg GmbH“. Nutzungsbedingungen §3 (https://www.vgn.de/web-entwickler/open-data/nutzungsbedingungen/): **CC BY-SA 3.0 DE**. Widerspruch, siehe E3. | CC BY 4.0 |
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

Fußweg: Luftlinie × 1,3 bei 4,5 km/h. Umstiegspuffer 1 Min. Zugang und Abgang bis 1 000 m. Bedarfsverkehre ausgeschlossen (in der Messung noch über `route_desc`, ohne `pickup_type`). Fenster in der Messung: Abfahrt 9:00–10:59 je Minute; der Plan nimmt 8:30–10:30 (E5), die Zahlen verschieben sich dadurch nur wenig.

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
  - Gleichheit Profil- gegen Vorwärts-CSA, 570 × 76: 40 223 Werte gleich (92,9 %), 1 218 ±1 Min. (Rundung des Medians), 113 ±2–3, 107 mehr. 1 157 Werte unterscheiden sich nur, weil die Vorwärts-Messung nach 2,5 h abbricht. Der Rest ist ein Modellunterschied der beiden Prototypen; der Referenztest in E6 schließt ihn aus.

### Größen

| Variante | Werte | roh | gzip |
|---|---|---|---|
| (a) Halt→Halt, nur U/S/Tram (ADR 0005) | 158² = 24 964 | 25 kB | – |
| (a) Halt→Halt mit Bus, Stadt | 570² = 324 900 | 325 kB | – |
| (a) Halt→Halt mit Bus, BBOX | 1 771² ≈ 3,1 Mio. | 3,1 MB | – |
| (b) Halt→Ort, Stadt, Minuten ≤ 120 (`Uint8`) | 570 × 76 = 43 320 | 43 kB | **38,2 kB** als JSON mit Base64 |
| (b) Halt→Ort, BBOX | 1 771 × 76 = 134 596 | 135 kB | 114,3 kB als JSON mit Base64 (85,9 kB binär) |
| (b′) nur 35 Stadtteile → Ort | 2 660 | 2,7 kB | – |
| Fahrplanauszug 8:30–12:30 (Repo, E4) | 52 579 Verbindungen | ≈ 650 kB JSON | ≈ 121 kB |

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
- **Lizenz:** Download-Seite und Nutzungsbedingungen widersprechen sich (CC BY 3.0 DE gegen CC BY-SA 3.0 DE). Wir behandeln die Daten **vorsichtig als CC BY-SA 3.0 DE**:
  - Namensnennung wörtlich wie verlangt: „VGN – Verkehrsverbund Großraum Nürnberg GmbH“, dazu Lizenz und Stand. Sie steht im Kind-Sheet (E9), im `README.md` unter „Datenquellen“ und in beiden Dateien (E4, E7) als Feld `source`.
  - Abgeleitete Dateien (`data/oepnv/fahrplan.json`, `public/data/wegzeit.json`) stehen unter derselben Lizenz und tragen das im Feld `source.license`.
  - Wir nutzen keine VGN-Marke (Logo), nur den Namen als Quelle.
- Der Abruf läuft nur in der Pipeline, nie im Browser und nie in CI.

### E4 – Pipeline-Schritt „oepnv“: Fahrplanauszug ins Repo

Neuer Befehl `pnpm pipeline oepnv [--force]`. Er läuft lokal wie alle Netzschritte (ADR 0002, ADR 0006).

1. **Laden mit Cache** (`scripts/pipeline/io/gtfs.ts`):
   - `GET` mit `If-None-Match`/`If-Modified-Since` aus dem Cache `~/.cache/zwergenplan/gtfs/` (wie `io/cache.ts`).
   - Bei `304` und unverändertem `lastModified` in `data/oepnv/fahrplan.json`: Meldung „Fahrplan aktuell (Stand …)“, Ende ohne Änderung. `--force` baut trotzdem neu, z. B. nach einer Code-Änderung am Auszug.
   - Entpacken mit `fflate` (devDependency, exakt gepinnt). `stop_times.txt` (146 MB) wird zeilenweise an die reine Logik gereicht.
2. **Referenztag** (`scripts/pipeline/lib/gtfs.ts`, rein):
   - `pickServiceDay({ validFrom, validTo, freeDays, today })`: Kandidaten sind alle Dienstage im Gültigkeitszeitraum, die weder Feiertag noch Ferientag in Bayern sind (`loadFreeDays` aus `io/holidays.ts`). Gewählt wird der erste Kandidat ab `today + 7 Tage`, sonst der letzte. Ohne Kandidat bricht der Befehl ab.
   - Begründung: Ein Schultag hat den Regelfahrplan. Die Woche Abstand meidet kurzfristige Ausnahmen in `calendar_dates`.
3. **Auszug** (rein): aktive `service_id` am Stichtag aus `calendar` und `calendar_dates` (1 = hinzu, 2 = weg); Fahrten ohne Bedarfsverkehr (E2); je Fahrt nur die Halte-Ereignisse in `NUERNBERG_BBOX`; nur Fahrten mit einem Ereignis zwischen **8:30 und 12:30** (Abfahrtsfenster 8:30–10:30 plus 120 Min. Obergrenze, E8). Eine Fahrt, die die BBOX verlässt und wieder hineinfährt, bleibt eine Fahrt: Der Abschnitt draußen wird eine Verbindung ohne Zwischenhalt.
4. **Ausgabe** `data/oepnv/fahrplan.json` (committet, ≈ 650 kB, eine Fahrt je Zeile für lesbare Diffs), geprüft mit dem Zod-Schema `Timetable` aus `src/domain/schema.ts` (E12):
   ```ts
   {
     source: { url, license: "CC BY-SA 3.0 DE", attribution: "VGN – Verkehrsverbund Großraum Nürnberg GmbH",
               lastModified: Instant, validFrom: IsoDate, validTo: IsoDate, fetchedAt: Instant },
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
**Wert** je Zelle: Median über die 120 Abfahrtsminuten 8:30–10:29 der Tür-zu-Tür-Zeit, wenn man in dieser Minute am Halt steht, bis zur Ankunft am Ort. Enthalten sind Warten am ersten Halt, Fahrt, Umsteigen mit Puffer und der Fußweg zum Ort. Gespeichert als ganze Minuten `0…120`; mehr als 120 oder unerreichbar ergibt `255`.

### E6 – Routing in TypeScript: eigene Profil-CSA

- **Eigener Algorithmus** statt Bibliothek: Die Kandidaten sind GPL-3.0 und können keine Profile über ein Zeitfenster, oder sie routen gar nicht (Tabelle oben). Der Kern ist klein (geschätzt ≤ 200 Zeilen) und vollständig testbar.
- **Profil-CSA** (Connection Scan, Dibbelt/Pajor/Strasser/Wagner, „Connection Scan Algorithm“, 2018), all-to-one, **ein Lauf je Ort**. Die Verbindungen werden absteigend nach Abfahrt gescannt. Je Steig entsteht ein Profil (Abfahrt → früheste Ankunft am Ort). Gemessen: 6,8 s für 570 × 76 unter Last; Ziel im Build ≤ 10 s auf dem CI-Runner (E10, Risiken).
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
/** Build-Artefakt wie site.json: Typ in src/domain/transit.ts, kein Zod im Client. */
interface TransitTableFile {
  version: 1;
  source: { attribution: string; license: string; validFrom: string; validTo: string };
  serviceDay: string;                 // „2026-10-13“
  window: { from: string; to: string };
  places: string[];                   // placeKey je Spalte
  lat: number[]; lon: number[];       // Zeilen: Grad × 1e4, ab dem zweiten Wert als Differenz
  minutes: string;                    // Base64, Uint8Array(rows × places), zeilenweise, 255 = keine Angabe
}
```

- Gemessen 38,2 kB gzip für 570 × 76. Die Datei wächst linear mit der Zahl der Orte.
- **Budget** in `.size-limit.json`: `Wegzeit-Daten` `dist/data/wegzeit.json` **64 kB** gzip. Bei rund 120 Orten wird es eng; dann folgt erst Kompression (Halte räumlich sortieren und zeilenweise Differenzen, gemessen −10 %), danach eine neue Entscheidung.
- Fehlt `oepnv/fahrplan.json` im Datenverzeichnis, ist der Build **rot**. Die Datei ist committet, ihr Fehlen wäre ein Fehler. Ein abgelaufener Auszug gibt nur eine Warnung (E13).
- Der Fixture-Build nutzt `tests/fixtures/oepnv/fahrplan.json` (fiktives Mini-Netz, E15), derselbe Pfad relativ zum Datenverzeichnis (`loadDataset`).

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
- **`compareReach`**: gleiche Art nach Wert. Bei verschiedener Art steht `oepnv` vor `luftlinie`. Das kommt praktisch nicht vor (E11: je Startpunkt ist alles eine Art), macht die Ordnung aber total.
- **`withinLimit`**: `oepnv` vergleicht die **ungerundeten** Minuten (`≤ value`). Bei `luftlinie` gilt die Minuten-Grenze nicht (`undefined`), der Filter wirkt dann nicht (E11).
- **Filter** (`filter.ts`):
  - `FilterContext.origin` wird zu `FilterContext.reach?: ReachFn`. `matchesFilter(offer, state, reach?)`.
  - URL `wegzeit=20|30|45`, kanonisch nach `kosten`, andere Werte werden verworfen.
  - `umkreis=` wird nicht mehr gelesen. Alte Links zeigen dann alle Angebote. Die App ist privat und der Parameter zwei Tage alt; eine Übersetzung km → Min. wäre geraten.
  - `activeFilterCount(filter, { limitActive })` zählt die Grenze nur, wenn sie wirkt.
  - `withReachLimit` bleibt.
- **Warum 20 / 30 / 45:** Bei 15 Min. hätten 3 Stadtteile keinen einzigen Ort und der Median läge bei 2 Orten. 20 / 30 / 45 ergeben im Median 8 / 29 / 64 von 76 Orten je Stadtteil, eine brauchbare Staffel (Messung oben).
- `RADII_KM`, `ReachLimit` in km und `roundedDistance` für den Filter entfallen. `roundedDistance` bleibt für die Anzeige der Luftlinie.

`src/domain/transit.ts` (**nur lazy**, E10):

```ts
export function walkMinutes(meters: number): number;                 // meters × 1,3 / 75
export function decodeTransitTable(file: TransitTableFile, placeKeys: ReadonlySet<string>): TransitTable | undefined;
export function transitReach(table: TransitTable, origin: Origin): ReachFn | undefined;
export const ACCESS_METERS = 800;
```

- `decodeTransitTable` prüft `version`, die Längen (`lat.length === lon.length`, `minutes` = Zeilen × Spalten) und dass **jeder** Ort aus `site.json` eine Spalte hat. Sonst liefert es `undefined`, z. B. wenn der HTTP-Cache eine alte `wegzeit.json` zur neuen `site.json` liefert.
- `transitReach`:
  - Zugangshalte: alle Zeilen im Umkreis von `ACCESS_METERS` (Luftlinie). Gibt es keine, ist das Ergebnis `undefined` (E11, „keine Haltestelle in der Nähe“).
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
    3. die Karte geöffnet wird (dort gibt es „Kartenmitte als Startpunkt“).
  - Die **Wahl** eines Startpunkts löst nie einen Request aus. So bleibt die Invariante „ab der Wahl des Startpunkts entsteht kein Request“ (E2E) wörtlich wahr.
  - Parallel lädt `import("../domain/transit.ts")`, der Lazy-Chunk mit der Rechenlogik.
  - Ein Fehlschlag (offline, 404) setzt den Zustand `fehler`. Erneut versucht wird erst beim nächsten Auslöser 2 oder 3, nie als Reaktion auf eine Wahl.
  - Geladen wird höchstens einmal je Sitzung (Zustand `bereit` bleibt).
- Ohne Startpunkt-Oberfläche und ohne gespeicherten Stadtteil lädt die Seite die Tabelle nicht (E2E).

### E10 – Startbundle, Lazy-Chunk, Budgets und Regeln

- **Lazy:** `src/domain/transit.ts` samt Dekodierung landet im Chunk `dist/assets/oepnv/` (Vite `chunkFileNames`, wie `karte/`). Neues Budget `Wegzeit JS (lazy)` `dist/assets/oepnv/*.js` **3 kB**.
- **Im Startbundle** bleiben `reach.ts` (Zweig `oepnv`, `roundedMinutes`), Texte in `format.ts`, `use-transit.ts`, `src/data/transit.ts` und der Filter.
  - Schätzung: +1,0–1,5 kB gzip, abzüglich der entfallenden km-Teile (~0,2 kB).
  - **Gemessen wird nach Schritt 5** (Domäne + Hook verdrahtet) und nach Schritt 6 (UI). Das Ergebnis kommt hierher.
  - Liegt das Start-JS dann über 89 kB, wird verschlankt: Texte kürzen, `use-transit` in den Lazy-Chunk ziehen. Das Budget von 90 kB bleibt; mehr braucht ein ADR.
- **Neue Regeln** in dependency-cruiser, je mit Kanarienvogel (ADR 0004):
  - `transit-only-lazy`: `src/domain/transit.ts` wird aus `src/` nur per `import()` erreicht und nur aus `src/ui/use-transit.ts` (Tests ausgenommen). Statischer Import → rot. `scripts/check-architecture.ts` (`lazy-loader-static`) bekommt den Lader dazu.
  - `transit-build-pure`: `scripts/transit/` importiert kein `node:*`, kein `scripts/pipeline/io`, kein `scripts/lib`; dazu Biome `noRestrictedGlobals` für `fetch`. Umsetzung: die Pfade von `pipeline-lib-pure`/`pipeline-lib-no-node-io` erweitern.
- **Coverage:** `vitest.config.ts` nimmt `scripts/transit/**/*.ts` in `coverage.include` auf (≥ 90 %, wie `scripts/pipeline/lib`). `src/domain/transit.ts` zählt ohnehin.

### E11 – Rückfall auf die Luftlinie

`useTransit` liefert neben `reachFn` einen Modus, den Statuszeile, Filter und Hinweise nutzen:

```ts
type ReachMode =
  | { kind: "oepnv" }
  | { kind: "luftlinie"; reason: "laedt" | "fehler" | "keine-haltestelle" };
```

| Lage | Anzeige | Wegzeit-Filter |
|---|---|---|
| Tabelle lädt | Luftlinie wie heute, Statuszeile „Entfernung als Luftlinie ab …“, ohne „lädt“ (keine doppelte Ansage in der Live-Region) | wirkt nicht, Hinweis wie ohne Startpunkt |
| Laden fehlgeschlagen oder Tabelle passt nicht zu `site.json` | Luftlinie, Statuszeile „… – Fahrzeiten gerade nicht verfügbar.“ | wirkt nicht, Hinweis „„bis 30 Min.“ wirkt gerade nicht: keine Fahrzeiten.“ |
| Startpunkt ohne Halt in 800 m (z. B. Standort in Fürth) | Luftlinie, Statuszeile „… – keine Haltestelle in der Nähe des Startpunkts.“ | wirkt nicht, gleicher Hinweis |
| bereit | Wegzeit | wirkt |

- Je Startpunkt ist alles **eine** Art. Es gibt keine Liste, in der „25 Min.“ und „1,4 km“ gemischt stehen.
- Die Kachel ändert beim Wechsel „1,4 km“ → „25 Min.“ ihre Länge kaum. Der Browser-Review prüft trotzdem CLS beim Umschalten.

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
- `TransitTableFile` (E7) ist ein Build-Artefakt wie `SiteData`: Typ in `src/domain/transit.ts`, kein Zod. Er entsteht nur durch `scripts/transit/table.ts` und wird im Round-Trip-Test geprüft.

### E13 – Aktualität und Fahrplanwechsel

- Der VGN aktualisiert „ca. vierteljährlich“, der Fahrplanwechsel ist am 13.12.2026 (Feed gültig bis 12.12.2026).
- Der **Skill** `babyevents-nuernberg` bekommt Schritt „0. Fahrplan prüfen“: `pnpm pipeline oepnv`. Ist der Feed neu, entsteht ein neuer Auszug mit neuem Stichtag, und `publish` committet ihn mit dem Datenstand.
- **Warnungen** in `validate-data` (`::warning::`, nie rot), Funktion `timetableWarnings(source, now)` in `scripts/transit/freshness.ts`:
  - `validTo` liegt in der Vergangenheit: „Fahrplanauszug abgelaufen (gültig bis …), `pnpm pipeline oepnv` ausführen.“
  - `validTo` liegt in weniger als 14 Tagen: „Fahrplanwechsel steht an (…).“
  - `fetchedAt` ist älter als 100 Tage: „VGN-Feed seit über 100 Tagen nicht geprüft.“
  - Für Fixtures (`fixture: true`) gibt es keine Warnung.
- Rot wird es bewusst nicht: Ein Fahrplan von gestern ist für eine Schätzung „Di vormittags“ fast immer noch richtig. Ein roter Build würde dagegen jeden Daten-Deploy blockieren (ADR 0002).
- Das Kind-Sheet nennt den Stand („Fahrplan Stand 24.6.2026“), so ist ein alter Auszug sichtbar.

### E14 – ADR 0011 (neu, ersetzt Teile von ADR 0005)

ADR 0005 bleibt als Ziel gültig. Abweichungen, die ADR 0011 „Öffi-Wegzeit: Halt→Ort-Tabelle aus VGN-GTFS mit Bus“ festhält:

1. **Bus** gehört dazu, nicht nur U/S/Tram (E2).
2. **Halt→Ort-Tabelle** statt Halt→Halt-Matrix mit `Venue.nearestStops`. `nearestStops` wird gestrichen (E5, E12).
3. **Wartezeit zählt**: Median über das Fenster statt reiner Fahrzeit ohne Umsteigewartezeit (E5).
4. **Fahrplanauszug im Repo** (`data/oepnv/fahrplan.json`, Schema `Timetable`), Abruf nur in der Pipeline (E4).
5. **Lizenz** vorsichtig als CC BY-SA 3.0 DE, Namensnennung im UI (E3).
6. **Ladezeitpunkt** der Tabelle vor der Wahl des Startpunkts (E9). Die Invariante in `docs/architecture.md` bekommt diesen Satz.
7. Neue devDependency `fflate` (E4).

ADR 0005 bekommt den Hinweis „teilweise ersetzt durch ADR 0011“, ADR 0003 den Hinweis „`nearestStops` gestrichen (ADR 0011)“. ADR 0010 ändert sich nicht.

### E15 – Tests ohne Netz und Fixtures

- `tests/fixtures/pipeline/gtfs/` (fiktiv, von Hand, Textdateien wie im Feed, mit BOM und Anführungszeichen):
  - 8 Steige in 5 Haltbereichen, davon einer außerhalb der BBOX;
  - Linien: „T1“ (Tram, alle 10 Min.), „B2“ (Stadtbus, alle 20 Min., ein Halt mit `pickup_type = 2`), „R9“ (Rufbus, muss wegfallen), eine Fahrt über 24:00 und eine Fahrt, die die BBOX verlässt und wieder betritt;
  - `calendar` mit Dienstag-Dienst, `calendar_dates` mit Ausnahme am Stichtag (Typ 1 und 2).
- `tests/fixtures/oepnv/fahrplan.json` (fiktiv, `Timetable`-gültig): ein Mini-Netz um die 5 Fixture-Orte (Plan 0004, Ausgangslage) und den Stadtteil Gostenhof (49,448 / 11,058).
  - Die Erwartungen stehen im Test und sind von Hand nachgerechnet, z. B. Gostenhof → Beispielhof: Fußweg zum Halt + T1 (Takt 10, Median-Wartezeit 4,5–5 Min.) + Fußweg.
  - Der E2E-Build (`dist-e2e/`) bekommt so eine echte `wegzeit.json`.
  - DHID-Präfix der Fixture-Halte `de:09564:` (fiktive Nummern).
- Kein Test lädt etwas aus dem Netz (`vitest.setup.ts`). `io/gtfs.ts` wird nicht unit-getestet, sondern nur über `pnpm pipeline oepnv` beim echten Lauf (wie `io/sources.ts`).

### E16 – Arbeitsteilung

Drei Pakete. Zur selben Zeit gehört keine Datei zwei Paketen. Nur Paket C startet Playwright.

**Paket B1 „Vertrag“** (zuerst, klein, Koordinator oder Paket B), Branch `oepnv-0009`:
- `src/domain/schema.ts` (`Timetable`, `nearestStops` weg), `schema/providers.schema.json`, `tests/fixtures/oepnv/fahrplan.json`, `scripts/lib/load-data.ts` (`loadTimetable`), `scripts/validate-data.ts` (Prüfung + Warnungen), `scripts/transit/freshness.ts` (+Test), ADR 0011 (Entwurf aus Schritt 1 auf „angenommen“), ADR 0003/0005 Hinweise.
- Fertig, wenn `pnpm check:fast` und `pnpm schema:check` grün sind.

Danach parallel, je in eigenem Worktree, beide vom Stand nach B1:

**Paket A „Pipeline“**, Branch `oepnv-0009-a`, **kein Playwright, kein `PW_PORT`**:
- `scripts/pipeline/lib/gtfs.ts` (+Test), `scripts/pipeline/io/gtfs.ts`, `scripts/pipeline/cli.ts` (Befehl `oepnv`, Kopfkommentar), `tests/fixtures/pipeline/gtfs/**`, `package.json`/`pnpm-lock.yaml` (`fflate`), `.claude/skills/babyevents-nuernberg/SKILL.md`, `data/oepnv/fahrplan.json` (erzeugt), `README.md` (Datenquellen).

**Paket B2 „Tabelle“**, Branch `oepnv-0009-b`, **kein Playwright**:
- `scripts/transit/profile-csa.ts`, `table.ts` (+Tests, Referenz-CSA nur im Test), `src/domain/transit.ts` (+Test), `scripts/build-data.ts`, `vitest.config.ts` (Coverage), `.dependency-cruiser.cjs` (`transit-build-pure`), `biome.json` (falls nötig).
- B2 braucht `data/oepnv/fahrplan.json` für den echten Build erst beim Zusammenführen. Bis dahin genügt die Fixture (`ZWERGENPLAN_DATA=fixture pnpm data:build`).

**Paket C „Domäne + UI“**, Branch `oepnv-0009-c`, vom zusammengeführten Stand A + B2, **`PW_PORT=4291`**:
- `src/domain/reach.ts`, `filter.ts`, `route.test.ts` (+Tests);
- `src/data/transit.ts` (+Test), `src/ui/use-transit.ts` (+Test), `use-offer-views.ts`, `format.ts`, `OriginPicker.tsx`, `KidSheet.tsx`, `Sheets.tsx`, `Chrome.tsx`, `App.tsx`, `OfferCard.tsx`, `DetailDialog.tsx`, `Overlays.tsx`, `karte/*`, `map-types.ts`;
- `vite.config.ts` (`assets/oepnv/`), `.size-limit.json`, `.dependency-cruiser.cjs` (`transit-only-lazy`), `scripts/check-architecture.ts`, `e2e/**`, `scripts/screenshots.ts`, `docs/architecture.md`, `docs/ideas.md`.

Berührungspunkt: `.dependency-cruiser.cjs` gehört zuerst B2, danach C (C startet erst nach dem Zusammenführen von B2). `docs/plans/0009-oepnv-fahrzeit.md` ändert kein Paket, Messwerte stehen in den Commit-Messages, der Koordinator überträgt sie.

## Struktur

```
data/oepnv/fahrplan.json          NEU, committet: Fahrplanauszug (Pipeline, E4)
src/domain/
  schema.ts                       + Timetable, − Venue.nearestStops
  reach.ts (+test)                Reach „oepnv“, ReachFn, airlineReach, LIMIT_MINUTES, roundedMinutes, compareReach, withinLimit
  filter.ts (+test)               FilterContext.reach, wegzeit=, activeFilterCount(…, { limitActive })
  transit.ts (+test)              NUR LAZY: TransitTableFile, walkMinutes, decodeTransitTable, transitReach
src/data/
  transit.ts (+test)              loadTransitTable() – fetch data/wegzeit.json
src/ui/
  use-transit.ts (+test)          Zustand aus/laedt/bereit/fehler, want(), reachFn, ReachMode; einziger Lader von transit.ts
  use-offer-views.ts (+test)      reachOf aus reachFn, FilterContext.reach
  format.ts (+test)               reachShort, reachLong, reachNote, reachLimitLabel, transitSourceNote
  OriginPicker.tsx, KidSheet.tsx  „Wegzeit ab“, Quellenhinweis, want() beim Öffnen
  Sheets.tsx, Chrome.tsx, App.tsx Gruppe „Wegzeit“, Badge, Statuszeile, Hinweise
  OfferCard.tsx, DetailDialog.tsx, Overlays.tsx, karte/PlaceSheet.tsx, karte/place-format.ts, karte/MapScreen.tsx (want() beim Öffnen)
scripts/
  build-data.ts                   + public/data/wegzeit.json
  validate-data.ts                + Timetable prüfen, Aktualitäts-Warnungen
  lib/load-data.ts                + loadTimetable
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
docs/adr/0011-oepnv-halt-ort-tabelle.md   NEU
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
  - Median über das Fenster bei Takt 10 = Fahrzeit + ~5 Min.;
  - **Profil = Vorwärts-Referenz für jeden Halt und jede Minute**.
- **`transit/table`:**
  - nur `de:09564:`-Halte mit Abfahrt im Fenster werden Zeilen;
  - Spalten = `placeKey` in `site.json`-Reihenfolge;
  - Obergrenze 120 → 255;
  - Kodierung → `decodeTransitTable` Round-Trip;
  - deterministisch (zweimal gleich).
- **`transit/freshness`:** abgelaufen, < 14 Tage, `fetchedAt` > 100 Tage, Fixture ohne Warnung.
- **`domain/transit`:**
  - `walkMinutes(750) = 13`;
  - `decodeTransitTable` lehnt falsche Version, falsche Längen und fehlende Orte ab;
  - `transitReach`: Minimum über Zugangshalte, direkter Fußweg gewinnt (`byFoot`), kein Halt in 800 m → `undefined`, Grenze 800 m inklusiv, 255 wird ignoriert, alles unerreichbar → `Infinity`;
  - Zeitzonen-unabhängig.
- **`domain/reach`:** `roundedMinutes` mit allen Beispielen aus E8; `compareReach` gleich und gemischt; `withinLimit` an der Grenze (30,0 bei 30 → wahr, 30,01 → falsch, Luftlinie → `undefined`); `airlineReach` = bisheriges `reachTo`.
- **`domain/filter`:** `wegzeit=` parsen und kanonisch schreiben, `umkreis=5` wird ignoriert; `applyFilters` mit `reach` (oepnv), mit Luftlinie (wirkt nicht) und ohne; `activeFilterCount` mit und ohne `limitActive`.
- **`domain/route`:** Kein Startpunkt, kein Stadtteil und keine Koordinate im Querystring, auch mit `wegzeit=`.
- **`ui/format`:** „25 Min.“, „über 2 Std.“, „ca. 25 Min. mit Bus & Bahn ab Gostenhof“, „ca. 10 Min. zu Fuß ab deinem Standort“, „… ab der Kartenmitte“, Statuszeilen je `ReachMode`, „bis 30 Min.“, Quellenhinweis mit Stand.
- **`ui/use-transit`** (reiner Reducer wie `origin-state.ts`): `want()` lädt einmal; die Wahl des Startpunkts löst kein Laden aus; Fehler → `fehler`, erst das nächste `want()` lädt neu; `ReachMode` je Lage aus E11.
- **`ui/use-offer-views`:** `reachOf` nutzt `reachFn`; der Wegzeit-Filter wirkt auf Liste, Kalender und „Für heute ist alles vorbei“; `cameraOffers` bleibt unabhängig von Startpunkt und Tabelle (Kamera-Regel).
- **`data/transit`:** URL `data/wegzeit.json`, HTTP-Fehler wirft (mit gestubbtem `fetch`).

**E2E** (Fixtures, eingefrorene Uhr Mo 5.10.2026 12:00, `PW_PORT=4291`), `startpunkt.spec.ts`:

1. **Wegzeit ab Stadtteil:** Kind-Sheet öffnen → Request auf `data/wegzeit.json`. Gostenhof wählen → ab dem Tipp **kein** Request. Die Kachel des Beispielhofs zeigt den von Hand nachgerechneten Wert aus E15 (geplant „15 Min.“, das Fixture-Netz wird darauf ausgelegt), das Detail „ca. 15 Min. mit Bus & Bahn ab Gostenhof“, die Statuszeile „Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, inkl. Warten)“.
2. **Kein Laden ohne Anlass:** Startseite ohne gespeicherten Stadtteil, ohne Kind-Sheet und ohne Karte → kein Request auf `wegzeit.json`. Mit gespeichertem Stadtteil → genau ein Request beim Start.
3. **Standort** (Berechtigung, 49,45213 / 11,07672): Minuten erscheinen, ab dem Tipp kein Request.
4. **Rückfall:** `page.route("**/data/wegzeit.json", r => r.abort())` → Luftlinie, Statuszeile „… – Fahrzeiten gerade nicht verfügbar.“, Wegzeit-Filter wirkt nicht und zeigt den Hinweis. Kind-Sheet erneut öffnen mit funktionierender Route → Minuten.
5. **Keine Haltestelle:** Standort in der BBOX, aber > 800 m von jedem Fixture-Halt → Luftlinie mit Hinweis.
6. **Filter:** Gostenhof + „bis 20 Min.“ blendet die erwarteten Orte aus, Badge 1. `?wegzeit=20` ohne Startpunkt → Hinweis, Badge 0. `?umkreis=5` → wirkungslos, keine Fehlermeldung.

`karte.spec.ts` (`tiles: "mock"`): Orts-Liste mit Minuten, nach Wegzeit sortiert; Orts-Sheet „ca. … Min. mit Bus & Bahn …“; „Kartenmitte als Startpunkt“ ergibt Minuten; Kamera-Test 8 aus Plan 0005 unverändert grün; Öffnen der Karte lädt `wegzeit.json`.

Außerdem:
- `mobile-ux.spec.ts`: Ansichten `entdecken-wegzeit`, `kind-sheet-wegzeit` (Quellenhinweis sichtbar), `filter-sheet-wegzeit`, `detail-wegzeit`, `entdecken-wegzeit-rueckfall` (Tabelle blockiert), je hell, dunkel, dunkel per Darstellung, 320 px / 200 %. Die bisherigen `…-entfernung`-Ansichten werden umbenannt, nicht verdoppelt.
- `smoke.spec.ts` (echte Daten): Altstadt wählen → `.meta .dist` passt auf `/^(\d+ Min\.|über 2 Std\.)$/`; Gates und 320 px / 200 % bestehen.
- `scripts/screenshots.ts`: `kind`, `start-startpunkt`, `filter-wegzeit`.
- Kanarienvögel: statischer Import von `src/domain/transit.ts` in `App.tsx` → `pnpm arch` rot; `import "node:fs"` in `scripts/transit/table.ts` → rot. Danach wieder entfernt, Beleg in der Commit-Message.

## Backpressure

Keine Schwelle wird gesenkt. Neu:

- Budgets: `Wegzeit JS (lazy)` 3 kB, `Wegzeit-Daten` 64 kB. `JS (initial)` bleibt 90 kB, Messungen nach Schritt 5 und 6 werden hier notiert (E10).
- dependency-cruiser: `transit-only-lazy`, `transit-build-pure` (E10), mit Kanarienvögeln.
- Coverage-Gate auf `scripts/transit/**` (E10).
- `validate-data` prüft den Auszug per Zod (rot) und seine Aktualität (Warnung).
- Referenztest Profil- gegen Vorwärts-CSA (E6).
- E2E: kein Request ab der Wahl, kein Laden ohne Anlass, Rückfall (E9, E11).
- **Build-Dauer:** `build-data` misst die Routing-Zeit und gibt sie aus („✓ Wegzeit: 570 Halte × 76 Orte in 4,2 s“). Über 20 s gibt es eine Warnung, kein Rot. Wird es knapp, ist der nächste Schritt ein Cache in `node_modules/.cache/zwergenplan/` über einen Hash aus Auszug und Orten.

## Schritte

1. **Plan, ADR 0011 (Entwurf), `/plan-review`**, Befunde einarbeiten.
   - Fertig: Der Plan hat einen Review-Abschnitt ohne offenen Blocker. Die Nutzerfragen unten sind beantwortet und eingearbeitet.
2. **Paket B1 „Vertrag“** (E16): Schema, Fixture-Auszug, `loadTimetable`, Prüfung und Warnungen, ADR 0011 angenommen, Hinweise in ADR 0003/0005, `pnpm schema:export`.
   - Fertig: `pnpm check:fast` und `pnpm schema:check` grün, Tests für `Timetable`-`refine` und `freshness`.
3. **Paket A „Pipeline“** (parallel zu 4): `gtfs.ts` test-first, `io/gtfs.ts`, `pipeline oepnv`, Skill-Schritt, README. Dann der echte Lauf `pnpm pipeline oepnv` und Commit von `data/oepnv/fahrplan.json`.
   - Fertig: `check:fast` grün; Lauf meldet Stichtag, Steige, Fahrten, Verbindungen (Erwartung grob 3 500 / 3 400 / 52 000) und Dateigröße; zweiter Lauf meldet „Fahrplan aktuell“ (304).
4. **Paket B2 „Tabelle“** (parallel zu 3): `profile-csa.ts` und `table.ts` test-first mit Referenz-CSA, `src/domain/transit.ts`, `build-data.ts`, Coverage, `transit-build-pure`.
   - Fertig: `check:fast` grün, Coverage ≥ 90 %, `ZWERGENPLAN_DATA=fixture pnpm data:build` schreibt `wegzeit.json`.
5. **Zusammenführen A + B2** auf `oepnv-0009`, echter `pnpm data:build`.
   - Fertig:
     - Laufzeit und Größe von `wegzeit.json` notiert (Erwartung ≈ 38 kB gzip);
     - Stichprobe plausibel (Gostenhof → Marmorsaal ≈ 18 Min., Altstadt → Boxdorfer Werkstatt ≈ 50 Min.);
     - die Ausgabe nennt alle 35 Stadtteile mit Zugangshalt.
   - Danach **Paket C**, zuerst Domäne (`reach`, `filter`) und `use-transit` test-first, dann verdrahten. **Budget messen** (`pnpm build && pnpm size`) und notieren.
6. **Paket C, UI:** Kachel, Detail, Statuszeile, Kind-Sheet, Filtergruppe, Hinweise, Karte (Orts-Liste, Orts-Sheet, `want()` beim Öffnen), Lazy-Chunk `assets/oepnv/`, `transit-only-lazy`. Nach jedem Block `check:fast` grün.
7. **Paket C, E2E und Gates:** Specs aus „Tests“, `mobile-ux`, `smoke`, Screenshots.
   - Fertig: `PW_PORT=4291 pnpm check` grün inklusive WebKit (lokal ggf. ohne `iphone-15`, CLAUDE.md); Budgets eingehalten und notiert.
8. **Doku:**
   - `docs/architecture.md`: Datenfluss mit Pipeline-Schritt `oepnv` und `wegzeit.json`; Schichten-Zeile `scripts/transit/`; Karten-/Lazy-Regeln um `assets/oepnv/`; Privatsphäre-Invariante um den Ladezeitpunkt (E9);
   - `docs/ideas.md`: Nicht-Ziele;
   - Plan 0004 E9: Verweis „umgesetzt in Plan 0009“.
9. **`/arch-review`** (Pflicht: neue Module, neue Abhängigkeit, Schemaänderung, > 200 Zeilen). Befunde einarbeiten und hier anhängen.
10. **Commit und Push** der Branches, CI grün (`gh run watch`), Fast-Forward nach `main`, CI auf `main` grün, Deploy.
11. **`/browser-review live`**, jede Zeile beantworten, besonders:
    - Netzwerk-Tab: `wegzeit.json` kommt beim Öffnen von Kind-Sheet oder Karte, nach der Wahl kommt nichts, nichts geht an Dritte außer den Kacheln bei offener Karte;
    - Plausibilität von 5 Stichproben gegen die VGN-Auskunft (Di vormittags), Abweichung notieren;
    - CLS beim Umschalten Luftlinie → Minuten;
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
- `pnpm check` grün, CI grün auf `main`. Budgets: JS initial ≤ 90 kB (Zuwachs ≤ 1,5 kB), `Wegzeit JS (lazy)` ≤ 3 kB, `Wegzeit-Daten` ≤ 64 kB. Alle Messwerte notiert.
- `Venue.nearestStops` gestrichen, `Timetable` im Schema, ADR 0011 angenommen, ADR 0003/0005 mit Hinweis, `docs/architecture.md` nachgeführt.
- VGN-Namensnennung mit Lizenz und Stand im Kind-Sheet und im README.

## Risiken

- **Build-Dauer:** Die Profil-CSA läuft in jedem `data:build`, also auch in `pnpm dev` und zweimal im E2E-Job. Gemessen 6,8 s unter starker Last. Ausweg: Cache über einen Hash (Backpressure), danach Halte-Zeilen ausdünnen.
- **Genauigkeit:** Soll-Daten ohne Verspätungen und Baustellen. Der Median über ein Fenster passt nicht zu jeder Uhrzeit, und eine seltene Linie (Takt 60) wird ehrlich teuer. „ca.“, „Di vormittags“ und der Quellenhinweis sagen das. Der Browser-Review vergleicht Stichproben mit der VGN-Auskunft.
- **Lizenzwiderspruch** beim VGN (E3): Wir gehen den strengeren Weg (BY-SA). Klärt der VGN auf BY, ändert sich nur der Text.
- **Feed-Änderungen** (URL, Spalten, DHID-Schema): `pipeline oepnv` bricht laut ab, der alte Auszug bleibt gültig, CI warnt nach Ablauf.
- **Wachsende Ortszahl:** Die Datei wächst linear (≈ 0,5 kB gzip je Ort). Das Budget von 64 kB reicht bis rund 120 Orte, dann Kompression (E7).
- **Cache-Versatz** `site.json` ↔ `wegzeit.json` (beide `max-age=600`): `decodeTransitTable` prüft die Spalten, sonst Rückfall (E8, E11).
- **Startbudget** (2,7 kB Luft): Messpunkte nach Schritt 5 und 6, Ausweg in E10.
- **Stadtgrenze:** Wer in Fürth oder Erlangen wohnt, bekommt die Luftlinie (offene Frage 4).

## Offene Fragen an den Nutzer

1. **Begriff:** „Wegzeit“ (Plan 0004) oder „Fahrzeit“? Vorschlag „Wegzeit“, weil auch reine Fußwege vorkommen.
2. **Filter:** Den km-Umkreis durch „bis 20 / 30 / 45 Min.“ ersetzen (Nutzerentscheidung 3 aus Plan 0004 ändert sich)? Alte `umkreis=`-Links würden wirkungslos. Vorschlag: ja.
3. **Zeitfenster:** nur „Di, Abfahrt 8:30–10:30“ (deckt 53 % der Termine, Beginn 9–11 Uhr)? Ein zweites Fenster „nachmittags“ (15-Uhr-Spitze, 591 Termine) verdoppelt die Datei auf ≈ 76 kB. Vorschlag: erst nur vormittags.
4. **Startgebiet:** nur Halte im Stadtgebiet Nürnberg (570, ≈ 38 kB) oder alle in der BBOX inklusive Fürth und Erlangen (1 771, ≈ 114 kB)? Vorschlag: Stadtgebiet.
5. **Wartezeit:** Median **mit** Wartezeit am ersten Halt (ehrlich für feste Kurszeiten: „so viel Zeit einplanen“) oder „passend losgehen“ (im Schnitt 4,5 Min. kürzer)? Vorschlag: mit Wartezeit.
6. **Lizenz:** Ist die vorsichtige Lesart CC BY-SA 3.0 DE mit Hinweis im Kind-Sheet in Ordnung? Alternativ beim VGN nachfragen (opendata@vgn.de o. ä.).
7. **Gehtempo:** 4,5 km/h mit Kinderwagen und Umwegfaktor 1,3 – passt das?
