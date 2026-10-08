/** Merkliste (Plan 0003, E12, ADR 0007; gemerkte Anbieter: Plan 0025). Fixtures, Uhr Mo 5.10.2026 12:00. */
import { readFileSync } from "node:fs";
import type { Page, Request } from "@playwright/test";
import { expect, startPreloads, test } from "./fixtures.ts";

const PEKIP = "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)";
const KRABBELTREFF_ID = "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus";
/** Anbieter des Krabbeltreffs: 3 kommende Angebote (PEKiP, Krabbeltreff, Babymassage), das Elterncafé ist vorbei */
const FAMILIENTREFF = { id: "familientreff-beispiel", name: "Familientreff Beispielhof (fiktiv)" };
/** Anbieter ohne Angebote in den Fixtures */
const TURNVEREIN = { id: "turnverein-beispiel", name: "Turnverein Beispiel (fiktiv)" };

const savedTab = (page: Page) => page.getByRole("button", { name: /^Merkliste/ });
const providersTitle = (page: Page) => page.getByRole("heading", { level: 3, name: "Gemerkte Anbieter" });
const providerRows = (page: Page) => page.locator("ul.saved-providers > li");
const providerRow = (page: Page, name: string) => providerRows(page).filter({ hasText: name });
const providerSheet = (page: Page) => page.getByRole("dialog", { name: "Anbieter" });
const isDirectory = (url: string) => new URL(url).pathname.endsWith("/data/anbieter.json");
const isChunk = (url: string) => /\/assets\/anbieter\/[^/]+\.js$/.test(new URL(url).pathname);

/**
 * Merkliste per localStorage vorbelegen (Plan 0025, Tests: nicht per Herz) und mit `?ansicht=merkliste` neu laden.
 * Gibt die Requests ab dem Neuladen zurück, die die Anbieterübersicht betreffen (Chunk, Katalog).
 */
async function presetSaved(page: Page, { offers = [], providers = [] }: { offers?: string[]; providers?: unknown[] }) {
  await page.evaluate(
    ({ o, p }) => {
      localStorage.setItem("zwergenplan.merkliste", o);
      localStorage.setItem("zwergenplan.anbieter-merkliste", p);
    },
    { o: JSON.stringify(offers), p: JSON.stringify(providers) },
  );
  const requests: Request[] = [];
  page.on("request", (req) => {
    if (isDirectory(req.url()) || isChunk(req.url())) requests.push(req);
  });
  const preloaded = startPreloads(page);
  await page.goto("./?ansicht=merkliste");
  await expect(page.getByRole("heading", { level: 2, name: "Meine Merkliste" })).toBeVisible();
  await preloaded;
  return requests;
}

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

