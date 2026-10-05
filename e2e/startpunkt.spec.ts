/**
 * Startpunkt und Wegzeit (Plan 0004, E3/E5–E8; Plan 0009, E8–E11): Stadtteil, Standort, Verweigerung, Filter
 * „Wegzeit“, Laden der Tabelle nur auf Anlass, Rückfall auf die Luftlinie, Privatsphäre. Fixtures, Uhr
 * Mo 5.10.2026 12:00. Wegzeit ab Gostenhof (49,448 / 11,058) aus der Fixture-Tabelle (tests/fixtures/oepnv):
 * Theater 3,6 → „5 Min.“, Beispielhof 13,6 → „15 Min.“, Bibliothek 15,6, Musikschule 29,6, Gemeinde 32,6 Min.
 * Luftlinie: Theater 226 m, Beispielhof 1 427 m, Bibliothek 1 689 m, Musikschule 2 358 m, Gemeinde 3 008 m.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const KEY = "zwergenplan.entfernung-ab";
/** Eine Koordinate mit mindestens zwei Nachkommastellen, z. B. „49.45“ */
const COORDINATE = /\d{2}\.\d{2,}/;
const TABLE = "**/data/wegzeit.json";
const CHUNK = "**/assets/oepnv/*.js";
const isTable = (url: string) => new URL(url).pathname.endsWith("/data/wegzeit.json");
const isChunk = (url: string) => /\/assets\/oepnv\/[^/]+\.js$/.test(new URL(url).pathname);
const WEGZEIT_GOSTENHOF = "Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, inkl. Warten)";

const offers = (page: Page) => page.getByTestId("offer");
const card = (page: Page, title: string) => offers(page).filter({ hasText: title });

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

/**
 * Wartet auf die Antworten von Tabelle und Rechenlogik (Lazy-Chunk), bevor die Zählung „kein Request ab der Wahl“
 * beginnt (M9). Vor dem Auslöser aufrufen, danach auslösen, dann abwarten.
 */
function transitLoaded(page: Page) {
  return Promise.all([
    page.waitForResponse((r) => isTable(r.url()) && r.ok()),
    page.waitForResponse((r) => isChunk(r.url()) && r.ok()),
  ]);
}

/** Sammelt jeden Request ab jetzt (E8/E9: Nach der Wahl des Startpunkts entsteht keiner). */
function collectRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => requests.push(req.url()));
  return requests;
}

/** Zählt die Requests auf die Wegzeit-Tabelle ab jetzt. */
function tableRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (isTable(req.url())) requests.push(req.url());
  });
  return requests;
}

