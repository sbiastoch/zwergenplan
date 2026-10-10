# Plan 0030 – Katalog entrümpeln: keine Anbieter-Facetten, Felder nach Rolle, Notizen als Liste

Status: in Umsetzung (2026-10-10; Plan-Review ein Durchgang ohne Blocker, eingearbeitet)
Datum: 2026-10-10
Bezug: ADR 0003 (Datenmodell), ADR 0006 (Recherche-Pipeline, ein Katalogformat), ADR 0022 (Entwurf, stabile IDs; wird hier nicht berührt), Plan 0010 (Anbieterübersicht, E6 Kategorien), Plan 0026 (Vorschauseiten der Anbieter); neu: ADR 0024

## Anlass

Nutzer am 2026-10-10: „Unser Datenmodell aus Anbietern und Angeboten ist noch nicht ganz sauber, refactore das bitte.“

Gemessen am 2026-10-10 auf `data/providers.yaml` (83 Einträge: 74 `anbieter`, 7 `aggregator`, 2 `verzeichnis`; 129 Orte) und `data/offers.json` (333 Angebote):

| | Befund |
|---|---|
| B | Jeder Katalog-Eintrag trägt von Hand gepflegte Facetten `topics`, `formats`, `costs`, `registrations`. Sie widersprechen den Angeboten: 95 Angebote haben ein Thema, das ihr Anbieter nicht nennt, 18 ein Format, 4 eine Kostenart, 3 eine Anmeldeart. |
| C | `aggregator` und `verzeichnis` tragen Felder ohne Bedeutung: Facetten, `age` (5 von 7 bzw. 2 von 2), Orte (`kuf-kinderkultur-aggregator` 3, `feb-eltern-kind-gruppen` 13). Alle 16 Orte liegen 0–17 m neben einem Ort eines `anbieter` und werden von keinem Angebot und keiner Zuordnung benutzt (`matchCandidate` sucht nur unter `anbieter`, `validateDataset` erlaubt Angebote nur bei `anbieter`). 19 Einträge haben `availability.how: "-"` als Platzhalter. |
| D | `notes` ist ein einziger String. 42 Einträge kleben darin mit „ | “ insgesamt 154 Teile zusammen, teils per Konvention (`Anmeldestart: … | Anmeldeschluss: …`, Skill `references/catalog.md`), teils durch Anhängen. |
| A | Orte hängen am Anbieter; 25 Koordinaten kommen bei verschiedenen Anbietern doppelt vor. **Nicht Teil dieses Plans** (siehe Nicht-Ziele). |

Nutzerentscheide vom 2026-10-10 (Auswahl im Chat):

- **N1 Umfang:** B, C und D. A nicht.
- **N2 Facetten:** „Ganz streichen“. Der Katalog führt keine Facetten mehr. Die Anbieterübersicht zeigt Kategorien nur noch aus den Angeboten, die Pipeline hat keine Rückfallwerte mehr aus dem Katalog (mehr offene Felder im Entwurf).

## Ziel

Der Katalog beschreibt **Quellen** (wer, wo, wie recherchiert), die Angebote beschreiben **Inhalte** (was, wann, für wen, zu welchen Bedingungen). Kein Inhalt steht doppelt, und jede Rolle hat nur Felder, die für sie etwas bedeuten.

## Nicht-Ziele

- **Ortsliste (Befund A).** Orte aus den Anbietern lösen und Dubletten zusammenführen änderte `venueId` und damit heute die Angebots-IDs (`providerId--slug--venueId`, ADR 0003/0006): geteilte Links, Merklisten-Einträge und Kalender-UIDs brächen. Kommt nach `docs/ideas.md`, mit dem Hinweis, dass es erst nach ADR 0022 (stabile Kurz-IDs) bruchfrei geht.
- **`Offer` ändert sich nicht.** `data/offers.json` bleibt byte-gleich, IDs bleiben.
- **`age` am Anbieter** bleibt (nur bei `anbieter`). Er ist keine der vier Facetten, steht in der Skill-Konvention („darf über 36 hinausgehen“) und widerspricht keinem Angebot in einer Weise, die die UI zeigt.
- **Anmeldestart/-schluss als strukturiertes Feld.** Bleibt Text, nur als eigener Listeneintrag. Ein Feld wäre eine eigene Idee (`docs/ideas.md`).
- Keine Umbenennung von Katalog- oder Orts-IDs.

