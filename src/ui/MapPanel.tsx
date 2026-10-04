/**
 * Kartenansicht von „Entdecken“ (Plan 0005, E2/E12): lädt den Karten-Code erst beim Mounten per
 * `import()`. `React.lazy` scheidet aus, weil es einen fehlgeschlagenen Import für immer behält.
 */
import { type ComponentType, useEffect, useState } from "react";
import type { MapProblem, MapViewProps } from "./map-types.ts";

type Module = { kind: "laden" } | { kind: "da"; View: ComponentType<MapViewProps> } | { kind: "fehler" };

/** Lädt MapView.tsx; `retry` ruft `import()` erneut auf. */
function useMapModule(): { module: Module; attempt: number; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [module, setModule] = useState<Module>({ kind: "laden" });
  useEffect(() => {
    void attempt;
    let live = true;
    setModule({ kind: "laden" });
    import("./map/MapView.tsx").then(
      (m) => live && setModule({ kind: "da", View: m.MapView }),
      () => live && setModule({ kind: "fehler" }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return { module, attempt, retry: () => setAttempt((n) => n + 1) };
}

export function MapPanel({ dark }: { dark: boolean }) {
  const { module } = useMapModule();
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<MapProblem>();
  const state = module.kind === "fehler" || problem ? "fehler" : ready ? "bereit" : "laden";
  return (
    <div className="map-box" data-state={state}>
      {module.kind === "da" && !problem && (
        <module.View dark={dark} onReady={() => setReady(true)} onProblem={setProblem} />
      )}
    </div>
  );
}
