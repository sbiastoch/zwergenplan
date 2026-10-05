# Plan 0012 – Linien in der Wegzeit („ca. 25 Min. mit Bus 37 und U1“)

Status: Review eingearbeitet, freigegeben mit Änderungen (2026-10-05). Nutzerentscheidungen N1–N3 sind offen; die Empfehlungen sind als Standard eingetragen. Die Umsetzung beginnt nach der Antwort auf N1–N3.
Datum: 2026-10-05
Bezug:
- **ADR 0011** (Wegzeit-Tabelle Halt→Ort). Dieser Plan ändert dort Punkt 3 (welche Verbindung je Abfahrtsminute zählt) und ergänzt Punkt 4 (eine zweite Build-Datei). Das hält **ADR 0015** fest (Entwurf `docs/adr/0015-wegzeit-linien.md`).
- Plan 0009 (Öffi-Fahrzeit): E4 Auszug, E5 Tabelle, E6 Profil-CSA, E7 `wegzeit.json`, E8 Domäne, E9 Laden, E11 Rückfall, E15 Tests.
- ADR 0010 (`src/data` importiert zur Laufzeit nichts aus `src/domain` außer `geo`).
- Plan 0011 und ADR 0013 (Service Worker, noch nicht umgesetzt): Der Service Worker behandelt `wegzeit.json` „Netz zuerst“. Die neue Datei `linien.json` kommt in dieselbe Zeile (E9).
- Die ADR-Nummern 0013 und 0014 sind durch Plan 0011 belegt, deshalb **0015**.

## Ziel

Wo heute „ca. 25 Min. mit Bus & Bahn ab Gostenhof“ steht (Detail, Orts-Sheet der Karte), stehen die Linien der Verbindung:

> ca. 25 Min. mit Bus 37 und U1 ab Gostenhof

- Die Minuten und die Linien stammen aus **derselben** Wahl der Verbindung (E2). Genannt wird die häufigste Linienfolge im Fenster, deren Fahrzeit zur Angabe passt (E4, Schritt 5).
- Die Verbindung ist realistisch für Eltern mit Kinderwagen. Wege mit vielen Umstiegen, die nur eine Minute sparen, werden nicht genannt (E2).
- Fehlen die Linien (Datei lädt nicht, passt nicht, Ort zu Fuß näher), bleibt alles wie heute: „mit Bus & Bahn“ bzw. „zu Fuß“ (E10).
- Kein neuer Request, der vom Startpunkt abhängt. Die Invariante aus ADR 0011, Punkt 6, gilt unverändert (E9).

## Nicht-Ziele

- **Linien auf der Kachel.** Die Kachel zeigt weiter nur „25 Min.“ (Nutzerentscheidung N2, Empfehlung). → `docs/ideas.md`.
- Abfahrtszeiten, Haltestellennamen, Fußwege, eine Routenbeschreibung Schritt für Schritt. Das kann die VGN-App besser. → `docs/ideas.md` („Link zur VGN-Auskunft mit Start und Ziel“; der Startpunkt dürfte dabei nicht in einen Request gehen, das bräuchte ein eigenes ADR).
- Echtzeit, Störungen, Barrierefreiheit von Halten (Aufzüge). Der Feed hat dazu nichts Verlässliches.
- Linien auf der Karte (Marker, Linienverläufe).
- Ein anderes Zeitfenster als Di 8:30–10:30.
- Linienfarben oder Piktogramme der Verkehrsmittel. Text reicht für den ersten Schritt. → `docs/ideas.md`.

## Ausgangslage

### Was die Daten heute hergeben

- `data/oepnv/fahrplan.json` (Schema `Timetable`, `src/domain/schema.ts:176`): Jede Fahrt hat `route` mit dem Kurznamen der Linie („U1“, „36“, „202E“). Laut Kommentar ist das Feld „nur zur Fehlersuche“ da.
  - Im Auszug stecken 187 Linien.
  - **Das Verkehrsmittel fehlt.** „10“ kann im Feed eine Tram sein oder anderswo ein Bus.
- Der VGN-Feed (`routes.txt`) hat `route_type` und `route_desc`. Ausgewertet am 2026-10-05 im Feed vom 24.06.2026:

| `route_type` | `route_desc` | Beispiele | Anzeige (E1) |
|---|---|---|---|
| 0 | Tram | 4, 5, 6, 7, 8, 10, 11, D | „Tram 4“ |
| 1 | U-Bahn | U1, U2, U3 | „U1“ |
| 2 | S-Bahn, R-Bahn, Train | S1–S6, RB 11, IC 61 | „S1“, „RB 11“ |
| 3 | Stadtbus, Regionalbus, Kleinbus | 36, 113, 202E | „Bus 36“ |
| 3 | Rufbus, Anrufsammeltaxi, Linien(bedarfs)taxi | – | schon heute weggelassen (ADR 0011, Punkt 1) |

  Andere `route_type` kommen im Feed nicht vor.
- `scripts/pipeline/lib/gtfs.ts:298` liest `routes.txt` schon ein (Name, Bedarfsverkehr). `route_type` lässt sich dort mitnehmen.

### Wo die Linien heute verloren gehen

1. `scripts/transit/profile-csa.ts` (`scanProfiles`): Je Steig steht ein Profil „Abfahrt → früheste Ankunft am Ort“. Welche Fahrt dahintersteht und wo umgestiegen wird, merkt sich die Rechnung nicht.
2. `scripts/transit/table.ts` (`buildTransitTable`): Je Zelle (Haltbereich × Ort) bleibt nur der Median über 120 Abfahrtsminuten, ein Byte.
3. `src/domain/transit.ts` (`transitReach`): nimmt je Ort das Minimum über die Zugangshalte, merkt sich aber nicht, welcher Halt gewonnen hat.
4. `src/ui/format.ts:235` (`reachLong`): schreibt fest „mit Bus & Bahn“.

### Messungen (Prototyp, 2026-10-05)

Der Wegwerf-Prototyp lag außerhalb des Repos. Er nutzt `buildNetwork`, `egressSeconds`, `tableRows` und `cellValue` aus dem Repo und eine Kopie von `scanProfiles`, die je Profil-Eintrag die Fahrt und den Anschluss-Eintrag speichert. Daten: `data/oepnv/fahrplan.json` (Stichtag 13.10.2026), die Orte aus `site.json` vom 04.10.2026, also **556 Haltbereiche × 76 Orte**. Die Linienbezeichnung kam aus `routes.txt` (Name → `route_type`).

**M1 – Rückverfolgung ist exakt.** Mit gespeicherter Fahrt und gespeichertem Anschluss liefert die Rechnung für alle 42 256 Zellen dieselben Minuten wie die Produktion. Laufzeit 7,5 s statt 4,8 s, davon das meiste fürs Zusammensetzen von Texten je Minute (vermeidbar, E5).

**M2 – Ohne Umstiegsaufschlag sind die Linien unbrauchbar.** Mit 1 Min. Puffer je Umstieg (ADR 0011) wählt die schnellste Verbindung oft 3–7 Fahrzeuge, um eine Minute zu sparen. Beispiel: „Bus 51 › Bus 53 › Bus 36 › U3 › Tram 4 › Bus 20 › Bus 31“.

**M3 – Umstiegsaufschlag, nur für die Wahl der Verbindung.** Jeder Umstieg zählt beim Vergleich wie *P* Minuten mehr. Gezählt wird aber die echte Ankunft. Linien je Zelle = häufigste Linienfolge im Fenster:

