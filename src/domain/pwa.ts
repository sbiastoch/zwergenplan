/**
 * Installationshilfe im Abschnitt „Als App“ (Plan 0011, E7): Zustand → Text, rein. Den Zustand ermittelt
 * `installState()` in `src/data/pwa.ts` (Geräte-APIs), angezeigt wird er in `src/ui/app-extras/AppSection.tsx`.
 */

/**
 * - `app`: läuft schon als App (`display-mode: standalone` bzw. `navigator.standalone`)
 * - `angebot`: Der Browser bietet die Installation an (`beforeinstallprompt` gemerkt)
 * - `installiert`: gerade über den Knopf installiert (`appinstalled` bzw. angenommen), läuft aber noch im Browser
 * - `menue`: Android, aber das Angebot ist verloren gegangen (Listener erst nach `load`, E5)
 * - `ios`: iPhone/iPad im Browser (heuristisch, E7)
 * - `keine`: sonst; der Abschnitt ist ausgeblendet
 */
export type InstallState = "app" | "angebot" | "installiert" | "menue" | "ios" | "keine";

export type InstallHelp =
  | { kind: "text"; text: string }
  | { kind: "knopf"; text: string; button: string }
  /** „Tippe auf [Teilen-Symbol] Teilen und dann auf …“; das Symbol setzt die Oberfläche zwischen `before` und `share` */
  | { kind: "ios"; before: string; share: string; after: string; note: string };

export function installHelp(state: InstallState): InstallHelp | undefined {
  switch (state) {
    case "app":
      return { kind: "text", text: "Läuft als App." };
    case "angebot":
      return {
        kind: "knopf",
        text: "Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste.",
        button: "Zum Startbildschirm hinzufügen",
      };
    case "installiert":
      return {
        kind: "text",
        text: "Installiert. Öffne den Zwergenplan jetzt über das Symbol auf dem Startbildschirm.",
      };
    case "menue":
      return { kind: "text", text: "Im Browser-Menü „App installieren“ wählen." };
    case "ios":
      return {
        kind: "ios",
        before: "Tippe auf",
        share: "Teilen",
        after: "und dann auf „Zum Home-Bildschirm“.",
        // Spike (h): Die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari.
        note: "Die App startet leer: Alter und Merkliste dort noch einmal eintragen.",
      };
    case "keine":
      return undefined;
  }
}
