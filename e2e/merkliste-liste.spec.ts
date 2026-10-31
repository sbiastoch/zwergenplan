/**
 * Liste der Merkliste mit Filter und Sortierung wie auf der Startseite (Plan 0057, E5, E6, E7a, Test 16) und den
 * Schnellfiltern statt Abschnitten (Plan 0058). Fixtures, Uhr
 * Mo 5.10.2026 12:00. Gemerkt (alle fest eingeplant, Bestand): PEKiP (Kurs ab Di 13.10., 9:30), Krabbeltreff
 * (regelmäßig, Mi 10 Uhr), Musikgarten (Kurs ab Do 5.11., 16 Uhr), Krabbelreime (regelmäßig, Fr 10:30) und Kuckuck
 * (einmalig, So 15.11., 11 Uhr), in dieser Merk-Reihenfolge.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { expectMobileUx } from "./mobile-ux.ts";

const FIVE = ["nle21y1x", "lxizt974", "qxdibmkc", "rzzqsvxq", "3zemfuzk"];
const TREFF = "lxizt974";
const PEKIP_ID = "nle21y1x";
const TABLE = "**/data/wegzeit.json";

async function preset(page: Page, ids: readonly string[], extra: Record<string, string> = {}) {
  await page.addInitScript(
    ({ saved, more }) => {
      localStorage.setItem("zwergenplan.merkliste", saved);
      for (const [key, value] of Object.entries(more)) localStorage.setItem(key, value);
    },
    { saved: JSON.stringify(ids), more: extra },
  );
}

async function openList(page: Page, count: number) {
  await page.goto("./?ansicht=merkliste");
  await expect(page.getByTestId("offer")).toHaveCount(count);
}

const filters = (page: Page) => page.getByRole("group", { name: "Merkliste filtern" });
const chip = (page: Page, name: string) => filters(page).getByRole("button", { name, exact: true });
const filterButton = (page: Page) => filters(page).getByRole("button", { name: /^Alle Filter/ });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Merkliste filtern" });
const sortButton = (page: Page) => page.getByRole("button", { name: /^Sortierung:/ });
const menu = (page: Page) => page.getByRole("menu", { name: "Sortieren nach" });
const titles = (page: Page) => page.getByTestId("offer").getByRole("heading", { level: 3 });

