/**
 * Freie Ports für lokale E2E-Läufe (Plan 0027, E4). playwright.config.ts nutzt PW_PORT für den Fixture-Server und
 * PW_PORT + 1 für den Server mit echten Daten, also braucht es zwei aufeinanderfolgende freie Ports. Kein fester
 * Port mehr von Hand: Sonst übernähme `reuseExistingServer` still den Server eines anderen Worktrees.
 * Nur Node-Builtins.
 */
import { createServer } from "node:net";

/** Ist der Port auf localhost frei? Geprüft wird per kurzem `listen`, so wie `vite preview --strictPort` ihn braucht. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

const randomCandidate = () => 20_000 + Math.floor(Math.random() * 39_000);

/** Erster Port p eines freien Paars (p, p + 1). `next` liefert Kandidaten (Standard: zufällig 20000–58999). */
export async function findFreePortPair(next: () => number = randomCandidate, attempts = 50): Promise<number> {
  for (let i = 0; i < attempts; i++) {
    const p = next();
    if ((await isPortFree(p)) && (await isPortFree(p + 1))) return p;
  }
  throw new Error(`Kein freies Portpaar nach ${attempts} Versuchen`);
}
