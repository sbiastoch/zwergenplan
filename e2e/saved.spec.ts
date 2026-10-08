/** Merkliste (Plan 0003, E12, ADR 0007). Fixtures, Uhr Mo 5.10.2026 12:00. */
import { readFileSync } from "node:fs";
import type { Download, Page } from "@playwright/test";
import { expect, startPreloads, test } from "./fixtures.ts";

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
  await expect(page.getByText("2 gemerkt · 13 Termine in einer .ics-Datei")).toBeVisible();

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
    await expect(
      page.getByText("2 gemerkt · 10 Termine in einer .ics-Datei · Kurse komplett, regelmäßige nur passend zum Alter", {
        exact: true,
      }),
    ).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toBe("zwergenplan-merkliste.ics");
    expect(await vevents(download)).toBe(10);
    await expect(page.locator(".toast")).toHaveText("Kalenderdatei mit 10 Terminen geladen");
  });

  test("nichts passt: kein Download, Toast", async ({ page }) => {
    const button = await openSaved(page, [IDS.treff], "2026-08-01");
    await expect(page.getByText("1 gemerkt · keiner passt gerade zum Alter", { exact: true })).toBeVisible();
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
    await expect(
      page.getByText("2 gemerkt · 4 Termine in einer .ics-Datei · Kurse komplett, regelmäßige nur passend zum Alter", {
        exact: true,
      }),
    ).toBeVisible();
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
