/**
 * Anbieterübersicht (Plan 0010), Paket A: Tab, Route, Lazy-Laden von Chunk und `anbieter.json`, Sheet und History,
 * Fehler, Datenstand-Abgleich und Privatsphäre. Fixtures mit eingefrorener Uhr (Mo 5.10.2026 12:00): 8 kommende
 * Angebote von 5 Anbietern, dazu der Turnverein ohne Angebote. Reihenfolge, Filter, Suche und Sheet-Inhalt im
 * Einzelnen prüft anbieter-inhalt.spec.ts (Paket B). Hier zählen die Wege: Zeile → Sheet → Kachel → Detail und zurück.
 */
import type { Page, Request } from "@playwright/test";
import { expect, startPreloads, test } from "./fixtures.ts";
import { expectMobileUx } from "./mobile-ux.ts";

const KRABBELTREFF = "lxizt974";
const THEATER = "Kleines Theater Beispiel (fiktiv)";

const isDirectory = (url: string) => new URL(url).pathname.endsWith("/data/anbieter.json");
const isChunk = (url: string) => /\/assets\/anbieter\/[^/]+\.js$/.test(new URL(url).pathname);

const offers = (page: Page) => page.getByTestId("offer");
const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: new RegExp(`^${name}`) });
const providerSheet = (page: Page) => page.getByRole("dialog", { name: "Anbieter" });
/** Suchfeld der Anbieterliste (E5); steht seit Plan 0025 (E3) im Start, also schon vor dem Chunk */
const searchField = (page: Page) => page.getByRole("searchbox", { name: "Anbieter suchen" });
/** Liste geladen: Die Region „Anbieter“ kommt mit dem Lazy-Chunk (Plan 0025, Review M1) */
const listReady = (page: Page) => expect(page.getByRole("region", { name: "Anbieter" })).toBeVisible();
/** Zeilen der Anbieterliste (E10), wahlweise die eines Anbieters */
const rows = (page: Page) => page.locator("section.providers button.place");
const row = (page: Page, name: string) =>
  rows(page).filter({ has: page.locator("b.provider-name", { hasText: name }) });
/** „Website & Programm“ im Sheet (E10, Punkt 3) */
const websiteLink = (page: Page) => providerSheet(page).getByRole("link", { name: "Website & Programm" });

/** Seite bereit, auch Export-Code und PWA-Kern sind nachgeladen: Danach entsteht kein Request ohne Anlass (Plan 0010, E8 A; Plan 0011, E5). */
/** Ein Angebot vor dem Laden merken (localStorage, wie in saved.spec.ts) */
async function saveOffer(page: Page, id: string) {
  await page.addInitScript((saved) => localStorage.setItem("zwergenplan.merkliste", saved), JSON.stringify([id]));
}

async function ready(page: Page, path = "./") {
  const preloaded = startPreloads(page);
  await page.goto(path);
  await expect(page.getByRole("status")).toBeVisible();
  await preloaded;
}

/** Requests ab jetzt, die die Anbieterübersicht betreffen (Chunk, Katalog) bzw. alle */
function collect(page: Page, filter: (url: string) => boolean = () => true): Request[] {
  const seen: Request[] = [];
  page.on("request", (req) => {
    if (filter(req.url())) seen.push(req);
  });
  return seen;
}
const urls = (requests: Request[]) => requests.map((r) => new URL(r.url()).pathname);

/** site.json zurückhalten, bis `release()` gerufen wird (auch den Frühstart aus index.html) */
async function holdSite(page: Page) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/data/site.json", async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

/** anbieter.json beim ersten Abruf mit anderem Datenstand ausliefern (Pages- oder Browser-Cache, M4) */
async function staleDirectoryOnce(page: Page) {
  let calls = 0;
  await page.route("**/data/anbieter.json", async (route) => {
    calls++;
    if (calls > 1) return route.continue();
    const response = await route.fetch();
    // Antwort des eigenen Fixture-Builds (beim Build per Zod geprüft); gelesen wird nur das eine Feld
    const data = (await response.json()) as { generatedAt: string };
    await route.fulfill({ response, json: { ...data, generatedAt: "2026-09-01T06:00:00+02:00" } });
  });
}

