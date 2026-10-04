import { expect, test } from "./fixtures.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "Zwergenplan" })).toBeVisible();
});

test("zeigt kommende Angebote und blendet vergangene aus", async ({ page }) => {
  const offers = page.getByTestId("offer");
  await expect(offers).toHaveCount(7);
  await expect(page.getByText("Elterncafé am Montag")).toHaveCount(0);
  await expect(offers.first()).toContainText("Offener Krabbeltreff");
  await expect(offers.first()).toContainText("Nächster Termin: Mi., 7. Okt., 10:00–11:30 Uhr");
});

test("ist für Suchmaschinen gesperrt und liegt unter dem Basis-Pfad", async ({ page }) => {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(new URL(page.url()).pathname).toBe("/zwergenplan/");
});

test("Format-Filter steht in der URL und überlebt ein Neuladen", async ({ page }) => {
  await page.getByRole("button", { name: "Kurs" }).click();
  await expect(page.getByRole("button", { name: "Kurs" })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?format=kurs$/);
  await expect(page.getByTestId("offer")).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId("offer")).toHaveCount(2);
  await page.getByRole("button", { name: "Einmalig" }).click();
  await expect(page).toHaveURL(/\?format=kurs,einmalig$/);
  await expect(page.getByTestId("offer")).toHaveCount(5);
});

test("Geburtsdatum filtert nach Alter, bleibt lokal und nie in der URL", async ({ page }) => {
  await page.getByLabel("Geburtsdatum des Kindes").fill("2026-09-01");
  await expect(page.getByTestId("offer")).toHaveCount(4);
  expect(page.url()).not.toContain("2026-09-01");
  await page.reload();
  await expect(page.getByLabel("Geburtsdatum des Kindes")).toHaveValue("2026-09-01");
  await expect(page.getByTestId("offer")).toHaveCount(4);
});

test("Kurs-ICS enthält alle Termine in korrekter Zeit", async ({ page, request }) => {
  const card = page.getByTestId("offer").filter({ hasText: "PEKiP-Gruppe Herbst" });
  const link = card.getByRole("link", { name: "Alle 8 Termine in den Kalender" });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/zwergenplan\/ics\/.+\.ics$/);
  const res = await request.get(new URL(href ?? "", page.url()).toString());
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(8);
  expect(body).toContain("DTSTART:20261027T083000Z"); // 9:30 nach der Zeitumstellung
});

test("Leerzustand bei Filtern ohne Treffer", async ({ page }) => {
  await page.getByLabel("Geburtsdatum des Kindes").fill("2023-01-01");
  await expect(page.getByRole("status")).toHaveText("Noch keine passenden Angebote – Daten folgen.");
});
