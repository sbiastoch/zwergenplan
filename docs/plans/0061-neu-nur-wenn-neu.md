# Plan 0061 – „Neu“ nur, wenn es neu ist: ruhende Angebote, Dubletten gleicher Quelle, Ortswechsel

Status: Review eingearbeitet
Datum: 2026-11-18

Bezug:
- Plan 0043 (`listedAt`, „Neu eingestellt“), dort Review M2 („Lücken“, damals hingenommen).
- ADR 0022 (stabile IDs, Zuordnung gegen den Vorstand) samt Nachtrag zu Plan 0043; ADR 0031 (Dubletten gleicher Quelle, Zwillinge); ADR 0041 (ID-Gate, harte Regel „IDs stabil“).
- `scripts/pipeline/lib/build-offers.ts` (`withListedAt`, `dropSameSourceDuplicates`), `scripts/pipeline/lib/stable-ids.ts` (`assignIds`, `sameOfferTwice`), `scripts/pipeline/lib/similar.ts` (`sameCoreTitle`).

## Anlass

Rückmeldung des Nutzers vom 2026-11-18: Viele Einträge stehen als „Neu“ da, obwohl sie es nicht sind, z. B. https://zwergenplan.app/a/o4xo6513/ (Babyturnen 8–15 Monate, Familienbox). Danach der Auftrag, weitere Fälle zu prüfen und einen Plan für „zuerst gesehen“ zu schreiben, der Dubletten und die übersehene Zuordnung mit aufnimmt.

## Befund (Stand `data/offers.json` vom 2026-11-18, `81c3358`)

Die Analyse vergleicht jedes Angebot, das als neu gilt, mit allen täglichen Datenständen aus der git-Historie seit dem 2026-10-04. Als neu gilt hier ein `listedAt` ab dem 2026-11-05, also das Etikett „Neu“. Als Vorläufer zählt dieselbe ID oder ein früheres Angebot desselben Anbieters, das mindestens 2 gleiche künftige Beginnzeiten hat (bei Einzelterminen 1) und einen ähnlichen Titel (Zeichenähnlichkeit ≥ 0,6).

- **83 Angebote** tragen das Etikett „Neu“, **28** davon haben einen klaren Vorläufer. Die übrigen 55 sind überwiegend echte neue Semester oder Termine (Nüebad Jan.–Apr., Musikzauber „Frühlingszauber“, Vorträge der FBS).
- **B1 Gleiche ID nach Lücke (8).** Die ID kommt zurück, weil eine neue ID `shortId(offerKey, 0)` ist. `withListedAt` kennt aber nur `input.previous` (Vornacht) und setzt `listedAt = generatedAt`. Beispiele: `o4xo6513`, `lexg976t`, `cyqagasm` (Familienbox, fehlten vom 05. bis 11.11.), `rypwzx3l`, `e6m7r7yx`, `k8ntqpzi` (FBS), `9t8uvsm7` (Langwasser), `bht8gh03` (St. Johannis).
- **B2 Neue ID nach Lücke (13).** Nach der Lücke formuliert die Extraktion den Titel anders. Die Zuordnung kennt den Vorgänger nicht mehr, weil er in der Vornacht fehlte. Wolf Pack Yoga verliert immer wieder 4 von 5 Angeboten (02.–04.11. und 14.–17.11.), alle 4 Kurse „Yoga mit Baby“ sind so am 18.11. „neu“. Dazu vhs Fürth (Eltern-Kind-Turnen, Mi und Do: 02.–07.11. weg), Zukunftsmusik, Nürnberger Nest, FBS (MilchZeit, Waldgruppe, Abenteuerturnen), St. Markus und CVJM Gostenhof.
- **B3 Neue ID ohne Lücke (3), nachgebaut mit `assignIds` gegen den Stand der Vornacht:**
  - `e3of0bad → vq5l6lmq` (Waldkrabbelgruppe Faberpark, ev-eibach): 36 von 36 Terminen gleich, ähnlicher Titel. Aber der Ort wechselte von `ev-eibach` zum neu angelegten Ort `ev-eibach-waldkrabbelgruppe-bogen-an-der`. Stufe 1 und 2 verlangen denselben Ort, solange der alte im Katalog steht.
  - `9lj4uooc → a59jstcj` (Musikalische Früherziehung für Babys, FBS): Im Vorstand standen zwei Fassungen desselben Kurses (`9lj4uooc`, `of640r9a`), die `sameOfferTwice` nicht als Zwillinge erkannte. Stufe 1 meldet „mehrdeutig“ und vergibt eine neue ID. Die Ursache ist also B4.
  - `cobq44r5 → 4vn5uywp` (Studio Herzschlag): Die Termine sind verschieden (Kurs ab 07.01. gegen ab 04.02.). Das ist vermutlich ein anderer Durchgang, kein Fehler.
