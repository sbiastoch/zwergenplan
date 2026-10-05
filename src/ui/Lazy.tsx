/**
 * Lazy-Chunks der Karte (Plan 0005, E2): Lade-Hook und Fehlermeldung. `useLazy` lädt eine Komponente
 * per `import()` mit erneutem Versuch; `React.lazy` scheidet aus, weil es einen fehlgeschlagenen Import
 * für immer behält. `retry` ruft den Lader erneut auf.
 *
 * Der Lader muss eine async-Funktion mit `await import(…)` sein: Vite schreibt `import(…).then(ok, fail)`
 * so um, dass die Handler am rohen Import im Preload-Helfer hängen; scheitert dann das CSS des Chunks,
 * gäbe es eine unbehandelte Ablehnung und der Zustand bliebe „laden“.
 */
import { useEffect, useState } from "react";

export type Lazy<C> = { kind: "laden" } | { kind: "da"; View: C } | { kind: "fehler" };

export function useLazy<C>(load: () => Promise<C>): { module: Lazy<C>; attempt: number; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [module, setModule] = useState<Lazy<C>>({ kind: "laden" });
  useEffect(() => {
    void attempt;
    let live = true;
    setModule({ kind: "laden" });
    // vite:preloadError wird bewusst nicht unterdrückt, sonst löste import() ohne Modul auf (E2).
    load().then(
      (View) => live && setModule({ kind: "da", View }),
      () => live && setModule({ kind: "fehler" }),
    );
    return () => {
      live = false;
    };
  }, [attempt, load]);
  // „laden“ zugleich mit dem neuen Versuch setzen (ein Render): Sonst zeigt ein Zwischen-Render mit altem
  // „fehler“ und attempt 1 kurz „Seite neu laden“, bevor der Effekt „laden“ setzt (CI-Befund zu ffddb46).
  const retry = () => {
    setModule({ kind: "laden" });
    setAttempt((n) => n + 1);
  };
  return { module, attempt, retry };
}

/** „Nochmal versuchen“, beim zweiten Fehlschlag „Seite neu laden“ (manche Browser merken sich den Fehlschlag). */
export function LoadFailed({ attempt, retry, children }: { attempt: number; retry: () => void; children: string }) {
  return (
    <p className="map-note">
      {children}
      {attempt === 0 ? (
        <button type="button" className="btn" onClick={retry}>
          Nochmal versuchen
        </button>
      ) : (
        // Die URL behält ansicht=karte.
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Seite neu laden
        </button>
      )}
    </p>
  );
}
