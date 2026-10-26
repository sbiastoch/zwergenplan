# Plan 0050 – Entdecken: wenige gute Quellen, Seitenfinder, keine technischen Verluste

Status: Entwurf
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`):
  - Punkt 6 (Entdecken findet Anbieter, nicht Seiten);
  - Punkt 4 (Seitenfinder im Entdecken);
  - Punkt 7 (Modell nach Qualität);
  - Punkt 5 (Klärfälle im Wächter).
- Ersetzt Plan 0045 (`docs/plans/archiv/0045-entdecken-vollstaendig.md`). Dessen Abschnitte „Ausgangslage“, „Quellen“ und „Fundorte der neun nicht gefundenen“ sind die Grundlage hier und werden nicht wiederholt. Übernommen sind dort E5.2–E5.5, E6.3 und E7 in schlankerer Form.
- Plan 0048 (`docs/plans/0048-nachtlauf-seite-als-einheit.md`): Abruf mit User-Agent und robots.txt (E8), Einheit Seite (E1), Wächter (E10).
- Plan 0049 (`docs/plans/0049-seitenfinder.md`): Modul `site-crawl` (E1), `SHARED_HOSTS`.
- Plan 0042 (`docs/plans/0042-duesseldorf-katalog-fuellen.md`): Navigator, `partChars`, `abgelehnt` für Portale. Plan 0032, E7–E9 (Entdecken, Bremsen, Eval). ADR 0026, Punkt 5 (G1–G4); ADR 0022 (IDs).

## Voraussetzungen

- **Branch-Basis:** Düsseldorf existiert nur auf Branch `plan-0039`. Bis `plan-0039` auf `main` ist, zweigt die Umsetzung von `plan-0039` ab und holt `main` per Rebase herein. Ohne Düsseldorf im Katalog scheitert das Düsseldorfer Eval.
- **S1 und S2** hängen an nichts außer dieser Basis.
- **S3** braucht Plan 0049, S1 (Modul) und Plan 0048, S2 (Ertragsbeweis je Einheit).
- **S4** braucht Plan 0048, S1 (Abruf mit robots.txt).
- **Live für Düsseldorf** braucht Plan 0044 (Größenbudgets, `site.json` je Gebiet). Nürnberg und Fürth brauchen ihn nicht, solange die Budgetprüfung im Job (E8) grün ist.

## Anlass

Das Entdecken-Eval für Düsseldorf (2026-10-24) fand 5 von 10 ausgeblendeten Anbietern und nahm 2 wieder auf. Für Nürnberg (2026-10-11) waren es 6 und 2. Der Nutzer hält das für schlecht. Qualität geht vor Kosten, auch vor dem Kontingent (2026-10-25/26).

Die Ursachen stehen in Plan 0045, „Ausgangslage“:
- **7 von 11 gefundenen Anbietern gingen technisch verloren**, nicht am Urteil des Modells:
  - Adresse mit Kommentar (`streetPart` in `scripts/pipeline/io/geocode.ts`);
  - Tippfehler auf der Seite, und ein Ort ohne Treffer verwirft den ganzen Kandidaten;
  - Orte ohne Postadresse;
  - Detailseiten oder iCal, die das Bewerten nicht sieht.
- **7 der 9 nicht gefundenen** stehen in maschinenlesbaren Listen, die das Entdecken nicht abfragt.

## Ziel

Gemessen mit dem Eval aus E6 auf festen Stichproben für Nürnberg und Düsseldorf, je 20 Anbieter, zwei Läufe je Konfiguration, Mittelwert je Region:

1. **Gefunden ≥ 90 %** der ausgeblendeten Anbieter: von einer Quelle als Kandidat geliefert.
2. **Wiedergefunden ≥ 80 %:** würde aufgenommen.
3. **Falsch aufgenommen: 0.** Jede Aufnahme ohne Gegenstück in der Stichprobe beurteilt ein Mensch. Eine zweite Aufnahme desselben Anbieters zählt als falsch.
4. **Ertrag ≥ 80 %:** Ein wiedergefundener Anbieter trifft im Ertragsbeweis mindestens 80 % der künftigen Termine seines Handeintrags, gemittelt, je Anbieter auf 100 % gedeckelt. Referenz ist der Ertragsbeweis des ausgeblendeten Handeintrags im selben Lauf.
5. **Keine Verwerfung aus technischem Grund:** Netz, 5xx, Bot-Schutz, Geocoder oder ungültige Antwort machen einen Klärfall (E5), nie eine Verwerfung oder Wiedervorlage. HTTP 404/410 verwirft weiter.
6. **Echte Neuzugänge messen**, ohne Schwelle: Jeder Live-Lauf bekommt eine Zeile in `evals/results.md`, Abschnitt „Entdecken live“: aufgenommen, davon von Hand bestätigt, zurückgenommen, Klärfälle. Das misst den Monatslauf selbst, nicht nur das Wiederfinden.

`ENTDECKEN_MODUS` geht je Netz erst auf `live`, wenn die Ziele 1–4 für dessen Regionen erreicht sind (Fürth läuft mit Nürnberg).

## Nicht-Ziele

- **Ein Erkundungsmodus für neue Städte** (Plan 0045, Stufe A): Eine neue Stadt erkundet ein Mensch mit dem Skill (E9).
- **Breite Inventare:** Landessportbund-Vereine, OSM-Gemeinden, Vereinsverzeichnis Nürnberg, GKV-Hebammenliste, Schneeball. Sie helfen beim ersten Füllen einer Stadt, kaum im Monatslauf; sie gehen in die Checkliste des Skills (E9). Damit entfällt auch die Pseudonymisierung von Personen aus Plan 0045, E6.4.
- **eversports** (nur mit Browser hinter Cloudflare): kein Abruf, die Bot-Abwehr wird nicht umgangen.
- **Recherche-Profil als Datei**, Lincoln-Petersen-Schätzung, `--reuse`, Stadtteil-Matrix, Photon: entfallen ersatzlos. Photon kommt nur, wenn S1 zeigt, dass Orte ohne ihn verloren gehen.
- **Kosten senken:** kein Kriterium.
- **Extraktion verbessern:** Modellwahl (ADR 0033, Reihenfolge 2) und Plan 0048.
- **Bestehende Einträge ändern:** außer dem Anhängen von Programmseiten nach Plan 0049 nichts (G2).

## Entscheidungen

### E1 – Ablauf und Takt

Ein Lauf hat vier Phasen:
1. **Kandidaten** aus den Quellen der Region (E2), Websuche und Namenssuche (E3).
2. **Vorfilter** gegen Katalog, `abgelehnt` und `zurueckgestellt`, wie heute (`prefilter`, `scripts/pipeline/lib/discover.ts`).
3. **Prüfung** je Kandidat (E4): Seitenfinder, Bewerten, Orte, Ertragsbeweis je Seite.
4. **Aufnahme** mit G1–G4 wie heute.

**Takt monatlich je Netz:** In `.github/workflows/discover.yml` ersetzen zwei Monats-Crons die Wochen-Crons des Entdeckens: `30 4 1 * *` für `vgn` und `30 4 2 * *` für `vrr`. Der Job `modus` (Plan 0049, E5) setzt dafür `lauf=entdecken`. Gewählt ist ein fester Tag des Monats, weil GitHub Tag und Wochentag mit „oder“ verknüpft. Wochenend-Läufe entfallen; der Nachtlauf ist um 01:30 UTC fertig. Ein Test parst `discover.yml` (Plan 0049, `scripts/lib/discover-workflow.test.ts`).

### E2 – Quellen je Region

- **Tabelle im Code** `scripts/pipeline/lib/discover-sources.ts` (neu): `DISCOVER_SOURCES: Record<RegionId, SourceUse[]>` mit `{quelle, params?}`. Sie ersetzt kein Datenformat und braucht keine Prüfung in `data:validate`. Ein Test prüft, dass jede Region der `REGION_IDS` einen Eintrag hat und die Parameter je Quelle passen.
- **Quellen** (Parser rein in `scripts/pipeline/lib/sources/discover/<quelle>.ts` mit Fixture aus fiktiven Namen, Abruf in `scripts/pipeline/io/discover-sources.ts`, über den gemeinsamen Abruf aus Plan 0048):

| Quelle | Reichweite | Parameter | Inhalt |
|---|---|---|---|
| `sammelkalender` | Region | – | wie heute (`aggregatorFinds`) |
| `linkliste` | Region | – | `role: verzeichnis` der Region, wie heute (`directoryFinds`) |
| `navigator` | NRW | `einrichtungId` | Familien-Navigator: Anbieter und Träger mit Website aus den Angeboten für 0–3 und der Anbieterliste |
| `kikudoo` | bundesweit | – (bbox der Region) | Geo-API, Anbieter mit Lage |
| `kidsgo` | bundesweit | `raum` | Kategorieseiten im Browser (`/suche/` nicht, robots.txt), nur Einträge mit Ort in der bbox |
| `mgh` | bundesweit | – (bbox) | Karte der Mehrgenerationenhäuser |

- Die Endpunkte und Belege stehen in Plan 0045, „Quellen“. S0 ruft sie erneut ab.
- Funde bekannter Websites werden Hinweise, keine Kandidaten (wie heute).
- Fällt eine Quelle aus, kostet das nur ihre Funde, und der Bericht nennt sie. Liefert sie genau so viele Treffer wie eine Seitengrenze, warnt der Bericht.
- `MAX_DIRECTORY_FINDS` gilt nur für `linkliste`.

### E3 – Websuche und Namenssuche

- **Formatsuche:** Begriffe in Gruppen nach `CATEGORIES` (`scripts/pipeline/lib/discover-terms.ts`), je Gruppe ein Aufruf mit 3–5 Begriffen und dem Regionsnamen. Neu sind unter anderem Familiencafé, Elterncafé, Offener Treff, Spielgruppe, Mutter-Kind-Gruppe, Babytreff, Kinderturnen 1–3 Jahre, Babyyoga, Rückbildung mit Baby, Delfi, Prager Eltern-Kind-Programm, Zumbini, Kangatraining, Babytheater und Bilderbuchkino. `SEARCH_MAX_TURNS` steigt von 10 auf 30, `SearchResponse` von `max(20)` auf `max(25)`.
- **Portaltreffer auflösen statt verwerfen:** Der Suchprompt nimmt Treffer auf Sammelportalen und Buchungsplattformen auf, wenn sie einen Veranstalter nennen (`{name, url, portal: true}`). Der Code gibt den Namen an die Namenssuche. Portale in `abgelehnt` bleiben als Fund-URL gesperrt.
- **Namenssuche** (`scripts/pipeline/prompt/discover-resolve.md`, neu, `tools: web`): bis zu 10 Namen je Aufruf mit Ort und Art. Antwort je Name eine URL oder `null`. Eine URL zählt nur, wenn ihr Abruf den Namen **und** den Ort oder eine PLZ der Region enthält. Ohne eigene Website bleibt ein Plattform-Profil die Fund-URL, wenn es Termine zeigt; der Seitenfinder bleibt dann unterhalb des Profil-Pfads (Plan 0049, E1).

### E4 – Prüfung in die Tiefe

1. **Seitenfinder** (Plan 0049, E1) ab Fund-URL und Startseite der Website, höchstens 20 Seiten. Er ersetzt `contactLinks` und `MAX_CONTACT_PAGES`. Leere Seiten ruft er einmal im Browser ab; bleibt eine Seite leer, wird der Kandidat ein Klärfall, nie „ohne Bezug“.
2. **Bewerten** mit allen erkundeten Seiten als `## SEITE: <URL>`, je Seite höchstens 15 000 Zeichen, zusammen höchstens 150 000, dazu die Linklisten.
   - Programmseiten müssen aus den erkundeten URLs oder ihren Links stammen (`allowedUrlsOf` auf die Erkundung erweitert).
   - `AssessEntrySchema`: `venues.max(20)`, `programme.max(20)`.
   - Orte dürfen als „Name, Ort“ kommen, wenn die Seite keine Postadresse nennt (Turnhalle, Bad).
   - Bei ungültiger Antwort einmal das nächststärkere Modell.
