# Plan 0049 – Seitenfinder: Programmseiten finden, zuerst für bekannte Anbieter

Status: Entwurf
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`), Punkt 4 (ein Seitenfinder), Punkt 1 (ein Abruf), Punkt 5 (Issue je Lauf neben dem Wächter). Dieser Plan baut das Modul und die **Pflege bekannter Anbieter**; den Einsatz im Entdecken baut Plan 0050 (`docs/plans/0050-entdecken-schlank.md`).
- Plan 0048 (`docs/plans/0048-nachtlauf-seite-als-einheit.md`): Einheit Seite (E1), Ertragsbeweis je Einheit, Abruf mit User-Agent und robots.txt (E8), Fehlerklasse `dauerhaft`, Wächter.
- Plan 0045 (`docs/plans/archiv/0045-entdecken-vollstaendig.md`), E5.1 (Website-Erkundung) und S3b (neue Programmseiten bekannter Anbieter): Ideen übernommen; aus „nur Vorschlag im Issue“ wird automatisches Anhängen.
- Plan 0032, E7 (Gates G1–G4); ADR 0026, Punkt 5 (G2); ADR 0022 (IDs); Skill `babyevents-nuernberg`, `references/booking-systems.md`.

## Voraussetzungen

- Plan 0048 ist live bis einschließlich S2: Einheit Seite, Ertragsbeweis je Einheit, gemeinsamer Abruf mit robots.txt.
- Basis `main` wie Plan 0048.

## Anlass

Der Nutzer will, dass neue Angebote bekannter Anbieter zuverlässig auftauchen (2026-10-25). Der Nachtlauf liest nur Seiten, die im Katalog stehen. Neue Programmseiten findet bisher nur ein Mensch:
- ein neuer Kursbereich;
- ein neuer Stundenplan nach einem Relaunch (`die-familienbox`: `/erwachsenenkurse/stundenplan-1/` liefert seit 2026-10-22 HTTP 404);
- Detailseiten statt Übersicht (`sharky-duesseldorf`);
- ein iCal-Feed (`cvjm-gostenhof-miniclub` über `evangelische-termine.de`).

Plan 0045, S3b wollte solche Seiten nur vorschlagen; ein Vorschlag, den ein Mensch umsetzen muss, ist nicht zuverlässig. ADR 0033, Punkt 4 erlaubt deshalb das Anhängen mit Ertragsbeweis.

## Ausgangslage

- **Bewerten beim Entdecken:** Es sieht die Fund-Seite und höchstens zwei Kontaktseiten (`CONTACT_PATTERNS`, `MAX_CONTACT_PAGES` in `scripts/pipeline/lib/discover.ts`). Programmseiten müssen aus der Fund-Seite oder ihren Links stammen (`allowedUrlsOf`).
- **G2** (`scripts/pipeline/lib/catalog-diff.ts`): Der Katalog darf nur um neue Einträge am Ende wachsen. Jede Änderung eines bestehenden Eintrags bricht den Lauf ab. Angehängt wird mit `appendEntries` (`scripts/pipeline/lib/catalog-yaml.ts`), das Kommentare und Formatierung erhält.
- **Zustand** `data/discover/<region>.json` (`DiscoverState`, `scripts/pipeline/lib/discover-state.ts`): `abgelehnt` (URL, Host oder ID mit Grund) und `zurueckgestellt`.
- **Ertragsbeweis** (`proveYield` in `scripts/pipeline/lib/discover.ts`): ein Angebot für 0–3 Jahre mit künftigem Termin, dazu Kleinkindbezug im Text (`isRelevant`).
- **Wie viele Seiten fehlen**, ist nicht gemessen; das leistet S0.

## Ziel

1. **Wiederfinden.** In einer Katalogkopie wird bei 10 zufällig gezogenen Anbietern mit mindestens zwei Programmseiten (gesetzter Seed) je eine Seite entfernt. Der Pflegelauf im Trockenlauf hängt bei mindestens 8 davon die entfernte Seite oder eine mit denselben Angeboten wieder an. Gemessen mit `--katalog <kopie>` (E6).
2. **Nur echte Programmseiten.** Jede angehängte Seite liefert im Ertragsbeweis mindestens ein Angebot, das der Anbieter vorher nicht hatte (E2, durch Bauart). In den ersten zwei Live-Läufen prüft ein Mensch jede angehängte Seite: Mindestens 90 % sind Programmseiten des Anbieters, nicht eines fremden Veranstalters, und keine zweite Fassung einer vorhandenen Seite. Das Urteil steht in `evals/results.md`.
3. **Ersatz für ausgefallene Seiten.** Für einen Anbieter, dessen Seite seit mindestens zwei Tagen mit `dauerhaft` scheitert, findet der nächste Pflegelauf die Ersatzseite, wenn die Website eine hat. Nachgewiesen mit einem Test (Fixture wie `die-familienbox`: alte URL 404, neue URL im Menü) und im Bericht des ersten Live-Laufs.
4. **Höflich.** Je Anbieter und Lauf höchstens 20 Abrufe, robots.txt nach Plan 0048, höchstens ein Abruf je Sekunde und Host.

## Nicht-Ziele

- **Seiten entfernen oder ändern** (`hint`, `partChars`, `follow`, `blocked`): bleibt beim Menschen, den der Wächter (Plan 0048, E10) hinweist.
- **Neue Anbieter:** Plan 0050. Es nutzt das Modul aus E1.
- **Folgeseiten (`follow`) automatisch setzen:** Der Bericht nennt „Liste blättert“, wenn eine Kandidatenseite einen Folgelink hat; gesetzt wird `follow` von Hand.
- **Anbieter ohne eigene Website** (nur Plattform-Profil): nur unterhalb des Profil-Pfads (E1), sonst kein Sonderweg.

## Entscheidungen

### E1 – Modul

- **Auswahl, rein** in `scripts/pipeline/lib/site-crawl.ts` (neu):
  - **Start:** die `url` des Eintrags und alle seine Programmseiten (auch `blocked` und `use: info`, als Startpunkte, nicht als Kandidaten).
  - **Breitensuche** bis Tiefe 2, höchstens 20 abgerufene Seiten. Nur dieselbe Website (`siteOf`, `scripts/pipeline/lib/fetch.ts`).
  - **Geteilte Websites** erkundet die Suche nur unterhalb des Pfads der Startseite. Das sind die Hosts aus `SHARED_HOSTS` (neu, mit den Buchungsplattformen aus `references/booking-systems.md`, `evangelische-termine.de`, `jimdofree.com`, `wixsite.com`) und jede Website, auf der mindestens zwei Katalog-Anbieter Start- oder Programmseiten haben.
  - **Reihenfolge** nach Wörtern in Linktext und Pfad: Kurs, Termin, Programm, Stundenplan, Kalender, Veranstaltung, Baby, Eltern-Kind, Krabbel, Familie, Anmeldung. Nie besucht werden Impressum, Datenschutz, AGB, Warenkorb, Login, Shop, Presse, Jobs und Bilddateien.
  - **Erkennung:** iCal-Links (`.ics`, `webcal:`, `/ical`), PDF-Links, JSON-LD `Event`/`Course`, Buchungssysteme nach den Merkmalen in `booking-systems.md`.
- **Kandidat für eine Programmseite** (`pageSignals(text, links, today)`, rein). Eine Seite ist Kandidat bei:
  - mindestens 3 künftigen Datumsangaben (`TT.MM.` oder `TT.MM.JJJJ`, ab `today`),
  - oder mindestens 2 Angaben „Wochentag plus Uhrzeit“,
  - jeweils zusammen mit `isRelevant`.

  iCal und JSON-LD mit künftigen Terminen sind immer Kandidaten, ein PDF dann, wenn sein Text die Bedingung erfüllt. Seiten, die der Katalog schon nennt (normalisierte URL, auch nach Weiterleitung), sind nie Kandidaten.
- **Leere Seite** (unter 500 Zeichen Text): einmal im Browser; dann gilt `render: browser` für den Kandidaten.
- **Abruf** in `scripts/pipeline/io/site-crawl.ts` (neu) über den gemeinsamen Abruf aus Plan 0048, S1 (User-Agent, robots.txt, Fehlerklasse). Höchstens ein Abruf je Sekunde und Host; PDFs über `pdftotext` wie im Nachtlauf.
- Höchstens 5 Kandidaten je Anbieter gehen in den Ertragsbeweis, nach der Zahl künftiger Termine geordnet.

### E2 – Ertragsbeweis einer Kandidatenseite

- Der Kandidat wird ein Katalog-Programmeintrag `{url, kind, render?, use: termine}` und damit **eine Einheit** nach Plan 0048, E1, mit den Venues des Anbieters und seinen Beilagen. Extrahiert wird mit demselben Extraktor wie im Nachtlauf, ohne Schreiben nach `data/raw` (Zustand nur im Laufverzeichnis).
- Die Events laufen durch `buildOffers` gegen die **Angebote gesunder Einheiten** des Anbieters, also aus `data/raw` ohne Einheiten im Status `fehler`. Sonst sähe die Ersatzseite einer ausgefallenen Seite deren alte Kurse und gälte als deckungsgleich (Ziel 3).
- **Neu** ist ein gebautes Angebot, wenn:
  - es einen künftigen Termin hat,
  - `age.minMonths` ≤ 36,
  - `assignIds` ihm keine ID aus diesem Vergleichsstand gibt,
  - und `sameOfferTwice` es mit keinem Angebot daraus verbindet.
- **Ergebnis:**
  - `anhaengen`, wenn es mindestens ein neues Angebot gibt und `isRelevant` auf dem Text greift;
  - `deckungsgleich`, wenn alle Angebote schon da sind;
  - `ohne-ertrag`, wenn es kein gültiges Angebot gibt;
  - `abgeschnitten` (Teil zu lang), als Hinweis „`partChars` prüfen“;
  - `fehler` bei Abruf oder Modell.

### E3 – Anhängen und Gate G2

- `appendProgramme(text, id, pages)` in `scripts/pipeline/lib/catalog-yaml.ts` hängt Einträge an das `programme` des Eintrags an und erhält Kommentare und Formatierung wie `appendEntries`.
- **G2 neu** (`catalogDiff`): Ein bestehender Eintrag darf sich nur so ändern, dass am **Ende** von `programme` neue Einträge stehen, jeweils mit `use: termine` und ohne `blocked`, `hint` oder `follow`. Alles andere bleibt gleich. `catalogDiff` liefert dazu `appended: {id, urls}[]`, und der Lauf prüft, dass das genau seine Anhänge sind.
- **G1** (`pnpm data:validate` über den Gate-Aufruf wie heute) je Commit.
- **G3:** höchstens 3 Seiten je Anbieter und 20 je Lauf.
- **G4:** ein Commit je Anbieter, Betreff `data: Programmseite für <id> (<n>)`, im Text je Seite URL, Art, neue Angebote mit erstem Termin.
- **Kein Schreiben nach `data/raw`:** Die nächste Nacht extrahiert die neue Einheit (Plan 0048, E5, „neue Einheit“). So bleibt `refreshProvider` der einzige Schreibweg; der Commit enthält nur `data/providers.yaml`.

### E4 – Zustand

- `DiscoverState` bekommt `seiten`: je geprüfter Kandidaten-URL `{url, id, geprueft, ergebnis, grund?}` mit `ergebnis` aus E2. Ein Kandidat mit `deckungsgleich` oder `ohne-ertrag` kommt frühestens nach 8 Wochen wieder in den Ertragsbeweis, mit `fehler` in der nächsten Woche.
- Der Zustand liegt in der Datei der Region des Anbieters.
- **Ablehnen** wie bei Anbietern (Skill, Abschnitt 2): Revert des Commits, dann in `abgelehnt` ein Eintrag mit `url` der Seite, `id` des Anbieters und Grund. Eine abgelehnte URL wird nie wieder angehängt. Der Skill bekommt den Ablauf; `data/discover/<region>.json` bleibt von Hand nur in `abgelehnt` änderbar (CLAUDE.md).

### E5 – Pflegelauf

- `pnpm pipeline pflege [--region <id> | --netz <netz>] [--only <id,…>] [--dry-run] [--katalog <datei>]`.
- **Reihenfolge:**
  1. Anbieter mit einer Einheit `dauerhaft` seit mindestens zwei Tagen (Ziel 3);
  2. Anbieter, deren letzte Pflege am längsten zurückliegt (`DiscoverState.seiten`, sonst nie).

  Alle Anbieter mit `role: anbieter` außer `coveredBy`. Anbieter mit `skipCrawl` sind dabei: Findet der Seitenfinder für sie eine Seite mit Ertrag, nennt der Bericht das, angehängt wird aber nicht, weil `skipCrawl` dann von Hand weg muss.
- **Grenzen:** Zeitbudget `PFLEGE_BUDGET_MIN` 120, Bremsen nach ADR 0033, Punkt 7 (S1 misst, S3 setzt das Doppelte).
- **Workflow:** `.github/workflows/discover.yml` wird der Workflow für Katalog-Läufe.
  - Ein wöchentlicher Cron je Netz für `pflege` (Mittwoch `vgn`, Donnerstag `vrr`, 04:30 UTC).
  - Der Job `modus` gibt zusätzlich `lauf` (`entdecken` oder `pflege`) aus, aus dem Cron bzw. der neuen Eingabe `lauf`.
  - Die Repo-Variable `PFLEGE_MODUS` (`trocken` Standard, `live`) gilt nur für `pflege`; `ENTDECKEN_MODUS` bleibt für `entdecken`.
  - Die Jobstruktur bleibt: Modell nur im Job ohne Schreibrecht, Push nur in `veroeffentlichen`.
  - Ein Test parst `discover.yml` (Muster `scripts/lib/push-schedule.test.ts`): Cron → `lauf`, `PFLEGE_MODUS` nur für `pflege`, Rechte je Job.
- **Issue je Lauf** mit Änderungen: Titel „Pflege <datum>: n Seiten angehängt“, je Commit Anbieter, Seite, neue Angebote, Hinweis auf Revert und `abgelehnt`. Es entsteht nur, wenn etwas angehängt wurde. Erzeugt wird es aus den Commit-Texten wie `newProvidersIssue` (`scripts/pipeline/lib/discover.ts`), mit eigenem Betreff-Muster.
- **Bericht** (`runs/<datum>/pflege/report.md`, Job-Summary): je Anbieter abgerufene Seiten, Kandidaten, Ergebnis je Kandidat, Hinweise („Liste blättert“, „`partChars` prüfen“, „gefunden für `skipCrawl`“); Summen; Kosten.

### E6 – Messen

- `--katalog <datei>` ersetzt `data/providers.yaml` im Lauf (nur mit `--dry-run`); damit misst S1 Ziel 1 an einer Katalogkopie.
- Ein Eval-Eintrag in `evals/results.md`, Abschnitt „Seitenfinder“ (neu): Datum, Modell, wiedergefunden von 10, angehängt, davon von Hand bestätigt, Abrufe, Dauer.

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/site-crawl.ts` (neu) | Auswahl, Reihenfolge, Erkennung, `pageSignals`, `SHARED_HOSTS` | S1 |
| `scripts/pipeline/io/site-crawl.ts` (neu) | Abruf über den gemeinsamen Abruf, Browser bei leeren Seiten | S1 |
| `scripts/pipeline/lib/pflege.ts`, `scripts/pipeline/io/pflege.ts` (neu) | Ertragsbeweis gegen gesunde Einheiten, Ergebnis, Reihenfolge, Bericht | S1 |
| `scripts/pipeline/lib/catalog-yaml.ts` | `appendProgramme` | S2 |
| `scripts/pipeline/lib/catalog-diff.ts` | G2 mit angehängten Programmseiten | S2 |
| `scripts/pipeline/lib/discover-state.ts` | `seiten` | S1 |
| `scripts/pipeline/io/discover-git.ts`, `scripts/pipeline/lib/discover.ts` | Commit je Anbieter, Issue „Pflege“ | S2 |
| `scripts/pipeline/cli.ts` | `pflege` | S1 |
| `.github/workflows/discover.yml`, `scripts/lib/discover-workflow.test.ts` (neu) | Cron, `lauf`, `PFLEGE_MODUS` | S2 |
| `evals/results.md` | Abschnitt „Seitenfinder“ | S1, S3 |
| Skill (Abschnitte 1 und 2, Pflege-Issue und Ablehnen einer Seite), `docs/architecture.md`, `CLAUDE.md` („Daten“: `pflege` hängt Programmseiten an) | Doku | S2, S3 |

