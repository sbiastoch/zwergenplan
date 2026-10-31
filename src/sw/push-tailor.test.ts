import { afterEach, describe, expect, it, vi } from "vitest";
import type { SiteOffer } from "../domain/site-data.ts";
import { FIXTURE_NOW, type FixtureKey, fixtureKey, fixtureSiteOffers } from "../domain/test-fixtures.ts";
import { type TailorEnv, tailorPush } from "./push-tailor.ts";

const offers = fixtureSiteOffers();
const id = (key: FixtureKey) => {
  const offer = offers.find((o) => fixtureKey(o) === key);
  if (!offer) throw new Error(key);
  return offer.id;
};
const allIds = offers.map((o) => o.id);
/** `site.json` vor Plan 0043: kein Angebot trägt `listedAt` */
const unlisted = offers.map(({ listedAt: _, ...o }) => o);
const without = (...keys: FixtureKey[]) => allIds.filter((i) => !keys.map(id).includes(i));

function env(
  stored: Record<string, unknown>,
  options: {
    siteFails?: boolean;
    hang?: boolean;
    setFails?: boolean;
    site?: readonly SiteOffer[];
  } = {},
) {
  const writes: [string, unknown][] = [];
  const fetched: string[] = [];
  const e: TailorEnv = {
    timeoutMs: 5000,
    fetchJson: async (path) => {
      fetched.push(path);
      if (options.hang) return new Promise(() => undefined);
      if (options.siteFails) throw new TypeError("offline");
      return { offers: options.site ?? offers };
    },
    store: {
      get: async (key) => stored[key],
      set: async (key, value) => {
        if (options.setFails) throw new Error("voll");
        writes.push([key, value]);
      },
    },
  };
  return { e, writes, fetched };
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

  it("holt nur site.json, keine Wegzeit-Tabelle (Plan 0054, Nachtrag A, N3)", async () => {
    const { e, fetched } = env({ seenIds: [], origin: "gostenhof", searches: '["kat=musik&wegzeit=20"]' });
    await run(e);
    expect(fetched).toEqual(["data/site.json"]);
  });

  it("Anbieter-Abo und Alter", async () => {
    const providers = [offers.find((o) => o.id === id("musikgarten-1"))?.providerId];
    const { e } = env({
      seenIds: without("musikgarten-1", "krabbelreime", "pekip-herbst"),
      providers,
      birthDate: "2025-08-05",
    });
    const result = await run(e);
    expect(result.kind === "text" && result.text.title).toBe("1 neues Angebot von deinen Anbietern");
  });

  it("liest die Anbieter-Abos aus dem Geräte-Speicher (Plan 0054, E3)", async () => {
    const provider = offers.find((o) => o.id === id("musikgarten-1"))?.providerId;
    const { e } = env({ seenIds: without("musikgarten-1", "krabbelreime"), providers: [provider] });
    const result = await run(e);
    expect(result.kind === "text" && result.text).toMatchObject({
      title: "1 neues Angebot von deinen Anbietern",
      hits: [id("musikgarten-1")],
    });
  });

  it("ein kaputter Wert für Anbieter-Abos zählt als keins", async () => {
    const { e } = env({ seenIds: without("musikgarten-1", "krabbelreime"), providers: "kaputt" });
    const result = await run(e);
    expect(result.kind === "text" && result.text.title).toBe("2 neue Angebote im Zwergenplan");
  });

  it("löscht die Altlast Startpunkt und Such-Abos aus dem Geräte-Speicher, auch beim Testversand (Review M1)", async () => {
    const stored = { seenIds: without("krabbelreime"), origin: "gostenhof", searches: '["kat=musik"]' };
    const normal = env(stored);
    expect((await run(normal.e)).kind).toBe("text");
    expect(normal.writes).toEqual([
      ["origin", undefined],
      ["searches", undefined],
      ["seenIds", allIds],
    ]);
    const test = env(stored);
    await run(test.e, true);
    expect(test.writes).toEqual([
      ["origin", undefined],
      ["searches", undefined],
    ]);
  });

  it("ohne gesehene IDs: zugeschnitten über listedAt (Plan 0043, E3), die IDs werden geschrieben", async () => {
    const { e, writes } = env({ birthDate: "2025-08-05" });
    expect(await run(e)).toEqual({
      kind: "text",
      text: {
        title: "2 neue Angebote passen zu 14 Monaten",
        body: "Krabbelreime & Fingerspiele und Musikgarten 1 (1–2 Jahre)",
        hits: [id("krabbelreime"), id("musikgarten-1")],
      },
    });
    expect(writes).toEqual([["seenIds", allIds]]);
  });

  it("gesehene IDs zählen nur ohne listedAt: Krabbeltreff (vorige Woche eingestellt) ist nicht neu", async () => {
    const { e } = env({ seenIds: without("krabbeltreff", "babymassage-workshop") });
    const result = await run(e);
    expect(result.kind === "text" && result.text.hits.sort()).toEqual(
      [id("krabbelreime"), id("musikgarten-1"), id("babymassage-workshop")].sort(),
    );
  });

  it("ohne gesehene IDs und ohne jedes listedAt (Übergang): kein Zuschnitt, aber die IDs werden geschrieben", async () => {
    const { e, writes } = env({}, { site: unlisted });
    expect(await run(e)).toEqual({ kind: "nichts" });
    expect(writes).toEqual([["seenIds", allIds]]);
  });

  it("Testversand schreibt nichts, auch ohne gesehene IDs", async () => {
    const withIds = env({ seenIds: without("krabbelreime") });
    expect((await run(withIds.e, true)).kind).toBe("text");
    expect(withIds.writes).toEqual([]);
    const noIds = env({});
    expect((await run(noIds.e, true)).kind).toBe("text");
    expect(noIds.writes).toEqual([]);
    const transition = env({}, { site: unlisted });
    expect(await run(transition.e, true)).toEqual({ kind: "nichts" });
    expect(transition.writes).toEqual([]);
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
