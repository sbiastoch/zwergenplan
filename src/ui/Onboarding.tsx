/**
 * Lader des Onboardings (Plan 0033, E3, E4), einziger Zugang zu `src/ui/onboarding/` (`onboarding-ui-entry-only`,
 * `lazy-loader-static`). Chunk in `assets/onboarding/` mit eigener CSS.
 * - `preloadOnboarding()` startet Onboarding-Chunk und App-Teil (`loadAppStep`, `assets/app/`) schon im
 *   `useState`-Initializer von `App`, parallel zu `site.json`, bei jedem Gate ≠ „nichts“ (E2, Review H1, 2 M-2).
 * - Der Cover-Div steht schon im ersten Frame, bevor `Dialog` im Effekt `showModal()` ruft: Die Liste blitzt nicht auf.
 * - Laden (Chunk, App-Teil oder Daten offen): leere Bühne mit „Überspringen“ (Start-CSS, Review H5), in der Farbe der
 *   ersten Bühne: im Safari-Tab des iPhones „App“ (Klasse `ios`, Plan 0034, E8), sonst Stadt.
 * - Chunk nicht ladbar: `LoadFailed` und „Später“ (Flag bleibt leer). Scheitert nur der App-Teil, läuft der Flow ohne
 *   den Schritt „App“.
 * - Esc und Android-Zurück (`cancel`) zählen wie „Überspringen“.
 */
import type { ComponentType } from "react";
import { iosTab } from "../data/platform.ts";
import { loadAppStep } from "./AppExtras.tsx";
import { Dialog } from "./Dialog.tsx";
import { LoadFailed, useLazy } from "./Lazy.tsx";
import type { AppStepModule, OnboardingFlowProps, OnboardingProps } from "./onboarding-types.ts";
import { NO_TOAST } from "./Toast.tsx";

interface Loaded {
  Flow: ComponentType<OnboardingFlowProps>;
  app: AppStepModule | undefined;
}
let loaded: Loaded | undefined;

/**
 * Chunk und App-Teil; der App-Teil darf scheitern. Vorladen und Lader rufen dies je einmal: Der Browser fordert jedes
 * Modul nur einmal an (Modul-Map), ein eigener Merker kostete nur Start-Bytes.
 */
async function loadOnboarding(): Promise<Loaded> {
  const [{ OnboardingFlow }, app] = await Promise.all([
    import("./onboarding/OnboardingFlow.tsx"),
    loadAppStep().catch(() => undefined),
  ]);
  loaded = { Flow: OnboardingFlow, app };
  return loaded;
}

export function preloadOnboarding(): void {
  // Fehler zeigt erst der Lader; hier nur keine unbehandelte Ablehnung
  loadOnboarding().catch(() => {});
}

export function Onboarding({ data, onEnd, ...rest }: OnboardingProps) {
  const { module, attempt, retry } = useLazy(loadOnboarding, () => loaded);
  return (
    <>
      <div className="onb-cover" aria-hidden="true" />
      <Dialog open label="Einführung" className="onb" toast={NO_TOAST} onClose={() => onEnd("abbruch")}>
        {module.kind === "fehler" ? (
          <div className="onb-failed">
            <LoadFailed attempt={attempt} retry={retry} className="lazy-note">
              Die Einführung konnte nicht geladen werden.
            </LoadFailed>
            <button type="button" className="btn" onClick={() => onEnd("spaeter")}>
              Später
            </button>
          </div>
        ) : module.kind === "laden" || data === "loading" ? (
          <div className={iosTab() ? "onb-pending ios" : "onb-pending"} aria-busy="true">
            <div className="onb-topbar">
              <button type="button" className="onb-skip" onClick={() => onEnd("abbruch")}>
                Überspringen
              </button>
            </div>
          </div>
        ) : (
          <module.View.Flow
            {...rest}
            offers={data === "error" ? undefined : data}
            app={module.View.app}
            onEnd={onEnd}
          />
        )}
      </Dialog>
    </>
  );
}
