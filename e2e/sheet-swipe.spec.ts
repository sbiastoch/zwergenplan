/**
 * Sheets nach unten wegwischen (Plan 0060, E2/E3): Wisch vom Griff schließt, kurzer Wisch federt zurück, im
 * gescrollten Inhalt und nach oben passiert nichts, das Detail über der großen Karte schließt samt URL.
 * Touch über CDP, daher nur Chromium mit Touch-Emulation (pixel-7), wie karte-gross.spec.ts.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, MAP_READY, mapIdle, test } from "./fixtures.ts";

declare global {
  interface Window {
    /** Oberkanten des Dialogs je Frame (`recordTops`) */
    __tops?: number[];
  }
}

test.use({ tiles: "mock" });

test.beforeEach(({ browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || !isMobile, "Touch über CDP nur in Chromium mit Touch-Emulation (pixel-7)");
});

/** Wisch von `from` um `dy` Pixel senkrecht, in `steps` Schritten mit `stepMs` Pause */
async function swipe(page: Page, from: { x: number; y: number }, dy: number, steps = 10, stepMs = 16) {
  const path = Array.from({ length: steps }, (_, i) => ({ x: from.x, y: from.y + (dy * (i + 1)) / steps }));
  await touchPath(page, from, path, stepMs);
}

/** Berührung bei `from`, dann über die Punkte von `path`, dann loslassen */
async function touchPath(page: Page, from: { x: number; y: number }, path: { x: number; y: number }[], stepMs = 16) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
  for (const point of path) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, id: 1 }] });
    await page.waitForTimeout(stepMs);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Mitte des Griffs (`.grab`) im Dialog */
async function grabPoint(dialog: Locator) {
  const box = await dialog.locator(".grab").boundingBox();
  if (!box) throw new Error("kein Griff");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openFilter(page: Page) {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "Zwergenplan" })).toBeVisible();
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  await expect(sheet).toBeVisible();
  // erst nach der Öffnungsanimation wischen, sonst misst der Griff eine Zwischenlage
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return sheet;
}

