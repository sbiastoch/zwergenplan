# Plan 0002 – Recherche-Pipeline in TypeScript und erster echter Datenstand

Status: freigegeben nach Review 2 (mit Änderungen, eingearbeitet) → Umsetzung
Datum: 2026-10-04

## Ziel

Am Ende dieses Plans gilt:
- `data/providers.yaml` steht im Zod-Vertrag (`src/domain/schema.ts`) und wird von jedem Gate geprüft.
- Die Recherche-Pipeline läuft vollständig in TypeScript unter `scripts/pipeline/`. Im Repo gibt es kein Python mehr.
- Der Skill `.claude/skills/babyevents-nuernberg` orchestriert einen Lauf über den ganzen Katalog für 4 Monate. Er ruft nur TS-Skripte auf, und am Ende steht `data/offers.json`.
- Ein erster echter Lauf ist auf `main` committet, `data/BOOTSTRAP` ist gelöscht, CI ist grün, und https://sbiastoch.github.io/zwergenplan/ zeigt echte Angebote.

## Nicht-Ziele

- UI-Design, Karte, Kalenderansicht (kommen aus der Mockup-Session). Die Platzhalter-UI bleibt, sie muss nur mit echten Daten bestehen.
- Öffi-Fahrzeitmatrix (ADR 0005). `route.py` entfällt ersatzlos, ebenso `report.py` und `ics.py`, denn die Website und `src/domain/ics.ts` ersetzen sie.
- `providers_md.py` und `ANBIETER.md` entfallen. Das Anbieterverzeichnis gehört auf die Website (Eintrag in `docs/ideas.md`). Bis dahin ist `data/providers.yaml` die lesbare Quelle. Eine generierte Markdown-Kopie bräuchte sonst ein eigenes Drift-Gate.
- Pipeline als GitHub Action. Sie läuft weiter lokal (ADR 0002).
- Ad-hoc-Fragen wie „was machen wir nächste Woche“ beantwortet künftig die Website. Der Skill verweist nur noch darauf bzw. liest `data/offers.json`.

## Ausgangslage

- `data/providers.yaml`: 83 Einträge im Skill-Format (75 `anbieter`, 6 `aggregator`, 2 `verzeichnis`).
  - Für den Hauptort stehen `address/ring/lat/lon` flach im Eintrag. `venues[]` (ohne `id`) gibt es nur bei weiteren Orten. Bei 15 von 19 Anbietern steht der Hauptort dort zusätzlich.
  - Ein Ort hat keine Koordinaten (`zoff-harmonie`: „wechselnd, Nürnberger Wald“).
  - `age` ist Freitext („0-3“, „4 Mon-3 J“, „3“, „alle“).
  - `format/cost/registration` sind Listen, `cost` kennt zusätzlich `teils-kostenlos`.
  - 12 Einträge haben `covered_by: et-dekanat-nuernberg`, 3 Aggregatoren `fetch: scripts/<x>.py FROM TO`. Ein `url`-Feld (Homepage) fehlt.
- Zod-`Provider` verlangt dagegen `url` und `venues[]` (min. 1, mit `id`, `geo`). Er kennt weder `role` noch `covered_by`, Alter, Formate, Kosten oder Anmeldung.
- Themen: Der Skill nutzt `krabbelgottesdienst` (9×), sein Vokabular kennt außerdem `tanz` und `beikost`. Alle drei fehlen in `TOPICS`.
- Python: 13 Skill-Skripte (1 577 Zeilen) plus `research/merge.py` (122 Zeilen).
- Geprüft: Die Veranstalter-ID `vid` in den Katalog-URLs von evangelische-termine.de ist das Feld `_user_ID` der JSON-API (Snapshot `vid=124` → nur `_user_ID` 124). Die Ring-Klassifikation aus `ring.py`, nach TS portiert, stimmt für alle 144 Orte mit Koordinaten mit dem gespeicherten `ring` überein.

## Entscheidungen

### E1 – Einmalige Migration statt dauerhaftem Adapter

Das Skill-Format wird **einmalig** in den Zod-Vertrag überführt. Danach pflegen Agenten den Katalog direkt im Zod-Format.

Begründung:
- ADR 0001 verlangt **eine** Schema-Quelle. Ein Adapter hielte ein zweites, von keinem Gate geprüftes Format am Leben. Genau dieses Format würden die Agenten bei der Pflege weiter schreiben, und Fehler fielen erst im nächsten Lauf auf statt im PostToolUse-Hook.
- Mit der Migration greift `validate-data` für jede Katalogänderung sofort (Hook bei `data/*`, `check:fast`, CI). Das exportierte `schema/providers.schema.json` ist die Vorlage für Agenten.
- Ein Adapter wäre dauerhafter Code, der nur ein Altformat übersetzt.

Umsetzung: `scripts/pipeline/migrate-catalog.ts` mit der reinen Funktion `migrateCatalog(legacy[]) → Provider[]`. Die Tests laufen gegen ein **eingefrorenes** Altformat-Fixture (`tests/fixtures/pipeline/legacy-catalog.yaml`, Auszug aus `git show 4e14167:data/providers.yaml`), nicht gegen die Datei, die die Migration überschreibt. Das Skript läuft einmal, sein Ergebnis wird committet. Im selben Plan werden Skript, Tests und Fixture wieder gelöscht. Die git-Historie behält sie, die Commit-Message verweist darauf.

### E2 – Schema-Erweiterung `Provider`: nichts wird weggeworfen

`Provider` wird zu `z.discriminatedUnion("role", [Anbieter, Aggregator, Verzeichnis])`. So stehen die Rollenregeln auch im exportierten JSON Schema, der Vorlage für Agenten. Ein `refine` ginge dort verloren.