| *P* | 1 Linie | 2 | 3 | 4 | 5+ | Kombinationen | Anteil der Minuten mit der genannten Folge |
|---|---|---|---|---|---|---|---|
| 0 | 9,1 % | 34,6 % | 37,7 % | 14,5 % | 4,1 % | 3 511 | 67,6 % |
| 3 Min. | 12,1 % | 44,7 % | 35,6 % | 7,4 % | 0,3 % | 2 559 | 71,9 % |
| **5 Min.** | **13,0 %** | **47,5 %** | **32,9 %** | **6,4 %** | **0,2 %** | **2 437** | **73,2 %** |
| 10 Min. | 14,2 % | 51,8 % | 29,7 % | 4,3 % | 0,0 % | 2 252 | 75,4 % |

**M4 – Minuten aus derselben Verbindung (Variante K, E2).** Die Zelle ist der Median der *echten* Tür-zu-Tür-Zeit der jeweils gewählten Verbindung. Gegenüber heute:

| *P* | Mittel | Median | p90 | p99 | max | > 5 Min. länger | neu „über 2 Std.“ |
|---|---|---|---|---|---|---|---|
| 3 Min. | +0,21 | 0 | +1 | +3 | +6 | 0,0 % | 1 Zelle |
| **5 Min.** | **+0,46** | **0** | **+2** | **+4** | **+12** | **0,3 %** | **1 Zelle** |

Zum Vergleich: Rechnet man den Aufschlag *in* die Minuten ein (also eine Modelländerung statt einer Auswahlregel), steigen sie bei *P* = 4 Min. im Mittel um 6,5 Min. Das scheidet aus.

**M5 – Größe der Linien-Daten** (5 Min., Kodierung wie E7, eigene Datei):

| Inhalt | roh | gzip |
|---|---|---|
| heute `wegzeit.json` | 62,4 kB | 42,0 kB |
| alle Linienfolgen, ein Wörterbuch, `Uint16` je Zelle | 139,1 kB | **50,6 kB** |
| dasselbe ohne Aufschlag | 155,2 kB | 58,6 kB |
| nur die erste Linie je Zelle, `Uint8` | 57,0 kB | 8,2 kB |
| alles in `wegzeit.json` (zum Vergleich) | 204–218 kB | 89–103 kB |

Die erste Linie wiederholt sich je Starthalt stark, daher die kleine Datei. Für die ganze Folge reicht das nicht.

## Entscheidungen

### E1 – Verkehrsmittel in den Auszug (Schemaänderung)

- `TimetableTrip` bekommt ein Pflichtfeld `mode: z.enum(["tram", "u-bahn", "bahn", "bus"])`.
  - Abbildung im Extractor (`extractTimetable`): `route_type` 0 → `tram`, 1 → `u-bahn`, 2 → `bahn`, 3 → `bus`.
  - Jeder andere Wert wirft `GTFS: Linie <name> hat unbekannten route_type <x>`. Der Lauf ist lokal und wird im Skill begleitet; still raten wäre schlechter.
  - **Geworfen wird nur für Fahrten, die im Auszug bleiben (Review W5).** `routes` wird weiter vollständig eingelesen, `route_type` aber erst beim Übernehmen einer Fahrt in `kept` abgebildet. Eine Bedarfs- oder inaktive Route mit erweitertem Typ (700, 900 …) bricht den Lauf nicht ab.
  - Der Kommentar an `route` wird zu „Kurzname der Linie („U1“, „36“), für die Anzeige der Linien (Plan 0012)“.
- Warum ein Enum statt der GTFS-Zahl: Der Datenvertrag soll lesbar sein, und mehr als vier Arten braucht die Anzeige nicht.
- `data/oepnv/fahrplan.json` entsteht neu mit `pnpm pipeline oepnv` (nie von Hand, CLAUDE.md). Ein Auszug ohne `mode` besteht die Prüfung nicht. `readCurrentTimetable` liefert dann `undefined`, der Lauf schreibt den Auszug also ohne `--force` neu.
  - **Achtung Stichtag:** `pickServiceDay` hängt an `today()`. Nach dem 13.10.2026 wählt der Lauf einen späteren Dienstag. Das ist gewollt (wie bei jeder Aktualisierung), steht aber in der Commit-Nachricht.
  - Der Auszug wird ca. 50 kB größer (3 405 Fahrten × `"mode":"bus",`).
- Die Fixture `tests/fixtures/oepnv/fahrplan.json` bekommt `mode` von Hand (fiktive Testdaten, Plan 0009, E15). Die Linien werden dabei sprechend umbenannt: `T1` → `"route":"1","mode":"tram"`, `B2` → `"route":"2","mode":"bus"`. In der Anzeige heißt das dann „Tram 1“ und „Bus 2“.
- **Anzeigename** (`lineLabel(route, mode)` in `scripts/transit/lines.ts`, rein): `tram` → „Tram 〈route〉“, `bus` → „Bus 〈route〉“, `u-bahn` und `bahn` → `route` unverändert („U1“, „S2“, „RB 11“).
  - **Leerzeichen im Namen werden zu U+00A0** (geschütztes Leerzeichen, Review W4). So landen „Bus“ und „37“ nie auf zwei Zeilen, auch nicht bei „RB 11“ aus dem Feed.
  - Das Orts-Sheet setzt `overflow-wrap: anywhere` (`.place-where`, `src/ui/styles/map.css:140`). Der `<span>` mit `reachLong` in `PlaceSheet.tsx:30` (und zur Einheitlichkeit in `DetailDialog.tsx:104`) bekommt deshalb die Klasse `reach-long` mit `overflow-wrap: normal`, damit „202E“ nicht mitten im Namen bricht. `reachLong` bleibt ein reiner String. Die Namen sind kurz, ein Umbruch an den normalen Leerzeichen zwischen den Namen genügt. Das prüft E4 bei 320 px/200 %.
  - Der Name entsteht im Build und steht fertig in `linien.json` (E7). So braucht das Start-JS keinen Code dafür.
  - Kein abgeleiteter Wert im Datenvertrag: `linien.json` ist ein Build-Artefakt wie `wegzeit.json`.
- `schema/*.json` ist nicht betroffen, denn `Timetable` wird nicht exportiert (`scripts/export-schema.ts`).

### E2 – Welche Verbindung zählt: Umstiegsaufschlag 5 Min. (Variante K, Nutzerentscheidung N1)

**Regel** (ersetzt ADR 0011, Punkt 3, Satz 2):
- Je Abfahrtsminute zählt die Verbindung mit der kleinsten **bewerteten Ankunft** = echte Ankunft am Ort + **5 Min. je Umstieg**.
- Die Zelle enthält den Median der **echten** Tür-zu-Tür-Zeit dieser Verbindungen, wie bisher mit Warten am ersten Halt (Formel `cellValue` unverändert).
- Ein Umstieg ist jeder Wechsel des Fahrzeugs, auch zu Fuß zu einem anderen Steig. Sitzenbleiben in derselben Fahrt ist kein Umstieg.
- Das Umsteigemodell selbst bleibt: Fußweg + 1 Min. Puffer, ≤ 400 m, nicht verkettet. Der Aufschlag kommt **nur** in den Vergleich, nie in die Ankunft.

**Begründung:**
- Die Minuten und die genannten Linien gehören zur selben Verbindung. Ohne das stünde „ca. 25 Min. mit Bus 37 und U1“, obwohl die 25 Min. von einem Weg mit vier Fahrzeugen stammen.
- Die Minuten ändern sich kaum (M4: im Mittel +0,46 Min., p99 +4 Min.). Sie werden eher ehrlicher: Mit Kinderwagen nimmt man selten drei Umstiege für eine Minute.
- Es bleibt **ein** Lauf je Ort. Ein zweiter Lauf nur für die Linien (Variante L) hätte die Build-Zeit verdoppelt und Minuten und Linien entkoppelt.
- 5 statt 3 Min.: Wege mit 4+ Linien sinken von 7,7 % auf 6,6 %, solche mit ≤ 2 Linien steigen von 56,8 % auf 60,5 %. Die Minuten verschieben sich dabei nur wenig mehr (p99 +4 statt +3). 10 Min. bringen wenig mehr (≤ 2 Linien 66,0 %). Gemessen als Variante L liegt die genannte Verbindung dann aber bei 10,6 % der Zellen mehr als 5 Min. über den Minuten der schnellsten (bei 5 Min.: 3,8 %); für Variante K ist 10 Min. nicht gemessen.

