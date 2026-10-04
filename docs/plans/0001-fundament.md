# Plan 0001 – Repo-Fundament „Zwergenplan“

Status: umgesetzt
Datum: 2026-10-04

## Ziel

Ein Repo, in dem Agenten (Claude Code) sicher und schnell an einer mobile-first Static-Site arbeiten können. Maximale **Backpressure**: Was statisch prüfbar ist, wird statisch geprüft. Was nur im Browser prüfbar ist, wird im Browser geprüft. Ein Deploy erfolgt nur, wenn alles grün ist. Am Ende dieses Plans läuft eine **Platzhalter-Seite** live auf GitHub Pages. Sie enthält kein finales UI-Design, denn das entsteht in einer separaten Mockup-Session. Die Pipeline ist trotzdem echt: Daten → Validierung → Domänenlogik → UI → ICS-Download → E2E → Deploy.

## Nicht-Ziele (dieses Plans)

- finales UI/UX-Design, Karte, Kalenderansicht, PWA/Service Worker (folgen in eigenen Plänen)
- Portierung der Python-Skill-Skripte nach TS (eigener Plan, nachdem die parallele Skill-Session den Katalog geliefert hat)
- echter Anbieterkatalog und echte Termine (kommt von der Skill-Session nach `data/`)
- Öffi-Matrix aus GTFS (Stufe 2; das Datenmodell sieht sie aber schon vor)

## Feste Entscheidungen (aus dem Grilling, nicht neu verhandeln)

- Alles in TypeScript. Zod 4 ist die **einzige** Schema-Quelle. JSON Schema wird nur exportiert, für Agenten-Prompts.
- React 19 + Vite 8 + TypeScript 7 (nativer Compiler) + Tailwind v4. Später kommen Motion, MapLibre und OpenFreeMap dazu, erst wenn sie gebraucht werden.
- Öffentliches GitHub-Repo `sbiastoch/zwergenplan` mit GitHub Pages unter dem Pfad `/zwergenplan/`. Die Seite ist privat gedacht: `noindex` und `robots.txt` Disallow, kein Impressum, kein Tracking, keine Drittanbieter-Fonts.
- Datenfluss: Der Pipeline-Lauf committet direkt auf `main`. CI ist das einzige Gate, bei Rot bleibt die alte Version live.
- Arbeitsweise (in `CLAUDE.md` verankert): Plan → unabhängiges Plan-Review → Umsetzung → `/arch-review` (adversarial) → Browser-Review → fertig.
- Nur Claude Code. Kein `AGENTS.md` und keine Symlinks.
- Sprache der UI und der Doku: Deutsch. Code-Identifier auf Englisch.

## Struktur

```
CLAUDE.md                  Agenten-Einstieg: Kommandos, Arbeitsweise, Pflicht-Gates, Verweise
docs/architecture.md       Schichten, Abhängigkeitsregeln, Datenfluss, Invarianten (Prüfgrundlage für /arch-review)
docs/adr/NNNN-*.md         Architekturentscheidungen (0001 TS-only+Zod, 0002 Hosting/Datenfluss, 0003 Datenmodell, 0004 Backpressure, 0005 Öffi-Matrix)
docs/ideas.md              Ideen außerhalb Scope
docs/plans/NNNN-*.md       Pläne + Review-Ergebnis
data/providers.yaml        Katalog (gepflegt; anfangs leer bzw. von Skill-Session)
data/offers.json           generierte Angebote (anfangs leer)
schema/*.schema.json       aus Zod exportiert, committed, Drift = CI rot
src/domain/                reine Logik, framework-frei: Schemas, Kategorien-Mapping, Altersprüfung, Filter, ICS, Geo
src/data/                  einziger Zugriffspunkt auf data/* für die App (Import + Zod-Parse zur Build-Zeit)
src/ui/                    React-Komponenten
src/main.tsx, index.html
scripts/                   Node-TS-Skripte (validate-data, export-schema, check-hook-…); später Pipeline
e2e/                       Playwright (Black-Box), Fixtures
tests/fixtures/            realistische Beispieldaten für Unit- und E2E-Tests
.claude/settings.json      Permissions-Allowlist, Hooks
.claude/hooks/*.ts         Hook-Skripte (Node, type-stripping)
.claude/agents/            plan-reviewer, arch-reviewer (read-only, adversarial)
.claude/skills/            plan-review, arch-review, browser-review
.github/workflows/ci.yml   check → build → e2e → lighthouse → deploy (main)
```

