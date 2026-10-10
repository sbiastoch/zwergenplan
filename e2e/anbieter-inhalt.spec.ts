/**
 * Anbieterübersicht (Plan 0010), Paket B: Inhalt von Liste und Anbieter-Sheet. Fixtures mit eingefrorener Uhr
 * (Mo 5.10.2026 12:00): 8 kommende Angebote von 5 Anbietern, dazu der Turnverein ohne Angebote. Tab, Lazy-Laden,
 * History und Privatsphäre stehen in anbieter.spec.ts (Paket A).
 *
 * Wegzeit ab Gostenhof aus der Fixture-Tabelle (`tests/fixtures/oepnv`, nachgerechnet in startpunkt.spec.ts und
 * scripts/transit/table.test.ts; Plan 0012): Theater 3,6 → „5 Min.“, Beispielhof 13,6 → „15 Min.“, Bibliothek 15,6
 * → „15 Min.“, Gemeinde 23,6 → „25 Min.“ (Tram 1 → Bus 202E), Musikschule 29,6 → „30 Min.“.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { clsFrom, observeVitals, readVitals } from "./vitals.ts";

const BIBLIOTHEK = "Bibliothek Beispiel (fiktiv)";
const GEMEINDE =
  "Ev.-Luth. Kirchengemeinde Beispielhausen-Südstadt – Mutter/Vater-Kind-Gruppen (Gemeindehaus Beispielkirche, fiktiv)";
const TREFF = "Familientreff Beispielhof (fiktiv)";
const THEATER = "Kleines Theater Beispiel (fiktiv)";
const MUSIKSCHULE = "Musikschule Beispiel (fiktiv)";
const TURNVEREIN = "Turnverein Beispiel (fiktiv)";

const list = (page: Page) => page.getByRole("region", { name: "Anbieter" });
const activeRows = (page: Page) => list(page).locator(".place:not(.idle)");
const idleRows = (page: Page) => list(page).locator(".place.idle");
const names = (rows: ReturnType<typeof activeRows>) => rows.locator(".provider-name").allInnerTexts();
const row = (page: Page, name: string) => list(page).locator(".place").filter({ hasText: name });
const search = (page: Page) => page.getByRole("searchbox", { name: "Anbieter suchen" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Anbieter" });

/** Tab „Anbieter“ direkt per URL (Filter davor, kanonisch), Liste geladen */
async function openList(page: Page, filter = "") {
  await page.goto(`./?${filter ? `${filter}&` : ""}ansicht=anbieter`);
  // die Region kommt mit dem Chunk; das Suchfeld steht schon vorher (Plan 0025, E3)
  await expect(list(page)).toBeVisible();
}

/** Stadtteil Gostenhof als gespeicherter Startpunkt: Die Tabelle lädt beim Start (Plan 0009, E9). */
async function storeGostenhof(page: Page) {
  await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
}

test("Liste ohne Startpunkt: fünf aktive Anbieter alphabetisch, Turnverein blass am Ende", async ({ page }) => {
  await openList(page);
  expect(await names(activeRows(page))).toEqual([BIBLIOTHEK, GEMEINDE, TREFF, THEATER, MUSIKSCHULE]);
  await expect(row(page, TREFF)).toContainText("3 Angebote · Altstadt");
  await expect(row(page, TREFF)).not.toContainText("Min.");
  // offen in der Liste, ohne Aufklappen (N3), und als letzte Zeile
  await expect(idleRows(page)).toHaveCount(1);
  await expect(idleRows(page)).toBeVisible();
  await expect(idleRows(page)).toContainText(TURNVEREIN);
  await expect(idleRows(page)).toContainText("Gerade keine Termine im Plan");
  await expect(list(page).locator(".place").last()).toHaveClass(/idle/);
  await expect(page.getByText(/weitere Anbieter/)).toHaveCount(0);
});

