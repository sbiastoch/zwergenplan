/** Einziger Zugriffspunkt der Oberfläche auf Daten (dependency-cruiser erzwingt das). */
import type { SiteData } from "../domain/site-data.ts";

export async function loadSiteData(): Promise<SiteData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/site.json`);
  if (!res.ok) throw new Error(`Daten konnten nicht geladen werden (HTTP ${res.status})`);
  // Bereits beim Build mit Zod geprüft (scripts/build-data.ts) – hier kein erneutes Parsen.
  return (await res.json()) as SiteData;
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

const BIRTH_KEY = "zwergenplan.geburtsdatum";

/** Geburtsdatum bleibt ausschließlich im Browser. */
export function loadBirthDate(): string | undefined {
  try {
    const value = localStorage.getItem(BIRTH_KEY);
    // Beschädigte Werte ignorieren – sonst würfe die Altersprüfung beim Rendern.
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveBirthDate(value: string | undefined): void {
  try {
    if (value) localStorage.setItem(BIRTH_KEY, value);
    else localStorage.removeItem(BIRTH_KEY);
  } catch {
    // privater Modus o. ä. – Filter gilt dann nur für diese Sitzung
  }
}
