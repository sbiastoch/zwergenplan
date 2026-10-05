# Plan 0012 – Linien in der Wegzeit („ca. 25 Min. mit Bus 37 → U1“)

Status: Fassung 2 nach den Nutzerentscheidungen vom 2026-10-05 (höchstens 1 Umstieg, Pfeil). Review-Runden 1 (auf Fassung 1) und 2 (auf Fassung 2) eingearbeitet, kein offener Blocker. **Schritte 1–7 umgesetzt** (Branch `linien-0012`, siehe „Umsetzung“); offen: Schritt 8 (Arch-Review), 9 (Push, CI, Merge), 10 (Browser-Review live).
Datum: 2026-10-05
Bezug:
- **ADR 0011** (Wegzeit-Tabelle Halt→Ort). Dieser Plan ändert dort:
  - Punkt 2: Zugang und Abgang zu Fuß bis 1 500 m statt 800 m;
  - Punkt 3: welche Verbindung je Abfahrtsminute zählt, höchstens 1 Umstieg.

  Er ergänzt die Punkte 4 bis 6 um eine zweite Build-Datei. Das hält **ADR 0015** fest (Entwurf `docs/adr/0015-wegzeit-linien.md`).
- Plan 0009 (Öffi-Fahrzeit): E4 Auszug, E5 Tabelle, E6 Profil-CSA, E7 `wegzeit.json`, E8 Domäne, E9 Laden, E11 Rückfall, E15 Tests.
- ADR 0010 (`src/data` importiert zur Laufzeit nichts aus `src/domain` außer `geo`).
- Plan 0011 und ADR 0013 (Service Worker, noch nicht umgesetzt): `linien.json` kommt in die Zeile von `wegzeit.json` (E9).
- Die ADR-Nummern 0013 und 0014 sind durch Plan 0011 belegt, deshalb **0015**.

## Ziel

Wo heute „ca. 25 Min. mit Bus & Bahn ab Gostenhof“ steht (Detail, Orts-Sheet der Karte), stehen die Linien der Verbindung:

> ca. 25 Min. mit Bus 37 → U1 ab Gostenhof

Dabei gilt die Regel des Nutzers für Eltern mit Kinderwagen:
- **Direktverbindungen haben Vorrang.**
- **Ein Umstieg** nur, wenn er deutlich schneller ist (mindestens 10 Min.) oder es direkt nicht geht.
- **Zwei Umstiege nie**, dann lieber ein längerer Fußweg: zum und vom Halt bis 1,5 km, oder ganz zu Fuß.

Weiter gilt:
- Minuten und Linien stammen aus **derselben** Wahl der Verbindung (E2). Genannt wird die häufigste Linienfolge im Fenster, deren Fahrzeit zur Angabe passt (E4).
- Fehlen die Linien (Datei lädt nicht oder passt nicht), steht wie heute „mit Bus & Bahn“ (E10).
- Kein neuer Request, der vom Startpunkt abhängt. Die Invariante aus ADR 0011, Punkt 6, gilt unverändert (E9).

## Nicht-Ziele

- **Linien auf der Kachel** (Nutzerentscheidung N2). Die Kachel zeigt weiter nur „25 Min.“. → `docs/ideas.md`.
- Abfahrtszeiten, Haltestellennamen, Routenbeschreibung Schritt für Schritt. → `docs/ideas.md` („Link zur VGN-Auskunft“; der Startpunkt dürfte dabei nicht in einen Request gehen, das bräuchte ein eigenes ADR).
- Echtzeit, Störungen, Barrierefreiheit von Halten (Aufzüge).
- Linien auf der Karte, Linienfarben, Piktogramme. → `docs/ideas.md`.
- Ein anderes Zeitfenster als Di 8:30–10:30.
- Ein einstellbares Profil („mit/ohne Kinderwagen“). Die Regel gilt für alle.

## Ausgangslage

### Was die Daten hergeben

- `data/oepnv/fahrplan.json` (Schema `Timetable`, `src/domain/schema.ts:176`): Jede Fahrt hat `route` mit dem Kurznamen der Linie („U1“, „36“, „202E“), laut Kommentar „nur zur Fehlersuche“.
  - Im Auszug stecken 187 Linien.
  - **Das Verkehrsmittel fehlt.** „10“ ist im Feed eine Tram, anderswo könnte es ein Bus sein.
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

1. `scripts/transit/profile-csa.ts` (`scanProfiles`): Je Steig steht ein Profil „Abfahrt → früheste Ankunft am Ort“, ohne die Fahrten dahinter. Die Zahl der Umstiege ist unbegrenzt.
2. `scripts/transit/table.ts` (`buildTransitTable`): Je Zelle (Haltbereich × Ort) bleibt nur der Median über 120 Abfahrtsminuten, ein Byte.
3. `src/domain/transit.ts` (`transitReach`): nimmt je Ort das Minimum über die Zugangshalte (`ACCESS_METERS = 800`), merkt sich aber nicht, welcher Halt gewonnen hat.
4. `src/ui/format.ts:235` (`reachLong`): schreibt fest „mit Bus & Bahn“.

Radien heute: Zugang Startpunkt → Halt 800 m (`ACCESS_METERS`, `src/domain/transit.ts:20`), Abgang Halt → Ort 800 m (`EGRESS_METERS`, `scripts/transit/profile-csa.ts:24`), Umstieg zu Fuß 400 m. `ACCESS_METERS` entscheidet zugleich, ob ein Startpunkt „außerhalb des Stadtgebiets“ liegt (ADR 0011, Punkt 9), und gilt in `withoutAccess` (`table.ts:173`) für die Stadtteile.

### Messungen (Prototyp, 2026-10-05)

Die Wegwerf-Prototypen lagen außerhalb des Repos. Sie nutzen `buildNetwork`, `egressSeconds`, `tableRows`, `cellValue`, `decodeTransitTable`, `transitReach` und `DISTRICTS` aus dem Repo.

- Daten: `data/oepnv/fahrplan.json` (Stichtag 13.10.2026), Orte aus `site.json` vom 04.10.2026, also **556 Haltbereiche × 76 Orte**.
- Die Linienbezeichnung kam aus `routes.txt`.
- Vergleich „je Stadtteil × Ort“: alle 35 Stadtteile als Startpunkt, Browser-Rechnung wie `transitReach`, also 2 660 Paare. Verglichen mit der heutigen Produktion (Tabelle und Browser bei 800 m).

**M1 – Rückverfolgung ist exakt.** Merkt sich die Profil-CSA je Eintrag Fahrt und Anschluss, ergeben sich für alle 42 256 Zellen dieselben Minuten wie in der Produktion.

**M2 – Ohne Begrenzung sind die Linien unbrauchbar.** Mit 1 Min. Puffer je Umstieg wählt die schnellste Verbindung oft 3–7 Fahrzeuge, um eine Minute zu sparen. Beispiel: „Bus 51 › Bus 53 › Bus 36 › U3 › Tram 4 › Bus 20 › Bus 31“. Nur 9 % der Zellen kommen mit einer Linie aus.

**M3 – Fassung 1 (Aufschlag 5 Min., beliebig viele Umstiege):** Die Minuten steigen im Mittel um +0,46 Min. 33 % der Zellen haben aber 3 Linien, 6,6 % 4 oder mehr. Die Datei hat 50,6 kB gzip. Der Nutzer hat das verworfen: höchstens 1 Umstieg.

**M4 – Höchstens 1 Umstieg** (Aufschlag *P* je Umstieg in der Wahl, Zugang und Abgang zu Fuß variabel), je Stadtteil × Ort gegenüber heute:

| *P* | Abgang | Zugang | Minuten Mittel | p90 | p99 | > 15 Min. länger | neu „über 2 Std.“ | direkt (1 Linie) | Build |
|---|---|---|---|---|---|---|---|---|---|
| 5 Min. | 800 m | 800 m | +3,4 | +10 | +52 | 7,0 % | 180 | 35,0 % | 2,4 s |
| 10 Min. | 800 m | 800 m | +3,5 | +10 | +52 | 7,0 % | 180 | 36,1 % | 2,4 s |
| 10 Min. | 1 200 m | 800 m | +3,1 | +9 | +46 | 5,0 % | 121 | 42,5 % | 2,6 s |
| 5 Min. | 1 200 m | 1 200 m | +2,1 | +6 | +38 | 3,4 % | 96 | 39,1 % | 2,7 s |
| 10 Min. | 1 200 m | 1 200 m | +2,4 | +7 | +38 | 3,4 % | 96 | 43,5 % | 2,7 s |
| **10 Min.** | **1 500 m** | **1 500 m** | **+2,3** | **+7** | **+23** | **2,1 %** | **52 (2,0 %)** | **45,0 %** | **2,8 s** |

- **„Neu über 2 Std.“:** Paare, die heute 45–75 Min. mit zwei oder mehr Umstiegen hatten, jetzt aber keinen Weg mit höchstens einem Umstieg, und zu Fuß sind es über 2 Std. Beispiele: Altenfurt → Orte im Nordosten (heute 48–64 Min.).
- **Längere Fußwege zum und vom Halt** ersetzen den größten Teil der Wege mit zwei Umstiegen (180 → 52).
- **Der Aufschlag** (5 oder 10 Min.) ändert die Minuten kaum. 10 Min. machen Direktverbindungen häufiger (+4,4 Punkte bei 1 200 m).
- Bei 1 500 m sind 2,9 % der Paare ganz zu Fuß am schnellsten (heute 2,6 %), 12 davon neu.
- Mit Bus & Bahn: 45,0 % Direktverbindung, 53,8 % mit einem Umstieg, 32 Paare ohne Linien (Zelle „zu Fuß vom Halt“, E5).

**M5 – Größen bei 10 Min. / 1 500 m:**

| Datei | roh | gzip |
|---|---|---|
| `wegzeit.json` heute | 62,4 kB | 42,0 kB |
| `wegzeit.json` neu | 62,4 kB | 41,6 kB |
| `linien.json` (zwei Byte-Ebenen, E7) | 113,3 kB | **27,9 kB** |

67 verschiedene Linien, 651 verschiedene Folgen. Die Build-Zeit der Wegzeit sinkt sogar (2,8 s; die zweite Ebene ist billiger als unbegrenzte Umstiege).

## Entscheidungen

### Nutzerentscheidungen (2026-10-05)

- **N1:** Minuten und Linien aus derselben Wahl der Verbindung.
- **N2:** Linien nur im Detail und im Orts-Sheet, nicht auf der Kachel.
- **N3:** Schreibweise mit Pfeil.
- **N4:** Direktverbindungen haben Vorrang, ein Umstieg nur, wenn er deutlich schneller ist oder es direkt nicht geht, zwei Umstiege nie, dann lieber länger zu Fuß.
- **N5 (nach der Messung in Schritt 3):** Umstiegs-Bit im Browser behalten; die gemessenen Werte „mit Bit“ ersetzen M4 als Referenz (siehe „Umsetzung“).

**Übersetzt in Zahlen** (Annahmen dieses Plans, als Konstanten leicht änderbar):
- „deutlich schneller“ = mindestens **10 Min.**;
- „länger zu Fuß“ = Zugang und Abgang bis **1 500 m** (gut 25 Min. bei Kinderwagen-Tempo; der Rechner nimmt so einen Weg nur, wenn er insgesamt schneller ist);
- Pfeil = „→“ (U+2192);
- „Direktverbindungen haben Vorrang“ gilt auch zwischen verschiedenen Halten im Umkreis des Startpunkts, nicht nur je Halt (Umstiegs-Bit, E2; Review 2, W1).

### E1 – Verkehrsmittel in den Auszug (Schemaänderung)

