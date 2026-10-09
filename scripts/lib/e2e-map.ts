/**
 * Zuordnung der E2E-Auswahl (Plan 0029, B3; ADR 0023), nur Daten. Die Regeln dazu stehen in e2e-select.ts, die
 * Wächter in e2e-map.test.ts: Jede Spec hat einen Eintrag, jedes Muster trifft eine getrackte Datei, jedes Modul
 * unter src/ui/ und src/sw/ steht bei einer Spec außer app.spec.
 *
 * Muster treffen Repo-Pfade in der **Hülle** der Änderung (geänderte Dateien plus alle, die sie importieren). Eine
 * Spec nennt die Module, deren Verhalten sie über die Oberfläche prüft, dazu Domänenmodule, für die sie die
 * maßgebliche Black-Box-Prüfung ist: Darüber wählt `--affected` lokal die Specs, wenn die Hülle mehr als 8 trifft.
 * Was eine Spec selbst importiert (`e2e/fixtures.ts`, `e2e/mobile-ux.ts`, `e2e/vitals.ts`, `e2e/real-data.ts`),
 * hängt ohnehin im Graphen und steht hier nicht.
 *
 * Läuft im CI-Job `scope` ohne `pnpm install`: keine Importe (Regel `ci-scope-builtins-only`).
 */
import type { E2eMap } from "./e2e-select.ts";

/**
 * Globale Hülle der Oberfläche für die Querschnitts-Specs mobile-ux, layout und theme (Review 2, M1): Kopf und
 * Tab-Leiste, Filter-Sheet, die Overlays, die Dialog-Hülle und Toasts. Styles stehen in FULL. Icons und
 * Kategorieformen gehören dazu, weil sie in jeder Ansicht stehen; über Chrome.tsx sind sie ohnehin in der Hülle.
 */
const SHELL: readonly RegExp[] = [
  /^src\/ui\/(Chrome|Sheets|Overlays|Dialog|Toast|icons)\.tsx$/,
  /^src\/ui\/categories\.ts$/,
];

/** `scripts/build-data.ts` schreibt site.json, anbieter.json, wegzeit.json, linien.json, ICS-Dateien und Vorschauseiten. */
const BUILD_DATA = /^scripts\/build-data\.ts$/;
/** Vorschauseiten zum Teilen und 404.html (Plan 0026). */
const SHARE_PAGES = /^scripts\/lib\/share-pages\.ts$/;
/** Kachelbilder je Angebot (Plan 0026, Nachtrag A), im Deploy- und im Fixture-Build gerendert. */
const OG_IMAGES = /^scripts\/(og-images|lib\/(og-card|og-engine))\.ts$/;
/** Service-Worker-Build (`sw.js`, Precache-Liste). */
const VITE_SW = /^scripts\/vite-sw\.ts$/;

