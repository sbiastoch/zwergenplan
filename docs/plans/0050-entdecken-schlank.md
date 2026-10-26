# Plan 0050 – Entdecken: wenige gute Quellen, Seitenfinder, keine technischen Verluste

Status: Review eingearbeitet
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`):
  - Punkt 6 (Entdecken findet Anbieter, nicht Seiten);
  - Punkt 4 (Seitenfinder im Entdecken);
  - Punkt 7 (Modell nach Qualität);
  - Punkt 5 (Klärfälle im Wächter);
  - Punkt 1 (ein Abruf);
  - geänderte Wochentage aus ADR 0032, Punkt 8.
- Ersetzt Plan 0045 (`docs/plans/archiv/0045-entdecken-vollstaendig.md`). Dessen Abschnitte „Ausgangslage“, „Quellen“ und „Fundorte der neun nicht gefundenen“ sind die Grundlage hier und werden nicht wiederholt. Übernommen sind dort E5.2–E5.5, E6.3 und E7 in schlankerer Form.
- Plan 0048 (`docs/plans/0048-nachtlauf-seite-als-einheit.md`): Einheit Seite (E1), Wächter (E10), Abruf mit User-Agent und robots.txt (E8).
- Plan 0049 (`docs/plans/0049-seitenfinder.md`): Modul `site-crawl` mit der Schnittstelle des Modus `alle` (E1), `isShared`, `katalog-budget` (E3), Workflow mit `lauf` und `timeout` (E5).
- Plan 0042 (`docs/plans/0042-duesseldorf-katalog-fuellen.md`): Navigator, `partChars`, `abgelehnt` für Portale. Plan 0032, E7–E9 (Entdecken, Bremsen, Eval). ADR 0026, Punkt 5 (G1–G4); ADR 0022 (IDs).

## Voraussetzungen

- **Branch-Basis `main`.** `plan-0039` (Düsseldorf) geht erst nach Plan 0044 live (Plan 0042, N6), und vorher darf von dort nichts nach `main`. Deshalb:
  - Umgesetzt wird auf einem Branch von `main`; jeder Schritt kann für Nürnberg und Fürth live gehen.
  - **Düsseldorfer Teile** kommen als eigene Commits auf `plan-0039` (das regelmäßig auf `main` rebased wird) und gehen mit ihm live. Das sind die Düsseldorfer Stichprobe in `evals/discover.json`, der Eintrag `duesseldorf` in `DISCOVER_SOURCES` mit `navigator` und Tests mit der Region. Der Parser `navigator` selbst kennt keine Region und liegt auf `main`.
  - **Düsseldorfer Evals** laufen auf einem lokalen Integrationszweig (`main` plus `plan-0039`), der nie gepusht wird.
  - Das Ziel-Gate für `vgn` hängt damit nur an Nürnberg; das für `vrr` an Düsseldorf, nach Plan 0044.
- **S1 und S2** hängen nur an dieser Basis.
- **S3** braucht Plan 0049, S1 (Modul) und Plan 0048, S1 (Ertragsbeweis je Einheit).
- **S4** braucht Plan 0048, S3 (Abruf mit robots.txt).
- **S2b** (Klärfälle im Wächter) braucht Plan 0048, S2.
- **S6** braucht Plan 0049, S2 (`katalog-budget`, Workflow mit `lauf`).
- **Live für `vrr`** braucht Plan 0044 (`site.json` je Gebiet) und eine Entscheidung zu den übrigen Budgets, die fast voll sind: `anbieter.json`, Wegzeit und Linien `vrr` (`.size-limit.json`; Plan 0045, N7). Nürnberg und Fürth brauchen das nicht, solange `katalog-budget` grün ist.

## Anlass

Das Entdecken-Eval für Düsseldorf (2026-10-24) fand 5 von 10 ausgeblendeten Anbietern und nahm 2 wieder auf. In Nürnberg (2026-10-11) waren es 6 und 2. Der Nutzer hält das für schlecht; Qualität geht vor Kosten, auch vor dem Kontingent (2026-10-25/26).

Die Ursachen stehen in Plan 0045, „Ausgangslage“:
- **7 der 11 gefundenen Anbieter gingen technisch verloren**, nicht am Urteil des Modells. Gründe:
  - eine Adresse mit Kommentar (`streetPart` in `scripts/pipeline/io/geocode.ts`);
  - ein Tippfehler auf der Seite, und ein Ort ohne Treffer verwirft den ganzen Kandidaten;
  - Orte ohne Postadresse;
  - Detailseiten oder iCal, die das Bewerten nicht sieht.
- **7 der 9 nicht gefundenen** stehen in maschinenlesbaren Listen, die das Entdecken nicht abfragt.

Dazu (geprüft 2026-10-26):
- `tools: web` gibt dem Modell `WebSearch` **und** `WebFetch` frei (`scripts/pipeline/io/llm.ts`). Es ruft so Seiten ohne unseren User-Agent und ohne robots.txt ab.
- Der Geocoder-Cache liegt in `~/.cache/zwergenplan` (`scripts/pipeline/io/cache.ts`) und ist in Actions bei jedem Lauf leer.
- Die Nominatim Usage Policy (abgerufen 2026-10-26) sagt:
  - „Results must be cached on your side. Clients sending repeatedly the same query may be classified as faulty and blocked.“
  - „Scripts running longer than a day and scripts that are run at regular intervals are restricted to 4 requests per minute.“
- Der Job `entdecken` hat `timeout-minutes: 120` (`.github/workflows/discover.yml`), die Wochen-Crons laufen trocken (`ENTDECKEN_MODUS` leer).

## Ziel

Gemessen mit dem Eval aus E6 auf festen Stichproben für Nürnberg und Düsseldorf, je 20 Anbieter, zwei gültige Läufe je Konfiguration, Mittelwert je Region. Ein Lauf, den Bremse, Limit oder Zeitbudget beendet hat, ist nicht gültig.

1. **Gefunden ≥ 90 %** der ausgeblendeten Anbieter: von einer Quelle als Kandidat geliefert.
2. **Wiedergefunden ≥ 80 %:** würde aufgenommen.
3. **Falsch aufgenommen: 0.** Jede Aufnahme ohne Gegenstück in der Stichprobe beurteilt ein Mensch. Das Urteil steht je URL in `evals/discover-urteile.json` und gilt für spätere Läufe weiter. Eine zweite Aufnahme desselben Anbieters zählt als falsch.
4. **Ertrag ≥ 80 %:** Ein wiedergefundener Anbieter trifft im Ertragsbeweis mindestens 80 % der künftigen Termine seines Handeintrags, gemittelt und je Anbieter auf 100 % gedeckelt. Referenz ist der Ertragsbeweis des ausgeblendeten Handeintrags im selben Lauf. Anbieter mit `coveredBy` oder `follow` zählen nicht (`ziel4: false`), denn das Entdecken setzt `follow` nie.
5. **Keine Verwerfung aus technischem Grund:** Netz, 5xx, Bot-Schutz, Geocoder ohne Treffer oder mit Ausfall, ungültige Antwort, mögliche Dublette und Budget machen einen Klärfall (E5), nie eine Verwerfung oder Wiedervorlage. Ein Klärfall verfällt nicht still. HTTP 404/410 und Orte außerhalb der Region verwerfen weiter.
6. **Echte Neuzugänge messen**, ohne Schwelle: Nach jedem Live-Lauf trägt ein Mensch per Skill (Abschnitt 1) eine Zeile in `evals/results.md` ein, Abschnitt „Entdecken live“: aufgenommen, davon bestätigt, zurückgenommen, Klärfälle. Das misst den Monatslauf selbst, nicht nur das Wiederfinden.

Ein Netz kommt erst in `ENTDECKEN_NETZE` (live, E1), wenn die Ziele 1–4 für dessen Regionen erreicht sind (Fürth läuft mit Nürnberg).

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
1. **Kandidaten** aus den Quellen der Region (E2), Websuche und Namenssuche (E3), dazu die offenen Klärfälle (E5).
2. **Vorfilter** gegen Katalog, `abgelehnt`, `zurueckgestellt` und ausgesetzte Klärfälle (`prefilter`, `scripts/pipeline/lib/discover.ts`).
3. **Prüfung** je Kandidat (E4): Seitenfinder, Bewerten, Orte, Ertragsbeweis je Seite.
4. **Aufnahme** mit G1–G4 wie heute.

**Zeit je Region:** Bei `--netz` mit mehreren Regionen bekommt jede einen Anteil am Zeitbudget nach der Zahl ihrer Katalog-Anbieter, mindestens 20 %.

**Takt:**
- **Ab S1** entfallen die Wochen-Crons des Entdeckens. Bis S6 läuft das Entdecken nur per `workflow_dispatch`, also nicht wöchentlich trocken mit 270 Minuten Budget.
- **Ab S6** gibt es zwei Monats-Crons: `30 8 1 * *` für `vgn` und `30 8 2 * *` für `vrr`, Letzterer erst mit Plan 0044.
  - Der Job `modus` (Plan 0049, E5) setzt dafür `lauf=entdecken`.
  - Ein fester Tag des Monats ist nötig, weil GitHub Tag und Wochentag mit „oder“ verknüpft.
  - Um 08:30 UTC ist der Pflegelauf vom Mittwoch oder Donnerstag (ab 04:30, höchstens 210 Min. nach Plan 0049, E5) vorbei, und ein wartender Lauf in der Gruppe `daten` wird nicht verdrängt.
  - Die Wochentage aus ADR 0032, Punkt 8 entfallen (ADR 0033).
- **Live je Netz:** Die Repo-Variable `ENTDECKEN_NETZE` (etwa `vgn`) ersetzt `ENTDECKEN_MODUS`. Sie nennt die Netze, deren Zeitplan-Läufe live sind; leer heißt alles trocken. `workflow_dispatch` behält die Eingabe `modus`. Der Job `modus` setzt das um; ein Workflow-Test prüft es.

### E2 – Quellen je Region

- **Tabelle im Code** `scripts/pipeline/lib/discover-sources.ts` (neu): `DISCOVER_SOURCES: Record<RegionId, SourceUse[]>` mit `{quelle, params?}`. Ein Test prüft, dass jede Region der `REGION_IDS` einen Eintrag hat und die Parameter je Quelle passen.
- **Quellen:** Parser rein in `scripts/pipeline/lib/sources/discover/<quelle>.ts` mit Fixture aus fiktiven Namen; Abruf in `scripts/pipeline/io/discover-sources.ts` über den gemeinsamen Abruf aus Plan 0048, robots.txt eingeschlossen.

| Quelle | Reichweite | Parameter | Inhalt |
|---|---|---|---|
| `sammelkalender` | Region | – | wie heute (`aggregatorFinds`) |
| `linkliste` | Region | – | `role: verzeichnis` der Region, wie heute (`directoryFinds`) |
| `klaerfall` | Region | – | offene Klärfälle aus dem Zustand (E5) |
| `navigator` | NRW | `einrichtungId` | Familien-Navigator: Anbieter und Träger mit Website aus den Angeboten für 0–3 und der Anbieterliste |
| `kikudoo` | bundesweit | – (bbox der Region) | Geo-API, Anbieter mit Lage |
| `kidsgo` | bundesweit | `raum` | nur, wenn das Eval nach `navigator` und `kikudoo` Lücken zeigt (S4): Kategorieseiten im Browser, `/suche/` nicht (robots.txt), nur Einträge mit Ort in der bbox |

- Die Endpunkte und Belege stehen in Plan 0045, „Quellen“. S0 ruft sie erneut ab.
- Funde bekannter Websites werden Hinweise, keine Kandidaten (wie heute).
- Fällt eine Quelle aus, kostet das nur ihre Funde, und der Bericht nennt sie. Liefert sie genau so viele Treffer wie eine Seitengrenze, warnt der Bericht.
- `MAX_DIRECTORY_FINDS` gilt nur für `linkliste`.

### E3 – Websuche und Namenssuche

- **Nur Suche, kein Abruf durch das Modell:** `scripts/pipeline/io/llm.ts` bekommt `tools: "search"` (nur `WebSearch`) neben `"web"`. Websuche und Namenssuche nutzen `"search"`. Jede URL, die das Modell nennt, ruft danach unser Code ab, mit unserem User-Agent und robots.txt (ADR 0033, Punkt 1). `"web"` bleibt für nichts im Einsatz und entfällt, wenn S4 das bestätigt.
- **Formatsuche:** Begriffe in Gruppen nach `CATEGORIES` (`src/domain/topics.ts`), je Gruppe ein Aufruf mit 3–5 Begriffen und dem Regionsnamen. Die Gruppen stehen in `scripts/pipeline/lib/discover-terms.ts`.
  - Neu sind unter anderem Familiencafé, Elterncafé, Offener Treff, Spielgruppe, Mutter-Kind-Gruppe, Babytreff, Kinderturnen 1–3 Jahre, Babyyoga, Rückbildung mit Baby, Delfi, Prager Eltern-Kind-Programm, Zumbini, Kangatraining, Babytheater und Bilderbuchkino.
  - `--terms` ersetzt die Gruppen durch eine einzige.
  - `SEARCH_MAX_TURNS` steigt von 10 auf 30, `SearchResponse` von `max(20)` auf `max(25)`.
- **Portaltreffer auflösen statt verwerfen:** Der Suchprompt nimmt Treffer auf Sammelportalen und Buchungsplattformen auf, wenn sie einen Veranstalter nennen (`{name, url, portal: true}`). Der Code gibt den Namen an die Namenssuche. Portale in `abgelehnt` bleiben als Fund-URL gesperrt.
- **Namenssuche** (`scripts/pipeline/prompt/discover-resolve.md`, neu):
  - bis zu 10 Namen je Aufruf mit Ort und Art;
  - Antwort je Name eine URL oder `null`;
  - eine URL zählt nur, wenn ihr Abruf den Namen (`similarName` gegen Seitentitel und Überschriften; `extractPage` liefert dafür neu `title` und `headings`, ohne den Text zu ändern) **und** den Stadtnamen (`REGIONS`) oder einen Stadtteil der Region (`src/domain/districts.ts`) enthält;
  - ohne eigene Website bleibt ein Plattform-Profil die Fund-URL, wenn es Termine zeigt. Der Seitenfinder bleibt dann unterhalb des Profil-Pfads mit gleichem Mandanten (Plan 0049, E1).

### E4 – Prüfung in die Tiefe

1. **Seitenfinder, Modus `alle`** (Schnittstelle in Plan 0049, E1, gebaut in S3), ab Fund-URL und Startseite der Website, höchstens 20 Seiten. Darin sind höchstens zwei Kontakt-, Anfahrts- oder Impressumsseiten (ADR 0033, Punkt 4). Er ersetzt `contactLinks` und `MAX_CONTACT_PAGES`.
   - Liegt die Fund-URL auf einer **geteilten Website** (`isShared`, Plan 0049, E1), startet er nur an der Fund-URL, nie an der Wurzel. Sonst erkundete er etwa ganz `nuernberg.de`.
   - Eine JavaScript-Seite (`jsRendered`) ruft er einmal im Browser ab.
   - Bleiben **Fund-Seite oder Startseite** leer, wird der Kandidat ein Klärfall. Leere Nebenseiten fallen still weg.
2. **Bewerten** mit allen erkundeten Seiten als `## SEITE: <URL>`, je Seite höchstens 15 000 Zeichen, zusammen höchstens 150 000, dazu die Linklisten.
   - Programmseiten müssen aus den erkundeten URLs oder ihren Links stammen (`allowedUrlsOf` auf die Erkundung erweitert).
   - `AssessEntrySchema`: `venues.max(20)`, `programme.max(20)`.
   - Orte dürfen als „Name, Ort“ kommen, wenn die Seite keine Postadresse nennt (Turnhalle, Bad).
   - Bei ungültiger Antwort einmal das nächststärkere Modell (Haiku → Sonnet → Opus); bei Opus ein zweiter Versuch mit Opus.