- **B4 Dubletten gleicher Quelle bleiben stehen.** `sameOfferTwice` verlangt ≥ 80 % gleiche künftige Beginnzeiten (Jaccard) und den gleichen Kerntitel. Beides scheitert an echten Dubletten:
  - **Eine Fassung ohne Ferienwochen**: Die Familienbox nennt dieselben Gruppen auf zwei Seiten. `…/erwachsenenkurse/stundenplan/` liefert 53 Termine, jeden Mittwoch vom 18.11.2026 bis 17.11.2027. `…/kinderkurse-nürnberg/stundenplan/` liefert 37 Termine vom 25.11.2026 bis 10.11.2027, ohne die Ferienwochen. Alle 37 stecken in den 53. Jaccard ist 0,70, im gemeinsamen Fenster 37/51 = 0,73. Die Überdeckung (Schnitt durch die kleinere Seite) ist 1,0 (Nachrechnung im zweiten Review). Betroffen sind `o4xo6513`/`u6msbbr7`, `lexg976t`/`4lgay38d` und `cyqagasm`/`lmg8yj5q`, ebenso `woxjse18`/`j1q48uo8` (FBS Krabbelkäfer, 12 in 37) und `9t8uvsm7`/`nk3e706i` (Passionskirche, 28 in 37). Die „Lücke“ der Familienbox vom 05. bis 11.11. war vermutlich genau diese Grenze: In der Woche waren die Reihen gleich lang, die Dublette fiel weg, danach nicht mehr.
  - **Titel ohne Kernwort**: „Eltern-Kind-Gruppe 0–3 Jahre (dienstags)“ / „… (dienstags 9:30)“ (`vewrlcdo`/`iz7cc9o1`, beide aus derselben iCal-Quelle) und „MiniClub Montag 15–17 Uhr (Blaues Sofa, Dietrich-Bonhoeffer-Kirche)“ / „Miniclub Dietrich-Bonhoeffer-Kirche (Mo 15–17 Uhr)“ (`u1a8ljau`/`h4vtflr1`). In beiden Fällen gibt `sameCoreTitle` `false` zurück.
  - Die übrigen Paare (Krabbelkäfer, Passionskirche, Melanchthon, Dietrich-Bonhoeffer) sind im gemeinsamen Fenster deckungsgleich (Jaccard 1,0). Sie scheitern an den Terminen über das Fenster hinaus oder am Titel.
  - Die App zeigt diese Angebote doppelt, und die jüngere Fassung trägt „Neu“.
- **Gegenprobe Schwestergruppen**: Im aktuellen Stand haben 10 Paare desselben Anbieters ≥ 80 % gleiche künftige Termine (Jaccard 1,0), sind aber verschiedene Angebote. Heute trennt sie `sameOfferTwice`. Die 10 Paare:
  - `yowa6a76`/`89ctcvmc`: „BabySinne 12–30 Monate, Di 9:30–10:15“ / „Kleinkindturnen 12–36 Monate, Di 9:30–10:30“;
  - `x7e409gg`/`nk3e706i`: „Mini-Club Donnerstagvormittag (9–10:30 Uhr)“ / „Mini-Club Passionskirche (Eltern-Kind-Gruppe, donnerstags)“;
  - `bht8gh03`/`j8y7grwt`: „Eltern-Kind-Gruppe für Säuglinge und Kleinkinder (donnerstags)“ / „Krabbelgruppe Donnerstag, TabeaHaus“;
  - `k8ntqpzi`/`9qrzbhu0` und `k8ntqpzi`/`e6m7r7yx`: „Abenteuerturnen 1“ / „PapaZeit Spezial: Waldweihnacht“;
  - `9qrzbhu0`/`e6m7r7yx`: „PapaZeit Spezial: Waldweihnacht“, zwei verschiedene Orte;
  - `3a547tmq`/`k7zf1srl`: „PapaZeit Spezial: Weihnachtswerkstatt“ / „Waldwichtel Knorke durch den Advent“;
  - `yr8y5tii`/`r6w7jc1k`: „Babymassage Mittwoch 10:00 Uhr“ / „Krabbelgruppe Minis (0–6 Monate) Mittwoch“;
  - `kihn0m03`/`xdymdkkd`: „Krabbelgruppe Maxis (ab 13 Monate) Donnerstag“ / „Wunder-Krabbler Maxis (über 12 Monate), donnerstags“;
  - `08r5kaz9`/`4j38jpsl`: „Achtsame Babymassage-Kurs“ / „Bindung durch Berührung (Babymassage)“.

  Gleiche Termine allein reichen also nie für eine Dublette. Einige Paare sind womöglich doch Dubletten oder Fehler der Extraktion (`x7e409gg`/`nk3e706i`, `bht8gh03`/`j8y7grwt`). Sie bleiben trotzdem bewusst getrennt: lieber eine Dublette als zwei Angebote verschmolzen.
- **Umfang einer Erinnerung**: Seit dem 2026-10-18 sind 419 IDs mit künftigem Termin weggefallen, als volle Angebote 756 kB roh. `data/offers.json` hat heute 1 175 kB. 22 IDs kamen nach einer Lücke zurück.
- Nicht Teil des Befunds und nicht dieses Plans ist die Frage, **warum** Anbieter nächteweise Angebote verlieren (Wolf Pack Yoga 5 → 1, vhs Fürth, Familienbox). Das liegt in Abruf und Extraktion und gehört zur Datenpflege (Skill `babyevents-nuernberg`). Dieser Plan macht die Daten robust gegen solche Lücken, er beseitigt sie nicht.

## Ziel

Ein Angebot, das schon im Zwergenplan stand, bekommt das Etikett „Neu“ nicht noch einmal, nur weil es Nächte fehlte, umformuliert zurückkam oder doppelt erfasst wurde. Ein echter neuer Kursdurchgang bleibt neu (Nutzerentscheid 3 zu Plan 0043). Nebenbei behalten solche Angebote ihre ID, also Links und Merklisten-Einträge (ADR 0041, harte Regel).

## Entscheidungen

Zwei Etappen mit je eigenem Commit und eigener Messung (Review m5): **Etappe 1** E1 und E3 (Zuordnung und Dubletten, ohne neue Datei), **Etappe 2** E2 (Ruhe).