3. **Ertragsbeweis je Seite:** Jede vorgeschlagene Programmseite ist eine Einheit (Plan 0048, E1).
   - Seiten ohne Ertrag fallen aus dem Eintrag.
   - Aufgenommen wird nur mit mindestens einer Seite mit Ertrag (`proveYield` wie heute).
   - Scheitert eine Seite mit „abgeschnitten“, folgt ein zweiter Beweis mit `partChars: 4500`; gelingt er, steht `partChars` im neuen Eintrag.
4. **Zweite Runde:** Liefert keine Seite Ertrag, bekommt das Bewerten einmal die Rückmeldung („Seite X lieferte keine Termine“) mit denselben Seiten und wählt neu. Danach ein zweiter Ertragsbeweis.
5. **Dubletten vor der Aufnahme** (seriell): Hat der neue Eintrag dieselbe Programmseite wie ein Katalog-Eintrag oder einen Ort in 100 m Umkreis mit ähnlichem Namen (`similarName`), wird er nicht aufgenommen. Der Bericht meldet „Dublette von <id>?“.

### E5 – Härte: Orte und Klärfälle

- **Adressen:** Neue reine Funktion `normalizeAddress` in `scripts/pipeline/lib/address.ts`:
  - entfernt Klammern und Kommentare;
  - vereinheitlicht „Str.“;
  - ergänzt das Leerzeichen vor der Hausnummer („Tellerringstr.56“);
  - gibt die Straße auch dann zurück, wenn sie der erste Teil ist (Fehler in `streetPart`).
