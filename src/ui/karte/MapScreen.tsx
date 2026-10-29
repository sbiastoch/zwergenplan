/**
 * Karten-Oberfläche (Plan 0005, E7/E12), eigener Lazy-Chunk ohne MapLibre: Kartenrahmen mit Zuständen und
 * Orts-Sheet. Die Liste darunter rendert `App` bzw. die Merkliste, gefiltert auf den Ausschnitt, den diese Karte
 * meldet (`onInView`, Plan 0056, E5); Werkzeugzeile, Hinweis und Orts-Liste entfallen (E3, E4). Die Karte selbst (map/MapView.tsx)
 * lädt erst von hier; ohne WebGL, ohne Kacheln oder ohne Karten-Chunk bleibt alles hier bedienbar.
 */
import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import type { Bounds } from "../../domain/map-view.ts";
import { placeKey as keyOf } from "../../domain/place-key.ts";
import { offersInBounds, type Place } from "../../domain/places.ts";
import type { SiteOffer } from "../../domain/site-data.ts";
import { Dialog } from "../Dialog.tsx";
import { LoadFailed, useLazy } from "../Lazy.tsx";
import type { MapLayer, MapProblem, MapScreenProps, MapViewProps } from "../map-types.ts";
import { mapData } from "./map-data.ts";
import { PlaceSheet } from "./PlaceSheet.tsx";
import { useInViewReport } from "./use-in-view.ts";

async function loadMapView(): Promise<ComponentType<MapViewProps>> {
  return (await import("../map/MapView.tsx")).MapView;
}

const NOTES: Record<MapProblem, string> = {
  webgl: "Dein Browser kann die Karte nicht zeigen.",
  kacheln: "Kartenbilder lassen sich gerade nicht laden.",
};

export function MapScreen(props: MapScreenProps) {
  const { offers, cameraOffers, origin, ctx, onSheetOpen, onInView } = props;
  const { places, start } = useMemo(() => mapData(offers, cameraOffers, origin), [offers, cameraOffers, origin]);
  // eigene Identität nur bei neuen Orten: Sonst tauschte MapView bei jedem Render die Daten (E9)
  const layer = useMemo((): MapLayer => ({ kind: "angebote", places }), [places]);
  const { module, attempt, retry } = useLazy(loadMapView);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<MapProblem>();
  // „Nochmal versuchen“ bei Kachel-Fehlern baut die Karte neu auf
  const [build, setBuild] = useState(0);
  // Orts-Sheet: Sitzungszustand, nie in der URL (E5)
  const [placeKey, setPlaceKey] = useState<string>();
  const place = places.find((p) => p.key === placeKey);
  const state = module.kind === "fehler" || problem ? "fehler" : ready && module.kind === "da" ? "bereit" : "laden";
  // Ausschnitt an die Liste unter der Karte, nach Orten (Plan 0056, E5)
  const known = useMemo(() => new Set(offers.map((o) => keyOf(o.venue.geo))), [offers]);
  const inBounds = useCallback((bounds: Bounds) => offersInBounds(offers, bounds), [offers]);
  const onViewport = useInViewReport(inBounds, known, state === "fehler", onInView);

  useEffect(() => {
    onSheetOpen(place !== undefined);
  }, [place, onSheetOpen]);
  useEffect(() => () => onSheetOpen(false), [onSheetOpen]);

  // Ort mit einem Angebot: gleich das Detail (E6)
  const openPlace = (p: Place<SiteOffer>) => {
    const [only, ...more] = p.offers;
    if (only && more.length === 0) ctx.onOpen(only);
    else setPlaceKey(p.key);
  };
  const rebuild = () => {
    setProblem(undefined);
    setReady(false);
    setBuild((n) => n + 1);
  };

  return (
    <>
      <div className="map-box" data-state={state}>
        {module.kind === "da" && !problem && (
          <module.View
            key={build}
            layer={layer}
            start={start}
            origin={origin}
            dark={props.dark}
            onPlace={(key) => {
              const hit = places.find((p) => p.key === key);
              if (hit) openPlace(hit);
            }}
            onReady={() => setReady(true)}
            onProblem={setProblem}
            onViewport={onViewport}
            resetKey={props.resetKey}
          />
        )}
        {state === "laden" && <p className="map-note">Karte wird geladen …</p>}
        {module.kind === "fehler" && (
          <LoadFailed attempt={attempt} retry={retry}>
            Die Karte konnte nicht geladen werden. Alle Angebote stehen unten in der Liste.
          </LoadFailed>
        )}
        {problem && (
          <p className="map-note">
            {NOTES[problem]} Alle Angebote stehen unten in der Liste.
            {problem === "kacheln" && (
              <button type="button" className="btn" onClick={rebuild}>
                Nochmal versuchen
              </button>
            )}
          </p>
        )}
      </div>
      <Dialog
        open={place !== undefined}
        onClose={() => setPlaceKey(undefined)}
        label={place?.names.join(" / ") ?? "Ort"}
        className="sheet"
        toast={props.toast}
      >
        {place && <PlaceSheet place={place} origin={origin} ctx={ctx} onClose={() => setPlaceKey(undefined)} />}
      </Dialog>
    </>
  );
}
