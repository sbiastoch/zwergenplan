/**
 * Eigene Quellen und Layer der Karte (Plan 0005, E6/E10) und die deutschen Texte der Bedienelemente
 * (E7). `addOwnLayers` läuft nach jedem `style.load`, auch nach dem Stilwechsel hell/dunkel.
 */
import type { AddLayerObject, ExpressionSpecification, Map as MapLibre } from "maplibre-gl";
import { CATEGORIES, type Category } from "../../domain/topics.ts";
import type { MapTokens } from "./basemap.ts";
import type { PointCollection } from "./geojson.ts";

/** Diese Layer treffen beim Tippen. */
export const PLACE_LAYERS = ["orte-cluster", "orte-punkt"];
/** dasselbe auf der Anbieterkarte (Plan 0055, E5), Quelle „anbieter-orte“ */
export const PROVIDER_LAYERS = ["anbieter-cluster", "anbieter-punkt"];

/**
 * Liest die Tokens erst im `style.load`-Handler: Effekte von Kind-Komponenten laufen vor dem Effekt,
 * der `data-theme` setzt; dort kämen noch die alten Farben (E10). Die Kategorie-Farben hängen an
 * `.k-<kategorie>` (tokens.css), daher ein kurzlebiges Element. Ein leerer Wert ist ein Fehler.
 */
export function readMapTokens(): MapTokens {
  const read = (style: CSSStyleDeclaration, name: string) => {
    const value = style.getPropertyValue(name).trim();
    if (!value) throw new Error(`Farb-Token ${name} fehlt`);
    return value;
  };
  const root = getComputedStyle(document.documentElement);
  const token = (name: string) => read(root, name);
  const probe = document.createElement("span");
  probe.hidden = true;
  document.body.append(probe);
  try {
    const categories = Object.fromEntries(
      CATEGORIES.map((category) => {
        probe.className = `k-${category}`;
        return [category, read(getComputedStyle(probe), "--k")];
      }),
      // `as` begründet: `fromEntries` über genau `CATEGORIES`, also ist jeder Schlüssel da (E2E prüft alle Bilder).
    ) as Record<Category, string>;
    return {
      bg: token("--bg"),
      surface: token("--surface"),
      rim: token("--rim"),
      ink: token("--ink"),
      muted: token("--muted"),
      line: token("--line"),
      shadowColor: token("--shadow"),
      primary: token("--primary"),
      onPrimary: token("--on-primary"),
      onColor: token("--on-color"),
      green: token("--map-green"),
      categories,
    };
  } finally {
    probe.remove();
  }
}

type Filter = NonNullable<Extract<AddLayerObject, { type: "circle" }>["filter"]>;
type Paint = NonNullable<Extract<AddLayerObject, { type: "circle" }>["paint"]>;

const CLUSTER: Filter = ["has", "point_count"];
const PLACE: Filter = ["!", ["has", "point_count"]];
const SEVERAL: Filter = ["all", PLACE, [">", ["get", "angebote"], 1]];
const SEVERAL_PROVIDERS: Filter = ["all", PLACE, [">", ["get", "anbieter"], 1]];

/** harter Versatz-Schatten wie bei Kacheln und Knöpfen der App (Token `--shadow`, wie `box-shadow` in den Stilen) */
const dropShadow = (
  id: string,
  filter: Filter,
  radius: number,
  colors: MapTokens,
  source = "orte",
): AddLayerObject => ({
  id,
  type: "circle",
  source,
  filter,
  paint: { "circle-radius": radius + 1, "circle-color": colors.shadowColor, "circle-translate": [2, 2] },
});

