# ADR 0033 – Crawling-Architektur: die Programmseite als Einheit

Status: angenommen (2026-10-26), Nutzerentscheid nach dem Gesamt-Review der Pläne 0045–0047 („Beginne mit dem Neuschnitt“). Umsetzung: Punkte 1, 2, 3, 5 und 7 mit Plan 0048 (`docs/plans/0048-nachtlauf-seite-als-einheit.md`), Punkt 4 mit Plan 0049 (`docs/plans/0049-seitenfinder.md`: Modul und Pflege bekannter Anbieter) und Plan 0050 (Einsatz im Entdecken), Punkt 6 mit Plan 0050 (`docs/plans/0050-entdecken-schlank.md`). Ein Punkt gilt, sobald sein Plan live ist; bis dahin gilt ADR 0026. **Ändert** ADR 0026, Punkte 1–5 (Abschnitt „Änderungen an ADR 0026“). Baut auf ADR 0022 und ADR 0031 (stabile IDs) und ADR 0025 (Katalog) auf. Ersetzt die Reservierungen ADR 0033, 0034 und 0036 der Pläne 0045 bis 0047; die Nummer 0034 bleibt frei, 0035 bleibt für Plan 0044 reserviert.

## Kontext

Die Pipeline (ADR 0026) hat drei Aufgaben: **Seiten finden** (welche Seiten eines Anbieters zeigen Angebote), **Seiten lesen** (abrufen, extrahieren, Bestand halten) und **Gesundheit melden** (was ist kaputt, seit wann). Der Kern ist schlank: ein Extraktionsweg über `refreshProvider`, Hash-Cache, Einbruchschutz, stabile IDs.

Drei Pläne vom 2026-10-25 wollten je ein Problem lösen: Entdecken vollständig machen (Plan 0045), Verfügbarkeit per Rezept lesen (Plan 0046, zurückgestellt) und den stillen Ausfall bei bekannten Anbietern beheben (Plan 0047). Jeder war für sich dreimal geprüft. Zusammen hätten sie dieselben Probleme mehrfach gelöst:

| Aufgabe | heute | nach den drei Plänen |
|---|---|---|
| Seiten finden | nur von Hand | Erkundung für neue Anbieter (0045, E5); für bekannte Anbieter nur Vorschläge im Issue (0045, S3b) |
| Fehlerserien | `failingSince` | dazu `findings` mit Hysterese (0047), Klärfall-Serie (0045), `failures`/`recipeRetry` (0046) |
| Meldung | Ampel, `staleHints` | Wächter-Issue (0047) und ein Issue je Entdecken-Lauf (0045) |
| Abruf | Browser-User-Agent | drei Regeln: Entdecken mit eigenem UA und robots.txt, Ertragsbeweis mit Browser-UA und robots.txt, Nachtlauf ohne robots.txt |
| Schreibwege nach `data/raw` | nur `refreshProvider` | dreimal einzeln durchbrochen (ADR-Reservierungen 0033, 0034, 0036) |

Die Extraktionsqualität schlossen 0045 und 0047 beide aus. Damit gehörte sie keinem Plan, obwohl sie der gemeinsame Engpass ist: Haiku findet im Eval 89–99 % der Termine, Sonnet 98–99 % (`evals/results.md`).

Die meiste Sonderlogik in Plan 0047 kam aus einer Eigenschaft des Kerns. Abruf-Status, Cache-Schlüssel und Zustand gelten **je Anbieter**. Fällt eine Seite aus, ist der ganze Anbieter `fehler` (`assembleProvider`, `scripts/pipeline/lib/fetch.ts`). So blockiert bei `die-familienbox` seit dem 2026-10-22 eine einzige 404-Seite neue Kurse auf sieben weiteren. Gemessen am 2026-10-26 haben 47 der 107 abgerufenen Anbieter mehr als eine Programmseite, das sind 185 der 245 Seiten.

