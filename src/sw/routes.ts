/**
 * Reine Regeln des Service Workers (Plan 0011, E4; ADR 0013): welche Strategie ein Request bekommt, Cache-Namen,
 * Zeitlimits und die Rotation von `zp-assets`. `sw.ts` verdrahtet nur Events, Caches und Fetch.
 *
 * Alle Pfade gelten relativ zu `registration.scope`, nie mit festem `/` (BASE bleibt die einzige Pfadquelle).
 */

/** Strategie je Request, Reihenfolge der Prüfung siehe `RULES` */
export type Strategy =
  /** fremder Origin: nie eingreifen (ADR 0008, keine fremden Kacheln cachen) */
  | "fremd"
  /** Kalender-Datei: Netz, offline 204 und Hinweis an die Seite */
  | "ics"
  /** gehashte Assets: Cache zuerst, sonst Netz und in `zp-assets` */
  | "asset"
  /** `site.json`: Netz zuerst, nach 5 s oder bei Netzfehler die Kopie */
  | "site"
  /** Wegzeit-Daten (`TRANSIT_FILES`: Tabelle und Linien, Plan 0012): Netz zuerst, offline die Kopie; nie im Precache */
  | "oepnv"
  /** Navigation auf die App: Navigation Preload, nach 3 s oder offline die vorgehaltene `index.html` */
  | "schale"
  /** alles andere: nur Netz, der Service Worker greift nicht ein */
  | "netz";

export interface RouteRequest {
  url: string;
  /** `registration.scope` */
  scope: string;
  method: string;
  /** `request.mode === "navigate"` */
  navigate: boolean;
}

interface Target {
  /** Pfad relativ zum Scope, ohne Query und Fragment; `undefined` außerhalb des Scopes */
  path: string | undefined;
  foreign: boolean;
  navigate: boolean;
}

/** Dateien der Wegzeit (Plan 0009, Plan 0012): Sie laden nur auf Anlass, deshalb kein Precache, nur Laufzeit-Cache */
const TRANSIT_FILES: readonly string[] = ["data/wegzeit.json", "data/linien.json"];

/** Die Regeln in Prüfreihenfolge: Die erste passende gilt. Pfadregeln stehen vor der Navigationsregel. */
export const RULES: ReadonlyArray<{ strategy: Exclude<Strategy, "netz">; test: (t: Target) => boolean }> = [
  { strategy: "fremd", test: (t) => t.foreign },
  { strategy: "ics", test: (t) => t.path?.startsWith("ics/") === true },
  { strategy: "asset", test: (t) => t.path?.startsWith("assets/") === true },
  { strategy: "site", test: (t) => t.path === "data/site.json" },
  { strategy: "oepnv", test: (t) => t.path !== undefined && TRANSIT_FILES.includes(t.path) },
  { strategy: "schale", test: (t) => t.navigate && (t.path === "" || t.path === "index.html") },
];

export function strategyFor({ url, scope, method, navigate }: RouteRequest): Strategy {
  if (method !== "GET") return "netz";
  const target = new URL(url);
  const base = new URL(scope);
  const inScope = target.pathname.startsWith(base.pathname);
  const t: Target = {
    foreign: target.origin !== base.origin,
    path: inScope ? target.pathname.slice(base.pathname.length) : undefined,
    navigate,
  };
  return RULES.find((rule) => rule.test(t))?.strategy ?? "netz";
}

/** Header an Antworten aus dem Cache; nur `src/data/site.ts` liest ihn (gleicher Name dort, E4). */
export const OFFLINE_HEADER = "X-Zp-Cache";

/** `site.json`: so lange wartet die Seite aufs Netz, wenn eine Kopie da ist (Funkloch) */
export const SITE_TIMEOUT_MS = 5000;
/** Navigation: so lange auf die Preload-Antwort warten, dann die vorgehaltene Schale */
export const NAVIGATION_TIMEOUT_MS = 3000;

const SHELL_PREFIX = "zp-shell-";
export const ASSETS_CACHE = "zp-assets";
export const DATA_CACHE = "zp-data";
/** höchstens so viele Einträge in `zp-assets` */
export const ASSETS_MAX = 60;

/** Schale je Version: `index.html` und die Start-Assets der Precache-Liste */
export const shellCache = (version: string) => `${SHELL_PREFIX}${version}`;

/** Beim `activate`: alte Schalen löschen, `zp-assets` und `zp-data` bleiben */
export function staleShells(names: readonly string[], version: string): string[] {
  return names.filter((name) => name.startsWith(SHELL_PREFIX) && name !== shellCache(version));
}

/**
 * Rotation von `zp-assets`: `keys` in Einfügereihenfolge (`cache.keys()`), älteste zuerst. Über `max` fliegen die
 * ältesten raus, nie aber ein Eintrag aus `keep` (aktuelle Precache-Liste).
 */
export function assetsToEvict(keys: readonly string[], keep: ReadonlySet<string>, max = ASSETS_MAX): string[] {
  const excess = keys.length - max;
  if (excess <= 0) return [];
  return keys.filter((key) => !keep.has(key)).slice(0, excess);
}
