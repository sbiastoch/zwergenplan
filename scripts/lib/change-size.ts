/**
 * Kleinänderung (Plan 0029, A1): Darf eine Änderung ohne eigenen Plan und ohne /plan-review auskommen?
 * Ein Hinweis für den Agenten, kein Gate. Rein, nur Strings; git liest scripts/change-size.ts.
 *
 * Klein ist eine Änderung, wenn
 * - sie höchstens MAX_LINES Zeilen ändert. Hinzugefügte Zeilen in Tests und Doku zählen nicht, gelöschte Testzeilen
 *   schon, damit keine Kleinänderung Tests still entfernt (Review M3);
 * - sie keine neue Datei außer Tests und Doku anlegt, also kein neues Modul;
 * - keine hinzugefügte Zeile ein Gate abschaltet (`.skip(`, `.only(`, `.fixme(`, `biome-ignore`);
 * - kein Pfad auf der Sperrliste steht: Abhängigkeiten, Schema, Gate-Konfiguration, E2E-Helfer, Stufen- und
 *   Auswahllogik, ADRs.
 */
import { isDocPath } from "./change-class.ts";

export const MAX_LINES = 60;

export interface ChangeInput {
  /** Zeilen aus `git diff --numstat --no-renames <basis>`: `<added>\t<deleted>\t<pfad>`, Binärdateien mit `-`. */
  numstat: readonly string[];
  /** Neue Dateien: `--diff-filter=A` gegen die Basis plus ungetrackte, nicht ignorierte Dateien. */
  newFiles: readonly string[];
  /** Hinzugefügte Zeilen aller Dateien, ohne das führende `+`. */
  addedLines: readonly string[];
}

export type ChangeSize = { small: true } | { small: false; reason: string };

const BLOCKED: readonly RegExp[] = [
  /^(package\.json|pnpm-lock\.yaml|\.nvmrc)$/,
  // Schema-Auslöser wie in .claude/hooks/post-edit.ts
  /^src\/domain\/(schema|topics)\.ts$/,
  /^scripts\/pipeline\/lib\/raw\.ts$/,
  // Gate-Konfiguration
  /^(\.dependency-cruiser\.cjs|lefthook\.yml|\.size-limit\.json|vitest\.config\.ts)$/,
  /^biome\.jsonc?$/,
  /^knip\./,
  /^\.claude\/(settings\.json|hooks\/)/,
  /^\.github\//,
  /^scripts\/(check-[^/]+|verify)\.ts$/,
  /^(vite\.config|playwright\.config|playwright\.devices)\.ts$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  // E2E-Helfer sind die Mobile-UX-Gates
  /^e2e\/(fixtures|mobile-ux|global-setup)\.ts$/,
  // Stufen- und Auswahllogik selbst
  // Module und CLIs (Review 2 zu Plan 0029, m10)
  /^scripts\/(lib\/)?(change-class|change-size|ci-scope|ci-scope-git|ci-gates|import-graph|import-graph-io|e2e-map|e2e-select|e2e-local|e2e-args)\.ts$/,
  /^docs\/adr\//,
];

const GATE_OFF = /\.(skip|only|fixme)\(|biome-ignore/;

function isTestPath(path: string): boolean {
  return /\.test\.tsx?$/.test(path) || /^e2e\/[^/]+\.spec\.ts$/.test(path);
}

export function smallChange(input: ChangeInput): ChangeSize {
  let lines = 0;
  for (const row of input.numstat) {
    const [added = "", deleted = "", path = ""] = row.split("\t");
    if (BLOCKED.some((re) => re.test(path))) return { small: false, reason: `Sperrliste: ${path}` };
    if (added === "-" || deleted === "-") return { small: false, reason: `unbekannte Größe: ${path}` };
    if (isDocPath(path)) continue;
    lines += (isTestPath(path) ? 0 : Number(added)) + Number(deleted);
  }
  for (const path of input.newFiles) {
    if (BLOCKED.some((re) => re.test(path))) return { small: false, reason: `Sperrliste: ${path}` };
    if (!isTestPath(path) && !isDocPath(path)) return { small: false, reason: `neue Datei ${path}` };
  }
  const off = input.addedLines.find((line) => GATE_OFF.test(line));
  if (off !== undefined) return { small: false, reason: `schaltet ein Gate ab: ${off.trim()}` };
  return lines > MAX_LINES ? { small: false, reason: `${lines} Zeilen > ${MAX_LINES}` } : { small: true };
}
