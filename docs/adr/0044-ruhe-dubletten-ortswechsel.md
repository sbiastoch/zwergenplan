# ADR 0044 – Dubletten gleicher Quelle im gemeinsamen Fenster, Ortswechsel, ruhende Angebote

Status: **angenommen** (2026-11-18, mit Plan 0061), Nutzerentscheide N1 und N2 vom 2026-11-18. Teil „Ruhende Angebote“ folgt mit Plan 0061, Etappe 2.

- **Ändert** ADR 0031 (Dubletten gleicher Quelle, Zwillinge): gleiche Termine im gemeinsamen Fenster statt Jaccard über alle Termine, Titel ohne Kernwort, die ältere Fassung bleibt.
- **Ergänzt** ADR 0022, Punkt 3 (Stufen der Zuordnung) um Stufe 2b (Ortswechsel).
- **Ergänzt** ADR 0041, Punkt 5 (Erbe auch aus der Dublettenregel) und Punkt 10 (befristete Liste erwarteter Verluste im Test der ID-Kontinuität).

## Kontext

Rückmeldung vom 2026-11-18: Viele Angebote tragen „Neu“, obwohl sie es nicht sind (Plan 0061, Befund). Drei Ursachen liegen im Build:

- **Dubletten gleicher Quelle** (B4): Die Familienbox nennt dieselben Gruppen auf zwei Seiten, einmal 53 Mittwoche, einmal 37 ohne die Ferienwochen. Jaccard über alle Termine ist 0,70, also unter 0,8. Die App zeigte beide, die jüngere mit „Neu“. Ähnlich bei Titeln ohne Kernwort („Eltern-Kind-Gruppe 0–3 Jahre (dienstags)“ / „… 9:30“) und bei „MiniClub … Dietrich-Bonhoeffer-Kirche“, wo das erste Kernwort verschieden ist.
- **Ortswechsel** (B3): Ein genauerer Ort wird im Katalog angelegt, das Angebot zieht dorthin. Stufe 1 und 2 verlangen denselben Ort, solange der alte im Katalog steht. Das Angebot bekam eine neue ID.
- **Lücken** (B1, B2): Ein Angebot fehlt einige Nächte und kommt zurück. Die Zuordnung kennt nur die Vornacht. Das löst der Teil „Ruhende Angebote“ (Plan 0061, Etappe 2).

## Entscheidung

1. **Gemeinsames Fenster** (`sameOfferTwice`, `scripts/pipeline/lib/stable-ids.ts`). Verglichen werden die Beginnzeiten ab `from` vom späteren der beiden ersten bis zum früheren der beiden letzten Termine. Gleich sind zwei Fassungen, wenn dort
   - mindestens 80 % der Termine der kleineren Seite auch in der größeren liegen (Überdeckung, `SAME_SOURCE_SESSIONS`),
   - die kleinere Seite mindestens die Hälfte der Termine der größeren hat (`MIN_SIDE_RATIO`),
   - mindestens min(3, Termine der größeren Fassung ab `from`) Termine gemeinsam sind.

   Damit gilt eine Fassung ohne Ferienwochen oder mit einem Ausschnitt als gleich. Ein Einzeltermin aus einer Reihe und zwei zufällig gleiche Termine gelten nicht. Anbieter, Ort, Format, `compatibleAge` und `sameCoreTitle` bleiben Bedingung.
2. **Kerntitel** (`sameCoreTitle`, `similar.ts`):
   - Haben beide Seiten kein Kernwort, entscheidet die Tokenfolge. Sie enthält Wörter und Ziffern, aber keine Uhrzeit, keine Kalenderwörter und keine Wochentagskürzel.
   - Gleich sind zwei Titel auch, wenn alle Kernwörter einer Seite in der anderen stehen und es mindestens zwei sind. Ein einzelnes gemeinsames Wort genügt nicht („Krabbelgruppe Maxis“ / „Wunder-Krabbler Maxis“).
   - Nennen beide Titel verschiedene Daten („Start 29.11.2026“ / „Start 21.02.2027“), sind es aufeinanderfolgende Durchgänge. Das hat die Messung gezeigt: Eine Fassung lief bis zum Horizont weiter und deckte den Folgekurs im Fenster ab.
