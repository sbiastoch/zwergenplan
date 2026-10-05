# ADR 0015 – Wegzeit mit höchstens einem Umstieg und Linien

Status: angenommen (2026-10-05), Umsetzung mit Plan 0012. Nutzerentscheidungen vom 2026-10-05, nach der Messung in Plan 0012, Schritt 3 bestätigt (N5: Umstiegs-Bit bleibt).
- Ersetzt ADR 0011, Punkt 2 (Radius des Fußwegs zum Halt), Punkt 3, Satz 2 (welche Verbindung zählt) und Punkt 3, Satz 3 (Anzeige: „… inkl. Warten“ wird zu „Di vormittags, höchstens 1 Umstieg, inkl. Warten“).
- Ergänzt ADR 0011, Punkt 4 (zweite Build-Datei), Punkt 5 (Lizenz und Namensnennung gelten für Auszug, Tabelle und Linien) und Punkt 6 (Laden der Linien).
- Ergänzt ADR 0003 (Schema `Timetable`).
- Punkt 9 von ADR 0011 („außerhalb des Stadtgebiets“ bei 800 m) bleibt unverändert.

Details, Messungen und Alternativen stehen in Plan 0012.

## Kontext

Die Wegzeit zeigt nur Minuten („ca. 25 Min. mit Bus & Bahn“). Gewünscht ist dazu, welche Linien man nimmt („mit Bus 37 → U1“).

- Der Fahrplanauszug kennt den Liniennamen je Fahrt, aber nicht das Verkehrsmittel.
- Die Profil-CSA aus ADR 0011 erlaubt beliebig viele Umstiege bei 1 Min. Puffer. Gemessen wählt sie oft 3–7 Fahrzeuge, um eine Minute zu sparen. Für Eltern mit Kinderwagen ist das weder als Minutenangabe noch als Linienangabe brauchbar.
- Die Regel des Nutzers:
  - Direktverbindungen haben Vorrang.
  - Ein Umstieg nur, wenn er deutlich schneller ist oder es direkt nicht geht.
  - Zwei Umstiege nie, dann lieber länger zu Fuß.
- Gemessen (Plan 0012, Schritt 3, „Umsetzung“) für 35 Stadtteile × 76 Orte, bei höchstens 1 Umstieg, 10 Min. Aufschlag und 1 500 m Fußweg zum und vom Halt, mit Umstiegs-Bit im Browser:
  - Minuten im Mittel +2,9 (p90 +8,9, p99 +23,8) gegenüber heute;
  - 53 Paare (2 %) ohne Weg;
  - 58,5 % Direktverbindungen (ohne Umstiegs-Bit wären es 44 %; das Bit entscheidet 366 Paare zu einer Direktverbindung um, im Mittel 4,8 Min. langsamer);
  - Linien-Datei 28,0 kB gzip, Tabelle 2,1–2,3 s.

## Entscheidung

1. **Verkehrsmittel im Auszug:** `TimetableTrip.mode` ∈ `tram | u-bahn | bahn | bus`, aus GTFS `route_type` 0–3. Ein anderer Typ bei einer übernommenen Fahrt bricht `pnpm pipeline oepnv` mit einer Fehlermeldung ab.
2. **Höchstens ein Umstieg.** Je Abfahrtsminute zählt die Verbindung mit der kleinsten bewerteten Ankunft:
   - echte Ankunft, bei einem Umstieg + 10 Min.;
   - bei gleicher Bewertung die spätere Abfahrt (Pareto-Regel des Profils);
   - bei gleicher Abfahrt die Direktverbindung.

   Verbindungen mit zwei oder mehr Umstiegen gibt es nicht. Die Zelle ist der Median der **echten** Tür-zu-Tür-Zeit, mit Warten. Das Umsteigemodell (Fußweg + 1 Min. Puffer, ≤ 400 m) bleibt.

   **Auch über mehrere Zugangshalte:** Jede Zelle von `wegzeit.json` trägt ein Umstiegs-Bit (Bit 7, Formatversion 2). Der Browser vergleicht Zugangshalte und den direkten Fußweg mit demselben Aufschlag und zeigt die echte Zeit.
