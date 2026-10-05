/**
 * Installierbare App und Service Worker (Plan 0011, E2, E4, E4a, E6; ADR 0013). Nur Chromium (`pixel-7`, `desktop`):
 * WebKit prüft der Browser-Review auf einem echten iPhone (Schritt 6). Global blockiert `playwright.config.ts` den
 * Service Worker, diese Datei erlaubt ihn.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

test.use({ serviceWorkers: "allow" });
test.skip(
  () => !["pixel-7", "desktop"].includes(test.info().project.name),
  "Service Worker nur in Chromium (pixel-7, desktop); WebKit prüft der Browser-Review am iPhone (E6)",
);

interface Manifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  id?: string;
  display?: string;
  lang?: string;
  icons?: Array<{ src: string; sizes: string; purpose?: string }>;
}

/** Bildmaße und kleinster Alpha-Wert, im Browser gelesen (gleicher Origin, Canvas) */
function imageInfo(page: Page, url: string) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("kein Canvas");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minAlpha = 255;
    for (let i = 3; i < data.length; i += 4) minAlpha = Math.min(minAlpha, data[i] ?? 0);
    return { width: img.naturalWidth, height: img.naturalHeight, minAlpha };
  }, url);
}

test("1 Manifest verlinkt und gültig, Icons erreichbar, apple-touch-icon deckend (E2)", async ({ page }) => {
  await page.goto("./");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href, "Manifest verlinkt").toBeTruthy();
  const manifestUrl = new URL(href ?? "", page.url()).href;
  const res = await page.request.get(manifestUrl);
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as Manifest;
  expect(manifest).toMatchObject({
    name: "Zwergenplan",
    short_name: "Zwergenplan",
    start_url: "./",
    scope: "./",
    id: "./",
    display: "standalone",
    lang: "de",
  });
  const icons = manifest.icons ?? [];
  const sizes = new Set<string>();
  for (const icon of icons) {
    const url = new URL(icon.src, manifestUrl).href;
    const info = await imageInfo(page, url);
    expect(`${info.width}x${info.height}`, icon.src).toBe(icon.sizes);
    sizes.add(`${icon.sizes} ${icon.purpose ?? "any"}`);
  }
  expect([...sizes].sort()).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);

  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  const touchInfo = await imageInfo(page, new URL(touch ?? "", page.url()).href);
  expect(touchInfo).toEqual({ width: 180, height: 180, minAlpha: 255 });
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect((await page.request.get(new URL(favicon ?? "", page.url()).href)).ok()).toBe(true);
});
