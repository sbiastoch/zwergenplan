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
const WEGZEIT_GOSTENHOF = "Wegzeit ab Gostenhof";
/** Beispielhof ab Gostenhof direkt mit Tram 1 (Plan 0012, E1; Fixture wie in startpunkt.spec.ts) */
const KRABBELTREFF_TRAM = "ca. 15 Min. mit Tram\u00a01 ab Gostenhof";
const isTable = (url: string) => new URL(url).pathname.endsWith("/data/wegzeit.json");
const isLines = (url: string) => new URL(url).pathname.endsWith("/data/linien.json");
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
// Notausgang (README): Mit ZWERGENPLAN_SW=aus gibt es bewusst keinen Service Worker, der kontrollieren oder cachen könnte.
test.skip(process.env["ZWERGENPLAN_SW"] === "aus", "Notausgang aktiv: Build ohne Service Worker (README)");
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

// Ohne erlaubte Konsolenfehler: Auch der Export-Code, den die App im Leerlauf vorlädt, liegt im Precache (Arch-Review
// Stufe 1, H7). Ein Ladefehler offline wäre rot.
test.describe("offline", () => {
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

/**
 * Live (Browser-Review, B1): Die echte site.json (≈ 600 KB) ist oft erst nach `load` gelesen, also nach dem Start des
 * PWA-Kerns. Hier hält ein Init-Skript die Antwort zurück, bis der Kern läuft (`data-pwa="bereit"`).
 */
async function holdSiteUntilPwaReady(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const pwaReady = new Promise<void>((resolve) => {
      const check = () => {
        if (document.documentElement?.dataset["pwa"] === "bereit") {
          observer.disconnect();
          setTimeout(resolve, 300);
        }
      };
      const observer = new MutationObserver(check);
      // Init-Skripte laufen vor dem Parsen: <html> gibt es noch nicht, deshalb das Dokument samt Unterbaum
      observer.observe(document, { attributes: true, subtree: true, attributeFilter: ["data-pwa"] });
    });
    window.fetch = (input, init) => {
      const response = original(input, init);
      const url = input instanceof Request ? input.url : String(input);
      return url.includes("data/site.json") ? pwaReady.then(() => response) : response;
    };
  });
}

test("offline: site.json kommt erst nach dem Start des PWA-Kerns, die Zeile erscheint trotzdem (Browser-Review live, B1)", async ({
  page,
  context,
}) => {
  await installed(page);
  await holdSiteUntilPwaReady(page);
  await context.setOffline(true);
  await page.reload();
  await expect(offers(page).first()).toBeVisible();
  await expect(page.getByRole("status")).toContainText(OFFLINE_NOTE);
});

test("H5 mit später Antwort: Kopie trotz Netz nach dem Start des Kerns → nach 30 s frischer Stand (Browser-Review live, B1)", async ({
  page,
}) => {
  await installed(page);
  // online, aber der Service Worker hätte die Kopie geliefert (5-s-Zeitlimit): Antwort mit X-Zp-Cache, erst nach
  // dem Start des Kerns. Der nächste Abruf (der Wiederholer) geht normal durchs Netz.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    let first = true;
    const pwaReady = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.documentElement?.dataset["pwa"] !== "bereit") return;
        observer.disconnect();
        setTimeout(resolve, 300);
      });
      observer.observe(document, { attributes: true, subtree: true, attributeFilter: ["data-pwa"] });
    });
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!first || !url.includes("data/site.json")) return original(input, init);
      first = false;
      const res = await original(input, init);
      await pwaReady;
      const headers = new Headers(res.headers);
      headers.set("X-Zp-Cache", "offline");
      return new Response(await res.text(), { status: res.status, headers });
    };
  });
  await page.reload();
  await expect(page.getByRole("status")).toContainText(OFFLINE_NOTE);
  const fresh = page.waitForResponse((r) => isSite(r.url()));
  await page.clock.fastForward(31_000);
  await fresh;
  await expect(page.getByRole("status")).not.toContainText("Offline");
});

// E6, Punkt 5: ausdrücklich ohne erlaubte Konsolenfehler (204 statt Netzfehler)
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
  const lines: string[] = [];
  page.on("request", (req) => {
    if (isTable(req.url())) tables.push(req.url());
    if (isLines(req.url())) lines.push(req.url());
  });
  const site = page.waitForResponse((r) => isSite(r.url()));
  const table = page.waitForResponse((r) => isTable(r.url()));
  const linesLoaded = page.waitForResponse((r) => isLines(r.url()));
  // 31 Minuten später kehrt die App zurück (die Seite ist sichtbar, das Ereignis kommt vom System)
  await page.clock.setFixedTime(new Date("2026-10-05T12:31:00+02:00"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await Promise.all([site, table, linesLoaded]);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await expect(page.locator(".meta .dist").filter({ hasText: "km" })).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(tables, "genau ein weiterer Request auf wegzeit.json").toHaveLength(1);
  expect(lines, "genau ein weiterer Request auf linien.json (Plan 0012)").toHaveLength(1);
});

test.describe("Laufzeit-Cache der Daten (Arch-Review Stufe 1, B1)", () => {
  test("(a) Wegzeit-Tabelle und Linien kommen nach einem Online-Besuch offline aus zp-data (E4, Regel 5)", async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await installed(page);
    // zweiter Besuch online: Tabelle und Rechenlogik laufen jetzt durch den Service Worker
    const table = page.waitForResponse((r) => isTable(r.url()) && r.ok());
    const lines = page.waitForResponse((r) => isLines(r.url()) && r.ok());
    await page.reload();
    expect((await table).fromServiceWorker()).toBe(true);
    expect((await lines).fromServiceWorker(), "linien.json über den Service Worker (Plan 0012)").toBe(true);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("status")).toContainText(OFFLINE_NOTE);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    // Linien offline aus zp-data: das Detail nennt die Tram statt nur „mit Bus & Bahn“
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await expect(page.getByRole("dialog").getByText(KRABBELTREFF_TRAM)).toBeVisible();
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
