# Plan 0037 – Eine Kategorie je Angebot

Status: in Umsetzung
Datum: 2026-10-12
Bezug:
- ADR 0030 (neu, `docs/adr/0030-eine-kategorie-je-angebot.md`): löst ADR 0003, Punkt „Themen und Kategorien“, und die Invariante „Kategorien werden berechnet, nie gespeichert“ (`docs/architecture.md`, ADR 0012) teilweise ab
- Plan 0014 (`docs/plans/archiv/0014-kategorie-etikett-folgt-filter.md`): wird zurückgebaut
- Plan 0024 (`docs/plans/archiv/0024-karte-im-app-look.md`, E5 `mainCategory`), Plan 0030 und ADR 0024 (Kategorien eines Anbieters aus seinen Angeboten)
- Plan 0032 (`docs/plans/0032-daten-automatisch.md`): Cache-Schlüssel E4, Bremsen E8, Evals E9, N3 (Neu-Extraktion nach Wechsel von Prompt, Schema oder Modell)
- Skill `babyevents-nuernberg`, Abschnitt 5 („Modell wechseln“: einmal höhere Token-Bremse)

## Anlass

Nutzer (2026-10-12): „Angebote können mehrere Kategorien haben, es wird aber immer nur eine angezeigt. Je nach Filter ändern sich die Kategorien. Ich möchte auf nur eine Kategorie pro Angebot umstellen.“

**Nutzerentscheidungen (fest):**

1. Das Modell wählt in der Extraktion je Angebot die **Hauptkategorie**: neues Pflichtfeld `category`, einer der 12 Werte aus `CATEGORIES`. Prompt und Antwortschema ändern sich. Das löst eine Neu-Extraktion aller Anbieter aus, die Evals werden angepasst.
2. Der Kategoriefilter wirkt **nur auf die Hauptkategorie**, nicht mehr als ODER über alle abgeleiteten Kategorien. Etikett und Filter sind damit immer gleich. Das Etikett springt nicht mehr mit dem Filter, Plan 0014 wird zurückgebaut.

**Nutzerentscheide nach dem Entwurf (2026-10-12):**

3. Die Konfliktregeln aus E8 gelten unverändert (Tanz → Bewegung, Babykonzert → Bühne, Krabbelreime in der Bibliothek → Bücher, Krabbelgottesdienst → Treffs).
4. Beide Kosten sind freigegeben: Eval-Abnahme (A4, etwa $0,25) und Neu-Extraktion mit `max_tokens=5000000` und `max_calls=200` (A6, etwa $0,65).

**Umfang:** Stufe C (Abbau des Übergangs) gehört zu diesem Plan. Er bleibt nach dem Deploy von Stufe B `in Umsetzung` und wird erst nach Stufe C archiviert.

## Ziel

- Jedes Angebot hat genau eine Kategorie (`category`). Kachel, Detail, Kalenderpunkte, Kachelbild, Kartenmarker und Anbieter-Sheet leiten ihr Etikett nur daraus ab. Ein Filter ändert kein Etikett.
- `?kat=musik` zeigt genau die Angebote mit `category: "musik"`, in Liste, Anbieter-Tab, Such-Abos und Wochen-Push gleich. Die Merkliste hat keinen Kategoriefilter (`SavedFilter` kennt nur Format, Anmeldung und Zeitraum, `src/domain/saved.ts`) und bleibt davon unberührt.
- Der Übergang bleibt grün: Kein Commit auf `main` macht `pnpm verify`, `pnpm data:validate` oder die Seite rot, auch solange `data/raw/` noch Events ohne `category` enthält.

## Nicht-Ziele

- **Themen streichen.** `topics` bleiben im Datenmodell (E2). Nach diesem Plan liest die Oberfläche sie nicht mehr; was mit ihnen geschieht, ist eine Idee für `docs/ideas.md` (Schritt B6).
- Neue Kategorien, andere Labels, Formen oder Farben. Es bleiben die zwölf aus `src/domain/topics.ts`.
- Mehrere Etiketten je Kachel (`docs/ideas.md`, Zeile „Mehrere Kategorie-Etiketten je Kachel“). Die Idee entfällt mit diesem Plan (E12).
- Hinweis an Nutzer mit Such-Abos (E9).
- Kategorie von Hand korrigieren. Eine falsche Hauptkategorie wird über den Prompt (und einen Eval-Fall) korrigiert, nie in `data/offers.json` oder `data/raw/` (`CLAUDE.md`, Daten).

## Ausgangslage (geprüft 2026-10-12, Stand `84d39c7`)

| Stelle | Heute | Betroffen |
|---|---|---|
| `src/domain/topics.ts` | `CATEGORIES` (12), `CATEGORY_LABELS`, `TOPIC_CATEGORIES` (Thema → Kategorien, `tanz` → bewegung + musik), `categoriesOf`, `leadCategory(topics, focus)`; Kopfkommentar „Kategorien werden nie gespeichert“ | E1, E2, E11 |
| `src/domain/schema.ts` | `OfferFields.topics: z.array(Topic).min(1)`; `Offer` prüft „mindestens ein Thema mit Kategorie“ | E1 |
| `scripts/pipeline/lib/raw.ts` | `RawEvent` = `OfferFields.pick({…, topics, …})`; `validateRaw` prüft dieselbe Themenregel | E1, E4 |
| `scripts/pipeline/lib/extract.ts` | `ExtractResponse` = `RawEvent` ohne `providerId`, `via`; daraus das JSON-Schema für `--json-schema`; `checkExtraction` prüft über `validateRaw` | E3 |
| `scripts/pipeline/io/extract.ts` | `EXTRACT_KEY_PARTS` = Prompt + Antwortschema; mit dem Modell im Cache-Schlüssel (`lib/normalize.ts`, `extractKey`) | E7: jede Änderung extrahiert alles neu |
| `scripts/pipeline/lib/build-offers.ts` | `fromRaw` übernimmt `topics`; Dubletten vereinigen die Themen (`unionTopics`, Schritt 3 und 4); Schritt 7 übernimmt Angebote aus dem Altbestand (`{ ...old, sessions }`) | E5, E6 |
| `scripts/pipeline/lib/report.ts` | `NightlyReport.build` (`offers`, `sessions`, `errors`, `notes`), `nightlyCommitMessage` | E5 (Zähler) |
| `scripts/pipeline/prompt/extract.md` | Beispiel (Z. 30–48) und Regel zu `topics` (Z. 56) | E8 |
| `scripts/pipeline/lib/eval-score.ts`, `evals/cases/*/expected.json` (12 Fälle, 54 Soll-Angebote), `evals/results.md` | Feldtreffer für `format`, Platzstand, `cost`, `registration`, `topics` (Haiku zuletzt 46–47 %) | E10 |
| `src/domain/filter.ts:143` `matchesFilter` | ODER über `categoriesOf(offer.topics)`. Alle Filterwege mit Kategorie laufen hier durch: `applyFilters` (Liste, Anbieter-Tab), `newsFor` (`news.ts`, Such-Abos und Push, auch im Service Worker über `src/sw/push-tailor.ts`). Die Merkliste ruft sie ebenfalls (`saved.ts`, `asFilterState`), setzt aber nie `categories` | E9 |
| `src/ui/App.tsx:243` | `categoryOf: (offer) => leadCategory(offer.topics, route.filter.categories)`; Abnehmer `OfferCard.tsx`, `Overlays.tsx` → `DetailDialog.tsx` (Prop `category`), `SavedCalendar.tsx` (`WeekStrip`, `MonthGrid`) | E11 |
| `scripts/lib/share-pages.ts:156,176` | Kachelbild und Vorschau: `leadCategory(offer.topics, [])`, `imageVersion` hasht die Kategorie | E11 |
| `src/ui/map/geojson.ts:42` `mainCategory`, `src/ui/map-types.ts:44` | häufigste Kategorie über **alle** Kategorien der Angebote eines Orts | E11 |
| `src/domain/directory.ts:183` `providerCategories` | Vereinigung aller Kategorien der kommenden Angebote (ADR 0024, Punkt 3); Abnehmer `ProviderSheet.tsx`, `share-pages.ts:274` | E11 |
| `src/ui/App.tsx:122,157` | übernimmt das Ergebnis von `loadSiteData` (`src/data/site.ts`, castet `site.json` ohne Zod). `src/data` darf aus `src/domain` zur Laufzeit nur `geo.ts` importieren (`.dependency-cruiser.cjs`, `data-domain-runtime-allowlist`, ADR 0010) | E13 |
| Daten | `data/offers.json` 469 Angebote: 260 mit 1 Kategorie, 197 mit 2, 12 mit 3. Häufige Paare: krabbel + musik 56, musik + bühne 44, krabbel + treffs 25, bewegung + musik 23, bücher + bühne 20. `museum` ist nie Leitkategorie. `data/raw/`: 82 Dateien | E7 |
| `.github/workflows/nightly.yml` | `workflow_dispatch` mit `modus`, `max_calls`, `max_tokens`, `budget_min`; `live` nur auf `main` | E7 |
| Fixtures `tests/fixtures/offers.json` | 9 Angebote, 4 mit mehreren Kategorien (Offener Krabbeltreff, Bewegungslandschaft, Krabbelreime, Babykonzert) | E14 |

**Wo `topics` sonst gelesen werden:** Nirgends angezeigt, nicht in der Textsuche (`directory.ts` sucht über Namen). Nach Stufe B lesen sie nur noch die Pipeline (Merge, Rückfall, Warnung), `schema.ts` (Themenregel), die Evals und das Kompatibilitätsnetz in `App.tsx` (E13).

## Entscheidungen