- `TimetableTrip` bekommt ein Pflichtfeld `mode: z.enum(["tram", "u-bahn", "bahn", "bus"])`.
  - Abbildung im Extractor (`extractTimetable`): `route_type` 0 → `tram`, 1 → `u-bahn`, 2 → `bahn`, 3 → `bus`.
  - Jeder andere Wert wirft `GTFS: Linie <name> hat unbekannten route_type <x>`, **aber nur für Fahrten, die im Auszug bleiben** (Review W5). `routes` wird weiter vollständig eingelesen, `route_type` erst beim Übernehmen einer Fahrt in `kept` abgebildet. Eine Bedarfs- oder inaktive Route mit erweitertem Typ (700, 900 …) bricht den Lauf also nicht ab.
  - Der Kommentar an `route` wird zu „Kurzname der Linie („U1“, „36“), für die Anzeige der Linien (Plan 0012)“.
  - **`route` wird `z.string().min(1)`** (Review 2, H2). Heute kann der Extractor `""` schreiben (`gtfs.ts:364`, `?? ""`), dann stünde „Bus “ in der Anzeige. Der Extractor wirft stattdessen, wenn Kurz- und Langname leer sind.
- Ein Enum statt der GTFS-Zahl, weil der Datenvertrag lesbar sein soll und die Anzeige nur vier Arten braucht.
- **Auszug neu erzeugen:** `data/oepnv/fahrplan.json` entsteht neu mit `pnpm pipeline oepnv`, nie von Hand (CLAUDE.md).
  - Ein Auszug ohne `mode` besteht die Prüfung nicht. `readCurrentTimetable` liefert dann `undefined`, und der Lauf schreibt neu, auch ohne `--force`.
  - **Stichtag:** `pickServiceDay` hängt an `today()`. Nach dem 13.10.2026 wählt der Lauf einen späteren Dienstag. Das ist gewollt und steht in der Commit-Nachricht.
  - Der Auszug wird ca. 50 kB größer.
- Die Fixture `tests/fixtures/oepnv/fahrplan.json` bekommt `mode` von Hand (fiktive Testdaten, Plan 0009, E15).
  - Umbenennung: `T1` → `"route":"1","mode":"tram"`, `B2` → `"route":"2","mode":"bus"`.
  - Dazu eine dritte fiktive Linie, Bus „202E“ (Review W4, E2E E4).
- **Anzeigename** `lineLabel(route, mode)` in `scripts/transit/lines.ts`, rein:
  - `tram` → „Tram 〈route〉“, `bus` → „Bus 〈route〉“, `u-bahn` und `bahn` → `route` unverändert („U1“, „S2“, „RB 11“).
  - Leerzeichen im Namen werden zu U+00A0, damit „Bus“ und „37“ nie auf zwei Zeilen landen (Review W4).
  - Der Name entsteht im Build und steht fertig in `linien.json` (E7), so braucht das Start-JS keinen Code dafür. `linien.json` ist ein Build-Artefakt, kein Teil des Datenvertrags.
- `schema/*.json` ist nicht betroffen, weil `Timetable` nicht exportiert wird (`scripts/export-schema.ts`).

### E2 – Welche Verbindung zählt (N1, N4)

**Regel** (ersetzt ADR 0011, Punkt 3, Satz 2):
- Erlaubt sind Verbindungen mit **einer Fahrt** (direkt) oder **zwei Fahrten** (ein Umstieg). Mehr nie.
- Je Abfahrtsminute zählt die Verbindung mit der kleinsten **bewerteten Ankunft**, das ist die echte Ankunft am Ort plus `TRANSFER_PENALTY_SECONDS = 600` bei einem Umstieg. Dazu kommt wie bisher der reine Fußweg vom Halt (E4).
- Ein Umstieg gewinnt also nur, wenn er mindestens 10 Min. früher ankommt.
- **Gleichstand (Review 2, W2):** Bei gleicher Bewertung gewinnt die **spätere Abfahrt**, das ist die Pareto-Regel des Profils (`profile-csa.ts:232`, `pArr[h] <= best → continue`). Erst bei gleicher Abfahrt gewinnt die Direktverbindung (strikt `<`, E3). Ein Umstiegsweg, der später abfährt und gleich bewertet ist, schlägt also eine frühere Direktverbindung. Das ist richtig, denn er bedeutet weniger Warten bei gleicher Bewertung.
- **Über alle Starthalte (Review 2, W1):** Der Vorrang gilt auch im Browser, wo mehrere Zugangshalte konkurrieren.
  - `wegzeit.json` trägt je Zelle ein **Umstiegs-Bit** (Bit 7 des Bytes; Werte ≤ 120 < 128, `255` bleibt „keine Angabe“).
  - `transitReach` vergleicht `Zugang + Wert + (Bit ? 10 : 0)` und zeigt `Zugang + Wert`.
  - Das Bit ist gesetzt, wenn die häufigste Folge der Zelle (E4, Schritte 2–3, vor der Passungsprüfung) aus zwei Fahrten besteht. Das gilt auch dann, wenn beide Fahrten denselben Namen tragen.
  - Auch gegen den direkten Fußweg zählt die Bewertung: zu Fuß, wenn `Fußweg ≤ Zugang + Wert + Aufschlag`. Das ist die Regel „dann lieber zu Fuß“.
  - Dadurch steigt die Formatversion auf **2** (E6).
- Die Zelle ist der Median der **echten** Tür-zu-Tür-Zeit dieser Verbindungen, mit Warten. Die Formel `cellValue` bleibt unverändert.
- Das Umsteigemodell bleibt: Fußweg + 1 Min. Puffer, ≤ 400 m, auch am selben Steig. Der Aufschlag kommt **nur** in den Vergleich, nie in die Ankunft.

**Radien** (ersetzt ADR 0011, Punkt 2, und Plan 0009, E6, „Abgang 800 m“):
- `EGRESS_METERS = 1500`: Abgang vom Steig zum Ort im Build.
- `ACCESS_METERS = 1500`: Zugang vom Startpunkt zum Halt im Browser.
- **Neu `INSIDE_METERS = 800`** (`src/domain/transit.ts`): Ist im Umkreis von 800 m kein Haltbereich, liegt der Startpunkt außerhalb (ADR 0011, Punkt 9, unverändert). Gerechnet wird dann wie heute mit der Luftlinie. Auch `withoutAccess` (`table.ts:173`) und die Meldung in `build-data.ts:94` prüfen weiter gegen 800 m.
  - Begründung: Sonst bekämen Startpunkte bis 1,5 km außerhalb der Stadtgrenze plötzlich eine Wegzeit. Der Zugangsradius ist eine Frage des Modells, der Innen-Test eine Frage des Datenbereichs.

**Begründung:**
- Es ist die Regel des Nutzers (N4).
- Die Minuten werden für weite Wege ehrlicher: Mit Kinderwagen nimmt man keine zwei Umstiege.
- Im Mittel +2,3 Min., p90 +7 Min. (M4).
- 52 Stadtteil-Ort-Paare (2 %) haben keinen Weg mit höchstens einem Umstieg mehr. Sie zeigen „über 2 Std.“ mit eigener Begründung (E10) und fallen aus jedem Filter „bis … Min.“. Das ist die Konsequenz von „zwei Umstiege sind keine Option“.

**Alternativen:**
- **Beliebig viele Umstiege mit Aufschlag** (Fassung 1): vom Nutzer verworfen.
- **800 m wie heute:** 180 Paare ohne Weg (6,8 %), p99 +52 Min.
- **1 200 m:** 96 Paare ohne Weg, p99 +38 Min.
- **Aufschlag 5 Min.:** praktisch gleiche Minuten, aber weniger Direktverbindungen. Bleibt als Stellschraube.

### E3 – Profil-CSA in zwei Ebenen, mit Rückverfolgung

`scanProfiles(net, egress, opts?: { penaltySeconds?: number })`, Standard `TRANSFER_PENALTY_SECONDS`, in `scripts/transit/profile-csa.ts`.

**Zwei Durchläufe je Ort**, beide über alle Verbindungen in `connectionOrder`:
1. **Ebene 0 (direkt):**
   - Je Fahrt `t0[trip]` = früheste Ankunft am Ort, wenn man in dieser Fahrt sitzt und nur zu Fuß zum Ort geht: Minimum über spätere Ausstiege `arr + egress[to]`, nur mit Ausstiegs-Flag.
   - Je Steig ein Pareto-Profil `p0` (Abfahrt, echte Ankunft, Fahrt), eingefügt bei Einstiegs-Flag.
   - Kein Umstieg.
2. **Ebene 1 (direkt oder ein Umstieg):**
   - Je Fahrt `r1[trip]` (bewertet), `real1[trip]` (echt) und `c1[trip]` (Eintrag in `p0` oder `-1`).
   - Beim Ausstieg (Flag) sind die Kandidaten:
     - Abgang `at + egress[to]`, bewertet = echt;
     - je Umstiegsziel `s` (CSR-Liste) der Eintrag `e = p0` an `s` ab `at + transferSeconds`, bewertet `p0.real[e] + P`, echt `p0.real[e]`.
   - Profil `p1` je Steig (Abfahrt, bewertet, echt, Fahrt, Anschluss = Eintrag in `p0` oder `-1`). Pareto auf der Bewertung.
   - Ebene 1 greift nur auf `p0` zu, also nie mehr als ein Umstieg.

**Exaktheit:** Gesucht ist je Steig und Zeit `min(direkt, mit Umstieg + P)`. Der Aufschlag hängt nicht von der Uhrzeit ab und ist je Ebene konstant, also bleiben beide Profile FIFO. Ebene 0 ist vollständig, bevor Ebene 1 sie liest. Die Pareto-Regel (spätere Abfahrt, nicht spätere Bewertung) gilt je Ebene unverändert.

**Gleichstand, festgeschrieben** (Vergleiche immer strikt `<`):
1. Sitzenbleiben (der bisherige Wert der Fahrt) vor Aussteigen.
2. Abgang zum Ort vor Umsteigen. Bei gleicher Bewertung **und gleicher Abfahrt** gewinnt also die Direktverbindung.
3. Umstiege in der Reihenfolge der CSR-Liste.
4. Über verschiedene Abfahrten entscheidet die Pareto-Regel: Bei gleicher Bewertung bleibt die spätere Abfahrt (Review 2, W2).

**Überschreiben eines Eintrags** (`dep[h] === d`): Alle Felder werden gemeinsam ersetzt.
- In `p0` ist das unkritisch: Ebene 1 liest `p0` erst nach dem vollständigen Durchlauf.
- In `p1` verweist niemand auf Einträge.

Das steht als Kommentar im Code.

**API von `Profiles`:**
- `earliestArrival(stop, t)` liefert die **bewertete** Ankunft aus `p1` (Name beibehalten, Kommentar ergänzt; nur Tests nutzen es).
- `sweep(stop, from, step, count, outRated, outReal, outEntry)` liefert je Minute die bewertete Ankunft, die echte Ankunft und den Eintrag in `p1` (`-1` = keiner).
- `trips(entry): [number] | [number, number]`: die Fahrt aus `p1` und, wenn es einen Anschluss gibt, die Fahrt aus `p0`. Kein Zyklus möglich, daher kein Schutz nötig.

**Zahlen:** Abfahrt und Ankunft sind ganze Sekunden, Fußwege (`walkMinutes · 60`) und damit Bewertungen Gleitkommazahlen. Tests vergleichen Bewertungen mit Toleranz `1e-6` s.

**Rückwärts verträglich für Tests:** Die bestehenden Tests der Profil-CSA beruhen auf unbegrenzten Umstiegen ohne Aufschlag. Sie werden auf das neue Modell umgestellt (T1), nicht über einen Schalter erhalten. Ein Modus „unbegrenzt“ wäre toter Code.

### E4 – Zellwert und Linien je Zelle

In `buildTransitTable` je Zeile (Haltbereich) und Minute `m` (wie Plan 0009, E5, Schritt 1, jetzt mit Bewertung):
- Kandidaten:
  - je Steig `s` des Bereichs der Eintrag aus `sweep` (bewertet, echt, Eintrag);
  - der direkte Abgang `t + abgang_s`, mit Bewertung = echt und ohne Linien.
