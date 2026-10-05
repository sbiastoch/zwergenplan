/**
 * Karte der Orte (Plan 0005, Tests 1–11): Umschalter, Orte, Orts-Sheet, Filter, Theme, Kamera-Regel,
 * Fehler. Offline: OpenFreeMap kommt aus tests/fixtures/karte/ (fixtures.ts, `tiles: "mock"`).
 * `window.__zpMap` gibt es nur im E2E-Build (E13, begründete Ausnahme von „E2E ist Black-Box“).
 */
import type { BrowserContext, Page } from "@playwright/test";
import { expect, expectTwoLines, MAP_READY, startPreloads, test, twoLinesEverywhere } from "./fixtures.ts";

const NB = "\u00a0";

/** Nur das, was die Tests von MapLibre brauchen (ohne Abhängigkeit von src/). */
interface TestMap {
  project: (lngLat: [number, number]) => { x: number; y: number };
  queryRenderedFeatures: (options: { layers: string[] }) => Array<{
    geometry: { type: string; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  jumpTo: (options: { zoom?: number; center?: [number, number] }) => void;
  getLayer: (id: string) => unknown;
  getPaintProperty: (layer: string, name: string) => unknown;
  getLayoutProperty: (layer: string, name: string) => unknown;
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

/** Darstellung über das Kind-Sheet: Der Theme-Knopf im Kopf entfällt auf schmalen Geräten (Plan 0007, B5). */
async function switchTheme(page: Page, button: "Hell" | "Dunkel", style: string) {
  const request = page.waitForRequest((req) => req.url().endsWith(style));
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await kid.getByRole("button", { name: button, exact: true }).click();
  await kid.getByRole("button", { name: "Fertig" }).click();
  await request;
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

test("Startseite lädt weder Karten- noch Wegzeit-Code und fragt OpenFreeMap nicht an", async ({ page, context }) => {
  const requests: string[] = [];
  context.on("request", (req) => requests.push(req.url()));
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => /\/assets\/(karte|oepnv)\/|openfreemap|\/data\/wegzeit\.json/.test(url))).toEqual([]);
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

  test("Attribution genau einmal sichtbar und enthält OpenStreetMap (Lizenzpflicht, Browser-Review W1)", async ({
    page,
  }) => {
    await openMap(page);
    const attribution = page.locator(".map-box .maplibregl-ctrl-attrib");
    await expect(attribution).toHaveCount(1);
    await expect(attribution).toBeVisible();
    const osm = attribution.getByRole("link", { name: "OpenStreetMap" });
    await expect(osm).toHaveCount(1);
    await expect(osm).toBeVisible();
    await expect(osm).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    await expect(attribution.getByRole("link", { name: "OpenFreeMap" })).toHaveCount(1);
    await expect(attribution.getByRole("link", { name: /OpenMapTiles/ })).toHaveCount(1);
    expect((await attribution.innerText()).match(/OpenStreetMap/g)).toHaveLength(1);
  });

  test("Schnellfilter „Kurse“ wirkt auf Orte und Statuszeile", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: "Kurse", exact: true }).click();
    await expect(page).toHaveURL(/\?format=kurs&ansicht=karte$/);
    await expect(page.getByRole("status")).toHaveText("2 Angebote an 2 Orten");
    await expect(places(page)).toHaveText([/^Familientreff Beispielhof/, /^Musikschule Beispiel, Haus Süd/]);
  });