### E1 – Dubletten gleicher Quelle: gemeinsames Fenster, Kerntitel ohne Kernwort, ältere Fassung bleibt

`sameOfferTwice(a, b, from)` (`stable-ids.ts`) gilt für Dubletten im Build (`dropSameSourceDuplicates`, Schritt 4b) und für Zwillinge im Vorstand (`findTwins`, ADR 0031). Anbieter, Ort, Format, `compatibleAge` und `sameCoreTitle` bleiben Bedingung. Neu sind drei Dinge:

1. **Gemeinsames Fenster und Überdeckung** (Review 2, Blocker 1). Verglichen werden die Beginnzeiten ab `from` im symmetrischen Fenster vom späteren der beiden ersten bis zum früheren der beiden letzten Termine. Im Fenster gilt **Überdeckung** statt Jaccard: |A ∩ B| / min(|A|, |B|) ≥ `SAME_SOURCE_SESSIONS` (0,8). Zusätzlich muss die kleinere Seite mindestens `MIN_SIDE_RATIO = 0,5` der größeren haben. Eine Fassung ohne Ferienwochen (Familienbox: 37 in 51, Verhältnis 0,73) ist damit gleich, ein Einzeltermin innerhalb einer Reihe aber nicht. Mindestzahl gemeinsamer Termine: min(3, |A|, |B|) (Review 2, Major 3). So bleiben Einzeltermine mit je einem Termin wie heute vergleichbar (gleich genau bei gleichem Beginn). Schwestergruppen zur selben Zeit trennt weiter der Kerntitel (Gegenprobe im Befund: dort ist schon die Überdeckung 1,0, getrennt hat sie immer der Titel bzw. Ort).
   - **Bestehende Tests, die kippen** (Review 2, Major 5), jeweils mit Begründung im Test:
     - `stable-ids.test.ts` „10 gegen die ersten 7“ (heute um Zeile 359): wird `true`;
     - `build-offers.test.ts` um Zeile 862–870 (Kette A~B~C): nur noch A bleibt;
     - um Zeile 898 (`pair(15, 19)`): nur noch 1 Angebot;
     - um Zeile 904 (laufend ab `FROM`): nur noch 1 Angebot.

     Jeder weitere kippende Test ist ein Befund und kommt als Nachtrag in den Plan, bevor er umgeschrieben wird.
   - **Termine** (Review 2, Major 4): Die überlebende Fassung behält ihre Termine im gemeinsamen Fenster. Termine der verworfenen Fassung **außerhalb** des Fensters kommen dazu (`unionSessions`). Innerhalb des Fensters gelten die Termine der überlebenden Fassung, sie entscheidet also über Ferienwochen. Test: Die kürzere Reihe überlebt und bekommt die späteren Termine der längeren.
2. **Titel ohne Kernwort.** Haben **beide** Seiten kein Kernwort (`coreWords` leer, z. B. „Eltern-Kind-Gruppe 0–3 Jahre (dienstags)“), sind sie gleich, wenn ihre Tokenfolgen gleich sind. Tokenfolge heißt: Kleinbuchstaben, Wörter **und Ziffernfolgen** (`/[a-zäöüß]+|\d+/g`), ohne Kalenderwörter (`CALENDAR` aus `similar.ts`) und ohne Uhrzeit-Bestandteile. Uhrzeit ist `\d{1,2}[:.]\d{2}` samt folgendem „Uhr“ sowie ein alleinstehendes „Uhr“. Ziffern bleiben, damit „0–3 Jahre“ und „1–3 Jahre“ verschieden sind (Review m1; `compatibleAge` trennt 0–36 und 12–36 nicht). `conflictingLabels` gilt weiter. Hat nur eine Seite ein Kernwort, bleibt es bei `false`. Den Fall „MiniClub … Dietrich-Bonhoeffer“ zerlegt der erste Umsetzungsschritt mit einem roten Test. Der Plan bekommt die konkrete Korrektur in `sameCoreTitle` als Nachtrag. Trennt sie eine Schwestergruppe der Gegenprobe nicht mehr, entfällt sie, und der Fall bleibt Dublette.
3. **Ältere Fassung bleibt** (Review M4). `dropSameSourceDuplicates` bekommt statt `previousWindowKeys` eine Abbildung auf den Vorstand: `previousOffers: readonly Offer[]`. Ein Kandidat gehört zu einem Vorstandsangebot, wenn
   - sein Fensterschlüssel genau ein Vorstandsangebot trifft, sonst
   - `sameOfferTwice` gegen genau ein Vorstandsangebot gilt.

   Gibt es keinen oder mehrere Treffer, hat er keinen Vorgänger. Bei einer Dublette entscheidet die Reihenfolge so:
   1. eine Fassung mit Vorgänger vor einer ohne;
   2. bei zwei Vorgängern der mit dem älteren `listedAt`, wobei ein fehlendes `listedAt` als älter gilt (Bestand vor Plan 0043);
   3. dann die kleinere ID des Vorgängers;
   4. dann wie heute `order`.

   Sind alle Treffer eines Kandidaten untereinander Zwillinge (ADR 0031), wählt er unter ihnen nach derselben Rangfolge (älteres `listedAt`, dann kleinere ID). Er hat dann genau einen Vorgänger, und es gilt nicht `outranks` (Review 2, Minor 8).

   Die überlebende Fassung bekommt die ID ihres Vorgängers als `keepId`, damit `assignIds` sie sicher trifft. Das gilt **nur, wenn ihr `keepId` noch `undefined` ist** (Review 2, Minor 7). Ein Erbe des Richters (ADR 0041) und ein `null` aus `mergeKeep` (Widerspruch, also kein Erbe) bleiben unberührt. Die Notiz in `assignIds` (heute „geerbt … (Richter)“) unterscheidet künftig zwischen „(Richter)“ und „(Dublette)“. Dazu trägt `Candidate` die Herkunft des Erbes. Die ID der verworfenen Fassung fällt weg. Das ist ein gewollter Verlust (Nutzerentscheid N1). ADR 0044 erweitert damit ADR 0041, Punkt 5 (Erbe auch aus der Dublettenregel).

