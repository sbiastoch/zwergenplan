/**
 * Auswahl der E2E-Specs aus dem Diff (Plan 0029, B4; ADR 0023), rein. Die Auswahl beschleunigt nur, sie ist kein
 * Gate: Auf `main` fährt die CI vor dem Deploy immer alles (ADR 0021, Nr. 10).
 *
 * 1. Die Hülle H sind die geänderten Dateien plus alle, die sie transitiv importieren (import-graph.ts).
 * 2. Trifft ein **geänderter** Pfad ein Muster aus `full`, ist das Ergebnis `full`. Die Hülle zählt dafür nicht.
 * 3. Gewählt werden die Specs in H und die Specs, deren Zuordnung (`covers`) einen Pfad in H trifft.
 * 4. Ein geänderter Pfad, der keine Spec erreicht und weder Doku noch `noE2e` ist, ergibt `full` (fail-safe).
 * 5. Ohne gewählte Spec `none`, sonst `specs`, getrennt in Geräte- und Smoke-Specs.
 * Auch bei `full` steht die Auswahl aus Schritt 3 im Ergebnis, lokal läuft dann sie plus Stellvertreter (Review M2).
 *
 * Läuft im CI-Job `scope` ohne `pnpm install`: nur Node-Builtins und reine Module (`ci-scope-builtins-only`).
 */
import { isDocPath } from "./change-class.ts";
import { type ImportGraph, reverseClosure } from "./import-graph.ts";

export interface E2eMap {
  /** Je Spec: welche Repo-Pfade sie über die Oberfläche treibt. */
  covers: Readonly<Record<string, readonly RegExp[]>>;
  /** Ist ein geänderter Pfad einer davon, läuft die volle Suite. */
  full: readonly RegExp[];
  /** Ohne E2E, wenn die Hülle keine Spec erreicht. */
  noE2e: readonly RegExp[];
  /** Specs des Projekts mit echten Daten (Job smoke). */
  smoke: readonly string[];
}

/** Grund je gewählter Spec, für das Log. */
type Why = Record<string, string>;

export type Selection =
  | { kind: "none"; why: Why }
  | { kind: "full"; reason: string; device: string[]; smoke: string[]; why: Why }
  | { kind: "specs"; device: string[]; smoke: string[]; why: Why };

/** Stellvertreter, die lokal bei `full` und über der Obergrenze immer mitlaufen (B5). */
const LOCAL_REPRESENTATIVES = ["e2e/app.spec.ts", "e2e/theme.spec.ts"] as const;
/** Lokale Obergrenze der Geräte-Specs (Review 2, M1). */
export const LOCAL_LIMIT = 8;

export function selectSpecs(
  changed: readonly string[],
  graph: ImportGraph,
  map: E2eMap,
  specFiles: readonly string[],
): Selection {
  const specs = new Set(specFiles);
  const why: Why = {};
  let unknown: string | undefined;

  for (const path of changed) {
    const hull = reverseClosure(graph, [path]);
    let reached = false;
    for (const spec of specs) {
      const reason = hull.has(spec)
        ? spec === path
          ? "geändert"
          : `importiert ${path}`
        : coveredBy(map.covers[spec] ?? [], hull);
      if (reason === undefined) continue;
      reached = true;
      why[spec] ??= reason;
    }
    if (!reached && unknown === undefined && !isDocPath(path) && !map.noE2e.some((re) => re.test(path))) {
      unknown = path;
    }
  }

  const chosen = Object.keys(why).sort();
  const device = chosen.filter((s) => !map.smoke.includes(s));
  const smoke = chosen.filter((s) => map.smoke.includes(s));
  const fullPath = changed.find((p) => map.full.some((re) => re.test(p)));
  if (fullPath !== undefined) return { kind: "full", reason: `${fullPath} (volle Suite)`, device, smoke, why };
  if (unknown !== undefined) return { kind: "full", reason: `${unknown} fällt unter keine Regel`, device, smoke, why };
  return chosen.length === 0 ? { kind: "none", why } : { kind: "specs", device, smoke, why };
}

function coveredBy(patterns: readonly RegExp[], hull: ReadonlySet<string>): string | undefined {
  for (const path of hull) if (patterns.some((re) => re.test(path))) return `${path} (Zuordnung)`;
  return undefined;
}

/**
 * Was lokal auf einem Gerät läuft (B5). Bis `limit` Geräte-Specs alle. Darüber nur die Specs, deren Zuordnung einen
 * **geänderten** Pfad selbst trifft (oder die selbst geändert sind), plus die Stellvertreter. Bei `full` die Auswahl
 * plus die Stellvertreter. Nie mehr als `limit`, die Stellvertreter zuerst. `rest` überlässt der Lauf der CI.
 */
export function localSpecs(
  selection: Selection,
  changed: readonly string[],
  map: E2eMap,
  limit = LOCAL_LIMIT,
): { run: string[]; rest: string[] } {
  if (selection.kind === "none") return { run: [], rest: [] };
  const { device } = selection;
  const over = device.length > limit;
  const direct = (spec: string) =>
    changed.includes(spec) || changed.some((p) => (map.covers[spec] ?? []).some((re) => re.test(p)));
  const base = over ? device.filter(direct) : device;
  const withReps = selection.kind === "full" || over ? [...LOCAL_REPRESENTATIVES, ...base] : base;
  const run = [...new Set(withReps)].slice(0, limit);
  return { run, rest: device.filter((s) => !run.includes(s)) };
}