/**
 * Welcher Dialog liegt oben, wo sich Anbieter-Sheet und Detail überdecken (E3, Test 5)? Gemessen in der Mitte der
 * Schnittfläche beider Dialoge mit dem Viewport; vorher ohne Bewegung (das Sheet gleitet sonst noch herein).
 */
async function topDialogOverSheet(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  return page.evaluate(() => {
    const rect = (label: string) => {
      const r = document.querySelector(`dialog[aria-label="${label}"]`)?.getBoundingClientRect();
      if (!r) throw new Error(`Dialog ${label} fehlt`);
      return r;
    };
    const [a, b] = [rect("Anbieter"), rect("Offener Krabbeltreff")];
    const left = Math.max(a.left, b.left, 0);
    const right = Math.min(a.right, b.right, window.innerWidth);
    const top = Math.max(a.top, b.top, 0);
    const bottom = Math.min(a.bottom, b.bottom, window.innerHeight);
    if (right - left < 4 || bottom - top < 4) throw new Error("Sheet und Detail überdecken sich nicht");
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return hit?.closest("dialog")?.getAttribute("aria-label");
  });
}

test.describe("Tab „Anbieter“ (E2, E4)", () => {
  test("öffnet per Tab, zählt in der Statuszeile, zeigt Sticker und Schnellfilter, übersteht Neuladen", async ({
    page,
  }) => {
    await ready(page);
    await tab(page, "Anbieter").click();
    await expect(page).toHaveURL(/[?&]ansicht=anbieter(&|$)/);
    const tabs = page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button");
    // drei Tabs seit Plan 0025 (E8): Angebote · Anbieter · Merkliste
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(1)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("status")).toHaveText("5 Anbieter mit 8 Angeboten");
    await expect(page.getByRole("group", { name: "Kategorien" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Alle Filter/ })).toBeVisible();
    await listReady(page);

    await page.reload();
    await expect(tab(page, "Anbieter")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("status")).toHaveText("5 Anbieter mit 8 Angeboten");
    await listReady(page);
  });

  test("Einzahl in der Statuszeile: „1 Anbieter mit 1 Angebot“", async ({ page }) => {
    await ready(page, "./?kat=buecher&ansicht=anbieter");
    await expect(page.getByRole("status")).toHaveText("1 Anbieter mit 1 Angebot");
  });
});

test.describe("Lazy-Laden (E7, E9)", () => {
  test("die Startseite lädt weder Chunk noch Katalog; der Tab lädt beides genau einmal", async ({ page }) => {
    const requests = collect(page, (url) => isChunk(url) || isDirectory(url));
    await ready(page);
    await expect(offers(page).first()).toBeVisible();
    expect(urls(requests), "Startseite ohne Anbieter-Requests").toEqual([]);

    await tab(page, "Anbieter").click();
    await listReady(page);
    expect(
      requests.filter((r) => isDirectory(r.url())),
      "anbieter.json genau einmal",
    ).toHaveLength(1);
    const chunks = urls(requests.filter((r) => isChunk(r.url())));
    expect(chunks.length, "Chunk geladen").toBeGreaterThanOrEqual(1);
    expect(new Set(chunks).size, "jede Chunk-Datei genau einmal").toBe(chunks.length);

    const before = requests.length;
    await tab(page, "Angebote").click();
    await expect(offers(page).first()).toBeVisible();
    await tab(page, "Anbieter").click();
    await listReady(page);
    expect(urls(requests.slice(before)), "erneutes Öffnen ohne Request").toEqual([]);
  });

  test("Deep-Link ?anbieter=: Chunk und Katalog starten, bevor site.json beantwortet ist (E3)", async ({ page }) => {
    const release = await holdSite(page);
    const directory = page.waitForRequest((r) => isDirectory(r.url()));
    const chunk = page.waitForRequest((r) => isChunk(r.url()));
    await page.goto("./?anbieter=fv3fpfp2", { waitUntil: "domcontentloaded" });
    await Promise.all([directory, chunk]);
    release();
    await expect(providerSheet(page).getByRole("heading", { level: 2, name: THEATER })).toBeVisible();
  });
});

