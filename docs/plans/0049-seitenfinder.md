# Plan 0049 – Seitenfinder: Programmseiten finden, zuerst für bekannte Anbieter

Status: in Umsetzung (S0 gemessen, S1 Teil 1 auf main; Nachtrag 1 durch Nachtrag 2 ersetzt; Nachtrag 2 A live, B gebaut auf plan-0050, nächstes: B prüfen und live, dann C)
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`), Punkt 4 (ein Seitenfinder), Punkt 1 (ein Abruf), Punkt 5 (Issue je Lauf neben dem Wächter). Dieser Plan baut das Modul und die **Pflege bekannter Anbieter**. Den Modus `alle` für das Entdecken legt er fest (E1), gebaut wird er mit Plan 0050 (`docs/plans/0050-entdecken-schlank.md`), S3.
- Plan 0048 (`docs/plans/0048-nachtlauf-seite-als-einheit.md`): Einheit Seite (E1), Ertragsbeweis je Einheit, Fehlerklasse `dauerhaft` mit `klasseSince`, Abruf mit User-Agent und robots.txt (E8), Wächter (E10).
- Plan 0045 (`docs/plans/archiv/0045-entdecken-vollstaendig.md`), E5.1 (Website-Erkundung) und S3b (neue Programmseiten bekannter Anbieter): Ideen übernommen; aus „nur Vorschlag im Issue“ wird automatisches Anhängen.
- Plan 0032, E7 (Gates G1–G4); ADR 0026, Punkt 5 (G2); ADR 0022 (IDs); Skill `babyevents-nuernberg`, `references/booking-systems.md`.

## Voraussetzungen

- **Plan 0048:** Einheit Seite und Wächter sind live. Der Code des gemeinsamen Abrufs (S3, `setAbruf`, robots.txt) liegt auf `main`; im Nachtlauf ist er bis N1 mit Standard `alt` aus. Der Seitenfinder hängt davon nicht ab (Review 4, M3):
  - `pflege` und das S0-Skript setzen fest `setAbruf("neu")` und lehnen `--abruf alt` ab (Test). Eine Erkundung fremder Websites ohne robots.txt verstieße gegen ADR 0033, Punkt 1.
  - S0 bis S2 brauchen nur den S3-Code auf `main`. Der Live-Gang (S3 dieses Plans) braucht zusätzlich N1 von Plan 0048 und den Standard `neu` im Nachtlauf, damit Erkundung und Nacht dieselben Seiten sehen.
- Basis `main` wie Plan 0048.
- **Für `vrr`** zusätzlich der Plan „`site.json` je Gebiet teilen“ (Nummer 0044 reserviert, Plan 0042, N6). Bis dahin läuft die Pflege nur für `vgn`; `--netz` gibt es auf `main` nicht, `vgn` meint dort alle `REGION_IDS` (wie Plan 0050).

## Anlass

Der Nutzer will, dass neue Angebote bekannter Anbieter zuverlässig auftauchen (2026-10-25). Der Nachtlauf liest nur Seiten, die im Katalog stehen. Neue Programmseiten findet bisher nur ein Mensch:
- ein neuer Kursbereich;
- ein neuer Stundenplan nach einem Relaunch (`die-familienbox`: `/erwachsenenkurse/stundenplan-1/` lieferte vom 2026-10-22 an HTTP 404, die neue Seite `/erwachsenenkurse/stundenplan/` war auf der Startseite verlinkt; von Hand korrigiert in `84a2bad`);
- Detailseiten statt Übersicht (`sharky-duesseldorf`);
- ein eingebettetes Buchungs-Widget.

Plan 0045, S3b wollte solche Seiten nur vorschlagen. Ein Vorschlag, den ein Mensch umsetzen muss, ist nicht zuverlässig. ADR 0033, Punkt 4 erlaubt deshalb das Anhängen mit Ertragsbeweis.

## Ausgangslage

- **Bewerten beim Entdecken:** Es sieht die Fund-Seite und höchstens zwei Kontaktseiten (`CONTACT_PATTERNS`, `MAX_CONTACT_PAGES`, `contactLinks` in `scripts/pipeline/lib/discover.ts`). Programmseiten müssen aus der Fund-Seite oder ihren Links stammen (`allowedUrlsOf`).
- **Dieselbe Website:** `sameSite` (`scripts/pipeline/lib/discover.ts`) wertet Subdomains als dieselbe Website, `jimdofree.com`-Nachbarn nicht.
- **Was `extractPage` liefert** (`scripts/pipeline/lib/html-extract.ts`):
  - iCal- und RSS-Links (`feeds`), JSON-LD-Events (`jsonLd`), Links mit Text;
  - `jsRendered` für Seiten mit wenig Text und vielen Skripten.

  Links liest es nur aus `href`, `data-href`, `data-url` und `onclick`, **nicht** aus `iframe[src]`. Eingebettete Buchungs-Widgets sind so unsichtbar. Das Entdecken nutzt dieselben Links. `extractPage` entfernt `header`, `footer` und `nav` (`lib/html-extract.ts`).
- **`follow` und `partChars`** gibt es im Schema auf `main` nicht (`Programme` in `src/domain/schema.ts`); sie kommen erst mit Plan 0042 (Review 4, M4). Wo dieser Plan sie nennt, gilt das erst danach.
- **Rohdaten:** Alle Rohdateien sind V2 (2026-10-30: 82 von 82).
- **G2** (`scripts/pipeline/lib/catalog-diff.ts`): Der Katalog darf nur um neue Einträge am Ende wachsen. Angehängt wird mit `appendEntries` (`scripts/pipeline/lib/catalog-yaml.ts`). `catalogDiff` nutzen auch das Entdecken und `dryRunCatalogIssues`.
- **Zustand** `data/discover/<region>.json` (`DiscoverState`, `scripts/pipeline/lib/discover-state.ts`): `abgelehnt` und `zurueckgestellt`. Eine `id` in `abgelehnt` gilt als zurückgenommener Anbieter: Steht sie im Katalog, meldet `reservedConflicts` einen Fehler, und `data:validate` wird rot.
- **Orte:** Laut `scripts/pipeline/prompt/extract.md` nimmt das Modell bei einem unbekannten Treffpunkt den Hauptort des Anbieters. Orte außerhalb der Region schließt ein `hint` an den Terminseiten aus („Termine an … weglassen“).
- **Geteilte Websites im Katalog** (Programm-URLs je Host, 2026-10-26):
  - `nuernberg.de` hat 47 URLs verschiedener Anbieter, `evangelische-termine.de` 38 (Sammelkalender mit Adapter), `evdus.de` 5.
  - Dazu kommen Buchungsplattformen: `eversports.de` 7, `ghd.hebamio.de` 7, sowie `kursorganizer.com`, `miya360.de`, `bsport.io`, `gomus.de`.
- **Größe:** `programme` geht nicht in `site.json` oder `anbieter.json` (`src/domain/site-data.ts`). Eine angehängte Seite vergrößert die Website erst, wenn ihre Angebote in `data/offers.json` stehen, also nach dem nächsten Nachtlauf. Der Nachtlauf prüft `pnpm size` nicht; das tut erst die CI auf `main`.
- **Ertragsbeweis** (`proveYield` in `scripts/pipeline/lib/discover.ts`): ein Angebot für 0–3 Jahre mit künftigem Termin, dazu Kleinkindbezug im Text (`isRelevant`).
- **Neue IDs sind kein Beleg für Neues:** `assignIds` vergibt im Zweifel eine neue ID. Bei einer Neuextraktion blieben nur 16 von 24 IDs (ADR 0033, Konsequenzen).

## Ziel

1. **Wiederfinden.**
   - In einer Katalogkopie wird bei 10 zufällig gezogenen Anbietern (gesetzter Seed) je eine Programmseite entfernt.
   - Gezogen wird unter Anbietern mit mindestens zwei Seiten, ohne Orts-`hint` (E5), und nur unter Seiten, die **erreichbar** und **nicht abgedeckt** sind:
     - erreichbar heißt: auf der eigenen Website oder von ihr direkt verlinkt bzw. eingebettet; nicht `follow`, kein Sammelkalender mit Adapter;
     - nicht abgedeckt heißt: Die übrigen Seiten liefern ihre Angebote nicht schon (Kriterium aus E2).
   - Der Pflegelauf im Trockenlauf hängt bei mindestens 8 davon die entfernte Seite oder eine mit denselben Angeboten wieder an.
   - Gemessen mit `--katalog <kopie>` (E6).
2. **Nur echte Programmseiten.**
   - Jede angehängte Seite liefert im Ertragsbeweis mindestens ein Angebot, das der Anbieter nicht schon hat (E2).
   - **Vor dem Live-Gang:** In zwei Trockenläufen (S1, S2) prüft ein Mensch jede Seite der Liste „würde anhängen“. Mindestens 90 % müssen Programmseiten des Anbieters sein, nicht eines fremden Veranstalters, und keine zweite Fassung einer vorhandenen Seite. Das ist Vorbedingung für N1.
   - Dieselbe Prüfung gilt für die ersten zwei Live-Läufe. Liegt sie unter 90 %, geht `PFLEGE_MODUS` zurück auf `trocken`, und ein Nachtrag klärt die Ursache.
   - Die Urteile stehen in `evals/results.md`.
3. **Ersatz für ausgefallene Seiten.**
   - Für einen Anbieter, dessen Seite seit mindestens zwei Kalendertagen `dauerhaft` scheitert (`klasseSince`, `berlinIsoDate`), findet der nächste Pflegelauf die Ersatzseite, wenn die Website eine hat.
   - Das gilt auch, wenn die Ersatzseite vorher schon als `deckungsgleich` geprüft war.
   - Nachgewiesen mit einem Durchlauf-Test (Relaunch wie bei `die-familienbox`) und im Bericht des ersten Live-Laufs.
4. **Höflich.** Je Anbieter und Lauf höchstens 20 Abrufe in der Erkundung und 5 Ertragsbeweise. robots.txt nach Plan 0048. Höchstens ein Abruf je Sekunde und Host, auch über Anbieter hinweg.

## Nicht-Ziele

- **Seiten entfernen oder ändern** (`hint`, `partChars`, `follow`, `blocked`, `request`): bleibt beim Menschen, den der Wächter (Plan 0048, E10) hinweist.
- **Neue Anbieter:** Plan 0050. Er baut den Modus `alle` (E1).
- **Folgeseiten (`follow`) automatisch setzen:** Der Bericht nennt „Liste blättert“, wenn eine Kandidatenseite einen Folgelink hat (`follow` selbst erst mit Plan 0042).
- **Anbieter mit `coveredBy` oder `skipCrawl`:** nicht im Pflegelauf. Ein Fund für `skipCrawl` wäre ein Hinweis an den Menschen; das kommt später, wenn S0 zeigt, dass es sich lohnt.

## Entscheidungen

### E1 – Modul

- **Auswahl, rein** in `scripts/pipeline/lib/site-crawl.ts` (neu).
- **Startseiten im Pflegelauf:**
  - die `url` des Eintrags und die Wurzel seiner Website, denn `url` ist oft eine Unterseite, und nach einem Relaunch scheitern womöglich alle bekannten Seiten;
  - seine Programmseiten ohne `blocked`, ohne Platzhalter `{von}`/`{bis}` und ohne `request`.

  Seiten mit `blocked` werden nicht abgerufen, legen aber den Bereich fest: Ihre Website gilt als eigene Website. Startseiten zählen zu den 20 Abrufen.
- **Breitensuche** bis Tiefe 2 auf derselben Website, höchstens 20 Abrufe. Browser, PDF und Weiterleitungen zählen mit.
- **Geteilte Websites** (`isShared(host, catalog)`, rein):
  - **Plattformen** stehen in einer festen Liste `SHARED_HOSTS`: `eversports.de`, `hebamio.de`, `kursorganizer.com`, `miya360.de`, `bsport.io`, `gomus.de`, `kikudoo.com`, `fitogram.pro`, `jimdofree.com`, `wixsite.com`;
  - **Dachseiten** werden aus dem Katalog bestimmt: Jede Website (`sameSite`), auf der mindestens zwei Katalog-Anbieter Start- oder Programmseiten haben, etwa `nuernberg.de` oder `evdus.de`.
  - Die eigene Website eines Anbieters auf `jimdofree.com` oder `wixsite.com` (Subdomain) zählt als eigene Website: `sameSite` geht vor der Plattform-Regel.
- **Auf einer geteilten Website** erkundet die Suche nur unterhalb des Pfads einer Startseite, und alle Query-Parameter der Startseite müssen gleich sein (Mandant: `venueId`, `w`, `vid` usw.).
- **Von der eigenen Website** verlinkte oder per `iframe[src]` eingebettete Seiten auf einer Plattform werden abgerufen (ein Sprung), aber nicht weiter erkundet. `iframe[src]` liest `site-crawl.ts` selbst; `extractPage` bleibt unverändert, weil `follow` und das Entdecken seine Links nutzen.
- **Nie Kandidat:**
  - Seiten der Sammelkalender mit Adapter, denn deren Termine kommen über den Adapter. Das sind die Hosts `evangelische-termine.de`, `frankenkids.de` und `vk.nuernberg.de` sowie die URL-Präfixe der Programmseiten der Katalog-Einträge mit `role: aggregator` (etwa die Seiten des städtischen Veranstaltungskalenders unter `nuernberg.de/internet/…`, `ajax_vk.pl`). **Nicht** der ganze Host `nuernberg.de`: Dort haben viele Anbieter eigene Seiten (Dachseite, siehe oben);
  - URLs, die auf ein `follow.match` des Anbieters enden (erst mit Plan 0042, M4);
  - Seiten, die der Katalog schon nennt (kanonische URL, E2);
  - eine `.ics` mit einem einzelnen Termin, erkannt schon vor dem Abruf am URL-Muster (Termin-ID im Pfad oder in der Query). Der Feed selbst ist Kandidat.
- **Reihenfolge** nach Wörtern in Linktext und Pfad: Kurs, Termin, Programm, Stundenplan, Kalender, Veranstaltung, Baby, Eltern-Kind, Krabbel, Familie, Anmeldung. Bei Gleichstand entscheidet die Tiefe, dann die URL alphabetisch. Nie besucht werden Impressum, Datenschutz, AGB, Warenkorb, Login, Shop, Presse, Jobs und Bilddateien.
- **Signale** (`pageSignals(page, today)`, rein, auf `extractPage`). Eine Seite ist Kandidat bei einem dieser Signale **und** `isRelevant`:
  - `feeds` mit iCal;
  - `jsonLd` mit künftigen Terminen;
  - mindestens 3 künftige Datumsangaben (`TT.MM.` oder `TT.MM.JJJJ`);
  - oder mindestens 2 Angaben „Wochentag plus Uhrzeit“.

  Ein Datum ohne Jahr gilt als das nächste Vorkommen ab `today` (Europe/Berlin). Liegt es mehr als 10 Monate voraus, gilt es als vergangen; Archivseiten zählen so nicht. Ein PDF ist Kandidat, wenn sein Text die Bedingung erfüllt.
- **Art des Kandidaten** aus dem Content-Type: `text/calendar` → `ical`, PDF → `pdf`, sonst `html`. JSON-Antworten sind keine Kandidaten, denn ohne `request` taugen sie kaum.
- **Browser:**
  - einmal bei `jsRendered`;
  - einmal bei HTTP 403 oder Bot-Schutz, wenn der Host in `SHARED_HOSTS` steht oder der Katalog für diesen Host schon `render: browser` nutzt. Eingebettete Buchungs-Widgets (eversports) antworten Skripten sonst mit 403.

  Dann gilt `render: browser` für den Kandidaten. Jeder Browser-Abruf zählt zu den 20.
- Höchstens 5 Kandidaten je Anbieter gehen in den Ertragsbeweis, nach der Zahl künftiger Termine geordnet, bei Gleichstand nach URL.
- **Modus `alle`** (hier nur beschrieben, gebaut und exportiert mit Plan 0050, S3, damit knip keinen ungenutzten Export meldet): dieselbe Erkundung ab einer freien Startliste (Fund-URL, Startseite). Zurück kommen **alle** abgerufenen Seiten mit Text, dazu höchstens zwei Kontakt-, Anfahrts- oder Impressumsseiten nach `CONTACT_PATTERNS`, weil sie die Kursorte nennen. Für diese Seiten gilt die Ausschlussliste nicht.
- **URL-Hilfen:** `sameSite`, `normalizeUrl` und `hostOf` ziehen aus `scripts/pipeline/lib/discover.ts` in ein neues `scripts/pipeline/lib/url.ts`. So entsteht kein Zyklus, wenn Plan 0050 `site-crawl.ts` aus dem Entdecken nutzt.
- **URL-Hilfen, Nutzer:** Außer `io/discover.ts` importieren auch `lib/watch.ts` und `lib/klaerfall.ts` aus `lib/discover.ts`; sie ziehen mit um.
- **Abruf** in `scripts/pipeline/io/site-crawl.ts` (neu) über `io/http.ts` mit `setAbruf("neu")` (User-Agent, robots.txt, Fehlerklasse, Plan 0048, S3). Eine Warteschlange je Host über den ganzen Lauf sorgt für höchstens einen Abruf je Sekunde, auch für die Beilagen des Ertragsbeweises (M5). PDFs gehen über `pdftotext`.
  - **Was zu den 20 zählt:** jeder Seitenabruf samt Browser, PDF und Weiterleitung; nicht die robots.txt und nicht die Wiederholungen von `fetchBytes` bei 5xx (die sind Teil eines Abrufs).
  - Die Erkundung behält je Seite das rohe HTML neben `extractPage` für den Text des Kandidaten im Beweis.

### E2 – Ertragsbeweis, Abdeckung und Ort

- Der Kandidat wird ein Katalog-Programmeintrag `{url, kind, render?, use: termine}` und damit **eine Einheit** nach Plan 0048, E1, mit den Venues des Anbieters und seinen Beilagen.
  - **Kanonische URL:** Ziel nach Weiterleitungen, ohne Fragment und ohne Sitzungsparameter (`sid`, `PHPSESSID`, `utm_*`). Sie gilt für die Kennung im Beweis und für den Anhang im Katalog, sonst passte `seite:<URL>` nicht zum Katalog.
  - Extrahiert wird mit demselben Extraktor **und demselben Modell** wie im Nachtlauf (M2, E5).
  - **Eingabe (M1):** Als `provider` geht der **volle** Katalogeintrag mit dem Kandidaten als letzter Programmseite an `refreshProvider`, damit der Auszug je Einheit dieselbe Seitenliste nennt wie in der nächsten Nacht (`unitExcerpt`, Plan 0048, E3). `fetched.units` enthält nur die Einheit des Kandidaten mit seinen Beilagen; ein kleiner Helfer neben `unitInputs` (`io/fetch-inputs.ts`) baut sie, denn `unitInputs` selbst verlangt einen Abruf je Katalogseite.
  - **Text (M5):** Der Kandidat wird nicht neu abgerufen; sein Text kommt aus der Erkundung (`programmeText` wie in der Nacht). Die Beilagen holt die Pflege **einmal je Anbieter** über die Warteschlange; mehrere Kandidaten teilen sie.
  - **Zustand (B1):** wie `proveEntry` im Entdecken (`io/discover.ts`): `rawDir` und `outDir` sind dasselbe frische, vorher geleerte Verzeichnis `runs/<datum>/pflege/beweis/<id>/<n>/`; kein `prevOfferCount`, kein `mayRetry`; nur das Ergebnis `extrahiert` zählt. Sonst läse `refreshProvider` aus `data/raw`, hielte die übrigen Einheiten für verwaist, ihre Angebote würden Baseline, und der Kandidat käme als `einbruch` zurück. Nichts wird nach `data/raw` geschrieben.
- **Vergleichsstand:** die Events aller Einheiten des **wirksamen Katalogs** (`data/providers.yaml` bzw. `--katalog`) aus `data/raw`, **einschließlich `kandidaten`**. Ausgenommen sind nur Einheiten mit `klasse: dauerhaft` **seit mindestens zwei Kalendertagen** (`klasseSince`, wie Ziel 3 und Gruppe 1; sonst entstünde nach einer kurzen 404 eine zweite Fassung).
  - Die Ersatzseite einer fehlenden Seite gilt so nicht als abgedeckt (Ziel 3).
  - Eine Seite, die nur vorübergehend scheitert, bleibt im Vergleich.
  - Termine aus Sammelkalendern gelten nicht als neu.
- **Simulierter Nachtlauf (M6):** `batchesFromRaw` (`lib/build-offers.ts`, mit `matchUnits` und `mergeParts` wie in der Nacht) über den Vergleichsstand plus die Einheit des Kandidaten, mit `previous: data/offers.json`, dann `buildOffers`. Angebote des Kandidaten sind die aus seinem Batch `<id>#<nn>` mit dem Index des Anhangs.
- **Abgedeckt** (`covered(offer, existing)`, rein, bewusst lockerer als die Zuordnung der IDs) ist ein Angebot des Kandidaten, wenn es ein Angebot des Vergleichsstands gibt mit gleichem Anbieter, ähnlichem Kerntitel (`sameCoreTitle` oder `similarTitle`) und einem dieser Merkmale:
  - gleicher erster künftiger Beginn;
  - mindestens 50 % gleiche Beginnzeiten;
  - gleicher Wochentag und gleiche Uhrzeit.

  **Neu** ist ein Angebot, das nicht abgedeckt ist, einen künftigen Termin hat und `age.minMonths` ≤ 36 erfüllt. Teaser mit dem nächsten Termin, Druckansichten mit umformulierten Titeln und Detailseiten eines Kurses der Übersicht sind damit abgedeckt.