| Skill-Feld | Zod-Feld | Regel |
|---|---|---|
| `role` | `role` (Diskriminator) | `anbieter`: `venues` min. 1. `aggregator`/`verzeichnis`: `venues` darf leer sein |
| `covered_by` | `coveredBy?: kebab` | nur bei `anbieter`. Muss auf einen `aggregator` zeigen (Invariante in `validateDataset`) |
| `fetch: scripts/x.py FROM TO` | `adapter?: "stadt-vk" \| "frankenkids" \| "evtermine"` | nur bei `aggregator` |
| `age` (Freitext) | `age?: { minMonths, maxMonths }` | eigenes Schema `ProviderAge` mit `maxMonths ≤ 216`, denn Anbieter bedienen auch Ältere (`0-6` = 0–72). Regeln aus `select_providers.age_ok`: Zahl = Jahre, „m“/„Mon“ = Monate, Obergrenze > 6 ohne Einheit = Monate. **Neue Regel** für „3“ (dort war das unbeschränkt): Die Notizen dieser drei Einträge sagen „jüngstes Stück ab 3“, deshalb 36–36. „alle“ → Feld entfällt |
| `format[]` | `formats: Format[]` | min. 1, eindeutig |
| `cost[]` | `costs: Cost[]` | `teils-kostenlos` → `kostenlos` + `kostenpflichtig`. Die Bedeutung bleibt, ein dritter Wert wäre redundant |
| `registration[]` | `registrations: Registration[]` | min. 1, eindeutig |
| `address, district, ring, lat, lon` | Hauptort: erster Eintrag in `venues[]`, `id` = Anbieter-ID | Liegt ein `venues`-Eintrag ≤ 25 m vom Hauptort entfernt, ist er derselbe Ort. Er wird zusammengeführt, den Namen liefert der `venues`-Eintrag. Sonst gilt als Name der erste Teil von `address`, wenn die Adresse ≥ 3 Komma-Teile hat und der erste Teil keine Ziffer enthält, andernfalls der Anbietername |
| `venues[]` (ohne `id`) | weitere `venues[]`, `id` = `<anbieterId>-<slug(name ohne Klammerzusatz), max. 32>`, der Klammerzusatz kommt nach `notes`, eindeutig gemacht | IDs werden **gespeichert**, nicht neu berechnet, und bleiben so stabil (ADR 0003) |
| `venues[]` ohne Koordinaten | entfällt als Ort, ihr Text wird an `notes` angehängt: „Wechselnder Treffpunkt: <name>, <address>“ | Nennt die Quelle für ein Angebot einen konkreten Treffpunkt, legt der Agent dafür einen Ort an (`pipeline geocode`). Nur ein Angebot ganz ohne Ortsangabe kommt an den Hauptort |
| — | `url` | die volle erste `programme`-URL vom Typ `html`, sonst die erste überhaupt (die UI nutzt das Feld bisher nicht) |
| Einzelfälle laut `notes` | `kath-stadtkirche-familiengottesdienste` wird `aggregator` ohne Adapter („Adresse = Sitz, nicht Veranstaltungsort“). Bei `eckstein-treff-alleinerziehende`, `kath-stadtkirche-familiengottesdienste` und `frankenkids-eventkalender` bedeutet „0-12“ laut `notes` Jahre (0–144 Monate) | ausdrückliche Ausnahmeliste in der Migration, getestet |
| `address` ohne Koordinaten (Aggregatoren) | an `notes` angehängt: „Sitz: …“ | nur wenn die Adresse eine Ziffer enthält |

Weitere Invarianten in `validateDataset`: `coveredBy` zeigt auf einen existierenden `aggregator`, und Angebote referenzieren nur Anbieter mit `role: anbieter`. `Venue`, `programme`, `availability`, `verified` und `notes` bleiben unverändert. `Topic` und `AvailabilityStatus` werden exportiert (für E5).

### E3 – Themen

`TOPICS` bekommt die fehlenden Skill-Themen, jeweils mit Kategorie:
- `krabbelgottesdienst` → `treffs-cafes`. Begründung: Gemeinschaft, Singen, kurzer Ablauf. Über eine eigene Kategorie „Glaube“ entscheidet die Mockup-Session (Eintrag in `docs/ideas.md`).
- `tanz` → `bewegung`, `musik`
- `beikost` → `beratung`

### E4 – Offer-IDs bei Kursen und Einzelterminen (ADR 0006, ergänzt ADR 0003)

ADR 0003 legt `providerId--slug(title)--venueId` fest. In der Praxis kollidiert das:
- Drei Vorstellungen eines Stücks am selben Ort ergeben drei `einmalig`-Angebote mit gleicher ID.
- Zwei parallele „PEKiP“-Kurse am selben Ort ergeben ebenfalls dieselbe ID.

Regel: Bei `kurs` und `einmalig` hängt der Slug den Berliner Beginn des ersten Termins an, z. B. `fbs-nuernberg--pekip-20261013t0930--fbs-nuernberg`. Bei `regelmaessig` bleibt es bei `slug(title)`. Die ID bleibt stabil, solange das Angebot dasselbe ist. Eine verlegte Vorstellung ist ein neues Angebot.

`slug()`:
- Umlaute werden transliteriert (ä→ae, ß→ss).
- Läufe anderer Zeichen werden zu einem `-`, die Ränder getrimmt.
- Höchstens 60 Zeichen, an der Wortgrenze gekürzt.
- Bleibt nichts übrig, ist der Slug `x`.

`slug` und `offerId` liegen in `src/domain/ids.ts` (rein, getestet).

**Backpressure**: `validateDataset` prüft neu `offer.id === offerId(offer)`. Damit fallen übernommene Altangebote, Handkorrekturen und Fixtures auf, die die Regel verletzen. Die Fixture-IDs werden angepasst.

**Kursfortschreibung**: Zeigt ein Anbieter von einem laufenden Kurs nur noch die Resttermine, entstünde eine neue ID und im Kalender ein Duplikat. `build` vereinigt deshalb einen Kurs mit dem Altbestand, wenn Anbieter, Ort und `slug(title)` gleich sind und sich die Termine überschneiden. Die vergangenen Termine bleiben, der erste Termin und damit die ID bleiben stabil. Übernommene Kurse (E8) bleiben unverändert. Beides wird getestet.

Kollisionen nach Anwendung der Regel:
- `regelmaessig` mit gleicher ID und gleichen Merkmalen (Format, Anmeldung, Kosten, Alter): Die Termine werden vereinigt (z. B. Miniclub Mo und Do). `summary`, `url`, `availability` und `price` kommen vom ersten Event in fester Reihenfolge (Rohdateien nach Name, darin nach Index), die Themen werden vereinigt.
- `regelmaessig` mit gleicher ID, aber abweichenden Merkmalen: Fehler im Lauf-Bericht. Der Agent macht den Titel eindeutig, z. B. „Miniclub (0–1 J.)“.
- `kurs`/`einmalig` mit gleicher ID: Das ist derselbe Termin, er wird dedupliziert (E7).

### E5 – Rohformat der Subagenten statt fertiger Offers (ADR 0006)

Die Subagenten schreiben **nicht** direkt `offers.json`. Offsets, Ferien-Ausnahmen, IDs und Deduplizierung sind deterministisch und gehören in Code, nicht in ein Sprachmodell. Jeder Subagent liefert je Paket eine `RawBatch`-Datei. Daraus erzeugt `pipeline build` die Datei `data/offers.json` und prüft sie gegen dasselbe Zod-Schema, aus dem `schema/offers.schema.json` exportiert wird.

