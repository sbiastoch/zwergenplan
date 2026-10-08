/**
 * Gemerkte Anbieter (Plan 0025, Etappe 1, Test 9a): merken im Sheet und in der Liste, oben im Tab „Anbieter“ ohne
 * Dubletten, Suche und Filter, Privatsphäre. Eigene Datei: Die meisten Tests belegen den Speicher vor dem ersten
 * Laden vor. Fixtures, Uhr Mo 5.10.2026 12:00.
 */
import type { Page, Request } from "@playwright/test";
import { expect, startPreloads, test } from "./fixtures.ts";

const TREFF = "Familientreff Beispielhof (fiktiv)";
const THEATER = "Kleines Theater Beispiel (fiktiv)";
const MUSIK = "Musikschule Beispiel (fiktiv)";
const TOAST_SAVED = "Anbieter gemerkt – steht jetzt oben im Tab „Anbieter“";

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: new RegExp(`^${name}`) });
const providerSheet = (page: Page) => page.getByRole("dialog", { name: "Anbieter" });
const savedList = (page: Page) => page.locator("ul.provider-saved");
/** alle Zeilen außerhalb des Abschnitts „Gemerkte Anbieter“ */
const restRows = (page: Page) => page.locator("section.providers ul:not(.provider-saved) > li");
const heading = (page: Page, name: string) =>
  page.locator("section.providers").getByRole("heading", { level: 2, name });
/**
 * Zeilenknopf (öffnet das Sheet) unter „Gemerkte Anbieter“. `button.place` statt Rolle und Namensanfang: Das Herz
 * derselben Zeile heißt „… merken“ (E2, E3) und beginnt mit demselben Namen.
 */
const savedRow = (page: Page, name: string) => savedList(page).locator("button.place", { hasText: name });
const heart = (page: Page, name: string) => page.getByRole("button", { name: `${name} merken`, exact: true });
const isDirectory = (url: string) => new URL(url).pathname.endsWith("/data/anbieter.json");
const isChunk = (url: string) => /\/assets\/anbieter\/[^/]+\.js$/.test(new URL(url).pathname);

/** wie FIXTURE_NOW in fixtures.ts: Mo 5.10.2026 12:00 Berlin (für den zweiten Kontext im Privatsphäre-Test) */
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

/** site.json zurückhalten, bis `release()` gerufen wird (wie in e2e/anbieter.spec.ts) */
async function holdSite(page: Page) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/data/site.json", async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

/** Speicher vor dem ersten Laden belegen (nicht per Herz-Tipp, Plan 0025, Tests) */
async function preset(page: Page, ids: string[]) {
  await page.addInitScript((list) => {
    localStorage.setItem("zwergenplan.anbieter-merkliste", JSON.stringify(list));
  }, ids);
}

function collect(page: Page, filter: (url: string) => boolean): Request[] {
  const seen: Request[] = [];
  page.on("request", (req) => {
    if (filter(req.url())) seen.push(req);
  });
  return seen;
}

/** Pfade (ohne Query) aller Requests im Ablauf Start → Merkliste → „Entdecken“ → Tab „Anbieter“ */
async function flowPaths(page: Page): Promise<string[]> {
  const preloaded = startPreloads(page);
  const paths = new Set<string>();
  page.on("request", (req) => paths.add(new URL(req.url()).pathname));
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await preloaded;
  await tab(page, "Merkliste").click();
  await expect(page.getByText("Noch nichts gemerkt")).toBeVisible();
  await tab(page, "Entdecken").click();
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await tab(page, "Anbieter").click();
  await expect(restRows(page).first()).toBeVisible();
  return [...paths].sort();
}

test("im Sheet merken: Toast, Herz gedrückt, oben im Tab „Anbieter“ ohne Dublette, übersteht das Neuladen", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  await page.getByRole("button", { name: "Mehr von diesem Anbieter" }).click();
  const sheet = providerSheet(page);
  // Startfokus auf dem Namen, nicht auf dem Herz daneben (der Chunk kam hier erst nach dem Öffnen)
  await expect(sheet.getByRole("heading", { level: 2, name: TREFF })).toBeFocused();
  const sheetHeart = sheet.getByRole("button", { name: `${TREFF} merken` });
  await expect(sheetHeart).toHaveAttribute("aria-pressed", "false");
  await sheetHeart.click();
  await expect(sheetHeart).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText(TOAST_SAVED)).toBeVisible();
  await sheet.getByRole("button", { name: "Schließen" }).click();
  await expect(sheet).toBeHidden();
  // Schließen wirkt wie „Zurück“: darunter liegt wieder das Detail (wie in e2e/anbieter.spec.ts)
  const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "Zurück" }).click();
  await expect(detail).toBeHidden();
  // `anbieter=` nur bei offenem Sheet; die gemerkte ID steht nie für sich in der URL
  await expect(page).not.toHaveURL(/anbieter=/);

  await tab(page, "Anbieter").click();
  await expect(heading(page, "Gemerkte Anbieter")).toBeVisible();
  await expect(savedRow(page, TREFF)).toContainText("3 Angebote");
  await expect(heart(page, TREFF)).toHaveAttribute("aria-pressed", "true");
  await expect(heart(page, TREFF)).toHaveCount(1);
  await expect(heading(page, "Weitere Anbieter")).toBeVisible();
  await expect(restRows(page).filter({ hasText: TREFF })).toHaveCount(0);

  await page.reload();
  await expect(savedRow(page, TREFF)).toBeVisible();
  // das Badge der Merkliste zählt nur gemerkte Angebote
  await expect(tab(page, "Merkliste").locator(".badge")).toHaveCount(0);
});

