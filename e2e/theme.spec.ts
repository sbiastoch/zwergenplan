/** Darstellung (Plan 0003, E15): Automatisch folgt dem System, Hell/Dunkel bleiben gespeichert. */
import { expect, test } from "./fixtures.ts";

test("Kopf-Knopf schaltet um, die Wahl überlebt das Neuladen", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 360, "unter 360 px liegt die Darstellung nur im Kind-Sheet");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  await page.getByRole("button", { name: "Dunkle Darstellung" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Helle Darstellung" })).toBeVisible();
});

test("„Automatisch“ im Kind-Sheet folgt wieder dem System", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await sheet.getByRole("button", { name: "Hell" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await sheet.getByRole("button", { name: "Automatisch" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  await expect(sheet.getByRole("button", { name: "Automatisch" })).toHaveAttribute("aria-pressed", "true");
});
