# Plan 0038 – Stabile IDs nachschärfen: Dubletten gleicher Quelle, Gleichstand unter Zwillingen, veränderte Terminreihen

Status: abgeschlossen, live seit 0cc9c62 (2026-10-17)
Datum: 2026-10-16
Bezug:
- ADR 0022 (stabile IDs), Punkt 3 (Zuordnung gegen den Vorstand) und „Alternativen“ (Zusammenlegungen); wird durch ADR 0031 (neu, Datei `0031-stabile-ids-dubletten-und-terminreihen.md` in `docs/adr/`) ergänzt
- ADR 0004 (Schwellen nur mit Begründung im Code und im Commit)
- Plan 0032, E4 (Vereinigen der Teile, `mergeParts` in `scripts/pipeline/lib/split.ts`)
- `docs/architecture.md`, Invariante „Stabile IDs“

## Anlass

Nutzer am 2026-10-16, nach der Auswertung der Nachtläufe 13.–16.10.: Die Zuordnung soll IDs halten, die sie heute verliert („1 bitte“, dann „Ja“ zum Plan).

Gemessen an den Ständen von `data/offers.json` auf `main`:

| Wechsel | Vorstand | IDs gehalten | weggefallen |
|---|---|---|---|
| `a6ed8c5` → `4ace9a7` (Nachtlauf 13.10.) | 498 | 449 | 49 |
| `61bc10e` → `ecfce2c` (Nachtlauf 16.10.) | 483 | 398 | 85 |

Eine weggefallene ID bricht geteilte Links (`a/<id>/`), leert still Merklisten-Einträge, erzeugt Kalender-Duplikate und meldet bekannte Angebote in der Wochen-Nachricht als neu (ADR 0022, Kontext).

Ursachen der 134 Verluste (je weggefallene ID gegen die neuen IDs desselben Anbieters verglichen):

| | Ursache | IDs |
|---|---|---|
| U1 | **Dubletten gleicher Quelle im Vorstand.** Der Build lässt zwei Fassungen desselben Angebots aus derselben Rohdatei stehen (z. B. „PEKiP Fr 09:30 (Babys geb. Jan.–März 2026)“ und „PEKiP-Gruppe (Babys geb. Jan.–März 2026, Freitag)“, identische Termine). Fasst ein späterer Lauf sie zu einem Entwurf zusammen, passen beide alten IDs gleich gut, Stufe 1 verlangt aber einen strikt besten Partner (`stable-ids.ts`, Schleife „Stufe 1“) → **beide** IDs fallen weg. Dasselbe umgekehrt, wenn der neue Lauf zwei Fassungen liefert. Am 13.10. standen 38 Gruppen mit identischen Terminen in `data/offers.json`, am 16.10. 30. | 42 in 24 Gruppen |
| U2 | **Terminreihe gewachsen oder geschrumpft.** Titel ähnlich, Uhrzeit gleich, aber Stufe 1 (≥ 80 % gleiche Beginnzeiten, Jaccard) und Stufe 2 (≥ 50 % gleiche Tage, Jaccard) greifen nicht: Wassermäuse (bisher nur der Starttermin, jetzt die Reihe; 3–4 % gleiche Tage), Post-SV (Ferienwochen fallen weg, 72 % gleich; Stufe 2 mehrdeutig, weil „Babyschwimmen Fr 10:45“ und „Fr 11:15“ dieselben Tage haben), Ev. Fischbach. | ≈ 20 |
| U3 | **Format kippt** zwischen `kurs` und `regelmaessig` bei gleichem Angebot; Stufe 2 verlangt gleiches Format (Ritterbad, Studio Herzschlag Outdoor-Fitness, St. Georg). Nicht Teil dieses Plans (Nicht-Ziele). | 5 |
| – | Zu Recht weg: Musikschule Fürth „Maxis“ (über 3 Jahre, jetzt gefiltert, 14), Sternenhaus-Vorstellungen mit anderen Daten (≈ 30), Angebote ohne Nachfolger. | ≈ 60 |

### Ursache der Dubletten (U1)

- `mergeParts` vereinigt nur Events aus **verschiedenen** Teilen und nur bei gleicher „Form“ (`shape`: Ort, Format, Alter, erster Termin, Wochentage). Die gemessenen Dubletten unterscheiden sich im Alter (Modell: `0–12` gegen `7–10` Monate) oder in der Schedule-Art (`weekly` gegen `dates`), oder sie stehen im selben Teil (dort bleibt laut Kommentar alles, wie es das Modell liefert).
- Der Build entfernt Dubletten über den Titel nur gegen eine **ranghöhere** Quelle (`build-offers.ts`, Schritt 4: `h.rank < low.rank`). Zwei Fassungen aus derselben Rohdatei haben denselben Rang.
- `similarTitle` taugt dafür nicht: Es zählt Wochentage und Füllwörter wie „Lebensjahr“, „Monat“, „Wochen“ als Schlüsselwort. „BabySinne (9–15 Monate), Dienstag 9:30“ und „Kleinkindturnen (12–36 Monate), Dienstag 9:30“ der Familienbox (echte Parallelkurse, gleiche Zeit) gelten als ähnlich.

## Ziel

Der Build liefert keine Dubletten gleicher Quelle mit gleichem Format und gleichem Kerntitel mehr, und die Zuordnung hält die ID eines Angebots, wenn
- der Vorstand es doppelt führte und der Lauf es einmal liefert (auch wenn sich zugleich die Terminreihe ändert),
- seine Terminreihe länger oder kürzer wird, der erste Termin bzw. die Uhrzeit und der Titel aber passen.

Gemessen am Rückspiel (Abschnitt „Verifikation“): weggefallene IDs 49 → 43 und 85 → 68, und keine alte ID wechselt zu einem anderen Angebot.

## Nicht-Ziele

- **Format-Lockerung in Stufe 2** (`kurs` ↔ `regelmaessig`, U3): hält im Rückspiel nur 3 weitere IDs, verlangt eine zweite Abweichung von ADR 0022 und einen geänderten Test. Kommt beim Archivieren nach `docs/ideas.md` (Review 1, m7).
- **Extraktion stabiler machen** (Titel, Format, Anmeldung, Kosten wechseln von Lauf zu Lauf; Sternenhaus-Vorstellungen fehlen; Wassermäuse-Reihe bis Oktober 2027 statt bis zum nächsten Kurs). Kommt beim Archivieren nach `docs/ideas.md`.
- **Dubletten über verschiedene Formate** (z. B. FBS „Abenteuerturnen 1“ einmal als `kurs`, zugleich als drei `einmalig`). E1 verlangt gleiches Format; Rest in `docs/ideas.md`.
- **Dubletten mit leerem Kerntitel** (Ev. Langwasser „MiniClub Eltern-Kind-Gruppe (Mo 15–17 Uhr)“: nur Füllwörter; CVJM „Mini-Club Dienstagvormittag“). Bleiben, Rest in `docs/ideas.md`.
- **Aliasse oder Weiterleitung** einer verlorenen ID auf die überlebende (ADR 0022, Punkt 3: „Zusammenlegungen … gibt es nicht“). Bleibt so: Bei U1 behält eine der alten IDs das Angebot, die andere fällt weg.
- Keine Änderung an `src/`, `data/`, Schema, UI oder E2E. Die Wirkung kommt mit dem nächsten Nachtlauf.

