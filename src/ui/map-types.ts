/**
 * Schnittstellen der lazy geladenen Karte (Plan 0005, E3). Liegen außerhalb von src/ui/karte/ und
 * src/ui/map/, weil von außen nichts statisch dorthin greifen darf, auch kein Typ
 * (`karte-ui-only-lazy`, `map-only-lazy`). Ladekette: MapPanel.tsx (Start: `MapPanel`, `ProviderMapPanel`) →
 * karte/entry.ts (MapScreen bzw. ProviderMapScreen, Orts-Sheets) → map/MapView (MapLibre, Plan 0055, E5).
 */
import type { ComponentType } from "react";
import type { StartCamera } from "../domain/camera.ts";
import type { Bounds, MapExtent } from "../domain/map-view.ts";
import type { Place } from "../domain/places.ts";
import type { ProviderPlace } from "../domain/provider-places.ts";
import type { Origin } from "../domain/reach.ts";
import type { ProviderDirectoryData, SiteOffer } from "../domain/site-data.ts";
import type { CardContext } from "./OfferCard.tsx";
import type { ToastMessage } from "./Toast.tsx";

/** Props der Karten-Oberfläche (karte/MapScreen.tsx), durchgereicht von MapPanel.tsx */
export interface MapScreenProps {
  /** sichtbare Angebote (Filter, Alter, Wegzeit) */
  offers: readonly SiteOffer[];
  /** Datenbasis des Startausschnitts: alle kommenden Angebote, ohne Filter, Alter, Startpunkt (ADR 0008) */
  cameraOffers: readonly SiteOffer[];
  origin: Origin | undefined;
  dark: boolean;
  /** Kacheln im Orts-Sheet */
  ctx: CardContext;
  /** Kurzmeldung für das Orts-Sheet (der Seiten-Toast liegt hinter dem Modal) */
  toast: ToastMessage;
  /** Orts-Sheet auf oder zu: Der Seiten-Toast schweigt dann (App) */
  onSheetOpen: (open: boolean) => void;
  /** Kartenausschnitt nach `placeKey` für die Liste darunter (Plan 0056, E5); `undefined` beim Abbau und bei Fehlern */
  onInView: (view: MapExtent | undefined) => void;
  /** Zähler: Jede Änderung setzt die Kamera auf den Startausschnitt („Alle zeigen“) */
  resetKey: number;
}

/** Props der Anbieterkarte (karte/ProviderMapScreen.tsx, Plan 0055, E5), durchgereicht von `ProviderMapPanel` */
export interface ProviderMapScreenProps {
  /** Katalog, mit dem Datenstand von site.json abgeglichen (`useProviderDirectory`) */
  directory: ProviderDirectoryData;
  /** alle Angebote; „kommend“ (ohne Filter, ohne laufende Kurse) rechnet der Chunk selbst (N3) */
  offers: readonly SiteOffer[];
  /** sichtbar im Tab: Kategorie und Alter (`providerVisible`, E3) */
  visible: readonly SiteOffer[];
  now: Date;
  /** wird nur gezeichnet, nie angefahren, auch kein Stadtteil (ADR 0038) */
  origin: Origin | undefined;
  dark: boolean;
  /** IDs der abonnierten Anbieter: Glocke im Orts-Sheet (Plan 0054) */
  saved: readonly string[];
  onToggleSaved: (providerId: string) => void;
  bellBusy: boolean;
  /** öffnet das Anbieter-Sheet; der Fokus kehrt danach an die Karte zurück (E4) */
  onOpenProvider: (providerId: string) => void;
  /** Kartenausschnitt nach jedem `moveend`; `undefined` beim Abbau und bei einem Kartenfehler (Review M4) */
  onInView: (view: MapExtent | undefined) => void;
  /** Orts-Sheet auf oder zu: Der Seiten-Toast schweigt dann (App) */
  onSheetOpen: (open: boolean) => void;
  /** Kurzmeldung für das Orts-Sheet (Glocke; der Seiten-Toast liegt hinter dem Modal) */
  toast: ToastMessage;
  /** Zähler: Jede Änderung setzt die Kamera auf den Startausschnitt („Alle zeigen“) */
  resetKey: number;
}

/** Was karte/entry.ts exportiert: beide Karten in einem Chunk (Plan 0055, E5, Review B2) */
export interface KarteModule {
  MapScreen: ComponentType<MapScreenProps>;
  ProviderMapScreen: ComponentType<ProviderMapScreenProps>;
}

/** Inhalt der Karte: Orte der Angebote (Plan 0005) oder der Anbieter (Plan 0055) */
export type MapLayer =
  | {
      kind: "angebote";
      /** Orte der sichtbaren Angebote; die Hauptkategorien bestimmen das Marker-Symbol (Plan 0024, E5; Plan 0037, E11). */
      places: readonly Place<Pick<SiteOffer, "category">>[];
    }
  | { kind: "anbieter"; places: readonly ProviderPlace[] };

export interface MapViewProps {
  /** ein Wechsel der Orte tauscht nur die Daten, die Kamera bleibt (E9); `kind` bleibt je Mount gleich */
  layer: MapLayer;
  /** Ausschnitt beim ersten Öffnen der Sitzung, aus öffentlichen Daten (`initialCamera`, ADR 0008) */
  start: StartCamera;
  /** wird nur gezeichnet; angefahren wird nur ein Stadtteil, und nur auf der Angebotskarte (E9, ADR 0008, ADR 0038) */
  origin: Origin | undefined;
  dark: boolean;
  /** Tipp auf einen Ort-Marker */
  onPlace: (key: string) => void;
  /** nach dem ersten `idle` */
  onReady: () => void;
  onProblem: (problem: MapProblem) => void;
  /** Ausschnitt nach `load` und jedem `moveend` (Anbieterkarte, Plan 0055, E4) */
  onViewport?: ((bounds: Bounds) => void) | undefined;
  /** Zähler: Jede Änderung fährt zurück auf `start` (Plan 0055, N9) */
  resetKey?: number | undefined;
}

/** „webgl“: Der Browser kann die Karte nicht zeigen. „kacheln“: Stil oder Kacheln nicht ladbar. */
export type MapProblem = "webgl" | "kacheln";