## Tests (test-first)

- `lib/site-crawl.test.ts`:
  - Breitensuche, Tiefe 2, höchstens 20;
  - nur dieselbe Website;
  - auf geteilten Websites nur unterhalb des Pfads, automatisch geteilte Website aus dem Katalog erkannt;
  - Reihenfolge nach Wörtern;
  - Ausschlüsse;
  - iCal, PDF, JSON-LD und Buchungssystem erkannt.

  Fixtures: Liste mit Detailseiten (wie Sharky), Gruppenseite mit iCal-Link (wie CVJM), Relaunch mit neuer Stundenplan-URL (wie FamilienBox).
- `pageSignals`:
  - drei künftige Daten → Kandidat, vergangene zählen nicht;
  - Wochentag plus Uhrzeit;
  - ohne `isRelevant` kein Kandidat;
  - Seite aus dem Katalog nie Kandidat, auch nach Weiterleitung.
- `lib/pflege.test.ts`:
  - neues Angebot → `anhaengen`;
  - alle vorhanden → `deckungsgleich`;
  - Ersatzseite einer ausgefallenen Einheit mit denselben Kursen → `anhaengen`, weil gegen gesunde Einheiten verglichen;
  - leer → `ohne-ertrag`;
  - Reihenfolge `dauerhaft` vor ältester Pflege;
  - `skipCrawl` → nur Bericht;
  - 8 Wochen Ruhe;
  - abgelehnte URL nie wieder.