**Konstante:** `TRANSFER_PENALTY_SECONDS = 300` in `scripts/transit/profile-csa.ts`, mit Kommentar auf diesen Plan und ADR 0015.

**Alternativen** (für N1):
- **Variante L:** Minuten wie heute aus der schnellsten Verbindung, Linien aus einem zweiten Lauf mit Aufschlag. Die genannte Verbindung braucht dann im p90 4 Min. länger als angezeigt, die Build-Zeit verdoppelt sich.
- **Variante 0:** kein Aufschlag, Linien der schnellsten Verbindung. Ergibt in 18,6 % der Zellen 4+ Linien (M3), dazu die größte Datei.
- **Nur erste Linie:** „ca. 25 Min., los mit Bus 37“. Mit 8 kB winzig, sagt aber wenig.

### E3 – Profil-CSA mit Aufschlag und Rückverfolgung

`scanProfiles(net, egress, opts?: { penaltySeconds?: number })`, Standard `TRANSFER_PENALTY_SECONDS`.

- **Bewertung:** Der Scan rechnet weiter mit einer Zahl je Profil-Eintrag und Fahrt, jetzt der bewerteten Ankunft. Umsteigen zum Eintrag `e` kostet `pArr[e] + penalty`. Abgang zum Ort und Sitzenbleiben kosten nichts extra.
  - Das ist exakt: Der Aufschlag ist additiv und hängt nicht von der Uhrzeit ab, die FIFO-Eigenschaft der Profile bleibt. Die Pareto-Regel (spätere Abfahrt, nicht spätere Bewertung) gilt unverändert auf der Bewertung.
- **Zusätzlich je Profil-Eintrag** (typisierte Arrays der Länge `connections` wie `pDep`/`pArr`):
  - `pReal: Float64Array`: echte Ankunft am Ort der gewählten Verbindung.
  - `pTrip: Int32Array`: Fahrt, in die man an diesem Steig einsteigt.
  - `pCont: Int32Array`: Profil-Eintrag des nächsten Fahrzeugs, `-1` = Abgang zum Ort.
- **Je Fahrt** zusätzlich `inReal` und `tripCont` (wie `inTrip`).
- **Gleichstand, festgeschrieben** (Vergleiche immer strikt `<`):
  1. Sitzenbleiben (der bisherige Wert der Fahrt) vor Aussteigen.
  2. Abgang zum Ort vor Umsteigen.
  3. Umstiege in der Reihenfolge der CSR-Liste (`transferStart`/`transferTo`).

  So ist das Ergebnis deterministisch, und bei gleicher Bewertung gewinnt der Weg mit weniger Fahrzeugen.
- **Überschreiben eines Eintrags** (`pDep[h] === d`): `pArr`, `pReal`, `pTrip` und `pCont` werden gemeinsam ersetzt.
  - Ein Verweis auf `h` entsteht nur aus Verbindungen mit Ankunft ≤ `d − 60 s`. Die werden erst später gescannt, weil absteigend nach Abfahrt sortiert wird.
  - Ein Eintrag ändert sich also nicht mehr, nachdem jemand auf ihn verweist. Das steht als Kommentar im Code, und Test T5 prüft es.
- **API von `Profiles`:**
  - `earliestArrival(stop, t)` liefert weiter die **bewertete** Ankunft (Namen beibehalten, Kommentar ergänzt; nur Tests nutzen es).
  - Neu: `sweep(stop, from, step, count, outRated, outReal, outEntry)`. Je Minute die bewertete Ankunft, die echte Ankunft und den Eintrag (`-1` = keiner).
  - Neu: `trips(entry): number[]`, die Fahrten der Verbindung in Reihenfolge. Folgt `pCont`.
    - Schutz vor einem Zyklus durch einen Programmierfehler (Review): `pDep` muss entlang `pCont` **streng steigen**, sonst `Error`. Das schließt Zyklen genau aus und begrenzt keine gültige lange Verbindung.
- **Zahlen:** Abfahrt und Ankunft sind ganze Sekunden, Fußwege (`walkMinutes · 60`) und damit Bewertungen Gleitkommazahlen. Tests vergleichen Bewertungen deshalb mit Toleranz `1e-6` s, nicht mit `===`.
- `penaltySeconds: 0` ergibt genau die heutigen Profile. Test T1 prüft das; die bestehenden Tests laufen mit `0`, weil ihre Erwartungen auf dem 1-Min.-Modell beruhen.

### E4 – Zellwert und Linien je Zelle

In `buildTransitTable` je Zeile (Haltbereich) und Minute `m` (wie Plan 0009, E5, Schritt 1, jetzt mit Bewertung):
- Kandidaten:
  - je Steig `s` des Bereichs der Profil-Eintrag (bewertet, echt, Eintrag);
  - der direkte Abgang `t + abgang_s`, mit Bewertung = echt und ohne Linien.
- Gewählt wird der Kandidat mit der kleinsten Bewertung.
  - Gleichstand: zuerst Abgang vor Fahrt, dann Steige in der Reihenfolge von `row.steige`.
  - Das ist eine Änderung: Heute nimmt `Math.min` nur die Zeit, ohne Reihenfolge.
- `x_m` = echte Ankunft − t, in Minuten. Der Zellwert bleibt `cellValue(x)`.
- `L_m` = die Linienfolge der gewählten Verbindung als Liste von Anzeigenamen (E1). Aufeinanderfolgende gleiche Namen werden zusammengefasst („U1, U1“ → „U1“, z. B. Wechsel in einen Verstärker). Beim Abgang ist `L_m` leer.

**Linien der Zelle** (`cellLines`, reine Funktion in `scripts/transit/lines.ts`):
1. Ist der Zellwert `255`, gibt es keine Linien.
2. Zähle die Folgen `L_m` über alle Minuten mit endlichem `x_m`.
3. Nimm die häufigste. Bei Gleichstand gewinnt der kleinere Median von `x` über ihre Minuten, danach der kleinere Text. Der Text wird per Code-Unit-Vergleich geordnet, mit einer eigenen Funktion `cmp` in `lines.ts`. Die aus `gtfs.ts` ist nicht exportiert und für `scripts/transit` verboten (`transit-build-pure`).
4. Ist die gewählte Folge leer (Abgang), gibt es keine Linien.
5. **Passt die Folge zur Angabe? (Review W1)** Sei `d` = |Median von `x` über die Minuten der gewählten Folge − Zellwert|. Ist `d > max(3 Min., 25 % des Zellwerts)`, gibt es keine Linien.
   - Sonst stünde „ca. 10 Min. mit Bus 37 und U1“, obwohl diese Folge im Median 19 Min. braucht.
   - Eine feste Grenze von 10 Min. filterte praktisch nichts (p99 der Abweichung 9 Min., M3).
   - Die Formel ist ein Startwert. Schritt 3 misst die Verteilung von `d` (p50/p90/p99) und den Anteil der Zellen, die dadurch ihre Linien verlieren. Ist der Anteil > 10 %, wird erst nachgefragt, bevor es weitergeht.
   - Konstanten `LINES_FIT_MIN_MINUTES = 3`, `LINES_FIT_SHARE = 0.25` in `scripts/transit/lines.ts`.
   - `build-data` meldet die Anzahl (`stats.outliers`, E7).

