# Plan 0046 – Verfügbarkeit per Rezept: Stufe D neben der Extraktion

Status: Entwurf
Datum: 2026-10-25

**Zurückgestellt (Nutzer, 2026-10-25):** „Die Verfügbarkeit, also freie Plätze ist für mich eher optional. Wichtiger ist, dass neue Angebote von bekannten Anbietern zuverlässig auftauchen.“ Vorrang hat Plan 0047 (`docs/plans/0047-neue-angebote-zuverlaessig.md`). Dieser Plan bleibt als ausgearbeiteter Entwurf mit drei Reviews liegen.

Bezug:
- Plan 0045 (`docs/plans/0045-entdecken-vollstaendig.md`), E1: vier Arten von Läufen; dieser Plan baut Stufe D (Verfügbarkeit) und bereitet Stufe C (Kurse seltener) vor.
- ADR 0026, Punkt 1 (Nachtlauf täglich), Punkt 2 (ein Extraktionsweg; Modellaufruf nur bei geändertem Hash; Rohdaten nur über `refreshProvider`), Punkt 4 (Zustand und Einbruchschutz), Punkt 5 (Rechte), Nachtrag zu `follow`; ADR 0022 und ADR 0031 (stabile IDs); ADR 0025 (Katalog).
- `scripts/pipeline/prompt/extract.md`, Abschnitt „Verfügbarkeit“; Skill `babyevents-nuernberg`, `references/booking-systems.md`.
- **ADR 0034** ist für diesen Plan reserviert (0033 für Plan 0045; ein ADR aus Plan 0044 nimmt 0035).
- **Vor S1 läuft ein neues `/plan-review`**: Der Skill erlaubt zwei erneute Reviews, beide sind verbraucht (Abschnitte „Review“ bis „Review 3“); die Lösung von Blocker B1 aus Review 3 ist noch nicht unabhängig geprüft.

## Anlass

Der Nutzer am 2026-10-25 (Plan 0045, E1): wöchentlich ein Lauf, der bei bekannten Anbietern neue Kurse findet; nächtlich eine rein deterministische Aktualisierung von Plätzen und Anmeldestand, mit Haiku als Rückfall, „mit einem hohen Effort, … nach Möglichkeit unter 100.000 Tokens“. Und: „Deterministisch kann doch auch sein, dass bei dem Entdecken des Kurses ein LLM ein Playwright Script schreibt, um von der Seite die Zahl der freien Plätze auszulesen.“

Heute liest eine einzige Modell-Extraktion je Anbieter Kurse **und** Verfügbarkeit, jede Nacht, sobald sich der Eingabe-Hash der Seiten ändert (`lib/refresh.ts`, `lib/normalize.ts`, `extractKey`).

## Ausgangslage (gemessen 2026-10-25)

Neuextraktionen auf `main` in 12 Nachtläufen (2026-10-15 bis 2026-10-25), verglichen mit dem Stand der Vornacht (`data/raw/*.json`; Messskript im Job-Verzeichnis, nicht im Repo):

| Was sich im Ergebnis änderte | Neuextraktionen | Anteil |
|---|---|---|
| Termine oder Orte | 87 | 54 % |
| nur Verfügbarkeit, Termine gleich | 51 | 32 % |
| nichts außer Text (Zusammenfassung, Titel) | 23 | 14 % |
| zusammen | 161 | |

- **Verfügbarkeit heute:** Das Modell liest sie mit; im Extraktions-Eval liegt „Platzstand“ für Haiku bei 82–98 % (`evals/results.md`). Weil der Hash die Verfügbarkeit enthält, ist der Modellwert so frisch wie die letzte Nacht.
- **Wo der Stand liegt:** Im Angebot `availability` mit `status`, `note`, `checkedAt` (`src/domain/schema.ts`, strikt). In `data/raw` trägt jedes Event `availability` ohne `checkedAt` (`lib/raw.ts`); `checkedAt` gibt es nur je Anbieter. Einmalige Events mit mehreren Terminen zerlegt der Build in ein Angebot je Termin (`lib/build-offers.ts`).
- **Antwortschema:** `ExtractResponse` wird aus `RawEvent` abgeleitet (`lib/extract.ts`) und steckt im Cache-Schlüssel. Ein neues Feld an `RawEvent` erzwänge eine Neuextraktion aller Anbieter.
- **Zustand je Anbieter:** `adopted()` und weitere Pfade in `lib/refresh.ts` (Einbruch ohne `inputHash`, `unconfirmedCollapse`, `afterStrongRetry`) bauen neue Objekte aus festen Feldern; was sonst in `data/raw/<id>.json` steht, ginge verloren.
- **URLs der Events sind oft nicht eindeutig:** `fbs-nuernberg` hat 81 Events mit 9 verschiedenen `url`, eindeutig sind sie erst über Ort und Titel (geprüft 2026-10-25).
- **Was die Pipeline von einer Seite behält:** nur Text. `io/fetch-inputs.ts` und `lib/fetch.ts` geben `extractPage(...).text` weiter; das HTML wird verworfen.
- `references/booking-systems.md` beschreibt für 16 Systeme, wo die Platzangabe steht; die meisten sind ohne Browser lesbar.