### E1 – Datenmodell: `category` in `OfferFields`, Pflicht erst in Stufe B

- `src/domain/schema.ts`: `const CategoryField = z.enum(CATEGORIES)`, in `OfferFields` als `category` direkt nach `summary`.
  - **Stufe A:** `category: CategoryField.optional()`. `data/offers.json` auf `main` hat bis zum ersten Nachtlauf mit neuem Code kein `category`. Der Nachtlauf `live` läuft nur auf `main` mit dem Code von `main` (`nightly.yml`). Ein Pflichtfeld würde also den Merge-Commit selbst rot machen (`pnpm data:validate`), und `data/offers.json` von Hand zu ändern ist verboten.
  - **Stufe B:** `category: CategoryField` (Pflicht). Voraussetzung: Jedes Angebot in `data/offers.json` auf `main` hat `category`. Das garantiert der erste Nachtlauf nach Stufe A, weil `buildOffers` immer füllt (E5).
- `RawEvent` (`lib/raw.ts`) bekommt `category: CategoryField.optional()` (Stufe A und B) und Pflicht erst in Stufe C. Das Feld steht **ausdrücklich im `.extend({…})`**, nicht in `OfferFields.pick({…})`. Sonst machte Stufe B (`OfferFields.category` Pflicht) es still auch im Rohformat zur Pflicht, und das Antwortschema samt Cache-Schlüssel änderte sich (E3). Grund: `data/raw/*.json` (Zustand je Anbieter, auch `pending`) wird nur durch eine neue Extraktion ersetzt. Anbieter mit Abruffehler, zurückgehaltenem Einbruch oder offener Bremse behalten alte Events ohne `category` womöglich mehrere Nächte.
- `schema/*.json` per `pnpm schema:export` in jeder Stufe neu (Schema-Drift in `check:fast`).

### E2 – `topics` bleiben, ohne Konsistenzzwang

- `topics` bleiben Pflicht, ebenso die Regel „mindestens ein Thema mit Kategorie“ in `Offer` und `validateRaw`. Gründe: Alte Tabs und alte Service Worker filtern und beschriften nach dem Deploy noch über `topics` (E13). Der Rückfall in E5 braucht sie. Merkmale wie `vaeter` und `mehrsprachig` bleiben für spätere Ideen erhalten. Das Streichen wäre eine zweite Schemaänderung ohne Nutzen für diesen Plan.
- **Muss `category` zu den Themen passen?** Nein, kein Fehler. `validateRaw` gibt eine **Warnung** aus, wenn `category` nicht in `categoriesOf(topics)` liegt: `events.N („Titel“).category: musik passt zu keinem Thema (krabbelgruppe, elterncafe)`. Die Warnung steht im Nachtlauf-Bericht unter „Warnungen“.
  - Begründung: Die Hauptkategorie ist nach Nutzerentscheid 1 die Wahl des Modells und das, was Nutzer sehen. Ein Fehler würde die ganze Antwort ungültig machen und eine Wiederholung erzwingen, also die ganze Eingabe noch einmal bezahlen (fbs-nuernberg: 15 Teile). Ein Widerspruch schadet nicht, denn die Oberfläche liest `topics` nicht mehr.
  - Der Prompt verlangt trotzdem, dass `category` zu einem der Themen passt (E8). Die Warnung zeigt, ob das hält. Häufen sich Widersprüche (mehr als 5 % der Events in einem Lauf), wird das ein Eval-Fall und eine Prompt-Korrektur, keine Codeänderung.
  - **Gemessen wird das im Nachtlauf-Bericht:** `nightlyCommitMessage` und der Bericht (`lib/report.ts`) zählen die Warnungen „passt zu keinem Thema“ des Laufs (Text als Konstante `CATEGORY_CONFLICT` in `lib/raw.ts`, damit Bericht und Prüfung dieselbe Zeichenkette nutzen). Bezug sind die Events der in diesem Lauf neu übernommenen Anbieter (Ergebnis `extrahiert` oder `pending-uebernommen`, gezählt aus `raws`). Die Zeile lautet `Kategorie passt zu keinem Thema: N von M neuen Events (x %)`, nur wenn N > 0. Kein Einfluss auf die Ampel.
- `TOPIC_CATEGORIES` und `categoriesOf` bleiben, für die Themenregel, die Warnung und bis Stufe C für den Rückfall (E5, E13).

### E3 – Antwortschema: `category` ist für das Modell immer Pflicht

- `lib/extract.ts`: `ExtractResponse = z.strictObject({ events: z.array(RawEvent.omit({ providerId: true, via: true }).extend({ category: CategoryField })) })`. Das JSON-Schema für `--json-schema` führt `category` damit unter `required`, mit dem Enum der 12 Werte.
- `checkExtraction` prüft zusätzlich jedes Event der Antwort: Fehlt `category`, ist das ein Fehler (`events.N („Titel“).category fehlt`). Die Antwort ist dann ungültig wie heute bei anderen Fehlern, mit Wiederholung bzw. Fallback-Modell. So hängt die Pflicht nicht davon ab, ob die CLI das Schema streng durchsetzt. Ab Stufe C prüft das `RawEvent` selbst, die Zusatzprüfung entfällt.
- **Das Antwortschema ändert sich nur in Stufe A.** Es ist Teil des Cache-Schlüssels (`EXTRACT_KEY_PARTS.schema` = `JSON.stringify(extractResponseSchema())`, `io/extract.ts`). Eine Änderung in B oder C extrahierte alles noch einmal neu. Ein Test hält deshalb ab A2 den SHA-256 dieses Strings fest (die ersten 12 Zeichen, Wert aus A2 im Test eingetragen). B1 und C1 dürfen ihn nicht ändern.
  - In B ändert sich `OfferFields`, nicht `RawEvent` (E1).
  - In C wird `RawEvent.category` Pflicht. `ExtractResponse` hat sie schon ab A als Pflicht an derselben Stelle, das JSON-Schema bleibt also gleich.
  - Ändert sich der Hash in C doch, ist das ein Fehler in C und kein Anlass, den Test anzupassen.
- Das Entdecken (`pipeline discover`, Ertragsbeweis) nutzt dieselbe Extraktion. Neue Anbieter haben also von Anfang an `category`, ohne eigenen Code.

### E4 – `validateRaw`

- Neu nur die Warnung aus E2. Fehlendes `category` ist in `validateRaw` kein Fehler (alte `data/raw`-Zustände, E1); in der Antwort des Modells fängt es `checkExtraction` ab (E3).

### E5 – Build: Rückfall für fehlendes `category`, mit Zähler

`buildOffers` (`lib/build-offers.ts`) setzt `category` in jedem Angebot, das es schreibt:

- `fromRaw`: `category: e.category ?? fallbackCategory(e.topics)`.
- Schritt 7 (Übernahme aus dem Altbestand): `{ ...old, category: old.category ?? fallbackCategory(old.topics), sessions }`. Ohne diese Zeile schriebe die erste Nacht nach Stufe A Altbestand ohne `category`, und Stufe B fände ihn rot. Ab Stufe B ist `old.category` laut Typ Pflicht, der Ausdruck bleibt aber bis Stufe C als Laufzeit-Netz stehen (Altbestand aus einer Datei, die vor A6 geschrieben wurde). An beiden Stellen (`fromRaw` und Schritt 7) steht deshalb ein Kommentar: `// Übergang Plan 0037 (E5): Rückfall für Stände ohne category; entfällt in Stufe C`.
- `fallbackCategory(topics)` ist neu in `src/domain/topics.ts`: die erste Kategorie in fester Reihenfolge, `categoriesOf(topics)[0] ?? "treffs-cafes"`. Das ist genau das heutige Etikett ohne Filter (`leadCategory(topics, [])`). Für Nutzer ändert sich bei den so gefüllten Angeboten also nichts.
- **Zähler:** `BuildReport.derivedCategories: number`, die Zahl der Angebote mit Rückfall (beide Wege). Dazu ein Hinweis je Anbieter in `notes`: `<providerId>: N Angebote ohne category – aus den Themen abgeleitet (Übergang Plan 0037)`.
  - `NightlyReport.build.derivedCategories` (optional, `z.number()`), geschrieben von `io/nightly.ts`.
  - `nightlyCommitMessage` und der Bericht (`renderStatus`) bekommen die Zeile `Kategorie aus Themen abgeleitet: N Angebote (Übergang Plan 0037)`, nur wenn N > 0.
  - Kein Einfluss auf die Ampel.
- Stufe C entfernt Rückfall, Zähler und `fallbackCategory`, sobald der Zähler 0 ist (E7).

### E6 – Dubletten: Die Kategorie des ranghöheren Angebots gewinnt

- Schritt 3 (gleicher Fensterschlüssel): `category` von `best`, also der ranghöheren Quelle (Anbieterseite vor Sammelkalendern, `RANK`), bei gleichem Rang des früheren Events. Die Themen werden weiter vereinigt (`unionTopics`). Dasselbe gilt für Schritt 4 (`high` behält seine `category`).
- Begründung: Alle anderen Felder kommen dort schon von `best` bzw. `high`. Eine Mehrheits- oder Reihenfolgeregel über `category` bräuchte eigenen Code und ist bei zwei Quellen nicht besser.
- Code: Es reicht, `category` **nicht** anzufassen. `{ ...offer, topics: unionTopics(…) }` lässt `offer.category` stehen. Ein Test hält die Regel fest.

### E7 – Neu-Extraktion: Kosten, Dauer, Ablauf

