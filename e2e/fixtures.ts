/**
 * Gemeinsame E2E-Basis: eingefrorene Zeit (Fixture-„Jetzt“) und
 * Konsolenfehler/Seitenfehler machen jeden Test automatisch rot.
 * Kartenkacheln (Plan 0005, E13): standardmäßig verboten; mit `test.use({ tiles: "mock" })` aus
 * tests/fixtures/karte/, offline, nur solange die Karte im DOM ist und nur ohne Querystring.
 */
import { existsSync } from "node:fs";
import { test as base, expect, type Locator, type Page, type Request, type Route } from "@playwright/test";

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

/**
 * Antwort auf den Export-Code der Merkliste, den die App nach dem ersten Rendern im Leerlauf vorlädt (Plan 0010, E8 A).
 * Vor `goto` aufrufen und vor dem Zählen „kein Request ab …“ abwarten: Der Request ist für alle gleich, käme unter
 * Last aber zu einem zufälligen Zeitpunkt. (Die Resource-Timing-Liste ist in diesen Läufen leer, deshalb die Antwort.)
 */
export function exportPreload(page: Page) {
  return page.waitForResponse((r) => /\/assets\/export\/[^/]+\.js$/.test(new URL(r.url()).pathname));
}

/**
 * Wegzeit mit zwei Linien (Plan 0012, E1, Review 2, W3/W5): `getByText` sähe Pfeil und „, dann“ zusammen und taugt
 * dafür nicht. Vorgelesen wird `spoken` (Aria-Snapshot: ohne aria-hidden, mit sr-only), sichtbar steht „→“, und
 * Linie davor, Pfeil und Linie danach stehen in derselben Zeile.
 */
export async function expectTwoLines(el: Locator, spoken: string) {
  // Playwright setzt vor „, dann“ ein Leerzeichen, weil `.sr-only` absolut positioniert (also Block) ist, wie die
  // Namensberechnung der Browser; vorgelesen wird es als Pause. Leerzeichen dürfen auch U+00A0 sein.
  const pattern = spoken
    .replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
    .replaceAll(", dann", " ?, dann")
    .replaceAll(" ", "\\s");
  await expect(el).toMatchAriaSnapshot(`- text: /${pattern}/`);
  await expect(el.locator('[aria-hidden="true"]')).toHaveText("→");
  const tops = await el.evaluate((root) => {
    const arrow = root.querySelector('[aria-hidden="true"]');
    const before = arrow?.previousSibling;
    const after = arrow?.nextElementSibling?.nextSibling;
    if (!arrow || !before || !after) return [];
    // Text davor: seine letzte Zeile; Text danach: seine erste
    const top = (node: Node, last: boolean) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      return (last ? rects[rects.length - 1] : rects[0])?.top ?? Number.NaN;
    };
    return [top(before, true), top(arrow, false), top(after, false)];
  });
  expect(tops).toHaveLength(3);
  const [a = 0, b = 0, c = 0] = tops;
  expect(Math.abs(a - b), "Linie davor und Pfeil in einer Zeile").toBeLessThanOrEqual(1);
  expect(Math.abs(b - c), "Pfeil und Linie danach in einer Zeile").toBeLessThanOrEqual(1);
}

/**
 * Die Fixture hat keinen Ort mit mehreren Angeboten (Orts-Sheet) und zwei Linien: Ab Gostenhof fahren Gemeinde und
 * Musikschule mit Umstieg, haben aber je ein Angebot (Detail). Für Tests des Orts-Sheets schreibt diese Route die
 * Linien-Datei um: Jede Zelle mit nur „Tram 1“ bekommt „Bus 202E“ als zweite Linie, die längste Folge der Fixture
 * (Plan 0012, E1/E4). Kennung und Minuten bleiben, die Datei passt also weiter zur Tabelle.
 */
export async function twoLinesEverywhere(page: Page) {
  await page.route("**/data/linien.json", async (route) => {
    const response = await route.fetch();
    const file = (await response.json()) as { lines: string[]; first: string; second: string };
    const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const tram = file.lines.indexOf("Tram\u00a01") + 1;
    const bus = file.lines.indexOf("Bus\u00a0202E") + 1;
    if (tram === 0 || bus === 0) throw new Error(`Fixture-Linien unerwartet: ${file.lines.join(", ")}`);
    const first = bytes(file.first);
    const second = bytes(file.second);
    first.forEach((v, i) => {
      if (v === tram && second[i] === 0) second[i] = bus;
    });
    await route.fulfill({ response, json: { ...file, second: btoa(String.fromCharCode(...second)) } });
  });
}

export { expect };