Ein einzelnes Package statt Monorepo, weil es weniger Konfiguration braucht. Die Grenzen zieht dependency-cruiser.

## Datenmodell (Zod, `src/domain/schema.ts`)

- **Provider**: `id` (kebab), `name`, `url`, `venues: Venue[]`, `topics: Topic[]`, `programme: {url, kind, note?}[]`, `availability: {shown, how?, system?}`, `verified` (ISO-Datum), `notes?`
- **Venue**: `id`, `name`, `address`, `district?`, `ring: innen|knapp-aussen|aussen`, `geo: {lat, lon}` (Pflicht, Bounding-Box Großraum Nürnberg), `nearestStops?: {stopId, name, walkMeters}[]` (Stufe 2)
- **Offer** (ein Angebot; Kurs, regelmäßiger Termin oder einmaliger Termin):
  - Identität und Inhalt: `id`, `providerId`, `venueId`, `title`, `summary` (eigene AI-Zusammenfassung, max. ~300 Zeichen), `topics: Topic[]`
  - Einordnung: `format: kurs|regelmaessig|einmalig`, `registration: mit-anmeldung|ohne-anmeldung`, `cost: kostenlos|kostenpflichtig`, `price?`
  - Alter: `age?: {minMonths, maxMonths}`. Fehlt die Angabe, gilt 0–36 Monate.
  - `sessions: {start, end}[]`: alle Termine im Horizont als lokale ISO-Zeiten (Europe/Berlin), aufsteigend und mit mindestens einem Eintrag. Sie sind von der Pipeline **materialisiert**, der Browser braucht keine RRULE-Engine.
  - `recurrence?: {rrule}`: nur für `regelmaessig`, für den ICS-Export der Gesamtserie
  - `registrationWindow?: {opens?, deadline?}`
  - `availability: {status: frei|wenige|ausgebucht|warteliste|ohne-anmeldung|unbekannt, note?, checkedAt}`
  - Links und Herkunft: `url` (Detail- bzw. Buchungsseite), `sourceUrl`
- **Topic**: ein geschlossenes Vokabular, übernommen aus dem Skill (`pekip`, `fenkid` …). **Kategorie** (12 Stück) wird über eine feste Mapping-Tabelle `topic → category[]` abgeleitet und nicht gespeichert, damit es eine einzige Quelle gibt.
- **OffersFile**: `{generatedAt, horizon: {from, to}, offers: Offer[]}`

Cross-Entity-Invarianten (`validateDataset`):
- `providerId`/`venueId` existieren
- IDs sind eindeutig
- `end > start`
- `kurs` hat ≥ 1 Session, `einmalig` genau 1
- `recurrence` nur bei `regelmaessig`
- keine Session vor `generatedAt − 1 Tag`
- `checkedAt ≤ generatedAt`

Plausibilität gegen den vorigen Stand (nur CI auf `main`): Bricht die Zahl der Offers um mehr als 50 % ein, ist das rot. Leerer Datenbestand ist nur erlaubt, solange `data/BOOTSTRAP` existiert. Das wird beim ersten echten Datenstand entfernt.

## Domänenlogik (`src/domain/`, jeweils mit Vitest)

- `age.ts`: Alter in Monaten zum Datum. `fitsAge(offer, birthDate)` prüft am **ersten Termin** (Kurs) bzw. am jeweiligen Termin (regelmäßig/einmalig).
- `filter.ts`: `FilterState` (Kategorien, Formate, Anmeldung, Kosten, Geburtsdatum, Zeitraum) ↔ URL-Querystring, verlustfrei per Roundtrip-Test. `applyFilters(offers, state)`: ODER innerhalb einer Dimension, UND zwischen den Dimensionen (dieselbe Semantik wie bisher im Skill).
- `categories.ts`: Mapping von Topic auf Kategorie. Ein Test erzwingt, dass jedes Topic mindestens eine Kategorie hat.
- `ics.ts`:
  - `icsForSession(offer, session)`, `icsForSeries(offer)` (Kurs: alle Sessions; regelmäßig: RRULE), `icsForMany(offers)`
  - RFC 5545: CRLF, Zeilen-Folding bei 75 Oktetten, Escaping, `TZID=Europe/Berlin` + VTIMEZONE, stabile UID, `DTSTAMP` aus `generatedAt` (deterministisch)
  - Test: Ausgabe wird mit `ical.js` geparst und gegen die Erwartung geprüft.