test.describe("Startpunkt Gostenhof", () => {
  test("mit Wegzeit nach dem nächsten Ort sortiert, Turnverein weiter am Ende", async ({ page }) => {
    await storeGostenhof(page);
    await openList(page);
    await expect(page.getByRole("status")).toContainText("Wegzeit ab Gostenhof");
    await expect(row(page, THEATER)).toContainText("2 Angebote · Gostenhof · 5 Min.");
    expect(await names(activeRows(page))).toEqual([THEATER, TREFF, BIBLIOTHEK, GEMEINDE, MUSIKSCHULE]);
    const lines = await activeRows(page).locator("span").allInnerTexts();
    expect(lines.map((l) => l.split(" · ").at(-1))).toEqual(["5 Min.", "15 Min.", "15 Min.", "25 Min.", "30 Min."]);
    await expect(list(page).locator(".place").last()).toContainText(TURNVEREIN);
  });

  test.describe("Tabelle fehlt", () => {
    test.use({ allowedConsoleErrors: [/\/data\/wegzeit\.json\b/] });

    test("Rückfall auf die Luftlinie: nach Entfernung sortiert, mit m bzw. km", async ({ page }) => {
      await page.route("**/data/wegzeit.json", (route) => route.fulfill({ status: 404 }));
      await storeGostenhof(page);
      await openList(page);
      await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
      await expect(row(page, THEATER)).toContainText("200 m");
      expect(await names(activeRows(page))).toEqual([THEATER, TREFF, BIBLIOTHEK, MUSIKSCHULE, GEMEINDE]);
      const lines = await activeRows(page).locator("span").allInnerTexts();
      for (const line of lines.slice(1)) expect(line).toMatch(/ · \d+(,\d)? km$/);
      await expect(list(page).locator(".place").last()).toContainText(TURNVEREIN);
    });
  });

  test("solange die Wegzeit lädt: Platzhalter-Block, danach Zeilen ohne Sprung", async ({ page, browserName }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/data/wegzeit.json", async (route) => {
      await held;
      await route.continue();
    });
    await observeVitals(page);
    await storeGostenhof(page);
    await openList(page);
    await expect(list(page).locator(".list-pending")).toHaveText("Wegzeiten werden geladen …");
    await expect(list(page).locator(".place")).toHaveCount(0);
    const before = (await readVitals(page)).shifts.length;
    release();
    await expect(row(page, THEATER)).toContainText("5 Min.");
    await expect(list(page).locator(".list-pending")).toHaveCount(0);
    // Layout-Shift-API gibt es nur in Chromium
    if (browserName === "chromium") {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      // ohne Eingabe-Shifts, wie die CLS-Definition (Plan 0013, Befund F1)
      const { cls, detail } = clsFrom(await readVitals(page), before);
      expect(cls, `CLS\n${detail}`).toBeLessThan(0.05);
    }
  });
});

test("Sticker „Bücher“: nur die Bibliothek, Hinweis auf die übrigen mit „Filter zurücksetzen“", async ({ page }) => {
  await openList(page, "kat=buecher");
  await expect(page.getByRole("status")).toContainText("1 Anbieter mit 1 Angebot");
  expect(await names(activeRows(page))).toEqual([BIBLIOTHEK]);
  const hint = list(page).locator(".provider-hidden");
  await expect(hint).toContainText("4 weitere Anbieter haben gerade nichts Passendes.");
  await expect(idleRows(page)).toHaveCount(1);
  await expect(idleRows(page)).toContainText(TURNVEREIN);
  await hint.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(activeRows(page)).toHaveCount(5);
  await expect(page).toHaveURL(/\?ansicht=anbieter$/);
});

test.describe("Suche", () => {
  test("„bibliothek“: eine Zeile, die Live-Region sagt „1 Anbieter“", async ({ page }) => {
    await openList(page);
    // ohne Suchtext zählt nur die Statuszeile
    await expect(list(page).locator("[aria-live=polite]")).toHaveText("");
    await search(page).fill("bibliothek");
    await expect(list(page).locator(".place")).toHaveCount(1);
    await expect(row(page, BIBLIOTHEK)).toBeVisible();
    await expect(list(page).locator("[aria-live=polite]")).toHaveText("1 Anbieter");
    await search(page).fill("");
    await expect(list(page).locator("[aria-live=polite]")).toHaveText("");
  });

  test("Umlaute gefaltet: „gemeindehaus“ und „sudstadt“ finden die Gemeinde", async ({ page }) => {
    await openList(page);
    await search(page).fill("sudstadt gemeindehaus");
    await expect(list(page).locator(".place")).toHaveCount(1);
    await expect(row(page, GEMEINDE)).toBeVisible();
  });

  test("„theater“ bei Sticker „Bücher“: das Theater blass, „2 Angebote, keins passt zur Auswahl“", async ({ page }) => {
    await openList(page, "kat=buecher");
    await search(page).fill("theater");
    await expect(activeRows(page)).toHaveCount(0);
    await expect(idleRows(page)).toHaveCount(1);
    await expect(idleRows(page)).toContainText(THEATER);
    await expect(idleRows(page)).toContainText("2 Angebote, keins passt zur Auswahl");
  });

  test("„xyz“: „Kein Anbieter heißt so.“, „Suche löschen“ bringt alle zurück", async ({ page }) => {
    await openList(page);
    await search(page).fill("xyz");
    await expect(list(page).getByText("Kein Anbieter heißt so.")).toBeVisible();
    await expect(list(page).locator(".place")).toHaveCount(0);
    await list(page).getByRole("button", { name: "Suche löschen" }).click();
    await expect(search(page)).toHaveValue("");
    await expect(activeRows(page)).toHaveCount(5);
  });
});

