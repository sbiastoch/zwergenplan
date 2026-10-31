/**
 * Sortierung der Liste und Etikett „Neu“ (Plan 0043, E4, E5). Fixtures, Uhr Mo 5.10.2026 12:00. Eingestellt:
 * Musikgarten 5.10., Krabbelreime 2.10. (diese Woche), Krabbeltreff 28.9., Kuckuck 24.9. (vorige Woche),
 * PEKiP und Babykonzert 15.9.; Babymassage, Elterncafé und Bewegungslandschaft ohne `listedAt`.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, mapSettled, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoHorizontalScroll,
  expectTextFits,
  setTextScale,
} from "./mobile-ux.ts";

const sortButton = (page: Page) => page.getByRole("button", { name: /^Sortierung:/ });
const menu = (page: Page) => page.getByRole("menu", { name: "Sortieren nach" });
const item = (page: Page, name: string) => menu(page).getByRole("menuitemradio", { name });
const card = (page: Page, title: string) => page.getByTestId("offer").filter({ hasText: title });
const titles = (scope: Locator) => scope.getByTestId("offer").getByRole("heading", { level: 3 }).allTextContents();

async function ready(page: Page, path = "./") {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "Zwergenplan" })).toBeVisible();
  await expect(page.getByTestId("offer").first()).toBeVisible();
}

/** Liegt `inner` ganz in `outer` (Bounding-Boxen, 1 px Toleranz)? */
async function inside(inner: Locator, outer: Locator) {
  const a = await inner.boundingBox();
  const b = await outer.boundingBox();
  if (!a || !b) throw new Error("Bounding-Box fehlt");
  return a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
}

async function overlaps(a: Locator, b: Locator) {
  const x = await a.boundingBox();
  const y = await b.boundingBox();
  if (!x || !y) throw new Error("Bounding-Box fehlt");
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
}

test("Menü per Tipp: „Neu eingestellt“ wählen – URL, gefüllter Knopf, Wochengruppen, Karten mit Datum", async ({
  page,
}) => {
  await ready(page);
  const button = sortButton(page);
  await expect(button).toHaveAccessibleName("Sortierung: Nächste Termine");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).not.toHaveClass(/\bon\b/);

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(menu(page).getByRole("menuitemradio")).toHaveCount(3);
  await expect(item(page, "Nächste Termine")).toHaveAttribute("aria-checked", "true");
  await expect(item(page, "Nächste Termine")).toBeFocused();
  await expect(item(page, "Neu eingestellt")).toHaveAccessibleDescription("neueste zuerst");

  await item(page, "Neu eingestellt").click();
  await expect(menu(page)).toBeHidden();
  await expect(page).toHaveURL(/\?sortierung=neu$/);
  await expect(button).toBeFocused();
  await expect(button).toHaveAccessibleName("Sortierung: Neu eingestellt");
  await expect(button).toHaveClass(/\bon\b/);
  await expect(page.getByRole("status")).toContainText("Sortiert nach Neu eingestellt");

  const week = page.getByRole("region", { name: "Neu diese Woche, seit Di, 29. Sept." });
  const last = page.getByRole("region", { name: "Neu vorige Woche, Di, 22. – Mo, 28. Sept." });
  const older = page.getByRole("region", { name: "Früher eingestellt" });
  expect(await titles(week)).toEqual(["Krabbelreime & Fingerspiele", "Musikgarten 1 (1–2 Jahre)"]);
  expect(await titles(last)).toEqual(["Offener Krabbeltreff", "„Kuckuck im Nest“ – Theater ab 18 Monaten"]);
  await expect(older.getByTestId("offer")).toHaveCount(4);
  // ohne Tagesüberschrift: die Karte nennt das Datum
  await expect(week.getByTestId("offer").first().locator(".when")).toHaveText("Fr 9.10. · 10:30 Uhr");
  await expect(page.getByText("In den letzten 14 Tagen kam nichts Neues dazu.")).toHaveCount(0);

  // zurück auf Termine: Parameter weg, Knopf leer
  await button.click();
  await item(page, "Nächste Termine").click();
  await expect(page).toHaveURL((url) => url.search === "");
  await expect(button).not.toHaveClass(/\bon\b/);
  await expect(page.getByRole("region", { name: "Mittwoch, 7. Oktober" })).toBeVisible();
});

