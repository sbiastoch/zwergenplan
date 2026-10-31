/**
 * Anbieterkarte im Tab „Anbieter“ (Plan 0055, E4, E5; Mockup C), im Karten-Chunk ohne MapLibre: Kartenrahmen mit
 * Zuständen und das Orts-Sheet. Die Karte selbst (map/MapView.tsx) lädt erst von hier. Meldet den Ausschnitt an die
 * Liste (`onInView`); ohne Karte (WebGL, Kacheln, Chunk) meldet sie `undefined`, und die Liste zeigt alle.
 */
import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import { originKey } from "../../domain/camera.ts";
import type { Bounds } from "../../domain/map-view.ts";
import {
  mapUpcoming,
  providerCamera,
  providerGeometry,
  providerOverview,
  providerPlaces,
  providersInBounds,
  providersWithPlace,
} from "../../domain/provider-places.ts";
import { BigSlot } from "../BigMapBar.tsx";
import { Dialog } from "../Dialog.tsx";
import { LoadFailed, useLazy } from "../Lazy.tsx";
import type { MapLayer, MapProblem, MapViewProps, ProviderMapScreenProps } from "../map-types.ts";
import { ProviderPlaceSheet } from "./ProviderPlaceSheet.tsx";
import { useInViewReport } from "./use-in-view.ts";
import { useSelection } from "./use-selection.ts";

async function loadMapView(): Promise<ComponentType<MapViewProps>> {
  return (await import("../map/MapView.tsx")).MapView;
}

const LIST_REST = "Alle Anbieter stehen in der Liste.";
const BIG_REST = "Mit „Karte verkleinern“ stehen alle Anbieter in der Liste.";

const NOTES: Record<MapProblem, string> = {
  webgl: "Dein Browser kann die Karte nicht zeigen.",
  kacheln: "Kartenbilder lassen sich gerade nicht laden.",
};

export function ProviderMapScreen(props: ProviderMapScreenProps) {
  const { directory, offers, visible, now, onInView, onSheetOpen, onOpenProvider } = props;
  // wie die Liste: kommend ohne Filter und ohne laufende Kurse (N3)
  const upcoming = useMemo(() => mapUpcoming(offers, now), [offers, now]);
  // Geometrie ohne Filter, Alter und Suche: Startausschnitt und „im Ausschnitt“ hängen nur daran (E2, ADR 0038)
  const geometry = useMemo(
    () => providerGeometry({ providers: directory.providers, upcoming }),
    [directory.providers, upcoming],
  );
  // am Startpunkt, ohne Orte im Umkreis über alle (Plan 0056, E6; ADR 0039 ändert ADR 0038, Punkt 3 und 4)
  const start = useMemo(() => providerCamera(geometry, props.origin), [geometry, props.origin]);
  const overview = useMemo(() => providerOverview(geometry), [geometry]);
  const known = useMemo(() => providersWithPlace(geometry), [geometry]);
  const places = useMemo(
    () => providerPlaces({ providers: directory.providers, upcoming, visible }),
    [directory.providers, upcoming, visible],
  );
  const layer = useMemo((): MapLayer => ({ kind: "anbieter", places }), [places]);
  const { module, attempt, retry } = useLazy(loadMapView);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<MapProblem>();
  const [build, setBuild] = useState(0);
  // Orts-Sheet: Sitzungszustand, nie in der URL (E4)
  const [placeKey, setPlaceKey] = useState<string>();
  const place = places.find((p) => p.key === placeKey);
  const { selected, tap } = useSelection(placeKey, props.overlayOpen);
  const state = module.kind === "fehler" || problem ? "fehler" : ready && module.kind === "da" ? "bereit" : "laden";

  // Ausschnitt an die Liste (E4); neue Geometrie (Datenstand, Mitternacht) rechnet sofort neu
  const inBounds = useCallback((bounds: Bounds) => providersInBounds(geometry, bounds), [geometry]);
  const onViewport = useInViewReport(inBounds, known, state === "fehler", onInView);

  useEffect(() => {
    onSheetOpen(place !== undefined);
  }, [place, onSheetOpen]);
  useEffect(() => () => onSheetOpen(false), [onSheetOpen]);

  // In der großen Karte ist die Liste verborgen: Der Ausweg heißt „Karte verkleinern“ (Plan 0059, Review M6)
  const rest = props.big ? BIG_REST : LIST_REST;
  const rebuild = () => {
    setProblem(undefined);
    setReady(false);
    setBuild((n) => n + 1);
  };
  const open = (providerId: string) => {
    setPlaceKey(undefined);
    onOpenProvider(providerId);
  };

  return (
    <>
      <div className={props.big ? "map-box anbieter big" : "map-box anbieter"} data-state={state}>
        {module.kind === "da" && !problem && (
          <module.View
            key={build}
            layer={layer}
            start={start}
            overview={overview}
            startKey={originKey(props.origin)}
            origin={props.origin}
            dark={props.dark}
            onPlace={(key) => {
              const hit = places.find((p) => p.key === key);
              if (hit) tap(hit.key);
              const [only, ...more] = hit?.providers ?? [];
              // ein Anbieter: gleich sein Sheet, mehrere: das Orts-Sheet (E4)
              if (only && more.length === 0) onOpenProvider(only.id);
              else if (hit) setPlaceKey(hit.key);
            }}
            onReady={() => setReady(true)}
            onProblem={setProblem}
            onViewport={onViewport}
            resetKey={props.resetKey}
            big={props.big}
            selected={selected}
          />
        )}
        <BigSlot {...props} failed={state === "fehler"} />
        {state === "laden" && <p className="map-note">Karte wird geladen …</p>}
        {module.kind === "fehler" && (
          <LoadFailed attempt={attempt} retry={retry}>
            {`Die Karte konnte nicht geladen werden. ${rest}`}
          </LoadFailed>
        )}
        {problem && (
          <p className="map-note">
            {NOTES[problem]} {rest}
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
        label={place?.name ?? "Ort"}
        className={props.big ? "sheet over-map" : "sheet"}
        toast={props.toast}
      >
        {place && (
          <ProviderPlaceSheet
            place={place}
            saved={props.saved}
            bellBusy={props.bellBusy}
            onToggleSaved={props.onToggleSaved}
            onOpenProvider={open}
            onClose={() => setPlaceKey(undefined)}
          />
        )}
      </Dialog>
    </>
  );
}
