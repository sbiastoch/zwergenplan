import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Jeder Job, der Browser installiert, läuft fest auf `ubuntu-24.04` (Plan 0052): Auf 26.04 fehlen die Systempakete,
 * die Installation riss dort wiederholt. Ein neuer Browser-Job mit `ubuntu-latest` würde wieder sporadisch rot.
 */
const dir = new URL("../../.github/workflows/", import.meta.url);
const jobs = readdirSync(dir)
  .filter((f) => f.endsWith(".yml"))
  .flatMap((file) => {
    const wf: { jobs: Record<string, { "runs-on"?: unknown; steps?: Array<{ run?: string }> }> } = parse(
      readFileSync(new URL(file, dir), "utf8"),
    );
    return Object.entries(wf.jobs).map(([id, job]) => ({ id: `${file}:${id}`, job }));
  })
  .filter(({ job }) => job.steps?.some((s) => s.run?.includes("install-browsers.sh")));

describe("Jobs mit Browsern (Plan 0052)", () => {
  it("findet alle Browser-Jobs (Schutz gegen einen stummen Test)", () => {
    expect(jobs.length).toBeGreaterThanOrEqual(5);
  });

  it.each(jobs.map(({ id, job }) => [id, job["runs-on"]]))("%s läuft auf ubuntu-24.04", (_id, runsOn) => {
    expect(runsOn).toBe("ubuntu-24.04");
  });
});
