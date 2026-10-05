/**
 * VGN-GTFS für den Fahrplanauszug (Plan 0009, E4): bedingter GET mit Cache unter ~/.cache/zwergenplan/gtfs/
 * (wie io/cache.ts), Entpacken mit fflate, Lesen und Schreiben von data/oepnv/fahrplan.json. Keine Logik:
 * Auswahl und Zuschnitt liegen in lib/gtfs.ts.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix } from "node:path";
import { unzipSync } from "fflate";
import { z } from "zod";
import { Timetable } from "../../../src/domain/schema.ts";
import { GTFS_FILES, type GtfsTexts, gtfsTexts, VGN_FEED_URL } from "../lib/gtfs.ts";
import { ROOT } from "./files.ts";

const DIR = join(process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"), "zwergenplan", "gtfs");
const ZIP = join(DIR, "GTFS.zip");
const META = join(DIR, "meta.json");
export const TIMETABLE_FILE = join(ROOT, "data/oepnv/fahrplan.json");

const FeedMeta = z.object({ etag: z.string().optional(), lastModified: z.string(), fetchedAt: z.string() });
type FeedMeta = z.infer<typeof FeedMeta>;

export interface Feed {
  /** 200: neu geladen, 304: unverändert, ZIP aus dem Cache */
  status: 200 | 304;
  /** erst lesen, wenn gebaut wird */
  zip: () => Uint8Array;
  lastModified: string;
  /** Zeitpunkt des Downloads (bei 304 der des Cache-Inhalts) */
  fetchedAt: Date;
}

function readMeta(): FeedMeta | undefined {
  if (!existsSync(META) || !existsSync(ZIP)) return undefined;
  try {
    return FeedMeta.parse(JSON.parse(readFileSync(META, "utf8")));
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(headers: Record<string, string>, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(VGN_FEED_URL, { headers, signal: AbortSignal.timeout(180_000), redirect: "follow" });
      if (res.status < 500 || attempt >= retries) return res;
    } catch (e) {
      if (attempt >= retries) throw e;
    }
    await sleep(3000 * (attempt + 1));
  }
}

/** Lädt den Feed nur, wenn er sich geändert hat (If-None-Match / If-Modified-Since). */
export async function fetchFeed(): Promise<Feed> {
  const cached = readMeta();
  const headers: Record<string, string> = { "User-Agent": "zwergenplan-pipeline (+https://zwergenplan.app/)" };
  if (cached) {
    if (cached.etag) headers["If-None-Match"] = cached.etag;
    headers["If-Modified-Since"] = cached.lastModified;
  }
  const res = await get(headers);
  if (res.status === 304 && cached) {
    return {
      status: 304,
      zip: () => new Uint8Array(readFileSync(ZIP)),
      lastModified: cached.lastModified,
      fetchedAt: new Date(cached.fetchedAt),
    };
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status} für ${VGN_FEED_URL}`);
  const lastModified = res.headers.get("last-modified");
  if (!lastModified) throw new Error(`${VGN_FEED_URL} liefert kein Last-Modified – Feed-Titel nicht bestimmbar`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const fetchedAt = new Date();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${ZIP}.tmp`, zip);
  renameSync(`${ZIP}.tmp`, ZIP);
  const etag = res.headers.get("etag");
  const meta: FeedMeta = { lastModified, fetchedAt: fetchedAt.toISOString(), ...(etag ? { etag } : {}) };
  writeFileSync(META, JSON.stringify(meta));
  return { status: 200, zip: () => zip, lastModified, fetchedAt };
}

/** Entpackt nur die Dateien, die der Auszug braucht (stop_times.txt: 146 MB). */
export function unzipFeed(zip: Uint8Array): GtfsTexts {
  const wanted = new Set<string>(Object.values(GTFS_FILES));
  const files = unzipSync(zip, { filter: (f) => wanted.has(posix.basename(f.name)) });
  const byName = new Map(Object.entries(files).map(([name, bytes]) => [posix.basename(name), bytes] as const));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return gtfsTexts((file) => {
    const bytes = byName.get(file);
    if (!bytes) throw new Error(`${file} fehlt im Feed`);
    return decoder.decode(bytes);
  });
}

/** Der committete Auszug, falls vorhanden und gültig. */
export function readCurrentTimetable(): Timetable | undefined {
  if (!existsSync(TIMETABLE_FILE)) return undefined;
  try {
    const r = Timetable.safeParse(JSON.parse(readFileSync(TIMETABLE_FILE, "utf8")));
    return r.success ? r.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeTimetable(text: string): void {
  mkdirSync(dirname(TIMETABLE_FILE), { recursive: true });
  writeFileSync(TIMETABLE_FILE, text);
}
