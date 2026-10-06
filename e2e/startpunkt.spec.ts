/**
 * Startpunkt und Wegzeit (Plan 0004, E3/E5–E8; Plan 0009, E8–E11): Stadtteil, Standort, Verweigerung, Filter
 * „Wegzeit“, Laden der Tabelle nur auf Anlass, Rückfall auf die Luftlinie, Privatsphäre. Fixtures, Uhr
 * Mo 5.10.2026 12:00. Wegzeit ab Gostenhof (49,448 / 11,058) aus der Fixture-Tabelle (tests/fixtures/oepnv), von
 * Hand nachgerechnet (Plan 0012, „Umsetzung“, Schritt 1; Zellen in scripts/transit/table.test.ts):
 * - Zugang: Halt 9001 in 91 m = 1,58 Min. Fußweg (9002 in 473 m und 9003 in 1 368 m sind nie günstiger).
 * - Zellen ab 9001: Theater 2 (zu Fuß vom Halt, ohne Linien), Beispielhof 12 (Tram 1), Bibliothek 14 (Tram 1),
 *   Gemeinde 22 mit Umstiegs-Bit (Tram 1 → Bus 202E), Musikschule 28 mit Bit (Tram 1 → Bus 2).
 * - Also Theater 3,6 → „5 Min.“ mit Bus & Bahn (direkt zu Fuß wären es 3,9), Beispielhof 13,6 → „15 Min.“,
 *   Bibliothek 15,6 → „15 Min.“, Gemeinde 23,6 → „25 Min.“ (bewertet 33,6 < 52 zu Fuß), Musikschule 29,6 → „30 Min.“
 *   (bewertet 39,6 < 40,9 zu Fuß).
 * Luftlinie: Theater 226 m, Beispielhof 1 427 m, Bibliothek 1 689 m, Musikschule 2 358 m, Gemeinde 3 008 m.
 */
import type { Page } from "@playwright/test";
import { expect, expectTwoLines, startPreloads, test } from "./fixtures.ts";
import { setTextScale } from "./mobile-ux.ts";

const KEY = "zwergenplan.entfernung-ab";
/** gespeicherter Punkt (Plan 0016): 49,45213 / 11,07672, gerundet */
const POINT_KEY = "zwergenplan.startpunkt";
const STORED_HERE = '{"source":"standort","lat":49.452,"lon":11.077}';
const STORED_MAP_CENTER = '{"source":"karte","lat":49.452,"lon":11.077}';
const WEGZEIT_STANDORT = "Wegzeit ab deinem Standort";
/** Eine Koordinate mit mindestens zwei Nachkommastellen, z. B. „49.45“ */
const COORDINATE = /\d{2}\.\d{2,}/;
const TABLE = "**/data/wegzeit.json";
const CHUNK = "**/assets/oepnv/*.js";
const isTable = (url: string) => new URL(url).pathname.endsWith("/data/wegzeit.json");
const isChunk = (url: string) => /\/assets\/oepnv\/[^/]+\.js$/.test(new URL(url).pathname);
const LINES = "**/data/linien.json";
const isLines = (url: string) => new URL(url).pathname.endsWith("/data/linien.json");
const WEGZEIT_GOSTENHOF = "Wegzeit ab Gostenhof";
const NB = "\u00a0";

const offers = (page: Page) => page.getByTestId("offer");
const card = (page: Page, title: string) => offers(page).filter({ hasText: title });

/** Seite bereit, auch Export-Code und PWA-Kern sind nachgeladen: Danach entsteht kein Request ohne Anlass (Plan 0010, E8 A; Plan 0011, E5). */
async function ready(page: Page, path = "./") {
  const preloaded = startPreloads(page);
  await page.goto(path);
  await expect(offers(page).first()).toBeVisible();
  await preloaded;
}