**Laufzeit:** Text entsteht nicht je Minute.
- `comboOf: Int32Array(connections)` merkt sich je Profil-Eintrag die Nummer seiner Linienfolge (`-1` = noch nicht bestimmt).
- Die Folgen werden über einen Schlüssel `Map<string, number>` aus den Anzeigenamen dedupliziert, global über alle Orte.
- Ziel: `build-data` gesamt ≤ 10 s auf dem CI-Runner (wie Plan 0009, E6). Die Wegzeit-Zeile von `build-data` zeigt die Laufzeit schon.

### E5 – Zellen ohne Linien

Eine Zelle hat keine Linien (Wert 0 in `linien.json`), wenn
- der Zellwert 255 ist (also auch nie bei „über 2 Std.“; im Browser zeigt `reachLong` bei `over` ohnehin keine Linien, E10),
- der Ort vom Halt zu Fuß am besten erreicht wird (leere Folge),
- oder der Ausreißer-Schutz greift.

Der Browser zeigt dann „mit Bus & Bahn“ wie heute (E10).

### E6 – Kennung, damit beide Dateien zusammenpassen

- `wegzeit.json` bekommt ein Feld `id: string`. Das ist FNV-1a 32 Bit als 8-stellige Hex-Zahl über `JSON.stringify([serviceDay, source.modified, penaltySeconds, places, lat, lon, minutes])`.
  - Stichtag, Feedstand und Aufschlag gehören dazu (Review): Sonst hätte eine neue `linien.json` mit gleichen Minuten dieselbe `id` wie eine alte aus dem Cache.
  - Die Funktion `contentId` steht in `scripts/transit/table.ts`, rein, mit Test (fester Wert für eine kleine Eingabe).
  - Die Formatversion bleibt `1`: Das Feld ist additiv, und `decodeTransitTable` braucht es nicht. Eine alte `wegzeit.json` ohne `id` passt eben zu keiner `linien.json`, dann gibt es keine Linien.
- `linien.json` trägt dieselbe `id` im Feld `table`. Der Browser nimmt die Linien nur bei Gleichheit (E8).
- Warum nicht nur Längen prüfen: Ein neuer Fahrplan kann dieselbe Zahl von Zeilen und Orten haben, aber andere Zeilen. Falsche Linien wären schlimmer als keine.

### E7 – Datei `public/data/linien.json`

Typ in `src/domain/transit-types.ts` (Build-Artefakt, kein Zod im Client, wie `TransitTableFile`):

```ts
/** `public/data/linien.json` (Plan 0012, E7): Linien je Zelle der Wegzeit-Tabelle */
export interface TransitLinesFile {
  version: 1;
  /** `id` der passenden `wegzeit.json` (E6) */
  table: string;
  /** Namensnennung wie `wegzeit.json` (CC BY-SA 3.0 DE, ADR 0011 Punkt 5) */
  source: TransitSource;
  /** Anzeigenamen, sortiert (Code-Unit): „Bus 36“, „S2“, „Tram 4“, „U1“ */
  lines: string[];
  /** Linienfolgen: Indizes in `lines`, in Fahrtreihenfolge; sortiert nach ihrem Text „Bus 36|U1“ */
  combos: number[][];
  /**
   * Base64 eines `Uint8Array(Zeilen × Spalten × 2)`, zeilenweise wie `minutes`, je Zelle Uint16 little-endian:
   * 0 = keine Linien (E5), sonst `combos[v − 1]`.
   */
  cells: string;
}
```

- **Eigene Datei statt Erweiterung von `wegzeit.json`:**
  - Die Minuten sind der kritische Pfad (Filter „bis … Min.“, Sortierung, Platzhalter). Sie sollen nicht auf 51 kB warten, die nur Detail und Orts-Sheet brauchen.
  - Die Linien sind optional. Scheitert ihre Datei, bleibt die Wegzeit (E10).
  - Getrennte Budgets: Das 64-kB-Budget von `wegzeit.json` bleibt aussagekräftig.
- **Budget** `.size-limit.json`: `{ "name": "Linien-Daten", "path": "dist/data/linien.json", "limit": "64 kB", "gzip": true }`.
  - Gemessen 50,6 kB (M5). Wie bei `wegzeit.json` wächst die Datei linear mit den Orten, ca. 0,67 kB gzip je Ort, Grenze also bei rund 95 Orten.
  - Hebel, falls es eng wird (ungemessen): Folgen je Spalte statt global nummerieren (`Uint8`), oder die erste Linie getrennt zeilenweise und den Rest spaltenweise ablegen. Dann eine neue Entscheidung, keine stille Anhebung.
- `build-data` schreibt die Datei nur, wenn es auch `wegzeit.json` schreibt (Auszug vorhanden). Der Fixture-Build schreibt sie also immer.
- **Gate gegen einen stillen Ausfall (Review W3):** `build-data` bricht ab (`process.exit(1)`), wenn
  - keine Zelle Linien hat (beide Builds, auch Fixture), oder
  - mit echten Daten der Anteil der Zellen mit Wert ≠ 255 ohne Linien über `MAX_WITHOUT_LINES` liegt.

  Die Schwelle setzt Schritt 3: gemessener Anteil + 5 Prozentpunkte, als Konstante mit Messwert und Datum im Kommentar.
- **Statistik:** `buildTransitTables` liefert `stats: { combos, withoutLines, outliers, cells }` (`cells` = Zellen mit Wert ≠ 255) für Meldung und Gate.
- **Byte-Reihenfolge:** `cells` wird im Build und im Browser von Hand als little-endian gelesen und geschrieben (`b[2i] | (b[2i + 1] << 8)`). Kein `Uint16Array` über einen fremden Puffer, damit die Reihenfolge der Plattform keine Rolle spielt.

### E8 – Domäne: Linien dekodieren und am Ergebnis tragen

`src/domain/transit-types.ts`:
- `TransitTableFile` und `TransitTable` bekommen `id: string`. In `TransitTable` ist `id` optional, weil eine alte Datei aus dem HTTP-Cache es nicht hat.
- neu `TransitLines`, dekodiert: `{ names: readonly (readonly string[])[]; cells: Uint16Array }`. `names[v − 1]` sind die Anzeigenamen der Folge `v`.
- `TransitReach` bekommt `lines?: readonly string[]`. Gesetzt ist es nur bei `byFoot === false` und wenn Linien vorliegen.

`src/domain/transit.ts` (Lazy-Chunk, Plan 0009, E10):
- `decodeTransitTable` übernimmt `file.id`, wenn es ein String ist.
- neu `decodeTransitLines(file: TransitLinesFile, table: TransitTable): TransitLines | undefined`. `undefined`, wenn
  - `version !== 1`,
  - `table.id === undefined` oder `file.table !== table.id`,
  - `cells` kein gültiges Base64 ist oder die Länge ≠ Zeilen × Spalten × 2,
  - ein Index in `combos` außerhalb von `lines` liegt, eine Folge leer ist,
  - oder ein Zellwert > `combos.length`.

  Die Typprüfung läuft wie bei `decodeTransitTable` ohne Zod (die Datei kommt ungeprüft aus dem Netz).
- `transitReach(table, origin, lines?: TransitLines)`:
  - merkt sich je Spalte zusätzlich die Zeile des Minimums (`bestRow: Int32Array`, `-1`). Bei Gleichstand bleibt die erste Zeile (strikt `<`, wie heute `Math.min`, jetzt mit Reihenfolge).
  - `lines` am Ergebnis: nur wenn nicht `byFoot`, `lines` vorhanden, `bestRow ≥ 0` und der Zellwert ≠ 0.
  - Die Signatur bleibt ohne drittes Argument rückwärtskompatibel. Das Ergebnis ist dann wie heute.
