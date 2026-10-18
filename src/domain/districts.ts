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
 * Düsseldorf (Plan 0039, E13): alle 49 `place=suburb`-Punkte in der Stadtgrenze Düsseldorf (OSM-Relation 62539),
 * Overpass-Abfrage vom 2026-10-18, auf 3 Nachkommastellen gerundet. Hubbelrath, einer der 50 amtlichen Stadtteile,
 * führt OSM nicht als Punkt, sondern als Fläche (`way` 24813296, `place=suburb`); dort steht deren Mittelpunkt
 * (`out center`). Allgemeine oder anderswo bekannte Namen tragen „(Düsseldorf)“: Altstadt, Stadtmitte, Hafen, Hamm.
 *
 *   [out:json][timeout:60];
 *   area(3600062539)->.a;
 *   node["place"="suburb"](area.a);
 *   out;
 *
 * Die IDs sind fest: Sie stehen im localStorage (`zwergenplan.entfernung-ab`) und werden nie aus
 * dem Namen abgeleitet; Fürther mit Präfix `fuerth-`, Düsseldorfer mit `duesseldorf-` (Umlaute als ae/oe/ue). Reihenfolge je Region: alphabetisch nach Name, deutsche
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

const DUESSELDORF: readonly District[] = [
  { id: "duesseldorf-altstadt", name: "Altstadt (Düsseldorf)", point: { lat: 51.226, lon: 6.774 } },
  { id: "duesseldorf-angermund", name: "Angermund", point: { lat: 51.329, lon: 6.781 } },
  { id: "duesseldorf-benrath", name: "Benrath", point: { lat: 51.163, lon: 6.873 } },
  { id: "duesseldorf-bilk", name: "Bilk", point: { lat: 51.203, lon: 6.785 } },
  { id: "duesseldorf-carlstadt", name: "Carlstadt", point: { lat: 51.222, lon: 6.773 } },
  { id: "duesseldorf-derendorf", name: "Derendorf", point: { lat: 51.245, lon: 6.792 } },
  { id: "duesseldorf-duesseltal", name: "Düsseltal", point: { lat: 51.238, lon: 6.812 } },
  { id: "duesseldorf-eller", name: "Eller", point: { lat: 51.201, lon: 6.838 } },
  { id: "duesseldorf-flehe", name: "Flehe", point: { lat: 51.189, lon: 6.772 } },
  { id: "duesseldorf-flingern-nord", name: "Flingern Nord", point: { lat: 51.231, lon: 6.813 } },
  { id: "duesseldorf-flingern-sued", name: "Flingern Süd", point: { lat: 51.221, lon: 6.81 } },
  { id: "duesseldorf-friedrichstadt", name: "Friedrichstadt", point: { lat: 51.214, lon: 6.782 } },
  { id: "duesseldorf-garath", name: "Garath", point: { lat: 51.144, lon: 6.9 } },
  { id: "duesseldorf-gerresheim", name: "Gerresheim", point: { lat: 51.238, lon: 6.861 } },
  { id: "duesseldorf-golzheim", name: "Golzheim", point: { lat: 51.251, lon: 6.76 } },
  { id: "duesseldorf-grafenberg", name: "Grafenberg", point: { lat: 51.241, lon: 6.833 } },
  { id: "duesseldorf-hafen", name: "Hafen (Düsseldorf)", point: { lat: 51.217, lon: 6.734 } },
  { id: "duesseldorf-hamm", name: "Hamm (Düsseldorf)", point: { lat: 51.204, lon: 6.739 } },
  { id: "duesseldorf-hassels", name: "Hassels", point: { lat: 51.182, lon: 6.866 } },
  { id: "duesseldorf-heerdt", name: "Heerdt", point: { lat: 51.232, lon: 6.72 } },
  { id: "duesseldorf-hellerhof", name: "Hellerhof", point: { lat: 51.132, lon: 6.907 } },
  { id: "duesseldorf-himmelgeist", name: "Himmelgeist", point: { lat: 51.168, lon: 6.806 } },
  { id: "duesseldorf-holthausen", name: "Holthausen", point: { lat: 51.176, lon: 6.833 } },
  { id: "duesseldorf-hubbelrath", name: "Hubbelrath", point: { lat: 51.258, lon: 6.908 } },
  { id: "duesseldorf-itter", name: "Itter", point: { lat: 51.168, lon: 6.818 } },
  { id: "duesseldorf-kaiserswerth", name: "Kaiserswerth", point: { lat: 51.301, lon: 6.736 } },
  { id: "duesseldorf-kalkum", name: "Kalkum", point: { lat: 51.302, lon: 6.758 } },
  { id: "duesseldorf-knittkuhl", name: "Knittkuhl", point: { lat: 51.269, lon: 6.871 } },
  { id: "duesseldorf-lichtenbroich", name: "Lichtenbroich", point: { lat: 51.284, lon: 6.795 } },
  { id: "duesseldorf-lierenfeld", name: "Lierenfeld", point: { lat: 51.208, lon: 6.83 } },
  { id: "duesseldorf-lohausen", name: "Lohausen", point: { lat: 51.279, lon: 6.731 } },
  { id: "duesseldorf-loerick", name: "Lörick", point: { lat: 51.246, lon: 6.724 } },
  { id: "duesseldorf-ludenberg", name: "Ludenberg", point: { lat: 51.256, lon: 6.866 } },
  { id: "duesseldorf-moersenbroich", name: "Mörsenbroich", point: { lat: 51.253, lon: 6.812 } },
  { id: "duesseldorf-niederkassel", name: "Niederkassel", point: { lat: 51.24, lon: 6.752 } },
  { id: "duesseldorf-oberbilk", name: "Oberbilk", point: { lat: 51.214, lon: 6.802 } },
  { id: "duesseldorf-oberkassel", name: "Oberkassel", point: { lat: 51.23, lon: 6.755 } },
  { id: "duesseldorf-pempelfort", name: "Pempelfort", point: { lat: 51.24, lon: 6.78 } },
  { id: "duesseldorf-rath", name: "Rath", point: { lat: 51.264, lon: 6.82 } },
  { id: "duesseldorf-reisholz", name: "Reisholz", point: { lat: 51.178, lon: 6.858 } },
  { id: "duesseldorf-stadtmitte", name: "Stadtmitte (Düsseldorf)", point: { lat: 51.222, lon: 6.784 } },
  { id: "duesseldorf-stockum", name: "Stockum", point: { lat: 51.265, lon: 6.753 } },
  { id: "duesseldorf-unterbach", name: "Unterbach", point: { lat: 51.203, lon: 6.898 } },
  { id: "duesseldorf-unterbilk", name: "Unterbilk", point: { lat: 51.21, lon: 6.767 } },
  { id: "duesseldorf-unterrath", name: "Unterrath", point: { lat: 51.273, lon: 6.787 } },
  { id: "duesseldorf-urdenbach", name: "Urdenbach", point: { lat: 51.148, lon: 6.866 } },
  { id: "duesseldorf-vennhausen", name: "Vennhausen", point: { lat: 51.21, lon: 6.858 } },
  { id: "duesseldorf-volmerswerth", name: "Volmerswerth", point: { lat: 51.187, lon: 6.762 } },
  { id: "duesseldorf-wersten", name: "Wersten", point: { lat: 51.19, lon: 6.818 } },
  { id: "duesseldorf-wittlaer", name: "Wittlaer", point: { lat: 51.319, lon: 6.742 } },
];

/** Stadtteile je Region; der `Record` verlangt für jede neue Region eine Liste (Plan 0036, E6) */
export const DISTRICTS_BY_REGION: Readonly<Record<RegionId, readonly District[]>> = {
  fuerth: FUERTH,
  nuernberg: NUERNBERG,
  duesseldorf: DUESSELDORF,
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