## Was dieser Plan liefert und was nicht

1. **Stufe D:** Rezepte lesen die Verfügbarkeit jede Nacht deterministisch; wo ein gültiges Rezept eindeutig zuordnet, gilt sein Wert vor dem des Modells. Das ist genauer als das Modell, und der Stand hält auch, wenn die Extraktion eines Anbieters scheitert.
2. **Die Extraktion bleibt täglich und unverändert** (voller Text, gleicher Hash, gleicher Prompt). Der Modellwert ist der Rückfall und nie älter als eine Nacht. Der „Haiku-Rückfall“ des Nutzers ist damit die tägliche Extraktion selbst: Haiku mit Sonnet als Fallback, große Seiten in Teilen bis 25 000 Zeichen (`splitInput`), je Aufruf weit unter 100 000 Tokens.
3. **Kurse seltener** (wöchentlich bzw. Hash ohne Verfügbarkeit) kommt als Folgeplan, sobald Stufe D ihre Abdeckung im Betrieb gezeigt hat (Ziel 1). Zwei Reviews haben gezeigt, dass beides zugleich Stände verliert oder falsch stempelt (Review 2).
4. **Effort hoch** für die Extraktion ist eine eigene Kleinänderung mit Eval (Nicht-Ziele).

## Ziel

1. **Abdeckung.** Nenner: Events auf Programmseiten mit `kind` `html` oder `json-api`, ohne `blocked`, ohne Login und ohne Bot-Sperre, deren Modellstatus weder `unbekannt` noch `ohne-anmeldung` ist (ohne Sammelkalender-Events, E9). Der Bericht schreibt Nenner und Zähler jede Nacht. Für mindestens 80 % liefert ein gültiges Rezept den Status.
2. **Richtig.** Stichprobe von 100 per Rezept bestimmten Angeboten über alle Systeme mit Rezept (höchstens 8), aus allen Regionen im Nachtlauf (Düsseldorf erst, wenn Plan 0039 auf `main` ist), geprüft von Hand gegen den gespeicherten Seitenstand desselben Laufs (`runs/<datum>/verfuegbarkeit/`): höchstens 2 Fehler. Im Zweifel gilt der Modellwert.
3. **Frisch.** Für Anbieter mit erfolgreichem Abruf ist jeder angezeigte Status höchstens 26 Stunden alt (Rezeptwert mit eigenem `checkedAt`, sonst Modellwert mit `raw.checkedAt` wie heute). Bei Abrufausfall gilt wie heute der Altbestand.
4. **Extraktion unverändert.** `EXTRACT_KEY_PARTS` (Prompt und Schema) und `extractKey` bleiben gleich; Golden-Tests halten das fest. Keine Neuextraktion aller Anbieter durch diesen Plan.

## Nicht-Ziele

- **Kurse seltener extrahieren, Hash ohne Verfügbarkeit** (Folgeplan; Restpunkt in `docs/ideas.md`, mit dem Messbefehl für Neuextraktionen nach Art der Änderung).
- **Effort für die Extraktion** (`--effort high`, vom Nutzer gewünscht): eigene Kleinänderung mit zwei Eval-Läufen gegen `evals/results.md`. Laut Doku zählen Denk-Tokens gegen die Ausgabegrenze (32 000); das Eval zählt deshalb auch abgeschnittene Teile.
- **Anzeige einer Platzzahl** (`freePlaces`): mit einem UI-Plan samt Mockup. Dieser Plan liefert die Zahl in `note` („2 Plätze frei“).
- **Anmeldefenster** (`registrationWindow`, Beginn und Ende der Anmeldung): bleibt bei der Extraktion. „Anmeldestand“ heißt hier nur der Status (frei, wenige, ausgebucht, Warteliste).
- Ausführbarer Code vom Modell (E2).
- Login-geschützte Systeme (Nimbuscloud), Bot-Sperren (eversports hinter Cloudflare), PDF- und iCal-Programmseiten: kein Rezept, Modellwert wie heute.
- Sammelkalender-Events (`coveredBy`, `via`): Status über die Extraktion wie heute (E9).

## Entscheidungen

### E1 – Ablauf je Nacht

`pipeline nightly` bleibt der eine Lauf im Job `nachtlauf` (`contents: read`, ADR 0026, Punkt 5):

1. **Abruf** aller Programmseiten wie heute, einmal. `FetchedProvider.pages[]` bleibt unverändert (sonst änderten sich `extractKey` und `pageUrls`); neu kommt ein eigenes Feld `bodies: {programme, url, body}[]` mit HTML bzw. JSON jeder abgerufenen Seite einschließlich Folgeseiten, `programme` ist die Programmseite des Katalogs, zu der sie gehört. Ein Golden-Test prüft, dass `extractKey` mit und ohne `bodies` gleich ist.
2. **Extraktion (Stufe C)** wie heute.
3. **Rezept-Phase** nach der Extraktionsschleife, nur im Nachtlauf (nicht im Entdecken, obwohl beide `refreshProvider` nutzen): Rezepte anlegen und prüfen (E3), seriell nach Zahl der Angebote der Seite, mit eigener Grenze `RECIPE_BUDGET` (30 Aufrufe, 2 Mio. Tokens je Nacht), die nicht gegen `NIGHT_BRAKES` zählt.
4. **Stufe D** auf den endgültigen Events und den Bodies desselben Abrufs: Rezepte anwenden (E2, E4, E5), Ergebnis als `live` in den Rohdaten (E6). Kein Modell.
5. Build (`buildOffers`; Rezeptwert vor Modellwert, wenn der Schalter es erlaubt, E6), Gates, Übergabe an `veroeffentlichen` wie heute.