/** Zahl als Text; die Schrift „Noto Sans Regular“ gibt es in beiden OpenFreeMap-Stilen (keine neuen Glyphen). */
const count = (
  id: string,
  filter: Filter,
  size: number,
  offset: [number, number],
  color: string,
  source = "orte",
  property = "angebote",
): AddLayerObject => ({
  id,
  type: "symbol",
  source,
  filter,
  layout: {
    "text-field": ["to-string", ["get", property]],
    "text-font": ["Noto Sans Regular"],
    "text-size": size,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: { "text-color": color, "text-translate": offset },
});

const circle = (id: string, filter: Filter, paint: Paint, source = "orte"): AddLayerObject => ({
  id,
  type: "circle",
  source,
  filter,
  paint,
});

/**
 * Marker (Plan 0024, E7): Cluster als runder Kreis mit Zahl; ein Ort als Sticker in Kategorie-Farbe mit
 * Symbol, bei mehr als einem Angebot mit Zahl als Badge oben rechts. Getippt wird über `PLACE_LAYERS`.
 */
function markerLayers(colors: MapTokens): AddLayerObject[] {
  const [first, ...rest] = CATEGORIES;
  const categoryColor: ExpressionSpecification = [
    "match",
    ["get", "kategorie"],
    first,
    colors.categories[first],
    ...rest.flatMap((category) => [category, colors.categories[category]]),
    colors.surface,
  ];
  return [
    dropShadow("orte-cluster-schatten", CLUSTER, 18, colors),
    circle("orte-cluster", CLUSTER, {
      "circle-radius": 18,
      "circle-color": colors.primary,
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.surface,
    }),
    count("orte-cluster-zahl", CLUSTER, 13, [0, 0], colors.onPrimary),
    dropShadow("orte-punkt-schatten", PLACE, 15, colors),
    circle("orte-punkt", PLACE, {
      "circle-radius": 15,
      "circle-color": categoryColor,
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.line,
    }),
    {
      id: "orte-punkt-symbol",
      type: "symbol",
      source: "orte",
      filter: PLACE,
      layout: {
        "icon-image": ["concat", "kategorie-", ["get", "kategorie"]],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
    circle("orte-punkt-badge", SEVERAL, {
      "circle-radius": 9,
      "circle-color": colors.primary,
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.surface,
      "circle-translate": [12, -12],
    }),
    count("orte-punkt-zahl", SEVERAL, 11, [12, -12], colors.onPrimary),
  ];
}

/**
 * Marker der Anbieterkarte (Plan 0055, E4): Cluster wie bei den Angeboten (Summe der Anbieter); ein Ort als Kachel mit
 * Laden-Symbol (`anbieter`, marker-images.ts), blass mit gestricheltem Bild und Deckkraft 0,55; ab zwei Anbietern eine
 * Zahl als Badge. Getippt wird über `PROVIDER_LAYERS`; der unsichtbare Kreis `anbieter-punkt` ist die Trefferfläche.
 */
function providerLayers(colors: MapTokens): AddLayerObject[] {
  const source = "anbieter-orte";
  const pale: ExpressionSpecification = ["get", "blass"];
  return [
    dropShadow("anbieter-cluster-schatten", CLUSTER, 18, colors, source),
    circle(
      "anbieter-cluster",
      CLUSTER,
      {
        "circle-radius": 18,
        "circle-color": colors.primary,
        "circle-stroke-width": 2,
        "circle-stroke-color": colors.surface,
      },
      source,
    ),
    count("anbieter-cluster-zahl", CLUSTER, 13, [0, 0], colors.onPrimary, source, "anbieter"),
    circle("anbieter-punkt", PLACE, { "circle-radius": 15, "circle-opacity": 0 }, source),
    {
      id: "anbieter-punkt-symbol",
      type: "symbol",
      source,
      filter: PLACE,
      layout: {
        "icon-image": ["case", pale, "anbieter-blass", "anbieter"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": ["case", pale, 0.55, 1] },
    },
    circle(
      "anbieter-punkt-badge",
      SEVERAL_PROVIDERS,
      {
        "circle-radius": 9,
        "circle-color": colors.primary,
        "circle-stroke-width": 2,
        "circle-stroke-color": colors.surface,
        "circle-translate": [12, -12],
      },
      source,
    ),
    count("anbieter-punkt-zahl", SEVERAL_PROVIDERS, 11, [12, -12], colors.onPrimary, source, "anbieter"),
  ];
}

/** Farbe des Auswahl-Rings (Plan 0059, E5) */
const SELECTION_COLOR = "#ffd93b";

export function addOwnLayers(
  map: MapLibre,
  colors: MapTokens,
  data: {
    kind: "angebote" | "anbieter";
    places: PointCollection<object>;
    origin: PointCollection<object>;
    selection: PointCollection<object>;
  },
): void {
  if (data.kind === "anbieter") {
    map.addSource("anbieter-orte", {
      type: "geojson",
      data: data.places,
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: 14,
      clusterProperties: { anbieter: ["+", ["get", "anbieter"]] },
    });
  } else {
    map.addSource("orte", {
      type: "geojson",
      data: data.places,
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: 14,
      clusterProperties: { angebote: ["+", ["get", "angebote"]] },
    });
  }
  map.addSource("startpunkt", { type: "geojson", data: data.origin });
  map.addSource("auswahl", { type: "geojson", data: data.selection });
  // Ring unter dem getippten Ort, solange sein Overlay offen ist (Plan 0059, E5): unter den Markern, damit Symbol und
  // Zahl lesbar bleiben. Gelb wie der Sticker-Kreis im Logo, in hell und dunkel gleich; der Rand trägt den Kontrast.
  map.addLayer({
    id: "auswahl",
    type: "circle",
    source: "auswahl",
    paint: {
      "circle-radius": 26,
      "circle-color": SELECTION_COLOR,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": colors.line,
    },
  });
  for (const layer of data.kind === "anbieter" ? providerLayers(colors) : markerLayers(colors)) map.addLayer(layer);
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
