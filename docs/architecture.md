# Architektur

Grundlage für `/arch-review`. Regeln, die maschinell prüfbar sind, stehen zusätzlich in `.dependency-cruiser.cjs` (Verweis in Klammern). Alle anderen prüft der Review.

## Datenfluss

```
Recherche-Skill (.claude/skills/babyevents-nuernberg, orchestriert Subagenten)
   │  pnpm pipeline …  (scripts/pipeline: Sammelkalender, Rohdaten, build)
   ▼
data/providers.yaml + data/offers.json   (Commit auf main per `pipeline publish`)
                          │
            scripts/build-data.ts  (Zod + Invarianten; rot = kein Build)
                          │
   public/data/site.json, meta.json, public/ics/**.ics   (generiert, nicht committet)
                          │
              Vite-Build ► dist/ ► GitHub Pages zwergenplan.app
                          │
            Browser: src/data lädt site.json per fetch ► src/domain ► src/ui
```

## Schichten

| Ordner | Aufgabe | darf importieren |
|---|---|---|
| `src/domain/` | reine Logik: Schema, Kategorien, Alter, Filter, ICS, Zeit, Geometrie und Entfernung (`geo`, `reach`, `districts`) | nur `src/domain`, `zod` (nur schema/dataset) |
| `src/data/` | einziger Datenzugriff der App (fetch, localStorage, Geolocation) | `src/domain`: Typen, zur Laufzeit nur reine Hilfen ohne Zod, heute `geo` (ADR 0010, `data-domain-runtime-allowlist`) |
| `src/ui/` | React-Komponenten, Darstellung, Interaktion | `src/domain`, `src/data` |
| `scripts/` | Build, Validierung, Schema-Export (Node) | `src/domain`, `site.config.ts` |
| `scripts/pipeline/lib/` | reine Pipeline-Logik: Quellen-Parser, Termin-Regeln, Zuordnung, Build der Angebote | `src/domain`, `zod`, `cheerio`, `yaml` – kein Netz, keine Dateien |
| `scripts/pipeline/io/`, `cli.ts` | Netz, Dateien, git für die Pipeline | `scripts/pipeline/lib`, `src/domain`, Node |
| `e2e/` | Black-Box-Tests im Browser | nichts aus `src/` (einzige Hintertür: `window.__zpMap`, siehe unten) |
| `.claude/hooks/` | Agenten-Hooks | nur Node-Builtins |

Regeln:
- `src/domain` ist framework-frei und läuft im Browser: kein React, kein Node-API, keine UI (`domain-is-pure`, `domain-no-node-at-runtime`).
- **Geschäftslogik gehört nach `src/domain`.** Komponenten rufen Domänenfunktionen auf, rechnen aber keine Filter-, Alters- oder Zeitlogik selbst. Das prüft der Review.
- Die UI lädt geprüfte Daten und importiert `schema.ts`/`dataset.ts` nur als Typ. Zod gehört nicht ins Client-Bundle (`no-zod-in-client`).
- Datenzugriff läuft nur über `src/data` (`ui-reads-data-only-via-src-data`).
- `src/data` darf seit Plan 0004 Laufzeit-Code aus `src/domain` importieren, aber nur reine Hilfen ohne Zod, heute nur `geo` (`coarsen`, `inBounds`; ADR 0010, `data-domain-runtime-allowlist`). Begründung: Die Rohkoordinate darf `src/data/geolocation.ts` nie verlassen, also wird dort schon gerundet und gegen die Stadtgrenze geprüft. Ob eine gespeicherte Stadtteil-ID gilt, prüft `useOrigin`, nicht `preferences.ts`.
- Geolocation läuft nur über `src/data/geolocation.ts` (`canLocate`, `requestPosition`), nur auf Tipp, mit injizierbarer API für den Unit-Test. Die UI fasst `navigator`, `localStorage` und `fetch` nicht an (Biome `noRestrictedGlobals` für `src/ui` und `main.tsx`). Der Umweg über `window.navigator` usw. fällt nicht unter die Regel, den prüft der Review.
- `scripts/pipeline/lib` bleibt rein und testbar: kein Import aus `io/`, `cli.ts`, `scripts/lib/` und kein Node-I/O (`pipeline-lib-pure`, `pipeline-lib-no-node-io`), kein globales `fetch` (Biome `noRestrictedGlobals`). Unit-Tests laufen ohne Netz (`vitest.setup.ts`), Quellen werden mit Snapshots aus `tests/fixtures/pipeline/` getestet.
- `src/` hängt nie von `scripts/` ab (`src-not-scripts`, `no-cheerio-in-src`).
- **Karte** (ADR 0008, Plan 0005): Nur `src/ui/map/` darf `maplibre-gl` importieren (`maplibre-only-in-map`), und von außen erreicht man `src/ui/map/` nur per `import()`, auch Typen nicht statisch (`map-only-lazy`). Die Props-Typen liegen deshalb in `src/ui/map-types.ts`. Karten-Chunk, Worker und Karten-CSS landen in `dist/assets/karte/` mit eigenen Budgets; das Startbudget zählt sie nicht.
- **Kachel-Host** steht nur in `src/data/tiles.ts`. `guardTileRequest` sitzt als `transformRequest` vor jedem MapLibre-Request (auch denen, die der Worker lädt) und lässt nur `https://tiles.openfreemap.org` ohne Querystring und Fragment durch.
- Keine Zyklen (`no-circular`). Produktivcode importiert keine Tests oder Fixtures (`no-test-code-in-prod`).

