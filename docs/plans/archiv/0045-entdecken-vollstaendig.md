# Plan 0045 – Entdecken: erst vollständig, dann günstig

Status: ersetzt durch Plan 0050 (`docs/plans/0050-entdecken-schlank.md`), Neuschnitt nach ADR 0033 am 2026-10-26. Nie umgesetzt. Die Abschnitte „Ausgangslage“, „Quellen“ und „Fundorte der neun nicht gefundenen“ bleiben die Quelle für Plan 0050; Stufe A wird ein Skill-Ablauf, die breiten Inventare gehen in dessen Checkliste, S3b geht in Plan 0049 auf.
Datum: 2026-10-25
Bezug:
- Plan 0032 (`docs/plans/0032-daten-automatisch.md`), E7 (Entdecken), E8 (Kosten und Grenzen), E9 (Entdecken-Eval).
- ADR 0026, Punkt 1 (Entdecken wöchentlich), Punkt 2 („Links werden nie verfolgt“, Ausnahme Kontaktseiten; Nachtrag „das Bewerten setzt `follow` nie“), Punkt 3 (Modell), Punkt 5 (Rechte, G2), Punkt 6 (Bremsen); ADR 0025 (Katalog); ADR 0022 (IDs); ADR 0032 (Netze, `municipality`).
- Plan 0042 (`docs/plans/0042-duesseldorf-katalog-fuellen.md`), Hypothese 1 (Navigator-Schnittstelle), E5 (Navigator als Fundquelle, hier aufgenommen), E6 (Portale in `abgelehnt`), Nicht-Ziel „robots.txt projektweit“.
- `evals/results.md`, Abschnitt „Entdecken“; Berichte `runs/2026-10-24/eval-discover/report.md` (Worktree `plan-0039`, gitignored) und Plan 0032, Stufe 5.
- Skill `babyevents-nuernberg`, Abschnitt 6 (Region starten); `references/booking-systems.md`.
- Nummer 0044 ist für „`site.json` je Gebiet teilen“ reserviert (Plan 0042, N6), Nummer 0046 für die Stufen C und D (E1). **ADR 0033** ist für diesen Plan reserviert (E10), ADR 0034 für Plan 0046; ein ADR aus Plan 0044 nimmt 0035.

## Anlass

Das Entdecken-Eval für Düsseldorf (2026-10-24) fand 5 von 10 ausgeblendeten Anbietern und nahm 2 wieder auf. In Nürnberg (2026-10-11) waren es 6 und 2. Der Nutzer am 2026-10-25:

> Hochwertige und vollständige Daten sind das A und O für die Anwendung. Mit schlechten Daten hat sie keinen Wert. Lass uns die Kosten erst optimieren, wenn die Qualität stimmt […]. Erstes Ziel muss aber sein, die Qualität hinzubekommen, egal wie die Kosten sind. Wir haben hier ein Abo […], deswegen sind die Kosten nur rein theoretischer Natur aktuell.

Und zur Richtung: Weitere Städte (etwa Oldenburg) sollen einfach dazukommen. Der Nutzer schlägt vier Arten von Läufen vor (E1): eine einmalige Erkundung je neuer Stadt, die auch festhält, welche Recherchemethoden dort am meisten bringen; ein monatliches, auf die Stadt zugeschnittenes Entdecken; einen wöchentlichen Lauf für neue Kurse bekannter Anbieter; einen nächtlichen, deterministischen Lauf für Plätze und Anmeldestand.

Bisher war das Entdecken auf Kosten gebaut: Haiku, 10 feste Suchbegriffe, ein Aufruf je Kandidat, harte Verwerfung. Die Kataloge von Nürnberg und Düsseldorf sind deshalb von Hand entstanden (Plan 0042, E1: 96 % Abdeckung gegen den Navigator). Live hat das Entdecken nur Fürth gefüllt (8 Anbieter am 2026-10-12). Die Repo-Variable `ENTDECKEN_MODUS` ist nicht gesetzt (geprüft 2026-10-25), die Wochenläufe sind also Trockenläufe.

Dieser Plan baut die ersten beiden Arten (Erkunden, Entdecken) auf Vollständigkeit um und misst sie so, dass „gut genug“ eine Zahl ist. Kosten werden weiter gemessen und angezeigt, begrenzen aber nichts. Den Trade-off zwischen Kosten und Qualität sucht ein späterer Plan, wenn die Ziele erreicht sind.

## Voraussetzungen

- **Branch-Basis.** Düsseldorf existiert nur auf Branch `plan-0039` (Pläne 0039 und 0042, noch nicht auf `main`). Die Umsetzung zweigt von `plan-0039` ab, solange dieser nicht auf `main` ist. Kommt `plan-0039` per Fast-Forward auf `main`, liegt der Umsetzungs-Branch schon auf dessen Linie; vor jedem Push genügt dann `git rebase origin/main` (tägliche `data/`-Commits). Ohne Düsseldorf im Katalog scheitert das Düsseldorfer Eval (S1b).
- **Budgets vor dem Live-Gang.** Mehrere Budgets aus `.size-limit.json` sind fast voll: `site.json` 235,49 kB gzip mit Düsseldorf (Plan 0042, S2.7), `anbieter.json` 13,27 von 15 kB, Linien `vrr` 45,68 von 48 kB, Wegzeit `vrr` 57,55 von 64 kB, Wegzeit `vgn` 60,7 von 64 kB. Jede Aufnahme bringt Anbieter und Orte dazu. G1 (`check:fast`) prüft keine Größen-Budgets. Deshalb: S6 (Live) erst nach dem Live-Gang von Plan 0044 (`site.json` je Gebiet) und nach Nutzerentscheid N7 zu den übrigen Budgets; vor S6 ein Probe-Build über `pnpm pipeline nightly --build-only` mit `raw/` und Katalog des Trockenlaufs, dann `pnpm build` und `pnpm size`; im Betrieb dieselbe Prüfung im Job (E8).
- **Verzeichnisdaten.** Die Recherche vom 2026-10-25 (Abschnitt „Quellen“) ist die Grundlage für die Adapter. Abrufbare Endpunkte prüft S0 vor dem Bau erneut.

## Ausgangslage: wo die Anbieter verloren gehen

Gezählt sind die 20 ausgeblendeten Anbieter beider Evals. Die Ursachen sind am 2026-10-25 nachgeprüft (Nominatim, Seitenabruf, Beweisdaten des Laufs).

| Stufe | Nürnberg | Düsseldorf | zusammen |
|---|---|---|---|
| ausgeblendet | 10 | 10 | 20 |
| von einer Quelle gefunden | 6 | 5 | 11 |
| aufgenommen (wiedergefunden) | 2 | 2 | 4 |

### Gefunden, aber verloren (7 von 11)

| Anbieter | Grund im Bericht | tatsächliche Ursache |
|---|---|---|
| efa-duesseldorf | Adresse nicht gefunden: „Collenbachstr. 10, Düsseldorf (PLZ auf der Seite nicht angegeben)“ | **Code.** Das Modell schrieb einen Kommentar in die Adresse. `streetPart` (`scripts/pipeline/io/geocode.ts`) entfernt die Klammer, gibt aber nichts zurück, wenn die Straße der erste Teil ist (`i > 0`). Nominatim findet „Collenbachstr. 10, Düsseldorf“ sofort (40476, Pempelfort). Die PLZ fehlt nicht. |
| drk-familienbildung-duesseldorf | Adresse nicht gefunden: „Tellerringstraße 56, Düsseldorf“ | **Webseite und Code.** Die Kursliste schreibt „Tellerringstr.56“ und „Telleringstr. 56“. Nominatim kennt nur die richtige Schreibweise. Ein einziger nicht gefundener Ort verwirft den ganzen Kandidaten (`io/discover.ts`, Schleife über `venues`, `break`), obwohl der DRK weitere Orte nennt. |
| sharky-duesseldorf | kein Angebot für 0–3 Jahre mit künftigem Termin | **Tiefe.** Das Bewerten wählte die Übersichtsseite als Terminseite. Die Termine stehen auf Detailseiten (`/baby-schwimmen/show/16884/` usw.), die der Handkatalog nennt. Der Ertragsbeweis lieferte `keine-termine`. |
| djk-eibach, post-sv-nuernberg, schwimmschule-baer-ritterbad | Kursort ohne Postadresse | **Regel.** Turnhalle bzw. Bad stehen nur mit Namen auf der Seite. Der Prompt (`discover-assess.md`) verlangt eine vollständige Postadresse, der Geocoder sucht nur Adressen. „Ritterbad Nürnberg“ ist in OpenStreetMap ein benannter Ort. |
| cvjm-gostenhof-miniclub | Ertragsbeweis ohne künftigen Termin | **Tiefe.** Der Handkatalog liest die Termine aus dem iCal-Feed von `evangelische-termine.de`. Das Bewerten sah nur die Gruppenseite. |

Keiner der sieben scheiterte am Urteil des Modells „passt / passt nicht“. Alle scheiterten an Adressen, an der Seitenauswahl oder an einer harten Regel. Dazu kommt: „Seite nicht abrufbar“, „Adresse nicht gefunden“, ein inhaltliches Nein und kein Ertrag stellen den Kandidaten **8 Wochen zurück** (`postpone`, `WIEDERVORLAGE_DAYS`); nur ungültige Antworten und Ausnahmen des Geocoders (jede, nicht nur 403/429) werden nicht zurückgestellt (`io/discover.ts`, `persist: false`). Im Modus live wirken ein Abruf- oder Adressfehler also zwei Monate nach.

### Nicht gefunden (9 von 20)

Wo die neun stehen, hat eine Recherche am 2026-10-25 geprüft (Abschnitt „Quellen“). Kurz: Sieben stehen in einer maschinell lesbaren Liste, die das Entdecken nicht abfragt. Für zwei gibt es keine: musikfuechse (Nürnberg) und zwergenstube-duesseldorf (der kindaling-Eintrag ist entfernt).

### Strukturelle Ursachen

1. **Quellen.** Das Entdecken kennt drei Sammelkalender, einzelne HTML-Linklisten (`role: verzeichnis`) und die Websuche. Die Listen, in denen Anbieter tatsächlich stehen (Navigator, Buchungsplattformen, Vereins- und Gemeindelisten, Hebammenliste), fragt es nicht ab. Welche Quellen es in einer Stadt gibt, steht nirgends; eine neue Stadt beginnt bei null.
2. **Websuche.** 10 feste Begriffe mit dem Regionsnamen, je ein Haiku-Aufruf mit höchstens 10 Kandidaten und 10 Schritten. Häufige Formate fehlen (Familiencafé, Spielgruppe, Babytreff, Mutter-Kind-Gruppe). Der Prompt verwirft Sammelportale, obwohl die Suche bei deutschen Lokalanfragen fast nur solche liefert (Recherche, Frage 3).
3. **Tiefe.** Das Bewerten sieht eine Seite und bis zu zwei Kontaktseiten, in einem Aufruf mit Haiku, und darf höchstens 5 Orte und 8 Programmseiten nennen (`AssessEntrySchema`). Detailseiten, iCal-Feeds, Kursportale und Orte auf Unterseiten bleiben unsichtbar. Der Handkatalog brauchte für dieselben Anbieter mehrere Programmseiten, `follow`, `partChars`, `hint` und Orte von Unterseiten.
4. **Härte.** Ein Adressfehler zählt wie ein inhaltliches Nein. Eine zweite Runde gibt es nicht, ein Fallback-Modell beim Bewerten auch nicht (der Nachtlauf hat eines).
5. **Messung.** 10 Fälle je Eval, ad hoc gewählt, ohne Kennzahl je Stufe, ohne Zielwert. Ob ein aufgenommener Eintrag so viele Termine liefert wie der Handeintrag, misst niemand. Beispiel: Rasselband wurde aufgenommen. Die Kontaktseite nennt rund ein Dutzend Eltern-Kind-Zeiten von Montag bis Freitag, der Ertragsbeweis extrahierte eine (freitags 17:00).

## Quellen (Recherche 2026-10-25)

Ein Subagent hat per Abruf und Websuche geprüft, ohne Modellaufruf der Pipeline. Alle Angaben unten sind abgerufen und geprüft, außer wo „(V)“ steht. Die Websuche des Rechercheagenten lief über einen Index, der deutsche Lokalanfragen schlecht bedient; ob die Websuche der Pipeline denselben nutzt, ist offen (V, S0 misst es).

### Fundorte der neun nicht gefundenen

