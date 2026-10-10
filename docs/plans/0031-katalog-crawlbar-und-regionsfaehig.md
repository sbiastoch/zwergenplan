# Plan 0031 – Katalog crawlbar und regionsfähig

Status: in Umsetzung (2026-10-10; Plan-Review Durchgang 1 „Überarbeiten“ und Durchgang 2 „Freigabe mit Änderungen“, beide eingearbeitet; Phase a umgesetzt)
Datum: 2026-10-10
Voraussetzung: Plan 0030 (Katalog entrümpeln, live bzw. auf demselben Branch). Reihenfolge zu Plan 0015, Nachtrag A (stabile IDs, migriert `providers.yaml` ebenfalls um `publicId`): unabhängig; wer zuerst kommt, wird vom anderen gemergt.
Bezug: ADR 0006 (Katalog im Zod-Vertrag), ADR 0016 (Entwurf, nächtliche Pipeline), ADR 0022 (Entwurf, stabile IDs), ADR 0024 (Katalog beschreibt Quellen), Plan 0015 (nächtliche Pipeline, der Crawler), Plan 0030 (Katalog entrümpeln, Vorgänger); neu: ADR 0025

## Anlass

Nutzer am 2026-10-10, nach Plan 0030:

> „Ziel ist das Datenmodell sauber zu bekommen, damit darauf aufbauend das Crawling gut gebaut werden kann. Orte müssen dabei nicht normalisiert werden, die dürfen ruhig denormalisiert am Anbieter hängen. Da gibt es zu wenig Overlap. Plan ist aber auch so, dass man es noch weiter um andere Orte später erweitern könnte, zum Beispiel Düsseldorf oder Oldenburg oder so.“

Zwei Analysen vom 2026-10-10 (Subagenten, nur lesend) liefern die Befunde.

### Befunde Crawling (gegen Plan 0015)

Der Katalog hat 83 Einträge mit 223 Programm-URLs (html 157, js 28, ical 24, json-api 8, pdf 6). 222 davon tragen `programme.note`, dazu kommen 186 Einträge in `notes`.

| | Befund | Quelle der Anforderung |
|---|---|---|
| K1 | `programme.note` mischt Abrufhinweise (19 × JS/Browser, 4 × Sperre/403, 4 × Paginierung, 4 × URL-Umbau, 1 × POST/GraphQL), Filteranweisungen (15) und veraltende Inhalte („nächster: So 08.11.2026“). Ein Crawler braucht die Abrufhinweise als Felder; veraltende Inhalte gehören nicht in den Prompt. | Plan 0015, E4 und E5 (`inputHash` über den Katalogauszug samt Notizen) |
| K2 | `notes` ist Rechercheprotokoll („war am Prüftag nicht erreichbar“, „ab 13.10. neu prüfen“), Ortshinweise (42 × „Ort X: …“), Anmeldefenster (10) und Inhalt. Fließt es in Prompt und Hash, löst jede Pflegeänderung eine neue Extraktion aus und veraltete Angaben widersprechen „Werte werden nie geraten“. | Plan 0015, E5 |
| K3 | `kind: js` vermischt Format (HTML) und Abrufart (im Browser rendern). Gesperrte Seiten (Eversports 403 × 6, Calendly, Login) stehen nur als Text. | Plan 0015, E4, R3 |
| K4 | POST-Abfragen (Kursorganizer-GraphQL, 2 Einträge: `nuebad-flipper`, `schwimmschule-wassermaeuse-nuernberg`) stehen als Freitext, samt Headern und Filter. | Plan 0015, E4 („Schemaänderung … `request`“) |
| K5 | 6 URLs tragen feste Daten oder einen Platzhalter `FROM` statt `{von}`/`{bis}`; das Schema kennt keine Platzhalter. | Plan 0015, E4; ADR 0016 |
| K6 | Seiten ohne Termine (Linkhubs, Erklärseiten, Browser-Ansichten; 7) stehen gleichrangig neben Terminseiten und gingen in Abruf und Prompt. | Plan 0015, E2 (Eingabegrenze), R4 |
| K7 | 4 von 7 `aggregator` haben keinen `adapter`. Der Nachtlauf ruft nur Adapter ab und fragt das Modell nur je Anbieter, diese 4 crawlt also niemand. | Plan 0015, E1 |

### Befunde Region

| | Befund |
|---|---|
| R1 | `Geo` prüft fest gegen `NUERNBERG_BBOX` (`src/domain/geo.ts`, `schema.ts`). Ein Ort in Düsseldorf wäre ein Validierungsfehler. |
| R2 | `Venue.ring` (innen/knapp-aussen/aussen) misst den Abstand zur Nürnberger Stadtmauer (`scripts/pipeline/lib/ring.ts`). Es ist Pflicht, wird aber nirgends gelesen: `toSiteData` reicht es nur in `site.json` durch, keine Ansicht nutzt es. |
| R3 | Ferien und Feiertage kommen fest aus `DE-BY` (`scripts/pipeline/lib/holidays.ts`, `io/holidays.ts`), der Cache hat keinen Länderschlüssel. |
| R4 | Kein Katalog-Eintrag sagt, zu welcher Region er gehört. Anbieter- und Orts-IDs sind global eindeutig (`validateDataset`), Kollisionen fielen also rot auf; ein Präfix ist nicht nötig. |
| R5 | Nicht im Datenvertrag, erst bei einer echten zweiten Region: Fahrplanauszug und Wegzeit (VGN, ADR 0011), Stadtteile (`districts.ts`), Kamera-Startpunkt, Texte („in Nürnberg“), Sammelkalender-Adapter (Nürnberger Quellen), Geocoding-viewbox. |

