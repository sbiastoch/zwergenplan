/** Merkliste (Plan 0003, E12, ADR 0007; Kopf, Umschalter und Karte nach Plan 0025, E3a/E4). Fixtures, Uhr Mo 5.10.2026 12:00. */
import { readFileSync } from "node:fs";
import type { Download, Page } from "@playwright/test";
import { expect, MAP_READY, startPreloads, test } from "./fixtures.ts";
import { setTextScale } from "./mobile-ux.ts";

const PEKIP = "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
});

test("Leerzustand führt zurück zum Entdecken", async ({ page }) => {
  await page.getByRole("button", { name: /^Merkliste/ }).click();
  await expect(page.getByText("Noch nichts gemerkt")).toBeVisible();
  await page.getByRole("button", { name: "Angebote entdecken" }).click();
  await expect(page.getByTestId("offer").first()).toBeVisible();
});

test("Herz merkt, Badge zählt, Merkliste überlebt das Neuladen und steht nicht in der URL", async ({ page }) => {
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await expect(page.getByRole("button", { name: "Offener Krabbeltreff merken" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Gemerkt – liegt jetzt auf deiner Merkliste")).toBeVisible();
  await page.getByRole("button", { name: `${PEKIP} merken` }).click();
  await expect(page.getByRole("button", { name: /^Merkliste/ })).toContainText("2");

  await page.reload();
  await page.getByRole("button", { name: /^Merkliste/ }).click();
  await expect(page).toHaveURL(/ansicht=merkliste$/);
  await expect(page.getByRole("heading", { level: 2, name: "Meine Merkliste" })).toBeVisible();
  await expect(page.getByTestId("offer")).toHaveCount(2);
  await expect(page.getByTestId("offer").first()).toContainText("Mi 7.10. · 10:00 Uhr");
  await expect(page.getByRole("status")).toHaveText("2 Angebote mit insgesamt 13 Terminen gemerkt");

  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await expect(page.getByText("Nicht mehr gemerkt")).toBeVisible();
  await expect(page.getByTestId("offer")).toHaveCount(1);
});

test("Fokus landet auf dem aktiven Tab, wenn die Kachel nach dem Ablösen im Detail fehlt (Plan 0008, E11)", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await page.getByRole("button", { name: `${PEKIP} merken` }).click();
  await page.getByRole("button", { name: /^Merkliste/ }).click();
  await expect(page.getByTestId("offer")).toHaveCount(2);

  await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
  await detail.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await expect(detail.getByRole("button", { name: "Offener Krabbeltreff merken" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await detail.getByRole("button", { name: "Zurück" }).click();
  await expect(detail).toBeHidden();

  // Die Kachel, die das Detail geöffnet hat, ist weg: ohne Rückweg fiele der Fokus auf <body>.
  await expect(page.getByTestId("offer")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Merkliste/ })).toBeFocused();
});

test("lädt alle gemerkten Termine als eine ICS-Datei", async ({ page }) => {
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await page.getByRole("button", { name: `${PEKIP} merken` }).click();
  await page.getByRole("button", { name: /^Merkliste/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Alle in den Kalender" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("zwergenplan-merkliste.ics");
  const ics = readFileSync((await download.path()) ?? "", "utf8");
  expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(13); // Kurs komplett (8) + Treff ab heute (5)
  expect(ics).toContain("X-WR-CALNAME:Zwergenplan – Merkliste");
  // gefaltete Zeilen (RFC 5545) vor dem Vergleich entfalten
  expect(ics.replaceAll("\r\n ", "")).toMatch(/UID:.+--20261013T0930@zwergenplan/);
});

// Plan 0010, E8 (Paket 0, A): Der ICS-Code ist ein Lazy-Chunk in assets/export/. Er lädt im Leerlauf nach dem ersten
// Rendern vor (ohne Service Worker wäre der Export offline sonst weg), nie als Teil des Starts.
test("Export-Code ist ein eigener Chunk und lädt im Leerlauf vor", async ({ page }) => {
  // Auf eine frische Seite: beforeEach hat schon geladen, dessen Vorladen könnte sonst die Antwort sein
  const preloaded = startPreloads(page);
  await page.reload();
  const [response] = await preloaded;
  expect(response.ok()).toBe(true);
  // Inhalt über einen eigenen Abruf: Den Body einer Antwort gibt der Browser nach einer Navigation nicht mehr her
  expect(await (await page.request.get(response.url())).text()).toContain("BEGIN:VCALENDAR");
  const start = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLScriptElement>("script[type=module][src]")].map((s) => s.src),
  );
  expect(start.length).toBeGreaterThan(0);
  for (const src of start) {
    expect(await (await page.request.get(src)).text(), src).not.toContain("BEGIN:VCALENDAR");
  }
});

test.describe("Export-Code nicht ladbar", () => {
  test.use({ allowedConsoleErrors: [/\/assets\/export\/\S+/] });

  test("meldet es im Toast; mit Netz und neu geladener Seite klappt der Export", async ({ page }) => {
    await page.route("**/assets/export/*.js", (route) => route.abort());
    await page.reload();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await page.getByRole("button", { name: "Alle in den Kalender" }).click();
    await expect(
      page.getByText("Export gerade nicht möglich – mit Netz die Seite neu laden und nochmal tippen."),
    ).toBeVisible();
    expect(downloaded).toBe(false);

    // Netz wieder da: Chromium behielte den gescheiterten Import, deshalb rät der Toast zum Neuladen (Arch-Review
    // Paket 0, Befund 1). Die Merkliste übersteht es.
    await page.unroute("**/assets/export/*.js");
    await page.reload();
    await expect(page.getByTestId("offer")).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Alle in den Kalender" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("zwergenplan-merkliste.ics");
  });
});

// Plan 0018, E3/E4: Mit Geburtsdatum kommen regelmäßige Angebote nur passend zum Alter in die Datei, Kurse komplett.
// Merkliste und Geburtsdatum stehen vor dem Laden im localStorage: Der Altersfilter blendet in „Entdecken“ aus.
test.describe("Merkliste passend zum Alter (Plan 0018)", () => {
  const IDS = {
    pekip:
      "familientreff-beispiel--pekip-gruppe-herbst-babys-geb-juni-aug-2026-20261013t0930--familientreff-beispiel-haus",
    treff: "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus",
    reime: "stadtbibliothek-beispiel--krabbelreime-fingerspiele--stadtbibliothek-beispiel-zentrum",
  };

  async function openSaved(page: Page, ids: string[], birthDate: string) {
    await page.addInitScript(
      ([saved, born]) => {
        localStorage.setItem("zwergenplan.merkliste", saved);
        localStorage.setItem("zwergenplan.geburtsdatum", born);
      },
      [JSON.stringify(ids), birthDate] as const,
    );
    await page.goto("./?ansicht=merkliste");
    await expect(page.getByTestId("offer")).toHaveCount(ids.length);
    return page.getByRole("button", { name: "Alle in den Kalender" });
  }

  async function vevents(download: Download) {
    return readFileSync((await download.path()) ?? "", "utf8").match(/BEGIN:VEVENT/g)?.length ?? 0;
  }

  test("Kurs komplett, Treff nur bis 14.10.: 8 + 2 Termine", async ({ page }) => {
    const button = await openSaved(page, [IDS.pekip, IDS.treff], "2024-09-18");
    // Die Statuszeile zählt alle kommenden Termine; was zum Alter passt, sagt der Toast (Plan 0025, E3a)
    await expect(page.getByRole("status")).toHaveText("2 Angebote mit insgesamt 13 Terminen gemerkt");
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toBe("zwergenplan-merkliste.ics");
    expect(await vevents(download)).toBe(10);
    await expect(page.locator(".toast")).toHaveText("Kalenderdatei mit 10 Terminen geladen");
  });

  test("nichts passt: kein Download, Toast", async ({ page }) => {
    const button = await openSaved(page, [IDS.treff], "2026-08-01");
    await expect(page.getByRole("status")).toHaveText("1 Angebot mit insgesamt 5 Terminen gemerkt");
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await button.click();
    await expect(page.locator(".toast")).toHaveText("Keins der gemerkten Angebote passt zum Alter.");
    expect(downloaded).toBe(false);
  });

  test("ein Angebot passt nicht: nur die anderen in der Datei, Toast nennt es 6 s lang", async ({ page }) => {
    const button = await openSaved(page, [IDS.treff, IDS.reime], "2026-08-01");
    await expect(page.getByRole("status")).toHaveText("2 Angebote mit insgesamt 9 Terminen gemerkt");
    // Hält die Timer an: Die Anzeigedauer des Toasts wird gezielt vorgespult.
    await page.clock.pauseAt(new Date("2026-10-05T12:00:00+02:00"));
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    const ics = readFileSync((await download.path()) ?? "", "utf8").replaceAll("\r\n ", "");
    const uids = ics.match(/^UID:.+$/gm) ?? [];
    expect(uids).toHaveLength(4);
    for (const uid of uids) expect(uid).toContain(IDS.reime);
    const toast = page.locator(".toast");
    await expect(toast).toHaveText("Kalenderdatei mit 4 Terminen geladen – 1 Angebot passt nicht zum Alter");
    await page.clock.runFor(5_500);
    await expect(toast, "nach 5,5 s noch sichtbar").toBeVisible();
    await page.clock.runFor(1_000);
    await expect(toast).toHaveCount(0);
  });
});

/** Fünf gemerkte Fixture-Angebote an vier Orten (Plan 0025, Test 9): 8 + 5 + 6 + 4 + 1 = 24 kommende Termine. */
const FIVE = [
  "familientreff-beispiel--pekip-gruppe-herbst-babys-geb-juni-aug-2026-20261013t0930--familientreff-beispiel-haus",
  "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus",
  "musikschule-beispiel--musikgarten-1-1-2-jahre-20261105t1600--musikschule-beispiel-sued",
  "stadtbibliothek-beispiel--krabbelreime-fingerspiele--stadtbibliothek-beispiel-zentrum",
  "theater-beispiel--kuckuck-im-nest-theater-ab-18-monaten-20261115t1100--theater-beispiel-buehne",
];

/** Merkliste vor dem Laden im localStorage (Plan 0025, Tests): nicht per Herz-Tipp */
async function preset(page: Page, ids: readonly string[], providers: readonly string[] = []) {
  await page.addInitScript(
    ([saved, savedProviders]) => {
      localStorage.setItem("zwergenplan.merkliste", saved);
      if (savedProviders !== "[]") localStorage.setItem("zwergenplan.anbieter-merkliste", savedProviders);
    },
    [JSON.stringify(ids), JSON.stringify(providers)] as const,
  );
}

/**
 * Wartet, bis die Karte bereit ist und nichts mehr lädt (wie `openMap` in karte.spec.ts). Erst dann zurück zur Liste:
 * Sonst prüft der Kachel-Wächter (fixtures.ts) einen noch laufenden Request, wenn die Karte schon aus dem DOM ist.
 */
async function mapSettled(page: Page) {
  await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", MAP_READY);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.__zpMap;
        if (!map || map.loaded()) resolve();
        else map.once("idle", () => resolve());
      }),
  );
}

