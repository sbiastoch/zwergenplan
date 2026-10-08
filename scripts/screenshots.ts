/**
 * Screenshot-Matrix für /browser-review (kein Gate, sondern Futter für die Sichtprüfung).
 *   node scripts/screenshots.ts [URL] [--views=start,merkliste-kalender,…] [--text=200]   Standard: lokale Preview mit
 * Fixtures
 * Ansichten: start, merkliste, detail, filter, kind (Plan 0003), merkliste-kalender (Plan 0025, E8; früher der Tab
 * „kalender“), start-startpunkt (Plan 0004), karte, ort (Plan 0005), filter-wegzeit, kind-quelle (Plan 0009: Filtergruppe „Wegzeit“, Quellenhinweis im Kind-Sheet), anbieter,
 * anbieter-sheet, tabs (Plan 0010: Liste, Sheet, Tab-Leiste mit Badge; im Viewport „quer“ als Seitenleiste), push
 * (Plan 0017: Push-Teil im Kind-Sheet mit langem Such-Abo).
 * Lokal kommen die Kartenkacheln aus tests/fixtures/karte/ (wie in E2E), live echt von OpenFreeMap.
 * --text=200 simuliert große Schrift wie die Gates (Wurzel-Schriftgröße, Plan 0007, E7); Dateien enden auf -200.
 */
import { existsSync, mkdirSync } from "node:fs";
import { type BrowserContext, chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:4173/";
const viewsArg = args.find((a) => a.startsWith("--views="))?.slice("--views=".length);
const textArg = args.find((a) => a.startsWith("--text="))?.slice("--text=".length);
const textPercent = textArg ? Number.parseInt(textArg, 10) : 100;
if (!Number.isFinite(textPercent) || textPercent < 50 || textPercent > 400)
  throw new Error(`--text=${textArg} ungültig`);
const isLocal = url.includes("localhost");
const outDir = "e2e/.artifacts/screens";
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "320", width: 320, height: 640 },
  { name: "360", width: 360, height: 740 },
  { name: "365", width: 365, height: 740 },
  { name: "iphone", width: 390, height: 844 },
  { name: "pixel", width: 412, height: 915 },
  { name: "quer", width: 915, height: 412 },
];

async function ready(page: Page) {
  await page.getByRole("status").first().waitFor();
  // Erst auslösen, wenn die Daten geladen sind – sonst zeigt das Bild den Ladezustand (Browser-Review 0002).
  await page.waitForFunction(() => !document.querySelector("[role=status]")?.textContent?.includes("Lade"));
}

/**
 * Startpunkt Gostenhof: Nur die Stadtteil-ID liegt im Speicher (Plan 0004, E3), nach dem Neuladen gilt sie. Wartet,
 * bis die Wegzeit geladen ist (Plan 0009, E11), sonst zeigt das Bild die Platzhalter.
 */
async function withGostenhof(page: Page) {
  await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
  await page.reload();
  await ready(page);
  await page.locator(".status-reach:not(.pending)").waitFor();
}

/** Kachel-Mock für die lokale Preview (wie e2e/fixtures.ts, tiles: "mock"): Stile, Glyphen, leere Kacheln. */
async function mockTiles(context: BrowserContext) {
  await context.route("https://tiles.openfreemap.org/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path.startsWith("/planet/")) {
      return route.fulfill({ status: 200, contentType: "application/x-protobuf", body: Buffer.alloc(0) });
    }
    const file = path.startsWith("/styles/")
      ? `tests/fixtures/karte/${path.slice("/styles/".length)}.json`
      : path === "/planet"
        ? "tests/fixtures/karte/planet.json"
        : `tests/fixtures/karte${path}`;
    return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
  });
}

/** Karte mit Stadtteil Gostenhof (Werkzeugzeile und Orts-Liste mit Wegzeit) */
async function openMap(page: Page) {
  await withGostenhof(page);
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await page.locator(".map-box[data-state=bereit]").waitFor({ timeout: 30_000 });
}