3. **IDs vor dem Beweis:** Sobald der Eintrag gebaut ist (nach Bewerten und Orten), reserviert ein serieller Schritt Katalog-ID, `publicId` und Orts-IDs gegen den laufenden Katalog und die Reservierungen des Laufs.
   - Der Ertragsbeweis braucht sie: Sie stehen im Auszug, in Schlüssel und Nachricht, und die Events verweisen auf die Orts-IDs.
   - Bei Verwerfung oder Klärfall gibt der Lauf die Reservierung frei.
   - **Rohdatei:** Nach dem Beweis steht der endgültige Eintrag fest, ohne Seiten ohne Ertrag und vielleicht mit `partChars`. `refreshProvider` läuft dann einmal mit diesem Eintrag. Gleiche Schlüssel brauchen keinen Modellaufruf; Einheiten, deren Schlüssel sich durch `partChars` ändert, werden dabei neu extrahiert. Erst diese Rohdatei wird nach `data/raw` kopiert. So enthält sie keine Einheiten gestrichener Seiten, die sonst als verwaist gälten (Plan 0048, E1).
4. **Ertragsbeweis je Seite:** Jede vorgeschlagene Programmseite, also höchstens 20, ist eine Einheit (Plan 0048, E1). Alle laufen in den Beweis.
   - Seiten ohne Ertrag fallen aus dem Eintrag. Aufgenommen wird nur mit mindestens einer Seite mit Ertrag (`proveYield` wie heute).
   - Scheitert eine Seite mit „abgeschnitten“, folgt ein zweiter Beweis mit `partChars: 4500`; gelingt er, steht `partChars` im neuen Eintrag.
   - Der Bericht nennt die Seiten ohne Ertrag (Wunsch aus Review 2 von Plan 0048).