test.describe("Filter der Merkliste (E5)", () => {
  test("Sheet wie auf der Startseite: Art und Tageszeit wirken, Badge zählt, „Zurücksetzen“; kein Alter, keine Glocke", async ({
    page,
  }) => {
    // mit Geburtsdatum: Auf der Startseite hätte das Sheet den Alter-Abschnitt
    await preset(page, FIVE, { "zwergenplan.geburtsdatum": "2025-06-01" });
    await openList(page, 5);
    await expect(chip(page, "Nur fest eingeplant")).toBeVisible();
    // Tageszeit in der Liste nur im Sheet (Plan 0058, E1)
    await expect(chip(page, "Vormittags")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Kategorien" })).toHaveCount(0);
    await expect(page.locator(".quick-bell")).toHaveCount(0);

    await filterButton(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole("heading", { level: 2, name: "Merkliste filtern" })).toBeVisible();
    await expect(sheet(page).getByRole("heading", { level: 3, name: "Alter" })).toHaveCount(0);
    await expect(sheet(page).getByRole("switch")).toHaveCount(0);
    await expect(sheet(page).getByRole("heading", { level: 3 })).toHaveText([
      "Merkliste",
      "Tageszeit",
      "Art",
      "Format",
      "Anmeldung",
      "Kosten",
      "Zeitraum",
      "Wegzeit",
    ]);
    await expect(sheet(page).getByRole("button", { name: "5 gemerkte zeigen" })).toBeVisible();
    await sheet(page).getByRole("button", { name: "Musik & Singen" }).click();
    await expect(sheet(page).getByRole("button", { name: "1 gemerkte zeigen" })).toBeVisible();
    await sheet(page).getByRole("button", { name: "Musik & Singen" }).click();
    await sheet(page).getByRole("button", { name: "Nachmittags", exact: true }).click();
    await sheet(page).getByRole("button", { name: "Krabbel- & Spielgruppen" }).click();
    await expect(sheet(page).getByRole("button", { name: "0 gemerkte zeigen" })).toBeVisible();
    await sheet(page).getByRole("button", { name: "Krabbel- & Spielgruppen" }).click();
    await sheet(page).getByRole("button", { name: "1 gemerkte zeigen" }).click();
    await expect(sheet(page)).toBeHidden();

    // nur der Musikgarten beginnt nachmittags
    await expect(page.getByTestId("offer")).toHaveCount(1);
    await expect(page.getByTestId("offer")).toContainText("Musikgarten");
    await expect(page.getByRole("status")).toHaveText("1 von 5 gemerkten Angeboten passt");
    await expect(filterButton(page)).toHaveAccessibleName("Alle Filter, 1 aktiv");
    // nie in der URL, und „Angebote“ bleibt unberührt
    await expect(page).toHaveURL(/\?ansicht=merkliste$/);

    await filterButton(page).click();
    await sheet(page).getByRole("button", { name: "Zurücksetzen" }).click();
    await expect(sheet(page).getByRole("button", { name: "5 gemerkte zeigen" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("offer")).toHaveCount(5);
    await expect(filterButton(page)).toHaveAccessibleName("Alle Filter, 0 aktiv");
  });

  test("Chip „Nur fest eingeplant“, Tageszeit im Sheet; Zeitraum im Sheet mit Schnellwahl", async ({ page }) => {
    await preset(page, FIVE, { "zwergenplan.merkliste-vorgemerkt": JSON.stringify([TREFF]) });
    await openList(page, 5);
    await chip(page, "Nur fest eingeplant").click();
    await expect(page.getByTestId("offer")).toHaveCount(4);
    await expect(page.getByTestId("offer").filter({ hasText: "Offener Krabbeltreff" })).toHaveCount(0);
    await filterButton(page).click();
    await sheet(page).getByRole("button", { name: "Vormittags", exact: true }).click();
    await page.keyboard.press("Escape");
    // ohne Musikgarten (nachmittags)
    await expect(page.getByTestId("offer")).toHaveCount(3);
    await expect(filterButton(page)).toHaveAccessibleName("Alle Filter, 2 aktiv");
    await chip(page, "Nur fest eingeplant").click();
    await filterButton(page).click();
    await sheet(page).getByRole("button", { name: "Vormittags", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("offer")).toHaveCount(5);

    // Schnellwahl „ab Nov.“ im Sheet: Kurse mit Beginn ab dann, Regelmäßiges mit Terminen dann
    await filterButton(page).click();
    await expect(sheet(page).getByRole("button", { name: /^ab / })).toHaveText(["ab Nov.", "ab Dez."]);
    await sheet(page).getByRole("button", { name: "ab Nov." }).click();
    await expect(sheet(page).getByLabel("von")).toHaveValue("2026-11-01");
    await expect(sheet(page).getByRole("button", { name: "ab Nov." })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    // nach dem Termin im Zeitraum (Plan 0058, E3: Standard „Nächste Termine“)
    await expect(titles(page)).toHaveText([
      "Offener Krabbeltreff",
      "Musikgarten 1 (1–2 Jahre)",
      "Krabbelreime & Fingerspiele",
      "„Kuckuck im Nest“ – Theater ab 18 Monaten",
    ]);
    // der Treff steht an seinem Termin im Zeitraum
    await expect(page.getByRole("region", { name: /^Mittwoch, 4\. November/ })).toContainText("Offener Krabbeltreff");
  });
});

test.describe("Sortierung der Merkliste (E6)", () => {
  test("nur in der Liste; „Zuletzt gemerkt“ kehrt die Merk-Reihenfolge um, flach ohne Kopf", async ({ page }) => {
    await preset(page, FIVE);
    await openList(page, 5);
    await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Nächste Termine");
    // Standard ungefüllt wie auf der Startseite (Plan 0057, E6)
    await expect(sortButton(page)).not.toHaveClass(/\bon\b/);
    await sortButton(page).click();
    // rechtsbündig direkt unter dem Knopf (Browser-Review: ohne Bezug stand es weit unten über der Liste)
    const button = await sortButton(page).boundingBox();
    const box = await page.locator(".sort-menu").boundingBox();
    if (!button || !box) throw new Error("Knopf oder Menü fehlt");
    expect(box.y - (button.y + button.height)).toBeLessThan(16);
    expect(Math.abs(box.x + box.width - (button.x + button.width))).toBeLessThan(4);
    await expect(menu(page).getByRole("menuitemradio")).toHaveText([
      /^Nächste Termine/,
      /^Nächstgelegen/,
      /^Zuletzt gemerkt/,
    ]);
    await menu(page).getByRole("menuitemradio", { name: "Zuletzt gemerkt" }).click();
    await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Zuletzt gemerkt");
    await expect(sortButton(page)).toBeFocused();
    await expect(titles(page)).toHaveText([
      "„Kuckuck im Nest“ – Theater ab 18 Monaten",
      "Krabbelreime & Fingerspiele",
      "Musikgarten 1 (1–2 Jahre)",
      "Offener Krabbeltreff",
      "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)",
    ]);
    await expect(page.locator("main h2.daylabel")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Zuletzt gemerkt" })).toBeVisible();
    // Karten mit Datum, weil kein Tageskopf darüber steht
    await expect(page.getByTestId("offer").first().locator(".when")).toHaveText(/^So 15\.11\. · /);
    await expect(page).toHaveURL(/\?ansicht=merkliste$/);

    // Kalender und Karte haben keinen Sortier-Knopf; die Wahl übersteht den Wechsel
    const views = page.getByRole("group", { name: "Darstellung der Merkliste" });
    await views.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(sortButton(page)).toHaveCount(0);
    await views.getByRole("button", { name: "Liste", exact: true }).click();
    await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Zuletzt gemerkt");

    // „Nächste Termine“ mit Tagesköpfen wie auf der Startseite
    await sortButton(page).click();
    await menu(page).getByRole("menuitemradio", { name: "Nächste Termine" }).click();
    await expect(page.getByRole("region", { name: /^Mittwoch, 7\. Oktober/ })).toContainText("Offener Krabbeltreff");

    // nur im Speicher: nach dem Neuladen wieder „Nächste Termine“, kein neuer Schlüssel im localStorage
    await sortButton(page).click();
    await menu(page).getByRole("menuitemradio", { name: "Zuletzt gemerkt" }).click();
    await page.reload();
    await expect(sortButton(page)).toHaveAccessibleName("Sortierung: Nächste Termine");
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([
      "zwergenplan.einfuehrung",
      "zwergenplan.merkliste",
    ]);
  });

  test("„Nächstgelegen“ ohne Startpunkt: „Wovon aus gerechnet?“ über der Liste nach Terminen, keine Tabelle (E7a)", async ({
    page,
  }) => {
    const tables: string[] = [];
    page.on("request", (r) => {
      if (/\/data\/(wegzeit|linien)\.json/.test(r.url())) tables.push(r.url());
    });
    await preset(page, FIVE);
    await openList(page, 5);
    await sortButton(page).click();
    await expect(menu(page).getByRole("menuitemradio", { name: "Nächstgelegen" })).toHaveAccessibleDescription(
      "Startpunkt wählen",
    );
    await menu(page).getByRole("menuitemradio", { name: "Nächstgelegen" }).click();
    await expect(page.getByText("Wovon aus gerechnet?")).toBeVisible();
    await expect(page.getByText("Bis dahin nach Terminen")).toBeVisible();
    await expect(page.getByRole("region", { name: /^Mittwoch, 7\. Oktober/ })).toBeVisible();
    await expect(page.getByTestId("offer")).toHaveCount(5);
    await page.waitForTimeout(300);
    expect(tables).toEqual([]);
  });

  test("„Nächstgelegen“ mit gespeichertem Startpunkt: erst Platzhalter, dann nach Wegzeit (E7a)", async ({ page }) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(TABLE, async (route) => {
      await gate;
      await route.continue();
    });
    await preset(page, FIVE, { "zwergenplan.entfernung-ab": "gostenhof" });
    await page.goto("./?ansicht=merkliste");
    await expect(page.getByTestId("offer")).toHaveCount(5);
    await sortButton(page).click();
    await menu(page).getByRole("menuitemradio", { name: "Nächstgelegen" }).click();
    await expect(page.getByText("Wegzeiten werden geladen …")).toBeVisible();
    await expect(page.getByTestId("offer")).toHaveCount(0);
    // die Zahl bleibt sichtbar (nur mit Grenze wäre sie unsicher)
    await expect(page.getByRole("status")).not.toHaveClass(/pending/);
    await expect(page.getByRole("status")).toContainText("5 Angebote");
    release();
    await expect(page.locator("main h2.daylabel").first()).toHaveText(/^Bis \d+ Minuten/);
    await expect(page.getByTestId("offer")).toHaveCount(5);
  });
});

test.describe("Wegzeit-Grenze der Merkliste (E7a)", () => {
  test("mit Startpunkt: Liste und Kalender gefiltert, Badge zählt; nie in der URL", async ({ page }) => {
    await preset(page, FIVE, { "zwergenplan.entfernung-ab": "gostenhof" });
    await openList(page, 5);
    await filterButton(page).click();
    // ab Gostenhof (Fixture-Tabelle): nur der Musikgarten (Musikschule, ca. 30 Min.) liegt weiter weg
    const limit = sheet(page).getByRole("button", { name: "bis 20 Min." });
    await expect(limit).toBeEnabled();
    await limit.click();
    await expect(sheet(page).getByRole("button", { name: "4 gemerkte zeigen" })).toBeVisible();
    await sheet(page).getByRole("button", { name: "4 gemerkte zeigen" }).click();
    await expect(page.getByTestId("offer")).toHaveCount(4);
    await expect(page.getByTestId("offer").filter({ hasText: "Musikgarten" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("4 von 5 gemerkten Angeboten passen");
    await expect(filterButton(page)).toHaveAccessibleName("Alle Filter, 1 aktiv");
    await expect(page).toHaveURL(/\?ansicht=merkliste$/);
    const views = page.getByRole("group", { name: "Darstellung der Merkliste" });
    await views.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("4 von 5 gemerkten Angeboten passen");
    await expect(page.locator(".list-pending")).toHaveCount(0);
  });

  test("ohne Startpunkt: Grenze gesperrt mit Begründung, keine Tabelle", async ({ page }) => {
    const tables: string[] = [];
    page.on("request", (r) => {
      if (/\/data\/(wegzeit|linien)\.json/.test(r.url())) tables.push(r.url());
    });
    await preset(page, FIVE);
    await openList(page, 5);
    await filterButton(page).click();
    await expect(sheet(page).getByRole("button", { name: "bis 20 Min." })).toBeDisabled();
    await expect(sheet(page).getByText("Erst einen Startpunkt wählen.")).toBeVisible();
    await page.waitForTimeout(300);
    expect(tables).toEqual([]);
  });
});

test("laufender Kurs mit „Vormittags“: Kachel am nächsten Termin mit „Termin 3 von 8“, Kopf „Heute“ statt des vergangenen Kursbeginns (E7, Review 3 B1)", async ({
  page,
}) => {
  // Di 27.10., 8 Uhr: PEKiP (seit 13.10., dienstags 9:30) hat heute seinen dritten Termin
  await page.clock.setFixedTime(new Date("2026-10-27T08:00:00+01:00"));
  await preset(page, [PEKIP_ID]);
  await openList(page, 1);
  await filterButton(page).click();
  await sheet(page).getByRole("button", { name: "Vormittags", exact: true }).click();
  await page.keyboard.press("Escape");
  const card = page.getByTestId("offer");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Termin 3 von 8");
  // unter dem Tageskopf nur die Uhrzeit
  await expect(card.locator(".when")).toHaveText(/^9:30/);
  await expect(page.locator("main h2.daylabel")).toHaveCount(1);
  await expect(page.locator("main h2.daylabel")).toContainText("Heute");
});

test.describe("Schnellfilter der Liste (Plan 0058)", () => {
  // dazu der Schnupper-Workshop (einmalig, Sa 17.10.), die Bewegungslandschaft (regelmäßig mit Anmeldung, ab Di 20.10.)
  // und das Babykonzert (einmalig ohne Anmeldung, 6.12.)
  const ALL = [...FIVE, "fnp2g3xh", "rv61suun", "kovtez0z"];
  const LIST_CHIPS = ["Demnächst", "Anmelden", "Spontan", "Läuft gerade", "Kurse", "Einmalig", "Nur fest eingeplant"];
  const chipNames = (page: Page) => filters(page).getByRole("button").filter({ hasNotText: "Filter" });
  const status = (page: Page) => page.getByRole("status");

  test("Chipzeile je Darstellung; „Demnächst“ mit Marke, kombiniert UND über Gruppen; Sheet-Zahl wie die Liste", async ({
    page,
  }) => {
    await preset(page, ALL);
    await openList(page, 8);
    await expect(chipNames(page)).toHaveText(LIST_CHIPS);
    // ohne Chip nach Terminen mit Tagesköpfen, die Marke an genau den zwei Angeboten „Demnächst“
    await expect(page.getByRole("region", { name: /^Mittwoch, 7\. Oktober/ })).toContainText("Offener Krabbeltreff");
    await expect(page.locator(".fact.soon")).toHaveText(["in 8 Tagen", "in 12 Tagen"]);

    await chip(page, "Demnächst").click();
    await expect(chip(page, "Demnächst")).toHaveAttribute("aria-pressed", "true");
    await expect(titles(page)).toHaveText([
      "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)",
      "Babymassage – Schnupper-Workshop",
    ]);
    // der Krabbeltreff (regelmäßig ohne Anmeldung) hat zwar einen Termin in 14 Tagen, ist aber nicht „Demnächst“
    await expect(status(page)).toHaveText("2 von 8 gemerkten Angeboten passen");
    // Chips stehen nicht im Sheet: das Badge bleibt leer
    await expect(filterButton(page)).toHaveAccessibleName("Alle Filter, 0 aktiv");

    // Zeit UND Format: nur PEKiP
    await chip(page, "Kurse").click();
    await expect(titles(page)).toHaveText(["PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)"]);
    await expect(status(page)).toHaveText("1 von 8 gemerkten Angeboten passt");
    // Format ODER Format: beide wieder
    await chip(page, "Einmalig").click();
    await expect(page.getByTestId("offer")).toHaveCount(2);
    await chip(page, "Einmalig").click();
    await filterButton(page).click();
    await expect(sheet(page).getByRole("button", { name: "1 gemerkte zeigen" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Kalender: andere Chips, „Kurse“ wirkt dort nicht; zurück in der Liste ist die Wahl noch da
    const views = page.getByRole("group", { name: "Darstellung der Merkliste" });
    await views.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(chipNames(page)).toHaveText(["Nur fest eingeplant", "Vormittags", "Nachmittags"]);
    await expect(status(page)).toContainText("8 Angebote gemerkt");
    await views.getByRole("button", { name: "Liste", exact: true }).click();
    await expect(chip(page, "Kurse")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "Demnächst")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("offer")).toHaveCount(1);
    await expect(page).toHaveURL(/\?ansicht=merkliste$/);
  });

  test("ohne Treffer: Leerzustand, „Filter zurücksetzen“ leert auch die Chips", async ({ page }) => {
    await preset(page, ALL);
    await openList(page, 8);
    // am 5.10. läuft kein Kurs
    await chip(page, "Läuft gerade").click();
    await expect(page.getByText("Nichts, was zu deinem Filter passt")).toBeVisible();
    await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await expect(status(page)).toBeFocused();
    await expect(page.getByTestId("offer")).toHaveCount(8);
    for (const name of LIST_CHIPS) await expect(chip(page, name)).toHaveAttribute("aria-pressed", "false");
  });

  test("„Läuft gerade“: „Endet …“ und „Anschluss suchen“ öffnet Angebote mit Kurs, Kategorie und Zeitraum", async ({
    page,
  }) => {
    // Di 27.10., 8 Uhr: PEKiP läuft seit 13.10. (bis 1.12.), der Musikgarten beginnt am 5.11.
    await page.clock.setFixedTime(new Date("2026-10-27T08:00:00+01:00"));
    await preset(page, [PEKIP_ID, "qxdibmkc"]);
    // ein Startseiten-Filter, der ersetzt wird
    await page.goto("./?ansicht=merkliste&kosten=kostenlos");
    await expect(page.getByTestId("offer")).toHaveCount(2);
    // ohne Chip: der laufende Kurs trägt keine Marke, der Musikgarten „in 9 Tagen“
    await expect(page.locator(".fact.soon")).toHaveText(["in 9 Tagen"]);
    await chip(page, "Läuft gerade").click();
    const card = page.getByTestId("offer");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".card-next")).toContainText("Endet Di 1.12.");
    const link = card.getByRole("button", {
      name: "Anschluss an PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026) suchen",
    });
    await expect(link).toHaveText("Anschluss suchen");
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectMobileUx(page);
    await link.click();
    await expect(page).toHaveURL(/\?/);
    const params = new URL(page.url()).searchParams;
    expect(Object.fromEntries(params)).toEqual({ format: "kurs", kat: "babykurse", von: "2026-12-02" });
    // „Angebote“ mit den Kursen ab 2.12.: in den Fixtures keiner; ganz oben
    await expect(page.getByRole("button", { name: /^Alle Filter, 3 aktiv/ })).toBeVisible();
    await expect(page.getByTestId("offer")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Gates: Liste, offenes Sortiermenü und Filter-Sheet (${colorScheme === "light" ? "hell" : "dunkel"})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await preset(page, FIVE, { "zwergenplan.merkliste-vorgemerkt": JSON.stringify([TREFF]) });
    await openList(page, 5);
    await chip(page, "Anmelden").click();
    await expectMobileUx(page);
    await sortButton(page).click();
    await expect(menu(page)).toBeVisible();
    await expectMobileUx(page);
    await page.keyboard.press("Escape");
    await filterButton(page).click();
    await expect(sheet(page)).toBeVisible();
    await expectMobileUx(page);
  });
}
