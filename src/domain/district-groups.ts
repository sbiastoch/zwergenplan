/**
 * Stadtteile gruppiert nach Region für die Auswahl (Plan 0036, E6/E7): `<optgroup>` im Onboarding-Schritt „Weg“ und im
 * Kind-Sheet. Eigenes Modul, damit `districts.ts` (über `districtById` im Start-Chunk) nur Daten und Suche trägt.
 */
import { DISTRICTS_BY_REGION, type District } from "./districts.ts";
import { byPopulation, REGIONS, type RegionId } from "./regions.ts";

export interface DistrictGroup {
  region: RegionId;
  name: string;
  districts: readonly District[];
}

/** Zuerst `first` (die im Onboarding gewählte Stadt), dann die übrigen nach Einwohnern */
export function districtGroups(first?: RegionId): DistrictGroup[] {
  const ordered = byPopulation(REGIONS).sort((a, b) => Number(b.id === first) - Number(a.id === first));
  return ordered.map(({ id, name }) => ({ region: id, name, districts: DISTRICTS_BY_REGION[id] }));
}