## Entscheidungen

### E1 Schema `Provider` (`src/domain/schema.ts`)

Gemeinsame Felder aller Rollen (`sourceBase`): `name`, `url`, `programme`, `availability`, `verified`, `notes`.

| Rolle | zusätzlich |
|---|---|
| `anbieter` | `age?` (`ProviderAge`), `venues` (≥ 1), `coveredBy?` |
| `aggregator` | `adapter?` |
| `verzeichnis` | – |

- Entfällt bei allen Rollen: `topics`, `formats`, `costs`, `registrations`.
- Entfällt bei `aggregator` und `verzeichnis`: `age`, `venues`. `strictObject` bleibt, ein Rest-Feld ist also ein Validierungsfehler.
- `availability` bleibt bei allen Rollen. Für Sammelkalender und Verzeichnisse sagt `how`, wo man Plätze erkennt (z. B. `et-dekanat-nuernberg`: „Titel parsen“); das braucht die Recherche.
- `availability.how` muss, wenn vorhanden, mindestens einen Buchstaben enthalten (`/\p{L}/u`, Meldung „Text erwartet, kein Platzhalter“). Damit sind „-“-Platzhalter ausgeschlossen; ohne Angabe fehlt das Feld.
- `notes`: `z.array(Note).min(1).optional()`, `Note` = nicht leerer String ohne „ | “ (Meldung „eine Notiz je Eintrag, kein ‚ | ‘“, Review m2). Eine Notiz je Eintrag.
- `uniqueList` (lokale Konstante) wird nicht mehr gebraucht und entfällt (TypeScript/Biome melden sie sonst). `Format`, `Cost`, `Registration` bleiben exportiert, weil `Offer` und die UI sie nutzen.
- Neuer Typ-Export `Anbieter = Extract<Provider, { role: "anbieter" }>` in `schema.ts` (bisher lokal in `match.ts`), damit Aufrufer nach der Rolle verengen, statt `venues` auf jeder Rolle zu erwarten.

### E2 Ableitungen ohne Facetten

- `SiteProvider` (`anbieter.json`) verliert `topics`. `ProviderEntry` (`directory.ts`) ebenso; `fallbackEntry` berechnet keine Themen mehr.
- `providerCategories(provider, offers)` wird zu `providerCategories(providerId, offers)` und liefert `categoriesOf` über die Themen **aller übergebenen** Angebote dieses Anbieters. Aufrufer: `ProviderSheet.tsx` (bisher mit den kommenden Angeboten `own`) und `share-pages.ts` (Vorschauseite des Anbieters).
- Folge, akzeptiert mit N2: Ein Anbieter ohne kommende Angebote zeigt im Sheet keine Kategorienzeile (die Zeile entfällt bei leerer Liste schon heute, `ProviderSheet.tsx`), und seine Vorschauseite nennt keine Kategorien. Betroffen sind am 2026-10-10 10 der 74 Anbieter. Die Anbieterliste zeigt keine Kategorien und ändert sich nicht.
- Die Vorschauseite nimmt wie das Sheet nur die **kommenden** Angebote ab `generatedAt` (`providerOffers`), damit beide dasselbe zeigen (Review m1).
- Alte `anbieter.json` im Cache des Service Workers mit `topics` schadet nicht: Das Feld wird nicht mehr gelesen.
- **Umgekehrt (Review M1):** Ein offener Tab mit altem Code lädt nach dem Deploy die neue `anbieter.json`. Weil `offers.json` und damit `generatedAt` gleich bleiben, lädt `ensureFresh` nichts nach, und der alte Code rechnet `[...provider.topics]` → Absturz. Deshalb schreibt `scripts/build-data.ts` beim Serialisieren von `anbieter.json` für eine Übergangszeit `topics: []` je Anbieter dazu (Kommentar mit Plan-Verweis). Domänentyp und `toProviderDirectory` kennen das Feld nicht mehr. Das Entfernen steht als Restpunkt in `docs/ideas.md` (frühestens einen Tag nach dem Deploy; Arch-Review m2).

