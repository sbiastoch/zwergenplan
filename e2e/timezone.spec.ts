/**
 * „Heute“ ist ein Berliner Tag, egal wo das Gerät steht (docs/architecture.md, Zeit).
 * Di 6.10. 00:30 in Berlin ist in Los Angeles noch Mo 5.10. 15:30.
 */
import { expect, test } from "./fixtures.ts";

test.use({ timezoneId: "America/Los_Angeles" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-06T00:30:00+02:00"));
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
});

test("die Liste rechnet Heute/Morgen in Berlin", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/Morgen\s*Mittwoch, 7\. Oktober/);
});

test("der Kalender markiert den Berliner Tag als heute", async ({ page }) => {
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Heute, 6\. Oktober/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Montag, 5\. Oktober/ })).toBeDisabled();
});
