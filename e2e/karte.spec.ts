/**
 * Karte der Orte (Plan 0005, Tests 1–11): Umschalter, Orte, Orts-Sheet, Filter, Theme, Kamera-Regel,
 * Fehler. Offline: OpenFreeMap kommt aus tests/fixtures/karte/ (fixtures.ts, `tiles: "mock"`).
 * `window.__zpMap` gibt es nur im E2E-Build (E13, begründete Ausnahme von „E2E ist Black-Box“).
 */
import type { BrowserContext, Page } from "@playwright/test";
import { expect, MAP_READY, test } from "./fixtures.ts";

/** Nur das, was die Tests von MapLibre brauchen (ohne Abhängigkeit von src/). */
interface TestMap {
  project: (lngLat: [number, number]) => { x: number; y: number };
  queryRenderedFeatures: (options: { layers: string[] }) => Array<{
    geometry: { type: string; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  jumpTo: (options: { zoom: number }) => void;
  getLayer: (id: string) => unknown;
  getPaintProperty: (layer: string, name: string) => unknown;
  loaded: () => boolean;
  once: (event: string, listener: () => void) => void;
}
declare global {
  interface Window {
    __zpMap?: TestMap;
  }
}

const mapBox = (page: Page) => page.locator(".map-box");
const places = (page: Page) => page.getByRole("region", { name: "Orte" }).getByRole("button");

async function openMap(page: Page, path = "./?ansicht=karte") {
  await page.goto(path);
  await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);
  await idle(page);
}

/** Wartet, bis die Karte nichts mehr lädt oder bewegt. */
async function idle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.__zpMap;
        if (!map || map.loaded()) resolve();
        else map.once("idle", () => resolve());
      }),
  );
}

async function camera(page: Page) {
  return page.evaluate(() => {
    const map = window.__zpMap;
    if (!map) throw new Error("keine Karte");
    const { lat, lng } = map.getCenter();
    return { lat, lng, zoom: map.getZoom() };
  });
}

/** Tippt auf den ersten Marker eines Layers (ohne `angebote`: irgendeinen), Position über `project`. */
async function tapMarker(page: Page, layer: "orte-punkt" | "orte-cluster", angebote?: number) {
  const point = await page.evaluate(
    ({ layer, angebote }) => {
      const map = window.__zpMap;
      const feature = map
        ?.queryRenderedFeatures({ layers: [layer] })
        .find((f) => angebote === undefined || f.properties["angebote"] === angebote);
      return feature && map?.project(feature.geometry.coordinates);
    },
    { layer, angebote },
  );
  if (!point) throw new Error(`kein Marker ${layer} mit ${angebote ?? "beliebig vielen"} Angeboten`);
  // Karte oben in den Viewport: sonst liegt der Marker auf kleinen Geräten unter der festen Tab-Leiste.
  await mapBox(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
  const box = await mapBox(page).boundingBox();
  if (!box) throw new Error("keine Karte");
  // +2: Rahmen der .map-box
  await page.mouse.click(box.x + 2 + point.x, box.y + 2 + point.y);
}

test("Startseite lädt keinen Karten-Code und fragt OpenFreeMap nicht an", async ({ page, context }) => {
  const requests: string[] = [];
  context.on("request", (req) => requests.push(req.url()));
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => url.includes("/assets/karte/") || url.includes("openfreemap"))).toEqual([]);
});

