/**
 * Anbieterkarte im Tab „Anbieter“ (Plan 0055, E8): Karte über der Liste, Orte und Orts-Sheet, Ausschnitt filtert die
 * Liste, Kamera-Regel, Fehlerwege. Fixtures: sechs Anbieter mit sieben Orten, der Turnverein ohne Termine (zwei blasse
 * Orte). Fälle mit zwei Anbietern an einem Ort, Rückfall-Anbieter und altem anbieter.json laufen über eine Route auf
 * anbieter.json (N2), `tests/fixtures/` bleibt unverändert. `window.__zpMap` gibt es nur im E2E-Build.
 */
import type { Page } from "@playwright/test";
import { expect, expectAttributionCollapses, MAP_READY, mapSettled, test } from "./fixtures.ts";

test.use({ tiles: "mock" });

// `window.__zpMap` deklariert karte.spec.ts global (TestMap), hier ohne zweite Deklaration

const THEATER = { lat: 49.4495, lon: 11.0601 };
const TREFF = { lat: 49.4521, lon: 11.0767 };
const TURNHALLE = { lat: 49.4392, lon: 11.0442 };
/** alle sieben Katalog-Orte der Fixtures */
const ALL_PLACES = [
  THEATER,
  TREFF,
  TURNHALLE,
  { lat: 49.4498, lon: 11.0812 },
  { lat: 49.4301, lon: 11.0892 },
  { lat: 49.4362, lon: 11.0851 },
  { lat: 49.4502, lon: 11.1301 },
];

const mapBox = (page: Page) => page.locator(".map-box");
const status = (page: Page) => page.getByRole("status");
const rows = (page: Page) => page.locator("section.providers button.place");
const providerSheet = (page: Page) => page.getByRole("dialog", { name: "Anbieter" });
const DIRECTORY = "**/data/anbieter.json";

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

async function openTab(page: Page, path = "./?ansicht=anbieter") {
  await page.goto(path);
  await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);
  await idle(page);
  await expect(page.getByRole("region", { name: "Anbieter" })).toBeVisible();
}

/** Properties der Quelle „anbieter-orte“ (Eingangsdaten, ohne Cluster und Kachel-Duplikate, Review m11) */
async function features(page: Page) {
  return page.evaluate(async () => {
    const data = await window.__zpMap?.getSource("anbieter-orte")?.getData();
    return (data?.features ?? []).map((f) => f.properties);
  });
}

/** fährt hin (ohne Animation) und wartet, bis die Liste den Ausschnitt kennt */
async function jump(page: Page, at: { lat: number; lon: number }, zoom: number) {
  await page.evaluate(({ lat, lon, z }) => window.__zpMap?.jumpTo({ center: [lon, lat], zoom: z }), {
    ...at,
    z: zoom,
  });
  await idle(page);
}

/** Tipp auf einen Ort (Bildschirmpunkt aus MapLibre, relativ zur Karte) */
async function tapPlace(page: Page, at: { lat: number; lon: number }) {
  const point = await page.evaluate(({ lat, lon }) => window.__zpMap?.project([lon, lat]), at);
  if (!point) throw new Error("keine Karte");
  await page.locator(".map-box .map-canvas canvas").click({ position: point });
}

/** anbieter.json über eine Route verändern (N2) */
async function patchDirectory(
  page: Page,
  change: (data: { providers: Array<Record<string, unknown>> }) => { providers: Array<Record<string, unknown>> },
) {
  await page.route(DIRECTORY, async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as { providers: Array<Record<string, unknown>> };
    await route.fulfill({ response, json: change(data) });
  });
}

