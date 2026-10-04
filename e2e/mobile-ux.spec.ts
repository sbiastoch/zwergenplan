import { expect, test } from "./fixtures.ts";
import { expectAccessible, expectMobileUx, expectNoHorizontalScroll, expectVisibleFocus } from "./mobile-ux.ts";

async function ready(page: import("@playwright/test").Page) {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
}

test("Startseite besteht die Mobile-UX-Gates (hell)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await ready(page);
  await expectMobileUx(page);
});

test("Startseite besteht die Mobile-UX-Gates (dunkel)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ready(page);
  await expectMobileUx(page);
});

test("funktioniert mit reduzierter Bewegung", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Kurs" }).click();
  await expect(page.getByTestId("offer")).toHaveCount(2);
});

test("bricht bei 320 px Breite sauber um (WCAG 1.4.10)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ready(page);
  await expectNoHorizontalScroll(page);
});

test("bleibt bei 200 % Textgröße bedienbar", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
});

test("zeigt bei Tastaturbedienung immer den Fokus", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
  await ready(page);
  await expectVisibleFocus(page);
});
