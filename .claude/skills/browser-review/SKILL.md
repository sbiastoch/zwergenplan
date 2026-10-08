---
name: browser-review
description: Pflicht-Sichtprüfung im Browser vor „fertig“ bei jeder UI-Änderung, und nach jedem Deploy auf der Live-URL. Screenshots auf Mobile-Viewports in hell/dunkel ansehen und gegen eine UX-Checkliste prüfen. Argument optional: „live“ für https://zwergenplan.app/.
---

# Browser-Review

Automatische Gates prüfen Regeln. Dieser Schritt prüft, ob es **gut** ist.

## 1. Ziel festlegen
- **lokal** (Standard): `pnpm build:e2e`, dann `PORT=$(node scripts/free-port.ts)` und `pnpm exec vite preview --strictPort --port $PORT --outDir dist-e2e` im Hintergrund starten. Die URL ist `http://localhost:$PORT/` (Port ausgeben und merken), sie nutzt Fixture-Daten. Ein fester Port kollidiert mit parallelen Sessions.
- **live**: `https://zwergenplan.app/` mit echten Daten. Erst prüfen, ob der Deploy angekommen ist: `curl -s https://zwergenplan.app/data/meta.json` zeigt in `commit` denselben Kurz-SHA wie `git rev-parse --short HEAD`. Ohne GitHub-API (Plan 0027, E13).

## 2. Screenshots
`node scripts/screenshots.ts <URL>` erzeugt `e2e/.artifacts/screens/*.png`. Die Matrix umfasst
- die Viewports 320×640, 390×844 (iPhone), 412×915 (Pixel) und 915×412 (quer),
- jeweils hell und dunkel.

Bei lokalem Ziel fixiert das Skript die Uhr auf das Fixture-„Jetzt“.

Sieh dir **jedes** Bild mit dem Read-Tool an. Nur „Datei existiert“ zu prüfen reicht nicht.

## 3. Live interagieren (wenn claude-in-chrome verfügbar)
Öffne die URL in einem neuen Tab und verkleinere das Fenster auf Handybreite. Dann:
- Filter antippen
- Geburtsdatum setzen
- ICS-Link öffnen
- zurück navigieren
- neu laden

Achte auf Ruckler, Layout-Sprünge und Konsolenfehler (`read_console_messages`).

## 4. Checkliste (jede Zeile explizit beantworten)
- Lesbarkeit: Kontrast, Zeilenlänge, Hierarchie. Ist die wichtigste Info (was, wann, wo, frei?) in 2 Sekunden erfassbar?
- Daumen-Erreichbarkeit: Liegen die Hauptaktionen im unteren bzw. mittleren Bereich, mit ausreichend Abstand zwischen Touch-Zielen?
- Zustände: Laden, leer, Fehler und sehr lange Titel. Bricht etwas oder wird abgeschnitten?
- Dark Mode: Gibt es Flächen ohne Kontrast oder grell weiße Inseln?
- Micro-Interactions: Gibt es Rückmeldung beim Antippen (pressed state)? Sind Übergänge sinnvoll und bei reduzierter Bewegung abgeschaltet?
- Konsistenz mit dem Design-System, sobald es existiert.

## 5. Ergebnis
Notiere die Befunde mit Screenshot-Namen. Behebe sie oder lege sie als Aufgabe in `docs/ideas.md` bzw. im aktuellen Plan ab. Melde dem Nutzer kurz das Ergebnis und schicke bei Fernzugriff 1–2 aussagekräftige Screenshots mit `SendUserFile`.