/** Zählt die Requests auf die Wegzeit-Tabelle ab jetzt (wie in startpunkt.spec.ts). */
function tableRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.endsWith("/data/wegzeit.json")) requests.push(req.url());
  });
  return requests;
}

const tabButton = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: new RegExp(`^${name}`) });
const segment = (page: Page, name: "Liste" | "Karte") =>
  page.getByRole("group", { name: "Darstellung der Merkliste" }).getByRole("button", { name, exact: true });

test.describe("Kopf der Merkliste (Plan 0025, E3a, E9)", () => {
  test("Statuszeile zählt Angebote und kommende Termine, der runde Export-Knopf nimmt alle", async ({ page }) => {
    await preset(page, FIVE);
    await page.goto("./?ansicht=merkliste");
    await expect(page.getByTestId("offer")).toHaveCount(5);
    await expect(page.getByRole("status")).toHaveText("5 Angebote mit insgesamt 24 Terminen gemerkt");
    // der breite Knopf und die Zeile „… · Kurse immer komplett“ sind weg
    await expect(page.getByText(/Kurse immer komplett|in einer \.ics-Datei/)).toHaveCount(0);
    const button = page.getByRole("button", { name: "Alle in den Kalender" });
    await expect(button).toHaveAttribute("title", "Alle in den Kalender");
    await expect(button).toHaveText("");
    const box = await button.boundingBox();
    expect(box && [Math.round(box.width), Math.round(box.height)]).toEqual([48, 48]);
    // rechts neben der Statuszeile, auf ihrer Höhe
    const status = await page.getByRole("status").boundingBox();
    expect(box && status && box.x).toBeGreaterThan((status?.x ?? 0) + 100);
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    const ics = readFileSync((await download.path()) ?? "", "utf8");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(24);
  });

  for (const width of [320, 412]) {
    test(`Umschalter über die ganze Breite des Inhalts bei ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await preset(page, FIVE.slice(0, 2));
      await page.goto("./?ansicht=merkliste");
      await expect(segment(page, "Liste")).toHaveAttribute("aria-pressed", "true");
      const widths = await page.evaluate(() => {
        const body = document.querySelector("main.body");
        const toggle = document.querySelector("fieldset.view-toggle.full");
        if (!body || !toggle) throw new Error("kein Inhalt oder kein Umschalter");
        const style = getComputedStyle(body);
        return {
          content: body.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
          toggle: toggle.getBoundingClientRect().width,
        };
      });
      expect(Math.abs(widths.toggle - widths.content), JSON.stringify(widths)).toBeLessThanOrEqual(1);
    });
  }

  for (const scale of [1, 2]) {
    test(`Umschalter bei 320 px und ${scale * 100} % Text: ${scale === 2 ? "einspaltig ohne Daumen" : "zweispaltig mit Daumen"}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await preset(page, FIVE.slice(0, 2));
      await page.goto("./?ansicht=merkliste");
      await expect(segment(page, "Liste")).toHaveAttribute("aria-pressed", "true");
      await setTextScale(page, scale);
      // Chromium wertet die Container-Query (17rem) nicht neu aus, wenn sich nur die Schriftgröße ändert und die Breite
      // des Containers gleich bleibt. Eine echte Schrift-Einstellung gilt ab dem Laden; kurz die Breite ändern holt das
      // nach. Ohne diesen Schritt stünde bei 200 % noch das Layout von 100 % (Arch-Review Plan 0025, Etappe 2).
      await page.setViewportSize({ width: 330, height: 800 });
      await page.setViewportSize({ width: 320, height: 800 });
      await setTextScale(page, scale);
      const layout = await page.evaluate(() => {
        const seg = document.querySelector(".view-toggle.full .seg");
        const thumb = document.querySelector(".view-toggle.full .seg-thumb");
        if (!seg || !thumb) throw new Error("kein Umschalter oder kein Daumen");
        return {
          columns: getComputedStyle(seg).gridTemplateColumns.trim().split(/\s+/).length,
          thumb: getComputedStyle(thumb).display,
        };
      });
      if (scale === 2) expect(layout).toEqual({ columns: 1, thumb: "none" });
      else {
        expect(layout.columns).toBe(2);
        expect(layout.thumb).not.toBe("none");
      }
    });
  }

  test("ohne gemerktes Angebot: Leerzustand auch auf der Karte, kein Umschalter, keine Kacheln", async ({ page }) => {
    // nur ein Anbieter gemerkt: Der zählt auf der Merkliste nicht (E5a); Kacheln sind ohne Mock verboten (fixtures.ts)
    await preset(page, [], ["theater-beispiel"]);
    const requests = tableRequests(page);
    await page.goto("./?ansicht=merkliste-karte");
    await expect(page.getByText("Noch nichts gemerkt")).toBeVisible();
    // Anlass auch ohne Gemerktes (App.tsx): Sonst verriete der Request, ob etwas gemerkt ist
    await expect.poll(() => requests.length).toBe(1);
    await expect(page).toHaveURL(/ansicht=merkliste-karte$/);
    await expect(tabButton(page, "Merkliste")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".map-box")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Darstellung der Merkliste" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Alle in den Kalender" })).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(1);
  });
});

