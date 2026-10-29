# ADR 0039 – Kurze Statuszeile, Karten am Startpunkt

Status: **angenommen** (2026-10-29, mit Plan 0056), Nutzerentscheidungen. Umgesetzt in Schritten: Statuszeile (S2), Quellenangabe, Hinweistext und Kartenmitte (S3), Startausschnitt am Startpunkt (S5).
- **Ersetzt** ADR 0019, Punkt 1 und 3: Die Statuszeile nennt den Startpunkt nicht mehr.
- **Ändert** ADR 0011: Punkt 9 in der Form (der Grund der Luftlinie steht weiter sichtbar in der Statuszeile, gekürzt), Punkt 6 (die Karte ist Anlass für die Wegzeit wegen der Minuten in der Liste darunter, nicht mehr als Startpunkt-Oberfläche; die Ausnahme der Kacheln gilt für jeden Startpunkt) und Punkt 8 (ohne Kartenmitte decken Stadtteil und Standort den Fallback ab).
- **Ändert** ADR 0008: Punkt „Nur in der Kartenansicht“ (kein Hinweistext unter der Karte mehr), die Attribution (klappt nach 5 s ein), Punkt „Startpunkt ohne GPS“ (keine Kartenmitte mehr), **die Kamera-Regel** und „Was nie an OpenFreeMap geht: … mittelbar über die Kachelwahl“ (Punkt 8); bei den Tests dreht sich der Fall „kein Kachel-Request nach dem Setzen eines Startpunkts“ um. Die Abwägung gegen selbst gehostete PMTiles ist damit neu zu bewerten und bleibt offen.
- **Ändert** ADR 0038: Punkt 1 (mit gespeichertem Startpunkt verrät schon das Öffnen des Tabs „Anbieter“ die Gegend), Punkt 2 (kein Hinweistext), Punkt 3 (Startausschnitt am Startpunkt), Punkt 4 (die Anbieterkarte fährt auf jeden neuen Startpunkt) und den Kontext zum stillen Schrumpfen der Liste.
- **Ändert** ADR 0017: Folgen „Die Karte startet aber im üblichen Ausschnitt“ und „Kamera-Regel bleibt unverändert“, sowie Punkt 3 für Kachel-Requests („nie in URL, Logs oder Requests“ gilt für den Startpunkt als Wert, nicht mehr für die Kachelwahl).
- **Ändert** ADR 0005, Hinweis zum Fallback ohne GPS: Ohne GPS bleibt der Stadtteil, die Kartenmitte entfällt.

## Kontext

- Die Statuszeilen „230 Angebote ab heute · Wegzeit ab deinem Standort“, „… an 80 Orten“ und „69 Anbieter mit 356 Angeboten“ brachen auf dem Handy in zwei oder drei Zeilen um. Der Nutzer stuft das als störender ein als den fehlenden Bezug der Minuten zum Startpunkt („Vielleicht reicht auch einfach nur die Anzahl der Ergebnisse“, Rückfrage vom 2026-10-29: „Nur die Anzahl“).
- ADR 0019 hatte „Hinweis ganz weglassen“ verworfen, weil die Minuten auf den Kacheln sonst keinen sichtbaren Bezug hätten. Der Startpunkt steht aber weiter im Kind-Sheet und im Untertitel der Sortierung „Nächstgelegen“.
- Grundsatz des Nutzers für die App, ebenfalls vom 2026-10-29: „Usability ist wichtiger als Privatsphäre.“ Er trägt die späteren Teile dieses ADR (Startausschnitt am Startpunkt) und gilt als Maßstab für Abwägungen, die ältere ADRs zugunsten der Privatsphäre entschieden hatten.

## Entscheidung

1. **Statuszeile nur mit der Anzahl:** „230 Angebote“ in Liste und Karte, „69 Anbieter“ im Tab „Anbieter“, „5 Angebote gemerkt“ auf der Merklisten-Karte. „ab heute“, „an n Orten“ und „mit n Angeboten“ entfallen.
2. **Ein gesetzter Zeitraum bleibt** im Satz: „3 Angebote vom 17.–18.10.“ (Browser-Review 0023, m1). Einen Chip für den Zeitraum gibt es nicht, die Zeile ist die einzige sichtbare Angabe.
3. **Kein Startpunkt in der Statuszeile.** Nur der seltene Rückfall auf die Luftlinie steht dahinter, kurz mit Grund: „· Luftlinie, außerhalb“ bzw. „· Luftlinie, Wegzeit fehlt“. Damit bleibt ADR 0011, Punkt 9 erfüllt.
4. Die Ansage über `role="status"` bleibt, mit demselben kurzen Text.
5. **Quellenangabe eingeklappt:** Alle Karten nutzen `compact` und klappen die Angabe 5 s nach dem Laden auf das „i“ ein, beim ersten Verschieben schon früher (MapLibre). Der Nutzer wünschte „per Standard eingeklappt“; die OSMF Attribution Guidelines erlauben das Einklappen nach einer Interaktion oder „automatically after five seconds“, nicht direkt beim Laden. Ein Tipp auf „i“ klappt sie wieder auf.
6. **Kein Hinweistext unter der Karte.** „Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät.“ entfällt unter allen Karten; OpenFreeMap nennen die Quellenangabe hinter dem „i“ und der Datenschutztext im Impressum.
7. **Keine Kartenmitte als Startpunkt.** Die Werkzeugzeile unter der Angebotskarte („Kartenmitte als Startpunkt“, „Startpunkt wählen“) und das Fadenkreuz entfallen. Den Startpunkt wählt man im Kind-Sheet: Standort oder Stadtteil. Ein gespeicherter Startpunkt „Kartenmitte“ (ADR 0017) wird weiter gelesen und gilt, bis jemand einen anderen wählt.