| Anbieter | Fundort |
|---|---|
| kinderschutzbund-duesseldorf | Familien-Navigator, Anbieterliste (`fhianbieter/public?einrichtungId=39`); die Website steht im Feld „Link Anbieter“ der Angebote |
| sos-mgh-hell-ga | Karte der Mehrgenerationenhäuser (`mehrgenerationenhaeuser.de`, „Häuser in Ihrer Nähe“); kidsgo „Krabbel- und Kindergruppen, Düsseldorfer Raum“; Navigator („SOS-Kinderdorf Düsseldorf“) |
| mama-macht | kikudoo-Geo-API (`api.kikudoo.com/api/search/locations/?lat=…&lng=…&radius=12&age_groups=baby,child,parents`), Anbieter `mama-macht-1`; kidsgo (speist aus kikudoo) |
| tsv-jahn-oberkassel-eltern-kind | Vereinssuche des Landessportbunds NRW (JSON `vereinssuche.lsb.nrw/Verein/getliste/…`), nur Name und PLZ; das Eltern-Kind-Turnen steht nur auf der Vereinsseite |
| die-familienbox | eversports-Städteliste `eversports.de/l/baby-und-kind/nuernberg` (4 Studios), Profil `eversports.de/s/die-familienbox`; nur mit Browser hinter Cloudflare |
| ev-suedstadt-krabbelgruppen | keine Liste mit Gruppen; Fundweg: Gemeindeliste (Filter des FEB-Verzeichnisses mit 51 Gemeinden und Einrichtungen, OSM), dann die Gemeindeseite prüfen. In `evangelische-termine.de` stehen von dieser Pfarrei nur Gottesdienste |
| hebamme-elena-paulus | GKV-Hebammenliste (`antraege.gkv-spitzenverband.de`, Umkreissuche mit Filter Rückbildung): Name und E-Mail, keine Website; die Website findet erst eine Namenssuche |
| musikfuechse | keine strukturierte Quelle gefunden |
| zwergenstube-duesseldorf | keine strukturierte Quelle mehr (kindaling-Eintrag entfernt) |

### Strukturierte Quellen

| Quelle | Reichweite | Inhalt | Umfang | Abruf |
|---|---|---|---|---|
| Familien-Navigator, Angebote (`fhiangebot/searchredesign?einrichtungId=<n>`) und Anbieterliste | NRW, ≈ 70 Kommunen | Träger, Anbieter, `AnbieterUrl`, `TraegerUrl`, Alter | Düsseldorf: 189 Anbieter (davon 79 Familienzentren), ≈ 40 Träger mit Website für 0–3 (Plan 0042) | JSON, robots.txt ohne Sperre |
| kikudoo-Geo-API | bundesweit | Anbieter mit Lage und Kurszahl | Düsseldorf 12 (12 km), Nürnberg ≈ 9 | JSON, robots.txt erlaubt alles |
| eversports `/l/baby-und-kind/<stadt>` | bundesweit | Studios | Düsseldorf 2, Nürnberg 4 | nur mit Browser hinter Cloudflare; robots.txt erlaubt |
| kidsgo `/kurse/<kategorie>/<raum>/` | bundesweit | Kurs, Anbieter, Adresse | Düsseldorfer Raum z. B. Krabbelgruppen 52, Turnen 43, Babykurse 54 (Raum größer als die Stadt); Nürnberg 23 | JavaScript, also Browser; `/suche/` gesperrt, Kategorieseiten erlaubt |
| Karte der Mehrgenerationenhäuser | bundesweit | Häuser mit Website | Düsseldorf 1, Nürnberg/Fürth 3 | eine Seite mit Markern |
| Vereine: LSB NRW `getliste`; Vereinsverzeichnis des SportService Nürnberg (PDF, 214 Websites, Stand 08/2026) | NRW bzw. Nürnberg | Vereinsname, PLZ bzw. Website, kein Angebotsfilter | Düsseldorf 712 Vereine (PLZ 40…), Nürnberg 214 | JSON bzw. PDF |
| Gemeinden: OSM `amenity=place_of_worship` mit `website`; FEB-Filter (Nürnberg); evdus.de, katholisches-duesseldorf.de | bundesweit (OSM), sonst lokal | Gemeinde mit Website | Düsseldorf 99, Nürnberg 99 (OSM, mit Website); FEB 51 | Overpass bzw. HTML |
| GKV-Hebammenliste | bundesweit | Name, Ort, Leistungen, keine Website; Adressen laut GKV aus Datenschutzgründen nicht veröffentlicht | Nürnberg 15 km: Grenze 50 erreicht; Fürth 6 km: 29 | JSON-POST, kachelweise |
| frankenkids, Veranstalter (`/wp-json/tribe/events/v1/organizers`) | Nürnberg, Fürth | Veranstalter, oft mit Website, ohne Regionsfeld | 1 356 | REST-JSON (Adapter für Termine besteht) |

Wenig bringen kindaling (wenige Einträge, keine Anbieter-Websites, Einträge verschwinden) und die PEKiP-Kurssuche (fast nur BRK). Neue Anbieter, die nicht im Katalog stehen, zeigte die Stichprobe u. a. auf kidsgo (The Little Gym, Montessori Family Center, Hebammenpraxis 37, SV Laufamholz, SpVgg Mögeldorf), kikudoo (BauchHerzFamilie Fürth, MaxiSteps, musikwerkStudio), eversports (hey hilde, Life & Yoga Fürth) und bei den Mehrgenerationenhäusern (AWOthek Südstadt).

### Folgerung

- Mit diesen Quellen wären 18 der 20 ausgeblendeten gefunden worden: die 11 schon gefundenen und 7 der 9 übrigen. Ziel 1 (≥ 90 % je Region) ist erreichbar, mit einem Fehlschlag Reserve je Region.
- Die meisten Quellen sind **bundesweit** und brauchen je Stadt nur Parameter (Mittelpunkt, Radius, PLZ, Raum-Name). Wenige sind an ein Land oder eine Stadt gebunden (Navigator: NRW; LSB: NRW; frankenkids, FEB, Vereinsverzeichnis: Nürnberg). Für eine neue Stadt wie Oldenburg gilt also: bundesweite Quellen ohne neuen Code, dazu lokale Listen, die die Erkundung findet (E2).
- Die Quellen zerfallen in **Listen mit Angebotsbezug** (Navigator, kikudoo, eversports, kidsgo, Mehrgenerationenhäuser), deren Einträge meist passen, und **breite Inventare** (Vereine, Gemeinden, Hebammen), in denen nur ein kleiner Teil Angebote für 0–3 hat. Die zweite Art braucht eine Vorprüfung im Code, bevor ein Modell bewertet (E5.1).
- Stadtteil plus Format brachte in den Stichproben nichts (Recherche, Frage 3). Die Suche nach einem **Namen aus einer Liste** („Hebamme Elena Paulus Nürnberg“) ist der bessere Einsatz der Websuche.

## Ziel

Gemessen mit dem neuen Entdecken-Eval (E7) über die festen Stichproben für Nürnberg und Düsseldorf, zwei Läufe je Konfiguration, Mittelwert, je Region:

1. **Gefunden ≥ 90 %** der ausgeblendeten Anbieter (von einer Quelle als Kandidat geliefert).
2. **Wiedergefunden ≥ 80 %** (würde aufgenommen).
3. **Falsch aufgenommen: 0.** Jede Aufnahme, die zu keinem ausgeblendeten Anbieter passt, wird von Hand beurteilt (E7) und steht mit Urteil im Eval-Ergebnis. Eine zweite Aufnahme desselben Anbieters (etwa Plattform-Profil neben eigener Website) zählt als falsch.
4. **Ertrag ≥ 80 %.** Ein wiedergefundener Anbieter trifft im Ertragsbeweis mindestens 80 % der künftigen Termine seines Handeintrags, gemittelt über alle wiedergefundenen. Referenz ist der Ertragsbeweis des ausgeblendeten Handeintrags im selben Lauf (E7), Zuordnung 1:1 über Ort und Beginn, je Anbieter auf 100 % gedeckelt. Anbieter, deren Handeintrag `follow` braucht, zählen erst ab S2 mit (E5.2).
5. **Keine Verwerfung aus technischem Grund.** Kein Kandidat wird wegen Abruf (Netzfehler, 5xx), Bot-Sperre, Geocoder oder ungültiger Antwort verworfen oder für 8 Wochen zurückgestellt. Solche Fälle sind Klärfälle (E5.4). Eine Seite mit 404 oder 410 gilt weiter als verworfen.
6. **Neue-Stadt-Probe.** Die Erkundung (Stufe A, E2) auf Düsseldorf, mit allen Düsseldorfer Anbietern *und* `verzeichnis`-Einträgen ausgeblendet, als wäre die Stadt neu:
   - (a) mit allen Methoden: mindestens 90 % der heutigen Düsseldorfer Katalog-Anbieter als Kandidaten und ein Profil, das ohne Änderung von Hand für Stufe B taugt;
   - (b) nur mit bundesweiten Methoden und der Quellensuche, ohne Navigator und LSB: gemessen und berichtet, ohne Schwelle (N1). Das ist die Erwartung für eine Stadt ohne Landesquellen wie Oldenburg; der Düsseldorfer Katalog entstand gegen den Navigator (Plan 0042, Ziel 2), deshalb allein (a) wäre zirkulär.

Erst wenn 1–4 je Region erreicht sind, geht `ENTDECKEN_MODUS` auf `live` (S6).

## Nicht-Ziele

- **Stufen C und D** (E1): seltenere Extraktion neuer Kurse und nächtliche, deterministische Aktualisierung von Plätzen und Anmeldestand. Das ist der Nachtlauf, nicht das Entdecken: Stufe D baut Plan 0046 (`docs/plans/0046-verfuegbarkeit-per-rezept.md`), Stufe C seltener ein Folgeplan danach.
- **Eine neue Stadt anlegen.** `regions.ts`, Stadtteile, Netz und Fahrplan bleiben Skill, Abschnitt 6. Dieser Plan liefert die Erkundung der Anbieter und Quellen für eine angelegte Region. Eine Stadt in einem neuen Netz (Oldenburg: VBN) braucht weiterhin Netz-Eintrag, Feed und Budgets.
- **Kosten senken.** Kosten werden wie heute je Aufruf erfasst und berichtet (Plan 0032, E8). Die Bremsen schützen vor Schleifen, nicht vor Ausgaben (E8). Der Trade-off kommt nach `docs/ideas.md`.
- **Fürth als eigene Stichprobe.** Fürth hat 8 Anbieter, alle vom Entdecken. Fürth läuft mit, die Ziele gelten für Nürnberg und Düsseldorf.
- **Verzeichnisse als Terminquelle.** Verzeichnisse und Plattform-Listen liefern nur Kandidaten (Name, Website), nie Angebote; nichts davon wird angezeigt (Impressum des Navigators, Plan 0042, Nicht-Ziele).
- **Bestehende Einträge ändern.** G2 bleibt: Das Entdecken legt nur neue Einträge an. Neue Programmseiten bekannter Anbieter bleiben Hinweise im Bericht.
- **Extraktion im Nachtlauf verbessern.** Ziel 4 misst den Ertrag des *entdeckten Eintrags*. Liegt die Lücke in der Extraktion selbst (Rasselband), gehört sie in einen Extraktions-Eval-Fall (Skill, Abschnitt 4).
- **robots.txt und User-Agent im Nachtlauf.** Bleibt ein eigener Plan (Plan 0042, Nicht-Ziele). Dieser Plan regelt nur die Abrufe des Entdeckens und die Aufnahme neuer Anbieter (E6).
- **Kartendienste mit Schlüssel oder Nutzungsvertrag** (Google Places u. ä.). Erst, wenn Ziel 1 ohne sie verfehlt wird.

## Entscheidungen

### E1 – Vier Arten von Läufen; dieser Plan baut A und B

| Stufe | Takt | Zweck | Plan |
|---|---|---|---|
| **A – Erkunden** | einmalig je Region, danach etwa jährlich | alle Methoden und eine offene Quellensuche; Bericht mit Ertrag je Methode und Vorschlag für das Recherche-Profil | dieser Plan |
| **B – Entdecken** | monatlich je Netz | neue Anbieter mit den Methoden des Profils | dieser Plan |
| **C – Kurse** | täglich bei geänderter Seite wie heute; seltener (wöchentlich) erst mit einem Folgeplan nach Plan 0046 | neue und geänderte Kurse bekannter Anbieter (Modell) | heute; Folgeplan |
| **D – Verfügbarkeit** | nächtlich | Plätze und Anmeldestand per Rezept (deterministisch), Rückfall der Modellwert der Extraktion | Plan 0046 |

Stufe A und B sind derselbe Code (`pipeline discover`) mit verschiedenem Umfang: A fährt alle Methoden, die für die Region in Frage kommen, und schreibt nie in den Katalog (immer Trockenlauf). B fährt die Methoden des Profils und nimmt im Modus live auf.

Innerhalb eines Laufs gibt es drei Phasen:

1. **Inventar** (E3): Methoden liefern Einträge `{name, url?, ort?, methode, art}`. Mehrere Methoden für denselben Anbieter werden zusammengeführt (normalisierte URL, sonst Host plus ähnlicher Name wie im Vorfilter, ohne URL Name plus Ort), damit der Bericht zeigt, welche Methode was findet. Der Vorfilter entfernt Bekanntes.
2. **Auflösung** (E4): Einträge ohne eigene Website (Hebammenliste, Vereinsliste, Plattform-Profile, Portal-Treffer der Websuche) bekommen über eine Namenssuche ihre Website. Ohne Website bleibt das Plattform-Profil die Fund-URL, wenn es Termine zeigt (kikudoo, eversports, `booking-systems.md`); die Erkundung bleibt dann unterhalb des Profil-Pfads (E5.1).
3. **Prüfung** (E5, E6): je Kandidat Erkundung der Website, Vorprüfung, Bewerten, Orte, Ertragsbeweis, mit zweiter Runde und Klärfällen.

Begründung: Die Ausgangslage zeigt getrennte Engpässe (9 nicht gefunden, 7 nach dem Fund verloren), und die Recherche zeigt, dass die fehlenden Anbieter in Listen stehen, deren Verfügbarkeit von Stadt zu Stadt wechselt. Das Profil hält fest, was in einer Stadt wirkt; getrennte Phasen machen jede Stufe einzeln messbar (E7).

Takt B **monatlich statt wöchentlich** (Änderung an ADR 0026, Punkt 1): Neue Anbieter erscheinen selten, die breiten Inventare werden rollend geprüft (E3), und das Abo-Kontingent wird weniger belastet. `discover.yml` behält die Wochen-Crons (GitHub-Cron verknüpft Tag des Monats und Wochentag mit „oder“). Der Job `modus` (ohne Checkout) setzt bei `github.event_name == schedule` die Ausgabe `skip=true`, wenn der Tag des Monats (UTC) größer als 7 ist; `entdecken`, `veroeffentlichen` und `ampel` laufen dann nicht, die Ampel wird also nicht rot. In diesen ausgelassenen Wochen stellt ein kurzer Job nur den Geocoder-Cache wieder her (`actions/cache` löscht Einträge, die 7 Tage nicht genutzt wurden). `workflow_dispatch` läuft immer. Ein Test parst `discover.yml` wie `scripts/lib/push-schedule.test.ts` und prüft Bedingung und Abhängigkeiten. Das ändert auch die Wochentage aus ADR 0032, Punkt 8 (Samstag `vrr`, Sonntag `vgn`), die bleiben, aber nur am ersten Wochenende des Monats.

### E2 – Recherche-Profil je Region und Stufe A

- **Datei** `data/recherche/<region>.yaml`, Schema `ResearchProfile` in `scripts/pipeline/lib/research-profile.ts` (Zod; Pipeline-Konfiguration neben dem Zustand in `raw.ts` und `discover-state.ts`, kein Vertrag der Website; die Abweichung von „Ein Datenvertrag“ in `docs/architecture.md` nennt ADR 0033 wie ADR 0026 für `data/raw`). `pnpm data:validate` prüft sie. Gepflegt wird sie von Hand bzw. per Skill nach dem Bericht von Stufe A; kein Lauf schreibt sie. Sie liegt bewusst nicht unter `data/discover/`, das nur Läufe schreiben (CLAUDE.md, „Daten“; der Abschnitt bekommt einen Satz zu `data/recherche/`).
- **Inhalt:**
  - `region`, `plz` (Liste), `geprueft` (Datum). Das Bundesland leitet der Code aus dem Netz der Region ab (`NETWORKS[…].holidays`, `DE-BY` → `by`), es steht nicht im Profil.
  - `methoden`: Liste `{methode, params?, notiz}`; `methode` aus `METHODS` (E3), `params` je Methode (`einrichtungId` beim Navigator, `raum` bei kidsgo, `stadt` bei eversports, `osmRelation` bei `osm-gemeinden`, `verzeichnis` bei `linkliste`). Mittelpunkt und Radius leitet der Code aus `bbox` in `REGIONS` ab, nicht das Profil.
  - `begriffe` (zusätzliche Suchbegriffe der Region, optional).
- **Methoden je Bundesland.** Jede Methode in `METHODS` nennt ihre Reichweite (`bundesweit` oder Liste von Ländern bzw. Regionen). `data:validate` lehnt eine Methode ab, die für das Land der Region nicht gilt, und warnt, wenn ein `verzeichnis`-Eintrag der Region in keiner `linkliste` des Profils steht.
- **Ohne Profil** verhält sich Stufe B wie heute (Sammelkalender, Linklisten der `verzeichnis`-Einträge der Region, Websuche) und meldet „kein Recherche-Profil“ unter „Hinweise“.
- **Gemessener Ertrag** je Methode schreibt der Lauf in den Zustand `data/discover/<region>.json`, Feld `methoden`: je Methode Datum des letzten Laufs, Funde, davon eindeutig (keine andere Methode fand sie), davon aufgenommen. Das Profil enthält keine Messwerte.
- **Stufe A** (`pnpm pipeline discover --region <id> --erkunden`, immer Trockenlauf, nie Commit):
  1. **Quellensuche** (`prompt/discover-sources.md`, `tools: web`): „Welche Verzeichnisse, Portale, Familienzentren-Listen, Vereins- und Gemeindelisten, Kalender gibt es für Familien mit Kindern unter 3 in <Stadt>?“ Ausgabe `{name, url, art, warum}`. Diese Funde werden nicht bewertet, sondern im Bericht als Vorschlag für `linkliste` oder neue Methoden gelistet.
  2. alle Methoden, die für das Land der Region gelten. Parameter kommen aus `data/recherche/<region>.yaml`, falls vorhanden, sonst aus `--profil <datei>` (ein Entwurf, den der Mensch vor dem ersten Lauf von Hand anlegt, etwa mit `einrichtungId`); Methoden ohne nötige Parameter entfallen mit Hinweis.
  3. Websuche nach Formaten und Namenssuche wie Stufe B;
  4. Prüfung wie Stufe B (Trockenlauf, G3 aus), damit der Ertrag je Methode bis „würde aufnehmen“ gemessen ist.
  - **Bericht** (zusätzlich zu dem von B): je Methode Funde, eindeutige Funde (keine andere Methode fand sie), würde aufnehmen; eine Überschneidungsmatrix der Methoden; als reine Anzeige eine grobe **Schätzung der Gesamtzahl** passender Anbieter aus der Überschneidung der zwei ertragreichsten Methoden (Lincoln-Petersen: N ≈ n₁·n₂/m; weil die Methoden nicht unabhängig sind, fällt die Zahl eher zu niedrig aus; sie ist kein Ziel); ein **Profilvorschlag** als `runs/<datum>/discover/profil-<region>.yaml`: Methoden mit mindestens einem eindeutigen „würde aufnehmen“, Vorschläge der Quellensuche, `plz` aus OSM (`boundary=postal_code` in der Gemeinde).
  - **Ziel 6** misst `pnpm pipeline discover --region duesseldorf --erkunden --hide-region [--methoden bundesweit]`: `--hide-region` blendet alle `anbieter`- und `verzeichnis`-Einträge der Region aus (nur Trockenlauf), `--methoden bundesweit` lässt nur Methoden mit Reichweite `bundesweit` und die Quellensuche zu.
- **Neue Stadt** (Oldenburg): Skill, Abschnitt 6 legt die Region an; dann Stufe A; der Mensch übernimmt den Profilvorschlag (Skill) und prüft die Stichprobe „würde aufnehmen“; dann Stufe B einmal mit `--bootstrap` (G3 aus den `workflow_dispatch`-Eingaben).

Verworfen:
- **Quellen als `role: verzeichnis` mit `adapter` im Katalog** (erster Entwurf): verlangt eine Schemaänderung gegen ADR 0025, Punkt 6, und vermischt Katalog (was der Nachtlauf abruft) mit Rechercheplan. Bestehende `verzeichnis`-Einträge bleiben und werden über die Methode `linkliste` aus dem Profil genutzt.
- **Profil automatisch schreiben:** Ein Modell würde die Konfiguration des nächsten Laufs bestimmen (ADR 0026, Punkt 5). Der Vorschlag geht über einen Menschen.

### E3 – Inventar: Methoden

Jede Methode ist ein reiner Parser in `scripts/pipeline/lib/sources/methods/<name>.ts` (Fixture mit fiktiven Namen) plus Abruf in `scripts/pipeline/io/methods.ts`. Schnittstelle:

```ts
interface InventoryEntry {
  name: string;
  url?: string;                 // eigene Website oder Plattform-Profil
  ort?: { adresse?: string; plz?: string; geo?: { lat: number; lon: number } };
  methode: MethodId;
  art: "angebotsbezug" | "breit";
  /** stabiler Schlüssel der Quelle, wenn `url` fehlt (z. B. `lsb-nrw:<vereinsnummer>`); nie für Personen */
  schluessel?: string;
  person?: boolean;             // Einzelperson aus einer Liste ohne Website (GKV): nie gespeichert, E6.4
}
fetchMethod(methode: MethodId, params: unknown, ctx: {
  region: RegionId; bbox: BBox; plz: readonly string[]; catalog: readonly Provider[]; today: string;
}): Promise<{ entries: InventoryEntry[]; hints: string[] }>
```

`DiscoverDeps` bekommt `fetchMethod`, damit Tests Methoden ersetzen. Eine Methode warnt, wenn die Trefferzahl einer Seitengrenze entspricht. Fällt eine aus, kostet sie nur ihre Funde; der Bericht nennt sie unter „Hinweise“ (wie `fetchAggregatorCandidates`). Reihenfolge im Lauf: Sammelkalender und Listen mit Angebotsbezug zuerst, dann Websuche, dann breite Inventare; bei `--netz` mit mehreren Regionen bekommt jede Region einen Anteil am Zeitbudget nach Zahl ihrer Katalog-Anbieter, mindestens 20 %, damit Fürth nicht die Zeit von Nürnberg aufbraucht.

Reichweite ist `bundesweit`, `land:<xx>`, `region:<id>` oder `ortsunabhaengig` (arbeitet nur mit Namen, Katalog oder Websuche). `--methoden bundesweit` (Ziel 6 b) lässt `bundesweit` und `ortsunabhaengig` zu, aber keine `linkliste` und keine Sammelkalender, weil beide lokale Quellen sind.

| Methode | Art | Reichweite | Parameter |
|---|---|---|---|
| `navigator` | Angebotsbezug | `land:nw` | `einrichtungId` |
| `kikudoo` | Angebotsbezug | bundesweit | – (bbox) |
| `kidsgo` | Angebotsbezug | bundesweit | `raum`; nur Einträge mit PLZ aus `plz` |
| `eversports` | Angebotsbezug | bundesweit | `stadt`; nur nach N5 |
| `mgh` | Angebotsbezug | bundesweit | – (bbox) |
| `frankenkids-veranstalter` | Angebotsbezug | `region:nuernberg`, `region:fuerth` | – |
| `lsb-nrw` | breit | `land:nw` | – (`plz`) |
| `vereine-nuernberg` | breit | `region:nuernberg` | – |
| `osm-gemeinden` | breit | bundesweit | `osmRelation` (Grenze der Stadt, wie in `src/domain/districts.ts`: Fürth 62374, Düsseldorf 62539; Nürnberg über `name` und `admin_level=6`, S0 trägt die Relation nach) |
| `gkv-hebammen` | breit, ohne Website | bundesweit | – (bbox, kachelweise) |
| `linkliste` | je nach Liste | lokal (`region` der Liste) | `verzeichnis` (ID eines `role: verzeichnis`-Eintrags) |
| `schneeball` | breit | `ortsunabhaengig` | – |
| `websuche`, `namenssuche` | Angebotsbezug | `ortsunabhaengig` | – (E4) |
| `sammelkalender` | Angebotsbezug | lokal (Sammelkalender der Region) | – (wie heute, `aggregatorFinds`) |

- **Navigator:** aus den Angeboten für 0–3 je Träger und Anbieter Name, `AnbieterUrl` bzw. `TraegerUrl` und Zahl der Einträge; dazu die Anbieterliste für Namen ohne Angebot im Fenster. Funde bekannter Websites werden Hinweis statt Kandidat (wie `aggregatorFinds`).
- **kidsgo, eversports** brauchen den Browser (`io/browser.ts`). kidsgo: nur Kategorieseiten, `/suche/` bleibt ungenutzt (robots.txt).
- **Schneeball:** Programmseiten der Katalog-Anbieter der Region über `fetchPage` und `extractPage` (nicht `fetchInputs`, das liefert keine Links), externe Links wie `directoryFinds`. Behandelt wie ein breites Inventar (Vorprüfung).
- **LSB NRW:** S0 klärt, ob der Endpunkt der Vereinsdetails eine Website liefert. Sonst braucht jeder der 712 Düsseldorfer Vereine einmal die Namenssuche (≈ 72 Aufrufe mit je 10 Namen); das Ergebnis wird gecacht (nächster Punkt), danach nur neue Vereine.
- **Rollende Prüfung der breiten Inventare.** `DiscoverState` bekommt `inventar`: je normalisierter URL oder `schluessel` einer Organisation `geprueft` (Datum), `ergebnis` (`ohne-bezug`, `kandidat`, `klaerfall`, `ohne-website`) und bei Auflösung die gefundene URL. Ein Lauf prüft zuerst neue Einträge, dann die ältesten; `ohne-bezug` und `ohne-website` kommen nach 26 Wochen wieder dran. Einträge mit `person: true` (GKV) stehen nie in `inventar` und werden in jedem Lauf neu aufgelöst (Datenschutz, E6.4).
- `MAX_DIRECTORY_FINDS` gilt nur noch für `linkliste`; der Vorfilter läuft vor jeder Grenze.

