/**
 * Karte groß (Plan 0059, E8): Vollbild ohne Liste und Tab-Leiste, Detail als Sheet über der Karte, Auswahl-Ring,
 * „Zurück“, Esc, Deep-Link, alle drei Karten, Scroll-Position, Ein-Finger-Geste, Privatsphäre, Fehlerfall.
 * Kacheln aus dem Mock (`tiles: "mock"`); `window.__zpMap` deklariert karte.spec.ts global (TestMap).
 */
import type { Page } from "@playwright/test";
import { expect, MAP_READY, mapIdle, test } from "./fixtures.ts";
import { expectMobileUx } from "./mobile-ux.ts";

test.use({ tiles: "mock" });

/** Orte der Fixtures (tests/fixtures/providers.yaml) */
const BIBLIOTHEK = { lat: 49.4498, lon: 11.0812 }; // ein Angebot: „Krabbelreime & Fingerspiele“
const TREFF = { lat: 49.4521, lon: 11.0767 }; // drei Angebote, ein Anbieter
const PEKIP_ID = "nle21y1x";
const TREFF_ID = "lxizt974";

const mapBox = (page: Page) => page.locator(".map-box");
const grow = (page: Page) => page.getByRole("button", { name: "Karte groß zeigen" });
const shrink = (page: Page) => page.getByRole("button", { name: "Karte verkleinern" });
/** sichtbare Zahl unten links, ohne die Ansage (`.sr-only`) */
const count = (page: Page) => page.locator(".bigmap-count [aria-hidden]");
const tabBar = (page: Page) => page.getByRole("navigation", { name: "Hauptnavigation" });

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);
  await mapIdle(page);
}

async function openBig(page: Page, path = "./?ansicht=karte") {
  await ready(page, path);
  await grow(page).click();
  await expect(page).toHaveURL(/[?&]karte=gross(&|$)/);
  await expect(mapBox(page)).toHaveClass(/\bbig\b/);
  await mapIdle(page);
}

/** fährt ohne Animation hin (Zoom 16: einzelne Marker) */
async function jump(page: Page, at: { lat: number; lon: number }, zoom = 16) {
  await page.evaluate(({ lat, lon, z }) => window.__zpMap?.jumpTo({ center: [lon, lat], zoom: z }), { ...at, z: zoom });
  await mapIdle(page);
}

/** Tipp auf einen Ort; in der großen Karte liegt der Rahmen ohne Rand bei 0/0 */
async function tapPlace(page: Page, at: { lat: number; lon: number }) {
  const point = await page.evaluate(({ lat, lon }) => window.__zpMap?.project([lon, lat]), at);
  if (!point) throw new Error("keine Karte");
  await page.locator(".map-box .map-canvas canvas").click({ position: point });
}

/** Bildschirmhöhe des Orts und Zahl der Punkte im Auswahl-Ring */
async function selection(page: Page, at: { lat: number; lon: number }) {
  return page.evaluate(async ({ lat, lon }) => {
    const map = window.__zpMap;
    const data = await map?.getSource("auswahl")?.getData();
    return { y: map?.project([lon, lat]).y ?? Number.NaN, ring: data?.features.length ?? -1 };
  }, at);
}