  test("Orts-Liste öffnet das Orts-Sheet, das Detail darüber, Zurück führt ins Sheet; Kacheln ohne Ortsangaben", async ({
    page,
  }) => {
    // Startpunkt Gostenhof (nur die Stadtteil-ID liegt im Speicher, Plan 0004): Die Liste zeigt Wegzeiten.
    await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await openMap(page);
    await places(page).filter({ hasText: "Familientreff Beispielhof" }).click();
    const sheet = page.getByRole("dialog", { name: "Familientreff Beispielhof" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Beispielstraße 1, 90402 Nürnberg")).toBeVisible();
    // Beispielhof ab Gostenhof: 1,58 Min. zu Halt 9001 + Zelle 12 (Tram 1) = 13,6 → „ca. 15 Min. mit Tram 1“
    await expect(sheet.getByText(`ca. 15 Min. mit Tram${NB}1 ab Gostenhof`)).toBeVisible();
    await expect(sheet.getByTestId("offer")).toHaveCount(3);
    // Der Kopf nennt Ort und Wegzeit; die Kacheln nur noch den Anbieter (Plan 0008, E19)
    const metas = await sheet.getByTestId("offer").locator(".meta").allInnerTexts();
    expect(metas).toHaveLength(3);
    for (const meta of metas) {
      expect(meta, "Meta-Zeile im Orts-Sheet").not.toContain("·");
      expect(meta, "Meta-Zeile im Orts-Sheet").not.toMatch(/\d+(,\d)? k?m|Min\./);
      expect(meta.trim(), "Anbieter bleibt").not.toBe("");
    }
    await sheet.getByRole("button", { name: "Offener Krabbeltreff", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Offener Krabbeltreff" })).toBeVisible();
    await expect(page).toHaveURL(/ansicht=karte&angebot=/);
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "Offener Krabbeltreff" })).toBeHidden();
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Schließen" }).click();
    await expect(sheet).toBeHidden();

    // In der Liste steht die Wegzeit weiter.
    await page.getByRole("button", { name: "Liste", exact: true }).click();
    await expect(page.getByTestId("offer").first().locator(".meta")).toContainText(/ · \d+ Min\.$/);
  });

  test("Orts-Sheet mit zwei Linien: „→“ in einer Zeile mit beiden Namen (Plan 0012, E1, Review 2, W3)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await twoLinesEverywhere(page);
    await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await openMap(page);
    await places(page).filter({ hasText: "Familientreff Beispielhof" }).click();
    const sheet = page.getByRole("dialog", { name: "Familientreff Beispielhof" });
    // .place-where > span: nur der Wrapper steht als eigene Zeile, nicht Pfeil und „, dann“
    await expectTwoLines(sheet.locator(".reach-long"), "ca. 15 Min. mit Tram 1, dann Bus 202E ab Gostenhof");
  });

