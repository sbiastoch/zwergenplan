/**
 * Onboarding beim ersten Öffnen (Plan 0033, Tests 1–14). Ohne Flag im Speicher (`onboarding: "neu"`), Fixture-Uhr
 * 5.10.2026. Der Push-Test (Schalter einschalten, genau ein `POST /abo`) steht in `push.spec.ts`, der Smoke-Test mit
 * echten Daten in `smoke.spec.ts`.
 *
 * Push-Fähigkeit je Projekt (E15): Die Headless-Shell verweigert Benachrichtigungen, dort zeigt der App-Schritt auf
 * Android den Menü-Hinweis mit „verweigert“ und fällt auf `desktop` weg. Den Schalter gibt es nur mit
 * `channel: "chromium"`, und das geht nur auf oberster Ebene einer Datei: Test 5 und der Push-Teil von Test 6 stehen
 * deshalb in `onboarding-push.spec.ts`.
 */
import type { Page } from "@playwright/test";
import { expect, startPreloads, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoBrightIslands,
  expectNoHorizontalScroll,
  expectReducedMotion,
  expectTextFits,
  expectTouchTargets,
  expectVisibleFocus,
  setTextScale,
} from "./mobile-ux.ts";
import { ONBOARDING_FLAG } from "./onboarding-flag.ts";
import { expectStep, goTo, intro, kicker, opened, primary, stepOrder, swipe, title } from "./onboarding-steps.ts";
import { clsFrom, observeVitals, readVitals, throttleMobile } from "./vitals.ts";

test.use({ onboarding: "neu" });

const FLAG = ONBOARDING_FLAG.key;
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");
/** Projekte mit Android-User-Agent: App-Schritt mit Menü-Hinweis, also vier Schritte, „App“ zuletzt */
const ANDROID = ["android-klein", "pixel-7", "pixel-7-quer"];

/** Requests auf die Chunks von Onboarding und App-Teil, ohne Hash, in Reihenfolge des Auftretens */
function chunkRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    // Vite-Hash: 8 Zeichen Base64url, kann selbst „-“ enthalten (OnboardingFlow-B4N-hd85.js, Browser-Review lokal)
    const match = /\/assets\/(onboarding|app)\/([^/]+)-[\w-]{8}\.(js|css)$/.exec(path);
    if (match) paths.push(`${match[1]}/${match[2]}.${match[3]}`);
  });
  return paths;
}

/** Antwort auf den Onboarding-Chunk */
function onboardingLoaded(page: Page) {
  return page.waitForResponse((r) => /\/assets\/onboarding\/OnboardingFlow-[^/]+\.js$/.test(new URL(r.url()).pathname));
}

const flag = (page: Page) => page.evaluate((key) => localStorage.getItem(key), FLAG);
const statusLine = (page: Page) => page.getByRole("status");

/**
 * Darstellungen für die Mobile-UX-Gates (Test 12, Test 13). Dunkel zweimal wie in `mobile-ux.spec.ts`: per System und
 * per `data-theme="dark"` (gewählte Darstellung).
 */
const SCHEMES = [
  { label: "hell", colorScheme: "light", chosenDark: false },
  { label: "dunkel", colorScheme: "dark", chosenDark: false },
  { label: "dunkel per Darstellung", colorScheme: "light", chosenDark: true },
] as const;

/** Zahl am Anfang der Statuszeile („8 Angebote ab heute“) */
async function statusCount(page: Page): Promise<number> {
  const text = (await statusLine(page).textContent()) ?? "";
  const n = /^(\d+) Angebot/.exec(text)?.[1];
  expect(n, `Zahl in der Statuszeile: „${text}“`).toBeDefined();
  return Number(n);
}

test.describe("Test 1: erster Start", () => {
  test("Dialog statt Liste, Reihenfolge Stadt → Alter → Weg → App, Fokus je Schritt, „Später“ ab Schritt 2", async ({
    page,
  }) => {
    test.skip(!ANDROID.includes(test.info().project.name), "Reihenfolge mit App-Schritt zuletzt: Android-Projekte");
    // Außerhalb des iPhone-Tabs bleibt „App“ zuletzt (Plan 0035, E1); die Kicker-Folge belegt das
    await opened(page);
    await expect(intro(page)).toBeVisible();
    await expect(intro(page).getByRole("button", { name: "Später" })).toHaveCount(0);
    await expect(primary(page)).toHaveText("Los geht’s");
    expect(await stepOrder(page)).toEqual(["Willkommen", "Passt zum Alter", "Gut erreichbar", "Immer griffbereit"]);
    await expect(intro(page).getByRole("button", { name: "Später" })).toBeVisible();
    await expect(intro(page).getByText("Im Browser-Menü „App installieren“ wählen.")).toBeVisible();
    // Headless-Shell: Benachrichtigungen verweigert, Hinweis statt Schalter
    await expect(intro(page).getByRole("switch")).toHaveCount(0);
    await expect(intro(page)).toContainText("Benachrichtigungen sind nicht erlaubt.");
  });
});

