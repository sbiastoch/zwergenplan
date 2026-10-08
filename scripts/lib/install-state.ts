/**
 * Passt node_modules zum Lockfile? pnpm legt bei jeder Installation eine Kopie des Lockfiles nach
 * node_modules/.pnpm/lock.yaml. Weicht sie ab (etwa ein veralteter Worktree nach einem Lockfile-Update),
 * scheitern Typen und Tests mit „Cannot find module …“. Dann kommt statt dieser Folgefehler eine Meldung
 * mit Abhilfe (Plan 0027, E6). Nur Node-Builtins.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const STALE_MESSAGE =
  "node_modules passt nicht zu pnpm-lock.yaml. Abhilfe: pnpm install --frozen-lockfile. " +
  "Bleibt die Meldung nach der Installation: pnpm-Version mit packageManager in package.json abgleichen (corepack) " +
  "(Plan 0027, E6)";

export const MISSING_MESSAGE =
  "node_modules fehlt oder ist nicht mit pnpm (isolated) installiert: node_modules/.pnpm/lock.yaml oder " +
  "pnpm-lock.yaml fehlt. Abhilfe: pnpm install --frozen-lockfile (Plan 0027, E6)";

function read(path: string): Buffer | undefined {
  try {
    return readFileSync(path);
  } catch {
    return undefined;
  }
}

/** Meldung, wenn die Installation in `root` nicht zum Lockfile passt, sonst `undefined`. */
export function staleInstall(root: string): string | undefined {
  const lock = read(join(root, "pnpm-lock.yaml"));
  const installed = read(join(root, "node_modules", ".pnpm", "lock.yaml"));
  if (lock === undefined || installed === undefined) return MISSING_MESSAGE;
  return lock.equals(installed) ? undefined : STALE_MESSAGE;
}
