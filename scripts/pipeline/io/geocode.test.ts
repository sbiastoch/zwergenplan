import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Ort } from "../lib/discover-state.ts";
import {
  checkFaelle,
  createGeocoder,
  GeocodeFaelle,
  type GeocoderOptions,
  MIN_GAP_MS,
  recordingKey,
} from "./geocode.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "geocode-"));
  dirs.push(d);
  return d;
};

interface Hit {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
}
const IN = { lat: "49.4500", lon: "11.0700" };
const OUT = { lat: "48.1400", lon: "11.5800" };
const street = (road: string, nr: string): Record<string, string> => ({
  road,
  house_number: nr,
  postcode: "90402",
  city: "Nürnberg",
  suburb: "Altstadt",
});

/** Fake-Nominatim: `route` entscheidet je Anfrage; jede Anfrage wird mit der Fake-Uhr vermerkt */
function fake(route: (p: URLSearchParams) => Hit[] | number) {
  let t = 0;
  const calls: Array<{ at: number; params: URLSearchParams }> = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push({ at: t, params: url.searchParams });
    const r = route(url.searchParams);
    return typeof r === "number"
      ? new Response("x", { status: r })
      : new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  };
  const clock = {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
  return { fetchImpl, clock, calls };
}

function geocoder(f: ReturnType<typeof fake>, o: Partial<GeocoderOptions> = {}) {
  return createGeocoder({
    today: "2026-10-29",
    cacheDir: tempDir(),
    fetchImpl: f.fetchImpl,
    clock: f.clock,
    ...o,
  });
}

const q = { region: "nuernberg" as const };

describe("Stufen (Plan 0050, E5)", () => {
  it("Stufe 1 mit Treffer in der bbox: eine Anfrage, Adresse aus addressdetails", async () => {
    const f = fake(() => [
      { ...OUT, display_name: "München" },
      { ...IN, display_name: "lang", address: street("Musterstraße", "3") },
    ]);
    const g = geocoder(f);
    const r = await g.geocode("Gemeindehaus, Musterstr. 3, 90402 Nürnberg", q);
    expect(r).toEqual({
      kind: "treffer",
      stufe: 1,
      geo: { lat: 49.45, lon: 11.07, display: "Musterstraße 3, 90402 Nürnberg", district: "Altstadt" },
    });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.params.get("q")).toBe("Musterstraße 3, 90402 Nürnberg");
    expect(f.calls[0]?.params.get("limit")).toBe("5");
  });

  it("Treffer außerhalb zählt nicht; Stufe 2 strukturiert mit viewbox und bounded", async () => {
    const f = fake((p) =>
      p.has("street")
        ? [{ ...IN, display_name: "x", address: street("Musterstraße", "3") }]
        : [{ ...OUT, display_name: "M" }],
    );
    const r = await geocoder(f).geocode("Musterstraße 3, 90402 Nürnberg", q);
    expect(r).toMatchObject({ kind: "treffer", stufe: 2 });
    expect(f.calls).toHaveLength(2);
    const p = f.calls[1]?.params;
    expect([p?.get("street"), p?.get("city"), p?.get("postalcode"), p?.get("bounded")]).toEqual([
      "Musterstraße 3",
      "Nürnberg",
      "90402",
      "1",
    ]);
    expect(p?.get("viewbox")).toBeTruthy();
  });

  it("Stufe 2 auch mit Straßenname ohne Nummer aus dem Namen, Stadtteil-Zusatz fällt weg", async () => {
    const f = fake((p) =>
      p.get("street") === "Fürreuthweg" && p.get("city") === "Nürnberg" ? [{ ...IN, display_name: "x" }] : [],
    );
    const r = await geocoder(f).geocode("Turnhalle Volksschule Fürreuthweg, Nürnberg-Eibach", q);
    expect(r).toMatchObject({ kind: "treffer", stufe: 2 });
  });

  it("Stufe 3: benannter Ort nur mit erlaubter Kategorie, ohne road „Name, PLZ Ort“", async () => {
    const f = fake((p) => {
      if (!p.get("q")?.startsWith("Ritterbad")) return [];
      return [
        { ...IN, display_name: "Café", name: "Ritterbad-Café", category: "amenity", type: "cafe" },
        {
          ...IN,
          display_name: "Ritterbad, …",
          name: "Ritterbad",
          category: "leisure",
          type: "swimming_pool",
          address: { postcode: "90411", city: "Nürnberg" },
        },
      ];
    });
    const r = await geocoder(f).geocode("Hallenbad", { ...q, venueName: "Ritterbad" });
    expect(r).toMatchObject({ kind: "treffer", stufe: 3, geo: { display: "Ritterbad, 90411 Nürnberg" } });
    expect(f.calls.at(-1)?.params.get("q")).toBe("Ritterbad, Nürnberg");
  });

  it("Stufe 2 und 3 nur nach Fehlschlag; ohne Straße keine Stufe 2, gleiche Anfrage nicht doppelt", async () => {
    const f = fake(() => []);
    expect(await geocoder(f).geocode("Ritterbad, Nürnberg", q)).toEqual({ kind: "kein-treffer" });
    expect(f.calls.map((c) => c.params.get("q"))).toEqual(["Ritterbad, Nürnberg"]);
    const f2 = fake(() => []);
    await geocoder(f2).geocode("Turnhalle, Musterstraße 3, 90402 Nürnberg", q);
    expect(f2.calls.map((c) => (c.params.has("street") ? "2" : c.params.get("q")))).toEqual([
      "Musterstraße 3, 90402 Nürnberg",
      "2",
      "Turnhalle, Nürnberg",
    ]);
  });

  it("429 ist ein Ausfall, kein „kein Treffer“, und wird nicht gespeichert", async () => {
    const f = fake(() => 429);
    const g = geocoder(f);
    const r = await g.geocode("Musterstraße 3, 90402 Nürnberg", q);
    expect(r).toMatchObject({ kind: "ausfall" });
    expect(f.calls).toHaveLength(1);
    expect(g.newOrte("nuernberg")).toEqual({});
  });
});

