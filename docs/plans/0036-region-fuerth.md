# Plan 0036 – Zweite Region: Fürth

Status: in Umsetzung
Datum: 2026-10-12
Bezug:
- ADR 0025 (Katalog regionsfähig; Punkt 1 „Weitere Region-Felder … kommen mit der zweiten Region“, Nachtrag `population`)
- ADR 0026 und Plan 0032 (`docs/plans/0032-daten-automatisch.md`), E7 (Entdecken), E13 (Regionen), Abschnitt „Nutzerentscheide“ nach dem Trockenlauf (Region = Stadt plus direkt angrenzende Orte; Orte außerhalb fallen aus dem Eintrag)
- ADR 0011 (Wegzeit-Tabelle; Punkt 2 „Haltbereich im Stadtgebiet Nürnberg (DHID `de:09564:`)“, Punkt 9 „Startgebiet ist das Stadtgebiet Nürnberg“), ADR 0017 (Startpunkt gespeichert), ADR 0012 (Startbudget)
- Plan 0031 (`docs/plans/archiv/0031-katalog-crawlbar-und-regionsfaehig.md`), Plan 0033 (`docs/plans/archiv/0033-onboarding.md`, E5 Stadt-Kacheln), Plan 0035 (`docs/plans/archiv/0035-onboarding-fuer-alle.md`)
- Skill `babyevents-nuernberg`, Abschnitt 6 „Region starten“

## Anlass

Der Nutzer will Fürth aufnehmen. Entschieden (2026-10-12):

- Fürth wird eine **eigene Region** `fuerth` in `REGION_IDS`: eigene Kachel im Onboarding (Sortierung nach `population`), eigenes Entdecken mit dem Namen „Fürth“ (Bootstrap erst als Trockenlauf, live erst nach seiner Abnahme), eigene bbox.
- Gleicher VGN-Fahrplan, Ferien und Feiertage Bayern.
- Angebote aus Nürnberg bleiben für Fürther sichtbar und umgekehrt.

## Ziel

1. Im Onboarding stehen die Kacheln „Nürnberg“ und „Fürth“; wer Fürth wählt, findet im Schritt „Weg“ zuerst die Fürther Stadtteile.
2. Ein Startpunkt in Fürth (Stadtteil, Standort, Kartenmitte) bekommt **Wegzeiten mit Bus & Bahn** wie einer in Nürnberg, nicht nur die Luftlinie.
3. Das Entdecken sucht wöchentlich auch „… Fürth“ und nimmt Fürther Anbieter mit `region: fuerth` auf. Der erste Lauf ist ein Bootstrap, erst trocken, nach Abnahme live.
4. Keine Dublette durch die Überlappung der bboxen, kein Anbieter, der in einer Region abgelehnt und in der anderen wieder aufgenommen wird.

## Nicht-Ziele (Restpunkte nach `docs/ideas.md`)

- **Stadtwahl speichern.** Die Liste zeigt ohnehin alle Angebote (Anbieter tragen in `site.json` keine Region, `src/domain/site-data.ts`). Gespeichert wird erst, wenn eine Region außerhalb des VGN-Gebiets eigene Daten oder einen Filter braucht.
- Filter oder Ansicht nach Region, Kamera-Startpunkt je Region (die Karte richtet sich nach den Punkten, `src/domain/camera.ts`).
- Sammelkalender-Adapter und Verzeichnisse für Fürth (etwa Familienbüro oder Veranstaltungskalender der Stadt). Das Entdecken findet Fürth zunächst nur über die Websuche.
- Ferienland je Region: Fürth liegt wie Nürnberg in Bayern, `DE-BY` in `scripts/pipeline/io/holidays.ts` und `lib/holidays.ts` bleibt.
- Neues Kachelbild `public/og/vorschau-v1.jpg` mit „Nürnberg und Fürth“ samt `GENERIC_ALT` (`scripts/lib/share-pages.ts`) und `og:image:alt`. Bild und Alt-Text bleiben zueinander passend bei „in Nürnberg“, und das bleibt wahr.
- Zurückgestellte Kandidaten über Regionen hinweg teilen (E4): Ein in Nürnberg zurückgestellter Kandidat kann im Fürther Lauf noch einmal bewertet werden. Das kostet etwa $0,002 je Kandidat.
- Fürth-Poppenreuth bei `musikfuechse` wieder aufnehmen (Plan 0032: bewusste Einzelentscheidung). Das ist Katalogpflege nach Abnahme dieses Plans und eine Frage an den Nutzer, kein Teil davon.
- Umbenennen von `NUERNBERG_BBOX` oder vom Skill `babyevents-nuernberg`.

## Ausgangslage (geprüft 2026-10-12)

