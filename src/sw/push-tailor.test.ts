import { afterEach, describe, expect, it, vi } from "vitest";
import { placeKey } from "../domain/place-key.ts";
import type { Origin, ReachFn } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { FIXTURE_NOW, type FixtureKey, fixtureKey, fixtureSiteOffers } from "../domain/test-fixtures.ts";
import { originFromStored, type TailorEnv, tailorPush } from "./push-tailor.ts";

const offers = fixtureSiteOffers();
const id = (key: FixtureKey) => {
  const offer = offers.find((o) => fixtureKey(o) === key);
  if (!offer) throw new Error(key);
  return offer.id;
};
const allIds = offers.map((o) => o.id);
const without = (...keys: FixtureKey[]) => allIds.filter((i) => !keys.map(id).includes(i));

/** Wegzeit wie in filter.test.ts: Bibliothek 15,6 Min., Musikschule 29,6 Min. */
const MINUTES: Record<string, number> = {
  "theater-beispiel-buehne": 3.6,
  "familientreff-beispiel-haus": 13.6,
  "stadtbibliothek-beispiel-zentrum": 15.6,
  "musikschule-beispiel-sued": 29.6,
  "gemeinde-beispiel-gemeindehaus": 32.6,
};
const byPlace = new Map(offers.map((o: SiteOffer) => [placeKey(o.venue.geo), MINUTES[o.venueId] ?? Number.NaN]));
const wegzeit: ReachFn = ({ geo }) => ({
  kind: "oepnv",
  minutes: byPlace.get(placeKey(geo)) ?? Number.NaN,
  byFoot: false,
});

const FRESH_TABLE = { version: 2, id: "frisch" };
const STALE_TABLE = { version: 2, id: "alt" };

function env(
  stored: Record<string, unknown>,
  options: { tableFails?: boolean; cached?: unknown; siteFails?: boolean; hang?: boolean; setFails?: boolean } = {},
) {
  const writes: [string, unknown][] = [];
  const reachCalls: { table: unknown; origin: Origin }[] = [];
  const e: TailorEnv = {
    timeoutMs: 5000,
    fetchJson: async (path) => {
      if (options.hang) return new Promise(() => undefined);
      if (path === "data/site.json") {
        if (options.siteFails) throw new TypeError("offline");
        return { offers };
      }
      if (options.tableFails) throw new TypeError("offline");
      return FRESH_TABLE;
    },
    cachedJson: async () => options.cached,
    store: {
      get: async (key) => stored[key],
      set: async (key, value) => {
        if (options.setFails) throw new Error("voll");
        writes.push([key, value]);
      },
    },
    reachFor: (table, _offers, origin) => {
      reachCalls.push({ table, origin });
      return wegzeit;
    },
  };
  return { e, writes, reachCalls };
}

const run = (e: TailorEnv, test = false) => tailorPush({ now: FIXTURE_NOW, test, env: e });

afterEach(() => {
  vi.useRealTimers();
});