test("in der Liste merken und entfernen: Zeile wandert, Fokus bleibt auf der nachrückenden Zeile", async ({ page }) => {
  await page.goto("./?ansicht=anbieter");
  await expect(heading(page, "Gemerkte Anbieter")).toHaveCount(0);
  await expect(heart(page, THEATER)).toHaveAttribute("aria-pressed", "false");

  await heart(page, THEATER).click();
  await expect(page.getByText(TOAST_SAVED)).toBeVisible();
  // die gemerkte ID steht nie in der URL
  expect(page.url()).not.toContain("theater-beispiel");
  await expect(savedRow(page, THEATER)).toBeVisible();
  await expect(heart(page, THEATER)).toHaveAttribute("aria-pressed", "true");
  await expect(restRows(page).filter({ hasText: THEATER })).toHaveCount(0);
  // alphabetisch folgt die Musikschule; ihr Herz hat jetzt den Fokus (E3)
  await expect(heart(page, MUSIK)).toBeFocused();

  await heart(page, THEATER).click();
  await expect(page.getByText("Anbieter nicht mehr gemerkt")).toBeVisible();
  await expect(heading(page, "Gemerkte Anbieter")).toHaveCount(0);
  await expect(heading(page, "Weitere Anbieter")).toHaveCount(0);
  await expect(restRows(page).filter({ hasText: THEATER })).toHaveCount(1);
  // der Abschnitt ist weg: Fokus auf der Liste
  await expect(page.getByRole("region", { name: "Anbieter" })).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("zwergenplan.anbieter-merkliste"))).toBeNull();
});

test("Reihenfolge: Suchfeld, Statuszeile, „Gemerkte Anbieter“, „Weitere Anbieter“; ohne Termine blass oben", async ({
  page,
}) => {
  await preset(page, ["theater-beispiel", "turnverein-beispiel"]);
  await page.goto("./?ansicht=anbieter");
  await expect(savedList(page).locator("li")).toHaveCount(2);
  const order = await page
    .locator(".provider-search input, p.status, section.providers h2")
    .evaluateAll((els) =>
      els.map((el) => (el.tagName === "INPUT" ? "Suche" : el.tagName === "P" ? "Status" : el.textContent)),
    );
  expect(order).toEqual(["Suche", "Status", "Gemerkte Anbieter", "Weitere Anbieter"]);
  await expect(savedList(page).locator(".place.idle")).toContainText("Turnverein Beispiel (fiktiv)");
  await expect(savedList(page).locator(".place.idle")).toContainText("Gerade keine Termine im Plan");
  // gespeichert werden nur IDs
  expect(await page.evaluate(() => localStorage.getItem("zwergenplan.anbieter-merkliste"))).toBe(
    JSON.stringify(["theater-beispiel", "turnverein-beispiel"]),
  );
});

test("Suche trifft nur einen gemerkten: steht oben, kein „Kein Anbieter heißt so.“, Statuszeile bleibt", async ({
  page,
}) => {
  await preset(page, ["theater-beispiel"]);
  await page.goto("./?ansicht=anbieter");
  const status = page.locator("p.status");
  await expect(status).toContainText("Anbieter mit");
  const before = await status.textContent();
  await page.getByRole("searchbox", { name: "Anbieter suchen" }).fill("theater");
  await expect(savedList(page).locator("li")).toHaveCount(1);
  await expect(restRows(page)).toHaveCount(0);
  await expect(heading(page, "Weitere Anbieter")).toHaveCount(0);
  await expect(page.getByText("Kein Anbieter heißt so.")).toHaveCount(0);
  await expect(page.locator(".provider-announce")).toHaveText("1 Anbieter");
  await expect(status).toHaveText(before ?? "");
});

test("Startseiten-Filter blendet den gemerkten Anbieter aus: Zeile bleibt oben, blass", async ({ page }) => {
  await preset(page, ["theater-beispiel"]);
  await page.goto("./?ansicht=anbieter&kat=buecher");
  const row = savedList(page).locator("li");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".place.idle")).toContainText("keins passt zur Auswahl");
  await expect(restRows(page).filter({ hasText: THEATER })).toHaveCount(0);
});