- **Fremder Anbieter:** `covered` prüft zusätzlich die Angebote **anderer** Katalog-Anbieter mit einem Ort in höchstens 100 m Entfernung. Ein Beispiel: Die FamilienBox beherbergt Kurse der Hebamme Anne Schulz, die als `hebanne-schulz` erfasst ist. Ist ein neues Angebot dort abgedeckt, lautet das Ergebnis `fremder-anbieter`, und es steht nur im Bericht. Sonst stünde dasselbe Angebot unter zwei Anbietern.
- **Ort:** keine Prüfung im Text (Nachtrag 2). Ob das Modell fremde Orte falsch verortet, misst die Eval-Falle `fremder-ort` (Nachtrag 2, C).
- **Ergebnis:**
  - `anhaengen`, wenn es mindestens ein neues Angebot gibt und `isRelevant` greift;
  - `deckungsgleich`, wenn alle Angebote abgedeckt sind;
  - `fremder-anbieter`;
  - `ohne-ertrag`, wenn es kein gültiges Angebot gibt;
  - `abgeschnitten`: Die Eingabe der Einheit überschreitet `MAX_INPUT_CHARS` oder wird von `splitInput` geteilt, mit Hinweis im Bericht (`partChars` erst mit Plan 0042, M4);
  - `budget` (E3);
  - `fehler` bei Abruf oder Modell.

### E3 – Anhängen, G2 und Budget

- `appendProgramme(text, id, pages)` in `scripts/pipeline/lib/catalog-yaml.ts` hängt Einträge an das `programme` des Eintrags an und erhält Kommentare und Formatierung.
- **G2:** `catalogDiff(before, after, { allowProgrammeAppend })`. Ohne die Option gilt G2 wie heute; das Entdecken und `dryRunCatalogIssues` rufen sie so auf. Nur der Pflegelauf setzt sie. Dann darf sich ein bestehender Eintrag mit `role: anbieter` ohne `coveredBy` und ohne `skipCrawl` nur so ändern, dass am **Ende** von `programme` neue Einträge stehen. Diese haben **genau** die Schlüssel `url`, `kind`, `use: termine` und optional `render`. `catalogDiff` liefert dazu `appended: {id, urls}[]`, und der Lauf prüft, dass das genau seine Anhänge sind.
- **G1:** wie beim Entdecken über `discoverGates()` (`data:validate` und `check:fast`), je Commit. **G3:** höchstens 3 Seiten je Anbieter und 20 je Lauf. **G4:** ein Commit je Anbieter, Betreff `data: Programmseite für <id> (<n>)`. Im Text je Seite URL, Art und neue Angebote mit erstem Termin; ersetzt sie eine Seite mit `dauerhaft`, zusätzlich „Ersatz für <URL>“ und deren `hint`, damit ein Mensch ihn übernehmen kann.
- **Kein Schreiben nach `data/raw`:** Die nächste Nacht extrahiert die neue Einheit (Plan 0048, E5, „neue Einheit“). Der Commit enthält nur `data/providers.yaml`.
- **Budget vor der Übergabe:** neuer Befehl `pnpm pipeline katalog-budget --lauf <laufverzeichnis>` (`scripts/pipeline/io/katalog-budget.ts`) mit austauschbarem Runner. Build und Größenprüfung lesen fest `data/` (`runBuildOnly`, `pnpm build`). Deshalb misst der Befehl in eigenen Worktrees und lässt `data/` des Arbeitsbaums unberührt:
  1. **Stand vor dem Lauf:** `git worktree add` auf `GITHUB_SHA`, `node_modules` verlinkt, dann `pnpm data:build`, `vite build` und `pnpm size`. Die Kachelbilder entfallen, sie zählen in keinem Budget. Ist das schon rot, wird nichts angehängt; der Bericht sagt „Budget vor dem Lauf rot“.
  2. **Stand mit den Anhängen:** ein Worktree auf HEAD des Laufs. Dort wird `data/raw` um die Einheiten aus den Ertragsbeweisen der angehängten Seiten ergänzt (aus `runs/<datum>/pflege/beweis/`), sodass der Build die Angebote der nächsten Nacht enthält.
  3. Dann `pnpm pipeline nightly --build-only`, `pnpm data:build`, `vite build` und `pnpm size`. Ein Build-Fehler ohne Größenbezug (etwa ein Transit-Gate) ist `fehler`, nicht `budget`.
  4. Ist das rot, **verwirft** der Lauf die Anhang-Commits: Er setzt den Branch auf den Stand vor dem Lauf zurück, schreibt die verworfenen URLs nach `<laufverzeichnis>/budget-verworfen.json` (lauf-neutral; die Pflege setzt daraus `budget` in `seiten`, Plan 0050 seine Klärfälle) und legt nur den Zustands-Commit neu an. Revert-Commits verdoppelten die Zahl der Commits im Bundle (Grenze `MAX_COMMITS: 100` in `discover.yml`). Die Seiten fehlen im Issue und bekommen das Ergebnis `budget` mit 8 Wochen Ruhe. Der Job endet grün mit Ausgabe `budget=rot`, `ampel` liest sie und wird rot.

  Plan 0050 nutzt denselben Befehl.

### E4 – Zustand

`DiscoverState` (heute schon mit `abgelehnt`, `zurueckgestellt`, `orte`, `klaerfaelle`) bekommt neue Felder, je mit `.default([])` für bestehende Dateien:
- **`seiten`:** je geprüfter Kandidaten-URL `{url, anbieter, geprueft, ergebnis, grund?, stand}`. `stand` ist ein Hash über die sortierten Kennungen der Einheiten des Anbieters und die Kennungen mit `klasse: dauerhaft`, denn nur das ändert den Vergleichsstand. Ein schwankender Bot-Schutz hebt die Ruhezeit so nicht jede Woche auf.
  - **Ruhezeit:** Ein Kandidat mit `deckungsgleich`, `ohne-ertrag`, `abgeschnitten`, `fremder-anbieter` oder `budget` kommt frühestens nach 8 Wochen wieder in den Ertragsbeweis, mit `fehler` im nächsten Lauf.
  - Die Ruhezeit **entfällt**, sobald sich `stand` ändert (etwa wenn eine Seite des Anbieters `dauerhaft` scheitert) oder der Anbieter in Gruppe 1 der Reihenfolge steht (E5). So kommt der Ersatz nach einem Relaunch rechtzeitig (Ziel 3).
  - Einträge, deren Ruhezeit abgelaufen ist und die der Lauf bei einem gepflegten Anbieter nicht mehr sieht, entfallen.
- **`gepflegt`:** je Anbieter `{anbieter, datum}` des letzten Pflegelaufs, auch ohne Kandidaten. Danach richtet sich die Reihenfolge (E5); kein Anbieter verhungert.

Dazu:
- **Ablehnen** wie bei Anbietern (Skill, Abschnitt 2): Revert des Commits, dann in `abgelehnt` ein Eintrag mit `url` der Seite, **`anbieter`** (neues optionales Feld, die Katalog-ID) und Grund. Nicht `id`: Das hieße „Anbieter zurückgenommen“ (`reservedConflicts`). Eine abgelehnte URL wird nie wieder angehängt; `abgelehnt` gilt dafür über die Dateien aller Regionen. Gewollt: Dieselbe URL sperrt auch im Entdecken einen Fund (`prefilter`). Der Skill beschreibt den Ablauf samt `pnpm pipeline nightly --build-only`, wenn der Revert nach einem Nachtlauf kommt.
- **Ort des Zustands:** Live liegt er in der Datei der Region des Anbieters und wird mit `commitRunState` committet, zusammen mit `data/kosten.csv`. Im Trockenlauf liegt er nur unter `runs/<datum>/pflege/`, nie in `data/discover/`. `--katalog` ignoriert die Ruhezeiten.

### E5 – Pflegelauf

- `pnpm pipeline pflege [--region <id> | --netz <netz>] [--only <id,…>] [--dry-run] [--katalog <datei>]`. `--katalog` ist nur mit `--dry-run` erlaubt.
- **Teilnehmer:** alle Anbieter mit `role: anbieter` außer `coveredBy` und `skipCrawl`.
- **Nur im Bericht:**
  - Anbieter mit einem Orts-`hint` an einer `termine`-Seite (Muster „weglassen“, „Nur Termine an“). Eine neue Seite hätte den Hinweis nicht, und ihre Termine landeten am ersten Ort.
- **Reihenfolge:**
  1. Anbieter mit einer Einheit `dauerhaft` seit mindestens zwei Kalendertagen (`klasseSince`, `berlinIsoDate`);
  2. dann nach `gepflegt.datum`, älteste zuerst, nie gepflegt ganz vorn;
  3. bei Gleichstand nach ID.
- **Grenzen:**
  - Zeitbudget `PFLEGE_BUDGET_MIN` 120;
  - `PFLEGE_BRAKES` in `scripts/pipeline/lib/cost.ts`, zu Beginn 300 Aufrufe und 30 Mio. Tokens;
  - `RunKind` bekommt den Wert `pflege` (`kosten.jsonl`, `data/kosten.csv`).

  S3 setzt die Grenzen auf das Doppelte des größten gemessenen **vollständigen** Laufs, nicht eines abgeschnittenen (ADR 0033, Punkt 7).
