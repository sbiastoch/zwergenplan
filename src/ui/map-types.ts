/**
 * Schnittstellen der lazy geladenen Karte (Plan 0005, E3). Liegen außerhalb von src/ui/karte/ und
 * src/ui/map/, weil von außen nichts statisch dorthin greifen darf, auch kein Typ
 * (`karte-ui-only-lazy`, `map-only-lazy`). Ladekette: MapPanel.tsx (Start: `MapPanel`, `ProviderMapPanel`) →
 * karte/entry.ts (MapScreen bzw. ProviderMapScreen, Orts-Sheets) → map/MapView (MapLibre, Plan 0055, E5).
 */
import type { ComponentType, ReactNode, RefObject } from "react";
import type { StartCamera } from "../domain/camera.ts";
import type { Bounds, MapExtent } from "../domain/map-view.ts";
import type { Place } from "../domain/places.ts";
import type { ProviderPlace } from "../domain/provider-places.ts";
import type { Origin } from "../domain/reach.ts";
import type { ProviderDirectoryData, SiteOffer } from "../domain/site-data.ts";
import type { CardContext } from "./OfferCard.tsx";
import type { ToastMessage } from "./Toast.tsx";

/** Karte groß (Plan 0059), gleich für alle drei Karten; `App` reicht sie durch */
export interface BigMapProps {
  /** Vollbild: Rahmen `.map-box.big`, Kopfleiste und Zahl aus `overlay` */
  big: boolean;
  /** Knopf „Groß“ im kleinen Rahmen */
  onBig: () => void;
  /** Fokus-Ziel nach dem Schließen der großen Karte */
  growRef: RefObject<HTMLButtonElement | null>;
  /** Kopfleiste und Zahl der großen Karte (`BigMapBar`); nur mit `big` */
  overlay: ReactNode;
  /** Detail oder Anbieter-Sheet offen: Der getippte Ort bleibt markiert (E5) */
  overlayOpen: boolean;
}

/** Props der Karten-Oberfläche (karte/MapScreen.tsx), durchgereicht von MapPanel.tsx */
export interface MapScreenProps extends BigMapProps {
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
  /**
   * Startet am Startpunkt und fährt bei einem neuen (Plan 0056, E6). Die Merklisten-Karte nicht: Sie startet über
   * alle Orte (Nutzerentscheid, Option a).
   */
  followOrigin: boolean;
  /** Kartenausschnitt nach `placeKey` für die Liste darunter (Plan 0056, E5); `undefined` beim Abbau und bei Fehlern */
  onInView: (view: MapExtent | undefined) => void;
  /** Zähler: Jede Änderung fährt auf den Rahmen über alle Orte („Alle zeigen“, Plan 0056, N11) */
  resetKey: number;
}

/** Props der Anbieterkarte (karte/ProviderMapScreen.tsx, Plan 0055, E5), durchgereicht von `ProviderMapPanel` */
export interface ProviderMapScreenProps extends BigMapProps {
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
  /** Zähler: Jede Änderung fährt auf den Rahmen über alle Orte („Alle zeigen“, Plan 0056, N11) */
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
  /** Ausschnitt beim Öffnen: 2 km um den Startpunkt, sonst bzw. ohne Orte im Umkreis alle Orte (`initialCamera`, ADR 0039) */
  start: StartCamera;
  /** Rahmen über alle Orte: Ziel von „Alle zeigen“ (Plan 0056, N11) */
  overview: StartCamera;
  /**
   * Startpunkt, nach dem `start` gerechnet ist (`originKey`, N12). Ändert er sich bei offener Karte, fährt sie auf
   * den neuen `start`; der gemerkte Ausschnitt gilt nur bei gleichem Schlüssel (Plan 0056, E6).
   */
  startKey: string | undefined;
  /** Startpunkt, als lokaler Layer gezeichnet */
  origin: Origin | undefined;
  dark: boolean;
  /** Tipp auf einen Ort-Marker */
  onPlace: (key: string) => void;
  /** nach dem ersten `idle` */
  onReady: () => void;
  onProblem: (problem: MapProblem) => void;
  /** Ausschnitt nach `load` und jedem `moveend` (Anbieterkarte, Plan 0055, E4) */
  onViewport?: ((bounds: Bounds) => void) | undefined;
  /** Zähler: Jede Änderung fährt auf `overview` („Alle zeigen“, Plan 0055, N9; Plan 0056, N11) */
  resetKey?: number | undefined;
  /** Karte groß (Plan 0059, E2): ein Finger bewegt sie, neu gewählte Orte rücken über das Sheet (E5) */
  big: boolean;
  /** Schlüssel des getippten Orts, solange sein Overlay offen ist: Auswahl-Ring (Plan 0059, E5) */
  selected: string | undefined;
}

/** „webgl“: Der Browser kann die Karte nicht zeigen. „kacheln“: Stil oder Kacheln nicht ladbar. */
export type MapProblem = "webgl" | "kacheln";