## Ziel

1. **Der Katalog ist ausführbar.** Ein Crawler liest aus Feldern, welche Seite er wie abruft und wozu. Was nur Protokoll ist, steht getrennt und geht weder in den Prompt noch in den Cache-Schlüssel.
2. **Der Datenvertrag ist regionsfähig.** Eine zweite Region braucht einen Eintrag in einer Registry und Katalog-Einträge mit `region`, keinen Umbau des Schemas. Heute gibt es genau eine Region, `nuernberg`.
3. Orte bleiben denormalisiert am Anbieter (Nutzerentscheid, ADR 0024).

## Nicht-Ziele

- **Eine zweite Region bauen.** R5 bleibt, wie es ist, und steht als Restpunkt in `docs/ideas.md`.
- **Den Crawler selbst** (Plan 0015): `ProviderRaw`, `data/raw/`, Abrufcode, Prompt. Dieser Plan liefert nur das Modell, auf dem er aufsetzt, und zieht Plan 0015 nach (E7).
- **Stabile Kurz-IDs und `publicId`** (Plan 0015, Nachtrag A; ADR 0022): eigener Schritt, unverändert.
- **`Offer` und `data/offers.json`**: unverändert, alle IDs bleiben (die Orts-IDs auch, also auch die Angebots-IDs).
- Umbenennung `verified` → `reviewed`, Notizen je Ort, Anmeldefenster als Feld, `AGGREGATOR_ADAPTERS` und `SOURCES` zusammenführen: kann warten (`docs/ideas.md`).

## Entscheidungen

### E1 Region-Registry und Feld `region`

- Neues Modul `src/domain/regions.ts`, rein, ohne Zod:
  ```ts
  export const REGION_IDS = ["nuernberg"] as const;
  export type RegionId = (typeof REGION_IDS)[number];
  export const REGIONS: Record<RegionId, Region> = {
    nuernberg: { name: "Nürnberg", bbox: NUERNBERG_BBOX },
  };
  ```
  `Region` = `{ name: string; bbox: BBox }`. Mehr Felder (Ferienland, Zeitzone, ÖPNV-Feed, Startpunkt der Karte) kommen erst mit einer zweiten Region, weil heute nichts sie liest (Review 2 m9). `NUERNBERG_BBOX` bleibt in `geo.ts` (der Startpunkt-Check in `src/data` nutzt ihn, ADR 0017 und ADR 0010); die Registry verweist darauf.
- **Pflichtfeld `region`** an jedem Katalog-Eintrag aller drei Rollen, `z.enum(REGION_IDS)`. Auch Sammelkalender und Verzeichnisse sind regional.
- Kein Cast: `Record<RegionId, Region>` erzwingt, dass jede ID einen Eintrag hat. `inBounds(point, bbox = NUERNBERG_BBOX)` bekommt die bbox als Parameter; die übrigen Aufrufer (Startpunkt, Fahrplan) bleiben unverändert.
- **Geo-Prüfung wandert vom Typ an den Anbieter:** `Geo` prüft nur noch gültige Koordinaten (lat −90…90, lon −180…180). Ein `superRefine` am `anbieter` prüft jeden Ort gegen `REGIONS[region].bbox` („Ort außerhalb der Region nuernberg“). `Timetable` prüft weiter gegen `NUERNBERG_BBOX`; ein Auszug je Region kommt mit R5.
- **Kein Präfix in IDs** (R4, ADR 0022 Punkt 5).

### E2 `ring` entfällt

- `Venue.ring` wird aus Schema, Katalog, Fixtures, `SiteOffer.venue` und `toSiteData` gestrichen; `scripts/pipeline/lib/ring.ts` samt Test entfällt; `providerFromCandidate` und `pipeline geocode` setzen es nicht mehr. Mitbetroffen: Tests mit `ring` in Fixtures (`ids.test.ts`, `format.test.ts`, `use-offer-views.test.ts`, `site-data.test.ts`, `draft.test.ts`), Skill `references/catalog.md` und Notizen im Katalog, die `ring` begründen (bleiben als Protokoll stehen).
- Begründung: Nürnberg-Semantik im Vertrag, die niemand liest (R2). Brauchte die UI später eine Entfernungsstufe, rechnete sie sie aus `geo` und dem Startpunkt (wie die Wegzeit).
- Alte `site.json` im Cache mit `ring` und neuer Code: das Feld wird ignoriert. Alter Code mit neuer `site.json`: liest `ring` nicht (geprüft in `src/` und `e2e/`). Kein Übergangsfeld nötig.

### E3 `programme` wird ausführbar

Neues Schema je Programmeintrag:

| Feld | Typ | Bedeutung |
|---|---|---|
| `url` | URL, darf `{von}` und `{bis}` enthalten | Als Platzhalter gilt `{name}` aus Buchstaben und `_`; ein anderer Name ist ein Fehler („nur {von} und {bis}“). JSON- und GraphQL-Klammern (mit Anführungszeichen, Leerzeichen, Doppelpunkt) sind keine Platzhalter (Review 2 B1). In URLs von Sammelkalendern mit `adapter` kein Platzhalter: deren Fenster setzt der Adapter (Review 2 m7). Ersetzt wird durch die reine Funktion `fillPlaceholders(text, window)` in `scripts/pipeline/lib/placeholders.ts`: `{von}` = Monatsanfang des aktuellen Monats, `{bis}` = Monatsanfang 13 Monate später (Plan 0015, E4). `pipeline fetch-page` nutzt sie schon jetzt, damit der Skill die URLs abrufen kann. |
| `kind` | `html \| pdf \| ical \| json-api` | Format der Antwort. `js` entfällt. |
| `render` | `"browser"`, optional | Seite braucht JavaScript; der Crawler rendert sie (Plan 0015, E4). Ersetzt `kind: js` (28 Einträge → `kind: html, render: browser`). |
| `use` | `termine \| verfuegbarkeit \| info` | Wozu die Seite dient. Nur `termine` und `verfuegbarkeit` gehen in Abruf und Prompt; `info` ist Doku für die Katalogpflege (Linkhub, Erklärseite). Pflicht. |
| `request` | `{ method: "POST", headers?: Record<string,string>, body: string }`, optional | Wie in Plan 0015, E4 vorgesehen. `body` darf `{von}`/`{bis}` enthalten (gleiche Regel wie `url`) und muss nach dem Einsetzen eines Datums gültiges JSON sein. Die zwei Kursorganizer-Einträge baut **der Umsetzer von Hand** aus der Notiz und prüft sie einmal per `curl` (Ergebnis in diesen Plan); die Subagenten fassen `request` nicht an (Review 2 M3). |
| `blocked` | `{ reason: string, since: IsoDate }`, optional | Seite ist **mit Abrufbeleg** gesperrt (Login, Bot-Schutz auch im Browser). Bedeutung für den Crawler: Der Anbieter ist bewusst ohne diese Quelle; der Bericht nennt ihn jede Nacht. Ein 403 „nur per Skript“ ist kein `blocked`, sondern `render: browser` (Eversports, 6 Einträge); ob es auch dort scheitert, klärt Plan 0015, Schritt 5 per `pipeline fetch`. |
| `hint` | String, optional, höchstens 200 Zeichen, ohne Datumsangaben | Kurzer Extraktionshinweis für das Modell („nur Gruppen ‚ab 0‘ und ‚ab 1‘“, „Termine stehen im Abschnitt Krabbelgruppen“). Ersetzt `note`. Die Prüfung „ohne Datum“ ist ein Regex auf `\d{1,2}\.\d{1,2}\.` und `\d{4}-\d{2}-\d{2}`. |

- `note` entfällt. Ihr Inhalt wandert je nach Art (E6) nach `hint`, nach `notes` des Anbieters (Protokoll, Inhalt) oder in die Felder `render`, `blocked`, `request` und die URL.
- **`Venue.hint`** (gleiche Regeln wie `programme[].hint`): Extraktionshinweis zu einem Ort, den der Crawler liest („Babymassage freitags, Krabbelgruppen“). Die 42 Notizen „Ort X: …“ wandern dorthin, wenn der Ort eindeutig ist; sonst bleiben sie in `notes`. Grund: Ab E4 liest der Crawler `notes` nicht, die Ortshinweise helfen aber bei der Zuordnung von Terminen zu Orten (Review 2 M6). `toSiteData` reicht `hint` nicht an die App weiter (`Pick<Venue, …>`).
- Paginierung mit stabilen URLs: je Seite ein eigener Programmeintrag (Plan 0015, E4).
- Regel am Eintrag: Ein `anbieter` **ohne** `coveredBy` braucht mindestens einen Eintrag mit `use: termine` **ohne** `blocked` (sonst hat der Crawler nichts zu holen). Verletzt ein Eintrag das nach der Migration, entscheidet der Umsetzer je Fall vor Phase c: Seite doch abrufbar machen (`render`), `coveredBy` setzen, oder den Anbieter mit Grund nach `references/excluded.md` (Review 2 m8). `programme` bleibt bei allen Anbietern Pflicht (≥ 1): Bei `coveredBy` liest die Pipeline daraus die `vid` für evangelische-termine (`cli.ts` `anbieterVids`, `match.ts` `vidOf`).
- Neue Prüfung in `validateDataset`: `coveredBy` auf einen Sammelkalender mit `adapter: evtermine` verlangt mindestens eine Programm-URL mit `vid=` (sonst fiele der Anbieter still aus Abfrage und Zuordnung).
- Paginierung mit Sitzungs-Parametern (TYPO3-`cHash`, `pageindex` mit Komponenten-ID; 2 Einträge): bleibt ein Eintrag für Seite 1, dazu ein Protokolleintrag in `notes` („Folgeseiten nur mit Sitzungs-Parametern, der Crawler liest Seite 1“). Ein Mechanismus „Links folgen“ ist Plan 0015 ausdrücklich nicht.

### E4 `notes` ist Protokoll