- **Modell (M2):** Für `lauf=pflege` setzt der Workflow `LLM_MODEL_EXTRACT`, `LLM_MODEL_FALLBACK` und `LLM_EFFORT_EXTRACT` wie `nightly.yml` (heute Haiku, `high`), nicht wie das Entdecken (Opus). Der Workflow-Test prüft die Gleichheit. Sonst würden Ziel 2 und `covered` an anderen Ausgaben gemessen, als live entstehen.
- **Workflow:** `.github/workflows/discover.yml` wird der Workflow für Katalog-Läufe.
  - `discover.yml` hat heute keinen `schedule`. Neu: `on.schedule` mit einem wöchentlichen Cron je Netz für `pflege`: Mittwoch `vgn`, Donnerstag `vrr`, je 04:30 UTC. Der `vrr`-Cron kommt erst mit dem Plan „`site.json` je Gebiet“. Der Zweig für den Zeitplan im Job `modus` liest `PFLEGE_MODUS`; die Sperre für Eval-Starts (Plan 0050) bekommt das Pflegefenster Mittwoch 04:30 plus 210 Minuten.
  - Der Job `modus` gibt zusätzlich `lauf` (`entdecken` oder `pflege`, aus dem Cron bzw. der neuen Eingabe `lauf`) und `timeout` aus.
  - `timeout-minutes` des Modell-Jobs ist `fromJSON(needs.modus.outputs.timeout)`, das Zeitbudget des Laufs plus 90 Minuten. Das deckt die Einrichtung (Chromium bis 9 Min.), den letzten Anbieter, die G1-Läufe und den Budgetschritt; der hat zusätzlich ein eigenes `timeout-minutes` von 30.
  - `PFLEGE_MODUS` (`trocken` Standard, `live`) gilt nur für `pflege`; für `entdecken` gilt `ENTDECKEN_MODUS`, das Plan 0050 durch `ENTDECKEN_NETZE` ersetzt.
  - Die Jobstruktur bleibt: Modell nur im Job ohne Schreibrecht, Push nur in `veroeffentlichen`.
  - Der Test `scripts/lib/discover-workflow.test.ts` (gibt es seit Plan 0050, S2) prüft zusätzlich:
    - Cron → `lauf`;
    - `timeout` = Budget + 90 und das Zeitlimit des Budgetschritts;
    - `PFLEGE_MODUS` nur für `pflege`;
    - Rechte je Job;
    - der Budgetschritt vor der Übergabe, `ampel` liest `budget`.
- **Issue je Lauf** mit Änderungen: Titel „Pflege <datum>: n Seiten angehängt“, nur wenn etwas angehängt wurde. Inhalt je Commit: Anbieter, Seite, neue Angebote, Hinweis auf Revert und `abgelehnt`. Erzeugt aus den Commit-Texten wie `newProvidersIssue` (`scripts/pipeline/lib/discover.ts`) mit eigenem Betreff-Muster; fremder Text einzeilig, gekürzt, `@` entschärft.
- **Bericht** (`runs/<datum>/pflege/report.md`, Job-Summary):
  - je Anbieter abgerufene Seiten, Kandidaten und Ergebnis je Kandidat;
  - Hinweise wie „Liste blättert“, „`partChars` prüfen“, „nur berichtet“;
  - Summen und Kosten.

### E6 – Messen

- `--katalog <datei>` ersetzt `data/providers.yaml` im Lauf, nur mit `--dry-run`; damit misst S1 Ziel 1 an einer Katalogkopie.
- Neuer Abschnitt „Seitenfinder“ in `evals/results.md`: Datum, Modell, Modus (trocken/live), wiedergefunden von 10, „würde anhängen“ bzw. angehängt, davon von Hand bestätigt, Abrufe, Dauer.

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/url.ts` (neu) | `sameSite`, `normalizeUrl`, `hostOf` aus `lib/discover.ts`, kanonische URL; Importe in `io/discover.ts`, `lib/watch.ts`, `lib/klaerfall.ts` | S1 |
| `scripts/pipeline/lib/site-crawl.ts` (neu) | Auswahl, `isShared`, `SHARED_HOSTS`, `iframe`, Ausschlüsse, `pageSignals`, Kontaktseiten | S1 |
| `scripts/pipeline/io/site-crawl.ts` (neu) | Abruf über den gemeinsamen Abruf, Warteschlange je Host, Browser bei `jsRendered` | S1 |
| `scripts/pipeline/lib/pflege.ts`, `scripts/pipeline/io/pflege.ts` (neu) | Ertragsbeweis mit Sicht nur auf Kandidat und Beilagen, simulierter Nachtlauf, `covered` samt fremdem Anbieter, Ergebnis, Reihenfolge, Bericht | S1 |
| `scripts/pipeline/io/katalog-budget.ts` (neu) | Messung in eigenen Worktrees, Verwerfen bei Rot | S2 |
| `scripts/pipeline/lib/discover-state.ts` | `seiten` mit `stand`, `gepflegt`, `abgelehnt.anbieter` | S1 |
| `scripts/pipeline/lib/cost.ts` | `PFLEGE_BRAKES`, `RunKind` `pflege` | S1, S3 |
| `scripts/pipeline/lib/catalog-yaml.ts` | `appendProgramme` | S2 |
| `scripts/pipeline/lib/catalog-diff.ts` | Option `allowProgrammeAppend`, `appended` | S2 |
| `scripts/pipeline/io/discover-git.ts`, `scripts/pipeline/lib/discover.ts`, `discover-publish` in `scripts/pipeline/cli.ts` | Commit je Anbieter, Verwerfen bei Budget, Issue „Pflege“ | S2 |
| `scripts/pipeline/cli.ts` | `pflege`, `katalog-budget` | S1, S2 |
| `.github/workflows/discover.yml`, `scripts/lib/discover-workflow.test.ts` | Cron, `lauf`, `timeout`, `PFLEGE_MODUS`, Budgetschritt | S2 |
| `evals/results.md` | Abschnitt „Seitenfinder“ | S1–S3 |
| Skill (Abschnitte 1 und 2: Pflege-Issue, Seite ablehnen, Revert nach dem Nachtlauf), `docs/architecture.md`, `CLAUDE.md` („Daten“: `pflege` hängt Programmseiten an) | Doku | S2, S3 |
| `scripts/pipeline/lib/judge.ts`, `scripts/pipeline/io/judge.ts`, `scripts/pipeline/prompt/judge.md` (neu) | Richter des ID-Gates | Nachtrag 2, B |
| `scripts/pipeline/lib/id-gate.ts`, `scripts/pipeline/io/id-gate.ts` (neu) | Gate: gated Einheiten, Stand (b), Verluste, Nachprüfung, Halten | Nachtrag 2, B |
| `scripts/pipeline/lib/raw.ts`, `lib/refresh.ts`, `lib/normalize.ts`, `lib/extract.ts`, `lib/build-offers.ts`, `lib/stable-ids.ts`, `lib/watch.ts`, `lib/cost.ts`, `io/refresh.ts`, `io/nightly.ts`, `cli.ts`, `.github/workflows/nightly.yml` | `partsHash`, `INPUT_EPOCH`, `held`, `keepIds`, `mergeUnitStates`, zwei Builds, Grenzen des Richters, Wächter `ids` | Nachtrag 2, B |
| `data/id-hinnehmen.yaml` (neu), `scripts/validate-data.ts`, `CLAUDE.md` | Hinnehmen von Hand | Nachtrag 2, B |
| `scripts/pipeline/id-continuity.test.ts`, `scripts/pipeline/freeze-id-continuity.ts`, `scripts/pipeline/fixtures/` (neu) | ID-Kontinuität des Build-Codes, Pin-Test `INPUT_EPOCH` | Nachtrag 2, B |
| ADR 0041 „ID-Gate“ (neu, `docs/adr/`), `docs/architecture.md` | ADR und Invariante | Nachtrag 2, B |
| `scripts/pipeline/lib/eval-score.ts`, `evals/cases/` | Falle `fremder-ort`, `excluded` | Nachtrag 2, C |

## Tests (test-first)

- `lib/site-crawl.test.ts`:
  - Breitensuche, Tiefe 2, höchstens 20 Abrufe samt Startseiten;
  - `sameSite` mit Subdomain;
  - eigene Website auf `jimdofree.com` vor der Plattform-Regel;
  - Dachseite aus dem Katalog erkannt (zwei Anbieter auf einem Host);
  - Plattform-Link und `iframe` ein Sprung, nicht weiter;
  - Profil auf geteiltem Host nur unterhalb des Pfads und mit gleichen Query-Parametern;
  - Sammelkalender nie Kandidat (`evangelische-termine.de`, `ajax_vk.pl`, VK-Widgets), eine Anbieterseite auf `nuernberg.de` aber schon;
  - Einzeltermin-`.ics` (am URL-Muster, ohne Abruf) nie Kandidat; `follow`-URL erst mit Plan 0042;
  - `pflege` mit `--abruf alt` → Fehler; ohne Angabe gilt `neu` (M3);
  - Wurzel der Website als Startseite;
  - 403 auf einem `SHARED_HOSTS`-Widget → einmal Browser, zählt zu den 20;
  - Vorlage mit `{von}` und `blocked` nie Startseite;
  - Reihenfolge stabil bei Gleichstand;
  - Ausschlüsse.

  Fixtures: Liste mit Detailseiten (wie Sharky), Relaunch mit neuer Stundenplan-URL (wie FamilienBox), eigene Seite mit eingebettetem Buchungs-Widget.
- `pageSignals`:
  - drei künftige Daten → Kandidat, vergangene zählen nicht;
  - `TT.MM.` ohne Jahr über den Jahreswechsel (`today` 2026-12-20, „03.01.“ gilt als 2027);
  - ein Datum mehr als 10 Monate voraus gilt als vergangen;
  - Wochentag plus Uhrzeit;
  - iCal in `feeds`, JSON-LD;
  - ohne `isRelevant` kein Kandidat;
  - `kind` aus dem Content-Type.
- `io/site-crawl.test.ts` (Fake-Uhr, Fake-Abruf):
  - höchstens 1/s je Host über zwei Anbieter auf demselben Host;
  - eine Beilage bei zwei Kandidaten genau einmal abgerufen, über die Warteschlange (M5);
  - robots.txt-Sperre;
  - Browser, PDF und Weiterleitungen zählen zu den 20.
- `lib/pflege.test.ts`:
  - neues Angebot → `anhaengen`;
  - Teaser mit dem nächsten Termin, Druckansicht mit umformulierten Titeln, Detailseite eines Kurses der Übersicht → je `deckungsgleich`;
  - Termine nur aus der Einheit `kandidaten` → `deckungsgleich`;
  - Ersatzseite einer Einheit mit `dauerhaft` → `anhaengen`;
  - zweite Fassung einer vorübergehend ausgefallenen Seite → `deckungsgleich`;
  - mit `--katalog` ohne die entfernte Seite → `anhaengen`;
  - Angebot eines anderen Anbieters am Ort in ≤ 100 m (wie `hebanne-schulz` bei der FamilienBox) → `fremder-anbieter`;
  - der Beweis ruft nur Kandidat und Beilagen ab, keine anderen Seiten des Anbieters;
  - Kennung im Beweis gleich der URL im Anhang (kanonisch, ohne `utm_*`);
  - leer → `ohne-ertrag`;
  - Reihenfolge: `dauerhaft` vor `gepflegt`, nie gepflegt vorn;
  - drei Läufe mit Budget für je zwei von sechs Anbietern → jeder einmal dran;
  - Orts-`hint` → nur Bericht;
  - **Beweis bei bestehenden Einheiten (B1):** Anbieter mit drei Einheiten in `data/raw`, Kandidat mit neuem Angebot → `anhaengen`, nicht `einbruch`;
  - Auszug im Beweis nennt alle Seiten des Anbieters samt Kandidat (M1);
  - Angebote des Kandidaten aus seinem Batch nach `batchesFromRaw` (M6);
  - `dauerhaft` erst ab zwei Kalendertagen aus dem Vergleichsstand;
  - Ruhezeit hält, entfällt bei geändertem `stand`;
  - abgelaufene Einträge entfallen;
  - abgelehnte URL nie wieder.
- `lib/discover-state.test.ts`:
  - bestehende Dateien ohne die neuen Felder bleiben gültig;
  - `abgelehnt` mit `anbieter` löst keinen `reservedConflicts` aus, mit `id` schon.
- `lib/catalog-yaml.test.ts`: `appendProgramme` erhält Kommentare und Formatierung anderer Einträge.
- `lib/catalog-diff.test.ts`:
  - mit Option erlaubt: Anhang am Ende von `programme`;
  - Fehler mit Option: Änderung, Umsortierung, Entfernen, Anhang mit `hint` oder `request`, Anhang an einen Eintrag mit `coveredBy` oder `skipCrawl`;
  - **ohne Option ist jeder Anhang ein Fehler** (Entdecken);
  - `appended` stimmt.
- `io/pflege.test.ts` (Fake-Abruf, Fake-Extraktor):
  - Lauf über drei Anbieter, ein Anhang, ein Commit mit nur `data/providers.yaml`;
  - Modell des Beweises gleich dem des Nachtlaufs (Umgebung, M2);
  - G1 rot → zurückgenommen, Lauf geht weiter;
  - G3 greift;
  - Trockenlauf committet nicht und schreibt den Zustand nur nach `runs/`;
  - `--katalog` ohne `--dry-run` → Fehler;
  - **Ziel 3 als Durchlauf:** erst `deckungsgleich` (neue Seite schon online), dann 404 der alten Seite seit zwei Tagen → angehängt;
  - Issue-Text mit `@` und Zeilenumbruch aus Webtext → entschärft.
- `io/katalog-budget.test.ts` (austauschbarer Runner):
  - `data/` des Arbeitsbaums bleibt unberührt, gemessen wird in eigenen Worktrees;
  - Build-Fehler ohne Größenbezug → `fehler`, nicht `budget`;
  - eine Fixture, in der erst die Einheiten der angehängten Seite das Budget reißen → Anhang-Commits verworfen, nur der Zustands-Commit bleibt (mit `tempRepo()`), Ergebnis `budget`, Ausgabe `budget=rot`;
  - Stand vor dem Lauf rot → nichts angehängt.
- `scripts/lib/discover-workflow.test.ts`: wie E5.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected`; S1 und S2 mit `/arch-review`.

- **S0 – Messen (Wegwerf-Skript, ohne Modell).**
  - Erkundung nach E1 über alle Katalog-Anbieter.
  - Gemessen werden: Kandidaten je Anbieter, die der Katalog nicht nennt; Abrufe und Dauer; von robots.txt gesperrte Seiten; Anbieter mit Orts-`hint`; erkannte Dachseiten; **Ortsprüfung an allen heutigen `termine`-Seiten** (Soll ≥ 95 % bestanden, E2).
  - 20 Kandidaten prüft ein Mensch, ob es echte Programmseiten sind.
  - Ergebnis in „Umsetzung“; daraus die Schwellen von `pageSignals`, falls nötig ein Nachtrag.
