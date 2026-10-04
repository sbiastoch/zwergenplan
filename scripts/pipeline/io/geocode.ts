/** Nominatim-Geocoding (max. 1 Anfrage/s, gecacht), aus route.geocode. Für neue Orte im Katalog. */
import { z } from "zod";
import { readCache, writeCache } from "./cache.ts";
import { fetchJson, withParams } from "./http.ts";

export interface GeoResult {
  lat: number;
  lon: number;
  district?: string;
  display: string;
}

const UA = "zwergenplan-pipeline/1.0 (private use)";
const NominatimHits = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
    address: z.record(z.string(), z.string()).optional(),
  }),
);
const COORD = /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/;
let last = 0;

/** „Gemeindehaus X, Musterstr. 3, 90402 Nürnberg“ → „Musterstr. 3, 90402 Nürnberg“ */
function streetPart(address: string): string | undefined {
  const parts = address
    .replace(/\([^)]*\)/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const i = parts.findIndex((p) => /[A-Za-zäöüß]\.?\s*\d/.test(p) && !/^\d{5}/.test(p));
  return i > 0 ? parts.slice(i).join(", ") : undefined;
}

async function query(address: string): Promise<GeoResult | undefined> {
  const m = COORD.exec(address);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), display: address };
  const cache = readCache<Record<string, GeoResult | null>>("geocode.json") ?? {};
  if (address in cache) return cache[address] ?? undefined;
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = withParams("https://nominatim.openstreetmap.org/search", {
    q: address,
    format: "jsonv2",
    addressdetails: 1,
    limit: 1,
    countrycodes: "de",
  });
  const hits = NominatimHits.parse((await fetchJson(url, { headers: { "User-Agent": UA } })) ?? []);
  const hit = hits?.[0];
  const district = hit?.address?.["suburb"] ?? hit?.address?.["city_district"] ?? hit?.address?.["quarter"];
  const result = hit
    ? { lat: Number(hit.lat), lon: Number(hit.lon), display: hit.display_name, ...(district ? { district } : {}) }
    : undefined;
  writeCache("geocode.json", { ...cache, [address]: result ?? null });
  return result;
}

export async function geocode(address: string): Promise<GeoResult | undefined> {
  const direct = await query(address);
  if (direct) return direct;
  const alt = streetPart(address);
  return alt ? query(alt) : undefined;
}
