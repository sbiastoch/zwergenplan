/**
 * Screenshot-Matrix für /browser-review (kein Gate, sondern Futter für die Sichtprüfung).
 *   node scripts/screenshots.ts [URL] [--views=start,kalender,…]   Standard: lokale Preview mit Fixture-Daten
 * Ansichten: start, kalender, merkliste, detail, filter, kind (Plan 0003), karte, ort (Plan 0005).
 * Lokal kommen die Kartenkacheln aus tests/fixtures/karte/ (wie in E2E), live echt von OpenFreeMap.
 */
import { existsSync, mkdirSync } from "node:fs";
import { type BrowserContext, chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:4173/";
const viewsArg = args.find((a) => a.startsWith("--views="))?.slice("--views=".length);
const isLocal = url.includes("localhost");
const outDir = "e2e/.artifacts/screens";
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "320", width: 320, height: 640 },
  { name: "iphone", width: 390, height: 844 },
  { name: "pixel", width: 412, height: 915 },
  { name: "quer", width: 915, height: 412 },
];

async function ready(page: Page) {
  await page.getByRole("status").first().waitFor();
  // Erst auslösen, wenn die Daten geladen sind – sonst zeigt das Bild den Ladezustand (Browser-Review 0002).
  await page.waitForFunction(() => !document.querySelector("[role=status]")?.textContent?.includes("Lade"));
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
      : `tests/fixtures/karte${path}`;
    return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
  });
}

async function openMap(page: Page) {
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await page.locator(".map-box[data-state=bereit]").waitFor({ timeout: 30_000 });
}

/** Jede Ansicht: Weg dorthin, ausgehend von der geladenen Startseite. */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  start: async () => {},
  kalender: async (page) => {
    await page.getByRole("button", { name: "Kalender" }).click();
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
};

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
      await page.waitForTimeout(150);
      const file = `${outDir}/${view}-${vp.name}-${scheme}.png`;
      await page.screenshot({ path: file, fullPage: false });
      console.log(file);
      await context.close();
    }
  }
}
await browser.close();