test.describe("mit gemockten Kacheln", () => {
  test.use({ tiles: "mock" });

  test("Umschalter „Karte“: Orte, Attribution, Kacheln aus dem Worker, Neuladen, zurück zur Liste", async ({
    page,
    tileLog,
  }) => {
    await page.goto("./");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page).toHaveURL(/\?ansicht=karte$/);
    await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);
    await expect(page.getByRole("button", { name: "Karte", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Entdecken" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("status")).toHaveText("8 Angebote an 5 Orten");
    await expect(places(page)).toHaveCount(5);
    const attribution = page.locator(".maplibregl-ctrl-attrib");
    await expect(attribution).toBeVisible();
    await expect(attribution).toHaveText("OpenFreeMap © OpenMapTiles Data from OpenStreetMap");
    await expect(
      page.getByText("Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät."),
    ).toBeVisible();

    // Kacheln wurden vom Mock bedient, und sie kamen aus MapLibres Worker (dessen Resource-Timing kennt sie).
    expect(tileLog.length).toBeGreaterThan(0);
    const fromWorker = await Promise.all(
      page
        .workers()
        .map((worker) =>
          worker.evaluate(
            () => performance.getEntriesByType("resource").filter((e) => e.name.includes("/planet/test/")).length,
          ),
        ),
    );
    expect(Math.max(0, ...fromWorker), "Kachel-Requests aus dem Worker").toBeGreaterThan(0);

    await page.reload();
    await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);

    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Entdecken" }).click();
    await expect(page).not.toHaveURL(/ansicht/);
    await expect(page.getByRole("button", { name: "Liste", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(mapBox(page)).toHaveCount(0);
  });

  test("Schnellfilter „Kurse“ wirkt auf Orte und Statuszeile", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: "Kurse", exact: true }).click();
    await expect(page).toHaveURL(/\?format=kurs&ansicht=karte$/);
    await expect(page.getByRole("status")).toHaveText("2 Angebote an 2 Orten");
    await expect(places(page)).toHaveText([/^Familientreff Beispielhof/, /^Musikschule Beispiel, Haus Süd/]);
  });

  test("Orts-Liste öffnet das Orts-Sheet, das Detail darüber, Zurück führt ins Sheet", async ({ page }) => {
    await openMap(page);
    await places(page).filter({ hasText: "Familientreff Beispielhof" }).click();
    const sheet = page.getByRole("dialog", { name: "Familientreff Beispielhof" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Beispielstraße 1, 90402 Nürnberg")).toBeVisible();
    await expect(sheet.getByTestId("offer")).toHaveCount(3);
    await sheet.getByRole("button", { name: "Offener Krabbeltreff", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Offener Krabbeltreff" })).toBeVisible();
    await expect(page).toHaveURL(/ansicht=karte&angebot=/);
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "Offener Krabbeltreff" })).toBeHidden();
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Schließen" }).click();
    await expect(sheet).toBeHidden();
  });

  test("Ort mit einem Angebot öffnet direkt das Detail", async ({ page }) => {
    await openMap(page);
    await places(page).filter({ hasText: "Bibliothek Beispiel Zentrum" }).click();
    await expect(page.getByRole("dialog", { name: "Krabbelreime & Fingerspiele" })).toBeVisible();
  });

  test("Tipp auf Marker öffnet das Orts-Sheet, Tipp auf Cluster zoomt hinein", async ({ page }) => {
    await openMap(page);
    await tapMarker(page, "orte-punkt", 2);
    const sheet = page.getByRole("dialog", { name: "Kleines Theater Beispiel" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Schließen" }).click();

    await page.evaluate(() => window.__zpMap?.jumpTo({ zoom: 10 }));
    await idle(page);
    const before = (await camera(page)).zoom;
    await tapMarker(page, "orte-cluster");
    await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(before);
  });

  test("Stilwechsel hell ↔ dunkel behält Marker, Farben und Tippen", async ({ page }) => {
    await openMap(page);
    for (const [button, style, background] of [
      ["Dunkel", "/styles/dark", "bg-dunkel"],
      ["Hell", "/styles/positron", "bg-hell"],
    ] as const) {
      const request = page.waitForRequest((req) => req.url().endsWith(style));
      // über das Kind-Sheet: Der Theme-Knopf im Kopf entfällt auf schmalen Geräten (Plan 0007, B5)
      await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
      const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
      await kid.getByRole("button", { name: button, exact: true }).click();
      await kid.getByRole("button", { name: "Fertig" }).click();
      await request;
      await expect
        .poll(() =>
          page.evaluate((bg) => !!window.__zpMap?.getLayer(bg) && !!window.__zpMap.getLayer("orte-punkt"), background),
        )
        .toBe(true);
      const colors = await page.evaluate(() => ({
        token: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
        circle: window.__zpMap?.getPaintProperty("orte-punkt", "circle-color"),
      }));
      expect(colors.token).not.toBe("");
      expect(colors.circle).toBe(colors.token);
      await idle(page);
      await tapMarker(page, "orte-punkt", 2);
      const sheet = page.getByRole("dialog", { name: "Kleines Theater Beispiel" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("button", { name: "Schließen" }).click();
    }
  });

  test("Kamera-Regel: Standort und Kartenmitte bewegen die Karte nicht und laden keine Kacheln", async ({
    page,
    context,
    tileLog,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 49.45213, longitude: 11.07672 });
    await openMap(page);
    const tiles = tileLog.length;
    const start = await camera(page);

    await page.getByRole("button", { name: "Startpunkt wählen" }).click();
    const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await kid.getByRole("button", { name: "Meinen Standort nutzen" }).click();
    await expect(kid.getByText("Startpunkt:")).toContainText("Mein Standort");
    await kid.getByRole("button", { name: "Fertig" }).click();
    await expect(page.getByRole("status")).toContainText("ab deinem Standort");
    await idle(page);
    expect(tileLog.length, "keine Kacheln nach „Meinen Standort nutzen“").toBe(tiles);
    expect(await camera(page)).toEqual(start);

    await page.getByRole("button", { name: "Kartenmitte als Startpunkt" }).click();
    await expect(page.getByRole("status")).toContainText("Entfernung als Luftlinie ab der Kartenmitte");
    await expect(page.getByRole("button", { name: "Startpunkt: Kartenmitte" })).toBeVisible();
    await idle(page);
    expect(tileLog.length, "keine Kacheln nach „Kartenmitte als Startpunkt“").toBe(tiles);
    expect(await camera(page)).toEqual(start);
    expect(await page.evaluate(() => window.__zpMap?.queryRenderedFeatures({ layers: ["startpunkt"] }).length)).toBe(1);
    // mit Startpunkt steht die Entfernung an jedem Ort
    await expect(places(page).first()).toContainText(/ · \d[\d,]* k?m$/);

    // Gegenprobe: Ein Stadtteil darf die Kamera bewegen.
    await page.getByRole("button", { name: "Startpunkt: Kartenmitte" }).click();
    await kid.getByLabel("Stadtteil", { exact: true }).selectOption("langwasser");
    await kid.getByRole("button", { name: "Fertig" }).click();
    await expect.poll(async () => (await camera(page)).lat).toBeLessThan(start.lat - 0.005);
  });

  test("Startausschnitt verrät den Standort nicht: Standort + „bis 2 km“ in der Liste, dann Karte (Arch-Review B1)", async ({
    page,
    context,
    tileLog,
  }) => {
    const openFromList = async () => {
      await page.getByRole("button", { name: "Karte", exact: true }).click();
      await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);
      await idle(page);
      return camera(page);
    };
    const tilesSince = (index: number) => [...new Set(tileLog.slice(index).map((t) => t.path))].sort();

    // ohne Startpunkt
    await page.goto("./");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    const plain = await openFromList();
    const plainTiles = tilesSince(0);

    // Neuladen leert den Sitzungs-Ausschnitt; Standort (nahe Familientreff) und Umkreis in der Liste
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 49.45213, longitude: 11.07672 });
    await page.goto("./");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await kid.getByRole("button", { name: "Meinen Standort nutzen" }).click();
    await expect(kid.getByText("Startpunkt:")).toContainText("Mein Standort");
    await kid.getByRole("button", { name: "Fertig" }).click();
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const filter = page.getByRole("dialog", { name: "Filter" });
    await filter.getByRole("button", { name: "bis 2 km" }).click();
    await filter.getByRole("button", { name: /Angebote? zeigen$/ }).click();
    const before = tileLog.length;
    const withOrigin = await openFromList();
    // Der Umkreis wirkt auf die Orte, aber nicht auf den Ausschnitt
    await expect(page.getByRole("status")).not.toContainText("an 5 Orten");
    expect(withOrigin).toEqual(plain);
    expect(tilesSince(before)).toEqual(plainTiles);
  });

  test("ohne WebGL: Hinweis, Orts-Liste da, keine Kartenmitte", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type === "webgl" || type === "webgl2") return null;
          return Reflect.apply(original, this, [type, ...rest]);
        },
      });
    });
    await page.goto("./?ansicht=karte");
    await expect(mapBox(page)).toHaveAttribute("data-state", "fehler");
    await expect(mapBox(page)).toContainText(
      "Dein Browser kann die Karte nicht zeigen. Die Orte stehen unten in der Liste.",
    );
    await expect(places(page)).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Kartenmitte als Startpunkt" })).toHaveCount(0);
  });

  test("Wächter: Kachel-URLs mit Querystring oder fremdem Host verlassen den Browser nicht, auch nicht aus dem Worker", async ({
    page,
    routeTiles,
    tileLog,
  }) => {
    for (const tiles of [
      "https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf?key=geheim",
      "https://example.org/planet/{z}/{x}/{y}.pbf",
    ]) {
      const unroute = await routeTiles("https://tiles.openfreemap.org/styles/positron", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            version: 8,
            sources: { openmaptiles: { type: "vector", tiles: [tiles] } },
            layers: [{ id: "wasser", type: "fill", source: "openmaptiles", "source-layer": "water" }],
          }),
        }),
      );
      await page.goto("./?ansicht=karte");
      // guardTileRequest wirft vor dem ersten load → Fehlerzustand, kein Request (fixtures.ts prüft Querystring und Host)
      await expect(mapBox(page)).toHaveAttribute("data-state", "fehler");
      await unroute();
    }
    expect(tileLog).toEqual([]);
  });
});