test.describe("Test 2: Stadt", () => {
  test("Kacheln „Düsseldorf“, „Nürnberg“ (gewählt) und „Fürth“ nach Einwohnern; Lead mit Zahlen wie die Statuszeile", async ({
    page,
  }) => {
    await opened(page);
    // auf dem iPhone ist Stadt Schritt 2 (Plan 0035, E1)
    await goTo(page, "stadt");
    const city = intro(page).getByRole("group", { name: "Stadt" });
    // drei Regionen (Plan 0036; Plan 0039, E8): Kacheln nach Einwohnern, Nürnberg vorgewählt, kein Dropdown
    await expect(city.getByRole("button")).toHaveText(["Düsseldorf", "Nürnberg", "Fürth"]);
    await expect(city.getByRole("button", { name: "Nürnberg" })).toHaveAttribute("aria-pressed", "true");
    await expect(city.getByRole("button", { name: "Düsseldorf" })).toHaveAttribute("aria-pressed", "false");
    await expect(city.getByRole("button", { name: "Fürth" })).toHaveAttribute("aria-pressed", "false");
    await expect(intro(page).getByLabel("Weitere Städte")).toHaveCount(0);
    const lead = (await intro(page).locator(".onb-lead").textContent()) ?? "";
    expect(lead).toMatch(/^\d+ Babykurse, .* von \d+ Anbietern\.$/);
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    expect(Number(/^\d+/.exec(lead)?.[0])).toBe(await statusCount(page));
  });

  test("Fürth gewählt: Weg-Schritt zeigt Fürther Stadtteile zuerst, Wegzeit ab „Innenstadt (Fürth)“ (Plan 0036, Test 6)", async ({
    page,
  }) => {
    await opened(page);
    await goTo(page, "stadt");
    const city = intro(page).getByRole("group", { name: "Stadt" });
    await city.getByRole("button", { name: "Fürth" }).click();
    await expect(city.getByRole("button", { name: "Fürth" })).toHaveAttribute("aria-pressed", "true");
    await expect(city.getByRole("button", { name: "Nürnberg" })).toHaveAttribute("aria-pressed", "false");

    await goTo(page, "weg");
    const select = intro(page).getByRole("combobox", { name: "Stadtteil" });
    await expect(select.locator("optgroup")).toHaveCount(2);
    await expect(select.locator("optgroup").first()).toHaveAttribute("label", "Fürth");
    await expect(select.locator("optgroup").nth(1)).toHaveAttribute("label", "Nürnberg");
    await select.selectOption("fuerth-innenstadt");
    // Fixture-Halt 9100 liegt in Fürth-Innenstadt: Wegzeit wirkt, also kein Hinweis und Minuten-Chips frei (M2)
    const chips = intro(page).getByRole("group", { name: "Höchstens unterwegs" });
    await expect(chips.getByRole("button", { name: "30 Min." })).toBeEnabled();
    await expect(intro(page)).not.toContainText("Wegzeiten gibt es nur");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("zwergenplan.entfernung-ab")))
      .toContain("fuerth-innenstadt");
    // Abschluss: auf Android folgt noch „App“, dann die Statuszeile
    while (!/^(Zeig mir|Zur Liste)/.test((await primary(page).textContent()) ?? "")) await primary(page).click();
    await primary(page).click();
    await expect(intro(page)).toHaveCount(0);
    await expect(statusLine(page)).toContainText("Wegzeit ab Innenstadt (Fürth)");
  });

  test("Fürth gewählt, Weg übersprungen: Liste ohne Startpunkt (Plan 0036, Review G5)", async ({ page }) => {
    await opened(page);
    await goTo(page, "stadt");
    await intro(page).getByRole("group", { name: "Stadt" }).getByRole("button", { name: "Fürth" }).click();
    await goTo(page, "weg");
    // „Später“ geht einen Schritt weiter, auf dem letzten beendet es (auf Android folgt noch „App“)
    while ((await intro(page).count()) > 0) await intro(page).getByRole("button", { name: "Später" }).click();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("zwergenplan.entfernung-ab"))).toBeNull();
    await expect(statusLine(page)).not.toContainText("ab Innenstadt");
  });
});

test.describe("Test 3: Alter", () => {
  test("gültiges Datum: Hinweis und Speicher; ungültiges hält „Weiter“ an", async ({ page }) => {
    await opened(page);
    await goTo(page, "alter");
    const field = intro(page).getByLabel("Geburtsdatum");
    const hint = intro(page).locator("#onb-birth-hint");
    await field.fill("20.04.2026");
    await expect(hint).toHaveText("Schon 5 Monate!");
    await expect(hint).toHaveClass(/\bhint ok\b/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("zwergenplan.geburtsdatum"))).toBe("2026-04-20");

    const before = await title(page).textContent();
    await field.fill("31.02.2026");
    await primary(page).click();
    await expect(field).toBeFocused();
    await expect(hint).toHaveClass(/\bhint bad\b/);
    await expect(title(page)).toHaveText(before ?? "");
  });
});

test.describe("Test 4: Weg und Privatsphäre", () => {
  test("Wegzeit lädt erst mit Schritt „Weg“, genau einmal; Chips gesperrt bis dahin; URL nur mit wegzeit=", async ({
    page,
  }) => {
    const transit: string[] = [];
    page.on("request", (req) => {
      const path = new URL(req.url()).pathname;
      if (/\/data\/(wegzeit|linien)\.json$/.test(path)) transit.push(path.slice(path.lastIndexOf("/") + 1));
    });
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/data/wegzeit.json", async (route) => {
      await held;
      await route.continue();
    });
    await opened(page);
    await goTo(page, "alter");
    await intro(page).getByLabel("Geburtsdatum").fill("20.04.2026");
    expect(transit, "vor dem Schritt „Weg“ keine Wegzeit").toEqual([]);

    await goTo(page, "weg");
    // Linien kommen erst nach der Tabelle (use-transit.ts); die Tabelle hält der Test noch fest
    await expect.poll(() => transit).toEqual(["wegzeit.json"]);
    const chips = intro(page).getByRole("group", { name: "Höchstens unterwegs" });
    await expect(chips.getByRole("button")).toHaveText(["20 Min.", "30 Min.", "45 Min.", "Egal"]);
    await intro(page).getByRole("combobox", { name: "Stadtteil" }).selectOption("gostenhof");
    // Tabelle noch unterwegs: Minuten gesperrt, „Egal“ geht immer
    await expect(chips.getByRole("button", { name: "30 Min." })).toBeDisabled();
    await expect(chips.getByRole("button", { name: "Egal" })).toBeEnabled();
    release();
    await expect(chips.getByRole("button", { name: "30 Min." })).toBeEnabled();
    await expect.poll(() => [...transit].sort()).toEqual(["linien.json", "wegzeit.json"]);
    await chips.getByRole("button", { name: "30 Min." }).click();
    await expect(chips.getByRole("button", { name: "30 Min." })).toHaveAttribute("aria-pressed", "true");

    expect([...transit].sort(), "keine weiteren Requests nach Wahl und Chip").toEqual(["linien.json", "wegzeit.json"]);
    const url = new URL(page.url());
    expect([...url.searchParams.keys()]).toEqual(["wegzeit"]);
    expect(url.searchParams.get("wegzeit")).toBe("30");
    expect(page.url()).not.toMatch(/gostenhof|2026/i);
  });
});