- `geo.ts`: Haversine-Entfernung, Sortierung nach Entfernung.

## UI (Platzhalter, bewusst minimal)

- Eine Seite: Titel „Zwergenplan“, Hinweis „Vorschau – Design folgt“, eine Liste der Offers (Titel, Anbieter, nächster Termin, Format/Kosten/Anmeldung als Text) und ein Button „In Kalender“ (ICS-Download über `Blob`). Ein minimaler Filter (Format als Chips) beweist den URL-State.
- Leerzustand: „Noch keine Angebote – Daten folgen.“
- Mobile-first, semantisches HTML, `lang="de"`, Systemschrift, Dark Mode über `prefers-color-scheme`.
- `<meta name="robots" content="noindex,nofollow">`, `public/robots.txt` mit Disallow.
- Die Build-Daten kommen aus `src/data` und werden zur Build-Zeit mit Zod geparst. Ungültige Daten lassen den Build scheitern. Über `ZWERGENPLAN_DATA=fixture` baut E2E deterministisch gegen `tests/fixtures/`.

## Backpressure – Schichten

| Ebene | Werkzeug | Wo |
|---|---|---|
| Typen | TS 7 `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` | Hook, Stop, pre-commit, CI |
| Lint/Format | Biome 2 (inkl. a11y-Regeln, `noExplicitAny` = error) | PostToolUse-Hook, CI |
| Architektur | dependency-cruiser: `domain` importiert nichts aus `ui`/`data`/react/DOM-Libs; `ui` liest `data/*` nur über `src/data`; `scripts` dürfen `domain` nutzen, aber nicht `ui`; keine Zyklen; `e2e` importiert nichts aus `src` | Stop, CI |
| Tote Pfade | knip (ungenutzte Dateien, Exporte, Dependencies) | CI |
| Schema-Drift | `scripts/export-schema.ts --check` | CI |
| Daten | `scripts/validate-data.ts` (Zod + Invarianten + Plausibilität) | PostToolUse bei `data/*`, CI |
| Unit | Vitest (domain 100 % Branch-Coverage als Ziel, Schwelle 90 %) | Stop, CI |
| E2E Mobile | Playwright-Projekte: 360×640 (Android klein), iPhone 15 (WebKit), Pixel 7 (Chromium); Desktop 1280 als Nebenprojekt | CI, lokal `/browser-review` |
| Mobile-UX-Checks (E2E-Helfer `assertMobileUx`) | kein horizontales Scrollen (`scrollWidth ≤ innerWidth`), alle interaktiven Elemente ≥ 44×44 CSS-px, axe (WCAG 2.2 AA) ohne Violations, Fokus sichtbar, Test unter `prefers-reduced-motion: reduce` und Dark Mode | CI |
| Visuelle Regression | Playwright `toHaveScreenshot` je Viewport + Theme | CI (Baselines committed) |
| Performance | Lighthouse CI (Mobile-Preset): Performance ≥ 0.9, Accessibility = 1.0, Best Practices ≥ 0.95, CLS ≤ 0.05, LCP ≤ 2.5 s | CI |
| Bundle | size-limit: initiales JS ≤ 90 kB gz, CSS ≤ 15 kB gz | CI |
| ICS | Parser-Roundtrip in Unit-Tests + E2E prüft heruntergeladene Datei | CI |

### Claude-Code-Hooks

- **PostToolUse** (`Edit|Write|MultiEdit`): `biome check --write` auf die Datei. Bei `.ts/.tsx` danach `tsc --noEmit` (TS 7 ist schnell genug für das ganze Projekt). Bei `data/*` läuft `validate-data`. Fehler gehen per Exit 2 und stderr an den Agenten zurück.
- **Stop**: `pnpm check:fast` (typecheck + lint + depcruise + validate-data + vitest). Ist das rot, wird mit Exit 2 blockiert und die gekürzte Fehlerausgabe zurückgegeben. Schleifenschutz: Bei `stop_hook_active` wird höchstens 3× blockiert, gezählt über eine Datei pro `session_id` in `$TMPDIR`. Danach wird durchgelassen, mit deutlicher Meldung.
- **Git pre-commit** (`simple-git-hooks`): `pnpm check:fast`. Das gilt auch für menschliche Commits und den späteren Pipeline-Commit.

### Agenten und Skills