| Stelle | Heute | Betroffen? |
|---|---|---|
| `src/domain/regions.ts` | `REGION_IDS = ["nuernberg"]`, `Region { name, bbox, population }` | ja: Eintrag `fuerth`, Feld `kreis` (E3), Reihenfolge (E2) |
| `src/domain/geo.ts` | `NUERNBERG_BBOX` (lat 49,3–49,65, lon 10,85–11,3, „Großraum Nürnberg/Fürth/Erlangen“), `inBounds(p, bbox = NUERNBERG_BBOX)` | nein (E1): Die Fürther bbox liegt darin; nur die Kommentare werden angepasst |
| `inBounds` mit Standard-bbox | `src/data/geolocation.ts` (Standort), `src/ui/use-app-state.ts` (Kartenmitte), `src/ui/origin-state.ts` und `src/domain/stored-origin.ts` (gespeicherter Punkt), `schema.ts` `Timetable` (Steige), `scripts/pipeline/lib/gtfs.ts` (Auszug) | nein: Alles in Fürth liegt in `NUERNBERG_BBOX`. Ein Test sichert das (Test 1) |
| `src/domain/schema.ts` | `region: z.enum(REGION_IDS)`, superRefine prüft Orte gegen `REGIONS[p.region].bbox` | automatisch über `REGION_IDS`; `schema/providers.schema.json` neu exportieren (Schemaänderung) |
| `scripts/pipeline/lib/discover-state.ts` | `region: z.enum(REGION_IDS)`; Datei `data/discover/<region>.json` | automatisch; `data/discover/fuerth.json` entsteht im ersten Lauf |
| `scripts/pipeline/cli.ts` | `--region` aus `REGION_IDS`, ohne Angabe alle in deren Reihenfolge | nein; die Reihenfolge regelt E2 |
| `scripts/pipeline/io/discover.ts` | Vorfilter gegen den ganzen Katalog (wird im Lauf nach jeder Aufnahme erweitert), aber `abgelehnt` nur aus der eigenen Region; `reservedIds` schon aus allen Regionen | ja: E4 |
| `scripts/pipeline/lib/discover.ts` | Orte außerhalb der bbox der Lauf-Region fallen weg, verworfen wird ohne Ort in der Region | nein; Folge siehe E2 und Risiken |
| `.github/workflows/discover.yml` | Eingabe `region` als Freitext, leer = alle aus `REGION_IDS`; Bremsen je Lauf (`max_calls` 120, `max_tokens` 5 000 000), Zeitbudget 90 Min., `timeout-minutes: 120`; Repo-Variable `ENTDECKEN_MODUS` ist nicht gesetzt (= `trocken`) | nein (Kosten und Zeit siehe Risiken) |
| Fahrplan `data/oepnv/fahrplan.json` | Auszug aller Steige in `NUERNBERG_BBOX`: 3 534 Steige, davon 558 Haltbereiche `de:09564:` (Nürnberg), **191 `de:09563:` (Stadt Fürth)**, 162 `de:09573:` (Landkreis Fürth) | nein: Fürth ist schon im Netz |
| Wegzeit-Tabelle `scripts/transit/table.ts` | Zeilen nur für `CITY_PREFIX = "de:09564:"` (ADR 0011, Punkt 2 und 9). Ein Startpunkt in Fürth hat keinen Haltbereich in 800 m, also gilt die Luftlinie „außerhalb des Stadtgebiets“ | **ja: E5** |
| `src/domain/districts.ts` | 35 Nürnberger Stadtteile (OSM), IDs im localStorage (`zwergenplan.entfernung-ab`); `districtById` lädt `use-app-state.ts` im **Start-Chunk** | ja: E6 |
| Onboarding `src/ui/onboarding/steps.tsx`, `OnboardingFlow.tsx` | `CityStep` hält die Wahl lokal und speichert nichts; `WayStep` und `OriginPicker.tsx` listen `DISTRICTS` flach | ja: E7 |
| Texte | `src/ui/format.ts`: „Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg.“ (`limitReason`, über `originHint` auch mit „Wähle einen Stadtteil.“), „außerhalb des Großraums Nürnberg“ (Standort, Kartenmitte in `App.tsx`); `index.html` (description, og:description), `public/manifest.webmanifest` (description); `scripts/icons.ts` und `GENERIC_ALT` (Kachelbild); `PRODID` in `src/domain/ics.ts`; Impressum „Projekt aus Nürnberg“ | ja: E8 |
| Ferien | OpenHolidays fest `DE-BY` | nein |
| Startbudget | `JS (initial)` 101 kB, gemessen 100,58 kB (Plan 0035) | **ja: E6 und Offene Punkte** |
| Wegzeit-Daten | live 39,97 kB gzip (Budget 64 kB), Linien 17,6 kB (Budget 40 kB), gemessen 2026-10-12 | ja: wächst mit E5 |
| Tests mit Annahmen | `regions.test.ts` (nur Nürnberg), `onboarding.test.ts` Z. 81 (`cityChoices(REGIONS)` = eine Kachel), `districts.test.ts` (35 Stadtteile, „Fürth Rathaus ≈ 3 km vom nächsten Stadtteil“), `table.test.ts` („nur Nürnberger Haltbereiche“), `e2e/onboarding.spec.ts` Test 2 (eine Kachel, kein „Weitere Städte“), `e2e/startpunkt.spec.ts` Z. 731/741 und `e2e/mobile-ux.spec.ts` Z. 385/409 (Text „Stadtgebiet Nürnberg“) | ja |

