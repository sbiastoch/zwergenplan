/**
 * Kartenkacheln von OpenFreeMap (Plan 0005, E4; ADR 0008). Die **einzige** Stelle mit dem
 * Kachel-Host. MapLibre lädt selbst; `guardTileRequest` sitzt als `transformRequest` davor und
 * lässt nur diesen Host durch, ohne Querystring und Fragment. So kann nichts außer der
 * Kachelkoordinate an OpenFreeMap gehen, und nie ein anderer Drittanbieter (docs/architecture.md).
 *
 * Die Pflicht-Attribution (OpenFreeMap, © OpenMapTiles, OpenStreetMap, je verlinkt) liefert OpenFreeMap
 * selbst in der TileJSON der Vektorquelle (`/planet`), MapLibre zeigt sie an. Ohne TileJSON gibt es auch
 * keine Kacheln. Eine eigene `customAttribution` stand doppelt da (Browser-Review live, W1).
 */

/** Ohne abschließenden Schrägstrich, wie `URL.origin`. Export erst, wenn ihn jemand braucht (knip). */
const TILE_ORIGIN = "https://tiles.openfreemap.org";

/** Stil hell `positron`, dunkel `dark` (E10). */
export function styleUrl(dark: boolean): string {
  return `${TILE_ORIGIN}/styles/${dark ? "dark" : "positron"}`;
}

/** lokale Daten von MapLibre selbst (Worker, Bilder) – kein Request ins Netz */
const LOCAL_SCHEMES = ["blob:", "data:"];

function isTileUrl(url: string): boolean {
  // Auch ein leeres „?“ oder „#“ zählt; `URL.search`/`URL.hash` wären dann leer.
  if (url.includes("?") || url.includes("#")) return false;
  try {
    const parsed = new URL(url);
    return parsed.origin === TILE_ORIGIN && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

/**
 * `transformRequest` für MapLibre: Durch kommen `https:` auf `TILE_ORIGIN` ohne Querystring und
 * Fragment sowie `blob:` und `data:`, jeweils unverändert. Alles andere wirft, damit der Request
 * gar nicht erst entsteht.
 */
export function guardTileRequest(url: string): { url: string } {
  if (LOCAL_SCHEMES.some((scheme) => url.startsWith(scheme)) || isTileUrl(url)) return { url };
  throw new Error("Karten-Request an fremde Adresse blockiert");
}
