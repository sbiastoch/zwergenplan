import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEEDS } from "../lib/gtfs.ts";
import { fetchFeed, resolveFeedUrl, unzipFeed } from "./gtfs.ts";

/** Fake-fetch: Antwort je URL, protokolliert URL und Header jedes Aufrufs (keine echten Netzzugriffe) */
function fakeFetch(routes: Record<string, (headers: Headers) => Response>) {
  const log: Array<{ url: string; headers: Headers }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    log.push({ url, headers });
    const route = routes[url];
    if (!route) throw new Error(`unerwarteter Abruf ${url}`);
    return route(headers);
    // Cast nötig: das Fake deckt nur die von io/gtfs.ts genutzte Signatur ab, nicht `fetch.preconnect`
  }) as typeof fetch;
  return { impl, log };
}

const CKAN_API = "https://api.opendata-oepnv.de/api/3/action/package_show?id=soll-fahrplandaten-vrr";
const resource = (id: string, file: string, format: string, created: string) => ({
  name: `Soll-Fahrplandaten VRR – ${id}`,
  url: `https://api.opendata-oepnv.de/dataset/d/resource/${id}/download/${file}`,
  format,
  created,
});
const ckanBody = (resources: unknown[]) => ({ success: true, result: { resources } });
const json = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 });

describe("resolveFeedUrl (Plan 0039, E4)", () => {
  it("nimmt aus der CKAN-Antwort die jüngste ZIP-Ressource google_transit.zip, nicht nach Namen", async () => {
    const f = fakeFetch({
      [CKAN_API]: json(
        ckanBody([
          resource("aug-iv", "google_transit.zip", "ZIP", "2026-08-26T11:12:10.884275"),
          resource("okt", "google_transit.zip", "ZIP", "2026-10-15T08:03:48.176548"),
          resource("doku", "beschreibung.pdf", "PDF", "2026-10-16T09:00:00.000000"),
          resource("fremd", "netzplan.zip", "ZIP", "2026-10-17T09:00:00.000000"),
          resource("aug-ii", "google_transit.zip", "zip", "2026-08-13T07:34:33.310825"),
        ]),
      ),
    });
    expect(await resolveFeedUrl(FEEDS.vrr.location, f.impl)).toBe(
      "https://api.opendata-oepnv.de/dataset/d/resource/okt/download/google_transit.zip",
    );
    expect(f.log.map((l) => l.url)).toEqual([CKAN_API]);
  });

  it("bricht ab, wenn der Datensatz keine passende Ressource hat oder die Antwort unlesbar ist", async () => {
    const none = fakeFetch({ [CKAN_API]: json(ckanBody([resource("x", "netzplan.zip", "ZIP", "2026-10-01")])) });
    await expect(resolveFeedUrl(FEEDS.vrr.location, none.impl)).rejects.toThrow(/keine ZIP-Ressource/);
    const broken = fakeFetch({ [CKAN_API]: json({ success: false }) });
    await expect(resolveFeedUrl(FEEDS.vrr.location, broken.impl)).rejects.toThrow(/CKAN-Antwort unlesbar/);
  });

  it("eine feste URL braucht keinen Abruf", async () => {
    const f = fakeFetch({});
    expect(await resolveFeedUrl(FEEDS.vgn.location, f.impl)).toBe("https://www.vgn.de/opendata/GTFS.zip");
    expect(f.log).toEqual([]);
  });
});

const FEED_FILES = {
  "routes.txt": "route_id,route_short_name,route_long_name,route_type\n",
  "trips.txt": "route_id,service_id,trip_id\n",
  "stops.txt": "stop_id,stop_lat,stop_lon,location_type\n",
  "calendar.txt": "service_id\n",
  "calendar_dates.txt": "service_id,date,exception_type\n",
  "stop_times.txt": "trip_id,stop_id\nä,1\n",
};
const zipOf = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));