`RawBatch` ist ein pipeline-internes **Zwischenformat** und kein zweiter Datenvertrag (ADR 0006 hält das fest). Es liegt in `scripts/pipeline/lib/raw.ts` und wird aus den Offer-Feldern **abgeleitet**: `schema.ts` exportiert dafür das unverfeinerte `OfferFields`, und `Offer = OfferFields.refine(…)` (Zod 4 erlaubt `.pick` nicht auf verfeinerten Schemas). `RawEvent` entsteht per `.pick`/`.extend` aus `OfferFields`, `age` als `ProviderAge` (die Pipeline kappt auf 36). Grenzen wie Titel ≤ 140 und `summary` ≤ 320 können dadurch nicht auseinanderlaufen. Export nach `schema/raw-batch.schema.json` mit Drift-Check.

```ts
RawBatch = {
  providers: Record<ProviderId, { status: "ok" | "keine-termine" | "fehler"; reason?: string; note?: string;
                                  checked: url[]; drift?: string }>,
  events: RawEvent[],
}
RawEvent = OfferFields.pick({ providerId, venueId, title, summary, topics, format, registration, cost, price, age, url, sourceUrl })
  .extend({
    availability: { status, note? },
    registrationWindow?: { opens?: LocalDateTime, deadline?: LocalDateTime },
    schedule:
      | { kind: "dates"; dates: { start: LocalDateTime; end?: LocalDateTime }[] }
      | { kind: "weekly"; weekdays: Weekday[]; start: "HH:MM"; end?: "HH:MM"; from: LocalDate;
          until?: LocalDate; count?: number; interval?: 1|2|3|4; skipHolidays: boolean; except?: LocalDate[] }
      | { kind: "monthly"; nth: 1|2|3|4|-1; weekday: Weekday; start; end?; from; until?; skipHolidays; except? },
  })
```

- `LocalDateTime` = `2026-10-13T09:30` in Berliner Ortszeit. Den Offset rechnet die Pipeline (`fromBerlinLocal` in `src/domain/time.ts`, getestet über beide Zeitumstellungen; die fehlende Stunde im März wirft, `build` meldet den Termin).
- Fehlt `end`, setzt die Pipeline 60 Minuten an. Im Bericht steht dazu ein Hinweis, nicht in `availability.note`. Wie bisher wird nichts geraten.
- Strukturierte Regeln statt RRULE-Strings: Zod prüft sie, und der Expander bleibt klein. Andere Rhythmen liefert der Agent als `dates`.
- `einmalig` mit mehreren `dates` (Vorstellungen eines Stücks) zerlegt die Pipeline in einzelne Angebote (E4).
- Altersangaben über 36 Monate kappt die Pipeline auf 36. Liegt `minMonths` über 36, fällt das Angebot weg (Bericht).
- `checkedAt` setzt die Pipeline: bei Rohdateien die Änderungszeit, bei Sammelkalendern die Abrufzeit aus `candidates/_status.json`. Kein Agent schreibt eine Uhrzeit.

**Backpressure für Subagenten**: `pnpm pipeline validate-raw <datei>` prüft (Paket ↔ Rohdatei fest: `batch-<n>.json` ↔ `raw/batch-<n>.json`) Schema, Katalog-Referenzen (`providerId`/`venueId` existieren, Ort gehört zum Anbieter, Anbieter ist `anbieter`), Status für jeden Paket-Anbieter und die Termin-Expansion (Testlauf). In `extraction.md` ist das der Pflicht-Abschluss: Bei Exit ≠ 0 korrigiert der Agent. Zusätzlich führt der PostToolUse-Hook `validate-raw` für `runs/**/raw/*.json` aus und meldet Fehler als Kontext, also schon beim Schreiben.

### E6 – Horizont und Termin-Materialisierung

- Horizont: `from` = Berliner Datum des Laufs (`berlinDate`), `to` = `from` + 4 Monate (ADR 0003).
- `regelmaessig`: alle Termine in `[from, to]`. Ferien und Feiertage entfallen, wenn `skipHolidays` gesetzt ist, ebenso jeder Termin in `except`.
- `kurs`: alle bekannten Termine, auch bereits vergangene eines laufenden Kurses (Serien-ICS, Plan 0001). Regeln mit `count`/`until` werden über `to` hinaus bis zu ihrem Ende expandiert, die Ferien dafür über den ganzen Regelzeitraum geladen. Ein Kurs, der nach `to` beginnt, gehört nicht in den Lauf.
- `einmalig`: nur Termine in `[from, to]`.
- Ferien und Feiertage: OpenHolidays-API für `DE-BY`, je Jahr gecacht unter `~/.cache/zwergenplan/`.
- `data/offers.json` wird stabil geschrieben: Angebote nach ID sortiert, 2 Leerzeichen Einrückung, abschließender Zeilenumbruch. So bleiben die Diffs lesbar.

### E7 – Sammelkalender: Zuordnung, Entwurf, Deduplizierung

Jedes Angebot gehört zu einem Katalog-Anbieter mit `role: anbieter` und zu einem seiner Orte (ADR 0003, `validateDataset`). Termine aus Sammelkalendern werden deshalb **zugeordnet**, nicht unter dem Aggregator abgelegt.

**Abruf** (`candidates fetch`): stichwortweise wie bisher. Bei evangelische-termine kommt zusätzlich eine Abfrage per `vid` für jeden `coveredBy`-Anbieter dazu, denn die Stichwortsuche verpasst Termine. Der Relevanzfilter bleibt dabei aktiv.

**Zuordnung** (`lib/match.ts`, rein). Berücksichtigt werden nur Orte von `role: anbieter`:
1. evangelische-termine: Veranstalter-ID ↔ `vid` in einer `programme`-URL des Anbieters
2. Koordinaten der Quelle ≤ 75 m von einem Ort. Teilen sich mehrere Anbieter den Ort, entscheidet die Ähnlichkeit des Veranstalternamens, sonst bleibt der Treffer offen
3. normalisierte Adresse (Straße + Nr. + PLZ, „Str.“ = „Straße“) gleich
4. Anbieter erkannt, Ort nicht: Hat der Anbieter genau einen Ort, wird dieser genommen, sonst bleibt der Treffer offen