test.describe("Anbieter-Sheet und History (E3)", () => {
  test("Zeile → Sheet mit anbieter=, Zurück schließt es und gibt den Fokus an die Zeile", async ({ page }) => {
    await ready(page, "./?ansicht=anbieter");
    await expect(rows(page)).toHaveCount(6);
    await row(page, THEATER).click();
    const sheet = providerSheet(page);
    await expect(sheet.getByRole("heading", { level: 2, name: THEATER })).toBeVisible();
    // Startfokus auf dem Namen, nicht auf dem Herz daneben (Plan 0025, E2)
    await expect(sheet.getByRole("heading", { level: 2, name: THEATER })).toBeFocused();
    expect(new URL(page.url()).search).toBe("?ansicht=anbieter&anbieter=fv3fpfp2");

    await page.goBack();
    await expect(sheet).toBeHidden();
    expect(new URL(page.url()).search).toBe("?ansicht=anbieter");
    await expect(row(page, THEATER)).toBeFocused();
  });

  test("Kachel im Sheet → Detail darüber; Zurück schließt nur das Detail, Sheet und Scrollposition bleiben", async ({
    page,
  }) => {
    // niedrig, damit das Sheet scrollt
    await page.setViewportSize({ width: 360, height: 520 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page, "./?ansicht=anbieter");
    await row(page, "Familientreff Beispielhof (fiktiv)").click();
    const sheet = providerSheet(page);
    const scroller = sheet.locator(".provider-sheet .sheet-scroll");
    const card = sheet.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button");
    await card.scrollIntoViewIfNeeded();
    const scrolled = await scroller.evaluate((el) => el.scrollTop);
    expect(scrolled, "das Sheet ist gescrollt, sonst prüft der Test nichts").toBeGreaterThan(0);

    await card.click();
    const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
    await expect(detail).toBeVisible();
    expect(new URL(page.url()).search).toBe(`?ansicht=anbieter&anbieter=b5nuus36&angebot=${KRABBELTREFF}`);
    expect(await topDialogOverSheet(page), "über dem Sheet liegt das Detail").toBe("Offener Krabbeltreff");

    await page.goBack();
    await expect(detail).toBeHidden();
    await expect(sheet).toBeVisible();
    expect(new URL(page.url()).search).toBe("?ansicht=anbieter&anbieter=b5nuus36");
    expect(await scroller.evaluate((el) => el.scrollTop), "Scrollposition erhalten").toBe(scrolled);
  });

  test("Website-Link im Sheet: neuer Tab, rel=noopener, Katalog-href (nicht angeklickt, E9)", async ({ page }) => {
    await ready(page, "./?anbieter=fv3fpfp2");
    const link = websiteLink(page);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://example.org/theater");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
  });

  // Seit Plan 0025 (E8) ohne Tab „Kalender“: über dem Kalender der Merkliste, mit einem gemerkten Angebot (ohne gäbe
  // es auf der Merkliste keine Statuszeile, auf die `ready` wartet)
  test("Deep-Link öffnet das Sheet über dem Kalender der Merkliste, ohne Tabwechsel; Schließen entfernt den Parameter", async ({
    page,
  }) => {
    await saveOffer(page, KRABBELTREFF);
    await ready(page, "./?ansicht=merkliste-kalender&anbieter=fv3fpfp2");
    const sheet = providerSheet(page);
    await expect(sheet.getByRole("heading", { level: 2, name: THEATER })).toBeVisible();
    await expect(tab(page, "Merkliste")).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\?ansicht=merkliste-kalender$/);
    await expect(tab(page, "Merkliste")).toBeFocused();
  });

  test("Katalog-ID aus einem alten Link öffnet dasselbe Sheet, die Adresse zeigt die publicId (ADR 0022)", async ({
    page,
  }) => {
    await ready(page, "./?anbieter=theater-beispiel");
    await expect(
      providerSheet(page).getByRole("heading", { level: 2, name: "Kleines Theater Beispiel (fiktiv)" }),
    ).toBeVisible();
    expect(new URL(page.url()).search).toBe("?anbieter=fv3fpfp2");
  });

  test("unbekannte ID: Parameter weg, kein Sheet", async ({ page }) => {
    await saveOffer(page, KRABBELTREFF);
    await ready(page, "./?ansicht=merkliste-kalender&anbieter=gibt-es-nicht");
    await expect(page).toHaveURL(/\?ansicht=merkliste-kalender$/);
    await expect(providerSheet(page)).toBeHidden();
  });

  test("Detail → „Mehr von diesem Anbieter“: Sheet offen, Detail zu; Zurück öffnet wieder das Detail", async ({
    page,
  }) => {
    await ready(page);
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Mehr von diesem Anbieter" }).click();
    const sheet = providerSheet(page);
    await expect(sheet.getByRole("heading", { level: 2, name: "Familientreff Beispielhof (fiktiv)" })).toBeVisible();
    await expect(detail).toBeHidden();
    expect(new URL(page.url()).search).toBe("?anbieter=b5nuus36");

    await page.goBack();
    await expect(detail).toBeVisible();
    await expect(sheet).toBeHidden();
    expect(new URL(page.url()).search).toBe(`?angebot=${KRABBELTREFF}`);
  });

  test("Deep-Link mit Sheet und Detail: Das Detail liegt oben; derselbe Knopf führt ohne neuen Eintrag ins Sheet", async ({
    page,
  }) => {
    await ready(page, `./?anbieter=b5nuus36&angebot=${KRABBELTREFF}`);
    const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
    const sheet = providerSheet(page);
    await expect(detail).toBeVisible();
    // Das Sheet lädt den Chunk erst jetzt; das Detail muss trotzdem oben bleiben (E3: Sheet vor dem Detail im Baum).
    await expect(sheet.getByRole("heading", { level: 2, name: "Familientreff Beispielhof (fiktiv)" })).toBeAttached();
    const onTop = await topDialogOverSheet(page);
    expect(onTop, "über dem Sheet liegt das Detail").toBe("Offener Krabbeltreff");

    const length = await page.evaluate(() => window.history.length);
    await detail.getByRole("button", { name: "Mehr von diesem Anbieter" }).click();
    await expect(detail).toBeHidden();
    await expect(sheet.getByRole("heading", { level: 2, name: "Familientreff Beispielhof (fiktiv)" })).toBeVisible();
    expect(new URL(page.url()).search).toBe("?anbieter=b5nuus36");
    expect(await page.evaluate(() => window.history.length), "kein neuer History-Eintrag").toBe(length);
  });

  test("Zurück auf einen Eintrag mit Sheet und Detail: Beide öffnen im selben Commit, das Detail liegt oben", async ({
    page,
  }) => {
    await ready(page);
    // Eintrag mit beiden Parametern, darüber einer ohne; Zurück löst popstate aus (wie ein Tipp auf „Zurück“)
    await page.evaluate((id) => {
      window.history.pushState(null, "", `?anbieter=b5nuus36&angebot=${id}`);
      window.history.pushState(null, "", "?ansicht=merkliste");
    }, KRABBELTREFF);
    await page.evaluate(() => window.history.back());
    const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
    await expect(detail).toBeVisible();
    await expect(providerSheet(page)).toBeVisible();
    expect(await topDialogOverSheet(page), "über dem Sheet liegt das Detail").toBe("Offener Krabbeltreff");
  });

  test("Detail schließen über dem Sheet: Das Sheet bleibt darunter offen", async ({ page }) => {
    await ready(page, `./?anbieter=b5nuus36&angebot=${KRABBELTREFF}`);
    const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Zurück" }).click();
    await expect(detail).toBeHidden();
    await expect(providerSheet(page)).toBeVisible();
    expect(new URL(page.url()).search).toBe("?anbieter=b5nuus36");
  });

  test("der Seiten-Toast schweigt bei offenem Sheet", async ({ page }) => {
    await ready(page, `./?anbieter=b5nuus36&angebot=${KRABBELTREFF}`);
    const detail = page.getByRole("dialog", { name: "Offener Krabbeltreff" });
    await page.clock.pauseAt(new Date("2026-10-05T12:00:00+02:00"));
    await detail.getByRole("button", { name: /merken$/ }).click();
    await expect(detail.locator(".toast")).toHaveText(/^Gemerkt/);
    await detail.getByRole("button", { name: "Zurück" }).click();
    await expect(providerSheet(page)).toBeVisible();
    await expect(providerSheet(page).locator(".toast")).toHaveText(/^Gemerkt/);
    // Seiten-Toast (außerhalb der Dialoge) bleibt leer
    await expect(page.locator(".app > [aria-live] .toast")).toHaveCount(0);
  });
});