## Entscheidungen

### E1 Dubletten gleicher Quelle im Build (`scripts/pipeline/lib/build-offers.ts`)

Neuer Schritt **4b** direkt nach Schritt 4 („Dubletten über Titel hinweg“), als exportierte reine Funktion `dropSameSourceDuplicates(candidates, previousWindowKeys, from)`, die `buildOffers` auf `kept` aufruft und der Test direkt prüft (Review m5: Testdateien sind Einstiege für knip, `knip.jsonc`). Dafür wird der Typ `Candidate` exportiert. Die Funktion verändert ihre Eingabe nicht und liefert `{ kept, notes }`.

- Zwei Kandidaten gleichen Rangs (`rank`) sind Dubletten gleicher Quelle, wenn `sameOfferTwice(a, b, from)` gilt. Das Prädikat steht in `stable-ids.ts` (exportiert) und gilt **gleich** für die Zwillinge in E2 (Review 3, Major 2):
  1. gleicher `providerId`, gleicher `venueId`, gleiches `format`,
  2. verträgliches Alter (`compatibleAge`, E4): gleich, auf einer Seite ohne `age`, oder ein Bereich liegt ganz im anderen (gemessen: `0–12` und `7–10` Monate). Zwei Parallelgruppen mit überlappendem, aber nicht enthaltenem Alter (`9–15` / `12–36`) bleiben beide (Review 1, M2, wie `mergeParts`, `split.ts`),
  3. `sameCoreTitle(a.title, b.title)` (E4),
  4. Jaccard der Beginnzeiten auf die Minute über die Termine ab `from` (= `horizon.from` des Laufs; vergangene Kurstermine zählen nicht, Review 3, Minor 6) ≥ `SAME_SOURCE_SESSIONS`.
- **`SAME_SOURCE_SESSIONS = 0.8`**, eigene Konstante in `stable-ids.ts` mit Kommentar (ADR 0004; Review 1, m3; Review 3, Minor 5): gleicher Wert wie `SAME_SESSIONS`, weil bis zu 20 % abweichende Termine bei derselben Quelle fast immer herausgenommene Ferientage sind; bewusst entkoppelt, damit eine Änderung der Zuordnung nicht still das Löschen ändert. Eine Konstante für E1 und E2, weil beide dieselbe Frage stellen („ein Angebot in zwei Fassungen?“).
- **Ablauf** (Review 2, Punkt 8; Review 1, m2): Die Kandidaten werden sortiert, zuerst die, deren `windowKey` (`stable-ids.ts`, mit `horizon.from` des Laufs) im Vorstand vorkommt (`previousWindowKeys`), dann nach `order`. Gierig in dieser Reihenfolge: Ein Kandidat entfällt, wenn ein schon behaltener ihm doppelt ist; sonst wird er behalten. Ketten (A ~ B, B ~ C, A ≁ C) sind damit eindeutig: Es bleiben A und C, wenn A vorn steht. Der überlebende Titel springt so nicht mit der Reihenfolge des Modells zwischen den Nächten.
- Der Bleibende behält Titel, Kategorie (samt `derivedCategory` des Kandidaten, Plan 0037), Termine und alle übrigen Felder; nur `topics` werden vereinigt (`unionTopics`, wie Schritt 4). Keine Vereinigung der Termine: Die abweichenden Termine sind meist Ferientage, die eine Fassung schon herausgenommen hat.
- Bericht: `${low.label}: Dublette von ${high.label} (gleiche Quelle, gleiche Termine) – entfällt` in `notes`.

Gemessen auf `ecfce2c`: 8 Paare (FBS Abenteuerturnen 2, FBS PEKiP 2, Geburtshaus Rückbildung 4); Familienbox-Parallelkurse bleiben getrennt. `tests/fixtures/offers.json`: keine Änderung.

### E2 Gleichstand unter Zwillingen des Vorstands (`scripts/pipeline/lib/stable-ids.ts`)