**Schätzung** (Grundlage: erster voller Lauf S3.2 in Plan 0032 mit 74 Anbietern, 115 Aufrufen, 2,40 Mio. Tokens ein und 0,64 Mio. aus, $0,57, 18 Min.; Nachtlauf 2026-10-11 mit 126 Aufrufen und 3,49 Mio. Tokens; heute 82 Anbieter in `data/raw/`):

- etwa 125–135 Aufrufe, 3,4–3,6 Mio. Tokens, $0,60–0,70 (Schätzung der CLI, API-Gegenwert; läuft über das Abo-Token), 20–25 Min. Laufzeit.
- Der längere Prompt (rund 600 Tokens mehr je Aufruf) und `category` in der Ausgabe (rund 5 Tokens je Event) fallen daneben nicht ins Gewicht.
- **Bremsen:** `NIGHT_BRAKES` hat 3 Mio. Tokens und 150 Aufrufe. Die Token-Bremse reißt also, und 5–10 Anbieter blieben bis zur nächsten Nacht offen. Das Zeitbudget von 50 Min. reicht.
- **Vorgehen wie beim Modellwechsel** (Skill, Abschnitt 5): einmal `gh workflow run nightly.yml -f modus=live -f max_tokens=5000000 -f max_calls=200`, am Tag des Deploys von Stufe A, nach grüner CI. So geht alles in einer Nacht durch. Ein regulärer Nachtlauf ohne höhere Bremse wäre auch richtig, bräuchte aber zwei Nächte.
- Danach den Zähler `derivedCategories` im Bericht prüfen (E5). Erwartet sind nur Anbieter, die nicht neu extrahiert wurden: Fehler, zurückgehaltener Einbruch, Bremse.
- **Entdecken:** keine eigene Neu-Extraktion. Bestehende Kandidaten im Zustand des Entdeckens tragen keine Events. Neue Anbieter kommen mit `category` (E3).
- **Für Nutzer** ändern sich wie beim Modellwechsel (Plan 0032, N3) Formulierungen in Titeln und Zusammenfassungen. IDs, Links und Merklisten bleiben (ADR 0022). Der Einbruchschutz hält die Zahl der Angebote.

**Stufe C** (eigener Commit, Teil dieses Plans). Voraussetzungen, alle drei:

1. Zwei Nachtläufe hintereinander melden `derivedCategories` = 0.
2. **`data/raw/*.json` enthält kein Event ohne `category`**, weder in `events` noch in `pending.events`. `derivedCategories` reicht dafür nicht: Es zählt nur Angebote. Roh-Events ohne Angebot (vorbei, außerhalb des Horizonts, im Build „entfällt“, zurückgehaltene `pending.events`) blieben sonst unbemerkt ohne `category`, und mit der Pflicht aus C würde `providerRawIssues` (`lib/raw.ts`, `pnpm data:validate`) rot. Prüfung auf aktuellem `origin/main`, Ergebnis muss `0` sein:

   ```sh
   node -e 'const fs=require("fs");let n=0;for(const f of fs.readdirSync("data/raw").filter((f)=>f.endsWith(".json"))){const r=JSON.parse(fs.readFileSync("data/raw/"+f,"utf8"));for(const e of [...r.events,...(r.pending?.events??[])])if(!e.category)n++}console.log(n)'
   ```
3. Stufe B ist mindestens 7 Tage live.

Dann:

- `RawEvent.category` wird Pflicht. Die Zusatzprüfung in `checkExtraction` (E3), der Rückfall und der Zähler (E5), `fallbackCategory` und das Kompatibilitätsnetz (E13) entfallen.
- Das ist eine weitere Schemaänderung, also kein Kleinänderungs-Weg (Sperrliste in `scripts/change-size.ts`). Sie ist aber hier geplant und braucht keinen neuen Plan, nur ein kurzes `/arch-review`.
- Bleibt der Zähler oder die Prüfung von `data/raw` 14 Tage nach Stufe A über 0, weil ein Anbieter dauerhaft scheitert, entscheidet der Nutzer: Katalogpflege (Anbieter reparieren oder entfernen, Skill) oder Stufe C vertagen. Das wird ein Restpunkt in `docs/ideas.md`.

### E8 – Prompt: Regel für die Hauptkategorie

In `scripts/pipeline/prompt/extract.md`:

- Im Beispiel kommt `"category": "babykurse",` vor `"topics": ["pekip"],`.
- Nach der Regel zu `topics` (Z. 56) folgt dieser Abschnitt, wörtlich:

```markdown
- `category` ist die **eine** Kategorie, unter der Eltern das Angebot suchen würden. Sie richtet sich nach dem, was Eltern und Kind dort hauptsächlich tun, nicht nach dem Ort und nicht nach dem Anbieter. Meist passt sie zu einem der `topics`.

  | `category` | gemeint |
  |---|---|
  | `babykurse` | Kurse mit festem Babykonzept: PEKiP, FenKid, Babymassage, Babyzeichen, Sinneskurse für Babys |
  | `krabbel-spielgruppen` | Krabbel-, Spiel- und Eltern-Kind-Gruppen, Miniclubs |
  | `treffs-cafes` | Eltern- und Stillcafés, offene Treffs, Elternfrühstück, Krabbelgottesdienste |
  | `bewegung` | Eltern-Kind-Turnen, Pikler-Bewegungskurse, Bewegungslandschaften, Tanz, Yoga, Fitness und Rückbildung mit Baby, Indoor-Spielplatz |
  | `wasser` | Babyschwimmen, Kleinkindschwimmen |
  | `musik` | selbst singen und musizieren: Musikgarten, Musikzwerge, Singkreise |
  | `kreativ` | Malen, Basteln, Matschen, Kreativkurse |
  | `buecher` | Vorlesen, Bilderbuchkino, Bücherzwerge, Reime und Fingerspiele in der Bibliothek |
  | `museum` | Führungen, Workshops und Ausstellungen im Museum |
  | `buehne` | zuschauen: Theater, Puppentheater, Konzert, Kino |
  | `natur` | Wald- und Naturgruppen, Tiere, Bauernhof |
  | `beratung` | Beratung, Hebammensprechstunde, Erste Hilfe, Beikost |

  Passen mehrere, entscheidet:
  - Ein Babykurs (PEKiP, FenKid, Babymassage) bleibt `babykurse`, auch wenn gesungen oder bewegt wird.
  - Eine Krabbel- oder Eltern-Kind-Gruppe bleibt `krabbel-spielgruppen`, auch mit Singen, Basteln oder Turnen. Nur wenn das ganze Programm Musik ist (Musikgarten, „Musikzwerge“), ist es `musik`. Ist es ganz Turnen oder Bewegungslandschaft, ist es `bewegung`. Findet die Gruppe ganz im Wald statt, ist es `natur`.
  - Heißt das Angebot Café, Treff oder Frühstück und spielen die Kinder nebenher, ist es `treffs-cafes`. Heißt es Krabbelgruppe oder Krabbeltreff, ist es `krabbel-spielgruppen`.
  - Schauen Eltern und Kind zu (Konzert, Theater, Puppenspiel, Babykonzert), ist es `buehne`, auch wenn die Musik im Mittelpunkt steht. Singen und musizieren sie selbst, ist es `musik`.
  - Tanz mit Kleinkindern ist `bewegung`. Ein Musikkurs mit Bewegungsspielen bleibt `musik`.
  - Wird vorgelesen oder werden Bilderbuchbilder gezeigt (Bilderbuchkino, Kamishibai, Lesestunde), ist es `buecher`. Ein Theaterstück nach einem Bilderbuch ist `buehne`.
  - Ein Angebot im Museum ist `museum`, wenn es um Ausstellung oder Führung geht. Ein Elterncafé, das nur in den Räumen des Museums stattfindet, ist `treffs-cafes`.
  - Ein Krabbelgottesdienst ist `treffs-cafes`, auch mit Singen.
  - Rückbildung, Yoga oder Fitness mit Baby ist `bewegung`. Eine Sprechstunde oder ein Vortrag mit Kind ist `beratung`, ein Stillcafé `treffs-cafes`.
```

- Begründung der Konfliktregeln: Sie folgen der Frage „Was tun Eltern und Kind dort?“ und decken die häufigen Paare aus der Ausgangslage ab. Krabbelgottesdienst bleibt bei `treffs-cafes` (Plan 0003, E10: keine Kategorie „Glaube“, so auch `TOPIC_CATEGORIES`). Tanz geht nach `bewegung`, weil Eltern Kindertanz unter Bewegung suchen; ein Musikkurs mit Bewegung bleibt Musik, weil sein Name es sagt.
- Die Tabelle im Prompt wiederholt die Labels aus `CATEGORY_LABELS` nicht wörtlich. Die Werte sind nur IDs, und die Beispiele helfen dem Modell mehr.

### E9 – Filter: eine reine Domänenfunktion, überall gleich

- `matchesFilter` (`src/domain/filter.ts`): `if (state.categories.length > 0 && !state.categories.includes(offer.category)) return false;`. Der Import von `categoriesOf` entfällt.
- Weil alle Filterwege mit Kategorie durch `matchesFilter` laufen (Ausgangslage), gilt die neue Bedeutung ohne weiteren Code in Liste, Anbieter-Tab, Such-Abos, Wochen-Push und Service Worker (`push-tailor.ts` → `newsFor`). Die Merkliste hat keinen Kategoriefilter und ändert sich nicht.
- **Bestehende Such-Abos und Links mit `kat=`** bleiben gültig, die Werte sind dieselben. Nur die Treffer ändern sich: Ein Abo „Musik & Singen“ meldet kein Babykonzert mehr (das ist `buehne`). Ein Hinweis an Nutzer entfällt (Nicht-Ziel). Begründung: Die App ist für Freunde und Familie, die Änderung ist gewollt und macht Treffer und Etikett gleich. Ein einmaliger Hinweis bräuchte Zustand auf dem Gerät für einen Fall, den niemand bemerken muss.
- Ein alter Service Worker (bis zum Update) filtert noch nach Themen. Das ergibt höchstens eine Woche lang einen Push nach alter Bedeutung und keinen Fehler.

