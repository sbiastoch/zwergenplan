/**
 * Wächter für scripts/heavy.ts (Plan 0027, E7; Arch-Review e6, M2). Läuft in einer eigenen Prozessgruppe und
 * überlebt deshalb ein SIGKILL an die Gruppe von heavy.ts, etwa wenn das Bash-Tool eines Agents einen
 * Hintergrundlauf beendet.
 *
 * heavy.ts hält eine Pipe zu seinem stdin offen. Endet heavy.ts, auf welche Weise auch immer, schließt der Kernel
 * die Pipe. Dann beendet der Wächter die Gruppe des Laufs in Stufen (SIGINT, SIGTERM, SIGKILL) und endet selbst.
 * Damit wird auch die Sperre frei. Ist die Gruppe schon leer (normales Ende), endet er sofort. Node öffnet die Pipe
 * mit O_CLOEXEC, also erbt flock sie nicht (Arch-Review ef36c19, m1).
 *
 *   node scripts/heavy-watchdog.ts <pgid des Laufs> [<Datei für die eigene PID>]
 */
import { rmSync, writeFileSync } from "node:fs";
import { graceMs, stopGroup } from "./lib/process-group.ts";

const pgid = Number(process.argv[2]);
const pidFile = process.argv[3];
if (!(pgid > 0)) process.exit(2);
if (pidFile) writeFileSync(pidFile, String(process.pid));

const INT_GRACE_MS = graceMs(process.env["ZP_INT_GRACE_MS"], 7_000);
const TERM_GRACE_MS = graceMs(process.env["ZP_TERM_GRACE_MS"], 3_000);

let done = false;
async function onParentGone(): Promise<void> {
  if (done) return;
  done = true;
  await stopGroup(pgid, INT_GRACE_MS, TERM_GRACE_MS);
  if (pidFile) rmSync(pidFile, { force: true });
  process.exit(0);
}

process.stdin.on("close", () => void onParentGone());
process.stdin.on("end", () => void onParentGone());
process.stdin.on("error", () => void onParentGone());
process.stdin.resume();
