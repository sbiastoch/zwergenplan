# ADR 0017 – Der Startpunkt bleibt auf dem Gerät, auch als gerundeter Punkt

Status: angenommen (2026-10-06), umgesetzt mit Plan 0016. Nutzerentscheidung vom 2026-10-06.
- Ersetzt Plan 0004, E3, „Der Standort bleibt nur im Arbeitsspeicher“ (Nutzerentscheidung 1) und Plan 0005, E8, „Kartenmitte nur im Speicher“.
- Ändert die Invarianten „Startpunkt“ und „Kein Request hängt davon ab, welcher Startpunkt gilt“ in `docs/architecture.md`.
- Ändert ADR 0011, Punkt 6, Spiegelstriche 1 und 3 (Laden beim Start und das verratene Bit: „ein Startpunkt“ statt „ein Stadtteil“).
- Die Kamera-Regel (ADR 0008) und „kein Request ab der Wahl“ (ADR 0011, Punkt 6, Spiegelstrich 2) bleiben unverändert.

## Kontext

Bisher wird nur die ID eines Stadtteils gespeichert. „Mein Standort“ und „Kartenmitte“ sind nach jedem Neuladen weg. Begründet war das in Plan 0004 so: Eine Koordinate ist praktisch die Wohnadresse, und der `localStorage` bleibt unbegrenzt liegen.

Im Alltag passt das nicht: Die App wird als PWA vom Startbildschirm geöffnet, und iOS beendet sie oft im Hintergrund. Bei jedem Kaltstart ist die Wegzeit weg, und Safari fragt je nach Einstellung erneut nach der Standortfreigabe. Nutzermeldung vom 2026-10-06: „Der Standort wird nicht im Local Cache gespeichert. Das wäre aber wichtig.“

## Entscheidung

1. **Gespeichert wird der zuletzt gewählte Startpunkt**, egal welcher Art:
   - Ein Stadtteil wird wie bisher als ID unter `zwergenplan.entfernung-ab` gespeichert.
   - Standort und Kartenmitte werden als **gerundeter Punkt** (`coarsen`, 3 Nachkommastellen, ca. 100 m) mit ihrer Quelle unter `zwergenplan.startpunkt` gespeichert, zum Beispiel `{"source":"standort","lat":49.452,"lon":11.077}`.
   - Gespeichert wird genau der Wert, mit dem die App ohnehin rechnet. Eine Rohkoordinate verlässt `src/data/geolocation.ts` weiterhin nie.
2. **Höchstens ein Eintrag gilt.** Wer einen Punkt wählt, löscht den gespeicherten Stadtteil, und umgekehrt. „Startpunkt entfernen“ löscht beide.
3. **Nichts davon verlässt das Gerät.** Der Startpunkt steht weiterhin nie in URL, Logs oder Requests. Der Standort wird weiterhin nur auf Tipp abgefragt, auch beim Start mit gespeichertem Standort nicht automatisch.
4. **Laden beim Start:** Die Wegzeit-Tabelle und die Linien laden beim Start, wenn *irgendein* Startpunkt gespeichert ist. Bisher galt das nur für einen Stadtteil. Der Request bleibt für alle gleich und verrät dem eigenen Host weiterhin nur ein Bit: dass ein Startpunkt gespeichert ist.
5. **Ein gespeicherter Wert wird beim Lesen geprüft.** Die Form wird in `src/data` geprüft (Quelle bekannt, `lat` und `lon` sind Zahlen; die Endlichkeit sichert `inBounds`). Danach rundet `useOrigin` erneut und prüft gegen `NUERNBERG_BBOX`. Ein ungültiger Wert zählt als „kein gespeicherter Punkt“, dann gilt ein gespeicherter Stadtteil, sonst keiner.

## Alternativen

- **Nur den Stadtteil speichern (bisher):** Das ist datensparsam, aber bei jedem Kaltstart ist die Wegzeit weg. Nutzer wählen dann ersatzweise einen Stadtteil, der bis zu 2 km danebenliegen kann.
- **Gröber runden, etwa 2 Nachkommastellen (ca. 1 km):** Die Wegzeit hängt am nächsten Halt, und 1 km macht dort oft 10 Min. aus. Die App rechnet heute mit ca. 100 m. Eine zweite, gröbere Stufe nur für den Speicher hieße, dass nach dem Neuladen andere Minuten erscheinen als vorher.
- **Mit Ablaufdatum speichern (etwa 30 Tage):** Das schützt kaum, denn wer das Gerät in der Hand hat, sieht ohnehin die Merkliste und das Geburtsdatum. Dafür kostet es Code im Start-Bundle und Erklärtext. Verworfen.
- **Beim Start den Standort neu abfragen:** Das widerspricht „nur auf Tipp“ (Plan 0004). Auf iOS käme dann bei jedem Start ein Dialog. Verworfen.

## Folgen

- Im `localStorage` liegt jetzt ein Punkt, der auf ca. 100 m genau die Gegend der Wohnung verrät. Das ist dieselbe Schutzklasse wie das Geburtsdatum: nur auf dem Gerät, nie im Netz. Der Hinweis im Kind-Sheet sagt das ausdrücklich.
- Wer an einem anderen Ort ist, sieht nach dem Neuladen die Wegzeit ab dem alten Standort. Ein Tipp auf „Meinen Standort nutzen“ aktualisiert ihn.
- Die Kartenmitte heißt auch nach dem Neuladen „Kartenmitte“. Die Karte startet aber im üblichen Ausschnitt (Kamera-Regel), die gespeicherte Mitte ist dann nur der Startpunkt-Punkt auf der Karte.
- E2E belegt: Standort und Kartenmitte überstehen das Neuladen, gespeichert ist nur der gerundete Wert, und beim Start mit gespeichertem Punkt laden Tabelle und Linien genau einmal.