/** Je Spec: welche Dateien sie über die Oberfläche treibt. Reihenfolge wie `ls e2e/*.spec.ts`. */
export const SPEC_COVERS: Readonly<Record<string, readonly RegExp[]>> = {
  // Inhalt der Anbieterliste und des Anbieter-Sheets: Sortierung nach Wegzeit oder Luftlinie, Suche, Sticker-Filter.
  // Liest anbieter.json und wegzeit.json aus build-data.ts.
  "e2e/anbieter-inhalt.spec.ts": [
    /^src\/ui\/anbieter\//,
    /^src\/ui\/ProviderSearch\.tsx$/,
    /^src\/ui\/use-transit\.ts$/,
    /^src\/domain\/directory\.ts$/,
    BUILD_DATA,
  ],
  // Tab „Anbieter“: Lazy-Laden von Chunk und Katalog, Sheet über Detail und History (Overlays, use-app-state),
  // Fehler, Datenstand-Abgleich, Privatsphäre. Liest anbieter.json aus build-data.ts.
  "e2e/anbieter.spec.ts": [
    /^src\/ui\/(ProviderPanel|ProviderSearch|Overlays)\.tsx$/,
    /^src\/ui\/(provider-types|use-app-state)\.ts$/,
    /^src\/ui\/anbieter\//,
    /^src\/data\/providers\.ts$/,
    /^src\/domain\/(directory|provider-count)\.ts$/,
    BUILD_DATA,
  ],
  // Kern „Entdecken“: Liste nach Tagen, Schnellfilter und Sticker in der URL, Filter-Sheet, Altersfilter mit
  // Geburtsdatum im Kind-Sheet, Kategorie-Etikett auf der Kachel, Lade- und Fehlerzustand von site.json.
  // App.tsx steht nur hier: Jede Änderung in src/ui/ erreicht App.tsx, app.spec läuft also immer mit (B3).
  "e2e/app.spec.ts": [
    /^src\/ui\/(App|ListView|OfferCard|Sheets|Chrome|KidSheet)\.tsx$/,
    /^src\/main\.tsx$/,
    /^src\/ui\/(use-offer-views|use-app-state|categories)\.ts$/,
    /^src\/data\/site\.ts$/,
    /^src\/domain\/(filter|age|route|topics|category-look)\.ts$/,
  ],
  // Detail: Dialog, History und Deep-Link (Overlays, use-app-state), ICS aus dem Browser und als statische Datei
  // (build-data.ts), Texte (format.ts), Anmeldefrist, Alter, Route in Google Maps (Ways), Toasts im Dialog.
  "e2e/detail.spec.ts": [
    /^src\/ui\/(DetailDialog|Overlays|Dialog|Ways|Toast)\.tsx$/,
    /^src\/ui\/(use-app-state|ics-export|format)\.ts$/,
    /^src\/domain\/(age|ics|ics-paths|ics-types|labels|maps-link|registration)\.ts$/,
    BUILD_DATA,
  ],
  // Schrift-Swap mit echten Daten (Projekt smoke-echte-daten): Deploy-Build aus data/.
  "e2e/font-swap.smoke.spec.ts": [/^data\//, BUILD_DATA],
  // Schrift-Swap mit Fixture-Daten auf der Startseite: Kopf, Liste und Kacheln bestimmen, was sich verschieben kann.
  "e2e/font-swap.spec.ts": [/^src\/ui\/(Chrome|ListView|OfferCard)\.tsx$/],
  // Abschnitt „Als App“ im Kind-Sheet: Lazy-Kette AppExtras → app-extras/, Installationszustände, Fehler beim Laden.
  "e2e/installieren.spec.ts": [
    /^src\/ui\/(AppExtras|KidSheet|Lazy)\.tsx$/,
    /^src\/ui\/app-extras\/AppSection\.tsx$/,
    /^src\/data\/(pwa|pwa-start)\.ts$/,
    /^src\/domain\/pwa\.ts$/,
  ],
  // Karte: Lader (MapPanel, Lazy), Oberfläche karte/, MapLibre map/, Kacheln, Kamera-Regel mit Standort und
  // Kartenmitte (origin-state), Wegzeit beim Öffnen (use-transit), Orts-Sheet mit Linien (ReachLong), Marker mit
  // Kategorie-Symbol (categories), Fehler beim Laden.
  "e2e/karte.spec.ts": [
    /^src\/ui\/(karte|map)\//,
    /^src\/ui\/(MapPanel|Lazy|ReachLong)\.tsx$/,
    /^src\/ui\/(map-types|origin-state|use-transit|categories)\.ts$/,
    /^src\/data\/tiles\.ts$/,
    /^src\/domain\/(camera|places|geo|category-look)\.ts$/,
  ],
  // Querschnitt Layout über Breiten, Lagen und Textgrößen: nur die globale Hülle (Review 2, M1).
  // SHELL plus die Filterzeile der Merkliste: Abstand zur Statuszeile (Plan 0025, Etappe 4)
  "e2e/layout.spec.ts": [...SHELL, /^src\/ui\/SavedFilters\.tsx$/],
  // Gemerkte Anbieter: Herz in Liste und Sheet, Reihenfolge im Tab, Suche, Privatsphäre (preferences, useSavedProviders).
  "e2e/merkliste-anbieter.spec.ts": [
    /^src\/ui\/anbieter\//,
    /^src\/ui\/(ProviderPanel|ProviderSearch)\.tsx$/,
    /^src\/ui\/use-app-state\.ts$/,
    /^src\/data\/preferences\.ts$/,
  ],
  // Kalender der Merkliste (Plan 0025, E5): Woche, Monatsraster, Liste der gemerkten Termine der Auswahl, Umschalter
  // der Merkliste (SavedView), „jetzt“ per Timer und visibilitychange (useNow), Detail am Tag, passend zum Alter.
  // Für agenda.ts und calendar.ts die maßgebliche Prüfung.
  "e2e/merkliste-kalender.spec.ts": [
    /^src\/ui\/(SavedCalendar|SavedView)\.tsx$/,
    /^src\/ui\/(use-offer-views|use-app-state)\.ts$/,
    /^src\/data\/preferences\.ts$/,
    /^src\/domain\/(agenda|calendar|time|saved|age)\.ts$/,
  ],
  // Querschnitt Mobile-UX-Gates je Ansicht: die globale Hülle (Review 2, M1), dazu die Vorschauseite ohne JS und
  // 404.html, die nur diese Spec durch die Gates schickt (share-pages.ts).
  "e2e/mobile-ux.spec.ts": [...SHELL, SHARE_PAGES],
  // Web-Vitals der Startseite unter Drosselung, Wegzeit mit gespeichertem Stadtteil ohne Flackern.
  "e2e/perf.spec.ts": [
    /^src\/ui\/(Chrome|ListView|OfferCard)\.tsx$/,
    /^src\/ui\/use-transit\.ts$/,
    /^src\/data\/transit\.ts$/,
  ],
  // Wochen-Nachricht: Push-Teil im Abschnitt „Als App“, Geräte-Speicher, Zuschnitt im Service Worker.
  "e2e/push.spec.ts": [
    /^src\/ui\/AppExtras\.tsx$/,
    /^src\/ui\/app-extras\//,
    /^src\/data\/(push|device-store|searches-store)\.ts$/,
    /^src\/domain\/(searches|news|push-payload|push-types)\.ts$/,
    /^src\/sw\/(sw|push-decision|push-tailor|resubscribe)\.ts$/,
    VITE_SW,
  ],
  // Installierbare App und Service Worker: Manifest, Precache (vite-sw.ts), offline, Laufzeit-Cache von site.json
  // und wegzeit.json (build-data.ts), Vorschauseite mit aktivem Service Worker (share-pages.ts), „Alle Termine“
  // offline (ics-export).
  "e2e/pwa.spec.ts": [
    /^src\/sw\//,
    VITE_SW,
    /^src\/data\/(pwa|pwa-start|site)\.ts$/,
    /^src\/domain\/pwa\.ts$/,
    /^src\/ui\/ics-export\.ts$/,
    SHARE_PAGES,
    BUILD_DATA,
  ],
  // Merkliste: Herz und Badge (OfferCard, useSaved), Sammel-ICS aus dem Browser, Export-Chunk, Kopf und Umschalter
  // Liste | Karte (MapPanel), passend zum Alter. ICS-Dateien aus build-data.ts.
  "e2e/saved.spec.ts": [
    /^src\/ui\/(SavedView|SavedFilters|OfferCard|MapPanel)\.tsx$/,
    /^src\/ui\/(ics-export|use-app-state|use-offer-views)\.ts$/,
    /^src\/data\/preferences\.ts$/,
    /^src\/domain\/(saved|ics|age)\.ts$/,
    BUILD_DATA,
  ],
  // Deploy-Build mit echten Daten: data/, alle Ausgaben von build-data.ts, Vorschauseiten und Kachelbilder, der
  // Service Worker im Deploy-Build („mit Service Worker“).
  "e2e/smoke.spec.ts": [/^data\//, BUILD_DATA, SHARE_PAGES, OG_IMAGES, VITE_SW, /^src\/sw\//],
  // Startpunkt und Wegzeit: Kind-Sheet und OriginPicker, Standort, Stadtteil, Tabelle und Linien (use-transit,
  // transit.ts), Rückfall auf die Luftlinie, Wegzeit-Filter im Filter-Sheet, Linien und Route im Detail.
  // Liest wegzeit.json und linien.json aus build-data.ts.
  "e2e/startpunkt.spec.ts": [
    /^src\/ui\/(KidSheet|OriginPicker|ReachLong|Ways|Sheets)\.tsx$/,
    /^src\/ui\/(origin-state|use-transit|use-app-state|format)\.ts$/,
    /^src\/data\/(geolocation|transit|preferences)\.ts$/,
    /^src\/domain\/(reach|transit|transit-types|districts|geo|stored-origin|maps-link)\.ts$/,
    BUILD_DATA,
  ],
  // Teilen: Knopf im Detail und im Anbieter-Sheet (useShare), Rückfall-Sheet mit Link (Sheets), Vorschauseiten,
  // 404.html und Kachelbilder aus dem Build.
  "e2e/teilen.spec.ts": [
    /^src\/ui\/(DetailDialog|Sheets)\.tsx$/,
    /^src\/ui\/anbieter\/ProviderSheet\.tsx$/,
    /^src\/ui\/use-app-state\.ts$/,
    /^src\/data\/share\.ts$/,
    /^src\/domain\/(share|ids)\.ts$/,
    SHARE_PAGES,
    OG_IMAGES,
    BUILD_DATA,
  ],
  // Querschnitt Darstellung hell/dunkel: die globale Hülle (Review 2, M1), dazu die Wahl im Kind-Sheet (useTheme).
  "e2e/theme.spec.ts": [...SHELL, /^src\/ui\/KidSheet\.tsx$/, /^src\/ui\/use-app-state\.ts$/],
  // „Heute“ als Berliner Tag in der Liste und im Kalender der Merkliste.
  "e2e/timezone.spec.ts": [/^src\/ui\/(ListView|SavedCalendar)\.tsx$/, /^src\/domain\/time\.ts$/],
  // Zeitraumfilter: von/bis im Filter-Sheet, Liste am Termin im Zeitraum, Detail eines Kurses (den Kalender der
  // Merkliste betrifft der Zeitraum nicht, Plan 0025, E5).
  "e2e/zeitraum.spec.ts": [
    /^src\/ui\/(Sheets|ListView)\.tsx$/,
    /^src\/ui\/use-offer-views\.ts$/,
    /^src\/domain\/(date-range|filter)\.ts$/,
  ],
};

/**
 * Ist ein GEÄNDERTER Pfad einer davon, läuft die volle Suite (B3). Gilt nicht für die Hülle (Review 2, M1).
 * Abhängigkeiten, Build- und Testkonfiguration, Fixtures, statische Dateien, Styles und die E2E-Grundlagen.
 */
export const FULL: readonly RegExp[] = [
  /^(package\.json|pnpm-lock\.yaml|\.nvmrc|index\.html)$/,
  /^public\//,
  /^tests\/fixtures\//,
  /^\.github\//,
  /(^|\/)tsconfig[^/]*\.json$/,
  /^(vite\.config|playwright\.config|playwright\.devices|site\.config)\.ts$/,
  BUILD_DATA,
  // Styles: wirken auf jede Ansicht, die Mobile-UX-Gates prüfen sie überall
  /^src\/[^\0]+\.css$/,
  // globalSetup der Playwright-Konfiguration, von keiner Spec importiert
  /^e2e\/global-setup\.ts$/,
];

/**
 * Module, die nur Tests importieren (B6.3). Der Wächter prüft, dass sie wirklich nur aus Tests importiert werden.
 * - `src/domain/test-fixtures.ts`: Testdaten der Unit-Tests der Domäne.
 */
export const TEST_ONLY: readonly string[] = ["src/domain/test-fixtures.ts"];

/** Ohne E2E, wenn die Hülle keine Spec erreicht (B3). */
export const NO_E2E: readonly RegExp[] = [
  // Unit-Tests
  /\.test\.tsx?$/,
  // Skripte: Pipeline, Wegzeit-Build, Gates und Werkzeuge. Was der Build ausführt, erreicht seine Specs über den
  // Graphen (build-data.ts, og-images.ts, vite-sw.ts stehen in SPEC_COVERS); ein neuer Build-Schritt braucht
  // package.json und läuft damit voll.
  /^scripts\//,
  /^docs\//,
  /^\.claude\//,
  // echte Daten: erreichen nur die Smoke-Specs (SPEC_COVERS), die Geräte-Specs laufen mit tests/fixtures/
  /^data\//,
  /^push-worker\//,
  // Export von src/domain/schema.ts (schema:check) und die Vorlage der Icons (scripts/icons.ts schreibt public/)
  /^(schema|design)\//,
  // Konfiguration der statischen Gates und der Unit-Tests; check prüft sie, E2E liest sie nicht
  /^(biome\.json|knip\.jsonc|lefthook\.yml|\.dependency-cruiser\.cjs|\.size-limit\.json|vitest\.(config|setup)\.ts)$/,
  // nur Typen der Vite-Umgebung; tsc prüft sie
  /^src\/env\.d\.ts$/,
  ...TEST_ONLY.map((p) => new RegExp(`^${p.replaceAll(".", "\\.")}$`)),
];

/** Smoke-Specs laufen im Projekt mit echten Daten (Job smoke, testMatch `/smoke\.spec\.ts/`). */
export const SMOKE_SPECS: readonly string[] = ["e2e/smoke.spec.ts", "e2e/font-swap.smoke.spec.ts"];

/** Module unter src/ui/ und src/sw/, die keine Spec außer app.spec nennt, mit Begründung (B6.3). */
export const UNCOVERED_UI: Readonly<Record<string, string>> = {
  "src/ui/App.tsx": "Kern der App, steht nur bei app.spec (B3); jede andere Spec lädt ihn ohnehin",
};

export const E2E_MAP: E2eMap = { covers: SPEC_COVERS, full: FULL, noE2e: NO_E2E, smoke: SMOKE_SPECS };
