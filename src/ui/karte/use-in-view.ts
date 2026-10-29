/**
 * Meldet den Kartenausschnitt an die Liste unter der Karte (Plan 0055, E4; Plan 0056, E5), für Anbieter- und
 * Angebotskarte. Nur bei einer Änderung der Menge, das spart Re-Render der Liste; bei Kartenfehler und Abbau
 * `undefined`, damit kein veralteter Ausschnitt die Liste filtert (Plan 0055, Review M4).
 */
import { useCallback, useEffect, useRef } from "react";
import type { Bounds, MapExtent } from "../../domain/map-view.ts";

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Liefert den Handler für `onViewport`. `inBounds` und `known` neu (Datenstand, Filter): sofort neu rechnen. */
export function useInViewReport(
  inBounds: (bounds: Bounds) => ReadonlySet<string>,
  known: ReadonlySet<string>,
  failed: boolean,
  onInView: (view: MapExtent | undefined) => void,
): (bounds: Bounds) => void {
  const bounds = useRef<Bounds>(undefined);
  const reported = useRef<MapExtent>(undefined);
  const report = useCallback(() => {
    if (!bounds.current) return;
    const inView = inBounds(bounds.current);
    // Inhalt statt Identität: Neue, aber gleiche Mengen lösen keine Meldung aus, also auch keine Render-Schleife
    const last = reported.current;
    if (last && sameSet(last.inView, inView) && sameSet(last.known, known)) return;
    reported.current = { inView, known };
    onInView(reported.current);
  }, [inBounds, known, onInView]);
  // neue Daten: neu rechnen, ohne auf die nächste Bewegung zu warten
  useEffect(() => {
    report();
  }, [report]);
  useEffect(() => {
    if (!failed) return;
    bounds.current = undefined;
    reported.current = undefined;
    onInView(undefined);
  }, [failed, onInView]);
  useEffect(() => () => onInView(undefined), [onInView]);
  return useCallback(
    (next: Bounds) => {
      bounds.current = next;
      report();
    },
    [report],
  );
}