- `lib/catalog-yaml.test.ts`: `appendProgramme` erhält Kommentare und Formatierung anderer Einträge.
- `lib/catalog-diff.test.ts`:
  - Anhang am Ende von `programme` erlaubt;
  - Änderung, Umsortierung, Entfernen oder ein Anhang mit `hint` → Fehler;
  - `appended` stimmt.
- `io/pflege.test.ts` (Fake-Abruf, Fake-Extraktor):
  - Lauf über drei Anbieter, ein Anhang, ein Commit mit nur `data/providers.yaml`;
  - G1 rot → zurückgenommen, Lauf geht weiter;
  - G3 greift;
  - Trockenlauf committet nicht.
- `scripts/lib/discover-workflow.test.ts`: wie E5.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected`; S1 und S2 mit `/arch-review`.

- **S0 – Messen (Wegwerf-Skript, ohne Modell).** Erkundung nach E1 über alle Katalog-Anbieter. Gemessen werden:
  - Kandidaten je Anbieter, die der Katalog nicht nennt;
  - Abrufe und Dauer;
  - von robots.txt gesperrte Seiten.

  20 Kandidaten prüft ein Mensch von Hand, ob es echte Programmseiten sind. Ergebnis in „Umsetzung“; daraus die Schwellen von `pageSignals`, falls nötig ein Nachtrag.
- **S1 – Modul und Pflegelauf im Trockenlauf.** E1, E2, E4, E5 ohne Commit, E6. Ziel 1 an der Katalogkopie (zwei Läufe). Ein Trockenlauf je Netz lokal, Bericht an den Nutzer.
- **S2 – Anhängen.** E3, Workflow mit `PFLEGE_MODUS=trocken`, ein Trockenlauf je Netz in Actions.
- **S3 – Live** nach N1: `gh variable set PFLEGE_MODUS --body live`. Die ersten zwei Live-Läufe prüft ein Mensch Seite für Seite (Ziel 2). Danach Grenzen nach ADR 0033, Punkt 7.
- **S4 – Abschluss.** Ziele 1–4 im Bericht, Live-Prüfung, Restpunkte nach `docs/ideas.md`, archivieren.

## Nutzerentscheide (offen)

- **N1 – Live ohne Abnahme je Seite.** Empfehlung: nach zwei abgenommenen Trockenläufen live, Rücknahme per Revert und `abgelehnt`; die ersten zwei Live-Läufe prüft ein Mensch nachträglich. Alternative: dauerhaft Trockenlauf mit Vorschlägen im Issue (wie Plan 0045, S3b).
- **N2 – Takt.** Empfehlung: wöchentlich je Netz. Alternative: täglich nach dem Nachtlauf nur für Anbieter mit einer Seite `dauerhaft` (schnellerer Ersatz, mehr Läufe).

## Kosten

Nach Nutzervorgabe kein Kriterium. Ein Pflegelauf ruft je Anbieter höchstens 20 Seiten ab und extrahiert höchstens 5 Kandidaten. Nach dem ersten Lauf ruhen geprüfte Kandidaten 8 Wochen.

## Risiken

- **Falsche Seite angehängt** (fremder Veranstalter auf derselben Website, Archivseite mit alten Terminen, Shop). Abhilfe:
  - Ertragsbeweis mit künftigem Termin und neuem Angebot;
  - nur dieselbe Website, auf geteilten nur unterhalb des Pfads;
  - Venues des Anbieters im Prompt;
  - Prüfung von Hand in S3;
  - Revert und `abgelehnt`.
- **Zweite Fassung einer vorhandenen Seite** (Druckansicht, andere Sortierung) mit leicht anderen Titeln. Abhilfe: `assignIds` und `sameOfferTwice` gegen den Bestand; der Build entfernt Dubletten gleicher Quelle (ADR 0031); Prüfung in S3.
- **Veraltete Seite bleibt neben der neuen** (404-Seite und Ersatz). Abhilfe: Wächter meldet die alte; nach 14 Tagen `dauerhaft` entfallen ihre Events (Plan 0048, E5).
- **Last auf fremden Websites.** Abhilfe: 20 Abrufe je Anbieter, 1/s je Host, robots.txt, wöchentlich, Ruhe nach Prüfung.
- **G2 lockerer.** Abhilfe: nur Anhängen am Ende von `programme`, nur `use: termine` ohne weitere Felder, Diff-Prüfung gegen die eigenen Anhänge, ein Commit je Anbieter.
