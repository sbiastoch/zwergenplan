# ADR 0018 – Regelmäßige Reihen altersgerecht als ICS, im Browser erzeugt

Status: angenommen (2026-10-08), ergänzt ADR 0007. Details in Plan 0018. Offen ist nur der Gerätetest des Downloads aus dem Detail-Dialog am iPhone (Plan 0018, Schritt 6); der Rückfall dafür steht unter „Entscheidung“.

## Kontext
ADR 0007 erzeugt nur die Sammeldatei der Merkliste im Browser, alle übrigen ICS-Dateien bleiben statisch. Regelmäßige Gruppen werden mit Plan 0015 12 Monate fortgeschrieben. Eine statische Reihen-Datei brächte damit etwa 50 Termine in den Kalender, auch nachdem das Kind aus dem Angebot herausgewachsen ist. Das Geburtsdatum steht nur im `localStorage` des Geräts.

## Entscheidung
- Bei **regelmäßigen** Angeboten mit gespeichertem Geburtsdatum entsteht „Alle Termine“ im Detail **immer im Browser**, über denselben Export-Chunk wie die Merkliste, auch wenn nichts gekürzt wird. Hinge der Request auf die statische Datei an der Kürzung, erführe der Host, ob das Kind über die ganze Reihe in die Altersspanne passt.
- Die Merkliste kürzt regelmäßige Angebote ebenso.
- Die Datei enthält nur nicht beendete Termine, an denen das Angebot zum Alter passt. Die Auswahl treffen `exportSessions`, `seriesExport` und `collectionExport` in `src/domain/saved.ts`.
- VEVENTs, UIDs, Titel und `DTSTAMP` bleiben identisch mit den statischen Dateien.
- Ohne Geburtsdatum sowie bei Kursen und Einzelterminen bleiben die statischen Dateien.
- **Befund am Gerät (2026-10-06, Plan 0018, E0):** Die Blob-ICS der Merkliste öffnet in der installierten iOS-App direkt den Kalender-Dialog. Im Safari-Tab erscheint das übliche Banner „Calendar File Available“, auf Android ein Download, jeweils wie bei den statischen Links.
- Scheitert der Download aus dem Detail-Dialog am iPhone (Plan 0018, Schritt 6), nutzt das Detail wieder die statische Datei. Die Merkliste kürzt weiter, und eine bessere Lösung für das Detail wird ein eigener Plan.

## Konsequenzen
- Das Geburtsdatum verlässt das Gerät weiterhin nie. Ein Bit wird sichtbar, wie bei ADR 0017 (Startpunkt): Wer bei einer regelmäßigen Reihe „Alle Termine“ tippt und **keinen** Request auf `ics/…` auslöst, hat ein Geburtsdatum gesetzt.
- Passt kein Termin, entsteht keine Datei. Der Export-Chunk wird trotzdem angefordert, damit auch sein Request (ohne Service Worker, vor dem Vorladen) nicht verrät, ob ein Termin zum Alter passt.
- Ein späterer Import einer kürzeren Datei aktualisiert gleiche UIDs, löscht aber früher importierte Termine nicht. Wer die volle Reihe schon importiert hat, muss überzählige Termine selbst löschen.
- Der Klick wartet auf den Export-Chunk (`await loadExport()`, wie die Merkliste). Scheitert das Laden, erscheint ein Toast, und es gibt keinen stillen Rückfall auf die ungekürzte Datei.
- `src/ui/ics-export.ts` ist der einzige Lader von `src/domain/ics.ts` (`ics-entry-only`, `LAZY_LOADERS`).