5. **Zweite Runde:** Liefert keine Seite Ertrag, bekommt das Bewerten einmal die Rückmeldung („Seite X lieferte keine Termine“) mit denselben Seiten und wählt neu. Danach ein zweiter Ertragsbeweis.
6. **Mögliche Dublette** (seriell vor der Aufnahme): Hat der neue Eintrag dieselbe Programmseite wie ein Katalog-Eintrag, oder einen ähnlichen **Anbieternamen** (`similarName`) und einen Ort im Umkreis von 100 m, wird er nicht aufgenommen, sondern ein **Klärfall** „Dublette von <id>?“. Gastanbieter in einem Familienzentrum haben andere Namen und bleiben so Kandidaten. Ein Mensch entscheidet; dabei gilt der Grundsatz „lieber Dublette als verschluckter Anbieter“ (`scripts/pipeline/lib/discover.ts`).
7. **Parallel und seriell:**
   - **Parallel:** Bewerten und die Extraktion im Ertragsbeweis, je Kandidat mit eigenem temporären Verzeichnis statt `proofRaw/<id>.json`. Standard 4 gleichzeitig, `DISCOVER_CONCURRENCY`.
   - **Seriell:** Geocoder (Warteschlange), ID-Reservierung, Build-Probelauf, Dublettenprüfung, G3, Aufnahme und Commit.
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
  3. Benannter Ort ohne Adresse: Name und Stadt, `limit=5`, nur `category`/`type` aus einer festen Liste (Sporthalle, Schwimmbad, Schule, Kirche, Gemeindezentrum, Kita, Bibliothek). Die Adresse im Eintrag wird aus `addressdetails` gebaut („Straße Nr, PLZ Ort“, ohne `road` als „Name, PLZ Ort“), nicht aus `display_name`, weil sie im Detail und im Routen-Link erscheint.

  `municipality` kommt wie heute aus `addressdetails` (Gemeinde-Prüfung). Der User-Agent folgt Plan 0048, E8. Die Schnittstelle wird `geocode(address, { region, venueName? })`.