  test("Wegzeit: Öffnen der Karte lädt die Tabelle, Orts-Liste mit Minuten nach Wegzeit sortiert (Plan 0009, E9/E11)", async ({
    page,
  }) => {
    const preloaded = startPreloads(page);
    await page.goto("./");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    const table = page.waitForResponse((r) => r.url().endsWith("/data/wegzeit.json") && r.ok());
    const chunk = page.waitForResponse((r) => /\/assets\/oepnv\/[^/]+\.js$/.test(r.url()) && r.ok());
    // Plan 0012, E3: die Linien kommen nach Tabelle und Chunk; erst danach beginnt die Zählung
    const lines = page.waitForResponse((r) => r.url().endsWith("/data/linien.json") && r.ok());
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await Promise.all([table, chunk, lines]);
    await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);

    // Startpunkt über das Kind-Sheet: ab der Wahl kein Request, auch keine Kachel (Kamera-Regel)
    await preloaded;
    await page.getByRole("button", { name: "Startpunkt wählen" }).click();
    const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    // Das Öffnen lädt den Abschnitt „Als App“ (für alle gleich, Plan 0011, E5); gezählt wird ab der Wahl
    await expect(kid.locator(".app-pending")).toHaveCount(0);
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));
    await kid.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
    await kid.getByRole("button", { name: "Fertig" }).click();
    await expect(page.getByRole("status")).toContainText("Wegzeit ab Gostenhof mit Bus & Bahn");
    // nach Wegzeit (Plan 0012, von Hand nachgerechnet, Rechenweg in startpunkt.spec.ts): Theater 3,6, Beispielhof
    // 13,6, Bibliothek 15,6, Gemeinde 23,6 (Tram 1 → Bus 202E; vorher 32,6 über Bus 2, die Fixture-Linie 202E kam mit Plan 0012),
    // Musikschule 29,6 Min. (Tram 1 → Bus 2)
    await expect(places(page)).toHaveText([
      /^Kleines Theater Beispiel.* · 5 Min\.$/,
      /^Familientreff Beispielhof.* · 15 Min\.$/,
      /^Bibliothek Beispiel Zentrum.* · 15 Min\.$/,
      /^Gemeindehaus.* · 25 Min\.$/,
      /^Musikschule Beispiel, Haus Süd.* · 30 Min\.$/,
    ]);
    // ein Angebot: Das Detail öffnet direkt, mit zwei Linien
    await places(page).filter({ hasText: "Musikschule Beispiel" }).click();
    await expectTwoLines(
      page.getByRole("dialog").locator(".reach-long"),
      "ca. 30 Min. mit Tram 1, dann Bus 2 ab Gostenhof",
    );
    // Stadtteil-Zoom lädt Kacheln (erlaubt, ADR 0008); sonst kommt nichts dazu, schon gar nicht wegzeit.json
    expect(requests.filter((url) => !url.startsWith("https://tiles.openfreemap.org/"))).toEqual([]);
  });

  test("Kartenmitte als Startpunkt ergibt Minuten (Plan 0009, E9)", async ({ page }) => {
    await openMap(page);
    // Kartenmitte zum Beispielhof schieben (wie ein Wischen); die Kamera-Regel betrifft nur das Fahren der App
    await page.evaluate(() => window.__zpMap?.jumpTo({ center: [11.0767, 49.4521] }));
    await idle(page);
    await page.getByRole("button", { name: "Kartenmitte als Startpunkt" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Wegzeit ab der Kartenmitte mit Bus & Bahn (Di vormittags, höchstens 1 Umstieg, inkl. Warten)",
    );
    await expect(places(page).first()).toHaveText(/^Familientreff Beispielhof.* · 5 Min\.$/);
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
      await switchTheme(page, button, style);
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

  test("Ortsnamen auf Deutsch, auch nach dem Stilwechsel (Plan 0008, E16)", async ({ page }) => {
    await openMap(page);
    const textField = () =>
      page.evaluate(() => JSON.stringify(window.__zpMap?.getLayoutProperty("label-stadt", "text-field") ?? null));
    expect(await textField()).toContain('"name:de"');
    expect(await textField()).not.toContain("name_en");

    await switchTheme(page, "Dunkel", "/styles/dark");
    await expect.poll(() => page.evaluate(() => !!window.__zpMap?.getLayer("bg-dunkel"))).toBe(true);
    await expect.poll(textField).toContain('"name:de"');
    expect(await textField()).not.toContain("name_en");
  });

  test("Attribution in der App-Schrift (Plan 0008, E17)", async ({ page }) => {
    await openMap(page);
    const fonts = await page.evaluate(() => {
      // Engines und Minifier schreiben Familiennamen mal mit, mal ohne Anführungszeichen
      const first = (value: string) => value.split(",")[0]?.replace(/["']/g, "").trim();
      const attribution = document.querySelector(".map-box .maplibregl-ctrl-attrib");
      return {
        attribution: attribution ? first(getComputedStyle(attribution).fontFamily) : undefined,
        app: first(getComputedStyle(document.documentElement).getPropertyValue("--font-sans")),
      };
    });
    expect(fonts.app, "--font-sans").toBeTruthy();
    expect(fonts.attribution).toBe(fonts.app);
  });

  test("Startausschnitt hält die Ecke der Zoom-Knöpfe frei (Plan 0008, E20)", async ({ page }) => {
    await openMap(page);
    const { zoom, markers } = await page.evaluate(() => {
      const map = window.__zpMap;
      const canvas = document.querySelector(".map-box .map-canvas")?.getBoundingClientRect();
      const ctrl = document.querySelector(".maplibregl-ctrl-top-right .maplibregl-ctrl-group")?.getBoundingClientRect();
      if (!map || !canvas || !ctrl) throw new Error("keine Karte oder keine Zoom-Knöpfe");
      // Kreisradius plus Rand (layers.ts: Cluster 18, Ort 14, Rand 2)
      const radius: Record<string, number> = { "orte-cluster": 20, "orte-punkt": 16 };
      const zoom = {
        left: ctrl.left - canvas.left,
        right: ctrl.right - canvas.left,
        top: ctrl.top - canvas.top,
        bottom: ctrl.bottom - canvas.top,
      };
      const markers = Object.keys(radius).flatMap((layer) =>
        map.queryRenderedFeatures({ layers: [layer] }).map((f) => {
          const { x, y } = map.project(f.geometry.coordinates);
          const dx = Math.max(zoom.left - x, 0, x - zoom.right);
          const dy = Math.max(zoom.top - y, 0, y - zoom.bottom);
          return { layer, x, y, r: radius[layer] ?? 0, distance: Math.hypot(dx, dy) };
        }),
      );
      return { zoom, markers };
    });
    expect(markers.length, "Marker im Startausschnitt").toBeGreaterThan(0);
    for (const m of markers) {
      expect(
        m.distance,
        `${m.layer} bei ${Math.round(m.x)}/${Math.round(m.y)} unter den Zoom-Knöpfen ${JSON.stringify(zoom)}`,
      ).toBeGreaterThan(m.r);
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
    await expect(page.getByRole("status")).toContainText("ab der Kartenmitte");
    await expect(page.getByRole("button", { name: "Startpunkt: Kartenmitte" })).toBeVisible();
    await idle(page);
    expect(tileLog.length, "keine Kacheln nach „Kartenmitte als Startpunkt“").toBe(tiles);
    expect(await camera(page)).toEqual(start);
    expect(await page.evaluate(() => window.__zpMap?.queryRenderedFeatures({ layers: ["startpunkt"] }).length)).toBe(1);
    // mit Startpunkt steht die Entfernung an jedem Ort (Wegzeit oder, weit weg von jedem Halt, Luftlinie)
    await expect(places(page).first()).toContainText(/ · (\d+ Min\.|\d[\d,]* k?m)$/);

    // Gegenprobe: Ein Stadtteil darf die Kamera bewegen.
    await page.getByRole("button", { name: "Startpunkt: Kartenmitte" }).click();
    await kid.getByLabel("Stadtteil", { exact: true }).selectOption("langwasser");
    await kid.getByRole("button", { name: "Fertig" }).click();
    await expect.poll(async () => (await camera(page)).lat).toBeLessThan(start.lat - 0.005);
  });

  test("Startausschnitt verrät weder Standort noch Alter: Standort, Geburtsdatum, „Kurse“ und „bis 20 Min.“ in der Liste, dann Karte (Arch-Review B1, m1; Plan 0009)", async ({
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

    // Neuladen leert den Sitzungs-Ausschnitt; Standort (nahe Familientreff) und Wegzeit-Grenze in der Liste
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 49.45213, longitude: 11.07672 });
    await page.goto("./");
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await kid.getByRole("button", { name: "Meinen Standort nutzen" }).click();
    await expect(kid.getByText("Startpunkt:")).toContainText("Mein Standort");
    await kid.getByLabel("Geburtsdatum").fill("01.09.2026");
    await expect(kid.getByText("Dein Kind ist heute 1 Monat alt.")).toBeVisible();
    await kid.getByRole("button", { name: "Fertig" }).click();
    await page.getByRole("button", { name: "Kurse", exact: true }).click();
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const filter = page.getByRole("dialog", { name: "Filter" });
    await filter.getByRole("button", { name: "bis 20 Min." }).click();
    await filter.getByRole("button", { name: /Angebote? zeigen$/ }).click();
    const before = tileLog.length;
    const withOrigin = await openFromList();
    // Filter, Alter und Wegzeit wirken auf die Orte, aber nicht auf den Ausschnitt
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
    // Zustandsfolge der Karte ab dem Tipp mitschreiben (Arch-Review 0008, m5): „Seite neu laden“ darf nie vor
    // „laden“ erscheinen. Früher zeigte ein Zwischen-Render mit altem „fehler“ kurz „Seite neu laden“ (Lazy.tsx).
    await page.evaluate(() => {
      const root = document.documentElement;
      root.dataset["retryLog"] = "";
      let last = "";
      const record = () => {
        const box = document.querySelector(".map-box");
        const reload = [...(box?.querySelectorAll("button") ?? [])].some(
          (b) => b.textContent?.trim() === "Seite neu laden",
        );
        const entry = `${box?.getAttribute("data-state") ?? "-"}${reload ? "+neu laden" : ""}`;
        if (entry !== last) root.dataset["retryLog"] = `${root.dataset["retryLog"]}${entry};`;
        last = entry;
      };
      new MutationObserver(record).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-state"],
      });
    });
    await mapBox(page).getByRole("button", { name: "Nochmal versuchen" }).click();
    const reload = mapBox(page).getByRole("button", { name: "Seite neu laden" });
    // Erst der Endzustand des zweiten Versuchs entscheidet, und nur einmal gelesen: Ein zweites isVisible()
    // konnte früher in den Ladezustand fallen, dann fehlte das Neuladen (CI-Befund zu ffddb46, desktop).
    let outcome: string | null = null;
    await expect
      .poll(async () => {
        outcome = (await reload.isVisible()) ? "neu laden" : await mapBox(page).getAttribute("data-state");
        return outcome;
      })
      .toMatch(/^(neu laden|bereit)$/);
    const states = ((await page.locator("html").getAttribute("data-retry-log")) ?? "").split(";").filter(Boolean);
    const firstReload = states.findIndex((st) => st.endsWith("+neu laden"));
    const firstLoading = states.findIndex((st) => st.startsWith("laden"));
    expect(firstLoading, `„laden“ nach dem Tipp (Folge: ${states.join(" → ")})`).toBeGreaterThanOrEqual(0);
    if (firstReload >= 0)
      expect(firstReload, `„Seite neu laden“ erst nach „laden“ (Folge: ${states.join(" → ")})`).toBeGreaterThan(
        firstLoading,
      );
    // Manche Browser merken sich den fehlgeschlagenen Import; dann hilft nur Neuladen (E2).
    if (outcome === "neu laden") {
      // auf das load-Ereignis des neuen Dokuments warten; waitForLoadState() hielte das alte schon für geladen
      const loaded = page.waitForEvent("load");
      await reload.click();
      await loaded;
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
