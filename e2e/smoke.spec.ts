/**
 * Deploy-Build mit echten Daten. Die Uhr steht auf `generatedAt` des Datenstands (nicht auf der Echtzeit):
 * Ein alter Datenstand ist laut ADR 0002 nur eine Warnung und darf Code-Commits nicht rot machen.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoHorizontalScroll,
  expectTextFits,
  setTextScale,
} from "./mobile-ux.ts";

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
  // Knopf-Beschriftungen mit Daten (Anbietername, Tag) dürfen umbrechen: Prüfung 5 nur mit Fixtures (Plan 0007, E10).
  await expectMobileUx(page, { buttons: false });
});

/** Weg zu den Ansichten mit echten Daten, ausgehend von der geladenen Startseite (Plan 0003, Arch-Hinweis 16). */
const REAL_VIEWS: Record<string, (page: Page) => Promise<void>> = {
  Start: async () => {},
  Kalender: async (page) => {
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
  },
  Detail: async (page) => {
    await page.getByTestId("offer").first().getByRole("heading").getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
};

for (const [name, go] of Object.entries(REAL_VIEWS)) {
  test(`echte Daten brechen bei 320 px und 200 % Textgröße nicht aus (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const meta = await openAtDataTime(page);
    test.skip(meta.offers === 0 && name !== "Start", "keine Daten");
    await go(page);
    await expectNoHorizontalScroll(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2, buttons: false });
    await expectAccessible(page);
  });
}

test("Stadtteil als Startpunkt mit echten Daten (Plan 0004)", async ({ page }) => {
  const meta = await openAtDataTime(page);
  test.skip(meta.offers === 0, "keine Daten");
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("altstadt");
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByRole("status")).toContainText("Entfernung als Luftlinie ab Altstadt");
  await expect(page.getByTestId("offer").first().locator(".meta .dist")).toHaveText(/^\d+(,\d)? k?m$/);
  await expectMobileUx(page);

  await page.setViewportSize({ width: 320, height: 640 });
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
