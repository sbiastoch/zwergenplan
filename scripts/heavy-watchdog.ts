/**
 * Wächter für scripts/heavy.ts (Plan 0027, E7; Arch-Review e6, M2). Läuft in einer eigenen Prozessgruppe und
 * überlebt deshalb ein SIGKILL an die Gruppe von heavy.ts, etwa wenn das Bash-Tool eines Agents einen
 * Hintergrundlauf beendet. Ist heavy.ts weg, die Gruppe des Laufs aber noch da, beendet er sie in Stufen
 * (SIGINT, SIGTERM, SIGKILL). Damit wird auch die Sperre frei. Ist die Gruppe leer, endet er von selbst.
 *
 *   node scripts/heavy-watchdog.ts <pid von heavy.ts> <pgid des Laufs>
 */
import { alive, graceMs, stopGroup } from "./lib/process-group.ts";

const heavyPid = Number(process.argv[2]);
const pgid = Number(process.argv[3]);
if (!(heavyPid > 0 && pgid > 0)) process.exit(2);

const INT_GRACE_MS = graceMs(process.env["ZP_INT_GRACE_MS"], 7_000);
const TERM_GRACE_MS = graceMs(process.env["ZP_TERM_GRACE_MS"], 3_000);

for (;;) {
  if (!alive(-pgid)) process.exit(0);
  if (!alive(heavyPid)) {
    await stopGroup(pgid, INT_GRACE_MS, TERM_GRACE_MS);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 250));
}
