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

/** Tab „Merkliste“ öffnet den Kalender (Plan 0057, E9); danach auf die Liste umschalten */
async function tabToList(page: Page) {
  await page.getByRole("button", { name: /^Merkliste/ }).click();
  await expect(page).toHaveURL(/ansicht=merkliste-kalender$/);
  await page
    .getByRole("group", { name: "Darstellung der Merkliste" })
    .getByRole("button", { name: "Liste", exact: true })
    .click();
  await expect(page).toHaveURL(/ansicht=merkliste$/);
}

/** Herz ein- oder zweimal tippen: vorgemerkt bzw. fest eingeplant (Plan 0057, E2) */
async function tapHeart(page: Page, title: string, times = 2) {
  const heart = page.getByRole("button", { name: `${title} merken` });
  for (let i = 0; i < times; i++) await heart.click();
  return heart;
}

const toastText = (page: Page) => page.locator(".toast .toast-text");

test("Herz: Tipp merkt vor, zweiter plant fest ein, dritter entfernt; Badge zählt, Stufen überleben das Neuladen, nichts in der URL (Plan 0057, E1–E3)", async ({
  page,
}) => {
  const heart = page.getByRole("button", { name: "Offener Krabbeltreff merken" });
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "mixed");
  await expect(toastText(page)).toHaveText("Vorgemerkt. Nochmal tippen oder halten: fest einplanen.");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(toastText(page)).toHaveText("Fest eingeplant – steht im Kalender.");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await expect(toastText(page)).toHaveText("Nicht mehr gemerkt.");
  await expect(page.getByRole("button", { name: /^Merkliste/ })).not.toContainText("1");

  // Krabbeltreff vorgemerkt, PEKiP fest eingeplant
  await heart.click();
  await tapHeart(page, PEKIP);
  await expect(page.getByRole("button", { name: /^Merkliste/ })).toContainText("2");

  await page.reload();
  await expect(page.getByRole("button", { name: "Offener Krabbeltreff merken" })).toHaveAttribute(
    "aria-pressed",
    "mixed",
  );
  await expect(page.getByRole("button", { name: `${PEKIP} merken` })).toHaveAttribute("aria-pressed", "true");
  await tabToList(page);
  await expect(page.getByRole("heading", { level: 2, name: "Meine Merkliste" })).toBeVisible();
  await expect(page.getByTestId("offer")).toHaveCount(2);
  // „Was ist zu tun“ (Plan 0057, E8): PEKiP beginnt in 8 Tagen, der Treff geht spontan; Kacheln mit Datum
  await expect(page.getByRole("region", { name: /^Demnächst/ }).getByTestId("offer")).toContainText("PEKiP");
  const treff = page.getByRole("region", { name: /^Spontan möglich/ }).getByTestId("offer");
  await expect(treff).toContainText("Offener Krabbeltreff");
  await expect(treff.locator(".when")).toHaveText(/^Mi 7\.10\. · 10/);
  await expect(page.getByRole("status")).toHaveText("2 Angebote gemerkt");
  expect(
    await page.evaluate(() => [
      localStorage.getItem("zwergenplan.merkliste"),
      localStorage.getItem("zwergenplan.merkliste-vorgemerkt"),
    ]),
  ).toEqual(['["lxizt974","nle21y1x"]', '["lxizt974"]']);
  expect(page.url()).not.toMatch(/lxizt974|nle21y1x|vorgemerkt/);

  // vorgemerkt → fest → aus: Die Kachel verschwindet von der Merkliste
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await expect(toastText(page)).toHaveText("Nicht mehr gemerkt.");
  await expect(page.getByTestId("offer")).toHaveCount(1);
});

