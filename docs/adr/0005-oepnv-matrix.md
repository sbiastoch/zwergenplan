# ADR 0005 – Öffi-Wegzeit über eine statische GTFS-Fahrzeitmatrix (Stufe 2)

Status: angenommen (2026-10-04), **teilweise ersetzt durch ADR 0011** (2026-10-05): Bus gehört dazu, Halt→Ort-Tabelle statt Halt→Halt-Matrix, Wartezeit zählt, kein `Venue.nearestStops`, kein „Haltestelle wählen“. Umsetzung mit Plan 0009.

## Kontext
Bisher zeigt die Seite die Entfernung als Luftlinie ab dem GPS-Standort. Entscheidend ist aber die Fahrzeit mit den Öffis: Drei Stationen U-Bahn können „weit“ sein und trotzdem schnell. Live-Routing-APIs (VGN-EFA) aus dem Browser sind fragil (CORS, Rate-Limits) und verraten den Standort an Dritte.

## Entscheidung
- Zur Build-Zeit entsteht aus den **VGN-GTFS-Open-Data** eine Fahrzeitmatrix zwischen U-Bahn-, S-Bahn- und Tram-Halten (~150 Halte, wenige hundert KB).
- Jeder Ort kennt seine 2–3 nächsten Halte (`Venue.nearestStops`).
- Der Browser rechnet: Fußweg zum Start-Halt + Matrix-Fahrzeit + Fußweg zum Ziel, dann das Minimum mit dem direkten Fußweg. Das geht offline und ohne Drittanbieter.
- Der Fallback ohne GPS: Stadtteil oder Haltestelle wählen, oder auf die Karte tippen.
  - Hinweis (Plan 0005): Statt „auf die Karte tippen“ gibt es „Kartenmitte als Startpunkt“ mit Fadenkreuz, weil ein Tipp auf der Karte schon Marker öffnet und die Kartenmitte auch per Tastatur und Bildschirmleser geht. Begründung in ADR 0008.

## Konsequenzen
- Es ist eine Schätzung ohne Umsteige-Wartezeit, die Anzeige muss das als „ca.“ ausweisen.
- Die Matrix wird mit dem GTFS-Fahrplanwechsel aktualisiert.