Die Extraktion teilt große Anbieter schon heute an Seitengrenzen (`splitInput`) und führt die Teile zusammen (`mergeParts`). Dubletten derselben Quelle entfernt der Build über alle Rohdateien hinweg (`dropSameSourceDuplicates`, ADR 0031).

**Ziele des Nutzers, in dieser Reihenfolge:**
- (a) Datenqualität und Vollständigkeit vor Kosten. Kosten sind kein Kriterium, auch das Abo-Kontingent nicht (2026-10-25 und 2026-10-26).
- (b) Neue Angebote bekannter Anbieter tauchen zuverlässig auf.
- (c) Weitere Städte (etwa Oldenburg) kommen einfach dazu.
- (d) Freie Plätze sind optional.

## Entscheidung

### 1. Ein Abruf für alle Läufe

Nachtlauf, Ertragsbeweis, Seitenfinder und Entdecken holen Seiten über dieselben Funktionen nach denselben Regeln:
- **Ein User-Agent, der uns nennt**, auch im Browser.
- **robots.txt gilt für jeden Seitenabruf** (RFC 9309): Programm- und Folgeseiten, Seiten des Seitenfinders, Quellen des Entdeckens und Sammelkalender. Eine gesperrte Seite wird nicht abgerufen; der Wächter meldet sie, und ein Mensch setzt `blocked` im Katalog.
- **APIs mit eigenen Nutzungsregeln sind ausgenommen:** Nominatim, OpenHolidays und GTFS-Feeds werden nach ihren Regeln abgefragt. Nominatim etwa sperrt `/search` per robots.txt für alle Crawler und erlaubt die API trotzdem nach seiner Usage Policy.
- **Je Host** begrenzte Parallelität wie heute.

Jeder Seitenfehler bekommt eine **Fehlerklasse**:
- `dauerhaft`: HTTP 404 oder 410;
- `gesperrt`: robots.txt;
- `voruebergehend`: alles andere, auch Bot-Schutz, der oft nur zeitweise auftritt.

Die Klasse entscheidet nur über die Meldung und über Punkt 3 („entfernt“), nicht darüber, ob Bestand bleibt.

### 2. Die Programmseite ist die Einheit der Extraktion

Eine **Einheit** ist:
- je Programmseite mit `use: termine`, samt ihren Folgeseiten (`follow`);
- dazu die Seiten mit `use: verfuegbarkeit` desselben Anbieters als Beilage. Sie stehen in jeder Einheit des Anbieters, im Text und im Schlüssel.
- Die Kandidaten der Sammelkalender eines Anbieters bilden eine eigene Einheit.

Jede Einheit hat eigenen Cache-Schlüssel, eigene Nachricht ans Modell mit dem Katalogauszug nur ihrer Seiten, eigene Events, eigenen Status, eigene Prüfzeit (`checkedAt`), eigene Fehlerserie und eigenen Einbruchschutz. Große Einheiten werden weiter in Teile zerlegt.

Die Angebote eines Anbieters sind die Vereinigung seiner Einheiten:
- Vor dem Build vereinigt `mergeParts` die Events aller Einheiten eines Anbieters in Katalogreihenfolge, wie heute die Teile einer großen Eingabe. Jedes übrige Event bleibt bei seiner Einheit und deren Prüfzeit.
- Danach greifen die Dublettenregeln des Builds wie heute (`dropSameSourceDuplicates`, Rangfolge der Quellen).

Fällt eine Seite aus, behält nur ihre Einheit den alten Stand. Die übrigen Einheiten laufen in derselben Nacht weiter. Damit gilt „Ein Fehler kostet höchstens Aktualität, nie Bestand“ je Seite, und der Status `teilweise`, ein Marker im Schlüssel und eine eigene Übernahme im Build entfallen. Ein Event gehört durch die Einheit zu seiner Seite; `sourceUrl` muss das nicht leisten.

### 3. Zustand und Gesundheit aus einer Quelle