async function openKidSheet(page: Page) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await expect(sheet).toBeVisible();
  // Abschnitt „Als App“ geladen (Lazy-Chunk beim Öffnen, für alle gleich; Plan 0011, E5): erst danach zählen
  await expect(sheet.locator(".app-pending")).toHaveCount(0);
  return sheet;
}

/**
 * Wartet auf die Antworten von Tabelle, Rechenlogik (Lazy-Chunk) und Linien (Plan 0012, E3), bevor die Zählung
 * „kein Request ab der Wahl“ beginnt (M9). Vor dem Auslöser aufrufen, danach auslösen, dann abwarten.
 */
function transitLoaded(page: Page) {
  return Promise.all([
    page.waitForResponse((r) => isTable(r.url()) && r.ok()),
    page.waitForResponse((r) => isChunk(r.url()) && r.ok()),
    page.waitForResponse((r) => isLines(r.url()) && r.ok()),
  ]);
}

/** Sammelt jeden Request ab jetzt (E8/E9: Nach der Wahl des Startpunkts entsteht keiner). */
function collectRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => requests.push(req.url()));
  return requests;
}

/** Zählt die Requests auf eine Datei ab jetzt (Standard: die Wegzeit-Tabelle). */
function tableRequests(page: Page, matches: (url: string) => boolean = isTable): string[] {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (matches(req.url())) requests.push(req.url());
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

  // hinter der Zahl, im selben Satz (Plan 0020, E1); Lage und Umbruch prüft „Statuszeile: Startpunkt …“
  await expect(page.getByRole("status")).toContainText(`8 Angebote ab heute · ${WEGZEIT_GOSTENHOF}`);
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
  // eine Linie (Plan 0012, E1): Beispielhof direkt mit Tram 1
  await expect(detail.getByText(`ca. 15 Min. mit Tram${NB}1 ab Gostenhof`)).toBeVisible();
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

/**
 * Lage des Zusatzes „ · Wegzeit ab …“ in der Statuszeile (Plan 0020, E1): Der Punkt steht in derselben Zeile wie das
 * Wort davor (U+00A0), die Zeile läuft nicht über. Gemessen per `Range` am Punkt und am letzten Zeichen davor.
 */
async function statusLayout(page: Page) {
  return page.evaluate(() => {
    const status = document.querySelector<HTMLElement>(".status");
    const reach = status?.querySelector<HTMLElement>(".status-reach");
    const dotNode = reach?.firstChild;
    if (!status || !(dotNode instanceof Text) || !dotNode.data.includes("·")) throw new Error("Zusatz fehlt");
    // U+00A0 vor dem Punkt ist die Zusage aus E1; ein normales Leerzeichen fiele beim Messen nur auf, wenn genau dort
    // umbrochen wird.
    if (!dotNode.data.startsWith("\u00a0")) throw new Error("vor dem Punkt fehlt das geschützte Leerzeichen");
    let prev = reach?.previousSibling ?? null;
    while (prev && !(prev instanceof Text && prev.data.trim())) prev = prev.previousSibling;
    if (!(prev instanceof Text)) throw new Error("Text vor dem Zusatz fehlt");
    const charRect = (node: Text, at: number) => {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      return range.getBoundingClientRect();
    };
    const word = charRect(prev, prev.data.trimEnd().length - 1);
    const dot = charRect(dotNode, dotNode.data.indexOf("·"));
    const s = getComputedStyle(status);
    return {
      sameLine: Math.abs(word.bottom - dot.bottom) < 2,
      overflow: status.scrollWidth - status.clientWidth,
      height: status.getBoundingClientRect().height,
      lineHeight: s.lineHeight.endsWith("px") ? Number.parseFloat(s.lineHeight) : 1.4 * Number.parseFloat(s.fontSize),
    };
  });
}

/** Zusatz geladen, Punkt am Wort davor, kein Überlauf; liefert die Maße für weitere Prüfungen. */
async function expectReachLayout(page: Page, what: string) {
  await expect(page.locator(".status-reach:not(.pending)")).toBeVisible();
  const m = await statusLayout(page);
  expect(m.sameLine, `${what}: „·“ in derselben Zeile wie das Wort davor`).toBe(true);
  expect(m.overflow, `${what}: kein horizontaler Überlauf`).toBeLessThanOrEqual(0);
  return m;
}

test("Statuszeile: Startpunkt hinter der Zahl, Punkt nie verwaist, kein Überlauf (Plan 0020, E1)", async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  const check = (what: string) => expectReachLayout(page, what);

  // per evaluate statt addInitScript: Der Startpunkt wechselt unten zwischen den Ladevorgängen.
  await ready(page);
  await page.evaluate((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page);
  await expect(page.getByRole("status")).toContainText(`8 Angebote ab heute · ${WEGZEIT_GOSTENHOF}`);
  await check("Liste, Gostenhof");
  await page.locator(".tabs").getByRole("button", { name: "Kalender" }).click();
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  const calendar = await check("Kalender, Gostenhof");
  if (width >= 390) {
    expect(calendar.height, "Kalender ab 390 px: Zahl und Startpunkt in einer Zeile").toBeLessThan(
      1.5 * calendar.lineHeight,
    );
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await setTextScale(page, 2);
  await check("Kalender, Gostenhof, 320 px, 200 %");

  // längster Stadtteil, in der Fixture außerhalb: der längste Zusatz „Luftlinie ab … (außerhalb des Stadtgebiets)“
  await page.evaluate((key) => localStorage.setItem(key, "roethenbach"), KEY);
  await page.setViewportSize({ width, height: 800 });
  await ready(page);
  await expect(page.getByRole("status")).toContainText(
    "Luftlinie ab Röthenbach b. Schweinau (außerhalb des Stadtgebiets)",
  );
  await check("Liste, Röthenbach");
  await page.setViewportSize({ width: 320, height: 640 });
  await setTextScale(page, 2);
  await check("Liste, Röthenbach, 320 px, 200 %");
});

test.describe("Statuszeile auf „Karte“", () => {
  test.use({ tiles: "mock" });

  test("Kartenmitte als Startpunkt neben dem Umschalter: Punkt nie verwaist, kein Überlauf (Plan 0020, E1)", async ({
    page,
  }) => {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: POINT_KEY,
      value: STORED_MAP_CENTER,
    });
    await ready(page);
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Orten · Wegzeit ab der Kartenmitte");
    await expectReachLayout(page, "Karte, Kartenmitte");
  });
});