describe("unzipFeed", () => {
  it("entpackt die Dateien des Feeds, auch in einem Unterordner; stop_times.txt blockweise", () => {
    const nested = Object.fromEntries(Object.entries(FEED_FILES).map(([name, text]) => [`gtfs/${name}`, text]));
    const texts = unzipFeed(zipOf(nested));
    expect(texts.routes).toBe(FEED_FILES["routes.txt"]);
    expect([...texts.stopTimes].join("")).toBe(FEED_FILES["stop_times.txt"]);
  });

  it("bricht bei einem fremden ZIP ohne stop_times.txt laut ab", () => {
    const { "stop_times.txt": _, ...rest } = FEED_FILES;
    expect(() => unzipFeed(zipOf({ ...rest, "liesmich.txt": "kein Fahrplan" }))).toThrow(
      /stop_times\.txt fehlt im Feed/,
    );
  });
});

describe("fetchFeed: Cache je Netz und bedingter GET", () => {
  const zip = zipOf(FEED_FILES);
  const lastModified = "Thu, 15 Oct 2026 08:03:48 GMT";
  const zipResponse = () =>
    new Response(zip, { status: 200, headers: { "last-modified": lastModified, etag: '"v1"' } });

  beforeEach(() => {
    vi.stubEnv("XDG_CACHE_HOME", mkdtempSync(join(tmpdir(), "zp-gtfs-")));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fragt beim zweiten Mal mit If-None-Match/If-Modified-Since und nimmt bei 304 den Cache", async () => {
    const url = "https://www.vgn.de/opendata/GTFS.zip";
    let calls = 0;
    const f = fakeFetch({ [url]: () => (calls++ === 0 ? zipResponse() : new Response(null, { status: 304 })) });
    const first = await fetchFeed("vgn", { fetchImpl: f.impl });
    expect(first.status).toBe(200);
    expect(first.url).toBe(url);
    const second = await fetchFeed("vgn", { fetchImpl: f.impl });
    expect(second.status).toBe(304);
    expect(second.lastModified).toBe(lastModified);
    expect(second.zip()).toEqual(zip);
    expect(f.log[0]?.headers.get("if-none-match")).toBeNull();
    expect(f.log[1]?.headers.get("if-none-match")).toBe('"v1"');
    expect(f.log[1]?.headers.get("if-modified-since")).toBe(lastModified);
  });

  it("die Caches der Netze sind getrennt, eine neue Ausgabe (neue URL) lädt ohne Bedingung", async () => {
    const vgnUrl = "https://www.vgn.de/opendata/GTFS.zip";
    let edition = "okt";
    const vrrUrl = () => `https://api.opendata-oepnv.de/dataset/d/resource/${edition}/download/google_transit.zip`;
    const f = fakeFetch({
      [vgnUrl]: zipResponse,
      [CKAN_API]: () =>
        json(
          ckanBody([resource(edition, "google_transit.zip", "ZIP", edition === "okt" ? "2026-10-15" : "2026-11-15")]),
        )(),
      "https://api.opendata-oepnv.de/dataset/d/resource/okt/download/google_transit.zip": zipResponse,
      "https://api.opendata-oepnv.de/dataset/d/resource/nov/download/google_transit.zip": zipResponse,
    });
    await fetchFeed("vgn", { fetchImpl: f.impl });
    const okt = await fetchFeed("vrr", { fetchImpl: f.impl });
    expect(okt.status).toBe(200);
    // der VGN-Cache macht den VRR-Abruf nicht bedingt
    expect(f.log.find((l) => l.url === vrrUrl())?.headers.get("if-none-match")).toBeNull();
    edition = "nov";
    const nov = await fetchFeed("vrr", { fetchImpl: f.impl });
    expect(nov.status).toBe(200);
    expect(nov.url).toBe(vrrUrl());
    expect(f.log.find((l) => l.url === vrrUrl())?.headers.get("if-none-match")).toBeNull();
  });
});