- **S1 – Modul und Pflegelauf im Trockenlauf.** E1 ohne Modus `alle`, E2, E4, E5 ohne Commit, E6.
  - Ziel 1 an der Katalogkopie, zwei Läufe.
  - Ein Trockenlauf für `vgn` lokal über die erste Hälfte der Anbieter (`--only`, nach ID sortiert); jede Seite der Liste „würde anhängen“ wird von Hand geprüft (Ziel 2). Der Trockenlauf schreibt `gepflegt` nicht fort, deshalb teilen S1 und S2 die Anbieter.
- **S2 – Anhängen.** E3 mit `katalog-budget`, Workflow mit `PFLEGE_MODUS=trocken`, ein Trockenlauf für `vgn` in Actions über die zweite Hälfte; die Liste „würde anhängen“ wird von Hand geprüft (Ziel 2).
- **S3 – Live** nach N1: `gh variable set PFLEGE_MODUS --body live`.
  - Die ersten zwei Live-Läufe prüft ein Mensch Seite für Seite (Ziel 2).
  - Danach Grenzen nach ADR 0033, Punkt 7.
  - `vrr` kommt dazu, sobald Plan 0044 live ist.
- **S4 – Abschluss.** Ziele 1–4 im Bericht, Live-Prüfung, Restpunkte nach `docs/ideas.md` (Fund für `skipCrawl`), archivieren.

## Umsetzung

### S0 – Messung (2026-10-30)

Wegwerf-Skript im Job-Verzeichnis auf `lib/site-crawl.ts` und `io/site-crawl.ts` (S1-Code, noch ohne Pflegelauf), lokal, `setAbruf("neu")`, 68 Anbieter (`role: anbieter` ohne `coveredBy`/`skipCrawl`), 6 parallel, 1/s je Host.

- **Abrufe und Dauer:** 1 331 Abrufe in 23 Minuten, höchstens 21 je Anbieter (die letzte Seite kostete mit Browser zwei).
- **Kandidaten**, die der Katalog nicht nennt: 66 bei 33 Anbietern. Darunter viel Rauschen, das erst der Ertragsbeweis filtert:
  - „Baby“ im Titel eines Stücks für Erwachsene („Drill Baby Drill“, Staatstheater) erfüllt `isRelevant`;
  - Gottesdienstlisten, Gemeindebriefe als PDF, Kontaktseiten mit Öffnungszeiten („Wochentag plus Uhrzeit“);
  - Startseiten mit Teasern (`nuernberger-nest.de/`, `fbs-nuernberg.de/`), die `covered` als `deckungsgleich` erkennen soll;
  - Detailseiten einzelner Kurse (gugelrund, nuebad-flipper, institut-zukunftsmusik), die das Ergebnis `deckungsgleich` oder `anhaengen` bekommen.
- **robots.txt:** 29 abgerufene Seiten bei 7 Anbietern gesperrt, meist Buchungssysteme: `buchung.schwimmschule-ohana.de` (auch die API, die der Katalog nutzt), `zoff-harmonie.de` (Detailseiten und das Programm-PDF), `st-martin-nuernberg.de` (Termin-Details), `kinder-salzundpfeffer.reservix.de`, `tsv1846nuernberg.kurabu.com`, `pro.bsport.io`, `canva.com`. Für die Katalogseiten selbst zählt die Messung im Runner (Plan 0048, S3).
- **Orts-`hint`:** gemessen mit dem alten Muster nur `geburtshaus-nuernberger-nest`; das ist falsch (dessen Hint hat keinen Ortsbezug, `musikfuechse` fehlt), neues Muster in Nachtrag 1.
- **Dachseiten:** `nuernberg.de`, `eversports.de`, `wolfpack.yoga`, `evangelische-termine.de`, `mutherstudio.com`, `api.kursorganizer.com`, `familieninfo-fuerth.de`.
- **Ortsprüfung an den heutigen `termine`-Seiten: 107 von 161 (66 %), Soll ≥ 95 % verfehlt.** Gründe der 54 Fehlschläge:
  - Plattform-Widgets und Buchungslisten ohne Adresse (eversports, hebamio, thrivecart);
  - iCal-Feeds von `evangelische-termine.de` (eine Dachseite: verlangt den Anbieternamen, der Feed nennt die Gemeinde anders);
  - Seiten auf `nuernberg.de` ohne den Katalognamen des Anbieters (Dachseite);
  - eigene Seiten, die die Adresse nur auf der Kontaktseite nennen (`studioherzschlag.de`, `mutherstudio.com`, `zentrum-koberger.de`, die FamilienBox).
  - Behoben im Code schon vor der Zählung: Klammerzusätze („(Hinterhaus)“), Zusätze nach Gedankenstrich und Artikel am Ortsnamen.
- **Folge:** Nachtrag 1 (unten) zur Ortsprüfung, vor `lib/pflege.ts`.
- **Von Hand:** 20 Kandidaten (jeder dritte der nach Anbieter sortierten Liste) hat der Nutzer geprüft (2026-10-30): echte Programmseite des Anbieters ja/nein.
  - **ja (11):** Programm Familien (CVJM), Zumbini (FamilienBox), FenKid-Kurse (famalie), Babymassage und Rückbildung (gugelrund), Rückbildung (hebanne-schulz), Musikspielerei (Zukunftsmusik), Programm-PDF der Elternschule (Martha-Maria), Eltern-Kind-Kurse (Musikschule Fürth), Mutter-Vater-Kind-Schwimmen (nuebad-flipper), Kinderseite des Stadtteilhauses Fisch.
  - **nein (5):** zwei Startseiten mit Teasern (CVJM Gostenhof, nuebad-flipper), Gottesdienstliste (Stadtkirche), Downloadseite (St. Martin), „Drill Baby Drill“ (Staatstheater).
  - **unsicher (4):** Gemeindebrief als PDF (Langwasser), Kursprogramm „Gesundheit“ der FBS (viele Kurse für Erwachsene), Kopie einer Rückbildungsseite (happy-bellies), interkulturelle Angebote (Mütterzentrum Fürth).
  - **Folge:** Gottesdienst-, Kontakt- und Anfahrtsseiten werden nie Kandidat (`neverCandidate`, letztes Pfadsegment als ganzes Wort, damit Krabbel- und Familiengottesdienste bleiben); besucht werden sie weiter. **Downloadseiten nicht pauschal** (Nutzer): dort liegen oft die Programmhefte, wie beim Gemeindebrief. Startseiten-Teaser, „Baby“ im Titel und die unsicheren Fälle fängt der Ertragsbeweis (E2: abgedeckt, also `deckungsgleich`, oder kein neues Angebot mit künftigem Termin und `age.minMonths` ≤ 36); die Schwellen von `pageSignals` bleiben.

### S1, Teil 1 – Umsetzung (2026-10-30)

- `lib/url.ts` (URL-Hilfen aus `lib/discover.ts`, Importe in `io/discover.ts`, `lib/watch.ts`, `lib/klaerfall.ts`), `lib/site-crawl.ts` (rein: Bereich, geteilte Websites, Ausschlüsse, Reihenfolge, `pageSignals`, Breitensuche `exploreSite` mit eingespeistem Abruf, `candidatesOf`, `wantsBrowser`, `fullText`, `placeMentioned`), `io/site-crawl.ts` (Warteschlange je Host, `crawlFetcher` nur mit `setAbruf("neu")`, Browser, PDF, iCal).
- `io/http.ts`: `fetchBytes` meldet `redirects`; `decodeBody` für Bytes mit derselben Zeichensatz-Erkennung.
- **Arch-Review (Teil 1):** kein Blocker; sechs Majors behoben: Dachseite auch über Subdomain (ob geteilt, entscheidet der Host des Ziels), „Workshop“ ist kein Shop (Wortgrenzen), ungültige Prozentfolgen brechen nicht ab, Restbudget an den Abruf (Browser entfällt, wenn er die 20 überschritte; Weiterleitungen zählen danach), iCal-Feeds als eigene Kandidaten (künftige `DTSTART`, verlinkte Feeds werden besucht), Tests für PDF, Bot-Schutz und Budget. Minors 1–8 nachgezogen; die kanonische URL (Minor 9) kommt mit `pflege.ts`.
- **Noch nicht:** `lib/pflege.ts`, `io/pflege.ts`, Befehl `pflege`, Zustand (E4). Vorher Nachtrag 1 umsetzen und neu messen.

### Nachtrag 1 (2026-10-30): Ortsprüfung nach S0

**Anlass.** Die Ortsprüfung auf dem Text der Kandidatenseite traf das Soll nicht (S0: 107 von 161). Sie soll verhindern, dass das Modell einem fremden Treffpunkt den Hauptort gibt (`prompt/extract.md`: unbekannter Treffpunkt → Hauptort), E2, Ergebnis `fremder-ort`. Der Lehrbuchfall im Katalog ist `musikfuechse`: Jede Seite nennt Kurse in „N-Kraftshof / F-Poppenreuth“, katalogisiert ist nur Kraftshof. Eine Prüfung „eigener Ort genannt“ lässt diese Seite immer durch. Die Prüfung wird deshalb umgedreht: Sie sucht **fremde** Orte, statt nur den eigenen zu bestätigen.

**Regel** (ersetzt den Punkt „Ort geprüft“ in E2):
1. **Fremder Ort → `fremder-ort`**, gleich ob die Seite auch einen eigenen Ort nennt. Gesucht wird in dem Text, den das Modell bekommt: `programmeText(kind, body, finalUrl)` (`lib/fetch.ts`), also Haupttext von `extractPage` samt JSON-LD bzw. geparstem iCal mit `LOCATION`, ohne Header, Footer, Navigation (dort steht die eigene Adresse und überdeckte alles; Review N1-1, M1; Review N1-2, M2). Ein Ort „passt zum Anbieter“, wenn er zu einem eigenen Ort gehört oder zu einem Ort eines anderen Katalog-Anbieters, der höchstens 100 m von einem eigenen Ort liegt oder dieselbe normalisierte Straße mit Hausnummer hat (geteilte Orte: `hebanne-schulz` in der FamilienBox, `musikfuechse` und `mutherstudio` in der Kraftshofer Hauptstraße 181; N1-2, M4). Als fremder Ort zählt, was nicht passt:
   - eine fünfstellige PLZ mit folgendem Ortsnamen (jede PLZ, nicht nur die der Region; N1-1, M3);
   - eine Straße mit Hausnummer, gefunden von einem eigenen Scanner `streetMentions(text)`: Straßenendung aus `STREET_NAME` (`lib/address.ts`) oder „Str.“, oder „Am/An der/Im …“, jeweils mit Hausnummer an der Wortgrenze; normalisiert über `normalizeAddress`. „Raum 2“, „Gruppe 3“, „Kurs 8“ sind keine Straße; „Str. 5“ ist nicht „Str. 56“ (N1-1, M4; N1-2, M5);
   - ein Name aus der **festen Ortsliste** `PLACE_NAMES` (neu, versioniert in `lib/site-crawl.ts`, mit Quelle und Stichtag im Kommentar): die Gemeinden der Landkreise Fürth, Erlangen-Höchstadt und Nürnberger Land, die Städte Erlangen und Schwabach, die amtlichen Stadtteile bzw. statistischen Bezirke von Nürnberg und Fürth (darunter Poppenreuth). Verglichen an Wortgrenzen, ohne Beugung: „Fürther Straße“ ist nicht „Fürth“, „Erlanger“ nicht „Erlangen“. Die Gemeinde eines eigenen Orts kommt aus `normalizeAddress(address).city`, sein Ortsteil aus `district` (getrennt an „/“ und „bei“) und aus der Ortsliste, wenn die Adresse dort liegt (N1-1, B1; N1-2, B1). `district`-Werte des Katalogs sind **keine** Eingabe: „Süd“, „West“, „Buch“, „Altstadt“, „stadtweit“ sind mehrdeutig (N1-2, M3);
   - Name oder Straße eines Orts **eines anderen** Katalog-Anbieters, wenn der Name außer Gattungswörtern (`Gemeindehaus`, `Gemeindezentrum`, `Gemeindesaal`, `Turnhalle`, `Saal`, `Haus`, `Raum`, `Kirche`, `Pfarrheim`) einen weiteren Bestandteil hat und genau einem Anbieter gehört (N1-1, m3; N1-2, M3).
2. **Eigener Ort, nur positiv:** Steht kein fremder Ort im Text, gilt der Ort als geprüft, wenn eine dieser Seiten den Ort des Anbieters nennt (Name ohne Artikel und Zusätze, oder Straße mit Hausnummer über `streetMentions`; die PLZ allein zählt nicht, N1-1, M4): der ganze Text der Kandidatenseite (`fullText`, mit Footer; bleibt) oder eine von höchstens zwei Kontakt-, Anfahrts- oder Impressumsseiten derselben Website, auf einer Dachseite nur unter der Pfadbindung aus E1 (N1-2, M7). `contactLinks`, `CONTACT_PATTERNS` und `MAX_CONTACT_PAGES` ziehen aus `lib/discover.ts` nach `lib/site-crawl.ts`; `lib/discover.ts` importiert von dort. `exploreSite` reiht diese Seiten nach Tiefe 0 und vor Tiefe 1 ein, trotz `neverVisit`, höchstens zwei, innerhalb der 20 Abrufe (N1-1, M2). Ohne Treffer: `fremder-ort` mit Grund „Ort nicht belegt“.
3. **Geteilte Websites:** Auf einer Dachseite genügt als Nachweis des Mandanten die Pfadbindung aus E1 (Kandidat unter dem Pfad einer Startseite, etwa `/internet/nh_gostenhof/`; m1). Auf einer Plattform bleibt der Anbietername Pflicht, verglichen ohne Rechtsform und Zusätze. Ein Widget, das nur über die eigene Website erreicht wird (ein Sprung), erbt Schritt 2 der eigenen Website, **nicht** den Namen bzw. Mandanten (m2: `nuernberger-nest` verlinkt die hebamio-Seiten anderer Hebammen).
4. **Nur im Bericht** (E5) steht, wer an einer `termine`-Seite einen `hint` mit Ortsbezug hat. Muster (`PLACE_HINT`, je mit Test):
   - `/termine an .+ weglassen/i` und `/nur termine (an|in|im) /i`;
   - `/nur .+ liegen in /i`;
   - `/(kursort|treffpunkt|veranstaltungsort)[^.]*\b(nicht|anderer|außerhalb|nur)\b/i`.

   Das alte Muster traf `musikfuechse` nicht und `nuernberger-nest` fälschlich (dessen Hint „Kurse ohne genannte Termine … weglassen“ hat keinen Ortsbezug). Die S0-Zeile „Orts-`hint`“ wird neu gemessen.