- Zwei alte Angebote sind **Zwillinge**, wenn `sameOfferTwice(a, b, horizon.from)` gilt (E1). Mit gleichem Format und derselben Terminbasis: Zwei Fassungen, die E1 nicht zusammenführt (z. B. `kurs` und `regelmaessig`), sind keine Zwillinge und behalten beide ihre ID, wenn beide weiter geliefert werden (Review 3, Major 2).
- **Rangfolge unter Zwillingen** zu einem Entwurf: höhere Titelähnlichkeit `ratio(alt.title.toLowerCase(), entwurf.title.toLowerCase())` (aus `similar.ts`; kleingeschrieben wie in `similarTitle`, Review 2, Punkt 9), bei Gleichheit die kleinere ID.
- **Stufe 1:** Ein Rivale `q` zählt beim Paar `(pi, di)` nicht, wenn `q.di === di`, `q.t === t`, `q.pi` und `pi` Zwillinge sind und `pi` nach der Rangfolge vor `q.pi` steht. So trifft genau einer der Zwillinge.
- **Verbrauchte Zwillinge** (Review 1, B1; Review 2, Blocker 1): Ein altes Angebot, dessen Zwilling in irgendeiner Stufe zugeordnet ist, ist verbraucht. Es fällt aus der Menge der offenen alten Angebote, und zwar für jeden weiteren Durchgang der Schleife von Stufe 1, für die Hinweise „mehrdeutig in Stufe 1“ und für Stufe 2. Umgesetzt als eine Funktion `openOlds()` (= `free(P, partnerOfOld)` ohne verbrauchte), die alle diese Stellen statt `free(P, partnerOfOld)` nutzen. Sonst träfe der unterlegene Zwilling im nächsten Durchgang oder in Stufe 2 eine Schwestergruppe, sobald sein Partner deren Rivale nicht mehr ist, und eine alte ID zeigte still auf ein anderes Angebot. Das gilt auch nach einem Treffer in Stufe 0, der mit E1 der Normalfall wird.
- **Stufe 2** (Review 2, Punkte 2 und 3): Zuerst werden alle Vorschläge bestimmt, dann angewendet. Sind in der Gegenrichtung alle Kandidaten eines Entwurfs untereinander Zwillinge, zählt nur der erste nach der Rangfolge (sonst fielen bei Zwillingen, deren Reihe sich zugleich ändert, beide IDs weg). Haben zwei Zwillinge je einen Vorschlag an **verschiedene** Entwürfe, fallen beide Vorschläge weg („mehrdeutig in Stufe 2“, Review 3, Major 4): Die Zwillinge sind ein Angebot, also ist einer der Entwürfe etwas anderes, und welcher, lässt sich nicht sicher sagen. Entschieden wird auf der ursprünglichen Menge der Vorschläge, auch bei Ketten (A ~ B ~ C); so hängt das Ergebnis nicht von der Reihenfolge der Schleife ab. In der Gegenrichtung zuerst über die Uhrzeit verengen (E3), dann unter Zwillingen auflösen (Review 3, Minor 8).
- Bericht: `IDs: Zwilling im Vorstand – <verlierer-id> „…“ fällt weg, <gewinner-id> „…“ bleibt` in `notes`.
- Nur auf der Seite des Vorstands. Mehrere gleich gute **Entwürfe** bleiben mehrdeutig; die entstehen nach E1 nur noch bei verschiedenen Formaten.
- Abgrenzung zu ADR 0022 („Gleichstand heißt kein Treffer“, Zusammenlegungen „ordnen in den gemessenen Fällen (Schwestergruppen mit gleichen Terminen) falsch zu“): Schwestergruppen mit gleichen Terminen haben verschiedene Kerntitel (Tests „vertauscht nie“ und „Review B2“ mit Pikler / Musikalische Früherziehung) und sind keine Zwillinge. Zwillinge sind ein Angebot in zwei Fassungen; welche ID überlebt, ändert nichts daran, worauf ein alter Link zeigt.

### E3 Stufe 2: gleicher erster Termin, Uhrzeit bei Mehrdeutigkeit (`stable-ids.ts`)

`stage2(pi, di)` gilt künftig, wenn gleicher Anbieter, gleicher Ort, gleiches Format (unverändert), `similarTitle` (unverändert), **keine widersprechenden Kennungen** (`conflictingLabels`, E4: Gruppenkennung oder Zeitraum; Review 3, Major 3: sonst ginge die ID von „Babyschwimmen 1 (Fr 10:45)“ an „Babyschwimmen 2“, das auf 10:45 umzieht) und
- Jaccard der Tage ≥ `SAME_DAYS` (unverändert) **oder** gleicher erster Termin im Vergleichsfenster (Beginn auf die Minute). Die zweite Bedingung gilt nur, wenn **beide** Seiten mindestens einen Termin im Fenster haben (Review M3; sonst träfen zwei leere Seiten). Sie fängt die gewachsene oder geschrumpfte Reihe (Wassermäuse: alter Einzeltermin 29.11. 13:30 = erster Termin der neuen Reihe).
- **Mehrdeutigkeit:** Hat ein altes Angebot mehrere Kandidaten, bleiben die mit gemeinsamer Uhrzeit (Menge der Berliner Uhrzeiten der Termine im Fenster, `berlinKey(start).slice(9)` aus `src/domain/time.ts`, Form `HHmm`; Review 2, Punkt 10; „gemeinsam“ heißt mindestens eine gleiche Uhrzeit, keine Schwelle). Bleibt genau einer, ist er der Kandidat; sonst wie heute „mehrdeutig in Stufe 2“. Dieselbe Verengung gilt für die Gegenrichtung (alle offenen alten Angebote zu diesem Entwurf), und der Treffer zählt nur, wenn beide Richtungen auf dasselbe Paar zeigen.
- Die Uhrzeit ist bewusst **keine** Bedingung, sondern nur Entscheider: Stufe 2 soll eine neue Uhrzeit weiter zulassen (Test „hält die ID bei neuer Uhrzeit“).

### E4 Kerntitel und Alter (`scripts/pipeline/lib/similar.ts`)

Neue Exporte; `similarTitle` bleibt unverändert (es dient `mergeParts`, der Eval-Bewertung und der Zuordnung, wo es absichtlich großzügig ist). Ein Kommentar in `similar.ts` sagt, wofür welcher Vergleich gilt.

- `coreWords(title): string[]` in Titelreihenfolge: Wörter aus `[a-zäöüß]{4,}` (kleingeschrieben), ohne die Füllwörter von `keywords` (`GENERIC`) und ohne
  - Kalenderwörter: Wörter, die mit einem Wochentag beginnen (`/^((mon|diens|donners|frei|sams|sonn)tag|mittwoch)/`, also auch „dienstags“, „Dienstagvormittag“), Monatsnamen samt `sept`, `febr`, dazu `vormittag(s)`, `nachmittag(s)`, `abend(s)`;
  - weitere Füllwörter (Review M1): `ohne`, `monat`, `monats`, `lebensjahr(es)`, `woche(n)`, `herbst`, `winter`, `frühjahr`, `frühling`, `sommer`, `ausgebucht`, `start`, `beginn`, `block`, `einheiten`, `termine`.