`data/raw/<id>.json` hält den Zustand je Einheit. Ihn schreibt weiter nur `refreshProvider`; die Invariante aus ADR 0026, Punkt 2 bleibt ungeteilt. Gesundheit wird **nicht gespeichert, sondern berechnet**: Eine reine Funktion liest die Rohdaten (und den Zustand des Entdeckens) und liefert die Befunde. Dafür genügen die Felder je Einheit:
- `failingSince`, Fehlerklasse und der Beginn der aktuellen Klasse,
- `pending`,
- `emptySince`: die Einheit hatte künftige Events und hat keine mehr.

Eine Rohdatei im alten Format (vor der Umstellung) ist selbst ein Befund. Ein zweiter Schreibweg nach `data/raw` und ein eigenes Feld für Befunde entfallen.

**Entfernte Seite:** Eine Einheit, deren Seite seit 14 Tagen ununterbrochen `dauerhaft` scheitert (404/410, gezählt ab dem Wechsel in diese Klasse), verliert ihre Events. Ab dem zweiten Tag des Ausfalls steht sie im Wächter, ab dem 14. Tag als „entfernt“. Ein vorübergehender Fehler kostet nie Bestand. Ein Anbieter, den es nicht mehr gibt, oder eine verschobene Seite soll keine alten Kurse wochenlang als aktuell zeigen. Zwei Wochen Meldung lassen Zeit, die Seite im Katalog zu ersetzen.

### 4. Ein Seitenfinder für neue und bekannte Anbieter

Ein Modul erkundet eine Website im Code: höchstens 20 Seiten derselben Website, Tiefe 2, nach Linktext und Pfad geordnet, mit iCal-, PDF- und Buchungssystem-Erkennung, robots.txt nach Punkt 1. Seiten auf Buchungsplattformen, die die eigene Website verlinkt, zählen mit, aber nur diesen einen Sprung weit. Das Ergebnis sind Kandidaten für Programmseiten. Ein Modell darf auswählen und lesen, aber keine Links verfolgen.

Eine Kandidatenseite zählt nur mit **Ertragsbeweis**: Sie wird als eigene Einheit extrahiert (Punkt 2) und liefert ein gültiges Angebot.

Der Seitenfinder dient zwei Zwecken:
- **Entdecken** (Punkt 6): Er ersetzt „Fund-Seite plus zwei Kontaktseiten“ beim Bewerten.
- **Pflege bekannter Anbieter**: Er läuft wöchentlich über die Websites der Katalog-Anbieter, Anbieter mit einer Seite im Fehler `dauerhaft` zuerst. Eine Seite wird **automatisch an den Eintrag angehängt** (ein Commit je Anbieter, gelistet im Issue des Laufs, zurücknehmbar per Revert), wenn
  - der Katalog sie nicht nennt und
  - ihr Ertragsbeweis mindestens ein Angebot liefert, das keine Einheit des Anbieters liefert. Nicht mitgezählt werden dabei Einheiten mit Fehlerklasse `dauerhaft`, deren Ersatz sie sein kann.

  Wie im Entdecken prüft der Lauf vor der Übergabe die Größenbudgets der Website.

Der Seitenfinder entfernt und ändert nie bestehende Seiten. Das bleibt beim Menschen, den der Wächter darauf hinweist.

### 5. Ein Wächter

Ein **einziges, fortlaufendes Issue** zeigt alles, was ein Mensch klären muss:
- Seiten im Fehler ab dem zweiten Tag, nach Fehlerklasse,
- entfernte Seiten,
- zurückgehaltene Einbrüche (`pending`),
- leer gewordene Anbieter (14 Tage lang),
- gesperrte Seiten,
- Klärfälle des Entdeckens.

Den Text erzeugt eine reine Funktion aus dem Zustand. Ein eigener Job mit nur `issues: write`, ohne Checkout, legt das Issue an, ändert es oder schließt es, wenn nichts offen ist. Das Issue je Lauf für **Änderungen** (neue Anbieter, angehängte Seiten) bleibt daneben bestehen. Es dient dem Rücknehmen, der Wächter dem Reparieren.

