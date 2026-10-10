/**
 * Merkliste (Plan 0003, E12, ADR 0007; Kopf, Umschalter, Karte und Kalender nach Plan 0025, E3a/E4/E5). Fixtures, Uhr
 * Mo 5.10.2026 12:00. Den Kalender selbst prüft e2e/merkliste-kalender.spec.ts.
 */
import { readFileSync } from "node:fs";
import type { Download, Page } from "@playwright/test";
import { expect, MAP_READY, startPreloads, test } from "./fixtures.ts";
import { expectMobileUx, setTextScale } from "./mobile-ux.ts";

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
    pekip: "nle21y1x",
    treff: "lxizt974",
    reime: "rzzqsvxq",
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
    // Die Statuszeile zählt die kommenden Termine, regelmäßige nur passend zum Alter wie die Datei (Plan 0028)
    await expect(page.getByRole("status")).toHaveText("2 Angebote mit insgesamt 10 Terminen gemerkt");
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toBe("zwergenplan-merkliste.ics");
    expect(await vevents(download)).toBe(10);
    await expect(page.locator(".toast")).toHaveText("Kalenderdatei mit 10 Terminen geladen");
  });

  test("zu jung bis 20.10.: Treff steht am 21.10. hinter PEKiP, Statuszeile und Datei 8 + 3 (Plan 0028)", async ({
    page,
  }) => {
    const button = await openSaved(page, [IDS.treff, IDS.pekip], "2026-04-20");
    const cards = page.getByTestId("offer");
    await expect(cards.nth(0)).toContainText("PEKiP");
    await expect(cards.nth(1)).toContainText("Offener Krabbeltreff");
    await expect(cards.nth(1)).toContainText("Mi 21.10. · 10:00 Uhr");
    await expect(page.getByRole("status")).toHaveText("2 Angebote mit insgesamt 11 Terminen gemerkt");
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(await vevents(download)).toBe(11);
  });

  test("nichts passt: kein Download, Toast", async ({ page }) => {
    const button = await openSaved(page, [IDS.treff], "2026-08-01");
    // Die Statuszeile nennt das unpassende Angebot wie der Export-Toast (Browser-Review Plan 0028)
    await expect(page.getByRole("status")).toHaveText(
      "1 Angebot mit insgesamt 0 Terminen gemerkt – 1 Angebot passt nicht zum Alter",
    );
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await button.click();
    const toast = page.locator(".toast");
    await expect(toast).toHaveText("Keins der gemerkten Angebote passt zum Alter.");
    // Hinweis, kein Erfolg: Es wurde nichts geladen (Browser-Review Plan 0028)
    await expect(toast).toHaveClass(/\bhint\b/);
    expect(downloaded).toBe(false);
  });

  test("ein Angebot passt nicht: nur die anderen in der Datei, Toast nennt es 6 s lang", async ({ page }) => {
    const button = await openSaved(page, [IDS.treff, IDS.reime], "2026-08-01");
    await expect(page.getByRole("status")).toHaveText(
      "2 Angebote mit insgesamt 4 Terminen gemerkt – 1 Angebot passt nicht zum Alter",
    );
    // Hält die Timer an: Die Anzeigedauer des Toasts wird gezielt vorgespult.
    await page.clock.pauseAt(new Date("2026-10-05T12:00:00+02:00"));
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    const ics = readFileSync((await download.path()) ?? "", "utf8").replaceAll("\r\n ", "");
    const uids = ics.match(/^UID:.+$/gm) ?? [];
    expect(uids).toHaveLength(4);
    for (const uid of uids) expect(uid).toContain(IDS.reime);
    const toast = page.locator(".toast");
    await expect(toast).toHaveText("Kalenderdatei mit 4 Terminen geladen – 1 Angebot passt nicht zum Alter");
    await expect(toast).not.toHaveClass(/\bhint\b/);
    await page.clock.runFor(5_500);
    await expect(toast, "nach 5,5 s noch sichtbar").toBeVisible();
    await page.clock.runFor(1_000);
    await expect(toast).toHaveCount(0);
  });
});

/** Fünf gemerkte Fixture-Angebote an vier Orten (Plan 0025, Test 9): 8 + 5 + 6 + 4 + 1 = 24 kommende Termine. */
const FIVE = ["nle21y1x", "lxizt974", "qxdibmkc", "rzzqsvxq", "3zemfuzk"];

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
const segment = (page: Page, name: "Liste" | "Karte" | "Kalender") =>
  page.getByRole("group", { name: "Darstellung der Merkliste" }).getByRole("button", { name, exact: true });

