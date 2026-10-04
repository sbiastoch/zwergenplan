/** Deploy-Build mit echten Daten: lädt fehlerfrei und zeigt Angebote oder den Leerzustand. */
import { expect, test } from "./fixtures.ts";
import { expectMobileUx } from "./mobile-ux.ts";

test("echter Build lädt und ist bedienbar", async ({ page }) => {
  await page.clock.setFixedTime(new Date()); // echte Daten → echtes „Jetzt“
  await page.goto("./");
  await expect(page.getByRole("status")).toHaveText(/Angebote|Noch keine passenden Angebote/);
  await expectMobileUx(page);
});