3. **Die ältere Fassung bleibt** (`dropSameSourceDuplicates`, `build-offers.ts`; Nutzerentscheid N1). Jeder Kandidat sucht seinen Vorgänger im Vorstand: das eine Angebot mit gleichem Fensterschlüssel, sonst das eine, mit dem er `sameOfferTwice` ist. Bei mehreren Treffern, die untereinander Zwillinge sind, gilt der nach der Rangfolge erste. Die Reihenfolge der Fassungen:
   1. eine Fassung mit Vorgänger vor einer ohne;
   2. der Vorgänger mit dem älteren `listedAt`, ein fehlendes gilt als älter;
   3. die kleinere Vorgänger-ID;
   4. beim selben Vorgänger die Fassung mit gleichem Fensterschlüssel;
   5. dann `order`.

   Die bleibende Fassung behält ihre Termine im gemeinsamen Fenster, Termine der verworfenen Fassung außerhalb davon kommen dazu. Sie erbt die ID ihres Vorgängers (`keepVia: "dublette"`, Notiz „(Dublette)“). Das gilt nicht, wenn schon ein Erbe des Richters oder ein Widerspruch feststeht, und nicht, wenn ein anderer Bleibender denselben Vorgänger hat (ADR 0041, Punkt 5: nur bei genau einem Anspruch). Die ID der verworfenen Fassung fällt weg, gewollt nach N1.
4. **Stufe 2b, Ortswechsel** (`assignIds`). Sie läuft nach Stufe 2 und nur für die übrigen Entwürfe und offenen Vorstandsangebote ohne Zwillingskonflikt. Bedingungen: gleicher Anbieter, anderer Ort, mindestens 80 % gleiche Beginnzeiten im Vergleichsfenster, ähnlicher Titel ohne widersprechende Kennung, genau ein Kandidat auf beiden Seiten. Stufe 1 bleibt unverändert, damit derselbe Kurs an zwei Orten eines Anbieters kein eindeutiges Paar verliert. Notiz: `IDs: Stufe 2b (Ortswechsel) <id> „alt“ @<ort> → „neu“ @<ort>`.
5. **Test der ID-Kontinuität** (ADR 0041, Punkt 10). `scripts/pipeline/id-continuity.test.ts` nennt in `EXPECTED_DUPLICATE_LOSSES` die verworfenen Dubletten der eingefrorenen Fixture, je mit dem Partner, der bleibt. Ein Verlust aus der Liste ist nur erlaubt, wenn der Partner beim selben Anbieter steht.
   - Die Liste ist bewusst fest und keine Regel über `sameOfferTwice`, denn die Ausnahme darf sich nicht auf die überwachte Funktion stützen.
   - Sie ist befristet: Nach dem ersten Nachtlauf mit diesem Code wird die Fixture neu eingefroren, und die Liste entfällt.

## Alternativen

- **Schwellen senken** (Jaccard 0,7): Das hätte die Familienbox getroffen (0,70), Krabbelkäfer (12 in 37) und Passionskirche (28 in 37) aber nicht. Gleichzeitig wäre es ohne Fenster lockerer gegenüber Schwestergruppen.
- **Dubletten behalten oder weiterleiten**: Eine Weiterleitung ist die Alias-Liste, die ADR 0022 ablehnt. Dubletten zu behalten zeigt Angebote doppelt.
- **Ortswechsel in Stufe 1**: Das kostet eindeutige Paare durch Gleichstand, wenn derselbe Kurs zur selben Zeit an zwei Orten läuft (Plan 0061, Review M3).

## Konsequenzen

- Der erste Nachtlauf mit diesem Code verliert die IDs der jüngeren Dubletten. Merklisten-Einträge darauf zeigen „gibt es nicht mehr“ (N1).
- Unter Zwillingen des Vorstands entscheidet beim Build jetzt die ältere Fassung, nicht mehr die Titelähnlichkeit aus ADR 0031, Punkt 3. Welche ID überlebt, ändert nichts daran, worauf ein alter Link zeigt.
- Die Messung über 14 Nachtläufe (Plan 0061, „Messung Etappe 1“) senkt „Neu“ am 2026-11-18 von 83 auf 71. Keine Schwestergruppe der Gegenprobe wurde verschmolzen.