Einwohner Fürth: **131 712** am 31.12.2023, Fortschreibung auf Basis Zensus 2022, Bayerisches Landesamt für Statistik, „Statistik kommunal 2024“, Kreisfreie Stadt Fürth (09563), Tabelle 1 „Bevölkerungsentwicklung seit 1840“ (https://www.statistik.bayern.de/mam/produkte/statistik_kommunal/2024/09563.pdf, abgerufen 2026-10-12). Gerundet `132_000`.

Stadtgrenze Fürth (OSM-Relation 62374, `de:amtlicher_gemeindeschluessel=09563000`, Overpass `out bb` am 2026-10-12): lat 49,4360–49,5413, lon 10,8932–11,0287.

## Entscheidungen

### E1 – bbox Fürth: Stadt plus direkt angrenzende Orte, innerhalb von `NUERNBERG_BBOX`

`FUERTH_BBOX = { minLat: 49.4, maxLat: 49.57, minLon: 10.85, maxLon: 11.04 }` in `src/domain/regions.ts`, nicht in `geo.ts`, weil nur `regions.ts` sie liest.

- Gleiche Regel wie Nürnberg (Plan 0032, Nutzerentscheid): Stadt plus direkt angrenzende Orte. Drin sind Zirndorf, Oberasbach, Stein, Cadolzburg, Veitsbronn, Obermichelbach, Erlangen-Eltersdorf und der Nürnberger Westen bis etwa Eberhardshof.
- `minLon` ist auf 10,85 gekappt, die Westgrenze von `NUERNBERG_BBOX`. **Invariante:** Jede Region-bbox liegt in `NUERNBERG_BBOX` (Test 1). Damit bleiben alle Prüfungen mit der Standard-bbox richtig: Standort, Kartenmitte, gespeicherter Punkt, Steige im Fahrplan. `NUERNBERG_BBOX` bleibt unverändert, also gibt es keine Datenmigration und keine Änderung an `inBounds`. Der Kommentar an `inBounds` sagt künftig „Großraum, umfasst alle Regionen“ statt „die einzige Region der App“.
- **Die Überlappung ist gewollt.** Fürth liegt ganz in der Nürnberger bbox. Bestehende Anbieter mit Ort in Fürth oder Stein bleiben `nuernberg` (Plan 0032: „Stein ist in Ordnung“), es gibt keine Umschreibung.
- **Verworfen:**
  - Nürnberger bbox auf die Stadt verkleinern: Das bräche Bestandseinträge mit Orten im Umland und änderte die Prüfung von Standort und Fahrplan.
  - Fürth = `NUERNBERG_BBOX`: Dann hätte `region` keine räumliche Bedeutung mehr, und der Nutzer will eine eigene bbox.
  - Region aus den Koordinaten ableiten: Das ist schon in ADR 0025 verworfen, weil es überlappungsfreie bboxen bräuchte.

### E2 – Zuordnung eines Anbieters: Region des Laufs, spezifischste Region läuft zuerst

- Ein neuer Anbieter bekommt wie bisher die Region des Laufs, der ihn aufnimmt (`lib/discover.ts`, E7.7). Ein Anbieter mit Sitz in Fürth, den die Nürnberger Suche findet, ist also `nuernberg`. Das ist unschädlich: `region` erreicht die Website nicht, sie bestimmt nur die bbox-Prüfung und die Buchführung des Entdeckens.
- **Reihenfolge:** `REGION_IDS = ["fuerth", "nuernberg"]`. Das Entdecken läuft die Regionen in dieser Reihenfolge ab (`cli.ts`). Was beide Suchen in derselben Woche finden, landet so zuerst in Fürth, und der Nürnberger Lauf verwirft es im Vorfilter, weil es dann schon im Katalog steht. **Regel (Test 1):** Liegt die bbox einer Region in der einer anderen, steht sie in `REGION_IDS` davor. Die Kacheln sortieren unabhängig davon nach Einwohnern (`cityChoices`).
- **Folge der kleineren bbox:** Ein Fürther Anbieter mit einem weiteren Ort etwa in Nürnberg-Mögeldorf verliert diesen Ort beim Aufnehmen. Das ist die bestehende Regel „Orte außerhalb fallen weg“, mit Hinweis im Bericht und im Commit-Text. Abhilfe ist Katalogpflege: `region` auf `nuernberg` setzen (`region` ist keine ID, ADR 0022 gilt nicht) und den Ort ergänzen. Der Skill bekommt dazu einen Satz (Abschnitt Doku).
- **Verworfen:** Region nach Sitz neu bestimmen, also die kleinste bbox, die alle Orte enthält. Das wäre mehr Code in `entryFromAssessment` für einen Fall ohne sichtbare Folge.

### E3 – Neues Region-Feld `kreis`

`Region.kreis: string`, der fünfstellige Kreisschlüssel (`"09564"`, `"09563"`). Er ist das DHID-Präfix der Haltbereiche (`de:<kreis>:`) und damit das Startgebiet der Wegzeit (E5).

- Das ist das in ADR 0025, Punkt 1 angekündigte ÖPNV-Feld. Es kommt jetzt, weil `scripts/transit/table.ts` es liest.
- Weitere Felder (Ferienland, Kamera, Suchname) kommen nicht, weil nichts sie liest.
- Der Kommentar nennt die Quelle: Gemeindeschlüssel der Statistik, für kreisfreie Städte gleich dem Kreis.

### E4 – Vorfilter des Entdeckens: `abgelehnt` aus allen Regionen

`prefilter(finds, { catalog, state, abgelehnt, today })` in `scripts/pipeline/lib/discover.ts` bekommt die abgelehnten Einträge **aller** Regionen. `io/discover.ts` liest sie einmal vor der Schleife, wie schon `reservedIds`. URL- und Host-Sperren gelten damit regionsübergreifend.

- `zurueckgestellt` bleibt je Region, weil der Grund oft regionsabhängig ist („kein Ort in der Region Fürth“).
- Dubletten zwischen den Regionen fängt der bestehende Vorfilter ab. Er prüft gegen den ganzen Katalog, URL oder Host mit ähnlichem Namen, und der Katalog wächst im Lauf mit jeder Aufnahme (`catalog = [...catalog, entry]`). Dafür kommt ein Test mit zwei Regionen (Test 5), den Plan 0032 mangels zweiter Region offen gelassen hat.
- Mit der Reihenfolge aus E2 ist das der ganze Schutz gegen Dubletten. Ein eigener regionsübergreifender Vorfilter-Schritt ist nicht nötig.

### E5 – Wegzeit: Startgebiet sind die Stadtgebiete aller Regionen

`tableRows` nimmt Zeilen für alle Haltbereiche, deren DHID mit `de:<kreis>:` einer Region beginnt.

- `CITY_PREFIX` entfällt zugunsten von `const CITY_PREFIXES = REGION_IDS.map((r) => \`de:${REGIONS[r].kreis}:\`)`. Optional kommt ein Parameter `prefixes` mit diesem Standard für Tests.
- `scripts/transit` darf `src/domain` importieren (Regel `transit-build-pure`).
- Das Netz zum Rechnen ist unverändert der ganze Auszug, das Format (`TRANSIT_TABLE_VERSION` 2) bleibt.
- Die Spalten (Orte) kommen wie bisher aus den Angeboten, Fürther Orte also mit dem ersten Fürther Anbieter.
- **Größe:** bis zu 191 Zeilen mehr (+34 %). Erwartet sind `wegzeit.json` ≈ 54 kB gzip (Budget 64 kB) und `linien.json` ≈ 24 kB (Budget 40 kB). Gemessen wird in S2, steht im Plan und ist ein Abbruchkriterium: Über 60 kB entscheidet der Nutzer, bevor es weitergeht.
- Die Zeit von `build-data` wächst im gleichen Verhältnis. Sie wird in S2 gemessen.
- ADR 0011, Punkt 2 und 9 ändert sich: „Stadtgebiet Nürnberg“ wird „Stadtgebiete der Regionen“, also neues ADR (E9). Die 800-m-Regel und der Text „außerhalb des Stadtgebiets“ bleiben.
- **Verworfen:** Fürth ohne Wegzeit, nur Luftlinie. Die Kachel „Fürth“ versähe dann den Schritt „Weg“ mit gesperrten Minuten-Chips. Das Ziel „Wegzeiten wie Nürnberg“ verfehlte es.
- Der Landkreis Fürth (`09573`: Zirndorf, Stein, Oberasbach) bekommt keine Zeilen, wie heute das Nürnberger Umland. Ein Startpunkt dort hat weiter die Luftlinie.

### E6 – Fürther Stadtteile

`src/domain/districts.ts` hält die Stadtteile je Region: `DISTRICTS_BY_REGION: Record<RegionId, readonly District[]>`. Der `Record` erzwingt Stadtteile für jede neue Region. `DISTRICTS` bleibt die flache Liste (`REGION_IDS.flatMap(…)`), und `districtById` und `nearestDistrictLabel` arbeiten darauf.

- **Kein Feld `region` je Eintrag**, das spart Bytes im Start-Chunk.
- **Quelle:** OSM `place=suburb` in der Stadtgrenze Fürth (nur `suburb`, nicht `quarter`, damit die Liste kurz bleibt wie in Nürnberg), Overpass vom 2026-10-12, auf 3 Nachkommastellen gerundet. Abfrage zum Nachprüfen im Dateikopf:
  ```
  [out:json][timeout:60];
  area(3600062374)->.a;
  node["place"="suburb"](area.a);
  out;
  ```
- **IDs** `fuerth-<kebab>` (Umlaute als ae/oe/ue). Sie sind fest und werden wie in Nürnberg nie aus dem Namen neu abgeleitet.
- **Namen** sind über alle Regionen eindeutig (Test), weil die Statuszeile „Wegzeit ab <Name>“ sagt. **Allgemeine Namen** bekommen den Zusatz „(Fürth)“ (Review M4): „Altstadt (Fürth)“, „Innenstadt (Fürth)“, „Südstadt (Fürth)“, „Westvorstadt (Fürth)“. Die Nürnberger Namen bleiben, weil sie gespeichert und bekannt sind.
- **Zugangshalt-Gate** (Review M3): `scripts/build-data.ts` verlangt für jeden Eintrag in `DISTRICTS` einen Haltbereich der Tabelle in 800 m mit Einstieg Di 8:30–10:30 (`withoutAccess`), sonst ist der echte Build rot. **Regel:** Ein Stadtteil ohne Zugangshalt fällt aus der Liste; sein Punkt wird nie verschoben. Gemessen am 2026-10-12 gegen `data/oepnv/fahrplan.json`: Alle 27 OSM-`suburb`-Punkte haben einen Fürther Haltbereich in höchstens 380 m, das Gate fällt also keinen.
- **Weiler weggelassen** (Review M3): Bislohe, Mannhof, Herboldshof, Ritzmannshof, Atzenhof, Braunsbach, Flexdorf, Kronach und Steinach sind kleine Ortsteile am Stadtrand. Ihre Einwohner wählen den nächsten größeren Stadtteil oder den Standort. So bleibt die Liste kurz wie in Nürnberg.
- **Liste** (18 Einträge, `name`, lat, lon):

  | ID | Name | lat | lon |
  |---|---|---|---|
  | fuerth-altstadt | Altstadt (Fürth) | 49.48 | 10.987 |
  | fuerth-burgfarrnbach | Burgfarrnbach | 49.489 | 10.923 |
  | fuerth-dambach | Dambach | 49.462 | 10.97 |
  | fuerth-eschenau | Eschenau | 49.46 | 10.96 |
  | fuerth-espan | Espan | 49.478 | 11.006 |
  | fuerth-hardhoehe | Hardhöhe | 49.481 | 10.956 |
  | fuerth-innenstadt | Innenstadt (Fürth) | 49.475 | 10.988 |
  | fuerth-oberfuerberg | Oberfürberg | 49.471 | 10.94 |
  | fuerth-poppenreuth | Poppenreuth | 49.481 | 11.012 |
  | fuerth-ronhof | Ronhof | 49.491 | 11.002 |
  | fuerth-sack | Sack | 49.502 | 11.013 |
  | fuerth-schwand | Schwand | 49.485 | 10.972 |
  | fuerth-stadeln | Stadeln | 49.513 | 10.975 |
  | fuerth-suedstadt | Südstadt (Fürth) | 49.463 | 10.996 |
  | fuerth-unterfarrnbach | Unterfarrnbach | 49.491 | 10.955 |
  | fuerth-vach | Vach | 49.527 | 10.967 |
  | fuerth-weikershof | Weikershof | 49.445 | 10.988 |
  | fuerth-westvorstadt | Westvorstadt (Fürth) | 49.47 | 10.968 |

- **Abgleich** (Review G6): Bei der Umsetzung läuft die Overpass-Abfrage einmal und wird mit der Tabelle abgeglichen; Abweichungen bei Koordinaten übernimmt die Datei, fehlende oder neue Punkte stehen im Abschnitt „Umsetzung“.
- **Gruppen für die Auswahl:** Die reine Funktion `districtGroups(first?: RegionId)` in einem eigenen Modul `src/domain/district-groups.ts` (Review G2; `districts.ts` bleibt Daten plus Suche, `use-app-state.ts` zieht die Gruppen nicht), Ergebnis `{ region, name, districts }[]`, liefert zuerst `first`, dann die übrigen nach Einwohnern (wie `cityChoices`). Die Auswahl zeigt sie als `<optgroup label="Nürnberg">` bzw. `"Fürth"`.
- **Startbudget:** `districtById` liegt im Start-Chunk. 18 Einträge kosten geschätzt 0,3–0,4 kB gzip, `regionList` und der Import von `regions.ts` noch etwa 0,1 kB. Bei 100,58 von 101 kB reicht das nicht. **Nutzerentscheid (2026-10-12): `JS (initial)` auf 102 kB anheben**; JSON hat keine Kommentare, darum steht die Begründung im Commit-Text und im Nachtrag ADR 0012. Gemessen wird in S3 mit `pnpm size`.

### E7 – Onboarding: Wahl ordnet den Schritt „Weg“, gespeichert wird nichts

- `OnboardingFlow.tsx` hält `city: RegionId` (Start: erste Kachel, also Nürnberg) und gibt es an `CityStep` (gesteuert: `city`, `onCity`) und an `WayStep` (`city`) weiter.
- `WayStep` listet `districtGroups(city)`. Wer Fürth wählt, sieht die Fürther Stadtteile zuerst. Die anderen bleiben wählbar, weil Nürnberger Angebote für Fürther sichtbar bleiben.
- `OriginPicker.tsx` (Kind-Sheet) listet `districtGroups()`, also Nürnberg zuerst. Es gibt keine gespeicherte Stadt, die die Reihenfolge ändern könnte.
- **Nicht gespeichert.** ADR 0025, Nachtrag: „nicht gespeichert, solange es eine Region gibt“. Das wird jetzt neu begründet: Nichts außerhalb des Onboardings würde die Wahl lesen, Liste und Karte zeigen alle Angebote, und der gewählte Startpunkt (ADR 0017) trägt den Ort. Das neue ADR hält das fest (E9).
- Der Kommentar „Heute nur Nürnberg, vorgewählt“ in `steps.tsx` wird angepasst. Die Texte `ONBOARDING_TEXTS` bleiben, denn „Eure Stadt“ passt.
- Bei zwei Kacheln gibt es kein Dropdown „Weitere Städte“ (`maxTiles` 4).

### E8 – Texte

- **`src/ui/format.ts`, `limitReason`:** „Wegzeiten gibt es nur für Startpunkte in Nürnberg und Fürth.“ Der Text entsteht aus `regionList()` in `regions.ts` (Namen nach Einwohnern, „A und B“ bzw. „A, B und C“). `originHint` übernimmt ihn samt „Wähle einen Stadtteil.“.
- **Bleibt:** „außerhalb des Großraums Nürnberg“ (Standort, Kartenmitte), weil Fürth im Großraum liegt und die Prüfung `NUERNBERG_BBOX` ist. „VGN – Verkehrsverbund Großraum Nürnberg GmbH“ ist ein Eigenname. `PRODID` in `ics.ts` ist eine Kennung, eine Änderung brächte nichts. Das Impressum („Projekt aus Nürnberg“) bleibt.
- **`index.html`** (`description`, `og:description`) und **`public/manifest.webmanifest`** (`description`): „… für Kinder unter 3 Jahren in Nürnberg und Fürth.“ `og:image:alt` bleibt wegen des Kachelbilds (Nicht-Ziele).
- **`CLAUDE.md`**, erster Satz: „… in Nürnberg und Fürth findet“.

### E9 – ADR: neues ADR 0029 „Zweite Region Fürth“

Neu wird ADR 0029 als Datei `0029-zweite-region-fuerth.md` in `docs/adr/` (Status „angenommen“ mit diesem Plan). Inhalt:

1. Regionen dürfen überlappen; jede Region-bbox liegt in `NUERNBERG_BBOX`.
2. Ein Anbieter gehört zur Region des Laufs, der ihn aufnimmt; die spezifischere Region läuft zuerst (E2).
3. `Region.kreis` ist das Startgebiet der Wegzeit; das ändert ADR 0011, Punkt 2 und 9 (E5).
4. `abgelehnt` gilt über alle Regionen (E4).
5. Die Stadtwahl bleibt ungespeichert (E7).

ADR 0011 (Statuszeilen-Block „Geändert durch ADR 0029“) und ADR 0025 (Nachtrag, Satz zu Punkt 1 und zur Stadtwahl) verweisen darauf. Ein neues ADR statt dreier Nachträge, weil es von zwei ADRs abweicht und eine Abweichung ein neues ADR wird (`CLAUDE.md`). Dazu ein Nachtrag in ADR 0012: Budget `JS (initial)` 102 kB statt 101 kB (Nutzerentscheid 2026-10-12, E6).

### E10 – Daten: Bootstrap erst trocken, live nach Abnahme

- Der lokale Trockenlauf läuft auf dem Stand von S1–S5 vor dem Push (S6) und kostet Modellgeld. Erst die Abnahme durch den Nutzer, dann Push, dann Bootstrap live per `workflow_dispatch`.
- Neue Anbieter kommen über `discover-publish` nach `data/providers.yaml` und `data/raw`. Ihre Angebote stehen erst nach dem nächsten Nachtlauf in `data/offers.json`, der ihn aus `data/raw` baut. Darum wird der Nachtlauf danach von Hand angestoßen (S7).
- Zwischen Push und erstem Fürther Angebot zeigt die Kachel „Fürth“ eine Liste ohne Fürther Angebote. Mit S7 am selben Tag ist das hinnehmbar (Risiken).
- **Nachteil der Reihenfolge Fürth zuerst** (Review G3): Der Fürther Teil verbraucht zuerst Zeitbudget und Bremse; reißt eins, fehlt der Nürnberger Teil bis zur nächsten Woche. Ein Kandidat aus Nürnberg, den die Fürther Suche findet, wird dort bewertet, verworfen („kein Ort in der Region Fürth“) und im selben Lauf in Nürnberg noch einmal bewertet und aufgenommen (doppelte Bewertung, ≈ $0,002). Der erste Sonntagslauf mit beiden Regionen wird gemessen (Dauer, Aufrufe, Kosten je Region) und steht im Abschnitt „Umsetzung“.

## Dateien

| Datei | Änderung |
|---|---|
| `src/domain/regions.ts` | `REGION_IDS = ["fuerth", "nuernberg"]` (Kommentar zur Reihenfolge, E2); `Region.kreis`; Eintrag `fuerth: { name: "Fürth", bbox: FUERTH_BBOX, population: 132_000, kreis: "09563" }` mit Quellenkommentar (Ausgangslage); `nuernberg.kreis = "09564"`; `regionList()`; Kopfkommentar (Felder `population`, `kreis`, Verweis auf ADR 0029) |
| `src/domain/regions.test.ts` | Test 1 |
| `src/domain/geo.ts` | nur Kommentare an `NUERNBERG_BBOX` und `inBounds` (E1) |
| `src/domain/districts.ts` | `DISTRICTS_BY_REGION`, `DISTRICTS` abgeleitet, 18 Fürther Einträge; Kopfkommentar mit der Fürther Abfrage |
| `src/domain/district-groups.ts` (neu) | `districtGroups(first?)` (E6, Review G2) |
| `src/domain/district-groups.test.ts` (neu) | Test 2, Gruppen |
| `src/domain/districts.test.ts` | Test 2 |
| `src/domain/onboarding.test.ts` | Z. 81: zwei Kacheln, Nürnberg vor Fürth (Test 3) |
| `src/ui/onboarding/OnboardingFlow.tsx` | Zustand `city`, Props an `CityStep`/`WayStep` (E7) |
| `src/ui/onboarding/steps.tsx` | `CityStep` gesteuert; `WayStep` mit `<optgroup>` aus `districtGroups(city)`; Kommentare |
| `src/ui/OriginPicker.tsx` | `<optgroup>` aus `districtGroups()` |
| `src/ui/format.ts` | `limitReason` mit `regionList()` (E8) |
| `src/ui/format.test.ts` | Z. 482–483 und 726: neuer Text (Review G1) |
| `index.html`, `public/manifest.webmanifest` | Beschreibung „in Nürnberg und Fürth“ |
| `scripts/transit/table.ts` | `CITY_PREFIXES` aus `REGIONS` statt `CITY_PREFIX`; Kommentare (E5) |
| `scripts/transit/table.test.ts` | Test 4; Z. 41–50 erwartet `de:09563:9100` als Zeile, Kommentare Z. 50 und Z. 316 angepasst (Review M1, G1) |
| `tests/fixtures/oepnv/fahrplan.json` | Steig `de:09563:9100:1:1` von 49,447 / 11,03 nach 49,4748 / 10,9885 (≈ 30 m von „Innenstadt (Fürth)“). Er ist schon erster Halt der Tram 1 mit Einstieg im Fenster, wird mit E5 eine Zeile und gibt dem E2E eine Wegzeit ab Fürth (Review M1). `tests/fixtures/` macht die E2E-Auswahl voll |
| `scripts/build-data.ts` | nur Kommentar am Zugangshalt-Gate (Fixture-Netz deckt Gostenhof und Fürth-Innenstadt ab) |
| `.size-limit.json` | `JS (initial)` 102 kB (E6, Nutzerentscheid) |
| `scripts/pipeline/lib/discover.ts` | `prefilter` mit `abgelehnt` aller Regionen (E4) |
| `scripts/pipeline/lib/discover.test.ts` | Test 5a |
| `scripts/pipeline/io/discover.ts` | `abgelehnt` aller Regionen einmal lesen und übergeben |
| `scripts/pipeline/io/discover.test.ts` | Test 5b (zwei Regionen) |
| `schema/providers.schema.json` | `pnpm schema:export` (Enum `region`), nie von Hand |
| `e2e/onboarding.spec.ts` | Test 2 umgeschrieben, neuer Test „Fürth → Weg“ (Test 6) |
| `e2e/startpunkt.spec.ts` Z. 731/741, `e2e/mobile-ux.spec.ts` Z. 385/409 | neuer Text „… in Nürnberg und Fürth.“ |
| `docs/adr/` | neues ADR 0029 (E9); Verweise in ADR 0011 und ADR 0025; ggf. Nachtrag ADR 0012 |
| `docs/architecture.md` | Schichten-Zeile `src/domain` (`districts` je Region), Abschnitt Wegzeit („Startgebiet = Stadtgebiete der Regionen, `Region.kreis`“), Entdecken (Reihenfolge, `abgelehnt` regionsübergreifend) |
| `docs/ideas.md` | Eintrag „Zweite Region“ und „Stadtwahl speichern“ umschreiben: erledigt ist Fürth; offen bleiben die Nicht-Ziele dieses Plans |
| `.claude/skills/babyevents-nuernberg/SKILL.md` | Abschnitt 6: Checkliste einer Region (`regions.ts` mit `kreis`, Stadtteile, Texte, Reihenfolge), Satz zu E2 (Region von Hand wechseln, wenn ein Ort wegfiel); Abschnitt 2: `abgelehnt` wirkt in allen Regionen |
| `CLAUDE.md` | erster Satz (E8) |

Nicht geändert: `src/domain/schema.ts` (liest `REGION_IDS` schon), `discover-state.ts`, `cli.ts`, `.github/workflows/discover.yml`, `data/oepnv/fahrplan.json`, `scripts/lib/e2e-map.ts` (keine neue Spec, keine neue Datei unter `src/ui/`; `district-groups.ts` erreicht die Specs über den Importgraphen von `steps.tsx` und `OriginPicker.tsx`).

## Tests (test-first für Domäne und Pipeline)

1. **`regions.test.ts`** (Domäne, zuerst rot):
   - Jede Region-bbox liegt in `NUERNBERG_BBOX` (alle vier Ecken mit `inBounds`).
   - Reihenfolge: Liegt bbox A in bbox B, steht A in `REGION_IDS` vor B.
   - Fürth: Rathaus (49,477 / 10,989) und alle vier Ecken der Stadtgrenze (Ausgangslage) liegen in `REGIONS.fuerth.bbox`, Hauptmarkt Nürnberg (49,4539 / 11,0775) nicht.
   - `kreis` ist fünfstellig und je Region eindeutig.
   - `regionList()` gibt „Nürnberg und Fürth“ zurück; mit einem Fake-Record aus drei Regionen „A, B und C“.
   - Die bestehenden Prüfungen für `population` gelten für jede Region.
2. **`districts.test.ts`:**
   - 35 Nürnberger, 18 Fürther Einträge.
   - IDs über alle eindeutig und kebab, Fürther mit Präfix `fuerth-`.
   - **Namen über alle eindeutig.**
   - Jeder Punkt liegt in der bbox seiner Region (und damit in `NUERNBERG_BBOX`).
   - Sortierung nach deutschem Alphabet je Region.
   - Allgemeine Namen (Altstadt, Innenstadt, Südstadt, Westvorstadt) tragen in Fürth den Zusatz „(Fürth)“.
   - `district-groups.test.ts`: `districtGroups("fuerth")` beginnt mit Fürth, `districtGroups()` mit Nürnberg; jede Region kommt genau einmal vor.
   - `nearestDistrictLabel({ lat: 49.477, lon: 10.989 })` ergibt „nächster Stadtteil: Innenstadt (Fürth)“. Der bisherige Fall „weiter weg“ wandert auf einen Punkt außerhalb beider Städte, etwa Erlangen Hbf (49,596 / 11,002).
   - `route.test.ts` (Stadtteilnamen nie in der URL) läuft unverändert über die längere Liste.
3. **`onboarding.test.ts`:** `cityChoices(REGIONS)` ergibt Kacheln `[nuernberg, fuerth]`, `more: []`.
4. **`table.test.ts`** (Pipeline-Build, zuerst rot): Ein Inline-Fahrplan mit je einem Haltbereich `de:09564:`, `de:09563:` und `de:09573:`, alle mit Einstieg im Fenster, ergibt Zeilen für die ersten beiden, nicht für den Landkreis. Der bestehende Test „nur Nürnberger Haltbereiche“ wird umbenannt in „nur Haltbereiche der Regionen“ und erwartet zusätzlich `de:09563:9100` (Review M1). Der Test „Innen-Test 800 m“ (Z. 316) bleibt gültig, weil 9100 nach dem Umzug weit westlich liegt.
5. **Entdecken:**
   - a) `lib/discover.test.ts`: `prefilter` verwirft eine URL oder einen Host aus `abgelehnt` einer **anderen** Region.
   - b) `io/discover.test.ts` mit `regions: ["fuerth", "nuernberg"]` und Fake-Suche, die in beiden Regionen denselben Kandidaten liefert (Adresse in Fürth): Er wird genau einmal aufgenommen, mit `region: fuerth`, und erscheint im Nürnberger Teil des Berichts als Vorfilter-Treffer. Ein Kandidat aus `abgelehnt` in `nuernberg.json` taucht im Fürther Lauf nicht auf.
   - Dazu ein Fall „Kandidat in Nürnberg-Mögeldorf, von beiden Suchen gefunden“: im Fürther Teil verworfen mit „kein Ort in der Region Fürth“ und in `fuerth.json` zurückgestellt, **im selben Lauf** im Nürnberger Teil aufgenommen, mit `region: nuernberg` (Review G3).
