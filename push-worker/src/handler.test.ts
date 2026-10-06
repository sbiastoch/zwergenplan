import { beforeEach, describe, expect, it } from "vitest";
import { type Env, handle, type Kv, MAX_SUBSCRIPTIONS, RATE_LIMIT } from "./handler.ts";
import { sha256Hex } from "./lib/hash.ts";

/** KV im Speicher, mit Ablaufzeit (Sekunden ab `now`) wie Workers KV */
function fakeKv(now: () => number): Kv & { data: Map<string, { value: string; expires?: number }> } {
  const data = new Map<string, { value: string; expires?: number }>();
  const live = (key: string) => {
    const entry = data.get(key);
    if (entry?.expires !== undefined && entry.expires <= now()) data.delete(key);
    return data.get(key);
  };
  return {
    data,
    async get(key: string) {
      return live(key)?.value ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      const ttl = options?.expirationTtl;
      data.set(key, ttl === undefined ? { value } : { value, expires: now() + ttl * 1000 });
    },
    async delete(key: string) {
      data.delete(key);
    },
    async list({ prefix, cursor }: { prefix: string; cursor?: string }) {
      const names = [...data.keys()].filter((k) => k.startsWith(prefix) && live(k)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = names.slice(start, start + 2);
      const done = start + 2 >= names.length;
      return done
        ? { keys: page.map((name) => ({ name })), list_complete: true as const }
        : { keys: page.map((name) => ({ name })), list_complete: false as const, cursor: String(start + 2) };
    },
  };
}

const ORIGIN = "https://zwergenplan.app";
const TOKEN = "geheim-geheim";
const ENDPOINT = "https://web.push.apple.com/QGuQyavXutnMH";
const SUB = { endpoint: ENDPOINT, keys: { p256dh: "BOrA_valid", auth: "c2VjcmV0" } };

let clock = Date.parse("2026-10-10T08:07:00Z");
let kv: ReturnType<typeof fakeKv>;
let env: Env;

beforeEach(() => {
  clock = Date.parse("2026-10-10T08:07:00Z");
  kv = fakeKv(() => clock);
  env = { PUSH: kv, PUSH_ADMIN_TOKEN: TOKEN, VERSION: "abc1234" };
});

const req = (
  method: string,
  path: string,
  init: { body?: unknown; origin?: string | null; auth?: string; ip?: string } = {},
) => {
  const headers = new Headers({ "cf-connecting-ip": init.ip ?? "203.0.113.7" });
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  if (init.auth) headers.set("authorization", `Bearer ${init.auth}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const body = init.body === undefined ? null : typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  return handle(new Request(`https://push.example${path}`, { method, headers, body }), env, () => clock);
};

const abos = async () => [...kv.data.keys()].filter((k) => k.startsWith("abo:"));

describe("öffentliche Routen", () => {
  it("POST /abo speichert das Abo unter dem Hash des Endpoints, mit CORS", async () => {
    const res = await req("POST", "/abo", { body: SUB });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const hash = await sha256Hex(ENDPOINT);
    expect(JSON.parse((await kv.get(`abo:${hash}`)) ?? "")).toEqual({
      subscription: SUB,
      createdAt: "2026-10-10T10:07:00+02:00",
    });
  });

  it("verlangt den eigenen Origin (403 ohne und mit fremdem)", async () => {
    expect((await req("POST", "/abo", { body: SUB, origin: null })).status).toBe(403);
    expect((await req("POST", "/abo", { body: SUB, origin: "https://evil.example" })).status).toBe(403);
    expect(await abos()).toEqual([]);
  });

  it("beantwortet den Preflight nur für den eigenen Origin", async () => {
    const ok = await req("OPTIONS", "/abo");
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(ok.headers.get("access-control-allow-headers")).toContain("content-type");
    expect((await req("OPTIONS", "/abo", { origin: "https://evil.example" })).status).toBe(403);
  });

  it("lehnt ungültige Abos mit 400 ab (fremder Dienst, kaputtes JSON, zu groß)", async () => {
    expect((await req("POST", "/abo", { body: { ...SUB, endpoint: "https://example.com/x" } })).status).toBe(400);
    expect((await req("POST", "/abo", { body: "kein json" })).status).toBe(400);
    expect((await req("POST", "/abo", { body: { ...SUB, pad: "x".repeat(3000) } })).status).toBe(400);
    expect(await abos()).toEqual([]);
  });

  it("begrenzt Anmeldungen je IP und Stunde, ohne die IP zu speichern", async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await req("POST", "/abo", { body: { ...SUB, endpoint: `${ENDPOINT}${i}` } })).status).toBe(204);
    }
    expect((await req("POST", "/abo", { body: { ...SUB, endpoint: `${ENDPOINT}x` } })).status).toBe(429);
    expect((await req("POST", "/abo", { body: { ...SUB, endpoint: `${ENDPOINT}y` }, ip: "198.51.100.1" })).status).toBe(
      204,
    );
    expect([...kv.data.keys()].join(" ")).not.toContain("203.0.113.7");
    clock += 60 * 60 * 1000;
    expect((await req("POST", "/abo", { body: { ...SUB, endpoint: `${ENDPOINT}z` } })).status).toBe(204);
  });

  it("nimmt höchstens MAX_SUBSCRIPTIONS Abos, ein schon bekanntes geht weiter", async () => {
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) await kv.put(`abo:${i}`, "{}");
    expect((await req("POST", "/abo", { body: SUB })).status).toBe(507);
    await kv.put(`abo:${await sha256Hex(ENDPOINT)}`, "{}");
    expect((await req("POST", "/abo", { body: SUB })).status).toBe(204);
  });

  it("DELETE /abo löscht, auch wenn nichts da war", async () => {
    await req("POST", "/abo", { body: SUB });
    expect((await req("DELETE", "/abo", { body: { endpoint: ENDPOINT } })).status).toBe(204);
    expect(await abos()).toEqual([]);
    expect((await req("DELETE", "/abo", { body: { endpoint: ENDPOINT } })).status).toBe(204);
    expect((await req("DELETE", "/abo", { body: { endpoint: 42 } })).status).toBe(400);
    expect((await req("DELETE", "/abo", { body: { endpoint: ENDPOINT }, origin: null })).status).toBe(403);
  });

  it("GET /version zeigt den deployten Commit", async () => {
    const res = await req("GET", "/version", { origin: null });
    expect(await res.json()).toEqual({ version: "abc1234" });
  });

  it("antwortet sonst 404", async () => {
    expect((await req("GET", "/", { origin: null })).status).toBe(404);
    expect((await req("PUT", "/abo")).status).toBe(404);
  });
});