test("Tastatur: Pfeile mit Umlauf, Home/End, Escape und Wahl geben den Fokus an den Knopf, Tab folgt dem Fokus", async ({
  page,
}) => {
  await ready(page);
  const button = sortButton(page);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(item(page, "Nächste Termine")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "Neu eingestellt")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "Nächstgelegen")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "Nächste Termine")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(item(page, "Nächstgelegen")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(item(page, "Nächste Termine")).toBeFocused();
  await page.keyboard.press("End");
  await expect(item(page, "Nächstgelegen")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(button).toBeFocused();
  await expect(page).toHaveURL((url) => url.search === "");

  await page.keyboard.press(" ");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu(page)).toBeHidden();
  await expect(page).toHaveURL(/\?sortierung=neu$/);
  await expect(button).toBeFocused();

  // Leertaste wählt ebenso; das Menü öffnet danach nicht erneut (keyup auf dem Knopf)
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press(" ");
  await expect(page).toHaveURL((url) => url.search === "");
  await expect(menu(page)).toBeHidden();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(item(page, "Nächste Termine")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu(page)).toBeHidden();
  await expect(button).not.toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test("ein Tipp daneben schließt das Menü und öffnet keine Karte", async ({ page }) => {
  await ready(page);
  await sortButton(page).click();
  await expect(menu(page)).toBeVisible();
  // links neben dem rechtsbündigen Menü, auf Höhe seiner Mitte: dort liegt die Liste (auch auf kleinen Bildschirmen)
  const box = await page.locator(".sort-menu").boundingBox();
  if (!box) throw new Error("Menü fehlt");
  await page.mouse.click(Math.max(2, box.x - 12), box.y + box.height / 2);
  await expect(menu(page)).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL((url) => url.search === "");
});

test("Deep-Link ?sortierung=neu öffnet sortiert; der Tab-Wechsel behält die Wahl, die Merkliste sortiert eigenständig", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("zwergenplan.merkliste", JSON.stringify(["lxizt974"])));
  await ready(page, "./?sortierung=neu");
  await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Neu eingestellt");
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/^Neu diese Woche/);
  await page.getByRole("button", { name: /^Merkliste/ }).click();
  await expect(page).toHaveURL(/ansicht=merkliste&sortierung=neu$/);
  // Die Liste der Merkliste hat ihren eigenen Knopf (Plan 0057, E6), Kalender und Karte keinen
  await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Was ist zu tun");
  const views = page.getByRole("group", { name: "Darstellung der Merkliste" });
  await views.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(sortButton(page)).toHaveCount(0);
  await views.getByRole("button", { name: "Liste", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: /^Angebote/ })
    .click();
  await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Neu eingestellt");
});

test.describe("Kartenansicht und Orts-Sheet", () => {
  test.use({ tiles: "mock" });

  test("Kartenansicht mit Sortier-Knopf, die Liste darunter folgt der Wahl; Gates (Plan 0056, N9)", async ({
    page,
  }) => {
    await ready(page, "./?sortierung=neu");
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", { timeout: 30_000 });
    await expect(page).toHaveURL(/ansicht=karte&sortierung=neu$/);
    await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Neu eingestellt");
    await expect(page.locator(".view-tools")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: /^Neu diese Woche/ })).toHaveCount(1);
    await expectMobileUx(page);
  });

  test("Etikett im Orts-Sheet ganz im sichtbaren Bereich des Scroll-Containers", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", { timeout: 30_000 });
    // Marker des Beispielhofs (tests/fixtures/providers.yaml); die Orts-Liste gibt es seit Plan 0056, E5 nicht mehr
    await page.evaluate(() => window.__zpMap?.jumpTo({ center: [11.0767, 49.4521], zoom: 15 }));
    await mapSettled(page);
    await page.locator(".map-box").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const point = await page.evaluate(() => window.__zpMap?.project([11.0767, 49.4521]));
    const box = await page.locator(".map-box").boundingBox();
    if (!point || !box) throw new Error("keine Karte");
    await page.mouse.click(box.x + 2 + point.x, box.y + 2 + point.y);
    const sheet = page.getByRole("dialog", { name: "Familientreff Beispielhof" });
    const tag = sheet.getByTestId("offer").filter({ hasText: "Offener Krabbeltreff" }).locator(".new-tag");
    await expect(tag).toBeVisible();
    // gepollt: Das Sheet fährt noch ein, eine einzelne Messung kam in der CI zu früh (flaky auf main, 0d50787)
    await expect.poll(() => inside(tag, sheet.locator(".sheet-scroll"))).toBe(true);
  });
});

