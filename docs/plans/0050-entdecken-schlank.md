# Plan 0050 – Entdecken: wenige gute Quellen, Seitenfinder, keine technischen Verluste

Status: Review eingearbeitet
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`):
  - Punkt 6 (Entdecken findet Anbieter, nicht Seiten);
  - Punkt 4 (Seitenfinder im Entdecken);
  - Punkt 7 (Modell nach Qualität);
  - Punkt 5 (Klärfälle im Wächter);
  - geänderte Wochentage aus ADR 0032, Punkt 8.
- Ersetzt Plan 0045 (`docs/plans/archiv/0045-entdecken-vollstaendig.md`). Dessen Abschnitte „Ausgangslage“, „Quellen“ und „Fundorte der neun nicht gefundenen“ sind die Grundlage hier und werden nicht wiederholt. Übernommen sind dort E5.2–E5.5, E6.3 und E7 in schlankerer Form.
- Plan 0048 (`docs/plans/0048-nachtlauf-seite-als-einheit.md`): Einheit Seite (E1), Wächter (E10), Abruf mit User-Agent und robots.txt (E8).
- Plan 0049 (`docs/plans/0049-seitenfinder.md`): Modul `site-crawl` mit Modus `alle` (E1), `SHARED_HOSTS`, `katalog-budget` (E3), Workflow mit `lauf` (E5).
- Plan 0042 (`docs/plans/0042-duesseldorf-katalog-fuellen.md`): Navigator, `partChars`, `abgelehnt` für Portale. Plan 0032, E7–E9 (Entdecken, Bremsen, Eval). ADR 0026, Punkt 5 (G1–G4); ADR 0022 (IDs).

## Voraussetzungen

- **Branch-Basis:** Düsseldorf existiert nur auf Branch `plan-0039`. Bis `plan-0039` auf `main` ist, zweigt die Umsetzung von `plan-0039` ab und holt `main` per Rebase herein. Ohne Düsseldorf im Katalog scheitert das Düsseldorfer Eval.
- **S1 und S2** hängen nur an dieser Basis.
- **S3** braucht Plan 0049, S1 (Modul) und Plan 0048, S1 (Ertragsbeweis je Einheit).
- **S4** braucht Plan 0048, S3 (Abruf mit robots.txt).
- **Klärfälle im Wächter** (E5) brauchen Plan 0048, S2.
- **Live für `vrr`** braucht Plan 0044 (`site.json` je Gebiet) und eine Entscheidung zu den übrigen Budgets, die fast voll sind: `anbieter.json`, Wegzeit und Linien `vrr` (`.size-limit.json`; Plan 0045, N7). Nürnberg und Fürth brauchen das nicht, solange `katalog-budget` (E8) grün ist.

## Anlass

Das Entdecken-Eval für Düsseldorf (2026-10-24) fand 5 von 10 ausgeblendeten Anbietern und nahm 2 wieder auf. In Nürnberg (2026-10-11) waren es 6 und 2. Der Nutzer hält das für schlecht; Qualität geht vor Kosten, auch vor dem Kontingent (2026-10-25/26).

Die Ursachen stehen in Plan 0045, „Ausgangslage“:
- **7 der 11 gefundenen Anbieter gingen technisch verloren**, nicht am Urteil des Modells. Gründe:
  - eine Adresse mit Kommentar (`streetPart` in `scripts/pipeline/io/geocode.ts`);
  - ein Tippfehler auf der Seite, und ein Ort ohne Treffer verwirft den ganzen Kandidaten;
  - Orte ohne Postadresse;
  - Detailseiten oder iCal, die das Bewerten nicht sieht.
- **7 der 9 nicht gefundenen** stehen in maschinenlesbaren Listen, die das Entdecken nicht abfragt.

## Ziel

Gemessen mit dem Eval aus E6 auf festen Stichproben für Nürnberg und Düsseldorf, je 20 Anbieter, zwei gültige Läufe je Konfiguration, Mittelwert je Region. Ein Lauf, den Bremse, Limit oder Zeitbudget beendet hat, ist nicht gültig.

1. **Gefunden ≥ 90 %** der ausgeblendeten Anbieter: von einer Quelle als Kandidat geliefert.
2. **Wiedergefunden ≥ 80 %:** würde aufgenommen.
3. **Falsch aufgenommen: 0.** Jede Aufnahme ohne Gegenstück in der Stichprobe beurteilt ein Mensch. Eine zweite Aufnahme desselben Anbieters zählt als falsch.
4. **Ertrag ≥ 80 %:** Ein wiedergefundener Anbieter trifft im Ertragsbeweis mindestens 80 % der künftigen Termine seines Handeintrags, gemittelt und je Anbieter auf 100 % gedeckelt. Referenz ist der Ertragsbeweis des ausgeblendeten Handeintrags im selben Lauf. Anbieter mit `coveredBy` oder `follow` zählen nicht (`ziel4: false`), denn das Entdecken setzt `follow` nie.
5. **Keine Verwerfung aus technischem Grund:** Netz, 5xx, Bot-Schutz, Geocoder ohne Treffer oder mit Ausfall und ungültige Antwort machen einen Klärfall (E5), nie eine Verwerfung oder Wiedervorlage. HTTP 404/410 und Orte außerhalb der Region verwerfen weiter.
6. **Echte Neuzugänge messen**, ohne Schwelle: Nach jedem Live-Lauf trägt ein Mensch per Skill (Abschnitt 1) eine Zeile in `evals/results.md` ein, Abschnitt „Entdecken live“: aufgenommen, davon bestätigt, zurückgenommen, Klärfälle. Das misst den Monatslauf selbst, nicht nur das Wiederfinden.

`ENTDECKEN_MODUS` geht je Netz erst auf `live`, wenn die Ziele 1–4 für dessen Regionen erreicht sind (Fürth läuft mit Nürnberg).

## Nicht-Ziele

- **Ein Erkundungsmodus für neue Städte** (Plan 0045, Stufe A): Eine neue Stadt erkundet ein Mensch mit dem Skill (E9).
- **Breite Inventare und kleine Listen im Code:** Landessportbund-Vereine, OSM-Gemeinden, Vereinsverzeichnis Nürnberg, GKV-Hebammenliste, Schneeball und Mehrgenerationenhäuser (1–3 je Stadt). Sie helfen beim ersten Füllen einer Stadt und gehen in die Checkliste des Skills (E9). Damit entfällt auch die Pseudonymisierung von Personen aus Plan 0045, E6.4.
- **eversports** (nur mit Browser hinter Cloudflare): kein Abruf, die Bot-Abwehr wird nicht umgangen.
- **Ersatzlos gestrichen:** Recherche-Profil als Datei, Lincoln-Petersen-Schätzung, `--reuse`, Stadtteil-Matrix. Photon kommt nur, wenn S1 zeigt, dass Orte ohne ihn verloren gehen.
- **Kosten senken:** kein Kriterium.
- **Extraktion verbessern:** Modellwahl und Plan 0048.
- **Bestehende Einträge ändern:** nichts; G2 bleibt für das Entdecken streng (Plan 0049, E3).

## Entscheidungen

### E1 – Ablauf und Takt

Ein Lauf hat vier Phasen:
1. **Kandidaten** aus den Quellen der Region (E2), Websuche und Namenssuche (E3).
2. **Vorfilter** gegen Katalog, `abgelehnt`, `zurueckgestellt` und ausgesetzte Klärfälle (`prefilter`, `scripts/pipeline/lib/discover.ts`).
3. **Prüfung** je Kandidat (E4): Seitenfinder, Bewerten, Orte, Ertragsbeweis je Seite.
4. **Aufnahme** mit G1–G4 wie heute.

**Zeit je Region:** Bei `--netz` mit mehreren Regionen bekommt jede einen Anteil am Zeitbudget nach der Zahl ihrer Katalog-Anbieter, mindestens 20 %.

**Takt monatlich je Netz:** In `.github/workflows/discover.yml` ersetzen zwei Monats-Crons die Wochen-Crons des Entdeckens:
- `30 8 1 * *` für `vgn`;
- `30 8 2 * *` für `vrr`, erst mit Plan 0044.

Der Job `modus` (Plan 0049, E5) setzt dafür `lauf=entdecken`. Ein fester Tag des Monats ist nötig, weil GitHub Tag und Wochentag mit „oder“ verknüpft. Um 08:30 UTC ist der Pflegelauf vom Mittwoch oder Donnerstag (04:30, höchstens 150 Min.) vorbei; ein wartender Lauf in der Gruppe `daten` wird nicht verdrängt. Die Wochentage aus ADR 0032, Punkt 8 entfallen (ADR 0033).

### E2 – Quellen je Region

- **Tabelle im Code** `scripts/pipeline/lib/discover-sources.ts` (neu): `DISCOVER_SOURCES: Record<RegionId, SourceUse[]>` mit `{quelle, params?}`. Ein Test prüft, dass jede Region der `REGION_IDS` einen Eintrag hat und die Parameter je Quelle passen.
- **Quellen:** Parser rein in `scripts/pipeline/lib/sources/discover/<quelle>.ts` mit Fixture aus fiktiven Namen; Abruf in `scripts/pipeline/io/discover-sources.ts` über den gemeinsamen Abruf aus Plan 0048, robots.txt eingeschlossen.

| Quelle | Reichweite | Parameter | Inhalt |
|---|---|---|---|
| `sammelkalender` | Region | – | wie heute (`aggregatorFinds`) |
| `linkliste` | Region | – | `role: verzeichnis` der Region, wie heute (`directoryFinds`) |
| `navigator` | NRW | `einrichtungId` | Familien-Navigator: Anbieter und Träger mit Website aus den Angeboten für 0–3 und der Anbieterliste |
| `kikudoo` | bundesweit | – (bbox der Region) | Geo-API, Anbieter mit Lage |
| `kidsgo` | bundesweit | `raum` | nur, wenn das Eval nach `navigator` und `kikudoo` Lücken zeigt (S4): Kategorieseiten im Browser, `/suche/` nicht (robots.txt), nur Einträge mit Ort in der bbox |

- Die Endpunkte und Belege stehen in Plan 0045, „Quellen“. S0 ruft sie erneut ab.
- Funde bekannter Websites werden Hinweise, keine Kandidaten (wie heute).
- Fällt eine Quelle aus, kostet das nur ihre Funde, und der Bericht nennt sie. Liefert sie genau so viele Treffer wie eine Seitengrenze, warnt der Bericht.
- `MAX_DIRECTORY_FINDS` gilt nur für `linkliste`.

### E3 – Websuche und Namenssuche

- **Formatsuche:** Begriffe in Gruppen nach `CATEGORIES` (`src/domain/topics.ts`), je Gruppe ein Aufruf mit 3–5 Begriffen und dem Regionsnamen. Die Gruppen stehen in `scripts/pipeline/lib/discover-terms.ts`.
  - Neu sind unter anderem Familiencafé, Elterncafé, Offener Treff, Spielgruppe, Mutter-Kind-Gruppe, Babytreff, Kinderturnen 1–3 Jahre, Babyyoga, Rückbildung mit Baby, Delfi, Prager Eltern-Kind-Programm, Zumbini, Kangatraining, Babytheater und Bilderbuchkino.
  - `--terms` ersetzt die Gruppen durch eine einzige.
  - `SEARCH_MAX_TURNS` steigt von 10 auf 30, `SearchResponse` von `max(20)` auf `max(25)`.
- **Portaltreffer auflösen statt verwerfen:** Der Suchprompt nimmt Treffer auf Sammelportalen und Buchungsplattformen auf, wenn sie einen Veranstalter nennen (`{name, url, portal: true}`). Der Code gibt den Namen an die Namenssuche. Portale in `abgelehnt` bleiben als Fund-URL gesperrt.
- **Namenssuche** (`scripts/pipeline/prompt/discover-resolve.md`, neu, `tools: web`):
  - bis zu 10 Namen je Aufruf mit Ort und Art;
  - Antwort je Name eine URL oder `null`;
  - eine URL zählt nur, wenn ihr Abruf den Namen **und** den Ort oder eine PLZ der Region enthält;
  - ohne eigene Website bleibt ein Plattform-Profil die Fund-URL, wenn es Termine zeigt. Der Seitenfinder bleibt dann unterhalb des Profil-Pfads mit gleichem Mandanten (Plan 0049, E1).

### E4 – Prüfung in die Tiefe

1. **Seitenfinder, Modus `alle`** (Plan 0049, E1), ab Fund-URL und Startseite der Website, höchstens 20 Seiten plus höchstens zwei Kontakt-, Anfahrts- oder Impressumsseiten. Er ersetzt `contactLinks` und `MAX_CONTACT_PAGES`.
   - Eine JavaScript-Seite (`jsRendered`) ruft er einmal im Browser ab.
   - Bleiben **Fund-Seite oder Startseite** leer, wird der Kandidat ein Klärfall. Leere Nebenseiten fallen still weg.
2. **Bewerten** mit allen erkundeten Seiten als `## SEITE: <URL>`, je Seite höchstens 15 000 Zeichen, zusammen höchstens 150 000, dazu die Linklisten.
   - Programmseiten müssen aus den erkundeten URLs oder ihren Links stammen (`allowedUrlsOf` auf die Erkundung erweitert).
   - `AssessEntrySchema`: `venues.max(20)`, `programme.max(20)`.
   - Orte dürfen als „Name, Ort“ kommen, wenn die Seite keine Postadresse nennt (Turnhalle, Bad).
   - Bei ungültiger Antwort einmal das nächststärkere Modell (Haiku → Sonnet → Opus); bei Opus ein zweiter Versuch mit Opus.
