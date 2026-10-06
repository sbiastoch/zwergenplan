/**
 * Zustand des Startpunkts als reiner Reducer (Plan 0004, E3; Arch-Review 0004, m1). Kern ist die Reihenfolge:
 * Eine Standort-Antwort zählt nur, wenn sie zur laufenden Abfrage gehört. Eine spätere Wahl (Stadtteil,
 * Entfernen, neue Abfrage) macht eine noch ausstehende Antwort wirkungslos. Speichern und Abfragen macht
 * `useOrigin` (use-app-state.ts), hier wird nur gerechnet, auch das Wiederherstellen eines gespeicherten Punkts
 * (Plan 0016, E3).
 */
import type { PositionProblem, PositionResult } from "../data/geolocation.ts";
import type { StoredOriginPoint } from "../data/preferences.ts";
import { coarsen, type GeoPoint, inBounds } from "../domain/geo.ts";
import type { Origin } from "../domain/reach.ts";

export interface OriginState {
  origin: Origin | undefined;
  /** Standortabfrage läuft */
  locating: boolean;
  /** letzter Fehlergrund; weg bei neuer Abfrage und sobald ein Startpunkt gesetzt wird */
  problem?: PositionProblem;
  /** Nummer der laufenden Abfrage; nur deren Antwort zählt */
  pending?: number;
}

export type OriginAction =
  | { type: "locate"; request: number }
  | { type: "located"; request: number; result: PositionResult }
  | { type: "district"; origin: Origin }
  /** „Kartenmitte als Startpunkt“ (Plan 0005, E8); `point` schon gerundet und in Nürnberg */
  | { type: "mapCenter"; point: GeoPoint }
  | { type: "clear" };

/** Startpunkt aus Standort oder Kartenmitte, mit festem Label */
export function pointOrigin(source: StoredOriginPoint["source"], point: GeoPoint): Origin {
  return { source, point, label: source === "standort" ? "Mein Standort" : "Kartenmitte" };
}

/** Gespeicherten Punkt erneut runden und gegen die Stadtgrenze prüfen; ungültig → kein Startpunkt (Plan 0016, E3) */
export function storedPointOrigin(stored: StoredOriginPoint | undefined): Origin | undefined {
  if (!stored) return undefined;
  const point = coarsen(stored);
  return inBounds(point) ? pointOrigin(stored.source, point) : undefined;
}

export function initialOriginState(origin: Origin | undefined): OriginState {
  return { origin, locating: false };
}

export function originReducer(state: OriginState, action: OriginAction): OriginState {
  switch (action.type) {
    case "locate":
      // alter Fehler weg, damit die Live-Region einen erneuten Fehlschlag wieder ansagt
      return { origin: state.origin, locating: true, pending: action.request };
    case "located": {
      if (action.request !== state.pending) return state;
      const { result } = action;
      return result.ok
        ? { origin: pointOrigin("standort", result.point), locating: false }
        : { origin: state.origin, locating: false, problem: result.reason };
    }
    case "district":
      return { origin: action.origin, locating: false };
    case "mapCenter":
      return { origin: pointOrigin("karte", action.point), locating: false };
    case "clear":
      return { origin: undefined, locating: false };
  }
}