test("Kein Laden ohne Anlass: ohne Stadtteil, Kind-Sheet und Karte kein Request auf wegzeit.json und linien.json (E9)", async ({
  page,
}) => {
  const requests = tableRequests(page, (url) => isTable(url) || isLines(url));
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

  test("genau ein Request beim Start, auch auf linien.json; Kind-Sheet und Karte laden nicht erneut (E9)", async ({
    page,
  }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    const requests = tableRequests(page);
    const lines = tableRequests(page, isLines);
    await ready(page);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    await expect.poll(() => lines.length).toBe(1);
    const sheet = await openKidSheet(page);
    await sheet.getByRole("button", { name: "Fertig" }).click();
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".places")).toBeVisible();
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(1);
    expect(lines).toHaveLength(1);
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

test("Standort mit Freigabe: gerundet gespeichert, Wegzeit, ab dem Tipp kein Request, nach dem Neuladen ohne neue Abfrage (Plan 0016)", async ({
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
  await expect(page.getByRole("status")).toContainText("Wegzeit ab deinem Standort");
  await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText(/^\d+ Min\.$/);
  await expect(page.locator(".meta .dist").filter({ hasText: "km" })).toHaveCount(0);
  // Der Beispielhof liegt um die Ecke: zu Fuß
  await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  await expect(page.getByRole("dialog").getByText("ca. 5 Min. zu Fuß ab deinem Standort")).toBeVisible();
  expect(requests, "kein Request nach der Standortabfrage").toEqual([]);
  expect(page.url()).not.toMatch(COORDINATE);
  // gespeichert nur der gerundete Punkt (ADR 0017), nie die Rohkoordinate
  expect(await storedValues(page)).toEqual([`${POINT_KEY}=${STORED_HERE}`]);
  await page.getByRole("dialog").getByRole("button", { name: "Zurück" }).click();

  // Neuladen: Der Startpunkt steht wieder, ohne neue Standortabfrage (nur auf Tipp, Plan 0004)
  await page.addInitScript(() => {
    const geo = navigator.geolocation;
    const original = geo.getCurrentPosition.bind(geo);
    Object.assign(window, { __geoWrapped: true, __geoCalls: 0 });
    Object.defineProperty(geo, "getCurrentPosition", {
      value: (...args: Parameters<Geolocation["getCurrentPosition"]>) => {
        Object.assign(window, { __geoCalls: Number(Reflect.get(window, "__geoCalls")) + 1 });
        original(...args);
      },
    });
  });
  await page.reload();
  await expect(page.getByRole("status")).toContainText(WEGZEIT_STANDORT);
  await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText(/^\d+ Min\.$/);
  expect(await page.evaluate(() => [Reflect.get(window, "__geoWrapped"), Reflect.get(window, "__geoCalls")])).toEqual([
    true,
    0,
  ]);
  expect(await storedValues(page)).toEqual([`${POINT_KEY}=${STORED_HERE}`]);
});

test.describe("Gespeicherter Standort (Plan 0016)", () => {
  test("genau ein Request beim Start auf wegzeit.json und linien.json, Kind-Sheet zeigt „Mein Standort“", async ({
    page,
  }) => {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: POINT_KEY,
      value: STORED_HERE,
    });
    const requests = tableRequests(page);
    const lines = tableRequests(page, isLines);
    await ready(page);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_STANDORT);
    await expect.poll(() => lines.length).toBe(1);
    const sheet = await openKidSheet(page);
    await expect(sheet.getByText("Startpunkt:")).toContainText("Mein Standort");
    await expect(sheet.getByText(/Wegzeit ab deinem Standort \(auf ca\. 100 m gerundet\)/)).toBeVisible();
    await expect(sheet.getByText(/Dein Startpunkt bleibt nur auf diesem Gerät/)).toBeVisible();
    await sheet.getByRole("button", { name: "Fertig" }).click();
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(1);
    expect(lines).toHaveLength(1);
  });

  test("Stadtteil-Wahl ersetzt den gespeicherten Standort", async ({ page }) => {
    await page.addInitScript(
      ({ key, value }) => {
        // nur beim ersten Laden setzen, sonst überschriebe das Neuladen die Wahl
        if (sessionStorage.getItem("gesetzt") === null) {
          sessionStorage.setItem("gesetzt", "1");
          localStorage.setItem(key, value);
        }
      },
      { key: POINT_KEY, value: STORED_HERE },
    );
    await ready(page);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_STANDORT);
    const sheet = await openKidSheet(page);
    await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
    await sheet.getByRole("button", { name: "Fertig" }).click();
    expect(await storedValues(page)).toEqual([`${KEY}=gostenhof`]);
    await page.reload();
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  });

  test("Startpunkt entfernen löscht den gespeicherten Standort; nach dem Neuladen kein Startpunkt, kein Laden", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, value }) => {
        if (sessionStorage.getItem("gesetzt") === null) {
          sessionStorage.setItem("gesetzt", "1");
          localStorage.setItem(key, value);
        }
      },
      { key: POINT_KEY, value: STORED_HERE },
    );
    await ready(page);
    const sheet = await openKidSheet(page);
    await sheet.getByRole("button", { name: "Startpunkt entfernen" }).click();
    await expect(sheet.getByText("Noch kein Startpunkt – dann zeigen wir keine Wegzeit.")).toBeVisible();
    await sheet.getByRole("button", { name: "Fertig" }).click();
    expect(await storedValues(page)).toEqual([]);

    const requests = tableRequests(page, (url) => isTable(url) || isLines(url));
    await ready(page);
    await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
  });
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
    await expect(page.getByRole("status")).toContainText("Luftlinie ab Gostenhof (Wegzeiten gerade nicht verfügbar)");
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
  await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
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
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
    await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("1,4 km");
    await expect(page.getByRole("button", { name: "Seite neu laden" })).toHaveCount(0);

    // Chunk weiter blockiert, Tabelle kommt: Das Netz steht, also gleich neu laden (in beiden Engines)
    const reloaded = page.waitForEvent("load");
    await page.getByRole("button", { name: "Nochmal laden" }).click();
    await reloaded;
    await expect(page).toHaveURL(/\?wegzeit=20$/);
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");

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
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
    await page.evaluate(() => Object.assign(window, { e2eSameDocument: true }));
    const retried = page.waitForResponse((r) => isTable(r.url()) && r.ok());
    const sheet = await openKidSheet(page);
    await retried;
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
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
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
    await page.route(TABLE, (route) => route.abort());
    // Markierung im Dokument: Ein Neuladen würde sie löschen
    await page.evaluate(() => Object.assign(window, { e2eSameDocument: true }));
    const retried = page.waitForRequest((r) => isTable(r.url()));
    await page.getByRole("button", { name: "Nochmal laden" }).click();
    await retried;
    await expect(page.getByRole("button", { name: "Nochmal laden" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
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
  await expect(page.getByRole("status")).toContainText("Luftlinie ab deinem Standort (außerhalb des Stadtgebiets)");
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
    await expect(page.locator(".status-reach")).toHaveCSS("visibility", "hidden");
    release();
    await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("15 Min.");
    await expect(page.locator(".status-reach")).toHaveCSS("visibility", "visible");
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

// Plan 0012, E1: zwei Linien im Detail. Musikschule ab Gostenhof: Zelle 9001 = 28 mit Umstiegs-Bit, „Tram 1 → Bus 2“
// (Tram 1 bis 9004:1, Umstieg zu 9004:2, Bus 2 bis 9007, 34 m zu Fuß); 1,58 + 28 = 29,6 → „ca. 30 Min.“.
test("Detail mit zwei Linien: sichtbar „→“, vorgelesen „, dann“, in einer Zeile", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await page
    .getByRole("heading", { level: 3, name: /^Musikgarten/ })
    .getByRole("button")
    .click();
  const reach = page.getByRole("dialog").locator(".reach-long");
  await expect(reach).toContainText(`Tram${NB}1`);
  await expectTwoLines(reach, "ca. 30 Min. mit Tram 1, dann Bus 2 ab Gostenhof");
});

// Plan 0019, E3: Der Link nach Google Maps trägt nur die Adresse, nie den Startpunkt – mit Stadtteil wie mit Punkt.
for (const [label, key, value] of [
  ["Stadtteil", KEY, "gostenhof"],
  ["gespeicherter Punkt", POINT_KEY, STORED_HERE],
] as const) {
  test(`Route in Google Maps mit Startpunkt (${label}): Wegzeit in der Kachel, Link ohne Startpunkt`, async ({
    page,
  }) => {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key, value });
    await ready(page);
    await expect(page.getByRole("status")).toContainText("mit Bus & Bahn");
    await page
      .getByRole("heading", { level: 3, name: /Kuckuck im Nest/ })
      .getByRole("button")
      .click();
    const link = page.getByRole("dialog").getByRole("link", { name: /Route in Google Maps/ });
    await expect(link.locator(".reach-long")).toContainText("Min.");
    const href = await link.getAttribute("href");
    expect(href).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=B%C3%BChnenplatz+2%2C+90429+N%C3%BCrnberg&travelmode=transit",
    );
    expect(href).not.toMatch(COORDINATE);
    expect(href).not.toMatch(/origin|gostenhof/i);
    // Theater: Hauptweg ohne Linien bzw. zu Fuß ohne Kandidaten mit Linien → keine Karte „Wege ab …“ (Review 2, H1)
    await expect(page.getByRole("dialog").locator(".ways")).toHaveCount(0);
  });
}