test.describe("Karte groß in „Entdecken“", () => {
  test("füllt den Bildschirm, ohne Tab-Leiste und Liste; ein Finger bewegt sie; Esc und Fokus", async ({ page }) => {
    await ready(page, "./?ansicht=karte");
    expect(await page.evaluate(() => window.__zpMap?.cooperativeGestures.isEnabled())).toBe(true);
    await grow(page).click();
    await expect(page).toHaveURL(/\?ansicht=karte&karte=gross$/);
    await expect(shrink(page)).toBeFocused();
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("kein Viewport");
    await expect
      .poll(async () => {
        const box = await page.locator(".map-box .map-canvas canvas").boundingBox();
        return box && [Math.round(box.width), Math.round(box.height)];
      })
      .toEqual([viewport.width, viewport.height]);
    await expect(tabBar(page)).toBeHidden();
    // verborgen, nicht entfernt: Die Liste behält ihren Zustand (E2)
    await expect(page.getByTestId("offer").first()).toBeHidden();
    await expect(count(page)).toHaveText(/^\d+ Angebote/);
    expect(await page.evaluate(() => window.__zpMap?.cooperativeGestures.isEnabled())).toBe(false);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\?ansicht=karte$/);
    await expect(tabBar(page)).toBeVisible();
    await expect(grow(page)).toBeFocused();
    expect(await page.evaluate(() => window.__zpMap?.cooperativeGestures.isEnabled())).toBe(true);
  });

  test("Tipp auf einen Ort mit einem Angebot: Detail als Sheet über der Karte, Ort markiert und sichtbar", async ({
    page,
  }) => {
    await openBig(page);
    // Ort ins untere Drittel: Die Karte muss ihn über das Sheet fahren (E5)
    const height = page.viewportSize()?.height ?? 0;
    await jump(page, BIBLIOTHEK);
    // Ansicht nach oben schieben: Der Ort rückt um 30 % der Höhe nach unten
    await page.evaluate((dy) => window.__zpMap?.panBy([0, -dy], { duration: 0 }), Math.round(height * 0.3));
    await mapIdle(page);
    await tapPlace(page, BIBLIOTHEK);
    const detail = page.getByRole("dialog", { name: "Krabbelreime & Fingerspiele" });
    await expect(detail).toBeVisible();
    await expect(detail).toHaveClass(/\bover-map\b/);
    await mapIdle(page);
    const box = await detail.boundingBox();
    if (!box) throw new Error("kein Detail");
    expect(box.y, "Oberkante des Sheets unter 30 % der Höhe").toBeGreaterThan(height * 0.3);
    const marked = await selection(page, BIBLIOTHEK);
    expect(marked.ring).toBe(1);
    expect(marked.y, "Ort liegt über dem Sheet").toBeLessThan(box.y - 20);

    await detail.getByRole("button", { name: "Detail ganz zeigen" }).click();
    await expect(detail).toHaveClass(/\bvoll\b/);
    await expect(detail.getByRole("button", { name: "Detail verkleinern" })).toHaveAttribute("aria-expanded", "true");

    // Zurück: erst das Detail, dann die große Karte
    await page.goBack();
    await expect(detail).toBeHidden();
    await expect(page).toHaveURL(/karte=gross/);
    await expect.poll(async () => (await selection(page, BIBLIOTHEK)).ring).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(/\?ansicht=karte$/);
    await expect(grow(page)).toBeFocused();
  });

  test("Esc bei offenem Detail schließt nur das Detail; danach schließt Esc die große Karte", async ({ page }) => {
    await openBig(page);
    await jump(page, BIBLIOTHEK);
    await tapPlace(page, BIBLIOTHEK);
    const detail = page.getByRole("dialog", { name: "Krabbelreime & Fingerspiele" });
    await expect(detail).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detail).toBeHidden();
    await expect(page).toHaveURL(/\?ansicht=karte&karte=gross$/);
    // Fokus-Rückweg in der großen Karte: nicht auf <body> (Review M7)
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\?ansicht=karte$/);
  });

  test("Ort mit mehreren Angeboten: Orts-Sheet über der Karte, die Kachel öffnet das Detail als Sheet", async ({
    page,
  }) => {
    await openBig(page);
    await jump(page, TREFF);
    await tapPlace(page, TREFF);
    const sheet = page.getByRole("dialog", { name: "Familientreff Beispielhof" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveClass(/\bover-map\b/);
    expect((await selection(page, TREFF)).ring).toBe(1);
    await sheet.getByRole("button", { name: "Offener Krabbeltreff", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
    await expect(detail).toHaveClass(/\bover-map\b/);
  });

  test("Deep-Link startet groß, ohne Karten-Ansicht wird karte=gross ignoriert", async ({ page }) => {
    await ready(page, "./?ansicht=karte&karte=gross");
    await expect(mapBox(page)).toHaveClass(/\bbig\b/);
    await expect(tabBar(page)).toBeHidden();
    await shrink(page).click();
    await expect(page).toHaveURL(/\?ansicht=karte$/);
    await page.goto("./?karte=gross");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(tabBar(page)).toBeVisible();
  });

  test("Scroll-Position bleibt nach groß und klein erhalten (Review M1)", async ({ page }) => {
    await ready(page, "./?ansicht=karte");
    await page.evaluate(() => window.scrollTo({ top: 300 }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
    // DOM-Klick: Playwrights click() scrollte den Knopf vorher ins Bild und verfälschte die Position
    await grow(page).evaluate((el) => (el instanceof HTMLElement ? el.click() : undefined));
    await expect(mapBox(page)).toHaveClass(/\bbig\b/);
    await shrink(page).click();
    await expect(mapBox(page)).not.toHaveClass(/\bbig\b/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
  });

  test("Filter aus der großen Karte überstehen das Verkleinern (Review 2, N1)", async ({ page }) => {
    await openBig(page);
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await sheet.getByRole("button", { name: "Ohne Anmeldung" }).click();
    await sheet.getByRole("button", { name: "3 Angebote zeigen" }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\?[^&]+&ansicht=karte&karte=gross$/);
    await shrink(page).click();
    await expect(page).toHaveURL(/\?[^&]+&ansicht=karte$/);
    await expect(page.getByRole("status").first()).toHaveText("3 Angebote");
    await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeVisible();
  });

  test("ein Finger verschiebt die große Karte (Touch über CDP)", async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "chromium" || !isMobile, "Touch über CDP nur in Chromium mit Touch-Emulation (pixel-7)");
    await openBig(page);
    const before = await page.evaluate(() => window.__zpMap?.getCenter());
    const cdp = await page.context().newCDPSession(page);
    const steps = [300, 340, 380, 420, 460];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 300, id: 1 }] });
    for (const y of steps) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y, id: 1 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await mapIdle(page);
    const after = await page.evaluate(() => window.__zpMap?.getCenter());
    expect(after?.lat, "Kartenmitte nach Norden verschoben").toBeGreaterThan(before?.lat ?? Number.POSITIVE_INFINITY);
  });

  test("Öffnen und Schließen laden nichts außer Kacheln (Privatsphäre)", async ({ page }) => {
    await ready(page, "./?ansicht=karte");
    const requests: string[] = [];
    page.on("request", (req) => {
      if (!req.url().includes("tiles.openfreemap.org")) requests.push(req.url());
    });
    await grow(page).click();
    await mapIdle(page);
    await shrink(page).click();
    await mapIdle(page);
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
  });

  test("besteht die Mobile-UX-Gates quer, groß und mit Detail", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openBig(page);
    await expectMobileUx(page);
    await jump(page, BIBLIOTHEK);
    await tapPlace(page, BIBLIOTHEK);
    await expect(page.getByRole("dialog", { name: "Krabbelreime & Fingerspiele" })).toBeVisible();
    await expectMobileUx(page);
  });
});