- Kein neuer Export, den die UI statisch importiert (`transit-only-lazy`).

### E9 – Laden: dieselben Anlässe, eigenständig

`src/data/transit.ts`:
- `loadTransit` lädt `linien.json` **beim selben Aufruf** wie `wegzeit.json` und die Rechenlogik. Damit gelten genau die Anlässe aus ADR 0011, Punkt 6: Kind-Sheet, Karte, „Nochmal laden“, Start mit gespeichertem Stadtteil.
  - URL und Inhalt sind für alle gleich. Kein Request hängt vom Startpunkt ab.
- **Die Minuten warten nicht auf die Linien:**
  - `TransitLoad` bekommt `lines: Promise<TransitLinesFile | undefined>`, ein Versprechen, das nie wirft.
  - `loadTransit` löst wie heute auf, sobald Tabelle und Logik da sind (oder das Zeitlimit greift).
  - **Erst nach der Tabelle (Review W2):** `linien.json` wird erst angefordert, wenn die Antwort von `wegzeit.json` erfolgreich gelesen ist. So teilen sich die Linien die Bandbreite nicht mit Tabelle und `site.json`, vor allem beim Start mit gespeichertem Stadtteil. Mit `priority: "low"` (`RequestInit.priority`; ignoriert ein Browser das, schadet es nicht). `TransitEnv.fetch` bekommt `priority` im `init`-Typ.
  - Ohne Tabelle keine Linien-Anfrage. Es bleibt derselbe Aufruf zum selben Anlass, die Invariante aus ADR 0011, Punkt 6, gilt also weiter.
  - Der Abruf der Linien hat einen eigenen `AbortController` und Timer mit `TRANSIT_TIMEOUT_MS`, gestartet mit der Anfrage. Diesen Timer räumt **nicht** das `finally` von `loadTransit` ab (`transit.ts:70`), sondern das Ende des Linien-Abrufs.
- `retry` umgeht den HTTP-Cache für beide Dateien.
- Kein Laufzeit-Import aus `src/domain` (ADR 0010 bleibt).

`src/ui/use-transit.ts`:
- `TransitState` „bereit“ bekommt `lines?: TransitLinesFile`. Neue Aktion `{ type: "lines"; attempt; lines }` setzt sie nur in „bereit“ mit gleichem `attempt`, sonst bleibt der Zustand.
- **Zustellung der Linien (Review B1):**
  - Der Effekt in `useTransit` hängt an `attempt`. `attempt` ist nur in „laedt“ ungleich 0 (`use-transit.ts:150`). Nach `loaded` läuft also das Aufräumen, `live` wird `false`.
  - Kämen die Linien später als die Tabelle, verwürfe ein `if (!live) return` sie immer. Bei 51 kB gegen 42 kB ist das der Normalfall.
  - Deshalb: `load.lines.then((lines) => dispatch({ type: "lines", attempt, lines }))` **ohne** `live`-Prüfung, in einem `then` erst nach `loaded`, also innerhalb des `then` von `loadTransit`.
  - Geschützt wird allein über den Reducer: nur in „bereit“, nur mit gleichem `attempt`. Ein veralteter Versuch ändert nichts. Nach dem Unmount ist ein `dispatch` in React 19 harmlos.
  - Test S2 prüft genau diesen Ablauf am Hook (Tabelle löst auf, Effekt räumt auf, Linien kommen danach an → „bereit“ mit `lines`), E2E E6 im Browser.
- `TransitLogic` (struktureller Typ) bekommt `decodeTransitLines` und das dritte Argument von `transitReach`.
- `decodeFor` dekodiert die Tabelle nur noch abhängig von `file` und `logic`, nicht vom ganzen `state` (`useMemo` mit `[file, logic, placeKeys]`). Sonst dekodiert jede Ankunft der Linien die Tabelle neu.
- Neu `decodeLinesFor(lines, table, logic)` mit `useMemo`, dann `resolveReach(state, table, origin, lines)`.
- **Bewusst:** Ist das Detail schon offen, wenn die Linien ankommen, wechselt der Text von „mit Bus & Bahn“ auf die Linien. Das ist eine Zeile in einem Dialog, kein Layoutsprung der Seite (CLS zählt nur außerhalb von Nutzereingaben).
- Passt `linien.json` nicht (`undefined` aus `decodeTransitLines`), ist das **kein** `stale`. Die Wegzeit bleibt, nur ohne Linien. Kein Neuladen, kein Fehler in der Konsole.
- `reloadAfterRetry` bleibt unverändert; die Linien zählen dafür nicht.

Service Worker (Plan 0011, noch nicht umgesetzt): Schritt 7 ergänzt Plan 0011 und ADR 0013 um zwei Sätze.
- `linien.json` steht in der Zeile von `wegzeit.json` in Plan 0011, E4 („Netz zuerst, offline der Cache“).
- Beim Frische-Anlass aus Plan 0011, E4a lädt `linien.json` mit neu. Die alten Linien gelten nicht mehr, weil `id` ≠ `table` sie verwirft.

### E10 – Anzeige (Nutzerentscheidung N3)

`src/ui/format.ts`:
- `reachLong(reach, origin)`:
  - mit `reach.lines`: „ca. 25 Min. mit Bus 37 und U1 ab Gostenhof“;
  - ohne Linien wie heute: „ca. 25 Min. mit Bus & Bahn ab Gostenhof“, „ca. 10 Min. zu Fuß ab …“, „über 2 Std. mit Bus & Bahn ab …“.
  - Bei „über 2 Std.“ nie Linien, auch wenn `reach.lines` gesetzt wäre (Review).
- `lineList(lines)` (neu, intern): eine Linie „U1“, zwei Linien „Bus 37 und U1“, drei und mehr „Bus 37, U1 und Tram 4“. Das ist die deutsche Aufzählung in Fahrtreihenfolge.
  - **Warum keine Pfeile „Bus 37 › U1“:** Screenreader lesen „›“ je nach Einstellung als „rechtes Winkelanführungszeichen“ oder gar nicht. Die Aufzählung liest sich laut wie geschrieben und ist ein reiner String (keine versteckten Texte im Markup).
  - Alle Linien stehen da, auch bei fünf oder sechs. Das sind 0,2 % der Zellen (M3). Abkürzen würde verschweigen, wie umständlich der Weg ist. Detail und Orts-Sheet brechen normal um (Text-Gate).
- `reachShort` (Kachel, Orts-Liste der Karte) bleibt unverändert (N2).
- `reachNote` (Statuszeile) bleibt unverändert.
- `transitSourceNote` (Kind-Sheet): Der Einleitungssatz wird zu „Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß für einen Dienstagvormittag, inklusive Warten. Verbindungen mit weniger Umstiegen gehen vor; genannt sind die Linien der häufigsten. Fahrplan: …“.
  - Der Aufschlag wirkt auf die Wahl und damit auf Minuten **und** Linien (Review). Den Zahlenwert nennt der Satz nicht, er steht in ADR 0015.
  - Länge bei 320 px/200 % prüft das bestehende `expectMobileUx` des Kind-Sheets.

Komponenten: keine Logik neu. `DetailDialog.tsx:104` und `karte/PlaceSheet.tsx:30` rufen schon `reachLong` und bekommen nur die Klasse `reach-long` (E1).

### E11 – Architektur, Lizenz, Doku

- `docs/architecture.md`:
  - Datenfluss: `linien.json` neben `wegzeit.json`.
  - Abschnitt Wegzeit: Linien-Datei, eigenständig geladen, optional.
  - Invariante „Kein Request hängt davon ab …“: „Wegzeit-Tabelle und Linien laden …“.
- Keine neue Abhängigkeit, keine neue dependency-cruiser-Regel.
  - `scripts/transit/lines.ts` fällt unter `transit-build-pure`, weil die Regel auf den Ordner zielt. Das prüft Schritt 3.