- `notes` (Liste, seit Plan 0030) ist ausdrücklich **Rechercheprotokoll und Hintergrund für Menschen**. Der Crawler liest es nicht: kein Prompt, kein `inputHash`. Das steht in ADR 0025 und in Plan 0015 (E7), denn den Eingabe-Bauer schreibt Plan 0015.
- Was der Crawler wissen muss, steht in Feldern: `programme[].hint`, `availability.how`/`system` (Wissen über die Quelle, bleibt Freitext und geht in den Prompt).

### E5 Rollen

- `aggregator` verlangt `adapter` (Pflicht). Ein Sammelkalender ohne Adapter ist für die Pipeline eine Quelle zur Katalogpflege, also `verzeichnis`. Die 4 Einträge aus K7 werden `verzeichnis`, ihre Notiz sagt warum.
- `coveredBy` zeigt weiter nur auf einen `aggregator` (`validateDataset`). Die Regel „aggregator braucht adapter“ macht damit jedes `coveredBy` abrufbar.
- `scripts/pipeline/lib/select.ts` unterscheidet heute Sammelkalender mit und ohne Adapter; der Zweig „ohne Adapter“ entfällt.
- Fixture `sammelkalender-beispiel` bekommt `adapter: frankenkids` (bleibt `aggregator`, `site-data.test.ts` braucht den Fall).

### E6 Migration (mit Subagenten)

Deterministisch, per Skript `scripts/migrate-0031.ts` (wie in Plan 0030 committet und im Folge-Commit gelöscht):
1. `region: nuernberg` bei allen 83 Einträgen (Position direkt nach `role`).
2. `ring` aus allen Orten löschen.
3. `kind: js` → `kind: html` + `render: browser`.
4. Die 4 Sammelkalender ohne `adapter` → `role: verzeichnis`.

Mit Urteil, per Subagenten: Für jede der 223 Programm-URLs und 186 Notizen ist zu entscheiden, wohin der Inhalt gehört. Ablauf:
1. Ein Skript schreibt je Anbieter einen Auszug (`id`, `role`, `coveredBy`, `adapter`, `verified`, `availability`, `programme`, `venues` mit `id` und `name`, `notes`) nach `runs/0031/in/<id>.json` (`runs/` ist nicht versioniert). Die zwei Kursorganizer-Einträge bekommen keine Subagenten (Review 2 M2, M3).
2. **4 Subagenten parallel**, je ein Viertel der Einträge, mit der Anleitung aus Anhang A (wörtlich übergeben). Ausgabe je Eintrag: `programme`, `notes`, `venueHints` (`{ <venueId>: hint }`), `placeholders`. Jeder schreibt je Eintrag `runs/0031/out/<id>.json` mit den neuen Feldern `programme` (nach E3) und `notes` (Liste). Regeln: nichts erfinden, keinen Inhalt verlieren (was nicht in ein Feld passt, wird Notiz), `hint` ohne Datum, `use` begründet aus `note`/URL, im Zweifel `termine`.
3. Ein Skript (`migrate-0031.ts --apply runs/0031/out`) setzt die Felder per `yaml.parseDocument` ein. Es bricht ab (rot, nicht nur „gelistet“), wenn (Review 2 M4):
   - die Mengen in `in/` und `out/` verschieden sind oder `out` gegen ein striktes Zod-Schema verstößt;
   - eine alte URL fehlt, außer sie steht in der erklärten Platzhalter-Zuordnung (`placeholders`: alte URL → neue URL);
   - `kind` oder `render` einer bestehenden URL sich ändern, außer `render: browser` wird bewusst gesetzt;
   - die alten `notes` kein exaktes Präfix der neuen sind;
   - ein Teil der alten `note` (Trennung nur an `; ` und ` – `, Teile unter 6 Zeichen zählen nicht) nicht wörtlich in `hint`, `notes`, `venueHints`, `blocked.reason` oder einer URL steht;
   - die Regeln aus Phase c (`use` überall, Terminseite ohne `blocked`) verletzt sind (Probelauf).
   Unit-Tests für jede dieser Abbruchregeln gehören zu Test 8. Außerdem gilt:
   - Schema grün (Phase b, also noch mit erlaubtem `note`/`js`).
4. Ein **fünfter Subagent** prüft adversarial eine Stichprobe von 20 Einträgen gegen den alten Stand (Inhalt verloren? `use` falsch? Datum in `hint`?).
5. Der Umsetzer liest den vollständigen Diff aller Einträge mit `blocked`, `request`, Platzhaltern, `render` und `use: info` selbst (das Skript druckt die Liste der IDs).

### E7 Plan 0015 nachziehen

Plan 0015 bekommt einen „Nachtrag B (Plan 0031)“, ohne den bestehenden Text zu ändern (er ist freigegeben und gehört einem anderen Arbeitsstrang). Er nennt:
- **E4:** `render: browser` statt `kind: js` (auch im Eval-Tag `js` aus Plan 0015, E8); `use: info` wird nicht abgerufen; `blocked` wird nicht abgerufen, der Anbieter geht trotzdem ans Modell (bewusst ohne diese Quelle) und steht im Bericht; Platzhalter über `fillPlaceholders` (gibt es schon); `request` gibt es schon im Schema.
- **E3 (Eingabe):** Der Prompt bekommt je Seite `hint`, je Ort `Venue.hint`, dazu `availability.how`/`system`; `notes` nie. Die Ortshinweise aus `notes` entfallen damit nicht still, sie stehen in `Venue.hint` (Review 2 M6).
- **E5:** Der `inputHash` umfasst den Katalogauszug **ohne** `notes` (ersetzt „samt Orten und Notizen“).
- **Schritt 4:** Schemafeld `request`, Platzhalter und `fillPlaceholders` entfallen (erledigt durch Plan 0031); der POST-Abruf selbst bleibt Aufgabe von Plan 0015 (heute kann `fetch-page` nur GET).
- **Schritt 5:** Ausnahmen stehen künftig als `blocked` mit Abrufbeleg, nicht in `notes`.