### 6. Entdecken findet Anbieter, nicht Seiten

Das Entdecken liefert Kandidaten für neue **Anbieter**:
- aus Quellen mit Angebotsbezug je Region, als Tabelle im Code neben `src/domain/regions.ts`, ohne eigenes Datenformat;
- aus der Namenssuche für Portal- und Listentreffer ohne eigene Website;
- aus der Websuche.

Danach übernehmen Seitenfinder (Punkt 4), Bewerten, Geocoder und Ertragsbeweis.

Technische Fehler (Netz, 5xx, Bot-Schutz, Geocoder, ungültige Antwort) verwerfen nie, sie werden Klärfälle. Das Entdecken läuft monatlich je Netz.

**Eine neue Stadt** erkundet ein Mensch mit dem Skill in einer Recherche-Sitzung (Abschnitt „Region starten“). Er füllt die Quellentabelle und den ersten Katalog. Ein eigener Pipeline-Modus dafür entfällt.

### 7. Modell und Grenzen nach Qualität

Extraktion und Bewerten nutzen das Modell mit der besten Qualität im Eval (Recall vor Precision vor Laufzeit), nicht das günstigste. Bremsen (Aufrufe, Tokens) und Zeitbudgets schützen nur vor Schleifen und hängenden Läufen. Sie werden nach Messung auf etwa das Doppelte des größten gemessenen Laufs gesetzt.

## Änderungen an ADR 0026

| Punkt | bisher | neu |
|---|---|---|
| 1 | Entdecken wöchentlich je Region | Entdecken monatlich je Netz; Seitenfinder für bekannte Anbieter wöchentlich (Punkte 4, 6) |
| 2 | ein Modellaufruf je Anbieter; Links nie verfolgt, außer zwei Kontaktseiten beim Bewerten und `follow` | ein Aufruf je Einheit (Punkt 2); dazu erkundet der Seitenfinder dieselbe Website (Punkt 4); Rohdaten weiter nur über `refreshProvider` |
| 3 | Haiku mit Sonnet als Fallback | Modell nach Eval-Qualität (Punkt 7) |
| 4 | Zustand je Anbieter | Zustand je Einheit; entfernte Seite nach 14 Tagen `dauerhaft` (Punkt 3) |
| 5 | Entdecken legt nur neue Einträge an (G2) | zusätzlich Programmseiten an bestehende Einträge anhängen, nur im Pflegelauf und nur mit Ertragsbeweis (Punkt 4); neuer Job `waechter` mit nur `issues: write` (Punkt 5) |

Außerdem ändert sich **ADR 0032, Punkt 8** (Entdecken samstags für `vrr`, sonntags für `vgn`): Das Entdecken läuft an festen Tagen des Monats je Netz, die Pflege an festen Wochentagen (Pläne 0049 und 0050). ADR 0032 bekommt dafür in der Statuszeile „Punkt 8 geändert durch ADR 0033“.

Unverändert bleiben:
- das Modell ohne Schreibrechte und nur über `io/llm.ts`;
- IDs aus dem Build (ADR 0022);
- der Ertragsbeweis als Bedingung jeder Aufnahme;
- G1, G3, G4;
- der Einbruchschutz, nun je Einheit;
- Evals messen, sie sperren nicht.

## Alternativen

