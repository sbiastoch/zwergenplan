# ADR 0030 – Eine Kategorie je Angebot, gewählt von der Extraktion und gespeichert

Status: angenommen (2026-10-12), mit Plan 0037, Stufe A (Schritt A5): Ab dann wird `category` gespeichert. **Geändert durch ADR 0042**: Such-Abos (Punkt 2) entfallen. **Löst teilweise ab:** ADR 0003, Punkt „Themen und Kategorien“ (Kategorien nur abgeleitet), und die Invariante „Abgeleitete Werte wie Kategorien werden berechnet, nie gespeichert“ (`docs/architecture.md`, zitiert in ADR 0012). **Ersetzt** Plan 0014, E1–E3 (Etikett folgt dem Filter). **Ergänzt** ADR 0024, Punkt 3 (Kategorien eines Anbieters aus den Hauptkategorien seiner kommenden Angebote).

## Kontext

- Angebote speichern Themen aus einem geschlossenen Vokabular. Die zwölf Filter-Kategorien wurden über `TOPIC_CATEGORIES` abgeleitet. Ein Angebot hatte so bis zu drei Kategorien; am 2026-10-12 waren es 209 von 469 Angeboten mit mehr als einer.
- Die Oberfläche zeigt eine Kategorie je Kachel. Seit Plan 0014 ist es die erste **gewählte** Kategorie, ohne Filter die erste in fester Reihenfolge. Der Filter ließ ein Angebot durch, wenn irgendeine seiner Kategorien gewählt war.
- Folge (Nutzermeldung 2026-10-12): Das Etikett wechselt mit dem Filter, und ein Angebot erscheint in mehreren Kategorien. Die feste Reihenfolge entscheidet ohne Filter, nicht der Inhalt. „Museum & Ausstellung“ war deshalb nie Etikett.

## Entscheidung

1. **Jedes Angebot hat genau eine Kategorie**, das Feld `category` (einer der zwölf Werte aus `CATEGORIES`) in `data/offers.json`. Gewählt wird sie in der Extraktion durch das Modell, nach Regeln im Prompt (`scripts/pipeline/prompt/extract.md`), gespeichert wird sie im Rohformat (`data/raw/`) und im Datenvertrag (`src/domain/schema.ts`). Sie ist damit der einzige gespeicherte Wert, der sich früher ableiten ließ (Nutzerentscheid).
2. **Der Kategoriefilter wirkt nur auf `category`** (`matchesFilter`, `src/domain/filter.ts`), überall gleich: Liste, Anbieter-Tab, Such-Abos, Wochen-Push im Service Worker (Nutzerentscheid). Die Merkliste hat keinen Kategoriefilter und bleibt unberührt.
3. **Etikett, Farbe und Form** von Kachel, Detail, Kalenderpunkt, Kachelbild und Vorschau kommen nur aus `category`. Kein Filter ändert sie. Der Kartenmarker eines Orts zeigt die häufigste Hauptkategorie seiner Angebote, das Anbieter-Sheet die Vereinigung der Hauptkategorien seiner kommenden Angebote.
4. **Themen bleiben** als Pflichtfeld mit der Regel „mindestens ein Thema mit Kategorie“. Die Oberfläche liest sie nicht mehr. `category` muss nicht zu den Themen passen; ein Widerspruch ist eine Warnung im Nachtlauf-Bericht, kein Fehler.
5. **Dubletten:** Die Kategorie des ranghöheren Angebots gewinnt (wie alle anderen Felder), die Themen werden vereinigt.
6. **Übergang in drei Stufen** (Plan 0037, E1, E5, E7): Stufe A führt das Feld optional ein, mit Pflicht in der Antwort des Modells und einem Rückfall im Build (erste Kategorie der Themen, mit Zähler). Stufe B macht `category` in `data/offers.json` zur Pflicht und stellt Filter und Anzeige um. Stufe C macht das Feld im Rohformat zur Pflicht und entfernt Rückfall und Kompatibilitätsnetz. Voraussetzung für C ist, dass auch `data/raw/` kein Event ohne `category` mehr enthält, auch nicht in `pending.events`. Das Antwortschema der Extraktion (Teil des Cache-Schlüssels) ändert sich nur in Stufe A. Das Kompatibilitätsnetz für ein gecachtes `site.json` ohne `category` sitzt in `src/ui/App.tsx`, nicht in `src/data` (ADR 0010).

## Alternativen

- **Hauptkategorie berechnen statt speichern** (etwa: erste Kategorie in fester Reihenfolge, oder Gewichte je Thema): ohne Modell und ohne Neu-Extraktion. Verworfen: Die Reihenfolge entscheidet nicht nach Inhalt („Babykonzert“ wäre Musik, „Krabbelreime in der Bibliothek“ Musik). Gewichte je Thema können den Zusammenhang nicht sehen, der entscheidet (Zuschauen oder Mitmachen, Bibliothek oder Theater).
- **Themen durch die Kategorie ersetzen:** spart Ausgabe-Tokens, bricht aber alte Tabs und Service Worker, die nach dem Deploy noch nach Themen filtern, und wirft die Merkmale weg. Zurückgestellt (`docs/ideas.md`, „Themen ohne Abnehmer“).
- **Mehrere Etiketten je Kachel zeigen** (Idee aus Plan 0014): Etikett und Filter wären konsistent, aber die Kachel bräuchte Platz bei 360 px und ein neues Design, und ein Angebot stünde weiter in mehreren Kategorien. Vom Nutzer nicht gewollt.
- **`category` sofort Pflicht in einem Schritt:** Der Nachtlauf schreibt `data/offers.json` nur auf `main` mit dem Code von `main`. Der Merge-Commit hätte also Daten ohne Pflichtfeld und wäre rot; `data/offers.json` von Hand zu ergänzen ist verboten.

## Konsequenzen

- Ein Wechsel von Prompt und Antwortschema extrahiert einmal alle Anbieter neu (Plan 0032, E4, N3): etwa $0,65 API-Gegenwert, mit einmal höherer Token-Bremse in einer Nacht.
- Nebenfilter werden kleiner: Ein Angebot erscheint nur noch unter seiner Hauptkategorie. Bestehende Such-Abos und Links mit `kat=` bleiben gültig, ihre Treffer ändern sich ohne Hinweis.
- Eine falsche Hauptkategorie wird über Prompt und Eval korrigiert, nie in den Daten. Die Evals bewerten `category` exakt.
- `site.json` wächst um rund 25 Bytes je Angebot.
- `TOPIC_CATEGORIES` dient nach Stufe C nur noch der Themenregel und der Warnung.