- **Geocoder** (`scripts/pipeline/io/geocode.ts`), in dieser Reihenfolge:
  1. Nominatim mit Freitext.
  2. Nominatim strukturiert (`street`, `city`, `postalcode`) mit `viewbox` der Region und `bounded=1`.
  3. Benannter Ort ohne Adresse: Name und Stadt, `limit=5`, nur `category`/`type` aus einer festen Liste (Sporthalle, Schwimmbad, Schule, Kirche, Gemeindezentrum, Kita, Bibliothek); die Adresse kommt dann aus dem Treffer.

  Alle Anfragen laufen durch eine Warteschlange mit 1/s. Die Schnittstelle wird `geocode(address, { region, venueName? })`.
- **Cache im Repo:** Positive Treffer stehen in `data/discover/geocode.json`, geschrieben nur vom Lauf. Es sind Adressen von Kursorten, also öffentlich. Negative Treffer und Fehler werden nicht gespeichert. So entfällt `actions/cache`.
- **Ein Ort ohne Treffer** fällt allein weg, mit Hinweis. Ein Klärfall entsteht erst, wenn kein Ort bleibt.
- **Drei Ausgänge:**
  - **aufgenommen**;
  - **verworfen**: inhaltliches Nein, kein Ertrag nach der zweiten Runde, 404/410, oder robots.txt sperrt alle Programmseiten. Wiedervorlage nach 8 Wochen wie heute.
  - **Klärfall**: Netz, 5xx, Bot-Schutz, leere Seite, robots.txt nicht lesbar, kein Ort, ungültige Antwort nach Fallback. Keine Wiedervorlage; der nächste Lauf versucht es erneut.
