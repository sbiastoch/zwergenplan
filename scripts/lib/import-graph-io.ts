/**
 * Einlesen für die E2E-Auswahl (Plan 0029, B2): getrackte Quelltexte, neue Dateien und geänderte Pfade. Nur lesendes
 * git im Projekt `root`, ohne geerbte GIT_*-Variablen (git-env.ts). Läuft auch im CI-Job `scope` ohne
 * `pnpm install`, deshalb nur Node-Builtins (Regel `ci-scope-builtins-only`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withoutGitEnv } from "./git-env.ts";
import { buildGraph, type ImportGraph } from "./import-graph.ts";

// Schutz gegen einen hängenden git-Aufruf; gemessen braucht jeder Aufruf Millisekunden.
const GIT_TIMEOUT_MS = 30_000;

/** Dateien des Graphen: Quelltexte unter src/, e2e/, scripts/ und die Konfiguration im Wurzelverzeichnis. */
function isGraphFile(path: string): boolean {
  return (
    /^(src|e2e|scripts)\/[^\0]+\.(ts|tsx|mts|css)$/.test(path) ||
    /^[^/]+\.config\.ts$/.test(path) ||
    path === "playwright.devices.ts"
  );
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    env: withoutGitEnv(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
  });
}

const nulList = (text: string) => text.split("\0").filter((p) => p !== "");

/** Getrackte Dateien, mit `untracked` auch neue, nicht ignorierte (lokal). */
export function listFiles(root: string, { untracked = false } = {}): string[] {
  const tracked = nulList(git(root, ["ls-files", "-z"]));
  return untracked
    ? [...tracked, ...nulList(git(root, ["ls-files", "-z", "--others", "--exclude-standard"]))]
    : tracked;
}

/** Graph über die Dateien aus `isGraphFile`. Eine nicht lesbare Datei (gelöscht im Arbeitsbaum) fehlt im Graphen. */
export function readGraph(root: string, files: readonly string[]): ImportGraph {
  const entries: Array<[string, string]> = [];
  for (const path of files) {
    if (!isGraphFile(path)) continue;
    try {
      entries.push([path, readFileSync(join(root, path), "utf8")]);
    } catch {
      // gelöscht, aber noch im Index: fehlt im Graphen, zählt über den Diff als geändert
    }
  }
  return buildGraph(entries);
}

/** `git merge-base <a> <b>`; wirft, wenn es einen der beiden nicht gibt. */
export function mergeBase(root: string, a: string, b: string): string {
  return git(root, ["merge-base", a, b]).trim();
}

/** Lokal: geändert gegen `base` samt Arbeitsbaum, dazu neue, nicht ignorierte Dateien (Plan 0029, B1). */
export function localChanges(root: string, base: string): string[] {
  const diff = nulList(git(root, ["diff", "-z", "--name-only", "--no-renames", base]));
  const untracked = nulList(git(root, ["ls-files", "-z", "--others", "--exclude-standard"]));
  return [...new Set([...diff, ...untracked])];
}