test("Hinweis, wenn ein Filter alle neuen ausblendet; Zeitraum + „neu“ öffnet den Termin der Karte", async ({
  page,
}) => {
  // Babykurse: PEKiP (15.9.) und Babymassage (ohne listedAt), beide früher eingestellt
  await ready(page, "./?kat=babykurse&sortierung=neu");
  await expect(page.getByText("In den letzten 14 Tagen kam nichts Neues dazu.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Früher eingestellt" })).toBeVisible();

  // Krabbeltreff (vorige Woche) steht im Zeitraum am 21.10.
  await ready(page, "./?von=2026-10-20&bis=2026-10-31&sortierung=neu");
  const treff = page
    .getByRole("region", { name: /^Neu vorige Woche/ })
    .getByTestId("offer")
    .first();
  await expect(treff.locator(".when")).toHaveText("Mi 21.10. · 10:00 Uhr");
  await treff.getByRole("heading", { level: 3 }).getByRole("button").click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByRole("link", { name: "Nur Mi 21.10." })).toBeVisible();
});

test("Etikett „Neu“: nur auf den 14 Tagen, vor dem Titel, frei von Pille und Herz, ganz sichtbar", async ({ page }) => {
  await ready(page);
  for (const title of ["Offener Krabbeltreff", "Krabbelreime", "Musikgarten 1", "Kuckuck im Nest"])
    await expect(card(page, title).locator(".new-tag")).toHaveText("Neu");
  for (const title of ["PEKiP-Gruppe", "Babymassage", "Babykonzert im Advent"])
    await expect(card(page, title).locator(".new-tag")).toHaveCount(0);

  const treff = card(page, "Offener Krabbeltreff");
  const tag = treff.locator(".new-tag");
  // im Kartentext vor dem Titel, damit die Karte „Neu, …“ vorliest
  expect(await treff.evaluate((el) => el.textContent?.trim().startsWith("Neu"))).toBe(true);
  expect(await overlaps(tag, treff.locator(".pill"))).toBe(false);
  expect(await overlaps(tag, treff.getByRole("button", { name: /merken$/ }))).toBe(false);
  expect(await overlaps(tag, page.getByRole("region", { name: "Mittwoch, 7. Oktober" }).locator("h2"))).toBe(false);
  expect(await inside(tag, page.locator("main"))).toBe(true);

  // Detail: dezent ganz unten, nur bei neuen Angeboten
  await card(page, "Musikgarten 1").getByRole("heading", { level: 3 }).getByRole("button").click();
  await expect(page.getByRole("dialog").getByText("Im Zwergenplan seit 5. Oktober")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Zurück" }).click();
  await card(page, "PEKiP-Gruppe").getByRole("heading", { level: 3 }).getByRole("button").click();
  await expect(page.getByRole("dialog").getByText(/^Im Zwergenplan seit/)).toHaveCount(0);
});

test("Etikett im Anbieter-Sheet und auf der Merkliste: ganz im sichtbaren Bereich des Scroll-Containers", async ({
  page,
}) => {
  await ready(page, "./?anbieter=b5nuus36");
  const sheet = page.getByRole("dialog", { name: "Anbieter" });
  const first = sheet.getByTestId("offer").filter({ hasText: "Offener Krabbeltreff" });
  // im Querformat steht die Karte unter dem sichtbaren Bereich
  await first.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(first.locator(".new-tag")).toBeVisible();
  expect(await inside(first.locator(".new-tag"), sheet.locator(".sheet-scroll"))).toBe(true);
  await first.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: /^Merkliste/ })
    .click();
  const saved = page.getByTestId("offer");
  await expect(saved).toHaveCount(1);
  await expect(saved.locator(".new-tag")).toBeVisible();
  expect(await inside(saved.locator(".new-tag"), page.locator("main"))).toBe(true);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Gates mit offenem Menü und in „Neu“ (${colorScheme === "light" ? "hell" : "dunkel"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await ready(page);
    await sortButton(page).click();
    await expect(menu(page)).toBeVisible();
    await expectMobileUx(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?sortierung=neu$/);
    await expectMobileUx(page);
  });
}

test("320 px und 200 %: Umschalter und Knopf nebeneinander, Menü ganz sichtbar, „Liste“/„Karte“ einzeilig", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ready(page);
  await setTextScale(page, 2);
  const singleLine = async (name: string) =>
    page.getByRole("button", { name, exact: true }).evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
  expect(await singleLine("Liste")).toBe(1);
  expect(await singleLine("Karte")).toBe(1);
  const toggle = await page.getByRole("button", { name: "Liste", exact: true }).boundingBox();
  const button = await sortButton(page).boundingBox();
  expect(Math.abs((toggle?.y ?? 0) - (button?.y ?? 100))).toBeLessThan(30);

  await sortButton(page).click();
  await expect(menu(page)).toBeVisible();
  // ganz im Bild und nicht unter der Tab-Leiste
  const box = await page.locator(".sort-menu").boundingBox();
  const tabs = await page.locator(".tabs").boundingBox();
  expect(box && box.y >= 0 && box.x >= 0 && box.x + box.width <= 320).toBe(true);
  if (box && tabs) expect(box.y + box.height).toBeLessThanOrEqual(tabs.y + 1);
  await expectNoHorizontalScroll(page);
  await expectTextFits(page, { scale: 2 });
  await expectAccessible(page);
});