**Entwurf** (`candidates list` / `keep`):
- `list` zeigt je Kandidat den Vorschlag (`→ anbieter/ort` oder `?`).
- `keep cid,cid` bestätigt Vorschläge, `keep cid=anbieter/ort` überschreibt sie.
- `keep` schreibt `RUN_DIR/raw/aggregatoren.json` als `RawBatch`-**Entwurf**. Deterministisch abgeleitet werden:
  - `format`: `regelmaessig`, wenn die Quelle eine Reihe meldet (`weekly`), wenn mindestens zwei Termine im Abstand von 7 Tagen zur gleichen Uhrzeit liegen oder wenn der Anbieter nur `regelmaessig` kennt. Sonst `einmalig` (mehrere Termine zerlegt `build`)
  - `cost`: „kostenlos/Eintritt frei“ → `kostenlos`, sonst der einzige Wert aus `costs` des Anbieters
  - `registration`: „ohne Anmeldung/offener Treff“ → `ohne-anmeldung`. Stadt-Kalender `ANMELDUNG` → `mit-anmeldung`. Sonst der einzige Wert aus `registrations` des Anbieters
  - `availability`: abgesagt → Kandidat fällt weg, ausverkauft → `ausgebucht`, Warteliste → `warteliste`, sonst `unbekannt` bzw. `ohne-anmeldung`
  - `topics`: Textregeln, ohne Treffer die Themen des Anbieters
- Nicht ableitbare Pflichtfelder bleiben leer. Das gilt immer für `summary`, denn das sind eigene Worte, nie kopierter Text. `validate-raw` listet die offenen Felder, der Orchestrator füllt sie direkt in der Entwurfsdatei. Ein erneutes `keep` überschreibt die Datei nur mit `--force`.
- Fehlt der Veranstalter im Katalog, legt `candidates add-provider RUN_DIR cid --id <neue-id>` einen Eintrag aus den Kandidatendaten an: Ort, Koordinaten aus der Quelle oder per Geocoding, Ring, `coveredBy` = Aggregator der Quelle, `verified` = heute. Danach prüft der Hook die Datei.

**Deduplizierung** in `build`, mit fester Rangfolge **Anbieterseite > stadt-vk > frankenkids > evtermine**: Ein Angebot entfällt, wenn ein Angebot desselben Anbieters am selben Ort einen Termin mit gleichem Beginn und ähnlichem Titel hat und von einer ranghöheren Quelle stammt (Logik aus `enrich.same_event`: gemeinsame Nicht-Füllwörter oder Ähnlichkeit ≥ 0,6). Maßgeblich ist die eigene Seite des Anbieters, weil sie Plätze und Details zeigt. Die Themen werden vereinigt. Test: dasselbe Konzert in stadt-vk und frankenkids ergibt genau ein Angebot.

**Aggregatoren ohne `adapter`** (`curt-termine-familie`, `rausgegangen-kinder-familien`, `kuf-kinderkultur-aggregator`) kommen in **kein** Paket. Ihre Termine gehören fremden Veranstaltern, die oft nicht im Katalog stehen. Laut ihren `notes` haben sie für 0–3 Jahre niedrige Priorität, und die KUF-Termine kommen ohnehin über den Stadt-Kalender. Sie bleiben im Katalog als Quellen für die Pflege: Relevante Veranstalter werden als `anbieter` aufgenommen.

### E8 – Robustheit eines Laufs

- Fehlt `data/offers.json` (erster Lauf), gilt der Altbestand als leer.
- Anbieter mit `status: fehler` verlieren ihre Angebote nicht. `build` übernimmt sie aus dem bisherigen `data/offers.json`, mit Terminen ab `from`. Der alte `checkedAt` bleibt, und der Bericht markiert die Übernahme. Angebote ohne verbleibenden Termin fallen weg.
- Anbieter ohne Status in diesem Lauf (z. B. nicht in einem Paket, weil nur nachgeprüft wurde) und ohne `coveredBy`: Ihre Altangebote werden ebenso übernommen und im Bericht als „nicht geprüft“ markiert.
- Steht ein **Aggregator mit `adapter`** auf `fehler`, übernimmt `build` die Altangebote aller Anbieter mit `coveredBy` = dieser Aggregator nach derselben Regel. Lücken bei zugeordneten Angeboten anderer Anbieter (die einen eigenen Status haben) dokumentiert der Bericht.
- `build` schreibt `RUN_DIR/report.json` und eine Kurzfassung auf stdout. Enthalten sind:
  - Angebote und Termine je Status
  - jede Quelle mit `fehler` samt Grund
  - Drift-Meldungen und Kollisionen
  - übernommene Angebote
  - geschätzte Endzeiten
  - weggefallene Termine (z. B. die fehlende Stunde)
- `build` bricht ab (Exit 1, nichts geschrieben), wenn eine Rohdatei `validate-raw` nicht besteht oder `validateDataset` rot ist.

### E9 – Ein Lauf endet mit einem Commit auf `main` (ADR 0002)

`pipeline publish RUN_DIR`:
1. Abbruch, wenn der Branch nicht `main` ist, wenn es Änderungen außerhalb von `data/` gibt oder wenn `main` nicht per Fast-Forward auf `origin/main` liegt (`git fetch` vorher). Der pre-commit prüft den ganzen Arbeitsbaum. Ein Daten-Commit darf deshalb keinen fremden, unversionierten Code-Stand „grün testen“.
2. `validate-data --against-deployed` (Zod, Invarianten, Plausibilität gegen Live)
3. `git add data/` und `git commit -m "data: Pipeline-Lauf <from> (<n> Angebote, <m> Anbieter)"` (pre-commit = `check:fast`)
4. `git push`

Danach beobachtet der Orchestrator `gh run watch` und prüft die Live-Seite: `/data/meta.json` zeigt den Commit. Bricht CI, bleibt die alte Version live. Der Orchestrator meldet das und repariert die Ursache, statt eine Schwelle zu senken.

## Struktur

```
scripts/pipeline/
  cli.ts                 Einstieg: node scripts/pipeline/cli.ts <befehl> (pnpm pipeline <befehl>)
  lib/                   REINE Logik, ohne Netz/Dateisystem, mit Tests (Coverage-Gate)
    candidate.ts         Zod: Candidate (Sammelkalender-Treffer), Text-Helfer
    raw.ts               Zod: RawBatch/RawEvent (aus Offer.shape abgeleitet) + validateRaw
    html-extract.ts      HTML → Text, JSON-LD-Events, Feeds, Links, Status-Ampeln, JS-Hinweis (aus fetch_page)
    ical.ts              minimaler VEVENT-Parser (aus fetch_page.parse_ical)
    relevance.ts         Relevanz-Regex und Themenregeln
    sources/stadt-vk.ts, frankenkids.ts, evtermine.ts   API-JSON → Candidate[]
    holidays.ts          OpenHolidays-JSON → freie Tage
    ring.ts              Ring-Klassifikation (Polygon der Stadtmauer)
    schedule.ts          Regel → lokale Termine
    match.ts             Kandidat → Anbieter/Ort
    draft.ts             Kandidat → RawEvent-Entwurf
    build-offers.ts      RawBatch[] + Katalog + Ferien + Altbestand → OffersFile + Bericht
    select.ts            Katalog → Pakete
  io/                    Netz und Dateien (dünn, ohne Logik, nicht unit-getestet)
    http.ts              fetch mit UA, Timeout, Zeichensatz-Erkennung, 2 Wiederholungen
    sources.ts           Abruf der drei APIs (Paginierung, Stichwörter, vid, Parallelität)
    holidays.ts, geocode.ts (Nominatim, 1 Anfrage/s, Cache)
    files.ts             RUN_DIR, Katalog, offers.json lesen/schreiben, git
  migrate-catalog.ts     einmalig, wird nach der Migration gelöscht
src/domain/ids.ts        slug, offerId (ADR 0003/0006)
src/domain/time.ts       + fromBerlinLocal, addDays, addMonths, isoWeekday
tests/fixtures/pipeline/ Altformat-Auszug, HTML-/API-/ICS-Snapshots, RawBatch-Beispiele
vitest.setup.ts          Netz-Sperre für Unit-Tests
```

