import { describe, expect, it } from "vitest";
import {
  type BasemapPalette,
  basemapChanges,
  basemapPalette,
  type MapTokens,
  mixHex,
  STREET_LABEL_FILTER,
  STREET_LABEL_LAYOUT,
  type StyleLayerInfo,
} from "./basemap.ts";

/** Layer-Listen der OpenFreeMap-Stile (id, Typ, source-layer, minzoom), Stand 2026-10-08 */
const POSITRON = `
  background background -
  park fill park
  water fill water
  landcover_ice_shelf fill landcover
  landcover_glacier fill landcover
  landuse_residential fill landuse
  landcover_wood fill landcover
  waterway line waterway
  building fill building
  tunnel_motorway_casing line transportation
  tunnel_motorway_inner line transportation
  aeroway-taxiway line aeroway
  aeroway-runway-casing line aeroway
  aeroway-area fill aeroway
  aeroway-runway line aeroway
  road_area_pier fill transportation
  road_pier line transportation
  highway_path line transportation
  highway_minor line transportation
  highway_major_casing line transportation
  highway_major_inner line transportation
  highway_major_subtle line transportation
  highway_motorway_casing line transportation
  highway_motorway_inner line transportation
  highway_motorway_subtle line transportation
  railway_transit line transportation
  railway_transit_dashline line transportation
  railway_service line transportation
  railway_service_dashline line transportation
  railway line transportation
  railway_dashline line transportation
  highway_motorway_bridge_casing line transportation
  highway_motorway_bridge_inner line transportation
  boundary_3 line boundary
  boundary_2 line boundary
  boundary_disputed line boundary
  waterway_line_label symbol waterway
  water_name_point_label symbol water_name
  water_name_line_label symbol water_name
  highway-name-path symbol transportation_name 15.5
  highway-name-minor symbol transportation_name 15
  highway-name-major symbol transportation_name 12.2
  highway-shield-non-us symbol transportation_name
  highway-shield-us-interstate symbol transportation_name
  road_shield_us symbol transportation_name
  airport symbol aerodrome_label
  label_other symbol place
  label_village symbol place
  label_town symbol place
  label_state symbol place
  label_city symbol place
  label_city_capital symbol place
  label_country_3 symbol place
  label_country_2 symbol place
  label_country_1 symbol place
`;
const DARK = `
  background background -
  water fill water
  landcover_ice_shelf fill landcover
  landcover_glacier fill landcover
  landuse_residential fill landuse
  landcover_wood fill landcover
  landuse_park fill landuse
  waterway line waterway
  water_name symbol water_name
  building fill building
  aeroway-taxiway line aeroway
  aeroway-runway-casing line aeroway
  aeroway-area fill aeroway
  aeroway-runway line aeroway
  road_area_pier fill transportation
  road_pier line transportation
  highway_path line transportation
  highway_minor line transportation
  highway_major_casing line transportation
  highway_major_inner line transportation
  highway_major_subtle line transportation
  highway_motorway_casing line transportation
  highway_motorway_inner line transportation
  road_oneway symbol transportation
  road_oneway_opposite symbol transportation
  highway_motorway_subtle line transportation
  railway_transit line transportation
  railway_transit_dashline line transportation
  railway_minor line transportation
  railway_minor_dashline line transportation
  railway line transportation
  railway_dashline line transportation
  highway_name_other symbol transportation_name
  highway_name_motorway symbol transportation_name
  boundary_state line boundary
  boundary_country_z0-4 line boundary
  boundary_country_z5- line boundary
  place_other symbol place
  place_suburb symbol place
  place_village symbol place
  place_town symbol place
  place_city symbol place
  place_city_large symbol place
  place_state symbol place
  place_country_other symbol place
  place_country_minor symbol place
  place_country_major symbol place
`;

