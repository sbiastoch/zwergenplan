/**
 * Screenshot-Matrix für /browser-review (kein Gate, sondern Futter für die Sichtprüfung).
 *   node scripts/screenshots.ts [URL] [--views=start,merkliste-kalender,…] [--text=200]   Standard: lokale Preview mit
 * Fixtures
 * Ansichten: start, merkliste, detail, filter, kind (Plan 0003), merkliste-kalender (Plan 0025, E8; früher der Tab
 * „kalender“), start-startpunkt (Plan 0004), karte, ort (Plan 0005), filter-wegzeit, kind-quelle (Plan 0009: Filtergruppe „Wegzeit“, Quellenhinweis im Kind-Sheet), anbieter,
 * anbieter-sheet, tabs (Plan 0010: Liste, Sheet, Tab-Leiste mit Badge; im Viewport „quer“ als Seitenleiste), push
 * (Plan 0017, 0054: Abos im Kind-Sheet mit langem Such-Abo), onboarding (Plan 0033, E15: alle Schritte der Einführung
 * beim ersten Öffnen, je ein Bild mit Endung -1, -2, …; mit Android-User-Agent, in der Headless-Shell also App-Schritt
 * mit Menü-Hinweis und „verweigert“).
 * Lokal kommen die Kartenkacheln aus tests/fixtures/karte/ (wie in E2E), live echt von OpenFreeMap.
 * Das Flag „Onboarding erledigt“ steht vor jedem Laden im Speicher (Plan 0033, E15), außer in der Ansicht onboarding.
 * --text=200 simuliert große Schrift wie die Gates (Wurzel-Schriftgröße, Plan 0007, E7); Dateien enden auf -200.
 */
import { existsSync, mkdirSync } from "node:fs";
import { type BrowserContext, chromium, devices, type Page } from "@playwright/test";
import { ONBOARDING_FLAG } from "../e2e/onboarding-flag.ts";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:4173/";
const viewsArg = args.find((a) => a.startsWith("--views="))?.slice("--views=".length);
const textArg = args.find((a) => a.startsWith("--text="))?.slice("--text=".length);
const textPercent = textArg ? Number.parseInt(textArg, 10) : 100;
if (!Number.isFinite(textPercent) || textPercent < 50 || textPercent > 400)
  throw new Error(`--text=${textArg} ungültig`);
const isLocal = url.includes("localhost");
const outDir = "e2e/.artifacts/screens";
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "320", width: 320, height: 640 },
  { name: "360", width: 360, height: 740 },
  { name: "365", width: 365, height: 740 },
  { name: "iphone", width: 390, height: 844 },
  { name: "pixel", width: 412, height: 915 },
  { name: "quer", width: 915, height: 412 },
];

async function ready(page: Page) {
  await page.getByRole("status").first().waitFor();
  // Erst auslösen, wenn die Daten geladen sind – sonst zeigt das Bild den Ladezustand (Browser-Review 0002).
  await page.waitForFunction(() => !document.querySelector("[role=status]")?.textContent?.includes("Lade"));
}

/**
 * Startpunkt Gostenhof: Nur die Stadtteil-ID liegt im Speicher (Plan 0004, E3), nach dem Neuladen gilt sie. Wartet,
 * bis die Wegzeit geladen ist (Plan 0009, E11), sonst zeigt das Bild die Platzhalter.
 */
async function withGostenhof(page: Page) {
  await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
  await page.reload();
  await ready(page);
  await page.locator(".meta .dist:not(.pending)").first().waitFor();
}

/** Kachel-Mock für die lokale Preview (wie e2e/fixtures.ts, tiles: "mock"): Stile, Glyphen, leere Kacheln. */
async function mockTiles(context: BrowserContext) {
  await context.route("https://tiles.openfreemap.org/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path.startsWith("/planet/")) {
      return route.fulfill({ status: 200, contentType: "application/x-protobuf", body: Buffer.alloc(0) });
    }
    const file = path.startsWith("/styles/")
      ? `tests/fixtures/karte/${path.slice("/styles/".length)}.json`
      : path === "/planet"
        ? "tests/fixtures/karte/planet.json"
        : `tests/fixtures/karte${path}`;
    return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
  });
}

/** Karte mit Stadtteil Gostenhof (Liste darunter mit Wegzeit) */
async function openMap(page: Page) {
  await withGostenhof(page);
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await page.locator(".map-box[data-state=bereit]").waitFor({ timeout: 30_000 });
}

