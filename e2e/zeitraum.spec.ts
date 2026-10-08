/**
 * Zeitraumfilter „von / bis“ (Plan 0023). Fixtures, Uhr Mo 5.10.2026 12:00. PEKiP beginnt am 13.10. (Kurs),
 * der Krabbeltreff ist wöchentlich mittwochs ab 7.10. (regelmäßig), der Workshop am 17.10. (einmalig).
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const offers = (page: Page) => page.getByTestId("offer");

async function openFilter(page: Page) {
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "Zwergenplan" })).toBeVisible();
});

test("von/bis im Filter-Sheet: URL, Badge, Kurs nur mit Beginn im Zeitraum, Regelmäßiges am Termin darin", async ({
  page,
}) => {
  const sheet = await openFilter(page);
  await sheet.getByLabel("von").fill("2026-10-20");
  await sheet.getByLabel("bis").fill("2026-10-31");
  await expect(page).toHaveURL(/\?von=2026-10-20&bis=2026-10-31$/);
  // Krabbeltreff, Krabbelreime, Bewegungslandschaft
  await sheet.getByRole("button", { name: "3 Angebote zeigen" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeVisible();
  await expect(offers(page)).toHaveCount(3);
  await expect(page.getByText(/PEKiP-Gruppe/)).toHaveCount(0);
  await expect(page.getByText("Babymassage – Schnupper-Workshop")).toHaveCount(0);
  const treffDay = page.getByRole("region", { name: "Mittwoch, 21. Oktober" });
  await expect(treffDay.getByTestId("offer")).toContainText("Offener Krabbeltreff");

  // Das Detail bezieht sich auf den Termin im Zeitraum, nicht auf den nächsten überhaupt (E7)
  await treffDay.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByRole("link", { name: "Nur Mi 21.10." })).toBeVisible();
  await expect(detail.locator(".dates li.sel")).toContainText("21. Oktober");
});

test("vertauschte Daten werden still getauscht, „Zeitraum entfernen“ und „Zurücksetzen“ leeren", async ({ page }) => {
  const sheet = await openFilter(page);
  await sheet.getByLabel("von").fill("2026-10-31");
  await sheet.getByLabel("bis").fill("2026-10-20");
  await expect(page).toHaveURL(/\?von=2026-10-20&bis=2026-10-31$/);
  await expect(sheet.getByLabel("von")).toHaveValue("2026-10-20");
  await expect(sheet.getByLabel("bis")).toHaveValue("2026-10-31");

  await sheet.getByRole("button", { name: "Zeitraum entfernen" }).click();
  await expect(page).toHaveURL((url) => url.search === "");
  await expect(sheet.getByLabel("von")).toHaveValue("");
  await expect(sheet.getByRole("button", { name: "Zeitraum entfernen" })).toHaveCount(0);

  await sheet.getByLabel("von").fill("2026-11-01");
  await expect(page).toHaveURL(/\?von=2026-11-01$/);
  await sheet.getByRole("button", { name: "Zurücksetzen" }).click();
  await expect(page).toHaveURL((url) => url.search === "");
  await expect(sheet.getByLabel("von")).toHaveValue("");
  await sheet.getByRole("button", { name: "8 Angebote zeigen" }).click();
  await expect(offers(page)).toHaveCount(8);
});

test("nur „bis“ aus der URL, ungültiges „von“ wird verworfen", async ({ page }) => {
  await page.goto("./?von=quatsch&bis=2026-10-12");
  // Krabbeltreff (7.10.) und Krabbelreime (9.10.); PEKiP beginnt erst am 13.10.
  await expect(offers(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeVisible();
  const sheet = await openFilter(page);
  await expect(sheet.getByLabel("von")).toHaveValue("");
  await expect(sheet.getByLabel("bis")).toHaveValue("2026-10-12");
});

test("der Kalender zeigt die gefilterten Angebote mit allen ihren Terminen (E8)", async ({ page }) => {
  // Ab 6.11.: Der Krabbeltreff (letzter Termin 4.11.) fällt heraus, Krabbelreime (6.11., 20.11.) passt und steht
  // auch an seinem Termin am 9.10., also vor dem Zeitraum.
  await page.goto("./?von=2026-11-06&ansicht=kalender");
  await expect(page.getByRole("button", { name: "Mittwoch, 7. Oktober, 0 Angebote" })).toBeVisible();
  await page.getByRole("button", { name: "Freitag, 9. Oktober, 1 Angebot" }).click();
  await expect(page.getByTestId("offer")).toContainText("Krabbelreime & Fingerspiele");
});
