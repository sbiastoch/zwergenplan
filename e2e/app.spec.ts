/** Entdecken: Liste nach Tagen, Filter, Alter (Plan 0003, E7–E11, E16). Fixtures, Uhr Mo 5.10.2026 12:00. */
import type { Page } from "@playwright/test";
import { expect, mapSettled, startPreloads, test } from "./fixtures.ts";
import { expectAccessible, expectMobileUx } from "./mobile-ux.ts";

// Der Tab „Anbieter“ zeigt die Anbieterkarte, Kacheln aus tests/fixtures/karte/ (Plan 0055, E8)
test.use({ tiles: "mock" });

/** Tests mit diesem Tag laden selbst, weil sie vor dem ersten Laden zählen oder Requests umleiten. */
const OWN_START = "@eigener-start";

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.tags.includes(OWN_START)) return;
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "Zwergenplan" })).toBeVisible();
});

const offers = (page: Page) => page.getByTestId("offer");

async function setBirthDate(page: Page, text: string) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await page.getByLabel("Geburtsdatum").fill(text);
  await page.getByRole("button", { name: "Fertig" }).click();
  // erst nach dem Schließen weiter: WebKit scrollt sonst den nächsten Knopf nicht ins Bild (Scroll-Sperre des Dialogs)
  await expect(page.getByRole("dialog", { name: "Kind und Einstellungen" })).toBeHidden();
}

test("zeigt jedes kommende Angebot einmal, nach Tagen gruppiert, Vergangenes nicht", async ({ page }) => {
  await expect(offers(page)).toHaveCount(8);
  await expect(page.getByText("Elterncafé am Montag")).toHaveCount(0);
  const firstDay = page.getByRole("heading", { level: 2 }).first();
  await expect(firstDay).toHaveText(/Mittwoch\s*7\. Oktober/);
  await expect(offers(page).first()).toContainText("Offener Krabbeltreff");
  await expect(offers(page).first()).toContainText("10:00–11:30 Uhr");
  await expect(offers(page).first()).toContainText("Jeden Mittwoch");
  await expect(page.getByRole("status")).toHaveText("8 Angebote");
  await expect(page.getByText("Datenstand:")).toBeVisible();
});

test("ist für Suchmaschinen offen und liegt im Wurzelpfad (Plan 0034, E4)", async ({ page }) => {
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/");
});