- **Lizenz:** `linien.json` ist wie `wegzeit.json` eine Abwandlung der VGN-Daten. Gleiche Lizenz, `source` in der Datei, README-Absatz „Abgewandelt“ um „und die Linien je Wegzeit (`data/linien.json`)“ ergänzt.
- **ADR 0015** (Entwurf liegt bei): Umstiegsaufschlag in der Wahl, Minuten aus derselben Verbindung, `linien.json`, `mode` im Auszug.
- `docs/ideas.md`: Linien auf der Kachel; Link zur VGN-Auskunft; Piktogramme und Linienfarben.

## Struktur

```
src/domain/schema.ts                 TimetableTrip.mode (E1)
scripts/pipeline/lib/gtfs.ts         route_type → mode, Fehler bei Unbekanntem (E1)
tests/fixtures/oepnv/fahrplan.json   mode, Linien „1“ (Tram), „2“ (Bus) (E1)
data/oepnv/fahrplan.json             neu erzeugt mit `pnpm pipeline oepnv` (E1)
scripts/transit/profile-csa.ts       Aufschlag, pReal/pTrip/pCont, sweep mit Eintrag, trips() (E3)
scripts/transit/lines.ts             neu: lineLabel, cellLines, encodeLines (E1, E4, E7)
scripts/transit/table.ts             Wahl je Minute mit Bewertung, contentId, buildTransitTables → { table, lines } (E4, E6)
scripts/build-data.ts                schreibt linien.json, meldet Zellen ohne Linien (E7)
src/domain/transit-types.ts          id, TransitLinesFile, TransitLines, TransitReach.lines (E7, E8)
src/domain/transit.ts                decodeTransitLines, transitReach(…, lines?) (E8)
src/data/transit.ts                  linien.json eigenständig (E9)
src/ui/use-transit.ts                Aktion „lines“, decodeLinesFor, resolveReach(…, lines) (E9)
src/ui/format.ts                     reachLong mit Linien, transitSourceNote (E10)
src/ui/DetailDialog.tsx, src/ui/karte/PlaceSheet.tsx, Styles   Klasse „reach-long“ mit overflow-wrap: normal (E1)
.size-limit.json                     „Linien-Daten“ 64 kB (E7)
docs/adr/0015-wegzeit-linien.md      neu (E11)
docs/architecture.md, README.md, docs/ideas.md, docs/plans/0011-pwa-push.md, docs/adr/0013-pwa-service-worker.md
```

`buildTransitTable` wird zu `buildTransitTables(timetable, places, opts?: { egressMeters?: number; penaltySeconds?: number }) → { table: TransitTableFile; lines: TransitLinesFile; stats: { combos: number; withoutLines: number; outliers: number; cells: number } }`. Der alte Name verschwindet. Aufrufer sind nur `build-data.ts` und Tests (knip).

## Tests

Test-first für Domänen- und Build-Logik (CLAUDE.md). Die Unit-Tests laufen in `America/Los_Angeles`, ohne Netz.

**Pipeline / Schema**
- G1 `gtfs.test.ts`: `route_type` 0/1/2/3 → `tram`/`u-bahn`/`bahn`/`bus` im Auszug. Unbekannter Typ (`7`) wirft mit Linienname im Text.
- G2 Schema-Test: Eine Fahrt ohne `mode` oder mit `mode: "faehre"` ist ungültig.
- G3 `data:validate` mit der neuen Fixture grün (läuft in `check:fast`).

**Profil-CSA** (`profile-csa.test.ts`)
- T1 Mit `penaltySeconds: 0` sind alle bestehenden Tests unverändert grün. Dazu kommt der Satz „gleicht der Vorwärts-Referenz“ (Fixture und Zufallsnetz) mit Aufschlag 0.
- T2 **Referenz mit Aufschlag:** eine Vorwärts-CSA in Runden (nur Testcode). Runde *k* erlaubt höchstens *k* Umstiege und liefert `arr_k`; Referenz = `min_k (arr_k + k · P)`.
  - Gerechnet wird **bis zum Fixpunkt**: bis eine Runde nichts mehr verbessert, höchstens so viele Runden wie Fahrten. Eine feste Grenze wie *k* ≤ 8 könnte bei kleinem *P* zu früh enden.
  - Für jeden Steig und jede Minute (Fixture und Zufallsnetz) muss die bewertete Ankunft der Profil-CSA gleich sein, mit Toleranz `1e-6` s, bei *P* = 300 und *P* = 120.
- T3 **Rückverfolgung zulässig:** Für jeden Eintrag aus `sweep` (Zufallsnetz) gilt:
  - `trips(entry)` ergibt eine fahrbare Kette: Einstieg erlaubt, Ausstieg erlaubt, Umstieg ≤ 400 m mit Fußweg + 60 s Puffer, Abgang ≤ 800 m.
  - Ihre echte Ankunft ist `pReal`.
  - `pReal + (Fahrten − 1) · P` = bewertete Ankunft (Toleranz `1e-6` s).
  - `pDep` steigt entlang `pCont` streng.
- T4 Kleine Netze mit fester Erwartung:
  - direkte Fahrt 4 Min. langsamer als ein Weg mit einem Umstieg → direkte Fahrt (*P* = 5 Min.);
  - 6 Min. langsamer → Umstieg; echte Ankunft jeweils richtig.
- T5 Gleichstand: Sitzenbleiben vor Abgang vor Umstieg. Zwei Umstiege gleicher Bewertung → der erste der CSR-Liste.
- T6 `trips()` wirft, wenn `pDep` entlang `pCont` nicht streng steigt. Dafür wird die Verfolgung als reine Hilfsfunktion `followChain(dep, trip, cont, entry)` herausgezogen und mit handgebauten Arrays getestet (Zyklus, gleiche Abfahrt).

**Tabelle und Linien** (`table.test.ts`, `lines.test.ts`)
- L1 `lineLabel`: alle vier Arten, „D“ als Tram → „Tram D“.
- L2 `cellLines`: häufigste Folge; Gleichstand nach Median, dann Text; leere Folge → 0; Wert 255 → 0; Ausreißer (> 10 Min.) → 0, genau 10 Min. → Linien.
- L3 Zusammenfassen gleicher Nachbarn („U1, U1, Bus 36“ → „U1, Bus 36“).
- L4 `buildTransitTables` auf dem Fixture-Netz:
  - Minuten mit `penaltySeconds: 0` gleich dem heutigen Ergebnis (Schnappschuss der Bytes vor der Änderung, im Test als Konstante).
  - Mit *P* = 300: Minuten und Linien für zwei handverlesene Zellen, **von Hand nachgerechnet** wie in Plan 0009, E15. Der Rechenweg steht als Kommentar im Test.
  - Achtung: Die Fixture-Minuten können sich mit *P* = 300 ändern, z. B. beim Weg Tram 1 → Bus 2 über Halt 9004. Alle festen Erwartungen in `table.test.ts` werden geprüft und, wo nötig, nachgerechnet, nicht einfach übernommen.
- L5 Rundlauf: `linien.json` → `decodeTransitLines` → dieselben Namen je Zelle. `id` stimmt in beiden Dateien. `contentId` mit festem Wert.
- L6 Determinismus: zweimal bauen ergibt dieselben Bytes (Reihenfolge von `lines` und `combos`).

**Domäne** (`transit.test.ts`)
- D1 `decodeTransitLines`: jede Ablehnung aus E8 einzeln (Version, `id` fehlt/ungleich, Base64 kaputt, Länge, Index außerhalb, leere Folge, Zellwert zu groß).
- D2 `transitReach` mit Linien: Linien aus der Zeile des Minimums. Gleichstand zweier Zeilen → die erste. `byFoot` → keine Linien. Zellwert 0 → keine. Ohne drittes Argument identisch zu heute.

