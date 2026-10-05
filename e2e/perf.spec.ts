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

test("Wegzeit lädt bei gespeichertem Stadtteil und ?wegzeit=: kein Flackern, CLS im Budget (Plan 0009, M7)", async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== "chromium" || !isMobile, "nur Chromium-Mobile");
  await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
  // Tabelle zusätzlich zum gedrosselten Netz um 1,5 s verzögert: Laden und Umschalten auf die gefilterte Liste
  await page.route("**/data/wegzeit.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await throttleMobile(page);
  await observeVitals(page);
  await page.goto("./?wegzeit=20");
  await expect(page.locator(".list-pending")).toBeVisible();
  await expect(page.getByTestId("offer")).toHaveCount(6, { timeout: 15_000 });
  await expect(page.getByRole("status")).toContainText("Wegzeit ab Gostenhof");
  await page.waitForTimeout(500);
  const { cls, detail } = clsFrom(await readVitals(page));
  expect(cls, `CLS\n${detail}`).toBeLessThan(BUDGET.cls);
});
