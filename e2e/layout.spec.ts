/**
 * Layout über Breiten und Lagen (Plan 0007): Kopfzeile einzeilig von 320 bis 420 px (E6, B5) und Tab-Leiste im
 * Querformat (E14, H1). Gemessen wird mit offset*, wo Elemente gedreht sind (Kind-Chip 1,5°, Tab-Leiste −0,6°):
 * Gedrehte Boxen sind im Bounding-Rect größer.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectNoBrightIslands,
  expectNoHorizontalScroll,
  expectTextFits,
  expectTouchTargets,
  setTextScale,
} from "./mobile-ux.ts";

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
  // Plan 0010, E2: vierter Tab und Merkliste mit Badge in der Seitenleiste
  Anbieter: async (page) => {
    await page.getByRole("button", { name: "Anbieter", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Anbieter mit");
  },
  "Merkliste mit Badge": async (page) => {
    await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    await expect(page.locator(".tab .badge")).toHaveText("1");
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

/** Dunkel auf beiden Wegen (Plan 0007, E15): per System und per gewählter Darstellung (vor dem Laden gespeichert). */
const DARK = [
  { label: "dunkel", colorScheme: "dark", chosen: false },
  { label: "dunkel per Darstellung", colorScheme: "light", chosen: true },
] as const;

async function useDark(page: Page, dark: (typeof DARK)[number]) {
  await page.emulateMedia({ colorScheme: dark.colorScheme, reducedMotion: "reduce" });
  if (dark.chosen)
    await page.addInitScript(() => {
      localStorage.setItem("zwergenplan.darstellung", "dunkel");
    });
}

async function openKrabbeltreff(page: Page) {
  await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** Plan 0008, E6: Bei wenig Höhe (< 34 rem) steht der ICS-Fuß am Ende des Inhalts, der Kopf bleibt stehen. */
test.describe("ICS-Fuß im Detail", () => {
  test("bei 320 px und 200 % scrollt der Fuß mit, Zurück bleibt sichtbar, Toast im Viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await setTextScale(page, 2);
    await openKrabbeltreff(page);
    const dialog = page.getByRole("dialog");
    const foot = dialog.locator(".dfoot");
    const start = await foot.evaluate((el) => ({ top: el.getBoundingClientRect().top, height: window.innerHeight }));
    expect(start.top, "Fuß liegt anfangs ganz unter dem Viewport").toBeGreaterThanOrEqual(start.height);

    await foot.scrollIntoViewIfNeeded();
    const all = dialog.getByRole("link", { name: "Alle Termine" });
    await expect(all).toBeInViewport();
    await all.click({ trial: true });
    await expect(dialog.getByRole("button", { name: "Zurück" })).toBeInViewport({ ratio: 1 });

    // Toast bleibt am Viewport, nicht an der scrollenden Hülle (Plan 0008, E6: Layout-Containment)
    await page.clock.pauseAt(FIXTURE_NOW);
    const [download] = await Promise.all([page.waitForEvent("download"), all.click()]);
    expect(download.suggestedFilename()).toMatch(/\.ics$/);
    const toast = page.locator(".toast").filter({ hasText: /^Kalenderdatei mit .* geladen$/ });
    await expect(toast).toBeVisible();
    await expect(toast).toBeInViewport({ ratio: 1 });
  });

  for (const dark of DARK) {
    test(`bei 320 px und 200 % gescrollt ohne helle Inseln (${dark.label})`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await useDark(page, dark);
      await ready(page);
      await setTextScale(page, 2);
      await openKrabbeltreff(page);
      await page.getByRole("dialog").locator(".dfoot").scrollIntoViewIfNeeded();
      await expectNoBrightIslands(page);
      await expectAccessible(page);
    });
  }

  test("bei 412×915 und 100 % bleibt der Fuß fest unten", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await openKrabbeltreff(page);
    const gap = await page
      .getByRole("dialog")
      .locator(".dfoot")
      .evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom);
    expect(Math.abs(gap), "Fuß endet bündig am unteren Rand").toBeLessThanOrEqual(1);
  });
});