### E10 – Evals

- `EvalOffer` (`lib/eval-score.ts`) bekommt `category: CategoryField` (Pflicht). `toEvalOffers` übernimmt `o.category`. Bis Stufe C gilt `o.category ?? fallbackCategory(o.topics)`, damit `pnpm eval freeze` auch auf einem Bestand ohne `category` läuft.
- `FIELDS` bekommt `"category"` mit exaktem Vergleich `a.category === b.category`. Die Spalte `category` steht in `RESULTS_HEADER` direkt nach `topics`. In `evals/results.md` bekommt jede bestehende Zeile in dieser Spalte `–`, damit die Tabelle zusammenpasst. Das ist eine einmalige Änderung im selben Commit.
- **Widerspruchszähler** (für die Schwelle unten messbar, denn `io/eval.ts` wertet die Warnungen aus `validateRaw` nicht aus): `eval-score.ts` zählt je Lauf die vorhergesagten Angebote mit `category ∉ categoriesOf(topics)` (`Summary.categoryConflicts`, dazu `predicted` als Bezug). In `evals/results.md` steht er als Spalte `Kat. ohne Thema` (Anteil in %) direkt nach `category`. Bestehende Zeilen bekommen auch hier `–`.
- **Soll-Werte:** Alle 54 Soll-Angebote in `evals/cases/*/expected.json` bekommen `category` nach den Regeln aus E8. Wer umsetzt, setzt sie anhand von `input.json` von Hand. Zweifelsfälle stehen in der `NOTES.md` des Falls, je Zeile mit Titel, Wahl und Grund. Beispiele aus den Fällen:
  - `ev-fischbach`: Krabbelgottesdienst → `treffs-cafes`, Eltern-Kind-Gruppen mit Singen → `krabbel-spielgruppen`
  - `musikfuechse`: alle `musik`
  - `hebamme-mainberger-praenatal`: Rückbildung → `bewegung`
  - `ev-st-andreas-thon` (`eltern-kind-gruppe` + `musik`): je nach Programm, nach E8
- **Abnahme vor dem Merge von Stufe A:** zwei Läufe `pnpm eval` mit Haiku (Standardmodell, mit Fallback wie im Nachtlauf), lokal über den Login, zusammen etwa $0,25 und 15–20 Min. Die Werte kommen in den Abschnitt „Umsetzung“. Bestanden ist Stufe A, wenn diese drei Punkte gelten:
  - `category` liegt in beiden Läufen bei mindestens 85 %.
  - Termine R, Angebote R und `format` liegen nicht mehr als 5 Prozentpunkte unter den letzten Haiku-Zeilen vom 2026-10-11 (Termine R 91–97 %, Angebote R 93–94 %, `format` 92–94 %).
  - `Kat. ohne Thema` liegt in beiden Läufen bei höchstens 5 %.
  
  Liegt `category` darunter, wird der Prompt geschärft (E8) und erneut gemessen, höchstens zweimal. Danach entscheidet der Nutzer.

### E11 – Anzeige: Etikett nur aus `category` (Rückbau Plan 0014)

- `leadCategory` entfällt (`src/domain/topics.ts`, `topics.test.ts`).
- `CardContext.categoryOf` entfällt. `OfferCard` nutzt `offer.category`. `WeekStrip` und `MonthGrid` (`SavedCalendar.tsx`) verlieren die Prop `categoryOf` und nutzen `o.offer.category`. `DetailContent` (`DetailDialog.tsx`) verliert die Prop `category` und nutzt `offer.category`. `Overlays.tsx` reicht nichts mehr durch. `App.tsx` importiert `leadCategory` nicht mehr.
  - Begründung: Mit einer gespeicherten Kategorie gibt es nichts mehr zu wählen. Ein Weg über `ctx` wäre nur noch eine Umleitung.
- **Karte** `mainCategory` (`src/ui/map/geojson.ts`): Gezählt wird nur `offer.category` je Angebot. Es gewinnt die häufigste Hauptkategorie, bei Gleichstand die frühere in `CATEGORIES` (wie heute). `MapOffer` und `map-types.ts` (`Place<Pick<SiteOffer, "category">>`) statt `topics`. Der Rückfall `"treffs-cafes"` bleibt nur für eine leere Liste.
- **Anbieter** `providerCategories` (`src/domain/directory.ts`): Vereinigung der Hauptkategorien der übergebenen Angebote **dieses Anbieters** (der Filter auf `providerId` bleibt), kanonisch sortiert: `CATEGORIES.filter((c) => offers.some((o) => o.providerId === providerId && o.category === c))`. ADR 0024, Punkt 3 bleibt („nur aus kommenden Angeboten“). Abnehmer `ProviderSheet` und `share-pages.ts` ändern sich nicht.
- **Kachelbild und Vorschau** (`scripts/lib/share-pages.ts`): `category: offer.category`. `imageVersion` hasht weiter die Kategorie. Wo sich die Hauptkategorie gegenüber `leadCategory(topics, [])` ändert, ändert sich `?v=`, und Messenger holen das Bild neu. Das ist gewollt, sonst zeigte die Vorschau das alte Etikett. Gerendert werden die Bilder ohnehin bei jedem Build (`scripts/og-images.ts`), es entstehen also keine Zusatzkosten.

### E12 – Doku

- ADR 0030 (neu) mit Hinweisen in ADR 0003, 0012 und 0024 (mit diesem Plan angelegt). **In Stufe A (A5)** wird ADR 0030 „angenommen“, und die Hinweise in ADR 0003, 0012 und 0024 verlieren den Zusatz „Entwurf“. Ab A wird `category` gespeichert, die Entscheidung gilt also ab dann.
- `docs/architecture.md`, Invarianten, „Ein Datenvertrag“ (**in Stufe A, A5**): „Abgeleitete Werte wie Kategorien werden berechnet, nie gespeichert“ wird zu „Abgeleitete Werte werden berechnet, nie gespeichert. Ausnahme ist die Hauptkategorie `category`: Die Extraktion wählt sie, gespeichert wird sie in `data/raw/` und `data/offers.json` (ADR 0030).“
- `docs/architecture.md`, App-Look der Karte und Filter (**in Stufe B, B6**): „Marker zeigen die häufigste Hauptkategorie des Ortes“; der Kategoriefilter wirkt nur auf `category`.
- `docs/plans/archiv/0014-kategorie-etikett-folgt-filter.md`: ein Satz unter der Statuszeile: „Zurückgebaut durch Plan 0037 (eine Kategorie je Angebot, ADR 0030).“ Die Statuszeile selbst bleibt (`check-docs`).
- `docs/ideas.md`:
  - Zeile „Mehrere Kategorie-Etiketten je Kachel“ entfällt (gegenstandslos).
  - Restpunkt „Plan 0024 (Offene Fragen): Soll ein gewählter Kategoriefilter die Marker-Kategorie bestimmen …“ entfällt (gegenstandslos, das Etikett folgt keinem Filter mehr).
  - Neu: „**Themen ohne Abnehmer** (Plan 0037): Die Oberfläche liest `topics` nicht mehr. Entweder Merkmale (Väter, mehrsprachig) als Fakten zeigen oder `topics` aus Schema und Prompt streichen (spart Ausgabe-Tokens).“
- Skill `babyevents-nuernberg`, Abschnitt 5: Satz „Ein neuer Prompt …“ ergänzt um „Ändert der Prompt die Antwort für alle Anbieter (etwa ein neues Feld), gilt wie beim Modellwechsel: einmal mit `max_tokens=5000000`.“ Abschnitt Bericht: Die Zeile „Kategorie aus Themen abgeleitet“ ist ein Übergang aus Plan 0037 (E5).

### E13 – Kompatibilität alter und neuer Stände im Browser

- **Alter Code, neue Daten** (Tab seit dem Deploy offen, alter Service Worker): `site.json` hat zusätzlich `category`. Alter Code ignoriert es und rechnet mit `topics` wie bisher. Kein Fehler, deshalb bleiben `topics` (E2).
- **Neuer Code, alte Daten** (nur Stufe B): Ein `site.json` ohne `category` kann nur aus dem Datencache des Service Workers kommen (`zp-data`, „Netz zuerst, nach 5 s die Kopie“, `src/sw/routes.ts`), und nur mit einem Stand vor dem ersten Nachtlauf nach Stufe A. Ohne Netz bräche `Shape` an `CATEGORY_UI[undefined]`, die Seite bliebe leer.
  - Abhilfe an **einer** Stelle in `src/ui`: `App.tsx` übernimmt das Ergebnis von `loadSiteData` (heute an zwei Aufrufen, Z. 122 und 157) künftig über eine lokale Funktion `adoptSite(data)`, die `data.offers` mit `withCategory` abbildet.
  - **Typen:** `withCategory` ist eine reine Funktion in `src/domain/topics.ts`:
    ```ts
    export function withCategory<T extends { category: Category; topics: readonly Topic[] }>(
      offer: Omit<T, "category"> & { category?: Category },
    ): T
    ```
    Sie liefert `{ ...offer, category: offer.category ?? fallbackCategory(offer.topics) }`. `adoptSite` nimmt `site.json` ausdrücklich im lockeren Format: `type LooseSiteData = Omit<SiteData, "offers"> & { offers: Array<Omit<SiteOffer, "category"> & { category?: Category }> }`. Daraus gibt sie `SiteData` zurück. `SiteData` ist ohne Cast an `LooseSiteData` zuweisbar. So steht der Rückfall im Typ und nicht hinter einem `as`.
  - Kommentar an `adoptSite` und `withCategory`: `// Übergang Plan 0037 (E13): site.json aus einem Cache vor Stufe A hat kein category; Rückfall bleibt bis Stufe C`.
  - Alles, was danach Angebote liest, sieht damit `category`: Liste, Filter, Detail, Kalender, Karte und Anbieter-Sheet.
  - **Nicht in `src/data/site.ts`:** `src/data` darf aus `src/domain` zur Laufzeit nur `geo.ts` importieren (`.dependency-cruiser.cjs`, `data-domain-runtime-allowlist`, ADR 0010).
  - Der Service Worker (`push-tailor.ts`) braucht das nicht: Ohne `category` passt ein Kategorie-Abo dort nur nicht, ein Fehler entsteht nicht.
  - Das Netz (`adoptSite`, `withCategory`) entfällt in Stufe C.