test.describe("Umschalter und Route der Merkliste (Plan 0025, E4, Test 11)", () => {
  test.use({ tiles: "mock" });

  test("Liste | Karte setzt die Ansicht, der Fokus bleibt auf dem Segment, Export nur in der Liste", async ({
    page,
  }) => {
    await preset(page, FIVE);
    await page.goto("./?ansicht=merkliste");
    await expect(page.getByTestId("offer")).toHaveCount(5);
    const karte = segment(page, "Karte");
    await karte.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?ansicht=merkliste-karte$/);
    await expect(karte).toHaveAttribute("aria-pressed", "true");
    await expect(karte).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("5 Angebote an 4 Orten gemerkt");
    await expect(page.getByRole("button", { name: "Alle in den Kalender" })).toHaveCount(0);
    await expect(tabButton(page, "Merkliste")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".map-box")).toBeVisible();
    await mapSettled(page);

    const liste = segment(page, "Liste");
    await liste.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?ansicht=merkliste$/);
    await expect(liste).toBeFocused();
    await expect(page.getByTestId("offer")).toHaveCount(5);
    await expect(page.locator(".map-box")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Alle in den Kalender" })).toBeVisible();
  });

  for (const [path, pressed] of [
    ["./?ansicht=merkliste", "Liste"],
    ["./?ansicht=merkliste-karte", "Karte"],
  ] as const) {
    test(`Deep-Link ${path}: Tab „Merkliste“ aktiv, keine Sticker und Schnellfilter der Startseite (M1)`, async ({
      page,
    }) => {
      await preset(page, FIVE.slice(0, 2));
      // Gegenprobe: Auf der Startseite stehen beide
      await expect(page.getByRole("group", { name: "Kategorien" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Schnellfilter" })).toBeVisible();
      await page.goto(path);
      await expect(segment(page, pressed)).toHaveAttribute("aria-pressed", "true");
      await expect(tabButton(page, "Merkliste")).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("group", { name: "Kategorien" })).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Schnellfilter" })).toHaveCount(0);
      // Startseiten-Filter in der URL wirken nicht
      await page.goto(`${path}&format=einmalig`);
      await expect(page.getByRole("status")).toContainText("2 Angebote");
    });
  }
});