- Gewählt wird die kleinste Bewertung. Bei Gleichstand gewinnt zuerst der Abgang vor der Fahrt, dann zählt die Reihenfolge von `row.steige`.
- `x_m` = echte Ankunft − t, in Minuten. Der Zellwert bleibt `cellValue(x)`.
- `L_m` = die Linien der gewählten Verbindung: eine oder zwei Anzeigenamen (E1). Beim reinen Abgang ist `L_m` leer.
  - Gleiche Namen hintereinander werden zusammengefasst („U1 → U1“ → „U1“, z. B. beim Wechsel in einen Verstärker oder in die nächste Fahrt derselben Linie).
  - Das sieht dann aus wie eine Direktverbindung. Das ist bewusst so (Review 2, H3): Für Eltern zählt „mit der U1“. Das Umstiegs-Bit (E2) bleibt trotzdem gesetzt, weil Minuten und Bewertung den Umstieg enthalten.

**Linien der Zelle** (`cellLines`, rein, `scripts/transit/lines.ts`):
1. Ist der Zellwert `255`, gibt es keine Linien.
2. Zähle die Folgen `L_m` über alle Minuten mit endlichem `x_m`.
3. Nimm die häufigste.
   - Bei Gleichstand gewinnt die mit weniger Linien, dann der kleinere Median von `x` über ihre Minuten, dann der kleinere Text.
   - Der Text wird per Code-Unit-Vergleich geordnet, mit einer eigenen Funktion `cmp` in `lines.ts`. Die aus `gtfs.ts` ist nicht exportiert und für `scripts/transit` verboten (`transit-build-pure`).
4. Ist die gewählte Folge leer (Abgang), gibt es keine Linien.
5. **Passt die Folge zur Angabe? (Review W1)** Sei `d` = |Median von `x` über die Minuten der gewählten Folge − Zellwert|.
   - Ist `d > max(3 Min., 25 % des Zellwerts)`, gibt es keine Linien. Sonst stünde z. B. „ca. 10 Min. mit Bus 37“, obwohl Bus 37 im Median 19 Min. braucht.
   - Konstanten `LINES_FIT_MIN_MINUTES = 3`, `LINES_FIT_SHARE = 0.25`.
   - Das ist ein Startwert. Schritt 3 misst die Verteilung von `d` (p50/p90/p99) und den Anteil der Zellen ohne Linien deswegen. Bei einem Anteil > 10 % wird erst nachgefragt.

**Laufzeit:** Text entsteht nicht je Minute.
- `comboOf: Int32Array(connections)` merkt sich je Eintrag von `p1` die Nummer seiner Folge (`-1` = noch nicht bestimmt).
- Die Folgen werden global über alle Orte dedupliziert, Schlüssel ist der Text.
- Ziel: Die Wegzeit-Zeile von `build-data` bleibt ≤ 10 s auf dem CI-Runner (gemessen lokal 2,8 s im Prototyp).

### E5 – Zellen ohne Linien

Eine Zelle hat keine Linien (Wert 0 in beiden Ebenen von `linien.json`), wenn:
- der Zellwert 255 ist,
- der Ort vom Halt aus zu Fuß am besten erreicht wird (leere Folge),
- oder E4, Schritt 5 greift.

Der Browser zeigt dann „mit Bus & Bahn“ wie heute (E10). Eine Zelle „zu Fuß vom Halt“ gewinnt im Browser praktisch nie gegen den direkten Fußweg vom Startpunkt (Dreiecksungleichung, gleicher Umwegfaktor). Im Prototyp traf es 32 von 2 660 Paaren, nämlich dort, wo die Luftlinie über den Halt kaum länger ist.

### E6 – Kennung, damit beide Dateien zusammenpassen

- `wegzeit.json` bekommt ein Feld `id: string`: FNV-1a 32 Bit als 8-stellige Hex-Zahl über `JSON.stringify([serviceDay, source.modified, penaltySeconds, egressMeters, places, lat, lon, minutes, lines, first, second])`. Das sind die Inhalte **beider** Dateien (Review 2, H1).
  - Sonst passte eine alte `linien.json` aus dem Cache noch, wenn sich nur die Linien ändern (`lineLabel`, `LINES_FIT_*`, `mode`), oder eine neue zu gleichen Minuten.
  - `contentId` steht in `scripts/transit/table.ts` und läuft nach dem Bau beider Dateien. Sie ist rein und hat einen Test mit festem Wert für eine kleine Eingabe.
  - Nicht übernommen: einmal mit `cache: "reload"` nachladen, wenn die Dateien nicht zusammenpassen. Die Zeitspanne ist kurz (GitHub Pages: `max-age=600`), und die Wegzeit bleibt ja, nur ohne Linien.
- **Die Formatversion von `wegzeit.json` steigt auf `2`**, wegen des Umstiegs-Bits (E2) und des Pflichtfelds `id`.
  - `TRANSIT_TABLE_VERSION = 2`. `decodeTransitTable` lehnt Version 1 ab (wie jede falsche Version heute). Eine alte Datei aus dem HTTP-Cache führt dann zum Rückfall „Wegzeiten gerade nicht verfügbar“ bis „Nochmal laden“, wie bei jedem Formatwechsel (Plan 0009, E8).
  - Der Browser liest den Wert als `byte & 0x7f` und das Bit als `byte & 0x80`. Ist das Byte `255`, gibt es keine Angabe.
  - `decodeTransitTable` prüft zusätzlich: Jedes Byte ist `255` oder hat `byte & 0x7f ≤ 120`.