## Invarianten

- **Ein Datenvertrag**: `src/domain/schema.ts` (Zod 4), auch für den Anbieterkatalog. Abgeleitete Werte wie Kategorien werden berechnet, nie gespeichert. `schema/*.json` ist ein Export (CI prüft Drift). Das Rohformat der Subagenten (`schema/raw-batch.schema.json`) ist ein daraus abgeleitetes Zwischenformat (ADR 0006).
- **Zeit**: Jeder Zeitpunkt trägt einen Offset. Kalendertage, das Alter und „heute“ werden in Europe/Berlin bestimmt (`time.ts`), nie in der Geräte-Zeitzone. „Jetzt“ wird in Domänenfunktionen hineingegeben (`FilterContext.now`), nicht intern mit `new Date()` erzeugt.
- **Stabile IDs** (ADR 0003, ADR 0006): Die Offer-ID ist `providerId--slug(title)--venueId` (Kurse und Einzeltermine mit Beginn im Slug, `src/domain/ids.ts`), die Termin-UID ist `offerId--YYYYMMDDTHHmm@zwergenplan`. Eine geänderte ID erzeugt Duplikate im Kalender der Nutzer.
- **ICS**: ein VEVENT je Termin in UTC, keine RRULE/RDATE. Die Dateien entstehen statisch zur Build-Zeit. Einzige Ausnahme ist die Sammeldatei der Merkliste: Sie entsteht im Browser aus denselben VEVENTs (ADR 0007).
- **Privatsphäre**: Das Geburtsdatum bleibt im `localStorage`. Es steht nie in URL, Logs oder Requests. Kein Tracking, keine Drittanbieter-Requests außer Kartenkacheln von `tiles.openfreemap.org`, nur bei offener Karte; die Karte zentriert nie auf Standort oder Kartenmitte, sie zeichnet einen solchen Startpunkt nur als lokalen Layer (Kamera-Regel, ADR 0008). Auf einen Stadtteil darf sie fahren.
- **Startpunkt** (Plan 0004, Plan 0005): Der Startpunkt (Standort, Stadtteil oder Kartenmitte) steht nie in URL, Logs oder Requests. Der Standort wird nur auf Tipp abgefragt, in `src/data` sofort auf ca. 100 m gerundet (`coarsen`) und lebt nur im Arbeitsspeicher, ebenso die gerundete Kartenmitte. Gespeichert wird höchstens die ID eines Stadtteils (`zwergenplan.entfernung-ab`), nie eine Koordinate, auch keine gerundete. In die URL darf nur der Umkreis (`umkreis=`), weil er ohne Startpunkt nichts verrät. E2E belegt: Ab der Wahl des Startpunkts entsteht kein Request (`e2e/startpunkt.spec.ts`), bei offener Karte auch kein Kachel-Request (`e2e/karte.spec.ts`).
- **Testdaten gehen nie live**: Der Fixture-Build schreibt nach `dist-e2e/`, nur `dist/` wird deployt.
- **Altersprüfung**: Kurs und einmalig zählen zum (ersten) Termin, regelmäßig zählt, wenn irgendein Termin passt. Die Grenzen sind inklusiv, es zählen vollendete Monate.

## Mobile-UX-Gates (`e2e/mobile-ux.ts`)

