/**
 * Karten-Oberfläche (Plan 0005, E7/E8/E12), eigener Lazy-Chunk ohne MapLibre: Kartenrahmen mit
 * Zuständen, Werkzeugzeile, Hinweis, Orts-Liste und Orts-Sheet. Die Karte selbst (map/MapView.tsx)
 * lädt erst von hier; ohne WebGL, ohne Kacheln oder ohne Karten-Chunk bleibt alles hier bedienbar.
 */
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import type { GeoPoint } from "../../domain/geo.ts";
import type { Place } from "../../domain/places.ts";
import type { SiteOffer } from "../../domain/site-data.ts";
import { Dialog } from "../Dialog.tsx";
import { LoadFailed, useLazy } from "../Lazy.tsx";
import { NoOffers } from "../ListView.tsx";
import type { MapProblem, MapScreenProps, MapViewProps } from "../map-types.ts";
import { mapData } from "./map-data.ts";
import { PlaceList } from "./PlaceList.tsx";
import { PlaceSheet } from "./PlaceSheet.tsx";

async function loadMapView(): Promise<ComponentType<MapViewProps>> {
  return (await import("../map/MapView.tsx")).MapView;
}

const NOTES: Record<MapProblem, string> = {
  webgl: "Dein Browser kann die Karte nicht zeigen.",
  kacheln: "Kartenbilder lassen sich gerade nicht laden.",
};

export function MapScreen(props: MapScreenProps) {
  const { offers, cameraOffers, origin, reach, ctx, onSheetOpen } = props;
  const { places, start } = useMemo(
    () => mapData(offers, cameraOffers, origin, reach),
    [offers, cameraOffers, origin, reach],
  );
  const { module, attempt, retry } = useLazy(loadMapView);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<MapProblem>();
  // „Nochmal versuchen“ bei Kachel-Fehlern baut die Karte neu auf
  const [build, setBuild] = useState(0);
  const center = useRef<() => GeoPoint>(undefined);
  // Orts-Sheet: Sitzungszustand, nie in der URL (E5)
  const [placeKey, setPlaceKey] = useState<string>();
  const place = places.find((p) => p.key === placeKey);
  const state = module.kind === "fehler" || problem ? "fehler" : ready && module.kind === "da" ? "bereit" : "laden";

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
            places={places}
            start={start}
            origin={origin}
            dark={props.dark}
            onPlace={(key) => {
              const hit = places.find((p) => p.key === key);
              if (hit) openPlace(hit);
            }}
            onReady={(getCenter) => {
              center.current = getCenter;
              setReady(true);
            }}
            onProblem={setProblem}
          />
        )}
        {state === "bereit" && <span className="crosshair" aria-hidden="true" />}
        {state === "laden" && <p className="map-note">Karte wird geladen …</p>}
        {module.kind === "fehler" && (
          <LoadFailed attempt={attempt} retry={retry}>
            Die Karte konnte nicht geladen werden. Die Orte stehen unten in der Liste.
          </LoadFailed>
        )}
        {problem && (
          <p className="map-note">
            {NOTES[problem]} Die Orte stehen unten in der Liste.
            {problem === "kacheln" && (
              <button type="button" className="btn" onClick={rebuild}>
                Nochmal versuchen
              </button>
            )}
          </p>
        )}
      </div>
      <div className="map-tools">
        {state === "bereit" && (
          <button type="button" className="btn" onClick={() => center.current && props.onMapCenter(center.current())}>
            Kartenmitte als Startpunkt
          </button>
        )}
        <button type="button" className="btn" onClick={props.onPickOrigin}>
          {origin ? `Startpunkt: ${origin.label}` : "Startpunkt wählen"}
        </button>
      </div>
      <p className="small">Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät.</p>
      {places.length > 0 ? (
        <PlaceList places={places} reachOf={ctx.reachOf} reachPending={ctx.reachPending} onPlace={openPlace} />
      ) : (
        <NoOffers hasData={props.hasData} onResetFilter={props.onResetFilter} />
      )}
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
