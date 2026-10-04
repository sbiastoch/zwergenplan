/**
 * Layout über Breiten und Lagen (Plan 0007): Kopfzeile einzeilig von 320 bis 420 px (E6, B5) und Tab-Leiste im
 * Querformat (E14, H1). Gemessen wird mit offset*, wo Elemente gedreht sind (Kind-Chip 1,5°, Tab-Leiste −0,6°):
 * Gedrehte Boxen sind im Bounding-Rect größer.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { expectNoHorizontalScroll, expectTextFits, setTextScale } from "./mobile-ux.ts";

const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

test.beforeEach(() => {
  test.skip(!["pixel-7", "iphone-15"].includes(test.info().project.name), "Layout-Matrix je Engine einmal");
});

async function ready(page: Page) {
  // nicht auf `load` warten: WebKit hält `load` an, solange die zurückgehaltene Webfont lädt
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("offer").first()).toBeVisible();
}

/**
 * Webfont dauerhaft zurückhalten: Die Anfrage wird nie beantwortet, die Seite bleibt bei der Fallback-Schrift der
 * Maschine. Ein `abort()` meldet der Browser als Konsolenfehler, und der macht jeden Test rot (fixtures.ts).
 */
async function holdWebfontForever(page: Page) {
  await page.route("**/assets/*.woff2", () => {});
}

const HEADER_WIDTHS = [320, 360, 365, 370, 384, 390, 412, 420];
const LABELS = [
  { label: "Alter?", birthDate: undefined },
  { label: "23 Mon.", birthDate: "01.11.2024" }, // längstes Label
] as const;

for (const font of ["Webfont", "Fallback-Schrift"] as const) {
  for (const { label, birthDate } of LABELS) {
    test(`Kopfzeile bleibt einzeilig (${label}, ${font})`, async ({ page }) => {
      if (font === "Fallback-Schrift") await holdWebfontForever(page);
      await ready(page);
      if (birthDate) {
        await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
        await page.getByLabel("Geburtsdatum").fill(birthDate);
        await page.getByRole("button", { name: "Fertig" }).click();
      }
      await expect(page.getByRole("button", { name: `Kind und Einstellungen, Alter ${label}` })).toBeVisible();
      const webfont = await page.evaluate(async () => {
        // Status der Faces statt fonts.check(): WebKit meldet bei noch ladender Schrift `true`.
        const loaded = () =>
          [...document.fonts].some(
            (f) => f.family.replaceAll('"', "") === "Bricolage Grotesque Variable" && f.status === "loaded",
          );
        if (loaded()) return true;
        // Nur im Webfont-Zustand lädt sie; zurückgehalten bliebe load() hängen, deshalb mit Frist.
        await Promise.race([
          document.fonts.load('800 22px "Bricolage Grotesque Variable"'),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
        return loaded();
      });
      expect(webfont, "Schriftzustand").toBe(font === "Webfont");

      for (const width of HEADER_WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        const m = await page.evaluate(() => {
          const hdr = document.querySelector<HTMLElement>(".hdr");
          const brand = hdr?.querySelector<HTMLElement>(".brand");
          const button = hdr?.querySelector<HTMLElement>(".iconbtn");
          if (!hdr || !brand || !button) throw new Error("Kopfzeile fehlt");
          const items = [...hdr.children].filter(
            (c): c is HTMLElement => c instanceof HTMLElement && c.offsetWidth > 0,
          );
          const mids = items.map((c) => c.offsetTop + c.offsetHeight / 2);
          const s = getComputedStyle(brand);
          const lineHeight = s.lineHeight.endsWith("px")
            ? Number.parseFloat(s.lineHeight)
            : 1.4 * Number.parseFloat(s.fontSize);
          return {
            spread: Math.max(...mids) - Math.min(...mids),
            brandHeight: brand.offsetHeight,
            lineHeight,
            headerHeight: hdr.offsetHeight,
            button: button.offsetWidth > 0,
          };
        });
        const at = `${width} px, ${label}, ${font}`;
        expect(m.spread, `${at}: alle Teile der Kopfzeile in einer Zeile`).toBeLessThan(2);
        expect(m.brandHeight, `${at}: „Zwergenplan“ einzeilig`).toBeLessThan(1.5 * m.lineHeight);
        expect(m.headerHeight, `${at}: Kopfzeile höchstens 66 px hoch`).toBeLessThanOrEqual(66);
        if (width >= 384) expect(m.button, `${at}: Theme-Knopf sichtbar`).toBe(true);
        if (width <= 370) expect(m.button, `${at}: Theme-Knopf ausgeblendet`).toBe(false);
      }
    });
  }
}

/** Ränder der Tab-Leiste, von `main` und der ersten Kachel im Viewport */
async function boxes(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (!r) throw new Error(`${sel} fehlt`);
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    };
    const tabs = document.querySelector<HTMLElement>(".tabs");
    return {
      tabs: box(".tabs"),
      tabsHeight: tabs?.offsetHeight ?? 0,
      main: box("main"),
      card: box("[data-testid=offer]"),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

for (const viewport of [
  { width: 915, height: 412 },
  { width: 852, height: 393 },
]) {
  test(`Querformat ${viewport.width}×${viewport.height}: Tab-Leiste als Seitenleiste neben dem Inhalt`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    const b = await boxes(page);
    expect(b.tabs.right, "Leiste links neben main").toBeLessThanOrEqual(b.main.left);
    // Erste Kachel ohne Scrollen sichtbar und nicht verdeckt: mindestens 80 px ihrer Höhe frei im Bild.
    const covered = b.tabs.left < b.card.right && b.tabs.right > b.card.left ? b.tabs.top : b.viewport.height;
    expect(Math.min(b.viewport.height, covered) - b.card.top, "freie Höhe der ersten Kachel").toBeGreaterThanOrEqual(
      80,
    );
  });
}

test("Querformat 915×412: Toast steht über der Inhaltsspalte, nicht über der Leiste", async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.clock.pauseAt(FIXTURE_NOW); // Toast bleibt stehen (Plan 0007, E15)
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await expect(page.getByText("Eingeklebt – liegt jetzt in deinem Stickerheft")).toBeVisible();
  const t = await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>(".toast");
    const main = document.querySelector("main")?.getBoundingClientRect();
    const tabs = document.querySelector(".tabs")?.getBoundingClientRect();
    if (!toast || !main || !tabs) throw new Error("Toast, main oder Leiste fehlt");
    // Ungedrehte Box: Mittelpunkt bleibt bei Drehung gleich, die Breite kommt aus offsetWidth (Toast −1°).
    const r = toast.getBoundingClientRect();
    const center = (r.left + r.right) / 2;
    return {
      left: center - toast.offsetWidth / 2,
      right: center + toast.offsetWidth / 2,
      main: { left: main.left, right: main.right },
      tabsRight: tabs.right,
    };
  });
  expect(t.left, "Toast links innerhalb von main").toBeGreaterThanOrEqual(t.main.left - 0.5);
  expect(t.right, "Toast rechts innerhalb von main").toBeLessThanOrEqual(t.main.right + 0.5);
  expect(t.left, "Toast überlappt die Leiste nicht").toBeGreaterThanOrEqual(t.tabsRight);
});

