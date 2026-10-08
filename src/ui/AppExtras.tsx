/**
 * Lader der Lazy-Kette „App-Extras“ (Plan 0011, E5, E7): Abschnitt „Als App“ im Kind-Sheet und dessen Fuß mit dem
 * Installationsknopf (Plan 0022), Chunk in `assets/app/`.
 * Einziger Zugang zu `src/ui/app-extras/` (`app-extras-ui-entry-only`, `lazy-loader-static`).
 * - Ein Ladevorgang für beide Teile (`useAppExtras`), das Kind-Sheet setzt sie an ihre Stelle.
 * - Laden: Platzhalter so hoch wie die Überschrift, kein Sprung im Sheet; der Fuß zeigt bis dahin nur „Fertig“.
 * - Chunk nicht ladbar (offline, nicht im Cache): `LoadFailed` mit `lazy-note` für den Sheet-Kontext, Fuß nur „Fertig“.
 */
import { LoadFailed, useLazy } from "./Lazy.tsx";

/**
 * Abschnitt und PWA-Kern parallel, je per `import()` (kein statischer Import zwischen zwei Lazy-Chunks, siehe
 * AppSection.tsx). Destrukturiert direkt am `import()`: So sieht knip, welche Exporte genutzt werden.
 */
async function loadExtras() {
  const [{ AppSection, AppFoot }, { install }] = await Promise.all([
    import("./app-extras/AppSection.tsx"),
    import("../data/pwa.ts"),
  ]);
  return (onClose: () => void) => [
    <AppSection key="a" install={install} />,
    <AppFoot key="f" install={install} onClose={onClose} />,
  ];
}

/** Abschnitt „Als App“ und Fuß des Kind-Sheets aus einem Ladevorgang: `[Abschnitt, Fuß]` */
export function useAppExtras(onClose: () => void) {
  const { module, attempt, retry } = useLazy(loadExtras);
  if (module.kind === "da") return module.View(onClose);
  return [
    module.kind === "laden" ? (
      <div key="a" className="app-pending" aria-hidden="true" />
    ) : (
      <LoadFailed key="a" attempt={attempt} retry={retry} className="lazy-note">
        Der Abschnitt „Als App“ konnte nicht geladen werden.
      </LoadFailed>
    ),
    <div key="f" className="sheetfoot single">
      <button type="button" className="btn primary wide" onClick={onClose}>
        Fertig
      </button>
    </div>,
  ];
}