test("„Rückgängig“ im Toast stellt die vorige Stufe ohne Animation her, der Fokus geht aufs Herz (Plan 0057, E3)", async ({
  page,
}) => {
  const heart = page.getByRole("button", { name: "Offener Krabbeltreff merken" });
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "mixed");
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await expect(toastText(page)).toHaveText("Rückgängig gemacht.");
  await expect(page.getByRole("button", { name: "Rückgängig" })).toHaveCount(0);
  await expect(heart).toBeFocused();
  await expect(heart).not.toHaveClass(/pop-|deflate/);

  // Entfernen auf der Merkliste: Die Kachel verschwindet, „Rückgängig“ holt sie zurück, der Fokus aufs neue Herz
  await tapHeart(page, PEKIP);
  await tabToList(page);
  await expect(page.getByTestId("offer")).toHaveCount(1);
  await page.getByRole("button", { name: `${PEKIP} merken` }).click();
  await expect(page.getByTestId("offer")).toHaveCount(0);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  const back = page.getByRole("button", { name: `${PEKIP} merken` });
  await expect(back).toHaveAttribute("aria-pressed", "true");
  await expect(back).toBeFocused();
});

test("Tastatur: Enter am Herz schaltet weiter, der Fokus bleibt am Herz (Plan 0057, E3)", async ({ page }) => {
  const heart = page.getByRole("button", { name: "Offener Krabbeltreff merken" });
  await heart.focus();
  for (const pressed of ["mixed", "true", "false"]) {
    await page.keyboard.press("Enter");
    await expect(heart).toHaveAttribute("aria-pressed", pressed);
    await expect(heart).toBeFocused();
  }
});

