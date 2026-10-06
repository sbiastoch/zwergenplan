/**
 * Routen des Push-Workers (Plan 0011, E11; Plan 0017, E1; ADR 0014). Ohne Workers-Laufzeit testbar: KV und Uhr
 * kommen herein. Gespeichert wird nur das Abo mit Anmeldedatum, dazu kurzlebig ein Zähler je gehashter IP und die
 * Versand-Marke je Samstag. Kein Log von Endpoints, keine Cookies.
 *
 * Öffentlich (nur mit `Origin: https://zwergenplan.app`, hält nur fremde Webseiten ab): `POST /abo`, `DELETE /abo`.
 * Mit Token: `GET /abos`, `POST /abos/loeschen`, `POST /versand/<YYYY-MM-DD>`. Frei: `GET /version`.
 */
import { toBerlinIso } from "../../src/domain/time.ts";
import { sameSecret, sha256Hex } from "./lib/hash.ts";
import { MAX_BODY_BYTES, parseSubscription } from "./lib/subscription.ts";

/** Der Teil von `KVNamespace`, den der Worker nutzt (im Test ein Fake) */
export interface Kv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: {
    prefix: string;
    cursor?: string;
  }): Promise<
    | { keys: { name: string }[]; list_complete: true }
    | { keys: { name: string }[]; list_complete: false; cursor: string }
  >;
}

export interface Env {
  PUSH: Kv;
  PUSH_ADMIN_TOKEN: string;
  /** Commit beim Deploy (`pnpm push:deploy`) */
  VERSION?: string;
}

const ALLOWED_ORIGIN = "https://zwergenplan.app";
export const MAX_SUBSCRIPTIONS = 500;
/** Anmeldungen je IP und Stunde */
export const RATE_LIMIT = 10;
const HOUR_S = 60 * 60;
const MARK_TTL_S = 3 * 24 * HOUR_S;
const ABO = "abo:";

const CORS = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-methods": "POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
  vary: "Origin",
};

function reply(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      ...(body === undefined ? {} : { "content-type": "application/json; charset=utf-8" }),
      ...headers,
    },
  });
}

async function readBody(request: Request): Promise<string | undefined> {
  const text = await request.text();
  return new TextEncoder().encode(text).length > MAX_BODY_BYTES ? undefined : text;
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function listAboKeys(kv: Kv): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list(cursor === undefined ? { prefix: ABO } : { prefix: ABO, cursor });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor !== undefined);
  return names;
}

/** Zähler je gehashter IP für die laufende Stunde; `false`, wenn das Limit erreicht ist */
async function withinRateLimit(request: Request, env: Env, now: number): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unbekannt";
  const key = `rl:${Math.floor(now / (HOUR_S * 1000))}:${await sha256Hex(ip)}`;
  const count = Number((await env.PUSH.get(key)) ?? "0");
  if (count >= RATE_LIMIT) return false;
  await env.PUSH.put(key, String(count + 1), { expirationTtl: HOUR_S });
  return true;
}

async function subscribe(request: Request, env: Env, now: number): Promise<Response> {
  const body = await readBody(request);
  const subscription = body === undefined ? undefined : parseSubscription(body);
  if (!subscription) return reply(400, undefined, CORS);
  if (!(await withinRateLimit(request, env, now))) return reply(429, undefined, CORS);
  const key = `${ABO}${await sha256Hex(subscription.endpoint)}`;
  if ((await env.PUSH.get(key)) === null && (await listAboKeys(env.PUSH)).length >= MAX_SUBSCRIPTIONS) {
    return reply(507, undefined, CORS);
  }
  await env.PUSH.put(key, JSON.stringify({ subscription, createdAt: toBerlinIso(new Date(now)) }));
  return reply(204, undefined, CORS);
}

async function unsubscribe(request: Request, env: Env): Promise<Response> {
  const body = parseJson(await readBody(request));
  const endpoint = typeof body === "object" && body !== null ? (body as { endpoint?: unknown }).endpoint : undefined;
  if (typeof endpoint !== "string") return reply(400, undefined, CORS);
  await env.PUSH.delete(`${ABO}${await sha256Hex(endpoint)}`);
  return reply(204, undefined, CORS);
}

async function listSubscriptions(env: Env): Promise<Response> {
  const abos = [];
  for (const name of await listAboKeys(env.PUSH)) {
    const raw = await env.PUSH.get(name);
    if (raw === null) continue;
    const { subscription } = JSON.parse(raw) as { subscription: unknown };
    abos.push({ hash: name.slice(ABO.length), subscription });
  }
  return reply(200, { abos });
}

async function removeSubscriptions(request: Request, env: Env): Promise<Response> {
  const body = parseJson(await readBody(request));
  const hashes = typeof body === "object" && body !== null ? (body as { hashes?: unknown }).hashes : undefined;
  if (!Array.isArray(hashes) || !hashes.every((h) => typeof h === "string")) return reply(400);
  for (const hash of hashes) await env.PUSH.delete(`${ABO}${hash}`);
  return reply(204);
}

/** Höchstens ein Versand je Berliner Kalendertag (Plan 0017, E1): beim zweiten Mal 409 */
async function markSent(day: string, env: Env): Promise<Response> {
  const key = `versand:${day}`;
  if ((await env.PUSH.get(key)) !== null) return reply(409);
  await env.PUSH.put(key, "1", { expirationTtl: MARK_TTL_S });
  return reply(204);
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") && (await sameSecret(header.slice("Bearer ".length), env.PUSH_ADMIN_TOKEN));
}

export async function handle(request: Request, env: Env, now: () => number = Date.now): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === "/abo") {
    if (!["POST", "DELETE", "OPTIONS"].includes(method)) return reply(404);
    if (request.headers.get("origin") !== ALLOWED_ORIGIN) return reply(403);
    if (method === "OPTIONS") return reply(204, undefined, CORS);
    return method === "POST" ? subscribe(request, env, now()) : unsubscribe(request, env);
  }
  if (method === "GET" && pathname === "/version") return reply(200, { version: env.VERSION ?? "unbekannt" });

  const versand = /^\/versand\/(\d{4}-\d{2}-\d{2})$/.exec(pathname);
  const admin =
    (method === "GET" && pathname === "/abos") ||
    (method === "POST" && pathname === "/abos/loeschen") ||
    (method === "POST" && pathname.startsWith("/versand/"));
  if (!admin) return reply(404);
  if (!(await authorized(request, env))) return reply(401);
  if (pathname === "/abos") return listSubscriptions(env);
  if (pathname === "/abos/loeschen") return removeSubscriptions(request, env);
  return versand?.[1] ? markSent(versand[1], env) : reply(400);
}