- `DiscoverState` bekommt `klaerfaelle: {url, name, grund, seit, anzahl}[]`. Ab drei Klärfällen in Folge setzt der Kandidat einen Monatslauf aus. Klärfälle aus Zeitbudget, Limit oder G3 liegen nicht am Kandidaten und zählen nicht.
- **Klärfälle im Wächter:** `watchFindings` (Plan 0048, E10) liest `data/discover/*.json` und meldet die Art `klaerfall` mit Name, Grund und Fund-URL. Ein eigenes Issue gibt es dafür nicht.

### E6 – Eval

- **Stichproben** in `evals/discover.json` (neu): je Region 20 Anbieter (Nürnberg, Düsseldorf).
  - Dabei sind die 20 bisher genutzten, markiert mit `alt: true`.
  - Die übrigen 10 je Region zieht S0 mit gesetztem Zufall je Trägerart, ohne Blick auf die Quellen. Die Trägerart ordnet S0 für alle Katalog-Anbieter beider Regionen von Hand zu und legt sie unter `arten` ab.
  - Nicht gezogen werden Anbieter mit `skipCrawl`. Anbieter mit `coveredBy` zählen nicht für Ziel 4 (`ziel4: false`).
  - Ein Test prüft die Datei.
- **Aufruf** `pnpm pipeline discover --dry-run --eval [--region …] [--run-dir …]`. Er blendet die Stichprobe aus, ignoriert `zurueckgestellt`, `klaerfaelle` und `seiten`, schaltet G3 aus und legt ein eigenes Laufverzeichnis an: `runs/<datum>/discover`, bei Bedarf `-2`, `-3`.
- **Zuordnung 1:1** (`hiddenEval`): gleiche URL vor gleicher Website (`siteOf` der Startseite, nicht auf geteilten Websites nach Plan 0049, E1) vor Ortsnähe (100 m, `similarName`). Je Anbieter zählt die beste Zuordnung; weitere Aufnahmen desselben Anbieters sind falsch.
- **Ertrag** (Ziel 4): Für jeden wiedergefundenen Anbieter läuft im selben Lauf der Ertragsbeweis seines Handeintrags als Referenz (`runs/<datum>/discover/referenz/`). Die Termine werden 1:1 über Ort (≤ 100 m) und Beginn zugeordnet, im Fenster heute bis +8 Wochen.
- **Kennzahlen je Stufe** in Bericht und `evals/results.md`: gefunden je Quelle, aufgelöst, nach Vorfilter, bewertet „aufnehmen“, Orte aufgelöst, Ertragsbeweis (erste/zweite Runde), wiedergefunden, Klärfälle, Dubletten; alte und neue Fälle getrennt. Die Tabelle „Entdecken“ bekommt die Spalten; alte Zeilen erhalten „–“.
- **Ort der Läufe:** lokal (`RUN_BUDGET_MIN` passend) oder per `workflow_dispatch` mit Eingabe `eval: true` (nur Trockenlauf, eigene `concurrency`-Gruppe).