- `sameCoreTitle(a, b)`: wahr, wenn
  1. beide ein erstes Kernwort haben,
  1b. **Namensregel** (Review 3, Major 1): Ist auf beiden Seiten das Wort direkt nach dem ersten Kernwort (nächstes Token aus `[a-zäöüß]+`) selbst ein Kernwort und sind die beiden verschieden, sind die Titel nicht gleich („Spielgruppe Mäuse“ ≠ „Spielgruppe Bären“). „Rückbildung mit …“, „Mini-Club Passionskirche (Do …“ und „… Säuglinge, Donnerstag …“ bleiben gleich, weil dort ein Nicht-Kernwort folgt, und
  2. die ersten Kernwörter gleich sind **oder** eines das andere als Anfang hat und der Rest ein Füllsuffix ist (`/^(s?kurs|s?gruppe|s?treff|zeit)$/`: „rückbildung“ / „rückbildungskurs“; nicht „kleinkind“ / „kleinkindturnen“) und
  3. keine widersprechende Gruppenkennung vorliegt und
  4. kein widersprechender Zeitraum (Review 2, Punkt 5): Monatsnamen und Jahreszeiten im Titel (`jan`, `januar`, `feb`, `febr`, `februar`, `mär`, `märz`, `apr`, `april`, `mai`, `jun`, `juni`, `jul`, `juli`, `aug`, `august`, `sep`, `sept`, `september`, `okt`, `oktober`, `nov`, `november`, `dez`, `dezember`, `herbst`, `winter`, `frühjahr`, `frühling`, `sommer`), je auf die ersten drei Buchstaben gekürzt. Nennen beide Titel welche und sind die Mengen verschieden, sind sie nicht gleich: „PEKiP … (Geb. Juni–Aug. 2026)“ ≠ „PEKiP … (Geb. Mai–Juli 2026)“, aber „geb. Jan.–März“ = „geb. Januar–März“. Die Monate bleiben dabei keine Kernwörter.
- **Gruppenkennung** (Review 1, m4; Review 3, Minor 9): Treffer von `/(?:^|[\s(])([A-F]|I{1,3}|[1-9])(?=$|[\s)]|,(?!\d))(?![-–.:\/])(?!\s*(?:[-–]\s*\d|[Mm]onat|[Mm]on\b|[Jj]ahr|J\.|[Ww]ochen|Uhr|bis|[Tt]ermin|[Ee]inheit))/g` (ohne Flag `i`: nur große Buchstaben sind Kennungen), als Menge. Haben beide Titel Kennungen und sind die Mengen verschieden, sind sie nicht gleich. Fehlt sie auf einer Seite, entscheidet sie nicht. Beispiele: „Gruppe A, Di 9:30“ → `A`; „Abenteuerturnen 1 (1–3 J.)“ → `1` (die `1` in „(1–3“ nicht); „1,5 Jahre“, „3 bis 6 Monate“, „ab 8 Monaten“, „1 – 3 Jahre“ → keine; „Babyschwimmen 2 – Fortgeschrittene“ → `2` (Review 2, Punkt 6); „Turnen (6 Termine)“, „ab 3 Mon“ → keine.
- `conflictingLabels(a, b)`: Teile 3 und 4 von `sameCoreTitle` als eigener Export, für Stufe 2 (E3).
- `compatibleAge(a?, b?)`: wahr, wenn eine Seite kein `age` hat oder ein Bereich ganz im anderen liegt.

Am Prototyp geprüft: alle Positiv- und Negativfälle aus Test 1–3 richtig.

### E5 ADR 0031 und Doku

- **ADR 0031** „Stabile IDs: Dubletten gleicher Quelle und veränderte Terminreihen“: Entscheidung E1–E4, Kontext (Messung oben), Alternativen:
  - Gleichstand weiter ohne Treffer lassen: verliert bei jeder zusammengeführten Dublette alle IDs.
  - Überdeckung der Termine statt erstem Termin (Anteil am kleineren Angebot ≥ 0,9): im Rückspiel 4 IDs weniger, weil eine überlange Reihe mehrere alte Einzeltermine überdeckt und mehrdeutig wird.
  - Uhrzeit als Bedingung in Stufe 2: bräche „neue Uhrzeit, gleiche Gruppe“.
  - `similarTitle` selbst verschärfen: änderte `mergeParts` und die Eval-Bewertung mit.
  - Format-Lockerung: vertagt (Nicht-Ziele).
  Konsequenzen: eine der Zwillings-IDs fällt weiter weg; mehr Treffer in Stufe 2, jeder mit beiden Titeln im Bericht; `predictOffers` (`eval-score.ts`) baut über `buildOffers`, die Eval-Messung verschiebt sich also um die entfernten Dubletten (Review m5).
- ADR 0022: Statuszeile um „Ergänzt durch ADR 0031 (Punkt 3: Gleichstand unter Zwillingen, Stufe 2)“ erweitern.
- `docs/architecture.md`, Invariante „Stabile IDs“: Halbsatz „drei Stufen, im Zweifel eine neue ID“ um „Zwillinge des Vorstands nach ADR 0031“ ergänzen; Zeile zu `scripts/pipeline/lib/` unverändert (kein neues Modul).
- **Plan 0037, Stufe C** ändert `build-offers.ts` ebenfalls (`derivedCategory`, Schritt 7; Review 2, Punkt 11). Wer zuerst auf `main` landet, bleibt; der andere Plan rebased auf diesen Stand. E1 hängt nur an `kept` und lässt `derivedCategory` des Bleibenden unberührt.
- Kommentare in `stable-ids.ts` (Kopf, Stufe 1, Stufe 2) und `build-offers.ts` (Schritt 4b) mit Verweis auf ADR 0031; `split.ts`, Kommentar zu `mergeParts` („Anders als die Dublettenprüfung des Builds (nur rangniedere Quellen)“) auf Schritt 4b anpassen.
- `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“ (beim Archivieren): die Nicht-Ziele 1–4.

## Dateien

| Datei | Änderung |
|---|---|
| `scripts/pipeline/lib/similar.ts` | `coreWords`, `sameCoreTitle`, `conflictingLabels`, `compatibleAge` (E4) |
| `scripts/pipeline/lib/similar.test.ts` | Tests 1–4 ergänzen |
| `scripts/pipeline/lib/build-offers.ts` | Schritt 4b, `dropSameSourceDuplicates`, Export von `Candidate` (E1) |
| `scripts/pipeline/lib/build-offers.test.ts` | Tests 5–8, 17 |
| `scripts/pipeline/lib/stable-ids.ts` | `sameOfferTwice`, `SAME_SOURCE_SESSIONS` (E1), E2, E3 |
| `scripts/pipeline/lib/stable-ids.test.ts` | Tests 9–16; kein bestehender Test geändert |
| `scripts/pipeline/lib/split.ts` | nur Kommentar |
| ADR 0031 in `docs/adr/` | neu (E5) |
| `docs/adr/0022-stabile-ids.md`, `docs/architecture.md` | Verweise (E5) |

## Tests (test-first, je zuerst rot)

Alle Fälle synthetisch nach dem Muster der bestehenden Tests (`draft`, `old`, `at`, `weekly` in `stable-ids.test.ts`); Titel nach den gemessenen Fällen, aber fiktiv bzw. mit den Fixture-Anbietern (`turnverein-beispiel`).

`similar.test.ts`:
1. `sameCoreTitle` wahr: „PEKiP (geb. Jan.–März 2026), freitags 9:30“ / „PEKiP-Gruppe (Babys geb. Jan.–März 2026)“; „Abenteuerturnen 1 (1–3 Jahre mit Eltern)“ / „Abenteuerturnen 1 (1–3 Jahre) – Fr 13.11.“; „Rückbildung mit/ohne Baby – Abendkurs“ / „Rückbildungskurs mit Katrina, donnerstags 17:20–19“; „Mini-Club Passionskirche (Do 9:00–10:30 Uhr)“ / „Mini-Club Passionskirche (Donnerstag 9–10:30 Uhr)“.
2. `sameCoreTitle` falsch: „BabySinne (9–15 Monate), Dienstag 9:30“ / „Kleinkindturnen (12–36 Monate), Dienstag 9:30“; „Babyturnen (8–15 Monate)“ / „PEKiP (Babys im ersten Lebensjahr)“; „Spielgruppe (1. Lebensjahr)“ / „Musikgarten (1. Lebensjahr)“; „Kleinkind-Musik“ / „Kleinkindturnen“; „Babyschwimmen ab 4. Monat“ / „Babymassage ab 4. Monat“; „Spielgruppe Mäuse (Di 9:30)“ / „Spielgruppe Bären (Di 9:30)“; „Eltern-Kind-Turnen (Igel)“ / „Eltern-Kind-Turnen (Bären)“; leere Kernwörter („MiniClub Eltern-Kind-Gruppe (Mo 15–17 Uhr)“).
3. Gruppenkennung und Zeitraum: „PEKiP Gruppe A (Di 9:30)“ / „PEKiP Gruppe B (Di 9:30)“ falsch; „PEKiP Gruppe A, Di 9:30“ / „PEKiP Gruppe B, Di 9:30“ falsch; „Babyschwimmen 2 (ab 8 Monaten)“ / „Babyschwimmen 1 (ab 8 Monaten)“ falsch; „Babyschwimmen 2 – Fortgeschrittene“ / „Babyschwimmen 1 – Anfänger“ falsch; „Babyschwimmen (3–12 Monate)“ / „Babyschwimmen 2 (ab 8 Monaten)“ wahr; „Turnen (1,5 Jahre)“ / „Turnen (3 bis 6 Monate)“ wahr; „Abenteuerturnen 1 (1 – 3 Jahre)“ / „Abenteuerturnen (1–3 Jahre)“ wahr; „PEKiP-Gruppe Babys 3–5 Mon. (Do 11:15, Geb. Juni–Aug. 2026)“ / „… Geb. Mai–Juli 2026)“ falsch; „PEKiP (Babys geb. Jan.–März 2026)“ / „PEKiP (Babys geb. Januar–März 2026) · Fr 9:30“ wahr; „Turnen (6 Termine)“ / „Turnen“ wahr.
4. `compatibleAge`: `0–12` / `7–10` wahr; `9–15` / `12–36` falsch; eine Seite ohne Alter wahr.

`build-offers.test.ts` (über `dropSameSourceDuplicates` direkt und einmal über `buildOffers` mit einer Rohdatei):
5. Zwei Events gleicher Quelle, gleicher Ort, gleiches Format, verträgliches Alter, gleicher Kerntitel, gleiche Termine → ein Angebot, das frühere bleibt, Themen vereinigt, Hinweis „gleiche Quelle, gleiche Termine“.
6. Steht der `windowKey` des späteren im Vorstand, bleibt das spätere. Kette A ~ B ~ C mit A ≁ C → A und C bleiben. Die Eingabe ist danach unverändert.
7. Parallelkurse mit gleichen Terminen bleiben beide bei: verschiedenem Kerntitel; benannten Gruppen („Spielgruppe Mäuse“ / „Bären“); verschiedener Gruppenkennung; Alter `9–15` / `12–36` (Review M2); verschiedenem Format; verschiedenem Rang (das bleibt Schritt 4).
8. Schwelle: Termine ab `from` zu 80 % gleich → zusammengeführt, knapp darunter nicht; `SAME_SOURCE_SESSIONS` ist 0,8. Ein laufender Kurs mit und ohne vergangene Termine wird zusammengeführt.

`stable-ids.test.ts`:
9. E2: Vorstand mit zwei Zwillingen (gleiche Termine, „PEKiP Fr 9:30 (geb. Jan.–März)“ / „PEKiP-Gruppe (geb. Jan.–März, freitags)“), ein Entwurf „PEKiP-Gruppe (Babys geb. Jan.–März)“ → behält die ID des titelähnlicheren Zwillings; Hinweis „Zwilling im Vorstand“; der andere ist weggefallen.
10. E2, gleiche Titelähnlichkeit → die kleinere ID; unabhängig von der Reihenfolge von Vorstand und Entwürfen.
11. Verbrauchte Zwillinge, Stufe 2: Zwillinge A und B wie in Test 9, dazu ein neuer Entwurf „PEKiP (geb. Apr.–Juni), Fr 11:15“ an denselben Tagen. A oder B behält das Angebot; der unterlegene Zwilling bekommt **nicht** den neuen Entwurf, der bekommt eine neue ID (Review 1, B1). Dasselbe, wenn einer der Zwillinge in Stufe 0 trifft.
11b. Verbrauchte Zwillinge, Stufe 1 (Review 2, Blocker 1): dieselben Zwillinge mit den Terminen S, Entwürfe d1 (Fassung desselben Angebots, Termine S) und d2 (Parallelkurs mit anderem Kerntitel, aber `similarTitle`-ähnlich, 90 % von S). Erwartung: d1 hat eine der Zwillings-IDs, d2 eine neue ID. Einmal mit d1 im gleichen Fensterschlüssel wie A (Treffer in Stufe 0), einmal mit neuem Titel (Treffer in Stufe 1).
11d. Zwei Fassungen werden weiter beide geliefert, als `kurs` und `regelmaessig`, eine davon umbenannt → beide IDs bleiben (keine Zwillinge; Review 3, Major 2).
11e. Zwillinge mit Vorschlägen an verschiedene Entwürfe in Stufe 2 → beide mehrdeutig, keine ID wandert (Review 3, Major 4).
11c. Zwillinge mit veränderter Reihe (Review 2, Punkt 2): Zwillinge A und B, ein Entwurf mit demselben ersten Termin, aber nur 40 % der Tage → eine der Zwillings-IDs (Stufe 2), nicht beide weg.
12. E2 greift nicht bei Schwestergruppen und nicht bei unverträglichem Alter: die bestehenden Tests „vertauscht nie …“ und „… (Review B2)“ bleiben unverändert grün; dazu Zwillinge mit `9–15` / `12–36` Monaten → weiter mehrdeutig.
13. E3, gleicher erster Termin (innerhalb von `HORIZON` des Tests, 05.10.2026–05.02.2027; Review 2, Punkt 7): Vorstand „Babyschwimmen, Start 08.11.“ als `kurs` mit einem Termin, Entwurf „Babyschwimmen (So ab 08.11.)“ als `kurs` mit acht Terminen ab demselben Beginn → ID gehalten (Stufe 2); ein zweiter alter `kurs` „Start 10.01.“ mit seiner eigenen Reihe ab 10.01. → jeweils eigene ID, keine Vertauschung. Derselbe Fall mit dem alten Termin als `einmalig` → neue ID (Format verschieden; Review 1, m1).
14. E3, leeres Fenster (Review M3): alter Kurs ganz vor `horizon.from`, Entwurf mit Beginn nach `previous.horizon.to` und ähnlichem Titel → neue ID (Abwandlung von „Folgekurs mit gleichem Titel … neue ID“).
15. E3, Uhrzeit entscheidet: Vorstand „Babyschwimmen (Fr 10:45)“ und „Babyschwimmen (Fr 11:15)“ mit je 16 Freitagen ab 09.10.2026 (alle im Fenster); Entwürfe mit 11 davon (Ferien weg, Jaccard der Beginnzeiten 11/16 ≈ 0,69 < 0,8, Jaccard der Tage ebenso ≥ 0,5; im Test kommentiert) und neuen Titeln → beide IDs gehalten, keine vertauscht. Ändern beide Gruppen zugleich die Uhrzeit, bleibt es mehrdeutig.
15b. Stufe 2 mit widersprechender Kennung (Review 3, Major 3): (i) alt „Babyschwimmen 1 (Fr 10:45)“ und „Babyschwimmen 2 (Fr 11:15)“; Gruppe 1 entfällt, Gruppe 2 zieht auf 10:45 → Gruppe 2 bekommt nie die ID von Gruppe 1. (ii) alt „Babyschwimmen A, Start 08.11.“, Entwurf „Babyschwimmen B (So ab 08.11.)“ mit demselben ersten Termin → keine Zuordnung über den ersten Termin.
16. Bestehende Stufe-2-Tests („hält die ID bei neuer Uhrzeit“, „nur als einziger Kandidat … (Review M2)“, „Schwelle: D = 0,5“, „verlangt das gleiche Format“) bleiben unverändert grün.

`build-offers.test.ts`, Integration (Review 3, Minor 7):
17. `buildOffers` mit einem `previous`, das ein Zwillingspaar enthält, und einer Rohdatei mit beiden Fassungen: ein Angebot mit einer der alten IDs, Hinweise „Dublette … gleiche Quelle“ und „Zwilling im Vorstand“, `checkIdContinuity` leer.

Keine E2E-Spec betroffen: `node scripts/e2e-select.ts scripts/pipeline/lib/stable-ids.ts scripts/pipeline/lib/build-offers.ts scripts/pipeline/lib/similar.ts` meldet am 2026-10-16 „E2E: keine Spec betroffen“ (Review m6). Kein `/browser-review` (keine UI).

## Schritte

1. Plan, `/plan-review`, Review-Abschnitt einarbeiten, committen (Doku-Pfad).
2. Tests 1–4 rot, E4 umsetzen, grün: `pnpm exec vitest related scripts/pipeline/lib/similar.ts`.
3. Tests 5–8 und 17 rot, E1 umsetzen (Test 17 wird erst mit Schritt 4 ganz grün), grün: `pnpm exec vitest related scripts/pipeline/lib/build-offers.ts`.
4. Tests 9–16 (mit 11b–11e, 15b) rot, E2 und E3 umsetzen, grün: `pnpm exec vitest related scripts/pipeline/lib/stable-ids.ts`.
5. Rückspiel (Verifikation) mit den Werten aus „Ziel“.
6. ADR 0031, Verweise, Kommentare (E5). `pnpm docs:check`.
7. `pnpm verify` grün (volle Suite; `related` übersieht Tests, die Fixture-Dateien lesen). `/arch-review` (Änderung einer Architekturregel mit ADR).
8. Commit und Push auf `main`; CI grün. Wirkung im nächsten Nachtlauf prüfen: Die `notes` von `runs/<datum>/nightly.json` (Artefakt `nachtlauf-<run-id>`) nennen „Zwilling im Vorstand“ bzw. „Dublette … gleiche Quelle“; jede solche Zeile mit beiden Titeln ansehen; die Zeile „IDs: … weggefallen“ ist plausibel.
9. Archivieren nach dem ersten Nachtlauf mit den neuen Regeln (Restpunkte nach `docs/ideas.md`).

## Verifikation (Rückspiel)

Ohne Netz und ohne Modell, gegen die echten Stände aus git, mit einem Wegwerf-Skript außerhalb des Repos (nicht committen; die echten Daten gehören nicht in Tests):

1. `git show a6ed8c5:data/offers.json`, `4ace9a7:…`, `61bc10e:…`, `ecfce2c:…` in Dateien schreiben.
2. Je Wechsel A → B zweimal rechnen, einmal mit dem Stand vor der Änderung (`git stash` oder `origin/main`), einmal mit den neuen Regeln:
   - `drafts` = Angebote von B ohne `id`; mit den neuen Regeln zuerst durch `dropSameSourceDuplicates` (Rang für alle gleich, `order` = Reihenfolge in der Datei, `previousWindowKeys` aus A).
   - `assignIds({ drafts, previous: A, providers: readCatalog(<datei>), horizon: B.horizon })` mit dem Katalog von B (`git show <B>:data/providers.yaml` in eine Datei; Review 2, Punkt 13).
3. Drei Listen je Wechsel (Review M4), jeweils mit altem Titel und dem Titel des Angebots, das die ID trägt:
   - (a) nur mit den neuen Regeln gehalten,
   - (b) nur mit den alten Regeln gehalten,
   - (c) in beiden gehalten, aber an einem anderen Angebot (Titel oder erster Termin verschieden). **(c) muss leer sein**; jeder Eintrag in (a) und (b) wird von Hand geprüft: (a) derselbe Kurs am selben Ort, (b) nur die zweite Fassung einer zusammengeführten Dublette.
4. Erwartung: gehaltene IDs ≥ 455 von 498 (13.10.) und ≥ 415 von 483 (16.10.), gegen 449 und 398 mit den alten Regeln.

Abweichungen des Rückspiels vom Build:
- `data/offers.json` hat weder `rank` noch `order` und ist nach `compareOffers` sortiert; welche Fassung in E1 bleibt, kann deshalb anders ausfallen als im Nachtlauf. Für die Listen (a)–(c) zählt das nicht, nur für den Titel des Bleibenden.
- Rang ist im Rückspiel für alle gleich; Angebote aus Sammelkalendern könnten deshalb anders verschmelzen als im Build (Review 3, Minor 10).
- Im Build aus dem Altbestand übernommene Angebote (Schritt 7) treffen trivial in Stufe 0. Sie stehen schon in B und zählen deshalb in beiden Rechnungen gleich.

**Ergebnis mit einem Prototyp am 2026-10-16** (alle Entscheidungen samt Review 3, ohne Format-Lockerung, mit dem Katalog von B; „wer bleibt“ in E1 nur nach Reihenfolge, ohne `windowKey`, was nur ändert, welche der beiden Fassungen bleibt, nicht wie viele IDs): 455 und 415 gehalten.
- 13.10.: (a) 12 – FBS (10, vor allem PEKiP-Gruppen, Babymassage, BauchBeutelPo, MAWIBA, ZwergenTanz 2), Mini-Club Passionskirche, Hebammen-Babymassage; (b) 6 – vier Rückbildungskurse des Geburtshauses, eine Eltern-Kind-Gruppe St. Johannis und die „Eulenbande“ von Zoff Harmonie, je die zweite Fassung einer zusammengeführten Dublette (die Eulenbande meldete der Nachtlauf vom 16.10. selbst als Dublette); (c) 0.
- 16.10.: (a) 22 – Wassermäuse (7), FBS (8, PEKiP und Abenteuerturnen), Post-SV (4), Ev. Fischbach (2), Mini-Club Passionskirche; (b) 5 – die Rückbildungskurse wie oben und `upjnuagg` (St. Johannis, dreifach geführt; die Fassung `u858szn7` mit identischen Terminen behält das Angebot); (c) 0.
- Auffällig, aber richtig: `tke7agbg` „Abenteuerturnen 1 (1–3 J.), Fr 04.12.2026“ → „… Fr 11.12.2026“. Der alte Titel trug das falsche Datum, sein Termin war der 11.12.

## Risiken

- **Falsche Zusammenführung echter Parallelgruppen** (E1) oder falsche Zwillinge (E2): zwei Gruppen desselben Anbieters, gleicher Ort, gleiche Zeiten, gleiches erstes Kernwort, verträgliches Alter, ohne Gruppenkennung. Im Rückspiel kein Fall; dagegen stehen Kerntitel, Alter, Gruppenkennung, der Bericht und die Prüfung im ersten Nachtlauf (Schritt 8). Fehler gehen nach vorn: Regel verschärfen, nächster Lauf. E1 entfernt ein Angebot aus der App, deshalb ist die Bedingung strenger als für die Zuordnung.
- **Falsche Zuordnung über den ersten Termin** (E3): zwei verschiedene Kurse mit ähnlichem Titel, die zur selben Minute am selben Ort beginnen. Begrenzt durch „einziger Kandidat in beiden Richtungen“ und die verbrauchten Zwillinge; im Rückspiel kein Fall.
- **Zwei Titelvergleiche** (`similarTitle`, `sameCoreTitle`): bewusst, siehe E4.
- **Wirkung erst im Nachtlauf**: Ein Fehler zeigt sich erst dort. Gegenmittel ist das Rückspiel vor dem Commit. Ein Revert ist möglich, weil die Regeln nur künftige Läufe betreffen; bis dahin vergebene IDs bleiben.

## Review (2026-10-16) – Verdict: Überarbeiten → eingearbeitet

Übernommen:
- **B1** unterlegener Zwilling trifft in Stufe 2 eine Schwester: verbrauchte Zwillinge nehmen an Stufe 2 nicht teil, auch nach Stufe 0 (E2, Test 11; die zunächst genannte Teilungsprüfung strich Review 2, Punkt 4). Im Rückspiel 1 ID weniger am 13.10., kein Fehltreffer.
- **M1** Kerntitel zu großzügig: erstes Kernwort muss passen, Präfix nur mit Füllsuffix, Stoppliste erweitert, Negativtests aus dem Review (E4, Test 2).
- **M2** Alter: `compatibleAge` in E1 und E2 (Tests 4, 7, 12).
- **M3** leeres Fenster beim ersten Termin: nur mit Terminen auf beiden Seiten (E3, Test 14).
- **M4** Rückspiel mit drei Listen, Ergebnis im Plan, Abweichungen vom Build genannt (Verifikation).
- **m1** Formate in Test 13 ausdrücklich, Fall `einmalig` → `kurs`.
- **m2** Bleibender nach `windowKey` im Vorstand, sonst `order` (E1, Test 6).
- **m3** eigene Konstante `SAME_SOURCE_SESSIONS`; die Präfixlänge entfällt (Füllsuffix statt Länge); die Uhrzeit braucht keine Schwelle (mindestens eine gleich).
- **m4** Regex der Gruppenkennung im Plan, Tests mit Komma, „1,5 Jahre“, „3 bis 6 Monate“.
- **m5** `dropSameSourceDuplicates` direkt getestet; Eval-Verschiebung als Konsequenz in ADR 0031.
- **m6** Prüfung je Schritt, Beleg der E2E-Auswahl.
- **m7** Format-Lockerung gestrichen (3 IDs, eine ADR-Abweichung und ein geänderter Test weniger), nach `docs/ideas.md`.

Abgelehnt: keine.

Zweites Review: nötig, weil B1 und M1 Entscheidungen geändert haben.

## Review 2 (2026-10-16) – Verdict: Überarbeiten → eingearbeitet

Übernommen:
- **Blocker 1** verbrauchte Zwillinge auch in Stufe 1: eine Funktion `openOlds()` für alle Durchgänge von Stufe 1, die Mehrdeutigkeits-Hinweise und Stufe 2 (E2, Test 11b). Im Rückspiel 1 ID weniger am 16.10. (414 → 413), (c) bleibt leer.
- **2** Zwillinge mit veränderter Reihe: Gleichstand in der Gegenrichtung von Stufe 2 nach der Rangfolge aufgelöst (E2, Test 11c).
- **3** Reihenfolge in Stufe 2: erst alle Vorschläge, dann Konflikte unter Zwillingen nach Rang auflösen (E2).
- **4** Teilungsprüfung: Satz gestrichen; sie läuft nur über zugeordnete alte Angebote.
- **5** Zeitraum als zweite Kennung (E4, Test 3).
- **6** Regex: Bindestrich ohne Leerraum, „Zahl – Zahl“ ausgenommen (E4, Test 3).
- **7** Test 13 und 15 mit Terminen im Fenster und ausgerechnetem Jaccard.
- **8** E1 als sortierter gieriger Durchlauf ohne Veränderung der Eingabe, `Candidate` exportiert (E1, Test 6).
- **9** `ratio` auf kleingeschriebenen Titeln (E2).
- **10** `berlinKey(start).slice(9)` (E3).
- **11** Abstimmung mit Plan 0037, Stufe C (E5).
- **12** Ziel auf gleiches Format und gleichen Kerntitel eingegrenzt.
- **13** Rückspiel mit dem Katalog von B (Verifikation).

Abgelehnt: keine.

Drittes Review: nötig, weil Blocker 1 die Regel geändert hat (letztes nach dem Skill `plan-review`).

## Review 3 (2026-10-16) – Verdict: Freigabe mit Änderungen → eingearbeitet

Übernommen, jeweils am Prototyp nachgemessen (Ergebnis in „Verifikation“: 455 und 415 gehalten, Liste (c) weiter leer):
- **Major 1** benannte Parallelgruppen: Namensregel im Kerntitel (E4, Tests 2, 7).
- **Major 2** Zwillinge lockerer als E1: ein Prädikat `sameOfferTwice` für E1 und E2, mit gleichem Format und Terminen ab `horizon.from` (E1, E2, Test 11d).
- **Major 3** Stufe 2 nur über `similarTitle`: widersprechende Kennungen schließen ein Paar aus (`conflictingLabels`, E3, Test 15b).
- **Major 4** Konflikte zwischen Zwillingen über verschiedene Entwürfe: beide Vorschläge fallen weg, entschieden auf der ursprünglichen Menge (E2, Test 11e).
- **Minor 5** eine eigene Konstante `SAME_SOURCE_SESSIONS` für E1 und E2.
- **Minor 6** Terminbasis ab `horizon.from` (E1).
- **Minor 7** Integrationstest über `buildOffers` (Test 17).
- **Minor 8** `HHmm` statt `HH:MM`; Reihenfolge Uhrzeit, dann Zwillinge.
- **Minor 9** Regex ohne Flag `i`, `termin`, `einheit`, `mon` ausgeschlossen (E4, Test 3).
- **Minor 10** Rang im Rückspiel als Abweichung genannt.
- **Minor 11** Doku-Reste angeglichen (Review-1-Zusammenfassung, Nicht-Ziele „beim Archivieren“).

Abgelehnt: keine.

Kein weiteres Review: Verdict „Freigabe mit Änderungen“ ohne Blocker; nach dem Skill `plan-review` ist ein neues Review nur bei „Überarbeiten“ mit geänderten Blockern nötig.

## Umsetzung (2026-10-17)

Schritte 2–4 und 6 umgesetzt (Tests 1–17 zuerst rot, wo das Verhalten neu ist; 11d, 12, 14, 15b (ii) waren schon grün, jede neue Regel ist per Mutation von mindestens einem Test gedeckt).

Rückspiel (Schritt 5) mit dem echten Code (`df50a64` gegen den Arbeitsbaum): 449 → **455** von 498 und 398 → **415** von 483 gehalten; Listen (a) 12 / 22, (b) 6 / 5, (c) **0 / 0**, gleich den Listen des Prototyps (Abschnitt „Verifikation“).

Abweichungen vom Plan:
- **Stufe 1 entscheidet Zwillingskonflikte wie Stufe 2** (über E2 hinaus): Je Durchgang werden erst alle Gewinner bestimmt; gewinnen zwei Zwillinge im selben Durchgang verschiedene Entwürfe, trifft keiner („mehrdeutig in Stufe 1 – Zwilling …“). Ohne die Regel blieben beide IDs, obwohl die Zwillinge ein Angebot sind; eine Prüfung „verbraucht?“ in der Schleife hinge von der Reihenfolge ab. Test 11e (Stufe 1), ADR 0031, Punkt 3. Die Zwillinge eines solchen Konflikts nehmen auch an Stufe 2 nicht teil (Arch-Review, Minor 1; Test 11e, dritter Fall).
- **Uhrzeit in der Gegenrichtung:** Es bleiben alle Kandidaten mit gemeinsamer Uhrzeit (nicht nur „genau einer“), danach wird unter Zwillingen nach Rang aufgelöst. Vorwärts unverändert.
- **Test 11** mit Titeln ohne Zeitraum: „geb. Apr.–Juni“ gegen „geb. Jan.–März“ schließt `conflictingLabels` schon aus, der Test prüfte sonst den Verbrauch nicht. **Test 15b (i)** mit 11 von 16 Terminen: Bei identischen Terminen ordnet schon Stufe 1 zu.

Restpunkt (beim Archivieren nach `docs/ideas.md`): Stufe 1 prüft `conflictingLabels` nicht. Zieht „Babyschwimmen 2“ mit exakt denselben Terminen auf den Platz von „Babyschwimmen 1“, erbt es dessen ID (bestehendes Verhalten, im Rückspiel kein Fall).

## Arch-Review (2026-10-17) – Verdict: OK

- **Minor 1** Zwillingskonflikt aus Stufe 1 wurde in Stufe 2 doch entschieden: behoben (die Zwillinge sind für Stufe 2 gesperrt), Test ergänzt. Rückspiel unverändert 455 / 415, (c) leer.
- **Minor 2** römische Kennungen und `C`–`F` ungetestet: Tests ergänzt.
- Hinweis: Der Restpunkt „Stufe 1 ohne `conflictingLabels`“ kommt als Korrektheitsrisiko nach `docs/ideas.md`, nicht als Komfort-Idee.

## Live (Nachtlauf 2026-10-18, Lauf 39103948015)

Erster Nachtlauf mit den neuen Regeln (Schritt 8), alle Zeilen mit beiden Titeln angesehen:
- 9 Dubletten gleicher Quelle entfernt (FBS 7: PEKiP-Gruppen, ZwergenTanz 2, Babymassage; Geburtshaus 2: Rückbildung), jede derselbe Kurs zweimal, keine Parallelgruppe.
- 6 Hinweise „Zwilling im Vorstand“, jeweils die zweite Fassung eines Angebots; 12 Treffer in Stufe 2 (u. a. Wassermäuse, HerzZeit), alle derselbe Kurs.
- Gehalten 457 von 472, 15 weggefallen (Bericht: 17, davon 2 von `imiluv-studio`, die Schritt 7 aus dem Altbestand übernimmt). Davon 6 Zwillinge (gewollt), 5 mit gewechseltem Ort (Studio Herzschlag Outdoor-Fitness, FBS Waldwichtel und Waldracker), 1 Format `kurs` → `einmalig` (FBS Abenteuerturnen 1), 1 Dublette mit verschiedenem ersten Kernwort (FBS „Tanzen für Mama & Baby …“ / „MAWIBA-Tanzkurs …“: die alte ID ist in Stufe 1 und 2 mehrdeutig), 2 ohne Nachfolger.

Restpunkte stehen in `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“.