/** Jede Ansicht: Weg dorthin, ausgehend von der geladenen Startseite. */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  start: async () => {},
  // Kalender der Merkliste (Plan 0025, E8): Herzen statt localStorage, damit es auch live mit echten IDs geht
  "merkliste-kalender": async (page) => {
    for (const heart of (await page.getByRole("button", { name: / merken$/ }).all()).slice(0, 3)) await heart.click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
  },
  merkliste: async (page) => {
    for (const heart of (await page.getByRole("button", { name: / merken$/ }).all()).slice(0, 2)) await heart.click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
  },
  detail: async (page) => {
    await page.getByTestId("offer").first().getByRole("heading").getByRole("button").click();
    await page.getByRole("dialog").waitFor();
  },
  filter: async (page) => {
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
  },
  kind: async (page) => {
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.getByLabel("Geburtsdatum").fill("02.11.2025");
    // Startpunkt (Plan 0004): Abschnitt „Wegzeit ab“ mit gesetztem Stadtteil
    await page.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  },
  // Quellenhinweis der Wegzeit mit zwei Links (Plan 0009, E3), aus der geladenen wegzeit.json
  "kind-quelle": async (page) => {
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
    const license = page.locator(".source-note a").last();
    await page.locator(".source-note a").nth(1).waitFor();
    await license.scrollIntoViewIfNeeded();
  },
  // Push-Teil (Plan 0017, E7): lange Suche abonniert, Abschnitt „Als App“ im Blick. Mit der Headless-Shell sind
  // Benachrichtigungen immer abgelehnt, man sieht also den Zustand „verweigert“ (Schalter gesperrt).
  push: async (page) => {
    await page.goto(
      new URL(
        "?kat=musik,natur,krabbel-spielgruppen&format=kurs&anmeldung=ohne-anmeldung&kosten=kostenlos&wegzeit=20",
        page.url(),
      ).href,
    );
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.locator('html[data-push="bereit"]').waitFor();
    const subscribe = page.getByRole("button", { name: "Suche abonnieren" });
    if (await subscribe.count()) await subscribe.click();
    await page.getByRole("heading", { name: "Deine Such-Abos" }).scrollIntoViewIfNeeded();
  },
  "start-startpunkt": async (page) => {
    await withGostenhof(page);
  },
  "filter-wegzeit": async (page) => {
    await withGostenhof(page);
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await sheet.getByRole("button", { name: "bis 30 Min." }).click();
    await sheet.getByRole("heading", { name: "Wegzeit" }).scrollIntoViewIfNeeded();
  },
  karte: openMap,
  ort: async (page) => {
    await openMap(page);
    await page
      .getByRole("region", { name: "Orte" })
      .getByRole("button")
      .filter({ hasText: "Angebote" })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
  },
  anbieter: openProviders,
  // erste Zeile der Liste (ohne Startpunkt alphabetisch)
  "anbieter-sheet": async (page) => {
    await openProviders(page);
    await page.getByRole("region", { name: "Anbieter" }).locator(".place").first().click();
    await page.getByRole("dialog", { name: "Anbieter" }).getByRole("heading", { level: 2 }).waitFor();
  },
  // Tab-Leiste mit Badge und „Anbieter“ aktiv; im Viewport „quer“ die Seitenleiste (Plan 0010, E2)
  tabs: async (page) => {
    await page
      .getByRole("button", { name: / merken$/ })
      .first()
      .click();
    await openProviders(page);
    // Der Toast „Gemerkt …“ (2,8 s) läge sonst über der Liste
    await page.locator(".toast").waitFor({ state: "detached" });
  },
};

/** Tab „Anbieter“ (Plan 0010), wartet auf die Zeilen statt auf den Ladekasten */
async function openProviders(page: Page) {
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: /^Anbieter/ })
    .click();
  await page.getByRole("region", { name: "Anbieter" }).locator(".place").first().waitFor();
}

const views = viewsArg ? viewsArg.split(",") : Object.keys(VIEWS);
const browser = await chromium.launch();
for (const vp of viewports) {
  for (const scheme of ["light", "dark"] as const) {
    for (const view of views) {
      const go = VIEWS[view];
      if (!go) throw new Error(`Unbekannte Ansicht ${view}`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        colorScheme: scheme,
        reducedMotion: "reduce",
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
      });
      if (isLocal) await mockTiles(context);
      const page = await context.newPage();
      if (isLocal) await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+02:00"));
      await page.goto(url);
      await ready(page);
      await go(page);
      if (textPercent !== 100)
        await page.evaluate((p) => {
          document.documentElement.style.fontSize = `${p}%`;
        }, textPercent);
      await page.waitForTimeout(150);
      const suffix = textPercent === 100 ? "" : `-${textPercent}`;
      const file = `${outDir}/${view}-${vp.name}-${scheme}${suffix}.png`;
      await page.screenshot({ path: file, fullPage: false });
      console.log(file);
      await context.close();
    }
  }
}
await browser.close();
