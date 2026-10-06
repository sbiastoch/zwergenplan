# ADR 0011 – Öffi-Wegzeit: Halt→Ort-Tabelle aus VGN-GTFS mit Bus

Status: angenommen (2026-10-05), Umsetzung mit Plan 0009. Ersetzt Teile von ADR 0005, ergänzt ADR 0002, ADR 0003 und ADR 0006. Details, Messungen und Begründungen stehen in Plan 0009.

**Geändert durch ADR 0015 (Plan 0012):** Punkt 2 (Radius) und Punkt 3, Satz 2 ersetzt durch ADR 0015; Punkte 4, 5 und 6 ergänzt.

**Geändert durch ADR 0017 (Plan 0016):** Punkt 6, Spiegelstriche 1 und 3 (Laden beim Start und das verratene Bit gelten für jeden gespeicherten Startpunkt, nicht nur für einen Stadtteil).

**Geändert durch ADR 0019 (Plan 0018):** Wortlaut der Statuszeile (Punkt 3, Satz 3). Punkt 9 bleibt erfüllt, „außerhalb des Stadtgebiets“ steht weiter dort.

## Kontext

ADR 0005 legte fest, dass die Wegzeit aus einer statischen GTFS-Matrix entsteht: ~150 Halte U-Bahn, S-Bahn und Tram, `Venue.nearestStops`, Fahrzeit ohne Umsteige-Wartezeit. Plan 0009 hat das am VGN-Feed nachgemessen (Stand 24.06.2026, gültig bis 12.12.2026, 15,3 MB):

- 22 von 76 Orten liegen weiter als 600 m vom nächsten U-, S- oder Tram-Halt, 12 weiter als 1 km. Jeder Ort hat einen Bushalt in höchstens 411 m.
- Ohne Bus wäre die Schätzung bei 31,8 % der Stadtteil-Ort-Paare mehr als 5 Min. zu pessimistisch, im schlimmsten Fall um 73 Min.
- Eine Halt→Halt-Matrix mit Bus hätte 325 kB (Stadtgebiet, 570 Halte) bis 3,1 MB (Großraum). Eine Tabelle Halt→Ort kommt auf 43 kB roh bzw. 38 kB gzip.
- Die Wartezeit macht im Median über das Vormittagsfenster rund 6 Min. gegenüber der besten Fahrt aus. Das ist zu viel, um es wegzulassen.

## Entscheidung

1. **Bus gehört dazu.** Alle Linienverkehre des VGN-Feeds im Großraum zählen. Bedarfsverkehre (Rufbus, Anrufsammeltaxi, Linien(bedarfs)taxi) und Halte mit Anmeldepflicht (`pickup_type`/`drop_off_type` ≠ 0) zählen nicht.
2. **Halt→Ort-Tabelle statt Halt→Halt-Matrix.**
   - Zur Build-Zeit rechnet eine eigene Profil-CSA in TypeScript für jeden Haltbereich im Stadtgebiet Nürnberg (DHID `de:09564:`) die Tür-zu-Tür-Zeit zu jedem Ort.
   - Der Browser addiert nur den Fußweg vom Startpunkt zu den Halten im Umkreis von 800 m und nimmt das Minimum, auch gegen den direkten Fußweg.
   - **`Venue.nearestStops` wird gestrichen.** Es ist ein abgeleiteter Wert, und der Datenvertrag speichert keine abgeleiteten Werte.
3. **Die Wartezeit zählt.** Jede Zelle ist der Median über die Abfahrtsminuten Dienstag 8:30–10:30 eines Referenz-Schultags, mit Warten am ersten Halt und beim Umsteigen. Die Anzeige sagt „ca. … Min. mit Bus & Bahn (Di vormittags, inkl. Warten)“.
4. **Fahrplanauszug im Repo.** `pnpm pipeline oepnv` lädt den Feed lokal, mit Cache und bedingtem `GET`. Daraus entsteht `data/oepnv/fahrplan.json`: Referenztag und Fenster, nur der Großraum, Schema `Timetable` in `src/domain/schema.ts`. CI und Build laden nie etwas vom VGN. Die Tabelle `public/data/wegzeit.json` entsteht bei jedem Build neu.
5. **Lizenz vorsichtig als CC BY-SA 3.0 DE.**
   - Die Download-Seite nennt CC BY 3.0 DE, die Nutzungsbedingungen (Nr. 5 Abs. 3) CC BY-SA 3.0 DE.
   - Wir erfüllen Abschnitt 4 der strengeren Lizenz: Lizenz-URI; gleiche Lizenz für Auszug und Tabelle; Namensnennung „VGN – Verkehrsverbund Großraum Nürnberg GmbH“ mit Titel, URI und dem Hinweis „abgewandelt“.
   - Die Angaben stehen im Kind-Sheet, im README und im Feld `source` beider Dateien.
