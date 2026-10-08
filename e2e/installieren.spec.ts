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
/** fester Fuß des Kind-Sheets: Installationsknopf bzw. iOS-Zeile über „Fertig“ (Plan 0022) */
const foot = (page: Page) => sheet(page).locator(".sheetfoot");
const installButton = (page: Page) => foot(page).getByRole("button", { name: "Zum Startbildschirm hinzufügen" });
const doneButton = (page: Page) => foot(page).getByRole("button", { name: "Fertig" });
const background = (el: Element) => getComputedStyle(el).backgroundColor;

/** Fuß ohne Zusatz: genau „Fertig“, primär (Plan 0022; Zustände ohne Angebot und iOS, Lade- und Fehlerzustand) */
async function expectPlainFoot(page: Page) {
  await expect(foot(page).getByRole("button")).toHaveText(["Fertig"]);
  await expect(doneButton(page)).toHaveClass(/\bprimary\b/);
  await expect(foot(page).locator(".foot-hint")).toHaveCount(0);
}

/** Startseite, PWA-Kern geladen (Listener für beforeinstallprompt hängt) */
async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-pwa", "bereit");
}

async function openKidSheet(page: Page) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await expect(sheet(page)).toBeVisible();
  // Einfahren des Sheets (0,38 s) abwarten: Klickt Playwright vorher, scrollt es den Knopf in den Blick und dabei das
  // Sheet selbst (overflow: hidden). Das kann ein Finger nicht; die Gates meldeten dann den Kopf in der Rundung.
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  // Platzhalter weg: Abschnitt geladen (oder bewusst leer)
  await expect(sheet(page).locator(".app-pending")).toHaveCount(0);
  // Push-Teil entschieden (Plan 0017, E7): data-push in jedem Zweig, auch wenn der Abschnitt leer bleibt
  await expect(page.locator("html")).toHaveAttribute("data-push", "bereit");
}

/**
 * Bis zum offenen Sheet je sichtbarem Zustand: „app“ (matchMedia-Stub), „angebot“ (synthetisches Event), „installiert“
 * (Angebot angenommen), „menue“ (Android ohne Angebot), „ios“ (iphone-15).
 */
type Visible = "app" | "angebot" | "installiert" | "menue" | "ios";

/** Projekte mit Android-User-Agent (playwright.config.ts) */
const ANDROID = ["android-klein", "pixel-7", "pixel-7-quer"];

/** Zustände, die nur ein bestimmter User-Agent zeigt; sonst überspringen, mit Begründung */
function onlyWhereVisible(state: Visible) {
  const project = test.info().project.name;
  if (state === "ios") test.skip(project !== "iphone-15", "iOS-User-Agent nur im Projekt iphone-15");
  if (state === "menue") test.skip(!ANDROID.includes(project), "Browser-Menü nur mit Android-User-Agent");
}

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
  if (state === "angebot" || state === "installiert") {
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
  if (state === "installiert") {
    await installButton(page).click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
    await expect(foot(page).getByRole("button", { name: "Fertig" })).toBeFocused();
  }
}

/** Erwarteter Inhalt je Zustand */
const CONTENT: Record<Visible, string[]> = {
  app: ["Läuft als App."],
  angebot: ["Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste."],
  installiert: ["Installiert. Öffne den Zwergenplan jetzt über das Symbol auf dem Startbildschirm."],
  menue: ["Im Browser-Menü „App installieren“ wählen."],
  ios: [
    "Tippe auf Teilen und dann auf „Zum Home-Bildschirm“.",
    "Die App startet leer: Alter, Merkliste und Stadtteil dort noch einmal eintragen.",
    // Push-Matrix (Plan 0017, E7): im Safari-Tab ohne Push der Hinweis auf die App
    "Benachrichtigungen gibt es in der App.",
  ],
};
const TITLE: Record<Visible, string> = {
  app: "läuft schon als App",
  angebot: "Browser bietet die Installation an",
  installiert: "nach dem Tipp installiert",
  menue: "Android ohne Angebot: Browser-Menü",
  ios: "iPhone: Teilen-Symbol, dann „Zum Home-Bildschirm“, Hinweis auf den eigenen Speicher",
};

