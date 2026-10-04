/**
 * Deploy-Build mit echten Daten. Die Uhr steht auf `generatedAt` des Datenstands (nicht auf der Echtzeit):
 * Ein alter Datenstand ist laut ADR 0002 nur eine Warnung und darf Code-Commits nicht rot machen.
 */
import type { Page } from "@playwright/test";
import { expect, MAP_READY, test } from "./fixtures.ts";
import { expectAccessible, expectMobileUx, expectNoHorizontalScroll } from "./mobile-ux.ts";

async function dataMeta(page: Page): Promise<{ offers: number; generatedAt: string }> {
  const res = await page.request.get("./data/meta.json");
  return (await res.json()) as { offers: number; generatedAt: string };
}

async function openAtDataTime(page: Page): Promise<{ offers: number }> {
  const meta = await dataMeta(page);
  await page.clock.setFixedTime(new Date(meta.generatedAt));
  await page.goto("./");
  if (meta.offers > 0) {
    // Echte Daten vorhanden → die Seite muss Angebote zeigen, nicht den Leerzustand.
    await expect(page.getByTestId("offer").first()).toBeVisible();
  } else {
    await expect(page.getByText("Noch keine Angebote")).toBeVisible();
  }
  return meta;
}

test("echter Build lädt und ist bedienbar", async ({ page }) => {
  await openAtDataTime(page);
  await expectMobileUx(page);
});

test("echte Daten brechen bei 320 px und 200 % Textgröße nicht aus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openAtDataTime(page);
  await expectNoHorizontalScroll(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
});

test("lange Listen werden schrittweise gezeigt (Plan 0003, E8)", async ({ page }) => {
  const meta = await openAtDataTime(page);
  test.skip(meta.offers <= 60, "zu wenige Angebote für mehrere Schritte");
  const cards = page.getByTestId("offer");
  const first = await cards.count();
  expect(first).toBeGreaterThanOrEqual(40);
  expect(first).toBeLessThan(meta.offers);
  await page.getByRole("button", { name: /^Weitere Angebote zeigen/ }).click();
  await expect.poll(() => cards.count()).toBeGreaterThan(first);
});

test("LCP und CLS bleiben mit echten Daten im Budget", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP-Drosselung und LCP-API gibt es nur in Chromium");
  const meta = await dataMeta(page);
  test.skip(meta.offers === 0, "keine Daten");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __vitals: { lcp: number; cls: number } };
    w.__vitals = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__vitals.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!e.hadRecentInput) w.__vitals.cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.clock.setFixedTime(new Date(meta.generatedAt));
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.waitForTimeout(500);
  const vitals = await page.evaluate(() => (window as unknown as { __vitals: { lcp: number; cls: number } }).__vitals);
  expect(vitals.lcp, "LCP (ms)").toBeLessThan(2500);
  expect(vitals.cls, "CLS").toBeLessThan(0.05);
});

test.describe("Karte mit echten Daten (Plan 0005)", () => {
  test.use({ tiles: "mock" });

  async function openMap(page: Page) {
    const meta = await openAtDataTime(page);
    test.skip(meta.offers === 0, "keine Daten");
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", MAP_READY);
  }

  test("Karte ist bereit, Orts-Liste vollständig, kein Test-Haken im Deploy-Build", async ({ page }) => {
    await openMap(page);
    expect(await page.getByRole("region", { name: "Orte" }).getByRole("button").count()).toBeGreaterThanOrEqual(50);
    // __zpMap gibt es nur im E2E-Build (__E2E__, Plan 0005 E13)
    expect(await page.evaluate(() => "__zpMap" in window)).toBe(false);
    await expectMobileUx(page);
  });

  test("Karte bricht bei 320 px und 200 % Textgröße nicht aus", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page);
    await expectNoHorizontalScroll(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
});