### E7 – Modell

Für Suche, Namenssuche und Bewerten vergleicht S5 Haiku, Sonnet und Opus, je zwei Eval-Läufe. Gewählt wird das Modell mit den besten Zielen 1–4. Bei Gleichstand gewinnt das schnellere (ADR 0033, Punkt 7). `LLM_MODEL_DISCOVER` in beiden Workflows.

### E8 – Grenzen, Budget im Lauf, G3

- **Bremsen** `DISCOVER_BRAKES` (`scripts/pipeline/lib/cost.ts`), `DISCOVER_BUDGET_MIN` (`scripts/pipeline/io/discover.ts`) und `timeout-minutes` des Jobs `entdecken`:
  - ab S1 so hoch, dass Eval-Läufe nicht abbrechen: 1500 Aufrufe, 150 Mio. Tokens, 300 Min., Job 330 Min.;
  - S6 setzt sie auf das Doppelte des größten gemessenen Laufs.

  Die `workflow_dispatch`-Standards ziehen mit.
- **G3 im Monatstakt:** 25 neue Anbieter je Region und Lauf, bei `--bootstrap` weiter `max_new`.
- **Budget im Job:** Im Modus `live` baut der Job `entdecken` nach dem letzten Anbieter-Commit `data/offers.json` ohne Commit neu (`pnpm pipeline nightly --build-only`), dann laufen `pnpm build` und `pnpm size`. Ist das rot:
  - nimmt der Job die Anbieter-Commits zurück und behält den Zustands-Commit;
  - endet er selbst grün mit Ausgabe `budget=rot`;
  - wird der Job `ampel` rot, und der Bericht nennt das Budget und die zurückgenommenen Anbieter.

  So blockiert ein Monatslauf nie den Nachtlauf.