3. **Ertragsbeweis je Seite:** Die vorgeschlagenen Programmseiten werden nach der Zahl künftiger Termine im Text geordnet, höchstens 5 gehen in den Beweis. Jede ist eine Einheit (Plan 0048, E1).
   - Seiten ohne Ertrag fallen aus dem Eintrag. Aufgenommen wird nur mit mindestens einer Seite mit Ertrag (`proveYield` wie heute).
   - Scheitert eine Seite mit „abgeschnitten“, folgt ein zweiter Beweis mit `partChars: 4500`; gelingt er, steht `partChars` im neuen Eintrag.
4. **Zweite Runde:** Liefert keine Seite Ertrag, bekommt das Bewerten einmal die Rückmeldung („Seite X lieferte keine Termine“) mit denselben Seiten und wählt neu. Danach ein zweiter Ertragsbeweis.
5. **Dubletten vor der Aufnahme** (seriell): Hat der neue Eintrag dieselbe Programmseite wie ein Katalog-Eintrag oder einen Ort im Umkreis von 100 m mit ähnlichem Namen (`similarName`), wird er nicht aufgenommen. Der Bericht meldet „Dublette von <id>?“.
6. **Parallel und seriell:**
   - **Parallel:** Bewerten und die Extraktion im Ertragsbeweis, je Kandidat mit eigenem temporären Verzeichnis statt `proofRaw/<id>.json`. Standard 4 gleichzeitig, `DISCOVER_CONCURRENCY`.
   - **Seriell:** Geocoder (Warteschlange), Build-Probelauf, Dublettenprüfung, Vergabe von Katalog-ID und `publicId`, G3, Aufnahme und Commit.
   - Ein `limit` oder Abbruch stoppt alle laufenden Aufrufe (`controller.abort()`).