### E3 – Ortswechsel als eigene Unterstufe nach Stufe 2

Stufe 1 bleibt unverändert. Ein Ortswechsel in Stufe 1 hätte heute eindeutige Paare durch Gleichstand gekostet: derselbe Kurs zur selben Zeit an zwei Orten eines Anbieters (Review M3). Neu ist **Stufe 2b nach Stufe 2**, nur für die dann noch freien Entwürfe und offenen Vorstandsangebote (ohne Zwillingskonflikt). Bedingungen:
- gleicher Anbieter, anderer Ort;
- ≥ `SAME_SESSIONS` (0,8) gleiche Beginnzeiten im Vergleichsfenster;
- `similarTitle`, kein `conflictingLabels`, kein Titel-Widerspruch wie in Stufe 1;
- auf beiden Seiten genau ein Kandidat.

Das trifft `e3of0bad → vq5l6lmq` (Faberpark): Ein genauerer Ort wurde angelegt, und das Angebot zieht dorthin um. Die Notiz lautet `IDs: Stufe 2b (Ortswechsel) <id> „alt“ @<ort> → „neu“ @<ort>`. ADR 0041 erlaubt den Ortswechsel beim Erbe schon („Fehlverortung behoben“). E3 steht in ADR 0044.

### E2 – Ruhende Angebote: ein Gedächtnis über die Vornacht hinaus

**Datei und Schema** (Review M7, M8):
- Neue Datei `data/ruhend.json`. Sie schreibt nur der Build des Nachtlaufs (`pipeline nightly`, `--build-only`), nie ein Mensch (ADR 0026). Biome nimmt sie aus wie `data/raw` (`biome.json`, `!data/ruhend.json`), denn sie ist erzeugter Pipeline-Zustand.
- Das Schema `RestingFile` liegt nach dem Vorbild von `ProviderRaw` und `DiscoverState` in `scripts/pipeline/lib/resting.ts`, nicht in `src/domain/schema.ts`. Es ist Zustand der Pipeline, kein Vertrag der Website. `pnpm data:validate` prüft die Datei per Zod (`scripts/validate-data.ts`), mit einer Fixture unter `tests/fixtures/`.
- I/O-Grenze (Review 2, Minor 10): Lesen und Schreiben stehen in `scripts/pipeline/io/files.ts`. In `lib/resting.ts` liegen nur das Parsen (Zod, Rückfall als Rückgabewert) und die reine Fortschreibung, denn `pipeline-lib-no-node-io` verbietet Node-I/O in `lib/`. `offers.json` und `ruhend.json` werden nur gemeinsam geschrieben: Ohne `file` (Build mit Fehlern) wird auch die Ruhe nicht geschrieben.
- Form: `{ generatedAt, entries: RestingEntry[] }`. Ein `RestingEntry` hat diese Felder:
  - `id`;
  - `key` (`offerKey` mit erstem Termin, also die Saat seiner ID, Review m3);
  - `providerId`, `venueId`, `title`, `format`, `age?`, `listedAt?`;
  - `restingSince` (`generatedAt` des ersten Laufs ohne das Angebot);
  - `horizonTo` (letzter Tag, bis zu dem `starts` vollständig ist, Review M1);
  - `starts`: Berliner Schlüssel `YYYYMMDDTHHmm` (`berlinKey`), nur ab `restingSince`, höchstens bis `horizonTo = min(horizon.to des Laufs, restingSince + RESTING_SPAN_DAYS = 112)`.
- Ohne Ende, Ort und Text bleiben es grob 16 Termine zu 16 Byte je wöchentlichem Angebot. Bei rund 750 Einträgen in 56 Tagen ergibt das eine Schätzung von etwa 200–250 kB roh, Ziel < 300 kB. `writeJson` rückt ein (`JSON.stringify(v, null, 1)`, `io/files.ts`). Deshalb bekommt die Ruhe einen eigenen Writer `writeResting` in `io/files.ts` mit einer Zeile je Eintrag (Review 2, Minor 9). Die Größe wird in Schritt 8 gemessen.
- **Tage**: `restingSince + 56` und `+ 112` zählen Berliner Kalendertage über `addDays` und `berlinIsoDate` (`src/domain/time.ts`). Die `starts` wandelt `fromBerlinLocal` zurück in Zeitpunkte, für `side()` und `isNewRun` (Review 2, Minor 11). Tests laufen wie alle in `America/Los_Angeles`, mit einem Fall über die Zeitumstellung.

**Fortschreibung** (nach Schritt 7, Übernahme):
- Jede ID aus Vorstand oder alter Ruhe, die nicht in der Ausgabe steht, ruht. `restingSince`, `horizonTo` und `starts` eines schon ruhenden Eintrags bleiben unverändert.
- Ein Eintrag fällt weg in drei Fällen:
  - `restingSince` ist älter als `RESTING_DAYS = 56` (Nutzerentscheid N2);
  - er hat keine Beginnzeit ab `horizon.from` mehr;
  - seine ID steht wieder in der Ausgabe.