const layersOf = (list: string): StyleLayerInfo[] =>
  list
    .trim()
    .split("\n")
    .map((row) => {
      const [id = "", type = "", source = "-", minzoom] = row.trim().split(" ");
      const layer: StyleLayerInfo = source === "-" ? { id, type } : { id, type, "source-layer": source };
      return minzoom ? { ...layer, minzoom: Number(minzoom) } : layer;
    });

/** Werte aus tokens.css (hell, dunkel), Kategorie-Farben gleich in beiden */
const categories = {
  babykurse: "#ff8cc0",
  "krabbel-spielgruppen": "#ffb13b",
  "treffs-cafes": "#b99cff",
  bewegung: "#2ec4b6",
  wasser: "#5cb8ff",
  musik: "#ff7070",
  kreativ: "#ffd93b",
  buecher: "#7bd389",
  museum: "#e3a872",
  buehne: "#ee8bfa",
  natur: "#a6db5e",
  beratung: "#a3bdd0",
};
const LIGHT: MapTokens = {
  bg: "#e8f1ff",
  surface: "#fff",
  rim: "#fff",
  ink: "#13212e",
  muted: "#475563",
  line: "#13212e",
  shadowColor: "#13212e",
  primary: "#13212e",
  onPrimary: "#fff",
  onColor: "#13212e",
  categories,
};
const NIGHT: MapTokens = {
  bg: "#0e1620",
  surface: "#1b2733",
  rim: "#2b3a49",
  ink: "#eef3f8",
  muted: "#a9b8c6",
  line: "#8fa4ba",
  shadowColor: "#34495e",
  primary: "#ffd93b",
  onPrimary: "#13212e",
  onColor: "#13212e",
  categories,
};

const light = basemapPalette(LIGHT, false);
const night = basemapPalette(NIGHT, true);

const byId = (layers: StyleLayerInfo[], palette: BasemapPalette) =>
  new Map(basemapChanges(layers, palette).map((change) => [change.id, change]));

/** WCAG-Kontrast zweier Hex-Farben */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const value = mixHex(hex, hex, 0);
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(value.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("mixHex (Plan 0024, E4)", () => {
  it("mischt wie color-mix in srgb, auch mit Kurzform", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#fff", "#000", 0)).toBe("#ffffff");
    expect(mixHex("#13212e", "#e8f1ff", 1)).toBe("#e8f1ff");
  });

  it("wirft bei Nicht-Hex statt still Schwarz zu liefern", () => {
    expect(() => mixHex("rgba(0,0,0,0.4)", "#fff", 0.5)).toThrow(/Hex/);
  });
});