3. **Fußweg zum und vom Halt bis 1 500 m** (Zugang im Browser, Abgang im Build). Ob ein Startpunkt im Stadtgebiet liegt, entscheidet weiter ein Haltbereich im Umkreis von 800 m.
4. **Linien je Zelle:** die häufigste Folge aus einer oder zwei Linien im Fenster. Keine Linien, wenn
   - der Ort zu Fuß am besten erreicht wird,
   - es keinen Weg gibt,
   - oder die Fahrzeit der Folge nicht zur Angabe passt (Abweichung > max(3 Min., 25 %); Startwert, festgelegt nach Messung in Plan 0012).
5. **Eigene Datei `public/data/linien.json`:**
   - entsteht bei jedem Build, eigenes Budget 40 kB gzip;
   - zwei Byte-Ebenen (erste und zweite Linie);
   - über eine Inhaltskennung (`id` in `wegzeit.json`, `table` in `linien.json`, gebildet über den Inhalt beider Dateien) an die Tabelle gebunden;
   - gleiche Lizenz und Namensnennung (CC BY-SA 3.0 DE).
6. **Laden:** zu denselben Anlässen und im selben Aufruf wie `wegzeit.json` (ADR 0011, Punkt 6), aber erst nach Tabelle und Rechenlogik, mit niedriger Priorität und eigenständig.
   - Die Minuten warten nicht auf die Linien.
   - Fehlt die Datei oder passt sie nicht, bleibt die Wegzeit ohne Linien.
   - Die Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“ gilt unverändert.
7. **Anzeige:**
   - Detail und Orts-Sheet zeigen „mit Bus 37 → U1“, vorgelesen als „mit Bus 37, dann U1“. Die Kachel bleibt bei den Minuten.
   - Über 2 Std. oder ohne Weg steht im Detail „über 2 Std. ab … (mit höchstens 1 Umstieg)“, ohne Linien.

## Alternativen

- **Beliebig viele Umstiege, 5 Min. Aufschlag** (Plan 0012, Fassung 1): Minuten +0,46 Min., aber 33 % der Zellen mit 3 Linien und 6,6 % mit 4 oder mehr. Die Datei hätte 50,6 kB. Vom Nutzer verworfen.
- **Höchstens ein Umstieg bei 800 m:** 180 Paare ohne Weg (6,8 %), p99 +52 Min.
- **1 200 m:** 96 Paare ohne Weg, p99 +38 Min.
- **Aufschlag 5 Min.:** fast gleiche Minuten, weniger Direktverbindungen.
- **Linien aus einem zweiten Lauf, Minuten wie bisher:** Minuten und Linien gehörten zu verschiedenen Verbindungen.
- **Linien in `wegzeit.json`:** Die Minuten müssten auf die Linien warten.

## Konsequenzen

- Weite Wege werden länger, 2 % der Stadtteil-Ort-Paare haben keinen Weg mehr. Ein Gate in `build-data` bricht ab, wenn mit echten Daten mehr als 9,3 % der Zellen ohne Linien sind (gemessen 4,3 %). Der Filter „bis … Min.“ zeigt für weite Startpunkte weniger Orte. Das ist gewollt.
- Gezeigt wird mitunter eine Direktverbindung, die bis zu 10 Min. langsamer ist als ein Umstiegsweg, auch ab einem anderen Halt. Die Minuten sind dann die der Direktverbindung.
- `wegzeit.json` hat Formatversion 2. Eine alte Datei aus dem HTTP-Cache führt kurz zum Rückfall auf die Luftlinie.
- Ein Profil „ohne Kinderwagen“ mit mehr Umstiegen wäre ein neues ADR (`docs/ideas.md`).
- Beim ersten Anlass kommen ca. 28 kB gzip nach der Tabelle dazu.
- Die Linien-Datei wächst linear mit den Orten (≈ 0,37 kB gzip je Ort), das Budget reicht bis rund 110 Orte.
- Der Auszug wird ca. 50 kB größer.
