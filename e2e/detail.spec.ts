/**
 * Detail (Plan 0003, E3, E4, E13; Plan 0007, E1, E3, E4): Dialog, History, Deep-Link, ICS, Texte.
 * Fixtures, Uhr Mo 5.10.2026 12:00, sonst per `reloadAt`.
 */
import { readFileSync } from "node:fs";
import type { Download, Locator, Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const PEKIP = "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)";

async function openDetail(page: Page, title: string | RegExp) {
  await page.getByRole("heading", { level: 3, name: title }).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function vevents(page: Page, href: string | null) {
  const res = await page.request.get(new URL(href ?? "", page.url()).toString());
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  return res.text();
}

/** Uhr umstellen und neu laden (die Fake-Uhr gilt für jedes neue Dokument). */
async function reloadAt(page: Page, at: Date) {
  await page.clock.setFixedTime(at);
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
});

test("öffnet per Kachel, steht in der URL, Zurück-Geste schließt", async ({ page }) => {
  const dialog = await openDetail(page, PEKIP);
  await expect(page).toHaveURL(/angebot=/);
  await expect(dialog.getByText("Kurs mit 8 Terminen")).toBeVisible();
  await expect(dialog.getByText("Di 13.10. bis Di 1.12., jeweils 9:30–11:00")).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/angebot=/);
  // Fokus zurück auf den Auslöser
  await expect(page.getByRole("heading", { level: 3, name: PEKIP }).getByRole("button")).toBeFocused();
});

test("Deep-Link öffnet direkt, Zurück-Knopf entfernt den Parameter", async ({ page }) => {
  await openDetail(page, PEKIP);
  const deepLink = page.url();
  await page.goto(deepLink);
  const dialog = page.getByRole("dialog", { name: PEKIP });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zurück" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/angebot=/);
});

test("Esc schließt das Detail", async ({ page }) => {
  const dialog = await openDetail(page, "Offener Krabbeltreff");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/angebot=/);
});

test("ein unbekanntes Angebot in der URL wird verworfen", async ({ page }) => {
  await page.goto("./?angebot=gibt-es--nicht--mehr");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/angebot=/);
});

test("Kurs-ICS enthält alle Termine in korrekter Zeit", async ({ page }) => {
  const dialog = await openDetail(page, PEKIP);
  const link = dialog.getByRole("link", { name: "Alle 8 Kurstermine" });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/ics\/.+\.ics$/);
  const body = await vevents(page, href);
  expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(8);
  expect(body).toContain("DTSTART:20261027T083000Z"); // 9:30 nach der Zeitumstellung
});

