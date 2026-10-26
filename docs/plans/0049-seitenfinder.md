# Plan 0049 – Seitenfinder: Programmseiten finden, zuerst für bekannte Anbieter

Status: Review eingearbeitet
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`), Punkt 4 (ein Seitenfinder), Punkt 1 (ein Abruf), Punkt 5 (Issue je Lauf neben dem Wächter). Dieser Plan baut das Modul mit beiden Modi und die **Pflege bekannter Anbieter**; den Einsatz im Entdecken baut Plan 0050 (`docs/plans/0050-entdecken-schlank.md`).
- Plan 0048 (`docs/plans/0048-nachtlauf-seite-als-einheit.md`): Einheit Seite (E1), Ertragsbeweis je Einheit, Fehlerklasse `dauerhaft`, Abruf mit User-Agent und robots.txt (E8), Wächter (E10).
- Plan 0045 (`docs/plans/archiv/0045-entdecken-vollstaendig.md`), E5.1 (Website-Erkundung) und S3b (neue Programmseiten bekannter Anbieter): Ideen übernommen; aus „nur Vorschlag im Issue“ wird automatisches Anhängen.
- Plan 0032, E7 (Gates G1–G4); ADR 0026, Punkt 5 (G2); ADR 0022 (IDs); Skill `babyevents-nuernberg`, `references/booking-systems.md`.

## Voraussetzungen

- **Plan 0048** ist live bis einschließlich S3: Einheit Seite, Wächter, gemeinsamer Abruf mit robots.txt. Alle Rohdateien sind umgestellt (Ziel 5 dort).
- Basis `main` wie Plan 0048.
- **Für `vrr`** zusätzlich Plan 0044 live (Größenbudgets, Düsseldorf). Bis dahin läuft die Pflege nur für `vgn`.

## Anlass

Der Nutzer will, dass neue Angebote bekannter Anbieter zuverlässig auftauchen (2026-10-25). Der Nachtlauf liest nur Seiten, die im Katalog stehen. Neue Programmseiten findet bisher nur ein Mensch:
- ein neuer Kursbereich;
- ein neuer Stundenplan nach einem Relaunch (`die-familienbox`: `/erwachsenenkurse/stundenplan-1/` lieferte vom 2026-10-22 an HTTP 404, die neue Seite `/erwachsenenkurse/stundenplan/` war auf der Startseite verlinkt; von Hand korrigiert in `84a2bad`);
- Detailseiten statt Übersicht (`sharky-duesseldorf`);
- ein Buchungs-Widget auf einer Plattform, das die eigene Website verlinkt.

Plan 0045, S3b wollte solche Seiten nur vorschlagen; ein Vorschlag, den ein Mensch umsetzen muss, ist nicht zuverlässig. ADR 0033, Punkt 4 erlaubt deshalb das Anhängen mit Ertragsbeweis.

## Ausgangslage

- **Bewerten beim Entdecken:** Es sieht die Fund-Seite und höchstens zwei Kontaktseiten (`CONTACT_PATTERNS`, `MAX_CONTACT_PAGES`, `contactLinks` in `scripts/pipeline/lib/discover.ts`). Programmseiten müssen aus der Fund-Seite oder ihren Links stammen (`allowedUrlsOf`).
- **Dieselbe Website:** `sameSite` (`scripts/pipeline/lib/discover.ts`) wertet Subdomains als dieselbe Website, `jimdofree.com`-Nachbarn nicht.
- **Was `extractPage` schon liefert** (`scripts/pipeline/lib/html-extract.ts`): iCal- und RSS-Links (`feeds`), JSON-LD-Events (`jsonLd`), Links mit Text, und `jsRendered` für Seiten mit wenig Text und vielen Skripten.
- **G2** (`scripts/pipeline/lib/catalog-diff.ts`): Der Katalog darf nur um neue Einträge am Ende wachsen. Jede Änderung eines bestehenden Eintrags bricht den Lauf ab. Angehängt wird mit `appendEntries` (`scripts/pipeline/lib/catalog-yaml.ts`), das Kommentare und Formatierung erhält. `catalogDiff` nutzen auch das Entdecken und `dryRunCatalogIssues`.
- **Zustand** `data/discover/<region>.json` (`DiscoverState`, `scripts/pipeline/lib/discover-state.ts`): `abgelehnt` (URL, Host oder ID mit Grund) und `zurueckgestellt`. Eine `id` in `abgelehnt` gilt als zurückgenommener Anbieter: Steht sie im Katalog, meldet `reservedConflicts` einen Fehler, und `data:validate` wird rot.
- **Ortshinweise:** Orte außerhalb der Region schließt ein `hint` an den Terminseiten aus („Termine an … weglassen“, `scripts/pipeline/lib/discover.ts`). Ohne ihn landen deren Termine am ersten Ort.
- **Plattform-Seiten:** Mindestens 47 der 362 Programm-URLs im Katalog liegen auf Plattform-Hosts (eversports, fitogram, evangelische-termine.de, kursorganizer, hebamio u. a.).
- **Ertragsbeweis** (`proveYield` in `scripts/pipeline/lib/discover.ts`): ein Angebot für 0–3 Jahre mit künftigem Termin, dazu Kleinkindbezug im Text (`isRelevant`).
- **Wie viele Seiten fehlen**, ist nicht gemessen; das leistet S0.

## Ziel

1. **Wiederfinden.**
   - In einer Katalogkopie wird bei 10 zufällig gezogenen Anbietern (gesetzter Seed) je eine Programmseite entfernt. Gezogen wird unter Anbietern mit mindestens zwei Seiten, ohne Orts-`hint` (E5), und nur unter erreichbaren Seiten: auf der eigenen Website oder von ihr direkt verlinkt, nicht `follow`, nicht Sammelkalender mit Adapter.
   - Der Pflegelauf im Trockenlauf hängt bei mindestens 8 davon die entfernte Seite oder eine mit denselben Angeboten wieder an.
   - Gemessen mit `--katalog <kopie>` (E6).
2. **Nur echte Programmseiten.**
   - Jede angehängte Seite liefert im Ertragsbeweis mindestens ein Angebot, das der Anbieter vorher nicht hatte (E2, durch Bauart).
   - In den ersten zwei Live-Läufen prüft ein Mensch jede angehängte Seite: Mindestens 90 % sind Programmseiten des Anbieters, nicht eines fremden Veranstalters, und keine zweite Fassung einer vorhandenen Seite. Das Urteil steht in `evals/results.md`.
   - Unter 90 % geht `PFLEGE_MODUS` zurück auf `trocken`, und ein Nachtrag klärt die Ursache.
3. **Ersatz für ausgefallene Seiten.** Für einen Anbieter, dessen Seite seit mindestens zwei Tagen mit `dauerhaft` scheitert, findet der nächste Pflegelauf die Ersatzseite, wenn die Website eine hat. Nachgewiesen mit einem Durchlauf-Test (Fixture wie `die-familienbox`: alte URL 404, neue URL im Menü) und im Bericht des ersten Live-Laufs.
4. **Höflich.** Je Anbieter und Lauf höchstens 20 Abrufe. robots.txt nach Plan 0048. Höchstens ein Abruf je Sekunde und Host, auch über Anbieter hinweg.

## Nicht-Ziele

- **Seiten entfernen oder ändern** (`hint`, `partChars`, `follow`, `blocked`, `request`): bleibt beim Menschen, den der Wächter (Plan 0048, E10) hinweist.
- **Neue Anbieter:** Plan 0050. Es nutzt den Modus `alle` aus E1.
- **Folgeseiten (`follow`) automatisch setzen:** Der Bericht nennt „Liste blättert“, wenn eine Kandidatenseite einen Folgelink hat.
- **Anbieter mit `coveredBy` oder `skipCrawl`:** nicht im Pflegelauf. Für `skipCrawl` wäre ein Fund ein Hinweis an den Menschen; das kommt später, wenn S0 zeigt, dass es sich lohnt.
- **Geteilte Websites automatisch erkennen** (Website mit Seiten mehrerer Katalog-Anbieter): erst, wenn S0 zeigt, dass die feste Liste `SHARED_HOSTS` nicht reicht.

## Entscheidungen

### E1 – Modul mit zwei Modi

- **Auswahl, rein** in `scripts/pipeline/lib/site-crawl.ts` (neu):
  - **Start:** eine Liste von URLs. Im Pflegelauf sind das die `url` des Eintrags und alle seine Programmseiten (auch `blocked` und `use: info`, als Startpunkte, nicht als Kandidaten).
  - **Breitensuche** bis Tiefe 2 auf derselben Website (`sameSite`), höchstens 20 abgerufene Seiten.
  - **Plattform-Seiten:** Links von der eigenen Website auf einen Host aus `SHARED_HOSTS` werden abgerufen (ein Sprung), aber nicht weiter erkundet. `SHARED_HOSTS` (neu) enthält die Buchungsplattformen aus `references/booking-systems.md` sowie `jimdofree.com` und `wixsite.com`.
  - **Startseite auf einem geteilten Host** (der Eintrag selbst ist ein Plattform-Profil): erkundet wird nur unterhalb des Pfads, und alle Query-Parameter der Startseite müssen gleich sein (Mandant: `venueId`, `w`, `vid` usw.).
  - **Nie Kandidat:**
    - Hosts von Sammelkalendern mit Adapter (`evangelische-termine.de`, `frankenkids.de`, Stadt-Veranstaltungskalender), denn ihre Termine kommen über den Adapter;
    - URLs, die auf ein `follow.match` des Anbieters enden;
    - Seiten, die der Katalog schon nennt (normalisierte URL, auch nach Weiterleitung).
  - **Reihenfolge** nach Wörtern in Linktext und Pfad: Kurs, Termin, Programm, Stundenplan, Kalender, Veranstaltung, Baby, Eltern-Kind, Krabbel, Familie, Anmeldung. Bei Gleichstand gilt die Tiefe, dann die URL alphabetisch.
  - **Nie besucht** werden im Modus `kandidaten` Impressum, Datenschutz, AGB, Warenkorb, Login, Shop, Presse, Jobs und Bilddateien.
- **Modus `kandidaten`** (Pflegelauf): liefert Kandidaten für Programmseiten mit ihren Signalen.
  - **Signale** (`pageSignals(page, today)`, rein, auf `extractPage`):
    - `feeds` mit iCal;
    - `jsonLd` mit künftigen Terminen;
    - mindestens 3 künftige Datumsangaben (`TT.MM.` oder `TT.MM.JJJJ`; ohne Jahr gilt das nächste künftige Vorkommen, gerechnet in Europe/Berlin ab `today`);
    - oder mindestens 2 Angaben „Wochentag plus Uhrzeit“.

    Kandidat ist eine Seite mit einem dieser Signale **und** `isRelevant`. Ein PDF ist Kandidat, wenn sein Text die Bedingung erfüllt.
  - **JavaScript-Seite** (`jsRendered`): einmal im Browser; dann gilt `render: browser` für den Kandidaten.
  - Höchstens 5 Kandidaten je Anbieter gehen in den Ertragsbeweis, nach der Zahl künftiger Termine geordnet, bei Gleichstand nach URL.
- **Modus `alle`** (für das Entdecken, Plan 0050): dieselbe Erkundung, aber Rückgabe **aller** abgerufenen Seiten mit Text. Dazu höchstens zwei Kontakt-, Anfahrts- oder Impressumsseiten nach `CONTACT_PATTERNS`, weil sie die Kursorte nennen. Die Startliste ist frei (Fund-URL und Startseite der Website).
- **Abruf** in `scripts/pipeline/io/site-crawl.ts` (neu) über den gemeinsamen Abruf aus Plan 0048, S3 (User-Agent, robots.txt, Fehlerklasse). Eine Warteschlange je Host über den ganzen Lauf sorgt für höchstens einen Abruf je Sekunde. PDFs gehen über `pdftotext` wie im Nachtlauf; jeder Abruf zählt gegen die 20, auch Browser und Weiterleitungen.

### E2 – Ertragsbeweis einer Kandidatenseite

- Der Kandidat wird ein Katalog-Programmeintrag `{url, kind, render?, use: termine}` und damit **eine Einheit** nach Plan 0048, E1, mit den Venues des Anbieters und seinen Beilagen. Extrahiert wird mit demselben Extraktor wie im Nachtlauf, ohne Schreiben nach `data/raw` (Zustand nur im Laufverzeichnis).
- **Vergleichsstand:** die Events der Einheiten des **wirksamen Katalogs** (`data/providers.yaml` bzw. `--katalog`) aus `data/raw`, ohne Einheiten mit `klasse: dauerhaft`. Die Ersatzseite einer seit Tagen fehlenden Seite gilt so nicht als deckungsgleich (Ziel 3). Eine Seite, die nur vorübergehend scheitert, bleibt im Vergleich; eine zweite Fassung davon wird also nicht angehängt. In der Katalogkopie für Ziel 1 fehlt die entfernte Seite auch im Vergleich.
- Die Events laufen durch `buildOffers` gegen diesen Stand. **Neu** ist ein gebautes Angebot, wenn:
  - es einen künftigen Termin hat,
  - `age.minMonths` ≤ 36,
  - `assignIds` ihm keine ID aus dem Vergleichsstand gibt,
  - und `sameOfferTwice` es mit keinem Angebot daraus verbindet.
- **Ergebnis:**
  - `anhaengen`, wenn es mindestens ein neues Angebot gibt und `isRelevant` auf dem Text greift;
  - `deckungsgleich`, wenn alle schon da sind;
  - `ohne-ertrag`, wenn es kein gültiges Angebot gibt;
  - `abgeschnitten`, mit dem Hinweis „`partChars` prüfen“;
  - `fehler` bei Abruf oder Modell.

### E3 – Anhängen und Gate G2

- `appendProgramme(text, id, pages)` in `scripts/pipeline/lib/catalog-yaml.ts` hängt Einträge an das `programme` des Eintrags und erhält Kommentare und Formatierung.
- **G2:** `catalogDiff(before, after, { allowProgrammeAppend })`. Ohne die Option gilt G2 wie heute; das Entdecken und `dryRunCatalogIssues` rufen sie so auf. Nur der Pflegelauf setzt sie. Mit der Option darf sich ein bestehender Eintrag nur so ändern, dass am **Ende** von `programme` neue Einträge stehen. Diese haben **genau** die Schlüssel `url`, `kind`, `use: termine` und optional `render`. `catalogDiff` liefert dazu `appended: {id, urls}[]`, und der Lauf prüft, dass das genau seine Anhänge sind.
- **G1:** `pnpm data:validate` über den Gate-Aufruf wie heute, je Commit.
- **G3:** höchstens 3 Seiten je Anbieter und 20 je Lauf.
- **G4:** ein Commit je Anbieter, Betreff `data: Programmseite für <id> (<n>)`, im Text je Seite URL, Art und neue Angebote mit erstem Termin.
- **Kein Schreiben nach `data/raw`:** Die nächste Nacht extrahiert die neue Einheit (Plan 0048, E5, „neue Einheit“). Der Commit enthält nur `data/providers.yaml`.
- **Budget vor der Übergabe:** wie Plan 0050, E8, über denselben Befehl `pnpm pipeline katalog-budget` (neu in diesem Plan, E5). Im Modus `live` baut der Job nach dem letzten Anhang `data/offers.json` ohne Commit neu, dazu `pnpm build` und `pnpm size`. Ist das rot, nimmt der Job die Anhänge zurück und behält den Zustands-Commit; die Ampel wird rot.

### E4 – Zustand

`DiscoverState` (`.default([])` für bestehende Dateien) bekommt zwei Felder:
- **`seiten`:** je geprüfter Kandidaten-URL `{url, anbieter, geprueft, ergebnis, grund?}` mit `ergebnis` aus E2. Ruhezeit bis zum nächsten Ertragsbeweis:
  - `deckungsgleich`, `ohne-ertrag` und `abgeschnitten`: 8 Wochen;
  - `fehler`: bis zum nächsten Lauf.
- **`gepflegt`:** je Anbieter `{anbieter, datum}` des letzten Pflegelaufs, auch ohne Kandidaten. Danach richtet sich die Reihenfolge (E5); kein Anbieter verhungert.

Weitere Regeln:
- **Ablehnen** wie bei Anbietern (Skill, Abschnitt 2): Revert des Commits, dann in `abgelehnt` ein Eintrag mit `url` der Seite, **`anbieter`** (neues optionales Feld, die Katalog-ID) und Grund. Nicht `id`: Das hieße „Anbieter zurückgenommen“ (`reservedConflicts`). Eine abgelehnte URL wird nie wieder angehängt. Der Skill beschreibt den Ablauf samt `pnpm pipeline nightly --build-only`, wenn der Revert nach einem Nachtlauf kommt.
- Der Zustand liegt in der Datei der Region des Anbieters. Er wird wie heute mit `commitRunState` committet, zusammen mit `data/kosten.csv`.

### E5 – Pflegelauf

- `pnpm pipeline pflege [--region <id> | --netz <netz>] [--only <id,…>] [--dry-run] [--katalog <datei>]`. `--katalog` ist nur mit `--dry-run` erlaubt.
- **Teilnehmer:** alle Anbieter mit `role: anbieter` außer `coveredBy` und `skipCrawl`.
- **Nur berichtet, nicht angehängt:** Anbieter mit einem Orts-`hint` an einer `termine`-Seite (Muster „weglassen“, „Nur Termine an“). Eine neue Seite hätte den Hinweis nicht, und ihre Termine landeten am ersten Ort. S0 zählt sie.
- **Reihenfolge:**
  1. Anbieter mit einer Einheit `dauerhaft` seit mindestens zwei Tagen (Ziel 3);
  2. dann nach `gepflegt.datum`, älteste zuerst, nie gepflegt ganz vorn;
  3. bei Gleichstand nach ID.
- **Grenzen:**
  - Zeitbudget `PFLEGE_BUDGET_MIN` 120;
  - `PFLEGE_BRAKES` in `scripts/pipeline/lib/cost.ts`, zu Beginn 300 Aufrufe und 30 Mio. Tokens. S3 setzt beide auf das Doppelte des größten gemessenen Laufs (ADR 0033, Punkt 7).
- **Workflow:** `.github/workflows/discover.yml` wird der Workflow für Katalog-Läufe.
  - Ein wöchentlicher Cron je Netz für `pflege`: Mittwoch `vgn`, Donnerstag `vrr`, je 04:30 UTC. Der `vrr`-Cron kommt erst mit Plan 0044.
  - Der Job `modus` gibt zusätzlich `lauf` (`entdecken` oder `pflege`, aus dem Cron bzw. der neuen Eingabe `lauf`) und `timeout` aus.
  - `timeout-minutes` des Modell-Jobs kommt aus `timeout`, mindestens das Zeitbudget des Laufs plus 30 Minuten.
  - Die Repo-Variable `PFLEGE_MODUS` (`trocken` Standard, `live`) gilt nur für `pflege`; `ENTDECKEN_MODUS` bleibt für `entdecken`.
  - Die Jobstruktur bleibt: Modell nur im Job ohne Schreibrecht, Push nur in `veroeffentlichen`.
  - Ein Test (`scripts/lib/discover-workflow.test.ts`, Muster `scripts/lib/push-schedule.test.ts`) prüft:
    - Cron → `lauf`;
    - `timeout` ≥ Budget + 30;
    - `PFLEGE_MODUS` nur für `pflege`;
    - Rechte je Job;
    - der Budgetschritt (E3) vor der Übergabe.
- **Issue je Lauf** mit Änderungen: Titel „Pflege <datum>: n Seiten angehängt“.
  - Es entsteht nur, wenn etwas angehängt wurde.
  - Inhalt: je Commit Anbieter, Seite und neue Angebote, dazu der Hinweis auf Revert und `abgelehnt`.
  - Erzeugt wird es aus den Commit-Texten wie `newProvidersIssue` (`scripts/pipeline/lib/discover.ts`), mit eigenem Betreff-Muster. Fremder Text ist einzeilig, gekürzt, `@` entschärft.
- **Bericht** (`runs/<datum>/pflege/report.md`, Job-Summary):
  - je Anbieter abgerufene Seiten, Kandidaten und Ergebnis je Kandidat;
  - Hinweise: „Liste blättert“, „`partChars` prüfen“, „nur berichtet (Orts-`hint`)“;
  - Summen und Kosten.

### E6 – Messen

- `--katalog <datei>` ersetzt `data/providers.yaml` im Lauf (nur mit `--dry-run`); damit misst S1 Ziel 1 an einer Katalogkopie.
- Neuer Abschnitt „Seitenfinder“ in `evals/results.md`: Datum, Modell, wiedergefunden von 10, angehängt, davon von Hand bestätigt, Abrufe, Dauer.

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/site-crawl.ts` (neu) | Modi `kandidaten` und `alle`, Reihenfolge, Ausschlüsse, `pageSignals`, `SHARED_HOSTS` | S1 |
| `scripts/pipeline/io/site-crawl.ts` (neu) | Abruf über den gemeinsamen Abruf, Warteschlange je Host, Browser bei `jsRendered` | S1 |
| `scripts/pipeline/lib/pflege.ts`, `scripts/pipeline/io/pflege.ts` (neu) | Ertragsbeweis gegen den Vergleichsstand, Ergebnis, Reihenfolge, Orts-`hint`, Bericht | S1 |
| `scripts/pipeline/lib/discover-state.ts` | `seiten`, `gepflegt`, `abgelehnt.anbieter` | S1 |
| `scripts/pipeline/lib/cost.ts` | `PFLEGE_BRAKES` | S1, S3 |
| `scripts/pipeline/lib/catalog-yaml.ts` | `appendProgramme` | S2 |
| `scripts/pipeline/lib/catalog-diff.ts` | Option `allowProgrammeAppend`, `appended` | S2 |
| `scripts/pipeline/io/discover-git.ts`, `scripts/pipeline/lib/discover.ts` | Commit je Anbieter, Issue „Pflege“ | S2 |
| `scripts/pipeline/cli.ts` | `pflege`, `katalog-budget` | S1, S2 |
| `.github/workflows/discover.yml`, `scripts/lib/discover-workflow.test.ts` (neu) | Cron, `lauf`, `timeout`, `PFLEGE_MODUS`, Budgetschritt | S2 |
| `evals/results.md` | Abschnitt „Seitenfinder“ | S1, S3 |
| Skill (Abschnitte 1 und 2: Pflege-Issue, Seite ablehnen, Revert nach dem Nachtlauf), `docs/architecture.md`, `CLAUDE.md` („Daten“: `pflege` hängt Programmseiten an) | Doku | S2, S3 |

