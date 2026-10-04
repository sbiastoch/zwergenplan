/**
 * Die Karte (Plan 0005, E2/E6/E9/E10): lädt nur per `import()` aus MapPanel.tsx. Einzige Stelle, die
 * maplibre-gl kennt (`maplibre-only-in-map`). Kamera-Regel (ADR 0008): Die Karte fährt nie auf einen
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
import { ATTRIBUTION, guardTileRequest, styleUrl } from "../../data/tiles.ts";
import type { GeoPoint } from "../../domain/geo.ts";
import type { Origin } from "../../domain/reach.ts";
import type { MapViewProps } from "../map-types.ts";
import { nearestHit, originToFeatures, placesToFeatures } from "./geojson.ts";
import { addOwnLayers, LOCALE, PLACE_LAYERS, readMapColors } from "./layers.ts";

// Die Worker-URL aus import.meta.url stimmt nach dem Bündeln nicht mehr (Spike, E2).
setWorkerUrl(workerUrl);

const lngLat = ({ lat, lon }: GeoPoint): [number, number] => [lon, lat];

/** Hauptmarkt, wenn es keine Orte gibt */
const HOME = { center: lngLat({ lat: 49.454, lon: 11.077 }), zoom: 11 };
const DISTRICT_ZOOM = 13;
/** ohne `load` bis dahin: Kartenbilder lassen sich nicht laden (E12) */
const LOAD_TIMEOUT_MS = 15_000;
/** halbe Kantenlänge des Tipp-Rechtecks: effektiv 44 px (E6) */
const TAP_PX = 22;

/** Zuletzt gesehener Ausschnitt dieser Sitzung; nie in URL oder Speicher (E9). */
let lastCamera: { center: LngLatLike; zoom: number } | undefined;

/** Ausschnitt beim Öffnen (E9): Sitzung, sonst Stadtteil, sonst alle Orte (öffentliche Daten). */
function startCamera(places: MapViewProps["places"], origin: Origin | undefined): Partial<MapOptions> {
  if (lastCamera) return lastCamera;
  if (origin?.source === "stadtteil") return { center: lngLat(origin.point), zoom: DISTRICT_ZOOM };
  if (places.length === 0) return HOME;
  const lats = places.map((p) => p.geo.lat);
  const lons = places.map((p) => p.geo.lon);
  return {
    bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
    fitBoundsOptions: { padding: 32, maxZoom: 14 },
  };
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
        attributionControl: { compact: false, customAttribution: ATTRIBUTION },
        // Handy: zwei Finger bewegen die Karte, einer scrollt die Seite (E7)
        cooperativeGestures: true,
        locale: LOCALE,
        // ohne Kompass gäbe es keinen Weg zurück nach Norden
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        ...startCamera(start.places, start.origin),
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
    // Dauerhaft, nicht `once`: Auch nach jedem Stilwechsel kommen die eigenen Layer neu dazu (E10).
    map.on("style.load", () =>
      addOwnLayers(map, readMapColors(), {
        places: placesToFeatures(latest.current.places),
        origin: originToFeatures(latest.current.origin),
      }),
    );
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
