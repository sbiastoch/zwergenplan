/**
 * Kurze Stadtteil-Liste als Startpunkt für die Entfernung (Plan 0004, E4).
 *
 * Quelle: OpenStreetMap, `place=suburb|quarter`-Punkte in der Stadtgrenze Nürnberg,
 * Overpass-Abfrage vom 2026-10-04, auf 3 Nachkommastellen gerundet. „Altstadt“ und „Südstadt“
 * führt OSM nicht als Ortsteil-Punkt; dort stehen Hauptmarkt bzw. Aufseßplatz.
 * Daten © OpenStreetMap-Mitwirkende, ODbL (https://www.openstreetmap.org/copyright).
 *
 * Abfrage zum Nachprüfen (der Server braucht einen User-Agent, sonst 406):
 *
 *   [out:json][timeout:60];
 *   rel["boundary"="administrative"]["name"="Nürnberg"]["admin_level"="6"];map_to_area->.a;
 *   node["place"~"suburb|quarter"](area.a);
 *   out;
 *
 * Die IDs sind fest: Sie stehen im localStorage (`zwergenplan.entfernung-ab`) und werden nie aus
 * dem Namen abgeleitet. Reihenfolge: alphabetisch nach Name, deutsche Sortierung.
 */
import type { GeoPoint } from "./geo.ts";

export interface District {
  id: string;
  name: string;
  point: GeoPoint;
}

export const DISTRICTS: readonly District[] = [
  { id: "altenfurt", name: "Altenfurt", point: { lat: 49.408, lon: 11.167 } },
  { id: "altstadt", name: "Altstadt", point: { lat: 49.454, lon: 11.077 } },
  { id: "buch", name: "Buch", point: { lat: 49.497, lon: 11.045 } },
  { id: "buchenbuehl", name: "Buchenbühl", point: { lat: 49.503, lon: 11.111 } },
  { id: "eberhardshof", name: "Eberhardshof", point: { lat: 49.458, lon: 11.029 } },
  { id: "eibach", name: "Eibach", point: { lat: 49.403, lon: 11.035 } },
  { id: "erlenstegen", name: "Erlenstegen", point: { lat: 49.473, lon: 11.133 } },
  { id: "fischbach", name: "Fischbach", point: { lat: 49.42, lon: 11.188 } },
  { id: "galgenhof", name: "Galgenhof", point: { lat: 49.443, lon: 11.085 } },
  { id: "gartenstadt", name: "Gartenstadt", point: { lat: 49.415, lon: 11.078 } },
  { id: "gibitzenhof", name: "Gibitzenhof", point: { lat: 49.43, lon: 11.066 } },
  { id: "gleisshammer", name: "Gleißhammer", point: { lat: 49.442, lon: 11.107 } },
  { id: "gostenhof", name: "Gostenhof", point: { lat: 49.448, lon: 11.058 } },
  { id: "grossreuth", name: "Großreuth h. d. Veste", point: { lat: 49.475, lon: 11.083 } },
  { id: "hasenbuck", name: "Hasenbuck", point: { lat: 49.426, lon: 11.091 } },
  { id: "katzwang", name: "Katzwang", point: { lat: 49.35, lon: 11.059 } },
  { id: "langwasser", name: "Langwasser", point: { lat: 49.407, lon: 11.13 } },
  { id: "laufamholz", name: "Laufamholz", point: { lat: 49.466, lon: 11.163 } },
  { id: "maxfeld", name: "Maxfeld", point: { lat: 49.465, lon: 11.091 } },
  { id: "moegeldorf", name: "Mögeldorf", point: { lat: 49.46, lon: 11.132 } },
  { id: "muggenhof", name: "Muggenhof", point: { lat: 49.464, lon: 11.025 } },
  { id: "reichelsdorf", name: "Reichelsdorf", point: { lat: 49.382, lon: 11.033 } },
  { id: "roethenbach", name: "Röthenbach b. Schweinau", point: { lat: 49.422, lon: 11.029 } },
  { id: "schoppershof", name: "Schoppershof", point: { lat: 49.466, lon: 11.102 } },
  { id: "schweinau", name: "Schweinau", point: { lat: 49.431, lon: 11.045 } },
  { id: "st-jobst", name: "St. Jobst", point: { lat: 49.465, lon: 11.119 } },
  { id: "st-johannis", name: "St. Johannis", point: { lat: 49.461, lon: 11.062 } },
  { id: "st-leonhard", name: "St. Leonhard", point: { lat: 49.44, lon: 11.051 } },
  { id: "st-peter", name: "St. Peter", point: { lat: 49.444, lon: 11.098 } },
  { id: "steinbuehl", name: "Steinbühl", point: { lat: 49.44, lon: 11.069 } },
  { id: "suedstadt", name: "Südstadt", point: { lat: 49.441, lon: 11.08 } },
  { id: "thon", name: "Thon", point: { lat: 49.479, lon: 11.061 } },
  { id: "woehrd", name: "Wöhrd", point: { lat: 49.454, lon: 11.095 } },
  { id: "zerzabelshof", name: "Zerzabelshof", point: { lat: 49.445, lon: 11.125 } },
  { id: "ziegelstein", name: "Ziegelstein", point: { lat: 49.488, lon: 11.106 } },
];

const BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));

export function districtById(id: string): District | undefined {
  return BY_ID.get(id);
}
