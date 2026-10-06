# ADR 0017 – Regelmäßige Reihen altersgerecht als ICS, im Browser erzeugt

Status: Entwurf (2026-10-06), ergänzt ADR 0007. Details in Plan 0016.

## Kontext
ADR 0007 erzeugt nur die Sammeldatei der Merkliste im Browser, alle übrigen ICS-Dateien bleiben statisch. Regelmäßige Gruppen werden mit Plan 0015 12 Monate fortgeschrieben. Eine statische Reihen-Datei brächte damit etwa 50 Termine in den Kalender, auch nachdem das Kind aus dem Angebot herausgewachsen ist. Das Geburtsdatum steht nur im `localStorage` des Geräts.

## Entscheidung
- Bei **regelmäßigen** Angeboten mit gespeichertem Geburtsdatum entsteht „Alle Termine“ im Detail **im Browser**, über denselben Export-Chunk wie die Merkliste. Das gilt nur, wenn wirklich gekürzt wird, sonst bleibt der statische Link.
- Die Merkliste kürzt regelmäßige Angebote ebenso.
- Die Datei enthält nur nicht beendete Termine, an denen das Angebot zum Alter passt (`exportSessions` in `src/domain/ics-select.ts`, im Export-Chunk).
- VEVENTs, UIDs, Titel und `DTSTAMP` bleiben identisch mit den statischen Dateien.
- Ohne Geburtsdatum sowie bei Kursen und Einzelterminen bleiben die statischen Dateien.
- Ob iOS (Safari-Tab, installierte App) Blob-ICS als Kalender-Import öffnet, misst Plan 0016, Schritt 0, vor der Umsetzung. Scheitert es, behält iOS die statischen Links, und der Toast nennt das Altersende.

## Konsequenzen
- Das Geburtsdatum verlässt das Gerät weiterhin nie.
- Ein späterer Import einer kürzeren Datei aktualisiert gleiche UIDs, löscht aber früher importierte Termine nicht. Wer schon die volle Reihe importiert hat, muss überzählige Termine selbst löschen.
- Ist der Export-Chunk beim Tippen noch nicht geladen, kommt die statische, ungekürzte Datei.
- `src/ui/ics-export.ts` ist der einzige Lader von `src/domain/ics.ts` (`ics-entry-only`, `LAZY_LOADERS`).
