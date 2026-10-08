/**
 * Ist die aktuelle Änderung eine Kleinänderung (Plan 0029, A1)? Ein Hinweis, kein Gate: Exit 0 in beiden Fällen.
 *   node scripts/change-size.ts [--base <ref>]   Standard: merge-base HEAD origin/main, mit Arbeitsbaum und neuen Dateien
 * Die Regeln stehen in scripts/lib/change-size.ts. git läuft hier nur lesend im eigenen Projekt.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_LINES, smallChange } from "./lib/change-size.ts";
import { withoutGitEnv } from "./lib/git-env.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, env: withoutGitEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const lines = (text: string) => text.split("\n").filter((l) => l !== "");

const baseArg = process.argv.indexOf("--base");
const base = baseArg >= 0 ? (process.argv[baseArg + 1] ?? "") : git(["merge-base", "HEAD", "origin/main"]).trim();

const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
const addedLines = lines(git(["diff", "-U0", "--no-renames", base]))
  .filter((l) => l.startsWith("+") && !l.startsWith("+++ "))
  .map((l) => l.slice(1));
for (const path of untracked) {
  try {
    addedLines.push(...readFileSync(join(ROOT, path), "utf8").split("\n"));
  } catch {
    // nicht lesbar: zählt trotzdem als neue Datei
  }
}

const result = smallChange({
  numstat: lines(git(["diff", "--numstat", "--no-renames", base])),
  newFiles: [...lines(git(["diff", "--name-only", "--no-renames", "--diff-filter=A", base])), ...untracked],
  addedLines,
});
console.log(
  result.small
    ? `Kleinänderung: ja (≤ ${MAX_LINES} Zeilen, gegen ${base.slice(0, 8)}) → kein Plan-Dokument nötig, Plan in den Commit-Text`
    : `Kleinänderung: nein (${result.reason}) → Plan in docs/plans/ und /plan-review (CLAUDE.md)`,
);
