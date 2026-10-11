/**
 * Programmseiten mit `render: browser` (Plan 0032, E3): Chromium über Playwright. Einzige Stelle der Pipeline mit
 * Playwright-Import (dependency-cruiser `playwright-only-in-pipeline-browser`). Der Browser startet erst beim
 * ersten Abruf; Links werden nie verfolgt, nur die angegebene Seite geladen.
 */
import { type Browser, chromium } from "@playwright/test";
import type { FetchedPage } from "../lib/html-extract.ts";
import { UA } from "./http.ts";

const GOTO_TIMEOUT_MS = 45_000;
/**
 * Widgets (kurabu, eversports, Calendly) laden ihre Termine nach `networkidle` nach (kurabu: „LOADING“ bei 1,1 s,
 * Termine ab 2,1 s, gemessen 2026-10-11). Deshalb danach warten, bis die Textlänge zwei Takte gleich bleibt,
 * höchstens bis SETTLE_TIMEOUT_MS.
 */
const SETTLE_TIMEOUT_MS = 15_000;
const SETTLE_TICK_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTimeout = (e: unknown) => e instanceof Error && e.name === "TimeoutError";

export interface BrowserSession {
  /** Seite rendern; 2 Wiederholungen bei Zeitüberschreitung, andere Fehler werfen sofort. */
  render(url: string): Promise<FetchedPage>;
  close(): Promise<void>;
}

export function browserSession(): BrowserSession {
  let browser: Promise<Browser> | undefined;
  const once = async (url: string): Promise<FetchedPage> => {
    browser ??= chromium.launch();
    // Ohne festen UA meldet sich Headless-Chromium als „HeadlessChrome“, und eversports zeigt nur die
    // Cloudflare-Sperrseite (Probe 2026-10-11: 9 von 17 Browser-Abrufen); mit UA kommen die Kurse.
    const context = await (await browser).newContext({ locale: "de-DE", timezoneId: "Europe/Berlin", userAgent: UA });
    try {
      const page = await context.newPage();
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
      const deadline = Date.now() + SETTLE_TIMEOUT_MS;
      await page.waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined);
      let last = -1;
      for (let stable = 0; stable < 2 && Date.now() < deadline; ) {
        await page.waitForTimeout(SETTLE_TICK_MS);
        const length = await page.evaluate(() => document.body?.innerText.length ?? 0);
        stable = length === last ? stable + 1 : 0;
        last = length;
      }
      return {
        status: res?.status() ?? 0,
        finalUrl: page.url(),
        contentType: (await res?.headerValue("content-type")) ?? "text/html",
        body: await page.content(),
      };
    } finally {
      await context.close();
    }
  };
  return {
    async render(url) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await once(url);
        } catch (e) {
          if (!isTimeout(e) || attempt >= 2) throw e;
          await sleep(2000 * (attempt + 1));
        }
      }
    },
    async close() {
      if (browser) await (await browser).close();
    },
  };
}