test("Halten mit der Maus plant fest ein, auch 2 s lang; der Klick danach entfernt nicht (Plan 0057, E2)", async ({
  page,
}) => {
  for (const [title, ms] of [
    ["Offener Krabbeltreff", 700],
    [PEKIP, 2000],
  ] as const) {
    const heart = page.getByRole("button", { name: `${title} merken` });
    await heart.hover();
    await page.mouse.down();
    await expect(heart).toHaveClass(/\bholding\b/);
    await page.waitForTimeout(ms);
    await page.mouse.up();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(toastText(page)).toHaveText("Fest eingeplant – steht im Kalender.");
    await page.waitForTimeout(700);
    await expect(heart, "der Klick nach dem Halten ist geschluckt").toHaveAttribute("aria-pressed", "true");
  }
  // der nächste Tipp wirkt
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await expect(page.getByRole("button", { name: "Offener Krabbeltreff merken" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("Halten mit dem Finger (Touch über CDP): fest, der nächste kurze Tipp entfernt (Plan 0057, E2)", async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== "chromium" || !isMobile, "Touch über CDP nur in Chromium mit Touch-Emulation (pixel-7)");
  const heart = page.getByRole("button", { name: "Offener Krabbeltreff merken" });
  await heart.scrollIntoViewIfNeeded();
  const box = await heart.boundingBox();
  if (!box) throw new Error("Herz ohne Box");
  const cdp = await page.context().newCDPSession(page);
  const at = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(300);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
});

test("Fokus landet auf dem aktiven Tab, wenn die Kachel nach dem Ablösen im Detail fehlt (Plan 0008, E11)", async ({
  page,
}) => {
  await tapHeart(page, "Offener Krabbeltreff");
  await tapHeart(page, PEKIP);
  await tabToList(page);
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

test("lädt alle fest eingeplanten Termine als eine ICS-Datei, auch aus dem Kalender (Plan 0057, E9)", async ({
  page,
}) => {
  await tapHeart(page, "Offener Krabbeltreff");
  await tapHeart(page, PEKIP);
  // Der Tab öffnet den Kalender: derselbe Knopf, derselbe Export
  await page.getByRole("button", { name: /^Merkliste/ }).click();
  await expect(page).toHaveURL(/ansicht=merkliste-kalender$/);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" }).click(),
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
    await tapHeart(page, "Offener Krabbeltreff");
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" }).click();
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
      page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" }).click(),
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
    return page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" });
  }

  async function vevents(download: Download) {
    return readFileSync((await download.path()) ?? "", "utf8").match(/BEGIN:VEVENT/g)?.length ?? 0;
  }

  test("Kurs komplett, Treff nur bis 14.10.: 8 + 2 Termine", async ({ page }) => {
    const button = await openSaved(page, [IDS.pekip, IDS.treff], "2024-09-18");
    // Die Statuszeile zählt nur die Angebote (Plan 0057, E9; ADR 0039)
    await expect(page.getByRole("status")).toHaveText("2 Angebote gemerkt");
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
    await expect(cards.nth(1).locator(".when")).toHaveText(/^Mi 21\.10\. · /);
    await expect(page.getByRole("status")).toHaveText("2 Angebote gemerkt");
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(await vevents(download)).toBe(11);
  });

  test("nichts passt: kein Download, Toast", async ({ page }) => {
    const button = await openSaved(page, [IDS.treff], "2026-08-01");
    // Die Statuszeile nennt das unpassende Angebot wie der Export-Toast (Browser-Review Plan 0028)
    await expect(page.getByRole("status")).toHaveText("1 Angebot gemerkt – 1 Angebot passt nicht zum Alter");
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await button.click();
    const toast = page.locator(".toast");
    await expect(toast).toHaveText("Keins der fest eingeplanten Angebote passt zum Alter.");
    // Hinweis, kein Erfolg: Es wurde nichts geladen (Browser-Review Plan 0028)
    await expect(toast).toHaveClass(/\bhint\b/);
    expect(downloaded).toBe(false);
  });

  test("ein Angebot passt nicht: nur die anderen in der Datei, Toast nennt es 6 s lang", async ({ page }) => {
    const button = await openSaved(page, [IDS.treff, IDS.reime], "2026-08-01");
    await expect(page.getByRole("status")).toHaveText("2 Angebote gemerkt – 1 Angebot passt nicht zum Alter");
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

// Plan 0057, E4: Der Export nimmt nur fest Eingeplantes. Merkliste und Vorgemerktes stehen vor dem Laden im Speicher.
test.describe("Export nur fest eingeplant (Plan 0057, E4)", () => {
  async function openWith(page: Page, ids: string[], tentative: string[]) {
    await page.addInitScript(
      ([saved, vorgemerkt]) => {
        localStorage.setItem("zwergenplan.merkliste", saved);
        localStorage.setItem("zwergenplan.merkliste-vorgemerkt", vorgemerkt);
      },
      [JSON.stringify(ids), JSON.stringify(tentative)] as const,
    );
    await page.goto("./?ansicht=merkliste");
    await expect(page.getByTestId("offer")).toHaveCount(ids.length);
  }

  test("nur das fest eingeplante in der Datei, der Toast nennt die vorgemerkten", async ({ page }) => {
    await openWith(page, ["nle21y1x", "lxizt974"], ["lxizt974"]);
    // Statuszeile: alle gemerkten, nur die Anzahl
    await expect(page.getByRole("status")).toHaveText("2 Angebote gemerkt");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" }).click(),
    ]);
    const ics = readFileSync((await download.path()) ?? "", "utf8");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(8); // nur der Kurs
    await expect(page.locator(".toast")).toHaveText(
      "Kalenderdatei mit 8 Terminen geladen · 1 vorgemerktes ist nicht in der Datei",
    );
  });

  test("nichts fest: Hinweis statt Datei, der Export-Chunk wird trotzdem angefordert", async ({ page }) => {
    // Vorladen im Leerlauf aus: Der Request soll vom Tipp kommen
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 0;
    });
    await openWith(page, ["nle21y1x", "lxizt974"], ["nle21y1x", "lxizt974"]);
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    const chunk = page.waitForRequest((r) => /\/assets\/export\/[^/]+\.js$/.test(new URL(r.url()).pathname));
    await page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" }).click();
    await chunk;
    const toast = page.locator(".toast");
    await expect(toast).toHaveText("Noch nichts fest eingeplant. Tippe nochmal aufs Herz.");
    await expect(toast).toHaveClass(/\bhint\b/);
    expect(downloaded).toBe(false);
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
  test("Statuszeile zählt nur die Angebote, der runde Export-Knopf nimmt alle", async ({ page }) => {
    await preset(page, FIVE);
    await page.goto("./?ansicht=merkliste");
    await expect(page.getByTestId("offer")).toHaveCount(5);
    await expect(page.getByRole("status")).toHaveText("5 Angebote gemerkt");
    // der breite Knopf und die Zeile „… · Kurse immer komplett“ sind weg
    await expect(page.getByText(/Kurse immer komplett|in einer \.ics-Datei/)).toHaveCount(0);
    const button = page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" });
    await expect(button).toHaveAttribute("title", "Fest Eingeplantes in meinen Kalender");
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
    test(`Umschalter über die ganze Breite des Inhalts bei ${width} px, in der Liste mit Sortier-Knopf`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await preset(page, FIVE.slice(0, 2));
      await page.goto("./?ansicht=merkliste");
      await expect(segment(page, "Liste")).toHaveAttribute("aria-pressed", "true");
      const measure = () =>
        page.evaluate(() => {
          const body = document.querySelector("main.body");
          const toggle = document.querySelector("fieldset.view-toggle.full");
          const sort = document.querySelector(".saved-tools .sortbtn");
          if (!body || !toggle) throw new Error("kein Inhalt oder kein Umschalter");
          const style = getComputedStyle(body);
          // Umschalter, Abstand (8 px) und Sortier-Knopf füllen die Zeile (Plan 0057, E6)
          const sortWidth = sort ? sort.getBoundingClientRect().width + 8 : 0;
          return {
            content: body.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
            toggle: toggle.getBoundingClientRect().width + sortWidth,
          };
        });
      const list = await measure();
      expect(Math.abs(list.toggle - list.content), JSON.stringify(list)).toBeLessThanOrEqual(1);
      await segment(page, "Kalender").click();
      const calendar = await measure();
      expect(Math.abs(calendar.toggle - calendar.content), JSON.stringify(calendar)).toBeLessThanOrEqual(1);
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
    await expect(page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" })).toHaveCount(0);
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

  test("Liste | Karte | Kalender setzt die Ansicht, der Fokus bleibt auf dem Segment, Export in Liste und Kalender", async ({
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
    await expect(page.getByRole("status")).toHaveText("5 Angebote gemerkt");
    await expect(page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" })).toHaveCount(0);
    await expect(tabButton(page, "Merkliste")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".map-box")).toBeVisible();
    // unter der Karte die gemerkten Angebote, alle im Startausschnitt (Plan 0056, E5)
    await expect(page.getByTestId("offer")).toHaveCount(5);
    await mapSettled(page);

    const liste = segment(page, "Liste");
    await liste.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?ansicht=merkliste$/);
    await expect(liste).toBeFocused();
    await expect(page.getByTestId("offer")).toHaveCount(5);
    await expect(page.locator(".map-box")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" })).toBeVisible();

    // dritte Darstellung (Etappe 3): Kalender, Statuszeile und Export-Knopf wie in der Liste (Plan 0057, E9)
    const kalender = segment(page, "Kalender");
    await kalender.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?ansicht=merkliste-kalender$/);
    await expect(kalender).toHaveAttribute("aria-pressed", "true");
    await expect(kalender).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("5 Angebote gemerkt");
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fest Eingeplantes in meinen Kalender" })).toBeVisible();
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
      // Erst die Karte fertig laden lassen, dann neu navigieren: Bricht das Neuladen in WebKit das Laden der
      // MapLibre-Worker bzw. des Stils ab, meldet MapLibre „Worker failed to load“ (globaler Dispatcher ohne
      // error-Listener) oder WebKit „… due to access control checks“. Das ist Teardown, kein Produktfehler.
      if (pressed === "Karte") await mapSettled(page);
      // Startseiten-Filter in der URL wirken nicht
      await page.goto(`${path}&format=einmalig`);
      await expect(page.getByRole("status")).toContainText("2 Angebote");
    });
  }
});

/**
 * Filter der Merkliste (Plan 0025, E6, E7, Test 9; seit Plan 0057, E5 im Sheet wie auf der Startseite): PEKiP (Kurs,
 * mit Anmeldung, ab 13.10.), Krabbeltreff (regelmäßig, ohne Anmeldung, bis 4.11.) und Musikgarten (Kurs, mit
 * Anmeldung, ab 5.11.). 8 + 5 + 6 = 19 kommende Termine.
 */
const savedSheet = (page: Page) => page.getByRole("dialog", { name: "Merkliste filtern" });

/** Merklisten-Filter-Sheet öffnen, die Chips der Reihe nach tippen und schließen (Plan 0057, E5) */
async function savedFilter(page: Page, ...names: string[]) {
  await page
    .getByRole("group", { name: "Merkliste filtern" })
    .getByRole("button", { name: /^Alle Filter/ })
    .click();
  const sheet = savedSheet(page);
  await expect(sheet).toBeVisible();
  for (const name of names) await sheet.getByRole("button", { name, exact: true }).click();
  await sheet.getByRole("button", { name: /gemerkte zeigen$/ }).click();
  await expect(sheet).toBeHidden();
}

test.describe("Filter der Merkliste (Plan 0025, E6, E7)", () => {
  const THREE = FIVE.slice(0, 3);

  test.beforeEach(async ({ page }) => {
    await preset(page, THREE);
    await page.goto("./?ansicht=merkliste");
    await expect(page.getByTestId("offer")).toHaveCount(3);
  });

  test("Format und Anmeldung, Leerzustand mit „Filter zurücksetzen“", async ({ page }) => {
    await savedFilter(page, "Kurs");
    await expect(page.getByTestId("offer")).toHaveCount(2);
    await expect(page.getByRole("status")).toHaveText("2 von 3 gemerkten Angeboten passen");

    // Anmeldung ist eine Einfachwahl: „Ohne“ schaltet „Mit“ ab
    await savedFilter(page, "Mit Anmeldung");
    await expect(page.getByTestId("offer")).toHaveCount(2);
    await savedFilter(page, "Ohne Anmeldung");
    await expect(page.getByTestId("offer")).toHaveCount(0);
    await expect(page.getByText("Nichts, was zu deinem Filter passt")).toBeVisible();
    await expect(page.getByText("Von deinen 3 gemerkten Angeboten passt keins.")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("0 von 3 gemerkten Angeboten passen");

    await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await expect(page.getByRole("status")).toBeFocused();
    await expect(page.getByTestId("offer")).toHaveCount(3);
    await expect(page.getByRole("status")).toHaveText("3 Angebote gemerkt");
    await expect(page.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();
  });

  test("„ab Nov.“: Kurse mit Beginn ab dann, Regelmäßiges mit Terminen dann; nur Monate mit Daten", async ({
    page,
  }) => {
    // Der letzte Termin im Datenstand ist am 10.12. (Musikgarten): kein „ab Jan.“
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    await expect(savedSheet(page).getByRole("button", { name: /^ab / })).toHaveText(["ab Nov.", "ab Dez."]);
    await page.keyboard.press("Escape");
    await savedFilter(page, "ab Nov.");
    const cards = page.getByTestId("offer");
    await expect(cards).toHaveCount(2);
    await expect(page.getByRole("status")).toHaveText("2 von 3 gemerkten Angeboten passen");
    // „Was ist zu tun“: erst anmelden (Musikgarten), dann spontan; der Treff steht am Termin im Zeitraum, nicht am
    // nächsten (Mi 7.10.)
    await expect(cards.nth(0)).toContainText("Musikgarten");
    await expect(cards.nth(1)).toContainText("Offener Krabbeltreff");
    await expect(cards.nth(1).locator(".when")).toHaveText(/^Mi 4\.11\. · /);
    await expect(cards.filter({ hasText: "PEKiP" })).toHaveCount(0);

    // Einfachwahl; ein zweiter Tipp hebt die Schnellwahl auf
    await savedFilter(page, "ab Dez.");
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    await expect(savedSheet(page).getByRole("button", { name: "ab Nov." })).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Escape");
    await expect(cards).toHaveCount(0);
    await savedFilter(page, "ab Dez.");
    await expect(cards).toHaveCount(3);
  });

  test("Filter übersteht den Tab-Wechsel, nicht das Neuladen; nie in der URL, „Angebote“ bleibt unberührt", async ({
    page,
  }) => {
    await savedFilter(page, "Kurs", "Mit Anmeldung", "ab Nov.");
    await expect(page.getByTestId("offer")).toHaveCount(1);
    await expect(page).toHaveURL(/\?ansicht=merkliste$/);

    await tabButton(page, "Angebote").click();
    await expect(page).not.toHaveURL(/format=|anmeldung=|von=|bis=/);
    const quick = page.getByRole("group", { name: "Schnellfilter" });
    await expect(quick.getByRole("button", { name: "Kurse", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(quick.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();

    await tabButton(page, "Merkliste").click();
    await expect(page.getByRole("button", { name: "Alle Filter, 3 aktiv" })).toBeVisible();
    await expect(page.getByTestId("offer")).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId("offer")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();
  });

  test("Export mit Filter: Name sagt es, die Datei enthält weiter alle Termine (E9)", async ({ page }) => {
    await savedFilter(page, "Kurs");
    await expect(page.getByTestId("offer")).toHaveCount(2);
    const button = page.getByRole("button", {
      name: "Alle 3 fest eingeplanten in meinen Kalender, auch ausgeblendete",
    });
    await expect(button).toHaveAttribute("title", "Alle 3 fest eingeplanten in meinen Kalender, auch ausgeblendete");
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    const ics = readFileSync((await download.path()) ?? "", "utf8");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(19);
  });

  test("Karte ohne passendes Angebot: derselbe Leerzustand, keine Karte (E5a)", async ({ page }) => {
    await savedFilter(page, "Kurs", "Ohne Anmeldung");
    await segment(page, "Karte").click();
    await expect(page).toHaveURL(/\?ansicht=merkliste-karte$/);
    await expect(page.getByText("Von deinen 3 gemerkten Angeboten passt keins.")).toBeVisible();
    await expect(page.locator(".map-box")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("0 von 3 gemerkten Angeboten");
    await expectMobileUx(page);
  });
});

test.describe("Karte der Merkliste mit Filter (Plan 0025, E3a)", () => {
  test.use({ tiles: "mock" });

  test("Statuszeile zählt passende Angebote", async ({ page }) => {
    await preset(page, FIVE.slice(0, 3));
    await page.goto("./?ansicht=merkliste-karte");
    await expect(page.getByRole("status")).toHaveText("3 Angebote gemerkt");
    await savedFilter(page, "Kurs");
    await expect(page.getByRole("status")).toHaveText("2 von 3 gemerkten Angeboten");
    await mapSettled(page);
  });

  test("Liste unter der Karte folgt dem Ausschnitt, „Alle zeigen“ und leerer Ausschnitt (Plan 0056, E5)", async ({
    page,
  }) => {
    await preset(page, FIVE);
    await page.goto("./?ansicht=merkliste-karte");
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", MAP_READY);
    await mapSettled(page);
    await expect(page.getByTestId("offer")).toHaveCount(5);
    // nah ans Theater (tests/fixtures/providers.yaml): nur „Kuckuck im Nest“ im Ausschnitt
    await page.evaluate(() => window.__zpMap?.jumpTo({ center: [11.0601, 49.4495], zoom: 17 }));
    await mapSettled(page);
    await expect(page.locator(".status [aria-hidden='true']")).toHaveText("1 gemerkte im Kartenausschnitt");
    await expect(page.getByTestId("offer")).toHaveCount(1);
    await expect(page.getByTestId("offer")).toContainText("Kuckuck im Nest");
    await page.getByRole("button", { name: "Alle zeigen" }).click();
    await expect(page.getByRole("status")).toBeFocused();
    await mapSettled(page);
    await expect(page.getByRole("status")).toHaveText("5 Angebote gemerkt");
    await expect(page.getByTestId("offer")).toHaveCount(5);

    // Ausschnitt ohne Gemerktes
    await page.evaluate(() => window.__zpMap?.jumpTo({ center: [11.2, 49.55], zoom: 15 }));
    await mapSettled(page);
    await expect(page.getByText("Im Kartenausschnitt liegt nichts von deiner Merkliste.")).toBeVisible();
    await expect(page.getByTestId("offer")).toHaveCount(0);
    await expectMobileUx(page);
  });
});
