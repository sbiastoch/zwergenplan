/**
 * Lader der Lazy-Kette „App-Extras“ (Plan 0011, E5, E7): Abschnitt „Als App“ im Kind-Sheet und dessen Fuß mit dem
 * Installationsknopf (Plan 0022), Chunk in `assets/app/`.
 * Einziger Zugang zu `src/ui/app-extras/` (`app-extras-ui-entry-only`, `lazy-loader-static`).
 * - Ein Ladevorgang für beide Teile (`useAppExtras`), das Kind-Sheet setzt sie an ihre Stelle. „Fertig“ gehört dem
 *   Kind-Sheet und bleibt dasselbe Element; der Chunk setzt nur Knopf bzw. iOS-Zeile davor (Arch-Review 0022, m1).
 * - Ein schon geladenes Modul steht beim nächsten Öffnen sofort da (`peek`), ohne Sprung im Fuß.
 * - Laden: Platzhalter so hoch wie die Überschrift, kein Sprung im Sheet; der Fuß zeigt bis dahin nur „Fertig“.
 * - Chunk nicht ladbar (offline, nicht im Cache): `LoadFailed` mit `lazy-note` für den Sheet-Kontext, Fuß nur „Fertig“.
 *   Klappt „Nochmal versuchen“, geht der Fokus auf die Überschrift „Als App“ (sonst auf „Fertig“), nicht auf <body>.
 */
import type { ReactNode, RefObject } from "react";
import { LoadFailed, useLazy } from "./Lazy.tsx";

type Extras = (done: RefObject<HTMLButtonElement | null>, retried: boolean) => AppExtras;
interface AppExtras {
  section: ReactNode;
  /** Zusatz vor „Fertig“ */
  foot: ReactNode;
}
let loaded: Extras | undefined;

/**
 * Abschnitt und PWA-Kern parallel, je per `import()` (kein statischer Import zwischen zwei Lazy-Chunks, siehe
 * AppSection.tsx). Destrukturiert direkt am `import()`: So sieht knip, welche Exporte genutzt werden.
 */
async function loadExtras(): Promise<Extras> {
  const [{ AppSection, AppFoot }, { install }] = await Promise.all([
    import("./app-extras/AppSection.tsx"),
    import("../data/pwa.ts"),
  ]);
  loaded = (done, retried) => ({
    section: <AppSection install={install} done={done} retried={retried} />,
    foot: <AppFoot install={install} done={done} />,
  });
  return loaded;
}

/**
 * Abschnitt und Fuß-Zusatz aus einem Ladevorgang. `done` ist „Fertig“ im Fuß des Kind-Sheets: Ziel des Fokus, wenn der
 * Installationsknopf verschwindet.
 */
export function useAppExtras(done: RefObject<HTMLButtonElement | null>): AppExtras {
  const { module, attempt, retry } = useLazy(loadExtras, () => loaded);
  if (module.kind === "da") return module.View(done, attempt > 0);
  return {
    section:
      module.kind === "laden" ? (
        <div className="app-pending" aria-hidden="true" />
      ) : (
        <LoadFailed attempt={attempt} retry={retry} className="lazy-note">
          Der Abschnitt „Als App“ konnte nicht geladen werden.
        </LoadFailed>
      ),
    foot: null,
  };
}
