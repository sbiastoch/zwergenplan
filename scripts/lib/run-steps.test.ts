import { describe, expect, it } from "vitest";
import { runSteps } from "./run-steps.ts";

/** Lebt noch ein Prozess der Gruppe? `kill(-pgid, 0)` wirft ESRCH, wenn keiner mehr da ist. */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return cond();
}

describe("runSteps (Plan 0027, E5.4)", () => {
  it("meldet Erfolg, Fehlschlag und Ausgabe je Schritt", async () => {
    const results = await runSteps(
      [
        { name: "gut", cmd: ["sh", "-c", "echo hallo"] },
        { name: "schlecht", cmd: ["sh", "-c", "echo kaputt >&2; exit 3"] },
      ],
      { timeoutMs: 10_000 },
    );
    expect(results.map((r) => [r.name, r.ok, r.timedOut, r.output.trim()])).toEqual([
      ["gut", true, false, "hallo"],
      ["schlecht", false, false, "kaputt"],
    ]);
  });

  it("ein unbekanntes Kommando ist rot, nicht ein Absturz", async () => {
    const [r] = await runSteps([{ name: "fehlt", cmd: ["zp-gibt-es-nicht"] }], { timeoutMs: 5_000 });
    expect(r?.ok).toBe(false);
    expect(r?.output).toContain("zp-gibt-es-nicht");
  });

  it("beendet bei Zeitablauf die ganze Prozessgruppe samt Enkeln und meldet „Zeitlimit“", async () => {
    const started = Date.now();
    const [r] = await runSteps([{ name: "hängt", cmd: ["sh", "-c", "sleep 999 & sleep 999; wait"] }], {
      timeoutMs: 1_000,
    });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(r?.ok).toBe(false);
    expect(r?.timedOut).toBe(true);
    expect(r?.output).toContain("Zeitlimit");
    expect(await until(() => !groupAlive(r?.pid ?? 0), 2_000)).toBe(true);
  });
});