8. **Karten starten am Startpunkt** (Plan 0056, E6): Mit Startpunkt (Standort, Stadtteil, gespeicherte Kartenmitte) starten Angebots- und Anbieterkarte mit seiner Mitte und einem Zoom, der auf der kürzeren Kante etwa 2 km Radius zeigt (`initialCamera`, `zoomForRadius` in `src/domain/camera.ts`). Der Startpunkt ist dabei der Punkt selbst, beim Standort wie bisher auf ≈ 100 m gerundet (`coarsen`); ein gröberes Raster gibt es nicht (Nutzerentscheid: „Der Startpunkt soll genau der GPS-Standort sein. Maximal auf 100 Meter gerundet.“). Liegt im Rahmen ±2 km kein Ort der Karte (Grundlage: alle kommenden bzw. alle Anbieter-Orte, nicht die gefilterten), startet sie wie ohne Startpunkt über alle Orte.
9. **Neuer Startpunkt bei offener Karte:** Beide Karten fahren auf den neuen Startausschnitt, bei jeder Art von Startpunkt. Derselbe Startpunkt noch einmal (gleiche Quelle und gleicher Punkt bzw. Stadtteil, `originKey`) bewegt nichts. Der gemerkte Ausschnitt der Angebotskarte gilt nur beim selben Startpunkt.
10. **„Alle zeigen“** fährt auf den Rahmen über alle Orte, nicht auf den Startpunkt.
11. **Merklisten-Karte:** startet wie bisher über alle Orte und fährt nicht auf einen Startpunkt (Nutzerentscheid, Option a): Ein Rahmen um den Startpunkt wäre dort meist leer, einer über das Gemerkte verriete die Merkliste.
12. **Wegzeit beim Öffnen der Karte** (Plan 0056, N10): Die Karte bleibt Anlass, Wegzeit-Tabelle und Linien zu laden (`useTransit().want()`), weil die Liste unter der Karte Minuten an den Kacheln zeigt. Die Kartenmitte ist kein Grund mehr.
13. **Was OpenFreeMap jetzt sieht:** die Kachelkoordinaten rund um den Startpunkt. Die Mitte der geladenen Kacheln liegt bis auf etwa eine Kachelbreite (≈ 1,5–3 km) am Startpunkt; das Runden auf 100 m schützt dort nicht. Mit gespeichertem Startpunkt verrät schon das Öffnen von Karte oder Tab „Anbieter“ die Gegend. Gleich bleibt: kein Querystring, kein Startpunkt als Wert in einem Request, Wegzeit-Requests für alle gleich. Der Datenschutztext im Impressum sagt das.

## Konsequenzen

- Die Statuszeile passt bei 320 px in eine Zeile, außer im Luftlinien-Rückfall neben „Alle zeigen“.
- Wer wissen will, wovon „25 Min.“ ausgeht, findet den Startpunkt im Kind-Sheet, im Sortiermenü und im Detail („ca. 25 Min. mit Bus 37 → U1 ab Gostenhof“).
- Beim Laden der Wegzeit hält die Statuszeile keinen unsichtbaren Platz mehr für den Zusatz frei.
- Unter der Karte steht nichts mehr zwischen Rahmen und Liste. Ohne GPS ist der Stadtteil der einzige Startpunkt; einen Punkt zwischen den Stadtteilen gibt es nur noch über den Standort.
- Die Liste unter der Karte (Plan 0056, E5) folgt dem Ausschnitt; startet die Karte am Startpunkt, zeigt sie zuerst die Angebote der Gegend. Die Statuszeile sagt dann „im Kartenausschnitt“, „Alle zeigen“ steht daneben. Das stille Schrumpfen, das ADR 0038 abgelehnt hatte, nimmt dieses ADR so bewusst in Kauf.
- Im E2E-Build lässt sich die Verzögerung des Einklappens setzen (`__zpAttributionMs`), sonst sähen Tests die Angabe je nach Laufzeit ein- oder ausgeklappt.
