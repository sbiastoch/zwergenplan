/**
 * Gemeinsame E2E-Basis: eingefrorene Zeit (Fixture-„Jetzt“) und
 * Konsolenfehler/Seitenfehler machen jeden Test automatisch rot.
 * Kartenkacheln (Plan 0005, E13): standardmäßig verboten; mit `test.use({ tiles: "mock" })` aus
 * tests/fixtures/karte/, offline, nur solange die Karte im DOM ist und nur ohne Querystring.
 */
import { existsSync } from "node:fs";
import { test as base, expect, type Page, type Request } from "@playwright/test";

/** Muss zu tests/fixtures/offers.json passen: Montag, 5.10.2026, 12:00 Berlin. */
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

/** Einziger erlaubter Drittanbieter, nur bei offener Karte (ADR 0008) */
const TILE_ORIGIN = "https://tiles.openfreemap.org";
const TILE_FIXTURES = "tests/fixtures/karte";

/** Ein vom Mock bedienter Kachel-Request `/planet/test/{z}/{x}/{y}.pbf` (für die Kamera-Regel). */
export interface TileRequest {
  path: string;
  at: number;
}

interface Options {
  /** „verboten“: jeder Request an OpenFreeMap ist rot. „mock“: Fixtures statt Netz. */
  tiles: "verboten" | "mock";
  /** Opt-in je Test: konkrete Muster gegen `${url} ${text}` eines console.error, nie global */
  allowedConsoleErrors: RegExp[];
}

/** Mock-Datei zu einem Pfad: Stil `/styles/<name>` → `<name>.json`, Glyphen unter `fonts/`. */
function fixtureFile(path: string): string | undefined {
  const style = /^\/styles\/(positron|dark)$/.exec(path);
  if (style) return `${TILE_FIXTURES}/${style[1]}.json`;
  if (/^\/fonts\/[^/]+\/\d+-\d+\.pbf$/.test(path)) return `${TILE_FIXTURES}${path}`;
  return undefined;
}

/** Ist die Karte im DOM? Für Worker-Requests ohne Frame gilt der Zustand der Seite. */
async function mapInDom(request: Request, page: Page): Promise<boolean | string> {
  const check = () => document.querySelector(".map-box") !== null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await request.frame().evaluate(check);
    } catch {
      try {
        return await page.evaluate(check);
      } catch {
        // Kontext gerade weg (Neuladen): kurz warten, dann nochmal
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  return "nicht prüfbar";
}

export const test = base.extend<
  Options & { tileLog: TileRequest[]; consoleGuard: undefined; thirdPartyGuard: undefined }
>({
  tiles: ["verboten", { option: true }],
  allowedConsoleErrors: [[], { option: true }],
  // Privatsphäre-Invariante (docs/architecture.md): keine Requests an fremde Origins – Schrift, Daten, ICS kommen von uns.
  // Über den Kontext, damit auch Requests aus Workern zählen. OpenFreeMap prüft tileLog.
  thirdPartyGuard: [
    async ({ context, baseURL }, use) => {
      const own = new URL(baseURL ?? "http://localhost").origin;
      const foreign: string[] = [];
      context.on("request", (req) => {
        const url = new URL(req.url());
        if (url.protocol.startsWith("http") && url.origin !== own && url.origin !== TILE_ORIGIN)
          foreign.push(req.url());
      });
      await use(undefined);
      expect(foreign, "Keine Requests an fremde Origins").toEqual([]);
    },
    { auto: true },
  ],
  // Kartenkacheln (Plan 0005, E13): per context.route, damit auch die Requests aus MapLibres Worker ankommen.
  // Wächter und Kachel-Protokoll in einem; jeder Test kann das Protokoll als `tileLog` lesen.
  tileLog: [
    async ({ context, page, tiles }, use) => {
      const tileLog: TileRequest[] = [];
      const violations: string[] = [];
      const checks: Promise<void>[] = [];
      await context.route(`${TILE_ORIGIN}/**`, (route) => {
        const request = route.request();
        const url = request.url();
        if (tiles === "verboten") {
          violations.push(`verboten (Test ohne tiles: "mock"): ${url}`);
          return route.abort();
        }
        if (url.includes("?") || url.includes("#")) violations.push(`mit Querystring oder Fragment: ${url}`);
        checks.push(
          mapInDom(request, page).then((inDom) => {
            if (inDom !== true) violations.push(`ohne Karte im DOM (${inDom}): ${url}`);
          }),
        );
        const path = decodeURIComponent(new URL(url).pathname);
        if (/^\/planet\/test\/\d+\/\d+\/\d+\.pbf$/.test(path)) {
          tileLog.push({ path, at: Date.now() });
          // leere Antwort = leere Vektorkachel (in Schritt 2 geprüft)
          return route.fulfill({ status: 200, contentType: "application/x-protobuf", body: Buffer.alloc(0) });
        }
        const file = fixtureFile(path);
        if (file && existsSync(file)) return route.fulfill({ path: file });
        violations.push(`nicht gemockt: ${url}`);
        return route.fulfill({ status: 404 });
      });
      await use(tileLog);
      await Promise.all(checks);
      expect(violations, "OpenFreeMap nur gemockt, nur mit Karte im DOM, ohne Querystring").toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXTURE_NOW);
    await use(page);
  },
  consoleGuard: [
    async ({ page, allowedConsoleErrors }, use) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const line = `${msg.location().url} ${msg.text()}`;
        if (!allowedConsoleErrors.some((pattern) => pattern.test(line))) problems.push(`console.error: ${msg.text()}`);
      });
      page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
      await use(undefined);
      expect(problems, "Keine Konsolen- oder Seitenfehler").toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * Bis „bereit“ (erstes idle) rendert Chromium bzw. WebKit per Software-WebGL; mit mehreren parallelen
 * Workern dauert das lokal bis ~10 s. Eine Wartezeit, keine Gate-Schwelle.
 */
export const MAP_READY = { timeout: 20_000 };

export { expect };
