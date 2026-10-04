/**
 * Screenshot-Matrix für /browser-review (kein Gate, sondern Futter für die Sichtprüfung).
 *   node scripts/screenshots.ts [URL]   Standard: lokale Preview mit Fixture-Daten
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:4173/zwergenplan/";
const isLocal = url.includes("localhost");
const outDir = "e2e/.artifacts/screens";
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "320", width: 320, height: 640 },
  { name: "iphone", width: 390, height: 844 },
  { name: "pixel", width: 412, height: 915 },
  { name: "quer", width: 915, height: 412 },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  for (const scheme of ["light", "dark"] as const) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    if (isLocal) await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+02:00"));
    await page.goto(url);
    await page.getByRole("status").first().waitFor();
    const file = `${outDir}/${vp.name}-${scheme}.png`;
    await page.screenshot({ path: file, fullPage: false });
    console.log(file);
    await context.close();
  }
}
await browser.close();
