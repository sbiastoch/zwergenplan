/**
 * Deploy-Build mit echten Daten. Die Uhr steht auf `generatedAt` des Datenstands (nicht auf der Echtzeit):
 * Ein alter Datenstand ist laut ADR 0002 nur eine Warnung und darf Code-Commits nicht rot machen.
 */
import { existsSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, MAP_READY, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoHorizontalScroll,
  expectTextFits,
  setTextScale,
  setTextScaleRelayout,
} from "./mobile-ux.ts";
import { dataMeta } from "./real-data.ts";
import { clsFrom, observeVitals, readVitals, throttleMobile } from "./vitals.ts";

async function openAtDataTime(page: Page): Promise<{ offers: number }> {
  const meta = await dataMeta(page);
  await page.clock.setFixedTime(new Date(meta.generatedAt));
  await page.goto("./");
  if (meta.offers > 0) {
    // Echte Daten vorhanden → die Seite muss Angebote zeigen, nicht den Leerzustand.
    await expect(page.getByTestId("offer").first()).toBeVisible();
  } else {
    await expect(page.getByText("Noch keine Angebote")).toBeVisible();
  }
  return meta;
}

test("echter Build lädt und ist bedienbar", async ({ page }) => {
  await openAtDataTime(page);
  // Knopf-Beschriftungen mit Daten (Anbietername, Tag) dürfen umbrechen: Prüfung 5 nur mit Fixtures (Plan 0007, E10).
  await expectMobileUx(page, { buttons: false });
});

/** Weg zu den Ansichten mit echten Daten, ausgehend von der geladenen Startseite (Plan 0003, Arch-Hinweis 16). */
const REAL_VIEWS: Record<string, (page: Page) => Promise<void>> = {
  Start: async () => {},
  // Seit Plan 0025 (E8, Test 16) der Kalender der Merkliste: drei echte Angebote per Herz merken
  "Merkliste Kalender": async (page) => {
    for (const heart of (await page.getByRole("button", { name: / merken$/ }).all()).slice(0, 3)) await heart.click();
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /^Merkliste/ })
      .click();
    await page
      .getByRole("group", { name: "Darstellung der Merkliste" })
      .getByRole("button", { name: "Kalender", exact: true })
      .click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await expect(page.getByRole("button", { name: "Monat zuklappen" })).toBeVisible();
  },
  Detail: async (page) => {
    await page.getByTestId("offer").first().getByRole("heading").getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
};

