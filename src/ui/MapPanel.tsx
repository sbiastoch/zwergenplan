/**
 * Kartenansicht von „Entdecken“, Teil im Startbundle (Plan 0005, E2/E3/E12): nur Platzhalter in
 * Kartenhöhe und der Lader für die Karten-Oberfläche (karte/MapScreen.tsx). Die Oberfläche lädt
 * ihrerseits MapLibre (map/MapView.tsx); ohne WebGL oder Kacheln bleibt die Orts-Liste bedienbar,
 * ohne beide Chunks bleibt der Umschalter „Liste“.
 */
import type { ComponentType } from "react";
import { LoadFailed, useLazy } from "./Lazy.tsx";
import type { MapScreenProps } from "./map-types.ts";

async function loadScreen(): Promise<ComponentType<MapScreenProps>> {
  return (await import("./karte/MapScreen.tsx")).MapScreen;
}

export function MapPanel(props: MapScreenProps) {
  const { module, attempt, retry } = useLazy(loadScreen);
  if (module.kind === "da") return <module.View {...props} />;
  /*
   * Platzhalter in Kartenhöhe: kein Sprung, wenn die Oberfläche kommt (CLS). Beim Laden hält `.map-rest` darunter
   * Platz für Werkzeugzeile, Hinweis und den Anfang der Orts-Liste frei: Auf der Merkliste ist der Kopf kurz, ohne ihn
   * schrumpfte das Dokument beim Einhängen auf die Viewport-Höhe, und die Seite sprang nach oben (Browser-Review 0025,
   * M1).
   */
  return (
    <>
      <div className="map-box" data-state={module.kind}>
        {module.kind === "laden" ? (
          <p className="map-note">Karte wird geladen …</p>
        ) : (
          <LoadFailed attempt={attempt} retry={retry}>
            Die Karte konnte nicht geladen werden. Alle Angebote stehen in der Liste.
          </LoadFailed>
        )}
      </div>
      {module.kind === "laden" && <div className="map-rest" aria-hidden="true" />}
    </>
  );
}
