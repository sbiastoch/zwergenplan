/**
 * Anbieterkarte im Tab „Anbieter“ (Plan 0055, E4, E5; Mockup C), im Karten-Chunk ohne MapLibre: Kartenrahmen mit
 * Zuständen und das Orts-Sheet. Die Karte selbst (map/MapView.tsx) lädt erst von hier. Meldet den Ausschnitt an die
 * Liste (`onInView`); ohne Karte (WebGL, Kacheln, Chunk) meldet sie `undefined`, und die Liste zeigt alle.
 */
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Bounds,
  mapUpcoming,
  providerCamera,
  providerGeometry,
  providerPlaces,
  providersInBounds,
  providersWithPlace,
} from "../../domain/provider-places.ts";
import { Dialog } from "../Dialog.tsx";
import { LoadFailed, useLazy } from "../Lazy.tsx";
import type { MapLayer, MapProblem, MapViewProps, ProviderMapScreenProps } from "../map-types.ts";
import { ProviderPlaceSheet } from "./ProviderPlaceSheet.tsx";

async function loadMapView(): Promise<ComponentType<MapViewProps>> {
  return (await import("../map/MapView.tsx")).MapView;
}

const NOTES: Record<MapProblem, string> = {
  webgl: "Dein Browser kann die Karte nicht zeigen.",
  kacheln: "Kartenbilder lassen sich gerade nicht laden.",
};

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function ProviderMapScreen(props: ProviderMapScreenProps) {
  const { directory, offers, visible, now, onInView, onSheetOpen, onOpenProvider } = props;
  // wie die Liste: kommend ohne Filter und ohne laufende Kurse (N3)
  const upcoming = useMemo(() => mapUpcoming(offers, now), [offers, now]);
  // Geometrie ohne Filter, Alter und Suche: Startausschnitt und „im Ausschnitt“ hängen nur daran (E2, ADR 0038)
  const geometry = useMemo(
    () => providerGeometry({ providers: directory.providers, upcoming }),
    [directory.providers, upcoming],
  );
  const start = useMemo(() => providerCamera(geometry), [geometry]);
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
  const state = module.kind === "fehler" || problem ? "fehler" : ready && module.kind === "da" ? "bereit" : "laden";

  // Ausschnitt: nur bei einer Änderung der Menge melden, das spart Re-Render der Liste (E4)
  const bounds = useRef<Bounds>(undefined);
  const reported = useRef<ReadonlySet<string>>(undefined);
  const report = useCallback(() => {
    if (!bounds.current) return;
    const inView = providersInBounds(geometry, bounds.current);
    if (reported.current && sameSet(reported.current, inView)) return;
    reported.current = inView;
    onInView({ inView, known });
  }, [geometry, known, onInView]);
  // neue Geometrie (Datenstand, Mitternacht): neu rechnen, ohne auf die nächste Bewegung zu warten
  useEffect(() => {
    reported.current = undefined;
    report();
  }, [report]);
  // Fehler und Abbau: kein veralteter Ausschnitt filtert die Liste (Review M4)
  const failed = state === "fehler";
  useEffect(() => {
    if (!failed) return;
    bounds.current = undefined;
    reported.current = undefined;
    onInView(undefined);
  }, [failed, onInView]);
  useEffect(() => () => onInView(undefined), [onInView]);

  useEffect(() => {
    onSheetOpen(place !== undefined);
  }, [place, onSheetOpen]);
  useEffect(() => () => onSheetOpen(false), [onSheetOpen]);

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
      <div className="map-box anbieter" data-state={state}>
        {module.kind === "da" && !problem && (
          <module.View
            key={build}
            layer={layer}
            start={start}
            origin={props.origin}
            dark={props.dark}
            onPlace={(key) => {
              const hit = places.find((p) => p.key === key);
              const [only, ...more] = hit?.providers ?? [];
              // ein Anbieter: gleich sein Sheet, mehrere: das Orts-Sheet (E4)
              if (only && more.length === 0) onOpenProvider(only.id);
              else if (hit) setPlaceKey(hit.key);
            }}
            onReady={() => setReady(true)}
            onProblem={setProblem}
            onViewport={(next) => {
              bounds.current = next;
              report();
            }}
            resetKey={props.resetKey}
          />
        )}
        {state === "laden" && <p className="map-note">Karte wird geladen …</p>}
        {module.kind === "fehler" && (
          <LoadFailed attempt={attempt} retry={retry}>
            Die Karte konnte nicht geladen werden. Alle Anbieter stehen in der Liste.
          </LoadFailed>
        )}
        {problem && (
          <p className="map-note">
            {NOTES[problem]} Alle Anbieter stehen in der Liste.
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
        className="sheet"
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