- **Parallel** laufen nur Modellaufrufe (Standard 4) und Abrufe. Geocoder, Ertragsbeweis, Dublettenprüfung, ID-Vergabe, G3, Aufnahme und Commit bleiben seriell.

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
| `scripts/pipeline/io/geocode.ts` | Reihenfolge, benannte Orte, Warteschlange, Schnittstelle, Cache in `data/discover/geocode.json` | S1 |
| `scripts/pipeline/lib/discover-state.ts` | `klaerfaelle` | S1 |
| `scripts/pipeline/io/discover.ts`, `scripts/pipeline/lib/discover.ts` | einzelne Orte, Klärfälle, Dubletten; Eval, Kennzahlen, Ertrag; Seitenfinder, Ertrag je Seite, zweite Runde, `partChars`; Quellen, Namenssuche, Portaltreffer | S1–S4 |
| `scripts/pipeline/lib/watch.ts` | Art `klaerfall` | S1 (wenn Plan 0048, S3 da ist, sonst nachgezogen) |
| `scripts/pipeline/prompt/discover-assess.md`, `discover-search.md`; `discover-resolve.md` (neu) | „Name, Ort“; Seitenformat; Portaltreffer; Namenssuche | S1, S3, S4 |
| `scripts/pipeline/lib/discover-sources.ts` (neu), `scripts/pipeline/lib/sources/discover/*.ts` (neu), `scripts/pipeline/io/discover-sources.ts` (neu) | Quellentabelle und vier Quellen | S4 |
| `scripts/pipeline/lib/discover-terms.ts` | Begriffsgruppen | S4 |
| `scripts/pipeline/cli.ts` | `--eval`, `--run-dir` | S2 |
| `scripts/pipeline/lib/cost.ts` | `DISCOVER_BRAKES` | S1, S6 |
| `.github/workflows/discover.yml` | Monats-Crons, Eingabe `eval`, Zeitlimit, Budget im Job | S2, S6 |
| `evals/discover.json` (neu), `evals/results.md` | Stichproben, Spalten, Abschnitt „Entdecken live“ | S0, S2, S6 |
| Skill (Abschnitte 1, 2, 6), `docs/architecture.md`, `CLAUDE.md` („Daten“: `data/discover/geocode.json`) | Doku | S1–S6 |

## Tests (test-first)

- `lib/address.test.ts`:
  - Kommentar in Klammern;
  - Straße am Anfang;
  - „str.56“;
  - „Str.“ gegen „straße“;
  - die zwei Düsseldorfer Adressen aus dem Eval.
- `io/geocode.test.ts` (mit `fetchImpl`):
  - die Reihenfolge bricht beim ersten Treffer ab;
  - benannter Ort nur mit erlaubter Kategorie;
  - zwei Anfragen im Abstand ≥ 1 s;
  - Fehler nicht im Cache;
  - Cache-Datei nur mit Treffern.
- `io/discover.test.ts`:
  - ein Ort ohne Treffer → Eintrag mit den übrigen und Hinweis;
  - kein Ort → Klärfall ohne Wiedervorlage, ab dem dritten ein ausgesetzter Lauf;
  - Netzfehler, 5xx und Bot-Schutz → Klärfall; 404/410 → verworfen;
  - leere Seite → Browser, bleibt leer → Klärfall;
  - Seite ohne Ertrag fällt aus dem Eintrag;
  - zweite Runde nimmt auf;
  - `abgeschnitten` → zweiter Beweis mit `partChars`;
  - ungültige Antwort → stärkeres Modell;
  - Dublette nicht aufgenommen;
  - Portaltreffer geht in die Namenssuche;
  - eine URL ohne Name und Ort im Text zählt nicht;
  - im Modus live verhindert ein rotes `pnpm size` die Übergabe der Anbieter-Commits, der Zustand bleibt.
- `lib/discover.test.ts`:
  - Zuordnung 1:1 mit Vorrang;
  - geteilte Websites, beide Paare (`stadtkirche-nuernberg.de`, `evdus.de`);
  - Ertrag gegen die Referenz, gedeckelt;
  - Kennzahlen je Stufe;
  - `--eval` ignoriert Zustand und G3.