// Plan 0025, Etappe 1 (Test 9): Anbieter merken, Abschnitt „Gemerkte Anbieter“, nur Anbieter, Privatsphäre
test.describe("Gemerkte Anbieter (Plan 0025, E1–E3)", () => {
  test("Herz im Anbieter-Sheet merkt; die Merkliste zeigt den Anbieter, auch nach dem Neuladen, nie in der URL", async ({
    page,
  }) => {
    // erst nach dem Vorladen (Export-Code, PWA-Kern) zählen: Danach entsteht kein Request ohne Anlass
    const preloaded = startPreloads(page);
    await page.reload();
    await preloaded;
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
    await detail.getByRole("button", { name: "Mehr von diesem Anbieter" }).click();
    const sheet = providerSheet(page);
    const heart = sheet.getByRole("button", { name: `${FAMILIENTREFF.name} merken` });
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    const afterTap: string[] = [];
    const record = (req: Request) => afterTap.push(req.url());
    page.on("request", record);
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(sheet.getByText("Anbieter gemerkt – liegt jetzt auf deiner Merkliste")).toBeVisible();
    page.off("request", record);
    expect(afterTap, "Merken löst keinen Request aus (Arch-Review Etappe 1, K2)").toEqual([]);
    // Die ID steht nur bei offenem Sheet in der URL (anbieter=), nie wegen des Merkens
    await expect(page).toHaveURL(/[?&]anbieter=familientreff-beispiel(&|$)/);
    await sheet.getByRole("button", { name: "Schließen" }).click();
    // Zurück zum Detail, das das Sheet geöffnet hat (Plan 0010, E3), und von dort zur Startseite
    await detail.getByRole("button", { name: "Zurück" }).click();
    await expect(detail).toBeHidden();
    expect(page.url()).not.toContain("familientreff-beispiel");

    await savedTab(page).click();
    await expect(providersTitle(page)).toBeVisible();
    await expect(providerRows(page)).toHaveCount(1);
    await expect(providerRows(page)).toContainText(FAMILIENTREFF.name);
    await expect(providerRows(page)).toContainText("3 kommende Angebote · nächster Mi 7.10.");
    // nur ein Anbieter, kein Angebot gemerkt (E5a): Hinweis statt Export, das Badge zählt nur Angebote
    await expect(page.getByRole("status")).toHaveText("0 gemerkt · 1 Anbieter");
    await expect(page.getByText("Noch keine Angebote gemerkt – tipp auf das Herz bei einem Angebot.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Alle in den Kalender" })).toHaveCount(0);
    await expect(page.locator(".tab .badge")).toHaveCount(0);

    await page.reload();
    await expect(providerRow(page, FAMILIENTREFF.name)).toContainText("3 kommende Angebote");
    expect(page.url()).not.toContain("familientreff-beispiel");
  });

  test("Herz in der Zeile entfernt; der Fokus geht auf die Überschrift, beim letzten Anbieter auf die Statuszeile", async ({
    page,
  }) => {
    await presetSaved(page, { offers: [KRABBELTREFF_ID], providers: [FAMILIENTREFF, TURNVEREIN] });
    await expect(page.getByRole("status")).toHaveText("1 gemerkt · 2 Anbieter");
    await expect(page.getByTestId("offer")).toHaveCount(1);
    // unter den Angeboten, nach Name sortiert; ohne Termine blass
    await expect(providerRows(page)).toHaveCount(2);
    await expect(providerRows(page).nth(0)).toContainText(FAMILIENTREFF.name);
    await expect(providerRows(page).nth(1)).toContainText("Gerade keine Termine im Zwergenplan");
    await expect(providerRows(page).nth(1).locator("button.place")).toHaveClass(/\bidle\b/);

    await providerRow(page, TURNVEREIN.name)
      .getByRole("button", { name: `${TURNVEREIN.name} merken` })
      .click();
    await expect(page.getByText("Anbieter nicht mehr gemerkt")).toBeVisible();
    await expect(providerRows(page)).toHaveCount(1);
    await expect(providersTitle(page)).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("1 gemerkt · 1 Anbieter");

    await providerRow(page, FAMILIENTREFF.name)
      .getByRole("button", { name: `${FAMILIENTREFF.name} merken` })
      .click();
    await expect(providersTitle(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("1 gemerkt");
    expect(await page.evaluate(() => localStorage.getItem("zwergenplan.anbieter-merkliste"))).toBeNull();
    // das gemerkte Angebot bleibt
    await expect(page.getByTestId("offer")).toHaveCount(1);
  });

  test("nur ein Anbieter gemerkt: Hinweis und Abschnitt; entfernt, ist die Merkliste leer", async ({ page }) => {
    await presetSaved(page, { providers: [TURNVEREIN] });
    await expect(page.getByRole("status")).toHaveText("0 gemerkt · 1 Anbieter");
    await expect(page.getByText("Noch keine Angebote gemerkt – tipp auf das Herz bei einem Angebot.")).toBeVisible();
    await expect(providerRow(page, TURNVEREIN.name)).toContainText("Gerade keine Termine im Zwergenplan");
    await expect(page.getByTestId("offer")).toHaveCount(0);

    await providerRow(page, TURNVEREIN.name)
      .getByRole("button", { name: `${TURNVEREIN.name} merken` })
      .click();
    await expect(page.getByText("Noch nichts gemerkt")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Meine Merkliste" })).toBeFocused();
  });

  test("Speicher mit ungültigen Einträgen: nur gültige Anbieter, ohne Fehler", async ({ page }) => {
    await presetSaved(page, {
      providers: [
        { id: "../x", name: "Pfad" },
        { id: "Theater", name: "Groß" },
        FAMILIENTREFF,
        FAMILIENTREFF,
        "kaputt",
      ],
    });
    await expect(providerRows(page)).toHaveCount(1);
    await expect(providerRows(page)).toContainText(FAMILIENTREFF.name);
  });

  test("Privatsphäre: Die Merkliste lädt weder Katalog noch Chunk; erst der Tipp auf die Zeile, je genau einmal", async ({
    page,
  }) => {
    const requests = await presetSaved(page, { providers: [FAMILIENTREFF] });
    await expect(providerRow(page, FAMILIENTREFF.name)).toBeVisible();
    expect(
      requests.map((r) => new URL(r.url()).pathname),
      "ohne Tipp weder anbieter.json noch Chunk",
    ).toEqual([]);
    expect(page.url()).not.toContain("familientreff-beispiel");

    await providerRow(page, FAMILIENTREFF.name).locator("button.place").click();
    const sheet = providerSheet(page);
    await expect(sheet.getByRole("heading", { level: 2, name: FAMILIENTREFF.name })).toBeVisible();
    await expect(sheet.getByRole("button", { name: `${FAMILIENTREFF.name} merken` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(/[?&]anbieter=familientreff-beispiel(&|$)/);
    expect(
      requests.filter((r) => isDirectory(r.url())),
      "anbieter.json genau einmal",
    ).toHaveLength(1);
    const chunks = requests.filter((r) => isChunk(r.url())).map((r) => r.url());
    expect(chunks.length, "Chunk geladen").toBeGreaterThanOrEqual(1);
    expect(new Set(chunks).size, "jede Chunk-Datei genau einmal").toBe(chunks.length);

    // Schließen und erneut öffnen: kein Request mehr, und der Name hat den ersten Fokus, nicht das Herz (K3)
    const before = requests.length;
    await sheet.getByRole("button", { name: "Schließen" }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/[?&]ansicht=merkliste$/);
    await providerRow(page, FAMILIENTREFF.name).locator("button.place").click();
    await expect(sheet.getByRole("heading", { level: 2, name: FAMILIENTREFF.name })).toBeFocused();
    expect(requests.length, "erneutes Öffnen ohne Request").toBe(before);
  });

  test("gemerkter Anbieter, den es nicht mehr gibt: Der Tipp schließt das Sheet wieder, die Zeile bleibt (E3)", async ({
    page,
  }) => {
    const gone = { id: "verschwunden-beispiel", name: "Verschwundener Treff (gemerkt)" };
    await presetSaved(page, { providers: [gone] });
    await expect(providerRow(page, gone.name)).toContainText("Gerade keine Termine im Zwergenplan");
    await providerRow(page, gone.name).locator("button.place").click();
    // Das Sheet lädt Chunk und Katalog, findet die ID nicht und entfernt anbieter= (Plan 0010, E3)
    await expect(page).toHaveURL(/[?&]ansicht=merkliste$/);
    await expect(providerSheet(page)).toBeHidden();
    await expect(providerRow(page, gone.name)).toBeVisible();
    // ohne doppelten History-Eintrag: Zurück verlässt die Merkliste (Arch-Review Etappe 1, K1)
    await page.goBack();
    await expect(page).not.toHaveURL(/ansicht=merkliste/);
  });
});
