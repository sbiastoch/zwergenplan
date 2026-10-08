/**
 * Teilen per Link (Plan 0026, Stufe 1, Tests 6; Nachtrag A): Knopf im Detail und im Anbieter-Sheet, Rückfälle,
 * Vorschauseiten mit og:-Tags und Weiterleitung, 404.html, Kachelbild je Angebot. Fixtures, Uhr Mo 5.10.2026 12:00.
 *
 * `vite preview` liefert `/angebot/<id>/` als `angebot/<id>/index.html` aus (geprüft in Schritt 1); für unbekannte
 * Pfade aber die SPA-Rückfallseite statt `404.html`. Den 404-Fall stellt deshalb `page.route` mit der gebauten
 * `dist-e2e/404.html` nach, wie GitHub Pages ihn liefert.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const KRABBEL = "Offener Krabbeltreff";
const KRABBEL_ID = "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus";
const PEKIP = "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)";
const PEKIP_ID =
  "familientreff-beispiel--pekip-gruppe-herbst-babys-geb-juni-aug-2026-20261013t0930--familientreff-beispiel-haus";
const PROVIDER_ID = "familientreff-beispiel";
const PROVIDER = "Familientreff Beispielhof (fiktiv)";
const SITE_URL = "https://zwergenplan.app/";
const COPIED = "Link kopiert – zum Einfügen in WhatsApp & Co.";
const GONE = "Dieses Angebot ist nicht mehr im Zwergenplan.";
/** iMessage holt Vorschauen mit JavaScript und diesem User-Agent (Plan 0026, E4, Review M1) */
const IMESSAGE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";

type ShareMode = "ok" | "none" | "AbortError" | "InvalidStateError" | "NotAllowedError";

/**
 * Ersetzt `navigator.share` und `navigator.clipboard.writeText` vor dem Laden. Aufrufe landen in `__zpShares` bzw.
 * `__zpCopied`. `share: "none"` = Browser ohne Teilen-Menü.
 */
async function stubShare(page: Page, share: ShareMode, clipboard: "ok" | "fehler" = "ok") {
  await page.addInitScript(
    ({ share, clipboard }) => {
      const shares: unknown[] = [];
      const copied: string[] = [];
      Object.assign(window, { __zpShares: shares, __zpCopied: copied });
      const value =
        share === "none"
          ? undefined
          : (data: ShareData) => {
              shares.push({ ...data });
              return share === "ok" ? Promise.resolve() : Promise.reject(new DOMException("Test", share));
            };
      Object.defineProperty(navigator, "share", { value, configurable: true });
      const writeText = (text: string) => {
        copied.push(text);
        return clipboard === "ok" ? Promise.resolve() : Promise.reject(new DOMException("Test", "NotAllowedError"));
      };
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    },
    { share, clipboard },
  );
}

const shares = (page: Page) => page.evaluate(() => Reflect.get(window, "__zpShares"));
const copied = (page: Page) => page.evaluate(() => Reflect.get(window, "__zpCopied"));

async function openDetail(page: Page, title: string) {
  await page.getByRole("heading", { level: 3, name: title }).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function home(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
}

/** Wert eines `<meta property|name="…" content="…">` aus rohem HTML */
function meta(html: string, key: string): string | undefined {
  return html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];
}