### E8 Feiertage je Region – gestrichen (Review M5)

`loadFreeDays` (`io/holidays.ts`) und `freeDays` (`lib/holidays.ts`) bleiben fest auf `DE-BY`. Heute liest nichts die Region; ein umbenannter Cache bräche den Nachtlauf (Plan 0015, E2: ohne Cache Exit 1). Gehört zu R5 und steht in `docs/ideas.md`.

## Tests (test-first)

1. `dataset.test.ts`: fehlendes `region` → Fehler; unbekannte Region → Fehler; Ort außerhalb der bbox der Region → Fehler mit Region im Text; `ring` am Ort → Fehler (strict).
2. Phase a, `dataset.test.ts`, Programm: `{foo}` in URL oder `request.body` → Fehler, `{von}`/`{bis}` gültig; `hint` mit „08.11.“ → Fehler (Heuristik, siehe unten); `request` ohne `body` → Fehler; `blocked` ohne `since` → Fehler; `coveredBy` auf evtermine-Kalender ohne `vid=`-URL → Fehler.
3. Phase c, `dataset.test.ts`: `kind: js` → Fehler; `note` → Fehler (strict); Programmeintrag ohne `use` → Fehler; `anbieter` ohne `coveredBy` mit nur `use: info` oder nur gesperrten Terminseiten → Fehler; `aggregator` ohne `adapter` → Fehler.
   Der Datums-Check in `hint` ist eine Heuristik (`\d{1,2}\.\d{1,2}\.` und ISO-Datum): „8. November“ rutscht durch, „9.30.“ würde rot. Akzeptiert; die Anleitung verbietet Daten ohnehin.
4. `regions.test.ts`: jede Region hat eine bbox mit min < max und eine Subdivision `DE-XX`.
5. `placeholders.test.ts`: `{von}`/`{bis}` aus einem Stichtag (Monatsanfang, +13 Monate, Jahreswechsel), andere Klammern bleiben unberührt. Der Stichtag ist ein Berliner Kalendertag (`today()` in `cli.ts`); die Funktion rechnet nur mit dem String, also ohne Zeitzonenfehler (Review 2 m3).
6. `draft.test.ts`: `providerFromCandidate` schreibt `region` (aus dem Sammelkalender, sonst `nuernberg`), kein `ring`, `programme[0].use: termine`.
7. `site-data.test.ts`: Die vorhandene Schlüsselprüfung der Anbieterübersicht bekommt `region`; `SiteOffer.venue` ohne `ring` sichert tsc über `Pick<Venue, …>`.
8. Migration: Unit-Test für die deterministischen Schritte auf einem kleinen YAML-Text und für jede Abbruchregel aus E6.3 (im selben Commit wie das Skript, mit ihm gelöscht).
9. `draft.test.ts`: Kandidat aus evangelische-termine mit `organizerId` → zusätzliche Programmseite `…/ical?vid=<id>`, und der Eintrag besteht `validateDataset` (Review 2 M5).

## Schritte

Drei Phasen, jede endet grün und mit Commit (Review B1: Erweitern, Migrieren, Verengen).

1. Plan, `/plan-review`, Commit.
2. **Phase a – Erweitern.** ADR 0025 als Entwurf im selben Commit (Review 2 m4). Tests 1, 2, 4, 5, 6, 7 rot. Schema: `region` Pflicht, `ring` gestrichen, neue Programmfelder `render`, `use`, `request`, `blocked`, `hint` **optional**, `note` und `kind: js` **noch erlaubt**, Platzhalter-Regel, evtermine-vid-Regel. `regions.ts`, `placeholders.ts`, `fetch-page` mit Platzhaltern. Deterministische Migration (E6, 1–3) auf Fixtures und echte Daten; Schritt 4 (Rolle) erst in Phase c. `pnpm schema:export`. Fertig: `pnpm verify` grün, `pnpm data:validate` grün, `pnpm e2e:local --affected` (Fixtures und `site-data.ts` ändern sich; Review 2 m6). Commit.
3. **Phase b – Migrieren.** Subagenten-Migration (E6, Ablauf 1–5) auf `data/providers.yaml`; Fixtures von Hand (7 Programmeinträge). Fertig: Prüfskript ohne offene Abweichung, `pnpm data:validate` grün, Diff gelesen. Commit.
4. **Phase c – Verengen.** Test 3 rot. Schema: `use` Pflicht, `note` und `kind: js` verboten, Regel „Terminseite ohne `blocked`“, `aggregator` verlangt `adapter`; die 4 Sammelkalender ohne Adapter werden `verzeichnis` (E6, Schritt 4); `select.ts` ohne den Zweig. `pnpm schema:export`. Fertig: `pnpm verify` grün. Commit.
5. **Doku.** ADR 0025; Statuszeilen von ADR 0003 (Geo-Prüfung je Region), ADR 0006 und ADR 0024 (Punkt 2: `adapter` ist Pflicht); `docs/architecture.md` (Modulliste `src/domain`: `regions.ts`); Skill `references/catalog.md` und `references/extraction.md` (Felder `use`, `render`, `hint`, `blocked`, `request`, Platzhalter; `notes` ist Protokoll, nie mit Datumswerten im `hint`); Plan 0015 Nachtrag B (E7); `docs/ideas.md` (R5 mit Feiertagen je Region, Kann-warten-Punkte). Fertig: `check-docs` grün.
6. **Prüfen.** `pnpm verify`, `pnpm e2e:local --affected` und `--smoke` (Datenänderung, CLAUDE.md), `/arch-review`. Kein `/browser-review`, solange keine Ansicht sich ändert (nur `ring` fällt aus `site.json`).
7. Commit, Push.