- **Nominatim nach seiner Policy:**
  - **Bekannte Orte zuerst:** Stimmt die normalisierte Adresse mit einem Ort im Katalog überein, gilt dessen Lage ohne Anfrage.
  - **Rate:** höchstens 4 Anfragen pro Minute in jedem Lauf der Pipeline, ob geplant, Eval oder lokal (Policy: regelmäßig laufende Skripte). Die Warteschlange läuft neben den Modellaufrufen her und hält den Lauf so kaum auf.
  - **Cache im Zustand:** Positive Treffer stehen in `DiscoverState.orte` der Region (`data/discover/<region>.json`, `.default({})`). Schlüssel ist die normalisierte Anfrage mit Stufe und Region; der Wert ist `{lat, lon, adresse, municipality, district, datum}`.
    - Der Pfad ist schon in den Pfadlisten von `discover-git.ts` und im Bundle, Biome nimmt ihn aus, und `data:validate` prüft ihn über `DiscoverState`.
    - Treffer gelten 12 Monate. „Kein Treffer“ und Fehler werden nicht gespeichert.
    - Im Trockenlauf landet der Zustand nur unter `runs/`.
  - Der Bericht nennt die Zahl der Anfragen an Nominatim.
- **Ein Ort ohne Treffer** fällt allein weg, mit Hinweis im Bericht und im Commit-Text, aber nur bei „kein Treffer“.
  - Die Terminseiten bekommen dann den `hint` „Termine an … weglassen“, der **nur die weggelassenen Orte** nennt; sonst landeten deren Termine am ersten Ort. Passt er nicht in die 200 Zeichen eines `hint`, wird der Kandidat ein Klärfall. Heute nennt `outsideHint` (`scripts/pipeline/lib/discover.ts`) die inneren Orte und kürzt still auf 200 Zeichen; bei bis zu 20 Orten fielen so Termine weg.
  - Wechselwirkung: Mit diesem `hint` nimmt der Pflegelauf den Anbieter nur in den Bericht (Plan 0049, E5). Wer den Ort von Hand nachträgt, entfernt den `hint` (Skill, Abschnitt 6).
- **Fällt der Geocoder für einen Ort aus** (Netz, 403/429, 5xx), wird der ganze Kandidat ein Klärfall; ein technischer Grund kostet so keinen Ort dauerhaft. Ebenso, wenn einige Orte außerhalb liegen und die übrigen keinen Treffer haben.
- **Drei Ausgänge:**
  - **aufgenommen**;
  - **verworfen**, mit Wiedervorlage nach 8 Wochen wie heute: inhaltliches Nein, kein Ertrag nach der zweiten Runde, HTTP 404/410, robots.txt sperrt alle Programmseiten (ab S4), **alle Orte außerhalb der Region oder Gemeinde**;
  - **Klärfall**, ohne Wiedervorlage:
    - Netz, 5xx oder Bot-Schutz;
    - Fund- oder Startseite leer;
    - robots.txt nicht lesbar oder Fund-URL von robots.txt gesperrt (ab S4);
    - **Geocoder ohne Treffer für alle Orte, oder Ausfall für einen Ort**;
    - `hint` für weggelassene Orte zu lang;
    - ungültige Antwort nach Fallback;
    - mögliche Dublette (E4.6);
    - Budget (E8).
- **Klärfälle im Zustand:** `DiscoverState` bekommt `klaerfaelle` mit `.default([])`; ein Eintrag ist `{url, name, grund, seit, zuletzt, anzahl, aussetzenBis?}`.
  - Jeder Lauf speist die offenen Klärfälle als Quelle `klaerfall` ein (E2). Sie hängen also nicht davon ab, dass die Websuche sie wieder liefert.
  - Ab drei Klärfällen in Folge setzt `aussetzenBis` = `today` + 35 Tage einen Monatslauf aus.
  - Ein Eintrag endet durch Aufnahme, Verwerfung oder einen Menschen. Ein Mensch kann ihn in `abgelehnt` eintragen (Skill, Abschnitt 2) oder den Anbieter von Hand aufnehmen; dann erkennt der Vorfilter den Klärfall als bekannt (Katalog-URL oder „Host und Name wie …“) und beendet ihn.
  - Klärfälle aus Zeitbudget, Limit, G3, Budget oder einem Ausfall des Geocoders liegen nicht am Kandidaten und zählen nicht für „drei in Folge“.
  - Im Trockenlauf stehen Klärfälle nur im Bericht; ins Repo kommen sie nur im Modus `live`.
- **Klärfälle im Wächter** (S2b): `watchFindings` (Plan 0048, E10) bekommt die Zustände `data/discover/*.json` und meldet die Art `klaerfall` mit Name, Grund und Fund-URL, ab `anzahl` ≥ 2, wie Seiten ab dem zweiten Tag. Sonst flutete ein Monatslauf mit neuen Quellen das Issue. Der Schlüssel im Marker ist `k<die ersten 8 Hex-Zeichen des SHA-256 der normalisierten URL>`. Ein eigenes Issue gibt es dafür nicht.

### E6 – Eval

- **Stichproben** in `evals/discover.json` (neu): je Region 20 Anbieter (Nürnberg, Düsseldorf).
  - Dabei sind die 20 bisher genutzten, markiert mit `alt: true`.
  - Die übrigen 10 je Region zieht ein Skript in S0 mit gesetztem Zufall je Trägerart, ohne Blick auf die Quellen. Die Trägerarten ordnet S0 für alle Katalog-Anbieter beider Regionen von Hand zu und legt sie unter `arten` ab.
  - Nicht gezogen werden Anbieter mit `skipCrawl`. Ob ein Anbieter für Ziel 4 zählt, leitet das Eval zur Laufzeit ab (nicht bei `coveredBy` oder `follow`); gespeichert wird das nicht, sonst machte jedes neue `follow` die Tests rot.
- **Test** `scripts/pipeline/io/eval-discover.test.ts`: Jede ID in Stichprobe und `arten` steht im Katalog, hat die Rolle `anbieter`, die Region stimmt, 20 je Region der Datei, jede Stichprobe hat eine Art. Auf `main` stehen nur Nürnberg und Fürth in der Datei, Düsseldorf kommt mit `plan-0039` (Voraussetzungen). **Nicht** geprüft wird, ob `arten` den ganzen Katalog abdeckt; sonst machte jeder neue Anbieter G1 und die CI rot.
- **Urteile von Hand:** `evals/discover-urteile.json` (neu) hält je URL einer zusätzlichen Aufnahme das Urteil (passend, falsch, Dublette) mit Datum. Ein Mensch beurteilt jede URL nur einmal; spätere Läufe übernehmen das Urteil.
- **Aufruf** `pnpm pipeline discover --dry-run --eval [--region …] [--run-dir …]`:
  - blendet die Stichprobe aus;
  - ignoriert `zurueckgestellt` und `klaerfaelle`;
  - schaltet G3 aus;
  - legt ein eigenes Laufverzeichnis an: `runs/<datum>/discover`, bei Bedarf `-2`, `-3`.