6. **E2E `e2e/onboarding.spec.ts`:**
   - Test 2 neu: Zwei Kacheln „Nürnberg“ (gedrückt) und „Fürth“, kein „Weitere Städte“; Lead wie bisher.
   - Neuer Test „Fürth wählen: Weg-Schritt mit Fürther Stadtteilen zuerst“: Kachel „Fürth“ tippen, dann `aria-pressed`. Zum Schritt „Weg“ gehen. Die erste `optgroup` der Stadtteil-Auswahl hat das Label „Fürth“. „Innenstadt (Fürth)“ wählen. Mit dem verschobenen Fixture-Halt 9100 (M1) wirkt die Wegzeit: Unter der Auswahl steht kein Hinweis, denn `originHint` liefert für einen Stadtteil mit Wegzeit nichts (Review M2). Die Minuten-Chips sind aktiv, und nach dem Abschluss nennt die Statuszeile „Wegzeit ab Innenstadt (Fürth)“.
   - Neuer Test „Kachel Fürth, Weg übersprungen“: Fürth wählen, im Schritt „Weg“ „Später“; die Liste erscheint ohne Startpunkt (Review G5).
   - Spec-Auswahl: `index.html`, `public/` und `tests/fixtures/` machen die Auswahl voll; lokal laufen darum ausdrücklich `pnpm e2e:local e2e/onboarding.spec.ts e2e/startpunkt.spec.ts e2e/mobile-ux.spec.ts` (mit `run_in_background`, Review M5), den Rest fährt die CI auf `main`.
