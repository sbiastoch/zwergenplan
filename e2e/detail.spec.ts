/** Detail (Plan 0003, E3, E4, E13): Dialog, History, Deep-Link, ICS. Fixtures, Uhr Mo 5.10.2026 12:00. */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const PEKIP = "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)";

async function openDetail(page: Page, title: string) {
  await page.getByRole("heading", { level: 3, name: title }).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function vevents(page: Page, href: string | null) {
  const res = await page.request.get(new URL(href ?? "", page.url()).toString());
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  return res.text();
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
});

test("öffnet per Kachel, steht in der URL, Zurück-Geste schließt", async ({ page }) => {
  const dialog = await openDetail(page, PEKIP);
  await expect(page).toHaveURL(/angebot=/);
  await expect(dialog.getByText("Kurs mit 8 Terminen")).toBeVisible();
  await expect(dialog.getByText("Di 13.10. bis Di 1.12., jeweils 9:30–11:00")).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/angebot=/);
  // Fokus zurück auf den Auslöser
  await expect(page.getByRole("heading", { level: 3, name: PEKIP }).getByRole("button")).toBeFocused();
});

test("Deep-Link öffnet direkt, Zurück-Knopf entfernt den Parameter", async ({ page }) => {
  await openDetail(page, PEKIP);
  const deepLink = page.url();
  await page.goto(deepLink);
  const dialog = page.getByRole("dialog", { name: PEKIP });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zurück" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/angebot=/);
});

test("Esc schließt das Detail", async ({ page }) => {
  const dialog = await openDetail(page, "Offener Krabbeltreff");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/angebot=/);
});

test("ein unbekanntes Angebot in der URL wird verworfen", async ({ page }) => {
  await page.goto("./?angebot=gibt-es--nicht--mehr");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/angebot=/);
});

test("Kurs-ICS enthält alle Termine in korrekter Zeit", async ({ page }) => {
  const dialog = await openDetail(page, PEKIP);
  const link = dialog.getByRole("link", { name: "Alle 8 Kurstermine in den Kalender" });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/zwergenplan\/ics\/.+\.ics$/);
  const body = await vevents(page, href);
  expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(8);
  expect(body).toContain("DTSTART:20261027T083000Z"); // 9:30 nach der Zeitumstellung
});

test("regelmäßig: nur der nächste Termin oder alle", async ({ page }) => {
  const dialog = await openDetail(page, "Offener Krabbeltreff");
  await expect(dialog.getByText("Jeden Mittwoch, 10:00–11:30")).toBeVisible();
  await expect(dialog.getByText("Einzeln besuchbar")).toBeVisible();
  const one = await vevents(page, await dialog.getByRole("link", { name: "Nur Mi 7.10." }).getAttribute("href"));
  expect(one.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  const all = await vevents(page, await dialog.getByRole("link", { name: "Alle 5 Termine" }).getAttribute("href"));
  expect(all.match(/BEGIN:VEVENT/g)).toHaveLength(5);
});

test("zeigt Verfügbarkeit als Momentaufnahme und erklärt das Alter", async ({ page }) => {
  const dialog = await openDetail(page, PEKIP);
  await expect(dialog.getByText("Wenige Plätze")).toBeVisible();
  await expect(dialog.getByText(/Momentaufnahme vom \d+\.\d+\./)).toBeVisible();
  await expect(dialog.getByText("Geburtsdatum eintragen, dann prüfen wir das")).toBeVisible();
});

test("merkt aus dem Detail, Meldung im Dialog sichtbar", async ({ page }) => {
  const dialog = await openDetail(page, PEKIP);
  await dialog.getByRole("button", { name: `${PEKIP} merken` }).click();
  await expect(dialog.getByText("Eingeklebt – liegt jetzt in deinem Stickerheft")).toBeVisible();
  await expect(dialog.getByRole("button", { name: `${PEKIP} merken` })).toHaveAttribute("aria-pressed", "true");
});