### E4 – Auflösung und Websuche

- **Namenssuche** (`prompt/discover-resolve.md`, `tools: web`): für Einträge ohne Website bis zu 10 Namen je Aufruf mit Ort und Art („Hebamme Elena Paulus, Nürnberg, Rückbildung“). Antwort je Name: URL oder `null`. Eine URL zählt nur, wenn ihr Abruf **den Namen und** den Ort oder eine PLZ der Region enthält. Ob die Antwort aus einem echten Suchtreffer stammt, sieht der Code nicht (`io/llm.ts` liefert nur das Ergebnis); die Bestätigung per Abruf ersetzt das.
- **Portal-Treffer auflösen statt verwerfen.** Der Suchprompt nimmt Sammelportale und Buchungsplattformen auf, wenn sie einen Veranstalter nennen: `{name, url, portal: true}`. Der Code gibt den Namen an die Namenssuche. Portale in `abgelehnt` (Plan 0042, E6) bleiben als Fund-URL gesperrt.
- **Formatsuche** wie heute, mit Begriffen in Gruppen nach `CATEGORIES` (`lib/discover-terms.ts`), je Gruppe ein Aufruf mit 3–5 Begriffen. Neu u. a. Familiencafé, Elterncafé, Offener Treff, Spielgruppe, Mutter-Kind-Gruppe, Babytreff, Kinderturnen 1–3 Jahre, Babyyoga, Rückbildung mit Baby, Delfi, Prager Eltern-Kind-Programm, Zumbini, Kangatraining, Babytheater, Bilderbuchkino; dazu `begriffe` aus dem Profil. `SEARCH_MAX_TURNS` 10 → 30, Schema `SearchResponse` `max(20)` → `max(25)`.
- **Stadtteil-Matrix nur als Messung** in S3: Die Recherche fand mit Stadtteil plus Format nichts. Für die Messung nimmt `--suchgebiete` je Region eine feste Liste aus `lib/discover-terms.ts` (Düsseldorf 10 Stadtbezirke, Nürnberg 10 statistische Stadtteile, je Gebiet die Stadtteilnamen aus `src/domain/districts.ts`). Ins Profil kommt sie erst, wenn sie im Eval eindeutige Funde bringt; das wäre ein Nachtrag zu diesem Plan.

Verworfen:
- **Rechercheagent mit allen Werkzeugen** (Bash, Dateien) im Workflow: Webtext könnte Befehle einschleusen; ADR 0026, Punkt 5 trennt Modell und Schreibrechte. Suche und Auflösung bleiben bei `tools: web`, Ausgabe nur nach Schema.
- **Nur mehr Suchbegriffe:** Die Recherche zeigt, dass die fehlenden Anbieter in Listen stehen, nicht in Suchtreffern.

### E5 – Prüfung in die Tiefe

1. **Website-Erkundung im Code** (`lib/site-crawl.ts` wählt rein, `io/` ruft ab). Statt Fund-Seite plus zwei Kontaktseiten ruft der Code bis zu 20 Seiten derselben Website ab (`sameSite`), Breitensuche bis Tiefe 2 ab Fund-Seite und Startseite, geordnet nach Linktext und Pfad (Kurs, Termin, Programm, Baby, Eltern-Kind, Krabbel, Familie, Kontakt, Anfahrt, Standort, Impressum). Erkannt und mitgeliefert werden iCal-Links (`.ics`, `webcal:`, `evangelische-termine.de/ical`), PDF-Programme (Text über `pdftotext`) und Buchungs-Widgets bekannter Systeme (`booking-systems.md`). Höflichkeit und robots.txt nach E6.
   - **Plattform-Profile und geteilte Websites:** Liegt die Fund-URL auf einer geteilten Website (E7: `SHARED_HOSTS` und automatisch erkannte), erkundet der Code nur Seiten unterhalb des Pfads der Fund-URL, nie die Startseite des Hosts; nur diese Seiten und ihre Links gelten in `allowedUrlsOf`. Sonst würden fremde Profile auf demselben Host zu Programmseiten.
   - **Leere Seiten:** Liefert eine Seite kaum Text (unter 500 Zeichen, nur Skript), ruft der Code sie einmal mit dem Browser ab (`io/browser.ts`); bleibt sie leer, ist der Kandidat ein Klärfall, nie `ohne-bezug`.
   - **Vorprüfung im Code** für breite Inventare (E3): Nur wenn `isRelevantStrict` (neu in `lib/relevance.ts`, ohne die zu breiten Muster `u3` und `0\s*[-–bis]+\s*3`, mit Wortgrenzen) auf einer erkundeten Seite anschlägt, geht der Kandidat ans Modell; sonst `ohne-bezug`. S2 misst den Anteil der Stichproben-Anbieter, die sie bestehen (Soll 100 %), S3 die Durchlassquote auf den breiten Inventaren beider Regionen, sobald es sie gibt. Listen mit Angebotsbezug und Funde der Websuche gehen immer ans Modell.
   - Das Modell bekommt alle Seiten als `## SEITE: <URL>` (je Seite höchstens 15 000 Zeichen, zusammen höchstens 150 000) und die Linklisten.
   - Das erweitert ADR 0026, Punkt 2 (Ausnahme „zwei Kontaktseiten“ → „Erkundung derselben Website“); Teil von ADR 0033. Der Grundsatz bleibt: Der Code ruft ab, das Modell liest. Programmseiten im Eintrag müssen aus den abgerufenen URLs und ihren Links stammen (`allowedUrlsOf`).
2. **Bewerten** mit dem Modell laut Eval (S4), bei ungültiger Antwort einmal mit dem Fallback-Modell: das nächststärkere (Haiku → Sonnet → Opus; bei Opus ein zweiter Versuch mit Opus). `AssessEntrySchema`: `venues.max(5)` → `max(20)`, `programme.max(8)` → `max(20)`.
   - `follow`: Das Bewerten darf `follow` vorschlagen, wenn eine Liste per Folgelink blättert; der Code übernimmt es nur, wenn die Erkundung den Folgelink gesehen hat und eine Probe mit `withFollowPages` mindestens eine Folgeseite liefert. Das ersetzt den Satz „Das Bewerten beim Entdecken setzt `follow` nie“ im Nachtrag von ADR 0026 (Teil von ADR 0033).
   - `partChars`: Scheitert der Ertragsbeweis mit `truncated`, folgt einmal ein zweiter mit `partChars: 4500` (Wert der Kufer-Träger, Plan 0042); gelingt er, steht `partChars` im Eintrag.
   - Orte dürfen als „Name, Ort“ kommen, wenn die Seite keine Postadresse nennt (Turnhalle, Bad); dann gilt E6.3. Diese Prompt-Änderung gehört zu S1a.
3. **Zweite Runde nach dem Ertragsbeweis.** Liefert der Ertragsbeweis kein Angebot, bekommt das Bewerten einmal die Rückmeldung („Programmseite X lieferte keine Termine“) mit denselben Seiten und darf andere Programmseiten wählen. Dann ein zweiter Ertragsbeweis. Erst danach gilt „kein Ertrag“.
4. **Drei Ausgänge statt zwei.**
   - **aufgenommen**: wie heute (G1–G4).
   - **verworfen**: inhaltliches Nein des Modells, kein Ertrag nach der zweiten Runde, Seite 404/410 oder robots.txt sperrt die Programmseiten (E6). Wiedervorlage nach 8 Wochen wie heute.
   - **Klärfall**: technischer Grund (Netzfehler, 5xx, Bot-Sperre, leere Seite, robots.txt nicht lesbar, kein Ort nach E6.3, ungültige Antwort nach Fallback, Zeitbudget, Limit). Kein Eintrag in `zurueckgestellt`; der nächste Lauf versucht es wieder. `DiscoverState` zählt Klärfälle je URL; ab dem dritten in Folge setzt der Kandidat einen Monatslauf aus und wird im Bericht hervorgehoben. Klärfälle wegen Zeitbudget, Limit oder G3 liegen nicht am Kandidaten und zählen nicht in die Serie.
   - **Klärfälle im Issue.** Heute entsteht das Issue nur aus Commit-Texten (`newProvidersIssue`) und nur mit neuen Anbietern. Neu liest `discover-publish` zusätzlich `runs/<datum>/discover/report.json` aus dem Bundle, macht Namen, Gründe und URLs einzeilig, kürzt sie und entschärft `@` wie heute, und legt das Issue auch ohne neue Anbieter an, wenn es Klärfälle gibt (Titel „Entdecken <datum>: n neu, m Klärfälle“). Klärfälle stehen in einem eigenen Abschnitt mit Grund und Fund-URL (ohne Personennamen, E6.4), höchstens 50 Zeilen und insgesamt unter 60 000 Zeichen; der Rest steht im Bericht.
5. **Dubletten vor dem Aufnehmen.** Unmittelbar vor der Aufnahme (seriell, E8) prüft der Code den Eintrag gegen den laufenden Katalog: gleiche Programmseite, oder ein Ort im Umkreis von 100 m mit ähnlichem Namen (`similarName`). Trifft das zu, wird er nicht aufgenommen, sondern als Hinweis „Dublette von <id>?“ berichtet. Das fängt etwa ein kikudoo-Profil neben der eigenen Website desselben Anbieters ab, die der Vorfilter (URL, Host plus Name) nicht erkennt.

Verworfen:
- **Modell mit WebFetch im Bewerten** (folgt Links selbst): verletzt ADR 0026, Punkt 2 im Kern und öffnet den Weg für eingeschleuste URLs; die Erkundung im Code leistet dasselbe kontrolliert.

### E6 – Höflichkeit, robots.txt, Datenschutz, Orte

1. **robots.txt.** Neu `lib/robots.ts` (rein) nach RFC 9309: Die Gruppe unseres Agenten ersetzt `User-agent: *`, es gilt die längste passende Regel, bei Gleichstand `Allow`; Antwort 4xx = alles erlaubt, 429, 5xx oder nicht erreichbar = alles gesperrt (Kandidat wird Klärfall). Bei Weiterleitungen gilt die Prüfung für jede Station (`io/http.ts` folgt selbst; die Prüfung hängt sich dort an `nextHop`). Ein Cache je Host und Lauf in `io/`. Es gilt für alle Abrufe, die unser Code für das Entdecken macht: Methoden, Erkundung, Namensbestätigung und den Ertragsbeweis neuer Einträge. Nicht darunter fallen Websuche und Abrufe, die das Modell in den Schritten mit `tools: web` selbst macht (`io/llm.ts`); deren Ergebnis sind nur URLs, die unser Code danach mit robots-Prüfung abruft. Sperrt robots.txt eine Programmseite, wird der Kandidat verworfen („robots.txt sperrt …“), damit der Nachtlauf nie über das Entdecken an eine gesperrte Seite kommt. Bestehende Katalogeinträge (etwa `zwergenstube-duesseldorf` mit ebusy) berührt das nicht; das klärt der eigene Plan für den Nachtlauf (Nicht-Ziele).
2. **User-Agent.** Methoden, Erkundung und Namensbestätigung senden `zwergenplan-entdecken/1.0 (+https://zwergenplan.app/impressum/)` statt des Browser-UA aus `io/http.ts`, auch im Browser (`io/browser.ts`); Nominatim und Photon bekommen denselben Kontakt im User-Agent. Das Impressum (ADR 0028) bekommt einen kurzen Absatz zum Crawler: Zweck, Token `zwergenplan-entdecken`, robots.txt wird beachtet, Kontakt. Das ist eine Textänderung einer Ansicht (`/browser-review` der Impressumsseite). Der Ertragsbeweis nutzt bewusst den Abruf des Nachtlaufs (`fetchInputs`, Browser-UA), weil er genau das prüft, was der Nachtlauf später abruft. Höchstens 1 Anfrage je Sekunde und Host, höchstens 8 Hosts gleichzeitig (`CRAWL_CONCURRENCY`), Abbruch bei Bot-Sperre (`botWall`). Eine Bot-Abwehr, die nur ein Browser übersteht (Cloudflare bei eversports), wird nicht umgangen, außer der Nutzer entscheidet es (N5).
3. **Orte.**
   - **Normalisierung** vor dem Geocoder (`lib/address.ts`, rein): Klammern und Kommentare entfernen, „Str.“/„str.“ vereinheitlichen, Leerzeichen zwischen Straße und Hausnummer ergänzen („Tellerringstr.56“).
   - **Kaskade** in `io/geocode.ts`: (1) Nominatim Freitext; (2) Nominatim strukturiert (`street`, `city`, `postalcode`) mit `viewbox` aus der bbox der Region und `bounded=1`; (3) Photon (`photon.komoot.io`, unscharf) mit Ortsbezug, Treffer nur bei gleicher Hausnummer und Straßennamen-Ähnlichkeit ≥ 0,85 (`lib/similar.ts`); (4) benannter Ort ohne Adresse: Nominatim mit Name und Stadt, `viewbox` und `bounded=1`, `limit=5` (heute `limit: 1`), erster Treffer mit erlaubter Art: `category` (so heißt das Feld in `jsonv2`) `leisure` mit `type` `sports_centre`, `swimming_pool`, `sports_hall`, `building` mit `school`, `church`, `community_centre`, oder `amenity` mit `community_centre`, `place_of_worship`, `school`, `kindergarten`, `library`; die Adresse im Eintrag kommt dann aus dem Treffer. Photon-Treffer werden auf dieselben Felder abgebildet (`city`/`district` → `municipality`/`district`), damit die Gemeindeprüfung in `entryFromAssessment` greift.
   - **Cache:** neue Version `geocode-v3.json` mit Datum je Eintrag; positive Treffer dauerhaft; „kein Treffer“ nur 30 Tage; ein Fehler oder Ausfall (Photon, 403/429, Netz) nie. `--eval` liest negative Einträge nicht, damit das Eval reproduzierbar ist. Der Cache liegt unter `~/.cache` und bleibt in Actions heute nicht erhalten; `discover.yml` sichert ihn mit `actions/cache` (Schlüssel je Woche, Rückfall auf den letzten).
   - **Warteschlange:** Alle Geocoder-Anfragen laufen durch eine Warteschlange je Dienst (1/s), auch wenn Modellaufrufe parallel laufen (E8); Cache-Schreiben nur aus dieser Warteschlange.
   - **Schnittstelle:** `DiscoverDeps.geocode(address, ctx: { region: RegionId; venueName?: string })` statt `geocode(address)`; die Region liefert `viewbox`, Stadtname und Gemeinde, `venueName` die Stufe 4.
   - **Einzelne Orte.** Bleibt ein Ort ohne Treffer, fällt nur dieser Ort weg, mit `hint` wie heute bei Orten außerhalb der Region („Termine an X weglassen“). Klärfall nur, wenn kein Ort bleibt.
