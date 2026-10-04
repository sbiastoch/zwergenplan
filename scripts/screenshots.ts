/**
 * Screenshot-Matrix für /browser-review (kein Gate, sondern Futter für die Sichtprüfung).
 *   node scripts/screenshots.ts [URL] [--views=start,kalender,…]   Standard: lokale Preview mit Fixture-Daten
 * Ansichten: start, kalender, merkliste, detail, filter, kind (Plan 0003).
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:4173/zwergenplan/";
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
