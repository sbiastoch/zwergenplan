/**
 * Gemeinsame E2E-Basis: eingefrorene Zeit (Fixture-„Jetzt“) und
 * Konsolenfehler/Seitenfehler machen jeden Test automatisch rot.
 * Kartenkacheln (Plan 0005, E13): standardmäßig verboten; mit `test.use({ tiles: "mock" })` aus
 * tests/fixtures/karte/, offline, nur solange die Karte im DOM ist und nur ohne Querystring.
 */
import { existsSync } from "node:fs";
import { test as base, expect, type Page, type Request, type Route } from "@playwright/test";

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

/** Mock-Datei zu einem Pfad: Stil `/styles/<name>` → `<name>.json`, TileJSON `/planet`, Glyphen unter `fonts/`. */
function fixtureFile(path: string): string | undefined {
  const style = /^\/styles\/(positron|dark)$/.exec(path);
  if (style) return `${TILE_FIXTURES}/${style[1]}.json`;
  // TileJSON der Vektorquelle mit der echten Pflicht-Attribution (wie tiles.openfreemap.org/planet)
  if (path === "/planet") return `${TILE_FIXTURES}/planet.json`;
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

type TileHandler = (route: Route) => Promise<void> | void;

/** Interner Zustand des Kachel-Mocks: Protokoll und jede URL, die ein Mock-Handler beantwortet hat. */
interface TileMock {
  log: TileRequest[];
  served: Set<string>;
  /** wie context.route, aber die bedienten URLs zählen als gemockt; liefert das passende unroute */
  route: (pattern: string, handler: TileHandler) => Promise<() => Promise<void>>;
}

export const test = base.extend<
  Options & {
    tileMock: TileMock;
    tileLog: TileRequest[];
    /** eigene Antworten auf OpenFreeMap-Pfade in einem Test (z. B. Stil 503), statt context.route */
    routeTiles: TileMock["route"];
    consoleGuard: undefined;
    thirdPartyGuard: undefined;
  }
>({
  tiles: ["verboten", { option: true }],
  allowedConsoleErrors: [[], { option: true }],
  // Privatsphäre-Invariante (docs/architecture.md): keine Requests an fremde Origins – Schrift, Daten, ICS kommen von uns.
  // Über den Kontext, damit auch Requests aus Workern zählen. OpenFreeMap nur, wenn ein Mock-Handler ihn beantwortet hat.
  thirdPartyGuard: [
    async ({ context, baseURL, tileMock }, use) => {
      const own = new URL(baseURL ?? "http://localhost").origin;
      const foreign: string[] = [];
      const tileRequests: string[] = [];
      context.on("request", (req) => {
        const url = new URL(req.url());
        if (url.origin === TILE_ORIGIN) tileRequests.push(req.url());
        else if (url.protocol.startsWith("http") && url.origin !== own) foreign.push(req.url());
      });
      await use(undefined);
      const unserved = tileRequests.filter((url) => !tileMock.served.has(url)).map((url) => `nicht gemockt: ${url}`);
      expect([...foreign, ...unserved], "Keine Requests an fremde Origins").toEqual([]);
    },
    { auto: true },
  ],
  // Kartenkacheln (Plan 0005, E13): per context.route, damit auch die Requests aus MapLibres Worker ankommen.
  // Wächter und Kachel-Protokoll in einem; jeder Test kann das Protokoll als `tileLog` lesen.
  tileMock: [
    async ({ context, page, tiles }, use) => {
      const tileLog: TileRequest[] = [];
      const served = new Set<string>();
      const violations: string[] = [];
      const checks: Promise<void>[] = [];
      const route: TileMock["route"] = async (pattern, handler) => {
        // Jeder bediente Request – aus dem Standard-Mock oder aus routeTiles im Test – durchläuft dieselben
        // Prüfungen: kein Querystring oder Fragment, Karte im DOM. „verboten“ bricht ab und zählt nicht als bedient.
        const wrapped: TileHandler = (r) => {
          if (tiles === "mock") {
            const request = r.request();
            const url = request.url();
            served.add(url);
            if (url.includes("?") || url.includes("#")) violations.push(`mit Querystring oder Fragment: ${url}`);
            checks.push(
              mapInDom(request, page).then((inDom) => {
                if (inDom !== true) violations.push(`ohne Karte im DOM (${inDom}): ${url}`);
              }),
            );
          }
          return handler(r);
        };
        await context.route(pattern, wrapped);
        return () => context.unroute(pattern, wrapped);
      };
      await route(`${TILE_ORIGIN}/**`, (route) => {
        const request = route.request();
        const url = request.url();
        if (tiles === "verboten") {
          violations.push(`verboten (Test ohne tiles: "mock"): ${url}`);
          return route.abort();
        }
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
      await use({ log: tileLog, served, route });
      await Promise.all(checks);
      expect(violations, "OpenFreeMap nur gemockt, nur mit Karte im DOM, ohne Querystring").toEqual([]);
    },
    { auto: true },
  ],
  tileLog: async ({ tileMock }, use) => {
    await use(tileMock.log);
  },
  routeTiles: async ({ tileMock }, use) => {
    await use(tileMock.route);
  },
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