for (const [name, go] of Object.entries(REAL_VIEWS)) {
  test(`echte Daten brechen bei 320 px und 200 % Textgröße nicht aus (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const meta = await openAtDataTime(page);
    test.skip(meta.offers === 0 && name !== "Start", "keine Daten");
    await go(page);
    await expectNoHorizontalScroll(page);
    // Der Umschalter der Merkliste wird bei 200 % per Container-Query einspaltig; die wertet Chromium erst nach einem
    // Breitenwechsel neu aus (setTextScaleRelayout). Die übrigen Ansichten bleiben beim bisherigen Ablauf.
    await (name === "Merkliste Kalender" ? setTextScaleRelayout : setTextScale)(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2, buttons: false });
    await expectAccessible(page);
  });
}

test("Stadtteil als Startpunkt mit echten Daten: Wegzeit aus der echten Tabelle (Plan 0004, Plan 0009)", async ({
  page,
}) => {
  const meta = await openAtDataTime(page);
  test.skip(meta.offers === 0, "keine Daten");
  const lines = page.waitForResponse((r) => r.url().endsWith("/data/linien.json") && r.ok());
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  // Quellenhinweis aus der echten wegzeit.json (CC BY-SA 3.0 DE, E3)
  await expect(sheet.getByRole("link", { name: /^VGN-Soll-Daten vom / })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "CC BY-SA 3.0 DE" })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by-sa/3.0/de/",
  );
  await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("altstadt");
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByRole("status")).toContainText("Wegzeit ab Altstadt");
  const dists = page.getByTestId("offer").locator(".meta .dist");
  await expect(dists.first()).toHaveText(/^(\d+ Min\.|über 2 Std\.)$/);
  for (const text of await dists.allInnerTexts()) expect(text).toMatch(/^(\d+ Min\.|über 2 Std\.)$/);
  // Knopf-Beschriftungen mit Daten dürfen umbrechen: Prüfung 5 nur mit Fixtures (Plan 0007, E10).
  await expectMobileUx(page, { buttons: false });

  // Plan 0012, E5 (Review W3): Die echte linien.json passt zur Tabelle, mindestens ein Detail nennt Linien.
  await lines;
  const titles = page.getByTestId("offer").getByRole("heading", { level: 3 });
  const named: string[] = [];
  for (let i = 0; i < Math.min(30, await titles.count()) && named.length === 0; i++) {
    await titles.nth(i).getByRole("button").click();
    const dialog = page.getByRole("dialog");
    const text = await dialog.locator(".reach-long").innerText();
    // Echte Linien tragen U+00A0 („Bus\u00a037“, „RB\u00a011“); „mit Bus & Bahn“ (normales Leerzeichen) zählt nicht
    // (Arch-Review 0012, Blocker 1).
    if (/mit (?:(?:Bus|Tram|R[BE]?)\u00a0|U\d|S\d)/.test(text) && !text.includes("Bus & Bahn")) named.push(text);
    await dialog.getByRole("button", { name: "Zurück" }).click();
    await expect(dialog).toBeHidden();
  }
  expect(named, "ein Detail ab Altstadt mit Linien").toHaveLength(1);

  await page.setViewportSize({ width: 320, height: 640 });
  await expectNoHorizontalScroll(page);
  await setTextScale(page, 2);
  await expectNoHorizontalScroll(page);
  await expectTextFits(page, { scale: 2, buttons: false });
  await expectAccessible(page);
});

test("lange Listen werden schrittweise gezeigt (Plan 0003, E8)", async ({ page }) => {
  const meta = await openAtDataTime(page);
  test.skip(meta.offers <= 60, "zu wenige Angebote für mehrere Schritte");
  const cards = page.getByTestId("offer");
  const first = await cards.count();
  expect(first).toBeGreaterThanOrEqual(40);
  expect(first).toBeLessThan(meta.offers);
  await page.getByRole("button", { name: /^Weitere Angebote zeigen/ }).click();
  await expect.poll(() => cards.count()).toBeGreaterThan(first);
});

test("LCP und CLS bleiben mit echten Daten im Budget", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP-Drosselung und LCP-API gibt es nur in Chromium");
  const meta = await dataMeta(page);
  test.skip(meta.offers === 0, "keine Daten");
  await throttleMobile(page);
  await observeVitals(page);
  await page.clock.setFixedTime(new Date(meta.generatedAt));
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.waitForTimeout(500);
  const vitals = await readVitals(page);
  expect(vitals.lcp, "LCP (ms)").toBeLessThan(2500);
  const { cls, detail } = clsFrom(vitals);
  expect(cls, `CLS\n${detail}`).toBeLessThan(0.05);
});

/**
 * LCP und CLS mit Service Worker (Plan 0011, E6): erster Besuch (Registrierung nach `load`, Precache) und zweiter
 * Besuch (Navigation über den Service Worker, Schale und Assets aus dem Cache, Daten aus dem Netz). Ein Rot wird an der
 * Ursache behoben (spätere Registrierung, kleinere Precache-Liste), nie mit einer höheren Schwelle.
 */
test.describe("mit Service Worker (Plan 0011)", () => {
  test.use({ serviceWorkers: "allow" });
  // Notausgang (README): ohne Service Worker gibt es keinen zweiten Besuch über ihn
  test.skip(process.env["ZWERGENPLAN_SW"] === "aus", "Notausgang aktiv: Build ohne Service Worker (README)");

  test("LCP und CLS beim ersten und zweiten Besuch im Budget", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP-Drosselung und LCP-API gibt es nur in Chromium");
    const meta = await dataMeta(page);
    test.skip(meta.offers === 0, "keine Daten");
    await throttleMobile(page);
    await observeVitals(page);
    await page.clock.setFixedTime(new Date(meta.generatedAt));
    for (const visit of ["erster", "zweiter"] as const) {
      const site = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/data/site.json"));
      await page.goto("./");
      expect((await site).fromServiceWorker(), `${visit} Besuch: site.json über den Service Worker`).toBe(
        visit === "zweiter",
      );
      await expect(page.getByTestId("offer").first()).toBeVisible();
      await page.waitForTimeout(500);
      const vitals = await readVitals(page);
      expect(vitals.lcp, `LCP (ms), ${visit} Besuch`).toBeLessThan(2500);
      const { cls, detail } = clsFrom(vitals);
      expect(cls, `CLS, ${visit} Besuch\n${detail}`).toBeLessThan(0.05);
      // erst mit aktivem Service Worker zum zweiten Besuch
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
    }
  });
});

test.describe("Karte mit echten Daten (Plan 0005)", () => {
  test.use({ tiles: "mock" });

  async function openMap(page: Page) {
    const meta = await openAtDataTime(page);
    test.skip(meta.offers === 0, "keine Daten");
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", MAP_READY);
  }

  test("Karte ist bereit, Orts-Liste vollständig, kein Test-Haken im Deploy-Build", async ({ page }) => {
    await openMap(page);
    expect(await page.getByRole("region", { name: "Orte" }).getByRole("button").count()).toBeGreaterThanOrEqual(50);
    // __zpMap gibt es nur im E2E-Build (__E2E__, Plan 0005 E13)
    expect(await page.evaluate(() => "__zpMap" in window)).toBe(false);
    // Ortsnamen aus Daten dürfen umbrechen: Prüfung 5 nur mit Fixtures (Plan 0007, E10).
    await expectMobileUx(page, { buttons: false });
  });

  test("Karte bricht bei 320 px und 200 % Textgröße nicht aus", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page);
    await expectNoHorizontalScroll(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2, buttons: false });
    await expectAccessible(page);
  });
});

/** Plan 0010: Anbieterübersicht mit echten Daten (lange Namen, viele Zeilen, Spitzenreiter mit vielen Angeboten). */
test.describe("Anbieter mit echten Daten (Plan 0010)", () => {
  const list = (page: Page) => page.getByRole("region", { name: "Anbieter" });
  const tab = (page: Page, name: string) =>
    page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: new RegExp(`^${name}`) });

  async function openProviders(page: Page) {
    const meta = await openAtDataTime(page);
    test.skip(meta.offers === 0, "keine Daten");
    await tab(page, "Anbieter").click();
    await expect(list(page).locator(".place").first()).toBeVisible();
  }

  test("mehr als 50 aktive Zeilen, alle Anbieter ohne Termine blass am Ende", async ({ page }) => {
    await openProviders(page);
    const res = await page.request.get("./data/anbieter.json");
    const directory: unknown = await res.json();
    const total =
      typeof directory === "object" &&
      directory !== null &&
      "providers" in directory &&
      Array.isArray(directory.providers)
        ? directory.providers.length
        : 0;
    const states = await list(page)
      .locator(".place")
      .evaluateAll((rows) => rows.map((r) => r.classList.contains("idle")));
    const active = states.filter((idle) => !idle).length;
    expect(active, "aktive Anbieter").toBeGreaterThan(50);
    // Ohne Filter und Suche ist jeder Katalog-Anbieter genau eine Zeile; die blassen (ohne Termine) folgen den aktiven.
    expect(states.length, "Zeilen = Anbieter im Katalog").toBe(total);
    expect(states.indexOf(true), "erste blasse Zeile nach allen aktiven").toBe(active);
    await expect(list(page).locator(".place.idle").first()).toContainText("Gerade keine Termine im Plan");
    // Namen aus Daten dürfen umbrechen: Prüfung 5 nur mit Fixtures (Plan 0007, E10).
    await expectMobileUx(page, { buttons: false });
  });

  test("Anbieterliste bricht bei 320 px und 200 % nicht aus (lange Namen)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openProviders(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2, buttons: false });
    await expectAccessible(page);
  });

  test("das Sheet des Spitzenreiters öffnet mit allen Angeboten", async ({ page }) => {
    await openProviders(page);
    const lines = await list(page).locator(".place:not(.idle) span").allInnerTexts();
    const counts = lines.map((line) => Number(/^(?:\d+ von )?(\d+) Angebot/.exec(line)?.[1] ?? 0));
    const most = Math.max(...counts);
    expect(most, "Spitzenreiter").toBeGreaterThan(10);
    await list(page).locator(".place:not(.idle)").nth(counts.indexOf(most)).click();
    const sheet = page.getByRole("dialog", { name: "Anbieter" });
    await expect(sheet.getByRole("heading", { level: 3, name: `Kommende Angebote (${most})` })).toBeVisible();
    await expect(sheet.getByTestId("offer")).toHaveCount(most);
    await expectMobileUx(page, { buttons: false });
  });

  type Box = { left: number; right: number; top: number; bottom: number; width: number };
  const overlap = (a: Box, b: Box) =>
    Math.min(
      Math.min(a.right, b.right) - Math.max(a.left, b.left),
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
    );
  const inside = (inner: Box, outer: Box) =>
    inner.left >= outer.left - 0.5 &&
    inner.right <= outer.right + 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.bottom <= outer.bottom + 0.5;

  /** Leiste, Merklisten-Tab, Badge, Herz und Label als Rechtecke im Viewport */
  function savedTab(page: Page) {
    return page.evaluate(() => {
      const box = (el: Element | null | undefined) => {
        if (!el) throw new Error("Element der Tab-Leiste fehlt");
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
      };
      const tab = [...document.querySelectorAll(".tabs .tab")].at(-1);
      return {
        viewport: window.innerHeight,
        bar: box(document.querySelector(".tabs")),
        tab: box(tab),
        badge: box(tab?.querySelector(".badge")),
        icon: box(tab?.querySelector("svg")),
        label: box(tab?.querySelector(".tab-label")),
      };
    });
  }

  test("zweistelliges Badge: 320 px / 200 % und Seitenleiste 863×360 / 200 % (E2)", async ({ page }) => {
    const meta = await openAtDataTime(page);
    test.skip(meta.offers < 10, "zu wenige Angebote");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const hearts = page.getByTestId("offer").getByRole("button", { name: / merken$/ });
    for (let i = 0; i < 10; i++) await hearts.nth(i).click();
    await expect(page.locator(".tab .badge")).toHaveText("10");

    await page.setViewportSize({ width: 320, height: 640 });
    await setTextScale(page, 2);
    let m = await savedTab(page);
    expect(inside(m.badge, m.tab), "320/200: Badge in der eigenen Spalte").toBe(true);
    expect(inside(m.badge, m.bar), "320/200: Badge in der Leiste").toBe(true);
    expect(overlap(m.badge, m.icon), "320/200: Badge über dem Herz").toBeLessThanOrEqual(0.5);

    await page.setViewportSize({ width: 863, height: 360 });
    m = await savedTab(page);
    expect(m.bar.top, "Seitenleiste oben mit 8 px Rand").toBeGreaterThanOrEqual(8);
    expect(m.bar.bottom, "Seitenleiste unten mit 8 px Rand").toBeLessThanOrEqual(m.viewport - 8);
    expect(inside(m.badge, m.tab), "Seitenleiste: Badge im Tab").toBe(true);
    expect(overlap(m.badge, m.icon), "Seitenleiste: Badge über dem Herz").toBeLessThanOrEqual(0.5);
    if (m.label.width > 2) {
      expect(overlap(m.badge, m.label), "Seitenleiste: Badge über dem Label").toBeLessThanOrEqual(0.5);
    }
  });
});

/** Felder eines Eintrags aus site.json bzw. anbieter.json, geprüft statt per Cast angenommen (e2e/ importiert nichts aus src/) */
function idTitle(entry: unknown, title: "title" | "name"): { id: string; text: string } {
  if (typeof entry === "object" && entry !== null && "id" in entry && typeof entry.id === "string" && title in entry) {
    const text: unknown = Reflect.get(entry, title);
    if (typeof text === "string") return { id: entry.id, text };
  }
  throw new Error(`Eintrag ohne id/${title}: ${JSON.stringify(entry).slice(0, 200)}`);
}

async function list(page: Page, file: string, key: "offers" | "providers"): Promise<unknown[]> {
  const json: unknown = await (await page.request.get(file)).json();
  const items: unknown = typeof json === "object" && json !== null ? Reflect.get(json, key) : undefined;
  if (!Array.isArray(items)) throw new Error(`${file} ohne ${key}`);
  return items;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

test.describe("Teilen mit echten Daten (Plan 0026, Tests 9; Nachtrag A; ADR 0022)", () => {
  test("Vorschauseiten und Kachelbilder für erstes und letztes Angebot, ein Anbieter, 404.html", async ({ page }) => {
    const offers = await list(page, "./data/site.json", "offers");
    test.skip(offers.length === 0, "keine Daten");
    for (const offer of [offers[0], offers.at(-1)].map((o) => idTitle(o, "title"))) {
      const res = await page.request.get(`./a/${offer.id}/`);
      expect(res.status(), offer.id).toBe(200);
      const html = await res.text();
      // Titel stehen im og:title gekürzt (110 Zeichen), die ersten 30 Zeichen immer
      expect(html).toContain(`<h1>${escapeHtml(offer.text.slice(0, 30))}`);
      expect(html).toContain(`og:url" content="https://zwergenplan.app/a/${offer.id}/"`);
      const image = await page.request.get(`./a/${offer.id}/vorschau.jpg`);
      expect(image.status(), `${offer.id}/vorschau.jpg`).toBe(200);
      expect(image.headers()["content-type"]).toContain("image/jpeg");
    }
    const [first] = await list(page, "./data/anbieter.json", "providers");
    const provider = idTitle(first, "name");
    const res = await page.request.get(`./p/${provider.id}/`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain(`<h1>${escapeHtml(provider.text.slice(0, 30))}`);
    expect(await res.text()).toContain(`og:url" content="https://zwergenplan.app/p/${provider.id}/"`);
    expect(existsSync("dist/404.html"), "dist/404.html").toBe(true);
    // die alten Ordner schreibt der Build nicht mehr; alte Links leiten über 404.html weiter (ADR 0022)
    expect(existsSync("dist/angebot"), "dist/angebot").toBe(false);
    expect(existsSync("dist/anbieter"), "dist/anbieter").toBe(false);
  });

  test("keine Fixture-Seite im Deploy-Build (Review m11)", async ({ page }) => {
    const fixture: unknown = JSON.parse(readFileSync("tests/fixtures/offers.json", "utf8"));
    const offers: unknown = typeof fixture === "object" && fixture !== null ? Reflect.get(fixture, "offers") : [];
    if (!Array.isArray(offers) || offers.length === 0) throw new Error("tests/fixtures/offers.json ohne offers");
    for (const { id } of offers.map((o) => idTitle(o, "title"))) {
      expect(existsSync(`dist/a/${id}`), `dist/a/${id}`).toBe(false);
      // `vite preview` liefert für unbekannte Pfade die Startseite (SPA-Rückfall), nie die Vorschauseite
      const html = await (await page.request.get(`./a/${id}/`)).text();
      expect(html).not.toContain(`og:url" content="https://zwergenplan.app/a/${id}/"`);
    }
    // ebenso die Anbieter der Fixtures unter p/<publicId>/ (Review m5)
    for (const [, publicId] of readFileSync("tests/fixtures/providers.yaml", "utf8").matchAll(
      /^ {2}publicId: ([0-9a-z]{8})$/gm,
    )) {
      expect(existsSync(`dist/p/${publicId}`), `dist/p/${publicId}`).toBe(false);
    }
  });

  test("ein Tipp auf den Link öffnet das Detail", async ({ page }) => {
    const meta = await dataMeta(page);
    await page.clock.setFixedTime(new Date(meta.generatedAt));
    const [first] = await list(page, "./data/site.json", "offers");
    test.skip(first === undefined, "keine Daten");
    const offer = idTitle(first, "title");
    await page.goto(`./a/${offer.id}/`);
    await expect(page.getByRole("dialog", { name: offer.text })).toBeVisible();
  });
});
