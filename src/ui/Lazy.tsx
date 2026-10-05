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

/**
 * `peek` (optional) liefert ein schon geladenes Modul synchron: Ein neuer Mount (Tabwechsel) zeigt es dann sofort,
 * ohne einen Frame im Ladezustand (Plan 0010, Arch-Review m4).
 */
export function useLazy<C>(
  load: () => Promise<C>,
  peek?: () => C | undefined,
): { module: Lazy<C>; attempt: number; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [module, setModule] = useState<Lazy<C>>(() => {
    const View = peek?.();
    return View === undefined ? { kind: "laden" } : { kind: "da", View };
  });
  useEffect(() => {
    void attempt;
    let live = true;
    // Ein schon geladenes Modul (peek) bleibt stehen, sonst „laden“ bis zur Antwort
    setModule((m) => (m.kind === "da" ? m : { kind: "laden" }));
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

/**
 * „Nochmal versuchen“, beim zweiten Fehlschlag „Seite neu laden“ (manche Browser merken sich den Fehlschlag).
 * `className`: `map-note` liegt absolut im Kartenrahmen; die Anbieter nutzen `lazy-note` in `.lazy-box` (Plan 0010, E7).
 */
export function LoadFailed({
  attempt,
  retry,
  className = "map-note",
  children,
}: {
  attempt: number;
  retry: () => void;
  className?: string;
  children: string;
}) {
  return (
    <p className={className}>
      {children}
      {attempt === 0 ? (
        <button type="button" className="btn" onClick={retry}>
          Nochmal versuchen
        </button>
      ) : (
        // Die URL behält ansicht=karte bzw. ansicht=anbieter und anbieter=<id>.
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Seite neu laden
        </button>
      )}
    </p>
  );
}
