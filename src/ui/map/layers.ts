/**
 * Eigene Quellen und Layer der Karte (Plan 0005, E6/E10) und die deutschen Texte der Bedienelemente
 * (E7). `addOwnLayers` läuft nach jedem `style.load`, auch nach dem Stilwechsel hell/dunkel.
 */
import type { AddLayerObject, Map as MapLibre } from "maplibre-gl";
import type { PointCollection } from "./geojson.ts";

/** Diese Layer treffen beim Tippen. */
export const PLACE_LAYERS = ["orte-cluster", "orte-punkt"];

/** Farben aus den Tokens (tokens.css), damit Marker und Theme zusammenpassen. */
interface MapColors {
  primary: string;
  onPrimary: string;
  surface: string;
}

/**
 * Liest die Tokens erst im `style.load`-Handler: Effekte von Kind-Komponenten laufen vor dem Effekt,
 * der `data-theme` setzt; dort kämen noch die alten Farben (E10). Ein leerer Wert ist ein Fehler.
 */
export function readMapColors(): MapColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => {
    const value = style.getPropertyValue(name).trim();
    if (!value) throw new Error(`Farb-Token ${name} fehlt`);
    return value;
  };
  return { primary: read("--primary"), onPrimary: read("--on-primary"), surface: read("--surface") };
}

type Filter = NonNullable<Extract<AddLayerObject, { type: "circle" }>["filter"]>;

/** Kreis mit der Zahl der Angebote; die Schrift gibt es in beiden OpenFreeMap-Stilen. */
function markerLayers(id: string, filter: Filter, radius: number, colors: MapColors): AddLayerObject[] {
  return [
    {
      id,
      type: "circle",
      source: "orte",
      filter,
      paint: {
        "circle-radius": radius,
        "circle-color": colors.primary,
        "circle-stroke-width": 2,
        "circle-stroke-color": colors.surface,
      },
    },
    {
      id: `${id}-zahl`,
      type: "symbol",
      source: "orte",
      filter,
      layout: {
        "text-field": ["to-string", ["get", "angebote"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": 13,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": colors.onPrimary },
    },
  ];
}

export function addOwnLayers(
  map: MapLibre,
  colors: MapColors,
  data: { places: PointCollection<object>; origin: PointCollection<object> },
): void {
  map.addSource("orte", {
    type: "geojson",
    data: data.places,
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 14,
    clusterProperties: { angebote: ["+", ["get", "angebote"]] },
  });
  map.addSource("startpunkt", { type: "geojson", data: data.origin });
  const layers = [
    ...markerLayers("orte-cluster", ["has", "point_count"], 18, colors),
    ...markerLayers("orte-punkt", ["!", ["has", "point_count"]], 14, colors),
  ];
  for (const layer of layers) map.addLayer(layer);
  map.addLayer({
    id: "startpunkt",
    type: "circle",
    source: "startpunkt",
    paint: {
      "circle-radius": 7,
      "circle-color": colors.surface,
      "circle-stroke-width": 4,
      "circle-stroke-color": colors.primary,
    },
  });
}

/** Deutsche Texte; die Schlüssel stammen aus MapLibres `defaultLocale` (E7). */
export const LOCALE: Record<string, string> = {
  "AttributionControl.ToggleAttribution": "Quellenangaben ein- oder ausblenden",
  "AttributionControl.MenuAvailable": "Menü verfügbar",
  "Map.Title": "Karte der Orte",
  "Marker.Title": "Kartenmarker",
  "NavigationControl.ResetBearing": "Nach Norden ausrichten",
  "NavigationControl.ZoomIn": "Hineinzoomen",
  "NavigationControl.ZoomOut": "Herauszoomen",
  "CooperativeGesturesHandler.WindowsHelpText": "Zum Zoomen Strg + Scrollen",
  "CooperativeGesturesHandler.MacHelpText": "Zum Zoomen ⌘ + Scrollen",
  "CooperativeGesturesHandler.MobileHelpText": "Mit zwei Fingern bewegen",
};
