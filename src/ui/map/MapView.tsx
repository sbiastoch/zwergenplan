/**
 * Die Karte (Plan 0005, E2/E6/E9/E10): lädt nur per `import()` aus karte/MapScreen.tsx. Nur src/ui/map/
 * kennt maplibre-gl (`maplibre-only-in-map`). Kamera-Regel (ADR 0039, ersetzt ADR 0008): Mit Startpunkt startet
 * die Karte 2 km darum und fährt bei einem neuen Startpunkt dorthin; die Merklisten-Karte nicht. Der Rückfall ohne
 * Orte im Umkreis und „Alle zeigen“ nutzen nur öffentliche Daten (alle kommenden Orte).
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
import { type StartCamera, zoomForRadius } from "../../domain/camera.ts";
import type { GeoPoint } from "../../domain/geo.ts";
import type { MapLayer, MapViewProps } from "../map-types.ts";
import { BASEMAP_PAINT, basemapChanges, basemapPalette, type MapTokens } from "./basemap.ts";
import {
  nearestHit,
  originToFeatures,
  placesToFeatures,
  providerPlacesToFeatures,
  selectionToFeatures,
} from "./geojson.ts";
import { germanTextField } from "./labels.ts";
import { addOwnLayers, LOCALE, PLACE_LAYERS, PROVIDER_LAYERS, readMapTokens } from "./layers.ts";
import { addCategoryImages, addProviderImages } from "./marker-images.ts";
import { revealOffset } from "./reveal.ts";

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
/**
 * Freiraum unten für die beim Öffnen ausgeschriebene Attribution (Browser-Review 0024, m4): auf schmalen Karten
 * zwei Zeilen, 56 px hoch, 10 px Abstand von MapLibre (map-overrides.css). Sonst lägen untere Marker darunter.
 */
const ATTRIBUTION_INSET = 66;

/**
 * Quellenangabe einklappen (Plan 0056, E3; ADR 0039): 5 s nach `load`, wie es die OSMF Attribution Guidelines erlauben
 * („automatically after five seconds“). Nachgebildet ist MapLibres `_updateCompactMinimize`: Nur die Klasse fällt weg,
 * `open` bleibt, ein Tipp auf „i“ klappt sie wieder auf (Review 2, N5). Im E2E-Build gilt `__zpAttributionMs`, sonst
 * eine Stunde, damit Tests die ausgeschriebene Angabe sicher sehen (N6).
 */
const ATTRIBUTION_COLLAPSE_MS = 5000;
const collapseDelay = () => (__E2E__ ? (globalThis.__zpAttributionMs ?? 3_600_000) : ATTRIBUTION_COLLAPSE_MS);
/**
 * Freiraum links für den Knopf „Karte groß zeigen“ oben links (Plan 0059, E3; CI-Befund: Marker lagen auf kleinen
 * Geräten darunter): 44 px Knopf + 10 px Abstand. Wie `ZOOM_CONTROL_INSET` für jeden Startausschnitt gleich.
 */
const GROW_CONTROL_INSET = 54;
/** Rand um die Marker; reicht für Cluster (18 + 2 px) und Zahl-Badge (bis ≈ 28 px vom Mittelpunkt) */
const MARKER_INSET = 32;
const START_PADDING = {
  top: MARKER_INSET,
  right: MARKER_INSET + ZOOM_CONTROL_INSET,
  bottom: MARKER_INSET + ATTRIBUTION_INSET,
  left: MARKER_INSET + GROW_CONTROL_INSET,
};
/**
 * Anbieterkarte (Plan 0055, N7): niedriger (höchstens 250 px), daher ein festes, knapperes Padding; rechts weiter
 * Platz für die Zoom-Knöpfe, unten für die ausgeschriebene Attribution (sonst lag quer ein Marker darunter,
 * Browser-Review 0055). Hängt wie `START_PADDING` an nichts Privatem (ADR 0008).
 */