/** Jede Ansicht: Weg dorthin, ausgehend von der geladenen Startseite. */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  start: async () => {},
  // eigener Ablauf in der Schleife unten (ohne Flag, ein Bild je Schritt)
  onboarding: async () => {},
  // Kalender der Merkliste (Plan 0025, E8): Herzen statt localStorage, damit es auch live mit echten IDs geht
  "merkliste-kalender": async (page) => {
    for (const heart of (await page.getByRole("button", { name: / merken$/ }).all()).slice(0, 3)) await heart.click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
  },
  merkliste: async (page) => {
    for (const heart of (await page.getByRole("button", { name: / merken$/ }).all()).slice(0, 2)) await heart.click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
  },
  // Herz mit Stufen (Plan 0057, E2, E3): erstes Herz vorgemerkt, zweites fest, Toast mit „Rückgängig“
  herz: async (page) => {
    const hearts = (await page.getByRole("button", { name: / merken$/ }).all()).slice(0, 2);
    await hearts[0]?.click();
    await hearts[1]?.click();
    await hearts[1]?.click();
    await page.getByRole("button", { name: "Rückgängig" }).waitFor();
  },
  // Wochenleiste und Agenda mit vorgemerkt und fest (Plan 0057, E4)
  "merkliste-woche": async (page) => {
    const hearts = (await page.getByRole("button", { name: / merken$/ }).all()).slice(0, 3);
    for (const [i, heart] of hearts.entries()) {
      await heart.click();
      if (i > 0) await heart.click();
    }
    await page.locator(".toast").waitFor({ state: "detached", timeout: 10_000 });
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
  },
  detail: async (page) => {
    await page.getByTestId("offer").first().getByRole("heading").getByRole("button").click();
    await page.getByRole("dialog").waitFor();
  },
  filter: async (page) => {
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
  },
  // Sortierung (Plan 0043, E4): Menü offen, und die Liste „Neu eingestellt“ mit Etiketten
  sortierung: async (page) => {
    await page.getByRole("button", { name: /^Sortierung:/ }).click();
    await page.getByRole("menu").waitFor();
  },
  neu: async (page) => {
    await page.goto(new URL("?sortierung=neu", page.url()).href);
    await page.getByRole("heading", { level: 2 }).first().waitFor();
  },
  // Nächstgelegen (Plan 0043, E7): ohne Startpunkt die Aufforderung, mit Gostenhof die Wegzeit-Bänder
  nah: async (page) => {
    await page.goto(new URL("?sortierung=nah", page.url()).href);
    await page.getByText("Wovon aus gerechnet?").waitFor();
  },
  "nah-startpunkt": async (page) => {
    await withGostenhof(page);
    await page.goto(new URL("?sortierung=nah", page.url()).href);
    await page
      .getByRole("heading", { level: 2, name: /Minuten/ })
      .first()
      .waitFor();
  },
  kind: async (page) => {
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.getByLabel("Geburtsdatum").fill("02.11.2025");
    // Startpunkt (Plan 0004): Abschnitt „Wegzeit ab“ mit gesetztem Stadtteil
    await page.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  },
  // Quellenhinweis der Wegzeit mit zwei Links (Plan 0009, E3), aus der geladenen wegzeit.json
  "kind-quelle": async (page) => {
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
    const license = page.locator(".source-note a").last();
    await page.locator(".source-note a").nth(1).waitFor();
    await license.scrollIntoViewIfNeeded();
  },
  // Push-Teil (Plan 0017, E7): lange Suche abonniert, Abschnitt „Als App“ im Blick. Mit der Headless-Shell sind
  // Benachrichtigungen immer abgelehnt, man sieht also den Zustand „verweigert“ (Schalter gesperrt).
  push: async (page) => {
    await page.goto(
      new URL(
        "?kat=musik,natur,krabbel-spielgruppen&format=kurs&anmeldung=ohne-anmeldung&kosten=kostenlos&wegzeit=20",
        page.url(),
      ).href,
    );
    // abonniert wird an der Glocke der Schnellfilter-Zeile, verwaltet im Kind-Sheet (Plan 0054, E6, E7)
    const bell = page.getByRole("button", { name: /^Suche „.*“ abonnieren$/ });
    if ((await bell.count()) && (await bell.getAttribute("aria-pressed")) !== "true") await bell.click();
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.locator('html[data-push="bereit"]').waitFor();
    await page.getByRole("heading", { name: "Deine Abos" }).scrollIntoViewIfNeeded();
  },
  "start-startpunkt": async (page) => {
    await withGostenhof(page);
  },
  "filter-wegzeit": async (page) => {
    await withGostenhof(page);
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await sheet.getByRole("button", { name: "bis 30 Min." }).click();
    await sheet.getByRole("heading", { name: "Wegzeit" }).scrollIntoViewIfNeeded();
  },
  karte: openMap,
  ort: async (page) => {
    await openMap(page);
    // Marker eines Orts mit mehreren Angeboten (Orts-Sheet); die Orts-Liste gibt es seit Plan 0056, E5 nicht mehr.
    // `__zpMap` nur im E2E-Build: lokal die Fixture-Vorschau.
    await page.locator(".map-box").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const point = await page.evaluate(() => {
      const map = window.__zpMap;
      const hit = map
        ?.queryRenderedFeatures({ layers: ["orte-punkt"] })
        .find((f) => Number(f.properties["angebote"]) > 1);
      return hit && map?.project(hit.geometry.coordinates);
    });
    const box = await page.locator(".map-box").boundingBox();
    if (!point || !box) throw new Error("kein Ort mit mehreren Angeboten");
    await page.mouse.click(box.x + 2 + point.x, box.y + 2 + point.y);
    await page.getByRole("dialog").waitFor();
  },
  anbieter: openProviders,
  // erste Zeile der Liste (ohne Startpunkt alphabetisch)
  "anbieter-sheet": async (page) => {
    await openProviders(page);
    await page.getByRole("region", { name: "Anbieter" }).locator(".place").first().click();
    await page.getByRole("dialog", { name: "Anbieter" }).getByRole("heading", { level: 2 }).waitFor();
  },
  // Glocke der Suche gedrückt neben den Schnellfiltern, mit Toast (Plan 0054, E6)
  glocke: async (page) => {
    await page.goto(new URL("?kat=musik&format=kurs", page.url()).href);
    const bell = page.getByRole("button", { name: /^Suche „.*“ abonnieren$/ });
    await bell.click();
    await page.getByText(/^Suche abonniert/).waitFor();
  },
  // Tab „Anbieter“ mit zwei Abos oben, Glocken gedrückt (Plan 0054, E1)
  "anbieter-abos": async (page) => {
    await page.evaluate(() =>
      localStorage.setItem("zwergenplan.anbieter-merkliste", JSON.stringify(["fv3fpfp2", "b5nuus36"])),
    );
    await page.reload();
    await openProviders(page);
    await page.locator("ul.provider-saved li").nth(1).waitFor();
  },
  // Tab-Leiste mit Badge und „Anbieter“ aktiv; im Viewport „quer“ die Seitenleiste (Plan 0010, E2)
  tabs: async (page) => {
    await page
      .getByRole("button", { name: / merken$/ })
      .first()
      .click();
    await openProviders(page);
    // Der Toast „Gemerkt …“ (2,8 s) läge sonst über der Liste
    await page.locator(".toast").waitFor({ state: "detached" });
  },
};