test.describe("Test 6: Desktop ohne Push", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Desktop ohne Installationsangebot");
  });

  test("Headless-Shell (verweigert): drei Schritte", async ({ page }) => {
    await opened(page);
    expect(await stepOrder(page)).toEqual(["Willkommen", "Passt zum Alter", "Gut erreichbar"]);
    await expect(primary(page)).toHaveText(/^Zeig mir die \d+ Angebote$/);
  });
});

test.describe("Test 7: iPhone", () => {
  test("Reihenfolge App → Stadt → Alter → Weg; App zuerst mit iOS-Anleitung und Hinweis, ohne Schalter", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "iphone-15", "iOS-User-Agent nur im Projekt iphone-15");
    await opened(page);
    await expectStep(page, 1, 4);
    await expect(kicker(page)).toHaveText("Willkommen");
    await expect(title(page)).toHaveText(/Ein Tipp, und ich bin da$/);
    await expect(intro(page).locator(".onb-note")).toHaveText("Tippe auf Teilen und dann auf „Zum Home-Bildschirm“.");
    await expect(intro(page).locator(".onb-note .share svg")).toBeVisible();
    await expect(intro(page)).toContainText(
      "Auf dem iPhone kommt die wöchentliche Push-Nachricht nur in der installierten App. Darum frage ich das hier als Erstes. Die App hat einen eigenen Speicher, dort frage ich dann nach Alter und Startpunkt.",
    );
    await expect(intro(page).getByRole("switch")).toHaveCount(0);
    await expect(primary(page)).toHaveText("Los geht’s");
    await expect(intro(page).getByRole("button", { name: "Später" })).toHaveCount(0);
    await primary(page).click();
    await expectStep(page, 2, 4);
    await expect(kicker(page)).toHaveText("Schön, dass ihr da seid");
    await expect(intro(page).locator(".onb-lead")).toHaveText(/^\d+ Babykurse, .* von \d+ Anbietern\.$/);
    await primary(page).click();
    await expectStep(page, 3, 4);
    await expect(kicker(page)).toHaveText("Passt zum Alter");
    await primary(page).click();
    await expectStep(page, 4, 4);
    await expect(kicker(page)).toHaveText("Gut erreichbar");
    await expect(primary(page)).toHaveText(/^(Zeig mir|Zur Liste)/);
  });
});