**Messen, zwei Kennzahlen** (M5, M6), mit dem S0-Skript vor dem Bau von `lib/pflege.ts`:
- **Fehlalarme:** ≥ 95 % der heutigen `termine`-Seiten ergeben **nicht** `fremder-ort`. Nenner ohne Seiten, die nie Kandidat sein können (Sammelkalender mit Adapter, etwa die iCal-Feeds von `evangelische-termine.de`; sie bleiben „nie Kandidat“, weil ihre Termine über den Adapter kommen, M6). Jede heutige Seite mit `fremder-ort` prüft ein Mensch: Liegt dort wirklich ein fremder Ort, ist sie kein Fehlalarm, sondern ein Fund für die Katalogpflege.
- **Schutz, bekannte Fälle:** Die drei `musikfuechse`-Seiten auf ihrem **echten, neu abgerufenen** Text (nicht auf einer Fixture) ergeben `fremder-ort` über `foreignPlaces`, nicht nur über den Orts-`hint` (N1-2, B1). Die S0-Messung speichert dazu die `programmeText` je Seite.
- **Schutz, Kreuzprobe** (deterministisch und groß, N1-2, M6): Für jede heutige `termine`-Seite von Anbieter B prüft `foreignPlaces` gegen jeden Anbieter A, dessen Orte alle weiter als 100 m von denen von B liegen (als läge die Seite unter A). Soll: ≥ 95 % ergeben `fremder-ort`.
- **Folgen:** Verfehlt die Fehlalarm-Kennzahl ihr Soll, bleibt `fremder-ort` streng (lieber eine Seite zu wenig anhängen): Die Fehlalarme gehen als „nur Bericht, Ort prüfen“ ins Pflege-Issue, ein Mensch hängt die Seite von Hand an. Verfehlt eine Schutz-Kennzahl ihr Soll, bleibt `pflege` im Trockenlauf (`PFLEGE_MODUS=trocken`), bis ein Nachtrag sie erfüllt.
- **Issue (E5):** Es entsteht auch ohne Anhang, wenn „Ort prüfen“-Fälle vorliegen; Titel „Pflege <datum>: n Seiten angehängt, m Orte prüfen“.

**Code:** `placeMentioned` (S1, Teil 1) entfällt; neu in `lib/site-crawl.ts`: `PLACE_NAMES`, `PLACE_HINT`, `streetMentions(text)`, `foreignPlaces(modelText, provider, catalog)` und `ownPlaceShown(texts, provider)`; `fullText` bleibt für Schritt 2. `contactLinks` samt Konstanten zieht nach `lib/site-crawl.ts`. Prüfung je Schritt: `pnpm verify`; E2E entfällt (nur Pipeline).

**Tests** (`lib/site-crawl.test.ts`):
- Adresse nur auf der Kontaktseite → geprüft;
- fremde Adresse im Haupttext, eigene im Footer → `fremder-ort`;
- „N-Kraftshof / F-Poppenreuth“ mit eigenem Ort Kraftshof → `fremder-ort` (Poppenreuth aus `PLACE_NAMES`);
- fremder Ort nur im JSON-LD (`location.address`) → `fremder-ort`;
- Ort „Gemeindehaus“ eines anderen Anbieters, Bezirk „Buch“ → kein fremder Ort;
- geteilter Ort (`hebanne-schulz` in der FamilienBox, ≤ 100 m) → nicht fremd;
- „Raum 2“, „Kurs 8“ → keine Straße; „Am Plärrer 2“ → Straße;
- „Fürther Straße 10“ in Nürnberg → nicht Gemeinde Fürth;
- Kontaktseite auf einer Dachseite nur unter der Pfadbindung; Kontaktseiten nach Tiefe 0, höchstens zwei, zählen zu den 20;
- „Kulturladen Röthenbach“ eines anderen Anbieters → `fremder-ort`;
- Widget per `iframe` erbt den Ort, nicht den Namen;
- „Str. 5“ gegen „Str. 56“ → nicht derselbe Ort; PLZ allein → nicht geprüft;
- Dachseite unter dem Pfad der Startseite ohne Anbieternamen → Mandant belegt;
- Orts-`hint` „nur Kraftshof-Kurse liegen in Nürnberg“ → nur Bericht; „Kurse ohne genannte Termine weglassen“ → kein Orts-`hint`; Kreuzprobe auf zwei Fixture-Anbietern.

**Risiken:** Ortsnamen in Fließtext („Ausflug nach Erlangen“) ergeben `fremder-ort` (gewollt streng, Fehlalarm ins Issue). `PLACE_NAMES` ist begrenzt: Ein fremder Ort ohne PLZ, Hausnummer und bekannten Namen außerhalb der Liste bleibt unerkannt; Abhilfe sind die Kreuzprobe und die menschliche Prüfung der ersten zwei Live-Läufe (Ziel 2). Die Liste veraltet kaum (Gebietsreform selten).

**Review (2026-10-30) – Verdict: Überarbeiten,** alles übernommen:
- **B1** gemischte Seite (`musikfuechse`) fiel durch: fremder Ort unabhängig vom eigenen, Gemeinde- und Ortsteilnamen, Hint-Muster erweitert.
- **M1** Suche im Haupttext statt im Volltext. **M2** „Website statt Seite“ ersetzt durch gezielte Kontaktseiten im Budget, Impressum erlaubt. **M3** jede PLZ mit Ort. **M4** Adressvergleich über `normalizeAddress`, Hausnummern an Wortgrenzen, PLZ allein zählt nicht. **M5** zweite Kennzahl für den Schutz, menschliche Prüfung neuer `fremder-ort`. **M6** Nenner ohne Sammelkalender, Folge bei verfehltem Soll festgelegt.
- **Minor:** m1 Pfadbindung als Mandant auf Dachseiten; m2 Widget erbt nur den Ort; m3 Orte anderer Anbieter; m4 Tests, Code und Risiken ergänzt; m5 Statuszeile und S0-Zeile korrigiert.

**Review 2 (2026-10-30) – Verdict: Überarbeiten,** alles übernommen:
- **B1** Gemeinde- und Ortsteilliste gab es nicht, Poppenreuth fehlte: feste, versionierte `PLACE_NAMES` mit Quelle; Schutz auf dem echten Text.
- **M2** Text des Modells (`programmeText` mit JSON-LD und iCal) statt `extractPage().text`. **M3** Gattungswörter und mehrdeutige Bezirke: nur Namen mit weiterem Bestandteil, `district` keine Eingabe. **M4** geteilte Orte (≤ 100 m, gleiche Adresse) sind nicht fremd. **M5** eigener Straßen-Scanner. **M6** Kreuzprobe als zweite Schutz-Kennzahl, Folge Trockenlauf. **M7** Kontaktseiten auf Dachseiten nur unter der Pfadbindung.
- **Minor:** `fullText` bleibt; `contactLinks` nach `lib/site-crawl.ts`; Einreihung der Kontaktseiten mit Test; Hint-Muster als Regexe; Issue auch ohne Anhang; Gemeinden an Wortgrenzen; `pnpm verify` je Schritt.

Nach dem Skill war das der letzte erlaubte Review. **Die Änderungen aus Review 2 sind nicht mehr unabhängig geprüft.** Absicherung: Vor `lib/pflege.ts` misst das S0-Skript alle drei Kennzahlen auf echten Seiten; ein verfehltes Schutz-Soll hält den Trockenlauf (siehe „Folgen“).

#### Nachtrag 1 – Umsetzung und Messung (2026-10-30)

**Code.** Abweichend vom Abschnitt „Code“ liegt die Prüfung in eigenen Modulen, weil `lib/site-crawl.ts` sonst über 700 Zeilen hätte: `lib/place-check.ts` (`streetMentions`, `placeContext`, `foreignPlaces`, `ownPlaceShown`, `nameShown`, `placeCheck`, `placeHint`) und `lib/place-names.ts` (`PLACE_NAMES`, 156 Orte in Gruppen von Schreibweisen, Quellen im Kopf). In `lib/site-crawl.ts`: `contactLinks` (aus `lib/discover.ts`), Kontaktseiten nach Tiefe 0 (`CrawlPage.contact`, nie Kandidat), `CrawlPage.from` und `siteKind`; `placeMentioned` entfällt.

**Ortsliste.** Weggelassen nur die Gruppen, die Fehlalarme machen (Allerweltswörter, Bezirke mit Straßennamen, Kirchennamen); gleichnamige Orte außerhalb der Region bleiben, denn sie sind für einen anderen Anbieter ohnehin fremd. Aus „Langwasser Südost“ wird „Langwasser“, sonst wäre ein Anbieter in Langwasser auf „Langwasser Südost“ fremd. Nürnberg und Fürth stehen in der Liste (die Tests „Fürther Straße“ setzen das voraus).

**Messung** (Skript im Job-Verzeichnis, Tiefe 0 plus Kontaktseiten, 165 heutige `termine`-Seiten, davon 10 Sammelkalender). Drei Läufe; nach Lauf 1 und 2 behoben, je mit Test:
- `fullText` klebte Blöcke aneinander („NürnbergKornmarkt 8“): Leerzeichen an Blöcken und `<br>` (19 → 5 „Ort nicht belegt“);
- Kursnummern, Telefonnummern und eine US-Vorlage als PLZ: PLZ nur am Zeilenanfang, nach Komma oder Hausnummer;
- Hausnummernbereich „33-35“, Gebäudenamen vor der Straße („Turnhalle Dunantschule“);
- eigene Straße mit anderer PLZ als im Katalog (FBS: Seite 90443, Katalog 90429, ein Fund für die Pflege);
- fremder Name, der im eigenen steckt („Sulzbacher Straße“ in „Äußere Sulzbacher Straße“, „WunderWerk“);
- Verwaltungsanschriften („Hausanschrift“, „Büro“, „Pfarramt“, „Information und Anmeldung“, „Druck:“) sind kein Treffpunkt;
- fremder Ortsname direkt vor der eigenen Anschrift („CVJM-Haus Gostenhof, Glockendonstr. 10“);
- Stadtteile, deren Punkt (`src/domain/districts.ts`) höchstens 1,2 km vom Ort liegt, sind eigen (Abweichung: der Plan nahm nur `district` und die Adresse);
- Plattform: Wörter des Anbieternamens in beliebiger Reihenfolge („Susanne Mainberger Hebamme“).

**Ergebnis (Lauf 3):**

| Kennzahl | Soll | Ist |
|---|---|---|
| Fehlalarme | ≥ 95 % | 111 von 155 ohne `fremder-ort`; von den 44 übrigen sind 25 echte Funde (siehe unten), also 136 von 155 = **87,7 %, verfehlt** |
| musikfuechse, echte Seiten | 3 × `fremder-ort` über `foreignPlaces` | **3 von 3** (Poppenreuth, Poppenreuther Str. 134, 90765/90762 Fürth) |
| Kreuzprobe, `foreignPlaces` allein | ≥ 95 % | 10 337 von 12 449 = **83 %, verfehlt** |
| Kreuzprobe, `placeCheck` (Ergebnis `fremder-ort`) | – | 12 447 von 12 449 = 100 % |

- **Funde** (echter fremder Ort im Text, 25 Seiten): Kindertheaterreihe in fremden Kulturläden und Jugendhäusern (7), Programm der Stadtbibliothek mit Zweigstellen außerhalb des Katalogs, wolfpack.yoga (Waechterstraße), Ohana-Kurse in Fürth, Bamberg, Wartenberg (3), Standort Waechterstraße im FamilienBox-Widget, ATV-Turnhallen, Familiengottesdienste aller Kirchen, Musikschule an der Grundschule Katzwang, musikfuechse (3), Hallenbäder Spardorf/Langwasser (Bär), Kochgruppe Plauener Straße, Mummpitz im Sternenhaus, Wunderwerk in Obermichelbach, Post-SV-Turnhallen, vhs-Waldausflug Heilstättenstraße. Sie sind Hinweise für die Katalogpflege (fehlende Orte).
- **Fehlalarme** (19): Seitentitel „Nürnberg, Fürth, Erlangen“ (mutherstudio, Zukunftsmusik, Martha-Maria), Einzugsgebiet einer Hebamme, „wohne in Kalchreuth“, Förderer „Amt … Fürth“ (FBS, 2), MVZ-Liste, Kita-Adressen (St. Johannis), Pfarrer-Anschrift (Langwasser, 2), Tippfehler „Mommenstraße“, Verweis auf eine Kollegin (Elena Paulus), „Thoner Espan“, Laufamholz (happy-bellies, Punkt > 1,2 km), Kontaktseiten ohne Adresse (mutherstudio 3, famalie 2).
- **Kreuzprobe:** `foreignPlaces` allein schlägt bei Seiten ohne jede Ortsangabe im Haupttext fehl (zentrum-koberger, hebamio-Listen, FamilienBox-Stundenpläne); dort greift Schritt 2 („Ort nicht belegt“), denn die Kontaktseiten nennen den Ort des richtigen Anbieters, nicht den des fremden. Das Ergebnis `fremder-ort` (E2) entsteht so in 100 % der Fälle.

**Folgen nach „Folgen“ oben:**
- Fehlalarm-Soll verfehlt → `fremder-ort` bleibt streng; Fehlalarme gehen als „Ort prüfen“ ins Pflege-Issue, ein Mensch hängt von Hand an.
- Die Schutz-Kennzahl Kreuzprobe ist nach dem Wortlaut (`foreignPlaces` allein) verfehlt → `pflege` bleibt im Trockenlauf. Das deckt sich mit S2 (erst `PFLEGE_MODUS=trocken`, Liste von Hand prüfen). **Nutzerentscheid vor dem Scharfschalten:** ob die Kreuzprobe über `placeCheck` (100 %) als Schutz genügt.

Der Code von Nachtrag 1 wurde nie committet. Nachtrag 2 ersetzt ihn.

### Nachtrag 2 (2026-10-30): Ort über das Modell statt über Wortlisten, ID-Gate

**Anlass.**
- Nachtrag 1 erkennt fremde Orte mit Regexen und einer Ortsliste. Das ergab 87,7 % statt 95 % ohne Fehlalarm, und jede Messrunde brauchte neue Sonderregeln: Seitentitel, Einzugsgebiete, Förderer, Pfarrer-Anschriften. Der Nutzer stellte den Ansatz infrage. Ein unabhängiges Gutachten (Opus) prüfte Alternativen und ihren Platz in der Pipeline.
- **Befund:** Eine Fehlverortung durch das Modell wurde nie beobachtet. Ein Scan der 431 Live-Angebote am 2026-10-30 fand keine.
  - Die 25 „Funde“ aus Nachtrag 1 zeigen fehlende Orte im Katalog, keine falsch verorteten Angebote.
  - Die Hauptort-Regel (`prompt/extract.md`, Zeile 54) ist teils gewollt: Bei einem fehlenden oder wechselnden Treffpunkt ist der Hauptort richtig.
  - Der Lehrbuchfall `musikfuechse` beruhte auf einer überholten Entscheidung („nur Nürnberg“, 2026-10-11, vor der Region Fürth). Der Ort `musikfuechse-poppenreuth` steht seit `563de13` im Katalog. Ein Trockenlauf hielt alle 10 bisherigen IDs und fand 12 neue Angebote.
- **Folgerung:** Eine Prüfung im Text löst ein Problem, das nicht nachgewiesen ist, und kostet zuverlässig Fehlalarme. Ob das Modell fremde Orte falsch verortet, misst stattdessen eine Eval-Falle mit dem Prompt und dem Modell des Nachtlaufs. Nur wenn sie Fehlverortungen zeigt, ändert sich der Prompt.
- **Harte Regel des Nutzers** (2026-10-30): Keine Verbesserung der Pipeline darf Angebots-IDs kosten, denn Merklisten liegen auf dem Gerät (ADR 0022). Eine neue Extraktion an sich ist egal. Heute hält eine neue Extraktion nur 87–96 % der IDs (Plan 0048, S0). Prompt, Schema, Modell und Katalogauszug sind Teil des Cache-Schlüssels (`ExtractKeyParts` in `lib/extract.ts`, `catalogExcerpt` in `lib/normalize.ts`). Darum löst jede solche Änderung eine neue Extraktion aus, auch das Anhängen einer Seite durch die Pflege: Der Auszug nennt alle Seiten des Anbieters (Risiken, „Ein Anhang extrahiert den ganzen Anbieter neu“).