7. **Gates:**
   - `pnpm verify` grün, darin Schema-Drift nach `pnpm schema:export`, `pnpm data:validate` mit der Region `fuerth` und knip.
   - `pnpm size`: Start-JS (E6) sowie `wegzeit.json` und `linien.json` im echten Build (E5).

## Schritte

Arbeit direkt auf `main` im Haupt-Checkout (allein dort, `CLAUDE.md`, Punkt 6), kleine Commits. **Jeder Schritt ist erst fertig mit `pnpm verify` grün** (Review M6); der pre-commit-Hook wird nie umgangen. Gepusht wird erst nach S6.

- **S1 Domäne:** Tests 1–3 rot, dann `regions.ts`, `districts.ts`, `district-groups.ts`. Sofort `pnpm schema:export` (Enum `region`, sonst ist Schema-Drift rot, Review M6). Overpass-Abgleich (G6). Fertig mit `pnpm verify` grün.
- **S2 Wegzeit:** Test 4 rot, dann `table.ts` und der Fixture-Halt 9100 (M1).
  - Einmal `pnpm data:build` mit echten Daten: Das Zugangshalt-Gate muss grün sein (M3). `public/data/wegzeit.json` und `linien.json` gzip messen (`gzip -c … | wc -c`) und die Laufzeit von `data:build` vorher und nachher notieren; beides kommt in den Abschnitt „Umsetzung“.
  - Abbruch und Rückfrage, wenn `wegzeit.json` über 60 kB gzip liegt.
  - Fertig mit `pnpm verify` grün.
