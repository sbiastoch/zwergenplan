# Plan 0039 – Region Düsseldorf: zweites Netz außerhalb von Bayern und VGN

Status: in Umsetzung
Datum: 2026-10-18
Bezug:
- ADR 0025 (Katalog regionsfähig; Punkt 1 „Weitere Region-Felder (Ferienland, ÖPNV, Kamera) kommen mit der zweiten Region“), ADR 0029 (Fürth; Punkt 1 „jede Region-bbox liegt in `NUERNBERG_BBOX`“, Punkt 5 „Stadtwahl bleibt ungespeichert“)
- ADR 0011 (Wegzeit-Tabelle aus VGN-GTFS; Punkt 4 Fahrplanauszug, Punkt 5 Lizenz, Punkt 6 Laden und Privatsphäre), ADR 0014 (Push, Punkt 4), ADR 0017 (Startpunkt gespeichert, Punkt 5), ADR 0008 (Kamera-Regel), ADR 0012 (Startbudget)
- ADR 0026 und Plan 0032 (`docs/plans/0032-daten-automatisch.md`): Nachtlauf und Entdecken
- Plan 0036 (`docs/plans/archiv/0036-region-fuerth.md`): Muster einer Region
- `docs/ideas.md`, „Weitere Regionen“, „Stadtwahl speichern“, „`data/offers.json` je Region teilen“
- Skill `babyevents-nuernberg`, Abschnitt 6 „Region starten“ und 7 „Fahrplan erneuern“

## Anlass

Der Nutzer will Düsseldorf als weitere Region. Entschieden (2026-10-18, Rückfragen im Chat):

1. **Stadt wählen, nur sie zeigen.** Das Onboarding speichert die Stadt. Liste, Karte und Kartenmitte zeigen nur die Angebote ihres Gebiets (Nürnberg und Fürth bzw. Düsseldorf). Umschaltbar in den Einstellungen. Das ändert ADR 0029, Punkt 5.
2. **Gleich mit VRR-Fahrplan.** Startpunkte in Düsseldorf bekommen Wegzeiten mit Bus und Bahn wie in Nürnberg, aus dem VRR-GTFS-Feed.
3. **Nur Stadt Düsseldorf** als bbox der Region, ohne Nachbarorte.

Düsseldorf ist die erste Region außerhalb Bayerns und des VGN. Damit kommen die Felder, die ADR 0025 und ADR 0029 für diesen Fall angekündigt haben: Ferienland, Fahrplan, Kamera.

## Ziel

1. Im Onboarding steht die Kachel „Düsseldorf“ neben „Nürnberg“ und „Fürth“. Die Wahl wird gespeichert. Wer Düsseldorf wählt, sieht nur Düsseldorfer Angebote, Stadtteile und Kartenausschnitte. Wer Nürnberg oder Fürth wählt, sieht alles wie heute.
2. Ein Startpunkt in Düsseldorf (Stadtteil, Standort, Kartenmitte) bekommt Wegzeiten mit Bus und Bahn aus dem VRR-Fahrplan.
3. Termine Düsseldorfer Anbieter fallen in den Schulferien und an den Feiertagen von **NRW** aus, wenn der Anbieter „nicht in den Ferien“ schreibt, nicht in denen Bayerns.
4. Das Entdecken füllt den Düsseldorfer Katalog, zuerst als Bootstrap im Trockenlauf und erst nach Abnahme durch den Nutzer live.
5. Bestandsnutzer merken nichts außer der neuen Kachel und dem Umschalter. Ihr Gebiet ist Nürnberg, Onboarding und Startpunkt bleiben, wie sie sind.

## Nicht-Ziele (Restpunkte nach `docs/ideas.md`)

- Nachbarorte Düsseldorfs (Neuss, Ratingen, Hilden, Erkrath, Meerbusch) als Region oder in der bbox (Nutzerentscheid 3).
- `site.json` je Gebiet teilen. Die Datei bleibt eine für alle (E7). Erst wenn sie 200 kB gzip übersteigt, kommt ein eigener Plan.
- Sammelkalender-Adapter für Düsseldorf. Das Entdecken findet Düsseldorf zunächst über die Websuche und die Verzeichnisse, die es selbst aufnimmt.
- Kachelbild `public/og/vorschau-v1.jpg` und `GENERIC_ALT` (`scripts/lib/share-pages.ts`) mit allen Städten. Beide bleiben bei „in Nürnberg“; das bleibt wahr.
- Umbenennen von `NUERNBERG_BBOX`, des Skills `babyevents-nuernberg` oder von `PRODID` in `src/domain/ics.ts`.
- Merkliste nach Gebiet filtern. Wer in beiden Städten etwas merkt, sieht beides (E8).
- Angebote anderer Gebiete in Deep-Links verstecken. `?angebot=`, `a/<id>/` und `p/<publicId>/` öffnen jedes Angebot (E8).

## Ausgangslage (geprüft 2026-10-18)

Zwei Inventare (Browser/Domäne und Pipeline/Transit) und eine Vermessung des VRR-Feeds liegen dieser Ausgangslage zugrunde.

| Stelle | Heute | Betroffen? |
|---|---|---|
| `src/domain/regions.ts` | `REGION_IDS = ["fuerth", "nuernberg"]`, `Region { name, bbox, population, kreis }`; Kopf „Ferienland, Kamera und Suchname gibt es nicht … beide Regionen liegen in Bayern und im VGN“; jede bbox in `NUERNBERG_BBOX` | ja: E1, E2 |
| `src/domain/geo.ts` | `NUERNBERG_BBOX`, `inBounds(p, bbox = NUERNBERG_BBOX)` | ja: E3 (Standard-bbox entfällt) |
| `inBounds` mit Standard-bbox | `src/data/geolocation.ts:71` (Standort), `src/ui/use-app-state.ts:368` (Kartenmitte), `src/ui/origin-state.ts:40` (gespeicherter Punkt, Start-Chunk), `src/domain/stored-origin.ts:22` (gespeicherter Punkt im Service Worker), `src/domain/schema.ts:325` (`Timetable`-Steige), `scripts/pipeline/lib/gtfs.ts:336` (Auszug) | ja: E3 |
| `src/domain/site-data.ts` | `SiteOffer` und `SiteProvider` ohne Region; ADR 0029, Punkt 2: „`region` erreicht die Website nicht“ | ja: E7 |
| `public/data/site.json` | ein Request (Frühstart im Inline-Skript von `index.html`), 484 Angebote, 116 kB gzip, Budget 250 kB | ja: wächst mit Düsseldorf (E7) |
| Wegzeit `public/data/wegzeit.json`, `linien.json` | eine Tabelle (747 Zeilen × 82 Orte), **60,7 kB gzip von 64 kB**; Linien 36,6 kB von 40 kB (seit Plan 0051: Budgets 120 kB bzw. 72 kB; am 2026-10-27 bei 89 Orten 65,1 bzw. 40,1 kB); ein `source`, ein `serviceDay` je Datei | ja: E5 |
| `scripts/transit/table.ts` | `CITY_PREFIXES` aus allen Regionen; `tableRows` ohne Präfix-Parameter | ja: E5 |
| `scripts/build-data.ts:115-149` | eine Tabelle aus `loadTimetable`; Zugangshalt-Gate über alle `DISTRICTS`; `MAX_WITHOUT_LINES = 0.093` am VGN geeicht | ja: E5 |
| Browser-Wegzeit | `src/data/transit.ts` lädt feste Pfade `data/wegzeit.json`, `data/linien.json`; `src/sw/routes.ts:42` `TRANSIT_FILES`; `src/sw/push-tailor.ts:65-71` lädt `site.json` und `wegzeit.json` je genau einmal | ja: E5, E9 |
| Fahrplan | `data/oepnv/fahrplan.json` (VGN, 1,06 MB, 3 534 Steige, gültig bis 12.12.2026); `scripts/pipeline/lib/gtfs.ts` mit `VGN_FEED_URL`, `MODES` nur 0/1/2/3, `DEMAND_RESPONSIVE` über `route_desc`, `vgnSource()`; `io/gtfs.ts` mit festem Cache und `TIMETABLE_FILE`, entpackt `stop_times.txt` als **einen String** | ja: E4 |
| Ferien | `scripts/pipeline/io/holidays.ts` fest `DE-BY`, Cache `holidays-<jahr>.json` ohne Land; eine `freeDays`-Map für alle Anbieter in Nachtlauf (`io/nightly.ts:248` → `buildOffers` → `expandSchedule`), Extraktion (`io/extract.ts`), Entdecken (`io/discover.ts`), Eval, `pickServiceDay` | ja: E6 |
| Extraktions-Prompt `scripts/pipeline/prompt/extract.md` | Z. 3 „eines Anbieters aus Nürnberg und Umgebung“, Z. 130 Hebamio „nur Kurse mit Kursort in Nürnberg und Umgebung“, Z. 131 Kursolino „Nürnberger Kurse tragen das Präfix NDE“; Prompt-Text im Cache-Schlüssel | ja: E10 |
| Entdecken | Suchbegriffe und Prompts regionsneutral, Suchanfrage `"<begriff> <Region.name>"`; bbox der Lauf-Region; Bremsen **je Lauf**, Zeitbudget 90 Min.; Cron Sonntag 04:30 UTC, alle Regionen nacheinander | ja: E11 |
| Onboarding | `OnboardingFlow.tsx:61` `city` nur im Zustand („nie gespeichert, Plan 0036, E7“), Vorauswahl `cityChoices(REGIONS).tiles[0]` (größte Stadt, wäre künftig Düsseldorf); `WayStep` und `OriginPicker` listen `districtGroups(…)` aller Regionen | ja: E8 |
| localStorage | `KEYS` in `src/data/preferences.ts:8-16`; Liste in `docs/architecture.md`, „Privatsphäre“ | ja: E8 (neuer Schlüssel) |
| Karte | `src/domain/camera.ts:11` `HOME` = Hauptmarkt Nürnberg; `initialCamera` über alle kommenden Orte | ja: E8 |
| Push | `src/domain/news.ts:81-93` zählt alle neuen Angebote (nach Alter, ggf. Such-Abo); IndexedDB-Spiegel `MirrorData` (`src/data/push.ts:66-71`), `DEVICE_KEYS` | ja: E9 |
| Texte | `src/ui/format.ts:400` „außerhalb des Großraums Nürnberg“, `src/ui/App.tsx:343` (Kartenmitte), `format.ts:438` `limitReason` mit `regionList()`, `format.ts:458-464` feste VGN-Konstanten samt CC BY-SA 3.0 DE, `index.html:9,17`, `public/manifest.webmanifest:4`, `CLAUDE.md` Satz 1, Datenschutz in `imprintPage()` | ja: E12 |
| Startbudget | `JS (initial)` **101,4 kB von 102 kB** (dist, 2026-10-18) | ja: E13 |
| Größen-Gates | `.size-limit.json`: je ein Eintrag `dist/data/wegzeit.json` und `dist/data/linien.json` | ja: E5 |

### VRR-Feed (gemessen 2026-10-18)

