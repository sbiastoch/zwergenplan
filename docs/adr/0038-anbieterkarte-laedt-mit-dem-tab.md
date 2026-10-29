# ADR 0038 – Anbieterkarte lädt mit dem Tab

Status: **angenommen** (2026-10-29, mit Plan 0055). **Geändert durch ADR 0039** (Plan 0056): Punkt 2, der Hinweistext unter der Karte entfällt.
- **Ändert** ADR 0008, Punkt „Nur in der Kartenansicht“: Auch das Öffnen des Tabs „Anbieter“ ist eine ausdrückliche Handlung und lädt die Karte samt Kacheln.
- **Ergänzt** ADR 0008, Kamera-Regel: Die Anbieterkarte hat einen eigenen Startausschnitt (alle Orte aller Anbieter) und fährt nie auf einen Startpunkt, auch nicht auf einen Stadtteil.
- **Ändert** die Abhängigkeitsregel `map-entry-only`: Neben `src/ui/karte/MapScreen.tsx` darf `src/ui/karte/ProviderMapScreen.tsx` `src/ui/map/` laden, ebenfalls nur per `import()` (`LAZY_LOADERS`).

## Kontext

- Der Nutzer wünscht eine Kartenansicht der Anbieter. Aus sechs Mockups hat er am 2026-10-29 Variante C gewählt: eine kompakte Karte oben im Tab „Anbieter“, darunter die Liste, beschränkt auf den Kartenausschnitt (Plan 0055).
- Auf Nachfrage soll die Karte **mit dem Tab** laden, ohne eigenen Tipp. ADR 0008 erlaubt Kachel-Requests nur in der Kartenansicht, nach dem Umschalten auf „Karte“.
- Die Liste filtert nach dem Ausschnitt. Führe die Karte bei einem Stadtteil dorthin wie die Angebotskarte, schrumpfte die Liste still, sobald jemand im Kind-Sheet einen Stadtteil wählt.

## Entscheidung

1. **Der Tab „Anbieter“ ist eine Kartenansicht.** Wer ihn öffnet, lädt den Karten-Chunk (MapLibre) und die Kacheln von `tiles.openfreemap.org`. Das Anbieter-Sheet allein (Deep-Link `?anbieter=` über einem anderen Tab) lädt keine Karte.
2. **Alles andere aus ADR 0008 gilt weiter:** einziger fremder Host, kein Querystring, kein Cache durch uns, Referrer nur der Origin, und der Hinweis „Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät.“ unter der Karte.
3. **Startausschnitt der Anbieterkarte:** `fitBounds` über alle Orte aller Anbieter aus `anbieter.json`, auch über die ohne kommende Termine, dazu die Orte der Rückfall-Anbieter aus `site.json` (`providerCamera`, `src/domain/provider-places.ts`). Er hängt nicht an Filtern, Alter, Suche oder Startpunkt, also nur an öffentlichen Daten. Ein fester Rand von 24 px (rechts zusätzlich die Zoom-Knöpfe, unten die Attribution) ersetzt dort das größere `START_PADDING`.
4. **Kein Stadtteil-Zoom auf der Anbieterkarte:** Sie zeichnet jeden Startpunkt nur als lokalen Layer. Ab der Wahl eines Startpunkts lädt sie also keine Kachel, auch bei einem Stadtteil nicht.
5. **Kein gemerkter Ausschnitt:** Die Anbieterkarte startet bei jedem Öffnen im Startausschnitt. Die Angebotskarte merkt sich ihren Ausschnitt weiter für die Sitzung.
6. **Ladekette:** Ein gemeinsamer Einstieg `src/ui/karte/entry.ts` exportiert beide Karten-Oberflächen. `src/ui/MapPanel.tsx` lädt ihn für `MapPanel` und `ProviderMapPanel`. `ProviderMapScreen.tsx` lädt `MapView` per `import()`, deshalb die Ausnahme in `map-entry-only`. Die Regel bleibt eine Erweiterung, keine Lockerung: Die Karte bleibt hinter `karte/` und lazy.
7. **Wegzeit:** Die Anbieterkarte ist kein neuer Anlass für `wegzeit.json` und `linien.json`. Sie laden im Tab wie bisher (gespeicherter Startpunkt, Kind-Sheet).

## Konsequenzen

- Der Tab „Anbieter“ lädt beim Öffnen etwa 430 kB gzip JS (MapLibre samt Worker) und die Kacheln dazu. Die Liste rendert unabhängig davon und erscheint zuerst.
- OpenFreeMap sieht mehr Aufrufe als bisher, aber nichts Neues: nur den Ausschnitt über alle Anbieter-Orte, danach, was jemand selbst verschiebt.
- Der Datenschutz-Abschnitt in `imprintPage()` (`scripts/lib/share-pages.ts`, ADR 0028) nennt den Tab „Anbieter“.
- Specs, die den Tab öffnen, brauchen `tiles: "mock"`. Request-Zählungen im Tab beginnen erst, wenn die Karte bereit und ruhig ist.
- Mit einer zweiten Region im Katalog (Plan 0042) rahmte der Startausschnitt beide Städte. Dann braucht es einen Startausschnitt je Region; das entscheidet ein Folgeplan.
