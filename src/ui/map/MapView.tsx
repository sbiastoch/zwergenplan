/**
 * Die Karte (Plan 0005, E2/E6/E9/E10): lädt nur per `import()` aus karte/MapScreen.tsx. Nur src/ui/map/
 * kennt maplibre-gl (`maplibre-only-in-map`). Kamera-Regel (ADR 0008): Die Karte fährt nie auf einen
 * Standort oder die Kartenmitte, sie zeichnet den Startpunkt nur. So verraten die Kachel-Requests ihn nicht.
 */
import {
  type GeoJSONSource,
  type LngLatLike,
  Map as MapLibre,
  type MapOptions,
  NavigationControl,
  type PointLike,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map-overrides.css"; // nach maplibre-gl.css (E4)
import { guardTileRequest, styleUrl } from "../../data/tiles.ts";
import { DISTRICT_ZOOM, type StartCamera } from "../../domain/camera.ts";
import type { GeoPoint } from "../../domain/geo.ts";
import type { MapViewProps } from "../map-types.ts";
import { BASEMAP_PAINT, basemapChanges, basemapPalette, type MapTokens } from "./basemap.ts";
import { nearestHit, originToFeatures, placesToFeatures } from "./geojson.ts";
import { germanTextField } from "./labels.ts";
import { addOwnLayers, LOCALE, PLACE_LAYERS, readMapTokens } from "./layers.ts";
import { addCategoryImages } from "./marker-images.ts";

// Die Worker-URL aus import.meta.url stimmt nach dem Bündeln nicht mehr (Spike, E2).
setWorkerUrl(workerUrl);

const lngLat = ({ lat, lon }: GeoPoint): [number, number] => [lon, lat];

/** ohne `load` bis dahin: Kartenbilder lassen sich nicht laden (E12) */
const LOAD_TIMEOUT_MS = 15_000;
/** halbe Kantenlänge des Tipp-Rechtecks: effektiv 44 px (E6) */
const TAP_PX = 22;

/**
 * Freiraum rechts für die Zoom-Knöpfe oben rechts (Plan 0008, E20): 44 px Knopf + 2 × 2 px Rand + 10 px
 * Abstand von MapLibre. Gilt für jeden Startausschnitt gleich, hängt also an nichts Privatem (ADR 0008).
 */
const ZOOM_CONTROL_INSET = 58;
const START_PADDING = { top: 32, right: 32 + ZOOM_CONTROL_INSET, bottom: 32, left: 32 };

/** Zuletzt gesehener Ausschnitt dieser Sitzung; nie in URL oder Speicher (E9). */
let lastCamera: { center: LngLatLike; zoom: number } | undefined;

/**
 * Ausschnitt beim Öffnen (E9): der dieser Sitzung, sonst `start` aus `initialCamera` (öffentliche Daten,
 * nie Standort oder Kartenmitte). Als Konstruktor-Option, damit vorher kein anderer Ausschnitt Kacheln lädt.
 */
function cameraOptions(start: StartCamera): Partial<MapOptions> {
  if (lastCamera) return lastCamera;
  if ("center" in start) return { center: lngLat(start.center), zoom: start.zoom };
  const { minLat, minLon, maxLat, maxLon } = start.bounds;
  return { bounds: [minLon, minLat, maxLon, maxLat], fitBoundsOptions: { padding: START_PADDING, maxZoom: 14 } };
}

type TextField = Parameters<typeof MapLibre.prototype.setLayoutProperty<"text-field">>[2];

/** Ortsnamen auf Deutsch statt `name_en` (Plan 0008, E16); nach jedem `style.load`, also auch nach dem Stilwechsel. */
function germanLabels(map: MapLibre) {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    const current = map.getLayoutProperty(layer.id, "text-field");
    const german = germanTextField(current);
    if (german === current) continue;
    // `as` begründet: germanTextField durchläuft den Ausdruck als JSON (unknown) und setzt nur einen
    // coalesce-Ausdruck aus `get`-Zeichenketten ein; das Ergebnis ist wieder ein text-field (labels.test.ts).
    // MapLibre validiert den Wert zur Laufzeit zusätzlich; ein ungültiger käme als `error`-Ereignis.
    map.setLayoutProperty(layer.id, "text-field", german as TextField);
  }
}

/**
 * Grundkarte in App-Farben (Plan 0024, E1–E3); nach jedem `style.load`, vor den eigenen Layern. Nur Paint und
 * Sichtbarkeit, kein Request. Rein optisch: Ist ein Token kein Hex (`mixHex` wirft), bleibt die Grundkarte von
 * OpenFreeMap, statt die Karte in den Fehlerzustand zu schicken. Einen Wert, den MapLibre ablehnt, meldet es als
 * `error`-Ereignis; vor `load` zeigte das den Kachel-Hinweis. Die Werte sind Hex-Farben (basemap.test.ts, E2E).
 */
function tintBasemap(map: MapLibre, tokens: MapTokens, dark: boolean) {
  let palette: ReturnType<typeof basemapPalette>;
  try {
    palette = basemapPalette(tokens, dark);
  } catch {
    return;
  }
  for (const change of basemapChanges(map.getStyle().layers, palette)) {
    if ("hide" in change) {
      map.setLayoutProperty(change.id, "visibility", "none");
      continue;
    }
    for (const name of BASEMAP_PAINT) {
      const color = change.paint[name];
      if (color) map.setPaintProperty(change.id, name, color);
    }
  }
}