test("Impressum: dezent unter der Liste und im Kind-Sheet, öffnet die eigene Seite (Plan 0034, E3)", async ({
  page,
}) => {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await expect(sheet.getByRole("link", { name: "Impressum und Datenschutz" })).toHaveAttribute("href", "/impressum/");
  await expect(sheet.getByRole("link", { name: "So entsteht der Zwergenplan" })).toHaveAttribute(
    "href",
    "/impressum/#so-entsteht",
  );
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(sheet).toBeHidden();

  const link = page.getByRole("link", { name: "Impressum", exact: true });
  await expect(link).toHaveAttribute("href", "/impressum/");
  await link.click();
  await expect(page).toHaveURL(/\/impressum\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Impressum" })).toBeVisible();
  await expect(page.getByText("Zwischen den Fleischbänken 12")).toBeVisible();
  // im Impressum und unter „Hinweise“ (E9)
  const mail = page.getByRole("link", { name: "info@zwergenplan.app" });
  await expect(mail).toHaveCount(2);
  await expect(mail.first()).toHaveAttribute("href", "mailto:info@zwergenplan.app");
  await expect(page.getByRole("heading", { level: 2, name: "Hinweise" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "So entsteht der Zwergenplan" })).toBeVisible();
  await expect(page.getByText(/Texte sind KI-generiert und können Fehler enthalten/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Datenschutz" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("Chip „Meine Anbieter“ (Plan 0054, Nachtrag A): nur mit Abo, Liste und Karte, nicht in der URL, kein Request; Such-Abos gelöscht", {
  tag: OWN_START,
}, async ({ page, tileLog }) => {
  const own = page.getByRole("group", { name: "Schnellfilter" }).getByRole("button", { name: "Meine Anbieter" });
  // ohne Abo kein Chip
  await page.goto("./");
  await expect(offers(page)).toHaveCount(8);
  await expect(own).toHaveCount(0);

  // „Kleines Theater Beispiel“ (fv3fpfp2) hat zwei Angebote; dazu die Altlast der Such-Abos (ADR 0042)
  await page.addInitScript(() => {
    localStorage.setItem("zwergenplan.anbieter-merkliste", JSON.stringify(["fv3fpfp2"]));
    localStorage.setItem("zwergenplan.such-abos", '["format=kurs"]');
  });
  // Export-Code und PWA-Kern laden im Leerlauf nach, für alle gleich: erst danach zählen
  const preloads = startPreloads(page);
  await page.reload();
  await preloads;
  await expect(offers(page)).toHaveCount(8);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zwergenplan.such-abos"))).toBeNull();
  await expect(own).toHaveAttribute("aria-pressed", "false");

  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });
  await own.click();
  await expect(own).toHaveAttribute("aria-pressed", "true");
  await expect(offers(page)).toHaveCount(2);
  await expect(page.getByRole("status")).toHaveText("2 Angebote");
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "");
  // kein Badge: der Chip steht nicht im Filter-Sheet (wie Plan 0058, E1)
  await expect(page.getByRole("button", { name: "Alle Filter, 0 aktiv" })).toBeVisible();
  expect(requests).toEqual([]);

  // Karte: dieselbe Auswahl, aber derselbe Startausschnitt wie ohne Chip; die Kacheln hängen nie an den Abos (Review M2)
  const tilesSince = (index: number) => [...new Set(tileLog.slice(index).map((t) => t.path))].sort();
  let mark = tileLog.length;
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await mapSettled(page);
  await expect(page.getByRole("status")).toHaveText("2 Angebote");
  const withChip = tilesSince(mark);
  expect(withChip.length).toBeGreaterThan(0);
  mark = tileLog.length;
  // nach dem Neuladen ist der Chip aus (nur im Speicher)
  await page.goto("./?ansicht=karte");
  await mapSettled(page);
  await expect(page.getByRole("status")).toHaveText("8 Angebote");
  expect(tilesSince(mark)).toEqual(withChip);
  await page.goto("./");
  await own.click();
  await expect(offers(page)).toHaveCount(2);

  // mit einem Filter leer: „Filter zurücksetzen“ schaltet auch den Chip aus
  await page.getByRole("button", { name: "Kurse", exact: true }).click();
  await expect(offers(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(own).toHaveAttribute("aria-pressed", "false");
  await expect(offers(page)).toHaveCount(8);
});

test("Schnellfilter und Sticker stehen in der URL und überleben ein Neuladen", async ({ page }) => {
  await page.getByRole("button", { name: "Kurse", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kurse", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?format=kurs$/);
  await expect(offers(page)).toHaveCount(2);

  await page.reload();
  await expect(offers(page)).toHaveCount(2);
  await page.getByRole("button", { name: /^Musik: Musik & Singen/ }).click();
  await expect(page).toHaveURL(/\?kat=musik&format=kurs$/);
  await expect(offers(page)).toHaveCount(1);
  await expect(offers(page)).toContainText("Musikgarten 1");
  await expect(page.getByRole("button", { name: "Alle Filter, 2 aktiv" })).toBeVisible();
});

test("Filter-Sheet wirkt sofort, Einfachwahl bei Anmeldung, Zurücksetzen leert", async ({ page }) => {
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Ohne Anmeldung" }).click();
  await expect(sheet.getByRole("button", { name: "Ohne Anmeldung" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Egal" }).first()).toHaveAttribute("aria-pressed", "false");
  await expect(sheet.getByRole("button", { name: "3 Angebote zeigen" })).toBeVisible();
  await sheet.getByRole("button", { name: "Mit Anmeldung" }).click();
  await expect(sheet.getByRole("button", { name: "Ohne Anmeldung" })).toHaveAttribute("aria-pressed", "false");
  await sheet.getByRole("button", { name: "Zurücksetzen" }).click();
  await sheet.getByRole("button", { name: "8 Angebote zeigen" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "");
});

test("Tageszeit im Filter-Sheet (Plan 0057, E7): URL, gleiche Zahl in Liste, Statuszeile und Karte", async ({
  page,
}) => {
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  const daytime = sheet.getByRole("group", { name: "Tageszeit" });
  await expect(daytime).toHaveAccessibleDescription("Beginn vor 12 Uhr, 12–15 Uhr, ab 15 Uhr");
  // zwischen Alter und Art: vor „Art“ (ohne Geburtsdatum gibt es keinen Abschnitt „Alter“)
  const headings = await sheet.getByRole("heading", { level: 3 }).allTextContents();
  expect(headings.slice(0, 2)).toEqual(["Tageszeit", "Art"]);
  await daytime.getByRole("button", { name: "Vormittags" }).click();
  await expect(daytime.getByRole("button", { name: "Vormittags" })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?tageszeit=vormittags$/);
  // nachmittags sind nur Musikgarten (16 Uhr) und Bewegungslandschaft (15 Uhr): 6 von 8 bleiben
  await expect(sheet.getByRole("button", { name: "6 Angebote zeigen" })).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectMobileUx(page);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await sheet.getByRole("button", { name: "6 Angebote zeigen" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByRole("status")).toHaveText("6 Angebote");
  await expect(offers(page)).toHaveCount(6);
  await expect(offers(page).filter({ hasText: "Musikgarten" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Alle Filter, 1 aktiv" })).toBeVisible();
  // keine Tageszeit-Chips in der Chipzeile
  await expect(
    page.getByRole("group", { name: "Schnellfilter" }).getByRole("button", { name: "Vormittags" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await expect(page).toHaveURL(/\?tageszeit=vormittags&ansicht=karte$/);
  await mapSettled(page);
  await expect(page.getByRole("status")).toHaveText("6 Angebote");
  await expect(offers(page)).toHaveCount(6);
  await page.getByRole("button", { name: "Liste", exact: true }).click();
});

test("Geburtsdatum filtert nach Alter, ohne Zusatzzeile, bleibt lokal und steht nie in der URL", async ({ page }) => {
  // iOS-Zifferntastatur: ohne Punkte
  await setBirthDate(page, "01092026");
  await expect(offers(page)).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Kind und Einstellungen/ })).toContainText("1 Mon.");
  // Plan 0021, E3: Mit Altersfilter steht auf der Seite nichts zum Alter
  await expect(page.getByText(/passen nicht|passt nicht|Zeigt auch/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /trotzdem zeigen/i })).toHaveCount(0);
  expect(page.url()).not.toMatch(/2026-09-01|01092026|01\.09/);

  await page.reload();
  await expect(offers(page)).toHaveCount(4);
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await expect(page.getByLabel("Geburtsdatum")).toHaveValue("01.09.2026");
  await expect(page.getByText("Dein Kind ist heute 1 Monat alt.")).toBeVisible();
  // Der Schalter steht nicht mehr im Kind-Sheet (Plan 0021, E2)
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByText("Unpassende Angebote blendet der Filter aus.")).toBeVisible();
});

test.describe("Altersfilter im Filter-Sheet (Plan 0021)", () => {
  const ageSwitch = (page: Page) => page.getByRole("switch", { name: "Nur passend für 1 Mon." });
  const warn = (page: Page) => page.getByText("Zeigt auch 4 Angebote, die nicht zu 1 Mon. passen");
  const openFilter = async (page: Page) => {
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    return page.getByRole("dialog", { name: "Filter" });
  };
  const switchOff = async (page: Page) => {
    const sheet = await openFilter(page);
    await ageSwitch(page).click();
    await sheet.getByRole("button", { name: "8 Angebote zeigen" }).click();
  };

  test("ohne Geburtsdatum gibt es keinen Altersschalter", async ({ page }) => {
    const sheet = await openFilter(page);
    await expect(sheet.getByRole("heading", { name: "Art" })).toBeVisible();
    await expect(sheet.getByRole("switch")).toHaveCount(0);
  });

  test("abschalten zeigt alles markiert und warnt auf jedem Tab, „ausblenden“ schaltet zurück", async ({ page }) => {
    await setBirthDate(page, "01.09.2026");
    const sheet = await openFilter(page);
    await expect(ageSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect(ageSwitch(page)).toHaveAccessibleDescription("4 weitere passen nicht · geprüft zum Kursstart");
    await expect(sheet.getByRole("button", { name: "4 Angebote zeigen" })).toBeVisible();

    await ageSwitch(page).click();
    await expect(ageSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(ageSwitch(page)).toHaveAccessibleDescription("4 unpassende sind markiert · geprüft zum Kursstart");
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "8 Angebote zeigen" }).click();

    await expect(offers(page)).toHaveCount(8);
    await expect(page.locator(".card.unfit")).toHaveCount(4);
    await expect(page.locator(".card.unfit").first()).toContainText("Monate");
    await expect(warn(page)).toBeVisible();
    await expectAccessible(page);
    expect(page.url()).not.toMatch(/2026-09-01|01\.09|alter|passend/);

    // Der Zustand überlebt den Tab-Wechsel (bis Plan 0025 über den Tab „Kalender“)
    await page.getByRole("button", { name: "Anbieter", exact: true }).click();
    await expect(warn(page)).toBeVisible();
    // erst wenn die Anbieterkarte ruht: sonst laden Kacheln nach dem Tabwechsel ohne Karte im DOM (Plan 0055)
    await mapSettled(page);
    await page.getByRole("button", { name: "Angebote", exact: true }).click();

    await page.getByRole("button", { name: "ausblenden" }).click();
    await expect(offers(page)).toHaveCount(4);
    await expect(warn(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toBeFocused();
  });

  test("nach dem Neuladen, nach „Zurücksetzen“ und bei neuem Geburtsdatum ist der Filter wieder an", async ({
    page,
  }) => {
    await setBirthDate(page, "01.09.2026");
    await switchOff(page);
    await expect(warn(page)).toBeVisible();
    await page.reload();
    await expect(offers(page)).toHaveCount(4);
    await expect(warn(page)).toHaveCount(0);

    await switchOff(page);
    const sheet = await openFilter(page);
    await sheet.getByRole("button", { name: "Zurücksetzen" }).click();
    await expect(ageSwitch(page)).toHaveAttribute("aria-checked", "true");
    await sheet.getByRole("button", { name: "4 Angebote zeigen" }).click();
    await expect(warn(page)).toHaveCount(0);

    await switchOff(page);
    await setBirthDate(page, "01.08.2026");
    await expect(page.getByText(/^Zeigt auch/)).toHaveCount(0);
    await openFilter(page);
    await expect(page.getByRole("switch", { name: "Nur passend für 2 Mon." })).toHaveAttribute("aria-checked", "true");
  });

  test("Leerzustand nur durch das Alter: „Auch unpassende zeigen“ neben „Filter zurücksetzen“", async ({ page }) => {
    // „Bewegung“ hat nur die Bewegungslandschaft (24–36 Mon.)
    await page.goto("./?kat=bewegung");
    await setBirthDate(page, "01.09.2026");
    await expect(page.getByText("Mit diesen Filtern passt nichts zu 1 Mon.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter zurücksetzen" })).toBeVisible();
    await page.getByRole("button", { name: "Auch unpassende zeigen" }).click();
    await expect(offers(page)).toHaveCount(1);
    await expect(page.getByText("Zeigt auch 1 Angebot, das nicht zu 1 Mon. passt")).toBeVisible();
    await expect(page.getByRole("status")).toBeFocused();
  });

  // Den Kalender gibt es nur noch auf der Merkliste, und die ignoriert das Alter (Plan 0025, E8)
  test("passt gar nichts, bieten Liste und Anbieter „Auch unpassende zeigen“ (Karte: karte.spec)", async ({ page }) => {
    await setBirthDate(page, "01.01.2023");
    const show = page.getByRole("button", { name: "Auch unpassende zeigen" });

    await expect(page.getByText(/Nichts davon passt zu/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter zurücksetzen" })).toHaveCount(0);
    await expect(show).toBeVisible();

    await page.getByRole("button", { name: "Anbieter", exact: true }).click();
    await show.click();
    await expect(page.locator(".place:not(.idle)")).not.toHaveCount(0);
    await expect(page.getByRole("status")).toBeFocused();
    await mapSettled(page);
    // Der Altersfilter gilt für alle Tabs: zurück in „Angebote“ ist er weiter aus
    await page.getByRole("button", { name: "Angebote", exact: true }).click();
    await expect(offers(page)).toHaveCount(8);
    await expect(page.getByText(/^Zeigt auch 8 Angebote/)).toBeVisible();
  });
});

test("Kind-Sheet fokussiert das Geburtsdatum nur, solange es leer ist (Plan 0020, E3)", async ({
  page,
  browserName,
}) => {
  const kidButton = page.getByRole("button", { name: /^Kind und Einstellungen/ });
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await kidButton.click();
  // Ohne `autofocus` nimmt nur WebKit (iOS) beim showModal() das erste Feld, Chromium fokussiert es nicht.
  if (browserName === "webkit") await expect(sheet.getByLabel("Geburtsdatum")).toBeFocused();
  await sheet.getByLabel("Geburtsdatum").fill("01.09.2026");
  await sheet.getByRole("button", { name: "Fertig" }).click();

  // ausgefüllt: die Überschrift statt des Feldes (iOS öffnete sonst jedes Mal die Tastatur)
  await kidButton.click();
  await expect(sheet.getByRole("heading", { name: "Dein Zwerg" })).toBeFocused();
  await expect(sheet.getByLabel("Geburtsdatum")).not.toBeFocused();
  await sheet.getByRole("button", { name: "Fertig" }).click();

  // „Startpunkt wählen“ führt weiter zur Stadtteil-Auswahl, auch mit Geburtsdatum
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const filter = page.getByRole("dialog", { name: "Filter" });
  await filter.getByRole("button", { name: "Startpunkt wählen" }).click();
  await expect(sheet.getByLabel("Stadtteil", { exact: true })).toBeFocused();
  await expect(sheet.getByRole("heading", { name: "Dein Zwerg" })).not.toHaveAttribute("tabindex");
});

test("ungültiges Geburtsdatum wird erklärt und nicht gespeichert", async ({ page }) => {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await page.getByLabel("Geburtsdatum").fill("31.02.2026");
  await expect(page.getByText("Bitte als TT.MM.JJJJ eingeben")).toBeVisible();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(offers(page)).toHaveCount(8);
  await expect(page.getByRole("button", { name: /^Kind und Einstellungen/ })).toContainText("Alter?");
});

/**
 * Eine Kategorie je Angebot (Plan 0037, E9, E11; ersetzt Plan 0014): Etikett, Farbe und Form kommen nur aus
 * `category`, der Filter wirkt nur auf sie und ändert kein Etikett.
 */
test.describe("Eine Kategorie je Angebot (Plan 0037)", () => {
  const pill = (page: Page, title: string) => offers(page).filter({ hasText: title }).locator(".pill");

  /** `site.json` aus dem Netz, vor dem Ausliefern umgeschrieben; die Seite bleibt Black-Box (wie `saveCopies`). */
  async function rewriteSite(page: Page, change: (offers: Array<Record<string, unknown>>) => void) {
    await page.route("**/data/site.json", async (route) => {
      const response = await route.fetch();
      const site = (await response.json()) as { offers: Array<Record<string, unknown>> };
      change(site.offers);
      await route.fulfill({ response, json: site });
    });
  }

  test("a) ohne Filter trägt das Babykonzert seine Hauptkategorie, im Detail ebenso", async ({ page }) => {
    await expect(pill(page, "Babykonzert im Advent")).toHaveText("Bühne & Konzert");
    await offers(page).filter({ hasText: "Babykonzert im Advent" }).getByRole("heading").getByRole("button").click();
    const detail = page.getByRole("dialog", { name: "Babykonzert im Advent" });
    await expect(detail.locator(".catname")).toHaveText("Bühne & Konzert");
  });

  test("b) ?kat=musik zeigt nur Angebote mit Hauptkategorie Musik", async ({ page }) => {
    await page.goto("./?kat=musik");
    await expect(offers(page).filter({ hasText: "Musikgarten 1" })).toHaveCount(1);
    await expect(offers(page).filter({ hasText: "Babykonzert im Advent" })).toHaveCount(0);
    await expect(offers(page).filter({ hasText: "Krabbelreime & Fingerspiele" })).toHaveCount(0);
    for (const label of await offers(page).locator(".pill").allTextContents()) expect(label).toBe("Musik & Singen");
  });

  test("c) ?kat=buecher: „Krabbelreime & Fingerspiele“ trägt „Bücher & Vorlesen“, hell und dunkel", async ({
    page,
  }) => {
    await page.goto("./?kat=buecher");
    await expect(pill(page, "Krabbelreime & Fingerspiele")).toHaveText("Bücher & Vorlesen");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectMobileUx(page);
    }
  });

  test("d1) ?kat=treffs-cafes: der Krabbeltreff fällt heraus, Leerzustand", async ({ page }) => {
    // Das einzige Treffs-Angebot der Fixtures (Elterncafé, 9–10 Uhr) ist zur Fixture-Uhr (12 Uhr) vorbei.
    await page.goto("./?kat=treffs-cafes");
    await expect(page.getByText("Diese Seite ist noch leer")).toBeVisible();
    await expect(page.getByText("Mit diesen Filtern gibt es keine Angebote.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter zurücksetzen" })).toBeVisible();
    await expect(offers(page)).toHaveCount(0);
  });

  test("d2) Pille „Treffs & Cafés“ unter den Gates, hell und dunkel", { tag: OWN_START }, async ({ page }) => {
    // Plan 0014, Review, Finding 3: Diese Pille gibt es auf den Fixtures sonst nicht mehr.
    await rewriteSite(page, (list) => {
      const treff = list.find((o) => o["title"] === "Offener Krabbeltreff");
      if (!treff) throw new Error("Krabbeltreff fehlt in den Fixture-Daten");
      treff["category"] = "treffs-cafes";
    });
    await page.goto("./?kat=treffs-cafes");
    await expect(pill(page, "Offener Krabbeltreff")).toHaveText("Treffs & Cafés");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectMobileUx(page);
    }
  });

  // Seit Plan 0025 (E8) im Kalender der Merkliste; der Filter ändert die Form nicht (Plan 0037, E11)
  for (const search of ["", "kat=musik&"]) {
    test(`e) Kalender ${search ? "mit ?kat=musik" : "ohne Filter"}: der Punkt trägt die Hauptkategorie`, async ({
      page,
    }) => {
      await page.addInitScript(() => localStorage.setItem("zwergenplan.merkliste", JSON.stringify(["kovtez0z"])));
      await page.goto(`./?${search}ansicht=merkliste-kalender`);
      await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
      await page.getByRole("button", { name: "Nächster Monat" }).click();
      await page.getByRole("button", { name: "Nächster Monat" }).click();
      const day = page.getByRole("button", { name: /^Sonntag, 6\. Dezember, 1 Termin$/ });
      await expect(day.locator("span.k-buehne")).toHaveCount(1);
      await expect(day.locator("span.k-musik")).toHaveCount(0);
    });
  }

  test("site.json ohne category (alter Cache): Rückfall aus den Themen, ohne Fehler", { tag: OWN_START }, async ({
    page,
  }) => {
    // Übergang Plan 0037 (E13, Test 17): adoptSite füllt category; entfällt in Stufe C
    await rewriteSite(page, (list) => {
      for (const offer of list) delete offer["category"];
    });
    await page.goto("./");
    await expect(pill(page, "Babykonzert im Advent")).toHaveText("Musik & Singen");
    await page.goto("./?kat=musik");
    await expect(offers(page).filter({ hasText: "Babykonzert im Advent" })).toHaveCount(1);
  });
});

/** Alte Links auf den entfallenen Tab „Kalender“ landen in „Angebote“, die URL wird kanonisch (Plan 0025, E8, Test 13) */
test.describe("alte URL ?ansicht=kalender", () => {
  const tabBar = (page: Page) => page.getByRole("navigation", { name: "Hauptnavigation" });

  test("mit Kategorie: URL ohne ansicht=, Tab „Angebote“, Musik-Filter aktiv", async ({ page }) => {
    await page.goto("./?ansicht=kalender&kat=musik");
    await expect(page).toHaveURL((url) => url.search === "?kat=musik");
    await expect(tabBar(page).getByRole("button", { name: /^Angebote/ })).toHaveAttribute("aria-current", "page");
    const musik = page.getByRole("group", { name: "Kategorien" }).getByRole("button", { name: /^Musik/ });
    await expect(musik).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toHaveCount(0);
  });

  test("mit Anbieter: das Sheet öffnet über „Angebote“", async ({ page }) => {
    await page.goto("./?ansicht=kalender&anbieter=fv3fpfp2");
    await expect(page.getByRole("dialog", { name: "Anbieter" })).toBeVisible();
    await expect(page).toHaveURL((url) => url.search === "?anbieter=fv3fpfp2");
    await page.keyboard.press("Escape");
    await expect(tabBar(page).getByRole("button", { name: /^Angebote/ })).toHaveAttribute("aria-current", "page");
  });

  // ersetzt e2e/zeitraum.spec.ts „der Kalender zeigt die gefilterten Angebote …“ (Plan 0023, E8)
  test("mit Zeitraum: „Angebote“ mit Zeitraum, die URL behält von=", async ({ page }) => {
    await page.goto("./?von=2026-11-06&ansicht=kalender");
    await expect(page).toHaveURL((url) => url.search === "?von=2026-11-06");
    await expect(page.getByRole("status")).toContainText("4 Angebote ab");
    await expect(offers(page).filter({ hasText: "Krabbelreime & Fingerspiele" })).toHaveCount(1);
  });
});

test("Leerzustand bei Filtern ohne Treffer, Zurücksetzen hilft", async ({ page }) => {
  await page.goto("./?kat=wasser");
  await expect(page.getByText("Diese Seite ist noch leer")).toBeVisible();
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(offers(page)).toHaveCount(8);
});

test("site.json wird genau einmal geladen (Plan 0008, E4)", { tag: OWN_START }, async ({ page }) => {
  // Frühstart in index.html statt Preload: WebKit nutzte den Preload nicht und lud ein zweites Mal.
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/data/site.json")) requests.push(request.url());
  });
  await page.goto("./");
  await expect(offers(page).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(requests).toHaveLength(1);
});

test.describe("Fehlerzustand (Plan 0008, E5)", () => {
  // Der abgebrochene bzw. fehlgeschlagene Request meldet sich in beiden Engines in der Konsole.
  test.use({ allowedConsoleErrors: [/\/data\/site\.json\b/] });

  test("eigener Text statt Browsertext, danach lädt „Nochmal versuchen“", { tag: OWN_START }, async ({ page }) => {
    await page.route("**/data/site.json", (route) => route.abort());
    await page.goto("./");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Das hat nicht geklappt");
    await expect(alert).toContainText("Die Verbindung ist abgebrochen.");
    await expect(alert).not.toContainText(/fetch|load failed/i);
    await expectMobileUx(page);

    await page.unroute("**/data/site.json");
    await alert.getByRole("button", { name: "Nochmal versuchen" }).click();
    // lädt neu, statt die gescheiterte frühe Anfrage noch einmal zu übernehmen
    await expect(offers(page)).toHaveCount(8);
    await expect(alert).toHaveCount(0);
  });

  test("Serverfehler", { tag: OWN_START }, async ({ page }) => {
    await page.route("**/data/site.json", (route) => route.fulfill({ status: 503, body: "" }));
    await page.goto("./");
    await expect(page.getByRole("alert")).toContainText("Die Angebote ließen sich gerade nicht laden.");
    await expect(page.getByRole("alert")).not.toContainText("HTTP");
  });
});
