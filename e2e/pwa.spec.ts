/**
 * Installierbare App und Service Worker (Plan 0011, E2, E4, E4a, E6; ADR 0013). Nur Chromium (`pixel-7`, `desktop`):
 * WebKit prüft der Browser-Review auf einem echten iPhone (Schritt 6). Global blockiert `playwright.config.ts` den
 * Service Worker, diese Datei erlaubt ihn.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { expect, MAP_READY, test } from "./fixtures.ts";
import { expectMobileUx } from "./mobile-ux.ts";

/** Fixture-Datenstand (tests/fixtures/offers.json, generatedAt 5.10.2026) */
const OFFLINE_NOTE = "Offline – Stand vom 5.10.";
const WEGZEIT_GOSTENHOF = "Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, inkl. Warten)";
const offers = (page: Page) => page.getByTestId("offer");
const isSite = (url: string) => new URL(url).pathname.endsWith("/data/site.json");

/** Seite laden und warten, bis der Service Worker aktiv ist und die Seite kontrolliert (clients.claim). */
async function installed(page: Page, path = "./") {
  await page.goto(path);
  await expect(offers(page).first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** Der aktive Service Worker des Kontexts (Chromium) */
async function worker(context: BrowserContext) {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}

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

test("2 Service Worker wird aktiv und kontrolliert die Seite nach dem Neuladen (E3)", async ({ page, context }) => {
  await installed(page);
  await page.reload();
  await expect(offers(page).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/sw\.js$/);
  expect(new URL((await worker(context)).url()).pathname).toBe("/sw.js");
});

test("3 Kanarienvogel: offline scheitert auch ein fetch aus dem Service Worker (E6)", async ({ page, context }) => {
  await installed(page);
  const sw = await worker(context);
  const probe = () =>
    sw.evaluate(() =>
      fetch("data/meta.json", { cache: "no-store" }).then(
        () => "ok",
        () => "fehler",
      ),
    );
  expect(await probe(), "online").toBe("ok");
  await context.setOffline(true);
  expect(await probe(), "offline").toBe("fehler");
});

test.describe("offline", () => {
  // Offline scheitert ein Lazy-Chunk, der nie geladen wurde: das Vorladen des Export-Codes (Plan 0010, E8 A; nicht im
  // Precache, E3) meldet sich als Ladefehler in der Konsole. Die App fängt ihn ab (Toast erst beim Export).
  test.use({ allowedConsoleErrors: [/\/assets\/export\/[^/ ]+\.js Failed to load resource: net::ERR_FAILED$/] });

  test("4 offline nach dem ersten Besuch: Liste und „Offline – Stand vom …“ aus dem Precache (E4)", async ({
    page,
    context,
  }) => {
    await installed(page);
    await context.setOffline(true);
    await page.reload();
    await expect(offers(page).first()).toBeVisible();
    await expect(page.getByRole("status")).toContainText(OFFLINE_NOTE);
    await expect(page.getByRole("status")).toContainText("8 Angebote ab heute");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectMobileUx(page);
    }
  });

  test("5 Kalender-Datei offline: Seite bleibt stehen, Toast „Kalender-Datei braucht Netz“ (E4, Regel 2)", async ({
    page,
    context,
  }) => {
    await installed(page);
    await offers(page).first().getByRole("heading").getByRole("button").click();
    const detail = page.getByRole("dialog");
    await expect(detail).toBeVisible();
    const url = page.url();
    await context.setOffline(true);
    await detail.locator('a[href*="/ics/"]').first().click();
    await expect(page.getByText("Kalender-Datei braucht Netz")).toBeVisible();
    expect(page.url()).toBe(url);
    await expect(detail).toBeVisible();
  });

  test("7 wieder online: Die Statuszeile verliert „Offline“ ohne Neustart (E4a)", async ({ page, context }) => {
    await installed(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("status")).toContainText(OFFLINE_NOTE);
    const fresh = page.waitForResponse((r) => isSite(r.url()) && r.headers()["x-zp-cache"] === undefined);
    // setOffline(false) löst in Chromium das Ereignis `online` aus (geprüft: ohne eigenes Ereignis grün)
    await context.setOffline(false);
    await fresh;
    await expect(page.getByRole("status")).not.toContainText("Offline");
    await expect(page.getByRole("status")).toContainText("8 Angebote ab heute");
  });
});

test("6 online kommt site.json aus dem Netz (ohne X-Zp-Cache), durch den Service Worker (E4)", async ({ page }) => {
  await installed(page);
  const site = page.waitForResponse((r) => isSite(r.url()));
  await page.reload();
  const response = await site;
  expect(response.fromServiceWorker(), "über den Service Worker").toBe(true);
  expect(response.headers()["x-zp-cache"]).toBeUndefined();
  await expect(page.getByRole("status")).not.toContainText("Offline");
});

test("Frische-Anlass nach 30 Min.: Wegzeit bleibt, genau ein weiterer Request auf wegzeit.json (E4a)", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
  await installed(page);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await expect(page.locator("html")).toHaveAttribute("data-pwa", "bereit");
  const tables: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.endsWith("/data/wegzeit.json")) tables.push(req.url());
  });
  const site = page.waitForResponse((r) => isSite(r.url()));
  const table = page.waitForResponse((r) => r.url().endsWith("/data/wegzeit.json"));
  // 31 Minuten später kehrt die App zurück (die Seite ist sichtbar, das Ereignis kommt vom System)
  await page.clock.setFixedTime(new Date("2026-10-05T12:31:00+02:00"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await Promise.all([site, table]);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await expect(page.locator(".meta .dist").filter({ hasText: "km" })).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(tables).toHaveLength(1);
});