## Tests (test-first)

- `lib/site-crawl.test.ts`:
  - Breitensuche, Tiefe 2, höchstens 20;
  - `sameSite` mit Subdomain;
  - Plattform-Link ein Sprung, nicht weiter;
  - Profil auf geteiltem Host nur unterhalb des Pfads und mit gleichen Query-Parametern;
  - Sammelkalender-Host und `follow`-URL nie Kandidat;
  - Reihenfolge stabil bei Gleichstand;
  - Ausschlüsse;
  - Modus `alle` liefert alle Seiten plus höchstens zwei Kontaktseiten.

  Fixtures: Liste mit Detailseiten (wie Sharky), Relaunch mit neuer Stundenplan-URL (wie FamilienBox), eigene Seite mit Link auf ein Buchungs-Widget.
- `pageSignals`:
  - drei künftige Daten → Kandidat, vergangene zählen nicht;
  - `TT.MM.` ohne Jahr über den Jahreswechsel (`today` 2026-12-20, „03.01.“ gilt als 2027);
  - Wochentag plus Uhrzeit;
  - iCal in `feeds`, JSON-LD;
  - ohne `isRelevant` kein Kandidat;
  - Seite aus dem Katalog nie Kandidat, auch nach Weiterleitung.
- `io/site-crawl.test.ts` (Fake-Uhr, Fake-Abruf):
  - höchstens 1/s je Host über zwei Anbieter auf demselben Host;
  - robots.txt-Sperre;
  - 20 Abrufe einschließlich Browser, PDF und Weiterleitungen.