## Risiken

- **Inhalt geht bei der Subagenten-Migration verloren oder wird falsch eingeordnet.** Dagegen: Prüfskript (E6.3), adversariale Stichprobe (E6.4), eigener Blick auf alle Sonderfälle (E6.5); `git diff` bleibt die Rückfallebene.
- **Konflikt mit Plan 0015 Nachtrag A** (`publicId` am `anbieter`): beide ändern den `anbieter`-Zweig. Ein späterer Merge setzt ein Feld dazu.
- **`site.json` ohne `ring`**: Kein Leser bekannt; Test 7 sichert das.
- **Platzhalter-URLs**: Bis der Crawler sie ersetzt, sind die 6 URLs im Skill nicht direkt aufrufbar. Der Skill-Text sagt, wie sie zu lesen sind (Monatsanfang bis +13 Monate).

## Anhang A – Anleitung für die Migrations-Subagenten (wörtlich übergeben)

> Du migrierst Programmeinträge und Notizen von Anbietern im Katalog `data/providers.yaml` des Projekts Zwergenplan (Angebote für Kinder unter 3 in Nürnberg). Lies `docs/plans/0031-katalog-crawlbar-und-regionsfaehig.md`, Abschnitte E3 und E4. Deine Eingabe sind die Dateien `runs/0031/in/<id>.json` aus deiner Liste. Schreibe je Datei `runs/0031/out/<id>.json` mit genau vier Schlüsseln: `programme` (Liste), `notes` (Liste von Strings, darf leer sein; leer wird beim Einsetzen zu „kein Feld“), `venueHints` (Objekt, darf leer sein) und `placeholders` (Objekt alte URL → neue URL, darf leer sein). Ändere sonst nichts, auch nicht `data/providers.yaml`.
>
> **Pro Programmeintrag:**
> - Was schon steht (`url`, `kind`, `render`), übernimmst du unverändert (Phase a hat `kind: js` schon in `kind: html` + `render: browser` umgestellt). In URLs von Sammelkalendern mit `adapter` setzt du keine Platzhalter. Ausnahme: Steht in der URL ein fester Zeitraum oder ein Platzhalter wie `FROM`, `START_DATUM=2026-10-01`, setze `{von}` bzw. `{bis}` ein (`{von}` = Beginn, `{bis}` = Ende des Abfragefensters). Nur wenn die `note` das ausdrücklich verlangt oder der Wert offensichtlich ein Datum des Abfragefensters ist.
> - `use`: `termine`, wenn die Seite Termine oder Gruppen mit Wochentag/Uhrzeit enthält oder die `note` sie dort verortet; `verfuegbarkeit`, wenn die Seite nur freie Plätze zeigt (Buchungswidget ohne eigene Termine); `info` für Linkhubs, Erklärseiten, Standortübersichten, Seiten „keine Termine“. Im Zweifel `termine`.
> - `render: "browser"` setzt du zusätzlich nur, wenn die `note` sagt, die Seite sei nur im Browser lesbar, obwohl `kind: html` (dann setze es und lass `kind` stehen). Eversports-Seiten mit „403 per Skript“ bekommen `render: "browser"`, **nicht** `blocked`.
> - `blocked`: nur, wenn die `note` belegt, dass die Seite auch im Browser nicht lesbar ist (Login nötig, Kalender nur nach Anmeldung). `reason` ist der wörtliche Teil der `note`, `since` das `verified`-Datum des Anbieters.
> - `request` setzt du nie (das macht der Umsetzer von Hand).
> - Ortshinweise („Ort WunderWerk: Babymassage Fr, Krabbelgruppen“): Ist der Ort eindeutig einer `venues[].id` zuzuordnen, kommt der Teil nach dem Doppelpunkt wörtlich in `venueHints[<venueId>]` (höchstens 200 Zeichen, ohne Datum); sonst bleibt die Notiz nur in `notes`.
> - `hint`: höchstens 200 Zeichen, **ohne jedes Datum**, nur was ein Extraktionsmodell beim Lesen dieser Seite braucht (Filter wie „nur Gruppen ‚ab 0‘ und ‚ab 1‘“, „nach ‚ab 2‘ filtern“, „Termine im Abschnitt Krabbelgruppen“, „enthält auch Röthenbach a. d. Pegnitz (nicht Nürnberg)“).
> - Alles andere aus der `note` (Inhaltszusammenfassungen, „nächster Termin …“, Preise, Erläuterungen) wandert **wörtlich** als eigener Eintrag nach `notes` des Anbieters, mit vorangestellter URL-Kurzform in eckigen Klammern, z. B. `[eversports.de/widget/…] Eversports-Widget 'Yoga mit Baby' (3-12 Mon.)`.
>
> **Regeln:**
> - **Nichts erfinden, nichts umformulieren.** Jeder Teil der alten `note`/`notes` (Teile trennt ein Prüfskript an `;`, ` – `, ` | ` und Satzende) muss wörtlich in `hint`, `notes`, `blocked.reason`, `request.body`, einem `request.headers`-Wert oder einer URL wieder auftauchen. Ein Teil darf auf mehrere Ziele verteilt werden, aber nicht gekürzt.
> - **URLs mit `vid=` (evangelische-termine.de) bleiben unverändert**, auch wenn ihr Eintrag `use: info` wäre: Sie sind der Zuordnungsschlüssel der Pipeline. Sie bekommen `use: termine`.
> - Paginierung: Stehen Folgeseiten mit stabilen URLs in der `note`, lege je Folgeseite einen eigenen Eintrag an (gleiches `kind`, `use: termine`). Brauchen sie Sitzungs-Parameter (`cHash`, „Links aus Seite übernehmen“), bleibt ein Eintrag, und die Erklärung wandert nach `notes`.
> - Die alten `notes` des Anbieters übernimmst du unverändert in derselben Reihenfolge; neue Einträge aus `note` hängst du hinten an. Auch eine Notiz, die du nach `venueHints` überträgst, bleibt in `notes` stehen (das Prüfskript verlangt die alten `notes` als Präfix).
>
> **Beispiele:**
> 1. `note: "Übersicht Eltern-Kind-Kurse (…); je Kurs Detailseite /kurs/<slug>/ mit Kursorganizer-iFrame"` → `use: info`, `notes += "[nübad-flipper.de/kurskategorie/…] Übersicht Eltern-Kind-Kurse (…); je Kurs Detailseite /kurs/<slug>/ mit Kursorganizer-iFrame"`.
> 2. `note: "Alle Sternenhaus-Termine (ortID 6239) inkl. Beschreibung mit Altersangabe; nach 'ab 2' filtern – FROM durch Laufbeginn ersetzen"`, URL mit `START_DATUM=FROM` → URL mit `START_DATUM={von}`, `use: termine`, `hint: "nach 'ab 2' filtern"`, `notes += "[nuernberg.de/cgi-bin/ajax_vk.pl] Alle Sternenhaus-Termine (ortID 6239) inkl. Beschreibung mit Altersangabe"`, `notes += "[nuernberg.de/cgi-bin/ajax_vk.pl] FROM durch Laufbeginn ersetzen"`.
> 3. `note: "Nürnberg-Seite mit dem nächsten Termin (nächster: So 08.11.2026, 11 Uhr). …"` → `use: termine`, kein `hint`, ganzer Text nach `notes`.
>
> Melde am Ende je Datei in einer Zeile, was du unsicher eingeordnet hast.