test.describe("Anbieterkarte (Plan 0055)", () => {
  test("1: Karte ohne Hinweistext, ein Marker je Ort", async ({ page }) => {
    await openTab(page);
    // Den Hinweis auf OpenFreeMap trägt nur die Quellenangabe in der Karte (Plan 0056, E3)
    await expect(page.getByText(/Kartenbilder kommen/)).toHaveCount(0);
    // Reihenfolge wie Mockup C: Suche, Karte, Statuszeile, Liste
    const top = async (selector: string) => (await page.locator(selector).first().boundingBox())?.y ?? -1;
    const order = [
      await top("input[type=search]"),
      await top(".map-box"),
      await top(".status-row"),
      await top("section.providers"),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(await features(page)).toHaveLength(7);
    await expect(status(page)).toHaveText("5 Anbieter");
  });

  test("1b: Quellenangabe klappt nach der Verzögerung ein, „i“ zeigt sie wieder (Plan 0056, E3, N5)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__zpAttributionMs = 200;
    });
    await openTab(page);
    await mapSettled(page);
    await expectAttributionCollapses(page);
  });

  test("2: Ort mit einem Anbieter öffnet sein Sheet; Fokus kehrt an die Karte zurück (Fall 15)", async ({ page }) => {
    await openTab(page);
    await jump(page, THEATER, 16);
    await tapPlace(page, THEATER);
    await expect(providerSheet(page)).toBeVisible();
    await expect(page).toHaveURL(/[?&]anbieter=/);
    await page.keyboard.press("Escape");
    await expect(providerSheet(page)).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.closest(".map-box") !== null)).toBe(true);
  });

  test("3/4: zwei Anbieter an einem Ort: Orts-Sheet, einer blass; Zeile öffnet das Anbieter-Sheet", async ({
    page,
  }) => {
    await patchDirectory(page, (data) => ({
      providers: [
        ...data.providers,
        {
          id: "nachbar1",
          name: "Nachbarhaus (fiktiv)",
          url: "https://example.org/nachbar",
          venues: [
            { name: "Nachbarhaus", address: "Beispielstraße 3, 90402 Nürnberg", district: "Altstadt", geo: TREFF },
          ],
        },
      ],
    }));
    await openTab(page);
    const props = await features(page);
    expect(props.filter((p) => p["blass"] === true)).toHaveLength(2);
    expect(props.find((p) => p["key"] === `${TREFF.lat},${TREFF.lon}`)).toMatchObject({ anbieter: 2, blass: false });

    await jump(page, TREFF, 17);
    await tapPlace(page, TREFF);
    const sheet = page.getByRole("dialog", { name: "Familientreff Beispielhof" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("2 Anbieter an diesem Ort");
    await expect(sheet.locator("button.place")).toHaveCount(2);
    await expect(sheet.locator("button.place.idle")).toContainText("Gerade keine Termine");
    await expect(sheet.getByRole("button", { name: /Nachbarhaus \(fiktiv\) abonnieren/ })).toBeVisible();
    await sheet.locator("button.place", { hasText: "Nachbarhaus" }).click();
    await expect(sheet).toBeHidden();
    await expect(providerSheet(page)).toBeVisible();
    await expect(page).toHaveURL(/[?&]anbieter=nachbar1(&|$)/);
  });

  test("5/14: Ausschnitt filtert die Liste, „Alle zeigen“ stellt sie wieder her", async ({ page }) => {
    await openTab(page);
    await jump(page, THEATER, 16);
    await expect(status(page)).toContainText("1 Anbieter im Kartenausschnitt");
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Alle zeigen" }).click();
    await idle(page);
    await expect(status(page)).toHaveText("5 Anbieter");
    await expect(status(page)).toBeFocused();
    await expect(rows(page)).toHaveCount(6);

    // nur der blasse Turnverein im Ausschnitt: eigener Leerzustand (Review 2, M3)
    await jump(page, TURNHALLE, 16);
    await expect(page.getByText("Im Kartenausschnitt bietet gerade niemand etwas an.")).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await page.locator("section.providers").getByRole("button", { name: "Alle zeigen" }).click();
    await idle(page);
    await expect(rows(page)).toHaveCount(6);
  });

  test("Suche mit Treffern außerhalb des Ausschnitts", async ({ page }) => {
    await openTab(page);
    await jump(page, THEATER, 16);
    await page.getByRole("searchbox", { name: "Anbieter suchen" }).fill("beispiel");
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByText("5 weitere Treffer außerhalb des Kartenausschnitts.")).toBeVisible();
  });

  test("Suche, alle Treffer außerhalb: Leerzustand mit „Alle zeigen“ (Review m10)", async ({ page }) => {
    await openTab(page);
    await jump(page, TURNHALLE, 16);
    await page.getByRole("searchbox", { name: "Anbieter suchen" }).fill("Theater");
    await expect(page.getByText("1 Treffer außerhalb des Kartenausschnitts.")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await page.locator("section.providers").getByRole("button", { name: "Alle zeigen" }).click();
    await idle(page);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Kleines Theater Beispiel (fiktiv)");
  });

  test("6: Sticker macht Marker ausgeblendeter Anbieter blass, wie in der Liste", async ({ page }) => {
    await openTab(page);
    await page
      .getByRole("group", { name: "Kategorien" })
      .getByRole("button", { name: /Bücher/ })
      .click();
    await expect.poll(async () => (await features(page)).filter((p) => p["blass"] === false).length).toBe(1);
    expect(await features(page)).toHaveLength(7);
  });

  test("8: Kamera-Regel: mit Stadtteil als Startpunkt derselbe Startausschnitt über alle Orte", async ({ page }) => {
    await openTab(page);
    const before = await page.evaluate(() => ({
      center: window.__zpMap?.getCenter(),
      zoom: window.__zpMap?.getZoom(),
    }));
    await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await openTab(page);
    const after = await page.evaluate(() => ({ center: window.__zpMap?.getCenter(), zoom: window.__zpMap?.getZoom() }));
    expect(after).toEqual(before);
    // alle Orte im Bild: Bildschirmpunkt innerhalb der Kartenfläche
    const inside = await page.evaluate((points) => {
      const box = document.querySelector(".map-box .map-canvas")?.getBoundingClientRect();
      return points.map(({ lat, lon }) => {
        const p = window.__zpMap?.project([lon, lat]);
        return p !== undefined && box !== undefined && p.x >= 0 && p.y >= 0 && p.x <= box.width && p.y <= box.height;
      });
    }, ALL_PLACES);
    expect(inside.every(Boolean)).toBe(true);
  });

  test("10: Rückfall-Anbieter ohne Katalog-Eintrag steht mit dem Ort seines Angebots auf der Karte", async ({
    page,
  }) => {
    await patchDirectory(page, (data) => ({
      providers: data.providers.filter((p) => p["name"] !== "Kleines Theater Beispiel (fiktiv)"),
    }));
    await openTab(page);
    expect((await features(page)).map((p) => p["key"])).toContain(`${THEATER.lat},${THEATER.lon}`);
    await jump(page, THEATER, 16);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Kleines Theater Beispiel (fiktiv)");
  });

  test("16: altes anbieter.json ohne geo: keine Marker, Liste zeigt alle, kein Fehler", async ({ page }) => {
    await patchDirectory(page, (data) => ({
      providers: data.providers.map((p) => ({
        ...p,
        venues: (p["venues"] as Array<Record<string, unknown>>).map(({ geo: _, ...v }) => v),
      })),
    }));
    await openTab(page);
    expect(await features(page)).toHaveLength(0);
    await expect(rows(page)).toHaveCount(6);
    await expect(status(page)).toHaveText("5 Anbieter");
  });

  test("13: wegzeit= mit gespeichertem Startpunkt: Statuszeile ohne Grenz-Hinweis", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await openTab(page, "./?wegzeit=30&ansicht=anbieter");
    await expect(status(page)).toContainText("5 Anbieter");
    await expect(page.locator("p.status")).toHaveCount(1);
  });
});