/** Monatsraster 320 × 640 mit offenem Monat */
async function openMonth(page: Page) {
  await page.setViewportSize({ width: 320, height: 640 });
  await ready(page);
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
  await expect(page.getByText("Oktober 2026")).toBeVisible();
}

/** Je Zeile des Monatsrasters: Alpha des Hintergrunds je freigegebenem Tag und Lücken zwischen den Feldern. */
async function monthFields(page: Page) {
  return page.evaluate(() => {
    const alpha = (color: string) => {
      if (color === "transparent") return 0;
      const m = color.match(/\/\s*([\d.]+%?)\s*\)$/) ?? color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\)$/);
      if (!m?.[1]) return 1;
      return m[1].endsWith("%") ? Number.parseFloat(m[1]) / 100 : Number.parseFloat(m[1]);
    };
    const days = [...document.querySelectorAll<HTMLButtonElement>(".mgrid .mday")].filter((d) => !d.disabled);
    const rows = new Map<number, HTMLButtonElement[]>();
    for (const d of days) rows.set(d.offsetTop, [...(rows.get(d.offsetTop) ?? []), d]);
    const transparent: string[] = [];
    const tight: string[] = [];
    for (const row of rows.values()) {
      row.sort((a, b) => a.offsetLeft - b.offsetLeft);
      for (const d of row) {
        const pressed = d.getAttribute("aria-pressed") === "true";
        if (!pressed && alpha(getComputedStyle(d).backgroundColor) === 0) transparent.push(d.textContent ?? "");
      }
      for (const [i, a] of row.entries()) {
        const b = row[i + 1];
        if (!b) continue;
        // Hintergrundfläche = Border-Box minus 2 px durchsichtiger Rand je Seite (padding-box)
        const gap = b.offsetLeft + 2 - (a.offsetLeft + a.offsetWidth - 2);
        if (gap < 3) tight.push(`${a.textContent}|${b.textContent}: ${gap} px`);
      }
    }
    return { count: days.length, transparent, tight };
  });
}

/** Plan 0008, E7: Bei großer Schrift bekommt jeder Tag im Monatsraster ein eigenes Feld. */
test.describe("Monatsraster", () => {
  test("bei 200 % hat jeder Tag ein eigenes Feld mit Abstand", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openMonth(page);
    await setTextScale(page, 2);
    const f = await monthFields(page);
    expect(f.count, "freigegebene Tage").toBeGreaterThan(20);
    expect(f.transparent, "Tage ohne Feld").toEqual([]);
    expect(f.tight, "Felder mit weniger als 3 px Abstand").toEqual([]);
  });

  test("bei 100 % bleiben nicht gewählte Tage ohne Hintergrund", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openMonth(page);
    const f = await monthFields(page);
    // alle nicht gewählten Tage durchsichtig: transparent enthält jeden davon
    const unpressed = await page.locator(".mgrid .mday:not(:disabled):not([aria-pressed='true'])").count();
    expect(f.transparent).toHaveLength(unpressed);
    await expectTouchTargets(page);
  });

  for (const dark of DARK) {
    test(`bei 200 % ohne helle Inseln, Kontrast hält (${dark.label})`, async ({ page }) => {
      await useDark(page, dark);
      await openMonth(page);
      await setTextScale(page, 2);
      await expectNoBrightIslands(page);
      await expectAccessible(page);
    });
  }
});

/**
 * Mehr gemerkte Angebote, als die Fixture hat (9): `site.json` bekommt Kopien des Krabbeltreffs mit eigener ID, die
 * Merkliste kennt nur die Kopien. Nur über Netz und localStorage, die Seite bleibt Black-Box.
 */
async function saveCopies(page: Page, count: number) {
  const ids = Array.from({ length: count }, (_, i) => `badge-kopie-${i}`);
  await page.route("**/data/site.json", async (route) => {
    const response = await route.fetch();
    const site = (await response.json()) as { offers: { id: string; title: string }[] };
    const template = site.offers.find((o) => o.title === "Offener Krabbeltreff");
    if (!template) throw new Error("Krabbeltreff fehlt in den Fixture-Daten");
    site.offers.push(...ids.map((id) => ({ ...template, id })));
    await route.fulfill({ response, json: site });
  });
  await page.addInitScript((saved) => localStorage.setItem("zwergenplan.merkliste", saved), JSON.stringify(ids));
}