### E14 – Fixtures

`tests/fixtures/offers.json` bekommt in Stufe B `category` (fiktive Daten, von Hand gepflegt, keine Pipeline):

| Angebot | `topics` | `category` | Etikett bisher ohne Filter |
|---|---|---|---|
| Babymassage – Schnupper-Workshop | babymassage | `babykurse` | gleich |
| Elterncafé am Montag | elterncafe | `treffs-cafes` | gleich |
| Offener Krabbeltreff | krabbelgruppe, elterncafe | `krabbel-spielgruppen` | gleich |
| PEKiP-Gruppe Herbst | pekip | `babykurse` | gleich |
| Eltern-Kind-Bewegungslandschaftsnachmittag … | eltern-kind-turnen, bewegung, eltern-kind-gruppe | `bewegung` | war Krabbel- & Spielgruppen |
| Musikgarten 1 (1–2 Jahre) | musik, singen | `musik` | gleich |
| Krabbelreime & Fingerspiele | vorlesen, singen | `buecher` | war Musik & Singen |
| „Kuckuck im Nest“ – Theater ab 18 Monaten | theater | `buehne` | gleich |
| Babykonzert im Advent | konzert, musik | `buehne` | war Musik & Singen |

Damit decken die Fixtures beide Arten ab: Angebote, deren Etikett gleich bleibt, und drei, deren Etikett sich ändert und die aus einem Nebenfilter fallen.

## Dateien

**Stufe A (Datenmodell, Pipeline, Evals; Oberfläche unverändert)**

| Datei | Änderung |
|---|---|
| `src/domain/topics.ts` | `fallbackCategory`; Kopfkommentar: „Kategorien eines Angebots stehen seit ADR 0030 in `category`; `TOPIC_CATEGORIES` dient Themenregel, Warnung und Rückfall“ |
| `src/domain/schema.ts` | `CategoryField`, `OfferFields.category` optional (E1) |
| `scripts/pipeline/lib/raw.ts` | `RawEvent.category` optional; Warnung in `validateRaw` (E2) |
| `scripts/pipeline/lib/extract.ts` | `ExtractResponse` mit Pflicht-`category`; Zusatzprüfung in `checkExtraction` (E3) |
| `scripts/pipeline/lib/build-offers.ts` | `category` in `fromRaw` und Schritt 7, Zähler `derivedCategories`, Hinweise (E5, E6) |
| `scripts/pipeline/lib/report.ts`, `scripts/pipeline/io/nightly.ts` | `build.derivedCategories`, Zeile im Commit-Text und Bericht (E5) |
| `scripts/pipeline/prompt/extract.md` | Beispiel und Regel (E8) |
| `scripts/pipeline/lib/eval-score.ts`, `evals/cases/*/expected.json`, `evals/cases/*/NOTES.md`, `evals/results.md` | E10 |
| `schema/*.json` | `pnpm schema:export` |
| Pipeline-Tests mit Antworten des Modells | `category` in den Event-Fixtures, die durch `checkExtraction` laufen: `lib/extract.test.ts`, `io/extract.test.ts`, `io/refresh.test.ts`, `io/discover.test.ts`, `lib/discover.test.ts` (sonst „category fehlt“) |
| `.claude/skills/babyevents-nuernberg/SKILL.md` | E12 |

**Stufe B (Pflichtfeld, Filter, Anzeige)**

| Datei | Änderung |
|---|---|
| `src/domain/schema.ts` | `OfferFields.category` Pflicht |
| `src/domain/topics.ts` | `leadCategory` entfällt; `withCategory` (E13) |
| `src/domain/filter.ts` | E9 |
| `src/domain/directory.ts` | `providerCategories` (E11) |
| `src/ui/map/geojson.ts`, `src/ui/map-types.ts` | `mainCategory` (E11) |
| `src/ui/App.tsx`, `OfferCard.tsx`, `Overlays.tsx`, `DetailDialog.tsx`, `SavedCalendar.tsx` | Rückbau `categoryOf` (E11); in `App.tsx` dazu `adoptSite` (E13) |
| `scripts/lib/share-pages.ts` | `offer.category` (E11) |
| `tests/fixtures/offers.json` | E14 |
| Unit-Tests mit Angeboten von Hand (Typfehler sonst) | `src/ui/format.test.ts`, `src/ui/use-offer-views.test.ts`, `src/domain/dataset.test.ts`, `scripts/pipeline/lib/stable-ids.test.ts`, `scripts/pipeline/lib/build-offers.test.ts`, `scripts/pipeline/io/eval.test.ts`, `scripts/pipeline/io/nightly.test.ts` (Liste per `pnpm typecheck` vervollständigen) |
| E2E | `e2e/app.spec.ts`, `e2e/push.spec.ts`, `e2e/anbieter-inhalt.spec.ts` (Tests B) |
| Doku | E12: `docs/architecture.md`, Plan 0014 (Hinweis), `docs/ideas.md` |

**Stufe C (Übergang abbauen)**: `scripts/pipeline/lib/raw.ts`, `lib/extract.ts`, `lib/build-offers.ts`, `lib/report.ts`, `io/nightly.ts`, `lib/eval-score.ts`, `src/domain/topics.ts`, `src/ui/App.tsx` (`adoptSite`), `schema/*.json`, Tests dazu, `docs/ideas.md` (Restpunkt streichen), ADR 0030 (Nachtrag „Übergang abgeschlossen“).

Keine neue Abhängigkeit, kein neues Modul, keine neue Spec.

## Tests (test-first, je zuerst rot)

**Stufe A**

1. `src/domain/topics.test.ts`: `fallbackCategory(["konzert", "musik"])` → `musik`; `["mehrsprachig", "kreativ"]` → `kreativ`; nur Merkmale → `treffs-cafes`.
2. `src/domain/dataset.test.ts` (Schema): `Offer` mit `category: "buehne"` gültig, ohne `category` gültig (Stufe A), mit `category: "glaube"` ungültig.
3. `scripts/pipeline/lib/raw.test.ts`:
   - Ein Event ohne `category` ist gültig.
   - `category: "musik"` mit `topics: ["krabbelgruppe", "elterncafe"]` ergibt genau eine Warnung mit „passt zu keinem Thema“ und keinen Fehler.
   - `category: "krabbel-spielgruppen"` mit denselben Themen ergibt keine Warnung.
4. `scripts/pipeline/lib/extract.test.ts`:
   - `extractResponseSchema()` führt `category` unter `required` der Events, mit Enum der 12 Werte.
   - `checkExtraction` mit einem Event ohne `category` → `ok: false`, Fehler „category fehlt“.
   - Mit `category` → `ok: true`, `category` bleibt erhalten.
   - **Schema-Hash** (E3): `sha256(EXTRACT_KEY_PARTS.schema).slice(0, 12)` gleich dem in A2 eingetragenen Wert. Er ist nicht zuerst rot, sondern hält den Stand ab A2 fest. Meldung bei Abweichung (als Nachricht im `expect`): „Antwortschema geändert → volle Neu-Extraktion (Plan 0037, E3); nur mit höherer Bremse und bewusst anpassen.“
   - **Kategorietabelle im Prompt** (`scripts/pipeline/io/extract.test.ts`, liest `EXTRACT_KEY_PARTS.prompt`): Die erste Spalte der Tabelle unter `category` nennt genau die 12 IDs aus `CATEGORIES`, jede einmal. Zuerst rot, weil die Tabelle fehlt.
5. `scripts/pipeline/lib/build-offers.test.ts`:
   - a) `category` aus dem Rohevent landet im Angebot, auch bei `einmalig` mit mehreren Terminen in jedem zerlegten Angebot.
   - b) Ohne `category`: `fallbackCategory(topics)`, `report.derivedCategories` = 1, ein Hinweis mit „aus den Themen abgeleitet“.
   - c) Dublette gleicher Schlüssel: Anbieterseite (`category: "buehne"`) und Sammelkalender (`category: "musik"`) → `buehne`, Themen vereinigt. Gleicher Rang → `category` des früheren Events.
   - d) Schritt 4 (Dublette über Titel): `high` behält seine `category`.
   - e) Übernahme aus dem Altbestand (`previous` ohne `category`, Anbieter mit Fehler): Angebot hat `fallbackCategory`, Zähler zählt mit.
   - f) Die geschriebene Datei besteht `OffersFile`.