**Nutzerentscheide (2026-10-30):**
- Haiku bleibt im Nachtlauf.
- Ein Ort darf in einer anderen Region liegen.
- Ein Angebot darf seine ID nur verlieren, wenn es eindeutig fehlerhaft ist, und das prüft ein Opus-Modell.
- Kein neuer Plan, nur dieser Nachtrag.

**Was entfällt** (ersetzt Nachtrag 1 und den Punkt „Ort geprüft“ in E2):
- `lib/place-check.ts`, `lib/place-names.ts` und ihre Tests werden nicht committet.
- Das Ergebnis `fremder-ort` entfällt in E2, E4 (Ruhezeit) und in den Tests von `lib/pflege.test.ts`.
- `PLACE_HINT` und das Issue „m Orte prüfen“ entfallen. Für Anbieter mit Orts-`hint` bleibt E5 „nur im Bericht“, das Muster ist das alte aus E5.
- Die drei Kennzahlen aus Nachtrag 1 entfallen; Ziel 2 (Abnahme je Seite) bleibt der Schutz.

**Schritt A, Stand im Arbeitsbaum** (Review N2, m5). Der Code von Nachtrag 1 war nie committet und ist jetzt bereinigt:
- **Entfernt:**
  - `lib/place-check.ts`, `lib/place-names.ts` und ihre Tests;
  - `fullText` und `siteKind` samt Tests (ohne Nutzer, knip);
  - der Export von `CrawlPage`;
  - der Eintrag „Ortsliste je Region“ in `docs/ideas.md`;
  - `place-check` und `place-names` in `docs/architecture.md`.
- **Bleibt** (mit Tests; Modus `alle`, Plan 0050, S3, braucht die Kontaktseiten):
  - `contactLinks`, `CONTACT_PATTERNS` und `MAX_CONTACT_PAGES` sind von `lib/discover.ts` nach `lib/site-crawl.ts` gezogen;
  - Kontaktseiten werden nach Tiefe 0 abgerufen (`CrawlPage.contact`, nie Kandidat), auf Dachseiten nur unter der Pfadbindung, und ihre Links gehen in Tiefe 2 ein;
  - `CrawlPage.from`.
- `pnpm verify` ist grün.
- Commit `refactor(pipeline): Kontaktseiten im Seitenfinder (Plan 0049, Nachtrag 2, A)`.

**Schritt B – ID-Gate im Nachtlauf.**
- Test-first; `pnpm verify` je Teilschritt; E2E entfällt (nur Pipeline); `/arch-review` (neues Modul `lib/judge.ts`, Schemaänderung in `lib/raw.ts`).
- Code von Plan 0048: `lib/refresh.ts`, `io/refresh.ts`, `io/nightly.ts`, `lib/build-offers.ts`, `lib/stable-ids.ts`, `lib/raw.ts`, `lib/watch.ts`, `lib/cost.ts`.
- **Regel:** Ändert sich die Fassung der Pipeline, verliert keine Angebots-ID mit künftigem Termin. Ausnahmen:
  - ein Opus-Urteil nennt das alte Angebot eindeutig fehlerhaft oder von der Seite entfallen;
  - ein Mensch nimmt den Verlust ausdrücklich hin (B5).
- **Fassung** sind die `KeyParts` von `extractKey` (`lib/normalize.ts`: Katalogauszug, Prompt, Schema, Modell) plus eine Konstante `INPUT_EPOCH` (B1).

0. **ADR** (Review N2, M5; Review N2-2, M7). Neues ADR 0041 „ID-Gate bei neuer Pipeline-Fassung“. Es ergänzt:
   - **ADR 0022, Punkt 3:** `keepIds` als vorgeschaltete, vom Richter belegte Zuordnung; Statuszeile mit Verweis.
   - **ADR 0026, Zeile 44:** Ein Wechsel extrahiert weiter alles neu, übernimmt aber nur nach dem Gate.
   - **ADR 0033, Konsequenzen:** Den hingenommenen ID-Bruch beim Modellwechsel gibt es nicht mehr.
   - **Richter und Ausnahme:** Es führt den Richter (Opus) im Nachtlauf ein und nennt das Hinnehmen als einzige menschliche Ausnahme.

   `docs/architecture.md` bekommt die Invariante und nennt das ADR.

1. **Fassung je Einheit.** `UnitState` (`lib/raw.ts`) bekommt das optionale Feld `partsHash`: den Hash über `KeyParts` und `INPUT_EPOCH` der Eingabe, aus der `events` stammen.
   - **Setzen:** bei jeder Übernahme; bei `unveraendert` nachgetragen, denn bei gleichem Schlüssel sind auch die Teile gleich.
   - **Gated** ist eine Einheit, wenn `prev.inputHash` gesetzt ist und der neue Zustand ein anderes `partsHash` trägt als der Vorstand. Ein fehlendes `prev.partsHash` zählt als anders.
     - Gleich ist, auf welchem Weg der neue Zustand entsteht: extrahiert, `pending-uebernommen` oder Fallback.
     - Eine geänderte Seite hebt das Gate nicht auf.
     - Ein Vorstand `keine-termine` hat keine IDs zu verlieren; das Gate läuft dort ohne Wirkung durch (m9).
   - **`INPUT_EPOCH`** (Review N2-2, M5) steht in `lib/normalize.ts`. Wer den Code ändert, der den Eingabetext erzeugt (`extractPage`, `programmeText`, `normalizeText`, PDF und iCal, `ORDER_FREE_KEY`, Abrufart), erhöht die Konstante. Sonst änderte sich jeder Schlüssel ohne Gate. Ein Pin-Test über eingefrorene Seiten (`scripts/pipeline/fixtures/input-epoch/`: HTML, PDF-Text, iCal → normalisierter Text → Hash) wird rot, bis die Konstante steigt.
   - **Nicht gated** sind neue Einheiten ohne Vorstand (etwa ein Anhang der Pflege) und Waisen, deren Katalog-URL ein Mensch geändert hat (`baseline` in `io/refresh.ts`).
   - **Erste Nacht nach B** (m2): Einheiten mit geändertem Inhalt gehen durch den Richter, denn ihnen fehlt `partsHash`. Das ist gewollt. Die Last deckelt `JUDGE_BRAKES`; der Rest wird mit Grund `grenze` gehalten und in den Folgenächten gerichtet. Der Schattenlauf (B6) misst das vorher.

2. **Ort im Ablauf** (M3, M4). Das Gate gilt nur im Nachtlauf (Option `idGate` an `runNightly`, gesetzt in `cli.ts`), nicht im Entdecken und nicht im Pflege-Beweis.
   - `refreshProvider` gibt den nächsten Zustand je Anbieter zurück, statt ihn zu schreiben (Option `write: false`); ohne Gate schreibt es wie heute.
   - Rein, in `lib/refresh.ts`: `mergeUnitStates(prev, next, keep: Set<unitId>)` liefert `next` mit den Einheiten aus `keep` im Stand von `prev`.
   - Nach allen Anbietern baut `runNightly` im Speicher zweimal über den ganzen Datenstand, mit `batchesFromRaw` und `buildOffers` gegen `previous`:
     - **(a)** alle neuen Zustände;
     - **(b)** `mergeUnitStates(prev, next, gated)`.
   - Beim Trockenlauf ist `prev` der Stand aus `data/raw` und das Ergebnis geht ins Overlay; eine dritte Schicht gibt es nicht.
   - **Verloren** ist eine ID mit künftigem Termin in `previous`, die in (b) vorkommt und in (a) fehlt.
   - **Ursprung** (Review N2-2, M3): die Einheit hinter dem Batch `<id>#<nn>`, aus dem das Angebot in (b) stammt. Zeigt der Ursprung auf eine nicht gated Einheit (möglich über `mergeParts`), ist der Verlust keiner des Gates und erlaubt.
   - Nach dem Urteil folgen die Schreibvorgänge nach `data/raw` und der normale Build.
   - Test: Die IDs aus (a) gleichen denen des normalen Builds desselben Stands.

3. **Richter.** Neu sind `lib/judge.ts` (rein: Eingabe, Antwortschema, Auswertung), `io/judge.ts` (Aufruf über `io/llm.ts`) und `prompt/judge.md`.
   - **Aufrufe:** je gated Einheit mit Verlusten ein Aufruf von `LLM_MODEL_JUDGE` (neu, `opus`, in `nightly.yml`), bei großen Einheiten einer je Teil wie bei `splitInput` (m3). `CallRecord.step` bekommt `"judge"`.
   - **Eingabe:**
     - Eingabetext der Einheit;
     - Katalogauszug (`unitExcerpt`) mit Orten, `hint` und Alter;
     - die verlorenen alten Angebote mit ihren künftigen Beginnen;
     - die neuen Events mit Index; Events, die in (a) schon eine alte ID tragen, sind markiert und kein zulässiges Ziel (Review N2-2, M2).
   - **Antwort** je verlorenem Angebot, genau eines von:
     - `gleich: <index>@<Beginn>`: dasselbe Angebot; der Beginn wählt bei einem `einmalig`-Event den Termin (M1);
     - `fehlerhaft: <grund>`: steht so nicht auf der Seite, obwohl sie unverändert ist, oder widerspricht dem Katalog (Ort, `hint`, Alter);
     - `entfallen: <grund>`: Der Anbieter hat es von der geänderten Seite genommen (m1);
     - `unklar`.
   - **Auswertung je Einheit:**
     - **Kein `unklar`:** Übernahme. Jedes `gleich` schreibt in das neue optionale Feld `keepIds: {<Beginn>: <alte ID>}` am Event (`RawEvent` in `lib/raw.ts`).
     - **`keepIds` steht nicht im Antwortschema** (Review N2-2, B1). `ExtractResponse` (`lib/extract.ts`) nimmt es per `omit` heraus wie `providerId` und `via`, und `applyOutcome` verwirft es, falls das Modell es dennoch liefert. Test: Der Schema-Hash in `lib/extract.test.ts` bleibt `ab413b808c90`. `partsHash` und `held` sind Felder des Zustands und nie Teil der Antwort.
     - **Übergabe an den Build:** `fromRaw` (`lib/build-offers.ts`) reicht `keepIds` an den Entwurf als internes Feld `keepId` weiter; es wird vor dem Schreiben entfernt.
     - **Zusammenlegen:** Legen Schritt 3/4b oder `mergeParts` Events zusammen, gewinnt das erste `keepId` in Batch-Reihenfolge. Zwei verschiedene ergeben eine Notiz, und beide entfallen.
     - **`assignIds`** (`lib/stable-ids.ts`) ordnet **vor Stufe 0** jeden Entwurf mit `keepId` dieser ID zu, wenn sie in `previous` beim selben Anbieter steht und frei ist; sonst Notiz.
       - Der Ort darf sich unterscheiden, denn genau das korrigiert D.
       - Weil `keepIds` in `data/raw` steht, ist `--build-only` deterministisch.
     - **`fehlerhaft` und `entfallen`** fallen weg; Grund und Art stehen getrennt im Bericht.
     - **`unklar` hält nur die eigene Einheit** (Schritt 4); danach wird neu gebaut.
   - **Grenzen** (Review N2-2, M6):
     - `JUDGE_BRAKES` (Aufrufe, Tokens) und `JUDGE_BUDGET_MIN` 20 in `lib/cost.ts`, innerhalb der 40 Minuten Marge des Jobs (`nightly.yml`);
     - `brakeHit` des Nachtlaufs (`io/nightly.ts`) zählt Aufrufe mit `step: "judge"` nicht mit;
     - erreicht, ein Fehler des Modells oder eine überschrittene Zeit: Halten mit Grund `grenze`.

4. **Halten** (Review N2-2, B2).
   - Die Einheit behält `events`, `inputHash`, `model`, `changedAt` und `partsHash` des alten Stands.
   - Neues Feld `held: {inputHash, dated?, model, events, since, reason: "unklar" | "grenze", lost: string[]}` mit dem abgelehnten Ergebnis, wie `Pending`.
   - **Reihenfolge in `planRefresh`:** `unveraendert` → `gehalten` (gleicher Schlüssel wie `held`) → `pending-uebernommen` → Extraktion.
     - Bei `reason: "unklar"` ist `gehalten` endgültig ohne Aufruf.
     - Bei `reason: "grenze"` wird `held.events` ohne Extraktion erneut gerichtet.
   - Ändert sich der Schlüssel erneut, wird neu extrahiert und neu gerichtet; das Gate gilt weiter, denn `partsHash` ist noch das alte.
   - `held` endet mit einer Übernahme oder wenn die Fassung zum alten `partsHash` zurückkehrt.
   - `summarize`, `nightly.json` und der Bericht zählen `gehalten`; das ist kein Fehler.

5. **Wächter und Hinnehmen** (Review N2-2, m6).
   - Neue Art `ids` in `lib/watch.ts` je Anbieter mit `held`: „n IDs: Urteil unklar (bzw. Grenze), Einheit gehalten seit …“.
   - **Hinnehmen** über eine von Hand gepflegte, committete Datei `data/id-hinnehmen.yaml`: Einträge `{anbieter, grund, datum}`, Schema in `lib/raw.ts`, geprüft von `pnpm data:validate`.
     - Der nächste geplante Nachtlauf übernimmt für diese Anbieter `held.events` ohne Richter.
     - Die Verluste stehen mit dem Grund im Bericht und im Commit-Text.
     - Der Eintrag wirkt nur auf `held` mit `since` ≤ `datum`; ein späterer neuer Verlust braucht einen neuen Eintrag.
     - CLAUDE.md, Abschnitt „Daten“, nennt die Datei als von Hand gepflegt.
   - Ein Mensch kann stattdessen die Zuordnung verbessern (`stable-ids.ts`) oder den Katalog korrigieren.

6. **Schattenlauf** vor jeder Umstellung von Prompt, Schema, Modell oder `INPUT_EPOCH` (m8).
   - Lokal: `LLM_MODEL_EXTRACT=<neu> pnpm pipeline nightly --dry-run --max-calls <Zahl der Einheiten + Puffer>`, bei Bedarf in mehreren Läufen mit `--only`, Richter eingeschlossen.
   - Der Bericht zählt je Anbieter: übernommen, geerbt (`keepIds`), fehlerhaft, entfallen, gehalten.
   - Das Ergebnis steht im Commit-Text der Umstellung.
   - Der Skill `babyevents-nuernberg`, Abschnitt „Modell wechseln“, bekommt den Schritt.

7. **Build-Code** (M7; Review N2-2, M8).
   - Neuer Test `scripts/pipeline/id-continuity.test.ts` in `check:fast`: `buildOffers` über eine eingefrorene Kopie von `data/raw` und `data/offers.json`, samt freien Tagen, `today` und `generatedAt`.
   - Die Fixture liegt in `scripts/pipeline/fixtures/id-continuity/`, nicht in `tests/fixtures/`, damit sie keine volle E2E-Auswahl auslöst. Ein Skript `scripts/pipeline/freeze-id-continuity.ts` erzeugt sie.
   - Keine ID mit künftigem Termin darf verloren gehen. Ein gewollter Verlust braucht die neu erzeugte Fixture und eine Begründung im Commit.
   - Die Daten sind echt; `data/` ist ohnehin öffentlich.

