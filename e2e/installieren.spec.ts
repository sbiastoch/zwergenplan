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

/** Bis zum offenen Sheet je Zustand: „app“ (matchMedia-Stub), „angebot“ (synthetisches Event), „ios“ (iphone-15) */
type Visible = "app" | "angebot" | "ios";

async function openIn(page: Page, state: Visible) {
  if (state === "app") {
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
  }
  await ready(page);
  if (state === "angebot") {
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
  }
  await openKidSheet(page);
}

/** Erwarteter Inhalt je Zustand */
const CONTENT: Record<Visible, string[]> = {
  app: ["Läuft als App."],
  angebot: ["Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste."],
  ios: [
    "Tippe auf Teilen und dann auf „Zum Home-Bildschirm“.",
    "Die App startet leer: Alter und Merkliste dort noch einmal eintragen.",
  ],
};
const TITLE: Record<Visible, string> = {
  app: "läuft schon als App",
  angebot: "Browser bietet die Installation an",
  ios: "iPhone: Teilen-Symbol, dann „Zum Home-Bildschirm“, Hinweis auf den eigenen Speicher",
};

// Je sichtbarer Zustand eigene Tests für hell, dunkel und 320 px/200 %: alles in einem Test lag WebKit unter Last
// über dem Timeout von 30 s (voller `pnpm check` mit 8 Workern).
for (const state of ["app", "angebot", "ios"] as const) {
  const onlyIos = () =>
    test.skip(
      (state === "ios") !== (test.info().project.name === "iphone-15"),
      state === "ios" ? "iOS-User-Agent nur im Projekt iphone-15" : "iphone-15 zeigt die iOS-Hilfe statt des Menüs",
    );

  // je Farbschema ein Test wie in mobile-ux.spec.ts: hell und dunkel in einem Test lagen in WebKit bei ≈ 19 s
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${TITLE[state]}: Inhalt und Gates (${colorScheme === "light" ? "hell" : "dunkel"}, E7)`, async ({ page }) => {
      if (state === "ios") onlyIos();
      await page.emulateMedia({ colorScheme });
      await openIn(page, state);
      for (const text of CONTENT[state]) await expect(section(page)).toContainText(text);
      if (state === "ios") await expect(section(page).locator(".share svg")).toBeVisible();
      await expect(section(page).getByRole("button")).toHaveCount(state === "angebot" ? 1 : 0);
      await expectMobileUx(page);
    });
  }

  test(`${TITLE[state]}: 320 px und 200 % (E7)`, async ({ page }) => {
    if (state === "ios") onlyIos();
    await page.setViewportSize({ width: 320, height: 640 });
    await openIn(page, state);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
    await expectAccessible(page);
  });
}

test("Browser bietet die Installation an: Knopf ruft prompt(), danach „Installiert“ (E6, E7)", async ({ page }) => {
  await openIn(page, "angebot");
  await section(page).getByRole("button", { name: "Zum Startbildschirm hinzufügen" }).click();
  await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
  await expect(section(page)).toContainText("Installiert. Öffne den Zwergenplan jetzt über das Symbol");
  await expect(section(page).getByRole("button")).toHaveCount(0);
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