test("Merkliste mit langen IDs (vor ADR 0022): zeigt die Angebote und ist danach auf Kurz-IDs umgeschrieben", async ({
  page,
}) => {
  await preset(page, ["familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus", "nle21y1x"]);
  await page.goto("./?ansicht=merkliste");
  await expect(page.getByTestId("offer")).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("zwergenplan.merkliste"))).toBe(
    JSON.stringify(["lxizt974", "nle21y1x"]),
  );
});

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
    test(`Umschalter bei 320 px und ${scale * 100} % Text: ${scale === 2 ? "einspaltig ohne Daumen" : "dreispaltig mit Daumen"}`, async ({
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
          // „Kalender“ ist das längste Segment: einzeilig (nowrap) und nicht abgeschnitten (Plan 0025, E4, Test 15)
          clipped: [...seg.querySelectorAll<HTMLElement>(".seg-btn")]
            .filter((b) => b.scrollWidth > b.clientWidth + 0.5 || b.getBoundingClientRect().height > 48)
            .map((b) => b.textContent),
        };
      });
      if (scale === 2) expect(layout).toEqual({ columns: 1, thumb: "none", clipped: [] });
      else {
        expect(layout.columns).toBe(3);
        expect(layout.thumb).not.toBe("none");
        expect(layout.clipped).toEqual([]);
      }
    });
  }

  test("ohne gemerktes Angebot: Leerzustand auch auf der Karte, kein Umschalter, keine Kacheln", async ({ page }) => {
    // nur ein Anbieter gemerkt: Der zählt auf der Merkliste nicht (E5a); Kacheln sind ohne Mock verboten (fixtures.ts)
    await preset(page, [], ["fv3fpfp2"]);
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

  test("ohne gemerktes Angebot: Leerzustand auch im Kalender, kein Kalender, kein Anlass (Plan 0025, E5a)", async ({
    page,
  }) => {
    await preset(page, [], ["fv3fpfp2"]);
    const requests = tableRequests(page);
    await page.goto("./?ansicht=merkliste-kalender");
    await expect(page.getByText("Noch nichts gemerkt")).toBeVisible();
    await expect(page).toHaveURL(/ansicht=merkliste-kalender$/);
    await expect(tabButton(page, "Merkliste")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Darstellung der Merkliste" })).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(0);
  });
});

test.describe("Umschalter und Route der Merkliste (Plan 0025, E4, Test 11)", () => {
  test.use({ tiles: "mock" });

  test("Liste | Karte | Kalender setzt die Ansicht, der Fokus bleibt auf dem Segment, Export nur in der Liste", async ({
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

    // dritte Darstellung (Etappe 3): Kalender, Statuszeile wie in der Liste, kein Export-Knopf
    const kalender = segment(page, "Kalender");
    await kalender.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?ansicht=merkliste-kalender$/);
    await expect(kalender).toHaveAttribute("aria-pressed", "true");
    await expect(kalender).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("5 Angebote mit insgesamt 24 Terminen gemerkt");
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Alle in den Kalender" })).toHaveCount(0);
    await expect(tabButton(page, "Merkliste")).toHaveAttribute("aria-current", "page");
  });

  for (const [path, pressed] of [
    ["./?ansicht=merkliste", "Liste"],
    ["./?ansicht=merkliste-karte", "Karte"],
    ["./?ansicht=merkliste-kalender", "Kalender"],
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

/**
 * Filter der Merkliste (Plan 0025, E6, E7, Test 9): PEKiP (Kurs, mit Anmeldung, ab 13.10.), Krabbeltreff (regelmäßig,
 * ohne Anmeldung, bis 4.11.) und Musikgarten (Kurs, mit Anmeldung, ab 5.11.). 8 + 5 + 6 = 19 kommende Termine.
 */
test.describe("Filter der Merkliste (Plan 0025, E6, E7)", () => {
  const THREE = FIVE.slice(0, 3);
  const filters = (page: Page) => page.getByRole("group", { name: "Merkliste filtern" });
  const chip = (page: Page, name: string) => filters(page).getByRole("button", { name, exact: true });

  test.beforeEach(async ({ page }) => {
    await preset(page, THREE);
    await page.goto("./?ansicht=merkliste");
    await expect(page.getByTestId("offer")).toHaveCount(3);
  });

  test("Format und Anmeldung, Leerzustand mit „Filter zurücksetzen“", async ({ page }) => {
    await chip(page, "Kurse").click();
    await expect(chip(page, "Kurse")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("offer")).toHaveCount(2);
    await expect(page.getByRole("status")).toHaveText("2 von 3 gemerkten Angeboten passen");

    // Anmeldung ist eine Einfachwahl: „Ohne“ schaltet „Mit“ ab
    await chip(page, "Mit Anmeldung").click();
    await expect(page.getByTestId("offer")).toHaveCount(2);
    await chip(page, "Ohne Anmeldung").click();
    await expect(chip(page, "Mit Anmeldung")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("offer")).toHaveCount(0);
    await expect(page.getByText("Nichts, was zu deinem Filter passt")).toBeVisible();
    await expect(page.getByText("Von deinen 3 gemerkten Angeboten passt keins.")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("0 von 3 gemerkten Angeboten passen");

    await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await expect(page.getByRole("status")).toBeFocused();
    await expect(page.getByTestId("offer")).toHaveCount(3);
    await expect(page.getByRole("status")).toHaveText("3 Angebote mit insgesamt 19 Terminen gemerkt");
    await expect(chip(page, "Zurücksetzen")).toHaveCount(0);
  });

  test("„ab Nov.“: Kurse mit Beginn ab dann, Regelmäßiges mit Terminen dann; nur Monate mit Daten", async ({
    page,
  }) => {
    // Der letzte Termin im Datenstand ist am 10.12. (Musikgarten): kein „ab Jan.“
    await expect(filters(page).getByRole("button", { name: /^ab / })).toHaveText(["ab Nov.", "ab Dez."]);
    await chip(page, "ab Nov.").click();
    const cards = page.getByTestId("offer");
    await expect(cards).toHaveCount(2);
    await expect(page.getByRole("status")).toHaveText("2 von 3 gemerkten Angeboten passen");
    // Der Treff steht am Termin im Zeitraum, nicht am nächsten (Mi 7.10.)
    await expect(cards.nth(0)).toContainText("Offener Krabbeltreff");
    await expect(cards.nth(0)).toContainText("Mi 4.11.");
    await expect(cards.nth(1)).toContainText("Musikgarten");
    await expect(cards.filter({ hasText: "PEKiP" })).toHaveCount(0);

    // Einfachwahl; ein zweiter Tipp hebt die Schnellwahl auf
    await chip(page, "ab Dez.").click();
    await expect(chip(page, "ab Nov.")).toHaveAttribute("aria-pressed", "false");
    await expect(cards).toHaveCount(0);
    await chip(page, "ab Dez.").click();
    await expect(cards).toHaveCount(3);
  });

  test("Filter übersteht den Tab-Wechsel, nicht das Neuladen; nie in der URL, „Angebote“ bleibt unberührt", async ({
    page,
  }) => {
    await chip(page, "Kurse").click();
    await chip(page, "Mit Anmeldung").click();
    await chip(page, "ab Nov.").click();
    await expect(page.getByTestId("offer")).toHaveCount(1);
    await expect(page).toHaveURL(/\?ansicht=merkliste$/);

    await tabButton(page, "Angebote").click();
    await expect(page).not.toHaveURL(/format=|anmeldung=|von=|bis=/);
    const quick = page.getByRole("group", { name: "Schnellfilter" });
    await expect(quick.getByRole("button", { name: "Kurse", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(quick.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();

    await tabButton(page, "Merkliste").click();
    await expect(chip(page, "Kurse")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("offer")).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId("offer")).toHaveCount(3);
    await expect(chip(page, "Kurse")).toHaveAttribute("aria-pressed", "false");
  });

  test("Export mit Filter: Name sagt es, die Datei enthält weiter alle Termine (E9)", async ({ page }) => {
    await chip(page, "Kurse").click();
    await expect(page.getByTestId("offer")).toHaveCount(2);
    const button = page.getByRole("button", { name: "Alle 3 gemerkten in den Kalender, auch ausgeblendete" });
    await expect(button).toHaveAttribute("title", "Alle 3 gemerkten in den Kalender, auch ausgeblendete");
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    const ics = readFileSync((await download.path()) ?? "", "utf8");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(19);
  });

  test("Karte ohne passendes Angebot: derselbe Leerzustand, keine Karte (E5a)", async ({ page }) => {
    await chip(page, "Kurse").click();
    await chip(page, "Ohne Anmeldung").click();
    await segment(page, "Karte").click();
    await expect(page).toHaveURL(/\?ansicht=merkliste-karte$/);
    await expect(page.getByText("Von deinen 3 gemerkten Angeboten passt keins.")).toBeVisible();
    await expect(page.locator(".map-box")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("0 von 3 gemerkten Angeboten an 0 Orten");
    await expectMobileUx(page);
  });
});

test.describe("Karte der Merkliste mit Filter (Plan 0025, E3a)", () => {
  test.use({ tiles: "mock" });

  test("Statuszeile zählt passende Angebote und ihre Orte", async ({ page }) => {
    await preset(page, FIVE.slice(0, 3));
    await page.goto("./?ansicht=merkliste-karte");
    await expect(page.getByRole("status")).toHaveText("3 Angebote an 2 Orten gemerkt");
    await page.getByRole("group", { name: "Merkliste filtern" }).getByRole("button", { name: "Kurse" }).click();
    await expect(page.getByRole("status")).toHaveText("2 von 3 gemerkten Angeboten an 2 Orten");
    await mapSettled(page);
  });
});
