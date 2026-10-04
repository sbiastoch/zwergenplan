/**
 * Zustand des Startpunkts als reiner Reducer (Plan 0004, E3; Arch-Review 0004, m1). Kern ist die Reihenfolge:
 * Eine Standort-Antwort zählt nur, wenn sie zur laufenden Abfrage gehört. Eine spätere Wahl (Stadtteil,
 * Entfernen, neue Abfrage) macht eine noch ausstehende Antwort wirkungslos. Speichern und Abfragen macht
 * `useOrigin` (use-app-state.ts), hier wird nur gerechnet.
 */
import type { PositionProblem, PositionResult } from "../data/geolocation.ts";
import type { GeoPoint } from "../domain/geo.ts";
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
        ? { origin: { source: "standort", point: result.point, label: "Mein Standort" }, locating: false }
        : { origin: state.origin, locating: false, problem: result.reason };
    }
    case "district":
      return { origin: action.origin, locating: false };
    case "mapCenter":
      return { origin: { source: "karte", point: action.point, label: "Kartenmitte" }, locating: false };
    case "clear":
      return { origin: undefined, locating: false };
  }
}
