/** Entdecken: Liste nach Tagen, Filter, Alter (Plan 0003, E7–E11, E16). Fixtures, Uhr Mo 5.10.2026 12:00. */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { expectAccessible, expectMobileUx } from "./mobile-ux.ts";

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
  await expect(page.getByRole("status")).toHaveText("8 Angebote ab heute");
  await expect(page.getByText("Datenstand:")).toBeVisible();
});

test("ist für Suchmaschinen gesperrt und liegt im Wurzelpfad", async ({ page }) => {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(new URL(page.url()).pathname).toBe("/");
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

    // Der Zustand überlebt den Tab-Wechsel
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(warn(page)).toBeVisible();
    await page.getByRole("button", { name: "Entdecken", exact: true }).click();

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

  test("passt gar nichts, bieten Liste, Anbieter und Kalender „Auch unpassende zeigen“ (Karte: karte.spec)", async ({
    page,
  }) => {
    await setBirthDate(page, "01.01.2023");
    const show = page.getByRole("button", { name: "Auch unpassende zeigen" });

    await expect(page.getByText(/Nichts davon passt zu/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter zurücksetzen" })).toHaveCount(0);
    await expect(show).toBeVisible();

    await page.getByRole("button", { name: "Anbieter", exact: true }).click();
    await show.click();
    await expect(page.locator(".place:not(.idle)")).not.toHaveCount(0);
    await expect(page.getByRole("status")).toBeFocused();
    // wieder an für den Kalender: Der Altersfilter gilt für alle Tabs
    await page.getByRole("button", { name: "ausblenden" }).click();

    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Mittwoch, 7. Oktober, 0 Angebote" }).click();
    await show.click();
    await expect(offers(page)).toHaveCount(1);
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

test.describe("Kategorie-Etikett folgt dem Filter (Plan 0014)", () => {
  const pill = (page: Page, title: string) => offers(page).filter({ hasText: title }).locator(".pill");

  test("ohne Filter die erste Kategorie, mit Filter die gewählte, auch im Detail", async ({ page }) => {
    await expect(pill(page, "Babykonzert im Advent")).toHaveText("Musik & Singen");

    await page.goto("./?kat=buehne");
    await expect(pill(page, "Babykonzert im Advent")).toHaveText("Bühne & Konzert");
    await offers(page).filter({ hasText: "Babykonzert im Advent" }).getByRole("heading").getByRole("button").click();
    const detail = page.getByRole("dialog", { name: "Babykonzert im Advent" });
    await expect(detail.locator(".catname")).toHaveText("Bühne & Konzert");
  });

  for (const [kat, title, label] of [
    ["buecher", "Krabbelreime & Fingerspiele", "Bücher & Vorlesen"],
    ["treffs-cafes", "Offener Krabbeltreff", "Treffs & Cafés"],
  ] as const) {
    test(`?kat=${kat}: „${title}“ trägt „${label}“, die Pille passt hell und dunkel`, async ({ page }) => {
      await page.goto(`./?kat=${kat}`);
      await expect(pill(page, title)).toHaveText(label);
      // Diese Pille erscheint auf Fixture-Kacheln erst mit Plan 0014 (Review, Finding 3).
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expectMobileUx(page);
      }
    });
  }

  test("Kalender: der Punkt im Monatsraster trägt die gewählte Kategorie", async ({ page }) => {
    await page.goto("./?kat=buehne");
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    const day = page.getByRole("button", { name: /^Sonntag, 6\. Dezember, 1 Angebot$/ });
    await expect(day.locator("span.k-buehne")).toHaveCount(1);
    await expect(day.locator("span.k-musik")).toHaveCount(0);
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
