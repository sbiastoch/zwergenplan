/** HTTP für die Pipeline: Browser-UA, Timeout, Zeichensatz-Erkennung, 2 Wiederholungen bei Netz-/5xx-Fehlern. */
import type { FetchedPage } from "../lib/html-extract.ts";
import { blockedUrl, nextHop } from "../lib/redirect.ts";

export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";

function charsetOf(contentType: string, head: Uint8Array): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  const sniff = new TextDecoder("latin1").decode(head.slice(0, 2048));
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1] ?? "utf-8";
}

/** Angaben, hinter denen oft UTF-8 steckt (Kalender-API von nuernberg.de meldet ISO-8859-1 und liefert UTF-8). */
const LATIN = /^(iso-8859-1|latin-?1|windows-1252|us-ascii)$/i;

function decode(bytes: Uint8Array, charset: string): string {
  // Gültiges UTF-8 mit Nicht-ASCII-Zeichen ist bei echtem Latin-1 praktisch ausgeschlossen („ä“ = 0xE4 + ASCII ist kein
  // gültiges UTF-8); dann gewinnen die Bytes gegen die Angabe.
  if (LATIN.test(charset) && bytes.some((b) => b >= 0x80))
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // echtes Latin-1
    }
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  retries?: number;
  charset?: string;
  /** POST mit Body (Katalog `request`, Plan 0031, E3) */
  post?: string;
  /** nur für Tests: statt des globalen `fetch` (Unit-Tests laufen ohne Netz) */
  fetchImpl?: typeof fetch;
}

const BODY_HEADERS = new Set(["content-type", "content-length", "content-encoding", "content-language"]);

/** Weiterleitung abgelehnt (intern, zu viele Sprünge): kein Netzfehler, also keine Wiederholung */
class RedirectError extends Error {}

/**
 * Ein Abruf mit Weiterleitungen je Sprung (`lib/redirect.ts`): jede Zieladresse, auch die erste, gegen die Sperre
 * interner Adressen, höchstens `MAX_REDIRECTS` Sprünge; Methode wie `redirect: "follow"`. `finalUrl` ist die letzte
 * Adresse wie bisher `res.url`.
 */
async function fetchFollowing(url: string, opts: RequestOptions): Promise<{ res: Response; finalUrl: string }> {
  const blocked = blockedUrl(url);
  if (blocked) throw new RedirectError(`Abruf abgelehnt (${blocked})`);
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 60_000);
  const doFetch = opts.fetchImpl ?? fetch;
  // normalisiert und ohne Fragment wie `res.url` bisher (Arch-Review S4c, m1)
  const start = new URL(url);
  start.hash = "";
  let current = start.href;
  let method: "GET" | "POST" = opts.post === undefined ? "GET" : "POST";
  let body = opts.post;
  let headers: Record<string, string> = { "User-Agent": UA, "Accept-Language": "de-DE,de", ...opts.headers };
  for (let hops = 0; ; hops++) {
    const res = await doFetch(current, {
      headers,
      signal,
      redirect: "manual",
      ...(method === "POST" ? { method, body: body ?? "" } : {}),
    });
    const hop = nextHop({ url: current, status: res.status, location: res.headers.get("location"), method, hops });
    if (hop.kind === "fertig") return { res, finalUrl: current };
    await res.body?.cancel().catch(() => undefined);
    if (hop.kind === "fehler") throw new RedirectError(hop.reason);
    // wie die Fetch-Spezifikation: ohne Body keine Body-Header, bei anderem Origin kein Authorization (m2)
    const crossOrigin = new URL(hop.url).origin !== new URL(current).origin;
    headers = Object.fromEntries(
      Object.entries(headers).filter(([k]) => {
        const key = k.toLowerCase();
        if (!hop.body && BODY_HEADERS.has(key)) return false;
        return !(crossOrigin && key === "authorization");
      }),
    );
    current = new URL(hop.url).href;
    method = hop.method;
    body = hop.body ? body : undefined;
  }
}

/** Antwort als Bytes (PDF); Wiederholungen bei Netzfehler, Zeitüberschreitung und 5xx wie `fetchPage`. */
export async function fetchBytes(
  url: string,
  opts: RequestOptions = {},
): Promise<Omit<FetchedPage, "body"> & { bytes: Uint8Array }> {
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      const { res, finalUrl } = await fetchFollowing(url, opts);
      if (res.status >= 500 && attempt < retries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      return { status: res.status, finalUrl, contentType, bytes: new Uint8Array(await res.arrayBuffer()) };
    } catch (e) {
      if (e instanceof RedirectError || attempt >= retries) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
}

export async function fetchPage(url: string, opts: RequestOptions = {}): Promise<FetchedPage> {
  const { bytes, ...res } = await fetchBytes(url, opts);
  return { ...res, body: decode(bytes, opts.charset ?? charsetOf(res.contentType, bytes)) };
}

export async function fetchJson(url: string, opts: Parameters<typeof fetchPage>[1] = {}): Promise<unknown> {
  const page = await fetchPage(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  if (page.status === 404) return undefined;
  if (page.status >= 400) throw new Error(`HTTP ${page.status} für ${url}`);
  return JSON.parse(page.body);
}

export function withParams(base: string, params: Record<string, string | number>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return url.toString();
}