/** Zeichnet je Frame die Oberkante des offenen Dialogs auf (`window.__tops`), bis er schließt */
async function recordTops(dialog: Locator) {
  await dialog.evaluate((el) => {
    const tops: number[] = [];
    window.__tops = tops;
    const tick = () => {
      if (!el.hasAttribute("open")) return;
      tops.push(el.getBoundingClientRect().top);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** Nachdem das Sheet einmal weit unten war, kam es nie wieder hoch (Review Plan 0060, Blocker 1) */
async function expectNoBounce(page: Page, startTop: number) {
  const tops = await page.evaluate(() => window.__tops ?? []);
  const low = tops.findIndex((t) => t > startTop + 150);
  expect(low, "Sheet war unten").toBeGreaterThanOrEqual(0);
  expect(Math.min(...tops.slice(low)), "Sheet sprang vor dem Schließen nicht zurück").toBeGreaterThan(startTop + 150);
}

test("Wisch vom Griff nach unten schließt das Filter-Sheet ohne Zurückspringen, der Fokus kehrt zurück", async ({
  page,
}) => {
  const sheet = await openFilter(page);
  const startTop = (await sheet.boundingBox())?.y ?? 0;
  await recordTops(sheet);
  await swipe(page, await grabPoint(sheet), 250);
  await expect(sheet).toBeHidden();
  await expectNoBounce(page, startTop);
  await expect(page.getByRole("button", { name: /^Alle Filter/ })).toBeFocused();
  // Nächstes Öffnen steht wieder normal (transform zurückgesetzt)
  const again = await openFilter(page);
  expect(await again.evaluate((el) => el.style.transform)).toBe("");
});

test("ein zittriger Anfang (erst schräg 1–2 px) bricht den Wisch nicht ab (Re-Review, Major 1)", async ({ page }) => {
  const sheet = await openFilter(page);
  const from = await grabPoint(sheet);
  const path = [
    { x: from.x + 2, y: from.y + 1 },
    ...Array.from({ length: 10 }, (_, i) => ({ x: from.x + 2, y: from.y + 25 * (i + 1) })),
  ];
  await touchPath(page, from, path);
  await expect(sheet).toBeHidden();
});

test("waagerechter Wisch und Start auf einem Eingabefeld schließen nicht", async ({ page }) => {
  const sheet = await openFilter(page);
  const from = await grabPoint(sheet);
  await touchPath(
    page,
    from,
    Array.from({ length: 10 }, (_, i) => ({ x: from.x - 15 * (i + 1), y: from.y + 5 * (i + 1) })),
  );
  await expect(sheet).toBeVisible();
  const field = sheet.getByLabel("von");
  await field.scrollIntoViewIfNeeded();
  await sheet.locator(".sheet-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  const box = await field.boundingBox();
  if (!box) throw new Error("kein Feld „von“");
  await swipe(page, { x: box.x + 20, y: box.y + box.height / 2 }, 250);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.style.transform)).toBe("");
});

test("ein zweiter Finger bricht den Wisch ab, das Sheet steht danach wieder oben (Arch-Review, m1)", async ({
  page,
}) => {
  const sheet = await openFilter(page);
  const from = await grabPoint(sheet);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: { x: number; y: number; id: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await touch("touchStart", [{ ...from, id: 1 }]);
  for (let i = 1; i <= 5; i++) await touch("touchMove", [{ x: from.x, y: from.y + 12 * i, id: 1 }]);
  await touch("touchStart", [
    { x: from.x, y: from.y + 60, id: 1 },
    { x: from.x + 80, y: from.y + 60, id: 2 },
  ]);
  await touch("touchEnd", []);
  await cdp.detach();
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.style.transform)).toBe("");
});

test.describe("reduzierte Bewegung", () => {
  test.use({ reducedMotion: "reduce" });
  test("der Wisch schließt sofort", async ({ page }) => {
    const sheet = await openFilter(page);
    await swipe(page, await grabPoint(sheet), 250);
    await expect(sheet).toBeHidden({ timeout: 500 });
  });
});

test("kurzer, langsamer Wisch federt zurück", async ({ page }) => {
  const sheet = await openFilter(page);
  await swipe(page, await grabPoint(sheet), 40, 10, 60);
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate((el) => el.style.transform)).toBe("");
});

test("im gescrollten Inhalt und nach oben schließt nichts", async ({ page }) => {
  const sheet = await openFilter(page);
  const scroller = sheet.locator(".sheet-scroll");
  await scroller.evaluate((el) => {
    el.scrollTop = 120;
  });
  const box = await scroller.boundingBox();
  if (!box) throw new Error("kein Inhalt");
  await swipe(page, { x: box.x + box.width / 2, y: box.y + 80 }, 250);
  await expect(sheet).toBeVisible();
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await swipe(page, await grabPoint(sheet), -200);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.style.transform)).toBe("");
});

test("Detail über der großen Karte: Wisch auf dem Griff schließt es samt URL", async ({ page }) => {
  await page.goto("./?ansicht=karte");
  const mapBox = page.locator(".map-box");
  await expect(mapBox).toHaveAttribute("data-state", "bereit", MAP_READY);
  await page.getByRole("button", { name: "Karte groß zeigen" }).click();
  await expect(page).toHaveURL(/[?&]karte=gross(&|$)/);
  // Bibliothek (tests/fixtures/providers.yaml): ein Angebot, ein Tipp öffnet das Detail
  await page.evaluate(() => window.__zpMap?.jumpTo({ center: [11.0812, 49.4498], zoom: 16 }));
  await mapIdle(page);
  const point = await page.evaluate(() => window.__zpMap?.project([11.0812, 49.4498]));
  if (!point) throw new Error("keine Karte");
  await page.locator(".map-box .map-canvas canvas").click({ position: point });
  const detail = page.getByRole("dialog", { name: "Krabbelreime & Fingerspiele" });
  await expect(detail).toHaveClass(/\bover-map\b/);
  await detail.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const startTop = (await detail.boundingBox())?.y ?? 0;
  await recordTops(detail);
  await swipe(page, await grabPoint(detail), 250);
  await expect(detail).toBeHidden();
  // Das Schließen läuft über history.back() (popstate): auch dann kein Zurückspringen
  await expectNoBounce(page, startTop);
  await expect(page).toHaveURL(/[?&]karte=gross$/);
});