**Laden und Zustand**
- S1 `src/data/transit.test.ts`:
  - Linien kommen getrennt; ihr Fehler (HTTP 500, Abbruch, Zeitlimit) ergibt `undefined`, ohne die Tabelle zu stören.
  - `retry` holt beide ohne Cache.
  - `loadTransit` löst auf, auch wenn die Linien noch hängen (Stub mit offenem Versprechen).
- S1 zusätzlich:
  - `linien.json` wird erst nach der Antwort von `wegzeit.json` angefordert, mit `priority: "low"`.
  - Ohne Tabelle (Fehler) gibt es keine Anfrage auf `linien.json`.
  - Der Timer der Linien läuft nach dem Ende von `loadTransit` weiter (Fake-Timer).
- S2 `use-transit.test.ts`:
  - Reducer „lines“ nur in „bereit“ mit gleichem `attempt`.
  - **Ablauf aus Review B1 am Hook:** Tabelle und Logik lösen auf (`loaded`), danach kommen die Linien → Zustand „bereit“ mit `lines`. Getestet mit gesteuerten Versprechen, nicht nur am Reducer. Ebenso: Linien eines veralteten Versuchs ändern nichts.
  - `resolveReach` mit und ohne Linien.
  - Unpassende Linien → kein `stale`.

**Anzeige**
- F1 `format.test.ts`: `reachLong` mit 1, 2, 3 und 6 Linien; ohne Linien wie bisher; `byFoot` ignoriert Linien. `transitSourceNote` mit neuem Satz.

**E2E** (Fixture-Build, eingefrorene Uhr)
- E1 Detail und Orts-Sheet zeigen „ca. … Min. mit 〈Linien〉 ab Gostenhof“. Die genauen Erwartungen in `startpunkt.spec.ts:104`, `karte.spec.ts:182/236` und `mobile-ux.spec.ts:125` werden auf das Ergebnis des Fixture-Netzes umgestellt, mit Kommentar, welche Fahrt es ist.
- E2 `linien.json` abgebrochen (`page.route(…, abort)`): Detail zeigt „mit Bus & Bahn“, Filter und Minuten wirken, keine Konsolenfehler. Das Muster für den abgebrochenen Request kommt in `allowedConsoleErrors`, falls der Browser ihn meldet.
- E3 Request-Invarianten (`startpunkt.spec.ts`):
  - ohne Anlass kein Request auf `linien.json`;
  - mit gespeichertem Stadtteil genau einer;
  - ab der Wahl eines Startpunkts keiner mehr. Die bestehende Zählung „kein Request ab der Wahl“ wartet zusätzlich auf die Antwort von `linien.json`.
  - Ebenso `karte.spec.ts:212-215`: Dort wird zusätzlich auf die Antwort von `linien.json` gewartet, bevor die Zählung beginnt.
- E4 `expectMobileUx` hell/dunkel für Detail und Orts-Sheet mit Linien, bei 320 px/200 % mit der längsten Fixture-Folge.
  - **Die Fixture bekommt dafür eine dritte fiktive Linie** (Review W4), z. B. Bus „202E“ ab Halt 9007. Damit hat mindestens ein Ort eine Folge mit drei Linien und einem Namen, der nicht mitten im Wort brechen darf.
  - Welcher Ort das ist, rechnet Schritt 7 von Hand nach.
- E5 Smoke (echte Daten, Review W3): Mindestens ein Detail ab Altstadt passt auf `/mit (Bus|Tram|U\d|S\d|R)/`. Das Muster „ mit “ allein bewiese nichts, denn es steht auch in „mit Bus & Bahn“.
- E6 **Linien kommen später** (Review B1): `page.route("**/data/linien.json")` hält die Antwort 1,5 s zurück.
  - Zuerst zeigt das Detail „mit Bus & Bahn“, Minuten und Filter wirken schon.
  - Danach erscheinen die Linien ohne weitere Interaktion.
  - Keine Konsolenfehler.

## Backpressure

- `pnpm check:fast` grün nach jedem Schritt. Am Ende `PW_PORT=4273 pnpm check` (Worktree, CLAUDE.md).
- Budgets:
  - `Linien-Daten` ≤ 64 kB;
  - `Wegzeit-Daten` ≤ 64 kB (nur `id` und leicht andere Minuten, erwartet ±0,1 kB);
  - `Wegzeit JS (lazy)` ≤ 3 kB (Dekodieren der Linien kommt dazu; reicht es nicht, Anhebung nur mit Messwert und Begründung im Commit);
  - `JS (initial)` ≤ 92 kB (nur `format.ts`, erwartet < 0,1 kB).
- Build-Zeit ≤ 10 s für die Wegzeit-Zeile auf dem CI-Runner.
- Keine Schwelle senken, keine Regel abschalten, keine `as`-Casts ohne Begründung.

## Schritte

0. **ADR-Entwurf und Review.** `docs/adr/0015-wegzeit-linien.md` (Entwurf, liegt bei). Plan-Review (`/plan-review`), Befunde einarbeiten, Nutzerentscheidungen N1–N3 einholen.
1. **Auszug mit Verkehrsmittel** (G1–G3). Schema `mode`, Extractor, Fixture.
   - Danach `pnpm pipeline oepnv`: neuer `data/oepnv/fahrplan.json`. Der GTFS-Cache liegt unter `~/.cache/zwergenplan/gtfs/`, bedingtes GET.
   - Ein Commit mit Schema, Extractor, Fixture und Auszug, sonst ist `data:validate` dazwischen rot.
   - In der Nachricht: Stichtag und ob der Feed neu war.
2. **Profil-CSA** (T1–T6). Erst die Tests, dann `scanProfiles` mit Aufschlag und Rückverfolgung.
3. **Tabelle und Linien** (L1–L6). `scripts/transit/lines.ts`, `buildTransitTables`, `contentId`.
   - `build-data` schreibt `linien.json` und meldet „✓ Linien: N Folgen, M Zellen ohne Linien (davon K Ausreißer)“.
   - Budget-Zeile in `.size-limit.json`.
   - Messen und im Plan unter „Umsetzung“ eintragen:
     - Größe roh/gzip beider Dateien, Laufzeit, Verteilung der Linienzahl;
     - Verteilung von `d` aus E4, Schritt 5, und der Anteil der Zellen ohne Linien;
     - Verschiebung der Minuten (Mittel, p90, p99, max), verglichen mit **demselben neuen Auszug bei `penaltySeconds: 0`**. Ein Vergleich mit `main` würde durch den neuen Stichtag aus Schritt 1 verfälscht (Review).
   - Abweichung > 20 % von M3–M5 → anhalten und nachfragen.
   - `MAX_WITHOUT_LINES` (E7) aus der Messung setzen.
   - Build-Zeit: `build-data` warnt heute erst ab 20 s (`build-data.ts:21`). Die Wegzeit-Zeile kommt mit Laufzeit ins CI-Log, Schritt 9 liest sie dort ab und trägt sie ein. Über 10 s → Gegenmittel aus „Risiken“, kein neues Gate.
   - `pnpm arch` prüfen (`transit-build-pure` greift für `lines.ts`).
4. **Domäne** (D1, D2). Typen, `decodeTransitLines`, `transitReach` mit Linien.
5. **Laden** (S1, S2). `src/data/transit.ts`, `use-transit.ts`.
6. **Anzeige** (F1). `format.ts`; die Komponenten bleiben unverändert.
7. **E2E und Doku** (E1–E6).
   - Fixture-Erwartungen (Minuten und Linien) von Hand nachrechnen, mit Rechenweg im Kommentar. Kommentare, die noch „T1“/„B2“ nennen, umbenennen.
   - `docs/architecture.md`, README (Lizenzabsatz), `docs/ideas.md`, Plan 0011/ADR 0013 (Zeile `linien.json`).
   - ADR 0015 auf „angenommen“. ADR 0011 bekommt oben einen Verweis: „Punkt 3, Satz 2 ersetzt durch ADR 0015; Punkte 4, 5 und 6 ergänzt“.
