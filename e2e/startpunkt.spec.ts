/**
 * Startpunkt und Entfernung (Plan 0004, E3, E5–E8): Stadtteil, Standort, Verweigerung, Umkreis,
 * Privatsphäre. Fixtures, Uhr Mo 5.10.2026 12:00. Ab Gostenhof (49,448 / 11,058): Theater 226 m,
 * Beispielhof 1 427 m, Bibliothek 1 689 m, Musikschule 2 358 m, Gemeinde 3 008 m.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const KEY = "zwergenplan.entfernung-ab";
/** Eine Koordinate mit mindestens zwei Nachkommastellen, z. B. „49.45“ */
const COORDINATE = /\d{2}\.\d{2,}/;

const offers = (page: Page) => page.getByTestId("offer");

async function ready(page: Page, path = "./") {
  await page.goto(path);
  await expect(offers(page).first()).toBeVisible();
}

async function openKidSheet(page: Page) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Sammelt jeden Request ab jetzt (E8: Nach der Wahl des Startpunkts entsteht keiner). */
function collectRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => requests.push(req.url()));
  return requests;
}

async function storedValues(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k) ?? ""}`));
}

test("Stadtteil als Startpunkt: Entfernung auf Kachel, im Detail und in der Statuszeile", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  const sheet = await openKidSheet(page);
  await expect(sheet.getByText("Noch kein Startpunkt – dann zeigen wir keine Entfernung.")).toBeVisible();

  const requests = collectRequests(page);
  await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  await expect(sheet.getByText("Startpunkt:")).toContainText("Gostenhof");
  await expect(sheet.getByRole("button", { name: "Startpunkt entfernen" })).toBeVisible();
  await sheet.getByRole("button", { name: "Fertig" }).click();

  await expect(page.getByRole("status")).toContainText("Entfernung als Luftlinie ab Gostenhof");
  // eigene Zeile ohne verwaisten „·“ vorn (Screenshot-Befund nach Schritt 5)
  const note = page.getByRole("status").getByText("Entfernung als Luftlinie ab Gostenhof");
  expect(await note.evaluate((el) => el.textContent)).not.toContain("·");
  const count = page.getByRole("status").getByText("Angebote ab heute");
  const [countBox, noteBox] = [await count.boundingBox(), await note.boundingBox()];
  expect(noteBox?.y).toBeGreaterThanOrEqual((countBox?.y ?? 0) + (countBox?.height ?? 0) - 1);
  await expect(offers(page).filter({ hasText: "Kuckuck im Nest" })).toContainText("200 m");
  await expect(offers(page).filter({ hasText: "Offener Krabbeltreff" })).toContainText("1,4 km");
  expect(requests, "kein Request nach der Wahl des Startpunkts").toEqual([]);

  const url = page.url();
  expect(url).not.toContain("gostenhof");
  expect(url).not.toMatch(COORDINATE);

  await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
  await expect(detail.getByText("ca. 1,4 km Luftlinie ab Gostenhof")).toBeVisible();
  expect(page.url()).not.toContain("gostenhof");
  expect(page.url()).not.toMatch(COORDINATE);
  await detail.getByRole("button", { name: "Zurück" }).click();

  await page.reload();
  await expect(page.getByRole("status")).toContainText("Luftlinie ab Gostenhof");
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("gostenhof");
});

test("Startpunkt entfernen löscht auch den gespeicherten Stadtteil", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page);
  await expect(page.getByRole("status")).toContainText("Luftlinie ab Gostenhof");
  const sheet = await openKidSheet(page);
  await sheet.getByRole("button", { name: "Startpunkt entfernen" }).click();
  await expect(sheet.getByText("Noch kein Startpunkt – dann zeigen wir keine Entfernung.")).toBeVisible();
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  await expect(offers(page).filter({ hasText: "Kuckuck im Nest" })).not.toContainText("200 m");
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
});

test("Standort mit Freigabe: gerundet, nur im Speicher, kein Request", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 49.45213, longitude: 11.07672 });
  await ready(page);
  const sheet = await openKidSheet(page);

  const requests = collectRequests(page);
  await sheet.getByRole("button", { name: "Meinen Standort nutzen" }).click();
  await expect(sheet.getByText("Startpunkt:")).toContainText("Mein Standort");
  await expect(sheet.getByText(/auf ca\. 100 m gerundet/)).toBeVisible();
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("status")).toContainText("Entfernung als Luftlinie ab deinem Standort");
  expect(requests, "kein Request nach der Standortabfrage").toEqual([]);
  expect(page.url()).not.toMatch(COORDINATE);
  for (const value of await storedValues(page)) expect(value).not.toContain("49.45");

  await page.reload();
  await expect(offers(page).first()).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  for (const value of await storedValues(page)) expect(value).not.toContain("49.45");
});

test("Standort verweigert: Hinweis, kein Startpunkt", async ({ page }) => {
  // Gleiches Verhalten in Chromium und WebKit, ohne Berechtigungsdialog (Plan 0004, E8)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: (_ok: unknown, fail: (error: { code: number }) => void) => setTimeout(() => fail({ code: 1 }), 0),
    });
  });
  await ready(page);
  const sheet = await openKidSheet(page);
  await sheet.getByRole("button", { name: "Meinen Standort nutzen" }).click();
  await expect(sheet.getByText("Standort nicht freigegeben. Wähle stattdessen einen Stadtteil.")).toBeVisible();
  await expect(sheet.getByText("Noch kein Startpunkt – dann zeigen wir keine Entfernung.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Meinen Standort nutzen" })).toBeEnabled();
});

test("Standort antwortet nie: Knopf bleibt fokussiert und „busy“, nach 15 s Hinweis", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: () => undefined });
  });
  await ready(page);
  // Uhr anhalten (wie FIXTURE_NOW), damit die 15 s ohne Warten vergehen
  await page.clock.pauseAt(new Date("2026-10-05T12:00:00+02:00"));
  const sheet = await openKidSheet(page);
  await sheet.getByRole("button", { name: "Meinen Standort nutzen" }).click();
  const busy = sheet.getByRole("button", { name: "Suche Standort …" });
  await expect(busy).toHaveAttribute("aria-busy", "true");
  // nicht `disabled`: Der Fokus bleibt auf dem Knopf, statt auf <body> zu fallen (Arch-Review 0004, m4)
  await expect(busy).toBeFocused();
  await page.clock.runFor(15_000);
  await expect(sheet.getByText("Standort gerade nicht verfügbar. Wähle stattdessen einen Stadtteil.")).toBeVisible();
  const again = sheet.getByRole("button", { name: "Meinen Standort nutzen" });
  await expect(again).not.toHaveAttribute("aria-busy", "true");
  await expect(again).toBeFocused();
});

test("Umkreis mit Startpunkt: bis 2 km blendet Musikschule und Gemeinde aus", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  await expect(sheet.getByText("Erst einen Startpunkt wählen.")).toHaveCount(0);
  await sheet.getByRole("button", { name: "bis 2 km" }).click();
  await expect(sheet.getByRole("button", { name: "bis 2 km" })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?umkreis=2$/);
  await sheet.getByRole("button", { name: "6 Angebote zeigen" }).click();

  await expect(offers(page)).toHaveCount(6);
  await expect(offers(page).filter({ hasText: "Musikgarten" })).toHaveCount(0);
  await expect(offers(page).filter({ hasText: "Bewegungslandschaft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeVisible();
  expect(page.url()).not.toContain("gostenhof");
});

test("Umkreis ohne Startpunkt: gesperrt, „Startpunkt wählen“ führt ins Kind-Sheet", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  for (const name of ["bis 2 km", "bis 5 km", "bis 10 km"]) {
    await expect(sheet.getByRole("button", { name })).toBeDisabled();
  }
  await expect(sheet.getByRole("button", { name: "Egal" }).last()).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText("Erst einen Startpunkt wählen.")).toBeVisible();
  await sheet.getByRole("button", { name: "Startpunkt wählen" }).click();
  await expect(sheet).toBeHidden();
  const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await expect(kid).toBeVisible();
  await expect(kid.getByLabel("Stadtteil", { exact: true })).toBeFocused();
});

test("geteilter Link mit ?umkreis= ohne Startpunkt: Hinweis, alle Angebote, Badge 0", async ({ page }) => {
  await ready(page, "./?umkreis=2");
  await expect(offers(page)).toHaveCount(8);
  await expect(page.getByText("„bis 2 km“ braucht einen Startpunkt.")).toBeVisible();
  // Der Hinweis steht außerhalb der Status-Region
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  await expect(page.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();

  await page.getByRole("button", { name: "Startpunkt wählen" }).click();
  const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await expect(kid).toBeVisible();
  await kid.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  await kid.getByRole("button", { name: "Fertig" }).click();

  await expect(offers(page)).toHaveCount(6);
  await expect(page.getByText("„bis 2 km“ braucht einen Startpunkt.")).toHaveCount(0);
  // Der Knopf im Hinweis ist mit dem Hinweis verschwunden: Der Fokus landet beim Filter, nicht auf <body>.
  await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeFocused();
  await expect(page).toHaveURL(/\?umkreis=2$/);
});

test("„Startpunkt wählen“ im Hinweis ohne Wahl: Der Fokus kehrt zum Knopf zurück", async ({ page }) => {
  await ready(page, "./?umkreis=2");
  const pick = page.getByRole("button", { name: "Startpunkt wählen" });
  await pick.click();
  const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await expect(kid.getByLabel("Stadtteil", { exact: true })).toBeFocused();
  await kid.getByRole("button", { name: "Fertig" }).click();
  await expect(kid).toBeHidden();
  await expect(pick).toBeFocused();
});