- **Schalter** `VERFUEGBARKEIT` (Repo-Variable, an `pipeline nightly` als `--verfuegbarkeit=aus|schatten|an`): `aus` überspringt Rezept-Phase und Stufe D und entfernt `live`; `schatten` schreibt `live` und Rezeptzustand nach `data/raw`, aber der Build ignoriert `live`; `an` nutzt `live` im Build.
- **`--dry-run`**: Stufe D schreibt wie die Extraktion nur ins Ausgabeverzeichnis bzw. die Überlagerung (`io/nightly.ts`).

### E2 – Rezept statt Skript

Das Modell schreibt **kein ausführbares Skript**, sondern ein Rezept aus Daten, das ein fester Interpreter (`lib/recipe.ts`, rein, cheerio wie `lib/html-extract.ts`) ausführt. Grund: Ein Skript, das ein Modell nach dem Lesen fremder Webseiten schreibt, kann eingeschleuste Anweisungen enthalten und liefe nachts in Actions. Ein Rezept kann nur lesen.

```yaml
# je Programmseite, in data/raw/<id>.json unter "recipes"
programme: https://www.fbs-nuernberg.de/kurse/…   # URL-Vorlage der Programmseite wie im Katalog (auch mit {von}/{bis})
item: "article.kurs"                               # CSS-Selektor je Kurs; bei JSON ein Pfad wie "data.courses[*]"
key:                                               # Bestandteile des Schlüssels (E4), alle innerhalb von item
  link:  { select: "a.kurslink", attr: href }      # Detail-URL (nur, wenn eindeutig, E4)
  start: { select: ".termin", pattern: "{datum} {zeit}" }
  title: { select: "h3" }
  place: { select: ".ort" }                        # optional: Ort oder Standort
status:
  select: ".ampel"                                 # muss innerhalb von item liegen
  attr: class                                      # Attribut statt Text; Vergleich je Token
  map: { green: frei, yellow: wenige, red: warteliste }
places: { select: ".plaetze", pattern: "{n} frei" } # optional, nur für note und für Status ohne map
waitlist: { select: ".warteliste", pattern: "{n}" } # optional: Zahl auf der Warteliste
origin: modell                                     # bei Systemrezepten stattdessen: system: fbs
model: haiku
verifiedAt: 2026-10-25T01:40:00+02:00
stale: false
failures: 0
```

- **Abruf nur nach Katalog.** Das Rezept nennt die Programmseite des Katalogs, an die es gebunden ist; `kind`, `render`, `follow` und `request` kommen aus dem Katalog. Ein Rezept wirkt nur auf Bodies, die der Nachtlauf ohnehin abruft, und setzt nie `follow`.
- **Seiten mit `use: verfuegbarkeit`** (drei im Katalog) tragen keine eigenen Events: Ihr Rezept ordnet über den Schlüssel Events anderer Programmseiten desselben Anbieters zu.
- **Muster ohne reguläre Ausdrücke vom Modell.** `pattern` ist Text mit Platzhaltern `{n}` (Zahl), `{datum}` (`TT.MM.` oder `TT.MM.JJJJ`), `{zeit}` (`HH:MM` oder `HH.MM`, etwa Kursolino „10.15“) und höchstens einem `{*}` (beliebiger Text ohne Zeilenumbruch), das nicht direkt neben einem anderen Platzhalter steht. Der Interpreter vergleicht linear über `indexOf` und feste Teilausdrücke für die Platzhalter; Literale werden nie als Muster gelesen; Texte werden auf 2 000 Zeichen gekürzt.
- **JSON:** `item` ist ein Pfad, `select` ein Feldpfad relativ zum Eintrag, `pattern` wirkt auf den Textwert; Feldtyp `iso` (`{ select: "startDateTime", type: iso }`) liest ISO-Zeitpunkte (aus UTC nach Europe/Berlin über `src/domain/time.ts`).
- **Selektoren über eine Positivliste:** Typ, `.klasse`, `#id`, `[attr]`, `[attr=wert]`, `[attr^=wert]`, Nachfahre und Kind, höchstens 4 Kombinatoren und 200 Zeichen. Alle Pseudoklassen sind ungültig. Je Seite gilt ein Zeitlimit von 2 Sekunden für alle Selektoren; wird es überschritten, gilt das Rezept in dieser Nacht als versagt.
- **Vorrang beim Status:** (1) `map` auf den Statusknoten; ein unbekannter Wert ergibt „keine Angabe“; (2) ohne `map`-Treffer aus `places`: mehr als 2 frei = `frei`, 1–2 = `wenige`, 0 = `ausgebucht`, aber 0 mit `waitlist` > 0 = `warteliste` (wie `extract.md` für Kursorganizer); (3) sonst keine Angabe. Mehrdeutige Werte (Kufer „rot = ausgebucht oder Warteliste“) werden nicht gemappt. Ein Rezeptwert `unbekannt` gilt als keine Angabe.
- **`note`:** aus `places`: „1 Platz frei“, „N Plätze frei“, „ausgebucht“; sonst keine `note`.

