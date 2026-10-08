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
  // Die Zählzeile nennt den Zeitraum statt „ab heute“ (Browser-Review 0023, m1)
  await expect(page.getByRole("status")).toHaveText("3 Angebote vom 20.–31.10.");
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

test("vertauschte Daten aus der URL werden still getauscht, „Zeitraum entfernen“ behält den Fokus", async ({
  page,
}) => {
  await page.goto("./?von=2026-10-31&bis=2026-10-20");
  await expect(offers(page)).toHaveCount(3);
  const sheet = await openFilter(page);
  await expect(sheet.getByLabel("von")).toHaveValue("2026-10-20");
  await expect(sheet.getByLabel("bis")).toHaveValue("2026-10-31");
  await expect(sheet.getByRole("group", { name: "Zeitraum" })).toBeVisible();

  await sheet.getByRole("button", { name: "Zeitraum entfernen" }).click();
  await expect(page).toHaveURL((url) => url.search === "");
  await expect(sheet.getByRole("heading", { name: "Zeitraum" })).toBeFocused();
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

test("eine Eingabe außerhalb der Grenzen wird nicht übernommen und begründet", async ({ page }) => {
  const sheet = await openFilter(page);
  const from = sheet.getByLabel("von");
  const to = sheet.getByLabel("bis");
  await from.fill("2026-10-20");
  await expect(page).toHaveURL(/\?von=2026-10-20$/);
  await expect(to).toHaveAttribute("min", "2026-10-20");

  await to.fill("2026-10-15");
  await expect(to).toHaveAttribute("aria-invalid", "true");
  await expect(to).toHaveAccessibleDescription("Nicht vor „von“");
  await expect(page).toHaveURL(/\?von=2026-10-20$/);

  await from.fill("2026-10-01");
  await expect(from).toHaveAccessibleDescription("Frühestens heute");
  await expect(page).toHaveURL(/\?von=2026-10-20$/);

  await to.fill("2026-10-31");
  await expect(to).toHaveAttribute("aria-invalid", "false");
  await expect(page).toHaveURL(/\?von=2026-10-20&bis=2026-10-31$/);
  await expect(from).toHaveAttribute("max", "2026-10-31");
});

test("Tippen per Tastatur: halbe Jahre und „bis“ vor „von“ springen nicht in den Filter", async ({
  page,
  browserName,
}) => {
  // Segmentweise Tastatureingabe im Datumsfeld gibt es so nur in Chromium; WebKit und die Geräte nutzen den Picker,
  // den der Test mit fill() oben abdeckt (Arch-Review 0023, M3).
  test.skip(browserName !== "chromium", "Tastatureingabe in Datumsfeldern nur in Chromium segmentiert");
  const sheet = await openFilter(page);
  const from = sheet.getByLabel("von");
  const to = sheet.getByLabel("bis");
  // Tag gleich Monat: Die Reihenfolge der Segmente hängt an der Sprache des Browsers (TT.MM. oder MM/TT).
  await from.pressSequentially("11112026");
  await expect(from).toHaveValue("2026-11-11");
  await expect(page).toHaveURL(/\?von=2026-11-11$/);

  await to.pressSequentially("10102026");
  await expect(to).toHaveValue("2026-10-10");
  await expect(to).toBeFocused();
  await expect(to).toHaveAttribute("aria-invalid", "true");
  // kein Tausch unter dem Fokus: „von“ bleibt, wie es war
  await expect(from).toHaveValue("2026-11-11");
  await expect(page).toHaveURL(/\?von=2026-11-11$/);
});

test("Detail eines Kurses mit Zeitraum bezieht sich auf den Kursbeginn", async ({ page }) => {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await page.getByLabel("Geburtsdatum").fill("01.03.2025");
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("dialog", { name: "Kind und Einstellungen" })).toBeHidden();

  await page.goto("./?von=2026-11-01");
  const start = page.getByRole("region", { name: "Donnerstag, 5. November" });
  await start.getByRole("heading", { level: 3, name: "Musikgarten 1 (1–2 Jahre)" }).getByRole("button").click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText(/am Do 5\.11\./)).toBeVisible();
  await expect(detail.getByRole("link", { name: "Alle 6 Kurstermine" })).toBeVisible();
});

test("ein alter Link mit „von“ vor heute bleibt gültig", async ({ page }) => {
  await page.goto("./?von=2026-10-01");
  await expect(offers(page)).toHaveCount(8);
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab Do 1.10.");
  await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeVisible();
  const from = (await openFilter(page)).getByLabel("von");
  await expect(from).toHaveValue("2026-10-01");
  await expect(from).toHaveAttribute("aria-invalid", "false");
  expect(await from.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(true);
});

test("ein Zeitraum ganz in der Vergangenheit zeigt den Leerzustand mit „Filter zurücksetzen“", async ({ page }) => {
  await page.goto("./?bis=2026-10-01");
  await expect(page.getByText("Mit diesen Filtern gibt es keine Angebote.")).toBeVisible();
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(offers(page)).toHaveCount(8);
  await expect(page).toHaveURL((url) => url.search === "");
});

test("nur „bis“ aus der URL, ungültiges „von“ wird verworfen", async ({ page }) => {
  await page.goto("./?von=quatsch&bis=2026-10-12");
  // Krabbeltreff (7.10.) und Krabbelreime (9.10.); PEKiP beginnt erst am 13.10.
  await expect(offers(page)).toHaveCount(2);
  await expect(page.getByRole("status")).toHaveText("2 Angebote bis Mo 12.10.");
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