- **Zuordnung 1:1** (`hiddenEval`): gleiche URL vor gleicher Website (`sameSite` der Startseite, nicht auf geteilten Websites nach Plan 0049, E1) vor Ortsnähe (100 m, `similarName`). Je Anbieter zählt die beste Zuordnung; weitere Aufnahmen desselben Anbieters sind falsch.
- **Ertrag** (Ziel 4): Für jeden wiedergefundenen Anbieter läuft im selben Lauf der Ertragsbeweis seines Handeintrags als Referenz (`runs/<datum>/discover/referenz/`). Die Termine werden 1:1 über Ort (≤ 100 m) und Beginn zugeordnet, im Fenster heute bis +8 Wochen.
- **Kennzahlen je Stufe** in Bericht und `evals/results.md`: gefunden je Quelle, aufgelöst, nach Vorfilter, bewertet „aufnehmen“, Orte aufgelöst, Ertragsbeweis (erste/zweite Runde), wiedergefunden, Klärfälle, Dubletten, Gültigkeit des Laufs; alte und neue Fälle getrennt. Die Tabelle „Entdecken“ bekommt die Spalten; alte Zeilen erhalten „–“.
- **Ort der Läufe:** lokal oder per `workflow_dispatch` mit Eingabe `eval: true` (nur Trockenlauf). Die `concurrency`-Gruppe kommt aus einem Ausdruck über `inputs.eval` (`daten` oder `entdecken-eval`); ein Workflow-Test prüft das. Ein Eval darf den Nachtlauf (01:30–04:30 UTC) nicht schneiden: Der Job `modus` lehnt den Start ab, wenn Start plus `timeout` in dieses Fenster fällt.

### E7 – Modell

Für Suche, Namenssuche und Bewerten vergleicht S5 Sonnet und Opus, je zwei gültige Eval-Läufe. Haiku läuft nur mit, wenn die beiden gleichauf liegen.
- **Rangfolge:** Ziel 3 ist hart (ein Modell mit falscher Aufnahme scheidet aus), dann zählt Ziel 2, dann 1, dann 4. Bei Gleichstand gewinnt das schnellere (ADR 0033, Punkt 7).
- `LLM_MODEL_DISCOVER` wird in `.github/workflows/discover.yml` gesetzt; der Nachtlauf nutzt es nicht.

### E8 – Grenzen, Budget im Lauf, G3

- **Bremsen:** `DISCOVER_BRAKES` (`scripts/pipeline/lib/cost.ts`) und `DISCOVER_BUDGET_MIN` (`scripts/pipeline/io/discover.ts`).
  - Ab S1: 1500 Aufrufe, 150 Mio. Tokens, 240 Min. Dazu setzt S1 `timeout-minutes` des Jobs `entdecken` direkt auf 330. Ab S6 kommt der Wert aus `timeout` (Plan 0049, E5: Budget + 90).
  - Die Obergrenze ist ein Job von 330 Minuten; GitHub erlaubt höchstens 6 Stunden. S6 setzt die Bremsen auf das Doppelte des größten gemessenen Laufs, aber nie über diese Grenze.
  - Reicht die Zeit für `vgn` (zwei Regionen) nicht, bekommt jede Region einen eigenen Job.
  - Die `workflow_dispatch`-Standards ziehen mit.
- **G3 im Monatstakt:** 25 neue Anbieter je Region und Lauf, bei `--bootstrap` weiter `max_new`.
- **Budget im Lauf:** über `pnpm pipeline katalog-budget` aus Plan 0049, E3: zuerst der Stand vor dem Lauf, dann der Build mit den neuen Rohdateien, `pnpm build` und `pnpm size`. Ist das rot:
  - Der Lauf **verwirft** die Anbieter-Commits (Reset auf den Stand vor dem Lauf, dann nur der Zustands-Commit), nicht per Revert, wegen `MAX_COMMITS: 100`.
  - Die betroffenen Kandidaten werden Klärfälle mit Grund `budget`.
  - Der Job endet grün mit Ausgabe `budget=rot`; `ampel` liest sie und wird rot.

  Der Workflow-Test prüft Reihenfolge, Ausgabe und Ampel.

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
| `scripts/pipeline/io/geocode.ts` | Reihenfolge, Treffer in der bbox, benannte Orte mit `addressdetails`, Katalog zuerst, 4/min, Cache im Zustand, Schnittstelle | S1 |
| `scripts/pipeline/lib/discover-state.ts` | `klaerfaelle`, `orte` | S1 |
| `scripts/pipeline/lib/html-extract.ts` | `title` und `headings` in `PageExtract` (Text unverändert) | S4 |
| `scripts/pipeline/io/discover.ts`, `scripts/pipeline/lib/discover.ts` | Orte mit `hint`, Klärfälle samt Quelle `klaerfall`, Dublette als Klärfall (S1); Eval, Kennzahlen, Ertrag (S2); Seitenfinder, ID-Reservierung, Ertrag je Seite, zweite Runde, `partChars`, Parallelität (S3); Quellen, Namenssuche, Portaltreffer, Zeit je Region (S4) | S1–S4 |
| `scripts/pipeline/io/llm.ts` | `tools: "search"` | S4 |
| `scripts/pipeline/lib/watch.ts` | Art `klaerfall`, Zustände als Eingabe | S2b |
| `scripts/pipeline/prompt/discover-assess.md`, `discover-search.md`; `discover-resolve.md` (neu) | „Name, Ort“; Seitenformat; Portaltreffer; Namenssuche | S1, S3, S4 |
| `scripts/pipeline/lib/discover-sources.ts` (neu), `scripts/pipeline/lib/sources/discover/*.ts` (neu), `scripts/pipeline/io/discover-sources.ts` (neu) | Quellentabelle und Quellen | S4 |
| `scripts/pipeline/lib/discover-terms.ts` | Begriffsgruppen nach `CATEGORIES` | S4 |
| `scripts/pipeline/cli.ts` | `--eval`, `--run-dir`, `--terms` | S2, S4 |
| `scripts/pipeline/lib/cost.ts` | `DISCOVER_BRAKES` | S1, S6 |
| `.github/workflows/discover.yml`, `scripts/lib/discover-workflow.test.ts` | Wochen-Crons aus, `timeout-minutes` 330 (S1); Eingabe `eval`, `concurrency` per Ausdruck, kein Start im Nachtlauf-Fenster (S2); Monats-Crons, `ENTDECKEN_NETZE` statt `ENTDECKEN_MODUS`, Budgetschritt (S6) | S1, S2, S6 |
| `evals/discover.json` (neu), `evals/discover-urteile.json` (neu), `evals/results.md` | Stichproben, Urteile, Spalten, Abschnitt „Entdecken live“ | S0, S2, S6 |
| `docs/architecture.md` | neue Module (`address`, `discover-sources`, `sources/discover`), Takt, Zeile zu ADR 0032, Punkt 8 | S1, S4, S6 |
| Skill (Abschnitte 1, 2, 6), Statuszeile ADR 0032 | Doku | S1–S7 |

