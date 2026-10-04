/**
 * Web-Vitals unter Mobile-Bedingungen (CPU 4× gedrosselt, langsames Netz).
 * Nur Chromium: CDP-Drosselung und LCP-API gibt es nur dort.
 */
import { expect, test } from "./fixtures.ts";

const BUDGET = { lcpMs: 2500, cls: 0.05 };

test("LCP und CLS bleiben im Budget", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || !isMobile, "nur Chromium-Mobile");
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

  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.waitForTimeout(500);
  const vitals = await page.evaluate(() => (window as unknown as { __vitals: { lcp: number; cls: number } }).__vitals);
  expect(vitals.lcp, "LCP (ms)").toBeLessThan(BUDGET.lcpMs);
  expect(vitals.cls, "CLS").toBeLessThan(BUDGET.cls);
});