- `.claude/agents/plan-reviewer.md`: read-only (Read, Grep, Glob, WebFetch). Er greift einen Plan adversarial an: Widersprüche zu den ADRs, fehlende Tests oder Backpressure, Risiken, Lücken für Mobile UX. Ausgabe sind priorisierte Findings mit Begründung.
- `.claude/agents/arch-reviewer.md`: read-only + Bash (nur Lesekommandos). Er prüft den Diff gegen `docs/architecture.md` und die ADRs und versucht, Regeln zu brechen und Invarianten zu verletzen.
- Skill `/plan-review`: startet `plan-reviewer` mit Plan-Pfad und hängt das Ergebnis an den Plan an (Abschnitt „Review“).
- Skill `/arch-review`: startet `arch-reviewer` gegen `git diff <basis>`. Blocker müssen gefixt oder als ADR begründet werden.
- Skill `/browser-review`: baut die Seite und startet `vite preview`. Er macht Screenshots auf allen Mobile-Viewports in Light und Dark, sieht sie sich an (Read auf PNG) und prüft optional live mit claude-in-chrome. Am Ende steht eine Checkliste: Lesbarkeit, Touch-Ziele, Leerzustände, Fehlerzustände, Micro-Interactions.

`CLAUDE.md` legt fest: Größere Änderungen (neue Abhängigkeit, neues Modul, Schemaänderung, mehr als ~200 Zeilen) gelten erst als fertig, wenn `/arch-review` gelaufen ist **und** `/browser-review` bei UI-Änderungen.

### CI (`.github/workflows/ci.yml`)

Trigger: Push auf `main`, PRs, `workflow_dispatch`.
1. `check`: pnpm install (frozen), typecheck, biome ci, depcruise, knip, export-schema --check, validate-data, vitest mit Coverage
2. `build`: zweimal, einmal mit Fixture-Daten (für E2E/Lighthouse) und einmal mit echten Daten (Deploy-Artefakt), dazu size-limit
3. `e2e`: Playwright gegen den Fixture-Build (alle Projekte) + einen Smoke-Test gegen den echten Build
4. `lighthouse`: lhci gegen den Fixture-Build
5. `deploy` (nur `main`, needs alle vorherigen): `actions/upload-pages-artifact` + `actions/deploy-pages`
6. Concurrency-Gruppe `pages`, kein paralleler Deploy

Für Node gilt ein festes `.nvmrc` (24) und `packageManager` mit pnpm-Version.

## Schritte

1. Toolchain: `package.json`, tsconfig, Biome, Vite + React + React Compiler (Babel-Preset, stabil), Tailwind v4
2. `src/domain`: Schema, Kategorien, Alter, Filter, ICS, Geo, jeweils test-first
3. `scripts/`: validate-data, export-schema. `data/` mit leerem Bootstrap-Stand, `tests/fixtures/` mit ca. 8 realistischen Offers über alle Formate und Kategorien
4. Platzhalter-UI + `src/data`
5. Gates: dependency-cruiser, knip, size-limit, Vitest-Coverage, Playwright + `assertMobileUx` + Screenshots, lhci
6. `.claude/`: settings (Allowlist, Hooks), Hook-Skripte, Agents, Skills. Dazu `CLAUDE.md`, `docs/architecture.md`, ADRs, `docs/ideas.md`
7. GitHub: Repo anlegen (public), Pages auf „GitHub Actions“ stellen, pushen, CI grün, Deploy live
8. Abschluss: `/arch-review` auf den Gesamtdiff, `/browser-review` auf die **Live-URL**, Findings fixen

## Akzeptanzkriterien

- `pnpm check:fast` lokal < 15 s und grün. `pnpm check` (inklusive E2E) grün.
- Ein absichtlich eingebauter Verstoß wird von der passenden Ebene abgefangen, als Stichprobe beim Aufsetzen geprüft:
  - Domain importiert React
  - Touch-Target 30 px
  - ungültige Offer-Daten
  - `any`
- CI läuft auf `main` grün durch und deployt. `https://sbiastoch.github.io/zwergenplan/` zeigt die Platzhalter-Seite mit `noindex`.
- `/browser-review` auf der Live-URL ist dokumentiert, mit Screenshots auf Mobile in Light und Dark.

## Risiken