test.describe("Test 8: Abschluss", () => {
  test("„Zeig mir die N Angebote“: N wie in der Statuszeile, Tab „Angebote“, Fokus, Flag, kein zweites Mal", async ({
    page,
  }) => {
    await opened(page);
    const total = Number(/von (\d):/.exec((await title(page).textContent()) ?? "")?.[1]);
    for (let n = 1; n < total; n++) await primary(page).click();
    await expectStep(page, total, total);
    const label = (await primary(page).textContent()) ?? "";
    const count = Number(/^Zeig mir die (\d+) Angebote$/.exec(label)?.[1]);
    expect(count, `Beschriftung „${label}“`).toBeGreaterThan(1);
    await primary(page).click();
    await expect(intro(page)).toHaveCount(0);
    await expect(statusLine(page)).toBeFocused();
    expect(await statusCount(page)).toBe(count);
    await expect(
      page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: /^Angebote/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(await flag(page)).toBe(ONBOARDING_FLAG.value);
    await page.reload();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
  });
});

test.describe("Test 9: Abbrechen", () => {
  test("„Überspringen“ auf Schritt 2", async ({ page }) => {
    await opened(page);
    await primary(page).click();
    await expectStep(page, 2, Number(/von (\d):/.exec((await title(page).textContent()) ?? "")?.[1]));
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByTestId("offer").first()).toBeVisible();
    expect(await flag(page)).toBe(ONBOARDING_FLAG.value);
    await page.reload();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
  });

  test("Esc auf Schritt 3", async ({ page }) => {
    await opened(page);
    await primary(page).click();
    await primary(page).click();
    await expect(title(page)).toHaveText(/^Schritt 3 von \d: /);
    await expect(title(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByTestId("offer").first()).toBeVisible();
    expect(await flag(page)).toBe(ONBOARDING_FLAG.value);
    await page.reload();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
  });
});

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

    // mit Merkliste (eigener Kontext: eigener Speicher und HTTP-Cache): Onboarding erscheint ebenfalls (Plan 0035, E3)
    const context = await browser.newContext();
    try {
      const other = await context.newPage();
      await other.clock.setFixedTime(FIXTURE_NOW);
      await other.addInitScript(() => localStorage.setItem("zwergenplan.merkliste", JSON.stringify(["kovtez0z"])));
      const stored = chunkRequests(other);
      const storedPreloads = Promise.all([startPreloads(other), onboardingLoaded(other)]);
      await other.goto("./");
      await expect(intro(other).getByRole("heading", { name: /^Schritt 1 von \d:/ })).toBeVisible();
      await storedPreloads;
      expect([...stored].sort(), "dieselben Chunks mit und ohne gespeicherte Angaben").toEqual([...fresh].sort());
      expect(
        stored.filter((p) => p.startsWith("onboarding/")),
        "Onboarding-Chunk genau einmal",
      ).toEqual(["onboarding/OnboardingFlow.js", "onboarding/OnboardingFlow.css"]);
      await intro(other).getByRole("button", { name: "Überspringen" }).click();
      await expect(intro(other)).toHaveCount(0);
      expect(await flag(other)).toBe(ONBOARDING_FLAG.value);

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

  test("Bestandsnutzer mit Geburtsdatum und Stadtteil sieht es, vorbelegt (Plan 0035, Test 10b)", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("zwergenplan.geburtsdatum", "2026-04-20");
      localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof");
    });
    const tables: string[] = [];
    page.on("request", (req) => {
      const name = /\/(wegzeit|linien)\.json$/.exec(new URL(req.url()).pathname)?.[1];
      if (name) tables.push(name);
    });
    await opened(page);
    await goTo(page, "alter");
    await expect(intro(page).getByLabel("Geburtsdatum")).toHaveValue("20.04.2026");
    await expect(intro(page).locator("#onb-birth-hint")).toHaveText("Schon 5 Monate!");
    await goTo(page, "weg");
    await expect(intro(page).getByRole("combobox", { name: "Stadtteil" })).toHaveValue("gostenhof");
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    expect(tables.sort(), "je genau ein Request auf Tabelle und Linien").toEqual(["linien", "wegzeit"]);
    expect(
      await page.evaluate(() => [
        localStorage.getItem("zwergenplan.geburtsdatum"),
        localStorage.getItem("zwergenplan.entfernung-ab"),
      ]),
    ).toEqual(["2026-04-20", "gostenhof"]);
    expect(await flag(page)).toBe(ONBOARDING_FLAG.value);
  });

  test("altes Flag „1“ (still gesetzt seit ecfccfb): erscheint einmal (Plan 0035, Test 10c)", async ({ page }) => {
    // nur beim ersten Laden, sonst stünde nach dem Neuladen wieder „1“ (Muster push.spec.ts)
    await page.addInitScript((key) => {
      if (sessionStorage.getItem("__e2eSeeded")) return;
      sessionStorage.setItem("__e2eSeeded", "1");
      localStorage.setItem(key, "1");
    }, FLAG);
    await opened(page);
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    expect(await flag(page)).toBe(ONBOARDING_FLAG.value);
    const requests = chunkRequests(page);
    await page.reload();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
    expect(requests.filter((p) => p.startsWith("onboarding/"))).toEqual([]);
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

  test("Deep-Link mit altem Flag „1“: kein Onboarding, Flag bleibt „1“", async ({ page }) => {
    await page.addInitScript((key) => {
      if (sessionStorage.getItem("__e2eSeeded")) return;
      sessionStorage.setItem("__e2eSeeded", "1");
      localStorage.setItem(key, "1");
    }, FLAG);
    await page.goto("./?angebot=kovtez0z");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
    expect(await flag(page)).toBe("1");
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
    // WebKit zählt den hängenden Chunk zum `load` der Seite: nur bis DOMContentLoaded warten
    await page.goto("./", { waitUntil: "domcontentloaded" });
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
    // WebKit zählt den hängenden Chunk zum `load` der Seite: nur bis DOMContentLoaded warten
    await page.goto("./", { waitUntil: "domcontentloaded" });
    // Daten da (hinter dem Onboarding): Dann gibt es die Statuszeile als Fokusziel
    await expect(page.getByTestId("offer").first()).toBeAttached();
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toBeFocused();
    expect(await flag(page)).toBe(ONBOARDING_FLAG.value);
  });
});

/**
 * Test 12, Mobile-UX von Lade- und Fehlerzustand (Arch-Review der Umsetzung, M1): Start-CSS `.onb-pending`,
 * `.onb-topbar`, `.onb-skip`, `.onb-failed`. Dunkel per System und per `data-theme`; die leere Bühne hat dunkel die
 * Farbe der ersten Bühne (kein Farbsprung beim Übergang in den Flow).
 */
