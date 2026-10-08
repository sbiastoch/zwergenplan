/** Welche Engine die Vorschaubilder rendert (Plan 0026, Nachtrag A, E17). Rein, damit testbar. */
import type { DataSource } from "./load-data.ts";

export type OgEngine = "chromium" | "webkit";

/**
 * Chromium, wie bei den Icons. Nur der Fixture-Build (`dist-e2e/`) darf auf WebKit ausweichen: Die WebKit-Jobs der CI
 * installieren nur WebKit (.github/install-browsers.sh), und die E2E-Tests prüfen nur, dass es die Bilder gibt.
 */
export function pickEngine(source: DataSource, hasChromium: boolean): OgEngine {
  if (hasChromium) return "chromium";
  if (source === "fixture") return "webkit";
  throw new Error(
    "Vorschaubilder: Chromium fehlt (pnpm exec playwright install chromium), der Deploy-Build braucht es",
  );
}