- **Parallele Skill-Session im Haupt-Checkout**: Sie hat dort u. a. `README.md`, `ANBIETER.md` und `research/` unversioniert angelegt. → Ich lege kein `README.md` in Root an, damit es keine Kollision beim Auschecken von `main` gibt. Die Integration ihrer Dateien geschieht später bewusst. Den Worktree-Branch merge ich per Fast-Forward nach `main` und pushe nur `main`. Der Haupt-Checkout wird nicht angefasst.
- **TS 7 / Vite 8 / Vitest 5 sind jung**: Plugin-Inkompatibilitäten sind möglich. → Bei einem Blocker wird pro Werkzeug zurückgefallen und das im ADR vermerkt.
- **Lighthouse-Flakiness in CI**: → 3 Läufe, Median, Budgets mit kleinem Puffer.
- **Screenshot-Baselines sind OS-abhängig**: → Baselines nur in CI erzeugen (Linux-Container mit Playwright-Image). Lokal wird nur verglichen, wenn dasselbe Image genutzt wird. Die Alternative ist, lokal per Docker zu aktualisieren.
- **Stop-Hook-Schleifen** kosten Tokens. → Zähler mit Obergrenze (s. o.).

---

## Review (unabhängiger Subagent, 2026-10-04) – Verdict: „Überarbeiten“ → eingearbeitet

Die folgenden Änderungen **überschreiben** die betroffenen Stellen oben.

**Blocker**
- B1: dependency-cruiser 18.5 unterstützt nur `typescript <7`. → Wir nutzen `@swc/core` mit `options.parser: "swc"`. Dazu kommt eine Meta-Assertion: Meldet depcruise weniger als N Module, ist das rot.
- B2: Die Zeit wird eingefroren. Fixtures haben ein festes `generatedAt`. Playwright nutzt `page.clock.setFixedTime` + `timezoneId: Europe/Berlin`, Vitest `vi.setSystemTime` + `TZ=Europe/Berlin`. Das „Jetzt“ ist in der UI injizierbar (`?now=` nur im Fixture-Build).
- B3: Zeiten mit Offset (`2026-10-25T10:00:00+01:00`). Unit-Tests decken die Zeitumstellung im März und Oktober ab.

**Major**
- M1: `BASE = '/zwergenplan/'` steht genau einmal in `site.config.ts` und wird von Vite, Preview, Playwright und Pages genutzt. `robots.txt` entfällt, weil sie im Unterpfad wirkungslos ist. Es bleibt nur `noindex`. In ADR 0002 steht ausdrücklich: Das Repo ist öffentlich, also sind die Daten öffentlich.
- M2: Die Plausibilität wird gegen den **deployten** Stand geprüft. `meta.json` (Anzahl, `generatedAt`, Commit) wird mitdeployt, und CI holt sie von der Live-URL. Ist `generatedAt` älter als 14 Tage, gibt es eine CI-Warnung.
- M3: Die Pipeline läuft lokal und pusht mit den Credentials des Nutzers, was CI auslöst. Die Einschränkung mit `GITHUB_TOKEN` steht für den Fall einer späteren Action-Pipeline in ADR 0002.
- M4: Daten sind nicht im Bundle. `scripts/build-data.ts` validiert `data/` und schreibt `public/data/offers.json` und `meta.json` sowie die ICS-Dateien. Die UI lädt per `fetch`. Die UI importiert `domain/schema` nur als Typ, eine depcruise-Regel verhindert, dass zod ins Client-Bundle kommt.
- M5: Visuelle Regression wird zurückgestellt, bis das Design umgesetzt ist. Bis dahin decken `/browser-review` und eine Ideen-Notiz die Sichtprüfung ab.
- M6: IDs sind deterministisch. Die Offer-ID ist `providerId--slug(title)--venueId` (die Pipeline vergibt sie, die Validierung prüft das Format). Die Session-UID ist `offerId--YYYYMMDDTHHmm@zwergenplan`. Das steht in ADR 0003.
- M7: `recurrence.rrule` wird gestrichen. Serien-ICS bestehen aus mehreren VEVENTs aus `sessions`, jeweils mit eigener UID. RDATE unterstützt Google nicht zuverlässig.
- M8: ICS werden statisch zur Build-Zeit erzeugt: `ics/<offerId>.ics` für die Serie bzw. den Einzeltermin und `ics/<offerId>/<sessionKey>.ics` für einen einzelnen Termin einer regelmäßigen Reihe. Der Blob-Download bleibt nur für spätere Mehrfachauswahl.
- M9: Die Hooks werden verschlankt.
  - PostToolUse (`Edit|Write`) führt nur `biome check --write <file>` aus, bei `data/*` zusätzlich `validate-data`.
  - `tsc` läuft in `PostToolBatch` und gibt den Hinweis als Kontext zurück, ohne Exit 2.
  - Stop läuft `check:fast` nur, wenn sich der Tree-Hash seit dem letzten grünen Lauf geändert hat. Dabei wird höchstens 3× blockiert.
  - Ab mehr als 200 geänderten Zeilen ohne Review-Marker gibt der Stop-Hook einen Hinweis auf `/arch-review`.
