/**
 * Kalender der Merkliste (Plan 0025, E5, Test 10; ersetzt e2e/calendar.spec.ts aus Plan 0003, E14 und Plan 0007, E2,
 * E5). Fixtures, Uhr Mo 5.10.2026 12:00, sonst vor dem Laden per `page.clock.setFixedTime`. Die Merkliste steht vor
 * dem Laden im localStorage. Gemerkt sind, wenn nicht anders gesagt:
 * - „Offener Krabbeltreff“, Mi 7.10. 10:00–11:30, dann wöchentlich bis Mi 4.11. (regelmäßig),
 * - „PEKiP-Gruppe Herbst“, Di 13.10. 9:30, dann wöchentlich bis Di 1.12. (Kurs).
 * Der letzte Termin im ganzen Datenstand ist Do 10.12. (Musikgarten).
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { expectAccessible, expectMobileUx, expectTextFits, setTextScaleRelayout } from "./mobile-ux.ts";

const IDS = {
  treff: "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus",
  pekip:
    "familientreff-beispiel--pekip-gruppe-herbst-babys-geb-juni-aug-2026-20261013t0930--familientreff-beispiel-haus",
  elterncafe: "familientreff-beispiel--elterncafe-am-montag-20261005t0900--familientreff-beispiel-haus",
};
const PEKIP = "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)";
const ALL_OVER = "Für heute ist alles vorbei";

/** Merkliste vorbelegen, optional die Uhr stellen, dann den Kalender der Merkliste öffnen. */
async function openCalendar(
  page: Page,
  { ids = [IDS.treff, IDS.pekip], at, birthDate }: { ids?: string[]; at?: Date; birthDate?: string } = {},
) {
  if (at) await page.clock.setFixedTime(at);
  await page.addInitScript(
    ([saved, born]) => {
      localStorage.setItem("zwergenplan.merkliste", saved);
      if (born) localStorage.setItem("zwergenplan.geburtsdatum", born);
    },
    [JSON.stringify(ids), birthDate ?? ""] as const,
  );
  await page.goto("./?ansicht=merkliste-kalender");
  await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
}

/** Überschrift der Liste samt Zahl („Diese Woche“ / „1 Termin“) */
async function expectAgenda(page: Page, title: string | RegExp, count: string) {
  const heading = page.locator("h2.daylabel");
  await expect(heading.locator("span")).toHaveText(title);
  await expect(heading.locator("small")).toHaveText(count);
}

const titleButton = (page: Page, text: string) => page.getByRole("button", { name: new RegExp(`^${text} · `) });
const offers = (page: Page) => page.getByTestId("offer");

