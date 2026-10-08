/**
 * Lokale Prüfung nach Risiko (Plan 0027, E1, E2, E9): Die geänderten Pfade bestimmen die Stufe.
 * - Stufe 0 (nur Doku-Positivliste): check-docs, unter 1 s.
 * - Stufe C (alles andere, auch Unbekanntes): check:fast.
 *
 * Aufruf:
 *   node scripts/verify.ts --staged   pre-commit: Pfade aus dem Index (`git diff --cached`), geprüft wird der Arbeitsbaum
 *   node scripts/verify.ts            von Hand: Diff gegen merge-base mit origin/main plus neue Dateien
 * Exit: 0 grün, 1 rot, 3 Zeitlimit. Nur Node-Builtins, Stufe 0 läuft also auch ohne node_modules.
 */
import { execFileSync } from "node:child_process";
import { classify } from "./lib/change-class.ts";
import { runSteps } from "./lib/run-steps.ts";

const TIMEOUT_MS = 150_000;

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function lines(text: string): string[] {
  return text.split("\n").filter((l) => l !== "");
}

/** Geänderte Pfade; `undefined`, wenn sie sich nicht bestimmen lassen (dann gilt Stufe C). */
function changedPaths(staged: boolean): string[] | undefined {
  try {
    if (staged) return lines(git(["diff", "--cached", "--name-only", "--no-renames"]));
    const base = git(["merge-base", "HEAD", "origin/main"]).trim();
    return [
      ...lines(git(["diff", "--name-only", "--no-renames", base])),
      ...lines(git(["ls-files", "--others", "--exclude-standard"])),
    ];
  } catch {
    return undefined;
  }
}

const staged = process.argv.includes("--staged");
const paths = changedPaths(staged);
const { tier, reason } = paths === undefined ? { tier: "C", reason: "Diff nicht bestimmbar" } : classify(paths);

const scope = staged ? "Index" : "Diff zu origin/main";
console.log(
  tier === "0"
    ? `verify: Stufe 0, nur Doku (${paths?.length ?? 0} Dateien, ${scope}) → check-docs`
    : `verify: Stufe C (${reason}, ${scope}) → check:fast`,
);

const [result] = await runSteps(
  [
    {
      name: tier === "0" ? "check-docs" : "check:fast",
      cmd: ["node", `scripts/${tier === "0" ? "check-docs" : "check-fast"}.ts`],
    },
  ],
  { timeoutMs: TIMEOUT_MS },
);
if (result === undefined) process.exit(1);
process.stdout.write(result.output.endsWith("\n") ? result.output : `${result.output}\n`);
process.exit(result.ok ? 0 : result.timedOut ? 3 : 1);
