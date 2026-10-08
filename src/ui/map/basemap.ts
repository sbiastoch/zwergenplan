/**
 * Grundkarte im App-Look (Plan 0024, E1–E4): Die OpenFreeMap-Stile bleiben, wie sie sind (Host, Kacheln,
 * Glyphen, Sprites; ADR 0008). Nach jedem `style.load` färbt MapView.tsx ihre Layer mit Farben aus den Tokens
 * ein, blendet Unruhiges aus und schreibt Straßen- und Ortsnamen in beiden Stilen gleich. Rein: kein Zugriff auf
 * maplibre-gl (nur Typen) oder das DOM.
 */
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { Category } from "../../domain/topics.ts";

/** Hex-Tokens aus tokens.css, gelesen im `style.load`-Handler (layers.ts, `readMapTokens`). */
export interface MapTokens {
  bg: string;
  surface: string;
  rim: string;
  ink: string;
  muted: string;
  line: string;
  shadowColor: string;
  primary: string;
  onPrimary: string;
  onColor: string;
  /** `--k` je Kategorie (`.k-<kategorie>`) */
  categories: Record<Category, string>;
}

export interface BasemapPalette {
  land: string;
  residential: string;
  water: string;
  green: string;
  building: string;
  buildingLine: string;
  road: string;
  roadCasing: string;
  minorRoad: string;
  path: string;
  rail: string;
  /** Orts- und Stadtteilnamen */
  label: string;
  /** Straßen- und Gewässernamen */
  labelMinor: string;
  halo: string;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function rgbOf(hex: string): [number, number, number] {
  const match = HEX.exec(hex.trim());
  if (!match?.[1]) throw new Error(`keine Hex-Farbe: ${hex}`);
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join("") : match[1];
  const channel = (i: number) => Number.parseInt(digits.slice(i, i + 2), 16);
  return [channel(0), channel(2), channel(4)];
}

/** `a` und `b` gemischt, `t` = Anteil von `b` (0…1), als `#rrggbb`. Wie `color-mix(in srgb, …)`. */
export function mixHex(a: string, b: string, t: number): string {
  const [ra, ga, ba] = rgbOf(a);
  const [rb, gb, bb] = rgbOf(b);
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(ra, rb)}${channel(ga, gb)}${channel(ba, bb)}`;
}

/**
 * Farben der Grundkarte aus den Tokens. Hell: Papier zwischen `--bg` und `--surface`, weiße Straßen, Wasser
 * und Grün als Pastell der Kategorie-Farben. Dunkel: Nacht in `--bg`, Straßen in `--rim`, Wasser und Grün
 * gedämpft. Beschriftung in `--ink` bzw. `--muted` mit Halo, Kontrast getestet (basemap.test.ts).
 */
export function basemapPalette(tokens: MapTokens, dark: boolean): BasemapPalette {
  const { bg, surface, rim, ink, muted, line } = tokens;
  const water = tokens.categories.wasser;
  const nature = tokens.categories.natur;
  if (dark) {
    return {
      land: bg,
      residential: mixHex(bg, surface, 0.45),
      water: mixHex(bg, water, 0.4),
      green: mixHex(bg, nature, 0.25),
      building: mixHex(bg, rim, 0.45),
      buildingLine: mixHex(bg, rim, 0.8),
      road: rim,
      roadCasing: mixHex(bg, line, 0.3),
      minorRoad: mixHex(bg, rim, 0.7),
      path: mixHex(bg, line, 0.18),
      rail: mixHex(bg, line, 0.4),
      label: ink,
      labelMinor: muted,
      halo: bg,
    };
  }
  return {
    land: mixHex(bg, surface, 0.55),
    residential: mixHex(bg, surface, 0.3),
    water: mixHex(surface, water, 0.6),
    green: mixHex(surface, nature, 0.45),
    building: mixHex(bg, line, 0.05),
    buildingLine: mixHex(bg, line, 0.1),
    road: surface,
    roadCasing: mixHex(bg, line, 0.22),
    minorRoad: surface,
    path: mixHex(bg, line, 0.2),
    rail: mixHex(bg, line, 0.3),
    label: ink,
    labelMinor: muted,
    halo: surface,
  };
}

/** Was die Zuordnung von einem Stil-Layer braucht (passt auf MapLibres `LayerSpecification`). */
export interface StyleLayerInfo {
  id: string;
  type: string;
  "source-layer"?: string | undefined;
  minzoom?: number | undefined;
}

/** Die einzigen Paint-Eigenschaften, die die Grundkarte ändert (MapView.tsx setzt sie in dieser Reihenfolge). */
export const BASEMAP_PAINT = [
  "background-color",
  "fill-color",
  "fill-outline-color",
  "line-color",
  "text-color",
  "text-halo-color",
] as const;

type BasemapPaint = Partial<Record<(typeof BASEMAP_PAINT)[number], string>>;

/**
 * Straßennamen in beiden Stilen gleich (Browser-Review 0024, m3): Dark schreibt sie in Versalien und 10 px und
 * zeigt sie auf jeder Zoomstufe, Positron gemischt in 12–13 px erst ab Zoom 12,2 (Hauptstraßen), 15 (Nebenstraßen)
 * bzw. 15,5 (Wege), je Klasse ein Layer mit `minzoom`.
 */
export const STREET_LABEL_LAYOUT: { "text-transform": "none"; "text-size": ExpressionSpecification } = {
  "text-transform": "none",
  "text-size": ["interpolate", ["linear"], ["zoom"], 13, 12, 14, 13],
};

/**
 * Dichte wie Positron für einen Straßennamen-Layer **ohne** `minzoom` (Dark: einer für alle Klassen). Ersetzt dessen
 * Filter ganz, statt ihn per `all` zu erweitern: Ein Filter in alter Syntax ließe sich nicht mit einem Ausdruck
 * verknüpfen. Autobahnen fehlen wie bisher (dort stehen Nummern). Zoom im Filter wertet MapLibre auf ganzen Stufen aus.
 */
export const STREET_LABEL_FILTER: FilterSpecification = [
  "all",
  ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
  [
    "match",
    ["get", "class"],
    ["primary", "secondary", "tertiary", "trunk"],
    [">=", ["zoom"], 12],
    ["minor", "service", "track", "path"],
    [">=", ["zoom"], 15],
    false,
  ],
];

/** Änderung eines Text-Layers mit Straßennamen: Layout und Filter zusätzlich zur Farbe */
interface StreetLabel {
  layout: typeof STREET_LABEL_LAYOUT;
  /** nur für Layer ohne `minzoom` */
  filter?: FilterSpecification;
}

export type LayerChange =
  | { id: string; hide: true }
  | {
      id: string;
      paint: BasemapPaint;
      /** Straßennamen: Schreibung, Größe, ggf. Dichte */
      street?: StreetLabel;
      /** Ortsnamen (Stadt, Ort, Dorf) in gemischter Schreibung wie Positron; Stadtteile bleiben in Versalien */
      mixedCase?: true;
      /** Linie durchgezogen statt gestrichelt */
      solid?: true;
    };

type Role = keyof BasemapPalette | "hide" | undefined;

/** Rolle eines Layers nach OpenMapTiles-Schema (`source-layer`) und ID; `undefined` = unverändert lassen. */
function roleOf({ id, type, "source-layer": source }: StyleLayerInfo): Role {
  if (type === "background") return "land";
  if (source === "boundary" || source === "aeroway" || source === "aerodrome_label" || source === "poi") return "hide";
  if (type === "symbol") {
    if (source === "transportation") return "hide"; // Einbahnpfeile
    // Autobahnnummern: Positron zeigt sie als Schild, Dark als Text; beide aus (Browser-Review 0024, m3)
    if (source === "transportation_name") return /shield|motorway/.test(id) ? "hide" : "labelMinor";
    if (source === "water_name" || source === "waterway") return "labelMinor";
    if (source === "place") {
      if (/country|state|continent/.test(id)) return "hide";
      return /other|suburb|village|neighbou?rhood/.test(id) ? "labelMinor" : "label";
    }
    return undefined;
  }
  if (source === "water" || source === "waterway") return "water";
  if (source === "park") return "green";
  if (source === "landcover") return /wood|grass|forest|park|farmland|wetland/.test(id) ? "green" : undefined;
  if (source === "landuse") {
    if (/park|cemetery|grass|garden|pitch|playground/.test(id)) return "green";
    return /residential/.test(id) ? "residential" : undefined;
  }
  if (source === "building") return "building";
  if (source === "transportation") {
    if (type === "fill") return "road";
    if (/rail/.test(id)) return "rail";
    if (/casing|subtle/.test(id)) return "roadCasing";
    if (/path/.test(id)) return "path";
    if (/minor/.test(id)) return "minorRoad";
    return "road";
  }
  return undefined;
}

const COLOR_PROPERTY = { background: "background-color", fill: "fill-color", line: "line-color" } as const;

/**
 * Änderungen für die Layer eines OpenFreeMap-Stils (Plan 0024, E2/E3). Unbekannte Layer und Typen bleiben
 * still unverändert; ein Stil ohne einen bestimmten Layer braucht nichts Besonderes.
 */
export function basemapChanges(layers: readonly StyleLayerInfo[], palette: BasemapPalette): LayerChange[] {
  const changes: LayerChange[] = [];
  for (const layer of layers) {
    const role = roleOf(layer);
    if (role === undefined) continue;
    if (role === "hide") {
      changes.push({ id: layer.id, hide: true });
      continue;
    }
    const color = palette[role];
    if (layer.type === "symbol") {
      const paint = { "text-color": color, "text-halo-color": palette.halo };
      if (layer["source-layer"] === "transportation_name") {
        const street: StreetLabel =
          layer.minzoom === undefined
            ? { layout: STREET_LABEL_LAYOUT, filter: STREET_LABEL_FILTER }
            : { layout: STREET_LABEL_LAYOUT };
        changes.push({ id: layer.id, paint, street });
      } else if (layer["source-layer"] === "place" && !/other|suburb|neighbou?rhood/.test(layer.id)) {
        changes.push({ id: layer.id, paint, mixedCase: true });
      } else {
        changes.push({ id: layer.id, paint });
      }
    } else if (layer.type === "background" || layer.type === "fill" || layer.type === "line") {
      const paint: BasemapPaint = { [COLOR_PROPERTY[layer.type]]: color };
      if (role === "building") paint["fill-outline-color"] = palette.buildingLine;
      // Wege durchgezogen wie in Positron; Dark strichelt sie (Browser-Review 0024, m3)
      changes.push(role === "path" ? { id: layer.id, paint, solid: true } : { id: layer.id, paint });
    }
  }
  return changes;
}
