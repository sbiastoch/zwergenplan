/**
 * Karten, Teil im Startbundle (Plan 0005, E2/E3/E12; Plan 0055, E5): nur Platzhalter in Kartenhöhe und der Lader für
 * den Karten-Chunk (karte/entry.ts, ein Einstieg für beide Karten). Der Chunk lädt ihrerseits MapLibre
 * (map/MapView.tsx); ohne WebGL oder Kacheln bleibt die Orts- bzw. Anbieterliste bedienbar.
 * - `MapPanel`: Karte von „Entdecken“ und Merkliste.
 * - `ProviderMapPanel`: Anbieterkarte im Tab „Anbieter“ (Plan 0055), lädt mit dem Tab (ADR 0038).
 */
import type { ComponentType } from "react";
import { BigSlot } from "./BigMapBar.tsx";
import { LoadFailed, useLazy } from "./Lazy.tsx";
import type { KarteModule, MapScreenProps, ProviderMapScreenProps } from "./map-types.ts";
import { useProviderDirectory } from "./ProviderPanel.tsx";

/** Ausweg im Fehlerfall: In der großen Karte ist die Liste verborgen (Plan 0059, Review M6) */
const LIST_REST = { Angebote: "Alle Angebote stehen in der Liste.", Anbieter: "Alle Anbieter stehen in der Liste." };
const BIG_REST = {
  Angebote: "Mit „Karte verkleinern“ stehen alle Angebote in der Liste.",
  Anbieter: "Mit „Karte verkleinern“ stehen alle Anbieter in der Liste.",
};

/** Destrukturiert direkt am `import()`: So sieht knip, welche Exporte des Chunks genutzt werden. */
async function loadKarte(): Promise<KarteModule> {
  const { MapScreen, ProviderMapScreen } = await import("./karte/entry.ts");
  return { MapScreen, ProviderMapScreen };
}

async function loadScreen(): Promise<ComponentType<MapScreenProps>> {
  return (await loadKarte()).MapScreen;
}

async function loadProviderScreen(): Promise<ComponentType<ProviderMapScreenProps>> {
  return (await loadKarte()).ProviderMapScreen;
}

type ProviderMapPanelProps = Omit<ProviderMapScreenProps, "directory"> & {
  /** Datenstand von site.json */
  generatedAt: string;
};

/**
 * Anbieterkarte (Plan 0055, E4, E5): wartet auf Chunk und Katalog (`useProviderDirectory`, geteilt mit der Liste).
 * Scheitert der Katalog, zeigt sie nur einen Hinweis; „Nochmal versuchen“ steht in der Liste und lädt beide (N13).
 */
export function ProviderMapPanel({ generatedAt, ...props }: ProviderMapPanelProps) {
  const { module, attempt, retry } = useLazy(loadProviderScreen);
  const directory = useProviderDirectory(generatedAt);
  if (module.kind === "da" && directory.kind === "da") {
    return <module.View {...props} directory={directory.directory} />;
  }
  const failed = module.kind === "fehler" || directory.kind === "fehler";
  return (
    <div className={props.big ? "map-box anbieter big" : "map-box anbieter"} data-state={failed ? "fehler" : "laden"}>
      <BigSlot {...props} failed={failed} />
      {module.kind === "fehler" ? (
        <LoadFailed attempt={attempt} retry={retry}>
          {`Die Karte konnte nicht geladen werden. ${props.big ? BIG_REST.Anbieter : LIST_REST.Anbieter}`}
        </LoadFailed>
      ) : directory.kind === "fehler" ? (
        <p className="map-note">Anbieter lassen sich gerade nicht laden.</p>
      ) : (
        <p className="map-note">Karte wird geladen …</p>
      )}
    </div>
  );
}

export function MapPanel(props: MapScreenProps) {
  const { module, attempt, retry } = useLazy(loadScreen);
  if (module.kind === "da") return <module.View {...props} />;
  /*
   * Platzhalter in Kartenhöhe: kein Sprung, wenn die Oberfläche kommt (CLS). Beim Laden hält `.map-rest` darunter
   * Platz für den Anfang der Liste unter der Karte frei: Auf der Merkliste ist der Kopf kurz, ohne ihn
   * schrumpfte das Dokument beim Einhängen auf die Viewport-Höhe, und die Seite sprang nach oben (Browser-Review 0025,
   * M1).
   */
  return (
    <>
      <div className={props.big ? "map-box big" : "map-box"} data-state={module.kind}>
        <BigSlot {...props} failed={module.kind === "fehler"} />
        {module.kind === "laden" ? (
          <p className="map-note">Karte wird geladen …</p>
        ) : (
          <LoadFailed attempt={attempt} retry={retry}>
            {`Die Karte konnte nicht geladen werden. ${props.big ? BIG_REST.Angebote : LIST_REST.Angebote}`}
          </LoadFailed>
        )}
      </div>
      {module.kind === "laden" && <div className="map-rest" aria-hidden="true" />}
    </>
  );
}