### E5 – Härte: Orte und Klärfälle

- **Adressen:** neue reine Funktion `normalizeAddress` in `scripts/pipeline/lib/address.ts`:
  - entfernt Klammern und Kommentare;
  - vereinheitlicht „Str.“;
  - ergänzt das Leerzeichen vor der Hausnummer („Tellerringstr.56“);
  - gibt die Straße auch dann zurück, wenn sie der erste Teil ist (Fehler in `streetPart`).
- **Geocoder** (`scripts/pipeline/io/geocode.ts`), in dieser Reihenfolge, jeweils **erster Treffer in der bbox** der Region:
  1. Nominatim mit Freitext.
  2. Nominatim strukturiert (`street`, `city`, `postalcode`) mit `viewbox` und `bounded=1`.
  3. Benannter Ort ohne Adresse: Name und Stadt, `limit=5`, nur `category`/`type` aus einer festen Liste (Sporthalle, Schwimmbad, Schule, Kirche, Gemeindezentrum, Kita, Bibliothek). Die Adresse im Eintrag wird dann aus `addressdetails` gebaut („Straße Nr, PLZ Ort“), nicht aus `display_name`, weil sie im Detail und im Routen-Link erscheint.

  Alle Anfragen laufen durch eine Warteschlange mit 1/s. Der User-Agent folgt Plan 0048, E8. Die Schnittstelle wird `geocode(address, { region, venueName? })`.
