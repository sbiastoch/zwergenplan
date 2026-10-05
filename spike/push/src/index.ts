// Wegwerf-Spike zu Plan 0011, Schritt 0 (Declarative Web Push auf iOS).
// Kommt nie auf main. Seite, Manifest und Service Worker unter /spike/,
// Abos und ein Messprotokoll in KV.

import { PAGE_HTML } from "./page.ts";
import { SW_JS } from "./sw.ts";

interface Env {
  SPIKE: KVNamespace;
  SPIKE_TOKEN: string;
  VAPID_PUBLIC: string;
}

const LOG_TTL = 60 * 60 * 24 * 14;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function authorized(request: Request, env: Env): boolean {
  return request.headers.get("authorization") === `Bearer ${env.SPIKE_TOKEN}`;
}

async function listAll(env: Env, prefix: string): Promise<{ name: string; value: unknown }[]> {
  const out: { name: string; value: unknown }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SPIKE.list({ prefix, cursor });
    for (const key of page.keys) {
      const value = await env.SPIKE.get(key.name, "json");
      out.push({ name: key.name, value });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/" || pathname === "/spike") return Response.redirect(`${url.origin}/spike/`, 302);

    if (request.method === "GET" && pathname === "/spike/") {
      return new Response(PAGE_HTML.replace("__VAPID_PUBLIC__", env.VAPID_PUBLIC), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (request.method === "GET" && pathname === "/spike/sw.js") {
      return new Response(SW_JS, {
        headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (request.method === "GET" && pathname === "/spike/manifest.webmanifest") {
      return json({
        name: "Zwergenplan Spike",
        short_name: "ZP Spike",
        start_url: "/spike/",
        scope: "/spike/",
        display: "standalone",
        background_color: "#fff8ec",
        theme_color: "#fff8ec",
        lang: "de",
      });
    }

    if (request.method === "POST" && pathname === "/spike/abo") {
      const body = (await request.json()) as { subscription: { endpoint: string } };
      const hash = await sha256Hex(body.subscription.endpoint);
      await env.SPIKE.put(`abo:${hash}`, JSON.stringify({ ...body, at: new Date().toISOString() }));
      return json({ kennung: hash.slice(0, 8) });
    }

    if (request.method === "POST" && pathname === "/spike/log") {
      const text = await request.text();
      if (text.length > 8000) return json({ error: "zu groß" }, 413);
      const now = Date.now();
      const key = `log:${String(now).padStart(15, "0")}:${crypto.randomUUID().slice(0, 6)}`;
      await env.SPIKE.put(key, JSON.stringify({ server: new Date(now).toISOString(), ...JSON.parse(text) }), {
        expirationTtl: LOG_TTL,
      });
      return new Response(null, { status: 204 });
    }

    if (request.method === "GET" && pathname === "/spike/logs") {
      const logs = await listAll(env, "log:");
      return json(logs.map((entry) => entry.value).reverse());
    }

    if (request.method === "GET" && pathname === "/spike/abos") {
      if (!authorized(request, env)) return json({ error: "nein" }, 401);
      const abos = await listAll(env, "abo:");
      return json(abos.map((entry) => ({ kennung: entry.name.slice(4, 12), ...(entry.value as object) })));
    }

    if (request.method === "POST" && pathname === "/spike/logs/loeschen") {
      if (!authorized(request, env)) return json({ error: "nein" }, 401);
      const logs = await env.SPIKE.list({ prefix: "log:" });
      await Promise.all(logs.keys.map((key) => env.SPIKE.delete(key.name)));
      return json({ geloescht: logs.keys.length });
    }

    return new Response("nicht gefunden", { status: 404 });
  },
};