- Ein Eintrag, dessen ID zugleich im Vorstand steht, wird ignoriert und entfernt. Er ist ein Rest aus einem abgebrochenen Lauf (Review m3).

**Zuordnung** (`assignIds`, Durchgang 2; Review M2):
- Durchgang 1 ist Erbe, Stufe 0, 1, 2 und 2b gegen den Vorstand wie oben.
- Danach kommt Durchgang 2: Stufe 0, 1 und 2 mit denselben Regeln für die noch freien Entwürfe gegen die Ruhe. Es gibt keine Stufe 2b gegen die Ruhe, das hält das Risiko klein.
- Nicht teilnehmen dürfen:
  - Entwürfe, die in Durchgang 1 in Stufe 1 oder 2 mehrdeutig waren oder in einem Zwillingskonflikt standen. Ihr naher Kandidat ist ein Vorstandsangebot, keine alte Ruhe-ID. `assignIds` sammelt diese Entwürfe als Indexmenge in den Stufen selbst, nicht aus den Notiztexten (Review 2, Minor 13).
  - Ruhe-Einträge, die mit einem zugeordneten Angebot der Ausgabe `sameOfferTwice` sind. Das sind verworfene Dubletten (E1), sie dürfen nicht als zweite Fassung zurückkehren.
- Rivalen für den Titel-Widerspruch in Stufe 1 sind **alle** Vorstandsangebote (zugeordnet oder nicht) und alle Ruhe-Einträge desselben Anbieters, wie ADR 0022, Punkt 3 es für den Vorstand verlangt.
- Das Vergleichsfenster je Paar ist `[horizon.from, min(entry.horizonTo, horizon.to)]` (Review M1).
- **Keine Kursfortschreibung** bei Treffern aus der Ruhe (Review B3): Der Entwurf behält seine Termine. Ruhe-Einträge haben weder `end` noch vergangene Termine, und eine Fortschreibung erzeugte ungültige Termine.
- **Belegte IDs:** Neue IDs meiden ruhende IDs (`occupied`), mit einer Ausnahme: Ein freier Entwurf, dessen `keyOf` gleich dem `key` eines ruhenden Eintrags ist, bekommt dessen ID. Das ist genau die heutige Rückkehr über `shortId(key, seed)`, nur ohne die Gefahr, dass ein anderer Seed greift (Review m3).
- **Bericht:** Die Kopfzeile meldet zusätzlich `n aus der Ruhe`. Je Treffer erscheint `IDs: aus der Ruhe <id> „alt“ → „neu“ (Stufe s, ruhte seit <Datum>)`.

**`listedAt` und `isNewRun`:** `withListedAt` sucht den Vorgänger in Vorstand und Ruhe. `isNewRun` bekommt für Ruhe-Vorgänger die Termine aus `starts` und als Horizont `entry.horizonTo` (Review M1). Ein Kurs, der Wochen später mit neuen Terminen wiederkommt, ist so weiter neu. Das deckt B1 (gleiche ID nach Lücke) und B2 (neue ID nach Lücke).

**Netz:** `checkIdContinuity` prüft auch Ruhe → Ausgabe (eine ID wechselt nie den Anbieter).

**Aufrufer** (Review M6). `buildOffers` und `buildFromState` bekommen einen optionalen Parameter `resting`:
- **mit Ruhe:**
  - der Build des Nachtlaufs (`io/nightly.ts`, `buildFromRaw`) und `--build-only`;
  - **alle** Builds des ID-Gates (`io/id-gate.ts`: b, a und `recheck`), alle über die Closure `build` (heute um Zeile 123). Dort wird die Ruhe einmal eingesetzt, dieselbe wie im Build danach. So stimmen `origins`, Verluste und `listedAt` überein.
- **ohne Ruhe:** `lib/pflege.ts`, `io/discover.ts`, `lib/eval-score.ts` und `lib/extract.ts`. `pflege.ts` baut zwar mit Vorstand (heute um Zeile 145), aber nur für den Ertragsbeweis. Keiner davon schreibt `offers.json` (ADR 0041, Punkt 8). Ohne Ruhe verhalten sie sich wie heute. Der Mock in `nightly.test.ts` bekommt das Feld.

**Veröffentlichen** (Review B1):
- `scripts/pipeline/io/publish.ts`: `NIGHTLY_PATHS` um `data/ruhend.json` erweitern, den Kopfkommentar ebenso, Test in `publish.test.ts`.
- `.github/workflows/nightly.yml`: `data/ruhend.json` in die Artefaktliste (heute Zeilen 253–256), damit `veroeffentlichen` sie bekommt.
- Im Trockenlauf landet die Ruhe in `runDir` wie `offers.json`.

**Rückfall:** Fehlt `data/ruhend.json` oder ist sie ungültig, baut der Build ohne Ruhe (Verhalten von heute) und warnt im Bericht. `data:validate` meldet eine ungültige Datei rot.

**ID-Gate** (ADR 0041): Ein Verlust bleibt ein Verlust gegen den Vorstand. Die Ruhe ändert die Definition nicht.