- **S3 UI und Texte:**
  - `OnboardingFlow`, `steps.tsx`, `OriginPicker`, `format.ts` samt `format.test.ts`, `index.html`, `manifest`, E2E-Texte.
  - `.size-limit.json` auf 102 kB, Nachtrag ADR 0012 (Nutzerentscheid). `pnpm build:e2e && pnpm size`; der gemessene Start-JS-Wert kommt in „Umsetzung“.
  - Fertig mit `pnpm verify` grün.
- **S4 Entdecken:** Test 5 rot, dann `lib/discover.ts` und `io/discover.ts`. Fertig mit `pnpm verify` grün.
- **S5 E2E, Doku und Sichtprüfung:**
  - `pnpm e2e:local e2e/onboarding.spec.ts e2e/startpunkt.spec.ts e2e/mobile-ux.spec.ts` (mit `run_in_background`, M5), Test 6.
  - Doku: ADR 0029, Verweise in ADR 0011 und 0025, `docs/architecture.md`, Skill, `docs/ideas.md`, `CLAUDE.md`.
  - `/browser-review` lokal (Fixture-Build) mit diesen Zeilen zusätzlich zur Checkliste (Review G5): Onboarding „Stadt“ mit zwei Kacheln; „Weg“ mit Fürth, `optgroup` im **nativen Picker** auf Android (pixel-7) und iOS (iphone-15), hell und dunkel, alle 53 Einträge erreichbar, auch im Querformat; Kind-Sheet mit `optgroup`; „Kachel Fürth, Weg übersprungen“; Texte bei Startpunkt außerhalb.
  - `/arch-review` (Schemaänderung: Enum `region`; neues Modul; mehr als 200 Zeilen).