test.describe("mit Fixture-Uhr", () => {
  test.beforeEach(async ({ page }) => {
    await openCalendar(page);
  });

  test("startet mit dieser Woche: Titelknopf gewählt, die Liste zeigt die Woche", async ({ page }) => {
    const week = titleButton(page, "5\\.–11\\. Okt\\.");
    // WCAG 2.5.3: Der sichtbare Text steht am Anfang des Namens, der Zusatz nur für Screenreader
    await expect(week).toHaveAccessibleName("5.–11. Okt. · ganze Woche, 1 Termin");
    await expect(week).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Vorherige Woche" })).toBeDisabled();
    await expectAgenda(page, "Diese Woche", "1 Termin");
    await expect(page.locator("h2.daylabel")).toHaveAttribute("aria-live", "polite");
    await expect(page.getByRole("heading", { level: 3, name: "Mi 7.10." })).toBeVisible();
    await expect(offers(page)).toHaveCount(1);
    await expect(offers(page)).toContainText("Offener Krabbeltreff");
    // Je Tag zählen Termine, nicht Angebote; kein Tag ist gewählt
    await expect(page.getByRole("button", { name: "Mittwoch, 7. Oktober, 1 Termin" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByRole("button", { name: "Montag, 5. Oktober, 0 Termine" })).toBeVisible();
  });

  test("Tipp auf einen Tag wählt ihn, ein zweiter Tipp ändert nichts, der Wochentitel führt zurück", async ({
    page,
  }) => {
    const wednesday = page.getByRole("button", { name: "Mittwoch, 7. Oktober, 1 Termin" });
    await wednesday.click();
    await expect(wednesday).toHaveAttribute("aria-pressed", "true");
    await expectAgenda(page, "Mittwoch, 7. Oktober", "1 Termin");
    await expect(titleButton(page, "5\\.–11\\. Okt\\.")).toHaveAttribute("aria-pressed", "false");
    // beim Tag keine Tagesüberschrift über den Karten
    await expect(page.locator("h3.dayh")).toHaveCount(0);
    await expect(offers(page)).toHaveCount(1);

    await wednesday.click();
    await expect(wednesday).toHaveAttribute("aria-pressed", "true");
    await expectAgenda(page, "Mittwoch, 7. Oktober", "1 Termin");

    await titleButton(page, "5\\.–11\\. Okt\\.").click();
    await expect(titleButton(page, "5\\.–11\\. Okt\\.")).toHaveAttribute("aria-pressed", "true");
    await expect(wednesday).toHaveAttribute("aria-pressed", "false");
    await expectAgenda(page, "Diese Woche", "1 Termin");
  });

  test("Tag ohne Gemerktes: „Nichts gemerkt“ mit dem Weg zu „Angebote“; nicht Gemerktes erscheint nie", async ({
    page,
  }) => {
    // Fr 9.10.: „Krabbelreime & Fingerspiele“ ist im Datenstand, aber nicht gemerkt
    await page.getByRole("button", { name: "Freitag, 9. Oktober, 0 Termine" }).click();
    await expectAgenda(page, "Freitag, 9. Oktober", "0 Termine");
    await expect(page.getByText("Nichts gemerkt", { exact: true })).toBeVisible();
    await expect(page.getByText("Für diesen Tag hast du nichts gemerkt.")).toBeVisible();
    await expect(page.getByText("Krabbelreime")).toHaveCount(0);
    await expect(offers(page)).toHaveCount(0);
    await expectMobileUx(page);

    await page.getByRole("button", { name: "Für diesen Tag entdecken" }).click();
    await expect(page).toHaveURL(/\?von=2026-10-09&bis=2026-10-09$/);
    await expect(
      page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: /^Angebote/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(offers(page).filter({ hasText: "Krabbelreime" })).toHaveCount(1);
  });

  test("blättert wochenweise: die ganze neue Woche, nach Tag gruppiert", async ({ page }) => {
    await page.getByRole("button", { name: "Mittwoch, 7. Oktober, 1 Termin" }).click();
    await page.getByRole("button", { name: "Nächste Woche" }).click();
    // Blättern zeigt immer die ganze Woche, auch wenn vorher ein Tag gewählt war
    await expect(titleButton(page, "12\\.–18\\. Okt\\.")).toHaveAttribute("aria-pressed", "true");
    await expectAgenda(page, "Woche 12.–18. Okt.", "2 Termine");
    await expect(page.locator("h3.dayh")).toHaveText(["Di 13.10.", "Mi 14.10."]);
    await expect(offers(page)).toHaveCount(2);
    await expect(offers(page).first()).toContainText(PEKIP);
    await expect(offers(page).last()).toContainText("Offener Krabbeltreff");

    await page.getByRole("button", { name: "Vorherige Woche" }).click();
    await expectAgenda(page, "Diese Woche", "1 Termin");
  });

  test("Monat: Titel wählt den Monat, Tipp auf einen Tag lässt das Raster offen, Zuklappen zeigt die Woche", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    const close = page.getByRole("button", { name: "Monat zuklappen" });
    await expect(close).toHaveAttribute("aria-expanded", "true");
    const month = titleButton(page, "Oktober 2026");
    await expect(month).toHaveAccessibleName("Oktober 2026 · ganzer Monat, 7 Termine");
    await expect(month).toHaveAttribute("aria-pressed", "true");
    await expectAgenda(page, "Oktober 2026", "7 Termine");
    await expect(page.getByRole("button", { name: "Nächste Woche" })).toHaveCount(0);

    const day20 = page.getByRole("button", { name: "Dienstag, 20. Oktober, 1 Termin" });
    await day20.click();
    await expect(day20).toHaveAttribute("aria-pressed", "true");
    await expect(close).toHaveAttribute("aria-expanded", "true");
    await expect(month).toHaveAttribute("aria-pressed", "false");
    await expectAgenda(page, "Dienstag, 20. Oktober", "1 Termin");
    // Das offene Raster schob die Liste unter den Falz: Die Überschrift ist nach dem Tipp im Bild (Review M3).
    await expect(page.locator("h2.daylabel")).toBeInViewport();
    await expect(offers(page)).toContainText(PEKIP);
    await expectMobileUx(page);

    await month.click();
    await expect(month).toHaveAttribute("aria-pressed", "true");
    await expectAgenda(page, "Oktober 2026", "7 Termine");

    await close.click();
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toHaveAttribute("aria-expanded", "false");
    // die Woche um den Anker (20.10.)
    await expect(titleButton(page, "19\\.–25\\. Okt\\.")).toHaveAttribute("aria-pressed", "true");
    await expectAgenda(page, "Woche 19.–25. Okt.", "2 Termine");
  });

  test("Monat blättert bis zum Ende des Datenstands, nicht des Gemerkten", async ({ page }) => {
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await expect(titleButton(page, "Dezember 2026")).toHaveAttribute("aria-pressed", "true");
    await expectAgenda(page, "Dezember 2026", "1 Termin");
    // letzter Termin der Fixtures: 10.12. → kein Januar
    await expect(page.getByRole("button", { name: "Nächster Monat" })).toBeDisabled();
    await page.getByRole("button", { name: "Vorheriger Monat" }).click();
    // PEKiP 3., 10., 17., 24., Treff 4.11.
    await expectAgenda(page, "November 2026", "5 Termine");
  });

  test("leere Woche: „Für diese Woche entdecken“ führt zu „Angebote“ mit dieser Woche als Zeitraum", async ({
    page,
  }) => {
    // Dezember, zuklappen (Woche 30.11.–6.12. mit PEKiP am 1.12.), eine Woche weiter
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Monat zuklappen" }).click();
    await expectAgenda(page, "Woche 30. Nov. – 6. Dez.", "1 Termin");
    await page.getByRole("button", { name: "Nächste Woche" }).click();
    await expectAgenda(page, "Woche 7.–13. Dez.", "0 Termine");
    await expect(page.getByText("Für diese Woche hast du nichts gemerkt.")).toBeVisible();
    // Der Datenstand reicht bis 10.12.: Weiter geht es nicht
    await expect(page.getByRole("button", { name: "Nächste Woche" })).toBeDisabled();
    await expectMobileUx(page);

    await page.getByRole("button", { name: "Für diese Woche entdecken" }).click();
    await expect(page).toHaveURL(/\?von=2026-12-07&bis=2026-12-13$/);
    await expect(
      page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: /^Angebote/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("nach dem letzten Termin nennt die Liste den Datenhorizont (B8)", async ({ page }) => {
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Freitag, 11. Dezember, 0 Termine" }).click();
    await expectAgenda(page, "Freitag, 11. Dezember", "0 Termine");
    await expect(page.getByText("Weiter reicht der Plan noch nicht")).toBeVisible();
    await expect(page.getByText(/Termine sind bis Donnerstag, 10\. Dezember eingetragen/)).toBeVisible();
    await expect(page.getByText("Nichts gemerkt", { exact: true })).toHaveCount(0);
    // Der Leerzustand läuft durch Text-Gate und axe, hell und dunkel (Arch-Review zu Plan 0007, m4) …
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectTextFits(page);
      await expectAccessible(page);
    }
    // … und bei 320 px/200 %: „Dezember“ ist der längste Monatsname in der Monats-Navigation.
    await page.setViewportSize({ width: 320, height: 640 });
    await setTextScaleRelayout(page, 2);
    await expectTextFits(page, { scale: 2 });
  });

  test("offener Monat blendet die Woche aus, der Knopf behält den Fokus (Plan 0007, E5, H2)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Nächste Woche" })).toBeVisible();
    // Per Tastatur: Ein Mausklick fokussiert Knöpfe in WebKit nicht, Enter schon.
    const open = page.getByRole("button", { name: "Ganzen Monat zeigen" });
    await open.focus();
    await page.keyboard.press("Enter");

    const close = page.getByRole("button", { name: "Monat zuklappen" });
    await expect(close).toHaveAttribute("aria-expanded", "true");
    await expect(close).toBeFocused();
    await expect(page.getByRole("button", { name: "Vorherige Woche" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nächste Woche" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nächster Monat" })).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await expect(open).toBeFocused();
    await expect(page.getByRole("button", { name: "Nächste Woche" })).toBeVisible();
    await expect(titleButton(page, "5\\.–11\\. Okt\\.")).toHaveAttribute("aria-pressed", "true");
  });

  test("das Detail nimmt den Termin des Tages, auf dem die Karte steht", async ({ page }) => {
    await page.getByRole("button", { name: "Nächste Woche" }).click();
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Nur Mi 14.10." })).toBeVisible();
  });

  test("der Zeitraum der Startseite gilt im Kalender nicht (E5)", async ({ page }) => {
    await page.goto("./?von=2026-11-06&ansicht=merkliste-kalender");
    await expect(page).toHaveURL(/\?von=2026-11-06&ansicht=merkliste-kalender$/);
    await expectAgenda(page, "Diese Woche", "1 Termin");
    await expect(offers(page)).toContainText("Offener Krabbeltreff");
  });

  test("Auswahl und Monat überstehen den Wechsel der Darstellung, nicht das Neuladen", async ({ page }) => {
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await page.getByRole("button", { name: "Dienstag, 20. Oktober, 1 Termin" }).click();
    const views = page.getByRole("group", { name: "Darstellung der Merkliste" });
    await views.getByRole("button", { name: "Liste", exact: true }).click();
    await expect(offers(page)).toHaveCount(2);
    await views.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(page.getByRole("button", { name: "Monat zuklappen" })).toBeVisible();
    await expectAgenda(page, "Dienstag, 20. Oktober", "1 Termin");

    await page.reload();
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
    await expectAgenda(page, "Diese Woche", "1 Termin");
  });

  test("Merklisten-Filter: „Kurse“ blendet den Treff aus, die leere Woche sagt es und setzt zurück (E5, E6)", async ({
    page,
  }) => {
    const filters = page.getByRole("group", { name: "Merkliste filtern" });
    await filters.getByRole("button", { name: "Kurse", exact: true }).click();
    // Die Statuszeile zählt die passenden gemerkten Angebote, ohne Zeitraum
    await expect(page.getByRole("status")).toHaveText("1 von 2 gemerkten Angeboten passt");
    // Woche 5.–11.: nur der Treff, und den blendet der Filter aus (Fall 1)
    await expectAgenda(page, "Diese Woche", "0 Termine");
    await expect(page.getByText("Nichts, was zu deinem Filter passt")).toBeVisible();
    await expect(page.getByText("1 gemerkter Termin blendet der Filter aus.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mittwoch, 7. Oktober, 0 Termine" })).toBeVisible();
    await expectMobileUx(page);

    // Woche 12.–18.: PEKiP am Di, der Treff am Mi fehlt
    await page.getByRole("button", { name: "Nächste Woche" }).click();
    await expectAgenda(page, "Woche 12.–18. Okt.", "1 Termin");
    await expect(offers(page)).toHaveCount(1);
    await expect(offers(page)).toContainText(PEKIP);

    await page.getByRole("button", { name: "Vorherige Woche" }).click();
    const reset = page.getByRole("button", { name: "Filter zurücksetzen" });
    await reset.click();
    // Der Knopf verschwindet: Der Fokus liegt auf der Statuszeile, nicht auf <body>
    await expect(page.getByRole("status")).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("2 Angebote mit insgesamt 13 Terminen gemerkt");
    await expectAgenda(page, "Diese Woche", "1 Termin");
    await expect(filters.getByRole("button", { name: "Kurse", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("Schnellwahl „ab …“: im Kalender ausgeblendet und ohne Wirkung, in der Liste gilt sie wieder (E5, E7)", async ({
    page,
  }) => {
    const filters = page.getByRole("group", { name: "Merkliste filtern" });
    const views = page.getByRole("group", { name: "Darstellung der Merkliste" });
    await expect(filters.getByRole("button", { name: /^ab / })).toHaveCount(0);
    await views.getByRole("button", { name: "Liste", exact: true }).click();
    await filters.getByRole("button", { name: "ab Nov.", exact: true }).click();
    // PEKiP beginnt im Oktober (Kurs-Regel), der Treff hat noch Termine im November
    await expect(offers(page)).toHaveCount(1);
    await expect(page.getByRole("status")).toHaveText("1 von 2 gemerkten Angeboten passt");

    await views.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(filters.getByRole("button", { name: /^ab / })).toHaveCount(0);
    // Kein „Zurücksetzen“: Im Kalender wirkt kein Filter, die Statuszeile zählt wie ohne
    await expect(filters.getByRole("button", { name: "Zurücksetzen" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("2 Angebote mit insgesamt 13 Terminen gemerkt");
    await expectAgenda(page, "Diese Woche", "1 Termin");

    await views.getByRole("button", { name: "Liste", exact: true }).click();
    await expect(filters.getByRole("button", { name: "ab Nov.", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(offers(page)).toHaveCount(1);
  });
});

test("regelmäßig gemerkt, Kind wächst erst hinein: nur Tage, an denen es zum Alter passt (Plan 0028, E3)", async ({
  page,
}) => {
  // Treff 6–24 Monate; geboren am 20.4.: am 7.10. und 14.10. 5 Monate, ab 21.10. 6
  await openCalendar(page, { ids: [IDS.treff], birthDate: "2026-04-20" });
  await expect(page.getByRole("button", { name: "Mittwoch, 7. Oktober, 0 Termine" })).toBeVisible();
  await expect(offers(page)).toHaveCount(0);
  // Gemerkt ist etwas, nur passt es nicht zum Alter: kein „Nichts gemerkt“ (Browser-Review 0025)
  await expect(page.getByText("Nichts passt zum Alter", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Für diese Woche hast du nur Termine gemerkt, die nicht zum Alter passen."),
  ).toBeVisible();
  await expect(page.getByText("Nichts gemerkt", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Nächste Woche" }).click();
  await expect(page.getByRole("button", { name: "Mittwoch, 14. Oktober, 0 Termine" })).toBeVisible();
  await page.getByRole("button", { name: "Nächste Woche" }).click();
  await expect(page.getByRole("button", { name: "Mittwoch, 21. Oktober, 1 Termin" })).toBeVisible();
  await expectAgenda(page, "Woche 19.–25. Okt.", "1 Termin");
  await expect(offers(page)).toContainText("Offener Krabbeltreff");
});

test.describe("„Heute“ hängt an „jetzt“ (B2)", () => {
  const WED_11 = new Date("2026-10-07T11:00:00+02:00");
  const WED_1131 = new Date("2026-10-07T11:31:00+02:00");

  test("heute schon vorbei: gemerkt ohne kommenden Termin zählt mit (M7)", async ({ page }) => {
    // Das Elterncafé (9–10 Uhr) ist um 12 Uhr vorbei und steht gar nicht im Index.
    await openCalendar(page, { ids: [IDS.elterncafe, IDS.treff] });
    const monday = page.getByRole("button", { name: "Montag, 5. Oktober, 0 Termine" });
    await monday.click();
    await expect(monday).toHaveAttribute("aria-pressed", "true");
    await expectAgenda(page, "Heute, 5. Oktober", "0 Termine");
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    await expect(page.getByText("Nichts gemerkt", { exact: true })).toHaveCount(0);
  });

  test("abends fehlen beendete Termine, in der Woche wie am Tag", async ({ page }) => {
    await openCalendar(page, { ids: [IDS.treff], at: new Date("2026-10-07T20:00:00+02:00") });
    // Woche ab heute (Mi): Der Treff ist vorbei, sonst nichts gemerkt
    await expectAgenda(page, "Diese Woche", "0 Termine");
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    await page.getByRole("button", { name: "Mittwoch, 7. Oktober, 0 Termine" }).click();
    await expectAgenda(page, "Heute, 7. Oktober", "0 Termine");
    await expect(offers(page)).toHaveCount(0);
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    // vergangene Tage gesperrt, künftige nicht
    await expect(page.getByRole("button", { name: "Dienstag, 6. Oktober, 0 Termine" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Donnerstag, 8. Oktober, 0 Termine" })).toBeEnabled();
  });

  test("ein laufender Termin bleibt", async ({ page }) => {
    await openCalendar(page, { ids: [IDS.treff], at: WED_11 });
    await expectAgenda(page, "Diese Woche", "1 Termin");
    await expect(offers(page)).toContainText("Offener Krabbeltreff");
    await expect(page.getByRole("button", { name: "Mittwoch, 7. Oktober, 1 Termin" })).toBeVisible();
  });

  test("„jetzt“ wird ohne Neuladen erneuert (Timer)", async ({ page }) => {
    await openCalendar(page, { ids: [IDS.treff], at: WED_11 });
    await expect(offers(page)).toContainText("Offener Krabbeltreff");
    // Timer anhalten (gleicher Zeitpunkt, sonst „Cannot fast-forward to the past“), dann die Uhr
    // nach dem Ende des Termins stellen und den 30-s-Timer von useNow auslösen.
    await page.clock.pauseAt(WED_11);
    await page.clock.setFixedTime(WED_1131);
    await page.clock.runFor(60_000);
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    await expect(offers(page)).toHaveCount(0);
    await expectAgenda(page, "Diese Woche", "0 Termine");
  });

  test("„jetzt“ wird beim Zurückkehren erneuert (visibilitychange)", async ({ page }) => {
    await openCalendar(page, { ids: [IDS.treff], at: WED_11 });
    await expect(offers(page)).toContainText("Offener Krabbeltreff");
    // Uhr anhalten, damit kein Intervall dazwischenfunkt: Nur das Ereignis darf „jetzt“ erneuern.
    await page.clock.pauseAt(WED_11);
    await page.clock.setFixedTime(WED_1131);
    await expect(offers(page)).toHaveCount(1);
    expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    await expect(offers(page)).toHaveCount(0);
  });

  test("Tageswechsel im offenen Tab: Der gewählte Tag rückt auf heute", async ({ page }) => {
    const beforeMidnight = new Date("2026-10-07T23:59:40+02:00");
    await openCalendar(page, { at: beforeMidnight });
    await page.getByRole("button", { name: /^Mittwoch, 7\. Oktober, / }).click();
    await expectAgenda(page, "Heute, 7. Oktober", "0 Termine");
    await page.clock.pauseAt(beforeMidnight);
    await page.clock.setFixedTime(new Date("2026-10-08T00:00:10+02:00"));
    await page.clock.runFor(30_000);
    await expectAgenda(page, "Heute, 8. Oktober", "0 Termine");
    await expect(page.getByRole("button", { name: /^Mittwoch, 7\. Oktober, / })).toBeDisabled();
    // Der gewählte Tag (7.10.) wäre jetzt gesperrt: clampDay setzt ihn auf heute.
    await expect(page.getByRole("button", { name: /^Donnerstag, 8\. Oktober, / })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
