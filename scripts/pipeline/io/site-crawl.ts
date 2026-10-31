/**
 * Abruf des Seitenfinders (Plan 0049, E1): über `io/http.ts` mit robots.txt (der Aufrufer setzt `setAbruf("neu")`),
 * eine Warteschlange je Host über den ganzen Lauf (höchstens ein Abruf je Sekunde, auch über Anbieter hinweg), Browser
 * bei `jsRendered` oder Bot-Schutz auf Plattformen, PDF über `pdftotext`. Die Auswahl steht in `lib/site-crawl.ts`.
 */
import { botWall } from "../lib/fetch.ts";
import { extractPage, type FetchedPage, type PageExtract } from "../lib/html-extract.ts";
import { type CrawlFetch, type CrawlScope, kindOf, wantsBrowser } from "../lib/site-crawl.ts";
import { hostOf } from "../lib/url.ts";
import type { BrowserSession } from "./browser.ts";
import { pdftotext, reasonOf } from "./fetch-inputs.ts";
import { decodeBody, fetchBytes, RobotsError, robotsActive } from "./http.ts";

/** Abstand je Host (Ziel 4) */
export const HOST_GAP_MS = 1000;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Warteschlange je Host: Aufrufe für denselben Host laufen nacheinander, mit `HOST_GAP_MS` Abstand */
export function hostQueue(clock: Clock = realClock) {
  const tail = new Map<string, Promise<unknown>>();
  const last = new Map<string, number>();
  return <T>(url: string, fn: () => Promise<T>): Promise<T> => {
    const host = hostOf(url) ?? url;
    const run = async () => {
      const wait = (last.get(host) ?? Number.NEGATIVE_INFINITY) + HOST_GAP_MS - clock.now();
      if (wait > 0) await clock.sleep(wait);
      try {
        return await fn();
      } finally {
        last.set(host, clock.now());
      }
    };
    const next = (tail.get(host) ?? Promise.resolve()).then(run, run);
    tail.set(
      host,
      next.catch(() => undefined),
    );
    return next;
  };
}
type HostQueue = ReturnType<typeof hostQueue>;

const asPage = (text: string): PageExtract => ({ jsonLd: [], feeds: [], text, links: [], jsRendered: false });

export interface CrawlDeps {
  queue: HostQueue;
  browser: Pick<BrowserSession, "render">;
  /** nur für Tests */
  fetchImpl?: typeof fetch;
  /** nur für Tests: statt `pdftotext` */
  pdfText?: (bytes: Uint8Array) => Promise<string>;
}

/**
 * Ein Abruf der Erkundung (E1). Kosten: 1 je Abruf plus 1 je Weiterleitung plus 1 für den Browser; reicht das Restbudget
 * nicht für den Browser, fällt die Seite mit Grund weg (Arch-Review S1, M4). Weiterleitungen innerhalb eines Abrufs
 * lassen sich nicht vorab ablehnen; sie zählen danach.
 */
export function crawlFetcher(
  scope: CrawlScope,
  deps: CrawlDeps,
): (url: string, remaining?: number) => Promise<CrawlFetch> {
  // ADR 0033, Punkt 1: der Seitenfinder ruft nie ohne robots.txt ab (Arch-Review S1, m7)
  if (!robotsActive()) throw new Error('Seitenfinder nur mit setAbruf("neu") (robots.txt)');
  const pdfText = deps.pdfText ?? pdftotext;
  return async (url, remaining = Number.POSITIVE_INFINITY) => {
    let cost = 0;
    try {
      const res = await deps.queue(url, () => fetchBytes(url, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}));
      cost = 1 + res.redirects;
      const kind = kindOf(res.contentType);
      if (res.status >= 400 && kind !== "html") return { ok: false, url, reason: `HTTP ${res.status}`, cost };
      if (kind === "pdf" || kind === "ical") {
        const text = kind === "pdf" ? await pdfText(res.bytes) : decodeBody(res.bytes, res.contentType);
        return {
          ok: true,
          url,
          finalUrl: res.finalUrl,
          contentType: res.contentType,
          browser: false,
          page: asPage(text),
          html: "",
          cost,
        };
      }
      const body = decodeBody(res.bytes, res.contentType);
      const page = extractPage(body, res.finalUrl);
      const wall = botWall(page.text) !== undefined;
      if (wantsBrowser({ status: res.status, jsRendered: page.jsRendered, botWall: wall, url: res.finalUrl }, scope)) {
        if (remaining < cost + 1) return { ok: false, url, reason: "Budget: Browser ausgelassen", cost };
        cost += 1;
        // Abstand je Host am Ziel, nicht am Ausgangspunkt der Weiterleitung (m4)
        const r: FetchedPage = await deps.queue(res.finalUrl, () => deps.browser.render(res.finalUrl));
        if (r.status >= 400) return { ok: false, url, reason: `Browser: HTTP ${r.status}`, cost };
        return {
          ok: true,
          url,
          // Kennung ist das Ziel der HTTP-Weiterleitungen, nicht eine per Skript umgeschriebene Adresse (S1-Messung:
          // die Buchungs-App von Ohana hängt die Query ein zweites Mal an)
          finalUrl: res.finalUrl,
          contentType: r.contentType,
          browser: true,
          page: extractPage(r.body, res.finalUrl),
          html: r.body,
          cost,
        };
      }
      if (res.status >= 400) return { ok: false, url, reason: `HTTP ${res.status}`, cost };
      if (wall) return { ok: false, url, reason: "Bot-Schutz", cost };
      return {
        ok: true,
        url,
        finalUrl: res.finalUrl,
        contentType: res.contentType,
        browser: false,
        page,
        html: body,
        cost,
      };
    } catch (e) {
      return {
        ok: false,
        url,
        reason: reasonOf(e),
        // gescheitert im Browser: HTTP-Abruf und Browser zählen (m5)
        cost: Math.max(1, cost),
        ...(e instanceof RobotsError && e.klasse === "gesperrt" ? { gesperrt: true } : {}),
      };
    }
  };
}
