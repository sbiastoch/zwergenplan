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
import { expectStep, goTo, intro, kicker, opened, primary, stepOrder, title } from "./onboarding-steps.ts";
import { clsFrom, observeVitals, readVitals, throttleMobile } from "./vitals.ts";

test.use({ onboarding: "neu" });

const FLAG = "zwergenplan.einfuehrung";
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");
/** Projekte mit Android-User-Agent: App-Schritt mit Menü-Hinweis, also vier Schritte, „App“ zuletzt */
const ANDROID = ["android-klein", "pixel-7", "pixel-7-quer"];

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
  test("eine Kachel „Nürnberg“, gewählt; Lead mit Zahlen wie die Statuszeile", async ({ page }) => {
    await opened(page);
    const city = intro(page).getByRole("group", { name: "Stadt" });
    await expect(city.getByRole("button")).toHaveCount(1);
    await expect(city.getByRole("button", { name: "Nürnberg" })).toHaveAttribute("aria-pressed", "true");
    await expect(intro(page).getByLabel("Weitere Städte")).toHaveCount(0);
    const lead = (await intro(page).locator(".onb-lead").textContent()) ?? "";
    expect(lead).toMatch(/^\d+ Babykurse, .* von \d+ Anbietern\.$/);
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    expect(Number(/^\d+/.exec(lead)?.[0])).toBe(await statusCount(page));
  });
});

test.describe("Test 3: Alter", () => {
  test("gültiges Datum: Hinweis und Speicher; ungültiges hält „Weiter“ an", async ({ page }) => {
    await opened(page);
    await goTo(page, "alter");
    const field = intro(page).getByLabel("Geburtsdatum");
    const hint = intro(page).locator("#onb-birth-hint");
    await field.fill("20.04.2026");
    await expect(hint).toHaveText(/^5 Monate! /);
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
  test("Reihenfolge Stadt → App → Alter → Weg; App mit iOS-Anleitung und Hinweis, ohne Schalter", async ({ page }) => {
    test.skip(test.info().project.name !== "iphone-15", "iOS-User-Agent nur im Projekt iphone-15");
    await opened(page);
    await primary(page).click();
    await expectStep(page, 2, 4);
    await expect(kicker(page)).toHaveText("Immer griffbereit");
    await expect(intro(page).locator(".onb-note")).toHaveText("Tippe auf Teilen und dann auf „Zum Home-Bildschirm“.");
    await expect(intro(page).locator(".onb-note .share svg")).toBeVisible();
    await expect(intro(page)).toContainText(
      "Auf dem iPhone kommt die Samstags-Nachricht nur in der installierten App.",
    );
    await expect(intro(page).getByRole("switch")).toHaveCount(0);
    await primary(page).click();
    await expectStep(page, 3, 4);
    await expect(kicker(page)).toHaveText("Passt zum Alter");
    await primary(page).click();
    await expectStep(page, 4, 4);
    await expect(kicker(page)).toHaveText("Gut erreichbar");
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
    expect(await flag(page)).toBe("1");
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
    expect(await flag(page)).toBe("1");
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
    expect(await flag(page)).toBe("1");
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
    expect(await flag(page)).toBe("1");
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

  for (const scheme of SCHEMES.filter((s) => s.label !== "hell")) {
    test(`leere Bühne in der Farbe der ersten Bühne (${scheme.label})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme.colorScheme });
      const release = await holdChunk(page);
      if (scheme.chosenDark)
        await page.evaluate(() => {
          document.documentElement.dataset["theme"] = "dark";
        });
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
      expect(pending).not.toBe("255,217,59");
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
    expect(await flag(page)).toBe("1");
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
    await expect(intro(page).locator("#onb-birth-hint")).toHaveText(/^5 Monate! /);
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
    expect(await flag(page)).toBe("1");
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
      await opened(page);
      // Eine gespeicherte Darstellung machte aus dem Besuch einen Bestandsnutzer (kein Onboarding, E2). Deshalb setzt
      // der Test `data-theme` wie die Wahl im Kind-Sheet (`use-app-state.ts`), nachdem das Onboarding steht.
      if (scheme.chosenDark)
        await page.evaluate(() => {
          document.documentElement.dataset["theme"] = "dark";
        });
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