### E3 – Rezepte: Systemrezepte zuerst, dann vom Modell mit Schwellen

1. **Systemrezepte** (S1) im Code (`lib/recipes/`) für FBS (Ampel-Attribut), Kufer (Liste mit Folgeseiten, nur grün/gelb gemappt), Hebamio (Text), Kursorganizer (JSON über `request`, Schlüssel mit `place`), JSON-LD `Course`/`offers.availability`. In `data/raw` stehen sie nur als Verweis `system: <name>` mit Zustand, damit ein Fehlerbehebung im Code sofort wirkt. **Erkennung je Seite im Code** (`detectSystem(page)` nach Merkmalen aus `booking-systems.md`, etwa „Kufer Software GmbH“, `kuferweb/webbasys`, Hebamio-Host, Kursorganizer-`request`, JSON-LD-Typ), nicht über das Freitextfeld `availability.system`; ein Test prüft die Erkennung für jede heutige Programmseite dieser Systeme. Systemrezepte werden nie entfernt; versagen sie, meldet der Bericht es (keine Schleife aus Entfernen und Neuanlegen).
2. **Rezepte vom Modell** (S2, nur wenn S1 Ziel 1 nicht erreicht) für Seiten mit Platzangaben ohne Systemrezept, ohne PDF und iCal, mit mindestens 5 Events mit künftigem Termin: in der Rezept-Phase (E1) ein Aufruf `prompt/recipe.md` (ohne Werkzeuge, Haiku, `CallRecord.step` `recipe`). Eingabe: ein DOM-Auszug (`lib/dom-excerpt.ts`: Skripte, Styles und Attribute außer `class`, `id`, `data-*`, `href` entfernt; je Beispiel der kleinste Vorfahr, der genau einen extrahierten Kurstitel enthält und dessen Elternelement mehrere enthält; 5 Beispiele, höchstens 60 000 Zeichen) und die Events dieser Seite mit Titel, `url`, Ort, erstem künftigem Termin und Modellstatus. Systemrezepte dienen als Beispiele.
3. **Selbsttest im Code** auf dem Body desselben Laufs (für Modell-Rezepte Pflicht, für Systemrezepte als Bericht):
   - (a) jeder Statusknoten liegt innerhalb seines `item`;
   - (b) für mindestens 90 % der Events der Seite (E4, Nenner) genau eine Zuordnung;
   - (c) bei mindestens 95 % der zugeordneten derselbe Status wie das Modell;
   - (d) **trennscharf:** Jeder Modellstatus, der bei mindestens 2 Events der Seite vorkommt, wird bei mindestens 80 % dieser Events getroffen; kommen im Modell mindestens 2 Status vor, liest das Rezept auf dem Body mindestens 2 verschiedene Werte. Ein Rezept, das immer denselben Wert liefert, besteht so nicht.
   - Die Abweichungen stehen im Bericht. Scheitert der Test, ein zweiter Versuch mit der Fehlerliste; scheitert auch der, ruht die Seite 4 Wochen (`recipeRetry`).
4. **Laufender Abgleich:** Jede Nacht vergleicht der Code Rezept- und Modellwert der zugeordneten Events nach (c) und (d). Besteht ein Modell-Rezept nicht, wird es `stale` und in der nächsten Nacht neu erzeugt; ein Systemrezept bleibt, der Bericht meldet es.

### E4 – Zuordnung über Schlüssel, jede Nacht neu

- Die Extraktion bleibt unverändert (kein neues Feld, kein neues Schema).
- **Events einer Seite:** Ein Event gehört zu der Programmseite, zu der seine `sourceUrl` gehört (die Seite selbst oder eine ihrer Folgeseiten, laut `bodies[].programme`).
- **Erster künftiger Termin** eines Events: mit `expandSchedule` und denselben freien Tagen wie der Build, bezogen auf `today` des Laufs (auch bei `--build-only` an einem anderen Tag).
- **Kanonischer Schlüssel** je Event, innerhalb des Anbieters:
  1. normalisierte `url`, aber nur, wenn sie unter den Events des Anbieters eindeutig ist und weder der `sourceUrl` noch einer Programmseite gleicht (bei FBS also nie);
  2. sonst `venueId` + normalisierter Kerntitel + erster künftiger Termin (ISO, Europe/Berlin);
  3. ist auch das nicht eindeutig, bekommt das Event keinen Schlüssel und keinen Rezeptwert.
  - **Einmalige Events mit mehreren Terminen** (zerlegt der Build je Termin): Schlüssel je Event **und** Termin (Variante 2 mit dem jeweiligen Termin); der Build setzt den Wert je zerlegtem Angebot. Reihen (`kurs`, `regelmaessig`) haben einen Status und den Schlüssel über den ersten künftigen Termin.
