/** Mobile-UX-Gates für jede Ansicht und jedes Overlay, hell und dunkel (Plan 0003, docs/architecture.md). */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoHorizontalScroll,
  expectReducedMotion,
  expectVisibleFocus,
} from "./mobile-ux.ts";

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
}

/** Weg zu jeder Ansicht, ausgehend von der geladenen Startseite */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  entdecken: async () => {},
  kalender: async (page) => {
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await expect(page.getByText("Oktober 2026")).toBeVisible();
  },
  merkliste: async (page) => {
    await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
    await page.getByRole("button", { name: /PEKiP-Gruppe Herbst .* merken/ }).click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    await expect(page.getByTestId("offer")).toHaveCount(2);
  },
  detail: async (page) => {
    await page.getByRole("heading", { level: 3, name: /PEKiP/ }).getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
  "filter-sheet": async (page) => {
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  },
  "kind-sheet": async (page) => {
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.getByLabel("Geburtsdatum").fill("01.09.2026");
    await expect(page.getByText("Dein Kind ist heute 1 Monat alt.")).toBeVisible();
  },
};

for (const [name, go] of Object.entries(VIEWS)) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${name} besteht die Mobile-UX-Gates (${colorScheme === "light" ? "hell" : "dunkel"})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await ready(page);
      await go(page);
      // vor expectMobileUx: dessen settle() wartet Animationen ab, die hier gar nicht erst laufen dürfen
      await expectReducedMotion(page);
      await expectMobileUx(page);
    });
  }

  test(`${name} bricht bei 320 px und 200 % Textgröße nicht aus`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await go(page);
    await expectNoHorizontalScroll(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
}

test("funktioniert mit reduzierter Bewegung", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Kurse", exact: true }).click();
  await expect(page.getByTestId("offer")).toHaveCount(2);
});

test("zeigt bei Tastaturbedienung immer den Fokus", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
  await ready(page);
  await expectVisibleFocus(page);
});

test("zeigt den Fokus auch im Detail-Dialog", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
  await ready(page);
  await VIEWS["detail"]?.(page);
  await expectVisibleFocus(page, 15);
});