- `lib/pflege.test.ts`:
  - neues Angebot → `anhaengen`;
  - alle vorhanden → `deckungsgleich`;
  - Ersatzseite einer Einheit mit `dauerhaft` → `anhaengen`;
  - zweite Fassung einer vorübergehend ausgefallenen Seite → `deckungsgleich`;
  - mit `--katalog` ohne die entfernte Seite → `anhaengen`;
  - leer → `ohne-ertrag`;
  - Reihenfolge: `dauerhaft` vor `gepflegt`, nie gepflegt vorn;
  - drei Läufe mit Budget für je zwei von sechs Anbietern → jeder einmal dran;
  - Orts-`hint` → nur Bericht;
  - Ruhezeiten;
  - abgelehnte URL nie wieder.
- `lib/discover-state.test.ts`:
  - bestehende Dateien ohne die neuen Felder bleiben gültig;
  - `abgelehnt` mit `anbieter` löst keinen `reservedConflicts` aus, mit `id` schon.
- `lib/catalog-yaml.test.ts`: `appendProgramme` erhält Kommentare und Formatierung anderer Einträge.
- `lib/catalog-diff.test.ts`:
  - mit Option erlaubt: Anhang am Ende von `programme`;
  - Fehler: Änderung, Umsortierung, Entfernen, Anhang mit `hint` oder `request`;
  - **ohne Option ist jeder Anhang ein Fehler** (Entdecken);
  - `appended` stimmt.