6. `scripts/pipeline/lib/report.test.ts`:
   - `nightlyCommitMessage` mit `build.derivedCategories: 3` enthält „Kategorie aus Themen abgeleitet: 3 Angebote“, mit 0 oder ohne Feld nicht. `NightlyReport` liest einen alten Bericht ohne das Feld.
   - Widerspruchszähler (E2): zwei extrahierte Anbieter mit zusammen 20 Events in `raws` und einer Warnung mit `CATEGORY_CONFLICT` → „Kategorie passt zu keinem Thema: 1 von 20 neuen Events (5 %)“. Ohne solche Warnung keine Zeile. Warnungen eines nicht übernommenen Anbieters zählen nicht in M.
7. `scripts/pipeline/io/nightly.test.ts`: Der Lauf schreibt `build.derivedCategories` nach `nightly.json`.
8. `scripts/pipeline/lib/eval-score.test.ts`:
   - Feldtreffer `category` exakt (`musik` gegen `buehne` = 0 von 1).
   - `toEvalOffers` übernimmt `category` und füllt sie ohne Feld per Rückfall.
   - `RESULTS_HEADER` und `resultsRow` haben gleich viele Spalten.
   - Widerspruchszähler: zwei vorhergesagte Angebote, eines mit `category: "musik"` und `topics: ["krabbelgruppe"]`, eines passend → `categoryConflicts` = 1, Spalte `Kat. ohne Thema` = „50 %“; ohne vorhergesagte Angebote „–“.
9. Gates: `pnpm verify` grün (Schema-Drift nach `pnpm schema:export`, `pnpm data:validate` mit Bestand ohne `category`, knip). E2E: `pnpm e2e:local --affected` (mit `run_in_background`); die Auswahl nennt `topics.ts`/`schema.ts`-Specs, die Oberfläche ist unverändert.

**Stufe B**

10. `src/domain/dataset.test.ts`: `Offer` ohne `category` ungültig; die Fixtures (`tests/fixtures/offers.json`) bestehen. Der **Schema-Hash-Test** (Test 4) bleibt unverändert grün: `RawEvent` und das Antwortschema ändern sich in B nicht.
11. `src/domain/filter.test.ts` (Fixtures nach E14):
    - `categories: ["musik"]` → nur `musikgarten-1` (nicht `babykonzert-advent`, nicht `krabbelreime`).
    - `categories: ["buecher", "buehne"]` → `krabbelreime`, `kuckuck-im-nest`, `babykonzert-advent` (unverändert).
    - `categories: ["krabbel-spielgruppen"]` → nur `krabbeltreff` (nicht mehr die Bewegungslandschaft).
    - `matchesFilter` gleich.
12. `src/domain/news.test.ts`: Ein Abo `kat=musik` trifft das Babykonzert nicht mehr. (`saved.test.ts` bekommt keinen Fall: Die Merkliste hat keinen Kategoriefilter.)
13. `src/domain/directory.test.ts`: `providerCategories` mit `providerOffers(…, FIXTURE_NOW)`:
    - Theater → `["buehne"]` (bisher Musik und Bühne).
    - Familientreff → `["babykurse", "krabbel-spielgruppen"]`: Babymassage und PEKiP ergeben eine Kategorie, kanonisch sortiert. Das Elterncafé (`treffs-cafes`) endet am 5.10. um 10:00, die Fixture-Uhr steht auf 12:00, es zählt also nicht.
    - Turnverein ohne Angebote → `[]`.
    - Angebote anderer Anbieter in der Liste zählen nicht (`upcoming` aller Anbieter, wie der bestehende Test).
14. `src/ui/map/geojson.test.ts`, `mainCategory` neu auf `category`:
    - häufigste gewinnt;
    - Gleichstand → frühere in `CATEGORIES`, unabhängig von der Reihenfolge;
    - leere Liste → `treffs-cafes`;
    - ein Angebot zählt genau einmal (der Fall „ein Thema mit zwei Kategorien zählt für beide“ entfällt).
15. `scripts/lib/share-pages.test.ts`: `offerPreview(Babykonzert).category` = `buehne`; `imageVersion` hängt an `category` (zwei Angebote, die sich nur in `category` unterscheiden, haben verschiedene Versionen).
16. `src/domain/topics.test.ts`: `leadCategory`-Tests entfallen. `withCategory`: behält eine vorhandene `category`, füllt eine fehlende per Rückfall, ändert sonst nichts.
17. E2E statt Unit-Test für `adoptSite` (die Funktion ist lokal in `App.tsx`): in `e2e/app.spec.ts` ein Fall „site.json ohne category (alter Cache)“. `page.route` liefert die Fixture-`site.json` mit gelöschtem `category` bei allen Angeboten. Dann zeigt „Babykonzert im Advent“ „Musik & Singen“ (Rückfall), `?kat=musik` zeigt es, und die Konsole hat keinen Fehler.
18. `src/sw/push-tailor.test.ts`: Erwartungen der Abo-Fälle mit `kat=musik` an die Fixtures anpassen (Krabbelreime ist `buecher`).
19. **E2E** (Fixtures, alle Geräte der jeweiligen Spec):
    - `e2e/app.spec.ts`: Der Block „Kategorie-Etikett folgt dem Filter (Plan 0014)“ wird zu „Eine Kategorie je Angebot (Plan 0037)“:
      - a) Ohne Filter trägt „Babykonzert im Advent“ „Bühne & Konzert“, im Detail `.catname` ebenso.
      - b) `./?kat=musik`: „Babykonzert im Advent“ und „Krabbelreime & Fingerspiele“ fehlen. Jede sichtbare `.pill` lautet „Musik & Singen“.
      - c) `./?kat=buecher`: „Krabbelreime & Fingerspiele“ trägt „Bücher & Vorlesen“, danach `expectMobileUx` hell und dunkel (wie bisher).
      - d1) `./?kat=treffs-cafes`: Keine Kachel, auch „Offener Krabbeltreff“ fehlt. Das einzige `treffs-cafes`-Angebot der Fixtures („Elterncafé am Montag“, 9:00–10:00) ist zur eingefrorenen Uhr (12:00) vorbei. Die Liste zeigt den bestehenden Leerzustand (`NoOffers`, `src/ui/ListView.tsx`) mit Titel „Diese Seite ist noch leer“, Text „Mit diesen Filtern gibt es keine Angebote.“ und Knopf „Filter zurücksetzen“, wie der bestehende Test zu `?kat=wasser`. „Für heute ist alles vorbei“ gibt es nur im Kalender der Merkliste.
      - d2) Pille „Treffs & Cafés“ unter den Gates (Plan 0014, Review, Finding 3): `page.route("**/data/site.json")` setzt beim kommenden „Offener Krabbeltreff“ `category: "treffs-cafes"`, Vorbild `saveCopies` in `e2e/layout.spec.ts:398`. Dann `./?kat=treffs-cafes`: Die Kachel trägt „Treffs & Cafés“, danach `expectMobileUx` hell und dunkel (Text- und Kontrast-Gate).
      - e) Kalender der Merkliste mit `kovtez0z`, einmal ohne und einmal mit `?kat=musik`: Der 6. Dezember enthält `span.k-buehne` und kein `span.k-musik`. Das belegt, dass der Filter das Etikett nicht ändert.
    - `e2e/push.spec.ts` (Zuschnitt im Service Worker, Z. 448 und 460): Abo `kat=musik,buecher&wegzeit=20` statt `kat=musik&wegzeit=20`. Die Erwartungen bleiben: Musikgarten fällt über die Wegzeit heraus, Krabbelreime bleibt.
    - `e2e/anbieter-inhalt.spec.ts:170`: `.provider-cats` des Theaters = „Bühne & Konzert“.
    - **Alle `kat=`-Stellen in `e2e/`** (`rg -n "kat=" e2e/`, Stand `84d39c7`), geprüft gegen die Fixtures aus E14:

      | Stelle | Was sie prüft | Folge |
      |---|---|---|
      | `app.spec.ts:76` | Sticker Musik zu `format=kurs`: genau „Musikgarten 1“ | bleibt (Musikgarten ist `musik`) |
      | `app.spec.ts:194` | `?kat=bewegung`: nur die Bewegungslandschaft, Leerzustand durch Alter | bleibt (`bewegung`) |
      | `app.spec.ts:265, 276/277, 290` | Plan-0014-Block | wird ersetzt (Test 19 a–e, d1/d2) |
      | `app.spec.ts:305/306` | alte URL `ansicht=kalender&kat=musik`: URL, Tab, Sticker | bleibt (keine Treffer geprüft) |
      | `app.spec.ts:331` | `?kat=wasser`: Leerzustand | bleibt |
      | `push.spec.ts:230, 246` | Abo `kat=musik&wegzeit=20` anlegen: Text und Speicher | bleibt |
      | `push.spec.ts:313, 315, 333, 343, 350` | Abos `kat=musik`, `kat=natur`: Spiegelung in den Speicher | bleibt (keine Treffer geprüft) |
      | `push.spec.ts:448, 460` | Zuschnitt mit Abo und Wegzeit | angepasst (s. o.) |
      | `push.spec.ts:477, 587` | langes Abo `kat=musik,natur,krabbel-spielgruppen&…`: Layout bei 320 px und 200 % | bleibt (nur Text) |
      | `teilen.spec.ts:86` | `kat=babykurse` mit PEKiP | bleibt (`babykurse`) |
      | `mobile-ux.spec.ts:261` | `?kat=bewegung` | bleibt |
      | `mobile-ux.spec.ts:440`, `anbieter.spec.ts:127`, `merkliste-anbieter.spec.ts:194, 299` | `kat=buecher` im Anbieter-Tab: nur die Stadtbibliothek | bleibt (Krabbelreime ist `buecher`) |
      | `anbieter-inhalt.spec.ts:113, 146, 188` | `kat=buecher`, Theater außerhalb der Auswahl | bleibt (Theater ist `buehne`) |

      B4 lässt `rg -n "kat=" e2e/` erneut laufen. Jede neue Stelle seit `84d39c7` kommt mit Ergebnis in diese Tabelle.
    - Unverändert, aber laufen lassen: `e2e/anbieter.spec.ts` (`?kat=buecher` → „1 Anbieter mit 1 Angebot“), `e2e/merkliste-anbieter.spec.ts`, `e2e/karte.spec.ts`, `e2e/mobile-ux.spec.ts` (`?kat=bewegung` trifft die Bewegungslandschaft weiter), `e2e/teilen.spec.ts`.