**ADR 0044** (Nummer beim Umsetzen gegen `docs/adr/` prüfen): „Ruhende Angebote, Dubletten und Ortswechsel“.
- Es ergänzt ADR 0022, Punkt 3 (Stufe 2b, Durchgang 2 gegen die Ruhe) und den Nachtrag zu Plan 0043 (Vorgänger auch aus der Ruhe).
- Es ergänzt ADR 0022, Punkt 2 („belegt“ sind Vorstand, Ausgabe und Ruhe) und Punkt 4 (Rückkehr über `key` auch aus der Ruhe).
- Es ergänzt ADR 0031 (gemeinsames Fenster, Überdeckung, ältere Fassung bleibt, Termine außerhalb des Fensters).
- Es ergänzt ADR 0041, Punkt 5 (Erbe auch aus der Dublettenregel) und **Punkt 10** (Review 2, Blocker 2): Der Build-Code darf eine ID mit künftigem Termin verlieren, wenn sie eine verworfene Dublette ist, wenn also ein `sameOfferTwice`-Partner desselben Anbieters mit Vorstands-ID in der Ausgabe steht.
- Unter „Alternativen“ grenzt es die Ruhe von der in ADR 0022 abgelehnten Alias-Liste ab (Review m6): Die Ruhe ist ein Gedächtnis für die Zuordnung, keine Weiterleitung. Eine weggefallene ID zeigt nie auf ein anderes Angebot.
- Nachgezogen werden:
  - `docs/architecture.md`: Invariante „Stabile IDs“ (Ruhe, Stufe 2b), „Ein Datenvertrag“ (`data/ruhend.json` als Pipeline-Zustand), die Import-Zeile der Pipeline (heute Zeile 49);
  - `CLAUDE.md`, Stolperfallen, Daten: `data/ruhend.json` nie von Hand;
  - der Skill `babyevents-nuernberg`: Dateien des Nachtlaufs.

### Nicht-Ziele

- Abruf- und Extraktionslücken beheben (Wolf Pack Yoga, vhs Fürth). Das gehört zur Datenpflege. Ein Eintrag in `docs/ideas.md` hält es fest: „Wächter: Anbieter verliert über Nacht ≥ 50 % seiner Angebote → Hinweis im Bericht“.
- Bestehende falsche `listedAt` korrigieren. `offers.json` wird nie von Hand bearbeitet (ADR 0026). Die heutigen Fehletiketten laufen nach spätestens 14 Tagen aus, die Dubletten aus B4 verschwinden mit dem ersten Nachtlauf nach Etappe 1.
- Die Ruhe in der App zeigen, etwa „pausiert“ statt „gibt es nicht mehr“. Das kommt als Idee nach `docs/ideas.md`.
- Stufe 1 und 2 lockern oder Schwellen senken.

## Nutzerentscheide

- **N1 (E1)**: Bei einer Dublette bleibt die ältere Fassung, die ID der jüngeren fällt weg. Merklisten-Einträge darauf zeigen „gibt es nicht mehr“. Das ist ein bewusster Verlust trotz der harten Regel aus ADR 0041. Die Alternative wäre, Dubletten zu behalten oder eine Weiterleitung einzuführen, die ADR 0022 ablehnt. **Entschieden 2026-11-18: ältere Fassung bleibt.**
- **N2 (E2)**: Ruhezeit 56 Tage. **Entschieden 2026-11-18: 56 Tage.**


## Schritte und Tests

Test-first für die Pipeline-Logik. Kein UI-Anteil, also kein `/browser-review`. Nach jedem Schritt läuft `pnpm verify`. In **Etappe 1** meldet `pnpm e2e:local --affected` für die Pipeline-Pfade „keine Specs“; die Meldung kommt in den Commit-Text (Review m4). In **Etappe 2** ändert Schritt 7 `.github/workflows/nightly.yml` und `tests/fixtures/`. Beide stehen in `FULL` (`scripts/lib/e2e-map.ts`), deshalb läuft dort `pnpm e2e:local --affected` (direkt getroffene Specs plus `app` und `theme`, `run_in_background`). Den Rest prüft die CI (Review 2, Major 6).

**Etappe 1 (E1, E3)**
1. `similar.test.ts`, `stable-ids.test.ts`, `build-offers.test.ts`:
   - Die echten Paare aus dem Befund als kleine Fixtures. **Gleich:**
     - Familienbox 53/37 (Ferienwochen fehlen);
     - Krabbelkäfer 12/37;
     - Passionskirche 28/37;
     - „Eltern-Kind-Gruppe 0–3 Jahre (dienstags)“ / „… 9:30“.
   - **Verschieden:**
     - alle 10 Schwesterpaare der Gegenprobe (Liste im Befund);
     - „Eltern-Kind-Gruppe 0–3 Jahre“ / „… 1–3 Jahre“;
     - gemeinsames Fenster mit nur 2 Terminen;
     - eine Seite ohne Termin ab `from`;
     - eine Reihe gegen einen ihrer Einzeltermine (Verhältnis unter 0,5).
   - Einzeltermin-Paar mit gleichem Beginn: gleich (wie heute); mit verschiedenem Beginn: verschieden (Review 2, Major 3).
   - Termine außerhalb des gemeinsamen Fensters werden übernommen (Review 2, Major 4).
   - Der umgestellte Test „10 gegen die ersten 7“.
   - Der Fall `MiniClub` erst als roter Test, dann die Regel als Nachtrag.
   - Rangfolge der überlebenden Fassung: Vorgänger vor keinem, älteres `listedAt` vor jüngerem, fehlendes vor vorhandenem, kleinere ID. Erbe aus der Dublettenregel trifft in `assignIds`. Richter-Erbe geht vor. Ein Widerspruch ergibt kein Erbe. Die Notiz „(Dublette)“ erscheint.
   - Stufe 2b mit drei Fällen:
     - Faberpark: gleiche ID;
     - zwei Orte mit gleichen Terminen und ein Entwurf am alten Ort: die ID bleibt am gleichen Ort (Gegentest M3);
     - Titel-Widerspruch oder anderer Anbieter: neue ID.