test.describe("Test 12: Lade- und Fehlerzustand bestehen die Gates", () => {
  test.use({ allowedConsoleErrors: [/\/assets\/onboarding\/\S+/] });

  /** Onboarding-Chunk festhalten, bis `release(abort)` ihn abbricht bzw. durchlässt */
  async function holdChunk(page: Page) {
    let release: (abort: boolean) => void = () => {};
    const held = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    await page.route("**/assets/onboarding/*", async (route) => {
      if (await held) await route.abort();
      else await route.fallback();
    });
    // WebKit zählt den hängenden Chunk zum `load` der Seite: nur bis DOMContentLoaded warten
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await expect(intro(page).getByRole("button", { name: "Überspringen" })).toBeVisible();
    return release;
  }

  for (const scheme of SCHEMES) {
    test(`Laden und Fehler (${scheme.label})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme.colorScheme, reducedMotion: "reduce" });
      const release = await holdChunk(page);
      if (scheme.chosenDark)
        await page.evaluate(() => {
          document.documentElement.dataset["theme"] = "dark";
        });
      await expectMobileUx(page);
      if (scheme.label !== "hell") await expectNoBrightIslands(page);
      release(true);
      await expect(intro(page).getByText("Die Einführung konnte nicht geladen werden.")).toBeVisible();
      await expectMobileUx(page);
      if (scheme.label !== "hell") await expectNoBrightIslands(page);
    });
  }

  /** ungemischte Farbe der ersten Bühne: App (lila) im Safari-Tab des iPhones, sonst Stadt (gelb), Plan 0035, E8 */
  const firstStageColor = (project: string) => (project === "iphone-15" ? "185,156,255" : "255,217,59");

  for (const scheme of SCHEMES) {
    test(`leere Bühne in der Farbe der ersten Bühne (${scheme.label})`, async ({ page }) => {
      const project = test.info().project.name;
      // hell ist die Farbe fest; geprüft auf dem iPhone, wo die Ladebühne die App-Farbe trägt (Review Runde 2, m3)
      test.skip(scheme.label === "hell" && project !== "iphone-15", "hell: nur iphone-15");
      await page.emulateMedia({ colorScheme: scheme.colorScheme });
      const release = await holdChunk(page);
      if (scheme.chosenDark)
        await page.evaluate(() => {
          document.documentElement.dataset["theme"] = "dark";
        });
      if (project === "iphone-15") await expect(page.locator(".onb-pending")).toHaveClass(/\bios\b/);
      else await expect(page.locator(".onb-pending")).not.toHaveClass(/\bios\b/);
      // als gerundetes RGB: Der Build rechnet das feste `color-mix` der leeren Bühne vorab aus, die Bühne mischt
      // zur Laufzeit (`--mix`) und meldet `color(srgb …)`
      const background = (selector: string) =>
        page.locator(selector).evaluate((el) => {
          const c = getComputedStyle(el).backgroundColor;
          const srgb = /^color\(srgb ([^)]+)\)$/.exec(c)?.[1];
          const parts = srgb
            ? srgb.split(" ").map((v) => Number.parseFloat(v) * 255)
            : (/\(([^)]+)\)/.exec(c)?.[1]?.split(",").map(Number.parseFloat) ?? []);
          return parts.slice(0, 3).map(Math.round).join(",");
        });
      const pending = await background(".onb-pending");
      release(false);
      await expect(title(page)).toHaveText(/^Schritt 1 von \d: /);
      expect(await background(".onb-stage")).toBe(pending);
      if (scheme.label === "hell") expect(pending).toBe(firstStageColor(project));
      else expect(pending).not.toBe(firstStageColor(project));
    });
  }

  test("320 px und 200 % Textgröße", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const release = await holdChunk(page);
    const check = async () => {
      await expectNoHorizontalScroll(page);
      await expectTouchTargets(page);
      await expectTextFits(page);
      await setTextScale(page, 2);
      await expectNoHorizontalScroll(page);
      await expectTextFits(page, { scale: 2 });
      await setTextScale(page, 1);
    };
    await check();
    release(true);
    await expect(intro(page).getByText("Die Einführung konnte nicht geladen werden.")).toBeVisible();
    await check();
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
    expect(await flag(page)).toBe(ONBOARDING_FLAG.value);
  });
});

test.describe("Test 11: erneut über das Kind-Sheet", () => {
  test.use({ onboarding: "erledigt" });

  test("„Einführung ansehen“ öffnet es mit vorbelegtem Geburtsdatum; „Überspringen“ schließt", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("zwergenplan.geburtsdatum", "2026-04-20"));
    await page.goto("./");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await sheet.getByRole("button", { name: "Einführung ansehen" }).click();
    await expect(sheet).toHaveCount(0);
    // Chunk schon geladen: Der Flow montiert vor showModal(), der Fokus kommt über autofocus (Review 2, M-1)
    await expect(title(page)).toHaveText(/^Schritt 1 von \d: /);
    await expect(title(page)).toBeFocused();
    await goTo(page, "alter");
    await expect(intro(page).getByLabel("Geburtsdatum")).toHaveValue("20.04.2026");
    await expect(intro(page).locator("#onb-birth-hint")).toHaveText("Schon 5 Monate!");
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    expect(await flag(page)).toBe(ONBOARDING_FLAG.value);
  });
});

/**
 * Test 13: Mobile-UX-Gates je Schritt in allen Projekten (inkl. `pixel-7-quer`: Der Dialog scrollt). Ein Test je
 * Darstellung, alle Schritte darin; der Schalter und der Installationsknopf stehen in Test 5.
 */
/** Je Schritt `check` aufrufen, dann weiter; der letzte Schritt bleibt offen */
async function eachStep(page: Page, check: (n: number) => Promise<void>) {
  const total = Number(/von (\d):/.exec((await title(page).textContent()) ?? "")?.[1]);
  for (let n = 1; n <= total; n++) {
    await expectStep(page, n, total);
    await check(n);
    if (n < total) await primary(page).click();
  }
}

test.describe("Test 13: Mobile-UX je Schritt", () => {
  for (const scheme of SCHEMES) {
    test(`alle Schritte bestehen die Gates (${scheme.label})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme.colorScheme, reducedMotion: "reduce" });
      // Seit Plan 0035 macht eine gespeicherte Darstellung keinen Bestandsnutzer mehr: Sie steht vor dem Laden im
      // Speicher, und das Inline-Skript in index.html setzt `data-theme` vor dem ersten Paint (wie mobile-ux.spec.ts)
      if (scheme.chosenDark)
        await page.addInitScript(() => {
          localStorage.setItem("zwergenplan.darstellung", "dunkel");
        });
      await opened(page);
      if (scheme.chosenDark) expect(await page.evaluate(() => document.documentElement.dataset["theme"])).toBe("dark");
      await eachStep(page, async () => {
        // vor expectMobileUx: dessen settle() wartet Animationen ab, die hier gar nicht erst laufen dürfen
        await expectReducedMotion(page);
        await expectMobileUx(page);
        if (scheme.label !== "hell") await expectNoBrightIslands(page);
      });
    });
  }

  test("alle Schritte brechen bei 320 px und 200 % Textgröße nicht aus", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await opened(page);
    await eachStep(page, async () => {
      await expectNoHorizontalScroll(page);
      await expectTouchTargets(page);
      await expectTextFits(page);
      const titleSize = () => title(page).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      const before = await titleSize();
      await setTextScale(page, 2);
      // Schriftgrößen in rem: 200 % verdoppeln den Titel wirklich (E11, Review 2, M-4)
      expect(await titleSize()).toBeCloseTo(2 * before, 1);
      await expectNoHorizontalScroll(page);
      await expectTextFits(page, { scale: 2 });
      await expectAccessible(page);
      await setTextScale(page, 1);
    });
  });

  test("Tastatur: sichtbarer Fokus auf jedem Schritt", async ({ page, isMobile }) => {
    test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
    await opened(page);
    await eachStep(page, async () => {
      await expectVisibleFocus(page, 20);
      // expectVisibleFocus tabbt durch den Dialog; danach zurück auf die Überschrift wie nach einem Schrittwechsel
      await title(page).focus();
    });
  });
});

