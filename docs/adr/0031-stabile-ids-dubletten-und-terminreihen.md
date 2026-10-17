# ADR 0031 – Stabile IDs: Dubletten gleicher Quelle und veränderte Terminreihen

Status: angenommen (2026-10-17), mit Plan 0038. **Ergänzt** ADR 0022, Punkt 3 (Zuordnung gegen den Vorstand): Gleichstand unter Zwillingen des Vorstands und Stufe 2 mit erstem Termin. Die übrigen Regeln von ADR 0022 bleiben, auch „keine Zusammenlegungen“.

## Kontext

- Die Zuordnung (ADR 0022, Punkt 3) verlor in den Nachtläufen vom 13.10. und 16.10. 49 von 498 und 85 von 483 IDs (gemessen an den Ständen von `data/offers.json` auf `main`). Davon sind ≈ 60 zu Recht weg, der Rest geht auf drei Ursachen zurück.
- **Dubletten gleicher Quelle** (42 IDs in 24 Gruppen): Der Build ließ zwei Fassungen desselben Angebots aus derselben Rohdatei stehen, mit identischen Terminen (am 13.10. 38 Gruppen in `data/offers.json`). Die Dublettenprüfung des Builds (Schritt 4) greift nur gegen eine ranghöhere Quelle, `mergeParts` nur zwischen verschiedenen Teilen mit gleicher Form. Fasst ein späterer Lauf die Fassungen zusammen, passen beide alten IDs gleich gut; Stufe 1 verlangt einen strikt besten Partner, also fallen **beide** weg.
- **Gewachsene oder geschrumpfte Terminreihe** (≈ 20 IDs): Titel und Uhrzeit passen, aber weder Stufe 1 (≥ 80 % gleiche Beginnzeiten) noch Stufe 2 (≥ 50 % gleiche Tage) greift, etwa wenn der Vorstand nur den Starttermin kannte und der Lauf die ganze Reihe liefert, oder wenn Ferienwochen herausfallen.
- **Format kippt** zwischen `kurs` und `regelmaessig` (5 IDs): nicht Teil dieser Entscheidung.
- `similarTitle` (`scripts/pipeline/lib/similar.ts`) ist für das Löschen zu großzügig: Es zählt Wochentage und Füllwörter als Schlüsselwort, echte Parallelkurse gleicher Zeit gelten als ähnlich.

## Entscheidung

1. **Ein Prädikat für „ein Angebot in zwei Fassungen“:** `sameOfferTwice(a, b, from)` in `scripts/pipeline/lib/stable-ids.ts` gilt bei gleichem Anbieter, Ort und Format, verträglichem Alter (`compatibleAge`: gleich, auf einer Seite ohne Alter, oder ein Bereich ganz im anderen), gleichem Kerntitel (`sameCoreTitle`, Punkt 5) und einem Jaccard der Beginnzeiten auf die Minute über die Termine ab `from` von mindestens **`SAME_SOURCE_SESSIONS = 0.8`**. Gleicher Wert wie `SAME_SESSIONS`, weil bis zu 20 % abweichende Termine bei derselben Quelle fast immer herausgenommene Ferientage sind; bewusst eine eigene Konstante, damit eine Änderung der Zuordnung nicht still das Löschen ändert (ADR 0004). Das Prädikat gilt gleich für den Build (Punkt 2) und die Zwillinge (Punkt 3).
2. **Dubletten gleicher Quelle im Build** (`build-offers.ts`, Schritt 4b nach Schritt 4, `dropSameSourceDuplicates`): Zwei Kandidaten gleichen Rangs, für die `sameOfferTwice` gilt, werden zu einem. Gierig in fester Reihenfolge, zuerst Kandidaten, deren Fensterschlüssel im Vorstand steht, dann nach `order`; so springt der überlebende Titel nicht zwischen den Nächten. Der Bleibende behält alle Felder, nur die Themen werden vereinigt. Die Termine werden nicht vereinigt, die abweichenden sind meist Ferientage. Jede entfernte Dublette steht im Bericht.
3. **Zwillinge des Vorstands** (Stufe 1 und 2): Zwei alte Angebote, für die `sameOfferTwice(a, b, horizon.from)` gilt, sind Zwillinge. Passen beide gleich gut zu einem Entwurf, trifft genau einer, nach der **Rangfolge**: höhere Titelähnlichkeit (`ratio` auf kleingeschriebenen Titeln), bei Gleichheit die kleinere ID. Ein alter Zwilling, dessen Partner in irgendeiner Stufe zugeordnet ist, ist **verbraucht** und fällt für alle weiteren Durchgänge aus der Menge der offenen alten Angebote (eine Funktion `openOlds()` für Stufe 1, deren Mehrdeutigkeits-Hinweise und Stufe 2). Sonst träfe der unterlegene Zwilling später eine Schwestergruppe. In Stufe 2, und in Stufe 1 je Durchgang, werden erst alle Vorschläge bestimmt, dann aufgelöst; zeigen zwei Zwillinge auf verschiedene Entwürfe, fallen beide Vorschläge weg. Ein solcher Konflikt aus Stufe 1 sperrt die Zwillinge auch für Stufe 2, die das nur mit schwächeren Belegen entschiede. Der Bericht nennt jeden weggefallenen Zwilling mit beiden Titeln. Mehrere gleich gute **Entwürfe** bleiben mehrdeutig.
4. **Stufe 2 mit erstem Termin:** Neben ≥ 50 % gleichen Tagen genügt ein gleicher erster Termin im Vergleichsfenster (Beginn auf die Minute), wenn beide Seiten dort Termine haben. Ein Paar mit widersprechenden Kennungen (`conflictingLabels`: Gruppenkennung oder Zeitraum im Titel) zählt nie. Hat eine Seite mehrere Kandidaten, entscheidet die **Uhrzeit** (mindestens eine gemeinsame Berliner Uhrzeit); bleibt genau einer, trifft er, wenn beide Richtungen auf dasselbe Paar zeigen. Die Uhrzeit ist nur Entscheider, keine Bedingung: Eine Gruppe mit neuer Uhrzeit behält ihre ID weiter.
5. **Kerntitel** (`coreWords`, `sameCoreTitle` in `similar.ts`): Wörter ab vier Buchstaben ohne Füllwörter, Kalenderwörter und Jahreszeiten. Gleich sind zwei Titel, wenn die ersten Kernwörter gleich sind oder sich nur um ein Füllsuffix (`kurs`, `gruppe`, `treff`, `zeit`) unterscheiden, ein direkt folgender Name nicht widerspricht („Spielgruppe Mäuse“ ≠ „Spielgruppe Bären“) und keine Gruppenkennung („Gruppe A“, „Babyschwimmen 2“) und kein Zeitraum („geb. Juni–Aug.“) widerspricht. `similarTitle` bleibt unverändert; es dient `mergeParts`, der Eval-Bewertung und der Zuordnung, wo es absichtlich großzügig ist.

