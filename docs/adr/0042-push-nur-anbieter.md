# ADR 0042 – Push nur für Anbieter-Abos, Such-Abos entfallen

Status: **angenommen** (2026-10-31, mit Plan 0054, Nachtrag A), Nutzerentscheid vom 2026-10-31.

- **Ändert** ADR 0037, Punkte 2 und 7: Der Zuschnitt kennt nur Anbieter-Abos und Alter. Es gibt keine Such-Abos und keine Glocke an der Schnellfilter-Zeile mehr.
- **Ändert** ADR 0027 (in der Fassung von ADR 0037): Der App-Chunk lädt vor, sobald eine Glocke sichtbar ist. Das sind nur noch der Tab „Anbieter“ und das Anbieter-Sheet.
- **Ändert** ADR 0014: Der Service Worker lädt bei jedem Push nur `data/site.json`. Gespiegelt werden Geburtsdatum und Anbieter-Abos. Der Startpunkt liegt nicht mehr in der IndexedDB. Damit entfällt die Ergänzung von ADR 0014 zu ADR 0017, Punkte 1 und 3.
- **Ändert** ADR 0011, Punkt 6, in der Fassung von ADR 0014: Der Anlass „beim Push“ für `data/wegzeit.json` entfällt.
- Ändert die Invarianten „Privatsphäre“ und „Startpunkt“ in `docs/architecture.md`.

## Kontext

- Seit ADR 0037 zählte ein neues Angebot in der Wochen-Nachricht, wenn es von einem abonnierten Anbieter stammte **oder** zu einem Such-Abo passte.
- Der Nutzer will in „Entdecken“ nach den abonnierten Anbietern filtern können. Für den Push hat er entschieden, dass nur noch Anbieter zählen und die Such-Abos wegfallen.
- Such-Abos waren der einzige Grund, warum der Service Worker die Wegzeit-Tabelle lud und den Startpunkt im Geräte-Speicher brauchte (Wegzeit-Grenze eines Such-Abos).

## Entscheidung

1. **Zuschnitt** (`weeklyText`, `src/domain/news.ts`): Ein neues Angebot ist ein Treffer, wenn das Alter passt und es von einem abonnierten Anbieter stammt. Ohne Anbieter-Abo zählt wie bisher jedes neue Angebot, dann filtert nur das Alter. Mit Abo heißt der Titel „… von deinen Anbietern“.
2. **Service Worker**: Er lädt je Push genau einmal `data/site.json`, bedingt und für alle gleich. Er liest Geburtsdatum, Anbieter-Abos und gesehene IDs. Wegzeit-Tabelle und Startpunkt braucht er nicht mehr.
3. **Spiegel**: Gespiegelt werden `birthDate` und `providers`. Die Altlast `searches` und `origin` löschen Fenster (`mirror()`) und Service Worker (bei jedem Push und beim `activate`).
4. **Such-Abos entfallen**: `src/domain/searches.ts` und `src/data/searches-store.ts` werden entfernt. `zwergenplan.such-abos` wird beim Start gelöscht.
5. **Chip „Meine Anbieter“** in „Entdecken“: Er filtert Liste und Karte auf die abonnierten Anbieter. Sein Zustand lebt nur im Speicher, nie in der URL, und Kamera und Kachel-Requests hängen nicht davon ab.

## Alternativen

- **Chip nur in „Entdecken“, Push unverändert**: Das wäre der kleinste Schritt. Der Nutzer wollte aber, dass der Push nur noch Anbieter kennt.
- **Such-Abo mit „nur meine Anbieter“** (UND statt ODER): Das bräuchte ein erweitertes Abo-Format und mehr Logik im Service Worker, für einen Fall, den niemand verlangt hat.
- **Chip in der URL**: Ein geteilter Link zeigte beim Empfänger dessen Abos, also eine andere Liste. Deshalb nur im Speicher.

## Konsequenzen

- **Privatsphäre**: Bei eingeschaltetem Push liegt kein Startpunkt mehr in der IndexedDB, und der Push lädt keine Wegzeit-Tabelle.
- Wer Such-Abos hatte, verliert sie ohne Hinweis. Der Nutzerkreis ist klein, und der Push meldet danach alles Neue bzw. die Treffer der Anbieter.
- Das Service-Worker-Bundle wird kleiner: Filter- und Wegzeit-Logik fallen aus dem Zuschnitt.
- Den Altlast-Code (Löschen von `searches`, `origin` und `zwergenplan.such-abos`) kann man nach einem halben Jahr entfernen (`docs/ideas.md`).
