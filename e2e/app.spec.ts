/** Entdecken: Liste nach Tagen, Filter, Alter (Plan 0003, E7–E11, E16). Fixtures, Uhr Mo 5.10.2026 12:00. */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "Zwergenplan" })).toBeVisible();
});

const offers = (page: Page) => page.getByTestId("offer");

async function setBirthDate(page: Page, text: string) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await page.getByLabel("Geburtsdatum").fill(text);
  await page.getByRole("button", { name: "Fertig" }).click();
}

test("zeigt jedes kommende Angebot einmal, nach Tagen gruppiert, Vergangenes nicht", async ({ page }) => {
  await expect(offers(page)).toHaveCount(8);
  await expect(page.getByText("Elterncafé am Montag")).toHaveCount(0);
  const firstDay = page.getByRole("heading", { level: 2 }).first();
  await expect(firstDay).toHaveText(/Mittwoch\s*7\. Oktober/);
  await expect(offers(page).first()).toContainText("Offener Krabbeltreff");
  await expect(offers(page).first()).toContainText("10:00–11:30 Uhr");
  await expect(offers(page).first()).toContainText("Jeden Mittwoch");
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  await expect(page.getByText("Datenstand:")).toBeVisible();
});

test("ist für Suchmaschinen gesperrt und liegt im Wurzelpfad", async ({ page }) => {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(new URL(page.url()).pathname).toBe("/");
});

test("Schnellfilter und Sticker stehen in der URL und überleben ein Neuladen", async ({ page }) => {
  await page.getByRole("button", { name: "Kurse", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kurse", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?format=kurs$/);
  await expect(offers(page)).toHaveCount(2);

  await page.reload();
  await expect(offers(page)).toHaveCount(2);
  await page.getByRole("button", { name: /^Musik: Musik & Singen/ }).click();
  await expect(page).toHaveURL(/\?kat=musik&format=kurs$/);
  await expect(offers(page)).toHaveCount(1);
  await expect(offers(page)).toContainText("Musikgarten 1");
  await expect(page.getByRole("button", { name: "Alle Filter, 2 aktiv" })).toBeVisible();
});

test("Filter-Sheet wirkt sofort, Einfachwahl bei Anmeldung, Zurücksetzen leert", async ({ page }) => {
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Ohne Anmeldung" }).click();
  await expect(sheet.getByRole("button", { name: "Ohne Anmeldung" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Egal" }).first()).toHaveAttribute("aria-pressed", "false");
  await expect(sheet.getByRole("button", { name: "3 Angebote zeigen" })).toBeVisible();
  await sheet.getByRole("button", { name: "Mit Anmeldung" }).click();
  await expect(sheet.getByRole("button", { name: "Ohne Anmeldung" })).toHaveAttribute("aria-pressed", "false");
  await sheet.getByRole("button", { name: "Zurücksetzen" }).click();
  await sheet.getByRole("button", { name: "8 Angebote zeigen" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "");
});

test("Geburtsdatum filtert nach Alter, bleibt lokal und steht nie in der URL", async ({ page }) => {
  // iOS-Zifferntastatur: ohne Punkte
  await setBirthDate(page, "01092026");
  await expect(offers(page)).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Kind und Einstellungen/ })).toContainText("1 Mon.");
  await expect(page.getByText("4 passen nicht zu 1 Mon.")).toBeVisible();
  expect(page.url()).not.toMatch(/2026-09-01|01092026|01\.09/);

  await page.getByRole("button", { name: "trotzdem zeigen" }).click();
  await expect(offers(page)).toHaveCount(8);
  await expect(page.locator(".card.unfit")).toHaveCount(4);
  await expect(page.locator(".card.unfit").first()).toContainText("Monate");

  await page.reload();
  await expect(offers(page)).toHaveCount(4);
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await expect(page.getByLabel("Geburtsdatum")).toHaveValue("01.09.2026");
  await expect(page.getByText("Dein Kind ist heute 1 Monat alt.")).toBeVisible();
});

test("„Nur passende“ aus zeigt alles, unpassende markiert", async ({ page }) => {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await page.getByLabel("Geburtsdatum").fill("01.09.2026");
  await page.getByRole("switch", { name: "Nur passende Angebote" }).click();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(offers(page)).toHaveCount(8);
  await expect(page.locator(".card.unfit")).toHaveCount(4);
});

test("ungültiges Geburtsdatum wird erklärt und nicht gespeichert", async ({ page }) => {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await page.getByLabel("Geburtsdatum").fill("31.02.2026");
  await expect(page.getByText("Bitte als TT.MM.JJJJ eingeben")).toBeVisible();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(offers(page)).toHaveCount(8);
  await expect(page.getByRole("button", { name: /^Kind und Einstellungen/ })).toContainText("Alter?");
});

test("Leerzustand bei Filtern ohne Treffer, Zurücksetzen hilft", async ({ page }) => {
  await page.goto("./?kat=wasser");
  await expect(page.getByText("Diese Seite ist noch leer")).toBeVisible();
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(offers(page)).toHaveCount(8);
});