- **Cache im Repo:** `data/geocode/nominatim.json` (neu), mit eigenem Zod-Schema in `scripts/geocode-cache.ts`. `scripts/validate-data.ts` prüft es. Dazu kommt es in die Pfadliste des Bundles (`.github/workflows/discover.yml`) und in `CLAUDE.md` („Daten“: schreibt nur der Lauf).
  - Gespeichert werden nur positive Treffer; es sind Adressen von Kursorten, also öffentlich.
  - Im Trockenlauf schreibt der Lauf nach `runs/<datum>/discover/geocode.json` und liest beide Dateien.
  - Damit entfällt `actions/cache`.
- **Ein Ort ohne Treffer** fällt allein weg, mit Hinweis. Die Terminseiten bekommen dann den `hint` „Termine an … weglassen“, wie heute bei Orten außerhalb der Region (`outsideHint`, `scripts/pipeline/lib/discover.ts`). Sonst landeten seine Termine am ersten Ort.
- **Drei Ausgänge:**
  - **aufgenommen**;
  - **verworfen**, mit Wiedervorlage nach 8 Wochen wie heute: inhaltliches Nein, kein Ertrag nach der zweiten Runde, HTTP 404/410, robots.txt sperrt alle Programmseiten, **alle Orte außerhalb der Region oder Gemeinde**;
  - **Klärfall**, ohne Wiedervorlage, der nächste Lauf versucht es erneut: Netz, 5xx, Bot-Schutz, Fund- oder Startseite leer, robots.txt nicht lesbar, **Geocoder ohne Treffer oder mit Ausfall für alle Orte**, ungültige Antwort nach Fallback.
- **Klärfälle im Zustand:** `DiscoverState` bekommt `klaerfaelle` mit `.default([])`; ein Eintrag ist `{url, name, grund, seit, anzahl, aussetzenBis?}`.
  - Ab drei Klärfällen in Folge setzt `aussetzenBis` einen Monatslauf aus.
  - Ein Eintrag entfällt bei Aufnahme, bei Verwerfung oder wenn der Kandidat drei Läufe lang nicht mehr auftaucht.
  - Klärfälle aus Zeitbudget, Limit oder G3 liegen nicht am Kandidaten und zählen nicht.
  - Im Trockenlauf stehen Klärfälle nur im Bericht. Ins Repo kommen sie nur im Modus `live`.
- **Klärfälle im Wächter:** `watchFindings` (Plan 0048, E10) bekommt die Zustände `data/discover/*.json` und meldet die Art `klaerfall` mit Name, Grund und Fund-URL. Der Schlüssel im Marker ist `k<die ersten 8 Hex-Zeichen des SHA-256 der normalisierten URL>`. Ein eigenes Issue gibt es dafür nicht.