test.describe("Laufzeit-Cache der Daten (Arch-Review Stufe 1, B1)", () => {
  // wie „offline“: Das Vorladen des Export-Codes scheitert offline, wenn der Chunk nie geladen wurde
  test.use({ allowedConsoleErrors: [/\/assets\/export\/[^/ ]+\.js Failed to load resource: net::ERR_FAILED$/] });

  test("(a) Wegzeit-Tabelle kommt nach einem Online-Besuch offline aus zp-data (E4, Regel 5)", async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await installed(page);
    // zweiter Besuch online: Tabelle und Rechenlogik laufen jetzt durch den Service Worker
    const table = page.waitForResponse((r) => r.url().endsWith("/data/wegzeit.json") && r.ok());
    await page.reload();
    expect((await table).fromServiceWorker()).toBe(true);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("status")).toContainText(OFFLINE_NOTE);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  });

  test("(b) jeder Online-Abruf erneuert site.json in zp-data (E4, Regel 4)", async ({ page }) => {
    await installed(page);
    const url = new URL("data/site.json", page.url()).href;
    // Kopie vom Install durch eine erkennbar alte ersetzen
    await page.evaluate(async (u) => {
      const data = await caches.open("zp-data");
      await data.put(u, new Response(JSON.stringify({ generatedAt: "alt", offers: [] })));
    }, url);
    const site = page.waitForResponse((r) => isSite(r.url()));
    await page.reload();
    await site;
    await expect
      .poll(() =>
        page.evaluate(async (u) => {
          const copy = await (await caches.open("zp-data")).match(u);
          const json: unknown = await copy?.json();
          return typeof json === "object" && json !== null && "generatedAt" in json ? json.generatedAt : undefined;
        }, url),
      )
      .toBe("2026-10-05T06:00:00+02:00");
  });
});

test.describe("Karte", () => {
  test.use({ tiles: "mock" });

  test("8 kein fremder Origin im Cache: Kacheln bleiben draußen (ADR 0008)", async ({ page }) => {
    await installed(page);
    await page.reload();
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", MAP_READY);
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
      }
      return urls;
    });
    expect(cached.length, "eigene Einträge im Cache").toBeGreaterThan(0);
    expect(cached.filter((url) => new URL(url).origin !== new URL(page.url()).origin)).toEqual([]);
    expect(
      cached.some((url) => url.includes("/assets/karte/")),
      "Karten-Chunk zur Laufzeit im Cache",
    ).toBe(true);
  });
});