4. **Datenschutz.** Öffentlich sind nicht nur `data/discover/*.json`, Commits und Issues, sondern auch Logs und Artefakte von Actions (Plan 0032; `discover.yml` lädt `runs/` hoch). Deshalb: Einträge mit `person: true` (GKV-Hebammenliste) bleiben nur im Speicher des Laufs und werden erst mit bestätigter Website ein `Find` (vorher durchlaufen sie weder Vorfilter noch `dropped`, wo heute „keine gültige Web-Adresse“ mit Namen landet). Bis dahin heißen sie überall `gkv:<plz>:<n>`: in Log (`log`), Bericht (`report.md`, Job-Summary), `report.json`, `kosten.jsonl` (die Namenssuche bekommt als `providerId` `aufloesung:<n>`), `inventar`, `zurueckgestellt` und Issue. Gescheiterte Bestätigungsabrufe landen nicht in `erkundung/`. Erst wenn die Namenssuche eine eigene, öffentliche Website mit Kursen bestätigt hat, wird der Eintrag ein normaler Kandidat mit Namen (wie jeder Anbieter mit Website). Organisationen (Vereine, Gemeinden) sind keine Personen und werden normal geführt. Ein Test lässt einen Lauf mit einer GKV-Fixture laufen und durchsucht alle geschriebenen Dateien, das Log und das Summary nach dem Fixture-Namen.

### E7 – Entdecken-Eval neu

- **Feste Stichproben** in `evals/discover.json`: je Region 20 Anbieter (Nürnberg, Düsseldorf), darunter die 20 bisher genutzten (gesondert markiert: `alt: true`). Die Trägerart ist kein Katalogfeld: S0 ordnet sie für **alle** Katalog-Anbieter beider Regionen von Hand zu (Familienbildung, Gemeinde, Verein, Einzelperson, Schwimmschule, Musikschule, Familienzentrum, Plattform-Nutzer, Sonstige) und legt sie in `evals/discover.json` unter `arten` ab. Die 10 neuen je Region zieht S0 daraus mit gesetztem Zufall (Seed im Kopf der Datei) je Schicht, ohne Blick auf die Quellen; eine Schicht ohne Anbieter in der Region bleibt leer. Nicht gezogen werden Anbieter mit `skipCrawl` (ihr Ertragsbeweis kann nie bestehen). Anbieter mit `coveredBy` dürfen gezogen werden, zählen aber nicht für Ziel 4, weil `planFetch` sie nicht abruft und es keinen Referenz-Beweis gibt (`ziel4: false` im Eintrag). Ein Eintrag der Stichprobe: `{id, alt?, ziel4?, notiz?}`. Ändern nur mit Grund (`notiz`) und neuer Zeile in `evals/results.md`. Ein Test (`scripts/pipeline/io/eval-discover.test.ts`; `vitest.config.ts` schließt `evals/` nicht ein) prüft: IDs im Katalog, Rolle `anbieter`, Region stimmt, 20 je Region, `arten` vollständig, kein `skipCrawl`, `ziel4: false` genau bei `coveredBy`.
- **Aufruf** `pnpm pipeline discover --dry-run --eval [--region …]`: blendet die Stichprobe der Regionen des Laufs aus, ignoriert `zurueckgestellt`, `inventar` und negative Geocoder-Einträge und schaltet G3 aus. `--hide` bleibt für Einzelproben.
- **Zuordnung** (`hiddenEval`): Ein Fund oder eine Aufnahme gehört zu einem ausgeblendeten Anbieter bei gleicher URL (Startseite oder Programmseite), bei gleicher Website (`siteOf`) seiner Startseite `p.url`, oder bei einem Ort im Umkreis von 100 m um einen seiner Orte mit ähnlichem Namen (`similarName`). `siteOf` gilt nicht für geteilte Websites. Geteilt ist (a) jeder Host aus `SHARED_HOSTS` in `lib/discover.ts` (Buchungsplattformen aus `booking-systems.md` wie `kikudoo.com`, `eversports.de`, dazu `evangelische-termine.de` und Baukasten-Hoster wie `jimdofree.com`, `wixsite.com`) und (b) automatisch jede Website (`siteOf`), auf der mindestens zwei Katalog-Anbieter (auch ausgeblendete) ihre Startseite oder Programmseiten haben, etwa `stadtkirche-nuernberg.de` (`kath-stadtkirche-familiengottesdienste`, `kath-st-georg-ziegelstein`) und `evdus.de` (`ev-kg-linksrheinisch`, `ev-friedens-kg-duesseldorf`). Dort zählt nur die gleiche URL, und die Erkundung bleibt unterhalb des Pfads der Fund-URL (wie bei Plattform-Profilen, E5.1). So zählt der Fund der Pfarrei über die Kirche in OSM (Ort), aber nicht jeder Fund auf `evangelische-termine.de`. Inventar-Einträge ohne URL und ohne Koordinaten (LSB: Name und PLZ) gehören zu einem Anbieter bei `similarName` und gleicher PLZ eines seiner Orte.
- **1:1.** Die Zuordnung ist ein 1:1-Matching: Je Fund und je Aufnahme höchstens ein ausgeblendeter Anbieter, gewählt nach Vorrang gleiche URL vor gleicher Website vor Ortsnähe; je ausgeblendetem Anbieter zählt die beste Zuordnung, weitere Aufnahmen desselben Anbieters zählen als falsch (Ziel 3). Ein Test nutzt genau die zwei Paare oben.
- **Kennzahlen je Stufe** im Bericht und in `evals/results.md`: gefunden (je Methode), aufgelöst, nach Vorfilter, nach Vorprüfung, bewertet „aufnehmen“, Orte aufgelöst, Ertragsbeweis (erste/zweite Runde), wiedergefunden, Klärfälle, Dubletten (E5.5); alte und neue Stichproben-Fälle getrennt.
- **Ertrag** (Ziel 4): Für jeden wiedergefundenen Anbieter läuft im selben Lauf auch der Ertragsbeweis seines ausgeblendeten Handeintrags (`proveEntry` mit dem Eintrag aus dem Katalog, gleiches `today`, eigenes Verzeichnis `runs/<datum>/discover/referenz/`). Das ist die Referenz; `data/offers.json` taugt nicht, weil es für Düsseldorf auf `plan-0039` keine Angebote enthält und weil Seiten zwischen Nachtlauf und Eval wechseln. Zuordnung der Termine 1:1 über Ort (Koordinaten ≤ 100 m) und Beginn, mit einer neuen Funktion nach dem Muster von `lib/eval-score.ts` (das über `venueId` zuordnet, die hier verschieden sind), Fenster heute bis heute + 8 Wochen, je Anbieter auf 100 % gedeckelt. Die Referenz kostet je wiedergefundenem Anbieter eine Extraktion mehr.
- **Laufverzeichnis.** Heute ist es fest `runs/<datum>/discover` (`cli.ts`). Neu: `--run-dir <pfad>`; ohne Angabe `runs/<datum>/discover`, und existiert das schon, `…/discover-2`, `-3` usw. So überschreiben zwei Eval-Läufe am selben Tag einander nicht.
- **Modellvergleich auf festen Kandidaten.** `--reuse <runDir>` übernimmt Inventar, Auflösung und Erkundung eines früheren Laufs (`<runDir>/inventar.json`, `<runDir>/erkundung/`) und fährt nur Bewerten, Orte und Ertragsbeweis neu; es liest nur aus einem anderen Verzeichnis als dem eigenen Laufverzeichnis (sonst Fehler). So vergleicht S4 Modelle fürs Bewerten auf demselben Kandidatensatz, ohne das Rauschen der Websuche; die Suchmodelle vergleicht S4 nur an der Kennzahl „gefunden“.
- **Falsch aufgenommen** wird von Hand beurteilt: Die Haupt-Session prüft jede zusätzliche Aufnahme auf der Website (Angebot 0–3 mit Eltern, eigener Veranstalter, Ort in der Region, Termine, keine Dublette eines Katalog- oder ausgeblendeten Anbieters) und trägt das Urteil in die Ergebniszeile ein. Ordnet `hiddenEval` zwei Aufnahmen demselben ausgeblendeten Anbieter zu, zählt die zweite als falsch.
- **Zwei Läufe** je Konfiguration, weil Websuche und Modell streuen.
- **Wo:** lokal mit `RUN_BUDGET_MIN=300` (Login des Entwicklers, `io/llm.ts`) oder per `workflow_dispatch` von `discover.yml` mit neuem Input `eval: true` (nur Trockenlauf, eigene `concurrency`-Gruppe `entdecken-eval`, damit ein wartender Eval-Lauf keinen Monatslauf oder Nachtlauf aus der Gruppe `daten` verdrängt). Ein Eval-Lauf dauert wegen der breiten Inventare 2–4 Stunden je Region; S1b misst es.
- Die Tabelle „Entdecken“ in `evals/results.md` bekommt die neuen Spalten; alte Zeilen bleiben und bekommen „–“.

### E8 – Laufzeit, Parallelität, Bremsen, Abo