/** Sichtbarer Text ohne `.sr-only` („, dann“, „, “): so, wie die Karte „Wege ab …“ ihn zeigt */
async function shownRows(page: Page): Promise<string[]> {
  return page
    .getByRole("dialog")
    .locator(".ways li")
    .evaluateAll((items) =>
      items.map((li) => {
        const copy = li.cloneNode(true);
        if (!(copy instanceof HTMLElement)) return "";
        for (const hidden of copy.querySelectorAll(".sr-only")) hidden.remove();
        // nur Umbrüche und Leerzeichen zusammenfassen; U+00A0 der Liniennamen bleibt (`\s` träfe es mit)
        return (copy.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
      }),
    );
}

/** Jeder Maps-Link im Dialog: ohne Referrer, ohne Koordinate (Plan 0019, E3; Review 3, N5) */
async function expectPrivateMapsLinks(page: Page) {
  const links = page.getByRole("dialog").locator('a[href^="https://www.google.com/maps"]');
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(await link.getAttribute("href")).not.toMatch(COORDINATE);
  }
}

// Plan 0019, E4/E6: Karte „Wege ab …“, nachgerechnet mit dist-e2e/data (Review 3 unabhängig bestätigt).
// Ab STORED_HERE (49,452 / 11,077) liegen 9001 (1 358 m), 9002 (974 m), 9003, 9004 und 9005 im Umkreis von 1 500 m.
// „Eltern-Kind-Bewegungslandschaft…“ (Gemeinde, Kirchengemeindehausstraße):
// - Hauptweg 9004: 5,89 Min. zum Halt + 10 = 15,9, Bus 202E → „ca. 15 Min. · Bus 202E · 6 Min. zum Halt“
// - 9003: 1,31 + 16 mit Bit = 17,3, Tram 1 → Bus 202E (9001/9002 mit derselben Folge: 45,5 bzw. 36,9, zusammengefasst)
// - Bus 2 ab 9005: 7,5 + 18 = 25,5, vom Hauptweg dominiert; zu Fuß 44,9 > 15,9 + 15
test("Wege ab deinem Standort: Hauptweg und ein Weg mit Umstieg, dafür kürzerem Fußweg zum Halt", async ({ page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: POINT_KEY,
    value: STORED_HERE,
  });
  await ready(page);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_STANDORT);
  await page
    .getByRole("heading", { level: 3, name: /^Eltern-Kind-Bewegungslandschaft/ })
    .getByRole("button")
    .click();
  const ways = page.getByRole("dialog").locator(".ways");
  await expect(ways.locator(".cap")).toHaveText("Wege ab deinem Standort");
  await expect
    .poll(() => shownRows(page))
    .toEqual([
      `ca. 15 Min. · Bus${NB}202E · 6 Min. zum Halt Vorschlag`,
      `ca. 15 Min. · Tram${NB}1${NB}→ Bus${NB}202E · 1 Umstieg · 1 Min. zum Halt`,
    ]);
  // gleich schnell in der Anzeige: kein Grund
  await expect(ways.getByText(/^Vorschlag:/)).toHaveCount(0);
  await expect(ways.getByRole("link", { name: "Route in Google Maps", exact: true })).toBeVisible();
  await expectPrivateMapsLinks(page);
});

