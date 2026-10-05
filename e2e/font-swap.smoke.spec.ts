/**
 * Schrift-Swap mit echten Daten (Plan 0007, E12, B6): je Fallback, den ein Telefon wirklich hat, und je Breite.
 * Läuft im Projekt smoke-echte-daten (Dateiname passt auf dessen testMatch). Eigene Datei statt smoke.spec.ts, weil
 * `launchOptions` (Schrift-Rendering wie am Telefon) nur auf oberster Ebene einer Datei gesetzt werden kann.
 *
 * Welche Fallbacks gemessen werden müssen:
 * - Roboto immer, es kommt per URL (Android).
 * - Auf CI (Ubuntu, `playwright install --with-deps`) zusätzlich Arial (über Liberation Sans) und DejaVu: Beide
 *   sind dort installiert, ein Skip wäre ein Grün ohne Messung.
 * - Noto darf auf CI fehlen: Das Ubuntu-Image bringt nur Noto Color Emoji mit, nicht Noto Sans.
 * - Lokal wird übersprungen, was die Maschine nicht hat, mit Begründung im Skip.
 * Jeder Messwert landet zusätzlich in test-results/font-swap-werte.txt (CI gibt die Datei im Log aus).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { expect, test } from "./fixtures.ts";
import { dataMeta } from "./real-data.ts";
import { type FallbackName, measureSwap, PHONE_FONT_RENDERING } from "./vitals.ts";

test.use(PHONE_FONT_RENDERING);

/** Ohne diese Schriften wäre der Lauf auf CI wertlos (siehe Kopfkommentar). */
const REQUIRED_ON_CI: readonly FallbackName[] = ["Roboto", "Arial", "DejaVu"];

function record(line: string) {
  mkdirSync("test-results", { recursive: true });
  appendFileSync("test-results/font-swap-werte.txt", `${line}\n`);
}

// Viewport je Breite schon beim Kontextstart, nicht per setViewportSize (Plan 0013, Befund F1)
for (const viewport of [
  { width: 412, height: 915 },
  { width: 360, height: 800 },
]) {
  test.describe(`${viewport.width} px`, () => {
    test.use({ viewport });
    for (const fallback of ["Arial", "Roboto", "Noto", "DejaVu"] as const) {
      test(`Schrift-Swap verschiebt nichts (${fallback}, ${viewport.width} px)`, async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", "Fallback-Faces sind für Chromium gemessen");
        const meta = await dataMeta(page);
        test.skip(meta.offers === 0, "keine Daten");
        const result = await measureSwap(page, fallback, { ...viewport, at: new Date(meta.generatedAt) });
        if (result === "fehlt") {
          record(`${fallback} ${viewport.width} px: übersprungen (nicht installiert)`);
          expect(fallback, "Roboto kommt per URL und fehlt nie").not.toBe("Roboto");
          if (process.env["CI"])
            expect(REQUIRED_ON_CI, `„${fallback}“ muss auf CI installiert sein`).not.toContain(fallback);
          test.skip(true, `„${fallback}“ ist auf dieser Maschine nicht installiert`);
          return;
        }
        record(`${fallback} ${viewport.width} px: gemessen, CLS ${result.cls.toFixed(4)}`);
        expect(result.cls, `CLS beim Swap (nur Shifts nach release())\n${result.detail}`).toBeLessThan(0.05);
      });
    }
  });
}
