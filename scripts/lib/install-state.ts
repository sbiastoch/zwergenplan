/**
 * Passt node_modules zum Lockfile? pnpm legt bei jeder Installation eine Kopie des Lockfiles nach
 * node_modules/.pnpm/lock.yaml. Weicht sie ab (etwa ein veralteter Worktree nach einem Lockfile-Update),
 * scheitern Typen und Tests mit „Cannot find module …“. Dann kommt statt dieser Folgefehler eine Meldung
 * mit Abhilfe (Plan 0027, E6). Nur Node-Builtins.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const STALE_MESSAGE =
  "node_modules passt nicht zu pnpm-lock.yaml. Abhilfe: pnpm install --frozen-lockfile (Plan 0027, E6)";

/** Meldung, wenn die Installation in `root` nicht zum Lockfile passt, sonst `undefined`. */
export function staleInstall(root: string): string | undefined {
  try {
    const lock = readFileSync(join(root, "pnpm-lock.yaml"));
    const installed = readFileSync(join(root, "node_modules", ".pnpm", "lock.yaml"));
    return lock.equals(installed) ? undefined : STALE_MESSAGE;
  } catch {
    return STALE_MESSAGE;
  }
}