### E6 – Eval

- **Stichproben** in `evals/discover.json` (neu): je Region 20 Anbieter (Nürnberg, Düsseldorf).
  - Dabei sind die 20 bisher genutzten, markiert mit `alt: true`.
  - Die übrigen 10 je Region zieht ein Skript in S0 mit gesetztem Zufall je Trägerart, ohne Blick auf die Quellen. Die Trägerarten ordnet S0 für alle Katalog-Anbieter beider Regionen von Hand zu und legt sie unter `arten` ab.
  - Nicht gezogen werden Anbieter mit `skipCrawl`. Mit `coveredBy` oder `follow` gilt `ziel4: false`.
- **Test** `scripts/pipeline/io/eval-discover.test.ts`: Jede ID in Stichprobe und `arten` steht im Katalog, hat die Rolle `anbieter`, die Region stimmt, 20 je Region, jede Stichprobe hat eine Art, `ziel4` stimmt. **Nicht** geprüft wird, ob `arten` den ganzen Katalog abdeckt; sonst machte jeder neue Anbieter G1 und die CI rot.
- **Aufruf** `pnpm pipeline discover --dry-run --eval [--region …] [--run-dir …]`:
  - blendet die Stichprobe aus;
  - ignoriert `zurueckgestellt`, `klaerfaelle` und negative Geocoder-Ergebnisse;
  - schaltet G3 aus;
  - legt ein eigenes Laufverzeichnis an: `runs/<datum>/discover`, bei Bedarf `-2`, `-3`.
- **Zuordnung 1:1** (`hiddenEval`): gleiche URL vor gleicher Website (`sameSite` der Startseite, nicht auf `SHARED_HOSTS`) vor Ortsnähe (100 m, `similarName`). Je Anbieter zählt die beste Zuordnung; weitere Aufnahmen desselben Anbieters sind falsch.
- **Ertrag** (Ziel 4): Für jeden wiedergefundenen Anbieter läuft im selben Lauf der Ertragsbeweis seines Handeintrags als Referenz (`runs/<datum>/discover/referenz/`). Die Termine werden 1:1 über Ort (≤ 100 m) und Beginn zugeordnet, im Fenster heute bis +8 Wochen.
- **Kennzahlen je Stufe** in Bericht und `evals/results.md`: gefunden je Quelle, aufgelöst, nach Vorfilter, bewertet „aufnehmen“, Orte aufgelöst, Ertragsbeweis (erste/zweite Runde), wiedergefunden, Klärfälle, Dubletten, Gültigkeit des Laufs; alte und neue Fälle getrennt. Die Tabelle „Entdecken“ bekommt die Spalten; alte Zeilen erhalten „–“.
- **Ort der Läufe:** lokal (Zeitbudget passend) oder per `workflow_dispatch` mit Eingabe `eval: true` (nur Trockenlauf, eigene `concurrency`-Gruppe).

### E7 – Modell

Für Suche, Namenssuche und Bewerten vergleicht S5 Haiku, Sonnet und Opus, je zwei gültige Eval-Läufe.
- **Rangfolge:** Ziel 3 ist hart (ein Modell mit falscher Aufnahme scheidet aus), dann zählt Ziel 2, dann 1, dann 4. Bei Gleichstand gewinnt das schnellere (ADR 0033, Punkt 7).
- `LLM_MODEL_DISCOVER` wird in beiden Workflows gesetzt.

### E8 – Grenzen, Budget im Lauf, G3

- **Bremsen:** `DISCOVER_BRAKES` (`scripts/pipeline/lib/cost.ts`), `DISCOVER_BUDGET_MIN` (`scripts/pipeline/io/discover.ts`) und der `timeout` für `lauf=entdecken` (Plan 0049, E5).
  - Ab S1 so hoch, dass Eval-Läufe nicht abbrechen: 1500 Aufrufe, 150 Mio. Tokens, 300 Min., `timeout` 330.
  - S6 setzt sie auf das Doppelte des größten gemessenen Laufs.
  - Die `workflow_dispatch`-Standards ziehen mit.
- **G3 im Monatstakt:** 25 neue Anbieter je Region und Lauf, bei `--bootstrap` weiter `max_new`.
- **Budget im Lauf:** über `pnpm pipeline katalog-budget` aus Plan 0049, E3. Der Befehl hat einen austauschbaren Runner und einen Test.
  - Er misst zuerst den Stand vor dem Lauf (`GITHUB_SHA`). Ist der schon rot, nimmt der Lauf nichts auf und meldet „Budget vor dem Lauf rot“.
  - Sonst baut er nach dem letzten Anbieter-Commit `data/offers.json` ohne Commit neu (`pnpm pipeline nightly --build-only`), dann laufen `pnpm build` und `pnpm size`.
  - Ist das rot, nimmt er die Anbieter-Commits zurück und behält den Zustands-Commit; der Job endet selbst grün mit Ausgabe `budget=rot`, `ampel` liest sie und wird rot.
  - Der Workflow-Test prüft Reihenfolge, Ausgabe und Ampel.