Befehle (`pnpm pipeline …`):

| Befehl | ersetzt | Ergebnis |
|---|---|---|
| `init [--from DATUM]` | meta.json von Hand | `runs/<from>/meta.json` mit `from`, `to` |
| `select RUN_DIR [--batch 7] [--only id,…]` | select_providers.py | `batch-<n>.json` (Katalogeinträge im Zod-Format), `selection.json` |
| `fetch-page URL [--links] [--max-chars N]` | fetch_page.py | Textausgabe wie bisher (META, JSON-LD, FEEDS, ICAL, TEXT, LINKS) |
| `candidates fetch\|list\|keep\|add-provider RUN_DIR …` | candidates.py, stadt_vk.py, frankenkids.py, evtermine.py | `candidates/*.json`, Entwurf `raw/aggregatoren.json` |
| `validate-raw DATEI` | — | Prüfung einer Rohdatei (E5) |
| `holidays FROM TO` | holidays.py | JSON der freien Tage |
| `geocode "Adresse"` | ring.py | lat/lon, Stadtteil, Ring, Abstand |
| `build RUN_DIR` | enrich.py (ohne Route/ICS) | `data/offers.json`, `RUN_DIR/report.json` |
| `publish RUN_DIR` | — | prüft, committet, pusht (E9) |

`select` filtert nicht mehr nach Thema, Ring oder Alter, denn ein Lauf deckt immer den ganzen Katalog ab. `--only` dient dem gezielten Nachprüfen einzelner Anbieter. In kein Paket kommen: `verzeichnis`, `coveredBy`-Anbieter und alle Aggregatoren. Die mit `adapter` laufen über `candidates`, die übrigen siehe E7.

Neue Abhängigkeit (nur `devDependencies`, nie im Client): **cheerio** 1.2 (Node ≥ 20.18) für das HTML-Parsing, als Ersatz für BeautifulSoup. Die Alternativen sind schwächer: `node-html-parser` hat keinen vollständigen Selektor- und Textbaum, `linkedom` emuliert ein ganzes DOM und damit mehr als nötig. HTTP läuft über das eingebaute `fetch` von Node 24.

## Backpressure

- **Kein Netz in Unit-Tests**: `vitest.setup.ts` ersetzt `globalThis.fetch` durch eine Funktion, die wirft. Ein Kanarien-Test belegt das. Netzcode liegt ausschließlich in `scripts/pipeline/io/`.
- **dependency-cruiser**, neue Regeln:
  - `pipeline-lib-pure`: `scripts/pipeline/lib/` importiert weder `scripts/pipeline/io/`, `scripts/pipeline/cli.ts` noch `scripts/lib/`, und auch keine Node-Core-Module außer in Tests
  - `src-not-scripts`: `src/` importiert nichts aus `scripts/`
  - `no-cheerio-in-src`: `src/` importiert `cheerio` nicht
- **Coverage**: `scripts/pipeline/lib/**` fällt mit unter die Coverage-Schwelle (90 %).
- **knip**: `scripts/pipeline/cli.ts` wird Entry.
- **Schema-Drift**: `schema/raw-batch.schema.json` kommt in `export-schema.ts`. Der Hook-Hinweis „Schema geändert“ gilt auch für `scripts/pipeline/lib/raw.ts`.
- **Hook**: `validate-raw` bei `runs/**/raw/*.json` (E5).
- **Katalog schon im Bootstrap prüfen**: Solange `data/BOOTSTRAP` existiert, liest `load-data.ts` künftig den migrierten `data/providers.yaml` und prüft ihn mit leerem Angebotsbestand. So greifen Hook, `check:fast` und CI für Katalogänderungen (auch durch `add-provider`) schon im ersten Lauf.
- **Kein `fetch` in `lib/`**: Biome `noRestrictedGlobals` (`fetch`) für `scripts/pipeline/lib/**`, denn ein globales `fetch` sieht dependency-cruiser nicht.
- **Biome** ignoriert `tests/fixtures/pipeline/html` und `…/api`: Das sind fremde, absichtlich unveränderte Snapshots. Die Pipeline schreibt `data/offers.json` im Biome-Format (sie formatiert nach dem Schreiben).
- **Daten**: `validateDataset` prüft neu die Rollen, `coveredBy` und `id === offerId(offer)`. Sobald `data/BOOTSTRAP` fehlt, prüfen Hook, `check:fast` und CI den echten Bestand. Bis dahin prüft ein Test den migrierten Katalog mit `validateDataset(katalog, leeresOffersFile)`, damit auch die Rollen-Invarianten greifen.
- **Echte Daten in der UI**:
  - Das Projekt `smoke-echte-daten` stellt die Uhr auf `generatedAt` aus `data/meta.json` (nicht auf die Echtzeit, sonst würde ein alter Datenstand jeden Code-Commit rot machen; ADR 0002 sieht dafür nur eine Warnung vor). Es verlangt mindestens ein Angebot und prüft zusätzlich 320 px und 200 % Textgröße.
  - Die Fixtures bekommen ein Worst-Case-Angebot: Titel mit 140 Zeichen, der längste echte Anbietername, lange Komposita. So prüfen alle Mobile-UX-Gates auch Extremwerte.

## Tests (test-first für alle `lib/`-Module und `src/domain`-Erweiterungen)