test("regelmäßig: nur der nächste Termin oder alle, Knopf ohne Zahl (H5)", async ({ page }) => {
  const dialog = await openDetail(page, "Offener Krabbeltreff");
  await expect(dialog.getByText("Jeden Mittwoch, 10:00–11:30")).toBeVisible();
  await expect(dialog.getByText("Einzeln besuchbar")).toBeVisible();
  const one = await vevents(page, await dialog.getByRole("link", { name: "Nur Mi 7.10." }).getAttribute("href"));
  expect(one.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  const all = await vevents(
    page,
    await dialog.getByRole("link", { name: "Alle Termine", exact: true }).getAttribute("href"),
  );
  expect(all.match(/BEGIN:VEVENT/g)).toHaveLength(5);
});

test("zeigt Verfügbarkeit als Momentaufnahme und erklärt das Alter", async ({ page }) => {
  const dialog = await openDetail(page, PEKIP);
  await expect(dialog.getByText("Wenige Plätze")).toBeVisible();
  await expect(dialog.getByText(/Momentaufnahme vom \d+\.\d+\./)).toBeVisible();
  await expect(dialog.getByText("Geburtsdatum eintragen, dann prüfen wir das")).toBeVisible();
});

test("merkt aus dem Detail, Meldung im Dialog sichtbar", async ({ page }) => {
  const dialog = await openDetail(page, PEKIP);
  await dialog.getByRole("button", { name: `${PEKIP} merken` }).click();
  await expect(dialog.getByText("Gemerkt – liegt jetzt auf deiner Merkliste")).toBeVisible();
  await expect(dialog.getByRole("button", { name: `${PEKIP} merken` })).toHaveAttribute("aria-pressed", "true");
});

test("regelmäßig 14-täglich: Wochentag mit Uhrzeit (B1)", async ({ page }) => {
  const dialog = await openDetail(page, "Krabbelreime & Fingerspiele");
  await expect(dialog.getByText("Freitags, 10:30–11:00", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Einzeln besuchbar")).toBeVisible();
});

test("Anmeldefrist: offen bis 9.10., danach vorbei (B4)", async ({ page }) => {
  const before = await openDetail(page, PEKIP);
  await expect(before.getByText("Anmeldung bis 9.10.", { exact: true })).toBeVisible();

  await reloadAt(page, new Date("2026-10-10T12:00:00+02:00"));
  const after = await openDetail(page, PEKIP);
  await expect(after.getByText("Anmeldeschluss war am 9.10.", { exact: true })).toBeVisible();
  await expect(after.getByText("Anmeldung bis 9.10.")).toHaveCount(0);
});

test("laufender Kurs zählt die übrigen Termine (H8)", async ({ page }) => {
  // Di 20.10. 12:00: Die Termine vom 13. und 20.10. (9:30–11:00) sind beendet.
  await reloadAt(page, new Date("2026-10-20T12:00:00+02:00"));
  const dialog = await openDetail(page, PEKIP);
  await expect(dialog.getByText("Kurs · noch 6 von 8 Terminen", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Di 13.10. bis Di 1.12., jeweils 9:30–11:00")).toBeVisible();
  // Kurse bleiben in der Kalenderdatei komplett (ADR 0007)
  await expect(dialog.getByRole("link", { name: "Alle 8 Kurstermine" })).toBeVisible();
});

// Plan 0019, E1–E3, E5: Die Kachel „Wo“ öffnet die Route in Google Maps, nur mit der Adresse als Ziel. Kein Test tippt
// den Link an: Der Drittanbieter-Wächter (fixtures.ts) bleibt scharf.
const MAPS = "https://www.google.com/maps/dir/?api=1&destination=";

test("Kachel „Wo“ ist ein Link zur Route in Google Maps, ohne Startpunkt und Referrer (Plan 0019)", async ({
  page,
}) => {
  const dialog = await openDetail(page, /Kuckuck im Nest/);
  const link = dialog.getByRole("link", { name: /Route in Google Maps/ });
  await expect(link).toHaveCount(1);
  await expect(link).toContainText("Kleines Theater Beispiel");
  await expect(link).toHaveAttribute("href", `${MAPS}B%C3%BChnenplatz+2%2C+90429+N%C3%BCrnberg&travelmode=transit`);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /(^| )noopener( |$)/);
  await expect(link).toHaveAttribute("rel", /(^| )noreferrer( |$)/);
  // Die ganze Kachel ist antippbar: In ihrer Mitte liegt der Link, kein anderes Element darüber (Review 1, N3).
  // Quer liegt die Kachel unter dem Falz, und das Detail fährt beim Öffnen herein: in die Mitte holen und abwarten
  await expect
    .poll(() =>
      link.evaluate((a) => {
        a.scrollIntoView({ block: "center" });
        const box = a.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("a") === a;
      }),
    )
    .toBe(true);
  // ohne Startpunkt keine Karte „Wege ab …“
  await expect(dialog.locator(".ways")).toHaveCount(0);
});

test("Adresse mit Klammerzusatz: Ziel nur „Straße, PLZ Ort“ (Plan 0019, E2)", async ({ page }) => {
  const dialog = await openDetail(page, /^Eltern-Kind-Bewegungslandschaft/);
  await expect(dialog.getByRole("link", { name: /Route in Google Maps/ })).toHaveAttribute(
    "href",
    `${MAPS}Kirchengemeindehausstra%C3%9Fe+128a%2C+90461+N%C3%BCrnberg&travelmode=transit`,
  );
});

// Plan 0018, E2–E4: Mit Geburtsdatum kommt „Alle Termine“ einer regelmäßigen Reihe aus dem Browser, nur mit den
// Terminen, an denen sie zum Alter passt. Das Detail öffnet per Deep-Link: Der Altersfilter blendet in „Entdecken“
// Unpassendes aus.
test.describe("„Alle Termine“ passend zum Alter (Plan 0018)", () => {
  const TREFF = {
    id: "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus",
    title: "Offener Krabbeltreff",
  };
  const REIME = {
    id: "stadtbibliothek-beispiel--krabbelreime-fingerspiele--stadtbibliothek-beispiel-zentrum",
    title: "Krabbelreime & Fingerspiele",
  };

  /** Geburtsdatum vor dem Laden speichern, Detail öffnen; zählt Requests auf `ics/` (ADR 0018: keiner mit Blob). */
  async function openAged(page: Page, offer: { id: string; title: string }, birthDate: string) {
    await page.addInitScript((born) => localStorage.setItem("zwergenplan.geburtsdatum", born), birthDate);
    await page.goto(`./?angebot=${offer.id}`);
    const dialog = page.getByRole("dialog", { name: offer.title });
    await expect(dialog).toBeVisible();
    const icsRequests: string[] = [];
    page.on("request", (req: Request) => {
      if (new URL(req.url()).pathname.includes("/ics/")) icsRequests.push(req.url());
    });
    return { dialog, all: dialog.getByRole("link", { name: "Alle Termine", exact: true }), icsRequests };
  }

  /** Satz unter der Altersspanne in der Kachel „Alter“ */
  const ageLine = (dialog: Locator) =>
    dialog
      .locator(".label")
      .filter({ hasText: /^Alter/ })
      .locator("span.ok");

  async function text(download: Download) {
    return readFileSync((await download.path()) ?? "", "utf8");
  }

  /** UIDs bzw. ganze VEVENTs einer ICS-Datei, gefaltete Zeilen (RFC 5545) entfaltet */
  const uids = (ics: string) => ics.replaceAll("\r\n ", "").match(/^UID:.+$/gm) ?? [];
  const events = (ics: string) => ics.replaceAll("\r\n ", "").match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];

  test("zu alt ab 21.10.: 2 Termine bis 14.10., UIDs wie in der statischen Datei, Toast 6 s", async ({ page }) => {
    const { dialog, all, icsRequests } = await openAged(page, TREFF, "2024-09-18");
    await expect(ageLine(dialog)).toHaveText("Passt: am Mi 7.10. 24 Monate alt · passt bis 14.10.");
    // Hält die Timer an: Die Anzeigedauer des Toasts wird gezielt vorgespult.
    await page.clock.pauseAt(new Date("2026-10-05T12:00:00+02:00"));
    const [download] = await Promise.all([page.waitForEvent("download"), all.click()]);
    expect(download.url()).toMatch(/^blob:/);
    expect(download.suggestedFilename()).toBe(`${TREFF.id}.ics`);
    const ics = await text(download);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20261007T080000Z");
    expect(ics).toContain("DTSTART:20261014T080000Z");
    expect(ics).toContain("X-WR-CALNAME:Offener Krabbeltreff");
    const toast = dialog.locator(".toast");
    await expect(toast).toHaveText(
      "Kalenderdatei mit 2 Terminen geladen – bis 14.10., danach passt es nicht mehr zum Alter",
    );
    expect(icsRequests, "kein Request auf ics/ (ADR 0018)").toEqual([]);

    const res = await page.request.get(new URL((await all.getAttribute("href")) ?? "", page.url()).toString());
    const full = await res.text();
    expect(uids(full)).toHaveLength(5);
    expect(uids(ics)).toHaveLength(2);
    expect(uids(full)).toEqual(expect.arrayContaining(uids(ics)));
    // ADR 0018: dieselben VEVENTs wie in der statischen Datei, mit Titel und DTSTAMP
    expect(events(full)).toEqual(expect.arrayContaining(events(ics)));

    await page.clock.runFor(5_500);
    await expect(toast, "nach 5,5 s noch sichtbar").toBeVisible();
    await page.clock.runFor(1_000);
    await expect(toast).toHaveCount(0);
  });

  test("zu jung bis 20.10.: 3 Termine ab 21.10.", async ({ page }) => {
    const { dialog, all, icsRequests } = await openAged(page, TREFF, "2026-04-20");
    await expect(ageLine(dialog)).toHaveText("Passt: am Mi 21.10. 6 Monate alt · passt ab 21.10.");
    const [download] = await Promise.all([page.waitForEvent("download"), all.click()]);
    const ics = await text(download);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).not.toContain("DTSTART:20261014T080000Z");
    for (const start of ["20261021T080000Z", "20261028T090000Z", "20261104T090000Z"]) {
      expect(ics).toContain(`DTSTART:${start}`);
    }
    await expect(dialog.locator(".toast")).toHaveText(
      "Kalenderdatei mit 3 Terminen geladen – ab 21.10., vorher passt es noch nicht zum Alter",
    );
    expect(icsRequests).toEqual([]);
  });

  test("passt über die ganze Reihe: trotzdem aus dem Browser, ohne Zusatz (Review 3, W2)", async ({ page }) => {
    const { dialog, all, icsRequests } = await openAged(page, REIME, "2024-09-18");
    await expect(ageLine(dialog)).toHaveText("Passt: am Fr 9.10. 24 Monate alt");
    const [download] = await Promise.all([page.waitForEvent("download"), all.click()]);
    expect(download.url()).toMatch(/^blob:/);
    expect((await text(download)).match(/BEGIN:VEVENT/g)).toHaveLength(4);
    await expect(dialog.locator(".toast")).toHaveText("Kalenderdatei mit 4 Terminen geladen");
    expect(icsRequests, "der Request verriete sonst, dass die ganze Reihe passt").toEqual([]);
  });

  test("kein kommender Termin passt: kein Download, Toast", async ({ page }) => {
    const { dialog, all, icsRequests } = await openAged(page, TREFF, "2026-08-01");
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    const url = page.url();
    await all.click();
    await expect(dialog.locator(".toast")).toHaveText("Keiner der kommenden Termine passt zum Alter.");
    expect(downloaded).toBe(false);
    expect(icsRequests).toEqual([]);
    expect(page.url()).toBe(url);
    await expect(dialog).toBeVisible();
  });

  test("ohne Geburtsdatum: die statische Datei wie bisher", async ({ page }) => {
    const dialog = await openDetail(page, TREFF.title);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("link", { name: "Alle Termine", exact: true }).click(),
    ]);
    expect(new URL(download.url()).pathname).toMatch(new RegExp(`/ics/${TREFF.id}\\.ics$`));
    expect((await text(download)).match(/BEGIN:VEVENT/g)).toHaveLength(5);
    await expect(dialog.locator(".toast")).toHaveText("Kalenderdatei mit 5 Terminen geladen");
  });
});