test.describe("Anbieter-Sheet", () => {
  test("Name, Kategorien, Website, Ort und die Kacheln ohne Anbieternamen", async ({ page }) => {
    await openList(page);
    await row(page, THEATER).click();
    await expect(sheet(page).getByRole("heading", { level: 2 })).toHaveText(THEATER);
    await expect(sheet(page).locator(".provider-cats")).toHaveText("Musik & Singen · Bühne & Konzert");
    const website = sheet(page).getByRole("link", { name: "Website & Programm" });
    await expect(website).toHaveAttribute("href", "https://example.org/theater");
    await expect(website).toHaveAttribute("target", "_blank");
    await expect(sheet(page).getByRole("heading", { level: 3, name: "Ort", exact: true })).toBeVisible();
    await expect(sheet(page).locator(".provider-venues")).toContainText("Bühnenplatz 2, 90429 Nürnberg · Gostenhof");
    await expect(sheet(page).getByRole("heading", { level: 3, name: "Kommende Angebote (2)" })).toBeVisible();
    const cards = sheet(page).getByTestId("offer");
    await expect(cards).toHaveCount(2);
    // erst der nächste Termin; die Meta-Zeile nennt den Ort, nicht den Anbieter (context="provider")
    await expect(cards.first()).toContainText("Kuckuck im Nest");
    for (const meta of await cards.locator(".meta").allInnerTexts()) {
      expect(meta).toBe("Gostenhof");
    }
    await expect(sheet(page).getByText("Alle Angebote, auch die außerhalb deiner Auswahl.")).toHaveCount(0);
  });

  test("mit Sticker „Bücher“: alle Theater-Angebote und der Hinweis", async ({ page }) => {
    await openList(page, "kat=buecher");
    await search(page).fill("theater");
    await row(page, THEATER).click();
    await expect(sheet(page).getByTestId("offer")).toHaveCount(2);
    await expect(sheet(page).getByText("Alle Angebote, auch die außerhalb deiner Auswahl.")).toBeVisible();
  });

  test("Turnverein: Text ohne Termine, zwei Orte, Adresse ohne wiederholten Namen", async ({ page }) => {
    await openList(page);
    await row(page, TURNVEREIN).click();
    await expect(sheet(page).getByRole("heading", { level: 2 })).toHaveText(TURNVEREIN);
    // Kategorien nur aus Angeboten (Plan 0030): ohne Termine keine Kategorienzeile
    await expect(sheet(page).locator(".provider-cats")).toHaveCount(0);
    await expect(
      sheet(page).getByText("Gerade stehen keine Termine im Zwergenplan. Auf der Website steht vielleicht mehr."),
    ).toBeVisible();
    await expect(sheet(page).getByTestId("offer")).toHaveCount(0);
    await expect(sheet(page).getByRole("heading", { level: 3, name: "Orte" })).toBeVisible();
    const venues = sheet(page).locator(".provider-venues li");
    await expect(venues).toHaveCount(2);
    await expect(venues.nth(0)).toHaveText(
      /^Turnhalle Beispiel\s*Sportweg 3, 90441 Nürnberg · Schweinau\s*Route in Google Maps$/,
    );
    await expect(venues.nth(1)).toHaveText(
      /^Gymnastikraum Beispiel\s*Am Beispielpark 7, 90480 Nürnberg\s*Route in Google Maps$/,
    );
    // Plan 0019, E5: Jeder Ort ist ein Link zur Route in Google Maps, nur mit der Adresse als Ziel
    const routes = venues.getByRole("link", { name: /Route in Google Maps/ });
    await expect(routes).toHaveCount(2);
    const maps = "https://www.google.com/maps/dir/?api=1&destination=";
    await expect(routes.nth(0)).toHaveAttribute("href", `${maps}Sportweg+3%2C+90441+N%C3%BCrnberg&travelmode=transit`);
    await expect(routes.nth(1)).toHaveAttribute(
      "href",
      `${maps}Am+Beispielpark+7%2C+90480+N%C3%BCrnberg&travelmode=transit`,
    );
    await expect(routes.nth(0)).toHaveAttribute("rel", "noopener noreferrer");
    await expect(routes.nth(0)).toHaveAttribute("target", "_blank");
    await expect(sheet(page).getByRole("heading", { level: 3, name: "Kommende Angebote (0)" })).toBeVisible();
  });
});

test("Alter: Das Sheet markiert unpassende Angebote wie die Kachel", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("zwergenplan.geburtsdatum", "2026-09-01"));
  await openList(page);
  // „Kuckuck im Nest“ (ab 18 Monaten) passt nicht zu 1 Monat: in der Liste nicht gezählt, im Sheet markiert (E4)
  await expect(row(page, THEATER)).toContainText("1 von 2 Angeboten");
  await row(page, THEATER).click();
  const cards = sheet(page).getByTestId("offer");
  await expect(cards).toHaveCount(2);
  const kuckuck = cards.filter({ hasText: "Kuckuck im Nest" });
  await expect(kuckuck).toHaveClass(/unfit/);
  await expect(kuckuck.locator(".fact.warn")).toContainText("Monate");
  await expect(cards.filter({ hasText: "Babykonzert im Advent" })).not.toHaveClass(/unfit/);
  await expect(sheet(page).getByText("Alle Angebote, auch die außerhalb deiner Auswahl.")).toBeVisible();
});