2. `id-continuity.test.ts` bekommt eine **benannte Ausnahme** (Review 2, Blocker 2). Neu einfrieren hilft nicht: Die Fixture stammt aus einem Nachtlauf mit altem Code und enthält beide Fassungen. Die Ausnahme: Eine verlorene ID ist erlaubt, wenn in der Ausgabe ein Angebot desselben Anbieters steht, das mit dem verlorenen Vorstandsangebot `sameOfferTwice` ist und selbst eine Vorstands-ID trägt. Der Test listet solche Fälle in seiner Ausgabe, und jeder steht mit Partner im Commit-Text. Jeder andere Verlust bleibt rot. Dazu ein Test des Tests: ein künstlicher Verlust ohne Partner ist rot. `docs/architecture.md` („Stabile IDs“) nennt die Ausnahme.
3. Messung (Wegwerfskript im Scratch-Verzeichnis, nicht committet, git nur lesend): `buildFromState` auf den Zuständen der letzten 14 Nachtläufe aus git (`data/raw`, Vorstand, `providers.yaml`) mit dem neuen Code. Gezählt werden:
   - verworfene Dubletten (erwartet die 7 aus B4, keine Schwestergruppe);
   - Treffer der Stufe 2b, jeder von Hand angesehen;
   - die Änderung der Zahl „Neu“ am 2026-11-18.

   Das Ergebnis kommt als Abschnitt „Messung Etappe 1“ in diesen Plan.
4. ADR 0044 (Teil E1, E3), Doku, Commit, Push, CI grün. Nach dem nächsten Nachtlauf prüfen: Die Dubletten aus B4 sind weg, `u6msbbr7` steht, `o4xo6513` ist weg.

**Etappe 2 (E2)**

5. `resting.ts` mit Schema, Lesen (mit Rückfall) und Fortschreibung, Tests:
   - neu ruhend;
   - Felder bleiben;
   - nach 56 Tagen weg;
   - ohne künftigen Termin weg;
   - Rückkehr entfernt den Eintrag;
   - `starts` gekappt auf 112 Tage;
   - Eintrag mit Vorstands-ID wird entfernt.
6. `assignIds`, Durchgang 2, und `withListedAt`, Tests:
   - B1: gleiche ID nach 7 Nächten Lücke behält `listedAt`.
   - B2: umformulierter Titel nach Lücke trifft über Stufe 1 bzw. 2 die alte ID samt altem `listedAt`.
   - Kurs mit neuen Terminen nach Lücke: `isNewRun` gilt, also neu.
   - Kein Treffer, wenn der Entwurf in Durchgang 1 „mehrdeutig“ war (Review M2).
   - Rivale aus dem offenen Vorstand verhindert einen Ruhe-Treffer.
   - Eine verworfene Dublette kehrt nicht zurück.
   - Keine Kursfortschreibung bei einem Kurs, der vor `from` ruhte; die Ausgabe ist gültig (Review B3).
   - Vergleichsfenster bis `entry.horizonTo` (Review M1).
   - `key`-Rückkehr bei mehrdeutiger Stufe 0 ergibt die alte ID, nicht Seed 1 (Review m3).
   - `checkIdContinuity` greift für Ruhe → Ausgabe.
   - Eigenschaftstest: Mit leerer Ruhe ist die Ausgabe identisch zu Etappe 1.
7. Aufrufer, `publish.ts` samt Test, Workflow, Biome, `data:validate` samt Fixture, Trockenlauf nach `runDir`. `id-continuity.test.ts` bleibt grün, denn die Ruhe ist in der Fixture leer.
8. Messung wie in Schritt 3, mit Ruhe ab dem 2026-11-04:
   - Zahl „Neu“ am 2026-11-18 (heute 83, erwartet um 55);
   - Treffer aus der Ruhe, jeder von Hand angesehen;
   - Größe von `data/ruhend.json`.

   Eine alte ID auf einem fremden Angebot ist ein Blocker. Liegt die Größe über 300 kB, wird zuerst `RESTING_SPAN_DAYS` gekappt, nicht `RESTING_DAYS`.
9. ADR 0044 (Teil E2), `docs/architecture.md`, `CLAUDE.md`, Skill, `docs/ideas.md`, Verweise in ADR 0022, 0031, 0041 und Plan 0043. `/arch-review` (Schema, neue Datei, > 200 Zeilen), Commit, CI grün. Nach dem nächsten Nachtlauf prüfen:
   - `data/ruhend.json` ist committet;
   - der Bericht nennt „aus der Ruhe“;
   - ein vorher ruhendes Angebot, falls eins zurückkommt, trägt kein neues `listedAt`.

## Risiken

- **Falsche Rückkehr**: Eine ruhende ID trifft ein anderes Angebot desselben Anbieters. Dagegen stehen:
  - dieselben strengen Stufen ohne 2b;
  - der Ausschluss mehrdeutiger Entwürfe;
  - alle Vorstandsangebote als Rivalen;
  - die Messung mit Sichtprüfung;
  - `checkIdContinuity`.
