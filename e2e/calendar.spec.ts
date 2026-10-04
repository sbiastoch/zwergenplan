/** Kalender (Plan 0003, E14). Fixtures, Uhr Mo 5.10.2026 12:00. */
import { expect, test } from "./fixtures.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(page).toHaveURL(/ansicht=kalender/);
});

test("Woche mit Angeboten je Tag, Agenda des gewählten Tages", async ({ page }) => {
  await expect(page.getByText("5.–11. Oktober")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vorherige Woche" })).toBeDisabled();
  await expect(page.getByRole("heading", { level: 2, name: /Heute, 5\. Oktober/ })).toBeVisible();

  await page.getByRole("button", { name: "Mittwoch, 7. Oktober, 1 Angebot" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Mittwoch, 7\. Oktober/ })).toBeVisible();
  await expect(page.getByTestId("offer")).toHaveCount(1);
  await expect(page.getByTestId("offer")).toContainText("Offener Krabbeltreff");

  await page.getByRole("button", { name: "Donnerstag, 8. Oktober, 0 Angebote" }).click();
  await expect(page.getByText("Freier Tag")).toBeVisible();
});

test("blättert wochenweise und bleibt im Datenhorizont", async ({ page }) => {
  await page.getByRole("button", { name: "Nächste Woche" }).click();
  await expect(page.getByText("12.–18. Oktober")).toBeVisible();
  await page.getByRole("button", { name: "Vorherige Woche" }).click();
  await expect(page.getByText("5.–11. Oktober")).toBeVisible();
});

test("Monatsraster wählt einen Tag und klappt zu", async ({ page }) => {
  await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
  await expect(page.getByText("Oktober 2026")).toBeVisible();
  await page.getByRole("button", { name: "Nächster Monat" }).click();
  await page.getByRole("button", { name: "Nächster Monat" }).click();
  await expect(page.getByText("Dezember 2026")).toBeVisible();
  // letzter Termin der Fixtures: 10.12. → kein Januar
  await expect(page.getByRole("button", { name: "Nächster Monat" })).toBeDisabled();
  await page.getByRole("button", { name: "Vorheriger Monat" }).click();
  await page.getByRole("button", { name: "Vorheriger Monat" }).click();
  await page.getByRole("button", { name: "Dienstag, 13. Oktober, 1 Angebot" }).click();
  await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("offer")).toContainText("PEKiP-Gruppe Herbst");
});

test("Detail aus dem Kalender nimmt den gewählten Termin", async ({ page }) => {
  await page.getByRole("button", { name: "Nächste Woche" }).click();
  await page.getByRole("button", { name: "Mittwoch, 14. Oktober, 1 Angebot" }).click();
  await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Nur Mi 14.10." })).toBeVisible();
});