/** Tab „Anbieter“ (Plan 0010), wartet auf die Zeilen statt auf den Ladekasten */
async function openProviders(page: Page) {
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: /^Anbieter/ })
    .click();
  await page.getByRole("region", { name: "Anbieter" }).locator(".place").first().waitFor();
  // Anbieterkarte (Plan 0055): erst fotografieren, wenn sie steht; ohne WebGL bleibt der Hinweis im Bild
  await page
    .locator('.map-box[data-state="bereit"]')
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
}

const views = viewsArg ? viewsArg.split(",") : Object.keys(VIEWS);
const browser = await chromium.launch();
for (const vp of viewports) {
  for (const scheme of ["light", "dark"] as const) {
    for (const view of views) {
      const go = VIEWS[view];
      if (!go) throw new Error(`Unbekannte Ansicht ${view}`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        colorScheme: scheme,
        reducedMotion: "reduce",
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
        // Onboarding: Android, damit der App-Schritt erscheint (sonst drei Schritte)
        ...(view === "onboarding" && { userAgent: devices["Pixel 7"].userAgent }),
      });
      if (isLocal) await mockTiles(context);
      // Onboarding erledigt (Plan 0033, E15): Alle Ansichten außer „onboarding“ zeigen die App, nicht die Einführung.
      // Schlüssel und Wert aus `e2e/onboarding-flag.ts` (Plan 0035, E6)
      if (view !== "onboarding")
        await context.addInitScript(({ key, value }) => {
          if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
        }, ONBOARDING_FLAG);
      const page = await context.newPage();
      if (isLocal) await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+02:00"));
      await page.goto(url);
      const suffix = textPercent === 100 ? "" : `-${textPercent}`;
      const shot = async (name: string) => {
        if (textPercent !== 100)
          await page.evaluate((p) => {
            document.documentElement.style.fontSize = `${p}%`;
          }, textPercent);
        await page.waitForTimeout(150);
        const file = `${outDir}/${name}-${vp.name}-${scheme}${suffix}.png`;
        await page.screenshot({ path: file, fullPage: false });
        console.log(file);
      };
      if (view === "onboarding") {
        const intro = page.getByRole("dialog", { name: "Einführung" });
        const title = intro.getByRole("heading", { level: 2 });
        await title.waitFor();
        const total = Number(/von (\d+):/.exec((await title.textContent()) ?? "")?.[1] ?? 0);
        for (let n = 1; n <= total; n++) {
          await page.waitForFunction(
            (want) => document.querySelector("dialog .onb-title")?.textContent?.startsWith(want),
            `Schritt ${n} von`,
          );
          await shot(`onboarding-${n}`);
          if (n < total) await intro.locator(".onb-foot .btn.primary").click();
        }
      } else {
        await ready(page);
        await go(page);
        await shot(view);
      }
      await context.close();
    }
  }
}
await browser.close();