/** Erlaubte Konsolenfehler nur hier, mit konkretem Muster gegen URL und Text (E13). */
test.describe("Stil nicht ladbar", () => {
  test.use({
    tiles: "mock",
    allowedConsoleErrors: [/^https:\/\/tiles\.openfreemap\.org\/\S+ Failed to load resource/],
  });

  test("ohne Kartenbilder (Stil 503): Hinweis, Orts-Liste bedienbar, Neuaufbau klappt", async ({
    page,
    routeTiles,
  }) => {
    const unroute = await routeTiles("https://tiles.openfreemap.org/styles/**", (route) =>
      route.fulfill({ status: 503 }),
    );
    await page.goto("./?ansicht=karte");
    await expect(mapBox(page)).toHaveAttribute("data-state", "fehler");
    await expect(mapBox(page)).toContainText(
      "Kartenbilder lassen sich gerade nicht laden. Die Orte stehen unten in der Liste.",
    );
    await expect(page.getByRole("button", { name: "Kartenmitte als Startpunkt" })).toHaveCount(0);
    await places(page).filter({ hasText: "Bibliothek Beispiel Zentrum" }).click();
    await expect(page.getByRole("dialog", { name: "Krabbelreime & Fingerspiele" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Zurück" }).click();

    await unroute();
    await mapBox(page).getByRole("button", { name: "Nochmal versuchen" }).click();
    await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);
    await expect(page.getByRole("button", { name: "Kartenmitte als Startpunkt" })).toBeVisible();
  });
});

test.describe("Karten-Code nicht ladbar", () => {
  test.use({
    tiles: "mock",
    allowedConsoleErrors: [
      /\/assets\/karte\/\S+ .*(ERR_FAILED|Failed to load|Failed to fetch dynamically imported module)/,
    ],
  });

  /** „Nochmal versuchen“, ggf. „Seite neu laden“; endet mit bereiter Karte und ansicht=karte (E2). */
  async function recover(page: Page, context: BrowserContext, browserName: string) {
    await mapBox(page).getByRole("button", { name: "Nochmal versuchen" }).click();
    const reload = mapBox(page).getByRole("button", { name: "Seite neu laden" });
    await expect
      .poll(async () => (await reload.isVisible()) || (await mapBox(page).getAttribute("data-state")) === "bereit")
      .toBe(true);
    // Manche Browser merken sich den fehlgeschlagenen Import; dann hilft nur Neuladen (E2).
    if (await reload.isVisible()) {
      await reload.click();
      await page.waitForLoadState();
    }
    await expect(page).toHaveURL(/ansicht=karte/);
    let target = page;
    if (browserName === "webkit") {
      // Befund (Playwright 1.63, WebKit): Ein fehlgeschlagenes Modul-Skript fragt dieselbe Seite nie wieder an,
      // auch nicht nach reload() oder goto(); erst ein neuer Tab lädt es. Echtes iPhone: Browser-Review (Plan 0005).
      target = await context.newPage();
      await target.goto("./?ansicht=karte");
    }
    await expect(mapBox(target)).toHaveAttribute("data-state", "bereit", MAP_READY);
  }

  test("Karten-Oberfläche nicht ladbar: Hinweis auf die Liste, erneuter Versuch bzw. Neuladen", async ({
    page,
    context,
    browserName,
  }) => {
    await context.route("**/assets/karte/**", (route) => route.abort());
    await page.goto("./?ansicht=karte");
    await expect(mapBox(page)).toHaveAttribute("data-state", "fehler");
    await expect(mapBox(page)).toContainText(
      "Die Karte konnte nicht geladen werden. Alle Angebote stehen in der Liste.",
    );
    // Der Weg ohne Karte ist der Umschalter
    await expect(page.getByRole("button", { name: "Liste", exact: true })).toBeVisible();

    await context.unroute("**/assets/karte/**");
    await recover(page, context, browserName);
  });

  test("nur MapLibre nicht ladbar: Orts-Liste bleibt bedienbar, erneuter Versuch bzw. Neuladen", async ({
    page,
    context,
    browserName,
  }) => {
    await context.route("**/assets/karte/MapView-*", (route) => route.abort());
    await page.goto("./?ansicht=karte");
    await expect(mapBox(page)).toHaveAttribute("data-state", "fehler");
    await expect(mapBox(page)).toContainText(
      "Die Karte konnte nicht geladen werden. Die Orte stehen unten in der Liste.",
    );
    await expect(places(page)).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Kartenmitte als Startpunkt" })).toHaveCount(0);
    await places(page).filter({ hasText: "Familientreff Beispielhof" }).click();
    await expect(page.getByRole("dialog", { name: "Familientreff Beispielhof" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Schließen" }).click();

    await context.unroute("**/assets/karte/MapView-*");
    await recover(page, context, browserName);
  });
});