- **Verlorene Dubletten-IDs** (N1): Merklisten-Einträge der jüngeren Fassung zeigen „gibt es nicht mehr“. Laut Befund war sie meist erst wenige Tage alt.
- **Gemeinsames Fenster zu locker**: Parallelgruppen mit gleichem Kerntitel im selben Raum, die drei Termine teilen, würden verschmolzen. Dagegen stehen `compatibleAge`, der gleiche Ort, die Ziffern im Titelvergleich und die Gegenprobe.
- **Größe der Ruhe**: Sie ist durch die Kappung begrenzt. Notfalls wird `RESTING_SPAN_DAYS` gesenkt; das kostet nur Vergleichstermine, nicht die Ruhezeit.
- **Start mit leerer Ruhe** (Review 2, Minor 14): Die Ruhe füllt sich erst ab dem ersten Nachtlauf nach Etappe 2. Lücken davor deckt sie nicht. Die Messung in Schritt 8 mit Ruhe ab dem 2026-11-04 fällt deshalb besser aus als die ersten Wochen im Betrieb.
- **Unterschiedliche Ruhe in Gate und Build**: Das wäre ein stiller Unterschied bei `listedAt` und Verlusten. Beide lesen deshalb dieselbe Datei einmal am Anfang des Builds (wie `generatedAt`, `io/nightly.ts`).

## Review (2026-11-18) – Verdict: Überarbeiten → eingearbeitet

Alle Punkte übernommen:
- **B1** Veröffentlichen: `NIGHTLY_PATHS`, Artefaktliste, Test und Trockenlauf (E2, „Veröffentlichen“; Schritt 7).
- **B2** Die Zusage „Fixture bleibt“ ist gestrichen. Etappe 1 darf Dubletten-IDs verlieren, nur mit Neueinfrieren und Nennung im Commit; jeder andere Verlust ist ein Blocker (Schritt 2). Etappe 2 lässt die Fixture unberührt.
- **B3** Keine Kursfortschreibung bei Treffern aus der Ruhe, mit Test (E2, Zuordnung; Schritt 6).
- **M1** `horizonTo` je Eintrag, Fenster und `isNewRun` damit (E2).
- **M2** Rivalen sind alle Vorstandsangebote, mehrdeutige Entwürfe nehmen nicht an Durchgang 2 teil (E2).
- **M3** Der Ortswechsel ist eine eigene Stufe 2b nach Stufe 2, mit Gegentest (E3).
- **M4** Abbildung Kandidat → Vorstand, Rangfolge, Erbe und Notiz „(Dublette)“ festgelegt; ADR-0041-Bezug (E1.3).
- **M5** N1 und N2 hat der Nutzer am 2026-11-18 entschieden (siehe Nutzerentscheide).
- **M6** Jeder Aufrufer ist einzeln geregelt, das Gate bekommt dieselbe Ruhe (E2, „Aufrufer“).
- **M7** Biome-Ausnahme, `data:validate`, Schema unter `scripts/pipeline/lib/`, Architekturzeile (E2).
- **M8** Kompaktes Format mit `berlinKey`, Kappung auf 112 Tage, Größe geschätzt (E2).
- **m1** Ziffern bleiben im Titelvergleich, Uhrzeit ist definiert, `conflictingLabels` gilt weiter (E1.2).
- **m2** Fenster symmetrisch, der kippende Test ist benannt (E1.1).
- **m3** `key` je Eintrag, damit Rückkehr ohne Seed-Wechsel; Einträge mit Vorstands-ID entfallen (E2).
- **m4** `pnpm verify` je Schritt, `--affected`-Meldung im Commit, Messskript nur im Scratch-Verzeichnis (Schritte).
- **m5** Zwei Etappen (Entscheidungen, Schritte).
- **m6** Abgrenzung zur Alias-Liste im ADR (E2, ADR 0044).

## Review 2 (2026-11-18) – Verdict: Überarbeiten → eingearbeitet

B1, B3 und M1–M7 aus Review 1 gelten als gelöst. Alle neuen Punkte sind übernommen:
- **Blocker 1** Familienbox: Die Nachrechnung bestätigt Jaccard 0,73 im Fenster und Überdeckung 1,0. E1.1 nutzt deshalb die Überdeckung mit Mindestverhältnis 0,5, der Befund ist korrigiert.
- **Blocker 2** Benannte Ausnahme in `id-continuity.test.ts` statt Neueinfrieren. ADR 0044 ändert ADR 0041, Punkt 10 (Schritt 2).
- **Major 3** Mindestzahl ist min(3, |A|, |B|), Einzeltermine bleiben vergleichbar, mit Test.
- **Major 4** Termine der verworfenen Fassung außerhalb des Fensters werden übernommen, mit Test.
- **Major 5** Kippende Tests sind aufgezählt.
- **Major 6** E2E in Etappe 2 über `--affected`.
- **Minor 7** Dubletten-Erbe nur bei `keepId === undefined`.
- **Minor 8** Zwillingstreffer werden nach der Rangfolge aus E1.3 gewählt.
- **Minor 9** Eigener Writer, Größe wird gemessen.
- **Minor 10** I/O in `io/files.ts`, `offers.json` und Ruhe nur gemeinsam.
- **Minor 11** Berliner Kalendertage, Rückwandlung über `fromBerlinLocal`.
- **Minor 12** Schwesterpaare aufgelistet, ADR 0022 Punkt 2 und 4, drei Gate-Builds über die Closure, `pflege.ts` richtiggestellt.
- **Minor 13** Indexmenge statt Notiztext.
- **Minor 14** Leere Ruhe beim Start unter Risiken.

Kein offener Blocker. Laut `/plan-review` gibt es höchstens zwei neue Reviews, deshalb folgt keine dritte Runde. Die Messungen in Schritt 3 und 8 sind die Kontrolle, und `/arch-review` folgt bei der Umsetzung.
