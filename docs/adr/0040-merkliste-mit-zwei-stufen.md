# ADR 0040 – Merkliste mit zwei Stufen

Status: **angenommen** (2026-10-30, mit Plan 0057), Nutzerentscheidungen a, b und U2. Umgesetzt in Plan 0057, S1.
- **Ändert** ADR 0007: Die Sammeldatei der Merkliste nimmt nur noch fest eingeplante Angebote. Die Bauweise (Datei im Browser, gleiche VEVENTs und UIDs) bleibt.
- **Übernimmt** das Request-Muster aus ADR 0018: Der Export-Chunk wird auch angefordert, wenn nichts in die Datei kommt.
- **Löst** Plan 0008, E9 für Toasts mit Aktion **ab**: Ein Toast darf einen Knopf haben.
- **Ergänzt** ADR 0020, Punkt 8 (Teilen der Merkliste, noch nicht umgesetzt): Das Fragment v1 kennt keine Stufen.

## Kontext

- Die Merkliste soll Long- und Shortlist zugleich sein: „vorgemerkt“ (vielleicht) und „fest eingeplant“ (das wollen wir machen). Die App verwaltet bewusst keine Buchungen; es gibt kein „angemeldet“ oder „gebucht“ (Plan 0057, Nutzerentscheid a).
- Bisher war `zwergenplan.merkliste` ein JSON-Array der IDs in Merk-Reihenfolge. Eine alte, vom Service Worker gecachte App-Version liest jedes andere Format als leere Liste und überschriebe den Schlüssel beim nächsten Herz-Tipp. 22 E2E-Stellen belegen das Array direkt.
- Die Stufen wechseln am Herz, das schon jetzt in jeder Kachel, im Detail und in den Sheets steht (Nutzerentscheid b).

## Entscheidung

1. **Speicher abwärtsverträglich:** `zwergenplan.merkliste` bleibt das Array **aller** gemerkten IDs. Ein zweiter Schlüssel `zwergenplan.merkliste-vorgemerkt` hält die nur vorgemerkten, immer als Teilmenge; eine leere Liste entfernt ihn. **Fest eingeplant ist jede gemerkte ID, die nicht vorgemerkt ist.**
   - Der Bestand gilt damit ohne Migration als fest eingeplant (Nutzerentscheid U2): Export, Kalender und Badge verhalten sich für ihn wie bisher.
   - Eine alte App-Version liest das Array weiter richtig und behandelt alles als gemerkt. Entfernt sie eine ID, bleibt höchstens eine verwaiste Vorgemerkt-ID stehen; die Bereinigung beim Start (`cleanSavedState` in `useSaved`, Hook-Schicht nach ADR 0022, Punkt 10) räumt sie ab.
   - Beide Schlüssel verlassen das Gerät nie und stehen nie in URL, Logs, Requests oder IndexedDB (Invariante Privatsphäre in `docs/architecture.md`). Push und Service Worker lesen sie nicht (ADR 0014).
2. **Herz als Dreifach-Schalter:** Ein Tipp schaltet aus → vorgemerkt → fest → aus. `aria-pressed` ist `false`, `"mixed"` bzw. `true`; `"mixed"` bedeutet „vorgemerkt“. Der Name bleibt „<Titel> merken“, die Wirkung sagt ein Toast an.
3. **Halten ist nur eine Abkürzung:** Langes Halten (550 ms) plant direkt fest ein. Jede Stufe ist auch ohne Halten erreichbar, denn `click` ist der einzige Tipp-Pfad, gleich ob Maus, Touch, Tastatur oder Hilfstechnik. Scheitert das Halten auf einer Plattform, wird es dort abgeschaltet; der zweite Tipp bleibt.
4. **Export nur fest eingeplant:** Die Sammeldatei nimmt nur fest eingeplante Angebote (`collectionExport` mit Stufen). Der Toast nennt, wie viele vorgemerkte fehlen. Ist nichts fest eingeplant, kommt ein Hinweis statt einer Datei, und der Export-Chunk wird trotzdem angefordert: Der Request verrät so weder, ob etwas zum Alter passt (ADR 0018), noch, ob etwas fest eingeplant ist.
5. **Toasts mit Aktion:** Ein Toast darf einen Knopf haben („Rückgängig“). Nur der Knopf fängt Tipps (≥ 44 px), der Toast steht links und endet mindestens 96 px vor dem rechten Rand, also nie über der Spalte der Herzen. Er steht 6 s; solange der Knopf Fokus hat, läuft die Zeit nicht ab. Nach „Rückgängig“ geht der Fokus aufs auslösende Herz. Für Tastatur und Screenreader ist das Weiterschalten am Herz der Weg zurück; ein Anspruch auf WCAG 2.2.1 für den Toast wird nicht erhoben.
6. **Teilen (später):** Das Fragment v1 aus ADR 0020, Punkt 8 trägt keine Stufen. Ein Import übernimmt alles als „vorgemerkt“, bis ein Format v2 die Stufen trägt.

## Konsequenzen

- Ein Schlüssel mehr im `localStorage`, keine Migration und kein Formatwechsel.
- Wer bisher alles in den Kalender holte, bekommt weiter alles, solange er nichts neu vormerkt. Neu Gemerktes ist zunächst nur vorgemerkt und landet erst mit dem zweiten Tipp in der Datei; Knopfname („Fest Eingeplantes in meinen Kalender“) und Hinweis sagen das.
- Ein vorgemerktes Angebot ist mit zwei Tipps entfernt (über „fest“). „Rückgängig“ fängt Fehltipps ab.
- Die Animation des Herzens hängt an der Nutzeraktion, nicht am Zustand: Beim Rendern, beim Wechsel der Darstellung und bei „Rückgängig“ läuft keine. Bei reduzierter Bewegung setzt der Handler keine Animationsklasse, denn dort feuert kein `animationend` (`src/ui/styles/motion.css`).
- Das lange Halten auf iPhone und Android (Textauswahl, Lupe, System-Long-Press) prüft ein Spike an echten Geräten nach dem Live-Gang.