/**
 * Plan 0008, E8: Das Merklisten-Badge überdeckt in den Querformat-Leisten weder Label noch Herz. W1 (Browser-Review
 * live zu Plan 0008): Zweistellig brach es bei 568×320/200 % senkrecht um, deshalb auch 10 und 100 gemerkte; danach
 * stand der Tab-Inhalt in der kompakten Leiste ab 150 % seitlich über seiner Karte.
 */
test.describe("Badge im Querformat", () => {
  for (const viewport of [
    { width: 568, height: 320 },
    { width: 639, height: 320 }, // breiteste kompakte Leiste
    { width: 863, height: 360 },
  ]) {
    for (const [scale, count] of [1, 1.5, 2].flatMap((s) => [1, 10, 100].map((n) => [s, n] as const))) {
      const at = `${viewport.width}×${viewport.height} bei ${scale * 100} %, ${count} gemerkt`;

      /** gemerkte Angebote, Merkliste offen, Textgröße gesetzt */
      const prepare = async (page: Page) => {
        await page.setViewportSize(viewport);
        if (count > 1) await saveCopies(page, count);
        await ready(page);
        if (count === 1) await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
        await page.getByRole("button", { name: /^Merkliste/ }).click();
        await expect(page.getByTestId("offer")).toHaveCount(count);
        await expect(page.locator(".tab .badge")).toHaveText(String(count));
        await setTextScale(page, scale);
      };

      test(`${at}: Badge, Label und Herz überschneiden sich nicht, Daumen auf dem Tab`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await prepare(page);
        const m = await page.evaluate(() => {
          const tab = document.querySelector<HTMLElement>(".tab[aria-current='page']");
          const badge = tab?.querySelector(".badge");
          const label = tab?.querySelector(".tab-label");
          const icon = tab?.querySelector("svg");
          const thumb = document.querySelector<HTMLElement>(".tab-thumb");
          if (!tab || !badge || !label || !icon || !thumb) throw new Error("Merklisten-Tab unvollständig");
          const rect = (el: Element) => el.getBoundingClientRect();
          // Ausgeblendetes Label (sr-only) ist 1 px breit, in der gedrehten Leiste (−0,6°) etwas mehr.
          const HIDDEN = 2;
          const overlap = (a: DOMRect, b: DOMRect) =>
            Math.min(
              Math.min(a.right, b.right) - Math.max(a.left, b.left),
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
            );
          const labelBox = rect(label);
          // Die Verschiebung des Daumens steckt im transform (tabs.css), offset* kennt sie nicht.
          const t = new DOMMatrixReadOnly(getComputedStyle(thumb).transform);
          // Sichtbare Karte des Tabs ist `.tab-thumb::before` (eingerückt, tabs.css). Herz, Label und Badge stehen
          // darauf; ragen sie seitlich hinaus, stehen sie auf dem Tape (W1, Browser-Review live zu Plan 0008).
          const card = getComputedStyle(thumb, "::before");
          const thumbBox = rect(thumb);
          const cardLeft = thumbBox.left + Number.parseFloat(card.left);
          const cardRight = thumbBox.right - Number.parseFloat(card.right);
          const parts = [icon, label, badge].map(rect).filter((r) => r.width > HIDDEN);
          return {
            beyondCard: Math.max(...parts.map((r) => Math.max(cardLeft - r.left, r.right - cardRight))),
            label: labelBox.width > HIDDEN ? overlap(rect(badge), labelBox) : Number.NEGATIVE_INFINITY,
            icon: overlap(rect(badge), rect(icon)),
            thumb: { top: thumb.offsetTop + t.m42, height: thumb.offsetHeight, left: thumb.offsetLeft + t.m41 },
            tab: { top: tab.offsetTop, height: tab.offsetHeight, left: tab.offsetLeft, width: tab.offsetWidth },
            thumbWidth: thumb.offsetWidth,
          };
        });
        expect(m.beyondCard, `${at}: Herz, Label oder Badge ragt seitlich über die Tab-Karte`).toBeLessThanOrEqual(1);
        expect(m.label, `${at}: Badge über dem Label`).toBeLessThanOrEqual(0.5);
        expect(m.icon, `${at}: Badge über dem Herz`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(m.thumb.top - m.tab.top), `${at}: Daumen oben bündig mit dem Tab`).toBeLessThanOrEqual(2);
        expect(Math.abs(m.thumb.height - m.tab.height), `${at}: Daumen so hoch wie der Tab`).toBeLessThanOrEqual(2);
        expect(Math.abs(m.thumb.left - m.tab.left), `${at}: Daumen links bündig mit dem Tab`).toBeLessThanOrEqual(2);
        expect(Math.abs(m.thumbWidth - m.tab.width), `${at}: Daumen so breit wie der Tab`).toBeLessThanOrEqual(2);
        await expectNoHorizontalScroll(page);
        await expectTextFits(page, { scale });
      });

      // Farben hängen nicht an der Textgröße: dunkel nur bei 100 und 200 %
      for (const dark of scale === 1.5 ? [] : DARK) {
        test(`${at}: Badge ohne helle Inseln, Kontrast hält (${dark.label})`, async ({ page }) => {
          await useDark(page, dark);
          await prepare(page);
          await expectNoBrightIslands(page);
          await expectAccessible(page);
        });
      }
    }
  }
});