- **Parallel** laufen nur Modellaufrufe (Suche, Namenssuche, Bewerten; `DISCOVER_CONCURRENCY`, Standard 4) und Abrufe (E6.2). **Strikt seriell** bleiben Geocoder (Warteschlange), Ertragsbeweis, Dublettenprüfung (E5.5), Vergabe von Katalog-ID und `publicId` (`catalogId`, `nextPublicId` gegen den laufenden Katalog), G3, Aufnahme und Commit.
- **Budgets im Lauf.** Im Modus live baut der Job `entdecken` nach dem letzten Anbieter-Commit `data/offers.json` neu, ohne Commit (`pnpm pipeline nightly --build-only`; neue Anbieter haben ihre Angebote sonst nur in `data/raw`, `pnpm build` liest aber `data/offers.json`), dann `pnpm build` und `pnpm size`. Ist das rot, setzt der Job die Anbieter-Commits zurück, behält nur den Zustands-Commit (`data/discover`, `data/kosten.csv`, damit `inventar` und Klärfälle nicht verloren gehen), endet selbst grün mit Ausgabe `budget=rot`, und der Job `ampel` wird rot; der Bericht nennt das gerissene Budget und die zurückgenommenen Anbieter. `veroeffentlichen` läuft also weiter und pusht nur den Zustand. So blockiert ein Monatslauf nie den Deploy des Nachtlaufs. Der Job braucht Chromium (Kachelbilder, CLAUDE.md „Stolperfallen“), das die Browser-Methoden ohnehin installieren.
- **G3 im Monatstakt:** 25 neue Anbieter je Region und Lauf (statt 10 je Woche); bei Bootstrap gilt weiter `max_new`. Ein Limit-Abbruch stoppt alle laufenden Aufrufe (`controller.abort()`). Ein Test hält fest, dass zwei gleichzeitig bewertete Kandidaten mit gleichem Namen verschiedene IDs bekommen.
- `discover.yml`: `timeout-minutes` 120 → 330; `DISCOVER_BUDGET_MIN` (`io/discover.ts`) 90 → 300; die `workflow_dispatch`-Standards `max_calls` und `max_tokens` werden mit den neuen Bremsen angehoben, sonst überstimmen sie diese.
- `DISCOVER_BRAKES` (`lib/cost.ts`): `MAX_CALLS` 120 → 1500, `MAX_TOKENS` 5 Mio. → 150 Mio. (Cache-Lesen zählt mit). Die Bremsen schützen vor einer Schleife. Die neuen Werte gelten ab S1a, sonst brechen die Eval-Läufe in S1b–S4 ab; S6 setzt sie nach dem ersten vollen Lauf in Actions auf das Doppelte des Gemessenen.
- **Abo-Kontingent.** Kosten sind nach Nutzervorgabe kein Kriterium, das Nutzungsfenster des Abos aber eine echte Grenze: Lange Läufe mit Opus können das Wochenlimit erreichen und die interaktive Arbeit blockieren. Deshalb: S1b misst den Verbrauch eines Eval-Laufs (Tokens je Modell, Anteil am Fenster, soweit die CLI ihn meldet); S4 beginnt mit Sonnet und nimmt Opus dazu, wenn das Kontingent es trägt; Evals laufen nicht parallel zu langer interaktiver Arbeit; N6 regelt eine Obergrenze. Ein `limit` beendet den Lauf geordnet, offene Kandidaten werden Klärfälle.
- Kosten erscheinen weiter in Bericht, `kosten.jsonl` und `data/kosten.csv`.

### E9 – Was bleibt

- Ertragsbeweis als Bedingung der Aufnahme (Plan 0032, N-D), G1 (Katalog), G2, G4, IDs und `publicId` vom Code (ADR 0022), ein Commit je Anbieter, ein Issue je Lauf (Titel nach E5.4), Rücknahme per Revert und `abgelehnt`. G3 bleibt als Grenze, mit neuem Wert (E8).
- Modell nur über `io/llm.ts`, ohne Schreibrechte, Ausgabe nur nach Schema.
- Vorfilter-Grundsatz „lieber Dublette als verschluckter Anbieter“ (`lib/discover.ts`, Kopfkommentar).

### E10 – ADR 0033

Ein ADR „Entdecken: Recherche-Profil, Erkundung, monatlich“ mit drei Teilen, geschrieben in S1a mit `Status: angenommen (<Datum>), mit Plan 0045, Teil 1`; jeder weitere Teil ergänzt die Statuszeile, wenn sein Schritt umgesetzt ist:
1. (S1a) Klärfälle im Zustand und im Issue; robots.txt und eigener User-Agent für Abrufe des Entdeckens; Orte als „Name, Ort“ mit Geocoder-Kaskade.
2. (S2) Erkundung derselben Website statt zwei Kontaktseiten (ADR 0026, Punkt 2); `follow` und `partChars` aus dem Entdecken (ersetzt den Satz im Nachtrag von ADR 0026).
3. (S3) Recherche-Profil `data/recherche/<region>.yaml` als Pipeline-Konfiguration außerhalb von `src/domain/schema.ts` (Abweichung von „Ein Datenvertrag“ in `docs/architecture.md`, wie ADR 0026 für `data/raw`) und Zustandsfelder `inventar`, `methoden`; Methoden mit Abruf über Browser, PDF und POST; Takt monatlich (ADR 0026, Punkt 1; ADR 0032, Punkt 8); Budgetprüfung im Job.

ADR 0026 und ADR 0032 bekommen in der Statuszeile „Ergänzt durch ADR 0033“. CLAUDE.md, Abschnitt „Stolperfallen“ → „Daten“, bekommt einen Satz zu `data/recherche/` (von Hand bzw. per Skill gepflegt, kein Lauf schreibt sie).

## Nutzerentscheide (offen)