describe("Palette der Grundkarte (Plan 0024, E4)", () => {
  it("hell und dunkel getrennt, Wasser und Grün unterscheidbar vom Land", () => {
    expect(light.land).not.toBe(night.land);
    for (const palette of [light, night]) {
      expect(palette.water).not.toBe(palette.land);
      expect(palette.green).not.toBe(palette.land);
      expect(palette.road).not.toBe(palette.residential);
    }
  });

  it("Beschriftung lesbar: Namen gegen Land, Wohngebiet und Straße mindestens 4,5 : 1, in beiden Themes", () => {
    for (const palette of [light, night]) {
      for (const ground of [palette.land, palette.residential, palette.road, palette.halo]) {
        expect(contrast(palette.label, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.labelMinor, ground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("Zuordnung der Stil-Layer (Plan 0024, E2/E3)", () => {
  it("Positron: Hintergrund, Wasser, Park, Gebäude, Straßen, Beschriftung in App-Farben", () => {
    const changes = byId(layersOf(POSITRON), light);
    expect(changes.get("background")).toEqual({ id: "background", paint: { "background-color": light.land } });
    expect(changes.get("water")).toEqual({ id: "water", paint: { "fill-color": light.water } });
    expect(changes.get("waterway")).toEqual({ id: "waterway", paint: { "line-color": light.water } });
    expect(changes.get("park")).toEqual({ id: "park", paint: { "fill-color": light.green } });
    expect(changes.get("landcover_wood")).toEqual({ id: "landcover_wood", paint: { "fill-color": light.green } });
    expect(changes.get("landuse_residential")).toEqual({
      id: "landuse_residential",
      paint: { "fill-color": light.residential },
    });
    expect(changes.get("building")).toEqual({
      id: "building",
      paint: { "fill-color": light.building, "fill-outline-color": light.buildingLine },
    });
    expect(changes.get("highway_major_inner")).toEqual({
      id: "highway_major_inner",
      paint: { "line-color": light.road },
    });
    expect(changes.get("highway_major_casing")).toEqual({
      id: "highway_major_casing",
      paint: { "line-color": light.roadCasing },
    });
    expect(changes.get("highway_minor")).toEqual({ id: "highway_minor", paint: { "line-color": light.minorRoad } });
    expect(changes.get("highway_path")).toEqual({
      id: "highway_path",
      paint: { "line-color": light.path },
      solid: true,
    });
    expect(changes.get("railway_transit")).toEqual({ id: "railway_transit", paint: { "line-color": light.rail } });
    expect(changes.get("highway-name-minor")).toEqual({
      id: "highway-name-minor",
      paint: { "text-color": light.labelMinor, "text-halo-color": light.halo },
      street: { layout: STREET_LABEL_LAYOUT },
    });
    expect(changes.get("label_city")).toEqual({
      id: "label_city",
      paint: { "text-color": light.label, "text-halo-color": light.halo },
      mixedCase: true,
    });
    expect(changes.get("label_other")).toEqual({
      id: "label_other",
      paint: { "text-color": light.labelMinor, "text-halo-color": light.halo },
    });
  });

  it("Dark: dieselben Rollen trotz anderer Layer-IDs", () => {
    const changes = byId(layersOf(DARK), night);
    expect(changes.get("background")).toEqual({ id: "background", paint: { "background-color": night.land } });
    expect(changes.get("landuse_park")).toEqual({ id: "landuse_park", paint: { "fill-color": night.green } });
    expect(changes.get("highway_name_other")).toEqual({
      id: "highway_name_other",
      paint: { "text-color": night.labelMinor, "text-halo-color": night.halo },
      street: { layout: STREET_LABEL_LAYOUT, filter: STREET_LABEL_FILTER },
    });
    expect(changes.get("highway_path")).toEqual({
      id: "highway_path",
      paint: { "line-color": night.path },
      solid: true,
    });
    expect(changes.get("place_suburb")).toEqual({
      id: "place_suburb",
      paint: { "text-color": night.labelMinor, "text-halo-color": night.halo },
    });
    expect(changes.get("place_city")).toEqual({
      id: "place_city",
      paint: { "text-color": night.label, "text-halo-color": night.halo },
      mixedCase: true,
    });
    expect(changes.get("railway_minor")).toEqual({ id: "railway_minor", paint: { "line-color": night.rail } });
  });

  it("Straßennamen in beiden Stilen gleich: gemischte Schreibung, gleiche Größe, Dichte wie Positron (m3)", () => {
    expect(STREET_LABEL_LAYOUT["text-transform"]).toBe("none");
    const streets = (list: string, palette: BasemapPalette) =>
      basemapChanges(layersOf(list), palette).flatMap((change) =>
        "paint" in change && change.street ? [[change.id, change.street] as const] : [],
      );
    // Positron: je Klasse ein Layer mit minzoom, der Filter bleibt
    expect(streets(POSITRON, light)).toEqual([
      ["highway-name-path", { layout: STREET_LABEL_LAYOUT }],
      ["highway-name-minor", { layout: STREET_LABEL_LAYOUT }],
      ["highway-name-major", { layout: STREET_LABEL_LAYOUT }],
    ]);
    // Dark: ein Layer ohne minzoom für alle Klassen, bekommt die Dichte von Positron
    expect(streets(DARK, night)).toEqual([
      ["highway_name_other", { layout: STREET_LABEL_LAYOUT, filter: STREET_LABEL_FILTER }],
    ]);
    // Hauptstraßen ab Zoom 12, Neben- und Wege ab 15 (Positron: 12,2 / 15 / 15,5), sonst nichts
    expect(JSON.stringify(STREET_LABEL_FILTER)).toBe(
      JSON.stringify([
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
      ]),
    );
  });

  it("Orte (Stadt, Ort, Dorf) gemischt geschrieben, Stadtteile in Versalien wie in Positron", () => {
    const mixed = (list: string, palette: BasemapPalette) =>
      basemapChanges(layersOf(list), palette)
        .filter((change) => "mixedCase" in change)
        .map((change) => change.id);
    expect(mixed(POSITRON, light)).toEqual(["label_village", "label_town", "label_city", "label_city_capital"]);
    expect(mixed(DARK, night)).toEqual(["place_village", "place_town", "place_city", "place_city_large"]);
  });

  it("Wege durchgezogen statt gestrichelt, nur Wege", () => {
    for (const [list, palette] of [
      [POSITRON, light],
      [DARK, night],
    ] as const) {
      const solid = basemapChanges(layersOf(list), palette).filter((change) => "solid" in change);
      expect(solid.map((change) => change.id)).toEqual(["highway_path"]);
    }
  });

  it("blendet Unruhiges aus: Schilder, Einbahnpfeile, Flughafen, Grenzen, Länder und Staaten", () => {
    const hidden = (list: string) =>
      basemapChanges(layersOf(list), light)
        .filter((change) => "hide" in change)
        .map((change) => change.id);
    expect(hidden(POSITRON)).toEqual([
      "aeroway-taxiway",
      "aeroway-runway-casing",
      "aeroway-area",
      "aeroway-runway",
      "boundary_3",
      "boundary_2",
      "boundary_disputed",
      "highway-shield-non-us",
      "highway-shield-us-interstate",
      "road_shield_us",
      "airport",
      "label_state",
      "label_country_3",
      "label_country_2",
      "label_country_1",
    ]);
    expect(hidden(DARK)).toEqual([
      "aeroway-taxiway",
      "aeroway-runway-casing",
      "aeroway-area",
      "aeroway-runway",
      "road_oneway",
      "road_oneway_opposite",
      "highway_name_motorway",
      "boundary_state",
      "boundary_country_z0-4",
      "boundary_country_z5-",
      "place_state",
      "place_country_other",
      "place_country_minor",
      "place_country_major",
    ]);
  });

  it("Straßen-, Wasser- und Ortsnamen bleiben sichtbar", () => {
    const changes = byId(layersOf(POSITRON), light);
    for (const id of [
      "highway-name-minor",
      "highway-name-major",
      "water_name_line_label",
      "label_town",
      "label_city",
    ]) {
      expect(changes.get(id)).toHaveProperty("paint");
    }
  });

  it("unbekannte Layer und Typen bleiben still unverändert; Fixture-Stil der E2E-Tests", () => {
    expect(
      basemapChanges(
        [
          { id: "eigene-heatmap", type: "heatmap", "source-layer": "water" },
          { id: "unbekannt", type: "fill", "source-layer": "mountain_peak" },
          { id: "landcover_ice_shelf", type: "fill", "source-layer": "landcover" },
          { id: "orte-punkt", type: "circle" },
        ],
        light,
      ),
    ).toEqual([]);
    expect(
      basemapChanges(
        [
          { id: "bg-hell", type: "background" },
          { id: "wasser-hell", type: "fill", "source-layer": "water" },
          { id: "label-stadt", type: "symbol", "source-layer": "place" },
        ],
        light,
      ),
    ).toEqual([
      { id: "bg-hell", paint: { "background-color": light.land } },
      { id: "wasser-hell", paint: { "fill-color": light.water } },
      { id: "label-stadt", paint: { "text-color": light.label, "text-halo-color": light.halo }, mixedCase: true },
    ]);
  });
});