20. Gates: `pnpm verify`; `pnpm e2e:local --affected` und `pnpm e2e:local --affected --smoke` (Kachelbilder, `share-pages.ts`; mit `run_in_background`). Die Fixtures machen die Auswahl voll, lokal laufen die direkt getroffenen Specs plus `app` und `theme`. Zusätzlich ausdrücklich `pnpm e2e:local e2e/push.spec.ts e2e/anbieter-inhalt.spec.ts`, falls sie nicht in der lokalen Auswahl sind. Größen vor und nach Stufe B notieren, getrennt: `site.json` (250 kB gzip) mit `pnpm build && pnpm size` auf echten Daten (der Fixture-Build sagt darüber nichts), Start-JS (Budget 102 kB) aus demselben Lauf.

**Stufe C**

21. `raw.test.ts`: Event ohne `category` ist ungültig, auch in `pending.events` (`providerRawIssues`). `build-offers.test.ts`: Fälle 5b und 5e entfallen. `report.test.ts`: die Zeile entfällt. `topics.test.ts`: `withCategory` und `fallbackCategory` entfallen. `app.spec.ts`: der Fall „site.json ohne category“ (Test 17) entfällt. `extract.test.ts`: „category fehlt“ kommt jetzt aus `validateRaw`. Der **Schema-Hash-Test** (Test 4) bleibt unverändert grün.

## Schritte

Arbeit in einem eigenen Worktree auf Branch `eine-kategorie` (`CLAUDE.md`, Punkt 6), kleine Commits. Jeder Schritt ist erst fertig mit `pnpm verify` grün. Die CI beobachtet nur die Haupt-Session.

**Stufe A**

- **A1 Domäne und Schema:** Tests 1–2 rot, dann `topics.ts` und `schema.ts`, `pnpm schema:export`.
- **A2 Pipeline:** Tests 3–7 rot, dann `raw.ts`, `extract.ts`, `build-offers.ts`, `report.ts`, `io/nightly.ts`. Event-Fixtures der Pipeline-Tests ergänzen. `pnpm schema:export`.
- **A3 Prompt und Evals:** Test 8 rot, dann `eval-score.ts`, `RESULTS_HEADER`, `evals/results.md` (Spalten `–`), Prompt (E8), Soll-`category` in allen 12 `expected.json` mit `NOTES.md`.
- **A3b Stichprobe für den Nutzer:** Die Zweifelsfälle aus den `NOTES.md` (Titel, gewählte Kategorie, Grund) gehen als kurze Liste an den Nutzer. Erst nach seiner Bestätigung oder Korrektur folgt A4, denn die Soll-Werte bestimmen die Abnahme.
- **A4 Eval-Abnahme:**
  - Kosten freigegeben (Nutzerentscheid 4): zwei lokale Läufe über den Login, etwa $0,25, 15–20 Min.
  - `pnpm eval` zweimal (mit `run_in_background`) und gegen die Kriterien aus E10 prüfen.
  - Ergebnis in „Umsetzung“. Nicht bestanden: E8 nachschärfen, höchstens zweimal, dann Rückfrage.
- **A5 Prüfen und Doku:** `pnpm e2e:local --affected`, `/arch-review` (Schemaänderung). Doku (E12): Skill; Invariante in `docs/architecture.md`; ADR 0030 auf „angenommen“; „Entwurf“ aus den Hinweisen in ADR 0003, 0012 und 0024 streichen.
- **A6 Merge und Neu-Extraktion:**
  - Push des Branches, CI grün, Fast-Forward nach `main`, CI auf `main` grün. `meta.json` zeigt den Commit.
  - Dann, freigegeben (Nutzerentscheid 4, etwa $0,65 API-Gegenwert über das Abo-Token, 20–25 Min.): `gh workflow run nightly.yml -f modus=live -f max_tokens=5000000 -f max_calls=200`.
  - Nach dem Lauf: Bericht (Issue bzw. `pnpm pipeline status`) auf `derivedCategories`, Warnungen „passt zu keinem Thema“ (Anteil), Einbrüche und Fehler prüfen.
  - Prüfen, dass jedes Angebot in `data/offers.json` auf `main` `category` hat: `node -e` über `offers.filter((o) => !o.category).length` = 0.
  - Verteilung der Hauptkategorien notieren (Zahl je Kategorie, **alle 12**, auch die mit 0 kommenden Angeboten) und mit den Etiketten vor dem Plan vergleichen. Das kommt in „Umsetzung“, als Grundlage für die Sichtprüfung in B. Hat eine Kategorie 0 Treffer, kommt nach `docs/ideas.md` die Idee „Sticker ohne Treffer ausgrauen (Plan 0037, A6: <Kategorien>)“, ohne Codeeingriff.
  - Stand von `data/raw` notieren (Einzeiler aus E7, Voraussetzung 2). Ein Wert über 0 ist hier erwartet, er zeigt den Weg bis Stufe C.

**Stufe B** (erst nach A6; Code kann parallel entstehen, gemergt wird nach A6)

- **B1 Schema Pflicht:** Test 10 rot, dann `schema.ts`, Fixtures (E14), `pnpm schema:export`, Tests mit Angeboten von Hand ergänzen (`pnpm typecheck` zeigt sie).
- **B2 Filter:** Tests 11–12 rot, dann `filter.ts`.
- **B3 Anzeige:** Tests 13–17 rot, dann `directory.ts`, `geojson.ts`, `map-types.ts`, `share-pages.ts`, Rückbau `categoryOf`/`leadCategory`, `withCategory` in `topics.ts` und `adoptSite` in `App.tsx` (E13). Test 17 ist ein E2E-Fall und läuft in B4.
- **B4 E2E:** Tests 17–19 anpassen bzw. neu (vorher gegen den Stand von B1 rot). `rg -n "kat=" e2e/` erneut laufen lassen und die Tabelle in Test 19 nachführen. Gates Test 20.
- **B5 Prüfen:**
  - `/arch-review` (Schemaänderung, über 200 Zeilen).
  - `/browser-review` lokal (Fixture-Build, volle Checkliste), zusätzlich mit diesen Zeilen:
    - `?kat=musik`, `?kat=buehne`, `?kat=buecher`: Jede Kachel trägt die gewählte Kategorie; `?kat=treffs-cafes` zeigt den Leerzustand.
    - Ohne Filter tragen Babykonzert und Krabbelreime ihr neues Etikett. Detail, Kalenderpunkt und Kachel sind gleich.
    - Anbieter-Sheet Theater: nur „Bühne & Konzert“.
    - Karte: Marker der Gemeinde in Bewegungsfarbe.
    - Leerzustand bei `?kat=treffs-cafes`.
    - Alles bei 320 px und 360 px, jeweils hell und dunkel.
- **B6 Doku:** E12 (`docs/architecture.md` nur Karten- und Filtertext, Plan 0014, `docs/ideas.md` mit Restpunkt „Stufe C“ bis zu ihrem Abschluss).
- **B7 Merge:**
  - Vor dem Push `git pull --rebase` auf `origin/main` (Nachtlauf committet parallel).
  - **Danach ausdrücklich prüfen**, dass `data/offers.json` aus `origin/main` vollständig ist: `pnpm data:validate` grün (mit `category` als Pflicht aus B1), danach `pnpm verify`. Ist es rot, fehlt der Nachtlauf aus A6. Dann nicht pushen, sondern A6 abschließen.
  - Push, CI auf `main` grün, `meta.json` zeigt den Commit, dann `/browser-review live` als Kurzcheck mit echten Daten: `?kat=musik` (alle Etiketten „Musik & Singen“), `?kat=museum` (jetzt mit Treffern, falls die Daten welche haben), ein Anbieter-Sheet mit mehreren Kategorien.

**Stufe C** (frühestens 7 Tage nach B7, wenn alle drei Voraussetzungen aus E7 erfüllt sind)

- **C1:**
  - Zuerst `git pull --rebase` auf `origin/main` und den Einzeiler aus E7 laufen lassen: Ergebnis `0`, sonst nicht anfangen.
  - Test 21 rot, dann Abbau (Dateien Stufe C), `pnpm schema:export`.
  - Vor dem Push erneut `git pull --rebase`, dann `pnpm data:validate` auf dem aktuellen `origin/main`-Stand (wie B7) und `pnpm verify`.
  - `pnpm e2e:local --affected`, kurzes `/arch-review`.
- **C2:** Merge wie B7. Bis hierher bleibt die Statuszeile `in Umsetzung`, auch wenn Stufe B schon live ist. Danach Restpunkte nach `docs/ideas.md`, Statuszeile, `git mv` nach `docs/plans/archiv/` (`CLAUDE.md`, Punkt 7).

## Verifikation

