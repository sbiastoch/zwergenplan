# ADR 0007 – Merklisten-ICS entsteht im Browser

Status: angenommen (2026-10-04), ergänzt ADR 0003; UID-Form mit der Kurz-ID ergänzt durch ADR 0022; ergänzt durch ADR 0018 (Plan 0018: regelmäßige Reihen passend zum Alter, ebenfalls im Browser). Details in Plan 0003 (E12).

## Kontext
ADR 0003 und `docs/architecture.md` legen fest, dass ICS-Dateien statisch zur Build-Zeit entstehen: eine Datei je Reihe, eine je Einzeltermin einer regelmäßigen Reihe. Die Merkliste („Mein Stickerheft“) soll alle gemerkten Angebote mit einem Tipp in den Kalender bringen. Welche Angebote gemerkt sind, steht nur im `localStorage` des Geräts (Privatsphäre). Der Build kann diese Datei also nicht vorab erzeugen. Die Alternative wäre, alle Einzeldateien nacheinander zu öffnen; das sind bei fünf Angeboten fünf Kalender-Dialoge.

## Entscheidung
- Die Sammeldatei der Merkliste wird **im Browser** erzeugt (`icsForCollection` in `src/domain/ics.ts`) und als Blob mit `download="zwergenplan-merkliste.ics"` geladen.
- Sie nutzt **dieselben VEVENTs** wie die statischen Dateien: gleiche UIDs (`offerId--YYYYMMDDTHHmm@zwergenplan`), gleiche Titel inklusive Kursnummerierung, Zeiten in UTC, keine RRULE/RDATE. Ein späterer Import einer Einzeldatei aktualisiert also denselben Termin.
- `DTSTAMP` kommt aus `generatedAt` des Datenstands (deterministisch, wie beim Build). `X-WR-CALNAME` ist „Zwergenplan – Merkliste“.
- Auswahl der Termine: Kurse komplett, regelmäßige und einmalige Angebote nur nicht beendete Termine (`exportSessions` in `src/domain/saved.ts`; bis Plan 0018 `collectionSessions`). Mit Geburtsdatum nimmt sie von regelmäßigen Angeboten nur die Termine, an denen sie zum Alter passen (ADR 0018).
- Alle übrigen ICS-Dateien bleiben statisch. `ics.ts` importiert Zod nur als Typ, das Modul darf deshalb in den Client (`no-zod-in-client-transitive`).

## Konsequenzen
- Etwa 1 kB mehr JS im Client-Bundle. Seit Plan 0010, E8 A ist das ein Lazy-Chunk (`assets/export/`), den die App im Leerlauf vorlädt. Der Download folgt deshalb auf ein `await` im Tipp; ob iOS ihn noch als Folge des Tipps gelten lässt, prüft der Browser-Review am iPhone.
- iOS Safari bietet eine Blob-`.ics` je nach Version als Datei-Download statt „Zum Kalender hinzufügen“ an. Das prüft der Browser-Review auf einem echten iPhone. Fällt es schlecht aus, listet die Merkliste zusätzlich die statischen Einzel-Links.
- Die Gleichheit der VEVENTs prüft ein Unit-Test (`icsForCollection` vs. `icsForSeries`).
