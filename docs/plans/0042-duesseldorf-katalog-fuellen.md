# Plan 0042 – Düsseldorfer Katalog füllen

Status: in Umsetzung
Datum: 2026-10-18
Bezug:
- Plan 0039 (`docs/plans/0039-region-duesseldorf.md`), Abschnitt „Zwischenstand und Übergabe“: Trockenlauf mit 4 Anbietern, Hypothesen 1–5, Empfehlung „zuerst ein kleiner Plan ‚Düsseldorfer Katalog füllen‘“. Dort heißt er noch Plan 0040; die Nummer ist inzwischen vergeben.
- ADR 0025, Punkte 3, 6 und 7: Programmeinträge sind ausführbar; `aggregator` verlangt `adapter`; die Rolle entscheidet den Abruf.
- ADR 0026, Punkt 2 („Links werden nie verfolgt“) und „Abweichungen“ zu ADR 0006 (keine Subagenten-Pakete für die Extraktion); ADR 0022 (IDs); ADR 0032 (Netze, `municipality`).
- Plan 0002 (`docs/plans/archiv/0002-pipeline.md`): Muster der einmaligen Agenten-Recherche mit Subagenten je Paket.
- Skill `babyevents-nuernberg`, Abschnitte 3 (Katalog von Hand), 4 (Eval) und 6 (Region starten); `references/catalog.md`, `references/booking-systems.md`, `references/excluded.md`.
- `docs/ideas.md`, „Weitere Regionen“ (Sammelkalender-Adapter und Verzeichnisse für Düsseldorf), „`site.json` je Gebiet teilen“, „`data/offers.json` je Region teilen“.

## Anlass

Plan 0039 ist fertig gebaut, aber nicht gepusht. Der Bootstrap-Trockenlauf des Entdeckens fand für Düsseldorf 4 aufnehmbare Anbieter: 10 Suchbegriffe, 53 Kandidaten, 44 verworfen. Der Nutzer hat angehalten: „Nur 4 Anbieter? … eine frische Session soll weitermachen und das Grundproblem lösen.“

Dieser Plan misst die Hypothesen aus der Übergabe, füllt den Katalog vor dem Live-Gang und behebt die zwei Stellen, an denen das Entdecken in Düsseldorf Bewertungen verschwendet. Den Navigator als dauerhafte Fundquelle des Entdeckens regelt ein Folgeplan (E5).

## Ausgangslage (gemessen 2026-10-18, ohne Modell)

Vier Subagenten haben mit `pnpm pipeline fetch-page`, curl und Websuche gemessen, ohne Modellaufruf der Pipeline. Die Bestandsaufnahme steht vollständig im Anhang.

### Bestand

- Die Stadt Düsseldorf hat **71 einzeln erfasste Anbieter** mit Angeboten für 0–3 Jahre. Mit den nicht einzeln erfassten Kirchengemeinden sind es geschätzt 85–100, etwa so viele wie in Nürnberg (74 Anbieter, 447 Angebote; Fürth: 8 Anbieter, 37 Angebote). Zusammen haben sie grob **600–750 Angebote**, gezählt als Kurse und Gruppen, nicht als Termine.
- **Fünf Familienbildungswerke** stellen etwa zwei Drittel davon:
  - efa (Ev. Familienbildungswerk), ≈ 25–30 %
  - DRK, ≈ 17 %
  - ASG-Bildungsforum, ≈ 13 %
  - AWO, ≈ 7 %
  - Familienakademie der Kaiserswerther Diakonie (KWD), ≈ 5 %
- Das Entdecken fand 4 der 71 Anbieter (≈ 6 %) und keinen der fünf großen Träger. Alle fünf waren Kandidaten und wurden verworfen.

### Hypothese 1 (Landesportale sind Sammelkalender): bestätigt, mit offener Schnittstelle

- **Dasselbe Portal unter zwei Namen.** `fruehehilfen-online.nrw.de` und `guterstart.nrw.de` sind dieselbe Anwendung mit demselben Bestand. Für Düsseldorf ist das der **Familien-Navigator Düsseldorf**: `https://familien-navigator.duesseldorf.de/` leitet auf `https://www.fruehehilfen-online.nrw.de/duesseldorf.suche` (`einrichtungId=39`). Betreiber ist das Amt für Soziales und Jugend der Stadt.
- **Schnittstelle.** Die Suchseite lädt per JavaScript. Dahinter liegt ein GET-Endpunkt, der JSON liefert, obwohl der Content-Type `text/html` lautet: `https://www.fruehehilfen-online.nrw.de/fhiangebot/searchredesign?einrichtungId=39&limit=3000`.
  - Ein Abruf liefert **2 179 Angebote**; die Anbieterliste `…/fhianbieter/searchredesign?einrichtungId=39` nennt 191 Anbieter.
  - Felder je Angebot: `AngebotName`, `AngebotForm`, `alter[]`, `wann`, `AdStr`, `AdPlz`, `AdGeoLat`, `AdGeoLng`, `AngebotUrl`, `AnbieterName`, `AnbieterUrl`, `TraegerName`, `TraegerUrl`, `UpdatedAt` und weitere. `wann` ist Freitext, etwa „Von 16.09.2026 (09:00 Uhr) bis 16.12.2026 (10:30 Uhr)“ oder „Dauerhaftes Angebot“.
- **Datenlage für 0–3 Jahre**, ohne Medizin und Beratung:
  - **≈ 495 Angebote**, davon ≈ 352 mit künftigem Ende und ≈ 119 „dauerhaft“. Nur ≈ 4 % sind abgelaufen.
  - Die abgelaufenen PDFs des Trockenlaufs (`/fhiangebot/exportpdf/id/<n>`) sind alte Treffer der Suchmaschine, nicht der Stand des Portals.
  - Jede Kursserie ist ein eigener Eintrag. Nach Träger zusammengefasst sind es ≈ 40 Träger mit 70 Anbieternamen.
  - Die größten Träger nach Einträgen: efa 121, DRK 78, ASG 47, AWO Familienglobus 36, Diakonie Düsseldorf 33, Jugendförderung der Stadt 25, KWD 24, Kitas des Jugendamts 12, Paritätischer bzw. Kinderschutzbund 11, Stadtbüchereien 10.
- **Rechtliches.**
  - robots.txt beider Hosts erlaubt alles.
  - Das Impressum (`/hilfe/impressum?einrichtungId=39`) sagt: Texte, Bilder und Layout dürfen ohne Zustimmung „nicht zu anderen als rein privaten Zwecken verwendet werden. Öffentliche Wiedergabe oder Veränderung sind unzulässig.“
  - Eine offene Lizenz gibt es nicht.

### Hypothese 2 (Kursportale großer Träger): bestätigt, aber anders als vermutet

- **Ein gemeinsames Kurssystem.** efa, DRK, ASG, AWO und KWD laufen alle auf **Kufer (KuferWeb)** in einer TYPO3-Hülle. Erkennbar ist es an:
  - „Kufer Software GmbH“ im HTML
  - Pfaden mit `kuferweb/webbasys`
  - URLs der Form `/kategorie/<id>?knr=…&browse=forward`
  - `?knradd=` im Warenkorb-Link
- **Lesbar, aber verworfen.** `fetch-page` liest die Listen als Text: Titel, Kursbeginn, Uhrzeit, Ort und Ampel. Es sind keine JS-Leerseiten. Verworfen wurde aus vier anderen Gründen:
  1. **Paginierung per Cursor.** Die Folgeseite heißt `…/kategorie/<id>?knr=<Nummer des letzten Kurses>&browse=forward`.
     - ASG zeigt „Seite 1 von 32“ mit 7 Kursen je Seite, DRK hat 6 Seiten, efa 2–7 Seiten. AWO und KWD haben Blätterlinks mit `cHash`.
     - Eine feste Programm-URL je Folgeseite veraltet, sobald ein Kurs dazukommt.
     - Die Listen sind aufsteigend nach Beginn sortiert. Seite 1 der DRK-Gesamtliste hat kein einziges künftiges Startdatum.
     - Die Befunde der Subagenten widersprechen sich teils: Die Bestandsaufnahme sah bei efa höchstens 25 Kurse ohne Blätterlink und bei ASG „den Rest per JS“. Das klärt S0, M1.
  2. **Nur der Kursbeginn.** Je Kurs steht „ab Mo. 31.08.2026, 14 Termine“.
     - Das versteht der Extraktor schon. `scripts/pipeline/prompt/extract.md` macht aus „Kurs ‚8 Termine ab 13.10., dienstags‘“ eine `weekly`-Regel mit `from`, `count` und `skipHolidays`.
     - Ein laufender Kurs hat also künftige Termine, sobald seine Seite im Abruf landet.
  3. **Orte ohne Adresse.**
     - AWO nennt in der Liste nur Stadtteil oder Einrichtung; die Adresse steht erst auf der Detailseite.
     - KWD nennt nur „Fronberghaus, Raum 004“. Die Adresse (Alte Landstraße 179c) steht nur auf der Kontaktseite.
     - DRK schreibt „Tellerringstr.56“ ohne PLZ und Ort; das Geocoding fand die Adresse nicht.
  4. **Falsche Einstiegs-URL.**
     - `efa-duesseldorf.de/kurssuche` ist leer, die Kategorieseiten sind voll.
     - `kursplaner.drk-duesseldorf.de` leitet auf die Startseite.
- **Beste Einstiegsseiten** (aus der Bestandsaufnahme):
  - **efa:** `https://www.efa-duesseldorf.de/kurse/familie-werden/pekip-delfi-eltern-baby-gruppen`, dazu unter `https://www.efa-duesseldorf.de/kurse/mit-kindern-leben/` die Kategorien `spielgruppen`, `musik-und-tanz-mit-kindern` und `bewegungsspiele-und-turnmaeuse`. Adressen stehen in der Liste (≈ 9 Orte).
  - **DRK:** `https://www.drk-bildung-duesseldorf.de/kurse/eltern-kind-angebote` mit den Unterkategorien Babys (130), Spielgruppen (131), Bewegung (134) und Musiklöwen (135), dazu `…/kurse/angebote-im-wasser`. Adressen stehen in der Liste (5 Orte).
  - **ASG:** `https://www.asg-bildungsforum.de/kurse/familie/eltern-kind-kurse`, `…/schwangerschaft-baby` und `…/elterncafes-offene-treffs`. Adressen stehen in der Liste.
  - **AWO:** `https://www.awo-duesseldorf.de/awo-kurse/kursliste/?kathaupt=1&katid=48&katvaterid=0&cHash=e0cdf392af682b295fe5327d436eca63` und die Kategorien Babys (`katid=25`) und Krabbelgruppen (`katid=37`). Die Liste nennt nur Einrichtungen (≈ 11 Orte).
  - **KWD:** `https://www.kaiserswerther-diakonie.de/programm-familienakademie/kurse/das-baby-ist-da/kategorie/Eltern-Kind-Angebote/130` und `…/kategorie/Das+Baby+ist+da/10`. Die Liste nennt nur Raumnamen (1 Ort).

### Hypothese 3 (Adress-Regel zu streng): teilweise widerlegt

- **Kontaktseiten werden schon gelesen.** Das Bewerten ruft neben der Fund-URL bis zu zwei Kontaktseiten derselben Website ab: Kontakt, Anfahrt, Impressum, „Über uns“ (`contactLinks`, `MAX_CONTACT_PAGES = 2` in `scripts/pipeline/lib/discover.ts`). Eine Adresse im Impressum kann es also finden.
- **Außer bei PDFs.** Ist die Fund-URL ein PDF, gibt es keine Links und damit keine Kontaktseiten. Das traf alle 20 Portal-Funde.
- **Wo die Regel steht:**
  - im Prompt: `venues` mit vollständiger Postadresse, nur von den abgerufenen Seiten (`scripts/pipeline/prompt/discover-assess.md`)
  - im Schema: `venues` mit mindestens einem Eintrag
  - im Geocoding: „Adresse nicht gefunden: …“
- **Folge.** Die Regel zu lockern hieße, geratene Orte aufzunehmen; das widerspräche „Werte werden nie geraten“. Für die großen Träger löst der Handkatalog das Problem: Ihre Orte stehen dort als `venues` mit `hint` (E3).

### Hypothesen 4 und 5

- **Suchbegriffe.** Die zehn Suchbegriffe sind fest und für alle Regionen gleich (`scripts/pipeline/lib/discover-terms.ts`), und der Suchprompt schließt Sammelkalender und Vermittler aus. Düsseldorf hat im Katalog weder Verzeichnis noch Sammelkalender, also trägt nur die Websuche. Mehr Suchbegriffe scheiterten an den Gründen aus Hypothese 2.
- **Recherche.** Eine einmalige Agenten-Recherche ist der schnellste Weg zum vollen Katalog. Die Bestandsaufnahme im Anhang ist ihr erster Teil.

### Nebenbefunde

- **PDF im Browser.** `fetchTask` (`scripts/pipeline/io/fetch-inputs.ts`) prüft `render === "browser"` vor `kind === "pdf"`. Setzt das Bewerten bei einem PDF `render: "browser"`, geht die URL an Chromium, und der Abruf endet mit „page.goto: Download is starting“. Dieselben PDFs liest `pdftotext` sauber.
- **robots.txt der Stadt.** `https://www.duesseldorf.de/robots.txt` sperrt `User-agent: *` für alles und erlaubt nur benannte Crawler (Googlebot, Bingbot, ClaudeBot, GPTBot …).
  - Die Pipeline sendet einen Browser-User-Agent (`UA` in `scripts/pipeline/io/http.ts`) und liest robots.txt nicht.
  - Betroffen wären die Stadtbüchereien, die Familien- und Stadtteiltreffs, die Jugendförderung und das Theatermuseum.
- **Kirchengemeinden.**
  - In Nürnberg sind sie ≈ 40 % des Katalogs, viele über `evangelische-termine`. Das ist ein bayerischer Kalender; die Ev. Kirche im Rheinland steht nicht darin.
  - Düsseldorfer Gemeindeseiten laufen über ChurchDesk (JS). Katholische Gruppen laufen meist über das ASG-Bildungsforum.