### E3 Pipeline ohne Rückfallwerte (`scripts/pipeline/lib/draft.ts`)

- `draftFromCandidate`:
  - `format`: regelmäßig nur noch bei `c.weekly` oder `looksRegular(c.occurrences)`; der Rückfall „Anbieter bietet nur `regelmaessig`“ entfällt. Der Skill lässt das abgeleitete Format ohnehin prüfen (`SKILL.md`, Schritt `keep`).
  - `cost`: `kostenlos` bei Freitext-Treffer, sonst offen. `registration`: aus dem Kandidaten, sonst offen. Offene Felder meldet `keep` schon heute.
  - `topics`: aus dem Text. Hat keines eine Kategorie, kommt `topics` in die Liste `open` (Review M2).
  - Ohne erkannten Rhythmus kommt `format` (`einmalig`) in `open` (Arch-Review m1).
  - Der Parameter `provider` entfällt (Review m7), Aufruf in `cli.ts` anpassen.
- `validateRaw` (`raw.ts`) prüft zusätzlich die Offer-Regel „mindestens ein Thema mit Kategorie“ als Fehler mit Pfad `topics`. Bisher fiel das erst in `pipeline build` auf, weil `RawEvent` aus `OfferFields` ohne die Querprüfungen gebaut ist (Review M2).
- `providerFromCandidate` (`candidates add-provider`): ohne Facetten; `notes` als Liste mit einem Eintrag. Der bisherige Text „Kosten/Anmeldung/Format aus einem Termin abgeleitet – prüfen“ entfällt mit den Feldern.

### E4 Übrige Code-Stellen

- `appendToCatalog` (`scripts/pipeline/io/files.ts`, die Logik wandert als reine Funktion `appendEntries` nach `scripts/pipeline/lib/catalog-yaml.ts`, damit sie ohne Dateizugriff testbar ist) setzt Listen aus Skalaren im ganzen Dokument auf Flow-Stil; `notes` wird davon ausgenommen, sonst würde der nächste `add-provider` alle Notizlisten in eine Zeile ziehen (Review M4, mit Test).
- `batchProviders` (`files.ts`, Kern `providerIdsOf` ebenfalls in `catalog-yaml.ts`) liest aus einem Paket nur noch die `id`s (`z.array(z.object({ id: z.string() }).loose())`), damit Pakete eines vor der Migration begonnenen Laufs lesbar bleiben (Review M5, mit Test).

Alle Zugriffe auf `venues` setzen `role === "anbieter"` voraus: `validateDataset` (Ort-IDs, Orte gehören dem Anbieter), `toSiteData`, `toProviderDirectory`, `raw.ts` (Ort gehört zum Anbieter), `build-offers.ts` (Geo-Karte, Vorstands-Prüfung), `share-pages.ts` (Stadtteile). Was der Typcheck nach E1 meldet, wird über `Anbieter` verengt, nicht per Cast.

### E5 Migration der Daten

Einmaliges Skript `scripts/migrate-0030.ts`, im Commit der Migration enthalten und im folgenden Commit gelöscht (Review m3), über `yaml.parseDocument`, damit Kommentare und Flow-Stil (`[ a, b ]`, `geo: { … }`) erhalten bleiben:

1. Bei jedem Eintrag `topics`, `formats`, `costs`, `registrations` löschen.
2. Bei `aggregator`/`verzeichnis` `age` und `venues` löschen.
3. `availability.how` löschen, wenn es keinen Buchstaben enthält.
4. `notes` an „ | “ teilen, jeden Teil trimmen, leere Teile verwerfen, als Block-Liste schreiben.

Läuft auf `data/providers.yaml` und `tests/fixtures/providers.yaml`. Danach `pnpm schema:export`, `pnpm data:validate`. ADR 0006 erlaubt Agenten, den Katalog direkt zu pflegen; `data/offers.json` wird nicht angefasst. Prüfung der Migration: Anzahl Einträge, IDs, Orte der `anbieter`, `programme`, `verified` vorher und nachher gleich (im Skript als Abbruchbedingung), und je Eintrag ergibt `notes.join(" | ")` den alten Text ohne leere Teile.

### E6 Doku und Skill