test.describe("site.json scheitert (Arch-Review m3)", () => {
  test.use({ allowedConsoleErrors: [/\/data\/site\.json\b/] });

  test("Deep-Link ?anbieter=: kein Sheet über der Fehlerseite; „Nochmal versuchen“ öffnet es dann", async ({
    page,
  }) => {
    await page.route("**/data/site.json", (route) => route.fulfill({ status: 503, body: "" }));
    await page.goto("./?anbieter=fv3fpfp2");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Die Angebote ließen sich gerade nicht laden.");
    // Ohne Datenstand gäbe es nur „wird geladen …“ ohne Ende: Das Sheet bleibt zu, die Fehlerseite ist bedienbar.
    await expect(providerSheet(page)).toBeHidden();
    expect(new URL(page.url()).searchParams.get("anbieter")).toBe("fv3fpfp2");

    await page.unroute("**/data/site.json");
    await alert.getByRole("button", { name: "Nochmal versuchen" }).click();
    await expect(providerSheet(page).getByRole("heading", { level: 2 })).toHaveText(/Kleines Theater/);
  });
});

test.describe("Fehler (E10)", () => {
  test.use({ allowedConsoleErrors: [/\/data\/anbieter\.json\b/] });

  test("503 im Tab: Fehlertext in .lazy-box, „Nochmal versuchen“ lädt", async ({ page }) => {
    await page.route("**/data/anbieter.json", (route) => route.fulfill({ status: 503, body: "weg" }));
    await ready(page);
    await tab(page, "Anbieter").click();
    const box = page.locator(".lazy-box");
    await expect(box).toContainText("Die Anbieter konnten nicht geladen werden.");
    await expect(page.getByRole("status")).toHaveText("5 Anbieter mit 8 Angeboten");
    await expectMobileUx(page);

    await page.unroute("**/data/anbieter.json");
    await box.getByRole("button", { name: "Nochmal versuchen" }).click();
    await listReady(page);
    await expect(rows(page)).toHaveCount(6);
    await expect(row(page, THEATER)).toBeVisible();
    await expect(box).toHaveCount(0);
  });

  test("503 im Sheet: Fehlertext, „Nochmal versuchen“ lädt den Anbieter", async ({ page }) => {
    await page.route("**/data/anbieter.json", (route) => route.fulfill({ status: 503, body: "weg" }));
    await ready(page, "./?anbieter=fv3fpfp2");
    const sheet = providerSheet(page);
    await expect(sheet.locator(".lazy-box")).toContainText("Die Anbieter konnten nicht geladen werden.");
    await expectMobileUx(page);

    await page.unroute("**/data/anbieter.json");
    await sheet.getByRole("button", { name: "Nochmal versuchen" }).click();
    await expect(sheet.getByRole("heading", { level: 2, name: THEATER })).toBeVisible();
    await expect(websiteLink(page)).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 3, name: "Kuckuck im Nest", exact: false })).toBeVisible();
  });
});