- **Größen.**
  - `data/offers.json` hat 1,23 MB für 484 Angebote (≈ 2,5 kB je Angebot). `biome.json` erlaubt 4 MiB.
  - `site.json` hat 113,38 kB gzip bei einem Budget von 250 kB. `docs/ideas.md` verlangt ab 200 kB einen eigenen Plan zum Teilen.
  - Hochgerechnet mit ≈ 0,23 kB gzip je Angebot (obere Schranke) sind das ≈ 180 kB bei 300 neuen Angeboten und ≈ 205 kB bei 400.
  - `anbieter.json` hatte 7,61 kB gzip bei 74 Anbietern (`docs/plans/archiv/0010-anbieteruebersicht.md`), also ≈ 0,1 kB je Anbieter, bei einem Budget von 15 kB. Mit 40–70 Düsseldorfer Anbietern, viele mit vielen Orten (efa, ASG, AWO), sind 13–18 kB zu erwarten. Dieses Budget ist das knappste.
- **Gates mit dem ersten Düsseldorfer Ort.** `wegzeit/vrr.json` hat ein Budget von 64 kB gzip (`.size-limit.json`). `MAX_WITHOUT_LINES` (0,093, `scripts/transit/gates.ts`) wird für `vrr` erst scharf, wenn es Orte gibt. Rot hieße: kein Deploy, auch nicht für Nürnberg.
- **Cache.** Seit dem Extraktions-Prompt aus Plan 0039 hat jeder Anbieter einen neuen Cache-Schlüssel (ADR 0032, Konsequenzen). Ein Trockenlauf liest den Cache nur aus `data/raw` (`scripts/pipeline/io/refresh.ts`), extrahiert also ohne `--only` alle Anbieter neu. Das waren ≈ 136 Aufrufe am 2026-10-12. Die Bremse `MAX_CALLS` steht auf 150.

## Ziel

1. **Katalog vor dem Live-Gang.** Bevor Plan 0039 live geht, stehen mindestens **40 Düsseldorfer Anbieter** im Katalog, darunter die fünf Kufer-Träger. Die Trockenläufe der Pakete liefern zusammen **mindestens 300 Düsseldorfer Angebote**.
2. **Abdeckung gegen den Navigator.** Mindestens 80 % der Navigator-Einträge für 0–3 mit künftigem Ende oder „dauerhaft“ gehören zu einem Träger, der im Katalog steht.
   - Aus dem Nenner fallen die Träger, die nach E7 bewusst draußen bleiben: städtische Quellen auf `www.duesseldorf.de` (Jugendförderung 25, Stadtbüchereien 10) und die Einträge, die nur Orte eines Familienbildungswerks sind.
   - Die herausgenommenen Träger stehen mit ihrer Zahl im Abschnitt „Umsetzung“.
3. **Kufer-Kurse vollständig.**
   - Je Kufer-Träger liefert der Trockenlauf mindestens 80 % der Kurse seiner Programmseiten. Als Kurs zählt nur einer mit künftigem Termin; die Listen enthalten auch abgelaufene. Das Soll kommt aus M2.
   - Bei 10 Stichproben-Kursen stimmen Beginn, Wochentag, Uhrzeit und Ort mit der Detailseite.
4. **Keine verschwendeten Bewertungen.** Portal-PDFs und Seiten auf `www.duesseldorf.de` erreichen das Bewerten nicht mehr (E6). Ein Entdecken-Eval misst den Ausgangswert für den Folgeplan (E5). Es blendet 5 Anbieter aus, die auch im Navigator stehen, und 5, die nur die Websuche kennt. Beide Zahlen gehen nach `evals/results.md`; eine Schwelle gibt es nicht.
5. **Größen.** Alle Budgets aus `.size-limit.json` bleiben grün. Darunter sind `Daten (anbieter.json)` mit 15 kB, `Wegzeit-Daten vrr` mit 64 kB und `Linien-Daten vrr` mit 40 kB. Für `site.json` gilt die strengere Schwelle 200 kB gzip aus `docs/ideas.md`. `MAX_WITHOUT_LINES` hält auch für `vrr`. Reicht das für Ziel 1 nicht, entscheidet der Nutzer (E4, „Anhalten“).

## Nicht-Ziele (Restpunkte nach `docs/ideas.md`)

- **Navigator als Fundquelle des Entdeckens** (Verzeichnis mit Adapter). Das kommt als Folgeplan (E5), weil Rechtliches (N1) und ein neues ADR offen sind. Ziele 1–3 und der Live-Gang hängen nicht daran.
- **Navigator als Terminquelle** (`aggregator` mit Angeboten aus dem Portal). Das Impressum verbietet die öffentliche Wiedergabe.
- **Kirchengemeinden vollständig.** Aufgenommen werden die in der Bestandsaufnahme geprüften Gemeinden mit lesbaren Terminen. Den Rest bringen das Entdecken und spätere Pflege.
- **Sportvereine vollständig.** Geschätzt haben 25–40 Vereine Eltern-Kind-Turnen; erfasst sind 11.
- **robots.txt projektweit beachten** und einen eigenen User-Agent senden. Das betrifft auch Nürnberg und braucht einen eigenen Plan. Hier bleiben nur die Quellen auf `www.duesseldorf.de` draußen (E7).
- Suchbegriffe je Region und Änderungen an den Prompts `discover-*.md`.
- `site.json` je Gebiet teilen; ein eigener Plan, falls Ziel 5 greift.

## Entscheidungen

### E1 – Katalog per Agenten-Recherche, nicht per Bootstrap des Entdeckens

Der Katalog wird einmalig von Hand gefüllt, nach dem Muster von Plan 0002. Subagenten legen je Paket (E8) Einträge nach `references/catalog.md` an, und die Haupt-Session übernimmt sie nacheinander in `data/providers.yaml`. Danach hält das Entdecken den Katalog aktuell.

Begründung:
- Das Entdecken bewertet je Kandidat eine Seite und bis zu zwei Kontaktseiten. Die großen Träger brauchen dagegen mehrere Programmseiten, Folgeseiten (E2) und Orte mit `hint` (E3). Das leistet nur die Pflege von Hand.
- Selbst ein verbessertes Entdecken startete bei 6 % Trefferquote. Die Bestandsaufnahme kennt die Anbieter schon.

Abgrenzung zu ADR 0026 („keine Subagenten-Pakete mehr“): Die Subagenten recherchieren nur den Katalog, wie es der Skill in Abschnitt 3 vorsieht. Sie schreiben weder Rohdateien noch Angebote; extrahiert wird ausschließlich über `pnpm pipeline nightly`.

Verworfen:
- **Bootstrap mit mehr Suchbegriffen:** scheitert an denselben Gründen.
- **Adress-Regel lockern:** führt zu geratenen Orten.

### E2 – Folgeseiten im Abruf: `Programme.follow`

**Zuerst messen (S0, M1).** Für jeden der fünf Träger und jede geplante Kategorie wird geklärt:
- (a) Gibt es eine Ansicht mit allen Kursen auf einer Seite und stabiler URL, etwa einen Parameter für die Seitengröße, eine Druck- oder Listenansicht oder die Stichwortsuche?
- (b) Wenn nicht: Steht der Link zur Folgeseite im statischen HTML (`pnpm pipeline fetch-page <url> --links` zeigt ihn) oder kommt er erst per JavaScript?
- (c) Reicht eine feinere Kategorie für eine einzige Seite?
- (d) Wie viele Zeichen hat jede Seite laut `fetch-page`, und wie groß wird die Summe je Träger über alle geplanten Programmseiten und Folgeseiten? `MAX_INPUT_CHARS` (350 000) gilt je Anbieter, nicht je Programmseite (`assembleProvider` in `scripts/pipeline/lib/fetch.ts`). Regel: Summe höchstens ≈ 250 000 Zeichen. Sonst kommen nur die Kategorien für 0–3 in den Katalog, oder `max` wird kleiner.

Das Ergebnis entscheidet je Kategorie:
- **(a)** Die Programmseite bekommt die URL der Gesamtansicht, und `references/booking-systems.md` nennt sie.
- **(c)** Die Programmseiten werden feiner geschnitten.
- **(b) mit Link im statischen HTML:** `follow`.
- **(b) mit Link nur per JavaScript:** Die Kategorie wird mit `render: browser` als Einzelseite geprüft. Fehlt dann weiter etwas, notiert der Abschnitt „Umsetzung“ den Rest; `follow` mit `render` ist nicht Teil dieses Plans.

Braucht keine Kategorie (b), entfällt `follow` samt Schemaänderung.

Sonst bekommt `Programme` (`src/domain/schema.ts`) ein optionales Feld:

```ts
follow: z.strictObject({
  /** Teilstring der URL der Folgeseite, etwa "browse=forward" */
  match: z.string().min(3),
  /** höchstens so viele Folgeseiten */
  max: z.int().min(1).max(40),
}).optional()
```

- **Schema.** Zulässig nur bei `kind: "html"` ohne `render`; sonst meldet `superRefine` einen Fehler mit Pfad. Danach folgt der Export (`pnpm schema:export`).
- **Plan des Abrufs.** `PageTask` (`scripts/pipeline/lib/select.ts`) nimmt `follow` auf, und `planFetch` gibt es weiter.
- **Abruf** (`scripts/pipeline/io/fetch-inputs.ts`):
  - `fetchTask` liefert für HTML zusätzlich die Links der Seite aus `extractPage` (`scripts/pipeline/lib/html-extract.ts`).
  - Nach jeder Seite sucht `nextPageUrl(links, follow, seen)` den ersten Link derselben Website, dessen URL `match` enthält und der noch nicht abgerufen ist. Die reine Funktion liegt in `scripts/pipeline/lib/fetch.ts` und entsteht test-first.
  - Der Abruf folgt bis `max` Seiten oder bis kein solcher Link mehr da ist.
  - Die Texte werden in Reihenfolge zu einer Seite verbunden, getrennt durch `--- Folgeseite <n> ---`. `finalUrl` bleibt die der ersten Seite.
- **Fehler.** Fehlt eine Folgeseite (HTTP-Fehler, Zeitlimit), gilt die ganze Programmseite als fehlgeschlagen, wie heute eine einzelne. Der Einbruchschutz des Nachtlaufs hält dann den Bestand. Ein halber Text ließe Kurse verschwinden.
- **Grenzen.** Der Eingabe-Hash gilt für den verbundenen Text. `MAX_INPUT_CHARS` (350 000) gilt für die Summe aller Seiten eines Anbieters; jede Folgeseite bringt Navigation und Fußzeile mit. Darum gilt die Regel aus (d). `splitInput` (`scripts/pipeline/lib/split.ts`) teilt große Eingaben in Teile zu 25 000 Zeichen, also einen Modellaufruf je Teil. Große Listen wie die 32 Seiten von ASG werden auf die Unterkategorien für 0–3 beschränkt.
- **Pflege.** `pnpm pipeline fetch-page <url> --follow <match> [--max N]` zeigt dasselbe.
- **Entdecken.** Der Ertragsbeweis nutzt denselben Abruf und bekommt `follow` damit mit. Das Bewerten setzt `follow` nicht; das Feld kommt nur von Hand.
- **ADR und Code-Kommentare.** ADR 0026, Punkt 2 sagt „Links werden nie verfolgt; einzige Ausnahme ist das Bewerten …“. Er bekommt einen Nachtrag: Die zweite Ausnahme sind die Folgeseiten derselben Liste, ausdrücklich im Katalog mit `follow` und Höchstzahl. Der Katalog nennt weiter jede Programmseite, an der eine Liste beginnt. Die Statuszeile von ADR 0026 bekommt „Ergänzt durch Plan 0042“. Dazu kommen ein Nachtrag zu ADR 0025, Punkt 3 (`follow` als Abruffeld wie `render` und `request`), die Kommentare an `PageTask` (`scripts/pipeline/lib/select.ts`) und in `scripts/pipeline/lib/fetch.ts` sowie `references/catalog.md`, Zeile 36 („Links folgt der Crawler nie“).

Verworfen:
- **Kufer-Adapter:** Ein Adapter gehört zur Rolle `aggregator` (ADR 0025, Punkt 6). Die Träger sind aber `anbieter` mit eigener Programmseite, und ein Adapter je Buchungssystem verdoppelte den Abruf.
- **Feste Cursor-URLs je Folgeseite:** veralten mit jedem neuen Kurs.

### E3 – Orte der Kufer-Träger von Hand, mit `Venue.hint`

- **Orte.** Jeder Kursort bekommt einen `venues`-Eintrag mit vollständiger Adresse und Koordinaten aus `pnpm pipeline geocode "<Adresse>"`. Die Gemeinde muss Düsseldorf sein (Skill, Abschnitt 6, „Gemeinde-Prüfung“).
- **Hinweis.** `Venue.hint` nennt die Bezeichnung, unter der die Liste den Ort führt. Beispiele:
  - KWD: „Fronberghaus, alle Räume (Raum 004, 008 …)“
  - AWO: „in der Kursliste ‚Derendorf‘ bzw. ‚Familientreff Derendorf‘“
  - DRK: „Tellerringstr. 56 / Bürgerhaus Benrath“
- **Quellen für Adressen.** Zuerst die Website des Trägers: Detailseite, Kontakt, „Unsere Häuser“. Fehlt die Adresse dort, darf der Navigator als Fundstelle dienen (`AdStr`, `AdPlz`). Eine Adresse ist eine Tatsache, kein geschützter Text. Geprüft wird sie trotzdem per Geocoding.
- **Lesart.** Eine Zeile zu Kufer kommt nach `references/booking-systems.md`: Kursbeginn plus „N Termine“ ergibt eine Wochenreihe mit `skipHolidays`; die Ampel steht im Text von `fetch-page`; Folgeseiten laufen nach M1.
- **Programmseiten** bekommen nur dann einen `hint`, wenn der Trockenlauf es verlangt; ein `hint` ändert den Eingabe-Hash. Prompt-Änderungen am Extraktor sind nicht vorgesehen.

