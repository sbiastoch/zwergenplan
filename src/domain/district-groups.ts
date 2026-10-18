/**
 * Stadtteile gruppiert nach Region für die Auswahl (Plan 0036, E6/E7): `<optgroup>` im Onboarding-Schritt „Weg“ und im
 * Kind-Sheet. Eigenes Modul, damit `districts.ts` (über `districtById` im Start-Chunk) nur Daten und Suche trägt.
 * Gezeigt werden nur die Regionen des Netzes der gewählten Stadt (Plan 0039, E8): Wer Düsseldorf wählt, sieht nur
 * Düsseldorfer Stadtteile, wer Fürth wählt, Fürth und Nürnberg.
 */
import { DISTRICTS_BY_REGION, type District } from "./districts.ts";
import { byPopulation, networkOf, REGIONS, type RegionId, regionsOf } from "./regions.ts";

export interface DistrictGroup {
  region: RegionId;
  name: string;
  districts: readonly District[];
}

/** Regionen des Netzes von `city` (ohne Stadt: Netz `vgn`); zuerst `city`, dann die übrigen nach Einwohnern */
export function districtGroups(city?: RegionId): DistrictGroup[] {
  const regions = regionsOf(city ? networkOf(city) : "vgn");
  const inNetwork = byPopulation(REGIONS).filter((r) => regions.includes(r.id));
  const ordered = inNetwork.sort((a, b) => Number(b.id === city) - Number(a.id === city));
  return ordered.map(({ id, name }) => ({ region: id, name, districts: DISTRICTS_BY_REGION[id] }));
}
