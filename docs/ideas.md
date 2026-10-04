# Ideen außerhalb des Scopes

Bewusst zurückgestellt. Wer eine davon angeht, schreibt zuerst einen Plan (`docs/plans/`).

- **Eigenes LLM der Nutzer** (Claude, ChatGPT …) für die Recherche: Nutzer aktualisieren Daten selbst.
- **Anbieter vorschlagen** über ein GitHub-Issue-Template (Name, Programm-URL). Ein Agent arbeitet die Vorschläge ab.
- **Mehrere Kinder / Geschwister**: Ein Angebot passt, wenn es für eines der Kinder passt.
- **Abo-Feeds (webcal)** für vordefinierte Filter-Sets.
- **Englische Oberfläche**: Die Texte liegen zentral, damit das billig wird.
- **Live-Routing-APIs** für echte Wegzeiten. Vorrang hat die statische GTFS-Matrix (ADR 0005).
- **Visuelle Regression** (Playwright-Screenshots als Gate), sobald das Design steht. Baselines entstehen dann im Playwright-Docker-Image, plus ein `workflow_dispatch` zum Aktualisieren.
- **Lighthouse CI**, falls `@lhci/cli` wieder aktuell gepflegt wird. Bis dahin decken Playwright-Web-Vitals und axe das ab.
- **React Compiler**, sobald es Komponenten mit spürbaren Re-Render-Kosten gibt.
- **Architektur-Review in CI** über `anthropics/claude-code-action`. Braucht einen API-Key und kostet pro Lauf.
- **Erinnerung „Anmeldung öffnet“** als eigener ICS-Termin.
- **Anbieterverzeichnis auf der Website** (ersetzt das frühere `ANBIETER.md`): alle Anbieter mit Ring, Themen und Programm-Links.
- **Einstieg in laufende Kurse**: Die Liste sortiert nach dem nächsten Termin und zeigt „Kurs · noch 4 von 8“ (Plan 0003). Ob ein Quereinstieg möglich ist, wissen die Daten nicht – dafür bräuchte das Schema ein Feld.
- **Browser für den Recherche-Lauf**: Mit verbundenem claude-in-chrome werden Plätze bei Eversports, Calendly und Kurabu lesbar (im ersten Lauf `unbekannt`).
- **Kompakter Kopfbereich im Querformat**: Sticker und Chips nehmen quer ≈ 150 px Höhe ein. Mit der Seitenleiste (Plan 0007, E14) ist das tragbar, ein kompakterer Kopf wäre ein eigenes Designthema (Befund H1).
- **Rollende Kalenderwoche**: 7 Tage ab heute statt Mo–So, damit am Sonntag nicht 6 von 7 Tagen gesperrt sind (Befund H2). Ändert das Kalenderkonzept (`calendarNav`, Plan 0003 E14), deshalb ein eigener Plan.
- **Seitenzoom als Gate**: Chrome Android zoomt auf Wunsch die ganze Seite, bei 200 % ist der Viewport dann ~206 px. Das Gate deckt heute 320 px bei 200 % Textgröße ab (Plan 0007, E7).
- **Schrift-Preload**: `<link rel="preload">` der Latin-woff2 verkürzt das Swap-Fenster, braucht aber den gehashten Asset-Namen im HTML (Plan 0007, E11).
- **Anmeldeschluss auf der Kachel**: ein Chip „Anmeldung vorbei“. Plan 0007 (B4) zeigt den abgelaufenen Anmeldeschluss nur im Detail.
- **Katalog-Adressen ohne Ortsnamen-Präfix**: Die Adressen in `data/providers.yaml`, die mit dem Ortsnamen beginnen oder ihn in Klammern wiederholen (32 laut Browser-Review, 29 nach der Regel von `venueAddress`), beim nächsten Pipeline-Lauf über den Skill `babyevents-nuernberg` bereinigen, dazu eine Warnung in `validate-data`. Bis dahin korrigiert `venueAddress` in `toSiteData` nur die Anzeige und die ICS (Plan 0007, H6).
- **Umkreis-Kreis auf der Karte**: den gewählten Umkreis (2/5/10 km) um den Startpunkt zeichnen (Plan 0005, Nicht-Ziel).
- **„Auf der Karte zeigen“ im Detail**: aus einem Angebot in die Kartenansicht mit diesem Ort (Plan 0005, Nicht-Ziel).
- **„Route in Karten-App öffnen“**: Link mit der Adresse des Orts an die Karten-App des Geräts (Plan 0005, Nicht-Ziel).
- **Adresssuche als Startpunkt**: bräuchte einen Geocoder, also einen weiteren Drittanbieter oder eigene Daten (Plan 0005, Nicht-Ziel).
- **Karte im Kalender oder in der Merkliste** (Plan 0005, Nicht-Ziel).
- **Offline-Karte**: Service Worker, Vorab-Laden des Karten-Codes, gecachte Kacheln. ADR 0008 schließt das Cachen fremder Kacheln heute aus.
- **Selbst gehostete Kacheln (PMTiles) als Ausweichweg** für OpenFreeMap: Extrakt der Stadt auf GitHub Pages (z0–15 ca. 19 MB, z0–14 ca. 9,6 MB, gemessen), `pmtiles` + `@protomaps/basemaps` (+16 kB im Karten-Chunk), eigene Glyphen und Sprites, Aktualisierung per CI-Schritt. Dann gäbe es gar keinen Drittanbieter-Request mehr (ADR 0008, „Alternativen“). Code-seitig hängt alles an `src/data/tiles.ts` und `src/ui/map/`.
