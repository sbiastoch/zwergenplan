/**
 * Schrift-Swap mit echten Daten (Plan 0007, E12, B6): je Fallback, den ein Telefon wirklich hat, und je Breite.
 * Läuft im Projekt smoke-echte-daten (Dateiname passt auf dessen testMatch). Eigene Datei statt smoke.spec.ts, weil
 * `launchOptions` (Schrift-Rendering wie am Telefon) nur auf oberster Ebene einer Datei gesetzt werden kann.
 * Roboto kommt immer per URL (Android), die anderen nur, wenn die Maschine sie hat; fehlt eine, ist das ein Skip mit
 * Begründung, kein Grün ohne Messung.
 */
import { expect, test } from "./fixtures.ts";
import { measureSwap, PHONE_FONT_RENDERING } from "./vitals.ts";

test.use(PHONE_FONT_RENDERING);

for (const fallback of ["Arial", "Roboto", "Noto", "DejaVu"] as const) {
  for (const viewport of [
    { width: 412, height: 915 },
    { width: 360, height: 800 },
  ]) {
    test(`Schrift-Swap verschiebt nichts (${fallback}, ${viewport.width} px)`, async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "Fallback-Faces sind für Chromium gemessen");
      const meta = (await (await page.request.get("./data/meta.json")).json()) as {
        offers: number;
        generatedAt: string;
      };
      test.skip(meta.offers === 0, "keine Daten");
      const result = await measureSwap(page, fallback, { ...viewport, at: new Date(meta.generatedAt) });
      if (result === "fehlt") {
        expect(fallback, "Roboto kommt per URL und fehlt nie").not.toBe("Roboto");
        test.skip(true, `„${fallback}“ ist auf dieser Maschine nicht installiert`);
        return;
      }
      expect(result.cls, `CLS beim Swap (nur Shifts nach release())\n${result.detail}`).toBeLessThan(0.05);
    });
  }
}
