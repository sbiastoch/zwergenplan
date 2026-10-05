/**
 * Vite-Plugin für den Service Worker (Plan 0011, E3; ADR 0013): baut `src/sw/sw.ts` nach dem App-Bundle als einzelne
 * IIFE-Datei `sw.js` im Wurzelpfad, ungehasht, und setzt per `define`
 * - `__PRECACHE__`: die Start-Assets (`precacheList`), Pfade relativ zum Scope;
 * - `__SW_VERSION__`: Hash über Liste **und** Inhalt von `index.html`, denn die Inline-Skripte können sich ändern,
 *   ohne dass sich ein Asset-Name ändert.
 *
 * Läuft für `dist/` und `dist-e2e/` (gleiche Konfiguration, anderes `outDir`). Kein Workbox, kein vite-plugin-pwa.
 * Nichts außer diesem Plugin referenziert `src/sw/` (`sw-not-imported`).
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { build, type Plugin, type ResolvedConfig } from "vite";

/** Was `precacheList` vom Rolldown-Bundle braucht (strukturell, damit der Unit-Test ein Mini-Bundle reichen kann). */
export type MiniBundle = Record<
  string,
  | {
      type: "chunk";
      fileName: string;
      imports: readonly string[];
      facadeModuleId: string | null;
      viteMetadata?: { importedCss: ReadonlySet<string> } | undefined;
    }
  | { type: "asset"; fileName: string; source: string | Uint8Array }
>;

export interface PrecacheOptions {
  /** `base` aus der Vite-Konfiguration (`BASE` in site.config.ts) */
  base: string;
  /** Schriftschnitte, die beim Start gebraucht werden (die Latin-woff2) */
  fonts: RegExp;
  /**
   * Lazy-Chunks, die **jeder** Start nach `load` lädt, nach Modul-ID des Einstiegs (`facadeModuleId`). Heute nur der
   * PWA-Kern `src/data/pwa.ts`: Ohne ihn liefen offline weder Frische (E4a) noch der ICS-Hinweis (Abweichung in Plan
   * 0011, „Umsetzung“, Schritt 3). Andere Lazy-Chunks in Unterordnern gehören nicht dazu.
   */
  startChunks?: RegExp | undefined;
}

const decoder = new TextDecoder();
const text = (source: string | Uint8Array) => (typeof source === "string" ? source : decoder.decode(source));

/** `src` bzw. `href` der Tags, die der Start lädt: Modul-Skripte, Modul-Preloads, Stylesheets. */
function startUrls(html: string): { scripts: string[]; others: string[] } {
  const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
  const scripts: string[] = [];
  const others: string[] = [];
  for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
    const src = attr(tag, "src");
    if (src && attr(tag, "type") === "module") scripts.push(src);
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    const href = attr(tag, "href");
    if (href && /^(stylesheet|modulepreload)$/.test(attr(tag, "rel") ?? "")) others.push(href);
  }
  return { scripts, others };
}

/**
 * Precache-Liste (E3): `index.html`, das Entry-Skript aus `index.html` mit seinen statischen Imports, das Start-CSS,
 * die Start-Schrift und die `startChunks`. Wirft, wenn etwas fehlt: Eine leere oder lückenhafte Liste fiele sonst erst
 * offline auf.
 */
export function precacheList(bundle: MiniBundle, { base, fonts, startChunks }: PrecacheOptions): string[] {
  const html = bundle["index.html"];
  if (html?.type !== "asset") throw new Error("vite-sw: index.html fehlt im Bundle");
  const relative = (url: string) => (url.startsWith(base) ? url.slice(base.length) : url);
  const { scripts, others } = startUrls(text(html.source));
  if (scripts.length === 0) throw new Error("vite-sw: kein Entry-Skript (<script type=module src>) in index.html");

  const list = new Set<string>();
  const add = (fileName: string) => {
    if (list.has(fileName)) return;
    const file = bundle[fileName];
    if (!file) throw new Error(`vite-sw: ${fileName} steht in index.html, liegt aber nicht im Bundle`);
    list.add(fileName);
    if (file.type === "chunk") {
      for (const imported of file.imports) add(imported);
      for (const css of file.viteMetadata?.importedCss ?? []) add(css);
    }
  };
  for (const url of [...scripts, ...others]) add(relative(url));
  for (const file of Object.values(bundle)) {
    if (file.type === "chunk" && startChunks && file.facadeModuleId && startChunks.test(file.facadeModuleId)) {
      add(file.fileName);
    }
  }
  const fontFiles = Object.keys(bundle).filter((name) => fonts.test(name));
  if (fontFiles.length === 0) throw new Error(`vite-sw: keine Schrift passt zu ${fonts}`);
  for (const name of fontFiles) add(name);
  return ["index.html", ...[...list].sort()];
}

/** Kurzer Hash über Liste und `index.html` (E3) */
export function swVersion(list: readonly string[], html: string | Uint8Array): string {
  return createHash("sha256").update(JSON.stringify(list)).update(text(html)).digest("hex").slice(0, 12);
}

export interface ServiceWorkerOptions extends Omit<PrecacheOptions, "base"> {
  /** Quelle des Service Workers, relativ zur Wurzel */
  entry: string;
}

/** Baut `sw.js` nach dem App-Bundle (E3). */
export function serviceWorker({ entry, ...precache }: ServiceWorkerOptions): Plugin {
  let config: ResolvedConfig | undefined;
  return {
    name: "zwergenplan-sw",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async writeBundle(_options, bundle) {
      if (!config) throw new Error("vite-sw: Konfiguration fehlt");
      const list = precacheList(bundle, { ...precache, base: config.base });
      const html = bundle["index.html"];
      const version = swVersion(list, html?.type === "asset" ? html.source : "");
      await build({
        configFile: false,
        envFile: false,
        publicDir: false,
        root: config.root,
        logLevel: "warn",
        define: { __PRECACHE__: JSON.stringify(list), __SW_VERSION__: JSON.stringify(version) },
        build: {
          outDir: config.build.outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          target: "es2023",
          minify: true,
          sourcemap: false,
          lib: {
            entry: resolve(config.root, entry),
            formats: ["iife"],
            name: "zwergenplanSw",
            fileName: () => "sw.js",
          },
        },
      });
    },
  };
}
