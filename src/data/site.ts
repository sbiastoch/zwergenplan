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
