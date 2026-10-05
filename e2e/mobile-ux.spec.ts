/** Mobile-UX-Gates für jede Ansicht und jedes Overlay, hell und dunkel (Plan 0003, Plan 0007, docs/architecture.md). */
import type { Page } from "@playwright/test";
import { expect, MAP_READY, test } from "./fixtures.ts";
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

/** Startpunkt Gostenhof über das Kind-Sheet setzen (Plan 0004); das Sheet bleibt offen. */
async function pickGostenhof(page: Page) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  await expect(sheet.getByText("Startpunkt:")).toContainText("Gostenhof");
  return sheet;
}

/** Wie pickGostenhof, danach ist das Sheet wieder zu und die Kacheln zeigen Wegzeiten (Plan 0009). */
async function withGostenhof(page: Page) {
  const sheet = await pickGostenhof(page);
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Wegzeit ab Gostenhof mit Bus & Bahn");
}

/** Karte mit Stadtteil als Startpunkt (Plan 0005): Werkzeugzeile „Startpunkt: Gostenhof“, Orts-Liste mit Wegzeit. */
async function openMap(page: Page) {
  await withGostenhof(page);
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", MAP_READY);
}

/** Ansichten mit Karte: Kacheln kommen aus dem Mock (fixtures.ts). */
const MAP_VIEWS = new Set(["karte", "orts-sheet", "karte-fehler"]);