**Tests zu B:**
- `lib/refresh.test.ts`:
  - neue Fassung → gated;
  - gehalten, am nächsten Tag ändert sich eine Zeile, Richter `unklar` → weiter gehalten, ID bleibt;
  - `pending` mit neuer Fassung → gated;
  - fehlendes `partsHash` → gated;
  - neue Einheit → nicht gated;
  - `partsHash` bei `unveraendert` nachgetragen;
  - Reihenfolge `unveraendert` → `gehalten` → `pending`;
  - `held.reason: "grenze"` → erneut gerichtet ohne Extraktion;
  - `mergeUnitStates`.
- `lib/normalize.test.ts`: Pin-Test `INPUT_EPOCH`.
- `lib/extract.test.ts`: Schema-Hash unverändert; `keepIds` aus der Antwort verworfen.
- `lib/judge.test.ts`:
  - Antwortschema;
  - `gleich@Beginn`, `fehlerhaft`, `entfallen`, `unklar`;
  - markierte Events sind kein Ziel;
  - Teilung.
- `lib/stable-ids.test.ts`:
  - `keepId` vor Stufe 0;
  - vergebene oder fremde ID → ignoriert mit Notiz;
  - `einmalig` mit `keepIds` je Beginn;
  - Konflikt beim Zusammenlegen.
- `io/nightly.test.ts` (Fake-Extraktor, Fake-Richter):
  - Umbenennung mit `gleich` → gleiche ID in `data/offers.json`;
  - `fehlerhaft`/`entfallen` → weg, mit Grund;
  - `unklar` → gehalten, Wächter `ids`, andere Einheiten des Anbieters übernommen;
  - Richter-Fehler bzw. Grenze → gehalten mit `grenze`, nächste Nacht gerichtet;
  - `data/id-hinnehmen.yaml` → `held.events` übernommen;
  - Verlust mit Ursprung in nicht gated Einheit → erlaubt;
  - Waise → nicht gated;
  - IDs aus (a) gleich normalem Build;
  - Trockenlauf schichtet richtig;
  - `brakeHit` ohne Richter-Aufrufe;
  - Entdecken und Pflege-Beweis ohne Gate.
- `scripts/lib/nightly-workflow.test.ts`: `LLM_MODEL_JUDGE` gesetzt.
- `scripts/validate-data.ts`: Test für `data/id-hinnehmen.yaml`.

**Schritt C – Eval-Falle `fremder-ort`** mit dem heutigen Prompt und Haiku, wie im Nachtlauf. `pnpm verify`; E2E entfällt.
- **Erweiterung von `lib/eval-score.ts`:**
  - `TRAPS` bekommt `fremder-ort`.
  - `expected.json` bekommt optional `excluded: [{title, starts}]` für Angebote an einem Ort außerhalb des Katalogauszugs.
  - Der Score meldet „fehlverortet“: extrahierte Angebote mit ähnlichem Titel (`similarTitle`) **und** mindestens einem gemeinsamen Beginn mit einem `excluded`-Eintrag (M6). Denn `musikfuechse` bietet dieselben Kurse an beiden Orten an.
- **Fälle,** 4–6 Stück, mit echten Texten, frisch eingefroren mit `pnpm eval freeze <id> --kind … --trap fremder-ort` (der Katalogstand vor Poppenreuth wird danach von Hand in `input.json` gesetzt), und einem Katalogauszug ohne den fremden Ort:
  - `musikfuechse` mit dem Katalogstand vor `563de13`, ohne Poppenreuth. Die Fürther Kurse stehen in `excluded`.
  - die Kindertheaterreihe in fremden Kulturläden;
  - die Ohana-Kurse in Fürth, Bamberg und Wartenberg.
- **Gegenfallen** ohne `excluded`, deren Angebote bleiben müssen:
  - mutherstudio mit „Nürnberg, Fürth, Erlangen“ im Titel;
  - eine Hebamme mit Einzugsgebiet;
  - FBS mit dem Förderer „Amt … Fürth“.
- **Bestehender Fall `musikfuechse-2026-10-11`:**
  - Er bekommt den Katalogstand mit Poppenreuth, und seine Fürther Kurse kommen nach `expected.json`.
  - `NOTES.md` vermerkt den Nutzerentscheid und dass frühere Ergebnisse des Falls nicht mehr vergleichbar sind (m6).
- **Beleg** (m6): `evals/results.md` bekommt unter „Seitenfinder“ den Scan der Live-Angebote auf Fehlverortung, mit Verfahren, Datum und Ergebnis. Er wird für C neu ausgeführt.
- **Unit-Test** in `lib/eval-score.test.ts`: `excluded` mit Titel und Beginn trifft, gleicher Titel mit anderem Beginn nicht (Gegenfall).
- **Messung:** zwei Läufe je Fall mit `--model haiku --effort high`, Ergebnis in `evals/results.md`.
- **Entscheidung:**
  - Ist „fehlverortet“ in beiden Läufen 0, bleibt der Prompt, und D entfällt.
  - Sonst folgt D.
  - Ein Orts-Gate in der Pflege gibt es in keinem Fall.

**Schritt D – „Weglassen und melden“.** Nur wenn C Fehlverortungen zeigt; braucht B live. `pnpm verify`; E2E entfällt.
- `prompt/extract.md` unterscheidet drei Fälle:
  1. Der Treffpunkt ist ein Ort aus dem Auszug: dessen ID.
  2. Kein Treffpunkt genannt, oder er wechselt: der Hauptort.
  3. Ein konkreter Ort außerhalb des Auszugs: das Angebot weglassen und in `elsewhere: [{title, place}]` nennen.
- Die Antwort (`ExtractResponse`) bekommt `elsewhere` (optional). `UnitState` speichert es.
- Der Wächter meldet die neue Art `ort`: „Ort fehlt im Katalog: <place> (<title>)“. Ein Mensch trägt den Ort ein, wie bei Poppenreuth, und die nächste Nacht nimmt die Angebote auf.
- Die Umstellung läuft über den Schattenlauf (B6) und das Gate. Ein heute falsch verortetes Angebot fällt nur mit dem Urteil `fehlerhaft` weg.
- Danach muss die Eval-Falle „fehlverortet“ 0 zeigen, und die Gegenfallen dürfen nichts verlieren.

**Danach** geht es mit S1 weiter (`lib/pflege.ts`, ohne `fremder-ort`).
- S3 (live) braucht zusätzlich B auf `main`, denn jeder Anhang ändert den Auszug des Anbieters und läuft durch das Gate.
- Das Gate ersetzt die Abhilfe „mehr als 5 % → Nachtrag zu Plan 0048“ unter Risiken.

**Risiken:**
- **Das Gate hält zu viel**, etwa ein neues Modell mit vielen `unklar`. Die IDs bleiben heil, aber die Verbesserung und bei geänderten Seiten auch neue Termine dieser Einheit kommen nicht an, bis jemand entscheidet.
  - Abhilfe: Der Schattenlauf zeigt es vorher.
  - Der Wächter meldet jeden gehaltenen Anbieter.
  - Ein Mensch nimmt hin oder verbessert die Zuordnung.
- **Opus irrt:**
  - Ein falsches `gleich` ließe eine ID auf ein anderes Angebot zeigen (ADR 0022: lieber neu als vertauscht). Abhilfe: `keepId` gilt nur beim selben Anbieter, und der Bericht nennt jedes Erbe.
  - Ein falsches `fehlerhaft` kostet eine ID. Abhilfe: Der Grund steht im Bericht, und die ersten Läufe nach B prüft ein Mensch.
- **Kosten:** Der Richter läuft nur bei neuer Fassung und nur je Einheit mit Verlust, gedeckelt durch `JUDGE_BRAKES` (Nutzervorgabe: Qualität vor Kosten).

**Review (2026-10-30) – Verdict: Überarbeiten,** alles übernommen:
- **B1:** Das Gate hing am Inhalt statt an der Fassung. Jetzt `partsHash`; eine Inhaltsänderung hebt es nicht auf.
- **Major:**
  - M1 `pending` geht durchs Gate;
  - M2 entfällt mit B1;
  - M3 Ort im Ablauf (Overlay, zwei Builds über alles, nur Nachtlauf);
  - M4 Richter sieht den Katalog, Erbe über `keepId` statt nur Halten, Hinnehmen über die Workflow-Eingabe;
  - M5 ADR 0041;
  - M6 `excluded` mit Beginn;
  - M7 Build-Code über die Fixture `id-continuity`.
- **Minor:**
  - m1 ein Aufruf je Einheit, `JUDGE_BRAKES`;
  - m2 nur mit Vorstand, Waisen ausgenommen;
  - m3 alter Text an Ort und Stelle gestrichen;
  - m4 `verify` je Schritt, Workflow-Test benannt;
  - m5 A als Stand;
  - m6 Beleg des Scans, Vermerk im alten Fall.

**Review 2 (2026-10-30) – Verdict: Überarbeiten,** alles in Schritt B und C übernommen:
- **B1:** `keepIds` nicht im Antwortschema (`omit`, Hash-Test).
- **B2:** `held` mit Events und Grund; `grenze` wird erneut gerichtet; Hinnehmen übernimmt `held.events`.
- **Major:**
  - M1 `keepIds` je Beginn, Weg über den Entwurf, Konflikt beim Zusammenlegen;
  - M2 vor Stufe 0, markierte Ziele;
  - M3 Ursprung über den Batch, `unklar` hält nur die eigene Einheit;
  - M4 `mergeUnitStates` im Speicher, Schichtung im Trockenlauf;
  - M5 `INPUT_EPOCH` mit Pin-Test;
  - M6 `JUDGE_BUDGET_MIN`, `step: "judge"`, `brakeHit` ohne Richter;
  - M7 ADR 0041 ergänzt ADR 0022, Punkt 3; Ort darf sich bei `keepIds` ändern (D);
  - M8 Fixture mit freien Tagen unter `scripts/pipeline/fixtures/`.
- **Minor:**
  - m1 `entfallen`;
  - m2 erste Nacht gewollt, gedeckelt;
  - m3 Aufruf je Teil;
  - m4 `pnpm eval freeze`;
  - m5 Unit-Test für `excluded`;
  - m6 Datei `data/id-hinnehmen.yaml` statt Workflow-Eingabe;
  - m7 Dateien-Tabelle;
  - m8 Parameter des Schattenlaufs;
  - m9 Bedingung `prev.inputHash`.

Nach dem Skill war das der letzte erlaubte Review. **Die Änderungen aus Review 2 sind nicht mehr unabhängig geprüft.** Absicherung: `/arch-review` von B (Pflicht: neues Modul, Schemaänderung) und die Tests oben, besonders der Durchlauf in `io/nightly.test.ts`.

#### Nachtrag 2 – Umsetzung B (2026-10-31)

Gebaut auf `plan-0050`, teils parallel in eigenen Worktrees (Richter, ID-Kontinuität, Wächter samt Hinnehmen-Datei, Tests). Abweichungen vom Text oben:
- **ADR 0041** statt 0040: Die Nummer 0040 hatte Plan 0057 inzwischen vergeben (Merkliste).
- **B1, Pin-Test der Epoche** (`lib/input-epoch.test.ts`): eingefrorene Seiten stehen im Test selbst (HTML mit JSON-LD, iCal), nicht unter `scripts/pipeline/fixtures/input-epoch/`; das ist kleiner und lesbarer.
- **B2, Schreiben:** `refreshProvider` schreibt weiter selbst. `runIdGate` (`io/id-gate.ts`) liest danach den neuen Stand, baut (a) und (b) mit dem gemeinsamen reinen Kern `buildFromState` und schreibt nur die gerichteten Anbieter neu. Ein Absturz dazwischen veröffentlicht nichts, denn `publish` läuft erst nach einem erfolgreichen Lauf; lokal schreibt nur `--dry-run`, und das ins Overlay.
- **B2, Ursprung:** `assignIds` gibt je Angebot den Index seines Entwurfs zurück (`sources`). Daraus baut `buildOffers` `report.origins` (ID → Batch), und `batchesFromRaw` liefert `unitOf` (Batch → Einheit).
- **B3, Richter** (`lib/judge.ts`, `io/judge.ts`, `prompt/judge.md`):
  - `JudgeInput` hat zusätzlich `layout` (Seitengrenzen für `splitInput`) und `pageChanged` (optional; der Nachtlauf setzt es noch nicht, im Prompt heißt das „unbekannt“).
  - Bei Kurs und regelmäßigem Angebot ist das ganze Event ein Ziel: Zwei alte IDs auf demselben Event ergeben beide `unklar`.
  - Teilen sich zwei Teile die Urteile, gewinnt ein `gleich`; widersprechen sich zwei `gleich`, gilt `unklar`.
  - `LLM_EFFORT_JUDGE` (in `nightly.yml`: `high`).
  - `JUDGE_BRAKES` 60 Aufrufe und 6 Mio. gewichtete Tokens, `JUDGE_BUDGET_MIN` 20; `brakeHit` des Nachtlaufs zählt Richter-Aufrufe nicht mit.
- **B3, Taken:** Ein Event gilt als vergeben, wenn ein Angebot in (a) mit ähnlichem Titel und gemeinsamem Beginn eine alte, nicht verlorene ID trägt (`judgeInputOf`).
- **B5, Hinnehmen:**
  - Schema `IdAcceptance`, `acceptanceFor` und `idAcceptanceIssues` liegen in `lib/raw.ts`, `readIdAcceptance` in `io/files.ts`.
  - `data:validate` prüft die Datei, wenn sie existiert.
  - Der Hinweis zum Hinnehmen steht im Kopf des Wächter-Issues, nur bei einem Befund `ids`.
- **B6, Schattenlauf:** Die CLI hat kein `--max-calls`; die Bremsen kommen aus der Umgebung (`MAX_CALLS`, `MAX_TOKENS`, `RUN_BUDGET_MIN`). Der Skill nennt den Aufruf so.
- **B7, ID-Kontinuität:**
  - `freeze-id-continuity.ts` friert den letzten Nachtlauf aus git ein (gzip, 378 KB), samt dem **Vorstand dieses Laufs** (`offers-before.json.gz`).
  - Zwei Fälle:
    - Fixpunkt mit dem Ergebnis als Vorstand;
    - der Nachtlauf nachgebaut aus seinem Vorstand.
  - Befund: Der heutige Build verliert keine IDs (436 von 436).
  - Grenze: Eine leicht verschärfte Schwelle (`SAME_SESSIONS` 0,99) bemerkt der Test nicht, weil die eingefrorenen Übergänge keine Grenzfälle enthalten; erst eine abgeschaltete Stufe 1 macht ihn rot. Mehrere eingefrorene Läufe würden ihn schärfen (Restpunkt).
