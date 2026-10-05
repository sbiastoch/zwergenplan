import { describe, expect, it } from "vitest";
import { type MiniBundle, precacheList, swVersion } from "./vite-sw.ts";

const HTML = `<!doctype html><html><head>
<script>window.__zpSite = fetch("/data/site.json");</script>
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/assets/shared-BBB.js">
<link rel="stylesheet" crossorigin href="/assets/index-CCC.css">
<link rel="manifest" href="/manifest.webmanifest">
</head><body><div id="root"></div></body></html>`;

type MiniChunk = Extract<MiniBundle[string], { type: "chunk" }>;
const chunk = (
  fileName: string,
  imports: string[] = [],
  extra: Pick<Partial<MiniChunk>, "facadeModuleId" | "viteMetadata"> = {},
): MiniChunk => ({ type: "chunk", fileName, imports, facadeModuleId: null, ...extra });
const asset = (fileName: string, source: string | Uint8Array = "") => ({ type: "asset" as const, fileName, source });

/** Mini-Bundle: Einstieg mit statischem Import, ein Lazy-Chunk im Unterordner, drei Schriftschnitte */
function bundle(html = HTML): MiniBundle {
  return {
    "index.html": asset("index.html", html),
    "assets/index-AAA.js": chunk("assets/index-AAA.js", ["assets/shared-BBB.js"], {
      viteMetadata: { importedCss: new Set(["assets/index-CCC.css"]) },
    }),
    "assets/shared-BBB.js": chunk("assets/shared-BBB.js", ["assets/deep-DDD.js"]),
    "assets/deep-DDD.js": chunk("assets/deep-DDD.js"),
    "assets/index-CCC.css": asset("assets/index-CCC.css"),
    "assets/karte/MapView-EEE.js": chunk("assets/karte/MapView-EEE.js", ["assets/shared-BBB.js"]),
    "assets/app/pwa-FFF.js": chunk("assets/app/pwa-FFF.js", [], { facadeModuleId: "/repo/src/data/pwa.ts" }),
    "assets/app/AppSection-GGG.js": chunk("assets/app/AppSection-GGG.js", ["assets/app/pwa-FFF.js"], {
      facadeModuleId: "/repo/src/ui/app-extras/AppSection.tsx",
    }),
    "assets/export/ics-JJJ.js": chunk("assets/export/ics-JJJ.js", [], { facadeModuleId: "/repo/src/domain/ics.ts" }),
    "assets/font-latin-opsz-normal-HHH.woff2": asset("assets/font-latin-opsz-normal-HHH.woff2"),
    "assets/font-latin-ext-opsz-normal-III.woff2": asset("assets/font-latin-ext-opsz-normal-III.woff2"),
  };
}

const OPTIONS = {
  base: "/",
  fonts: /-latin-opsz-normal-[^/]+\.woff2$/,
  startChunks: [/\/src\/data\/pwa\.ts$/, /\/src\/domain\/ics\.ts$/],
};

describe("precacheList (Plan 0011, E3)", () => {
  it("enthält index.html, das Entry-Skript aus index.html, seine statischen Imports, das Start-CSS und die Latin-Schrift", () => {
    expect(precacheList(bundle(), OPTIONS)).toEqual([
      "index.html",
      "assets/app/pwa-FFF.js",
      "assets/deep-DDD.js",
      "assets/export/ics-JJJ.js",
      "assets/font-latin-opsz-normal-HHH.woff2",
      "assets/index-AAA.js",
      "assets/index-CCC.css",
      "assets/shared-BBB.js",
    ]);
  });

  it("enthält keinen Lazy-Chunk aus einem Unterordner, außer den Start-Chunks (PWA-Kern, Export-Code)", () => {
    const list = precacheList(bundle(), OPTIONS);
    expect(list).not.toContain("assets/karte/MapView-EEE.js");
    expect(list).not.toContain("assets/app/AppSection-GGG.js");
    expect(list.filter((f) => /^assets\/[^/]+\//.test(f))).toEqual([
      "assets/app/pwa-FFF.js",
      "assets/export/ics-JJJ.js",
    ]);
  });

  it("ohne Start-Chunks nur der Einstieg", () => {
    expect(precacheList(bundle(), { ...OPTIONS, startChunks: [] })).not.toContain("assets/app/pwa-FFF.js");
  });

  it("ein Start-Chunk-Muster ohne Treffer: Fehler (umbenanntes Modul fiele sonst still aus dem Precache)", () => {
    expect(() =>
      precacheList(bundle(), { ...OPTIONS, startChunks: [/\/src\/data\/pwa\.ts$/, /\/src\/gibt-es-nicht\.ts$/] }),
    ).toThrow(/gibt-es-nicht/);
  });

  it("Pfade relativ zur Basis (BASE aus site.config.ts)", () => {
    const html = HTML.replaceAll('"/assets/', '"/zwerg/assets/');
    expect(precacheList(bundle(html), { ...OPTIONS, base: "/zwerg/" })).toContain("assets/index-AAA.js");
  });

  it("Attributreihenfolge im Tag ist egal", () => {
    const html = HTML.replace(
      'type="module" crossorigin src="/assets/index-AAA.js"',
      'src="/assets/index-AAA.js" type="module"',
    );
    expect(precacheList(bundle(html), OPTIONS)).toContain("assets/index-AAA.js");
  });

  it("ohne Entry-Skript in index.html: Fehler statt leerer Liste", () => {
    const html = HTML.replace(/<script type="module"[^>]*><\/script>/, "");
    expect(() => precacheList(bundle(html), OPTIONS)).toThrow(/Entry-Skript/);
  });

  it("ohne index.html: Fehler", () => {
    const { "index.html": _html, ...rest } = bundle();
    expect(() => precacheList(rest, OPTIONS)).toThrow(/index\.html/);
  });

  it("ohne passende Schrift: Fehler (sonst fehlte offline die Schrift still)", () => {
    expect(() => precacheList(bundle(), { ...OPTIONS, fonts: /gibt-es-nicht/ })).toThrow(/Schrift/);
  });

  it("Verweis auf eine Datei, die nicht im Bundle liegt: Fehler", () => {
    const html = HTML.replace("/assets/index-CCC.css", "/assets/fehlt-ZZZ.css");
    expect(() => precacheList(bundle(html), OPTIONS)).toThrow(/fehlt-ZZZ\.css/);
  });
});

describe("swVersion (E3)", () => {
  it("ändert sich mit der Liste und mit dem Inhalt von index.html", () => {
    const list = ["index.html", "assets/index-AAA.js"];
    const v = swVersion(list, HTML);
    expect(v).toMatch(/^[0-9a-f]{12}$/);
    expect(swVersion(list, HTML)).toBe(v);
    expect(swVersion([...list, "assets/x.css"], HTML)).not.toBe(v);
    expect(swVersion(list, HTML.replace("site.json", "site2.json"))).not.toBe(v);
  });

  it("liest index.html auch als Bytes", () => {
    expect(swVersion(["a"], new TextEncoder().encode(HTML))).toBe(swVersion(["a"], HTML));
  });
});
