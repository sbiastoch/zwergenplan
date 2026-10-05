/**
 * Deploy-Build mit echten Daten. Die Uhr steht auf `generatedAt` des Datenstands (nicht auf der Echtzeit):
 * Ein alter Datenstand ist laut ADR 0002 nur eine Warnung und darf Code-Commits nicht rot machen.
 */
import type { Page } from "@playwright/test";
import { expect, MAP_READY, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoHorizontalScroll,
  expectTextFits,
  setTextScale,
} from "./mobile-ux.ts";
import { dataMeta } from "./real-data.ts";
import { clsFrom, observeVitals, readVitals, throttleMobile } from "./vitals.ts";

async function openAtDataTime(page: Page): Promise<{ offers: number }> {
  const meta = await dataMeta(page);
  await page.clock.setFixedTime(new Date(meta.generatedAt));
  await page.goto("./");
  if (meta.offers > 0) {
    // Echte Daten vorhanden → die Seite muss Angebote zeigen, nicht den Leerzustand.
    await expect(page.getByTestId("offer").first()).toBeVisible();
  } else {
    await expect(page.getByText("Noch keine Angebote")).toBeVisible();
  }
  return meta;
}

test("echter Build lädt und ist bedienbar", async ({ page }) => {
  await openAtDataTime(page);
  // Knopf-Beschriftungen mit Daten (Anbietername, Tag) dürfen umbrechen: Prüfung 5 nur mit Fixtures (Plan 0007, E10).
  await expectMobileUx(page, { buttons: false });
});

/** Weg zu den Ansichten mit echten Daten, ausgehend von der geladenen Startseite (Plan 0003, Arch-Hinweis 16). */
const REAL_VIEWS: Record<string, (page: Page) => Promise<void>> = {
  Start: async () => {},
  Kalender: async (page) => {
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
  },
  Detail: async (page) => {
    await page.getByTestId("offer").first().getByRole("heading").getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
};

for (const [name, go] of Object.entries(REAL_VIEWS)) {
  test(`echte Daten brechen bei 320 px und 200 % Textgröße nicht aus (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const meta = await openAtDataTime(page);
    test.skip(meta.offers === 0 && name !== "Start", "keine Daten");
    await go(page);
    await expectNoHorizontalScroll(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2, buttons: false });
    await expectAccessible(page);
  });
}

test("Stadtteil als Startpunkt mit echten Daten: Wegzeit aus der echten Tabelle (Plan 0004, Plan 0009)", async ({
  page,
}) => {
  const meta = await openAtDataTime(page);
  test.skip(meta.offers === 0, "keine Daten");
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  // Quellenhinweis aus der echten wegzeit.json (CC BY-SA 3.0 DE, E3)
  await expect(sheet.getByRole("link", { name: /^VGN-Soll-Daten vom / })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "CC BY-SA 3.0 DE" })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by-sa/3.0/de/",
  );
  await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("altstadt");
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByRole("status")).toContainText(
    "Wegzeit ab Altstadt mit Bus & Bahn (Di vormittags, inkl. Warten)",
  );
  const dists = page.getByTestId("offer").locator(".meta .dist");
  await expect(dists.first()).toHaveText(/^(\d+ Min\.|über 2 Std\.)$/);
  for (const text of await dists.allInnerTexts()) expect(text).toMatch(/^(\d+ Min\.|über 2 Std\.)$/);
  // Knopf-Beschriftungen mit Daten dürfen umbrechen: Prüfung 5 nur mit Fixtures (Plan 0007, E10).
  await expectMobileUx(page, { buttons: false });

  await page.setViewportSize({ width: 320, height: 640 });
  await expectNoHorizontalScroll(page);
  await setTextScale(page, 2);
  await expectNoHorizontalScroll(page);
  await expectTextFits(page, { scale: 2, buttons: false });
  await expectAccessible(page);
});

test("lange Listen werden schrittweise gezeigt (Plan 0003, E8)", async ({ page }) => {
  const meta = await openAtDataTime(page);
  test.skip(meta.offers <= 60, "zu wenige Angebote für mehrere Schritte");
  const cards = page.getByTestId("offer");
  const first = await cards.count();
  expect(first).toBeGreaterThanOrEqual(40);
  expect(first).toBeLessThan(meta.offers);
  await page.getByRole("button", { name: /^Weitere Angebote zeigen/ }).click();
  await expect.poll(() => cards.count()).toBeGreaterThan(first);
});

test("LCP und CLS bleiben mit echten Daten im Budget", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP-Drosselung und LCP-API gibt es nur in Chromium");
  const meta = await dataMeta(page);
  test.skip(meta.offers === 0, "keine Daten");
  await throttleMobile(page);
  await observeVitals(page);
  await page.clock.setFixedTime(new Date(meta.generatedAt));
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.waitForTimeout(500);
  const vitals = await readVitals(page);
  expect(vitals.lcp, "LCP (ms)").toBeLessThan(2500);
  const { cls, detail } = clsFrom(vitals);
  expect(cls, `CLS\n${detail}`).toBeLessThan(0.05);
});

test.describe("Karte mit echten Daten (Plan 0005)", () => {
  test.use({ tiles: "mock" });

  async function openMap(page: Page) {
    const meta = await openAtDataTime(page);
    test.skip(meta.offers === 0, "keine Daten");
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", MAP_READY);
  }

  test("Karte ist bereit, Orts-Liste vollständig, kein Test-Haken im Deploy-Build", async ({ page }) => {
    await openMap(page);
    expect(await page.getByRole("region", { name: "Orte" }).getByRole("button").count()).toBeGreaterThanOrEqual(50);
    // __zpMap gibt es nur im E2E-Build (__E2E__, Plan 0005 E13)
    expect(await page.evaluate(() => "__zpMap" in window)).toBe(false);
    // Ortsnamen aus Daten dürfen umbrechen: Prüfung 5 nur mit Fixtures (Plan 0007, E10).
    await expectMobileUx(page, { buttons: false });
  });

  test("Karte bricht bei 320 px und 200 % Textgröße nicht aus", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page);
    await expectNoHorizontalScroll(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2, buttons: false });
    await expectAccessible(page);
  });
});