### E4 – Ziele und Größen

- **Ziel 1 und `site.json`.** Ziel 1 (≥ 40 Anbieter, ≥ 300 Angebote) ist etwa die Hälfte des geschätzten Bestands. Nach der Hochrechnung bleibt `site.json` damit bei ≈ 180 kB gzip, unter der Schwelle von 200 kB aus `docs/ideas.md`.
- **Messung im Probe-Build.** `nightly --dry-run` schreibt nach `runs/<heute>/`, `pnpm build` liest aber `data/`. Deshalb läuft der **Probe-Build** in einem Wegwerf-Worktree (S2, Schritt 7):
  1. `git worktree add --detach "$CLAUDE_JOB_DIR/tmp/probe" HEAD`. S1 muss dafür committet sein, denn `Programme` ist ein `strictObject` und lehnt `follow` sonst ab.
  2. dort `pnpm install --frozen-lockfile --offline`
  3. aus allen Trockenläufen die Düsseldorfer Rohdateien `runs/<tag>/raw/<id>.json` nach `data/raw/` kopieren, ebenso den aktuellen `data/providers.yaml`
  4. `pnpm pipeline nightly --build-only` baut daraus `data/offers.json`
  5. `pnpm build && pnpm size`. `build` ruft `data:build` selbst auf; gemessen werden alle Budgets und die Linien-Gates.
  6. Für den `/browser-review`: `pnpm preview` im Wegwerf-Worktree, freier Port per `--port`
  7. am Ende `git worktree remove --force`

  Der Wegwerf-Worktree committet nie. Er ist auch die Grundlage für den `/browser-review` mit echten Düsseldorfer Daten (S2, Schritt 8).
- **Anhalten.** Überschreitet ein Wert die Grenze aus Ziel 5, hält die Umsetzung an und fragt den Nutzer. Optionen je nach Wert:
  - weniger Anbieter oder Programmseiten
  - Budget mit Begründung anheben; das ist bei `anbieter.json` naheliegend, weil die Datei erst mit dem Anbieter-Tab lädt
  - eigener Plan zum Teilen, für `site.json` (`docs/ideas.md`)
  - bei `MAX_WITHOUT_LINES`: Orte ohne Linie prüfen, dann nachmessen wie im Skill, Abschnitt 6
- **`data/offers.json`.** Bei ≈ 2,5 kB je Angebot sind es ≈ 2,0 MB nach 300 neuen Angeboten und ≈ 2,7 MB nach 600, beides unter 4 MiB. Das Gate bei 75 % aus `docs/ideas.md` („`data/offers.json` je Region teilen“) bleibt dort.

### E5 – Folgeplan: Navigator als Fundquelle des Entdeckens

**Aufgegangen in Plan 0045** (`docs/plans/0045-entdecken-vollstaendig.md`, 2026-10-25), E2: Adapter `navigator` als einer von mehreren Verzeichnis-Adaptern.

Der Navigator kennt ≈ 40 Träger mit Website und wäre für ≈ 70 NRW-Kommunen nutzbar. Nach N1 schreibt die Umsetzung einen eigenen Plan „Verzeichnis mit Adapter“. Die Skizze steht in `docs/ideas.md` unter „Weitere Regionen“:
- `role: verzeichnis` mit `adapter` (neues ADR, weil ADR 0025, Punkt 6 das heute ausschließt). Der Nachtlauf ruft ein Verzeichnis nie ab, es entsteht also keine Wiedergabe.
- Der Adapter übernimmt nur Name, Website und Anzahl.
- Funde bekannter Websites werden zum Hinweis statt zum Kandidaten. Sonst entstünden Dubletten von efa oder DRK unter Portalnamen; der Vorfilter vergleicht heute nur URL und „Host plus ähnlicher Name“.
- Der Vorfilter läuft vor `MAX_DIRECTORY_FINDS`; heute greift die Grenze zuerst.
- Der Adapter warnt, wenn die Trefferzahl dem `limit` entspricht.

### E6 – Portal-Funde aussortieren, PDF vor Browser

- **Portale und Stadtseiten über `abgelehnt`, ohne neuen Code.** `data/discover/duesseldorf.json` bekommt `abgelehnt`-Einträge mit `host`: `fruehehilfen-online.nrw.de`, `guterstart.nrw.de`, `guter-start.nrw.de`, `kindaling.de` und `duesseldorf.de`.
  - Erlaubt ist das nach CLAUDE.md, denn `abgelehnt` ist der einzige Teil von `data/discover/`, den ein Mensch pflegt.
  - `prefilter` vergleicht Hosts ohne `www.` und auch als Subdomain (`host === h || host.endsWith(".h")`, `scripts/pipeline/lib/discover.ts`). `abgelehnt` gilt über alle Regionen.
  - Der Eintrag `duesseldorf.de` trifft auch Subdomains der Stadt (`familien-navigator.duesseldorf.de` leitet nur weiter). Fremde Hosts wie `duesseldorf.kita-navigator.org` trifft er nicht.
  - Jeder Eintrag hat einen `grund` („Sammelportal, Einträge sind Einzel-PDFs; Träger stehen im Katalog“ bzw. „robots.txt sperrt fremde Crawler, Plan 0042, E7“) und `datum`.
  - Die Datei gibt es auf dem Branch noch nicht. Sie entsteht mit `region: duesseldorf`, diesen Einträgen und `zurueckgestellt: []` nach dem Schema `DiscoverState` (`scripts/pipeline/lib/discover-state.ts`). `pnpm data:validate` prüft sie.
- **Kein neuer Vorfilter.** Eine Vorfilter-Regel „Website eines Verzeichnisses oder Sammelkalenders“ würde in Nürnberg echte Anbieter verwerfen, etwa die auf `www.nuernberg.de` neben dem Stadtkalender. Der Host-Eintrag in `abgelehnt` ist genau und schon getestet.
- **PDF vor Browser.**
  - `fetchTask` prüft `kind === "pdf"` vor `render`.
  - `entryFromAssessment` (`scripts/pipeline/lib/discover.ts`) übernimmt `render` nur bei `kind: html`.
  - Das Schema lehnt `render` bei `kind: pdf` ab (`superRefine` an `Programme`), damit auch der Handkatalog die Kombination nicht setzen kann. Heute nutzt sie kein Eintrag (geprüft 2026-10-18). Damit ist S1 in jedem Fall eine Schemaänderung.

### E7 – Was draußen bleibt

- **Quellen auf `duesseldorf.de`.** Stadtbüchereien, Familien- und Stadtteiltreffs, Seiten der Jugendförderung und das Theatermuseum bleiben draußen, solange die Pipeline robots.txt nicht beachtet (N3).
  - Das Entdecken sperrt sie über E6, die Pflege über `references/excluded.md` mit Begründung.
  - Andere Hosts der Stadt (`duesseldorf.kita-navigator.org`, `baeder-duesseldorf.de`) prüft das Paket einzeln auf ihre robots.txt.