- **Zuordnung Rezept-Eintrag → Event:** gleiche Detail-URL (nur bei Schlüsselvariante 1); sonst gleicher Termin auf die Minute (`{datum}` ohne Jahr bekommt das Jahr des verglichenen Events) **und** `sameCoreTitle` (`lib/similar.ts`), mit `place` zusätzlich `similarName` gegen Name oder Adresse des Orts. Ohne Termin im Eintrag: Titel und, falls vorhanden, `place`, und nur wenn das auf der Seite eindeutig ist.
- Nur 1:1. Mehrere Kandidaten: keine Zuordnung, Modellwert. Liefern zwei Rezepte desselben Anbieters für ein Event verschiedene Werte: keine Zuordnung, Bericht.
- **Nenner der Schwellen** (E3): Events dieser Seite aus der aktuellen Extraktion mit künftigem Termin und Schlüssel. Begonnene Kurse, die aus der Liste verschwinden, zählen nicht als Fehlschlag.

### E5 – Einbruch- und Sprungschutz für Stufe D

- Kippt in einer Nacht mehr als die Hälfte der Rezeptwerte einer Seite (mindestens 3) gegenüber dem `live` der Vornacht, schreibt Stufe D für diese Seite nichts; ein Modell-Rezept wird `stale`, ein Systemrezept gemeldet; es gilt der Modellwert.
- Weniger als 80 % Zuordnungen aus dem Nenner: Das Rezept gilt in dieser Nacht als versagt (Modellwert; Zähler `failures`).
- Ein Modell-Rezept, das drei Nächte in Folge versagt, wird entfernt und frühestens nach `recipeRetry` neu erzeugt.

### E6 – Was Stufe D schreibt und wie der Build es nutzt

- `ProviderRaw` (`lib/raw.ts`) bekommt auf **Anbieterebene**, nicht an `RawEvent`:
  - `recipes`: Liste von Rezepten bzw. Verweisen `system: <name>` mit Zustand (`verifiedAt`, `stale`, `failures`, `recipeRetry`);
  - `live`: Map vom kanonischen Schlüssel (E4) auf `{status, note?, freePlaces?, checkedAt}`, jede Nacht von Stufe D ersetzt.
  `ExtractResponse` bleibt unverändert; ein Golden-Test vergleicht `EXTRACT_KEY_PARTS` (Prompt und Schema) mit dem heutigen Wert.
- **Alle Pfade in `lib/refresh.ts`** (`adopted()`, „unverändert“, `pending-uebernommen`, `failed()`, Einbruch ohne `inputHash`, `unconfirmedCollapse`, `afterStrongRetry`) übernehmen `recipes` aus dem Vorzustand. `live` verwirft die Extraktion: Stufe D schreibt danach neu (E1). Scheitert der Abruf eines Anbieters, verwirft Stufe D dessen `live` ebenfalls (kein frischer Beleg), und es gilt der Altbestand wie heute. Ein Test prüft beides über alle Pfade.
- **Build** (`fromRaw`, `lib/build-offers.ts`), bei Schalter `an`: Hat ein Angebot einen Eintrag in `live`, wird `Offer.availability` daraus gebildet: `status` und `checkedAt` aus `live`, `note` aus `live` (E2) oder keine, nie die `note` des Modells. `freePlaces` geht nicht ins Angebot (das Schema ist strikt). Ohne Eintrag oder bei Schalter `aus`/`schatten`: wie heute.
- **Schreibwege, abschließend** (auch in ADR 0034): `refreshProvider` (Events wie heute, `recipes` übernehmen); Rezept-Phase (`recipes` anlegen, prüfen, `stale`, `recipeRetry`); Stufe D (`live` sowie `verifiedAt`, `stale`, `failures` der Rezepte); Schalter `aus` (entfernt `live`). Ein Test vergleicht `data/raw` vor und nach Stufe D und schlägt bei jedem anderen Feld fehl.
- **`data:validate`** prüft `recipes` und `live` nur der Form nach (Zod); den Inhalt (Positivliste, Bindung an eine Programmseite) prüft der Interpreter beim Anwenden. Eine verschärfte Positivliste macht so nie die committeten Rohdaten rot; ein Rezept, das nicht mehr passt, versagt und wird gemeldet bzw. ersetzt.

### E7 – ADR 0034

Ändert ausdrücklich: ADR 0026, Punkt 2 (Modellaufrufe auch ohne geänderten Hash, für Rezepte in der Rezept-Phase; Rohdaten auch aus der Rezept-Phase und Stufe D, nur die Felder aus E6) und den Satz in `docs/architecture.md`, dass nur `refreshProvider` den Inhalt von `data/raw` erzeugt. Nennt den Vorrang Rezept vor Modell im Build und die Schalterstellung.

### E8 – Sammelkalender

Events aus Sammelkalender-Kandidaten (`coveredBy`, `via`) haben keine Programmseite. Ihr Status kommt weiter aus `soldOut`/`waitlist` der Kandidaten über die Extraktion; sie zählen nicht im Nenner von Ziel 1. Eine deterministische Übernahme aus dem Kandidaten (wie `assignVia`) ist ein Restpunkt für `docs/ideas.md`.

## Nutzerentscheide (offen)

