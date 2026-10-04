/**
 * Schrift-Swap mit Fixture-Daten (Plan 0007, E12, B6), damit er auch außerhalb des Smoke-Projekts läuft, dazu die
 * Kanarienvögel der Messung. Echte Daten über alle Fallbacks: font-swap.smoke.spec.ts.
 */
import { expect, test } from "./fixtures.ts";
import { FALLBACK_BUCKETS, measureSwap, PHONE_FONT_RENDERING, rewriteFallbackCss } from "./vitals.ts";

test.use(PHONE_FONT_RENDERING);

test.beforeEach(() => {
  test.skip(test.info().project.name !== "pixel-7", "einmal je Lauf, Chromium-Mobile");
});

test("Schrift-Swap verschiebt mit Roboto-Fallback nichts (412 px)", async ({ page }) => {
  const result = await measureSwap(page, "Roboto", { width: 412, height: 915 });
  if (result === "fehlt") throw new Error("Roboto kommt per URL und fehlt nie");
  expect(result.cls, `CLS beim Swap\n${result.detail}`).toBeLessThan(0.05);
});

// Kanarienvogel der Grenze: Ein Shift direkt nach markShifts() muss zählen (mit einem Zeitvergleich fiel er heraus).
test("Swap-Messung zählt einen Shift direkt nach der Grenze", async ({ page }) => {
  const result = await measureSwap(page, "Roboto", { width: 412, height: 915, shiftAfterMark: true });
  if (result === "fehlt") throw new Error("Roboto kommt per URL und fehlt nie");
  expect(result.cls, "künstlicher Shift nach der Grenze muss zählen").toBeGreaterThan(0.05);
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