## Tests (test-first)

- `lib/address.test.ts`:
  - Kommentar in Klammern;
  - Straße am Anfang;
  - „str.56“;
  - „Str.“ gegen „straße“;
  - die zwei Düsseldorfer Adressen aus dem Eval.
- `io/geocode.test.ts` (mit `fetchImpl`, Fake-Uhr):
  - die Reihenfolge bricht beim ersten Treffer in der bbox ab, ein Treffer außerhalb zählt nicht;
  - benannter Ort nur mit erlaubter Kategorie, Adresse aus `addressdetails`, ohne `road` „Name, PLZ Ort“, `municipality` gesetzt;
  - Adresse eines Katalog-Orts → keine Anfrage;
  - höchstens 4 Anfragen pro Minute;
  - Treffer landen in `orte`, Fehler und „kein Treffer“ nicht; Trockenlauf schreibt nur nach `runs/`;
  - ein Treffer älter als 12 Monate wird neu angefragt.
- `io/discover.test.ts`:
  - ein Ort ohne Treffer → Eintrag mit den übrigen, Hinweis und `hint`, der nur den weggelassenen Ort nennt;
  - 20 Orte, `hint` über 200 Zeichen → Klärfall;
  - Geocoder-Ausfall (429) für einen von drei Orten → Klärfall, kein Ort geht verloren;
  - einige Orte außerhalb, die übrigen ohne Treffer → Klärfall;
  - Geocoder ohne Treffer für alle Orte → Klärfall ohne Wiedervorlage, ab dem dritten `aussetzenBis` = heute + 35; Ausfälle und `budget` zählen dabei nicht;
  - Fund auf einer geteilten Website (`nuernberg.de`) → Seitenfinder startet nicht an `/`;
  - Fund-URL von robots.txt gesperrt → Klärfall;
  - die Quelle `kikudoo` fällt aus → die übrigen laufen, der Bericht nennt sie;
  - Portal in `abgelehnt` → keine Fund-URL, Name trotzdem in der Namenssuche;
  - G3 mit vier parallelen Kandidaten → nie mehr als G3 Aufnahmen;
  - Rohdatei nach dem Beweis neu mit dem endgültigen Eintrag, ohne Einheiten gestrichener Seiten;
  - Klärfall `budget` nach rotem `katalog-budget`;
  - offener Klärfall kommt im nächsten Lauf über die Quelle `klaerfall` wieder, auch ohne Websuche;
  - alle Orte außerhalb der Region → verworfen mit Wiedervorlage;
  - Netzfehler, 5xx und Bot-Schutz → Klärfall; 404/410 → verworfen;
  - Fund-Seite leer nach Browser → Klärfall; leere Nebenseite → weggelassen;
  - Seite ohne Ertrag fällt aus dem Eintrag; alle 20 vorgeschlagenen Seiten gehen in den Beweis;
  - zweite Runde nimmt auf;
  - `abgeschnitten` → zweiter Beweis mit `partChars`;
  - ungültige Antwort → stärkeres Modell;
  - mögliche Dublette (ähnlicher Anbietername, Ort ≤ 100 m) → Klärfall, nicht aufgenommen; Gastanbieter mit anderem Namen am selben Ort → normaler Kandidat;
  - Portaltreffer geht in die Namenssuche; eine URL ohne Name und Stadt bzw. Stadtteil im Text zählt nicht;
  - **IDs werden vor dem Beweis reserviert:** zwei parallel geprüfte Kandidaten mit gleichem Namen bekommen verschiedene IDs, der Beweis nutzt sie, und eine Verwerfung gibt sie frei;
  - `limit` in einem von vier parallelen Aufrufen stoppt alle;
  - Geocoder-Abstand ≥ 1 s auch bei parallelen Kandidaten;
  - Klärfälle gelangen im Trockenlauf nicht in den Zustand.
- `io/llm.test.ts`: `tools: "search"` gibt nur `WebSearch` frei.
- `lib/discover.test.ts`:
  - Zuordnung 1:1 mit Vorrang;
  - geteilte Websites, beide Paare (`stadtkirche-nuernberg.de`, `evdus.de`);
  - Ertrag gegen die Referenz, gedeckelt;
  - Kennzahlen je Stufe;
  - `--eval` ignoriert Zustand und G3;
  - ein Lauf mit Bremse ist ungültig;
  - Zeit je Region mindestens 20 %;
  - Urteile aus `evals/discover-urteile.json` werden übernommen.
- `lib/discover-state.test.ts`:
  - bestehende Dateien ohne `klaerfaelle` und `orte` bleiben gültig;
  - ein Eintrag endet durch Aufnahme, Verwerfung, `abgelehnt` oder Aufnahme von Hand (der Vorfilter erkennt ihn als bekannt), sonst nicht.
