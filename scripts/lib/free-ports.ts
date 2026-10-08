/**
 * Freie Ports für lokale E2E-Läufe (Plan 0027, E4). playwright.config.ts nutzt PW_PORT für den Fixture-Server und
 * PW_PORT + 1 für den Server mit echten Daten, also braucht es zwei aufeinanderfolgende freie Ports. Kein fester
 * Port mehr von Hand: Sonst übernähme `reuseExistingServer` still den Server eines anderen Worktrees.
 * Nur Node-Builtins.
 */
import { createServer } from "node:net";

function freeOn(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    // Ohne IPv6 (EADDRNOTAVAIL/EAFNOSUPPORT) belegt dort auch niemand den Port.
    server.once("error", (e: NodeJS.ErrnoException) =>
      resolve(e.code === "EADDRNOTAVAIL" || e.code === "EAFNOSUPPORT"),
    );
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/**
 * Ist der Port auf localhost frei, für IPv4 und IPv6? `localhost` kann je nach System auf ::1 auflösen, und
 * `vite preview --strictPort` braucht den Port dort (Arch-Review Etappe 4, m3).
 */
export async function isPortFree(port: number): Promise<boolean> {
  return (await freeOn(port, "127.0.0.1")) && (await freeOn(port, "::1"));
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
