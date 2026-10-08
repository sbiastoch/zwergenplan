import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findFreePortPair, isPortFree } from "./free-ports.ts";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

function occupy(port: number, host = "127.0.0.1"): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    servers.push(s);
    s.once("error", reject);
    s.listen(port, host, () => resolve());
  });
}

describe("free-ports (Plan 0027, E4)", () => {
  it("findet zwei aufeinanderfolgende freie Ports, wie playwright.config.ts sie braucht (PW_PORT und +1)", async () => {
    const p = await findFreePortPair();
    expect(p).toBeGreaterThanOrEqual(20_000);
    expect(p).toBeLessThan(60_000);
    expect(await isPortFree(p)).toBe(true);
    expect(await isPortFree(p + 1)).toBe(true);
  });

  it("erkennt einen belegten Port", async () => {
    const p = await findFreePortPair();
    await occupy(p + 1);
    expect(await isPortFree(p + 1)).toBe(false);
  });

  it("erkennt einen nur auf IPv6 (::1) belegten Port, wenn es IPv6 gibt", async () => {
    const p = await findFreePortPair();
    try {
      await occupy(p, "::1");
    } catch {
      return; // kein IPv6 auf dieser Maschine
    }
    expect(await isPortFree(p)).toBe(false);
  });

  it("überspringt ein Paar, dessen zweiter Port belegt ist", async () => {
    const p = await findFreePortPair();
    await occupy(p + 1);
    // eine Folge von Kandidaten, deren erster belegt ist: dann muss der nächste kommen
    const candidates = [p, p + 10];
    const next = await findFreePortPair(() => candidates.shift() ?? p + 20);
    expect(next).toBe(p + 10);
  });
});