- **Quelle:** OpenVRR auf opendata-oepnv.de, Datensatz `soll-fahrplandaten-vrr` (https://www.opendata-oepnv.de/ht/de/organisation/verkehrsverbuende/vrr/openvrr/datensaetze). Lizenz laut CKAN-API `cc-by` („Creative Commons Attribution“), Autor „Admin VRR“, Quelle https://openvrr.de/. Monatliches Abbild, „Beta-Version“; jede Ausgabe ist eine neue Ressource mit eigener UUID.
- **Neueste Ausgabe:** „Oktober 2026“ vom 15.10.2026, `google_transit.zip`, 43,7 MB, `Last-Modified` und `ETag` vorhanden, Download ohne Login.
- **Inhalt:** `feed_info` „VRR“, gültig 01.09.2026–28.02.2027. `stop_times.txt` **665 MB entpackt**, 5,6 Mio. Zeilen; 231 000 Fahrten. `stops.txt` mit DHID als `stop_id` (`de:05111:…`) und Spalte `NVBW_HST_DHID`. `route_type`: 0, 1, 3, 106, 109, 405.
- **Düsseldorf:** 629 Haltbereiche `de:05111:` im ganzen Feed.
- **Referenztag:** Mit den NRW-Ferien (Herbstferien 17.–31.10.2026) wählt `pickServiceDay` am 18.10. den **Dienstag 03.11.2026**; mit den bayerischen fiele er auf den 27.10., mitten in die NRW-Ferien (72 362 statt 75 529 aktive Fahrten verbundweit).
- **DHID:** 31 966 von 33 832 `stop_id`s haben die Form `de:KKKKK:N:x:y`; `areaId` (erste drei Teile, `table.ts`) ist gleich `NVBW_HST_DHID`. 05111: 1 994 Einträge in 782 Haltbereichen, davon **609 mit Einstieg Di 8:30–10:30** am 03.11. (VGN-Tabelle heute: 747 Zeilen). `stop_times` nutzt keine Elternstationen; keine unbekannten Fahrten oder Steige.
- **`route_type`:** 3 Bus (1 706 Routen), 106 Regionalbahn (RE/RB, 49), 0 Straßenbahn (701–709, 29), 1 Stadtbahn (U70–U83, 26), 109 S-Bahn (12), 405 Einschienenbahn (SkyTrain Flughafen, H-Bahn Dortmund, Schwebebahn, 7). Typ 2 kommt nicht vor. Ohne Erweiterung von `MODES` wirft `lineOf` bei der ersten Fahrt mit 106, 109 oder 405.
- **Bedarfsverkehr:** `routes.txt` hat **keine Spalte `route_desc`**; `extractTimetable` bricht heute daran ab. Der VRR kennzeichnet Bedarfsverkehr (TaxiBus, AST, Ruhrbahn T, Rheinbahn O, Bürgerbusse) über `pickup_type`/`drop_off_type` ≠ 0, was `regular()` schon auswertet. In Düsseldorf sind alle 198 877 aktiven Halte am 03.11. regulär (0/0).
- **Speicher:** `TextDecoder.decode` auf `stop_times.txt` (664 824 045 Bytes) wirft „Cannot create a string longer than 0x1fffffe8 characters“ (Node 24.10). `unzipSync` selbst geht (1,8 s, 785 MB RSS). Blockweises Dekodieren (64 MiB, an `\n` geschnitten) in das bestehende `splitLines`: 1,3 s, Spitze ≈ 1,4 GB RSS.
- **Auszug** (Format `serializeTimetable`, Stadt-bbox): 2 562 Steige, 3 300 Fahrten, 54 601 Verbindungen, **≈ 1,02 MB** (VGN 1,06 MB). Mit 10 km Rand 7 558 Steige, ≈ 2,37 MB.
- **Linien** an 05111-Steigen im Fenster: 96 (61 Bus, 17 RE/RB/S, 10 Stadtbahn, 7 Tram, 1 SkyTrain); `MAX_LINES` 254 reicht.
- **Stadtteile:** Alle 49 OSM-`suburb`-Punkte haben einen 05111-Haltbereich mit Einstieg im Fenster in höchstens 381 m (Hafen), Median 118 m.

Stadtgrenze Düsseldorf (OSM-Relation 62539, `de:amtlicher_gemeindeschluessel=05111000`, Overpass `out bb` am 2026-10-18): lat 51,1244–51,3525, lon 6,6888–6,9399.

Einwohner Düsseldorf: **618 685** am 31.12.2024, Bevölkerungsfortschreibung auf Basis Zensus 2022, IT.NRW, „Kommunalprofil Düsseldorf, krfr. Stadt“ (Landesdatenbank, Stand 15.01.2026), Tabelle „Bevölkerungsstand und -bewegung 2018–2024“ (https://statistik.nrw/sites/default/files/municipalprofiles/l05111.pdf, abgerufen 2026-10-18). Gerundet `619_000`. Stichtag ein Jahr jünger als bei Nürnberg und Fürth (31.12.2023); das ändert die Reihenfolge der Kacheln nicht.

## Entscheidungen

### E1 – Neue Ebene „Netz“: Regionen gehören zu einem Verkehrsverbund

Neu in `src/domain/regions.ts`: `NETWORK_IDS = ["vgn", "vrr"] as const`, `NetworkId`, `NETWORKS: Record<NetworkId, Network>`. Jede Region bekommt `network: NetworkId`.

```ts
interface Network {
  /** Gebiet als Wendung nach „außerhalb“: „des Großraums Nürnberg“, „von Düsseldorf“ */
  area: string;
  /** Gültigkeitsbereich: Standort, Kartenmitte, gespeicherter Punkt, Steige des Auszugs */
  bbox: BBox;
  /** Kartenmitte ohne Orte (bisher `HOME` in camera.ts) */
  home: GeoPoint;
  /** Schulferien und Feiertage (ISO 3166-2) */
  holidays: "DE-BY" | "DE-NW";
}
```

- `vgn`: `area: "des Großraums Nürnberg"`, `bbox: NUERNBERG_BBOX`, `home` = Hauptmarkt (49,454 / 11,077, aus `camera.ts`), `holidays: "DE-BY"`. Regionen `nuernberg`, `fuerth`.
- `vrr`: `area: "von Düsseldorf"`, `bbox: VRR_BBOX` (E2), `home` = Rathaus Düsseldorf am Marktplatz (51,226 / 6,773), `holidays: "DE-NW"`. Region `duesseldorf`.
- **Warum ein Netz und nicht nur Regionen:** Alles, was die beiden Städte trennt, gilt je Verbund und Bundesland, nicht je Stadt. Fahrplan, Wegzeit-Tabelle, Gültigkeitsbereich des Startpunkts, Ferien und Kartenmitte teilen Nürnberg und Fürth. Ein Netz fasst sie zusammen; die Region bleibt die Einheit des Katalogs und des Entdeckens.
- **Ein Netz liegt in genau einem Bundesland.** Darum hängt `holidays` am Netz, nicht an der Region. Ein Verbund über eine Landesgrenze käme mit einem eigenen Plan.
- **Verworfen:**
  - Felder nur an der Region (`holidays`, `feed`, `home` je Stadt): dreifache Angaben für Nürnberg und Fürth und keine Stelle, die sagt, welche Regionen eine Tabelle teilen.
  - Netz aus den Koordinaten ableiten: Das hieße bbox-Rechnung im Start-Chunk; eine Liste ist billiger und testbar.
- `src/domain/regions.ts` bleibt rein und ohne Zod. Hilfen: `networkOf(region)`, `regionsOf(network)`, `networkAt(point): NetworkId | undefined` (in welcher Netz-bbox liegt der Punkt; die bboxen überlappen nicht, Test 1).

### E2 – Region `duesseldorf`

```ts
duesseldorf: { name: "Düsseldorf", bbox: DUESSELDORF_BBOX, population: 619_000, kreis: "05111", network: "vrr" }
```

- `DUESSELDORF_BBOX = { minLat: 51.12, maxLat: 51.36, minLon: 6.68, maxLon: 6.945 }`: die Stadtgrenze aus der Ausgangslage, auf zwei bzw. drei Stellen nach außen gerundet. Das Rechteck enthält aber ganze Nachbarstädte: Neuss Hbf (51,204 / 6,684), die Zentren von Ratingen (51,297 / 6,849), Hilden (≈ 51,17 / 6,93), Erkrath und Meerbusch-Büderich (Review M2).
- **Darum zusätzlich eine Gemeinde-Prüfung** (Nutzerentscheid 3 „nur Stadt“): Neues optionales Region-Feld `municipality: "Düsseldorf"`. Beim Aufnehmen im Entdecken (`lib/discover.ts`, dort wo Orte außerhalb der bbox wegfallen) fällt ein Ort auch weg, wenn das Geocoding (`scripts/pipeline/io/geocode.ts`, wertet `address` schon aus, Z. 53) eine andere Gemeinde liefert (`address.city` bzw. `town`/`municipality` ≠ `municipality`). `GeoResult` bekommt `municipality` aus `address.city ?? town ?? village ?? municipality`; der Cache wird versioniert (`geocode-v2.json`), damit alte Einträge ohne Gemeinde nicht gelten. **Ist die Gemeinde unbekannt** (Koordinaten-Adresse ohne `address`, Nominatim ohne passende Felder), wird der Ort für eine Region mit `municipality` verworfen, mit eigenem Grund „Gemeinde unbekannt“; im Trockenlauf ist das der sichere Weg, die Katalogpflege kann den Ort von Hand ergänzen. `ctx.geos` in `lib/discover.ts` trägt dazu `municipality`. Nur für Regionen mit dem Feld; Nürnberg und Fürth bleiben bei „Stadt plus Nachbarorte“. Das Schema prüft weiter nur die bbox (es geocodiert nicht); von Hand gepflegte Einträge verantwortet die Katalogpflege (Skill, Abschnitt 6).
- `VRR_BBOX = { minLat: 51.08, maxLat: 51.4, minLon: 6.62, maxLon: 7.0 }`: Stadt plus etwa 3 km Rand. Er ist der Gültigkeitsbereich der Startpunkte im Netz `vrr` und der Zuschnitt des Fahrplanauszugs. Der Rand lässt Fahrten über Neuss oder Hilden im Netz, damit die Profil-CSA Wege am Stadtrand nicht verliert, so wie `NUERNBERG_BBOX` größer ist als Nürnberg.
- **Reihenfolge:** `REGION_IDS = ["fuerth", "nuernberg", "duesseldorf"]`. Die Regel aus ADR 0029, Punkt 2 (spezifischere bbox vor der umfassenden) betrifft Düsseldorf nicht, weil seine bbox keine andere berührt. Hinten steht es, damit ein reißendes Zeitbudget im gemeinsamen Lauf nicht Nürnberg trifft; mit E11 läuft es ohnehin an einem eigenen Tag.
- **Invariante neu** (ersetzt ADR 0029, Punkt 1): Jede Region-bbox liegt in der bbox ihres Netzes; die Netz-bboxen überlappen nicht (Test 1).

### E3 – Gültigkeitsbereich: Netz-bbox statt `NUERNBERG_BBOX`

`inBounds(p, bbox)` verliert den Standardwert. Jede Stelle sagt, gegen welche bbox sie prüft.

| Stelle | neu |
|---|---|
| `src/data/geolocation.ts` (Standort) | `requestPosition(bbox)`: Der Aufrufer in `src/ui` übergibt `NETWORKS[network].bbox`; `src/data` importiert zur Laufzeit weiter nur `geo.ts` (Regel `data-domain-runtime-allowlist`, ADR 0010; Review M4). Sonst `reason: "outside"` wie bisher |
| `src/ui/use-app-state.ts` (`setMapCenter`) | Netz-bbox des gewählten Netzes |
| `src/ui/origin-state.ts`, `src/domain/stored-origin.ts` (gespeicherter Punkt, ADR 0017, Punkt 5) | Netz-bbox des gewählten Netzes; liegt der Punkt woanders, gilt kein Startpunkt (wie heute außerhalb) |
| `src/domain/schema.ts` `Timetable` | bbox des Netzes, dessen Auszug geprüft wird (`timetableSchema(network)` bzw. Prüfung in `parseTimetable(text, network)`) |
| `scripts/pipeline/lib/gtfs.ts` | bbox aus dem Feed-Eintrag (E4) |

- Ein Standort in Düsseldorf bei gewähltem Nürnberg ist „außerhalb“. Der Hinweis nennt das Gebiet (E12), das Umschalten bleibt eine bewusste Wahl im Kind-Sheet (E8). Automatisch umschalten hieße, aus einem Standort eine gespeicherte Einstellung abzuleiten; das verwirft E8.
- `NUERNBERG_BBOX` bleibt als Name und Wert (Nicht-Ziele) und ist künftig die bbox des Netzes `vgn`.

### E4 – Fahrplan: ein Auszug je Netz

- **Registry** `FEEDS: Record<NetworkId, Feed>` in `scripts/pipeline/lib/gtfs.ts` mit `url` bzw. `resolve`, `bbox` (aus `NETWORKS`), `holidays`, `source` (Attribution, Titel, Lizenz), `modes` (Zuordnung `route_type` → `TransitMode`) und `isDemandResponsive(route, stopTime)`.
  - `vgn`: wie heute (`VGN_FEED_URL`, `MODES`, `DEMAND_RESPONSIVE` über `route_desc`, CC BY-SA 3.0 DE).
  - `vrr`: Die URL ändert sich je Ausgabe. `resolve()` fragt die CKAN-API (`https://api.opendata-oepnv.de/api/3/action/package_show?id=soll-fahrplandaten-vrr`) und nimmt die Ressource mit Format ZIP, Dateiname `google_transit.zip` und dem jüngsten `created`; enthält das ZIP kein `stop_times.txt`, bricht der Lauf laut ab (Review 2, m8; Test in `io/gtfs.test.ts` mit Fremd-ZIP) (nicht nach Namen: Monate fehlen oder kommen mehrfach, „August 2026 II–IV“). Modi: 0 → `tram`, 1 → `u-bahn` (Stadtbahn), 3 → `bus`, 106 und 109 → `bahn`, **405 → `bahn`** (SkyTrain auf eigenem Fahrweg; eine neue Art wäre eine Schemaänderung ohne sichtbaren Nutzen). Bedarfsverkehr nur über `pickup_type`/`drop_off_type` (`regular()`); `route_desc` wird optional gelesen und gilt nur für `vgn`. Fahrten ganz ohne regulären Halt fallen aus dem Auszug.
- **Dateien:** `data/oepnv/fahrplan.json` wird per `git mv` zu `data/oepnv/vgn.json`; neu `data/oepnv/vrr.json`. Fixture entsprechend `tests/fixtures/oepnv/vgn.json` und ein kleines `vrr.json` (E14). Biome nimmt `data/oepnv` weiter aus. Verweise in `CLAUDE.md`, ADR 0011 (Statuszeilen-Block), Skill und `docs/architecture.md` ziehen mit.
- **Kommando:** `pnpm pipeline oepnv [--netz vgn|vrr] [--force]`, ohne `--netz` beide. Cache je Netz unter `~/.cache/zwergenplan/gtfs/<netz>/`. Bedingtes GET mit `If-Modified-Since` bzw. `If-None-Match`.
- **Speicher:** Der VRR-Feed hat 665 MB `stop_times.txt` und liegt damit über der Grenze für einen V8-String. `unzipSync` bleibt; `stop_times.txt` wird **blockweise dekodiert** (Blöcke von 64 MiB, am letzten `\n` geschnitten) und als `Iterable<string>` an das bestehende `splitLines`/`parseCsv` gegeben. `GtfsTexts.stopTimes` wird dazu `Iterable<string>`; die anderen Dateien bleiben Strings. Gemessen 1,3 s und ≈ 1,4 GB RSS-Spitze, lokal unkritisch. Keine neue Abhängigkeit. Verworfen: Streaming mit `fflate` `Unzip` (542 MB, aber 6,9 s und push-basiert, also größerer Umbau).
- **Referenztag:** `pickServiceDay(freeDays)` bekommt die Ferien des Netzes (E6), also NRW für den VRR. Jeder Auszug hat seinen eigenen Dienstag; die Tabellen sind getrennt (E5), darum passt das.
- **Lizenz und Namensnennung VRR:** **CC BY 4.0** (CKAN `cc-by` ohne Version; die Lizenzübersicht des Portals, https://www.opendata-oepnv.de/ht/de/organisation/verkehrsverbuende/standards/uebersicht-der-verwendeten-lizenzen, verlinkt als einzige Lizenz https://creativecommons.org/licenses/by/4.0/deed.de). Die Datensatzbeschreibung verlangt die „Nennung der VRR AöR“; die Nutzungsbedingungen schreiben keinen Wortlaut vor. CC BY 4.0, Abschnitt 3(a)(1)(B) verlangt den Hinweis auf Änderungen. `source` im Auszug: Attribution „VRR – Verkehrsverbund Rhein-Ruhr AöR“, Titel „VRR-Soll-Daten vom <Datum>“, URL des Datensatzes, Lizenz und Lizenz-URL, „abgewandelt“. Die Anzeige im Kind-Sheet nimmt die Quelle der geladenen Tabelle (E5).
- **Frische:** `scripts/transit/freshness.ts` prüft jeden Auszug und nennt das Netz im Text („neuen VRR-Feed mit `pnpm pipeline oepnv --netz vrr` holen“). `data:validate` verlangt beide Auszüge.
- Kein Abruf in CI, wie ADR 0011, Punkt 4.

### E5 – Wegzeit: eine Tabelle je Netz

- **Build:** `scripts/build-data.ts` ruft `buildTransitTables` je Netz auf, mit dem Auszug des Netzes, den Orten der Angebote seiner Regionen und den Kreis-Präfixen seiner Regionen (`tableRows(…, prefixes)`, Parameter statt Modulkonstante). Ausgabe:
  - `public/data/wegzeit/vgn.json`, `public/data/linien/vgn.json`
  - `public/data/wegzeit/vrr.json`, `public/data/linien/vrr.json`
- **Format unverändert** (`TRANSIT_TABLE_VERSION` 2, `TRANSIT_LINES_VERSION` 1). Jede Datei hat ihr eigenes `source`, `serviceDay` und `contentId`. `decodeTransitTable` bekommt nur die `placeKeys` der Angebote des Netzes (E7).
- **Laufzeit-Warnung:** `TRANSIT_WARN_SECONDS = 20` (`build-data.ts:27`) gilt **je Netz**; S4 und S11 messen beide Werte (Review 2, m10).
- **Budgets** (`.size-limit.json`) je Netz: `vgn` 120 kB bzw. 72 kB (Plan 0051; Ist am 2026-10-27 65,1 bzw. 40,1 kB bei 89 Orten; Düsseldorfer Orte kommen nicht hinein, Nürnberger und Fürther Orte schon). `vrr` ebenso 120 kB bzw. 72 kB. Dazu prüft `data:build` je Netz Byte je Zelle (`perCellIssues`, Plan 0051: `minutes` höchstens 1,15, Linien 0,75); ohne Spalten ist der Wert 0. Die Schwellen sind am VGN geeicht: Für `vrr` nach Bootstrap und Nachtlauf nachmessen (Plan 0042 maß 0,82 Byte je Zelle für die ganze Linien-Datei); liegt der Wert darüber, eigene Schwelle je Netz mit Begründung. Erwartung: 609 Zeilen (VGN 747) mal Zahl der Düsseldorfer Orte nach dem Bootstrap; bei 60–80 Orten etwa 40–55 kB gzip, Linien etwa 20–30 kB (96 Linien in der Stadt). Vor dem Bootstrap hat die Tabelle keine Spalten (nur Zeilen); gemessen wird nach S11.
- **Gates je Netz:** Zugangshalt-Gate über die Stadtteile der Regionen des Netzes (nur echter Build, wie heute `build-data.ts:141`). Die Linien-Gates (`withoutLines === cells`, Z. 130; `MAX_WITHOUT_LINES`, Z. 129) prüfen ein Netz **nur, wenn es Orte hat**. Ohne Orte (Düsseldorf zwischen Push und Bootstrap) gibt der Build `::warning::Netz vrr ohne Orte – Linien-Gates übersprungen` aus und bleibt grün; ein Unit-Test belegt das (Test 5, Review B1). Ohne diese Ausnahme wäre der Deploy-Build auf `main` rot, bevor das Entdecken (das mit dem Code von `main` läuft) Düsseldorfer Anbieter liefern kann. `MAX_WITHOUT_LINES` wird für `vrr` erst nach Bootstrap und Nachtlauf gemessen (S11); liegt der Wert darüber, kommt ein eigener Wert je Netz mit Begründung in Code und Plan, als eigener Commit.
- **Browser:** `src/data/transit.ts` lädt `data/wegzeit/<netz>.json` und danach `data/linien/<netz>.json` für das gewählte Netz. `src/sw/routes.ts` `TRANSIT_FILES` listet alle vier Pfade (Netz zuerst mit Kopie, wie bisher). Der Anlass bleibt ADR 0011, Punkt 6 (Startpunkt-Oberfläche, „Nochmal laden“, Start mit gespeichertem Startpunkt), nie eine Wahl.
- **Wechsel des Netzes** verwirft die geladene Tabelle; beim nächsten Anlass lädt die des neuen Netzes.
- **Alte Pfade** `data/wegzeit.json` und `data/linien.json` fallen weg. Der neue Service Worker löscht ihre Kopien in `zp-data` in `activate` (Unit-Test in `routes.test.ts` bzw. `sw`-Test; Review m13). Ein alter Service Worker holt sie bis zu seinem Update aus dem Cache; nach dem Update lädt der neue Code die neuen Pfade. Ein ausgelieferter Client mit altem Code bekommt 404 und zeigt den bestehenden Fehlerzustand mit „Nochmal laden“, bis er neu lädt. Das ist ein Übergang von einem Seitenaufruf.
- **Privatsphäre (E15):** Der Pfad verrät dem eigenen Host das Netz, also eins von zwei Gebieten. Das ist eine neue, bewusste Ausnahme von „Kein Request hängt davon ab, ob etwas gespeichert ist“ und ändert ADR 0011, Punkt 6 sowie ADR 0014, Punkt 4.
- **Verworfen:**
  - Eine gemeinsame Tabelle: Alle Zellen zwischen den Netzen wären leer (255), die Datei läge sicher über 64 kB, und es gäbe nur einen `serviceDay`.
  - Immer beide Tabellen laden: wahrt die Invariante, kostet aber jeden Nutzer nach dem Bootstrap rund 60–85 kB gzip mehr pro Anlass (Tabelle und Linien des anderen Netzes). Die Kartenkacheln verraten das Gebiet ohnehin dem Kachel-Host (E8), der eigene Host erfährt also nichts, was ein Dritter nicht schon sieht.
  - Eine Datei mit Blöcken je Netz: dasselbe wie „beide laden“, dazu ein neues Format.

### E6 – Ferien und Feiertage je Netz

- `scripts/pipeline/io/holidays.ts`: `loadFreeDays(subdivision, from, to)`; Cache `holidays-<subdivision>-<jahr>.json`; URL mit `subdivisionCode=<subdivision>`. `scripts/pipeline/lib/holidays.ts` filtert auf den übergebenen Code statt fest `DE-BY`.
- Die eine `freeDays`-Map wird zu `FreeDaysByNetwork = Record<NetworkId, FreeDays>`, einmal je Lauf geladen. Wer eine Map braucht, wählt sie über `networkOf(provider.region)`:
  - Nachtlauf: `buildOffers` → `expandSchedule` je Anbieter.
  - Extraktion: `io/extract.ts` gibt dem Kontext die Map des Anbieters. Der Cache-Schlüssel je Stichtag bleibt; die Map ist Eingabe der Expansion, nicht des Prompts. In S2 wird geprüft, ob `freeDays` in den Cache-Schlüssel der Extraktion eingeht. Wenn ja, bleibt der Schlüssel für VGN-Anbieter gleich, weil ihre Map gleich bleibt; ein Test belegt das.
  - Entdecken (Ertragsbeweis), Eval: die Map der Region des Laufs bzw. des Falls.
  - `pickServiceDay` je Netz (E4).
  - `pnpm pipeline holidays [--netz …]`, Hilfetext ohne „Bayern“.
- Der Browser hat keine Feiertagslogik; nichts ändert sich dort.
- Bestehende Caches `holidays-<jahr>.json` werden nicht mehr gelesen. Der erste Lauf lädt Bayern unter dem neuen Namen neu, OpenHolidays ist frei und schnell.

### E7 – Daten im Browser: `network` je Angebot und Anbieter, eine `site.json`

- `toSiteData` (`src/domain/site-data.ts`) schreibt je Angebot `network: NetworkId` aus `networkOf(provider.region)`; `toProviderDirectory` ebenso je Anbieter in `anbieter.json`. Die Region selbst erreicht die Website weiter nicht (ADR 0029, Punkt 2 bleibt).
- **Warum ein Feld statt bbox-Rechnung im Browser:** keine Geometrie im Start-Chunk, explizit und testbar; gzip-Kosten weniger als 1 kB.
- **Eine `site.json` für alle**, weiter mit Frühstart im Inline-Skript. Der Frühstart darf nicht von gespeicherten Werten abhängen (Invariante), und das Teilen hätte keinen anderen Nutzen als Bytes.
- **Filter:** `App.tsx` filtert direkt nach dem Laden (`load.data.offers`) auf das gewählte Netz, bevor `placeKeys`, `useTransit` und `useOfferViews` rechnen. Liste, Statuszeile, Kalender und Karte folgen daraus. Die Willkommenszahl im Onboarding (`welcomeStats`, steht schon im Schritt „Stadt“) rechnet über `allOffers`, gefiltert auf das Netz der **gerade angetippten** Kachel, nicht der gespeicherten Stadt (Review 2, m5). Ungefiltert bleiben Deep-Links, Detail und Merkliste (E8).
- **Größe:** Mit Düsseldorf wächst `site.json` etwa um den Anteil der Düsseldorfer Angebote. Erwartet nach dem Bootstrap 150–230 kB gzip bei einem Budget von 250 kB. Gemessen nach S9; über 200 kB wird „`site.json` je Gebiet teilen“ (`docs/ideas.md`) ein eigener Plan.

### E8 – Stadtwahl speichern, Umschalter, Karte

- **Neuer Schlüssel** `zwergenplan.stadt` mit einer `RegionId`. In `KEYS` (`src/data/preferences.ts`) und in der Liste der Invariante „Privatsphäre“ in `docs/architecture.md`. Das Netz folgt daraus (`networkOf`). `loadCity()` in `src/data` prüft nur die Form (String, höchstens 32 Zeichen); ob es eine bekannte Region ist, prüft die UI gegen `REGION_IDS`, wie beim Startpunkt (ADR 0017, Punkt 5), damit `src/data` nicht `regions.ts` importiert (ADR 0010; Review M4). Ein unbekannter Wert gilt als nicht gesetzt.
  - Gespeichert wird die **Stadt**, nicht das Netz: Die Stadt ordnet die Stadtteile (gewählte zuerst, wie Plan 0036, E7) im Onboarding **und** im Kind-Sheet; das Netz allein könnte das nicht.
  - Ohne Wert gilt `nuernberg`. Bestandsnutzer behalten so alles; `ONBOARDING_VERSION` bleibt `"2"`, niemand sieht das Onboarding erneut.
- **Onboarding** (`OnboardingFlow.tsx`, `steps.tsx`): Kacheln nach Einwohnern (Düsseldorf, Nürnberg, Fürth; `cityChoices` bleibt). **Vorauswahl** ist die gespeicherte Stadt, sonst `nuernberg`, nicht mehr die größte Kachel (das wäre künftig Düsseldorf und für die bisherigen Nutzer falsch). Die Wahl wird beim Weitergehen gespeichert. Der Schritt „Weg“ zeigt `districtGroups(city)` **nur für die Regionen des Netzes**: Wer Düsseldorf wählt, sieht nur Düsseldorfer Stadtteile; wer Fürth wählt, Fürth und Nürnberg.
- **Netzwechsel an einer Stelle** (Review 2, M1): Die Regeln unten stehen in einer Funktion `switchCity(city)` in `src/ui/use-app-state.ts`. Onboarding (auch neu gestartet über „Einführung ansehen“) und Kind-Sheet rufen sie gemeinsam auf. `useTransit` lädt „höchstens einmal je Sitzung“ künftig **je Netz**; der Frische-Anlass (`refresh`) nimmt den Pfad des aktuellen Netzes. E2E in `onboarding.spec.ts`: gespeicherter Nürnberger Stadtteil, Onboarding neu, Düsseldorf wählen → `wegzeit/vrr.json` genau einmal, `zwergenplan.entfernung-ab` gelöscht.
- **Umschalter im Kind-Sheet:** Über dem Startpunkt eine Auswahl „Stadt“ (natives `<select>` mit den drei Städten nach Einwohnern, Beschriftung wie im Onboarding „Eure Stadt“). Wechselt das Netz, gilt:
  - Der gespeicherte Startpunkt wird gelöscht, wenn er nicht im neuen Netz liegt (Stadtteil einer Region des alten Netzes oder Punkt außerhalb der neuen Netz-bbox).
  - Die geladene Wegzeit-Tabelle wird verworfen; der offene Kind-Sheet ist eine Startpunkt-Oberfläche und lädt daher die Tabelle des neuen Netzes (ADR 0011, Punkt 6, Anlass „Öffnen“; hier „Netz gewechselt bei offenem Sheet“). Das ist der einzige Request, der aus einer Wahl folgt; er hängt am Netz, nicht am Startpunkt (E15).
  - Liste und Karte zeigen sofort das neue Netz; die Karte verwirft ihre `lastCamera`.
  - Ein Wechsel zwischen Nürnberg und Fürth (gleiches Netz) ändert nur die Reihenfolge der Stadtteile.
- **Zustände beim Netzwechsel** (Review M7):
  - **Offline:** Die Tabelle des neuen Netzes liegt nicht in `zp-data`. Es erscheint der bestehende Fehlerzustand der Wegzeit („Wegzeit gerade nicht verfügbar“ mit „Nochmal laden“), die Liste zeigt Luftlinie bzw. keine Minuten wie heute ohne Tabelle. E2E in `startpunkt.spec.ts` mit `context.setOffline(true)` nach dem Wechsel.
  - **Netz ohne Angebote** (Düsseldorf zwischen Push und Bootstrap): Eigener Leerzustand der Liste „In Düsseldorf haben wir noch keine Angebote. Wir suchen gerade danach.“ statt des Hinweises auf die Filter, wenn das Netz vor allen Filtern leer ist. Die Karte steht dann auf `home` des Netzes ohne Marker und ohne Fehler, der Kalender zeigt den Leerzustand der Liste, die Statuszeile „0 Angebote“ (Review 2, m12). Fixture-Fall: Die Fixture-Daten bekommen einen Weg, ein Netz leer zu sehen (E2E-Route, die `site.json` ohne Düsseldorfer Angebote liefert). Test in `onboarding.spec.ts` oder `startpunkt.spec.ts`.
- **Ein Mockup des Kind-Sheets** mit der Auswahl „Stadt“ wird dem Nutzer vor S7 gezeigt (CLAUDE.md, Punkt 1; der Umschalter ist ein neues Bedienelement in einer bestehenden Ansicht). Variante B zum Vergleich: Stadt als Kacheln wie im Onboarding.
- **`OriginPicker`** listet `districtGroups(city)` der Regionen des gewählten Netzes.
- **Karte:** `initialCamera` über die kommenden Orte **des gewählten Netzes**, ohne Orte `NETWORKS[network].home`. `HOME` in `camera.ts` entfällt zugunsten des Netz-Feldes. Das ändert die Kamera-Regel (ADR 0008, Invariante „Privatsphäre“): Der Startausschnitt hängt am gewählten Netz, sonst weiter an nichts Gespeichertem (E15).
- **Anbieter-Tab** (Review M5): `anbieter.json` trägt `network` je Anbieter (E7). Der Tab und das Sheet „Anbieter“ (`src/ui/anbieter/`, `src/domain/directory.ts`) zeigen nur Anbieter des gewählten Netzes, **gemerkte Anbieter immer** (wie die Merkliste). Die Rückfall-Zeilen aus den Angeboten nehmen die gefilterten Angebote. Ein Deep-Link `p/<publicId>/` öffnet jeden Anbieter. Unit-Test in `directory.test.ts`, E2E in `anbieter.spec.ts`.
- **Datenfluss** (Review M6): `App.tsx` hält `allOffers` (ungefiltert) und `offers` (Netz). Liste, Kalender, Karte in „Entdecken“, Statuszeile, `placeKeys`, `useTransit` und Willkommenszahlen bekommen `offers`. Merkliste, Detail und Deep-Links bekommen `allOffers`. Für ein Angebot außerhalb des gewählten Netzes zeigt die Entfernungszeile **keine Wegzeit und keine Luftlinie**, sondern „in Düsseldorf“ bzw. „in Nürnberg“ (Name der Region des Angebots über `network` und die Regionsnamen; neuer `ReachMode` `"anderes-netz"` in `src/ui/use-transit.ts` (dort liegt der Typ) und Text in `format.ts`). So steht nie „ca. 400 km Luftlinie“ da. Test in `format.test.ts` und `saved.spec.ts`.
- **Merkliste und Deep-Links** nutzen die ungefilterten Angebote: Gemerktes aus dem anderen Netz bleibt sichtbar, ein geteiltes Düsseldorfer Angebot öffnet auch bei Nürnberg. Die Karte der Merkliste startet über die gemerkten Orte des gewählten Netzes; Gemerktes aus dem anderen Netz steht in der Liste. Ein Hinweis wie „2 gemerkt in Düsseldorf“ kommt nicht; wer zwischen den Städten wechselt, sieht Gemerktes ohnehin in der Liste.

### E9 – Push filtert nach Netz

- Die Stadt kommt in den IndexedDB-Spiegel (`MirrorData`, `DEVICE_KEYS`; Invariante „Privatsphäre“ nennt sie). Gespiegelt wird wie bisher nur bei eingeschaltetem Push.
- `push-tailor.ts` filtert `siteOffers` auf das Netz der gespiegelten Stadt (ohne Wert `vgn`), bevor `newOfferIds` und `weeklyText` rechnen, und lädt `data/wegzeit/<netz>.json`. `seenIds` bleibt über alle Angebote, damit ein Netzwechsel keine Flut „neuer“ Angebote meldet.
- `push-tailor.ts` liest zuerst die gespiegelte Stadt aus der IndexedDB und holt dann die Tabelle (heute laufen Z. 65-72 parallel). Ein Test belegt, dass das 5-s-Limit des Zuschnitts hält.
- **Bewusste Lücke** (Review m10): Die allgemeine Fassung der Nachricht aus `scripts/lib/push-weekly-core.ts` (die iOS zeigt, wenn der Service Worker nicht zuschneidet) zählt die neuen Angebote beider Netze. Sie bleibt so; Restpunkt nach `docs/ideas.md`.
- Die Invariante „Beim Push lädt der Service Worker `site.json` und `wegzeit.json` je genau einmal“ wird „`site.json` und die Wegzeit-Tabelle des gespiegelten Netzes je genau einmal“ (E15, `e2e/push.spec.ts`).

### E10 – Extraktions-Prompt regionsneutral

- `scripts/pipeline/prompt/extract.md` bekommt den Platzhalter `{region}` (Name der Region des Anbieters):
  - Z. 3 „eines Anbieters aus {region} und Umgebung“.
  - Z. 130 Hebamio: „nur Kurse mit Kursort in {region} und Umgebung“.
  - Z. 131 Kursolino: „Kurse in {region} erkennst du am Ortspräfix (Nürnberg: „NDE“)“. In S8 wird am Kursolino-Katalog geprüft, ob Düsseldorf ein eigenes Präfix hat; wenn ja, kommt es in den Satz.
  - Z. 14 Sammelkalender: Die Aufzählung „Stadt, frankenkids, evangelische-termine“ wird „Sammelkalender (etwa …)“, regionsneutral.
- `lib/extract.ts` füllt `{region}` aus `REGIONS[provider.region].name`.
- **Folge:** Der Prompt-Text steckt im Cache-Schlüssel (`io/extract.ts`, `EXTRACT_KEY_PARTS`). Die erste Nacht danach extrahiert **alle** Anbieter neu. Wie beim Modellwechsel (Skill, Abschnitt 5) dafür einmal `gh workflow run nightly.yml -f modus=live -f max_tokens=5000000` (≈ $0,60) und vorher eine Zeile in `evals/results.md` aus `pnpm eval` (Kosten vor dem Lauf nennen, Skill Abschnitt 5). Ohne die Zeile warnt `pnpm data:validate`.
- **Verworfen:** Prompt unverändert lassen. Ein Düsseldorfer Hebamio-Kurs fiele dann wegen „nur Kurse mit Kursort in Nürnberg“ weg.

### E11 – Entdecken: Düsseldorf an einem eigenen Tag

- `.github/workflows/discover.yml` bekommt einen zweiten Cron, Samstag 04:30 UTC, für `--region duesseldorf`. Der Sonntagslauf nimmt die Regionen des Netzes `vgn` (`fuerth`, `nuernberg`). Die Zuordnung steht im Workflow (`github.event.schedule`), die Regionen eines Netzes liefert `pnpm pipeline discover --netz vgn` (neue Option, `regionsOf`).
- **Grund:** Bremsen und Zeitbudget gelten je Lauf (120 Aufrufe, 5 Mio. Tokens, 90 Min.). Mit drei Regionen in einem Lauf fiele Düsseldorf bei jedem knappen Sonntag weg. Getrennte Läufe halten Kosten und Ausfälle je Netz sichtbar.
- **Kosten:** etwa $0,80–1,00 je Lauf und Region-Paar wie bisher; Düsseldorf allein erwartet $0,40–0,50 je Woche (eine Region statt zwei), Bootstrap einmal bis $1,00. Gemessen im ersten Samstagslauf (S12).
- Der Vorfilter mit `abgelehnt` aller Regionen (ADR 0029, Punkt 4) gilt weiter. Er sperrt einen Nürnberger Fehlgriff auch in Düsseldorf; bei Vermittlern mit `host` ist das gewollt.

### E12 – Texte

- **Startpunkt außerhalb** (`format.ts:400`, `App.tsx:343`): „Dein Standort liegt außerhalb von {area}. Wähle einen Stadtteil oder eine andere Stadt.“ bzw. „Die Kartenmitte liegt außerhalb von {area}.“; `{area}` ist das Feld `Network.area` als fertige Wendung im Dativ/Genitiv: `vgn` „des Großraums Nürnberg“, `vrr` „von Düsseldorf“. Der Satz lautet also „… liegt außerhalb des Großraums Nürnberg.“ (unverändert) bzw. „… liegt außerhalb von Düsseldorf.“ E1 nennt das Feld darum `area` mit diesen Werten.
- **`limitReason`** (`format.ts:438`): „Wegzeiten gibt es nur für Startpunkte in {regionList(Regionen des Netzes)}.“, also „in Nürnberg und Fürth“ bzw. „in Düsseldorf“.
- **Quellenhinweis** (`format.ts:458-484`): Ohne geladene Tabelle nennt der Rückfall die Quelle des gewählten Netzes aus `NETWORKS` (neues Feld `transitSource: { attribution, url, license, licenseUrl }`), nicht mehr fest VGN.
- **`index.html`** (`description`, `og:description`), **`public/manifest.webmanifest`**, **`CLAUDE.md`** Satz 1: „… für Kinder unter 3 Jahren in Nürnberg, Fürth und Düsseldorf“.
- **Datenschutz** in `imprintPage()` (`scripts/lib/share-pages.ts`): Satz zur gespeicherten Stadt und dazu, dass Wegzeit-Tabelle und Kartenausschnitt vom gewählten Gebiet abhängen (E15).
- Bleibt: Impressum „Projekt aus Nürnberg“, `GENERIC_ALT`, `og:image:alt`, `PRODID`.

### E13 – Düsseldorfer Stadtteile und Startbudget

- `DISTRICTS_BY_REGION.duesseldorf`: OSM `place=suburb` in der Stadtgrenze (Relation 62539), Overpass am 2026-10-18, **49 Punkte** (Liste unten), auf drei Stellen gerundet. Abfrage im Dateikopf:
  ```
  [out:json][timeout:60];
  area(3600062539)->.a;
  node["place"="suburb"](area.a);
  out;
  ```
- IDs `duesseldorf-<kebab>` (Umlaute ae/oe/ue), fest. **Namen eindeutig** über alle Regionen: „Altstadt“ gibt es in Nürnberg, darum „Altstadt (Düsseldorf)“. Allgemeine Namen bekommen den Zusatz ebenfalls: „Stadtmitte (Düsseldorf)“, „Hafen (Düsseldorf)“. Auch „Hamm (Düsseldorf)“, weil Hamm als Stadt bekannter ist als der Stadtteil.
- **Zugangshalt-Gate:** Jeder Stadtteil braucht einen Haltbereich `de:05111:` der VRR-Tabelle in 800 m mit Einstieg im Fenster. Gemessen am VRR-Feed (Ausgangslage): alle 49 in höchstens 381 m, das Gate fällt keinen.
- **Hubbelrath** (Bezirk 7, einer der 50 amtlichen Stadtteile) fehlt als `place=suburb` in OSM (Review m11). S1 sucht per Overpass einen `place`-Knoten „Hubbelrath“; gibt es einen und hat er einen Zugangshalt in 800 m, kommt er als 50. Eintrag dazu, sonst steht das Fehlen in „Umsetzung“ (Hubbelrath ist dünn besiedelt, Knittkuhl und Gerresheim liegen nah).
- Die Liste ist länger als Nürnbergs (35). Düsseldorf hat 50 amtliche Stadtteile; die OSM-Punkte entsprechen ihnen fast eins zu eins. Gekürzt wird nicht, weil die Auswahl im Kind-Sheet und im Onboarding nur Düsseldorfer Stadtteile zeigt (E8).
- **Startbudget:** `districtById` liegt im Start-Chunk; 49 Einträge kosten geschätzt 0,8–1,0 kB gzip, dazu `NETWORKS`, Lesen der Stadt und der Filter etwa 0,3 kB. Reserve heute 0,6 kB. **Nutzerentscheid nötig** (Abschnitt „Offene Nutzerentscheide“): Budget `JS (initial)` auf 104 kB anheben (Nachtrag ADR 0012) oder Stadtteile in einen eigenen Chunk verlegen, der mit dem gespeicherten Stadtteil lädt (verrät wieder ein Bit und kostet einen Request beim Start).

Liste (49, aus der Overpass-Abfrage; alle bestehen das Gate):

| Name | lat | lon | | Name | lat | lon |
|---|---|---|---|---|---|---|
| Altstadt (Düsseldorf) | 51.226 | 6.774 | | Itter | 51.168 | 6.818 |
| Angermund | 51.329 | 6.781 | | Kaiserswerth | 51.301 | 6.736 |
| Benrath | 51.163 | 6.873 | | Kalkum | 51.302 | 6.758 |
| Bilk | 51.203 | 6.785 | | Knittkuhl | 51.269 | 6.871 |
| Carlstadt | 51.222 | 6.773 | | Lichtenbroich | 51.284 | 6.795 |
| Derendorf | 51.245 | 6.792 | | Lierenfeld | 51.208 | 6.83 |
| Düsseltal | 51.238 | 6.812 | | Lohausen | 51.279 | 6.731 |
| Eller | 51.201 | 6.838 | | Lörick | 51.246 | 6.724 |
| Flehe | 51.189 | 6.772 | | Ludenberg | 51.256 | 6.866 |
| Flingern Nord | 51.231 | 6.813 | | Mörsenbroich | 51.253 | 6.812 |
| Flingern Süd | 51.221 | 6.81 | | Niederkassel | 51.24 | 6.752 |
| Friedrichstadt | 51.214 | 6.782 | | Oberbilk | 51.214 | 6.802 |
| Garath | 51.144 | 6.9 | | Oberkassel | 51.23 | 6.755 |
| Gerresheim | 51.238 | 6.861 | | Pempelfort | 51.24 | 6.78 |
| Golzheim | 51.251 | 6.76 | | Rath | 51.264 | 6.82 |
| Grafenberg | 51.241 | 6.833 | | Reisholz | 51.178 | 6.858 |
| Hafen (Düsseldorf) | 51.217 | 6.734 | | Stadtmitte (Düsseldorf) | 51.222 | 6.784 |
| Hamm (Düsseldorf) | 51.204 | 6.739 | | Stockum | 51.265 | 6.753 |
| Hassels | 51.182 | 6.866 | | Unterbach | 51.203 | 6.898 |
| Heerdt | 51.232 | 6.72 | | Unterbilk | 51.21 | 6.767 |
| Hellerhof | 51.132 | 6.907 | | Unterrath | 51.273 | 6.787 |
| Himmelgeist | 51.168 | 6.806 | | Urdenbach | 51.148 | 6.866 |
| Holthausen | 51.176 | 6.833 | | Vennhausen | 51.21 | 6.858 |
| | | | | Volmerswerth | 51.187 | 6.762 |
| | | | | Wersten | 51.19 | 6.818 |
| | | | | Wittlaer | 51.319 | 6.742 |

### E14 – Fixtures

- `tests/fixtures/providers.yaml` und `offers.json`: ein fiktiver Düsseldorfer Anbieter mit zwei Angeboten an einem Ort nahe „Stadtmitte (Düsseldorf)“, `region: duesseldorf`.
- `tests/fixtures/oepnv/vrr.json`: ein Mini-Netz mit zwei Haltbereichen `de:05111:…` und einer Linie, damit „Stadtmitte (Düsseldorf)“ in E2E eine Wegzeit hat und der Fixture-Ort **mindestens eine Zelle mit Linie** ergibt; sonst wäre das Linien-Gate (`withoutLines === cells`) auch im Fixture-Build rot (Review 2, m4). Das Zugangshalt-Gate läuft im Fixture-Build nicht (`build-data.ts:141`, `if (source === "real")`); S4 passt nur den Kommentar dort an (Review m8).
- Fixture-Daten gehen nie live (Invariante).

### E15 – ADR 0032 „Netze: Region außerhalb von Bayern und VGN“

Neues ADR 0032 als Datei `0032-netze-region-duesseldorf.md` in `docs/adr/` (Status „angenommen“ mit diesem Plan). Inhalt:

1. **Netz** als Ebene über der Region: Verbund, bbox (Gültigkeitsbereich), Kartenmitte, Ferienland. Jede Region-bbox liegt in ihrer Netz-bbox; Netz-bboxen überlappen nicht. Ersetzt ADR 0029, Punkt 1.
2. **Ein Fahrplanauszug und eine Wegzeit-Tabelle je Netz.** Ändert ADR 0011, Punkt 4 (Auszug je Netz, `data/oepnv/<netz>.json`) und ersetzt ADR 0029, Punkt 3 (Startgebiet: Stadtgebiete der Regionen **des Netzes** statt aller Regionen).
3. **Stadtwahl gespeichert** (`zwergenplan.stadt`). Liste, Karte, Kalender und Push zeigen nur das Netz der Stadt; Deep-Links, Detail und Merkliste alles. Ersetzt ADR 0029, Punkt 5 und den Satz in ADR 0025 (Nachtrag).
4. **Bewusste Ausnahme von „Kein Request hängt davon ab, ob etwas gespeichert ist“:** Die URL der Wegzeit-Tabelle und der Startausschnitt der Karte hängen am gewählten Netz (eins von zwei Gebieten). Begründung: Wer Düsseldorf wählt und die Karte öffnet, lädt Düsseldorfer Kacheln; der Kachel-Host erfährt das Gebiet dann ohnehin. Die Tabelle lädt aber auch ohne offene Karte (beim Start mit gespeichertem Startpunkt), dort ist die Auskunft an den eigenen Host neu; sie umfasst nur eins von zwei Gebieten (Review 2, m13). Die Tabelle beider Netze für alle zu laden, kostete jeden Nutzer etwa die doppelte Datenmenge, ohne dem eigenen Host etwas zu verbergen, was ein Dritter nicht sieht. Startpunkt, Stadtteil und Stadt innerhalb eines Netzes bleiben unverraten. Ändert ADR 0011, Punkt 6, ADR 0014, Punkt 4, ADR 0017, Punkt 4 (Laden beim Start) und Punkt 5 (Prüfung gegen die Netz-bbox statt `NUERNBERG_BBOX`) und die Kamera-Regel (ADR 0008).
5. **Ferien je Netz** (`DE-BY`, `DE-NW`).
6. **Lizenz VRR** CC BY 4.0 mit Hinweis auf Änderungen, Namensnennung wie ADR 0011, Punkt 5.

ADR 0011, 0014, 0017, 0025, 0029 bekommen je einen Verweis-Block „Geändert durch ADR 0032“. Ggf. Nachtrag ADR 0012 (Budget, E13).

## Nutzerentscheide

Entschieden am 2026-10-18 nach den Reviews:

- **Startbudget** (E13): `JS (initial)` von 102 auf **104 kB** anheben; Nachtrag ADR 0012 in S6.
- **Service-Worker-Budget** (nach S6a, 2026-10-18): von 9 auf **10,5 kB**. Gemessen 10,02 kB, weil der Service Worker für den Push gespeicherte Stadtteile (jetzt 103) über `districtById` auflöst und `REGIONS` braucht. Nachtrag ADR 0012 in S9.
- **Privatsphäre** (E15, Punkt 4): Die Ausnahme wird angenommen; geladen wird nur die Tabelle des gewählten Netzes.

- **Mockup** (E8, S7): Variante **A, Auswahlfeld „Stadt“** über dem Startpunkt im Kind-Sheet (Mockup https://claude.ai/artifact/XZ8yBj2iQ6yLgatS8LxFK1, Entscheid 2026-10-18). Onboarding mit drei Kacheln, Nürnberg vorgewählt.

Noch offen:

1. **Trockenlauf** des Bootstraps (S10): Abnahme der Kandidaten vor dem Live-Lauf.

## Dateien

| Datei | Änderung |
|---|---|
| `src/domain/regions.ts` | `NETWORK_IDS`, `Network`, `NETWORKS`, `Region.network`, `Region.municipality` (optional), Region `duesseldorf`, `networkOf`, `regionsOf`, `networkAt`; Kopfkommentar (E1, E2) |
| `src/domain/regions.test.ts` | Test 1 |
| `src/domain/geo.ts` | `inBounds` ohne Standardwert; Kommentare (E3) |
| `src/domain/geo.test.ts`, `src/data/geolocation.test.ts` | Aufrufe mit bbox |
| `src/domain/districts.ts`, `districts.test.ts` | Düsseldorfer Stadtteile (E13), Test 2 |
| `src/domain/district-groups.ts`, `.test.ts` | Gruppen nur des Netzes (E8) |
| `src/domain/camera.ts`, `.test.ts` | `home` aus dem Netz, Orte des Netzes (E8) |
| `src/domain/site-data.ts`, `.test.ts` | `network` je Angebot und Anbieter (E7) |
| `src/domain/schema.ts` | `Timetable`-Prüfung mit Netz-bbox; Kommentar ohne „VGN“ (E3, E4); `region`-Enum wächst → `pnpm schema:export` |
| `src/domain/stored-origin.ts`, `src/ui/origin-state.ts` | Netz-bbox (E3) |
| `src/domain/news.ts` bzw. `src/sw/push-tailor.ts`, Tests | Filter nach Netz, Tabelle des Netzes (E9) |
| `src/domain/transit-types.ts`, `src/domain/transit.ts` | unverändertes Format; ggf. Pfad-Hilfe `transitPaths(network)` |
| `src/data/preferences.ts` | Schlüssel `zwergenplan.stadt`, `loadCity`/`saveCity` (E8) |
| `src/data/transit.ts` | Pfade je Netz (E5) |
| `src/data/push.ts`, `src/data/device-store.ts` | Stadt im Spiegel (E9) |
| `src/data/geolocation.ts` | bbox-Parameter (E3) |
| `src/sw/routes.ts` | `TRANSIT_FILES` mit vier Pfaden (E5) |
| `src/ui/App.tsx`, `src/ui/use-app-state.ts`, `src/ui/use-transit.ts`, `src/ui/use-offer-views.ts` | Netz-Filter, Netzwechsel, Kartenmitte (E3, E5, E7, E8) |
| `src/ui/onboarding/OnboardingFlow.tsx`, `steps.tsx` | Vorauswahl, speichern, Stadtteile des Netzes (E8) |
| `src/ui/KidSheet.tsx`, `src/ui/OriginPicker.tsx` | Auswahl „Stadt“, Stadtteile des Netzes (E8) |
| `src/ui/karte/map-data.ts` | `initialCamera` mit Netz (E8) |
| `src/ui/map/MapView.tsx` | `lastCamera` bei Netzwechsel verwerfen (E8) |
| `src/ui/format.ts`, `format.test.ts` | Texte (E12) |
| `scripts/pipeline/lib/gtfs.ts`, `.test.ts` | `FEEDS`, Modi und Bedarfsverkehr je Feed, bbox je Feed, zeilenweise `stop_times` (E4) |
| `scripts/pipeline/io/gtfs.ts` | `resolve` (CKAN), Cache je Netz, gestreamtes Entpacken, Datei je Netz (E4) |
| `scripts/pipeline/lib/discover.ts`, `io/geocode.ts`, Tests | Gemeinde-Prüfung über `municipality` (E2) |
| `scripts/pipeline/cli.ts` | `oepnv --netz`, `holidays --netz`, `discover --netz` (E4, E6, E11) |
| `scripts/pipeline/io/holidays.ts`, `lib/holidays.ts`, Tests | Land als Parameter, Cache mit Land (E6) |
| `scripts/pipeline/io/nightly.ts`, `lib/build-offers.ts`, `lib/schedule.ts`, `io/extract.ts`, `lib/extract.ts`, `io/discover.ts`, `io/eval.ts`, Tests | Ferien je Netz (E6), `{region}` im Prompt (E10) |
| `scripts/pipeline/prompt/extract.md` | regionsneutral (E10) |
| `scripts/transit/table.ts`, `freshness.ts`, Tests | Präfix-Parameter, Frische je Netz (E4, E5) |
| `scripts/build-data.ts`, `scripts/lib/load-data.ts`, `scripts/validate-data.ts` | Tabellen und Gates je Netz, Auszug je Netz (E4, E5) |
| `scripts/lib/share-pages.ts` | Datenschutz-Text (E12) |
| `data/oepnv/fahrplan.json` → `data/oepnv/vgn.json`; neu `data/oepnv/vrr.json` | `git mv`; `pnpm pipeline oepnv --netz vrr` (E4) |
| `tests/fixtures/…` | Düsseldorfer Anbieter, Mini-Netz `vrr.json`, `oepnv/fahrplan.json` → `vgn.json` (E14) |
| `.size-limit.json` | Einträge je Netz; ggf. `JS (initial)` (E5, E13) |
| `.github/workflows/discover.yml` | zweiter Cron, `--netz` (E11) |
| `index.html`, `public/manifest.webmanifest` | Beschreibung (E12) |
| `schema/providers.schema.json` | `pnpm schema:export` |
| `scripts/lib/e2e-map.ts` | nur falls `e2e-map.test.ts` ein neues Modul ohne Spec meldet (Plan 0036: so geschehen) |
| `e2e/fixtures.ts` (E2E-Helfer) | Matcher `isTransitTable(url)` / `isTransitLines(url)` für `data/wegzeit/<netz>.json` bzw. `data/linien/<netz>.json` (Review M3) |
| alle Specs mit dem alten Pfad: `e2e/saved.spec.ts:261`, `startpunkt.spec.ts:285` u. a., `mobile-ux.spec.ts:339/368`, `anbieter-inhalt.spec.ts:72/89`, `perf.spec.ts:43`, `pwa.spec.ts:16-17`, `anbieter.spec.ts:469`, `karte.spec.ts:296`, `push.spec.ts` | auf die Matcher umstellen; `grep -rn "wegzeit.json\|linien.json" e2e scripts src README.md` ist danach leer bis auf den Kanarientest |
| `scripts/screenshots.ts`, `src/sw/routes.test.ts` | neue Pfade |
| `README.md` | neue Pfade und **Lizenzabschnitt**: VRR, CC BY 4.0, „abgewandelt“, neben VGN (Review 2, m9) |
| `e2e/onboarding.spec.ts`, `startpunkt.spec.ts`, `karte.spec.ts`, `push.spec.ts`, `smoke.spec.ts`, `mobile-ux.spec.ts`, `anbieter.spec.ts`, `saved.spec.ts` | Test 7 |
| `docs/adr/0032-…` neu, ADR 0008, 0011, 0012, 0014, 0017, 0025, 0029 | E15 |
| `docs/architecture.md` | Datenfluss (Auszüge je Netz), Invarianten Privatsphäre (Schlüssel `stadt`, Ausnahme E15, Kamera), „Kein Request hängt …“ |
| `docs/ideas.md` | „Weitere Regionen“, „Stadtwahl speichern“, „`offers.json` je Region teilen“ umschreiben |
| `.claude/skills/babyevents-nuernberg/SKILL.md` | Abschnitt 6 (Region in neuem Netz: Netz-Eintrag, Feed, Ferien), 7 (`oepnv --netz`), 1 (zwei Entdecken-Läufe) |
| `CLAUDE.md` | Satz 1; `data/oepnv/fahrplan.json` → `data/oepnv/<netz>.json` |

## Tests (test-first für Domäne und Pipeline)

1. **`regions.test.ts`** (zuerst rot):
   - Jede Region-bbox liegt in der bbox ihres Netzes; die Netz-bboxen überlappen nicht.
   - Reihenfolge-Regel aus ADR 0029 weiter (verschachtelte bboxen).
   - Düsseldorf: Rathaus (51,226 / 6,773) und die vier Ecken der Stadtgrenze liegen in `REGIONS.duesseldorf.bbox`; Köln-Chorweiler (51,02 / 6,9) weder in der Regions-bbox noch in `VRR_BBOX`. `lib/discover.test.ts`: Ein Kandidat mit Ort Neuss Hbf (in der bbox, Geocoding `city: Neuss`) wird für `duesseldorf` verworfen („kein Ort in der Region“), für eine Region ohne `municipality` nicht. Ebenso verworfen: ein Ort ohne Gemeinde (Grund „Gemeinde unbekannt“) und eine Koordinaten-Adresse.
   - `networkAt` für Hauptmarkt Nürnberg → `vgn`, Rathaus Düsseldorf → `vrr`, Köln Dom (50,941 / 6,958) → `undefined`.
   - `regionsOf("vgn")` = `["fuerth", "nuernberg"]`; `regionList` über die Regionen eines Netzes.
   - `kreis` fünfstellig und eindeutig; `population` wie bisher.
2. **`districts.test.ts`, `district-groups.test.ts`:** Anzahl je Region; IDs eindeutig, Präfix `duesseldorf-`; Namen über alle eindeutig; jeder Punkt in der bbox seiner Region; `districtGroups("duesseldorf")` enthält nur Düsseldorf, `districtGroups("fuerth")` Fürth vor Nürnberg und kein Düsseldorf.
3. **`site-data.test.ts`:** `network` je Angebot aus der Region des Anbieters; `anbieter.json` ebenso.
4. **`camera.test.ts`:** ohne Orte `home` des Netzes; mit Orten nur die des Netzes.
5. **Pipeline:**
   - `lib/holidays.test.ts`: Filter auf `DE-NW` lässt bayerische Einträge weg und umgekehrt.
   - `lib/build-offers.test.ts`: Ein Anbieter mit `skipHolidays` in Düsseldorf fällt an einem NRW-Ferientag aus, an einem bayerischen nicht; für Nürnberg umgekehrt.
   - `lib/gtfs.test.ts`: Inline-Feed mit `route_type` 106/109/405 (→ `bahn`) und einer Bedarfsfahrt nach VRR-Regel; bbox je Feed; zeilenweises Lesen von `stop_times` ergibt denselben Auszug wie das alte Lesen eines Strings.
   - `io/gtfs.test.ts` (ohne Netz, Fake-`fetch`): `resolve` wählt aus einer CKAN-Antwort die jüngste ZIP-Ressource.
   - `scripts/transit/table.test.ts`: `tableRows` mit Präfixen nur eines Netzes.
   - `build-data`-Gates (reine Funktion, etwa `transitGates(stats, network)`): Ein Netz ohne Orte (0 Zellen) ergibt eine Warnung statt Rot; ein Netz mit Orten und lauter Zellen ohne Linie bleibt rot (Review B1).
   - `lib/extract.test.ts`: `{region}` wird ersetzt; kein `{region}` bleibt im Prompt.
6. **Browser-Domäne:** `format.test.ts` (Texte E12 je Netz); `push-tailor.test.ts` bzw. `news.test.ts` (Filter nach Netz, `seenIds` über alle); `stored-origin.test.ts`, `origin-state.test.ts` (Punkt außerhalb des gewählten Netzes ⇒ kein Startpunkt).
7. **E2E:**
   - `onboarding.spec.ts`: drei Kacheln (Düsseldorf, Nürnberg gewählt, Fürth); Düsseldorf wählen → Weg-Schritt nur mit Düsseldorfer Stadtteilen; „Stadtmitte (Düsseldorf)“ wählen → Minuten-Chips aktiv, Liste zeigt nur Düsseldorfer Fixture-Angebote, `zwergenplan.stadt` = `duesseldorf`.
   - `startpunkt.spec.ts`: Netzwechsel im Kind-Sheet löscht einen Nürnberger Stadtteil, lädt `wegzeit/vrr.json` genau einmal, keine weiteren Requests ab der Wahl eines Startpunkts. Ohne gespeicherte Stadt wird `wegzeit/vgn.json` geladen.
   - `karte.spec.ts`: Startausschnitt über Düsseldorfer Orte bei Düsseldorf.
   - `push.spec.ts`: mit gespiegelter Stadt Düsseldorf zählt die Nachricht nur Düsseldorfer Angebote und lädt `wegzeit/vrr.json`.
   - `smoke.spec.ts`: Quellenhinweis je Netz.
   - **Kanarientest** (Review M3): Der Matcher trifft den tatsächlich geladenen Tabellen-Request (Zähler > 0 mit gespeichertem Stadtteil), und `data/wegzeit.json` bzw. `data/linien.json` wird nie angefragt. Ohne ihn würden umgezogene Datenschutz-Prüfungen („keine Requests ab der Wahl“) leer grün.
   - `mobile-ux.spec.ts`: Kind-Sheet mit Auswahl „Stadt“ und Onboarding mit drei Kacheln: `expectMobileUx` hell und dunkel, quer und bei 320 px/200 %; das `<select>` hat mindestens 16 px Schrift (Review m15).
8. **Gates:** `pnpm verify` grün (Schema-Drift nach `pnpm schema:export`, `data:validate` mit beiden Auszügen, knip); `pnpm size` mit den neuen Einträgen.

## Schritte

Arbeit direkt auf `main` im Haupt-Checkout, kleine Commits, jeder Schritt erst fertig mit `pnpm verify` grün. Teilschritte mit klarer Schnittstelle (S2, S3, S8) laufen als Subagenten (Nutzerwunsch) in eigenen Worktrees auf **lokalen** Branches, **ohne Push** (Review m12: der echte Build ist bis S4 rot); sie melden Branch und SHA, die Haupt-Session bringt sie per Fast-Forward bzw. Rebase nach `main`, beobachtet die CI und spricht mit dem Nutzer. Gepusht wird erst nach S9 und dem Mockup-Feedback (S7).

- **S1 Domäne Netze und Stadtteile:** Tests 1 und 2 rot, dann `regions.ts`, `districts.ts` (der `Record` verlangt die Stadtteile mit der Region), `district-groups.ts`, `geo.ts`, alle `inBounds`-Aufrufer (E3), `pnpm schema:export`. Der echte Build ist bis S4 rot (Düsseldorfer Stadtteile ohne VRR-Tabelle, wie Plan 0036 zwischen S1 und S2); nicht pushen.
- **S2 Ferien je Netz** (Subagent): Test 5 (Ferien) rot, dann E6.
- **S3 Fahrplan je Netz** (Subagent): Test 5 (gtfs) rot, dann E4; `git mv` des VGN-Auszugs; `pnpm pipeline oepnv --netz vrr` schreibt `data/oepnv/vrr.json`. Messen: Größe, Steige, Fahrten, Laufzeit; Werte in „Umsetzung“.
- **S4 Wegzeit je Netz:** Test 5 (table, Gates ohne Orte) rot, dann E5 im Build; `pnpm data:build` mit echten Daten: Linien-Gates für `vgn`, Zugangshalt-Gate für alle Stadtteile, Warnung „ohne Orte“ für `vrr`. `vgn`-Tabelle so groß wie vorher. Die VRR-Größe misst S11.
- **S5 entfällt** (in S1 aufgegangen); das Zugangshalt-Gate gegen die VRR-Tabelle prüft S4.
- **S6 Browser:** Tests 3, 4, 6 rot, dann E7, E8 (ohne Kind-Sheet-Umschalter), E9, E12, Fixtures E14. `pnpm build && pnpm size` (misst `dist/`, braucht Chromium für die Kachelbilder; Review 2, m3); `pnpm e2e:local --affected` und `pnpm e2e:local --affected --smoke` (Review m14; `smoke.spec.ts` prüft den Quellenhinweis aus der echten Tabelle), je mit `run_in_background`.
- **S7 Mockup** des Kind-Sheets (E8) dem Nutzer zeigen; **erst nach Feedback** den Umschalter bauen.
- **S8 Prompt** (Subagent): E10, `pnpm eval` (Kosten vorher nennen), Zeile in `evals/results.md`.
- **S9 E2E, Doku, Reviews:** Test 7 mit `pnpm e2e:local --affected` (Fixtures machen die Auswahl voll; ausdrücklich `e2e/onboarding.spec.ts e2e/startpunkt.spec.ts e2e/karte.spec.ts e2e/push.spec.ts e2e/mobile-ux.spec.ts`, `run_in_background`), dazu `pnpm e2e:local e2e/saved.spec.ts e2e/anbieter.spec.ts e2e/pwa.spec.ts` und `pnpm e2e:local --affected --smoke` (Review 2, m11). Doku (ADR 0032 und Verweise, Architektur, Skill, Ideen, CLAUDE.md). `/browser-review` lokal (volle Checkliste plus: drei Kacheln; Düsseldorf → Weg; Kind-Sheet mit Stadt-Auswahl und Netzwechsel; Karte über Düsseldorf; Texte bei Startpunkt außerhalb; Quellenhinweis VRR). `/arch-review` (neues Konzept, Schemaänderung, weit über 200 Zeilen).
- **S10 Trockenlauf Bootstrap** (Freigabe vor dem Lauf, ≈ $0,50–1,00, 15–40 Min.): `pnpm pipeline discover --region duesseldorf --bootstrap --dry-run`. Bericht an den Nutzer (aufgenommen mit Name, Fund-URL, erstem Angebot; Funde aus Neuss usw.; Kosten). Erst nach Abnahme weiter.
- **S11 Push und live:** `git pull --rebase`, Push, CI auf `main` grün, `meta.json` = HEAD. Dann `gh workflow run nightly.yml -f modus=live -f max_tokens=5000000` (Prompt neu, E10), danach `gh workflow run discover.yml -f region=duesseldorf -f bootstrap=true -f modus=live`, nach dessen Ende noch einmal `gh workflow run nightly.yml -f modus=live`. `/browser-review live`. Danach messen: Größe von `site.json` (E7), `wegzeit/vrr.json` und `linien/vrr.json` (Abbruch und Rückfrage über 60 kB gzip), Anteil ohne Linien gegen `MAX_WITHOUT_LINES` (eigener Commit, falls ein Wert je Netz nötig ist).
- **S12 Archiv:** nach dem ersten Samstagslauf (E11): Restpunkte nach `docs/ideas.md`, Statuszeile, `git mv`.

## Verifikation

- `pnpm verify` grün; die E2E-Specs aus S9 grün; CI auf `main` grün; `commit` in https://zwergenplan.app/data/meta.json = `git rev-parse --short HEAD`.
- Live: `data/wegzeit/vgn.json` hat so viele Zeilen wie vorher `wegzeit.json`; `data/wegzeit/vrr.json` hat rund 609 Zeilen (Wert aus S4), beide unter 120 kB gzip, die Linien unter 72 kB (Plan 0051).
- Live: Kachel bzw. Auswahl „Düsseldorf“, „Stadtmitte (Düsseldorf)“ → Statuszeile „Wegzeit ab Stadtmitte (Düsseldorf)“, Karten „ca. … Min. mit Bus & Bahn“, Liste nur Düsseldorfer Angebote, Kind-Sheet nennt den VRR als Quelle.
- Live: Ein Bestandsprofil (gespeicherter Nürnberger Stadtteil, kein `zwergenplan.stadt`) sieht alles wie vorher.
- Entdecken: Bericht des Bootstraps „Region Düsseldorf: n neu“; jeder neue Anbieter ein eigener Commit `data: neuer Anbieter <id> (duesseldorf)`; `data/discover/duesseldorf.json` existiert.

## Risiken

- **Startbudget** (E13): ohne Nutzerentscheid rot.
- **Neuextraktion aller Anbieter** (E10): eine teure Nacht (≈ $0,60) und ein kurzer Einbruchschutz-Effekt, falls das Modell auf den neuen Prompt anders antwortet. Eval vorher (S8).
- **VRR-Feed ist „Beta“** und erscheint unregelmäßig. Die Frische-Warnung erinnert; ein fehlender Monat ist unschädlich, solange der Auszug gültig ist (Feed gültig bis 28.02.2027).
- **Speicher beim Auszug** (E4): Der gestreamte Weg ist neu; Test 5 sichert ihn gegen das alte Ergebnis am VGN.
- **Datenschutz-Ausnahme** (E15): Sie muss im öffentlichen Datenschutz-Text stehen.
- **Leere Düsseldorf-Kachel** zwischen Push und Bootstrap/Nachtlauf (Stunden). Bei einem schwachen Trockenlauf (weniger als fünf Anbieter) fragt S10 den Nutzer, ob die Kachel trotzdem live geht.
- **Kosten Entdecken** steigen um den Samstagslauf (E11).
- **Nachbarstädte in der bbox** (E2): Neuss, Ratingen, Hilden, Erkrath und Meerbusch-Büderich liegen im Rechteck. Das Entdecken verwirft sie über `municipality`; ein Fehler des Geocodings (falsche oder fehlende Gemeinde) ließe einen Ort durch oder fiele weg. Der Trockenlauf zeigt beides; Abhilfe ist `abgelehnt` bzw. Katalogpflege.

## Umsetzung (2026-10-18)

Stand nach S1–S4, S6a und S8 (Branch `plan-0039`, lokal, nicht gepusht); S6b (Onboarding-Kacheln, Auswahlfeld „Stadt“ im Kind-Sheet nach Mockup A, Texte, Leerzustand, Datenschutz-Text) läuft parallel. Doku aus S9 mit ADR 0032 (`docs/adr/0032-netze-region-duesseldorf.md`). Wo der Code vom Plan abweicht, gilt der Code; die Abweichungen stehen unten.

### Messwerte

- **S1:** 50 Düsseldorfer Stadtteile (die 49 OSM-`suburb`-Punkte der Tabelle in E13 plus Hubbelrath, siehe Abweichungen), zusammen 103 mit den 53 aus Nürnberg und Fürth. `schema:export` für das Enum `region`.
- **S3:** `data/oepnv/vrr.json` aus „VRR-Soll-Daten vom 15.10.2026“ (gültig 01.09.2026–28.02.2027), Referenztag **Di 03.11.2026** (NRW-Ferien), 4 574 Steige, 4 605 Fahrten, **1 528 kB roh, 289,8 kB gzip**; Laufzeit 17,2 s, Spitze **1,86 GB RSS**. Mehr als die 2 562 Steige und ≈ 1,02 MB der Ausgangslage, weil der Auszug auf `VRR_BBOX` (Stadt plus etwa 3 km Rand) zuschneidet, nicht auf die Stadt-bbox; ebenso liegt der Speicher über den gemessenen ≈ 1,4 GB. `data/oepnv/fahrplan.json` ist per `git mv` jetzt `data/oepnv/vgn.json`.
- **S4:** echter Build: `vgn` 747 Zeilen × 82 Orte, **60 688 B gzip** (wie vorher); `vrr` 609 Zeilen × 0 Orte mit der Warnung „Netz vrr ohne Orte – Linien-Gates übersprungen“. Zugangshalt-Gate für alle 53 VGN- und 50 Düsseldorfer Stadtteile grün.
- **S6a:** `pnpm build && pnpm size`: `JS (initial)` vor S6a 102,59 kB, nach S6a **103,22 kB** von 104 kB; Service Worker **10,02 kB** (Budget nach Nutzerentscheid 10,5 kB); `site.json` **113,38 kB gzip** von 250 kB (echte Daten, noch ohne Düsseldorfer Anbieter). Nachtrag in ADR 0012.
- **S8:** `pnpm eval` mit Haiku auf den Prompt mit `{region}` (Hash `0e9f8910c248`): **11 von 12 Fällen**, $0,33, 2 016 s; `die-familienbox` brach mit „Ausgabe abgeschnitten“ ab (im Nachtlauf fängt der Fallback Sonnet das ab), die übrigen Fälle ohne Rückschritt. Wiederholung nach Nutzerentscheid nicht nötig. Kursolino (einziger Anbieter: Schwimmschule Ohana) hat keinen Standort in Düsseldorf; die Präfixe stehen in `references/booking-systems.md` des Skills.

### Abweichungen vom Plan

- **E8, Angebote anderer Netze:** kein neuer `ReachMode` `"anderes-netz"`. Die Entfernungszeile kommt aus `elsewhereText` (`src/ui/format.ts`), gereicht über `CardContext.elsewhere` (`src/ui/OfferCard.tsx`); das Detail unterdrückt dann den Ladezustand der Wegzeit. Die Wegzeit-Typen bleiben unberührt.
- **E8, Netzwechsel:** `switchCity` ist der Hook `useSwitchCity` (mit `useCity`) in `src/ui/use-app-state.ts`. `useTransit` hält die Zustände je Netz über `networkTransitReducer` (`src/ui/use-transit.ts`); „höchstens einmal je Sitzung“ gilt je Netz.
- **E5, Gates:** als reine Funktionen in `scripts/transit/gates.ts` (`transitGates`, `accessIssues`), nicht in `build-data.ts`; `TRANSIT_WARN_SECONDS` und `MAX_WITHOUT_LINES` stehen dort. S4 schrieb übergangsweise zusätzlich die alten Pfade `data/wegzeit.json` und `data/linien.json`; S6a hat diese Kopie und ihre Budgets wieder entfernt.
- **E13, Hubbelrath:** als 50. Stadtteil aufgenommen, Punkt aus der `suburb`-Fläche (51,258 / 6,908), mit Zugangshalt.
- **E13, Budgets:** zusätzlich zum Startbudget (104 kB) hat der Nutzer das Budget des Service Workers von 9 auf 10,5 kB angehoben (Nutzerentscheide).
- **E10:** In den Cache-Schlüssel der Extraktion geht der für den Anbieter ausgefüllte Prompt (`lib/refresh.ts`), `promptHash` für Evals und `data:validate` bleibt über der Vorlage. Der Text ändert sich auch für Nürnberg und Fürth (Sammelkalender-Zeile, Kursolino); die erste Nacht danach extrahiert also wie geplant alle Anbieter neu.
- **E6:** Die Ferien gehen nicht in den Cache-Schlüssel der Extraktion ein (geprüft in S2); ein Test dafür war daher nicht nötig. S3 nutzte bis zum Zusammenführen mit S2 einen Übergangshelfer für die NRW-Ferien.
- **E11:** Der Workflow ordnet Netz und Tag über `github.event.schedule` zu, ein unbekannter Cron ist rot; `workflow_dispatch` hat die Eingaben `netz` und `region` (nicht beide zugleich).

### Offen

- S6b fertigstellen und nachmessen (Startbudget, Mobile-UX des Auswahlfelds); S9: E2E nach Plan, `/browser-review` lokal, `/arch-review`.
- S10 Trockenlauf des Bootstraps mit Abnahme durch den Nutzer; S11 Push, Neuextraktion, Bootstrap live, Messung von `site.json`, `wegzeit/vrr.json`, `linien/vrr.json` und `MAX_WITHOUT_LINES` für `vrr`; S12 nach dem ersten Samstagslauf.

## Review (2026-10-18) – Verdict: Überarbeiten

Unabhängiger Review (`plan-reviewer`) auf den Entwurf. Alle Punkte übernommen, keiner abgelehnt.

- **B1 übernommen:** Linien-Gates je Netz nur mit Orten, sonst Warnung (Test 5); VRR-Messung und Eichung von `MAX_WITHOUT_LINES` nach S11. S4 prüft nur `vgn` und den Zugangshalt (E5, S4, S11).
- **M2 übernommen:** Das Rechteck enthält ganze Nachbarstädte. Neues Region-Feld `municipality` mit Gemeinde-Prüfung beim Aufnehmen; Test 1 korrigiert, Risiko ehrlich benannt (E2, Test 1, Risiken).
- **M3 übernommen:** Matcher `isTransitTable`/`isTransitLines` in `e2e/fixtures.ts`, alle Specs mit dem alten Pfad in der Dateitabelle, Kanarientest (Dateien, Test 7).
- **M4 übernommen:** bbox wird an `requestPosition` übergeben; `loadCity` prüft nur die Form (E3, E8).
- **M5 übernommen:** Anbieter-Tab gefiltert, gemerkte Anbieter immer sichtbar (E8).
- **M6 übernommen:** `allOffers`/`offers` im Datenfluss; Angebote anderer Netze zeigen „in <Stadt>“ statt Entfernung, neuer `ReachMode` (E8).
- **M7 übernommen:** Offline-Zustand nach Netzwechsel und Leerzustand „Netz ohne Angebote“ mit Tests (E8).
- **m8 übernommen:** Zugangshalt-Gate läuft im Fixture-Build nicht; E14 korrigiert.
- **m9 übernommen:** ADR 0032, Punkt 4 nennt ADR 0017, Punkt 4 und 5.
- **m10 übernommen:** Reihenfolge Stadt → Tabelle im Service Worker mit Test; allgemeine Push-Fassung als bewusste Lücke (E9).
- **m11 übernommen:** Hubbelrath in S1 per Overpass prüfen (E13).
- **m12 übernommen:** Subagenten-Branches lokal ohne Push bis S9 (Schritte).
- **m13 übernommen:** Alte Kopien in `zp-data` beim `activate` löschen (E5).
- **m14 übernommen:** E2E `--affected` und `--smoke` in S6.
- **m15 übernommen:** `expectMobileUx` quer und 320 px/200 %, Select ≥ 16 px (Test 7).

## Review 2 (2026-10-18) – Verdict: Freigabe mit Änderungen

Neuer `plan-reviewer` auf die überarbeitete Fassung. Keine Blocker; B1 trägt (ein Netz ohne Orte ergibt eine leere Tabelle, die `decodeTransitTable` annimmt). Alle Punkte übernommen, keiner abgelehnt.

- **M1 übernommen:** `switchCity` als gemeinsame Stelle für Onboarding und Kind-Sheet; Laden je Netz und Sitzung; `refresh` mit Pfad des Netzes; E2E (E8).
- **M2 übernommen:** `GeoResult.municipality`, Cache `geocode-v2.json`, unbekannte Gemeinde wird verworfen, Tests (E2, Test 1).
- **m3–m14 übernommen:** `pnpm build && pnpm size` statt Fixture-Build; Fixture-Netz mit mindestens einer Linienzelle; Willkommenszahl nach angetippter Kachel; Ortsangaben `ReachMode` und `map-data.ts`; ADR 0029, Punkt 3 als ersetzt; CKAN-Auswahl mit Dateiname und Inhaltsprüfung; README-Lizenzabschnitt; Laufzeit-Warnung je Netz; zusätzliche E2E-Specs in S9; Leerzustand für Karte, Kalender, Statuszeile; Privatsphäre-Begründung eingeschränkt; Startbudget-Entscheid vor S1.

## Browser-Review lokal (2026-10-18)

Fixture-Build (`dist-e2e/`, Stand d7a8fbd), Preview auf freiem Port. `node scripts/screenshots.ts <URL>` mit allen Ansichten (228 Bilder, sechs Viewports hell und dunkel, alle als Montage je Ansicht angesehen, Auffälliges einzeln) und ein Playwright-Skript für die Düsseldorf-Pfade auf `Pixel 7` (Chromium) und `iPhone 15` (WebKit), je hoch und quer, hell und dunkel, dazu 320 × 640 auf beiden Engines (100 Bilder). claude-in-chrome war nicht verbunden; die Interaktion lief ersatzweise im Skript. Bilder unter `e2e/.artifacts/screens/` und `e2e/.artifacts/screens/ddf/` (nicht versioniert).

**Zusatzzeilen (S9)**

- **Onboarding, drei Kacheln**: „Düsseldorf“, „Nürnberg“ (vorgewählt, `aria-pressed=true`, Haken), „Fürth“ auf beiden Geräten in allen acht Varianten; quer in einer Reihe, bei 320 px untereinander (273 × 59 px). Die Lead-Zahl wechselt beim Antippen von „8 … von 5 Anbietern“ auf „2 … von 1 Anbieter“ (`onb-stadt-*`, `onb-stadt-ddf-*`). Bei 360 und 365 px bricht „Düsseldorf“ mitten im Wort um, siehe Befunde.
- **Weg mit Düsseldorf**: eine `optgroup` „Düsseldorf“ mit 50 Einträgen, keine Nürnberger Stadtteile. „Stadtmitte (Düsseldorf)“ gibt die Minuten-Chips frei, kein Hinweis „außerhalb“ (`onb-weg-ddf-*`, `onb-weg-stadtmitte-*`). Die geschlossene Auswahl kürzt auf Pixel und iPhone hoch auf „Stadtmitte (Düsseld…“, wie bei Fürth.
- **Liste mit Düsseldorf**: nur „Krabbelgruppe am Rhein“ und „Rheinzwerge-Liederkonzert“, Statuszeile „2 Angebote ab heute · Wegzeit ab Stadtmitte (Düsseldorf)“, „10 Min.“ an den Karten (`liste-ddf-*`).
- **Kind-Sheet, Abschnitt „Eure Stadt“**: steht über „Wegzeit ab“. Reihenfolge der Überschriften: Eure Stadt, Wegzeit ab, Darstellung, Als App. Optionen „Düsseldorf, Nürnberg, Fürth“, Schrift 17 px (≥ 16 px, kein iOS-Zoom). Der Hinweis hat bei 320 px drei Zeilen (59 px, Chromium) bzw. zwei Zeilen (WebKit), sonst zwei bzw. quer eine. Die Abstände entsprechen denen der übrigen Abschnitte (`kind-stadt-ddf-*`, `kind-*`).
- **Netzwechsel bei offenem Sheet** (Nürnberg mit Gostenhof → Düsseldorf): Der Startpunkt ist weg („Noch kein Startpunkt – …“). Der Fokus bleibt auf „Stadt“. Die Lage der Auswahl ist unverändert (y gleich, Scroll des Sheets gleich, auch quer bei `sheet-scroll` 219 bzw. 243). Danach stehen 50 Düsseldorfer Stadtteile zur Wahl, nach „Fertig“ lautet die Statuszeile „2 Angebote ab heute“ (`kind-wechsel-vorher-*`, `kind-wechsel-nachher-*`).
- **Quellenhinweis VRR**: Ohne geladene Tabelle (Tabelle per Route blockiert) steht „Fahrplan: VRR – Verkehrsverbund Rhein-Ruhr AöR, CC BY 4.0.“ mit beiden Links (`kind-vrr-fallback-pixel-*`). Mit geladener Fixture-Tabelle steht deren Quelle „Fiktiver Fahrplan Düsseldorf für Tests, CC0 1.0“. Die echte VRR-Zeile prüft `/browser-review live`.
- **Merkliste mit Angebot des anderen Netzes**: Mit Düsseldorf zeigt „Offener Krabbeltreff“ „in Nürnberg“, „Krabbelgruppe am Rhein“ „10 Min.“. Mit Nürnberg zeigt „Krabbelgruppe am Rhein“ „in Düsseldorf“, der Krabbeltreff „15 Min.“ (`merkliste-ddf-*`, `merkliste-nbg-*`).
- **Karte über Düsseldorf**: „2 Angebote an 1 Ort“, Mitte 51,219 / 6,796 auf dem Familienzentrum Rheinzwerge, nur dessen Marker (`karte-ddf-*`). Kartenmitte nach Nürnberg geschoben, dann „Kartenmitte als Startpunkt“: Toast „Die Kartenmitte liegt außerhalb von Düsseldorf.“ (`karte-toast-*`).
- **Leerzustand** (`site.json` ohne `vrr` per Route): „In Düsseldorf haben wir noch keine Angebote. Wir suchen gerade danach.“, „0 Angebote ab heute“. Die Karte zeigt „0 Angebote an 0 Orten“ über dem Düsseldorfer Startausschnitt (`leer-liste-*`, `leer-karte-*`).
- **Standort außerhalb** (Standort in Nürnberg, Stadt Düsseldorf): „Dein Standort liegt außerhalb von Düsseldorf. Wähle einen Stadtteil oder eine andere Stadt.“ Kein Startpunkt gesetzt (`standort-aussen-*`).
- **Anbieter-Tab**: Mit Düsseldorf steht dort nur „Rheinzwerge Beispiel (fiktiv)“ („1 Anbieter mit 2 Angeboten“), mit Nürnberg stehen die sechs Nürnberger Zeilen ohne ihn (`anbieter-ddf-*`, `anbieter-nbg-*`).
- **Konsole**: keine Fehler der App. Es gab nur Meldungen der Testumgebung: WebGL-„GPU stall“ (Chromium headless), „Image wood-pattern could not be loaded“ (Kachel-Mock-Stil, WebKit) und `net::ERR_FAILED` der absichtlich blockierten Tabelle.

**Checkliste**

- Lesbarkeit: Kacheln, „Eure Stadt“ und „Wegzeit ab“ sind klar gestaffelt, Kontrast hell und dunkel gut. „in Düsseldorf“/„in Nürnberg“ steht fett wie die Minuten, was, wann, wo bleibt in 2 s erfassbar. Ausnahme ist die Kachel bei 360/365 px (Befund 1).
- Daumen-Erreichbarkeit: Kacheln und Stadt-Auswahl liegen im mittleren Bereich, „Weiter“/„Fertig“ unten, unverändert. Bei 320 px liegt die dritte Kachel unter der Falz; der Schritt scrollt, „Los geht's“ bleibt erreichbar (Befund 3).
- Zustände: leer (eigener Leerzustand), außerhalb (Standort, Kartenmitte), anderes Netz in der Merkliste und lange Stadtteilnamen in der Auswahl brechen nicht. Abgeschnitten wird nur die geschlossene Auswahl „Stadtmitte (Düsseld…“ im Weg-Schritt; der volle Name steht in Statuszeile und Kind-Sheet.
- Dark Mode: keine grellen Inseln. Gewählte Kachel und Auswahl in `--sel`, Fehlerkasten „außerhalb“ gedämpft rot.
- Micro-Interactions: Die Kachel zeigt den gedrückten Zustand über `aria-pressed` (Füllung und Haken), die Auswahl hat einen sichtbaren Fokusring. Die Bilder mit `reduce` sind ohne Animation, der Toast erscheint ohne Sprung.
- Konsistenz: Kacheln, Auswahlfeld, Leerzustand und Toast nutzen die vorhandenen Bausteine.

**Befunde**

1. **Mittel**: Auf 360 und 365 px (häufige Android-Breiten) bricht die Kachel „Düsseldorf“ mitten im Wort zweizeilig um, „Düsseldor“ / „f“ (`e2e/.artifacts/screens/onboarding-1-360-light.png`, `onboarding-1-365-*`, hell und dunkel). Ursache: `.onb-tiles` mit `minmax(min(100%, 9rem), 1fr)` legt zwei Spalten à etwa 150 px an, in die Punkt und Name nicht passen (`src/ui/onboarding/onboarding.css:269–281`). Auf 320 px (eine Spalte) und ab 390 px (iPhone, Pixel) passt der Name. Kein Blocker, sollte aber vor dem Push behoben werden.
2. **Niedrig**: Statuszeile auf `Pixel 7` hoch dreizeilig, „(Düsseldorf)“ allein in Zeile 3 (`ddf/liste-ddf-pixel-hoch-light.png`), wie schon bei Fürth (Plan 0036).
3. **Niedrig**: Onboarding bei 320 px: Die dritte Kachel „Fürth“ und „Los geht's“ liegen unter der Falz (`onboarding-1-320-*`). Mit zwei Kacheln war das knapp sichtbar; der Schritt scrollt.
4. **Niedrig**: Nach dem Netzwechsel im Kind-Sheet verschwindet der Startpunkt unterhalb der Falz, ohne Hinweis im sichtbaren Bereich (`ddf/kind-wechsel-nachher-iphone-hoch-light.png`). Der Fokus bleibt richtig auf „Stadt“. Ein kurzer Text unter der Auswahl wäre eine Idee für `docs/ideas.md`.
5. **Niedrig**: Der Fokusring der Stadt-Auswahl liegt fast an der Beschriftung „Stadt“ (`ddf/kind-wechsel-nachher-iphone-hoch-light.png`). Überschrift „Eure Stadt“ und Beschriftung „Stadt“ doppeln sich; so ist es im Mockup A entschieden.

## Zwischenstand und Übergabe (2026-10-18, Session-Ende)

**Nicht live.** Nichts aus S1–S9 ist gepusht. Der Nutzer hat nach dem Trockenlauf (S10) angehalten: „Nur 4 Anbieter? Also vmtl nur eine Handvoll Angebote? … eine frische Session soll weitermachen und das Grundproblem lösen.“ Live auf `main` sind nur der Plan selbst (6348b6b, f650aac) und ein davon unabhängiger Testfix (da888f1).

### Wo der Stand liegt

- **Branch `plan-0039`** (lokal, nicht gepusht), Worktree `.claude/worktrees/plan-0039`, Spitze 49074e4 plus dieser Commit; 24 Commits vor `origin/main` (Stand 2026-10-18 nachmittags). Lineare Historie: S1 → S2 → Entdecken → S3 → S4 → S8 → Eval → S6a → Budget SW → Doku → S6b → Browser-Review → `llm.ts`-Fix → Arch-Review-Fixes → Eval neu.
- Alle `plan-0039-*`-Branches (`-s1`, `-s2`, `-s3`, `-s4`, `-s6a`, `-s6b`, `-s8`, `-disc`, `-docs`, `-arch`) und ihre Worktrees unter `.claude/worktrees/agent-*` sind in `plan-0039` aufgegangen und können weg (`git worktree remove …`, `git branch -D …`; zwei Worktrees sind „locked“).
- `pnpm verify` grün, `pnpm data:build` (echt) grün, `pnpm build && pnpm size` grün, E2E gezielt grün (Details in den Commits und in „Umsetzung“). Arch-Review: alle Befunde behoben (Commits e128bbf … c0efe8a). Browser-Review lokal: Abschnitt oben, mittlerer Befund (Kachelumbruch 360 px) behoben.
- **Vor einem Push:** `git fetch && git rebase origin/main` (Nachtlauf und Entdecken committen täglich `data/` auf `main`; Konflikte möglich in `data/offers.json`, `data/raw/`, `data/kosten.csv` – immer die Fassung von `main` nehmen und `pnpm pipeline nightly --build-only` statt Hand-Merge). Danach volle CI auf `main` beobachten.
- **Achtung beim Push:** `discover.yml` hat dann den Samstags-Cron für `vrr`. Steht die Repo-Variable `ENTDECKEN_MODUS` auf `live`, nimmt der erste Samstag Düsseldorfer Anbieter ohne weitere Abnahme auf.

### Was der Trockenlauf gezeigt hat (Grundproblem)

Lauf 2 (`runs/2026-10-18/discover/` im Worktree, 25 Min., $1,07, 69 Aufrufe): 10 Suchbegriffe → 53 Kandidaten → **4 würden aufgenommen** (Geburtshaus Düsseldorf, Hebamme Nina Krügel, YogaKitchen Oberkassel, Kinderschutzbund), 44 verworfen, 5 nicht bewertet. Zum Vergleich: Fürth-Bootstrap 8 Anbieter; Nürnberg hat 83, aber die stammen überwiegend aus der ursprünglichen Agenten-Recherche (Plan 0002, Skill) und aus drei Sammelkalender-Adaptern (`stadt-vk`, `frankenkids`, `evtermine`), nicht aus dem wöchentlichen Entdecken.

Verwerfungsgründe (Auszählung des Berichts):

| Grund | Portal-Fund | eigene Seite |
|---|---|---|
| keine aktuellen Termine (meist abgelaufene Einzel-PDFs) | 14 | 1 |
| keine vollständige Ortsadresse auf den abgerufenen Seiten | 1 | 8 |
| Ertragsbeweis leer („kein Angebot 0–3 mit künftigem Termin“) | – | 6 |
| Seite nicht abrufbar (PDF-Download im Browser-Abruf, HTTP 500) | 4 | 2 |
| außerhalb der Region (Neuss über `municipality`, Harsewinkel, Euskirchen) | 1 | 1 |
| sonstiges | 1 | 5 |

Beobachtungen, die eine frische Session prüfen sollte (Hypothesen, nicht verifiziert):

1. **Die Websuche landet in NRW auf den Landesportalen** `fruehehilfen-online.nrw.de` und `guterstart.nrw.de` (je Angebot ein PDF-Export, oft abgelaufen; im Browser-Abruf „Download is starting“). 20 von 53 Kandidaten. Diese Portale sind eher **Sammelkalender** – ein Adapter (wie `evtermine`) könnte sie nach Düsseldorf und Datum filtern und Kandidaten mit Träger und Ort liefern, statt einzelne PDFs zu bewerten.
2. **Große Träger haben Kursportale/Buchungssysteme**, die der Ertragsbeweis nicht lesen kann oder die keine Ortsadresse zeigen: Kaiserswerther Diakonie (Familienakademie: PEKiP, Babymassage, Klangentdecker – „Fronberghaus, Raum 004“ ohne Adresse), AWO Familienbildungswerk (`awo-duesseldorf.de/awo-kurse/kursliste/`, nur Stadtteile), DRK (`kursplaner.drk-duesseldorf.de`, `drk-bildung-duesseldorf.de`, Geocoding „Tellerringstraße 56“ fehlgeschlagen), efa (`efa-duesseldorf.de/kurssuche`, HTTP 500/leer), Diakonie-Familienzentren. Das sind vermutlich die meisten Düsseldorfer Angebote. Optionen: Katalogpflege von Hand mit `Venue`-Adressen und `hint` (Skill, Abschnitt 3), Lesarten der Buchungssysteme in `references/booking-systems.md`, ggf. Adapter.
3. **Die Adress-Regel im Bewerten** („keine vollständige Postadresse auf den abgerufenen Seiten“ → verwerfen) trifft Anbieter, deren Adresse nur im Impressum oder auf einer nicht abgerufenen Kontaktseite steht. Prüfen, ob das Bewerten Impressum/Kontakt mit abruft oder ob die Regel für Träger mit bekannter Hauptadresse gelockert werden kann (Prompt `prompt/discover-assess.md`, Eval-Fälle für das Entdecken, Skill Abschnitt 4).
4. **Zehn Suchbegriffe je Lauf** und „höchstens 10 Kandidaten je Suche“ sind für einen Bootstrap einer 620 000-Einwohner-Stadt knapp; ein Bootstrap mit Verzeichnissen (`role: verzeichnis`, etwa Stadt Düsseldorf „Familienportal“/Familienbüros, Elternschule UKD als Verweisliste) könnte mehr liefern.
5. Die ursprüngliche Nürnberger Liste kam aus einer **Agenten-Recherche** (Skill `babyevents-nuernberg`). Für Düsseldorf wäre eine gleichwertige einmalige Recherche (Subagenten je Angebotsart) vermutlich der schnellste Weg zu 40+ Anbietern; das Entdecken hält den Katalog danach nur aktuell.

Empfehlung für die nächste Session: zuerst einen kleinen Plan (Plan 0040) „Düsseldorfer Katalog füllen“ mit Ziel (z. B. ≥ 30 Anbieter, ≥ 150 Angebote vor dem Live-Gang), Messung der Hypothesen 1–3 ohne Modell (Abruf der Portale und Kursportale mit `pnpm pipeline fetch-page`), dann Entscheid Adapter vs. Handrecherche. Plan 0039 bleibt bis dahin unveröffentlicht oder geht mit leerer bzw. kleiner Düsseldorf-Kachel live – das entscheidet der Nutzer.

### Weitere offene Punkte aus dieser Session

- **Lokale Läufe mit Modell** ignorieren seit 28faadf die Nutzer-Einstellungen (`--setting-sources project`, `--strict-mcp-config`). Lauf 1 des Trockenlaufs ($2,15, 0 Ergebnisse) und der erste Eval ($0,33, 11/12) liefen noch mit Haiku-Effort „xhigh“ aus `~/.claude/settings.json`; der Eval ist neu gemessen (12/12, $0,14), die alte Zeile in `evals/results.md` vermerkt. Kosten dieser Session mit Modell: ≈ $3,90 (Eval 0,33 + 0,14, Trockenlauf 2,15 + 0,07 + 1,07, plus Probe).
- S11 (Push, Nachtlauf mit `max_tokens=5000000` wegen des neuen Prompts ≈ $0,60, Bootstrap live, Nachtlauf, `/browser-review live`, Größen von `site.json` und `wegzeit/vrr.json` messen) und S12 (Archiv) stehen aus.
- Browser-Review, Restbefunde niedrig: Statuszeile dreizeilig auf Pixel 7 mit „(Düsseldorf)“; nach Netzwechsel verschwindet der Startpunkt unter der Falz ohne Hinweis (Kandidat für `docs/ideas.md`).
