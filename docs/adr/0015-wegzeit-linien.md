# ADR 0015 – Linien in der Wegzeit: Umstiegsaufschlag und eigene Linien-Datei

Status: Entwurf (2026-10-05), Umsetzung mit Plan 0012.
- Ersetzt ADR 0011, Punkt 3, Satz 2.
- Ergänzt ADR 0011, Punkt 4 (zweite Build-Datei), Punkt 5 (Lizenz und Namensnennung gelten jetzt für Auszug, Tabelle und Linien) und Punkt 6 (Laden der Linien).
- Ergänzt ADR 0003 (Schema `Timetable`).

Details, Messungen und Alternativen stehen in Plan 0012.

## Kontext

Die Wegzeit zeigt nur Minuten („ca. 25 Min. mit Bus & Bahn“). Gewünscht ist dazu, welche Linien man nimmt („mit Bus 37 und U1“).

- Der Fahrplanauszug kennt den Liniennamen je Fahrt, aber nicht das Verkehrsmittel. Die Profil-CSA merkt sich nicht, welche Fahrten eine Verbindung bilden.
- Gemessen (Plan 0012, M2–M5; 556 Haltbereiche × 76 Orte):
  - Ohne Aufschlag, mit 1 Min. Puffer je Umstieg, hat die schnellste Verbindung in 18,6 % der Zellen 4 oder mehr Fahrzeuge.
  - Ein Umstiegsaufschlag von 5 Min. *nur in der Wahl* senkt das auf 6,6 %. Nimmt man die Minuten aus genau diesen Verbindungen, steigen sie im Mittel um 0,46 Min. (p99 +4 Min.).
  - Die Linien aller Zellen kosten 50,6 kB gzip. Zusammen mit den Minuten in einer Datei wären es 89–103 kB.

## Entscheidung

1. **Verkehrsmittel im Auszug:** `TimetableTrip.mode` ∈ `tram | u-bahn | bahn | bus`, aus GTFS `route_type` 0–3. Ein anderer Typ bricht `pnpm pipeline oepnv` mit einer Fehlermeldung ab.
2. **Wahl der Verbindung** (ersetzt ADR 0011, Punkt 3, Satz 2):
   - Je Abfahrtsminute zählt die Verbindung mit der kleinsten bewerteten Ankunft, also echte Ankunft + 5 Min. je Umstieg.
   - Die Zelle ist der Median der **echten** Tür-zu-Tür-Zeit dieser Verbindungen, mit Warten.
   - Das Umsteigemodell (Fußweg + 1 Min. Puffer, ≤ 400 m) bleibt.
3. **Linien je Zelle:** die häufigste Linienfolge im Fenster. Keine Linien, wenn
   - der Ort zu Fuß am besten erreicht wird,
   - es keine Verbindung gibt,
   - oder die Fahrzeit der Folge nicht zur Angabe passt: Abweichung > max(3 Min., 25 % des Zellwerts); Startwert, festgelegt nach Messung in Plan 0012, Schritt 3.
4. **Eigene Datei `public/data/linien.json`** (ergänzt ADR 0011, Punkt 4):
   - entsteht bei jedem Build, eigenes Budget von 64 kB gzip;
   - ist über eine Inhaltskennung (`id` in `wegzeit.json`, `table` in `linien.json`) an die Tabelle gebunden;
   - steht unter derselben Lizenz und mit derselben Namensnennung (CC BY-SA 3.0 DE).
5. **Laden:** zu denselben Anlässen und im selben Aufruf wie `wegzeit.json` (ADR 0011, Punkt 6), aber eigenständig und erst nach deren Antwort, mit niedriger Priorität.
   - Die Minuten warten nicht auf die Linien.
   - Fehlt die Datei oder passt sie nicht, bleibt die Wegzeit ohne Linien.
   - Die Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“ gilt unverändert.
6. **Anzeige:** Detail und Orts-Sheet als deutsche Aufzählung in Fahrtreihenfolge („mit Bus 37 und U1“). Die Kachel bleibt bei den Minuten.

## Alternativen

- **Linien aus einem zweiten Lauf, Minuten wie bisher:** Minuten und Linien gehören zu verschiedenen Verbindungen. Die genannte Verbindung braucht im p90 4 Min. länger als angezeigt, die Build-Zeit verdoppelt sich.
- **Kein Aufschlag:** Wege mit bis zu 7 Fahrzeugen, die eine Minute sparen. Für Eltern mit Kinderwagen unrealistisch.
- **Aufschlag in die Minuten einrechnen:** Die Minuten steigen im Mittel um 6,5 Min. (*P* = 4 Min.). Das wäre eine verdeckte Modelländerung.
- **Nur die erste Linie** (8 kB): klein, sagt aber wenig.
- **Linien in `wegzeit.json`:** Die Minuten müssten auf die Linien warten, und das Budget der Tabelle wäre nicht mehr aussagekräftig.

## Konsequenzen

- Die Wegzeiten werden minimal pessimistischer (Mittel +0,46 Min.). Der Filter „bis … Min.“ kann an der Grenze einzelne Orte anders einordnen.
- Beim ersten Öffnen eines Startpunkt-Anlasses kommen ca. 51 kB gzip dazu, parallel zur Tabelle.
- Die Linien-Datei wächst linear mit den Orten (≈ 0,67 kB gzip je Ort). Bei rund 95 Orten wird das Budget eng.
- Der Auszug wird ca. 50 kB größer.