- `lib/watch.test.ts`: Art `klaerfall` mit Schlüssel `k<hash8>` erst ab `anzahl` ≥ 2; Marker gültig.
- `lib/sources/discover/*.test.ts`: je Quelle eine Fixture, Seitengrenze, bekannte Website als Hinweis, Region über bbox.
- `lib/discover-sources.test.ts`: jede Region hat einen Eintrag, Parameter je Quelle.
- `scripts/pipeline/io/eval-discover.test.ts`: wie E6.
- `scripts/lib/discover-workflow.test.ts`:
  - ab S1 kein Wochen-Cron für `entdecken`, `timeout-minutes` ≤ 330;
  - Eingabe `eval` nur im Trockenlauf, `concurrency` aus dem Ausdruck, Start im Nachtlauf-Fenster abgelehnt;
  - ab S6: Monats-Crons → `lauf=entdecken`, `ENTDECKEN_NETZE` schaltet live nur für genannte Netze (leer = trocken), `katalog-budget` vor der Übergabe, `ampel` liest `budget`.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected`, bei Daten mit `--smoke`, und mit `/arch-review`.

- **S0 – Vorbereitung.**
  - Trägerarten zuordnen und `evals/discover.json` per Skript ziehen (E6).
  - Endpunkte von `navigator`, `kikudoo` und `kidsgo` erneut abrufen.
  - Probe: die neun Namenssuchen aus Plan 0045, „Fundorte“, einmal über die Websuche der Pipeline (`claude -p`, nur `WebSearch`).
- **S1 – Härte.**
  - Umfang: E5 ohne den Wächter und ohne die Klärfälle, die robots.txt betreffen; E4.6; Prompt „Name, Ort“; Bremsen; Wochen-Crons aus und `timeout-minutes` 330 (E1, E8).
  - Prüfung **offline** und damit unabhängig von der Websuche: die Orte der Kandidaten aus den Berichten der Evals vom 2026-10-11 und 2026-10-24 (`runs/…/report.json`) gegen den neuen Geocoder. Die Orte von efa, DRK und den drei Nürnberger Anbietern ohne Postadresse (djk-eibach, post-sv-nuernberg, schwimmschule-baer-ritterbad) bekommen einen Treffer. Die Düsseldorfer Fälle laufen auf dem Integrationszweig (Voraussetzungen).
- **S2 – Messung** (E6), Eingabe `eval` mit eigenem Workflow-Test. Eval mit heutigen Quellen als neuer Ausgangswert, zwei Läufe je Region.
- **S2b – Klärfälle im Wächter** (E5, letzter Punkt), sobald Plan 0048, S2 live ist.
- **S3 – Tiefe** (E4.1–E4.5 und E4.7, Seitenfinder im Modus `alle`, ID-Reservierung). Eval, zwei Läufe.
- **S4 – Quellen** (E2, E3) mit `tools: "search"`:
  - erst `navigator` und `kikudoo`, dann Namenssuche und Begriffsgruppen, je mit einem Eval-Lauf;
  - `kidsgo` nur, wenn danach Ziel 1 verfehlt wird und die Fehlenden dort stehen;
  - Klärfälle aus robots.txt;
  - am Ende zwei Läufe.
- **S5 – Modell** (E7).
- **S6 – Live** je Netz:
  - Voraussetzung: Ziele 1–4 erreicht und Plan 0049, S2 live; für `vrr` zusätzlich Plan 0044 und die Budgetentscheidung.
  - Monats-Crons, `timeout` aus Plan 0049, `ENTDECKEN_NETZE`, Budgetschritt (E1, E8).
  - Ein Trockenlauf je Netz per `workflow_dispatch`, danach Bremsen auf das Doppelte des Gemessenen, gedeckelt.
  - Der Nutzer sieht den Bericht (Aufnahmen und Klärfälle). Dann `gh variable set ENTDECKEN_NETZE --body vgn` (N3); `ENTDECKEN_MODUS` entfällt.
  - Erster Live-Lauf per `workflow_dispatch`, Zeile „Entdecken live“ von Hand (Ziel 6), `/browser-review live` für neue Anbieter.
- **S7 – Abschluss.** Skill E9, Statuszeile ADR 0032, Restpunkte nach `docs/ideas.md`, archivieren.

## Nutzerentscheide (offen)

- **N1 – Zielwerte.** Empfehlung: wie unter „Ziel“. Je Region gibt es einen Stichproben-Anbieter ohne maschinelle Quelle (musikfuechse, zwergenstube); 90 % lassen je Region noch einen weiteren Fehlschlag zu. Alternative: ≥ 85 % gefunden.
- **N2 – Plattform-Listen als Fundquelle** (Navigator, kikudoo, bei Bedarf kidsgo). Genutzt werden nur Name, Website und Ort, intern; robots.txt wird beachtet. Empfehlung: ja. eversports bleibt außen vor.
- **N3 – Live ohne Abnahme je Aufnahme.** Empfehlung: ja, nach erreichten Zielen und einem abgenommenen Trockenlauf je Netz; Rücknahme per Revert und `abgelehnt`. Alternative: die ersten zwei Monatsläufe nur trocken.

## Kosten

Nach Nutzervorgabe kein Kriterium, auch das Kontingent nicht (2026-10-26). Ein Eval-Lauf kostete bisher etwa $1 je Region (API-Gegenwert). Mit Seitenfinder, Quellen und stärkerem Modell rechne ich mit dem 10- bis 50-Fachen.

## Risiken

- **Mehr Kandidaten, mehr Grenzfälle** (Kitas, Praxen ohne Kurse, Kurse erst ab 4). Abhilfe: Ertragsbeweis je Seite, Ziel 3 mit Urteil von Hand, `abgelehnt`.
- **Plattformen ändern sich oder sperren** (kikudoo ist eine inoffizielle API, kidsgo braucht den Browser). Abhilfe: Ein Ausfall kostet nur die Funde der Quelle, der Bericht nennt ihn, Fixtures halten das Parsen fest.
- **Namenssuche ordnet falsch zu.** Abhilfe: Name und Stadt bzw. Stadtteil müssen im abgerufenen Text stehen; Orte müssen in der Region liegen.
- **Eval überschätzt** (Stichprobe aus dem Handkatalog, Quellen aus den Fehlschlägen abgeleitet). Abhilfe: neue Fälle per Zufall, alt und neu getrennt, Ziel 6 misst echte Neuzugänge.
- **Laufzeit.** Abhilfe:
  - Parallelität von Bewerten und Ertragsbeweis (E4.7);
  - Zeit je Region;
  - Budget mit geordnetem Ende;
  - Job höchstens 330 Minuten, notfalls ein Job je Region.
- **Ein `limit` macht einen Eval-Lauf ungültig.** Abhilfe: Ungültige Läufe zählen nicht und werden wiederholt; Evals nicht im Fenster des Nachtlaufs. Ein Kontingent ist nach Nutzervorgabe kein Grund, weniger zu messen.
- **Größenbudgets.** Abhilfe: `katalog-budget` mit Prüfung des Stands vor dem Lauf; `vrr` erst nach Plan 0044.

## Review (2026-10-26) – Verdict: Überarbeiten

Unabhängiger Review des Entwurfs. Alle Befunde sind übernommen:
- **Blocker:**
  - **B1** Geocoder-Cache unter `data/discover/` (inzwischen ganz gestrichen, siehe Review 2);
  - **B2** Test auf vollständige `arten`.
- **Major:**
  - **M3** „kein Ort“;
  - **M4** Modus `alle`;
  - **M5** leere Seiten;
  - **M6** Laufzeit;
  - **M7** `katalog-budget`;
  - **M8** Klärfälle im Wächter.
- **Minor:** übernommen.
- **Scope:** Mehrgenerationenhäuser in die Checkliste, `kidsgo` nur bei Bedarf.

## Review 2 (2026-10-26) – Verdict: Überarbeiten

Zweiter, unabhängiger Review. Befunde am Code geprüft (`discover-git.ts`, `biome.json`, `normalize.ts`, `llm.ts`, `discover.yml`).

**Blocker**
- **B1 Geocoder-Cache im Repo hätte den ersten Live-Lauf gebrochen** (Pfadlisten in `discover-git.ts`, Biome): übernommen in einfacherer Form. Der Cache im Repo entfällt ganz (Nicht-Ziele), weil ein Monatslauf mit 1/s nur Minuten braucht. Damit entfallen auch M7 (Schichtung) und die Minor-Punkte zum Cache.

**Major**
- **M1 IDs nach dem parallelen Beweis:** übernommen. IDs werden vor dem Beweis reserviert und bei Verwerfung freigegeben (E4.3, Test).
- **M2 S1 hing an Plan 0049, Laufzeitgrenze:** übernommen. S1 setzt `timeout-minutes` 330 selbst, die Wochen-Crons entfallen bis S6, Obergrenze 330 (E1, E8).
- **M3 Abo-Limit als Risiko:** teilweise übernommen. Evals laufen nicht im Fenster des Nachtlaufs, die Wochen-Crons entfallen, ungültige Läufe werden wiederholt. **Abgelehnt** ist eine eigene Regel oder API-Zugang wegen des Kontingents. Grund: Nutzervorgabe vom 2026-10-26, das Kontingent ist kein Argument.
- **M4 Ziel 4 mit höchstens 5 Seiten unerreichbar:** übernommen. Alle vorgeschlagenen Seiten, höchstens 20, gehen in den Beweis (E4.4).
- **M5 Klärfälle verfielen still:** übernommen. Quelle `klaerfall`, Feld `zuletzt`, Ende nur durch Aufnahme, Verwerfung oder Mensch, `aussetzenBis` = heute + 35 (E2, E5).
- **M6 Modell ruft per `WebFetch` ab:** übernommen. `tools: "search"` (nur `WebSearch`) für Websuche und Namenssuche (E3).
- **M7 Schichtung des Cache-Schemas:** entfällt mit B1. Die neuen Module stehen in der Zeile zu `docs/architecture.md`.

**Minor**, übernommen:
- Dublette als Klärfall statt Sperre.
- Budget rot: Klärfall `budget`, Commits verwerfen statt Revert (`MAX_COMMITS`); dasselbe in Plan 0049, E3.
- `ENTDECKEN_NETZE` je Netz.
- Klärfälle zu robots.txt erst in S4.
- Namenssuche über Stadt- oder Stadtteilnamen und `similarName`.
- Weggefallener Ort samt Wechselwirkung mit Plan 0049.
- `/arch-review` in jedem Schritt.
- `concurrency` per Ausdruck.
- Haiku nur bei Gleichstand.
- Urteile je URL.
- S6 braucht Plan 0049, S2.

Nach dem Skill ist noch ein Review erlaubt. Die Lösungen von B1 und M1–M6 prüft Review 3.

## Review 3 (2026-10-26) – Verdict: Überarbeiten

Dritter, unabhängiger Review (letzter erlaubter Durchgang nach dem Skill). Die Angaben im „Anlass“ sind am Code bestätigt. Alle Punkte übernommen:

**Blocker**
- **B1 Branch-Basis `plan-0039`:** Vor Plan 0044 wäre so nichts live gegangen (Plan 0042, N6), und Düsseldorfer Schlüssel wären auf `main` nicht übersetzbar gewesen. **Gelöst:**
  - Umsetzung von `main`;
  - Düsseldorfer Teile als eigene Commits auf `plan-0039`;
  - Düsseldorfer Evals auf einem lokalen Integrationszweig;
  - das Gate für `vgn` hängt nur an Nürnberg.

**Major**
- **M1 Verzicht auf den Cache widerspricht der Nominatim-Policy:** Die Policy ist am 2026-10-26 nachgelesen: Cachen ist Pflicht, und regelmäßig laufende Skripte dürfen nur 4 Anfragen pro Minute stellen. Deshalb kommen Katalog-Orte zuerst, Treffer stehen in `DiscoverState.orte`, die Rate ist 4/min, und der Bericht zählt die Anfragen (E5). `DiscoverState.orte` vermeidet die Probleme, an denen die eigene Datei in Review 2 scheiterte (Pfadlisten, Biome, Schema).
- **M2 Startseite auf geteilten Websites:** Dort startet der Seitenfinder nur an der Fund-URL (E4.1, Test).
- **M3 Ausfall für einen Ort:** Er macht den ganzen Kandidaten zum Klärfall; nur „kein Treffer“ lässt einen Ort weg (E5, Tests).
- **M4 `hint` bei 20 Orten:** Er nennt nur die weggelassenen Orte; zu lang ergibt einen Klärfall (E5, Test).
- **M5 Klärfall nach Aufnahme von Hand:** Er endet über den Vorfilter; der Wächter meldet erst ab `anzahl` ≥ 2 (E5, Tests).

**Minor**, übernommen:
- Rohdatei mit dem endgültigen Eintrag neu;
- Dublette über Anbietername und Ort;
- `title` und `headings` für die Namenssuche;
- Kontaktseiten zählen zu den 20;
- kein Eval-Start im Nachtlauf-Fenster;
- S1 offline prüfen;
- Zugehörigkeit zu Ziel 4 zur Laufzeit ableiten;
- fehlende Tests;
- Zählung der Klärfälle ohne Budget und Ausfall;
- 270 → 240 Minuten Budget, damit Budget + 90 = 330;
- `LLM_MODEL_DISCOVER` nur in `discover.yml`;
- Adresse ohne `road`.

**Scope:** `ENTDECKEN_NETZE` ersetzt `ENTDECKEN_MODUS` (übernommen). Die Zeit je Region bleibt, bis S6 entscheidet, ob es je Region einen eigenen Job gibt.

**Stand nach dem Skill:**
- Kein Blocker ist mehr offen; den letzten hat diese Überarbeitung gelöst.
- Weil das der letzte erlaubte Durchgang war, ist die Lösung von B1 und M1 **nicht mehr unabhängig geprüft**. Deshalb läuft vor S1 ein neues `/plan-review`, wie bei den Plänen 0046 und 0047.