/** Tipp: nächster Ort oder Cluster im 44-px-Rechteck. Cluster zoomt auf (öffentlicher Zielpunkt), Ort meldet sich. */
function onTap(map: MapLibre, { x, y }: { x: number; y: number }, onPlace: (key: string) => void) {
  const box: [PointLike, PointLike] = [
    [x - TAP_PX, y - TAP_PX],
    [x + TAP_PX, y + TAP_PX],
  ];
  const hits = map.queryRenderedFeatures(box, { layers: PLACE_LAYERS }).flatMap((feature) => {
    if (feature.geometry.type !== "Point") return [];
    const [lon = 0, lat = 0] = feature.geometry.coordinates;
    const center: [number, number] = [lon, lat];
    return [{ ...map.project(center), value: { center, properties: feature.properties } }];
  });
  const hit = nearestHit(hits, { x, y });
  if (!hit) return;
  const clusterId: unknown = hit.properties["cluster_id"];
  const key: unknown = hit.properties["key"];
  if (typeof clusterId === "number") {
    // Ohne `essential`: Bei reduzierter Bewegung springt die Karte (E11). Ein verschwundener Cluster ist egal.
    map
      .getSource<GeoJSONSource>("orte")
      ?.getClusterExpansionZoom(clusterId)
      .then(
        (zoom) => map.easeTo({ center: hit.center, zoom }),
        () => undefined,
      );
  } else if (typeof key === "string") {
    onPlace(key);
  }
}

export function MapView(props: MapViewProps) {
  const { places, origin, dark } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre>(undefined);
  // Die Karte entsteht einmal je Mount; Daten und Callbacks liest sie über diese Ref.
  const latest = useRef(props);
  latest.current = props;
  const shownOrigin = useRef(origin);
  const shownDark = useRef(dark);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const start = latest.current;
    let map: MapLibre;
    try {
      map = new MapLibre({
        container: el,
        style: styleUrl(start.dark),
        transformRequest: guardTileRequest,
        // Attribution aus der TileJSON von OpenFreeMap (genau einmal, W1). Ohne `compact`: MapLibre klappt sie
        // auf Karten ≤ 640 px nach dem ersten Verschieben zum „i“ ein, beim Öffnen steht sie ausgeschrieben.
        attributionControl: {},
        // Handy: zwei Finger bewegen die Karte, einer scrollt die Seite (E7)
        cooperativeGestures: true,
        locale: LOCALE,
        // ohne Kompass gäbe es keinen Weg zurück nach Norden
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        ...cameraOptions(start.start),
      });
    } catch {
      start.onProblem("webgl");
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }));
    // Begründete Ausnahme von „E2E ist Black-Box“ (Plan 0005, E13): nur im E2E-Build, im Deploy-Build entfernt.
    if (__E2E__) Object.assign(window, { __zpMap: map });

    let loaded = false;
    const fail = () => latest.current.onProblem("kacheln");
    const timer = setTimeout(() => loaded || fail(), LOAD_TIMEOUT_MS);
    map.on("load", () => {
      loaded = true;
      clearTimeout(timer);
    });
    // Ein eigener error-Listener verhindert MapLibres console.error. Eine fehlende Kachel nach `load` ist egal (E12).
    map.on("error", () => loaded || fail());
    // Dauerhaft, nicht `once`: Auch nach jedem Stilwechsel kommen deutsche Beschriftung und eigene Layer neu dazu (E10).
    map.on("style.load", () => {
      germanLabels(map);
      const tokens = readMapTokens();
      addCategoryImages(map, tokens.onColor);
      addOwnLayers(map, tokens, {
        places: placesToFeatures(latest.current.places),
        origin: originToFeatures(latest.current.origin),
      });
      // Nach den eigenen Layern: Paint ändert die Reihenfolge nicht, und ein Fehler hier kostet nur die Farben.
      tintBasemap(map, tokens, latest.current.dark);
    });
    map.once("idle", () =>
      latest.current.onReady(() => {
        const { lat, lng } = map.getCenter();
        return { lat, lon: lng };
      }),
    );
    map.on("click", (e) => onTap(map, e.point, (key) => latest.current.onPlace(key)));
    for (const id of PLACE_LAYERS) {
      map.on("mouseenter", id, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
      });
    }
    return () => {
      clearTimeout(timer);
      lastCamera = { center: map.getCenter(), zoom: map.getZoom() };
      mapRef.current = undefined;
      if (__E2E__) Object.assign(window, { __zpMap: undefined });
      map.remove();
    };
  }, []);

  // Filterwechsel: nur die Daten tauschen, die Kamera bleibt (E9).
  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>("orte")?.setData(placesToFeatures(places));
  }, [places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getSource<GeoJSONSource>("startpunkt")?.setData(originToFeatures(origin));
    const before = shownOrigin.current;
    shownOrigin.current = origin;
    // Nur ein Stadtteil bewegt die Kamera (grob, öffentlich). Standort und Kartenmitte werden nur gezeichnet.
    if (origin?.source === "stadtteil" && origin.districtId !== before?.districtId) {
      map.easeTo({ center: lngLat(origin.point), zoom: DISTRICT_ZOOM });
    }
  }, [origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownDark.current === dark) return;
    shownDark.current = dark;
    // Ohne diff: false vergliche MapLibre die Stile, entfernte die eigenen Layer und löste kein style.load aus (E10).
    map.setStyle(styleUrl(dark), { diff: false });
  }, [dark]);

  return <div ref={container} className="map-canvas" />;
}