### E9 – Neue Stadt per Skill

Der Skill `babyevents-nuernberg`, Abschnitt 6 („Region starten“), bekommt eine **Erkundung**: In einer Sitzung recherchiert ein Mensch mit dem Agenten (Websuche und Abruf). Die Checkliste der Quellenarten kommt aus Plan 0045, „Quellen“:
- Landesportal wie der Navigator;
- kikudoo, kidsgo, Mehrgenerationenhäuser;
- Familienbildungsstätten und Kursportale;
- Vereinssuche des Landessportbunds;
- Gemeinden;
- Hebammenlisten;
- Linklisten der Stadt und der Träger.

Ergebnis:
- Einträge in `DISCOVER_SOURCES`;
- `role: verzeichnis`-Einträge;
- ein erster Katalog, von Hand oder per `discover --bootstrap`.

Der Abschnitt nennt, was beim Füllen Düsseldorfs half (Plan 0042).

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/address.ts` (neu) | Normalisierung | S1 |
| `scripts/pipeline/io/geocode.ts` | Reihenfolge, Treffer in der bbox, benannte Orte mit `addressdetails`, Warteschlange, Schnittstelle, Cache | S1 |
| `data/geocode/nominatim.json` (neu, nur vom Lauf), `scripts/geocode-cache.ts` (neu), `scripts/validate-data.ts` | Cache und Schema | S1 |
| `scripts/pipeline/lib/discover-state.ts` | `klaerfaelle` | S1 |
| `scripts/pipeline/io/discover.ts`, `scripts/pipeline/lib/discover.ts` | einzelne Orte mit `hint`, Klärfälle, Dubletten (S1); Eval, Kennzahlen, Ertrag (S2); Seitenfinder, Ertrag je Seite, zweite Runde, `partChars`, Parallelität (S3); Quellen, Namenssuche, Portaltreffer, Zeit je Region (S4) | S1–S4 |
| `scripts/pipeline/lib/watch.ts` | Art `klaerfall`, Zustände als Eingabe | S2b |
| `scripts/pipeline/prompt/discover-assess.md`, `discover-search.md`; `discover-resolve.md` (neu) | „Name, Ort“; Seitenformat; Portaltreffer; Namenssuche | S1, S3, S4 |
| `scripts/pipeline/lib/discover-sources.ts` (neu), `scripts/pipeline/lib/sources/discover/*.ts` (neu), `scripts/pipeline/io/discover-sources.ts` (neu) | Quellentabelle und Quellen | S4 |
| `scripts/pipeline/lib/discover-terms.ts` | Begriffsgruppen nach `CATEGORIES` | S4 |
| `scripts/pipeline/cli.ts` | `--eval`, `--run-dir`, `--terms` | S2, S4 |
| `scripts/pipeline/lib/cost.ts` | `DISCOVER_BRAKES` | S1, S6 |
| `.github/workflows/discover.yml`, `scripts/lib/discover-workflow.test.ts` | Eingabe `eval` (S2); Monats-Crons, `timeout`, Bundle-Pfad `data/geocode` (S1, S6) | S1, S2, S6 |
| `evals/discover.json` (neu), `evals/results.md` | Stichproben, Spalten, Abschnitt „Entdecken live“ | S0, S2, S6 |
| Skill (Abschnitte 1, 2, 6), `docs/architecture.md` (Takt, Zeile zu ADR 0032, Punkt 8), `CLAUDE.md` („Daten“: `data/geocode/`), Statuszeile ADR 0032 | Doku | S1–S7 |

## Tests (test-first)

- `lib/address.test.ts`:
  - Kommentar in Klammern;
  - Straße am Anfang;
  - „str.56“;
  - „Str.“ gegen „straße“;
  - die zwei Düsseldorfer Adressen aus dem Eval.
- `io/geocode.test.ts` (mit `fetchImpl`):
  - die Reihenfolge bricht beim ersten Treffer in der bbox ab, ein Treffer außerhalb zählt nicht;
  - benannter Ort nur mit erlaubter Kategorie, Adresse aus `addressdetails`;
  - zwei Anfragen im Abstand ≥ 1 s;
  - Fehler nicht im Cache;
  - Trockenlauf schreibt nicht nach `data/geocode/`.
- `scripts/geocode-cache.test.ts`: Schema; `data:validate` liest die Datei und nicht als `DiscoverState`.
- `io/discover.test.ts`:
  - ein Ort ohne Treffer → Eintrag mit den übrigen, Hinweis und `hint` an den Terminseiten;
  - Geocoder ohne Treffer für alle Orte → Klärfall ohne Wiedervorlage, ab dem dritten `aussetzenBis`;
  - alle Orte außerhalb der Region → verworfen mit Wiedervorlage;
  - Netzfehler, 5xx und Bot-Schutz → Klärfall; 404/410 → verworfen;
  - Fund-Seite leer nach Browser → Klärfall; leere Nebenseite → weggelassen;
  - Seite ohne Ertrag fällt aus dem Eintrag;
  - zweite Runde nimmt auf;
  - `abgeschnitten` → zweiter Beweis mit `partChars`;
  - ungültige Antwort → stärkeres Modell;
  - Dublette nicht aufgenommen;
  - Portaltreffer geht in die Namenssuche; eine URL ohne Name und Ort im Text zählt nicht;
  - **parallel bewertete Kandidaten mit gleichem Namen bekommen verschiedene IDs**;
  - `limit` in einem von vier parallelen Aufrufen stoppt alle;
  - Geocoder-Abstand ≥ 1 s auch bei parallelen Kandidaten;
  - Klärfälle gelangen im Trockenlauf nicht in den Zustand.
- `lib/discover.test.ts`:
  - Zuordnung 1:1 mit Vorrang;
  - geteilte Websites, beide Paare (`stadtkirche-nuernberg.de`, `evdus.de`);
  - Ertrag gegen die Referenz, gedeckelt;
  - Kennzahlen je Stufe;
  - `--eval` ignoriert Zustand und G3;
  - ein Lauf mit Bremse ist ungültig;
  - Zeit je Region mindestens 20 %.
- `lib/discover-state.test.ts`: bestehende Dateien ohne `klaerfaelle` bleiben gültig; Eintrag entfällt nach drei Läufen ohne Auftauchen.
- `lib/watch.test.ts`: Art `klaerfall` mit Schlüssel `k<hash8>`; Marker gültig.
- `lib/sources/discover/*.test.ts`: je Quelle eine Fixture, Seitengrenze, bekannte Website als Hinweis, Region über bbox.
- `lib/discover-sources.test.ts`: jede Region hat einen Eintrag, Parameter je Quelle.
- `scripts/pipeline/io/eval-discover.test.ts`: wie E6.
- `scripts/lib/discover-workflow.test.ts`:
  - Monats-Crons → `lauf=entdecken`;
  - Eingabe `eval` nur im Trockenlauf;
  - `data/geocode` im Bundle;
  - `katalog-budget` vor der Übergabe, `ampel` liest `budget`.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected`, bei Daten mit `--smoke`. Schritte mit neuem Modul mit `/arch-review`.

- **S0 – Vorbereitung.**
  - Trägerarten zuordnen und `evals/discover.json` per Skript ziehen (E6).
  - Endpunkte von `navigator`, `kikudoo` und `kidsgo` erneut abrufen.
  - Probe: die neun Namenssuchen aus Plan 0045, „Fundorte“, einmal über die Websuche der Pipeline (`claude -p`, `tools: web`).
- **S1 – Härte** (E5 ohne Wächter, E4.5, Prompt „Name, Ort“, Bremsen, Bundle-Pfad). Prüfung mit `--hide efa-duesseldorf,drk-familienbildung-duesseldorf,djk-eibach,post-sv-nuernberg,schwimmschule-baer-ritterbad`: Alle fünf kommen durch die Ortsprüfung.
- **S2 – Messung** (E6), Eingabe `eval` mit eigenem Workflow-Test. Eval mit heutigen Quellen als neuer Ausgangswert, zwei Läufe je Region.
- **S2b – Klärfälle im Wächter** (E5, letzter Punkt), sobald Plan 0048, S2 live ist.
- **S3 – Tiefe** (E4.1–E4.4 und E4.6, Seitenfinder im Modus `alle`). Eval, zwei Läufe.
- **S4 – Quellen** (E2, E3): erst `navigator` und `kikudoo`, dann Namenssuche und Begriffsgruppen, je mit einem Eval-Lauf. `kidsgo` nur, wenn danach Ziel 1 verfehlt wird und die Fehlenden dort stehen. Am Ende zwei Läufe.
- **S5 – Modell** (E7).
- **S6 – Live** je Netz:
  - Voraussetzung: Ziele 1–4 erreicht; für `vrr` zusätzlich Plan 0044 und die Budgetentscheidung.
  - Monats-Crons und `timeout` (E1, E8).
  - Ein Trockenlauf je Netz per `workflow_dispatch`, danach Bremsen auf das Doppelte des Gemessenen.
  - Der Nutzer sieht den Bericht (Aufnahmen und Klärfälle), dann `gh variable set ENTDECKEN_MODUS --body live` (N3).
  - Erster Live-Lauf per `workflow_dispatch`, Zeile „Entdecken live“ von Hand (Ziel 6), `/browser-review live` für neue Anbieter.
- **S7 – Abschluss.** Skill E9, Statuszeile ADR 0032, Restpunkte nach `docs/ideas.md`, archivieren.

## Nutzerentscheide (offen)

- **N1 – Zielwerte.** Empfehlung: wie unter „Ziel“. Je Region gibt es einen Stichproben-Anbieter ohne maschinelle Quelle (musikfuechse, zwergenstube); 90 % lassen je Region noch einen weiteren Fehlschlag zu. Alternative: ≥ 85 % gefunden.
- **N2 – Plattform-Listen als Fundquelle** (Navigator, kikudoo, bei Bedarf kidsgo). Genutzt werden nur Name, Website und Ort, intern; robots.txt wird beachtet. Empfehlung: ja. eversports bleibt außen vor.
- **N3 – Live ohne Abnahme je Aufnahme.** Empfehlung: ja, nach erreichten Zielen und einem abgenommenen Trockenlauf je Netz; Rücknahme per Revert und `abgelehnt`. Alternative: die ersten zwei Monatsläufe nur trocken.

## Kosten

Nach Nutzervorgabe kein Kriterium. Ein Eval-Lauf kostete bisher etwa $1 je Region (API-Gegenwert). Mit Seitenfinder, Quellen und stärkerem Modell rechne ich mit dem 10- bis 50-Fachen.

## Risiken

- **Mehr Kandidaten, mehr Grenzfälle** (Kitas, Praxen ohne Kurse, Kurse erst ab 4). Abhilfe: Ertragsbeweis je Seite, Ziel 3 mit Urteil von Hand, `abgelehnt`.
- **Plattformen ändern sich oder sperren** (kikudoo ist eine inoffizielle API, kidsgo braucht den Browser). Abhilfe: Ein Ausfall kostet nur die Funde der Quelle, der Bericht nennt ihn, Fixtures halten das Parsen fest.
- **Namenssuche ordnet falsch zu.** Abhilfe: Name und Ort bzw. PLZ müssen im abgerufenen Text stehen; Orte müssen in der Region liegen.
- **Eval überschätzt** (Stichprobe aus dem Handkatalog, Quellen aus den Fehlschlägen abgeleitet). Abhilfe: neue Fälle per Zufall, alt und neu getrennt, Ziel 6 misst echte Neuzugänge.
- **Laufzeit.** Abhilfe: Parallelität von Bewerten und Ertragsbeweis (E4.6), höchstens 5 Seiten im Beweis, Zeit je Region, Budget mit geordnetem Ende. Reicht das nicht, teilt S6 den Lauf je Region auf eigene Jobs.
- **Größenbudgets.** Abhilfe: `katalog-budget` mit Prüfung des Stands vor dem Lauf; `vrr` erst nach Plan 0044.

## Review (2026-10-26) – Verdict: Überarbeiten

Unabhängiger Review des Entwurfs. Die Befunde sind am Code nachgeprüft (`validate-data.ts`, `discover.ts`, `check-fast.ts`). Alle sind übernommen; die Begründung steht in der genannten Entscheidung.

- **Blocker:**
  - **B1** `data/discover/geocode.json` macht `data:validate` rot: Cache unter `data/geocode/` mit eigenem Schema, Bundle-Pfad, Trockenlauf nach `runs/` (E5).
  - **B2** Test auf vollständige `arten` hätte jede Aufnahme an G1 scheitern lassen: Test prüft nur die gezogenen IDs, das Ziehen ist ein Skript (E6).
- **Major:**
  - **M3** „kein Ort“: Klärfall nur bei Geocoder ohne Treffer oder Ausfall, außerhalb der Region wird verworfen (E5).
  - **M4** Seitenfinder-Schnittstelle: Modus `alle` in Plan 0049, E1 (E4.1).
  - **M5** leere Seiten: Klärfall nur bei leerer Fund- oder Startseite.
  - **M6** Laufzeit: paralleler Ertragsbeweis mit eigenem Verzeichnis, höchstens 5 Seiten, Tests (E4.3, E4.6).
  - **M7** Budget: `katalog-budget` mit Test und Stand vor dem Lauf (E8).
  - **M8** Klärfälle im Wächter: Schlüssel `k<hash8>`, Zustände als Eingabe, Schritt S2b.
- **Minor:**
  - ADR 0032, Punkt 8, in ADR 0033 und `docs/architecture.md`;
  - Crons um 08:30 nach dem Pflegelauf;
  - Cron-Änderung erst in S6, S2 legt den Workflow-Test für `eval` an;
  - `klaerfaelle` mit Default, `aussetzenBis` und Ende eines Eintrags;
  - `hint` für weggefallene Orte;
  - Geocoder: Treffer in der bbox, `addressdetails`, User-Agent;
  - `ziel4: false` bei `follow`;
  - ungültige Läufe;
  - Rangfolge der Ziele in E7, Fallback bei Opus;
  - Ziel 6 von Hand;
  - S1 mit `--hide`;
  - `CATEGORIES` aus `src/domain/topics.ts`, `--terms`;
  - Zeit je Region;
  - Budgets `vrr` als Voraussetzung.
- **Scope:** Mehrgenerationenhäuser in die Checkliste des Skills; `kidsgo` nur bei Bedarf (E2, S4).

Die Änderungen sind noch nicht unabhängig geprüft; deshalb folgt Review 2.
