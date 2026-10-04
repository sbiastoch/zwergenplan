/**
 * Kartenansicht von „Entdecken“ (Plan 0005, E2/E7/E8/E12). Lädt den Karten-Code erst beim Mounten per
 * `import()`; `React.lazy` scheidet aus, weil es einen fehlgeschlagenen Import für immer behält.
 * Werkzeugzeile, Hinweis und Orts-Liste hängen nie an der Karte: Ohne WebGL, Netz oder Chunk bleibt
 * die Seite bedienbar.
 */
import { type ComponentType, useEffect, useRef, useState } from "react";
import type { StartCamera } from "../domain/camera.ts";
import type { GeoPoint } from "../domain/geo.ts";
import type { Place } from "../domain/places.ts";
import type { Origin, Reach } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { NoOffers } from "./ListView.tsx";
import type { MapProblem, MapViewProps } from "./map-types.ts";
import { PlaceList } from "./PlaceList.tsx";

type Module = { kind: "laden" } | { kind: "da"; View: ComponentType<MapViewProps> } | { kind: "fehler" };

/**
 * Eigene Funktion statt `import(…).then(ok, fail)`: Vite hängt die Handler dieser Form an den rohen
 * Import innerhalb seines Preload-Helfers. Scheitert dann das Karten-CSS, wirft der Helfer an den
 * Handlern vorbei (unbehandelte Ablehnung, Zustand bliebe „laden“). Mit `await` hängen sie am Ergebnis.
 */
async function loadMapView(): Promise<ComponentType<MapViewProps>> {
  return (await import("./map/MapView.tsx")).MapView;
}

/** Lädt MapView.tsx; `retry` ruft `import()` erneut auf. `attempt` zählt die Wiederholungen. */
function useMapModule(): { module: Module; attempt: number; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [module, setModule] = useState<Module>({ kind: "laden" });
  useEffect(() => {
    void attempt;
    let live = true;
    setModule({ kind: "laden" });
    // vite:preloadError wird bewusst nicht unterdrückt, sonst löste import() ohne Modul auf (E2).
    loadMapView().then(
      (View) => live && setModule({ kind: "da", View }),
      () => live && setModule({ kind: "fehler" }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return { module, attempt, retry: () => setAttempt((n) => n + 1) };
}

const NOTES: Record<MapProblem, string> = {
  webgl: "Dein Browser kann die Karte nicht zeigen.",
  kacheln: "Kartenbilder lassen sich gerade nicht laden.",
};

interface MapPanelProps {
  places: readonly Place<SiteOffer>[];
  /** Startausschnitt aus öffentlichen Daten (`useOfferViews().startCamera`) */
  start: StartCamera;
  origin: Origin | undefined;
  dark: boolean;
  reachOf: (offer: SiteOffer) => Reach | undefined;
  hasData: boolean;
  /** ein Angebot: Detail, sonst Orts-Sheet (entscheidet App) */
  onPlace: (place: Place<SiteOffer>) => void;
  /** öffnet das Kind-Sheet bei „Entfernung ab“ */
  onPickOrigin: () => void;
  onMapCenter: (center: GeoPoint) => void;
  onResetFilter: () => void;
}

export function MapPanel(props: MapPanelProps) {
  const { places, origin, onPlace } = props;
  const { module, attempt, retry } = useMapModule();
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<MapProblem>();
  // „Nochmal versuchen“ bei Kachel-Fehlern baut die Karte neu auf
  const [build, setBuild] = useState(0);
  const center = useRef<() => GeoPoint>(undefined);
  const state = module.kind === "fehler" || problem ? "fehler" : ready && module.kind === "da" ? "bereit" : "laden";
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
            start={props.start}
            origin={origin}
            dark={props.dark}
            onPlace={(key) => {
              const place = places.find((p) => p.key === key);
              if (place) onPlace(place);
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
          <p className="map-note">
            Die Karte konnte nicht geladen werden.
            {attempt === 0 ? (
              <button type="button" className="btn" onClick={retry}>
                Nochmal versuchen
              </button>
            ) : (
              // Mancher Browser merkt sich den fehlgeschlagenen Import; die URL behält ansicht=karte.
              <button type="button" className="btn" onClick={() => window.location.reload()}>
                Seite neu laden
              </button>
            )}
          </p>
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
        <PlaceList places={places} reachOf={props.reachOf} onPlace={onPlace} />
      ) : (
        <NoOffers hasData={props.hasData} onResetFilter={props.onResetFilter} />
      )}
    </>
  );
}
