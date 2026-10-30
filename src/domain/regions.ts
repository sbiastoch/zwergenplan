/**
 * Regionen des Katalogs (Plan 0031, E1; ADR 0025). Jeder Katalog-Eintrag nennt seine `region`; das Schema prüft die
 * Orte gegen deren bbox. Seit Plan 0036 (ADR 0029) gibt es zwei: Nürnberg und Fürth. Felder kommen erst, wenn etwas
 * sie liest: `population` sortiert die Stadt-Kacheln des Onboardings (Plan 0033, E5; Nachtrag ADR 0025), `kreis` ist
 * das Startgebiet der Wegzeit (`scripts/transit/table.ts`), `territory` das Gebiet fürs Entdecken
 * (Plan 0050, S2c). Ferienland, Kamera und Suchname gibt es nicht, weil
 * nichts sie braucht (beide Regionen liegen in Bayern und im VGN). Rein und ohne Zod.
 *
 * Regionen dürfen überlappen; jede bbox liegt in `NUERNBERG_BBOX`, damit Standort, Kartenmitte und Fahrplanauszug
 * mit der Standard-bbox von `inBounds` für alle gelten (ADR 0029, Punkt 1).
 */
import { type BBox, NUERNBERG_BBOX } from "./geo.ts";

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
  /** Gebiet fürs Entdecken: zusätzlich zur bbox muss ein Ort laut Geocoding hier liegen (Plan 0050, S2c) */
  territory: Territory;
}

/**
 * Gebiet einer Region nach Gemeinde und Kreis aus Nominatim `addressdetails` (Plan 0050, S2c; ADR 0029 und 0032,
 * Nachträge). `label` geht wörtlich in die Nachrichten ans Modell.
 */
export interface Territory {
  label: string;
  /** Gemeinde = `city ?? town ?? municipality ?? village`, `municipality` nicht als Verwaltungsgemeinschaft („(VGem)“) */
  municipalities: readonly string[];
  /** `county`; Nominatim liefert bei Nürnberg keins, bei der Stadt Fürth „Fürth“, beim Landkreis „Landkreis Fürth“ */
  counties?: readonly string[];
}

export type TerritoryStatus = "drin" | "draussen" | "unbekannt";

/** Kreis vor Gemeinde: ein Ort im Landkreis ohne Gemeinde (POI ohne `village`) zählt trotzdem */
export function territoryStatus(
  t: Territory,
  place: { municipality?: string | null | undefined; county?: string | undefined },
): TerritoryStatus {
  if (place.county && t.counties?.includes(place.county)) return "drin";
  if (place.municipality && t.municipalities.includes(place.municipality)) return "drin";
  return place.municipality || place.county ? "draussen" : "unbekannt";
}

/**
 * Reihenfolge = Reihenfolge des Entdeckens (`pipeline discover`): Liegt eine bbox in einer anderen, steht sie davor,
 * damit ein Anbieter, den beide Suchen finden, der spezifischeren Region gehört (ADR 0029, Punkt 2; Test in
 * `regions.test.ts`). Die Kacheln sortieren unabhängig davon nach Einwohnern.
 */
export const REGION_IDS = ["fuerth", "nuernberg"] as const;
export type RegionId = (typeof REGION_IDS)[number];

/**
 * bbox: Stadt Fürth plus direkt angrenzende Orte, das Gebiet steht in `territory`; Westgrenze auf die von `NUERNBERG_BBOX` gekappt (Plan 0036, E1). Der
 * Westen des Landkreises (Langenzenn, Wilhermsdorf, Roßtal) liegt außerhalb, obwohl `territory` ihn zählt (Plan 0050, S2c)
 */
const FUERTH_BBOX = { minLat: 49.4, maxLat: 49.57, minLon: 10.85, maxLon: 11.04 } as const;

export const REGIONS: Record<RegionId, Region> = {
  // 131 712 Einwohner am 31.12.2023, Fortschreibung auf Basis Zensus 2022: Bayerisches Landesamt für Statistik,
  // „Statistik kommunal 2024“, Kreisfreie Stadt Fürth (09563), Tabelle 1 (abgerufen 2026-10-12)
  fuerth: {
    name: "Fürth",
    bbox: FUERTH_BBOX,
    population: 132_000,
    kreis: "09563",
    // Stadt plus Landkreis (Nutzerentscheid 2026-10-29); das Label nennt nur den Teil des Landkreises in der bbox
    territory: {
      label:
        "Stadt Fürth und angrenzender Landkreis Fürth (Zirndorf, Oberasbach, Stein, Cadolzburg, Veitsbronn, Seukendorf)",
      municipalities: ["Fürth"],
      counties: ["Landkreis Fürth"],
    },
  },
  // 526 606 Einwohner am 31.12.2023, Fortschreibung auf Basis Zensus 2022: Bayerisches Landesamt für Statistik,
  // „Statistik kommunal 2024“, Kreisfreie Stadt Nürnberg (09564), Tabelle 1 (abgerufen 2026-10-11)
  // nur die Stadt (Nutzerentscheid 2026-10-29): die bbox reicht bis Erlangen und Schwabach
  nuernberg: {
    name: "Nürnberg",
    bbox: NUERNBERG_BBOX,
    population: 527_000,
    kreis: "09564",
    territory: { label: "Stadt Nürnberg", municipalities: ["Nürnberg"] },
  },
};

/** Regionen nach Einwohnern absteigend, bei Gleichstand nach Name (Kacheln, Stadtteil-Gruppen, Texte) */
export function byPopulation<K extends string>(regions: Readonly<Record<K, Region>>): (Region & { id: K })[] {
  // Cast: `Object.keys` liefert nur `string[]`; die Regionen sind feste Literale (`REGIONS`, Test-Fakes)
  return (Object.keys(regions) as K[])
    .map((id) => ({ id, ...regions[id] }))
    .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name, "de"));
}

/** „Nürnberg und Fürth“, „A, B und C“: Namen nach Einwohnern für Texte (Plan 0036, E8) */
export function regionList(regions: Readonly<Record<string, Region>> = REGIONS): string {
  const names = byPopulation(regions).map((r) => r.name);
  const last = names.pop();
  return names.length === 0 ? (last ?? "") : `${names.join(", ")} und ${last}`;
}
