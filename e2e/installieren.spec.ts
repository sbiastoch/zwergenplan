/**
 * Installationshilfe „Als App“ im Kind-Sheet (Plan 0011, E6, E7), Black-Box ohne Hintertür neben `__zpMap`:
 * - „läuft als App“: `addInitScript` stubbt `matchMedia("(display-mode: standalone)")`;
 * - „Browser bietet an“: nach `data-pwa="bereit"` ein synthetisches `beforeinstallprompt` mit `prompt()`-Stub;
 * - „iPhone“: Projekt `iphone-15` (WebKit, iOS-User-Agent); „Android ohne Angebot“: Android-Projekte.
 * Der Service Worker bleibt blockiert; der PWA-Kern lädt im Produktions-Build trotzdem nach `load`.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoHorizontalScroll,
  expectTextFits,
  setTextScale,
} from "./mobile-ux.ts";

declare global {
  interface Window {
    /** vom synthetischen beforeinstallprompt mitgezählt */
    __prompted?: number;
  }
}

const sheet = (page: Page) => page.getByRole("dialog", { name: "Kind und Einstellungen" });
const section = (page: Page) => sheet(page).getByRole("region", { name: "Als App" });

/** Startseite, PWA-Kern geladen (Listener für beforeinstallprompt hängt) */
async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-pwa", "bereit");
}

async function openKidSheet(page: Page) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await expect(sheet(page)).toBeVisible();
  // Platzhalter weg: Abschnitt geladen (oder bewusst leer)
  await expect(sheet(page).locator(".app-pending")).toHaveCount(0);
}

/** Hell, dunkel und 320 px / 200 % mit offenem Sheet (docs/architecture.md, Mobile-UX-Gates) */
async function expectGates(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectMobileUx(page);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await setTextScale(page, 2);
  await expectNoHorizontalScroll(page);
  await expectTextFits(page, { scale: 2 });
  await expectAccessible(page);
}

test("läuft schon als App: „Läuft als App.“ (E7)", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes("display-mode: standalone")
        ? {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          }
        : original(query);
  });
  await ready(page);
  await openKidSheet(page);
  await expect(section(page)).toContainText("Läuft als App.");
  await expect(section(page).getByRole("button")).toHaveCount(0);
  await expectGates(page);
});

test("Browser bietet die Installation an: Knopf ruft prompt() (E6, E7)", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.__prompted = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        window.__prompted = (window.__prompted ?? 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(event);
  });
  await openKidSheet(page);
  const button = section(page).getByRole("button", { name: "Zum Startbildschirm hinzufügen" });
  await expect(button).toBeVisible();
  await expect(section(page)).toContainText("Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste.");
  await expectGates(page);

  await page.setViewportSize({ width: 412, height: 915 });
  await setTextScale(page, 1);
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
  await expect(section(page)).toContainText("Installiert. Öffne den Zwergenplan jetzt über das Symbol");
  await expect(section(page).getByRole("button")).toHaveCount(0);
});

test("iPhone: Teilen-Symbol, dann „Zum Home-Bildschirm“, Hinweis auf den eigenen Speicher (E7)", async ({ page }) => {
  test.skip(test.info().project.name !== "iphone-15", "iOS-User-Agent nur im Projekt iphone-15");
  await ready(page);
  await openKidSheet(page);
  await expect(section(page)).toContainText("Tippe auf Teilen und dann auf „Zum Home-Bildschirm“.");
  await expect(section(page).locator(".share svg")).toBeVisible();
  await expect(section(page)).toContainText("Die App startet leer: Alter und Merkliste dort noch einmal eintragen.");
  await expectGates(page);
});

test("ohne Angebot: Android zeigt das Browser-Menü, sonst bleibt der Abschnitt weg (E5, E7)", async ({ page }) => {
  await ready(page);
  await openKidSheet(page);
  const android = /Android/.test(await page.evaluate(() => navigator.userAgent));
  const ios = test.info().project.name === "iphone-15";
  if (android) await expect(section(page)).toContainText("Im Browser-Menü „App installieren“ wählen.");
  else if (!ios) await expect(section(page)).toHaveCount(0);
  // Abschnitt am Ende des Sheets: „Darstellung“ bleibt darüber, „Fertig“ im Fuß
  await expect(sheet(page).getByRole("button", { name: "Fertig" })).toBeVisible();
});
