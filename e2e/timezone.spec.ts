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

// Seit Plan 0025 (E8) der Kalender der Merkliste, mit vorbelegter Merkliste
test("der Kalender der Merkliste markiert den Berliner Tag als heute", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("zwergenplan.merkliste", JSON.stringify(["lxizt974"])));
  await page.goto("./?ansicht=merkliste-kalender");
  const tuesday = page.getByRole("button", { name: /^Dienstag, 6\. Oktober/ });
  await expect(tuesday).toHaveClass(/\btoday\b/);
  await expect(page.getByRole("button", { name: /^Montag, 5\. Oktober/ })).toBeDisabled();
  await tuesday.click();
  await expect(page.getByRole("heading", { level: 2, name: /Heute, 6\. Oktober/ })).toBeVisible();
});
