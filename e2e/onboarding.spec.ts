/**
 * Onboarding beim ersten Öffnen (Plan 0033). Ohne Flag im Speicher (`onboarding: "neu"`), Fixture-Uhr 5.10.2026.
 * Stand S4: Gerüst gegen den Stub des Flows mit Test 10 (Bestandsnutzer, Privatsphäre der Requests, Deep-Link) und
 * Test 12 (Chunk nicht ladbar); die übrigen Tests kommen in S6.
 */
import type { Page } from "@playwright/test";
import { expect, startPreloads, test } from "./fixtures.ts";

test.use({ onboarding: "neu" });

const FLAG = "zwergenplan.einfuehrung";
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

/** Requests auf die Chunks von Onboarding und App-Teil, ohne Hash, in Reihenfolge des Auftretens */
function chunkRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    const match = /\/assets\/(onboarding|app)\/([^/]+?)-[^/-]+\.(js|css)$/.exec(path);
    if (match) paths.push(`${match[1]}/${match[2]}.${match[3]}`);
  });
  return paths;
}

/** Antwort auf den Onboarding-Chunk: Er lädt auch bei „still erledigt“, sichtbar wird dann nichts. */
function onboardingLoaded(page: Page) {
  return page.waitForResponse((r) => /\/assets\/onboarding\/OnboardingFlow-[^/]+\.js$/.test(new URL(r.url()).pathname));
}

const flag = (page: Page) => page.evaluate((key) => localStorage.getItem(key), FLAG);
const intro = (page: Page) => page.getByRole("dialog", { name: "Einführung" });

test.describe("Test 10: Bestandsnutzer und Privatsphäre", () => {
  test("erster Start mit und ohne Merkliste lädt dieselben Chunks; danach keinen Onboarding-Chunk mehr", async ({
    page,
    browser,
  }) => {
    // ohne Angaben: Onboarding erscheint
    const fresh = chunkRequests(page);
    const freshPreloads = Promise.all([startPreloads(page), onboardingLoaded(page)]);
    await page.goto("./");
    await expect(intro(page).getByRole("heading", { name: /^Schritt 1 von \d:/ })).toBeVisible();
    await freshPreloads;
    expect(await flag(page)).toBeNull();

    // mit Merkliste (eigener Kontext: eigener Speicher und HTTP-Cache): kein Onboarding, Flag still gesetzt
    const context = await browser.newContext();
    try {
      const other = await context.newPage();
      await other.clock.setFixedTime(FIXTURE_NOW);
      await other.addInitScript(() => localStorage.setItem("zwergenplan.merkliste", JSON.stringify(["kovtez0z"])));
      const stored = chunkRequests(other);
      const storedPreloads = Promise.all([startPreloads(other), onboardingLoaded(other)]);
      await other.goto("./");
      await expect(other.getByTestId("offer").first()).toBeVisible();
      await storedPreloads;
      await expect(intro(other)).toHaveCount(0);
      expect(await flag(other)).toBe("1");
      expect([...stored].sort(), "dieselben Chunks mit und ohne gespeicherte Angaben").toEqual([...fresh].sort());
      expect(
        stored.filter((p) => p.startsWith("onboarding/")),
        "Onboarding-Chunk genau einmal",
      ).toEqual(["onboarding/OnboardingFlow.js", "onboarding/OnboardingFlow.css"]);

      // zweiter Start: Flag gesetzt, kein Onboarding-Chunk, aus assets/app/ nur der PWA-Kern wie bei jedem Start
      stored.length = 0;
      const again = startPreloads(other);
      await other.reload();
      await expect(other.getByTestId("offer").first()).toBeVisible();
      await again;
      await expect(intro(other)).toHaveCount(0);
      expect(stored, "zweiter Start ohne Onboarding- und App-Schritt-Chunk").toEqual(["app/pwa.js"]);
    } finally {
      await context.close();
    }
  });

  test("Geburtsdatum gespeichert: kein Onboarding, Flag danach gesetzt", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("zwergenplan.geburtsdatum", "2026-04-20"));
    const loaded = onboardingLoaded(page);
    await page.goto("./");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await loaded;
    await expect(intro(page)).toHaveCount(0);
    expect(await flag(page)).toBe("1");
  });

  test("Deep-Link: zuerst das Angebot, kein Onboarding, kein Flag; ohne Parameter erscheint es", async ({ page }) => {
    const requests = chunkRequests(page);
    await page.goto("./?angebot=kovtez0z");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
    expect(await flag(page)).toBeNull();
    expect(requests.filter((p) => p.startsWith("onboarding/"))).toEqual([]);

    await page.goto("./");
    await expect(intro(page).getByRole("heading", { name: /^Schritt 1 von \d:/ })).toBeVisible();
  });
});

test.describe("Test 12: Chunk nicht ladbar", () => {
  test.use({ allowedConsoleErrors: [/\/assets\/onboarding\/\S+/] });

  test("beim Laden steht „Überspringen“; danach Meldung mit „Später“, Flag bleibt leer", async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/assets/onboarding/*.js", async (route) => {
      await held;
      await route.abort();
    });
    await page.goto("./");
    const dialog = intro(page);
    await expect(dialog.getByRole("button", { name: "Überspringen" })).toBeVisible();
    release();
    await expect(dialog.getByText("Die Einführung konnte nicht geladen werden.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Nochmal versuchen" })).toBeVisible();
    await dialog.getByRole("button", { name: "Später" }).click();
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Angebote");
    expect(await flag(page)).toBeNull();
  });

  test("„Überspringen“ im Ladezustand setzt das Flag", async ({ page }) => {
    await page.route("**/assets/onboarding/*.js", () => {
      // bleibt hängen: der Ladezustand bleibt stehen
    });
    await page.goto("./");
    // Daten da (hinter dem Onboarding): Dann gibt es die Statuszeile als Fokusziel
    await expect(page.getByTestId("offer").first()).toBeAttached();
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toBeFocused();
    expect(await flag(page)).toBe("1");
  });
});

test.describe("Test 12: App-Teil nicht ladbar", () => {
  test.use({ allowedConsoleErrors: [/\/assets\/app\/AppSection-\S+/] });

  test("der Flow läuft ohne den Schritt „App“", async ({ page }) => {
    await page.route("**/assets/app/AppSection-*.js", (route) => route.abort());
    await page.goto("./");
    const dialog = intro(page);
    await expect(dialog.getByRole("heading", { name: /^Schritt 1 von 3:/ })).toBeFocused();
    await dialog.getByRole("button", { name: "Los geht’s" }).click();
    await expect(dialog.getByRole("heading", { name: /^Schritt 2 von 3:/ })).toBeFocused();
    await dialog.getByRole("button", { name: "Weiter" }).click();
    await expect(dialog.getByRole("heading", { name: /^Schritt 3 von 3:/ })).toBeFocused();
    await dialog.getByRole("button", { name: /^Zeig mir|^Zur Liste/ }).click();
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toBeFocused();
    expect(await flag(page)).toBe("1");
  });
});