## Review (2026-10-10, Durchgang 1) – Verdict: Überarbeiten → eingearbeitet

Übernommen:
- B1 Phasen Erweitern → Migrieren → Verengen mit eigenem Fertig-Kriterium (Schritte 2–4).
- M1 K8 gestrichen, `programme` bleibt Pflicht; neue Prüfung „evtermine-`coveredBy` braucht `vid=`“; Anleitung schützt vid-URLs.
- M2 `blocked` nur mit Abrufbeleg und mit festgelegter Bedeutung; Eversports wird `render: browser`; Regel „Terminseite ohne `blocked`“.
- M3 Anhang A ausgeschrieben, mit Beispielen.
- M4 Nachtrag B nennt E3, E4, E5, Schritt 4 und 5 von Plan 0015.
- M5 E8 gestrichen, nach `docs/ideas.md` (R5).
- m1 Fixture-Sammelkalender bekommt `adapter`; m2 grep-Test weg, `region` in die Schlüsselprüfung; m3 Ziele und „Teil“ im Prüfskript definiert, Umformulieren verboten; m4 Datums-Check als Heuristik benannt; m5 Platzhalter auch in `request.body`, `fillPlaceholders` jetzt; m6 kein Cast in `regions.ts`; m7 Doku-Liste ergänzt (`architecture.md`, ADR 0024, `select.ts`); m8 `--smoke`; m9 Voraussetzung und Reihenfolge genannt; m10 „Der Umsetzer“; m11 K4 zählt 2 Einträge.

## Review (2026-10-10, Durchgang 2) – Verdict: Freigabe mit Änderungen → eingearbeitet