| Modul | Testgrundlage |
|---|---|
| `migrate-catalog` | eingefrorener Altformat-Auszug mit `zoff-harmonie` (doppelter Hauptort, Ort ohne Koordinaten, `teils-kostenlos`, „0-4“), `fbs-nuernberg` (4 Orte), `ev-zerzabelshof-musikzwerge` (`covered_by`), `stadt-nuernberg-veranstaltungskalender` (`fetch`, ohne Koordinaten), `musication` („4 Mon-3 J“), `staatstheater-nuernberg-familie` („3“), `curt-termine-familie` („alle“), `familienbildung-nuernberg-0-3` (`verzeichnis`). Feldbilanz: jedes Altfeld landet in einem Zod-Feld oder in `notes`. Das Ergebnis besteht `validateDataset(katalog, leer)` |
| `schema`/`dataset` | Diskriminator, Rollen, Invarianten `coveredBy`, Rolle der Angebote, `id === offerId` |
| `ids` | Slug mit Umlauten, Kürzung an Wortgrenze, Fallback, Suffix bei `kurs`/`einmalig` |
| `time` | `fromBerlinLocal` über die Zeitumstellungen, `addDays/addMonths/isoWeekday` |
| `schedule` | wöchentlich mit Intervall, Anzahl, Ende, Ausnahmen, Ferien; monatlich n-ter/letzter Wochentag |
| `html-extract` | Snapshots: FBS-Kursliste (Ampel als `[Status: …]`), Ohana-Kursseite (JSON-LD `Course`/`CourseInstance`), CVJM-Kalender (JS-Hinweis), Feeds und Links |
| `ical` | Snapshot evangelische-termine-iCal, gefaltete Zeilen, Escapes |
| `sources/*` | Snapshots Stadt-Kalender, frankenkids, evangelische-termine inkl. „jeweils“-Reihe, Ende 00:00, String-Terminlisten, Orte außerhalb Nürnbergs, „abgesagt/entfällt“ im Titel |
| `holidays` | Snapshot OpenHolidays (Herbstferien, Augsburger Friedensfest ignoriert) |
| `ring` | Katalog-Koordinaten (Kornmarkt innen, Rosenaustraße knapp-außen, Langwasser außen, Stadtteil „Altstadt, St. …“) |
| `match` | vid-Treffer, Geo-Treffer, geteilter Ort (Rosenaustraße 7), Adress-Normalisierung, nur `anbieter`-Orte, offener Treffer |
| `draft` | Ableitungen für format (inkl. wöchentlicher Einzeltermine)/cost/registration/availability/topics, offene Pflichtfelder, abgesagt |
| `raw` (`validateRaw`) | Schemafehler mit Pfad, unbekannter Ort, Ort eines anderen Anbieters, fehlender Status, leere `summary` |
| `build-offers` | Kursfortschreibung (ID stabil), Rangfolge der Quellen, Zerlegung `einmalig`, Vereinigung `regelmaessig`, Kollision mit Fehler, Dedup Sammelkalender gegen Anbieter, Übernahme bei `fehler` (Anbieter und Aggregator), Horizontgrenzen, fehlendes Ende, Alterskappung, stabile Sortierung, Ergebnis besteht `validateDataset` |
| `select` | Paketbildung, Ausschlüsse, `--only` |

Die Snapshots wurden einmalig live geholt und liegen gekürzt unter `tests/fixtures/pipeline/` (öffentliche Seiten bzw. APIs). `tests/fixtures/providers.yaml` (fiktiv, E2E) wird auf das neue Provider-Schema gehoben.

## Skill (Orchestrator)

`SKILL.md` wird neu geschrieben. Die Beschreibung lautet „Datenstand des Zwergenplans aktualisieren“. Der Ablauf:
1. `pnpm pipeline init` → `RUN_DIR`
2. `pnpm pipeline select RUN_DIR` → Pakete
3. Parallel:
   - je Paket ein Subagent im Hintergrund, alle in einer Nachricht. Er bekommt `references/extraction.md`, `schema/raw-batch.schema.json`, den Paketpfad und den Ausgabepfad. Sein Abschluss ist `validate-raw`.
   - selbst: `candidates fetch` → `list` → `keep` (ggf. `add-provider`) → offene Felder im Entwurf füllen → `validate-raw`
4. Vollständigkeit prüfen (jeder Paket-Anbieter hat einen Status), fehlende gezielt nachprüfen (`select --only`).
5. `pnpm pipeline build RUN_DIR`. Bei Fehlern die Rohdateien korrigieren, nie das Schema lockern.
6. Katalog pflegen (Drift, neue Veranstalter) nach `src/domain/schema.ts`. `pnpm pipeline geocode` liefert Koordinaten und Ring.
7. `pnpm pipeline publish RUN_DIR`, dann `gh run watch` und Live-Prüfung.

Die Referenzen:
- `references/extraction.md` beschreibt das `RawBatch`-Format statt des alten Event-Formats (Tags → Felder, `rrule` → `schedule`, `validate-raw` als Abschluss).
- `references/provider-schema.md` wird ersetzt durch einen Verweis auf `src/domain/schema.ts` und `schema/providers.schema.json` plus die Pflegeregeln (Rollen, Orte, Koordinaten, Anmeldehinweise in `notes`).
- `booking-systems.md` bekommt die neuen Befehle. `excluded.md` bleibt.

Entfernt werden:
- alle `scripts/*.py`
- `research/` (vollständig in den Katalog eingeflossen, erhalten in Commit 4e14167)
- `ANBIETER.md`
- das Python-`README.md`, ersetzt durch eine kurze Projektbeschreibung mit Verweis auf `CLAUDE.md` und die Live-URL

## Schritte

1. **Schema**: `src/domain/schema.ts` (Provider-Union, ProviderAge, `OfferFields`, Exporte), ADR 0006 (im selben Commit wie die ID-Regel), `topics.ts` (E3), `ids.ts`, `time.ts`, `dataset.ts` (Invarianten), alles test-first. `tests/fixtures/` anpassen (Provider-Schema, Offer-IDs, Worst-Case-Angebot), `schema:export`.
2. **Migration**: `migrate-catalog.ts` test-first gegen den eingefrorenen Auszug. Danach ein Lauf über `data/providers.yaml`. Prüfen: `validateDataset(katalog, leer)` (Test) und Ring gegen `ring.ts`. Commit: Schema und migrierter Katalog. Danach Migration, Tests und Fixture löschen.
3. **Pipeline-Bibliothek** `lib/` test-first mit Snapshots, danach `io/` und `cli.ts`. Gates: depcruise-Regeln, Coverage, knip, Hook-Zweig, Netz-Sperre.
4. **Skill** neu schreiben, Python, `research/` und `ANBIETER.md` entfernen. Außerdem aktualisieren: `README.md`, `CLAUDE.md` (Abschnitt „Datenübergang“, Pipeline-Befehle), `docs/architecture.md` (Datenfluss mit Pipeline-Schichten, neue Regeln), ADR 0006 (ID-Regel, RawBatch als Zwischenformat, Katalog im Zod-Format, Zuordnung der Sammelkalender), Verweis in ADR 0003, `docs/ideas.md`.
5. `/arch-review` auf den Code-Stand, Findings einarbeiten. Commit und Push. CI läuft grün mit den Daten noch im Bootstrap-Zustand.
6. **Erster echter Lauf** nach dem neuen Skill: `init` → `select` → Subagenten + Sammelkalender → `build`. Danach `data/BOOTSTRAP` löschen und `publish`, als reinen Daten-Commit. Anschließend ein eigener Code-Commit, der den nun wirkungslosen Bootstrap-Zweig aus `scripts/lib/load-data.ts` und `CLAUDE.md` entfernt und den Smoke-Test auf „mindestens ein Angebot“ schärft.
7. **Abschluss**: CI grün auf `main` (`gh run watch`), `/browser-review live` mit echten Daten, Findings fixen. `meta.json` der Live-Seite zeigt den Commit.