**Abgrenzung zu ADR 0022** („Gleichstand oder Mehrdeutigkeit heißt kein Treffer“; Zusammenlegungen „ordnen in den gemessenen Fällen (Schwestergruppen mit gleichen Terminen) falsch zu“): Der Grundsatz bleibt. Schwestergruppen mit gleichen Terminen haben verschiedene Kerntitel und sind keine Zwillinge. Zwillinge sind ein Angebot in zwei Fassungen; welche ID überlebt, ändert nichts daran, worauf ein alter Link zeigt. Die andere ID wird nicht weitergeleitet.

## Alternativen

- **Gleichstand weiter ohne Treffer lassen:** verliert bei jeder zusammengeführten Dublette alle IDs.
- **Überdeckung der Termine statt erstem Termin** (Anteil am kleineren Angebot ≥ 0,9): im Rückspiel 4 IDs weniger, weil eine überlange Reihe mehrere alte Einzeltermine überdeckt und mehrdeutig wird.
- **Uhrzeit als Bedingung in Stufe 2:** bräche „neue Uhrzeit, gleiche Gruppe“.
- **`similarTitle` selbst verschärfen:** änderte `mergeParts` und die Eval-Bewertung mit.
- **Format-Lockerung in Stufe 2** (`kurs` ↔ `regelmaessig`): hält im Rückspiel nur 3 weitere IDs, verlangt eine zweite Abweichung von ADR 0022 und einen geänderten Test. Vertagt (`docs/ideas.md` beim Archivieren von Plan 0038).

## Konsequenzen

- Im Rückspiel gegen die echten Stände bleiben 455 statt 449 und 415 statt 398 IDs; keine alte ID wechselt zu einem anderen Angebot.
- Eine der Zwillings-IDs fällt weiter weg, wenn der Lauf das Angebot nur noch einmal liefert (keine Aliasse, ADR 0022, Punkt 3).
- Die App zeigt keine Dubletten gleicher Quelle mit gleichem Format und Kerntitel mehr. Eine falsche Zusammenführung echter Parallelgruppen nähme ein Angebot aus der App; deshalb ist das Prädikat strenger als die Zuordnung, und jede Zeile steht im Bericht.
- Mehr Treffer in Stufe 2, jeder mit beiden Titeln im Bericht.
- Zwei Titelvergleiche nebeneinander (`similarTitle`, `sameCoreTitle`), bewusst.
- `predictOffers` (`scripts/pipeline/lib/eval-score.ts`) baut über `buildOffers`; die Eval-Messung verschiebt sich also um die entfernten Dubletten.
- Die Wirkung kommt mit dem nächsten Nachtlauf; bis dahin vergebene IDs bleiben. Fehler gehen nach vorn: Regel verschärfen, nächster Lauf.