describe("Admin-Routen", () => {
  it("GET /abos liefert die Abos mit Hash, nur mit Token", async () => {
    await req("POST", "/abo", { body: SUB });
    expect((await req("GET", "/abos", { origin: null })).status).toBe(401);
    expect((await req("GET", "/abos", { origin: null, auth: "falsch" })).status).toBe(401);
    const res = await req("GET", "/abos", { origin: null, auth: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ abos: [{ hash: await sha256Hex(ENDPOINT), subscription: SUB }] });
  });

  it("GET /abos liest über mehrere Seiten", async () => {
    for (const i of [1, 2, 3]) await req("POST", "/abo", { body: { ...SUB, endpoint: `${ENDPOINT}${i}` } });
    const res = await req("GET", "/abos", { origin: null, auth: TOKEN });
    expect(((await res.json()) as { abos: unknown[] }).abos).toHaveLength(3);
  });

  it("POST /abos/loeschen entfernt die genannten Hashes", async () => {
    await req("POST", "/abo", { body: SUB });
    const hash = await sha256Hex(ENDPOINT);
    expect((await req("POST", "/abos/loeschen", { origin: null, body: { hashes: [hash] } })).status).toBe(401);
    expect((await req("POST", "/abos/loeschen", { origin: null, auth: TOKEN, body: { hashes: "x" } })).status).toBe(
      400,
    );
    const res = await req("POST", "/abos/loeschen", { origin: null, auth: TOKEN, body: { hashes: [hash, "fehlt"] } });
    expect(res.status).toBe(204);
    expect(await abos()).toEqual([]);
  });

  it("POST /versand/<datum> setzt die Marke einmal, beim zweiten Mal 409, ohne Token 401", async () => {
    expect((await req("POST", "/versand/2026-10-10", { origin: null })).status).toBe(401);
    expect((await req("POST", "/versand/2026-10-10", { origin: null, auth: TOKEN })).status).toBe(204);
    expect((await req("POST", "/versand/2026-10-10", { origin: null, auth: TOKEN })).status).toBe(409);
    expect((await req("POST", "/versand/2026-10-17", { origin: null, auth: TOKEN })).status).toBe(204);
    expect((await req("POST", "/versand/10.10.2026", { origin: null, auth: TOKEN })).status).toBe(400);
  });

  it("die Versand-Marke läuft nach drei Tagen ab", async () => {
    await req("POST", "/versand/2026-10-10", { origin: null, auth: TOKEN });
    clock += 3 * 24 * 60 * 60 * 1000;
    expect((await req("POST", "/versand/2026-10-10", { origin: null, auth: TOKEN })).status).toBe(204);
  });
});