const PROVIDER_PADDING = {
  top: 24,
  right: 24 + ZOOM_CONTROL_INSET,
  bottom: 24 + ATTRIBUTION_INSET,
  left: 24 + GROW_CONTROL_INSET,
};
const START_MAX_ZOOM = 14;

type Kind = MapLayer["kind"];

/**
 * Zuletzt gesehener Ausschnitt dieser Sitzung; nie in URL oder Speicher (E9). Nur die Angebotskarte merkt ihn: Die
 * Anbieterkarte startet immer im Startausschnitt, sonst schrumpfte die Liste beim Zurückkehren ohne Eingabe (N8).
 * Er gilt nur beim selben Startpunkt (`startKey`); ein neuer Startpunkt startet am neuen Ort (Plan 0056, M6, N12).
 */
let lastCamera: { center: LngLatLike; zoom: number; key: string | undefined } | undefined;

const paddingOf = (kind: Kind) => (kind === "anbieter" ? PROVIDER_PADDING : START_PADDING);

/** Mitte mit Radius: Zoom aus der kürzeren Kante der Karte, höchstens `START_MAX_ZOOM` (Plan 0056, E6, N3) */
function aroundOptions(camera: { around: GeoPoint; radiusKm: number }, el: HTMLElement) {
  const edge = Math.max(1, Math.min(el.clientWidth, el.clientHeight));
  const zoom = Math.min(START_MAX_ZOOM, zoomForRadius(camera.around.lat, camera.radiusKm, edge));
  return { center: lngLat(camera.around), zoom };
}

/**
 * Ausschnitt beim Öffnen (E9): der dieser Sitzung beim selben Startpunkt, sonst `start` aus `initialCamera`. Als
 * Konstruktor-Option, damit vorher kein anderer Ausschnitt Kacheln lädt.
 */
function cameraOptions(start: StartCamera, kind: Kind, key: string | undefined, el: HTMLElement): Partial<MapOptions> {
  if (lastCamera && kind === "angebote" && lastCamera.key === key) {
    return { center: lastCamera.center, zoom: lastCamera.zoom };
  }
  if ("center" in start) return { center: lngLat(start.center), zoom: start.zoom };
  if ("around" in start) return aroundOptions(start, el);
  const { minLat, minLon, maxLat, maxLon } = start.bounds;
  return {
    bounds: [minLon, minLat, maxLon, maxLat],
    fitBoundsOptions: { padding: paddingOf(kind), maxZoom: START_MAX_ZOOM },
  };
}

/** Quelle und Trefferlayer je Karte */
const SOURCE: Record<Kind, string> = { angebote: "orte", anbieter: "anbieter-orte" };
const TAP_LAYERS: Record<Kind, string[]> = { angebote: PLACE_LAYERS, anbieter: PROVIDER_LAYERS };

function featuresOf(layer: MapLayer) {
  return layer.kind === "anbieter" ? providerPlacesToFeatures(layer.places) : placesToFeatures(layer.places);
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
 * Grundkarte in App-Farben (Plan 0024, E1–E3); nach jedem `style.load`, vor den eigenen Layern. Nur Paint,
 * Sichtbarkeit sowie Layout und Filter der Beschriftung (Browser-Review 0024, m3), kein Request. Rein optisch: Ist ein Token kein Hex (`mixHex` wirft), bleibt die Grundkarte von
 * OpenFreeMap, statt die Karte in den Fehlerzustand zu schicken. Einen Wert, den MapLibre ablehnt, meldet es als
 * `error`-Ereignis; vor `load` zeigte das den Kachel-Hinweis. Die Werte sind Hex-Farben (basemap.test.ts, E2E);
 * Layout und Filter gegen die echten OpenFreeMap-Stile mit `validateStyleMin` geprüft (2026-10-08).
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
    // `undefined` setzt auf den Standard zurück: durchgezogen
    if (change.solid) map.setPaintProperty(change.id, "line-dasharray", undefined);
    if (change.mixedCase) map.setLayoutProperty(change.id, "text-transform", "none");
    if (change.street) {
      map.setLayoutProperty(change.id, "text-transform", change.street.layout["text-transform"]);
      map.setLayoutProperty(change.id, "text-size", change.street.layout["text-size"]);
      if (change.street.filter) map.setFilter(change.id, change.street.filter);
    }
  }
}

