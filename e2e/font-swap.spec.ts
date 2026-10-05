/**
 * Schrift-Swap mit Fixture-Daten (Plan 0007, E12, B6), damit er auch außerhalb des Smoke-Projekts läuft, dazu die
 * Kanarienvögel der Messung. Echte Daten über alle Fallbacks: font-swap.smoke.spec.ts.
 */
import { expect, test } from "./fixtures.ts";
import { FALLBACK_BUCKETS, measureSwap, PHONE_FONT_RENDERING, rewriteFallbackCss } from "./vitals.ts";

test.use(PHONE_FONT_RENDERING);
// Viewport schon beim Kontextstart, nicht per setViewportSize (Plan 0013, Befund F1)
test.use({ viewport: { width: 412, height: 915 } });

test.beforeEach(() => {
  test.skip(test.info().project.name !== "pixel-7", "einmal je Lauf, Chromium-Mobile");
});

test("Schrift-Swap verschiebt mit Roboto-Fallback nichts (412 px)", async ({ page }) => {
  const result = await measureSwap(page, "Roboto", { width: 412, height: 915 });
  if (result === "fehlt") throw new Error("Roboto kommt per URL und fehlt nie");
  expect(result.cls, `CLS beim Swap\n${result.detail}`).toBeLessThan(0.05);
});

// Gegen-Kanarienvogel: Ohne Breitenanpassung (Roboto wie vor Paket C über system-ui) muss derselbe Lauf rot sein,
// sonst misst der Test den Fallback gar nicht (gemessen vorher 0,1111).
test("Swap-Messung erkennt Roboto ohne Breitenanpassung", async ({ page }) => {
  const result = await measureSwap(page, "Roboto", { width: 412, height: 915, unadjusted: true });
  if (result === "fehlt") throw new Error("Roboto kommt per URL und fehlt nie");
  expect(result.cls, "Roboto mit size-adjust 100 % muss verschieben").toBeGreaterThan(0.05);
});

// Kanarienvogel der Grenze: Ein Shift direkt nach markShifts() muss zählen (mit einem Zeitvergleich fiel er heraus).
test("Swap-Messung zählt einen Shift direkt nach der Grenze", async ({ page }) => {
  const result = await measureSwap(page, "Roboto", { width: 412, height: 915, shiftAfterMark: true });
  if (result === "fehlt") throw new Error("Roboto kommt per URL und fehlt nie");
  expect(result.cls, "künstlicher Shift nach der Grenze muss zählen").toBeGreaterThan(0.05);
});

// Kanarienvogel der Viewport-Änderung (Plan 0013, Befund F1): Chrome zählt sie als Eingabe, Shifts in den 500 ms
// danach tragen hadRecentInput. Auf schnellen CI-Runnern kam die Größe aus setViewportSize erst nach dem Laden an,
// und die Messung verwarf den Swap still.
test("Swap-Messung zählt einen Shift kurz nach einer Viewport-Änderung", async ({ page }) => {
  const result = await measureSwap(page, "Roboto", {
    width: 412,
    height: 915,
    resizeBeforeMark: true,
    shiftAfterMark: true,
  });
  if (result === "fehlt") throw new Error("Roboto kommt per URL und fehlt nie");
  expect(result.cls, "künstlicher Shift nach Viewport-Änderung muss zählen").toBeGreaterThan(0.05);
});

// Kanarienvogel des Umschreibens: Ein Block in fremdem Format darf nicht still unverändert bleiben.
test("Swap-Messung erkennt teilweises Umschreiben des CSS", () => {
  const face = (family: string, src: string) => `@font-face{font-family:Bricolage Fallback ${family};src:${src}}`;
  const css = (arialSrc: string) =>
    ["Arial", "Roboto", "Noto", "DejaVu"]
      .flatMap((f) =>
        Array.from({ length: FALLBACK_BUCKETS.Arial }, () => face(f, f === "Arial" ? arialSrc : 'local("X"),local(Y)')),
      )
      .join("");
  expect(() => rewriteFallbackCss(css("local(Arial)"), "Noto")).not.toThrow();
  expect(() => rewriteFallbackCss(css("url(arial.woff2)"), "Noto")).toThrow(/umgeschriebene Blöcke/);
  expect(() =>
    rewriteFallbackCss(css("local(Arial)").replace(face("DejaVu", 'local("X"),local(Y)'), ""), "Noto"),
  ).toThrow(/Blöcke „Bricolage Fallback DejaVu“/);
});