- **S6 Daten, Trockenlauf (Freigabe vor dem Lauf):**
  - Dem Nutzer vor dem Start sagen: lokaler Lauf über den Login, ≈ $0,80–1,00, 15–40 Min.
  - Dann auf dem Stand von S5 `pnpm pipeline discover --region fuerth --bootstrap --dry-run` ausführen. Bericht unter `runs/<heute>/discover/report.md`, nichts unter `data/`.
  - Dem Nutzer berichten: „würden aufgenommen“ mit Name, Fund-URL, erstem Angebot; auffällige Verwerfungen, etwa Funde aus Fürth im Odenwald oder Furth im Wald; Kosten.
  - **Erst nach seiner Abnahme weiter.** Ein falsch eingestufter Kandidat kommt vorher nach `abgelehnt` in einer neuen `data/discover/fuerth.json`, die einzige erlaubte Handarbeit dort.
- **S7 Push und live:**
  - Vor dem Push `git pull --rebase` auf `origin/main` (Nachtlauf und Entdecken committen dort parallel, Review G4), dann Push, CI auf `main` grün, `meta.json` zeigt den Commit.
  - Am selben Tag: `gh workflow run discover.yml -f region=fuerth -f bootstrap=true -f modus=live`. Nach dessen Ende (Issue „Neue Anbieter <datum>“) `gh workflow run nightly.yml -f modus=live`, damit die Angebote in `data/offers.json` kommen.
  - Danach `/browser-review live` als Kurzcheck: Kachel „Fürth“, Weg-Schritt, „Innenstadt (Fürth)“ mit „Wegzeit ab …“ und Minuten statt Luftlinie.
  - Die CI beobachtet nur die Haupt-Session (`CLAUDE.md`).
- **S8 Archiv:** nach dem ersten Sonntagslauf mit beiden Regionen (Messung G3): Restpunkte nach `docs/ideas.md`, Statuszeile, `git mv` nach `docs/plans/archiv/`.

## Verifikation

- `pnpm verify` grün; die drei E2E-Specs aus M5 grün; CI auf `main` grün; `commit` in https://zwergenplan.app/data/meta.json = `git rev-parse --short HEAD`.
- Live: `wegzeit.json` hat mehr Zeilen als vorher (`lat`-Array länger, Wert aus S2) und liegt unter 64 kB gzip.
- Live: Im Kind-Sheet „Innenstadt (Fürth)“ wählen. Die Statuszeile zeigt „Wegzeit ab Innenstadt (Fürth)“, die Karten zeigen „ca. … Min. mit Bus & Bahn“.
- Entdecken: Der Bericht des Bootstrap-Laufs nennt „Region Fürth: n neu“. `data/discover/fuerth.json` existiert und `pnpm data:validate` ist grün. Jeder neue Anbieter ist ein eigener Commit `data: neuer Anbieter <id> (fuerth)`.
- Der nächste Sonntagslauf (`ENTDECKEN_MODUS` wie dann gesetzt) läuft beide Regionen in der Reihenfolge Fürth, Nürnberg und bleibt unter 90 Min.

## Risiken

- **Startbudget** (E6): auf 102 kB angehoben (Nutzerentscheid); die Reserve danach ist klein, der Wert steht in „Umsetzung“.
- **Kosten und Laufzeit des Entdeckens verdoppeln sich:**
  - Etwa $1,60–2,00 je Sonntagslauf statt $0,80–1,00.
  - 2 × 13–37 Min. im Zeitbudget von 90 Min.
  - Etwa 74 von 120 Aufrufen der Bremse.
  - Reißt das Budget, endet der Lauf geordnet; der zweite Teil (Nürnberg) bleibt bis zur nächsten Woche offen. Der Kostenhebel aus Plan 0032 (Suche) bleibt ein Restpunkt dort.