6. **Laden und Privatsphäre.**
   - Die Tabelle ist für alle gleich und kommt vom eigenen Origin. Sie lädt beim Öffnen einer Startpunkt-Oberfläche (Kind-Sheet, Karte), auf „Nochmal laden“ oder beim Start, wenn ein Stadtteil gespeichert ist, nie als Folge einer Wahl.
   - Neue Invariante: **Kein Request hängt davon ab, welcher Startpunkt gilt**, außer den Kartenkacheln beim Stadtteil-Zoom (ADR 0008). URL und Inhalt jedes anderen Requests sind für alle gleich.
   - Bewusste Ausnahme: Der Request beim Start verrät dem eigenen Host ein Bit, nämlich dass ein Stadtteil gespeichert ist, aber nicht welcher.
7. **Filter in Minuten.** `wegzeit=20|30|45` ersetzt `umkreis=2|5|10` (km). Die Grenze wirkt nur, wenn die Wegzeit verfügbar ist.
8. **„Haltestelle wählen“ entfällt** als Startpunkt-Quelle (ADR 0005, Fallback ohne GPS). Stadtteil, Standort und Kartenmitte decken das ab, eine Liste mit 570 Halten wäre schlecht bedienbar.
9. **Startgebiet ist das Stadtgebiet Nürnberg.** Liegt der Startpunkt außerhalb, ist also kein Halt des Stadtgebiets in 800 m, gilt die Luftlinie mit dem Hinweis „außerhalb des Stadtgebiets“.
10. **Neue devDependency `fflate`** (MIT, ohne Abhängigkeiten), nur in `scripts/pipeline/io` zum Entpacken.

## Alternativen

- **Halt→Halt-Matrix nur U/S/Tram** (ADR 0005): klein, aber für ein Drittel der Paare deutlich zu pessimistisch.
- **Halt→Halt mit Bus:** 325 kB bis 3,1 MB, dazu `nearestStops` im Schema.
- **Nur 35 Stadtteile → Orte:** 2,7 kB und exakt, aber ohne Standort und Kartenmitte.
- **Feed in CI laden:** Netzabhängigkeit an `vgn.de` in jedem Build, nicht reproduzierbar.
- **gtfs.de:** 285 MB für ganz Deutschland, nur 30 Tage.
- **npm-Router:** `raptor-journey-planner` und `connection-scan-algorithm` sind GPL-3.0 und können kein Profil über ein Zeitfenster. `gtfs` importiert nur nach SQLite und routet nicht.

## Konsequenzen

- Die Wegzeit ist eine ehrliche Schätzung aus Soll-Daten: keine Verspätungen, eher pessimistisch (Wartezeit, ein Fußweg je Umstieg, 1 Min. Puffer).
- `data:build` rechnet die Tabelle bei jedem Build. Gemessen wurden ca. 7 s unter Last; ein Cache über einen Hash ist der Ausweg.
- Der Auszug muss mit dem Fahrplanwechsel erneuert werden. Der Skill prüft das bei jedem Lauf, CI warnt kurz vor dem Ablauf und danach, wird aber nie rot.
- Die Tabelle wächst linear mit der Zahl der Orte (≈ 0,5 kB gzip je Ort), Budget 64 kB.
- ADR 0005 gilt weiter als Ziel („Öffi-Wegzeit statt Luftlinie, offline, ohne Drittanbieter“), mit den Abweichungen oben. ADR 0003: `nearestStops` gestrichen. ADR 0010 bleibt unverändert, denn `src/data/transit.ts` lädt nur und importiert nichts aus `src/domain`.
