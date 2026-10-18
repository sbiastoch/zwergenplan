import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Plan 0039, E2: Geocoding liefert die Gemeinde, der Cache ist versioniert. Ohne Netz: Fake-fetch, Cache im Temp-Ordner. */
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zp-geocode-"));
  // cache.ts liest XDG_CACHE_HOME beim Laden des Moduls, darum je Test frisch importieren
  vi.stubEnv("XDG_CACHE_HOME", dir);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const load = async () => (await import("./geocode.ts")).geocode;

function nominatim(address: Record<string, string>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    const body = [{ lat: "51.204", lon: "6.684", display_name: "Neuss Hbf, Neuss", address }];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    // Cast nötig: das Fake deckt nur die von io/http.ts genutzte Signatur ab, nicht `fetch.preconnect`
  }) as typeof fetch;
  return { impl, calls };
}

describe("geocode: Gemeinde (Plan 0039, E2)", () => {
  it("füllt municipality aus city und schreibt den versionierten Cache", async () => {
    const geocode = await load();
    const f = nominatim({ city: "Neuss", suburb: "Innenstadt" });
    const g = await geocode("Neuss Hbf", { fetchImpl: f.impl });
    expect(g).toEqual({
      lat: 51.204,
      lon: 6.684,
      display: "Neuss Hbf, Neuss",
      district: "Innenstadt",
      municipality: "Neuss",
    });
    expect(f.calls).toHaveLength(1);
    const cache = JSON.parse(readFileSync(join(dir, "zwergenplan", "geocode-v2.json"), "utf8"));
    expect(cache["Neuss Hbf"]?.municipality).toBe("Neuss");
  });

  it("ohne city: town, village, municipality in dieser Reihenfolge", async () => {
    const geocode = await load();
    const f = nominatim({ village: "Dorf", municipality: "Amt", town: "Kleinstadt" });
    expect((await geocode("x", { fetchImpl: f.impl }))?.municipality).toBe("Kleinstadt");
  });

  it("ohne passende Felder: keine Gemeinde", async () => {
    const geocode = await load();
    const f = nominatim({ county: "Kreis" });
    const g = await geocode("x", { fetchImpl: f.impl });
    expect(g).toBeDefined();
    expect(g?.municipality).toBeUndefined();
  });

  it("alte Cache-Einträge (geocode.json, ohne Gemeinde) gelten nicht", async () => {
    mkdirSync(join(dir, "zwergenplan"), { recursive: true });
    writeFileSync(join(dir, "zwergenplan", "geocode.json"), JSON.stringify({ x: { lat: 1, lon: 2, display: "alt" } }));
    const geocode = await load();
    const f = nominatim({ city: "Düsseldorf" });
    expect((await geocode("x", { fetchImpl: f.impl }))?.municipality).toBe("Düsseldorf");
    expect(f.calls).toHaveLength(1);
  });

  it("Koordinaten-Adresse: ohne Abruf und ohne Gemeinde", async () => {
    const geocode = await load();
    const f = nominatim({ city: "Neuss" });
    expect(await geocode("51.204, 6.684", { fetchImpl: f.impl })).toEqual({
      lat: 51.204,
      lon: 6.684,
      display: "51.204, 6.684",
    });
    expect(f.calls).toHaveLength(0);
  });
});
