/**
 * GTFS-Feeds für die Fahrplanauszüge (Plan 0009, E4; Plan 0039, E4): URL auflösen (VRR über CKAN), bedingter GET
 * mit Cache je Netz unter ~/.cache/zwergenplan/gtfs/<netz>/ (wie io/cache.ts), Entpacken mit fflate, Lesen und
 * Schreiben von data/oepnv/<netz>.json. Keine Logik: Auswahl und Zuschnitt liegen in lib/gtfs.ts.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix } from "node:path";
import { unzipSync } from "fflate";
import { z } from "zod";
import type { NetworkId } from "../../../src/domain/regions.ts";
import { type Timetable, timetableSchema } from "../../../src/domain/schema.ts";
import {
  decodeBlocks,
  FEEDS,
  type FeedLocation,
  GTFS_FILES,
  type GtfsTexts,
  gtfsTexts,
  latestCkanResource,
} from "../lib/gtfs.ts";
import { ROOT } from "./files.ts";

const USER_AGENT = "zwergenplan-pipeline (+https://zwergenplan.app/)";

/** Cache je Netz; zur Laufzeit gelesen, damit Tests XDG_CACHE_HOME umlenken können */
function cacheDir(network: NetworkId): string {
  return join(process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"), "zwergenplan", "gtfs", network);
}

/** `data/oepnv/<netz>.json` (Plan 0039, E4) */
export function timetableFile(network: NetworkId): string {
  return join(ROOT, `data/oepnv/${network}.json`);
}

/** Geschlüsselt nach URL: eine neue VRR-Ausgabe hat eine neue URL und wird ohne Bedingung geladen. */
const FeedMeta = z.object({
  url: z.string(),
  etag: z.string().optional(),
  lastModified: z.string(),
  fetchedAt: z.string(),
});
type FeedMeta = z.infer<typeof FeedMeta>;

export interface FetchedFeed {
  /** 200: neu geladen, 304: unverändert, ZIP aus dem Cache */
  status: 200 | 304;
  /** geladene URL (beim VRR die Ressource der jüngsten Ausgabe) */
  url: string;
  /** erst lesen, wenn gebaut wird */
  zip: () => Uint8Array;
  lastModified: string;
  /** Zeitpunkt des Downloads (bei 304 der des Cache-Inhalts) */
  fetchedAt: Date;
}

function readMeta(dir: string, url: string): FeedMeta | undefined {
  const meta = join(dir, "meta.json");
  if (!existsSync(meta) || !existsSync(join(dir, "feed.zip"))) return undefined;
  try {
    const parsed = FeedMeta.parse(JSON.parse(readFileSync(meta, "utf8")));
    return parsed.url === url ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  retries = 2,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(300_000), redirect: "follow" });
      if (res.status < 500 || attempt >= retries) return res;
    } catch (e) {
      if (attempt >= retries) throw e;
    }
    await sleep(3000 * (attempt + 1));
  }
}

/** URL des Feeds: fest (VGN) oder die jüngste Ressource des CKAN-Datensatzes (VRR, Plan 0039, E4). */
export async function resolveFeedUrl(location: FeedLocation, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (location.kind === "url") return location.url;
  const res = await get(location.api, { "User-Agent": USER_AGENT, Accept: "application/json" }, fetchImpl);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} für ${location.api}`);
  return latestCkanResource(await res.json(), location.fileName).url;
}

/** Lädt den Feed eines Netzes nur, wenn er sich geändert hat (If-None-Match / If-Modified-Since). */
export async function fetchFeed(network: NetworkId, opts: { fetchImpl?: typeof fetch } = {}): Promise<FetchedFeed> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = await resolveFeedUrl(FEEDS[network].location, fetchImpl);
  const dir = cacheDir(network);
  const zipFile = join(dir, "feed.zip");
  const cached = readMeta(dir, url);
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (cached) {
    if (cached.etag) headers["If-None-Match"] = cached.etag;
    headers["If-Modified-Since"] = cached.lastModified;
  }
  const res = await get(url, headers, fetchImpl);
  if (res.status === 304 && cached) {
    return {
      status: 304,
      url,
      zip: () => new Uint8Array(readFileSync(zipFile)),
      lastModified: cached.lastModified,
      fetchedAt: new Date(cached.fetchedAt),
    };
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status} für ${url}`);
  const lastModified = res.headers.get("last-modified");
  if (!lastModified) throw new Error(`${url} liefert kein Last-Modified – Feed-Titel nicht bestimmbar`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const fetchedAt = new Date();
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${zipFile}.tmp`, zip);
  renameSync(`${zipFile}.tmp`, zipFile);
  const etag = res.headers.get("etag");
  const meta: FeedMeta = { url, lastModified, fetchedAt: fetchedAt.toISOString(), ...(etag ? { etag } : {}) };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
  return { status: 200, url, zip: () => zip, lastModified, fetchedAt };
}

/**
 * Entpackt nur die Dateien, die der Auszug braucht. stop_times.txt (VGN 146 MB, VRR 665 MB) wird blockweise
 * dekodiert, denn 665 MB passen nicht in einen V8-String (Plan 0039, E4). Fehlt eine Datei, ist es kein GTFS-Feed.
 */
export function unzipFeed(zip: Uint8Array): GtfsTexts {
  const wanted = new Set<string>(Object.values(GTFS_FILES));
  const files = unzipSync(zip, { filter: (f) => wanted.has(posix.basename(f.name)) });
  const byName = new Map(Object.entries(files).map(([name, bytes]) => [posix.basename(name), bytes] as const));
  const bytesOf = (file: string) => {
    const bytes = byName.get(file);
    if (!bytes) throw new Error(`${file} fehlt im Feed – kein GTFS-Feed?`);
    return bytes;
  };
  // stop_times zuerst prüfen: ein fremdes ZIP bricht ab, bevor etwas dekodiert wird
  const stopTimes = bytesOf(GTFS_FILES.stopTimes);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return gtfsTexts(
    (file) => decoder.decode(bytesOf(file)),
    () => decodeBlocks(stopTimes),
  );
}

/** Der committete Auszug eines Netzes, falls vorhanden und gültig. */
export function readCurrentTimetable(network: NetworkId): Timetable | undefined {
  const file = timetableFile(network);
  if (!existsSync(file)) return undefined;
  try {
    const r = timetableSchema(network).safeParse(JSON.parse(readFileSync(file, "utf8")));
    return r.success ? r.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeTimetable(network: NetworkId, text: string): void {
  const file = timetableFile(network);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
