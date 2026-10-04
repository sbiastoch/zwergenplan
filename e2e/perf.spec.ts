/**
 * Web-Vitals unter Mobile-Bedingungen (CPU 4× gedrosselt, langsames Netz).
 * Nur Chromium: CDP-Drosselung und LCP-API gibt es nur dort. Der Schrift-Swap steht in font-swap.spec.ts.
 */
import { expect, test } from "./fixtures.ts";
import { clsFrom, observeVitals, readVitals, throttleMobile } from "./vitals.ts";

const BUDGET = { lcpMs: 2500, cls: 0.05 };

test("LCP und CLS bleiben im Budget", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || !isMobile, "nur Chromium-Mobile");
  await throttleMobile(page);
  await observeVitals(page);
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.waitForTimeout(500);
  const vitals = await readVitals(page);
  expect(vitals.lcp, "LCP (ms)").toBeLessThan(BUDGET.lcpMs);
  const { cls, detail } = clsFrom(vitals);
  expect(cls, `CLS\n${detail}`).toBeLessThan(BUDGET.cls);
});