- **Namensgleiche Orte** (Fürth im Odenwald, Furth im Wald): Die Suche „PEKiP Fürth“ kann sie finden. Die bbox-Prüfung verwirft sie nach dem Bewerten, das kostet ein paar Cent. Sind es im Trockenlauf mehr als drei, kommt ein Region-Feld `suche` („Fürth Bayern“) für `searchQuery` dazu. Das ist dann ein Nachtrag zu diesem Plan.
- **Kachel ohne Fürther Angebote** zwischen Push und Nachtlauf (E10), Stunden. Bei einem schwachen Trockenlauf (weniger als drei Fürther Anbieter) fragt S6 den Nutzer, ob die Kachel trotzdem live geht.
- **Ort fällt weg** (E2): Ein Fürther Anbieter mit Ort in Nürnberg-Ost verliert ihn beim Aufnehmen. Der Commit-Text nennt ihn, die Abhilfe steht im Skill.
- **`build-data` langsamer** (E5, +34 % Zeilen): In S2 messen. Läuft ein CPU-Test über 1 s, bekommt er ein eigenes Zeitlimit (`CLAUDE.md`).
- **Fixture-Umzug von 9100** (M1): Er ändert die Fixture-Wegzeit nur für Startpunkte in seiner Nähe; vorher lag er 1,2 km von Eberhardshof und 2 km von Gostenhof, außerhalb jedes Innen-Tests. Die volle Suite auf `main` deckt es ab.

## Umsetzung (2026-10-12, S1–S5 ohne Sichtprüfung und Arch-Review)

- **S1** (d4e1a30): `regions.ts` mit `fuerth`, `kreis`, `byPopulation` (gemeinsame Sortierung für `cityChoices`, `districtGroups`, `regionList`) und `regionList`; 18 Fürther Stadtteile; `district-groups.ts`; Schema-Export. Overpass-Abgleich (G6): Die Tabelle in E6 stammt aus der Abfrage vom selben Tag, keine Abweichung.
- **S2** (ec78e8b): echte Daten 556 → 747 Zeilen, `wegzeit.json` 52,4 kB gzip (gzip -9; size-limit 51,76 kB von 64 kB), `linien.json` 21,4 kB (size-limit 21,55 kB von 40 kB), Rechenzeit der Tabelle 2,1 → 2,3 s, `data:build` gesamt 11,3 → 14,9 s. Zugangshalt-Gate grün für alle 53 Stadtteile; alle 27 Fürther `suburb`-Punkte hätten einen Halt in höchstens 380 m gehabt, ausgefallen ist keiner (18 nach dem Weglassen der Weiler). Fixture: 9100 nach 49,4748 / 10,9885; `table.test.ts` erwartet 31 statt 26 Zellen.
- **S3** (5680768): `JS (initial)` 100,58 → **101,25 kB** von 102 kB (Nachtrag ADR 0012), `Onboarding JS` 7,13 kB von 7,3 kB.
- **S4** (505a08f): `prefilter` mit `abgelehnt` aller Regionen; Test 5b war ohne die Änderung in `io/discover.ts` rot.
- **S5:** `pnpm e2e:local e2e/onboarding.spec.ts e2e/startpunkt.spec.ts e2e/mobile-ux.spec.ts` auf pixel-7: 290 bestanden, 7 übersprungen. Doku: ADR 0029, Verweise in ADR 0011 und 0025, `docs/architecture.md`, Skill, `docs/ideas.md`, `CLAUDE.md`.
- **Abweichungen vom Plan:**
  - `scripts/lib/e2e-map.ts` geändert: `district-groups.ts` ist den Specs `onboarding` und `startpunkt` zugeordnet. Ohne die Zuordnung war das neue Modul nach S1 (noch ohne Importeur in `src/ui`) „ohne Spec“ und `e2e-select.test.ts` rot.
  - `prefilter` nimmt `abgelehnt` als optionales Feld (ohne Angabe die eigene Region), damit die bestehenden Tests unverändert bleiben.
  - Test „Kachel Fürth, Weg übersprungen“: „Später“ geht einen Schritt weiter und beendet erst auf dem letzten; der Test klickt es, bis der Dialog zu ist.
  - Zwischen S1 und S2 war der echte Build lokal rot (Fürther Stadtteile ohne Zugangshalt, weil die Tabelle noch keine Fürther Zeilen hatte); nicht gepusht.
- **Offen** (Haupt-Session): `/browser-review` lokal (Checkliste aus S5), `/arch-review`, S6 Trockenlauf, S7 Push und live, S8.

## Offene Punkte

Keine. Startbudget (102 kB) und Bootstrap-Trockenlauf sind vom Nutzer entschieden bzw. freigegeben (2026-10-12); den Trockenlauf startet die Haupt-Session.

## Review (2026-10-12) – Verdict: Freigabe mit Änderungen

Unabhängiger Review (`plan-reviewer`), alle Punkte übernommen:

| Punkt | Inhalt | Übernommen in |
|---|---|---|
| M1 | Fixture-Fahrplan hat schon `de:09563:9100:1:1`; mit E5 wird er Zeile, `table.test.ts` Z. 41–50 bricht. 9100 nahe „Innenstadt (Fürth)“ legen, damit E2E die Wegzeit ab Fürth prüft; `tests/fixtures/` macht die Auswahl voll | Dateien, Test 4, Test 6, Risiken |
| M2 | Test 6 erwartete einen Hinweis, `originHint` liefert für einen Stadtteil mit Wegzeit `undefined` | Test 6 |
| M3 | Zugangshalt-Gate in `build-data.ts` gilt auch für Fürth; Regel „ohne Zugang fällt raus, Punkt nie verschieben“, Weiler weglassen | E6 (18 statt 26 Einträge), S2 |
| M4 | Allgemeine Namen mit Zusatz „(Fürth)“ | E6, Test 2 |
| M5 | `index.html`, `public/`, `tests/fixtures/` machen die Auswahl voll; drei Specs ausdrücklich nennen | Test 6, S5 |
| M6 | `schema:export` nach S1, jeder Schritt erst mit `pnpm verify` grün | Schritte |
| G1 | `format.test.ts` Z. 482–483, 726 und Kommentare in `table.test.ts` in die Dateiliste | Dateien |
| G2 | `districtGroups` in eigenes Modul | E6, Dateien |
| G3 | Nachteil Fürth zuerst festhalten, ersten Sonntagslauf messen; Test 5b: Mögeldorf-Kandidat im selben Lauf in Nürnberg aufgenommen | E10, Test 5b, S8 |
| G4 | Rebase vor dem Push | S7 |
| G5 | Browser-Review: nativer Picker mit `optgroup`, dunkel, 53 Einträge, Querformat; „Kachel Fürth, Weg übersprungen“ | S5, Test 6 |
| G6 | Overpass-Abfrage bei Umsetzung abgleichen | E6, S1 |

Abgelehnt: keiner. Nutzerentscheide danach: Startbudget 102 kB mit Nachtrag ADR 0012; Bootstrap-Trockenlauf freigegeben (startet die Haupt-Session). Arbeit direkt auf `main` im Haupt-Checkout statt auf einem Branch.
