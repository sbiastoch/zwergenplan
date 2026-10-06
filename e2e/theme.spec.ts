/**
 * Darstellung (Plan 0003, E15): Automatisch folgt dem System, Hell/Dunkel bleiben gespeichert. Gewählt wird nur im
 * Kind-Sheet, der Knopf im Kopf ist entfallen (Plan 0018, E2).
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { expectAccessible } from "./mobile-ux.ts";

async function openKidSheet(page: Page) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  return page.getByRole("dialog", { name: "Kind und Einstellungen" });
}

test("Darstellung im Kind-Sheet überlebt das Neuladen, im Kopf gibt es keinen Knopf", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  await expect(page.locator(".hdr").getByRole("button", { name: /Darstellung/ })).toHaveCount(0);
  const sheet = await openKidSheet(page);
  await sheet.getByRole("button", { name: "Dunkel", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await openKidSheet(page);
  await expect(sheet.getByRole("button", { name: "Dunkel", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("„Automatisch“ im Kind-Sheet folgt wieder dem System", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");
  const sheet = await openKidSheet(page);
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
  // Gemessen bei offenem Sheet: getComputedStyle wirkt auch hinter dem Dialog, die Schließzeit zählt nicht mit.
  const sheet = await openKidSheet(page);
  await sheet.getByRole("button", { name: "Dunkel", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Echte Zeit: Die Fake-Uhr der Fixture hält nur `Date` fest, nicht die CSS-Zeitachse (Transitionen laufen weiter).
  await page.waitForTimeout(300);
  expect(colorDiffs(await textColors(page), dark), "Textfarben 300 ms nach dem Wechsel").toEqual([]);
  await sheet.getByRole("button", { name: "Fertig" }).click();
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