/** Gesamtzahl der Schritte aus dem Vorlesetext der Überschrift */
async function stepTotal(page: Page): Promise<number> {
  return Number(/von (\d):/.exec((await title(page).textContent()) ?? "")?.[1]);
}

/** Breite des Viewports; Gesten starten innerhalb der äußeren 24 px Randzone nicht (E10) */
const viewWidth = (page: Page) => page.viewportSize()?.width ?? 400;

/**
 * Echte Touch-Geste über CDP (nur Chromium, Plan 0035, E10): `touchStart`, mehrere `touchMove`, `touchEnd`. Prüft, dass
 * mit `touch-action: pan-y pinch-zoom` die horizontale Geste bei der Seite ankommt und eine vertikale scrollt.
 */
async function touchDrag(page: Page, from: [number, number], to: [number, number]) {
  const cdp = await page.context().newCDPSession(page);
  const at = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(...from) });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / steps;
    const y = from[1] + ((to[1] - from[1]) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x, y) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test.describe("Test 15: Wischen (Plan 0035, E10, E11)", () => {
  test.use({ reducedMotion: "reduce" });

  test("15a: nach links weiter, nach rechts zurück, Fokus auf der Überschrift; auf Schritt 1 nicht weiter zurück", async ({
    page,
  }) => {
    await opened(page);
    const total = await stepTotal(page);
    const w = viewWidth(page);
    await swipe(page, { from: [w - 100, 150], to: [w - 250, 160] });
    await expectStep(page, 2, total);
    await swipe(page, { from: [100, 150], to: [250, 140] });
    await expectStep(page, 1, total);
    await swipe(page, { from: [100, 150], to: [250, 140] });
    await expectStep(page, 1, total);
  });

  test("15b: ungültiges Geburtsdatum hält das Wischen an; die Eingabe bleibt beim Blättern", async ({ page }) => {
    await opened(page);
    await goTo(page, "alter");
    const w = viewWidth(page);
    const field = intro(page).getByLabel("Geburtsdatum");
    await field.fill("31.02.2026");
    const before = await title(page).textContent();
    await swipe(page, { from: [w - 100, 150], to: [w - 250, 150] });
    await expect(field).toBeFocused();
    await expect(intro(page).locator("#onb-birth-hint")).toHaveClass(/\bhint bad\b/);
    await expect(title(page)).toHaveText(before ?? "");
    await swipe(page, { from: [100, 150], to: [250, 150] });
    await expect(title(page)).not.toHaveText(before ?? "");
    await expect(title(page)).toBeFocused();
    await swipe(page, { from: [w - 100, 150], to: [w - 250, 150] });
    await expect(title(page)).toHaveText(before ?? "");
    await expect(field).toHaveValue("31.02.2026");
  });

  test("15c: keine Wirkung am Rand, im Feld, bei vertikaler Geste und mit der Maus", async ({ page }) => {
    await opened(page);
    await goTo(page, "alter");
    const w = viewWidth(page);
    const field = intro(page).getByLabel("Geburtsdatum");
    await field.fill("20.04.2026");
    const before = (await title(page).textContent()) ?? "";
    await swipe(page, { from: [10, 150], to: [200, 150] });
    await swipe(page, { from: [w - 10, 150], to: [w - 200, 150] });
    const box = await field.boundingBox();
    if (!box) throw new Error("Feld ohne Box");
    const y = box.y + box.height / 2;
    await swipe(page, { target: field, from: [box.x + box.width - 10, y], to: [box.x + box.width - 160, y] });
    await swipe(page, { from: [w - 100, 150], to: [w - 140, 350] });
    await swipe(page, { from: [w - 100, 150], to: [w - 250, 150], pointerType: "mouse" });
    await expect(title(page)).toHaveText(before);
    // Gegenprobe: dieselbe Geste mit Touch wechselt
    await swipe(page, { from: [w - 100, 150], to: [w - 250, 150] });
    await expect(title(page)).not.toHaveText(before);
  });

  test("15d: auf dem letzten Schritt beendet Wischen nicht", async ({ page }) => {
    await opened(page);
    const total = await stepTotal(page);
    for (let n = 1; n < total; n++) await primary(page).click();
    await expectStep(page, total, total);
    const w = viewWidth(page);
    await swipe(page, { from: [w - 100, 150], to: [w - 250, 150] });
    await expectStep(page, total, total);
    await expect(intro(page)).toBeVisible();
    expect(await flag(page)).toBeNull();
  });

  test("15e: Touch-Geste über Kachel und „Weiter“ wechselt genau einen Schritt (CDP)", async ({ page }) => {
    test.skip(test.info().project.name !== "pixel-7", "CDP-Touch: pixel-7");
    await opened(page);
    const tile = intro(page).getByRole("button", { name: "Nürnberg" });
    const t = await tile.boundingBox();
    if (!t) throw new Error("Kachel ohne Box");
    await touchDrag(page, [t.x + t.width - 10, t.y + t.height / 2], [t.x + t.width - 130, t.y + t.height / 2]);
    await expectStep(page, 2, 4);
    await expect(intro(page).getByRole("button", { name: "Später" })).toBeVisible();
    const b = await primary(page).boundingBox();
    if (!b) throw new Error("Knopf ohne Box");
    const cx = b.x + b.width / 2;
    await touchDrag(page, [cx + 60, b.y + b.height / 2], [cx - 80, b.y + b.height / 2]);
    await expectStep(page, 3, 4);
    // ein Klick nach der Geste käme sofort nach `touchEnd`; kein Ereignis zum Warten, darum kurz Zeit lassen
    await page.waitForTimeout(400);
    await expectStep(page, 3, 4);
  });

  test("15f: echte Touch-Geste wechselt, vertikale scrollt; Gleiten nur ohne reduzierte Bewegung (CDP)", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "pixel-7", "CDP-Touch: pixel-7");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await opened(page);
    const w = viewWidth(page);
    await page.evaluate(() => {
      window.__slides = 0;
      document.addEventListener("animationstart", (e) => {
        if (e.animationName === "onb-in" && e.target instanceof Element && e.target.classList.contains("onb-txt"))
          window.__slides = (window.__slides ?? 0) + 1;
      });
    });
    await touchDrag(page, [w - 100, 150], [w - 260, 155]);
    await expectStep(page, 2, 4);
    await expect(intro(page).locator(".onb-txt")).toHaveClass(/\bonb-in-vor\b/);
    // zweiter Wischer in dieselbe Richtung: `key={index}` startet die Animation neu (M3)
    await touchDrag(page, [w - 100, 150], [w - 260, 155]);
    await expectStep(page, 3, 4);
    await expect.poll(() => page.evaluate(() => window.__slides)).toBe(2);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await touchDrag(page, [100, 150], [260, 155]);
    await expectStep(page, 2, 4);
    await expect(intro(page).locator(".onb-txt")).toHaveClass(/\bonb-in-zurueck\b/);
    await expectReducedMotion(page);

    await setTextScale(page, 2);
    const dialog = intro(page);
    await touchDrag(page, [w / 2, 600], [w / 2 + 10, 200]);
    await expect.poll(() => dialog.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expectStep(page, 2, 4);
  });

  test("15g: „Zurück“ ab Schritt 2, Tipp und Tastatur; Eingaben bleiben, Punkte nur Anzeige (Nachtrag 2026-10-11)", async ({
    page,
  }) => {
    await opened(page);
    const total = await stepTotal(page);
    const back = intro(page).getByRole("button", { name: "Zurück" });
    await expect(back).toHaveCount(0);
    await expect(intro(page).locator(".onb-dots button")).toHaveCount(0);
    await expect(intro(page).locator(".onb-dots")).toHaveAttribute("aria-hidden", "true");
    await goTo(page, "alter");
    const field = intro(page).getByLabel("Geburtsdatum");
    await field.fill("20.04.2026");
    const at = Number(/^Schritt (\d)/.exec((await title(page).textContent()) ?? "")?.[1]);
    await primary(page).click();
    await expectStep(page, at + 1, total);
    const box = await back.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await back.click();
    await expectStep(page, at, total);
    await expect(field).toHaveValue("20.04.2026");

    await primary(page).click();
    await expectStep(page, at + 1, total);
    // per Tastatur: vom fokussierten Titel rückwärts bis „Zurück“ (er steht vor dem Titel)
    for (let i = 0; i < 10; i++) {
      if (await back.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Shift+Tab");
    }
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expectStep(page, at, total);
  });
});