8. **Arch-Review** (`/arch-review`, Pflicht: Schemaänderung, neues Modul, > 200 Zeilen). Befunde einarbeiten.
9. **`PW_PORT=4273 pnpm check`** grün. Branch pushen, CI grün, Fast-Forward nach `main`, CI auf `main` grün, Live-Seite zeigt Linien.
10. **Browser-Review live** (`/browser-review live`): Detail und Orts-Sheet mit Linien, hell/dunkel, 360 px und 200 %, ein Ort mit 3+ Linien, ein Ort zu Fuß. Ergebnis im Plan.

## Akzeptanzkriterien

- Detail und Orts-Sheet zeigen bei Wegzeit mit Bus & Bahn die Linien der häufigsten Verbindung, in Fahrtreihenfolge, als deutsche Aufzählung.
- Ohne `linien.json` (Fehler, Zeitlimit, unpassend) bleibt die Anzeige wie vor diesem Plan, ohne Fehler und ohne Neuladen.
- Die Minuten stammen aus derselben Verbindungswahl wie die Linien. Die Verschiebung gegenüber vorher liegt im Rahmen von M4 (Mittel ≤ +1 Min., p99 ≤ +5 Min.).
- Kein Request hängt vom Startpunkt ab; E2E belegt es für `linien.json`.
- Budgets grün, Build-Zeit ≤ 10 s, `pnpm check` grün, CI auf `main` grün, Browser-Review live bestanden.
- `fahrplan.json` entstand über `pnpm pipeline oepnv`, nicht von Hand.

## Risiken

- **Build-Zeit:** Mehr Arrays und das Merken der Folgen kosten Zeit (Prototyp 7,5 s mit Texten je Minute). Gegenmittel: `comboOf` je Eintrag (E4). Reicht es nicht, ein Cache über einen Hash von Auszug und Orten (ADR 0011, Konsequenzen). Dann wird neu entschieden, nicht still gelockert.
- **„Häufigste Verbindung“ passt nicht zu jedem Moment:** Im Mittel deckt die genannte Folge 73 % der Abfahrtsminuten ab. Dazu stehen die Hinweise „Di vormittags“ und der Quellensatz (E10). Wer es genau braucht, fragt die VGN-App.
- **Linien desselben Namens mit verschiedenem Verkehrsmittel:** Der Name allein ist nicht eindeutig; deshalb `mode` je Fahrt, nicht je Name (E1).
- **Fahrplanwechsel 12.12.2026:** Linien ändern sich mit dem neuen Auszug automatisch. Die Prüfung der Aktualität (ADR 0011) bleibt.
- **Gecachte alte `wegzeit.json` ohne `id`:** Es gibt keine Linien, bis der Cache erneuert ist. Das ist gewollt (E6).

## Nutzerentscheidungen (offen)

- **N1 – Welche Verbindung zählt:** Variante K mit 5 Min. Aufschlag (Empfehlung, E2), Variante L, Variante 0 oder nur die erste Linie.
- **N2 – Linien auch auf der Kachel?** Empfehlung: nein, nur Detail und Orts-Sheet. Die Kachel ist bei 360 px voll, und das Text-Gate prüft einzeilige kurze Beschriftungen.
- **N3 – Schreibweise:** „mit Bus 37 und U1“ (Empfehlung, E10) oder „mit Bus 37 › U1“ bzw. „mit Bus 37 / U1“.

## Review (2026-10-05, plan-reviewer, Runde 1) – Verdict: Freigabe mit Änderungen → eingearbeitet

Der Reviewer bestätigt den Kern: Die Bewertung „echte Ankunft + k · P“ ist additiv, die Pareto-Liste bleibt monoton. Das Argument zum Überschreiben eines Eintrags hält, denn Verweise entstehen nur aus Verbindungen mit `arr ≤ d − 60` und das Schema verlangt `times ≥ 0`. Alle Befunde sind übernommen, keiner abgelehnt.

**Blocker**
- **B1, Linien nach `loaded` gingen verloren:** Der Effekt in `useTransit` räumt nach `loaded` auf (`attempt` wird 0), ein `if (!live)` verwürfe spät ankommende Linien.
  - Übernommen: Die Aktion `lines` wird ohne `live`-Prüfung geschickt, Schutz nur über den Reducer (E9).
  - Hook-Test S2 und E2E E6 mit verzögerter `linien.json`.

**Wichtig**
- **W1, Ausreißer-Schutz von 10 Min. filterte praktisch nichts:** Übernommen. Grenze max(3 Min., 25 % des Zellwerts) als Startwert, Messung in Schritt 3, Ziel ehrlich formuliert (E4, Ziel).
- **W2, 51 kB parallel zu `site.json` und `wegzeit.json` beim Start:** Übernommen. `linien.json` erst nach der Antwort der Tabelle, `priority: "low"` (E9, ADR 0015).
- **W3, Smoke-Muster bewies nichts, kein Gate gegen stillen Ausfall:** Übernommen. Smoke mit Linienmuster (E5). `build-data` bricht ohne Linien bzw. über `MAX_WITHOUT_LINES` ab (E7).
- **W4, lange Folgen ungeprüft, `overflow-wrap: anywhere` im Orts-Sheet:** Übernommen.
  - Geschützte Leerzeichen in den Namen.
  - Klasse `reach-long` mit `overflow-wrap: normal`.
  - Dritte Fixture-Linie, `expectMobileUx` bei 320 px/200 % (E1, E4).
- **W5, `route_type` warf für jede Route des Feeds:** Übernommen, geworfen wird nur für Fahrten im Auszug (E1).

**Hinweise** (alle übernommen)
- **Tests:**
  - Gleitkomma-Vergleiche mit Toleranz `1e-6` s (E3, T2, T3).
  - T2 rechnet bis zum Fixpunkt statt bis *k* ≤ 8.
- **Code:**
  - `MAX_LEGS` ersetzt durch die Prüfung „`pDep` steigt streng“, mit `followChain` testbar (E3, T6).
  - Eigene `cmp` in `lines.ts` (E4).
  - `contentId` mit Stichtag, Feedstand und Aufschlag (E6).
  - `buildTransitTables` mit `penaltySeconds` in `opts` und `stats.outliers`/`cells` (Struktur, E7).
  - `decodeFor` hängt nur an `file`/`logic` (E9).
  - Eigener Timer der Linien, nicht im `finally` von `loadTransit` (E9).
  - `cells` von Hand little-endian (E7).
- **Anzeige:**
  - Bei „über 2 Std.“ keine Linien (E5, E10).
  - Quellensatz sagt, dass der Aufschlag die Wahl betrifft, also Minuten und Linien (E10).
  - Der Textwechsel im offenen Detail ist bewusst hingenommen (E9).
- **Vorgehen:**
  - Vergleichsbasis in Schritt 3 ist derselbe neue Auszug mit *P* = 0, nicht `main`.
  - Fixture-Minuten und -Linien von Hand nachrechnen (L4, Schritt 7).
  - `karte.spec.ts` wartet auch auf `linien.json` (E3).
  - Build-Zeit: kein neues Gate, Ablesen im CI-Log (Schritt 3/9).
- **Doku:**
  - Plan 0011, E4a: Frische-Anlass lädt `linien.json` mit (E9).
  - Status von ADR 0015 präzisiert (ersetzt Punkt 3, Satz 2; ergänzt 4, 5, 6).