- **B2, Ursprung in einer Einheit ohne neue Fassung** (Test-Review): Der Text oben erlaubte diesen Verlust. Da sich (a) und (b) aber nur in den gated Einheiten unterscheiden, kommt er immer von einer neuen Fassung. `unitLosses` hängt ihn deshalb an die erste gated Einheit (`crossUnit`), `runIdGate` hält sie mit `unklar`.
- **Nachprüfung** (`recheck`, Test-Review): Nach allen Urteilen baut das Gate erneut. Eine ID, die dabei ohne Urteil fehlt, hält die Einheit mit `grenze`. Solche Fälle entstehen beim Halten einer anderen gated Einheit oder wenn ein Erbe an einer Dublette scheitert.
- **Fehlerpfade** (Arch-Review M3, m1): Wirft das Gate, ist ein Zustand inkonsistent oder scheitert ein Build ((b) oder die Nachprüfung), werden alle gated Einheiten mit `grenze` gehalten. Der Lauf baut dann den alten Stand dieser Einheiten und kippt nicht.
- **Frist des Richters** (Arch-Review M2): bis Laufbudget + `JUDGE_BUDGET_MIN` ab Laufstart, per `AbortSignal.timeout`. So bleibt die Marge des Jobs wie ohne Richter.
- **Arch-Review 2** (letzter erlaubter Durchgang), alles behoben bzw. dokumentiert:
  - B1 `held.since` beginnt neu, sobald eine neue verlorene ID dazukommt (sonst deckte ein alter Eintrag in `data/id-hinnehmen.yaml` sie mit);
  - M1 eine im Katalog ersetzte Seiten-URL bleibt bewusst ohne Gate (Katalogänderung, ADR 0041, Punkt 2);
  - M2 die Abrufart ist Teil der Fassung (`extractKey`, `opts.fassung`; Standard `neu` ohne Wirkung auf den Hash);
  - m2 letzter Ausweg `revertAll`, wenn auch das Halten scheitert;
  - m1, m3, m6 als Grenzen in ADR 0041; m4, m5 im Skill; m7 `withoutGitEnv` im Einfrier-Skript.
- **Restpunkte** (für `docs/ideas.md` beim Abschluss):
  - `held.lost` wird beim Halten im Fehlerpfad (`holdAll`, `lost: []`) geleert. Ein Hinnehmen läuft dann ins Leere, und der Richter urteilt erneut; sicher, aber unnötig.
  - `revertAll` setzt auch eine gerade entfernte Einheit zurück; die Entfernung folgt eine Nacht später.
  - `results[anbieter]` im Bericht zeigt bei gehaltener Einheit weiter z. B. `extrahiert`; nur `units` zeigt `gehalten`.
  - `pageChanged` setzt der Nachtlauf nicht; der Richter liest „unbekannt“.
  - Der Richter sieht nur seine Einheit. Zieht eine neue Fassung ein Angebot auf eine andere Seite um, ist ein falsches `entfallen` möglich.
  - Die ID-Kontinuität wäre mit mehreren eingefrorenen Nachtläufen schärfer.
  - Neue Anbieter aus dem Entdecken tragen die Fassung `neu`, der Nachtlauf läuft bis Plan 0048, N1 mit `alt`: Ihre erste Änderung der Seite geht einmal durchs Gate.
- **Refactorings unterwegs:**
  - `buildFromState` und `nightlyWindow` (`lib/build-offers.ts`) ersetzen doppelte Rechnungen in `io/nightly.ts`.
  - `callRecordOf` ist der gemeinsame Teil von Extraktion und Richter.
  - `messageExcerpt` (vorher `catalogExcerpt` in `lib/extract.ts`) heißt so, damit es nicht mit `normalize.catalogExcerpt` verwechselt wird.

## Nutzerentscheide (offen)

- **N1 – Live ohne Abnahme je Seite.** Voraussetzung: Ziel 2 in beiden Trockenläufen erreicht. Empfehlung: dann live; Rücknahme per Revert und `abgelehnt`; die ersten zwei Live-Läufe prüft ein Mensch nachträglich. Alternative: dauerhaft Trockenlauf mit Vorschlägen im Issue (wie Plan 0045, S3b).
- **N2 – Takt.** Empfehlung: wöchentlich je Netz, ausgefallene Seiten zuerst (ADR 0033, Punkt 4). Alternative: zusätzlich täglich nach dem Nachtlauf mit `--only` für neue Fälle `dauerhaft`, für schnelleren Ersatz.

## Kosten

Nach Nutzervorgabe kein Kriterium. Ein Pflegelauf ruft je Anbieter höchstens 20 Seiten ab und extrahiert höchstens 5 Kandidaten. Danach ruhen geprüfte Kandidaten bis zu 8 Wochen.

## Risiken

- **Falsche Seite angehängt** (fremder Veranstalter, Archiv mit alten Terminen, Shop). Abhilfe:
  - Ertragsbeweis mit künftigem, nicht abgedecktem Angebot;
  - eigene Website, Plattform nur per direktem Link oder `iframe`, Mandant gleich;
  - Sammelkalender-Hosts ausgeschlossen;
  - Präzision in zwei Trockenläufen vor dem Live-Gang;
  - Revert und `abgelehnt`.
- **Zweite Fassung einer vorhandenen Seite.** Abhilfe: das lockere Kriterium `covered`; Vergleich auch gegen vorübergehend ausgefallene Einheiten und `kandidaten`; simulierter Nachtlauf mit `mergeParts`.
- **Termine am falschen Ort.** Abhilfe nach Nachtrag 2: Eval-Falle `fremder-ort` (C), falls nötig „weglassen und melden“ (D); Anbieter mit Orts-`hint` nur berichten; Abnahme je Seite (Ziel 2).
- **Ein Anhang extrahiert den ganzen Anbieter neu** (Plan 0048, E3 nach Nachtrag 1: Der Auszug jeder Einheit nennt alle Seiten des Anbieters). Jede Neuextraktion kann IDs kosten (Plan 0048, S0: 87–96 % gehalten zwischen zwei Läufen desselben Modells). Abhilfe: das ID-Gate (Nachtrag 2, B), denn ein Anhang ändert den Auszug und damit die Fassung der übrigen Einheiten.
- **Ersatz kommt zu spät.** Abhilfe: Ruhezeit hängt an `stand`, Gruppe 1 der Reihenfolge, Durchlauf-Test.
- **Veraltete Seite bleibt neben der neuen.** Abhilfe: Der Wächter meldet die alte; nach 14 Tagen `dauerhaft` entfallen ihre Events (Plan 0048, E5).
- **Last auf fremden Websites.** Abhilfe: 20 Abrufe je Anbieter, 1/s je Host über den Lauf, robots.txt, wöchentlich, Ruhezeiten.
- **G2 lockerer.** Abhilfe: nur im Pflegelauf, nur Anhängen am Ende von `programme` gecrawlter Anbieter, genau vier Schlüssel, Diff-Prüfung gegen die eigenen Anhänge, ein Commit je Anbieter.
- **Größenbudgets.** Abhilfe: `katalog-budget` mit den Einheiten der Anhänge; `vrr` erst nach Plan 0044.

## Review (2026-10-26) – Verdict: Überarbeiten

Unabhängiger Review des Entwurfs. Alle Befunde sind übernommen:
- **B1** `abgelehnt.anbieter` statt `id`.
- **Major:**
  - **M1** `timeout` über dem Budget;
  - **M2** `gepflegt` gegen Verhungern;
  - **M3** Plattform-Seiten ein Sprung, `sameSite`;
  - **M4** Mandant, Sammelkalender-Hosts;
  - **M5** Anbieter mit Orts-`hint` nur berichten;
  - **M6** Vergleich gegen den wirksamen Katalog ohne `dauerhaft`;
  - **M7** ADR 0033, Punkt 4: „zuerst“ statt „sofort“;
  - **M8** G2-Option nur im Pflegelauf;
  - **M9** Budget vor der Übergabe, `vrr` erst nach Plan 0044.
- **Minor:** übernommen.
- **Scope:** `skipCrawl` aus dem Lauf genommen. Die Erkennung geteilter Websites zu verschieben ist mit Review 2 **zurückgenommen**: Der Katalog hat 47 Programm-URLs verschiedener Anbieter auf `nuernberg.de`, die Erkennung ist also von Anfang an nötig (eine reine Funktion über den Katalog).
- Aus dem Review von Plan 0050 (M4): Modus `alle` festgelegt.

## Review 2 (2026-10-26) – Verdict: Überarbeiten

Zweiter, unabhängiger Review. Die Angaben der Ausgangslage sind am Code bestätigt. Alle Befunde sind übernommen:
- **B1 Budget misst die Anhänge nicht** (`programme` steht nicht in `site.json`, und die Pflege schreibt nicht nach `data/raw`): `katalog-budget` baut auf einer Kopie von `data/raw` plus den Einheiten der Ertragsbeweise. Bei Rot werden die Anhang-Commits verworfen (nicht per Revert, wegen `MAX_COMMITS`, Befund aus Review 2 von Plan 0050); Ergebnis `budget`, Test (E3).
- **Major:**
  - **M1** Neuheit über `assignIds` zu streng: eigenes Kriterium `covered` auf einem simulierten Nachtlauf; Tests für Teaser, Druckansicht und Detailseite (E2).
  - **M2** fremder Ort würde Hauptort: Ortsprüfung im Text, Ergebnis `fremder-ort` (E2).
  - **M3** Ruhezeit verhinderte Ziel 3: Ruhezeit an `stand` gebunden, entfällt in Gruppe 1; Durchlauf-Test (E4).
  - **M4** `iframe`: in `site-crawl.ts` gelesen, `extractPage` unverändert (E1).
  - **M5** Präzision erst live: Ziel 2 zuerst in zwei Trockenläufen, Vorbedingung für N1.
- **Minor:**
  - `kind` aus dem Content-Type;
  - Datum mehr als 10 Monate voraus gilt als vergangen;
  - `timeout` = Budget + 60, eigenes Zeitlimit des Budgetschritts;
  - altes Format nur berichten statt Voraussetzung;
  - Zustand im Trockenlauf nur in `runs/`;
  - `--katalog` ohne Ruhezeiten;
  - `RunKind` `pflege`;
  - `seiten` räumt auf;
  - Startseiten zählen, `blocked` nur als Bereich, Vorlagen nie Startseite;
  - `SHARED_HOSTS` als feste Liste mit Vorrang von `sameSite`;
  - G2-Option nur für gecrawlte Anbieter;
  - `kandidaten` im Vergleichsstand;
  - `dauerhaft` über `klasseSince`;
  - Ziel 1 ohne abgedeckte Seiten.
- **Scope:**
  - Modus `alle` wird mit Plan 0050, S3 gebaut, die Schnittstelle bleibt hier (übernommen).
  - Die Prüfung „Stand vor dem Lauf“ bleibt in `katalog-budget`. Grund: Auch die Pflege darf bei schon rotem Budget nichts anhängen (abgelehnt).

Nach dem Skill ist noch ein Review erlaubt. Die Lösungen von B1 und M1–M3 prüft Review 3.

## Review 3 (2026-10-26) – Verdict: Freigabe mit Änderungen

Dritter, unabhängiger Review (letzter erlaubter Durchgang nach dem Skill). **Kein Blocker offen.** Die Lösungen aus Review 2 tragen im Ansatz; die Mechanik ist ergänzt. Alle Punkte übernommen:

**Major**
- **M1 `katalog-budget` war so nicht ausführbar** (Build und `size` lesen fest `data/`): Messung in eigenen Worktrees auf `GITHUB_SHA` und HEAD, ohne Kachelbilder; `data/` des Arbeitsbaums bleibt unberührt (E3, Test, Tabelle).
- **M2 Sammelkalender-Ausschluss sperrte ganz `nuernberg.de`:** feste Hosts plus URL-Präfixe der Aggregator-Seiten (E1, Test).
- **M3 Widgets am Bot-Schutz:** einmal Browser bei 403 oder Bot-Schutz auf Plattformen und Hosts mit `render: browser` (E1, Test).
- **M4 Ortsprüfung nicht kalibriert:** ganzer Seitentext samt Footer, Normalisierung, Messung in S0 mit Soll ≥ 95 % (E2, Tests).
- **M5 fremder Anbieter am selben Ort:** `covered` auch gegen andere Anbieter in 100 m, Ergebnis `fremder-anbieter` (E2, Test).

**Minor**, übernommen:
- Beweis nur mit Kandidat und Beilagen;
- kanonische URL;
- G1 über `discoverGates()`;
- Modus `alle` erst mit Plan 0050 exportiert;
- `lib/url.ts` gegen Zyklen;
- `stand` nur über Kennungen und `dauerhaft`;
- Trockenläufe auf getrennten Hälften;
- `timeout` = Budget + 90 per `fromJSON`;
- Grenzen nur aus vollständigen Läufen;
- „Ersatz für“ mit `hint` im Commit;
- Wurzel der Website als Startseite;
- die Klarstellungen;
- `discover-publish` in der Tabelle;
- Build-Fehler ohne Größenbezug als `fehler`.

**Scope:** JSON-Kandidaten gestrichen (übernommen).

Kein Blocker offen; der Plan ist nach dem Skill fertig. Die Änderungen aus Review 3 sind nicht mehr unabhängig geprüft. Ein kurzer `/plan-review` vor S1 ist empfohlen, weil zwischen Planung und Umsetzung Plan 0048 umgesetzt wird.

## Review 4 (2026-10-30) – Verdict: Freigabe mit Änderungen

Vierter, unabhängiger Review, angeregt durch Review 3: Abgleich mit dem Code nach Plan 0048 (S1–S3) und Plan 0050 (S0–S2c). Alle Punkte übernommen; der Reviewer hält keinen weiteren Durchgang für nötig.

**Blocker**
- **B1 Beweis wäre `einbruch`:** `refreshProvider` ohne eigenes `rawDir` liest `data/raw`, die übrigen Einheiten würden verwaist und Baseline. Jetzt wie `proveEntry`: frisches Verzeichnis als `rawDir` und `outDir`, kein `prevOfferCount`, kein `mayRetry`; Test (E2).

**Major**
- **M1** Voller Katalogeintrag als `provider`, nur die Einheit des Kandidaten in `fetched.units`; Helfer neben `unitInputs` (E2).
- **M2** Modell des Beweises wie im Nachtlauf, nicht wie im Entdecken; Workflow-Test (E5).
- **M3** robots.txt: `pflege` und S0 fest mit `neu`; Voraussetzungen neu gefasst (S0–S2 nur Code, Live-Gang nach N1).
- **M4** `follow` und `partChars` fehlen auf `main`: als „erst mit Plan 0042“ markiert, `abgeschnitten` über `MAX_INPUT_CHARS`/`splitInput`.
- **M5** Kandidat aus der Erkundung, Beilagen einmal je Anbieter über die Warteschlange; Test.
- **M6** Simulierter Nachtlauf über `batchesFromRaw` mit `previous`; Angebote des Kandidaten aus seinem Batch.

**Minor**, übernommen: `DiscoverState` heute; abgelehnte URL sperrt auch im Entdecken (gewollt); altes Format entfällt (82 von 82 V2); `discover-workflow.test.ts` besteht; `on.schedule` neu, `PFLEGE_MODUS` im Zeitplan-Zweig, Eval-Sperre mit Pflegefenster; `--netz`/`vrr` wie Plan 0050; Plan 0044 nur reserviert; `lib/watch.ts` und `lib/klaerfall.ts` beim Umzug nach `lib/url.ts`; `dauerhaft` erst ab zwei Tagen; was zu den 20 Abrufen zählt; `budget-verworfen.json` lauf-neutral; rohes HTML für die Ortsprüfung.