describe("Prüffälle gegen die Aufzeichnungen (Plan 0050, S1)", () => {
  const fixtures = join(import.meta.dirname, "../../../tests/fixtures/pipeline");
  const file = GeocodeFaelle.parse(JSON.parse(readFileSync(join(fixtures, "geocode-faelle.json"), "utf8")));
  const recorded: Record<string, unknown> = JSON.parse(readFileSync(join(fixtures, "geocode-aufnahmen.json"), "utf8"));

  it("jeder Fall trifft innerhalb der Toleranz bzw. ergibt „kein Treffer“", async () => {
    const f = fake(() => 500);
    const replay: typeof fetch = async (input) => {
      const body = recorded[recordingKey(String(input))];
      return body === undefined ? f.fetchImpl(input) : new Response(JSON.stringify(body), { status: 200 });
    };
    const results = await checkFaelle(file, geocoder({ ...f, fetchImpl: replay }));
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
});

describe("Policy: Rate und Caches", () => {
  it(`höchstens 4 Anfragen pro Minute (Abstand ≥ ${MIN_GAP_MS} ms), Wartezeit im Zähler`, async () => {
    const f = fake(() => []);
    const g = geocoder(f);
    for (const a of ["A-Weg 1, Nürnberg", "B-Weg 2, Nürnberg", "C-Weg 3, Nürnberg"]) await g.geocode(a, q);
    const at = f.calls.map((c) => c.at);
    for (let i = 1; i < at.length; i++) expect((at[i] ?? 0) - (at[i - 1] ?? 0)).toBeGreaterThanOrEqual(15_000);
    expect(g.stats().requests).toBe(f.calls.length);
    expect(g.stats().waitMs).toBeGreaterThan(0);
  });

  it("Adresse eines Katalog-Orts: keine Anfrage", async () => {
    const f = fake(() => []);
    const known = new Map([["Musterstraße 3, 90402 Nürnberg", { lat: 49.4, lon: 11.1, display: "Katalog" }]]);
    const r = await geocoder(f, { known }).geocode("Haus X, Musterstr. 3, 90402 Nürnberg", q);
    expect(r).toMatchObject({ kind: "treffer", geo: { display: "Katalog" } });
    expect(f.calls).toHaveLength(0);
  });

  it("Treffer landen in newOrte und im Lauf-Cache; ein zweiter Geocoder fragt nicht neu", async () => {
    const cacheDir = tempDir();
    const f = fake(() => [{ ...IN, display_name: "x", address: street("Musterstraße", "3") }]);
    const g = geocoder(f, { cacheDir });
    await g.geocode("Musterstraße 3, 90402 Nürnberg", q);
    expect(Object.values(g.newOrte("nuernberg"))).toEqual([
      expect.objectContaining({ stufe: 1, datum: "2026-10-29", adresse: "Musterstraße 3, 90402 Nürnberg" }),
    ]);
    const f2 = fake(() => []);
    const r = await geocoder(f2, { cacheDir }).geocode("Musterstr. 3, 90402 Nürnberg", q);
    expect(r).toMatchObject({ kind: "treffer" });
    expect(f2.calls).toHaveLength(0);
  });

  it("orte aus dem Zustand ersparen die Anfrage; älter als 12 Monate wird neu gefragt", async () => {
    const ort: Ort = {
      lat: 49.45,
      lon: 11.07,
      adresse: "Musterstraße 3, 90402 Nürnberg",
      stufe: 2,
      datum: "2026-01-01",
    };
    const f = fake(() => [{ ...IN, display_name: "x", address: street("Musterstraße", "3") }]);
    const g = geocoder(f, { orte: { nuernberg: { "Musterstraße 3, 90402 Nürnberg": ort } } });
    expect(await g.geocode("Musterstraße 3, 90402 Nürnberg", q)).toMatchObject({ kind: "treffer", stufe: 2 });
    expect(f.calls).toHaveLength(0);
    const old = geocoder(f, {
      orte: { nuernberg: { "Musterstraße 3, 90402 Nürnberg": { ...ort, datum: "2025-10-01" } } },
    });
    await old.geocode("Musterstraße 3, 90402 Nürnberg", q);
    expect(f.calls).toHaveLength(1);
  });

  it("„kein Treffer“ im Lauf nur einmal gefragt, über Läufe 30 Tage im Lauf-Cache, nie in orte", async () => {
    const cacheDir = tempDir();
    const f = fake(() => []);
    const g = geocoder(f, { cacheDir });
    await g.geocode("Nirgendweg 1, Nürnberg", q);
    const n = f.calls.length;
    await g.geocode("Nirgendweg 1, Nürnberg", q);
    expect(f.calls).toHaveLength(n);
    expect(g.newOrte("nuernberg")).toEqual({});
    await geocoder(f, { cacheDir, today: "2026-11-20" }).geocode("Nirgendweg 1, Nürnberg", q);
    expect(f.calls).toHaveLength(n);
    await geocoder(f, { cacheDir, today: "2026-12-05" }).geocode("Nirgendweg 1, Nürnberg", q);
    expect(f.calls.length).toBeGreaterThan(n);
  });

  it("ungültige Einträge im Lauf-Cache werden verworfen; geocode.json wird nicht gelesen", async () => {
    const cacheDir = tempDir();
    writeFileSync(
      join(cacheDir, "geocode-v3.json"),
      JSON.stringify({ nuernberg: { "Musterstraße 3, 90402 Nürnberg": { lat: "kaputt" } } }),
    );
    writeFileSync(join(cacheDir, "geocode.json"), JSON.stringify({ "Musterstraße 3, 90402 Nürnberg": null }));
    const f = fake(() => [{ ...IN, display_name: "x", address: street("Musterstraße", "3") }]);
    expect(await geocoder(f, { cacheDir }).geocode("Musterstraße 3, 90402 Nürnberg", q)).toMatchObject({
      kind: "treffer",
    });
    expect(f.calls).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(cacheDir, "geocode-v3.json"), "utf8")).nuernberg).toHaveProperty(
      ["Musterstraße 3, 90402 Nürnberg", "treffer", "stufe"],
      1,
    );
  });

  it("Schlüssel enthält venueName: gleiche Adresse, anderer Ort wird getrennt gefragt", async () => {
    const f = fake(() => []);
    const g = geocoder(f);
    await g.geocode("Nürnberg", { ...q, venueName: "Ritterbad" });
    const n = f.calls.length;
    await g.geocode("Nürnberg", { ...q, venueName: "Südstadtbad" });
    expect(f.calls.length).toBeGreaterThan(n);
  });

  it("Tests schreiben nie in den echten Cache (vitest.setup.ts setzt XDG_CACHE_HOME)", () => {
    expect(process.env["XDG_CACHE_HOME"]?.startsWith(tmpdir())).toBe(true);
  });
});