test.describe("Test 14: Vitals beim Erstbesuch", () => {
  test("LCP und CLS mit Onboarding im Budget", async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "chromium" || !isMobile, "nur Chromium-Mobile");
    await throttleMobile(page);
    await observeVitals(page);
    await page.goto("./");
    await expect(title(page)).toHaveText(/^Schritt 1 von \d: /);
    await page.waitForTimeout(500);
    const vitals = await readVitals(page);
    const { cls, detail } = clsFrom(vitals);
    test
      .info()
      .annotations.push(
        { type: "LCP (ms)", description: String(vitals.lcp) },
        { type: "CLS", description: String(cls) },
      );
    expect(vitals.lcp, "LCP (ms)").toBeLessThan(2500);
    expect(cls, `CLS\n${detail}`).toBeLessThan(0.05);
  });
});

/**
 * Nachtrag Nutzerfeedback 2026-10-11 (Plan 0035): Nach einem Dropdown scrollte auf dem Handy der Hintergrund, der
 * Wizard rutschte weg und die Liste kam darunter hervor. Der native Picker lässt sich in Playwright nicht öffnen; der
 * Test prüft darum die Ursache: Solange das Onboarding offen ist, lässt sich das Dokument auch per Skript (so scrollt
 * der Browser ein fokussiertes Feld ins Bild) nicht scrollen, und der Dialog deckt den Viewport.
 */
