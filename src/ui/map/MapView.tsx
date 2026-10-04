/**
 * Die Karte (Plan 0005, E2): lädt nur per `import()` aus MapPanel.tsx. Einzige Stelle, die
 * maplibre-gl kennt (`maplibre-only-in-map`).
 */
import { Map as MapLibre, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map-overrides.css"; // nach maplibre-gl.css (E4)
import { ATTRIBUTION, guardTileRequest, styleUrl } from "../../data/tiles.ts";
import type { MapViewProps } from "../map-types.ts";

// Die Worker-URL aus import.meta.url stimmt nach dem Bündeln nicht mehr (Spike, E2).
setWorkerUrl(workerUrl);

/** Hauptmarkt */
const HOME = { center: [11.077, 49.454] as [number, number], zoom: 11 };

export function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  // Die Karte entsteht einmal je Mount; Callbacks und Theme liest sie über die Ref.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let map: MapLibre;
    try {
      map = new MapLibre({
        container: el,
        style: styleUrl(latest.current.dark),
        transformRequest: guardTileRequest,
        attributionControl: { compact: false, customAttribution: ATTRIBUTION },
        ...HOME,
      });
    } catch {
      latest.current.onProblem("webgl");
      return;
    }
    // Ein eigener error-Listener verhindert MapLibres console.error (E12).
    map.on("error", () => {
      if (!map.loaded()) latest.current.onProblem("kacheln");
    });
    map.once("idle", () =>
      latest.current.onReady(() => {
        const { lat, lng } = map.getCenter();
        return { lat, lon: lng };
      }),
    );
    return () => map.remove();
  }, []);

  return <div ref={container} className="map-canvas" />;
}