## Akzeptanzkriterien

- `pnpm check:fast` grün, `pnpm check` grün. Kein `*.py` mehr im Repo.
- `data/providers.yaml` besteht `validateDataset`. Alle 83 Einträge sind erhalten, und kein Feld fehlt ersatzlos (Feldbilanz im Migrationstest).
- `pnpm test` läuft ohne Netz. Der Kanarien-Test belegt die Sperre.
- Der erste Lauf: jeder Paket-Anbieter hat einen Status, `data/offers.json` besteht `validateDataset`, die Plausibilität gegen den deployten Stand ist grün.
- Die Live-Seite zeigt echte Angebote. `/browser-review live` ist im Plan dokumentiert.

## Risiken

- **Laufkosten**: rund 60 Anbieter in etwa 9 Paketen über 4 Monate. → Pakete zu 7, Wochenregeln statt Datumslisten. Die Sammelkalender decken die Kirchengemeinden ab.
- **Seiten ändern sich**: Snapshots veralten. Das ist gewollt, sie testen den Parser, nicht die Seite. Drift meldet der Lauf.
- **Echte Daten brechen die Platzhalter-UI** (lange Titel, viele Angebote): Dagegen stehen das Worst-Case-Fixture und der geschärfte Smoke-Test (Backpressure). Fixes bleiben minimal, das Design kommt aus der Mockup-Session.
- **Zuordnung aus Sammelkalendern liegt daneben** (geteilte Orte): Der Vorschlag ist sichtbar, der Orchestrator bestätigt ihn. Die Invariante „Ort gehört zum Anbieter“ fängt grobe Fehler ab.
- **Nominatim, OpenHolidays oder Quell-APIs nicht erreichbar**: Caches und Wiederholungen. Bei `fehler` werden die Altangebote übernommen (E8).

---

## Review 1 (unabhängiger Subagent, 2026-10-04) – Verdict: „Überarbeiten“ → eingearbeitet

Der Plan oben ist bereits die überarbeitete Fassung.

**Blocker (alle übernommen)**
- B1: Ein Ort ohne Koordinaten (`zoff-harmonie`, „wechselnd, Nürnberger Wald“) ließ sich nicht migrieren. → Regel in E2: Der Ort entfällt, sein Text kommt nach `notes`, Angebote laufen über den Hauptort. Abgedeckt im Test.
- B2: Aus Sammelkalender-Kandidaten entstanden keine gültigen RawEvents (`summary`, `cost` …). → E7: `keep` erzeugt einen Entwurf mit deterministischen Ableitungen und offenen Feldern. `validate-raw` listet sie, der Orchestrator füllt sie.
- B3: Aggregatoren ohne `adapter` lieferten in Paketen nichts Gültiges. → Sie kommen in kein Paket (E7, mit Begründung).

**Major (alle übernommen)**
- M1: Doppelte Hauptorte → Orte im Abstand ≤ 25 m werden zusammengeführt (E2, Test).
- M2: Ausfall eines Sammelkalenders → Altangebote der `coveredBy`-Anbieter werden übernommen (E8).
- M3: `publish` mit fremden Änderungen im Arbeitsbaum → Abbruchbedingungen und getrennte Commits für Daten und Code (E9, Schritt 6).
- M4: zweite Zod-Quelle → `RawBatch` wird aus `Offer.shape` abgeleitet und ist in ADR 0006 als Zwischenformat festgehalten (E5).
- M5: keine Backpressure für die Ausgabe der Subagenten → `validate-raw` als Pflicht-Abschluss plus Hook-Zweig (E5).
- M6: ID-Regel nicht abgesichert → Invariante `id === offerId(offer)` (E4).
- M7: echte Daten in der UI kaum geprüft → Worst-Case-Fixture, Smoke-Test verlangt ein Angebot und prüft 320 px und 200 % (Backpressure).

**Minor**
- übernommen:
  - Match nur auf Orte von Anbietern
  - Abfrage per `vid` für `coveredBy`-Anbieter (die Gleichheit `vid` = `_user_ID` ist per Snapshot belegt)
  - volle URL statt Herkunft
  - „3“ als neue, begründete Regel; Alterskappung
  - Slug-Regeln
  - eingefrorenes Altformat-Fixture
  - Katalog-Test über `validateDataset`
  - `discriminatedUnion`
  - depcruise-Ziele erweitert, Hook-Hinweis auf `raw.ts`
  - stabile Ausgabe und Berliner Laufdatum
  - „Endzeit geschätzt“ nur im Bericht
  - korrigierte Zeilenzahlen
- übernommen aus „Scope“: `ANBIETER.md`/`providers-md` entfallen (Nicht-Ziele). `geocode` und `add-provider` bleiben, denn der erste Lauf und die Pflege brauchen sie, und `ring.py` gehört zum Portierungsauftrag.
- **abgelehnt**: `ical.js` statt eines eigenen VEVENT-Parsers. Der Parser liefert in `fetch-page` nur lesbaren Text für Agenten (Parität mit `fetch_page.py`), keine Kalenderlogik. Die 30 Zeilen sind getestet und brauchen kein Zeitzonen-Modell. `ical.js` bliebe Test-Werkzeug für die eigene ICS-Ausgabe.

## Review 2 (neuer unabhängiger Subagent, 2026-10-04) – Verdict: „Freigabe mit Änderungen“ → eingearbeitet

Die Blocker aus Review 1 sind gelöst. Die Änderungen stehen oben im Plan.

**Blocker (übernommen)**
- `Offer.pick` wirft in Zod 4 bei verfeinerten Schemas. → `OfferFields` wird unverfeinert exportiert, `RawEvent` leitet sich davon ab, `age` als `ProviderAge` mit Kappung (E5).