/** Ansichten mit absichtlich gescheitertem Request: Der Browser meldet ihn in der Konsole (nur diese Muster). */
const CONSOLE_ERRORS: Record<string, RegExp[]> = {
  "entdecken-wegzeit-rueckfall": [/\/data\/wegzeit\.json\b/],
  "filter-sheet-wegzeit-rueckfall": [/\/data\/wegzeit\.json\b/],
};

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
  // Plan 0004/0009: längere Meta-Zeile „Anbieter · Stadtteil · 15 Min.“ und Statuszeile „Wegzeit ab … (Di vormittags …)“
  "entdecken-wegzeit": async (page) => {
    await withGostenhof(page);
    await expect(page.getByTestId("offer").filter({ hasText: "Kuckuck im Nest" })).toContainText("5 Min.");
  },
  // Quellenhinweis mit zwei Fließtext-Links (≥ 24 px, Plan 0009, E3)
  "kind-sheet-wegzeit": async (page) => {
    const sheet = await pickGostenhof(page);
    await expect(sheet.getByRole("button", { name: "Startpunkt entfernen" })).toBeVisible();
    await expect(sheet.getByText(/^Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß/)).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Fiktiver Fahrplan für Tests" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "CC0 1.0" })).toBeVisible();
  },
  "filter-sheet-wegzeit": async (page) => {
    await withGostenhof(page);
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await sheet.getByRole("button", { name: "bis 30 Min." }).click();
    await expect(sheet.getByRole("button", { name: "bis 30 Min." })).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("heading", { name: "Wegzeit" }).scrollIntoViewIfNeeded();
  },
  // geteilter Link mit Wegzeit, aber ohne Startpunkt: Hinweis mit „Startpunkt wählen“ unter der Statuszeile
  "entdecken-wegzeit-ohne-startpunkt": async (page) => {
    await page.goto("./?wegzeit=45");
    await expect(page.getByText("„bis 45 Min.“ braucht einen Startpunkt.")).toBeVisible();
    await expect(page.getByTestId("offer").first()).toBeVisible();
  },
  "detail-wegzeit": async (page) => {
    await withGostenhof(page);
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await expect(page.getByRole("dialog").getByText("ca. 15 Min. mit Bus & Bahn ab Gostenhof")).toBeVisible();
  },
  // Tabelle blockiert (E11): Luftlinie, längste Statuszeile und Hinweis mit „Nochmal laden“
  "entdecken-wegzeit-rueckfall": async (page) => {
    await page.route("**/data/wegzeit.json", (route) => route.abort());
    await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await page.goto("./?wegzeit=30");
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");
    await expect(page.getByRole("button", { name: "Nochmal laden" })).toBeVisible();
    await expect(page.getByTestId("offer").filter({ hasText: "Kuckuck im Nest" })).toContainText("200 m");
  },
  // Tabelle zurückgehalten (M7): Platzhalter-Block statt ungefilterter Liste, Statuszeile unsichtbar (Arch-Review
  // 0009, Befund 5). Das Zeitlimit des Ladens (8 s, `TRANSIT_TIMEOUT_MS`) darf während der Prüfungen nicht ablaufen.
  // Die Uhr anzuhalten geht nicht, axe braucht laufende Timer; deshalb fällt nur der eine 8-s-Timer weg (in src
  // gibt es keinen zweiten).
  "entdecken-wegzeit-laedt": async (page) => {
    await page.addInitScript(() => {
      const original = window.setTimeout.bind(window);
      Object.defineProperty(window, "setTimeout", {
        value: (handler: TimerHandler, ms?: number, ...args: unknown[]) =>
          ms === 8000 ? 0 : original(handler, ms, ...args),
      });
    });
    await page.route("**/data/wegzeit.json", () => {});
    await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await page.goto("./?wegzeit=30");
    await expect(page.locator(".list-pending")).toHaveText("Wegzeiten werden geladen …");
    await expect(page.getByTestId("offer")).toHaveCount(0);
  },
  // Filter-Sheet bei Tabelle blockiert: gesperrte Chips, Begründung mit „Nochmal laden“ (E11, M6)
  "filter-sheet-wegzeit-rueckfall": async (page) => {
    await page.route("**/data/wegzeit.json", (route) => route.abort());
    await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await page.goto("./");
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar.");
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await expect(sheet.getByRole("button", { name: "bis 20 Min." })).toBeDisabled();
    await sheet.getByRole("button", { name: "Nochmal laden" }).scrollIntoViewIfNeeded();
  },
  // Standort außerhalb des Stadtgebiets: Begründung mit „Startpunkt wählen“ (E11, m16)
  "filter-sheet-wegzeit-ausserhalb": async (page) => {
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: 49.4, longitude: 11.2 });
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await kid.getByRole("button", { name: "Meinen Standort nutzen" }).click();
    await expect(kid.getByText("Startpunkt:")).toContainText("Mein Standort");
    await kid.getByRole("button", { name: "Fertig" }).click();
    await expect(page.getByRole("status")).toContainText("außerhalb des Stadtgebiets.");
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await expect(sheet.getByText("Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg.")).toBeVisible();
    await sheet.getByRole("button", { name: "Startpunkt wählen" }).scrollIntoViewIfNeeded();
  },
  karte: openMap,
  // Fehlerzustand (E12): Meldung im Kartenrahmen, Orts-Liste und „Startpunkt …“ bleiben, keine Kartenmitte
  "karte-fehler": async (page) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type === "webgl" || type === "webgl2") return null;
          return Reflect.apply(original, this, [type, ...rest]);
        },
      });
    });
    await page.reload();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await withGostenhof(page);
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "fehler", MAP_READY);
    await expect(page.locator(".map-box")).toContainText("Dein Browser kann die Karte nicht zeigen.");
  },
  "orts-sheet": async (page) => {
    await openMap(page);
    await page
      .getByRole("region", { name: "Orte" })
      .getByRole("button", { name: /^Familientreff Beispielhof/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Familientreff Beispielhof" })).toBeVisible();
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
  test.describe(name, () => {
    if (MAP_VIEWS.has(name)) test.use({ tiles: "mock" });
    const allowed = CONSOLE_ERRORS[name];
    if (allowed) test.use({ allowedConsoleErrors: allowed });
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

test("Text-Gate erkennt Text in der Rundung, auch im Scroll-Container des Sheets", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  // „Filter“ rückt ganz in die obere linke Ecke des Sheets (Radius 28 px), bleibt aber sichtbar.
  await page.addStyleTag({ content: ".sheet-scroll { padding: 0 !important } .sheet .grab { display: none }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text stößt an die Rundung von dialog\.dlg: „Filter“/);
  // auch bei 200 %: Ungescrollt (`scrollTop = 0`) zählt die Zeile an der Oberkante (Prüfung 3, Plan 0008, E3)
  await setTextScale(page, 2);
  await expect(expectTextFits(page, { scale: 2 })).rejects.toThrow(
    /Text stößt an die Rundung von dialog\.dlg: „Filter“/,
  );
});

/** Kalender bei 320 px (Wochenleiste dehnt sich in den Seitenrand, calendar.css), reduzierte Bewegung */
async function calendarAt320(page: Page) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
}

// Plan 0008, E2: Die Woche 26.10.–1.11. beginnt mit „26“. Die Tageszahl steckt sichtbar in button.day, das per
// negativem Rand über das unsichtbare fieldset.plain hinausreicht. Die Uhr bleibt am Datenstand (Fixture).
test("Text-Gate: Woche mit zweistelligem Montag bei 320 px", async ({ page }) => {
  await weekWithTwoDigitMonday(page);
  await expectTextFits(page);
});

test("Text-Gate erkennt Text, der aus seinem sichtbaren Kasten ragt", async ({ page }) => {
  await calendarAt320(page);
  // relative Verschiebung statt Rand: Ein Rand verpufft in der zentrierenden Flex-Spalte von .day
  await page.addStyleTag({ content: ".day .num { position: relative; left: -40px }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text ragt aus button\.day/);
});

/** Woche 26.10.–1.11. bei 320 px: „26“ ragt per negativem Rand über fieldset.plain hinaus (E2). */
async function weekWithTwoDigitMonday(page: Page) {
  await calendarAt320(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Nächste Woche" }).click();
  await expect(page.locator(".week .day .num").first()).toHaveText("26");
}

// Grenzen der E2-Lockerung (Arch-Review 0008, M1): Ein Ausbruch über einen Vorfahren mit sichtbarer Kante oder über
// einen abschneidenden Vorfahren bleibt rot.
test("Text-Gate erkennt Ausbruch über einen Kasten mit sichtbarem Rand", async ({ page }) => {
  await weekWithTwoDigitMonday(page);
  await page.addStyleTag({ content: "fieldset.plain { border: 1px solid currentColor }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text ragt aus fieldset\.plain/);
});

test("Text-Gate erkennt Ausbruch über einen abschneidenden Kasten", async ({ page }) => {
  await weekWithTwoDigitMonday(page);
  await page.addStyleTag({ content: "fieldset.plain { overflow: hidden }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text ragt aus fieldset\.plain/);
});

test("Text-Gate erkennt Text, der aus einem unsichtbaren Kasten ragt", async ({ page }) => {
  await ready(page);
  // `flex: none`, sonst setzt `flex: 1 1 10rem` die Breite außer Kraft. Kein sichtbarer Kasten liegt dazwischen.
  await page.addStyleTag({ content: ".status-row > .status { flex: none; width: 2rem; white-space: nowrap }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text ragt aus p\.status/);
});

// Plan 0008, E3: Eine an der Oberkante des Scrollbereichs angeschnittene Zeile ist Scroll-Zustand, kein Layout.
test("Text-Gate übergeht halb hinausgescrollte Überschriften im Sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  await setTextScale(page, 2);
  const crossing = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("dialog[open] .sheet-scroll");
    const h = [...document.querySelectorAll("dialog[open] h3")].find((x) => x.textContent?.trim() === "Kosten");
    if (!el || !h) throw new Error("Scrollbereich oder „Kosten“ fehlt");
    const hr = h.getBoundingClientRect();
    el.scrollTop += hr.top - el.getBoundingClientRect().top + hr.height / 2;
    const top = el.getBoundingClientRect().top;
    const r = h.getBoundingClientRect();
    return r.top < top && top < r.bottom;
  });
  expect(crossing, "„Kosten“ kreuzt die Oberkante des Scrollbereichs").toBe(true);
  await expectTextFits(page, { scale: 2 });
});

test("Bewegungs-Gate erkennt Transition trotz Reduce", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  // auch 0,01 ms ist eine echte Transition, die WebKit verspätet abschließt (Plan 0008, E1)
  await page.addStyleTag({ content: ".brand { transition: color 0.01ms !important }" });
  await expect(expectReducedMotion(page)).rejects.toThrow(/transition auf .*brand/);
  // .brand ist spezifischer als `*` in motion.css, beide ungeschichtet und !important
  await page.addStyleTag({ content: ".brand { transition: color 0.3s !important }" });
  await expect(expectReducedMotion(page)).rejects.toThrow(/transition auf .*brand/);
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

test.describe("Karte", () => {
  test.use({ tiles: "mock" });

  test("zeigt den Fokus auf Kartenfläche, Zoom, Attribution, Werkzeugzeile und Orts-Liste", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
    await ready(page);
    await openMap(page);
    await expectVisibleFocus(page, 60);
  });
});
