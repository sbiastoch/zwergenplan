/**
 * Onboarding mit Push-Fähigkeit (Plan 0033, Test 5 und Push-Teil von Test 6): Der neue Headless-Modus
 * (`channel: "chromium"`) erlaubt Benachrichtigungen, die Headless-Shell verweigert sie immer (E15, Muster
 * `push.spec.ts`). `channel` geht nur auf oberster Ebene einer Datei, deshalb diese eigene Spec. Der Service Worker
 * bleibt blockiert: Im Onboarding zählt `kein-sw` als einschaltbar (E8); das Einschalten selbst prüft `push.spec.ts`.
 * Der Push-Worker ist gemockt, damit ein Request nicht nur rot macht, sondern in `pushLog` sichtbar wird.
 */
import { expect, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoBrightIslands,
  expectNoHorizontalScroll,
  expectReducedMotion,
  expectTextFits,
  setTextScale,
} from "./mobile-ux.ts";
import { expectStep, goTo, intro, offerInstall, opened, primary, stepOrder, swipe, title } from "./onboarding-steps.ts";

test.use({ onboarding: "neu", channel: "chromium", pushWorker: "mock" });
test.skip(
  () => !["pixel-7", "desktop"].includes(test.info().project.name),
  "Push nur in Chromium (pixel-7, desktop) mit channel chromium",
);

/** App-Schritt mit Schalter und Knopf: nur mit dem neuen Headless-Modus (E15) */
test.describe("Test 5: App-Schritt mit Schalter (Chromium)", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== "pixel-7",
      "Schalter und Android-Installation: pixel-7 mit channel chromium",
    );
  });

  test("Menü-Hinweis und Schalter aus; Angebot macht den Knopf; ohne Tipp kein Request an den Push-Worker", async ({
    page,
    pushLog,
  }) => {
    await opened(page);
    await goTo(page, "app");
    await expectStep(page, 4, 4);
    await expect(intro(page).getByText("Im Browser-Menü „App installieren“ wählen.")).toBeVisible();
    const toggle = intro(page).getByRole("switch", { name: "Wöchentliche Push-Nachricht" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(toggle).toBeEnabled();
    await expect(intro(page)).toContainText("Aus. Jederzeit änderbar.");

    await offerInstall(page);
    const install = intro(page).getByRole("button", { name: "Zum Startbildschirm hinzufügen" });
    await expect(install).toBeVisible();
    await expect(intro(page).getByText("Im Browser-Menü „App installieren“ wählen.")).toHaveCount(0);
    await install.click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
    await expect(intro(page).getByText("Geschafft! Liegt jetzt auf dem Startbildschirm.")).toBeVisible();
    // der Knopf ging mit dem Fokus: Fokus auf der Überschrift
    await expect(title(page)).toBeFocused();
    expect(pushLog).toEqual([]);
  });

  test("Wischgeste, die auf dem Schalter beginnt, wechselt nicht und schaltet nicht (Plan 0035, E10)", async ({
    page,
    pushLog,
  }) => {
    await opened(page);
    await goTo(page, "app");
    await expectStep(page, 4, 4);
    const toggle = intro(page).getByRole("switch", { name: "Wöchentliche Push-Nachricht" });
    const box = await toggle.boundingBox();
    if (!box) throw new Error("Schalter ohne Box");
    const y = box.y + box.height / 2;
    // nach rechts = zurück; auf dem letzten Schritt wäre „weiter“ ohnehin wirkungslos
    await swipe(page, { target: toggle, from: [box.x + 10, y], to: [box.x + 160, y] });
    await expectStep(page, 4, 4);
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    // Gegenprobe auf der Bühne: dieselbe Richtung führt zurück
    await swipe(page, { from: [box.x + 10, 150], to: [box.x + 160, 150] });
    await expectStep(page, 3, 4);
    expect(pushLog).toEqual([]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`Schalter und Knopf: Gates (${colorScheme === "light" ? "hell" : "dunkel"})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await opened(page);
      await goTo(page, "app");
      await expect(intro(page).getByRole("switch")).toBeEnabled();
      await offerInstall(page);
      await expect(intro(page).getByRole("button", { name: "Zum Startbildschirm hinzufügen" })).toBeVisible();
      await expectReducedMotion(page);
      await expectMobileUx(page);
      if (colorScheme === "dark") await expectNoBrightIslands(page);
    });
  }

  test("Schalter und Knopf: 320 px und 200 %", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await opened(page);
    await goTo(page, "app");
    await offerInstall(page);
    await expect(intro(page).getByRole("button", { name: "Zum Startbildschirm hinzufügen" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectTextFits(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
    await expectAccessible(page);
  });
});

test.describe("Test 6: Desktop mit Push", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Desktop ohne Installationsangebot");
  });

  test("App-Schritt nur mit Schalter: „Neues kommt von selbst“", async ({ page }) => {
    await opened(page);
    expect(await stepOrder(page)).toEqual(["Willkommen", "Passt zum Alter", "Gut erreichbar", "Einmal pro Woche"]);
    await expect(title(page)).toHaveText(/Neues kommt von selbst$/);
    await expect(intro(page).getByRole("switch", { name: "Wöchentliche Push-Nachricht" })).toBeVisible();
    await expect(intro(page).getByRole("button", { name: "Zum Startbildschirm hinzufügen" })).toHaveCount(0);
    await expect(intro(page).locator(".onb-data")).not.toContainText("Browser-Menü");
  });

  test("ohne PushManager: drei Schritte, Schritt 3 beendet", async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error: Gerät ohne Push nachstellen
      delete window.PushManager;
    });
    await opened(page);
    expect(await stepOrder(page)).toEqual(["Willkommen", "Passt zum Alter", "Gut erreichbar"]);
    await expect(primary(page)).toHaveText(/^Zeig mir die \d+ Angebote$/);
  });
});