/** Tipp: nächster Ort oder Cluster im 44-px-Rechteck. Cluster zoomt auf (öffentlicher Zielpunkt), Ort meldet sich. */
function onTap(map: MapLibre, kind: Kind, { x, y }: { x: number; y: number }, onPlace: (key: string) => void) {
  const box: [PointLike, PointLike] = [
    [x - TAP_PX, y - TAP_PX],
    [x + TAP_PX, y + TAP_PX],
  ];
  const hits = map.queryRenderedFeatures(box, { layers: TAP_LAYERS[kind] }).flatMap((feature) => {
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
      .getSource<GeoJSONSource>(SOURCE[kind])
      ?.getClusterExpansionZoom(clusterId)
      .then(
        (zoom) => map.easeTo({ center: hit.center, zoom }),
        () => undefined,
      );
  } else if (typeof key === "string") {
    onPlace(key);
  }
}

/** Fährt auf einen Ausschnitt; bei reduzierter Bewegung springt MapLibre selbst */
function moveTo(map: MapLibre, camera: StartCamera, kind: Kind) {
  if ("center" in camera) {
    map.easeTo({ center: lngLat(camera.center), zoom: camera.zoom });
    return;
  }
  if ("around" in camera) {
    map.easeTo(aroundOptions(camera, map.getContainer()));
    return;
  }
  const { minLat, minLon, maxLat, maxLon } = camera.bounds;
  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding: paddingOf(kind), maxZoom: START_MAX_ZOOM },
  );
}