test("Privatsphäre: Gemerkte Anbieter ändern keinen Request; nur der Tab „Anbieter“ lädt anbieter.json", async ({
  page,
}) => {
  await preset(page, ["familientreff-beispiel"]);
  const preloaded = startPreloads(page);
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await preloaded;
  const directory = collect(page, isDirectory);
  const chunks = collect(page, isChunk);

  await tab(page, "Merkliste").click();
  // die Merkliste zeigt keine Anbieter (E3)
  await expect(page.getByText("Noch nichts gemerkt")).toBeVisible();
  await tab(page, "Entdecken").click();
  await expect(page.getByTestId("offer").first()).toBeVisible();
  expect(directory, "kein anbieter.json außerhalb des Tabs").toHaveLength(0);
  expect(chunks, "kein Anbieter-Chunk außerhalb des Tabs").toHaveLength(0);

  await tab(page, "Anbieter").click();
  await expect(savedRow(page, TREFF)).toBeVisible();
  expect(directory, "anbieter.json genau einmal").toHaveLength(1);
  expect(chunks.length, "Chunk geladen").toBeGreaterThanOrEqual(1);
  expect(new Set(chunks.map((r) => r.url())).size, "jede Chunk-Datei genau einmal").toBe(chunks.length);
});

test("Privatsphäre: mit und ohne gemerkte Anbieter dieselben Request-Pfade", async ({ page, browser }) => {
  const without = await flowPaths(page);
  // eigener Kontext: eigener Speicher und eigener HTTP-Cache, die Optionen aus `use` gelten auch hier
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.clock.setFixedTime(FIXTURE_NOW);
    await preset(other, ["familientreff-beispiel", "theater-beispiel"]);
    const withSaved = await flowPaths(other);
    await expect(savedList(other).locator("li")).toHaveCount(2);
    expect(withSaved).toEqual(without);
  } finally {
    await context.close();
  }
});

test("Suchfeld behält Fokus und Text, wenn die Daten nach dem Tippen ankommen", async ({ page }) => {
  const release = await holdSite(page);
  await page.goto("./?ansicht=anbieter", { waitUntil: "domcontentloaded" });
  const search = page.getByRole("searchbox", { name: "Anbieter suchen" });
  await expect(page.getByText("Lade Angebote …")).toBeVisible();
  await search.click();
  await page.keyboard.type("thea");
  release();
  await expect(restRows(page).filter({ hasText: THEATER })).toHaveCount(1);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("thea");
});

test("bei 320 × 640: ein per Tastatur fokussiertes Herz liegt über der Tab-Leiste", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("./?ansicht=anbieter");
  const hearts = page.locator("section.providers button.heart");
  await expect(hearts.first()).toBeVisible();
  const last = hearts.last();
  // erst fokussieren, dann nach oben und per Tastatur zurück: Das Scrollen übernimmt der Browser
  await last.focus();
  await page.keyboard.press("Shift+Tab");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press("Tab");
  await expect(last).toBeFocused();
  const heartBox = await last.boundingBox();
  const tabsBox = await page.locator("nav.tabs").boundingBox();
  expect(heartBox && tabsBox, "Herz und Tab-Leiste sichtbar").toBeTruthy();
  if (!heartBox || !tabsBox) return;
  expect(heartBox.y + heartBox.height).toBeLessThanOrEqual(tabsBox.y);
});

test("per Tastatur: Enter auf dem Herz merkt, der Fokus geht auf das nächste Herz des Abschnitts", async ({ page }) => {
  await page.goto("./?ansicht=anbieter");
  await expect(page.getByRole("region", { name: "Anbieter" })).toBeVisible();
  await heart(page, TREFF).focus();
  await page.keyboard.press("Enter");
  await expect(heart(page, TREFF)).toHaveAttribute("aria-pressed", "true");
  // nachrückend unter „Weitere Anbieter“: alphabetisch folgt das Theater
  await expect(heart(page, THEATER)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(savedList(page).locator("li")).toHaveCount(2);
  await expect(heart(page, MUSIK)).toBeFocused();
  // unter „Gemerkte Anbieter“: Entfernen des ersten gibt den Fokus an das nächste gemerkte Herz
  await heart(page, TREFF).focus();
  await page.keyboard.press("Enter");
  await expect(heart(page, THEATER)).toBeFocused();
  await expect(heart(page, THEATER)).toHaveAttribute("aria-pressed", "true");
});

test("Filter trifft nur einen gemerkten Anbieter: Hinweis auf die ausgeblendeten bleibt, kein Leerzustand", async ({
  page,
}) => {
  await preset(page, ["stadtbibliothek-beispiel"]);
  await page.goto("./?ansicht=anbieter&kat=buecher");
  await expect(savedList(page).locator(".place:not(.idle)")).toHaveCount(1);
  await expect(page.getByText("4 weitere Anbieter haben gerade nichts Passendes.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Anbieter" }).locator(".empty")).toHaveCount(0);
  await expect(heading(page, "Weitere Anbieter")).toBeVisible();
});
