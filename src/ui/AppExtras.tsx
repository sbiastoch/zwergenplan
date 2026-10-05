/**
 * Lader der Lazy-Kette „App-Extras“ (Plan 0011, E5, E7): Abschnitt „Als App“ im Kind-Sheet, Chunk in `assets/app/`.
 * Einziger Zugang zu `src/ui/app-extras/` (`app-extras-ui-entry-only`, `lazy-loader-static`).
 * - Laden: Platzhalter so hoch wie die Überschrift, kein Sprung im Sheet.
 * - Chunk nicht ladbar (offline, nicht im Cache): `LoadFailed` mit `lazy-note` für den Sheet-Kontext.
 */
import { LoadFailed, useLazy } from "./Lazy.tsx";

/**
 * Abschnitt und PWA-Kern parallel, je per `import()` (kein statischer Import zwischen zwei Lazy-Chunks, siehe
 * AppSection.tsx). Destrukturiert direkt am `import()`: So sieht knip, welche Exporte genutzt werden.
 */
async function loadSection() {
  const [{ AppSection }, { install }] = await Promise.all([
    import("./app-extras/AppSection.tsx"),
    import("../data/pwa.ts"),
  ]);
  return () => <AppSection install={install} />;
}

export function AppExtrasSection() {
  const { module, attempt, retry } = useLazy(loadSection);
  if (module.kind === "fehler") {
    return (
      <LoadFailed attempt={attempt} retry={retry} className="lazy-note">
        Der Abschnitt „Als App“ konnte nicht geladen werden.
      </LoadFailed>
    );
  }
  if (module.kind === "laden") return <div className="app-pending" aria-hidden="true" />;
  return <module.View />;
}
