/**
 * Regionen des Katalogs (Plan 0031, E1; ADR 0025) und die Netze, zu denen sie gehören (Plan 0039, E1; ADR 0032).
 * Jeder Katalog-Eintrag nennt seine `region`; das Schema prüft die Orte gegen deren bbox. Seit Plan 0036 (ADR 0029)
 * gibt es Nürnberg und Fürth, seit Plan 0039 Düsseldorf. Felder kommen erst, wenn etwas sie liest: `population`
 * sortiert die Stadt-Kacheln des Onboardings (Plan 0033, E5; Nachtrag ADR 0025), `kreis` ist das Startgebiet der
 * Wegzeit (`scripts/transit/table.ts`), `municipality` die Gemeinde-Prüfung des Entdeckens (Plan 0039, E2).
 *
 * Ein **Netz** ist ein Verkehrsverbund in genau einem Bundesland: Fahrplan, Wegzeit-Tabelle, Gültigkeitsbereich des
 * Startpunkts (`bbox`), Ferien und Kartenmitte gelten je Netz, nicht je Stadt. Die Region bleibt die Einheit des
 * Katalogs und des Entdeckens. Regionen dürfen überlappen; jede Region-bbox liegt in der bbox ihres Netzes, die
 * Netz-bboxen überlappen nicht (ersetzt ADR 0029, Punkt 1; Test in `regions.test.ts`). Rein und ohne Zod.
 */
import { type BBox, type GeoPoint, inBounds, NUERNBERG_BBOX } from "./geo.ts";

export const NETWORK_IDS = ["vgn", "vrr"] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

/** Namensnennung des Fahrplans, solange keine Tabelle geladen ist (Quellenhinweis im Kind-Sheet, Plan 0039, E12) */
interface TransitAttribution {
  attribution: string;
  url: string;
  license: string;
  licenseUrl: string;
}

export interface Network {
  /** Gebiet als Wendung nach „außerhalb“: „des Großraums Nürnberg“, „von Düsseldorf“ */
  area: string;
  /** Gültigkeitsbereich: Standort, Kartenmitte, gespeicherter Punkt, Steige des Auszugs */
  bbox: BBox;
  /** Kartenmitte ohne Orte */
  home: GeoPoint;
  /** Schulferien und Feiertage (ISO 3166-2) */
  holidays: "DE-BY" | "DE-NW";
  transitSource: TransitAttribution;
}

/** Stadt Düsseldorf plus etwa 3 km Rand: Startpunkte im Netz `vrr` und Zuschnitt des Fahrplanauszugs (Plan 0039, E2) */
export const VRR_BBOX = { minLat: 51.08, maxLat: 51.4, minLon: 6.62, maxLon: 7.0 } as const;

export const NETWORKS: Readonly<Record<NetworkId, Network>> = {
  vgn: {
    area: "des Großraums Nürnberg",
    bbox: NUERNBERG_BBOX,
    // Hauptmarkt Nürnberg
    home: { lat: 49.454, lon: 11.077 },
    holidays: "DE-BY",
    transitSource: {
      attribution: "VGN – Verkehrsverbund Großraum Nürnberg GmbH",
      url: "https://www.vgn.de/web-entwickler/open-data/",
      license: "CC BY-SA 3.0 DE",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/",
    },
  },
  vrr: {
    area: "von Düsseldorf",
    bbox: VRR_BBOX,
    // Rathaus Düsseldorf am Marktplatz
    home: { lat: 51.226, lon: 6.773 },
    holidays: "DE-NW",
    transitSource: {
      attribution: "VRR – Verkehrsverbund Rhein-Ruhr AöR",
      url: "https://www.opendata-oepnv.de/ht/de/organisation/verkehrsverbuende/vrr/openvrr/datensaetze",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.de",
    },
  },
};

export interface Region {
  name: string;
  bbox: BBox;
  /** Einwohner, auf Tausend gerundet, mit Quelle und Stichtag im Kommentar; nie geschätzt (Plan 0033, E5) */
  population: number;
  /**
   * Kreisschlüssel (5 Ziffern; bei kreisfreien Städten gleich dem Gemeindeschlüssel ohne die drei Nullen). Präfix der
   * DHID `de:<kreis>:` der Haltbereiche, die Zeilen der Wegzeit-Tabelle werden (ADR 0029, Punkt 3)
   */
  kreis: string;
  network: NetworkId;
  /**
   * Nur Orte dieser Gemeinde (Geocoding) nimmt das Entdecken auf, wenn die bbox ganze Nachbarstädte enthält (Plan
   * 0039, E2). Ohne Feld gilt die bbox allein: Stadt plus Nachbarorte.
   */
  municipality?: string;
}