for (const viewport of [
  { name: "Querformat", width: 915, height: 412 },
  { name: "Desktop", width: 1280, height: 800 },
]) {
  test(`${viewport.name}: Knopf in der Statuszeile, Menü im Bild`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await ready(page);
    await sortButton(page).click();
    const box = await page.locator(".sort-menu").boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
}

test.describe("Nächstgelegen (E7)", () => {
  test("ohne Startpunkt: Aufforderung ohne Request, „Startpunkt wählen“ öffnet das Sheet, danach nach Wegzeit", async ({
    page,
  }) => {
    const tables: string[] = [];
    page.on("request", (r) => {
      if (/\/data\/(wegzeit|linien)\.json/.test(r.url())) tables.push(r.url());
    });
    await ready(page);
    await sortButton(page).click();
    await expect(item(page, "Nächstgelegen")).toHaveAccessibleDescription("Startpunkt wählen");
    await item(page, "Nächstgelegen").click();
    await expect(page).toHaveURL(/\?sortierung=nah$/);
    await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Nächstgelegen");
    await expect(page.getByText("Wovon aus gerechnet?")).toBeVisible();
    await expect(page.getByText("Bis dahin nach Terminen")).toBeVisible();
    await expect(page.getByRole("region", { name: "Mittwoch, 7. Oktober" })).toBeVisible();
    // Die Wahl selbst lädt keine Tabelle (Invariante: kein Request hängt am Startpunkt)
    await page.waitForTimeout(300);
    expect(tables).toEqual([]);

    await page.getByRole("button", { name: "Startpunkt wählen" }).click();
    const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // Der Knopf ist weg: Der Fokus geht auf die Statuszeile, nicht auf <body>
    await expect(page.getByRole("status")).toBeFocused();
    await expect(page.getByText("Wovon aus gerechnet?")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/^Bis \d+ Minuten/);
  });

  test("mit gespeichertem Stadtteil: Bänder in Reihenfolge, Unterzeile und Menü nennen den Startpunkt", async ({
    page,
  }) => {
    await page.goto("./");
    await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await ready(page, "./?sortierung=nah");
    const headings = page.locator("section > h2.daylabel > span:first-child");
    await expect(headings.first()).toHaveText(/^Bis \d+ Minuten$/);
    const titles = await headings.allTextContents();
    expect(titles.length).toBeGreaterThanOrEqual(2);
    // 5er-Schritte, aufsteigend, „Über 2 Stunden“ zuletzt
    const minutes = titles.map((t) => (t === "Über 2 Stunden" ? 999 : Number(/^Bis (\d+) Minuten$/.exec(t)?.[1])));
    expect(minutes.every((m) => m % 5 === 0)).toBe(true);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    const first = titles[0] ?? "";
    await expect(page.getByRole("region", { name: `${first}, mit Bus & Bahn ab Gostenhof` })).toBeVisible();
    // Karten mit Datum, innerhalb des Bands nach gerundeten Minuten
    await expect(
      page
        .getByRole("region", { name: new RegExp(`^${first}`) })
        .locator(".when")
        .first(),
    ).toHaveText(/^\w\w \d+\.\d+\. · /);
    await sortButton(page).click();
    await expect(item(page, "Nächstgelegen")).toHaveAccessibleDescription("Wegzeit ab Gostenhof");
    await expect(item(page, "Nächstgelegen")).toHaveAttribute("aria-checked", "true");
  });
});

test("„Nächstgelegen“ wartet auf die Wegzeit: Platzhalter statt Liste, die Zahl bleibt sichtbar (Review 3, M6)", async ({
  page,
}) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/data/wegzeit.json", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("./");
  await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
  await page.goto("./?sortierung=nah");
  await expect(page.getByText("Wegzeiten werden geladen …")).toBeVisible();
  await expect(page.getByTestId("offer")).toHaveCount(0);
  await expect(page.getByRole("status")).not.toHaveClass(/pending/);
  await expect(page.getByRole("status")).toContainText("8 Angebote");
  release();
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/^Bis \d+ Minuten/);
});