- **N1 – Reihenfolge.** Empfehlung: wie unter „Was dieser Plan liefert“ (Stufe D zuerst, Kurse seltener als Folgeplan nach dem Nachweis von Ziel 1). Alternative: Kurse sofort wöchentlich wie vorgeschlagen; dann wären Status von Angeboten ohne Rezept bis zu 7 Tage alt, und neue Kurse erschienen bis zu 7 Tage später.

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/recipe.ts` (neu) | Schema, Muster, Selektor-Positivliste und Zeitlimit, Interpreter, Schlüssel, Zuordnung, `detectSystem` (rein) | S1 |
| `scripts/pipeline/lib/recipes/` (neu) | Systemrezepte (FBS, Kufer, Hebamio, Kursorganizer, JSON-LD) | S1 |
| `scripts/pipeline/io/fetch-inputs.ts`, `lib/fetch.ts`, `lib/refresh.ts` (`FetchedProvider`) | `bodies` als eigenes Feld, `pages[]` unverändert | S1 |
| `scripts/pipeline/lib/raw.ts`, `schema/provider-raw.schema.json` | `recipes`, `live` auf Anbieterebene | S1 |
| `scripts/pipeline/lib/refresh.ts` | `recipes` über alle Pfade übernehmen | S1 |
| `scripts/pipeline/lib/dom-excerpt.ts` (neu) | DOM-Auszug | S2 |
| `scripts/pipeline/io/nightly.ts` | Rezept-Phase, Stufe D, Schalter, `--dry-run` | S1–S3 |
| `scripts/pipeline/lib/availability.ts` (neu) | `applyRecipes` (Stufe D), Sprungschutz, Diff-Regel | S3 |
| `scripts/pipeline/lib/build-offers.ts` | Rezeptwert vor Modellwert, je zerlegtem Angebot, `note` aus dem Rezept | S3 |
| `scripts/pipeline/lib/extract.ts` | Schritt `recipe` in `CallRecord.step` | S2 |
| `scripts/pipeline/lib/cost.ts`, `lib/report.ts` | `RECIPE_BUDGET` getrennt von `NIGHT_BRAKES`; Bericht Stufe D (Nenner, Abdeckung, Abweichungen, `stale`, Sprünge) | S2, S3 |
| `scripts/pipeline/prompt/recipe.md` (neu) | Rezept-Erzeugung | S2 |
| `scripts/pipeline/cli.ts` | `nightly --verfuegbarkeit` | S1 |
| `.github/workflows/nightly.yml` | Repo-Variable `VERFUEGBARKEIT` an `--verfuegbarkeit` | S3 |
| `scripts/validate-data.ts` | `recipes` und `live` der Form nach | S1 |
| `evals/availability/` (neu), `scripts/pipeline/io/eval.ts` | Verfügbarkeits-Fälle (eingefrorener Body, erwartete Werte) | S1 |
| ADR 0034 (neu, unter `docs/adr/`); ADR 0026 Statuszeile; `docs/architecture.md`; `CLAUDE.md` („Daten“: Rezept-Phase und Stufe D schreiben `recipes` und `live` in `data/raw`); Skill (Nachtlauf, `booking-systems.md`); `docs/ideas.md` (Folgeplan Kurse seltener, Effort, Sammelkalender) | Doku | S1–S4 |

## Tests (test-first)

- `lib/recipe.test.ts`: Muster (`{n}`, `{datum}`, `{zeit}` mit `:` und `.`, ein `{*}`), zweites `{*}` und `{*}` neben einem Platzhalter ungültig, Literal mit Regex-Zeichen bleibt Literal, Text mit 100 000 Zeichen in unter 50 ms; Selektoren außerhalb der Positivliste und mit mehr als 4 Kombinatoren ungültig; Zeitlimit je Seite; Statusknoten außerhalb von `item` ungültig; Vorrang `map` vor `places`, 0 mit Warteliste → `warteliste`, `unbekannt` → keine Angabe; `note` „1 Platz frei“ / „2 Plätze frei“; JSON-Pfade und Feldtyp `iso` aus UTC.
- `detectSystem`: jede heutige Programmseite von FBS, Kufer, Hebamio, Kursorganizer und JSON-LD wird erkannt, andere nicht.
- Systemrezepte: je Fixture (FBS mit lauter gleichen `url`, Kufer mit Folgeseite, Hebamio, Kursorganizer-JSON mit `place`, JSON-LD) die erwarteten Werte.
- Schlüssel und Zuordnung: `url` nur bei Eindeutigkeit, sonst Ort + Titel + Termin; nicht eindeutig → kein Schlüssel; einmaliges Event mit drei Terminen → drei Schlüssel; erster künftiger Termin über `expandSchedule` mit freien Tagen (Ferien) und `today`; `{datum}` ohne Jahr mit dem Jahr des Events über den Jahreswechsel; widersprechende Rezepte → keine Zuordnung; begonnener Kurs nicht im Nenner; Event einer Folgeseite gehört zur Programmseite.
- `lib/dom-excerpt.test.ts`: entfernt Skripte und fremde Attribute, wählt je Beispiel den Vorfahren mit genau einem Titel, 5 Beispiele, Grenze 60 000 Zeichen.
- Selbsttest: 89 % zugeordnet → ungültig; 94 % gleicher Status → ungültig; ein Rezept mit immer demselben Wert auf einer Seite mit 95 % „frei“ und 2 × „ausgebucht“ → ungültig (Trennschärfe); Seite mit 4 Events → kein Modell-Rezept; zweiter Fehlschlag → 4 Wochen Ruhe.
- `lib/availability.test.ts`: `live` jede Nacht ersetzt; Sprungschutz (Hälfte, mindestens 3); < 80 % → versagt; Modell-Rezept dreimal versagt → entfernt, Systemrezept nie; Abrufausfall → `live` des Anbieters verworfen; Diff-Test (nur `live` und Rezeptzustand ändern sich).
- `lib/refresh.test.ts`: `recipes` übersteht jeden Pfad von `planRefresh`/`applyOutcome` (auch Einbruch ohne `inputHash`, `unconfirmedCollapse`, `afterStrongRetry`); Golden-Tests für `EXTRACT_KEY_PARTS` und für `extractKey` mit und ohne `bodies`.
- `lib/build-offers.test.ts`: Schalter `an` mit `live` → Status, `checkedAt`, `note` aus dem Rezept, keine Modell-`note`; zwei Events mit gleicher `url` und verschiedenen Werten in `live` bekommen je ihren Wert; einmaliges Event je Termin; `schatten`/`aus` wie heute; `freePlaces` nie im Angebot.
- `io/nightly.test.ts`: Rezept-Phase zählt nicht gegen `NIGHT_BRAKES`; Entdecken erzeugt keine Rezepte; `--dry-run` schreibt nicht nach `data/raw`.

## Schritte

Vor S1: neues `/plan-review` (Bezug). Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected` (Änderungen unter `data/` oder am Schema mit `--smoke`); S1, S2 und S3 mit `/arch-review`.