- `io/pflege.test.ts` (Fake-Abruf, Fake-Extraktor):
  - Lauf über drei Anbieter, ein Anhang, ein Commit mit nur `data/providers.yaml`;
  - G1 rot → zurückgenommen, Lauf geht weiter;
  - G3 greift;
  - Trockenlauf committet nicht;
  - `--katalog` ohne `--dry-run` → Fehler;
  - **Ziel 3 als Durchlauf:** Anbieter mit Einheit `dauerhaft` seit 2 Tagen, neue URL im Menü → angehängt;
  - Issue-Text mit `@` und Zeilenumbruch aus Webtext → entschärft.
- `scripts/lib/discover-workflow.test.ts`: wie E5.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected`; S1 und S2 mit `/arch-review`.

- **S0 – Messen (Wegwerf-Skript, ohne Modell).**
  - Erkundung nach E1, Modus `kandidaten`, über alle Katalog-Anbieter.
  - Gemessen werden: Kandidaten je Anbieter, die der Katalog nicht nennt; Abrufe und Dauer; von robots.txt gesperrte Seiten; Anbieter mit Orts-`hint`; Websites mit Seiten mehrerer Anbieter (für die Entscheidung über die automatische Erkennung).
  - 20 Kandidaten prüft ein Mensch, ob es echte Programmseiten sind.
  - Ergebnis in „Umsetzung“; daraus die Schwellen von `pageSignals`, falls nötig ein Nachtrag.
- **S1 – Modul und Pflegelauf im Trockenlauf.** E1 (beide Modi), E2, E4, E5 ohne Commit, E6. Ziel 1 an der Katalogkopie, zwei Läufe. Ein Trockenlauf für `vgn` lokal, der Bericht geht an den Nutzer.
- **S2 – Anhängen.** E3, `katalog-budget`, Workflow mit `PFLEGE_MODUS=trocken`, ein Trockenlauf für `vgn` in Actions.
- **S3 – Live** nach N1: `gh variable set PFLEGE_MODUS --body live`. Die ersten zwei Live-Läufe prüft ein Mensch Seite für Seite (Ziel 2), danach Grenzen nach ADR 0033, Punkt 7. `vrr` kommt dazu, sobald Plan 0044 live ist.
- **S4 – Abschluss.** Ziele 1–4 im Bericht, Live-Prüfung, Restpunkte nach `docs/ideas.md` (automatische Erkennung geteilter Websites, Fund für `skipCrawl`), archivieren.

## Nutzerentscheide (offen)

- **N1 – Live ohne Abnahme je Seite.** Empfehlung: nach zwei abgenommenen Trockenläufen live, Rücknahme per Revert und `abgelehnt`; die ersten zwei Live-Läufe prüft ein Mensch nachträglich. Alternative: dauerhaft Trockenlauf mit Vorschlägen im Issue (wie Plan 0045, S3b).
- **N2 – Takt.** Empfehlung: wöchentlich je Netz, ausgefallene Seiten zuerst (ADR 0033, Punkt 4). Alternative: zusätzlich täglich nach dem Nachtlauf mit `--only` für neue Fälle `dauerhaft`, für schnelleren Ersatz.

## Kosten

Nach Nutzervorgabe kein Kriterium. Ein Pflegelauf ruft je Anbieter höchstens 20 Seiten ab und extrahiert höchstens 5 Kandidaten. Danach ruhen geprüfte Kandidaten 8 Wochen.

## Risiken

- **Falsche Seite angehängt** (fremder Veranstalter, Archiv mit alten Terminen, Shop). Abhilfe:
  - Ertragsbeweis mit künftigem Termin und neuem Angebot;
  - eigene Website, Plattform nur per direktem Link, Mandant gleich;
  - Sammelkalender-Hosts ausgeschlossen;
  - Venues des Anbieters im Auszug;
  - Prüfung von Hand in S3;
  - Revert und `abgelehnt`.
- **Zweite Fassung einer vorhandenen Seite** (Druckansicht, andere Sortierung). Abhilfe: Vergleich auch gegen vorübergehend ausgefallene Einheiten; `assignIds` und `sameOfferTwice`; Dublettenregeln des Builds; Prüfung in S3.
- **Termine am falschen Ort.** Abhilfe: Anbieter mit Orts-`hint` nur berichten.
- **Veraltete Seite bleibt neben der neuen** (404-Seite und Ersatz). Abhilfe: Der Wächter meldet die alte; nach 14 Tagen `dauerhaft` entfallen ihre Events (Plan 0048, E5).
- **Last auf fremden Websites.** Abhilfe: 20 Abrufe je Anbieter, 1/s je Host über den Lauf, robots.txt, wöchentlich, Ruhezeiten.
- **G2 lockerer.** Abhilfe: nur im Pflegelauf, nur Anhängen am Ende von `programme`, genau vier Schlüssel, Diff-Prüfung gegen die eigenen Anhänge, ein Commit je Anbieter.
- **Größenbudgets.** Abhilfe: `katalog-budget` vor der Übergabe; `vrr` erst nach Plan 0044.

## Review (2026-10-26) – Verdict: Überarbeiten

Unabhängiger Review des Entwurfs. Die Befunde sind am Code nachgeprüft. Alle sind übernommen; die Begründung steht in der genannten Entscheidung.

- **B1** `abgelehnt` mit `id` macht `data:validate` rot (`reservedConflicts`): neues Feld `anbieter` (E4, Test).
- **Major:**
  - **M1** Zeitbudget gleich Job-Limit: `timeout` je Lauf ≥ Budget + 30 (E5, Test).
  - **M2** Verhungern: `gepflegt` je Anbieter (E4, E5, Test über drei Läufe).
  - **M3** Plattform-Seiten unerreichbar: ein Sprung auf `SHARED_HOSTS`, `sameSite`, Ziel 1 nur über erreichbare Seiten (E1, Ziel 1).
  - **M4** Fremde Veranstalter auf geteilten Hosts: Sammelkalender-Hosts nie Kandidat, Mandant über die Query-Parameter (E1, Test).
  - **M5** Ortshinweise: Anbieter mit Orts-`hint` nur berichten (E5, S0 zählt).
  - **M6** Vergleichsstand: wirksamer Katalog, nur `dauerhaft` ausgenommen (E2, Tests). ADR 0033, Punkt 4 angepasst.
  - **M7** „sofort“ im ADR: ADR 0033, Punkt 4 sagt jetzt „zuerst“; N2 nennt den täglichen Lauf als Alternative.
  - **M8** G2 für das Entdecken: Option `allowProgrammeAppend` nur im Pflegelauf, genau vier Schlüssel (E3, Test).
  - **M9** Größenbudget: `katalog-budget` vor der Übergabe, `vrr` erst nach Plan 0044 (E3, E5).
- **Minor:**
  - Voraussetzung „alle Rohdateien umgestellt“;
  - `follow`-URLs nie Kandidat;
  - Tests für Höflichkeit, Issue-Text, `--katalog` und Ziel 3;
  - Datum ohne Jahr, Europe/Berlin und feste Sortierung;
  - `feeds`, `jsonLd` und `jsRendered` aus `extractPage`;
  - Ruhezeit für `abgeschnitten`;
  - Startwerte der Bremsen und `cost.ts`;
  - `commitRunState`;
  - Folge bei verfehltem Ziel 2;
  - Revert nach dem Nachtlauf im Skill.
- **Scope:** automatische Erkennung geteilter Websites erst nach S0; `skipCrawl` aus dem Lauf genommen.
- **Aus dem Review von Plan 0050** (M4): Modus `alle` für das Entdecken (E1).

Die Änderungen sind noch nicht unabhängig geprüft; deshalb folgt Review 2.
