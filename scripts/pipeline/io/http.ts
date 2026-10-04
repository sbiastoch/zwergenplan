/** HTTP für die Pipeline: Browser-UA, Timeout, Zeichensatz-Erkennung, 2 Wiederholungen bei Netz-/5xx-Fehlern. */
import type { FetchedPage } from "../lib/html-extract.ts";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";

function charsetOf(contentType: string, head: Uint8Array): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  const sniff = new TextDecoder("latin1").decode(head.slice(0, 2048));
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1] ?? "utf-8";
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchPage(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; retries?: number; charset?: string } = {},
): Promise<FetchedPage> {
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "de-DE,de", ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        redirect: "follow",
      });
      if (res.status >= 500 && attempt < retries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        status: res.status,
        finalUrl: res.url,
        contentType,
        body: decode(bytes, opts.charset ?? charsetOf(contentType, bytes)),
      };
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
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
