/**
 * Kalender (Plan 0003, E14; Plan 0007, E2, E5). Fixtures, Uhr Mo 5.10.2026 12:00, sonst vor dem
 * Laden per `page.clock.setFixedTime`. Fixture-Termine: Mo 5.10. Elterncafé 9–10 Uhr (einmalig),
 * Mi 7.10. „Offener Krabbeltreff“ 10:00–11:30 (wöchentlich), letzter Termin Do 10.12.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { expectAccessible, expectMobileUx, expectTextFits, setTextScale } from "./mobile-ux.ts";

async function openCalendar(page: Page, at?: Date) {
  if (at) await page.clock.setFixedTime(at);
  await page.goto("./");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(page).toHaveURL(/ansicht=kalender/);
}

/** Überschrift der Agenda samt Zahl („Heute, 7. Oktober“ / „0 Angebote“) */
async function expectAgenda(page: Page, title: RegExp, count: string) {
  const heading = page.getByRole("heading", { level: 2, name: title });
  await expect(heading).toBeVisible();
  await expect(heading.locator("small")).toHaveText(count);
}

const ALL_OVER = "Für heute ist alles vorbei";

test.describe("mit Fixture-Uhr", () => {
  test.beforeEach(async ({ page }) => {
    await openCalendar(page);
  });

  test("Woche mit Angeboten je Tag, Agenda des gewählten Tages", async ({ page }) => {
    await expect(page.getByText("5.–11. Oktober")).toBeVisible();
    await expect(page.getByRole("button", { name: "Vorherige Woche" })).toBeDisabled();
    await expect(page.getByRole("heading", { level: 2, name: /Heute, 5\. Oktober/ })).toBeVisible();

    await page.getByRole("button", { name: "Mittwoch, 7. Oktober, 1 Angebot" }).click();
    await expect(page.getByRole("heading", { level: 2, name: /Mittwoch, 7\. Oktober/ })).toBeVisible();
    await expect(page.getByTestId("offer")).toHaveCount(1);
    await expect(page.getByTestId("offer")).toContainText("Offener Krabbeltreff");

    await page.getByRole("button", { name: "Donnerstag, 8. Oktober, 0 Angebote" }).click();
    await expect(page.getByText("Freier Tag")).toBeVisible();
  });

  test("heute schon vorbei, ohne kommende Termine (B2)", async ({ page }) => {
    // Das Elterncafé (9–10 Uhr) ist um 12 Uhr vorbei und steht wegen applyFilters gar nicht im Index.
    await expectAgenda(page, /Heute, 5\. Oktober/, "0 Angebote");
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    await expect(page.getByText("Freier Tag")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Montag, 5. Oktober, 0 Angebote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("ausgeblendete Angebote statt „Freier Tag“ (Plan 0008, E12)", async ({ page }) => {
    // Am Mi 7.10. liegt nur der „Offene Krabbeltreff“ (regelmäßig); „Kurse“ blendet ihn aus.
    await page.getByRole("button", { name: "Kurse", exact: true }).click();
    await page.getByRole("button", { name: "Mittwoch, 7. Oktober, 0 Angebote" }).click();
    await expectAgenda(page, /Mittwoch, 7\. Oktober/, "0 Angebote");
    await expect(page.getByText("Nichts, was zu deiner Auswahl passt")).toBeVisible();
    await expect(page.getByText("1 Angebot an diesem Tag ist ausgeblendet")).toBeVisible();
    await expect(page.getByText("Freier Tag")).toHaveCount(0);
    // Der neue Leerzustand läuft durch die Gates (Plan 0008, „Neue Zustände durch die Gates“).
    await expectMobileUx(page);

    await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await expect(page.getByTestId("offer")).toHaveCount(1);
    await expect(page.getByTestId("offer")).toContainText("Offener Krabbeltreff");
    await expect(page.getByRole("button", { name: "Kurse", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("blättert wochenweise und bleibt im Datenhorizont", async ({ page }) => {
    await page.getByRole("button", { name: "Nächste Woche" }).click();
    await expect(page.getByText("12.–18. Oktober")).toBeVisible();
    await page.getByRole("button", { name: "Vorherige Woche" }).click();
    await expect(page.getByText("5.–11. Oktober")).toBeVisible();
  });

  test("Monatsraster wählt einen Tag und klappt zu", async ({ page }) => {
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await expect(page.getByText("Oktober 2026")).toBeVisible();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await expect(page.getByText("Dezember 2026")).toBeVisible();
    // letzter Termin der Fixtures: 10.12. → kein Januar
    await expect(page.getByRole("button", { name: "Nächster Monat" })).toBeDisabled();
    await page.getByRole("button", { name: "Vorheriger Monat" }).click();
    await page.getByRole("button", { name: "Vorheriger Monat" }).click();
    await page.getByRole("button", { name: "Dienstag, 13. Oktober, 1 Angebot" }).click();
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("offer")).toContainText("PEKiP-Gruppe Herbst");
  });

  test("nach dem letzten Termin nennt die Agenda den Datenhorizont (B8)", async ({ page }) => {
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Nächster Monat" }).click();
    await page.getByRole("button", { name: "Freitag, 11. Dezember, 0 Angebote" }).click();
    await expectAgenda(page, /Freitag, 11\. Dezember/, "0 Angebote");
    await expect(page.getByText("Weiter reicht der Plan noch nicht")).toBeVisible();
    await expect(page.getByText(/Termine sind bis Donnerstag, 10\. Dezember eingetragen/)).toBeVisible();
    await expect(page.getByText("Freier Tag")).toHaveCount(0);
    // Der Leerzustand läuft durch Text-Gate und axe, hell und dunkel (Arch-Review zu Plan 0007, m4) …
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectTextFits(page);
      await expectAccessible(page);
    }
    // … und bei 320 px/200 %: „Dezember“ ist der längste Monatsname in der Wochen-Navigation.
    await page.setViewportSize({ width: 320, height: 640 });
    await setTextScale(page, 2);
    await expectTextFits(page, { scale: 2 });
  });

  test("offener Monat blendet die Woche aus, der Knopf behält den Fokus (H2)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Nächste Woche" })).toBeVisible();
    // Per Tastatur: Ein Mausklick fokussiert Knöpfe in WebKit nicht, Enter schon.
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).focus();
    await page.keyboard.press("Enter");

    const close = page.getByRole("button", { name: "Monat zuklappen" });
    await expect(close).toHaveAttribute("aria-expanded", "true");
    await expect(close).toBeFocused();
    await expect(page.getByRole("button", { name: "Vorherige Woche" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nächste Woche" })).toHaveCount(0);
    await expect(page.getByText("5.–11. Oktober")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nächster Monat" })).toBeVisible();

    await page.keyboard.press("Enter");
    const open = page.getByRole("button", { name: "Ganzen Monat zeigen" });
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await expect(open).toBeFocused();
    await expect(page.getByRole("button", { name: "Nächste Woche" })).toBeVisible();
    await expect(page.getByText("5.–11. Oktober")).toBeVisible();
  });

  test("Detail aus dem Kalender nimmt den gewählten Termin", async ({ page }) => {
    await page.getByRole("button", { name: "Nächste Woche" }).click();
    await page.getByRole("button", { name: "Mittwoch, 14. Oktober, 1 Angebot" }).click();
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Nur Mi 14.10." })).toBeVisible();
  });
});

test.describe("„Heute“ hängt an „jetzt“ (B2)", () => {
  const WED_11 = new Date("2026-10-07T11:00:00+02:00");
  const WED_1131 = new Date("2026-10-07T11:31:00+02:00");

  test("abends fehlen beendete Termine", async ({ page }) => {
    await openCalendar(page, new Date("2026-10-07T20:00:00+02:00"));
    await expectAgenda(page, /Heute, 7\. Oktober/, "0 Angebote");
    await expect(page.getByTestId("offer")).toHaveCount(0);
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    await expect(page.getByRole("button", { name: "Mittwoch, 7. Oktober, 0 Angebote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // künftige Tage bleiben unberührt
    await expect(page.getByRole("button", { name: "Donnerstag, 8. Oktober, 0 Angebote" })).toBeEnabled();
  });

  test("ein laufender Termin bleibt", async ({ page }) => {
    await openCalendar(page, WED_11);
    await expectAgenda(page, /Heute, 7\. Oktober/, "1 Angebot");
    await expect(page.getByTestId("offer")).toContainText("Offener Krabbeltreff");
    await expect(page.getByRole("button", { name: "Mittwoch, 7. Oktober, 1 Angebot" })).toBeVisible();
  });

  test("„jetzt“ wird ohne Neuladen erneuert (Timer)", async ({ page }) => {
    await openCalendar(page, WED_11);
    await expect(page.getByTestId("offer")).toContainText("Offener Krabbeltreff");
    // Timer anhalten (gleicher Zeitpunkt, sonst „Cannot fast-forward to the past“), dann die Uhr
    // nach dem Ende des Termins stellen und den 30-s-Timer von useNow auslösen.
    await page.clock.pauseAt(WED_11);
    await page.clock.setFixedTime(WED_1131);
    await page.clock.runFor(60_000);
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    await expect(page.getByTestId("offer")).toHaveCount(0);
    await expectAgenda(page, /Heute, 7\. Oktober/, "0 Angebote");
  });

  test("„jetzt“ wird beim Zurückkehren erneuert (visibilitychange)", async ({ page }) => {
    await openCalendar(page, WED_11);
    await expect(page.getByTestId("offer")).toContainText("Offener Krabbeltreff");
    // Uhr anhalten, damit kein Intervall dazwischenfunkt: Nur das Ereignis darf „jetzt“ erneuern.
    await page.clock.pauseAt(WED_11);
    await page.clock.setFixedTime(WED_1131);
    await expect(page.getByTestId("offer")).toHaveCount(1);
    expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByText(ALL_OVER)).toBeVisible();
    await expect(page.getByTestId("offer")).toHaveCount(0);
  });

  test("Tageswechsel im offenen Tab", async ({ page }) => {
    const beforeMidnight = new Date("2026-10-07T23:59:40+02:00");
    await openCalendar(page, beforeMidnight);
    await expectAgenda(page, /Heute, 7\. Oktober/, "0 Angebote");
    await page.clock.pauseAt(beforeMidnight);
    await page.clock.setFixedTime(new Date("2026-10-08T00:00:10+02:00"));
    await page.clock.runFor(30_000);
    await expectAgenda(page, /Heute, 8\. Oktober/, "0 Angebote");
    await expect(page.getByRole("button", { name: /^Mittwoch, 7\. Oktober, / })).toBeDisabled();
    // Der gewählte Tag (7.10.) wäre jetzt gesperrt: clampDay setzt ihn auf heute.
    await expect(page.getByRole("button", { name: /^Donnerstag, 8\. Oktober, / })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