test.describe("Anbieterkarte: Fehlerwege (Plan 0055)", () => {
  test.use({ allowedConsoleErrors: [/\/data\/anbieter\.json\b/] });

  test("7: ohne WebGL: Hinweis, Liste mit allen", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type === "webgl" || type === "webgl2") return null;
          return Reflect.apply(original, this, [type, ...rest]);
        },
      });
    });
    await page.goto("./?ansicht=anbieter");
    await expect(mapBox(page)).toHaveAttribute("data-state", "fehler");
    await expect(mapBox(page)).toContainText(
      "Dein Browser kann die Karte nicht zeigen. Alle Anbieter stehen in der Liste.",
    );
    await expect(rows(page)).toHaveCount(6);
    await expect(status(page)).toHaveText("5 Anbieter");
  });

  test("12: 503 auf anbieter.json: Fehler in Liste und Karte, kein endloser Ladezustand", async ({ page }) => {
    await page.route(DIRECTORY, (route) => route.fulfill({ status: 503, body: "" }));
    await page.goto("./?ansicht=anbieter");
    await expect(page.locator(".lazy-box")).toContainText("Die Anbieter konnten nicht geladen werden.");
    await expect(mapBox(page)).toHaveAttribute("data-state", "fehler");
    await expect(mapBox(page)).toContainText("Anbieter lassen sich gerade nicht laden.");
    await page.unroute(DIRECTORY);
    await page.locator(".lazy-box").getByRole("button", { name: "Nochmal versuchen" }).click();
    await expect(mapBox(page)).toHaveAttribute("data-state", "bereit", MAP_READY);
    await expect(rows(page)).toHaveCount(6);
  });
});

test.describe("Anbieterkarte nur im Tab (ADR 0038)", () => {
  test.use({ tiles: "verboten" });

  test("9: Deep-Link ?anbieter= über „Angebote“ lädt keine Karte", async ({ page }) => {
    await page.goto("./?anbieter=fv3fpfp2");
    await expect(providerSheet(page)).toBeVisible();
    await expect(providerSheet(page)).toContainText("Kleines Theater Beispiel");
    await expect(mapBox(page)).toHaveCount(0);
  });
});