test.describe("Nachtrag 2026-10-11: Dropdown und Standort im Schritt Weg", () => {
  test.beforeEach(() => {
    const project = test.info().project.name;
    test.skip(project !== "pixel-7" && project !== "iphone-15", "Mobilgeräte: pixel-7 und iphone-15");
  });

  /** Dialog deckt den Viewport, an Ecken und Mitte liegt der Dialog oben; das Dokument steht oben */
  async function expectCovered(page: Page) {
    const state = await page.evaluate(() => {
      const dialog = document.querySelector("dialog.onb");
      const r = dialog?.getBoundingClientRect();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const points: [number, number][] = [
        [2, 2],
        [w / 2, h / 2],
        [w - 2, h - 2],
        [2, h - 2],
      ];
      return {
        scrollY: window.scrollY,
        rect: r && { top: r.top, bottom: r.bottom, h },
        onTop: points.map(([x, y]) => Boolean(dialog?.contains(document.elementFromPoint(x, y)))),
      };
    });
    expect(state.scrollY, "Dokument scrollt hinter dem Onboarding").toBe(0);
    expect(state.rect?.top).toBe(0);
    expect(state.rect?.bottom).toBeGreaterThanOrEqual(state.rect?.h ?? Number.POSITIVE_INFINITY);
    expect(state.onTop, "Liste sichtbar statt Dialog").toEqual([true, true, true, true]);
  }

  test("N1: nach der Stadtteil-Wahl scrollt der Hintergrund nicht, der Dialog bleibt deckend", async ({ page }) => {
    await opened(page);
    await goTo(page, "weg");
    // Vorbedingung: Die Liste dahinter wäre ohne Sperre scrollbar
    expect(await page.evaluate(() => document.querySelector("main")?.scrollHeight ?? 0)).toBeGreaterThan(
      await page.evaluate(() => window.innerHeight),
    );
    const district = intro(page).getByRole("combobox", { name: "Stadtteil" });
    await district.selectOption("gostenhof");
    await district.focus();
    // was der Browser beim Schließen des Pickers tut: Fokus-Scroll und Scrollen des Dokuments
    await page.evaluate(() => {
      window.scrollTo(0, 600);
      document.scrollingElement?.scrollBy(0, 600);
    });
    await expectCovered(page);
    await expect(intro(page).getByRole("combobox", { name: "Stadtteil" })).toHaveValue("gostenhof");
    await expect(title(page)).toBeInViewport();
  });

  test("N2: Standort gefunden ersetzt die Stadtteil-Auswahl; „Standort entfernen“ bringt sie zurück", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 49.45213, longitude: 11.07672 });
    await opened(page);
    await goTo(page, "weg");
    await expect(intro(page).locator(".onb-lead")).toHaveText(
      "Ich zeige, wie lange ihr mit Bus und Bahn braucht – mit höchstens einem Umstieg.",
    );
    const district = intro(page).getByRole("combobox", { name: "Stadtteil" });
    await expect(district).toBeVisible();
    await intro(page).getByRole("button", { name: "Standort", exact: true }).click();

    await expect(intro(page).getByText("Dein Standort", { exact: true })).toBeVisible();
    // ermittelter Standort in Worten, offline aus den Stadtteil-Punkten (Punkt 8)
    await expect(intro(page).getByText("nächster Stadtteil: Altstadt", { exact: true })).toBeVisible();
    // Mobile-UX-Gates für den Zustand „Dein Standort“ (`.onb-origin`), hell und dunkel (Arch-Review Plan 0035, M2)
    await page.emulateMedia({ reducedMotion: "reduce" });
    const theme = await page.evaluate(() => document.documentElement.dataset["theme"]);
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme.colorScheme });
      await page.evaluate(
        ([dark, before]) => {
          const root = document.documentElement;
          if (dark) root.dataset["theme"] = "dark";
          else if (before === undefined) delete root.dataset["theme"];
          else root.dataset["theme"] = before;
        },
        [scheme.chosenDark, theme] as const,
      );
      await expectMobileUx(page);
      if (scheme.label !== "hell") await expectNoBrightIslands(page);
    }
    await expect(intro(page).getByText("Wegzeit ab deinem Standort (auf ca. 100 m gerundet).")).toBeVisible();
    await expect(district).toHaveCount(0);
    const remove = intro(page).getByRole("button", { name: "Standort entfernen" });
    const box = await remove.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    await expectCovered(page);

    await remove.click();
    await expect(remove).toHaveCount(0);
    await expect(district).toBeFocused();
    await expect(intro(page).getByRole("button", { name: "Standort", exact: true })).toBeVisible();
    await district.selectOption("gostenhof");
    await expect(district).toHaveValue("gostenhof");
    expect(await page.evaluate(() => localStorage.getItem("zwergenplan.entfernung-ab"))).toBe("gostenhof");
    await expectCovered(page);
  });

  test("N2: „Dein Standort“ mit dem längsten Text bricht bei 320 px und 200 % Textgröße nicht aus", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await context.grantPermissions(["geolocation"]);
    // Worst Case (Arch-Review Plan 0035, M2): längster Stadtteil-Name und über 1,5 km vom nächsten Stadtteil-Punkt,
    // also mit Entfernung. Im Fixture-Stadtgebiet gibt es so einen Punkt nicht: Nur in diesem Test liegt der letzte
    // Halt der Wegzeit-Tabelle dort, sonst wäre der Standort „außerhalb“ und „Dein Standort“ fehlte.
    const worst = { latitude: 49.413, longitude: 11.009 };
    await context.setGeolocation(worst);
    await page.route("**/data/wegzeit.json", async (route) => {
      const response = await route.fetch();
      const table = (await response.json()) as { lat: number[]; lon: number[] };
      // Koordinaten als Differenzen in 1e-4 Grad (`undelta` in src/domain/transit.ts)
      const moveLast = (deltas: number[], to: number) => {
        const before = deltas.slice(0, -1).reduce((sum, d) => sum + d, 0);
        deltas[deltas.length - 1] = Math.round(to * 1e4) - before;
      };
      moveLast(table.lat, worst.latitude);
      moveLast(table.lon, worst.longitude);
      await route.fulfill({ response, json: table });
    });
    await opened(page);
    await goTo(page, "weg");
    await intro(page).getByRole("button", { name: "Standort", exact: true }).click();
    await expect(intro(page).getByText("Dein Standort", { exact: true })).toBeVisible();
    await expect(
      intro(page).getByText("nächster Stadtteil: Röthenbach b. Schweinau, ca. 1,8 km", { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
    await expectTextFits(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
  });
});