/**
 * Reihenfolge = Reihenfolge des Entdeckens (`pipeline discover`): Liegt eine bbox in einer anderen, steht sie davor,
 * damit ein Anbieter, den beide Suchen finden, der spezifischeren Region gehört (ADR 0029, Punkt 2; Test in
 * `regions.test.ts`). Die Kacheln sortieren unabhängig davon nach Einwohnern.
 */
export const REGION_IDS = ["fuerth", "nuernberg", "duesseldorf"] as const;
export type RegionId = (typeof REGION_IDS)[number];

/** Stadt Fürth plus direkt angrenzende Orte; Westgrenze auf die von `NUERNBERG_BBOX` gekappt (Plan 0036, E1) */
const FUERTH_BBOX = { minLat: 49.4, maxLat: 49.57, minLon: 10.85, maxLon: 11.04 } as const;

/**
 * Stadtgrenze Düsseldorf (OSM-Relation 62539, Overpass `out bb` 2026-10-18: lat 51,1244–51,3525, lon 6,6888–6,9399),
 * nach außen gerundet. Enthält Teile von Neuss, Ratingen, Hilden, Erkrath und Meerbusch; die schließt `municipality`
 * aus (Plan 0039, E2).
 */
const DUESSELDORF_BBOX = { minLat: 51.12, maxLat: 51.36, minLon: 6.68, maxLon: 6.945 } as const;

export const REGIONS: Record<RegionId, Region> = {
  // 131 712 Einwohner am 31.12.2023, Fortschreibung auf Basis Zensus 2022: Bayerisches Landesamt für Statistik,
  // „Statistik kommunal 2024“, Kreisfreie Stadt Fürth (09563), Tabelle 1 (abgerufen 2026-10-12)
  fuerth: { name: "Fürth", bbox: FUERTH_BBOX, population: 132_000, kreis: "09563", network: "vgn" },
  // 526 606 Einwohner am 31.12.2023, Fortschreibung auf Basis Zensus 2022: Bayerisches Landesamt für Statistik,
  // „Statistik kommunal 2024“, Kreisfreie Stadt Nürnberg (09564), Tabelle 1 (abgerufen 2026-10-11)
  nuernberg: { name: "Nürnberg", bbox: NUERNBERG_BBOX, population: 527_000, kreis: "09564", network: "vgn" },
  // 618 685 Einwohner am 31.12.2024, Bevölkerungsfortschreibung auf Basis Zensus 2022: IT.NRW, „Kommunalprofil
  // Düsseldorf, krfr. Stadt“ (Stand 15.01.2026), Tabelle „Bevölkerungsstand und -bewegung 2018–2024“,
  // https://statistik.nrw/sites/default/files/municipalprofiles/l05111.pdf (abgerufen 2026-10-18)
  duesseldorf: {
    name: "Düsseldorf",
    bbox: DUESSELDORF_BBOX,
    population: 619_000,
    kreis: "05111",
    network: "vrr",
    municipality: "Düsseldorf",
  },
};

/** Netz der Region */
export function networkOf(region: RegionId): NetworkId {
  return REGIONS[region].network;
}

/** Regionen eines Netzes in der Reihenfolge von `REGION_IDS` */
export function regionsOf(network: NetworkId): RegionId[] {
  return REGION_IDS.filter((id) => REGIONS[id].network === network);
}

/** In welcher Netz-bbox liegt der Punkt? Die bboxen überlappen nicht, also höchstens eine. */
export function networkAt(point: GeoPoint): NetworkId | undefined {
  return NETWORK_IDS.find((id) => inBounds(point, NETWORKS[id].bbox));
}

/** Regionen nach Einwohnern absteigend, bei Gleichstand nach Name (Kacheln, Stadtteil-Gruppen, Texte) */
export function byPopulation<K extends string>(regions: Readonly<Record<K, Region>>): (Region & { id: K })[] {
  // Cast: `Object.keys` liefert nur `string[]`; die Regionen sind feste Literale (`REGIONS`, Test-Fakes)
  return (Object.keys(regions) as K[])
    .map((id) => ({ id, ...regions[id] }))
    .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name, "de"));
}

/**
 * „Nürnberg und Fürth“, „A, B und C“: Namen nach Einwohnern für Texte (Plan 0036, E8). Mit einem Netz nur dessen
 * Regionen (Plan 0039, E12).
 */
export function regionList(of: NetworkId | Readonly<Record<string, Region>> = REGIONS): string {
  const regions = typeof of === "string" ? Object.fromEntries(regionsOf(of).map((id) => [id, REGIONS[id]])) : of;
  const names = byPopulation(regions).map((r) => r.name);
  const last = names.pop();
  return names.length === 0 ? (last ?? "") : `${names.join(", ")} und ${last}`;
}