- M10: tsconfig erhält `allowImportingTsExtensions`, `rewriteRelativeImportExtensions` und `erasableSyntaxOnly`. Imports in `src/domain` und `scripts` haben `.ts`-Endung. YAML wird nur in `scripts/` gelesen.

**Minor**, übernommen:
- Mobile-UX-Checks:
  - Viewport 320 px (Reflow), Querformat 640×360
  - Inputs mit Schriftgröße ≥ 16 px
  - Konsolenfehler und `pageerror` = rot
  - Touch-Targets ≥ 44 px für Controls, Inline-Links ausgenommen (WCAG-Minimum 24 px)
  - Fokus: Tab-Durchlauf mit Prüfung von outline bzw. box-shadow
  - Text-Zoom 200 % ohne horizontales Scrollen
  - Web-Vitals (CLS ≤ 0.05, LCP ≤ 2.5 s) per PerformanceObserver in Playwright bei Mobile-Throttling statt lhci (veraltet). Lighthouse kommt auf die Ideenliste.
- Alterslogik: `maxMonths` ist inklusiv. Ein Monat ist vollendet, wenn der Kalendertag erreicht ist (31. → Monatsende). Angebote für die Schwangerschaft liegen außerhalb des Scopes, `minMonths ≥ 0`.
- Ein statischer VTIMEZONE-Block für Europe/Berlin, getestet mit ical.js.
- React Compiler zurückgestellt.
- `arch-reviewer` bekommt kein Bash (nur Read/Grep/Glob). Das Skill übergibt den Diff als Datei.
- `geo.ts` und `icsForMany` werden erst angelegt, wenn sie gebraucht werden.
- Deploy-Job mit `pages: write`, `id-token: write`, `environment: github-pages`, `cancel-in-progress: false`.
- Die Dauer von `check:fast` wird in CI ausgegeben.

**Nicht übernommen**: Den JSON-Schema-Export **behalten** wir. Die parallele Skill-Session braucht den Datenvertrag jetzt.

## Umsetzung – bewusste Abweichungen (nach /arch-review)

- `FilterState` hat noch keine Dimension „Zeitraum“. Die gehört zur Kalenderansicht und kommt mit dem UI-Plan.
- Statt „keine Session vor generatedAt − 1 Tag“ gilt jetzt „der **letzte** Termin liegt nicht in der Vergangenheit“. Laufende Kurse mit bereits vergangenen Terminen bleiben gültig, denn die Serien-ICS braucht alle Termine.
- `?now=` entfällt. E2E friert die Uhr über `page.clock` ein, und die Domänenfunktionen bekommen `now` übergeben.
- Die Kategorien-Zuordnung liegt in `src/domain/topics.ts`, nicht in `categories.ts`. Themen und Kategorien bilden eine Einheit.
- Lighthouse ist durch Web-Vitals in Playwright ersetzt (`e2e/perf.spec.ts`).
- Bootstrap: Solange `data/BOOTSTRAP` existiert, wird `data/` gar nicht gelesen. `data/providers.yaml` liegt noch im Skill-Format (Migration in Plan 0002).
- Der pre-commit-Hook ist nicht aus dem Worktree installiert (ADR 0004, mehrere Checkouts).

## Browser-Review (lokal, Fixture-Daten, 2026-10-04)

Screenshots 320/iPhone/Pixel/quer × hell/dunkel (`scripts/screenshots.ts`). Die Checkliste ist bestanden, Hierarchie, Touch-Ziele, Dark-Mode-Kontrast und Querformat sind in Ordnung. Für die Design-Session notiert:
- Das native Datumsfeld zeigt das Format der Browsersprache. Headless ist das `mm/dd/yyyy`, auf deutschen Geräten `TT.MM.JJJJ`. Eine eigene, klar deutsche Eingabe erwägen.
- `hyphens: auto` trennt auf 320 px auch kurze Wörter („Nürn-berg“). Die Typografie wird mit dem Design festgelegt.
- WebKit-CI fand bei 200 % Text einen Überlauf durch das Datumsfeld. Behoben.