- **S0 – Messen (ohne Modell).** Nenner von Ziel 1 je System und Region; Zuordnungsquote offline für FBS, Kufer und Hebamio auf gespeicherten Bodies mit dem Schlüssel aus E4, damit Ziel 1 vor dem Bau als machbar belegt ist; Größe der Bodies im Speicher. N1 entscheiden.
- **S1 – Interpreter und Systemrezepte.** `lib/recipe.ts`, Schlüssel, Zuordnung, `detectSystem`, Systemrezepte mit Fixtures, Verfügbarkeits-Eval-Fälle, `bodies` im Abruf, `recipes`/`live` in `raw.ts`, Übernahme in `lib/refresh.ts`, Schalter (Standard `aus`). Keine Wirkung auf `data/offers.json`.
- **S2 – Rezepte vom Modell, nur wenn nötig.** Liegen die Systemrezepte nach S1 (Bericht im Schattenbetrieb) unter Ziel 1: DOM-Auszug, `prompt/recipe.md`, Selbsttest mit Trennschärfe, Rezept-Phase mit `RECIPE_BUDGET`. Sonst entfällt S2 und wird Restpunkt.
- **S3 – Schattenbetrieb, dann scharf.** `applyRecipes`, Sprungschutz, Repo-Variable `VERFUEGBARKEIT=schatten`: Stufe D schreibt `live` und Rezeptzustand nach `data/raw`, der Build ignoriert `live`, der Bericht vergleicht mit dem Modellwert. Zwei Wochen, dann Stichprobe für Ziel 2. Scharf schaltet allein die Variable auf `an`.
- **S4 – Abschluss.** Eine Woche Bericht für Ziele 1 und 3; CI grün, `meta.json` zeigt den Stand, `/browser-review live` (Status und Hinweis in der Detailansicht); Restpunkte nach `docs/ideas.md`, darunter der Folgeplan „Kurse seltener“.

Was sich je Schritt live ändert: S0–S2 nichts an `data/offers.json` (ab S1 bzw. S3 stehen `recipes` und `live` in `data/raw`); erst mit `VERFUEGBARKEIT=an` Status und Hinweis der Angebote mit Rezept.

## Kosten

Nach Nutzervorgabe kein Kriterium. Systemrezepte kosten nichts; Modell-Rezepte (nur S2) einmal je Programmseite, danach nur bei `stale`; die Extraktion bleibt wie heute.

## Risiken

- **Falscher Status am falschen Kurs** ist schlimmer als der Modellwert. Abhilfe: Schlüssel nur bei Eindeutigkeit, Zuordnung 1:1, Statusknoten in `item`, Selbsttest mit Trennschärfe, laufender Abgleich, Sprungschutz, Schattenbetrieb, Stichprobe (Ziel 2); im Zweifel Modellwert.
- **Eingeschleustes Rezept** (Webseite steuert den DOM-Auszug): Abhilfe: Rezept ist nur Daten, Positivliste, Abruf nur nach Katalog, Trennschärfe (ein Rezept mit festem Wert besteht nicht), Sprungschutz.
- **Rezept gegen ein schwächeres Modell geprüft** (Platzstand 82–98 %): Abhilfe: Systemrezepte zuerst; Schwellen statt „alle gleich“; Abweichungen im Bericht.
- **Seiten ändern ihr Layout:** Abhilfe: Plausibilität, laufender Abgleich jede Nacht, Sprungschutz, Entfernen nach drei Fehlschlägen (Modell-Rezepte).
- **Zustand geht bei Neuextraktion verloren:** Abhilfe: `recipes` auf Anbieterebene, Übernahme über alle Pfade mit Test; `live` entsteht jede Nacht nach der Extraktion neu.
- **Speicher:** Bodies aller Seiten im Speicher (FBS mit `--max-chars 1000000`). Abhilfe: S0 misst; reicht der Speicher nicht, hält der Abruf Bodies nur für Seiten mit Rezept oder Rezept-Bedarf.