// Musikgarten ab Gostenhof: Hauptweg 9001, 1,58 + 28 mit Bit = 29,6 (Tram 1 → Bus 2); zu Fuß 40,9 ohne Umstieg, also
// nicht dominiert und in der Schwelle (+11,3) (Review 3, M1)
test("Wege ab Gostenhof: Hauptweg mit Umstieg, zu Fuß als anderer Weg", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
  await ready(page);
  await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
  await page
    .getByRole("heading", { level: 3, name: /^Musikgarten/ })
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog").locator(".ways .cap")).toHaveText("Wege ab Gostenhof");
  await expect
    .poll(() => shownRows(page))
    .toEqual([
      `ca. 30 Min. · Tram${NB}1${NB}→ Bus${NB}2 · 1 Umstieg · 2 Min. zum Halt Vorschlag`,
      "ca. 40 Min. · zu Fuß",
    ]);
  await expectPrivateMapsLinks(page);
});

test.describe("Linien fehlen oder kommen später (Plan 0012, E2/E6)", () => {
  test.describe("abgebrochen", () => {
    // Der abgebrochene Request meldet sich je nach Engine in der Konsole.
    test.use({ allowedConsoleErrors: [/\/data\/linien\.json\b/] });

    test("linien.json abgebrochen: „mit Bus & Bahn“, Minuten und Filter wirken", async ({ page }) => {
      await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
      await page.route(LINES, (route) => route.abort());
      await ready(page, "./?wegzeit=20");
      await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
      // bis 20 Min.: ohne Musikschule (29,6) und Gemeinde (23,6)
      await expect(offers(page)).toHaveCount(6);
      await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("15 Min.");
      await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
      await expect(page.getByRole("dialog").getByText("ca. 15 Min. mit Bus & Bahn ab Gostenhof")).toBeVisible();
    });

    // Gegentest zu „Wege ab Gostenhof“ (Plan 0019, Review 3, M1): Musikgarten hätte mit Linien eine Karte
    test("linien.json abgebrochen: keine Karte „Wege ab …“ beim Musikgarten", async ({ page }) => {
      await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
      await page.route(LINES, (route) => route.abort());
      await ready(page);
      await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
      await page
        .getByRole("heading", { level: 3, name: /^Musikgarten/ })
        .getByRole("button")
        .click();
      await expect(page.getByRole("dialog").getByText("ca. 30 Min. mit Bus & Bahn ab Gostenhof")).toBeVisible();
      await expect(page.getByRole("dialog").locator(".ways")).toHaveCount(0);
    });
  });

  test("linien.json passt nicht zur Tabelle (fremde Kennung): „mit Bus & Bahn“, Minuten unverändert, kein Neuladen (Arch-Review 0012, H9)", async ({
    page,
  }) => {
    await page.route(LINES, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), table: "deadbeef" } });
    });
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    const answered = page.waitForResponse((r) => isLines(r.url()));
    await ready(page);
    await expect(page.getByRole("status")).toContainText(WEGZEIT_GOSTENHOF);
    await answered;
    await page.evaluate(() => Object.assign(window, { zpOhneNeuladen: true }));
    await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("15 Min.");
    await expect(card(page, "Musikgarten").locator(".dist")).toHaveText("30 Min.");
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await expect(page.getByRole("dialog").getByText("ca. 15 Min. mit Bus & Bahn ab Gostenhof")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole("dialog").locator(".reach-long")).not.toContainText("Tram");
    expect(await page.evaluate(() => "zpOhneNeuladen" in window), "kein Neuladen").toBe(true);
  });

  test("linien.json kommt 1,5 s später: erst „mit Bus & Bahn“, dann die Linien ohne Interaktion (Review B1)", async ({
    page,
  }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(LINES, async (route) => {
      await held;
      await route.continue();
    });
    await page.addInitScript((key) => localStorage.setItem(key, "gostenhof"), KEY);
    await ready(page);
    await expect(card(page, "Offener Krabbeltreff").locator(".dist")).toHaveText("15 Min.");
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("ca. 15 Min. mit Bus & Bahn ab Gostenhof")).toBeVisible();
    await page.waitForTimeout(1500);
    release();
    await expect(dialog.getByText(`ca. 15 Min. mit Tram${NB}1 ab Gostenhof`)).toBeVisible();
  });
});