- **ADR 0024** „Katalog beschreibt Quellen, Angebote Inhalte“: Entscheidung E1–E3, Alternativen (Facetten ableiten; behalten und Konsistenz erzwingen), Konsequenzen (Kategorien nur aus Angeboten; mehr offene Felder im Entwurf). ADR 0003 und ADR 0006 („Ein Katalogformat“) bekommen einen Verweis in der Statuszeile (Review m5).
- Skill `SKILL.md` (Schritt `keep`): offene Felder sind auch `topics` und `format`; ein abgeleitetes `einmalig` immer prüfen, denn eine Reihe als Einzeltermine ändert die ID-Form (Review m4).
- Skill `babyevents-nuernberg/references/catalog.md`: Konvention zu `formats`/`costs`/`registrations` streichen, `notes` als Liste („eine Notiz je Eintrag“), Anmeldestart und -schluss je als eigener Eintrag; Rollen-Abschnitt nennt, welche Felder je Rolle gelten.
- `docs/ideas.md`: Ortsliste (Befund A) mit dem ID-Hinweis; Anmeldefenster des Anbieters als Feld.
- `docs/architecture.md`: nur falls es die Facetten nennt (prüfen per grep; heute keine Treffer).

## Tests (test-first)

1. `src/domain/schema.test.ts` bzw. `dataset.test.ts`: `aggregator` mit `venues` → Fehler; `verzeichnis` mit `age` → Fehler; `anbieter` mit `topics` → Fehler; `availability.how: "-"` → Fehler; `notes: ["a", "b"]` gültig, `notes: "a"` → Fehler, `notes: []` → Fehler.
2. `directory.test.ts`: `providerCategories` nur aus Angeboten; ohne Angebote leer. Bisherige Fälle (`theater`, `TURNVEREIN`) angepasst.
3. `site-data.test.ts`: `toProviderDirectory` ohne `topics`.
4. `draft.test.ts`: Rückfall-Fälle der Facetten werden zu „offen“ (cost/registration fehlen im Entwurf), Format ohne Rhythmus `einmalig`; Themen ohne Kategorie bleiben ohne Rückfall. `providerFromCandidate` ohne Facetten, `notes` als Liste.
5. `share-pages.test.ts`: Anbieter-Vorschau mit Kategorien aus kommenden Angeboten; ohne kommende Angebote ohne Kategorien.
6. `raw.test.ts`: Ereignis nur mit `vaeter` → Fehler `topics`. Test zu `io/files.ts`: `appendToCatalog` lässt Block-Listen unter `notes` stehen; `batchProviders` liest ein Paket mit Altfeldern.
6b. Übrige Test-Fixtures (`match`, `raw`, `build-offers`, `select`, `dataset`, `providers`, `provider-format`) auf das neue Schema; keine Verhaltensänderung erwartet.
7. E2E `e2e/anbieter-inhalt.spec.ts`, Test „Turnverein …“: erwartet jetzt **keine** `.provider-cats`. Test „Name, Kategorien …“ (Theater) bleibt „Musik & Singen · Bühne & Konzert“ (aus den Angeboten: `theater`, `konzert`, `musik`).
8. Schema-Drift: `pnpm schema:export` schreibt `schema/providers.schema.json` neu; `check:fast` prüft die Drift.

## Schritte

1. Plan + Review committen.
2. Tests aus „Tests“ 1–6 rot schreiben.
3. Migration (E5) zuerst auf `tests/fixtures/providers.yaml`, dann Schema (E1) und Typfehler (E2–E4), dann Migration auf `data/providers.yaml`, `pnpm schema:export` (Review M3: unter `strictObject` würden die alten Fixtures jeden Test brechen). Prüfen: `pnpm exec tsc`, `pnpm exec vitest related` auf die geänderten Dateien, `pnpm data:validate`.
4. Doku und Skill (E6), ADR 0024. Prüfen: `check-docs`.
5. `pnpm verify` (volle Suite).
6. `pnpm e2e:local --affected` und `--smoke` (Pflicht wegen der Vorschauseiten); Fixtures und Schema ergeben eine volle Auswahl, lokal laufen die direkt getroffenen Specs plus `app` und `theme`, ausdrücklich `e2e/anbieter-inhalt.spec.ts` und `e2e/teilen.spec.ts`. `/browser-review` (Anbieter-Sheet mit und ohne Angebote, auch 320 px und Querformat: Abstand Überschrift → „Website & Programm“ ohne Kategorienzeile, Review m10), `/arch-review` (Schemaänderung).
7. Commit, Push auf `claude/datenmodell-anbieter-angebote-3lw3dv`.