test.describe("Karte groß auf der Merkliste und im Tab „Anbieter“", () => {
  test("Merkliste: groß, Zahl wie die Statuszeile, der Filter blendet alles aus und die Karte bleibt", async ({
    page,
  }) => {
    await page.addInitScript(
      (ids) => localStorage.setItem("zwergenplan.merkliste", ids),
      JSON.stringify([PEKIP_ID, TREFF_ID]),
    );
    await ready(page, "./?ansicht=merkliste-karte");
    const status = (await page.getByRole("status").first().textContent()) ?? "";
    await grow(page).click();
    await expect(count(page)).toHaveText(status.trim());
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Merkliste filtern" });
    // PEKiP ist ein Kurs mit Anmeldung, der Krabbeltreff kein Kurs: Danach passt keins (saved.spec.ts)
    for (const name of ["Kurs", "Ohne Anmeldung"]) await sheet.getByRole("button", { name, exact: true }).click();
    await sheet.getByRole("button", { name: /gemerkte zeigen$/ }).click();
    await expect(sheet).toBeHidden();
    await expect(mapBox(page)).toHaveClass(/\bbig\b/);
    await expect(count(page)).toHaveText("0 von 2 gemerkten Angeboten");
    await shrink(page).click();
    await expect(page).toHaveURL(/\?ansicht=merkliste-karte$/);
    await expect(page.getByText("Nichts, was zu deinem Filter passt")).toBeVisible();
  });

  test("Merkliste groß: Tipp und Hochfahren laden nichts außer Kacheln (Privatsphäre, Arch-Review Minor 7)", async ({
    page,
  }) => {
    await page.addInitScript(
      (ids) => localStorage.setItem("zwergenplan.merkliste", ids),
      JSON.stringify([PEKIP_ID, TREFF_ID]),
    );
    await ready(page, "./?ansicht=merkliste-karte");
    const requests: string[] = [];
    page.on("request", (req) => {
      if (!req.url().includes("tiles.openfreemap.org")) requests.push(req.url());
    });
    await grow(page).click();
    await mapIdle(page);
    await jump(page, TREFF);
    await tapPlace(page, TREFF);
    // ein gemerktes Angebot dort: Detail, mehrere: Orts-Sheet; beide über der Karte
    await expect(page.locator("dialog[open].over-map")).toBeVisible();
    await mapIdle(page);
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
  });

  test("Anbieter: groß, ein Anbieter öffnet sein Sheet über der Karte", async ({ page }) => {
    await openBig(page, "./?ansicht=anbieter");
    await expect(count(page)).toHaveText(/^\d+ Anbieter/);
    // kein Filter-Knopf im Tab „Anbieter“ (Plan 0059, Nicht-Ziele)
    await expect(page.getByRole("button", { name: /^Alle Filter/ })).toHaveCount(0);
    await jump(page, TREFF, 17);
    await tapPlace(page, TREFF);
    const providerSheet = page.getByRole("dialog", { name: "Anbieter" });
    await expect(providerSheet).toBeVisible();
    await expect(providerSheet).toHaveClass(/\bover-map\b/);
    expect((await selection(page, TREFF)).ring).toBe(1);
    await page.goBack();
    await expect(providerSheet).toBeHidden();
    await expect(page).toHaveURL(/\?ansicht=anbieter&karte=gross$/);
  });
});

test.describe("Karte groß ohne Karten-Code", () => {
  test.use({
    allowedConsoleErrors: [
      /\/assets\/karte\/\S+ .*(ERR_FAILED|Failed to load|Failed to fetch dynamically imported module)/,
    ],
  });

  test("Deep-Link groß: Fehlermeldung im großen Rahmen, „Karte verkleinern“ führt zur Liste", async ({
    page,
    context,
  }) => {
    await context.route("**/assets/karte/**", (route) => route.abort());
    await page.goto("./?ansicht=karte&karte=gross");
    await expect(mapBox(page)).toHaveAttribute("data-state", "fehler");
    await expect(mapBox(page)).toHaveClass(/\bbig\b/);
    await expect(mapBox(page)).toContainText("Mit „Karte verkleinern“ stehen alle Angebote in der Liste.");
    await shrink(page).click();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(mapBox(page).getByRole("button", { name: "Karte groß zeigen" })).toHaveCount(0);
  });
});
