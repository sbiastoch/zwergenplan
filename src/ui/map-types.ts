/**
 * Schnittstelle zur lazy geladenen Karte (Plan 0005, E3). Liegt außerhalb von src/ui/map/, weil von
 * außen nichts statisch nach src/ui/map/ greifen darf, auch kein Typ (`map-only-lazy`).
 */
import type { GeoPoint } from "../domain/geo.ts";
import type { Place } from "../domain/places.ts";
import type { Origin } from "../domain/reach.ts";

export interface MapViewProps {
  /** Orte der sichtbaren Angebote; ein Wechsel tauscht nur die Daten, die Kamera bleibt (E9) */
  places: readonly Place<unknown>[];
  /** wird nur gezeichnet; angefahren wird nur ein Stadtteil (E9, ADR 0008) */
  origin: Origin | undefined;
  dark: boolean;
  /** Tipp auf einen Ort-Marker */
  onPlace: (key: string) => void;
  /** nach dem ersten `idle`; liefert, wie man die Kartenmitte abfragt */
  onReady: (center: () => GeoPoint) => void;
  onProblem: (problem: MapProblem) => void;
}

/** „webgl“: Der Browser kann die Karte nicht zeigen. „kacheln“: Stil oder Kacheln nicht ladbar. */
export type MapProblem = "webgl" | "kacheln";