## Risiken

- **Weniger Information für Eltern bei Anbietern ohne Termine** (keine Kategorienzeile). Akzeptiert mit N2.
- **Mehr Handarbeit in der Recherche** bei Sammelkalender-Entwürfen (Kosten, Anmeldung, Format, Themen offen). Akzeptiert mit N2. Der nächtliche Lauf (Plan 0015) extrahiert ohnehin per Sprachmodell aus der Seite, nicht aus Katalog-Facetten.
- **Konflikt mit Plan 0015, Nachtrag A** (fügt `publicId` am `anbieter` hinzu, noch nicht umgesetzt): beide ändern `Provider`. Der spätere Merge muss nur das Feld in den neuen `anbieter`-Zweig setzen.
- **YAML-Formatierung**: Die Migration darf Kommentare nicht verlieren; Prüfung per `git diff --stat` und Stichprobe.

## Review (2026-10-10) – Verdict: Freigabe mit Änderungen → eingearbeitet

Übernommen:
- M1 alter Code mit neuer `anbieter.json`: `topics: []` für eine Übergangszeit im Build (E2), Restpunkt in `docs/ideas.md`.
- M2 Themen ohne Kategorie: `open` enthält `topics`, `validateRaw` prüft die Kategorie-Regel (E3, Test 6).
- M3 Reihenfolge: Fixtures zuerst migrieren (Schritt 3).
- M4 `appendToCatalog`: `notes` bleibt Block-Liste (E4).
- M5 alte Pakete: `batchProviders` liest nur IDs (E4).
- m1 Vorschauseite nur mit kommenden Angeboten; m2 „ | “ im Schema verboten; m3 Skript wird committet; m4 Skill-Schritt `keep`; m5 Verweis in ADR 0006; m7 Parameter `provider` entfällt; m8 Wortlaut `uniqueList`; m9 Prüfungen je Schritt; m10 Browser-Review bei 320 px und im Querformat.

Abgelehnt:
- m6 (Notiz „Adresse = Sitz …“ bei `kath-stadtkirche-familiengottesdienste`): Der Eintrag hatte schon vorher `venues: []`; die Notiz beschreibt den Sitz des Sammelkalenders, nicht einen gelöschten Ort, und bleibt richtig.

## Arch-Review (2026-10-10) – Verdict: OK

Übernommen, alle vier Minor:
- m1 vermutetes `einmalig` steht in `open`; ADR 0024 und Test angepasst.
- m2 Begründung und Abbaukriterium für `topics: []`: frühestens einen Tag nach dem Deploy, wegen Tabs mit altem Code (Kommentar, `docs/ideas.md`, ADR).
- m3 Statuszeile „in Umsetzung“.
- m4 `Note` verlangt ein Nicht-Leerzeichen, Testfall `[" "]`.

## Browser-Review (2026-10-10, lokal, Fixture-Build)

Ansichten: `anbieter-sheet` (volle Matrix aus `scripts/screenshots.ts`) und das Sheet des Turnvereins ohne Angebote (`?anbieter=turnverein-beispiel`) bei 320×640, 390×844 und 915×412, jeweils hell und dunkel.
- Lesbarkeit: Ohne Kategorienzeile folgt „Website & Programm“ mit dem üblichen Abstand auf den Namen; nichts rückt zusammen. Mit Angeboten (Bibliothek) steht die Zeile aus den Angeboten wie bisher („Musik & Singen · Bücher & Vorlesen“).
- Daumen-Erreichbarkeit: unverändert, „Teilen“ und „Schließen“ unten.
- Zustände: leerer Zustand „Kommende Angebote (0)“ bricht bei 320 px nicht; langer Name umbricht zweizeilig neben dem Herz.
- Dark Mode: keine hellen Inseln, Kontrast wie hell.
- Micro-Interactions und Design-System: keine neuen Bedienelemente.
Befunde: keine.
