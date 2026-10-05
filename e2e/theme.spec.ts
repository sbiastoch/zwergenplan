/** Darstellung (Plan 0003, E15): Automatisch folgt dem System, Hell/Dunkel bleiben gespeichert. */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { expectAccessible } from "./mobile-ux.ts";

test("Kopf-Knopf schaltet um, die Wahl überlebt das Neuladen", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) < 380,
    "unter 380 px fehlt der Knopf im Kopf, die Darstellung liegt im Kind-Sheet (Plan 0007, E6)",
  );
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

/**
 * WebKit mit „Bewegung reduzieren“ (Plan 0008, E1): 0,01-ms-Transitionen über `all` schloss WebKit erst Sekunden
 * später ab, Text stand so lange in der alten Farbe. Gelesen werden die berechneten Textfarben typischer Elemente.
 */
const COLOR_TARGETS: ReadonlyArray<readonly [selector: string, count: number]> = [
  [".brand", 1],
  [".kid", 1],
  [".stk", 3],
  [".daylabel", 1],
  [".when", 1],
  [".ctitle", 1],
  [".chip", 1],
];

async function textColors(page: Page): Promise<Record<string, string>> {
  // ein einziges evaluate: alle Farben stammen aus demselben Augenblick
  return page.evaluate((targets) => {
    const colors: Record<string, string> = {};
    for (const [selector, count] of targets) {
      const found = [...document.querySelectorAll(selector)].slice(0, count);
      if (found.length === 0) throw new Error(`${selector} fehlt`);
      found.forEach((el, i) => {
        colors[`${selector}#${i + 1}`] = getComputedStyle(el).color;
      });
    }
    return colors;
  }, COLOR_TARGETS);
}

function colorDiffs(actual: Record<string, string>, expected: Record<string, string>): string[] {
  return Object.entries(expected)
    .filter(([key, want]) => actual[key] !== want)
    .map(([key, want]) => `${key}: ist ${actual[key]}, soll ${want}`);
}

test("Darstellung wechselt bei reduzierter Bewegung sofort die Textfarben", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) < 380,
    "unter 380 px fehlt der Knopf im Kopf, die Darstellung liegt im Kind-Sheet (Plan 0007, E6)",
  );
  // Referenz: eingeschwungene dunkle Darstellung, auf derselben Seite (Konsolen- und Drittanbieter-Wächter)
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("./");
  await page.evaluate(() => localStorage.setItem("zwergenplan.darstellung", "dunkel"));
  await page.reload();
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.waitForTimeout(1500);
  const dark = await textColors(page);

  await page.evaluate(() => localStorage.removeItem("zwergenplan.darstellung"));
  await page.reload();
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.getByRole("button", { name: "Dunkle Darstellung" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Echte Zeit: Die Fake-Uhr der Fixture hält nur `Date` fest, nicht die CSS-Zeitachse (Transitionen laufen weiter).
  await page.waitForTimeout(300);
  expect(colorDiffs(await textColors(page), dark), "Textfarben 300 ms nach dem Wechsel").toEqual([]);
  await expectAccessible(page);
});

test("Beim Laden mit reduzierter Bewegung stehen die Farben sofort", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  const first = await textColors(page);
  // echte Zeit, siehe oben
  await page.waitForTimeout(1500);
  expect(colorDiffs(first, await textColors(page)), "Textfarben direkt nach dem Laden").toEqual([]);
});
