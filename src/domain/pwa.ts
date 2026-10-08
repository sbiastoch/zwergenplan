/**
 * Installationshilfe im Abschnitt „Als App“ (Plan 0011, E7) und im Fuß des Kind-Sheets (Plan 0022): Zustand → Text,
 * rein. Den Zustand ermittelt `installState()` in `src/data/pwa.ts` (Geräte-APIs), angezeigt wird er in
 * `src/ui/app-extras/AppSection.tsx` (`AppSection`, `AppFoot`).
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
  /** „Tippe auf [Teilen-Symbol] Teilen und dann auf …“; das Symbol setzt die Oberfläche zwischen `before` und `share` */
  | { kind: "ios"; before: string; share: string; after: string; note: string };

export function installHelp(state: InstallState): InstallHelp | undefined {
  switch (state) {
    case "app":
      return { kind: "text", text: "Läuft als App." };
    case "angebot":
      // Der Knopf steht im Fuß des Kind-Sheets (`installFoot`, Plan 0022), ohne Scrollen sichtbar.
      return { kind: "text", text: "Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste." };
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
        note: "Die App startet leer: Alter, Merkliste und Stadtteil dort noch einmal eintragen.",
      };
    case "keine":
      return undefined;
  }
}

export type InstallFoot =
  | { kind: "knopf"; button: string }
  /** kompakte Zeile; das Teilen-Symbol setzt die Oberfläche zwischen `before` und `share` */
  | { kind: "ios"; before: string; share: string; after: string };

/**
 * Fuß des Kind-Sheets über „Fertig“ (Plan 0022): nur wenn der Browser die Installation anbietet ein Knopf, auf iOS
 * eine kompakte Zeile. Sonst nichts, die ausführliche Hilfe steht im Abschnitt „Als App“ (`installHelp`).
 */
export function installFoot(state: InstallState): InstallFoot | undefined {
  if (state === "angebot") return { kind: "knopf", button: "Zum Startbildschirm hinzufügen" };
  if (state === "ios") return { kind: "ios", before: "Als App:", share: "Teilen", after: "→ Zum Home-Bildschirm" };
  return undefined;
}

/**
 * Was `pushSupport()` (src/data/push.ts) meldet: `kein-sw` heißt nur „gerade kein Service Worker“ (blockiert,
 * Erstbesuch vor der Registrierung, Notausgang), nicht „Browser kann nicht“ (Plan 0017, Runde 3 M1).
 */
export type PushSupport = "ok" | "kein-sw" | "kein-push" | "verweigert";

export type PushView = { kind: "teil" } | { kind: "hinweis"; text: string } | { kind: "nichts" };

/** Sichtbarkeit des Push-Teils im Abschnitt „Als App“ (Plan 0017, E7, Matrix) */
export function pushView(state: InstallState, support: PushSupport): PushView {
  if (support === "ok" || support === "verweigert") return { kind: "teil" };
  if (state === "ios") return { kind: "hinweis", text: "Benachrichtigungen gibt es in der App." };
  if (state === "keine" || support === "kein-sw") return { kind: "nichts" };
  return { kind: "hinweis", text: "Dieser Browser kann keine Benachrichtigungen." };
}