export function MapView(props: MapViewProps) {
  const { layer, origin, dark, resetKey, startKey, big, selected } = props;
  // je Mount fest: Angebots- und Anbieterkarte sind getrennte Mounts (Plan 0055, E5)
  const kind = useRef(layer.kind).current;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre>(undefined);
  // Die Karte entsteht einmal je Mount; Daten und Callbacks liest sie über diese Ref.
  const latest = useRef(props);
  latest.current = props;
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
        // Attribution aus der TileJSON von OpenFreeMap (genau einmal, W1). `compact` auch auf breiten Karten: Beim
        // Öffnen steht sie ausgeschrieben, nach dem ersten Verschieben oder nach 5 s nur noch das „i“ (Plan 0056, E3).
        attributionControl: { compact: true },
        // Handy: zwei Finger bewegen die Karte, einer scrollt die Seite (E7); groß bewegt einer (Plan 0059, E2)
        cooperativeGestures: !start.big,
        locale: LOCALE,
        // ohne Kompass gäbe es keinen Weg zurück nach Norden
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        ...cameraOptions(start.start, kind, start.startKey, el),
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
    let collapse: ReturnType<typeof setTimeout> | undefined;
    map.on("load", () => {
      loaded = true;
      clearTimeout(timer);
      collapse = setTimeout(
        () =>
          el.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact")?.classList.remove("maplibregl-compact-show"),
        collapseDelay(),
      );
    });
    // Ein eigener error-Listener verhindert MapLibres console.error. Eine fehlende Kachel nach `load` ist egal (E12).
    map.on("error", () => loaded || fail());
    // Dauerhaft, nicht `once`: Auch nach jedem Stilwechsel kommen deutsche Beschriftung und eigene Layer neu dazu (E10).
    map.on("style.load", () => {
      germanLabels(map);
      const tokens = readMapTokens();
      if (kind === "anbieter") {
        addProviderImages(map, { surface: tokens.surface, line: tokens.line, shadow: tokens.shadowColor });
      } else {
        addCategoryImages(map, tokens.onColor);
      }
      addOwnLayers(map, tokens, {
        kind,
        places: featuresOf(latest.current.layer),
        origin: originToFeatures(latest.current.origin),
        selection: selectionToFeatures(latest.current.layer.places, latest.current.selected),
      });
      // Nach den eigenen Layern: Paint ändert die Reihenfolge nicht, und ein Fehler hier kostet nur die Farben.
      tintBasemap(map, tokens, latest.current.dark);
    });
    map.once("idle", () => latest.current.onReady());
    // Ausschnitt für die Liste der Anbieterkarte (Plan 0055, E4): nach `load` und nach jeder Bewegung, nicht je Frame
    const viewport = () => {
      const bounds = map.getBounds();
      latest.current.onViewport?.({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    };
    map.on("load", viewport);
    map.on("moveend", viewport);
    map.on("click", (e) => onTap(map, kind, e.point, (key) => latest.current.onPlace(key)));
    for (const id of TAP_LAYERS[kind]) {
      map.on("mouseenter", id, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
      });
    }
    return () => {
      clearTimeout(timer);
      clearTimeout(collapse);
      if (kind === "angebote") {
        lastCamera = { center: map.getCenter(), zoom: map.getZoom(), key: latest.current.startKey };
      }
      mapRef.current = undefined;
      if (__E2E__) Object.assign(window, { __zpMap: undefined });
      map.remove();
    };
  }, [kind]);

  // Filterwechsel: nur die Daten tauschen, die Kamera bleibt (E9).
  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>(SOURCE[kind])?.setData(featuresOf(layer));
  }, [layer, kind]);

  // „Alle zeigen“ (Plan 0055, N9): auf den Rahmen über alle Orte (Plan 0056, N11); bei reduzierter Bewegung springt
  // MapLibre selbst
  const shownReset = useRef(resetKey);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownReset.current === resetKey) return;
    shownReset.current = resetKey;
    moveTo(map, latest.current.overview, kind);
  }, [resetKey, kind]);

  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>("startpunkt")?.setData(originToFeatures(origin));
  }, [origin]);

  // Groß bewegt ein Finger die Karte, klein zwei (Plan 0059, E2): Im Vollbild gibt es keine Seite zu scrollen.
  useEffect(() => {
    const gestures = mapRef.current?.cooperativeGestures;
    if (big) gestures?.disable();
    else gestures?.enable();
  }, [big]);

  // Auswahl-Ring am getippten Ort (Plan 0059, E5). Neu gewählt in der großen Karte: liegt er unter dem Sheet, fährt
  // die Karte ihn darüber; bei reduzierter Bewegung springt MapLibre selbst.
  const shownSelected = useRef<string>(undefined);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getSource<GeoJSONSource>("auswahl")?.setData(selectionToFeatures(layer.places, selected));
    if (selected === shownSelected.current) return;
    shownSelected.current = selected;
    const place = layer.places.find((p) => p.key === selected);
    if (!place || !latest.current.big || !latest.current.revealSelected) return;
    const center = lngLat(place.geo);
    const offset = revealOffset(map.project(center).y, map.getContainer().clientHeight);
    if (offset) map.easeTo({ center, offset });
  }, [selected, layer]);

  // Neuer Startpunkt bei offener Karte: Sie fährt auf den neuen Startausschnitt, auf allen Karten außer der
  // Merkliste (Plan 0056, E6; ADR 0039). Derselbe Startpunkt noch einmal bewegt nichts (N12).
  const shownStartKey = useRef(startKey);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownStartKey.current === startKey) return;
    shownStartKey.current = startKey;
    moveTo(map, latest.current.start, kind);
  }, [startKey, kind]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownDark.current === dark) return;
    shownDark.current = dark;
    // Ohne diff: false vergliche MapLibre die Stile, entfernte die eigenen Layer und löste kein style.load aus (E10).
    map.setStyle(styleUrl(dark), { diff: false });
  }, [dark]);

  return <div ref={container} className="map-canvas" />;
}
