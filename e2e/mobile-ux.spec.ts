/** Mobile-UX-Gates für jede Ansicht und jedes Overlay, hell und dunkel (Plan 0003, Plan 0007, docs/architecture.md). */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import {
  backgroundLuminance,
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

/** wie FIXTURE_NOW in fixtures.ts: Mo 5.10.2026 12:00 Berlin */
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
}

/** Weg zu jeder Ansicht, ausgehend von der geladenen Startseite */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  entdecken: async () => {},
  kalender: async (page) => {
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await expect(page.getByText("Oktober 2026")).toBeVisible();
  },
  // Wochenleiste allein: Bei offenem Monat ist sie ausgeblendet (Plan 0007, E5), B3 misst aber beide Raster.
  "kalender-woche": async (page) => {
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
  },
  merkliste: async (page) => {
    await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
    await page.getByRole("button", { name: /PEKiP-Gruppe Herbst .* merken/ }).click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    await expect(page.getByTestId("offer")).toHaveCount(2);
  },
  detail: async (page) => {
    await page.getByRole("heading", { level: 3, name: /PEKiP/ }).getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
  // Regelmäßige Reihe: zwei ICS-Knöpfe nebeneinander (`.two`), die der Kurs oben nicht hat.
  "detail-regelmaessig": async (page) => {
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
  "filter-sheet": async (page) => {
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  },
  "kind-sheet": async (page) => {
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.getByLabel("Geburtsdatum").fill("01.09.2026");
    await expect(page.getByText("Dein Kind ist heute 1 Monat alt.")).toBeVisible();
  },
};

/**
 * Drei Wege zur Darstellung. Dunkel gibt es zweimal, weil die Tokens doppelt stehen (Plan 0007, E15): per System
 * (`@media`-Zweig) und per gewählter Darstellung (`data-theme="dark"`). Die Wahl wird vor dem Laden gespeichert,
 * denn unter 380 px fehlt der Theme-Knopf im Kopf (E6).
 */
const SCHEMES = [
  { label: "hell", colorScheme: "light", chosenDark: false },
  { label: "dunkel", colorScheme: "dark", chosenDark: false },
  { label: "dunkel per Darstellung", colorScheme: "light", chosenDark: true },
] as const;

async function useScheme(page: Page, scheme: (typeof SCHEMES)[number]) {
  await page.emulateMedia({ colorScheme: scheme.colorScheme, reducedMotion: "reduce" });
  if (scheme.chosenDark)
    await page.addInitScript(() => {
      localStorage.setItem("zwergenplan.darstellung", "dunkel");
    });
}

async function expectDarkTheme(page: Page, scheme: (typeof SCHEMES)[number]) {
  if (scheme.chosenDark) expect(await page.evaluate(() => document.documentElement.dataset["theme"])).toBe("dark");
}

for (const [name, go] of Object.entries(VIEWS)) {
  for (const scheme of SCHEMES) {
    test(`${name} besteht die Mobile-UX-Gates (${scheme.label})`, async ({ page }) => {
      await useScheme(page, scheme);
      await ready(page);
      await expectDarkTheme(page, scheme);
      await go(page);
      // vor expectMobileUx: dessen settle() wartet Animationen ab, die hier gar nicht erst laufen dürfen
      await expectReducedMotion(page);
      await expectMobileUx(page);
      if (scheme.label !== "hell") {
        await expectNoBrightIslands(page);
        // Der Alters-Hinweis liegt mit Grün (0,60) unter der Insel-Schwelle, soll im Dunkeln aber gedämpft sein.
        if (name === "kind-sheet") expect(await backgroundLuminance(page, ".hint.ok")).toBeLessThan(0.2);
      }
    });
  }

  test(`${name} bricht bei 320 px und 200 % Textgröße nicht aus`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await go(page);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page); // B3: Kalendertage ≥ 44 px auch bei 320 px
    await expectTextFits(page); // inkl. einzeiliger Knopf-Beschriftungen bei 100 %
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
    await expectAccessible(page);
  });
}

for (const scheme of SCHEMES.filter((s) => s.label !== "hell")) {
  test(`Toast im Dunkeln ist keine helle Insel (${scheme.label})`, async ({ page }) => {
    await useScheme(page, scheme);
    await ready(page);
    await expectDarkTheme(page, scheme);
    // Hält auch die Timer an: Der Toast (2,8 s) bleibt stehen, bis die Uhr weiterläuft (Plan 0007, E15).
    await page.clock.pauseAt(FIXTURE_NOW);
    await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
    await expect(page.getByText("Eingeklebt – liegt jetzt in deinem Stickerheft")).toBeVisible();
    await expectNoBrightIslands(page);
    await expectTextFits(page);
    await page.clock.runFor(3000);
    await expect(page.getByText("Eingeklebt – liegt jetzt in deinem Stickerheft")).toHaveCount(0);
  });
}

test("Text-Gate erkennt Überlappung", async ({ page }) => {
  await ready(page);
  // `.hdr .kid` statt `.kid`: `.hdr .kid { margin-left: auto }` in chrome.css ist spezifischer.
  await page.addStyleTag({ content: ".hdr .kid { margin-left: -40px }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Überlappung in header\.hdr/);
});

test("funktioniert mit reduzierter Bewegung", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Kurse", exact: true }).click();
  await expect(page.getByTestId("offer")).toHaveCount(2);
});

test("zeigt bei Tastaturbedienung immer den Fokus", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
  await ready(page);
  await expectVisibleFocus(page);
});

test("zeigt den Fokus auch im Detail-Dialog", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
  await ready(page);
  await VIEWS["detail"]?.(page);
  await expectVisibleFocus(page, 15);
});