- **Die Pläne 0045–0047 wie geschrieben.** Verworfen, weil sie dasselbe Problem mehrfach lösen (Tabelle oben). Dazu kamen etwa 20 neue Module, ein eigenes Datenformat für Recherche-Profile, ein Status `teilweise` mit Sonderregeln in Abruf, Refresh und Build und drei Ausnahmen von „nur `refreshProvider` schreibt `data/raw`“.
- **Teilerfolg je Anbieter** (Plan 0047, E1): Bestand über die Zuordnung der IDs retten. Das braucht Sonderregeln in Abruf, Schlüssel, Einbruchschutz und Build, weil `sourceUrl` die Seite nicht verlässlich nennt (`die-familienbox`: alle 24 Events auf Seite 1). Die Einheit Seite löst das an der Ursache.
- **Ein Anbieter, wahlweise ganz oder je Seite:** Zwei Wege im Kern, die beide getestet und gepflegt werden müssten. Abhängige Seiten deckt die Beilage (`use: verfuegbarkeit`) ab. Braucht ein Anbieter mehr, klärt das die Messung in Plan 0048, S0.
- **Befunde als gespeichertes Feld mit Hysterese** (Plan 0047, E2): Das wäre ein zweiter Schreibweg und eine zweite Wahrheit neben `failingSince`.
- **Eigenes YAML-Profil je Stadt und ein Erkundungsmodus in der Pipeline** (Plan 0045, E2): Eine neue Stadt braucht ohnehin Code (`regions.ts`, `districts.ts`, Netz). Die Erkundung lohnt sich einmal je Stadt und gelingt besser mit einem Menschen in der Schleife.
- **Rezepte für Plätze** (Plan 0046): zurückgestellt, Ziel (d). Ein späterer Plan setzt auf der Einheit Seite auf.

## Konsequenzen

- **Einmalige Neuextraktion** aller Anbieter beim Umstieg auf Einheiten. Ein Anbieter wechselt das Format erst, wenn alle seine Einheiten in einem Lauf gelungen sind; bis dahin bleibt seine alte Datei.
- **IDs bei einer Neuextraktion:** Die Zuordnung (ADR 0022, ADR 0031) hält sie nicht von selbst. Eine Probe am 2026-10-26 lief über `die-familienbox` mit neuer URL, extrahiert mit Sonnet statt Haiku. Nur 16 von 24 IDs blieben, obwohl es meist dieselben Kurse waren. Die Gründe:
  - eine kürzere Terminreihe: 38 statt 53 künftige Termine, also 0,72 gleiche Beginnzeiten statt mindestens 0,8;
  - ein Wechsel `kurs`/`regelmaessig`;
  - eine geänderte Altersangabe.

  Deshalb kommen Modellwechsel und Umstellung in **einer** Neuextraktion, und Plan 0048 macht vorher die Zuordnung robuster gegen solche Unterschiede (Plan 0048, E11).
- **Mehr Modellaufrufe** beim Umstieg, danach weniger, weil nur geänderte Seiten neu extrahiert werden. Kosten sind kein Kriterium (Ziel a).
- **Schemaänderung** von `ProviderRaw` (`scripts/pipeline/lib/raw.ts`, Export `schema/provider-raw.schema.json`) und eine Übergangszeit mit beiden Formaten.
- **Die Pläne 0045 und 0047** gehen ins Archiv mit „ersetzt durch Plan 0050“ bzw. „ersetzt durch Plan 0048“. Ihre Messungen und Recherchen bleiben dort die Quelle. Plan 0046 bleibt Entwurf und steht in `docs/ideas.md`.
- **Reihenfolge:**
  1. Katalogfehler beheben: `die-familienbox` erledigt am 2026-10-26 (`84a2bad`); `zentrum-kobergerstrasse` hat sich selbst erholt.
  2. Modell nach Recall **wählen** (Eval nach Skill, Abschnitt 5). Gewechselt wird erst mit der Umstellung in Plan 0048, damit es nur eine Neuextraktion und nur einen Bruch der IDs gibt (Konsequenz „IDs“).
  3. Die Doku dieses Neuschnitts nach `main` bringen (ADR 0033, die Pläne 0045–0050 und die Pläne, auf die sie verweisen), damit `check-docs` dort grün bleibt. Dann Plan 0048.
  4. Plan 0049.
  5. Plan 0050.
  6. Für Düsseldorf live zusätzlich Plan 0044 (Größenbudgets).
- `docs/architecture.md`, `CLAUDE.md` („Daten“) und der Skill `babyevents-nuernberg` werden mit den Plänen nachgezogen. ADR 0026 bekommt in der Statuszeile „Geändert durch ADR 0033“, sobald Plan 0048 live ist.