- Nach A6: `data/offers.json` auf `main` hat für jedes Angebot `category`. Der Bericht des Laufs mit höherer Bremse nennt keine offene Bremse, `derivedCategories` ist klein (nur Fehler, Einbrüche). In `evals/results.md` stehen zwei Zeilen mit dem neuen Prompt-Hash.
- Nach B7: Live zeigt `?kat=musik` nur Kacheln mit „Musik & Singen“. Ein Angebot trägt mit und ohne Filter dasselbe Etikett. `commit` in https://zwergenplan.app/data/meta.json = `git rev-parse --short HEAD`.
- Nach C2: Der Einzeiler aus E7 ergibt `0`, `RawEvent.category` ist Pflicht, `fallbackCategory`, `withCategory`, `adoptSite` und `derivedCategories` gibt es nicht mehr (`rg` leer), der Schema-Hash-Test ist unverändert grün, CI grün.

## Risiken

- **Nebenfilter werden kleiner.** 209 von 469 Angeboten haben heute mehr als eine Kategorie und fallen künftig aus allen außer der Hauptkategorie heraus. Am stärksten betroffen ist voraussichtlich „Musik & Singen“ (krabbel + musik 56, musik + bühne 44). Das ist der Kern von Nutzerentscheid 2. Die Verteilung aus A6 macht es sichtbar.
- **Falsche Hauptkategorie durch das Modell.** Dagegen helfen die Eval-Schwelle (E10), die Warnung (E2) und Prompt-Korrekturen. Falsch sind Einzelfälle, korrigiert wird nicht von Hand (Nicht-Ziel).
- **Streuung bei der Neu-Extraktion.** Titel und Zusammenfassungen wechseln. Ein Einbruch wird zurückgehalten, dann bleibt der Altbestand mit Rückfall-Kategorie stehen (Zähler). IDs bleiben (ADR 0022).
- **Kosten** (E7): einmal etwa $0,65 (API-Gegenwert, Abo-Token). Eval etwa $0,25. Danach wie bisher nur geänderte Seiten.
- **Zwei Deploys.** Zwischen A und B sieht niemand eine Änderung, `site.json` wächst um rund 12 kB (unter 1 kB gzip). B darf erst nach A6 auf `main`; ein früherer Merge machte `pnpm data:validate` rot. B7 prüft deshalb vor dem Push, dass `data/offers.json` auf `origin/main` vollständig ist.
- **Gecachtes `site.json` ohne `category`** (E13): abgefangen durch `adoptSite` in `App.tsx` bis Stufe C.

## Review (2026-10-12) – Verdict: Überarbeiten

Alle Befunde übernommen:

- **B1 (Blocker):** Der Rückfall für `site.json` ohne `category` liegt nicht mehr in `src/data/site.ts` (verboten durch `data-domain-runtime-allowlist`, ADR 0010), sondern an einer Stelle in `src/ui/App.tsx` (`adoptSite` mit `withCategory` aus `topics.ts`). Er gilt für alle Abnehmer, wird durch einen E2E-Fall belegt und entfällt in Stufe C (E13, Dateien, Tests 16, 17, 21).
- **M1:** `RawEvent.category` steht ausdrücklich im `.extend`. Ein Test hält ab A2 den Hash des Antwortschemas fest, B und C dürfen ihn nicht ändern (E1, E3, Tests 4, 10, 21).
- **M2:** Der Eval zählt vorhergesagte Angebote mit `category ∉ categoriesOf(topics)` (`categoryConflicts`, Spalte `Kat. ohne Thema`). Die 5-%-Schwelle misst jetzt das (E10, Test 8).
- **M3:** Die Merkliste ist aus Ziel, E9 und ADR 0030, Punkt 2 gestrichen. Test 12 hat keinen `saved.test.ts`-Fall mehr.
- **M4:** `providerCategories` behält den Filter auf `providerId`. Familientreff erwartet `["babykurse", "krabbel-spielgruppen"]`, am Fixture nachgeprüft: Das Elterncafé endet um 10:00 vor der Fixture-Uhr 12:00 (E11, Test 13).
- **m1:** Die Größe von `site.json` wird mit `pnpm build` auf echten Daten gemessen, Start-JS getrennt notiert (Test 20).
- **m2:** B7 prüft nach `git pull --rebase` ausdrücklich mit `pnpm data:validate` und `pnpm verify`, dass `data/offers.json` vollständig ist.
- **m3:** Alle `kat=`-Stellen in `e2e/` sind geprüft und mit Folge in einer Tabelle unter Test 19 festgehalten. B4 wiederholt `rg`.
- **m4:** Neuer Schritt A3b: Der Nutzer bestätigt die Zweifelsfälle der Eval-Soll-Werte vor A4.
- **m5:** Test 19d nennt den Leerzustand wörtlich („Diese Seite ist noch leer“, „Mit diesen Filtern gibt es keine Angebote.“). Das Browser-Review prüft 320 px und 360 px, hell und dunkel.
- **m6:** Ein Kommentar am Rückfall in `fromRaw` und Schritt 7 ist vorgeschrieben (E5).
- **Umfang:** Stufe C bleibt Teil des Plans. Der Plan bleibt bis C2 `in Umsetzung` (Anlass, Schritt C2).

Nutzerentscheide vom 2026-10-12 (Konfliktregeln E8 unverändert, beide Kosten freigegeben) stehen unter „Anlass“. Der frühere Abschnitt „Offene Fragen an den Nutzer“ entfällt.

Abgelehnt: keine.

## Review 2 (2026-10-12) – Verdict: Freigabe mit Änderungen

Keine Blocker. Alle Punkte übernommen:

- **M1:** Stufe C verlangt jetzt zusätzlich, dass `data/raw/*.json` kein Event ohne `category` enthält, auch nicht in `pending.events`. Der `node -e`-Einzeiler steht in E7 (Ergebnis 0). C1 prüft ihn vor dem Anfang und fährt nach `git pull --rebase` `pnpm data:validate` auf aktuellem `origin/main`. Test 21 deckt `pending.events` ab.
- **m1:** Die Invariante in `docs/architecture.md` und der Status „angenommen“ von ADR 0030 kommen schon in A5. B6 behält nur Karten- und Filtertext (E12).
- **m2:** Test 19d ist geteilt. d1 prüft den Leerzustand, d2 setzt per `page.route` den Krabbeltreff auf `treffs-cafes` und prüft die Pille mit `expectMobileUx` hell und dunkel.
- **m3:** Der Nachtlauf-Bericht zählt die Warnungen „passt zu keinem Thema“ gegen die neu übernommenen Events (`CATEGORY_CONFLICT`), mit Test 6. Daran misst sich die 5-%-Grenze aus E2.
- **m4:** Der Schema-Hash-Test hat die vorgegebene Fehlermeldung. Ein neuer Test prüft, dass die Kategorietabelle im Prompt genau die 12 IDs aus `CATEGORIES` nennt (Test 4).
- **m5:** E13 legt die Typen fest: `withCategory` nimmt `Omit<T, "category"> & { category?: Category }` und gibt `T` zurück, `adoptSite` nimmt `LooseSiteData`. Dazu ein Pflichtkommentar zum Übergang bis Stufe C.
- **m6:** A6 notiert alle 12 Kategorien samt Nullen. Leere Kategorien führen zur Idee „Sticker ohne Treffer ausgrauen“ in `docs/ideas.md`, ohne Codeeingriff.

Abgelehnt: keine.

## Umsetzung

- **A1–A3 (2026-10-12):** umgesetzt wie geplant. Abweichungen:
  - `io/eval.test.ts` braucht `category` schon in A, weil `EvalOffer.category` Pflicht ist.
  - Fixtures nur in `lib/extract.test.ts` und `io/extract.test.ts` nötig. Die übrigen Pipeline-Tests nutzen Fake-Extraktoren.
  - Der Hash-Test liegt in `lib/extract.test.ts`, der Wert des Antwortschemas ist `ab413b808c90`.
- **A3b (2026-10-12), Nutzerentscheide zu den Zweifelsfällen:**
  - Familienbox „BabySinne“ wird `babykurse`.
  - Pikler-Babygymnastik und Zumbini werden `bewegung`.
  - Die Miniclubs St. Andreas Thon werden `krabbel-spielgruppen`.
  - Folge für den Prompt (Abweichung vom wörtlichen E8-Text):
    - Die Tabelle nennt „Sinneskurse für Babys“ unter `babykurse` und „Pikler-Bewegungskurse“ unter `bewegung`.
    - Der Satz „Sie passt zu einem der `topics`“ lautet jetzt „Meist passt sie …“, denn kein Thema zeigt auf `babykurse` außer pekip, fenkid, babymassage und babysignal.
    - Damit hat das Soll zwei Fälle „Kat. ohne Thema“ (BabySinne, 2 von 54). Das ist nach E2 erlaubt.
- **A4 (2026-10-12), Eval-Abnahme bestanden:** zwei Haiku-Läufe, Prompt-Hash `7b31b918b80b`, zusammen $0,22.
  - `category`: 100 % und 96 %.
  - Kat. ohne Thema: 3 % und 4 %.
  - Termine R: 99 % und 89 %. Die 89 % kommen aus der Familienbox (85 %), dieselbe Streuung wie am 2026-10-11.
  - Angebote R: 96 % und 91 %.
  - `format`: 94 % und 94 %.
  - Alle drei Kriterien aus E10 sind erfüllt.
- **A5 (2026-10-12):**
  - `pnpm e2e:local --affected` (app, theme): 28 grün.
  - `/arch-review` ohne Blocker. Übernommen:
    - Doku aus E12 für Stufe A: Invariante, ADR 0030 angenommen, Hinweise in ADR 0003, 0012 und 0024, Skill.
    - Die Widerspruchsquote im Nachtlauf-Bericht zählt nur frisch extrahierte Anbieter (`pending-uebernommen` ohne Modellaufruf blähte den Nenner auf).
    - Singular „1 Angebot“ im Build-Hinweis.
    - Statuszeile auf „in Umsetzung“.
