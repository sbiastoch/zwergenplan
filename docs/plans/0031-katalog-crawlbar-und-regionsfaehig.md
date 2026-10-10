# Plan 0031 – Katalog crawlbar und regionsfähig

Status: Entwurf
Datum: 2026-10-10
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
| K4 | POST-Abfragen (Kursorganizer-GraphQL) stehen als Freitext. | Plan 0015, E4 („Schemaänderung … `request`“) |
| K5 | 6 URLs tragen feste Daten oder einen Platzhalter `FROM` statt `{von}`/`{bis}`; das Schema kennt keine Platzhalter. | Plan 0015, E4; ADR 0016 |
| K6 | Seiten ohne Termine (Linkhubs, Erklärseiten, Browser-Ansichten; 7) stehen gleichrangig neben Terminseiten und gingen in Abruf und Prompt. | Plan 0015, E2 (Eingabegrenze), R4 |
| K7 | 4 von 7 `aggregator` haben keinen `adapter`. Der Nachtlauf ruft nur Adapter ab und fragt das Modell nur je Anbieter, diese 4 crawlt also niemand. | Plan 0015, E1 |
| K8 | Anbieter mit `coveredBy` (13) müssen `programme` pflegen, obwohl es nie abgerufen wird. | Plan 0015, E4 |

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
  export const REGIONS = {
    nuernberg: { name: "Nürnberg", bbox: NUERNBERG_BBOX, holidaySubdivision: "DE-BY" },
  } as const satisfies Record<string, Region>;
  export type RegionId = keyof typeof REGIONS;
  export const REGION_IDS = Object.keys(REGIONS) as RegionId[];  // Begründung im Code: keyof über ein Literal
  ```
  `Region` = `{ name: string; bbox: BBox; holidaySubdivision: string }`. Mehr Felder (Zeitzone, ÖPNV-Feed, Startpunkt der Karte) kommen erst mit einer zweiten Region, weil heute nichts sie liest. `NUERNBERG_BBOX` bleibt in `geo.ts` (der Startpunkt-Check in `src/data` nutzt ihn, ADR 0017 und ADR 0010); die Registry verweist darauf.
- **Pflichtfeld `region`** an jedem Katalog-Eintrag aller drei Rollen, `z.enum(REGION_IDS)`. Auch Sammelkalender und Verzeichnisse sind regional.
- **Geo-Prüfung wandert vom Typ an den Anbieter:** `Geo` prüft nur noch gültige Koordinaten (lat −90…90, lon −180…180). Ein `superRefine` am `anbieter` prüft jeden Ort gegen `REGIONS[region].bbox` („Ort außerhalb der Region nuernberg“). `Timetable` prüft weiter gegen `NUERNBERG_BBOX`; ein Auszug je Region kommt mit R5.
- **Kein Präfix in IDs** (R4, ADR 0022 Punkt 5).

### E2 `ring` entfällt

- `Venue.ring` wird aus Schema, Katalog, Fixtures, `SiteOffer.venue` und `toSiteData` gestrichen; `scripts/pipeline/lib/ring.ts` samt Test entfällt; `providerFromCandidate` und `pipeline geocode` setzen es nicht mehr.
- Begründung: Nürnberg-Semantik im Vertrag, die niemand liest (R2). Brauchte die UI später eine Entfernungsstufe, rechnete sie sie aus `geo` und dem Startpunkt (wie die Wegzeit).
- Alte `site.json` im Cache mit `ring` und neuer Code: das Feld wird ignoriert. Alter Code mit neuer `site.json`: liest `ring` nicht. Kein Übergangsfeld nötig (per grep in `src/` und `e2e/` belegen, Test 7).

### E3 `programme` wird ausführbar

Neues Schema je Programmeintrag:

| Feld | Typ | Bedeutung |
|---|---|---|
| `url` | URL, darf `{von}` und `{bis}` enthalten | Andere `{…}` sind ein Fehler („nur {von} und {bis}“). |
| `kind` | `html \| pdf \| ical \| json-api` | Format der Antwort. `js` entfällt. |
| `render` | `"browser"`, optional | Seite braucht JavaScript; der Crawler rendert sie (Plan 0015, E4). Ersetzt `kind: js` (28 Einträge → `kind: html, render: browser`). |
| `use` | `termine \| verfuegbarkeit \| info` | Wozu die Seite dient. Nur `termine` und `verfuegbarkeit` gehen in Abruf und Prompt; `info` ist Doku für die Katalogpflege (Linkhub, Erklärseite). Pflicht. |
| `request` | `{ method: "POST", headers?: Record<string,string>, body: string }`, optional | Wie in Plan 0015, E4 vorgesehen. |
| `blocked` | `{ reason: string, since: IsoDate }`, optional | Seite ist bekannt gesperrt (403, Login, Bot-Schutz). Der Crawler überspringt sie und meldet sie im Bericht, statt jede Nacht `fehler` zu setzen. |
| `hint` | String, optional, höchstens 200 Zeichen, ohne Datumsangaben | Kurzer Extraktionshinweis für das Modell („nur Gruppen ‚ab 0‘ und ‚ab 1‘“, „Termine stehen im Abschnitt Krabbelgruppen“). Ersetzt `note`. Die Prüfung „ohne Datum“ ist ein Regex auf `\d{1,2}\.\d{1,2}\.` und `\d{4}-\d{2}-\d{2}`. |

- `note` entfällt. Ihr Inhalt wandert je nach Art (E6) nach `hint`, nach `notes` des Anbieters (Protokoll, Inhalt) oder in die Felder `render`, `blocked`, `request` und die URL.
- Paginierung: je Seite ein eigener Programmeintrag (Plan 0015, E4); was heute als Text dasteht, wird bei der Migration zu Einträgen, wo die Seiten-URLs stabil sind, sonst zu `blocked` mit Grund „Paginierung mit Sitzungs-Parametern“.
- Regel am Eintrag: Ein `anbieter` **ohne** `coveredBy` braucht mindestens einen Eintrag mit `use: termine` (sonst hat der Crawler nichts zu holen). Mit `coveredBy` darf `programme` leer sein (K8).

### E4 `notes` ist Protokoll

- `notes` (Liste, seit Plan 0030) ist ausdrücklich **Rechercheprotokoll und Hintergrund für Menschen**. Der Crawler liest es nicht: kein Prompt, kein `inputHash`. Das steht in ADR 0025 und in Plan 0015 (E7), denn den Eingabe-Bauer schreibt Plan 0015.
- Was der Crawler wissen muss, steht in Feldern: `programme[].hint`, `availability.how`/`system` (Wissen über die Quelle, bleibt Freitext und geht in den Prompt).

### E5 Rollen

- `aggregator` verlangt `adapter` (Pflicht). Ein Sammelkalender ohne Adapter ist für die Pipeline eine Quelle zur Katalogpflege, also `verzeichnis`. Die 4 Einträge aus K7 werden `verzeichnis`, ihre Notiz sagt warum.
- `coveredBy` zeigt weiter nur auf einen `aggregator` (`validateDataset`). Die Regel „aggregator braucht adapter“ macht damit jedes `coveredBy` abrufbar.

### E6 Migration (mit Subagenten)

Deterministisch, per Skript `scripts/migrate-0031.ts` (wie in Plan 0030 committet und im Folge-Commit gelöscht):
1. `region: nuernberg` bei allen 83 Einträgen (Position direkt nach `role`).
2. `ring` aus allen Orten löschen.
3. `kind: js` → `kind: html` + `render: browser`.
4. Die 4 Sammelkalender ohne `adapter` → `role: verzeichnis`.

Mit Urteil, per Subagenten: Für jede der 223 Programm-URLs und 186 Notizen ist zu entscheiden, wohin der Inhalt gehört. Ablauf:
1. Ein Skript schreibt je Anbieter einen Auszug (`id`, `programme`, `notes`) nach `runs/0031/in/<id>.json` (`runs/` ist nicht versioniert).
2. **4 Subagenten parallel**, je ein Viertel der Einträge, mit einer festen Anleitung (im Plan-Anhang A, wörtlich übergeben). Jeder schreibt je Eintrag `runs/0031/out/<id>.json` mit den neuen Feldern `programme` (nach E3) und `notes` (Liste). Regeln: nichts erfinden, keinen Inhalt verlieren (was nicht in ein Feld passt, wird Notiz), `hint` ohne Datum, `use` begründet aus `note`/URL, im Zweifel `termine`.
3. Ein Skript (`migrate-0031.ts --apply runs/0031/out`) setzt die Felder per `yaml.parseDocument` ein und prüft je Eintrag: gleiche URLs (außer bewusst durch Platzhalter ersetzte, die das Skript listet), kein Text der alten `note`/`notes` fehlt (jeder alte Teil steht wörtlich oder als Teilstring in `hint`, `notes`, `blocked.reason` oder ist in eine URL eingeflossen; das Skript meldet Abweichungen, der Mensch entscheidet), Schema grün.
4. Ein **fünfter Subagent** prüft adversarial eine Stichprobe von 20 Einträgen gegen den alten Stand (Inhalt verloren? `use` falsch? Datum in `hint`?).
5. Ich lese den vollständigen Diff der Einträge mit `blocked`, `request`, Platzhaltern und `use: info` selbst.

### E7 Plan 0015 nachziehen

Plan 0015 bekommt einen „Nachtrag B (Plan 0031)“: E4 nutzt `render` statt `kind: js`, überspringt `use: info` und `blocked`, liest `hint`, nicht `notes`; E5 nimmt `notes` aus dem `inputHash`; der Anbieter-Ausfall „Seite gesperrt“ wird über `blocked` gemeldet. Ich ändere Plan 0015 nur durch diesen Nachtrag, nicht im Text (er ist freigegeben und gehört einem anderen Arbeitsstrang).

### E8 Feiertage je Region

`fetchHolidays` und `freeDaysFrom` bekommen die Subdivision als Parameter (`REGIONS[region].holidaySubdivision`), der Cache heißt `holidays-<subdivision>-<jahr>.json`. Heute ruft die Pipeline sie mit `nuernberg` auf; das Verhalten bleibt gleich.

## Tests (test-first)

1. `dataset.test.ts`: fehlendes `region` → Fehler; unbekannte Region → Fehler; Ort außerhalb der bbox der Region → Fehler mit Region im Text; `ring` am Ort → Fehler (strict).
2. `dataset.test.ts`, Programm: `{foo}` in URL → Fehler, `{von}`/`{bis}` gültig; `kind: js` → Fehler; `hint` mit „08.11.“ → Fehler; `anbieter` ohne `coveredBy` und ohne `use: termine` → Fehler; mit `coveredBy` und leerem `programme` gültig; `request` ohne `body` → Fehler; `blocked` ohne `since` → Fehler; `note` → Fehler (strict).
3. `dataset.test.ts`, Rollen: `aggregator` ohne `adapter` → Fehler.
4. `regions.test.ts`: jede Region hat eine bbox mit min < max und eine Subdivision `DE-XX`.
5. `holidays.test.ts`: Subdivision aus dem Parameter, nicht fest.
6. `draft.test.ts`: `providerFromCandidate` schreibt `region` (aus dem Sammelkalender, sonst `nuernberg`), kein `ring`, `programme[0].use: termine`.
7. `site-data.test.ts`: `SiteOffer.venue` ohne `ring`; grep-Test: weder `src/` noch `e2e/` erwähnen `ring` als Feld.
8. Migration: Unit-Test für die deterministischen Schritte 1–4 auf einem kleinen YAML-Text (im selben Commit wie das Skript, mit ihm gelöscht).

## Schritte

1. Plan, `/plan-review`, Commit.
2. Tests 1–7 rot.
3. Fixtures per Skript (deterministische Schritte), Fixture-Programmeinträge von Hand auf E3 (7 Einträge), dann Schema und Code (E1–E5, E8), bis `pnpm verify` grün.
4. Echte Daten: deterministische Migration, dann Subagenten-Migration (E6), Prüfung, `pnpm schema:export`, `pnpm data:validate`.
5. ADR 0025, ADR 0003 (Statuszeile: Geo-Prüfung je Region), ADR 0006, Skill `references/catalog.md` und `references/extraction.md` (Felder `use`, `render`, `hint`, `blocked`, `request`, Platzhalter; `notes` ist Protokoll), Plan 0015 Nachtrag B, `docs/ideas.md` (R5, Kann-warten-Punkte).
6. `pnpm verify`, `pnpm e2e:local --affected` (`site.json` ändert sich: `ring` fehlt), `/arch-review`. Kein `/browser-review` nötig, wenn die E2E-Auswahl keine Ansicht als geändert meldet; sonst die betroffenen Ansichten.
7. Commit, Push.

## Risiken

- **Inhalt geht bei der Subagenten-Migration verloren oder wird falsch eingeordnet.** Dagegen: Prüfskript (E6.3), adversariale Stichprobe (E6.4), eigener Blick auf alle Sonderfälle (E6.5); `git diff` bleibt die Rückfallebene.
- **Konflikt mit Plan 0015 Nachtrag A** (`publicId` am `anbieter`): beide ändern den `anbieter`-Zweig. Ein späterer Merge setzt ein Feld dazu.
- **`site.json` ohne `ring`**: Kein Leser bekannt; Test 7 sichert das.
- **Platzhalter-URLs**: Bis der Crawler sie ersetzt, sind die 6 URLs im Skill nicht direkt aufrufbar. Der Skill-Text sagt, wie sie zu lesen sind (Monatsanfang bis +13 Monate).

## Anhang A – Anleitung für die Migrations-Subagenten

(wird vor Schritt 4 aus E3/E4 wörtlich formuliert und hier eingefügt)
