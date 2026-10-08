/**
 * Lokale Prüfung nach Risiko (Plan 0027, E1, E2, E5, E9): Die geänderten Pfade bestimmen die Stufe.
 * - Stufe 0 (nur Doku-Positivliste): check-docs, unter 1 s.
 * - Stufe C (alles andere, auch Unbekanntes): check:fast.
 *
 * Aufruf:
 *   node scripts/verify.ts --stop     Stop-Gate: frischer Stempel für den Inhalt → keine Prüfung; sonst Diff zum
 *                                     letzten grünen Baum dieses Worktrees, ohne Basis Stufe C für den ganzen Baum
 *   node scripts/verify.ts --staged   pre-commit: Pfade aus dem Index (`git diff --cached`), geprüft wird der Arbeitsbaum
 *   node scripts/verify.ts            von Hand: Diff gegen merge-base mit origin/main plus neue Dateien
 * Exit: 0 grün, 1 rot, 3 Zeitlimit. Nur Node-Builtins.
 *
 * Stempel (E5.2) schreibt nur dieses Skript, unter ~/.cache/zwergenplan/green/<tree-id>, und nur, wenn der Baum vor
 * und nach dem Lauf gleich war. Ein Lauf der Stufe C stempelt in jedem Modus, denn check:fast prüft den ganzen
 * Arbeitsbaum. Ein Lauf der Stufe 0 stempelt nur mit --stop: Nur dort ist er relativ zu einem grünen Baum.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, type Tier } from "./lib/change-class.ts";
import { runSteps } from "./lib/run-steps.ts";
import { decide, nextStamp, type Stamp } from "./lib/stop-decision.ts";
import { readStamp, treeExists, treeId, writeJsonAtomic } from "./lib/tree-id.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Nur für Kanarienvögel und Tests überschreibbar (Plan 0027, K7)
const TIMEOUT_MS = Number(process.env["ZP_VERIFY_TIMEOUT_MS"] ?? 150_000);
const STAMP_DIR = join(process.env["ZP_CACHE_DIR"] ?? join(homedir(), ".cache", "zwergenplan"), "green");
const LAST_GREEN = join(ROOT, ".claude", "state", "last-green.json");
// Die Prüfschritte nutzen Pfade relativ zur Projektwurzel.
process.chdir(ROOT);

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function lines(text: string): string[] {
  return text.split("\n").filter((l) => l !== "");
}

function lastGreenTree(): string | undefined {
  try {
    const v: unknown = JSON.parse(readFileSync(LAST_GREEN, "utf8"));
    return typeof v === "object" && v !== null && "tree" in v && typeof v.tree === "string" ? v.tree : undefined;
  } catch {
    return undefined;
  }
}

const mode = process.argv.includes("--stop") ? "stop" : process.argv.includes("--staged") ? "staged" : "manual";
const now = Date.now();
const treeBefore = treeId(ROOT);

let paths: string[] | undefined;
let baseStamp: Stamp | undefined;
let scope: string;

if (mode === "stop") {
  const stamp = readStamp(STAMP_DIR, treeBefore);
  const baseTree = lastGreenTree();
  const base =
    baseTree === undefined
      ? undefined
      : { tree: baseTree, stamp: readStamp(STAMP_DIR, baseTree), exists: treeExists(ROOT, baseTree) };
  const decision = decide({ now, stamp, base });
  if (decision.action === "pass") {
    const minutes = Math.round((now - (stamp?.cAt ?? now)) / 60_000);
    console.log(
      `verify: Inhalt ${treeBefore.slice(0, 8)} ist grün gestempelt (Stufe C vor ${minutes} min) → keine Prüfung`,
    );
    // Der gestempelte Baum wird Basis dieses Worktrees, etwa nach einem frischen Checkout auf grünem Inhalt.
    if (baseTree !== treeBefore) writeJsonAtomic(LAST_GREEN, { tree: treeBefore });
    process.exit(0);
  }
  if (decision.base !== undefined) {
    paths = lines(git(["diff", "--name-only", "--no-renames", decision.base, treeBefore]));
    baseStamp = base?.stamp;
    scope = `seit grünem Stand ${decision.base.slice(0, 8)}`;
  } else {
    scope = "kein frischer grüner Stand";
  }
} else {
  try {
    paths =
      mode === "staged"
        ? lines(git(["diff", "--cached", "--name-only", "--no-renames"]))
        : [
            ...lines(git(["diff", "--name-only", "--no-renames", git(["merge-base", "HEAD", "origin/main"]).trim()])),
            ...lines(git(["ls-files", "--others", "--exclude-standard"])),
          ];
  } catch {
    paths = undefined;
  }
  scope = mode === "staged" ? "Index" : "Diff zu origin/main";
}

const { tier, reason }: { tier: Tier; reason?: string } =
  paths === undefined ? { tier: "C", reason: "ganzer Baum" } : classify(paths);
console.log(
  tier === "0"
    ? `verify: Stufe 0, nur Doku (${paths?.length ?? 0} Dateien, ${scope}) → check-docs`
    : `verify: Stufe C (${reason}, ${scope}) → check:fast`,
);

const [result] = await runSteps(
  [
    {
      name: tier === "0" ? "check-docs" : "check:fast",
      cmd: ["node", join(ROOT, "scripts", tier === "0" ? "check-docs.ts" : "check-fast.ts")],
    },
  ],
  { timeoutMs: TIMEOUT_MS },
);
if (result === undefined) process.exit(1);
process.stdout.write(result.output.endsWith("\n") ? result.output : `${result.output}\n`);
if (!result.ok) process.exit(result.timedOut ? 3 : 1);

// Stempeln (E5.2): nur bei gleichem Baum vor und nach dem Lauf, sonst prüft das nächste Gate erneut (Review M5).
const stamp = tier === "C" || mode === "stop" ? nextStamp(tier, now, baseStamp) : undefined;
if (stamp !== undefined) {
  const treeAfter = treeId(ROOT);
  if (treeAfter === treeBefore) {
    writeJsonAtomic(join(STAMP_DIR, treeBefore), stamp);
    writeJsonAtomic(LAST_GREEN, { tree: treeBefore });
  } else {
    console.log("verify: Baum hat sich während der Prüfung geändert → kein Stempel");
  }
}
process.exit(0);