test.describe("Knopf „Teilen“ (E6)", () => {
  test("Detail teilt nur die Vorschauseite, ohne Filter, Zeitraum, Geburtsdatum und Startpunkt", async ({ page }) => {
    await stubShare(page, "ok");
    await page.addInitScript(() => {
      localStorage.setItem("zwergenplan.geburtsdatum", "2026-06-01");
      localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof");
    });
    await page.goto(`./?kat=babykurse&von=2026-10-06&bis=2026-12-31&angebot=${PEKIP_ID}`);
    const dialog = page.getByRole("dialog", { name: PEKIP });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Teilen" }).click();
    await expect.poll(() => shares(page)).toHaveLength(1);
    const origin = new URL(page.url()).origin;
    expect(await shares(page)).toEqual([{ title: PEKIP, url: `${origin}/angebot/${PEKIP_ID}/` }]);
    await expect(page.getByText(COPIED)).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Link zum Teilen" })).toBeHidden();
  });

  test("ohne Teilen-Menü wird kopiert, der Toast steht im Detail", async ({ page }) => {
    await stubShare(page, "none");
    await home(page);
    const dialog = await openDetail(page, KRABBEL);
    await dialog.getByRole("button", { name: "Teilen" }).click();
    await expect(dialog.getByText(COPIED)).toBeVisible();
    expect(await copied(page)).toEqual([`${new URL(page.url()).origin}/angebot/${KRABBEL_ID}/`]);
  });

  test("scheitern Teilen und Kopieren, steht der Link markiert im Sheet über dem Detail (Review M2)", async ({
    page,
  }) => {
    await stubShare(page, "NotAllowedError", "fehler");
    await home(page);
    const detail = await openDetail(page, KRABBEL);
    await detail.getByRole("button", { name: "Teilen" }).click();
    const sheet = page.getByRole("dialog", { name: "Link zum Teilen" });
    await expect(sheet).toBeVisible();
    const field = sheet.locator("input.share-link");
    await expect(field).toHaveAttribute("readonly", "");
    await expect(field).toHaveValue(`${new URL(page.url()).origin}/angebot/${KRABBEL_ID}/`);
    await expect(field).toBeFocused();
    const selection = await field.evaluate((el: HTMLInputElement) => [
      el.selectionStart,
      el.selectionEnd,
      el.value.length,
    ]);
    expect(selection[0]).toBe(0);
    expect(selection[1]).toBe(selection[2]);
    await sheet.getByRole("button", { name: "Fertig" }).click();
    await expect(sheet).toBeHidden();
    await expect(detail).toBeVisible();
    await expect(page.getByText(COPIED)).toHaveCount(0);
  });

  for (const mode of ["AbortError", "InvalidStateError"] as const) {
    test(`${mode}: still, kein Toast, kein Sheet, nichts kopiert`, async ({ page }) => {
      await stubShare(page, mode);
      await home(page);
      const dialog = await openDetail(page, KRABBEL);
      await dialog.getByRole("button", { name: "Teilen" }).click();
      await expect.poll(() => shares(page)).toHaveLength(1);
      // eine Runde im Browser, damit die abgelehnte Promise sicher behandelt ist
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(await copied(page)).toEqual([]);
      await expect(page.getByText(COPIED)).toHaveCount(0);
      await expect(page.getByRole("dialog", { name: "Link zum Teilen" })).toBeHidden();
    });
  }

  test("Anbieter-Sheet teilt die Vorschauseite des Anbieters", async ({ page }) => {
    await stubShare(page, "ok");
    await page.goto(`./?anbieter=${PROVIDER_ID}`);
    const sheet = page.getByRole("dialog", { name: "Anbieter" });
    await expect(sheet.getByRole("heading", { name: PROVIDER })).toBeVisible();
    await sheet.getByRole("button", { name: "Teilen" }).click();
    await expect.poll(() => shares(page)).toHaveLength(1);
    const origin = new URL(page.url()).origin;
    expect(await shares(page)).toEqual([{ title: PROVIDER, url: `${origin}/anbieter/${PROVIDER_ID}/` }]);
    // „Schließen“ bleibt da und schließt
    await sheet.getByRole("button", { name: "Schließen" }).click();
    await expect(sheet).toBeHidden();
  });
});