- **Anbieter ohne veröffentlichte Termine und ohne festen Wochenplan.** Die Bestandsaufnahme zählt ≈ 20, meist Hebammen, Studios und Schwimmschulen. Es gilt wie in Nürnberg: aufnehmen mit `skipCrawl`, wenn der Anbieter für die Anbieterübersicht taugt (ADR 0025, Punkt 8), sonst `references/excluded.md`.
- **Gastspiele und reine Raumvermieter** (Barber's Puppentheater, mammeno), sofern nichts Regelmäßiges dahinter steht.
- **Nachbarstädte.** Ein Ort außerhalb der Gemeinde Düsseldorf kommt nicht in den Katalog, auch nicht als zweiter Ort eines Düsseldorfer Trägers. Bei der Deutschen Oper am Rhein zählt nur das Opernhaus Düsseldorf.
- **Doppelte Kurse.** Nennen zwei Träger denselben Kurs (Diakonie-Familienzentren und efa, etwa Am Hackenbruch), kommt er beim veranstaltenden Träger in den Katalog, die zweite Seite nicht.

### E8 – Pakete und Arbeitsweise der Subagenten

Fünf Pakete; die Zeilennummern beziehen sich auf die Tabelle im Anhang:

| Paket | Inhalt | Anhang-Zeilen | Modell, Aufwand |
|---|---|---|---|
| P1 Kufer | efa, DRK, ASG, AWO, KWD | 1–5 | Sonnet, hoch; je Träger ein Subagent, nach S1 |
| P2 Treffs und Träger | Kinderschutzbund, Diakonie-Treffs, Caritas, SOS-Kinderdorf, städtische Familienzentren (nur außerhalb von `duesseldorf.de`), SKFM, kath. Familienzentren, AGB, VAMV, kleine freiheit | 6, 10, 14–18, 75–77 | Sonnet, mittel |
| P3 Hebammen und Kursräume | Geburtshaus (hebamio), Krügel, YogaKitchen, Familieninstitut vom Heede, Familienbegleitung, Düssel Mami, EVK-Elternschule und -Familiencafé, UKD, Bullerbü, herz und sinn, fit4mom, Mama macht, Rademacher, Hebavit, Hebammenpraxis 37, Rheinbay, Yoga-Studios, buggyFit | 7–9, 12, 30–46 | Sonnet, mittel |
| P4 Bewegung, Wasser, Musik | Bäder und Schwimmschulen, Zwergenstube, Sportvereine, Musikschulen, kiwifalter, Sinneswandel, Happy Kids, BabyBee, Motte | 13, 25–29, 47–69 | Sonnet, mittel |
| P5 Kultur und Kirchen | Tonhalle, Kunstpalast, Schauspielhaus, Oper, Puppentheater Helmholtzstraße, ev. Gemeinden (evdus.de), kath. Pfarreien außerhalb des ASG, Musenkuss als Verzeichnis | 19, 20, 22–24, 70–74 | Sonnet, mittel |

Regeln für jeden Subagenten, im Auftrag wörtlich mitzugeben:
1. **Lesen:** `references/catalog.md`, `references/booking-systems.md`, `references/excluded.md`, Skill Abschnitte 3 und 6 („Gemeinde-Prüfung“), die Anhang-Zeilen des Pakets und als Muster für einen großen Träger den Nürnberger Eintrag `fbs-nuernberg` in `data/providers.yaml`.
2. **Je Anbieter:**
   - Programmseiten mit `pnpm pipeline fetch-page <url> --links` prüfen, bei Kufer nach dem Ergebnis von M1.
   - Einen Eintrag **ohne `publicId` und ohne `geo`** in die Paketdatei `runs/<heute>/katalog-0042/<paket>.yaml` schreiben, mit `region: duesseldorf` und `verified: <heute>`.
   - Adressen vollständig mit PLZ und Ort angeben, dazu die Quelle der Adresse.
3. **Nicht geocodieren.** Fünf parallele Agenten würden Nominatim mit etwa 5 Anfragen je Sekunde treffen; die Drossel gilt nur je Prozess (`scripts/pipeline/io/geocode.ts`). Dazu kämen gleichzeitige Schreibzugriffe auf den Cache. Die Haupt-Session geocodiert bei der Übernahme nacheinander und prüft dabei die Gemeinde.
4. **Nicht in `data/` schreiben.** Die Haupt-Session übernimmt die Einträge einzeln nach `data/providers.yaml` und setzt je Eintrag die `publicId`, die `pnpm data:validate` nennt (ADR 0022). So vergeben parallele Agenten keine doppelten IDs.
5. **Ausschlüsse:** abgelehnte Anbieter mit Grund in der Paketdatei, Abschnitt `ausgeschlossen`. Die Haupt-Session überträgt sie nach `references/excluded.md`.
6. **Höflich abrufen:** wenige Abrufe je Website, keine Schleifen über Detailseiten, wenn die Liste reicht.

Die Haupt-Session prüft je Paket zwei Einträge selbst gegen die Website: Orte, Alter und Programmseiten.

## Nutzerentscheide (2026-10-24: alle Empfehlungen angenommen)

Der Nutzer hat N1–N5 am 2026-10-24 wie empfohlen entschieden: N1 ja (Folgeplan, nur Name, Website, Anzahl), N2 ein gemeinsamer Push mit Nachtlauf per Hand, N3 `duesseldorf.de` bleibt draußen, N4 Ziele wie im Abschnitt „Ziel“, N5 `ENTDECKEN_MODUS` nach Abnahme aus S3.3 unverändert.


- **N1 – Navigator als Fundquelle** (Folgeplan, E5). Empfehlung: ja, mit Name, Website und Anzahl, ohne Texte und Termine. Alternative: zusätzlich bei der Redaktion anfragen (familien-navigator@duesseldorf.de), ob Termine übernommen werden dürfen.
- **N2 – Live-Gang.** Empfehlung: Plan 0039 und der gefüllte Katalog gehen in einem Push live, gleich danach der Nachtlauf per Hand mit angehobenen Bremsen (S4).
  - `data/offers.json` entsteht nur im Nachtlauf (ADR 0026). Bis er durch ist (≈ 30–60 Min.), zeigt die Düsseldorf-Kachel den Zustand „Netz ohne Angebote“ aus Plan 0039.
  - Schafft der Lauf nicht alle Anbieter, füllt sich Düsseldorf über 2–3 Nächte; der Einbruchschutz betrifft nur Anbieter mit Bestand.
  - Alternative: Plan 0039 zuerst leer live.
- **N3 – Quellen auf `duesseldorf.de`** (E7). Empfehlung: draußen lassen, bis ein eigener Plan robots.txt und User-Agent regelt.
- **N4 – Ziele.** Empfehlung wie im Abschnitt „Ziel“: ≥ 40 Anbieter, ≥ 300 Angebote, ≥ 80 % Abdeckung.
- **N5 – `ENTDECKEN_MODUS` beim Push** (nur, falls die Variable auf `live` steht). Sie gilt für `vgn` und `vrr` zugleich. Empfehlung: nach der Abnahme aus S3.3 live lassen; die Funde des Trockenlaufs sind dann bekannt, und der Vorfilter kennt den Katalog. Alternativen: vorübergehend `trocken` (trifft auch Nürnberg und Fürth) oder erst nach dem Samstagslauf pushen.

### Nutzerentscheide 2026-10-24 (nach dem Probe-Build, E4 „Anhalten“)

- **N6 – `site.json` (235,5 kB gzip im Probe-Build, Schwelle 200 kB):** erst teilen, dann live. Plan 0039 und dieser Katalog gehen erst nach dem Plan „`site.json` je Gebiet teilen“ (Plan 0044) live. S4 wartet darauf.
- **N7 – Budget `Linien-Daten vrr`** (45,7 kB gzip gegen 40 kB): auf **48 kB** angehoben. Die Datei lädt nur, wenn eine Stadt im Netz vrr gewählt ist; VRR hat mehr Orte (91) als VGN (82) und 1 237 Linienfolgen.

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/io/fetch-inputs.ts` | PDF vor `render`; mit `follow`: Links aus `extractPage`, Folgeseiten abrufen und verbinden | S1 |
| `scripts/pipeline/lib/discover.ts` | `entryFromAssessment`: `render` nur bei `kind: html` | S1 |
| `data/discover/duesseldorf.json` (neu) | `abgelehnt` mit fünf Hosts (E6) | S1 |
| `src/domain/schema.ts`, `schema/*.json` | `render` nicht bei `kind: pdf`; mit `follow`: `Programme.follow`; Export per `pnpm schema:export` | S1 |
| `scripts/pipeline/lib/select.ts` | nur mit `follow`: `PageTask` mit `follow`, Kommentar | S1 |
| `scripts/pipeline/lib/fetch.ts` | nur mit `follow`: `nextPageUrl` (rein), Kommentar | S1 |
| `scripts/pipeline/cli.ts` | nur mit `follow`: `fetch-page --follow` | S1 |
| `scripts/pipeline/io/fetch-inputs.test.ts` (neu), `scripts/pipeline/lib/fetch.test.ts`, `scripts/pipeline/lib/discover.test.ts`, `scripts/pipeline/lib/select.test.ts` (falls vorhanden, sonst im nächsten Test von `planFetch`), Schema-Test von `Programme` | Tests 1–6 | S1 |
| `docs/adr/0026-daten-automatisch.md`, `docs/adr/0025-katalog-crawlbar-und-regionsfaehig.md` | nur mit `follow`: Nachträge und Statuszeile (E2) | S1 |
| `docs/architecture.md` | nur mit `follow`: Abruf nennt `follow` | S1 |
| `data/providers.yaml` | ≥ 40 Anbieter mit `region: duesseldorf` | S2 |
| `.claude/skills/babyevents-nuernberg/references/booking-systems.md` | Zeile Kufer; hebamio und ebusy prüfen | S2 |
| `.claude/skills/babyevents-nuernberg/references/excluded.md` | Düsseldorfer Ausschlüsse mit Grund | S2 |
| `.claude/skills/babyevents-nuernberg/references/catalog.md` | „heute nur `nuernberg`“ (Zeile 11) berichtigen; `render` nicht bei PDF; mit `follow` das Feld und Zeile 36 | S1, S2 |
| `evals/results.md` | Zeile „Entdecken“ Düsseldorf | S3 |
| `docs/ideas.md` | Skizze E5 unter „Weitere Regionen“ (mit diesem Plan committet); Restpunkte aus „Nicht-Ziele“ | Plan, S6 |

## Tests (test-first für Pipeline-Logik)

1. **`nextPageUrl`** (nur mit `follow`): findet den Link mit `match` auf derselben Website, überspringt schon abgerufene Seiten, ignoriert fremde Hosts und liefert am Ende `undefined`. Fixture: zwei gekürzte Kufer-Listen als HTML-Ausschnitt, mit fiktiven Kursen und echtem Linkmuster `…/kategorie/1378?knr=2602623003&browse=forward`.
2. **Abruf mit `follow`** (nur mit `follow`): neue Datei `scripts/pipeline/io/fetch-inputs.test.ts` mit `vi.mock("./http.ts")`, denn `fetchInputs` hat keine Deps-Injektion. Geprüft wird:
   - Drei Seiten werden in Reihenfolge verbunden; mit `max: 2` sind es zwei.
   - Ein HTTP-Fehler auf Seite 2 lässt die Programmseite fehlschlagen.
   - Der Eingabe-Hash ändert sich, wenn sich Seite 2 ändert.
   - Übersteigt der verbundene Text `MAX_INPUT_CHARS`, meldet der Anbieter „Eingabe zu groß“ wie heute eine einzelne Seite.
3. **Schema:** `render` bei `kind: pdf` ist ein Fehler mit Pfad. Mit `follow` zusätzlich: `follow` bei `kind: pdf` oder zusammen mit `render` ist ein Fehler mit Pfad, `follow` bei `kind: html` ist gültig.
4. **`entryFromAssessment`** (`scripts/pipeline/lib/discover.test.ts`): Eine Bewertung mit `kind: pdf` und `render: "browser"` ergibt einen Eintrag ohne `render`.
5. **`fetchTask`:** Ein PDF mit `render: "browser"` geht an `pdftotext`, und `artOf` (`scripts/pipeline/lib/fetch.ts`) meldet `pdf`, nicht `browser`. Das steht in der Testdatei aus Test 2, mit gestubbtem `execFile`. Braucht keine Kategorie `follow`, entsteht die Datei nur für diesen Test. Das Schema verbietet die Kombination zwar (Test 3), der Abruf soll aber auch einen ungeprüften Eintrag richtig behandeln.
6. **`data/discover/duesseldorf.json`:** `pnpm data:validate` prüft nur die Form; ein Tippfehler im Host fiele durch. Darum liest ein Unit-Test (bei den Tests von `prefilter` in `scripts/pipeline/lib/discover.test.ts`) die echte Datei und prüft mit `prefilter`:
   - `https://www.guterstart.nrw.de/fhiangebot/exportpdf/id/1`, `https://www.duesseldorf.de/stadtbuechereien/` und `https://familien-navigator.duesseldorf.de/` fallen weg.
   - `https://duesseldorf.kita-navigator.org/` bleibt.
   - Der Test liest Daten, darum zählt für „fertig“ `pnpm verify`, nicht `vitest related` (CLAUDE.md).
7. **Lokale Gates je Schritt:**
   - S1: `pnpm verify` und `pnpm e2e:local --affected` (`run_in_background`), weil S1 das Schema ändert.
   - S2: `pnpm verify` und `pnpm e2e:local --affected --smoke`, weil `data/providers.yaml` Daten ist (CLAUDE.md, „Lokal prüfen“).
   - S3: `pnpm verify` nach der Zeile in `evals/results.md` (Stufe C).
   - Die Auswahl zeigt vorher `node scripts/e2e-select.ts`.
8. **UI:** Es ändert sich kein Code der UI, wohl aber die Datenlage für Düsseldorf. Deshalb gibt es vor dem Live-Gang einen `/browser-review` im Probe-Build mit echten Düsseldorfer Daten (S2, Schritt 8):
   - Liste und Karte bei 320 px und auf Pixel 7, hell und dunkel
   - lange Orts- und Kursnamen
   - Dichte der Karte in der Innenstadt
   - Anbieter-Tab mit 40+ Einträgen
   - Stadtteile und Wegzeiten mit VRR

## Schritte

Alles läuft auf Branch `plan-0039` im Worktree `.claude/worktrees/plan-0039`. Vorher kommt `git fetch && git rebase origin/main`. Konflikte drohen in `data/offers.json`, `data/raw/`, `data/kosten.csv` und `data/providers.yaml`; Hinweise dazu stehen im Übergabe-Abschnitt von Plan 0039.

- **S0 – Messungen ohne Modell.** Die Ergebnisse kommen in diesen Plan, Abschnitt „Umsetzung“.
  - **M1:** Kufer-Ansichten je Träger und Kategorie (E2, Fragen a–c).
  - **M2:** je Kufer-Träger eine Kategorie vollständig zählen, über alle Folgeseiten im Browser oder mit curl. Das ist das Soll für Ziel 3.
- **S1 – Abruf.**
  1. E6: PDF vor Browser, `entryFromAssessment`, `data/discover/duesseldorf.json`.
  2. E2 nur, wenn M1 es verlangt.
  3. Tests 1–5, Gates aus Test 7, Doku.
  4. `/arch-review` (Schemaänderung).
  5. Commit, damit der Probe-Build in S2 darauf aufsetzen kann.
- **S2 – Katalog.**
  1. P1 mit fünf Subagenten parallel, danach P2–P5 mit je einem Subagenten parallel (E8).
  2. Übernahme Eintrag für Eintrag, mit Geocoding und `pnpm data:validate` nach jedem.
  3. Ertragsbeweis gebündelt je Paket: `pnpm pipeline nightly --only <ids des Pakets> --dry-run`.
     - Ein Lauf je Paket, weil jeder Lauf alle Sammelkalender abruft (`scripts/pipeline/lib/select.ts`).
     - Wegen des neuen Cache-Schlüssels nie ohne `--only`. Eine Wiederholung nach einer Korrektur läuft nur mit `--only <geänderte id>`, denn der Cache kommt nur aus `data/raw`.
     - Jeder Lauf überschreibt `nightly.json` und `offers.json` in `runs/<heute>/`. Gezählt wird darum sofort nach dem Lauf (Schritt 6), und die Rohdateien `runs/<heute>/raw/<id>.json` werden für den Probe-Build gesichert.
  4. Kufer-Stichprobe für Ziel 3: 10 Kurse gegen ihre Detailseiten.
  5. Nachträge in `booking-systems.md` und `excluded.md`.
  6. Angebote je Paket zählen, sofort nach dem Lauf: aus `runs/<heute>/offers.json`, über `providerId` gegen den Katalog, denn Angebote tragen keine Region.
  7. Probe-Build nach P1 und nach dem letzten Paket (E4). Liegt ein Wert über der Grenze aus Ziel 5: anhalten, Nutzer fragen.
  8. `/browser-review` im Probe-Build nach dem letzten Paket (Test 8).
- **S3 – Messen.**
  1. **Abdeckung gegen den Navigator** (Ziel 2): ein Wegwerf-Skript im Job-Verzeichnis, nicht im Repo. Es filtert die Einträge aus dem Endpunkt (0–3, ohne Medizin und Beratung, künftiges Ende oder dauerhaft) und vergleicht die Website je Eintrag mit den Websites der Düsseldorfer Katalogeinträge.
  2. **Entdecken-Eval** (Ziel 4): `pnpm pipeline discover --region duesseldorf --dry-run --hide <10 ids>`, mit 5 Navigator-Trägern und 5 reinen WS-Funden (Skill, Abschnitt 4). Ergebnis als Zeile in `evals/results.md`.
  3. **Entdecken-Trockenlauf ohne `--hide`:** Was nimmt der Samstagslauf neu auf? Der Nutzer nimmt den Bericht vor dem Push ab (S4.0, N5).
- **S4 – Live** (gemeinsam mit S11 von Plan 0039).
  0. `gh variable get ENTDECKEN_MODUS` prüfen. Die Variable gilt für beide Netze (`.github/workflows/discover.yml`). Steht sie auf `live`, entscheidet der Nutzer nach N5.
  1. Rebase, `pnpm verify`, gezielte E2E wie in Plan 0039.
  2. Push auf `main`, CI beobachten (`gh run watch <id> -i 120 --exit-status`).
  3. Nachtlauf per Hand, tagsüber gleich nach dem Deploy: `gh workflow run nightly.yml -f modus=live -f max_calls=300 -f max_tokens=10000000 -f budget_min=70`.
     - `budget_min` bleibt unter dem Job-Limit `timeout-minutes: 90` (`.github/workflows/nightly.yml`) abzüglich der Einrichtung. Nur so endet der Lauf geordnet über das Zeitbudget (ADR 0026, Punkt 6) und veröffentlicht, was fertig ist.
     - `max_calls` und `max_tokens` prüft die Umsetzung vorher gegen die Summe der Paketläufe aus S2.3.
     - Was nicht fertig wird, holen die nächsten Nächte nach, mit den Standardbremsen (150 Aufrufe, Cron 01:30 UTC). Düsseldorf füllt sich dann über 2–3 Nächte (N2).
  3a. **Rücknahme**, falls nach dem Daten-Commit `MAX_WITHOUT_LINES` oder ein Budget rot wird. Der Commit liegt dann schon auf `main` und sperrt jeden weiteren Deploy, auch für Nürnberg. Weg:
     - die betroffenen Anbieter in `data/providers.yaml` mit `skipCrawl` (Grund, Datum) ruhen lassen oder den Ort ohne Linie korrigieren
     - `pnpm pipeline nightly --build-only` baut `data/offers.json` neu, ohne Hand-Merge
     - Commit und Push, CI beobachten
  4. Danach `pnpm size` für `site.json` und `wegzeit/vrr.json`.
  5. `/browser-review live` mit Düsseldorf.
  6. `meta.json` zeigt den neuen Commit.
- **S5 – Folgeplan.** Mit N1 = ja: Plan „Verzeichnis mit Adapter“ nach der Skizze E5 schreiben und `/plan-review`. Das gehört nicht zur Fertig-Definition dieses Plans.
- **S6 – Archiv.** Restpunkte nach `docs/ideas.md`, dann Plan 0042 und Plan 0039 archivieren (CLAUDE.md, Schritt 7).

## Verifikation

- `pnpm verify` grün nach S1 und S2, dazu die Gates aus Test 7.
- **Ziel 1:** Summe der Düsseldorfer Angebote aus den Paketläufen ≥ 300, bestätigt im Probe-Build.
- **Ziel 2:** Abdeckung ≥ 80 % aus S3.1, mit der Liste der nicht abgedeckten Träger im Abschnitt „Umsetzung“.
- **Ziel 3:** Kufer-Stichprobe gegen das Soll aus M2.
- **Ziel 4:** Eval-Zeile in `evals/results.md`. Der Trockenlauf aus S3.3 bewertet kein Portal-PDF und keine Seite auf `duesseldorf.de`.
- **Ziel 5:** Probe-Build mit `pnpm size` und grünen Linien-Gates, nach dem Nachtlauf noch einmal live.
- **Nach dem Live-Gang:** `/browser-review live`; Düsseldorf erscheint in Liste, Karte und Stadtteilen.

## Kosten (Modell, Schätzung API-Gegenwert)

| Posten | Schätzung |
|---|---|
| Ertragsbeweise je Paket, ≈ 45 Anbieter; Kufer-Träger mit großen Eingaben in Teilen zu 25 000 Zeichen | $2–5 |
| Wiederholungen nach Korrekturen an Programmseiten oder `hint` | $1–2 |
| Entdecken-Eval und Entdecken-Trockenlauf Düsseldorf | ≈ $2 |
| Erster Nachtlauf live: alle Bestandsanbieter wegen des neuen Prompts aus Plan 0039 (≈ $0,60) plus die neuen | $2–4 |
| Summe einmalig | ≈ $7–13 |
| Mehrbedarf je Nacht danach: Die Ampel der Kufer-Listen ändert den Eingabe-Hash oft, und ein geänderter Träger wird mit allen Teilen neu extrahiert. Bei ≤ 250 000 Zeichen sind das ≤ 10 Teile je Träger, für fünf Träger also bis zu 50 Aufrufe von 150 | grob $0,20–0,60 je Nacht; nach einer Woche in `data/kosten.csv` nachmessen. Reicht `MAX_CALLS` nicht, kommt das in den Bericht des Nachtlaufs |

Die Subagenten der Recherche laufen in der Claude-Code-Session; sie sind im Posten oben nicht enthalten.

## Risiken

- **Kufer ändert die Folgeseiten-Links** (Parameter, Linktext): `follow` findet dann keine Folgeseite mehr, und die Liste schrumpft auf Seite 1. Der Einbruchschutz des Nachtlaufs meldet den Rückgang. `match` ist ein Teilstring und darum robuster als eine ganze URL.
- **Große Eingaben** (efa, DRK): Haiku lässt bei langen Listen Kurse aus; in Nürnberg kam das bei `studio-herzschlag` vor (Skill, Abschnitt 3).
  - Gegenmittel sind Unterkategorien statt der Gesamtliste.
  - Ziel 3 misst das.
  - Sonst ein Eval-Fall nach Skill, Abschnitt 4 (`--kind html,gross`).
- **Bremsen im ersten Live-Lauf:** siehe N2 und S4.3. Rot wegen „Bremse“ heißt: Es fehlen Anbieter, keine falschen Daten.
- **Linien-Gate `vrr`:** Liegen viele Kursorte ohne Haltestelle in Reichweite, wird `MAX_WITHOUT_LINES` rot, und es gibt keinen Deploy. Der Probe-Build in S2.7 zeigt das vor dem Push. Dann wird nachgemessen, wie es der Skill in Abschnitt 6 vorsieht.
- **Größe:** Wird `site.json` zu groß, verschiebt sich der Live-Gang auf den Plan „`site.json` je Gebiet teilen“ (Ziel 5).
- **Samstagslauf live:** Steht `ENTDECKEN_MODUS` auf `live`, nimmt das Entdecken nach dem Push Düsseldorfer Anbieter ohne Abnahme auf. S3.3 nimmt den Trockenlauf vorher ab, S4.0 und N5 regeln die Variable.
- **Rechtliches beim Navigator:** In diesem Plan dient er nur als Fundstelle für Adressen und als Messlatte (Ziel 2). Im Repo wird nichts aus ihm gespeichert.

## Umsetzung

### S0 – Messungen (2026-10-24, ohne Modell)

M1 (Subagent mit `fetch-page`, curl; Rohdaten unter dem Job-Verzeichnis, nicht im Repo):
- **Keine Gesamtansicht (Fall a) bei keinem Träger.** Feste Seitengröße (efa, DRK, KWD 25 Kurse; ASG 7). `pagesize`, `limit`, `anzahl`, `browse=all`, `print` u. a. ändern nichts; die efa-Stichwortsuche ist ebenso auf 25 begrenzt; `programm.asg-bildungsforum.de` leitet auf die Startseite.
- **Fall (b) mit statischem Link** bei efa, DRK, ASG und KWD: `<kategorie>?knr=<letzter Kurs>&browse=forward`, gleicher Host, relativ im HTML. Kein Folgelink nur per JavaScript. `cHash` hat nur AWO, nicht KWD (Annahme im Anhang falsch).
- **AWO** braucht kein `follow`: jede Kategorie liegt auf einer Seite.
- **Zeichen je Träger** (alle unter 250 000): efa ≈ 38 000 (4 Kategorien, 6 Seiten; mit Wasserspaß, Baby-Treffen und Sprach-Spielgruppen ≈ 55 000), DRK ≈ 47 000 (7 Kategorien, 12 Seiten), ASG ≈ 133 000 (6 Kategorien, 43 Seiten), AWO ≈ 13 000 (Kat. 25 und 27), KWD ≈ 26 000 (Kat. 10, 4 Seiten). Höchstens 11 Seiten je Kategorie, `max: 12` genügt.
- **Nebenbefund:** efa und ASG nennen „N Termine“, DRK, AWO und KWD nur den Kursbeginn. Von deren Kursen beginnen viele vor heute (DRK 84 von 154, AWO 46 von 76, KWD 8 von 25 in Kat. 130); ob sie noch laufen, zeigt die Liste nicht. Das prüft der Ertragsbeweis in S2; reicht es nicht, entscheidet der Nutzer über Detailseiten oder einen `hint`.

M2 (Soll für Ziel 3, Kurse gesamt / künftig): efa PEKiP/Eltern-Baby 27/26, Bewegung 46/41; DRK Kat. 130 33/17 (Beginn ≥ heute); ASG Spielgruppen 1379 77/74, Musik 1383 23/23; AWO Kat. 25 23; KWD Kat. 10 86/76.

### S1 – Abruf

- **E6** umgesetzt (`6af7770`): PDF vor Browser, `entryFromAssessment` ohne `render` bei PDF, Schema lehnt `render` bei PDF ab, `data/discover/duesseldorf.json` mit fünf Hosts und Test gegen die echte Datei.
- **E2** umgesetzt, weil M1 Fall (b) fand. **Abweichung:** `match` ist das **Ende** der URL (ohne `#…`), kein Teilstring. Der erste Probelauf auf KWD folgte sonst den Links „in den Warenkorb legen“ (`…&browse=forward&knradd=…`) und „Kurs löschen“ und kam auf 13 statt 4 Seiten. Anker auf schon abgerufene Seiten zählen als abgerufen. `max` zählt die Folgeseiten. Probe danach: KWD Kat. 10 4 Seiten, ASG Musik 4, efa Eltern-Baby 2, wie M1.
- `fetch-page --follow <match> [--max N]` nutzt `withFollowPages` aus `io/fetch-inputs.ts`, also denselben Abruf wie der Nachtlauf.
- **Arch-Review S1** (2026-10-24, Verdict OK, kein Blocker, kein Major), übernommen:
  - m1: Gibt es nach `max` Folgeseiten noch einen Folgelink, scheitert die Programmseite („mehr als N Folgeseiten“), statt still Kurse zu verlieren.
  - m2: Leitet eine Folgeseite auf eine fremde Website weiter, scheitert die Programmseite.
  - m3: `fetch-page --max` verlangt eine ganze Zahl 1 bis `FOLLOW_MAX` (40, neben dem Schema).
  - m4: robots.txt der Kufer-Hosts geprüft (2026-10-24): efa, DRK und ASG sperren nur `typo3`, `id=`, `L=`, `cHash` u. Ä., nicht `/kategorie/…?knr=…&browse=forward`; AWO erlaubt alles (auch `cHash`); KWD hat keine robots.txt (404).

### S2 – Katalog (2026-10-24)

- **Recherche:** P1 mit fünf Subagenten (je Kufer-Träger einer), P2–P5 mit je einem (Sonnet). Übernahme mit einem Wegwerf-Skript unter `runs/`: Orte nacheinander geocodiert, Gemeinde Düsseldorf geprüft, geschätzte PLZ nach dem Geocoding berichtigt (efa Kopernikusstr., Opladener Str.; AWO Grafenberger Allee), `publicId` aus `pnpm data:validate`.
- **Katalog:** 49 Düsseldorfer Anbieter und Musenkuss als `verzeichnis` (Ziel 1: ≥ 40). Nicht übernommen: „Familiencafé am EVK“ aus P3 (dieselben Treffs wie `kinderschutzbund-duesseldorf`), der Disselhoffsaal (nur Erwachsenenkurse) und die ASG-Kategorie „Schwangerschaft & Baby“ (überwiegend ohne Kind, Dubletten). 40 Ausschlüsse mit Grund in `references/excluded.md`.
- **Ertragsbeweis Runde 1** (je Paket ein Lauf mit `--only`): P2–P5 ergaben 256 Angebote mit künftigem Termin bei 28 Anbietern. Von P1 lieferte nur DRK (21); efa, ASG und KWD brachen mit `truncated` ab (bis 128 000 Ausgabe-Tokens), AWO ergab `keine-termine`.
- **Ursache Abbruch:** Kufer-Listen sind dicht (≈ 300 Zeichen je Kurs gegen ≈ 1 600 bei der FBS, an der `PART_MAX_CHARS` gemessen wurde). 25 000 Zeichen sind ≈ 80 Kurse in einem Aufruf.
  - **Verworfen:** eine Obergrenze nach Einträgen (über `entryEnd`) für alle Anbieter. Der Vergleich über den ganzen Katalog (nur Abruf) hätte Nürnberger Anbieter wie das Staatstheater (5 → 35 Teile) zerlegt, zusammen +148 Aufrufe; die Dichte trennt Kufer nicht von ihnen. Auch nur für Kufer war die Zählung unzuverlässig: Bei ASG wählt `entryEnd` eine Ampelzeile, die nur bei buchbaren Kursen steht.
  - **Umgesetzt:** `partChars` am `anbieter` (2 000–25 000), eine eigene, kleinere Zeichenschwelle; ohne das Feld bleibt alles wie bisher. efa, DRK, KWD 4 500, ASG 5 000.
- **Nur Kursbeginn (DRK, KWD, AWO):** Die Liste nennt je Kurs nur den ersten Termin; die Folgetermine stehen auf der Detailseite. DRK übernimmt nur kommende Starts (ein Termin je Angebot). KWD leitete daraus Reihen ab (MamaFit: 39 erfundene Dienstage bis 10/2027) und bekam den `hint` „nur den ersten Termin übernehmen, keine Reihe ableiten“. AWO nennt nicht einmal die Uhrzeit und ruht mit `skipCrawl` (bleibt in der Anbieterübersicht). Laufende Kurse dieser drei fehlen damit; Detailseiten wären ein eigener Plan (Restpunkt).
- **Ertragsbeweis Runde 2:** efa 120, ASG 131 (33 Aufrufe, 21 Min.), KWD 33, DRK 20 (Stand vor dem Schlusslauf mit `partChars`).
- **Stichprobe Ziel 3:** efa „DELFI Di 11:15, 15 Termine ab 08.09.“ → 15 Termine 08.09.–15.12. ohne Herbstferien, Ort Hohenzollernstr. 24, wie die Liste. KWD nach dem `hint`: jedes Angebot genau ein Termin wie die Liste.
- **Kosten bisher:** ≈ $1,10 für alle Ertragsbeweise (P2–P5 $0,23, Kufer-Läufe $0,85).

### S2.7 – Probe-Build (2026-10-24, Wegwerf-Worktree `$CLAUDE_JOB_DIR/tmp/probe` auf `f2400ef`)

- 40 Düsseldorfer Rohdateien aus den Paketläufen (`runs/2026-10-24/pakete/*/raw`, Sammelskript `runs/2026-10-24/pakete/sammle-raw.cjs`), `nightly --build-only`: **1 020 Angebote** (462 Bestand + 558 Düsseldorf), `data:validate` grün.
- Linien-Gates grün (vrr: 1 877 Zellen ohne Linien, davon 144 unpassend; alle 50 Stadtteile mit Zugangshalt).
- `pnpm size`: `site.json` **235,49 kB** (Budget 250, Schwelle 200 → N6), `anbieter.json` 13,27/15 kB, Wegzeit vrr 57,55/64 kB, Linien vrr **45,68/40 kB** (→ N7, jetzt 48), Service Worker 10,02/10,5 kB.
- **S3.1 Abdeckung** (Wegwerf-Skript `runs/2026-10-24/abdeckung.cjs`, Navigator-JSON nur im Job-Verzeichnis): 490 relevante Einträge (0–3, ohne reine Beratung/Medizin, künftiges Ende oder fortlaufend), 37 städtische aus dem Nenner (E7), **435 von 453 = 96,0 %** abgedeckt (Ziel 2: ≥ 80 %). Nicht abgedeckt: Caritas (2), tamburino (3), Stadtbüchereien ohne URL (4), je 1: SKFM, Sinneswandel, pro familia, BV 04, Hellerhofer SV, Familienbegleitung, LT Düsseldorf-Süd, Red-Tiger-Club, Zwergenstube Flurstraße.

### Zwischenstand und Übergabe (2026-10-24 abends)

Erledigt: S0, S1 (`6af7770`, `cbbbc40`, Arch-Review OK), S2 (Katalog `6c8079a`, `partChars` `f2400ef`, Ertragsbeweise, Probe-Build), S3.1.

Offen, in dieser Reihenfolge:
1. ~~**S3.2 Entdecken-Eval**~~ erledigt 2026-10-25: Zeile in `evals/results.md` („Entdecken“), 2 von 10 wiedergefunden, 5 gefunden, 0 falsch. Ziel 4 erfüllt: Alle 7 Portal-PDFs landeten im Vorfilter, keine Seite auf `duesseldorf.de` wurde bewertet. Die Ursachenanalyse steht in Plan 0045, „Ausgangslage“; der Nutzer hält das Ergebnis für ungenügend, Plan 0045 baut das Entdecken auf Vollständigkeit um.
2. ~~**S3.3 Entdecken-Trockenlauf**~~ entfällt: `ENTDECKEN_MODUS` ist nicht gesetzt (geprüft 2026-10-25), der Zeitplan läuft also im Modus `trocken`, und N5 ist gegenstandslos. Den abgenommenen Trockenlauf vor einem Live-Gang regelt Plan 0045, S6.
3. **`/arch-review`** über `partChars` (Schemaänderung seit `cbbbc40`) und `pnpm e2e:local --affected --smoke` (Daten, Schema).
4. **Plan 0044 „`site.json` je Gebiet teilen“** schreiben und `/plan-review` (N6). Grundlage: `docs/ideas.md`, „`site.json` je Gebiet teilen“; Messwert 235,49 kB mit Düsseldorf. Erst danach S2.8 und S4.
5. **S2.8 `/browser-review`** im Probe-Build mit echten Düsseldorfer Daten (Test 8), nach Plan 0044.
6. **S4 Live** gemeinsam mit Plan 0039 (S4.0 `ENTDECKEN_MODUS` prüfen; Nachtlauf per Hand mit angehobenen Bremsen: die Kufer-Träger allein sind ≈ 63 Teilaufrufe, efa 15, DRK ≈ 8, KWD ≈ 7, ASG 33).
7. **Restpunkte** für `docs/ideas.md`: Detailseiten für DRK, KWD und AWO (laufende Kurse fehlen), Caritas und tamburino, ASG mit 33 Aufrufen je Änderung.

Der Wegwerf-Worktree unter `$CLAUDE_JOB_DIR/tmp/probe` (detached, `f2400ef`) wird entfernt, sobald Plan 0044 einen neuen Probe-Build braucht.

## Review (2026-10-18) – Verdict: Überarbeiten

Unabhängiger `plan-reviewer`; alle Befunde sind gegen den Code geprüft.

Übernommen:
- **B1 (Vorfilter „Sammelportal“ verwirft echte Anbieter):** übernommen, aber anders gelöst. Es gibt keine neue Vorfilter-Regel. Die Portal-Hosts und `duesseldorf.de` kommen als `abgelehnt` mit `host` nach `data/discover/duesseldorf.json` (E6); das gibt es schon, und es ist getestet. In Nürnberg ändert sich nichts.
- **B2 (Ziel 1 und 5 nicht messbar, Trockenlauf extrahiert alles neu):** Ertragsbeweise laufen gebündelt je Paket mit `--only`. Die Größe misst ein Probe-Build im Wegwerf-Worktree mit `nightly --build-only` (E4, S2.7), einschließlich `wegzeit/vrr.json` und `MAX_WITHOUT_LINES` (Ziel 5). Die Kosten sind neu geschätzt.
- **M1 (Widerspruch zu ADR 0026, Punkt 2):** Nachtrag zu ADR 0026 und Hinweis auf ADR 0016; die Kommentare in `select.ts` und `fetch.ts` werden angepasst (E2).
- **M2 (M1-Messung und `follow` unterspezifiziert):** M1 klärt je Kategorie die Fragen a–c, mit Rückfallebene. `PageTask`, `select.ts` und die Links aus `extractPage` stehen jetzt im Plan; die Widersprüche des Anhangs sind genannt.
- **M3 (Navigator-Funde umgehen den Vorfilter):** Das fällt mit dem Navigator-Adapter in den Folgeplan (E5); die Lösungen stehen dort in der Skizze.
- **M4 (Ausschluss von `duesseldorf.de` wirkt nicht im Entdecken):** `abgelehnt` mit `host` (E6). Das Theatermuseum wechselt von P5 nach E7.
- **M5 (Bremsen im ersten Live-Lauf):** S4.3 hebt die Bremsen per Eingabe an; N2 nennt den Fall „2–3 Nächte“; die Kosten schätzen den Mehrbedarf je Nacht.
- **M6 (lokale Gates und Mobile-UX):** Test 7 nennt die Gates je Schritt, Test 8 einen `/browser-review` mit echten Daten im Probe-Build.
- **Minor:**
  - `vi.mock("./http.ts")` in Test 2
  - Geocoding nur durch die Haupt-Session (E8, Regel 3)
  - Ertragsbeweise je Paket gebündelt
  - Rebase-Konflikte auch in `data/providers.yaml`
  - Ziel 4 ohne Schwelle, mit 5 + 5 ausgeblendeten Anbietern
  - Nenner von Ziel 2 ausdrücklich
  - `limit=3000` im Anhang
  - Warnung bei vollem `limit` in der Skizze E5
- **Scope:** Der Navigator-Adapter samt ADR ist als Folgeplan abgetrennt (E5, S5).

Abgelehnt:
- **Minor „`docs/architecture.md` sicher ändern“:** Ohne neue Vorfilter-Regel ändert sich die Aufzählung dort nicht. Eine Änderung braucht es nur mit `follow`, und die steht in „Dateien“.
- **Minor „`today` in Test 6 übergeben“:** Test 6 zum Adapter ist mit dem Folgeplan entfallen.

## Review 2 (2026-10-18) – Verdict: Freigabe mit Änderungen

Neuer unabhängiger `plan-reviewer` auf die überarbeitete Fassung. Er bestätigt: Die Lösungen für B1 (`abgelehnt` mit `host`) und B2 (Paketläufe mit `--only`, Probe-Build) tragen. Alle Befunde sind gegen den Code geprüft.

Übernommen:
- **B1 (Zeitbudget über dem Job-Limit):** `budget_min=70` statt 120, unter `timeout-minutes: 90`. Der Rest kommt in den Folgenächten mit den Standardbremsen (S4.3, N2).
- **M1 (`MAX_INPUT_CHARS` gilt je Anbieter):** M1 misst die Zeichen je Seite und Träger, Regel ≤ 250 000 (E2, Frage d). Test 2 hat den Fall „zu groß“. Die Kosten je Nacht sind nach Teilen gerechnet.
- **M2 (Budgets außer `site.json`):** Ziel 5 umfasst alle Budgets aus `.size-limit.json`. Für `anbieter.json` gibt es eine Hochrechnung (das knappste Budget). E4 nennt die Optionen beim Anhalten.
- **M3 (`ENTDECKEN_MODUS` gilt für beide Netze):** S4.0 prüft die Variable, N5 regelt den Fall `live`.
- **Minor:**
  - Ein Unit-Test liest `data/discover/duesseldorf.json` echt (Test 6).
  - Das Schema lehnt `render` bei `kind: pdf` ab, und `artOf` wird geprüft (E6, Tests 3 und 5). S1 ist damit immer eine Schemaänderung, mit `pnpm e2e:local --affected` und `/arch-review`.
  - Probe-Build: S1 vorher committen, kein doppeltes `data:build`, `pnpm preview` für den Review.
  - Paketläufe: sofort zählen, Rohdateien sichern, Wiederholungen nur mit `--only <geänderte id>`.
  - Doku-Verweise berichtigt: `catalog.md` Zeilen 11 und 36, ADR 0016 durch ADR 0026 ersetzt, Statuszeile ADR 0026.
  - E1 grenzt die Subagenten gegen „keine Subagenten-Pakete“ aus ADR 0026 ab.
  - S3 mit `pnpm verify`.
  - Rücknahmeweg S4.3a.
  - Ziel 3 zählt nur Kurse mit künftigem Termin.

Abgelehnt: nichts.

## Anhang – Bestandsaufnahme Düsseldorf (2026-10-18)

Erstellt hat sie ein Subagent mit Websuche, curl, `pnpm pipeline fetch-page` (gut 60 Seiten) und zwei Abfragen beim Navigator, ohne Modellaufruf der Pipeline.

Zeichen:
- ★ = schon im Trockenlauf gefunden
- ■ = großer Träger
- „fp ✓“ = mit `fetch-page` geprüft

Fundquellen: FN = Familien-Navigator, ST = Stadtseite „Familien- und Stadtteiltreffs“, WS = Websuche, MK = Musenkuss, TL = Trockenlauf.

Spalte „künftige Termine“:
- **ja** = konkrete Daten nach dem 18.10.2026 auf der eigenen Seite
- **Plan** = fester Wochenplan ohne Datum
- **nein** = nur Beschreibung oder abgelaufene Daten
- **unklar** = JS, Fehler oder nicht geprüft

| # | Anbieter | Art(en) | beste URL (0–3) | künftige Termine | Ortsadresse auf der Seite | ~Angebote 0–3 | Fundquelle | Bemerkung |
|---|---|---|---|---|---|---|---|---|
| 1 | ■ efa – Ev. Familienbildungswerk Düsseldorf | PEKiP, DELFI, Eltern-Baby-Gruppen, Elternstart, Spielgruppen (auch japanisch/spanisch/italienisch), Turnmäuse, Wasserspaß, Musikzwerge, Café Quatsch, Café Kinderwagen | https://www.efa-duesseldorf.de/kurse/familie-werden/pekip-delfi-eltern-baby-gruppen (+ `/kurse/mit-kindern-leben/{spielgruppen,bewegungsspiele-und-turnmaeuse,musik-und-tanz-mit-kindern,wasserspass-mit-kindern,…}`) | ja (meist nur Kursbeginn, oft vergangen) | ja, je Kurs „Hohenzollernstr. 24 / Collenbachstr. 10 / Borsigstr. 12 …“ | 150–200 | FN (156), ST, TL | fp ✓. Jede Kategorie zeigt höchstens 25 Kurse, kein Blätter-Link sichtbar. Viele Orte (ev. Gemeinden, Familienzentren). Größter Anbieter. |
| 2 | ■ DRK Familienbildung und Bildungsakademie Düsseldorf | ElBa (Eltern-Baby), Elternstart, Turnlöwen, Musiklöwen, Yogalöwen, Spielgruppen, Eltern-Kind-Schwimmen (EKiS), Babymassage | https://www.drk-bildung-duesseldorf.de/kurse/eltern-kind-angebote ; https://www.drk-bildung-duesseldorf.de/kurse/angebote-im-wasser | ja (Seite 1 von 6 nur vergangene Startdaten) | ja (Jahnstr. 47, Im Heidewinkel 1e, Sternstr. 31, Tellerringstr. 56, Lehrschwimmbäder) | 100–140 | FN (84), ST, TL | fp ✓. Familientreffs Gerresheim, Friedrichstadt, Aktivtreff Pempelfort, Bürgerhaus Benrath. `kursplaner.drk-duesseldorf.de` leitet hierher weiter. |
| 3 | ■ ASG-Bildungsforum (kath.) | Babycafé „Milchbar“, Elternstart, Pikler-Gruppen, Turnwichtel, Bewegung und Spiel, Sing- und Bewegungsspiele, Spielplatztreff, Zwillingstreff | https://www.asg-bildungsforum.de/kurse/familie/eltern-kind-kurse (+ `/schwangerschaft-baby`, `/elterncafes-offene-treffs`, `/angebote-im-familientreff`) | ja/unklar (nur 7 je Kategorie sichtbar, Rest per JS) | ja (Gerresheimer Str. 90, Wildenbruchstr. 27, Rather Kreuzweg 43, Familienzentren) | 80–100 | FN (92), ST | fp ✓. Spielt in vielen kath. und städtischen Familienzentren. Liste zusätzlich unter `programm.asg-bildungsforum.de`. |
| 4 | ■ AWO Familienbildungswerk Düsseldorf | PEKiP, Krabbelgruppen, Musikbabys, Spielgruppen 6 Mon–3 J., Elternstart-Treff, Café Clementinchen | https://www.awo-duesseldorf.de/awo-kurse/kursliste/?kathaupt=1&katid=48&katvaterid=0&cHash=e0cdf392af682b295fe5327d436eca63 | ja (17 Startdaten nach heute) | nur Stadtteil in der Liste; Adresse auf der Detailseite | 40–50 (70 Eltern-Kind gesamt) | FN (36+), ST, TL | fp ✓. Treffs Liststr. 2, Aachener Str. 9, Schloßallee 12c, Geeststr. 99, Immigrather Str. 45. Dazu ein Jahresprogramm als PDF. |
| 5 | ■ Kaiserswerther Diakonie – Familienakademie | PEKiP, Kleine Klangentdecker, BabyKlang, Spiel und Bewegung 1–2,5 J., Milchcafé 0–6/7–12 Mon., Elternstart, Rückbildung mit Babymassage | https://www.kaiserswerther-diakonie.de/programm-familienakademie/kurse/das-baby-ist-da/kategorie/Das+Baby+ist+da/10 | ja (9 auf Seite 1) | nur Raumname („Fronberghaus, Raum 008“) | 25–40 | FN (22), ST, TL | fp ✓. 4 Seiten mit `cHash`-Blätterlinks. Alte Landstr. 179c, Kaiserswerth. |
| 6 | ★ Kinderschutzbund OV Düsseldorf | Familiencafés: Klitzeklein 0–1, Eltern-Kind-Treff 0–3, Spielgruppen, WINZIGKLEIN, Zwillingstreff | https://kinderschutzbund-duesseldorf.de/familiencafe-am-evk-bilk/ ; …/familiencafe-blauer-elefant/ ; …/familiencafe-sana/ | ja | ja (Kirchfeldstr. 48; Posener Str. 60; Im Heidewinkel 8) | 10–14 | TL, FN, ST | fp ✓. Drei Cafés, drei Programmseiten. |
| 7 | ★ Geburtshaus Düsseldorf | Spielend wachsen im 1. Lebensjahr, Krabbelgruppe ab 8 Mon., Spielgruppe ab 1 J., Babymassage (auch für queere Familien), Rückbildung/Postnatalyoga | https://ghd.hebamio.de/kursliste/15 (+ /16, /17) | ja (hebamio: 25 bzw. 34 Daten) | nein auf hebamio, ja auf der Hauptseite | 10–15 | TL | fp ✓. Die Infoseite `eltern-kind-kurse.html` hat keine Termine, die stehen erst auf hebamio. Die Babymassage gibt Familienbegleitung Düsseldorf (Sophie Wölbling). |
| 8 | ★ Hebamme Nina Krügel | Babymassage + Rückbildung | https://www.hebamme-nina-kruegel.de/kurse/kurse-nach-der-geburt.php | ja („Starttermine 2026: 09.11., 10.12.; 2027: 12.01. …“, ohne Jahr am Datum) | ja (Hansaallee 240, Oberkassel) | 1 Kurs, 5 Starts | TL | fp ✓ |
| 9 | ★ YogaKitchen Oberkassel | Mutter-und-Kind-Yoga, Babymassage | https://www.yogakitchen-duesseldorf.de/mutter-und-kind-yoga-kurse.php | ja (4) | PLZ 40545, Straße nicht erkannt | 2–3 | TL, WS | fp ✓ |
| 10 | ■ Diakonie Düsseldorf – eigene Treffs (ohne efa) | Baby-Café Tripp Trapp, Spiel- und Singtreff, offener Eltern-Kind-Treff (Ernst-Lange-Haus); Mutter-Kind-Café (Stadtteilladen Flingern); Krabbelgruppen und Eltern-Kind-Turnen in Ev. Familienzentren | https://www.diakonie-duesseldorf.de/jugend-familie/stadtteilarbeit ; https://www.familienzentrum-diakonie.de/ | Plan (Wochentage) | ja (Fürstenberger Str. 16; Gerresheimer Str. 167) | 8–15 | FN (37 inkl. efa-Kooperationen), ST | fp: Stadtteilarbeit ohne Termine; familienzentrum-diakonie.de „fetch failed“. 25 Ev. Familienzentren (Kitas) dienen meist als Ort für efa-Kurse. |
| 11 | Stadtbüchereien Düsseldorf | Lesegarten-Krabbelgruppe 12–36 Mon. (Unterrath, Kaiserswerth …), Tales for Tots (englisch), Geschichtenzeit (meist ab 3–4) | https://www.duesseldorf.de/stadtbuechereien/veranstaltungen/ | ja (73 künftige Daten insgesamt, davon nur wenige 0–3) | Filiale genannt, Adresse auf der Filialseite | 4–6 Reihen | FN (Filialen), MK, WS | fp ✓. Der Lesegarten Unterrath ist monatlich, nächste Termine 04.11. und 02.12. |
| 12 | Familieninstitut Heike vom Heede | Babygymnastik (Mo–Fr, 2 Slots), Babymassage, Postnatal-Yoga, Waldgruppe | https://familieninstitut-duesseldorf.de/ | Plan/unklar | nein (Schwanenmarkt 4 nur im FN) | 10–15 | FN (7), TL | fp: Startseite ohne Daten, Kursdetailseiten 404 bzw. JS. Im Trockenlauf „Bewertung ohne gültige Antwort“. |
| 13 | Zwergenstube Düsseldorf | Mini-Turnzwerge ab 0,9 J., Turnzwerge, Eltern-Kind-Turnen 0–7 | https://zwergenstube-duesseldorf.com/eltern-kind-turnkurse/ (Buchung über `zwergenstube-duesseldorf.ebusy.de`) | Plan | 40625 (3 Orte: Flurstr. 57, Lohbachweg 18, Gräulinger Str. 56) | 6–10 | FN, WS | fp: JS. Die ebusy-URL aus dem FN gibt per Skript 400. |
| 14 | Caritasverband Düsseldorf (Treffpunkt „Mittendrin“ Norberthaus, Stadtteilladen Wersten, Rather Familienzentrum, Leopoldstr.) | Eltern-Kind-Spielgruppe, griffbereitMINI, Eltern-Kind-Treff, Krabbel- und Spielgruppe, Spieletreff, Vater-Kind | https://www.caritas-duesseldorf.de/hilfe-angebote/kinder-jugend-familie/stadtteilladen-wersten/ ; https://caritas.erzbistum-koeln.de/duesseldorf_cv/rather-familienzentrum/ | Plan | teils | 6–9 | FN, ST | fp: Rather Familienzentrum ohne Termine. Garath (Josef-Kleesattel-Str. 2), Wersten (Liebfrauenstr. 30). |
| 15 | SOS-Kinderdorf Düsseldorf – MGH Hell-Ga | Eltern-Kind-Spielgruppen Mo–Fr, Hebammencafé, Storchennest, Mäusetreff | https://www.sos-kinderdorf.de/kinderdorf-duesseldorf/angebote/mehrgenerationenhaus-hell-ga | Plan (1 Datum) | PLZ 40595 (Matthias-Erzberger-Str. 24) | 4–6 | FN, ST | fp ✓ |
| 16 | Städtische Familienzentren (Jugendamt, ca. 37 Kitas) | Griffbereit (mehrsprachig), Elterncafé, Spiel- und Kontaktgruppen | https://duesseldorf.kita-navigator.org/ (je FZ eine Detailseite) | Plan/Freitext | ja (im FN) | 8–15 eigene; der Rest sind Kurse von efa/ASG/DRK/AWO | FN, TL | Überwiegend Orte für die Familienbildungswerke, selten eigene Angebote. Reine Kitas sind laut excluded.md ausgeschlossen. Als Anbieter nur bei eigenem offenem Angebot. |
| 17 | Häuser für Kinder, Jugendliche und Familien (Jugendamt: flin., flair., zitty., nordkap., schmiede., donk., blueRock., radeberger.familie) | Eltern-Kind-Spielgruppe, „Beweg dich mit Baby“ | https://duesseldorf.kita-navigator.org/detail/764 u. a. | Plan | ja | 2–5 | FN | Im Trockenlauf flin.familie „nicht abrufbar“ (PDF). |
| 18 | Kath. Familienzentren / SKFM (z. B. Wittenberger Weg, St. Apollinaris, Hl. Familie) | Mutter-Kind-Gruppe bis 1 J., Spiel- und Entwicklungsgruppe | https://www.skfm-duesseldorf.de/de/kita-und-familienzentrum-wittenberger-weg/ | Plan | ja | 3–6 eigene; meist ASG-Kurse | FN, TL | Zählt wie Nr. 16 |
| 19 | Tonhalle Düsseldorf – „Himmelblau“-Babykonzerte (Kleine Tonhalle) | Babykonzerte 0–2 in den Familienmusikwochen | https://www.tonhalle.de/ (Reihe „himmelblau“) | unklar (JS) | unklar | 1 Reihe, je Woche 8–16 Vorstellungen, mehrmals im Jahr | WS, MK | fp: Seite ohne JS leer, braucht `render: browser`. Starke Quelle im Stil des Nürnberger „Babykonzert“. |
| 20 | Kunstpalast | „Kunst mit Baby“ (1. Lebensjahr) | https://www.kunstpalast.de/de/programm/kinder-jugendliche-familien/kunst-mit-baby/ | ja (21.10.2026, 20.01.2027) | nein (Ehrenhof 4–5 nur im Impressum) | 1 Reihe | WS | fp ✓ |
| 21 | Theatermuseum Düsseldorf (Hofgarten) | Känguru-Führung „Bühnenkunst mit Nachwuchs“ (Eltern mit Baby), monatlich | Seite des TMD auf duesseldorf.de; Termine auch auf rausgegangen.de | unklar | unklar | 1 Reihe | WS | nicht geprüft |
| 22 | Düsseldorfer Schauspielhaus – Junges Schauspiel | Stücke ab 2 („Bin gleich fertig!“) | https://www.dhaus.de/programm/spielplan/junges-schauspiel/ | ja (2 Vorstellungen ab 2) | PLZ 40211 | 1–2 Stücke | WS, MK | fp ✓. Altersangabe „👀 ab 2 Jahren“ |
| 23 | Deutsche Oper am Rhein | Tanzstück „Schlafen“ ab 2 (Opernhaus Düsseldorf, 27.09.2026–17.04.2027) | https://www.operamrhein.de/jung/ | ja (laut Suche) | unklar | 1 | WS | nicht mit fp geprüft. Das Haus spielt auch in Duisburg, also nach Ort filtern. |
| 24 | Puppentheater Helmholtzstraße | Puppentheater ab 2 (Pempelfort) | Website nicht geprüft | unklar | Helmholtzstr. 38 | 1–3 Stücke | WS | Altersgrenze je Stück prüfen |
| 25 | Bädergesellschaft Düsseldorf | Babyschwimmen ab 3 Mon. (Düsselstrand, Badehaus Benrath u. a.) | https://www.baeder-duesseldorf.de/kurse/schwimmkurse-fuer-kinder/babyschwimmen-ab-3-monaten/ | nein (keine Zeiten auf der Seite; Zeiten nur im FN: Di 11/12 Uhr, Mi 16 Uhr …) | nein | 4–8 Kurszeiten | FN, WS | fp ✓. Ohne die Zeiten aus dem FN fällt die Quelle durch. |
| 26 | Sharky Düsseldorf GmbH | Baby- und Kleinkindschwimmen | https://www.sharky-duesseldorf.de/baby-und-kleinkinderschwimmen/ | nein | PLZ 40474 | 2–4 | WS, TL | fp ✓. Im Trockenlauf „kein Angebot mit Termin“ |
| 27 | aqua GYM Düsseldorf | Babyschwimmen BABY I/II | https://aquagym-duesseldorf.de/Babyschwimmen/ | nein (2 alte Daten) | ja (Glockenstr. 24) | 2–4 | WS, TL | fp ✓ |
| 28 | Wasserhelden Düsseldorf e.V. | Eltern-Kind-Schwimmen ab 3 Mon. (LVR-Bad Brinckmannstr.) | über duesseldorf-fuer-kinder.de gefunden | unklar | unklar | 2–4 | WS | nicht geprüft |
| 29 | Schwimmschule Nicole Bergmann | Baby- und Kleinkindschwimmen (?) | – | unklar | – | ? | FN (Anbieter ohne Adresse) | nicht geprüft |
| 30 | EVK Düsseldorf – Elternschule | Babymassage, „Mit allen Sinnen“ (früher PEKiP), Musik erleben, Mom-Baby-Yoga, Rückbildung | https://www.evk-duesseldorf.de/geburt-und-kindernetzwerk/elternschule/kurse-im-ersten-jahr/babymassage.html | Plan/unklar | ja (Suitbertusstr. 35 / Kirchfeldstr. 40) | 6–10 | WS | fp ✓. Die PEKiP-Leiterin Roswitha Rheinbay unterrichtet dort (Nr. 46). |
| 31 | UKD-Elternschule (Uniklinik) | Babymassage, Rückbildung, Krabbelgruppe | https://www.uniklinik-duesseldorf.de/patienten-besucher/klinikeninstitutezentren/klinik-fuer-frauenheilkunde-und-geburtshilfe/elternschule-des-ukd/kurse-nach-der-geburt | nein | nein | 2–4 | WS, TL | fp ✓ (Übersicht ohne Daten) |
| 32 | Düssel Mami – Praxis für Hebammen und Familienbegleitung (Grafenberg) | Babykurse, Rückbildung mit Babymassage, Klangreise für 1- und 2-Jährige, Babygebärden, Mami Fit mit Baby outdoor, Kleinkindturnen | https://www.duessel-mami.de/nach-der-geburt/babykurse/ | nein | nein | 8–12 | WS | fp ✓ (keine Daten, wohl ein Buchungstool). Großer privater Anbieter. |
| 33 | Hebamme Katharina Rademacher (Gerresheim) | Babymassage nach Leboyer, Rückbildung | https://www.hebamme-rademacher.de/kurse/ | nein | nein | 1–2 | WS, TL | fp ✓ |
| 34 | Hebavit – Ilona Wächter (Volmerswerth) | Rückbildung mit Babymassage | https://www.hebavit.de/nach-der-geburt/ | nein | nein | 1–2 | WS | fp ✓ |
| 35 | Hebammenpraxis 37 (Unterbilk) | Rückbildung, Yoga (mit Baby unklar) | https://www.hebammenpraxis37.de/ | nein | PLZ 40219 | 0–2 | WS | fp ✓ |
| 36 | Praxis Bullerbü (ehem. Hebammenpraxis Süd, Bonner Str. 103) | Rückbildung mit Baby, Krabbelgruppe, Spielgruppe, Babygebärden, Babymassage | https://praxisbullerbue.com/ | unklar | unklar | 5–8 | WS | fp: Unterseite 404 / JS |
| 37 | mammeno | Babykurse externer Kursleiterinnen, Raumvermietung | https://mammeno.de/kurse/ | unklar (JS) | nein | 2–5 | WS | fp: JS |
| 38 | fit4mom (Grafenberger Allee 368) | Babymassage ab 6 Wochen, Krabbelgruppe 3–13 Mon. | https://www.fit4mom.de/babymassage-krabbelgruppe.html | nein (6 alte Daten) | PLZ 40235 | 2–3 | WS, TL | fp ✓ |
| 39 | Mama macht… (Jahnstr. 17, Friedrichstadt) | Krabbelgruppe (5 Kurse à 7 Termine bis zum 1. Geburtstag), Krabbelgruppe 2.0 | https://www.mamamacht.de/kurse-f%C3%BCr-kinder/krabbelgruppe/ | nein | ja | 2–5 | WS, TL | fp ✓ |
| 40 | herz und sinn (Frankenstr. 9a) | Babymassage „baby in balance“, mini & me, Babykurse | https://www.herzundsinn.de/kursuebersicht | nein (Squarespace, Buchung extern) | nein | 2–4 | WS, TL | fp ✓ |
| 41 | Familienbegleitung Düsseldorf (Sophie Wölbling) | Babymassage im Geburtshaus, La-Leche-Liga-Stillgruppe | http://familienbegleitung-duesseldorf.de/babymassage/ | ja (laut Trockenlauf „Termine 2026“) | über Geburtshaus | 1–3 | TL, FN | Doppelt mit Nr. 7, über `coveredBy`/Ort lösen |
| 42 | Raum für Yoga (Iyengar, Grafenberger Allee 186) | Babyyoga 2 Mon.–1,5 J. (unregelmäßig) | http://www.iyengar-hatha-yoga.de/yoga-kurse-duesseldorf/ | nein | ja | 1 | WS | nicht mit fp geprüft |
| 43 | Yogamonster (Pempelfort) | Mama und Baby (Aerial), Buchung über bsport | https://www.yogamonster.de/mama-und-baby | unklar | unklar | 1–2 | WS | fp: fetch failed |
| 44 | Cocoon Yoga (Unterbilk) | Postnatal-Yoga (hybrid, mit Baby?) | https://cocoonyoga.de/ | unklar | unklar | 0–1 | WS | fp: 404 |
| 45 | buggyFit Düsseldorf / Core in Balance | Kinderwagen-Fitness (Volmerswerth/Sternwartpark, Pempelfort/Oberkassel) | https://www.buggyfit.de/standorte/297-duesseldorf-volmerswerth ; https://coreinbalance.de/buggyfit-duesseldorf/ | unklar | Treffpunkt im Park | 1–3 | WS | Standort Eller „aktuell keine Kurse“ |
| 46 | Roswitha Rheinbay (PEKiP, Schlafberatung) | PEKiP | https://www.roswitha-rheinbay.de/aktuelles-kurse/ | nein (5 alte Daten) | ja (Suibertusstr. 35 = EVK-Elternschule) | 1–3 | WS | fp ✓ (JS-Hinweis). Möglicherweise Ort von Nr. 30. |
| 47 | Rohrspatz – Musikalische Früherziehung (Florastr. 78) | Musik ab 4 Mon., 1–3 J. | https://rohrspatz-duesseldorf.de/ | nein | ja | 3–6 | WS | fp ✓ |
| 48 | Musikschule Niederkassel | BAM!-Baby-Musik-Garten 0–2, Liedergarten 2–4 | https://www.musikschule-niederkassel.com/ | nein (5 alte Daten) | ja | 2–4 | WS | fp ✓ |
| 49 | Musikschule Arioso (Kirchfeldstr. 84) | Eltern-Kind-Musik ab 1 bzw. 2 J., Früherziehung 2–4 mit Begleitung | https://musikschule-arioso.de/#gruppenkurse | Plan | ja | 3–5 | FN, WS | fp ✓ |
| 50 | Mobile Musikschule tamburino | musikalische Frühförderung ab 18 Mon. (in Familienzentren) | https://www.tamburino.de/ | Plan (nur im FN) | nein auf der Website | 3–5 | FN | fp ✓ (Website ohne Plan) |
| 51 | Maela-base Düsseldorf | Eltern-Kind-Musikkurs 1–5 J. | https://maela-base.com/duesseldorf/eltern-kind-musikkurs/ | nein | nein | 1–3 | WS | fp ✓ |
| 52 | Clara-Schumann-Musikschule (städtisch) | Liedergarten 2–3 J. mit Erwachsenem | https://clara-schumann-musikschule.de/ | unklar (JS) | Prinz-Georg-Str. 80 (laut Suche) | 3–8 Gruppen | WS, MK | fp: JS. Altersgrenze ab 2 |
| 53 | kiwifalter (Kalkumer Schloßallee 100) | MamaPapaKind: Musik, Tanz, Turnen, Kunst; Ballett Minis; Coworking mit Kinderbetreuung | https://www.kiwifalter.de/ | Plan (nur im FN) | im FN ja | 5–8 | FN | fp: fetch failed. Buchung per App |
| 54 | Sportgeister e.V. | Familien- und Kinderturnen, Turncafé (Bilk, Wersten, Lindenstr., Paulusplatz) | http://www.sportgeister.de | unklar (JS) | im FN ja | 4–6 | FN | fp: JS |
| 55 | Sinneswandel – Zentrum für Persönlichkeitsentwicklung | Babyzeichen-Kurse | http://www.babyzeichen.info/Kurse-CO.111.0.html | Plan | ja (Stoffeler Broich 57) | 1–2 | FN | nicht mit fp geprüft |
| 56 | Happy Kids Kindercafé (Achenbachstr. 148, Düsseltal) | Musikkurs 8–12 Mon., Krabbelkurse | https://www.happykids-duesseldorf.de/ | unklar | ja (laut Suche) | 2–4 | WS | fp: fetch failed. Laut Suche „ausgebucht/beendet“ |
| 57 | BabyBee-Spielraum (Pempelfort) | Montessori-Spielraum 0–5, zweisprachige Kurse | – | unklar | – | ? | WS | nicht geprüft |
| 58 | Motte (Bilk) | Baby- und Kinderkurse (Fitness, Tanz, Sprache) | – | unklar | – | ? | WS | nicht geprüft |
| 59 | Düsseldorfer Turnverein 1847 | Eltern-Kind-Turnen ab Laufalter (Gruppen voll, Warteliste) | https://www.duesseldorfertv.de/eltern-kind-turnen | nein | nein (Staufenplatz 10 im FN) | 2–4 | FN, WS | fp ✓ |
| 60 | Turnerbund Hassels 1925 (TBH) | Eltern-Kind-Turnen 1,5–3,5 (Mi, Benrath/Himmelgeist) | https://tbh-sport.de/eltern-kind-turnen/ | Plan | ja (Einsiedelstr. 25) | 2 | WS | fp ✓ |
| 61 | FTV von 1880 | Eltern-Kind-Turnen 2–4 | https://www.ftv-duesseldorf.de/sportangebot/eltern-kind-turnen/ | Plan | ja (Florastr. 69, Färberstr. 40, Jahnstr. 97) | 2–4 | WS | fp ✓ |
| 62 | TuS Maccabi Düsseldorf | Eltern-Kind-Turnen 1,5–3 | https://maccabi-duesseldorf.de/eltern-und-kindturnen/ | Plan/nein | nein | 1 | WS | fp ✓ |
| 63 | TSV Jahn 05 Oberkassel | Eltern-Kind 1,5–3 (Di, Halle Rheinblick) | https://www.tsv-jahn.de/de/sportangebot/sportangebote-und-abteilungen/eltern-kind/ | Plan | ja (Luegallee 106, Cimbernstr. 24 …) | 1–3 | WS | fp ✓ |
| 64 | KSV Düsseldorf (Kaiserswerth) | Krabbel- und Laufgruppe 1–2, Eltern-Kind-Turnen 2–4 | https://ksv-duesseldorf.de/de/pages/kinder-und-jugendsport | Plan | ja (GGS Kaiserswerth) | 2–3 | WS | nicht mit fp geprüft |
| 65 | Gerresheimer Turnverein (GTV) | Eltern-Kind-Sport 1,5–6 | https://www.gtv-sport.de/sportangebot-verein/eltern-kind-turnen/ | nein | nein | 2–4 | WS | fp ✓ |
| 66 | Turngemeinde 1881 | Eltern-Kind-Turnen | https://www.tg1881.de/eltern-kind-turnen/ | unklar | unklar | 1–3 | WS | nicht geprüft |
| 67 | BV 04 Düsseldorf | Gymnastik / Eltern-Kind | https://bv04.com/gymnastik | unklar | im FN ja (Hans-Böckler-Str. 31) | 1–2 | FN | nicht geprüft |
| 68 | Hellerhofer Sportverein | Eltern-Kind-Turnen (?) | http://www.hellerhofer-sportverein.de | unklar | im FN ja | 1–2 | FN | nicht geprüft |
| 69 | TSV Eller 04 | Eltern-Kind-Turnen | – | unklar | – | 1–2 | WS (citysports) | nicht geprüft |
| 70 | Ev. Kirchengemeinde Unterrath-Lichtenbroich | Krabbelgruppen 6–18 Mon., an allen Wochentagen | https://unterrath-lichtenbroich.ekir.de/inhalt/krabbelgruppe-unterrath/ | Plan | ja (Am Röttchen 10) | 5 | WS, FN | Laut FN auch als Ev. FZ Ahornallee geführt |
| 71 | Ev. Kirchengemeinde Düsseldorf-Linksrheinisch | „Gottesdienst für kleine Leut’“ 0–5 mit Brunch | https://www.evdus.de/evangelisch-vor-ort/linksrheinisch/linksrheinisch-kinder-und-jugend/linksrheinisch-gottesdienste-fuer-kinder-und-familien | nein (Termine im ChurchDesk-Kalender, JS) | Gemeindebüro Arnulfstr. 33 | 1 Reihe | WS | fp ✓ |
| 72 | Ev. Friedens-Kirchengemeinde | Kleinkinder-Gottesdienst, Kirche Kunterbunt (ökumenisch) | https://www.evdus.de/evangelisch-vor-ort/friedenskirche/friedenskirche-gottesdienste | unklar (JS) | ja (Florastr. 55) | 1–2 | WS | fp: Veranstaltungsseite leer (JS) |
| 73 | weitere ev. Gemeinden (Benrath „Familienkirche Hassels“, Emmaus, Luther, Mirjam, Mitte, Urdenbach, Kaiserswerth, Gerresheim, Garath, Wersten …) | Krabbelgruppen, Minigottesdienste | https://www.evdus.de/evangelisch-vor-ort/… (8 Gemeinden auf evdus.de, weitere auf `*.ekir.de`) | unklar (ChurchDesk/JS) | teils | ? (geschätzt 10–25) | WS | Größte Lücke. In Nürnberg kommen diese über `evtermine`; für Düsseldorf habe ich keinen gemeinsamen Kalender gefunden. |
| 74 | kath. Pfarreien (z. B. St. Margareta Gerresheim, Rheinbogen, Derendorf/Pempelfort) | Krabbelgottesdienste, Familienmessen; Gruppen meist über ASG | https://www.katholisches-duesseldorf.de/gemeinden-verbaende/gottesdienste-in-duesseldorf/ | unklar | – | ? (geschätzt 5–15) | WS, FN | Die Gottesdienstsuche nennt nur Messen |
| 75 | Die AGB e.V. (Himmelgeister Str. 107) | Familientreff (0–3 unklar) | https://www.die-agb.de/ | unklar | ja | ? | ST | nicht geprüft |
| 76 | KIND VAMV – Ein-Eltern-Familientreff (Kalkumer Str. 85) | Treff für Alleinerziehende (mit Kind?) | – | unklar | ja | ? | ST | nicht geprüft |
| 77 | Familienzentrum kleine freiheit e.V. (Krahestr. 13) | Eltern-Kind-Angebote? | – | unklar | ja | ? | FN | nicht geprüft |
| 78 | Barber’s Puppentheater (Gastspiel Staufenplatz, bis 26.10.2026) | Puppentheater ab 2 | Eventfrog / duesseldorf-magazin | ja (bis 26.10.) | Zelt Staufenplatz | 2 Stücke | WS | Gastspiel, eher nicht aufnehmen |

### Anhang: Sammelkalender und Verzeichnisse (keine Anbieter)

| Quelle | Rolle | URL | Bemerkung |
|---|---|---|---|
| Familien-Navigator Düsseldorf (Frühe Hilfen / Guter Start NRW) | **aggregator-Kandidat** | `https://www.fruehehilfen-online.nrw.de/fhiangebot/searchredesign?einrichtungId=39&limit=3000` | JSON mit 2.179 Angeboten, davon 495 für 0–3; strukturierte Daten, Geo, Anbieter und Träger. Gleiches System für rund 70 NRW-Kommunen |
| Stadt Düsseldorf – Familien- und Stadtteiltreffs | verzeichnis | https://www.duesseldorf.de/familie/familien-und-stadtteiltreffs | 22 Treffs mit Adresse und Trägerlinks |
| Musenkuss | verzeichnis (Kultur) | https://www.musenkuss-duesseldorf.de/angebote?tx_solr%5Bfilter%5D%5B0%5D=targetGroupsToggle%3A0-3+Jahre | 11 Angebote 0–3 |
| kindaling.de/…/duesseldorf | verzeichnis | z. B. https://www.kindaling.de/pekip-pikler-co/duesseldorf | Inhalt per JS, mit curl leer. Im Trockenlauf zu Recht verworfen |
| kidsgo, duesseldorf-fuer-kinder.de, schwangerinmeinerstadt, vuvivi, citysports | verzeichnis | – | teils veraltet; als Fundquelle nützlich |
| PEKiP e.V. Gruppensuche, Musikgarten-Lehrersuche | verzeichnis | pekip.de | nicht ausgewertet (JS, wie in Nürnberg) |

### Anhang: Geprüft und vermutlich auszuschließen

| Anbieter | Grund |
|---|---|
| Blubberfische | Becken nur in Neuss (laut Trockenlauf) |
| Aquazoo Löbbecke Museum, K20/K21, NRW-Forum | kein Format für Babys oder Kleinkinder gefunden |
| Kinderwagenkino | in Düsseldorf keins gefunden (Köln: Cinenova) |
| Clara-Schumann-Musikschule unter 2 J., Musikschule Emotio, akki e.V. | erst ab 2 bzw. ab 3 Jahren |
| Florence-Nightingale-Krankenhaus | Kurse laufen über die Kaiserswerther Familienakademie (Nr. 5) |
| Sana Benrath, Marien Hospital, St. Vinzenz, Dominikus | nicht gefunden bzw. vermutlich nur Kurse vor der Geburt (offen) |
| pro familia, Beratungsstellen, Bezirkssozialdienst, Elterngeld | Beratung, kein Eltern-Kind-Angebot |