**Major**
- übernommen:
  - M1: Die Kurs-ID hing am zuletzt sichtbaren ersten Termin. → Kursfortschreibung mit dem Altbestand, übernommene Kurse bleiben unverändert (E4).
  - M2: Wöchentliche Einzeltermine aus Sammelkalendern wurden zu einer Flut von `einmalig`. → Erweiterte Formatableitung (E7).
  - M3: Der Hauptort als Fallback verortete Angebote falsch. → Der Agent legt einen Ort an, wenn ein Treffpunkt bekannt ist. `kath-stadtkirche-familiengottesdienste` wird Aggregator (E2).
  - M4: Die Dedup zwischen Sammelkalendern war unklar. → Feste Rangfolge mit Test (E7).
  - M5: Der Smoke-Test hing an der Echtzeit. → Die Uhr läuft auf `generatedAt` (Backpressure).
- **abgelehnt** M6 (Wegzeit und Ad-hoc-Bericht entfallen): Der Auftrag für diesen Plan legt ausdrücklich fest, dass `report.py`, `ics.py` und `route.py` entfallen, weil die Website und ADR 0005 sie ersetzen. Der Skill verweist bei Ad-hoc-Fragen auf die Website bzw. `data/offers.json` (Nicht-Ziele).

**Minor**
- übernommen:
  - „0-12“ als Jahre per Ausnahmeliste
  - ADR 0006 im Schema-Commit
  - Katalogprüfung schon im Bootstrap
  - `count`-Kurse über `to` hinaus, Ferien über den ganzen Regelzeitraum
  - feste Vereinigungsregel
  - fehlendes `offers.json` = leer
  - `noRestrictedGlobals: fetch` in `lib/`
  - „abgesagt/entfällt“ bei evangelische-termine
  - feste Zuordnung Paket ↔ Rohdatei
- **abgelehnt**: ein Perf-Fixture mit etwa 300 Angeboten. Die Platzhalter-Liste wird durch das Design der Mockup-Session ersetzt, und Listenlänge bzw. Virtualisierung gehören in diesen UI-Plan (Eintrag in `docs/ideas.md`). Bis dahin prüft der Smoke-Test die echten Daten auf Funktion und Mobile-UX.

## Arch-Review (2026-10-04) – Verdict: „Nacharbeit nötig“, keine Blocker → eingearbeitet

- M1: `select --only` hätte ein fertiges Paket überschrieben. → Nachprüfpakete bekommen die nächste freie Nummer (`nextBatchFiles`, getestet). Ein erneutes `select` ohne `--only` braucht `--force`.
- M2: Die Kursfortschreibung übernahm auch künftige Alttermine (verlegte Termine doppelt). → Nur vergangene Termine vor dem ersten neuen Termin werden übernommen, mit Test.
- M3: Ein komplett vergangener Kurs ließ den ganzen `build` scheitern. → Er entfällt mit Hinweis, und `validate-raw` warnt.
- M4: Logik in `cli.ts` (`add-provider`). → `providerFromCandidate` in `lib/draft.ts`, getestet.
- Minor, alle übernommen:
  - Zod an den IO-Grenzen (`lib/run.ts`, Nominatim, Paketdateien) statt `as`-Casts
  - Ferien-Cache ohne leere Antworten, mit 30 Tagen TTL für laufende und künftige Jahre
  - Expansion ab Horizontbeginn für Regeln ohne `count`
  - Slug mit NFC
  - fehlende Stunde beim geschätzten Ende und bei Anmeldefristen
  - nächstgelegener Ort beim Geo-Treffer
  - `vidOf` nur noch an einer Stelle
  - Doku-Drift bei E8
  - gleiche Kurs-ID: Termine werden vereinigt

## Erster Lauf (2026-10-04)

- 9 Pakete mit 62 Anbietern (Subagenten) plus 19 Termine aus den Sammelkalendern. Ergebnis: 333 Angebote mit 2 889 Terminen. 54 Anbieter ok, 7 ohne Termine, kein Fehler. Neu im Katalog ist IMILUV Studio (über `add-provider`). Entfernt wurde der eckstein-Treff, denn die Kinder werden dort separat betreut.
- Gefunden und behoben:
  - Kollision gekürzter Titel bei regelmäßigen Angeboten, jetzt Fehler in `validate-raw`/`build`
  - Dubletten über Anbietergrenzen (HebAnne in der FamilienBox, Yoga bei Hebammen in Johannis/Wolf Pack Yoga), jetzt Hinweis in `build` plus Regel in `extraction.md`
  - Stadt-Kalender: `[]` je Termin, falscher charset-Header, weiche Trennzeichen
- Ohne verbundenen Browser blieben die Plätze bei Eversports, Calendly und Kurabu `unbekannt`. Die Termine selbst waren lesbar.

## Browser-Review (live, echte Daten, 2026-10-04)

Screenshots `e2e/.artifacts/screens/{320,iphone,pixel,quer}-{light,dark}.png` und `live-gefiltert-320.png`. Die Live-Interaktion lief per Playwright, weil claude-in-chrome nicht verbunden war. Ergebnis:
- Filter Kurs → 170, Kurs + Einmalig → 216, Geburtsdatum 15.04.2026 → 102 Angebote. Der Zustand überlebt ein Neuladen, das Datum steht nicht in der URL.
- ICS-Link: 200, `text/calendar`, 6 VEVENTs, UIDs nach ADR 0003/0006, gefaltet auf 75 Oktette.
- Angebote nach 0,76 s sichtbar (`site.json` 84 KB gzip), kein Konsolenfehler, Scrollbreite bei 320 px = 320.

Checkliste:
- **Lesbarkeit**: Kontrast und Hierarchie sind gut, was/wann/wo ist sofort erfassbar. **„Frei?“ fehlt auf der Karte**, die Daten haben `availability` → `docs/ideas.md` (UI-Plan).
- **Daumen-Erreichbarkeit**: Die Filter liegen oben, die Kartenaktionen mittig mit ausreichendem Abstand. Für die Platzhalter-UI in Ordnung, die Anordnung kommt aus der Mockup-Session.
- **Zustände**: Laden („Lade Angebote …“) ist sichtbar und kurz. Lange Titel und Anbieternamen brechen sauber um, ohne Überlauf. Der Leerzustand ist per E2E abgedeckt.
- **Dark Mode**: keine grellen Flächen, Primärbutton gut lesbar.
- **Micro-Interactions**: Der gedrückte Filter-Chip ist deutlich (gefüllt). Reduzierte Bewegung ist per E2E abgedeckt. Mehr bringt erst das Design.
- **Konsistenz**: Ein Design-System gibt es noch nicht.
- Weitere Befunde:
  - Laufende Kurse stehen oben, weil nach dem ersten Termin sortiert wird, z. B. „Babymassage + Babyyoga … bis 06.10.“ mit 1 Resttermin. Sortierung nach dem nächsten Termin und ein Hinweis auf den Einstieg → `docs/ideas.md`.
  - `scripts/screenshots.ts` löste vor dem Laden der Daten aus (`quer-dark`). Behoben: Es wartet jetzt, bis die Daten geladen sind.