Übernommen:
- B1 Platzhalter nur `{name}` aus Buchstaben; `body` muss JSON sein; GraphQL-Body als Positivtest. (Phase a war zu diesem Zeitpunkt schon begonnen; der Fehler war im Test sichtbar und ist behoben.)
- M1 Anhang A übernimmt `render`; das Prüfskript bricht bei geändertem `kind`/`render` ab.
- M2 Auszug mit `role`, `coveredBy`, `adapter`, `verified`, `availability`, `venues`; Kursorganizer nicht an Subagenten.
- M3 `request` baut der Umsetzer von Hand und prüft per `curl`; Nachtrag B nennt den POST-Abruf als Aufgabe von Plan 0015.
- M4 Prüfskript mit harten Abbruchregeln und Unit-Tests je Regel.
- M5 `providerFromCandidate` ergänzt die vid-URL (Test 9).
- M6 Entscheidung: `Venue.hint` für Ortshinweise, vom Crawler gelesen; `notes` bleibt außen vor.
- m1 `schema:export` je Phase; m2 `ring`-Liste ergänzt, grep-Test gestrichen; m3 Stichtag als Berliner Datum-String; m4 ADR 0025 als Entwurf in Phase a; m5 `vidsIn` in `src/domain/vid.ts`, an beiden Stellen genutzt; m6 E2E in Phase a; m7 keine Platzhalter in Adapter-URLs; m8 Rückfallregel; m9 `holidaySubdivision` gestrichen, „Eval-Tag“ präzisiert.

## Kursorganizer-Abfragen, geprüft (2026-10-10, Review 2 M3)

Beide per `curl -X POST https://api.kursorganizer.com/graphql` mit `Content-Type: application/json`, `x-application-type: end-user-app` und dem `Origin` der jeweiligen App:
- `nuebad-flipper` (`Origin: https://app.nuebad-flipper.kursorganizer.com`): `coursesWithPaginationPublic(filters:{courseTypeIds:[…]}, options:{limit,offset}) { total items { startDateTime freePlaces maxAttendees waitListCount location { name } courseType { name } } }` liefert für „Mutter/Vater-Baby-Schwimmen“ 6 Kurse. `courseType { name }` gibt den Titel, den die Notiz nicht nannte.
- `schwimmschule-wassermaeuse-nuernberg` (`Origin: https://app.wassermaeuse.kursorganizer.com`): ohne Filter 1174 Kurse bundesweit; `filters:{city:"Nürnberg"}` liefert 86 (Langwasser Bad, Boxdorfer Werkstatt, Klinikum Süd, Hörgeschädigten-Zentrum). Das ist der serverseitige Filter, den Plan 0015, E3 für diese Quelle verlangt. Feldname per Fehlermeldung ermittelt (`CourseListFilters`, Introspection ist gesperrt).

## Ergebnis Phase a und b (2026-10-10)

- **Phase a:** `pnpm verify` grün; `pnpm e2e:local --affected` (pixel-7, 326 Tests) grün. Commit `e215ae6`.
- **Phase b, Subagenten:** 4 Subagenten für 81 Einträge, jeder mit `--check` auf ✓; 2 Kursorganizer-Einträge von Hand (siehe oben). `--apply` setzte alle 83 Einträge ohne Abbruch ein. Ergebnis: 229 Programmseiten (185 `termine`, 4 `verfuegbarkeit`, 40 `info`), 29 mit `render: browser`, 33 mit `hint`, 2 mit `request`, 0 mit `blocked`, 3 URLs mit `{von}`; 28 Orte mit `hint`; keine `note` mehr.
- **Korrektur des Umsetzers:** `curt-termine-familie` behält die Tagesansicht ohne Platzhalter (`{von}` ist der Monatsanfang und hätte einen vergangenen Tag gezeigt).
- **Adversariale Stichprobe (5. Subagent, 24 Anbieter):** kein Inhalt verloren, Ortshinweise und Platzhalter richtig. Bei 6 von 24 war `use` oder `hint` inhaltlich schief, bei 6 weiteren war Wissen nur noch in `notes` (für den Crawler unsichtbar). Alle Befunde behoben:
  - `use` korrigiert: Spiegelseite `mutherstudio.com/musikzwerge` und Programmheft-PDF von Zoff+Harmonie → `info`; Familienseite St. Markus → `termine`.
  - `hint` korrigiert: Musikschule (ohne Schuljahr, mit „regelmäßig wöchentlich außer Schulferien“), Nachbarschaftshaus (beide Abschnitte), Stadtbibliothek (Inhalt statt Werkzeug-Anweisung), Musikfüchse (welches Kürzel in Nürnberg liegt), FBS-Treffs (Wochenregel), Ohana (Termine im JSON-LD).
  - 11 Programmseiten ergänzt, die nur als URL in Notizen standen (alle per Abruf mit 200 geprüft): Ohana Minis/Maxis, dance maxX MAXI, FBS-Suchen MilchZeit/FamilienOase/BewegungsOase, vier Studio-Herzschlag-Angebote, FamilienBox-Turnkurse (Eversports, `render: browser`), Bonhoeffer-Gruppen Langwasser.
  - Ortshinweise Wassermäuse ergänzt; Protokollnotizen für Zoff+Harmonie (Folgeseiten) und die zwei `{von}`-URLs.
- **Offen für die Katalogpflege (kein Fehler der Migration, Nutzerentscheid):** `fryday-nuernberg` und `stadtmission-schwangerschaftsberatung` haben laut Notiz keine Seite mit Terminen; ihre einzige Seite steht als `termine`, damit die Regel aus Phase c greift. Ob sie im Katalog bleiben, entscheidet der Nutzer (Rückfallregel E3).