async function storedValues(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k) ?? ""}`));
}

test("Wegzeit ab Stadtteil: lädt beim Öffnen des Kind-Sheets, ab der Wahl kein Request", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  const loaded = transitLoaded(page);
  const sheet = await openKidSheet(page);
  await loaded;
  await expect(sheet.getByText("Noch kein Startpunkt – dann zeigen wir keine Wegzeit.")).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Wegzeit ab" })).toBeVisible();

  const requests = collectRequests(page);
  await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  await expect(sheet.getByText("Startpunkt:")).toContainText("Gostenhof");
  await expect(sheet.getByRole("button", { name: "Startpunkt entfernen" })).toBeVisible();
  await sheet.getByRole("button", { name: "Fertig" }).click();

  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  // eigene Zeile ohne verwaisten „·“ vorn (Screenshot-Befund nach Plan 0004, Schritt 5)
  const note = page.getByRole("status").getByText(WEGZEIT_GOSTENHOF);
  expect(await note.evaluate((el) => el.textContent)).not.toContain("·");
  const count = page.getByRole("status").getByText("Angebote ab heute");
  const [countBox, noteBox] = [await count.boundingBox(), await note.boundingBox()];
  expect(noteBox?.y).toBeGreaterThanOrEqual((countBox?.y ?? 0) + (countBox?.height ?? 0) - 1);
  // von Hand nachgerechnet (E15): Gostenhof → Beispielhof 13,6 Min. → „15 Min.“
  await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("15 Min.");
  await expect(card(page, "Kuckuck im Nest").locator(".dist")).toHaveText("5 Min.");
  await expect(card(page, "Musikgarten").locator(".dist")).toHaveText("30 Min.");
  await expect(page.locator(".meta .dist").filter({ hasText: "km" })).toHaveCount(0);
  expect(requests, "kein Request nach der Wahl des Startpunkts").toEqual([]);

  const url = page.url();
  expect(url).not.toContain("gostenhof");
  expect(url).not.toMatch(COORDINATE);

  await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
  await expect(detail.getByText("ca. 15 Min. mit Bus & Bahn ab Gostenhof")).toBeVisible();
  expect(page.url()).not.toContain("gostenhof");
  expect(page.url()).not.toMatch(COORDINATE);
  await detail.getByRole("button", { name: "Zurück" }).click();
  expect(requests, "auch Detail und Rückweg laden nichts").toEqual([]);

  // gespeicherter Stadtteil: Die Tabelle lädt beim Start, die Wegzeit steht wieder
  await page.reload();
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("15 Min.");
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("gostenhof");
});

test("Kein Laden ohne Anlass: ohne Stadtteil, Kind-Sheet und Karte kein Request auf wegzeit.json (E9)", async ({
  page,
}) => {
  const requests = tableRequests(page);
  await ready(page);
  // Filter-Sheet und Kalender sind kein Anlass
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  await page
    .getByRole("dialog", { name: "Filter" })
    .getByRole("button", { name: /Angebote zeigen$/ })
    .click();
  await page.getByRole("button", { name: "Kalender" }).click();
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
});

test.describe("Gespeicherter Stadtteil", () => {
  // Die Karte (zweiter Auslöser) lädt Kacheln
  test.use({ tiles: "mock" });

  test("genau ein Request beim Start; Kind-Sheet und Karte laden nicht erneut (E9)", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    const requests = tableRequests(page);
    await ready(page);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    const sheet = await openKidSheet(page);
    await sheet.getByRole("button", { name: "Fertig" }).click();
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".places")).toBeVisible();
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(1);
  });
});

test("Startpunkt entfernen löscht auch den gespeicherten Stadtteil", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  const sheet = await openKidSheet(page);
  await sheet.getByRole("button", { name: "Startpunkt entfernen" }).click();
  await expect(sheet.getByText("Noch kein Startpunkt – dann zeigen wir keine Wegzeit.")).toBeVisible();
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  await expect(page.locator(".meta .dist")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
});

test("Standort mit Freigabe: gerundet, nur im Speicher, Wegzeit, ab dem Tipp kein Request", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 49.45213, longitude: 11.07672 });
  await ready(page);
  const loaded = transitLoaded(page);
  const sheet = await openKidSheet(page);
  await loaded;

  const requests = collectRequests(page);
  await sheet.getByRole("button", { name: "Meinen Standort nutzen" }).click();
  await expect(sheet.getByText("Startpunkt:")).toContainText("Mein Standort");
  await expect(sheet.getByText(/Wegzeit ab deinem Standort \(auf ca\. 100 m gerundet\)/)).toBeVisible();
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Wegzeit ab deinem Standort mit Bus & Bahn (Di vormittags, inkl. Warten)",
  );
  await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText(/^\d+ Min\.$/);
  await expect(page.locator(".meta .dist").filter({ hasText: "km" })).toHaveCount(0);
  // Der Beispielhof liegt um die Ecke: zu Fuß
  await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  await expect(page.getByRole("dialog").getByText("ca. 5 Min. zu Fuß ab deinem Standort")).toBeVisible();
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
  await expect(sheet.getByText("Noch kein Startpunkt – dann zeigen wir keine Wegzeit.")).toBeVisible();
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

test.describe("Rückfall auf die Luftlinie (E11)", () => {
  // Der abgebrochene Request meldet sich in beiden Engines in der Konsole.
  test.use({ allowedConsoleErrors: [/\/data\/wegzeit\.json\b/] });

  test("Tabelle nicht ladbar: Luftlinie, gesperrte Chips, „Nochmal laden“ bringt die Minuten", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    await page.route(TABLE, (route) => route.abort());
    await ready(page);
    await expect(page.getByRole("status")).toContainText(
      "Entfernung als Luftlinie ab Gostenhof – Wegzeiten gerade nicht verfügbar.",
    );
    await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("1,4 km");
    await expect(page.locator(".meta .dist").filter({ hasText: "Min." })).toHaveCount(0);

    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    for (const name of ["bis 20 Min.", "bis 30 Min.", "bis 45 Min."]) {
      await expect(sheet.getByRole("button", { name })).toBeDisabled();
    }
    await expect(sheet.getByRole("button", { name: "Egal" }).last()).toBeEnabled();
    await expect(sheet.getByText("Wegzeiten gerade nicht verfügbar.")).toBeVisible();

    await page.unroute(TABLE);
    await sheet.getByRole("button", { name: "Nochmal laden" }).click();
    // Der Knopf verschwindet; der Fokus steht auf der Überschrift vor den Chips, nicht auf <body> (N2, H2)
    await expect(sheet.getByRole("heading", { name: "Wegzeit" })).toBeFocused();
    await expect(sheet.getByRole("button", { name: "bis 20 Min." })).toBeEnabled();
    await expect(sheet.getByText("Wegzeiten gerade nicht verfügbar.")).toHaveCount(0);
    await sheet.getByRole("button", { name: /Angebote zeigen$/ }).click();
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("15 Min.");
  });

  test("Hinweis bei gesetzter Grenze: „Nochmal laden“ unter der Statuszeile", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    await page.route(TABLE, (route) => route.abort());
    await ready(page, "./?wegzeit=20");
    await expect(page.getByText("„bis 20 Min.“ wirkt gerade nicht: Wegzeiten nicht geladen.")).toBeVisible();
    // wirkt nicht: alle Angebote, Badge 0
    await expect(offers(page)).toHaveCount(8);
    await expect(page.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();
    await page.unroute(TABLE);
    await page.getByRole("button", { name: "Nochmal laden" }).click();
    // Der Hinweis samt Knopf verschwindet; der Fokus steht auf der Statuszeile mit dem Ergebnis (N2, H2)
    await expect(page.getByRole("status")).toBeFocused();
    await expect(offers(page)).toHaveCount(6);
    await expect(page.getByText(/wirkt gerade nicht/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeVisible();
    await expect(page.getByRole("status")).toBeFocused();
  });
});

// Arch-Review 0009, Befund 2: Eine alte wegzeit.json (HTTP-Cache) passt nicht zu site.json. „Nochmal laden“ muss
// dann wirklich neu laden, und zwar am HTTP-Cache vorbei, sonst käme dieselbe Datei wieder.
test("Veraltete Tabelle: Hinweis, „Nochmal laden“ lädt ohne Cache neu und bringt die Minuten (E8, E11)", async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  // Protokolliert die Cache-Art jedes Abrufs der Tabelle (sessionStorage „e2e-wegzeit-cache“). Chromium zeigt den
  // Header „no-cache“ bei aktivem Routing nicht, deshalb wird die Option des Aufrufs selbst beobachtet.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).endsWith("/data/wegzeit.json")) {
        const seen = sessionStorage.getItem("e2e-wegzeit-cache");
        sessionStorage.setItem("e2e-wegzeit-cache", `${seen ? `${seen} ` : ""}${init?.cache}`);
      }
      return original(input, init);
    };
  });
  await page.route(TABLE, async (route) => {
    const response = await route.fetch();
    const file = await response.json();
    // ein Ort, den site.json nicht mehr kennt: Die Spalte für einen Ort der Seite fehlt
    file.places[0] = "0,0";
    await route.fulfill({ response, json: file });
  });
  await ready(page, "./?wegzeit=20");
  await expect(page.getByText("„bis 20 Min.“ wirkt gerade nicht: Wegzeiten nicht geladen.")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");
  await expect(offers(page)).toHaveCount(8);

  await page.unroute(TABLE);
  await page.getByRole("button", { name: "Nochmal laden" }).click();
  await expect(offers(page)).toHaveCount(6);
  // erster Abruf mit dem HTTP-Cache, der zweite an ihm vorbei
  expect(await page.evaluate(() => sessionStorage.getItem("e2e-wegzeit-cache"))).toBe("default reload");
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await expect(page.getByText(/wirkt gerade nicht/)).toHaveCount(0);
});

// Plan 0009, N1 (H1): Chromium behält einen gescheiterten import() in der Module-Map, ein neuer Versuch scheitert
// dort sofort; WebKit holt ihn neu. Scheitert beim Wiederholen nur der Chunk, lädt die Seite deshalb gleich neu,
// statt erst einen Knopf „Seite neu laden“ anzubieten (ersetzt M8). Ohne Netz (Tabelle auch weg) nie.
test.describe("Rechenlogik nicht ladbar (M8, N1)", () => {
  test.use({
    allowedConsoleErrors: [
      /\/assets\/oepnv\/\S+ .*(ERR_FAILED|Failed to load|Failed to fetch dynamically imported module)/,
    ],
  });

  test("Chunk blockiert: „Nochmal laden“ lädt die Seite neu, sobald nur der Chunk scheitert", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    await page.route(CHUNK, (route) => route.abort());
    await ready(page, "./?wegzeit=20");
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");
    await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("1,4 km");
    await expect(page.getByRole("button", { name: "Seite neu laden" })).toHaveCount(0);

    // Chunk weiter blockiert, Tabelle kommt: Das Netz steht, also gleich neu laden (in beiden Engines)
    const reloaded = page.waitForEvent("load");
    await page.getByRole("button", { name: "Nochmal laden" }).click();
    await reloaded;
    await expect(page).toHaveURL(/\?wegzeit=20$/);
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");

    // Chunk wieder erreichbar: ein Tipp bringt die Minuten, je nach Engine mit oder ohne weiteres Neuladen
    await page.unroute(CHUNK);
    await page.getByRole("button", { name: "Nochmal laden" }).click();
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    await expect(offers(page)).toHaveCount(6);
    await expect(page).toHaveURL(/\?wegzeit=20$/);
    await expect(page.getByRole("button", { name: "Seite neu laden" })).toHaveCount(0);
  });

  // Arch-Review zur Nacharbeit, Befund 1: Nur „Nochmal laden“ darf neu laden, nicht das Öffnen eines Sheets
  test("Chunk blockiert: Kind-Sheet öffnen lädt die Seite nicht neu", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    await page.route(CHUNK, (route) => route.abort());
    await ready(page);
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");
    await page.evaluate(() => Object.assign(window, { e2eSameDocument: true }));
    const retried = page.waitForResponse((r) => isTable(r.url()) && r.ok());
    const sheet = await openKidSheet(page);
    await retried;
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");
    await expect(sheet).toBeVisible();
    expect(await page.evaluate(() => "e2eSameDocument" in window), "kein Neuladen beim Öffnen").toBe(true);
  });
});

// Chunk und Tabelle blockiert: Der Browser meldet beide (eigenes Opt-in nur für diesen Test).
test.describe("Rechenlogik und Tabelle nicht ladbar (N1)", () => {
  test.use({
    // ein Muster: Ein Array mit zwei Elementen läse Playwright als Tupel [Wert, Optionen]
    allowedConsoleErrors: [
      /\/assets\/oepnv\/\S+ .*(ERR_FAILED|Failed to load|Failed to fetch dynamically imported module)|\/data\/wegzeit\.json\b/,
    ],
  });

  test("ohne Netz (Chunk und Tabelle scheitern) kein Neuladen, „Nochmal laden“ bleibt", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    await page.route(CHUNK, (route) => route.abort());
    await ready(page, "./?wegzeit=20");
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");
    await page.route(TABLE, (route) => route.abort());
    // Markierung im Dokument: Ein Neuladen würde sie löschen
    await page.evaluate(() => Object.assign(window, { e2eSameDocument: true }));
    const retried = page.waitForRequest((r) => isTable(r.url()));
    await page.getByRole("button", { name: "Nochmal laden" }).click();
    await retried;
    await expect(page.getByRole("button", { name: "Nochmal laden" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");
    expect(await page.evaluate(() => "e2eSameDocument" in window), "kein Neuladen ohne Netz").toBe(true);
  });
});

test("Außerhalb des Stadtgebiets: Luftlinie mit Hinweis, Chips gesperrt mit Begründung (E11)", async ({
  page,
  context,
}) => {
  // in der BBOX, aber weit weg von jedem Halt der Fixture-Tabelle
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 49.4, longitude: 11.2 });
  await ready(page);
  const loaded = transitLoaded(page);
  const sheet = await openKidSheet(page);
  await loaded;
  await sheet.getByRole("button", { name: "Meinen Standort nutzen" }).click();
  await expect(sheet.getByText("Startpunkt:")).toContainText("Mein Standort");
  // Das Kind-Sheet sagt es selbst, nicht erst die Statuszeile (N3, H5)
  await expect(
    sheet.getByText("Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg. Wähle einen Stadtteil."),
  ).toBeVisible();
  await expect(sheet.getByText(/^Wegzeit ab deinem Standort/)).toHaveCount(0);
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Entfernung als Luftlinie ab deinem Standort – außerhalb des Stadtgebiets.",
  );
  await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText(/^\d+(,\d)? km$/);

  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const filter = page.getByRole("dialog", { name: "Filter" });
  await expect(filter.getByRole("button", { name: "bis 20 Min." })).toBeDisabled();
  await expect(filter.getByText("Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg.")).toBeVisible();
  await filter.getByRole("button", { name: "Startpunkt wählen" }).click();
  await expect(page.getByRole("dialog", { name: "Kind und Einstellungen" })).toBeVisible();
});

// N4 (H6): Die kurze Lizenz bricht nie um (live stand „DE“ allein in der zweiten Zeile); der Titel darf umbrechen.
test("Quellenhinweis: Lizenz-Link bricht nicht um, Titel-Link schon", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  const sheet = await openKidSheet(page);
  await expect(sheet.getByRole("link", { name: "CC0 1.0" })).toHaveCSS("white-space", "nowrap");
  await expect(sheet.getByRole("link", { name: "Fiktiver Fahrplan für Tests" })).toHaveCSS("white-space", "normal");
});

test("Wegzeit-Filter mit Startpunkt: bis 20 Min. blendet Musikschule und Gemeinde aus", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  await expect(sheet.getByRole("heading", { name: "Wegzeit" })).toBeVisible();
  await expect(sheet.getByText("Erst einen Startpunkt wählen.")).toHaveCount(0);
  await sheet.getByRole("button", { name: "bis 20 Min." }).click();
  await expect(sheet.getByRole("button", { name: "bis 20 Min." })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?wegzeit=20$/);
  await sheet.getByRole("button", { name: "6 Angebote zeigen" }).click();

  await expect(offers(page)).toHaveCount(6);
  await expect(card(page, "Musikgarten")).toHaveCount(0);
  await expect(card(page, "Bewegungslandschaft")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeVisible();
  expect(page.url()).not.toContain("gostenhof");
});

test("Wegzeit ohne Startpunkt: gesperrt, „Startpunkt wählen“ führt ins Kind-Sheet", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  for (const name of ["bis 20 Min.", "bis 30 Min.", "bis 45 Min."]) {
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

test("geteilter Link mit ?wegzeit= ohne Startpunkt: Hinweis, alle Angebote, Badge 0", async ({ page }) => {
  await ready(page, "./?wegzeit=20");
  await expect(offers(page)).toHaveCount(8);
  await expect(page.getByText("„bis 20 Min.“ braucht einen Startpunkt.")).toBeVisible();
  // Der Hinweis steht außerhalb der Status-Region
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  await expect(page.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();

  const loaded = transitLoaded(page);
  await page.getByRole("button", { name: "Startpunkt wählen" }).click();
  const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await expect(kid).toBeVisible();
  await loaded;
  await kid.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  await kid.getByRole("button", { name: "Fertig" }).click();

  await expect(offers(page)).toHaveCount(6);
  await expect(page.getByText("„bis 20 Min.“ braucht einen Startpunkt.")).toHaveCount(0);
  // Der Knopf im Hinweis ist mit dem Hinweis verschwunden: Der Fokus landet beim Filter, nicht auf <body>.
  await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeFocused();
  await expect(page).toHaveURL(/\?wegzeit=20$/);
});

test("alter Link mit ?umkreis= ist wirkungslos, ohne Fehlermeldung (E8)", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page, "./?umkreis=5");
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await expect(offers(page)).toHaveCount(8);
  await expect(page.getByText(/braucht einen Startpunkt|wirkt/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();
});

test("„Startpunkt wählen“ im Hinweis ohne Wahl: Der Fokus kehrt zum Knopf zurück", async ({ page }) => {
  await ready(page, "./?wegzeit=20");
  const pick = page.getByRole("button", { name: "Startpunkt wählen" });
  await pick.click();
  const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await expect(kid.getByLabel("Stadtteil", { exact: true })).toBeFocused();
  await kid.getByRole("button", { name: "Fertig" }).click();
  await expect(kid).toBeHidden();
  await expect(pick).toBeFocused();
});

/**
 * Statuszeile beim Laden: Jedes Kind ist unsichtbar (keine ungefilterte Zahl, keine Ansage), die Zeile selbst bleibt
 * sichtbar und damit fokussierbar, sie ist das Fokus-Ziel nach „Nochmal laden“ (Plan 0009, N2).
 */
async function expectStatusHidden(page: Page) {
  const status = page.locator("p.status[role=status]");
  await expect(status).toHaveCSS("visibility", "visible");
  await expect
    .poll(() => status.evaluate((p) => [...p.children].map((c) => getComputedStyle(c).visibility)))
    .toEqual(expect.arrayContaining(["hidden"]));
  expect(
    await status.evaluate((p) => [...p.children].every((c) => getComputedStyle(c).visibility === "hidden")),
    "alle Kinder der Statuszeile unsichtbar",
  ).toBe(true);
  expect(await status.evaluate((p) => [...p.childNodes].some((n) => n.nodeType === Node.TEXT_NODE))).toBe(false);
}

test.describe("Kein Flackern bei gespeichertem Stadtteil (M7)", () => {
  /** hält die Tabelle zurück, bis `release()` gerufen wird */
  async function holdTable(page: Page) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(TABLE, async (route) => {
      await gate;
      await route.continue();
    });
    return () => release();
  }

  test("ohne Grenze: Liste sofort, Platzhalter statt „km“, dann Minuten", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    const release = await holdTable(page);
    await ready(page);
    await expect(offers(page)).toHaveCount(8);
    await expect(card(page, "Offener Krabbeltreff").locator(".dist.pending")).toHaveCount(1);
    await expect(page.locator(".meta .dist").filter({ hasText: /km|Min\./ })).toHaveCount(0);
    // Der Text steht schon (Höhe), aber unsichtbar und ohne Ansage
    await expect(page.locator(".status-note")).toHaveCSS("visibility", "hidden");
    release();
    await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("15 Min.");
    await expect(page.locator(".status-note")).toHaveCSS("visibility", "visible");
    await expect(page.locator(".dist.pending")).toHaveCount(0);
  });

  test("mit ?wegzeit=20: Platzhalter-Block statt ungefilterter Liste, keine Kachel mit „km“", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    const release = await holdTable(page);
    await page.goto("./?wegzeit=20");
    const pending = page.locator(".list-pending");
    await expect(pending).toBeVisible();
    await expect(pending).toHaveText("Wegzeiten werden geladen …");
    await expect(offers(page)).toHaveCount(0);
    await expectStatusHidden(page);
    // kein Hinweis „wirkt nicht“ während des Ladens
    await expect(page.getByText(/wirkt|braucht einen Startpunkt/)).toHaveCount(0);
    release();
    await expect(offers(page)).toHaveCount(6);
    await expect(pending).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    await expect(page.locator(".meta .dist").filter({ hasText: "km" })).toHaveCount(0);
  });

  // Arch-Review 0009, Befund 4: auch der Kalender springt nicht von ungefiltert auf gefiltert
  test("Kalender mit ?wegzeit=20: Platzhalter-Block statt ungefiltertem Kalender", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    const release = await holdTable(page);
    await page.goto("./?ansicht=kalender&wegzeit=20");
    const pending = page.locator(".list-pending");
    await expect(pending).toBeVisible();
    await expect(pending).toHaveText("Wegzeiten werden geladen …");
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toHaveCount(0);
    await expect(offers(page)).toHaveCount(0);
    await expectStatusHidden(page);
    await expect(page.getByText(/wirkt|braucht einen Startpunkt/)).toHaveCount(0);
    release();
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
    await expect(pending).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    await expect(page.locator(".meta .dist").filter({ hasText: "km" })).toHaveCount(0);
  });
});