Jede Ansicht besteht in Playwright auf 360 px, Pixel 7, iPhone 15 (WebKit), quer und Desktop:
- kein horizontales Scrollen, auch bei 320 px und 200 % Textgröße
- Touch-Ziele ≥ 44 px (Links im Fließtext ≥ 24 px)
- Eingabefelder ≥ 16 px (sonst zoomt iOS)
- axe WCAG 2.2 AA ohne Verstöße, hell und dunkel (dunkel über die System-Einstellung und über die gewählte Darstellung `data-theme="dark"`)
- Text passt in seinen Kasten (`expectTextFits`, Plan 0007): kein Bruch mitten in kurzen Wörtern, nichts ragt heraus oder wird abgeschnitten, kein Text in sichtbaren Rundungen, keine Überlappung in Leisten; bei 100 % zusätzlich einzeilige kurze Knopf-Beschriftungen (nur mit Fixture-Daten). Läuft in jedem `expectMobileUx` und bei 320 px/200 %. Ausnahmen nur als begründete Regel im Gate, nie per Selektor.
- Dunkelmodus ohne helle Inseln (`expectNoBrightIslands`): keine deckende Fläche (auch `::before`/`::after`) mit Luminanz > 0,75 auf mehr als 1 000 px². Gewählte Zustände und Toast nutzen die Tokens `--sel`/`--on-sel` und `--toast`/`--on-toast`, die in **beiden** Dunkel-Blöcken von `tokens.css` stehen.
- Große Schrift: Umschaltungen dafür laufen über intrinsische Layouts (`flex-wrap`, `grid auto-fit` mit `rem`-Mindestbreiten) oder Container-Queries in `rem`, nie über Viewport-Media-Queries (die reagieren nicht auf die Schriftgröße). Kurze Wörter in Bedienelementen brechen nie mitten im Wort, `overflow-wrap: anywhere` ist nur der Notausgang für lange Komposita und URLs; Titel trennen mit `hyphens: auto`.
- sichtbarer Fokus bei Tastaturbedienung
- keine Konsolen- oder Seitenfehler (automatisch in jedem Test)
- reduzierte Bewegung funktioniert: keine Animation oder Transition länger als 1 ms, Verzögerung eingerechnet (`expectReducedMotion`)
- LCP < 2,5 s und CLS < 0,05 bei gedrosselter Mobile-CPU bzw. gedrosseltem Netz
- Bundle-Budgets (`.size-limit.json`)

Eine neue Ansicht bekommt eigene E2E-Tests **und** einen Aufruf von `expectMobileUx`, hell und dunkel. Das gilt auch für jedes Overlay (`<dialog>`: Detail, Sheets), denn es liegt im Top-Layer und wird sonst nie geprüft.

Die Karte ist eine Ergänzung; jede ihrer Funktionen hat einen Weg ohne Karte (Orts-Liste, Statuszeile, „Startpunkt wählen“). Ohne WebGL, ohne Netz und ohne Karten-Chunk bleibt die Seite bedienbar.

## E2E und die Karte (Plan 0005, E13)

- Der Drittanbieter-Wächter (`e2e/fixtures.ts`) ist standardmäßig scharf: Jeder Request an `tiles.openfreemap.org` ist rot. Nur Tests mit `test.use({ tiles: "mock" })` bekommen Stil, Glyphen und leere Vektorkacheln aus `tests/fixtures/karte/`, per `context.route` (auch Worker-Requests), nur solange `.map-box` im DOM ist und nur ohne Querystring. Unbekannte Pfade sind rot. Die Kachel-Requests stehen im Protokoll `tileLog` (Kamera-Regel).
- Erlaubte Konsolenfehler gibt es nur per Opt-in je Test (`allowedConsoleErrors`, konkretes Muster gegen URL und Text).
- **Begründete Ausnahme von „E2E ist Black-Box“**: Nur im E2E-Build (`__E2E__`, gesetzt in `vite.config.ts` bei `ZWERGENPLAN_DATA=fixture`) hängt die Karten-Instanz an `window.__zpMap`, damit Tests Marker finden (`project`) und Kamera und Layer prüfen. Im Deploy-Build entfernt Vite den Zweig; der Smoke-Test prüft, dass es `__zpMap` dort nicht gibt.
- CSS-Hinweis: `maplibre-gl.css` ist ungeschichtet und schlägt jede Regel in `@layer components`. Was MapLibre-Elemente betrifft, steht deshalb ungeschichtet in `src/ui/map/map-overrides.css`.
