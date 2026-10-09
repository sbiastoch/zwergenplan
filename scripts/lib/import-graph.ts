/**
 * Importgraph der E2E-Auswahl (Plan 0029, B2; ADR 0023), rein: Quelltexte rein, Kanten raus. Eingelesen wird in
 * import-graph-io.ts. Läuft auch im CI-Job `scope` ohne `pnpm install`, deshalb nur Node-Builtins
 * (Regel `ci-scope-builtins-only`).
 *
 * Erkannt werden nur relative Spezifizierer (`./`, `../`) mit expliziter Endung, wie das Projekt importiert:
 * `import … from`, `import "…"`, `export … from`, `import("…")`, `import type`, auch mehrzeilig, und in CSS
 * `@import "…"`. Kommentare, Zeichenketten und Regex-Literale werden vorher ausgeblendet, damit ein „import“ darin
 * keine Kante ergibt. Was der Regex nicht kennt, meldet der Kanarienvogel in scripts/check-architecture.ts gegen
 * dependency-cruiser (B6).
 */
import { posix } from "node:path";

/** Datei → aufgelöste Repo-Pfade ihrer relativen Importe. */
export type ImportGraph = ReadonlyMap<string, readonly string[]>;

const STRING = "\u0000";
// Vor einem `/` an diesen Stellen beginnt ein Regex-Literal, sonst ist es eine Division.
const REGEX_BEFORE = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const REGEX_KEYWORDS = /\b(return|typeof|case|do|else|in|of|void|yield|await)$/;

/**
 * Blendet Kommentare und Regex-Literale aus und ersetzt jede Zeichenkette durch `\0<Nummer>\0`. Zurück kommen der
 * bereinigte Text und die Inhalte der Zeichenketten. Template-Literale werden ganz ausgeblendet (ein Import mit
 * `${…}` ist ohnehin nicht statisch auflösbar). Eine Zeichenkette endet spätestens am Zeilenende, so verschluckt ein
 * falsch erkanntes Regex-Literal höchstens eine Zeile.
 */
function mask(source: string): { code: string; strings: string[] } {
  const strings: string[] = [];
  let code = "";
  let i = 0;
  const n = source.length;
  const lastSignificant = (): string => {
    const trimmed = code.trimEnd();
    return trimmed.slice(-1);
  };
  while (i < n) {
    const c = source[i] as string;
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      code += " ";
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      // Zeilenumbrüche behalten, damit `^` im Muster weiter an Zeilenanfängen greift
      code += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let text = "";
      while (j < n && source[j] !== c && source[j] !== "\n") {
        if (source[j] === "\\") {
          text += source[j + 1] ?? "";
          j += 2;
          continue;
        }
        text += source[j];
        j++;
      }
      strings.push(text);
      code += `"${STRING}${strings.length - 1}${STRING}"`;
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        const d = source[j];
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (depth === 0 && d === "`") break;
        if (d === "$" && source[j + 1] === "{") {
          depth++;
          j += 2;
          continue;
        }
        if (depth > 0 && d === "}") depth--;
        j++;
      }
      code += "``";
      i = j + 1;
      continue;
    }
    if (c === "/") {
      const before = lastSignificant();
      if (before === "" || REGEX_BEFORE.has(before) || REGEX_KEYWORDS.test(code.trimEnd())) {
        let j = i + 1;
        let inClass = false;
        while (j < n && source[j] !== "\n") {
          const d = source[j];
          if (d === "\\") {
            j += 2;
            continue;
          }
          if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) break;
          j++;
        }
        code += "/r/";
        i = j + 1;
        continue;
      }
    }
    code += c;
    i++;
  }
  return { code, strings };
}

const S = `"${STRING}(\\d+)${STRING}"`;
const PATTERNS: readonly RegExp[] = [
  // import … from "…", export … from "…", auch import type und mehrzeilig (keine Anweisungsgrenze dazwischen)
  new RegExp(`(?:^|[;}])\\s*(?:import|export)\\b[^;"\`]*?\\bfrom\\s*${S}`, "gm"),
  // import "…" (Seiteneffekt)
  new RegExp(`(?:^|[;}])\\s*import\\s*${S}`, "gm"),
  // import("…")
  new RegExp(`\\bimport\\s*\\(\\s*${S}\\s*[,)]`, "g"),
  // CSS: @import "…" und @import url("…")
  new RegExp(`@import\\s+(?:url\\(\\s*)?${S}`, "g"),
];

/** Aufgelöste Repo-Pfade der relativen Importe von `file` (Repo-Pfad mit `/`). */
export function importsOf(file: string, source: string): string[] {
  const { code, strings } = mask(source);
  const found = new Set<string>();
  for (const pattern of PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const spec = strings[Number(match[1])] ?? "";
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue;
      const path = posix.normalize(posix.join(posix.dirname(file), spec.replace(/[?#].*$/, "")));
      if (path.startsWith("../")) continue;
      found.add(path);
    }
  }
  return [...found];
}

/** Graph aus [Pfad, Quelltext]-Paaren. */
export function buildGraph(files: Iterable<readonly [path: string, source: string]>): ImportGraph {
  const graph = new Map<string, readonly string[]>();
  for (const [path, source] of files) graph.set(path, importsOf(path, source));
  return graph;
}

/** Geänderte Dateien plus alle Dateien, die sie transitiv importieren. Unbekannte Pfade bleiben drin. */
export function reverseClosure(graph: ImportGraph, changed: Iterable<string>): Set<string> {
  const importers = new Map<string, string[]>();
  for (const [from, targets] of graph) {
    for (const to of targets) {
      const list = importers.get(to);
      if (list === undefined) importers.set(to, [from]);
      else list.push(from);
    }
  }
  const hull = new Set<string>(changed);
  const queue = [...hull];
  for (let path = queue.pop(); path !== undefined; path = queue.pop()) {
    for (const from of importers.get(path) ?? []) {
      if (hull.has(from)) continue;
      hull.add(from);
      queue.push(from);
    }
  }
  return hull;
}