// Je sichtbarer Zustand eigene Tests für hell, dunkel und 320 px/200 %: alles in einem Test lag WebKit unter Last
// über dem Timeout von 30 s (voller `pnpm check` mit 8 Workern).
for (const state of ["app", "angebot", "installiert", "menue", "ios"] as const) {
  // je Farbschema ein Test wie in mobile-ux.spec.ts: hell und dunkel in einem Test lagen in WebKit bei ≈ 19 s
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${TITLE[state]}: Inhalt und Gates (${colorScheme === "light" ? "hell" : "dunkel"}, E7)`, async ({ page }) => {
      onlyWhereVisible(state);
      await page.emulateMedia({ colorScheme });
      await openIn(page, state);
      for (const text of CONTENT[state]) await expect(section(page)).toContainText(text);
      if (state === "ios") await expect(section(page).locator(".share svg")).toBeVisible();
      // Plan 0022: kein Installationsknopf mehr im Abschnitt, sondern im Fuß über „Fertig“
      await expect(section(page).getByRole("button")).toHaveCount(0);
      if (state === "angebot") {
        await expect(foot(page).getByRole("button")).toHaveText(["Zum Startbildschirm hinzufügen", "Fertig"]);
        // ohne Scrollen sichtbar; der Installationsknopf ist primär, „Fertig“ sekundär (per CSS, gleiche Klasse)
        await expect(installButton(page)).toBeInViewport();
        await expect(installButton(page)).toHaveClass(/\bprimary\b/);
        expect(await doneButton(page).evaluate(background)).not.toBe(await installButton(page).evaluate(background));
      } else if (state === "ios") {
        await expect(foot(page).getByRole("button")).toHaveText(["Fertig"]);
        const hint = foot(page).locator(".foot-hint");
        await expect(hint).toBeInViewport();
        await expect(hint).toContainText("Als App:");
        await expect(hint).toContainText("Zum Home-Bildschirm");
        await expect(hint.locator(".share svg")).toBeVisible();
        // Pfeil verborgen, vorgelesen „, dann“ (Arch-Review 0022, m2)
        await expect(hint.locator('[aria-hidden="true"]', { hasText: "→" })).toHaveCount(1);
        await expect(hint.locator(".sr-only")).toHaveText(", dann");
      } else {
        await expectPlainFoot(page);
      }
      await expectMobileUx(page);
    });
  }

  test(`${TITLE[state]}: 320 px und 200 % (E7)`, async ({ page }) => {
    onlyWhereVisible(state);
    await page.setViewportSize({ width: 320, height: 640 });
    await openIn(page, state);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
    await expectAccessible(page);
  });
}

test("Browser bietet die Installation an: Knopf im Fuß ruft prompt(), danach „Installiert“, Fokus auf „Fertig“ (E6, E7; Plan 0022)", async ({
  page,
}) => {
  await openIn(page, "angebot");
  await installButton(page).click();
  await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
  await expect(section(page).getByText("Installiert. Öffne den Zwergenplan jetzt über das Symbol")).toBeAttached();
  await expect(installButton(page)).toHaveCount(0);
  // Der Knopf verschwindet mit dem Fokus: Er geht auf „Fertig“ direkt darunter, nicht auf <body> (im Modal)
  await expect(doneButton(page)).toBeFocused();
  await expectPlainFoot(page);
  await doneButton(page).click();
  await expect(sheet(page)).toBeHidden();
});

test("Installiert über das Browser-Menü (appinstalled), während der Knopf den Fokus hat: Fokus auf „Fertig“ (Arch-Review 0022, m6)", async ({
  page,
}) => {
  await openIn(page, "angebot");
  await installButton(page).focus();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(installButton(page)).toHaveCount(0);
  await expect(doneButton(page)).toBeFocused();
});

test.describe("Abschnitt „Als App“ nicht ladbar (Arch-Review 0022, M2)", () => {
  test.use({
    allowedConsoleErrors: [
      /\/assets\/app\/\S+ .*(ERR_FAILED|Failed to load|Failed to fetch dynamically imported module)/,
    ],
  });

  test("Fuß nur mit „Fertig“ (primär, schließt), im Sheet „Nochmal versuchen“; Gates", async ({ page, context }) => {
    await context.route("**/assets/app/AppSection-*", (route) => route.abort());
    await page.goto("./");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await expect(sheet(page)).toBeVisible();
    await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await expect(sheet(page).locator(".lazy-note")).toContainText(
      "Der Abschnitt „Als App“ konnte nicht geladen werden.",
    );
    await expect(sheet(page).getByRole("button", { name: "Nochmal versuchen" })).toBeVisible();
    await expectPlainFoot(page);
    await expectMobileUx(page);
    await doneButton(page).click();
    await expect(sheet(page)).toBeHidden();
  });
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
  // Zustand „keine“ bzw. „menue“: Fuß ohne Installationsknopf und ohne iOS-Zeile (Arch-Review 0022, m5)
  if (!ios) await expectPlainFoot(page);
});