test("Querformat 568×320: kompakte Tab-Leiste", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await ready(page);
  const b = await boxes(page);
  expect(b.tabsHeight, "Leiste höchstens 56 px hoch").toBeLessThanOrEqual(56);
});

test("Hochformat 412×915: Tab-Leiste unverändert unten", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await ready(page);
  const b = await boxes(page);
  expect(b.tabs.bottom, "unten").toBeGreaterThan(b.viewport.height - 30);
  expect(b.tabs.width, "über die Breite").toBeGreaterThan(0.9 * b.viewport.width - 16);
});

/** Engste Kombination: Seitenleiste plus große Schrift bei geringer Höhe (Pixel 7 quer, Plan 0007, E14). */
const LANDSCAPE_200: Record<string, (page: Page) => Promise<void>> = {
  Start: async () => {},
  Kalender: async (page) => {
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
  },
  Detail: async (page) => {
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
};

for (const [name, go] of Object.entries(LANDSCAPE_200)) {
  test(`Querformat 863×360 bei 200 %: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 863, height: 360 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await go(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
    // Tab-Labels sind per Container-Query ausgeblendet oder passen in ihre Spalte.
    const tooWide = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".tab")]
        .filter((tab) => {
          const label = tab.querySelector<HTMLElement>(".tab-label");
          if (!label) return true;
          if (label.getBoundingClientRect().width <= 1) return false;
          return label.scrollWidth > tab.clientWidth + 0.5;
        })
        .map((tab) => tab.textContent?.trim() ?? ""),
    );
    expect(tooWide, "Tab-Labels breiter als ihre Spalte").toEqual([]);
  });
}