- `linien.json` trägt dieselbe `id` im Feld `table`. Der Browser nimmt die Linien nur bei Gleichheit (E8).
- Nur die Längen zu prüfen reicht nicht: Ein neuer Fahrplan kann gleich viele Zeilen und Orte haben, aber andere Zeilen. Falsche Linien wären schlimmer als keine.

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
  /** Anzeigenamen, sortiert (Code-Unit), höchstens 254: „Bus 36“, „S2“, „Tram 4“, „U1“ */
  lines: string[];
  /** Base64 eines `Uint8Array(Zeilen × Spalten)`, zeilenweise wie `minutes`: erste Linie, 0 = keine, sonst `lines[v − 1]` */
  first: string;
  /** dasselbe für die zweite Linie (nach dem Umstieg), 0 = keine (Direktverbindung oder keine Linien) */
  second: string;
}
```

- **Zwei Ebenen statt Wörterbuch der Folgen:** Mit höchstens zwei Linien ist das einfacher und kleiner (27,9 kB gegenüber 50,6 kB in Fassung 1). Die erste Linie wiederholt sich je Starthalt, die zweite je Ort, und gzip nutzt beides.
- Mehr als 254 Linien wirft im Build (`Error`, Text mit Anzahl). Heute sind es 67.
- `second ≠ 0` nur, wenn `first ≠ 0`. Der Build stellt das sicher, der Browser prüft es (E8).
- **Eigene Datei statt Erweiterung von `wegzeit.json`:**
  - Die Minuten sind der kritische Pfad (Filter, Sortierung, Platzhalter) und warten nicht auf die Linien.
  - Die Linien sind optional: Scheitert ihre Datei, bleibt die Wegzeit.
  - Getrennte Budgets.
- **Budget** `.size-limit.json`: `{ "name": "Linien-Daten", "path": "dist/data/linien.json", "limit": "40 kB", "gzip": true }`.
  - Gemessen 27,9 kB (M5). Die Datei wächst linear mit den Orten (≈ 0,37 kB gzip je Ort), die Grenze liegt also bei rund 110 Orten. Das passt zur Grenze von `wegzeit.json` (64 kB, rund 115 Orte).
- `build-data` schreibt die Datei nur, wenn es auch `wegzeit.json` schreibt (Auszug vorhanden). Der Fixture-Build schreibt sie also immer.
- **Gate gegen einen stillen Ausfall (Review W3):** `build-data` bricht ab (`process.exit(1)`), wenn
  - keine Zelle Linien hat (beide Builds, auch Fixture), oder
  - mit echten Daten der Anteil der Zellen mit Wert ≠ 255 ohne Linien über `MAX_WITHOUT_LINES` liegt.

  Die Schwelle setzt Schritt 3: gemessener Anteil + 5 Prozentpunkte, als Konstante mit Messwert und Datum im Kommentar.
- **Statistik:** `buildTransitTables` liefert `stats: { lines, combos, withoutLines, outliers, cells }` (`cells` = Zellen mit Wert ≠ 255) für die Meldung und das Gate.

### E8 – Domäne: Linien dekodieren und am Ergebnis tragen

`src/domain/transit-types.ts`:
- `TransitTableFile`: `version: 2`, neues Pflichtfeld `id: string`, Kommentar zu `minutes` mit Bit 7 (E2, E6). `TransitTable` bekommt `id: string`.
- Neu `TransitLines` (dekodiert): `{ names: readonly string[]; first: Uint8Array; second: Uint8Array }`.
- `TransitReach` bekommt `lines?: readonly [string] | readonly [string, string]`, nur bei `byFoot === false`, wenn Linien vorliegen.

`src/domain/transit.ts` (Lazy-Chunk, Plan 0009, E10):
- `ACCESS_METERS = 1500`, neu `INSIDE_METERS = 800` (E2).
- `decodeTransitTable`: Version 2, `id` muss ein String sein, Byte-Prüfung aus E6.
- Neu `decodeTransitLines(file: TransitLinesFile, table: TransitTable): TransitLines | undefined`. `undefined`, wenn
  - `version !== 1`;
  - `file.table !== table.id`;
  - `lines` kein Array aus Strings ist oder mehr als 254 Einträge hat;
  - `first` oder `second` kein gültiges Base64 ist, oder ihre Länge ≠ Zeilen × Spalten;
  - ein Wert > `lines.length` ist;
  - irgendwo `second ≠ 0` bei `first = 0` steht.

  Die Typprüfung läuft wie bei `decodeTransitTable` ohne Zod, denn die Datei kommt ungeprüft aus dem Netz.
- `transitReach(table, origin, lines?: TransitLines)`:
  - **Innen-Test** mit `INSIDE_METERS`: Gibt es keine Zeile im Umkreis von 800 m, ist das Ergebnis `undefined` wie heute (Modus „ausserhalb“).
  - **Zugang:** alle Zeilen im Umkreis von `ACCESS_METERS`. Beide Grenzen sind inklusiv (≤ 800 m, ≤ 1 500 m).
  - **Bewertung je Spalte (E2, Review 2, W1):** `rated = walk + (byte & 0x7f) + (byte & 0x80 ? TRANSFER_PENALTY_MINUTES : 0)`. Daneben steht `real = walk + (byte & 0x7f)`.
    - Gewählt wird das kleinste `rated` (`byRated`, `byReal`, `bestRow: Int32Array`). Bei Gleichstand bleibt die erste Zeile (strikt `<`).
    - `TRANSFER_PENALTY_MINUTES = 10` steht in `src/domain/transit.ts`. Der Build (`scripts/transit/profile-csa.ts`) leitet `TRANSFER_PENALTY_SECONDS = TRANSFER_PENALTY_MINUTES * 60` davon ab. So gibt es eine einzige Quelle, wie bei `walkMinutes`.
  - **Zu Fuß:** `byFoot = direct ≤ rated` (für den direkten Fußweg ohne Aufschlag). Angezeigt wird dann der Fußweg, sonst `real`.
  - `lines` am Ergebnis nur, wenn nicht `byFoot`, `real ≤ MAX_MINUTES` (Review 2, W7), `lines` vorhanden ist, `bestRow ≥ 0` und `first ≠ 0`.
  - Ohne drittes Argument ist das Ergebnis wie bisher, nur mit den neuen Radien.
- Kein neuer Export, den die UI statisch importiert (`transit-only-lazy`).

### E9 – Laden: dieselben Anlässe, eigenständig

`src/data/transit.ts`:
- `loadTransit` lädt `linien.json` **im selben Aufruf** wie `wegzeit.json` und die Rechenlogik. Damit gelten genau die Anlässe aus ADR 0011, Punkt 6: Kind-Sheet, Karte, „Nochmal laden“, Start mit gespeichertem Stadtteil. URL und Inhalt sind für alle gleich.
- **Die Minuten warten nicht auf die Linien:**
  - `TransitLoad` bekommt `lines: Promise<TransitLinesFile | undefined>`, ein Versprechen, das nie wirft.
  - `loadTransit` löst wie heute auf, sobald Tabelle und Logik da sind oder das Zeitlimit greift.
  - **Erst nach Tabelle und Logik (Review W2, Review 2, H10):** `linien.json` wird erst angefordert, wenn die Antwort von `wegzeit.json` erfolgreich gelesen ist **und** der Chunk geladen ist. Ohne Logik gibt es keine Wegzeit, und 28 kB wären umsonst. Die Anfrage geht mit `priority: "low"` raus (`RequestInit.priority`; ignoriert ein Browser das, schadet es nicht). `TransitEnv.fetch` bekommt `priority` im `init`-Typ.
  - Ohne Tabelle keine Linien-Anfrage.
  - Der Linien-Abruf hat einen eigenen `AbortController` und Timer mit `TRANSIT_TIMEOUT_MS`, gestartet mit der Anfrage. Diesen Timer räumt das Ende des Linien-Abrufs ab, **nicht** das `finally` von `loadTransit` (`transit.ts:70`).
- `retry` umgeht den HTTP-Cache für beide Dateien.
- Kein Laufzeit-Import aus `src/domain` (ADR 0010 bleibt).

`src/ui/use-transit.ts`:
- `TransitState` „bereit“ bekommt `lines?: TransitLinesFile`. Neue Aktion `{ type: "lines"; attempt; lines }` setzt sie nur in „bereit“ mit gleichem `attempt`.
- **Zustellung der Linien (Review B1):**
  - Der Effekt in `useTransit` hängt an `attempt`, und `attempt` ist nur in „laedt“ ungleich 0 (`use-transit.ts:150`). Nach `loaded` räumt er also auf, `live` wird `false`.
  - Kämen die Linien später als die Tabelle, verwürfe ein `if (!live) return` sie immer. Das ist der Normalfall, denn die Linien werden erst nach der Tabelle angefordert.
  - Deshalb: Im `then` von `loadTransit`, nach `dispatch(loaded)`, folgt `load.lines.then((lines) => dispatch({ type: "lines", attempt, lines }))` **ohne** `live`-Prüfung.
  - Geschützt wird allein über den Reducer (nur „bereit“, gleicher `attempt`). Ein `dispatch` nach dem Unmount ist in React 19 harmlos.
  - **Testbar als reine Funktion (Review 2, W4):** Die Zustellung wandert aus dem Effekt in `deliverLoad(load, { attempt, retry, isLive, dispatch, reload })` in `use-transit.ts`. Darin stehen Neuladen (N1), `loaded`/`failed` (nur bei `isLive()`) und danach `lines` (ohne `isLive`). Der Effekt ruft nur noch diese Funktion. Vitest läuft in Node ohne DOM (`vitest.config.ts:5`), deshalb wird die Funktion mit gesteuerten Versprechen getestet, nicht der Hook.
- `TransitLogic` (struktureller Typ) bekommt `decodeTransitLines` und das dritte Argument von `transitReach`.
- `decodeFor` dekodiert die Tabelle nur abhängig von `file` und `logic`, nicht vom ganzen `state` (`useMemo` mit `[file, logic, placeKeys]`). Sonst dekodiert jede Ankunft der Linien die Tabelle neu.
- Neu `decodeLinesFor(lines, table, logic)` mit `useMemo`, dann `resolveReach(state, table, origin, lines)`.
- Passt `linien.json` nicht (`undefined`), ist das **kein** `stale`. Die Wegzeit bleibt, nur ohne Linien, ohne Neuladen und ohne Konsolenfehler.
- `reloadAfterRetry` bleibt unverändert, die Linien zählen dafür nicht.
- **Bewusst:** Ist das Detail schon offen, wenn die Linien ankommen, wechselt der Text von „mit Bus & Bahn“ auf die Linien. Das ist eine Zeile in einem Dialog, kein Layoutsprung der Seite.

Service Worker (Plan 0011, noch nicht umgesetzt). Schritt 7 ergänzt Plan 0011 und ADR 0013:
- `linien.json` steht in der Zeile von `wegzeit.json` in Plan 0011, E4 („Netz zuerst, offline der Cache“).
- Beim Frische-Anlass aus Plan 0011, E4a lädt `linien.json` mit neu. Alte Linien gelten dann nicht mehr, weil `id` ≠ `table` sie verwirft.

### E10 – Anzeige (N2, N3)

`src/ui/format.ts`:
- `reachLong(reach, origin)` liefert künftig Teile statt eines Strings: `{ before: string; lines?: readonly string[]; after: string }`. Die bisherige String-Fassung entfällt, denn außer Tests hätte sie keinen Aufrufer mehr (Review 2, H6). Die Tests setzen die Teile mit einer kleinen Testhilfe zusammen.
- Die Komponenten rendern die Linien mit Pfeil. Der Pfeil ist für Screenreader verborgen und durch „, dann“ ersetzt:
  ```tsx
  {before}{lines.map((l, i) => <Fragment key={i}>{i > 0 && <><span aria-hidden="true">{" → "}</span><span className="sr-only">, dann </span></>}{l}</Fragment>)}{after}
  ```
  - `key` ist der Index, nicht der Name (Review 2, H3).
  - Vor dem Pfeil steht U+00A0, damit keine Zeile mit „→“ beginnt (Review 2, H4).
  - `.sr-only` gibt es schon über Tailwind v4 (`styles.css:1`, genutzt in `App.tsx:237` und `Chrome.tsx:47`). Es kommt keine neue Hilfsklasse dazu (Review 2, W3). Die Kopie in `tabs.css:106` sitzt in einer Container-Query und bleibt.
  - Grund: Screenreader lesen „→“ je nach Einstellung als „Pfeil nach rechts“ oder gar nicht. Sichtbar steht der Pfeil (N3), vorgelesen wird „mit Bus 37, dann U1“.
  - Das Rendern übernimmt eine kleine Komponente `ReachLong` (`src/ui/ReachLong.tsx`). Sie enthält keine Logik außer der Schleife über die Teile. `DetailDialog.tsx:110` und `karte/PlaceSheet.tsx:30` nutzen sie statt `{reachLong(…)}`.
  - Sie liegt nicht unter `src/ui/karte/`, weil das Detail im Start-Bundle ist. Für die Karte ist sie ein statischer Import aus dem Lazy-Chunk heraus; das ist erlaubt (Review 2 bestätigt: `karte-ui-*`, Gruppe `$initial`).
  - **CSS (Review 2, W3):** `.place-where span { display: block }` (`src/ui/styles/map.css:142`) träfe auch die inneren Spans und setzte den Pfeil auf eine eigene Zeile. Deshalb wird der Selektor zu `.place-where > span`.
- Texte:
  - mit Linien: „ca. 25 Min. mit Bus 37 → U1 ab Gostenhof“ (vorgelesen „mit Bus 37, dann U1“);
  - ohne Linien wie heute: „ca. 25 Min. mit Bus & Bahn ab Gostenhof“, „ca. 10 Min. zu Fuß ab …“.
- **„Über 2 Std.“ (Review 2, W7):**
  - Der direkte Fußweg über 120 Min. ist schon heute unendlich (`transit.ts:128`). „über 2 Std. zu Fuß“ kommt also nicht vor.
  - Was vorkommt:
    - endliche Wegzeit über 120 Min. (Zugang bis ca. 26 Min. plus Zelle bis 120);
    - unendlich, wenn es keinen Weg mit höchstens einem Umstieg gibt oder der Median über 120 liegt (`255`).
  - Beides zeigt ohne Linien „über 2 Std. ab Gostenhof (mit höchstens 1 Umstieg)“. Neutral, weil `255` beide Ursachen zusammenfasst.
  - Linien gibt es nur bei `minutes ≤ MAX_MINUTES` (E8).
- `reachShort` (Kachel, Orts-Liste) bleibt unverändert, also „25 Min.“ bzw. „über 2 Std.“ (N2).
- `reachNote` (Statuszeile): „Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, höchstens 1 Umstieg, inkl. Warten)“.
- `transitSourceNote` (Kind-Sheet), neuer Einleitungssatz: „Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß für einen Dienstagvormittag, inklusive Warten. Direktverbindungen gehen vor, ein Umstieg nur, wenn er mindestens 10 Min. spart; mehr als einen Umstieg gibt es nicht, dann lieber zu Fuß (bis 1,5 km zum und vom Halt). Genannt sind die Linien der häufigsten Verbindung. Fahrplan: …“.
  - Die Länge bei 320 px/200 % prüft das bestehende `expectMobileUx` des Kind-Sheets.
- **Umbruch (Review W4):**
  - Die Namen enthalten U+00A0 (E1).
  - Der Wrapper von `ReachLong` setzt `overflow-wrap: normal`, gegen `overflow-wrap: anywhere` von `.place-where` (`src/ui/styles/map.css:140`). So bricht „202E“ nicht mitten im Namen. Umgebrochen wird nur am normalen Leerzeichen nach dem Pfeil.

### E11 – Architektur, Lizenz, Doku

- `docs/architecture.md`:
  - Datenfluss: `linien.json` neben `wegzeit.json`.
  - Abschnitt Wegzeit: Linien-Datei, eigenständig geladen, optional; höchstens 1 Umstieg; Radien 1 500 m und Innen-Test 800 m.
  - Invariante „Kein Request hängt davon ab …“: „Wegzeit-Tabelle und Linien laden …“.
- Keine neue Abhängigkeit, keine neue dependency-cruiser-Regel. `scripts/transit/lines.ts` fällt unter `transit-build-pure`, das prüft Schritt 3 mit `pnpm arch`.
- **Lizenz:** `linien.json` ist wie `wegzeit.json` eine Abwandlung der VGN-Daten, also gleiche Lizenz und `source` in der Datei. Der README-Absatz „Abgewandelt“ wird um „und die Linien je Wegzeit (`data/linien.json`)“ ergänzt.
- **ADR 0015** (Entwurf liegt bei): höchstens 1 Umstieg, Aufschlag 10 Min., Radien, Minuten aus derselben Verbindung, `linien.json`, `mode` im Auszug.
- `docs/ideas.md`: Linien auf der Kachel; Link zur VGN-Auskunft; Piktogramme und Linienfarben; Profil „ohne Kinderwagen“ (mehr Umstiege erlaubt).

## Struktur

```
src/domain/schema.ts                 TimetableTrip.mode (E1)
scripts/pipeline/lib/gtfs.ts         route_type → mode, Fehler nur für übernommene Fahrten (E1)
tests/fixtures/oepnv/fahrplan.json   mode, Linien „1“ (Tram), „2“ (Bus), „202E“ (Bus) (E1)
data/oepnv/fahrplan.json             neu erzeugt mit `pnpm pipeline oepnv` (E1)
scripts/transit/profile-csa.ts       zwei Ebenen, Aufschlag, sweep mit Eintrag, trips(), EGRESS_METERS 1500 (E2, E3)
scripts/transit/lines.ts             neu: lineLabel, cellLines, cmp, encodeLines (E1, E4, E7)
scripts/transit/table.ts             Wahl je Minute mit Bewertung, contentId, buildTransitTables, withoutAccess mit INSIDE_METERS (E2, E4, E6)
scripts/build-data.ts                schreibt linien.json, Meldung und Gate (E7)
src/domain/transit-types.ts          Version 2, id, TransitLinesFile, TransitLines, TransitReach.lines (E6–E8)
src/domain/transit.ts                Version 2, Bit 7, TRANSFER_PENALTY_MINUTES, ACCESS/INSIDE_METERS, decodeTransitLines, transitReach(…, lines?) (E2, E6, E8)
src/data/transit.ts                  linien.json nach Tabelle und Logik, eigener Timer (E9)
src/ui/use-transit.ts                deliverLoad, Aktion „lines“, decodeLinesFor, resolveReach(…, lines) (E9)
src/ui/format.ts                     reachLong als Teile, reachNote, transitSourceNote (E10)
src/ui/ReachLong.tsx                 neu: Pfeil sichtbar, „, dann“ vorgelesen (E10)
src/ui/DetailDialog.tsx, src/ui/karte/PlaceSheet.tsx   nutzen ReachLong (E10)
src/ui/styles/map.css                .place-where > span, Wrapper mit overflow-wrap: normal (E10)
.size-limit.json                     „Linien-Daten“ 40 kB (E7)
docs/adr/0015-wegzeit-linien.md      neu (E11)
docs/architecture.md, README.md, docs/ideas.md, docs/plans/0011-pwa-push.md, docs/adr/0013-pwa-service-worker.md, docs/adr/0011-oepnv-wegzeit-tabelle.md (Verweis)
```

`buildTransitTable` wird zu `buildTransitTables(timetable, places, opts?: { egressMeters?: number; penaltySeconds?: number }) → { table: TransitTableFile; lines: TransitLinesFile; stats: { lines: number; combos: number; withoutLines: number; outliers: number; cells: number } }`. Der alte Name verschwindet; Aufrufer sind nur `build-data.ts` und Tests (knip).

## Tests

Test-first für Domänen- und Build-Logik (CLAUDE.md). Die Unit-Tests laufen in `America/Los_Angeles`, ohne Netz.

**Pipeline / Schema**
- G1 `gtfs.test.ts`: `route_type` 0/1/2/3 ergibt `tram`/`u-bahn`/`bahn`/`bus` im Auszug. Ein unbekannter Typ (`7`) wirft mit dem Liniennamen, aber nur bei einer Fahrt im Auszug. Eine Bedarfsroute mit Typ `715` wirft nicht.
- G2 Schema-Test: Fahrt ohne `mode` oder mit `mode: "faehre"` ist ungültig.
- G3 `data:validate` mit der neuen Fixture grün (läuft in `check:fast`).

**Profil-CSA** (`profile-csa.test.ts`)
- T1 Die bestehenden Einzeltests werden auf das neue Modell umgestellt. Wo sie zwei oder mehr Umstiege brauchen, ändert sich die Erwartung, mit Kommentar warum. Das betrifft vor allem „rechnet Fußweg und Puffer in den Umstieg, ohne Fußwege zu verketten“.
- T2 **Vorwärts-Referenz in zwei Ebenen** (nur Testcode, ersetzt `forwardArrival`):
  - `arr_0` = früheste Ankunft ohne Umstieg, `arr_1` = früheste Ankunft mit genau einem Umstieg. Referenz = `min(arr_0, arr_1 + P)`. Für *P* ≥ 0 ist das gleichwertig zu „höchstens einem Umstieg“ in `arr_1`.
  - Für jeden Steig und jede Minute, auf dem Fixture-Netz und auf dem Zufallsnetz, mit *P* = 600 und *P* = 0: gleich der bewerteten Ankunft der Profil-CSA, Toleranz `1e-6` s.
  - **Die Grenze muss wirklich geübt werden (Review 2, W6):** Auf dem Zufallsnetz (2 × 2 km) reicht bei 1 500 m Abgang fast jeder Ausstieg. T2 läuft deshalb zusätzlich mit Abgang 300 m und 800 m (`scanProfiles` nimmt das `egress`-Array).
  - Zähler mit Untergrenze (je ≥ 5 % der verglichenen Minuten, Wert nach dem ersten Lauf festschreiben):
    - Minuten mit genau einem Umstieg im Optimum;
    - Minuten, in denen eine unbegrenzte Referenz (wie die alte `forwardArrival`, bleibt als Testcode) schneller wäre;
    - Minuten, in denen *P* = 0 und *P* = 600 verschieden wählen.
- T3 **Rückverfolgung zulässig** (Zufallsnetz): Für jeden Eintrag aus `sweep` gilt:
  - `trips(entry)` hat 1 oder 2 Fahrten und ist fahrbar: Einstieg erlaubt, Ausstieg erlaubt, Umstieg ≤ 400 m mit Fußweg + 60 s Puffer, Abgang ≤ `EGRESS_METERS`.
  - Die echte Ankunft ist `pReal`.
  - `pReal + (Fahrten − 1) · P` = bewertete Ankunft.
- T4 Kleine Netze mit fester Erwartung (*P* = 10 Min.):
  - Direktverbindung 9 Min. langsamer als ein Weg mit einem Umstieg → Direktverbindung.
  - 11 Min. langsamer → Umstieg.
  - Ziel nur mit zwei Umstiegen erreichbar → kein Eintrag (unendlich).
  - Jeweils mit der echten Ankunft.
- T5 Gleichstand:
  - Sitzenbleiben vor Abgang vor Umstieg.
  - Gleiche Abfahrt, genau 10 Min. Unterschied → Direktverbindung.
  - Gleiche Bewertung, Umstiegsweg fährt **später** ab → Umstiegsweg (Pareto-Regel, Review 2, W2). Umgekehrt fährt die Direktverbindung später ab → Direktverbindung.
  - Zwei Umstiege gleicher Bewertung → der erste der CSR-Liste.
- T6 Radius: Abgang bei 1 500 m ja, bei 1 501 m nein (ersetzt den 800-m-Test).

**Tabelle und Linien** (`table.test.ts`, `lines.test.ts`)
- L1 `lineLabel`: alle vier Arten, „D“ als Tram → „Tram D“, „RB 11“ mit U+00A0.
- L2 `cellLines`:
  - häufigste Folge; bei Gleichstand weniger Linien, dann Median, dann Text;
  - leere Folge → 0; Wert 255 → 0;
  - Passung: `d` knapp über der Grenze → 0, genau auf der Grenze → Linien, sowohl im 3-Min.-Bereich als auch im 25-%-Bereich.
- L3 Zusammenfassen gleicher Nachbarn („U1, U1“ → „U1“, ergibt eine Ebene).
- L4 `buildTransitTables` auf dem Fixture-Netz: Minuten und Linien für drei handverlesene Zellen (direkt, ein Umstieg, Abgang zu Fuß), **von Hand nachgerechnet** wie in Plan 0009, E15. Der Rechenweg steht als Kommentar im Test. Alle bisherigen festen Erwartungen in `table.test.ts` werden nachgerechnet, nicht einfach übernommen.
- L5 Rundlauf: `linien.json` → `decodeTransitLines` → dieselben Namen je Zelle. `id` stimmt in beiden Dateien überein. `contentId` mit festem Wert.
- L6 Determinismus: Zweimal bauen ergibt dieselben Bytes.
- L7 `withoutAccess` prüft gegen 800 m, nicht gegen 1 500 m.
- L8 Umstiegs-Bit: gesetzt genau dann, wenn die häufigste Folge zwei Fahrten hat, auch bei zusammengefasstem Namen („U1 → U1“). Nie bei `255`. Wert und Bit zusammen bleiben ≤ 248 (120 | 0x80).

**Domäne** (`transit.test.ts`)
- D1 `decodeTransitLines`: jede Ablehnung aus E8 einzeln. `decodeTransitTable`: Version 1 → `undefined`; Byte 130 (Wert 2 mit Bit, gültig) und Byte 121 (ungültig).
- D2 `transitReach` mit Linien:
  - Linien aus der Zeile mit der kleinsten **Bewertung**; bei Gleichstand zweier Zeilen die erste;
  - **Vorrang über Halte (Review 2, W1):** Zeile A, direkt, Summe 40 Min.; Zeile B, mit Umstieg, Summe 35 Min. → A gewinnt, angezeigt 40 Min. mit den Linien von A. Mit Summe 29 Min. bei B gewinnt B;
  - Fußweg gegen Umstieg: Fußweg 42 Min., Umstieg 35 Min. → zu Fuß;
  - `byFoot` → keine Linien; `first = 0` → keine; über 120 Min. oder unendlich → keine;
  - ohne drittes Argument keine Linien.
- D3 Radien, beide Grenzen inklusiv (Review 2, H8):
  - nächster Halt in genau 800 m → innen; in 801 m (bzw. 900 m) → `undefined` („ausserhalb“);
  - Halt in genau 1 500 m zählt als Zugang, in 1 501 m nicht;
  - Halte in 700 m und 1 400 m → beide zählen, der günstigere gewinnt.
  - Der bestehende Test `transit.test.ts:146` wird auf die neuen Radien umgestellt.

**Laden und Zustand**
- S1 `src/data/transit.test.ts`:
  - `linien.json` wird erst nach der Antwort von `wegzeit.json` angefordert, mit `priority: "low"`. Ohne Tabelle gibt es keine Anfrage.
  - Ein Fehler (HTTP 500, Abbruch, Zeitlimit) ergibt `undefined`, ohne die Tabelle zu stören.
  - `retry` holt beide ohne Cache.
  - `loadTransit` löst auf, auch wenn die Linien noch hängen.
  - Der Linien-Timer läuft nach dem Ende von `loadTransit` weiter (Fake-Timer).
- S2 `use-transit.test.ts`:
  - Reducer „lines“ nur in „bereit“ mit gleichem `attempt`.
  - `resolveReach` mit und ohne Linien.
  - Unpassende Linien → kein `stale`.
  - **Ablauf aus Review B1 über `deliverLoad`** (reine Funktion, Review 2, W4): Erst `loaded`, dann wird `isLive()` falsch (der Effekt räumt auf), dann kommen die Linien → `dispatch(lines)` wird trotzdem gerufen. Danach liefert der Reducer „bereit“ mit `lines`. Linien eines veralteten Versuchs ändern über den Reducer nichts. Getestet mit gesteuerten Versprechen, ohne DOM.

**Anzeige**
- F1 `format.test.ts`:
  - `reachLong` (Teile) mit 1 und 2 Linien, ohne Linien wie bisher;
  - `byFoot` ignoriert Linien;
  - 130 Min. und unendlich → „über 2 Std. ab … (mit höchstens 1 Umstieg)“, ohne Linien;
  - `reachNote` und `transitSourceNote` mit den neuen Sätzen.
- F2 `ReachLong` **nur per E2E** (Review 2, W4: Vitest läuft in Node ohne DOM, eine neue Testabhängigkeit gibt es nicht): siehe E1.

**E2E** (Fixture-Build, eingefrorene Uhr)
- E1 Detail und Orts-Sheet zeigen „ca. … Min. mit 〈Linie〉 → 〈Linie〉 ab Gostenhof“ bzw. eine Linie.
  - Die genauen Erwartungen in `startpunkt.spec.ts:104`, `karte.spec.ts:182/236` und `mobile-ux.spec.ts:139` werden auf das von Hand nachgerechnete Fixture-Ergebnis umgestellt.
  - Ebenso die Statuszeile (`startpunkt.spec.ts:18`, `karte.spec.ts:226/248`, `mobile-ux.spec.ts:39`, `smoke.spec.ts:81`) und der Quellensatz (`mobile-ux.spec.ts:118`).
  - **Wie geprüft wird (Review 2, W5):** `getByText` vergleicht den `textContent` mit Pfeil und sr-only zusammen („Tram 1 → , dann Bus 2“) und taugt dafür nicht.
    - Die **vorgelesene** Form prüft `toMatchAriaSnapshot` auf dem Text-Element. Es lässt `aria-hidden` aus und liest sr-only mit: „ca. 15 Min. mit Tram 1, dann Bus 2 ab Gostenhof“.
    - Die **sichtbare** Form prüft der Locator `[aria-hidden="true"]` mit „→“, dazu `toHaveText` auf die Linien-Namen.
    - **Pfeil auf einer Zeile (Review 2, W3):** Linie davor, Pfeil und Linie danach haben bei 412 px dieselbe `top`-Koordinate (`boundingBox`), im Detail und im Orts-Sheet.
- E2 `linien.json` abgebrochen (`page.route(…, abort)`): Das Detail zeigt „mit Bus & Bahn“, Filter und Minuten wirken, keine Konsolenfehler. Das Muster für den abgebrochenen Request kommt in `allowedConsoleErrors`, falls der Browser ihn meldet.
- E3 Request-Invarianten (`startpunkt.spec.ts`):
  - ohne Anlass kein Request auf `linien.json`;
  - mit gespeichertem Stadtteil genau einer;
  - ab der Wahl eines Startpunkts keiner mehr. Die Zählung wartet zusätzlich auf die Antwort von `linien.json`.
  - Ebenso wartet `karte.spec.ts:212-215` zusätzlich auf `linien.json`.
- E4 `expectMobileUx` hell und dunkel für Detail und Orts-Sheet mit Linien, bei 320 px/200 % mit der längsten Fixture-Folge (enthält „Bus 202E“). Welcher Ort das ist, rechnet Schritt 7 nach.
- E5 Smoke (echte Daten, Review W3): Mindestens ein Detail ab Altstadt passt auf `/mit (Bus|Tram|U\d|S\d|R)/`.
- E6 **Linien kommen später** (Review B1): `page.route("**/data/linien.json")` hält 1,5 s zurück. Erst steht „mit Bus & Bahn“, Minuten und Filter wirken schon. Danach erscheinen die Linien ohne Interaktion. Keine Konsolenfehler.

## Backpressure

- `pnpm check:fast` grün nach jedem Schritt; am Ende `PW_PORT=4273 pnpm check` (Worktree, CLAUDE.md).
- Budgets:
  - `Linien-Daten` ≤ 40 kB;
  - `Wegzeit-Daten` ≤ 64 kB (erwartet 41,6 kB);
  - `Wegzeit JS (lazy)` ≤ 3 kB (Dekodieren der Linien kommt dazu; reicht es nicht, Anhebung nur mit Messwert und Begründung im Commit);
  - `JS (initial)` ≤ 92 kB (`format.ts`, `ReachLong`, erwartet < 0,3 kB).
- Build-Zeit der Wegzeit ≤ 10 s auf dem CI-Runner. `build-data` warnt heute erst ab 20 s (`build-data.ts:21`). Schritt 9 liest den Wert im CI-Log ab; liegt er über 10 s, kommen die Gegenmittel aus „Risiken“, kein neues Gate.
- Keine Schwelle senken, keine Regel abschalten, keine `as`-Casts ohne Begründung.

## Schritte

0. ~~Review-Runde 2, ADR 0015 an Fassung 2 angleichen~~ – erledigt (2026-10-05).
1. **Auszug mit Verkehrsmittel** (G1–G3):
   - Schema `mode` und `route.min(1)`, Extractor, Fixture, danach `pnpm pipeline oepnv` (GTFS-Cache unter `~/.cache/zwergenplan/gtfs/`, bedingtes GET).
   - **Fixture-Fahrt „202E“ (Review 2, H5):** Halte und Zeiten werden so gewählt und im Plan unter „Umsetzung“ mit Rechenweg festgehalten, dass ab Gostenhof gilt:
     - mindestens ein Ort ist direkt mit „Tram 1“ am besten erreichbar;
     - mindestens ein Ort ist nur über „Tram 1 → Bus 202E“ erreichbar oder damit mindestens 10 Min. schneller, und die Passung (E4, Schritt 5) besteht;
     - mindestens ein Ort ist zu Fuß am besten.
     - Achtung: Bei 1 500 m liegt Halt 9003 (ca. 1,35 km) im Zugang von Gostenhof, und Orte nahe Halten werden dann eher „zu Fuß“. Die Fahrt wird so gelegt, dass sie Orte bedient, die von Gostenhof mehr als 1 500 m Luftlinie entfernt sind. Ein solcher Ort kommt dafür in die Fixture-Angebote, falls es noch keinen gibt (`tests/fixtures/`, fiktiv).
   - Ein Commit mit Schema, Extractor, Fixture und Auszug, sonst ist `data:validate` dazwischen rot. In der Nachricht: Stichtag und ob der Feed neu war.
2. **Profil-CSA** (T1–T6): erst die Tests, dann zwei Ebenen, Aufschlag, Rückverfolgung, `EGRESS_METERS = 1500`.
3. **Tabelle und Linien** (L1–L7):
   - `scripts/transit/lines.ts`, `buildTransitTables`, `contentId`.
   - `build-data` schreibt `linien.json` und meldet „✓ Linien: N Linien, M Folgen, K Zellen ohne Linien (davon J unpassend)“.
   - Gate, Budget-Zeile.
   - **Messen und unter „Umsetzung“ eintragen:**
     - Größe beider Dateien, Laufzeit;
     - Anteil direkt / ein Umstieg;
     - Verteilung von `d`, Anteil ohne Linien;
     - Verschiebung der Minuten je Stadtteil × Ort gegenüber **demselben neuen Auszug** im alten Modell (unbegrenzt, ohne Aufschlag, 800 m). Ein Vergleich mit `main` wäre durch den neuen Stichtag verfälscht. Das alte Modell steht dafür nur im Messskript (`scripts/transit/` bekommt keinen toten Modus). Quelle: `git show main:scripts/transit/profile-csa.ts` und `git show main:scripts/transit/table.ts` in ein temporäres Verzeichnis außerhalb des Repos (Review 2, H7). Das Messskript liegt nicht im Repo, sein Rechenweg steht im Plan.
     - Zusätzlich messen: wie viele Stadtteil-Ort-Paare das Umstiegs-Bit im Browser umentscheidet (E2, W1), also eine Direktverbindung statt eines schnelleren Umstiegswegs ab einem anderen Halt.
   - Weicht ein Wert mehr als 20 % von M4/M5 ab → anhalten und nachfragen.
   - `MAX_WITHOUT_LINES` aus der Messung setzen.
   - `pnpm arch` (`transit-build-pure` greift für `lines.ts`).
4. **Domäne** (D1–D3): Typen, Radien, `decodeTransitLines`, `transitReach` mit Linien.
5. **Laden** (S1, S2): `src/data/transit.ts`, `use-transit.ts`.
6. **Anzeige** (F1, F2): `format.ts`, `ReachLong.tsx`, `.sr-only`, Einbau in Detail und Orts-Sheet.
7. **E2E und Doku** (E1–E6):
   - Fixture-Erwartungen von Hand nachrechnen, mit Rechenweg im Kommentar. Kommentare, die „T1“/„B2“ nennen, umbenennen.
   - `docs/architecture.md`, README (Lizenzabsatz), `docs/ideas.md`, Plan 0011 und ADR 0013 (`linien.json`, E4 und E4a).
   - ADR 0015 auf „angenommen“. ADR 0011 bekommt oben den Verweis: „Punkt 2 (Radius) und Punkt 3, Satz 2 ersetzt durch ADR 0015; Punkte 4, 5 und 6 ergänzt“.
8. **Arch-Review** (`/arch-review`, Pflicht: Schemaänderung, neues Modul, > 200 Zeilen). Befunde einarbeiten.
9. **Abschluss:** `PW_PORT=4273 pnpm check` grün. Branch pushen, CI grün, Fast-Forward nach `main`, CI auf `main` grün, die Live-Seite zeigt Linien. Build-Zeit aus dem CI-Log eintragen.
10. **Browser-Review live** (`/browser-review live`): Detail und Orts-Sheet mit einer und mit zwei Linien, ein Ort zu Fuß, ein Ort „über 2 Std. (mit höchstens 1 Umstieg)“; hell und dunkel, 360 px und 200 %; VoiceOver/TalkBack-Stichprobe für „, dann“ (liest VoiceOver die Spans als einzelne Wischschritte? Review 2, H4). Ergebnis im Plan.

## Akzeptanzkriterien

- Detail und Orts-Sheet zeigen bei Wegzeit mit Bus & Bahn eine Linie oder zwei Linien mit „→“; vorgelesen wird „, dann“.
- Keine Verbindung mit mehr als einem Umstieg, weder in Minuten noch in Linien.
- Ein Umstieg nur, wenn er mindestens 10 Min. früher ankommt, je Starthalt (T4/T5) und über alle Zugangshalte im Browser (D2).
- Ohne `linien.json` (Fehler, Zeitlimit, unpassend) bleibt die Anzeige der Minuten unverändert, ohne Fehler und ohne Neuladen.
- Über 2 Std. oder ohne Weg steht „über 2 Std. ab … (mit höchstens 1 Umstieg)“, ohne Linien.
- „Außerhalb des Stadtgebiets“ gilt wie bisher bei 800 m.
- Kein Request hängt vom Startpunkt ab; E2E belegt es für `linien.json`.
- Budgets grün, Build-Zeit ≤ 10 s, `pnpm check` grün, CI auf `main` grün, Browser-Review live bestanden.
- `fahrplan.json` entstand über `pnpm pipeline oepnv`, nicht von Hand.

## Risiken

- **Weite Wege werden länger oder fallen weg:** 52 von 2 660 Stadtteil-Ort-Paaren verlieren ihren Weg, p99 +23 Min. Das ist die Folge der Regel (N4). Der Filter „bis 45 Min.“ zeigt dann weniger Orte. Schritt 3 misst nach, Schritt 10 schaut sich Beispiele an.
- **1 500 m Fußweg sind viel:** Ein so langer Zugang wird nur genommen, wenn er insgesamt schneller ist. Die Anzeige nennt die Fußwege nicht. Ist das in der Praxis zu viel, ist `ACCESS_METERS`/`EGRESS_METERS` die Stellschraube (M4 zeigt 1 200 m).
- **Build-Zeit:** gemessen 2,8 s; Gegenmittel bei Bedarf: `comboOf` (E4), Cache über einen Hash (ADR 0011, Konsequenzen).
- **Browser-Rechenzeit:** Bei 1 500 m liegen rund 3,5-mal so viele Zeilen im Zugang wie bei 800 m. Das ist eine Schleife über 556 Zeilen × 76 Spalten je Startpunkt, unkritisch. Schritt 10 schaut beim Stadtteilwechsel auf Verzögerung.
- **„Häufigste Verbindung“ passt nicht zu jedem Moment:** Darauf weisen der Hinweis „Di vormittags“ und der Quellensatz hin.
- **Gleicher Name, verschiedenes Verkehrsmittel:** deshalb `mode` je Fahrt, nicht je Name (E1).
- **Fahrplanwechsel 12.12.2026:** Die Linien ändern sich mit dem neuen Auszug automatisch.
- **Gecachte alte `wegzeit.json` (Version 1):** Bis der HTTP-Cache sie erneuert (`max-age=600`) oder „Nochmal laden“ greift, gilt die Luftlinie (E6). Das ist derselbe Weg wie bei jedem Formatwechsel.

## Review (2026-10-05, plan-reviewer, Runde 1, auf Fassung 1) – Verdict: Freigabe mit Änderungen → eingearbeitet

Der Reviewer bestätigte den Kern von Fassung 1: Die Bewertung „echte Ankunft + k · P“ ist additiv, die Pareto-Liste bleibt monoton. Alle Befunde wurden übernommen, keiner abgelehnt. Fassung 2 behält sie bei. Wo das Modell mit zwei Ebenen einen Befund überflüssig macht, steht es dabei.

**Blocker**
- **B1, Linien nach `loaded` gingen verloren:** Die Aktion `lines` wird ohne `live`-Prüfung geschickt, Schutz nur über den Reducer (E9). Hook-Test S2, E2E E6.

**Wichtig**
- **W1, Ausreißer-Schutz filterte praktisch nichts:** Grenze max(3 Min., 25 % des Zellwerts), Messung in Schritt 3 (E4).
- **W2, Linien parallel zu `site.json` und `wegzeit.json`:** `linien.json` erst nach der Tabelle, `priority: "low"` (E9).
- **W3, Smoke ohne Aussage, kein Gate:** Smoke mit Linienmuster (E5), Gate in `build-data` (E7).
- **W4, Umbruch langer Folgen:** U+00A0 in den Namen, Wrapper mit `overflow-wrap: normal` (E10), dritte Fixture-Linie „202E“ (E1, E4).
- **W5, `route_type` warf für jede Route:** Fehler nur für Fahrten im Auszug (E1).

**Hinweise**
- **Tests:** Toleranz `1e-6` s (E3, T2, T3).
  - T2 „bis zum Fixpunkt“ ist mit zwei festen Ebenen gegenstandslos.
- **Code:**
  - `MAX_LEGS` bzw. der Zyklusschutz ist mit zwei Ebenen gegenstandslos, denn `trips()` liefert höchstens zwei Fahrten.
  - Eigene `cmp` in `lines.ts` (E4).
  - `contentId` mit Stichtag, Feedstand, Aufschlag und Radius (E6).
  - `buildTransitTables` mit `opts.penaltySeconds` und `stats` (Struktur, E7).
  - `decodeFor` hängt nur an `file`/`logic` (E9).
  - Eigener Timer der Linien (E9).
  - Little-endian von Hand ist gegenstandslos, denn `linien.json` nutzt zwei `Uint8`-Ebenen (E7).
- **Anzeige:**
  - Bei unendlicher Zeit keine Linien, mit eigener Begründung (E10).
  - Der Quellensatz nennt die Regel (E10).
  - Der Textwechsel im offenen Detail ist bewusst hingenommen (E9).
- **Vorgehen:**
  - Vergleichsbasis in Schritt 3 ist derselbe neue Auszug im alten Modell.
  - Fixture von Hand nachrechnen (L4, Schritt 7).
  - `karte.spec.ts` wartet auf `linien.json` (E3).
  - Build-Zeit: Ablesen im CI-Log (Backpressure).
- **Doku:**
  - Plan 0011, E4/E4a (E9).
  - Status von ADR 0015 präzisiert.

## Review (2026-10-05, plan-reviewer, Runde 2, auf Fassung 2) – Verdict: Freigabe mit Änderungen → eingearbeitet

Der Reviewer bestätigt:
- Die Profil-CSA in zwei Ebenen ist exakt: Der Aufschlag ist je Ebene konstant, `p0` ist fertig, bevor Ebene 1 liest, und ein Umstieg in dieselbe Fahrt gewinnt nie gegen Sitzenbleiben.
- Die Radien sind über alle Aufrufer getrennt.
- Die Invariante „kein Request hängt vom Startpunkt ab“ hält.
- B1 ist korrekt gelöst.
- `ReachLong` verletzt keine Regel.

Keine Blocker. Alle Befunde sind übernommen, mit einer Ausnahme bei H1 (siehe dort).

**Wichtig**
- **W1, Vorrang galt nur je Starthalt:** Im Browser hätte ein Umstiegsweg ab einem anderen Halt gegen eine nur wenig langsamere Direktverbindung gewonnen.
  - Variante (b) übernommen: Umstiegs-Bit in Bit 7 von `wegzeit.json`, Formatversion 2. Der Browser vergleicht mit Aufschlag, auch gegen den Fußweg (E2, E6, E8, D2).
  - Der Reviewer wollte das dem Nutzer vorlegen. Entschieden habe ich es als Auslegung von „Direktverbindungen immer bevorzugen“ (N4), und es steht in der Antwort an den Nutzer.
- **W2, Gleichstand über verschiedene Abfahrten:** Regel präzisiert (spätere Abfahrt, erst bei gleicher Abfahrt die Direktverbindung), T5 mit beiden Reihenfolgen, ADR angepasst (E2, E3).
- **W3, `.place-where span` setzte den Pfeil auf eine eigene Zeile:** Selektor `.place-where > span`, E2E-Prüfung „eine Zeile“. `.sr-only` kommt aus Tailwind, keine neue Hilfsklasse (E10, E1).
- **W4, Hook- und Komponententests in Node ohne DOM nicht möglich:** `deliverLoad` als reine Funktion (E9, S2). `ReachLong` nur per E2E (F2).
- **W5, `getByText` mit Pfeil und sr-only:** `toMatchAriaSnapshot` für die vorgelesene Form, Locator `[aria-hidden]` für die sichtbare (E1).
- **W6, T2 übte die Grenze kaum:** zusätzlich Abgang 300/800 m, Zähler mit Untergrenzen. Die Definition von `arr_1` ist in einem Satz geklärt (T2).
- **W7, Anzeige über 2 Std.:** Linien nur bei ≤ 120 Min., neutraler Text „über 2 Std. ab … (mit höchstens 1 Umstieg)“, F1-Fälle 130 Min. und unendlich (E8, E10).

**Hinweise**
- **H1:** übernommen: `id` über beide Ausgaben (E6). **Abgelehnt:** der optionale Zweitabruf mit `cache: "reload"` bei Nichtpassen. Begründung in E6: kurzes `max-age`, die Wegzeit bleibt.
- **H2:** `route.min(1)`, der Extractor wirft bei leerem Namen (E1).
- **H3:** „U1 → U1“ wird bewusst zu „U1“ zusammengefasst, das Bit bleibt gesetzt; `key` ist der Index (E4, E10, L8).
- **H4:** U+00A0 vor dem Pfeil (E10). VoiceOver-Stichprobe im Browser-Review (Schritt 10).
- **H5:** Anforderungen an die Fixture-Fahrt „202E“ in Schritt 1.
- **H6:** `reachLong` liefert nur noch Teile, keine tote String-Fassung (E10).
- **H7:** Quelle des alten Modells für die Messung (Schritt 3).
- **H8:** beide Grenzen inklusiv in D3, `transit.test.ts:146` umgestellt.
- **H9:** ADR 0015 ergänzt um die Statuszeile (ADR 0011, Punkt 3, Satz 3) sowie W1 und W2.
- **H10:** `linien.json` erst, wenn auch die Logik da ist (E9).

## Umsetzung

Stand 2026-10-05, Branch `linien-0012`. Schritte 1–4 umgesetzt, Schritt 3 gemessen. Nach Schritt 4 angehalten, weil mehrere Werte um mehr als 20 % von M4 abwichen (siehe „Messung Schritt 3“). **Nutzerentscheidung N5 (2026-10-05): Umstiegs-Bit behalten wie geplant**, siehe „Entscheidung zur Abweichung“. Danach Schritte 5–7.

### Schritt 1 – Auszug und Fixture

- `pnpm pipeline oepnv`: Feed unverändert (HTTP 304, VGN-Soll-Daten vom 24.06.2026), Stichtag weiter **Di 13.10.2026**. Der alte Auszug ohne `mode` bestand die Prüfung nicht und wurde ohne `--force` neu geschrieben. 3 405 Fahrten: 2 519 Bus, 373 Tram, 310 U-Bahn, 203 Bahn. 1 062,4 kB roh, 174,5 kB gzip.
- `route` ohne Namen wirft für übernommene Fahrten als `GTFS: Route <id> ohne Namen` (die Route-ID, weil es keinen Namen gibt).
- **Fixture-Linie „202E“** (`tests/fixtures/oepnv/fahrplan.json`): Bus 9004:2 → 9008 ohne Zwischenhalt, ab 8:33 alle 10 Min. bis 12:23 (24 Fahrten; eine 25. um 12:33 läge hinter dem Auszugsende 12:30 und brach `tableRows`), 6 Min. Fahrt. Rechenweg ab Gostenhof (49,448 / 11,058; Zugang ≤ 1 500 m: 9001 in 91 m = 1,6 Min., 9002 in 473 m = 8,2 Min., 9003 in 1 368 m = 23,7 Min.):
  - Tram 1 erreicht 9004:1 um T + 9:30 (T = 8:20, 8:30 …); Umstieg zu 9004:2 (122 m, 2,1 Min. + 1 Min.) ist um T + 12:40 fertig, der 202E fährt um T + 13:00, an 9008 um T + 19:00. Bus 2 (alle 20 Min., 8 Min. bis 9008) kommt nach jeder Tram später an, also gewinnt der 202E jede Minute.
  - **Direkt mit Tram 1 am besten:** Beispielhof (Zeile 9001: 12 Min. → 1,6 + 12 = 13,6 → „15 Min.“), Bibliothek (14 → 15,6 → „15 Min.“).
  - **Nur mit „Tram 1 → Bus 202E“:** Gemeindehaus (3,0 km Luftlinie). Zeile 9001: 4,5 Min. Median-Warten + 17 Min. + 47 m (0,8 Min.) = 22,3 → 22, Bit gesetzt. Ab Gostenhof real 1,6 + 22 = 23,6 („25 Min.“), bewertet 33,6; über 9002 28,2 (38,2), über 9003 39,7 (49,7); zu Fuß 52 Min. Passung: Die Folge belegt alle 120 Minuten, `d` ≈ 0,3.
  - Musikschule: „Tram 1 → Bus 2“ (Zeile 9001: 28 mit Bit, ab Gostenhof 29,6, bewertet 39,6; zu Fuß 40,9). Der 202E kommt der Musikschule über 9008 (694 m) nie näher: Er wäre in jeder Minute mindestens 27 s später als Bus 2.
  - **Zu Fuß am besten:** Theater (226 m). Im Browser gewinnt allerdings knapp die Zelle 9001 „zu Fuß vom Halt“ (1,6 + 2 = 3,6 gegen 3,9 Min. direkt, Rundung des Zellwerts), also ohne Linien „mit Bus & Bahn“ – das ist der Fall aus E5, wie heute. Ein echtes „zu Fuß“ zeigt weiter der Standort-Test (`startpunkt.spec.ts`, „ca. 5 Min. zu Fuß ab deinem Standort“).
  - Die längste Folge der Fixture ist „Tram 1 → Bus 202E“ (Gemeindehaus, für E4).
  - Filter „bis 20 Min.“ blendet Musikschule (29,6) und Gemeindehaus (23,6) weiter aus. Die Reihenfolge der Orts-Liste ändert sich: Gemeindehaus (25 Min.) kommt jetzt vor die Musikschule (30 Min.).

### Schritt 2 – Profil-CSA

- Wie E3. Die Ebene 0 liegt nach ihrem Durchlauf als CSR je Steig (aufsteigend nach Abfahrt) vor; Ebene 1 sucht den Anschluss binär.
- **Abweichung (Gleichstand):** Bei gleicher Abfahrt und gleicher Bewertung gewinnt die Direktverbindung auch dann, wenn der Umstiegsweg zuerst gescannt wird (beim Überschreiben eines Eintrags mit gleicher Abfahrt). Nur mit „strikt `<`“ hinge das von `connectionOrder` ab (die Verbindung mit der späteren Ankunft am nächsten Halt kommt zuerst). So gilt ADR 0015, Punkt 2 („bei gleicher Abfahrt die Direktverbindung“) wörtlich. Test T5 übt genau diesen Fall.
- T5 „Sitzenbleiben vor Abgang“ ist nicht beobachtbar (gleiche Fahrt, gleiche Ankunft) und hat keinen eigenen Test. „Abgang vor Umstieg“ an derselben Haltestelle lässt sich mit Gleitkomma-Fußwegen nicht exakt gleich bauen; der Fall ist über „gleiche Abfahrt → Direktverbindung“ abgedeckt.
- **T2-Zähler** (Zufallsnetz jetzt 60 statt 40 Fahrten, sonst lag „P = 0 und P = 600 wählen verschieden“ unter 5 %): je Radius schwanken die Zähler stark (bei 1 500 m nur 4 % Minuten mit Umstieg), deshalb gelten die Untergrenzen für die Summe über 300, 800 und 1 500 m. Erster Lauf: 15 120 Minuten, ein Umstieg 3 198 (21 %), unbegrenzt schneller 960 (6,3 %), P verschieden 1 291 (8,5 %).
- **Kanarienvögel:** ohne Aufschlag 10 Tests rot; ohne Direkt-Vorrang 1 rot; ohne Umstiegszeit 4 rot; vertauschte Rückverfolgung 8 rot.

### Schritt 3 – Tabelle und Linien

- Wie E4–E7. **Abweichung:** Eine Folge zählt mit ihrer Fahrtenzahl („U1“ direkt und „U1 → U1“ sind verschiedene Folgen), sonst wäre das Umstiegs-Bit bei zusammengefassten Namen nicht eindeutig. Gleichstand danach wie geplant (weniger Linien, Median, Text), als letztes weniger Fahrten.
- `encodeMinutes` heißt jetzt `encodeBytes` (kodiert auch die Linien-Ebenen).
- **Laufzeit:** Der erste Stand brauchte 4,8 s. `valueAt` wurde in den heißen Schleifen megamorph (Int32-, Float64- und Uint8-Arrays, 1,1 s Eigenzeit). Monomorphe Lesehilfen `i32`/`f64` in `profile-csa.ts` und ein Abbruch der Umstiegssuche, wenn kein Anschluss mehr gewinnen kann (`at + 60 s + P ≥ bisher beste Bewertung`), bringen die Tabelle auf **2,1–2,3 s**. Das alte Modell braucht auf derselben Maschine 3,3–3,4 s.
- **Gate:** `MAX_WITHOUT_LINES = 0,093` (gemessen 4,3 % + 5 Prozentpunkte). Kanarienvögel: Schwelle 4 % → `build-data` rot; keine Linien (Fixture) → rot („keine Zelle hat Linien“); `node:fs` in `lines.ts` → `transit-build-pure` rot.
- **Budgets** (`pnpm build && pnpm size`, Stand Schritt 4): Linien-Daten 27,99 kB (≤ 40), Wegzeit-Daten 42,12 kB (≤ 64), Wegzeit JS (lazy) 1,41 kB (≤ 3), JS (initial) 90,9 kB (≤ 92, Anzeige aus Schritt 6 fehlt noch). Kanarienvogel: Grenze „Linien-Daten“ 20 kB → `size-limit` rot.
- Schritt 4 lief vor der Messung, damit die Messung die echte Browser-Rechnung (`transitReach` mit Bit und Linien) nutzt.

### Messung Schritt 3 (2026-10-05)

**Rechenweg** (Skript außerhalb des Repos, `/tmp/m0012b/measure.ts`):
- Altes Modell: `git show main:scripts/transit/{profile-csa,table}.ts` und `git archive main src/domain` in ein temporäres Verzeichnis; daraus `buildTransitTable` (unbegrenzt, ohne Aufschlag, Abgang 800 m) und `transitReach` (800 m) aus `main`.
- Beide auf **demselben neuen Auszug** (Stichtag 13.10.2026) und denselben 76 Orten aus `site.json` (echte Daten), 556 Haltbereiche.
- Je Stadtteil (35) × Ort (76) = 2 660 Paare: neu `transitReach(table, origin, lines)`, alt `transitReach` aus `main`. Verschiebung = neu − alt, nur wo beide endlich sind (2 608 Paare).
- Direkt/Umstieg: Bit der gewählten Zelle; „ohne Linien“ getrennt nach „häufigste Folge leer“ (zu Fuß vom Halt) und „unpassend“.
- „Umstiegs-Bit entscheidet um“: dieselbe Wahl im Browser einmal mit, einmal ohne Aufschlag; gezählt, wo ohne Aufschlag ein Umstiegsweg gewinnt, mit Aufschlag eine andere Zeile (Direktverbindung) oder der Fußweg.
- `d` je Zelle: Build-Schleife nachgebaut, Median der Minuten der häufigsten Folge gegen den Zellwert.
- Größen mit gzip Stufe 9.

**Ergebnisse:**

| Wert | M4/M5 (Prototyp) | gemessen, wie geplant (mit Bit) | gemessen ohne Bit im Browser |
|---|---|---|---|
| `wegzeit.json` | 62,4 kB / 41,6 kB gzip | 62,5 kB / 42,1 kB | – |
| `linien.json` | 113,3 kB / 27,9 kB gzip | 113,6 kB / 28,0 kB | – |
| Linien, Folgen | 67, 651 | 66, 659 | – |
| Laufzeit Tabelle | 2,8 s | 2,1–2,3 s (alt 3,3 s) | – |
| Minuten Mittel | +2,3 | **+2,94 (+28 %)** | +2,26 |
| p90 | +7 | **+8,9 (+27 %)** | +7,0 |
| p99 | +23 | +23,8 | +23,0 |
| > 15 Min. länger | 2,1 % | 2,3 % | 2,1 % |
| neu „über 2 Std.“ | 52 | 53 | 53 |
| zu Fuß | 2,9 % | 3,0 % | 2,9 % |
| direkt (von Bus & Bahn) | 45,0 % | **58,5 % (+30 %)** | 44,2 % |
| ein Umstieg | 53,8 % | **39,1 % (−27 %)** | 53,7 % |
| ohne Linien (Paare) | 32 | **60 (+88 %)**: 33 zu Fuß vom Halt, 27 unpassend | 54: 32 zu Fuß vom Halt, 22 unpassend |

- **Umstiegs-Bit** (E2, Review 2, W1): Es entscheidet **366 Paare (13,8 %)** zu einer Direktverbindung um, 5 zum Fußweg. Diese Paare werden im Mittel 4,8 Min. länger (p50 4,3, p90 8,9, höchstens 10,0).
- **`d` je Zelle** (33 889 Zellen mit Linienfolge): p50 0,38, p90 2,56, p99 6,91 Min. Ohne Linien 1 514 von 35 226 Zellen (4,3 %), davon wegen der Passung 143 (0,4 %). Unter der Nachfrage-Schwelle von 10 %.

**Befund:** Ohne das Umstiegs-Bit im Browser trifft die Messung M4 auf wenige Prozent genau. Die Abweichungen über 20 % kommen **allein vom Umstiegs-Bit**, das erst Review 2 (W1) nach der Messung M4 hinzugefügt hat; M4 hat es nicht enthalten. „Ohne Linien“ liegt zusätzlich wegen der Passungsprüfung (Review 1, W1) höher, die M4 ebenfalls nicht kannte (22–27 Paare, 0,4 % der Zellen).

### Entscheidung zur Abweichung (Nutzer, N5, 2026-10-05)

**Umstiegs-Bit behalten wie geplant (Option 1).** Die Werte der Spalte „mit Bit“ sind die neue Referenz statt M4.
- Begründung: Die Abweichung kommt allein von Review 2, W1 (Bit im Browser), nicht von einem Fehler im Modell; ohne Bit trifft die Messung M4. Das Bit setzt die Nutzerregel „direkt vor Umstieg, Umstieg nur bei ≥ 10 Min. Gewinn“ (N4) auch über verschiedene Zugangshalte um.
- `MAX_WITHOUT_LINES = 0,093` bleibt.

Zur Nachvollziehbarkeit die Optionen, die zur Wahl standen:

1. **Umstiegs-Bit wie geplant behalten** (Direktverbindung hat auch über verschiedene Halte Vorrang): 58,5 % direkt; die Minuten steigen gegenüber heute im Mittel um +2,9 statt +2,3 (p90 +8,9 statt +7). 366 Stadtteil-Ort-Paare zeigen eine Direktverbindung, die im Mittel 4,8 Min. (höchstens 10 Min.) langsamer ist als ein Umstiegsweg ab einem anderen Halt im Umkreis. Dann gelten die Werte der Spalte „mit Bit“ als neue Referenz, und Schritte 5–7 laufen unverändert weiter.
2. **Ohne Bit** (Vorrang nur je Starthalt, Variante vor Review 2, W1): Werte wie M4 (44 % direkt). Der Browser zeigt dann mitunter einen Umstiegsweg ab einem weiter entfernten Halt, obwohl ab dem nächsten Halt eine nur wenig langsamere Direktverbindung fährt. Das Bit kann in der Datei bleiben (Formatversion 2), nur `transitReach` vergliche ohne Aufschlag; ADR 0015 und E2 wären anzupassen.

Zusätzlich zur Kenntnis: 27 Paare (1,1 %) verlieren ihre Linien durch die Passungsprüfung (`d > max(3 Min., 25 %)`); die Prüfung bleibt wie geplant.

### Schritt 5 – Laden

- Wie E9. `loadTransit` startet `linien.json` erst, wenn Tabelle **und** Logik da sind (bei Zeitlimit des Chunks nie), mit `priority: "low"`, eigenem `AbortController` und eigenem Timer (`TRANSIT_TIMEOUT_MS`).
- `decodeFor` nimmt jetzt `(file, logic, placeKeys)` statt des ganzen Zustands; so dekodiert die Ankunft der Linien die Tabelle nicht neu.
- Kanarienvögel: Linien-Zustellung mit `isLive`-Prüfung → B1-Test rot; Linien-Anfrage parallel zur Tabelle → 2 Tests rot.

### Schritt 6 – Anzeige

- **Abweichung:** `ReachLong` rendert höchstens zwei Linien ohne Schleife, also ganz ohne `key` (statt `key` = Index, Review 2, H3). Das Ergebnis im DOM ist dasselbe.
- `reachLong` liefert ohne Linien den ganzen Text in `before`, `after` ist dann leer.
- `.reach-long { overflow-wrap: normal }` steht in `dialog.css` (Detail und Orts-Sheet nutzen sie; beide Dateien liegen im Start-CSS).
- JS (initial) 91,42 kB (vorher 90,9 kB, ≤ 92): mehr als die erwarteten 0,3 kB, vor allem durch den längeren Quellensatz und das Laden der Linien in `src/data` und `use-transit.ts`.

### Schritt 7 – E2E und Doku

**Fixture-Erwartungen ab Gostenhof, von Hand nachgerechnet** (Rechenweg im Kopf von `e2e/startpunkt.spec.ts`, Zellen in `scripts/transit/table.test.ts`): Theater 3,6 „5 Min. mit Bus & Bahn“ (ohne Linien, E5), Beispielhof 13,6 „15 Min. mit Tram 1“, Bibliothek 15,6 „15 Min. mit Tram 1“, Gemeinde 23,6 „25 Min. mit Tram 1 → Bus 202E“, Musikschule 29,6 „30 Min. mit Tram 1 → Bus 2“. Die Orts-Liste (`karte.spec.ts`) und die Anbieterliste (`anbieter-inhalt.spec.ts`) sortieren jetzt die Gemeinde (25) vor die Musikschule (30). Der Filter „bis 20 Min.“ blendet weiter beide aus.

**Abweichungen:**
- **Aria-Snapshot:** Playwright liest „Tram 1 , dann Bus 2“ mit Leerzeichen vor dem Komma, weil `.sr-only` absolut positioniert ist (Block in der Namensberechnung, wie in den Browsern). Die Prüfung (`expectTwoLines` in `e2e/fixtures.ts`) lässt dieses Leerzeichen zu und vergleicht sonst wörtlich. Ob VoiceOver/TalkBack dort eine Pause machen, klärt Schritt 10.
- **Orts-Sheet mit zwei Linien:** Kein Fixture-Ort mit mehreren Angeboten (Orts-Sheet) hat zwei Linien; Gemeinde und Musikschule haben je ein Angebot und öffnen direkt das Detail. Für das Orts-Sheet (E1 „eine Zeile“, E4) schreibt `twoLinesEverywhere` (`e2e/fixtures.ts`) im Test die Linien-Datei um: Jede Zelle mit nur „Tram 1“ bekommt „Bus 202E“ als zweite Linie (Kennung bleibt). Die Fixture-Daten selbst bleiben unverändert.
- **E4 im Detail:** Das Detail der Gemeinde (echte Folge „Tram 1 → Bus 202E“) besteht `expectTextFits` nicht, unabhängig von diesem Plan: Der Preis „48 € für vier Nachmittage, **Geschwisterkinder** ermäßigt“ bricht in der halben Label-Spalte mitten im Wort (156 px ≤ 70 % von 380 px, Pixel 7, 100 %). Das Detail dieses Angebots stand bisher in keinem UX-Gate. **Befund für den Orchestrator**, nicht hier behoben. E4 nutzt deshalb das Detail des Beispielhofs mit `twoLinesEverywhere` (gleicher Text der Linien).
- E2 (abgebrochen) prüft zusätzlich den Filter „bis 20 Min.“ (6 Angebote); E6 hält `linien.json` 1,5 s zurück.
- Kanarienvogel E1/W3: `.place-where span` statt `.place-where > span` → „Linie davor und Pfeil in einer Zeile“ rot.

**Doku:** `docs/architecture.md` (Datenfluss, Absatz Wegzeit, Invariante), README (Lizenzabsatz), `docs/ideas.md` (Linien auf der Kachel, VGN-Auskunft, Piktogramme, Profil „ohne Kinderwagen“, „zu Fuß vom Halt“ als „zu Fuß“), Plan 0011 (E4 Zeile 5, E4a Punkt 3), ADR 0013 (Punkt 3 und 7), ADR 0015 „angenommen“ mit den gemessenen Werten, Verweis oben in ADR 0011.
