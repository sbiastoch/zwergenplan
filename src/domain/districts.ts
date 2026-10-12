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
 * Fürth (Plan 0036, E6): `place=suburb`-Punkte in der Stadtgrenze Fürth (OSM-Relation 62374), Overpass-Abfrage vom
 * 2026-10-12, auf 3 Nachkommastellen gerundet. Weggelassen sind die Weiler am Stadtrand (Atzenhof, Bislohe,
 * Braunsbach, Flexdorf, Herboldshof, Kronach, Mannhof, Ritzmannshof, Steinach). Allgemeine Namen tragen „(Fürth)“,
 * denn Namen sind über alle Regionen eindeutig („Wegzeit ab …“). Ein Stadtteil ohne Zugangshalt in 800 m fällt aus der
 * Liste, sein Punkt wird nie verschoben (`build-data.ts` prüft das).
 *
 *   [out:json][timeout:60];
 *   area(3600062374)->.a;
 *   node["place"="suburb"](area.a);
 *   out;
 *
 * Die IDs sind fest: Sie stehen im localStorage (`zwergenplan.entfernung-ab`) und werden nie aus
 * dem Namen abgeleitet; Fürther mit Präfix `fuerth-`. Reihenfolge je Region: alphabetisch nach Name, deutsche
 * Sortierung. Die Gruppen für die Auswahl bildet `district-groups.ts`.
 */
import { type GeoPoint, haversineMeters } from "./geo.ts";
import { distanceText } from "./reach.ts";
import { REGION_IDS, type RegionId } from "./regions.ts";

export interface District {
  id: string;
  name: string;
  point: GeoPoint;
}

const NUERNBERG: readonly District[] = [
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

const FUERTH: readonly District[] = [
  { id: "fuerth-altstadt", name: "Altstadt (Fürth)", point: { lat: 49.48, lon: 10.987 } },
  { id: "fuerth-burgfarrnbach", name: "Burgfarrnbach", point: { lat: 49.489, lon: 10.923 } },
  { id: "fuerth-dambach", name: "Dambach", point: { lat: 49.462, lon: 10.97 } },
  { id: "fuerth-eschenau", name: "Eschenau", point: { lat: 49.46, lon: 10.96 } },
  { id: "fuerth-espan", name: "Espan", point: { lat: 49.478, lon: 11.006 } },
  { id: "fuerth-hardhoehe", name: "Hardhöhe", point: { lat: 49.481, lon: 10.956 } },
  { id: "fuerth-innenstadt", name: "Innenstadt (Fürth)", point: { lat: 49.475, lon: 10.988 } },
  { id: "fuerth-oberfuerberg", name: "Oberfürberg", point: { lat: 49.471, lon: 10.94 } },
  { id: "fuerth-poppenreuth", name: "Poppenreuth", point: { lat: 49.481, lon: 11.012 } },
  { id: "fuerth-ronhof", name: "Ronhof", point: { lat: 49.491, lon: 11.002 } },
  { id: "fuerth-sack", name: "Sack", point: { lat: 49.502, lon: 11.013 } },
  { id: "fuerth-schwand", name: "Schwand", point: { lat: 49.485, lon: 10.972 } },
  { id: "fuerth-stadeln", name: "Stadeln", point: { lat: 49.513, lon: 10.975 } },
  { id: "fuerth-suedstadt", name: "Südstadt (Fürth)", point: { lat: 49.463, lon: 10.996 } },
  { id: "fuerth-unterfarrnbach", name: "Unterfarrnbach", point: { lat: 49.491, lon: 10.955 } },
  { id: "fuerth-vach", name: "Vach", point: { lat: 49.527, lon: 10.967 } },
  { id: "fuerth-weikershof", name: "Weikershof", point: { lat: 49.445, lon: 10.988 } },
  { id: "fuerth-westvorstadt", name: "Westvorstadt (Fürth)", point: { lat: 49.47, lon: 10.968 } },
];

/** Stadtteile je Region; der `Record` verlangt für jede neue Region eine Liste (Plan 0036, E6) */
export const DISTRICTS_BY_REGION: Readonly<Record<RegionId, readonly District[]>> = {
  fuerth: FUERTH,
  nuernberg: NUERNBERG,
};

export const DISTRICTS: readonly District[] = REGION_IDS.flatMap((r) => DISTRICTS_BY_REGION[r]);

const BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));

export function districtById(id: string): District | undefined {
  return BY_ID.get(id);
}

/** bis hier „nächster Stadtteil: X“ ohne Entfernung; Stadtteil-Punkte liegen in der Stadt ≈ 1–2 km auseinander */
const NEAR_M = 1500;

/**
 * Ermittelter Standort in Worten (Nachtrag Plan 0035, 2026-10-11), damit ein falscher Standort auffällt. Offline aus
 * den Stadtteil-Punkten, ohne Reverse-Geocoding: Die Koordinate verlässt das Gerät nie (ADR 0017). Haltestellen
 * nennt die Wegzeit-Tabelle nicht beim Namen, darum nur der Stadtteil.
 */
export function nearestDistrictLabel(point: GeoPoint): string {
  let best = DISTRICTS[0];
  let bestM = Number.POSITIVE_INFINITY;
  for (const d of DISTRICTS) {
    const m = haversineMeters(point, d.point);
    if (m < bestM) {
      best = d;
      bestM = m;
    }
  }
  const label = `nächster Stadtteil: ${best?.name ?? ""}`;
  if (bestM <= NEAR_M) return label;
  return `${label}, ca. ${distanceText(bestM)}`;
}