describe("tailorPush", () => {
  it("ohne Abos und Alter: alle neuen, schreibt danach die IDs als gesehen", async () => {
    const { e, writes } = env({ seenIds: without("musikgarten-1", "krabbelreime") });
    expect(await run(e)).toEqual({
      kind: "text",
      text: {
        title: "2 neue Angebote im Zwergenplan",
        // Reihenfolge von site.json (dort sortiert)
        body: "Krabbelreime & Fingerspiele und Musikgarten 1 (1–2 Jahre)",
        hits: [id("krabbelreime"), id("musikgarten-1")],
      },
    });
    expect(writes).toEqual([["seenIds", allIds]]);
  });

  it("mit Abo und Alter", async () => {
    const { e } = env({
      seenIds: without("musikgarten-1", "krabbelreime", "pekip-herbst"),
      searches: '["kat=musik"]',
      birthDate: "2025-08-05",
    });
    const result = await run(e);
    expect(result.kind === "text" && result.text.title).toBe("2 neue Angebote für deine Suchen");
  });

  it("Abo mit Wegzeit ab einem Stadtteil: die Musikschule (29,6 Min.) fällt heraus", async () => {
    const { e, reachCalls } = env({
      seenIds: without("musikgarten-1", "krabbelreime"),
      searches: '["kat=musik&wegzeit=20"]',
      origin: "gostenhof",
    });
    const result = await run(e);
    expect(result.kind === "text" && result.text.hits).toEqual([id("krabbelreime")]);
    expect(reachCalls).toHaveLength(1);
    expect(reachCalls[0]?.table).toBe(FRESH_TABLE);
    expect(reachCalls[0]?.origin).toMatchObject({ source: "stadtteil", districtId: "gostenhof" });
  });

  it("Abo mit Wegzeit ohne Startpunkt: die Grenze wirkt nicht", async () => {
    const { e, reachCalls } = env({
      seenIds: without("musikgarten-1", "krabbelreime"),
      searches: '["kat=musik&wegzeit=20"]',
    });
    const result = await run(e);
    expect(result.kind === "text" && result.text.hits).toHaveLength(2);
    expect(reachCalls).toEqual([]);
  });

  it("nimmt die Tabelle aus dem Netz, nur bei Netzfehler die Kopie (eine alte Kopie passt oft nicht mehr)", async () => {
    const fresh = env({ seenIds: [], origin: "gostenhof" }, { cached: STALE_TABLE });
    await run(fresh.e);
    expect(fresh.reachCalls[0]?.table).toBe(FRESH_TABLE);
    const offline = env({ seenIds: [], origin: "gostenhof" }, { tableFails: true, cached: STALE_TABLE });
    await run(offline.e);
    expect(offline.reachCalls[0]?.table).toBe(STALE_TABLE);
    const nothing = env({ seenIds: [], origin: "gostenhof" }, { tableFails: true });
    expect((await run(nothing.e)).kind).toBe("text");
    expect(nothing.reachCalls).toEqual([]);
  });

  it("ohne gesehene IDs: kein Zuschnitt, aber die IDs werden geschrieben", async () => {
    const { e, writes } = env({});
    expect(await run(e)).toEqual({ kind: "nichts" });
    expect(writes).toEqual([["seenIds", allIds]]);
  });

  it("Testversand schreibt nichts, auch ohne gesehene IDs", async () => {
    const withIds = env({ seenIds: without("krabbelreime") });
    expect((await run(withIds.e, true)).kind).toBe("text");
    expect(withIds.writes).toEqual([]);
    const noIds = env({});
    expect(await run(noIds.e, true)).toEqual({ kind: "nichts" });
    expect(noIds.writes).toEqual([]);
  });

  it("scheitert das Schreiben, kommt der Text trotzdem", async () => {
    const { e } = env({ seenIds: without("krabbelreime") }, { setFails: true });
    expect((await run(e)).kind).toBe("text");
  });

  it("ohne site.json: Fehler (das System zeigt den allgemeinen Text)", async () => {
    const { e, writes } = env({ seenIds: [] }, { siteFails: true });
    expect(await run(e)).toEqual({ kind: "fehler" });
    expect(writes).toEqual([]);
  });

  it("hängt ein Schritt, ist nach dem Zeitlimit Schluss, und danach wird nichts mehr geschrieben", async () => {
    vi.useFakeTimers();
    const { e, writes } = env({ seenIds: [] }, { hang: true });
    const result = run(e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ kind: "zeit" });
    expect(writes).toEqual([]);
  });
});

describe("originFromStored", () => {
  it("Stadtteil-ID → Punkt des Stadtteils", () => {
    expect(originFromStored("gostenhof")).toMatchObject({ source: "stadtteil", districtId: "gostenhof" });
    expect(originFromStored("gibt-es-nicht")).toBeUndefined();
  });

  it("gespeicherter Punkt → erneut gerundet, nur in der Stadt (wie storedPointOrigin)", () => {
    expect(originFromStored({ source: "standort", lat: 49.45234, lon: 11.07689 })).toMatchObject({
      source: "standort",
      point: { lat: 49.452, lon: 11.077 },
    });
    expect(originFromStored({ source: "karte", lat: 49.452, lon: 11.077 })?.source).toBe("karte");
    // dieselben Fälle wie storedPointOrigin in origin-state.test.ts: außerhalb, kaputt, unbekannte Quelle
    expect(originFromStored({ source: "standort", lat: 48.137, lon: 11.575 })).toBeUndefined();
    expect(originFromStored({ source: "karte", lat: 0, lon: 0 })).toBeUndefined();
    expect(originFromStored({ source: "standort", lat: Number.NaN, lon: 11.077 })).toBeUndefined();
    expect(originFromStored({ source: "standort", lat: "49", lon: 11 })).toBeUndefined();
    expect(originFromStored({ source: "stadtteil", lat: 49.452, lon: 11.077 })).toBeUndefined();
    expect(originFromStored({ source: "standort", lat: Number.POSITIVE_INFINITY, lon: 11 })).toBeUndefined();
    expect(originFromStored(null)).toBeUndefined();
    expect(originFromStored(42)).toBeUndefined();
  });
});