test.describe("Vorschauseite (E2–E4)", () => {
  test("Angebot: og:-Tags, noindex, Kachelbild je Angebot", async ({ request }) => {
    const res = await request.get(`angebot/${KRABBEL_ID}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(meta(html, "og:title")).toBe(`${KRABBEL} · jeden Mittwoch, 10:00`);
    expect(meta(html, "og:description")).toBe(
      "Familientreff Beispielhof (fiktiv), Altstadt · 6–24 Monate · Kostenlos · Ohne Anmeldung",
    );
    expect(meta(html, "og:url")).toBe(`${SITE_URL}angebot/${KRABBEL_ID}/`);
    expect(meta(html, "og:image")).toMatch(
      new RegExp(`^${SITE_URL}angebot/${KRABBEL_ID}/vorschau\\.jpg\\?v=[0-9a-f]{8}$`),
    );
    expect(meta(html, "twitter:card")).toBe("summary_large_image");
  });

  test("Anbieter: og:-Tags mit generischem Bild, das es gibt", async ({ request }) => {
    const res = await request.get(`anbieter/${PROVIDER_ID}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(meta(html, "og:title")).toBe(PROVIDER);
    expect(meta(html, "og:url")).toBe(`${SITE_URL}anbieter/${PROVIDER_ID}/`);
    expect(meta(html, "og:image")).toBe(`${SITE_URL}og/vorschau-v1.jpg`);
    const image = await request.get("og/vorschau-v1.jpg");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/jpeg");
  });

  test("Kachelbild (Nachtrag A): JPEG unter 300 kB, 1200 × 630, je Angebot eigene Bytes", async ({ page, request }) => {
    const get = async (id: string) => {
      const res = await request.get(`angebot/${id}/vorschau.jpg`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/jpeg");
      const body = await res.body();
      expect(body.byteLength).toBeLessThan(300 * 1000);
      return body;
    };
    const [a, b] = [await get(KRABBEL_ID), await get(PEKIP_ID)];
    expect(a.equals(b), "zwei Angebote, zwei Bilder").toBe(false);
    await page.goto(`angebot/${KRABBEL_ID}/vorschau.jpg`);
    const size = await page.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
    expect(size).toEqual([1200, 630]);
  });

  test("Weiterleitung ins Detail ohne Zwischenschritt in der History (Review m7)", async ({ page }) => {
    await page.goto(`angebot/${KRABBEL_ID}/`);
    await expect(page).toHaveURL(new RegExp(`/\\?angebot=${KRABBEL_ID}$`));
    const dialog = page.getByRole("dialog", { name: KRABBEL });
    await expect(dialog).toBeVisible();
    // about:blank + eine Navigation; location.replace legt keinen Eintrag an
    expect(await page.evaluate(() => history.length)).toBe(2);
    await dialog.getByRole("button", { name: "Zurück" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    expect(page.url()).not.toContain("angebot=");
    await page.goBack();
    expect(page.url()).not.toContain("/angebot/");
  });
});

test.describe("404.html (E7)", () => {
  // Chromium meldet die 404-Antwort des Dokuments selbst in der Konsole; erlaubt nur für diese beiden Pfade.
  test.use({ allowedConsoleErrors: [/\/(angebot\/gibt-es-nicht--x--y|irgendwas)\/ Failed to load resource: .* 404/] });

  test("verschwundenes Angebot: 404.html leitet weiter, die App sagt es (E7)", async ({ page }) => {
    const gone = "gibt-es-nicht--x--y";
    await page.route(`**/angebot/${gone}/`, (route) => route.fulfill({ status: 404, path: "dist-e2e/404.html" }));
    await page.goto(`angebot/${gone}/`);
    await expect(page.getByText(GONE)).toBeVisible();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).not.toContain("angebot");
  });

  test("404.html ohne passendes Muster: kein Sprung, Link zur Startseite", async ({ page }) => {
    await page.route("**/irgendwas/", (route) => route.fulfill({ status: 404, path: "dist-e2e/404.html" }));
    await page.goto("irgendwas/");
    await expect(page.getByRole("heading", { name: "Diese Seite gibt es im Zwergenplan nicht (mehr)." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zum Zwergenplan" })).toHaveAttribute("href", "/");
    expect(page.url()).toMatch(/\/irgendwas\/$/);
  });
});

test.describe("Bot mit JavaScript bleibt auf der Vorschauseite (Review M1)", () => {
  test.use({ userAgent: IMESSAGE_UA });
  test("iMessage-Abrufer sieht Titel und Link", async ({ page }) => {
    await page.goto(`angebot/${KRABBEL_ID}/`);
    await expect(page.getByRole("heading", { level: 1, name: `${KRABBEL} · jeden Mittwoch, 10:00` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Im Zwergenplan öffnen" })).toBeVisible();
    // eine Runde später steht die Seite immer noch da
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(page.url()).toMatch(new RegExp(`/angebot/${KRABBEL_ID}/$`));
  });
});

test.describe("In-App-Browser ohne „bot“ wird weitergeleitet", () => {
  test.use({ userAgent: "WhatsApp/2.23.20 A" });
  test("WhatsApp-User-Agent landet im Detail", async ({ page }) => {
    await page.goto(`angebot/${KRABBEL_ID}/`);
    await expect(page.getByRole("dialog", { name: KRABBEL })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/\\?angebot=${KRABBEL_ID}$`));
  });
});

test.describe("ohne JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("Titel, Beschreibung und Link sind sichtbar, der Link zeigt ins Detail", async ({ page }) => {
    await page.goto(`angebot/${KRABBEL_ID}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${KRABBEL} · jeden Mittwoch, 10:00`);
    await expect(page.getByText("6–24 Monate · Kostenlos · Ohne Anmeldung")).toBeVisible();
    const link = page.getByRole("link", { name: "Im Zwergenplan öffnen" });
    await expect(link).toHaveAttribute("href", `/?angebot=${KRABBEL_ID}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/\\?angebot=${KRABBEL_ID}$`));
  });
});