test.describe("Datenstand (E6, M4)", () => {
  test("anderer Datenstand: genau ein zweiter Request am Cache vorbei, danach die Liste", async ({ page }) => {
    await staleDirectoryOnce(page);
    const requests = collect(page, isDirectory);
    await ready(page);
    await tab(page, "Anbieter").click();
    await listReady(page);
    expect(requests, "erst geladen, dann einmal neu").toHaveLength(2);

    // Wechsel und Rückkehr fragen nicht noch einmal nach und zeigen den Katalog sofort, ohne einen Frame mit dem
    // Ladekasten (Arch-Review m4)
    await tab(page, "Angebote").click();
    await page.evaluate(() => {
      new MutationObserver(() => {
        if (document.querySelector(".lazy-box")) document.documentElement.dataset["sahLazyBox"] = "ja";
      }).observe(document.body, { childList: true, subtree: true });
    });
    await tab(page, "Anbieter").click();
    await listReady(page);
    expect(requests).toHaveLength(2);
    await expect(page.locator("html")).not.toHaveAttribute("data-sah-lazy-box");
  });

  test("fehlt ein Anbieter in anbieter.json, steht er als Rückfall-Zeile da, im Sheet ohne Website-Knopf", async ({
    page,
  }) => {
    // gleicher Datenstand, kein Reload: Der Theater-Eintrag fehlt einfach (z. B. Katalog älter als site.json, M4)
    await page.route("**/data/anbieter.json", async (route) => {
      const response = await route.fetch();
      // Antwort des eigenen Fixture-Builds (beim Build per Zod geprüft); gelesen werden nur die IDs
      const data = (await response.json()) as { providers: { id: string }[] };
      await route.fulfill({
        response,
        json: { ...data, providers: data.providers.filter((p) => p.id !== "fv3fpfp2") },
      });
    });
    await ready(page, "./?ansicht=anbieter");
    await expect(rows(page)).toHaveCount(6);
    await expect(page.getByRole("status")).toHaveText("5 Anbieter mit 8 Angeboten");
    await row(page, THEATER).click();
    const sheet = providerSheet(page);
    await expect(sheet.getByRole("heading", { level: 2, name: THEATER })).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 3, name: /^Kommende Angebote/ })).toBeVisible();
    await expect(websiteLink(page)).toHaveCount(0);
  });

  test("Deep-Link plus anderer Datenstand: Vorladen und genau ein Reload, ein Chunk, danach das Sheet", async ({
    page,
  }) => {
    await staleDirectoryOnce(page);
    const release = await holdSite(page);
    const directory = collect(page, isDirectory);
    const chunks = collect(page, isChunk);
    const preloaded = page.waitForRequest((r) => isDirectory(r.url()));
    await page.goto("./?anbieter=fv3fpfp2", { waitUntil: "domcontentloaded" });
    await preloaded;
    release();
    await expect(providerSheet(page).getByRole("heading", { level: 2, name: THEATER })).toBeVisible();
    expect(directory, "Vorladen und ein Reload").toHaveLength(2);
    expect(new Set(urls(chunks)).size, "jede Chunk-Datei einmal").toBe(chunks.length);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Privatsphäre (E9)", () => {
  test("Tippen in der Suche: kein Request, kein Suchtext in der URL", async ({ page }) => {
    await ready(page, "./?ansicht=anbieter");
    await listReady(page);
    const requests = collect(page);
    await searchField(page).fill("bibliothek");
    await searchField(page).press("Enter");
    await expect(searchField(page)).toHaveValue("bibliothek");
    expect(urls(requests), "kein Request beim Tippen").toEqual([]);
    expect(page.url()).not.toContain("bibliothek");
  });

  test("mit offenem Tab einen Startpunkt wählen: ab dem Tipp kein Request", async ({ page }) => {
    await ready(page, "./?ansicht=anbieter");
    await listReady(page);
    const loaded = Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/data/wegzeit.json") && r.ok()),
      page.waitForResponse((r) => /\/assets\/oepnv\/[^/]+\.js$/.test(new URL(r.url()).pathname) && r.ok()),
      // Plan 0012, E3: die Linien kommen nach Tabelle und Chunk, auch sie vor der Wahl
      page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/data/linien.json") && r.ok()),
    ]);
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await loaded;
    const requests = collect(page);
    await kid.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
    await kid.getByRole("button", { name: "Fertig" }).click();
    await expect(page.getByRole("status")).toContainText("Gostenhof");
    await listReady(page);
    expect(urls(requests), "kein Request nach der Wahl des Startpunkts").toEqual([]);
    expect(page.url()).not.toContain("gostenhof");
  });

  test("ohne Anlass (Kalender der Merkliste, Startpunkt gespeichert) weder Chunk noch Katalog", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await saveOffer(page, KRABBELTREFF);
    const requests = collect(page, (url) => isDirectory(url) || isChunk(url));
    await ready(page, "./?ansicht=merkliste-kalender");
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
    expect(urls(requests)).toEqual([]);
  });
});