/** Plan 0008, E9: Der Toast ist reine Meldung und fängt keine Tipps ab. */
test("Toast lässt Tipps durch (320 px, 200 %)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await page.getByRole("button", { name: /PEKiP-Gruppe Herbst .* merken/ }).click();
  await page.getByRole("button", { name: /^Merkliste/ }).click();
  await expect(page.getByTestId("offer")).toHaveCount(2);
  await setTextScale(page, 2);
  await page.clock.pauseAt(FIXTURE_NOW); // Toast bleibt stehen (Plan 0007, E15)
  await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  const toast = page.locator(".toast").filter({ hasText: "Sticker abgelöst" });
  await expect(toast).toBeVisible();
  const inside = await toast.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return hit !== null && el.contains(hit);
  });
  expect(inside, "Tipp in der Mitte des Toasts trifft den Toast").toBe(false);
  await page.getByRole("button", { name: "Alle in den Kalender" }).click({ trial: true });
});

/** Plan 0008, E10: Im Filter-Fuß ist „Zurücksetzen“ ein Textknopf, der Fuß einzeilig ab 360 px. */
for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`Filter-Fuß einzeilig bei ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await expect(sheet).toBeVisible();
    const top = (el: HTMLElement | SVGElement) => (el instanceof HTMLElement ? el.offsetTop : Number.NaN);
    const reset = await sheet.getByRole("button", { name: "Zurücksetzen" }).evaluate(top);
    const show = await sheet.getByRole("button", { name: /Angebote zeigen$/ }).evaluate(top);
    expect(reset, "„Zurücksetzen“ und „… Angebote zeigen“ in einer Zeile").toBe(show);
    const height = await sheet.locator(".sheetfoot").evaluate((el) => el.getBoundingClientRect().height);
    expect(height, "Fuß höchstens 90 px hoch").toBeLessThanOrEqual(90);
  });
}

/** Plan 0008, E13: Textknöpfe übernehmen die Ausrichtung der Umgebung, im Kind-Sheet also linksbündig. */
test("„Startpunkt entfernen“ bleibt bei 200 % linksbündig", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  const button = sheet.getByRole("button", { name: "Startpunkt entfernen" });
  await expect(button).toBeVisible();
  await setTextScale(page, 2);
  const m = await button.evaluate((el) => {
    const text = [...el.childNodes].find((n) => n instanceof Text && n.data.trim() !== "");
    if (!text) throw new Error("Textknoten fehlt");
    const range = document.createRange();
    range.selectNodeContents(text);
    const s = getComputedStyle(el);
    return {
      lefts: [...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => r.left),
      contentLeft:
        el.getBoundingClientRect().left + Number.parseFloat(s.borderLeftWidth) + Number.parseFloat(s.paddingLeft),
    };
  });
  expect(m.lefts.length, "Text muss bei 200 % zweizeilig sein, sonst prüft der Test nichts").toBeGreaterThanOrEqual(2);
  for (const left of m.lefts)
    expect(Math.abs(left - m.contentLeft), "Zeile am linken Innenrand").toBeLessThanOrEqual(1);
});

/** Plan 0008, E14: Anbieternamen trennen nach Silben wie Titel (Sichtprüfung der Trennstelle im Browser-Review). */
test("Anbietername in Kachel und Detail mit hyphens: auto", async ({ page }) => {
  await ready(page);
  expect(
    await page
      .locator(".card .meta")
      .first()
      .evaluate((el) => getComputedStyle(el).hyphens),
  ).toBe("auto");
  await openKrabbeltreff(page);
  expect(await page.locator(".hero .meta").evaluate((el) => getComputedStyle(el).hyphens)).toBe("auto");
});

/**
 * Plan 0010, E2: Tab-Leiste mit vier Tabs (Entdecken · Kalender · Anbieter · Merkliste). Gemessen werden Spalten,
 * Labels, Icons, Badge, Daumen und die sichtbare Pille (`.tab-thumb::before`) als Rechtecke im Viewport.
 */
type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

async function tabBar(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const bar = document.querySelector<HTMLElement>(".tabs");
    const thumb = document.querySelector<HTMLElement>(".tab-thumb");
    if (!bar || !thumb) throw new Error("Tab-Leiste fehlt");
    const tabs = [...bar.querySelectorAll<HTMLElement>(".tab")].map((tab) => {
      const label = tab.querySelector<HTMLElement>(".tab-label");
      const icon = tab.querySelector("svg");
      if (!label || !icon) throw new Error("Tab unvollständig");
      const badge = tab.querySelector(".badge");
      return {
        name: label.textContent ?? "",
        active: tab.getAttribute("aria-current") === "page",
        box: box(tab),
        offset: { top: tab.offsetTop, height: tab.offsetHeight, left: tab.offsetLeft, width: tab.offsetWidth },
        clientWidth: tab.clientWidth,
        scrollWidth: tab.scrollWidth,
        label: box(label),
        labelScrollWidth: label.scrollWidth,
        icon: box(icon),
        badge: badge ? box(badge) : undefined,
      };
    });
    // Die Verschiebung des Daumens steckt im transform, offset* kennt sie nicht.
    const t = new DOMMatrixReadOnly(getComputedStyle(thumb).transform);
    const pill = getComputedStyle(thumb, "::before");
    const thumbBox = box(thumb);
    return {
      bar: box(bar),
      barHeight: bar.offsetHeight,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      tabs,
      thumb: { top: thumb.offsetTop + t.m42, height: thumb.offsetHeight },
      pill: {
        left: thumbBox.left + Number.parseFloat(pill.left),
        right: thumbBox.right - Number.parseFloat(pill.right),
      },
    };
  });
}

/** Ausgeblendetes Label (sr-only) ist 1 px breit, in der gedrehten Leiste etwas mehr. */
const HIDDEN = 2;
const overlap = (a: Box, b: Box) =>
  Math.min(
    Math.min(a.right, b.right) - Math.max(a.left, b.left),
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  );
const inside = (inner: Box, outer: Box, tolerance = 0.5) =>
  inner.left >= outer.left - tolerance &&
  inner.right <= outer.right + tolerance &&
  inner.top >= outer.top - tolerance &&
  inner.bottom <= outer.bottom + tolerance;

const TAB_NAMES = ["Entdecken", "Kalender", "Anbieter", "Merkliste"];

/** Startseite, `count` Angebote gemerkt (Badge an der Merkliste), Bewegung aus */
async function withBadge(page: Page, viewport: { width: number; height: number }, count: number) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (count > 1) await saveCopies(page, count);
  await ready(page);
  if (count === 1) await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
  await expect(page.locator(".tab .badge")).toHaveText(String(count));
}

test.describe("Tab-Leiste mit vier Tabs (Plan 0010, E2)", () => {
  for (const width of [320, 360, 390, 412]) {
    test(`hochkant ${width} px bei 100 %: vier Labels einzeilig, aktives Label auf der Pille, Badge in der Spalte`, async ({
      page,
    }) => {
      await withBadge(page, { width, height: 800 }, 1);
      for (const name of TAB_NAMES) {
        await page.getByRole("button", { name: new RegExp(`^${name}(\\s|$)`) }).click();
        const m = await tabBar(page);
        expect(m.tabs.map((t) => t.name)).toEqual(TAB_NAMES);
        const at = `${width} px, ${name} aktiv`;
        for (const t of m.tabs) {
          expect(t.label.width, `${at}: Label „${t.name}“ sichtbar`).toBeGreaterThan(HIDDEN);
          expect(t.labelScrollWidth, `${at}: Label „${t.name}“ einzeilig in der Spalte`).toBeLessThanOrEqual(
            t.clientWidth,
          );
          expect(t.offset.width, `${at}: Spalte „${t.name}“ breit genug`).toBeGreaterThanOrEqual(44);
          expect(t.offset.height, `${at}: Spalte „${t.name}“ hoch genug`).toBeGreaterThanOrEqual(56);
        }
        const active = m.tabs.find((t) => t.active);
        expect(active?.name, at).toBe(name);
        if (!active) continue;
        expect(active.label.left, `${at}: aktives Label links auf der Pille`).toBeGreaterThanOrEqual(m.pill.left - 1);
        expect(active.label.right, `${at}: aktives Label rechts auf der Pille`).toBeLessThanOrEqual(m.pill.right + 1);
        const saved = m.tabs[3];
        if (!saved?.badge) throw new Error("Badge fehlt");
        expect(inside(saved.badge, saved.box), `${at}: Badge in der eigenen Spalte`).toBe(true);
        expect(inside(saved.badge, m.bar), `${at}: Badge in der Leiste`).toBe(true);
      }
    });
  }

  for (const [width, scale, labels] of [
    [412, 1.25, true],
    [412, 1.5, false],
    [412, 1.75, false],
    [320, 2, false],
    [412, 2, false],
  ] as const) {
    for (const count of [1, 10]) {
      const at = `hochkant ${width} px bei ${scale * 100} %, ${count} gemerkt`;
      test(`${at}: ${labels ? "Labels einzeilig" : "nur Icons"}, Badge in der Spalte, frei`, async ({ page }) => {
        await withBadge(page, { width, height: 800 }, count);
        await setTextScale(page, scale);
        const m = await tabBar(page);
        for (const t of m.tabs) {
          if (labels) {
            expect(t.label.width, `${at}: Label „${t.name}“ sichtbar`).toBeGreaterThan(HIDDEN);
            expect(t.labelScrollWidth, `${at}: Label „${t.name}“ einzeilig`).toBeLessThanOrEqual(t.clientWidth);
          } else {
            expect(t.label.width, `${at}: Label „${t.name}“ nur für Screenreader`).toBeLessThanOrEqual(HIDDEN);
          }
          expect(inside(t.icon, t.box), `${at}: Icon „${t.name}“ in der Spalte`).toBe(true);
        }
        const saved = m.tabs[3];
        const neighbour = m.tabs[2];
        if (!saved?.badge || !neighbour) throw new Error("Badge fehlt");
        expect(inside(saved.badge, saved.box), `${at}: Badge in der eigenen Spalte`).toBe(true);
        expect(inside(saved.badge, m.bar), `${at}: Badge in der Leiste`).toBe(true);
        expect(overlap(saved.badge, neighbour.box), `${at}: Badge über dem Nachbar-Tab`).toBeLessThanOrEqual(0.5);
        // Mit Label sitzt das Badge hochkant wie bisher am Herz, ohne Label steht es im Fluss daneben (E2).
        if (labels) expect(overlap(saved.badge, saved.label), `${at}: Badge über dem Label`).toBeLessThanOrEqual(0.5);
        else expect(overlap(saved.badge, saved.icon), `${at}: Badge über dem Herz`).toBeLessThanOrEqual(0.5);
        await expectNoHorizontalScroll(page);
      });
    }
  }

  for (const viewport of [
    { width: 863, height: 360 },
    { width: 740, height: 360 },
  ]) {
    for (const scale of [1, 2]) {
      const at = `Seitenleiste ${viewport.width}×${viewport.height} bei ${scale * 100} %`;
      test(`${at}: im Viewport mit Rand, Badge frei, Daumen auf jedem Tab`, async ({ page }) => {
        await withBadge(page, viewport, 1);
        await setTextScale(page, scale);
        for (const name of TAB_NAMES) {
          await page.getByRole("button", { name: new RegExp(`^${name}(\\s|$)`) }).click();
          const m = await tabBar(page);
          const where = `${at}, ${name} aktiv`;
          expect(m.bar.top, `${where}: Leiste oben mit 8 px Rand`).toBeGreaterThanOrEqual(8);
          expect(m.bar.bottom, `${where}: Leiste unten mit 8 px Rand`).toBeLessThanOrEqual(m.viewport.height - 8);
          const saved = m.tabs[3];
          if (!saved?.badge) throw new Error("Badge fehlt");
          if (saved.label.width > HIDDEN) {
            expect(overlap(saved.badge, saved.label), `${where}: Badge über dem Label`).toBeLessThanOrEqual(0.5);
          }
          expect(overlap(saved.badge, saved.icon), `${where}: Badge über dem Herz`).toBeLessThanOrEqual(0.5);
          const active = m.tabs.find((t) => t.active);
          if (!active) throw new Error(`${where}: kein aktiver Tab`);
          expect(Math.abs(m.thumb.top - active.offset.top), `${where}: Daumen oben bündig`).toBeLessThanOrEqual(2);
          expect(
            Math.abs(m.thumb.height - active.offset.height),
            `${where}: Daumen so hoch wie der Tab`,
          ).toBeLessThanOrEqual(2);
        }
      });
    }
  }

  for (const scale of [1, 1.25, 1.5, 1.75, 2]) {
    const at = `kompakt 568×320 bei ${scale * 100} %`;
    test(`${at}: höchstens 56 px, ${scale === 1 ? "mit Labels" : "nur Icons"}, nichts ragt heraus`, async ({
      page,
    }) => {
      await withBadge(page, { width: 568, height: 320 }, 1);
      await setTextScale(page, scale);
      const m = await tabBar(page);
      expect(m.barHeight, `${at}: Leiste höchstens 56 px hoch`).toBeLessThanOrEqual(56);
      for (const t of m.tabs) {
        if (scale === 1) expect(t.label.width, `${at}: Label „${t.name}“ sichtbar`).toBeGreaterThan(HIDDEN);
        else expect(t.label.width, `${at}: Label „${t.name}“ nur für Screenreader`).toBeLessThanOrEqual(HIDDEN);
        expect(t.scrollWidth, `${at}: Inhalt von „${t.name}“ ragt nicht heraus`).toBeLessThanOrEqual(t.clientWidth);
        expect(inside(t.icon, t.box), `${at}: Icon „${t.name}“ in der Spalte`).toBe(true);
        if (t.label.width > HIDDEN) expect(inside(t.label, t.box), `${at}: Label „${t.name}“ in der Spalte`).toBe(true);
      }
      const saved = m.tabs[3];
      if (!saved?.badge) throw new Error("Badge fehlt");
      expect(inside(saved.badge, saved.box), `${at}: Badge in der Spalte`).toBe(true);
      expect(overlap(saved.badge, saved.icon), `${at}: Badge über dem Herz`).toBeLessThanOrEqual(0.5);
      if (saved.label.width > HIDDEN) {
        expect(overlap(saved.badge, saved.label), `${at}: Badge über dem Label`).toBeLessThanOrEqual(0.5);
      }
    });
  }
});