## Review (2026-10-25) – Verdict: Überarbeiten

Erster, unabhängiger Review auf den Entwurf (damals mit Stufe C wöchentlich und Hash ohne Verfügbarkeit). Übernommen: `checkedAt` und Schlüssel neu geregelt, `body` im Abruf, ein Prozess je Nacht, Abruf nur nach Katalog, ReDoS-Schutz, Systemrezepte zuerst mit Schwelle, Sammelkalender ausgenommen, Bremsen und Einführung, messbare Ziele, Reihen und laufende Kurse, Schreibwege; Rückfall als vorhandene Extraktion statt eigenem Prompt.

## Review 2 (2026-10-25) – Verdict: Überarbeiten

Zweiter, unabhängiger Review. Die drei Blocker hingen am Hash ohne Verfügbarkeit und an Feldern am Event: gelöst, indem Extraktion und Hash unverändert bleiben, „Kurse seltener“ ein Folgeplan wird und Stufe D nach der Extraktion auf Anbieterebene (`live`, `recipes`) schreibt. Dazu übernommen: Antwortschema unverändert mit Test, abschließende Schreibwege, `note` nie vom Modell bei Rezeptwert, Mindestzahl Events und Sprungschutz, Nenner im Bericht, `detectSystem` je Seite, Positivliste für Selektoren, Notschalter.

## Review 3 (2026-10-25) – Verdict: Überarbeiten

Dritter, unabhängiger Review (letzter erlaubter Durchgang nach dem Skill). B1–B3 und M1, M3 aus Review 2 bestätigt gelöst. Neu, alle übernommen:

**Blocker**
- **B1 Schlüssel kollidiert bei gleicher `url`** (bei FBS 81 Events mit 9 URLs, am 2026-10-25 nachgeprüft): E4 neu: `url` nur bei Eindeutigkeit und nicht gleich `sourceUrl`/Programmseite, sonst `venueId` + Kerntitel + erster Termin, sonst kein Schlüssel; Tests mit FBS-Fixture und zwei Events gleicher `url`. **Nicht mehr unabhängig geprüft; deshalb neues `/plan-review` vor S1.**

**Major**
- **M1 einmalige Events mit mehreren Terminen:** Schlüssel je Event und Termin, Build je zerlegtem Angebot (E4, E6, Test).
- **M2 Rezept mit festem Wert besteht den Selbsttest:** Trennschärfe (E3.3 d), `unbekannt` = keine Angabe, Test.
- **M3 Rezept-Erzeugung in `refreshProvider` und Bremsen:** eigene Rezept-Phase nach der Extraktionsschleife, nur im Nachtlauf, `RECIPE_BUDGET` getrennt von `NIGHT_BRAKES` (E1, Test).
- **M4 Vorrang Status/Platzzahl, JSON:** `map` vor `places`, Warteliste, Feldtyp `iso`, `{zeit}` mit Punkt, Schlüsselteil `place` (E2, Tests).
- **M5 Hashwechsel über den Abruf:** `pages[]` unverändert, `bodies` als eigenes Feld, Golden-Tests für `extractKey` und `EXTRACT_KEY_PARTS` (E1, E6).
- **M6 Schattenbetrieb ohne Vornacht:** `schatten` schreibt `live` und Rezeptzustand nach `data/raw`, nur der Build ignoriert `live`; Scharfschalten über die Repo-Variable (E1, S3).
- **M7 Ziele:** Ziel 3 auf Anbieter mit erfolgreichem Abruf; Nenner von Ziel 1 ohne PDF, iCal, Login, `blocked`; Ziel 2 „alle Systeme mit Rezept, höchstens 8“, Düsseldorf erst nach Plan 0039 auf `main`.

**Minor**, alle übernommen: Repo-Variable statt nur CLI-Flag, `nightly.yml` in „Dateien“; `--dry-run`; erster Termin über `expandSchedule` mit freien Tagen und `today`; Abrufausfall verwirft `live`; Systemrezepte als Verweis `system:`, nie entfernt; `data:validate` nur der Form nach; höchstens 4 Kombinatoren und Zeitlimit; DOM-Auszug über den Vorfahren mit genau einem Titel; ADR 0034 nennt ADR 0026, Punkt 2 und `docs/architecture.md`; Pfadtest um `unconfirmedCollapse`, `afterStrongRetry` und Einbruch ohne `inputHash` erweitert, `note` im Singular.

**Umfang**, übernommen: Effort (früher E7) als eigene Kleinänderung, Messbefehl (früher E8) in den Folgeplan; S2 nur, wenn die Systemrezepte Ziel 1 nicht erreichen; „Anmeldestand“ gegen `registrationWindow` abgegrenzt (Nicht-Ziele).
