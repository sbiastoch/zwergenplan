/**
 * Schnittstellen der lazy geladenen Karte (Plan 0005, E3). Liegen außerhalb von src/ui/karte/ und
 * src/ui/map/, weil von außen nichts statisch dorthin greifen darf, auch kein Typ
 * (`karte-ui-only-lazy`, `map-only-lazy`). Ladekette: MapPanel (Start) → karte/MapScreen (Orts-Liste,
 * Werkzeugzeile, Orts-Sheet) → map/MapView (MapLibre).
 */
import type { StartCamera } from "../domain/camera.ts";
import type { GeoPoint } from "../domain/geo.ts";
import type { Place } from "../domain/places.ts";
import type { Origin } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import type { CardContext } from "./OfferCard.tsx";

/** Props der Karten-Oberfläche (karte/MapScreen.tsx), durchgereicht von MapPanel.tsx */
export interface MapScreenProps {
  /** sichtbare Angebote (Filter, Alter, Umkreis) */
  offers: readonly SiteOffer[];
  /** Datenbasis des Startausschnitts ohne Umkreis (`useOfferViews().map.cameraOffers`, ADR 0008) */
  cameraOffers: readonly SiteOffer[];
  origin: Origin | undefined;
  dark: boolean;
  hasData: boolean;
  /** Kacheln im Orts-Sheet; `reachOf` auch für die Orts-Liste */
  ctx: CardContext;
  /** Kurzmeldung für das Orts-Sheet (der Seiten-Toast liegt hinter dem Modal) */
  toast: string;
  /** Orts-Sheet auf oder zu: Der Seiten-Toast schweigt dann (App) */
  onSheetOpen: (open: boolean) => void;
  /** öffnet das Kind-Sheet bei „Entfernung ab“ */
  onPickOrigin: () => void;
  onMapCenter: (center: GeoPoint) => void;
  onResetFilter: () => void;
}

export interface MapViewProps {
  /** Orte der sichtbaren Angebote; ein Wechsel tauscht nur die Daten, die Kamera bleibt (E9) */
  places: readonly Place<unknown>[];
  /** Ausschnitt beim ersten Öffnen der Sitzung, aus öffentlichen Daten (`initialCamera`, ADR 0008) */
  start: StartCamera;
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