- `lib/sources/discover/*.test.ts`: je Quelle eine Fixture, Seitengrenze, bekannte Website als Hinweis, Region über bbox.
- `lib/discover-sources.test.ts`: jede Region hat einen Eintrag, Parameter je Quelle.
- `scripts/pipeline/io/eval-discover.test.ts`: Stichprobendatei (IDs im Katalog, Rolle, Region, 20 je Region, `arten` vollständig, kein `skipCrawl`, `ziel4: false` genau bei `coveredBy`).
- `scripts/lib/discover-workflow.test.ts`: Monats-Crons → `lauf=entdecken`; Eingabe `eval` nur im Trockenlauf.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected`, bei Daten mit `--smoke`; Schritte mit neuem Modul mit `/arch-review`.

- **S0 – Vorbereitung.**
  - `evals/discover.json` anlegen (E6).
  - Endpunkte der Quellen aus E2 erneut abrufen.
  - Probe: die neun Namenssuchen aus Plan 0045, „Fundorte“, einmal über die Websuche der Pipeline (`claude -p`, `tools: web`).
- **S1 – Härte** (E5, E4.5, Prompt „Name, Ort“, Bremsen).
  - Erwartung: efa, DRK und die drei Nürnberger Orte ohne Adresse kommen durch.
- **S2 – Messung** (E6). Eval mit heutigen Quellen als neuer Ausgangswert, zwei Läufe je Region.
- **S3 – Tiefe** (E4.1–E4.4, Seitenfinder). Eval, zwei Läufe.
- **S4 – Quellen** (E2, E3), Quelle für Quelle in der Reihenfolge `navigator`, `kikudoo`, `kidsgo`, `mgh`, dann Namenssuche und Begriffsgruppen. Nach jeder zweiten Quelle ein Eval-Lauf, am Ende zwei.
- **S5 – Modell** (E7).
- **S6 – Live** je Netz:
  - Voraussetzung: Ziele 1–4 erreicht; für `vrr` zusätzlich Plan 0044 live.
  - Ein Trockenlauf je Netz per `workflow_dispatch`, danach Bremsen auf das Doppelte des Gemessenen.
  - Der Nutzer sieht den Bericht (Aufnahmen und Klärfälle), dann `gh variable set ENTDECKEN_MODUS --body live` (N3).
  - Erster Live-Lauf per `workflow_dispatch`, Zeile „Entdecken live“ (Ziel 6), `/browser-review live` für neue Anbieter.
- **S7 – Abschluss.** Skill E9, Restpunkte nach `docs/ideas.md`, archivieren.

## Nutzerentscheide (offen)

- **N1 – Zielwerte.** Empfehlung: wie unter „Ziel“. Je Region gibt es einen Stichproben-Anbieter ohne maschinelle Quelle (musikfuechse, zwergenstube); 90 % lassen je Region noch einen weiteren Fehlschlag zu. Alternative: ≥ 85 % gefunden.
- **N2 – Plattform-Listen als Fundquelle** (Navigator, kikudoo, kidsgo, Mehrgenerationenhäuser). Genutzt werden nur Name, Website und Ort, intern; robots.txt wird beachtet. Empfehlung: ja. eversports bleibt außen vor.
- **N3 – Live ohne Abnahme** je Aufnahme. Empfehlung: ja, nach erreichten Zielen und einem abgenommenen Trockenlauf je Netz; Rücknahme per Revert und `abgelehnt`. Alternative: die ersten zwei Monatsläufe nur trocken.

## Kosten

Nach Nutzervorgabe kein Kriterium. Ein Eval-Lauf kostete bisher etwa $1 je Region (API-Gegenwert). Mit Seitenfinder, Quellen und stärkerem Modell rechne ich mit dem 10- bis 50-Fachen.

## Risiken

- **Mehr Kandidaten, mehr Grenzfälle** (Kitas, Praxen ohne Kurse, Kurse erst ab 4 Jahren). Abhilfe: Ertragsbeweis je Seite, Ziel 3 mit Urteil von Hand, `abgelehnt`.
- **Plattformen ändern sich oder sperren** (kidsgo braucht den Browser, kikudoo ist eine inoffizielle API). Abhilfe: Ein Ausfall kostet nur die Funde der Quelle, der Bericht nennt ihn, Fixtures halten das Parsen fest.
- **Namenssuche ordnet falsch zu.** Abhilfe: Name und Ort bzw. PLZ müssen im abgerufenen Text stehen; Orte müssen in der Region liegen.
- **Eval überschätzt** (Stichprobe aus dem Handkatalog, Quellen aus den Fehlschlägen abgeleitet). Abhilfe: neue Fälle per Zufall, alt und neu getrennt, Ziel 6 misst echte Neuzugänge.
- **Budgets der Website.** Abhilfe: Budget im Job (E8), Düsseldorf erst nach Plan 0044.
- **Laufzeit.** Abhilfe: Parallelität der Modellaufrufe, Budget mit geordnetem Ende. Reicht das nicht, teilt S6 den Lauf je Region auf eigene Jobs.
