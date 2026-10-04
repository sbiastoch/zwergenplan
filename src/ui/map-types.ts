/**
 * Schnittstelle zur lazy geladenen Karte (Plan 0005, E3). Liegt außerhalb von src/ui/map/, weil von
 * außen nichts statisch nach src/ui/map/ greifen darf, auch kein Typ (`map-only-lazy`).
 */
import type { GeoPoint } from "../domain/geo.ts";

export interface MapViewProps {
  dark: boolean;
  /** nach dem ersten `idle`; liefert, wie man die Kartenmitte abfragt */
  onReady: (center: () => GeoPoint) => void;
  onProblem: (problem: MapProblem) => void;
}

/** „webgl“: Der Browser kann die Karte nicht zeigen. „kacheln“: Stil oder Kacheln nicht ladbar. */
export type MapProblem = "webgl" | "kacheln";