- **N1 – Zielwerte.** Empfehlung: wie im Abschnitt „Ziel“. Hinweis: Je Region gibt es einen Stichproben-Anbieter ohne maschinelle Quelle (musikfuechse, zwergenstube); 90 % lassen je Region noch einen weiteren Fehlschlag zu. Alternative: ≥ 85 % gefunden. Für Ziel 6 (b) empfehle ich, die Schwelle erst nach der ersten Messung festzulegen.
- **N2 – Modell für Suche und Bewerten.** Empfehlung: das beste laut Eval (S4), bei Gleichstand das schnellere. Alternative: fest Opus.
- **N3 – Live-Gang.** Empfehlung: `ENTDECKEN_MODUS=live`, sobald die Ziele je Region erreicht sind und Plan 0044 live ist, mit Aufnahme ohne Abnahme wie bisher (Plan 0032, N-C); das Issue nennt neu auch Klärfälle. Alternative: die ersten zwei Monatsläufe nur Trockenlauf mit Abnahme des Berichts.
- **N4 – Photon als zweiter Geocoder** (öffentlicher Dienst ohne Vertrag). Empfehlung: ja, nur für Orte ohne Nominatim-Treffer. Alternative: nur Normalisierung und strukturierte Nominatim-Suche.
- **N5 – Plattform-Listen als Fundquelle.** Genutzt werden nur Name, Website und Ort, intern für das Entdecken; robots.txt wird beachtet. (a) kidsgo, kikudoo, Navigator, GKV-Hebammenliste, Mehrgenerationenhäuser: Empfehlung ja. (b) eversports nur mit einem Browser hinter Cloudflare: Empfehlung nein; die-familienbox muss dann über Websuche oder Namenssuche kommen. Alternative zu (b): ja, mit eigenem User-Agent und höchstens einer Seite je Stadt und Lauf.
- **N6 – Obergrenze fürs Abo-Kontingent.** Empfehlung: nach der Messung in S1b entscheiden, etwa „ein Eval-Lauf je Tag, nicht zwischen 00:30 und 03:30 UTC (Nachtlauf 01:30), Monatsläufe nur am Wochenende“. Alternative: keine Grenze, nur geordnetes Ende bei `limit`.
- **N7 – Budgets außer `site.json`** (Voraussetzungen): `anbieter.json`, Wegzeit und Linien sind zu 88–95 % voll, Plan 0044 teilt nur `site.json`. Empfehlung: vor S6 mit dem Probe-Build messen und je Budget entscheiden: anheben mit Begründung (wie Linien `vrr` auf 48 kB, Plan 0042, N7) oder einen eigenen Plan zum Teilen. Alternative: G3 so klein halten, dass die Budgets halten.

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/address.ts` (neu) | Normalisierung von Adressen | S1a |
| `scripts/pipeline/lib/robots.ts` (neu) | robots.txt parsen und prüfen | S1a |
| `scripts/pipeline/io/geocode.ts` | Kaskade, Photon, benannte Orte, Warteschlange, Cache-Regeln, Schnittstelle | S1a |
| `scripts/pipeline/io/http.ts` | eigener User-Agent als Option, robots-Cache, Prüfung je Weiterleitung | S1a |
| `scripts/pipeline/io/fetch-inputs.ts` | robots-Prüfung für den Ertragsbeweis neuer Einträge (Option, Nachtlauf unverändert) | S1a |
| `scripts/pipeline/io/browser.ts` | Rückfall für leere Seiten in der Erkundung, Browser-Methoden | S2, S3 |
| `scripts/pipeline/io/publish.ts` bzw. `discover-publish` in `cli.ts`, `newProvidersIssue` in `lib/discover.ts` | Issue mit Klärfällen aus `report.json`, auch ohne neue Anbieter | S1a |
| `scripts/lib/discover-schedule.ts` (neu) | Monatsregel für `schedule` | S3 |
| `CLAUDE.md` | Satz zu `data/recherche/` im Abschnitt „Daten“ | S3 |
| `public/impressum/index.html` | Absatz zum Crawler `zwergenplan-entdecken` (E6.2) | S1a |
| `scripts/pipeline/lib/research-profile.ts` (neu) | Schema `ResearchProfile`, `METHODS` mit Reichweite | S3 |
| `data/recherche/{nuernberg,fuerth,duesseldorf}.yaml` (neu) | Profile (Anfang: heutige Quellen; nach S5 aus Stufe A) | S3, S5 |
| `scripts/validate-data.ts` | Profile prüfen | S3 |
| `scripts/pipeline/lib/discover-state.ts` | Klärfälle, `inventar`, `methoden` | S1a, S3 |
| `scripts/pipeline/io/discover.ts` | Phasen, einzelne Orte, Klärfälle, zweite Runde, Erkundung, Auflösung, Parallelität, `--erkunden` | S1–S5 |
| `scripts/pipeline/lib/discover.ts` | Klärfälle, Zusammenführen, Kennzahlen, Ertrag, Zuordnung im Eval, Schema-Grenzen, `follow`, `partChars`, Portal-Treffer, Bericht von Stufe A | S1–S5 |
| `scripts/pipeline/lib/site-crawl.ts` (neu) | Auswahl und Reihenfolge der Seiten einer Website | S2 |
| `scripts/pipeline/lib/relevance.ts` | `isRelevantStrict` | S2 |
| `scripts/pipeline/lib/sources/methods/*.ts` (neu), `scripts/pipeline/io/methods.ts` (neu) | Methoden (Parser, Abruf) | S3 |
| `scripts/pipeline/lib/discover-terms.ts` | Begriffsgruppen | S3 |
| `scripts/pipeline/prompt/discover-search.md`, `discover-assess.md`; `discover-resolve.md`, `discover-sources.md` (neu) | Portal-Treffer, Orte ohne Adresse (S1a), Seiten-Format und `follow` (S2), Namenssuche (S3), Quellensuche (S5) | S1–S5 |
| `scripts/pipeline/cli.ts` | `--eval`, `--reuse`, `--suchgebiete`, `--erkunden`, `--hide-region`, `--methoden`, `--profil`, `DISCOVER_CONCURRENCY`, `CRAWL_CONCURRENCY` | S1–S5 |
| `scripts/pipeline/lib/cost.ts` | `DISCOVER_BRAKES` | S1a, S6 |
| `.github/workflows/discover.yml` | Zeitlimit, Eingaben, Input `eval` mit eigener `concurrency`-Gruppe, Monatsregel, `actions/cache` für den Geocoder, Build und `pnpm size` vor der Übergabe | S1a, S3, S6 |
| `evals/discover.json` (neu), `evals/results.md` | Stichproben, neue Spalten | S0, S1b |
| ADR 0033 „Entdecken: Recherche-Profil, Erkundung, monatlich“ (neu, unter `docs/adr/`); Statuszeilen von ADR 0026 und ADR 0032 | E10 | S1a–S3 |
| `docs/architecture.md`, Skill `babyevents-nuernberg` (Abschnitte 4 und 6, Klärfälle, Profil), `references/catalog.md` | Doku | S1–S6 |

## Tests (test-first)

- `lib/address.test.ts`: Kommentar in Klammern, Straße am Anfang, „str.56“, „Str.“ vs. „straße“, PLZ vorhanden und fehlend; die beiden Düsseldorfer Adressen aus dem Eval als Fälle.
- `lib/robots.test.ts`: eigene Gruppe ersetzt `*`; längste Regel gewinnt, bei Gleichstand `Allow`; leere Datei; 4xx = alles erlaubt, 5xx = alles gesperrt; Pfad mit Query.
- `io/geocode.test.ts` (mit `fetchImpl`): Kaskade bricht beim ersten Treffer ab; Photon-Treffer mit anderer Hausnummer zählt nicht; benannter Ort nur mit erlaubter `category` und `type`; Photon-Ausfall ist kein Fehler und landet nicht im Cache; „kein Treffer“ verfällt nach 30 Tagen; zwei gleichzeitige Anfragen gehen im Abstand ≥ 1 s hinaus.
- `lib/research-profile.test.ts`: Bundesland aus dem Netz abgeleitet; Methode außerhalb ihrer Reichweite ungültig; `linkliste` verweist auf einen vorhandenen `verzeichnis`-Eintrag derselben Region; Warnung, wenn ein `verzeichnis` der Region fehlt; `params` je Methode.
- `scripts/lib/discover-schedule.test.ts`: `schedule` am 1.–7. läuft, am 8. nicht; `workflow_dispatch` läuft immer; Zuordnung Samstag `vrr`, Sonntag `vgn` bleibt.
- `io/discover.test.ts`: ein Ort ohne Treffer → Eintrag mit den übrigen Orten und `hint`; kein Ort → Klärfall ohne `zurueckgestellt`, ab dem dritten in Folge ein ausgesetzter Monatslauf, Klärfälle wegen Zeitbudget zählen nicht mit; zweite Runde nach leerem Ertragsbeweis wählt andere Programmseite und wird aufgenommen; `truncated` → zweiter Beweis mit `partChars`; ungültige Antwort → Fallback-Modell; Limit in einem von vier parallelen Aufrufen stoppt alle; zwei parallel bewertete Kandidaten mit gleichem Namen bekommen verschiedene IDs; Inventar-Eintrag ohne Bezug geht nicht ans Modell; Eintrag ohne Website läuft über die Namenssuche, eine URL ohne Name und Ort im Text zählt nicht; robots.txt sperrt Programmseite → verworfen, robots.txt mit 5xx → Klärfall; Netzfehler, 5xx und `botWall` → Klärfall, 404 und 410 → verworfen; leere Seite → Browser-Abruf, bleibt sie leer → Klärfall, nie `ohne-bezug`; Plattform-Profil wird nur unterhalb seines Pfads erkundet; Dublette (Ort ≤ 100 m, ähnlicher Name) wird nicht aufgenommen; ein GKV-Eintrag erscheint weder im Log noch in `report.json`, `inventar` oder `zurueckgestellt` mit Namen; im Modus live verhindert ein rotes `pnpm size` die Übergabe des Bundles.
- `lib/site-crawl.test.ts`: Reihenfolge nach Linktext und Pfad, nur dieselbe Website, Tiefe 2, höchstens 20 Seiten, robots.txt, iCal- und PDF-Links erkannt; Fixtures für Liste mit Detailseiten (wie Sharky) und Gruppenseite mit iCal-Link (wie CVJM).
- `lib/discover.test.ts`: Zusammenführen von Funden mehrerer Methoden (URL, Host plus Name, Name plus Ort); Kennzahlen je Stufe; Ertrag gegen den Referenz-Beweis 1:1 über Koordinaten und Beginn, gedeckelt; Zuordnung im Eval über `siteOf` der Startseite und Ortsnähe, nicht über `SHARED_HOSTS`; zweite Aufnahme desselben ausgeblendeten Anbieters zählt als falsch; `--reuse` übernimmt Inventar und Erkundung; Issue entsteht auch ohne neue Anbieter, wenn Klärfälle da sind, und enthält keine Zeilenumbrüche oder `@` aus Webtext; `--eval` ignoriert `zurueckgestellt` und `inventar` und schaltet G3 aus; `follow` aus dem Bewerten nur mit gesehenem Folgelink; Portal-Treffer gehen in die Namenssuche, gesperrte Portal-URLs nicht in die Prüfung; rollende Prüfung wählt neue vor alten Einträgen; GKV-Namen erscheinen weder in `inventar` noch im Issue-Text; Issue-Text bleibt unter 60 000 Zeichen; Bericht von Stufe A mit Überschneidungsmatrix und Schätzung.
- `lib/relevance.test.ts`: `isRelevantStrict` trifft nicht „20-30 €“ und nicht „U3-Betreuung“ allein, trifft „Krabbelgruppe“, „Eltern-Kind-Turnen ab 1 Jahr“.
- `lib/sources/methods/*.test.ts`: je Methode eine Fixture (fiktive Namen), Warnung bei Seitengrenze, bekannte Websites als Hinweis, Region über PLZ bzw. bbox.
- `scripts/pipeline/io/eval-discover.test.ts`: Stichproben-Datei wie in E7.
- Höflichkeit und Ablauf: höchstens 1 Anfrage je Sekunde und Host bei 8 parallelen Hosts (Fake-Uhr); jede Region bekommt bei `--netz` mindestens 20 % des Zeitbudgets; `--methoden bundesweit` lässt `navigator`, `lsb-nrw`, `linkliste` und Sammelkalender aus; `--eval` ist nur zusammen mit `--dry-run` bzw. Modus `trocken` erlaubt; `--run-dir` mit Suffix bei vorhandenem Verzeichnis, `--reuse` aus dem eigenen Verzeichnis ist ein Fehler.
- Zuordnung: die zwei Paare mit geteilter Startseite (`stadtkirche-nuernberg.de`, `evdus.de`) werden je einzeln zugeordnet; LSB-Eintrag ohne URL über Name und PLZ.
- Budget im Job: rotes `pnpm size` setzt die Anbieter-Commits zurück und behält den Zustands-Commit.
- `discover.yml`: Monatsregel nur bei `schedule`, `skip` bedingt `entdecken`, `veroeffentlichen` und `ampel`, Cache-Job in ausgelassenen Wochen.
- `discover-terms.test.ts`: jede Gruppe hat 3–5 Begriffe.

## Schritte

Jeder Schritt endet mit `pnpm verify` grün und `pnpm e2e:local --affected` (`run_in_background`), bei Änderungen unter `data/` oder `tests/fixtures/` zusätzlich `--smoke` (CLAUDE.md, „Lokal prüfen“; Fixtures und `.github/` lösen die volle Auswahl aus, `scripts/lib/e2e-map.ts`). Jeder Schritt mit neuem Modul oder Schemaänderung bekommt `/arch-review`.

- **S0 – Vorbereitung (ohne Modell, außer einer Probe).** Branch von `plan-0039` (Voraussetzungen). `evals/discover.json` mit 2 × 20 Anbietern (E7, gesetzter Zufall); Endpunkte der Quellen erneut abrufen; klären, ob der LSB-Detail-Endpunkt eine Website liefert (E3); OSM-Relation für Nürnberg nachschlagen. Probe: die neun Namenssuchen aus „Fundorte“ einmal über die Suche der Pipeline (`claude -p`, `tools: web`), um zu sehen, ob deren Index deutsche Lokalanfragen besser bedient als der des Rechercheagenten.
- **S1a – Härte und Höflichkeit.** E6 (robots.txt, User-Agent samt Absatz im Impressum, Normalisierung, Kaskade, Warteschlange, Geocoder-Schnittstelle, einzelne Orte, Datenschutz), Prompt-Änderung „Orte als Name, Ort“ (E5.2), Klärfälle samt Issue (E5.4), Dublettenprüfung (E5.5), neue Bremsen (E8), Geocoder-Cache in Actions, ADR 0033 Teil 1. `/arch-review`; `pnpm e2e:local --affected` und `/browser-review` für die Impressumsseite (`public/impressum/index.html`).
- **S1b – Messung.** `--eval`, `--run-dir`, Zuordnung 1:1 mit geteilten Websites, Kennzahlen je Stufe, Ertrag gegen den Referenz-Beweis (E7). Eval mit heutigen Modellen und Quellen als **neuer Ausgangswert**, zwei Läufe je Region; Verbrauch am Abo messen (E8). Erwartung: efa, DRK und die drei Nürnberger Orte ohne Adresse kommen durch die Ortsprüfung.
- **S2 – Tiefe.** Website-Erkundung (mit Pfadgrenze auf geteilten Websites), Rückfall für leere Seiten, Seiten-Format im Bewerten, Schema-Grenzen, zweite Runde, `follow` und `partChars` (E5); `isRelevantStrict` mit Messung auf den Websites der Stichprobe (alle müssen bestehen). ADR 0033 Teil 2. Eval, zwei Läufe. `/arch-review`.
- **S3 – Breite.** Profil-Schema, `METHODS` und Profile der drei Regionen mit den heutigen Quellen (E2), Satz in CLAUDE.md, dann die Methoden in der Reihenfolge des erwarteten Zugewinns: `navigator`, `kidsgo`, `osm-gemeinden` samt Gemeindelisten als `linkliste`, `lsb-nrw` und `vereine-nuernberg`, `kikudoo`, `gkv-hebammen` mit Namenssuche, `frankenkids-veranstalter`, `mgh`, `schneeball`, `eversports` nur nach N5. Dazu Auflösung der Portal-Treffer, Begriffsgruppen, rollende Prüfung, Reihenfolge und Zeitanteile je Region, Parallelität (E3, E4, E8), Monatsregel im Workflow, Budgetprüfung im Job; Durchlassquote der Vorprüfung auf den breiten Inventaren beider Regionen (E5.1). ADR 0033 Teil 3. Nach jedem zweiten Methoden-Paar ein Eval-Lauf, um den Zugewinn je Methode zu sehen; am Ende zwei Läufe und die Messung der Stadtteil-Matrix (`--suchgebiete`). `/arch-review`.
- **S3b – Neue Programmseiten bekannter Anbieter** (aus Plan 0047 übernommen, Nutzer 2026-10-25: „neue Angebote von bekannten Anbietern zuverlässig“). Die Website-Erkundung aus E5.1 läuft im Monatslauf auch über jeden Katalog-Anbieter mit eigener Website. Kandidat ist eine Seite derselben Website, die der Katalog nicht nennt, deren Text Termine mit Datum enthält, die kein Angebot des Anbieters im Bestand hat (Vorfilter im Code, Datum und Ort), dazu PDF-Programme mit Halbjahr im Namen. Probe nur mit der Kandidatenseite (Extraktion wie im Ertragsbeweis, Zustand nur im Laufverzeichnis); Kandidaten ohne neues Angebot entfallen. Ausgabe nur als Vorschlag in Bericht und Issue, Pflege per Skill; automatisches Hinzufügen bräuchte ein eigenes Gate gegen G2 und ein ADR. Ziel: Für 5 Anbieter wird in einer Katalogkopie je eine Programmseite entfernt, die Erkundung schlägt mindestens 4 davon vor, und mindestens 80 % aller Vorschläge eines Laufs liefern ein neues Angebot (von Hand geprüft).
- **S4 – Modelle.** Ein Eval-Lauf mit dem Ausgangsmodell liefert den Kandidatensatz; darauf vergleicht `--reuse` Sonnet, Opus (N6 beachten) und Haiku fürs Bewerten, je zwei Läufe. Die Suchmodelle vergleicht je ein voller Lauf an der Kennzahl „gefunden“. Der Nutzer wählt nach N2.
- **S5 – Stufe A (Erkunden).** Quellensuche, Bericht und Profilvorschlag (E2), `--erkunden`, `--hide-region`, `--methoden`, `--profil`. Neue-Stadt-Probe auf Düsseldorf (Ziel 6 a und b), dann Stufe A für alle drei Regionen und Übernahme der Profilvorschläge von Hand. S5 ist **keine** Voraussetzung für S6: Sind Ziele 1–4 vorher erreicht, darf S6 zuerst kommen.
- **S6 – Lauf in Actions und Live.** Voraussetzung: Ziele 1–4 je Region erreicht, Pläne 0039/0042 auf `main`, Plan 0044 live, N7 entschieden. Zeitlimit und Bremsen (E8), ein voller Trockenlauf je Netz per `workflow_dispatch`, Bremsen auf das Doppelte des Gemessenen. Probe-Build über `pnpm pipeline nightly --build-only` mit `raw/` und Katalog des Trockenlaufs, dann `pnpm build` und `pnpm size`. Der Nutzer sieht den Bericht des Trockenlaufs (Aufnahmen und Klärfälle), dann `gh variable set ENTDECKEN_MODUS --body live` nach N3, je Netz nacheinander. Erster Live-Lauf per `workflow_dispatch`, Issue und Commits prüfen, `/browser-review live` für neue Anbieter.
- **S7 – Abschluss.** Restpunkte nach `docs/ideas.md`, darunter der Kosten-Trade-off (Modell je Schritt, Umfang der Erkundung, Takt der rollenden Prüfung), gemessen gegen dieselben Stichproben; Plan archivieren.

Die Reihenfolge folgt dem Aufwand: S1a klärt 5 der 7 Verluste nach dem Fund, S2 die übrigen 2, S3 ist der größte Teil und klärt die 7 auffindbaren der 9 nicht gefundenen. Die Modellwahl (S4) kommt nach S3, weil Suchprompt und Namenssuche erst dort entstehen.

## Verifikation

- Je Schritt wie oben (`pnpm verify`, `pnpm e2e:local --affected`, ggf. `--smoke`, `/arch-review`).
- Je Schritt eine Zeile in `evals/results.md`. Ziele 1–4 aus den Mittelwerten der zwei Läufe; Ziel 5 aus dem Bericht (keine Verwerfung mit technischem Grund); Ziel 6 aus dem Bericht der Neue-Stadt-Probe.
- Vor S6: Trockenlauf ohne `--eval` je Netz; jeder „würde aufnehmen“-Eintrag wird von Hand beurteilt wie in E7; Probe-Build über `--build-only` mit dem Trockenlauf gegen die Budgets.

## Kosten

Nach Nutzervorgabe kein Kriterium (Abo); die Grenze ist das Nutzungsfenster (E8, N6). Zur Einordnung, Schätzung API-Gegenwert: Ein Eval-Lauf heute ≈ $1 je Region. Mit Methoden, Namenssuche, stärkerem Modell und Erkundung (bis 150 000 Zeichen je Bewertung) rechne ich mit **$30–80 je Region und Lauf mit Opus**, $8–20 mit Sonnet; die meisten Aufrufe sind Bewertungen von Kandidaten aus Listen mit Angebotsbezug und nach der Vorprüfung. Für S1b–S5 mit je zwei Läufen in zwei Regionen und S4 mit drei Modellen grob $400–800. S7 senkt das.

## Risiken

- **Abo-Kontingent:** Lange Läufe teilen das Fenster mit der interaktiven Arbeit. Abhilfe: Messung in S1b, Sonnet zuerst, N6, geordnetes Ende bei `limit`, Klärfälle ohne Wiedervorlage.
- **Budgets der Website:** Mehr Anbieter vergrößern `site.json`, `anbieter.json` und die Netzdaten. Abhilfe: S6 erst nach Plan 0044 und mit Probe-Build (Voraussetzungen).
- **Last auf fremden Websites:** Erkundung mit bis zu 20 Seiten je Kandidat und breite Inventare mit Hunderten Websites. Abhilfe: robots.txt, eigener User-Agent, 1 Anfrage/s je Host, Cache im Lauf, Abbruch bei Bot-Sperre, rollende Prüfung mit 26 Wochen für `ohne-bezug`, Takt monatlich.
- **Plattformen ändern Aufbau oder sperren:** kidsgo braucht den Browser, kikudoo ist eine inoffizielle API. Abhilfe: Ein ausgefallener Methoden-Abruf kostet nur seine Funde, der Bericht nennt ihn; Fixtures halten das Parsen fest; Stufe A misst jährlich neu.
- **Mehr Kandidaten, mehr Fehlaufnahmen:** Breite bringt Grenzfälle (Kitas, Vermittler, Praxen ohne Kurse, Vereine mit Kinderturnen erst ab 4). Abhilfe: Ziel 3 mit Urteil von Hand, Ertragsbeweis bleibt Pflicht, `abgelehnt` für Muster.
- **Eval überschätzt:** Die Stichprobe stammt aus dem Handkatalog, und die Methoden sind aus den Fehlschlägen abgeleitet. Abhilfe: neue Fälle per Zufall je Schicht, alte und neue getrennt berichtet, Neue-Stadt-Probe (Ziel 6).
- **Namenssuche ordnet falsch zu** (gleichnamige Hebamme, Verein in anderer Stadt): Abhilfe: Name und Ort bzw. PLZ müssen im abgerufenen Text stehen; Orte müssen in der Region liegen (`entryFromAssessment`).
- **Datenschutz:** Namen von Einzelpersonen aus der GKV-Liste dürfen nicht in öffentliche Dateien. Abhilfe: E6.4 mit Test.
- **Photon-Treffer an falscher Stelle:** Abhilfe: Hausnummer gleich, Namensähnlichkeit, bbox und Gemeinde wie heute.
- **Laufzeit über 6 h:** Abhilfe: Parallelität, Budget 300 Min. mit geordnetem Ende, rollende Prüfung; reicht das nicht, teilt S6 den Lauf je Region auf eigene Jobs.

## Review (2026-10-25) – Verdict: Überarbeiten

Unabhängiger Review auf den ersten Entwurf. Alle Punkte übernommen, mit den Abweichungen unten. Zusätzlich eingearbeitet: das Stufenmodell des Nutzers (E1, E2, Ziel 6), das den ersten Entwurf in zwei Punkten ändert (Recherche-Profil statt `verzeichnis` mit `adapter`; Takt monatlich).

**Blocker**
- **B1 Voraussetzungen und Budgets:** übernommen. Abschnitt „Voraussetzungen“ (Branch-Basis `plan-0039`, Plan 0044 vor S6, Probe-Build gegen `.size-limit.json`), S6 mit diesen Bedingungen.

**Major**
- **M1 robots.txt und User-Agent:** übernommen (E6.1, E6.2, `lib/robots.ts`, Tests). Abweichung: Der Ertragsbeweis behält den Abruf des Nachtlaufs (Browser-UA), prüft aber robots.txt; Grund in E6.2. eversports ausdrücklich in N5.
- **M2 Datenschutz:** übernommen (E6.4, E3 „rollende Prüfung“, Test).
- **M3 Messung:** (a) Zuordnung über `siteOf` und Ortsnähe; (b) Ertrag 1:1 über Ort und Beginn, gedeckelt, Nenner aus `data/offers.json`; (c) G3 bei `--eval` aus; (d) gesetzter Zufall je Schicht, alt und neu getrennt; (e) Ort und Dauer der Eval-Läufe, Input `eval` im Workflow. Alles übernommen (E7).
- **M4 Parallelität:** übernommen (E8, Geocoder-Warteschlange E6.3, Test zu IDs).
- **M5 Ziel 4 unerreichbar:** übernommen: Schema-Grenzen 20/20, `partChars` nach `truncated`, `follow` aus dem Bewerten (E5.2); Ziel 4 zählt `follow`-Anbieter erst ab S2.
- **M6 Annahmen:** Schneeball über `fetchPage`/`extractPage` und als breites Inventar; Namensbestätigung „Name und Ort/PLZ“; Prompt „Orte als Name, Ort“ in S1; Region-Parameter und Adapter-Schnittstelle über das Recherche-Profil (E2) und `fetchMethod` (E3). Übernommen.
- **M7 lokale Prüfung:** übernommen (Absatz vor den Schritten; `/arch-review` auch in S1).
- **M8 Abo-Kontingent:** übernommen als Messung in S1, Sonnet zuerst in S4 und Nutzerentscheid N6. Eine feste Obergrenze setzt der Plan nicht vorab, weil der Nutzer Qualität vor Kosten gestellt hat und der Verbrauch noch nicht gemessen ist.

**Minor**, alle übernommen: Aussage zur Wiedervorlage korrigiert (Ausgangslage); N1-Hinweis je Region; Modellwahl nach der Breite (S4 nach S3); `workflow_dispatch`-Standards und Ort von `DISCOVER_BUDGET_MIN` (E8); Issue-Länge (E5.4); `SearchResponse.max(25)` (E4); Geocoder-Cache, `viewbox`, engere Klassen (E6.3); `isRelevantStrict` mit Messung der Durchlassquote (E5.1); Wiedervorlage nach drei Klärfällen (E5.4); Fallback-Modell benannt (E5.2); ADR 0033 mit Status je Teil und Ersatz des `follow`-Satzes (E10); Test für `evals/discover.json` (Tests).

## Review 2 (2026-10-25) – Verdict: Überarbeiten

Neuer, unabhängiger Reviewer auf die überarbeitete Fassung. Alte Punkte laut Review gelöst: M1, M4–M8; B1 trug nur für den ersten Live-Gang (jetzt M8 unten), M2 und M3 waren teilweise offen. Alle neuen Punkte übernommen:

**Blocker**
- **B1 Ziel 4 für Düsseldorf nicht messbar** (kein Düsseldorfer Angebot in `data/offers.json`, keine Rohdatei auf `plan-0039`; am 2026-10-25 nachgeprüft): übernommen. Referenz ist jetzt der Ertragsbeweis des ausgeblendeten Handeintrags im selben Lauf (Ziel 4, E7).

**Major**
- **M1 `siteOf` auf geteilten Hosts:** übernommen (`SHARED_HOSTS`, `siteOf` nur für die Startseite, Programmseiten nur bei gleicher URL; E7).
- **M2 Artefakte und Log öffentlich:** übernommen (E6.4: GKV-Einträge nur im Speicher, Log und Artefakt nur PLZ und Zähler; Test).
- **M3 Erkundung auf Plattform-Profilen:** übernommen (E5.1, nur unterhalb des Profil-Pfads).
- **M4 Ziel 6 zirkulär:** übernommen (Ziel 6 a und b, `verzeichnis` mit ausgeblendet, `--methoden bundesweit`).
- **M5 Namenssuche für LSB:** übernommen (S0 klärt den Detail-Endpunkt; Auflösung von Organisationen in `inventar` gecacht, Personen nie; E3).
- **M6 Klärfälle im Issue:** übernommen (Datenweg über `report.json` in `discover-publish`, Issue auch ohne neue Anbieter; E5.4).
- **M7 S4 zu groß und verrauscht:** übernommen (`--reuse`, Bewerten auf festem Kandidatensatz, Suche nur an „gefunden“; E7, S4).
- **M8 Budgets nach S6:** übernommen (`pnpm build` und `pnpm size` im Job vor der Übergabe; E8).
- **M9 Dubletten:** übernommen (E5.5 seriell vor dem Aufnehmen; Ziel 3 und E7 werten die zweite Aufnahme als falsch).

**Minor**, alle übernommen: Ausgangslage zur Wiedervorlage präzisiert, Tests für Ziel 5 (Netzfehler, 5xx, `botWall` → Klärfall; 404/410 → verworfen); `osmRelation` statt `municipality` für `osm-gemeinden`; Bundesland aus dem Netz abgeleitet; Schnittstelle (`InventoryEntry`, `ctx`, `DiscoverDeps.fetchMethod`, `--profil`, Verhalten ohne Profil, Befehl für Ziel 6, eigene Zuordnungsfunktion statt `eval-score`); Geocoder (`category`, `limit=5`, Photon-Felder, `actions/cache`, Cache-Version mit Datum); robots.txt nach RFC 9309, Websuche des Modells ausdrücklich ausgenommen; Monatsregel nur für `schedule` mit Test, eigene `concurrency`-Gruppe für Evals, Wiedervorlage nach drei Klärfällen als ausgesetzter Monatslauf; leere Seiten nie `ohne-bezug`; Reihenfolge und Zeitanteile je Region; ADR 0033 reserviert, Abweichung „Ein Datenvertrag“ und ADR 0032, Punkt 8 im ADR, Satz in CLAUDE.md, `fetch-inputs.ts` und `io/browser.ts` unter „Dateien“; `suchgebiete` aus dem Profil genommen (nur Messung per `--suchgebiete`), Warnung bei fehlendem `verzeichnis` im Profil. Die Lincoln-Petersen-Schätzung bleibt, aber nur als Anzeige im Bericht von Stufe A: Sie ist eine Zeile Rechnung auf der ohnehin gebauten Überschneidungsmatrix und für eine neue Stadt ohne Handkatalog der einzige Anhalt für „wie vollständig“.

## Review 3 (2026-10-25) – Verdict: Freigabe mit Änderungen

Dritter, unabhängiger Reviewer (letzter erlaubter Durchgang nach dem Skill). Kein Blocker. Alle Punkte übernommen:

**Major**
- **M1 Budgetprüfung misst die neuen Angebote nicht und verwirft bei Rot den Zustand:** übernommen (E8: `nightly --build-only` vor `pnpm build`; bei Rot nur die Anbieter-Commits zurück, Zustands-Commit geht an `veroeffentlichen`; Probe-Build in S6 ebenso; N7 zu `anbieter.json`, Wegzeit und Linien als Voraussetzung von S6).
- **M2 nicht messbare Stichproben-Fälle:** übernommen (E7: kein `skipCrawl`; `coveredBy` mit `ziel4: false`; Trägerart für alle Katalog-Anbieter in `evals/discover.json`; leere Schichten erlaubt; Test).
- **M3 Zuordnung nicht 1:1, `SHARED_HOSTS` fest:** übernommen (E7: automatisch geteilte Websites, 1:1-Matching mit Vorrang, Erkundung unterhalb des Pfads, Test mit `stadtkirche-nuernberg.de` und `evdus.de`).
- **M4 GKV-Namen in öffentlichen Ausgaben:** übernommen (E6.4: Personen erst mit bestätigter Website ein `Find`, Pseudonym `gkv:<plz>:<n>`, neutrale `providerId`, keine gescheiterten Abrufe in `erkundung/`, Test durchsucht alle Ausgaben).
- **M5 festes Laufverzeichnis:** übernommen (E7: `--run-dir` mit Suffix, `--reuse` nur aus fremdem Verzeichnis, Test).

**Minor**, alle übernommen: Monatsregel als Ausgabe `skip` des Jobs `modus`, Ampel nicht rot, Test parst `discover.yml`; Klärfall-Serie ohne Zeitbudget, Limit und G3, Test angeglichen; Geocoder-Cache in ausgelassenen Wochen wiederhergestellt; neue Bremsen ab S1a; Test unter `scripts/pipeline/io/`; Durchlassquote der Vorprüfung in S3; `frankenkids-veranstalter` in `METHODS`, Reichweiten `land:`/`region:`/`ortsunabhaengig` und klare Regel für `--methoden bundesweit`; robots.txt mit 429 wie 5xx und Prüfung je Weiterleitung, eigener User-Agent auch im Browser und für Nominatim/Photon, Absatz im Impressum (mit `/browser-review`); Zuordnung ohne URL über Name und PLZ; ein Issue je Lauf, Geocoder-Signatur, `category` statt `class`, G3 = 25 im Monatstakt, Evals nicht zur Zeit des Nachtlaufs (N6); fehlende Tests ergänzt.

**Umfang**, übernommen: S1 in S1a (Härte) und S1b (Messung) geteilt; Profil-Schema nach S3; Stufe A (S5) ist keine Voraussetzung für den Live-Gang (S6); Vorgehen beim Rebase unter „Voraussetzungen“.
