/**
 * Deploy-Build mit echten Daten. Die Uhr steht auf `generatedAt` des Datenstands (nicht auf der Echtzeit):
 * Ein alter Datenstand ist laut ADR 0002 nur eine Warnung und darf Code-Commits nicht rot machen.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { expectAccessible, expectMobileUx, expectNoHorizontalScroll } from "./mobile-ux.ts";

async function openAtDataTime(page: Page): Promise<{ offers: number }> {
  const res = await page.request.get("./data/meta.json");
  const meta = (await res.json()) as { offers: number; generatedAt: string };
  await page.clock.setFixedTime(new Date(meta.generatedAt));
  await page.goto("./");
  if (meta.offers > 0) {
    // Echte Daten vorhanden → die Seite muss Angebote zeigen, nicht den Leerzustand.
    await expect(page.getByTestId("offer").first()).toBeVisible();
  } else {
    await expect(page.getByRole("status")).toHaveText(/Noch keine passenden Angebote/);
  }
  return meta;
}

test("echter Build lädt und ist bedienbar", async ({ page }) => {
  await openAtDataTime(page);
  await expectMobileUx(page);
});

test("echte Daten brechen bei 320 px und 200 % Textgröße nicht aus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openAtDataTime(page);
  await expectNoHorizontalScroll(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
});
